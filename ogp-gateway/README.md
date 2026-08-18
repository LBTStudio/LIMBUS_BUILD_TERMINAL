# LBT OGP Gateway

共有トークンを既存のRentry／Telegraphから読み取り、個別のOGP HTMLと画像を返すCloudflare Workerです。DB・KV・R2・D1・Queues・Cloudflare Images・独自ドメインを使わない、**Workers Free専用の無状態構成**です。

## 無課金固定の運用条件

Cloudflare DashboardでWorkers Paid、R2、KV、D1、Queues、Images、独自ドメイン購入を有効化しないでください。`workers.dev` URLだけを使用します。Free上限を超えた場合、Workerは失敗または迂回されますが、自動的にPaidへ移行しません。

## パス

| パス | 用途 |
|---|---|
| `/s?s=t:TELEGRAPH_ID,r:RENTRY_ID` | 個別OGPメタを返し、その後LBT共有シートへ遷移します。 |
| `/i?s=t:TELEGRAPH_ID,r:RENTRY_ID` | 共有トークン内のWebP/JPEG画像を返します。 |
| `/health` | 課金対象の保存機能を使わないことを確認する簡易応答です。 |

## 配備

Cloudflare Dashboardの**Workers & Pages → Create application → Create Worker**から、Worker名を`lbt-ogp`として作成し、このディレクトリの`worker.mjs`を貼り付けてDeployします。配備後のURLは`https://lbt-ogp.<account-subdomain>.workers.dev`です。LBT本体側の`window.LBT_OGP_GATEWAY_ORIGIN`を同じURLへ設定してください。
