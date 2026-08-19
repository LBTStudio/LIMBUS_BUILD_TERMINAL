# 個別OGPカードを維持するWorker受信最適化ノート

更新日: 2026-08-19

## 固定カードへの退避は採用しない

Open GraphはHTMLの`head`にある`og:title`、`og:type`、`og:url`、`og:image`を読んでカードを構成する。LBTの`share.html`は固定のタイトル・説明・画像を持つため、Workerを経由せず画像付きカードを返せる。しかし固定HTMLの`head`は共有ごとの人格名・HP・SAN・同期・個別画像を返せない。現行の個別OGPカードを保持する条件と両立しないため、静的共有ページを通常のOGP入口へ替える案は不採択とする。

出典: https://ogp.me/

## Cloudflareの数え方

Workers Freeは日次100,000件のWorker受信上限を持ち、Workers CacheのHITもリクエストとして計上される。HITはCPUと外部保存先読込を抑えるが、受信枠を拡張しない。Workerに入らない静的アセットだけはFreeで無制限である。

出典:

- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/

## 個別カードを維持した場合の削減可能な範囲

個別の人格名・HP・SAN・同期・画像をカードに出すには、クローラーがその共有IDに対応するHTMLの`head`を取得しなければならない。現行の`/s?s=…`はまさにこのHTMLを返すため、**個別カードを維持する限り、少なくともカードHTML 1到達/共有URL/Discordプレビューは残る**。HTMLを静的共有ページに変えるとWorker到達は消えるが、カードが共有ごとに変化しなくなる。

共有画像を利用しない場合、`og:image`はGitHub Pagesの固定画像を指すため、カードHTML以外のWorker到達は生じない。共有画像を指定する場合だけ、現在は`/i?s=…`への画像取得が追加される。画像を匿名で確実に書き込み・恒久公開でき、個別HTMLへの無操作転送も両立する公式な無料静的配信先は確認できなかった。Rentryは共有タイトル・説明・画像URLを個別に設定できるが、画像自体は外部の直URLを要し、公式メタデータ仕様に無操作のLBT共有ページ転送設定はない。

出典:

- https://rentry.co/metadata-how
- https://rentry.co/what

## 採択: 再配備によるキャッシュ再加熱の除去

Workers Cacheは標準ではWorkerバージョンをキャッシュキーに含めるため、実装更新のたびに既存カードがMISSから再加熱される。共有カードは発行後に不変であるため、LBTは`cache_options.cross_version_cache: true`を有効化した。これにより、カード内容を変えないWorker更新後も7日間のfresh cacheと最長30日間のstale応答を再利用できる。

カード内容を意図的に更新する必要がある場合だけ、共有URLに付与する`cv=1`を更新する。`cv`は共有IDを区別する`s`を保持したまま、全既存カードを即時に新しいキャッシュ世代へ分離する。2026-08-19に、`cross_version_cache: true`を持つ無状態・bindingsなしの本番Workerを配備し、`cv=1`付きの実個別OGP URLで`MISS → HIT`を確認した。

この改善は日次100,000受信枠の単位を変えないが、定期保守や不具合修正が多数の個別カードを同時MISSへ戻す事態を避ける。個別カードの表示内容、共有画像の取り扱い、利用者の操作は変更しない。

出典:

- https://developers.cloudflare.com/workers/cache/cache-keys/
- https://developers.cloudflare.com/workers/cache/configuration/

## 不採択: Freeでの追跡クエリ除外

Cloudflareの標準Cache Keyはパスとクエリ文字列を含み、クエリ順も区別する。`utm`等だけを除外して`s`だけを残せれば、追跡付きリンクのキャッシュ分断を防げる。しかし公式のCache Key仕様では、Freeで使えるのは「全クエリを無視」だけであり、個別のquery parameterをinclude/excludeする設定はEnterprise限定である。全クエリを無視すると別共有のカードが混ざるため、LBTでは採用しない。

出典: https://developers.cloudflare.com/cache/how-to/cache-keys/

## GitHub Pagesへ共有ごとの個別HTMLを置く案

GitHub Pagesはリポジトリ由来の静的HTML・CSS・JavaScriptを公開する。個別OGPを静的HTML化できればWorker受信をゼロにできるが、匿名のブラウザ利用者にリポジトリ書込権限を渡せない。現在のGitHub Pagesには月100GBのsoft帯域上限と、レート制限が適用され得る。共有ごとの配備を伴う匿名即時発行基盤にはならない。

出典:

- https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages
- https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits

## 次に検証する方向

個別カードの品質を維持しつつ日次受信枠そのものを超えるには、共有発行時に個別OGP HTML・画像を無認証で静的配信可能な場所へ事前配置する必要がある。画像だけを外部静的ホストへ置いても、個別`og:title`・`og:description`を返すHTML入口がWorkerなら受信枠は減らない。現時点では、個別HTMLと画像の両方を同じ無償・無管理の静的配信へ公開し、発行時だけ最小回数の動的処理を行える候補は未確認である。
