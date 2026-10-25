import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

/* 人格・スキル・パッシブ・強化を1画面（BuildWorkspace）に統合した回帰テスト。
 *
 * - セクションIDは persona/skill/passive/enh のまま保つ。保存済み
 *   currentSection（"skill" 等）を移行なしで受けるため。
 * - レールにはビルド1項目だけを出す。完了ドットは人格・スキル・パッシブ
 *   の合成で、ビルド内のどれが未達かを示すに尽きる。
 * - 所持アイテム欄は ADD_ITEM で所持へ足す（所持上限つき）。 */

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const app = read("../js/App.js");
const sections = read("../js/OtherSections.js");
const css = read("../assets/workspace.css");
const reducer = read("../js/state.js");

test("ビルドを主とし、コードクスは廃止済み", () => {
  const block = app.slice(app.indexOf("const SECTIONS = ["), app.indexOf("function isComplete"));
  /* 削除済み：コードクスは独立セクションを持たない。 */
  assert.doesNotMatch(block, /id: "codex"/);
  assert.doesNotMatch(block, /id: "egocodex"/);
  /* アイテムも独立セクションを持たない（ショップとビルドのアイテムタブへ統合）。 */
  assert.doesNotMatch(block, /id: "items"/);
  /* 並びは 駒整形 → ビルド → ショップ → 記録。 */
  const order = ["baseinfo", "persona", "shop", "roster", "settings", "help"]
    .map((id) => block.indexOf(`id: "${id}"`));
  assert.ok(order.every((i) => i >= 0), "6セクションが揃っている");
  for (let i = 1; i < order.length; i += 1) {
    assert.ok(order[i - 1] < order[i], `並び順が崩れている（${i}）`);
  }
  assert.match(block, /\{ id: "baseinfo", label: "駒整形"/);
  assert.match(block, /\{ id: "persona", label: "ビルド"/);
  assert.match(block, /\{ id: "shop", label: "ショップ"/);
  /* 精神は独立セクションを持たずビルドのタブへ入る。 */
  assert.doesNotMatch(block, /id: "spirit"/);
});

test("アイテムの独立セクションは無い（ショップとビルドのタブへ統合）", () => {
  assert.doesNotMatch(app, /React\.createElement\(ItemCodex/);
  assert.doesNotMatch(app, /case "items":/);
  /* 導線はビルドのアイテムタブへ向く。 */
  assert.match(sections, /currentSection: "items-build"/);
  assert.doesNotMatch(sections, /currentSection: "items"/);
});

test("ビルドのアイテムは「卓へ持ち込む」と明言する", () => {
  assert.match(sections, /"卓へ持ち込み"/);
  assert.match(sections, /"卓へ持っていく個数/);
  assert.match(sections, /"卓へ持ち込むアイテム"/);
  assert.match(sections, /"まだアイテムを持っていません。ショップで購入するか「卓へ持ち込み」で選びます。"/);
});

test("リザルトを削除したらその明細も消える（未分類へ戻さない）", () => {
  const state = read("../js/state.js");
  const removeResult = state.slice(state.indexOf('case "REMOVE_RESULT"'), state.indexOf('case "APPLY_IMPORT_BATCH"'));
  assert.match(removeResult, /entries: \(state\.entries \|\| \[\]\)\.filter\(\(e\) => e\.resultId !== action\.id\)/);
  /* 未分類へ戻す実装（resultId: null）を残さない。 */
  assert.doesNotMatch(removeResult, /resultId: null/);
});

test("renderSection は8タブのビルドへ振り分ける", () => {
  const start = app.indexOf("const renderSection = ()");
  const block = app.slice(start, app.indexOf('case "help":', start));
  for (const id of ["persona", "skill", "passive", "enh", "support", "ego", "spirit", "items-build"]) {
    assert.match(block, new RegExp(`case "${id}":`), `${id} の case が無い`);
  }
  assert.match(block, /React\.createElement\(BuildWorkspace, \{ state, dispatch \}\)/);
  assert.match(block, /React\.createElement\(ShopSection, \{ state, dispatch \}\)/);
  assert.doesNotMatch(block, /React\.createElement\(PersonaCodex/);
  assert.doesNotMatch(block, /React\.createElement\(EgoSection/);
  assert.doesNotMatch(block, /React\.createElement\(SkillDeck/);
  assert.doesNotMatch(block, /React\.createElement\(SupportSection/);
  assert.doesNotMatch(block, /React\.createElement\(SpiritSection/);
});

test("所持ゲートはロックではなくフィルタで解除できる", () => {
  /* 人格：既定は所持のみ、解除すると全件と分類フィルタが戻る。 */
  const codex = read("../js/PersonaCodex.js");
  assert.match(codex, /const \[showAll, setShowAll\] = React\.useState\(false\);/);
  assert.match(codex, /const gated = ownedOnly && !showAll;/);
  assert.match(codex, /const mode = gated \? "roster" : ui\.codexMode \|\| "n";/);
  assert.match(codex, /!gated && \/\* @__PURE__ \*\/ React\.createElement\("div", \{ className: "codex-modes" \}/);
  /* 解除は排他的な2択（所持のみ / 全件）として提示する。
     ラベルが反転するトグル1個ではなく、状態の組み合わせに存在しない即日性を排する。 */
  assert.match(codex, /className: `chip\$\{showAll \? "" : " is-active"\}`/);
  assert.match(codex, /className: `chip\$\{showAll \? " is-active" : ""\}`/);
  assert.match(codex, /"\\u6240\\u6301\\u306e\\u307f"/);
  assert.match(codex, /"\\u5168\\u4ef6\\uff08\\u672a\\u6240\\u6301\\u3082\\u542b\\u3080\\uff09"/i);
  /* 所持フィルタは全件モードのときだけ意味を持つので、その時だけ描く。 */
  assert.match(codex, /showAll && \/\* @__PURE__ \*\/ React\.createElement\("div", \{ className: "codex-filter-row" \}, \/\* @__PURE__ \*\/ React\.createElement\("span", \{ className: "filter-label" \}, "\\u6240\\u6301"\)/);
  /* E.G.O：ゲート方式をやめた。 */
  /* E.G.O はゲートを廃止した。ゲートと所持フィルタが同じ条件を二重に制御し、
     片方を消してももう片方が残って「片方だけ効く」競合を起こしていた。
     所持のみ は単一の状態（ownedOnly）に一本化し、既定は全件＝未所持も購入も出る。 */
  assert.doesNotMatch(sections.slice(sections.indexOf("const EgoSection"), sections.indexOf("const SpiritSection")), /gateOpen/);
  assert.match(sections, /const \[ownedOnly, setOwnedOnly\] = React\.useState\(false\);/);
  assert.match(sections, /h\("span", \{ className: "filter-label" \}, "所持"\)/);
  assert.match(sections, /"所持のみ"/);
  /* サポート・精神はゲート方式のまま。 */
  assert.match(sections, /const gated = ownedOnly && !gateOpen;/);
  assert.match(sections, /const supportCatalog = gated \? ownedSupports\.filter\(\(entry\) => entry\.slot !== "death"\) : DB\.support_passives;/);
  assert.match(sections, /if \(!gated\) return DB\.spirits;/);
  /* ゲート帯の体裁。 */
  assert.match(css, /\.owned-gate-row \{[\s\S]*?border-bottom: 1px dashed var\(--line-dim\);/);
});

test("ラベル一覧は自動付与を同名の実ラベルの後ろに回す（重複表示をしない）", () => {
  const codex = read("../js/OtherSections.js");
  const panel = codex.slice(codex.indexOf("const LabelParamsPanel"), codex.indexOf("const SettingsSection"));
  /* 同名の実ラベル（固有buff / カスタム / スキル変数 / 式 / labels）があるときは
     自動付与の 闘志・守備威力・サポート補正を出さない。
     二重に並ぶと CCFOLIA 側で参照先が曖昧になる。 */
  assert.match(panel, /const declaredLabels = new Set\(\[/);
  assert.match(panel, /const derived = \(id, label, source\) => \{\s*if \(declaredLabels\.has\(label\)\) return;/);
  assert.match(panel, /if \(hasVigor\) derived\("enh-vigor", "闘志", "強化から自動"\);/);
  assert.match(panel, /if \(hasDefMod\) derived\("enh-defense", "守備威力", "強化から自動"\);/);
  /* 旧来の無条件 push が残っていないこと。 */
  assert.doesNotMatch(panel, /list\.push\(\{ id: "enh-vigor"/);
  assert.doesNotMatch(panel, /list\.push\(\{ id: "enh-defense"/);
});

test("クイック検索は選択しただけで装備せず、詳細で取得を決める", () => {
  const app = read("../js/App.js");
  /* 旧: 選択 → 即 EQUIP_PERSONA */
  assert.doesNotMatch(app, /personaHits\.push\([\s\S]{0,400}?type: "EQUIP_PERSONA"/);
  assert.match(app, /run: \(\) => \{\s*\/\* 選択しただけで装備しない[\s\S]{0,80}?setPicked\(\{ kind: "persona", p, m \}\);/);
  /* 詳細 → 取得 */
  assert.match(app, /const acquirePicked = \(\) => \{[\s\S]{0,320}?personaSearchTarget: \{ mode: m, no: p\.no \}/);
  assert.match(app, /"この人格を取得する"/);
  assert.match(app, /className: "cp-detail", role: "dialog"/);
  /* 開くたびに前回の詳細は捨てる。閉じる側で捨てると詳細が出ない。 */
  assert.match(app, /if \(open\) \{[\s\S]{0,180}?setPicked\(null\);/);
});

test("E.G.O は購入も所持登録もしない試着装備ができる", () => {
  const reducer = read("../js/state.js");
  const codex = read("../js/OtherSections.js");
  assert.match(codex, /const previewEquip = \(\) => \{[\s\S]*?preview: true \}\);/);
  assert.match(codex, /onPreviewEquip: previewEquip,/);
  assert.match(codex, /"試着装備"/);
  /* 装備も試着も所持登録しない。所持への登録は ADD_ROSTER_EGO だけが行う。
     装備を所持確定にすると未所持E.G.Oの装備で指定購入を跨いでしまう。 */
  assert.doesNotMatch(reducer, /rosterEgos\.push\(\{ uid: `er-/);
  assert.doesNotMatch(codex, /rosterEgos\.push/);
  assert.match(reducer, /if \(nextValue && action\.preview\) nextValue = \{ \.\.\.nextValue, __preview: true \};/);
});

test("未所持のE.G.O は装備ではなく指定購入を主操作にする", () => {
  const codex = read("../js/OtherSections.js");
  /* 装備ボタンは所持済みのときだけ出す。未所持で出すと指定購入を跨ぐ。 */
  assert.match(codex, /: isOwned\s*\?\s*h\(Button, \{ variant: "primary", size: "sm", onClick: onEquip/);
  /* 未所持のときは試着装備が主操作。取得（AcquireBar）はその手前に出る。 */
  assert.match(codex, /variant: isOwned \? "ghost" : "primary", size: "sm", onClick: onPreviewEquip/);
  const actions = codex.slice(codex.indexOf('h("div", { className: "ego-quick-actions"'));
  assert.ok(
    actions.indexOf("AcquireBar") < actions.indexOf("onPreviewEquip"),
    "指定購入（AcquireBar）を試着装備より前に出す"
  );
});

test("未所持のカードからその場で買える", () => {
  const codex = read("../js/PersonaCodex.js");
  assert.match(codex, /className: "p-card-quick-acquire"/);
  assert.match(codex, /onQuickAcquire: gated \|\| \(acquireHow === "purchase" && personaPurchaseBlocked\(p, m\)\)/);
  assert.match(codex, /isOwned: gated \|\| ownedPersonaKeys\.has\(`\$\{m\}:\$\{p\.no\}`\)/);
  assert.match(codex, /quickAcquireLabel: `\$\{resolveAcquireCost\("persona", acquireHow/);
  assert.match(css, /\.p-card-quick-acquire \{[\s\S]*?border: 1px solid var\(--gold-line\);/);
});

test("レールのビルド項目は旧IDでもアクティブになり、必須3項目の合成でドットを出す", () => {
  const block = app.slice(app.indexOf("const RailNavigation ="), app.indexOf("const App = ()"));
  assert.match(block, /const isBuild = s\.id === "persona";/);
  assert.match(block, /const active = isBuild \? \["persona", "skill", "passive", "enh", "support", "ego", "spirit", "items-build"\]\.includes\(current\) : current === s\.id;/);
  assert.match(block, /isComplete\("persona", state\) && isComplete\("skill", state\) && isComplete\("passive", state\)/);
  /* 強化はビルドのタブになったので、専用の溢れ指定は要らない。 */
  assert.doesNotMatch(block, /is-overflow/);
});

test("その他シートの所属判定は強化の特例を持たない", () => {
  assert.match(app, /const utilitySections = SECTIONS\.filter\(\(s\) => s\.group === "utility"\);/);
  assert.doesNotMatch(app, /s\.group === "utility" \|\| s\.id === "enh"/);
});

test("BuildWorkspace は6タブをもち、所持タブだけ roster で絞る", () => {
  assert.match(sections, /window\.LBT_BUILD_TABS = BUILD_TABS/);
  const tabs = sections.slice(sections.indexOf("const BUILD_TABS = ["), sections.indexOf("const OwnedItemsPanel"));
  /* 旧セクションIDをタブIDとして保つ。 */
  for (const id of ["persona", "skill", "passive", "enh", "support", "ego", "spirit"]) {
    assert.match(tabs, new RegExp(`\\{ id: "${id}", label: "`), `${id} がタブとして定義されている`);
  }
  assert.match(tabs, /id: "enh", label: "強化", num: "04"/);
  assert.match(tabs, /id: "ego", label: "E\.G\.O", num: "06"/);
  assert.match(tabs, /id: "spirit", label: "精神", num: "07"/);
  /* アイテムのタブ ID はレール「アイテム」詳細画面（items）と衝突させない。 */
  assert.match(tabs, /id: "items-build", label: "アイテム", num: "08"/);
  /* 所持ゲートは人格/サポート/E.G.O/精神 の4タブだけ。 */
  assert.match(tabs, /id: "persona".*owned: true/);
  assert.match(tabs, /id: "support".*owned: true/);
  assert.match(tabs, /id: "ego".*owned: true/);
  assert.match(tabs, /id: "spirit".*owned: true/);
  assert.match(tabs, /id: "skill".*owned: false/);
  assert.match(tabs, /id: "passive".*owned: false/);
  assert.match(tabs, /id: "enh".*owned: false/);
  assert.match(tabs, /id: "items-build".*owned: false/);
  /* タブ ID を持つものはすべて renderSection の case が必要。
     抜けている case は default(null) になってタブが真っ白になる。 */
  const tabIds = [...tabs.matchAll(/\{ id: "([a-z-]+)", label: "[^"]+"/g)]
    .map((m) => m[1])
    /* tabs スライスは後続の定義も含むので、ビルドタブの並びだけを残す。 */
    .filter((id) => ["persona", "skill", "passive", "enh", "support", "ego", "spirit", "items-build"].includes(id));
  const start = app.indexOf("const renderSection = ()");
  const switchBlock = app.slice(start, app.indexOf('case "help":', start));
  for (const id of tabIds) {
    assert.match(switchBlock, new RegExp(`case "${id}":`), `${id} タブに renderSection の case が無い`);
  }
  /* タブ帯は記録タブ帯と同じ作法で accessible。 */
  assert.match(sections, /className: "segmented", role: "tablist", "aria-label": "ビルドセクション"/);
  assert.match(sections, /role: "tab",\s*"aria-selected": active\.id === tab\.id/);
  /* 各タブの中身は既存コンポーネントのうちどれかを出す。 */
  assert.match(sections, /const Component = active\.id === "persona"/);
  assert.match(sections, /\? window\.PersonaCodex/);
  assert.match(sections, /\? window\.SkillDeck/);
  assert.match(sections, /\? PassiveSection/);
  assert.match(sections, /\? SupportSection/);
  assert.match(sections, /\? EgoSection/);
  assert.match(sections, /\? SpiritSection/);
  assert.match(sections, /\? BuildItemsPanel/);
  assert.match(sections, /: EnhancementSection;/);
  /* 所持ゲートは ownedOnly プロパティで既存コンポーネントに渡す（描画は変えない）。 */
  assert.match(sections, /const owned = !!active\.owned;/);
  assert.match(sections, /const panelProps = \["persona", "support", "ego", "spirit"\]\.includes\(active\.id\) \? \{ ownedOnly: owned \} : \{\};/);
  assert.match(sections, /const setTab = \(id\) => dispatch\(\{ type: "SET_UI", ui: \{ currentSection: id \} \}\);/);
  assert.match(sections, /h\(SectionTitle, \{ num: active\.num, title: active\.title, subtitle: active\.subtitle \}\)/);
  assert.match(sections, /Object\.assign\(window, \{[\s\S]*?BuildWorkspace,[\s\S]*?ShopSection,/);
});

test("人格コードクスは build では所持モードに固定し、人格検索で分類を選べる", () => {
  const codex = read("../js/PersonaCodex.js");
  assert.match(codex, /const PersonaCodex = \(\{ state, dispatch, ownedOnly = false \}\) => \{/);
  assert.match(codex, /const mode = gated \? "roster" : ui\.codexMode \|\| "n";/);
  /* build 側では分類切替（通常/特異/★/履歴）を出さない。ゲート解除時は戻る。 */
  assert.match(codex, /!gated && \/\* @__PURE__ \*\/ React\.createElement\("div", \{ className: "codex-modes" \}/);
});

test("build のサポートとE.G.Oの既定表示（サポートはゲート、E.G.O はフィルタ）", () => {
  assert.match(sections, /const SupportSection = \(\{ state, dispatch, ownedOnly = false \}\) => \{/);
  /* データの束縛は catalogSource と名付けない。同名の関数（出典分類）が
     影に落ちて applyFilters 内の catalogSource(s) が落ちる。 */
  assert.match(sections, /const supportCatalog = gated \? ownedSupports\.filter\(\(entry\) => entry\.slot !== "death"\) : DB\.support_passives;/);
  assert.doesNotMatch(sections, /const catalogSource = gated/);
  assert.match(sections, /const deathCatalogSource = gated \? ownedSupports\.filter\(\(entry\) => entry\.slot === "death"\) : DB\.death_passives;/);
  assert.match(sections, /const EgoSection = \(\{ state, dispatch, ownedOnly: ownedOnlyProp = false \}\) => \{/);
  /* E.G.O は既定で全件（未所持も購入も出る）。所持だけ出すのは単一フィルタ。 */
  assert.match(sections, /const \[ownedOnly, setOwnedOnly\] = React\.useState\(false\);/);
  assert.match(sections, /const isExploringAll = ownedOnly \|\| browseAll/);
  assert.match(sections, /const SpiritSection = \(\{ state, dispatch, ownedOnly = false \}\) => \{/);
  assert.match(sections, /const spiritSource = React\.useMemo\(\(\) => \{[\s\S]*?if \(!gated\) return DB\.spirits;/);
});

test("強化は所持の直接編集ではなく購入・返却のreducerを通す", () => {
  const panel = sections.slice(sections.indexOf("const EnhancementSection ="), sections.indexOf("/* 人格・スキル・パッシブ・強化"));
  assert.match(panel, /dispatch\(\{ type: "ADD_ENHANCEMENT", group: String\(entry\.group \|\| ""\), name: entry\.name/);
  assert.match(panel, /const removeEnh = \(id\) => dispatch\(\{ type: "REMOVE_ENHANCEMENT", id \}\);/);
  assert.doesNotMatch(panel, /SET_FIELD", field: "enhancements"/);
  /* 残高不足のまま所持だけ増やさない。 */
  assert.match(panel, /LBT_purchaseAffordability/);
});

test("同期ランクとE.G.O解析は欠片残高を確認してから実行する", () => {
  const sync = sections.slice(sections.indexOf("const applySyncRank ="), sections.indexOf("const renderDetail ="));
  assert.match(sync, /LBT_computeLedgerBalance/);
  assert.match(sync, /自我の欠片が足りません/);
  const ego = sections.slice(sections.indexOf("const toggleEgoManual ="), sections.indexOf("const hasAnyEgo ="));
  /* 費用と残高は解析ヘルパーが1か所で引き、トグルはその結果で止める。
     LBT_operationCost("analyze") と台帳残高の参照はヘルパー側にある。 */
  const helper = sections.slice(sections.indexOf("const getEgoAnalysisInfo ="), sections.indexOf("const analysisInfo ="));
  assert.match(helper, /LBT_operationCost\?\.\("analyze"/);
  assert.match(helper, /LBT_computeLedgerBalance/);
  assert.match(ego, /getEgoAnalysisInfo\(detailSlot, slot\)/);
  assert.match(ego, /Number\(info\.balance\.shards\) < Number\(info\.cost\.shards\)/);
  assert.match(ego, /自我の欠片が足りません/);
});

test("ビルドのアイテムタブは持っていく個数と出力先を選べる", () => {
  const panel = sections.slice(sections.indexOf("const BuildItemsPanel ="), sections.indexOf("/* ショップ。所持の唯一の取得口。"));
  assert.match(panel, /const BuildItemsPanel = \(\{ state, dispatch \}\) => \{/);
  /* 個数は PATCH_ITEM 経由。上限は ItemCodex と同じ関数を共有する。 */
  assert.match(panel, /const patch = \(uid, patchBody\) => dispatch\(\{ type: "PATCH_ITEM", uid, patch: patchBody \}\);/);
  assert.match(panel, /const maxOwnedOf = \(itemId\) => window\.LBT_getItemMaxOwned\?\.\(state, itemId\) \|\| 99;/);
  assert.match(panel, /quantity: Math\.min\(maxOwned, \(Number\(entry\.quantity\) \|\| 1\) \+ 1\)/);
  assert.match(panel, /quantity: Math\.max\(1, \(Number\(entry\.quantity\) \|\| 1\) - 1\)/);
  /* 出力先は memo/palette。generator が読むフラグと同じもの。 */
  assert.match(panel, /patch\(entry\.uid, \{ memo: event\.target\.checked \}\)/);
  assert.match(panel, /patch\(entry\.uid, \{ palette: event\.target\.checked \}\)/);
  assert.match(panel, /"MEMOに表示"/);
  assert.match(panel, /"PALETTEへ反映"/);
  /* 追加は購入扱い（明細が立つ）／外す。 */
  assert.match(panel, /dispatch\(item\.specialResource[\s\S]{0,150}type: "ADD_ITEM_INVENTORY"[\s\S]{0,100}type: "ADD_ITEM"/);
  assert.match(panel, /dispatch\(\{ type: "REMOVE_ITEM", uid: entry\.uid \}\)/);
  /* 所持行は記録と同じ .inv-row と由来バッジ。 */
  assert.match(panel, /className: "inv-row"/);
  assert.match(panel, /"badge inv-origin is-initial" \}, "初期枠"/);
});

test("ショップは未所持のみを既定で出し、導入は購入として支出明細を立てる", () => {
  const shop = sections.slice(sections.indexOf("const ShopSection ="), sections.indexOf("const BuildWorkspace ="));
  assert.match(shop, /const ShopSection = \(\{ state, dispatch \}\) => \{/);
  /* 既定は未所持のみ。所持済み表示は明示トグル。 */
  assert.match(shop, /const \[unownedOnly, setUnownedOnly\] = React\.useState\(true\);/);
  assert.match(shop, /\(!unownedOnly \|\| !ownedSupportNames\.has\(entry\.name\)\)/);
  assert.match(shop, /\(!unownedOnly \|\| !ownedEgoKeys\.has\(`\$\{ego\.rank\}:\$\{ego\.no\}`\)\)/);
  assert.match(shop, /\(!unownedOnly \|\| !ownedItemIds\.has\(item\.id\)\)/);
  assert.match(shop, /unownedOnly \? "所持も表示" : "未所持のみ"/);
  /* トグルは状態を aria-pressed で公開し、フィルタに主ボタンを使わない。 */
  assert.match(shop, /"aria-pressed": unownedOnly/);
  assert.doesNotMatch(shop, /variant: unownedOnly \? "primary"/);
  /* 所有はカード上で可視化する（識別行の属性として、種別バッジと同じ階層）。 */
  assert.match(shop, /"data-owned": owned \? "1" : null/);
  /* ショップカードはビルド側と同じクラスで組む（基礎デザイン差分は購入のみ）。 */
  assert.match(shop, /className: "shop-card spirit-item"/);
  assert.match(shop, /className: "spirit-item-head shop-card-head"/);
  assert.match(shop, /className: "spirit-item-name shop-card-name"/);
  assert.match(shop, /className: "spirit-item-price shop-card-cost"/);
  assert.match(shop, /className: "spirit-item-line"/);
  assert.match(shop, /className: "spirit-item-actions shop-card-actions"/);
  /* カード本文はビルド側と同じ行構造（役割ラベル＋本文）。 */
  assert.match(shop, /const shopCardLines = \(kind, entry\) => \{/);
  assert.match(shop, /className: "spirit-item-tag", "data-tag": tone \|\| "morale"/);
  assert.match(shop, /line\("条件", h\(CondChips, \{ cond: entry\.cond \}\), "always"\)/);
  assert.match(shop, /line\("効果", entry\.effect, kind === "deathSupport" \? "confuse" : "morale"\)/);
  assert.match(shop, /\.\.\.\(body \|\| lines \|\| \[\]\),/);
  /* 識別情報は名前とは別の行に置く（同一行だと名前の幅が蝕まれる）。 */
  assert.match(shop, /topRow \? h\("div", \{ className: "p-card-head shop-card-top" \}, topRow\) : null/);
  /* E.G.O はビルドと同じ情報量（No. / 資源チップ / SAN・欠片）。 */
  assert.match(shop, /h\(EgoResourceChips, \{ resources: ego\.resources, className: "is-catalog" \}\)/);
  assert.match(shop, /className: "p-kw" \}, "SAN ", ego\.san_cost\)/);
  assert.match(shop, /h\("span", \{ className: "shop-card-num" \}, "No\.", String\(ego\.no\)\.padStart\(3, "0"\)\)/);
  assert.doesNotMatch(shop, /className: "shop-card-head ucard-head"/);
  assert.doesNotMatch(shop, /className: "ucard-actions" \}\},\n\s*h\(AcquireBar/);
  /* 導入は購入。サポート/アイテムは元から明細のある action を、E.G.O は purchase:true を渡す。 */
  assert.match(shop, /dispatch\(\{ type: "ADD_ROSTER_SUPPORT", spp: entry \}\);/);
  assert.match(shop, /dispatch\(\{ type: "ADD_ROSTER_EGO", rank: ego\.rank, no: ego\.no, purchase: true \}\);/);
  assert.match(shop, /dispatch\(\{ type: "ADD_ROSTER_SPIRIT", spirit: sp \}\);/);
  assert.match(shop, /dispatch\(\{ type: "ADD_ITEM", itemId: item\.id \}\);/);
  /* 所持上限に達したアイテムは購入できない。 */
  assert.match(shop, /card\(item\.id, item\.name, item\.category \|\| "その他", "item",[\s\S]{0,200}?atCap\(item\), "所持上限に達しています"/);
/* 4種別のタブ + ガチャ（抽出チケット）。 */
     assert.match(shop, /\[\["support", "サポート"\], \["ego", "E\.G\.O"\], \["spirit", "精神"\], \["item", "アイテム"\], \["gacha", "ガチャ"\]\]/);
  /* 共通カードで描く。 */
  assert.match(shop, /className: "shop-card spirit-item"/);
  assert.match(shop, /className: "shop-grid"/);
});

test("特異人格は指定購入できない（core P203 に購入が無い）", () => {
  const codex = read("../js/PersonaCodex.js");
  /* core P203「特異人格の入手方法」には抽出しか無い。
     指定で好きな1つを選ぶ方法は core:336 の人格購入だけで、特異人格に存在しない。 */
  assert.match(codex, /const personaPurchaseBlocked = \(persona, mode\) => \(mode === "t" \? "特異人格は抽出しでのみ入手できます" : null\);/);
  /* カード上の獲得経路でも遮断する（押しても入らない）。 */
  assert.match(codex, /const acquirePersona = \(persona\) => \{[\s\S]{0,1200}?const blocked = acquireHow === "purchase" \? personaPurchaseBlocked\(persona, personaMode\) : null;[\s\S]{0,80}?if \(blocked\) \{ toast\(blocked\); return; \}/);
  /* 詳細ダイアログの所持追加側も同じ判定を使う。 */
  assert.match(codex, /const addRoster = \(p\) => \{[\s\S]{0,700}?const blocked = acquireHow === "purchase" \? personaPurchaseBlocked\(p, m\) : null;[\s\S]{0,80}?if \(blocked\) \{ toast\(blocked\); return; \}/);
  /* 購入選択中は特異人格カードの獲得ボタン自体を出さない。 */
  assert.match(codex, /purchaseBlocked: acquireHow === "purchase" && Boolean\(personaPurchaseBlocked\(p, m\)\)/);
  assert.match(codex, /onQuickAcquire: gated \|\| \(acquireHow === "purchase" && personaPurchaseBlocked\(p, m\)\)\s*\?\s*null/);
  assert.match(codex, /!isOwned && onQuickAcquire && !purchaseBlocked/);
});

test("リザルトの登録情報はカード右上の『編集』から直す（⋯ではなく名前で示す）", () => {
  /* 記録は収入と同じ場所で受ける：「記録」フォームに同居させ、工程は 0。 */
  assert.match(sections, /const TicketInputs = \(\{ current, onChange, idPrefix, packPick, setPackPick \}\) => \{/);
  assert.match(sections, /const \[newResultPack, setNewResultPack\] = React\.useState\(""\);/);
  assert.match(sections, /idPrefix: "new-result",\s*current: newResult\.tickets,\s*packPick: newResultPack,\s*setPackPick: setNewResultPack,/);
  assert.match(sections, /tickets: newResult\.tickets \|\| \{ persona: 0, ego: 0, choice: 0, pack: \{\} \}/);
  /* 既存カードは専用画面に戻す。17パックの欄を常時並べない。 */
  assert.doesNotMatch(sections, /h\(TicketInputs, \{\s*idPrefix: `result-/);
  /* 「⋯」は撤去した。硝子窓の取り込みは全体操作である。
     記録の訂正はカード右上に名前入りの「編集」1つだけ。 */
  assert.match(sections, /className: "ledger-card-edit-btn",\s*title: "このリザルトの登録情報（LP・欠片・抽出チケット）を編集します",\s*"aria-label": `\$\{result\.name\} の登録情報を編集`,\s*onClick: \(\) => setTicketPanel\(result\.id\)\s*\}, "編集"\)/);
  assert.doesNotMatch(sections, /ledger-card-menu-btn/);
  assert.doesNotMatch(sections, /exportFor/);
  assert.doesNotMatch(sections, /"抽出チケットを記録"\)/);
  /* 編集画面は LP・欠片・抽出チケットをまとめて直す。 */
  assert.match(sections, /const TicketIncomePanel = \(\) => \{/);
  assert.match(sections, /"aria-label": "リザルトの登録情報を編集"/);
  assert.match(sections, /type: "UPDATE_RESULT",\s*id: target\.id,\s*name: name\.trim\(\) \|\| target\.name,\s*date,\s*income: \{ \.\.\.normalizeResultIncome\(target\.income\), lp: Number\(lp\) \|\| 0, shards: Number\(shards\) \|\| 0 \}/);
  assert.match(reducer, /case "UPDATE_RESULT"[\s\S]{0,900}?tickets: normalizeTickets\(action\.income\?\.tickets\)/);
  /* メニューは硝子窓の取り込みだけ。 */
  assert.doesNotMatch(sections, /"抽出チケットを記録"\)/);
});

test("所持ライブラリはサポパ/精神も自分の中身を出す（EGOのまま開かない）", () => {
  /* 以前は人格/E.G.O の二分岐しか無く、サポパ/精神タブが E.G.O を出し続けた。 */
  assert.match(sections, /: libraryTab === "egos" \? \(roster\.egos \|\| \[\]\)\.map/);
  assert.match(sections, /: libraryTab === "supports" \? \(roster\.supports \|\| \[\]\)\.map/);
  assert.match(sections, /: libraryTab === "spirits" \? \(roster\.spirits \|\| \[\]\)\.map/);
  assert.match(sections, /: \[\];\s*$/m);
  /* 削除も uid ベースの種別に対応する（表示 id の名前ではなく所持の uid）。 */
  assert.match(sections, /REMOVE_ROSTER_SUPPORT_BATCH/);
  assert.match(sections, /REMOVE_ROSTER_SPIRIT_BATCH/);
  assert.match(sections, /const label = libraryTabLabel\(libraryTab\);/);
});

test("ガチャは任意回数をまとめて引ける（既得は再抽選しない）", () => {
  const g = read("../js/gacha-tickets.js");
  assert.match(g, /function drawN\(route, state, opts\)/);
  assert.match(g, /const want = Math\.max\(1, Number\.parseInt\(options\.times, 10\) \|\| 1\);/);
  /* 引いたものは次からプールから外す（同種複数保有は不可: core:361/7536）。
     ここで出目の規則を持ち替えない：1d と重複回避は gacha.js の engine が
     一意に持ち、どちらの経路（通貨/チケット）もそこに預ける。 */
  assert.doesNotMatch(g, /function drawPersonaWithBranch/);
  assert.doesNotMatch(g, /function draw\(route, state, opts\)/);
  assert.match(g, /engine\.drawBatch|const out = engineBatchN\(route, state/);
  assert.match(g, /capped: pay === "ticket" \? held : null/);
  assert.match(g, /paidCost, estimateTotalCost, paymentShortfall, ticketCount, ticketKindFor, drawN/);
  /* UI は回数を自分で入れ、結果はまとめて出る。
     プルダウンではなく数字入力にする（任意の回数を直接入れられるため、
     ±1/＋1/＋5 は不要。 */
  assert.match(sections, /const \[times, setTimes\] = React\.useState\(1\);/);
  assert.doesNotMatch(sections, /const TIMES_OPTIONS/);
  assert.match(sections, /className: "gacha-times-field"[\s\S]{0,400}?"aria-label": "抽出手数"/);
  assert.match(sections, /type: "number"[\s\S]{0,200}?"aria-label": "抽出手数"/);
  /* 入力は抽選ボタンと同じ行。±1/＋1/＋5 は撤去。 */
  assert.match(sections, /className: "gacha-draw-row"/);
  assert.doesNotMatch(sections, /\}, "\+1"\)/);
  assert.doesNotMatch(sections, /\}, "\+5"\)/);
  assert.doesNotMatch(sections, /"−1"/);
  assert.doesNotMatch(sections, /role: "radiogroup", "aria-label": "抽出手数"/);
  /* 通貨で払うときは回数ぶんの合計残高で可否を判定する。
     1回分だけを見ると「途中まで引いて止まる」ことになる。
     合計は抽出手順と同じ式で出す（engine の逐次計算）。
     別の式で書くと、画面に出る金額と実際に引く金額がずれる。 */
  assert.ok(sections.includes('const totalCost = pay === "ticket"'), "ticket payment has no currency cost");
  assert.ok(sections.includes("G?.estimateTotalCost?.(route, state, activePack, times)"), "UI uses sequential engine cost estimate");
  assert.ok(sections.includes("G?.paymentShortfall?.(balance, totalCost)"), "UI uses currency-specific affordability check");
  assert.match(sections, /totalCost\.lp > 0 && Number\(balance\.lp\) < totalCost\.lp/);
  assert.match(sections, /totalCost\.shards > 0 && Number\(balance\.shards\) < totalCost\.shards/);
  assert.match(sections, /const ticketShort = pay === "ticket" && held < times;/);
  assert.match(sections, /onClick: requestDraw, disabled: !!blockedReason \|\| !!pending, title: blockedReason \|\| undefined/);
  assert.match(sections, /blockedReason && h\("p", \{ className: "ledger-note", role: "status" \}, blockedReason\)/);
  assert.match(sections, /if \(blockedReason\) \{ toast\(blockedReason\); return; \}/);
  /* 確認を挟む。押しただけでは何も入らない。 */
  assert.match(sections, /const requestDraw = \(\) => \{/);
  assert.match(sections, /const seed = drawSeed\(\);[\s\S]{0,520}?setPending\(\{ seed, out, request: \{ route, pay, pack: activePack, ticketKind, times \} \}\);/);
  assert.match(sections, /className: "gacha-confirm"/);
  assert.match(sections, /\}, "確定する"\)/);
  /* 種は暗号学的乱数から作る。時刻やMath.randomは予測できる。 */
  assert.match(read("../js/gacha-tickets.js"), /function seededSession\(seed\)/);
  assert.match(sections, /window\.crypto \|\| window\.msCrypto/);
  assert.match(sections, /getRandomValues\(buf\)/);
  assert.match(sections, /G\?\.drawN\(route, state, \{ pay, pack: activePack, ticketKind, times, seed \}\)/);
  /* チケットの消費明細は UI で個別の SPEND_TICKET を積まず、APPLY_DRAW_BATCH の
     ticketSpend に載せて reducer 内の単一遷移で積む（二重計上を防ぐ）。 */
  assert.match(sections, /const ticketSpend = out\.paidBy === "ticket"\s*\?\s*\{ kind: out\.ticketKind, pack: out\.ticketPack, count: hits\.length \}\s*: null;/);
  assert.match(sections, /抽選結果（\$\{last\.hits\.length\}件）/);
});

test("抽出チケットはリザルト収入で管理し、ショップのガチャタブで扱う（ローカルルール）", () => {
/* 4分類。抽出チケットは卓で報酬として受け渡されるため、リザルトの収入に積む。 */
     assert.match(reducer, /const TICKET_KINDS = \["persona", "ego", "choice", "pack"\];/);
     /* 残数は「全リザルトの収入 − 全明細の消費」。LP/欠片と同じ収支モデル。 */
     assert.match(reducer, /function computeTicketBalance\(results, entries\)/);
     assert.match(reducer, /function normalizeTickets\(value\)/);
     assert.match(reducer, /const out = \{ persona: toNumber\(raw\.persona\), ego: toNumber\(raw\.ego\), choice: toNumber\(raw\.choice\), pack: \{\} \};/);
      assert.match(reducer, /const income = \{ \.\.\.normalizeCurrency\(result\.income\), tickets: normalizeTickets\(result\.income\?\.tickets\) \};/);
     assert.match(reducer, /tickets: normalizeTickets\(entry\.tickets\),/);
      /* 付与は直近リザルトの収入へ、消費は明細へ。
         消費は枚数を受け取る（一括抽選は引いた回数ぶんを一度に送る）。 */
      assert.match(reducer, /case "GRANT_TICKET"[\s\S]{0,700}?return setTicketIncome\(state, kind, pack, delta, action\.resultId\);/);
      assert.match(reducer, /case "SPEND_TICKET"[\s\S]{0,1200}?Math\.min\(use, available\)/);
      assert.match(reducer, /return appendTicketSpend\(state, kind, pack, take, action\.ref, action\.resultId\);/);
      assert.match(reducer, /function appendTicketSpend\(state, kind, pack, count, ref, resultId\)/);
      assert.match(reducer, /function setTicketIncome\(state, kind, pack, delta, resultId\)/);
     assert.match(reducer, /const targetId = resultId \|\| latestResultId\(state\);/);
     /* state とUIが同じ分類を共有。 */
     assert.match(sections, /const hitLabel = \(hit\) =>/);
     assert.match(sections, /const GachaTicketsPanel = \(\{ state, dispatch \}\) =>/);
     assert.match(sections, /window\.LBT_ticketLabel/);
     /* 所持表示も収支から引く。 */
     assert.match(sections, /window\.LBT_computeTicketBalance/);
     assert.doesNotMatch(sections, /Array\.isArray\(state\.tickets\)/);
     /* ガチャタブは商品を並べた画面ではないので検索/カテゴリを出さない。 */
     assert.match(sections, /tab === "gacha" \? h\(GachaTicketsPanel, \{ state, dispatch \}\)/);

  const g = read("../js/gacha-tickets.js");
  /* 抽出全般を単独モジュールが担う。特異人格抽出は単独ルートではなく分岐。 */
  assert.match(g, /\{ id: "persona", label: "人格抽出", rule: "core:346-349"/);
  assert.match(g, /\{ id: "ego", label: "E\.G\.O抽出"/);
  assert.match(g, /\{ id: "pack", label: "特定抽出パック"/);
  assert.doesNotMatch(g, /\{ id: "special", label:/);
  /* 人格抽出の分岐（1d で最大値＝特異人格抽出へ、core:6344-6345）は
     engine 側が持つ。gacha-tickets には出目の式を残さない。 */
  const engine = read("../js/gacha.js");
  assert.match(engine, /const max = pool\.personas\.length \+ \(plusOne && RULES\.personaDraw\.plusOneTriggersSpecial \? 1 : 0\);/);
  assert.match(engine, /if \(value > pool\.personas\.length\) \{/);
  assert.match(engine, /trigger: "plusOneMax"/);
  assert.match(g, /branch: r\.kind === "specialPersona" \? "special" : null/);
  /* RNG は nextInt ではなく 1-indexed の roll。nextInt を呼ぶと常に undefined。 */
  assert.doesNotMatch(g, /s\.nextInt\(/);
  assert.doesNotMatch(g, /Math\.floor\(Math\.random\(\) \* max\)/);
  /* 分岐表示。 */
  assert.match(sections, /gacha-branch-badge" \}, "特異人格チャンス"/);
  assert.match(sections, /const branched = hits\.filter\(\(x\) => x\.branch === "special"\)\.length;/);
  /* 抽選は通貨かチケットの2択。 */
  assert.match(g, /const pay = options\.pay === "ticket" \? "ticket" : "paid";/);
  assert.match(g, /if \(pay === "ticket" && held <= 0\) return \{ hits: \[\], reason: "no-ticket", remaining: held \};/);
  /* 所持済みは引かない（core:361/7536 同種複数保有禁止）。 */
  assert.match(g, /!owned\.ego\.has\(`\$\{e\.rank\}:\$\{e\.no\}`\)/);
  assert.match(g, /!owned\.normal\.has\(String\(p\.no\)\)/);
  assert.match(g, /!owned\.special\.has\(String\(p\.no\)\)/);
  /* パックは 1d(die) で当てるので、パック単位のプールを引く。 */
  assert.match(g, /function buildPackPool\(packName, state\)/);
  assert.match(g, /const pack = findPack\(packName\);/);
  /* 所得は cost 経由で明細に立つので、直近リザルトへの帰属が効く。 */
  assert.match(sections, /cost: \{ lp: out\.cost\.lp \|\| 0, shards: out\.cost\.shards \|\| 0 \}/);
});

test("人格の獲得は core 3章 P19-20 の2種類だけ（30LP支給を人格価格にしない）", () => {
  const prov = read("../js/ledger-provenance.js");
  const acqKinds = sections.slice(sections.indexOf("const ACQUIRE_KINDS = ["), sections.indexOf("function resolveAcquireCost"));
  /* core:336「人格を入手する方法は2種類あります『抽出』と『購入』です」 */
  assert.match(prov, /抽出: 未所持なら無料 \/ 1つでも所持なら 100LP/);
  assert.match(prov, /購入: 未所持なら 20LP  \/ 1つでも所持なら 200LP/);
  assert.match(prov, /personaGacha: \{ lp: 100/);
  assert.match(prov, /personaPurchase: \{ lp: 200/);
  assert.match(prov, /personaPurchaseFirst: \{ lp: 20/);
  assert.match(prov, /personaGachaFirst: \{ lp: 0/);
  /* 「キャラ作成時に30LPが支給」は初期資金であって人格の価格ではない。
     3種類目の creation 分岐を作ると、所持0個ではありえない状態を想定してしまう。 */
  assert.doesNotMatch(prov, /personaCreation/);
  assert.doesNotMatch(prov, /provenance === "creation"/);
  /* UI は2択 + 卓配布の無料抽出チケット（local ルール）。 */
  assert.doesNotMatch(sections, /\["creation", "初期作成"\]/);
  assert.match(sections, /\[\["purchase", "指定購入"\], \["gacha", "ランダム"\], \["ticket", "配布チケット"\]\]/);
  assert.match(acqKinds, /\{ id: "persona", label: "人格", supports: true \}/);
  /* ボタン文言は方法に合わせる（「購入」固定は抽出時に嘘になる）。 */
  assert.match(sections, /how === "gacha" \? "抽出する" : how === "ticket" \? "チケットを使う" : "購入"/);
});

test("卓で配られる無料抽出チケットは有料抽出とは別経路（local ルール）", () => {
  const prov = read("../js/ledger-provenance.js");
  /* ルールブックに無いが卓では配られ消費されるので、経路としては独立させる。 */
  assert.match(prov, /personaGachaTicket: \{ lp: 0, shards: 0, source: "local:卓配布の無料人格抽出チケット" \}/);
  assert.match(prov, /egoGachaTicket: \{ lp: 0, shards: 0, source: "local:卓配布の無料E\.G\.O抽出チケット" \}/);
  /* 有料抽出（所持100LP）とは別。所持状態を引き上げない。 */
  assert.match(prov, /if \(provenance === "gachaTicket"\) return \{ \.\.\.CORE_RULES\.personaGachaTicket \};/);
  assert.match(prov, /if \(provenance === "gachaTicket"\) return \{ \.\.\.CORE_RULES\.egoGachaTicket \};/);
  assert.match(prov, /if \(provenance === "gachaPaid"\) \{\s*return ownsOne/);
  /* UI 側の振り分け。 */
  assert.match(sections, /how === "purchase" \? "purchase" : how === "ticket" \? "gachaTicket" : "gachaPaid"/);
});

test("E.G.O は core P242 の2経路（抽出100欠片 / 購入は番号横の欠片数）", () => {
  const prov = read("../js/ledger-provenance.js");
  assert.match(prov, /egoGacha: \{ lp: 0, shards: 100, source: "core:7533 E\.G\.O抽出"/);
  /* 購入は DB の shards から引く。番号不明なら作らない（0 にしない）。 */
  assert.match(prov, /if \(provenance === "purchase"\) \{[\s\S]{0,400}?if \(!hit\) return null;/);
  assert.match(prov, /const shards = matched \? Number\.parseInt\(matched\[0\], 10\) \|\| 0 : 0;/);
  assert.match(prov, /core:7536 E\.G\.O購入/);
});

test("人格の獲得費用は必ず window  через解決する（未定義だと全部『無料』になる）", () => {
  const codex = read("../js/PersonaCodex.js");
  /* PersonaCodex は window.LBT_resolveAcquireCost だけを読む。
     OtherSections 側の定義が window に露出していないと else 節の
     {lp:0, shards:0, label:"無料"} に落ち、全人格が無償で入手できてしまう。 */
  assert.match(sections, /window\.LBT_resolveAcquireCost = resolveAcquireCost;/);
  assert.match(codex, /window\.LBT_resolveAcquireCost \? window\.LBT_resolveAcquireCost\(kind, how, context\)/);
  /* フォールバックの『無料』は未露出時だけ。露出後は常に本関数が走る。 */
  assert.equal((sections.match(/window\.LBT_resolveAcquireCost\s*=/g) || []).length, 1);
});

test("所持済みの人格は再獲得せず、嘘の『所持へ追加』トーストを出さない", () => {
  const codex = read("../js/PersonaCodex.js");
  /* カード獲得と詳細の所持追加の2経路。どちらも reducer と同じ mode:no で
     判定してから dispatch する。UI 側の !isOwned ガードは表示だけを守る。 */
  assert.match(codex, /const acquirePersona = \(persona\) => \{[\s\S]{0,700}?roster\?\.personas \|\| \[\]\)\.some\([\s\S]{0,200}?既に所持しています[\s\S]{0,120}?return;/);
  assert.match(codex, /const addRoster = \(p\) => \{[\s\S]{0,600}?roster\.personas \|\| \[\]\)\.some\([\s\S]{0,200}?既に所持しています[\s\S]{0,120}?return;/);
  /* reducer 側の一意キーも同じ mode:no。 */
  assert.match(reducer, /case "ADD_ROSTER"[\s\S]{0,200}?`\$\{mode\}:\$\{no\}`[\s\S]{0,160}?return state;/);
});

test("購入は最新リザルトへ直接入り、残高が足りなければ行わない", () => {
  const shop = sections.slice(sections.indexOf("const ShopSection ="), sections.indexOf("const BuildWorkspace ="));
  /* 明細 resultId の既定は「最後に記録したリザルト」。 */
  assert.match(reducer, /const resultId = detail\.resultId === undefined \? latestResultId\(state\) : detail\.resultId;/);
  assert.match(reducer, /function latestResultId\(state\) \{\s*const results = state\?\.results \|\| \[\];\s*return results\.length \? results\[results\.length - 1\]\.id : null;/);
  /* 購入系はリデューサ入口で残高判定する（UI 無効化だけに依存しない）。 */
  assert.match(reducer, /if \(action\.type === "ADD_ROSTER" \|\| action\.type === "ADD_ROSTER_EGO"/);
  assert.match(reducer, /if \(cost && !purchaseAffordability\(state, cost\)\.ok\) return state;/);
  assert.match(reducer, /function purchaseCostOf\(state, action\) \{/);
  assert.match(reducer, /window\.LBT_purchaseAffordability = purchaseAffordability;/);
  assert.match(shop, /const afford = window\.LBT_purchaseAffordability/);
  /* 収入記録が 1 件も無いときは無制限。新規ユーザーが何も買えなくなるのを避ける。 */
  assert.match(reducer, /const tracked = \(\(state\?\.results \|\| \[\]\)\.length > 0\);/);
  /* 比較するのは「必要としている通貨」だけ。必要額0の通貨と残高を比べると
     欠片が負のとき LP だけで買える人格購入まで止まる（欠片は人格購入に無関係）。 */
  assert.match(reducer, /const lpOk = want\.lp <= 0 \|\| balance\.lp >= want\.lp;/);
  assert.match(reducer, /const shardsOk = want\.shards <= 0 \|\| balance\.shards >= want\.shards;/);
  assert.match(reducer, /const ok = !tracked \|\| \(lpOk && shardsOk\);/);
  /* 残高不足は「买えない」ことだけ静かに示し、理由は押した瞬間に toast で伝える。 */
  assert.match(shop, /"data-blocked": blocked \? "1" : null/);
  assert.doesNotMatch(shop, /className: "shop-card-blocked"/);
  assert.match(shop, /onClick: blocked \? \(\) => toast\(blockReason, "assertive"\) : onAcquire/);
  /* ビルド側と同じ資源・キーワード絞り込みを使う。 */
  assert.match(shop, /window\.LBT_egoMatchesResourceFilters\(ego, requiredResources, excludedResources\)/);
  assert.match(shop, /!keywordFilter \|\| window\.LBT_egoMatchesKeyword\(ego, keywordFilter\)/);
  assert.match(shop, /const \[requiredResources, setRequiredResources\] = React\.useState\(\[\]\);/);
  assert.match(shop, /"必要資源"/);
  assert.match(shop, /"除外資源"/);
  assert.match(shop, /"一つでも含むと除外"/);
});

test("硝子窓は入力方向だけを持つ（出力の変換は撤去した）", () => {
  const led = sections.slice(sections.indexOf("const LedgerPanel ="), sections.indexOf("const DEFAULT_FMLs = ["));
  /* 出力（JSON 化）は要らないとの指示。変換器ごと消す。 */
  assert.doesNotMatch(led, /garasumadoExport|exportJson|setExportJson/);
  assert.doesNotMatch(led, /硝子窓（CCFOLIA）へ変換/);
  assert.doesNotMatch(sections, /const garasumadoExport = /);
  /* 入力（取り込み）は残す。リザルトの操作メニューから開く。 */
  assert.match(led, /\}, "硝子窓から一括取り込む"\)/);
  assert.match(led, /typeof window\.GarasumadoImportPanel === "function"/);
  /* 反映先はアカウント全体。1 件のリザルトへ押し込まない。 */
  assert.match(sections, /const applyGarasumadoImport = \(applied\) => \{[\s\S]{0,300}?lbt:apply-import/);
  assert.match(sections, /ADD_ROSTER_SPIRIT: "精神", ADD_ITEM_INVENTORY: "アイテム",/);
  assert.doesNotMatch(sections, /applyGarasumadoImport[\s\S]{0,400}?resultId/);
});

test("硝子窓の取り込み画面は既存の利用側を壊さず足し物（manifest と選択キーを渡す）", () => {
  const ui = read("../js/garasumado-import-ui.js");
  /* manifest と選択キーは「記録へ帰属させる明細」を作るために必要。
     アカウント引き継ぎとして使うなら、面板側は中立なまま。 */
  /* manifest と選択キーは「記録へ帰属させる明細」を作るために必要。
     アカウント引き継ぎとして使うなら、画面側は中立なまま。 */
  assert.match(ui, /const applied = \{ actions: result\.actions, skipped: result\.skipped, rosterActions: result\.actions, manifest, keys \};/);
  /* 確定がコンバート確定。押した瞬間に確定し、結果を見せる（自動で閉じない）。 */
  assert.match(ui, /onApply\?\.\(applied\);/);
  /* 購入明細は「どのシナリオの支出か」を保ったまま渡す。 */
  assert.match(ui, /const result = window\.LBT_toDispatchActions\?\.\(merged, keys, \{ purchases, resolve \}\)/);
  /* 同期・解析の対象名を DB へ引く解決器も渡す（渡さないと操作行が捨てられる）。 */
  assert.match(ui, /LBT_buildNameIndex/);
  assert.match(ui, /LBT_resolveCandidates\(index, name\)/);
});

test("貼り付け取り込みは人格・精神・E.G.O・サポートを区別して扱う", () => {
  /* 「人格だけ」だと精神もパッシブも全部「不明」で止まり、
     利用者が謎の文字列入場 dealt with される。種別ごとに分ける。 */
  assert.match(sections, /const sources = \[\s*\[window\.DB\?\.normal_personas \|\| \[\], "persona"\],/);
  assert.match(sections, /\[window\.DB\?\.egos \|\| \[\], "ego"\],/);
  assert.match(sections, /\[window\.DB\?\.spirits \|\| \[\], "spirit"\],/);
  assert.match(sections, /\[window\.DB\?\.support_passives \|\| \[\], "support"\],/);
  assert.match(sections, /\[window\.DB\?\.death_passives \|\| \[\], "support"\]\s*\];/);
  /* 種別ごとに所持追加の入口へ渡す。テキストから拾った既存の所持は
     購入ではないので、購入フラグを明示して明細を立てない。 */
  assert.match(sections, /if \(p\.kind === "ego"\) dispatch\(\{ type: "ADD_ROSTER_EGO", no: p\.no, rank: p\.rank \}\);/);
  assert.match(sections, /else if \(p\.kind === "spirit"\) dispatch\(\{ type: "ADD_ROSTER_SPIRIT", spirit: \{ name: p\.name \}, purchase: false \}\);/);
  assert.match(sections, /else if \(p\.kind === "support"\) dispatch\(\{ type: "ADD_ROSTER_SUPPORT", spp: \{ name: p\.name \}, purchase: false \}\);/);
  assert.match(sections, /else dispatch\(\{ type: "ADD_ROSTER", mode: p\.mode, no: p\.no \}\);/);
  /* 所持済み判定も種別ごとに持つ（E.G.O は rank で同一性を決める）。 */
  assert.match(sections, /ego: new Set\(\(state\.roster\?\.egos \|\| \[\]\)\.map\(\(e\) => `\$\{e\.rank\}:\$\{e\.no\}`\)\),/);
  /* 検出結果がどれの種別か利用者が分かるようにする。 */
  assert.match(sections, /const HELD_KIND_LABEL = \{ persona: "人格", ego: "E\.G\.O", spirit: "精神", support: "サポート" \};/);
  assert.match(sections, /className: `chip chip-held\$\{p\.owned \? " is-owned" : ""\}`,/);
  /* 取り込み後の通知は「名前＋種別の内訳」。DB 番号は利用者が照合できない。 */
  assert.match(sections, /const mix = Object\.entries\(byKind\)\.map\(\(\[kind, n\]\) => `\$\{HELD_KIND_LABEL\[kind\] \|\| kind\} \$\{n\}件`\)\.join\("・"\);/);
  assert.match(sections, /const head = targets\.slice\(0, 2\)\.map\(\(p\) => `\$\{HELD_KIND_LABEL\[p\.kind\] \|\| p\.kind\}「\$\{p\.name\}」`\)\.join\("、"\);/);
  /* 種別が1つなら内訳は冗長。不要な分岐と未使用の集計を置かない。 */
  assert.doesNotMatch(sections, /toast\(HELD_KIND_LABEL\[targets\[0\]\.kind\] \?/);
  assert.doesNotMatch(sections, /const byKind = targets\.reduce\(\(acc, p\) => \(\{ \.\.\.acc/);
});

test("ライブラリの一括削除はサポパ・精神も uid で消し、undo に明細を渡す", () => {
  assert.match(sections, /REMOVE_ROSTER_SUPPORT_BATCH/);
  assert.match(sections, /REMOVE_ROSTER_SPIRIT_BATCH/);
  assert.match(sections, /entries: removedEntries/);
  assert.doesNotMatch(sections, /type: libraryTab === "supports" \? "REMOVE_ROSTER_SUPPORT" : "REMOVE_ROSTER_SPIRIT", name:/);
});

test("判定できなかった名前は候補から選べて補完する（完全一致で待たない）", () => {
  const fuzzy = read("../js/name-fuzzy.js");
  const index = read("../index.html");
  /* 「その文字が含まれるか」で候補を出す。完全一致しか見ない実装は、
     貼り付けが1文字違えば全部「不明」で止まる。 */
  assert.match(fuzzy, /const at = n\.indexOf\(q\);/);
  assert.match(fuzzy, /if \(q === n\) return 1000;/);
  assert.match(fuzzy, /if \(at === 0\) return 600 - Math\.min\(n\.length, 60\);/);
  /* 並び違いと袋で、外しても多少は拾える。ただし当てのない候補は混ぜない。 */
  assert.match(fuzzy, /function isSubsequence\(needle, hay\)/);
  assert.match(fuzzy, /if \(shared >= Math\.min\(3, Math\.ceil\(q\.length \/ 2\)\)\)/);
  assert.match(fuzzy, /return 0;\s*\}/);
  /* 表記ゆれは正規化で吸収する。空白・全角空白・中黒は落在り。 */
  assert.match(fuzzy, /function normalize\(text\)/);
  /* 人格・E.G.O・精神・サポートを一つのプールで引く。 */
  assert.match(fuzzy, /\[\(db\?\.normal_personas \|\| \[\]\), "persona"\],/);
  assert.match(fuzzy, /\[\(db\?\.egos \|\| \[\]\), "ego"\],/);
  assert.match(fuzzy, /\[\(db\?\.spirits \|\| \[\]\), "spirit"\],/);
  assert.match(fuzzy, /\[\(db\?\.support_passives \|\| \[\]\), "support"\],/);
  /* 種別名を候補に出すので、利用者がどれを選ぶかが分かる。 */
  assert.match(fuzzy, /kind: raw && raw\.__kind \? raw\.__kind : null/);
  /* 種別は「どの一覧に属するか」で決める。順序で決めると人格が
     「サポート」と出る（実測で出た）。 */
  assert.match(sections, /const FUZZY_KIND_LABEL = HELD_KIND_LABEL;/);
  /* 選んだ対応は再走査で先に効く。 */
  assert.match(sections, /if \(\(resolved \|\| \{\}\)\[rest\] && hit\(resolved\[rest\]\)\) return;/);
  assert.match(sections, /setHeldScan\(scanHeldPersonas\(heldPaste, heldResolved\)\)/);
  /* 取り込みは既定で閉じておく（低頻度の整備作業）。
     入口は記録フォームの「取り込む」で、そこで開く。 */
  assert.match(sections, /const \[heldOpen, setHeldOpen\] = React\.useState\(false\);/);
  assert.match(sections, /heldOpen && h\(Card, \{ className: "ledger-gara-wrap" \}/);
  assert.match(sections, /openHeld/);
  /* 一覧に並べる形にする（文字列連結で1行に潰さない）。 */
  assert.match(sections, /className: "ledger-held-unknown-list"/);
  assert.match(sections, /className: "ledger-unknown-candidates"/);
  assert.doesNotMatch(sections, /DB に無い名前が \$\{heldScan\.unknownCount\}/);
  assert.match(index, /js\/name-fuzzy\.js\?v=/);
});

test("ステータス一覧とラベル一覧は駒整形へ移設する（設定には残さない）", () => {
  const codex = read("../js/PersonaCodex.js");
  const settings = sections.slice(sections.indexOf("const SettingsSection = "));
  /* 移設なので、最終的に1か所。設定に同じ面を残すと
     「どちらで直したか」が分からなくなる。 */
  assert.match(sections, /const BuildParamsPanel = \(\{ state, dispatch \}\) => \{/);
  assert.match(sections, /data-settings-category": "statuses"/);
  assert.match(sections, /data-settings-category": "labels"/);
  assert.doesNotMatch(settings, /data-settings-category": "statuses"/);
  assert.doesNotMatch(settings, /data-settings-category": "labels"/);
  assert.doesNotMatch(settings, /h\(StatusOrderPanel/);
  assert.doesNotMatch(settings, /h\(LabelParamsPanel/);
  /* 描画先は駒整形。BaseInfoWorkspace が実宿主（BaseSection ではない）。 */
  assert.match(codex, /const BaseInfoWorkspace = \(\{ state, dispatch \}\) => \{/);
  assert.match(codex, /typeof window\.LBT_BuildParamsPanel === "function" \? window\.LBT_BuildParamsPanel\(\{ state, dispatch \}\) : null/);
  assert.match(sections, /window\.LBT_BuildParamsPanel = \(props\) => h\(BuildParamsPanel, props\);/);
  /* 描画は 1 か所だけ。BaseSection にも残すと 2 回並ぶ（実測で出た）。 */
  assert.equal((sections.match(/h\(BuildParamsPanel, \{ state, dispatch \}\)/g) || []).length, 0);
  assert.equal((sections.match(/h\(BuildParamsPanel/g) || []).length, 1, "定義 1 つだけ");
  assert.equal((codex.match(/window\.LBT_BuildParamsPanel === "function"/g) || []).length, 1, "描画 1 か所だけ");
  /* 外側の「ステータス」「ラベル」見出しは、中身のパネルの見出しと二重になるので置かない。 */
  assert.doesNotMatch(sections, /settings-major-name" \}, "ステータス"\)/);
  assert.doesNotMatch(sections, /settings-major-name" \}, "ラベル"\)/);
  assert.match(sections, /"組み立て \/ BUILD PARAMETERS"/);
  /* 組み立て設定は人格と無関係。人格が未装備でも、名前・PL・立ち絵・
     INITIATIVE・COLOR と組み立て設定の両方を開ける。 */
  const order = codex.indexOf("人格は未装備です。");
  assert.ok(order > 0 && codex.indexOf("LBT_BuildParamsPanel") > order, "補足より後ろに組み立てを置く");
  /* 人格未装備を理由に駒整形を null にしない。名前等的設定は人格とは別。 */
  assert.doesNotMatch(codex, /if \(!state\.personaSrc \|\| !BaseSection\) return null;/);
  assert.match(codex, /if \(!BaseSection\) return null;/);
  /* 補充表示は妨げにしない（元の empty 枠ではなく補助の一行にする）。 */
  assert.match(codex, /!equipped && h\("p", \{ className: "ledger-note"/);
  assert.doesNotMatch(codex, /!equipped && h\("div", \{ className: "empty"/);
  /* 面板が使う値も一緒に移っている（_settings側だけにあると壊れる）。 */
  assert.match(sections, /const effectiveStatuses = React\.useMemo\(\(\) => \{[\s\S]{0,900}?dst\.forEach/);
  assert.equal((sections.match(/const effectiveStatuses = React\.useMemo/g) || []).length, 1);
});

test("硝子窓の取り込みはリザルトに押し込まずアカウント全体で行う", () => {
  const led = sections.slice(sections.indexOf("const LedgerPanel ="), sections.indexOf("const DEFAULT_FMLs = ["));
  const acct = read("../js/accounts-ui.js");
  /* 取り込みは「アカウント引き継ぎ」── 所持も収入も明細も、
     硝子窓側の記録すべてがアカウントに入る。1件のリザルトに押し込むと
     持ち主のない所持とdebisesのない支出が残る。 */
/* 取り込み画面は記録フォームの見出しから開く。共有URLのシナリオ群を
   まとめて読む全体操作なので、リザルト単位の操作メニューには置かない。 */
   assert.doesNotMatch(led, /importFor/);
   assert.doesNotMatch(sections, /applyGarasumadoImport[\s\S]{0,400}?resultId/);
  /* 取り込みは3つとも低頻度なので「取り込む」1つに畳む。
     開くと3つ並ぶ。persona リストもここに入る。 */
  assert.match(led, /"取り込む"/);
  assert.match(led, /\}, "硝子窓から一括取り込む"\)/);
  assert.match(led, /\}, "テキスト流し込み"\)/);
  assert.match(led, /\}, "所持人格リストを取り込む"\)/);
  /* 重ねて常時3つ並べない */
  assert.doesNotMatch(led, /card-header[\s\S]{0,320}硝子窓から一括取り込む[\s\S]{0,120}テキスト流し込み[\s\S]{0,200}所持人格リスト/);
   assert.doesNotMatch(led, /ledger-card-menu/);
  /* シナリオ1件 = リザルト1件。順序が帰属を決める。
     収入は opts.income の空値ではなく、memo パーサが読んだ実額が入る。 */
  assert.match(read("../js/garasumado-roster-import.js"), /actions\.push\(\{\s*\n\s*type: "ADD_RESULT",\s*\n\s*name: scenario\.name/);
  assert.match(read("../js/garasumado-roster-import.js"), /lp: income\.lp \|\| 0,\s*\n\s*shards: income\.shards \|\| 0,\s*\n\s*tickets:/);
  /* アカウント編集側にも同じ取り込みが生きている。 */
  assert.match(acct, /function applyGarasumadoImport\(result\)/);
  assert.match(acct, /lbt:apply-import/);
});

test("無料の精神は最初から所持として数える（購入ではない）", () => {
  /* 「初期選択可」は選ぶかどうかの表示ではなく、初めからあるもの。 */
  assert.match(reducer, /function initialFreeSpirits\(\)/);
  assert.match(reducer, /function hasExplicitSpiritPrice\(definition\)/);
  assert.match(reducer, /function isExplicitlyFreeSpirit\(definition\)/);
  assert.match(reducer, /const free = list\.filter\(isExplicitlyFreeSpirit\);/);
  assert.match(reducer, /filter\(isExplicitlyFreeSpirit\)/, "初期枠は価格0が明示された精神に限定する");
  assert.match(reducer, /freeSpiritNames\.has\(name\)/, "有料・価格不明の精神を reducer 側でも拒否する");
  /* 新規アカウントは就已経入っている。 */
  assert.match(reducer, /roster: \{ spirits: initialFreeSpirits\(\) \}/);
  assert.match(reducer, /for \(const seed of initialFreeSpirits\(\)\) \{[\s\S]{0,140}?if \(!ownedSpirit\.has\(seed\.name\)\) spiritList\.push\(seed\);/);
  /* 既存アカウントは読み込み時に補完（明細は立てない）。 */
  /* 判定は保存経路に依存させない（origin は保存で落ちる）。 */
  assert.match(sections, /const spiritInitialSeeded = \(state\.roster\?\.spirits \|\| \[\]\)\.filter\(\(entry\) => \{[\s\S]{0,240}?return def && isExplicitlyFreeSpirit\(def\);/);
  assert.match(sections, /disabled: !isExplicitlyFreeSpirit\(sp\)/);
  assert.match(sections, /有料の精神はショップから取得してください/);
  assert.match(sections, /"価格不明"/);
  assert.match(sections, /isExplicitlyFreeSpirit\(sp\)/);
  assert.match(sections, /!hasExplicitSpiritPrice\(sp\) \? "価格不明"/);
});

test("所持人格リストの一括取り込みは、名前に区切り文字を含んでも壊さない", () => {
  const codex = read("../js/OtherSections.js");
  /* 「N社E.G.O:軽蔑、畏敬」のように名前に「、」を含む人格が実在する。
     機械的に区切りで切ると 1 件も拾えないので、行全体と境界の左右を順に試す。 */
  assert.match(codex, /const consume = \(chunk, depth\) => \{[\s\S]*?if \(hit\(rest\)\) return;/);
  assert.match(codex, /if \(head && index\.has\(PERSONA_NAME_KEY\(head\)\)\) \{\s*hit\(head\);\s*consume\(rest\.slice\(at \+ 1\), depth \+ 1\);\s*return;/);
  /* 空白は名前に含まれる（双鉤海賊団 組員B）ので主経路にしない。
     他の切り方が外れた後の救済としてだけ試す。 */
  assert.match(codex, /\/\* 空白は名前に含まれる[\s\S]{0,200}?他の切り方が全て外れた後の救済としてだけ試す。 \*\//);
  assert.doesNotMatch(codex, /split\(\/\[、,，\/／\|\]\/\)/);
  /* 表記ゆれ（空白・全角空白）は吸収する。DB 上は 199 件 → 199 キーで衝突ゼロ。 */
  assert.match(codex, /PERSONA_NAME_KEY = \(name\) => String\(name \|\| ""\)\.replace\(\/\[\\s\\u3000\]\+\/g, ""\)\.toLowerCase\(\);/);
  /* 取り込みは所持だけを増やす。明細は「購入したとき」だけ立つ性質を崩さない。 */
  assert.match(codex, /dispatch\(\{ type: "ADD_ROSTER", mode: p\.mode, no: p\.no \}\);/);
  assert.doesNotMatch(codex, /importHeldPersonas[\s\S]{0,700}?type: "ADD_ENTRY"/);
  /* 空入力では押せない。 */
  assert.match(codex, /disabled: !heldPaste\.trim\(\)/);
});

test("人格カードの獲得ボタンはカード全面のヒット領域に潰されない", () => {
  const codex = read("../js/PersonaCodex.js");
  const design = read("../assets/v67-persona-redesign.css");
  /* カードは .p-card-hit（inset:0 / z-index:1）で全面クリックに覆われている。
     獲得ボタンに z-index が無いと実マウスでは .p-card-hit が events を横取りし、
     押しても何も起きない（R-26）。 */
  assert.match(read("../assets/persona-codex.css"), /\.p-card-hit \{[\s\S]{0,120}?inset: 0;[\s\S]{0,40}?z-index: 1;/);
  assert.match(design, /\.p-card \.p-card-quick-acquire \{[\s\S]{0,80}?z-index: 2;/);
  /* 所持済みには獲得ボタンを出さない（所持一覧を参照している）。 */
  assert.match(codex, /!isOwned && onQuickAcquire/);
  /* 獲得カード purchasers は最新リザルトへ帰属する（appendLedgerEntry の既定）。 */
  assert.match(reducer, /const resultId = detail\.resultId === undefined \? latestResultId\(state\) : detail\.resultId;/);
});

test("削除は Undo/Redo が効く即時削除で、ごみ箱は置かない", () => {
  const led = sections.slice(sections.indexOf("const LedgerPanel ="), sections.indexOf("const DEFAULT_FMLs = ["));
  assert.ok(led.length > 500, "LedgerPanel のスライスが取れている");
  /* 行の削除は即時。取り消しは Undo/Redo が担うので、
     復元用の面（ごみ箱）は画面を縦に伸ばすだけで.CONTRIBUTING 何もしない。 */
  assert.match(reducer, /case "PURGE_ENTRY"/);
  assert.match(led, /className: "ledger-row-trash"[\s\S]{0,200}?"削除する（Ctrl\+Z で取り消せます）"/);
  /* ごみ箱は撤去済み。復元用の状態も残さない。 */
  assert.doesNotMatch(reducer, /SET_ENTRY_TRASH/);
  assert.doesNotMatch(led, /__trash|trashedEntries|ごみ箱|trashEntry|restoreEntry/);
  /* 残額は全明細から求める（黙って抜かれると「消えた支出」に見える）。 */
  assert.match(led, /LBT_computeLedgerBalance\(results, entries\)/);
  assert.doesNotMatch(reducer, /if \(entry\?\.trashedAt\) continue;/);
  /* 保存済みのゴミ箱時代の明細は、その場で通常明細へ戻す。 */
  assert.match(reducer, /const \{ trashedAt, \.\.\.rest \} = e;/);
  /* 帰属を外す（未分類へ戻す）と削除は別ボタン。 */
  assert.match(led, /className: "ledger-row-release"[\s\S]{0,320}?moveEntry\(entry\.id, null\)/);
  /* リザルトの行もドラッグで移せる。 */
  assert.match(led, /className: "ledger-row is-owned", \.\.\.dragProps\(entry\)/);
  assert.match(led, /const dragProps = \(entry\) => \(\{/);
  /* 未分類は空でも残る受け皿。 */
  assert.match(led, /dropTargetProps\("__queue"\)/);
  assert.doesNotMatch(led, /unclassified\.length > 0 && h\(Card/);
});

test("取得は種別と方法から金額を自動計算し、直近リザルトへ記録する", () => {
  /* 金額は DB 価格、無ければ core ルールの抽出/購入価格。 */
  assert.match(sections, /function resolveAcquireCost\(kind, how, context\)/);
  assert.match(sections, /const provenance = how === "purchase" \? "purchase" : how === "ticket" \? "gachaTicket" : "gachaPaid";/);
  assert.match(sections, /window\.LBT_provenance\?\.priceOf/);
  /* 純粋な種別 → 抽出/購入の二択を出すのは人格とE.G.Oだけ。 */
  const acq = sections.slice(sections.indexOf("const ACQUIRE_KINDS = ["), sections.indexOf("function resolveAcquireCost"));
  assert.match(acq, /\{ id: "persona", label: "人格", supports: true \}/);
  assert.match(acq, /\{ id: "ego", label: "E\.G\.O", supports: true \}/);
  assert.match(acq, /\{ id: "support", label: "サポート", supports: false \}/);
  /* 明細は直近リザルトへ倒す（実装は state.js 側）。表示側で state を
     持たない呼び出しがあっても落とさない。 */
  assert.match(sections, /const ownsOne = \(state\?\.roster\?\.personas \|\| \[\]\)\.length > 0;/);
  const state = read("../js/state.js");
  assert.match(state, /function latestResultId\(state\)/);
  assert.match(state, /const resultId = detail\.resultId === undefined \? latestResultId\(state\) : detail\.resultId;/);
  /* 購入導線は購入として明細を立てる。所持になるだけで初期作成用人格チケットを
     消費するので、その1段を挟んでから購入の分岐に入る。 */
  const addRoster = state.slice(state.indexOf('case "ADD_ROSTER"'), state.indexOf('case "ADD_ROSTER_EGO"'));
  assert.match(addRoster, /const withTicket = consumeInitialPersonaTicket\(next, action\.resultId\);/);
  assert.match(addRoster, /if \(!action\.purchase\) return withTicket;/);
  assert.match(addRoster, /kind: "persona"/);
  assert.match(addRoster, /cost: normalizeCurrency\(action\.cost\),/);
  assert.match(addRoster, /ref: \{ kind: "rosterPersona", uid \}/);
});

test("人格詳細はポップオーバーで開き、自動スクロールしない", () => {
  const ui = read("../js/ui.js");
  const codex = read("../js/PersonaCodex.js");
  /* ダイアログは UtilitySheet と同じ作法（Escape/背景/Tab循環/復帰）。 */
  assert.match(ui, /const DetailDialog = \(\{ open, onClose, label, children/);
  assert.match(ui, /role: "dialog", "aria-modal": "true"/);
  assert.match(ui, /if \(event\.key === "Escape"\) \{ event\.preventDefault\(\); onClose\(\); return; \}/);
  assert.match(ui, /event\.target === event\.currentTarget && onClose\(\)/);
  assert.match(ui, /detail-dialog-close/);
  assert.match(ui, /DetailDialog,/);
  /* 詳細の自動スクロールは廃止。 */
  assert.doesNotMatch(codex, /scrollIntoFocus\(detail, "start"\)/);
  assert.doesNotMatch(codex, /persona-detail-return/);
  /* 自動選択の Effects も廃止（閉じるとカテゴリ切替で勝手に開く）。 */
  assert.doesNotMatch(codex, /setSelectedPersona\(state\.personaSrc\)/);
  /* 詳細の中はポップオーバーに載せ、閉じる操作はヘッダの × だけ。 */
  assert.match(codex, /React\.createElement\(\s*\n\s*DetailDialog,/);
  assert.match(codex, /open: !!selectedPersona, onClose: \(\) => \{ setSelectedPersona\(null\); setSelectedPersonaMode\(null\); \}/);
});

test("詳細の操作帯はスクロールしても下端に見える（sticky footer）", () => {
  /* 詳細が数百行あるので、装備/購入はスクロールしきる前から常に見える必要があり、
     本文が尽きる手前でウィンドウ下端に貼り付く。 */
  assert.match(css, /\.detail-dialog-body \.detail-actions \{[\s\S]*?position: sticky;/);
  assert.match(css, /\.detail-dialog-body \.detail-actions \{[\s\S]*?bottom: calc\(-1 \* var\(--s-4\)\);/);
  assert.match(css, /\.detail-dialog-body \.detail-actions \{[\s\S]*?background: linear-gradient\(to top, var\(--surface-1\)/);
  /* 詳細が短いときも操作帯が下端に寄る（flex + margin-top:auto）。 */
  assert.match(css, /\.detail-dialog-body \.codex-detail \{[^}]*min-height: 100%; display: flex; flex-direction: column;/);
  assert.match(css, /\.detail-dialog-body \.codex-detail > \.detail-actions \{ margin-top: auto; \}/);
  assert.match(css, /\.detail-dialog \{[\s\S]*?max-height: 92vh;/);
  assert.match(css, /\.detail-dialog \{[\s\S]*?max-height: 92dvh;/);
});

test("取得方法の切り替えで購入ボタンが横にずれない", () => {
  /* 抽出/購入でセグメント幅が変わるとボタンが押し損なう。方法欄は固定幅。 */
  assert.match(css, /\.acquire-how \{ flex: 0 0 auto; min-width: 152px;/);
  assert.match(sections, /h\("div", \{ className: "acquire-how" \}/);
  assert.match(sections, /h\("span", \{ className: "acquire-how-placeholder", "aria-hidden": "true" \}\)/);
  /* 記録先のテキストは出さない。 */
  assert.doesNotMatch(sections, /直近「\$\{resultName\}」に記録/);
  assert.doesNotMatch(sections, /リザルト未登録 → 未分類に記録/);
  /* 文言は購入で統一。 */
  assert.match(sections, /\}, "購入"\)/);
});

test("人格の所持化は取得方法を選べるワンボタンになり、固有バフの案内が実装と一致する", () => {
  const codex = read("../js/PersonaCodex.js");
  /* 未所持のときだけ AcquireBar が出る。 */
  assert.match(codex, /!isInRoster && acquireHow && onAcquireHowChange && \/\* @__PURE__ \*\/ React\.createElement\(AcquireBar/);
  /* 詳細ポップオーバーまで取得方法を配線する。渡し忘れると未所持の詳細が素の装備ボタンだけになり、
     装備経由の所持化が購入明細を素通りする。 */
  assert.match(codex, /isInRoster: currentIsInRoster,[\s\S]{0,160}?state,[\s\S]{0,80}?acquireHow,[\s\S]{0,80}?onAcquireHowChange: setAcquireHow,[\s\S]{0,80}?onAcquire: \(\) => acquirePersona\(selectedPersonaView\)/);
  /* 装備ボタンは所持済みのときだけ出す。 */
  assert.match(codex, /isInRoster && \/\* @__PURE__ \*\/ React\.createElement\(Button, \{ variant: "primary", onClick: onEquip/);
  assert.match(codex, /const \[acquireHow, setAcquireHow\] = React\.useState\("purchase"\);/);
  /* 導入は購入として明細に落ちる。 */
  assert.match(codex, /dispatch\(\{ type: "ADD_ROSTER", mode: m, no: p\.no, purchase: true, cost: \{ lp: cost\.lp \|\| 0, shards: cost\.shards \|\| 0 \} \}\);/);
/* 固有バフの案内は実装どおり「装備中パネル」を指す。 */
  assert.match(codex, /\\u88C5\\u5099\\u4E2D\\u30DA\\u30F3\\u30EB\\u306E\\u300C\\u56FA\\u6709\\u30D0\\u30D5/);
  /* 案内は「装備中パネル」を指すため、素の「パネルの…」だけにはしない。
     肯定形が否定形の部分文字列になるため、否定は先頭の2文字で境界を切る。 */
  assert.doesNotMatch(codex, /[^\\u4E2D]\\u30DA\\u30FC\\u30EB\\u306E\\u300C\\u56FA\\u6709\\u30D0\\u30D5/);
});

test("ショップの E.G.O 購入だけ明細を立て、装備からの自動登録では二重請求しない", () => {
  const state = read("../js/state.js");
  const egoCase = state.slice(state.indexOf('case "ADD_ROSTER_EGO"'), state.indexOf('case "REMOVE_ROSTER_EGO"'));
  assert.match(egoCase, /function priceEgo|priceEgo\(rank, no\)/);
  assert.match(egoCase, /if \(!action\.purchase\) return next;/, "purchase:true のときだけ明細を立てる");
  assert.match(egoCase, /kind: "ego"/);
  assert.match(egoCase, /ref: \{ kind: "rosterEgo", uid \}/);
  /* 所持から外したら同額の支出を戻す。 */
  const removeCase = state.slice(state.indexOf('case "REMOVE_ROSTER_EGO"'), state.indexOf('case "REMOVE_ROSTER_BATCH"'));
  assert.match(removeCase, /dropLedgerEntriesForRef\([\s\S]*?kind: "rosterEgo"/);
});

test("ショップはビルドと同じ検索窓形式で絞り込む", () => {
  const shop = sections.slice(sections.indexOf("const ShopSection ="), sections.indexOf("const BuildWorkspace ="));
  /* 検索窓はビルド側と同じ構成：.codex-filters → .codex-search + .codex-count。 */
  assert.match(shop, /className: `shop-filters codex-filters\$\{tab === "ego" \? " ego-catalog-filters" : ""\}`/);
  /* 追従するのはカテゴリタブだけ。検索・フィルタはスクロールで流す。
     タブは filter パネルの外側（sticky は親の範囲を出られないため）。 */
  assert.match(shop, /className: "shop-tabs-sticky"/);
  assert.doesNotMatch(shop, /className: `shop-filters codex-filters shop-filters--merged/);
  assert.match(shop, /onClick: \(\) => \{ setTab\(value\); scrollWorkspaceToTop\(\); \}/);
  assert.match(shop, /const scrollWorkspaceToTop = \(\) => \{/);
  assert.match(shop, /document\.querySelector\("main\.focus"\) \|\| document\.querySelector\("main"\)/);
  assert.match(shop, /className: "codex-search"/);
  assert.match(shop, /className: "codex-count"/);
  assert.match(shop, /"aria-label": searchLabel/);
  assert.match(shop, /const searchLabel = \{ support:/);
  /* 種別ごとのフィルタもビルド側と同じ部品（chip + aria-pressed）。 */
  assert.match(shop, /const filterRows = tab === "ego" \? h\("div", \{ className: "codex-filter-row" \}[\s\S]*?EGO_RANKS\.map/);
  assert.match(shop, /tab === "item" \? h\("div", \{ className: "codex-filter-row" \}[\s\S]*?\["all", \.\.\.itemCategories\]/);
  assert.match(shop, /tab === "support" \? h\("div", \{ className: "codex-filter-row" \}[\s\S]*?\["", \.\.\.SIN_LIST\]/);
  assert.match(shop, /"aria-pressed": rankFilter === rank/);
  assert.match(shop, /"aria-pressed": categoryFilter === category/);
  /* 出典フィルタはビルドと同じ DOM 注入フックに任せる。
     出典を持つのはサポートと精神だけなので、そのタブに限って注入する。 */
  assert.match(shop, /useSourceFilterControl\(SOURCE_KINDS\[tab\] \|\| "", sourceFilter, setSourceFilter, !!SOURCE_KINDS\[tab\]\);/);
  /* 絞り込みは実際に一覧へ効く。 */
  assert.match(shop, /&&\s*\(sinFilter \? \(entry\.cond \|\| ""\)\.includes\(sinFilter\) : true\)/);
  assert.match(shop, /\(!rankFilter \|\| ego\.rank === rankFilter\)/);
  assert.match(shop, /\(categoryFilter === "all" \|\| String\(item\?\.category \|\| "その他"\) === categoryFilter\)/);
});

test("サポートと精神は人格ごとに独立し、他的人格へ持ち越さない", () => {
  const state = read("../js/state.js");
  assert.match(state, /function captureEquipmentRefs\(state\)/);
  assert.match(state, /function applyEquipmentRefs\(roster, refs\)/);
  /* スナップショットは「どの uid を付けているか」を持つ（名前ではなく参照で退避）。 */
  const snapshot = state.slice(state.indexOf("function createPersonaBuildSnapshot"), state.indexOf("function parseDerivedSkillRank"));
  assert.match(snapshot, /equipmentRefs: captureEquipmentRefs\(state\),/);
  /* 切替時は新.side 人格の選択を roster へ押し戻す。 */
  const equip = state.slice(state.indexOf('case "EQUIP_PERSONA"'), state.indexOf('case "UNEQUIP_PERSONA"'));
  assert.match(equip, /const rosterForPersona = b\.equipmentRefs \? applyEquipmentRefs\(base\.roster, b\.equipmentRefs\) : base\.roster;/);
  assert.match(equip, /roster: rosterForPersona,/);
});

test("アイテムだけは人格を跨いで共有する（消えない）", () => {
  const state = read("../js/state.js");
  /* 退避しない：build スナップショットに inventory を持たせない。 */
  const snapshot = state.slice(state.indexOf("function createPersonaBuildSnapshot"), state.indexOf("function parseDerivedSkillRank"));
  assert.doesNotMatch(snapshot, /inventory: cloneJSON\(state\.inventory/);
  /* 切替時は初期化も復元もしない。 */
  const equip = state.slice(state.indexOf('case "EQUIP_PERSONA"'), state.indexOf('case "UNEQUIP_PERSONA"'));
  assert.match(equip, /inventory: state\.inventory,/);
  assert.doesNotMatch(equip, /inventory: Array\.isArray\(b\.inventory\)/);
});

test("削除した旧コンポーネントを参照していない（実行時 ReferenceError の回帰）", () => {
  /* 旧所有パネルはアイテムタブへ移した。BuildWorkspace が残したままだと
     描画時に ReferenceError で全体が白紙になる（文字列一致テストでは通る）。 */
  assert.doesNotMatch(sections, /OwnedItemsPanel/);
  assert.doesNotMatch(sections, /build-items-panel/);
  assert.doesNotMatch(app, /OwnedItemsPanel/);
  /* BuildWorkspace が使う各識別子が同じファイルで定義されている。 */
  const buildBlock = sections.slice(sections.indexOf("const BuildWorkspace ="), sections.indexOf("const SYNC_RANKS"));
  for (const name of ["BuildItemsPanel", "PassiveSection", "EnhancementSection", "SupportSection", "EgoSection", "SpiritSection", "OwnedItemsPanel"]) {
    if (name === "OwnedItemsPanel") continue;
    assert.ok(
      new RegExp(`const ${name} = `).test(sections),
      `${name} が定義されていない（BuildWorkspace が参照している）`
    );
    assert.match(buildBlock, new RegExp(`\\b${name}\\b`), `BuildWorkspace が ${name} を使っていない`);
  }
});

test("E.G.O検索の簡易詳細もポップオーバーで開き、購入導線を共有する", () => {
  /* E.G.O は人格と同じ DetailDialog で開く。閉じた後に詳細へスクロールを
     強要されない。 */
  assert.match(sections, /h\(DetailDialog, \{ open: !!selected, onClose: \(\) => setSelected\(null\), label: "E\.G\.O 詳細" \}, h\(EgoQuickDetail/);
  /* 未所持のときは購入（明細つき）。所持済みのときは購入導線を重ねない。 */
  assert.match(sections, /onAcquire && acquireHow && onAcquireHowChange && !isOwned \? h\(AcquireBar, \{ state, kind: "ego", name: ego\.name, no: ego\.no, rank: ego\.rank, how: acquireHow, setHow: onAcquireHowChange, onAcquire \}\) : null/);
  assert.match(sections, /dispatch\(\{ type: "ADD_ROSTER_EGO", rank: selected\.rank, no: selected\.no, purchase: true \}\)/);
  /* 「購入せず所持に追加」（明細なし）を残す。 */
  assert.match(sections, /"購入せず所持に追加"/);
});

test("E.G.O の指定購入は無料にせず原典どおり欠片数を出す", () => {
  const resolver = read("../js/roster-resolver.js");
  assert.match(resolver, /E\.G\.O購入は各E\.G\.O番号の横の欠片数を消費する/);
  assert.match(resolver, /acquisition: "purchase", acquisitionLabel: "指定購入",\s*price: \{ lp: 0, shards: Number\.parseInt\(egoEntry\?\.shards, 10\) \|\| 0 \}/);
  assert.match(resolver, /source: "core:9510 E\.G\.O購入"/);
  /* UI 側も指定購入を core ルール（抽出しか無い）に送らない。 */
  assert.match(sections, /if \(kind === "persona" \|\| kind === "ego"\)/);
});

test("ショップとビルドの体裁がある", () => {
  /* 詳細ポップオーバー */
  assert.match(css, /\.detail-dialog-backdrop \{[\s\S]*?position: fixed;/);
  assert.match(css, /\.detail-dialog \{[\s\S]*?max-height: 92vh;/);
  assert.match(css, /\.detail-dialog-head \{[\s\S]*?border-bottom: 1px solid var\(--line-dim\);/);
  assert.match(css, /\.detail-dialog-close \{[\s\S]*?width: 36px;[\s\S]*?height: 36px;/);
  assert.match(css, /\.detail-dialog-body \{[\s\S]*?overflow-y: auto;[\s\S]*?overscroll-behavior: contain;/);
  /* 背景は一段下げる（減光＋ぼかし＋彩度）。二重に「選択中」に見えないようにする。 */
  assert.match(css, /\.detail-dialog-backdrop \{[\s\S]*?backdrop-filter: blur\(7px\) saturate\(0\.55\);/);
  assert.match(css, /body\.has-detail-dialog main\.focus,\s*\nbody\.has-detail-dialog main\.preview \{ overflow: hidden; \}/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.detail-dialog-backdrop,\s*\.detail-dialog \{ animation: none; \}/);
  /* 取得部品 */
  assert.match(css, /\.acquire-bar \{[\s\S]*?flex-wrap: wrap;/);
  assert.match(css, /\.acquire-cost \{[\s\S]*?color: var\(--gold\);/);
  assert.match(css, /\.acquire-result\.is-pending \{ color: var\(--warn\); \}/);
  /* 共通カード */
  assert.match(css, /\.shop-grid \{[\s\S]*?repeat\(auto-fill, minmax\(min\(260px, 100%\), 1fr\)\);/);
  assert.match(css, /\.shop-card \{[\s\S]*?display: flex; flex-direction: column;/);
  assert.match(css, /\.shop-card-name \{[\s\S]*?text-overflow: ellipsis;/);
  assert.match(css, /@media \(max-width: 640px\) \{\s*\.shop-grid \{ grid-template-columns: 1fr; \}/);
  assert.match(css, /\.shop-filters \{[\s\S]*?position: sticky;[\s\S]*?top: 0;/);
  assert.match(css, /\.shop-filters \{[\s\S]*?border-bottom: 1px solid var\(--line-dim\);/);
  assert.match(css, /\.shop-filters \.codex-count \{ white-space: nowrap; flex: none; \}/);
  /* 旧 .shop-row は残さない（共通カードへ置換）。 */
  assert.doesNotMatch(css, /\.shop-row \{/);
  assert.match(css, /\.build-workspace \{ display: flex; flex-direction: column; gap: var\(--s-3\); \}/);
  assert.match(css, /\.build-items-head \{[\s\S]*?min-height: var\(--control-h\);/);
  assert.match(css, /\.build-items-count \{[\s\S]*?margin-left: auto;/);
  assert.match(css, /\.build-items-add \{ display: grid; gap: var\(--s-2\); \}/);
  assert.match(css, /\.inv-pick-button \{[\s\S]*?border-radius: var\(--r-pill\);/);
  assert.match(css, /\.inv-pick-button:disabled \{ opacity: \.45; cursor: not-allowed; \}/);
  assert.match(css, /@media \(max-width: 640px\) \{\s*\/\* 狭幅でタブ帯の文字を押し潰さず横スクロールで到達可能にする。 \*\/\s*\.build-tabs \.segmented,\s*\.record-tabbar \.segmented \{ overflow-x: auto;/);
});

/* ---------------------------------------------------------------------------
   ガチャの厳格規定：結果の信頼性と改ざん耐性は最優先。

   壊れていた挙動（ブラウザ実測で再現済み）:
     1) 確認画面が出目を出していた。「見る → 嫌だ → 取り消す」で
        8回出目を見て、記録 0 件・支払 0 LP のまま選び直せた。
        見る前に選び直せないので、これは抽選の抜け道になる。
     2) 確定済みの抽出が Ctrl+Z 1回で消えていた。state.draws の
        ハッシュ鎖つきの記録・所持・支出がすべて巻き戻り、
        「引いたのに引いた形跡がない」状態になっていた。
        原因は ADD_DRAW_BATCH に __sealed が無かったこと。
        __sealed が無いと wrappedDispatch の reseal が働かない。

   守るべき性質:
     - 確認画面は件数と金額だけを出す。出目は確定のあとまで隠す
     - 確定済みの抽出を Undo で消せない（記録・所持・支出が一緒に残る）
     - やめられるのは「まだ何も起きていない」状態だけ
   --------------------------------------------------------------------------- */

test("ガチャ: 確認画面は出目を出さない（出目を見てから選び直す抜け道を塞ぐ）", () => {
  const sections = read("../js/OtherSections.js");
  const start = sections.indexOf('pending && h("div", { className: "gacha-confirm"');
  assert.ok(start > 0, "確認画面が見つからない");
  const block = sections.slice(start, sections.indexOf("last && h(", start));
  assert.ok(block, "確認画面の区切りが見つからない");
  /* 出目は gacha-result-row / gacha-confirm-list に載せる。
     どちらも確認画面へ置いてはいけない。置いた瞬間に抜け道ができる。 */
  assert.doesNotMatch(block, /gacha-confirm-list/);
  assert.doesNotMatch(block, /gacha-result-row/);
  assert.doesNotMatch(block, /pending\.out\.hits\.map/);
  /* 出目が出ないことを画面上で明示する。 */
  assert.match(block, /確認中は抽出方法・パック・支払い方法・回数を固定しています/);
  /* やめるボタンは「まだ引かない」。引いた結果を消しているように
     読まれる文言は使わない。 */
  assert.match(block, /\}, "まだ引かない"\)/);
  assert.doesNotMatch(block, /\}, "取り消す"\)/);
});

test("ガチャ: 確定済みの抽出は Undo で消えない（記録・所持・支出が一緒に残る）", () => {
  const sections = read("../js/OtherSections.js");
  /* 経済効果（所持・支出・チケット消費）と証明の保存は分かれている。
     確定前の再検証を通った transaction だけが経済効果を適用する。 */
  assert.match(sections, /const transaction = \{ type: "APPLY_DRAW_BATCH", batch, ticketSpend, cost: paidCost \};/,
    "経済効果は APPLY_DRAW_BATCH。確定前検証を通ったものだけ適用する");
  assert.match(sections, /dispatch\(\{ type: "ADD_DRAW_RECORD", __sealed: true, batch, entry: drawLogEntry \}\);/,
    "ADD_DRAW_RECORD は __sealed 付き。無いと reseal が効かず Ctrl+Z で記録が消える");
  /* 受け側：sealed は履歴に載せず、巻き戻しのあとに打ち直す。 */
  const st = read("../js/state.js");
  assert.match(st, /if \(action && action\.__sealed\) \{[\s\S]{0,240}?sealsRef\.current\.push/);
  assert.match(st, /const reseal = \(index\) => \{/);
});

test("ガチャ: やめる操作は「まだ引いていない」と伝える（引いた結果を取り消したと思わせない）", () => {
  const sections = read("../js/OtherSections.js");
  /* 2026-10-16: 確定処理中ガード（committingRef）が入ったため、一行の形ではなく
     setPending(null) → 文言 の順序だけを固定する。 */
  assert.match(sections, /const cancelDraw = \(\) => \{[\s\S]{0,160}?setPending\(null\);[\s\S]{0,80}?toast\("まだ引いていません。記録は残していません。"\);[\s\S]{0,40}?\};/);
  assert.doesNotMatch(sections, /toast\("抽選を取り消しました"\)/);
  /* 確定後に戻らないことは、受けと結果の両方で言う。 */
  assert.match(sections, /確定後は取り消せません/);
  assert.match(sections, /Undo（元に戻す）でも消えません/);
});

/* ---------------------------------------------------------------------------
   一覧が空なのに「n 件」と出ている状態を許さない。

   実害: ビルド > 精神 の一覧がいつも空だった。原因は
   filtered.map((sp) => { const spiritBody = ... }) が spiritBody を
   組み立てて返していないこと。React は [undefined, undefined, undefined] を
   受け取るので一覧は空、かつ counter は別に描画されるので
   「3 / 48」と出ていた。表示範囲を「未所持も表示」に変えても空のままだと、
   フィルタの問題に見えてしまう。

   検査を空振りさせないために、故意に return を外した版でも
   必ず落ちることを同じテストの中で確かめる。
   --------------------------------------------------------------------------- */

/* 開始目印と終端目印で挟み、その間に return があるかを見る。
   文字列の目印で区切るのは、括弧の対応を取らないため
   正規表現リテラルやテンプレートリテラルで位置がずれることがない。 */
function sliceBetween(src, startNeedle, endNeedle) {
  const start = src.indexOf(startNeedle);
  assert.ok(start >= 0, "開始目印が見つからない: " + startNeedle);
  const from = start + startNeedle.length;
  const end = src.indexOf(endNeedle, from);
  assert.ok(end > from, "終端目印が見つからない: " + endNeedle);
  return src.slice(from, end);
}

test("ビルド>精神: 一覧の map は要素を返す（返さないと件数だけ出て一覧が空になる）", () => {
  const sections = read("../js/OtherSections.js");
  const body = sliceBetween(sections, "filtered.map((sp) => {", "}))), selected ?");
  assert.match(body, /const spiritBody =/,
    "spiritBody を組み立てている（返さないと空になる）");
  assert.match(body, /return\s+spiritBody;\s*$/,
    "組み立てた spiritBody を返さないと、React は undefined を受け取って一覧が空になる");
});

test("同じ検査は、return を外した版では必ず落ちる（空振りしないことの確認）", () => {
  const good = "filtered.map((sp) => {\n  const spiritBody = h('div');\n  return spiritBody;\n";
  const bad = "filtered.map((sp) => {\n  const spiritBody = h('div');\n";
  const hasReturn = (src) => /return\s+spiritBody;\s*$/.test(src);
  assert.equal(hasReturn(good), true, "return があれば合格");
  assert.equal(hasReturn(bad), false, "return を外したら不合格になる（この検査は効く）");
  /* 実ファイル側にも同じ並びで検査する */
  const real = read("../js/OtherSections.js");
  const realBody = sliceBetween(real, "filtered.map((sp) => {", "}))), selected ?");
  assert.equal(hasReturn(realBody), true, "実ファイル側にも return がある");
});

/* ---------------------------------------------------------------------------
   名前の衝突（影）をフィルタ経路で弾く。

   実害: ビルド > サポート の「出典」チップを選ぶと
   TypeError: catalogSource is not a function でタブごと落ちた。
   原因はモジュール直下の関数（entry → 出典を返す）に、
   SupportSection 内の同名の配列 const が影を落としていたこと。
   既定 sourceFilter="all" は短絡するので通常時は気づけない。

   検査対象は「インデント0の関数定義と同じ名前が、インデント付きで
   関数でない束縛として再宣言される」形のみ。コンポーネント内の
   ローカル名の重複（isEquipped 等）は対象外にする。
   --------------------------------------------------------------------------- */

function shadowedModuleHelpers(src) {
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const offenders = [];
  const moduleFn = /^(?:const|let|function)\s+([A-Za-z_$][\w$]*)\s*(?:=\s*\(|\()/gm;
  const names = new Set();
  let m;
  while ((m = moduleFn.exec(src))) names.add(m[1]);
  for (const name of names) {
    const callRe = new RegExp("(?<![\\w$.])" + esc(name) + "\\s*\\(", "g");
    if (![...src.matchAll(callRe)].length) continue;
    /* インデント付きで、= ( 以外の値に束縛している再宣言を探す。 */
    const localDecl = new RegExp("^[ \\t]+(?:const|let|var)\\s+" + esc(name) + "\\s*=\\s*(?!\\()", "gm");
    const localFn = new RegExp("^[ \\t]+(?:const|let|var)\\s+" + esc(name) + "\\s*=\\s*\\(", "gm");
    const dataDecls = [...src.matchAll(localDecl)].length;
    const fnDecls = [...src.matchAll(localFn)].length;
    if (dataDecls > fnDecls) {
      offenders.push({ name, dataDecls, fnDecls });
    }
  }
  return offenders;
}

test("フィルタ経路: モジュール関数を同名の配列が影に落としていない（出典チップでタブが落ちる）", () => {
  const sections = read("../js/OtherSections.js");
  const names = shadowedModuleHelpers(sections).map((o) => o.name);
  assert.deepEqual(names, [], "モジュール直下の関数と同じ名前の関数でない束縛がある: " + names.join(", "));
});

test("この検査は影があると実際に落ちる（空振りしないことの確認）", () => {
  const withShadow = [
    "const catalogSource = (entry) => entry.source;",
    "function Panel() {",
    "  const catalogSource = DB.items;",
    "  return list.filter((s) => catalogSource(s) !== 'all');",
    "}"
  ].join("\n");
  const withoutShadow = [
    "const catalogSource = (entry) => entry.source;",
    "function Panel() {",
    "  const supportCatalog = DB.items;",
    "  return list.filter((s) => catalogSource(s) !== 'all');",
    "}"
  ].join("\n");
  const localOnly = [
    "function Panel() {",
    "  const hit = (x) => x;",
    "  const hit2 = hit(1);",
    "}"
  ].join("\n");
  assert.ok(shadowedModuleHelpers(withShadow).map((o) => o.name).includes("catalogSource"), "影があれば検出できる");
  assert.ok(!shadowedModuleHelpers(withoutShadow).map((o) => o.name).includes("catalogSource"), "影がなければ検出しない");
  assert.deepEqual(shadowedModuleHelpers(localOnly), [], "コンポーネント内ローカルの重複は対象外");
});
