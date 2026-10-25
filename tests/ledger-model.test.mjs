import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

/* ---------------------------------------------------------------------------
   通帳（リザルトと収支明細）の回帰テスト。

   守るべき性質:
     - 残高は保存せず、収入合計 − 支出合計として必ず導出できる
     - 帰属（resultId）を差し替えても明細は消えない
     - リザルトを消しても明細は残る（支出額が失われると残高が狂う）
     - 存在しないリザルトを指す明細は未分類へ戻る
     - 通貨は LP と欠片の2種に揃い、壊れた入力でも計算が壊れない
--------------------------------------------------------------------------- */

const source = readFileSync(new URL("../js/state.js", import.meta.url), "utf8");

function loadContext() {
  const context = {
    window: {
      DB: {
        support_passives: [],
        death_passives: [],
        spirits: [],
        normal_enhancements: [],
        special_enhancements: []
      }
    },
    console,
    setTimeout,
    clearTimeout,
    URL,
    TextEncoder,
    TextDecoder,
    React: { useReducer: () => {}, useRef: () => ({ current: null }), useState: () => [null, () => {}], useEffect: () => {} }
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context);
  return context;
}

const context = loadContext();
const reducer = context.window.appReducer;
const balance = context.window.LBT_computeLedgerBalance;
const normalize = context.window.LBT_normalizeStateShape;

function baseState() {
  return {
    supports: [],
    deathSupport: null,
    spirit: "",
    roster: { personas: [], egos: [], supports: [], spirits: [] },
    results: [],
    entries: [],
    ui: {},
    historyRecent: [],
    favorites: []
  };
}

test("旧LP換算記録は通常の支出明細と欠片収入へ一度だけ移行する", () => {
  const legacy = {
    ...baseState(),
    results: [{
      id: "legacy-exchange",
      name: "旧リザルト",
      date: "2026-10-01",
      income: { lp: 100, shards: 5 },
      exchange: { lp: 8, shards: 4 },
      note: ""
    }],
    entries: []
  };
  const migrated = normalize(legacy);
  const result = migrated.results.find((item) => item.id === "legacy-exchange");
  assert.ok(result);
  assert.equal(result.income.shards, 9, "旧換算で得た4欠片を収入へ移す");
  assert.equal(Object.hasOwn(result, "exchange"), false, "移行後は旧交換フィールドを持たない");
  const entry = migrated.entries.find((item) => item.name === "旧記録：LPから自我の欠片を交換");
  assert.ok(entry, "LP支出を通常の明細として残す");
  assert.equal(entry.cost.lp, 8);
  assert.equal(entry.cost.shards, 0);
  assert.equal(entry.resultId, "legacy-exchange");
  const again = normalize(migrated);
  assert.equal(again.results.find((item) => item.id === "legacy-exchange").income.shards, 9, "再読込で欠片収入を重複計上しない");
  assert.equal(again.entries.filter((item) => item.name === "旧記録：LPから自我の欠片を交換").length, 1, "再読込で支出明細を重複生成しない");
  assert.equal(balance(again.results, again.entries).spentLp, 8);
});

test("リザルト UI からLP→欠片の変換欄と変換ヘルパーを撤去する", () => {
  const ui = readFileSync(new URL("../js/OtherSections.js", import.meta.url), "utf8");
  const provenance = readFileSync(new URL("../js/ledger-provenance.js", import.meta.url), "utf8");
  assert.doesNotMatch(ui, /ExchangeInputs|shardExchangeOf|LBT_shardExchange|LP→欠片/);
  assert.doesNotMatch(provenance, /LP_TO_SHARD|LBT_shardExchange|shardExchange/);
});

test("リザルトを加えると収入が保存され、残高反映される", () => {
  let s = reducer(baseState(), { type: "ADD_RESULT", name: "第12回", date: "2026-10-11", income: { lp: 1200, shards: 400 } });
  assert.equal(s.results.length, 1);
  assert.equal(s.results[0].income.lp, 1200);
  assert.equal(balance(s.results, s.entries).lp, 1200, "収入そのままが残高");
  assert.equal(balance(s.results, s.entries).shards, 400);
});

