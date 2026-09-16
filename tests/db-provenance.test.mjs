import test from "node:test";
import assert from "node:assert/strict";

/* DB本文が原典PDFに実在することを検証する（docs/data-provenance-goal.md の G2・G3）。

   照合には data/provenance/ のコーパスを使う。コーパスはリポジトリに含まれているため、
   PDF本体がなくてもこの検証を再実行できる。
   コーパスの再生成は tools/provenance/extract_pdf_corpus.py で行う。

   既存の破損は段階的に修正しているため、現状の件数を上限として固定する。
   修正が進めば上限を下げる。上限を超えた場合は、新しい破損が混入したか、
   照合の正規化が壊れたかのどちらかである。 */
import { auditPersonas, loadCorpus, loadDb, loadExceptions, isExcepted } from "../tools/provenance/db-provenance.mjs";

const corpus = loadCorpus();
const db = loadDb();
const exceptions = loadExceptions();
const findings = auditPersonas(db, corpus);

const missing = findings.filter((f) => f.code === "missing" && !isExcepted(f, exceptions));
const truncated = findings.filter((f) => f.code === "truncated" && !isExcepted(f, exceptions));
const pageless = findings.filter((f) => f.code === "page-not-found");

/* 修正が完了し、いずれも0件で通る状態になった。
   増やしてはならない。指摘が出たときは、まず原典PDFの紙面を確認すること。
   - 紙面と食い違っているなら data/db.json 側の誤り（tools/provenance/repairs.json に追記して直す）
   - 紙面どおりなのに指摘されるなら照合側の誤り（tools/provenance/db-provenance.mjs を直す）
   上限を緩めて通すのは、どちらの調査も済んでいない状態を隠すことにあたる。 */
const MAX_MISSING = 0;
const MAX_TRUNCATED = 0;

const format = (list) => list.map((f) => `${f.mode}/${f.persona} :: ${f.label}`);

test("全ての人格が原典の紙面に対応づけられる", () => {
  // 人格名が原典の見出しと一致しなくなった場合、照合そのものが成立しない。
  assert.deepEqual(format(pageless), []);
});

test("原典に存在しない本文が上限を超えて増えていない", () => {
  assert.ok(
    missing.length <= MAX_MISSING,
    `原典に存在しない本文が増えた: ${missing.length}件（上限${MAX_MISSING}件）\n` + format(missing).join("\n")
  );
});

test("原典の途中で切れている本文が上限を超えて増えていない", () => {
  assert.ok(
    truncated.length <= MAX_TRUNCATED,
    `途中で切れた本文が増えた: ${truncated.length}件（上限${MAX_TRUNCATED}件）\n` + format(truncated).join("\n")
  );
});

