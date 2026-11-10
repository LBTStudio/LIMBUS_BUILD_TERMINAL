/* 検証用スクリプトの共通処理。
 *
 * 依存（playwright / axe-core / pngjs）はリポジトリに含めず、
 * .browser-deps/ にインストールする。README のセットアップを参照。
 */

import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
export const SHOT_DIR = path.join(REPO_ROOT, "tools", "ui", "shots");

/** 検証対象。ローカルなら静的サーバ、実配布物なら BASE_URL を指定する。 */
export const BASE_URL = process.env.BASE_URL || "http://localhost:8099/";

/** 現行UIの構造に合わせた実操作ビュー。左レールの画面と内部タブを分けて巡回する。 */
export const UI_VIEWS = [
  { kind: "route", route: "ホーム", label: "ホーム" },
  ...[
    ["baseinfo", "基本"], ["persona", "人格"], ["skill", "スキル"],
    ["passive", "パッシブ"], ["enh", "強化"], ["support", "サポート"],
    ["ego", "E.G.O"], ["spirit", "精神"], ["items-build", "アイテム"]
  ].map(([id, label]) => ({ kind: "build-tab", id, label: "ビルド / " + label })),
  { kind: "shop-hub", label: "ショップ / カテゴリ" },
  ...[
    ["persona", "人格"], ["support", "サポート"], ["ego", "E.G.O"],
    ["spirit", "精神"], ["item", "アイテム"], ["gacha", "ガチャ"]
  ].map(([id, label]) => ({ kind: "shop-category", id, label: "ショップ / " + label })),
  { kind: "record-hub", label: "記録・所持品 / 入口" },
  ...[
    ["ledger", "リザルト"], ["personas", "所持人格"], ["egos", "所持E.G.O"],
    ["supports", "所持サポパ"], ["spirits", "所持精神"], ["inventory", "所持アイテム"]
  ].map(([id, label]) => ({ kind: "record-tab", id, label: "記録・所持品 / " + label })),
  { kind: "route", route: "詳細設定", label: "詳細設定" },
  { kind: "route", route: "使い方", label: "使い方" }
];
export const SECTIONS = UI_VIEWS.map((view) => view.label);

export const VIEWPORTS = [
  { name: "desktop 1440", w: 1440, h: 900 },
  { name: "laptop 1280", w: 1280, h: 800 },
  { name: "small 1024", w: 1024, h: 768 },
  { name: "tablet 768", w: 768, h: 1024 },
  { name: "mobile 375", w: 375, h: 812 },
  { name: "mobile 320", w: 320, h: 640 },
  /* 1280 の 200% ズームに相当する CSS ピクセル幅 */
  { name: "200% zoom 720", w: 720, h: 450 },
];

/**
 * .browser-deps から依存を解決する。setup 済みでなければ具体的に指示を出す。
 */
export function requireDep(name) {
  const local = path.join(REPO_ROOT, ".browser-deps", "node_modules", name, "package.json");
  if (!existsSync(local)) {
    console.error(
      `\n${name} が見つかりません。README のセットアップを実行してください:\n` +
      `  npm install --prefix .browser-deps playwright axe-core pngjs\n` +
      `  npx --prefix .browser-deps playwright install chromium\n`
    );
    process.exit(1);
  }
  return createRequire(local)("../" + name);
}

export function loadPlaywright() {
  return requireDep("playwright");
}

export function ensureShotDir() {
  mkdirSync(SHOT_DIR, { recursive: true });
  return SHOT_DIR;
}

/* shots/ は git 無視で、import するスクリプトは
   `path: "tools/ui/shots/x.png"` と直接書くため、親が無いと
   page.screenshot が ENOENT で落ちる。mkdir は冪等なので import 時に一度。 */
ensureShotDir();

/**
 * ページを開いて app の準備完了まで待つ。
 * CSS には skip-link や rail-item があるので、.rail-item を合図に使う。
 */
export async function openApp(browser, { url = BASE_URL, width = 1440, height = 900, reducedMotion, bypassCache = false } = {}) {
  const context = await browser.newContext({
    viewport: { width, height },
    ...(width <= 640 ? { hasTouch: true } : {}),
    ...(reducedMotion ? { reducedMotion } : {}),
  });
  const page = await context.newPage();

  /* index.html の ?v= は変更ファイルにだけ bump されるので、
     同じ値のままでは実ファイルが新しくてもブラウザは古い応答を返す。
     検証時は ?v= を書き換えて必ず最新を読み込ませる。 */
  if (bypassCache) {
    await page.route("**/*", async (route) => {
      const url = route.request().url();
      if (/\.(css|js|mjs)\?v=/.test(url)) {
        return route.continue({ url: url.replace(/v=[0-9a-zA-Z]+/, `v=${Date.now()}${Math.floor(performance.now())}`) });
      }
      return route.continue();
    });
  }

  /* Cloudflare Web Analytics は公開環境の /cdn-cgi/rum に送信する。
     ローカルの静的サーバにはそのエンドポイントが無いため、ローカル監査時だけ
     204 で受け、実アプリのHTTPエラーと区別する。公開URLでは決して隠さない。 */
  const auditHost = new URL(url).hostname;
  if (auditHost === "localhost" || auditHost === "127.0.0.1") {
    await page.route("**/cdn-cgi/rum**", (route) => route.fulfill({
      status: 204,
      headers: { "cache-control": "no-store" },
      body: ""
    }));
  }

  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 160)); });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message.slice(0, 160)));
  page.on("response", (response) => {
    if (response.status() >= 400) {
      errors.push("http " + response.status() + ": " + response.url().slice(0, 200));
    }
  });
  await page.goto(url, { waitUntil: "load", timeout: 90000 });
  await page.waitForSelector(".acct-gate, .rail-item", { timeout: 90000 });
  await enterAuditWorkspace(page);
  await page.waitForTimeout(900);
  return { context, page, errors };
}

