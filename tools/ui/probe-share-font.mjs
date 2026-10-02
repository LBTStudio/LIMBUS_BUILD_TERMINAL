import { loadPlaywright, BASE_URL } from "./harness.mjs";

/* 生成される共有シートが CorporateLogo を実際に読み込むか確認する。
 * appsheet 本体と生成物的両方を browser で開き、document.fonts の実測で比べる。 */
const { chromium } = loadPlaywright();
const b = await chromium.launch({ headless: true });
const ctx = await b.newContext({ viewport: { width: 1200, height: 900 } });
const page = await ctx.newPage();
await page.route("**/*", async (route) => {
  const u = route.request().url();
  if (/\.(css|js|json|woff2)\?v=/.test(u)) return route.continue({ url: u.replace(/v=[0-9a-f]+/, "v=" + Date.now()) });
  return route.continue();
});
await page.goto(BASE_URL, { waitUntil: "load", timeout: 90000 });
await page.waitForSelector(".rail-item", { timeout: 90000 });
await page.waitForTimeout(1500);

const html = await page.evaluate(() => {
  // buildShareSheetHTML は egoSlots を含むアプリ実状態を要求する。
  // 手でスナップショットを作ると不足して落ちるので、保存済みの実状態を使う。
  const raw = localStorage.getItem("lbt_v46_state");
  const st = raw ? JSON.parse(raw) : null;
  if (!st) return null;
  const persona = (window.DB.normal_personas || [])[0];
  st.charName = persona.name;
  st.personaNo = persona.no;
  st.personaMode = "n";
  st.hp = "120";
  st.san = "50";
  st.speed = "3-7";
  if (!st.roster) st.roster = { personas: [] };
  if (!st.roster.personas.length) {
    st.roster.personas = [{ no: persona.no, mode: "n", syncRank: "000", syncMax: false, equipped: true }];
  }
  if (!st.egoSlots) st.egoSlots = { ZAYIN: null, TETH: null, HE: null, WAW: null, ALEPH: null };
  return window.LBT_gen.buildShareSheetHTML(st, { title: "検証シート", description: "検証" });
});
if (!html) { console.log("localStorage に状態が無い"); await b.close(); process.exit(0); }
console.log("生成 HTML 長:", html.length, "文字");
console.log("@font-face CorporateLogo:", (html.match(/font-family:'CorporateLogo'/g) || []).length, "件");
console.log("woff2 参照:", (html.match(/corporate-logo-[a-z]+-subset\.woff2/g) || []).join(", "));
console.log("head/body の指定:", (html.match(/--head:[^;]+;/) || ["(なし)"])[0], "|", (html.match(/body\{[^}]*font-family:[^;]+;/) || ["(なし)"])[0].slice(0, 90));

/* 生成物を実際に開いてフォントが解決するか */
const sheet = await ctx.newPage();
await sheet.goto(BASE_URL, { waitUntil: "load", timeout: 60000 });
await sheet.setContent(html, { waitUntil: "load" });
await sheet.waitForTimeout(3500);
const res = await sheet.evaluate(async () => {
  await document.fonts.ready;
  const corp = [...document.fonts].filter((f) => f.family === "CorporateLogo").map((f) => `${f.family}|${f.weight}|${f.status}`);
  const h = document.querySelector("h1,h2,.name,body");
  const cs = h ? getComputedStyle(h) : null;
  return {
    corpFaces: corp,
    fontsStatus: document.fonts.status,
    resolvedHead: cs ? cs.fontFamily.split(",")[0].replace(/["']/g, "").trim() : "(なし)",
    textLen: (document.body.textContent || "").trim().length,
  };
});
console.log("\n共有シートの実測:", JSON.stringify(res, null, 1));
await b.close();