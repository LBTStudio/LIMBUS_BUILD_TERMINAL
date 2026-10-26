import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* ---------------------------------------------------------------------------
   取り込み画面の構成。

   所持を1件ずつ並べて個別に操作する作りでは、項目数だけ手順が増える。
   1シナリオ＝1リザルトのカードに割当済みの所持を最初から出し、
   利用者が触るのはカード内の未決行と未割当プールだけにする。
   シミュレーションは実際に入る action と同じ純関数から出す。
   --------------------------------------------------------------------------- */

const ui = readFileSync(new URL("../js/garasumado-import-ui.js", import.meta.url), "utf8");
/* 整形（改行位置）は規約ではない。行をまたぐ検査は空白を潰してから照合する。 */
const uiFlat = ui.replace(/\s+/g, " ");

test("人格URLとキャラクターURLを同じ統合経路に流さない", () => {
  assert.match(uiFlat, /const collectionKinds = new Set/);
  assert.match(uiFlat, /collectionKinds\.size > 1/);
  assert.match(uiFlat, /collectionKinds\.has\("personas"\)/);
  assert.match(uiFlat, /window\.LBT_fetchGarasumadoPersona/);
  assert.match(uiFlat, /type: "ADD_GARASUMADO_PERSONA"/);
});

test("取得中の busy は取得が例外でも必ず解除される（finally）", () => {
  /* fetch へ渡す以降の実装が throw に変わっても、busy が true のまま残ると
     画面が「取得中」のまま固まり、再試行の入口が分からなくなる。 */
  assert.match(uiFlat, /try \{ const fetched = await window\.LBT_fetchGarasumadoDocument/, "各URLの取得は try 内で例外処理する");
  assert.match(uiFlat, /finally \{ setBusy\(false\);/, "busy 解除は finally");
});

test("1シナリオ＝1リザルトのカードがある", () => {  assert.match(uiFlat, /function ResultCard\(\{ block, scenarioOptions, sourceOptions, onPickIdentity, onDropItem, onReturnItem, existingResults = \[\], legacyCandidates = \[\], legacyTargetId = "", onPickLegacyTarget, sourceAlreadyImported = false \}\)/);
  assert.match(uiFlat, /"gara-group gara-result"/);
  /* 照合済みの所持は最初からカードの中に出る。 */
  assert.match(uiFlat, /block\.items\.map\(\(item\) => h\("div", \{/);
  assert.match(uiFlat, /gara-row-assigned/);
});

test("照合の階級が表示に現れる", () => {
  assert.match(uiFlat, /const TIER_NOTE = \{/);
  for (const k of ["A", "C", "D", "M"]) assert.match(uiFlat, new RegExp(k + ": "));
  assert.match(uiFlat, /TIER_NOTE\[item\.tier\]/);
});

test("カードの中で入手方法を選べる。帰属先はカード所属で決まり select を置かない", () => {
  /* ユーザー指示: 分類済みの行に「選んでください」のプルダウンは邪魔。
     やり直しはカードの行を未割当リストへドラッグで戻す（再分類）。 */
  assert.doesNotMatch(uiFlat, /の帰属先シナリオ"/);
  assert.match(uiFlat, /"aria-label": item\.name \+ " の入手方法"/);
  assert.match(uiFlat, /onPickIdentity\(item\.key, \{ source: event\.target\.value \}\)/);
});

test("未割当はプールに出さず、右レールに一本化する（一括ボタン撤去）", () => {
  /* ユーザー指示: 未割当セクションは廃止し、右の追従リストに統合する。 */
  assert.doesNotMatch(uiFlat, /function UnassignedPool\(/);
  assert.doesNotMatch(uiFlat, /onAssignAll\(""\)/);
  assert.doesNotMatch(uiFlat, /全て OFF のままにする/);
  assert.doesNotMatch(uiFlat, /全て「配布」として入れる/);
});

test("本文テキストに罫線용トークンを配色しない（コントラスト実測 2.89:1 の再発防止）", () => {
  /* --line-* は罫線用の色。テキストに使うと WCAG 1.4.3 に落ちる（実測 2.89:1）。 */
  const css = readFileSync(new URL("../assets/v66-accounts.css", import.meta.url), "utf8");
  const blocks = css.match(/\.[a-z0-9-]+\s*\{[^}]*\}/gi) || [];
  for (const b of blocks) {
    const sel = b.slice(0, b.indexOf("{")).trim();
    if (!/\b(gara-note|gara-hint|gara-lead|gara-group-note)\b/.test(sel)) continue;
    const color = (b.match(/color:\s*var\((--[\w-]+)/i) || [])[1];
    if (!color) continue;
    assert.doesNotMatch(color, /^--line-/, `${sel} が ${color} を文字色に使っている`);
  }
});

test("空の表示は「収入が無い」のか「割当が無い」のかを区別する", () => {
  /* 収入があるのに割当0のカードで「まだ何も割り当てられていません」だけを出すと、
     ユーザーには収入が取り込まれていないように見える（実測の誤読原因）。 */
  assert.match(uiFlat, /報酬は記録済みです/);
  assert.match(uiFlat, /メモに報酬の金額が見つからないため、収入は 0 です/);
  assert.match(uiFlat, /メモが空のため、記録できる報酬がありません/);
  assert.doesNotMatch(uiFlat, /"まだ何も割り当てられていません。"/);
});

test("初期精神は未計上にならず、上限を超えたら画面が警告する", () => {
  assert.doesNotMatch(uiFlat, /計上対象外/);
  assert.match(uiFlat, /manifest\.counts\?\.initialSpiritOverflow/);
  assert.match(uiFlat, /初期精神は3件までなので/);
});

test("残高照合は記録が無いユーザーには言わず、不一致だけエラーとして出す", () => {
  assert.match(uiFlat, /window\.LBT_reconcileBalance\(manifest, doc\)/);
  assert.match(uiFlat, /balance && balance\.checked && !balance\.ok/);
  /* 照合していないユーザー（残高変動の記載0件）には何も出さない。 */
  assert.doesNotMatch(uiFlat, /!balance\.checked\s*&&\s*balance\.message/);
});

test("未分類_personaは宣言後にしか参照しない（TDZ の再発防止）", () => {
  /* 「Cannot access 'draft' before initialization」を静かに再発させない。 */
  const at = (re) => ui.search(re);
  const draft = at(/const draft = React\.useMemo/);
  const unclassified = at(/const unclassified = draft/);
  const dropTo = at(/const dropToBlock =/);
  assert.ok(draft > 0 && unclassified > 0 && dropTo > 0, "3つとも定義されている");
  assert.ok(dropTo < draft, "dropToBlock は draft より前（drop先だけが必要）");
  assert.ok(draft < unclassified, "unclassified は draft の宣言より後ろ");
  const render = at(/unclassified\.length/);
  assert.ok(unclassified < render, "描画は unclassified の宣言より後ろ");
});

test("未分類所持は右側の追従リストへ出し、カードへドラッグで帰属先を決められる", () => {
  assert.match(uiFlat, /function UnclassifiedRail\(\{ items, scenarioOptions, onPickIdentity, onReturnItem, focusKey, onFocusHandled \}\)/);
  assert.match(uiFlat, /className: "gara-rail"/);
  assert.match(uiFlat, /draggable: true,/);
  assert.match(uiFlat, /event\.dataTransfer\.setData\("text\/plain", item\.key\)/);
  assert.match(uiFlat, /onDropItem: dropToBlock/);
  assert.match(uiFlat, /onDropItem\(key, block\.name \|\| ""\)/);
  /* ドラッグが使えない環境用のフォールバック。 */
  assert.match(uiFlat, /の帰属先シナリオ（未分類）/);
  assert.match(uiFlat, /onPickIdentity\(item\.key, \{ pickedScenario: event\.target\.value \}\)/);
});

test("カードの行を未割当リストへ戻して再分類できる（ドラッグ・バック）", () => {
  /* ユーザー指示: 分類し直しはドラッグでリストへ戻す。 */
  assert.match(uiFlat, /onDragStart: \(event\) => \{/);
  assert.match(uiFlat, /onReturnItem: returnItem/);
  assert.match(uiFlat, /const returnItem = \(itemKey\) => \{/);
  assert.match(uiFlat, /onPickIdentity\(itemKey, \{ pickedScenario: "", returned: true \}\)/);
  /* レールはカードからの受け皿。空でも置ける（最後の1件も戻せる）。 */
  assert.match(uiFlat, /onDrop: \(event\) => \{/);
  assert.match(uiFlat, /getData\("text\/plain"\)/);
  assert.match(uiFlat, /draft\.blocks\.some\(\(b\) => \(b\.items \|\| \[\]\)\.length\)/);
  /* ドラッグが使えない環境（キーボード含む）でも戻せるようにボタンでも置く。 */
  assert.match(uiFlat, /onClick: \(\) => onReturnItem\?\.\(item\.key\)/);
  assert.match(uiFlat, /\}, "未割当へ"\)/);
  /* 戻した直後はフォーカスをレールの行へ移す（body に落とさない）。 */
  assert.match(uiFlat, /const \[focusKey, setFocusKey\] = React\.useState\(""\)/);
  assert.match(uiFlat, /setFocusKey\(itemKey\)/);
  assert.match(uiFlat, /onFocusHandled: \(\) => setFocusKey\(""\)/);
  assert.match(uiFlat, /tabIndex: -1,/);
  assert.match(uiFlat, /el\.focus\(\);/);
});

test("分類できないが確定済みの所持はカード内で DB 候補を選んで決められる", () => {
  assert.match(uiFlat, /"aria-label": item\.name \+ " の DB 候補"/);
  /* 選んだ候補は picked（完全な候補オブジェクト）として渡す。名前だけを渡して
     いた頃は action を作る側が読まず、選んでも何も変わらなかった。 */
  assert.match(uiFlat, /onPickIdentity\(item\.key, \{ picked: found, pickedCandidate: name \}\)/);
  /* 候補は種別まで見て選ぶ。同名の別種（ギャンブラーはサポパと精神の両方に
     実在する）を名前だけで比べると、先頭が常に選ばれて誤った種別で入る。 */
  assert.match(uiFlat, /const found = \(item\.candidates \|\| \[\]\)\.find\(\(c\) => candKey\(c\) === name\) \|\| null;/);
  assert.match(uiFlat, /const candKey = \(cand\) => \(cand \? cand\.kind \+ ":" \+ cand\.name : ""\);/);
  assert.match(uiFlat, /const dupNamesOf = \(candidates\) => new Set\(/);
});

test("割当の変更は取り込み画面内で Undo/Redo できる（ドラッグミスも戻せる）", () => {
  assert.match(uiFlat, /const \[past, setPast\] = React\.useState\(\[\]\)/);
  assert.match(uiFlat, /const \[future, setFuture\] = React\.useState\(\[\]\)/);
  /* 変更のたびに直前を積み、undo で戻し、redo で進める。 */
  assert.match(uiFlat, /setPast\(\(h\) => \[\.\.\.h\.slice\(-49\), \{ identity, picked \}\]\)/);
  assert.match(uiFlat, /const undoPick = React\.useCallback/);
  assert.match(uiFlat, /const redoPick = React\.useCallback/);
  /* 取り込み確定前はアプリ側 state を触らないので、ここを奪わない。 */
  assert.match(uiFlat, /k === "z" && !event\.shiftKey/);
  assert.match(uiFlat, /k === "y"/);
  assert.match(uiFlat, /onClick: undoPick/);
  assert.match(uiFlat, /onClick: redoPick/);
});

test("画面は draft（純関数）から描画する", () => {
  assert.match(uiFlat, /const draft = React\.useMemo\(\(\) => \{/);
  assert.match(uiFlat, /window\.LBT_buildResultDraft/);
  /* 集計を画面側でやり直さない。 */
  assert.match(uiFlat, /draft && draft\.blocks\.map\(\(block\) => \{/);
  assert.match(uiFlat, /return h\(ResultCard/);
  /* 未割当はレールに一本化（Util者指示）。 */
  assert.match(uiFlat, /h\(UnclassifiedRail, \{ items: unclassified,/);
});

test("シミュレーションは常設で、実際の取り込みと一致する", () => {
  assert.match(uiFlat, /シミュレーション：リザルト \$\{draft\.simulation\.results\}件・所持 \$\{draft\.simulation\.held\}件/);
  /* 完了条件も draft の値に従う（画面が別に数えない）。 */
  assert.match(uiFlat, /const pendingCount = draft \? \(draft\.simulation\.awaitingSource \|\| 0\) : 0;/);
});

test("選択状態は draft にも渡る（シミュレーションの取り込み内容の一致）", () => {
  assert.match(uiFlat, /const chosen = Object\.keys\(picked\)\.filter\(\(k\) => picked\[k\]\);/);
  assert.match(uiFlat, /selected: chosen,/);
});

test("確定の瞬間がコンバート確定になる（確定前は反映されない）", () => {
  /* シミュレーションは「反映前の1手前」。確定ボタンを押した瞬間に確定する。 */
  assert.match(uiFlat, /const \[confirmed, setConfirmed\] = React\.useState\(null\);/);
  assert.match(uiFlat, /onApply\?\.\(applied\);/);
  /* 確定したら自動で閉じず、結果を見せる（確認してから閉じる）。 */
  assert.doesNotMatch(uiFlat, /onApply\?\.\([\s\S]{0,160}?onClose\?\.\(\);/);
  assert.match(uiFlat, /\}, "変換を確定する"\)/);
  assert.match(uiFlat, /"変換を確定しました"/);
  assert.match(uiFlat, /h\(Button, \{ size: "sm", variant: "primary", icon: "check", onClick: onClose \}, "閉じる"\)/);
});

test("確定結果は実際に入った action の内訳", () => {
  assert.match(uiFlat, /function appliedSummary\(actions\)/);
  assert.match(uiFlat, /setConfirmed\(\{[\s\S]{0,80}?counts: appliedSummary\(actions\)/);
  /* シミュレーションと食い違ったら知らせる（表示と実体のずれを隠さない）。 */
  assert.match(uiFlat, /const mismatched = Boolean\(sim\) && sim\.held !== confirmed\.counts\.held;/);
  assert.match(uiFlat, /シミュレーション（所持/);
});

test("GarasumadoGroup（1件ずつ並べる一覧）は画面から消えている", () => {
  /* 定義が残っていても、画面から描画されていないこと。 */
  assert.doesNotMatch(uiFlat, /h\(GarasumadoGroup, \{/);
});

test("人格URLの一括取り込みは人格パーサーから個別に読み、選択した人格だけを専用アクションで登録する", () => {
  assert.match(uiFlat, /collectionKinds\.has\("personas"\)/);
  assert.match(uiFlat, /window\.LBT_fetchGarasumadoPersona/);
  assert.match(uiFlat, /setPersonaItems\(imported\)/);
  assert.match(uiFlat, /personaItems\.map\(\(row\) =>/);
  assert.match(uiFlat, /personaAlreadyImported\(row\.id\)/);
  assert.match(uiFlat, /type: "ADD_GARASUMADO_PERSONA"/);
  assert.match(uiFlat, /existingPersonas/);
  assert.match(uiFlat, /装備中人格やキャラクターの履歴は変更していません/);
  assert.doesNotMatch(uiFlat, /人格URLの一括登録は、各人格を個別に識別して登録する専用処理が必要なため、この画面では未対応です/);
});

test("人格URLの取込確定を所持ライブラリへ渡し、集約・履歴マージ処理を使わない", () => {
  assert.match(uiFlat, /const skipped = failedRows\.map/);
  assert.match(uiFlat, /onApply\?\.\(\{ actions, skipped \}\)/);
  assert.match(uiFlat, /kind: "garasumado-persona"/);
  assert.match(uiFlat, /url: row\.url/);
  assert.match(uiFlat, /setPersonaConfirmed\(\{ count: actions\.length/);
  const personaBranch = ui.indexOf('if (collectionKinds.has("personas"))');
  const characterMerge = ui.indexOf("const mergedDoc = window.LBT_mergeGarasumadoDocuments");
  assert.ok(personaBranch >= 0 && characterMerge > personaBranch);
  assert.match(uiFlat, /setPersonaConfirmed\(null\)/);
});


test("URL入力は複数行フォームで送信でき、進行状況・部分失敗が分かる", () => {
  assert.match(uiFlat, /h\("form", \{ className: "gara-url-form", onSubmit: load, "aria-busy": busy \}/);
  assert.match(uiFlat, /className: "input gara-url-list"/, "複数行の共有URL入力を維持");
  assert.match(uiFlat, /name: "shareUrls"/);
  assert.match(uiFlat, /className: "gara-loading", role: "status", "aria-live": "polite"/);
  assert.match(uiFlat, /urlReport\.failed\.slice\(0, 6\)/, "一部失敗のURLを確認できる");
  assert.match(uiFlat, /catch \(_\) \{ setError\(/, "想定外の例外を利用者向けエラーにする");
  assert.match(uiFlat, /finally \{ setBusy\(false\); setProgress\(""\); \}/, "失敗時も読込状態を解除する");
});

test("ZIP / JSON一括読込はリザルト履歴と人格シートを同じ確認画面で反映する", () => {
  assert.match(uiFlat, /LBT_readGarasumadoExportFiles/);
  assert.match(uiFlat, /type: "file"/);
  assert.match(uiFlat, /accept: "\.zip,\.json,application\/zip,application\/json"/);
  assert.match(uiFlat, /personaItems !== null && !manifest/);
  assert.match(uiFlat, /const personaActions =/);
  assert.match(uiFlat, /extras: row\.result\.extraData \|\| \{\}/);
  assert.match(uiFlat, /renderBundleReport\(\)/);
  assert.match(uiFlat, /画像・PDF・TXTは読み込まず/);
});

test("取込後の確認画面は対象数・未決件数・追加予定を先に表示する", () => {
  assert.match(uiFlat, /className: "gara gara-import-review"/);
  assert.match(uiFlat, /className: "gara-import-overview"/);
  assert.match(uiFlat, /counts\.included\} \/ \$\{counts\.total/);
  assert.match(uiFlat, /pendingCount\}件/);
  assert.match(uiFlat, /draft \? draft\.simulation\.results : 0/);
  assert.match(uiFlat, /項目名を押すと候補や価格を確認できます/);
  assert.match(uiFlat, /className: "gara-foot gara-import-actions"/);
});

test("確定後は manifest が残っていても確定結果画面を表示する", () => {
  const panel = ui.slice(ui.indexOf("const GarasumadoImportPanel"));
  const render = panel.slice(panel.indexOf("const pendingCount"));
  assert.ok(render.indexOf("if (confirmed)") >= 0, "確定状態の分岐がある");
  assert.ok(render.indexOf("if (confirmed)") < render.indexOf("if (!manifest)"), "確定結果を manifest の有無より先に描画する");
});

test("SINNER SELECTの取込はモーダル幅に合わせ、確定操作をスクロール中も追従させる", () => {
  const css = readFileSync(new URL("../assets/v66-accounts.css", import.meta.url), "utf8");
  assert.match(css, /\.acct-card--import-open \.gara\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s);
  assert.match(css, /\.acct-card--import-open \.gara-rail\s*\{[^}]*position:\s*static/s);
  assert.match(css, /\.gara-import-actions\s*\{[^}]*position:\s*sticky/s);
  assert.match(css, /\.gara-row-hit \.gara-row-name\s*\{[^}]*white-space:\s*normal/s);
  assert.match(css, /\.gara-row-hit \.gara-row-meta\s*\{[^}]*white-space:\s*normal/s);
});

test("人格URLの一括取込でも解析段階の不正URLを失敗レポートに残す", () => {
  const personaStart = ui.indexOf('if (collectionKinds.has("personas"))');
  const characterStart = ui.indexOf("/* 共有データは1ドキュメントずつしか読めない", personaStart);
  const personaBranch = ui.slice(personaStart, characterStart);
  assert.ok(personaStart >= 0 && characterStart > personaStart);
  assert.match(personaBranch, /requested: parsedBatch\.urls\.length \+ \(parsedBatch\.invalid \|\| \[\]\)\.length/);
  assert.match(personaBranch, /failed:\s*\[\s*\.\.\.failed,[\s\S]*?imported\.filter\(\(row\) => !row\.ok\)/);
});

test("キャラクター共有URLの確認後はアカウントカードから独立した全画面ワークスペースで表示する", () => {
  assert.match(uiFlat, /const renderWorkspace = \(content\) =>/);
  assert.match(uiFlat, /ReactDOM\.createPortal\(/);
  assert.match(uiFlat, /role: "dialog"/);
  assert.match(uiFlat, /return renderWorkspace\(h\("div", \{ className: "gara gara-import-review" \}/);
  assert.match(uiFlat, /className: "gara-review-dismiss"/);
  assert.match(uiFlat, /event\.key !== "Escape"/);
  const css = readFileSync(new URL("../assets/v66-accounts.css", import.meta.url), "utf8");
  assert.match(css, /\.gara-import-workspace\s*\{[^}]*position:\s*fixed/s);
  assert.match(css, /\.gara-import-workspace > \.gara-import-review\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\) minmax\(280px,\s*360px\)/s);
});


test("同じ共有元のリザルトは更新し、旧形式候補は利用者が選んだ場合だけ置換する", () => {
  assert.match(uiFlat, /existingResults = \[\]/);
  assert.match(uiFlat, /legacyResultTargets: legacyTargets/);
  assert.match(uiFlat, /sourceAlreadyImported/);
  assert.match(uiFlat, /旧形式の既存リザルトを更新（任意）/);
  assert.match(uiFlat, /手入力の明細が含まれていないか確認してください/);
  assert.match(uiFlat, /importSourceKey/);
});