async function activateAuditTarget(page, locator, options = {}) {
  const width = page.viewportSize()?.width || 1440;
  if (width <= 640) return locator.tap({ timeout: options.timeout || 5000 });
  return locator.click({ timeout: options.timeout || 5000 });
}

export async function enterAuditWorkspace(page, accountName = "UI監査用キャラクター") {
  const gate = page.locator(".acct-gate").first();
  if (await gate.isVisible().catch(() => false)) {
    const add = page.locator(".acct-card--add").first();
    if (await add.isVisible().catch(() => false)) {
      await activateAuditTarget(page, add);
      const name = page.locator(".acct-gate input[placeholder='キャラクター名']").first();
      await name.waitFor({ state: "visible", timeout: 5000 });
      await name.fill(accountName);
      const create = page.getByRole("button", { name: "作成して開く", exact: true });
      await create.waitFor({ state: "visible", timeout: 5000 });
      await activateAuditTarget(page, create);
    } else {
      const account = page.locator(".acct-card-hit").first();
      if (!(await account.isVisible().catch(() => false))) {
        throw new Error("SINNER SELECTに監査用アカウントの作成・選択操作がありません");
      }
      await activateAuditTarget(page, account);
    }
  }
  // The desktop rail is intentionally hidden on phone-width layouts. The
  // audit runner must wait for whichever navigation model is actually visible,
  // not for a desktop-only selector that can never become visible on mobile.
  await page.waitForFunction(() => {
    const visible = (element) => {
      if (!element) return false;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== "none"
        && style.visibility !== "hidden"
        && Number(style.opacity) >= 0.03
        && rect.width > 0
        && rect.height > 0;
    };
    return visible(document.querySelector(".rail-item[title='ホーム']"))
      || visible(document.querySelector(".btype-mobile-bottom-nav"));
  }, null, { timeout: 30000 });
  return true;
}

/**
 * 現行UIの26ビューを実操作で巡回する。メイン画面だけでなく、ビルド・ショップ・記録の内部タブも含む。
 */
async function closeAuditOverlays(page) {
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(120);
  for (const selector of [
    ".import-router-close", ".utility-sheet-close",
    ".disclaimer-sheet .utility-sheet-close", ".detail-dialog-close", ".ego-quick-close"
  ]) {
    const button = page.locator(selector).first();
    if (await button.isVisible().catch(() => false)) {
      await activateAuditTarget(page, button, { timeout: 2500 }).catch(() => {});
      await page.waitForTimeout(120);
    }
  }
}

async function clickMainRoute(page, title) {
  await closeAuditOverlays(page);
  const width = page.viewportSize()?.width || 1440;
  if (width <= 640) {
    const nav = page.locator(".btype-mobile-bottom-nav");
    const directLabels = {
      "ビルド": "ビルド",
      "記録・所持品": "記録",
      "記録": "記録",
      "データ取り込み": "取込"
    };
    if (directLabels[title]) {
      const direct = nav.getByRole("button", { name: directLabels[title], exact: true });
      await direct.waitFor({ state: "visible", timeout: 8000 });
      await activateAuditTarget(page, direct);
    } else {
      const utility = nav.getByRole("button", { name: "その他", exact: true });
      await utility.waitFor({ state: "visible", timeout: 8000 });
      await activateAuditTarget(page, utility);
      const target = page.locator(".utility-section-grid")
        .getByRole("button", { name: title, exact: true });
      await target.waitFor({ state: "visible", timeout: 8000 });
      await activateAuditTarget(page, target);
    }
  } else {
    const route = page.locator(".rail-item[title=" + JSON.stringify(title) + "]").first();
    await route.waitFor({ state: "visible", timeout: 10000 });
    await activateAuditTarget(page, route);
  }
  await page.waitForTimeout(300);
}
async function openShopHub(page) {
  await clickMainRoute(page, "ショップ");
  const hub = page.locator(".btype-shop-category-grid").first();
  if (!(await hub.isVisible().catch(() => false))) {
    const back = page.locator(".btype-shop-catalog .btype-back-link").first();
    await back.waitFor({ state: "visible", timeout: 8000 });
    await activateAuditTarget(page, back);
    await hub.waitFor({ state: "visible", timeout: 8000 });
  }
}

