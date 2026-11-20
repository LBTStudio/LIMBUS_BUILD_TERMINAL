# 最適化 実施報告

制約: 機能・仕様・画面出力を一切変えない。

## 実測（変更前）

| 指標 | 値 | 備考 |
|---|---|---|
| 初期ロード | 2.5s | 17スクリプト + CSS、`data/db.json` が792KB |
| 画面遷移 | 0〜1ms | 実測。ボトルネックではない |
| 検索 | 543ms | 66枚のフィルタ + 描画 |
| ショップ描画 | 6636ノード | 366枚のカード |
| コンソールエラー | 0 | 全7画面 |

## 1. 死んだコードの除去

参照数を全リポジトリ（js / tests / tools / html）で機械的に数え、
**定義が1箇所だけで他から参照ゼロ**の宣言だけを削除した。
動的参照されうる `window.*` 公開名は除外して判定している。

| 削除した宣言 | 場所 | 行数 |
|---|---|---|
| `isDeathSupportPassive` | js/OtherSections.js | 4 |
| `UNIQUE_BUFF_TYPES` | js/OtherSections.js | 1 |
| `cloneEgoForManualEdit` | js/OtherSections.js | 3 |
| `EgoSkillSummary` | js/OtherSections.js | 11 |
| `EgoReadOnlySkill` | js/OtherSections.js | 21 |
| `LegacyEnhancementSection` | js/OtherSections.js | 29 |
| `isSkillFromDB` | js/SkillDeck.js | 14 |
| `egoVariantLabel` | js/state.js | 3 |
| `STATUS_GAIN_RE` | js/state.js | 1 |

合計 87行。動的参照の可能性があるものは一切触っていない。

## 検証

- `node --check` : 3ファイル すべて OK
- `node --test tests/*.test.mjs` : 748件中 746 pass。
  落ちた2件は `?v=` のハッシュ同期のみ（削除でファイル内容が変わったため）。
  実装修正後に再同期して緑。
- ブラウザ: 全7画面（駒整形/ビルド/ショップ/記録/設定/使い方）+
  ビルド「強化」タブを実レンダリング。コンソールエラー 0。
  削除した `LegacyEnhancementSection` は強化タブの旧経路で、
  現在の強化タブは別コンポーネントが担当しているため表示に影響なし。

## 測定して「やめた」こと

以下の改善は検討したが、**機能変更を伴う、または効果が無いため採用していない**。

- ショップの仮想スクロール化: 6636ノードは多いが遷移1ms・検索543msで体感上の
  問題なし。導入するとスクロールや「全件表示」の挙動が変わる（仕様変更）。
- `db.json` の分割/遅延読み込み: 792KBだが初回ロード2.5sは国内回線でも許容範囲。
  分割すると初期表示が変わる。
- reducer 内の `cloneJSON` 化: 書き込み時1操作1回の克隆で、
  レンダリング経路には無い。置き換えても効果が無いか挙動リスクがある。

## 残る改善候補（未実施・要判断）

1. `data/db.json` 792KB — gzip 配信なら実効 200KB 程度。ホスティング側の設定のみ。
2. 未使用 CSS ルールの削除 — 未測定。
3. `share.html` / `mobile-preview.html` の読み込みスクリプト削減（本体と別ページ）。
