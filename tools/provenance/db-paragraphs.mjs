/* DB本文と原典の段落構造を照合するロジック。
   監査コマンド（audit-db-paragraphs.mjs）と回帰テストが共有する。

   判定方針（docs/output-fidelity-goal.md G3）:
     - 組版情報から段落境界を復元したコーパスを唯一の根拠とする
     - DBの1行が、原典の連続する複数段落の連結になっていれば「連結」
     - DBの連続する複数行が、原典の1段落に収まっていれば「分断」
     - どちらでもないものは判定しない（原典とDBで文が異なる場合は
       文字照合 audit-db-text.mjs の担当であり、ここでは扱わない） */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { canon } from "./db-provenance.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const CORPUS_FILES = ["core", "supplement"];

/* 原典の段落を、紙面順に並べて読み込む。 */
export function loadParagraphs(dir = path.join(root, "data", "provenance")) {
  const rows = [];
  for (const key of CORPUS_FILES) {
    const file = path.join(dir, `${key}.paragraphs.txt`);
    const text = readFileSync(file, "utf8");
    let page = 0;
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const header = /^===== PAGE (\d+) =====$/.exec(trimmed);
      if (header) {
        page = Number(header[1]);
        continue;
      }
      rows.push({ source: key, page, raw: trimmed, canon: canon(trimmed) });
    }
  }
  return rows;
}

/* 同じ本文が紙面の複数箇所に現れるため、正規化文字列から位置の一覧を引く。 */
function indexParagraphs(paragraphs) {
  const index = new Map();
  paragraphs.forEach((paragraph, at) => {
    if (!index.has(paragraph.canon)) index.set(paragraph.canon, []);
    index.get(paragraph.canon).push(at);
  });
  return index;
}

/* DBの1行が、原典の連続する段落の連結になっていないかを探す。

   連結の判定は「原典の段落を紙面順に足していくと、DBの1行にちょうど一致する」ことで行う。
   任意の位置で切って両断片が原典のどこかにあれば良い、とはしない。
   別々の紙面にある無関係な断片が偶然つながる可能性があるためである。 */
function findMergedRun(text, paragraphs, index) {
  const target = canon(text);
  for (const [head, positions] of index) {
    if (head.length >= target.length || !target.startsWith(head)) continue;
    for (const start of positions) {
      let accumulated = head;
      let at = start;
      while (accumulated.length < target.length && at + 1 < paragraphs.length) {
        at++;
        accumulated += paragraphs[at].canon;
        if (!target.startsWith(accumulated)) break;
        if (accumulated === target) return paragraphs.slice(start, at + 1);
      }
    }
  }
  return null;
}

/* 段落の先頭に立つ発動タイミング見出しを判定する。

   見出しが段落の先頭へ来て初めて、出力で独立した行になる。
   連結のうち、続きの段落が見出しで始まるものは表示に直接影響するため、
   これを報告対象とする。見出しを伴わない連結は、
   原典の組版上の改段であっても文意は連続しており、表示も破綻しない。 */
function markerMatcher(words = []) {
  const usable = words
    .filter((word) => !/[\\[\]{}()+*?|^$]/.test(word))
    .sort((a, b) => b.length - a.length);
  if (!usable.length) return () => false;
  const pattern = new RegExp("^(?:" + usable.join("|") + ")[\u3001\uFF1A:]");
  return (text) => pattern.test(text);
}

/* DBの連続する行が、原典の1段落へ収まっていないかを探す（分断）。

   続きの行が発動タイミング見出しで始まる場合は、分断として報告しない。

   段落境界は行末の余白から判定するが、余白が1文字に満たない位置では
   折り返しと段落境界を区別できない。

     紙面119「黒獣-巳」スキル2
       使用時：自分の呼吸と対象の破裂の合計が10以上ならスキルd値+1  余白3.36pt
       マッチ勝利時：呼吸4を得て対象に破裂3を付与

   余白3.36ptは全角1文字（6.00pt）に満たないため、抽出器は折り返しとして連結する。
   しかし続く行は見出しで始まっており、原典が改段したと読むのが自然である。
   この位置は組版から一意に定まらないので、判定しない（偽陽性を出さない）。
   docs/output-fidelity-goal.md「P5 の判断基準」の方針に従う。 */
function findSplitParagraph(segments, from, index, startsWithMarker) {
  let accumulated = canon(segments[from]);
  for (let to = from + 1; to < segments.length; to++) {
    accumulated += canon(segments[to]);
    if (startsWithMarker(segments[to])) return null;
    const positions = index.get(accumulated);
    if (positions && positions.length) return { to, positions };
  }
  return null;
}

export function auditDbParagraphs(texts, timingMarkerWords, paragraphs = loadParagraphs()) {
  const index = indexParagraphs(paragraphs);
  const startsWithMarker = markerMatcher(timingMarkerWords);
  const merged = [];
  const split = [];
  let checked = 0;

  for (const { path: itemPath, text } of texts) {
    const segments = String(text == null ? "" : text)
      .split("\n")
      .map((segment) => segment.trim())
      .filter(Boolean);

    for (let at = 0; at < segments.length; at++) {
      const segment = segments[at];
      const flat = canon(segment);
      if (flat.length < 16) continue;
      checked++;

      // 分断: DBが改行した位置を、原典は一文として書いている。
      if (at + 1 < segments.length) {
        const found = findSplitParagraph(segments, at, index, startsWithMarker);
        if (found) {
          const paragraph = paragraphs[found.positions[0]];
          split.push({
            path: itemPath,
            source: paragraph.source,
            page: paragraph.page,
            text: segments.slice(at, found.to + 1).join(" \u23CE "),
            paragraph: paragraph.raw
          });
          at = found.to;
          continue;
        }
      }

      // 連結: 原典が改段した位置で、DBが改行を落としている。
      if (index.has(flat)) continue;
      const run = findMergedRun(segment, paragraphs, index);
      if (!run) continue;
      const continuations = run.slice(1).filter((paragraph) => startsWithMarker(paragraph.raw));
      if (!continuations.length) continue;
      /* 修正は項目の値ごと差し替えるため、該当行だけでなく
         項目全体の現在値と、その行を原典の段落へ割った後の値を持たせる。
         項目が複数行を持つ場合、他の行はそのまま残す。 */
      const repaired = segments.slice();
      repaired.splice(at, 1, ...run.map((paragraph) => paragraph.raw));
      merged.push({
        path: itemPath,
        source: run[0].source,
        page: run[0].page,
        text: segment,
        paragraphs: run.map((paragraph) => paragraph.raw),
        fieldBefore: segments.join("\n"),
        fieldAfter: repaired.join("\n")
      });
    }
  }
  return { checked, merged, split };
}
