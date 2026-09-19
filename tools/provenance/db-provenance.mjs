/* DB本文と原典PDFコーパスの照合ロジック。
   監査コマンド（tools/audit-db-provenance.mjs）と
   回帰テスト（tests/db-provenance.test.mjs）の両方から使う。

   判定方針（docs/data-provenance-goal.md P1）:
     - 紙面見出し `「〇〇の人格」` を境界に、人格ごとの紙面ブロックを作る
     - DBの本文が、その人格のブロック内に部分文字列として実在するかを判定する
     - 比較時は空白・句読点・全角半角の差を正規化する（PDFの組版由来の差を許容）
     - 自分のブロックに無いが他頁にある本文は、用語集などからの引用として別区分にする
     - どこにも無い本文だけを破損（missing）として報告する */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CORPUS_FILES = ["core.txt", "supplement.txt", "pack1.txt"];

/* PDFの組版では、同じ本文が次のような差をもって現れる。
     - 行折り返しによる空白・改行の挿入
     - 句読点の有無（「。」「、」がDB側にだけ付く／付かない）
     - 全角数字・全角記号（０１２／％＋－）
     - 長音符と水平バーの混在（ダメージ／ダメ―ジ）。原典の同じ語の中でも混在する。
     - 箇条書きの先頭記号（`-` `・`）。紙面では字下げ、DBでは区切り文字として現れる。
     - 紙面の下端にあるページ番号。頁の本文を連結すると本文の途中へ紛れ込む。
   これらは意味の差ではないため、比較前に取り除く。 */
/* 乗算記号は原典・DBのどちらでも `x` `ｘ` `×` が混在する。
   `埋花針の数x2`（原典）と `埋花針の数×2`（DB）は同じ本文である。 */
const WIDE_TO_NARROW = { "０": "0", "１": "1", "２": "2", "３": "3", "４": "4", "５": "5", "６": "6", "７": "7", "８": "8", "９": "9", "％": "%", "＋": "+", "－": "-", "～": "~", "ｘ": "x", "Ｘ": "x", "\u00D7": "x" };
/* 長音符・水平バー・ダッシュ類は、原典・DBのどちらでも同じ語に対して揺れる。
   いずれも長音として同一視する。 */
const DASH_RE = /[\u2014\u2015\u2212\uFF0D\u30FC\u2043\u002D\u2010\u2011\u2012\u2013]/g;
const NOISE_RE = /[\s\u3000。、，,．.・：:；;／/]/g;

export function canon(value) {
  let text = String(value == null ? "" : value);
  text = text.replace(/[０-９％＋－～ｘＸ\u00D7]/g, (ch) => WIDE_TO_NARROW[ch] || ch);
  text = text.replace(DASH_RE, "\u30FC");
  return text.replace(NOISE_RE, "");
}

export function loadCorpus(dir = path.join(root, "data", "provenance")) {
  const parts = [];
  for (const file of CORPUS_FILES) {
    const full = path.join(dir, file);
    if (!existsSync(full)) {
      throw new Error(`原典コーパスがありません: ${path.relative(root, full)}\ntools/extract-pdf-corpus.mjs でPDFから生成してください。`);
    }
    parts.push({ key: file.replace(/\.txt$/, ""), text: readFileSync(full, "utf8") });
  }
  return parts;
}

function splitPages(text) {
  const pages = new Map();
  /* 見出しの `SECTION` は、その紙面に節見出し（16pt以上の大見出し）が
     あることを抽出器が記録した印である（extract_pdf_corpus.has_section_title）。 */
  const chunks = text.split(/\n===== PAGE (\d+)( SECTION)? =====\n/);
  for (let i = 1; i < chunks.length; i += 3) {
    const page = Number(chunks[i]);
    pages.set(page, {
      raw: stripPageNumber(chunks[i + 2] || "", page),
      section: Boolean(chunks[i + 1])
    });
  }
  return pages;
}

/* 紙面の隅にあるノンブル（ページ番号）は、単独の行として抽出される。
   頁をまたぐ本文を照合するために頁を連結すると、この数字が本文の途中へ紛れ込み、
   一致しなくなる。行全体がその頁の番号である場合だけ取り除く。 */
function stripPageNumber(text, page) {
  const label = String(page);
  return text
    .split("\n")
    .filter((line) => line.trim() !== label)
    .join("\n");
}

