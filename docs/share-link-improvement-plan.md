# LBT共有リンク方式 — 未実装の改善プラン

更新日: 2026-08-19  
状態: **設計のみ。共有URL、Worker、Rentry、Telegraph、GitHub Pagesの実装はこの計画により変更しない。**

## 目的と維持条件

LBTの共有リンクは、Discordで人格名・HP・SAN・同期・画像を含む個別カードを表示し、利用者が登録せずに共有内容を開けることを目的とする。改善では、次の現行要件を維持する。

| 維持する条件 | 設計上の意味 |
| --- | --- |
| 個別Discordカード | 人格別`og:title`、HP、SAN、同期、任意の共有画像を落とさない。 |
| 利用者の無操作 | 利用者にアカウント作成、サービス選択、CAPTCHA、手動フェイルオーバーを要求しない。 |
| 無課金 | 自動課金・従量課金を避け、上限では停止または既存経路維持になるサービスだけを検討する。 |
| 既存共有の継続 | 発行済みURLを壊さず、Rentry/Telegraph二重保存と静的閲覧ページを維持する。 |
| 所有者情報の非露出 | 新しい公開URL・ホスト名・タグに所有者の識別子を含めない。 |

## 先に行うべき観測

Cloudflare Web Analyticsを通常画面と`share.html`へ手動設置し、GitHub Pages上の**人間が開いたページ**を匿名に集計する。クエリ文字列は収集しないため、共有トークンや個別キャラクターデータを計測側へ送らない。[1] ただし広告ブロッカー等でビーコンが遮断されるため、これは「下限に近い閲覧傾向」であり、絶対的なユニーク人数ではない。[1]

OGP Worker自体は測定対象に加えない。Discord等のクローラーによるカード取得と、人間の閲覧を混ぜると、利用実態を誤解するためである。最初の7日間は通常画面と共有閲覧ページの訪問量・参照元・端末傾向だけを見て、共有者200人という仮定を実測で置き換える。

> 判定基準は日次100,000件のCloudflare上限ではなく、まず「共有閲覧の実人数」「通常画面から共有閲覧へ進む比率」「共有閲覧が急増する曜日・時間帯」を把握することに置く。

## 改善ロードマップ

| 優先度 | 改善案 | 期待効果 | 実施条件 | 現時点の扱い |
| --- | --- | --- | --- | --- |
| P0 | 匿名アクセス解析の7日間観測 | 仮定に依存しない容量設計へ移行する。 | Web Analyticsのデータ蓄積。 | 導入済み、観測待ち。 |
| P1 | 現行キャッシュの監視・保守手順化 | 再配備による一斉MISS、保存先一時障害、CPU浪費を防ぐ。 | `cross_version_cache`、カード世代、MISS→HIT確認を継続。 | 実装済み、運用手順の継続。 |
| P2 | **Netlify Freeを第2の直接OGP入口にする** | 新規共有を決定的に二分し、Cloudflare日次受信を概算で半分へ下げる。 | 所有者がNetlify Freeを一度接続し、neutralなホスト名でEdge Functionを配備する。 | **未実装。最有力の次候補。** |
| P3 | 共有画像の静的直配信化 | 画像あり共有の`/i` Worker到達を減らす。 | 匿名書込・確実な永続公開・個別OGPとの整合を満たす画像保存先。 | 条件を満たす候補未確認。 |
| P4 | 容量警戒表示または発行分散比率の調整 | 危険日に新規共有を安全な入口へ寄せる。 | P2の第2入口と、観測結果から導く明確な閾値。 | 未実装。P2後に再評価。 |

## P2: 第2 OGP入口の具体像

Cloudflare上のURLを入口に残して別サービスへ転送しても、Cloudflare受信数は減らない。P2では、共有発行時に共有IDから決まるハッシュ値で、**Cloudflareの短URLまたはNetlifyの短URLを直接返す**。たとえば偶数ハッシュはCloudflare、奇数ハッシュはNetlifyへ固定する。同じ共有は常に同じ入口を使うため、利用者の選択や追加操作は生じない。

Netlify Freeはhard limitでauto rechargeがなく、上限到達時はプロジェクトをpauseするため、請求回避を優先する条件に適合する。[2] [3] ただし月次の独立上限は残る。Cloudflareが停止した時にすべてをNetlifyへ瞬時に振り直す「単一入口の自動切替」は、入口自体がCloudflare受信を使うため、Cloudflare枠を減らす目的とは両立しない。

P2を採択するのは、観測後に「Cloudflareの実日次受信が安全目安80,000件へ継続的に近づく」、または「特定の共有イベントで集中が再現する」場合に限る。それまでは、別プロバイダの管理対象・障害点を増やさない現行構成を維持する。

## 採択しない案と理由

| 案 | 不採択の理由 |
| --- | --- |
| OGPを固定カードへ変更 | Worker受信は減るが、人格別の名前・HP・SAN・同期・画像を表示する目的を失う。 |
| Rentry/TelegraphをカードURLとして直接使う | 個別メタデータは一部設定できても、LBT閲覧ページへの無操作の直接遷移と、任意共有画像の確実な保存を同時に満たさない。 |
| Workerを入口にした外部フェイルオーバー | 内部処理は分散できても、Cloudflareの受信数は入口で必ず計上される。 |
| Vercel Hobby | 個人・非商用用途の条件があり、外部利用を受ける主共有基盤には適合性が弱い。[4] |
| Deno Deploy Free | 技術的には実装可能だが、支出上限の説明がPro向けであり、請求可能性を絶対に避ける主系としてNetlifyより弱い。[5] [6] |

## 実装時の受入条件

共有リンクを実際に変更する段階では、次の条件をすべて満たすことを受入条件とする。

1. 既存のCloudflare形式URLが無変更で開け、Discordカードも継続すること。
2. 新入口のカードが人格名・HP・SAN・同期・MAX・画像を同じ形式で返すこと。
3. 利用者の画面にサービス選択、ログイン、課金設定、障害案内を表示しないこと。
4. 新規サービスの課金設定がhard limitまたは支出上限で保護されていること。
5. neutralな公開ホスト名を使い、HTML・URL・公開設定に所有者識別子を残さないこと。
6. Cloudflare・第2入口ともに初回MISSと後続HIT、長文共有、画像あり共有、Rentry/Telegraph片系障害を回帰テストすること。
7. PC・モバイルの共有発行UIをスクリーンショットで確認し、URL表示・コピー・説明文が悪化していないこと。

## 参照

[1]: https://developers.cloudflare.com/web-analytics/faq/ "Cloudflare Web Analytics FAQs"
[2]: https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/ "Netlify Credit-based Pricing Plans"
[3]: https://www.netlify.com/pricing/personal-vs-free/ "Netlify Personal vs Free"
[4]: https://vercel.com/docs/plans/hobby "Vercel Hobby Plan"
[5]: https://deno.com/deploy/pricing "Deno Deploy Pricing"
[6]: https://docs.deno.com/deploy/usage/ "Deno Deploy Usage Guidelines"
