#!/usr/bin/env node
/* 出力生成が本文を壊していないかを監査する（docs/data-provenance-goal.md の G1）。

   DBの本文を段落分割器へ通し、次の三点を検査する。
     1. 無損失   : 分割の前後で文字が欠落・重複していない
     2. 非分断   : 括弧・引用符が段落の境界で切り離されていない
     3. 見出し整列: 発動タイミング見出しが段落の先頭に来ている

   `[1R]` のような状態表記や `（1Rに2回）` のような回数制限で分断が起きると
   ここで検出される。利用者から報告された「握る者のスキルテキストの寸断」は
   この検査の1と2で捕捉される型である。

   使い方:
     node tools/provenance/audit-output-lossless.mjs
     node tools/provenance/audit-output-lossless.mjs --json */
import { loadRuntime, collectDbTexts } from "./pipeline-harness.mjs";

const asJson = process.argv.includes("--json");
const runtime = loadRuntime();
const split = runtime.splitEffectLinesPlain;
const texts = collectDbTexts(runtime.db);

/* 分割器は行頭・行末の空白を落とし、空行を捨てる。
   意味の欠落と、空白の整形を区別するため、比較時は空白だけを取り除く。 */
const squeeze = (value) => String(value || "").replace(/[\s\u3000]/g, "");

const OPEN_CLOSE = [["[", "]"], ["\uFF08", "\uFF09"], ["\u3010", "\u3011"], ["(", ")"], ["\u300C", "\u300D"], ["\u300E", "\u300F"]];

/* 発動タイミング見出しは段落の先頭に来て初めて、出力側で独立した行になる。
   段落の途中に見出しが残っていると、CCFOLIA上で改行されず一続きに表示される。 */
const TIMING_MARKER_RE = new RegExp(
  "(?:" + (runtime.timingMarkerWords || [])
    .filter((word) => !/[\\[\]{}()+*?|^$]/.test(word))
    .sort((a, b) => b.length - a.length)
    .join("|") + ")[\uFF1A:]",
  "g"
);
const GUARD_PREFIX_RE = /(?:一方|クリティカル)\s{0,3}$/;

const findings = [];
for (const { path, text } of texts) {
  const parts = split(text);

  // 1. 無損失
  if (squeeze(parts.join("")) !== squeeze(text)) {
    findings.push({ path, code: "text-loss", text, parts });
  }

  parts.forEach((part, index) => {
    // 2. 非分断 — 括弧の対応が段落内で閉じているか
    for (const [open, close] of OPEN_CLOSE) {
      const opened = part.split(open).length - 1;
      const closed = part.split(close).length - 1;
      if (opened !== closed) {
        findings.push({ path, code: "bracket-severed", text, parts, detail: `${open}${close} 段落${index + 1}` });
        break;
      }
    }
    // 括弧が開いたまま段落が終わる形は、直後で分断された痕跡である。
    if (index < parts.length - 1 && /[[\uFF08\u3010(\u300C\u300E]\s*$/.test(part)) {
      findings.push({ path, code: "open-bracket-tail", text, parts, detail: `段落${index + 1}` });
    }

    // 3. 見出し整列
    TIMING_MARKER_RE.lastIndex = 0;
    let match;
    while ((match = TIMING_MARKER_RE.exec(part)) !== null) {
      if (match.index === 0) continue;
      const before = part.slice(0, match.index);
      // 「一方攻撃時」「クリティカル的中時」の途中一致は分割対象ではない。
      if (GUARD_PREFIX_RE.test(before)) continue;
      findings.push({ path, code: "marker-not-split", text, parts, detail: match[0] });
      break;
    }
  });
}

// 同じ項目で同じ型の指摘は1件にまとめる。
const unique = new Map();
findings.forEach((f) => {
  const key = `${f.path}|${f.code}`;
  if (!unique.has(key)) unique.set(key, f);
});
const list = [...unique.values()];

if (asJson) {
  console.log(JSON.stringify({ scanned: texts.length, findings: list }, null, 2));
  process.exit(list.length ? 1 : 0);
}

const EXPLAIN = {
  "text-loss": "分割で本文が欠落・重複した",
  "bracket-severed": "括弧が段落境界で切り離された",
  "open-bracket-tail": "括弧が開いたまま段落が終わった",
  "marker-not-split": "発動タイミング見出しが段落の先頭に来ていない"
};

console.log(`照合した本文: ${texts.length}件`);
console.log(`検出: ${list.length}件`);
for (const f of list) {
  console.log(`\n[${f.code}] ${EXPLAIN[f.code] || ""}`);
  console.log(`  ${f.path}${f.detail ? `  (${f.detail})` : ""}`);
  console.log(`  入力: ${f.text.replace(/\n/g, " \u23CE ")}`);
  console.log(`  出力: ${f.parts.map((p) => JSON.stringify(p)).join(" | ")}`);
}
if (!list.length) console.log("\n出力生成による本文の破損はありません。");
process.exit(list.length ? 1 : 0);
