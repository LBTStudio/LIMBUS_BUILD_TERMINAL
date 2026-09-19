#!/usr/bin/env node
/* 抽出したパックのデータが、原典の紙面と一致しているかを検証する。

   DBへ取り込む前に、抽出器の出力そのものを原典と突き合わせる。
   取り込んだ後では、DBの監査（audit-db-text / audit-db-paragraphs）が
   同じ検査をするが、その時点で誤りがあると原因の切り分けに手間がかかる。

   検査する内容
     1. 本文が原典に実在するか（文字の混入・欠落・列の取り違えを検出）
     2. 段落構造が原典と一致するか（改行の落ち・余分な改行を検出）
     3. 人格番号・件数が通し番号として筋が通っているか
     4. 必須項目が空でないか（列の取り違えで空になることがある）
     5. 原典の本文を取りこぼしていないか（網羅性）

   5 が要る理由（docs/provenance-lessons.md）
   ----------------------------------------
   1〜4 はすべて「抽出した本文」を入口にしている。抽出されなかった本文は
   検査の対象にすら入らないため、取りこぼしはどれだけ検査を足しても見えない。

   実際に、人格の紙面を「最大3頁」と定数で切っていた時期があり、
   6頁にわたる「蜘蛛の巣 人差し指の親方」（紙面154〜159）の紙面157〜159が
   丸ごと落ちていた。固有バフ9件が失われていたが、1〜4はすべて0件だった。
   落ちた本文は照合されないのだから、当然そうなる。

   そこで検査の向きを逆にする。原典の側から、人格・E.G.O節の本文が
   抽出結果のどこかに現れているかを問う。これは「0件」が意味を持つ検査である。

   使い方:
     node tools/provenance/verify-pack-extract.mjs
     node tools/provenance/verify-pack-extract.mjs --json */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { isDeepStrictEqual } from "node:util";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { canon } from "./db-provenance.mjs";
import { auditDbParagraphs, loadParagraphs } from "./db-paragraphs.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const asJson = process.argv.includes("--json");

const extracted = JSON.parse(
  readFileSync(path.join(root, "data", "provenance", "pack1-extracted.json"), "utf8")
);

/* 原典の全文を正規化して持つ。抽出した本文がこの中に実在するかを見る。
   パック以外の巻も含めるのは、用語集の定義など他巻からの引用があるためである。 */
const corpusCanon = ["core", "supplement", "pack1"]
  .map((key) => canon(readFileSync(path.join(root, "data", "provenance", `${key}.txt`), "utf8")))
  .join("\n");

/* 抽出したレコードの自由文を、項目パスつきで列挙する。
   DBの監査（collectDbTexts）と同じ形にして、同じ照合ロジックへ通せるようにする。 */
function collectTexts(payload) {
  const rows = [];
  const push = (itemPath, text) => {
    if (typeof text === "string" && text.trim()) rows.push({ path: itemPath, text });
  };
  const walk = (kind, persona) => {
    const base = `${kind}/${persona?.name}`;
    push(`${base}/passive_effect`, persona?.passive_effect);
    push(`${base}/passive_always`, persona?.passive_always);
    (persona?.unique_buffs || []).forEach((buff) =>
      push(`${base}/\u56FA\u6709\u30D0\u30D5\u300C${buff?.name || ""}\u300D`, buff?.desc));
    (persona?.skills || []).forEach((skill) => {
      const head = `${base}/${skill?.rank || "\u30B9\u30AD\u30EB"}\u300C${skill?.name || ""}\u300D`;
      push(`${head}/\u52B9\u679C`, skill?.effect);
      (skill?.dice || []).forEach((dice, index) => push(`${head}/\u30C0\u30A4\u30B9${index + 1}`, dice?.effect));
    });
  };
  /* E.G.Oは人格に属さない独立したレコード。
     項目パスはDBの監査（collectDbTexts）と同じ形にそろえる。 */
  const walkEgo = (ego) => {
    const base = `E.G.O/${ego?.name}`;
    push(`${base}/passive_effect`, ego?.passive_effect);
    push(`${base}/unique_buff`, ego?.unique_buff);
    for (const form of ["kakusei", "shinshoku"]) {
      const head = `${base}/${form}`;
      push(`${head}/\u52B9\u679C`, ego?.[form]?.effect);
      (ego?.[form]?.dice || []).forEach((dice, index) =>
        push(`${head}/\u30C0\u30A4\u30B9${index + 1}`, dice?.effect));
    }
    (ego?.sub_skills || []).forEach((sub, index) => {
      const head = `${base}/\u540C\u5316${index + 1}\u300C${sub?.name || ""}\u300D`;
      push(`${head}/\u52B9\u679C`, sub?.effect);
      (sub?.dice || []).forEach((dice, at) => push(`${head}/\u30C0\u30A4\u30B9${at + 1}`, dice?.effect));
    });
  };

  (payload.normal_personas || []).forEach((p) => walk("\u901A\u5E38", p));
  (payload.tokui_personas || []).forEach((p) => walk("\u7279\u7570", p));
  (payload.egos || []).forEach(walkEgo);
  return rows;
}

