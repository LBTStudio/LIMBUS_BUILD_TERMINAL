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
  page.on("response", response => {
    const url = new URL(response.url());
    const ignorable = ["/favicon.ico", "/robots.txt", "/cdn-cgi/rum"].includes(url.pathname);
    if (response.status() >= 400 && !ignorable) {
      errors.push("http " + response.status() + ": " + url.pathname);
    }
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

async function openAccountManager(page) {
  if (await page.locator(".acct-panel").isVisible().catch(() => false)) return;
  await page.evaluate(() => window.dispatchEvent(new Event("lbt:open-accounts")));
  await page.locator(".acct-panel").waitFor({ state: "visible", timeout: 12000 });
  await page.locator(".acct-panel-accounts > .acct-grid--manager").waitFor({ state: "visible", timeout: 8000 });
}

async function verifyAccountHitTargetsAfterFormReturn(page, viewportName) {
  const gridSelector = ".acct-panel-accounts > .acct-grid--manager";
  const findInactive = () => page.locator(`${gridSelector} > .acct-card[data-account-id]:not(.is-active)`).first();
  const switchAfterReturn = async (cardId, phase) => {
    const card = page.locator(`.acct-panel-accounts > .acct-grid--manager > .acct-card[data-account-id="${cardId}"]`);
    const hit = card.locator(".acct-card-hit");
    const hitTest = await page.evaluate((id) => {
      const node = document.querySelector(`.acct-panel-accounts > .acct-grid--manager > .acct-card[data-account-id="${id}"] .acct-card-hit`);
      if (!node) return { ok: false, reason: "hit target missing" };
      const r = node.getBoundingClientRect();
      const x = Math.max(1, Math.min(innerWidth - 1, r.left + r.width / 2));
      const y = Math.max(1, Math.min(innerHeight - 1, r.top + r.height / 2));
      const top = document.elementFromPoint(x, y);
      return {
        ok: getComputedStyle(node).pointerEvents !== "none" && (top === node || node.contains(top)),
        pointerEvents: getComputedStyle(node).pointerEvents,
        topElement: top?.className?.baseVal || top?.className || top?.tagName || null,
        x, y, width: r.width, height: r.height
      };
    }, cardId);
    if (!hitTest.ok) throw new Error(`${viewportName}: ${phase} returned card has a blocked hit target: ${JSON.stringify(hitTest)}`);

    const navigation = page.waitForNavigation({ waitUntil: "load", timeout: 20000 });
    await hit.click();
    await page.waitForFunction((id) => {
      const card = document.querySelector(`.acct-panel-accounts > .acct-grid--manager > .acct-card[data-account-id="${id}"]`);
      return card?.classList.contains("is-selecting") === true;
    }, cardId, { timeout: 1000 });
    const pressed = await card.evaluate((node) => ({
      selecting: node.classList.contains("is-selecting"),
      transform: getComputedStyle(node).transform,
      borderColor: getComputedStyle(node).borderColor
    }));
    if (!pressed.selecting || pressed.transform === "none") {
      throw new Error(`${viewportName}: ${phase} produced no visible press feedback: ${JSON.stringify(pressed)}`);
    }
    await navigation;
    const activeId = await page.evaluate(() => window.LBT_accounts?.list?.()?.activeId || null);
    if (activeId !== cardId) throw new Error(`${viewportName}: ${phase} click did not switch account (expected ${cardId}, received ${activeId})`);
    await openAccountManager(page);
    return { cardId, hitTest, pressed, activeId };
  };

  const cancelCard = await findInactive();
  const cancelId = await cancelCard.getAttribute("data-account-id");
  if (!cancelId) throw new Error(`${viewportName}: account card has no stable id`);
  await cancelCard.locator(".acct-edit-btn").click();
  await page.locator(`${gridSelector}.is-editing`).waitFor({ state: "visible", timeout: 5000 });
  const editVisible = await page.locator(`.acct-card[data-account-id="${cancelId}"] .acct-card--editing, .acct-card[data-account-id="${cancelId}"].acct-card--form`).count();
  if (!editVisible) throw new Error(`${viewportName}: edit form did not open for ${cancelId}`);
  await page.locator(`.acct-card[data-account-id="${cancelId}"] .acct-form-actions`)
    .getByRole("button", { name: "キャンセル", exact: true }).click();
  await page.waitForFunction((id) => {
    const grid = document.querySelector(".acct-panel-accounts > .acct-grid--manager");
    const card = grid?.querySelector(`.acct-card[data-account-id="${id}"]`);
    return !grid?.classList.contains("is-editing") && !!card?.querySelector(".acct-card-hit") &&
      !!card?.querySelector(".acct-edit-btn") && document.activeElement === card.querySelector(".acct-edit-btn");
  }, cancelId, { timeout: 5000 });
  const afterCancel = await switchAfterReturn(cancelId, "Cancel");

  // Repeat the recovery with Save: the updated card must regain both its edit
  // control and its full-card hit target after the form node changes shape.
  const saveCard = await findInactive();
  const saveId = await saveCard.getAttribute("data-account-id");
  const previousName = (await saveCard.locator(".acct-name").textContent())?.trim();
  await saveCard.locator(".acct-edit-btn").click();
  await page.locator(`.acct-card[data-account-id="${saveId}"] .acct-field input`).first().fill(previousName + " 確認");
  await page.locator(`.acct-card[data-account-id="${saveId}"] .acct-form-actions`)
    .getByRole("button", { name: "保存", exact: true }).click();
  await page.waitForFunction(([id, expected]) => {
    const grid = document.querySelector(".acct-panel-accounts > .acct-grid--manager");
    const card = grid?.querySelector(`.acct-card[data-account-id="${id}"]`);
    return !grid?.classList.contains("is-editing") && card?.querySelector(".acct-name")?.textContent?.trim() === expected &&
      !!card?.querySelector(".acct-card-hit") && !!card?.querySelector(".acct-edit-btn") &&
      document.activeElement === card.querySelector(".acct-edit-btn");
  }, [saveId, previousName + " 確認"], { timeout: 5000 });
  const afterSave = await switchAfterReturn(saveId, "Save");

  // Cover the first-run gate route too: Edit opens the manager with an initial
  // edit target; Cancel returns to the manager; closing it must restore focus
  // to the gate's Edit button; the gate card remains a working hit target.
  const closeManager = page.locator(".acct-panel .acct-close").first();
  await closeManager.click();
  await page.locator(".acct-panel").waitFor({ state: "hidden", timeout: 8000 });
  const gateReload = page.waitForNavigation({ waitUntil: "load", timeout: 20000 });
  await page.evaluate(() => {
    localStorage.removeItem("lbt_account_active");
    location.reload();
  });
  await gateReload;
  const gate = page.locator(".acct-gate").first();
  await gate.waitFor({ state: "visible", timeout: 12000 });
  const gateCard = page.locator(".acct-gate-panel .acct-card--gate[data-account-id]").first();
  const gateId = await gateCard.getAttribute("data-account-id");
  if (!gateId) throw new Error(`${viewportName}: gate card has no stable account id`);
  const gateEdit = gateCard.locator(".acct-gate-edit-btn");
  await gateEdit.click();
  await page.locator(".acct-panel").waitFor({ state: "visible", timeout: 8000 });
  await page.waitForFunction((id) => {
    const form = document.querySelector(`.acct-panel .acct-card[data-account-id="${id}"].acct-card--form`);
    return !!form?.querySelector(".acct-form-actions");
  }, gateId, { timeout: 5000 });
  await page.locator(`.acct-panel .acct-card[data-account-id="${gateId}"] .acct-form-actions`)
    .getByRole("button", { name: "キャンセル", exact: true }).click();
  await page.waitForFunction((id) => {
    const card = document.querySelector(`.acct-panel .acct-card[data-account-id="${id}"]`);
    return !!card?.querySelector(".acct-edit-btn") && !!card?.querySelector(".acct-card-hit");
  }, gateId, { timeout: 5000 });
  await page.locator(".acct-panel .acct-close").first().click();
  await page.locator(".acct-panel").waitFor({ state: "hidden", timeout: 8000 });
  await page.waitForFunction((id) => {
    const trigger = document.querySelector(`.acct-gate-panel .acct-card--gate[data-account-id="${id}"] .acct-gate-edit-btn`);
    return !!trigger && document.activeElement === trigger;
  }, gateId, { timeout: 5000 });
  const gateHit = gateCard.locator(".acct-card-hit");
  const gateHitTest = await page.evaluate((id) => {
    const node = document.querySelector(`.acct-gate-panel .acct-card--gate[data-account-id="${id}"] .acct-card-hit`);
    if (!node) return { ok: false, reason: "gate hit target missing" };
    const r = node.getBoundingClientRect();
    const x = Math.max(1, Math.min(innerWidth - 1, r.left + r.width / 2));
    const y = Math.max(1, Math.min(innerHeight - 1, r.top + r.height / 2));
    const top = document.elementFromPoint(x, y);
    return { ok: getComputedStyle(node).pointerEvents !== "none" && (top === node || node.contains(top)), topElement: top?.className || top?.tagName, x, y };
  }, gateId);
  if (!gateHitTest.ok) throw new Error(`${viewportName}: gate card hit target is blocked after Edit/Cancel: ${JSON.stringify(gateHitTest)}`);
  await gateHit.click();
  await page.waitForFunction((id) => {
    const activeId = window.LBT_accounts?.list?.()?.activeId;
    const gateNode = document.querySelector(".acct-gate");
    return activeId === id && (!gateNode || getComputedStyle(gateNode).display === "none");
  }, gateId, { timeout: 8000 });
  await openAccountManager(page);
  return { afterCancel, afterSave, gateAfterEditCancel: { gateId, gateHitTest, activeId: gateId } };
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
    reducedMotion: "no-preference"
  });
  try {
    const page = await context.newPage();
    const { seeded, metrics, errors } = await prepare(page);
    const lifecycle = await verifyAccountHitTargetsAfterFormReturn(page, name);
    await page.screenshot({
      path: path.join(OUT, `account-manager-${name}.png`),
      fullPage: false,
      animations: "disabled"
    });

    // The core requirement is not only that the account list is visible when
    // recovery is collapsed, but that it keeps an independent pane while the
    // recovery-key controls are expanded.
    await page.locator(".acct-panel-cloud .lbt-cloud-summary").click();
    await page.locator(".acct-panel-cloud .lbt-cloud-panel[open]").waitFor({ state: "visible", timeout: 5000 });
    const recoveryInput = page.locator("#lbt-cloud-recovery-key");
    await recoveryInput.scrollIntoViewIfNeeded({ timeout: 5000 });
    await page.waitForTimeout(80);
    const expanded = await page.evaluate(() => {
      const panel = document.querySelector(".acct-panel");
      const layout = panel?.querySelector(".acct-panel-layout");
      const accounts = panel?.querySelector(".acct-panel-accounts");
      const grid = accounts?.querySelector(".acct-grid--manager");
      const cloud = panel?.querySelector(".acct-panel-cloud");
      const disclosure = cloud?.querySelector(".lbt-cloud-panel");
      const input = cloud?.querySelector("#lbt-cloud-recovery-key");
      const rect = el => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
      };
      const listRect = rect(accounts);
      const cloudRect = rect(cloud);
      const inputRect = rect(input);
      const mobile = innerWidth <= 760;
      const panesSeparated = !!listRect && !!cloudRect && (mobile
        ? cloudRect.y >= listRect.bottom - 1
        : cloudRect.x >= listRect.right - 1);
      const keyVisible = !!inputRect && !!cloudRect &&
        inputRect.y >= cloudRect.y - 1 && inputRect.bottom <= cloudRect.bottom + 1 &&
        inputRect.width > 0 && inputRect.height > 0;
      return {
        viewport: { width: innerWidth, height: innerHeight },
        accountCount: grid?.querySelectorAll(".acct-card:not(.acct-card--add)").length || 0,
        panel: rect(panel),
        layout: rect(layout),
        list: listRect,
        grid: rect(grid),
        gridClientHeight: grid?.clientHeight || 0,
        gridScrollHeight: grid?.scrollHeight || 0,
        cloud: cloudRect,
        cloudClientHeight: cloud?.clientHeight || 0,
        cloudScrollHeight: cloud?.scrollHeight || 0,
        recoveryOpen: !!disclosure?.open,
        recoveryInput: inputRect,
        keyVisible,
        panesSeparated,
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 2
      };
    });
    if (!expanded.recoveryOpen) throw new Error("Recovery disclosure did not open: " + JSON.stringify(expanded));
    if (expanded.accountCount < fixtures.length) throw new Error("Expanded recovery hid account cards from the manager DOM: " + JSON.stringify(expanded));
    if (!expanded.list || expanded.list.height < 140 || expanded.list.width <= 0) {
      throw new Error("Account list pane collapsed while recovery was open: " + JSON.stringify(expanded));
    }
    if (!expanded.panesSeparated) throw new Error("Account and recovery panes overlap: " + JSON.stringify(expanded));
    if (!expanded.keyVisible) throw new Error("Recovery-key input cannot be reached inside its pane: " + JSON.stringify(expanded));
    if (expanded.gridScrollHeight <= expanded.gridClientHeight) {
      throw new Error("Account list is not independently scrollable with recovery open: " + JSON.stringify(expanded));
    }
    if (expanded.horizontalOverflow) throw new Error("Expanded recovery causes horizontal overflow: " + JSON.stringify(expanded));
    if (!expanded.panel || expanded.panel.x < -1 || expanded.panel.right > expanded.viewport.width + 1 ||
        expanded.panel.y < -1 || expanded.panel.bottom > expanded.viewport.height + 1) {
      throw new Error("Expanded account dialog is outside viewport: " + JSON.stringify(expanded));
    }
    await page.screenshot({
      path: path.join(OUT, `account-manager-${name}-recovery-open.png`),
      fullPage: false,
      animations: "disabled"
    });
    return { name, seeded, metrics, lifecycle, expanded, errors };
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
      console.log(JSON.stringify({ name: result.name, metrics: result.metrics, lifecycle: result.lifecycle, expanded: result.expanded, pageErrors: result.errors.length }));
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