test("支出明細は収入から差し引く（LP と 欠片を別口座で扱う）", () => {
  let s = reducer(baseState(), { type: "ADD_RESULT", name: "第12回", income: { lp: 1200, shards: 400 } });
  s = reducer(s, { type: "ADD_ENTRY", kind: "support", name: "ルサンチマン", cost: { lp: 7 } });
  s = reducer(s, { type: "ADD_ENTRY", kind: "enhancement", name: "肉体強化0-1", cost: { shards: 5 } });
  const b = balance(s.results, s.entries);
  assert.equal(b.lp, 1193, "LP は 7 減る");
  assert.equal(b.shards, 395, "欠片は 5 減る");
  assert.equal(b.spentLp, 7);
  assert.equal(b.spentShards, 5);
});

test("帰属の差し替えだけで、連載ごとの収支が変わる（明細は消えない）", () => {
  let s = reducer(baseState(), { type: "ADD_RESULT", name: "A", income: { lp: 1000, shards: 0 } });
  const aId = s.results[0].id;
  s = reducer(s, { type: "ADD_RESULT", name: "B", income: { lp: 1000, shards: 0 } });
  const bId = s.results[1].id;

  s = reducer(s, { type: "ADD_ENTRY", kind: "item", name: "包帯", cost: { lp: 15 }, resultId: aId });
  const entryId = s.entries[0].id;
  assert.equal(balance(s.results, s.entries).lp, 1985);

  /* ドラッグ&ドロップはこの1つだけを呼ぶ。 */
  s = reducer(s, { type: "SET_ENTRY_RESULT", id: entryId, resultId: bId });
  assert.equal(s.entries.length, 1, "明細は消えない");
  assert.equal(s.entries[0].resultId, bId);
  assert.equal(balance(s.results, s.entries).lp, 1985, "残高は変わらない（支出は起きたまま）");
});

test("未分類の明細は件数が分かる（帰属し忘れに気付ける）", () => {
  let s = reducer(baseState(), { type: "ADD_RESULT", name: "A", income: { lp: 100 } });
  const aId = s.results[0].id;
  s = reducer(s, { type: "ADD_ENTRY", kind: "item", name: "包帯", cost: { lp: 15 } });
  s = reducer(s, { type: "ADD_ENTRY", kind: "item", name: "注射器", cost: { lp: 20 }, resultId: aId });
  const b = balance(s.results, s.entries);
  assert.equal(b.unclassified, 1, "未分類は1件");
  assert.equal(b.lp, 65, "未分類でも支出は引く");
});

test("リザルトを消したら、その明細も消える（未分類へ戻さない）", () => {
  /* 明細だけ未分類へ戻すと、削除した支出が別の予算に紛れ込んで
     「消したのにまだ残っている」ように見える。削除なら明細ごと消す。 */
  let s = reducer(baseState(), { type: "ADD_RESULT", name: "A", income: { lp: 1000 } });
  const aId = s.results[0].id;
  s = reducer(s, { type: "ADD_ENTRY", kind: "item", name: "包帯", cost: { lp: 15 }, resultId: aId });
  /* 別のリザルトの明細は残る。 */
  s = reducer(s, { type: "ADD_RESULT", name: "B", income: { lp: 500 } });
  const bId = s.results[1].id;
  s = reducer(s, { type: "ADD_ENTRY", kind: "item", name: "固定的", cost: { lp: 5 }, resultId: bId });

  s = reducer(s, { type: "REMOVE_RESULT", id: aId });
  assert.equal(s.results.length, 1, "A だけが消える");
  assert.equal(s.entries.length, 1, "A の明細も消える");
  assert.equal(s.entries[0].name, "固定的", "B の明細は残る");
  assert.equal(balance(s.results, s.entries).lp, 495, "B の収支だけが残る");
});

