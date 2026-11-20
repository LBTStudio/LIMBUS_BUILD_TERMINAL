#!/usr/bin/env node
/* DB本文の「日本語＋半角スペース＋日本語」を全走査し、PDF写識の折返し痕跡だけを
   機械的に検出する。

   三-book監査はDBと原典の「内容」を照合し、衛生監査（audit-db-hygiene.mjs）は
   改行位置と文字種を検査する。どちらも「半角スペース」の検査を持たないため、
   写識時の折返し痕跡が次の形で残留していた:

     DB  : このスキルが指令の印スキルなら、 マッチ威力+3
     原典: このスキルが指令の印スキルなら、マッチ威力+3   （1行）

     DB  : …呼吸を吸収 （1名ごとに最大3）
     原典: …呼吸を吸収 ⏎ （1名ごとに最大3）              （原典は改行）

   空白が意味を持つ場合もあるため、判定は原典側の証拠だけで決める。

     name         名前に含まれる空白（蜘蛛の巣 親指の親方 など）は保持
     pdf-space    原典がその位置に空白を書いている
     paragraph    原典が改行しており、后续が見出し（使用時：等）で始まる
                  -> 段落の境目として \n を戻す
     defect       上記以外 -> 写識痕跡として除去

   空白が名前の綴りを壊している場合（「紅炎殺最大感応 【劣化侵蝕】」）は
   正規名（紅炎殺 最大感応【劣化侵蝕】）へ復元する。空白の位置を直すだけである。

   判定は「候補を集める→原典と突き合わせる」の二段構え。走査は軽い抽出だけを行い、
   原典の照合は候補（数十件）にだけ適用して、DB全体を毎回照合しない。

   使い方:
     node tools/provenance/audit-db-wrap-spaces.mjs           # 違反を報告
     node tools/provenance/audit-db-wrap-spaces.mjs --write   # db.json を修正
     node tools/provenance/audit-db-wrap-spaces.mjs --json    # 機械可読の報告 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const write = process.argv.includes("--write");
const asJson = process.argv.includes("--json");

const dbPath = path.join(root, "data", "db.json");
const itemsPath = path.join(root, "data", "items.json");
const db = JSON.parse(readFileSync(dbPath, "utf8"));
const items = JSON.parse(readFileSync(itemsPath, "utf8"));

/* ---- 原典コーパス（物理行と紙番号） ------------------------------------
   空白の有無と改行位置は、PDFの物理行だけが証拠になる。 */
const corpusText = [];
for (const source of ["core", "pack1", "supplement"]) {
  const file = path.join(root, "data", "provenance", `${source}.txt`);
  let page = null;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const marker = line.match(/^=+\s*PAGE\s+(\d+)\s*=+$/);
    if (marker) { page = Number(marker[1]); continue; }
    corpusText.push({ source, page, text: line });
  }
}

const WIDE_TO_NARROW = {
  "\uFF10": "0", "\uFF11": "1", "\uFF12": "2", "\uFF13": "3", "\uFF14": "4",
  "\uFF15": "5", "\uFF16": "6", "\uFF17": "7", "\uFF18": "8", "\uFF19": "9",
  "\uFF05": "%", "\uFF0B": "+", "\uFF0D": "-", "\uFF5E": "~", "\uFF58": "x",
  "\uFF38": "x", "\u00D7": "x"
};
/* 比較は意味のない差異を除いて行う。全角半角・ダッシュの違いは写識の表記揺れ、
   空白と句読点は版面の影響を受けるため同値とみなす。 */
function core(value) {
  return String(value == null ? "" : value)
    .replace(/[\uFF10-\uFF19\uFF05\uFF0B\uFF0D\uFF5E\uFF58\uFF38\u00D7]/g, (ch) => WIDE_TO_NARROW[ch] || ch)
    .replace(/[\u2014\u2015\u2212\uFF0D\u30FC\u2043\u002D\u2010\u2011\u2012\u2013]/g, "\u30FC")
    .replace(/[\s\u3000\u3002\u3001\uFF0C,.\u30FB\uFF1A:;\uFF1B]/g, "");
}

