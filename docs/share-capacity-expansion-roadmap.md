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

## 9. 現段階の採択判断

2026-08-19時点の判断を、実装済み・条件付き採択・保留・不採択へ明確に分ける。

| 判断 | 技術 | 容量または継続性への寄与 | 現段階での扱い |
| --- | --- | --- | --- |
| 実装済み | Rentry/Telegraph二重保存、GitHub Pagesビューア、Worker Cache、cross-version cache、stale応答 | 保存先一時障害、再配備、同一共有の集中アクセスに耐える。日次受信枠は増えない。 | 維持する。 |
| 実装済み | Cloudflare Web Analytics | 人間閲覧の実測により、容量投資を必要な時だけ行える。 | 7日間観測し、定期的に再評価する。 |
| 条件付き採択 | Netlify Freeの第2 OGP入口 | Cloudflare入口を60%にした場合、Cloudflareの80,000件安全目安に対する総共有到達は概算133,000件/日へ伸びる。ただしNetlifyの独立月次credit予算内であることが前提。 | 黄〜橙域の実測が出るまで実装しない。 |
| 保留 | Deno Deploy第3入口 | Netlify以外への障害・容量分散。 | Netlifyの実測上限が近づき、かつ無課金防止条件を再確認できた時だけ再評価する。 |
| 保留 | 画像の外部静的直配信 | 画像ありカードの`/i`到達を減らす可能性。 | 公式に保証された匿名・無課金・永続画像保存先が見つかるまで導入しない。 |
| 不採択 | 固定カード、Cloudflare経由の外部転送、非公式画像API | 個別カード品質またはCloudflare受信削減の目的を満たさない。 | 導入しない。 |

## 10. 容量目標と導入トリガー

現在のCloudflare単独構成では、日次80,000件を安全目安とする。これは100,000件の固定上限に20%の余白を残すためである。第2入口は「将来必要になるかもしれないから」ではなく、次のどれかを満たしたときだけ採択する。

| 観測結果 | 実施判断 |
| --- | --- |
| 50,000件/日未満が継続 | 現行構成を維持する。外部入口を増やさない。 |
| 50,000〜80,000件/日が3日以上続く | Netlifyの同型OGPを隔離環境で概念実証する。利用者には未公開。 |
| 80,000件/日超が発生、または50,000件/日超が14日続く | 新規共有の10%をNetlifyへ固定配分する。 |
| 10%配分を14日間継続し、カード品質・復元・credit残量に問題なし | 最大40%まで段階配分する。 |
| Netlifyのcreditまたは障害指標が安全域を外れる | 0%または直前の安全な配分へ戻す。既存URLは変更しない。 |

第2入口を40%まで使う場合、Cloudflareへ来る新規共有由来の受信は全体の概算60%となる。Cloudflareの80,000件安全目安だけで見れば、**総アクセス側の目安は約133,000件/日**まで拡張できる。ただしこれはNetlifyの月次credit、画像量、外部保存先の応答、Discord再プレビューが十分安全である場合の配分上の計算であり、無制限利用を意味しない。

## 11. 継続提供の定義

この計画は、外部サービスの永続を約束するものではない。継続提供とは、サービス停止・上限・障害が一つ起きても、既存共有を破壊せず、利用者に管理操作を要求せず、次の安全な状態へ戻れる構造を指す。

具体的には、発行済みCloudflare URLは残し、共有データはRentry/Telegraphの二重保存を維持し、共有内容はGitHub Pagesビューアで復元できる。第2入口を導入しても、既存URLの書換えや全利用者の移行を行わない。これにより、入口の一つが停止しても、障害の範囲を「その入口で新規に発行された共有」に閉じ込め、共有基盤全体の破綻を避ける。

## 12. 複数入口化に利用できる外部サービス

個別OGPを維持してCloudflare受信を本当に減らすには、共有発行時に**別提供元のURLを直接返す**必要がある。Cloudflare Workerを入口にして別サービスへ転送しても、Cloudflare側の1受信は残る。この前提で、候補を評価する。

| 役割 | 外部サービス | 公式無料枠・上限 | 個別OGPの直接返却 | 無課金・運用上の注意 | 判断 |
| --- | --- | --- | --- | --- | --- |
| 主入口 | Cloudflare Workers Free | 日次100,000受信。[1] | 現行実装済み。 | Free固定。HITも受信枠を使う。 | 継続採択 |
| 第2入口 | **Netlify Free + Edge Functions** | 月300 credits。Freeはhard limitでauto recharge不可。web requestは1万件あたり2 credits、Edge Functionはweb requestとして計量される。[4] [10] | 可能。現行の無状態OGP Workerと同型のHTML応答を返せる。 | credit使い切り時は全プロジェクトが月次更新までpauseする。個別URLはneutralな`netlify.app`名を使う。 | **最優先の条件付き採択** |
| 第3入口 | **Val Town Free HTTP Val** | 1日100,000 runs、公開HTTP endpoint、Freeでcustom domainなし。[11] [12] | 可能。HTTP triggerはHTMLとContent-Typeを返せ、クエリを読んでルーティングできる。[13] | endpoint URLにアカウントhandleが入るため、LBT専用のneutral handleを使う。Freeのcustom domainなし・稼働保証なし。 | **小配分の第3候補** |
| 保留 | Deno Deploy Free | 月100万request、20GB egress、15 CPU hours、HTTP Edge Cache。[6] | 可能。Web標準のWorker型実装を移植しやすい。 | Proのspend limitはあるが、Freeでの無課金防止を主系として明文化しにくい。月次枠も日次集中には弱い。 | 保留 |
| 不採択 | Supabase Free Edge Functions | 月500,000 invocation、5GB egress。ただしFree projectは低活動7日でpauseする。[14] [15] | 技術的には可能。 | 復帰に所有者操作が必要となり、無管理の継続提供に反する。custom domainもFree外。 | 不採択 |
| 不採択 | Vercel Hobby | 月100万Edge Request / Function Invocation。[16] | 技術的には可能。 | Hobbyは非商用・個人利用に制限される。上限後は原則30日待機となる。[16] [17] | 主共有基盤には不採択 |

