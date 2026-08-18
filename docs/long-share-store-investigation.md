# 1万文字級共有データの短縮IDストア調査

調査日: 2026-08-17

## 要件とURL単独方式の限界

Discord本文は2,000文字を超えるとURLとして扱われず、ファイル化される。公式データ参照とdeflate圧縮により、現行DBの最大構成は1,563文字まで短縮できた。しかし、任意のオリジナル人格・アイテムが1万文字へ達し得るため、URL単独・外部保存なし・情報完全保持を同時に満たしながら常に2,000文字未満にすることは保証できない。

そのため、長文時はデータ本体を共有ストアへ保存し、Discordへは短いIDだけを含むGitHub Pages URLを送る方式が必要である。

## 匿名ペースト候補の実測

| 候補 | 投稿API | 保存期間 | GitHub PagesからのCORS | 判定 |
| --- | --- | --- | --- | --- |
| [paste.rs](https://paste.rs/) | 匿名POSTでURLを返す | 公式ページに明示なし | `OPTIONS`は404、GET応答に`Access-Control-Allow-Origin`なし | 不採用 |
| [dpaste](https://docs.dpaste.org/api/) | 匿名POST、`never`/1か月等の期限指定 | API文書に明記 | `OPTIONS`は405、実投稿もこの環境で応答不能 | 不採用 |
| 0x0.st | 匿名アップロード | サイズ依存で時限 | 既存検証でアップロード停止 | 不採用 |
| Cloudflare Worker + KV/R2 | 自前のPOST/GET API | 運用設計で制御 | Worker側でGitHub Pagesだけを許可できる | 有力候補 |

## 暫定結論

第三者の無認証ペーストサービスは、CORS・保存期間・レート制限・運営変更を安定的に満たせない。長文完全保持を目的にするなら、短い共有IDを生成する専用API（Cloudflare Worker + KV/R2または管理された同等サービス）を使う。APIは本文サイズ上限、TTL、レート制限、CORS許可元、削除・失効を明示的に実装する。

### Cloudflare Worker + KVの適合性

Cloudflare Workers KVはWorker内から`put()`/`get()`で読み書きでき、値は最大25 MiB、TTLは60秒以上で自動削除できる。共有データを1万文字級のJSONとして保存するサイズには十分である。WorkerはCORSの`OPTIONS`、POST、GETを明示的に実装できるため、`https://lbtstudio.github.io`だけを許可したAPIにできる。

KVは地域間の反映に最大60秒程度の遅延が起こり得るため、発行直後のリンクは発行した地域では直ちに読める一方、別地域の受信者向けには一時的な再試行表示を実装する。ID衝突は暗号学的乱数で避け、上書きは許可しない。

## 参照

- paste.rs 公式API: https://paste.rs/
- dpaste API: https://docs.dpaste.org/api/
- Cloudflare Workers KV `put()`: https://developers.cloudflare.com/kv/api/write-key-value-pairs/
- Cloudflare Workers CORS例: https://developers.cloudflare.com/workers/examples/cors-header-proxy/

## 多数利用向けのR2再評価

### 無料枠

Cloudflare R2のStandardストレージは、月あたり10 GB-month、書き込み系のClass A操作100万回、読み出し系のClass B操作1,000万回、インターネット向け転送量は無料枠に含まれる。1万文字級の共有HTMLを1件10 KBと仮定すれば、10 GBの範囲は約100万件分に相当する。1日あたり100件の発行を3日保持する設計なら、保存量は約3 MBであり、無料保存枠より大幅に小さい。

### 保持期間と公開

R2はオブジェクト単位でHTMLまたはJSONを保存でき、Workerから保存・取得できる。ライフサイクル規則により、1日・3日・30日等の経過後に自動削除できる。ただし削除は通常24時間以内に実行されるため、「ちょうど24時間」の保証ではない。公開用の`r2.dev` URLは非本番かつレート制限対象であり、多数利用では使わない。共有HTMLの配信はWorkerがR2から読み出して返し、共有発行APIと同じWorkerにCORS・レート制限・サイズ制限を実装する。

### 前回のKV案との比較

| 項目 | Workers KV 無料 | Workers + R2 無料 |
| --- | --- | --- |
| 共有発行 | 1,000件/日 | R2書込み100万件/月 |
| 共有閲覧 | 100,000件/日 | R2読み出し1,000万件/月 |
| 保存容量 | 1 GB | 10 GB-month/月 |
| 1件の最大値 | 25 MiB | HTML/JSON用途に十分なオブジェクト保存 |
| 自動削除 | TTL | バケットライフサイクル（削除は通常24時間以内） |
| 多数利用との適合 | 中規模 | より適する |

R2をWorker経由で利用する場合もWorker自身の無料枠は100,000リクエスト/日、CPU時間は1リクエスト10 msである。発行と閲覧の合計がこの日次上限を超えると、無料のままではサービスが応答不能になる。したがって、無料・管理最小を優先する初期実装には適するが、恒久的な無制限無料サービスを保証するものではない。

## 請求ゼロ条件におけるD1候補

Cloudflare D1はWorkers Freeで、読み出し500万行/日、書き込み10万行/日、合計保存容量5 GB、1データベースあたり500 MBを無料で利用できる。1共有を1行のHTMLまたはJSONとして保存し、ID列にインデックスを置くなら、発行1件はおおむね1〜2行書込み、閲覧1件は1行読込みとなる。1万文字級の共有データは、D1の1行あたり2 MB上限を十分下回る。

重要なのは、Workers FreeでD1の日次読込・書込・保存上限へ達した場合、Cloudflareは有料請求を発生させず、D1 APIがエラーを返して追加の保存または閲覧を停止すると公式FAQが明記している点である。Workers Paidへ手動でアップグレードしない限り、D1超過分が従量課金される構成ではない。このため、請求ゼロ絶対条件ではR2よりD1の方が適合する可能性が高い。

ただしD1を利用するWorker自身のFree上限は100,000リクエスト/日である。上限到達時は共有サービスを翌UTC日まで停止する。支払いリスクは抑えられる一方、無制限利用を保証するものではない。

### D1による共有方式案

1. 発行時にLBTが整形済みHTMLと最小のメタデータをWorkerへPOSTする。
2. Workerが暗号学的乱数IDを生成し、D1の`shares`テーブルへ1行として保存する。
3. Discordへは`https://<worker>.workers.dev/s/<ID>`の短いURLだけを渡す。
4. GETではWorkerがD1からHTMLを取得してそのまま返すため、Discordクローラーは人格名を含むOGPを取得できる。
5. 1日・3日・30日の共有は、期限時刻を保存してGET時に失効扱いにする。恒久共有は期限をNULLにするが、保存容量上限へ達した場合は新規発行を停止する。

### 参照

- D1料金・Free超過時の挙動: https://developers.cloudflare.com/d1/platform/pricing/
- D1制限: https://developers.cloudflare.com/d1/platform/limits/
- D1 FAQ: https://developers.cloudflare.com/d1/reference/faq/

## 無料D1共有APIの悪用抑止

公開共有APIへ誰でもHTMLを保存できるようにすると、匿名の大量発行によって無料上限を枯渇させるリスクがある。共有発行フォームにはCloudflare Turnstileを導入し、Worker側でトークンを検証してからD1への書込みを許可する。TurnstileのFreeプランは20ウィジェットまで、チャレンジ・検証リクエストは無制限である。秘密鍵はWorkerのシークレットとして保存し、GitHub Pages側へ公開しない。

Turnstileだけでは利用量上限を保証しないため、Workerには発行データ2 MB未満、発行頻度、期限選択、IP単位の軽量なスロットルを併用する。D1/Workers Freeの上限へ達した場合は課金へ移行せず、エラーと翌UTC日以降の再試行を返す構成にする。

- Turnstile Free: https://developers.cloudflare.com/turnstile/plans/
- Turnstileサーバー側検証: https://developers.cloudflare.com/turnstile/get-started/

## 請求ゼロ候補の比較

### Firebase Spark

Firebase Sparkプランは支払い情報なしで開始できる。Cloud Firestore等の有料枠対象機能が無料クォータを超えると、当該製品はその月の残り期間停止し、Blazeプランへ明示的にアップグレードしない限り従量課金は行われない。これは請求ゼロという条件には適合する。

しかし、サーバー側でHTMLを整形してDiscord向けOGPを返すCloud FunctionsはBlaze（課金アカウント）を必要とする。このため、Firestore/Storageの直接公開だけでは安全な匿名発行、短縮ID、動的OGPを揃えにくく、LBTの要件には不適合と判断する。

### Supabase Free

Supabase Freeは500 MBデータベース、1 GBストレージ、5 GB転送を提供するが、無料プロジェクトは1週間の無活動後に停止し得る。料金ページはFreeプランの枠内利用を提示する一方、用途として恒久的な共有URLの確実な提供には、休止とプラン変更のリスクがある。請求ゼロの候補には残るが、恒久性・低管理負担の要件ではD1より劣後する。

### 暫定順位

| 方式 | 支払い情報なし | 上限時の請求 | 長文保存 | Discord OGP | 恒久性 | 判定 |
| --- | --- | --- | --- | --- | --- | --- |
| GitHub Pages URL内共有 | はい | なし | URLに収まる範囲のみ | 静的 | リポジトリ継続中 | 短文用 |
| Cloudflare Workers Free + D1 Free | 要初回確認 | Free上限到達時は停止 | 最大2 MB/共有 | Workerで対応可 | 保存5 GB内 | **有力** |
| Firebase Spark | はい | 月内停止 | 可能 | 動的OGPが困難 | 設定次第 | 条件付き |
| Supabase Free | はい | Free枠ではなし | 可能 | Edge Function設計が必要 | 7日無活動で休止 | 劣後 |
| Cloudflare R2 / Workers Paid | 要支払い設定の可能性 | 従量課金あり | 可能 | 対応可 | 可能 | 除外 |

- Firebase Spark: https://firebase.google.com/docs/projects/billing/firebase-pricing-plans
- Supabase Pricing: https://supabase.com/pricing
- Supabase Billing: https://supabase.com/docs/guides/platform/billing-on-supabase

## 利用者所有ストレージ: GitHub Gist

各発行者が自分のGitHubアカウントに非公開（unlisted）Gistとして共有HTMLを作成すれば、中央のLBT共有ストアを持たずに長文データを保存できる。Gistの作成にはGitHubへのログインと`gist`権限のOAuthトークンが必要であり、閲覧者は共有されたGist URLを開くだけでよい。GitHub REST APIは1ファイルにつき1 MBまで本文を応答に含め、1万文字級のHTMLには十分である。

この方式は支払いアカウントを必要とせず、共有データの保存責任とサービス上の利用制限が各発行者のGitHubアカウントに分散する。中央のCloudflareやR2への請求リスクはない。一方で、発行者は初回にGitHubログイン・LBT OAuth承認を行う必要があり、Gistを削除すればリンクも失効する。GitHubが提供するGistの用途・レート制限・可用性に依存し、LBTが完全に無管理で永続性を保証する方式ではない。

ブラウザ単体のLBTで安全に実装するには、GitHub OAuth AppまたはGitHub Appを登録し、最小の`gist`権限だけを要求する。OAuthトークンは第三者へ送信せず、発行した本人のブラウザ内に限定保存する。GitHub公式はOAuth Appより、細粒度権限と短命トークンを扱えるGitHub Appを推奨している。ただし、OAuthアプリまたはGitHub Appの登録・セキュリティ維持はLBT側で必要になる。

- GitHub Gist REST API: https://docs.github.com/en/rest/gists/gists
- GitHub OAuth認可: https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps
- GitHub OAuthベストプラクティス: https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/best-practices-for-creating-an-oauth-app

## 目的起点レビュー: 配信基盤設計者の初期仮説

目的は、長文の共有HTMLを短いリンクで配信することであり、URLへデータ本体を押し込むことではない。このため、共有先の選定は「HTMLを置ける匿名ホスト」を探す作業ではなく、保存責任、到達性、URLの安定性、APIからの自動発行、Discordクローラー応答をどう分離するかの設計問題として扱う。

検討対象は次の五類型である。

| 類型 | 代表手段 | URL長 | 利用者制約 | 継続性 | 現時点の評価 |
| --- | --- | --- | --- | --- | --- |
| URL内データ | GitHub Pages + fragment | データ量依存 | なし | GitHub Pages依存 | 短文専用 |
| 中央共有API | Workers + D1 Free | 短いID | なし | Free上限内 | 強い候補、運営者初期設定が必要 |
| 公開プレビュー基盤 | Netlify Drop等 | 短いURL | なし | サービス規約・保持期間依存 | 実測必須 |
| 利用者所有ストレージ | GitHub Gist等 | 短いURL | 発行者ログインが必要 | 所有者が管理 | 利用者無制約に反する |
| 内容アドレス型ネットワーク | IPFS・Nostr等 | 中程度のID | 一見なし | ピン・Relay保持に依存 | 永続性を保証できず、Discord応答も不安定 |

IPFSはコンテンツアドレスの可搬性に優れる一方、CIDの取得だけでは内容の永続保持を保証しない。NostrもRelayごとに保持方針が異なる。よって「利用者無制約・1〜3日以上の確実な閲覧」を満たすには、公開アップロード先が保持を明示するか、中央APIが明示的な期限を持つ必要がある。

- IPFS: https://ipfs.tech/
- Nostr NIP-11: https://nips.nostr.com/11

## 目的起点レビュー: 共有体験・安全性設計者の初期仮説

匿名文書公開サービスは「短いURLを返す」だけでは不十分である。LBTのシートには、既存のHTML/CSS、ステータス表、コマンド、文字列記号を失わず表示すること、Discordクローラーに安定したOGPを返すこと、最低1〜3日で消えないことが必要になる。

Rentryは匿名のAPI作成、ランダムURL、編集コード、共有タイトル・説明・画像のメタデータを提供する。匿名作成はIPごとにおよそ毎分10回で制限される。一方で入力はMarkdownとRentry独自メタデータであり、LBTの自己完結HTML/CSSをそのまま実行・表示するサービスではない。よって、テキスト版シートを安全に共有する補助候補にはなり得るが、完全なHTMLプレビューの本命にはならない。

PrivateBinは暗号化テキストを匿名で共有でき、期限とMarkdownプレビューを持つ。しかし、URLのfragmentに復号鍵を持ち、一般公開のインスタンスごとに可用性・期限設定・CORSが異なる。Discordクローラーはfragmentを送信できないため、暗号化ページから共有HTMLの動的OGPを作れない。利用者無制約のDiscord共有には不適合である。

| 手段 | 自動匿名発行 | HTML完全表示 | Discord動的OGP | 1〜3日保持 | 結論 |
| --- | --- | --- | --- | --- | --- |
| Rentry | 可能（IPレート制限） | 不可（Markdown変換） | メタデータは可能 | 明示保証未確認 | テキスト代替のみ |
| PrivateBin | インスタンス依存 | 不可（暗号化ペースト） | 不可 | インスタンス依存 | 不採用 |
| 専用中央API | 実装可能 | 可能 | 可能 | TTLで制御可能 | 目的適合 |

- Rentry: https://rentry.co/
- Rentry API: https://github.com/radude/rentry
- PrivateBin: https://privatebin.info/

## 目的起点レビュー: 情報符号化設計者の初期仮説

情報をURL内へ入れることと、Discordへ長いURLを投稿することは別問題である。共有URLの内容を保持したまま、URL短縮サービスを「参照表」として使えば、長文の自己完結共有URLを20文字前後の短いリンクへ変換できる。共有HTML本体を新たに保存する必要はなく、受信者は短縮サービスの301リダイレクト後に、従来のGitHub Pages共有URLを開いてローカル復元する。

is.gdは、ブラウザからHTTPS GETまたはPOSTで匿名作成できるAPIを提供する。URLパラメータを適切に`encodeURIComponent`で符号化すれば、`#`、`;`、`+`、`&`を含むURLを扱える。短縮URLは通常19文字で、永続的な301リダイレクトを行う。反面、遷移先URLは5,000文字までという明示上限があり、1万文字級データを圧縮後も5,000文字を超える場合には使えない。また規約違反やサービス判断によりURLが無効化され得る。

TinyURLの旧匿名作成エンドポイントは12,000文字の遷移先を短縮できたが、実ブラウザでは`/preview/deprecated/`という中間プレビューへ遷移した。この挙動ではDiscordクローラーがLBTのOGPではなく短縮サービスのプレビューを拾うおそれがあり、本命ではなく補助候補とする。

| 方式 | 情報損失 | 生成URL | 直接リダイレクト | 大きな制約 | 評価 |
| --- | --- | --- | --- | --- | --- |
| GitHub Pages自己完結URL | なし | データ量依存 | あり | Discord 2,000文字 | 基盤 |
| is.gd | なし | 約19文字 | 301 | 遷移先5,000文字、レート・規約 | **有力な短縮層** |
| TinyURL旧匿名API | なし | 短い | 中間プレビュー | OGPの引継ぎ不確実 | 補助のみ |

- is.gd API: https://is.gd/apishorteningreference.php
- is.gd FAQ: https://is.gd/faq.php
- is.gd Terms: https://is.gd/terms.php

## 新規発行停止を避ける分散イベント網: Nostr / Blossom

Nostrの通常イベントは任意文字列の`content`を持ち、複数のRelayへ同一署名イベントを公開できる。NIP-01上、通常イベントはRelayで保存されることが期待されるが、Relayは接続・発行・保存を拒否、レート制限、削除できる。従って中央LBTの無料枠を消費せず複数Relayへ分散できる一方、1〜3日の保持を無条件に保証するものではない。

NIP-65はRelay一覧を少数（読込・書込それぞれ2〜4程度）へ保つよう推奨しており、複数Relayへの公開・取得を想定している。LBTなら発行ごとに一時的な鍵ペアを生成し、構造化状態を通常イベントへ保存、Relay URL群とイベントIDを共有URLに含め、GitHub Pagesの共有ビューアがWebSocket経由で取得・完全復元する設計が可能である。これにより、中央の保存枠・発行枠は不要になる。

BlossomはSHA-256でアドレス指定されたBlobを複数サーバーへ置く標準であり、同じハッシュを別サーバーから取得するフォールバックを定義する。ただし各Blossomサーバーの匿名アップロード方針、サイズ制限、保持期間は標準で保証されない。Nostrイベントに小さなJSONを入れ、Blossomは将来の大きな添付を補助する位置付けが安全である。

| 特性 | Nostr Relayイベント | Blossom Blob | Cloudflare D1 Free |
| --- | --- | --- | --- |
| LBT中央無料枠 | 消費しない | 消費しない | 消費する |
| 複数先複製 | 可能 | 可能 | 通常は単一 |
| 利用者ログイン | 不要（発行時鍵生成） | サーバー方針に依存 | 不要 |
| 1〜3日保持保証 | Relayごとに異なる | サーバーごとに異なる | 実装上指定可能 |
| Discord動的OGP | 静的ビューアカードに限定 | 静的ビューアカードに限定 | 可能 |
| 新規発行停止耐性 | 高いがRelay同時拒否はあり得る | 高いがアップロード先次第 | Free上限で停止 |

- NIP-01: https://nips.nostr.com/1
- NIP-65: https://nips.nostr.com/65
- NIP-B7 Blossom: https://nips.nostr.com/b7

RelayごとのNIP-11情報文書には、`max_message_length`、`max_content_length`、認証・支払い・制限付き書込み、最小PoW難易度などが明示され得る。従ってLBTがNostrを採用する場合、発行前に各Relayの制限を取得し、共有状態を小さな断片へ分割するか、十分な許容長を持つRelayだけへ送る必要がある。これは1万文字級のJSONを常に単一イベントで発行できることを保証しない。

NIP-13のPoWは公開Relayに対するスパム抑止として利用できる。ブラウザがNonceを探索し、RelayはイベントIDの先頭ゼロビットを検証する。これは利用者ログインやCAPTCHAを不要にできるが、端末側CPU時間と電力を消費する。大きな共有を分割して多数Relayへ複製する場合、PoWと署名生成の待機時間も増える。

- NIP-11 Relay Information: https://nips.nostr.com/11
- NIP-13 Proof of Work: https://nips.nostr.com/13

NIP-19の`nevent`形式は、32バイトのイベントIDに加え、複数Relay URL、作者、kindをTLV形式で含められる。従ってLBTは`share.html#nostr=<nevent>`のような短いURLだけで、受信ビューアへ取得先のRelay候補を渡せる。NIP-19自体は表示・共有用の符号化であり、Relayの保存を保証するものではないが、Relayごとの固定一覧をLBTコードにハードコードする必要を減らす。

- NIP-19: https://nips.nostr.com/19

## P2P・内容アドレス型方式: WebTorrent / IPFS

WebTorrentはブラウザ間のWebRTC転送で中央ストレージを避けられる。しかし、ブラウザ受信者はWebRTC対応のseedへ接続する必要がある。発行者がタブを閉じ、ほかにseedがいなければ共有内容は取得できない。DiscordのクローラーもWebRTCへ参加しないため、共有カードを得られない。これは即時の相手転送には有用だが、最低1〜3日の閲覧要件を満たさない。

IPFSはCIDによる内容アドレスと複数Gatewayを提供するが、CIDの生成だけでは永続性を保証しない。IPFS公式は、保持を望むコンテンツを1つ以上のノードへpinし、可用性のため複数ノードへのpinを推奨している。pinは誰かのストレージ費用・管理を必要とするため、「請求ゼロ」「利用者無制約」「発行停止なし」の三条件を同時に満たす本命にはできない。

| 方式 | 中央枠消費 | 発行者が閉じた後 | Discord OGP | 1〜3日保証 | 評価 |
| --- | --- | --- | --- | --- | --- |
| WebTorrent | なし | seed不在で取得不能 | 不可 | 不可 | 即時転送用途のみ |
| IPFS未pin | なし | キャッシュGCで消え得る | Gateway依存 | 不可 | 不採用 |
| IPFS複数pin | pin提供者に依存 | 可能 | Gateway依存 | pin契約に依存 | 管理・費用が生じる |

- WebTorrent FAQ: https://github.com/webtorrent/webtorrent/blob/master/docs/faq.md
- IPFS Persistence: https://docs.ipfs.tech/concepts/persistence/
- IPFS Gateway Best Practices: https://docs.ipfs.tech/how-to/gateway-best-practices/

## 匿名文書公開方式: Telegraph

Telegraph APIはアカウント作成後に`createPage`で最大64 KBのDOMノード配列を公開でき、短い`telegra.ph/<path>` URLを返す。許可タグは段落、見出し、リスト、強調、コード、画像、動画などに限定される。LBTの任意CSS・テーブル・スクリプトをそのまま維持することはできないが、状態を安全なTelegraph DOMへ変換すれば、1万文字級のシート情報を短い公開URLで表示することは可能である。

この方式は利用者ログインなし・中央LBT保存なし・64 KBまでの長文表示を満たす一方、Telegraphアカウントのアクセストークンが発行処理に必要であり、匿名公開サービスとしての保持期限・利用量上限・将来継続はAPI仕様で保証されない。LBTの完全なHTMLプレビューではなく、**読みやすい公開文書版シートの独立バックアップ**として有力である。

| 特性 | Telegraph公開文書 | LBT自己完結HTML | Nostr Relay |
| --- | --- | --- | --- |
| 1万文字級 | 可能（64 KB DOM） | URL長に依存 | Relay制限に依存 |
| URL | 短い | 長くなり得る | 短いイベント参照 |
| 完全CSS再現 | 不可 | 可能 | GitHub viewer経由なら可能 |
| Discordプレビュー | サービスHTMLに依存 | 静的OGP | 静的OGP |
| 中央LBT発行枠 | 不要 | 不要 | 不要 |

- Telegraph API: https://telegra.ph/api

### Telegraph実測（2026-08-17）

`https://api.telegra.ph/createAccount`および`createPage`へ、`Origin: https://lbtstudio.github.io`付きのブラウザ同等POSTを行った。`Access-Control-Allow-Origin: *`が返り、ログイン・CAPTCHA・支払い情報なしで匿名アカウントと公開ページを作成できた。非個人情報の検証ページは次の短いURLで公開された。

`https://telegra.ph/LBT-Share-Probe-08-17`

したがって、TelegraphはLBTから直接発行可能な「長文の公開文書版シート」の候補である。ただしアクセストークンは作成・編集権限を持つため、発行後に共有ページの状態へ保存してはならない。LBTは発行ごとに一時アカウントを生成し、公開ページのURLだけを返す設計に限定する。

同ページはHTTP 200で`<title>LBT Share Probe – Telegraph</title>`、`og:title=LBT Share Probe`、`twitter:card=summary`を返した。従って、発行時にページタイトルへ人格名を入れれば、Discordなどのカード見出しにも利用できる。一方、OGP画像は空であり、LBTの既存1200×630カード画像を任意指定する仕組みはTelegraph APIにない。

### iframe封入の実測

12,065文字の自己完結LBT共有URLをTelegraphの`iframe`ノードの`src`として発行したところ、短いTelegraph公開URLの作成には成功した。しかし公開HTMLのiframeは`src="/embed/"`へ置換され、LBTのURLは保持・表示されなかった。Telegraphは埋め込み先を独自の許可形式へ変換するため、完全なLBT HTMLビューアを短URLのTelegraphページに封入する方式は不採用とする。

## 匿名Markdown公開方式: Rentry

Rentryの`/api/new`へ`Origin: https://lbtstudio.github.io`を付けてPOSTしたところ、`Access-Control-Allow-Origin: *`が返り、非個人情報のMarkdown文書をログイン・CAPTCHA・支払い情報なしで公開できた。応答は短いURLと編集コードを返した。

`https://rentry.co/zf4cp3w3`

Rentryは共有タイトル・説明・検索除外などのメタデータを受け付けるため、Discordカード用の公開文書として扱える。匿名作成はIPごとにおよそ毎分10回に制限され、LBTの完全なHTML/CSSを再現しない。したがって、Telegraphと同じく**完全HTMLではなく、長文内容を保持した読みやすい公開シート版の冗長な配送先**として評価する。

公開ページはHTTP 200で`<title>LBT Share Rentry Probe</title>`、`og:title=LBT Share Rentry Probe`、`twitter:card=summary`、既定の`og:image`を返した。人格名を`SHARE_TITLE`へ設定すれば、Discordカードの見出しを動的に識別できる。

### 1万文字級の実測

11,195文字の非個人情報Markdown（`-`、日本語引用符、`/`、`&`、`+`、`#`、`;`、角括弧、波括弧、丸括弧を含む）を匿名発行したところ、Rentryは短い公開URLを返した。

`https://rentry.co/ur7ugmhg`

Rentryの公表上の`text`フィールド上限は200,000文字であり、1万文字級シートを情報欠損なく公開文書へ変換する容量には余裕がある。発行はIPごとに約毎分10回へ制限されるため、多数利用時の集中発行を単独サービスで吸収することはできない。

Telegraphの11,000文字級検証ページとRentryの11,195文字級検証ページはいずれも、公開後にHTTP 200で取得できた。レスポンス本文はそれぞれ19,397 bytes、22,998 bytesであり、短い公開URLが長文本文を実際に配信していることを確認した。

Rentry公式説明は、本文上限を200,000文字、保存期間を規約違反または投稿者自身による削除がない限り永久としている。また、公開API、二重サーバーへの即時複製、日次バックアップ、および利用者へ支払いを要求しない運用方針を明記する。これはLBTの請求ゼロ条件に適合するが、外部事業者の規約・可用性に依存するため、単独では「永久」を保証するものではない。

Telegraph公式APIは、アカウント作成とページ作成をHTTPSのGET/POSTで提供し、`createPage`の本文を最大64 KBのDOMノード配列として受け付ける。1万文字級のLBTシートには十分だが、JSONエスケープ後を含めて64 KBを超える特大シートはTelegraph単独へ送れない。その場合も200,000文字まで扱えるRentryを優先し、Telegraphは他方の冗長コピーとして扱う必要がある。

外部公開文書をLBTビューアで可逆復元する経路も実測した。`Origin: https://lbtstudio.github.io`を付けたGETで、Rentryの`/raw`（11,195文字の本文をHTTP 200で返す）とTelegraphの`getPage?return_content=true`（HTTP 200）の双方から`Access-Control-Allow-Origin: *`を受信した。従って、外部ページにLBTの圧縮ペイロードを埋め込み、`share.html?source=<provider>&id=<id>`がブラウザで取得・復元する方式は技術的に実装可能である。
Blossom BUD-01はすべての応答に`Access-Control-Allow-Origin: *`を要求し、SHA-256指定のBlob取得を標準化する。BUD-03は同一Blobを複数のサーバーへアップロードして、片方が失われた時に別サーバーから取得する設計を定める。これはLBTの共有状態を複数の公開保存先へ冗長化するための技術的骨格になる。

ただし、各Blobサーバーは401（認証必須）、403（ポリシー拒否）、429（クォータ超過）、503（停止）を返し得る。BUD-01の`Sunset`ヘッダーは将来の削除予定を伝えられるが、保持を保証しない。Blossomを採用しても「すべての公開サーバーが常に匿名アップロードを無制限に受け付ける」ことは保証できないため、分散フォールバックとしてのみ扱う。

- Blossom BUD-01: https://github.com/hzrd149/blossom/blob/master/buds/01.md
- Blossom BUD-03: https://github.com/hzrd149/blossom/blob/master/buds/03.md
