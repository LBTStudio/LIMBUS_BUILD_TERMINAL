import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { loadRuntime, equipPersona } from "../tools/provenance/pipeline-harness.mjs";

function loadShareLink(db = null, config = {}, environment = {}) {
  const source = readFileSync(new URL("../js/share-link.js", import.meta.url), "utf8");
  const window = { DB: db, ...config };
  if (typeof window.setTimeout !== "function") window.setTimeout = setTimeout;
  if (typeof window.clearTimeout !== "function") window.clearTimeout = clearTimeout;
  const globals = { window, TextEncoder, TextDecoder, Blob, Response, URL, URLSearchParams, btoa, atob, AbortController: globalThis.AbortController };
  if (environment.compression !== false) {
    globals.CompressionStream = CompressionStream;
    globals.DecompressionStream = DecompressionStream;
  } else {
    globals.CompressionStream = undefined;
    globals.DecompressionStream = undefined;
  }
  vm.runInNewContext(source, globals);
  return window.LBT_shareLink;
}

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value))
  };
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

test("トークン生成は圧縮後と非圧縮の最終URL長を比較し、小さい表現を選ぶ", async () => {
  const share = loadShareLink();
  const states = [
    {},
    {
      charName: "圧縮効率確認",
      skills: [{
        rank: "スキル1",
        name: "同期で再利用される説明文".repeat(80),
        effect: "対象の状態に応じて追加効果が発生する。".repeat(80)
      }]
    }
  ];

  for (const state of states) {
    const json = JSON.stringify(share.snapshotState(state, { includeOgpImage: false }));
    const plainPayload = Buffer.from(json, "utf8").toString("base64url");
    const plainToken = `j.${plainPayload}`;
    let compressedToken = plainToken;
    if (typeof CompressionStream === "function" && typeof DecompressionStream === "function") {
      try {
        const stream = new Blob([new TextEncoder().encode(json)]).stream()
          .pipeThrough(new CompressionStream("deflate-raw"));
        const compressed = Buffer.from(await new Response(stream).arrayBuffer()).toString("base64url");
        compressedToken = `z.${compressed}`;
      } catch (_) {
        // This environment does not support deflate-raw; the plain token is the only valid form.
      }
    }
    const expected = compressedToken.length < plainToken.length ? compressedToken : plainToken;
    const token = await share.encodeState(state, { includeOgpImage: false });
    assert.equal(token, expected);
    const restored = await share.decodeToken(token);
    assert.equal(restored.charName, state.charName);
    assert.deepEqual(JSON.parse(JSON.stringify(restored.skills || [])), JSON.parse(JSON.stringify(state.skills || [])));
  }
});

