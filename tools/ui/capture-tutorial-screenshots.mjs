#!/usr/bin/env node
/*
 * Capture real LIMBUS BUILD TERMINAL screens and annotate the actual target controls.
 *
 * Usage:
 *   npm install --no-save playwright@1.64.0
 *   npx playwright install chromium
 *   node tools/ui/capture-tutorial-screenshots.mjs
 *
 * Outputs: artifacts/tutorial-screenshots/*.png
 * This script uses a fresh browser context (no personal localStorage data), starts a
 * temporary local HTTP server, and labels actual element coordinates from Playwright.
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.resolve(ROOT, process.env.TUTORIAL_SCREENSHOT_DIR || "artifacts/tutorial-screenshots");
const HOST = "127.0.0.1";
const PORT = Number(process.env.TUTORIAL_SCREENSHOT_PORT || 4173);
const WAIT_MS = 180;
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8"
};

function log(message) {
  console.log("[tutorial-capture] " + message);
}

function serveStatic() {
  return http.createServer((request, response) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url || "/", "http://" + HOST).pathname);
    } catch {
      response.writeHead(400).end("Bad request");
      return;
    }
    if (pathname === "/") pathname = "/index.html";
    const filename = path.resolve(ROOT, "." + pathname);
    if (filename !== ROOT && !filename.startsWith(ROOT + path.sep)) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    fs.stat(filename, (statError, stat) => {
      if (statError || !stat.isFile()) {
        response.writeHead(404).end("Not found");
        return;
      }
      response.writeHead(200, {
        "content-type": MIME[path.extname(filename).toLowerCase()] || "application/octet-stream",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff"
      });
      fs.createReadStream(filename).pipe(response);
    });
  });
}

async function waitForApp(page) {
  await page.goto("http://" + HOST + ":" + PORT + "/", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle", { timeout: 12000 }).catch(() => {});
  // A fresh browser context has no app data. Create a disposable account only when
  // the app's first-run account gate requires one.
  if (await page.locator(".acct-gate").count()) {
    const addButton = page.locator(".acct-card--add").filter({ hasText: "新しいキャラクター" });
    if (await addButton.count()) {
      await addButton.first().click();
      await page.locator(".acct-gate input[placeholder='キャラクター名など']").fill("操作ガイド撮影用");
      await page.getByRole("button", { name: "作成して開く", exact: true }).click();
    }
  }
  await page.locator("button[title='ビルド']").waitFor({ state: "visible", timeout: 30000 });
  await page.waitForTimeout(WAIT_MS);
}

async function clickNav(page, title) {
  const navButton = page.locator("button[title='" + title + "']").first();
  await navButton.waitFor({ state: "visible", timeout: 12000 });
  await navButton.click();
  await page.waitForTimeout(WAIT_MS);
}

async function annotateAndSave(page, selector, fileBase, headline, detail) {
  const locator = typeof selector === "string" ? page.locator(selector).first() : selector;
  await locator.waitFor({ state: "visible", timeout: 12000 });
  await locator.scrollIntoViewIfNeeded();
  await page.waitForTimeout(80);
  const box = await locator.boundingBox();
  if (!box || box.width < 1 || box.height < 1) throw new Error("Target is not on-screen: " + fileBase);
  await page.evaluate(({ target, title, note }) => {
    const old = document.getElementById("lbt-guide-capture-overlay");
    if (old) old.remove();
    const width = window.innerWidth;
    const height = window.innerHeight;
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("id", "lbt-guide-capture-overlay");
    svg.setAttribute("viewBox", "0 0 " + width + " " + height);
    svg.setAttribute("width", String(width));
    svg.setAttribute("height", String(height));
    svg.setAttribute("aria-hidden", "true");
    svg.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;z-index:2147483647;pointer-events:none;overflow:visible";
    const add = (tag, attrs, text) => {
      const el = document.createElementNS(ns, tag);
      for (const [key, value] of Object.entries(attrs || {})) el.setAttribute(key, String(value));
      if (text !== undefined) el.textContent = text;
      svg.appendChild(el);
      return el;
    };
    const defs = document.createElementNS(ns, "defs");
    const marker = document.createElementNS(ns, "marker");
    marker.setAttribute("id", "lbt-guide-arrow-head");
    marker.setAttribute("markerWidth", "10");
    marker.setAttribute("markerHeight", "10");
    marker.setAttribute("refX", "8");
    marker.setAttribute("refY", "4");
    marker.setAttribute("orient", "auto");
    marker.setAttribute("markerUnits", "strokeWidth");
    const arrowHead = document.createElementNS(ns, "path");
    arrowHead.setAttribute("d", "M0,0 L8,4 L0,8 Z");
    arrowHead.setAttribute("fill", "#ffb84d");
    marker.appendChild(arrowHead);
    defs.appendChild(marker);
    svg.appendChild(defs);

    const pad = 12;
    const callW = Math.min(320, width - pad * 2);
    const callH = note ? 58 : 42;
    const centerX = target.x + target.width / 2;
    const centerY = target.y + target.height / 2;
    let callX = centerX < width / 2 ? centerX + 22 : centerX - callW - 22;
    callX = Math.max(pad, Math.min(width - callW - pad, callX));
    let callY = target.y - callH - 22;
    if (callY < 58) callY = target.y + target.height + 24;
    callY = Math.max(56, Math.min(height - callH - pad, callY));

    // A subdued tint keeps the real screenshot legible while making the real control obvious.
    add("rect", {
      x: target.x - 4, y: target.y - 4,
      width: target.width + 8, height: target.height + 8,
      rx: 7, fill: "#ffb84d", "fill-opacity": 0.10,
      stroke: "#ffb84d", "stroke-width": 3
    });
    const startX = Math.max(callX + 12, Math.min(callX + callW - 12, centerX));
    const startY = centerY > callY + callH ? callY + callH : callY;
    const elbowY = startY + (centerY - startY) * 0.45;
    add("path", {
      d: "M " + startX + " " + startY + " Q " + startX + " " + elbowY + " " + centerX + " " + centerY,
      fill: "none", stroke: "#17130c", "stroke-width": 7, "stroke-linecap": "round"
    });
    add("path", {
      d: "M " + startX + " " + startY + " Q " + startX + " " + elbowY + " " + centerX + " " + centerY,
      fill: "none", stroke: "#ffb84d", "stroke-width": 3.5, "stroke-linecap": "round",
      "marker-end": "url(#lbt-guide-arrow-head)"
    });
    add("rect", {
      x: callX, y: callY, width: callW, height: callH, rx: 8,
      fill: "#17130c", stroke: "#ffb84d", "stroke-width": 2
    });
    add("text", {
      x: callX + 12, y: callY + (note ? 23 : 27),
      fill: "#ffe0a2", "font-size": width < 500 ? 12 : 17,
      "font-family": "'Noto Sans JP', 'Yu Gothic', sans-serif", "font-weight": 800
    }, title);
    if (note) {
      add("text", {
        x: callX + 12, y: callY + 43,
        fill: "#f5eee0", "font-size": width < 500 ? 10 : 13,
        "font-family": "'Noto Sans JP', 'Yu Gothic', sans-serif"
      }, note);
    }
    const badgeX = Math.max(18, Math.min(width - 18, target.x + target.width - 2));
    const badgeY = Math.max(68, target.y - 3);
    add("circle", { cx: badgeX, cy: badgeY, r: 14, fill: "#ffb84d", stroke: "#17130c", "stroke-width": 2 });
    add("text", {
      x: badgeX, y: badgeY + 5, "text-anchor": "middle", fill: "#1b1407",
      "font-size": 15, "font-family": "sans-serif", "font-weight": 900
    }, "→");
    document.body.appendChild(svg);
  }, { target: box, title: headline, note: detail || "" });

  const filename = path.join(OUT, fileBase + ".png");
  await page.screenshot({ path: filename, animations: "disabled", fullPage: false });
  await page.evaluate(() => document.getElementById("lbt-guide-capture-overlay")?.remove());
  log("captured " + path.relative(ROOT, filename));
  return filename;
}

async function captureViewport(browser, mode) {
  const isMobile = mode === "mobile";
  const context = await browser.newContext({
    viewport: isMobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    deviceScaleFactor: isMobile ? 2 : 1,
    isMobile,
    hasTouch: isMobile,
    serviceWorkers: "block",
    colorScheme: "dark",
    reducedMotion: "reduce"
  });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on("pageerror", error => { console.error("[pageerror] " + error.message); });
  try {
    await waitForApp(page);

    // Persona draft import: highlight the real button inside the Persona list toolbar.
    await clickNav(page, "ビルド");
    const personaTab = page.locator(".build-tabs button[role='tab']").filter({ hasText: "人格" }).first();
    if (await personaTab.count()) await personaTab.click();
    const personaTrigger = page.locator(".pw-listbar-actions .persona-draft-import-trigger").first();
    await annotateAndSave(page, personaTrigger, "persona-import-" + mode,
      "テキスト流し込み反映", "① ビルド → ② 人格 → ③ このボタン");

    // Result text import: open the real import menu, then annotate its item.
    await clickNav(page, "記録");
    const resultImportToggle = page.locator(".ledger-import-toggle").first();
    await resultImportToggle.waitFor({ state: "visible", timeout: 12000 });
    await resultImportToggle.click();
    await page.waitForTimeout(WAIT_MS);
    const resultTextButton = page.locator(".ledger-import-menu button").filter({ hasText: /^テキスト流し込み$/ }).first();
    await annotateAndSave(page, resultTextButton, "result-text-import-" + mode,
      "テキスト流し込み", "記録 → リザルトを記録 → 取り込む");

    // Owned persona roster import is a different button in that same menu.
    await resultImportToggle.click();
    await page.waitForTimeout(WAIT_MS);
    await resultImportToggle.click();
    await page.waitForTimeout(WAIT_MS);
    const rosterImportButton = page.locator(".ledger-import-menu button").filter({ hasText: /所持人格リストを取り込む/ }).first();
    await annotateAndSave(page, rosterImportButton, "roster-import-" + mode,
      "所持人格リストを取り込む", "リザルト文章の取り込みとは別機能");

    // Character-wide Garasumado URL: the entry is inside the target account's edit form.
    const accountMenu = page.locator("button[title*='切替・管理を開く']").first();
    await accountMenu.waitFor({ state: "visible", timeout: 12000 });
    await accountMenu.click();
    await page.waitForTimeout(WAIT_MS);
    const editButton = page.locator(".acct-card-actions .acct-edit-btn").first();
    await editButton.waitFor({ state: "visible", timeout: 12000 });
    await editButton.click();
    await page.waitForTimeout(WAIT_MS);
    const accountImportToggle = page.locator(".acct-import-toggle").first();
    await annotateAndSave(page, accountImportToggle, "account-share-import-" + mode,
      "共有URLから取り込む", "SINNER SELECT → 対象アカウントの編集");

    // Save/share: open the real action sheet and highlight real actions without activating them.
    await page.keyboard.press("Escape").catch(() => {});
    const utilityButton = page.locator("button.utility-trigger").filter({ hasText: "操作・保存" }).first();
    await utilityButton.waitFor({ state: "visible", timeout: 12000 });
    await utilityButton.click();
    await page.waitForTimeout(WAIT_MS);
    const workSaveButton = page.locator(".utility-sheet-action").filter({ hasText: "現在の作業状態を保存" }).first();
    await annotateAndSave(page, workSaveButton, "save-work-state-" + mode,
      "現在の作業状態を保存", "操作・保存 → ファイルへバックアップ");

    // Save again is deliberately not clicked; reopen the action sheet for the share entry.
    await page.keyboard.press("Escape").catch(() => {});
    await utilityButton.click();
    await page.waitForTimeout(WAIT_MS);
    const shareButton = page.locator(".utility-sheet-action").filter({ hasText: "共有シートを開く" }).first();
    await annotateAndSave(page, shareButton, "share-sheet-" + mode,
      "共有シートを開く", "操作・保存 → 人に見せるHTML");
  } finally {
    await context.close();
  }
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const server = serveStatic();
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(PORT, HOST, resolveListen);
  });
  const browser = await chromium.launch({ headless: true });
  try {
    for (const mode of ["desktop", "mobile"]) {
      log("capturing viewport: " + mode);
      await captureViewport(browser, mode);
    }
    const files = fs.readdirSync(OUT).filter(name => name.endsWith(".png")).sort();
    const manifest = {
      generatedAt: new Date().toISOString(),
      source: "Local LIMBUS BUILD TERMINAL UI rendered by Playwright Chromium",
      viewportModes: ["desktop 1440x1000", "mobile 390x844 deviceScaleFactor=2"],
      count: files.length,
      files
    };
    fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
    if (files.length < 10) throw new Error("Expected at least 10 screenshots, captured " + files.length);
    log("done: " + files.length + " screenshots in " + path.relative(ROOT, OUT));
  } finally {
    await browser.close();
    await new Promise(resolveClose => server.close(resolveClose));
  }
}

main().catch(error => {
  console.error("[tutorial-capture] failed: " + (error && error.stack ? error.stack : String(error)));
  process.exitCode = 1;
});
