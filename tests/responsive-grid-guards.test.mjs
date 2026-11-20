import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

// Phase 4 のレスポンシブ修正が将来崩れないように固定する。
//
// 実測で判明した不具合は 2 つ:
//   1. repeat(auto-fill, minmax(Npx, 1fr)) の最小トラック幅が
//      コンテナより広く、320px でグリッドが親を超えてはみ出していた
//   2. .topbar-actions の overflow: hidden がブランド幅の都合で
//      アイコンボタンを切り落とし、1100〜1600px で到達不能にしていた
//
// どちらも静的な CSS 検査では検出できないため、
// 「形ggplot の式」と「shrinking の優先順位」を文字列で固定する。

const read = (rel) => readFileSync(new URL(rel, import.meta.url), "utf8");
// コメント内の記述（たとえば「かつては min-width: 240px」）を検査すると
// 必ず false positive になるため、ルール本体の取得時は常にコメントを除く。
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "");

test("auto-fill / auto-fit のグリッド最小幅は min() でガードされている", () => {
  const files = [
    "../assets/design-system.css", "../assets/workspace.css", "../assets/persona-codex.css",
    "../assets/sections.css", "../assets/v52-overlay.css", "../assets/v53-overlay.css",
    "../assets/v56-refinements.css", "../assets/v65r29-draft-import.css",
    "../assets/v65r43-ego-readability.css", "../assets/v65r44-ego-quick-detail.css",
    "../assets/v65r47-ego-card-marks.css", "../assets/items.css",
  ];
  const offenders = [];
  for (const f of files) {
    const src = stripComments(read(f));
    // minmax() は入れ子の括弧を持つので、minmax(... , 1fr) 全体を貪欲に取る。
    for (const m of src.matchAll(/repeat\(\s*(auto-fill|auto-fit)\s*,\s*minmax\((.+?),\s*1fr\s*\)\s*\)/g)) {
      if (!/^min\(\s*\d+px\s*,\s*100%\s*\)$/.test(m[2].trim())) offenders.push(`${f}: ${m[0]}`);
    }
  }
  assert.deepEqual(offenders, []);
});

test("topbar のアイコンボタンは幅に拒不されない", () => {
  const workspace = stripComments(read("../assets/workspace.css"));
  // .topbar-actions は overflow: hidden ではなく横スクロールにフォールバックする
  const actions = workspace.match(/\.topbar-actions\s*\{([^}]*)\}/);
  assert.ok(actions, ".topbar-actions の定義が存在する");
  assert.doesNotMatch(actions[1], /overflow\s*:\s*hidden/);
  assert.match(actions[1], /overflow-x\s*:\s*auto/);
});

test("ブランドは操作ボタンより先に縮む", () => {
  const workspace = stripComments(read("../assets/workspace.css"));
  const brand = workspace.match(/\.brand\s*\{([^}]*)\}/);
  assert.ok(brand, ".brand の定義が存在する");
  // shrink が強く、min-width: 0 で省略できる状態であること
  assert.match(brand[1], /min-width\s*:\s*0/);
  const shrink = brand[1].match(/flex\s*:\s*([^;]+)/);
  assert.ok(shrink, ".brand に flex 指定がある");
  const shrinkFactor = Number((shrink[1].trim().match(/^0\s+(\d+)\s+auto$/) || [])[1]);
  assert.ok(shrinkFactor > 1, `flex-shrink が 1 より大きいこと（実際 ${shrink[1].trim()}）`);
});

test("topbar の検索欄は幅を独占せず縮められる", () => {
  const workspace = stripComments(read("../assets/workspace.css"));
  const search = workspace.match(/\.topbar-search\s*\{([^}]*)\}/);
  assert.ok(search, ".topbar-search の定義が存在する");
  // かつては min-width: 240px の床があり、Actions の幅を奪っていた
  assert.doesNotMatch(search[1], /min-width\s*:\s*2\d\dpx/);
  assert.match(search[1], /min-width\s*:\s*0/);
});

test("ブランド名と副題はいずれも省略記号で 1 行に収まる", () => {
  const workspace = stripComments(read("../assets/workspace.css"));
  for (const sel of [".brand-name", ".brand-sub"]) {
    const rule = workspace.match(new RegExp(`\\${sel}\\s*\\{([^}]*)\\}`));
    assert.ok(rule, `${sel} の定義が存在する`);
    assert.match(rule[1], /white-space\s*:\s*nowrap/, `${sel} が折り返さない`);
    assert.match(rule[1], /text-overflow\s*:\s*ellipsis/, `${sel} が省略記号を使う`);
    assert.match(rule[1], /overflow\s*:\s*hidden/, `${sel} がはみ出さない`);
  }
});