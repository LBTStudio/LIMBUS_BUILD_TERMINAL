import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

/* ---------------------------------------------------------------------------
   抽出リスト（ガチャ結果の保存所）とバッチ抽選の回帰テスト。

   守るべき性質:
     - バッチは残LP（残欠片）を上限にし、回数は導出される
     - バッチ内で同じ候補を2度選ばない（テーマパックの重複は欠片変換が正規）
     - 結果はハッシュ鎖で連結し、1件でも編集・並べ替え・削除されれば露見する
     - 錨（seed/commit/rolls/rulesetHash）はバッチ単位で1つに束ねる
     - 検証は読み手側で完結する（作者のクライアントを信用しない）
   --------------------------------------------------------------------------- */

function loadGacha() {
  const source = readFileSync(new URL("../js/gacha.js", import.meta.url), "utf8");
  const context = { window: {}, console };
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.window.LBT_gacha;
}

const G = loadGacha();
const j = (v) => JSON.parse(JSON.stringify(v));
const db = JSON.parse(readFileSync(new URL("../data/db.json", import.meta.url), "utf8"));
const themePacks = JSON.parse(readFileSync(new URL("../data/gacha-theme-packs.json", import.meta.url), "utf8"));
const gacha = G.createGacha({ db, themePacks });

function scripted(script) {
  const queue = [...script];
  return {
    used: 0,
    roll(max) { const v = queue.shift(); this.used += 1; if (v === undefined) throw new Error("script exhausted"); return v; },
    revealSecret() { return { serverSeed: "s", commit: G.commitOf("s"), clientSeed: "c", rolls: [] }; }
  };
}

/* --- バッチ抽選: 残LPで回数が決まる ------------------------------------ */

test("人格バッチ: 残LPが回数の上限になる（初回無料→以降100LPを逐次計算）", () => {
  const session = scripted([5, 6, 7]);
  const out = gacha.drawBatch({
    session, kind: "persona",
    owned: { personas: [], specialPersonas: [], egos: [] },
    lp: 100, count: 3
  });
  // 1回目 0LP（未所持のみ）→ 2回目 100LP → 3回目 100LP は残0で不可。
  assert.equal(out.drawn, 2);
  assert.equal(out.totalCost.lp, 100);
  assert.equal(out.stopped, "insufficientLP");
  assert.deepEqual(j(out.results.map((r) => r.item.no)), [5, 6]);
});

test("人格バッチ: 既所持が1件でもあれば全回100LP", () => {
  const session = scripted([2, 3]);
  const out = gacha.drawBatch({
    session, kind: "persona",
    owned: { personas: [1], specialPersonas: [], egos: [] },
    lp: 250, count: 5
  });
  assert.equal(out.drawn, 2);
  assert.equal(out.totalCost.lp, 200);
  assert.equal(out.stopped, "insufficientLP");
});

test("バッチ内で同じ候補を選ばない（所有済みは振り直す）", () => {
  // roll1: 2（未所持→採用）, roll2: 2（既所持→振り直し）, roll3: 3（採用）
  const session = scripted([2, 2, 3]);
  const out = gacha.drawBatch({
    session, kind: "persona",
    owned: { personas: [1], specialPersonas: [], egos: [] },
    lp: 1000, count: 2
  });
  assert.deepEqual(j(out.results.map((r) => r.item.no)), [2, 3]);
  assert.equal(new Set(out.results.map((r) => r.item.no)).size, 2);
});

test("E.G.Oバッチ: 欠片で回数が決まり、重複は出ない", () => {
  const session = scripted([2, 2, 3, 4]);
  const out = gacha.drawBatch({
    session, kind: "ego",
    owned: { personas: [], specialPersonas: [], egos: [1] },
    shards: 250, count: 5
  });
  assert.equal(out.drawn, 2);
  assert.equal(out.totalCost.shards, 200);
  assert.equal(out.stopped, "insufficientShards");
  assert.deepEqual(j(out.results.map((r) => r.item.no)), [2, 3]);
});

test("テーマパック: 重複は欠片50へ変換する（重複回避ではなく変換が正規）", () => {
  const pack = gacha.findPack("属せない＆愛することのできない");
  const heldNames = new Set([pack.entries[0].name]);
  const session = scripted([1, 1, 2]);
  const out = gacha.drawBatch({
    session, kind: "themePack", pack, heldNames,
    lp: pack.lp * 3, count: 3
  });
  assert.equal(out.drawn, 3);
  assert.equal(out.results[0].duplicate, true);
  assert.equal(out.results[0].grantedShards, 50);
  assert.equal(out.results[2].duplicate, false);
  assert.equal(out.totalCost.lp, pack.lp * 3);
});

test("プールを引き切ったら早期終了し、残りを報告する", () => {
  // プール2件（no 1,2）を両方所持済みにして、3回目で枯渇させる。
  const session = scripted([1, 2, 3, 4, 5]);
  const out = gacha.drawBatch({
    session, kind: "persona",
    owned: { personas: [1], specialPersonas: [], egos: [] },
    // 残プールは no2 のみ。No.2 を引いた後は全所有で再抽選不能。
    lp: 10000, count: 3,
    poolOverride: { personas: [{ no: 1, name: "A" }, { no: 2, name: "B" }], specialPersonas: [], egos: [] }
  });
  assert.equal(out.drawn, 1);
  assert.equal(out.stopped, "poolExhausted");
});

/* --- バッチの錨（ハッシュ鎖・改ざん検出） ------------------------------ */