// Shops are validated against a fresh, source-hash-checked PDF extraction.
// Do not feed them to the old >=20-character global substring coverage check.
const shopProblems = [];
let shopChecked = 0;
try {
  const report = JSON.parse(execFileSync('python3', [
    path.join(root, 'tools/provenance/detect_pdf_data.py'),
    '--scope', 'pack-shop', '--include-candidates', '--json'
  ], { cwd: root, encoding: 'utf8', timeout: 120000, maxBuffer: 4 * 1024 * 1024 }));
  if (!report.scope_passed || !report.candidates?.length) throw new Error('empty or failed shop audit');
  for (const kind of ['support_passives', 'spirits']) {
    const expected = report.candidates.filter(c => c.kind === kind).map(c => c.data);
    shopChecked += expected.length;
    if (!isDeepStrictEqual(extracted[kind], expected)) shopProblems.push({ kind, code: 'shop_source_mismatch' });
  }
} catch (error) {
  shopProblems.push({ code: 'shop_detector_failed', message: error.message });
}
const texts = collectTexts(extracted);

/* 1. 本文が原典に実在するか。 */
const missing = [];
for (const row of texts) {
  for (const segment of row.text.split("\n")) {
    const flat = canon(segment);
    if (flat.length < 4) continue;
    if (!corpusCanon.includes(flat)) {
      missing.push({ path: row.path, segment });
      break;
    }
  }
}

/* 2. 段落構造が原典と一致するか。DBの監査と同じロジックを使う。 */
const paragraphs = loadParagraphs();
const { merged, split } = auditDbParagraphs(texts, [
  "\u4F7F\u7528\u6642", "\u6226\u95D8\u958B\u59CB\u6642", "\u30DE\u30C3\u30C1\u958B\u59CB\u6642", "\u30DE\u30C3\u30C1\u52DD\u5229\u6642",
  "\u30DE\u30C3\u30C1\u6557\u5317\u6642", "\u30DE\u30C3\u30C1\u7D42\u4E86\u6642", "\u4E00\u65B9\u653B\u6483\u6642", "\u653B\u6483\u6642",
  "\u653B\u6483\u5F8C", "\u653B\u6483\u524D", "\u88AB\u30C0\u30E1\u30FC\u30B8\u6642", "\u6575\u8A0E\u4F10\u6642",
  "\u30AF\u30EA\u30C6\u30A3\u30AB\u30EB\u7684\u4E2D\u6642", "\u7684\u4E2D\u6642", "R\u958B\u59CB\u6642", "R\u7D42\u4E86\u6642",
  "\u821E\u53F0\u958B\u59CB\u6642", "\u6B7B\u4EA1\u6642", "\u518D\u88C5\u586B\u6642", "\u5224\u5B9A\u6642",
  "\u56DE\u907F\u6210\u529F\u6642", "\u56DE\u907F\u5931\u6557\u6642", "\u9632\u5FA1\u6210\u529F\u6642", "\u9632\u5FA1\u5931\u6557\u6642"
], paragraphs);

/* 3. 番号の連続性。パックは基本ルールブックからの続き番号である。 */
const numbering = [];
const checkNumbering = (label, list, from) => {
  const numbers = list.map((p) => p.no).sort((a, b) => a - b);
  const expected = Array.from({ length: numbers.length }, (_, i) => from + i);
  if (JSON.stringify(numbers) !== JSON.stringify(expected)) {
    numbering.push({ label, got: numbers, expected });
  }
};
checkNumbering("\u901A\u5E38\u4EBA\u683C", extracted.normal_personas || [], 111);
checkNumbering("\u7279\u7570\u4EBA\u683C", extracted.tokui_personas || [], 21);
checkNumbering("E.G.O", extracted.egos || [], 101);

