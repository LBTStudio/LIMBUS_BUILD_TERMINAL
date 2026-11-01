#!/usr/bin/env node
/* Generate a real share-sheet document from the app's production generator and
   scan both the share entry page and the generated sheet at four responsive widths. */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { loadRuntime, equipPersona } from "../provenance/pipeline-harness.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.join(ROOT, "artifacts/ui-audit-screenshots");
const AXE = fs.readFileSync(path.join(ROOT, ".browser-deps/node_modules/axe-core/axe.min.js"), "utf8");
const require = createRequire(path.join(ROOT, ".browser-deps/node_modules/playwright/package.json"));
const { chromium } = require("../playwright");
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp",
  ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8"
};

function makeShareFixture() {
  const runtime = loadRuntime();
  const persona = runtime.db.normal_personas[0];
  if (!persona) throw new Error("share-view axe fixture needs at least one normal persona");
  let state = equipPersona(runtime, "n", persona);
  const ego = runtime.db.egos[0];
  const support = runtime.db.support_passives[0];
  if (ego) state = runtime.reducer(state, { type: "SET_EGO_SLOT", rank: "ZAYIN", value: ego });
  if (support) {
    state = runtime.reducer(state, { type: "ADD_ROSTER_SUPPORT", spp: support, purchase: false });
    state = runtime.reducer(state, { type: "ADD_SUPPORT", spp: support });
  }
  const html = String(runtime.gen.buildShareSheetHTML(state));
  if (!html.includes('id="share-search-input"')) throw new Error("generated share sheet did not include its search UI");
  if (!html.includes('id="share-private-notes-input"')) throw new Error("generated share sheet did not include its private memo UI");
  return { html, personaName: persona.name };
}

const fixture = makeShareFixture();
const server = http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url || "/", "http://127.0.0.1").pathname); }
  catch { res.writeHead(400).end("Bad request"); return; }
  if (pathname === "/__audit/share-fixture.html") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    res.end(fixture.html);
    return;
  }
  if (pathname === "/") pathname = "/share.html";
  const file = path.resolve(ROOT, "." + pathname);
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) { res.writeHead(403).end("Forbidden"); return; }
  fs.stat(file, (error, stat) => {
    if (error || !stat.isFile()) { res.writeHead(404).end("Not found"); return; }
    res.writeHead(200, {
      "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff"
    });
    fs.createReadStream(file).pipe(res);
  });
});

await fs.promises.mkdir(OUT, { recursive: true });
await new Promise((resolve, reject) => { server.once("error", reject); server.listen(4175, "127.0.0.1", resolve); });
const browser = await chromium.launch({ headless: true });
const viewports = [
  { name: "desktop-1440", width: 1440, height: 900 },
  { name: "tablet-1024", width: 1024, height: 768 },
  { name: "mobile-390", width: 390, height: 844 },
  { name: "mobile-320", width: 320, height: 640 }
];
const rows = [];
const failures = [];
async function scan(page, profile, state, url) {
  const result = await page.evaluate(async () => {
    const axeResult = await window.axe.run(document, { resultTypes: ["violations"] });
    const rect = (element) => {
      const r = element.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
    };
    const overflow = document.documentElement.scrollWidth > innerWidth + 2;
    return {
      title: document.title,
      viewport: { width: innerWidth, height: innerHeight },
      document: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight },
      horizontalOverflow: overflow,
      sheet: rect(document.querySelector(".sheet") || document.body),
      violations: axeResult.violations.map((violation) => ({
        id: violation.id, impact: violation.impact, help: violation.help,
        nodes: violation.nodes.map((node) => ({
          target: node.target.join(" "), html: node.html.slice(0, 240),
          summary: (node.failureSummary || "").slice(0, 320)
        }))
      }))
    };
  });
  const screenshot = state.replace(/[^a-z0-9-]/gi, "-").toLowerCase() + "-" + profile.name + ".png";
  await page.screenshot({ path: path.join(OUT, screenshot), fullPage: true, animations: "disabled" });
  const nodes = result.violations.reduce((sum, violation) => sum + violation.nodes.length, 0);
  const blocking = result.violations.filter((v) => v.impact === "critical" || v.impact === "serious")
    .reduce((sum, violation) => sum + violation.nodes.length, 0);
  const row = { page: url, state, viewport: profile, violationNodes: nodes, seriousCriticalNodes: blocking, ...result, screenshot };
  rows.push(row);
  if (blocking) failures.push({ page: url, state, viewport: profile.name, violations: result.violations.filter(v => v.impact === "critical" || v.impact === "serious") });
  if (result.horizontalOverflow) failures.push({ page: url, state, viewport: profile.name, type: "horizontal-overflow", document: result.document });
  console.log("[share-axe] " + url + " | " + state + " | " + profile.name + " | nodes=" + nodes + " | serious/critical=" + blocking + " | overflow=" + result.horizontalOverflow);
}
try {
  for (const profile of viewports) {
    const context = await browser.newContext({
      viewport: { width: profile.width, height: profile.height },
      isMobile: profile.width <= 640,
      hasTouch: profile.width <= 640,
      colorScheme: "dark",
      reducedMotion: "reduce"
    });
    try {
      const page = await context.newPage();
      page.setDefaultTimeout(8000);
      await page.addInitScript(AXE);
      await page.route("**/cdn-cgi/rum**", (route) => route.fulfill({ status: 204, body: "" }));
      await page.goto("http://127.0.0.1:4175/share.html", { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForFunction(() => document.querySelector("#share-root")?.innerText.includes("共有データがありません"), null, { timeout: 10000 });
      await scan(page, profile, "empty-share-entry", "/share.html");

      await page.goto("http://127.0.0.1:4175/__audit/share-fixture.html", { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForSelector("#share-search-input", { timeout: 10000 });
      await scan(page, profile, "generated-share-sheet", "/__audit/share-fixture.html");

      await page.locator("details").evaluateAll((items) => items.forEach((item) => { item.open = true; }));
      await scan(page, profile, "all-folds-expanded", "/__audit/share-fixture.html");

      const search = page.locator("#share-search-input");
      await search.fill(fixture.personaName);
      await page.waitForTimeout(120);
      await scan(page, profile, "share-search-results", "/__audit/share-fixture.html");

      await search.fill("");
      const notes = page.locator("#share-private-notes-input");
      if (await notes.count()) await notes.fill("LBT UI audit memo");
      await scan(page, profile, "private-notes", "/__audit/share-fixture.html");
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
const report = {
  generatedAt: new Date().toISOString(),
  scope: "share.html empty/error entry + generated production share sheet",
  fixturePersona: fixture.personaName,
  viewportCount: viewports.length,
  stateCount: rows.length,
  seriousCriticalNodeCount: rows.reduce((sum, row) => sum + row.seriousCriticalNodes, 0),
  horizontalOverflowCount: rows.filter((row) => row.horizontalOverflow).length,
  rows,
  failures
};
const output = path.join(OUT, "share-view-axe.json");
fs.writeFileSync(output, JSON.stringify(report, null, 2));
console.log("[share-axe] " + rows.length + " states; serious/critical=" + report.seriousCriticalNodeCount + "; overflow=" + report.horizontalOverflowCount);
console.log("[share-axe] report: " + path.relative(ROOT, output));
if (failures.length) process.exitCode = 1;
