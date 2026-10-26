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

test("rulesetHash は抽選結果に関わる名前・ランク・パック出典の変更を検知する", () => {
  const baseHash = gacha.rulesetHash;
  const renamedPersona = structuredClone(db);
  renamedPersona.normal_personas[0].name += "（変更）";
  assert.notEqual(G.createGacha({ db: renamedPersona, themePacks }).rulesetHash, baseHash,
    "人格名の変更で指紋が変わる");

  const relabeledEgo = structuredClone(db);
  relabeledEgo.egos[0].rank = relabeledEgo.egos[0].rank === "ZAYIN" ? "TETH" : "ZAYIN";
  assert.notEqual(G.createGacha({ db: relabeledEgo, themePacks }).rulesetHash, baseHash,
    "E.G.Oランクの変更で指紋が変わる");

  const renamedEgo = structuredClone(db);
  renamedEgo.egos[0].name += "（変更）";
  assert.notEqual(G.createGacha({ db: renamedEgo, themePacks }).rulesetHash, baseHash,
    "E.G.O名の変更で指紋が変わる");

  const changedPack = structuredClone(themePacks);
  changedPack.packs[0].entries[0].page += 1;
  assert.notEqual(G.createGacha({ db, themePacks: changedPack }).rulesetHash, baseHash,
    "パックの出典ページ変更で指紋が変わる");
});

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

test("バッチ錨: rolls 欠落・不正形状は例外ではなく不合格になる", () => {
  const { batch } = finalizedBatch();
  const missing = structuredClone(batch);
  delete missing.rolls;
  assert.equal(G.verifyBatch(missing).ok, false, "rolls 欠落を通さない");

  for (const rolls of [null, "bad", [null], [{ max: 0, value: 1 }]]) {
    const broken = structuredClone(batch);
    broken.rolls = rolls;
    assert.doesNotThrow(() => G.verifyBatch(broken), JSON.stringify(rolls));
    assert.equal(G.verifyBatch(broken).ok, false, JSON.stringify(rolls));
  }
});

