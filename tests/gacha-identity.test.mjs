import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { webcrypto } from "node:crypto";

/* ---------------------------------------------------------------------------
   署名層（なりすまし対策）と3値検証の回帰テスト。

   守るべき性質:
     - 利用者ごとの鍵で署名でき、他人はその鍵なしに偽造できない
     - 改変・なりすましは mismatch（改ざんの証明）になる
     - 署名やビーコンが無い/届かない場合は unverified（不在は改ざんではない）
     - 初回の鍵生成は自動（利用者操作なし）
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

const db = JSON.parse(readFileSync(new URL("../data/db.json", import.meta.url), "utf8"));
const themePacks = JSON.parse(readFileSync(new URL("../data/gacha-theme-packs.json", import.meta.url), "utf8"));
const gacha = G.createGacha({ db, themePacks });

function fakeFetch(round, randomness) {
  return async () => ({ ok: true, status: 200, json: async () => ({ round, randomness, signature: "sig" }) });
}

async function buildBatch(options = {}) {
  const session = G.createSession({ serverSeed: "s", clientSeed: "c" });
  const out = gacha.drawBatch({ session, kind: "ego", owned: {}, shards: 100, count: 1 });
  return G.finalizeBatch(out, session, { rulesetHash: gacha.rulesetHash, beacon: options.beacon || null });
}

/* --- base64url --------------------------------------------------------- */

test("base64url: 任意バイト列を往復できる", () => {
  for (let n = 0; n < 40; n++) {
    const bytes = new Uint8Array(n).map((_, i) => (i * 37 + 11) & 255);
    const round = ID.b64urlToBytes(ID.bytesToB64url(bytes));
    assert.deepEqual([...round], [...bytes], `n=${n}`);
  }
});

/* --- 鍵と署名 ---------------------------------------------------------- */

test("鍵: 生成でき、指紋は安定し p256: で始まる", async () => {
  const id = await ID.generateIdentity();
  assert.equal(id.algorithm, "ECDSA-P256");
  assert.ok(id.publicKey && id.privateKey);
  const fp = await ID.publicKeyId(id.publicKey);
  assert.match(fp, /^p256:[0-9a-f]{16}$/);
  assert.equal(await ID.publicKeyId(id.publicKey), fp, "同じ鍵は同じ指紋");
  const other = await ID.generateIdentity();
  assert.notEqual(await ID.publicKeyId(other.publicKey), fp, "別の鍵は別の指紋");
});

test("署名: 正直な署名は検証を通り、改変・なりすましは落ちる", async () => {
  const id = await ID.generateIdentity();
  const batch = await ID.signBatch(await buildBatch(), id);
  assert.ok(batch.signer && batch.userSignature);
  assert.equal(await ID.verifyBatchSignature(batch), true);

  const edited = structuredClone(batch);
  edited.records[0].item.name = "改ざんされたE.G.O";
  assert.equal(await ID.verifyBatchSignature(edited), false);

  const badSig = structuredClone(batch);
  badSig.userSignature = ID.bytesToB64url(new Uint8Array(64));
  assert.equal(await ID.verifyBatchSignature(badSig), false);

  const impostor = await ID.generateIdentity();
  const stolen = structuredClone(batch);
  stolen.signer.publicKey = impostor.publicKey;
  assert.equal(await ID.verifyBatchSignature(stolen), false, "他人の公開鍵では通らない");
});

/* --- 3値検証 ----------------------------------------------------------- */

test("3値: 署名もビーコンも無ければ unverified", async () => {
  const v = await ID.assessBatch(await buildBatch(), { gacha });
  assert.equal(v.state, "unverified");
  assert.ok(v.reasons.some((r) => /署名が無い/.test(r)));
  assert.ok(v.reasons.some((r) => /ビーコン/.test(r)));
});

test("3値: 署名はあってもビーコンが無ければ unverified（自己署名のみは信用しない）", async () => {
  const id = await ID.generateIdentity();
  const batch = await ID.signBatch(await buildBatch(), id);
  const v = await ID.assessBatch(batch, { gacha });
  assert.equal(v.state, "unverified");
});

test("3値: 署名＋ビーコン照合が揃えば verified", async () => {
  const id = await ID.generateIdentity();
  const beacon = { type: "drand", round: 111, randomness: "aa" };
  const batch = await ID.signBatch(await buildBatch({ beacon }), id);
  const v = await ID.assessBatch(batch, { gacha, fetchImpl: fakeFetch(111, "aa"), timeoutMs: 1000 });
  assert.equal(v.state, "verified");
  assert.equal(v.reasons.length, 0);
});