### 12.1 実際の入口構成

導入段階では、既存のCloudflare URLを主入口のまま維持する。新規共有だけを共有IDの安定ハッシュで分け、利用者がどの提供元を選ぶか判断する場面を作らない。

```text
既存共有 ─────────→ Cloudflare Worker ─→ Rentry / Telegraph ─→ GitHub Pages viewer

新規共有（初期） ── 90% → Cloudflare Worker
                    10% → Netlify Edge Function

新規共有（拡張時） ─ 50% → Cloudflare Worker
                    40% → Netlify Edge Function
                    10% → Val Town HTTP Val
```

この配分は最終目標ではなく、各提供元の実測を得るための上限である。Netlifyの月次creditを使い切る、Val Townのrun制限へ近づく、またはカード品質が一致しない場合は、その入口の**新規配分を0%へ戻す**。発行済みURLは書き換えず、Rentry/Telegraphの二重保存とGitHub Pagesビューアを通じて復元可能な状態を残す。

### 12.2 サービス選定の現時点の結論

**今すぐ第2入口として使う候補はNetlify Free**である。Freeのhard limitとauto recharge不可が、請求を発生させないという最優先条件に最も明確に合う。一方で、credit使い切り時はチーム内の全Netlifyプロジェクトがpauseするため、LBT以外の重要サイトを同じFree teamに置かない。

**Val Townは第3入口として有望だが、小配分に限る。** HTTP endpointが公開URLでHTMLを返せ、1日100,000 runsというCloudflareとは独立した日次枠を持つ。反面、Freeはcustom domainを持てず、サービスURLにhandleが入る。LBT専用のneutralなアカウント名・Val名を使い、非公開の実装コードに不要な識別情報・秘密情報を置かないことが受入条件になる。

**Deno Deployは保留**とする。技術互換性と月100万requestは魅力だが、無課金固定を最優先する現行方針では、Netlifyのhard limitとVal TownのFree run上限を先に使う方が保守的である。

## 13. 複数入口を実装する前の受入条件

1. 所有者がNetlifyとVal TownのFreeアカウントを、LBT専用かつneutralな表示名で用意する。
2. それぞれに、現行の`/s`・`/i`相当のカードHTML・画像応答を無状態で実装する。Rentry/Telegraph/GitHub Pagesの既存仕様は変更しない。
3. `og:title`、`og:description`、`og:image`、人格名、HP、SAN、同期、MAX、画像、長文共有、Rentry/Telegraph片系障害をCloudflare版と同じ期待値でテストする。
4. Netlifyはproduction deployによるcredit消費、web request、帯域、Edge Function利用をまとめて監視し、Free 300 creditsの半分以下で始める。
5. Val TownはHTTP run数を監視し、日次100,000 runの50%未満から開始する。公開URL・code・errorに所有者識別子を出さない。
6. 入口を増やしても、利用者画面には提供元名、選択肢、ログイン、課金案内、手動切替を出さない。
7. 既存共有URLの変更なし、PC・モバイルの共有発行UIをスクリーンショット確認、全共有回帰テスト成功を必須とする。

## 14. この設計で得られるもの・得られないもの

複数入口化は、Cloudflareの固定日次枠を**独立した無料枠へ分散**し、特定入口の障害を新規共有の一部に局所化する。個別OGPカードの品質と利用者の無操作を維持したまま、単一入口より大きな総到達量を扱える。

一方で、外部サービスの永久継続、全入口の無限容量、提供元停止時の既存URLの完全な自動移転は保証できない。したがって、入口は最初から多く増やすのではなく、観測値に従ってCloudflare → Netlify → Val Townの順に導入し、各入口の無料上限とカード品質を実測で確認する。

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
[10]: https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/how-credits-work/ "Netlify Credit-Based Plan Credits"
[11]: https://www.val.town/pricing "Val Town Pricing"
[12]: https://www.val.town/limits "Val Town Limits"
[13]: https://docs.val.town/vals/http/basic-examples/ "Val Town HTTP Basic Examples"
[14]: https://supabase.com/pricing "Supabase Pricing"
[15]: https://supabase.com/docs/guides/platform/free-project-pausing "Supabase Free Project Pausing"
[16]: https://vercel.com/docs/plans/hobby "Vercel Hobby Plan"
[17]: https://vercel.com/docs/limits/fair-use-guidelines "Vercel Fair Use Guidelines"
