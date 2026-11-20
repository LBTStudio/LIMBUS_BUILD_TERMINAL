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
import json
import re
import sys
from pathlib import Path

TARGETS = [
    ("core", "エラッタ最新版/新リンバスTRPG.pdf"),
    ("supplement", "エラッタ最新版/新リンバスTRPG サプリメント 『アンロックド・シンク』.pdf"),
    ("pack1", "エラッタ最新版/新リンバスTRPG-特定抽出パック第一弾.pdf"),
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

# 数値は途中で改行できない。`10` を `1` と `0` に割って組むことはないので、
# 行頭の数値は、その桁数すべてが前の行に入らなかったことを意味する。
#
#   紙面98「ラ・マンチャランド 王子」固有バフ「硬血甲冑」
#     自分のHPが減少した状態なら、攻撃スキル終了時に与えたダメージ量の  余白5.36pt
#     10％だけHP回復。（最大10）
#
#   先頭文字「1」の字幅は3.33ptなので余白に収まり、1文字だけで比べると
#   段落境界に見える。実際に送られたのは「10」の2桁（6.66pt）であって入らない。
#   同じ本文が紙面199では一行に組まれており、段落境界でないことが裏づけられる。
#
# 符号は数値の一部として扱う（`-2` `+1`）。直前の語から切り離せないためである。
# 一方 `-温度が10以上の時…` のような箇条書きの記号は、記号の直後が数字でないので
# 数値とはみなさず、段落の始まりでありうる。
LINE_START_NUMBER_SIGN = set("-+\u2010\u2015\u2212\uFF0B\uFF0D")
LINE_START_DIGITS = re.compile(r"\d")


def unbreakable_run(visible):
    """行頭の先頭文字と切り離せない、後続文字の字幅を返す。

    前の行の余白と比べるべき幅は、先頭1文字ではなく
    「前の行へ送るとしたらまとめて送るほかない文字列」の幅である。

    まとめて送るほかないものは二種類ある。

      行頭禁則   句読点・閉じ括弧は行頭に置けないので、直前の文字と一緒に送る
      数値       `10` を `1` と `0` に割って組むことはないので、桁ごと一緒に送る
    """
    widths = []
    width_of = lambda char: char["bbox"][2] - char["bbox"][0]

    # 数値で始まる行は、符号と桁すべてが一つのまとまりである。
    rest = visible[1:]
    if visible[0]["c"] in LINE_START_NUMBER_SIGN and rest and LINE_START_DIGITS.match(rest[0]["c"]):
        widths.append(width_of(rest[0]))
        rest = rest[1:]
    if LINE_START_DIGITS.match(visible[0]["c"]) or widths:
        while rest and LINE_START_DIGITS.match(rest[0]["c"]):
            widths.append(width_of(rest[0]))
            rest = rest[1:]

    # 数値の直後にも禁則文字は続きうる（`10）` `+2。`）。
    for char in rest:
        if char["c"] not in LINE_START_FORBIDDEN:
            break
        widths.append(width_of(char))
    return widths


def page_lines(page):
    """1頁の行を、字下げ位置・右端・先頭文字幅つきで返す。

    先頭文字の幅を持つのは、前の行の末尾に「この文字が入る余白があったか」を
    判定するためである。フォントサイズではなく実際の字幅を使うと、
    半角文字や約組の行でも判定を誤らない。

    左右の端は行のbboxではなく、目に見える文字の外側から求める。
    行のbboxには行末の空白まで含まれており、その空白が本文より大きな
    フォントサイズで組まれていると、行の右端が本文の右端より先へ伸びる。

      紙面126（パック）
        本文 span  「…処分が使用可能になる」 size 6.00  x1=257.71
        空白 span  「 」                     size 10.56 x1=260.11
        行のbbox                                        x1=260.11

    この 260.11 が段の右端として文書全体に採用されると、本文が右端まで
    到達している行（x1=257.4）に 2.7pt の余白があるように見え、
    折り返しを段落境界と誤る。空白は組版の余りであって本文ではないので、
    段の右端の根拠にしない。
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
            visible = [c for c in chars if c["c"].strip()] or chars
            x0 = min(c["bbox"][0] for c in visible)
            x1 = max(c["bbox"][2] for c in visible)
            y0 = line["bbox"][1]
            lead = visible[0]
            lead_run = [w for w in unbreakable_run(visible)]
            rows.append({
                "text": text.strip(),
                "x0": x0,
                "x1": x1,
                "y0": y0,
                "y1": line["bbox"][3],
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

    ただし、同じ字下げ位置が幅の違う段で使われている場合がある。

      紙面311 幻想体の解説  x0=89.45 の行は右端 256.66 まで伸びる
      紙面332 支援パッシブ表  x0=89.45 だが欄は 227.9 で終わる

    文書全体の最大値（256.66）を紙面332へ当てると、欄の右端まで
    達している行に34ptの余白があるように見え、折り返しを段落境界と誤る。

      誤: マッチ開始時、互いの出血ダメージ量+3。使用す   ← ここで段落を切ってしまう
          るスキルが色欲属性ならさらに互いの出血ダメー

    その紙面に縦罫線があれば、それが欄の右端である。組版が明示している
    境界なので、推定値より優先する。縦罫線のない紙面では従来どおり
    文書全体の最大値を使う。
    """

    def __init__(self):
        self._by_x0 = {}

    def observe(self, rows):
        for row in rows:
            key = round(row["x0"] / X0_CLUSTER_TOLERANCE)
            current = self._by_x0.get(key)
            if current is None or row["x1"] > current:
                self._by_x0[key] = row["x1"]

    def edge_for(self, row, verticals=()):
        key = round(row["x0"] / X0_CLUSTER_TOLERANCE)
        estimated = self._by_x0.get(key, row["x1"])
        # 行の右側にあり、かつその行の高さを含む縦罫線。そこが欄の右端である。
        # 高さを見ないと、別の欄を区切る罫線を当ててしまう（page_verticals 参照）。
        bounds = [x for x, top, bottom in verticals
                  if x >= row["x1"] and top <= row["y0"] <= bottom]
        if bounds:
            return min(min(bounds), estimated)
        return estimated


def page_rules(page):
    """紙面の水平な罫線の y 座標を返す。表の欄の上下の区切りである。

    罫線は線（`l`）でも、高さのごく薄い矩形（`re`）でも描かれる。
    どちらも拾い、短いもの（装飾）は除く。
    """
    MIN_RULE_WIDTH = 30.0
    values = set()
    for drawing in page.get_drawings():
        for item in drawing["items"]:
            if item[0] == "l":
                start, end = item[1], item[2]
                if abs(start.y - end.y) < 0.5 and abs(end.x - start.x) > MIN_RULE_WIDTH:
                    values.add(round(start.y, 1))
            elif item[0] == "re":
                rect = item[1]
                if rect.height < 1.5 and rect.width > MIN_RULE_WIDTH:
                    values.add(round(rect.y0, 1))
    return sorted(values)


def page_verticals(page):
    """紙面の垂直な罫線を `(x, y上端, y下端)` の一覧で返す。欄の左右の区切りである。

    欄の右端を文字の位置から推定すると、同じ字下げ位置が幅の違う段で
    使われている紙面で誤る（`ColumnEdges` の説明を参照）。
    縦罫線があれば、それが組版の明示した境界である。

    高さ（y の範囲）も持たせる。縦罫線はその高さの範囲でだけ欄を区切るためで、
    x だけを見ると無関係な行へ当ててしまう。

      紙面189（パック）E.G.O No.109
        縦罫線 x=114.05 は y 93.86〜109.82（パッシブ欄の区切り）
        本文  「斬撃広域12：憤怒」は y=113.48 でその範囲の外にある

      高さを見ないと、この行の右端を 254.14 ではなく 114.10 と誤り、
      余白2.81ptで折り返しと判定して次の行と連結していた。
    """
    MIN_RULE_HEIGHT = 15.0
    values = set()
    for drawing in page.get_drawings():
        for item in drawing["items"]:
            if item[0] == "l":
                start, end = item[1], item[2]
                if abs(start.x - end.x) < 0.5 and abs(end.y - start.y) > MIN_RULE_HEIGHT:
                    values.add((round(start.x, 1), round(min(start.y, end.y), 1),
                                round(max(start.y, end.y), 1)))
            elif item[0] == "re":
                rect = item[1]
                if rect.width < 1.5 and rect.height > MIN_RULE_HEIGHT:
                    values.add((round(rect.x0, 1), round(rect.y0, 1), round(rect.y1, 1)))
    return sorted(values)


def page_cells(rows, edges, rules=(), verticals=()):
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

    ただし x0 だけでは足りない。表では縦に並ぶ複数のセルが同じ字下げ位置を
    共有するため、それらが一つのまとまりになってしまう。

      紙面27（パック）スキル欄。3つのセルがどれも x0=71.30
        4d2+1                                             ← 「歯車の導くままに」の最終行
        奇襲命令 打撃：暴食                                ← 次のセルの見出し
        2d7+2：的中時、…次のRに麻痺1を付与   余白5.16pt   ← このセルの最終行
        蒸気 打撃：憂鬱                                    ← さらに次のセルの見出し

      最終行は右端まで達しているため折り返しと判定され、
      次のセルの見出しと連結して「…麻痺1を付与蒸気 打撃：憂鬱」になっていた。

    セルの上下の境界は罫線である。罫線を跨ぐ行は別のセルに属するので、
    字下げ位置が同じでも分ける。罫線が取れない紙面では従来どおり x0 だけで分ける。
    """
    def band(row):
        """この行が、上下どの罫線の間にあるか。"""
        return sum(1 for rule in rules if rule <= row["y0"])

    clusters = []
    for row in sorted(rows, key=lambda r: r["x0"]):
        key = band(row)
        for cluster in clusters:
            if abs(cluster["x0"] - row["x0"]) <= X0_CLUSTER_TOLERANCE and cluster["band"] == key:
                cluster["rows"].append(row)
                break
        else:
            clusters.append({"x0": row["x0"], "band": key, "rows": [row]})

    for cluster in clusters:
        for row in cluster["rows"]:
            row["frameRight"] = edges.edge_for(row, verticals)
        cluster["rows"].sort(key=lambda r: r["y0"])
        cluster["top"] = cluster["rows"][0]["y0"]

    clusters.sort(key=lambda c: (round(c["top"], 1), c["x0"]))
    return clusters


# 語の途中でしか現れない文字。行頭に来たなら、それは折り返しである。
#
# 長音符・促音・拗音は語頭に立たない（「ージ」「ッ」「ャ」で始まる語はない）。
# 同じく、行末がこれらで終わることもない（「ダメ」で終わる語はあるが、
# 次の行が「ージ」で始まるなら両者は一つの語である）。
#
#   紙面225（パック）ショップの表
#     士気低下効果：R終了時、全ての味方に8の追加ダメ   余白6.43pt
#     ージを与える
#
#   余白6.43ptは全角1文字（6.00pt）をわずかに上回るため、余白の比較では
#   段落境界に見える。しかし「追加ダメ」と「ージを与える」は
#   「追加ダメージ」という一つの語であって、切れているのは組版の都合である。
#
# 余白の差が丸め誤差の範囲（0.43pt）にある場合、組版情報だけでは決められない。
# 語の形は原典の文字そのものなので、推測ではなく根拠になる。
WORD_INTERNAL_ONLY = set("ーッャュョァィゥェォヮヵヶっゃゅょぁぃぅぇぉ")


def splits_a_word(text, next_text):
    """この改行が、一つの語を途中で割っているか。

    次の行の先頭が語中にしか現れない文字なら、前の行の続きである。
    """
    if not text or not next_text:
        return False
    return next_text[0] in WORD_INTERNAL_ONLY


BRACKET_PAIRS = {"[": "]", "【": "】", "（": "）", "(": ")", "「": "」", "『": "』"}


def has_unclosed_bracket(text):
    """この行が、括弧を開いたまま終わっているか。

    括弧が閉じないまま段落が終わることはない。閉じ括弧は必ず同じ段落の中にある。
    行末で開いたままなら、閉じ括弧は次の行にあり、つまり折り返しである。

      紙面133（パック）「薬指野獣派 ドーセント」
        引き裂かれた色彩[ルージュ]・引き裂かれた色彩[ブ    余白わずか
        ル]・果敢なタッチの付与量+1

      `[ブ` で開いた括弧は次の行の `ル]` で閉じる。字幅の比較では
      段落境界に見えることがあるが、組版上は一つの語の途中である。

      これを段落境界と読むと、出力（CCFOLIA）でも括弧が切り離され、
      `引き裂かれた色彩[ブ` という読めない本文が利用者に出る。

    字幅は丸め誤差と区別できないことがあるが、括弧の対応は原典の文字
    そのものなので、推測ではなく根拠になる。
    """
    stack = []
    for char in text:
        if char in BRACKET_PAIRS:
            stack.append(BRACKET_PAIRS[char])
        elif stack and char == stack[-1]:
            stack.pop()
    return bool(stack)


# それ自体が欄の始まりを名乗る行の形。
#
#   [シュトの亀裂] 最大10 デバフ
#   [武器] 中立バフ
#   [点穴-○○] 最大3 中立バフ
#
# バフ欄の見出しは「[名前] （最大N） 種別」という決まった形で組まれる。
# この形は本文の続きとしては成り立たない。前の行がどんな文で終わっていても、
# その文の続きが「…なる[シュトの亀裂] 最大10 デバフ」になることはない。
#
# 字幅だけでは決められない場合があるため、この形を根拠に使う。
#
#   紙面107（パック）「LCAウアジェト 先鋒三隊隊長」
#     ・上記の効果にて対象のダイスが減算ダイスなら、過半数が未半数になる  余白1.52pt
#     [シュトの亀裂] 最大10 デバフ                       先頭文字幅2.03pt
#
#   不足はわずか0.51pt。丸め誤差と区別できない。字幅で決めると折り返しと
#   判定し、見出しが前の段落の末尾に貼りつく。すると抽出器は見出しを
#   見つけられず、そのバフ1件がまるごとレコードから落ちる。
#
# 原典全体では見出し225件のうち223件が単独行として組まれており、
# 貼りついて見えるのは字幅が丸め誤差の範囲に入った7件だけである。
# つまり「見出しは段落の先頭にある」というのは組版上の規則であって、
# 個別の紙面に合わせた例外ではない。
FIELD_HEAD_RE = re.compile(r"^[\[【](.+?)[\]】]\s*(?:最大\s*\d+\s*)?"
                           r"(?:中立バフ|バフ|デバフ)\s*$")


def starts_a_field(next_text):
    """次の行が、それ自体で欄の始まりを名乗っているか。"""
    return bool(next_text) and bool(FIELD_HEAD_RE.match(next_text))


# 丸括弧だけで閉じた短い補足。前の文に掛かる修飾であって、段落の始まりではない。
#
#   （最大3）  （最低7）  （使用後消滅）  （1ダイス最大7）
#
# 角括弧・隅付き括弧は除く。それらは見出しとして単独の行になる。
#
#   【ステータス】  【パッシブ】  【戦術】     ← 節の見出し（段落の始まり）
#   [シュトの亀裂] 最大10 デバフ              ← 欄の見出し（starts_a_field）
PARENTHETICAL_RE = re.compile(r"^[（(][^（()）]{1,14}[）)]$")


def _timing_marker_re():
    """発動タイミングの見出し語で始まる行を見分ける正規表現。

    `使用時：` `マッチ勝利時：` のような見出しは、効果の一区切りの先頭に立つ。
    前の文の続きとして現れることはない。

      紙面228（基本ルール）「ジア家家主候補」戦術4「赤春」
        使用時：メインターゲットのデバフが5種類以上ならスキル威力+5  余白4.59pt
        マッチ勝利時：破裂5を付与

      余白4.59ptは全角1文字（6.00pt）に足りないため折り返しと判定され、
      二つの効果が一文に連結していた。組版上は別の行であり、別の効果である。

    語彙は `data/timing-markers.json` を正とする。
    同じ語彙を出力側（js/generator.js）も使っており、
    どちらか一方に書くと必ずずれる。一つのファイルから両方が読む。
    """
    path = Path(__file__).resolve().parents[2] / "data" / "timing-markers.json"
    if not path.exists():
        return None
    words = json.loads(path.read_text(encoding="utf-8"))["words"]
    # 長い語から先に評価する。`攻撃時` が `一方攻撃時` に先んじると
    # 語の途中で一致してしまう。
    ordered = sorted(words, key=len, reverse=True)
    return re.compile(r"^(?:" + "|".join(ordered) + r")\s*[：:]")


TIMING_MARKER_RE = _timing_marker_re()


def starts_a_clause(next_text):
    """次の行が、発動タイミングの見出しで始まっているか。"""
    if not next_text or TIMING_MARKER_RE is None:
        return False
    return bool(TIMING_MARKER_RE.match(next_text))


# ダイスの行見出し。`2d7+2：` `4d3：` のように、出目に続けて効果を組む。
#
# この形は本文の続きとしては成り立たない。前の文がどう終わっていても、
# その続きが「…スキルd値+3 2d7+2：破壊不能ダイス」になることはない。
DICE_HEAD_RE = re.compile(r"^\d+\s*[dD]\s*\d+(?:\s*[+\-\u30FC]\s*\d+)?\s*[：:]")


def starts_a_dice_row(next_text):
    """次の行が、ダイスの行見出しで始まっているか。

      紙面66（パック）「LCE E.G.O::AEDD」戦術4-2
        使用時：自分の充電が10以上なら、充電を10消費してスキルd値+3  余白3.03pt
        2d7+2：破壊不能ダイス。的中時、破裂2を付与し[破裂爆発]。破裂3消費

      余白3.03ptは先頭文字（3.33pt）にわずかに足りないため折り返しと判定され、
      ダイス1行目がまるごとスキルの効果欄へ流れ込んでいた。
      利用者から見ると、効果の文が途中からダイスの説明に変わって読めない。
    """
    return bool(next_text) and bool(DICE_HEAD_RE.match(next_text))


def continues_previous(row, next_row):
    """次の行が、前の行の文に掛かる補足か。

    行末に余白があっても、そこで段落が終わったとは限らない。
    組版は括弧書きの補足を次の行へ送ることがある。

      紙面119（基本ルール）「黒獣-巳」戦術3「変形伸腕」
        使用時：自分の呼吸と対象の破裂の合計10ごとにスキル威力+1  余白13.35pt
        （最大2）

      余白13.35ptは全角2文字ぶんあるので、字幅の比較では段落境界に見える。
      しかし「（最大2）」は直前の「スキル威力+1」に掛かる補足であって、
      独立した段落ではない。実際、同じ本文が一行に組まれた紙面もある。

    括弧だけで完結した短い行が、前の行と同じ字下げ位置にあるときに限る。
    字下げが違えば別の欄なので、掛かり先が無い。
    """
    if next_row is None:
        return False
    if not PARENTHETICAL_RE.match(next_row["text"]):
        return False
    # 同じ欄（同じ字下げ位置）に属することを確かめる。
    return abs(row["x0"] - next_row["x0"]) <= X0_CLUSTER_TOLERANCE


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

    比べる幅は先頭1文字ではなく、切り離せずまとめて送るほかない文字列
    （`unbreakable_run`）までを含めた幅とする。禁則文字と数値の桁がこれに当たる。

    余白が1文字にわずかに足りない・わずかに足るという差は、組版の丸め誤差と
    区別できない。その場合は本文の形を根拠にする。
    語が割れているなら折り返し（`splits_a_word`）、
    次の行が欄の見出しを名乗るなら段落境界（`starts_a_field`）である。
    """
    if next_row is None:
        return False
    if splits_a_word(row["text"], next_row["text"]):
        return True
    # 括弧を開いたまま行が終わっているなら、閉じ括弧は次の行にある。
    if has_unclosed_bracket(row["text"]):
        return True
    # 次の行が欄の見出しを名乗っているなら、そこは段落の始まりである。
    # 字幅の判定より先に決める（`starts_a_field` の説明を参照）。
    if starts_a_field(next_row["text"]):
        return False
    # 発動タイミングの見出しは効果の一区切りの先頭に立つ。前の文の続きではない。
    if starts_a_clause(next_row["text"]):
        return False
    # ダイスの行見出しも同じく、行の先頭にしか立たない。
    if starts_a_dice_row(next_row["text"]):
        return False
    # 括弧書きの補足は前の文に掛かる。余白があっても段落は切れていない。
    if continues_previous(row, next_row):
        return True
    room = row["frameRight"] - row["x1"]
    needed = next_row["leadWidth"]
    # 「る。」「10」のように、切り離せない文字が続く限り一緒にしか送れない。
    for char_width in next_row["leadRun"]:
        needed += char_width
    return room < needed * WRAP_ROOM_RATIO


# 節見出しは本文より大きなフォントで組まれている（本文6.0〜10.6pt、節見出し16pt以上）。
SECTION_TITLE_MIN_SIZE = 13.0


def has_section_title(page):
    """この紙面に節見出しがあるか。

    節見出しのある紙面は、節の解説文（データの使い方・他書への参照）が
    組まれた紙面であって、直前の人格データの続きではない。

    照合側（db-provenance.mjs）はPDFではなくコーパスを読むため、
    この事実を紙面の見出し行に書き出して伝える。
    """
    for block in page.get_text("dict")["blocks"]:
        if block.get("type") != 0:
            continue
        for line in block["lines"]:
            for span in line["spans"]:
                if (span["size"] >= SECTION_TITLE_MIN_SIZE
                        and len(span["text"].strip()) >= 3):
                    return True
    return False


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
        # 節見出しのある紙面には印を付ける。照合側が節の境界を知るために使う。
        mark = " SECTION" if has_section_title(page) else ""
        header = f"\n===== PAGE {index + 1}{mark} =====\n"
        plain.append(header)
        plain.append(page.get_text("text"))

        paragraphs.append(header)
        # 罫線は表のセルの上下境界。同じ字下げ位置の別セルを分けるのに使う。
        for cell in page_cells(pages[index], edges, page_rules(page), page_verticals(page)):
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