test("存在しないリザルトを指す明細は未分類へ戻る", () => {
  const s = normalize({
    ...baseState(),
    results: [],
    entries: [{ id: "ent-x", kind: "item", name: "包帯", cost: { lp: "15" }, resultId: "消えたID" }]
  });
  assert.equal(s.entries[0].resultId, null, "未分類へ戻る");
  assert.equal(s.entries[0].cost.lp, 15, "文字列の費用も数値へ寄せる");
});

test("通貨は LP と欠片の2種に揃う（壊れた入力でも計算が壊れない）", () => {
  let s = reducer(baseState(), { type: "ADD_RESULT", name: "A", income: { lp: "abc", shards: -5, other: 9 } });
  assert.equal(s.results[0].income.lp, 0, "数値でないものは 0");
  assert.equal(s.results[0].income.shards, 0, "負の値は 0");
  s = reducer(s, { type: "ADD_ENTRY", kind: "other", name: "X", cost: { lp: "15LP" } });
  assert.equal(s.entries[0].cost.lp, 15, "\"15LP\" も先頭の数値を取る");
  assert.equal(balance(s.results, s.entries).lp, -15, "壊れた入力でも計算は動く");
});

test("明細を消すと支出が減る", () => {
  let s = reducer(baseState(), { type: "ADD_RESULT", name: "A", income: { lp: 1000 } });
  s = reducer(s, { type: "ADD_ENTRY", kind: "item", name: "包帯", cost: { lp: 15 } });
  const id = s.entries[0].id;
  assert.equal(balance(s.results, s.entries).lp, 985);
  s = reducer(s, { type: "REMOVE_ENTRY", id });
  assert.equal(s.entries.length, 0);
  assert.equal(balance(s.results, s.entries).lp, 1000, "消した分だけ戻る");
});

test("リザルトと明細は別の ID を持つ（互いに衝突しない）", () => {
  let s = reducer(baseState(), { type: "ADD_RESULT", name: "A", income: {} });
  s = reducer(s, { type: "ADD_ENTRY", kind: "item", name: "包帯", cost: {} });
  s = reducer(s, { type: "ADD_ENTRY", kind: "item", name: "注射器", cost: {} });
  const ids = [s.results[0].id, ...s.entries.map((e) => e.id)];
  assert.equal(new Set(ids).size, ids.length, "同一ミリ秒でも一意");
});

test("手動の支出（DBに価格が無いもの）を記録できる", () => {
  /* DBに載っていない支出。自作アイテムや将来のコンテンツに対応する。 */
  let s = reducer(baseState(), { type: "ADD_RESULT", name: "A", income: { lp: 500 } });
  s = reducer(s, { type: "ADD_ENTRY", kind: "expense", name: "自作のトークン", cost: { lp: 40, shards: 3 } });
  assert.equal(s.entries[0].kind, "expense");
  assert.equal(s.entries[0].resultId, null, "帰属は未分類（後から振る）");
  assert.equal(balance(s.results, s.entries).lp, 460);
  assert.equal(balance(s.results, s.entries).shards, -3);
});

test("消耗は支出とは別の種別として記録できる", () => {
  /* 戦闘で消えたアイテム。額が0でも記録は立つ（何を失ったかの記憶）。 */
  let s = reducer(baseState(), { type: "ADD_RESULT", name: "A", income: { lp: 100 } });
  s = reducer(s, { type: "ADD_ENTRY", kind: "consumption", name: "使った包帯", cost: { lp: 0 } });
  assert.equal(s.entries[0].kind, "consumption");
  assert.equal(balance(s.results, s.entries).lp, 100, "額が0なら残高は動かない");
  assert.equal(balance(s.results, s.entries).unclassified, 1);
});

test("種別の一覧がUIから参照できる", () => {
  const kinds = context.window.LBT_LEDGER_ENTRY_KINDS;
  assert.ok(Array.isArray(kinds), "種別の定義がある");
  for (const need of ["expense", "consumption", "item", "support", "spirit", "enhancement"]) {
    assert.ok(kinds.some((k) => k.id === need), `${need} が定義されている`);
  }
});


