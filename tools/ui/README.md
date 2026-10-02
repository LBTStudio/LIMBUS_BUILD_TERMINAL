# tools/ui — ブラウザ描画の検証基盤

 CSS や DOM の変更は、`node --test tests\*.test.mjs`（DOM なしの VM 実行）では
検証できない。ここでは実際の  Chromium でページを描画し、描画結果と
アクセシビリティを実測する。

## なぜ必要か

この計画を作成した時点では、ブラウザで描画を確認する手段がリポジトリに
存在しなかった。Phase 0 で Playwright と axe-core を導入してからは、
以下の確認を毎回Elevating に行っている。

- 12 セクションのスクリーンショットを 2 回撮り、同じになるか（描画の決定性）
- 変更前後でピクセルを比較し、意図しない差分がないか
- axe による違反（`nested-interactive` など静的監査では漏れるもの）
- 全要素の計算スタイルを比較して、副作用がないか
- 幅を変えたときの到達不能要素（overflow の切り落とし）

静的監査が実際に見落とした例が 2 件ある。`nested-interactive` 145 件は
静的監査が漏らしていたため、axe で初めて優先度が見えた。
また plan に書かれていた「同心円違反 25 組」は、行番号からの推測で
実測すると 0 組だった。** そのため、DOM を見ずに数を書かない。**

## セットアップ

依存はリポジトリに含めない（静的サイトなので、ビルドなしで配信	continue できるようにする）。

```powershell
# 依存をローカルに用意する（.gitignore 済みの .browser-deps/ に入る）
npm install --prefix .browser-deps playwright axe-core pngjs
npx --prefix .browser-deps playwright install chromium
```

`.browser-deps/` は `.gitignore` 済み。

## 使い方

すべてのスクリプトは `tools/ui/` を基準にリポジトリのルートを解決する。

```powershell
# 1. 静的サーバを起動（別ターミナル）
node tools/ui/serve.mjs
#    -> http://localhost:8099/

# 2. 12 セクションを描画して axe を走らせる
node tools/ui/axe-scan.mjs
```

`BASE_URL` 環境変数で GitHub Pages など実配布物も対象にできる。

```powershell
$env:BASE_URL = "https://lbtstudio.github.io/LIMBUS_BUILD_TERMINAL/"
node tools/ui/axe-scan.mjs
```

## スクリプト一覧

| スクリプト | 目的 |
|---|---|
| `harness.mjs` | 共通の依存解決・12セクション巡回・スクリーンショット撮影（直接実行しない） |
| `serve.mjs` | 静的サーバ（`localhost:8099`）。ブラウザ検証の土台 |
| `axe-scan.mjs` | 12 セクションを巡回して axe 違反と pass 数を集計 |
| `capture.mjs` | 12 セクションのスクリーンショットを撮る（差分比較の基準） |
| `compare-shots.mjs` | 2 組のスクリーンショットをピクセル比較し、差分領域を PNG にする |
| `probe-styles.mjs` | 全要素の計算スタイル・矩形・擬似要素を採取して比較用 JSON を出す |
| `audit-reachability.mjs` | 幅を変えながら到達不能要素（overflow で切られた要素）を洗い出す |
| `audit-reduced-motion.mjs` | reduced-motion 設定での実際の計算値を測る |
| `dead-css.mjs` | 12 セクションを巡回して未使用セレクタを洗い出す（操作フローは含まない） |

## 終了コードの規約

**2026-10-03 追記。** 従来の `verify-*` の大半は判定を console.log するだけで
exit 0 に終わっていた。CI でも人間でも「合格」と誤読できた。種類を分ける。

### A. ゲートする（判定が失敗したら exit 1）

合否が1値で決まるもの。exit code で合否を渡す。

| スクリプト | ゲート条件 |
|---|---|
| `verify-roster-tab-sort.mjs` | 所持タブの並び順が既定に戻り、空白表示でないこと |
| `verify-short-works.mjs` | 短縮 URL の往復で全フィールド一致すること |
| `compare-shots.mjs` | 差分率がしきい値を超えたら exit 1 |
| `probe-styles.mjs` | 期待矩形との差がしきい値を超えたら exit 1 |
| `harness.mjs` | 共通処理。直接実行しない |

### B. 報告のみ（exit 0 が仕様）

数値や一覧を出すだけで合否が存在しないもの。`measure-*` と `perf-*` がこれ。
**これらを exit 1 にするのは誤り。** 目視と記録が用途。

| スクリプト | 出力するもの |
|---|---|
| `measure-*.mjs` / `perf-*.mjs` | 描画と応答の時間値 |
| `audit-*.mjs` | 検出した違反の一覧と件数 |
| `dead-css.mjs` | 未使用セレクタ候補の一覧 |
| 上記以外の `probe-*.mjs` | 個別の状態ダンプ |

### 判定は出すが exit 0 のままのもの

`verify-disclaimer.mjs`、`verify-ego-expanded.mjs`、`verify-corplogo.mjs`、
`verify-source-filter.mjs`、`verify-ogp-colors.mjs`。

ブラウザ実行なしでは動作を確認できないため、exit を足すのは
「検証していない修正」になる。使うときは**判定行を必ず読む**こと。

### shots/ は自動生成される

`tools/ui/shots/` は `.gitignore` 済みで、チェックアウト直後は無い。
`harness.mjs` を import した時点で `ensureShotDir()` が作成する。

### 主な使い方

```powershell
# 変更前の基準を撮る
node tools/ui/capture.mjs before

# 変更
# ... CSS / JS を直す ...

# 変更後を撮って比較する
node tools/ui/capture.mjs after
node tools/ui/compare-shots.mjs before after
# 差分があれば tools/ui/shots/diff-*.png が出る（上が変更前、下が変更後）

# axe と到達性はいつでも
node tools/ui/axe-scan.mjs
node tools/ui/audit-reachability.mjs
```

##  주의

- `dead-css.mjs` の「未使用」は**上限値**である。クリックしないと開かない
  パネル（デッキ編集、E.G.O のモード切替など）は初期表示に現れないため、
  死んだコードと誤判定する。JS に文字列として現れるクラス名を除外してから
  使うこと（スクリプトは両方rau の交差を出力する）。
- `compare-shots.mjs` は描画が決定的な前提で動く。同じツリーを 2 回撮って
  同一であることを先に確認してから、変更前後を比較する。
- `body { overflow-x: hidden }` が残っているため、ページ横スクロールが
  出ないことだけでは「溢れていない」証明にならない。必ず
  `audit-reachability.mjs` で祖先による切り落としまで見る。