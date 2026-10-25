# 完全無料で導入する共有URL・OGP（Workers Free + KV）

この構成は **Cloudflare Workers FreeプランとWorkers KVの無料枠のみ** を使います。R2バケットやWorkers Paidプランへの加入は不要です。すでにR2の契約を開始している場合は、利用者自身が契約・請求状況を確認してから不要なサブスクリプションを解約してください。この手順は既存の契約を自動変更しません。

## 無料枠と制限

Cloudflare公式料金表に記載されているWorkers Freeプランの主な上限は次のとおりです（仕様変更の可能性があるため、作業時に公式ページも再確認してください）。

- Workersリクエスト：100,000回／日
- KV読み取り：100,000回／日
- KV書き込み：1,000回／日
- KV保存容量：アカウント全体で1 GB

Freeプランでは、KVの各上限を超えた種類の操作はエラーになります。Workersのリクエスト上限を超えた場合もリクエストは失敗します。**意図しない請求を避けるため、CloudflareのWorkers Freeプランを維持し、Workers Paidプランへアップグレードしないでください。** 無料上限を超えるほど利用が増えた場合は、無料のまま動作が制限され、共有URLの一部が一時的に使えなくなる可能性があります。

料金・制限の公式資料：
- [Workers KVの料金](https://developers.cloudflare.com/kv/platform/pricing/)
- [Workersの上限](https://developers.cloudflare.com/workers/platform/limits/)
- [KV namespaceの作成・バインド](https://developers.cloudflare.com/kv/get-started/)

## 仕組み

- `POST /api/r2-share/v1`：既存のフロントエンドとの互換性のためにAPIパス名を維持していますが、保存先はR2ではなくWorkers KVです。共有トークンを検証し、OGP情報を含む固定HTMLを生成してKVに保存します。任意のHTMLを利用者から受け取って公開する設計ではありません。
- `GET /s/<16文字のID>`：KVからHTMLを読み込み、OGP情報を返します。通常の新規短縮URLは `/s/<16文字のID>` だけで、予備保存先IDやキャッシュ世代のクエリを付けません。OGPメタデータはKV保存HTMLに含まれ、共有トークンはGitHub Pages上のビューアーURLのフラグメントで渡すため、そのトークン自体はビューアーのHTTP要求URLには含まれません。
- 短縮URLのデータは、アクセスがなければ約30日でKVから期限切れになります。本実装では「1か月」を30日として扱います。KVの無料書き込み枠を圧迫しないよう、閲覧による期限延長は最大6時間に1回とし、キャッシュ期間も6時間に制限しています。そのため、最後のアクセスから削除までの実時間はおおむね30日〜30日6時間です。
- `GET /s?s=...` と `GET /d?s=...`：既存のRentry／Telegraph形式の共有リンクとの互換性を維持します。
- 発行時には、可能ならRentry／Telegraphの予備URLを先に作り、そのあと短縮URLを発行します。KVの書き込みに失敗した場合、サイト側は従来の共有方式へ切り替えます。予備URLは短縮URLとは別リンクとして表示されるため、必要なら一緒に保存してください。以前に発行した `?b=...` 付きURLは予備保存先IDからの復元を試みますが、これから発行する最短URLにはその情報を含めません。KVデータがアイドル期限切れした短縮URLは復元できず、そのため共有URL自体も失効します。
- Cloudflare自体に障害が起きた場合、Cloudflareの短縮URLだけでは復旧できません。共有発行画面に表示された予備URLを別途保存してください。

## 導入手順

### 1. 既存Workerのバックアップ

稼働中の `lbt-ogp` WorkerをCloudflareダッシュボードで開き、現在のソースをエクスポートまたはコピーしてバックアップします。**現行コードの経路を確認する前に、既存Workerをこのリポジトリのコードで丸ごと上書きしないでください。** リポジトリに含まれていない既存機能がある可能性があります。新コードを統合する場合は、現行の `/s`・`/d` 経路などを残してください。

### 2. ローカルにリポジトリを取得

Node.jsとGitがインストールされているPCでPowerShellを開き、次を実行します。

```powershell
git clone https://github.com/LBTStudio/LIMBUS_BUILD_TERMINAL.git
cd LIMBUS_BUILD_TERMINAL\cloudflare\ogp-worker
npx wrangler@latest login
```

### 3. KV namespaceを無料で作成

```powershell
npx wrangler@latest kv namespace create SHARES
```

コマンド出力にあるnamespace IDをコピーします。R2バケットは作成しません。

### 4. namespace IDを設定

`wrangler.toml` を開き、次の行に先ほどのIDを設定します。

```toml
[[kv_namespaces]]
binding = "SHARES"
id = "ここを実際のKV namespace IDに置き換える"
```

`REPLACE_WITH_KV_NAMESPACE_ID` のままではデプロイできません。IDはCloudflareアカウントごとに異なるので、ほかの利用者のIDをコピーしないでください。

### 5. 既存Workerと統合し、無料プランのままデプロイ

まず、既存のWorkerコードと新しい `worker.js` のルート・処理を比較し、必要な既存処理を維持するよう統合してください。続いて設定を確認します。

```powershell
npx wrangler@latest deploy --dry-run
```

問題がなく、設定が `Workers Free` のままであることを確認できた場合のみ、デプロイします。

```powershell
npx wrangler@latest deploy
```

このコマンドは既存の `lbt-ogp` Workerを更新します。**すでに動いているWorkerへの影響を確認せずに実行しないでください。** R2の作成や有料プランへの切り替えは必要ありません。

## 公開後の確認

次のURLを開きます。

[ヘルスチェック](https://lbt-ogp.lbtstudio-share.workers.dev/healthz)

成功時には `{"ok":true,"shareStore":"kv","configured":true}` 相当の応答が返ります。`shareStore` が `none` または `configured` が `false` の場合、Workerの `SHARES` バインディングとnamespace IDを確認してください。

その後、[LIMBUS BUILD TERMINAL](https://lbtstudio.github.io/LIMBUS_BUILD_TERMINAL/) から共有を新規発行し、以下を確認します。

- 新しい短縮URLが開き、共有シートが表示される
- DiscordなどでOGPタイトル・説明・画像が表示される
- 既存のRentry／Telegraph共有リンクも引き続き開く
- 発行画面に表示された予備URLからも内容を復元できる
- KVが利用できない場合、新規発行が従来方式へ切り替わる

DiscordのOGPプレビューはキャッシュされる場合があるので、確認には新規発行したURLを使ってください。

## 無料運用上の注意

- アカウントをWorkers Freeプランに維持し、Workers Paidへアップグレードしないでください。
- R2バケットを作成する必要はありません。R2に関する課金サービスを別途契約しないでください。
- KVはアカウント全体で1 GBです。各共有データには30日＋6時間の期限を付け、閲覧が続く場合は期限を最大6時間に1回延長します。最後のアクセスから約30日〜30日6時間で期限切れになります。既存の共有も、保存データが残っている間に閲覧されてTTL更新が走れば新しい期限へ延長されます。容量や日次無料枠を超えた場合は新規発行や期限更新に失敗することがありますが、期限更新失敗で閲覧そのものを止めない設計です。
- 共有が大幅に増えると、日次のWorkerリクエスト・KV読み書きの無料上限に達し、短縮URLの閲覧が一時的に失敗する可能性があります。これは請求を避ける代わりに可用性を制限する設計です。
- レート制限バインディングは場所ごとの近似的な制限です。これだけで世界全体の厳密な発行数制限にはなりません。
- Cloudflare全体が停止した場合に備え、発行画面の予備URLも保管してください。
