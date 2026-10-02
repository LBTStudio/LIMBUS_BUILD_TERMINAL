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

/** 静的サイトなので build は無い。12 セクションは左レールから開く。 */
export const SECTIONS = [
  "人格", "スキル", "パッシブ", "サポート", "E.G.O", "精神",
  "強化", "所持", "アイテム", "設定", "使い方", "その他",
];

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

/**
 * ページを開いて app の準備完了まで待つ。
 * CSS には skip-link や rail-item があるので、.rail-item を合図に使う。
 */
export async function openApp(browser, { width = 1440, height = 900, reducedMotion, bypassCache = false } = {}) {
  const context = await browser.newContext({
    viewport: { width, height },
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

  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 160)); });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message.slice(0, 160)));
  page.goto(BASE_URL, { waitUntil: "load", timeout: 90000 });
  await page.waitForSelector(".rail-item", { timeout: 90000 });
  await page.waitForTimeout(1500);
  return { context, page, errors };
}

/**
 * 12 セクションを順に開く。
 * 「使い方」は utility sheet を開くため、次の操作を妨げないよう閉じてから戻る。
 */
export async function walkSections(page, { onSection } = {}) {
  const counts = [];
  for (let i = 0; i < SECTIONS.length; i++) {
    await page.locator(".rail-item").nth(i).click();
    await page.waitForTimeout(900);
    if (await page.locator(".utility-sheet-backdrop").count()) {
      await page.keyboard.press("Escape");
      await page.waitForTimeout(350);
    }
    counts.push(await page.evaluate(() => document.querySelectorAll(".app *").length));
    if (onSection) await onSection(i, SECTIONS[i]);
  }
  return counts;
}

/** 12 セクションのスクリーンショットを撮る。ファイル名は <tag>-<番号>-<名称>.png。 */
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
  for (let i = 0; i < SECTIONS.length; i++) {
    await page.locator(".rail-item").nth(i).click();
    await page.waitForTimeout(900);
    if (await page.locator(".utility-sheet-backdrop").count()) {
      await page.keyboard.press("Escape");
      await page.waitForTimeout(350);
    }
    await fontsSettled(page);
    const file = path.join(dir, `${tag}-${String(i).padStart(2, "0")}.png`);
    const { writeFileSync } = await import("node:fs");
    writeFileSync(file, await page.screenshot());
    written.push(file);
  }
  return written;
}