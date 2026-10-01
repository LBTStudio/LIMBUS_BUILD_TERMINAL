/* 全要素の計算スタイル・矩形・擬似要素を採取して、比較用 JSON にする。
 *
 *   node tools/ui/probe-styles.mjs <出力ファイル> [ベースURL]
 *
 * 使い方は2つ:
 *   1. 変更前後で 2 回採取して差分を見る（意図しない副作用の検出）
 *   2. 要素数が减ったことで何かが消えた detecting
 *
 * 要素の重複を避けてインデックスで比較するため、
 * 同名の class を持つ要素（.rail-icon が複数など）も漏らさない。
 */

import { writeFileSync } from "node:fs";
import { loadPlaywright, openApp, SECTIONS } from "./harness.mjs";

const out = process.argv[2];
const url = process.argv[3];
if (!out) {
  console.error("usage: node tools/ui/probe-styles.mjs <出力ファイル> [ベースURL]");
  process.exit(1);
}

const { chromium } = loadPlaywright();
const browser = await chromium.launch({ headless: true });
const { context, page } = await openApp(browser, url ? { width: 1440, height: 900 } : undefined);
if (url) await page.goto(url, { waitUntil: "load", timeout: 90000 });

const all = {};
for (let i = 0; i < SECTIONS.length; i++) {
  await page.locator(".rail-item").nth(i).click();
  await page.waitForTimeout(900);
  if (await page.locator(".utility-sheet-backdrop").count()) {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(350);
  }
  all[i] = await page.evaluate(() =>
    Array.from(document.querySelectorAll("*")).map((el, idx) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const desc = el.tagName.toLowerCase() + "." + String(el.className || "").trim().split(/\s+/).join(".") + "|" + (el.textContent || "").trim().slice(0, 10);
      const pb = getComputedStyle(el, "::before");
      const pa = getComputedStyle(el, "::after");
      return {
        idx, desc,
        rect: [Math.round(r.x * 10) / 10, Math.round(r.y * 10) / 10, Math.round(r.width * 10) / 10, Math.round(r.height * 10) / 10],
        color: cs.color, fill: cs.fill, stroke: cs.stroke, bg: cs.backgroundColor, bgi: cs.backgroundImage,
        fs: cs.fontSize, fw: cs.fontWeight, lh: cs.lineHeight, ls: cs.letterSpacing,
        op: cs.opacity, tr: cs.transform, br: cs.borderRadius,
        bt: cs.borderTopWidth + " " + cs.borderTopColor,
        display: cs.display, position: cs.position, overflow: cs.overflow,
        before: pb.content === "none" ? null : { bg: pb.backgroundColor, op: pb.opacity, tr: pb.transform, w: pb.width, h: pb.height, c: pb.color },
        after: pa.content === "none" ? null : { bg: pa.backgroundColor, op: pa.opacity, tr: pa.transform, w: pa.width, h: pa.height, c: pa.color },
      };
    }),
  );
}
await context.close();
await browser.close();

writeFileSync(out, JSON.stringify(all));
console.log(`${out}: ` + Object.entries(all).map(([k, v]) => `s${k}=${v.length}`).join(" "));