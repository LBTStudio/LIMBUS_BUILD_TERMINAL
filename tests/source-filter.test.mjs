import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

/* 出典フィルタの契約。
 *
 *   core        ルルブ（新リンバスTRPG）
 *   supplement  アンロックド・シンク
 *   pack1       特定抽出パック第一弾
 *
 * 値は tools/provenance/audit_three_books.py が PDF の表（罫線＋座標）から
 * 判定したもの。data/provenance/three-book-audit.json の台帳が正であり、
 * data/db.json の source はそれに従う。以前は core と supplement の 2 値しか
 * 無く pack1 の 29 件が core と書かれていたため、ルールブックに落ちていた。 */

const db = JSON.parse(readFileSync(new URL("../data/db.json", import.meta.url), "utf8"));
const sectionSource = readFileSync(new URL("../js/OtherSections.js", import.meta.url), "utf8");
const auditPath = new URL("../data/provenance/three-book-audit.json", import.meta.url);

const SOURCES = ["core", "supplement", "pack1"];
const sourceOf = (entry) => entry?.source || "core";

test("サポートパッシブは 3 つの掲載出所に分かれる", () => {
  const rows = db.support_passives || [];
  assert.ok(rows.length > 0);
  const buckets = new Map();
  for (const entry of rows) {
    const s = sourceOf(entry);
    assert.ok(SOURCES.includes(s), `${entry.name} の source が既知の値: ${s}`);
    buckets.set(s, (buckets.get(s) || 0) + 1);
  }
  assert.equal([...buckets.values()].reduce((a, b) => a + b, 0), rows.length);
  for (const s of SOURCES) {
    assert.ok(buckets.get(s) > 0, `${s} に該当Passive があること（実際 ${buckets.get(s) || 0}）`);
  }
  // 特定抽出パックが 0 件のままだとフィルタが空になる
  assert.ok(buckets.get("pack1") >= 20, `pack1 が十分な数あること（実際 ${buckets.get("pack1") || 0}）`);
});

test("db.json の source は検出台帳（three-book-audit.json）と一致する", (t) => {
  if (!existsSync(auditPath)) {
    t.skip("three-book-audit.json がない（tools/provenance/audit_three_books.py を実行してください）");
    return;
  }
  const audit = JSON.parse(readFileSync(auditPath, "utf8"));
  const nfkc = (s) => String(s == null ? "" : s).normalize("NFKC").replace(/[\s　]+/g, "");
  const byName = new Map();
  for (const c of audit.candidates) {
    if (c.kind !== "support_passives") continue;
    const n = nfkc(c.data && c.data.name);
    if (n && !byName.has(n)) byName.set(n, c.source);
  }
  assert.ok(byName.size > 0, "台帳にサポートパッシブの候補があること");

  let checked = 0;
  const mismatch = [];
  for (const entry of db.support_passives) {
    const expected = byName.get(nfkc(entry.name));
    if (!expected) continue;
    checked++;
    if (expected !== sourceOf(entry)) mismatch.push(`${entry.name}: db=${sourceOf(entry)} / 台帳=${expected}`);
  }
  assert.ok(checked >= 300, `台帳と照合できた件数が十分あること（実際 ${checked}）`);
  assert.deepEqual(mismatch, [], "db.json の source が台帳と一致すること");
});

test("提供PDFの精神の種類54〜55頁に掲載された7件をサプリメント由来として区別できる", () => {
  const names = ["快撃", "潜撃", "指令崩壊の危機", "狂奔", "時代遅れの芸術", "もっといい存在に成れるという希望", "生き続けるという勇気"];
  const supplements = (db.spirits || []).filter((entry) => sourceOf(entry) === "supplement");
  assert.deepEqual(supplements.map((entry) => entry.name), names);
});