const isJapanese = (ch) => /[\u3040-\u30FF\u4E00-\u9FFF\u3005\u3001-\u303F\uFF01-\uFF60]/.test(ch || "");
const isDigit = (ch) => /[0-9\uFF10-\uFF19]/.test(ch || "");

/* ---- 正規名 --------------------------------------------------------------
   空白を含む名前は、空白を除くと別の綴りになる。DB自身の名前の綴りを正とし、
   本文中に現れる同じ綴りも保護する。

   綴りが壊れた形（空白が落ちた「黒獣卯 奥義」・位置がずれた「紅炎殺最大感応 【劣化侵蝕】」）
   は、正規名から「空白を1つだけ動かした全ての形」を列挙して拾う。読点や括弧を
   またいだ範囲は窓に含めないため、隣接する別の名前とは誤結合しない。 */
const canonicalNames = new Set();
function registerName(name) {
  if (typeof name === "string" && name.includes(" ") && core(name).length >= 4) canonicalNames.add(name);
}
for (const collection of ["normal_personas", "tokui_personas", "egos", "support_passives", "spirits", "death_passives", "normal_enhancements", "special_enhancements"]) {
  for (const record of db[collection] || []) registerName(record.name);
}
for (const item of items || []) registerName(item.name);
for (const record of [...(db.normal_personas || []), ...(db.tokui_personas || []), ...(db.egos || [])]) {
  for (const skill of record.skills || []) registerName(skill.name);
  for (const sub of record.sub_skills || []) registerName(sub.name);
  for (const buff of record.unique_buffs || []) registerName(buff.name);
}

/* 正規名の空白を1つだけ動かして得られる全ての綴り -> 正規名。
   「黒獣 卯 奥義」の空白を1つ消すと「黒獣卯 奥義」「黒獣 卯奥義」になる。 */
const nameSpellings = new Map();
for (const canonical of canonicalNames) {
  nameSpellings.set(canonical, canonical);
  for (let i = 0; i < canonical.length; i++) {
    if (canonical[i] !== " ") continue;
    const removed = canonical.slice(0, i) + canonical.slice(i + 1);
    if (core(removed).length >= 4) nameSpellings.set(removed, canonical);
    for (let j = 0; j <= removed.length; j++) {
      if (j === i) continue;
      const moved = `${removed.slice(0, j)} ${removed.slice(j)}`;
      if (core(moved).length >= 4) nameSpellings.set(moved, canonical);
    }
  }
}

/* 后续が見出しで始まるか。原典が改行している位置で見出しが始まるなら、その改行は段落の境目であり、DBは段落を \n で表す約束である。ラウンド進行（1R：、2R：）も段落見出しである。 */
const TIMING_LABEL = /^(?:\u4F7F\u7528\u524D|\u4F7F\u7528\u5F8C|\u4F7F\u7528\u6642|\u653B\u6483\u524D|\u653B\u6483\u5F8C|\u4E2D\u7684\u6642|\u88AB\u30C0\u30E1\u30FC\u30B8\u6642|\u6575\u8A0A\u4F10\u6642|\u5473\u65B9\u8A0A\u4F10\u6642|\u30DE\u30C3\u30C1\u958B\u59CB\u6642|\u30DE\u30C3\u30C1\u9032\u884C\u6642|\u30DE\u30C3\u30C1\u7D42\u4E86\u6642|\u30DE\u30C3\u30C1\u52DD\u5229\u6642|\u30DE\u30C3\u30C1\u6557\u5317\u6642|\u6226\u95D8\u958B\u59CB\u6642|\u30AF\u30EA\u30C6\u30A3\u30AB\u30EB\u7684\u4E2D\u6642|\u30AF\u30EA\u30C6\u30A3\u30AB\u30EB\u6210\u529F\u6642|\u6DF7\u4E71\u6642|\u6B7B\u4EA1\u6642|\u518D\u88C5\u586B\u6642|R\u958B\u59CB\u6642|R\u7D42\u4E86\u6642|\u5224\u5B9A\u6642|\u56DE\u907F\u6210\u529F\u6642|\u56DE\u907F\u5931\u6557\u6642|\u9632\u5FA1\u6210\u529F\u6642|\u9632\u5FA1\u5931\u6557\u6642|\u5E38\u6642\u767A\u52D5|\d+R\s{0,2}[\uFF1A:])/;

