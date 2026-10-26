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
const indexHtml = readFileSync(new URL("../index.html", import.meta.url), "utf8");

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
  assert.ok(ui.includes('className: `acct-card acct-card--form${importOpen ? " acct-card--import-open" : ""}`, style: { "--i": index } },'), "展開状態のクラスを反映");
  assert.match(css, /\.acct-card--import-open\s*\{[\s\S]*?grid-column:\s*1\s*\/\s*-1;/);
  assert.match(css, /\.acct-card--import-open \.acct-gara-body\s*\{[^}]*min-width:\s*0;[^}]*width:\s*100%;/);
  assert.match(css, /\.acct-card--import-open \.gara\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);[^}]*min-width:\s*0;[^}]*width:\s*100%;/);
  assert.match(css, /\.acct-card--import-open \.gara-rail\s*\{[^}]*position:\s*static/s);
  assert.match(css, /\.acct-card--import-open:hover,[\s\S]*?\.acct-card--import-open:focus-within\s*\{\s*transform:\s*none;\s*box-shadow:\s*none;/);
  assert.match(css, /\.gara\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(240px,\s*320px\)/);
});
