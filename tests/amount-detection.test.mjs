import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

/* ---------------------------------------------------------------------------
   「どちらとも取れない数字を放置しない」ことの回帰テスト。

   守るべき性質:
     - LP にも 欠片 にもならないまま捨てる数字を残さない
     - 通貨語が無いのに「現在 + 数字」なら LP として拾う（推測として明示する）
     - チケット枚数・日付・ダイス目を通貨にしない
     - 拾ったものは「推測」と「明示」を区別して出せる
   --------------------------------------------------------------------------- */

function load(file, apiName) {
  const source = readFileSync(new URL("../js/" + file, import.meta.url), "utf8");
  const context = { window: {}, console, module: { exports: {} } };
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.window[apiName];
}

const P = load("result-log-parser.js", "LBT_resultLogInternals");

test("通貨語が無くても「現在 + 数字」なら拾う", () => {
  const cases = [
    "W社2級整理要員　現在39",
    "人差し指に自生　現在76",
    "人格抽出　K社2級整理要員 南部リウ協会５課フィクサー、圧縮購入 現在16",
    "200LP　現在値2504"
  ];
  for (const line of cases) {
    const hit = P.detectAmount(line);
    assert.equal(hit.currency, "lp", "拾える: " + line);
  }
});

/* vm コンテキスト内で作られた object は prototype が異なるため
   deepStrictEqual が値即使一致でも落ちる。 フィールドで比べる。 */
function sameAmount(actual, currency, assumed) {
  assert.equal(actual.currency, currency, "通貨");
  assert.equal(actual.assumed, assumed, "推測かどうか");
}

test("通貨の明示があるものは推測にしない", () => {
  sameAmount(P.detectAmount("LP:153　現在187"), "lp", false);
  sameAmount(P.detectAmount("欠片104　現在360"), "shards", false);
  sameAmount(P.detectAmount("カケラ25　現在40"), "shards", false);
  sameAmount(P.detectAmount("人格抽出　南部リウ協会５課フィクサー　現在16"), "lp", true);
});

test("チケット枚数・日付・ダイス目を通貨にしない", () => {
  for (const line of [
    "人格抽出チケット1枚",
    "人格抽出チケット +1",
    "ガチャ抽出チケットx1　シュエ家私兵の人格",
    "2026/10/6",
    "GMの1d100より大きな数字を出せれば選択抽出チケット",
    "▶️戦闘中1度だけ、E.G.O使用時に消費する精神と潜在量を半減し、火傷10を得る"
  ]) {
    assert.equal(P.detectAmount(line).currency, null, "通貨にしない: " + line);
  }
});

/* --- 実データ全体で「置き去りにした数字」を数える ---------------------- */

const samples = JSON.parse(readFileSync(new URL("./fixtures/garasumado-samples.json", import.meta.url), "utf8"));

test("実データ: 通貨も現在も無い数字行は、全部名前か明記の無関係情報", () => {
  const chunks = [];
  for (const value of Object.values(samples)) {
    if (value.coll !== "characters") continue;
    for (const h of value.doc.scenarioHistory || []) {
      if (h && h.memo && String(h.memo).trim()) chunks.push("【" + (h.name || "") + "】\n" + h.memo);
    }
  }
  assert.ok(chunks.length > 500, "シナリオが十分な量ある（実際 " + chunks.length + "）");

  const parsed = P.parseResultLog(chunks.join("\n\n"));
  const records = parsed.sessions.flatMap((s) => s.records);
  const currencyRecords = records.filter((r) => r.kind === "currency");

  // 通貨記録は全て、額を入れる枠を持っている（needsAmount）。
  assert.ok(currencyRecords.length > 1000, "通貨行が拾われている（実際 " + currencyRecords.length + "）");
  assert.ok(currencyRecords.every((r) => r.needsAmount === true), "全部が額itect入れる枠を持つ");

  // 推測と明示が区別できる。
  const assumed = currencyRecords.filter((r) => r.assumed === true);
  assert.ok(assumed.length > 0, "推測が混ざっている（実際 " + assumed.length + "）");
  assert.ok(assumed.every((r) => r.currency === "lp"), "推測のは LP として扱う");

  // 置き去りにした数字行が残っていないことを明示的に数える。
  let leftovers = 0;
  const examples = [];
  for (const session of parsed.sessions) {
    for (const record of session.records) {
      if (record.kind !== "registration") continue;
      const line = record.text || "";
      if (!/\d/.test(line)) continue;
  // 名前に含まれる数字は除外ではない（人物名の一部）。
      if (/現在の?\s*\d/.test(line)) { leftovers += 1; examples.push(line); }
    }
  }
  assert.equal(leftovers, 0, "「現在 + 数字」を放置扱いにした行が残っている: " + examples.slice(0, 5).join(" / "));
});

test("実データ: 推測として拾った行はすべて LP 金額の形", () => {
  const chunks = [];
  for (const value of Object.values(samples)) {
    if (value.coll !== "characters") continue;
    for (const h of value.doc.scenarioHistory || []) {
      if (h && h.memo && String(h.memo).trim()) chunks.push("【" + (h.name || "") + "】\n" + h.memo);
    }
  }
  const parsed = P.parseResultLog(chunks.join("\n\n"));
  const assumed = parsed.sessions.flatMap((s) => s.records).filter((r) => r.assumed === true);
  for (const record of assumed) {
    assert.match(record.text, /現在の?\s*\d/, "「現在 + 数字」の形である: " + record.text);
    assert.doesNotMatch(record.text, /欠片|欠牁|カケラ|かけら/, "欠片語があるなら推測ではない: " + record.text);
  }
});