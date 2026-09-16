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
const CORPUS_FILES = ["core.txt", "supplement.txt"];

/* PDFの組版では、同じ本文が次のような差をもって現れる。
     - 行折り返しによる空白・改行の挿入
     - 句読点の有無（「。」「、」がDB側にだけ付く／付かない）
     - 全角数字・全角記号（０１２／％＋－）
     - 長音符と水平バーの混在（ダメージ／ダメ―ジ）。原典の同じ語の中でも混在する。
     - 箇条書きの先頭記号（`-` `・`）。紙面では字下げ、DBでは区切り文字として現れる。
     - 紙面の下端にあるページ番号。頁の本文を連結すると本文の途中へ紛れ込む。
   これらは意味の差ではないため、比較前に取り除く。 */
const WIDE_TO_NARROW = { "０": "0", "１": "1", "２": "2", "３": "3", "４": "4", "５": "5", "６": "6", "７": "7", "８": "8", "９": "9", "％": "%", "＋": "+", "－": "-", "～": "~", "ｘ": "x", "Ｘ": "x" };
/* 長音符・水平バー・ダッシュ類は、原典・DBのどちらでも同じ語に対して揺れる。
   いずれも長音として同一視する。 */
const DASH_RE = /[\u2014\u2015\u2212\uFF0D\u30FC\u2043\u002D\u2010\u2011\u2012\u2013]/g;
const NOISE_RE = /[\s\u3000。、，,．.・：:；;／/]/g;

export function canon(value) {
  let text = String(value == null ? "" : value);
  text = text.replace(/[０-９％＋－～ｘＸ]/g, (ch) => WIDE_TO_NARROW[ch] || ch);
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
  const chunks = text.split(/\n===== PAGE (\d+) =====\n/);
  for (let i = 1; i < chunks.length; i += 2) {
    const page = Number(chunks[i]);
    pages.set(page, stripPageNumber(chunks[i + 1] || "", page));
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
      pageIndex.push({ source: key, page: n, raw: pages.get(n) || "" });
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
   人格1件の紙面は多くて2頁なので、上限を2頁とする。

   さらに、2頁目が人格データの続きかどうかを紙面の体裁で確かめる。
   人格データの紙面（続き頁を含む）には、次のいずれかが必ず現れる。
     - ダイス表記（例: 2d10）や能力値行（HP / SAN / 速度）
     - 固有バフの定義（例: [激熱]最大10 中立バフ）
     - 表の行見出し（固有 / 戦術）
   いずれも無い頁は章の解説頁なので、ブロックへ取り込まない。
   これが無いと、章末の人格（例: 触腕事務所フィクサー）のブロックが
   次章の解説文まで伸びてしまい、切断の誤検出につながる。 */
const MAX_BLOCK_PAGES = 2;
const PERSONA_PAGE_RES = [
  /\d+\s*[dD]\s*\d/,                    // ダイス表記
  /(?:HP|SAN|速度)\s*\d/,                // 能力値行
  /[[【][^\]】\n]{1,24}[\]】]\s*最大/,     // 固有バフの定義
  /固\s*有|戦\s*術/                      // 表の行見出し
];
function looksLikePersonaPage(entry) {
  const raw = entry?.raw || "";
  return PERSONA_PAGE_RES.some((re) => re.test(raw));
}

function blockRange(headingAt, at, pageIndex = []) {
  const headingPages = [...new Set([...headingAt.values()])].sort((a, b) => a - b);
  const next = headingPages.find((p) => p > at);
  const limit = next === undefined ? at + 1 : next;
  let end = Math.min(limit, at + MAX_BLOCK_PAGES);
  /* 続き頁が解説頁なら取り込まない（章末の人格で誤判定を防ぐ）。 */
  while (end > at + 1 && !looksLikePersonaPage(pageIndex[end - 1])) end--;
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

/* 一致位置の直後が「次の記載の始まり」なら、DBの本文は完結している。
   そうでなければ、原典の文がまだ続いているのに転記が止まっている。

   どの語が文の続きになりうるかは列挙できない（原典の語彙は広い）ため、
   逆に「記載の区切りとして現れるもの」だけを列挙し、それ以外は続きとみなす。
   区切りは、ダイス表記・表の行見出し・括弧書きの状態定義、
   そしてその人格が持つスキル名・固有バフ名である。 */
function detectTruncation(needle, block, boundaries) {
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
      // すべての出現位置で文が続いていた。最初の位置の続きを報告する。
      const at = hay.indexOf(needle);
      return hay.slice(at + needle.length, at + needle.length + 40);
    }
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
          const cut = detectTruncation(needle, block, recordBoundaryTexts(persona, label));
          if (cut) {
            findings.push({ mode, persona: persona?.name, label, text, code: "truncated", continuation: cut });
          }
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
