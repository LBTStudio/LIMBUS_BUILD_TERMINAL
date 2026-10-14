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
  assert.match(sections, /const catalogSource = gated \? ownedSupports : DB\.support_passives;/);
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
  /* 所持登録は preview のとき走らない。走ると「買ったつもり」が混入する。 */
  assert.match(reducer, /if \(nextValue && !action\.preview && !rosterEgos\.some/);
  assert.match(reducer, /if \(nextValue && action\.preview\) nextValue = \{ \.\.\.nextValue, __preview: true \};/);
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
  assert.match(sections, /const catalogSource = gated \? ownedSupports : DB\.support_passives;/);
  assert.match(sections, /const deathCatalogSource = gated \? ownedSupports\.filter\(\(entry\) => entry\.slot === "death"\) : DB\.death_passives;/);
  assert.match(sections, /const EgoSection = \(\{ state, dispatch, ownedOnly: ownedOnlyProp = false \}\) => \{/);
  /* E.G.O は既定で全件（未所持も購入も出る）。所持だけ出すのは単一フィルタ。 */
  assert.match(sections, /const \[ownedOnly, setOwnedOnly\] = React\.useState\(false\);/);
  assert.match(sections, /const isExploringAll = ownedOnly \|\| browseAll/);
  assert.match(sections, /const SpiritSection = \(\{ state, dispatch, ownedOnly = false \}\) => \{/);
  assert.match(sections, /const spiritSource = React\.useMemo\(\(\) => \{[\s\S]*?if \(!gated\) return DB\.spirits;/);
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
  assert.match(panel, /dispatch\(\{ type: "ADD_ITEM", itemId: item\.id \}\);/);
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
/* 4種別のタブ + ガチャ（抽出権利）。 */
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

test("抽象権3種を区別してショップのガチャタブで扱う（ローカルルール）", () => {
  /* 3種は別在庫。人格/E.G.O/選択(どちらからか)を混ぜない。 */
  assert.match(reducer, /tickets: \{\s*persona: 0,\s*ego: 0,\s*choice: 0\s*\}/);
  assert.match(reducer, /case "SET_TICKET_COUNT"[\s\S]{0,400}?\["persona", "ego", "choice"\]\.includes\(kind\)/);
  /* 加算と減算の両方。減算を 0 で潰すと「使う」が無効になる。 */
  assert.match(reducer, /case "GRANT_TICKET"[\s\S]{0,400}?const delta = Number\(action\.count\) \|\| 0;/);
  assert.match(reducer, /const next = Math\.max\(0, \(Number\(tickets\[kind\]\) \|\| 0\) \+ delta\);/);
  /* state の3種とUIの3種が同じ id を共有していること。 */
  assert.match(sections, /const hitLabel = \(hit\) =>/);
  assert.match(sections, /const GachaTicketsPanel = \(\{ state, dispatch \}\) =>/);
  /* ガチャタブは商品を並べた画面ではないので検索/カテゴリを出さない。 */
  assert.match(sections, /tab === "gacha" \? h\(GachaTicketsPanel, \{ state, dispatch \}\)/);
  /* 選択抽出だけ人格かE.G.Oの選択が要る。 */
  assert.match(sections, /kind === "choice" && h\("div", \{ className: "segmented"[\s\S]{0,200}?\[\["persona", "人格から"\], \["ego", "E\.G\.Oから"\]\]/);
  /* 使用は1枚消費してから所持へ。抽選結果を所持へ入れる。 */
  assert.match(sections, /dispatch\(\{ type: "GRANT_TICKET", kind, count: -1 \}\);/);
  assert.match(sections, /if \(hit\.type === "ego"\) dispatch\(\{ type: "ADD_ROSTER_EGO", no: hit\.no, rank: hit\.rank, purchase: true \}\);\s*else dispatch\(\{ type: "ADD_ROSTER", mode: hit\.mode, no: hit\.no, purchase: true, cost: \{ lp: 0, shards: 0 \} \}\);/);
  /* 所持済みは引かない（core:361/7536 同種複数保有禁止）。 */
  const tickets = read("../js/gacha-tickets.js");
  assert.match(tickets, /owned\.ego\.has\(`\$\{e\.rank\}:\$\{e\.no\}`\)/);
  assert.match(tickets, /!owned\.persona\.has\(String\(p\.no\)\)/);
  assert.match(tickets, /!owned\.tokui\.has\(String\(p\.no\)\)/);
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
  /* UI は2択 + 卓配布の無料抽出権利（local ルール）。 */
  assert.doesNotMatch(sections, /\["creation", "初期作成"\]/);
  assert.match(sections, /\[\["purchase", "指定購入"\], \["gacha", "ランダム"\], \["ticket", "配布権利"\]\]/);
  assert.match(acqKinds, /\{ id: "persona", label: "人格", supports: true \}/);
  /* ボタン文言は方法に合わせる（「購入」固定は抽出時に嘘になる）。 */
  assert.match(sections, /how === "gacha" \? "抽出する" : how === "ticket" \? "権利を使う" : "購入"/);
});

test("卓で配られる無料抽出権利は有料抽出とは別経路（local ルール）", () => {
  const prov = read("../js/ledger-provenance.js");
  /* ルールブックに無いが卓では配られ消費されるので、経路としては独立させる。 */
  assert.match(prov, /personaGachaTicket: \{ lp: 0, shards: 0, source: "local:卓配布の無料人格抽出権利" \}/);
  assert.match(prov, /egoGachaTicket: \{ lp: 0, shards: 0, source: "local:卓配布の無料E\.G\.O抽出権利" \}/);
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
  assert.match(reducer, /const ok = !tracked \|\| \(balance\.lp >= want\.lp && balance\.shards >= want\.shards\);/);
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
  assert.match(led, /\}, "硝子窓から取り込む"\),/);
  assert.match(led, /typeof window\.GarasumadoImportPanel === "function"/);
  /* 反映先はアカウント全体。1 件のリザルトへ押し込まない。 */
  assert.match(sections, /const applyGarasumadoImport = \(applied\) => \{[\s\S]{0,300}?lbt:apply-import/);
  assert.match(sections, /ADD_ROSTER_SPIRIT: "精神", ADD_ITEM_INVENTORY: "アイテム",/);
  assert.doesNotMatch(sections, /applyGarasumadoImport[\s\S]{0,400}?resultId/);
});

test("硝子窓の取り込み画面は既存の利用側を壊さず足し物（manifest と選択キーを渡す）", () => {
  const ui = read("../js/garasumado-import-ui.js");
  /* manifest と選択キーは「記録へ歸属させる明細」を作るために必要。
     アカウント引き継ぎとして使うなら、面板側は中立なまま。 */
  assert.match(ui, /onApply\?\.\(\{ actions: result\.actions, skipped: result\.skipped, rosterActions: result\.actions, manifest, keys \}\)/);
  /* 購入明細は「どのシナリオの支出か」を保ったまま渡す。 */
  assert.match(ui, /const result = window\.LBT_toDispatchActions\?\.\(manifest, keys, \{ purchases \}\)/);
});

test("貼り付け取り込みは人格・精神・E.G.O・サポートを区別して扱う", () => {
  /* 「人格だけ」だと精神もパッシブも全部「不明」で止まり、
     利用者が謎の文字列入場 dealt with される。種別ごとに分ける。 */
  assert.match(sections, /const sources = \[\s*\[window\.DB\?\.normal_personas \|\| \[\], "persona"\],/);
  assert.match(sections, /\[window\.DB\?\.egos \|\| \[\], "ego"\],/);
  assert.match(sections, /\[window\.DB\?\.spirits \|\| \[\], "spirit"\],/);
  assert.match(sections, /\[window\.DB\?\.support_passives \|\| \[\], "support"\],/);
  assert.match(sections, /\[window\.DB\?\.death_passives \|\| \[\], "support"\]\s*\];/);
  /* 種別ごとに所持追加の入口へ渡す。明細を立てるかは reducer に任せる。 */
  assert.match(sections, /if \(p\.kind === "ego"\) dispatch\(\{ type: "ADD_ROSTER_EGO", no: p\.no, rank: p\.rank \}\);/);
  assert.match(sections, /else if \(p\.kind === "spirit"\) dispatch\(\{ type: "ADD_ROSTER_SPIRIT", spirit: \{ name: p\.name \} \}\);/);
  assert.match(sections, /else if \(p\.kind === "support"\) dispatch\(\{ type: "ADD_ROSTER_SUPPORT", spp: \{ name: p\.name \} \}\);/);
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
  /* 取り込みは既定で閉じておく（低頻度の整備作業）。 */
  assert.match(sections, /const \[heldOpen, setHeldOpen\] = React\.useState\(false\);/);
  assert.match(sections, /heldOpen && h\("div", \{ className: "card-body stack-2" \}/);
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
  /* 組み立て設定は人格と無関係。空状態の表現に隠さない。 */
  const order = codex.indexOf("まだ人格が装備されていません。");
  assert.ok(order > 0 && codex.indexOf("LBT_BuildParamsPanel") > order, "空状態より後ろに置く");
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
  /* 取り込み画面はリザルトの操作メニューから開く。
     ただし反映先は1件のリザルトではなくアカウント全体。 */
  assert.doesNotMatch(led, /importFor/);
  assert.doesNotMatch(sections, /applyGarasumadoImport[\s\S]{0,400}?resultId/);
/* 出力（変換）は撤去。入力（取り込み）だけを残す。 */
  assert.match(led, /"aria-expanded": exportFor === result\.id/);
  assert.match(led, /setExportFor\(exportFor === result\.id \? null : result\.id\)/);
  assert.match(led, /role: "menu"[\s\S]{0,200}?role: "menuitem"/);
  /* シナリオ1件 = リザルト1件。順序が歸属を決める。 */
  assert.match(read("../js/garasumado-roster-import.js"), /actions\.push\(\{ type: "ADD_RESULT", name: scenario\.name/);
  /* アカウント編集側にも同じ取り込みが生きている。 */
  assert.match(acct, /function applyGarasumadoImport\(result\)/);
  assert.match(acct, /lbt:apply-import/);
});

test("無料の精神は最初から所持として数える（購入ではない）", () => {
  /* 「初期選択可」は選ぶかどうかの表示ではなく、初めからあるもの。 */
  assert.match(reducer, /function initialFreeSpirits\(\)/);
  assert.match(reducer, /const free = list\.filter\(\(s\) => s && s\.name && !\(Number\(s\.price\) > 0\)\);/);
  /* 新規アカウントは就已経入っている。 */
  assert.match(reducer, /roster: \{ spirits: initialFreeSpirits\(\) \}/);
  assert.match(reducer, /for \(const seed of initialFreeSpirits\(\)\) \{[\s\S]{0,140}?if \(!ownedSpirit\.has\(seed\.name\)\) spiritList\.push\(seed\);/);
  /* 既存アカウントは読み込み時に補完（明細は立てない）。 */
  /* 判定は保存経路に依存させない（origin は保存で落ちる）。 */
  assert.match(sections, /const spiritInitialSeeded = \(state\.roster\?\.spirits \|\| \[\]\)\.filter\(\(entry\) => \{[\s\S]{0,200}?!\(Number\(def\.price\) > 0\)/);
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
  /* 歸属を外す（未分類へ戻す）と削除は別ボタン。 */
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
  /* 購入導線は購入として明細を立てる。 */
  const addRoster = state.slice(state.indexOf('case "ADD_ROSTER"'), state.indexOf('case "ADD_ROSTER_EGO"'));
  assert.match(addRoster, /if \(!action\.purchase\) return next;/);
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
  assert.match(codex, /open: !!selectedPersona, onClose: \(\) => setSelectedPersona\(null\)/);
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
  /* 出典フィルタはビルドと同じ DOM 注入フックに任せる。 */
  assert.match(shop, /useSourceFilterControl\(tab === "support" \? "サポート" : "精神", sourceFilter, setSourceFilter\);/);
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
  assert.match(css, /@media \(max-width: 640px\) \{\s*\/\* 狭幅でタブ帯の文字を押し潰さず横スクロールで到達可能にする。 \*\/\s*\.build-tabs \.segmented \{ overflow-x: auto; \}/);
});