async function openRecordHub(page) {
  await clickMainRoute(page, "記録・所持品");
  const hub = page.locator(".btype-record-card-grid").first();
  if (!(await hub.isVisible().catch(() => false))) {
    const back = page.locator(".btype-record-detail .btype-back-link").first();
    await back.waitFor({ state: "visible", timeout: 8000 });
    await back.click({ timeout: 5000 });
    await hub.waitFor({ state: "visible", timeout: 8000 });
  }
}

export async function walkSections(page, { onSection } = {}) {
  const counts = [];
  for (let i = 0; i < UI_VIEWS.length; i++) {
    const view = UI_VIEWS[i];
    await closeAuditOverlays(page);
    if (view.kind === "route") {
      await clickMainRoute(page, view.route);
    } else if (view.kind === "build-tab") {
      await clickMainRoute(page, "ビルド");
      const tab = page.getByRole("tablist", { name: "ビルドセクション" })
        .getByRole("tab", { name: view.label.replace("ビルド / ", ""), exact: true });
      await tab.waitFor({ state: "visible", timeout: 8000 });
      await activateAuditTarget(page, tab);
      await page.waitForTimeout(350);
    } else if (view.kind === "shop-hub") {
      await openShopHub(page);
    } else if (view.kind === "shop-category") {
      await openShopHub(page);
      const category = page.locator(".btype-shop-category-card[data-category=" + JSON.stringify(view.id) + "]").first();
      await category.waitFor({ state: "visible", timeout: 8000 });
      await activateAuditTarget(page, category);
      await page.locator(".btype-shop-catalog").waitFor({ state: "visible", timeout: 8000 });
      await page.waitForTimeout(350);
    } else if (view.kind === "record-hub") {
      await openRecordHub(page);
    } else if (view.kind === "record-tab") {
      await openRecordHub(page);
      const library = page.locator(".btype-record-task-card").filter({ hasText: "所持ライブラリ" }).first();
      await library.waitFor({ state: "visible", timeout: 8000 });
      await activateAuditTarget(page, library);
      const tabName = view.id === "personas" ? "人格"
        : view.id === "egos" ? "E.G.O"
        : view.id === "supports" ? "サポパ"
        : view.id === "spirits" ? "精神"
        : view.id === "inventory" ? "アイテム" : "リザルト";
      const tab = page.getByRole("tablist", { name: "記録セクションの種別" })
        .getByRole("tab", { name: tabName, exact: true });
      await tab.waitFor({ state: "visible", timeout: 8000 });
      await tab.click({ timeout: 5000 });
      await page.waitForTimeout(350);
    } else {
      throw new Error("未対応のUIビュー: " + JSON.stringify(view));
    }
    counts.push(await page.evaluate(() => document.querySelectorAll(".app *").length));
    if (onSection) await onSection(i, view.label);
  }
  return counts;
}

/** 26 UIビューのスクリーンショットを撮る。ファイル名は <tag>-<番号>-<名称>.png。 */
/* スクリーンショット前に document.fonts.ready を待つ。
 * font-display: swap のため、固定 sleep だけではフォント未ロード時の
 * 代替書体で撮れることがある。Google Fonts の応答が変わると読み込み順も
 * 変わり、レールラベル等が無差別に差分として出てしまう。
 * 待機を，不仅は.ms ではなく実際に「揃った」条件で撮る。 */
async function fontsSettled(page, timeout = 30000) {
  await page.waitForFunction(
    async () => {
      if (!document.fonts || document.fonts.status === "loaded") return true;
      await document.fonts.ready;
      return document.fonts.status === "loaded";
    },
    null,
    { timeout }
  ).catch(() => {});
  // status が loaded でも未使用の webfont は
// 取得されない。描画中の要素の書体だけ実際に解決していることを確認する。
  await page.evaluate(async () => {
    const used = new Set();
    for (const el of document.querySelectorAll("body *")) {
      const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join("");
      if (!own) continue;
      const cs = getComputedStyle(el);
      for (const f of cs.fontFamily.split(",").map((s) => s.replace(/["']/g, "").trim())) {
        if (!/^(serif|sans-serif|monospace|system-ui|ui-|cursive|fantasy|-apple-system|BlinkMacSystemFont)/.test(f)) used.add(f);
      }
    }
    await Promise.all([...used].map((f) => document.fonts.load(`16px "${f}"`, "あア漢字A1").catch(() => {})));
    await document.fonts.ready;
  });
}

export async function captureSections(page, tag) {
  const dir = ensureShotDir();
  const written = [];
  await walkSections(page, {
    onSection: async (i, label) => {
      await fontsSettled(page);
      const safe = label.replace(/[^\p{L}\p{N}-]+/gu, "-").replace(/^-|-$/g, "").slice(0, 48);
      const file = path.join(dir, `${tag}-${String(i).padStart(2, "0")}-${safe}.png`);
      const { writeFileSync } = await import("node:fs");
      writeFileSync(file, await page.screenshot());
      written.push(file);
    }
  });
  return written;
}
