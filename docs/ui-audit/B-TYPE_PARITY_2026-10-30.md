# B-type production UI parity audit — 2026-10-30

## Basis

This pass uses the maintained design review `LBT_UI_Refinement_Review.md` and the interactive `LBT_UI_Refinement_Prototypes.html` from the user Library package `LBT_UI_Refinement_Package.zip`, plus the current production React DOM and UI screenshot artifacts. The prototype package is not tracked in this repository, but it is available as the design source for this audit. Existing application state, persistence, import, and CCFOLIA generation paths are preserved.

## Confirmed defects addressed here

- The Basic sheet showed the portrait and identity fields but had no live CCFOLIA-token summary in the identity column, despite the design review specifying an in-place token preview that follows name, PL name, initiative, and color.
- The ST list and label/parameter editor were both rendered as one long vertical sequence. The review calls for distinct ST, labels, and preview tabs in the Basic formatting area.
- There was no Basic-area action that deliberately opened the existing CCFOLIA preview; the design ended with a separate preview context but the live output was only reachable via the global preview control.
- CSS selectors for settings heading layout previously assumed the parameter header was a direct child of `.baseinfo-workspace`. The new semantic wrapper requires targeting the actual production DOM.

## Changes

- Add a real state-bound token preview to `BaseSection`. It reads current app state and current portrait image; it does not store duplicate identity data.
- Add accessible ST / labels / live-output tabs around the existing status and parameter editors. The original handlers, order, default/unique statuses, custom items, and labels remain the same; the inactive panel is hidden, not replaced with a mock.
- Wire the live-output tab action through `App → BuildWorkspace → BaseInfoWorkspace → BuildParamsPanel` to the existing preview toggle.
- Add responsive styles against the classes actually emitted by the production React components.
- Make the global preview panel closed by default, matching the review requirement that the editor is not compressed before the user asks to inspect output. The Home preview shortcut also explicitly closes the global panel and opens the Basic-area preview.
- Keep the sidebar grid valid at tablet widths; previously the B-type media query reduced the column count without updating the inherited grid areas, allowing the sticky build tabs to intercept navigation clicks.
- Match the approved B-type phone navigation (`ビルド` / `記録` / `取込` / `その他`) instead of shrinking all desktop destinations into the bottom row. Each destination is wired to the existing build, record, import-router, and utility-sheet flows. Home remains reachable from the Other sheet.
- Extend Playwright capture across desktop, tablet, mobile portrait, small phone, and phone landscape. The broad UI audit now separately exercises the Basic ST editor, label/parameter editor, and all three real CCFOLIA preview modes (board token, character sheet, generated JSON) on desktop and mobile; it validates ARIA selection, visible panels, and JSON structure before taking screenshots.
- Add structural regression tests for state binding, accessibility, callback wiring, and the production CSS selectors.

## Cross-route inventory

The existing broad UI audit captures two viewport classes and records states for home; account create/manage/edit; preview open/closed; all nine Build tabs; Basic ST and labels editors; board, character-sheet, and JSON output preview modes; persona selection and import modes; skill/passive/enhancement/support/E.G.O./spirit/items; shop categories; record/result import and held-persona import; settings; help/search; utility and save/export actions; sharing modes and the share preview; state import scope; and keyboard focus. This PR does not replace that audit; it augments the measured Basic-screen failure and the focused multi-viewport preview test.

## Limitations / merge gate

The standalone user-supplied `LBT_UI_Refinement_Prototypes.html` is now versioned at `docs/ui-reference/LBT_UI_Refinement_Prototypes.html`. It is the design source for the B. 統合ワークベンチ concept (Unified Workbench v4). The previous Library ZIP and its review notes are not interchangeable with this standalone v4 file and are not used as the implementation source for this revision. The interactive HTML is not itself a complete golden screenshot set for every production route; route/viewport-specific captures and blocking DOM geometry assertions remain required.

Production verification now separately checks the deployed GitHub Pages HTML, the B-type production marker, the App.js / Service Worker digest match, and every precached asset over HTTP. Required checks: `node --test tests/*.test.mjs` (including Python/PyMuPDF provenance), `node tools/sync-asset-versions.mjs --check`, production Pages smoke test, project verification, UI interaction audit screenshots, preview control visual regression, and tutorial screenshot capture.


## 画面レビュー追補：プレビュー領域の幅と配置

