#!/usr/bin/env node
import { chromium } from "playwright";
import { createServer } from "node:http";
import { createReadStream, statSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.join(ROOT, "artifacts", "account-layout-screenshots");
const HOST = "127.0.0.1";
const PORT = 4196;
const BASE_URL = `http://${HOST}:${PORT}/`;
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".woff2": "font/woff2"
};
const fixtures = [
  ["メインキャンペーン", "本番"],
  ["長期キャンペーン", "記録"],
  ["短期卓", "TRPG"],
  ["検証環境", "検証"],
  ["配布・共有確認", "公開前"],
  ["過去ログ保管", "アーカイブ"],
  ["NPC・サンプル", "制作"],
  ["予備アカウント", "予備"]
];

function startServer() {
  return createServer((req, res) => {
    let relative;
    try {
      relative = decodeURIComponent(new URL(req.url || "/", BASE_URL).pathname);
    } catch {
      res.writeHead(400).end("Bad request");
      return;
    }
    if (relative === "/") relative = "/index.html";
    const target = path.resolve(ROOT, "." + relative);
    if (target !== ROOT && !target.startsWith(ROOT + path.sep)) {
      res.writeHead(403).end("Forbidden");
      return;
    }
    let stat;
    try { stat = statSync(target); } catch {
      res.writeHead(404).end("Not found");
      return;
    }
    if (!stat.isFile()) {
      res.writeHead(404).end("Not found");
      return;
    }
    res.writeHead(200, {
      "content-type": MIME[path.extname(target).toLowerCase()] || "application/octet-stream",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff"
    });
    createReadStream(target).pipe(res);
  });
}

async function prepare(page) {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.route("**/*", async route => {
    const url = route.request().url();
    if (/\.(css|js|mjs)\?v=/.test(url)) {
      const token = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      return route.continue({ url: url.replace(/v=[0-9a-zA-Z]+/, `v=${token}`) });
    }
    return route.continue();
  });
  await page.goto(BASE_URL, { waitUntil: "load", timeout: 90000 });
  await page.waitForSelector(".acct-gate, .rail-item", { timeout: 90000 });

  const seeded = await page.evaluate((items) => {
    const A = window.LBT_accounts;
    if (!A?.list || !A?.create || !A?.switch) return { ok: false, reason: "account API unavailable" };
    let accounts = A.list()?.accounts || [];
    if (accounts.length < items.length) {
      for (let i = accounts.length; i < items.length; i++) {
        const [name, purpose] = items[i];
        const created = A.create(name, purpose);
        if (!created?.id) return { ok: false, reason: "account creation failed at " + i };
      }
    }
    accounts = A.list()?.accounts || [];
    const selected = accounts[0];
    if (!selected || !A.switch(selected.id)) return { ok: false, reason: "could not select first account" };
    return { ok: true, count: accounts.length, activeId: selected.id };
  }, fixtures);
  if (!seeded.ok) throw new Error("Fixture setup failed: " + seeded.reason);

  await page.reload({ waitUntil: "load", timeout: 90000 });
  await page.waitForTimeout(350);
  const gate = page.locator(".acct-gate").first();
  if (await gate.isVisible().catch(() => false)) {
    const first = gate.locator(".acct-card-hit").first();
    await first.waitFor({ state: "visible", timeout: 12000 });
    if ((page.viewportSize()?.width || 1440) <= 640) await first.tap();
    else await first.click();
  }
  await page.waitForFunction(() => {
    const desktop = document.querySelector(".rail-item[title='ホーム']");
    const mobile = document.querySelector(".btype-mobile-bottom-nav");
    const visible = element => {
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    };
    return visible(desktop) || visible(mobile);
  }, null, { timeout: 30000 });
  await page.evaluate(() => window.dispatchEvent(new Event("lbt:open-accounts")));
  await page.locator(".acct-panel").waitFor({ state: "visible", timeout: 12000 });
  await page.waitForTimeout(250);
  const metrics = await page.evaluate(() => {
    const panel = document.querySelector(".acct-panel");
    const layout = panel?.querySelector(".acct-panel-layout");
    const accounts = panel?.querySelector(".acct-panel-accounts");
    const grid = accounts?.querySelector(".acct-grid--manager");
    const cloud = panel?.querySelector(".acct-panel-cloud");
    const disclosure = cloud?.querySelector(".lbt-cloud-panel");
    const rect = el => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
    };
    return {
      viewport: { width: innerWidth, height: innerHeight },
      accountCount: grid?.querySelectorAll(".acct-card:not(.acct-card--add)").length || 0,
      panel: rect(panel),
      layout: rect(layout),
      list: rect(accounts),
      grid: rect(grid),
      gridScrollHeight: grid?.scrollHeight || 0,
      cloud: rect(cloud),
      recoveryOpen: !!disclosure?.open,
      cloudSummary: rect(disclosure?.querySelector("summary")),
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 2
    };
  });
  if (metrics.accountCount < fixtures.length) throw new Error("Not all account cards are visible in the manager DOM: " + JSON.stringify(metrics));
  if (metrics.horizontalOverflow) throw new Error("Unexpected horizontal overflow: " + JSON.stringify(metrics));
  if (!metrics.panel || metrics.panel.x < -1 || metrics.panel.x + metrics.panel.width > metrics.viewport.width + 1) {
    throw new Error("Account dialog is outside viewport: " + JSON.stringify(metrics));
  }
  if (!metrics.recoveryOpen) {
    const gap = metrics.cloud ? metrics.cloud.height : 0;
    if (gap > (metrics.viewport.width <= 640 ? 120 : 100)) {
      throw new Error("Collapsed recovery disclosure reserves too much space: " + JSON.stringify(metrics));
    }
  }
  return { seeded, metrics, errors };
}

async function capture(browser, name, width, height) {
  const isMobile = width <= 640;
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 1,
    isMobile,
    hasTouch: isMobile,
    serviceWorkers: "block",
    colorScheme: "dark",
    reducedMotion: "reduce"
  });
  try {
    const page = await context.newPage();
    const { seeded, metrics, errors } = await prepare(page);
    await page.screenshot({
      path: path.join(OUT, `account-manager-${name}.png`),
      fullPage: false,
      animations: "disabled"
    });
    return { name, seeded, metrics, errors };
  } finally {
    await context.close();
  }
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const server = startServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(PORT, HOST, resolve);
  });
  const browser = await chromium.launch({ headless: true });
  try {
    const results = [];
    results.push(await capture(browser, "1440", 1440, 1000));
    results.push(await capture(browser, "390", 390, 844));
    await writeFile(path.join(OUT, "manifest.json"), JSON.stringify({
      generatedAt: new Date().toISOString(),
      design: "v71 unified visual system",
      viewports: results
    }, null, 2) + "\n", "utf8");
    for (const result of results) {
      console.log(JSON.stringify({ name: result.name, metrics: result.metrics, pageErrors: result.errors.length }));
      if (result.errors.length) throw new Error("Browser reported errors: " + result.errors.join(" | "));
    }
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => {
  console.error("[account-layout-capture] " + (error?.stack || String(error)));
  process.exitCode = 1;
});