test("既定の日付はUTCではなくローカル暦日から組み立てる", () => {
  const localCalendarDate = {
    getFullYear: () => 2026,
    getMonth: () => 9,
    getDate: () => 23
  };
  assert.equal(context.window.LBT_localDateString(localCalendarDate), "2026-10-23");
  assert.doesNotMatch(source, /new Date\(\)\.toISOString\(\)\.slice\(0,\s*10\)/,
    "既定のユーザー入力日付にUTC日付への変換を使わない");
});

test("APPLY_PARTIAL は移行可能な履歴・初期設定の全項目を保持する", () => {
  const drawLogField = ["gacha", "Log"].join("");
  const incoming = {
    initiative: 17,
    initialItems: ["first-aid-kit"],
    draws: [{ id: "batch-1", records: [] }],
    [drawLogField]: [{ id: "roll-1", route: "ego", hits: ["B"] }],
    tickets: [{ kind: "pack", pack: "", count: 3 }],
    favorites: ["persona-145"],
    historyRecent: ["command-export"]
  };
  const before = { ...baseState(), ...Object.fromEntries(Object.keys(incoming).map((key) => [key, Array.isArray(incoming[key]) ? [] : 0])) };
  const next = reducer(before, { type: "APPLY_PARTIAL", state: incoming, fields: Object.keys(incoming) });
  assert.equal(next.initiative, 17);
  assert.deepEqual(JSON.parse(JSON.stringify(next.initialItems)), incoming.initialItems);
  assert.deepEqual(JSON.parse(JSON.stringify(next.draws)), incoming.draws);
  assert.deepEqual(JSON.parse(JSON.stringify(next[drawLogField])), incoming[drawLogField]);
  /* 未解決の旧チケット行は、理由フラグ（_lbtLegacyUnresolved*）付きで保持される。
     部分インポートでも行そのものは失わない。 */
  const unresolvedRows = JSON.parse(JSON.stringify(next.tickets));
  assert.equal(unresolvedRows.length, 1, "未解決の旧チケット行を部分インポートでも失わない");
  assert.deepEqual([unresolvedRows[0].kind, unresolvedRows[0].pack, unresolvedRows[0].count], ["pack", "", 3]);
  assert.equal(unresolvedRows[0]._lbtLegacyUnresolved, true);
  assert.equal(unresolvedRows[0]._lbtLegacyUnresolvedReason, "missing-pack-name");
  assert.deepEqual(JSON.parse(JSON.stringify(next.favorites)), incoming.favorites);
  assert.deepEqual(JSON.parse(JSON.stringify(next.historyRecent)), incoming.historyRecent);
});

test("壊れた保存状態の抽選記録は空配列へ正規化する", () => {
  const normalized = normalize({ ...baseState(), gachaLog: { broken: true } });
  assert.deepEqual(JSON.parse(JSON.stringify(normalized.gachaLog)), []);
});


test("金額・抽出チケットの正規化は部分一致や負数で残高を捏造しない", () => {
  const out = balance([
    { income: {
      lp: "1200abc",
      shards: "1,200",
      tickets: { persona: "3x", ego: -1, choice: "2", pack: { invalid: -4, valid: "1,000" } }
    } }
  ], [
    { cost: { lp: 0, shards: 0 }, tickets: { persona: -100, ego: "2abc", choice: 1, pack: { valid: -200 } } }
  ]);
  assert.equal(out.lp, 0, "部分一致の金額をLPとして数えない");
  assert.equal(out.shards, 1200, "正しい桁区切りは受け入れる");
  assert.deepEqual(JSON.parse(JSON.stringify(out.tickets)), {
    persona: 0, ego: 0, choice: 1, pack: { valid: 1000 }
  }, "不正な文字列・負の明細を使ってチケット残数を増やせない");

  const fractional = balance([
    { income: { lp: 1.5, shards: "2.5", tickets: { persona: 1.5, choice: "2.5" } } }
  ], []);
  assert.equal(fractional.lp, 0, "端数のLPは切り捨てて有効額にしない");
  assert.equal(fractional.shards, 0, "端数の欠片は切り捨てて有効額にしない");
  assert.deepEqual(JSON.parse(JSON.stringify(fractional.tickets)),
    { persona: 0, ego: 0, choice: 0, pack: {} }, "端数のチケットは枚数として計上しない");
});


