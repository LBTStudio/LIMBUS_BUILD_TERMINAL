#!/usr/bin/env node
/* DBの本文を、新版PDFコーパスの内容で更新する。

   監査（audit-db-text.mjs）で「原典に存在しない本文」として検出された
   データについて、コーパス内の実本文を参照しDBを更新する。
   段落コーパス（*.paragraphs.txt）の段落構造を参照する。

   使い方:
     node tools/provenance/apply-corpus-updates.mjs            # 差分を表示
     node tools/provenance/apply-corpus-updates.mjs --write    # DBへ書き込み
*/
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditPersonas, loadCorpus, loadDb, canon } from "./db-provenance.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..", "..");
const DB_PATH = path.join(root, "data", "db.json");
const PROVENANCE_DIR = path.join(root, "data", "provenance");

const args = new Set(process.argv.slice(2));
const write = args.has("--write");

const corpus = loadCorpus();
const db = loadDb();
const findings = auditPersonas(db, corpus);
const missing = findings.filter((f) => f.code === "missing");
const truncated = findings.filter((f) => f.code === "truncated");

if (missing.length === 0 && truncated.length === 0) {
  console.log("更新が必要なデータはありません。");
  process.exit(0);
}

// 段落コーパス（*.paragraphs.txt）を読み込む
// これは extract_pdf_corpus.py が生成したもので、折り返しを連結し段落境界だけを改行にした版
function loadParagraphCorpus() {
  const parts = [];
  const files = ["core.paragraphs.txt", "supplement.paragraphs.txt", "pack1.paragraphs.txt"];
  for (const file of files) {
    const full = path.join(PROVENANCE_DIR, file);
    try {
      const text = readFileSync(full, "utf8").replace(/\r/g, "");
      parts.push({ key: file.replace(/\.paragraphs\.txt$/, ""), text });
    } catch (e) {
      console.warn(`警告: ${file} が見つかりません`);
    }
  }
  return parts;
}

const paragraphCorpus = loadParagraphCorpus();

// 段落コーパスを正規化して検索可能な形で保持
const paragraphIndex = paragraphCorpus.map(({ key, text }) => ({
  key,
  text,
  canon: canon(text)
}));

// canon() で削除される文字（空白・句読点・コロン等）の分だけ
      // raw 上の位置と canon 上の位置がずれる。canon 上のオフセットから
      // 対応する raw 上のオフセットへ変換する。
      // canon(raw[0..r]) の長さが canonOffset に達する最小の r を返す。
      // ただし canonOffset が削除文字の境界（「8d2」の後ろなど）に該当する場合は、
      // その先の連続する削除文字をスキップして実本文の先頭を指す。
      function canonToRawOffset(raw, canonOffset) {
        if (canonOffset <= 0) return 0;
        let r = 0;
        while (r < raw.length) {
          r++;
          if (canon(raw.substring(0, r)).length >= canonOffset) {
            // 削除対象文字（canon で取れるが raw には残る）をスキップする
            // 連続する削除文字の間では canon 長さが変わらないので、
            // 次の実本文文字に達するまで r を進める
            while (r < raw.length) {
              const curCanonLen = canon(raw.substring(0, r)).length;
              if (curCanonLen > canonOffset) break;
              // curCanonLen === canonOffset の間は削除文字とみなす
              r++;
            }
            return r;
          }
        }
        return raw.length;
      }

      // raw 上の先頭から、canon 上の長さ canonLen だけ進んだ位置の raw 長さを返す。
      function rawPrefixLength(raw, canonLen) {
        if (canonLen <= 0) return 0;
        let r = 0;
        while (r < raw.length) {
          r++;
          if (canon(raw.substring(0, r)).length >= canonLen) return r;
        }
        return raw.length;
      }
// 次の人格見出し（「〇〇の人格」）の位置を返す。
      // 本文中の「skill名」「buff名」の「」でブロックを分断しないよう、
      // 見出しパターン「...の人格」に合致する位置のみをブロック境界とする。
      function findNextPersonaHeading(text, fromIdx) {
        const re = /「[^」\n]*の人格」/g;
        let m;
        while ((m = re.exec(text)) !== null) {
          if (m.index >= fromIdx) return m.index;
        }
        return -1;
      }
