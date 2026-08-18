# 配備確認記録

2026-08-18にCloudflare API経由で`lbt-ogp`を配備し、WorkersのScript APIは`200`、`usage_model: standard`、保存サービスのbindingなしを返しました。`workers.dev`公開設定も`enabled: true`、Preview URLは`false`で設定済みです。

公開URLはCloudflare APIで確認してから確定します。現在の公開先は中立名の`https://lbt-ogp.lbtstudio-share.workers.dev`です。旧サブドメインはCloudflareのアカウント設定で停止し、以後の共有リンク・GitHub Pages設定・回帰テストでは使用しません。

`/health`は`200`と`LBT OGP gateway: free/stateless`を返します。既存の`LBT-Share-08-18-5`では`/s`が個別の人格名・MAX・画像用`/i` URLを含むOGP HTMLを返し、`/i`は`200 image/webp`、28,052 bytesを返しました。

GitHub反映前のローカルLBT v64r111デスクトップ画面も確認済みです。上部ナビゲーション、アイテム一覧、JSONプレビュー、プレビュー格納タブは描画され、今回のOGP設定追加による画面レイアウトの崩れは確認されませんでした。

実在する共有URL`/s?s=t:LBT-Share-08-18-5`をブラウザで開き、OGP入口から`share.html?s=t%3ALBT-Share-08-18-5`へ遷移後、`【人格】東部親指カポIIII [MAX]｜LBT`として実データを復元・表示できることを確認しました。

同一の既存共有は公式人格の差分参照形式だったため、OGP生成時のみ固定の公式DBから表示情報を補完する処理を追加しました。更新後の公開`/s`応答は`東部親指カポIIII — LIMBUS BUILD TERMINAL`、`HP 166 · SAN 50 · MAX`を返すことを確認済みです。