/* 人格データの紙面は表組みで、左端に行見出しの列がある。
   pdftotext -layout はこの列を本文と同じ行に出力するため、
   本文が折り返されると見出し語が本文の途中へ割り込む。

     マッチ勝利時、対象が出血状態なら、スキルの最後の
       効果
     ダイス威力+1

   この「効果」は表の行見出しであって本文ではない。
   見出し語は表の定型語に限られるので、本文照合の前に取り除く。 */
const GUTTER_TOKENS = [
  "人格No.", "人格", "No.", "HP", "SAN", "速度", "弾丸",
  "パッシブ", "名称", "発動条件", "効果", "常時発動",
  "戦術", "戦", "術", "固有", "固", "有"
];
const GUTTER_ALT = "(?:" + GUTTER_TOKENS.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + "|[0-9\uFF10-\uFF19]{1,2})";
// 行がちょうど見出し語だけ（`効果` `戦` `4` など）の場合は本文ではない。
const GUTTER_ONLY_RE = new RegExp("^" + GUTTER_ALT + "(?:[ \\t\\u3000]+" + GUTTER_ALT + ")*$");
/* 行頭に見出し語が連続し（`パッシブ 常時発動`）、そのあと桁揃えの空白を挟んで
   本文が始まる形を取り除く。本文との境界は2文字以上の空白で判断する。 */
const GUTTER_PREFIX_RE = new RegExp("^" + GUTTER_ALT + "(?:[ \\t\\u3000]+" + GUTTER_ALT + ")*[ \\t\\u3000]{2,}");

function stripGutterLabels(text) {
  const out = [];
  for (const raw of String(text || "").split("\n")) {
    const line = raw.trim();
    if (!line || GUTTER_ONLY_RE.test(line)) continue;
    out.push(line.replace(GUTTER_PREFIX_RE, "").trim());
  }
  return out.filter(Boolean).join("\n");
}

/* コーパス全体を、紙面の並び順どおりの頁リストへ展開する。 */
function buildPageIndex(corpus) {
  const pageIndex = [];
  for (const { key, text } of corpus) {
    const pages = splitPages(text);
    for (const n of [...pages.keys()].sort((a, b) => a - b)) {
      const entry = pages.get(n) || { raw: "", section: false };
      pageIndex.push({ source: key, page: n, raw: entry.raw, section: entry.section });
    }
  }
  return pageIndex;
}

/* 人格見出しは `「〇〇の人格」` として現れるが、長い名前は紙面上で折り返され
   （例: `「人差し指遂行者：` / `【紙片】の人格」`）行単位では一致しない。
   そのため頁全体を正規化した文字列に対して見出しを探す。 */
function locateHeadings(pageIndex, personaNames) {
  const pageCanon = pageIndex.map((entry) => canon(entry.raw));
  const headingAt = new Map();
  personaNames.forEach((name) => {
    const needle = `「${canon(name)}の人格」`;
    const at = pageCanon.findIndex((text) => text.includes(needle));
    if (at >= 0) headingAt.set(canon(name), at);
  });
  return headingAt;
}

/* 固有バフの定義が次頁へ渡る人格があるため、
   見出し頁から次の見出し頁の直前までを一つのブロックとして扱う。

   ただし人格データの並びが途切れる箇所（章の終わり）では、
   次の見出しまでに解説頁が挟まる。その解説文までブロックへ取り込むと、
   本文の直後に無関係な文章が続いて見え、切断の判定を誤る。

   続き頁かどうかは、節見出しの有無で決める。
   節見出し（本文6ptに対し16pt以上の大見出し）のある紙面は、
   節の解説文が組まれた紙面であって、直前の人格データの続きではない。
   これが無いと、章末の人格（例: 触腕事務所フィクサー）のブロックが
   次章の解説文まで伸びてしまい、切断の誤検出につながる。

   かつては「ダイス表記・能力値行・固有バフ定義・表の行見出しのいずれかが
   現れる紙面を人格データとみなす」という体裁の判定を使っていた。
   これは近似であり、それらを一つも含まない続き頁を解説頁と誤る。

     紙面159（パック）「蜘蛛の巣 人差し指の親方」固有バフ「武器」の続き
       ・ハンマーで後頭部を潰すべきときは…
       └打撃武器。このダイスのダメージは打撃属性として適用される。…

     武器の説明が並ぶだけでダイス表記も能力値も無いため、続き頁を
     ブロックから外し、そこにしかない本文を「原典に無い」と報告していた。

   節見出しは組版上の事実であり、体裁の当てずっぽうではない。
   原典全体で、見出しの間に挟まる非データ頁は9頁あるが、そのうち
   実際に節の解説頁なのは節見出しを持つ1頁（基本ルール紙面203）だけで、
   残りは白紙か人格データの続きである。

   かつては「人格1件の紙面は多くて2頁」として上限を2頁と置いていた。
   これは抽出器側で直したのと同じ誤りである（`extract_pack_data.find_sections`）。
   パック第一弾には6頁にわたる人格（蜘蛛の巣 人差し指の親方 紙面154〜159）があり、
   3頁目以降がブロックから外れる。すると

     - その頁にしかない本文が「原典に無い」と報告される（誤検出）
     - 頁をまたいで続く本文の後半が見えず、切断を検出できない（見落とし）

   の両方が起きていた。実際に8件の誤検出を生んでいた。

   上限を6頁へ広げるのでは同じ誤りを繰り返す。範囲は
   「次の人格見出しまで、ただし人格データの体裁を保っている限り」
   という紙面の事実だけで決める。頁数を数えない。 */
