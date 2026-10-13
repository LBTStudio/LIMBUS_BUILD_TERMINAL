/* LIMBUS BUILD TERMINAL — gacha-identity.js
   利用者間で「誰が言ったか」を検証するための署名層。

   なぜ必要か: ハッシュ鎖は「改変されたら露見する」だけで、「A が署名した」とは言えない。
   利用者ごとの鍵ペアで結果に署名すると、他人は A の秘密鍵なしに A の結果を作れない
   （＝なりすましが成立しない）。検証は公開鍵だけで行えるので、サーバーは要らない。

   鍵は状態（共有される保存データ）には入れない。端末の localStorage にだけ置き、
   共有ペイロードには公開鍵と署名だけを載せる。利用者操作は不要（初回に自動生成）。 */
(function () {
  "use strict";

  var subtle = (typeof crypto !== "undefined" && crypto.subtle) || null;
  var te = typeof TextEncoder !== "undefined" ? new TextEncoder() : null;

  /* --- base64url（外部依存なし。btoa はあるレルムと無いレルムがあるため自前実装）--- */
  var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
  function bytesToB64url(bytes) {
    var s = "";
    for (var i = 0; i < bytes.length; i += 3) {
      var b0 = bytes[i];
      var b1 = bytes[i + 1];
      var b2 = bytes[i + 2];
      s += B64[b0 >> 2];
      s += B64[((b0 & 3) << 4) | (b1 === undefined ? 0 : b1 >> 4)];
      if (b1 === undefined) break;
      s += B64[((b1 & 15) << 2) | (b2 === undefined ? 0 : b2 >> 6)];
      if (b2 === undefined) break;
      s += B64[b2 & 63];
    }
    return s;
  }
  function b64urlToBytes(str) {
    var out = [];
    var bits = 0, value = 0;
    for (var i = 0; i < str.length; i++) {
      var v = B64.indexOf(str[i]);
      if (v < 0) continue;
      value = (value << 6) | v;
      bits += 6;
      if (bits >= 8) { bits -= 8; out.push((value >> bits) & 255); }
    }
    return new Uint8Array(out);
  }

  function hex(bytes) {
    var s = "";
    for (var i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, "0");
    return s;
  }

  /* 鍵順を固定した正準 JSON。署名対象の一意な表現を作る。 */
  function canonical(value) {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
    var keys = Object.keys(value).filter(function (k) { return value[k] !== undefined; }).sort();
    return "{" + keys.map(function (k) { return JSON.stringify(k) + ":" + canonical(value[k]); }).join(",") + "}";
  }

  function bodyOf(batch) {
    var c = {};
    for (var k in batch) if (Object.prototype.hasOwnProperty.call(batch, k)) c[k] = batch[k];
    delete c.userSignature;
    delete c.signer;
    return c;
  }

  function requireSubtle() {
    if (!subtle) throw new Error("gacha-identity: WebCrypto (crypto.subtle) が利用できない");
  }

  var ALG = { name: "ECDSA", namedCurve: "P-256" };
  var SIGN_ALG = { name: "ECDSA", hash: "SHA-256" };

  /* 利用者ごとの鍵ペア。公開鍵は spki、秘密鍵は pkcs8 を base64url で保持する。 */
  async function generateIdentity() {
    requireSubtle();
    var pair = await subtle.generateKey(ALG, true, ["sign", "verify"]);
    var spki = await subtle.exportKey("spki", pair.publicKey);
    var pkcs8 = await subtle.exportKey("pkcs8", pair.privateKey);
    return {
      version: 1,
      algorithm: "ECDSA-P256",
      publicKey: bytesToB64url(new Uint8Array(spki)),
      privateKey: bytesToB64url(new Uint8Array(pkcs8)),
      createdAt: Date.now()
    };
  }

  /* 公開鍵の指紋。短く表示して人手で照合できる（サーバー不要の身元確認）。 */
  async function publicKeyId(publicKeyB64) {
    requireSubtle();
    var bytes = b64urlToBytes(publicKeyB64);
    var digest = await subtle.digest("SHA-256", bytes);
    return "p256:" + hex(new Uint8Array(digest)).slice(0, 16);
  }

  async function importPublic(publicKeyB64) {
    return subtle.importKey("spki", b64urlToBytes(publicKeyB64), ALG, false, ["verify"]);
  }
  async function importPrivate(privateKeyB64) {
    return subtle.importKey("pkcs8", b64urlToBytes(privateKeyB64), ALG, false, ["sign"]);
  }

  /* バッチ本体（署名フィールドを除く）に署名し、signer と userSignature を付して返す。 */
  async function signBatch(batch, identity) {
    requireSubtle();
    var privateKey = await importPrivate(identity.privateKey);
    var data = te.encode(canonical(bodyOf(batch)));
    var sig = await subtle.sign(SIGN_ALG, privateKey, data);
    return {
      ...batch,
      signer: {
        algorithm: identity.algorithm || "ECDSA-P256",
        keyId: await publicKeyId(identity.publicKey),
        publicKey: identity.publicKey
      },
      userSignature: bytesToB64url(new Uint8Array(sig))
    };
  }

  async function verifyBatchSignature(batch) {
    requireSubtle();
    if (!batch || !batch.signer || !batch.signer.publicKey || !batch.userSignature) return false;
    var publicKey = await importPublic(batch.signer.publicKey);
    var data = te.encode(canonical(bodyOf(batch)));
    return subtle.verify(SIGN_ALG, publicKey, b64urlToBytes(batch.userSignature), data);
  }

  /* --- 保存（端末内のみ）。共有データには載せない。 --- */
  var STORAGE_KEY = "lbt.gacha.identity.v1";
  function defaultStorage() {
    try { return (typeof localStorage !== "undefined") ? localStorage : null; } catch (e) { return null; }
  }
  function loadIdentity(storage) {
    var s = storage || defaultStorage();
    if (!s) return null;
    try {
      var raw = s.getItem(STORAGE_KEY);
      if (!raw) return null;
      var id = JSON.parse(raw);
      return (id && id.publicKey && id.privateKey) ? id : null;
    } catch (e) { return null; }
  }
  function saveIdentity(identity, storage) {
    var s = storage || defaultStorage();
    if (!s) return false;
    try { s.setItem(STORAGE_KEY, JSON.stringify(identity)); return true; } catch (e) { return false; }
  }
  /* 初回は自動生成。利用者操作は不要。 */
  async function ensureIdentity(storage) {
    var existing = loadIdentity(storage);
    if (existing) return existing;
    var created = await generateIdentity();
    saveIdentity(created, storage);
    return created;
  }

  /* --- 3値検証の統合 ---
     verified   : 鎖が正しく、署名が有効で、ビーコンが照合できる
     mismatch   : 鎖・署名・ビーコンのいずれかが食い違う（改ざんの証明になる）
     unverified : 署名/ビーコンが無い、またはビーコンへ到達できない（不在は改ざんではない） */
  function withTimeout(promise, ms) {
    if (!ms) return promise;
    return Promise.race([
      promise,
      new Promise(function (_, reject) { setTimeout(function () { reject(new Error("timeout")); }, ms); })
    ]);
  }

  async function assessBatch(batch, options) {
    var opts = options || {};
    var gacha = opts.gacha;
    var reasons = [];
    var hardMismatch = false;

    var chainOk = true;
    if (gacha && typeof gacha.verifyBatch === "function") {
      var chain = gacha.verifyBatch(batch);
      if (!chain.ok) { chainOk = false; hardMismatch = true; reasons = reasons.concat(chain.reasons); }
    }

    var sigOk = null;
    if (batch && batch.signer && batch.userSignature) {
      try { sigOk = await verifyBatchSignature(batch); } catch (e) { sigOk = false; }
      if (sigOk === false) { hardMismatch = true; reasons.push("署名が一致しない（なりすまし、または改変）"); }
    } else {
      reasons.push("署名が無い（未検証）");
    }

    var beaconOk = null;
    if (batch && batch.beacon && batch.beacon.type === "drand" && gacha && typeof gacha.verifyBeacon === "function") {
      try {
        var b = await withTimeout(gacha.verifyBeacon(batch.beacon, opts), opts.timeoutMs);
        beaconOk = b.ok;
        if (!b.ok) { hardMismatch = true; reasons = reasons.concat(b.reasons); }
      } catch (e) {
        reasons.push("ビーコンへ到達できない（未検証）");
      }
    } else {
      reasons.push("外部ビーコンが無い（未検証）");
    }

    var state = hardMismatch ? "mismatch"
      : (chainOk && sigOk === true && beaconOk === true) ? "verified"
        : "unverified";
    return { state: state, reasons: reasons };
  }

  var api = {
    canonical: canonical,
    bytesToB64url: bytesToB64url,
    b64urlToBytes: b64urlToBytes,
    generateIdentity: generateIdentity,
    publicKeyId: publicKeyId,
    signBatch: signBatch,
    verifyBatchSignature: verifyBatchSignature,
    loadIdentity: loadIdentity,
    saveIdentity: saveIdentity,
    ensureIdentity: ensureIdentity,
    assessBatch: assessBatch,
    STORAGE_KEY: STORAGE_KEY
  };
  if (typeof window !== "undefined") window.LBT_gachaIdentity = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
