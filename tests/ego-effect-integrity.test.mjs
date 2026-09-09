import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const db = JSON.parse(readFileSync(new URL("../data/db.json", import.meta.url), "utf8"));
const egos = db.egos || [];
const endCalendar = egos.find((ego) => ego.name === "迫りくる日：終末カレンダー");

function collectEgoTexts(ego) {
  return [
    ["覚醒効果", ego.kakusei?.effect],
    ...(ego.kakusei?.dice || []).map((dice, i) => [`覚醒ダイス${i + 1}`, dice.effect]),
    ["侵蝕効果", ego.shinshoku?.effect],
    ...(ego.shinshoku?.dice || []).map((dice, i) => [`侵蝕ダイス${i + 1}`, dice.effect])
  ];
}

test("終末カレンダーは最終段階の原典準拠効果を保持する", () => {
  assert.ok(endCalendar);
  assert.equal(endCalendar.kakusei.effect, "対象のHPが25％未満ならダメージ量+40");
  assert.equal(endCalendar.kakusei.dice[0].effect, "敵討伐時、次のRにパワー1を得て全ての味方のHPを最大値の15％回復");
  assert.equal(endCalendar.shinshoku.effect, "[敵味方識別不可]対象のHPが25％未満ならダメージ量+50");
  assert.equal(endCalendar.shinshoku.dice[0].effect, "敵討伐失敗時、次のRに出血10とパワー3を得る");
});

test("E.G.O本文に明白な途中切断・語中空白・壊れた定型語が残っていない", () => {
  const problems = [];
  const truncated = /(?:[はがをにでとやのへも]|ク|クリ)$/;
  const brokenWords = ["一方 攻撃時", "クリティカル 的中時", "戦闘 開始時", "敵 味方識別不可"];
  for (const ego of egos) {
    for (const [label, text] of collectEgoTexts(ego)) {
      const body = String(text || "").trim();
      if (!body) continue;
      if (truncated.test(body.split("\\n").pop().trim())) problems.push(`${ego.name}/${label}:末尾切断`);
      for (const broken of brokenWords) if (body.includes(broken)) problems.push(`${ego.name}/${label}:${broken}`);
    }
  }
  assert.deepEqual(problems, []);
});