function startsNewSection(entry) {
  return Boolean(entry?.section);
}

function blockRange(headingAt, at, pageIndex = []) {
  const headingPages = [...new Set([...headingAt.values()])].sort((a, b) => a - b);
  const next = headingPages.find((p) => p > at);
  const limit = next === undefined ? at + 1 : next;
  /* 見出し頁から、次の人格見出しの直前まで伸ばす。
     節見出しのある紙面に当たったらそこで止める。 */
  let end = at + 1;
  while (end < limit && !startsNewSection(pageIndex[end])) end++;
  return [at, end];
}

export function buildPersonaBlocks(corpus, personaNames = []) {
  const pageIndex = buildPageIndex(corpus);
  const headingAt = locateHeadings(pageIndex, personaNames);
  const blocks = new Map();
  headingAt.forEach((at, key) => {
    const [start, end] = blockRange(headingAt, at, pageIndex);
    let body = "";
    for (let i = start; i < end; i++) body += pageIndex[i].raw + "\n";
    blocks.set(key, {
      canon: canon(body),
      delabeled: canon(stripGutterLabels(body))
    });
  });
  return blocks;
}

/* 一つの人格に対応する紙面を、表示用にそのまま取り出す。
   本文修正時に紙面の記載を確認するために使う（tools/provenance/show-source.mjs）。 */
export function findPersonaPages(corpus, personaName, { raw = false } = {}) {
  const pageIndex = buildPageIndex(corpus);
  const headingAt = locateHeadings(pageIndex, [personaName]);
  const at = headingAt.get(canon(personaName));
  if (at === undefined) return [];
  const [start, end] = blockRange(headingAt, at, pageIndex);
  const out = [];
  for (let i = start; i < end; i++) {
    const entry = pageIndex[i];
    out.push({
      source: entry.source,
      page: entry.page,
      text: raw ? entry.raw : stripGutterLabels(entry.raw)
    });
  }
  return out;
}

export function buildCorpusIndex(corpus) {
  return corpus.map(({ key, text }) => ({
    key,
    canon: canon(text),
    delabeled: canon(stripGutterLabels(text))
  }));
}

/* 監査対象の本文を、人格レコードから項目パス付きで取り出す。
   出力に現れる自由文（パッシブ・固有バフ説明・スキル効果・ダイス効果）を対象とする。
   名称や属性などの短い語は、紙面のレイアウト上で分断されていても意味が変わらないため対象外。 */
export function collectPersonaTexts(persona) {
  const rows = [];
  const push = (label, text) => {
    if (typeof text === "string" && text.trim()) rows.push({ label, text });
  };
  push("passive_effect", persona.passive_effect);
  push("passive_always", persona.passive_always);
  (persona.unique_buffs || []).forEach((buff) => push(`固有バフ「${buff?.name || ""}」`, buff?.desc));
  (persona.skills || []).forEach((skill) => {
    const head = `${skill?.rank || "スキル"}「${skill?.name || ""}」`;
    push(`${head}/効果`, skill?.effect);
    (skill?.dice || []).forEach((dice, index) => push(`${head}/ダイス${index + 1}`, dice?.effect));
  });
  return rows;
}

/* 本文が原典の途中で切れていないかを見る。

   部分一致だけでは「途中で切れた本文」を見逃す。原典では文がまだ続いているのに
   DB側がその手前で終わっている場合、DBの本文は原典の部分文字列として一致してしまう。

   そこで一致位置の直後に続く文字を調べ、それが「同じ文の続き」を示す場合だけ
   切断とみなす。次の場合は切断ではない。
     - 一致が原典の末尾で終わる
     - 直後が別の記載の始まり（ダイス表記・表の見出し・括弧書きの状態定義など）

   紙面は表組みで、セルの終わりに句点が置かれないことが多いため、
   句点の有無では判定できない。続きが同じ文の一部かどうかで判断する。 */
