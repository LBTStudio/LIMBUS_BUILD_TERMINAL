import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";
import test from "node:test";
import { loadRuntime } from "../tools/provenance/pipeline-harness.mjs";

/* ---------------------------------------------------------------------------
   アカウント切替UI（SINNER SELECT オーバーレイ）の構造・操作・アクセシビリティを
   ソース解析で固定する。描画ごとのE2Eは別途ブラウザで確認し、ここでは
   「規約からの逸脱」を機械的に弾く。

     - prompt() を使わない（インラインフォームへ移行済み）
     - モーダル規約: role=dialog / aria-modal / Esc / フォーカストラップ
     - トークン設計: 色をハードコードしない
     - transition: all を使わない
     - タッチデバイスでは hover に依存しない
--------------------------------------------------------------------------- */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ui = readFileSync(new URL("../js/accounts-ui.js", import.meta.url), "utf8");
const stateSource = readFileSync(new URL("../js/state.js", import.meta.url), "utf8");
const app = readFileSync(new URL("../js/App.js", import.meta.url), "utf8");
const sections = readFileSync(new URL("../js/OtherSections.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../assets/v66-accounts.css", import.meta.url), "utf8");
const cloudPanelSource = readFileSync(new URL("../js/cloud-backup.js", import.meta.url), "utf8");
const cloudPanelCss = readFileSync(new URL("../assets/cloud-backup.css", import.meta.url), "utf8");
const accountsUiSource = readFileSync(new URL("../js/accounts-ui.js", import.meta.url), "utf8");
const indexHtml = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const uiAuditSource = readFileSync(new URL("../tools/ui/capture-ui-audit.mjs", import.meta.url), "utf8");
const accountLayoutCaptureSource = readFileSync(new URL("../tools/ui/capture-account-layout-screenshots.mjs", import.meta.url), "utf8");
const visualSystem = readFileSync(new URL("../assets/v71-unified-visual.css", import.meta.url), "utf8");