/* 括弧タグ（[広域乱射][拘束判定][味方指定可能] など）は原典では独立した行に立ち、DBも \n で段落を作る約束である。 */
const BRACKET_TAG_TAIL = /\[[^\]\n]{1,12}\]$/;

/* 空白の前後の原典照合用の窓。句読点で区切ると「…を与える。 振動爆発…」のように
   空白が句読点の直後に来たときに窓が空になるため、区切り文字は1個は含める。
   2個以上を含むと別の文へまたがって照合してしまう。 */
const CONTEXT_STOP = /[\s\u3000\u3002\u3001\uFF0C,.\u30FB\uFF1A:;\uFF1B\n]/;
function rawContext(text, index, max) {
  let start = index;
  while (start > 0 && index - start < max && !CONTEXT_STOP.test(text[start - 1])) start--;
  if (start > 0 && CONTEXT_STOP.test(text[start - 1]) && text[start - 1] !== " ") start--;
  let end = index + 1;
  while (end < text.length && end - index - 1 < max && !CONTEXT_STOP.test(text[end])) end++;
  if (end < text.length && CONTEXT_STOP.test(text[end]) && text[end] !== " ") end++;
  return [text.slice(start, index), text.slice(index + 1, end)];
}

/* 原典の空でない物理行（core 化）。改行の位置はこの行の境界だけが証拠になる。
   ページ見出しは行ではないため除いて、行同士の隣接関係で判定する。 */

/* 原典の段落（paragraphs.txt の1行が1段落）。折返しが「段落の中」か
   「段落の境目」かは、この段落だけで決まる。段落の書き起こしは紙面の
   折返し（折り返し位置の空白や、2段組みの混在）を.):含むため、空白の存否と
   段落の境目の両方をこのファイルで判定する。 */
const paragraphs = [];
for (const source of ["core", "pack1", "supplement"]) {
  const file = path.join(root, "data", "provenance", `${source}.paragraphs.txt`);
  let page = null;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const marker = line.match(/^=+\s*PAGE\s+(\d+)\s*=+$/);
    if (marker) { page = Number(marker[1]); continue; }
    const text = line.trim();
    if (!text) continue;
    const flat = core(text);
    if (flat) paragraphs.push({ source, page, text, flat });
  }
}

function paragraphVerdict(coreBefore, coreAfter) {
  let join = false;
  let brk = null;
  for (let i = 0; i < paragraphs.length; i++) {
    if (paragraphs[i].flat.includes(coreBefore + coreAfter)) join = true;
    if (paragraphs[i].flat.endsWith(coreBefore) && paragraphs[i + 1] && paragraphs[i + 1].flat.startsWith(coreAfter)) {
      brk = `${paragraphs[i].source} p.${paragraphs[i].page}`;
    }
  }
  /* 同じ段落の中の折返しが最優先。境目と読める場合でも、段落が続いている
     ならDBは連結する（刻呪殺剣の「…破裂数）5ごとに…」は1段落）。 */
  if (join) return null;
  return brk;
}

/* 原典候補（three-book-audit.json の candidates）。
   これは該当セルの原典転記そのもので、他のどのコーパスより確度が高い。
   段落ファイルは紙面の段組み（2段組みの並び）で区切ったり、
   セル内の折返しを段落として数えたりするため、単独では決められない。
   候補があるフィールドは候補を優先し、無いフィールドのみ段落へ頼る。 */
