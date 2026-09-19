#!/usr/bin/env node
/* repairs.json の表に従って data/db.json の本文を修正する。

   修正は必ず原典PDFの紙面を根拠に行い、表へ理由と出典を記録する。
   `before` が現在のDB本文と一致しない場合は、意図しない上書きを防ぐため中止する
   （既に修正済み、または表が古い場合に気付けるようにする）。

   使い方:
     node tools/provenance/apply-repairs.mjs          # 適用内容を確認する
     node tools/provenance/apply-repairs.mjs --write  # data/db.json を更新する */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const dbPath = path.join(root, "data", "db.json");
const repairsPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "repairs.json");
const write = process.argv.includes("--write");

const db = JSON.parse(readFileSync(dbPath, "utf8"));
const { entries } = JSON.parse(readFileSync(repairsPath, "utf8"));

function findPersona(name) {
  return [...(db.normal_personas || []), ...(db.tokui_personas || [])].find((p) => p?.name === name);
}

function findSkill(persona, rank, name) {
  return (persona.skills || []).find((s) => s?.rank === rank && (!name || s?.name === name));
}

function findEgo(name) {
  return (db.egos || []).find((e) => e?.name === name);
}

/* 修正対象への参照を、読み書きできる形（所有オブジェクトとキー）で返す。 */
function resolveTarget(entry) {
  const t = entry.target;

  /* 支援パッシブも人格に属さない独立した一覧。 */
  if (t.kind === "support") {
    const support = (db.support_passives || []).find((row) => row?.name === entry.support);
    if (!support) return { error: `支援パッシブが見つかりません: ${entry.support}` };
    return { owner: support, key: t.field };
  }

  /* E.G.Oは人格に属さない独立したレコードなので、人格の解決より先に扱う。
     覚醒（kakusei）・侵蝕（shinshoku）の効果とダイス、固有バフを対象にする。 */
  if (t.kind === "ego" || t.kind === "egoDice" || t.kind === "egoSub") {
    const ego = findEgo(entry.ego);
    if (!ego) return { error: `E.G.Oが見つかりません: ${entry.ego}` };
    if (t.kind === "egoSub") {
      const sub = (ego.sub_skills || [])[t.index - 1];
      if (!sub) return { error: `E.G.Oの同化スキルが見つかりません: ${entry.ego}/同化${t.index}` };
      if (t.name && sub.name !== t.name) {
        return { error: `同化スキル名が一致しません: ${entry.ego}/同化${t.index}「${sub.name}」` };
      }
      return { owner: sub, key: t.field };
    }
    if (t.kind === "ego" && !t.form) {
      return { owner: ego, key: t.field };
    }
    const form = ego[t.form];
    if (!form) return { error: `E.G.Oの形態が見つかりません: ${entry.ego}/${t.form}` };
    if (t.kind === "ego") {
      return { owner: form, key: t.field };
    }
    const dice = (form.dice || [])[t.index - 1];
    if (!dice) return { error: `E.G.Oのダイスが見つかりません: ${entry.ego}/${t.form}/ダイス${t.index}` };
    return { owner: dice, key: t.field };
  }

  const persona = findPersona(entry.persona);
  if (!persona) return { error: `人格が見つかりません: ${entry.persona}` };

  if (t.kind === "persona") {
    return { owner: persona, key: t.field };
  }
  if (t.kind === "buff") {
    const buff = (persona.unique_buffs || []).find((b) => b?.name === t.name);
    if (!buff) return { error: `固有バフが見つかりません: ${entry.persona}/${t.name}` };
    return { owner: buff, key: t.field };
  }
  const skill = findSkill(persona, t.rank, t.name);
  if (!skill) return { error: `スキルが見つかりません: ${entry.persona}/${t.rank}「${t.name}」` };
  if (t.kind === "skill") {
    return { owner: skill, key: t.field };
  }
  if (t.kind === "dice") {
    const dice = (skill.dice || [])[t.index - 1];
    if (!dice) return { error: `ダイスが見つかりません: ${entry.persona}/${t.rank}/ダイス${t.index}` };
    return { owner: dice, key: t.field };
  }
  return { error: `未知の対象種別: ${t.kind}` };
}

const applied = [];
const skipped = [];
const errors = [];

