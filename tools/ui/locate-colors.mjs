import { readFileSync } from "node:fs";

// 16進色リテラルがどの関数に属するかを特定する。
// 共有定数へ抽出する前に、色が単一用途なのか複数用途なのかを知る。

const lines = readFileSync("js/share-link.js", "utf8").split(/\r?\n/);

const fns = [];
lines.forEach((l, i) => {
  const m = l.match(/^\s*(?:function|const)\s+(\w+)/);
  if (m) fns.push({ name: m[1], line: i + 1 });
});

const byFn = new Map();
lines.forEach((l, i) => {
  const m = l.match(/#[0-9a-fA-F]{6}/g);
  if (!m) return;
  let cur = "(top level)";
  for (const f of fns) if (f.line <= i + 1) cur = f.name;
  if (!byFn.has(cur)) byFn.set(cur, []);
  byFn.get(cur).push({ line: i + 1, colors: m });
});

for (const [fn, hits] of byFn) {
  const flat = hits.flatMap((h) => h.colors);
  const uniq = [...new Set(flat.map((c) => c.toLowerCase()))];
  console.log(`${fn}: ${flat.length} 箇所 / ${uniq.length} 種類`);
  uniq.forEach((c) => console.log(`   ${c}  x${flat.filter((x) => x.toLowerCase() === c).length}`));
}