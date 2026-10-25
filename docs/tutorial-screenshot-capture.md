# 使い方ガイド用・実UIスクリーンショットの撮影

この手段はSVGで画面を描き直すためのものではありません。PlaywrightでLIMBUS BUILD TERMINALをChromium上に実際に表示し、DOMから取得したボタンの位置に枠・矢印・短いラベルを重ねてPNGにします。アプリの本文・ボタン・ナビゲーションは実際の画面描画です。

## 最短手順（Windows / PowerShell）

リポジトリのルートで実行します。

```powershell
npm install --no-save playwright@1.64.0
npx playwright install chromium
node tools/ui/capture-tutorial-screenshots.mjs
```

Linux / CIではブラウザーに必要なシステム依存も含めてインストールします。

```bash
npm install --no-save playwright@1.64.0
npx playwright install --with-deps chromium
node tools/ui/capture-tutorial-screenshots.mjs
```

撮影結果は `artifacts/tutorial-screenshots/` に出ます。現在はデスクトップ（1440×1000）とスマートフォン幅（390×844）の両方を撮影します。撮影用に新しいブラウザーコンテキストを作成し、既存の個人用localStorageを読み込まず、初回画面でアカウント作成が必要なら「操作ガイド撮影用」を一時作成します。手動保存・購入・取り込みの確定ボタンは押さず、案内対象のUIを開いて撮影します。

## GitHub Actions

PRで関連ファイルが変わると `Tutorial UI screenshot capture` が実行され、同名のArtifactにPNGとmanifestを30日保存します。完了した実行の **Artifacts** から `lbt-tutorial-ui-captures-...` をダウンロードできます。ワークフローがmainへ入った後は、Actions画面から手動実行もできます。

## ガイドへ反映する

1. Artifactを展開し、欲しいデスクトップ／モバイルPNGを選びます。
2. 画像を `docs/tutorial-captures/` にコピーします。
3. ガイド側の画像参照をそのPNGに変更し、PRでレビューします。

撮影は実画面のスクリーンショットですが、矢印と説明枠は後から重ねた注釈です。ブラウザー幅やUIの位置が変わったら、スクリプトを再実行してください。ターゲットボタンを見つけられない場合は撮影を失敗させ、古い／誤った画像を静かに生成しないようにしています。