test("旧チケット移行は同額の通常リザルトを移行済みと誤認しない", () => {
  const raw = {
    ...baseState(),
    tickets: [{ kind: "persona", pack: null, count: 2 }],
    results: [{
      id: "ordinary-result",
      name: "通常のシナリオ報酬",
      date: "2026-10-22",
      income: { lp: 0, shards: 0, tickets: { persona: 2, ego: 0, choice: 0, pack: {} } },
      exchange: { lp: 0, shards: 0 },
      note: ""
    }],
    entries: []
  };
  const migrated = normalize(raw);
  assert.ok(migrated.results.some((r) => r.id === "res-ticket-grant"),
    "通常リザルトの枚数が一致しても、旧在庫を移行する");
  assert.equal(balance(migrated.results, migrated.entries).tickets.persona, 4,
    "通常報酬2枚と旧セーブ在庫2枚を両方残す");

  const reopened = normalize(migrated);
  assert.equal(balance(reopened.results, reopened.entries).tickets.persona, 4,
    "移行後に再読込しても二重加算しない");
});

test("旧抽出パックの移行はパック名なし・端数枚数を誤ったチケット種別へ変換しない", () => {
  const raw = {
    ...baseState(),
    tickets: [
      { kind: "pack", pack: "", count: 3 },
      { kind: "persona", pack: null, count: 1.5 }
    ],
    results: [],
    entries: []
  };
  const migrated = normalize(raw);
  assert.equal(migrated.results.some((r) => r.id === "res-ticket-grant"), false,
    "復元できない抽出パック名や端数枚数を別のチケット在庫に変換しない");
  /* 未解決行は原値に理由フラグを付けて state へ保持する。
     バックアップ／部分インポートで行ごと捨てられないようにするため。 */
  const unresolved = JSON.parse(JSON.stringify(migrated.tickets));
  assert.equal(unresolved.length, 2, "未解決行を state に保持する");
  assert.deepEqual([unresolved[0].kind, unresolved[0].pack, unresolved[0].count], ["pack", "", 3]);
  assert.equal(unresolved[0]._lbtLegacyUnresolved, true);
  assert.equal(unresolved[0]._lbtLegacyUnresolvedReason, "missing-pack-name");
  assert.deepEqual([unresolved[1].kind, unresolved[1].pack, unresolved[1].count], ["persona", null, 1.5]);
  assert.equal(unresolved[1]._lbtLegacyUnresolved, true);
  assert.equal(unresolved[1]._lbtLegacyUnresolvedReason, "invalid-ticket-count");
  /* 未解決行はどの種別へも変換しない。正規化は空リザルトのアカウントへ初期作成の
     人格チケット1枚を置くため、絶対値でなく tickets 無し状態との差分で判定する。 */
  const baseline = normalize({ ...raw, tickets: [] });
  assert.deepEqual(JSON.parse(JSON.stringify(balance(migrated.results, migrated.entries).tickets)),
    JSON.parse(JSON.stringify(balance(baseline.results, baseline.entries).tickets)),
    "移行できない行はチケット残高を増やさない");
  assert.deepEqual(JSON.parse(JSON.stringify(normalize(migrated).tickets)), unresolved,
    "再読込でも未解決行を消さない");
});


