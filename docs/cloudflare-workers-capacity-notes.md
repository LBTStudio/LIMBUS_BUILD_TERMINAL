# Cloudflare Workers Free: 多人数共有の設計メモ

調査日: 2026-08-18

## 公式仕様

Cloudflare Workers Freeは、アカウント単位で1日100,000受信リクエスト、1回あたりCPU 10ms、外部サブリクエスト50件である。日次上限超過時はError 1027を返す。待機中の外部`fetch()`はCPU時間へ算入されない。

- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/workers/platform/pricing/

Workers Cacheは、`Cache-Control`を返すGET/HEADレスポンスをWorker実行前にエッジで返せる。階層化キャッシュとリクエスト集約により、同一URLへの集中アクセス時はWorker起動と外部保存先読込を抑制できる。共有IDは不変であり、成功した`/s` OGP HTMLと`/i`共有画像は長期キャッシュに適する。

Workers CacheのヒットもWorkerへの受信リクエストとして日次枠には計上される。そのため100,000件の受信上限を無限化するものではないが、CPU実行・Rentry/Telegraph読込・同時アクセスによる負荷を自動で抑え、通常規模での可用性を高める。LBTは7日間のfresh cacheと30日間のstale-while-revalidateを設定する。Worker更新後のOGPメタデータが古いまま残らないよう、キャッシュはWorkerバージョン単位で分離する。

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

2026-08-18の検証では、Workers Scripts APIによるモジュール再アップロードが既存の`cache_options`を初期化することを確認した。したがって、Workerソースを更新する配備では、アップロード直後にSettings APIで`cache_options: { enabled: true, cross_version_cache: false }`を再適用し、GET設定応答に`enabled: true`が含まれることを確認する。最後に、同一OGP URLを2回取得し、1回目の`CF-Cache-Status: MISS`、2回目の`HIT`を確認する。

この手順により、初回のOGP HTML・画像生成だけがWorkerを実行し、同一共有への後続取得はWorkerコード・Rentry・Telegraphを実行せずキャッシュから返る。キャッシュヒットも日次受信枠には計上されるため、配備検証では「受信枠の削減」ではなく「CPU・外部取得・同時障害の削減」として評価する。