/* 4. 必須項目が空でないか。列の取り違えは空欄として現れる。 */
const incomplete = [];
for (const [kind, list] of [["\u901A\u5E38", extracted.normal_personas], ["\u7279\u7570", extracted.tokui_personas]]) {
  for (const persona of list || []) {
    const problems = [];
    if (!persona.name) problems.push("name");
    if (!persona.hp) problems.push("hp");
    if (!persona.san) problems.push("san");
    if (!persona.speed) problems.push("speed");
    if (!persona.res_slash) problems.push("res_slash");
    if (!persona.passive_name) problems.push("passive_name");
    if (!(persona.skills || []).length) problems.push("skills");
    // スキルは0〜4の5件が基本。欠けていれば列の取り違えを疑う。
    if ((persona.skills || []).length && persona.skills.length < 5) {
      problems.push(`skills=${persona.skills.length}`);
    }
    for (const skill of persona.skills || []) {
      if (!skill.name) problems.push(`${skill.rank}/name`);
      if (!skill.type) problems.push(`${skill.rank}/type`);
      if (!(skill.dice || []).length) problems.push(`${skill.rank}/dice`);
    }
    if (problems.length) incomplete.push({ path: `${kind}/${persona.name}`, problems });
  }
}

/* E.G.Oの必須項目。ランクはSAN消費の導出にも使うので欠けていると影響が大きい。 */
const EGO_RANKS = ["ZAYIN", "TETH", "HE", "WAW", "ALEPH"];
for (const ego of extracted.egos || []) {
  const problems = [];
  if (!ego.name) problems.push("name");
  if (!EGO_RANKS.includes(ego.rank)) problems.push(`rank=${JSON.stringify(ego.rank)}`);
  if (!ego.san_cost) problems.push("san_cost");
  if (!ego.shards) problems.push("shards");
  if (!ego.resources) problems.push("resources");
  if (!ego.passive_name) problems.push("passive_name");
  if (!ego.passive_effect) problems.push("passive_effect");
  /* 覚醒は必ず攻撃スキルを持つ。同化スキル形式（sub_skills）の場合はそちらにある。
     侵蝕は `[影響]` 型だと攻撃スキルを持たないため、本文の有無だけを見る
     （既存DBのNo.66・No.69も同じ形）。 */
  const hasKakusei = ego.kakusei?.attr || (ego.sub_skills || []).length;
  if (!hasKakusei) problems.push("kakusei");
  if (!(ego.kakusei?.dice || []).length && !(ego.sub_skills || []).length) problems.push("kakusei/dice");
  if (!ego.shinshoku?.effect && !(ego.shinshoku?.dice || []).length) problems.push("shinshoku");
  if (problems.length) incomplete.push({ path: `E.G.O/${ego.name}`, problems });
}

/* 5. 網羅性。原典の側から、取りこぼした本文がないかを問う。

   抽出器が申告した紙面（data_pages）の本文を1段落ずつ見て、
   抽出結果のどこにも現れないものを報告する。

   本文でないもの（紙面の定型語・ノンブル・縦組みの行見出し）は除く。
   これらは表の飾りであって、データとして持つべき対象ではない。 */
const GUTTER_WORDS = new Set([
  "\u30D1\u30C3\u30B7\u30D6", "\u540D\u79F0", "\u767A\u52D5\u6761\u4EF6", "\u52B9\u679C", "\u5E38\u6642\u767A\u52D5",
  "\u4EBA\u683C", "No", ".", "No.", "E.G.O", "\u5FC5\u8981\u8CC7\u6E90",
  "\u540D\u79F0\u52B9\u679C", "\u540D\u79F0\u52B9\u679C\u540D\u79F0", "\u767A\u52D5\u6761\u4EF6\u5E38\u6642\u767A\u52D5\u767A\u52D5\u6761\u4EF6",
  "\u540C\u5316", "[\u540C\u5316]"
]);

/* 抽出結果の全文（正規化済み）。段落がこの中に現れるかを見る。

   ダイスは `roll` と `effect` に分けて格納するため、紙面の
   `2d7：的中時、出血2を付与` という一行はそのままでは現れない。
   照合には紙面の形へ組み直したものも併せて持たせる。

   スキル・バフの見出しも同じく、名称と属性などへ分解されている。
   これらは検査1〜4で個別に検証済みなので、ここでは組み直した形で足す。 */