function finalizedBatch(secret) {
  const session = G.createSession({ serverSeed: "batch-seed", clientSeed: "player-1" });
  const out = gacha.drawBatch({
    session, kind: "persona",
    owned: { personas: [1], specialPersonas: [], egos: [] },
    lp: 300, count: 3
  });
  const batch = G.finalizeBatch(out, session, { rulesetHash: gacha.rulesetHash, ruleset: "core", secret });
  return { batch, out };
}

test("バッチ錨: 結果は鎖で連結し、検証を通る", () => {
  const { batch } = finalizedBatch("GM-KEY");
  assert.equal(batch.records.length, batch.count);
  for (let i = 1; i < batch.records.length; i++) {
    assert.equal(batch.records[i].prev, batch.records[i - 1].hash, "前のハッシュを指す");
  }
  assert.equal(batch.records[0].prev, G.GENESIS_HASH, "先頭は genesis を指す");
  assert.equal(typeof batch.batchHash, "string");
  assert.equal(batch.beacon, null, "外部錨は既定で未設定（後から差し込む）");
  assert.equal(batch.rulesetHash, gacha.rulesetHash);

  assert.equal(G.verifyBatch(batch, { secret: "GM-KEY" }).ok, true);
  assert.deepEqual(j(G.verifyBatch(batch, { secret: "GM-KEY" }).reasons), []);
});

test("バッチ錨: 結果の編集は鎖の不一致で落ちる", () => {
  const { batch } = finalizedBatch();
  const tampered = structuredClone(batch);
  tampered.records[1].item.name = "改ざんされた人格";
  const v = G.verifyBatch(tampered);
  assert.equal(v.ok, false);
  assert.ok(v.reasons.some((r) => /鎖|連結|ハッシュ/.test(r)));
});

test("バッチ錨: 結果の削除・並べ替えも落ちる", () => {
  const { batch } = finalizedBatch();
  const dropped = structuredClone(batch);
  dropped.records.splice(1, 1);
  assert.equal(G.verifyBatch(dropped).ok, false);

  const reordered = structuredClone(batch);
  reordered.records.reverse();
  assert.equal(G.verifyBatch(reordered).ok, false);
});

test("バッチ錨: シード・コミットの差し替えは再計算不一致で落ちる", () => {
  const { batch } = finalizedBatch();
  const badSeed = structuredClone(batch);
  badSeed.serverSeed = "batch-seed-2";
  assert.equal(G.verifyBatch(badSeed).ok, false);

  const badCommit = structuredClone(batch);
  badCommit.commit = G.commitOf("other");
  assert.equal(G.verifyBatch(badCommit).ok, false);
});

test("バッチ錨: 署名者は項目差し替えを止め、鍵違いは不合格", () => {
  const { batch } = finalizedBatch("GM-KEY");
  assert.ok(batch.signature);
  const swapped = structuredClone(batch);
  swapped.records[0].item = { kind: "persona", no: 999, name: "別物" };
  const v = G.verifyBatch(swapped, { secret: "GM-KEY" });
  assert.equal(v.ok, false);
  assert.equal(G.verifyBatch(batch, { secret: "WRONG" }).ok, false);
});

test("バッチ錨: 外部ビーコンは後から差し込める（round を錨に含める）", () => {
  const session = G.createSession({ serverSeed: "s", clientSeed: "c" });
  const out = gacha.drawBatch({ session, kind: "ego", owned: {}, shards: 100, count: 1 });
  const beacon = { type: "drand", round: 1234567, value: "abcdef" };
  const batch = G.finalizeBatch(out, session, { rulesetHash: gacha.rulesetHash, beacon });
  assert.deepEqual(j(batch.beacon), beacon);
  assert.equal(G.verifyBatch(batch, { expectedBeaconRound: 1234567 }).ok, true);
  assert.equal(G.verifyBatch(batch, { expectedBeaconRound: 999 }).ok, false);
});

/* --- 抽出リスト（state.draws）への保存 --------------------------------- */

function loadState() {
  const source = readFileSync(new URL("../js/state.js", import.meta.url), "utf8");
  const context = {
    window: { DB: { support_passives: [], death_passives: [], spirits: [], items: [] } },
    console, setTimeout, clearTimeout, URL, TextEncoder, TextDecoder,
    React: { useReducer: () => {}, useRef: () => ({ current: null }), useState: () => [null, () => {}], useEffect: () => {} }
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.window;
}

test("抽出リスト: 既存保存データに draws が無くても配列として補完される", () => {
  const w = loadState();
  const normalize = w.LBT_normalizeStateShape;
  assert.ok(typeof normalize === "function");
  const next = normalize({ roster: { personas: [], egos: [], supports: [], spirits: [] }, ui: {} });
  assert.ok(Array.isArray(next.draws), "draws が配列で補完される");
  assert.equal(next.draws.length, 0);
});

test("抽出リスト: ADD_DRAW_BATCH は結果と錨をそのまま保存する（再計算しない）", () => {
  const w = loadState();
  const reducer = w.appReducer;
  const { batch } = finalizedBatch();
  const next = reducer({ draws: [] }, { type: "ADD_DRAW_BATCH", batch });
  assert.equal(next.draws.length, 1);
  assert.equal(next.draws[0].batchHash, batch.batchHash);
  assert.equal(next.draws[0].records.length, batch.records.length);
  // 保存後に読み直しても鎖は生きている（移行が記録を書き換えない）。
  const reloaded = w.LBT_normalizeStateShape({ ...next, roster: next.roster || { personas: [], egos: [], supports: [], spirits: [] }, ui: next.ui || {} });
  assert.equal(G.verifyBatch(reloaded.draws[0]).ok, true);
});