const candidateFields = new Map();
{
  const auditPath = path.join(root, "data", "provenance", "three-book-audit.json");
  const audit = JSON.parse(readFileSync(auditPath, "utf8"));
  const register = (node, kind, name, rel) => {
    if (typeof node === "string") {
      if (rel && rel !== "name") candidateFields.set(`${kind}|${name}|${rel}`, node);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((value, index) => register(value, kind, name, rel ? `${rel}[${index}]` : `[${index}]`));
      return;
    }
    if (node && typeof node === "object") {
      for (const key of Object.keys(node)) register(node[key], kind, name, rel ? `${rel}.${key}` : key);
    }
  };
  for (const candidate of audit.candidates || []) {
    register(candidate.data, candidate.kind, candidate.data?.name, "");
  }
}

/* 候補転記の中でのこの位置の扱い。段落改行なら段落、連結なら除去。
   core() は改行も除去してしまうため、段落の判定は生の改行を見て行う。
   段落が違えば core も同じでも別物なので、ここだけは core を使わない。 */
function candidateVerdict(key, rawBefore, rawAfter) {
  const text = candidateFields.get(key);
  if (!text) return null;
  const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  /* 段落境界（改行の前後）なら break。 */
  const breakRe = new RegExp(`${escape(rawBefore)}\\s*\n\\s*${escape(rawAfter)}`);
  if (breakRe.test(text)) return "break";
  /* 全角半角など表記揺れは core で吸収する。段落境界を先に判定してから
     core で連結を確かめる（core は改行も消すため、順序を入れ替えると段落を
     連結と誤判定する）。 */
  const joinRe = new RegExp(`${escape(core(rawBefore))}${escape(core(rawAfter))}`);
  if (joinRe.test(core(text).replace(/\n/g, ""))) return "join";
  return "join";
}

function classify(text, index, fieldKey) {
  /* 1. 名前に含まれる位置の空白、および綴りが壊れた名前。 */
  for (const [spelling, canonical] of nameSpellings) {
    let from = 0;
    for (;;) {
      const at = text.indexOf(spelling, from);
      if (at < 0) break;
      if (index > at && index < at + spelling.length) {
        return { verdict: spelling === canonical ? "name" : "name-restore", evidence: canonical, at, spelling };
      }
      from = at + 1;
    }
  }

  const [before, after] = rawContext(text, index, 12);
  const coreBefore = core(before);
  const coreAfter = core(after);

  /* 2. 原典がその位置に空白を書いている。段落の書き起こしは紙面の折返しを
        そのまま含むので、行の書き出しだけでなく段落の書き出しでも確かめる。
        句読点を挟んで「…を与える。 振動爆発…」のような並びもあるため、
        空白の前後に句読点が並んでよい形で照合する。 */
  if (before && after) {
    const needle = `${before} ${after}`;
    for (const line of corpusText) {
      if (line.text.includes(needle)) return { verdict: "pdf-space", evidence: `${line.source} p.${line.page}` };
    }
    for (const paragraph of paragraphs) {
      if (paragraph.text.includes(needle)) return { verdict: "pdf-space", evidence: `\u6BB5\u843D ${paragraph.source} p.${paragraph.page}` };
    }
  }
  if (coreBefore && coreAfter) {
    const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const gap = "[\\u3002\\u3001\\uFF0C,.\\u30FB\\uFF1A:;]*";
    /* 段落ファイルは1行1段落なので、空白は紙面の空白だけを意味しうる。
       物理行ファイルでは改行が折返しなので、ここは行内空白に限定する。 */
    const spaceInParagraph = new RegExp(`${escape(coreBefore)}${gap}\\s+${escape(coreAfter)}`);
    const spaceInLine = new RegExp(`${escape(coreBefore)}${gap}[ \\u3000]+${escape(coreAfter)}`);
    for (const paragraph of paragraphs) {
      if (spaceInParagraph.test(paragraph.text)) return { verdict: "pdf-space", evidence: `\u6BB5\u843D ${paragraph.source} p.${paragraph.page}` };
    }
    for (const line of corpusText) {
      if (spaceInLine.test(line.text)) return { verdict: "pdf-space", evidence: `${line.source} p.${line.page}` };
    }
  }

  /* 3. 段落の境目。原典が段落を分けている位置は DB も \n で段落を作る。
        原典の段落が同じところで続いているなら、空白は折返し痕跡として落とす。
        段落の照合が及ばない経路（items.json 等）は、見出しと括弧タグで判定する。 */
  const fromCandidate = before && after ? candidateVerdict(fieldKey, before, after) : null;
  const page = coreBefore && coreAfter ? paragraphVerdict(coreBefore, coreAfter) : null;
  if (fromCandidate === "break" || (!fromCandidate && page)) {
    return { verdict: "paragraph", evidence: fromCandidate === "break" ? "\u539F\u5178\u5019\u88DC" : page };
  }
  const followsHeading = TIMING_LABEL.test(text.slice(index + 1).replace(/^\s+/, ""));
  const afterBracketTag = BRACKET_TAG_TAIL.test(text.slice(Math.max(0, index - 14), index));
  if (followsHeading || afterBracketTag) {
    return { verdict: "paragraph", evidence: followsHeading ? "\u5F8C\u7D9A\u898B\u51FA\u3057" : "\u62EC\u5F27\u30BF\u30B0\u306E\u884C" };
  }

  return { verdict: "defect", evidence: "\u5199\u8A58\u75D5\u8DE1" };
}

