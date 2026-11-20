# v64r73 静的共有URL・Discordカード検証

検証日: 2026-08-17

## 実装方針

- `share.html`をGitHub Pages上の固定共有エントリポイントとし、Discordなどのクローラーへ静的なOGPを返す。
- 共有ビルドはURLの`#lbt=` fragmentに圧縮して保持する。fragmentはHTTPリクエストには送信されないため、共有データを外部ホストへアップロードしない。
- 共有ページをブラウザで開いたときだけfragmentを復元し、既存のキャラクターシートHTMLで表示する。

## ローカル確認

`http://127.0.0.1:3000/share.html` はHTTP 200かつ`text/html; charset=utf-8`を返し、ブラウザのタイトルは`LIMBUS BUILD TERMINAL — キャラクターシート`となった。ブラウザの二度目の状態取得は`about:blank`へ遷移して画面取得ができなかったため、共有データ付きURLの実表示は次の検証手順で別途確認する。

非個人情報の検証ビルドを圧縮した共有URL（587文字）を同ローカル共有ページで開いたところ、既存の整形済みキャラクターシートへ復元された。画面上でPC名`カード検証PC`、人格名`剣契殺手 サンの人格 [MAX]`、同期00・同期MAX、HP 100、SAN 45、速度1d5、各耐性が確認できた。最終表示ページの`title`も既存共有HTML生成により`【人格】剣契殺手 サンの人格 [MAX]｜LBT`となることを確認した。

GitHub Pages公開後、`share.html`単体は公開URLで到達し、静的な「共有データがありません」案内を表示した。一方、同じ検証fragmentを付けた公開URLは、ローカルでは復元できたにもかかわらず同案内を表示した。公開環境でfragmentが読み取れない、または公開済みスクリプトが読み込めていない可能性があるため、コンソールと公開JavaScriptの応答を追加調査する。

公開JavaScriptは`share-link.js`、`share-viewer.js`、`generator.js`ともHTTP 200で配信され、必要な関数定義も確認できた。公開ページ上の診断では、`window.location.hash`に完全な`#lbt=`トークンがあり、`LBT_shareLink`・`LBT_gen`・`DecompressionStream`も存在した。したがって、失敗箇所はURL取得やスクリプト未配信ではなく、トークン復号または共有ビューア内での後続処理にある。

追加の公開ブラウザ診断では、同じトークンの復号は成功し、`カード検証PC`・`剣契殺手 サンの人格`・同期MAX情報を取得できた。`data/items.json`もHTTP 200で35件を読み込め、`buildShareSheetHTML`は`【人格】剣契殺手 サンの人格 [MAX]｜LBT`のHTMLを生成できた。個々の処理は成功するため、共有ビューアの初回非同期表示タイミングを見直す必要がある。

`share-viewer.js`に`hashchange`時の再読込を追加して公開した後、キャッシュを避けた公開URLで検証した。GitHub Pages上で検証ビルドは正常にシートへ復元され、タイトルは`【人格】剣契殺手 サンの人格 [MAX]｜LBT`、画面にはPC名・人格名・同期00・同期MAX・HP 100・SAN 45・速度1d5・耐性が表示された。GitHub Pagesは`share.html`へHTTP 200を返し、本文にはcanonical、`og:url`、`og:title`、`og:description`、1200×630の`og:image`、Twitter large-imageカードのメタデータが存在することも確認した。

> DiscordのクローラーはJavaScriptとURL fragmentを実行・参照しないため、カードに表示される見出しは静的な`LIMBUS BUILD TERMINAL — キャラクターシート`となる。クリック後の共有ページでは、圧縮URLから復元した人格名・同期情報を含む実際のシートが表示される。人格名までカードへ動的に埋め込むには、リクエストごとにHTMLを生成するサーバー側共有ストアが必要である。