test("破損したローカルセーブの配列要素は正規化前に除外する", () => {
  const raw = {
    ...baseState(),
    supports: [null, { name: "通常サポパ", cond: "", effect: "", lp: 7 }],
    enhancements: [null, { name: "肉体強化0-1", group: "肉体強化0", shards: 5 }],
    personaSrc: { name: "自作人格", skills: "壊れた配列", unique_buffs: [null], keywords: "壊れた配列" },
    results: [null, {
      id: "result-good", name: "正常な結果", date: "2026-10-23",
      income: { lp: 100, shards: 0, tickets: {} }, exchange: { lp: 0, shards: 0 }, note: ""
    }],
    entries: [null, {
      id: "entry-good", kind: "expense", name: "正常な支出",
      cost: { lp: 7, shards: 0 }, tickets: {}, resultId: "result-good"
    }],
    inventory: [null, { uid: "item-good", itemId: "bandage", quantity: 2 }],
    customItems: [null, { id: "custom-good", name: "自作アイテム", category: "その他" }],
    gachaLog: [null, { id: "draw-log-good", hits: [] }],
    draws: [null, { batchHash: "broken-batch", records: [null] }],
    roster: {
      personas: [null, { uid: "persona-good", no: 1, mode: "n", equipped: false, build: { skills: "壊れた配列", uniqueBuffs: [null], personaSrc: { skills: "壊れた配列", unique_buffs: [null], keywords: "壊れた配列" } } }],
      egos: [null, { uid: "ego-good", rank: "ZAYIN", no: 1 }],
      supports: [null, { uid: "roster-support-good", name: "所持サポパ" }],
      spirits: [null, { uid: "roster-spirit-good", name: "所持精神" }]
    }
  };
  const normalized = normalize(raw);
  assert.ok(normalized, "保存内容が一部壊れていても正規化を完了する");
  /* reducer は vm レルムで動くため、その返した配列はプロトタイプが vm 側になる。
     assert/strict の deepEqual はプロトタイプ差を拒むため、呼び出し側レルムへ写す。 */
  assert.deepEqual(Array.from(normalized.results, (r) => r.id).filter((id) => id === "result-good"), ["result-good"]);
  assert.deepEqual(Array.from(normalized.entries, (e) => e.id).filter((id) => id === "entry-good"), ["entry-good"]);
  for (const field of ["supports", "enhancements", "inventory", "customItems", "gachaLog", "draws"]) {
    assert.ok(Array.isArray(normalized[field]), field + " は配列として維持される");
    assert.equal(normalized[field].some((entry) => !entry || typeof entry !== "object" || Array.isArray(entry)), false,
      field + " にnull／プリミティブ要素を残さない");
  }
  for (const field of ["personas", "egos", "supports", "spirits"]) {
    assert.equal(normalized.roster[field].some((entry) => !entry || typeof entry !== "object" || Array.isArray(entry)), false,
      "roster." + field + " に不正要素を残さない");
  }
  assert.equal(normalized.gachaLog.some((entry) => entry?.id === "draw-log-good"), true,
    "正常な抽選ログは保持する");
  assert.deepEqual(JSON.parse(JSON.stringify(normalized.personaSrc.skills)), [],
    "ローカル保存のpersonaSrc.skillsが不正型でも正規化を継続する");
  assert.deepEqual(JSON.parse(JSON.stringify(normalized.personaSrc.unique_buffs)), [],
    "ローカル保存のunique_buffsにあるnullを除外する");
  assert.deepEqual(JSON.parse(JSON.stringify(normalized.personaSrc.keywords)), [],
    "ローカル保存のkeywordsが不正型でも正規化を継続する");
  assert.deepEqual(JSON.parse(JSON.stringify(normalized.roster.personas[0].build.skills)), [],
    "所持人格の保存ビルド内skillsも正規化する");
  assert.deepEqual(JSON.parse(JSON.stringify(normalized.roster.personas[0].build.uniqueBuffs)), [],
    "所持人格の保存ビルド内uniqueBuffsも正規化する");
  assert.equal(normalized.draws.length, 1, "破損した証明バッチも黙って削除しない");
  assert.deepEqual(JSON.parse(JSON.stringify(normalized.draws[0].records)), [null],
    "検証不合格の根拠となる原記録を保持する");
});


