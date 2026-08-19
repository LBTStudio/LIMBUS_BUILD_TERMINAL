# LBT 匿名アクセス解析の導入記録

更新日: 2026-08-19  
対象ホスト: `lbtstudio.github.io`  
対象ページ: LBT通常画面および共有閲覧画面

## 導入方針

既存のRentry・Telegraph保存、Cloudflare OGP Worker、GitHub Pages共有ページ、共有URL形式、キャラクター編集処理には変更を加えず、Cloudflare Web AnalyticsのブラウザビーコンだけをHTML末尾へ手動設置する。GitHub PagesはCloudflareのproxyを通らないため、Cloudflareの公式手順に従い`auto_install: false`のサイトを作成し、各HTMLへ同じsite tokenを明示する。[1]

ビーコンは通常画面の`index.html`と、実際の共有閲覧を測る`share.html`だけに置く。Discord等のクローラーが取得するOGP WorkerのHTMLには置かないため、OGPカードのメタデータ・転送・キャッシュ経路を変えない。

## 初期確認

ローカル静的プレビューの通常画面は、タグ追加後もデータベースを読み込み、LBT画面を通常どおり描画した。HTML上で通常画面・共有画面ともに同一のCloudflare Web Analytics tokenを1個だけ参照していることを確認済みである。GitHub Pages反映後には、実共有URLで人格名・HP・SAN・同期・MAX・スキル・E.G.O・強化を含む共有閲覧ページが正常に復元・表示されることを確認した。ビーコン集計値の表示はCloudflare側の反映待ちとなる。

## 収集範囲と限界

Cloudflare Web Analyticsはページビュー、訪問、参照元、端末等のWeb指標を提供するprivacy-firstの解析であり、DNS変更やCloudflare proxyを必要としない。[1] [2] ただしJavaScriptビーコンは広告ブロッカー等により遮断されうるため、表示される訪問数は完全な実人数ではなく、解析に同意・到達できたブラウザの近似値として扱う。[3]

また、クエリ文字列は記録しないため、共有トークン・キャラクターデータ・個別共有IDを解析側に送らない。[3] OGP Workerへの到達数と、Web Analyticsの人間閲覧数は別の指標として扱う。

## 参照

[1]: https://developers.cloudflare.com/web-analytics/ "Cloudflare Web Analytics"
[2]: https://developers.cloudflare.com/web-analytics/get-started/ "Enabling Cloudflare Web Analytics"
[3]: https://developers.cloudflare.com/web-analytics/faq/ "Cloudflare Web Analytics FAQs"
