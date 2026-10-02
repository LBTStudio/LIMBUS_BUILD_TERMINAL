# UI改善案 — 全体interfaces監査に基づく実装計画

作成: 2026-10-01 / 対象: `main` @ `4babf78`
方法: `better-ui` + `better-accessibility` スキルによる静的監査（read-only）。
レンダリング検証（ブラウザ実機・Motionパネル・axe）は**未実施**。本計画中の「未検証」表記は全章で明示。

---

## 0. 監査サマリー

### 検出規模

| 領域 | HIGH | MEDIUM | LOW | 計 |
|---|---|---|---|---|
| アクセシビリティ | 25 | 34 | 21 | **80** |
| CSS設計・ビジュアルポリシー | 14 | 21 | 12 | **47** |

### 構造的メトリクス（`assets/*.css` 13ファイル / 318,615 B）

| 指標 | 実測 | 判定 |
|---|---|---|
| `v56-refinements.css` のCSSバイト占比 | 35.5%（113 KB） | imore |
| バージョン名ファイル数 | 7（v52/v53/v55/v56/v65r29/v65r43/v65r44/v65r47） | 上書きレイヤー堆积 |
| `:root` ブロック数 | **6箇所**（design-system×2, v53, v55, v56×2） | 単一ソース失敗 |
| 2ファイル以上に宣言されたセレクタ | **109 / 1,399（7.8%）** | カスケード負債 |
| 後のファイルが上書きするプロパティ | **95** | サイレント上書き |
| `!important` 行数 | **136**（v56: 95, v53: 32） | 力で勝つ設計 |
| `transition: all` | **33** | 意図しないレイアウト補間 |
| 未定義トークンを参照する `var()` | **15種 / 31箇所** | 常にfallbackが勝つ |
| 定義されているが未使用のトークン | **19 / 135（14%）** | API面の肥大化 |
| コンポーネント規則内のハードコード色 | **168**（`#hex` 51 + `rgba()` 117） | トークン採用率低 |
| JSインライン `style:{...}` | **173**（7/15ファイル、182値） | クラス化の未完了 |
| 2pxグリッド外の角丸値 | 4種（`3px`×9, `1px`, `99px`×2, `999px`×16） | スケール崩壊 |
| 同心円違反の入れ子 | **25組 / 8ファイル** | 見た目の崩れ |
| 2px固定pxフォントサイズ | 116（**すべて**がpx。`rem` 0） | ズーム非対応 |
| 320px未満のブレークポイント | **0**（最狭420px） | 低幅対応なし |
| フォント重み未ロード | `800` を4中使用／`600` を2ファミリーで不使用 | 合成ボールド |

---

## 0.5 参照したデザインリソースと採否判断

ユーザー提供URL 2件から該当リソースを確認した。**全盲目的に採用はしない** — 「アーキテクチャを壊さない」という制約で採否を分ける。

### 采纳: スキル（URL 1 — Athrix `@athrix_codes`）

スキルは**コンテキスト（指示書）**であって依存ではない。よって**アーキテクチャ上のコストゼロ**で導入できる。

| スキル | 状態 | 判定 |
|---|---|---|
| `jakubkrehel/skills`（"Make interfaces feel better" / URL1 #2・#8） | **既にグローバル導入済** | ✅ 完了。追加対応不要 |
| **`microsoft/playwright-cli`**（URL1 #3） | 未導入 | ✅ **最優先で導入**。下記のとおり本計画の最大の空白を埋める |
| `ibelick` accessibility（URL1 #5） | `better-accessibility` を導入済 | 🔶 差分確認後に追加判断 |
| `emilkowalski` design eng（URL1 #1） | 未導入 | 🔶 Motion以外の設計判断で重複の可能性 |
| `raphael` 12 principles of animation（URL1 #6） | 未導入 | 🔶 `transition:all` は 32件を実測し全て置換済み・reduced-motion もガード済み |
| `shadcn-ui`（URL1 #7） | — | ❌ **不採用**（下記「却下」参照） |
| `million/react-doctor`（URL1 #4） | **URL未検証**（推測パスは404） | 🔶 実パス未確認。React 診断は価値ありだが、URLを確認してから |

#### `playwright-cli` が埋める空白（本計画最大の弱点）

本計画は全章で **「レンダリング検証は未実施」** と明記した。`playwright-cli` はその空白を直接埋める：

| コマンド | 本計画での用途 | 対応する指摘 |
|---|---|---|
| `playwright-cli open --device="iPhone 15"` / `--mobile` | モバイル実機レイアウト検証 | 320pxブレークポイント無し、650px帯の未対応 |
| `playwright-cli resize 1920 1080` / 320 720 | レスポンシブ検証 | §Phase 4 全体 |
| `playwright-cli set-reduced-motion reduce` | **Motion 検証** | 監査は「CSSガードはJSの明示behaviorを上書きしない」と判定。実挙動を測る必要がある |
| `playwright-cli set-forced-colors active` | **強制色モード検証** | `outline:none` 18箇所の代替フォーカスリング存否 |
| `playwright-cli set-contrast more` | 高コントラスト検証 | 同上 |
| `playwright-cli snapshot --boxes` | **ヒット領域24×24pxの機械検証** | WCAG 2.5.8 を主観ではなく数値で |
| `playwright-cli console` / `requests` | 実行時エラー検出 | ブート経路・404データ |
| `playwright-cli eval` | 計算済みスタイルの取得 | 角丸・transition実値の確認 |
| **`playwright-cli show --annotate`** | **ユーザーによる実ページアノテーション** | 公式に「UI review / design feedback を求められたら使う」と明記されている。視覚wzglądの主観評価をユーザーが直接行える |
| `playwright-cli screenshot --attach` | `gh pr comment --attach` でPRに添付 | 視覚回帰の証跡 |