function reassembled(payload) {
  const lines = [];
  const dice = (list) => (list || []).forEach((d) => {
    lines.push(d?.effect ? `${d.roll}\uFF1A${d.effect}` : String(d?.roll ?? ""));
  });
  /* 紙面のスキル見出しは `名前 斬撃広域7：憤怒` の形。
     aoe の格納形は人格が `対象7体`、E.G.Oが `広域対象7体` で異なる
     （どちらも既存DBの表記にそろえてある）。どちらからも紙面の形へ戻す。 */
  const skillHead = (s) => {
    const scope = s?.aoe ? String(s.aoe).replace(/^(?:\u5E83\u57DF)?\u5BFE\u8C61(\d+)\u4F53$/, "\u5E83\u57DF$1") : "";
    return `${s?.name || ""} ${s?.type || s?.attr || ""}${scope}\uFF1A${s?.sin || ""}`;
  };

  for (const persona of [...(payload.normal_personas || []), ...(payload.tokui_personas || [])]) {
    lines.push(persona.name, persona.passive_name, persona.passive_cond);
    /* 人格の見出し行と能力値行。どちらも構造化された項目へ分解して格納するため、
       紙面の一行としてはそのまま現れない。原典の形へ組み直して照合する。

         「夜明事務所フィクラーBの人格」 sponsored
         速度 1d6+1 斬撃 抵抗 貫通 弱点 打撃 普通 弾丸 × */
    /* 見出しには原典オリジナル人格を示す `sponsored` / `original` が続く紙面がある。
       名称には含めないため、組み直す側で補う。 */
    lines.push(`「${persona.name}の人格」`);
    lines.push(`「${persona.name}の人格」 sponsored`);
    lines.push(`「${persona.name}の人格」 original`);
    lines.push(`HP ${persona.hp} SAN ${persona.san}`);
    /* 能力値行は紙面によって、速度と耐性が別の行のものと同じ行のものがある。
       どちらの形でも照合できるよう、両方を組み立てる。 */
    const resist = `斬撃 ${persona.res_slash} 貫通 ${persona.res_pierce}`
      + ` 打撃 ${persona.res_blunt} 弾丸 ${persona.bullets}`;
    lines.push(`速度 ${persona.speed} ${resist}`);
    lines.push(`速度 ${persona.speed}`);
    lines.push(resist);
    (persona.skills || []).forEach((s) => { lines.push(skillHead(s)); dice(s.dice); });
    (persona.unique_buffs || []).forEach((b) => {
      lines.push(b.max == null ? `[${b.name}] ${b.type}` : `[${b.name}] \u6700\u5927${b.max} ${b.type}`);
    });
  }
  for (const ego of payload.egos || []) {
    lines.push(ego.name, ego.passive_name, ego.passive_cond, `\u5FC5\u8981\u8CC7\u6E90\uFF1A${ego.resources}`);
    /* E.G.Oの見出しは `ZAYIN 名前：副題`。ランクと名称に分けて格納している。
       オリジナルE.G.Oには `sponsored` が続き、ランクが別行に組まれる紙面もある。 */
    lines.push(`${ego.rank} ${ego.name}`);
    lines.push(`${ego.rank} ${ego.name} sponsored`);
    lines.push(`${ego.name} sponsored`);
    lines.push(`${ego.name} sponsored\u5FC5\u8981\u8CC7\u6E90\uFF1A${ego.resources}`);
    lines.push(`No.${ego.no} ${ego.shards}\u6B20`);
    for (const form of ["kakusei", "shinshoku"]) dice(ego[form]?.dice);
    (ego.sub_skills || []).forEach((s) => {
      lines.push(skillHead(s));
      // 同化スキルの見出しは `1：猿を蹴り倒す 打撃：憤怒` と番号が付く。
      lines.push(`${s.no}\uFF1A${skillHead(s)}`);
      dice(s.dice);
    });
  }
  return lines.filter(Boolean).map((line) => canon(line)).join("\n");
}

const extractedCanon = [
  texts.map((row) => canon(row.text)).join("\n"),
  reassembled(extracted)
].join("\n");

const uncovered = [];
const dataPages = new Set(extracted.data_pages || []);
if (dataPages.size) {
  for (const paragraph of paragraphs) {
    if (paragraph.source !== "pack1" || !dataPages.has(paragraph.page)) continue;
    const flat = canon(paragraph.raw);
    /* 短い断片は、能力値・ダイス表記・見出しなど構造化された項目へ
       分解して格納されるため、本文としては現れない。
       取りこぼしの検出には十分な長さの段落だけを使う。 */
    if (flat.length < 20) continue;
    if (GUTTER_WORDS.has(paragraph.raw.trim())) continue;
    if (extractedCanon.includes(flat)) continue;
    uncovered.push({ source: paragraph.source, page: paragraph.page, text: paragraph.raw });
  }
}

const total = missing.length + merged.length + split.length + numbering.length
  + incomplete.length + uncovered.length + shopProblems.length;

