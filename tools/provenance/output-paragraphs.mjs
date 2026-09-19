/* 実出力に対する段落構造の照合ロジック。
   監査コマンド（audit-output-paragraphs.mjs）と
   回帰テスト（tests/output-paragraphs.test.mjs、tests/audit-non-vacuity.test.mjs）が共有する。

   判定方針（docs/output-fidelity-goal.md G1・G2）:
     - DB本文に含まれる改行を「原典が意図した段落境界」として扱う
     - 全人格を実際に装備し、4つの出力経路の戻り値を得る
     - 段落境界の前後の本文が、その経路の改行表現で区切られていることを確かめる
     - 空白1個で連結されていれば、改行が失われている */

/* 出力経路と、その経路で段落を区切る表現。

   パレットとJSONはCCFOLIAの文字列改行 `\n`（バックスラッシュとn の2文字）を使う。
   実改行にすると後続の段落が別のコマンドへ分断されてしまうためである。
   メモは実改行、共有シートはHTMLの <br> を使う。 */
export const OUTPUT_ROUTES = [
  { key: "palette", build: (gen, state) => String(gen.buildPalette(state)), breaks: ["\\n", "\n"] },
  { key: "memo", build: (gen, state) => String(gen.buildMemo(state)), breaks: ["\n"] },
  { key: "json", build: (gen, state) => JSON.stringify(gen.buildCcfoliaJSON(state)), breaks: ["\\\\n", "\\n"] },
  { key: "share", build: (gen, state) => String(gen.buildShareSheetHTML(state)), breaks: ["<br>", "<br/>", "<br />", "\n"] }
];

export const PATH_LABELS = {
  palette: "\u30C1\u30E3\u30C3\u30C8\u30D1\u30EC\u30C3\u30C8",
  memo: "\u30E1\u30E2",
  json: "CCFOLIA JSON",
  share: "\u5171\u6709\u30B7\u30FC\u30C8"
};

/* 照合の前に、意味を持たない差を取り除く。

   出力経路はそれぞれの体裁で余白を加えるが、
   段落の先頭に付く記号（パレットの ▶︎、共有シートの <br>）は区切りそのものなので
   取り除いてはいけない。取り除くと、正しく区切られた段落が
   「区切りなしで隣接している」ように見えてしまう。

     出力    …（最大10）\n▶︎自分のデリバリー…     ← 正しく区切られている
     ▶︎を除去 …（最大10）\n自分のデリバリー…
     \nも除去 …（最大10）自分のデリバリー…        ← 誤検出

   そこで比較から外すのは、意味を持たない空白と字下げだけにする。
   区切りの判定は findLostBoundary() が、境界に区切り文字が
   1つも無いことを確かめる形で行う。 */
export function squeeze(value) {
  return String(value == null ? "" : value)
    .replace(/&nbsp;/g, " ")
    .replace(/[\t\u3000 ]/g, "");
}

/* 段落境界の直前・直後の本文を、照合に使える長さだけ取り出す。

   短いと別の項目の同じ言い回しへ誤って一致する。
   同じ人格が似た本文のスキルを複数持つことは珍しくない。

     スキル3 …ダメージ量+1（最大10） 自分のデリバリーキャリア10ごとにスキルd数+1
     スキル4 …ダメージ量+1（最大10）⏎自分のデリバリーキャリア10ごとにスキルd値+1。

   12文字では両者の前後が同じになり、スキル3の欠落をスキル4の指摘として報告してしまう。
   長くとれば区別できるが、経路側の整形（記号の付け外し）で一致しなくなる恐れがあるので、
   段落が短ければその全体を使い、長い場合だけ上限で切る。 */
const CONTEXT_LENGTH = 24;
const CONTEXT_MIN = 10;

/* DB本文から、段落境界の一覧を作る。
   1件は「境界の直前の本文」と「直後の本文」の対である。 */
export function paragraphBoundaries(text) {
  const segments = String(text == null ? "" : text)
    .split("\n")
    .map((segment) => segment.trim())
    .filter(Boolean);
  const boundaries = [];
  for (let index = 0; index < segments.length - 1; index++) {
    const before = squeeze(segments[index]);
    const after = squeeze(segments[index + 1]);
    if (before.length < CONTEXT_MIN || after.length < CONTEXT_MIN) continue;
    boundaries.push({
      before: before.slice(-CONTEXT_LENGTH),
      after: after.slice(0, CONTEXT_LENGTH)
    });
  }
  return boundaries;
}

