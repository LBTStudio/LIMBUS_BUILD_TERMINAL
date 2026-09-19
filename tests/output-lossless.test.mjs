import test from "node:test";
import assert from "node:assert/strict";

/* 出力生成が本文を壊さないことを検証する（docs/data-provenance-goal.md の G1）。

   利用者から「握る者のスキルテキストが途中で寸断される」という報告を受けた。
   原因は段落分割器がラウンド表記 `\d+R` の直前で無条件に分割していたことで、
   状態表記 `[1R]` と回数制限 `（1Rに2回）` を本文の途中で切っていた。

   個別の人格を狙った回帰テストでは同種の再発を検出できないため、
   「破損の型」をDB全体に対して検査する。 */
import { loadRuntime, collectDbTexts } from "../tools/provenance/pipeline-harness.mjs";

const runtime = loadRuntime();
const split = runtime.splitEffectLinesPlain;
const texts = collectDbTexts(runtime.db);

// 分割器は行頭・行末の空白を落とし空行を捨てる。意味の欠落と空白の整形を区別する。
const squeeze = (value) => String(value || "").replace(/[\s\u3000]/g, "");

test("DBに本文が存在し、検査対象が十分な件数ある", () => {
  assert.ok(texts.length > 3000, `検査対象が少なすぎる: ${texts.length}件`);
});

test("段落分割で本文の文字が欠落・重複しない", () => {
  const problems = [];
  for (const { path, text } of texts) {
    const parts = split(text);
    if (squeeze(parts.join("")) !== squeeze(text)) {
      problems.push(`${path}: ${JSON.stringify(parts)}`);
    }
  }
  assert.deepEqual(problems, []);
});