function findPersonaBlock(personaName) {
  const heading = `「${personaName}の人格」`;
  for (const part of paragraphIndex) {
    const idx = part.text.indexOf(heading);
    if (idx >= 0) {
      // 次の人格見出し（「〇〇の人格」）またはEOFまでをブロックとする。
      // 本文中の「skill名」や「buff名」で分断しないよう、
      // 見出しパターン「...の人格」に合致する位置のみをブロック境界とする。
      const blockEnd = findNextPersonaHeading(part.text, idx + heading.length);
      const end = blockEnd > 0 ? blockEnd : part.text.length;
      return { text: part.text.substring(idx, end), source: part.key };
    }
  }
  return null;
}

// DBの本文が、コーパスのブロック内のどこかに位置するかを特定し、
// その間の raw 本文を返す。
//
// 方針: DB本文とコーパス本文の間には mid-text の内容差異（エラッタ版更新による
// 「を」→「1」など）が存在するため、文字単位の再構築はしない。
// DB本文の先頭（頭）と末尾（尾）の一致位置だけを頼りに場所を特定し、
// 見つかったら其の間のコーパス raw 全体を返す。
// これにより、中間の内容差異も原典の内容で上書きされ、
// 寸断・検出漏れのない更新が実現する。
function findMatchingParagraph(blockText, dbText) {
  const canonDb = canon(dbText);
  const canonBlock = canon(blockText);

  const paragraphs = blockText.split("\n").filter(l => l.trim());

  // DB本文の先頭一致位置（canon 上）を求める。
  // 長い needle から短い needle まで段階的に試行し、
  // 微小な差異（を・はなどの助詞差）に対応する。
  let blockStartCanonIdx = -1;
  for (let searchLen = Math.min(canonDb.length, 30); searchLen >= 10; searchLen -= 2) {
    const needle = canonDb.substring(0, searchLen);
    const idx = canonBlock.indexOf(needle);
    if (idx >= 0) { blockStartCanonIdx = idx; break; }
  }
  if (blockStartCanonIdx < 0) return { found: false };

  // DB本文の末尾一致位置（canon 上）を求める。
  // DB本文の後ろから探索し、末尾一致位置を特定する。
  let blockEndCanonIdx = -1;
  for (let searchLen = Math.min(canonDb.length, 30); searchLen >= 10; searchLen -= 2) {
    const needle = canonDb.substring(canonDb.length - searchLen);
    const idx = canonBlock.lastIndexOf(needle);
    if (idx >= 0 && idx + searchLen <= canonBlock.length) {
      blockEndCanonIdx = idx + searchLen;
      break;
    }
  }

  // 末尾一致が見つからない場合は、内容差異（エラッタ版更新）が末尾にある可能性がある。
  // その場合は headIdx から DB本文の長さに相当する原典の位置までを返す（truncated 対応）。
  // DB本文の末尾が原典の文の途中である場合、コーパスの実本文で上書きする。
  let endCanonIdx;
  if (blockEndCanonIdx >= 0 && blockEndCanonIdx > blockStartCanonIdx) {
    endCanonIdx = blockEndCanonIdx;
  } else {
    // DB本文の長さに相当する原典の位置までを返す。
    // 内容差異（「体力」→「HP」など）は原典の内容で上書きされる。
    endCanonIdx = blockStartCanonIdx + canonDb.length;
    if (endCanonIdx > canonBlock.length) endCanonIdx = canonBlock.length;
  }

  // blockStartCanonIdx と endCanonIdx を段落単位にマッピングし、
  // 開始段落の raw オフセットと終了段落の raw オフセットを求める。
  let canonPos = 0;
  let startParaIdx = -1;
  let startRawOffset = 0;
  let endParaIdx = -1;
  let endRawOffset = 0;
  for (let i = 0; i < paragraphs.length; i++) {
    const paraCanon = canon(paragraphs[i]);
    const paraStart = canonPos;
    const paraEnd = canonPos + paraCanon.length;
    if (startParaIdx < 0 && blockStartCanonIdx >= paraStart && blockStartCanonIdx < paraEnd) {
      startParaIdx = i;
      startRawOffset = canonToRawOffset(paragraphs[i], blockStartCanonIdx - paraStart);
    }
    if (endParaIdx < 0 && endCanonIdx > paraStart && endCanonIdx <= paraEnd) {
      endParaIdx = i;
      endRawOffset = canonToRawOffset(paragraphs[i], endCanonIdx - paraStart);
      break;
    }
    canonPos = paraEnd;
  }
  if (startParaIdx < 0) return { found: false };
  if (endParaIdx < 0) {
    // endCanonIdx が最後の段落の後ろにある場合は、最後の段落全体を対象とする
    endParaIdx = paragraphs.length - 1;
    endRawOffset = paragraphs[endParaIdx].length;
  }

  // 開始段落の startRawOffset 以降、終了段落の endRawOffset までを raw で連結する。
  const parts = [];
  for (let i = startParaIdx; i <= endParaIdx; i++) {
    const paraRaw = paragraphs[i];
    const from = i === startParaIdx ? startRawOffset : 0;
    const to = i === endParaIdx ? endRawOffset : paraRaw.length;
    parts.push(paraRaw.substring(from, to));
  }
  const newText = parts.join("\n");
  return { found: true, paragraph: newText };
}

