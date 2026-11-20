# 抽出演出（ガチャアニメーション）設計メモ

対象: LIMBUS BUILD TERMINAL の抽出（`GachaTicketsPanel`, `js/OtherSections.js`）。
参照演出: Limbus Company の「抽出」。特に **中央の鎖の球（center ball of chains）**。

このメモは実装前に承認を得るための設計。**承認までは配線しない**（`index.html` /
`OtherSections.js` を触らない）。実装物は独立ファイル + 単体プレビューで提示し、
利用者がプレビューで確認 → OK → 配線、の順で進める。

---

## 0. 参照演出の機構（一次情報）

出典: https://limbuscompany.wiki.gg/wiki/Extraction （本文取得済み）。

- 主役は**中央の鎖の球**。カードめくりではなく球が中心。
- 通常は **Orange/Black**。
- **開始時に Gold/Green/Blue で始まる**ことがある → その色のプールから上位が確定（＝引く前の先行テレグラフ）。
- **確定の最中に球が Gold/Green/Blue へ変わる**ことがある → 下位を上位へ昇格。
- 結果はアイコン表示（1★/2★/3★ 人格, E.G.O, アナウンサー, 等）。

動きの実物はこちらで目視確認すること（このセッションでは画像入力非対応のため未確認）:
- https://www.youtube.com/playlist?list=PLqSxypHSESd4BvstD_0o4Pgh52EGkehrq
- Standard: https://youtu.be/JVQDQ6lMOd8 / 3★保証: https://youtu.be/q31rCaB2_sE

**機構は模倣可、描画・音は自作。** 原作の画像/ロゴ/SE は使わない（著作権）。
色・回転・収束・フラッシュという「手触り」だけを LBT のデザイン言語で再構成する。

### 0-1. 実フレームの数値解析（画像入力が使えないため、think-in-code で擬似目視）

YouTube の実フレーム（`1/2/3.jpg` = 25/50/75% 地点、`hq` 版 480x360）を 12+60 枚取得し、
ブロック毎の平均色・輝度・色相を texts 化して解析（`read` は画像非対応のため）。

- 画面は**ほぼ黒 + 暗赤**（黒 30–80%、base は `40,0,0` / `80,40,40`）。
- 主題は1つだけ明るく、**中央〜右**に置かれる。上下は黒帯（16:9 の横帯に収まる）。
- **主題色はプール毎に変わる**: 標準=橙/金/赤、W社=青/水色、EGO・一部=紫/マゼンタ、緑も。
- 横に走る**光帯**が複数フレームで確認できる。

→ v1（中央対称の明るい橙の球＋小さなテキスト片）はこの言語から外れていたため、
v2 で「暗赤ベース / プール毎テーマ色 / 鎖は暗い籠＋色リム / 横光帯 / 大判の枠付きカード」へ作り替え。

未確認: **抽選（charge）そのものの動き**は 3 フレーム/本では捕捉できず、目視も不可。
この部分は利用者の目視情報が要る。

---

## 1. 非交渉の制約

1. **公平性に非干渉**: 演出は `hits` を読むだけ。RNG / commit-reveal / drand / 署名に触らない。
   尺は固定で、乱数を使わない。
2. **偽の煽りをしない**: 色テレグラフと「昇格」は **実際の `hits` に上位が含まれるときだけ**出す。
   外れを煽るダークパターンは実装しない（＝決定論的に `hits` から導出）。
3. **reduced-motion**: 既存の全体ルール（`design-system.css` の
   `@media (prefers-reduced-motion: reduce)` が `--t-*:0ms` + `animation-iteration-count:1`）に従う。
   加えて JS も `matchMedia("(prefers-reduced-motion: reduce)")` を見て**即時 reveal**（移動なし、色キューは静的表示）。
4. **スキップ可能**: 任意の入力（click / Enter / Space / Escape）で即座に最終状態へ。
   演出は結果表示をブロックしない。
5. **追加依存ゼロ・ビルド不要**: CSS `@keyframes` + Web Animations API のみ。
   Framer Motion 等の npm 依存は持ち込まない（`react-design-engineering` skill §6 buildless）。
6. **既存レイヤ順を壊さない**: 新 CSS は `@layer gacha-extraction` を**末尾に加算**のみ（配線時）。

---

## 2. データ契約（既存で足りる）

抽出結果 `out = G.drawN(route, state, {pay, pack, times, seed})`:

```
out.hits: Hit[]        // 下記
out.kind, out.paidBy, out.ticketKind, out.ticketPack
```

`Hit`（`js/gacha-tickets.js` `hitOf` が生成）:

| フィールド | 値 |
|---|---|
| `type` | `"persona"` / `"ego"` / `"themePack"` |
| `mode` | persona のみ `"t"`（特異人格）/ `"n"`（通常） |
| `branch` | `"special"`（特異人格）/ `null` |
| `rank` | ego のみ |
| `no` / `name` / `pack` | 表示用 |

`plan(hits)` は以下を決定論的に算出（演出の唯一の入力）:

```
hasSpecial = hits.some(h => h.branch === "special" || (h.type === "persona" && h.mode === "t"))
hasEgo     = hits.some(h => h.type === "ego")
hasPack    = hits.some(h => h.type === "themePack")
tier       = hasSpecial ? 2 : (hasEgo || hasPack ? 1 : 0)   // 提案（要確認）
```

**テレグラフ**: `tier>0` のとき球を開始色 `tier` で開始。
**昇格**: `hits` の順序で「下位の後に上位が来る」場合のみ turn 演出を挿入。
いずれも `hits` から導出するので、演出が結果を左右しない。

---

## 3. 拍割り（beat）と尺

尺は CSS 変数 `--gx-*` を正本とし、ハードコードしない（reduced-motion で一括 0 化）。

| beat | 内容 | 既定尺 | reduced-motion |
|---|---|---|---|
| B0 charge | 暗転 + 球が出現・低速回転。開始色でテレグラフ | 0–600ms | 0ms |
| B1 spinup | 回転加速、鎖が収束、光が集まる | 600–1600ms | 0ms |
| B2 turn | 昇格（`hits` に上位が居るときのみ）。色変化 + フラッシュ | 1600–2000ms | 0ms |
| B3 burst | 白フラッシュ → 球が弾ける | 2000–2400ms | 0ms |
| B4 reveal | `hits` を順次表示（10連はスタッガー、単発はフリップ） | 2400ms– | 即時 |
| B5 settle | 既存の「確認 → 確定」へ引き渡し | — | — |

reduced-motion / スキップ時: B0–B3 を飛ばし **B4 の最終状態を即表示**（色キューは静的バッジで残す）。

---

## 4. 色（確定: 2状態のみ）

**種別ごとに色を分けない。** ガチャ演出デザインの原則「色＝運、カード＝種別」の2軸に分ける:

| 状態 | 条件 | トークン |
|---|---|---|
| 通常 | 特異が `hits` に無い（通常人格 / E.G.O / 特定抽出パック） | `--gx-c1: var(--amber)`（橙） |
| 金 | 特異人格（`branch:"special"` か `mode:"t"`）を含む | `--gx-c1: var(--gold)`（金） |

- 理由: Limbus 相当（normal=Orange/Black、専用色は1つ）。色が**プール内で一定**な型
  （E.G.Oルートは毎回E.G.O、パックも同様）に色を割当てても**対比が生まれない**ため情報にならない。
  色のエスカレーションは「通常の中に特異が混ざる」という**引くたびに変わる事象**にだけ使う。
- **E.G.O / 特定抽出パックは球の色では差別化せず、結果カード側で示す**（`is-ego` 枠、
  種別ラベル）。これで「運」と「種別」が別チャネルになり、金の希少性が保たれる。
- 既存の `--amber / --gold / --ego-influence` を土台にし、演出用の尺は `--gx-*` として
  `.lbt-gx` スコープに定義（`:root` を汚さない）。

**Limbus の2ケースを忠実対応**（`gacha.js:292` の plusOne→specialPersona と一致）:
- 特異が**先頭** → 球が**最初から金**（Limbus「begins gold」）
- 特異が**後半** → 通常で開始し**途中で金に変わる**（Limbus「turns gold during finishing」）

---

## 5. ファイル構成（配線前・独立）

- `assets/gacha-extraction.css` … `@layer gacha-extraction`。keyframes + `--gx-*` + 各 tier 色。
- `js/gacha-extraction.js` … `window.LBT_gachaExtraction = { plan(hits), play(hits, opts) → Promise, TIERS }`。
  - IIFE、`React.createElement` 不使用の純演出モジュール（DOM を直接操作、`create-element-nesting` 対象外）。
