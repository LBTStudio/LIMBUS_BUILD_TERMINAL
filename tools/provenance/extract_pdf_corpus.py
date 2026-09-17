#!/usr/bin/env python3
"""原典PDFから照合用のテキストコーパスを書き出す。

出力先は data/provenance/*.txt で、ページ境界を `===== PAGE n =====` で区切る。
原典PDFは sources/ に格納されているため、引数なしで実行できる。

    python3 tools/provenance/extract_pdf_corpus.py

抽出には PyMuPDF を使う。人格データの紙面は表組みで、
PyMuPDF はセル単位で読み順を保つため、セルの内容が途中で分断されない。

pdftotext -layout も読み順は保つが、表の左端にある行見出し（`効果` `戦` `術` など）を
本文と同じ行へ出力するため、本文が折り返されると見出し語が本文の途中へ割り込む。
照合の精度が落ちるので、PyMuPDF を既定とする。


段落境界の判定（docs/output-fidelity-goal.md）
----------------------------------------------
抽出したテキストの改行は、次の二つが混在していて区別できない。

  折り返し   一つの段落が組版上の桁数で折り返されただけ
  段落境界   原典が意図して改行した位置

DBが原典の段落構造を保持しているかを照合するには、この区別が必要である。
推測ではなく組版情報で判定する。行のbboxが段（セル）の右端まで
到達しているかを見て、次の文字が入る余白を残して終わっている行を段落末とする。

  紙面206「N社握らんとする者」戦術4 の例

    自分に狂信があるならダメージ量+5。対象が機械融和生命体なら追   x1=252.19 余白 0.0  → 折り返し
    30-6d5：的中時、対象の出血が5以上なら火傷7を付与。            x1=224.64 余白27.5  → 段落境界
    敵討伐時、次のRに打撃威力増加1を得る

段の右端は、同じ字下げ位置（x0）を共有する行の x1 の最大値とする。
表のセルは左揃えで組まれているため、これがそのセルの右端になる。

余白と比べるのはフォントサイズではなく、「次の行の先頭文字の実際の字幅」である。
「その文字が前の行に入ったか」をそのまま問うため、半角文字や約組の行でも誤らない。

  紙面97「北部ヂェーヴィチ協会4課フィクサー」の例（セル右端 253.15）

    舞台開始時、デリバリーキャリアが0の状態で開始す   x1=247.18 余白5.97 次の先頭「る」6.00 → 入らない = 折り返し
    る。戦線離脱時、ランダムな味方2名にマッチ威力増加

余白が字幅にわずかに足りないという差を見るため、割合ではなく字幅そのままを
しきい値とする。紙面206の余白27.5ptとは桁が違うので、両方を正しく分けられる。

行は読み順（上から下、同じ高さなら左から右）に並べるが、
字下げ位置が変わった時点でそのセルは終わりなので段落を確定する。
これをしないと、表の左端にある行見出し（`固` `有` `戦` `術`）や
紙面の隅のノンブルが、隣のセルの本文の途中へ割り込む。

  誤: R終了時、次のRにデュラハン1を得る。…または混乱状固態なら消滅
                                              ^^ 行見出し「固」が本文へ混入
  誤: 敵討伐時、次のRに打撃威力増加1を得る206
                                          ^^^ ノンブルが本文末尾へ混入

出力は二種類を書き出す。

  <key>.txt            従来と同じ素のテキスト（文字照合に使う）
  <key>.paragraphs.txt 折り返しを連結し、段落境界だけを改行にした版

後者は段落照合（tools/provenance/audit-db-paragraphs.mjs）が使う。
"""
import sys
from pathlib import Path

TARGETS = [
    ("core", "新リンバスTRPG.pdf"),
    ("supplement", "新リンバスTRPG サプリメント 『アンロックド・シンク』.pdf"),
]

# 行末に残る余白に「次の行の先頭文字」が入らないなら、その改行は折り返しである。
# 字幅そのままをしきい値とする（「入るか」をそのまま問う）。
WRAP_ROOM_RATIO = 1.0
# 同じセルに属すると見なす字下げ位置（x0）の許容差（pt）。
X0_CLUSTER_TOLERANCE = 1.0
# 行頭に置けない文字（行頭禁則）。これらが次の行の先頭にあるなら、
# 組版は前の行へ収めようとして入らなかったのであり、段落境界ではない。
#
# 対象は句読点と閉じ括弧に限る。小書き仮名や長音符も本来は行頭禁則だが、
# それらは語の途中にも現れるため、行頭に来るかどうかと無関係に数えてしまう。
#
#   マッチ敗北時：次のRにパワー2を得る
#    ^ 「ッ」は語中の促音であって、行頭へ送られた文字ではない
#
# これを禁則として数えると必要な幅を過大に見積もり、
# 実際には段落境界である位置を折り返しと誤判定する。
# 句読点・閉じ括弧は語中に現れても直前の文字と分離できない点は同じなので、
# 前の行へ送るには合計の幅が要るという判定はそのまま成り立つ。
LINE_START_FORBIDDEN = set("。、．，.,!?！？：；:;)]}）］｝」』】〉》〕｠")



