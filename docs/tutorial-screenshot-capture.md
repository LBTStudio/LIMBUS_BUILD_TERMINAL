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

撮影結果は `artifacts/tutorial-screenshots/` に出ます。デスクトップ（1440×1000）とスマートフォン幅（390×844）の両方を撮影します。タスクの場所を示す注釈付き18枚に加え、使い方画面の初期表示を確認する `help-index-desktop.png`／`help-index-mobile.png` もArtifactへ保存します。この2枚は表示密度を確認するQA専用で、一般ユーザー向けの `docs/tutorial-captures/` には同梱しません。撮影用に新しいブラウザーコンテキストを作成し、既存の個人用localStorageを読み込まず、初回画面でアカウント作成が必要なら「操作ガイド撮影用」を一時作成します。手動保存・購入・取り込みの確定ボタンは押さず、案内対象のUIを開いて撮影します。CCFOLIAの立ち絵プレビュー撮影では専用の縦長SVG見本を一時入力し、基本タブ・盤面・編集画面をPC／スマートフォンで取得します。

## GitHub Actions

PRで関連ファイルが変わると `Tutorial UI screenshot capture` が実行され、同名のArtifactにPNGとmanifestを30日保存します。完了した実行の **Artifacts** から `lbt-tutorial-ui-captures-...` をダウンロードできます。WebP（品質86）へ圧縮した18枚は、撮影PNGとともに同じArtifactへまとめて保存します。CIはPRブランチへ画像を自動コミットしません。採用する場合はArtifactを取得して `docs/tutorial-captures/` に追加し、回帰テストとガイドの参照を一緒に更新します。ワークフローがmainへ入った後は、Actions画面から手動実行もできます。

## ガイドへ反映する

GitHub Actionsを使った同一リポジトリのPRでは、WebP版が `docs/tutorial-captures/` に自動追加されます。使い方ガイドは幅640px以下ではスマートフォン版、広い画面ではデスクトップ版を表示します。ローカルで撮影したPNGを採用する場合は、必要な画像をレビューし、WebPへ変換してから `docs/tutorial-captures/` へ追加し、ガイド側の参照と回帰テストを更新します。フォークからのPRではArtifactから取得して手動追加してください。

追加したCCFOLIA画像プレビュー6枚（portrait／board／editor × desktop／mobile）は注釈を付けず、実際の表示を撮影します。縦長の見本画像は撮影専用で、利用者の保存データには含まれません。その他の注釈付き画像は実画面に矢印と説明枠を重ねています。ブラウザー幅やUIの位置が変わったら、スクリプトを再実行してください。ターゲットボタンを見つけられない場合は撮影を失敗させ、古い／誤った画像を静かに生成しないようにしています。