test("段落の境界で括弧が切り離されない", () => {
  const pairs = [["[", "]"], ["\uFF08", "\uFF09"], ["\u3010", "\u3011"], ["(", ")"], ["\u300C", "\u300D"], ["\u300E", "\u300F"]];
  const problems = [];
  for (const { path, text } of texts) {
    const parts = split(text);
    parts.forEach((part, index) => {
      for (const [open, close] of pairs) {
        const opened = part.split(open).length - 1;
        const closed = part.split(close).length - 1;
        if (opened === closed) continue;
        /* 分割が括弧を切り離したのかを問う検査である。
           分割する前から対応していない括弧は、原典の表記がそうなっている。

             原典 紙面107（パック）「LCAウアジェト 先鋒三隊隊長」
               舞台開始時、自分の弾丸を[LCA亀裂弾」へと[弾倉変換]。
                                              開き [ に対し閉じ 」

           DBは原典どおりに写しており、出力も入力と一字一句同じである。
           これを分断として数えると直しようのない失敗が残り続け、
           本当の分断が埋もれる。 */
        const sourceOpened = text.split(open).length - 1;
        const sourceClosed = text.split(close).length - 1;
        if (sourceOpened !== sourceClosed) continue;
        problems.push(`${path}/段落${index + 1}: ${open}${close} ${JSON.stringify(part)}`);
        return;
      }
      // 括弧が開いたまま段落が終わる形は、直後で分断された痕跡である。
      if (index < parts.length - 1 && /[[\uFF08\u3010(\u300C\u300E]\s*$/.test(part)) {
        problems.push(`${path}/段落${index + 1}: 括弧が開いたまま終端 ${JSON.stringify(part)}`);
      }
    });
  }
  assert.deepEqual(problems, []);
});

test("状態表記・回数制限のラウンド表記で分割しない", () => {
  // [1R] は1ラウンド持続の宣言、（1Rに2回）は発動回数の制限であり、段落見出しではない。
  const cases = [
    "[1R] 虚弱の数だけ攻撃スキル威力減少（最大10）",
    "[1R] 数値2ごとにダメージ量が1増加。対象にN社の釘があれば、数値2ごとにスキル威力+1（最大10）",
    "攻撃的中時、視線1を付与（1Rに2回）。被ダメージ時、攻撃者に視線1を付与（1Rに4回）",
    "自分以外の味方が[振動爆発]した時、戦術スキル1で追撃（1Rに1回）"
  ];
  for (const body of cases) {
    assert.deepEqual(split(body), [body], `分割されてはいけない: ${body}`);
  }
});

test("ラウンド進行の段落見出しは従来どおり分割する", () => {
  // 影響などのラウンド進行は独立した段落として扱う。修正で失われていないことを固定する。
  assert.deepEqual(
    split("1R全ての敵に束縛1と呼吸3を付与2R：全ての敵に内臓崩壊1を付与"),
    ["1R全ての敵に束縛1と呼吸3を付与", "2R：全ての敵に内臓崩壊1を付与"]
  );
  assert.deepEqual(
    split("[影響] 3R\n1R味方に1d100を振らせる\n2R敵に1d100を振らせる"),
    ["[影響] 3R", "1R味方に1d100を振らせる", "2R敵に1d100を振らせる"]
  );
});

test("発動タイミング見出しは段落の先頭に来る", () => {
  /* 見出し語の一覧は本体（js/generator.js）が公開している配列そのものなので、
     sort で並べ替えると本体側の分割処理まで壊れる。複製してから並べ替える。 */
  const words = [...(runtime.timingMarkerWords || [])]
    .filter((word) => !/[\\[\]{}()+*?|^$]/.test(word))
    .sort((a, b) => b.length - a.length);
  const marker = new RegExp("(?:" + words.join("|") + ")[\uFF1A:]", "g");
  // 「一方攻撃時」「クリティカル的中時」の途中一致は分割対象ではない。
  const guard = /(?:一方|クリティカル)\s{0,3}$/;
  const problems = [];
  for (const { path, text } of texts) {
    for (const part of split(text)) {
      marker.lastIndex = 0;
      let match;
      while ((match = marker.exec(part)) !== null) {
        if (match.index === 0) continue;
        if (guard.test(part.slice(0, match.index))) continue;
        problems.push(`${path}: 「${match[0]}」が段落の途中 ${JSON.stringify(part)}`);
        break;
      }
    }
  }
  assert.deepEqual(problems, []);
});

test("握る者のチャットパレット出力で固有バフ本文と敵討伐時が壊れない", () => {
  // 利用者から報告された事象そのものを、出力の実物で固定する。
  const persona = (runtime.db.tokui_personas || []).find((entry) => entry?.name === "N社握る者");
  assert.ok(persona, "N社握る者が存在する");

  const state = runtime.reducer(runtime.initialState, {
    type: "EQUIP_PERSONA",
    mode: "t",
    no: persona.no,
    src: JSON.parse(JSON.stringify(persona))
  });
  const palette = runtime.gen.buildPalette(state);

  // 固有バフの本文が [1R] から分断されない。
  assert.ok(
    palette.includes("効果：\u25B6\uFE0E[1R] 数値2ごとにダメージ量が1増加"),
    "固有バフ「狂信」の本文が [1R] の直後で分断されている"
  );
  assert.ok(
    palette.includes("効果：\u25B6\uFE0E[1R] 貫通、打撃属性スキルによる被ダメージが3増加"),
    "固有バフ「注視」の本文が [1R] の直後で分断されている"
  );
  assert.equal(palette.includes("効果：\u25B6\uFE0E[\\n1R]"), false, "[1R] が段落境界で切り離されている");

  // 戦術4「処断」の敵討伐時は、効果段落の先頭に置かれる。
  assert.ok(
    palette.includes("効果：\u25B6\uFE0E敵討伐時：全ての味方のSANを10回復。次のRにて全ての味方に貫通ダメージ量増加2と打撃ダメージ量増加2を付与"),
    "戦術4「処断」の敵討伐時効果が欠落または分断されている"
  );
});
