/* 12 セクションのスクリーンショットを撮る（差分比較の基準）。
 *
 *   node tools/ui/capture.mjs <tag> [ベースURL]
 *
 * 例: node tools/ui/capture.mjs before
 *     node tools/ui/capture.mjs after
 *     node tools/ui/compare-shots.mjs before after
 *
 * 出力は tools/ui/shots/<tag>-<番号>.png。
 */

import { loadPlaywright, openApp, captureSections, BASE_URL, SECTIONS } from "./harness.mjs";

const tag = process.argv[2] || "shot";
const url = process.argv[3] || BASE_URL;

const { chromium } = loadPlaywright();
const browser = await chromium.launch({ headless: true });
const { context, page, errors } = await openApp(browser);

console.log(`target: ${url}`);
console.log(`tag   : ${tag}`);

const files = await captureSections(page, tag);
await context.close();
await browser.close();

console.log(`\n${files.length} sections ->`);
files.forEach((f, i) => console.log(`  ${SECTIONS[i].padEnd(6)} ${f}`));
if (errors.length) {
  console.log(`\nconsole errors: ${errors.length}`);
  errors.slice(0, 5).forEach((e) => console.log(`  ${e}`));
}