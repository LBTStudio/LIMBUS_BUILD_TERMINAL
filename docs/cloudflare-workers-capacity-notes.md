# Cloudflare Workers Free: 多人数共有の設計メモ

調査日: 2026-08-18

## 公式仕様

Cloudflare Workers Freeは、アカウント単位で1日100,000受信リクエスト、1回あたりCPU 10ms、外部サブリクエスト50件である。日次上限超過時はError 1027を返す。待機中の外部`fetch()`はCPU時間へ算入されない。

- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/workers/platform/pricing/

Workers Cacheは、`Cache-Control`を返すGET/HEADレスポンスをWorker実行前にエッジで返せる。階層化キャッシュとリクエスト集約により、同一URLへの集中アクセス時はWorker起動と外部保存先読込を抑制できる。共有IDは不変であり、成功した`/s` OGP HTMLと`/i`共有画像は長期キャッシュに適する。

Workers CacheのヒットもWorkerへの受信リクエストとして日次枠には計上される。そのため100,000件の受信上限を無限化するものではないが、CPU実行・Rentry/Telegraph読込・同時アクセスによる負荷を自動で抑え、通常規模での可用性を高める。LBTは7日間のfresh cache、続く30日間の`stale-while-revalidate`、外部保存先のエラー時に使う30日間の`stale-if-error`を設定する。Worker更新後のOGPメタデータが古いまま残らないよう、キャッシュはWorkerバージョン単位で分離する。

- https://developers.cloudflare.com/workers/cache/
- https://developers.cloudflare.com/workers/runtime-apis/cache/
- https://developers.cloudflare.com/workers/reference/how-the-cache-works/

## 現行LBTでの前提

共有発行はRentry/Telegraphへ直接保存し、Cloudflare Workerは短縮共有URLのOGP (`/s`)、共有画像 (`/i`)、外部保存直読失敗時の復元 (`/d`) に使う。したがって上限の主因は発行回数ではなく、Discord再プレビューと閲覧の総到達回数である。

利用者に別URLの手動選択を求めず、成功済みの不変共有をキャッシュして平常時のWorker実行を減らし、未キャッシュ・障害時は既存の主/予備保存先自動切替へ委ねる。

OGPゲートウェイはカード生成時だけを担当し、`canonical`と`og:url`にはGitHub Pagesの静的共有ページを設定する。標準的なOGクライアントがカードの正規URLを用いる場合、閲覧先をWorkerではなく静的共有ページとして扱える。Rentryは共有メタデータを生成できるが、無操作でGitHub Pagesへ遷移する公式設定を提供しないため、主経路には採用しない。

2026-08-18に、実在する短縮共有URLをWorker経由で開く画面を確認した。共有シートは静的GitHub Pagesへ自動遷移し、人格名・HP・SAN・同期MAX・共有画像・耐性カードの表示に崩れは見られなかった。

## 継続性の定量評価

Workers CacheはWorkerコードの実行前にキャッシュを照会し、ヒット時はWorkerコード・Rentry・Telegraphを呼び出さない。一方で、キャッシュヒットもWorkersへの受信リクエストとして日次100,000件枠に計上される。したがって、Cacheは日次受信枠を拡張しないが、CPU 10ms上限への到達、外部保存先の同時読込、初回集中時の復元失敗を大幅に減らす。

200人がそれぞれ1つの共有を投稿し、全員が全リンクを1回開く極端な1ラウンドでは、共有シート閲覧は40,000回である。画像カードの各共有1回のHTML・画像取得まで加えると、受信回数は約40,400回であり、日次100,000件の範囲に収まる。これに対し、同じ共有の200回閲覧はCacheなしでは約200回のWorker実行と外部トークン取得を招くが、キャッシュ後は通常1回の生成と以後のキャッシュ応答に集約される。画像ありではOGP HTMLと画像で最大2回の初期生成となる。

200人が各5つの異なる共有を投稿し、全員が各リンクを開く極端なケースでは、閲覧だけで200,000回となる。この場合はCacheを使ってもFreeの日次受信枠を超える。利用者に操作を課さず、個別OGPを動的生成し、無償・無管理を保つという現在の条件下で、この上限を超える受信を自動的に別基盤へ移す有効な方式はない。

通常閲覧をWorker URLから302でGitHub Pagesへ転送する案は検証したが、最初の到達がWorkerであるため受信枠を減らさないことを確認し、採用しない。以後は、受信枠を実際に減らせない経路変更を可用性改善として扱わない。

## Cache設定を維持する配備手順

Workers Scripts APIによる従来のモジュール再アップロードでは、既存の`cache_options`を初期化する。以後の配備はCloudflare Version Upload APIを使い、バージョンmetadataで`cache_options: { enabled: true, cross_version_cache: false }`を明示してから、作成したversion IDを100%のDeploymentとして割り当てる。最後に同一OGP URLを2回取得し、1回目の`CF-Cache-Status: MISS`、2回目の`HIT`を確認する。

2026-08-19にこの手順で、`cache_options.enabled: true`を持つ無状態・bindingsなしの本番バージョンを配備し、実URLで`MISS → HIT`を確認した。この手順により、初回のOGP HTML・画像生成だけがWorkerを実行し、同一共有への後続取得はWorkerコード・Rentry・Telegraphを実行せずキャッシュから返る。キャッシュヒットも日次受信枠には計上されるため、配備検証では「受信枠の削減」ではなく「CPU・外部取得・同時障害の削減」として評価する。

## 日次受信上限を超える場合の候補検討

