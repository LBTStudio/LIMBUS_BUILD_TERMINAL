# LBT共有基盤 — 耐用許容量・継続性拡張ロードマップ

更新日: 2026-08-19  
状態: **計画のみ。ここに記す第2・第3入口、共有画像の保存先、発行ロジックは実装しない。**

## 1. 目的

LBTの共有基盤は、Discord上で人格ごとのカードを表示し、受け取った人が登録・選択・待機なしで共有シートを開けることを目的とする。耐用許容量を上げる計画では、単にWorkerのCPU負荷を下げるのではなく、**一日あたりの受信枠、保存先の一時障害、再配備によるキャッシュ再加熱、将来の無料サービス停止**を別々に扱う。

次の条件は設計上の不変条件とする。

| 不変条件 | 必要な理由 |
| --- | --- |
| 個別カード | 人格名・HP・SAN・同期・MAX・任意画像をDiscordで一目に確認できる。 |
| 利用者無操作 | 利用者に登録、サービス選択、CAPTCHA、障害時の手動切替を求めない。 |
| 無課金 | 従量課金を開始しない。無料枠上限では、請求ではなく安全な停止・劣化にする。 |
| 既存URL継続 | 発行済みCloudflare URL、Rentry、Telegraph、GitHub Pages閲覧ページを壊さない。 |
| 所有者識別の非露出 | 新しい公開ホスト名・URL・ページ内容に所有者識別子を含めない。 |

## 2. 現行基盤で既に実現済みの耐性

現行のCloudflare Workerは、RentryとTelegraphから共有データを二重復元し、成功した不変カードをfresh 7日、stale最長30日でエッジに保持する。`cross_version_cache: true`とカード世代により、実装更新後も既存キャッシュを再利用する。これはCPU、外部保存先読込、再配備直後の一斉MISSを削減するが、Cache HITも日次受信リクエストとしては計上される。[1] [2]

したがって、個別カードを維持する限り、Cloudflareのみで日次100,000受信枠を超えて成長することはできない。個別OGP HTMLを取得する経路がCloudflareである以上、クローラー・人間のクリック・共有画像取得のうち、少なくともカードHTMLの到達はCloudflareの枠を使うためである。

## 3. 観測による段階判定

アクセス解析は、`index.html`と`share.html`の人間閲覧を匿名に捉える。共有トークン・キャラクターデータ・クエリ文字列は記録しない。広告ブロッカー等のため下限的な傾向値になるが、容量計画に必要な共有閲覧の増減・参照元・端末傾向を得られる。[3]

日次Worker受信の実値はCloudflareのWorker指標で確認し、Web Analyticsの人間閲覧傾向と混同しない。前者はDiscordクローラーと画像取得を含み、後者は実際の閲覧ページへの到達を主に示す。

| 状態 | 実Worker受信の目安 | 行動 |
| --- | ---: | --- |
| 緑 | 0〜20,000/日 | 現行構成を維持し、7日単位で共有閲覧傾向を観測する。 |
| 黄 | 20,001〜50,000/日 | 一時的なイベントか、恒常的な増加かを観測する。第2入口の準備だけを行う。 |
| 橙 | 50,001〜80,000/日が連続 | 第2入口の概念実証を実施し、新規共有の直接分散を検証する。 |
| 赤 | 80,001/日が連続、または100,000へ接近 | 新規共有を第2入口へ段階配分する。既存URLはそのまま保持する。 |

80,000件を運用目安とするのは、Discordの再プレビュー、共有画像、旧URL、保存先障害時の再試行の余白20,000件を残すためであり、Cloudflareが定める追加の閾値ではない。

## 4. 採択候補: 決定的な複数入口

### 4.1 第2 OGP入口: Netlify Free Edge Functions

最も現実的な容量拡張は、**新規共有の一部をCloudflareを経由せず、Netlifyの独立URLへ直接発行する**方式である。NetlifyのEdge Functionには、現行Workerと同じ無状態のOGP復元ロジックを置く。Rentry/TelegraphとGitHub Pagesビューアは共用し、カードHTMLだけを別入口で返す。

共有IDから安定ハッシュを作り、例えば60%をCloudflare、40%をNetlifyへ固定する。同じ共有のリンク先は将来も変わらず、利用者はサービスやルートを選ばない。Cloudflareの受信は概算60%に下がり、同じ利用状況で日次余力が拡大する。

Netlify Freeは月300 creditsのhard limitで、auto rechargeはなく、上限時にはプロジェクトをpauseする。[4] [5] ただしweb request、帯域、関数実行が同じcreditsを使うため、計画値を「追加の無限容量」とは扱わない。実測のカードサイズ・画像比率で使用量を確認し、月次上限の半分以下に留める配分から開始する。

### 4.2 第3入口: Deno Deploy Freeは保留

Deno Deployは月100万HTTP request、20GB egress、Edge Cacheを含むため、技術的には第3入口になり得る。[6] しかしDenoの支出上限の案内はPro計画を対象としており、請求可能性を絶対に避ける主共有基盤としてはNetlify Freeのhard limitより判断が弱い。[7] したがって、DenoはNetlifyの実測でなお不足が確認され、かつ課金防止条件を再確認できた場合だけ再評価する。

### 4.3 入口分散の限界

