import { readFileSync } from "node:fs";

// createDefaultOgpImageData 内の C.* 参照がすべて OGP_CARD_COLORS に
// 定義済みかを確認する。他の文脈（colorLerp の戻り値など）は対象外。

const src = readFileSync("js/share-link.js", "utf8");

const objStart = src.indexOf("const OGP_CARD_COLORS = {");
const objEnd = src.indexOf("};", objStart);
const objBody = src.slice(objStart, objEnd);
const defined = new Set([...objBody.matchAll(/(\w+):\s*"/g)].map((m) => m[1]));

const fnStart = src.indexOf("function createDefaultOgpImageData");
const fnEnd = src.indexOf("\n  }\n", fnStart);
const fnBody = src.slice(fnStart, fnEnd);

const used = [...new Set([...fnBody.matchAll(/\bC\.(\w+)/g)].map((m) => m[1]))];

console.log(`OGP_CARD_COLORS の定義: ${defined.size} キー`);
console.log(`  ${[...defined].join(", ")}`);
console.log(`\n関数が使う C.* : ${used.length}`);
const missing = used.filter((k) => !defined.has(k));
for (const k of used) console.log(`  ${missing.includes(k) ? "MISSING" : "ok     "} C.${k}`);

console.log(`\n未定義: ${missing.length ? missing.join(", ") : "なし"}`);
console.log(`関数内の生のリテラル: ${(fnBody.match(/#[0-9a-fA-F]{6}/g) || []).length} 箇所`);
process.exitCode = missing.length ? 1 : 0;