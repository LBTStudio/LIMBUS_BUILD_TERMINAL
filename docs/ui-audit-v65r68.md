# UI監査レポート V65r68（PC 1440x900 / モバイル 390x844）

方法: Playwright 実DOM実測 + スクショ目視。ナビ全7・ビルドタブ全8・ショップタブ5・記録タブ6・
オーバーレイ7種（人格一覧展開 / 人格詳細 / クイック検索 / 操作・保存 / 共有シート / プレビュー展開 / エントリー）を踏破。
キーボード: Tab移動のフォーカスリング、Escape閉鎖、アコーディオン、listbar開閉を実測。
エビデンス: `.playwright-mcp/audit-pc-01〜21.png` / `audit-mob-01〜20.png`（再撮影手順は末尾）。

## High（今回修正）

### H1 ビルド→アイテム: 見出しが1文字幅に潰れて縦積み
- 実測 390: `.owned-library-bar .t-label` = 17.03px x 213px @(29,243)。親 `.card-header`（flex, shrink許可）がラベルを収縮させる
- スクショ: audit-mob-15（左端の縦1文字列）
- 根因: ラベルに shrink 抑止がない（OtherSections.js:1776-1777）
- 修正: `.owned-library-bar .t-label { flex: 0 0 auto; white-space: nowrap; }`（sections.css）+
  狭幅では `.card-header.owned-library-bar { flex-wrap: wrap; }` で2段化を許可

### H2 ビルド→スキル 空状態: 唯一のCTAが初期表示で画面外
- 実測 390: `.deck-empty-cell` = 1248px（`.deck` は grid `repeat(5,240px)`・スクローラ幅356px）。
  `justify-content:center` のため CTA 中心 x≒636 > viewport 390（SkillDeck.js:304）
- スクショ: audit-mob-09（ほぼ空の破線箱） / PC は audit-pc-10（中央に微小CTA）
- 修正: `@media (max-width:1023px)` で `.deck-empty-cell { justify-content:flex-start; padding-left:var(--s-4); }`
- 残: 1024〜1290px・プレビュー展開中の狭いデスクトップでも CTA は初期表示外（横スクロールで到達可）。全幅対応は追加改修候補

### H3 記録タブバー: ラベルが2行折返し（人格→「人 / 格」）
- 実測 390: `.record-tabbar .segmented > button` に nowrap なし。6タブが押し潰され文字が各行1字（audit-mob-05）
- 修正: workspace.css の既存 `@media (max-width:640px)` ブロックへ `.record-tabbar .segmented` を追加
  （`overflow-x:auto; max-width:100%` / button `flex:0 0 auto; white-space:nowrap`）

## Medium（今回修正）

### M1 persona listbar の開閉がキーボードで不可
- 実測: `.pw-listbar` = div `role="button"` / tabindex属性なし / aria-expandedなし（PersonaCodex.js:1041）。Tab順に現れない
- 修正: `tabIndex:0` + `aria-expanded:codexExpanded` + Enter/Spaceハンドラ（`event.target === event.currentTarget` ガード付き）

### M2 プレビュー「格納」ボタンにアクセシブル名がない
- 実測: `.preview-close`（24x76 @354,216）は `title` のみ・aria-labelなし・テキストなし（LivePreview.js:243）
- 修正: `aria-label: "プレビューを格納"` を追加（titleと同文言）

### M3 使い方の記号が実ボタンと不一致
- App.js:44「◇ 同期化して手動編集」 vs 実ボタン（PersonaCodex.js:442）「◈ 同期化して手動編集」
- 修正: App.js を ◈ に統一。テストピン（help-tutorial.test.mjs:10）も◈へ追随

### M4 タイトルのバージョン不一致
- index.html:6 `V65r67` vs 同:75 `LBT_VERSION = "V65r68"`（共有シートfooterは V65r68 を表示）
- 修正: タイトルを V65r68 へ

## Low（今回修正）

### L1 大罪ソートチップの絵文字
- `🎯 大罪ソート`（PersonaCodex.js:1088、`\u{1F3AF}`）— 絵文字なしの他チップと不整合
- 修正: 絵文字除去

## 提案（未実施・次回候補）
- P1 PC作成フォーム: `.acct-card-hit`（219x432・CTA下端固定）中央の死に領域と入力幅195px固定の見直し
- P2 タブ帯横スクロール（ビルド8・記録6・ショップ5）に端フェード等の affordance がない
- P3 トップバー左の記号のみボタン群（◆/I 系）の意味が読み取りにくい
- P4 ビルド見出し「所持人格」が390幅で「所持人 / 格」に折返す（CJK標準挙動。text-wrap: balance 等）
- P5 同期ランク説明など11px暗色注記の視認性

## 良好（維持）
- フォーカスリング: outline 3px rgb(255,179,92) + 5px glow（実測。Tab移動で明確に判別可）
- 設定アコーディオンは native `<details>` x7 = キーボード標準対応
- オーバーレイは Escape で閉鎖（共有シート / 検索 / 詳細 / 操作シートで実測）。クイック検索はキーボードヒント表示付き
- 色コーディング（罪=色ドット / 耐性=緑・橙・灰 / ランク色）が一貫

## コンソールエラー（負荷タスク側で対応）
- `fonts.googleapis.com` TIMEOUT / `fonts.gstatic.com` RESET（外部フォント）
- `favicon.ico` 404（favicon未設定） / `cdn-cgi/rum` 404（Cloudflare beacon・localhostのみ）

## 再撮影手順
1. `http://127.0.0.1:8811/?cb=<任意>` を開き `.acct-card-hit` で入場
2. モバイル: viewport 390x844。下部ナビ全7 + ビルドタブ全8 + 各オーバーレイを巡回
3. PC: 1440x900。左レール全7 + 同上
