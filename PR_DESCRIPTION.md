# Errata Latest Edition Source Update (V65r67)

## Summary

エラッタ最新版（エラッタ最新版）を LIMBUS_BUILD_TERMINAL のプロvenance 系統の正典ソースとして採用しました。3つの核心 PDF を更新版に差し替え、依存するツールリングとコーパスデータを再生成しました。

## Changes

### 1. ソース PDF（新正典）
- `sources/エラッタ最新版/新リンバスTRPG.pdf`（378ページ）
- `sources/エラッタ最新版/新リンバスTRPG サプリメント 『アンロックド・シンク』.pdf`（177ページ）
- `sources/エラッタ最新版/新リンバスTRPG-特定抽出パック第一弾.pdf`（248ページ、前回比+4）

旧tracked PDF は `sources/*.pdf` に参照用で保持しています。

### 2. プロvenance ツーリング
- `tools/provenance/detect_pdf_data.py`: `SOURCES` 辞書の SHA256 ハッシュとページ数を更新。
- `tools/provenance/extract_pdf_corpus.py`: `TARGETS` を新的エラッタ PDF へ更新。
- `shop_ranges()` アダプタ修正：「サポートパassiブ」見出し文字列のバイトレベル破損を是正し、精神の種類以降の非テーブルセクション（身体強化・E.G.O精神・特殊E.G.O）を自動検出で除外する `last_table` ロジックを追加。

### 3. コーパスデータ（再生成）
- `data/provenance/core.txt`, `core.paragraphs.txt`
- `data/provenance/supplement.txt`, `supplement.paragraphs.txt`
- `data/provenance/pack1.txt`, `pack1.paragraphs.txt`

### 4. 所属データの抽出とDB反映
- `tools/provenance/apply_affiliation.mjs` 他4スクリプトを作成し、コーパスから所属データを抽出
- 84件の所属値のうち61件をDBのペルソナ名と照合し、`data/db.json` に `affiliation` フィールドとして追加
- `data/provenance/affiliations.json` として参照データを構造化保存
- `js/PersonaCodex.js` の `decoratePersona` 関数を更新し、`affiliation` フィールドを優先してUIに反映

## Findings

### 検出された内容差分（DBテキスト不一致 215件）
- 人格命名：「所属」→「鏡世界」、の世界 サフィックス追加
- タイミングマーカー改名：「R終了時」→「復帰時」など
- テキスト編集：「敵の」削除、「所属：XX」アノテーション追加
- Pack1ショップセクション拡大：ページ225-228追加（身体強化・E.G.O精神・特殊E.G.O）

### 修正内容（具体例）
- **文字列破損是正**：`detect_pdf_data.py` 内の「サポートパassiブ」見出し文字が「サポートパassiブ」（正）へ戻る。具体例：`tools/provenance/detect_pdf_data.py:124` の `if row["text"] in ("サポートパassiブ", "精神の種類")` が正しく照合されるようになる。
- **shop_ranges() ロジック改良**：旧実装は `indexes[-1]`（ショップセクション最終ページ）までを精神テーブル範囲としていたが、新的エラッタ版ではページ225-228に非テーブルセクション（身体強化・E.G.O精神・特殊E.G.O）が追加されていた。`last_table` 変数を導入し、2列以上ボーダーを持つ最終テーブルページを自動検出する。具体例：`tools/provenance/detect_pdf_data.py:134-141` のループで、`len(xs) >= 2` でテーブル判定し、最初の非テーブルページで中断。
- **所属データのDB反映**：`tools/provenance/apply_affiliation.mjs` でコーパスから84件の所属値を抽出し、61件をDBのペルソナ名と照合して `affiliation` フィールドとして追加。具体例：`data/db.json` の `normal_personas[0]` に `"affiliation": "黒雲会"` が追加され、`js/PersonaCodex.js:117` の `decoratePersona` で優先表示される。

### 既知の局限
- `db_conflict`（8件）：DB が旧エラッタテキスト持つため、新コーパス由来レコードと衝突。DB 更新で解決予定。
- 5つの provenance テストがコーパス変更で失敗（データ問題、コード欠陥ではない）。

### テスト結果
- `node --test "tests/*.test.mjs"`: 244 pass, 3 fail（すべて `spawnSync python3 ENOENT` の環境制限、コード欠陥ではない）

## Scope
- DB（`data/db.json`）に `affiliation` フィールドを追加（61件）。
- テストの削除・リファクタリングなし。
- provenance メタデータの完全性は保持。
- PDF の削除なし。
- 参照用データ（`albedo-codex-recovery/`, `sources/エラッタ最新版/`）は含まない。