def page_lines(page):
    """1頁の行を、字下げ位置・右端・先頭文字幅つきで返す。

    先頭文字の幅を持つのは、前の行の末尾に「この文字が入る余白があったか」を
    判定するためである。フォントサイズではなく実際の字幅を使うと、
    半角文字や約組の行でも判定を誤らない。
    """
    rows = []
    for block in page.get_text("rawdict")["blocks"]:
        if block.get("type") != 0:
            continue
        for line in block["lines"]:
            chars = [c for span in line["spans"] for c in span["chars"]]
            text = "".join(c["c"] for c in chars)
            if not text.strip():
                continue
            x0, y0, x1, _ = line["bbox"]
            visible = [c for c in chars if c["c"].strip()] or chars
            lead = visible[0]
            # 先頭文字の直後に続く行頭禁則文字の幅。
            # これらは先頭文字と切り離せないため、前の行へ送るには合計の幅が要る。
            lead_run = []
            for char in visible[1:]:
                if char["c"] not in LINE_START_FORBIDDEN:
                    break
                lead_run.append(char["bbox"][2] - char["bbox"][0])
            rows.append({
                "text": text.strip(),
                "x0": x0,
                "x1": x1,
                "y0": y0,
                # この行の先頭文字の字幅。前の行の余白と比べる。
                "leadWidth": lead["bbox"][2] - lead["bbox"][0],
                "leadRun": lead_run,
            })
    return rows


class ColumnEdges:
    """段の右端を、文書全体の組版から求めて保持する。

    右端を「そのセル内の最大 x1」で推定すると、セルの最長行がたまたま
    段落の終わりだった場合に、その行の余白が0となり折り返しと誤判定する。

      紙面205「N社握らんとする者」スキル2
        マッチ開始時：対象が機械融和生命体ならスキル威力+2  x1=223.56 ← セル内最大
        マッチ勝利時：次のRに狂信2を得る                 x1=170.01
      セル内最大を右端とすると上の行の余白が0になり、実際には段落境界なのに
      折り返しと誤り、二つの段落を連結してしまう。

    折り返しは文書全体で何度も起き、その度に行末は段の右端へ到達する。
    同じ字下げ位置の行を文書全体から集め、その最大 x1 を段の右端とすれば
    個々のセルが短くても正しい値が得られる。

    本文の段は紙面によって幅が違う（約253pt と 約223pt）ため、
    字下げ位置ごとに分けて保持する。
    """

    def __init__(self):
        self._by_x0 = {}

    def observe(self, rows):
        for row in rows:
            key = round(row["x0"] / X0_CLUSTER_TOLERANCE)
            current = self._by_x0.get(key)
            if current is None or row["x1"] > current:
                self._by_x0[key] = row["x1"]

    def edge_for(self, row):
        key = round(row["x0"] / X0_CLUSTER_TOLERANCE)
        return self._by_x0.get(key, row["x1"])


def page_cells(rows, edges):
    """行を字下げ位置ごとのセルへまとめ、セル単位の読み順で返す。

    表のセルは左揃えなので、同じ x0 を共有する行はすべて同じセルに属する。
    段の右端は `column_edges()` が文書全体から求めた値を使う。

    頁全体を y 順に並べるのではなく、セル単位でまとめてから
    セルの先頭の高さ順に並べる。表の左端にある行見出し（`固` `有` `戦` `術`）は
    本文と高さが重なるため、単純な y 順では本文の折り返しの間へ割り込む。

      誤（頁を y 順に並べた場合）
        R終了時、次のRにデュラハン1を得る。自分が士気低下状態または混乱状
        固                                    ← 行見出しが折り返しの間へ割り込む
        態なら消滅

    セルごとにまとめれば、本文の折り返しは途切れず連結できる。
    二段組みの解説頁でも、左段を読み終えてから右段へ移る順になる。
    """
    clusters = []
    for row in sorted(rows, key=lambda r: r["x0"]):
        for cluster in clusters:
            if abs(cluster["x0"] - row["x0"]) <= X0_CLUSTER_TOLERANCE:
                cluster["rows"].append(row)
                break
        else:
            clusters.append({"x0": row["x0"], "rows": [row]})

    for cluster in clusters:
        for row in cluster["rows"]:
            row["frameRight"] = edges.edge_for(row)
        cluster["rows"].sort(key=lambda r: r["y0"])
        cluster["top"] = cluster["rows"][0]["y0"]

    clusters.sort(key=lambda c: (round(c["top"], 1), c["x0"]))
    return clusters