test("外部保存先が応答しない場合も、OGP専用画像を除いた自己完結URLへ有限時間でフォールバックする", async () => {
  let canvasCreations = 0;
  const context = new Proxy({}, {
    get(_target, property) {
      if (property === "createLinearGradient") return () => ({ addColorStop() {} });
      return () => {};
    }
  });
  const document = {
    createElement() {
      canvasCreations += 1;
      return {
        getContext: () => context,
        toDataURL: () => "data:image/webp;base64,QUJD"
      };
    }
  };
  const share = loadShareLink(null, { document });
  const state = { charName: "外部保存停止時", roster: { personas: [] } };
  const result = await share.createPublishedUrl(
    state,
    "https://lbtstudio.github.io/LIMBUS_BUILD_TERMINAL/share.html",
    async () => new Promise(() => {})
  );

  assert.equal(result.strategy, "self");
  assert.match(result.url, /#lbt=(?:j|z)\.[A-Za-z0-9_-]+$/);
  const token = result.url.split("#lbt=")[1];
  const restored = await share.decodeToken(token);
  assert.equal(restored.charName, "外部保存停止時");
  assert.equal(restored.ogpImageData, "", "自己完結URLに復元されないOGP専用画像を重複格納しない");
  assert.equal(canvasCreations, 1, "発行中の重複判定ではOGPキャンバスを余計に描画しない");
  assert.match(result.warning, /自己完結URL/);
});

test("Cloudflare発行が停止しても、先に保存できたTelegraph/Rentryの共有へフォールバックする", async () => {
  const origin = "https://lbt-ogp.lbtstudio-share.workers.dev";
  const share = loadShareLink(null, { LBT_OGP_GATEWAY_ORIGIN: origin });
  const calls = [];
  const fetchMock = async (url, options = {}) => {
    const target = String(url);
    calls.push(target);
    if (target === "https://rentry.co/api/new") {
      return new Response(JSON.stringify({ url_short: "lbt-publish-timeout" }), { status: 200 });
    }
    if (target === "https://api.telegra.ph/createAccount") {
      return new Response(JSON.stringify({ ok: true, result: { access_token: "temporary" } }), { status: 200 });
    }
    if (target === "https://api.telegra.ph/createPage") {
      return new Response(JSON.stringify({ ok: true, result: { path: "LBT-Publish-Timeout" } }), { status: 200 });
    }
    if (target === origin + "/api/r2-share/v1") return new Promise(() => {});
    throw new Error("unexpected URL: " + target);
  };

  const result = await share.createPublishedUrl(
    { charName: "Cloudflare応答停止時", roster: { personas: [] } },
    "https://lbtstudio.github.io/LIMBUS_BUILD_TERMINAL/share.html",
    fetchMock
  );
  assert.equal(result.strategy, "telegraph");
  assert.match(result.url, /\?s=t:LBT-Publish-Timeout,r:lbt-publish-timeout/);
  assert.ok(calls.includes(origin + "/api/r2-share/v1"));
  assert.doesNotMatch(result.url, /workers\.dev/);
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

test("既存人格へ帰属した同期草案は共有時も公式参照を維持し、同期・カスタムのパッシブ内容を復元する", async () => {
  const db = JSON.parse(readFileSync(new URL("../data/db.json", import.meta.url), "utf8"));
  const share = loadShareLink(db);
  const persona = db.normal_personas[0];
  const importedName = "草案から反映した同期人格";
  const importedSkill = { rank: "スキル1", name: "草案スキル", type: "斬撃", sin: "傲慢", dice: [{ roll: "2d9", effect: "草案効果" }] };
  const importedPassive = {
    name: "草案パッシブ",
    cond: "憤怒×3",
    always: "草案の常時効果",
    effect: "草案の効果本文"
  };
  const extraPassive = {
    name: "カスタム追加パッシブ",
    cond: "傲慢×2",
    always: "追加パッシブの常時効果",
    effect: "追加パッシブの効果本文"
  };
  const legacyPassive = {
    name: "旧形式の追加パッシブ",
    cond: "嫉妬×1",
    always: "旧形式の常時効果",
    effect: "旧形式の効果本文"
  };
  const supportRecord = db.support_passives[0];
  const customizedSupport = { ...supportRecord, cond: "編集済み支援条件", effect: "編集済み支援効果", lp: "77" };
  const deathRecord = db.death_passives[0];
  const customizedDeathSupport = { ...deathRecord, cond: "編集済み死亡後条件", effect: "編集済み死亡後効果", lp: "88" };
  const state = {
    personaMode: "n",
    personaNo: persona.no,
    personaSrc: { ...persona, name: importedName, __custom: false, __affiliation: { mode: "n", no: persona.no } },
    hp: "160", san: "55", speed: "1d5+2", bullets: "10",
    resS: "普通", resP: "抵抗", resB: "弱点",
    pas: importedPassive,
    extraPassives: [extraPassive],
    pas2Enabled: true,
    pas2: legacyPassive,
    supports: [customizedSupport],
    deathSupport: customizedDeathSupport,
    skills: [importedSkill],
    uniqueBuffs: [],
    roster: { personas: [{ uid: "affiliated", mode: "n", no: persona.no, syncRank: "000", syncMax: true, equipped: true }] }
  };
  const snapshot = share.snapshotState(state);

  assert.deepEqual(JSON.parse(JSON.stringify(snapshot.personaRef)), { mode: "n", no: persona.no });
  assert.equal(snapshot.personaSrc.name, importedName);
  assert.equal(snapshot.skills[0].name, "草案スキル");
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot.pas)), importedPassive);
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot.extraPassives[0])), extraPassive);
  assert.equal(snapshot.pas2Enabled, true);
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot.pas2)), legacyPassive);
  assert.equal(snapshot.supports, undefined, "サポートパッシブは参照圧縮領域へ移される");
  assert.equal(snapshot.deathSupport, undefined, "死亡後パッシブは参照圧縮領域へ移される");
  assert.equal(snapshot._r.s[0].effect, "編集済み支援効果");
  assert.equal(snapshot._r.d.effect, "編集済み死亡後効果");

  const token = await share.encodeState(state, { includeOgpImage: false });
  const restored = share.hydratePersonaReference(await share.decodeToken(token), db);
  assert.equal(restored.personaMode, "n");
  assert.equal(restored.personaNo, persona.no);
  assert.equal(restored.personaSrc.name, importedName);
  assert.equal(restored.skills[0].name, "草案スキル");
  assert.deepEqual(JSON.parse(JSON.stringify(restored.pas)), importedPassive);
  assert.deepEqual(JSON.parse(JSON.stringify(restored.extraPassives[0])), extraPassive);
  assert.equal(restored.pas2Enabled, true);
  assert.deepEqual(JSON.parse(JSON.stringify(restored.pas2)), legacyPassive);
  assert.equal(restored.supports[0].cond, "編集済み支援条件");
  assert.equal(restored.supports[0].effect, "編集済み支援効果");
  assert.equal(restored.supports[0].lp, "77");
  assert.equal(restored.deathSupport.cond, "編集済み死亡後条件");
  assert.equal(restored.deathSupport.effect, "編集済み死亡後効果");
  assert.equal(restored.deathSupport.lp, "88");
});