test("修正済みの本文が原典どおりに保たれている", () => {
  // 過去に修正した箇所を、修正後の本文で固定する。
  const personas = [...(db.normal_personas || []), ...(db.tokui_personas || [])];
  const find = (name) => personas.find((persona) => persona?.name === name);
  const skillOf = (name, rank, skillName) => (find(name)?.skills || [])
    .find((skill) => skill?.rank === rank && (!skillName || skill?.name === skillName));
  const buffOf = (name, buffName) => (find(name)?.unique_buffs || [])
    .find((buff) => buff?.name === buffName);

  // 折り返しで切れたダイス効果と、そこへ流入したスキル効果の切り分け。
  assert.equal(skillOf("黒獣-巳", "スキル1", "巳閃").effect, "使用時：自分の呼吸と対象の破裂の合計が10以上ならスキルd値+1");
  assert.equal(
    skillOf("黒獣-巳", "スキル1", "巳閃").dice[1].effect,
    "的中時、破裂1を付与。クリティカル的中時、自分に巳腕があれば破裂3を付与"
  );
  assert.equal(skillOf("針金工房フィクサー", "スキル2", "鉄線で引き裂く").effect, "一方攻撃時：縛り付く鉄線3を付与");
  assert.equal(
    skillOf("針金工房フィクサー", "スキル2", "鉄線で引き裂く").dice[0].effect,
    "破壊不能ダイス。的中時、自分の縛り付く鉄線の数だけ貫通ダメージを与える"
  );
  assert.equal(skillOf("ボルトット工房フィクサー", "スキル3", "粉砕骨折").effect, "使用時：対象の束縛が3以上ならスキル威力+2");

  // 固有バフの定義が流入していたスキル効果。
  assert.equal(
    skillOf("南部親指ソルダートII", "スキル4", "火力集中").effect,
    "このスキルが捨てられたなら弾丸消費量が1増加し弾丸効果が2倍になる。\n使用時：ランダムなスキルを2つ捨てる"
  );
  assert.equal(skillOf("第四銀工房銃鎚派フィクサー", "スキル4", "紅色臨鎚").effect, "マッチ開始時：対象が恐慌状態なら破裂3を付与");

  // 次のスキルの見出しが流入していたスキル効果。
  assert.equal(
    skillOf("メメメメメ工房フィクサー", "スキル3", "弾け出す祟り").effect,
    "使用時：自分の破裂を全て対象に押し付ける。押し付けた破裂の数3ごとに恐慌1を得る"
  );

  // 用語集（紙面306）の定義へ揃えた共通バフ。
  assert.equal(
    buffOf("南部ツヴァイ協会6課フィクサー", "あなたの盾").desc,
    "守備スキル使用時、数値x3だけバリアを得る。ツヴァイ協会所属なら、代わりに数値x5だけバリアを得る。\nR終了時、数値が半減（最大10）"
  );
  assert.equal(buffOf("西部ツヴァイ協会3課フィクサー", "武装").desc, "R開始時、武装の数2ごとに忍耐1を得る（最大10）");
  assert.equal(
    buffOf("第四銀工房太刀派フィクサー", "紅硬").desc,
    "呼吸獲得量+1。出血・振動・恐慌付与量+1。破裂爆発で15以上のダメージを与えた時、次のRに派閥によって異なる属性威力増加を得る。（太刀派・輪刃派=斬撃、銃槌派=打撃、弓派=貫通）（最大1）"
  );

  // 改ページや行の脱落で末尾が失われていた本文。
  assert.equal(
    skillOf("西部ツヴァイ協会3課フィクサー", "スキル4", "守護").effect,
    "使用時：自分の振動と武装の合計4ごとにダメージ量+1（最大3）。自分が防御態勢状態ならさらにダメージ量+2。\nマッチ勝利時：振動3、武装2を得る"
  );
  assert.ok(
    skillOf("黒獣-酉", "スキル4", "血炎亂舞").effect.endsWith("マッチ敗北時：対象と自分に火傷8を付与"),
    "血炎亂舞のマッチ敗北時が失われている"
  );
  assert.ok(
    skillOf("ワザリングハイツ・ワイルドハント", "スキル4-2", "死ぬまで走れ、デュラハンよ").effect
      .endsWith("R終了時：デュラハンを除去"),
    "死ぬまで走れ、デュラハンよ のR終了時が失われている"
  );
  assert.ok(
    buffOf("南部センク協会5課フィクサー", "決闘宣布-○○").desc
      .endsWith("他のキャラクターの決闘宣布-○○が付与される時は置き換わる"),
    "決闘宣布-○○ の定義後半が失われている"
  );

  // 利用者から報告された人格。原典どおりであることを固定する。
  assert.equal(buffOf("N社握る者", "狂信").desc, "[1R] 数値2ごとにダメージ量が1増加。対象にN社の釘があれば、数値2ごとにスキル威力+1（最大10）");
  assert.equal(
    skillOf("N社握る者", "スキル4", "処断").effect,
    "敵討伐時：全ての味方のSANを10回復。次のRにて全ての味方に貫通ダメージ量増加2と打撃ダメージ量増加2を付与"
  );
});

test("例外登録には人格名・項目・理由がそろっている", () => {
  const problems = exceptions
    .filter((entry) => !entry?.persona || !entry?.label || !String(entry?.reason || "").trim())
    .map((entry) => JSON.stringify(entry));
  assert.deepEqual(problems, []);
});
