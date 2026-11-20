/* Import the JSON portions of a Garasumado export. Image/PDF/text payloads are not opened. */
(function () {
  "use strict";
  const MAX_ARCHIVE_BYTES = 100 * 1024 * 1024;
  const MAX_JSON_BYTES = 5 * 1024 * 1024;
  const MAX_TOTAL_JSON_BYTES = 25 * 1024 * 1024;
  const MAX_ENTRIES = 2000;
  const MAX_JSON_ENTRIES = 100;
  const ID_RE = /^[A-Za-z0-9]{20}$/;
  const isRecord = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
  const safePath = (value) => {
    const path = String(value || "").replace(/\\/g, "/");
    return !path.startsWith("/") && !/^[A-Za-z]:/.test(path)
      && !path.split("/").some((part) => part === ".." || part === ".");
  };
  function viewOf(bytes) { return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); }
  function read16(view, offset) {
    if (offset < 0 || offset + 2 > view.byteLength) throw new Error("ZIPの索引が途中で切れています。");
    return view.getUint16(offset, true);
  }
  function read32(view, offset) {
    if (offset < 0 || offset + 4 > view.byteLength) throw new Error("ZIPの索引が途中で切れています。");
    return view.getUint32(offset, true);
  }
  function findEndRecord(view) {
    const first = Math.max(0, view.byteLength - 22 - 0xffff);
    for (let offset = view.byteLength - 22; offset >= first; offset -= 1) {
      if (offset >= 0 && read32(view, offset) === 0x06054b50) {
        const commentLength = read16(view, offset + 20);
        if (offset + 22 + commentLength <= view.byteLength) return offset;
      }
    }
    throw new Error("ZIPの終了レコードが見つかりません。ファイルが破損している可能性があります。");
  }
  async function inflateRaw(bytes) {
    if (typeof DecompressionStream !== "function") {
      throw new Error("このブラウザはZIPの解凍に対応していません。Chromeの最新版で再試行してください。");
    }
    try {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    } catch (_) {
      throw new Error("ZIP内のJSONを解凍できませんでした。ZIPを作り直して再試行してください。");
    }
  }
  async function readZipJsonEntries(input, archiveName) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    if (bytes.byteLength > MAX_ARCHIVE_BYTES) throw new Error("ZIPが大きすぎます（上限100MB）。");
    const view = viewOf(bytes);
    const end = findEndRecord(view);
    const disk = read16(view, end + 4);
    const centralDisk = read16(view, end + 6);
    const entriesOnDisk = read16(view, end + 8);
    const entryCount = read16(view, end + 10);
    const centralSize = read32(view, end + 12);
    const centralOffset = read32(view, end + 16);
    if (disk !== 0 || centralDisk !== 0 || entriesOnDisk !== entryCount) {
      throw new Error("複数ディスク形式のZIPには対応していません。");
    }
    if (entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
      throw new Error("ZIP64形式には対応していません。通常のZIP形式で保存してください。");
    }
    if (entryCount > MAX_ENTRIES || centralOffset + centralSize > view.byteLength) {
      throw new Error("ZIPの索引サイズが上限を超えるか、ファイルが破損しています。");
    }
    const decoder = new TextDecoder("utf-8");
    const entries = [], errors = [];
    let ignoredCount = 0, totalJsonBytes = 0, cursor = centralOffset;
    for (let index = 0; index < entryCount; index += 1) {
      if (read32(view, cursor) !== 0x02014b50) throw new Error("ZIPのファイル一覧を読み取れません。");
      const flags = read16(view, cursor + 8);
      const method = read16(view, cursor + 10);
      const compressedSize = read32(view, cursor + 20);
      const uncompressedSize = read32(view, cursor + 24);
      const nameLength = read16(view, cursor + 28);
      const extraLength = read16(view, cursor + 30);
      const commentLength = read16(view, cursor + 32);
      const localOffset = read32(view, cursor + 42);
      const next = cursor + 46 + nameLength + extraLength + commentLength;
      if (next > view.byteLength || next > centralOffset + centralSize) throw new Error("ZIPのファイル一覧が途中で切れています。");
      const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
      cursor = next;
      if (!name || name.endsWith("/")) continue;
      /* Only JSON entries are read and decompressed. Other payloads (including images) stay untouched. */
      if (!/\.json$/i.test(name)) { ignoredCount += 1; continue; }
      if (!safePath(name)) {
        errors.push({ fileName: archiveName + " :: " + name, message: "安全でないファイルパスのため読み飛ばしました。" });
        continue;
      }
      if (entries.length + errors.length >= MAX_JSON_ENTRIES) {
        errors.push({ fileName: archiveName, message: "JSONの数が上限100件を超えました。" });
        break;
      }
      if (uncompressedSize > MAX_JSON_BYTES || compressedSize > MAX_JSON_BYTES
        || totalJsonBytes + uncompressedSize > MAX_TOTAL_JSON_BYTES) {
        errors.push({ fileName: archiveName + " :: " + name, message: "JSONのサイズ上限を超えたため読み飛ばしました。" });
        continue;
      }
      if (flags & 1) {
        errors.push({ fileName: archiveName + " :: " + name, message: "暗号化されたJSONには対応していません。" });
        continue;
      }
      try {
        if (read32(view, localOffset) !== 0x04034b50) throw new Error("ローカルヘッダーが不正です。");
        const localNameLength = read16(view, localOffset + 26);
        const localExtraLength = read16(view, localOffset + 28);
        const dataStart = localOffset + 30 + localNameLength + localExtraLength;
        const dataEnd = dataStart + compressedSize;
        if (dataStart < 0 || dataEnd > view.byteLength) throw new Error("JSONデータが途中で切れています。");
        const compressed = bytes.subarray(dataStart, dataEnd);
        let decoded;
        if (method === 0) decoded = compressed;
        else if (method === 8) decoded = await inflateRaw(compressed);
        else throw new Error("未対応の圧縮方式です（" + method + "）。");
        if (decoded.byteLength !== uncompressedSize) throw new Error("解凍後のサイズが一致しません。");
        totalJsonBytes += decoded.byteLength;
        entries.push({ path: name, fileName: archiveName + " :: " + name, text: decoder.decode(decoded) });
      } catch (error) {
        errors.push({ fileName: archiveName + " :: " + name, message: error?.message || "JSONを解凍できませんでした。" });
      }
    }
    return { entries, errors, ignoredCount };
  }
  function recordKind(data, path) {
    const parts = String(path || "").replace(/\\/g, "/").split("/");
    if (parts.includes("キャラクター") || Array.isArray(data.scenarioHistory)) return "characters";
    if (parts.includes("人格シート")) return "personas";
    if (isRecord(data.owned) && Array.isArray(data.scenarioHistory)) return "characters";
    if (isRecord(data.status) && Array.isArray(data.tactics) && typeof data.name === "string") return "personas";
    return "";
  }
  async function readFiles(fileList) {
    const files = Array.from(fileList || []);
    const output = { characters: [], personas: [], errors: [], ignoredCount: 0, filesRead: 0 };
    const seen = new Set();
    let totalDirectJsonBytes = 0;
    const pushJsonEntry = (entry) => {
      output.filesRead += 1;
      let data;
      try { data = JSON.parse(entry.text); }
      catch (_) {
        output.errors.push({ fileName: entry.fileName, message: "JSONとして解析できません。文字コードとファイル内容を確認してください。" });
        return;
      }
      if (!isRecord(data)) {
        output.errors.push({ fileName: entry.fileName, message: "JSONの最上位がオブジェクトではありません。" });
        return;
      }
      const kind = recordKind(data, entry.path);
      if (!kind) { output.ignoredCount += 1; return; }
      const id = String(data.id || "").trim();
      if (!ID_RE.test(id)) {
        output.errors.push({ fileName: entry.fileName, message: "共有データIDが20文字の英数字ではないため読み込めません。" });
        return;
      }
      if (kind === "characters" && (!isRecord(data.owned) || !Array.isArray(data.scenarioHistory))) {
        output.errors.push({ fileName: entry.fileName, message: "キャラクターJSONに所持情報またはシナリオ履歴がありません。" });
        return;
      }
      if (kind === "personas" && (!isRecord(data.status) || !Array.isArray(data.tactics) || !String(data.name || "").trim())) {
        output.errors.push({ fileName: entry.fileName, message: "人格JSONにステータス・戦術・人格名がそろっていません。" });
        return;
      }
      const key = kind + ":" + id;
      if (seen.has(key)) { output.ignoredCount += 1; return; }
      seen.add(key);
      output[kind].push({ id, path: entry.path, fileName: entry.fileName, data });
    };
    for (const file of files) {
      const name = String(file?.name || "選択ファイル");
      const lower = name.toLowerCase();
      if (lower.endsWith(".zip")) {
        try {
          const raw = await file.arrayBuffer();
          const zip = await readZipJsonEntries(new Uint8Array(raw), name);
          output.ignoredCount += zip.ignoredCount;
          output.errors.push(...zip.errors);
          for (const entry of zip.entries) pushJsonEntry(entry);
        } catch (error) {
          output.errors.push({ fileName: name, message: error?.message || "ZIPを読み込めませんでした。" });
        }
        continue;
      }
      if (!lower.endsWith(".json")) { output.ignoredCount += 1; continue; }
      try {
        if (Number(file?.size) > MAX_JSON_BYTES) {
          output.errors.push({ fileName: name, message: "JSONが大きすぎます（1ファイルあたり上限5MB）。" });
          continue;
        }
        const raw = await file.arrayBuffer();
        const bytes = new Uint8Array(raw);
        totalDirectJsonBytes += bytes.byteLength;
        if (bytes.byteLength > MAX_JSON_BYTES || totalDirectJsonBytes > MAX_TOTAL_JSON_BYTES) {
          output.errors.push({ fileName: name, message: "JSONファイルの合計サイズ上限を超えました。" });
          continue;
        }
        pushJsonEntry({ path: name, fileName: name, text: new TextDecoder("utf-8").decode(bytes) });
      } catch (error) {
        output.errors.push({ fileName: name, message: error?.message || "JSONを読み込めませんでした。" });
      }
    }
    return output;
  }
  const api = { readFiles, readZipJsonEntries };
  if (typeof window !== "undefined") window.LBT_readGarasumadoExportFiles = readFiles;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();