> **Windows注意（公式記載）**: `&` は PowerShell で区切りとして扱われるため、`playwright-cli --% goto "url?a=1&b=2"` のようにエスケープが必要。

#### 追加で発見した極小スキル（監査所見と1:1で対応）

ui-skills.com のカタログに、本監査の指摘に**直接対応する**単一原則スキルが並んでいた。実装時に個別導入すると効率的：

| 極小スキル | 本監査の該当所見 |
|---|---|
| **Match border radius on nested elements** | 同心円違反 **25組**（`v65r29:81,85,86` / `v52:396,424` / `v56:1531,1555,1592` ほか） |
| **Use 44px touch targets for accessibility** | ヒット領域 未計測（`playwright-cli snapshot --boxes` と併用） |
| **Align numbers with tabular-nums** | `sections.css:315→v52:145` で `.deck-dice-idx` の等幅数字がプロポーショナル字体に化けた |
| **Prevent layout shifts with aspect ratio** | 固定px高さの入力系（`height:32px` 等）多数 |
| **Balance heading text for easier reading** | 見出し構造の破綻（`SectionTitle` が span） |
| **Add scale feedback to pressed buttons** | `transition:all` にPress時の `transform` 反応が未定義 |

### 却下: UIライブラリ（URL 2 — Kasun `@kasuncfdo`）

`uiarc` / `spaceui` / `componentry` / `skecher ui` / `planes` / `beUI` はいずれも**ビルドステップを要求する**。

**実測証拠**: `uiarc.dev`（Arc UI）を実際に取得したところrocytes ->
> "Run the **shadcn CLI** on its page, or copy the source."
> "Add them with the shadcn CLI, or point your AI tool at the docs"

shadcn CLI は Tailwind + モジュールバンドラ前提であり、**本リポジトリの核心的制約「build stepなし・GitHub Pages配信・`vendor/react.min.js` を `<script>` 直読み」に正面から衝突する**。

| 制約 | 本リポジトリの reality |
|---|---|
| ビルドステップ | **なし**（AGENTS.md 明确规定） |
| 配信 | GitHub Pages に静的ファイルのまま |
| React | `vendor/react.min.js` を `<script>` で直読み |
| データ | `data/db.json` 474KB を `fetch` |
| バージョン管理 | `?v=65r69` クエリによるキャッシュバスティング |

**判定: 一括採用は却下。** ただし「look expensive」な見た目の**設計思想は参照価値がある**ため、以下を**依存せずに**採用する：

| 参照元 | 取り入れるもの（コード依存なし） |
|---|---|
| Arc UI / beUI | 「Text that animates in」の blur/word/line/wipe を見出しの段階表示に。既存の reduced-motion ガードと必ず併用 |
| spaceui / planes | MotionComponents に対する「保証ベース」の考え方 → `--t-*` / `--e-*` トークンで速度を一元管理（現状 `--control-radius` のようにbakuhatsuした定義 enfrentar） |
| componentry | 「コンポーネントが持つべき状態（empty/loading/error/disabled/narrow）」のチェックリスト → 監査で見落とした状態の洗い出しに使う |

> **推奨**: 視覚汚染ogens を**牵引abrasない**こと。既存テーマ（真鍮/時計機構のdark、6フォント、`--gold`/`--accent` 配色）を壊す派手なonomic library は入れない。プロレベルで挙動を壊すくらいなら現状のトークン体系を固める方が費用対効果が高い。

### `react-doctor` 実測結果 — **採用しない**

2026-10-01 に `npx react-doctor@latest` を実行し、**全所見を実読して真偽判定した**。

```
Score 70/100 "Needs work" · 57 warnings · 0 errors · 18 files
reactDetected: false
No supported framework or library detected — library-specific rules were gated off
```

#### 致命的制約1: React/JSX系ルールが全滅

`package.json` が無く `vendor/react.min.js` を `<script>` 直読みしているため、React 専用ルールが実行されない。
`design --verbose` は **「No issues found!」と出したが偽陰性**。本計画が最重要視している
アクセシビリティ80件（`Field` のlabel、`SectionTitle` のspan、フォーカストラップ欠落）は
react-doctor には**構造的に見えない**。

#### 致命的制約2: 採用候補21件を実読した結果 **全件偽陽性**