test("サポートパッシブの並びは PDF の掲載順になっている", (t) => {
  if (!existsSync(auditPath)) {
    t.skip("three-book-audit.json がない（tools/provenance/audit_three_books.py を実行してください）");
    return;
  }
  const audit = JSON.parse(readFileSync(auditPath, "utf8"));
  const nfkc = (s) => String(s == null ? "" : s).normalize("NFKC").replace(/[\s　]+/g, "");
  // 台帳の並びは PDF のページ順そのもの
  const ledger = audit.candidates.filter((c) => c.kind === "support_passives").map((c) => nfkc(c.data && c.data.name));
  const inDb = db.support_passives.map((s) => nfkc(s.name));
  assert.equal(inDb.length, ledger.length, "件数が台帳と一致すること");
  assert.equal(new Set(inDb).size, inDb.length, "重複がないこと");
  const mismatches = ledger.filter((n, i) => n !== inDb[i]).length;
  assert.equal(mismatches, 0, `掲載順に一致すること（不一致 ${mismatches} 件）`);
});

test("出典フィルタは 4 つの選択肢を持つ", () => {
  assert.match(sectionSource, /const catalogSource = \(entry\) => entry\?\.source \|\| "core";/);
  assert.match(sectionSource, /sourceFilter !== "all" && catalogSource\(s\) !== sourceFilter/);
  assert.match(sectionSource, /h\(SourceFilterRow, \{ h, kind: "サポートパッシブ", value: sourceFilter, onChange: setSourceFilter \}\)/);
  assert.match(sectionSource, /useSourceFilterControl\("精神", sourceFilter, setSourceFilter\)/);
  assert.match(
    sectionSource,
    /const SOURCE_OPTIONS = \[\["all", "全て"\], \["core", "ルールブック"\], \["supplement", "アンロックド・シンク"\], \["pack1", "特定抽出パック"\]\];/
  );
  // 選択肢の配列を 2 箇所（SourceFilterRow と useSourceFilterControl）が共有している
  assert.equal((sectionSource.match(/SOURCE_OPTIONS\.(map|forEach)/g) || []).length, 2);
  assert.doesNotMatch(sectionSource, /"rulebook"/, "旧 2 値リストの 'rulebook' が残っていないこと");
});

/* ---------------------------------------------------------------------------
   所持（roster）を経由すると出典が消える経路。

   SupportSection のデータ束縛をモジュール関数と同じ catalogSource と名付けると、
   applyFilters 内の catalogSource(s) がその配列を指し、出典チップを選んだ瞬間に
   TypeError でタブごと落ちていた（既定 "all" が短絡するので通常時は無症状）。
   さらに所持エントリはカタログの抜粋を写すため、書き写す項目に source が
   無いと「所持のみ」表示のときだけ全件ルールブックに化ける。
   --------------------------------------------------------------------------- */
test("出典を返す関数を、同じ名前の配列が影に落としていない", () => {
  assert.match(sectionSource, /const catalogSource = \(entry\) => entry\?\.source \|\| "core";/);
  assert.doesNotMatch(sectionSource, /const catalogSource = (?!\(entry\))/, "関数以外の同名束縛を置かない");
  assert.match(sectionSource, /const supportCatalog = gated \? ownedSupports : DB\.support_passives;/);
});

const stateSourceForOwned = readFileSync(new URL("../js/state.js", import.meta.url), "utf8");