function fixAt(text, index, verdict, detail) {
  if (verdict === "paragraph") return text.slice(0, index) + "\n" + text.slice(index + 1);
  if (verdict === "name-restore") {
    return text.slice(0, detail.at) + detail.evidence + text.slice(detail.at + detail.spelling.length);
  }
  return text.slice(0, index) + text.slice(index + 1);
}

/* ---- 候補の抽出 ---------------------------------------------------------- */
/* 候補は「日本語・閉じ括弧・ASCII字＋空白＋日本語・数字」。
   ASCII字を含むのは「3R 1R：」のようにラウンド見出しの前で折り返す場合である
   （[影響] 3R 1R：… は [影響] 3R と 1R： の2行が空白で繋がっていた）。 */
const SKIP_FIELDS = new Set(["name", "affiliation"]);
const candidates = [];

function collect(node, trail, key) {
  if (typeof node === "string") {
    for (let i = 0; i < node.length; i++) {
      if (node[i] !== " ") continue;
      const prev = isJapanese(node[i - 1]) || /[)\uFF09\u3011\]\u300D\u300FA-Za-z]/.test(node[i - 1] || "");
      const next = isJapanese(node[i + 1]) || isDigit(node[i + 1]);
      if (prev && next) candidates.push({ trail, key, text: node, index: i });
    }
    return;
  }
  if (Array.isArray(node)) { node.forEach((value, index) => collect(value, `${trail}[${index}]`, key)); return; }
  if (node && typeof node === "object") {
    for (const key2 of Object.keys(node)) {
      if (SKIP_FIELDS.has(key2)) continue;
      collect(node[key2], `${trail}.${key2}`, key);
    }
  }
}

/* コレクションとレコード名|Original典候補の照合キー|を持つ。 */
function walkRecord(node, trail, baseKey, rel) {
  if (typeof node === "string") {
    collect(node, trail, `${baseKey}|${rel}`);
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((value, index) => walkRecord(value, `${trail}[${index}]`, baseKey, `${rel}[${index}]`));
    return;
  }
  if (node && typeof node === "object") {
    for (const key of Object.keys(node)) {
      if (SKIP_FIELDS.has(key)) continue;
      walkRecord(node[key], `${trail}.${key}`, baseKey, rel ? `${rel}.${key}` : key);
    }
  }
}

for (const collection of ["normal_personas", "tokui_personas", "egos", "support_passives", "spirits", "death_passives", "normal_enhancements", "special_enhancements"]) {
  const records = db[collection] || [];
  records.forEach((record, index) => {
    if (!record || typeof record !== "object") return;
    walkRecord(record, `db.${collection}[${index}]`, `${collection}|${record.name}`, "");
  });
}
for (const [index, item] of (items || []).entries()) {
  walkRecord(item, `items[${index}]`, `items|${item.name}`, "");
}