- `preview-extraction.html` … **単体プレビュー**（全 tier / 単発 / 10連 をボタンで発火）。
  - テスト走査範囲（`preview-*.test.mjs` / `public-url-privacy` / `browser-load-gate`）に
    載らない場所・命名にする（実装時に走査対象を確認して確定）。

**配線時（承認後のみ）に初めて触る**: `index.html`（`@layer` 末尾加算 + `?v=` 付き link/script）、
`OtherSections.js`（`requestDraw` の `setPending` 後に `play(out.hits)` を挟むだけ）。

---

## 6. アクセシビリティ

- 演出 VFX 層は `aria-hidden="true"`。読み上げ対象は**既存の確認ダイアログ**（結果の正本）。
- 演出層はフォーカスを奪わない（focus trap しない）。結果ダイアログが唯一の操作面。
- 色キューは**静的にも**提示（reduced-motion でも tier が分かるよう、ラベル/アイコンを併設）。
- 800ms 経過後に「スキップ」を可視表示（キーボードでも到達可能）。

---

## 7. テスト封印計画（skill/AGENTS: 失敗は仕組みで塞ぐ）

新規 `tests/gacha-extraction.test.mjs`:

1. `plan(hits)` が `hits` から決定論的に色/tier を返す。
2. **偽の煽り封印**: 上位が `hits` に無ければ `tier===0`（開始色は normal のまま）。
3. 尺が `--gx-*` 経由（JS/CSS に duration の直書きが無い）。
4. reduced-motion 経路: matchMedia=reduce で `play()` が即 resolve・移動なし。
5. スキップ経路: 入力で即 resolve（同一の最終状態）。
6. 配線時: `asset-version-sync` に新アセットを登録、`create-element-nesting` に非抵触。

`audit-non-vacuity.test.mjs` の流儀に倣い、封印テスト自体が空振りしていないことを確認する。

---

## 8. 承認 → 配線の手順

1. 本メモの未確定点（§9）を確定。
2. `assets/gacha-extraction.css` + `js/gacha-extraction.js` + `preview-extraction.html` を実装。
3. `preview-extraction.html` をブラウザで確認（利用者）。
4. **OK が出たら**配線: `index.html` と `OtherSections.js` を編集、`?v=` 採番、全テスト。
5. 本番コミットは利用者の明示指示があるまで行わない。

---

## 9. 確定した設計判断

- **色**: §4 のとおり2状態（通常=橙、特異=金）。種別はカード側で示す。
- **ルート差なし**: 単発 / 10連 / チケット / パックで方式は同一（reveal の枚数だけ差）。
  プール内で一定の型に演出差を付けても対比が無く、「1画面1つの wow」原則にも反する。
- **音**: 付けない（無音）。LBT に音声層が無く、SE は自作アセット + ミュート UI が必要。
- **尺**: 短縮。charge 500 + collect 700 + burst 350 = 約 1.55s（turn は特異が後半のとき +360ms）。
  繰り返し見る前提のアニメは短く。CSS 変数 `--gx-*` 正本。
- **プレビュー**: `preview-extraction.html`（リポジトリ直下、`mobile-preview.html` と同じ慣習）。
  どのテストも html を glob しない（各テストは明示リスト）ことを確認済み → 走査対象外。

---

## 10. 実装状況（独立・未配線）

実装済み（`index.html` / `OtherSections.js` は未変更 = 未配線）:
- `assets/gacha-extraction.css`（`@layer gacha-extraction`、`--gx-*`、鎖の球の keyframes）
- `js/gacha-extraction.js`（`window.LBT_gachaExtraction = { plan, play, isSpecial, label, reduceMotion }`）
- `preview-extraction.html`（6シナリオの発火ボタン）
- `tests/gacha-extraction.test.mjs`（偽の煽り封印・尺のトークン正本・reduced-motion 経路・加算レイヤ）

検証: `node --test tests/gacha-extraction.test.mjs tests/text-integrity.test.mjs
tests/browser-load-gate.test.mjs tests/public-url-privacy.test.mjs` → pass 20 / fail 0。

**注意（既存・本作業と無関係）**: `tests/asset-version-sync.test.mjs` は
`js/garasumado-roster-import.js` の `?v=` 未更新で FAIL する。これは未コミットの
garasumado 作業（`git status` に元から有り）が原因で、本演出の変更は関与していない。

**次のゲート**: 利用者が `preview-extraction.html` を目視確認 → OK → §8 の配線手順へ。
