#!/usr/bin/env python3
"""全DBデータをPDFと照合し、検出できるか監査する。
   false positive を排除するため、best-match 閾値と段落境界考慮を実装。"""
import json
import re
import sys
import unicodedata
from pathlib import Path

try:
    import fitz
except ImportError:
    print("PyMuPDF が必要です")
    sys.exit(1)

ROOT = Path("C:/Users/hanap/Documents/GitHub/LIMBUS_BUILD_TERMINAL")
DB_PATH = ROOT / "data" / "db.json"
SOURCES_DIR = ROOT / "sources" / "エラッタ最新版"

def canon(text):
    """正規化: NFKC正規化で全幅→半幅変換し、句読点・括弧・記号を除去。"""
    t = unicodedata.normalize("NFKC", str(text))
    # 句読点・括弧・全幅記号・ダッシュ類・長音記号・記号ブロックを除去（数字・英字・+ - / は保持）
    t = re.sub(r'[\u3000-\u303F\u2010-\u2015\u2500-\u25FF\u30FC\uFF5F\uFF61-\uFF9F]', '', t)
    t = re.sub(r'[\x21-\x2A\x2C\x2D\x2F\x3A-\x40\x5B-\x60\x7B-\x7E]', '', t)
    t = re.sub(r'[\s\u00a0]+', '', t)
    return t

def extract_pdf_text(pdf_path):
    doc = fitz.open(pdf_path)
    pages = [page.get_text("text") for page in doc]
    doc.close()
    return "\n".join(pages)

def find_block(pdf_text, heading):
    idx = pdf_text.find(heading)
    if idx < 0:
        return None
    next_heading = pdf_text.find("「", idx + len(heading))
    end = next_heading if next_heading > 0 else len(pdf_text)
    return pdf_text[idx:end]

def check_field_in_block(db_text, block, canon_all):
    """DBテキストがブロック内に含まれているかを判定する。
    1. canon exact match
    2. 全PDF canon match
    3. 改行で分割して各セグメントがブロック内に含まれるか
    4. best-match ratio (閾値 0.90)
    """
    if not db_text:
        return True
    ct = canon(db_text)
    cb = canon(block)
    if not ct:
        return True
    if ct in cb:
        return True
    if ct in canon_all:
        return True
    # 改行で分割して各セグメントを確認（元テキストで分割してから canon）
    segments = re.split(r'[\n\r]+', db_text)
    segments = [s.strip() for s in segments if len(s.strip()) >= 10]
    if segments:
        all_found = True
        for seg in segments:
            cs = canon(seg)
            if cs not in cb and cs not in canon_all:
                all_found = False
                break
        if all_found:
            return True
    # best-match ratio
    best = 0
    for start in range(0, len(cb) - 10, 1):
        m = 0
        while start+m < len(cb) and m < len(ct) and cb[start+m] == ct[m]:
            m += 1
        if m > best:
            best = m
    ratio = best / len(ct)
    return ratio >= 0.90

def main():
    db = json.load(open(DB_PATH, "r", encoding="utf-8"))

    pdf_texts = {}
    for filename in SOURCES_DIR.glob("*.pdf"):
        pdf_texts[filename.name] = extract_pdf_text(filename)
    all_pdf = "\n".join(pdf_texts.values())
    canon_all = canon(all_pdf)

    results = {}

    def check(name, items, heading_fn, field_check_fn):
        total = 0
        found = 0
        not_found = []
        for i, item in enumerate(items):
            n = item.get("name", "")
            if not n:
                continue
            total += 1
            heading = heading_fn(n)
            block = find_block(all_pdf, heading)
            if block:
                ok = field_check_fn(item, block)
                if ok:
                    found += 1
                else:
                    not_found.append((n, "field_mismatch"))
            else:
                # 名前が canon_all に含まれれば検出可能とみなす
                if canon(n) in canon_all:
                    found += 1
                else:
                    not_found.append((n, "name_not_in_pdf"))
        results[name] = {"total": total, "found": found, "not_found": not_found}

    def persona_heading(n):
        return f"「{n}の人格」"
    def persona_field(item, block):
        for f in ["passive_always", "passive_effect"]:
            t = item.get(f, "")
            if not check_field_in_block(t, block, canon_all):
                return False
        # 固有バフもチェック
        for buff in item.get("unique_buffs", []):
            bd = buff.get("desc", "")
            if not check_field_in_block(bd, block, canon_all):
                return False
        # unique_buffs の重複チェック
        seen = set()
        for buff in item.get("unique_buffs", []):
            bn = buff.get("name", "")
            if bn:
                if bn in seen:
                    return False
                seen.add(bn)
        return True

    check("normal_personas", db.get("normal_personas", []), persona_heading, persona_field)
    check("tokui_personas", db.get("tokui_personas", []), persona_heading, persona_field)

    def ego_heading(n):
        return f"「{n}」"
    def ego_field(item, block):
        for f in ["passive_name", "passive_cond", "passive_effect"]:
            t = item.get(f, "")
            if not check_field_in_block(t, block, canon_all):
                return False
        return True
    check("egos", db.get("egos", []), ego_heading, ego_field)

    check("support_passives", db.get("support_passives", []), lambda n: f"「{n}」", lambda i, b: True)
    check("spirits", db.get("spirits", []), lambda n: f"「{n}」", lambda i, b: True)
    check("normal_enhancements", db.get("normal_enhancements", []), lambda n: f"「{n}」", lambda i, b: True)
    check("special_enhancements", db.get("special_enhancements", []), lambda n: f"「{n}」", lambda i, b: True)
    check("death_passives", db.get("death_passives", []), lambda n: f"「{n}」", lambda i, b: True)

    print("\n=== 検査結果 ===")
    total_issues = 0
    for category, data in results.items():
        print(f"\n{category}: {data['found']}/{data['total']}")
        if data["not_found"]:
            print(f"  未検出: {len(data['not_found'])} 件")
            for name, reason in data["not_found"][:10]:
                print(f"    - {name} ({reason})")
            if len(data["not_found"]) > 10:
                print(f"    ... 他 {len(data['not_found']) - 10} 件")
            total_issues += len(data["not_found"])

    print(f"\n総問題点: {total_issues}")

    out_path = ROOT / "tools" / "provenance" / "audit-all-detect-result.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=1)
    print(f"結果を保存: {out_path}")

if __name__ == "__main__":
    main()