test("作成・名前変更はインラインフォームで行い prompt に依存しない", () => {
  assert.doesNotMatch(ui, /prompt\(/, "prompt は入力のために文脈を消すので使わない");
  assert.match(ui, /acct-card--form/, "フォームはカード化する");
  assert.match(ui, /setDraft\(\{ \.\.\.draft, name: event\.target\.value \}\)/);
  assert.match(ui, /window\.LBT_accounts\?\.update\?\.\(editingId/, "名前・用途の保存は update");
  const saveEdit = ui.slice(ui.indexOf("const saveEdit ="), ui.indexOf("const saveCreate ="));
  assert.ok(saveEdit.includes("const updated = window.LBT_accounts?.update?.("), "更新結果を確認する");
  assert.ok(saveEdit.includes("if (!updated)"), "保存失敗を検知する");
  assert.ok(saveEdit.includes("アカウントを更新できませんでした"), "失敗理由を表示する");
  assert.ok(saveEdit.indexOf("if (!updated)") < saveEdit.indexOf("cancelForm()"), "失敗時はフォームを閉じない");
  assert.match(ui, /window\.LBT_accounts\?\.create\?\.\(draft\.name\.trim\(\)/, "作成後にそのアカウントへ切替");
  assert.doesNotMatch(sections, /prompt\("新しいアカウント名/, "アカウント作成の prompt を残さない");
  assert.doesNotMatch(sections, /prompt\("アカウント名", acc\.name/, "アカウント改名の prompt を残さない");
  assert.doesNotMatch(sections, /doSwitchAccount|doCreateAccount|doRenameAccount|doDeleteAccount/, "古いインライン実装の変数を残さない");
});

test("アイコン保存・解除に失敗したとき成功扱いせず、通知を出す", () => {
  const editor = ui.slice(ui.indexOf("function useAccountIconEditor"), ui.indexOf("function AccountMark"));
  const switcher = ui.slice(ui.indexOf("const saveCreate ="), ui.indexOf("const doSelect ="));
  const clear = editor.slice(editor.indexOf("const clearIcon ="), editor.indexOf("const applyCrop ="));

  assert.match(clear, /アイコンを外せませんでした/);
  assert.match(clear, /toast\("アイコンを外せませんでした（保存領域が使用できません）", "assertive"\)/);
  assert.match(switcher, /const iconSaved = !pendingIcon \|\| window\.LBT_accounts\?\.setIcon\?\./);
  assert.match(switcher, /アカウントは作成されましたが、アイコンを保存できませんでした/);
  assert.match(switcher, /アカウントは作成されましたが、切替に失敗しました/);
  assert.ok(switcher.indexOf("if (!iconSaved)") < switcher.indexOf("window.LBT_accounts?.switch?."), "アイコン保存失敗時はリロード前に通知する");
});

test("削除は確認つきで、最後の1件は削除できない", () => {
  assert.match(ui, /if \(!confirm\(`アカウント「\$\{entry\.name\}」を削除しますか？/, "削除は confirm を通す");
  assert.match(ui, /window\.LBT_accounts\?\.delete\?\.\(entry\.id\)/);
  assert.match(ui, /canRemove: total > 1/, "最後の1件には削除ボタンを出さない");
  assert.match(ui, /最後のアカウントは削除できません/, "最後の1件は削除できない");
  assert.match(ui, /アカウントを削除できませんでした（保存領域が使用できない可能性があります）/, "保存失敗を最後の1件と誤案内しない");
});

test("モーダル規約: role/aria-modal/Esc/フォーカストラップ/初期フォーカス", () => {
  assert.match(ui, /role: "dialog", "aria-modal": "true", "aria-labelledby": "acct-panel-title"/);
  assert.match(ui, /if \(event\.key === "Escape"\) \{ event\.preventDefault\(\); requestClose\(\); return; \}/);
  assert.match(ui, /querySelectorAll\('button:not\(\[disabled\]\), \[href\], input:not\(\[disabled\]\), select, textarea'\)/, "フォーカス可能要素を収集する");
  assert.match(ui, /event\.shiftKey && document\.activeElement === first/, "Tab で循環させる");
  assert.match(ui, /requestAnimationFrame\(\(\) => focusables\(\)\[0\]\?\.focus\(\)\)/, "開いたら最初の要素へフォーカス");
});

test("アクティブアカウントは色・バッジ・aria-label で多重に示す", () => {
  assert.match(ui, /acct-card\$\{active \? " is-active" : ""\}/);
  assert.match(ui, /className: "acct-badge"/, "使用中バッジは金地＋テキスト（色だけに頼らない）");
  assert.match(ui, /Icon, \{ name: "check", size: 10 \}/);
  assert.match(css, /\.acct-card\.is-active \{[\s\S]*?border-color: var\(--gold\)/, "アクティブは金枠");
});

test("選択領域は1ボタン=1カードで、aria-label に判断材料を全部載せる", () => {
  assert.match(ui, /className: "acct-card-hit", onClick: onSelect, "aria-label": cardLabel/);
  assert.match(ui, /const cardLabel = `アカウント「\$\{entry\.name\}」へ切替/, "ラベルに名前・用途・最終更新を含める");
  assert.match(ui, /aria-label": `\$\{entry\.name\} の名前と用途を編集`/);
  assert.match(ui, /aria-label": `\$\{entry\.name\} を削除`/);
  /* カード内にネストしたボタンを置かない（hit はカード全面の兄弟要素）。 */
  assert.doesNotMatch(ui, /<button[\s\S]*?<button/, "button の入れ子を作らない");
});

test("編集ボタンはラベル付きで常時表示し、hover に依存しない", () => {
  assert.match(ui, /className: "acct-icon-btn acct-edit-btn"/, "編集を操作列に置く");
  assert.match(ui, /h\("span", null, "編集"\)/, "アイコンだけでなく編集ラベルを表示");
  const actions = css.match(/\.acct-card-actions\s*\{([^}]*)\}/s)?.[1] || "";
  assert.match(actions, /opacity:\s*1;/, "操作列は常時表示");
  assert.match(actions, /transform:\s*none;/, "出現時の移動を行わない");
  assert.doesNotMatch(css, /\.acct-card:hover \.acct-card-actions/, "hoverを表示条件にしない");
  assert.doesNotMatch(css, /\.acct-card:focus-within \.acct-card-actions/, "focus時だけの表示にしない");
});

test("状態の所在は App に一元化し、設定からはイベントだけで開く", () => {
  assert.match(app, /const \[accountSwitcherOpen, setAccountSwitcherOpen\] = React\.useState\(false\)/);
  assert.match(app, /window\.addEventListener\("lbt:open-accounts", onOpenAccounts\)/);
  assert.ok(app.includes("React.createElement(AccountSwitcher, { open: accountSwitcherOpen, initialEditId: accountSwitcherInitialEditId"), "編集対象IDを共有スイッチャーへ渡す");
  assert.ok(app.includes("setAccountSwitcherInitialEditId(null)"), "閉じると編集対象を解除する");
  assert.match(app, /React\.createElement\(AccountChip, null\)/, "topbar にアカウント chip");
  assert.match(sections, /window\.dispatchEvent\(new CustomEvent\("lbt:open-accounts"\)\)/, "設定は open イベントを投げるだけ");
  assert.doesNotMatch(sections, /setAccountSwitcherOpen/, "設定側に開閉状態を持たせない");
});

test("デザイントークンのみを使い、色をハードコードしない・transition:all を使わない", () => {
  const hexColors = css.match(/#[0-9a-fA-F]{3,8}\b/g) || [];
  assert.equal(hexColors.length, 0, `CSS にハードコード色を置かない: ${hexColors.join(",")}`);
  assert.doesNotMatch(css, /transition:\s*all\b/, "transition は対象プロパティを名指しする");
  assert.match(css, /var\(--gold\)/);
  assert.match(css, /var\(--surface-1\)/);
  assert.match(css, /var\(--r-lg\)/);
  assert.match(css, /min\(calc\(var\(--i, 0\) \* 100ms\), 500ms\)/, "カードは100ms間隔・上限500msで順入り");
  assert.match(css, /scale\(\.96\)/, "パネル登場は 0.96→1");
});

test("低頻度の演出と低負荷の操作を使い分ける", () => {
  assert.match(css, /@keyframes acct-pop/);
  assert.match(css, /@keyframes acct-card-in/);
  assert.match(css, /\.acct-overlay\.is-closing \{[\s\S]*?animation: acct-fade-out 140ms/, "退出は短いフェードのみ");
  assert.match(css, /prefers-reduced-motion|反転/, "prefers-reduced-motion はグローバル規約に委ねる");
  assert.match(css, /@media \(max-width: 640px\)/, "密画面では chip の文字を落とす");
});

test("アイコン画像はアップロードでき、未設定時は頭文字モノグラムに戻る", () => {
  assert.match(ui, /function AccountMark\(\{ icon, name, className \}\)/, "アイコンと名前を受け取る描画部品");
  assert.match(ui, /if \(icon\) \{[\s\S]*?h\("img", \{ className: "acct-mark-img", src: icon, alt: ""/, "画像がある場合は img を使う");
  assert.match(ui, /return h\("span", \{ className: `acct-mark \$\{className \|\| ""\}`\.trim\(\), "aria-hidden": "true" \}, accountMonogram\(name\)\);/, "無い場合は頭文字");
  assert.match(ui, /"aria-hidden": "true"[\s\S]{0,80}alt: ""/, "アイコンは装飾なので読み上げ対象外");
  assert.match(ui, /icon: info\.icons\?\.\[info\.activeId\]/, "chip・要約もアクティブのアイコンを使う");
});

test("アイコンのアップロードは圧縮せず円形エディタへ渡し、解除もできる", () => {
  assert.match(ui, /function useAccountIconEditor\(onStored\) \{/, "ゲート・オーバーレイ共通の導線");
  assert.match(ui, /const sourceUrl = window\.LBT_iconCrop\?\.loadIconSource\?\.\(file, \(message\) => toast\(message, "assertive"\)\);/, "選ぶだけでは圧縮しない");
  assert.match(ui, /h\(IconCropEditor, \{/, "エディタを開く");
  assert.match(ui, /onApply: applyCrop/, "決定後に適用する");
  assert.match(ui, /onCancel: cancelCrop/, "キャンセルは破棄する");
  assert.match(ui, /URL\.revokeObjectURL\(editing\.sourceUrl\)/, "キャンセル時に objectURL を解放する");
  assert.match(ui, /window\.LBT_iconCrop\?\.cropToIconDataUrl\?\.\(sourceUrl, transform\)/, "圧縮は決定後の切り抜き時だけ");
  assert.match(ui, /if \(accountId === PENDING_ACCOUNT_ID\) return \{ pending: true, data: result\.data, bytes: result\.bytes \|\| 0 \};/, "未作成は保存せず dataURI を返す");
  assert.match(ui, /window\.LBT_accounts\?\.removeIcon\?\.\(accountId\)/, "解除は removeIcon");
  assert.match(ui, /input\.accept = "image\/png,image\/jpeg,image\/webp";/, "受け付ける形式を input に明示");
  assert.match(ui, /input\.type = "file";/, "選択は都度の input で行う（状態を持たせない）");
  assert.match(ui, /onPickIcon: \(\) => iconEditor\.startPick\(entry\.id\)/, "既存アカウントは編集フォームから選ぶ");
  assert.match(ui, /iconEditor\.editor/, "エディタはオーバーレイの最上位に重ねる");
});

test("未作成アカウントのアイコンは保留して作成後に適用する", () => {
  assert.match(ui, /const PENDING_ACCOUNT_ID = "__pending";/);
  assert.match(ui, /if \(pendingIcon\) window\.LBT_accounts\?\.setIcon\?\.\(created\.id, pendingIcon\);/, "作成成功後にアイコンを適用");
  assert.match(ui, /icon: pendingIcon, name: draft\.name/, "保留中もプレビューする");
  assert.match(ui, /onClick: \(\) => iconEditor\.startPick\(PENDING_ACCOUNT_ID\)/, "保留もエディタ経由");
});

test("アクセス時のアカウント選択ゲートは毎回出て、選んだらそのアカウントで開く", () => {
  assert.match(ui, /const AccountGate = \(\) => \{/);
  assert.match(ui, /h\("main", \{ className: "acct-gate" \}/, "ゲート表示中は本体が出ないので main ランドマークになる");
  assert.match(ui, /h\("h1", \{ className: "acct-kicker", id: "acct-gate-title" \}/, "見出しはh1（本体が無いため）");
  assert.match(ui, /role: "dialog", "aria-modal": "true", "aria-labelledby": "acct-gate-title"/);
  /* 選んだアカウントで開く。ここで location.reload() すると常時ゲートと
     競合して「選んでもう一度ゲート」のループになるので使わない。 */
  const gateSource = ui.slice(ui.indexOf("const AccountGate"));
  assert.match(ui, /const ACCOUNTS_ENTERED_EVENT = "lbt:accounts-entered";/);
  assert.match(gateSource, /const choose = \(id\) => \{[\s\S]*?window\.LBT_accounts\?\.switch\?\.\(id\)[\s\S]*?window\.dispatchEvent\(new CustomEvent\(ACCOUNTS_ENTERED_EVENT, \{ detail: \{ id \} \}\)\)/, "選択は切替+通知");
  assert.match(gateSource, /CustomEvent\(ACCOUNTS_ENTERED_EVENT, \{ detail: \{ id: created\.id \} \}\)/, "作成も切替+通知");
  assert.doesNotMatch(gateSource, /location\.reload\(\)/, "ゲート内で再読込に逃げない（常時ゲートとループする）");
  /* App は通知を受けて state を作り直し、保存の束縛先も差し替える。 */
  assert.match(app, /window\.addEventListener\("lbt:accounts-entered", onAccountsEntered\)/);
  assert.match(app, /window\.__LBT_BOOT_ACCOUNT_ID = id;/, "保存先を選んだアカウントに更新");
  assert.match(app, /dispatch\(\{ type: "RELOAD_ACCOUNT" \}\)/, "そのアカウントの保存領域で state を作り直す");
  assert.match(app, /const \[accountGateOpen, setAccountGateOpen\] = React\.useState\(\(\) => window\.LBT_accounts\?\.storageAvailable\?\.\(\) !== false\)/, "毎回ゲートを出す（保存領域が使えない時だけ素通し）");
  assert.match(app, /React\.createElement\(AccountGate, null\)/, "ゲート中は本体を描画しない");
  assert.match(stateSource, /case "RELOAD_ACCOUNT":[\s\S]*?window\.LBT_accounts\?\.loadActive\?\.\(\)/, "reducer が選んだアカウントの保存領域を読み直す");
  assert.match(stateSource, /storageAvailable: \(\) => lbtStorage\(\) !== null/, "保存領域の有無を判定できるAPI");
});

test("旧セーブ保持者もゲートでアカウント1を選んでから入る（データは保持）", () => {
  assert.match(stateSource, /if \(legacyRaw == null\) return \{ accounts: \[\], activeId: null \};/, "旧データが無い初回は自動採番しない");
  assert.match(stateSource, /const account = normalizeAccountEntry\(\{[\s\S]*?name: legacyState\?\.charName \|\| legacyState\?\.personaSrc\?\.name \|\| "アカウント1"/, "旧データがあれば名前を採ってアカウント1にする");
});

test("アイコンUIとゲートのCSSがトークンのみで定義されている", () => {
  assert.match(css, /\.acct-mark-img \{/, "カードのアイコン画像");
  assert.match(css, /object-fit: cover;/, "はみ出しを切る");
  assert.match(css, /\.acct-chip-img \{/, "topbar chip のアイコン画像");
  assert.match(css, /\.acct-icon-row \{/, "アイコン設定行");
  assert.match(css, /\.acct-upload-btn \{/, "アップロードボタン");
  assert.match(css, /\.acct-gate \{/, "アクセス時のゲート");
  assert.match(css, /\.acct-card--gate \{/, "ゲート内のカード");
  assert.match(css, /\.acct-gate-cta \{/, "開く旨の導線");
  assert.match(css, /\.acct-gate\s*\{[^}]*z-index:\s*10060;/s, "ゲートは背景レイヤーに残す");
  assert.match(css, /\.acct-overlay\s*\{[^}]*z-index:\s*10065;/s, "ゲートから開いた編集オーバーレイはゲートより前面");
});

test("カードの選択領域は表示要素より前面、管理ボタンはその上に配置する", () => {
  const hit = css.match(/\.acct-card-hit\s*\{([^}]*)\}/s)?.[1] || "";
  const actions = css.match(/\.acct-card-actions\s*\{([^}]*)\}/s)?.[1] || "";
  const gateEdit = css.match(/\.acct-gate-edit-btn\s*\{([^}]*)\}/s)?.[1] || "";
  const gateCta = css.match(/\.acct-gate-cta\s*\{([^}]*)\}/s)?.[1] || "";
  assert.match(hit, /position:\s*absolute/);
  assert.match(hit, /inset:\s*0/);
  assert.match(hit, /z-index:\s*1/);
  assert.match(hit, /pointer-events:\s*auto/);
  assert.match(actions, /z-index:\s*2/);
  assert.match(gateEdit, /position:\s*absolute/);
  assert.match(gateEdit, /z-index:\s*2/);
  assert.match(gateEdit, /display:\s*inline-flex/);
  assert.match(gateCta, /pointer-events:\s*none/);
});

test("起動時のアカウント選択画面にも常時表示の編集ボタンを置き、対象アカウントを直接編集する", () => {
  const gateSource = ui.slice(ui.indexOf("const AccountGate"));
  assert.ok(gateSource.includes('className: "acct-gate-edit-btn"'), "起動時カードに専用の編集ボタン");
  assert.ok(gateSource.includes("detail: { editId: entry.id }"), "クリックしたアカウントIDを渡す");
  assert.ok(gateSource.includes('"aria-haspopup": "dialog"'), "ダイアログを開く操作として明示");
  assert.match(ui, /const AccountSwitcher = \(\{ open, onClose, initialEditId, existingResults = \[\] \}\) => \{/);
  assert.match(ui, /if \(!open \|\| !initialEditId\) return;[\s\S]*?setEditingId\(entry\.id\)/, "対象IDを受け取り編集フォームへ入る");
  assert.ok(app.includes("accountSwitcherInitialEditId"), "編集対象IDを App で管理");
  assert.ok(app.includes("event.detail?.editId || null"), "イベントから対象IDを受け取る");
  assert.ok(app.includes("React.createElement(React.Fragment, null,"), "ゲートと共通編集UIを同時に描画");
  assert.ok(app.includes("React.createElement(AccountGate, null),\n      React.createElement(AccountSwitcher,"), "ゲート表示中も共通編集UIをマウント");
  const editStyles = css.match(/\.acct-gate-edit-btn\s*\{([^}]*)\}/s)?.[1] || "";
  assert.match(editStyles, /z-index:\s*2/);
  assert.match(editStyles, /min-height:\s*30px/);
  assert.doesNotMatch(editStyles, /opacity:\s*0|visibility:\s*hidden|display:\s*none/);
});

test("切り抜きエディタは丸い枠・グリッド・実サイズプレビューを持つ", () => {
  assert.match(css, /\.acct-crop-stage \{/, "切り抜き枠");
  assert.match(css, /\.acct-crop-stage\{[^}]*border-radius: 50%|\.acct-crop-stage \{[^}]*border-radius: 50%/, "枠は円（BAND ・LinkedIn 系の方式）");
  assert.match(css, /box-shadow: 0 0 0 9999px rgba\(6, 4, 3, \.72\)/, "枠の外は暗く落として残る部分を判別させる");
  assert.match(css, /linear-gradient\(to right, transparent 33\.2%/, "三分割グリッドで位置を合わせる");
  assert.match(css, /\.acct-crop-thumb--sm \{ width: 20px; height: 20px; \}/, "chip と同じ実サイズのプレビュー");
  assert.match(css, /\.acct-crop-thumb--md \{ width: 44px; height: 44px; \}/, "カードと同じ実サイズのプレビュー");
  assert.match(css, /\.acct-crop-foot \{/, "決定・取消しのフッター");
});

test("index.html がアセットとレイヤーを宣言している", () => {
  assert.match(indexHtml, /assets\/v66-accounts\.css\?v=[0-9a-f]+/, "CSS は版付きで読み込む");
  assert.match(indexHtml, /js\/accounts-ui\.js\?v=[0-9a-f]+/, "JS は版付きで読み込む");
  assert.match(indexHtml, /js\/icon-cropper\.js\?v=[0-9a-f]+/, "切り抜きエディタも版付きで読み込む");
  assert.match(indexHtml, /@layer[\s\S]*?\bv66-accounts\s*[,;]/, "レイヤー順を index.html で宣言する");
});

/* topbar の残高は LP と欠片だけだった。抽出チケットも「何枚あるか」を
   同じ場所に同じ形で出す。0 枚でも枠を残し、aria からも落とさない。 */
test("topbar の残高に抽出チケットの枚数が出る（LP・欠片と同じ形）", () => {
  const src = readFileSync(new URL("../js/accounts-ui.js", import.meta.url), "utf8");
  const chip = src.slice(src.indexOf("const BalanceChip"), src.indexOf("const AccountSummary"));
  assert.match(chip, /LBT_computeTicketBalance/, "チケット残数を計算している");
  assert.match(chip, /\["persona", "ego", "choice"\]/, "種別を全て足している");
  assert.match(chip, /tickets\.pack/, "パック別も足している");
  assert.match(chip, /topbar-balance-unit" \}, "枚"/, "残数に「枚」の単位が出る");
  assert.match(chip, /抽出チケット 0枚/, "0 枚でも aria に残る");
});

/* 戦術スキルのダイス行は「マッチ / ダメージ」をダイスごとに交互に置いていた。
   2 ダイスなら 2-1：マッチ / 2-1：ダメージ / 2-2：マッチ / 2-2：ダメージ となり、
   どのダイスが高度かを読めなかった。マッチ行を揃え、ダメージ行を揃える。 */
test("戦術スキルの行はマッチを揃えてからダメージを並べる", () => {
  const gen = loadRuntime().gen;
  const state = {
    ...loadRuntime().initialState,
    name: "監査用", san: 10, personaSrc: { name: "黒雲会組員", hp: 105, san: 48 },
    skills: [{
      name: "術2 後始末", type: "貫通", sin: "傲慢", rank: "スキル2",
      dice: [{ roll: "3d5", effect: "的中時、次のRに出血2を付与" }, { roll: "2d7", effect: "" }]
    }]
  };
  const cmds = String(gen.buildCcfoliaJSON(state).data.commands || "");
  const rows = cmds.split("\n").map((s) => s.trim()).filter((l) => /\{MT\}|\{DM\}/.test(l));
  const kinds = rows.map((r) => (r.includes("{MT}") ? "M" : "D")).join("");
  assert.ok(rows.length >= 4, "2 ダイスぶんの行がある");
  assert.equal(kinds, "MMDD", "交互ではなくマッチ→ダメージで整列している");
  assert.match(rows[0], /2-1：マッチ$/, "先頭は 2-1 のマッチ");
  assert.match(rows[1], /2-2：マッチ$/, "次もマッチ");
  assert.match(rows[2], /2-1：ダメージ$/, "その後に 2-1 のダメージ");
  assert.match(rows[3], /2-2：ダメージ$/, "最後に 2-2 のダメージ");
});


test("共有URL取込は説明付きの主導線として見つけられ、既存の共通パネルを使う", () => {
  assert.match(ui, /className: "acct-gara-row"/, "独立した取込セクション");
  assert.match(ui, /className: "acct-gara-title"/, "目的が分かる見出し");
  assert.ok(ui.includes('className: `acct-import-toggle${importOpen ? " is-open" : ""}`'), "目立つ開閉ボタン");
  assert.ok(ui.includes('"aria-controls": `acct-import-panel-${entry.id}`'), "操作ボタンとパネルを関連付ける");
  assert.match(ui, /role: "region", "aria-label": "共有URLの取り込み"/, "展開領域に名前を付ける");
  assert.match(ui, /h\(window\.GarasumadoImportPanel,/, "リザルトと同じ取込パネルを再利用");
  assert.match(css, /\.acct-import-toggle\s*\{/, "見つけやすい取込CTAのスタイル");
  assert.match(css, /\.acct-import-toggle:focus-visible\s*\{/, "キーボードフォーカスが見える");
});

test("SINNER SELECT内の共有URL取込は全列を使い、本文が狭いカード幅に押し込まれない", () => {
  assert.ok(ui.includes("acct-card--import-open"), "展開状態のクラスを反映");
  assert.ok(ui.includes('"data-account-id": entry.id'), "編集前後で安定IDを維持する");
  assert.match(css, /\.acct-card--import-open\s*\{[\s\S]*?grid-column:\s*1\s*\/\s*-1;/);
  assert.match(css, /\.acct-card--import-open \.acct-gara-body\s*\{[^}]*min-width:\s*0;[^}]*width:\s*100%;/);
  assert.match(css, /\.acct-card--import-open \.gara\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);[^}]*min-width:\s*0;[^}]*width:\s*100%;/);
  assert.match(css, /\.acct-card--import-open \.gara-rail\s*\{[^}]*position:\s*static/s);
  assert.match(css, /\.acct-card--import-open:hover,[\s\S]*?\.acct-card--import-open:focus-within\s*\{\s*transform:\s*none;\s*box-shadow:\s*none;/);
  assert.match(css, /\.gara\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(240px,\s*320px\)/);
});


test("SINNER SELECT はアカウント一覧と復旧操作を独立ペインにし、キー入力中も一覧を残す", () => {
  assert.equal((ui.match(/className: "acct-panel-layout"/g) || []).length, 2,
    "起動ゲートと管理画面の両方を二領域レイアウトにする");
  assert.equal((ui.match(/className: "acct-panel-accounts"/g) || []).length, 2,
    "アカウント一覧の領域を独立させる");
  assert.equal((ui.match(/className: "acct-panel-cloud"/g) || []).length, 2,
    "復旧パネルの領域を独立させる");
  assert.match(ui, /className: "acct-grid acct-grid--manager"/, "管理画面の一覧を識別する");
  assert.match(ui, /className: "acct-grid acct-grid--gate"/, "起動ゲートの一覧を識別する");
  assert.match(css, /\.acct-panel-layout \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) minmax\(300px, 360px\);/);
  assert.match(css, /\.acct-panel-accounts \{[\s\S]*?min-height: 0;[\s\S]*?overflow: hidden;/);
  assert.match(css, /\.acct-panel-accounts > \.acct-grid \{[\s\S]*?flex: 1 1 auto;[\s\S]*?min-height: 0;[\s\S]*?overflow-y: auto;/);
  assert.match(css, /\.acct-panel-cloud \{[\s\S]*?overflow-y: auto;/,
    "長い照合結果は保全側の領域だけでスクロールする");
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?grid-template-columns: minmax\(0, 1fr\);[\s\S]*?grid-template-rows: minmax\(140px, 1fr\) minmax\(112px,/,
    "狭い画面では上下に並べ、両領域に最低高さを確保する");
  assert.match(css, /\.acct-panel-accounts > \.acct-grid--manager,[\s\S]*?\.acct-panel-accounts > \.acct-grid--gate \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\);/,
    "スマートフォンではアカウントカードを1列表示にする");
  assert.match(uiAuditSource, /panel\?\.querySelector\("\.acct-panel-accounts > \.acct-grid--gate"\)/,
    "起動ゲートの監査は分離後の一覧ペインを参照する");
  assert.match(uiAuditSource, /panel\?\.querySelector\("\.acct-panel-accounts > \.acct-grid--manager"\)/,
    "管理画面の監査は分離後の一覧ペインを参照する");
  assert.match(uiAuditSource, /panel\?\.querySelector\("\.acct-panel-cloud > details\.lbt-cloud-panel"\)/,
    "保全パネルの折りたたみ状態を新しいペイン内で確認する");
  assert.doesNotMatch(uiAuditSource, /:scope > \.acct-grid|:scope > (?:details\.)?lbt-cloud-panel|\.acct-panel > \.acct-grid/,
    "監査側に旧DOM構造の直下参照を残さない");
});

test("オンライン保全のsummaryはブラウザー標準マーカーを隠し、カスタム矢印だけを使う", () => {
  assert.match(cloudPanelCss, /\.lbt-cloud-summary\s*\{[^}]*display:\s*block;[^}]*position:\s*relative;/,
    "summary本体はネイティブマーカーを消せるブロック表示にする");
  assert.match(cloudPanelCss, /\.lbt-cloud-chevron\s*\{[^}]*position:\s*absolute;[^}]*top:\s*50%;[^}]*right:\s*0;/,
    "カスタム矢印だけをsummary内の専用位置に置く");
  assert.match(cloudPanelCss, /\.lbt-cloud-summary::marker\s*\{[^}]*content:\s*none !important;[^}]*display:\s*none !important;/,
    "標準のdetailsマーカーを全ブラウザーで無効化する");
  assert.match(cloudPanelCss, /\.lbt-cloud-summary::-webkit-details-marker\s*\{[^}]*display:\s*none !important;[^}]*content:\s*none !important;/,
    "Chromium/WebKitのネイティブ三角を無効化する");
  assert.match(cloudPanelCss, /\.lbt-cloud-panel\[open\] > \.lbt-cloud-summary \.lbt-cloud-chevron\s*\{[^}]*transform:\s*translateY\(-50%\) rotate\(180deg\)/,
    "開閉状態の変化はカスタム矢印だけで示す");
  assert.match(visualSystem, /\.acct-panel-cloud > details\.lbt-cloud-panel > summary\.lbt-cloud-summary\s*\{[^}]*display:\s*block !important;[^}]*list-style:\s*none !important;[^}]*appearance:\s*none !important;/,
    "最終視覚レイヤーでネイティブsummaryマーカーの表示方式を解除する");
  assert.match(visualSystem, /summary\.lbt-cloud-summary::-webkit-details-marker\s*\{[^}]*display:\s*none !important;/,
    "最終視覚レイヤーでもChromiumの標準マーカーを抑止する");
  assert.match(visualSystem, /summary\.lbt-cloud-summary::after\s*\{[^}]*content:\s*none !important;[^}]*display:\s*none !important;/,
    "v67共通ルールの▲／▼だけを保全パネルから除去する");
});

test("オンライン保全は初期折りたたみで、SINNER SELECTの一覧領域を圧迫しない", () => {
  const start = cloudPanelSource.indexOf('return h("details", { className: "lbt-cloud-panel"');
  assert.notEqual(start, -1, "オンライン保全はネイティブdetailsで開閉できる");
  const end = cloudPanelSource.indexOf("\n  }\n\n  window.LBTCloudBackup", start);
  assert.ok(end > start, "パネル描画の終端を特定できる");
  const panel = cloudPanelSource.slice(start, end);
  assert.match(panel, /h\("summary", \{ className: "lbt-cloud-summary" \}/, "閉じた状態でも見出しと状態を表示");
  assert.match(panel, /h\("div", \{ className: "lbt-cloud-content" \}/, "保全・照合・復元操作を内容領域に保持");
  assert.doesNotMatch(panel.slice(0, panel.indexOf("h(\"div\", { className: \"lbt-cloud-content\"")), /\bopen:\s*true/, "初期状態で自動展開しない");
  for (const control of ["復旧キーを発行して保全", "全アカウントをJSON保存", "このキーを照合", "JSONファイルから復元"]) {
    assert.ok(panel.includes(control), control + " は折りたたみ内部に残る");
  }
  assert.match(cloudPanelCss, /\.lbt-cloud-summary\s*\{/, "summaryはクリック可能な表示");
  assert.match(cloudPanelCss, /\.lbt-cloud-panel\[open\] > \.lbt-cloud-summary \.lbt-cloud-chevron/, "開閉状態を矢印で示す");
});


test("SINNER SELECTの編集中カードは全列を使い、フォーム下部の取込操作まで表示する", () => {
  const start = css.indexOf(".acct-grid > .acct-card--form,");
  assert.notEqual(start, -1, "編集中カード専用のgridルールがある");
  const end = css.indexOf("\n}", start);
  const rule = css.slice(start, end);
  for (const declaration of [
    "grid-column: 1 / -1;",
    "width: 100%;",
    "min-height: max-content;",
    "height: auto;",
    "align-self: start;"
  ]) assert.ok(rule.includes(declaration), "編集中カードに " + declaration + " がある");
  assert.ok(accountsUiSource.includes('className: "acct-grid acct-grid--manager" + (editingId || creating ? " is-editing" : "")'),
    "編集または新規作成中だけ一覧にis-editingクラスを付ける");
  const flexStart = css.indexOf(".acct-grid.is-editing {");
  assert.notEqual(flexStart, -1, "編集時専用のフロー表示がある");
  const flexEnd = css.indexOf("\n}", flexStart);
  const flexRule = css.slice(flexStart, flexEnd);
  for (const declaration of ["display: flex;", "flex-direction: column;", "align-items: stretch;"])
    assert.ok(flexRule.includes(declaration), "編集時一覧に " + declaration + " がある");
  const cardRuleStart = css.indexOf(".acct-panel-accounts > .acct-grid--manager > .acct-card:not(.acct-card--form):not(.acct-card--add)");
  assert.notEqual(cardRuleStart, -1, "管理画面カードだけに行高を適用する");
  const cardRuleEnd = css.indexOf("\n}", cardRuleStart);
  const cardRule = css.slice(cardRuleStart, cardRuleEnd);
  assert.ok(cardRule.includes("min-height: 184px;"), "管理画面カードは内容と操作が重ならない高さを持つ");
  const sharedScrollRule = css.lastIndexOf(".acct-panel-accounts > .acct-grid {");
  const managerTrackRule = css.lastIndexOf(".acct-panel-accounts > .acct-grid--manager {");
  const gateTrackRule = css.indexOf(".acct-panel-accounts > .acct-grid--gate {");
  assert.ok(sharedScrollRule >= 0 && managerTrackRule > sharedScrollRule && gateTrackRule > sharedScrollRule,
    "共通スクロール指定の後ろで管理画面・起動ゲートの行トラックを分ける");
  const managerTrack = css.slice(managerTrackRule, css.indexOf("}", managerTrackRule));
  const gateTrack = css.slice(gateTrackRule, css.indexOf("}", gateTrackRule));
  assert.ok(managerTrack.includes("grid-auto-rows: minmax(184px, max-content);"),
    "管理画面の行トラックはカード高と同じ184px以上");
  assert.ok(gateTrack.includes("grid-auto-rows: minmax(156px, max-content);"),
    "起動時ゲートの行トラックは156px以上を維持");
});


test("アカウント編集のキャンセル・保存後にカードのクリック判定とフォーカスを復元する", () => {
  const regularCard = ui.slice(ui.indexOf('const cardLabel ='), ui.indexOf('const AccountSwitcher ='));
  const cancel = ui.slice(ui.indexOf('const cancelForm ='), ui.indexOf('cancelFormRef.current = cancelForm;'));
  const select = ui.slice(ui.indexOf('const doSelect ='), ui.indexOf('const doRemove ='));
  assert.match(regularCard, /data-account-id": entry\.id/,
    "一覧カードに編集フォームと同じ安定IDを持たせる");
  assert.match(regularCard, /className: `acct-card[^\n]*is-selecting/,
    "選択中状態をカードに反映する");
  assert.match(cancel, /setEditingId\(null\)/);
  assert.match(cancel, /window\.requestAnimationFrame\(\(\) => \{/,
    "フォームDOMの切替後にフォーカスを戻す");
  assert.match(cancel, /card\?\.querySelector\("\.acct-edit-btn"\)/,
    "編集を始めたカードの編集ボタンへフォーカスを復帰する");
  assert.match(select, /selectionTimer\.current !== null/,
    "短時間の連打による二重切替を防ぐ");
  assert.match(select, /setSelectingId\(id\)/,
    "切替直前の押下フィードバックを描画する");
  assert.match(select, /prefersReducedMotion\(\) \? 0 : 180/,
    "動きを減らす設定を尊重しつつ、通常時は押下を視認できる時間を確保する");
  assert.match(ui, /if \(selectionTimer\.current !== null\) window\.clearTimeout\(selectionTimer\.current\)/,
    "アンマウント時に選択タイマーを破棄する");
  assert.match(ui, /if \(closeTimer\.current !== null\) window\.clearTimeout\(closeTimer\.current\)/,
    "アンマウント時に閉じるタイマーを破棄する");
});

test("アカウントモーションは単一イージング・押下表現・閉じる間のクリック透過を守る", () => {
  assert.match(visualSystem, /--ui-motion-ease:\s*cubic-bezier\(\.22,\s*1,\s*\.36,\s*1\)/);
  assert.match(visualSystem, /--ui-motion-fast:\s*160ms/);
  assert.match(visualSystem, /--ui-motion-modal:\s*300ms/);
  assert.match(visualSystem, /\.acct-card:has\(\.acct-card-hit:active\),[\s\S]*?\.acct-card\.is-selecting\s*\{[^}]*transform:\s*scale\(\.976\)/,
    "カード押下時に縮小と枠の変化を示す");
  assert.match(visualSystem, /\.acct-card\.is-selecting:hover,[\s\S]*?\.acct-card\.is-selecting:focus-within\s*\{[^}]*transform:\s*scale\(\.976\)/,
    "復帰したフォーカスやhoverよりも押下縮小を優先する");
  assert.match(accountLayoutCaptureSource, /scaleX >= \.999 \|\| pressed\.scaleY >= \.999/,
    "実ブラウザー監査は押下縮小を行列値で確認する");
  assert.match(visualSystem, /\.acct-overlay\.is-closing\s*\{[^}]*pointer-events:\s*none;/,
    "透明化中のオーバーレイが背面クリックを奪わない");
  assert.match(visualSystem, /@media \(prefers-reduced-motion:\s*reduce\)/,
    "reduced motion を尊重する");
  assert.doesNotMatch(visualSystem, /linear-gradient|radial-gradient|conic-gradient/i,
    "グラデーションを追加しない");
});

test("アカウント画面のブラウザー監査はキャンセル・保存後に実クリックで切替を検証する", () => {
  assert.match(accountLayoutCaptureSource, /verifyAccountHitTargetsAfterFormReturn/,
    "Playwrightで編集フォームから戻った後を実行する");
  assert.match(accountLayoutCaptureSource, /document\.elementFromPoint/,
    "カード中央で最前面の要素を検査する");
  assert.match(accountLayoutCaptureSource, /\.acct-card-hit/);
  assert.match(accountLayoutCaptureSource, /waitForNavigation\(\{ waitUntil: "load"/,
    "実クリックでリロード後まで待つ");
  assert.match(accountLayoutCaptureSource, /afterCancel/);
  assert.match(accountLayoutCaptureSource, /afterSave/);
});

test("初回ゲートから編集を開いた場合も閉じた後に起動元へフォーカスを戻す", () => {
  assert.match(ui, /const returnFocusRef = React\.useRef\(null\)/);
  assert.ok(ui.includes("returnFocusRef.current = {"), "起動元要素の参照情報を保存する");
  assert.ok(ui.includes("id: initialEditId ? `acct-gate-edit-"), "ゲートの編集起動元を安定IDで保存する");
  assert.match(ui, /trigger\.id \? document\.getElementById\(trigger\.id\) : null/,
    "ゲート再描画で要素が差し替わった場合は安定IDから再取得する");
  assert.match(ui, /target\.focus\(\{ preventScroll: true \}\)/,
    "閉じた後に存在している起動元だけへフォーカスを戻す");
  assert.match(ui, /className: `acct-card acct-card--gate[^\n]*"data-account-id": entry\.id/,
    "初回ゲートのカードも管理画面と同じ安定IDで検証できる");
  assert.match(ui, /window\.dispatchEvent\(new CustomEvent\(ACCOUNTS_OPEN_EVENT, \{ detail: \{ editId: entry\.id \} \}\)\)/,
    "ゲートの編集ボタンは対象アカウントを指定して管理画面を開く");
  assert.match(ui, /const \[selectingId, setSelectingId\] = React\.useState\(null\)/,
    "初回ゲートも切替中のカード状態を保持する");
  assert.match(ui, /selectionTimer\.current !== null\) return/,
    "初回ゲートの二重クリックでイベントを重ねない");
  assert.match(ui, /setSelectingId\(id\)[\s\S]*?prefersReducedMotion\(\) \? 0 : 180/,
    "初回ゲートでも動きを減らす設定を尊重してから切替イベントを通知する");
  assert.match(ui, /entry\.id === selectingId \? " is-selecting" : ""/,
    "初回ゲートの選択カードに押下状態を反映する");
  assert.match(accountLayoutCaptureSource, /gatePressed\.scaleX >= \.999 \|\| gatePressed\.scaleY >= \.999/,
    "初回ゲートの実クリックでも縮小行列を検査する");
});

test("v71 unified visual system uses one five-color palette and one five-step type scale", () => {
  const colorTokens = [...visualSystem.matchAll(/^\s*--ui-(?:bg|surface|line|text|accent):\s*#[0-9a-f]{6};$/gim)];
  const typeTokens = [...visualSystem.matchAll(/^\s*--ui-type-[a-z-]+:\s*\d+px;$/gim)];
  assert.equal(colorTokens.length, 5, "基調色は5変数だけにする");
  assert.equal(typeTokens.length, 5, "文字サイズは5段階だけにする");
  assert.doesNotMatch(visualSystem, /linear-gradient|radial-gradient|conic-gradient/i, "グラデーションを使わない");
});

test("v71 removes legacy gradients from ordinary workbench surfaces", () => {
  const start = visualSystem.indexOf("/* Flatten legacy workbench surfaces");
  const end = visualSystem.indexOf("/* Primary actions stay filled in the flat theme.", start);
  assert.ok(start >= 0 && end > start, "旧UI面をフラット化する正規化ブロックが存在する");
  const block = visualSystem.slice(start, end);
  for (const selector of [
    ".focus", ".topbar", ".rail", ".preview", ".chip", ".p-card",
    ".spirit-item.is-active", ".btype-command-hero", ".btype-record-task-card",
    ".build-context-strip", ".piece-output-shell", ".persona-draft-dialog"
  ]) {
    assert.ok(block.includes(selector), "旧グラデーション面をフラット化する: " + selector);
  }
  assert.match(block, /background-image: none !important;/,
    "旧コンポーネントの装飾グラデーションを上書きで除去する");
  assert.match(block, /Functional[\s\S]*?CCFOLIA board grid lines[\s\S]*?dedicated extraction FX/,
    "盤面罫線と抽出演出という機能表示は意図的に別扱いとする");
});

test("flat UI palette keeps primary and body text above WCAG AA contrast", () => {
  const token = (name) => {
    const match = visualSystem.match(new RegExp("^\\s*--ui-" + name + ":\\s*(#[0-9a-f]{6});", "im"));
    assert.ok(match, "基調色トークンが存在する: " + name);
    return match[1];
  };
  const luminance = (hex) => {
    const channels = [1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255)
      .map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };
  const contrast = (a, b) => {
    const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (values[0] + 0.05) / (values[1] + 0.05);
  };
  assert.ok(contrast(token("accent"), token("bg")) >= 4.5,
    "主操作の真鍮色と文字背景のコントラストは4.5:1以上");
  assert.ok(contrast(token("text"), token("surface")) >= 4.5,
    "通常文字と面色のコントラストは4.5:1以上");
});

test("overlay metadata and resistance badges retain WCAG AA contrast", () => {
  assert.match(visualSystem, /\.lbt-cloud-panel \.lbt-cloud-state\s*\{[^}]*color: var\(--ui-accent\) !important;[^}]*opacity: 1 !important;/,
    "ローカル保存状態は背景面に対して読めるアクセント色で表示する");
  assert.match(visualSystem, /\.acct-card \.acct-meta\s*\{[^}]*color: var\(--ui-text\) !important;[^}]*opacity: 1 !important;/,
    "アカウントの最終更新表示を薄くしすぎない");
  for (const level of ["弱点", "耐性"]) {
    assert.ok(visualSystem.includes('.res-dot[data-res="' + level + '"]'), level + " badge override exists");
  }
  assert.match(visualSystem, /\.res-dot\[data-res="弱点"\],[\s\S]*?\.res-dot\[data-res="耐性"\]\s*\{[^}]*color: var\(--ui-bg\) !important;[^}]*text-shadow: none !important;/,
    "明るい耐性バッジは濃い文字にし、情報を読める状態にする");
  assert.match(visualSystem, /\.res-dot\[data-res="弱点"\]::before,[\s\S]*?\.res-dot\[data-res="耐性"\]::before\s*\{[^}]*color: var\(--ui-bg\) !important;/,
    "属性記号も本文と同じ高コントラストを維持する");
});

test("blocked shop actions and enhancement catalog meet accessibility interaction requirements", () => {
  assert.match(visualSystem, /\.shop-card\[data-blocked="1"\] \.btn-primary:not\(:disabled\)[\s\S]*?background-image: none !important;[\s\S]*?color: var\(--ui-bg\) !important;[\s\S]*?opacity: 1 !important;/,
    "残高不足カードの購入理由ボタンは不透明なフラット塗りで十分なコントラストを保つ");
  assert.match(visualSystem, /\.btn-primary:disabled,[\s\S]*?color: var\(--ui-text\) !important;[\s\S]*?opacity: 1 !important;/,
    "実際に無効な主操作も高コントラストの文字を維持する");
  assert.match(sections, /className: "enhancement-catalog-scroll",[\s\S]*?role: "region",[\s\S]*?"aria-label": "強化候補一覧",[\s\S]*?tabIndex: 0/,
    "強化候補の内部スクロール領域は名前付きでキーボードフォーカスを受け取る");
  assert.match(sections, /className: "spp-item",[\s\S]*?role: "button",[\s\S]*?tabIndex: 0,[\s\S]*?onClick: \(\) => addEnh\(entry\),[\s\S]*?onKeyDown: \(event\) => \{[\s\S]*?event\.key === "Enter" \|\| event\.key === " "[\s\S]*?addEnh\(entry\)/,
    "強化候補の表示全文をボタン名として使い、Enter／Spaceでも追加できる");
  assert.doesNotMatch(sections, /"aria-label": `\$\{entry\.name\}を強化候補に追加`/,
    "表示内容を欠く短いaria-labelでボタンの表示名を上書きしない");
});

test("v71 restores visible primary-action fills without reintroducing gradients", () => {
  assert.match(visualSystem, /\.btn-primary\s*\{[^}]*background-color: var\(--ui-accent\) !important;[^}]*background-image: none !important;[^}]*color: var\(--ui-bg\) !important;/,
    "主操作はアクセント色のフラットな塗りと背景色に対する文字色を持つ");
  assert.match(visualSystem, /\.btn:disabled\.btn-primary\s*\{[^}]*background-color: var\(--ui-surface\) !important;[^}]*color: var\(--ui-line\) !important;[^}]*opacity: 1;/,
    "無効な主操作は暗い面色と境界色で区別し、不透明度で文字を潰さない");
  assert.doesNotMatch(visualSystem, /linear-gradient|radial-gradient|conic-gradient/i,
    "フラットなビジュアルにグラデーションを再導入しない");
});

test("UI audit uses unique build-tab controls and collapses preview before home launcher taps", () => {
  assert.match(uiAuditSource, /\.btype-build-tablist > \[role='tab'\]/,
    "ビルドのメインタブだけを直接選択し、子パネル内の同名タブを拾わない");
  for (const id of ["skill", "ego", "baseinfo", "items-build"]) {
    assert.ok(uiAuditSource.includes('page.locator("#btab-' + id + '")'),
      "ビルドタブは一意なIDで操作する: " + id);
  }
  assert.match(uiAuditSource, /async function collapsePreviewIfOpen\(\)/,
    "ランチャー操作の前後にプレビューを閉じる手順を持つ");
  assert.match(uiAuditSource, /await closeOverlay\(\);\s*await collapsePreviewIfOpen\(\);\s*await go\("ホーム"\)/,
    "各ランチャー操作の前にダイアログとプレビューを閉じてからホームへ戻る");
});

test("SINNER SELECT keeps recovery compact, hides it while editing, and shortens mobile account cards", () => {
  assert.match(visualSystem, /grid-template-rows: minmax\(0, 1fr\) auto;/,
    "スマホで復旧欄を閉じたときは内容高だけを確保する");
  assert.match(visualSystem, /\.acct-panel:has\(\.acct-card--form\) \.acct-panel-cloud,[\s\S]*?display: none !important;/,
    "編集時は復旧欄を隠す");
  assert.match(visualSystem, /grid-auto-rows: minmax\(108px, max-content\)/,
    "スマホでは管理カードを短い横長行にする");
  assert.match(visualSystem, /\.acct-panel-accounts > \.acct-grid--manager \{[\s\S]*?grid-auto-rows: minmax\(184px, max-content\);/,
    "PC・タブレットでは184px未満の行トラックを作らずカードを重ねない");
  assert.match(uiAuditSource, /minimumManagerCardHeight = view\.startsWith\("mobile"\) \? 96 : 136/,
    "PCでは140px級のカードが3行に収まる実レイアウトを許容し、モバイルは96px以上を要求する");
  assert.match(uiAuditSource, /getComputedStyle\(backupPanel\)\.display\s*===\s*"none"/,
    "編集時は復旧ペイン全体の非表示を判定する");
  assert.ok(visualSystem.includes("grid-template-columns: repeat(auto-fill, minmax(min(320px, 100%), 1fr));"),
    "ショップの商品一覧をPCで3列程度に抑える");

  const closedLayoutStart = visualSystem.indexOf(".acct-panel-layout:has(.acct-panel-cloud > .lbt-cloud-panel:not([open]))");
  const closedLayoutEnd = visualSystem.indexOf("\n}", closedLayoutStart);
  const closedLayout = visualSystem.slice(closedLayoutStart, closedLayoutEnd);
  assert.ok(closedLayoutStart >= 0 && closedLayout.includes("grid-template-columns: minmax(0, 1fr);"),
    "復旧欄を閉じたPC画面では右側に空き列を残さない");

  const closedCloudStart = visualSystem.indexOf(".acct-panel-cloud:has(> .lbt-cloud-panel:not([open]))");
  const closedCloudEnd = visualSystem.indexOf("\n}", closedCloudStart);
  const closedCloud = visualSystem.slice(closedCloudStart, closedCloudEnd);
  assert.ok(closedCloudStart >= 0 && closedCloud.includes("max-height: 60px;"),
    "閉じた復旧欄の高さを60pxに制限する");
  assert.ok(closedCloud.includes("border-top: 1px solid var(--ui-line);"),
    "折りたたまれた復旧欄は一覧の下に細い行として置く");

  const compactPanelStart = visualSystem.indexOf(".acct-panel-cloud > .lbt-cloud-panel.is-compact:not([open]) {");
  const compactPanelEnd = visualSystem.indexOf("\n}", compactPanelStart);
  const compactPanel = visualSystem.slice(compactPanelStart, compactPanelEnd);
  assert.ok(compactPanelStart >= 0 && compactPanel.includes("margin: 0;") && compactPanel.includes("padding: 0;"),
    "カード本体の余白を折りたたみ時に重ねない");

  const headingStart = visualSystem.indexOf(".acct-panel-cloud > .lbt-cloud-panel.is-compact:not([open]) .lbt-cloud-heading {");
  const headingEnd = visualSystem.indexOf("\n}", headingStart);
  const heading = visualSystem.slice(headingStart, headingEnd);
  assert.ok(headingStart >= 0 && heading.includes("flex-direction: row;") && heading.includes("flex-wrap: nowrap;"),
    "復旧欄のタイトルと保存状態を1行に収める");

  assert.ok(visualSystem.includes("grid-template-columns: repeat(auto-fill, minmax(min(260px, 100%), 1fr));"),
    "PCのアカウント一覧は3列程度にして名前を読める幅を確保する");
  assert.ok(visualSystem.includes("--gold-tint: var(--ui-surface);"),
    "アクセント文字の背景は文字と同色にしない");
  assert.ok(visualSystem.includes("--gold-line: var(--ui-line);"),
    "アクセント文字と境界線を別の役割にする");
});;