test("3値: 改変は mismatch、ビーコン不一致も mismatch", async () => {
  const id = await ID.generateIdentity();
  const beacon = { type: "drand", round: 111, randomness: "aa" };
  const signed = await ID.signBatch(await buildBatch({ beacon }), id);

  const edited = structuredClone(signed);
  edited.records[0].item.name = "改ざん";
  assert.equal((await ID.assessBatch(edited, { gacha, fetchImpl: fakeFetch(111, "aa") })).state, "mismatch");

  const v = await ID.assessBatch(signed, { gacha, fetchImpl: fakeFetch(111, "DIFFERENT") });
  assert.equal(v.state, "mismatch");
  assert.ok(v.reasons.some((r) => /ビーコンの値/.test(r)));
});

test("3値: ビーコンへ到達できなくても不便にしない（unverified で続行）", async () => {
  const id = await ID.generateIdentity();
  const beacon = { type: "drand", round: 111, randomness: "aa" };
  const batch = await ID.signBatch(await buildBatch({ beacon }), id);
  const v = await ID.assessBatch(batch, { gacha, fetchImpl: async () => { throw new Error("offline"); }, timeoutMs: 1000 });
  assert.equal(v.state, "unverified");
  assert.ok(v.reasons.some((r) => /到達できない/.test(r)));
});

test("3値: ビーコンの取得が固まってもタイムアウトで未検証へ落ちる", async () => {
  const id = await ID.generateIdentity();
  const beacon = { type: "drand", round: 111, randomness: "aa" };
  const batch = await ID.signBatch(await buildBatch({ beacon }), id);
  const v = await ID.assessBatch(batch, { gacha, fetchImpl: () => new Promise(() => {}), timeoutMs: 50 });
  assert.equal(v.state, "unverified");
});

/* --- 端末内の鍵管理（利用者操作なし） --------------------------------- */

test("鍵管理: 初回は自動生成し、以後は同じ鍵を返す（共有データには載せない）", async () => {
  const store = (() => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v) }; })();
  const first = await ID.ensureIdentity(store);
  const second = await ID.ensureIdentity(store);
  assert.equal(first.publicKey, second.publicKey);
  assert.ok(store.getItem(ID.STORAGE_KEY), "端末の storage に保存される");
  assert.equal(ID.loadIdentity(store).privateKey, first.privateKey);
});


test("鍵管理: 壊れた保存鍵を検出して再生成し、元の値も端末内に退避する", async () => {
  const original = JSON.stringify({
    version: 1,
    algorithm: "ECDSA-P256",
    publicKey: "not-a-valid-spki-key",
    privateKey: "not-a-valid-pkcs8-key"
  });
  const values = new Map([[ID.STORAGE_KEY, original]]);
  const store = {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, value)
  };

  const recovered = await ID.ensureIdentity(store);
  assert.notEqual(recovered.publicKey, "not-a-valid-spki-key");
  assert.notEqual(recovered.privateKey, "not-a-valid-pkcs8-key");
  assert.equal(values.get(ID.STORAGE_KEY + ".invalid"), original, "不正な保存値を一度だけ保全する");
  assert.equal(JSON.parse(values.get(ID.STORAGE_KEY)).publicKey, recovered.publicKey);

  const signed = await ID.signBatch(await buildBatch(), recovered);
  assert.equal(await ID.verifyBatchSignature(signed), true, "復旧後の鍵は実際に署名を検証できる");
});

test("鍵管理: 個別には有効でも公開鍵と秘密鍵が別人の鍵なら自己修復する", async () => {
  const publicOwner = await ID.generateIdentity();
  const privateOwner = await ID.generateIdentity();
  const mismatched = {
    ...publicOwner,
    privateKey: privateOwner.privateKey
  };
  const original = JSON.stringify(mismatched);
  const values = new Map([[ID.STORAGE_KEY, original]]);
  const store = {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, value)
  };

  const recovered = await ID.ensureIdentity(store);
  assert.notEqual(recovered.publicKey, publicOwner.publicKey, "不一致の公開鍵を再利用しない");
  assert.equal(values.get(ID.STORAGE_KEY + ".invalid"), original, "古い鍵対は復旧用に保全する");
  const signed = await ID.signBatch(await buildBatch(), recovered);
  assert.equal(await ID.verifyBatchSignature(signed), true);
});