if (asJson) {
  console.log(JSON.stringify(
    { texts: texts.length, missing, merged, split, numbering, incomplete, uncovered, shopChecked, shopProblems }, null, 2));
  process.exit(total ? 1 : 0);
}

console.log(`\u62BD\u51FA\u3057\u305F\u4EBA\u683C: \u901A\u5E38${(extracted.normal_personas || []).length}\u4EF6 / \u7279\u7570${(extracted.tokui_personas || []).length}\u4EF6 / E.G.O${(extracted.egos || []).length}\u4EF6`);
console.log(`\u7167\u5408\u3057\u305F\u672C\u6587: ${texts.length}\u4EF6\n`);

console.log(`\u25A0 \u539F\u5178\u306B\u5B58\u5728\u3057\u306A\u3044\u672C\u6587: ${missing.length}\u4EF6`);
missing.slice(0, 20).forEach((item) => {
  console.log(`  ${item.path}`);
  console.log(`    ${item.segment}`);
});
if (missing.length > 20) console.log(`  … \u4ED6 ${missing.length - 20}\u4EF6`);

console.log(`\n\u25A0 \u539F\u5178\u304C\u6539\u6BB5\u3057\u3066\u3044\u308B\u4F4D\u7F6E\u3067\u9023\u7D50\u3057\u3066\u3044\u308B: ${merged.length}\u4EF6`);
merged.slice(0, 10).forEach((item) => {
  console.log(`  ${item.path}  (${item.source} p.${item.page})`);
  console.log(`    ${item.text}`);
});
if (merged.length > 10) console.log(`  … \u4ED6 ${merged.length - 10}\u4EF6`);

console.log(`\n\u25A0 \u539F\u5178\u304C\u4E00\u6587\u3067\u66F8\u3044\u3066\u3044\u308B\u4F4D\u7F6E\u3067\u5206\u65AD\u3057\u3066\u3044\u308B: ${split.length}\u4EF6`);
split.slice(0, 10).forEach((item) => {
  console.log(`  ${item.path}  (${item.source} p.${item.page})`);
  console.log(`    ${item.text}`);
});
if (split.length > 10) console.log(`  … \u4ED6 ${split.length - 10}\u4EF6`);

console.log(`\n\u25A0 \u756A\u53F7\u306E\u9023\u7D9A\u6027: ${numbering.length ? "\u4E0D\u4E00\u81F4" : "OK"}`);
numbering.forEach((item) => {
  console.log(`  ${item.label}: ${item.got.length}\u4EF6`);
  const holes = item.expected.filter((n) => !item.got.includes(n));
  const extra = item.got.filter((n) => !item.expected.includes(n));
  if (holes.length) console.log(`    \u6B20\u3051\u3066\u3044\u308B\u756A\u53F7: ${holes.join(", ")}`);
  if (extra.length) console.log(`    \u4F59\u5206\u306A\u756A\u53F7: ${extra.join(", ")}`);
});

console.log(`\n\u25A0 \u5FC5\u9808\u9805\u76EE\u304C\u6B20\u3051\u3066\u3044\u308B\u4EBA\u683C: ${incomplete.length}\u4EF6`);
incomplete.slice(0, 20).forEach((item) => console.log(`  ${item.path}: ${item.problems.join(", ")}`));
if (incomplete.length > 20) console.log(`  … \u4ED6 ${incomplete.length - 20}\u4EF6`);

console.log(`\n\u25A0 \u539F\u5178\u306B\u3042\u308B\u306E\u306B\u62BD\u51FA\u3055\u308C\u3066\u3044\u306A\u3044\u672C\u6587: ${uncovered.length}\u4EF6`);
uncovered.slice(0, 20).forEach((item) => {
  console.log(`  (${item.source} p.${item.page})`);
  console.log(`    ${item.text.slice(0, 90)}`);
});
if (uncovered.length > 20) console.log(`  \u2026 \u4ED6 ${uncovered.length - 20}\u4EF6`);

console.log(`\n共通検出器によるショップ照合: ${shopChecked}件 / 問題 ${shopProblems.length}件`);
shopProblems.forEach(problem => console.log(JSON.stringify(problem)));
console.log(`\n\u8981\u4FEE\u6B63: ${total}\u4EF6`);
if (!total) console.log("\u62BD\u51FA\u7D50\u679C\u306F\u539F\u5178\u3068\u4E00\u81F4\u3057\u3066\u3044\u307E\u3059\u3002");
process.exit(total ? 1 : 0);