test("所持アイテムの破損した数量を部分一致で増やさず、安全な値へ正規化する", () => {
  const normalized = normalize({
    ...baseState(),
    inventory: [
      { uid: "bad-partial", itemId: "bandage", quantity: "12abc" },
      { uid: "bad-decimal", itemId: "bandage-2", quantity: 1.5 },
      { uid: "good", itemId: "bandage-3", quantity: "2" }
    ],
    customItems: [
      { id: "custom-bad-cap", name: "試験用品", maxOwned: "5pcs" }
    ]
  });
  assert.deepEqual(Array.from(normalized.inventory, (item) => item.quantity), [1, 1, 2]);
  assert.equal(context.window.LBT_getItemMaxOwned({
    customItems: [{ id: "custom-bad-cap", maxOwned: "5pcs" }]
  }, "custom-bad-cap"), 99, "不正な上限値を部分一致で採用せず既定の上限へ戻す");
});


test("重複した所持アイテム行は合算し、最大所持数と通帳参照を維持する", () => {
  context.window.DB.items = [{ id: "bandage", maxOwned: 3 }];
  const normalized = normalize({
    ...baseState(),
    inventory: [
      { uid: "item-a", itemId: "bandage", quantity: 2, memo: true, palette: true, origin: "initial" },
      { uid: "item-b", itemId: "bandage", quantity: 2, memo: true, palette: true, origin: "acquired" }
    ],
    entries: [{
      id: "entry-b", kind: "item", name: "包帯", cost: { lp: 10, shards: 0 },
      ref: { kind: "inventory", uid: "item-b" }
    }]
  });
  assert.equal(normalized.inventory.length, 1, "同じitemIdを2行で所持しない");
  assert.equal(normalized.inventory[0].uid, "item-a", "最初のUIDを代表として維持");
  assert.equal(normalized.inventory[0].quantity, 3, "重複行の合算後に最大所持数を適用");
  assert.equal(normalized.inventory[0].origin, "acquired", "初期所持と購入の混在は取得済みとして扱う");
  assert.equal(normalized.entries[0].ref.uid, "item-a", "通帳からの参照UIDを代表行へ移す");
  context.window.DB.items = [];
});


test("オリジナルアイテムの定義削除は所持・初期枠・参照支出を一緒に解消する", () => {
  const before = {
    ...baseState(),
    results: [{ id: "r1", name: "報酬", income: { lp: 100, shards: 0 }, exchange: { lp: 0, shards: 0 } }],
    customItems: [{ id: "custom-bandage", name: "自作包帯", category: "回復", price: "15LP" }],
    inventory: [{ uid: "custom-owned-1", itemId: "custom-bandage", quantity: 1, origin: "acquired" }],
    initialItems: ["custom-bandage", "official-bandage"],
    entries: [{
      id: "custom-purchase-1", kind: "item", name: "自作包帯", cost: { lp: 15, shards: 0 },
      resultId: "r1", ref: { kind: "inventory", uid: "custom-owned-1" }
    }]
  };
  const next = reducer(before, { type: "REMOVE_CUSTOM_ITEM", id: "custom-bandage" });
  assert.equal(next.customItems.some((item) => item.id === "custom-bandage"), false);
  assert.equal(next.inventory.some((entry) => entry.itemId === "custom-bandage"), false);
  assert.deepEqual(Array.from(next.initialItems), ["official-bandage"],
    "削除したIDを初期所持リストに残さない");
  assert.equal(next.entries.some((entry) => entry.id === "custom-purchase-1"), false,
    "所持削除と同じ契約でそのUIDの購入支出も消す");
  assert.equal(balance(next.results, next.entries).lp, 100,
    "残高を減らす孤立した支出明細を残さない");
});

test("共有所持の明示数量は厳密に検証し、不正文字列を部分一致で増やさない", () => {
  const before = { ...baseState(), inventory: [] };
  const bad = reducer(before, { type: "ADD_ITEM_INVENTORY", itemId: "bandage", quantity: "12abc" });
  assert.equal(bad.inventory.length, 0, "不正な数量は無視する");
  const decimal = reducer(before, { type: "ADD_ITEM_INVENTORY", itemId: "bandage", quantity: 1.5 });
  assert.equal(decimal.inventory.length, 0, "小数も無視する");
  const legacy = reducer(before, { type: "ADD_ITEM_INVENTORY", itemId: "bandage" });
  assert.equal(legacy.inventory[0].quantity, 1, "未指定数量は従来どおり1個");
});