### 発見した問題
- Bタイプ用CSSの初期値が `--b-preview-w: 220px`、幅1100–1240pxでは208pxだった。CCFOLIAの盤面・キャラクターシート・JSONを読む右ペインとしては狭く、本文が折り返されるか、操作領域が圧縮される。
- index.html側には別変数 `--preview-w` を広げる指定があったが、後読みのBタイプCSSは `--b-preview-w` をグリッド幅に使用していた。プレビュー本体と開閉タブの基準幅も別々になりうる不整合があった。

### 修正
- 1100px以上のデスクトップでは通常幅を `clamp(340px, 28vw, 420px)` に統一。
- 1100–1240pxの狭いデスクトップでは `clamp(300px, 27vw, 340px)` を使用し、編集領域を残しながら最低限の閲覧幅を確保。
- `--preview-w` を `--b-preview-w` に同期し、右端の開閉タブがプレビューの実際の境界に追従するようにした。
- UI監査にデスクトップの可視プレビューペイン幅320px未満を重大警告として追加。画面キャプチャ時点で検出し、CIを失敗させる。

### v3設計レビューとの照合
- 盤面プレビュー：盤面とキャラクター情報を並べて見られる横幅を確保する。
- キャラクターシート：立ち絵、識別情報、ST・パラメータを狭い列に押し込まない。
- 出力データ：等幅JSONを読み取れる幅を確保する。
- 編集領域：プレビューを閉じた状態では編集側を全幅利用し、必要時のみ右ペインを開く既存動作を維持する。

この追補はレイアウト上の欠陥と設計意図への適合を検査するものであり、古い操作モックとのピクセル完全一致を主張するものではない。最新のv3レビューを正式な参照として、実画面のキャプチャと寸法検査を継続する。


## 画面レビュー追補：基本タブ内プレビューの配置

実画面キャプチャでは、基本タブの「駒・出力プレビュー」が立ち絵・画像URL編集・ST/ラベル領域の下に縦積みされ、プレビュータブを選んでも画面の初期表示範囲にプレビュー本体が入らない状態を確認した。上部の小型トークンサマリーだけでは、盤面・キャラクターシート・JSONの実際の確認には足りない。

- 1280px以上かつグローバル右プレビューを閉じている場合、基本情報編集面と組み立て設定面を横並びにする。
- 右側の組み立て設定面にST／ラベル／駒プレビューのタブをまとめ、駒プレビューを選択した際に上部の編集面と同じ視野で確認できるようにする。
- グローバル右プレビューを開いている場合は、中央の幅が減るため一列へ戻す。狭いデスクトップ・タブレット・スマートフォンも従来どおり縦積みとする。
- UI監査では、広いデスクトップでプレビュータブが表示されているのに組み立て設定面が編集面より48px以上下へ離れている場合、重大警告として失敗させる。

これはモック上の見栄えではなく、実際の `BaseInfoWorkspace` と `BuildParamsPanel` の状態・出力関数を維持したCSSレイアウト変更である。


## 全画面・全操作経路の統一監査プロトコル

2026-10-30以降の横断監査は、次の同一手順を画面ごと・操作経路ごとに適用する。

1. 1440×1000（デスクトップ）、1024×768（タブレット）、390×844（スマートフォン）で実画面を撮影。
2. 初期表示、全タブ、詳細パネル、折り畳み、メニュー、ダイアログ、入力欄、結果プレビューを記録。
3. DOM実測で座標・幅・高さ・水平オーバーフロー・スクロール領域・操作対象サイズ・フォーカスを確認。
4. 操作は監査専用の使い捨てアカウント／データで実行し、確定購入・外部公開・永続データ削除は行わない。
5. 各遷移後に aria-selected、表示パネル、入力フォーカス、生成データ構造を検証。
6. 問題を修正した場合は、同じビューポートと操作経路を再実行し、差分キャプチャと全テストで再確認する。

### 対象領域

