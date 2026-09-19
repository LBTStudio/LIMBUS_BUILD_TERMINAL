#!/usr/bin/env python3
"""特定抽出パックのPDFから、人格・E.G.Oのデータを構造化して書き出す。

`data/db.json` へ追加するための中間ファイル（JSON）を作る。
DBへ直接書き込まず、照合を挟んでから取り込む。

    python3 tools/provenance/extract_pack_data.py            # 件数と抜粋を表示
    python3 tools/provenance/extract_pack_data.py --write    # 中間ファイルへ書き出す

出力先: data/provenance/pack1-extracted.json


なぜ座標を使うのか
------------------
人格データの紙面は表組みで、`page.get_text("text")` の行順では
次の二つが区別できない。

  - 表の左端にある行見出し（`パッシブ` `戦` `術` `固` `有`）と本文
  - スキル番号（`0`〜`4`）と、そのスキルに属する本文

どちらも紙面上は別の列にあり、字下げ位置（x0）で判別できる。

    x0 ≈  43  行見出しの列（パッシブ / 戦術 / 固有）
    x0 ≈  60  スキル番号の列
    x0 ≈  71  スキル本文の列
    x0 ≈ 105  パッシブ本文の列
    x0 ≈  59  固有バフ本文の列

そこで行を x0 で列へ振り分け、列ごとに読み順で処理する。

折り返しの連結は extract_pdf_corpus.py と同じ基準（行末の余白に
次の行の先頭文字が入るか、行頭禁則を考慮）を使う。
判定の根拠は docs/provenance-lessons.md にある。
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))

from extract_pdf_corpus import (  # noqa: E402
    ColumnEdges, is_wrapped, page_lines, page_rules, page_verticals,
)

PACK_PDF = ROOT / "sources" / "新リンバスTRPG-特定抽出パック第一弾.pdf"
OUT_PATH = ROOT / "data" / "provenance" / "pack1-extracted.json"

# 紙面の列。x0 の範囲で振り分ける。
COL_GUTTER = (38.0, 56.0)    # 行見出し（パッシブ / 戦 術 / 固 有）
COL_SKILL_NO = (56.0, 68.0)  # スキル番号
COL_BODY = (68.0, 80.0)      # スキル本文
COL_PASSIVE_LABEL = (70.0, 100.0)  # パッシブの行見出し（名称 / 発動条件 / 常時発動 / 効果）
COL_PASSIVE = (100.0, 112.0) # パッシブ本文
COL_BUFF = (56.0, 62.0)      # 固有バフ本文（固有欄の本文列）

# 人格番号は紙面右上の「人格No.」欄にある。
# 紙面の隅にあるノンブレ（頁番号）も同じ形の数字なので、位置で分ける。
#   人格番号: x0≈237〜240, y0≈50   ノンブレ: y0≈397（紙面下端）
PERSONA_NO_X = (230.0, 250.0)
PERSONA_NO_Y_MAX = 60.0

# 能力値行（`速度 1d7 斬撃 抵抗 貫通 弱点 打撃 普通 弾丸 ×`）は
# x0≈102 でパッシブ本文の列（x0≈105）と近く、列だけでは分けられない。
#
# かつては「高さ y<=75 を除く」としていたが、これは続き頁の紙面上端にある
# パッシブ本文まで落としてしまう。
#
#   紙面155「蜘蛛の巣 人差し指の親方」効果欄の続き（y=44〜84）
#     基本攻撃スキルのダイスごとに武器がランダムに決まり、…
#
# 能力値行は「速度」で始まりダイス表記が続くという内容で判別できる。
# 位置ではなく内容を根拠にする。
STAT_ROW_RE = re.compile(r"^(?:HP\s*\d+\s*SAN|速度\s*\d+\s*[dD]\s*\d)")

PASSIVE_LABELS = {"名称", "発動条件", "常時発動", "効果"}

# 紙面の定型語。本文ではないので取り除く。
GUTTER_WORDS = {
    "パッシブ", "名称", "発動条件", "効果", "常時発動", "戦", "術", "固", "有",
    "人格", "No", ".", "No.", "ス", "キ", "ル", "覚", "醒", "侵", "蝕", "E.G.O",
}

PERSONA_HEAD_RE = re.compile(r"^「(.+?)の人格」$")
STAT_RE = re.compile(r"HP\s*(\d+)\s*SAN\s*(\d+)")
# 速度はダイス表記（`1d6` `3d2+1` `2d3+1`）。
#
# 紙面によっては速度と耐性が同じ行に組まれている。
#
#   速度 1d6                                    （行が分かれている紙面）
#   速度 1d6+1 斬撃 抵抗 貫通 弱点 打撃 普通 弾丸 ×  （同じ行の紙面）
#
# `(.+)` で取ると後者で耐性まで飲み込む（夜明事務所フィクサーB ほか9件）。
# ダイス表記の形に限って取り、続く耐性は RES_RE が別に読む。
SPEED_RE = re.compile(r"速度\s*(\d+\s*[dD]\s*\d+(?:\s*[+\-]\s*\d+)?)")
RES_RE = re.compile(r"斬撃\s*(\S+)\s*貫通\s*(\S+)\s*打撃\s*(\S+)\s*弾丸\s*(\S+)")
# 固有バフの見出し。`[名前] 最大N 種別`。
#
# 「最大」は常にあるとは限らない。数値上限を持たないバフは種別だけが続く。
#
#   [指令の印] 中立バフ          （紙面143・157）
#   [沈潜-孤独] デバフ           （紙面59）
#   [探求した知識] 中立バフ      （紙面47）
#
# 「最大」を必須にすると、これらの見出しが見出しとして認識されず、
# 直前のバフの説明文へ本文ごと吸い込まれる。既存DBも上限のないバフは
# max を null で持っている（南部ディエーチ協会4課フィクサー「探求した知識」）。
BUFF_HEAD_RE = re.compile(r"^[\[【](.+?)[\]】]\s*(?:最大\s*(\d+)\s*)?"
                          r"(中立バフ|バフ|デバフ)\s*$")
SKILL_HEAD_RE = re.compile(r"^(.+?)\s+(斬撃|貫通|打撃|防御|回避|マッチ可能防御|"
                           r"斬撃反撃|貫通反撃|打撃反撃|マッチ可能斬撃反撃|"
                           r"マッチ可能貫通反撃|マッチ可能打撃反撃)"
                           r"(?:広域(\d+))?[：:](\S+)$")
DICE_RE = re.compile(r"^(\d+[dD]\d+(?:[+\-]\d+)?|\d+[+\-]\d+[dD]\d+|"
                     r"\d+[dD]\d+|\d+[+\-]\d*[dD]\d+)(?:[：:](.*))?$")


def in_col(x0, col):
    return col[0] <= x0 < col[1]


def reading_order(row):
    """紙面を跨いだ読み順。

    人格1件は最大3頁にわたる（例: LCE E.G.O::AEDD は紙面65〜67）。
    複数頁の行をまとめて y 座標だけで並べると、次の頁の上端（y≈44）が
    前の頁の上端と同じ値になり、頁をまたいで行が交互に並ぶ。

      誤（y だけで並べた場合）
        p65 y=175 とぐろを巻く 防御：嫉妬
        p66 y=44  直流インバーティング 斬撃：憂鬱   ← 頁の先頭へ戻ってしまう
        p65 y=185 戦闘開始時：高電圧外皮2を得る

    これによりスキルの本文が別の頁の本文と混ざり、原典に存在しない
    文字列ができていた。頁の順を第一の鍵にして解消する。
    """
    return (row["page"], round(row["y0"], 1), row["x0"])


def join_wrapped(rows, keep_rows=False, rules_by_page=None):
    """同じ列の行を、折り返しを連結して段落の一覧にする。

    `keep_rows=True` のときは `(段落, その段落を構成した行)` の組を返す。
    スキル見出しの高さ（y）を知るために使う。見出しが折り返されている場合、
    段落の文字列だけでは元の位置が分からない。

    `rules_by_page` を渡すと、表の罫線を越える連結を行わない。
    スキルは罫線で区切られた欄ごとに組まれており、欄をまたぐ連結は起こらない。

      紙面165「蜘蛛の巣 薬指の親方」
        8d2：回避成功時、…次のRにクイック1を得る   余白2.04pt（欄の最終行）
        ヴァンダリズムはお断りです マッチ可能斬撃反撃：憤怒  ← 次の欄の見出し

      余白2.04ptは全角1文字（6.00pt）に足りないため折り返しと判定され、
      次のスキルの見出しがダイス効果の末尾へ連結していた。
      その結果、技名が「8d2：…クイック1を得るヴァンダリズムはお断りです」になる。
    """
    def band_of(row):
        if not rules_by_page:
            return None
        rules = rules_by_page.get(row["page"], [])
        return (row["page"], sum(1 for rule in rules if rule <= row["y0"]))

    out = []
    buffer = ""
    buffer_rows = []
    for position, row in enumerate(rows):
        buffer += row["text"]
        buffer_rows.append(row)
        following = rows[position + 1] if position + 1 < len(rows) else None
        # 罫線を越えるなら、そこで欄が変わるので段落も終わる。
        if following is not None and band_of(row) != band_of(following):
            following = None
        if is_wrapped(row, following):
            continue
        out.append((buffer, buffer_rows))
        buffer, buffer_rows = "", []
    if buffer:
        out.append((buffer, buffer_rows))
    pairs = [(text.strip(), group) for text, group in out if text.strip()]
    return pairs if keep_rows else [text for text, _ in pairs]


def assign_skill_ranks(skills, numbers, rules_by_page):
    """スキルに戦術番号を割り当て、派生スキルを区別する。

    紙面のスキル欄には、左の桁に戦術番号（0〜4）が組まれている。
    しかし番号を持たないスキルがあり、それが派生スキルである。

      紙面175「夜明事務所フィクサーA」
        y=267 射出 斬撃：憤怒                  ← 番号 4（y=312）
        y=287 使用前：炎蝶の棺が30なら、射出-正午として発動
      紙面176
        y= 44 射出-正午 斬撃広域3：憤怒         ← 番号なし＝派生

    派生スキルは、基本スキルの効果で条件を満たしたときに置き換わって
    発動するもので、戦術選択の対象ではない。番号の有無がその区別である。

    通し番号で `スキル0`〜`スキル9` と振ると、派生スキルが基本スキルと
    同じ扱いになり、出力でも戦術として並んでしまう。
    既存DBの表記にそろえ、直前の基本スキルの番号に枝番を付ける
    （`スキル4` の派生は `スキル4-2`、さらに続けば `スキル4-3`）。

    番号と見出しの対応づけは、y の前後関係ではなく罫線で行う。
    番号は自分のスキル欄の下端に組まれるため、y だけを見ると
    「番号より上にある最も近い見出し」が別のスキルになってしまう。

      紙面174「夜明事務所フィクサーA」罫線 [93.3, 106.2, 128.7, 159.2, 253.6, 374.2]
        y=164.69 烙印 マッチ可能斬撃反撃：憤怒       欄4
        y=255.19 正午の解体 マッチ可能斬撃反撃広域3  欄5
        y=264.91 番号 0                             欄5 ← 正午の解体のもの

      y の前後だけで見ると、番号0の直前にある「正午の解体」ではなく
      その一つ上の「烙印」に割り当ててしまい、基本と派生が入れ替わる。

    罫線で区切られた欄が一つのスキルに対応する。同じ欄にある番号と見出しが
    対になる。派生スキルは基本スキルとは別の欄に組まれるため、
    番号を持つ欄と持たない欄で自然に分かれる。
    """
    def band_of(row, rules_by_page):
        rules = rules_by_page.get(row["page"], [])
        return (row["page"], sum(1 for rule in rules if rule <= row["y0"]))

    ordered = sorted(skills, key=lambda s: min(reading_order(row) for row in s["rows"]))
    for skill in ordered:
        skill["y"] = min(reading_order(row) for row in skill["rows"])
        skill["number"] = None
        skill["band"] = band_of(skill["rows"][0], rules_by_page)

    for row in sorted(numbers, key=reading_order):
        key = band_of(row, rules_by_page)
        same = [s for s in ordered if s["band"] == key and s["number"] is None]
        if same:
            same[0]["number"] = int(row["text"])
            continue
        # 罫線が取れない紙面では、番号より上にある最も近い見出しを持ち主とする。
        above = [s for s in ordered if s["y"] < reading_order(row) and s["number"] is None]
        if above:
            above[-1]["number"] = int(row["text"])

    # 番号のないスキルは、最も近い番号付きスキルの派生である。
    #
    # 派生スキルは基本スキルの前に組まれることも後に組まれることもある。
    # 「直前の番号付きスキル」を親とすると、番号の前に来た派生が
    # 一つ前の番号の派生になってしまう。紙面順で最も近い番号を親とする。
    numbered = [s for s in ordered if s["number"] is not None]
    for skill in ordered:
        if skill["number"] is not None:
            skill["rank"] = f"スキル{skill['number']}"
            continue
        if not numbered:
            skill["rank"] = "スキル0-2"
            continue
        # 紙面順で最も近い番号付きスキルを親とする。
        nearest = min(numbered, key=lambda s: (abs(ordered.index(s) - ordered.index(skill)),
                                               ordered.index(s)))
        skill["parent"] = nearest["number"]

    # 枝番は親ごとに、紙面順で1から数える。
    derived_count = {}
    for skill in ordered:
        if skill["number"] is not None:
            continue
        base = skill.get("parent", 0)
        derived_count[base] = derived_count.get(base, 1) + 1
        skill["rank"] = f"スキル{base}-{derived_count[base]}"
    return skills


def cell_bounds(rules, y):
    """y を挟む罫線の対を返す。罫線が無ければ全体を一つの欄とみなす。"""
    top = float("-inf")
    bottom = float("inf")
    for rule in rules:
        if rule <= y:
            top = rule
        else:
            bottom = rule
            break
    return top, bottom


def load_pages():
    """全頁の行・罫線・節見出しの位置を読み込む。"""
    import pymupdf

    doc = pymupdf.open(PACK_PDF)
    pages = [page_lines(page) for page in doc]
    rules = [page_rules(page) for page in doc]
    # 縦罫線は欄の右端。折り返しの判定に使う（extract_pdf_corpus と同じ根拠）。
    verticals = [page_verticals(page) for page in doc]
    edges = ColumnEdges()
    for rows in pages:
        edges.observe(rows)
    for index, rows in enumerate(pages):
        for row in rows:
            row["frameRight"] = edges.edge_for(row, verticals[index])
            # 人格1件が複数頁にわたるため、行がどの頁に属するかを持たせる。
            # これが無いと reading_order() が頁をまたいだ読み順を決められない。
            row["page"] = index
    return pages, rules, verticals, find_sections(doc)


# 節見出しは本文より大きなフォントで組まれている。
# 本文が 6.0〜10.6pt なのに対し、節見出しは 16pt 以上ある。
SECTION_TITLE_MIN_SIZE = 13.0

# 人格データが載る節。ここに含まれない紙面は人格の範囲に取り込まない。
PERSONA_SECTIONS = ("人格データ", "特異人格データ")
EGO_SECTION = "E.G.Oデータ"
# ショップ節にはサポートパッシブと精神の表が並ぶ。
SHOP_SECTION = "ショップ"


def find_sections(doc):
    """節見出しの紙面番号（0起点）を、見出し名から引ける形で返す。

    人格1件が何頁にわたるかは紙面ごとに違う。

      1頁   ほとんどの通常人格
      3頁   LCE E.G.O::AEDD（紙面65〜67）
      6頁   蜘蛛の巣 人差し指の親方（紙面154〜159）

    かつては「最大3頁」と定数で上限を置いていたが、これは6頁の人格の
    紙面157〜159を取りこぼす。固有バフ9件（指令・カルマ・解禁・武器など）が
    まるごと落ちていた。

    上限を6頁へ広げるのでは同じ誤りを繰り返す（次に7頁の人格が来たら破綻する）。
    人格の範囲は「次の人格見出しまで」であり、それが節の終わりを越えないこと、
    という組版上の事実だけで決める。節の境界は節見出しから求める。
    """
    sections = {}
    for index, page in enumerate(doc):
        for block in page.get_text("dict")["blocks"]:
            if block.get("type") != 0:
                continue
            for line in block["lines"]:
                for span in line["spans"]:
                    title = span["text"].strip()
                    if span["size"] >= SECTION_TITLE_MIN_SIZE and len(title) >= 3:
                        sections.setdefault(title, index)
    return sections


def next_section_page(sections, page_index, page_count):
    """`page_index` より後にある最初の節見出しの紙面（0起点）を返す。

    節見出しは、どのレコードの範囲に対しても越えてはならない境界である。

    かつては「人格節の終わり」を1つだけ求め、それを全人格に共通の上限として
    いた。これは人格節が複数あると破綻する。本書では「人格データ」（紙面19〜）と
    「特異人格データ」（紙面85〜）の2節があり、前者の最後の人格
    「命脈相談窓口 受話器」の範囲が紙面83〜85へ伸びて、後者の節見出し紙面を
    飲み込んでいた。節の解説文（データではない）がレコードの紙面として
    申告され、網羅性の検査が説明文まで「データなのに抽出されていない」と
    報告する原因になっていた。

    節の数や順序を数えるのではなく、「次の見出しまで」という組版上の事実だけで
    決める。節見出しが後に無ければ文書末とする。
    """
    after = [index for index in sections.values() if index > page_index]
    return min(after) if after else page_count


def collect_persona_pages(pages, sections):
    """人格見出しを探し、人格ごとの紙面へ切り分ける。

    範囲は「この見出しから次の人格見出しの直前まで」。
    ただし直後の節見出しを越えない。
    """
    heads = []
    for index, rows in enumerate(pages):
        # 見出しは折り返される場合があるので、列を無視して連結してから探す。
        joined = "".join(r["text"] for r in sorted(rows, key=lambda r: (round(r["y0"], 1), r["x0"])))
        for match in re.finditer(r"「(.+?)の人格」", joined):
            heads.append({"page": index, "name": match.group(1)})

    for position, head in enumerate(heads):
        following = (heads[position + 1]["page"] if position + 1 < len(heads)
                     else len(pages))
        # 自分の紙面より後にある節見出しが上限。人格ごとに求める。
        limit = min(following, next_section_page(sections, head["page"], len(pages)))
        head["pages"] = list(range(head["page"], max(limit, head["page"] + 1)))
    return heads


def parse_persona(name, page_rows, rules_by_page):
    """1人格の紙面から、DBのレコード形へ組み立てる。"""
    persona = {
        "name": name, "no": None, "hp": None, "san": None, "speed": "",
        "res_slash": "", "res_pierce": "", "res_blunt": "", "bullets": "",
        "passive_name": "", "passive_cond": "", "passive_always": "", "passive_effect": "",
        "unique_buffs": [], "keywords": [], "skills": [], "self_status": [],
    }

    # --- 能力値・耐性・人格番号は、列に関係なく紙面から読む。
    for rows in page_rows:
        for row in rows:
            text = row["text"]
            stat = STAT_RE.search(text)
            if stat and persona["hp"] is None:
                persona["hp"] = int(stat.group(1))
                persona["san"] = int(stat.group(2))
            speed = SPEED_RE.search(text)
            if speed and not persona["speed"]:
                # 空白を除いて正規化する（`1d6 + 1` のような組みもある）。
                persona["speed"] = re.sub(r"\s+", "", speed.group(1))
            res = RES_RE.search(text)
            if res and not persona["res_slash"]:
                persona["res_slash"], persona["res_pierce"] = res.group(1), res.group(2)
                persona["res_blunt"], persona["bullets"] = res.group(3), res.group(4)
            if persona["no"] is None and re.fullmatch(r"\d{1,3}", text):
                # 「人格No.」欄の位置にある数字だけを採る。
                # 紙面下端のノンブレを拾うと、頁番号を人格番号としてしまう。
                if in_col(row["x0"], PERSONA_NO_X) and row["y0"] <= PERSONA_NO_Y_MAX:
                    persona["no"] = int(text)

    # --- パッシブ欄。行見出しの列と本文の列が隣り合って並ぶ。
    #
    #   x0≈73〜79  名称 / 発動条件 / 常時発動 / 効果
    #   x0≈105     それぞれの本文
    #
    # 欄の境界は、表の罫線（水平の線）から取る。
    #
    # 行見出しは欄の本文の「縦の中央」に置かれるため、本文が複数行だと
    # 見出しが本文の先頭行より下へ来る。
    #
    #   紙面121「黒獣-午 筆頭」
    #     BODY  y=130.7  け減少（最大3）              ← 常時発動の本文の続き
    #     BODY  y=140.7  下記の条件を満たした時、…     ← 効果の本文の先頭
    #     LABEL y=145.7  効果                        ← 本文の先頭より下にある
    #
    # このため見出しの高さでも、隣り合う見出しの中間でも本文を正しく切れない。
    # 罫線は実際の欄の区切りなので、推測せずに済む。
    #   紙面121の罫線: y = 93.3 / 106.2 / 119.1 / 179.6
    #     93.3〜106.2  発動条件    106.2〜119.1  常時発動    119.1〜179.6  効果
    passive_rows, label_rows = [], []
    for rows in page_rows:
        for row in rows:
            # 能力値行（`速度 1d7 斬撃 抵抗 …`）はパッシブ本文の列と字下げ位置が
            # 近いので除く。高さで除くと、続き頁の紙面上端にあるパッシブ本文まで
            # 落としてしまう（紙面155「蜘蛛の巣 人差し指の親方」の効果欄の続き）。
            # 能力値行はその内容で判別できるので、位置に頼らない。
            if STAT_ROW_RE.match(row["text"]):
                continue
            if in_col(row["x0"], COL_PASSIVE):
                passive_rows.append(row)
            elif in_col(row["x0"], COL_PASSIVE_LABEL) and row["text"] in PASSIVE_LABELS:
                label_rows.append(row)
    passive_rows.sort(key=reading_order)
    label_rows.sort(key=reading_order)

    field_of = {
        "名称": "passive_name",
        "発動条件": "passive_cond",
        "常時発動": "passive_always",
        "効果": "passive_effect",
    }
    # 見出しの位置から、その見出しが属する欄（罫線に挟まれた範囲）を求め、
    # 同じ欄にある本文を集める。
    #
    # パッシブ欄が2つある人格がある（紙面177「夜明事務所フィクサーB」、
    # 紙面154「蜘蛛の巣 人差し指の親方」）。後の欄で上書きすると前の欄が消える。
    # DBのレコードはパッシブ1組ぶんの項目しか持たないため、
    # 同じ項目に現れた値は改行で連ねて、どちらも失わないようにする。
    values = {}
    for label in label_rows:
        rules = rules_by_page.get(label["page"], [])
        top, bottom = cell_bounds(rules, label["y0"])
        block = [row for row in passive_rows
                 if row["page"] == label["page"] and top <= row["y0"] < bottom]
        value = "\n".join(join_wrapped(block, rules_by_page=rules_by_page))
        if not value:
            continue
        field = field_of[label["text"]]
        if field in values and value not in values[field]:
            values[field] = values[field] + "\n" + value
        else:
            values.setdefault(field, value)
    for field, value in values.items():
        persona[field] = value

    # --- スキル欄。番号の列と本文の列を y 座標で対応づける。
    numbers, bodies, buffs = [], [], []
    buff_mode = False
    for rows in page_rows:
        gutters = sorted([r for r in rows if in_col(r["x0"], COL_GUTTER)], key=lambda r: r["y0"])
        # 「固」「有」が現れた y 以降は固有バフ欄である。
        buff_start = None
        for row in gutters:
            if row["text"] in {"固", "有"}:
                buff_start = row["y0"] if buff_start is None else min(buff_start, row["y0"])
        for row in sorted(rows, key=reading_order):
            if row["text"] in GUTTER_WORDS or PERSONA_HEAD_RE.match(row["text"]):
                continue
            if in_col(row["x0"], COL_SKILL_NO) and re.fullmatch(r"\d", row["text"]):
                numbers.append(row)
                continue
            if in_col(row["x0"], COL_BODY):
                if buff_start is not None and row["y0"] >= buff_start - 2:
                    buffs.append(row)
                else:
                    bodies.append(row)
                continue
            if in_col(row["x0"], COL_BUFF):
                buffs.append(row)
    numbers.sort(key=reading_order)
    bodies.sort(key=reading_order)
    buffs.sort(key=reading_order)

    # スキル見出し（技名 属性：罪）の位置でスキルを切る。
    # 番号の列は見出しより下へ置かれるため、切り目には使えない。
    #
    # 見出しは行ではなく段落の単位で探す。技名が長いと見出しが折り返され、
    # 行のままでは後半だけが見出しに見えてしまう。
    #
    #   紙面166「蜘蛛の巣 薬指の親方」
    #     ティビアのメロディー -解体されたものが解体されていないものを   ← 折り返し
    #     解体すること 斬撃：色欲                                     ← ここだけ一致
    #
    #   行で切ると技名が「解体すること」になり、前半が本文として捨てられていた
    #   （「り」「る」のような1文字の技名として現れていた）。
    paragraphs_all = join_wrapped(bodies, keep_rows=True, rules_by_page=rules_by_page)
    skills = []
    current = None
    for paragraph, rows in paragraphs_all:
        match = SKILL_HEAD_RE.match(paragraph)
        if match:
            current = {"head": match, "rows": rows, "body": []}
            skills.append(current)
        elif current is not None:
            current["body"].append(paragraph)

    assign_skill_ranks(skills, numbers, rules_by_page)

    for skill in skills:
        match = skill["head"]
        skill_name, attr, aoe, sin = match.group(1), match.group(2), match.group(3), match.group(4)
        effects, dice = [], []
        for paragraph in skill["body"]:
            dice_match = DICE_RE.match(paragraph)
            if dice_match:
                dice.append({"roll": dice_match.group(1), "effect": (dice_match.group(2) or "").strip()})
            elif dice:
                # ダイスの後に続く段落は、直前のダイス効果の続きである。
                dice[-1]["effect"] = (dice[-1]["effect"] + "\n" + paragraph).strip("\n")
            else:
                effects.append(paragraph)
        persona["skills"].append({
            "rank": skill["rank"],
            "type": attr,
            "sin": sin,
            "aoe": f"対象{aoe}体" if aoe else "",
            "name": skill_name,
            "effect": "\n".join(effects),
            "dice": dice,
        })

    # --- 固有バフ欄。`[名前] 最大N 種別` を見出しに、続く段落を説明とする。
    current = None
    for paragraph in join_wrapped(buffs, rules_by_page=rules_by_page):
        head = BUFF_HEAD_RE.match(paragraph)
        if head:
            current = {
                "name": head.group(1),
                "type": head.group(3).strip() or "バフ",
                # 数値上限を持たないバフは null。既存DBと同じ形にそろえる。
                "max": int(head.group(2)) if head.group(2) else None,
                "desc": "",
                "place": "status",
            }
            persona["unique_buffs"].append(current)
        elif current is not None:
            current["desc"] = (current["desc"] + "\n" + paragraph).strip("\n")
    return persona


# --- E.G.O の紙面 -----------------------------------------------------------
#
# E.G.O は1件が1頁に収まり、人格とは別の体裁で組まれている。
#
#   y≈50   ランク（ZAYIN 等）と名称。ランクが別の行に分かれる紙面もある
#   y≈64   必要資源
#   y≈68   No.101 100欠
#   以降   パッシブ欄（x0≈90 見出し / x0≈120 本文）
#          覚醒・侵蝕欄（x0≈71 本文、x0≈55 に「覚醒」「侵蝕」の行見出し）
#          固有バフ欄（x0≈56）
#
# 覚醒と侵蝕の境界は、行見出しの位置ではなく罫線で分ける。
# 行見出し（`覚` `醒`）は欄の上下中央に置かれるため、欄の先頭行より
# 下に来ることがあり、見出しの高さでは切れない（人格の抽出で同じ誤りを踏んだ）。
#
#   罫線は常に4本ある。73.6 / 84.9 / 93.4 は見出し欄の罫線で、
#   4本目だけが紙面ごとに変わる。これが覚醒と侵蝕の境界である。
#
#     p181: [73.6, 84.9, 93.4, 184.8]
#     p193: [73.6, 84.9, 93.4, 264.9]   同化スキルを持つため覚醒欄が広い
EGO_NO_RE = re.compile(r"^No\.(\d+)\s+(\d+)欠")
EGO_RESOURCES_RE = re.compile(r"^必要資源：(.+)$")
EGO_RANKS = ("ZAYIN", "TETH", "HE", "WAW", "ALEPH")

# SAN消費はランクで決まる（基本ルールブックのE.G.O 100件で例外なし）。
# 紙面には書かれていないため、既存DBと同じ対応を使う。
EGO_SAN_COST = {"ZAYIN": 10, "TETH": 15, "HE": 25, "WAW": 35, "ALEPH": 45}

EGO_HEAD_Y_MAX = 60.0
EGO_COL_PASSIVE_LABEL = (80.0, 112.0)
EGO_COL_PASSIVE = (112.0, 130.0)
EGO_COL_BODY = (62.0, 80.0)
EGO_COL_BUFF = (50.0, 62.0)
EGO_COL_GUTTER = (38.0, 50.0)

# スキル見出し。人格と違い名称を持たず、属性と大罪だけが並ぶ。
#   `斬撃広域3：嫉妬` / `貫通：怠惰`
EGO_ATTRS = r"斬撃|貫通|打撃|防御|回避"
EGO_SKILL_HEAD_RE = re.compile(rf"^({EGO_ATTRS})(?:広域(\d+))?[：:](\S+)$")
# 同化スキルの見出しは通し番号つきで名称を持つ。
#   `1：猿を蹴り倒す 打撃：憤怒`
EGO_SUB_SKILL_RE = re.compile(rf"^(\d+)[：:](.+?)\s+({EGO_ATTRS})(?:広域(\d+))?[：:](\S+)$")


def ego_head(rows):
    """紙面上端から、ランクと名称を読む。

    ランクと名称が同じ行にある紙面と、別の行に分かれている紙面がある。

      p181  「ZAYIN 私はチョキを出すね、そっちは？：あそんで？」  一行
      p193  「WAW」「『ガリヴァー』：馬脚の旅人 sponsored」      二行
    """
    top = [r for r in rows if r["y0"] < EGO_HEAD_Y_MAX]
    top.sort(key=lambda r: (round(r["y0"], 1), r["x0"]))
    rank = ""
    parts = []
    for row in top:
        text = row["text"].strip()
        for candidate in EGO_RANKS:
            if text == candidate:
                rank = candidate
                text = ""
                break
            if text.startswith(candidate + " "):
                rank = candidate
                text = text[len(candidate) + 1:].strip()
                break
        if text:
            parts.append(text)
    name = " ".join(parts).strip()
    # オリジナルE.G.Oの注記。名称の一部ではない。
    name = re.sub(r"\s*sponsored$", "", name).strip()
    return rank, name


def parse_ego_form(paragraphs):
    """覚醒／侵蝕の一欄を、見出し・効果・ダイス・同化スキルへ分ける。"""
    form = {"attr": "", "sin": "", "aoe": "", "effect": "", "dice": []}
    subs = []
    effects = []
    current = None  # 同化スキルを読んでいる間だけ立つ

    for paragraph in paragraphs:
        sub = EGO_SUB_SKILL_RE.match(paragraph)
        if sub:
            current = {
                "no": int(sub.group(1)), "name": sub.group(2).strip(),
                "attr": sub.group(3), "sin": sub.group(5),
                "aoe": f"広域対象{sub.group(4)}体" if sub.group(4) else "",
                "effect": "", "dice": [],
            }
            subs.append(current)
            continue

        head = EGO_SKILL_HEAD_RE.match(paragraph)
        if head and not form["attr"]:
            form["attr"] = head.group(1)
            form["sin"] = head.group(3)
            form["aoe"] = f"広域対象{head.group(2)}体" if head.group(2) else ""
            continue

        target = current if current is not None else form
        bucket = target["dice"]
        dice = DICE_RE.match(paragraph)
        if dice:
            bucket.append({"roll": dice.group(1), "effect": (dice.group(2) or "").strip()})
        elif bucket:
            # ダイスの後に続く段落は、直前のダイス効果の続きである。
            bucket[-1]["effect"] = (bucket[-1]["effect"] + "\n" + paragraph).strip("\n")
        elif current is not None:
            current["effect"] = (current["effect"] + "\n" + paragraph).strip("\n")
        else:
            effects.append(paragraph)

    form["effect"] = "\n".join(effects)
    return form, subs


def parse_ego(rows, rules):
    """1頁のE.G.Oを、DBのレコード形へ組み立てる。"""
    rank, name = ego_head(rows)
    ego = {
        "rank": rank, "name": name, "no": None, "shards": None,
        "san_cost": EGO_SAN_COST.get(rank), "resources": "",
        "passive_name": "", "passive_cond": "", "passive_effect": "",
        "kakusei": {"attr": "", "sin": "", "aoe": "", "effect": "", "dice": []},
        "shinshoku": {"attr": "", "sin": "", "aoe": "", "effect": "", "dice": []},
        "unique_buff": "", "sub_skills": [],
    }

    for row in rows:
        no = EGO_NO_RE.match(row["text"])
        if no:
            ego["no"] = int(no.group(1))
            ego["shards"] = int(no.group(2))
        resources = EGO_RESOURCES_RE.match(row["text"])
        if resources:
            ego["resources"] = resources.group(1).strip()

    # --- パッシブ欄。見出しは「名称 / 発動条件 / 効果」で、値は右の列にある。
    #     見出しは欄の上下中央に置かれるため、見出しの高さで値を引くと誤る。
    #     罫線（73.6 / 84.9 / 93.4）が欄の境界なので、これで値を分ける。
    passive_rows = [r for r in rows if in_col(r["x0"], EGO_COL_PASSIVE)]
    passive_rows.sort(key=lambda r: round(r["y0"], 1))
    fields = {"name": [], "cond": [], "effect": []}
    for row in passive_rows:
        if row["y0"] < rules[1]:
            fields["name"].append(row)
        elif row["y0"] < rules[2]:
            fields["cond"].append(row)
        else:
            fields["effect"].append(row)
    ego["passive_name"] = " ".join(join_wrapped(fields["name"]))
    ego["passive_cond"] = " ".join(join_wrapped(fields["cond"]))
    ego["passive_effect"] = "\n".join(join_wrapped(fields["effect"]))

    # --- 覚醒／侵蝕欄。4本目の罫線が両者の境界である。
    body = [r for r in rows if in_col(r["x0"], EGO_COL_BODY) and r["y0"] > rules[2]]
    body.sort(key=lambda r: round(r["y0"], 1))
    boundary = rules[3] if len(rules) > 3 else float("inf")
    kakusei_rows = [r for r in body if r["y0"] < boundary]
    shinshoku_rows = [r for r in body if r["y0"] >= boundary]

    kakusei, subs = parse_ego_form(join_wrapped(kakusei_rows))
    shinshoku, more_subs = parse_ego_form(join_wrapped(shinshoku_rows))
    ego["kakusei"] = kakusei
    ego["shinshoku"] = shinshoku
    ego["sub_skills"] = subs + more_subs

    # --- 固有バフ欄。E.G.Oは本文をそのまま1つの文字列として持つ。
    buff_rows = [r for r in rows
                 if in_col(r["x0"], EGO_COL_BUFF) and r["text"] not in GUTTER_WORDS]
    buff_rows.sort(key=lambda r: round(r["y0"], 1))
    ego["unique_buff"] = "\n".join(join_wrapped(buff_rows))
    return ego


def ego_section_pages(pages, sections):
    """E.G.O節の紙面（0起点）を返す。

    範囲は節見出しから求める。人格と同じく、紙面番号を定数で書かない。
    """
    start = sections.get(EGO_SECTION)
    if start is None:
        return []
    end = next_section_page(sections, start, len(pages))
    return list(range(start, min(end, len(pages))))


def collect_egos(pages, rules, sections):
    """E.G.O節の紙面を順に読み、レコードの一覧にする。

    E.G.O 1件は1頁に収まり、`No.101 100欠` の行を持つ紙面がその本体である。

    その行を持たない紙面（節の解説文だけの紙面）はレコードを産まない。
    どの紙面が実際にレコードになったかを `page` として持たせ、網羅性の検査が
    「読んだ範囲」ではなく「データが載っていた紙面」を問えるようにする。
    """
    egos = []
    for index in ego_section_pages(pages, sections):
        rows = pages[index]
        if not any(EGO_NO_RE.match(r["text"]) for r in rows):
            continue
        ego = parse_ego(rows, rules[index])
        ego["page"] = index
        egos.append(ego)
    return egos


# --- ショップ: 共通検出器へ委譲（旧条件語ベースの検出器は廃止）------------
def collect_shop():
    from detect_pdf_data import Document, shop_candidates, validate_candidates

    doc = Document.read("pack1")
    candidates = shop_candidates(doc)
    issues = validate_candidates(doc, candidates)
    if issues:
        raise ValueError(json.dumps(issues, ensure_ascii=False))
    return ([c["data"] for c in candidates if c["kind"] == "support_passives"],
            [c["data"] for c in candidates if c["kind"] == "spirits"])


def main(argv):
    pages, rules, verticals, sections = load_pages()
    heads = collect_persona_pages(pages, sections)

    personas = []
    for head in heads:
        indexes = [index for index in head["pages"] if index < len(pages)]
        page_rows = [pages[index] for index in indexes]
        rules_by_page = {index: rules[index] for index in indexes}
        personas.append(parse_persona(head["name"], page_rows, rules_by_page))

    normal = [p for p in personas if p["no"] is not None and p["no"] >= 111]
    tokui = [p for p in personas if p["no"] is not None and p["no"] < 111]
    unknown = [p for p in personas if p["no"] is None]

    egos = collect_egos(pages, rules, sections)

    print(f"人格見出し: {len(personas)}件")
    print(f"  通常人格（No.111以降）: {len(normal)}件")
    print(f"  特異人格（No.21以降）  : {len(tokui)}件")
    if unknown:
        print(f"  人格番号が取れなかったもの: {len(unknown)}件")
        for p in unknown:
            print(f"    {p['name']}")
    print(f"E.G.O: {len(egos)}件"
          + (f"（No.{egos[0]['no']}〜No.{egos[-1]['no']}）" if egos else ""))

    support, spirits = collect_shop()
    print(f"サポートパッシブ: {len(support)}件")
    print(f"精神: {len(spirits)}件")

    # 網羅性の検証（verify-pack-extract.mjs の検査5）に使うため、
    # データが載っている紙面を記録する。抽出側が「どこにデータがあったか」を
    # 申告し、検証側が「その紙面の本文が結果に現れているか」を問う。
    #
    # 申告するのは「走査した紙面」ではなく「レコードを産んだ紙面」である。
    # 節見出しの紙面には節の解説文（データの使い方・基本ルールブックへの参照）が
    # 組まれており、これはレコードにならない。走査範囲を申告してしまうと、
    # 検査5が解説文まで「データなのに抽出されていない」と報告する。
    # この旧コーパス監査の data_pages は人格・E.G.Oのみ。
    # ショップは共通検出器が全セル・短文・価格も含め別途検証する。
    # verify-pack-extract.mjs は共通検出器の新規抽出と完全一致を要求する。
    data_pages = sorted({number for head in heads for number in head["pages"]}
                        | {ego["page"] for ego in egos})
    # 紙面番号は抽出の来歴であってレコードの属性ではない。DBへ混ぜない。
    for ego in egos:
        ego.pop("page", None)

    payload = {
        "source": "新リンバスTRPG-特定抽出パック第一弾.pdf",
        # 紙面番号は1起点（原典のノンブルと同じ）で書き出す。
        "data_pages": [index + 1 for index in data_pages],
        "normal_personas": normal,
        "tokui_personas": tokui,
        "egos": egos,
        "support_passives": support,
        "spirits": spirits,
    }
    if "--write" in argv:
        OUT_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        print(f"\n{OUT_PATH.relative_to(ROOT)} へ書き出しました。")
    else:
        sample = normal[0] if normal else (personas[0] if personas else None)
        if sample:
            print("\n抜粋:")
            print(json.dumps(sample, ensure_ascii=False, indent=1)[:1600])
        print("\n--write を付けると中間ファイルへ書き出します。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
