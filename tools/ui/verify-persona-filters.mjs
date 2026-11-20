#!/usr/bin/env node
/* Real-browser regression for the Persona Codex filter controls. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadPlaywright, openApp, REPO_ROOT } from "./harness.mjs";

const OUT = path.join(REPO_ROOT, "artifacts", "ui-audit-screenshots");
fs.mkdirSync(OUT, { recursive: true });
const browser = await loadPlaywright().chromium.launch({ headless: true });
const results = [];

async function activate(page, locator, mobile) {
  await locator.waitFor({ state: "visible", timeout: 15000 });
  await locator.scrollIntoViewIfNeeded();
  if (mobile) await locator.tap({ timeout: 7000 });
  else await locator.click({ timeout: 7000 });
  await page.waitForTimeout(220);
}

async function runProfile(profile) {
  const { context, page, errors } = await openApp(browser, {
    width: profile.width,
    height: profile.height,
    bypassCache: true
  });
  const mobile = profile.width <= 640;
  const checks = [];
  const check = (name, ok, details = {}) => {
    checks.push({ name, ok: !!ok, details });
    if (!ok) throw new Error(profile.name + ": " + name + " " + JSON.stringify(details));
  };

  try {
    const buildRoute = mobile
      ? page.locator(".btype-mobile-bottom-nav").getByRole("button", { name: "ビルド", exact: true })
      : page.locator(".rail-item").filter({ hasText: "ビルド" }).first();
    await activate(page, buildRoute, mobile);
    const personaTab = page.locator("#btab-persona").first();
    await activate(page, personaTab, mobile);

    const showAll = page.getByRole("button", { name: "全件（未所持も含む）", exact: true }).first();
    if (await showAll.isVisible().catch(() => false)) await activate(page, showAll, mobile);

    const affiliationInput = page.locator(".codex-affiliation-input").first();
    await affiliationInput.waitFor({ state: "visible", timeout: 10000 });
    const allCards = page.locator(".p-card");
    const beforeCount = await allCards.count();
    const affiliationNames = await page.locator(".p-card .p-affil").allTextContents();
    const affiliation = affiliationNames.map(value => value.trim()).find(Boolean);
    check("人格一覧と所属データが表示される", beforeCount > 0 && !!affiliation, {
      beforeCount, affiliation
    });

    const affiliationChars = [...affiliation];
    const allAffiliations = [...new Set(affiliationNames.map(value => value.trim()).filter(Boolean))];
    let queryLength = Math.min(2, affiliationChars.length);
    let query = affiliationChars.slice(0, queryLength).join("");
    while (queryLength < affiliationChars.length
      && allAffiliations.filter(value => value.normalize("NFKC").toLocaleLowerCase("ja")
        .includes(query.normalize("NFKC").toLocaleLowerCase("ja"))).length > 12) {
      queryLength++;
      query = affiliationChars.slice(0, queryLength).join("");
    }
    await affiliationInput.fill(query);
    const candidates = page.locator(".codex-affiliation-results .chip");
    await candidates.first().waitFor({ state: "visible", timeout: 7000 });
    const candidateNames = (await candidates.allTextContents()).map(value => value.trim());
    check("所属検索が部分一致の候補を表示する", candidateNames.includes(affiliation), {
      query, affiliation, candidateNames: candidateNames.slice(0, 12)
    });

    const candidate = page.locator(".codex-affiliation-results").getByRole("button", {
      name: affiliation, exact: true
    }).first();
    await activate(page, candidate, mobile);
    await affiliationInput.waitFor({ state: "visible" });
    const selectedChip = page.locator(".codex-affiliation-selected .chip").first();
    await selectedChip.waitFor({ state: "visible", timeout: 5000 });
    const selectedState = await selectedChip.evaluate(el => ({
      text: (el.textContent || "").trim(),
      pressed: el.getAttribute("aria-pressed")
    }));
    const filteredAffiliations = [...new Set((await page.locator(".p-card .p-affil").allTextContents()).map(s => s.trim()).filter(Boolean))];
    const filteredCount = await allCards.count();
    check("所属を選ぶと選択済み表示と絞り込みが一致する",
      selectedState.pressed === "true" && selectedState.text.includes(affiliation)
        && filteredAffiliations.length === 1 && filteredAffiliations[0] === affiliation
        && filteredCount > 0 && filteredCount <= beforeCount,
      { selectedState, filteredAffiliations, beforeCount, filteredCount });
    await page.screenshot({ path: path.join(OUT, profile.name + "-persona-affiliation-selected.png"), fullPage: false });

    await activate(page, selectedChip, mobile);
    const clearedCount = await allCards.count();
    check("選択済み所属を押すと解除され一覧が戻る",
      await page.locator(".codex-affiliation-selected .chip").count() === 0
        && clearedCount === beforeCount,
      { beforeCount, clearedCount });

    const sinChip = page.locator(".codex-filters .codex-filter-row .chip[data-sin]").first();
    await sinChip.waitFor({ state: "visible", timeout: 7000 });
    const sinBefore = await sinChip.getAttribute("data-sin");
    await activate(page, sinChip, mobile);
    const sinSelected = await sinChip.evaluate(el => ({
      pressed: el.getAttribute("aria-pressed"),
      active: el.classList.contains("is-active"),
      background: getComputedStyle(el).backgroundColor,
      backgroundImage: getComputedStyle(el).backgroundImage,
      checkmark: getComputedStyle(el, "::after").content,
      border: getComputedStyle(el).borderColor
    }));
    check("大罪は固有色を保ったまま選択状態を示す",
      sinSelected.pressed === "true" && sinSelected.active
        && sinSelected.background !== "rgba(0, 0, 0, 0)"
        && sinSelected.background !== "transparent"
        && sinSelected.checkmark.includes("✓"),
      { sin: sinBefore, sinSelected });
    await page.screenshot({ path: path.join(OUT, profile.name + "-persona-sin-selected.png"), fullPage: false });
    await activate(page, sinChip, mobile);
    check("大罪チップを再度押すと選択を解除できる",
      await sinChip.getAttribute("aria-pressed") === "false"
        && !(await sinChip.getAttribute("class")).split(/\s+/).includes("is-active"),
      { sin: sinBefore });

    const keywordRowIndex = await page.locator(".codex-filter-row").evaluateAll(rows =>
      rows.findIndex(row => row.querySelector(".filter-label")?.textContent.trim() === "キーワード"));
    check("キーワード行が表示される", keywordRowIndex >= 0, { keywordRowIndex });
    const keywordRow = page.locator(".codex-filter-row").nth(keywordRowIndex);
    const keywordChip = keywordRow.locator(".chips-group .chip").first();
    await keywordChip.waitFor({ state: "visible", timeout: 7000 });
    const keywordLabel = await keywordChip.evaluate(el => ({
      text: (el.textContent || "").trim(),
      visible: (el.innerText || "").trim(),
      pressed: el.getAttribute("aria-pressed")
    }));
    check("キーワードチップは候補数を含まずキーワード名だけを表示する",
      !!keywordLabel.text && keywordLabel.text === keywordLabel.visible
        && !/\s*[·•]\s*\d+$/.test(keywordLabel.text),
      keywordLabel);
    await activate(page, keywordChip, mobile);
    check("キーワードを選択できる",
      await keywordChip.getAttribute("aria-pressed") === "true"
        && (await keywordChip.getAttribute("class")).split(/\s+/).includes("is-active"),
      { keyword: keywordLabel.text });
    await activate(page, keywordChip, mobile);
    check("キーワードを再度押すと解除できる",
      await keywordChip.getAttribute("aria-pressed") === "false",
      { keyword: keywordLabel.text });

    check("画面操作でコンソール・ロードエラーが発生しない", errors.length === 0, { errors });
    results.push({ profile: profile.name, checks });
    console.log("[persona-filter] " + profile.name + ": " + checks.length + " checks passed");
  } finally {
    await context.close();
  }
}

try {
  for (const profile of [
    { name: "desktop", width: 1440, height: 900 },
    { name: "mobile", width: 390, height: 844 }
  ]) await runProfile(profile);
  fs.writeFileSync(path.join(OUT, "persona-filter-regression.json"), JSON.stringify({
    generatedAt: new Date().toISOString(),
    totalChecks: results.reduce((n, item) => n + item.checks.length, 0),
    results
  }, null, 2));
  console.log("[persona-filter] all profiles passed");
} catch (error) {
  console.error("[persona-filter] FAILED: " + (error?.stack || error));
  process.exitCode = 1;
} finally {
  await browser.close();
}
