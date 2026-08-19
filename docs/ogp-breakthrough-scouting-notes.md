# LBT共有OGP — 技術ブレイクスルー探索・最終評価

更新日: 2026-08-19  
対象: 短い共有URL、Discord上の個別OGP、匿名の閲覧・復元  
絶対条件: **利用者登録なし、発行者の運用作業なし、支払いを発生させない、短URLから人格別カードを即時に返す**

## 結論

調査した新しいエッジ実行基盤、分散配信、静的生成、Discord連携のいずれも、現在の絶対条件をすべて維持したまま、Cloudflare Workers Freeの**日次100,000受信リクエスト上限そのもの**を解消する置換策にはならなかった。個々の共有IDに応じて異なる`og:title`・`og:description`・`og:image`を返すには、クローラー到達時に動的HTMLを返すか、発行時に認証済みの静的ファイルを生成する必要があるためである。[1] [2]

一方で、現行の設計には実装可能な改善が一つ見つかった。Workers CacheはHIT時にWorkerコードを実行しないが、`s-maxage`と`stale-while-revalidate`を同居させると、後者が無効になっていた。LBTはこの競合を解消し、**7日間のfresh応答、続く最長30日間のstale応答**を明示した。これにより、一度正常に生成された不変共有のOGP HTML・共有画像は、RentryまたはTelegraphが一時的に読めない間も継続表示できる。[2] [3]

> **重要:** Cache HITはCPU時間と外部保存先の読込を消すが、Workers Freeの受信リクエスト数からは消えない。したがって、この改善は日次枠を増やすものではなく、同時アクセス・外部保存先障害・CPU上限に対する耐性を高めるものである。[1]

## 3専門観点の検討

| 観点 | 専門家としての検討 | 結論 |
| --- | --- | --- |
| エッジ配信設計 | 同じ不変共有IDへの集中アクセスは、キャッシュをWorker実行前に確認し、上位・下位の二層キャッシュとリクエスト集約で吸収できる。個別OGPを無制限に静的化するには共有発行時の安全な公開書込が必要となる。 | 現行の無状態Worker + 不変URL + Edge Cacheが、匿名即時発行に最も適合する。 |
| 分散システム・可用性 | Rentry/Telegraphの二重保存は単一保存先障害を吸収する。さらに、成功済み応答をfresh期間後も一時的に返せれば、保存先の短時間障害を閲覧者に露出しない。IPFS/Blossomの内容アドレスは整合性に強いが、Discordがその探索規約を実装しない。 | 二重保存とstale応答は採択。分散プロトコルは将来のバックアップ候補に留める。 |
| プラットフォーム・規約 | 無料枠はすべて上限・停止・規約変更の可能性を持つ。別の無料実行基盤へコピーしても、アカウント作成・デプロイ・監視の対象を増やし、どれかの上限で停止する。Discord Webhook/Botは管理権限と秘密トークンを必要とする。 | 「完全無管理・無制限」を約束できる外部サービスはない。管理対象を増やさず、既存基盤の障害耐性を高める。 |

## Workers Cacheの確認済み改善

現行Workerでは、`cache_options.enabled: true`を指定したCloudflare Version Upload APIによる本番バージョンを配備した。実URLへ連続GETを行い、**1回目の`CF-Cache-Status: MISS`、2回目の`CF-Cache-Status: HIT`**を確認済みである。つまり二度目以降は、OGPゲートウェイのJavaScript、Rentry、Telegraphを実行・読込せずにエッジから応答する。[2] [3]

| 項目 | 修正前 | 修正後 |
| --- | --- | --- |
| fresh期間 | 7日 | 7日 |
| stale-while-revalidate | ヘッダーにはあったが` s-maxage`との競合で無効 | 30日間有効 |
| stale-if-error | 未指定で明示的な耐性なし | 30日間有効 |
| Cache HITのCPU・外部取得 | 抑制可能 | 抑制可能（実測HIT確認済み） |
| Cache HITの日次受信枠 | 計上される | 計上される（変更なし） |