/* 同じ項目を続けて直す表は、後の修正が前の修正の結果を入力とする。
   表は履歴であって、各行を独立に現在のDBへ当てられるとは限らない。

     #38  before 『…（最低1、最大3）』              after 『…（最低1、最大3）⏎ クリティカル…』
     #150 before 『…（最低1、最大3）⏎ クリティカル…』 after 『…（最低1、最大3）。クリティカル…』

   DBは既に #150 の after まで進んでいるため、#38 を現在値へ当てると
   before と一致せずエラーになる。しかし #38 が取り消されたわけではなく、
   後続の行がその結果を引き継いで上書きしただけである。

   同じ項目を対象とする行のうち、後の行の before が
   この行の after と一致するなら、この行は後続に引き継がれたものとみなす。 */
const targetKey = (entry) => JSON.stringify([entry.persona || entry.ego, entry.target]);
const laterByTarget = new Map();
entries.forEach((entry, at) => {
  const key = targetKey(entry);
  if (!laterByTarget.has(key)) laterByTarget.set(key, []);
  laterByTarget.get(key).push({ entry, at });
});
const supersededBy = (entry, at) =>
  (laterByTarget.get(targetKey(entry)) || [])
    .find((other) => other.at > at && other.entry.before === entry.after);

for (const [at, entry] of entries.entries()) {
  const { owner, key, error } = resolveTarget(entry);
  if (error) {
    errors.push({ entry, message: error });
    continue;
  }
  const current = owner[key];
  if (current === entry.after) {
    skipped.push({ entry, message: "既に修正済み" });
    continue;
  }
  if (current !== entry.before && supersededBy(entry, at)) {
    skipped.push({ entry, message: "後続の修正が引き継いでいる" });
    continue;
  }
  if (current !== entry.before) {
    errors.push({
      entry,
      message: `現在のDB本文が before と一致しません。\n    現在: ${JSON.stringify(current)}\n    期待: ${JSON.stringify(entry.before)}`
    });
    continue;
  }
  owner[key] = entry.after;
  applied.push(entry);
}

const label = (e) => {
  const t = e.target;
  if (t.kind === "ego") return `E.G.O ${e.ego} :: ${t.form ? `${t.form}/` : ""}${t.field}`;
  if (t.kind === "egoDice") return `E.G.O ${e.ego} :: ${t.form}/ダイス${t.index}`;
  if (t.kind === "egoSub") return `E.G.O ${e.ego} :: 同化${t.index}「${t.name}」/${t.field}`;
  if (t.kind === "support") return `\u652F\u63F4\u30D1\u30C3\u30B7\u30D6 ${e.support} :: ${t.field}`;
  if (t.kind === "persona") return `${e.persona} :: ${t.field}`;
  if (t.kind === "buff") return `${e.persona} :: 固有バフ「${t.name}」`;
  if (t.kind === "dice") return `${e.persona} :: ${t.rank}「${t.name}」/ダイス${t.index}`;
  return `${e.persona} :: ${t.rank}「${t.name}」/${t.field}`;
};

for (const e of applied) {
  console.log(`\n${label(e)}  [${e.source}]`);
  console.log(`  理由: ${e.reason}`);
  console.log(`  - ${String(e.before).replace(/\n/g, " \u23CE ")}`);
  console.log(`  + ${String(e.after).replace(/\n/g, " \u23CE ")}`);
}
if (skipped.length) {
  console.log(`\n適用不要: ${skipped.length}件`);
  skipped.forEach((s) => console.log(`  - ${label(s.entry)}（${s.message}）`));
}
if (errors.length) {
  console.log(`\n■ エラー: ${errors.length}件`);
  errors.forEach((e) => console.log(`  - ${label(e.entry)}\n    ${e.message}`));
}

console.log(`\n適用: ${applied.length}件 / 不要: ${skipped.length}件 / エラー: ${errors.length}件`);

if (errors.length) {
  console.log("エラーがあるため data/db.json は更新しません。");
  process.exit(1);
}
if (write && applied.length) {
  // 既存の保存形式に合わせ、改行・字下げなしの1行JSONとして書き出す。
  writeFileSync(dbPath, JSON.stringify(db), "utf8");
  console.log(`${path.relative(root, dbPath)} を更新しました。`);
} else if (!write && applied.length) {
  console.log("--write を付けると data/db.json を更新します。");
}