/* 次の記載の始まりを表す形。
     - ダイス表記 : `2d7` `5d2+3` `16ー1d10`（`16-1d10` の負符号は長音へ正規化される）
     - 戦術選択   : `2b4`
     - 状態定義   : `[破裂爆発]` `【毒】` `「…」`
     - 表の見出し : `効果` `固有` `戦術` など
     - 能力値行   : `HP` `SAN` `速度` と攻撃属性・弾丸
     - 派生スキル : `3怨念抽出` のように戦術番号がスキル名の直前に付く */
const NEXT_RECORD_RE = /^(?:\d+[ー+]?\d*d\d|\d+b\d|\[|【|「|固有|戦術|パッシブ|名称|発動条件|効果|常時発動|HP|SAN|速度|斬撃|貫通|打撃|回避|防御|弾丸)/;
/* 紙面では、ある記載の直後に次の記載が始まる。
   次の記載は、その人格の別のスキル・固有バフ・パッシブであり、
   見出しはスキル名やバフ名（「お返し」「きらめく願望」などひらがな始まりも多い）、
   本体は別の項目の本文である。

   これらを「文の続き」と誤認しないよう、その人格が持つ
   名称と本文のすべてを記載の境界として渡す。
   DBが原典を正しく写している限り、隣の記載は必ずこの一覧のどれかで始まる。 */
function recordBoundaryTexts(persona, currentLabel) {
  const out = [];
  const add = (value) => {
    const text = canon(value);
    // 1文字の語はどこにでも現れるため、境界として使うと切断を見逃す。
    if (text.length >= 2) out.push(text);
  };
  (persona?.skills || []).forEach((skill) => add(skill?.name));
  (persona?.unique_buffs || []).forEach((buff) => add(buff?.name));
  // 自分自身は境界にしない（同じ本文が直後に続く場合を切断として扱うため）。
  collectPersonaTexts(persona).forEach(({ label, text }) => {
    if (label !== currentLabel) add(text);
  });
  return out;
}

/* 一致位置の前後が「別の記載の境界」なら、DBの本文は完結している。
   そうでなければ、原典の文がまだ続いているのに転記が途中で切れている。

   どの語が文の続きになりうるかは列挙できない（原典の語彙は広い）ため、
   逆に「記載の区切りとして現れるもの」だけを列挙し、それ以外は続きとみなす。
   区切りは、ダイス表記・表の行見出し・括弧書きの状態定義、
   そしてその人格が持つスキル名・固有バフ名である。

   前後の両方を見るのが要点である。末尾だけを見ていた時期があり、
   文頭が欠けた本文を見逃していた。

     原典: 刺突爆雷を消費する時、対象の火傷の数だけ火傷ダメージを与える
     DB  : ージを与える                （メリアニア工房フィクサー 効果）

   DB側は原典の部分文字列なので一致し、末尾も原典の文末と揃うため、
   末尾の検査だけでは完結して見えてしまう。 */
function detectTruncation(needle, block, boundaries) {
  /* 原典が同じ本文を一つの段落として組んでいれば、転記は完結している。

     区切り語の列挙（`NEXT_RECORD_RE` など）は、続きの語彙を言い当てられない
     ぶんを補うための近似である。近似なので、区切りとして列挙していない語が
     直後に来ると「文が続いている」と誤って読む。

       原典（紙面230）  4d4：破壊不能ダイス。弾丸を1消費。   ← ここで段落が終わる
                        4d4：破壊不能ダイス。弾丸を1消費。
                        このダイスで弾丸を消費したなら、的中時、火傷4を付与

       DB              破壊不能ダイス。弾丸を1消費。

     `canon()` は句読点を落とすので、連結すると
     `…弾丸を1消費このダイスで弾丸を…` となり、次のダイスの定義が
     文の続きに見える。東部親指カポIIII の6ダイスすべてが誤検出されていた。

     段落は組版から復元した原典の事実であり、区切り語の当てずっぽうではない。
     DBの本文がまるごと一つの段落と一致するなら、そこが文の終わりである。
     ダイス表記（`4d4`）は行頭の見出しなので、その分だけ前に付いていてもよい。 */
  const completesParagraph = () => {
    const prefix = /^(?:\d+[dD]\d+(?:[+\-\u30FC]\d+)?|\d+)$/;
    return paragraphHeads().some((paragraph) => paragraph === needle
      || (paragraph.endsWith(needle)
        && prefix.test(paragraph.slice(0, paragraph.length - needle.length))));
  };

  const startsNewRecord = (after) => {
    if (!after) return true;
    if (NEXT_RECORD_RE.test(after)) return true;
    if (boundaries.some((name) => after.startsWith(name))) return true;
    /* 派生スキルの見出しは `3怨念抽出` のように戦術番号が名称の前に付く。
       先頭の数字を除いた位置でも境界かどうかを見る。 */
    const withoutRank = after.replace(/^\d{1,2}/, "");
    return withoutRank !== after && boundaries.some((name) => withoutRank.startsWith(name));
  };

  for (const hay of [block.delabeled, block.canon]) {
    let from = 0;
    let anyMatch = false;
    while (true) {
      const at = hay.indexOf(needle, from);
      if (at < 0) break;
      anyMatch = true;
      // この出現位置では記載が完結している（＝正しい転記）なら、切断ではない。
      if (startsNewRecord(hay.slice(at + needle.length))) return null;
      from = at + 1;
    }
    if (anyMatch) {
      // すべての出現位置で文が続いて見えた。
      // 原典が段落として完結させているなら、区切り語の見落としである。
      if (completesParagraph()) return null;
      // 最初の位置の続きを報告する。
      const at = hay.indexOf(needle);
      return { after: hay.slice(at + needle.length, at + needle.length + 40) };
    }
  }
  return null;
}

/* 原典の段落の先頭（正規化済み）を集める。文頭の欠落を見るために使う。

   `canon()` は句読点を落とすため、一致位置の直前を見て「文の始まりか」を
   判定することはできない（`。` も `：` も残らない）。
   代わりに、組版から復元した段落（*.paragraphs.txt）の先頭を根拠にする。
   DBが原典を正しく写しているなら、その本文はどこかの段落の先頭から始まる。 */
let paragraphHeadCache = null;
function paragraphHeads(dir = path.join(root, "data", "provenance")) {
  if (paragraphHeadCache) return paragraphHeadCache;
  const heads = [];
  for (const file of CORPUS_FILES) {
    const full = path.join(dir, file.replace(/\.txt$/, ".paragraphs.txt"));
    if (!existsSync(full)) continue;
    for (const line of readFileSync(full, "utf8").split("\n")) {
      const flat = canon(line);
      if (flat) heads.push(flat);
    }
  }
  paragraphHeadCache = heads;
  return heads;
}

/* DBの本文が、原典の段落の途中から始まっていないか。

     原典: 刺突爆雷を消費する時、対象の火傷の数だけ火傷ダメージを与える
     DB  : ージを与える                （メリアニア工房フィクサー 効果）

   DB側は原典の部分文字列なので実在の照合は通り、末尾も原典の文末と
   揃うため末尾の検査も通ってしまう。段落の先頭と突き合わせて初めて
   文頭が欠けていることが分かる。

   複数行を持つ項目は、最初の行だけを見る（続く行は原典の別段落に対応する）。 */
function detectHeadTruncation(text) {
  const first = canon(String(text).split("\n")[0]);
  // 短い断片はどこにでも現れるため、判定の根拠にならない。
  if (first.length < 6) return null;

  /* ダイス効果は紙面では `2d7：的中時、…` とダイス表記に続けて組まれる。
     DBは表記（roll）と効果（effect）を分けて持つため、効果の本文は
     段落の先頭ではなく「ダイス表記の直後」から始まるのが正しい。
     スキル名や属性に続く場合も同じで、これらは切断ではない。 */
  const HEAD_PREFIX_RE = /^(?:\d+[dD]\d+(?:[+\-ー]\d+)?|\d+[+\-ー]\d*[dD]\d+)$/;
  for (const head of paragraphHeads()) {
    /* 段落がDBの本文で始まる（またはDBの本文が段落全体を含む）なら、文頭は揃っている。
       短い段落を `first.startsWith(head)` で拾うと、`ー` のような1文字の段落が
       何にでも一致して判定を無効にするため、比較に足る長さのものだけを使う。 */
    if (head.startsWith(first)) return null;
    if (head.length >= 6 && first.startsWith(head)) return null;
    const at = head.indexOf(first);
    if (at > 0 && HEAD_PREFIX_RE.test(head.slice(0, at))) return null;
  }

  /* 段落の先頭とも、ダイス表記の直後とも揃わない。
     原典のどこかの段落の途中に現れるなら、その手前から欠けている。 */
  for (const head of paragraphHeads()) {
    const at = head.indexOf(first);
    if (at > 0) return { before: head.slice(Math.max(0, at - 40), at) };
  }
  return null;
}

export function auditPersonas(db, corpus) {
  const groups = [
    ["通常", db.normal_personas || []],
    ["特異", db.tokui_personas || []]
  ];
  const names = groups.flatMap(([, list]) => list.map((p) => p?.name).filter(Boolean));
  const blocks = buildPersonaBlocks(corpus, names);
  const index = buildCorpusIndex(corpus);
  const findings = [];
  for (const [mode, list] of groups) {
    for (const persona of list) {
      const key = canon(persona?.name);
      const block = blocks.get(key);
      if (!block) {
        findings.push({ mode, persona: persona?.name, label: "(紙面)", text: "", code: "page-not-found" });
        continue;
      }
      for (const { label, text } of collectPersonaTexts(persona)) {
        const needle = canon(text);
        if (!needle) continue;
        // 素の抽出と、表の行見出しを除いた抽出の両方で照合する。
        if (block.canon.includes(needle) || block.delabeled.includes(needle)) {
          /* 部分一致だけでは「途中で切れた本文」を見逃す。
             原典では文がまだ続いているのに、DB側がその手前で終わっている場合、
             DBの本文は原典の部分文字列として一致してしまう。
             一致位置の直後が文の途切れ（句点でも紙面上の区切りでもない）なら、
             転記途中の切断として報告する。 */
          /* 末尾の切断（原典の文がまだ続いている）と、
             文頭の切断（原典の段落の途中から始まっている）の両方を見る。 */
          const cut = detectTruncation(needle, block, recordBoundaryTexts(persona, label))
            || detectHeadTruncation(text);
          if (cut) {
            findings.push({
              mode, persona: persona?.name, label, text, code: "truncated",
              // 文頭・文末のどちらが欠けているかを示すため、取れた側を持たせる。
              head: cut.before, continuation: cut.after
            });
          }
          continue;
        }
        /* 複数行の本文は、紙面では間に別の組版要素を挟んで並ぶことがある。

             原典（紙面158）「蜘蛛の巣 人差し指の親方」固有バフ「武器」
               …ダメージ量+1（最大5）
               [武器] 中立バフ            ← 欄の見出し
               ・手斧で肋骨を叩き割るときは…
               └打撃武器。…

           DBは見出しを `name` に、本文を `desc` に分けて持つため、
           `desc` の各行は紙面上で連続していても、`canon()` で連結した文字列は
           見出しの分だけ食い違う。パッシブ欄が2つある人格（DB側で連結して持つ）や
           欄をまたぐ本文でも同じことが起きる。

           全体が1つの連続した文字列として一致しなくても、各行が
           その人格の紙面に順番どおり現れるなら、本文は原典にある。
           行の順序まで見るのは、別の欄から拾った行を寄せ集めて
           「実在する」と誤判定しないためである。 */
        const linesInOrder = (hay) => {
          let from = 0;
          for (const line of String(text).split("\n")) {
            const part = canon(line);
            if (!part) continue;
            const at = hay.indexOf(part, from);
            if (at < 0) return false;
            from = at + part.length;
          }
          return true;
        };
        if (String(text).includes("\n")
          && (linesInOrder(block.canon) || linesInOrder(block.delabeled))) {
          continue;
        }

        const elsewhere = index.find((entry) => entry.canon.includes(needle) || entry.delabeled.includes(needle));
        findings.push({
          mode,
          persona: persona?.name,
          label,
          text,
          code: elsewhere ? "quoted-elsewhere" : "missing",
          source: elsewhere?.key
        });
      }
    }
  }
  return findings;
}

export function loadDb(file = path.join(root, "data", "db.json")) {
  return JSON.parse(readFileSync(file, "utf8"));
}

export function loadExceptions(file = path.join(root, "data", "provenance", "exceptions.json")) {
  if (!existsSync(file)) return [];
  return JSON.parse(readFileSync(file, "utf8")).entries || [];
}

/* 例外は「人格名＋項目パス」で登録する。理由の記述を必須とし、
   根拠のない除外が積み上がらないようにする。 */
export function isExcepted(finding, exceptions) {
  return exceptions.some((entry) => entry.persona === finding.persona
    && entry.label === finding.label
    && String(entry.reason || "").trim().length > 0);
}