test("バッチ錨: ルール指紋・種別・ビーコンを編集するとメタデータ不整合になる", () => {
  const { batch } = finalizedBatch();
  assert.equal(batch.schemaVersion, 2);
  assert.match(batch.integrityHash, /^[0-9a-f]{64}$/);

  for (const field of ["rulesetHash", "kind", "beacon", "count"]) {
    const changed = structuredClone(batch);
    changed[field] = field === "beacon"
      ? { type: "drand", round: 7, randomness: "altered" }
      : field === "count" ? changed.count + 1
      : field === "kind" ? "ego" : "0".repeat(64);
    const result = G.verifyBatch(changed);
    assert.equal(result.ok, false, field);
    assert.ok(result.reasons.some((reason) => /メタデータ/.test(reason)), field);
  }

  const missingManifest = structuredClone(batch);
  delete missingManifest.integrityHash;
  assert.equal(G.verifyBatch(missingManifest).ok, false, "新形式ではメタデータハッシュが必須");

  const downgrade = structuredClone(batch);
  downgrade.schemaVersion = 1;
  assert.equal(G.verifyBatch(downgrade).ok, false, "バージョンだけを変えても残ったハッシュを検査");

  const legacy = structuredClone(batch);
  legacy.schemaVersion = 1;
  delete legacy.integrityHash;
  assert.equal(G.verifyBatch(legacy).ok, true, "旧形式に読み取り互換性を残す");
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

function loadState(realDb) {
  const source = readFileSync(new URL("../js/state.js", import.meta.url), "utf8");
  const context = {
    window: {
      DB: realDb || { support_passives: [], death_passives: [], spirits: [], items: [] },
      LBT_gacha: G
    },
    console, setTimeout, clearTimeout, URL, TextEncoder, TextDecoder,
    React: { useReducer: () => {}, useRef: () => ({ current: null }), useState: () => [null, () => {}], useEffect: () => {} }
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.window;
}

function loadStateWithoutDrawVerifier(realDb) {
  const source = readFileSync(new URL("../js/state.js", import.meta.url), "utf8");
  const context = {
    window: { DB: realDb || { support_passives: [], death_passives: [], spirits: [], items: [] } },
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
  const { batch } = finalizedBatch();
  const next = w.appReducer({ draws: [], roster: { personas: [], egos: [] } }, { type: "ADD_DRAW_BATCH", batch });
  assert.equal(next.draws.length, 1);
  assert.equal(next.draws[0].batchHash, batch.batchHash);
  assert.equal(next.draws[0].records.length, batch.records.length);
  // 保存後に読み直しても鎖は生きている（移行が記録を書き換えない）。
  const reloaded = w.LBT_normalizeStateShape({ ...next, roster: next.roster || { personas: [], egos: [], supports: [], spirits: [] }, ui: next.ui || {} });
  assert.equal(G.verifyBatch(reloaded.draws[0]).ok, true);
});

/* --- 所持への反映 -------------------------------------------------------
   記録（records）こそが唯一のソース。画面が数えた顔ではなく
   封緘された顔が所持に入る。出所が2つあると片方だけ後から狂う。 */

const base = () => ({
  draws: [],
  entries: [],
  results: [],
  roster: { personas: [], egos: [], supports: [], spirits: [] }
});

test("ADD_DRAW_BATCH は封緘された records から所持へ足す", () => {
  const w = loadState(db);
  const { batch } = finalizedBatch();
  const next = w.appReducer(base(), { type: "ADD_DRAW_BATCH", batch });
  const drawn = batch.records.map((r) => r.item.no);
  assert.equal(next.roster.personas.length, drawn.length, "記録の件数だけ入る");
  assert.deepEqual(j(next.roster.personas.map((p) => p.no).sort((a, b) => a - b)), j(drawn.sort((a, b) => a - b)));
});

test("APPLY_DRAW_BATCH は抽出オブジェクトとログを最新リザルトへ結び付ける", () => {
  const w = loadState(db);
  const { batch } = finalizedBatch();
  const before = {
    ...base(),
    results: [
      { id: "latest-result", name: "最新リザルト", date: "2026-10-26", createdAt: 200, income: { lp: 1000, shards: 100 } },
      /* セッション日付が古いレコードが配列末尾にあっても、作成時刻だけで最新扱いしない。 */
      { id: "older-result", name: "前のリザルト", date: "2026-10-25", createdAt: 900, income: { lp: 1000, shards: 100 } }
    ]
  };
  const cost = batch.records.reduce((total, record) => ({
    lp: total.lp + (Number(record.cost?.lp) || 0),
    shards: total.shards + (Number(record.cost?.shards) || 0)
  }), { lp: 0, shards: 0 });

  const resultId = w.LBT_latestResultId(before);
  assert.equal(resultId, "latest-result", "表示の「新しい順」で先頭になるリザルトを選ぶ（配列末尾とは限らない）");
  const applied = w.appReducer(before, {
    type: "APPLY_DRAW_BATCH",
    batch,
    cost,
    resultId
  });
  const objectEntries = applied.entries.filter((entry) => entry.ref?.kind === "rosterPersona" || entry.ref?.kind === "rosterEgo");
  assert.equal(objectEntries.length, batch.records.length, "抽出した各オブジェクトに取得明細ができる");
  assert.ok(objectEntries.every((entry) => entry.resultId === "latest-result"),
    "全取得オブジェクトの明細が、前のリザルトではなく最新リザルトへ付く");

  const logged = w.appReducer(applied, {
    type: "ADD_DRAW_RECORD",
    __sealed: true,
    batch,
    entry: { id: "draw-log-latest-result", resultId }
  });
  assert.equal(logged.draws.length, 1, "抽出証明を保存する");
  assert.equal(logged.gachaLog[0]?.resultId, "latest-result", "抽出ログも同じリザルトへの帰属を保持する");
});

test("抽出リストに残るのに取得明細が欠落した旧抽選を、抽選時点の最新リザルトへ復元する", () => {
  const w = loadState(db);
  const { batch } = finalizedBatch();
  const record = batch.records.find((item) => item.kind === "persona" && !item.duplicate);
  assert.ok(record, "復元する未重複の人格抽選がある");
  const persona = db.normal_personas.find((item) => String(item.no) === String(record.item.no));
  assert.ok(persona, "DBから正規名を引ける");
  const logAt = Date.now();
  const drawDate = new Date(logAt).toISOString().slice(0, 10);
  const oldDate = new Date(logAt - 86400000).toISOString().slice(0, 10);
  const before = {
    ...base(),
    results: [
      { id: "result-at-draw", name: "抽選時点の最新リザルト", date: drawDate, createdAt: logAt - 2000, income: { lp: 500, shards: 0 } },
      { id: "res-initial", name: "初期作成", date: oldDate, createdAt: logAt - 60000, income: { lp: 30, shards: 0 } }
    ],
    roster: {
      personas: [{ uid: "restored-persona-uid", mode: "n", no: record.item.no }],
      egos: [], supports: [], spirits: []
    },
    draws: [batch],
    gachaLog: [{ id: batch.commit, commit: batch.commit, at: new Date(logAt).toISOString(), resultId: "res-initial" }]
  };

  const restored = w.LBT_normalizeStateShape(before);
  const linked = restored.entries.filter((entry) =>
    entry.ref?.kind === "rosterPersona" && entry.ref.uid === "restored-persona-uid" && entry.kind === "persona");
  assert.equal(linked.length, 1, "封緘済み抽選リストから欠落した取得明細を1件だけ復元");
  assert.equal(linked[0].resultId, "result-at-draw", "今の最新ではなく抽選時点に存在した最新へ結ぶ");
  assert.equal(linked[0].name, persona.name, "DBの正規名で復元");
  assert.equal(linked[0].cost.lp, Number(record.cost.lp) || 0);
  assert.equal(linked[0].cost.shards, Number(record.cost.shards) || 0);
  assert.equal(restored.gachaLog[0].resultAttributionRepairVersion, 2);
  assert.equal(G.verifyBatch(restored.draws[0]).ok, true, "抽選証明本体を変更しない");

  const reloaded = w.LBT_normalizeStateShape(restored);
  assert.equal(reloaded.entries.filter((entry) =>
    entry.ref?.kind === "rosterPersona" && entry.ref.uid === "restored-persona-uid" && entry.kind === "persona").length, 1,
  "再読み込みしても明細を増殖させない");
});

test("復元対象と一致する手動支出があれば、その行を保護して二重計上を防ぐ", () => {
  const w = loadState(db);
  const { batch } = finalizedBatch();
  const record = batch.records.find((item) => item.kind === "persona" && !item.duplicate);
  assert.ok(record, "復元する未重複の人格抽選がある");
  const persona = db.normal_personas.find((item) => String(item.no) === String(record.item.no));
  assert.ok(persona, "DBから正規名を引ける");
  const logAt = Date.now();
  const drawDate = new Date(logAt).toISOString().slice(0, 10);
  const oldDate = new Date(logAt - 86400000).toISOString().slice(0, 10);
  const manualCost = { lp: Number(record.cost.lp) || 0, shards: Number(record.cost.shards) || 0 };
  const manual = {
    id: "manual-expense-preserve",
    kind: "expense",
    name: persona.name,
    cost: manualCost,
    resultId: null,
    ref: null,
    at: logAt + 60000,
    note: "ユーザーが手入力した支出"
  };
  const before = {
    ...base(),
    entries: [manual],
    results: [
      { id: "result-at-draw", name: "抽選時点の最新リザルト", date: drawDate, createdAt: logAt - 2000, income: { lp: 500, shards: 0 } },
      { id: "res-initial", name: "初期作成", date: oldDate, createdAt: logAt - 60000, income: { lp: 30, shards: 0 } }
    ],
    roster: {
      personas: [{ uid: "manual-match-persona-uid", mode: "n", no: record.item.no }],
      egos: [], supports: [], spirits: []
    },
    draws: [batch],
    gachaLog: [{ id: batch.commit, commit: batch.commit, at: new Date(logAt).toISOString(), resultId: "res-initial" }]
  };

  const restored = w.LBT_normalizeStateShape(before);
  const keptManual = restored.entries.find((entry) => entry.id === "manual-expense-preserve");
  const linked = restored.entries.find((entry) =>
    entry.ref?.kind === "rosterPersona" && entry.ref.uid === "manual-match-persona-uid" && entry.kind === "persona");
  assert.ok(keptManual, "手動支出を消さない");
  assert.equal(keptManual.resultId, null, "手動明細の帰属を勝手に変更しない");
  assert.equal(keptManual.note, "ユーザーが手入力した支出", "ユーザーの説明を保護");
  assert.equal(keptManual.cost.lp, manualCost.lp);
  assert.equal(keptManual.cost.shards, manualCost.shards);
  assert.ok(linked, "獲得オブジェクトそのものは最新リザルトに復元する");
  assert.equal(linked.resultId, "result-at-draw");
  assert.equal(linked.cost.lp, 0, "一致する手動支出がある場合はLPを再計上しない");
  assert.equal(linked.cost.shards, 0, "一致する手動支出がある場合は欠片を再計上しない");

  const balanceOnce = w.LBT_computeLedgerBalance(restored.results, restored.entries);
  const reloaded = w.LBT_normalizeStateShape(restored);
  const balanceTwice = w.LBT_computeLedgerBalance(reloaded.results, reloaded.entries);
  assert.equal(reloaded.entries.length, restored.entries.length, "繰り返し読み込みで明細が増えない");
  assert.equal(balanceTwice.spentLp, balanceOnce.spentLp, "再読み込みで支出合計が増えない");
  assert.equal(balanceTwice.spentShards, balanceOnce.spentShards, "再読み込みで欠片支出合計が増えない");
});

test("旧抽出の誤帰属は、ログIDがある場合も無い場合も安全に補正する", () => {
  const w = loadState(db);
  const { batch } = finalizedBatch();
  const logAt = Date.now();
  const cost = batch.records.reduce((total, record) => ({
    lp: total.lp + (Number(record.cost?.lp) || 0),
    shards: total.shards + (Number(record.cost?.shards) || 0)
  }), { lp: 0, shards: 0 });

  for (const withResultId of [true, false]) {
    const before = {
      ...base(),
      results: [
        { id: "visible-latest", name: "画面上の最新", date: "2026-10-26", createdAt: logAt - 5000, income: { lp: 1000, shards: 100 } },
        { id: "array-tail-old", name: "配列末尾の古い記録", date: "2026-10-25", createdAt: logAt - 10000, income: { lp: 1000, shards: 100 } }
      ]
    };
    const log = {
      id: batch.commit, commit: batch.commit, at: new Date(logAt).toISOString(),
      ...(withResultId ? { resultId: "array-tail-old" } : {})
    };
    const applied = w.appReducer(before, {
      type: "ADD_DRAW_BATCH", batch, cost, resultId: "array-tail-old", entry: log
    });
    assert.ok(applied.entries.some((entry) => entry.resultId === "array-tail-old" && entry.ref?.kind === "rosterPersona"),
      "補正前は、旧ロジックと同じ誤ったリザルトに明細が付いている");

    const restored = w.LBT_normalizeStateShape({ ...applied, ui: {} });
    const objectEntries = restored.entries.filter((entry) => entry.ref?.kind === "rosterPersona" || entry.ref?.kind === "rosterEgo");
    assert.equal(objectEntries.length, batch.records.length);
    assert.ok(objectEntries.every((entry) => entry.resultId === "visible-latest"),
      "抽出オブジェクトの明細を画面上の最新リザルトへ補正する");
    assert.equal(restored.gachaLog[0].resultId, "visible-latest",
      withResultId ? "既存の抽選ログの帰属を補正する" : "resultId のない旧ログにも帰属を補完する");
    assert.equal(restored.gachaLog[0].resultAttributionRepairVersion, 2, "同じ履歴へ繰り返し適用しない");
    assert.equal(G.verifyBatch(restored.draws[0]).ok, true, "封緘バッチのハッシュ鎖は変更しない");
  }
});

test("所持への反映は 1件ごとに、その件が文書どおり払った額だけ引く", () => {
  const w = loadState(db);
  /* finalizedBatch は「1件は所持済み」で始まるので全件100LP。
     ここでは未所持から始めて、1回目が無料・以降100LP を見る。 */
  const { batch } = finalizedBatch();
  assert.equal(batch.records.length, 3, "3件のはず");
  const next = w.appReducer(base(), { type: "ADD_DRAW_BATCH", batch });
  const byName = new Map(next.entries.map((e) => [e.name, e.cost]));
  assert.equal(byName.size, 3, "明細も1件ずつ");
  const costs = batch.records.map((r) => byName.get(db.normal_personas.find((p) => p.no === r.item.no)?.name)?.lp);
  assert.deepEqual(j(costs), [100, 100, 100], "所持済みなら全部100LP");
  const total = next.entries.reduce((n, e) => n + (Number(e.cost?.lp) || 0), 0);
  assert.equal(total, batch.records.reduce((n, r) => n + (Number(r.cost?.lp) || 0), 0), "明細の合計＝記録の合計");
});

test("未所持なら 1件目の請求は0になる（バッチ全体で1つの金額にしない）", () => {
  const w = loadState(db);
  const session = G.createSession({ serverSeed: "first-free", clientSeed: "p" });
  const out = gacha.drawBatch({
    session, kind: "persona", owned: { personas: [], specialPersonas: [], egos: [] },
    lp: 1000, count: 2
  });
  const batch = G.finalizeBatch(out, session, { rulesetHash: gacha.rulesetHash });
  const next = w.appReducer(base(), { type: "ADD_DRAW_BATCH", batch });
  const byName = new Map(next.entries.map((e) => [e.name, e.cost?.lp]));
  const costs = batch.records.map((r) => byName.get(db.normal_personas.find((p) => p.no === r.item.no)?.name));
  assert.deepEqual(j(costs), [0, 100], "1回目は無料、2回目は100LP");
  assert.equal(next.entries.reduce((n, e) => n + (Number(e.cost?.lp) || 0), 0), 100, "合計も100LP");
});

test("旧形式で item.kind が欠けても record.kind から人格/E.G.O 所持を復元する", () => {
  const w = loadState(db);
  const persona = db.normal_personas.find((entry) => Number(entry.no) > 0);
  const ego = db.egos.find((entry) => Number(entry.no) > 0);
  assert.ok(persona && ego, "テスト用の人格とE.G.Oがある");
  const moneyState = () => ({
    ...base(),
    results: [{
      id: "legacy-kind-result",
      name: "旧記録互換テスト",
      income: { lp: 100, shards: 100 },
      exchange: { lp: 0, shards: 0 },
      note: ""
    }]
  });
  const personaBatch = {
    schemaVersion: 1, ruleset: "core", kind: "persona", count: 1,
    commit: "legacy-persona-kind", batchHash: "legacy-persona-kind-hash",
    records: [{
      index: 0, kind: "persona",
      item: { no: Number(persona.no), mode: "n", name: persona.name },
      cost: { lp: 20, shards: 0 }, duplicate: false, grantedShards: 0
    }]
  };
  const personaState = w.appReducer(moneyState(), { type: "ADD_DRAW_BATCH", batch: personaBatch, cost: { lp: 20, shards: 0 } });
  assert.ok(personaState.roster.personas.some((entry) => Number(entry.no) === Number(persona.no) && entry.mode === "n"));
  assert.ok(personaState.entries.some((entry) => entry.name === persona.name && Number(entry.cost?.lp) === 20));
  const egoBatch = {
    schemaVersion: 1, ruleset: "core", kind: "ego", count: 1,
    commit: "legacy-ego-kind", batchHash: "legacy-ego-kind-hash",
    records: [{
      index: 0, kind: "ego",
      item: { no: Number(ego.no), rank: ego.rank, name: ego.name },
      cost: { lp: 0, shards: 25 }, duplicate: false, grantedShards: 0
    }]
  };
  const egoState = w.appReducer(moneyState(), { type: "ADD_DRAW_BATCH", batch: egoBatch, cost: { lp: 0, shards: 25 } });
  assert.ok(egoState.roster.egos.some((entry) => Number(entry.no) === Number(ego.no) && entry.rank === ego.rank));
  assert.ok(egoState.entries.some((entry) => entry.name === `${ego.rank} No.${ego.no}` && Number(entry.cost?.shards) === 25));
});

test("抽選レコードのno・人格モード・E.G.Oランクの不正値を確定前に拒否する", () => {
  const w = loadState(db);
  const makeBatch = (kind, item) => ({
    kind, count: 1, batchHash: "invalid-shape-" + kind,
    records: [{ kind, item, cost: { lp: 0, shards: 0 }, duplicate: false, grantedShards: 0 }]
  });
  for (const no of [0, -1, 1.5, "abc", "0", "1.5"]) {
    assert.equal(w.LBT_validateDrawBatchApplication(base(), { type: "ADD_DRAW_BATCH", batch: makeBatch("persona", { kind: "persona", no, mode: "n" }) }).reason, "invalid-persona-item", String(no));
  }
  assert.equal(w.LBT_validateDrawBatchApplication(base(), { type: "ADD_DRAW_BATCH", batch: makeBatch("persona", { kind: "persona", no: 1, mode: "t" }) }).reason, "invalid-persona-mode");
  assert.equal(w.LBT_validateDrawBatchApplication(base(), { type: "ADD_DRAW_BATCH", batch: makeBatch("ego", { kind: "ego", no: 1, rank: "INVALID" }) }).reason, "invalid-ego-item");
});


test("schema v2 の改変済みバッチは所持・通帳へ適用しない", () => {
  const w = loadState(db);
  const { batch } = finalizedBatch();
  const tampered = structuredClone(batch);
  tampered.records[0].item.name = "改変された抽選対象";

  const result = w.LBT_validateDrawBatchApplication(base(), { type: "ADD_DRAW_BATCH", batch: tampered });
  assert.equal(result.ok, false, "record の改変は確定前に拒否する");
  assert.equal(result.reason, "invalid-batch-proof");
  const next = w.appReducer(base(), { type: "ADD_DRAW_BATCH", batch: tampered });
  assert.equal(next.draws.length, 0, "改変バッチを抽選証明へ保存しない");
  assert.equal(next.roster.personas.length, 0, "改変バッチを所持へ反映しない");
  assert.equal(next.entries.length, 0, "改変バッチの支出も記録しない");
});

test("schema v2 は検証器が無い環境で適用しない一方、schema v1 の互換性を保つ", () => {
  const w = loadState(db);
  const { batch } = finalizedBatch();
  const withoutVerifier = loadStateWithoutDrawVerifier(db);
  const result = withoutVerifier.LBT_validateDrawBatchApplication(base(), { type: "ADD_DRAW_BATCH", batch });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "draw-proof-verifier-unavailable");

  const legacy = {
    schemaVersion: 1, ruleset: "core", kind: "persona", count: 1,
    commit: "legacy-persona-kind", batchHash: "legacy-persona-kind-hash",
    records: [{
      index: 0, kind: "persona", item: { no: 999, mode: "n" },
      cost: { lp: 0, shards: 0 }, duplicate: false, grantedShards: 0
    }]
  };
  const legacyResult = w.LBT_validateDrawBatchApplication(base(), { type: "ADD_DRAW_BATCH", batch: legacy });
  assert.equal(legacyResult.ok, true, "旧形式の既存契約は維持する");
});

test("ADD_DRAW_BATCH は同じ内容を二重に入れない", () => {
  const w = loadState(db);
  const { batch } = finalizedBatch();
  const once = w.appReducer(base(), { type: "ADD_DRAW_BATCH", batch });
  const twice = w.appReducer(once, { type: "ADD_DRAW_BATCH", batch });
  assert.equal(twice.roster.personas.length, once.roster.personas.length, "所持は増えない");
  assert.equal(twice.entries.length, once.entries.length, "明細も増えない");
});
test("テーマパック: DBに人格がある項目は所持へ入り、無いものは通帳だけ", () => {
  const w = loadState(db);
  const pack = gacha.findPack("属せない＆愛することのできない");
  const dbNames = new Set(db.normal_personas.map((p) => p.name));
  const inDb = pack.entries.find((e) => dbNames.has(e.name));
  const notInDb = pack.entries.find((e) => !dbNames.has(e.name));
  assert.ok(inDb, "DBに人物が混ざっている（1件だけの検証にならない）");
  assert.ok(notInDb, "専用人物（DBに無い）も混ざっている");

  /* 出目を決めない座谈: 1回目をDB有、2回目をDB無に固定する。 */
  const session = scripted([pack.entries.indexOf(inDb) + 1, pack.entries.indexOf(notInDb) + 1]);
  const out = gacha.drawBatch({ session, kind: "themePack", pack, heldNames: new Set(), lp: pack.lp * 2, count: 2 });
  const batch = G.finalizeBatch(out, session, { rulesetHash: gacha.rulesetHash });
  /* scripted() は実際のseed/rollsを再現しないテストダブルのため、
     ここでは適用処理の検証用に legacy 形式として固定する。 */
  batch.schemaVersion = 1;
  delete batch.integrityHash;
  const next = w.appReducer(base(), { type: "ADD_DRAW_BATCH", batch });

  assert.equal(next.roster.personas.length, 1, "DBにある1件だけ所持へ入る");
  assert.equal(next.roster.personas[0].no, Number(db.normal_personas.find((p) => p.name === inDb.name).no));
  /* DBに無い項目は記録と支払いが残る（破棄しない）。 */
  assert.equal(next.draws.length, 1);
  assert.equal(batch.records.length, 2);
  /* 記録1件につき通帳1行。所持に入った方は persona 行、
     入らなかった方は 特定抽出パック の消費行。 */
  assert.equal(next.entries.length, 2, "記録2件＝通帳2行");
  const entryForPackOnly = next.entries.find((e) => e.name.includes("特定抽出パック"));
  assert.ok(entryForPackOnly, "所持へ入らなかった分が消費として残る");
  assert.ok(entryForPackOnly.name.includes(notInDb.name), "どの項目だったかが名前に残る");
  assert.equal(entryForPackOnly.cost.lp, pack.lp);
  const entryForOwned = next.entries.find((e) => e.name === inDb.name);
  assert.ok(entryForOwned, "所持へ入った人格が人格行で残る");
  assert.equal(entryForOwned.cost.lp, pack.lp);
  assert.equal(next.entries.reduce((n, e) => n + (Number(e.cost?.lp) || 0), 0), pack.lp * 2, "合計は記録と一致");
});

test("テーマパック: 重複でも1回ぶんを請求し、欠片50は収入に積む", () => {
  const w = loadState(db);
  const pack = gacha.findPack("属せない＆愛することのできない");
  const session = scripted([1, 1, 2]);
  const out = gacha.drawBatch({
    session, kind: "themePack", pack, heldNames: new Set(),
    lp: pack.lp * 3, count: 3
  });
  const batch = G.finalizeBatch(out, session, { rulesetHash: gacha.rulesetHash });
  /* scripted() は実際の seed/rolls を再現しないテストダブルなので、ここでは
     重複報酬と帳簿処理だけを検証する legacy 形式として扱う。 */
  batch.schemaVersion = 1;
  delete batch.integrityHash;
  const dupes = batch.records.filter((r) => r.duplicate);
  assert.equal(dupes.length, 1, "2回目が重複");
  assert.equal(dupes[0].grantedShards, 50, "重複は欠片50");
  const before = { ...base(), results: [{ id: "r1", income: { lp: pack.lp * 3, shards: 0 } }] };
  const next = w.appReducer(before, { type: "ADD_DRAW_BATCH", batch });
  /* roster.personas は名前を持たない（{uid,no,mode,…}）ので、
     重複の判定は mode:no で行う。名前で引くと必ず外れて嘘が出る。 */
  const keys = new Set(next.roster.personas.map((p) => `${p.mode}:${p.no}`));
  assert.equal(keys.size, next.roster.personas.length, "所持に重複がない");
  /* 重複でも1回ぶんなら請求する。記録（重複含む）の合計と通帳の合計が一致する。 */
  const spentLp = next.entries.reduce((n, e) => n + (Number(e.cost?.lp) || 0), 0);
  const recordLp = batch.records.reduce((n, r) => n + (Number(r.cost?.lp) || 0), 0);
  assert.equal(spentLp, recordLp, "通帳の合計＝記録の合計（重複分も払う）");
  /* 人格に入った分＋入らなかった分＋重複1件。 */
  assert.equal(next.entries.length, 3, "重複も1行として残る");
  /* 重複の欠片50は支出でなく収入側（リザルト）へ入り、支出合計を狂わせない。 */
  const shards = next.results.reduce((n, r) => n + (Number(r.income?.shards) || 0), 0);
  assert.equal(shards, 50, "重複1件で欠片50が収入になる");
});

/* --- 画面が実際に通る道（LBT_gachaDraw.drawN）---------------------------
   engine 単体ではなく、ショップの「ガチャ」タブが呼ぶ入口を検査する。
   ここが封緘を返さないと、抽出リストは何も増えない。 */

function loadDraw() {
  const context = { window: {}, console, crypto: globalThis.crypto, TextEncoder, TextDecoder };
  context.window.crypto = globalThis.crypto;
  context.globalThis = context;
  vm.createContext(context);
  for (const file of ["gacha.js", "gacha-tickets.js"]) {
    vm.runInContext(readFileSync(new URL("../js/" + file, import.meta.url), "utf8"), context, { filename: file });
  }
  context.window.DB = db;
  context.window.LBT_GACHA_PACKS = themePacks;
  context.window.LBT_computeLedgerBalance = () => context.window.__balance;
  context.window.LBT_computeTicketBalance = () => context.window.__tickets;
  return context.window;
}

const appState = (over) => ({
  results: [], entries: [], draws: [], gachaLog: [],
  roster: { personas: [], egos: [], supports: [], spirits: [] },
  ...over
});

test("人格抽選の最大出目は特異人格へ分岐し、所持・費用段階・通帳へ反映する", () => {
  const drawer = loadDraw();
  drawer.__balance = { lp: 100, shards: 0 };
  const session = {
    rolls: 0,
    roll(max) {
      this.rolls += 1;
      if (this.rolls === 1) return max; // 人格プールの最大+1 = 特異人格へ分岐
      if (this.rolls === 2) return 1;   // 特異人格の先頭
      return 2;                         // 次の通常人格（所持品が更新された状態）
    }
  };
  const state = appState({
    results: [{ id: "r-special", name: "検証シナリオ", income: { lp: 100, shards: 0 } }]
  });
  const out = drawer.LBT_gachaDraw.drawN("persona", state, { pay: "paid", times: 3, session });
  assert.equal(out.hits.length, 2, "100LPでは無料の初回と、有料の2回目まで");
  assert.equal(out.hits[0].branch, "special", "最大+1の出目は特異人格ルート");
  assert.equal(out.hits[0].mode, "t");
  assert.equal(out.hits[1].mode, "n");
  assert.equal(out.cost.lp, 100, "特異人格を先に引いても2回目から100LPになる");
  assert.equal(out.stopped, "insufficientLP", "同一バッチ内で価格段階が更新される");
  const [rawSpecial, rawNormal] = out.engineOut.results;
  assert.equal(rawSpecial.kind, "specialPersona");
  assert.equal(rawSpecial.item.kind, "specialPersona");
  assert.equal(rawSpecial.cost.lp, 0);
  assert.equal(rawNormal.cost.lp, 100);

  const w = loadState(db);
  const batch = {
    schemaVersion: 1,
    ruleset: "core",
    kind: "persona",
    count: 2,
    commit: "special-persona-test-commit",
    batchHash: "special-persona-test-batch",
    records: out.engineOut.results.map((raw, index) => ({
      index, kind: raw.kind, method: "draw", item: raw.item,
      cost: raw.cost, duplicate: false, grantedShards: 0,
      prev: index ? "special-persona-prev" : G.GENESIS_HASH, hash: `fixture-${index}`
    }))
  };
  const before = {
    ...base(),
    results: [{ id: "r-special", name: "検証シナリオ", income: { lp: 100, shards: 0 } }]
  };
  const after = w.appReducer(before, { type: "ADD_DRAW_BATCH", batch });
  assert.ok(after.roster.personas.some((p) => p.no === rawSpecial.item.no && p.mode === "t"),
    "特異人格が mode=t として所持へ入る");
  assert.ok(after.roster.personas.some((p) => p.no === rawNormal.item.no && p.mode === "n"),
    "通常人格も通常モードで所持へ入る");
  assert.equal(after.entries.reduce((sum, entry) => sum + (Number(entry.cost?.lp) || 0), 0), 100,
    "通帳の費用合計が封緘レコードの100LPと一致する");
  const ledger = after.entries.find((entry) => entry.name === rawSpecial.item.name && entry.ref?.kind === "rosterPersona");
  assert.ok(ledger, "特異人格の取得明細が残る");
  assert.equal(ledger.cost.lp, 0, "特異人格は実際の初回費用0LPで記録される");
});

test("drawN（通貨）: 残LPで回数が決まる。返した出目はそのまま封緘できる", () => {  const w = loadDraw();
  w.__balance = { lp: 100, shards: 0 };
  const out = w.LBT_gachaDraw.drawN("persona", appState(), { pay: "paid", times: 3, seed: "ui-seed-1" });
  /* 未所持なので1回目は無料、2回目は100LPで残りが尽きる。 */
  assert.equal(out.drawn, 2, "引けたのは2回");
  assert.equal(out.requested, 3, "3回頼んだ");
  assert.equal(out.stopped, "insufficientLP", "足りなくなった理由が返る");
  assert.equal(out.hits.length, out.engineOut.results.length, "画面に出る顔と記録の件数が一致する");

  const batch = w.LBT_gachaDraw.sealBatch(out);
  assert.ok(batch && Array.isArray(batch.records), "封緘できる");
  assert.equal(batch.records.length, 2);
  assert.ok(batch.batchHash && batch.commit && batch.rulesetHash, "錨が揃う");
  assert.equal(w.LBT_gachaDraw.verifyBatch(batch).ok, true, "そのまま検証を通る");
});

test("drawN（通貨）: 途中で止まっても引けたぶんは検証できる（残りを黙って落とさない）", () => {
  const w = loadDraw();
  w.__balance = { lp: 0, shards: 0 };
  const out = w.LBT_gachaDraw.drawN("persona", appState(), { pay: "paid", times: 5, seed: "ui-seed-2" });
  assert.equal(out.drawn, 1, "1回目だけ引ける");
  assert.equal(out.stopped, "insufficientLP");
  const batch = w.LBT_gachaDraw.sealBatch(out);
  assert.equal(batch.records.length, 1);
  assert.equal(w.LBT_gachaDraw.verifyBatch(batch).ok, true);
});

test("drawN（E.G.O）: 残欠片で止まり、100欠片ずつで記録される", () => {
  const w = loadDraw();
  w.__balance = { lp: 0, shards: 250 };
  const out = w.LBT_gachaDraw.drawN("ego", appState(), { pay: "paid", times: 5, seed: "ui-seed-3" });
  assert.equal(out.drawn, 2);
  assert.equal(out.stopped, "insufficientShards");
  assert.equal(out.cost.shards, 200);
  const batch = w.LBT_gachaDraw.sealBatch(out);
  assert.equal(batch.records.length, 2);
  assert.deepEqual(j(batch.records.map((r) => r.cost.shards)), [100, 100]);
  assert.equal(w.LBT_gachaDraw.verifyBatch(batch).ok, true);
});

test("drawN（チケット）: 無料のまま、同じ1本の鎖に載る", () => {
  const w = loadDraw();
  w.__balance = { lp: 0, shards: 0 };
  w.__tickets = { persona: 2, ego: 0, choice: 0, pack: {} };
  const out = w.LBT_gachaDraw.drawN("persona", appState(), { pay: "ticket", times: 5, seed: "ui-seed-4" });
  assert.equal(out.drawn, 2, "残数の2枚だけ");
  assert.equal(out.stopped, "insufficientTickets");
  assert.equal(out.cost.lp, 0);
  assert.equal(out.cost.shards, 0, "チケットは支出ではない");
  const batch = w.LBT_gachaDraw.sealBatch(out);
  assert.equal(batch.records.length, 2);
  assert.deepEqual(j(batch.records.map((r) => r.cost)), [{ lp: 0, shards: 0 }, { lp: 0, shards: 0 }]);
  assert.equal(w.LBT_gachaDraw.verifyBatch(batch).ok, true, "経路が違っても検証は同じ1つ");
});

test("drawN（選択抽出チケット）: 人格・E.G.Oルートで共通チケットを消費できる", () => {
  const w = loadDraw();
  w.__balance = { lp: 0, shards: 0 };
  w.__tickets = { persona: 0, ego: 0, choice: 2, pack: {} };
  const out = w.LBT_gachaDraw.drawN("persona", appState(), {
    pay: "ticket", ticketKind: "choice", times: 1, seed: "choice-ticket-seed"
  });
  assert.equal(out.ticketKind, "choice");
  assert.equal(out.drawn, 1);
  assert.equal(out.cost.lp, 0);
  assert.equal(out.cost.shards, 0);
  const batch = w.LBT_gachaDraw.sealBatch(out);
  assert.equal(batch.ruleset, "core-ticket");
  assert.equal(batch.kind, "persona");
  assert.ok(batch.records.every((record) => record.method === "ticket"));
  assert.equal(w.LBT_gachaDraw.verifyBatch(batch).ok, true);
});

test("テーマパックは所持レコードの No から名前を引き、重複時に欠片50へ変換する", () => {
  const w = loadDraw();
  const pack = themePacks.packs.find((item) => item.name === "属せない＆愛することのできない");
  const ownedPersona = db.normal_personas.find((persona) => persona.name === "旧G社兵士");
  assert.ok(pack && ownedPersona, "fixture pack/persona exists");
  w.__balance = { lp: pack.lp, shards: 0 };
  const state = appState({
    results: [{ id: "owned-pack-test", name: "所持テスト", income: { lp: pack.lp, shards: 0 } }],
    roster: {
      personas: [{ uid: "old-g-persona", mode: "n", no: Number(ownedPersona.no), equipped: false }],
      egos: [], supports: [], spirits: []
    }
  });
  const session = { roll: () => 1 };
  const out = w.LBT_gachaDraw.drawN("pack", state, {
    pay: "paid", pack: pack.name, times: 1, session
  });
  assert.equal(out.engineOut.results[0].item.name, "旧G社兵士");
  assert.equal(out.engineOut.results[0].duplicate, true, "所持には name が無くても No から重複判定する");
  assert.equal(out.engineOut.results[0].grantedShards, 50);
  assert.equal(out.cost.lp, pack.lp, "重複でもパックの価格は記録される");
});

test("テーマパックの抽選証明はパック名までハッシュで固定する", () => {
  const pack = themePacks.packs[0];
  const session = G.createSession({ serverSeed: "proof-pack-seed", clientSeed: "auditor" });
  const out = gacha.drawBatch({
    session, kind: "themePack", pack, heldNames: new Set(), lp: pack.lp, count: 1
  });
  const batch = G.finalizeBatch(out, session, { ruleset: "core", rulesetHash: gacha.rulesetHash });
  assert.equal(batch.records[0].pack, pack.name);
  assert.equal(G.verifyBatch(batch).ok, true);
  const altered = structuredClone(batch);
  altered.records[0].pack = "別のパック";
  assert.equal(G.verifyBatch(altered).ok, false, "同じアイテム名でも抽選プールの出所を差し替えられない");
});

test("drawN: 同じ種なら確認画面で出目が変わらない（2段構えの前提）", () => {
  const w = loadDraw();
  w.__balance = { lp: 5000, shards: 5000 };
  const a = w.LBT_gachaDraw.drawN("persona", appState(), { pay: "paid", times: 2, seed: "same-seed" });
  const b = w.LBT_gachaDraw.drawN("persona", appState(), { pay: "paid", times: 2, seed: "same-seed" });
  assert.deepEqual(a.hits.map((x) => x.no), b.hits.map((x) => x.no), "種が同じなら同じ顔");
  assert.equal(a.commit, b.commit, "commitも同じ");
});

test("drawN: 1バッチ内で同じ人格を2度引かない", () => {
  const w = loadDraw();
  w.__balance = { lp: 100000, shards: 0 };
  const out = w.LBT_gachaDraw.drawN("persona", appState(), { pay: "paid", times: 8, seed: "dupe-check" });
  const nos = out.hits.map((x) => x.no);
  assert.equal(new Set(nos).size, nos.length, "重複なし");
});


test("抽選証明の検証は空バッチ・不正レコードを安全に不合格にする", () => {
  const { batch } = finalizedBatch();
  const malformed = structuredClone(batch);
  malformed.records[1] = null;
  const malformedResult = G.verifyBatch(malformed);
  assert.equal(malformedResult.ok, false);
  assert.ok(malformedResult.reasons.some((reason) => /records\[1\]/.test(reason)),
    "不正レコードの位置を理由へ含める");
  
  const empty = structuredClone(batch);
  empty.records = [];
  empty.count = 0;
  empty.batchHash = G.GENESIS_HASH;
  const emptyResult = G.verifyBatch(empty);
  assert.equal(emptyResult.ok, false, "シードが正しくても0件のバッチは抽選証明として合格させない");
  assert.ok(emptyResult.reasons.some((reason) => /空/.test(reason)));
  
  const noHash = structuredClone(batch);
  delete noHash.batchHash;
  const noHashResult = G.verifyBatch(noHash);
  assert.equal(noHashResult.ok, false);
  assert.ok(noHashResult.reasons.some((reason) => /バッチハッシュ/.test(reason)));
});

test("抽選レコード数よりロール数が少ないバッチは整合性ハッシュを再計算しても拒否する", () => {
  const { batch } = finalizedBatch();
  assert.ok(batch.rolls.length >= batch.records.length, "正常なバッチは各レコードに最低1ロールがある");

  const rehashMetadata = (candidate) => {
    candidate.integrityHash = G.contentHash({
      schemaVersion: candidate.schemaVersion,
      ruleset: candidate.ruleset ?? null,
      rulesetHash: candidate.rulesetHash ?? null,
      kind: candidate.kind ?? null,
      count: candidate.count,
      commit: candidate.commit,
      serverSeed: candidate.serverSeed,
      clientSeed: candidate.clientSeed,
      rolls: candidate.rolls,
      beacon: candidate.beacon ?? null,
      batchHash: candidate.batchHash
    });
  };

  for (const rolls of [[], batch.rolls.slice(0, Math.max(0, batch.records.length - 1))]) {
    const truncated = structuredClone(batch);
    truncated.rolls = rolls;
    rehashMetadata(truncated);
    const result = G.verifyBatch(truncated);
    assert.equal(result.ok, false, "メタデータハッシュを再計算しても不足ロールは拒否");
    assert.ok(result.reasons.some((reason) => /ロール数/.test(reason)), result.reasons.join(" / "));
  }
});
