import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

function loadShareLink(db = null, config = {}) {
  const source = readFileSync(new URL("../js/share-link.js", import.meta.url), "utf8");
  const window = { DB: db, ...config };
  vm.runInNewContext(source, { window, TextEncoder, TextDecoder, CompressionStream, DecompressionStream, Blob, Response, URL, URLSearchParams, btoa, atob });
  return window.LBT_shareLink;
}

test("自己完結型共有リンクはUI・履歴・非選択人格を除外して共有ビルドを往復できる", async () => {
  const share = loadShareLink();
  const state = {
    schemaVersion: 5,
    charName: "検証PC",
    personaMode: "n",
    personaNo: 1,
    personaSrc: { name: "剣契殺手 サンの人格", skills: [{ name: "重複して共有しない" }] },
    hp: "100",
    skills: [{ rank: "スキル1", name: "斬る", dice: [{ roll: "1d10", effect: "" }] }],
    inventory: [{ uid: "it-1", itemId: "heal-hp-bullet", quantity: 2, memo: true, palette: true }],
    shareImageData: "data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEAAUAmJaQAA3AA/vuUAAA=",
    ui: { currentSection: "items" },
    favorites: ["n:99"],
    historyRecent: ["n:3"],
    roster: {
      personas: [
        { uid: "active", no: 1, mode: "n", syncRank: "00", syncMax: true, equipped: true, build: { huge: true } },
        { uid: "other", no: 2, mode: "n", syncRank: null, syncMax: false, equipped: false, build: { shouldNotShare: true } }
      ],
      egos: [{ uid: "not-required" }]
    }
  };
  const snapshot = share.snapshotState(state);
  assert.equal(snapshot.ui, undefined);
  assert.equal(snapshot.favorites, undefined);
  assert.equal(snapshot.historyRecent, undefined);
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot.personaSrc)), { name: "剣契殺手 サンの人格" });
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot.roster)), { personas: [{ no: 1, mode: "n", syncRank: "00", syncMax: true }] });
  const token = await share.encodeState(state);
  const restored = await share.decodeToken(token);
  assert.equal(restored.charName, "検証PC");
  assert.equal(restored.personaSrc.name, "剣契殺手 サンの人格");
  assert.equal(restored.inventory[0].quantity, 2);
  assert.equal(restored.roster.personas[0].syncMax, true);
  assert.match(restored.shareImageData, /^data:image\/webp;base64,/);
  assert.deepEqual(JSON.parse(JSON.stringify(restored.egoSlots)), { ZAYIN: null, TETH: null, HE: null, WAW: null, ALEPH: null });
  assert.equal(restored.pas.name, "");
});

test("共有画像は対応形式・容量内だけを共有状態として復元する", async () => {
  const share = loadShareLink();
  const valid = "data:image/jpeg;base64," + "A".repeat(128);
  const invalid = "data:image/png;base64," + "A".repeat(128);
  const restored = await share.decodeToken(await share.encodeState({ charName: "画像PC", shareImageData: valid }));
  assert.equal(restored.shareImageData, valid);
  const invalidRestored = await share.decodeToken(await share.encodeState({ charName: "画像PC", shareImageData: invalid }));
  assert.equal(invalidRestored.shareImageData, "");
});

test("共有画像の圧縮見込みが32KBを超える場合は、外部保存前に共有リンク発行を停止する", async () => {
  const share = loadShareLink();
  const oversized = "data:image/webp;base64," + "A".repeat(44_000);
  const checked = share.validateShareImageForPublish({ shareImageData: oversized });
  assert.equal(checked.ok, false);
  assert.match(checked.message, /共有リンクは発行しません/);
  let requested = false;
  await assert.rejects(
    share.createPublishedUrl({ charName: "容量超過", shareImageData: oversized }, "https://lbtstudio.github.io/LIMBUS_BUILD_TERMINAL/share.html", async () => {
      requested = true;
      throw new Error("発行処理は開始してはいけません");
    }),
    /規定量を超えています/
  );
  assert.equal(requested, false);
});