/* 出力の中で、段落境界に区切りが残っているかを見る。

   出力の中から境界の直前の本文を探し、その直後に境界の直後の本文が
   どれだけ離れて現れるかを見る。間に挟まっている文字列が、
   その経路の区切り（`\n` `<br>` など）を1つも含まなければ、
   原典が改段した位置で改行が失われている。

   区切りそのものは squeeze() で消さないので、正しく出力されていれば
   両者の間に必ず残る。逆に間が空（隣接）か、区切りを含まない
   わずかな文字だけなら、改行が空白などへ潰されている。 */
const BOUNDARY_GAP_LIMIT = 4;
export function findLostBoundary(output, boundary, breaks) {
  const flat = squeeze(output);
  let from = 0;
  for (;;) {
    const at = flat.indexOf(boundary.before, from);
    if (at < 0) return null;
    const tail = at + boundary.before.length;
    const next = flat.indexOf(boundary.after, tail);
    if (next >= 0 && next - tail <= BOUNDARY_GAP_LIMIT) {
      const gap = flat.slice(tail, next);
      if (!breaks.some((mark) => gap.includes(mark))) {
        return flat.slice(Math.max(0, at - 8), next + boundary.after.length + 8);
      }
    }
    from = at + 1;
  }
}

/* DBの本文を、それを持つ人格・E.G.Oの装備状態つきで列挙する。

   出力を得るには実際に装備した state が必要なので、
   pipeline-harness の collectDbTexts とは別に、装備の対象を伴って集める。 */
export function collectEquippableTexts(db) {
  const rows = [];
  const pushPersona = (mode, persona) => {
    const base = `${mode === "n" ? "\u901A\u5E38" : "\u7279\u7570"}/${persona?.name}`;
    const add = (path, text) => {
      if (typeof text === "string" && text.includes("\n")) rows.push({ mode, persona, path, text });
    };
    add(`${base}/passive_effect`, persona?.passive_effect);
    add(`${base}/passive_always`, persona?.passive_always);
    (persona?.unique_buffs || []).forEach((buff) => add(`${base}/\u56FA\u6709\u30D0\u30D5\u300C${buff?.name || ""}\u300D`, buff?.desc));
    (persona?.skills || []).forEach((skill) => {
      const head = `${base}/${skill?.rank || "\u30B9\u30AD\u30EB"}\u300C${skill?.name || ""}\u300D`;
      add(`${head}/\u52B9\u679C`, skill?.effect);
      (skill?.dice || []).forEach((dice, index) => add(`${head}/\u30C0\u30A4\u30B9${index + 1}`, dice?.effect));
    });
  };
  (db.normal_personas || []).forEach((persona) => pushPersona("n", persona));
  (db.tokui_personas || []).forEach((persona) => pushPersona("t", persona));
  return rows;
}

/* 段階3の監査本体。人格を装備して4経路の出力を作り、段落境界を照合する。

   同じ人格の出力を項目ごとに作り直すと遅いので、人格単位でまとめて生成する。 */
export function auditOutputParagraphs(runtime, equipPersona, { mutate = null } = {}) {
  const rows = collectEquippableTexts(runtime.db);
  const byPersona = new Map();
  for (const row of rows) {
    const key = `${row.mode}/${row.persona?.name}`;
    if (!byPersona.has(key)) byPersona.set(key, { mode: row.mode, persona: row.persona, items: [] });
    byPersona.get(key).items.push(row);
  }

  const findings = [];
  let checked = 0;
  for (const { mode, persona, items } of byPersona.values()) {
    let state;
    try {
      state = equipPersona(runtime, mode, persona);
    } catch (error) {
      findings.push({ code: "equip_error", path: `${mode}/${persona?.name}`, excerpt: error.message });
      continue;
    }
    for (const route of OUTPUT_ROUTES) {
      let output;
      try {
        output = route.build(runtime.gen, state);
      } catch (error) {
        findings.push({ code: "output_error", route: route.key, path: `${mode}/${persona?.name}`, excerpt: error.message });
        continue;
      }
      // 非空虚性テストは、ここで出力をわざと壊して監査が気づくかを確かめる。
      if (mutate) output = mutate(route.key, output);
      if (!output || !String(output).trim()) {
        findings.push({ code: "empty_output", route: route.key, path: `${mode}/${persona?.name}`, excerpt: "empty export" });
        continue;
      }
      for (const item of items) {
        for (const boundary of paragraphBoundaries(item.text)) {
          checked++;
          const excerpt = findLostBoundary(output, boundary, route.breaks);
          if (!excerpt) continue;
          findings.push({
            route: route.key,
            path: item.path,
            before: boundary.before,
            after: boundary.after,
            excerpt
          });
        }
      }
    }
  }
  if (!checked) findings.push({ code: "nothing_checked", path: "audit", excerpt: "no paragraph boundaries checked" });
  return { checked, findings };
}
