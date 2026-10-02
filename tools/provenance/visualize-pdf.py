#!/usr/bin/env python3
"""PDFのテキストと位置情報を視覚的に表示する。

PyMuPDF を使い、PDFのテキストとその位置（bbox）をHTMLで視覚化する。
一般ユーザーがPDFの内容をブラウザで確認できる。

使い方:
  python3 tools/provenance/visualize-pdf.py [pdf_path] [--page N]
"""
import json
import re
import sys
from pathlib import Path

try:
    import fitz  # PyMuPDF
except ImportError:
    print("PyMuPDF が必要です: pip install pymupdf")
    sys.exit(1)

ROOT = Path(__file__).resolve().parent.parent.parent
SOURCES = ROOT / "sources"
ERRATA_DIR = SOURCES / "エラッタ最新版"

def visualize_page(pdf_path, page_num, output_path):
    """PDFの1ページをHTMLで視覚化する。"""
    doc = fitz.open(pdf_path)
    page = doc[page_num - 1]
    
    # テキストブロックを取得
    blocks = page.get_text("dict")["blocks"]
    
    html_parts = [
        '<!DOCTYPE html>',
        '<html><head><meta charset="utf-8">',
        '<style>',
        'body { font-family: sans-serif; margin: 20px; }',
        '.page { border: 1px solid #ccc; padding: 10px; }',
        '.block { margin: 2px 0; padding: 2px; }',
        '.text { background: #fff; }',
        '.heading { background: #e8f0fe; }',
        'pre { white-space: pre-wrap; font-size: 12px; }',
        '</style></head><body>',
        f'<h1>{pdf_path.name} p.{page_num}</h1>',
        '<div class="page">',
    ]
    
    for block in blocks:
        if block["type"] != 0:
            continue
        for line in block["lines"]:
            for span in line["spans"]:
                text = span["text"]
                bbox = span["bbox"]
                color = span["color"]
                size = span["size"]
                font = span["font"]
                
                # 見出し（太大・太字）を判定
                is_heading = size > 12 or "Bold" in font
                
                html_parts.append(
                    f'<div class="block {"heading" if is_heading else "text"}" '
                    f'style="font-size:{size}px; color:#{color:06x}; '
                    f'left:{bbox[0]}px; top:{bbox[1]}px;">'
                    f'<pre>{text}</pre></div>'
                )
    
    html_parts.append('</div></body></html>')
    
    output_path.write_text("\n".join(html_parts), encoding="utf-8")
    doc.close()
    return output_path

def main():
    if len(sys.argv) < 2:
        print("使い方: python3 tools/provenance/visualize-pdf.py <pdf_path> [--page N]")
        sys.exit(1)
    
    pdf_path = Path(sys.argv[1])
    page_num = 1
    
    if "--page" in sys.argv:
        idx = sys.argv.index("--page")
        page_num = int(sys.argv[idx + 1])
    
    if not pdf_path.exists():
        print(f"ファイルが見つかりません: {pdf_path}")
        sys.exit(1)
    
    output = Path(f"/tmp/visualize-{pdf_path.stem}-p{page_num}.html")
    visualize_page(pdf_path, page_num, output)
    print(f"視覚化: {output}")

if __name__ == "__main__":
    main()