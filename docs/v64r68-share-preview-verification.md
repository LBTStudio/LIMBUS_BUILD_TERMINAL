# v64r68 共有リンクプレビュー検証記録

検証日: 2026-08-17

| 検証項目 | 結果 |
|---|---|
| 共有HTMLのOGP | テスト用状態から生成したHTMLに、キャラクター名を含む`title`・`og:title`、主要ステータスを含む`description`・`og:description`、LBTカード画像、`twitter:card=summary_large_image`を確認した。 |
| 共有モーダル | v64r68で「閲覧用URLを発行（Discordカード対応）」と、公開URLが誰でも閲覧できる旨の説明を表示した。既存のダウンロード・ローカルプレビュー導線も残っている。 |
| OGP画像 | `assets/lbt-share-card.png`を1200×630 PNGとして確認。LIMBUS BUILD TERMINAL / CHARACTER SHEETを明示するダーク・ゴールド基調の共有カードである。 |

Discordなどの実際のリンクカードは、閲覧用URLを発行した後に各サービスのクローラーがHTTPSで取得したHTMLを基に表示される。ローカルプレビューとダウンロードHTMLには外部クローラーが到達できない。
