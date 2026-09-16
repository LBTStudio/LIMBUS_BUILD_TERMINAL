#!/usr/bin/env python3
"""原典PDFから照合用のテキストコーパスを書き出す。

出力先は data/provenance/*.txt で、ページ境界を `===== PAGE n =====` で区切る。

このツールはPDFを手元に持っている場合だけ実行する。
出力したコーパスはリポジトリへ含めるため、
監査（audit-db-text.mjs）と回帰テストはPDF本体なしで再実行できる。

使い方:
    python3 tools/provenance/extract_pdf_corpus.py <基本ルールPDF> <サプリメントPDF>

抽出には PyMuPDF を使う。人格データの紙面は表組みで、
PyMuPDF はセル単位で読み順を保つため、セルの内容が途中で分断されない。

pdftotext -layout も読み順は保つが、表の左端にある行見出し（`効果` `戦` `術` など）を
本文と同じ行へ出力するため、本文が折り返されると見出し語が本文の途中へ割り込む。
照合の精度が落ちるので、PyMuPDF を既定とする。
"""
import sys
from pathlib import Path

TARGETS = [
    ("core", "新リンバスTRPG.pdf"),
    ("supplement", "新リンバスTRPG サプリメント 『アンロックド・シンク』.pdf"),
]


def extract(pdf_path: Path) -> str:
    import pymupdf

    doc = pymupdf.open(pdf_path)
    parts = []
    for index, page in enumerate(doc):
        parts.append(f"\n===== PAGE {index + 1} =====\n")
        parts.append(page.get_text("text"))
    return "".join(parts)


def main(argv: list[str]) -> int:
    if len(argv) != len(TARGETS):
        print("使い方: python3 tools/provenance/extract_pdf_corpus.py <基本ルールPDF> <サプリメントPDF>", file=sys.stderr)
        print("期待するPDF:", file=sys.stderr)
        for _, label in TARGETS:
            print(f"  - {label}", file=sys.stderr)
        return 2

    root = Path(__file__).resolve().parents[2]
    out_dir = root / "data" / "provenance"
    out_dir.mkdir(parents=True, exist_ok=True)

    for (key, label), raw_path in zip(TARGETS, argv):
        pdf_path = Path(raw_path)
        if not pdf_path.exists():
            print(f"PDFが見つかりません: {pdf_path}", file=sys.stderr)
            return 2
        corpus = extract(pdf_path)
        dest = out_dir / f"{key}.txt"
        dest.write_text(corpus, encoding="utf-8")
        pages = corpus.count("===== PAGE ")
        print(f"{key}: {pages}頁 -> {dest.relative_to(root)}  ({label})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