test("共有画像の圧縮見込みが32KB以内なら共有リンク発行を許可する", () => {
  const share = loadShareLink();
  const checked = share.validateShareImageForPublish({ shareImageData: "data:image/jpeg;base64," + "A".repeat(128) });
  assert.equal(checked.ok, true);
  assert.ok(checked.bytes > 0);
  assert.equal(checked.maxBytes, 32 * 1024);
});

test("上限超過の画像選択が記録されている間は、以前の画像が残っていても共有リンクを発行しない", async () => {
  const share = loadShareLink();
  let requested = false;
  const state = {
    charName: "再アップロード待ち",
    shareImageData: "data:image/jpeg;base64," + "A".repeat(128),
    shareImageBlockedReason: "画像の圧縮見込みが規定量（32KB）へ収まりませんでした。共有リンクは発行できません。別の画像を再アップロードしてください"
  };
  assert.equal(share.validateShareImageForPublish(state).ok, false);
  await assert.rejects(
    share.createPublishedUrl(state, "https://lbtstudio.github.io/LIMBUS_BUILD_TERMINAL/share.html", async () => { requested = true; }),
    /共有リンクは発行できません/
  );
  assert.equal(requested, false);
});

test("実データの長文人格ではURL長を明示し、Discord本文上限時はダウンロードへフォールバックできる", async () => {
  const db = JSON.parse(readFileSync(new URL("../data/db.json", import.meta.url), "utf8"));
  const share = loadShareLink(db);
  const candidate = [
    ...(db.normal_personas || []).map((entry) => ({ mode: "n", entry })),
    ...(db.tokui_personas || []).map((entry) => ({ mode: "t", entry }))
  ].sort((a, b) => JSON.stringify(b.entry).length - JSON.stringify(a.entry).length)[0];
  const { mode, entry: persona } = candidate;
  const state = {
    charName: "共有URL長検証",
    personaMode: mode,
    personaNo: persona.no,
    personaSrc: persona,
    hp: String(persona.hp), san: String(persona.san), speed: persona.speed, bullets: persona.bullets,
    resS: persona.res_slash, resP: persona.res_pierce, resB: persona.res_blunt,
    pas: { name: persona.passive_name, cond: persona.passive_cond, always: persona.passive_always, effect: persona.passive_effect },
    skills: persona.skills,
    uniqueBuffs: persona.unique_buffs,
    roster: { personas: [{ uid: "largest", no: persona.no, mode: "n", syncRank: "00", syncMax: true, equipped: true }] }
  };
  const created = await share.createUrl(state, "https://lbtstudio.github.io/LIMBUS_BUILD_TERMINAL/share.html");
  const snapshot = share.snapshotState(state);
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot.personaRef)), { mode, no: persona.no });
  assert.equal(snapshot.skills, undefined);
  assert.ok(created.length <= share.PRACTICAL_DISCORD_URL_LENGTH, `URL length=${created.length}`);
  assert.equal(created.warning, "");
  const restored = share.hydratePersonaReference(await share.decodeToken(await share.encodeState(state)), db);
  assert.equal(restored.skills.length, persona.skills.length);
});