共有IDは発行後に変化しない。この性質により、古いカードを返しても別人格に化けることはなく、キャッシュの長期利用は共有データの性質と整合する。ただしキャッシュ初回生成前、または同一カードへの日次合計到達数が100,000件を越える場合は、Free上限の対象である。[1]

## 新規・再評価した候補

| 候補 | 得られるもの | 絶対条件に対する問題 | 判定 |
| --- | --- | --- | --- |
| Vercel Hobby | 月100万Edge Requests・100万Function invocations、CDN/SWRを提供する。[4] | Hobbyは個人・非商用向けで、所有者側の別アカウント・デプロイを要する。上限到達時は停止であり、既存URLの無操作フェイルオーバーにはならない。 | 不採択 |
| Deno Deploy Free | 月100万リクエスト、20GB egress、HTTP Edge Cacheを提供する。[5] | 別アカウント・別デプロイ・別の月次上限を増やすだけで、短URL入口からの自動冗長化にならない。 | 不採択 |
| Supabase Edge Functions | 月50万invocationsを含む。[6] | Freeプロジェクトは1週間の非活動で停止し、HTML応答はカスタムドメインが必要である。[6] [7] 追加の有料要素または無管理条件に反する。 | 不採択 |
| Val.town HTTP Val | HTTPでHTMLを返せ、Freeは1日10万run・public valを提供する。[8] [9] [10] | 所有者アカウントと公開コードを要し、Cloudflareと同程度の上限を別途持つ。入口のWorkerを残す限り日次受信枠を減らせない。 | 不採択 |
| IPFS / Nostr Blossom | 内容ハッシュによる不変URL・複数配信先という発想は有望。[11] [12] | 匿名発行者の確実なpinning、Web Gatewayの可用性、Discordによる独自探索を保証しない。 | 将来調査 |
| Discord Webhook / Bot | リンクOGPではなく埋め込み投稿を直接行える。[13] | サーバー管理権限、Webhook秘密URLまたはBotトークンの保護が必要で、任意サーバー・匿名利用を満たさない。 | 不採択 |
| GitHub Pages個別静的生成 | 静的アセットなら動的実行を不要にできる。[14] | 匿名の利用者へリポジトリ書込権限を渡せず、生成・配備待ちも即時共有と両立しない。 | 不採択 |

## 今後の判断基準

将来の採択候補は、少なくとも「匿名のブラウザから共有を発行できる」「Discordが通常のHTTPS URLから個別OGPを取得できる」「共有ごとの配備・承認・所有者操作がない」「無料枠を超えても請求ではなく安全に停止または静的共有へ移れる」を同時に証明する必要がある。この四条件を満たす新技術が現れるまでは、現行の**Rentry/Telegraph二重保存、Cloudflare Worker、実測済みWorkers Cache、静的GitHub Pagesビューア**を維持することが、持続性と運用負担の両面で最も合理的である。

## 参照

[1]: https://developers.cloudflare.com/workers/platform/pricing/ "Cloudflare Workers Pricing"
[2]: https://developers.cloudflare.com/workers/cache/ "Cloudflare Workers Cache"
[3]: https://developers.cloudflare.com/workers/cache/configuration/ "Cloudflare Workers Cache Configuration"
[4]: https://vercel.com/pricing "Vercel Pricing"
[5]: https://deno.com/deploy/pricing "Deno Deploy Pricing"
[6]: https://supabase.com/pricing "Supabase Pricing"
[7]: https://supabase.com/docs/guides/functions/limits "Supabase Edge Functions Limits"
[8]: https://www.val.town/pricing "Val.town Pricing"
[9]: https://www.val.town/limits "Val.town Limits"
[10]: https://docs.val.town/vals/http.md "Val.town HTTP Vals"
[11]: https://docs.ipfs.tech/concepts/content-addressing/ "IPFS Content Addressing"
[12]: https://nips.nostr.com/b7 "NIP-B7 Blossom"
[13]: https://docs.discord.com/developers/resources/webhook "Discord Webhook Resource"
[14]: https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages "GitHub Pages"
