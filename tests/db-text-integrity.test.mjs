import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* DBの本文はPDFから転記しているため、二段組みレイアウトや改ページの影響で
   次の型の破損が混入しうる。個別の人格を狙った回帰テストでは同種の再発を
   検出できないため、破損の型そのものをDB全体に対して検査する。
     - ページ見出し「〜の人格」の「人格」が効果本文末尾へ流入する
     - 行折り返しでダイス効果の断片が効果本文へ流入する
     - 文が助詞・活用途中で終わる（本文の途中切断）
     - 見出し語の途中に空白が入る（「一方 攻撃時」「再 使用」） */

const db = JSON.parse(readFileSync(new URL("../data/db.json", import.meta.url), "utf8"));
const allPersonas = [
  ...(db.normal_personas || []).map((persona) => ["通常", persona]),
  ...(db.tokui_personas || []).map((persona) => ["特異点", persona])
];

// 句読点・空白はPDF側のレイアウトで欠落しうるため、比較時は除去する。
const canon = (text) => String(text || "").replace(/[\s。、，,.・：:；;]/g, "");

function collectTexts(persona) {
  const rows = [
    ["パッシブ常時効果", persona.passive_always],
    ["パッシブ効果", persona.passive_effect]
  ];
  (persona.skills || []).forEach((skill) => {
    rows.push([`${skill.rank}効果`, skill.effect]);
    (skill.dice || []).forEach((dice, index) => rows.push([`${skill.rank}ダイス${index + 1}`, dice.effect]));
  });
  (persona.unique_buffs || []).forEach((buff) => rows.push([`固有バフ「${buff.name}」`, buff.desc]));
  return rows;
}

test("効果本文の末尾にページ見出し由来の「人格」が混入していない", () => {
  const problems = [];
  allPersonas.forEach(([mode, persona]) => {
    collectTexts(persona).forEach(([label, text]) => {
      if (String(text || "").trim().endsWith("人格")) {
        problems.push(`${mode}/${persona.name}/${label}: ${String(text).slice(-40)}`);
      }
    });
  });
  assert.deepEqual(problems, []);
});

test("スキル効果本文へ同一スキルのダイス効果の断片が流入していない", () => {
  const problems = [];
  allPersonas.forEach(([mode, persona]) => {
    (persona.skills || []).forEach((skill) => {
      const effect = canon(skill.effect);
      if (!effect) return;
      const diceTexts = (skill.dice || []).map((dice) => canon(dice.effect)).filter(Boolean);
      for (let length = 8; length < Math.min(effect.length, 60); length++) {
        const tail = effect.slice(-length);
        if (diceTexts.some((diceText) => diceText.endsWith(tail))) {
          problems.push(`${mode}/${persona.name}/${skill.rank}: 重複断片「${tail.slice(0, 40)}」`);
          return;
        }
      }
    });
  });
  assert.deepEqual(problems, []);
});

test("本文が助詞・活用途中で終わる途中切断が残っていない", () => {
  // 「〜を」「〜が」「ク」（クリティカルの切断）などで終わる本文は転記途中で切れている。
  const truncated = /(?:[はがをにでとやのへも]|ク|クリ)$/;
  const problems = [];
  allPersonas.forEach(([mode, persona]) => {
    collectTexts(persona).forEach(([label, text]) => {
      const body = String(text || "").trim();
      if (!body) return;
      const lastLine = body.split("\n").pop().trim();
      if (truncated.test(lastLine)) {
        problems.push(`${mode}/${persona.name}/${label}: ...${lastLine.slice(-36)}`);
      }
    });
  });
  assert.deepEqual(problems, []);
});

test("発動タイミング見出しや定型語の途中に空白が入っていない", () => {
  // PDF転記で「一方 攻撃時」「再 使用」のように語中へ空白が入ると、整形処理が見出しを認識できない。
  const words = ["一方攻撃時", "クリティカル的中時", "再使用", "破裂爆発", "振動爆発", "戦闘開始時", "マッチ勝利時", "マッチ敗北時"];
  const serialized = JSON.stringify(db);
  const problems = [];
  words.forEach((word) => {
    const spaced = new RegExp([...word].map((char) => char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[ \\u3000]*"), "g");
    (serialized.match(spaced) || []).forEach((match) => {
      if (match !== word) problems.push(`${word}: ${JSON.stringify(match)}`);
    });
  });
  assert.deepEqual([...new Set(problems)], []);
});

test("DBの本文はPDF原典と同じ表記の語彙を保持している（既知の修正箇所の固定）", () => {
  // 過去に破損が確認された箇所を、修正後の正しい本文で固定する。
  const find = (name) => allPersonas.map(([, persona]) => persona).find((persona) => persona.name === name);
  // 同一ランクに派生スキルが並ぶ人格があるため、必要に応じてスキル名でも絞り込む。
  const skillOf = (name, rank, skillName) => (find(name)?.skills || [])
    .find((skill) => skill.rank === rank && (!skillName || skill.name === skillName));

  assert.equal(skillOf("黒獣-卯", "スキル2").effect, "自分の速度が対象より3以上高ければスキルd値+1。\n一方攻撃時：破裂2を付与");
  assert.equal(skillOf("バラのスパナ工房B", "スキル4").effect, "対象の振動が10以上ならスキル威力+2");
  assert.equal(skillOf("南部ツヴァイ協会5課フィクサー", "スキル3").effect, "使用時：次のRに挑発値6を得る");
  assert.equal(skillOf("第四銀工房弓派フィクサー", "スキル3").effect, "使用時：呼吸4を得る");
  assert.equal(
    skillOf("第四銀工房弓派フィクサー", "スキル3").dice[0].effect,
    "銃撃。的中時、弾丸を3消費し[破裂爆発]。破裂を4消費。クリティカルダメージ量+3"
  );
  assert.equal(
    skillOf("剣契頭目", "スキル4", "骨断").dice[3].effect,
    "的中時、自分の呼吸の数だけ固定ダメ―ジを与える。クリティカルダメージ量+10"
  );
  assert.equal(skillOf("カジノ警備員", "スキル4").effect, "");
});
