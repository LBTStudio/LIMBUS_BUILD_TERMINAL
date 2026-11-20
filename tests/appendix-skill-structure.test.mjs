import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const html = readFileSync(new URL("../exports/リンバスTRPG_戦術スキル期待値ランキング.html", import.meta.url), "utf8");

function embedded(id) {
  const marker = '<script id="' + id + '" type="application/json">';
  const start = html.indexOf(marker);
  assert.notEqual(start, -1, "embedded JSON exists: " + id);
  const contentStart = start + marker.length;
  const end = html.indexOf("</script>", contentStart);
  assert.notEqual(end, -1, "embedded JSON closes: " + id);
  return JSON.parse(html.slice(contentStart, end));
}

test("ガブナーのスキル0に混入していた非礼勿動を戦術1へ分離する", () => {
  const appendix = embedded("appendix-data");
  const persona = appendix.find(item => item.name === "ジア家家主候補 ガブナー");
  assert.ok(persona);
  const skill0 = persona.skills.find(skill => skill.name === "出しゃばるな");
  const skill1 = persona.skills.find(skill => skill.name === "非礼勿動");

  assert.equal(skill0.rank, "スキル0");
  assert.equal(skill0.dice.length, 2);
  assert.deepEqual(skill0.dice.map(die => die.roll), ["6d2", "6d2"]);
  assert.ok(skill0.dice.every(die => !/非礼勿動|呪殺【勿動】/.test(die.effect || "")));
  assert.ok(!skill0.effect.includes("非礼勿動"));

  assert.ok(skill1, "OCR境界に埋もれていた独立スキルを復元する");
  assert.equal(skill1.slot, 1);
  assert.equal(skill1.rank, "スキル1");
  assert.equal(skill1.type, "打撃");
  assert.equal(skill1.sin, "暴食");
  assert.match(skill1.effect, /対象の破裂4ごとにスキル威力\+1（最大3）/);
  assert.match(skill1.effect, /使用時：呼吸4を得る/);
  assert.match(skill1.effect, /マッチ勝利時：次のRに束縛2を付与/);
  assert.deepEqual(skill1.dice.map(die => die.roll), ["2d9", "4d3+2"]);
  assert.match(skill1.dice[0].effect, /破裂3を付与/);
  assert.match(skill1.dice[1].effect, /呪殺【勿動】4を付与/);
  assert.ok(skill1.dice.every(die => die.page === 247));
});

test("別冊内の既知の枠未確定3件は出典の番号が確認できるまで推測採番しない", () => {
  const appendix = embedded("appendix-data");
  const unknown = appendix.flatMap(persona =>
    (persona.skills || [])
      .filter(skill => !skill.rank && skill.slot == null)
      .map(skill => persona.name + "/" + skill.name)
  ).sort();
  assert.deepEqual(unknown, [
    "群れたハイエナムジュンべ フロル/一点突破",
    "群れたハイエナムシリキ アニス/一致団結、えいえいおー",
    "黒獣-午 エーゲ/汗血走破"
  ]);
});

test("別冊の番号付きスキルに、登録済み枠の間の欠番が残らない", () => {
  const appendix = embedded("appendix-data");
  const gaps = [];
  for (const persona of appendix) {
    const slots = [...new Set((persona.skills || [])
      .map(skill => skill.rank && String(skill.rank).match(/^スキル(\\d+)(?:-\\d+)?$/))
      .filter(Boolean)
      .map(match => Number(match[1])))].sort((a, b) => a - b);
    if (!slots.length) continue;
    for (let slot = slots[0]; slot <= slots.at(-1); slot++) {
      if (!slots.includes(slot)) gaps.push(persona.name + "/スキル" + slot);
    }
  }
  assert.deepEqual(gaps, []);
});