第2入口の個別URLが提供元の月次上限・障害で停止した場合、そのURLを別の提供元へ無操作で切り替えることはできない。Cloudflareを常時入口ルーターにすれば切替は可能だが、Cloudflare日次受信を減らす目的を失う。よってこの方式は「単一入口の完全自動フェイルオーバー」ではなく、**日次容量を複数の無課金枠へ分散する**方法である。

導入時は既存URLを変更しない。第2入口で作った新規リンクだけを小さな配分から開始し、共有データはRentry/Telegraphに二重保存する。提供元の恒久停止に備える最終手段は、GitHub Pagesの静的ビューアURLへ復元できる状態を残すことである。

## 5. 共有画像の最適化: 条件付き・未採択

個別画像があるカードでは、`/s`カードHTMLに加え`/i`画像をWorkerが返す。この画像を静的ホストから直接返せれば、画像ありカードのWorker到達を概算で1件減らせる。

ただし、候補として見えるTelegraphの`/upload`は公式Telegraph APIの公開メソッドに含まれていない。公式APIはページ作成・編集・参照を保証し、ページ中の`img`ノードには外部`src`を指定できるが、画像バイトのアップロードAPIを保証しない。[8] 非公式アップロードに依存すると、無管理・長期継続の条件に反するため採択しない。

Cloudflare Images、R2の公開書込、商用画像CDNは、認証済みの書込・料金・規約・管理を追加するため、現段階では不採択とする。今後、「匿名のブラウザから安全に書き込め、明示的な無料hard limitを持ち、直接HTTPS画像URLを恒久公開し、公式仕様で保証される」保存先が現れた場合だけ再評価する。

## 6. 実施順序と受入条件

| 段階 | 実施内容 | 開始条件 | 成功判定 | 失敗時 |
| --- | --- | --- | --- | --- |
| A | Web Analytics観測 | 現在 | 7日分の人間閲覧傾向を取得 | 14日まで観測延長。広告ブロックによる不足を注記する。 |
| B | 現行Cache運用 | 継続 | `MISS → HIT`、再配備後のCache再利用、Rentry/Telegraph片系障害耐性を維持 | Worker変更を止め、直近の安定バージョンへ戻す。 |
| C | Netlify OGP概念実証 | 橙または赤の継続 | テスト人格で同一カード、短URL、GitHub Pages転送、画像、長文復元を確認 | 本番共有を分散しない。Cloudflare単独へ留める。 |
| D | 10%の新規共有を第2入口へ配分 | Cを通過 | Cloudflare日次受信が想定どおり低下し、Netlify creditsが安全域に留まる | 配分を0%へ戻す。既存第2入口URLは保存先から復元可能に保つ。 |
| E | 40%まで段階配分 | 10%を14日観測 | 両入口が正常、共有カード品質と利用者操作が不変 | 10%へ戻すか、Cloudflare単独へ戻す。 |

本番採択の受入条件は、既存共有URLを破壊しないこと、人格名・HP・SAN・同期・MAX・画像のカード品質を一致させること、所有者識別子を公開URLに含めないこと、利用者が登録・選択・障害操作を行わないこと、無料枠の課金防止を確認すること、PC・モバイル画面と長文共有の回帰テストを通すことである。

## 7. 採択しない考え方

| 考え方 | 採択しない理由 |
| --- | --- |
| 固定OGPカード化 | Worker受信は減るが、人格別のカード情報を失う。 |
| Cloudflare入口から外部へ転送 | Cloudflare受信は入口で消費されるため、日次枠を拡張できない。 |
| Rentry/Telegraphを直接カードURLにする | LBT閲覧ページへの無操作遷移、画像の保証、カード品質を同時に満たさない。 |
| 非公式Telegraph画像アップロード | 公式に保証されないため、継続的な共有基盤の依存先にできない。 |
| Vercel Hobby | 個人・非商用向けの条件があり、外部利用される主共有基盤には適合性が弱い。[9] |
| 発行数を利用者に制限する | 利用者無操作・継続性という目的に反する。 |

## 8. 今回の結論

現時点で安全に進めるべき順番は、**観測 → 現行Cacheの維持 → 必要時にNetlify第2入口を10%から導入**である。これは無料・無操作・個別OGPを維持しつつ、唯一実際にCloudflareの日次受信を別枠へ逃がせる現実的な技術経路である。

他の案は、個別カードを犠牲にするか、Cloudflare受信を入口で消費し続けるか、無料・管理不要・公式保証のいずれかを失う。Netlify導入も「無限のサービス継続」を約束するものではないが、実測に基づいて段階配分し、既存共有を変更しないことで、現在の無課金構成のまま耐用許容量と障害分離を最も大きく改善できる。

## 参照

[1]: https://developers.cloudflare.com/workers/platform/pricing/ "Cloudflare Workers Pricing"
[2]: https://developers.cloudflare.com/workers/cache/configuration/ "Cloudflare Workers Cache Configuration"
[3]: https://developers.cloudflare.com/web-analytics/faq/ "Cloudflare Web Analytics FAQs"
[4]: https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/ "Netlify Credit-based Pricing Plans"
[5]: https://www.netlify.com/pricing/personal-vs-free/ "Netlify Personal vs Free"
[6]: https://deno.com/deploy/pricing "Deno Deploy Pricing"
[7]: https://docs.deno.com/deploy/usage/ "Deno Deploy Usage Guidelines"
[8]: https://telegra.ph/api "Telegraph API"
[9]: https://vercel.com/docs/plans/hobby "Vercel Hobby Plan"
