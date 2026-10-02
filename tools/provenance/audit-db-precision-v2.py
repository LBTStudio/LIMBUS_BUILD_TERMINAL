#!/usr/bin/env python3
"""PyMuPDF を活用してPDFを直接確認し、DBの精確性を検査する。

使い方:
  python3 tools/provenance/audit-db-precision.py
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
DB_PATH = ROOT / "data" / "db.json"
SOURCES_DIR = ROOT / "sources" / "エラッタ最新版"

def load_db():
    with open(DB_PATH, "r", encoding="utf-8") as f:
        return json.load(f)

def canon(text):
    """正規化: 空白・句読点を除去。"""
    return re.sub(r'[\s\u3000\u3001\u3002\uff0c\uff0e\u00a0]+', '', str(text))
def canon_preserve_newlines(text):
    """正規化: 空白・句読点を除去するが改行は保持。段落構造の検査に使う。"""
    t=str(text)
    lines=t.split("
")
    return ("
").join(re.sub(r[s　、。，． ]+, '', line) for line in lines)

def extract_pdf_text(pdf_path):
    """PDFからテキストを抽出する。"""
    doc = fitz.open(pdf_path)
    pages = []
    for page in doc:
        text = page.get_text("text")
        pages.append(text)
    doc.close()
    return "\n".join(pages)

def find_persona_block(pdf_text, persona_name):
    """PDFテキストから人格ブロックを検索する。"""
    heading = f"「{persona_name}の人格」"
    idx = pdf_text.find(heading)
    if idx < 0:
        return None
    next_heading = pdf_text.find("「", idx + len(heading))
    end = next_heading if next_heading > 0 else len(pdf_text)
    return pdf_text[idx:end]

def check_db_against_pdf(db, pdf_text):
    """DBの全人格データをPDFと照合する。"""
    issues = []
    
    for list_name in ["normal_personas", "tokui_personas"]:
        for i, persona in enumerate(db.get(list_name, [])):
            name = persona.get("name", "")
            if not name:
                continue
            
            block = find_persona_block(pdf_text, name)
            if not block:
                issues.append({
                    "type": "block_not_found",
                    "list": list_name,
                    "index": i,
                    "name": name
                })
                continue
            
            # 各フィールドを確認
            for field in ["passive_always", "passive_effect"]:
                db_text = persona.get(field, "")
                if not db_text:
                    continue
                canon_db = canon(db_text)
                canon_block = canon(block)
                
                if canon_db and canon_db not in canon_block:
                    issues.append({
                        "type": "text_not_in_pdf",
                        "list": list_name,
                        "index": i,
                        "name": name,
                        "field": field,
                        "db_text_len": len(db_text),
                        "block_len": len(block)
                    })
            
            # 固有バフを確認
            for j, buff in enumerate(persona.get("unique_buffs", [])):
                buff_name = buff.get("name", "")
                buff_desc = buff.get("desc", "")
                if not buff_desc:
                    continue
                canon_desc = canon(buff_desc)
                canon_block = canon(block)
                
                if canon_desc and canon_desc not in canon_block:
                    issues.append({
                        "type": "buff_desc_not_in_pdf",
                        "list": list_name,
                        "index": i,
                        "name": name,
                        "buff_name": buff_name,
                        "desc_len": len(buff_desc)
                    })
    
    return issues

def main():
    db = load_db()
    
    # PDFを読み込み
    pdf_path = SOURCES_DIR / "新リンバスTRPG.pdf"
    if not pdf_path.exists():
        print(f"PDFが見つかりません: {pdf_path}")
        sys.exit(1)
    
    print(f"PDFを読み込み中: {pdf_path}")
    pdf_text = extract_pdf_text(pdf_path)
    print(f"PDFテキスト長: {len(pdf_text)} 文字\n")
    
    # 検査
    issues = check_db_against_pdf(db, pdf_text)
    
    print(f"問題点: {len(issues)} 件\n")
    
    # 問題を分類
    categories = {}
    for issue in issues:
        cat = issue["type"]
        if cat not in categories:
            categories[cat] = []
        categories[cat].append(issue)
    
    for cat, items in categories.items():
        print(f"{cat}: {len(items)}件")
        for item in items[:5]:
            print(f"  {item}")
        if len(items) > 5:
            print(f"  ... 他 {len(items) - 5} 件")

if __name__ == "__main__":
    main()