def is_wrapped(row, next_row):
    """この行の改行が折り返しか。

    次の行の先頭文字がこの行の行末の余白へ入らないなら、
    改行したのは組版の都合であり、原典が意図した段落境界ではない。
    次の行がない（セルの最終行）場合は、そこで段落が終わる。

    行頭禁則が働いた行は、余白の比較だけでは判定できない。

      紙面97「北部ヂェーヴィチ協会4課フィクサー」
        舞台開始時、デリバリーキャリアが0の状態で開始す  x1=247.18 余白7.10
        る。戦線離脱時、ランダムな味方2名にマッチ威力増加

      余白7.10ptは全角1文字（6.00pt）より広いので、単純な比較では
      段落境界に見える。しかし次の行は「る。」で始まり、
      「。」を行頭へ置けない禁則のため「る」も前の行へ送れなかった。
      実際には2文字分（12.00pt）の空きが必要で、余白は足りていない。

    次の行の先頭が行頭禁則文字なら、その文字までを含めた幅で比べる。
    """
    if next_row is None:
        return False
    room = row["frameRight"] - row["x1"]
    needed = next_row["leadWidth"]
    # 「る。」のように、禁則文字が続く限り前の行へは一緒にしか送れない。
    for char_width in next_row["leadRun"]:
        needed += char_width
    return room < needed * WRAP_ROOM_RATIO


def extract(pdf_path: Path):
    """素のテキストと、段落を復元したテキストの二つを返す。"""
    import pymupdf

    doc = pymupdf.open(pdf_path)

    # 段の右端は文書全体の組版から決まるので、先に全頁の行を観測する。
    pages = [page_lines(page) for page in doc]
    edges = ColumnEdges()
    for rows in pages:
        edges.observe(rows)

    plain = []
    paragraphs = []
    for index, page in enumerate(doc):
        header = f"\n===== PAGE {index + 1} =====\n"
        plain.append(header)
        plain.append(page.get_text("text"))

        paragraphs.append(header)
        for cell in page_cells(pages[index], edges):
            buffer = ""
            cell_rows = cell["rows"]
            for position, row in enumerate(cell_rows):
                buffer += row["text"]
                following = cell_rows[position + 1] if position + 1 < len(cell_rows) else None
                if is_wrapped(row, following):
                    # 折り返しなので次の行へ続く。日本語は行末に空白を入れない。
                    continue
                paragraphs.append(buffer + "\n")
                buffer = ""
            # セルの終わりは段落の終わりでもある。
            if buffer:
                paragraphs.append(buffer + "\n")
    return "".join(plain), "".join(paragraphs)


def main(argv: list[str]) -> int:
    root = Path(__file__).resolve().parents[2]
    out_dir = root / "data" / "provenance"
    out_dir.mkdir(parents=True, exist_ok=True)

    if argv:
        if len(argv) != len(TARGETS):
            print("使い方: python3 tools/provenance/extract_pdf_corpus.py [<基本ルールPDF> <サプリメントPDF>]", file=sys.stderr)
            print("引数を省略すると sources/ のPDFを使う。期待するPDF:", file=sys.stderr)
            for _, label in TARGETS:
                print(f"  - {label}", file=sys.stderr)
            return 2
        paths = [Path(a) for a in argv]
    else:
        paths = [root / "sources" / label for _, label in TARGETS]

    for (key, label), pdf_path in zip(TARGETS, paths):
        if not pdf_path.exists():
            print(f"PDFが見つかりません: {pdf_path}", file=sys.stderr)
            return 2
        plain, paragraphs = extract(pdf_path)
        (out_dir / f"{key}.txt").write_text(plain, encoding="utf-8")
        (out_dir / f"{key}.paragraphs.txt").write_text(paragraphs, encoding="utf-8")
        pages = plain.count("===== PAGE ")
        print(f"{key}: {pages}頁 -> data/provenance/{key}.txt, {key}.paragraphs.txt  ({label})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
