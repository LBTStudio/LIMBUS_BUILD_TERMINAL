/* 監査が「空回りしていない」ことを確かめる — docs/output-fidelity-goal.md の G4。

   この作業の発端は、監査が0件を報告し続けたまま利用者が破損を踏んだことである。
   先行作業 docs/data-provenance-goal.md の完了条件（両監査が0件・全テスト成功）は
   事象が起きている最中も満たされていた。原因は個別の見落としではなく、
   監査が検査する対象と、利用者が受け取る出力の経路が別だったことにある。

   「0件」は、監査が正しく働いている証拠にはならない。
   検出すべき破損を注入したとき必ず検出することを確かめて、初めて意味を持つ。

   先行作業もこの確認を人手で一度は行っている。しかしそれはテストではなかったため、
   出力経路が増えたときに監査が追随しているかを誰も検証できなかった。
   ここでは注入試験そのものをテストにして、経路ごとに常時実行する。 */
import test from "node:test";
import assert from "node:assert/strict";
import { loadRuntime, equipPersona, collectDbTexts } from "../tools/provenance/pipeline-harness.mjs";
import { auditOutputParagraphs, OUTPUT_ROUTES } from "../tools/provenance/output-paragraphs.mjs";
import { auditDbParagraphs, loadParagraphs } from "../tools/provenance/db-paragraphs.mjs";

const runtime = loadRuntime();

/* 段階3の監査が、出力経路ごとに破損を検出できることを確かめる。

   注入する破損は、実際に起きていたものと同じ型にする。
   すなわち「段落の区切りを空白1個へ潰す」である。
   ダイス効果が sanitizeInline() を通っていたときの出力がまさにこの形だった。 */
for (const route of OUTPUT_ROUTES) {
  test(`段階3の監査は ${route.key} の改行消失を検出する`, () => {
    const collapse = (key, output) => {
      if (key !== route.key) return output;
      let broken = output;
      for (const mark of route.breaks) broken = broken.split(mark).join(" ");
      return broken;
    };
    const { findings } = auditOutputParagraphs(runtime, equipPersona, { mutate: collapse });
    const hit = findings.filter((finding) => finding.route === route.key);
    assert.ok(
      hit.length > 0,
      `${route.key} の改行を全て空白へ潰しても検出されなかった。` +
      "監査がこの経路を見ていない可能性がある。"
    );
  });
}

/* 注入していない経路が巻き込まれて指摘されないことも確かめる。
   これが崩れていると、上の試験は「常に何か検出する」だけの意味しか持たない。 */
test("段階3の監査は、壊していない経路を指摘しない", () => {
  const target = OUTPUT_ROUTES[0];
  const collapse = (key, output) => {
    if (key !== target.key) return output;
    let broken = output;
    for (const mark of target.breaks) broken = broken.split(mark).join(" ");
    return broken;
  };
  const { findings } = auditOutputParagraphs(runtime, equipPersona, { mutate: collapse });
  const others = findings.filter((finding) => finding.route !== target.key);
  assert.deepEqual(others.map((f) => `${f.route} ${f.path}`), [], "壊していない経路が指摘された");
});

/* 段階1の監査が、DBの段落構造の破損を検出できることを確かめる。

   canon() が改行を除去する文字照合では、この型は原理的に検出できない。
   段落照合が実際にその死角を埋めていることを、注入で示す。 */
test("段階1の段落照合は、DBが原典の改段を落とすと検出する", () => {
  const paragraphs = loadParagraphs();
  const texts = collectDbTexts(runtime.db);
  const healthy = auditDbParagraphs(texts, runtime.timingMarkerWords, paragraphs);
  assert.equal(healthy.merged.length, 0, "前提: 現在のDBに連結の指摘は無い");

  /* 原典が改段している本文から改行を落として注入する。
     特定の人格を名指しすると、その人格の本文が変わったとき試験が
     「壊せていないから通る」状態へ静かに変わる。DBから条件で選ぶ。

     ただしDBの改行がすべて原典の改段に対応するとは限らない
     （原典が同じ段落の中で折り返しているだけの箇所もある）ため、
     注入して検出できる本文が十分な数あることを確かめる形にする。 */
  const multiline = texts.filter((item) => item.text.includes("\n"));
  assert.ok(multiline.length > 50, `改行を含む本文が少なすぎる: ${multiline.length}件`);

  const sample = multiline.slice(0, 60);
  let detected = 0;
  for (const item of sample) {
    const broken = [{ path: item.path, text: item.text.replace(/\n/g, "") }];
    if (auditDbParagraphs(broken, runtime.timingMarkerWords, paragraphs).merged.length) detected++;
  }
  assert.ok(
    detected > sample.length / 2,
    `改行を落としても検出されたのは ${detected}/${sample.length} 件。段落照合が働いていない。`
  );

  // 改行を保った本文を誤検出しないことも確かめる（常に何か検出するだけの試験にしない）。
  const clean = auditDbParagraphs(sample, runtime.timingMarkerWords, paragraphs);
  assert.equal(clean.merged.length, 0, "改行を保った本文が連結として誤検出された");
});

/* 段階1の監査が、DBが原典に無い改行を入れた場合も検出することを確かめる。 */
test("段階1の段落照合は、DBが原典に無い改行を入れると検出する", () => {
  const paragraphs = loadParagraphs();

  /* 発動タイミング見出しで始まらない位置で切る。
     見出しの直前は組版から段落境界か判定できないため、
     監査が意図的に報告しない位置になっている（偽陽性を避けるため）。 */
  const marker = /^(?:使用時|戦闘開始時|マッチ開始時|マッチ勝利時|マッチ敗北時|攻撃後|攻撃前|的中時|R開始時|R終了時)[、：:]/;
  let injected = 0;
  let detected = 0;
  for (const source of paragraphs) {
    if (injected >= 20) break;
    if (source.raw.length < 40) continue;
    const cut = source.raw.indexOf("。", 12) + 1;
    if (cut <= 12 || cut >= source.raw.length - 12) continue;
    const tail = source.raw.slice(cut);
    if (marker.test(tail)) continue;
    injected++;
    const broken = [{ path: "\u6CE8\u5165/\u691C\u8A3C\u7528", text: `${source.raw.slice(0, cut)}\n${tail}` }];
    if (auditDbParagraphs(broken, runtime.timingMarkerWords, paragraphs).split.length) detected++;
  }
  assert.ok(injected > 0, "注入に使える原典の段落が見つからない");
  assert.ok(
    detected > injected / 2,
    `原典に無い改行を入れても検出されたのは ${detected}/${injected} 件。分断の照合が働いていない。`
  );
});

/* 監査が対象を一件も集められていない（空回り）状態を検出する。
   対象0件でも「検出0件」と表示されてしまうため、件数そのものを見張る。 */
test("監査は検査対象を実際に集めている", () => {
  const { checked: outputChecked } = auditOutputParagraphs(runtime, equipPersona);
  assert.ok(outputChecked > 100, `段階3の検査対象が少なすぎる: ${outputChecked}件`);

  const { checked: dbChecked } = auditDbParagraphs(collectDbTexts(runtime.db), runtime.timingMarkerWords);
  assert.ok(dbChecked > 1000, `段階1の検査対象が少なすぎる: ${dbChecked}件`);
});