| ルール | 件数 | 実読判定 |
|---|---|---|
| `unsafe-json-in-html` | 2 | **偽陽性×2**。`ogp-gateway/worker.mjs:200,212`。対象は `shareTarget()` の出力で、攻撃者制御可能な `?s=` は `encodeURIComponent` 済み（`<`→`%3C`, `>`→`%3E` 実測）。`</script>`  breakout 不可能。開発者は HTML属性に `htmlEscape`、JS文脈に `JSON.stringify` と**文脈比利の正解**を実装済み |
| `no-create-object-url-without-revoke` | 5 | **偽陽性×5**。全件に revoke  existent。`App.js:210`→`214`, `App.js:231`→`235`, `generator.js:1892`→`1899`(try/catch), `generator.js:2048`→`2051`, `OtherSections.js:56`→`101`(**`finally` 内**＝正解パターン）。`a.href` 経由のため静的に証明できず誤検出 |
| `no-document-write` | 1 | **意図的かつ正しい**。`share-viewer.js:79-82` は `buildShareSheetHTML` を**先に**生成してから `document.open()/write()/close()`。理由が76-78行に日本語コメントで明記。修正すると共有ビューアが壊れる |
| `js-set-map-lookups` | 12 | **混合**。`state.js:34,67` は実際に `evidence.includes()` をループ内で使用（`Set`化は `known` 側に既実施）で実害の疑いあり。他は `App.js:260` のように単発検証で影響軽微 |
| `js-hoist-intl` | 1 | **軽微だが実在**。`OtherSections.js:1527` が `sortRosterLibraryItems` 呼び出し毎に `new Intl.Collator` を生成 |

**判定: CIゲートとしての採用は却下。** 理由:
1. 価値最高的（React/a11y）ルールが動かない
2. 判断を要するルール（security/memory）は **21/21 偽陽性** — 誤警報で信頼を損なう
3. 残る性能ルールは影響軽微

**部分的採用**: `js-set-map-lookups` の `state.js:34,67` のみを持股し、`js-hoist-intl` と共に「UI計画とは独立した性能批次」として任意で着手。`no-json-parse-stringify-clone` は本番11件のみ保留。

> `npx react-doctor install` は `package.json` を生成し build step 禁止の制約に反するため**実行しない**。`npx -y react-doctor@latest` の-ephemeral実行のみ許可。

### 追加導入候補（2026-10-01 実測・build step不要）

| パッケージ | バージョン | 判定 |
|---|---|---|
| **`@axe-core/playwright`** | 4.13.0 | ✅ **最優先**。既に導入済みの `@playwright/mcp` にaxe ルールを注入できる。**本計画のアクセシビリティ80件を機械検証できる唯一の手段** |
| `pa11y` | 10.0.0 | 🔶 a11y回帰のCLI。axe-core/playwrightと重複ergent |
| `lighthouse` | 13.5.0 | 🔶 Core Web Vitals + a11y監査 |
| `@lhci/cli` | 0.15.1 | 🔶 CI用。Lighthouse結果の管理 |
| `@modelcontextprotocol/server-sequential-thinking` | 2026.8.31 | ❌ 不要。本計画に構造的推論は不要 |
| `@modelcontextprotocol/server-memory` | 2026.8.31 | ❌ 不要。`persistent-progress` スキルで足りる |
| `@modelcontextprotocol/server-filesystem` | 2026.8.31 | ❌ 不要。標準ファイルツールで足りる |
| `@axe-core/mcp` | — | ❌ **404 で実在しない**（推測を排除） |

### 技術的知見（2026-10-01 時点）

- **コンテナクエリ**: 2023-02から Baseline Widely Available。**本番安全に使える**。本計画 Phase 4 の responsive 実装に適用可
- **`@scope`**: 2025-12から Newly Available（Chrome/Edge 118+, Safari 17.4+, Firefox 146+）。**旧Firefoxのみがgap**。`v56-refinements.css` の版数別オーバーレイ eternal に部分的に適用可だが、Firefox 146未満を切る判断が必要
- **スタイルクエリ `@container style()`**: Firefox 151+ のみ。**本番非対応**。採用しない
- **WCAG 2.2 が現行基準**（2023-10 W3C Rec、2024-12 追補）。ADA / Section 508 / EN 301 549 / EAA が参照中
- **WCAG 3.0 は Working Draft のまま**（2026-09時点、2021年から CR/PR/REC なし）。A/AA/AAA の3段階を廃止し6段階の累积報告Introducing。**引用不可**

---

## 1. 最重要洞察：5つの系統的根原因

監査全体の **約70%** は以下5箇所の修正で消える。個別対応はombs的原因を踏襲する。

| # | 場所 | 症状 | 修正 | 消える件数 |
|---|---|---|---|---|
| **A** | `js/ui.js:150` `Field` | `<label>`が`htmlFor`なしで**兄弟要素**。制御をラップしていない | `htmlFor`+生成`id`、または`children`をlabel内にマーク | **45**（Form labels HIGH 16含む） |
| **B** | `js/ui.js:113` `SectionTitle` | 全11セクションの見出しが`<span>`。`<h1>`が**1つも無い** | `h2`（または`h1`）へ変更 | **5**（見出し構造 HIGH 2含む） |
| **C** | `js/App.js:287` `UtilitySheet` | **唯一正しい**フォーカストラップ/Escape/復元実装（L289–314, L368–379） | CommandPalette(L120)・import(L541)・QualityInspector(DataQuality L108)・PersonaDraft(L643)へ**コピー** | **5 HIGH** |
| **D** | `js/ui.js:71` `toast()` | `role`/`aria-live`が無く、**約90箇所の呼び出しが全部無言** | 要素生成3行に `role="status"` + `aria-live="polite"` + `aria-atomic="true"` | **1 HIGH**（+全toastの可読性） |
| **E** | `div.p-card` / `.spirit-item` / `.ego-slot` / `.spp-item` | ネイティブ`<button>`でないクリック対象17件 | `<button type="button">`へ置換。`role="button"`既設2件（`PersonaCodex.js:137`, `OtherSections.js:1688`）には`onKeyDown`追加 | **10 HIGH** |

> **注意**: `PersonaCodex.js:137` は `role="button"` + `tabIndex:0` だが `onKeyDown` が無い＝**フォーカスされるが押せない**。アプリ最重要要素（人格カード）なので最優先。

---

## 2. フェーズ構成（推奨順）

依存関係とロールバック容易さで並べている。**各フェーズは独立コミット可能**。

---

### Phase 0 — 即時バグと死コードの削除（低リスク・即座に価値）

**目的**: 誤 색 표시・死んだコード・明白なカスケード破損を除去。後続フェーズの混乱原因を掃清。

| # | 対応 | 場所 | 内容 |
|---|---|---|---|
| 0-1 | **誤色の実バグ** | `v56-refinements.css:747,750,751` | `var(--purple, var(--gold))` — `--purple` 未定義→**紫がgoldで描画中**。token定義 or `var(--accent)` へ |
| 0-2 | 完全複製ファイルを削除 | `v55-dante.css` 全体 + `index.html:16` | `v56-refinements.css:1–191` が190行**完全一致コピー**。−10,206 B・−1リクエスト |
| 0-3 | 未リンクの代替テーマを隔離 | `v54-limbus.css` 全体 | index/share/mobile から未参照・`@import` なし。`docs/experiments/v54-limbus.css.txt` へ移動。**1リンク追加で全アプリ再配色される地雷** |
| 0-4 | 6箇所の`:root`を1つに | `design-system.css:165-178` / `v53:147-154` / `v56:41,376` | 第2`:root`が8トークンを別パレットで上書き。`v53`が全6`--res-*`を再定義（design-system側の`--res-*`は100%死骸）。`--control-radius:6px`を`--r-md`として昇格 |
| 0-5 | 死んだ`var()` fallback削除 | `items.css` 全体 / `v53:496,497,511,728` / `v56:747`他 | 51箇所はfallbackが常に勝つ。`items.css`は**6トークン全て未定義**（`--panel`,`--tx-1`,`--font-mono`…）で実質100%リテラル。真のトークン名へ張り替え |
| 0-6 | `--f-serif` / `IBM Plex Mono` の読み込み判断 | `index.html:9` | Cormorant Garamond(3重み)+Noto Serif JP(2重み)が**計3用途のみ**。IBM Plex Mono(2重み)は`items.css`の壊れたfallbackで1回のみ使用 |
| 0-7 | 合成ボールドを解消 | `design-system.css:649,707` / `persona-codex.css:841` / `v56:263,343` | `font-weight:800` を4件使用だが**どのファミリーも800をロードしていない**。Noto Sans/Serif JPは600未ロード。→700へスナップ or ロード追加 |

**工数見積**: 0.5–1日 / **テスト影響なし**（見た目のみ、ただし0-1と0-4は色が変わる）

---

### フォント実測と「宣言の削減」（2026-10-02）

#### 実測値

| 項目 | 値 |
|---|---|
| フォント要求 合計 | 91 req / 3,078 KB |
| Noto Sans JP 700 | 83 req / 2,777 KB（90.2%） |
| Noto Serif JP 700 | 3 req / 155 KB |
| コーポレート・ロゴ（self-hosted） | 2 req / 81 KB |
| Cormorant Garamond 700 | 1 req / 37 KB |
| IBM Plex Mono 400 | 1 req / 14 KB |
| Share Tech Mono 400 | 1 req / 13 KB |

#### 宣言を削っても転送量は減らない

Rajdhani の全 4 ウェイト、Noto Sans JP 500、IBM Plex Mono 500 は**要求が 0**。
つまり既に 1 バイトも落ちておらず、宣言から除いても
**req 91→91、3,078 KB→3,078 KB** だった（測定: `tools/ui/measure-font-trim.mjs`）。
css2 の応答だけが 573 KB→455 KB になるが、これは未圧縮のサイズで、
転送経路では gzip されるため利得は小さい。

**このとき「7%、約 0.21 MB 削減になる」と報告したが誤りだった。**
原因は当時の監査スクリプトが引用符付きの `url('...')` を取り逃がし、
ダウンロードしたファイルを family に紐付けられていなかったこと。
Noto Serif JP 700 を「文字数ゼロ＝未使用」と誤判定しており、
実際には 155 KB 落ちている。

判定を訂正した上で**削減する変更自体は採用していない**。転送量は 0 で、
レール表示に約 1,000 px の描画差が出たため。
IBM Plex Mono 400 は残す。`Share Tech Mono` に無い記号（↑↓ や ─ など）を
担当しており、使用中のため。

#### 併せて修正したハーネスの欠陥

`tools/ui/harness.mjs` の `captureSections` は `document.fonts.ready` を待たずに
固定 sleep で撮影していた。`font-display: swap` のため、フォント未ロード時の
代替書体で撮れることがあり、Google Fonts の応答が変わると読み込み順も変わる。
これが過去に「レールのドット 4px・delta 7/255 のサブピクセルノイズ」と
報告した差分の正体である可能性が高い。

`fontsSettled()` を追加し、描画中の要素が実際に使う書体を解決してから
撮影するようにした。同じコードを 2 回撮って自己比較したところ 12/12 一致。


### Phase 1 — アクセシビリティ系統根因（A–E）

**目的**: 80件中、約45件を5箇所の変更で解消。HIGH 25 → 約8。

| # | 対応 | 対応するHIGH |
|---|---|---|
| 1-1 | **A**: `Field` の label 関連付け | Form labels 系 16 HIGH |
| 1-2 | **B**: `SectionTitle` を `h2` 化 + `index.html` に `h1` 追加 | Heading 2 HIGH + ItemCodex h3スキップ |
| 1-3 | **C**: `UtilitySheet` の trap/Escape/復元を4ダイアログへ展開 | Dialog 5 HIGH |
| 1-4 | **D**: `toast()` に `role="status"` | Live region 1 HIGH |
| 1-5 | **E**: クリック対象 `div` → `<button>`（17件） | Native 17 HIGH |
| 1-6 | Skip to content リンク追加 | `App.js:541` 直前、**最初のフォーカス可能要素**として |
| 1-7 | icon-only ボタンに `aria-label` | `DataQuality.js:108`（無名）、`OtherSections.js:1264`（5個同名列）ほか |
| 1-8 | `item-row` の `role="listitem"` 削除 | `ItemCodex.js:92` — 全~700行が button ロールを失っている |
| 1-9 | `aria-pressed` を fav toggle に付与 | `PersonaCodex.js:150-160` — 状態が AT に伝わらない |
| 1-10 | 検索入力4件に `aria-label` | `App.js:201`, `OtherSections.js:488,1318`, `PersonaCodex.js:1072` |

**工数見積**: 2–3日 / **テスト影響あり**（DOM構造が変わるため既存スナップショット的テストの確認が必要）

---

### Phase 2 — CSSアーキテクチャ再建（カスケード層導入）

**目的**: バージョン名ファイルによる上書きレイヤー構造を根治。将来「新ファイル追加→上書き」の悪循環を断つ。

**採用案: CSS `@layer`（カスケード層）**

`@layer` は**レイヤー優先度がセレクタ特異度より上位**にblas。因此特异性ハックなしで優先順位を明示できる。全主要ブラウザ対応済み（Chrome 99 / Firefox 97 / Safari 15.4）。

```css
/* index.html 冒頭の1ファイルで順序を固定 */
@import url('assets/tokens.css')      layer(tokens);
@import url('assets/base.css')        layer(base);      /* reset, typography */
@import url('assets/layout.css')      layer(layout);    /* app shell, rail, topbar */
@import url('assets/components.css')  layer(components);
@import url('assets/overrides.css')   layer(overrides);
@import url('assets/utilities.css')   layer(utilities);
```

| ステップ | 内容 | 規模 |
|---|---|---|
| 2-1 | `:root` 1本化（0-4の延長）＋死んだtoken 19個削除、`--shadow-*` の実使用開始 | 30分 |
| 2-2 | 6 `:root` → `tokens.css` 1ファイルに集約 | 1時間 |
| 2-3 | `base` / `layout` / `components` へ既存13ファイルの再割当（ファイル分割は不要、`@layer` ブロックで包むだけでよい） | 3–4時間 |
| 2-4 | **`!important` 136行の削減** — `v56:553` の `.es-actions > div[style*="flex"]{display:none!important}` は React インラインstyleを潰すためだけに存在。Phase 1-5(styleprop削減)と連動 | 4–6時間 |
| 2-5 | `inset 0 0 0 1px` の擬似ボーダー6箇所 → 本物の `border` に | 1時間 |
| 2-6 | 影の46件リテラルを `--shadow-1/2/3/inset/focus` の合成に | 2時間 |
| 2-7 | JSインラインstyle 173件 → クラス化（`fontSize` 43件が最優先、`--fs-*` へ） | 1–2日 |

**工数見積**: 3–4日 / **テスト影響: 見た目が変わるため要视觉回帰確認**

---

### Phase 3 — ビジュアルポリッシュ（`better-ui` 準拠）

| # | 対応 | 場所 | 内容 |
|---|---|---|---|
| 3-1 | **`transition: all` 32件を明示的プロパティ指定に置換** | `design-system` 4 / `workspace` 7 / `persona-codex` 3 / `sections` 15 / `v52` 3 / `v53` 1 | 監査で各セレクタが実際に変化させるプロパティを確定済み。置換表は監査出力 §4 に正確な形で存在 |
| 3-2 | 角丸スケールの再構築 | 全体 | `--r-pill:999px` を新設し`99px` 2箇所を統合。`3px`×9 と `1px` を `--r-sm`/`--r` へスナップ |
| 3-3 | **同心円違反 25組の修正** | `v65r29:81,85,86` / `v52:396,424` / `v56:1531,1555,1592` / `v52:818,832,849,858,866` / `v53:835,853` | ⚠️ **実測では違反 0 組**。下記「3-3 の実測」を参照。記載された行番号は入れ子の想定に基づく静的推測で、実測では該当する入れ子が検出されないため修正対象なし |
| 3-4 | 「影=立体／線=構造」の契約徹底 | 31箇所の1pxborderを影に / 5箇所の1px影を線に | ✅ 実質完了。`2-5` で border が既にある要素の擬似ボーダー3箇所を border 化（重複線を解消）、`2-6` で繰り返し影15宣言をトークン化。残る 1px inset 5箇所は内側ハイライトとして意図的であることを確認済み |
| 3-5 | JS側 `scrollIntoView({behavior:"smooth"})` 6箇所の reduced-motion ガード | `PersonaCodex.js` | ✅ `733ed39`。`ui.js` に `scrollBehavior()` を追加し6箇所が通過。CSSの `scroll-behavior: auto` はJSの明示behaviorを上書きしないため分岐が必要 |
| 3-6 | 共有シート（`generator.js:1581-1593`）に reduced-motion ガード | 独立ドキュメントのため `assets/*.css` を継承しない | ✅ `371ec1e`。生成シートに独自ガードを追加。アプリ内モーダルの無限スピナーは `design-system.css` のガードに `animation-iteration-count` が無く停止していなかったため併せて修正 |
| 3-7 | `Icon` に `aria-hidden` + `focusable="false"` | `ui.js:17-18` | ✅ 実装済み（`d285d70`）。約200個のSVGが AT にノイズ |

### 3-1 の実測（`db1d352`）

`transition: all` は当初 33件と書かれていたが実測で **32件**。各セレクタの状態ルール（`:hover` / `.is-*` / `[data-*]` / `:disabled`）を全ファイル横断で突き合わせ、状態が変わらないプロパティのみを除いた。
 layer をまたいだ状態ルールとグループ化セレクタ（`.btn:hover, .x:hover`）の分割が必要で、途中 2 回推論を誤っている。

**注意点**: `transition` ショートハンドはカンマ区切り 1 項目につきプロパティ 1 つ。`transition: color, background 0.12s ease` では末尾 1 つしかアニメーションしない（他は duration 0s）。各プロパティに時間を付ける必要がある。

### 3-3 の実測（重要: plan の記載は誤り）

plan の「25組」は CSS の行番号を静的推測して列挙したもので、**実測では本物の同心円違反は 0 組**。

判定条件（DOM 実測）:
1. 親に `border-radius > 0` があり四辺に正の padding がある
2. 子が親矩形の内側に完全に収まる
3. 子が自分の border を持たない（独立したコントロールではない）
4. 子の背景色が親と同一（親の面の一部として見える）
5. `|子 radius - (親 radius - padding)| > 0.5px`

この条件で走査すると候補は 3 組のみで、いずれも「親の内側に自分の線と塗りを持つ独立コントロール」（`.chip > span` / `.codex-filters > .segmented` / `.dnd-row > .dnd-handle`）で、意図的な角丸。**検出器の陽性コントロール（親16px/padding12px に子里16px を注入）でも検出は機能することを確認済み**。

### 3-2 の実測

`border-radius` は 25 種類 / 251 宣言。2 段階に分けた。
- **Stage A（完全不変）**: `--r-pill: 999px` を新設し `999px`16件と `99px`2件を統合。`2px`26件→`--r-sm`、`4px`4件→`--r`、`0`4件→`--r-none`。52宣言。12/12 ピクセル一致
- **Stage B（1px の変化）**: `3px`10件と `1px`1件を `--r-sm` へ。描画されるセレクタは 4 件（`.brand-author` / `.cond-chip` / `.reorder-btn` / `.dnd-handle`）で 3px→2px。`6px` は 2/4/8 刻みの中間値として尺度内とみなして対象外

---

### Phase 4 — レスポンシブ／ズーム耐性

| # | 対応 | 内容 |
|---|---|---|
| 4-1 | **`body{overflow:hidden}` 問題** | `design-system.css:190-200` + `workspace.css:13-16`。全幅・全ズームでページスクロール不能。グリッド外は**恒久的に到達不能**。`min-height:100%` + 狭幅時のみ `overflow:clip` |
| 4-2 | グリッド列幅の可変化 | `workspace.css:8` `68px 1fr 360px` = 固定428px。`clamp()` 化 |
| 4-3 | 900px / 420px ブレークポイント追加 | 200%ズーム時、1440px画面→720px CSS では640pxブラkpOYOUTに**当たらない** |
| 4-4 | 入力系 `height` → `min-height` | `.deck-dice-var-input` 32px / `.item-quantity-input` 26px / `.item-search input` 28px などがズーム時にクリップ |
| 4-5 | `overflow:hidden` + `text-overflow` 無しなテキスト容器 約18件 | `min-width:0` + `overflow-wrap:anywhere` を追加。`.p-name` / `.ego-overview-name` はユーザー入力可 |
| 4-6 | `overflow:hidden` が7箇所のレスポンシブブロックで**クリップを追加** | `overflow:clip` + 内部スクロールへ |

---

## 3. 検証計画

### 導入前：検証手段確立（最優先・Phase 0 と同時）

> ✅ **2026-10-01 更新: 構築済み。** 以下は当初の計画。

現状の唯一の検証手段は `cmd /c "node --test tests\*.test.mjs"`（VMベースのDOMなし）。
`tools/provenance/pipeline-harness.mjs` はあるが、**ブラウザ描画の検証手段は存在しない**。

したがって最初に **`@playwright/cli` をグローバル導入**し、検証基盤を作る：

```powershell
npm install -g @playwright/cli@latest
playwright-cli open https://lbtstudio.github.io/LIMBUS_BUILD_TERMINAL/
```

`tools/ui/` に以下を置く（リポジトリに含めるか `.gitignore` 対象かは要判断）：

| スクリプト | 目的 |
|---|---|
| `tools/ui/snapshot-a11y.mjs` | `--snapshot --boxes` でヒット領域24×44pxを機械検証 |
| `tools/ui/check-motion.mjs` | `--set-reduced-motion reduce` で Motion が死んでいるか検証 |
| `tools/ui/check-forced-colors.mjs` | `--set-forced-colors active` で `outline:none` 18箇所の代替リング存否を検証 |
| `tools/ui/responsive-matrix.mjs` | 320 / 480 / 720 / 1080 / 1440 px を機械走査 |

### 各フェーズ timelines の必須検証

| フェーズ | 必須検証 |
|---|---|
| Phase 0-1（`--purple`の誤色） | `playwright-cli open` → 影響エディタを目視。色が変わっていないか |
| Phase 0 全体 | index / share / mobile の3ページを実際に開いて目視 |
| Phase 1 | キーボードのみ全フロー完走。Tab順序・Escape・フォーカス復元。`--snapshot` で読み上げ名確認 |
| Phase 1-5（`div`→`button`） | ItemCodex は700行超。`--snapshot` の**前後diff**で回帰検出 |
| Phase 2（`@layer`） | 全ページ目視回帰。1ファイルずつ `git diff` 確認 |
| Phase 3 | `--set-reduced-motion reduce` でMotion死の検証。ホバー遷移の実測 |
| Phase 3-1（`transition:all`） | hover時に`width/height/padding`が補間されていないことを DevTools で確認 |
| Phase 4 | `--resize 320 720` ＋ `--device="iPhone 15"` ＋ 高さ500px の3条件 |
| 全フェーズ | `cmd /c "node --test tests\*.test.mjs"`（`unified-provenance` は Python依存で既知3fail。除外して260 pass） |

**視覚変更を伴う全Phase 1以降は、`playwright-cli screenshot` の前／後ペアを `gh pr comment --attach` で PR に残す。**

### 検証できなかった項目（本計画作成時点・诚实的申告）

以下は**現時点で未検証**であり、着手前に `playwright-cli` で確認する:

- 実際のヒット領域実寸（WCAG 2.5.8 の24×24pxbaseline）
- `outline:none` 18箇所に**真の代替フォーカスリングが存在するか**（CSS静査では `:focus-visible` の有無のみ確認、視覚的存在は未確認）
- 320px幅での実際の横スクロール発生有無
- `body{overflow:hidden}` により**到達不能になっている領域の実在**
- 共有シート（`generator.js` 出力）の実描画・改行
- Motionの実測値（10%速度再生）
- `million/react-doctor` スキルの実パス（推測URLは404だったため未確認）


---

## 4. リスクとロールバック

| リスク | 影響 | 対策 |
|---|---|---|
| Phase 2 のカスケード層導入で意図しない見た目変化 | 重大 | `@layer` 導入は**1ファイルずつ**。各ステップで `git diff` と目視確認 |
| Phase 1-5 で `div`→`button` 化するとデフォルトスタイルが変わる | 中 | `all:unset` + 明示再定義。ボタン数700超（ItemCodex）の一括変更は危険なので**1ファイルずつ** |
| `!important` 削減で局所的な見た目崩れ | 中 | 1件ずつ、`git diff` で差分確認 |
| フェーズ数が多い | — | **Phase 0 と 1-A（`Field`のlabelのみ）は単独で完了・push可能**。从这里開始推奨 |

---

## 5. 推奨する着手順（2026-10-01 機械検証で再編）

### 5.0 検証手段の確立 — **完了**

`@playwright/mcp` をグローバルMCPへ追加。Chromium 導入済み。
`docs/` ではなく `~/.config/opencode` 側に harness を置く判断は、ツールが本リポジトリの
成果物ではなく**リポジトリ非依存の検証基盤**であるため。

### 5.1 実装順序の原則（機械検証で判明したimportant教訓）

| 原則 | 根拠 |
|---|---|
| **axe の node 数で優先度を決める** | 静的監査の「HIGH/MEDIUM/LOW」主観分類より信頼性が高い。`nested-interactive` 145件は静的監査が**完全に漏らしていた**が、axeで即座に最上位と判明した |
| **「1行修正でN件解消」を信用しない** | `Field` の label 修正は45箇所に適用できそうだったが、axe の `select-name` 4件は**別コンポーネント**（`.codex-sort`）だった。DOM probe（`generatedIds: 0`）で**自分の誤りを検出**した |
| **「静的監査の件数」をそのまま修正対象にしない** | 3-3 の「同心円違反 25組」は CSS 行番号からの推測で、DOM 実測では **0 組**。検出器の陽性コントロールを取ってから「0件」と結論した |
| **DOM再構成後は必ず操作回帰を検証する** | stretched-link 化は「星を押しても選択されない」ことをブラウザで実測するまで未完成 |

### 5.2 実行順（上位ほど認証された内容）

| 順序 | 作業 | 状態 |
|---|---|---|
| 1 | `nested-interactive` 145件を再設計（stretched-link化） | ✅ `cb44e3b` |
| 2 | `target-size` 8件（`.p-fav` 20→24px） | ✅ `cb44e3b` |
| 3 | `Field` の label 関連付け（`ui.js:150`） | ✅ `43c2268` |
| 4 | `select-name` CRITICAL 4件（`.codex-sort` ×4 + `cp-input`） | ✅ `43c2268` |
| 5 | **Phase 1-3**: コマンドパレットを dialog 化 + Tab trap / Escape / focus 復元 | ✅ `f5fb285` |
| 6 | **Phase 1-2**: 見出し階層の是正 | ✅ `d285d70`（axe 0 で解消） |
| 7 | **Phase 1-4**: `toast()` に `role="status"` / `aria-live` / `aria-atomic` | ✅ `9c23a2d` |
| 8 | **Phase 1-6**: Skip to content リンク | ✅ `9c23a2d` |
| 9 | `SkillDeck.js:211-221` の独自 `<label>` 群 | ⬜ |
| 10 | `OtherSections.js:579,610` のダイス`<label>` | ⬜ |
| 11 | **Phase 0-1**: `--purple` の誤色バグ（`--ego-influence` として定義） | ✅ `44c496b` |
| 12 | `color-contrast` 2件（`.count`, `.preview-hint`） | ✅ `d285d70` |
| 13 | `aria-prohibited-attr`（`.brand-author`） | ✅ `d285d70` |
| 14 | `label-title-only` 1件（`input[type=checkbox]`） | ✅ `d285d70` |
| 15 | Phase 0 残り（`v55-dante.css` 削除、`v54-limbus.css` 隔離、`:root` 1本化） | ✅ `74b7c91` / `91ff208` / `1a59d7a` |
| 16 | Phase 2（`@layer` 導入・`!important` 撤去・トークン集約） | ✅ `1428c6a` / `35bc076` / `6b1520e` / `2f06d99` / `5399ced` |
| 17 | Phase 3（`transition: all` 撤去・角丸スケール・reduced-motion） | ✅ `db1d352` / `733ed39` / `371ec1e` / `49c2b1b` / `7e7c228` |
| 18 | Phase 4（レスポンシブ・ズーム耐性） | ⬜ 残 |

### 5.3 残っている axe 違反

> ✅ **2026-10-01 追記: 全解消。** 現在は **0 rules / 0 nodes**（`d285d70` 以降、12セクション走査で維持）。
> passes 42 / incomplete 2。以下の表は当时的記録であり、現状は残っていない。

<details>
<summary>当時の記録（2026-10-01 時点・6 rules / 7 nodes）</summary>

| 重大度 | 規則 | nodes | 対象 | 対応する順序 |
|---|---|---|---|---|
| SERIOUS | `aria-prohibited-attr` | 1 | `.brand-author` | 13 |
| SERIOUS | `color-contrast` | 2 | `.count`, `.preview-hint` | 12 |
| SERIOUS | `label-title-only` | 1 | `input[type=checkbox]` | 14 |
| MODERATE | `page-has-heading-one` | 1 | `html` | 6 |
| MODERATE | `region` | 1 | `.cp-overlay` | 5 |
| SERIOUS | `scrollable-region-focusable` | 1 | `.cp-list` | 5 |

> `region` と `scrollable-region-focusable` の両方が `.cp-overlay` / `.cp-list`（コマンドパレット）を
> 指している。順序5のダイアログtrap実装で同時に解消される見込み。

</details>

### 5.4 残存する未名付けコントロール（Field ではない独自マークアップ）

> ✅ **2026-10-01 追記: 全解消。** `7bcdd33` で全12セクションを走査し、未名付け **0**・orphan label **0**・duplicate id **0** を確認。axe も `label` 系で 0。

<details>
<summary>当時の記録（ブラウザ実測で6セクションを走査した結果）</summary>

ブラウザ実測で6セクションを走査した結果、`Field` を使うのはパッシブセクションのみで、
以下は独自 `<label>` マークアップ：

| 画面 | controls | named | 未名付け |
|---|---|---|---|
| パッシブ | 8 | 6 | 2 |
| スキル | 3 | 1 | 2 |
| サポート | 6 | 1 | 5 |
| E.G.O | 4 | 1 | 3 |
| 精神 | 4 | 1 | 3 |
| 強化 | 3 | 1 | 2 |

大半が `SkillDeck.js:211-221` と `OtherSections.js:579,610` の独自 `<label>` 群。

</details>

---

## 付録: 未解決・要判断

### 2026-10-02 解決済み

- ✅ `--info` は削除（`ca3140e` 相当のコミットで参照ゼロ・`--rank-TETH` と同値だったことを確認）
- ✅ `share-link.js` の OGPカード色は `OGP_CARD_COLORS` に集約（17キー全て使用・関数内リテラル0）
- ✅ `tools/ui/` の検証スクリプトはリポジトリに commit 済み
- ✅ `--fs-*` は rem 化済み（既定16px ではピクセル同一、ブラウザの文字サイズ設定に追従）
- ✅ **`?v=` をファイル内容ハッシュへ自動同期**（`tools/sync-asset-versions.mjs` + `tests/asset-version-sync.test.mjs`）

#### `?v=` の一括同期 — 2026-10-02

手動 bump が繰り返し漏れていたので、**版をファイル内容の sha256（先頭8桁）に置き換え**た。

- **参照 37 箇所 / アセット 31 件**：`index.html` 28、`share.html` 4、`js/share-viewer.js` 2（`data/db.json`）+ `index.html` 内の二重定義 3
- 従前は**9 つの版が併存**（`64r45`/`64r60`/`65r19`/`65r23`/`65r68`/`65r69`/`66r23`/`66r31`/`66r32`）。変更したファイルだけ bump するため、漏れたファイルだけ古い JS が残り直す運用になっていた
- ハッシュなら「ファイルを編集する＝URL が変わる」ので **bump し忘れるファイルが存在しない**
- `index.html` と `share.html` は同じファイルから同じハッシュを引くので、**版的食い違いは構造的に不可能**になった
- `index.html` の `data/db.json` は fetch と XHR に二重定義され 서로版がずれうる状態だったが、統一された
- `tools/sync-asset-versions.mjs --check` を `tests/asset-version-sync.test.mjs` から呼ぶので、**同期し忘れるとテストが落ちる**

**読み込み遅延について（実測）**：版は HTML に静的に書かれたままなので、**ブラウザ実行時に解決する処理はゼロ**。実行時解決だと `<link>`/`<script>` を JS で注入することになり、CSS はレンダリング-blocking を失って FOUC が出るうえ、`index.html` の 28 タグは `defer`/`async` がなく逐次直列化され、リクエスト数が増える。ハッシュは**コミット前に Node で書く**ので、遅延は発生しない。

コールドキャッシュ固定（`Network.setCacheDisabled(true)`）、3 回の中央値で A/B：

| 項目 | 旧（手動版） | 新（内容ハッシュ） |
|---|---|---|
| load 完了 | 245ms | 235ms |
| UI ready | 1495ms | 1511ms |
| FCP | 252ms | 248ms |
| リクエスト数 | 107 | 107 |
| **最大並列数** | **30** | **30** |
| 転送量 | 3,928,160 B | 3,928,253 B |

並列度 30 で同一、転送量は +93 B（URL が長くなった分）。**遅延はない**。

なお計測の初回は「改造前=コールド」「改造後=ウォード」で 4033ms→251ms と出たが、これはキャッシュ效果であって方式の差ではない（リクエスト数と転送量は完全に同一だった）。

強制全破棄したいときは `node tools/sync-asset-versions.mjs --all <token>`。

### 未解決・要判断

- `million/react-doctor` の実パス未確認。`ui-skills.com` の該当ページのURL の正確性をユーザーに確認したい
- UIライブラリ（uiarc / spaceui / componentry / skecher / planes / beUI）の**設計思想**の参考は採用を推奨するが、**コード依存は受け入れない**。既存テーマ（真鍮・時計機構の意匠）に寄せる
- OGP Worker の本番デプロイは 2026-10-02 実施済み（Version ID `80f09420-4aa7-4d30-8df8-5227c0cd6463`）。実測で `POST/PUT/DELETE → 405`、`s=3件 → 400`、`/s` は `MISS → HIT`、`cross_version_cache` はデプロイをまたいでも既存 cache（age=10952秒）が生き残ることを確認
- `--teal` は未定義のまま参照ゼロ。`--purple` は `--ego-influence` として再定義済み
- `share.html` と `index.html` の `?v=` は一致していなければならない。片方だけ bump すると発行側と閲覧側で別の revision が走る（実際に発生した）。**→ 2026-10-02、版の内容ハッシュ化で構造的に解消。`tests/asset-version-sync.test.mjs` が両者の一致を検証する**

