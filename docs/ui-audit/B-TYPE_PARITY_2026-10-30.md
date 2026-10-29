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

The prototype and review are available from the user Library package but are not currently checked into the repository. The prototype is an interactive concept reference rather than an image-by-image golden master of every production React route. This pass now uses it alongside the v2/v3 Basic-sheet notes and production screenshots to fix concrete structure, state routing, and responsive geometry defects; no claim is made that every page is pixel-identical. The next parity step is to version the reference package and retain named target screenshots for each route/viewport so visual drift is a blocking regression rather than a subjective review.

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
