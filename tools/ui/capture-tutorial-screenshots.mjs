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

async function captureCompactResultDetails(page, mode) {
  await page.evaluate(() => {
    const accounts = window.LBT_accounts;
    const accountId = accounts?.getActiveId?.();
    const state = accounts?.loadActive?.();
    if (!accountId || !state) throw new Error("Could not load disposable screenshot account");
    const now = Date.now();
    const resultId = "capture-result-compact";
    const personaRecord = (window.DB?.normal_personas || []).find((entry) => String(entry.no) === "1")
      || (window.DB?.normal_personas || [])[0];
    const special = (window.DB?.special_enhancements || [])[0];
    if (!personaRecord || !special?.name) throw new Error("Missing persona/special enhancement in DB");
    const personaUid = "capture-persona-compact";
    state.results = [{
      id: resultId,
      name: "第12回 セッション",
      date: "2026-10-26",
      income: { lp: 80, shards: 25, tickets: { persona: 0, ego: 0, choice: 0, pack: {} } },
      note: "",
      consumedItems: [{
        id: "capture-consumed-glass-shard", itemId: "resource-glass-shard", itemName: "硝子の破片",
        quantity: 1, reason: "consumption", consumedAt: now, operationId: "capture-consumed-glass-shard"
      }],
      createdAt: now, updatedAt: now
    }];
    state.entries = [
      { id: "capture-entry-glass-shard", kind: "item", name: "硝子の破片", cost: { lp: 20, shards: 0 }, tickets: {}, resultId, ref: { kind: "inventory", uid: "capture-item-glass-shard" }, at: now, note: "" },
      { id: "capture-entry-hp-bullet", kind: "item", name: "HP弾", cost: { lp: 20, shards: 0 }, tickets: {}, resultId, ref: { kind: "inventory", uid: "capture-item-hp-bullet" }, at: now + 1, note: "" },
      { id: "capture-entry-persona", kind: "persona", name: String(personaRecord.name || "人格") + "（強化あり）", cost: { lp: 0, shards: 10 }, tickets: {}, resultId, ref: { kind: "rosterPersona", uid: personaUid }, at: now + 2, note: "" }
    ];
    state.roster = {
      ...(state.roster || {}),
      personas: [{
        uid: personaUid, mode: "n", no: String(personaRecord.no), name: personaRecord.name, displayName: personaRecord.name,
        build: { enhancements: [{
          id: "capture-special-enhancement", group: String(special.group || ""), name: String(special.name),
          effect: String(special.effect || ""), shards: Number(special.shards) || 0, category: String(special.category || "")
        }] }
      }],
      egos: [], supports: [], spirits: Array.isArray(state.roster?.spirits) ? state.roster.spirits : []
    };
    if (!accounts.saveActive(state, accountId)) throw new Error("Could not save disposable screenshot fixture");
    /* Reload the React reducer from the saved account in-place. A page reload would let
       the current stale React state auto-save over this synthetic fixture on beforeunload. */
    window.dispatchEvent(new CustomEvent("lbt:accounts-entered", { detail: { id: accountId } }));
  });
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(WAIT_MS);
  await clickNav(page, "記録");
  const card = page.locator(".ledger-card").filter({ hasText: "第12回 セッション" }).first();
  if (!(await card.isVisible().catch(() => false))) {
    const debug = await page.evaluate(() => {
      const accounts = window.LBT_accounts;
      const state = accounts?.loadActive?.();
      return {
        activeIdPresent: Boolean(accounts?.getActiveId?.()),
        storedResultCount: Array.isArray(state?.results) ? state.results.length : null,
        storedResultNames: Array.isArray(state?.results) ? state.results.slice(-5).map((row) => String(row?.name || "")) : [],
        storedEntryCount: Array.isArray(state?.entries) ? state.entries.length : null,
        hasFixtureResult: Array.isArray(state?.results) && state.results.some((row) => row?.name === "第12回 セッション"),
        visibleLedgerCardCount: document.querySelectorAll(".ledger-card").length,
        visibleLedgerHeadingText: [...document.querySelectorAll(".ledger-results-toolbar,.ledger-empty-note,.ledger-results-count")].map((el) => el.textContent.trim()).slice(0, 8),
        visibleNavTitles: [...document.querySelectorAll("button[title]")].filter((el) => el.getBoundingClientRect().width > 0).map((el) => el.title).slice(0, 40),
        bodyExcerpt: (document.body?.innerText || "").slice(0, 1800)
      };
    });
    const debugPng = "result-details-debug-" + mode + ".png";
    await page.screenshot({ path: path.join(OUT, debugPng), animations: "disabled", fullPage: false }).catch(() => {});
    fs.writeFileSync(path.join(OUT, "result-details-debug-" + mode + ".json"), JSON.stringify(debug, null, 2) + "\n", "utf8");
    log("result detail capture diagnostic: " + JSON.stringify(debug));
  }
  await card.waitFor({ state: "visible", timeout: 12000 });
  await card.locator(".ledger-result-details > summary").first().click();
  await card.locator(".ledger-result-object-row").first().waitFor({ state: "visible", timeout: 12000 });
  const rows = await card.locator(".ledger-result-object-row").count();
  if (rows !== 3) throw new Error("Expected 3 compact result rows, got " + rows);
  await card.locator(".ledger-object-enhancement-label").filter({ hasText: "特殊強化：" }).first().waitFor({ state: "visible", timeout: 12000 });
  const rendered = await card.innerText();
  if (!rendered.includes("硝子の破片 ×1 · 消費") || rendered.includes("硝子の破片 ×1 · 現象処理")) {
    throw new Error("Incorrect consumed item label in real UI: " + rendered);
  }
  await card.scrollIntoViewIfNeeded();
  const filename = "result-details-compact-" + mode + ".png";
  const screenshot = await card.screenshot({ animations: "disabled" });
  fs.writeFileSync(path.join(OUT, filename.replace(/\.png$/, ".json")), JSON.stringify({
    filename, contentType: "image/png", base64: screenshot.toString("base64")
  }) + "\n", "utf8");
  log("captured result card visual review " + filename);
  const effectDisclosure = card.locator(".ledger-object-enhancement-details").first();
  if (await effectDisclosure.count()) {
    await effectDisclosure.locator(":scope > summary").click();
    const effectText = await effectDisclosure.locator("p").innerText();
    if (!effectText.trim()) throw new Error("Special enhancement effect did not expand");
    const expandedFilename = "result-enhancement-expanded-" + mode + ".png";
    const expanded = await card.screenshot({ animations: "disabled" });
    fs.writeFileSync(path.join(OUT, expandedFilename.replace(/\\.png$/, ".json")), JSON.stringify({
      filename: expandedFilename, contentType: "image/png", base64: expanded.toString("base64")
    }) + "\\n", "utf8");
    log("captured expanded special enhancement visual review " + expandedFilename);
  }
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
    // On narrow mobile layouts the top-bar account chip is intentionally hidden.
    // Use the same app event as the help index's "アカウント管理を開く" action.
    await page.evaluate(() => window.dispatchEvent(new Event("lbt:open-accounts")));
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

    // Review result-detail layout before switching to the help-index screen.
    await captureCompactResultDetails(page, mode);

    // Capture the help index itself for visual QA. These review-only images go to
    // the expiring CI Artifact, not into the 12 screenshots shown to end users.
    await page.keyboard.press("Escape").catch(() => {});
    await clickNav(page, "使い方");
    await page.locator("#guide-search-input").waitFor({ state: "visible", timeout: 12000 });
    await page.waitForTimeout(WAIT_MS);
    const helpIndexFilename = path.join(OUT, "help-index-" + mode + ".png");
    await page.screenshot({ path: helpIndexFilename, animations: "disabled", fullPage: false });
    log("captured visual-review screen " + path.relative(ROOT, helpIndexFilename));


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
