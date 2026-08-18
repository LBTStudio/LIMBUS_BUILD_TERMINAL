# Cloudflare Workers Free: 多人数共有の設計メモ

調査日: 2026-08-18

## 公式仕様

Cloudflare Workers Freeは、アカウント単位で1日100,000受信リクエスト、1回あたりCPU 10ms、外部サブリクエスト50件である。日次上限超過時はError 1027を返す。待機中の外部`fetch()`はCPU時間へ算入されない。

- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/workers/platform/pricing/

Workers Cacheは、`Cache-Control`を返すGET/HEADレスポンスをWorker実行前にエッジで返せる。階層化キャッシュとリクエスト集約により、同一URLへの集中アクセス時はWorker起動と外部保存先読込を抑制できる。共有IDは不変であり、成功した`/s` OGP HTMLと`/i`共有画像は長期キャッシュに適する。

Workers CacheのヒットもWorkerへの受信リクエストとして日次枠には計上される。そのため100,000件の受信上限を無限化するものではないが、CPU実行・Rentry/Telegraph読込・同時アクセスによる負荷を自動で抑え、通常規模での可用性を高める。LBTは7日間のfresh cacheと30日間のstale-while-revalidateを設定し、更新をまたいでも同一共有を再利用する設定を有効化する。

- https://developers.cloudflare.com/workers/cache/
- https://developers.cloudflare.com/workers/runtime-apis/cache/
- https://developers.cloudflare.com/workers/reference/how-the-cache-works/

## 現行LBTでの前提

共有発行はRentry/Telegraphへ直接保存し、Cloudflare Workerは短縮共有URLのOGP (`/s`)、共有画像 (`/i`)、外部保存直読失敗時の復元 (`/d`) に使う。したがって上限の主因は発行回数ではなく、Discord再プレビューと閲覧の総到達回数である。

利用者に別URLの手動選択を求めず、成功済みの不変共有をキャッシュして平常時のWorker実行を減らし、未キャッシュ・障害時は既存の主/予備保存先自動切替へ委ねる。