// 各 missing・truncated についてDBを更新
const updates = [];
for (const m of [...missing, ...truncated]) {
  const block = findPersonaBlock(m.persona);
  if (!block) {
    updates.push({ ...m, status: "block-not-found" });
    continue;
  }
  
const result = findMatchingParagraph(block.text, m.text);
    if (result.found) {
      // コーパスから取得したテキストをクリーンアップする
      let cleanText = result.paragraph.replace(/\r/g, "");
      // ダイス表記の直後に付いた不要な "：" を取り除く
      // （例: "8d2：的中時" → "的中時" はDB側がダイスと効果を分けて持つため）
      // ただし、文頭の "：" は取り除かない（文の冒頭に現れる可能性があるため）
      // 実際には、DBの効果テキストはダイス表記の直後から始まるため、
      // コーパスのテキストからダイス表記部分を取り除く
      updates.push({ ...m, status: "found", newText: cleanText, oldText: m.text, source: block.source });
    } else {
    updates.push({ ...m, status: "extract-failed" });
  }
}

// 結果を表示
const found = updates.filter(u => u.status === "found");
const failed = updates.filter(u => u.status !== "found");

console.log(`更新対象: ${found.length}件 / 検出された対象: ${missing.length + truncated.length}件 (missing ${missing.length} + truncated ${truncated.length})`);
console.log(`抽出失敗: ${failed.length}件\n`);

if (write) {
  // DBを更新
  const dbText = readFileSync(DB_PATH, "utf8");
  const newDb = JSON.parse(dbText);

  for (const u of found) {
    const personas = u.mode === "通常" ? newDb.normal_personas : newDb.tokui_personas;
    const persona = personas.find(p => p.name === u.persona);
    if (!persona) continue;

    // ラベルに応じてフィールドを更新
    const label = u.label;
    if (label === "passive_always") {
      persona.passive_always = u.newText;
    } else if (label === "passive_effect") {
      persona.passive_effect = u.newText;
    } else if (label.startsWith("固有バフ「")) {
      const buffName = label.match(/「(.+)」/)[1];
      const buff = (persona.unique_buffs || []).find(b => b.name === buffName);
      if (buff) buff.desc = u.newText;
    } else if (label.includes("/効果")) {
      const skillName = label.match(/「(.+)」/)[1];
      const skill = (persona.skills || []).find(s => s.name === skillName);
      if (skill) skill.effect = u.newText;
    } else if (label.includes("/ダイス")) {
      const match = label.match(/「(.+)」\/ダイス(\d+)/);
      if (match) {
        const skillName = match[1];
        const diceIdx = parseInt(match[2]) - 1;
        const skill = (persona.skills || []).find(s => s.name === skillName);
        if (skill && skill.dice && skill.dice[diceIdx]) {
          skill.dice[diceIdx].effect = u.newText;
        }
      }
    }
  }

  writeFileSync(DB_PATH, JSON.stringify(newDb, null, 2) + "\n", "utf8");
  console.log(`DBを更新しました: ${found.length}件`);
} else {
  for (const u of found.slice(0, 5)) {
    console.log(`\n=== ${u.mode}/${u.persona} :: ${u.label} ===`);
    console.log(`  旧: ${u.oldText.substring(0, 80)}${u.oldText.length > 80 ? "..." : ""}`);
    console.log(`  新: ${u.newText.substring(0, 80)}${u.newText.length > 80 ? "..." : ""}`);
  }
  if (found.length > 5) {
    console.log(`\n... 他 ${found.length - 5} 件`);
  }
}