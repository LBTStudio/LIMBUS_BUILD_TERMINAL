# Discord共有リンク — 短い表示と直接閲覧の設計比較

作成日: 2026-08-18  
対象: LIMBUS BUILD TERMINAL（LBT）の人格シート共有

## 目的

Discordに貼られた時点で、受信者が「**LIMBUS BUILD TERMINALの共有キャラクターシート**」であり、どの人格・HP・SAN・同期状態かを理解できることを最優先とする。同時に、長大なURLを会話上で露出させず、クリックした利用者にはRentry・Telegraphなどの中間ページを見せずにLBT共有シートを開かせる。

## 現行経路

現行の短縮共有は、共有データ本体をRentry／Telegraphへ保存するが、利用者へ渡すURLは`lbtstudio.github.io/.../share.html?lbt_source=...`である。共有ビューアがブラウザ内で保存先からトークンを取得するため、閲覧者がRentry／Telegraphの画面を経由することはない。

> つまり「外部短縮サービスの保存を内部で処理し、最終LBTページだけを渡す」という経路は、現在すでに実装済みである。残る本質的な問題は、Discordの会話上で最終URLそのものが長く見えることと、静的OGPでは人格別カードを返せないことである。

| 案 | Discord上の見た目 | クリック後 | 個別OGP | 無料・管理負担 | 評価 |
|---|---|---|---|---|---|
| A. 現行の最終LBT URLをそのまま貼る | URLが長い | 直接LBTシート | 不可（静的） | 既存・追加負担なし | 機能的だが見栄えが弱い |
| B. **Discord用マスクドリンクで最終LBT URLを隠す** | 人格名とステータスだけを表示 | **直接LBTシート** | 静的LBTカード | 既存・追加負担なし | **即時採用候補** |
| C. TinyURL等を直接貼る | 短いドメイン・ID | HTTPリダイレクト後にLBT | 短縮先／最終先に依存 | 外部サービス依存 | 閲覧は速いが、URL主体やカード品質を制御できない |
| D. 専用の短縮ドメイン`lbt.link/s/ID` | 独自ブランドで短い | HTTPリダイレクト後にLBT | 静的または動的に選択可 | ドメイン・運用が必要 | 将来案。高い統制力 |
| E. 共有IDごとに動的HTMLを返すLBTエンドポイント | `lbt…/s/ID` | 直接LBTシート | **人格別カードが可能** | 共有ストア・サーバーが必要 | 個別Discordカードの唯一の正攻法 |
| F. Rentry／TelegraphのURLを直接貼る | 外部サービス名が前面に出る | 外部ページ | 外部サービス側に依存 | 既存機能 | LBT体験を損なうため不採用 |

## 三つの専門観点による結論

### 1. 利用者体験・Discord運用

Discordは`[表示文](URL)`形式の**マスクドリンク**をサポートする。したがって、URL実体は最終LBT共有URLのまま、会話上では次のように表示できる。

```md
**LIMBUS BUILD TERMINAL｜東部親指ソルダートII [MAX]**
HP 125 / SAN 50 / 同期00・MAX
[キャラクターシートを開く](https://lbtstudio.github.io/LIMBUS_BUILD_TERMINAL/share.html?...)
```

受信者がクリックする先はLBTであり、短縮サービスやリダイレクト専用ページを視認しない。URLの肥大化を会話欄から除去しながら、人格名・HP・SAN・同期MAXを送り手の文章として確実に伝えられる。この案は既存インフラを増やさず、最短で目的を満たす。

### 2. 共有基盤・信頼性

外部保存先はURL短縮器ではなく、長大な圧縮トークンを保管するための内部バックエンドとして扱うべきである。LBT最終URLが`lbt_source`と`lbt_id`を持ち、ブラウザ内でトークンを取得すれば、利用者の遷移はLBT一回だけになる。外部リンクを直接返す方式は、ブランド、復元画面、フォールバックを失うため採用しない。

専用短縮ドメインの302／307リダイレクトは、通常ブラウザでは中間画面を表示せず最終LBTへ遷移する。しかし、短縮ドメインであること自体はDiscordカードやリンク警告に残りうる。現在の要件では、まずマスクドリンクで会話上の問題を解消し、将来の独自ドメインは必要性が確認されてから導入するのが適切である。

### 3. OGP・データ表現

URLフラグメント（`#...`）はHTTPリクエスト時にサーバーへ送られないため、静的GitHub Pagesは共有データに応じたOGPを返せない。[2] 同様に、クローラーが取得するHTMLが常に同一なら、JavaScript実行後に表示される人格名をカードごとに差し替えることはできない。[3]

よって、**人格別Discordカード**を完全自動化するには、`/s/<短ID>`へのHTTPリクエストに対し、人格名・HP・SAN・同期情報を含むHTML headを動的に返す共有エンドポイントが必要である。これは共有IDとデータのサーバー側保存を前提とし、現在の「静的GitHub Pagesのみ」とは別の構成になる。

## 推奨方針

第1段階は、共有モーダルに**「Discord用共有文をコピー」**を追加する。

1. 外部保存を内部で使って作成した**最終LBT共有URL**を維持する。
2. 人格名、HP、SAN、同期ランク、同期MAXを先頭の太字テキストとして出力する。
3. 最終URLをDiscordマスクドリンクの対象にして、会話上では`キャラクターシートを開く`だけを見せる。
4. 通常のURLコピーも残し、Discord以外では既存の共有方法を維持する。

この方式は、短縮サービスのURLや中間ページを受信者に見せず、リンク先も直接LBTにする。個別OGPカードは第2段階の動的共有エンドポイントに分離し、無料性・管理不要性・多数利用の要件が確定してから検討する。

## 参考資料

[1] Discord Support, [Markdown Text 101 — Masked Links](https://support.discord.com/hc/en-us/articles/210298617-Markdown-Text-101-Chat-Formatting-Bold-Italic-Underline)  
[2] MDN, [URI fragment](https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Fragment)  
[3] Thomas Hunter II, [Setting Open Graph Tags without Server Side Rendering](https://thomashunter.name/posts/2022-05-24-setting-open-graph-tags-without-ssr)