現行の`workers.dev`共有URLは、個別OGPを表示するために必ずWorkerへ到達する。静的GitHub Pages URLを直接配るとWorker受信はゼロにできるが、Discordは動的な人格名・HP・SAN・共有画像を取得できない。Rentryは共有タイトル・説明・画像のメタデータを持てるが、公式メタデータ仕様にはGitHub Pagesへ無操作で遷移する設定がないため、中間ページをなくす要件を満たさない。

Cloudflareの「fail open」で上限到達後に静的共有へ流すには、Cloudflare Zone内の独自ドメインまたはルートと、GitHub Pages等の既存オリジンが必要である。現行の`workers.dev`はこの構成ではなく、独自ドメインを新たに取得・管理することは請求ゼロ・無管理の前提を崩すため採用しない。したがって、現行条件を全て維持したまま日次100,000件の受信枠そのものを増やす実装は存在しない。

### 代替OGP調査の外部根拠（2026-08-18）

Rentry公式メタデータ仕様は`SHARE_TITLE`、`SHARE_DESCRIPTION`、`SHARE_IMAGE`によるカード用のテキスト・画像指定を提供するが、確認したOPTION群にはGitHub Pages等の外部URLへ無操作で遷移する設定はない。Cloudflare公式では`workers.dev`は独自ドメインを登録せずにWorkerを公開するサブドメインであり、Routeを使うにはCloudflare Zone、プロキシ済みDNSレコード、既存オリジンが必要である。これらは、Rentryを直接カード入口にすると中間ページが残ること、fail openによる静的共有継続には別途管理対象のドメイン・オリジンが必要になることの根拠である。

参照: https://rentry.co/metadata-how ／ https://developers.cloudflare.com/workers/configuration/routing/workers-dev/ ／ https://developers.cloudflare.com/workers/configuration/routing/routes/

## Worker代替OGPの三観点検討（2026-08-18）

### 配信基盤の観点

Rentryは`SHARE_TITLE`・`SHARE_DESCRIPTION`・`SHARE_IMAGE`により個別カード用メタデータを保存できるため、Cloudflareを経由しないカード入口としては候補になる。しかし、Rentry公式のメタデータ・OPTION仕様には、閲覧者をGitHub Pages共有シートへ無操作で転送する設定はない。これを主URLにするとカードは作れてもRentryの中間ページが残る。

### データ生成の観点

GitHub Pagesが個別カードを返すには、共有IDごとのHTMLを発行時にリポジトリへ生成・配備する必要がある。公開利用者が認証なしでGitHubへ書き込む仕組みは安全に作れず、GitHub Actionsの起動・反映待ちも即時共有には適さない。静的`share.html`のJavaScriptでタイトルを更新しても、Open Graphの取得側はHTMLの`head`内メタデータを読むため個別カードにはならない。

### Discord互換性の観点

Open Graphプロトコルでは、個別カードの`og:title`、`og:url`、`og:image`等をリクエスト時のHTML`head`内`meta`タグとして返す必要がある。そのため、短い一つのURLから人格ごとに違うカードを返しつつ中間ページをなくすには、現在のWorkerのような動的HTML応答か、共有ごとの事前生成済み静的HTMLのどちらかが不可欠である。

結論として、現行の完全無料・無管理・利用者無操作・短URL・個別カード・中間ページなしを同時に満たすWorker代替基盤は確認できなかった。代替案は、Rentry中間ページを許容する、共有発行者にGitHub認証を求める、独自ドメインと管理対象を追加する、または動的カードを諦める、のいずれかの条件緩和を要する。

参照: https://ogp.me/ ／ https://rentry.co/metadata-how

## 深層検討の追加確認: 静的配信とPages Functions

GitHub PagesはリポジトリからHTML・CSS・JavaScriptを公開する静的ホスティングであり、共有IDごとに違う`head`を返すサーバー処理は実行できない。個別OGPを静的化するには共有発行時に個別HTMLファイルを生成してリポジトリへ安全に書き込む必要があるが、匿名利用者へその書込権限を渡すことはできない。

Cloudflare Pages Functionsは動的OGPの代替に見えるが、FunctionsはCloudflare Workers上で実行され、FunctionリクエストはWorkersプランのクォータに計上される。したがって、現行WorkerをPages Functionsへ移すだけでは日次上限を改善しない。Cloudflare Pagesの静的アセットは動的カードを返せない一方、共有ごとに静的ファイルを事前生成できればFunction受信を回避できる。ただしFreeでは1サイトあたり20,000ファイル、月500ビルドの制限もあり、無期限・匿名・即時の共有発行基盤にはならない。

参照: https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages ／ https://developers.cloudflare.com/pages/functions/ ／ https://developers.cloudflare.com/pages/platform/limits/

## 深層検討の追加確認: Discord API埋め込み

DiscordのWebhook実行APIは、リンクOGPを使わず埋め込み本文・画像を直接投稿できる。しかし、投稿先チャンネルごとに管理権限でWebhookを作成し、生成されたWebhook URLの安全なトークンを保持する必要がある。トークンを公開ブラウザへ渡せば第三者が任意投稿できるため、匿名のLBT利用者へ自動配布することはできない。中央BotまたはアプリケーションWebhookも、サーバー導入・権限付与・認証情報の管理を必要とする。

この方式はリンクカードのWorker受信を回避できるが、利用者無操作・無管理・任意サーバーでの共有という要件を満たさないため、通常の共有リンクを置換しない。将来、特定の一つのDiscordサーバーに管理者導入済みの公式Botを運用するという条件に変わった場合だけ、補助機能として再検討できる。

参照: https://docs.discord.com/developers/resources/webhook
