/* LIMBUS BUILD TERMINAL — gacha-proof.js
   抽出の証明画像（信用証明）と、画像そのものの改ざん検知。

   なぜ PNG チャンクか: 画像は誰でも再エンコードできる。ピクセルを描き
   直して偽の一覧を載せても、埋め込みデータ（署名付きバッチ本体）との
   突き合わせで食い違いが露見する。埋め込みデータを書き換えても、
   署名は ECDSA-P256（gacha-identity）なので、秘密鍵なしに有効な署名は
   作れない。よって「見た目・埋め込み・署名」の3点を照合すれば改ざんは
   立証できる。

   埋め込み形式: iTXt（UTF-8）キーワード "lbt-gacha-proof"。
   テキストは { v, app, url, exportedAt, batch } のコンパクト JSON。 */
(function () {
  "use strict";

  var CHUNK_KEYWORD = "lbt-gacha-proof";
  var PAYLOAD_VERSION = 1;
  var APP_NAME = "LIMBUS BUILD TERMINAL";
  var FILE_PREFIX = "lbt-proof";

  var STATE_LABELS = { verified: "検証済み", mismatch: "不一致（改ざんの疑い）", unverified: "未検証" };

  function fail(message) { throw new Error("gacha-proof: " + message); }
  function requireUtf8() {
    if (typeof TextEncoder === "undefined" || typeof TextDecoder === "undefined") {
      fail("TextEncoder / TextDecoder が利用できない");
    }
  }
  function utf8Bytes(text) {
    requireUtf8();
    return new TextEncoder().encode(String(text));
  }
  function utf8Text(bytes) {
    requireUtf8();
    return new TextDecoder().decode(bytes);
  }

  /* ---- CRC32（PNG の各チャンクが要求する） ------------------------------ */
  var CRC_TABLE = (function () {
    var table = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(bytes) {
    var c = 0xffffffff;
    for (var i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  /* ---- PNG チャンク ----------------------------------------------------- */
  var PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

  function isPng(bytes) {
    if (!bytes || bytes.length < 8) return false;
    for (var i = 0; i < 8; i++) if (bytes[i] !== PNG_SIGNATURE[i]) return false;
    return true;
  }
  function readU32(bytes, offset) {
    return (((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0);
  }
  function writeU32(bytes, offset, value) {
    bytes[offset] = (value >>> 24) & 255;
    bytes[offset + 1] = (value >>> 16) & 255;
    bytes[offset + 2] = (value >>> 8) & 255;
    bytes[offset + 3] = value & 255;
  }
  function chunkType(bytes, offset) {
    return String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
  }
  /* 1チャンク: [長さ4][種別4][データ][CRC4]。CRC は種別+データを覆う。 */
  function buildChunk(type, data) {
    var out = new Uint8Array(12 + data.length);
    writeU32(out, 0, data.length);
    for (var i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    var crcInput = new Uint8Array(4 + data.length);
    crcInput.set(out.subarray(4, 8 + data.length));
    writeU32(out, 8 + data.length, crc32(crcInput));
    return out;
  }
  /* iTXt: keyword\0 flag(1B) method(1B) language\0 translated\0 text(UTF-8) */
  function buildItxtChunk(keyword, text) {
    var keywordBytes = utf8Bytes(keyword);
    var textBytes = utf8Bytes(text);
    var data = new Uint8Array(keywordBytes.length + 5 + textBytes.length);
    data.set(keywordBytes, 0);
    var o = keywordBytes.length;
    data[o++] = 0;
    data[o++] = 0;
    data[o++] = 0;
    data[o++] = 0;
    data[o++] = 0;
    data.set(textBytes, o);
    return buildChunk("iTXt", data);
  }

  /* 埋め込み: IHDR の直後へ差し込む。デコーダはどの位置の iTXt も読めるが、
     先頭に置くと抽出が画像デコードに依存しない。 */
  function embedProof(pngBytes, text) {
    if (!isPng(pngBytes)) fail("PNG ではないため埋め込めません");
    var ihdrLength = readU32(pngBytes, 8);
    var insertAt = 8 + 12 + ihdrLength;
    if (chunkType(pngBytes, 12) !== "IHDR") fail("IHDR が見つかりません");
    var chunk = buildItxtChunk(CHUNK_KEYWORD, text);
    var out = new Uint8Array(pngBytes.length + chunk.length);
    out.set(pngBytes.subarray(0, insertAt), 0);
    out.set(chunk, insertAt);
    out.set(pngBytes.subarray(insertAt), insertAt + chunk.length);
    return out;
  }

  function extractProof(pngBytes) {
    if (!isPng(pngBytes)) return { ok: false, reason: "PNG ではありません" };
    var offset = 8;
    while (offset + 12 <= pngBytes.length) {
      var length = readU32(pngBytes, offset);
      if (length > pngBytes.length) return { ok: false, reason: "PNG が壊れています（長さが不正）" };
      var type = chunkType(pngBytes, offset + 4);
      var dataStart = offset + 8;
      var dataEnd = dataStart + length;
      if (dataEnd + 4 > pngBytes.length) return { ok: false, reason: "PNG が壊れています（切り詰め）" };
      var expected = readU32(pngBytes, dataEnd);
      var crcInput = pngBytes.subarray(offset + 4, dataEnd);
      if (crc32(crcInput) !== expected) return { ok: false, reason: "PNG が壊れています（CRC 不一致）" };
      if (type === "iTXt") {
        var parsed = parseItxt(pngBytes.subarray(dataStart, dataEnd));
        if (parsed && parsed.keyword === CHUNK_KEYWORD) return { ok: true, text: parsed.text };
      }
      if (type === "IEND") break;
      offset = dataEnd + 4;
    }
    return { ok: false, reason: "証明データが埋め込まれていません" };
  }

  function parseItxt(data) {
    var o = 0;
    function readUntilZero() {
      var start = o;
      while (o < data.length && data[o] !== 0) o++;
      var value = data.subarray(start, o);
      o++;
      return value;
    }
    var keyword = utf8Text(readUntilZero());
    if (o + 2 > data.length) return null;
    var flag = data[o++];
    var method = data[o++];
    readUntilZero();
    readUntilZero();
    if (flag !== 0 || method !== 0) return null;
    return { keyword: keyword, text: utf8Text(data.subarray(o)) };
  }

  /* ---- ペイロード -------------------------------------------------------- */
  function appUrl() {
    try {
      if (typeof location === "undefined") return "";
      return String(location.href || "").split("?")[0].split("#")[0];
    } catch (e) {
      return "";
    }
  }

  function buildPayload(batch) {
    return JSON.stringify({
      v: PAYLOAD_VERSION,
      app: APP_NAME,
      url: appUrl(),
      exportedAt: new Date().toISOString(),
      batch: batch
    });
  }

  function fileName(batch) {
    var hash = batch && batch.batchHash ? String(batch.batchHash) : "batch";
    return FILE_PREFIX + "-" + hash.slice(0, 8) + ".png";
  }

  function fingerprint(value) {
    var s = value == null ? "" : String(value);
    if (!s) return "—";
    if (s.length <= 20) return s;
    return s.slice(0, 8) + "…" + s.slice(-8);
  }

  /* ---- 検証 --------------------------------------------------------------
     入力は PNG のバイト列。埋め込みデータを取り出し、鎖・署名・ビーコンを
     統合判定する（判定そのものは gacha-identity の assessBatch）。 */
  async function verifyPng(pngBytes, options) {
    var opts = options || {};
    var extracted = extractProof(pngBytes);
    if (!extracted.ok) return { state: "unverified", reasons: [extracted.reason], batch: null };
    var parsed;
    try {
      parsed = JSON.parse(extracted.text);
    } catch (e) {
      return { state: "unverified", reasons: ["埋め込みデータを読めません"], batch: null };
    }
    if (!parsed || parsed.v !== PAYLOAD_VERSION || !parsed.batch) {
      return { state: "unverified", reasons: ["埋め込みデータの形式が違います"], batch: null };
    }
    var identity = opts.identity || (typeof window !== "undefined" ? window.LBT_gachaIdentity : null);
    var gacha = opts.gacha || (typeof window !== "undefined" ? window.LBT_gacha : null);
    if (!identity || typeof identity.assessBatch !== "function") {
      return { state: "unverified", reasons: ["署名モジュールが読み込まれていません"], batch: parsed.batch };
    }
    var assessment = await identity.assessBatch(parsed.batch, {
      gacha: gacha,
      timeoutMs: opts.timeoutMs || 5000,
      fetchImpl: opts.fetchImpl
    });
    return {
      state: assessment.state,
      reasons: assessment.reasons || [],
      batch: parsed.batch,
      url: parsed.url || "",
      exportedAt: parsed.exportedAt || ""
    };
  }

  /* ---- カード描画 -------------------------------------------------------- */
  var FONT_STACK = "'Segoe UI', 'Hiragino Kaku Gothic ProN', 'Noto Sans JP', Meiryo, sans-serif";
  var MONO_STACK = "Consolas, 'Courier New', monospace";
  var COLORS = {
    bg: "#14110c", panel: "#1d1811", border: "#2c2418",
    gold: "#c8a84b", text: "#efe6cf", muted: "#a3916b", faint: "#6f6350",
    ok: "#6fbf73", bad: "#d9534f", warn: "#c8a84b"
  };
  var STATE_COLORS = { verified: COLORS.ok, mismatch: COLORS.bad, unverified: COLORS.warn };

  function fitText(ctx, text, maxWidth) {
    var s = String(text == null ? "" : text);
    if (ctx.measureText(s).width <= maxWidth) return s;
    while (s.length > 1 && ctx.measureText(s + "…").width > maxWidth) s = s.slice(0, -1);
    return s + "…";
  }

  function roundRect(ctx, x, y, w, hgt, r) {
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") { ctx.roundRect(x, y, w, hgt, r); return; }
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + hgt, r);
    ctx.arcTo(x + w, y + hgt, x, y + hgt, r);
    ctx.arcTo(x, y + hgt, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function recordLabel(record) {
    var item = (record && record.item) || {};
    var kind = record && record.kind === "ego" ? "E.G.O" : record && record.kind === "themePack" ? "パック" : "人格";
    var no = item.no == null ? "" : " No." + item.no;
    var rank = item.rank ? " " + item.rank : "";
    return { name: (item.name || record.item || "（不明）") + no, meta: kind + rank };
  }
  function recordPaid(record) {
    var cost = (record && record.cost) || {};
    var lp = Number(cost.lp) || 0;
    var shards = Number(cost.shards) || 0;
    if (lp || shards) return [lp ? "LP " + lp.toLocaleString("ja-JP") : null, shards ? "欠片 " + shards.toLocaleString("ja-JP") : null].filter(Boolean).join(" / ");
    if (record && record.duplicate) return "重複" + (Number(record.grantedShards) ? " → 欠片 +" + record.grantedShards : "");
    return "—";
  }

  function drawProofCard(canvas, options) {
    var opts = options || {};
    var batch = opts.batch || {};
    var assessment = opts.assessment || { state: "unverified", reasons: [] };
    var chain = opts.chain || null;
    var records = Array.isArray(batch.records) ? batch.records : [];
    var MAX_ROWS = 40;
    var shown = records.slice(0, MAX_ROWS);
    var hiddenCount = records.length - shown.length;

    var scale = 2, W = 900, pad = 48;
    var stateLabel = STATE_LABELS[assessment.state] || STATE_LABELS.unverified;
    var stateColor = STATE_COLORS[assessment.state] || COLORS.muted;
    var reasons = Array.isArray(assessment.reasons) ? assessment.reasons : [];
    var trustRows = reasons.length ? 6 : 5;
    var titleH = 112, metaH = 78, headingH = 46;
    var rowsH = shown.length * 40 + (hiddenCount > 0 ? 28 : 0);
    var trustH = 20 + trustRows * 30 + (reasons.length ? 12 : 0);
    var footH = 92;
    var H = pad + titleH + metaH + headingH + rowsH + 20 + trustH + 20 + footH + pad;

    canvas.width = W * scale;
    canvas.height = H * scale;
    var ctx = canvas.getContext("2d");
    ctx.scale(scale, scale);

    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, W, H);

    var x = pad, y = pad;
    var contentW = W - pad * 2;

    ctx.textBaseline = "top";
    ctx.fillStyle = COLORS.gold;
    ctx.font = "bold 40px " + FONT_STACK;
    ctx.fillText("抽出証明", x, y);
    ctx.font = "16px " + FONT_STACK;
    ctx.fillStyle = COLORS.muted;
    ctx.textAlign = "right";
    ctx.fillText(APP_NAME, W - pad, y + 10);
    ctx.textAlign = "left";
    y += 62;

    ctx.fillStyle = COLORS.text;
    ctx.font = "18px " + FONT_STACK;
    var kindLabel = (typeof DRAW_KIND_LABEL !== "undefined" && DRAW_KIND_LABEL[batch.kind]) || batch.kind || "抽出";
    ctx.fillText(kindLabel + " / " + records.length + "件", x, y);
    y += 26;
    ctx.fillStyle = COLORS.muted;
    ctx.font = "15px " + FONT_STACK;
    var generatedAt = opts.generatedAt || Date.now();
    var dateText = new Date(generatedAt).toLocaleString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    ctx.fillText("生成 " + dateText + "　錨(commit) " + fingerprint(batch.commit), x, y);
    y += 22;
    ctx.fillText("URL " + (opts.url || appUrl()), x, y);
    y += 30;

    ctx.fillStyle = COLORS.border;
    ctx.fillRect(x, y, contentW, 1);
    y += 24;

    ctx.fillStyle = COLORS.gold;
    ctx.font = "bold 20px " + FONT_STACK;
    ctx.fillText("抽選結果", x, y);
    y += headingH - 8;

    shown.forEach(function (record, i) {
      var label = recordLabel(record);
      var rowY = y + 8;
      ctx.fillStyle = COLORS.faint;
      ctx.font = "15px " + MONO_STACK;
      ctx.fillText(String(i + 1).padStart(2, "0"), x, rowY);
      ctx.fillStyle = COLORS.text;
      ctx.font = "17px " + FONT_STACK;
      ctx.fillText(fitText(ctx, label.name, 440), x + 44, rowY - 1);
      ctx.fillStyle = COLORS.muted;
      ctx.font = "14px " + FONT_STACK;
      ctx.fillText(label.meta, x + 500, rowY + 1);
      ctx.textAlign = "right";
      ctx.fillText(recordPaid(record), W - pad, rowY + 1);
      ctx.textAlign = "left";
      y += 40;
    });
    if (hiddenCount > 0) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = "14px " + FONT_STACK;
      ctx.fillText("ほか " + hiddenCount + " 件（埋め込みデータには全件収録）", x, y + 6);
      y += 28;
    }
    y += 20;

    /* 信頼要素のまとめ。目視と機械照合の両方で読めるように、値は指紋表示。 */
    roundRect(ctx, x, y, contentW, trustH, 10);
    ctx.fillStyle = COLORS.panel;
    ctx.fill();
    ctx.strokeStyle = COLORS.border;
    ctx.stroke();
    var ty = y + 20;
    var labelX = x + 20;
    var valueX = x + 200;
    function trustRow(label, value, color, mono) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = "14px " + FONT_STACK;
      ctx.fillText(label, labelX, ty);
      ctx.fillStyle = color || COLORS.text;
      ctx.font = (mono ? "15px " + MONO_STACK : "15px " + FONT_STACK);
      ctx.fillText(fitText(ctx, value, W - pad - 20 - valueX), valueX, ty);
      ty += 30;
    }
    trustRow("検証状態", stateLabel, stateColor);
    trustRow("ハッシュ鎖", chain ? (chain.ok ? records.length + "件 一致" : "不一致（要確認）") : records.length + "件", chain && !chain.ok ? COLORS.bad : COLORS.text);
    trustRow("バッチ指紋", fingerprint(batch.batchHash), COLORS.text, true);
    trustRow("署名者", batch.signer && batch.signer.keyId ? batch.signer.keyId : "なし（署名以前の記録）", batch.signer ? COLORS.text : COLORS.muted, !!batch.signer);
    trustRow("外部錨(drand)", batch.beacon && batch.beacon.round != null ? "round " + batch.beacon.round : "なし", batch.beacon ? COLORS.text : COLORS.muted);
    if (reasons.length) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = "13px " + FONT_STACK;
      ctx.fillText(fitText(ctx, reasons.slice(0, 2).join(" ／ "), contentW - 40), labelX, ty);
    }
    y += trustH;

    ctx.fillStyle = COLORS.faint;
    ctx.font = "14px " + FONT_STACK;
    var footLines = [
      "この画像には検証用データ（署名付き記録）が埋め込まれています。",
      "検証方法: " + APP_NAME + " の「記録 → 抽出リスト → 証明画像を検証」でこの画像を読み込むと、",
      "埋め込みデータの一覧が表示されます。画像の表示と一致するか照合してください。"
    ];
    footLines.forEach(function (line) { ctx.fillText(line, x, y); y += 22; });

    return { width: W, height: H };
  }

  function canvasToBlob(canvas) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        if (blob) resolve(blob);
        else reject(new Error("PNG を作れませんでした"));
      }, "image/png");
    });
  }

  var api = {
    CHUNK_KEYWORD: CHUNK_KEYWORD,
    PAYLOAD_VERSION: PAYLOAD_VERSION,
    STATE_LABELS: STATE_LABELS,
    appUrl: appUrl,
    buildPayload: buildPayload,
    fileName: fileName,
    fingerprint: fingerprint,
    embedProof: embedProof,
    extractProof: extractProof,
    verifyPng: verifyPng,
    drawProofCard: drawProofCard,
    canvasToBlob: canvasToBlob,
    _internals: { crc32: crc32, buildChunk: buildChunk, parseItxt: parseItxt }
  };
  if (typeof window !== "undefined") window.LBT_gachaProof = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
