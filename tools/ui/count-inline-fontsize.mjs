import { readFileSync, readdirSync } from "node:fs";

// JS 側のインライン fontSize が var(--fs-*) を使っているか数える。
// 使っていれば token 側の rem 化でそのまま追従する。

let total = 0;
for (const f of readdirSync("js").filter((x) => x.endsWith(".js"))) {
  const s = readFileSync(`js/${f}`, "utf8");
  const m = s.match(/fontSize:\s*"var\(--fs-[^"]+\)"/g);
  if (m) {
    console.log(`  ${f}: ${m.length}`);
    total += m.length;
  }
}
console.log(`\ntotal: ${total}`);
console.log("これらは var() 参照なので token 側の rem 化でそのまま追従する。");