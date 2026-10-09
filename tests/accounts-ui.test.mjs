import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

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
  assert.match(ui, /window\.LBT_accounts\?\.create\?\.\(draft\.name\.trim\(\)/, "作成後にそのアカウントへ切替");
  assert.doesNotMatch(sections, /prompt\("新しいアカウント名/, "アカウント作成の prompt を残さない");
  assert.doesNotMatch(sections, /prompt\("アカウント名", acc\.name/, "アカウント改名の prompt を残さない");
  assert.doesNotMatch(sections, /doSwitchAccount|doCreateAccount|doRenameAccount|doDeleteAccount/, "古いインライン実装の変数を残さない");
});

test("削除は確認つきで、最後の1件は削除できない", () => {
  assert.match(ui, /if \(!confirm\(`アカウント「\$\{entry\.name\}」を削除しますか？/, "削除は confirm を通す");
  assert.match(ui, /window\.LBT_accounts\?\.delete\?\.\(entry\.id\)/);
  assert.match(ui, /canRemove: total > 1/, "最後の1件には削除ボタンを出さない");
  assert.match(ui, /最後のアカウントは削除できません/, "削除失敗は理由を通知する");
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

test("カード操作は hover 依存せず、タッチでも常に出る", () => {
  assert.match(css, /\.acct-card:hover \.acct-card-actions/, "hover で表示");
  assert.match(css, /\.acct-card:focus-within \.acct-card-actions/, "キーボードでも表示");
  assert.match(css, /@media \(hover: none\) \{\s*\.acct-card-actions \{ opacity: 1; transform: none; \}/, "タッチは常時表示");
});

test("状態の所在は App に一元化し、設定からはイベントだけで開く", () => {
  assert.match(app, /const \[accountSwitcherOpen, setAccountSwitcherOpen\] = React\.useState\(false\)/);
  assert.match(app, /window\.addEventListener\("lbt:open-accounts", onOpenAccounts\)/);
  assert.match(app, /React\.createElement\(AccountSwitcher, \{ open: accountSwitcherOpen, onClose: \(\) => setAccountSwitcherOpen\(false\) \}\)/);
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

test("アイコンのアップロードは共有シートと同じ圧縮を呼び、解除もできる", () => {
  assert.match(ui, /window\.LBT_core\?\.compressImageToDataUrl\?\.\(file, \{/, "圧縮は core.js の共通実装");
  assert.match(ui, /aspect: 1,/, "アイコンは正方形");
  assert.match(ui, /sizes: \[256, 192, 160, 128, 96, 64\]/, "アイコン用の縮小段階");
  assert.match(ui, /targetBytes: 24 \* 1024/, "アイコンの容量上限");
  assert.match(ui, /portraitFocus: false/, "顔の自動フォーカスは共有画像専用");
  assert.match(ui, /window\.LBT_accounts\?\.setIcon\?\.\(accountId, compressed\.data\)/, "保存は state.js の検証を通す");
  assert.match(ui, /window\.LBT_accounts\?\.removeIcon\?\.\(id\)/, "解除は removeIcon");
  assert.match(ui, /accept: "image\/png,image\/jpeg,image\/webp"/, "受け付ける形式を input に明示");
  assert.match(ui, /role: "status"[\s\S]{0,40}圧縮中/, "圧縮中は status で通知する");
});

test("未作成アカウントのアイコンは保留して作成後に適用する", () => {
  assert.match(ui, /const PENDING_ACCOUNT_ID = "__pending";/);
  assert.match(ui, /accountId === PENDING_ACCOUNT_ID[\s\S]*?return \{ pending: true, data: compressed\.data, bytes: compressed\.bytes \|\| 0 \};/, "未作成は保存せず dataURI を返す");
  assert.match(ui, /if \(pendingIcon\) window\.LBT_accounts\?\.setIcon\?\.\(created\.id, pendingIcon\);/, "作成成功後にアイコンを適用");
  assert.match(ui, /icon: pendingIcon, name: draft\.name/, "保留中もプレビューする");
});

test("アクセス時のアカウント選択ゲートは本体を隠して選択させる", () => {
  assert.match(ui, /const AccountGate = \(\{ onEnter \}\) => \{/);
  assert.match(ui, /h\("main", \{ className: "acct-gate" \}/, "ゲート表示中は本体が出ないので main ランドマークになる");
  assert.match(ui, /h\("h1", \{ className: "acct-kicker", id: "acct-gate-title" \}/, "見出しはh1（本体が無いため）");
  assert.match(ui, /role: "dialog", "aria-modal": "true", "aria-labelledby": "acct-gate-title"/);
  assert.match(ui, /const choose = \(id\) => \{[\s\S]*?window\.LBT_accounts\?\.switch\?\.\(id\)[\s\S]*?onEnter\(\);/, "選んだアカウントを active にしてから本体へ");
  assert.match(ui, /アカウント名を入力してください/, "作成時の必須チェック");
  assert.match(app, /const \[accountGateOpen, setAccountGateOpen\] = React\.useState\(\(\) => \{/, "App がゲートの開閉を持つ");
  assert.match(app, /return list\.accounts\.length !== 1;/, "0件と2件以上だけゲートを通す");
  assert.match(app, /if \(accountGateOpen\) \{[\s\S]*?React\.createElement\(AccountGate, \{ onEnter: \(\) => setAccountGateOpen\(false\) \}\)/, "ゲート中は本体を描画しない");
  assert.match(app, /Object\.keys\(localStorage\)|LBT_accounts\?\.list\?\.\(\)/, "ゲート判定は保存領域を直接見る");
});

test("旧セーブ保持者は1件で素通りし、初回は0件のままゲートで作成させる", () => {
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
  assert.match(css, /z-index: 10060;/, "ゲートは切替オーバーレイ(10050)より上");
});

test("index.html がアセットとレイヤーを宣言している", () => {
  assert.match(indexHtml, /assets\/v66-accounts\.css\?v=[0-9a-f]+/, "CSS は版付きで読み込む");
  assert.match(indexHtml, /js\/accounts-ui\.js\?v=[0-9a-f]+/, "JS は版付きで読み込む");
  assert.match(indexHtml, /@layer[\s\S]*?\bv66-accounts\s*;/, "レイヤー順を index.html で宣言する");
});
