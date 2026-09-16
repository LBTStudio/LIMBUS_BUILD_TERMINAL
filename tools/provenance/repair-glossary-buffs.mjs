#!/usr/bin/env node
/* 用語集（基本ルールPDF 紙面305〜306）に定義のある固有バフの説明を、原典の定義本文へ揃える。

   これらのバフは複数の人格が共有する共通の状態で、原典では用語集に一度だけ定義されている。
   LBTのDBでは人格ごとに複製されているため、転記時の欠落が人格ごとにばらついていた。

     - あなたの盾 : 代替効果とR終了時の半減が落ち、「ツヴァイ協会所属なら追加効果」と要約されていた
     - 武装       : 別のバフの説明（守備スキル使用時〜）が連結されていた
     - 紅硬       : 冒頭が欠落し「上のダメージを与えた時」から始まっていた
     - 充電力場   : 読点の欠落
     - 時間貸与   : R終了時の効果が落ちていた
     - 共振       : 文の区切りの改行が落ちていた

   用語集の定義は紙面上で複数行に分かれるが、意味の区切りは文末の句点にあるため、
   紙面の行折り返しは畳み、文の区切りだけを改行として残す。

   修正するのは説明本文（desc）だけで、上限値（max）は触らない。
   用語集の「（最大10）」が、その状態の保有上限を指すのか、
   その効果で得られる値の上限を指すのかは紙面から一意に読み取れない。
   例えば武装の「R開始時、武装の数2ごとに忍耐1を得る（最大10）」は、
   得られる忍耐の上限とも武装の保有上限とも読める。
   上限値の決定はルールの解釈であり、本ツールの範囲外とする
   （docs/data-provenance-goal.md の非目標を参照）。

   使い方:
     node tools/provenance/repair-glossary-buffs.mjs          # 差分を表示
     node tools/provenance/repair-glossary-buffs.mjs --write  # data/db.json を更新 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const dbPath = path.join(root, "data", "db.json");
const write = process.argv.includes("--write");

const GLOSSARY = {
  "武装": {
    desc: "R開始時、武装の数2ごとに忍耐1を得る（最大10）"
  },
  "あなたの盾": {
    desc: "守備スキル使用時、数値x3だけバリアを得る。ツヴァイ協会所属なら、代わりに数値x5だけバリアを得る。\nR終了時、数値が半減（最大10）"
  },
  "充電力場": {
    desc: "戦闘開始時、数値x3だけバリアを得る。W社所属なら、代わりに数値x5だけバリアを得る。\nR終了時、数値だけ充電を得て、消滅（最大10）"
  },
  "時間貸与": {
    desc: "R終了時、数値-1だけ次のRにクイック、マッチ威力増加、脆弱を得る。数値が1なら、代わりに束縛2を得る。\nR開始時、1減少。所持しているクイックの数より束縛の数の方が多い場合、混乱状態となり、消滅（最大3）"
  },
  "狂信": {
    desc: "[1R] 数値2ごとにダメージ量が1増加。対象にN社の釘があれば、数値2ごとにスキル威力+1（最大10）"
  },
  "共振": {
    desc: "対象に振動爆発を行う時、共振の数x対象の振動の数÷4だけ固定ダメージを与える。\n振動爆発を行ったR終了時、消滅（最大10）"
  },
  "振動同化": {
    desc: "スキル使用時、対象の振動の数5ごとに3回まで、振動2を得てマッチ威力+1。（最大1）"
  },
  "紅硬": {
    desc: "呼吸獲得量+1。出血・振動・恐慌付与量+1。破裂爆発で15以上のダメージを与えた時、次のRに派閥によって異なる属性威力増加を得る。（太刀派・輪刃派=斬撃、銃槌派=打撃、弓派=貫通）（最大1）"
  },
  "知識鍛錬": {
    desc: "R開始時、探求した知識を2以上持っているなら、マッチ威力増加1を得る。スキルを捨てる時、数値x3だけバリアを得る。被ダメージ時、数値が1減少。混乱時、消滅。（最大6）"
  }
};

const db = JSON.parse(readFileSync(dbPath, "utf8"));
const changes = [];

for (const [mode, list] of [["通常", db.normal_personas || []], ["特異", db.tokui_personas || []]]) {
  for (const persona of list) {
    for (const buff of persona.unique_buffs || []) {
      const entry = GLOSSARY[buff?.name];
      if (!entry) continue;
      if (buff.desc !== entry.desc) {
        changes.push({ mode, persona: persona.name, buff: buff.name, field: "desc", before: buff.desc, after: entry.desc });
        buff.desc = entry.desc;
      }
    }
  }
}

changes.forEach((c) => {
  console.log(`\n${c.mode}/${c.persona} 固有バフ「${c.buff}」 ${c.field}`);
  console.log(`  - ${String(c.before).replace(/\n/g, " \u23CE ")}`);
  console.log(`  + ${String(c.after).replace(/\n/g, " \u23CE ")}`);
});
console.log(`\n変更: ${changes.length}件`);

if (write && changes.length) {
  writeFileSync(dbPath, JSON.stringify(db), "utf8");
  console.log(`${path.relative(root, dbPath)} を更新しました。`);
} else if (!write && changes.length) {
  console.log("--write を付けると data/db.json を更新します。");
}
