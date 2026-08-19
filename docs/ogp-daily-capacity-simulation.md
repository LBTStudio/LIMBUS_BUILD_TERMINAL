# LBT個別OGP — 日次容量の簡易目安

更新日: 2026-08-19

## まず結論

Cloudflare Workers Freeは日次100,000受信リクエストが上限である。LBTでは、**Discordに画像付きカードを1回表示する**と、カードHTMLの`/s`と個別画像の`/i`で、最大おおむね**2リクエスト**を使う。共有リンクを人がクリックして開く場合も、静的GitHub Pagesへ転送される前に`/s`を通るため、**1クリックにつき約1リクエスト**である。[1]

安全を見て、日次80,000件までを運用目標とする。残り20,000件はDiscordの再プレビュー、旧リンク、障害時の再試行に残す。

```text
1日のWorker受信 ≒ （Discordカード表示回数 × 2）＋（共有リンクを開いた回数 × 1）
```

画像未設定の共有では、カード画像はGitHub Pagesの固定画像から直接読み込むため、カード表示は約1リクエストになる。以下は**全共有が個別画像あり**という多めの見積もりである。

## 数百人規模の目安

| 利用規模と行動 | Discordカード表示 | リンクを開く回数 | 推定受信数/日 | 日次枠に対する評価 |
| --- | ---: | ---: | ---: | --- |
| 200人が各5件共有、各共有を10人が開く | 1,000 | 10,000 | 12,000 | 十分余裕 |
| 500人が各5件共有、各共有を10人が開く | 2,500 | 25,000 | 30,000 | 余裕あり |
| 1,000人が各5件共有、各共有を10人が開く | 5,000 | 50,000 | 60,000 | 運用可能だが混雑日に注意 |
| 1,000人が各10件共有、各共有を10人が開く | 10,000 | 100,000 | 120,000 | 上限超過の可能性が高い |

つまり、**数百人が普通に使う範囲なら問題になりにくい**。危険なのは「1日に数千〜1万件の新規共有を出し、各リンクを多数人が実際に開く」日である。カード表示だけなら、画像ありでも概算50,000件/日までが理論上の上限であるが、実運用では80%の40,000件/日以下を目安とする。

## さらに増やすには

カードの内容を維持したままCloudflareの受信を減らすには、共有URLの一部をCloudflare以外へ**直接**発行する必要がある。入口にCloudflareを残したまま別サービスを呼んでも、Cloudflare受信は減らない。

最有力はNetlify FreeのEdge Functionsである。Freeは月300 creditsのhard limitで、auto rechargeがなく、公式に請求されないと説明されている。web requestは1万件で2 creditsのため、画像・帯域・関数計算も含めて余裕を見ながら、Cloudflareと別枠で個別OGPを返せる。[2] [3]

この第2入口を追加し、新規共有の半分をNetlifyのURLに決定的に振り分ければ、Cloudflare受信は概算で半分になる。利用者にはログイン・選択・待機を要求しない。ただし所有者側では、最初にNetlify Freeアカウントを一度だけ接続して配置する必要がある。Netlifyが月次上限へ到達した場合は、その月のNetlify共有だけが停止するため、Cloudflare単独より「無限」になるわけではない。

## 参照

[1]: https://developers.cloudflare.com/workers/platform/pricing/ "Cloudflare Workers Pricing"
[2]: https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/ "Netlify Credit-based Pricing Plans"
[3]: https://www.netlify.com/pricing/personal-vs-free/ "Netlify Personal vs Free"
