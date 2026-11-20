# LBT共有リンクの持続性 — 3専門観点による深層検討

更新日: 2026-08-18  
対象: LIMBUS BUILD TERMINAL V65 の短縮共有リンクとDiscordカード

## 1. 絶対条件

この検討では、単に「別の無料サービスがある」ことを採択理由にしない。次の条件を同時に満たすことを採択条件とした。

| 条件 | 意味 |
|---|---|
| 個別カード | 人格名、HP、SAN、同期ランク、MAX、共有画像をリンクごとに表示する。 |
| 直接閲覧 | カードからLBT共有シートへ到達し、外部ページを経由させない。 |
| 利用者無操作 | 発行者・閲覧者へ登録、ログイン、Bot導入、Webhook設定、URL選択を求めない。 |
| 無料・無管理 | 有料枠、支払い情報、独自ドメイン、複数アカウントの日常保守へ依存しない。 |
| 大人数耐性 | 100〜200人規模の通常共有で、再閲覧・再プレビュー・外部保存先遅延に強い。 |

Open Graphでは、個別カードのタイトル・URL・画像は、取得時に返すHTMLの`head`にある`meta`タグで表す必要がある。[1]

## 2. 専門家A: 配信基盤・エッジ設計

### 提案

個別カードを返す動的処理を、Cloudflare Worker以外の無料サーバーレス基盤、別Worker、Cloudflare Pages Functions、または複数のサービスへ分散する。

### 検証

Cloudflare Pages FunctionsはWorkers上で動き、そのリクエストはWorkersプランのクォータに計上される。[2] したがって、WorkerをPages Functionsへ移すだけでは日次受信上限を改善しない。複数の無料動的基盤へ分散する方法は、各サービスの無料枠・規約・障害・認証情報を新たに管理する必要があり、無管理・請求ゼロの確実性を下げる。

### 結論

採択しない。現行Workerに対しては、同一共有のOGP HTML・画像をキャッシュし、主・予備保存先を自動復元する方法が、追加の管理対象を増やさずに実行・外部取得・一時障害を減らす最小の改善である。

## 3. 専門家B: リンク・OGPプロトコル設計

### 提案

個別カードをGitHub PagesやRentryのような静的・公開ページで返し、動的Workerを経由しない。

### 検証

GitHub PagesはリポジトリのHTML・CSS・JavaScriptを公開する静的ホスティングである。[3] クエリやハッシュの内容に応じてサーバー側で別の`head`を返せないため、共有IDごとのカードには共有ごとのHTMLファイルを事前生成しなければならない。匿名利用者が発行のたびにGitHubへ安全に書き込むことはできず、配備待機も即時共有に適さない。

Rentryは`SHARE_TITLE`、`SHARE_DESCRIPTION`、`SHARE_IMAGE`を持ち、カード用のメタデータを保存できる。[4] しかし、公式のメタデータ・OPTION仕様にはLBT共有シートへ無操作で転送する設定がない。そのためRentryを主リンクにすれば、カードは出せても中間ページが残る。

### 結論

採択しない。静的ページは通常閲覧用として最適だが、匿名・即時・個別OGPを同時に担うことはできない。

## 4. 専門家C: Discord連携・運用耐性

### 提案

DiscordのWebhookまたはBot APIで、リンクOGPではなく埋め込みカード自体を投稿する。

### 検証

Discord Webhookは埋め込み本文・画像を直接送れる。[5] しかし、チャンネルWebhookの作成には`MANAGE_WEBHOOKS`権限が必要で、発行されたWebhookトークンは投稿権限を持つ秘密情報である。[5] これを公開ブラウザへ渡すと任意投稿に悪用される。中央Botも、サーバー管理者による導入・権限付与・トークン保管・運用を必要とする。

### 結論

通常共有の代替には採択しない。特定の一つのDiscordサーバーで管理者が公式Botを導入するという将来条件なら、補助投稿機能として有効である。

## 5. 反証会議

3名の案を相互に反証した結果は次のとおりである。

| 案 | どの問題を解くか | 失う条件 | 判定 |
|---|---|---|---|
| Cloudflare Pages Functionsへ移行 | Workerコードの置き場所 | 日次上限は同じ | 却下 |
| 複数無料サーバーレスへ分散 | 一つの上限への集中 | 無管理・請求ゼロの確実性・規約耐性 | 却下 |
| GitHub Pagesに共有別HTMLを生成 | Worker受信をゼロ化 | 匿名即時発行・配備不要 | 却下 |
| Rentryをカード入口にする | Cloudflare依存を下げる | 中間ページなし | 却下 |
| Discord Webhook/Bot投稿 | OGP取得を不要にする | 任意サーバー・利用者無操作・秘密管理なし | 却下 |
| 静的共有URLだけを使う | Worker依存をゼロ化 | 個別Discordカード | 却下 |

## 6. 採択する現行方針

現行の無状態Workerを維持し、次の自動化を組み合わせる。

1. 不変共有のOGP HTML・画像をキャッシュし、再プレビュー時のWorker実行とRentry／Telegraph読込を抑える。
2. RentryとTelegraphへ並列保存し、片方の取得失敗・破損時はもう一方を自動利用する。
3. Rentryの長いトークンを連番チャンクに分け、保存時の切断を避ける。
4. Worker更新後にCache設定を再適用し、`MISS → HIT`を実測する。

この方針は日次100,000受信枠を増やさない。ただし、同じ共有を多人数が開くときの重い処理と外部保存先アクセスをほぼ初回だけにし、通常規模で起きやすい遅延・復元失敗・保存先一時障害を減らす。

## 7. 条件を一つ緩める場合の次善策

| 緩める条件 | 可能になる改善 | 推奨場面 |
|---|---|---|
| 特定Discordサーバーの管理者導入を許可 | 公式BotまたはWebhookの直接Embed投稿 | 閉じたコミュニティで共有先が固定される場合 |
| Rentry中間ページを許可 | Workerを通らないカード入口 | Discordカードだけを最優先する場合 |
| 共有者のGitHub認証を許可 | 共有ごとの静的HTML生成 | 発行者が限定され、配備待機を許容する場合 |
| 独自ドメインとオリジン管理を許可 | Zone Routeの静的フォールバック | 料金・ドメイン管理を受容し、上限後も閲覧を優先する場合 |
| 個別カードを諦める | GitHub Pages直リンク | 大規模配布のみを優先する場合 |

## References

[1] [The Open Graph Protocol](https://ogp.me/)  
[2] [Cloudflare Pages Functions](https://developers.cloudflare.com/pages/functions/) / [Pages Limits](https://developers.cloudflare.com/pages/platform/limits/)  
[3] [GitHub Pages — What is GitHub Pages?](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)  
[4] [Rentry Metadata Docs](https://rentry.co/metadata-how)  
[5] [Discord Webhook Resource](https://docs.discord.com/developers/resources/webhook)