test("公式データ参照はE.G.O・サポート・強化・精神・公式複製アイテムを欠損なく復元する", async () => {
  const db = JSON.parse(readFileSync(new URL("../data/db.json", import.meta.url), "utf8"));
  const items = JSON.parse(readFileSync(new URL("../data/items.json", import.meta.url), "utf8"));
  const share = loadShareLink({ ...db, items });
  const ego = db.egos.find((entry) => entry.rank === "ZAYIN");
  const support = db.support_passives[0];
  const death = db.death_passives[0];
  const enhancement = db.normal_enhancements[0];
  const spirit = db.spirits[0];
  const item = items[0];
  const state = {
    charName: "公式参照検証",
    egoSlots: { ZAYIN: ego },
    supports: [support],
    deathSupport: death,
    enhancements: [enhancement],
    spirit: spirit.name,
    spiritAlways: spirit.always_effect,
    spiritMorale: spirit.morale_effect,
    spiritConfuse: spirit.confuse_effect,
    inventory: [{ uid: "custom-owned", itemId: "custom-official-copy", quantity: 1, memo: true, palette: true }],
    customItems: [{ ...item, id: "custom-official-copy", custom: true, maxOwned: item.maxOwned ?? null }],
    roster: { personas: [] }
  };
  const snapshot = share.snapshotState(state);
  assert.equal(snapshot.egoSlots, undefined);
  assert.equal(snapshot.supports, undefined);
  assert.equal(snapshot.deathSupport, undefined);
  assert.equal(snapshot.enhancements, undefined);
  assert.equal(snapshot.customItems, undefined);
  assert.equal(snapshot._r.e.ZAYIN, ego.no);
  assert.equal(snapshot._r.s[0], support.name);
  assert.equal(snapshot._r.d, death.name);
  assert.equal(snapshot._r.h[0], enhancement.name);
  assert.equal(snapshot._r.p, spirit.name);
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot._r.c[0])), ["custom-official-copy", item.id]);
  const restored = share.hydratePersonaReference(await share.decodeToken(await share.encodeState(state)), { ...db, items });
  assert.deepEqual(JSON.parse(JSON.stringify(restored.egoSlots.ZAYIN)), ego);
  assert.deepEqual(JSON.parse(JSON.stringify(restored.supports[0])), support);
  assert.deepEqual(JSON.parse(JSON.stringify(restored.deathSupport)), death);
  assert.deepEqual(JSON.parse(JSON.stringify(restored.enhancements[0])), enhancement);
  assert.equal(restored.spirit, spirit.name);
  assert.deepEqual(JSON.parse(JSON.stringify(restored.customItems[0])), { ...item, id: "custom-official-copy", custom: true, maxOwned: item.maxOwned ?? null });
});

test("最大構成の実データ共有URLもDiscord本文の実用長に収まる", async () => {
  const db = JSON.parse(readFileSync(new URL("../data/db.json", import.meta.url), "utf8"));
  const items = JSON.parse(readFileSync(new URL("../data/items.json", import.meta.url), "utf8"));
  const share = loadShareLink({ ...db, items });
  const persona = [...db.normal_personas, ...db.tokui_personas].sort((a, b) => JSON.stringify(b).length - JSON.stringify(a).length)[0];
  const mode = db.normal_personas.includes(persona) ? "n" : "t";
  const longest = (rows, field, limit) => [...rows].sort((a, b) => String(b?.[field] || "").length - String(a?.[field] || "").length).slice(0, limit);
  const selectedEgos = ["ZAYIN", "TETH", "HE", "WAW", "ALEPH"].reduce((slots, rank) => ({ ...slots, [rank]: longest(db.egos.filter((entry) => entry.rank === rank), "passive_effect", 1)[0] || null }), {});
  const officialItems = longest(items, "effect", 12);
  const customItems = officialItems.slice(0, 5).map((item, index) => ({ ...item, id: `copy-${index}`, custom: true, maxOwned: item.maxOwned ?? null }));
  const spirit = longest(db.spirits, "confuse_effect", 1)[0];
  const state = {
    charName: "最大構成検証", plName: "検証PL", personaMode: mode, personaNo: persona.no, personaSrc: persona,
    hp: String(persona.hp), san: String(persona.san), speed: persona.speed, bullets: persona.bullets,
    resS: persona.res_slash, resP: persona.res_pierce, resB: persona.res_blunt,
    pas: { name: persona.passive_name, cond: persona.passive_cond, always: persona.passive_always, effect: persona.passive_effect },
    skills: persona.skills, uniqueBuffs: persona.unique_buffs, egoSlots: selectedEgos,
    supports: longest(db.support_passives, "effect", 5), deathSupport: longest(db.death_passives, "effect", 1)[0],
    enhancements: [...longest(db.normal_enhancements, "effect", 5), ...longest(db.special_enhancements, "effect", 2)],
    spirit: spirit.name, spiritAlways: spirit.always_effect, spiritMorale: spirit.morale_effect, spiritConfuse: spirit.confuse_effect,
    inventory: [...officialItems.slice(0, 7).map((item, index) => ({ uid: `official-${index}`, itemId: item.id, quantity: item.maxOwned || 1, memo: true, palette: true })), ...customItems.map((item, index) => ({ uid: `custom-${index}`, itemId: item.id, quantity: 1, memo: true, palette: true }))],
    customItems,
    customStatuses: longest(db.support_passives, "effect", 3).map((entry, index) => ({ label: entry.name, initial: index + 1, place: "status" })),
    roster: { personas: [{ no: persona.no, mode, syncRank: "00", syncMax: true }] }
  };
  const created = await share.createUrl(state, "https://lbtstudio.github.io/LIMBUS_BUILD_TERMINAL/share.html");
  assert.ok(created.length <= share.PRACTICAL_DISCORD_URL_LENGTH, `URL length=${created.length}`);
  assert.equal(created.warning, "");
  const restored = share.hydratePersonaReference(await share.decodeToken(await share.encodeState(state)), { ...db, items });
  assert.equal(restored.supports.length, 5);
  assert.equal(restored.enhancements.length, 7);
  assert.equal(restored.customItems.length, 5);
  assert.equal(restored.egoSlots.ALEPH.name, selectedEgos.ALEPH.name);
});