test("同期・カスタムのパッシブを生成する段階まで保持され、実際の表示本文に出力される", async () => {
  const runtime = loadRuntime();
  const db = runtime.db;
  const persona = db.normal_personas[0];
  const share = loadShareLink(db);
  const baseState = equipPersona(runtime, "n", persona);
  const state = {
    ...baseState,
    personaSrc: {
      ...(baseState.personaSrc || persona),
      name: "共有HTML用の同期表示名",
      __custom: false,
      __affiliation: { mode: "n", no: persona.no }
    },
    pas: {
      name: "共有HTML同期パッシブ",
      cond: "憤怒×3",
      always: "共有HTML常時効果",
      effect: "共有HTML効果本文"
    },
    extraPassives: [{
      name: "共有HTMLカスタム追加",
      cond: "傲慢×2",
      always: "共有HTML追加常時効果",
      effect: "共有HTML追加効果本文"
    }],
    pas2Enabled: true,
    pas2: {
      name: "共有HTML旧形式追加",
      cond: "嫉妬×1",
      always: "共有HTML旧形式常時効果",
      effect: "共有HTML旧形式効果本文"
    },
    supports: [{
      ...db.support_passives[0],
      cond: "共有HTML支援条件",
      effect: "共有HTML支援効果",
      lp: "77"
    }]
  };
  const token = await share.encodeState(state, { includeOgpImage: false });
  const hydrated = share.hydratePersonaReference(await share.decodeToken(token), db);
  const html = runtime.gen.buildShareSheetHTML(hydrated);

  for (const expected of [
    "共有HTML同期パッシブ",
    "憤怒×3",
    "共有HTML常時効果",
    "共有HTML効果本文",
    "共有HTMLカスタム追加",
    "共有HTML追加常時効果",
    "共有HTML追加効果本文",
    "共有HTML旧形式追加",
    "共有HTML旧形式常時効果",
    "共有HTML旧形式効果本文",
    "共有HTML支援条件",
    "共有HTML支援効果"
  ]) {
    assert.ok(html.includes(expected), `共有HTMLに「${expected}」が出力される`);
  }
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
  // share.html は index.html と同じリビジョンで配信する。
  // ここが古いと、発行側（share-link.js）の更新が viewer 側に届かない。
  const indexHtml = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const shareLinkVersion = /js\/share-link\.js\?v=(\w+)/.exec(html)?.[1];
  const indexLinkVersion = /js\/share-link\.js\?v=(\w+)/.exec(indexHtml)?.[1];
  assert.ok(shareLinkVersion, "share.html が share-link.js を version 付きで読んでいる");
  assert.equal(shareLinkVersion, indexLinkVersion, "share.html と index.html の share-link.js の version が一致する");
  const generatorVersion = /js\/generator\.js\?v=(\w+)/.exec(html)?.[1];
  const indexGeneratorVersion = /js\/generator\.js\?v=(\w+)/.exec(indexHtml)?.[1];
  assert.equal(generatorVersion, indexGeneratorVersion, "share.html と index.html の generator.js の version が一致する");
  // 版の値そのものは tools/sync-asset-versions.mjs がファイル内容から決めるので、
  // ここで数値や版番号を固定すると、そのファイルと無関係に落ちる。ここでは
  // 「version 付きで読んでいる」ことだけ Contratし、同期そのものは
  // tests/asset-version-sync.test.mjs が全アセットを対象に検証する。
  assert.match(html, /js\/share-viewer\.js\?v=[0-9a-z]+/);
  const viewer = readFileSync(new URL("../js/share-viewer.js", import.meta.url), "utf8");
  assert.match(viewer, /window\.addEventListener\("hashchange"/);
  assert.match(viewer, /window\.location\.reload\(\)/);
  assert.match(viewer, /window\.setTimeout\(resolve, 800\)/);
  assert.match(viewer, /fetch\("data\/db\.json\?v=[0-9a-z]+"\)/);
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

test("短い共有URLは外部保管を内部利用し、共有IDと発行時summaryを最終LBT URLへ渡す", async () => {
  const share = loadShareLink();
  const state = {
    charName: "検証PC", personaSrc: { name: "東部親指ソルダートII" }, hp: "125", san: "50", speed: "3-7",
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
  /* 発行時に preview を固定して query へ載せる。Worker /s はこれで HTML を
     組み立て、Rentry/Telegraph へ read しなくて済む。
     共有IDの並び（primary, backup）は従来どおり。 */
  assert.equal(
    result.url,
    "https://lbtstudio.github.io/LIMBUS_BUILD_TERMINAL/share.html?s=t:LBT-Share-Preview,r:lbt-rentry-02"
      + "&lbt_n=%E6%9D%B1%E9%83%A8%E8%A6%AA%E6%8C%87%E3%82%BD%E3%83%AB%E3%83%80%E3%83%BC%E3%83%88II"
      + "&lbt_hp=125&lbt_san=50&lbt_spd=3-7&lbt_sync=00&lbt_max=1&lbt_img=0"
  );
  // summary をURLに載せるぶん長くなる（232文字）。実測した1900字上限には
  // 十分収まるので、共有互換性は守られている。元の「120字以内」は満たせない。
  assert.ok(result.length < 300, `短縮URL length=${result.length}`);
  // preview が query から復元できることを確認する
  const restored = share.previewFromLocation?.({ search: new URL(result.url).search });
  assert.equal(restored?.personaName, "東部親指ソルダートII");
  assert.equal(restored?.hp, "125");
  assert.equal(restored?.san, "50");
  assert.equal(restored?.speed, "3-7");
  assert.equal(restored?.hasShareImage, false);
  assert.equal(restored?.syncRank, "00");
  assert.equal(restored?.syncMax, true);
  assert.deepEqual(JSON.parse(JSON.stringify(share.shortSourcesFromLocation({ search: new URL(result.url).search }))), [
    { source: "telegraph", id: "LBT-Share-Preview" },
    { source: "rentry", id: "lbt-rentry-02" }
  ]);
});

test("既発行の旧形式URLは保存済みトークンから最新のKV短縮URLへ移行する", async () => {
  const storage = memoryStorage();
  const share = loadShareLink(null, {
    localStorage: storage,
    LBT_OGP_GATEWAY_ORIGIN: "https://lbt-ogp.lbtstudio-share.workers.dev"
  });
  const state = { charName: "キャッシュ世代更新", roster: { personas: [] } };
  const token = await share.encodeState(state);
  const oldUrl = "https://lbt-ogp.lbtstudio-share.workers.dev/s?s=t%3ALBT-Old-Cache&lbt_n=%E5%8F%A4%E3%81%84%E4%BA%BA%E6%A0%BC&cv=2";
  storage.setItem("lbt:last-published-share:v1", JSON.stringify({
    token, url: oldUrl, length: oldUrl.length, strategy: "telegraph", backups: [],
    preview: { personaName: "古い人格", hp: "120", san: "45" }, savedAt: 1
  }));
  let networkCalls = 0;
  const fetchMock = async (url, options = {}) => {
    networkCalls += 1;
    assert.equal(String(url), "https://lbt-ogp.lbtstudio-share.workers.dev/api/r2-share/v1");
    const payload = JSON.parse(options.body);
    assert.equal(payload.token, token);
    assert.equal(payload.preview.personaName, "古い人格");
    assert.deepEqual(JSON.parse(JSON.stringify(payload.fallbacks)), []);
    return new Response(JSON.stringify({
      ok: true, id: "NewShortId123456",
      url: "https://lbt-ogp.lbtstudio-share.workers.dev/s/NewShortId123456"
    }), { status: 201 });
  };

  const result = await share.createPublishedUrl(state, "https://lbtstudio.github.io/LIMBUS_BUILD_TERMINAL/share.html", fetchMock);
  assert.equal(result.reused, true);
  assert.equal(result.migrated, true);
  assert.equal(networkCalls, 1, "既存保存先は再発行せず、KVへの移行だけ行う");
  assert.equal(result.strategy, "cloudflare-kv");
  assert.equal(result.url, "https://lbt-ogp.lbtstudio-share.workers.dev/s/NewShortId123456");
  assert.equal(new URL(result.url).search, "");
  assert.equal(result.length, result.url.length);
  assert.equal(result.backups.some((entry) => entry.url === oldUrl), true, "移行前のURLも予備として残す");
  const cached = JSON.parse(storage.getItem("lbt:last-published-share:v1"));
  assert.equal(cached.url, result.url, "最新方式のURLをlocalStorageへ保存し直す");
  assert.equal(cached.strategy, "cloudflare-kv");
  assert.equal(cached.length, result.url.length);
});

test("古いCloudflare KV短縮URLキャッシュは再利用せず新規発行する", async () => {
  const storage = memoryStorage();
  const origin = "https://lbt-ogp.lbtstudio-share.workers.dev";
  const share = loadShareLink(null, {
    localStorage: storage,
    LBT_OGP_GATEWAY_ORIGIN: origin
  });
  const state = { charName: "期限切れ共有の再発行", roster: { personas: [] } };
  const token = await share.encodeState(state);
  const staleUrl = origin + "/s/ExpiredShort1234";
  storage.setItem("lbt:last-published-share:v1", JSON.stringify({
    token, url: staleUrl, length: staleUrl.length, strategy: "cloudflare-kv",
    backups: [], preview: { personaName: "期限切れ共有" },
    savedAt: Date.now() - 8 * 24 * 60 * 60 * 1000
  }));

  const calls = [];
  const freshUrl = origin + "/s/FreshShareId1234";
  const fetchMock = async (url, options = {}) => {
    const target = String(url);
    calls.push(target);
    if (target === "https://rentry.co/api/new") return new Response(JSON.stringify({ url_short: "lbt-expiry-rentry" }), { status: 200 });
    if (target === "https://api.telegra.ph/createAccount") return new Response(JSON.stringify({ ok: true, result: { access_token: "temporary" } }), { status: 200 });
    if (target === "https://api.telegra.ph/createPage") return new Response(JSON.stringify({ ok: true, result: { path: "LBT-Expiry-Reissue" } }), { status: 200 });
    if (target === origin + "/api/r2-share/v1") {
      const payload = JSON.parse(options.body);
      assert.equal(payload.token, token);
      assert.equal(payload.fallbacks.length, 2);
      return new Response(JSON.stringify({ ok: true, id: "FreshShareId1234", url: freshUrl }), { status: 201 });
    }
    throw new Error("unexpected URL: " + target);
  };

  const result = await share.createPublishedUrl(state, "https://lbtstudio.github.io/LIMBUS_BUILD_TERMINAL/share.html", fetchMock);
  assert.equal(result.url, freshUrl);
  assert.equal(result.reused, undefined, "古いKV URLはキャッシュ再利用扱いにしない");
  assert.equal(calls.filter((url) => url === origin + "/api/r2-share/v1").length, 1);
  assert.notEqual(result.url, staleUrl);
  assert.equal(JSON.parse(storage.getItem("lbt:last-published-share:v1")).url, freshUrl);
});


test("作成日時が欠落・破損したCloudflare KV短縮URLキャッシュは再利用せず新規発行する", async () => {
  const storage = memoryStorage();
  const origin = "https://lbt-ogp.lbtstudio-share.workers.dev";
  const share = loadShareLink(null, {
    localStorage: storage,
    LBT_OGP_GATEWAY_ORIGIN: origin
  });
  const state = { charName: "日時破損の共有キャッシュ", roster: { personas: [] } };
  const token = await share.encodeState(state);
  const invalidUrl = origin + "/s/BadTimeId1234567";
  storage.setItem("lbt:last-published-share:v1", JSON.stringify({
    token, url: invalidUrl, length: invalidUrl.length, strategy: "cloudflare-kv",
    backups: [], preview: { personaName: "日時破損" }, savedAt: "not-a-timestamp"
  }));

  const freshUrl = origin + "/s/GoodTimeId123456";
  const calls = [];
  const fetchMock = async (url, options = {}) => {
    const target = String(url);
    calls.push(target);
    if (target === "https://rentry.co/api/new") return new Response(JSON.stringify({ url_short: "lbt-invalidtime-rentry" }), { status: 200 });
    if (target === "https://api.telegra.ph/createAccount") return new Response(JSON.stringify({ ok: true, result: { access_token: "temporary" } }), { status: 200 });
    if (target === "https://api.telegra.ph/createPage") return new Response(JSON.stringify({ ok: true, result: { path: "LBT-Invalid-Time-Reissue" } }), { status: 200 });
    if (target === origin + "/api/r2-share/v1") {
      assert.equal(JSON.parse(options.body).token, token);
      return new Response(JSON.stringify({ ok: true, id: "GoodTimeId123456", url: freshUrl }), { status: 201 });
    }
    throw new Error("unexpected URL: " + target);
  };

  const result = await share.createPublishedUrl(state, "https://lbtstudio.github.io/LIMBUS_BUILD_TERMINAL/share.html", fetchMock);
  assert.equal(result.url, freshUrl);
  assert.equal(result.reused, undefined);
  assert.notEqual(result.url, invalidUrl);
  assert.equal(calls.filter((url) => url === origin + "/api/r2-share/v1").length, 1);
});

test("有効期間内のCloudflare KV短縮URLキャッシュは引き続き再利用する", async () => {
  const storage = memoryStorage();
  const origin = "https://lbt-ogp.lbtstudio-share.workers.dev";
  const share = loadShareLink(null, {
    localStorage: storage,
    LBT_OGP_GATEWAY_ORIGIN: origin
  });
  const state = { charName: "有効な共有URL", roster: { personas: [] } };
  const token = await share.encodeState(state);
  const activeUrl = origin + "/s/ActiveShareId123";
  storage.setItem("lbt:last-published-share:v1", JSON.stringify({
    token, url: activeUrl, length: activeUrl.length, strategy: "cloudflare-kv",
    backups: [], preview: { personaName: "有効な共有" },
    savedAt: Date.now() - 60 * 60 * 1000
  }));
  const result = await share.createPublishedUrl(state, "https://lbtstudio.github.io/LIMBUS_BUILD_TERMINAL/share.html", async () => {
    throw new Error("有効なキャッシュの再利用時はネットワーク通信しない");
  });
  assert.equal(result.reused, true);
  assert.equal(result.url, activeUrl);
});

test("同一の共有内容は直近URLを再利用し、外部保存を重複発行しない", async () => {
  const storage = memoryStorage();
  const share = loadShareLink(null, { localStorage: storage });
  const state = { charName: "重複防止検証", roster: { personas: [] } };
  let calls = 0;
  const fetchMock = async (url) => {
    calls += 1;
    if (String(url) === "https://rentry.co/api/new") return new Response(JSON.stringify({ url_short: "lbt-reuse-rentry" }), { status: 200 });
    if (String(url) === "https://api.telegra.ph/createAccount") return new Response(JSON.stringify({ ok: true, result: { access_token: "temporary" } }), { status: 200 });
    if (String(url) === "https://api.telegra.ph/createPage") return new Response(JSON.stringify({ ok: true, result: { path: "LBT-Reuse" } }), { status: 200 });
    throw new Error(`unexpected URL: ${url}`);
  };
  const first = await share.createPublishedUrl(state, "https://lbtstudio.github.io/LIMBUS_BUILD_TERMINAL/share.html", fetchMock);
  const second = await share.createPublishedUrl(state, "https://lbtstudio.github.io/LIMBUS_BUILD_TERMINAL/share.html", fetchMock);
  assert.equal(calls, 3);
  assert.equal(second.reused, true);
  assert.equal(second.url, first.url);
  const changed = await share.createPublishedUrl({ ...state, charName: "変更済み" }, "https://lbtstudio.github.io/LIMBUS_BUILD_TERMINAL/share.html", fetchMock);
  assert.equal(calls, 6);
  assert.equal(changed.reused, undefined);
});

test("同一共有を連続操作しても進行中の外部保存処理を共有し、二重発行しない", async () => {
  const share = loadShareLink();
  const state = { charName: "連続操作防止", roster: { personas: [] } };
  let calls = 0;
  const fetchMock = async (url) => {
    calls += 1;
    if (String(url) === "https://rentry.co/api/new") return new Response(JSON.stringify({ url_short: "lbt-pending-rentry" }), { status: 200 });
    if (String(url) === "https://api.telegra.ph/createAccount") return new Response(JSON.stringify({ ok: true, result: { access_token: "temporary" } }), { status: 200 });
    if (String(url) === "https://api.telegra.ph/createPage") return new Response(JSON.stringify({ ok: true, result: { path: "LBT-Pending" } }), { status: 200 });
    throw new Error(`unexpected URL: ${url}`);
  };
  const [first, second] = await Promise.all([
    share.createPublishedUrl(state, "https://lbtstudio.github.io/LIMBUS_BUILD_TERMINAL/share.html", fetchMock),
    share.createPublishedUrl(state, "https://lbtstudio.github.io/LIMBUS_BUILD_TERMINAL/share.html", fetchMock)
  ]);
  assert.equal(calls, 3);
  assert.equal(first.url, second.url);
});

test("OGPゲートウェイ設定時の短縮共有は個別OGP入口と明示的なカードキャッシュ世代を経由する", async () => {
  const share = loadShareLink(null, { LBT_OGP_GATEWAY_ORIGIN: "https://lbt-ogp.lbtstudio-share.workers.dev" });
  const fetchMock = async (url) => {
    if (String(url) === "https://rentry.co/api/new") return new Response(JSON.stringify({ url_short: "lbt-rentry-ogp" }), { status: 200 });
    if (String(url) === "https://api.telegra.ph/createAccount") return new Response(JSON.stringify({ ok: true, result: { access_token: "temporary" } }), { status: 200 });
    if (String(url) === "https://api.telegra.ph/createPage") return new Response(JSON.stringify({ ok: true, result: { path: "LBT-OGP-Test" } }), { status: 200 });
    if (String(url) === "https://lbt-ogp.lbtstudio-share.workers.dev/api/r2-share/v1") return new Response(JSON.stringify({ ok: false, error: "NOT_DEPLOYED" }), { status: 404 });
    throw new Error(`unexpected URL: ${url}`);
  };
  const result = await share.createPublishedUrl({ charName: "OGP検証", roster: { personas: [] } }, "https://lbtstudio.github.io/LIMBUS_BUILD_TERMINAL/share.html", fetchMock);
  assert.equal(result.url, "https://lbt-ogp.lbtstudio-share.workers.dev/s?s=t%3ALBT-OGP-Test%2Cr%3Albt-rentry-ogp&cv=3");
  assert.equal(share.ogpGatewayUrl("https://lbtstudio.github.io/LIMBUS_BUILD_TERMINAL/share.html?s=t:LBT-OGP-Test"), "https://lbt-ogp.lbtstudio-share.workers.dev/s?s=t%3ALBT-OGP-Test&cv=3");
});


test("KV共有APIが利用可能なら短いCloudflare HTML URLを主URLにし、既存方式のURLを予備にする", async () => {
  const share = loadShareLink(null, { LBT_OGP_GATEWAY_ORIGIN: "https://lbt-ogp.lbtstudio-share.workers.dev" });
  const state = {
    charName: "KV共有検証",
    personaSrc: { name: "蜘蛛の巣 中指の親方" },
    hp: "180", san: "45", speed: "1d6",
    roster: { personas: [{ no: 48, mode: "t", syncRank: "00", syncMax: true }] }
  };
  const calls = [];
  const fetchMock = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url) === "https://rentry.co/api/new") return new Response(JSON.stringify({ url_short: "lbt-r2-backup" }), { status: 200 });
    if (String(url) === "https://api.telegra.ph/createAccount") return new Response(JSON.stringify({ ok: true, result: { access_token: "temporary" } }), { status: 200 });
    if (String(url) === "https://api.telegra.ph/createPage") return new Response(JSON.stringify({ ok: true, result: { path: "LBT-R2-Primary" } }), { status: 200 });
    if (String(url) === "https://lbt-ogp.lbtstudio-share.workers.dev/api/r2-share/v1") {
      const payload = JSON.parse(options.body);
      assert.match(payload.token, /^(z|j)\./);
      assert.equal(payload.preview.personaName, "蜘蛛の巣 中指の親方");
      assert.equal(payload.fallbacks.length, 2);
      return new Response(JSON.stringify({
        ok: true, id: "AbCdEfGhIjKlMnOp",
        url: "https://lbt-ogp.lbtstudio-share.workers.dev/s/AbCdEfGhIjKlMnOp"
      }), { status: 201 });
    }
    throw new Error("unexpected URL: " + url);
  };
  const result = await share.createPublishedUrl(state, "https://lbtstudio.github.io/LIMBUS_BUILD_TERMINAL/share.html", fetchMock);
  const url = new URL(result.url);
  assert.equal(result.strategy, "cloudflare-kv");
  assert.equal(url.origin, "https://lbt-ogp.lbtstudio-share.workers.dev");
  assert.equal(url.pathname, "/s/AbCdEfGhIjKlMnOp");
  assert.equal(url.search, "", "primary Cloudflare URLs do not include fallback IDs or cache-version parameters");
  assert.equal(url.hash, "");
  assert.equal(url.searchParams.has("lbt_n"), false, "OGP preview text is embedded in the stored HTML, not repeated in the URL");
  assert.ok(result.length < 80, "the copied URL should be the minimal short path");
  assert.match(result.warning, /予備URLは共有リンクと別に保存/);
  assert.equal(result.backups.length, 1);
  assert.match(result.backups[0].url, /^https:\/\/lbtstudio\.github\.io\//);
  assert.match(result.backups[0].url, /share\.html\?s=/);
  assert.equal(calls.filter((call) => call.url.includes("/api/r2-share/v1")).length, 1);
});

test("KV共有APIが失敗したらWorkerに依存せず既存共有URLへフォールバックする", async () => {
  const share = loadShareLink(null, { LBT_OGP_GATEWAY_ORIGIN: "https://lbt-ogp.lbtstudio-share.workers.dev" });
  const fetchMock = async (url) => {
    if (String(url) === "https://rentry.co/api/new") return new Response(JSON.stringify({ url_short: "lbt-r2-fallback" }), { status: 200 });
    if (String(url) === "https://api.telegra.ph/createAccount") return new Response(JSON.stringify({ ok: true, result: { access_token: "temporary" } }), { status: 200 });
    if (String(url) === "https://api.telegra.ph/createPage") return new Response(JSON.stringify({ ok: true, result: { path: "LBT-R2-Fallback" } }), { status: 200 });
    if (String(url) === "https://lbt-ogp.lbtstudio-share.workers.dev/api/r2-share/v1") return new Response(JSON.stringify({ ok: false }), { status: 503 });
    throw new Error("unexpected URL: " + url);
  };
  const result = await share.createPublishedUrl({ charName: "フォールバック", roster: { personas: [] } }, "https://lbtstudio.github.io/LIMBUS_BUILD_TERMINAL/share.html", fetchMock);
  assert.equal(result.strategy, "telegraph");
  assert.ok(result.url.startsWith("https://lbtstudio.github.io/LIMBUS_BUILD_TERMINAL/share.html?s="));
  assert.ok(!result.url.includes("lbt-ogp.lbtstudio-share.workers.dev"));
  assert.match(result.warning, /既存の共有保存先/);
});


test("KV APIが別ホストのURLを返した場合は採用せず既存共有URLへ戻す", async () => {
  const share = loadShareLink(null, { LBT_OGP_GATEWAY_ORIGIN: "https://lbt-ogp.lbtstudio-share.workers.dev" });
  const fetchMock = async (url) => {
    if (String(url) === "https://rentry.co/api/new") return new Response(JSON.stringify({ url_short: "lbt-host-check" }), { status: 200 });
    if (String(url) === "https://api.telegra.ph/createAccount") return new Response(JSON.stringify({ ok: true, result: { access_token: "temporary" } }), { status: 200 });
    if (String(url) === "https://api.telegra.ph/createPage") return new Response(JSON.stringify({ ok: true, result: { path: "LBT-Host-Check" } }), { status: 200 });
    if (String(url) === "https://lbt-ogp.lbtstudio-share.workers.dev/api/r2-share/v1") {
      return new Response(JSON.stringify({
        ok: true, id: "AbCdEfGhIjKlMnOp",
        url: "https://evil.example/s/AbCdEfGhIjKlMnOp"
      }), { status: 201 });
    }
    throw new Error("unexpected URL: " + url);
  };
  const result = await share.createPublishedUrl({ charName: "ホスト検証", roster: { personas: [] } }, "https://lbtstudio.github.io/LIMBUS_BUILD_TERMINAL/share.html", fetchMock);
  assert.equal(result.strategy, "telegraph");
  assert.ok(result.url.startsWith("https://lbtstudio.github.io/LIMBUS_BUILD_TERMINAL/share.html?s="));
  assert.ok(!result.url.includes("evil.example"));
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

test("Rentry応答の本文が停止してもタイムアウトし、予備読み取りへ進む", async () => {
  const fastTimeout = (callback) => setTimeout(callback, 8);
  const share = loadShareLink(null, { setTimeout: fastTimeout });
  const token = await share.encodeState({ charName: "本文タイムアウト予備復元" });
  const calls = [];
  const fetchMock = async (url) => {
    calls.push(String(url));
    if (String(url) === "https://rentry.co/lbt-rentry-stalled-body") {
      return { ok: true, status: 200, text: () => new Promise(() => {}) };
    }
    if (String(url) === "https://r.jina.ai/http://rentry.co/lbt-rentry-stalled-body") {
      return new Response(`LBT_SHARE_TOKEN=${token}`, { status: 200 });
    }
    throw new Error("unexpected URL: " + url);
  };
  const recovered = await share.tokenFromExternalSource({ search: "?s=r:lbt-rentry-stalled-body" }, fetchMock);
  assert.equal(recovered, token);
  assert.deepEqual(calls, [
    "https://rentry.co/lbt-rentry-stalled-body",
    "https://r.jina.ai/http://rentry.co/lbt-rentry-stalled-body"
  ]);
});

test("Telegraph応答が停止してもタイムアウトし、次の共有先へ進む", async () => {
  const fastTimeout = (callback) => setTimeout(callback, 8);
  const share = loadShareLink(null, { setTimeout: fastTimeout });
  const token = await share.encodeState({ charName: "Telegraphタイムアウト予備復元" });
  const calls = [];
  const fetchMock = async (url, options = {}) => {
    const target = String(url);
    calls.push(target);
    if (target.startsWith("https://api.telegra.ph/getPage/")) {
      return new Promise((resolve, reject) => {
        const signal = options.signal;
        if (!signal) return;
        if (signal.aborted) return reject(new Error("aborted"));
        signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      });
    }
    if (target === "https://rentry.co/lbt-rentry-timeout-backup") {
      return new Response(`LBT_SHARE_TOKEN=${token}`, { status: 200 });
    }
    throw new Error("unexpected URL: " + target);
  };
  const recovered = await share.tokenFromExternalSource({
    search: "?s=t:LBT-stalled-primary,r:lbt-rentry-timeout-backup"
  }, fetchMock);
  assert.equal(recovered, token);
  assert.equal(calls.filter((url) => url.startsWith("https://api.telegra.ph/getPage/")).length, 2);
  assert.equal(calls.at(-1), "https://rentry.co/lbt-rentry-timeout-backup");
});

test("Cloudflare予備復元応答が停止した場合も有限時間で失敗を返す", async () => {
  const fastTimeout = (callback) => setTimeout(callback, 8);
  const share = loadShareLink(null, {
    LBT_OGP_GATEWAY_ORIGIN: "https://lbt-ogp.lbtstudio-share.workers.dev",
    setTimeout: fastTimeout
  });
  let calls = 0;
  await assert.rejects(
    share.tokenFromOgpGateway({ search: "?s=r:lbt-timeout-recovery" }, (url, options = {}) => {
      calls += 1;
      return new Promise((resolve, reject) => {
        const signal = options.signal;
        if (!signal) return;
        if (signal.aborted) return reject(new Error("aborted"));
        signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      });
    }),
    /タイムアウト/
  );
  assert.equal(calls, 1);
});

test("主保存先のトークンが破損していても有効な予備保存先から共有データを復元する", async () => {
  const share = loadShareLink();
  const validToken = await share.encodeState({ charName: "破損主保存の予備復元" });
  const fetchMock = async (url) => {
    if (String(url).startsWith("https://rentry.co/lbt-corrupt-primary")) return new Response("LBT_SHARE_TOKEN=j.e30...");
    if (String(url).startsWith("https://api.telegra.ph/")) {
      return new Response(JSON.stringify({ ok: true, result: { content: [{ children: [`LBT_SHARE_TOKEN=${validToken}`] }] } }));
    }
    throw new Error(`unexpected URL: ${url}`);
  };
  const token = await share.tokenFromExternalSource({ search: "?s=r:lbt-corrupt-primary,t:LBT-Valid-Backup" }, fetchMock);
  assert.equal(token, validToken);
});

test("保存先の直読みが失敗した場合も、無状態OGPゲートウェイの予備復元で共有トークンを取得できる", async () => {
  const share = loadShareLink(null, { LBT_OGP_GATEWAY_ORIGIN: "https://lbt-ogp.lbtstudio-share.workers.dev" });
  const token = await share.encodeState({ charName: "Worker予備復元" });
  const recovered = await share.tokenFromOgpGateway({ search: "?s=t:LBT-Recovery,r:lbt-recovery" }, async (url) => {
    assert.equal(String(url), "https://lbt-ogp.lbtstudio-share.workers.dev/d?s=t%3ALBT-Recovery%2Cr%3Albt-recovery");
    return new Response(token, { status: 200 });
  });
  assert.equal(recovered, token);
});

test("旧形式のRentry共有URLもWorker予備復元用の短縮IDへ変換して取得できる", async () => {
  const share = loadShareLink(null, { LBT_OGP_GATEWAY_ORIGIN: "https://lbt-ogp.lbtstudio-share.workers.dev" });
  const token = await share.encodeState({ charName: "旧URL復元" });
  const recovered = await share.tokenFromOgpGateway({ search: "?lbt_source=rentry&lbt_id=6yub7uok" }, async (url) => {
    assert.equal(String(url), "https://lbt-ogp.lbtstudio-share.workers.dev/d?s=r%3A6yub7uok");
    return new Response(token, { status: 200 });
  });
  assert.equal(recovered, token);
});

test("長いRentry共有トークンは切断されない短い連番チャンクへ保存され、再結合して復元できる", async () => {
  const share = loadShareLink();
  const longText = Array.from({ length: 800 }, (_, index) => `${index.toString(36)}-${String.fromCharCode(0x3041 + index % 70)}`).join("|");
  const state = { charName: "Rentry分割保存", customStatuses: [{ label: "長文", initial: longText, place: "status" }], roster: { personas: [] } };
  const expectedToken = await share.encodeState(state);
  assert.ok(expectedToken.length > 180);
  let storedText = "";
  const fetchMock = async (url, options = {}) => {
    if (String(url) === "https://rentry.co/api/new") {
      storedText = new URLSearchParams(String(options.body)).get("text") || "";
      return new Response(JSON.stringify({ url_short: "lbt-chunked-rentry" }), { status: 200 });
    }
    if (String(url) === "https://api.telegra.ph/createAccount") return new Response(JSON.stringify({ ok: true, result: { access_token: "temporary" } }), { status: 200 });
    if (String(url) === "https://api.telegra.ph/createPage") return new Response(JSON.stringify({ ok: true, result: { path: "LBT-Chunked" } }), { status: 200 });
    throw new Error(`unexpected URL: ${url}`);
  };
  await share.createPublishedUrl(state, "https://lbtstudio.github.io/LIMBUS_BUILD_TERMINAL/share.html", fetchMock);
  assert.match(storedText, /LBT_SHARE_TOKEN_PART=1\/\d+:/);
  assert.doesNotMatch(storedText, new RegExp(`LBT_SHARE_TOKEN=${expectedToken}`));
  const restoredToken = await share.tokenFromExternalSource({ search: "?s=r:lbt-chunked-rentry" }, async (url) => {
    assert.equal(String(url), "https://rentry.co/lbt-chunked-rentry");
    return new Response(storedText);
  });
  assert.equal(restoredToken, expectedToken);
});


test("圧縮後トークンが復元上限を超える共有状態は、無効リンクを発行せず明示的に拒否する", async () => {
  const share = loadShareLink();
  // 決定論的な高エントロピー文字列。JSON自体は4 MiB未満だが、deflate後も
  // decodeToken の160,000文字上限を超える大きさになる。
  let seed = 0x13579bdf;
  let content = "";
  for (let i = 0; i < 240000; i += 1) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    content += String.fromCharCode(33 + (seed % 90));
  }
  await assert.rejects(
    () => share.encodeState({ charName: "大きな共有状態", customStatuses: [{ label: "高エントロピー", initial: content }] }),
    /復元側のサイズ上限/
  );
});

test("CompressionStreamが無いブラウザでも、復元できない巨大な非圧縮トークンを発行しない", async () => {
  const share = loadShareLink(null, {}, { compression: false });
  await assert.rejects(
    () => share.encodeState({ charName: "圧縮非対応", customStatuses: [{ label: "長文", initial: "x".repeat(130000) }] }),
    /復元側のサイズ上限/
  );
});


test("共有プレビューは最多資源属性を算出し、URL summaryに往復させる", () => {
  const db = { normal_personas: [{ no: 1, name: "検証人格", hp: "100", san: "45", speed: "3-6", skills: [{ sin: "憤怒" }, { sin: "憤怒" }, { sin: "怠惰" }] }], tokui_personas: [] };
  const share = loadShareLink(db);
  const state = {
    personaMode: "n", personaNo: 1, personaSrc: { name: "検証人格" },
    skills: [{ sin: "憤怒" }, { sin: "憤怒" }, { sin: "怠惰" }],
    hp: "120", san: "50", speed: "3-6",
    roster: { personas: [{ mode: "n", no: 1, syncRank: "00", syncMax: true, equipped: true }] },
  };
  const preview = share.sharePreview(state);
  assert.equal(preview.primarySin, "憤怒");
  const url = share.shortViewerUrl("https://lbtstudio.github.io/LIMBUS_BUILD_TERMINAL/share.html", { source: "rentry", id: "AbCdEf" }, [], preview);
  assert.equal(new URL(url).searchParams.get("lbt_sin"), "憤怒");
  assert.equal(share.previewFromLocation({ search: new URL(url).search }).primarySin, "憤怒");
});

test("自動生成OGPカードはHP・SAN・SPDに加えて最多資源属性のパネルを描く", () => {
  const source = readFileSync(new URL("../js/share-link.js", import.meta.url), "utf8");
  assert.ok(source.includes('const cardValues = [["HP", preview.hp], ["SAN", preview.san], ["SPD", speed], ["最多資源属性", primarySin]]'));
  assert.ok(source.includes('params.set("lbt_sin", preview.primarySin)'));
});
