# 配備確認記録

2026-08-18にCloudflare API経由で`lbt-ogp`を配備し、WorkersのScripts APIは`200`、`usage_model: standard`、保存サービスのbindingなしを返しました。`workers.dev`公開設定も`enabled: true`、Preview URLは`false`で設定済みです。

公開URLはCloudflare APIで確認してから確定します。現在の公開先は中立名の`https://lbt-ogp.lbtstudio-share.workers.dev`です。旧サブドメインはCloudflareのアカウント設定で停止し、以後の共有リンク・GitHub Pages設定・回帰テストでは使用しません。

`/health`は`200`と`LBT OGP gateway: free/stateless`を返します。既存の`LBT-Share-08-18-5`では`/s`が個別の人格名・MAX・画像用`/i` URLを含むOGP HTMLを返し、`/i`は`200 image/webp`、28,052 bytesを返しました。

GitHub反映前のローカルLBT v64r111デスクトップ画面も確認済みです。上部ナビゲーション、アイテム一覧、JSONプレビュー、プレビュー格納タブは描画され、今回のOGP設定追加による画面レイアウトの崩れは確認されませんでした。

実在する共有URL`/s?s=t:LBT-Share-08-18-5`をブラウザで開き、OGP入口から`share.html?s=t%3ALBT-Share-08-18-5`へ遷移後、`【人格】東部親指カポIIII [MAX]｜LBT`として実データを復元・表示できることを確認しました。

同一の既存共有は公式人格の差分参照形式だったため、OGP生成時のみ固定の公式DBから表示情報を補完する処理を追加しました。更新後の公開`/s`応答は`東部親指カポIIII — LIMBUS BUILD TERMINAL`、`HP 166 · SAN 50 · MAX`を返すことを確認済みです。

## Cache 設定の source of truth（2026-10-02 追記）

Workers Cache の設定は `wrangler.toml` の `[cache]` に集約した。設定ブロック写在文件里、スクリプトと配備定義の乖離が起きなくなる：

```toml
[cache]
enabled = true
cross_version_cache = true
```

### なぜファイルに書くのか

Workers の **Scripts API（モジュール再アップロード）**では、既存の `cache_options` が初期化される。スクリプトを単純に再アップロードすると、キャッシュが飛んで Worker 毎回実行する状態に戻り、MISS のコスト（2秒のレイテンシ と外部保存先の読み込み）が復活する。

この回避策として、設定をファイルに集約した。ファイルを見れば現在の cache 状態が分かり、想定外の cache 不整合の配備が起きたときに検出できる。

### Cache-Control ヘッダとの対応

`worker.mjs` の Cache-Control 定数と一对になる：

| 定数 | 値 | 用途 |
|---|---|---|
| `CACHE_CONTROL` | `max-age=604800, stale-while-revalidate=2592000, stale-if-error=2592000` | `/s` と `/i`。共享IDは不変なので 7 日 fresh |
| `TOKEN_CACHE_CONTROL` | `max-age=86400, ...` | `/d` の token。障害時 fallback 用なので 1 日に留める |
| `FALLBACK_CACHE_CONTROL` | `max-age=30, stale-if-error=300` | 外部保存先の障害時の negative cache |

### カード形式を変更するとき

キャッシュを残したまま刷新したい場合（OGP カードのレイアウトを変えた等）は、共有URLの `cv` 世代を `OGP_CARD_CACHE_VERSION` で上げる（現在は `"2"`）。新一代の URL が新しいキャッシュを作るため、旧世代は自然に失効する。

### 検証手順

配備後、同じ OGP URL を 2 回取得して 1 回目の `CF-Cache-Status: MISS` と 2 回目の `HIT` を確認する。

Cache HIT は Workers への受信リクエストとして日次枠に計上されるが、Worker 実行と外部保存先への読み込みは起きない。日次枠を減らす仕組みではなく、CPU と外部依存を減らす仕組みである。