test("DB外のオリジナル人格・アイテムと記号を含む書式は共有URLで可逆復元する", async () => {
  const share = loadShareLink({ normal_personas: [], tokui_personas: [], items: [] });
  const special = "原文-派生/『引用』「台詞」【角括弧】[ASCII]\n改行・記号!?：※";
  const originalPersona = {
    name: "オリジナル人格-α『試作』",
    source: "別冊PDF風/独自書式",
    originalFormat: special,
    customMetadata: { marker: "--/-『』「」[]【】", lines: ["一行目", "二行目"] }
  };
  const originalItem = {
    id: "original-item-/-[]",
    name: "自作アイテム-『境界』",
    category: "独自/分類",
    tags: ["-", "『引用』", "[tag]"],
    effect: special,
    palette: "1d10>=7 - 『成功』\\n/info {target}",
    price: "-",
    maxOwned: null,
    custom: true,
    customFormat: { separator: "---", notation: "「/」" }
  };
  const state = {
    charName: "自作PC-『記号確認』", plName: "PL/テスト",
    personaMode: "original", personaNo: "o-[-]/1", personaSrc: originalPersona,
    hp: "123", san: "45", speed: "1d10-2", bullets: "-",
    resS: "普通", resP: "抵抗", resB: "弱点",
    pas: { name: "固有-『パッシブ』", cond: "[条件]/-", always: special, effect: special, customField: "保持" },
    skills: [{
      id: "original-skill", rank: "戦術1-2", derived_from: "戦術1", derived_index: 2, derived_condition: "『条件』-[/]",
      type: "反撃", sin: "傲慢", aoe: "対象/全体", aoeCount: "1-2", name: "自作スキル-『A/B』", effect: special,
      customFormat: "S1--[custom]", dice: [{ roll: "2d10-1", dval: "10", d: "10", dPlus: true, dCnt: true, plus: true, effect: special, notation: "『dice』" }]
    }],
    egoSlots: { ZAYIN: { rank: "ZAYIN", no: "original-ego", name: "自作E.G.O-『Z』", kakusei: { effect: special, dice: [{ roll: "1d6-1", effect: special }] }, customFormat: "[-]" } },
    supports: [{ id: "support-original", name: "自作支援-『S』", cond: "-/[]", effect: special, lp: "99", customFormat: "保持" }],
    deathSupport: { id: "death-original", name: "自作死亡後-『D』", cond: "-/[]", effect: special, lp: "99" },
    enhancements: [{ name: "自作強化-『E』", category: "custom", effect: special, customFormat: "保持" }],
    inventory: [{ uid: "original-owned", itemId: originalItem.id, quantity: 2, memo: true, palette: true }],
    customItems: [originalItem],
    roster: { personas: [{ no: "o-[-]/1", mode: "original", syncRank: "00", syncMax: true }] }
  };
  const restored = share.hydratePersonaReference(await share.decodeToken(await share.encodeState(state)), { normal_personas: [], tokui_personas: [], items: [] });
  assert.deepEqual(JSON.parse(JSON.stringify(restored.personaSrc)), originalPersona);
  assert.equal(restored.skills[0].derived_condition, "『条件』-[/]");
  assert.equal(restored.skills[0].customFormat, "S1--[custom]");
  assert.equal(restored.skills[0].dice[0].notation, "『dice』");
  assert.equal(restored.skills[0].effect, special);
  assert.equal(restored.customItems[0].effect, special);
  assert.deepEqual(JSON.parse(JSON.stringify(restored.customItems[0].customFormat)), originalItem.customFormat);
  assert.equal(restored.supports[0].effect, special);
  assert.equal(restored.egoSlots.ZAYIN.kakusei.effect, special);
});