- Home：コマンドヒーロー、ランチャー、作業再開パネル
- Build：基本、人格、スキル、パッシブ、強化、サポート、E.G.O、精神、アイテムの全タブ。基本内ST／ラベル／盤面／シート／JSON。人格選択・取り込み入口、スキル追加、E.G.O新規作成
- Shop：人格、サポート、E.G.O、精神、アイテム、ガチャの全カテゴリ
- Record：リザルト、人格、E.G.O、サポパ、精神、アイテムの全カテゴリ。テキスト流し込み、硝子窓一括取り込み、所持人格リスト取り込み
- Settings：ステータス一覧と全折り畳み設定
- Help：検索、カテゴリ、説明展開
- Global flows：クイック検索、上部操作、操作・保存、共有プレビュー、アカウント管理、作業状態の読み込み確認、キーボードフォーカス

### 安全境界

テストデータのみ変更し、実ユーザーのアカウント・所持品・通帳には触れない。購入確定、ガチャ実行、共有の外部公開、削除確定、ファイルの実適用は行わない。OAuthは監査対象外。

監査結果はスクリーンショット数だけで合格にせず、必須キャプチャ欠落、操作経路失敗、HTTP／コンソール／ページエラー、重大レイアウト警告を別々に集計する。


## 2026-10-30 横断画面レビュー結果

<details>
<summary>Playwright実画面監査：333 captures / 0 failures</summary>

- Desktop 1440×1000：119 captures
- Tablet 1024×768：118 captures
- Mobile 390×844：96 captures
- Settings：折り畳みパネル18状態（6状態×3 viewport）
- Import router：4つの遷移先を3 viewportで計12状態
- Home：9つのランチャー遷移を3 viewportで計27状態
- Interaction steps：96 captured / 0 failed
- Missing required captures：0
- Horizontal overflow：0
- Critical layout warnings：0
- Console errors / HTTP errors / page errors：すべて0
- Complete project tests：1,730 passed / 0 failed

</details>

### 画面レビュー所見

- Home：目的別ランチャー9項目と再開領域を確認。各ランチャーの遷移先を実操作で確認。
- Build：9タブをすべて確認。基本のST・ラベル・盤面・キャラクターシート・JSONは実生成結果で確認。人格の詳細・取り込み3方式、スキル追加、E.G.O新規作成入口を確認。
- Shop：人格・サポート・E.G.O・精神・アイテム・ガチャの6分類を確認。検索・大罪・出典フィルターの初期配置とカード一覧の可読性を確認。
- Record：リザルト・人格・E.G.O・サポパ・精神・アイテムの6分類を確認。テキスト取り込みの解析プレビュー、硝子窓取り込み、所持人格一覧取り込みを確認。
- Settings：ステータス一覧と同期情報・代入式・カスタム式・出力補助・アカウント・危険操作の展開状態を確認。危険操作は表示確認のみで実行していない。
- Help：検索・カテゴリ・項目展開を確認。
- Global：共通Import Routerの4遷移先、クイック検索、上部操作、操作・保存、共有HTMLプレビュー、アカウント管理、セーブデータの適用範囲確認、キーボードフォーカスを確認。

### 制限・未実行操作

実ユーザーデータを保護するため、購入確定・ガチャ抽選・外部共有公開・アカウント削除・保存データの実適用は実行していない。これらは確認ダイアログや入口までの画面・経路を検証した。OAuthは対象外。ピクセル完全一致は最新v3デザインの正式な全画面Golden Masterが存在しないため、今回の合格条件には含めていない。


## 2026-10-30 — supplied Unified Workbench v4 source and Basic parity correction

- Canonical source: `docs/ui-reference/LBT_UI_Refinement_Prototypes.html` (the standalone HTML attached by the user; not the older Library ZIP).
- Selected design: prototype B, `統合ワークベンチ`, Unified Workbench v4.
- Basic workspace now maps the actual state-backed React controls onto the prototype's `piece-workspace` / `piece-hero-grid` composition: portrait and vertical image-difference rail on the left; character name, PL, initiative, color, and live token summary on the right; ST / labels / preview formatting panel below.
- Existing React state, image URL persistence, shared-image compression, status/parameter editing, and CCFOLIA generation/copy functions remain authoritative. Prototype sample data is not copied into production.
- The old desktop override that placed the portrait editor and Basic formatting panel side-by-side has been removed because it contradicts v4.
- The production audit now captures `basic-workspace-v4-hero` and fails on wrong desktop/mobile column behavior, portrait aspect-ratio drift, or the format panel appearing before the hero ends.
- Reference CSS is copied from the submitted HTML v2/v3 sections into the production parity stylesheet; `index.html` and the Service Worker precache hashes are synchronized.