function loadStateWithDb(dbOverrides) {
  const base = { support_passives: [], death_passives: [], spirits: [], normal_enhancements: [], special_enhancements: [] };
  const context = {
    window: { DB: { ...base, ...dbOverrides } },
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
  vm.runInContext(stateSourceForOwned, context);
  return context.window;
}

const ownedState = (roster) => ({
  supports: [], deathSupport: null, spirit: "", inventory: [], customItems: [], enhancements: [],
  roster: { personas: [], egos: [], supports: roster.supports || [], spirits: roster.spirits || [] },
  results: [], entries: [], ui: {}, historyRecent: [], favorites: []
});

test("所持へ写すとき出典を落とさない（サポート・精神）", () => {
  const w = loadStateWithDb({
    support_passives: [{ name: "潜撃", cond: "条件", effect: "効果", lp: "50", source: "supplement" }],
    spirits: [{ name: "快撃", morale_effect: "m", source: "supplement" }]
  });
  const withSupport = w.appReducer(ownedState({}), { type: "ADD_ROSTER_SUPPORT", spp: { name: "潜撃" } });
  assert.equal(withSupport.roster.supports[0].source, "supplement", "所持サポートが出典を保つ");
  const withSpirit = w.appReducer(ownedState({}), { type: "ADD_ROSTER_SPIRIT", spirit: { name: "快撃" } });
  assert.equal(withSpirit.roster.spirits[0].source, "supplement", "所持精神が出典を保つ");
});

test("出典を持たない旧セーブの所持は名前から引き直す", () => {
  const w = loadStateWithDb({
    support_passives: [{ name: "潜撃", cond: "", effect: "", lp: "50", source: "supplement" }],
    spirits: [{ name: "快撃", morale_effect: "m", source: "supplement" }]
  });
  const normalized = w.LBT_normalizeStateShape(
    ownedState({ supports: [{ name: "潜撃" }], spirits: [{ name: "快撃" }] })
  );
  assert.equal(normalized.roster.supports[0].source, "supplement");
  assert.equal(normalized.roster.spirits[0].source, "supplement");
});

test("DB に無い手動追加の所持は core として扱う（落とさない）", () => {
  const w = loadStateWithDb({});
  const normalized = w.LBT_normalizeStateShape(ownedState({ supports: [{ name: "手動で足したパッシブ" }] }));
  assert.equal(normalized.roster.supports.length, 1, "名前が無いわけではないので保全する");
  assert.equal(normalized.roster.supports[0].source, "core");
});

test("DB 未ロードでは出典を焼き込まず、後から引き直せる", () => {
  const w = loadStateWithDb({});
  delete w.DB;
  const before = w.LBT_normalizeStateShape(ownedState({ supports: [{ name: "潜撃" }] }));
  assert.equal(before.roster.supports[0].source, undefined, "DB が無いときは空のまま残す");
  w.DB = { support_passives: [{ name: "潜撃", source: "supplement" }] };
  const after = w.LBT_normalizeStateShape(before);
  assert.equal(after.roster.supports[0].source, "supplement", "DB が来たら引き直す");
});

/* ---------------------------------------------------------------------------
   出典フィルタは「出典を持つカタログ」にだけ出す。

   ショップはタブを問わず出典行を DOM へ注入していたため、E.G.O（115件）と
   アイテム（35件）のタブにも押しても何も変わらない操作子が出ていた。
   出典は support_passives と spirits だけが持つので、行はその 2 タブに限る。
   --------------------------------------------------------------------------- */
test("出典を持つのはサポートパッシブと精神だけ（E.G.O・アイテムは持たない）", () => {
  const withSource = (list) => list.filter((e) => e && typeof e === "object" && "source" in e).length;
  assert.equal(withSource(db.support_passives), db.support_passives.length);
  assert.equal(withSource(db.spirits), db.spirits.length);
  assert.equal(withSource(db.egos), 0);
  const items = JSON.parse(readFileSync(new URL("../data/items.json", import.meta.url), "utf8"));
  assert.equal(withSource(items), 0);
});

test("ショップの出典行は出典を持つタブにだけ注入する", () => {
  assert.match(sectionSource, /const SOURCE_KINDS = \{ support: "サポート", spirit: "精神" \};/);
  assert.match(sectionSource, /const useSourceFilterControl = \(kind, value, onChange, enabled = true\) => \{/);
  assert.match(sectionSource, /if \(!enabled\) return void 0;/);
  assert.match(sectionSource, /\[kind, value, onChange, enabled\]/);
  assert.match(
    sectionSource,
    /useSourceFilterControl\(SOURCE_KINDS\[tab\] \|\| "", sourceFilter, setSourceFilter, !!SOURCE_KINDS\[tab\]\)/
  );
  assert.doesNotMatch(sectionSource, /useSourceFilterControl\(tab === "support"/, "全タブ注入の旧呼び出しを残さない");
});
