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
      // その先の削除文字をスキップして実本文の先頭を指す。
      function canonToRawOffset(raw, canonOffset) {
        if (canonOffset <= 0) return 0;
        let r = 0;
        while (r < raw.length) {
          r++;
          if (canon(raw.substring(0, r)).length >= canonOffset) {
            // 削除対象文字（canon で取れるが raw には残る）をスキップする
            while (r < raw.length && canon(raw.substring(0, r)).length === canonOffset) {
              // 次の文字が削除対象なら、canon 長さが変わらず raw を進める
              const nextCanon = canon(raw.substring(0, r + 1));
              if (nextCanon.length > canonOffset) break;
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

// DBの本文が、コーパスの段落のいずれかに含まれるかを確認し、
// その段落全体を返す。
// DBの本文が原典で途切れている場合は、先頭が共通する段落から連続する段落を
// 連結して完全な本文を復元する。
function findMatchingParagraph(blockText, dbText) {
  const canonDb = canon(dbText);
  const canonBlock = canon(blockText);
  
  // DBテキストがブロック全体に含まれる場合は、truncated対応としてDBテキストを
    // 原典の文が完結するまで拡張する
    if (canonBlock.includes(canonDb)) {
      const paragraphs = blockText.split("\n").filter(l => l.trim());
      // canonBlock 内の canonDb の終了位置を段落単位にマッピングする
      let canonPos = 0;
      const paraRanges = [];
      for (let i = 0; i < paragraphs.length; i++) {
        const cp = canon(paragraphs[i]);
        paraRanges.push({ idx: i, start: canonPos, end: canonPos + cp.length, raw: paragraphs[i], canon: cp });
        canonPos += cp.length;
      }
      
      const dbStartCanonPos = canonBlock.indexOf(canonDb);
      const dbEndCanonPos = dbStartCanonPos + canonDb.length;
      
      // Find start and end paragraphs
      let startParaIdx = -1;
      let endParaIdx = -1;
      for (const r of paraRanges) {
        if (dbStartCanonPos >= r.start && dbStartCanonPos < r.end) startParaIdx = r.idx;
        if (dbEndCanonPos > r.start && dbEndCanonPos <= r.end) endParaIdx = r.idx;
      }
      
      if (startParaIdx >= 0 && endParaIdx >= 0) {
        // Reconstruct the full paragraph concatenation from startParaIdx to endParaIdx
        const fullConcat = paraRanges.slice(startParaIdx, endParaIdx + 1).map(r => r.raw).join("\n");
        const fullConcatCanon = paraRanges.slice(startParaIdx, endParaIdx + 1).map(r => r.canon).join("");
        
        // If the DB text's canon matches the concatenation of paragraph canons,
        // use the full raw concatenation as the replacement (truncated対応)
        if (fullConcatCanon === canonDb) {
          // DB text matches the concatenation of paragraphs from startParaIdx to endParaIdx
          // Extend to include subsequent paragraphs until a record boundary is reached
          // (truncated対応: DB text is missing the continuation)
          let extended = fullConcat;
          let nextIdx = endParaIdx + 1;
          const NEXT_RECORD_RE = /^(?:\d+[dD]\d+(?:[+\-\u30FC]\d+)?|\d+b\d|\[|【|「|固有|戦術|パassiブ|名称|発動条件|効果|常時発動|HP|SAN|速度|斬撃|貫通|打撃|回避|防御|弾丸)/;
          while (nextIdx < paragraphs.length) {
            const nextPara = paragraphs[nextIdx];
            const nextCanon = canon(nextPara);
            // Stop if this paragraph starts a new record (not a continuation of the current text)
            if (NEXT_RECORD_RE.test(nextCanon) && nextCanon.length < 30) break;
            // Stop if the paragraph is very short (likely a label like "固有", "効果")
            if (nextCanon.length <= 6 && /^(固有|有|戦|術|効果|名称|パassiブ|常時|常時発動|発動条件)$/.test(nextCanon)) break;
            extended += "\n" + nextPara;
            nextIdx++;
          }
          // Verify the extended text is still valid (its canon should start with canonDb)
          if (canon(extended).startsWith(canonDb)) {
            return { found: true, paragraph: extended };
          }
          return { found: true, paragraph: fullConcat };
        }
        
        // If the DB text ends in the middle of the last paragraph (truncated case),
        // extend to include the full last paragraph
        if (endParaIdx < paragraphs.length) {
          const endPara = paragraphs[endParaIdx];
          // Check if DB text is a prefix of the concatenation including the full endPara
          const parts = [];
          for (let i = startParaIdx; i < endParaIdx; i++) {
            parts.push(paragraphs[i]);
          }
          parts.push(endPara);
          const extendedConcat = parts.join("\n");
          if (canon(extendedConcat).startsWith(canonDb) && extendedConcat.length > dbText.length) {
            return { found: true, paragraph: extendedConcat };
          }
        }
      }
      
      // DBテキストが段落のプレフィックスである場合（DBテキストが1つの段落の一部）
      for (const p of paragraphs) {
        const cp = canon(p);
        if (cp.startsWith(canonDb) && cp.length > canonDb.length) {
          return { found: true, paragraph: p };
        }
      }
      
      // truncated対応: DBテキストの直後に原典の文が=residual>ある場合、
      // DBテキストの終了位置から次の段落を追加 until 文が完結する
      // Find where DB text ends in the block canon
      const dbEndInBlock = canonBlock.indexOf(canonDb) + canonDb.length;
      if (dbEndInBlock < canonBlock.length) {
        // Find paragraphs that start after DB text ends
        const remainingParas = [];
        for (const r of paraRanges) {
          if (r.start >= dbEndInBlock) {
            remainingParas.push(r.raw);
          }
        }
        if (remainingParas.length > 0) {
          // Add the first remaining paragraph to the DB text
          const extended = dbText + "\n" + remainingParas[0];
          return { found: true, paragraph: extended };
        }
      }
      
      return { found: true, paragraph: dbText };
    }
  
  // 段落単位でブロックを分割し、DBテキストの先頭と最长共通接頭辞を持つ段落を見つける
  const paragraphs = blockText.split("\n").filter(l => l.trim());
  let bestIdx = -1;
  let bestPrefixLen = 0;
  
  for (let i = 0; i < paragraphs.length; i++) {
    const canonPara = canon(paragraphs[i]);
    let prefixLen = 0;
    while (prefixLen < canonDb.length && prefixLen < canonPara.length && canonDb[prefixLen] === canonPara[prefixLen]) {
      prefixLen++;
    }
    if (prefixLen > bestPrefixLen) {
      bestPrefixLen = prefixLen;
      bestIdx = i;
    }
  }
  
// 段落の先頭と一致しない場合は、DBテキストの先頭が段落の途中にある可能性を探索する
      // （ダイス効果は `2d7：的中時、…` のようにダイス表記の直後から始まる）
      if (bestIdx < 0 || bestPrefixLen < 10) {
        // DBテキストの先頭部分がブロック内のどこかに部分一致するか探索
        // 長いneedleから短いneedleまで段階的に試行し、微小な差異（を・はなどの助詞差）に対応する
        let blockCanonIdx = -1;
        let matchedNeedleLen = 0;
        for (let searchLen = Math.min(canonDb.length, 30); searchLen >= 10; searchLen -= 2) {
          const needle = canonDb.substring(0, searchLen);
          const idx = canonBlock.indexOf(needle);
          if (idx >= 0) {
            blockCanonIdx = idx;
            matchedNeedleLen = searchLen;
            break;
          }
        }
        if (blockCanonIdx >= 0) {
          // 見つかった位置から、DBテキストをカバーする連続する段落を特定する
          // まず、blockCanonIdx を段落単位にマッピングする
          // canon 上の位置と raw 上の位置は canon() で削除される文字（空白・句読点・コロン等）
          // の分だけずれるため、並行して進めて対応位置を求める。
          let canonPos = 0;
          let startParaIdx = -1;
          let startRawOffset = 0;
          for (let i = 0; i < paragraphs.length; i++) {
            const paraCanon = canon(paragraphs[i]);
            const paraStart = canonPos;
            const paraEnd = canonPos + paraCanon.length;
            if (blockCanonIdx >= paraStart && blockCanonIdx < paraEnd) {
              startParaIdx = i;
              startRawOffset = canonToRawOffset(paragraphs[i], blockCanonIdx - paraStart);
              break;
            }
            canonPos = paraEnd;
          }
          
          if (startParaIdx >= 0) {
            // startRawOffset が0でない場合、その段落の該当部分から始まるテキストを構築
            const matched = [];
            let remainingDb = canonDb;
            let paraIdx = startParaIdx;
            let rawOffset = startRawOffset;
            
            while (paraIdx < paragraphs.length && remainingDb.length > 0) {
              const paraRaw = paragraphs[paraIdx];
              const paraCanon = canon(paraRaw);
              // この段落から rawOffset 以降の正規化テキストを取得
              const availableCanon = paraCanon.substring(canonToRawOffset(paraRaw, 0) >= 0 ? 0 : 0);
              // rawOffset 以降の raw 部分を取得し、その canon を計算
              const rawPart = paraRaw.substring(rawOffset);
              const availableCanonFromOffset = canon(rawPart);
              
              if (remainingDb.startsWith(availableCanonFromOffset)) {
                // 残りDBがこの段落の後ろ全体を含む
                matched.push(rawPart);
                remainingDb = remainingDb.substring(availableCanonFromOffset.length);
                paraIdx++;
                rawOffset = 0;
              } else if (availableCanonFromOffset.startsWith(remainingDb.substring(0, Math.min(remainingDb.length, 20)))) {
                // DBの残りがこの段落の一部で完了
                matched.push(rawPart);
                remainingDb = "";
                break;
              } else if (remainingDb.length > 0 && availableCanonFromOffset.length > 0) {
                // 共通プレフィックスを探索
                let commonLen = 0;
                while (commonLen < remainingDb.length && commonLen < availableCanonFromOffset.length && remainingDb[commonLen] === availableCanonFromOffset[commonLen]) {
                  commonLen++;
                }
                if (commonLen >= 10) {
                  // DBの残りの先頭がこの段落の一部と一致するため、この段落をマッチングして次の段落へ
                  // 共通部分の raw 長さを求めて rawOffset を進める
                  const rawCommonLen = rawPrefixLength(rawPart, commonLen);
                  matched.push(paraRaw.substring(rawOffset, rawOffset + rawCommonLen));
                  remainingDb = remainingDb.substring(commonLen);
                  paraIdx++;
                  rawOffset = 0;
                  continue;
                }
                break;
              } else {
                break;
              }
            }
            
            if (matched.length > 0) {
              const newText = matched.join("\n");
              return { found: true, paragraph: newText };
            }
          }
        }
        return { found: false };
      }
  
  // 見つかった段落から連続する段落を連結し、DBテキストを完全にカバーするまで伸ばす
  const matched = [];
  let remainingDb = canonDb;
  let paraIdx = bestIdx;
  
  while (paraIdx < paragraphs.length && remainingDb.length > 0) {
    const canonPara = canon(paragraphs[paraIdx]);
    if (remainingDb.startsWith(canonPara)) {
      // 残りDBがこの段落全体を含む
      matched.push(paragraphs[paraIdx]);
      remainingDb = remainingDb.substring(canonPara.length);
      paraIdx++;
    } else if (canonPara.startsWith(remainingDb.substring(0, Math.min(remainingDb.length, 20)))) {
      // DBの残りがこの段落の先頭と一致する（部分一致で完了）
      matched.push(paragraphs[paraIdx]);
      remainingDb = "";
      break;
    } else {
      // 共通プレフィックスを探索（DBの残りの先頭が段落の一部である場合）
      let commonLen = 0;
      while (commonLen < remainingDb.length && commonLen < canonPara.length && remainingDb[commonLen] === canonPara[commonLen]) {
        commonLen++;
      }
      if (commonLen >= 10) {
        // DBの残りの先頭がこの段落の一部と一致するため、この段落をマッチングして次の段落へ
        matched.push(paragraphs[paraIdx]);
        remainingDb = remainingDb.substring(commonLen);
        paraIdx++;
        continue;
      }
      break;
    }
  }
  
  if (matched.length === 0) return { found: false };
  
  const newText = matched.join("\n");
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