/* 同じ文字列の複数の空白は、左から確定させながら適用する。各修正で文字列の長さが
   変わるため（除去は-1、段落の改行は±0、名前の復元は綴りの差分）、候補の位置は
   適用済みの差分だけずらして参照する。 */
const byText = new Map();
for (const candidate of candidates) {
  if (!byText.has(candidate.text)) byText.set(candidate.text, []);
  byText.get(candidate.text).push(candidate);
}

const findings = [];
const fixes = new Map();
for (const [text, list] of byText) {
  let current = text;
  let shift = 0;
  const applied = [];
  for (const candidate of list) {
    const at = candidate.index + shift;
    if (current[at] !== " ") continue;
    const verdict = classify(current, at, candidate.key);
    if (verdict.verdict === "name" || verdict.verdict === "pdf-space") continue;
    const next = fixAt(current, at, verdict.verdict, verdict);
    applied.push({ verdict: verdict.verdict, evidence: verdict.evidence, path: candidate.trail, index: at, before: current, after: next });
    shift += next.length - current.length;
    current = next;
  }
  if (applied.length) {
    fixes.set(text, current);
    findings.push(...applied);
  }
}

/* findings は走査順でないため、path の昇順に並べて報告を安定させる。 */
findings.sort((a, b) => a.path.localeCompare(b.path, "ja") || a.index - b.index);

function applyFixes(node) {
  if (typeof node === "string") return fixes.has(node) ? fixes.get(node) : node;
  if (Array.isArray(node)) return node.map(applyFixes);
  if (node && typeof node === "object") {
    const out = {};
    for (const key of Object.keys(node)) out[key] = applyFixes(node[key]);
    return out;
  }
  return node;
}

if (write) {
  writeFileSync(dbPath, JSON.stringify(applyFixes(db)), "utf8");
  writeFileSync(itemsPath, JSON.stringify(applyFixes(items)), "utf8");
}

const payload = {
  scope: "db.json + items.json \u306E\u5168\u6586\u30D5\u30A3\u30FC\u30EB\u30C9",
  candidates: candidates.length,
  written: write,
  counts: {
    defect: findings.filter((f) => f.verdict === "defect").length,
    paragraph: findings.filter((f) => f.verdict === "paragraph").length,
    "name-restore": findings.filter((f) => f.verdict === "name-restore").length
  },
  findings: findings.map((f) => ({ path: f.path, verdict: f.verdict, evidence: f.evidence, before: f.before, after: f.after }))
};

if (asJson) {
  console.log(JSON.stringify(payload, null, 2));
} else {
  console.log(`\u6298\u308A\u8FD4\u3057\u7A7A\u767D\u76E3\u8A2D \u2014 \u5BFE\u8C61: ${payload.scope}`);
  console.log(`  \u5019\u88DC: ${candidates.length}\u4EF6`);
  const groups = new Map();
  for (const finding of findings) {
    if (!groups.has(finding.verdict)) groups.set(finding.verdict, []);
    groups.get(finding.verdict).push(finding);
  }
  for (const [verdict, list] of groups) {
    console.log(`\n\u25A0 ${verdict}: ${list.length}\u4EF6`);
    for (const finding of list) {
      console.log(`  ${finding.path} [${finding.evidence}]`);
      console.log(`    - ${finding.before.replace(/\n/g, " \u23CE ")}`);
      console.log(`    + ${finding.after.replace(/\n/g, " \u23CE ")}`);
    }
  }
  console.log(`\n\u5224\u5B9A: ${findings.length === 0 ? "\u5199\u8A58\u75D5\u8DE1\u306A\u3057 (PASS)" : `\u4E0D\u5099\u3042\u308A (${findings.length}\u4EF6)`}`);
}

process.exit(findings.length ? 1 : 0);
