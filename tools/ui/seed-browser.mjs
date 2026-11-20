/* ブラウザ実動確認の土台。
 *
 * テスト用アカウントに所持データが1件も無いと、装備中の人格描写
 * （識別 / HP・SAN・耐性 / 固有バフ / キーワード）を実測できない。
 * このスクリプトはアプリ本体の挙動を変えず、検証アカウントに
 * 描画に必要なデータだけを注入する。
 *
 * 使い方:
 *   BASE_URL=http://127.0.0.1:8123/ node tools/ui/seed-browser.mjs
 *
 * 投入後、同じブラウザで ビルド → 人格 を開くと装備済み人格を実測できる。
 * 駒整形（名前・PL・立ち絵・INITIATIVE・COLOR）も同時に埋まる。
 *
 * 注: アカウント選択画面（.acct-card-hit）を通過してから seed するため、
 *     既に1つ以上のアカウントが存在している必要がある。無ければ先にブラウザで作成する。
 */

import { BASE_URL, loadPlaywright } from "./harness.mjs";

const { chromium } = loadPlaywright();

/** テスト用の縦長立ち絵（差分2枚）。外部通信なしで描画できる。 */
function portraitDataUrl(c1, c2, label) {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800">' +
    '<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">' +
    `<stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/>` +
    '</linearGradient></defs>' +
    '<rect width="600" height="800" fill="url(#g)"/>' +
    '<circle cx="300" cy="240" r="105" fill="rgba(255,255,255,.34)"/>' +
    '<rect x="232" y="360" width="136" height="390" rx="68" fill="rgba(255,255,255,.26)"/>' +
    `<text x="300" y="700" font-size="42" fill="rgba(255,255,255,.55)" text-anchor="middle" font-family="sans-serif">${label}</text>` +
    "</svg>";
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const IMG_A = portraitDataUrl("#d4af5f", "#7a5c33", "A");
const IMG_B = portraitDataUrl("#7fb2d4", "#3a5c7a", "B");

/** ページ内で実行するシード関数本体（文字列を返す）。 */
function seedScript() {
  return `(() => {
    const A = window.LBT_accounts;
    if (!A) return { ok: false, reason: "LBT_accounts not loaded" };
    const id = A.getActiveId && A.getActiveId();
    if (!id) return { ok: false, reason: "no active account" };

    const DB = window.DB || {};
    const normal = DB.normal_personas || [];
    const tokui = DB.tokui_personas || [];

    // 固有バフを持つ人格を優先する（描画の主要要素のため）。
    const withUb = normal.concat(tokui).filter((p) => (p.unique_buffs || []).length > 0);
    const persona = withUb[0] || normal[0] || tokui[0];
    if (!persona) return { ok: false, reason: "no persona in DB" };

    const mode = tokui.includes(persona) ? "t" : "n";

    const rosterEntry = {
      mode, no: persona.no, syncRank: "00007", syncMax: true,
      skills: [], pas: null, pas2: null, pas2Enabled: false,
      support: null, spirit: null, enhancer: null, build: null,
    };

    const next = {
      schemaVersion: 1,
      charName: "\\u30e6\\u30b5",
      plName: "clockwork",
      imgUrls: ${JSON.stringify(IMG_A)} + "\\n" + ${JSON.stringify(IMG_B)},
      shareImageData: "", shareImageBlockedReason: "",
      color: "#c8a84b", initiative: 12,
      personaMode: mode, personaNo: persona.no, personaSrc: persona,
      syncedManual: false,
      hp: persona.hp ?? 100, san: persona.san ?? 50,
      speed: persona.speed ?? "1d8", bullets: "4",
      resS: "\\u62b5\\u6297", resP: "\\u666e\\u901a", resB: "\\u5f31\\u70b9",
      spirit: "", spiritMorale: "", spiritConfuse: "", spiritAlways: "",
      pas: { name: "", cond: "", always: "", effect: "", quick: "" },
      pas2Enabled: false, pas2: { name: "", cond: "", always: "", effect: "" },
      uniqueBuffs: (persona.unique_buffs || []).slice(0, 4).map((b, i) => ({
        id: "seed-" + i,
        name: b.name || ("\\u56fa\\u6709\\u30d0\\u30d5" + (i + 1)),
        type: b.type || "\\u30d0\\u30d5",
        initial: b.initial ?? 1,
        max: b.max ?? 3,
        desc: b.desc || "\\u3053\\u306e\\u4eba\\u683c\\u304c\\u7d4c\\u7a4d\\u3059\\u308b\\u56fa\\u6709\\u306e\\u72b6\\u614b\\u3002\\u88c5\\u5099\\u4e2d\\u306e\\u307f\\u6709\\u52b9\\u306b\\u306a\\u308b\\u3002",
        place: b.place || "status",
      })),
      skills: (persona.skills || []).slice(0, 3).map(() => ({ name: "", cond: "", effect: "", rank: "", dice: [] })),
      inventory: [], enhancements: [],
      roster: {
        personas: [rosterEntry],
        supports: (DB.support_passives || []).slice(0, 6).map((s) => ({ name: s.name, slot: "normal" })),
        egos: (DB.egos || []).slice(0, 4).map((e) => ({ rank: e.rank, no: e.no, name: e.name })),
        spirits: (DB.spirits || []).slice(0, 3).map((s) => ({ name: s.name })),
      },
      egoSlots: {}, skillLibrary: [], favorites: [], historyRecent: [],
      ui: { codexMode: mode },
    };

    const ego = (DB.egos || [])[0];
    if (ego) next.egoSlots = { [ego.rank]: ego };
    const spirit = (DB.spirits || [])[0];
    if (spirit) next.spirit = spirit.name;

    const merged = Object.assign({}, A.loadActive() || {}, next);
    const ok = A.saveActive(merged);
    return {
      ok: !!ok, accountId: id,
      persona: { no: persona.no, name: persona.name, mode },
      uniqueBuffs: merged.uniqueBuffs.length,
    };
  })()`;
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
try {
  const page = await context.newPage();
  await page.route("**/*", async (route) => {
    const url = route.request().url();
    if (/\.(css|js|mjs)\?v=/.test(url)) {
      return route.continue({ url: url.replace(/v=[0-9a-zA-Z]+/, `v=${Date.now()}${Math.floor(performance.now())}`) });
    }
    return route.continue();
  });
  await page.goto(BASE_URL, { waitUntil: "load", timeout: 90000 });

  /* アカウント選択があれば入る。無ければ検証用に1つ作る。 */
  await page.waitForTimeout(1800);
  if (await page.locator(".acct-card-hit").count()) {
    await page.evaluate(() => document.querySelector(".acct-card-hit").click());
    await page.waitForTimeout(1500);
  } else {
    /* 検証用アカウントを自動作成する（名前と用途のみ）。 */
    const created = await page.evaluate(async () => {
      const A = window.LBT_accounts;
      if (!A?.create) return null;
      try {
        const acc = A.create("検証", "検証");
        if (acc) {
          A.saveActive({});
          A.switch?.(acc.id);
          return acc.id;
        }
      } catch { /* fallthrough */ }
      return null;
    });
    if (created) {
      await page.reload({ waitUntil: "load" });
      await page.waitForTimeout(2200);
      if (await page.locator(".acct-card-hit").count()) {
        await page.evaluate(() => document.querySelector(".acct-card-hit").click());
        await page.waitForTimeout(1500);
      }
      console.log("検証用アカウントを作成:", created);
    }
  }

  const hasActive = await page.evaluate(() => !!window.LBT_accounts?.getActiveId?.());
  if (!hasActive) {
    console.error("アカウントがありません。先にブラウザで「新しいキャラクター」を作成してください。");
    process.exitCode = 1;
  } else {
    const result = await page.evaluate(seedScript());
    if (!result?.ok) {
      console.error("シード失敗:", result?.reason);
      process.exitCode = 1;
    } else {
      console.log("シード完了:", JSON.stringify(result));
      console.log("このブラウザで ビルド → 人格 を開くと、装備済み人格を実測できます。");
      console.log("駒整形（名前・PL・立ち絵・INITIATIVE・COLOR）も同時に埋まります。");
    }
  }
} finally {
  await context.close();
  await browser.close();
}