test("静的共有ページはDiscord向けのOGPと圧縮共有データの復元スクリプトを提供する", () => {
  const html = readFileSync(new URL("../share.html", import.meta.url), "utf8");
  assert.match(html, /rel="canonical" href="https:\/\/lbtstudio\.github\.io\/LIMBUS_BUILD_TERMINAL\/share\.html"/);
  assert.match(html, /property="og:url" content="https:\/\/lbtstudio\.github\.io\/LIMBUS_BUILD_TERMINAL\/share\.html"/);
  assert.match(html, /property="og:title" content="LIMBUS BUILD TERMINAL — キャラクターシート"/);
  assert.match(html, /property="og:image" content="https:\/\/lbtstudio\.github\.io\/LIMBUS_BUILD_TERMINAL\/assets\/lbt-share-card\.png"/);
  assert.match(html, /js\/share-link\.js\?v=65/);
  assert.match(html, /js\/share-viewer\.js\?v=65/);
  const viewer = readFileSync(new URL("../js/share-viewer.js", import.meta.url), "utf8");
  assert.match(viewer, /window\.addEventListener\("hashchange"/);
  assert.match(viewer, /window\.location\.reload\(\)/);
  assert.match(viewer, /window\.setTimeout\(resolve, 800\)/);
  assert.match(viewer, /fetch\("data\/db\.json\?v=64r74"\)/);
  const share = loadShareLink();
  assert.match(readFileSync(new URL("../js/share-link.js", import.meta.url), "utf8"), /EXTERNAL_READ_TIMEOUT_MS = 6000/);
  assert.ok(share.PRACTICAL_DISCORD_URL_LENGTH > 0);
});

test("長い共有URLはLBT直接復元URLを主URLにし、外部短縮サービスを経由しない", async () => {
  const share = loadShareLink();
  const unique = (seed) => Array.from({ length: 48 }, (_, index) => String.fromCharCode(33 + ((seed * 53 + index * 97) % 90))).join("");
  const state = {
    charName: "長文",
    skills: Array.from({ length: 260 }, (_, index) => ({
      rank: `戦術${index + 1}`,
      name: `独自スキル${index}-${unique(index)}`,
      effect: unique(index + 260),
      dice: [{ roll: `${index + 1}d${(index % 20) + 1}`, effect: unique(index + 520) }]
    })),
    roster: { personas: [] }
  };
  const unshortened = await share.createUrl(state, "https://lbtstudio.github.io/LIMBUS_BUILD_TERMINAL/share.html");
  assert.ok(unshortened.length > share.PRACTICAL_DISCORD_URL_LENGTH, `URL length=${unshortened.length}`);
  const calls = [];
  const fetchMock = async (url, options = {}) => {
    calls.push({ url, options });
    if (String(url).startsWith("https://tinyurl.com/")) throw new Error("TinyURLは主共有経路で呼び出さない");
    if (String(url) === "https://rentry.co/api/new") return new Response(JSON.stringify({ url_short: "lbt-rentry-01" }), { status: 200 });
    if (String(url) === "https://api.telegra.ph/createAccount") return new Response(JSON.stringify({ ok: true, result: { access_token: "temporary" } }), { status: 200 });
    if (String(url) === "https://api.telegra.ph/createPage") return new Response(JSON.stringify({ ok: true, result: { path: "LBT-Share-08-17" } }), { status: 200 });
    throw new Error(`unexpected URL: ${url}`);
  };
  const result = await share.createPublishedUrl(state, "https://lbtstudio.github.io/LIMBUS_BUILD_TERMINAL/share.html", fetchMock);
  assert.equal(result.url, "https://lbtstudio.github.io/LIMBUS_BUILD_TERMINAL/share.html?s=t:LBT-Share-08-17,r:lbt-rentry-01");
  assert.equal(result.strategy, "telegraph");
  assert.equal(result.backups.length, 1);
  assert.equal(result.backups[0].url, "https://lbtstudio.github.io/LIMBUS_BUILD_TERMINAL/share.html?lbt_source=rentry&lbt_id=lbt-rentry-01");
  assert.equal(calls.length, 3);
});

test("短い共有URLは外部保管を内部利用し、共有IDだけを最終LBT URLへ渡す", async () => {
  const share = loadShareLink();
  const state = {
    charName: "検証PC", personaSrc: { name: "東部親指ソルダートII" }, hp: "125", san: "50",
    roster: { personas: [{ no: 6, mode: "n", syncRank: "00", syncMax: true, equipped: true }] }
  };
  const fetchMock = async (url) => {
    if (String(url) === "https://rentry.co/api/new") return new Response(JSON.stringify({ url_short: "lbt-rentry-02" }), { status: 200 });
    if (String(url) === "https://api.telegra.ph/createAccount") return new Response(JSON.stringify({ ok: true, result: { access_token: "temporary" } }), { status: 200 });
    if (String(url) === "https://api.telegra.ph/createPage") return new Response(JSON.stringify({ ok: true, result: { path: "LBT-Share-Preview" } }), { status: 200 });
    throw new Error(`unexpected URL: ${url}`);
  };
  const result = await share.createPublishedUrl(state, "https://lbtstudio.github.io/LIMBUS_BUILD_TERMINAL/share.html", fetchMock);
  assert.equal(result.strategy, "telegraph");
  assert.equal(result.url, "https://lbtstudio.github.io/LIMBUS_BUILD_TERMINAL/share.html?s=t:LBT-Share-Preview,r:lbt-rentry-02");
  assert.ok(result.length < 120, `短縮URL length=${result.length}`);
  assert.deepEqual(JSON.parse(JSON.stringify(share.shortSourcesFromLocation({ search: new URL(result.url).search }))), [
    { source: "telegraph", id: "LBT-Share-Preview" },
    { source: "rentry", id: "lbt-rentry-02" }
  ]);
});

test("OGPゲートウェイ設定時の短縮共有は中立な個別OGP入口を経由する", async () => {
  const share = loadShareLink(null, { LBT_OGP_GATEWAY_ORIGIN: "https://lbt-ogp.lbtstudio-share.workers.dev" });
  const fetchMock = async (url) => {
    if (String(url) === "https://rentry.co/api/new") return new Response(JSON.stringify({ url_short: "lbt-rentry-ogp" }), { status: 200 });
    if (String(url) === "https://api.telegra.ph/createAccount") return new Response(JSON.stringify({ ok: true, result: { access_token: "temporary" } }), { status: 200 });
    if (String(url) === "https://api.telegra.ph/createPage") return new Response(JSON.stringify({ ok: true, result: { path: "LBT-OGP-Test" } }), { status: 200 });
    throw new Error(`unexpected URL: ${url}`);
  };
  const result = await share.createPublishedUrl({ charName: "OGP検証", roster: { personas: [] } }, "https://lbtstudio.github.io/LIMBUS_BUILD_TERMINAL/share.html", fetchMock);
  assert.equal(result.url, "https://lbt-ogp.lbtstudio-share.workers.dev/s?s=t:LBT-OGP-Test,r:lbt-rentry-ogp");
  assert.equal(share.ogpGatewayUrl("https://lbtstudio.github.io/LIMBUS_BUILD_TERMINAL/share.html?s=t:LBT-OGP-Test"), "https://lbt-ogp.lbtstudio-share.workers.dev/s?s=t:LBT-OGP-Test");
});

test("Telegraphの安全容量内に収まる共有画像はRentry発行失敗時も画像を保持して短縮共有する", async () => {
  const share = loadShareLink();
  const image = "data:image/webp;base64," + "A".repeat(160);
  const state = {
    charName: "画像予備検証", shareImageData: image,
    roster: { personas: [] }
  };
  const fetchMock = async (url, options = {}) => {
    if (String(url) === "https://rentry.co/api/new") throw new Error("Rentryの一時的な通信失敗");
    if (String(url) === "https://api.telegra.ph/createAccount") return new Response(JSON.stringify({ ok: true, result: { access_token: "temporary" } }), { status: 200 });
    if (String(url) === "https://api.telegra.ph/createPage") {
      const content = JSON.parse(new URLSearchParams(String(options.body)).get("content"));
      const stored = String(content?.[0]?.children?.[0] || "").replace(/^LBT_SHARE_TOKEN=/, "");
      const restored = await share.decodeToken(stored);
      assert.equal(restored.shareImageData, image);
      return new Response(JSON.stringify({ ok: true, result: { path: "LBT-Share-Image-Backup" } }), { status: 200 });
    }
    throw new Error(`unexpected URL: ${url}`);
  };
  const result = await share.createPublishedUrl(state, "https://lbtstudio.github.io/LIMBUS_BUILD_TERMINAL/share.html", fetchMock);
  assert.equal(result.strategy, "telegraph");
  assert.equal(result.url, "https://lbtstudio.github.io/LIMBUS_BUILD_TERMINAL/share.html?s=t:LBT-Share-Image-Backup");
});

test("外部分散保存の短いIDからトークンを取得して復元できる", async () => {
  const share = loadShareLink();
  const token = await share.encodeState({ charName: "外部復元", roster: { personas: [] } });
  const fetchMock = async (url) => {
    assert.equal(url, "https://rentry.co/lbt-rentry-01");
    return new Response(`<pre>LBT_SHARE_TOKEN=${token}</pre>`, { status: 200 });
  };
  const externalToken = await share.tokenFromExternalSource({ search: "?s=r:lbt-rentry-01" }, fetchMock);
  assert.equal(externalToken, token);
  const restored = await share.decodeToken(externalToken);
  assert.equal(restored.charName, "外部復元");
});

test("Rentryの直取得がCORSで失敗しても公開互換読み取り経路から予備共有を復元できる", async () => {
  const share = loadShareLink();
  const token = await share.encodeState({ charName: "CORS予備復元", roster: { personas: [] } });
  const calls = [];
  const fetchMock = async (url) => {
    calls.push(url);
    if (url === "https://rentry.co/lbt-rentry-cors") throw new Error("Failed to fetch");
    if (url === "https://r.jina.ai/http://rentry.co/lbt-rentry-cors") return new Response(`LBT_SHARE_TOKEN=${token}`, { status: 200 });
    throw new Error(`unexpected URL: ${url}`);
  };
  const externalToken = await share.tokenFromExternalSource({ search: "?s=r:lbt-rentry-cors" }, fetchMock);
  assert.equal(externalToken, token);
  assert.deepEqual(calls, ["https://rentry.co/lbt-rentry-cors", "https://r.jina.ai/http://rentry.co/lbt-rentry-cors"]);
});

test("主保存先の取得失敗時は共有URL内の予備保存先から自動復元する", async () => {
  const share = loadShareLink();
  const token = await share.encodeState({ charName: "予備復元", roster: { personas: [] } });
  const calls = [];
  const fetchMock = async (url) => {
    calls.push(url);
    if (String(url).startsWith("https://api.telegra.ph/")) throw new Error("Telegraphの一時的な通信失敗");
    if (String(url) === "https://rentry.co/lbt-rentry-backup") return new Response(`<pre>LBT_SHARE_TOKEN=${token}</pre>`, { status: 200 });
    throw new Error(`unexpected URL: ${url}`);
  };
  const externalToken = await share.tokenFromExternalSource({
    search: "?s=t:LBT-primary,r:lbt-rentry-backup"
  }, fetchMock);
  assert.equal(externalToken, token);
  assert.equal(calls.filter((url) => String(url).startsWith("https://api.telegra.ph/")).length, 2);
  assert.equal(calls.at(-1), "https://rentry.co/lbt-rentry-backup");
});
