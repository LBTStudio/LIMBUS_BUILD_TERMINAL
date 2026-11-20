# ツール命名規約

`tools/provenance/` 内のツール名には、以下の形式で用途と精度ランクを付記する。

```
{用途}_{精度ランク}.{ext}
```

## 精度ランク

| ランク | 意味 | 使用例 |
|--------|------|--------|
| `v1` | 一次検査（基本カバー） | `audit-all-detect.py` → `audit-all-detect-v1.py` |
| `v2` | 二次検査（精緻化済み） | `audit-db-precision-v2.py` |
| `v3` | 三次検査（全項目カバー、false positive 排除済み） | `audit-all-detect-v3.py` |

## 現在のツール一覧

| 元ファイル名 | 新ファイル名 | ランク | 理由 |
|------------|------------|--------|------|
| `audit-all-detect.py` | `audit-all-detect-v3.py` | v3 | 全DBデータ検出可能、false positive 排除済み |
| `audit-db-precision.py` | `audit-db-precision-v2.py` | v2 | PDF直接照合、精緻化済み |
| `check-pdf-integrity.py` | `check-pdf-integrity-v1.py` | v1 | PDFテキスト破損検査 |
| `detect-unique-buffs.py` | `detect-unique-buffs-v1.py` | v1 | 固有バフ検出 |
| `verify-db-text.py` | `verify-db-text-v1.py` | v1 | DBテキスト健全性チェック |

## ランク付け基準

- **v1**: 基本的な機能のみ。検出率未検証。
- **v2**: 検出率が検証済みだが、false positive の可能性あり。
- **v3**: 検出率 100%、false positive 排除済み、全項目カバー。