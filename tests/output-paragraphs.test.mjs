/* 段階3（抽出・反映）の回帰テスト — docs/output-fidelity-goal.md の G1。

   出力生成が原典の段落構造を保つことを、実際の出力経路に対して確かめる。
   検証の対象は splitEffectLinesPlain() ではなく、利用者が受け取る
   buildPalette / buildMemo / buildCcfoliaJSON / buildShareSheetHTML である。 */
import test from "node:test";
import assert from "node:assert/strict";
import { loadRuntime, equipPersona } from "../tools/provenance/pipeline-harness.mjs";
import { auditOutputParagraphs, OUTPUT_ROUTES } from "../tools/provenance/output-paragraphs.mjs";

const runtime = loadRuntime();

test("DB本文の段落境界が、全ての出力経路で改行として現れる", () => {
  const { checked, findings } = auditOutputParagraphs(runtime, equipPersona);
  assert.ok(checked > 0, "検査対象の段落境界が1件も無い。監査が空回りしている。");
  assert.deepEqual(
    findings.map((f) => `${f.route} ${f.path}`),
    [],
    "出力経路で原典の段落境界が失われている"
  );
});

/* 利用者から報告された事象そのものを固定する。

   「N社握らんとする者」戦術4「自滅的浄化」の3番目のダイスは、
   原典（紙面206）が `敵討伐時` の手前で改段している。
   これが改行されず使用時効果へ連続して挿入される、という報告だった。 */
test("報告事例: N社握らんとする者 戦術4 の敵討伐時が独立した行になる", () => {
  const persona = runtime.db.tokui_personas.find((p) => p.name === "N社握らんとする者");
  assert.ok(persona, "人格がDBに存在しない");
  const state = equipPersona(runtime, "t", persona);

  const palette = String(runtime.gen.buildPalette(state));
  assert.ok(
    palette.includes("火傷7を付与。\\n敵討伐時、次のRに打撃威力増加1を得る"),
    "チャットパレットで敵討伐時が改行されていない"
  );
  assert.ok(
    !palette.includes("火傷7を付与。 敵討伐時"),
    "チャットパレットで敵討伐時が空白で連結されている"
  );

  const share = String(runtime.gen.buildShareSheetHTML(state));
  assert.ok(
    /火傷7を付与。<br>敵討伐時/.test(share),
    "共有シートで敵討伐時が改行されていない"
  );
});

/* ダイス効果が段落分割器を通ることを、経路に依存しない形で確かめる。
   ロール表記は先頭の段落にだけ付き、段落ごとに重複してはならない。 */
test("複数段落のダイス効果で、ロール表記が重複しない", () => {
  const persona = runtime.db.tokui_personas.find((p) => p.name === "N社握らんとする者");
  const state = equipPersona(runtime, "t", persona);
  const palette = String(runtime.gen.buildPalette(state));

  const skillBlock = palette.split("\n").find((line) => line.includes("自滅的浄化"));
  assert.ok(skillBlock, "戦術4のブロックが見つからない");
  const rollCount = skillBlock.split("30-6d5：的中時、対象の出血が5以上").length - 1;
  assert.equal(rollCount, 1, "同じダイスのロール表記が段落ごとに重複している");
});

/* 段落分割器が、ラウンド持続の表記を段落境界と誤らないことを確かめる。

   `\d+R` は段落見出し（`1R：全ての…`）のほかに、
   効果の持続期間（`怠惰保護2を3Rの間付与する`）としても現れる。
   後者で分割すると、原典が一文で書いた本文を途中で切ることになる。 */
test("ラウンド持続の表記では段落を分割しない", () => {
  const cases = [
    "的中時、次のRに麻痺4を付与し、自分に怠惰保護2を3Rの間付与する",
    "このパッシブを得てから3Rの間、あらゆるデバフが除去される",
    "舞台開始時から1Rの間だけ、戦術選択ダイスロールが2b4から3b4になる"
  ];
  for (const text of cases) {
    assert.deepEqual(runtime.splitEffectLinesPlain(text), [text], `持続表記で分割された: ${text}`);
  }
});

test("ラウンド進行の見出しでは段落を分割する", () => {
  const text = "1R：全ての味方がクイック1を得る2R：全ての敵に脆弱2を付与";
  assert.deepEqual(runtime.splitEffectLinesPlain(text), [
    "1R：全ての味方がクイック1を得る",
    "2R：全ての敵に脆弱2を付与"
  ]);
});

test("出力経路の一覧が、実際に生成できる関数を指している", () => {
  const persona = runtime.db.tokui_personas[0];
  const state = equipPersona(runtime, "t", persona);
  for (const route of OUTPUT_ROUTES) {
    const output = route.build(runtime.gen, state);
    assert.ok(typeof output === "string" && output.length > 0, `${route.key} の出力が空`);
  }
});
