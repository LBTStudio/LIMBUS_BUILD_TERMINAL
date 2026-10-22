/* 紙面の区切りハイフンが、出力の行頭・行末へ残らないことを確かめる。

   PDFの見出しと箇条書きは `-血染めの鋏の刃Ⅰ-` `-温度が10以上…-` のように
   ダッシュで囲まれており、そのままDBへ転記されている。表示の段落から外さないと
   `…振動爆発ダメージ量+5-\n消費…` の行末ハイフンが CCFOLIA のコマンド区切りと
   紛れ、改段が崩れる。

   DBは原典の写しなので本文は変えない。直すのは表示だけである。 */
import test from "node:test";
import assert from "node:assert/strict";
import { loadRuntime, equipPersona } from "../tools/provenance/pipeline-harness.mjs";

const runtime = loadRuntime();

/* 段落の先頭・末尾に付いた区切りハイフンだけを見る。
   パレットは `効果：▶︎…` のようにラベルと矢印を前置するため、
   本文の開始位置（行頭・矢印の直後・短いラベルの直後）で判定する。
   名前の途中のハイフン（弾丸-虎標弾、解禁-Ⅰ、中指-怨恨）は対象外。 */
const hasBoundaryDash = (segment) => /(^|▶︎|[^\s]{1,12}：)-/.test(segment) || /-$/.test(segment);

const paletteSegments = (palette) => palette.split("\n").flatMap((command) => command.split("\\n"));

test("全ての人格のチャットパレットに区切りハイフンが残らない", () => {
  const findings = [];
  for (const [list, mode] of [["normal_personas", "n"], ["tokui_personas", "t"]]) {
    for (const persona of runtime.db[list]) {
      const palette = String(runtime.gen.buildPalette(equipPersona(runtime, mode, persona)));
      for (const segment of paletteSegments(palette)) {
        if (hasBoundaryDash(segment)) findings.push(`${persona.name}: ${segment.slice(0, 80)}`);
      }
    }
  }
  assert.deepEqual(findings, []);
});

test("全ての人格のメモに区切りハイフンが残らない", () => {
  const findings = [];
  for (const [list, mode] of [["normal_personas", "n"], ["tokui_personas", "t"]]) {
    for (const persona of runtime.db[list]) {
      const memo = String(runtime.gen.buildMemo(equipPersona(runtime, mode, persona)));
      for (const line of memo.split("\n")) {
        if (hasBoundaryDash(line.trim())) findings.push(`${persona.name}: ${line.trim().slice(0, 80)}`);
      }
    }
  }
  assert.deepEqual(findings, []);
});

function paletteOf(list, name) {
  const persona = runtime.db[list].find((entry) => entry.name === name);
  assert.ok(persona, `人格がDBに存在しない: ${name}`);
  const mode = list === "tokui_personas" ? "t" : "n";
  return String(runtime.gen.buildPalette(equipPersona(runtime, mode, persona)));
}

test("報告事例: 温度の段階ごとの効果がハイフンなしで改段される", () => {
  const palette = paletteOf("normal_personas", "湯の花運送会社員");
  assert.ok(
    palette.includes("効果：▶︎R開始時に5得る\\n温度が10以上の時、火傷を付与するダイスのダメージ量+1"),
    "温度の段階が区切りハイフン付きのまま出力されている"
  );
});

test("報告事例: 研磨の段階ごとの効果がハイフンなしで改段される", () => {
  const palette = paletteOf("normal_personas", "第四銀工房太刀派フィクサー");
  assert.ok(
    palette.includes("効果：▶︎研磨が3以上の時、バリア状態の敵に与えるダメージ量+2\\n研磨が5以上の時"),
    "研磨の段階が区切りハイフン付きのまま出力されている"
  );
});

test("報告事例: 血染めの鋏の刃の見出しがハイフンなしで改段される", () => {
  const palette = paletteOf("tokui_personas", "ラ・マンチャランド理髪師");
  assert.ok(
    palette.includes("効果：▶︎血染めの鋏の刃Ⅰ\\nR開始時、ダメージ量増加1"),
    "血染めの鋏の刃Ⅰの周囲のハイフンが残っている"
  );
  assert.ok(!palette.includes("-血染めの鋏の刃Ⅰ-"), "見出しの区切りハイフンが残っている");
});

test("弾丸効果の末尾ハイフンが改段を壊さない", () => {
  const palette = paletteOf("tokui_personas", "東部親指カポIIII");
  assert.ok(
    palette.includes("振動爆発ダメージ量+5\\n消費することで特定戦術の能力が向上"),
    "末尾ハイフンのせいで効果の区切りが崩れている"
  );
  assert.ok(!palette.includes("+5-\\n"), "行末の区切りハイフンが残っている");
});

test("名前と本文の途中にあるハイフンは保持する", () => {
  const middleFinger = paletteOf("tokui_personas", "蜘蛛の巣 中指の親方");
  assert.ok(middleFinger.includes("中指-怨恨"), "バフ名のハイフンが消えている");
  const indexFinger = paletteOf("tokui_personas", "蜘蛛の巣 人差し指の子方：端末機");
  assert.ok(indexFinger.includes("被ダメージ量-1"), "本文のマイナス表記が消えている");
  assert.ok(paletteOf("normal_personas", "湯の花運送会社員").includes("火傷-鬼火"), "変換名のハイフンが消えている");
});

test("E.G.Oの固有バフも区切りハイフンなしで改段される", () => {
  const ego = runtime.db.egos.find((entry) => entry.name === "魔法の弾丸：魔弾の射手");
  assert.ok(ego, "E.G.OがDBに存在しない");
  assert.equal(
    runtime.formatEffectLines(ego.unique_buff),
    "[弾丸-魔弾]\n銃撃ダイスがあるスキルでマッチ勝利時、火傷3付与\n消費することで特定戦術の能力が向上"
  );
});

test("区切りハイフンの除去は冪等で、段落の本文を変えない", () => {
  const cases = [
    ["-解禁-Ⅰ", "解禁-Ⅰ"],
    ["-血染めの鋏の刃Ⅰ-", "血染めの鋏の刃Ⅰ"],
    ["-研磨が3以上の時、斬撃威力+1-", "研磨が3以上の時、斬撃威力+1"],
    ["弾丸-虎標弾", "弾丸-虎標弾"],
    ["被ダメージ量-1", "被ダメージ量-1"]
  ];
  for (const [input, expected] of cases) {
    assert.deepEqual(runtime.splitEffectLinesPlain(input), [expected]);
    assert.deepEqual(runtime.splitEffectLinesPlain(expected), [expected]);
  }
});
