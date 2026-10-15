import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { webcrypto } from "node:crypto";

/* ---------------------------------------------------------------------------
   抽出証明画像（信用証明）の回帰テスト。

   守るべき性質:
     - PNG の iTXt に検証データを埋め込み、日本語込みで取り出せる
     - 壊れた PNG・埋め込みの無い画像は「照合不能（unverified）」として扱う
       （更新不能は改ざんの証明ではない）
     - 埋め込みバッチは鎖・署名・ビーコンで3値判定される
     - 埋め込みデータの書き換え（画素改ざんと同義）は mismatch になる
   --------------------------------------------------------------------------- */

function loadScript(rel, extra) {
  const source = readFileSync(new URL(rel, import.meta.url), "utf8");
  const context = { window: {}, console, setTimeout, clearTimeout, ...extra };
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.window;
}

const G = loadScript("../js/gacha.js", {}).LBT_gacha;
const ID = loadScript("../js/gacha-identity.js", { crypto: webcrypto, TextEncoder, Uint8Array }).LBT_gachaIdentity;
const P = loadScript("../js/gacha-proof.js", { TextEncoder, TextDecoder, Uint8Array }).LBT_gachaProof;

const db = JSON.parse(readFileSync(new URL("../data/db.json", import.meta.url), "utf8"));
const themePacks = JSON.parse(readFileSync(new URL("../data/gacha-theme-packs.json", import.meta.url), "utf8"));
const gacha = G.createGacha({ db, themePacks });

function fakeFetch(round, randomness) {
  return async () => ({ ok: true, status: 200, json: async () => ({ round, randomness, signature: "sig" }) });
}

async function buildSignedBatch(options = {}) {
  const session = G.createSession({ serverSeed: "s", clientSeed: "c" });
  const out = gacha.drawBatch({ session, kind: "ego", owned: {}, shards: 100, count: 1 });
  const batch = G.finalizeBatch(out, session, { rulesetHash: gacha.rulesetHash, beacon: options.beacon || null });
  if (options.unsigned) return batch;
  const id = await ID.generateIdentity();
  return ID.signBatch(batch, id);
}

/* --- 合成 PNG（キャンバス非依存の最小 PNG: 署名 + IHDR + IEND） --------- */

function concatBytes(...arrays) {
  const total = arrays.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

function makePng() {
  const signature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = P._internals.buildChunk("IHDR", new Uint8Array(13));
  const iend = P._internals.buildChunk("IEND", new Uint8Array(0));
  return concatBytes(signature, ihdr, iend);
}

/* --- CRC32 ------------------------------------------------------------- */

test("CRC32: 既知ベクタと一致する（PNG の整合性検査の土台）", () => {
  assert.equal(P._internals.crc32(new TextEncoder().encode("123456789")), 0xcbf43926);
  assert.equal(P._internals.crc32(new Uint8Array(0)), 0);
});

/* --- 埋め込みと抽出 ----------------------------------------------------- */

test("埋め込み: 日本語を含む検証データを PNG から取り出せる", () => {
  const text = JSON.stringify({ v: 1, note: "抽出証明・テスト⛓" });
  const embedded = P.embedProof(makePng(), text);
  const extracted = P.extractProof(embedded);
  assert.equal(extracted.ok, true);
  assert.equal(extracted.text, text);
});

test("抽出: 埋め込みの無い PNG・非 PNG は理由つきで失敗する", () => {
  const noChunk = P.extractProof(makePng());
  assert.equal(noChunk.ok, false);
  assert.match(noChunk.reason, /埋め込まれていません/);
  const notPng = P.extractProof(new Uint8Array([1, 2, 3]));
  assert.equal(notPng.ok, false);
  assert.throws(() => P.embedProof(new Uint8Array([1, 2, 3]), "x"), /PNG/);
});

test("抽出: ビット破損した PNG は CRC 不一致として拒否する", () => {
  const embedded = P.embedProof(makePng(), "{}");
  const corrupted = embedded.slice();
  corrupted[40] ^= 0xff;
  const out = P.extractProof(corrupted);
  assert.equal(out.ok, false);
  assert.match(out.reason, /CRC|壊れて/);
});

/* --- ペイロード --------------------------------------------------------- */

test("ペイロード: バッチ本体・版・時刻を含む JSON を返す", async () => {
  const signed = await buildSignedBatch();
  const parsed = JSON.parse(P.buildPayload(signed));
  assert.equal(parsed.v, 1);
  assert.equal(parsed.batch.batchHash, signed.batchHash);
  assert.ok(parsed.batch.signer && parsed.batch.signer.keyId, "署名者が写し込まれる");
  assert.equal(typeof parsed.exportedAt, "string");
});

test("ファイル名: 指紋の先頭8文字を含む .png", async () => {
  const signed = await buildSignedBatch();
  assert.equal(P.fileName(signed), `lbt-proof-${signed.batchHash.slice(0, 8)}.png`);
});

/* --- 3値検証 ------------------------------------------------------------ */

test("検証: 署名なし・ビーコンなし→unverified / 改変→mismatch / 署名+錨→verified", async () => {
  const unsigned = await buildSignedBatch({ unsigned: true });
  const pngUnsigned = P.embedProof(makePng(), P.buildPayload(unsigned));
  const v1 = await P.verifyPng(pngUnsigned, { identity: ID, gacha });
  assert.equal(v1.state, "unverified");
  assert.equal(v1.batch.count, 1, "埋め込みバッチが取り出せる");
  assert.ok(v1.reasons.length > 0);

  const signed = await buildSignedBatch({ beacon: { type: "drand", round: 111, randomness: "aa" } });
  const tampered = JSON.parse(P.buildPayload(signed));
  tampered.batch.records[0].item.name = "改ざんされたE.G.O";
  const pngTampered = P.embedProof(makePng(), JSON.stringify(tampered));
  const v2 = await P.verifyPng(pngTampered, { identity: ID, gacha, fetchImpl: fakeFetch(111, "aa") });
  assert.equal(v2.state, "mismatch", "埋め込みデータの書き換えは露見する");

  const pngSigned = P.embedProof(makePng(), P.buildPayload(signed));
  const v3 = await P.verifyPng(pngSigned, { identity: ID, gacha, fetchImpl: fakeFetch(111, "aa") });
  assert.equal(v3.state, "verified");
  assert.equal(v3.reasons.length, 0);
});

test("検証: 埋め込みの無い画像は unverified（改ざんではない）", async () => {
  const v = await P.verifyPng(makePng(), { identity: ID, gacha });
  assert.equal(v.state, "unverified");
  assert.equal(v.batch, null);
  assert.match(v.reasons[0], /埋め込まれていません/);
});
