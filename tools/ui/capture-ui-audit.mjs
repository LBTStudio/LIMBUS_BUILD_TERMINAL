#!/usr/bin/env node
/* UI interaction audit: real rendered screens, panels, menus, dialogs, hover/focus states. */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.resolve(ROOT, "artifacts/ui-audit-screenshots");
const HOST = "127.0.0.1";
const PORT = 4174;
const MIME = { ".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".mjs":"text/javascript; charset=utf-8", ".css":"text/css; charset=utf-8", ".json":"application/json; charset=utf-8", ".svg":"image/svg+xml", ".png":"image/png", ".webp":"image/webp", ".txt":"text/plain; charset=utf-8", ".woff2":"font/woff2" };
const audit = { generatedAt: new Date().toISOString(), screenshots: [], failures: [], consoleErrors: [], httpErrors: [], pageErrors: [], layoutWarnings: [], interactions: [] };
let page;
let view = "unknown";

function log(s) { console.log("[ui-audit] " + s); }
function slug(s) { return String(s).trim().replace(/[^\p{L}\p{N}-]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "screen"; }
function makeServer() {
  return http.createServer((req, res) => {
    let p;
    try { p = decodeURIComponent(new URL(req.url || "/", "http://" + HOST).pathname); }
    catch { res.writeHead(400).end("Bad request"); return; }
    if (p === "/") p = "/index.html";
    const f = path.resolve(ROOT, "." + p);
    if (f !== ROOT && !f.startsWith(ROOT + path.sep)) { res.writeHead(403).end("Forbidden"); return; }
    fs.stat(f, (err, stat) => {
      if (err || !stat.isFile()) { res.writeHead(404).end("Not found"); return; }
      res.writeHead(200, { "content-type": MIME[path.extname(f).toLowerCase()] || "application/octet-stream", "cache-control": "no-store", "x-content-type-options": "nosniff" });
      fs.createReadStream(f).pipe(res);
    });
  });
}
async function visible(loc) {
  try {
    return (await loc.count()) > 0 && await loc.first().isVisible() && await loc.first().evaluate((el) => {
      for (let node = el; node instanceof Element; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) < 0.03 || node.getAttribute("aria-hidden") === "true") return false;
      }
      return true;
    });
  } catch { return false; }
}
async function click(loc) {
  if (!(await visible(loc))) throw new Error("target is not visible");
  await loc.first().click({ timeout: 4000 });
  await page.waitForTimeout(250);
}
async function go(label) {
  let loc = page.locator(".rail-item").filter({ hasText: label }).first();
  if (await visible(loc)) return click(loc);
  loc = page.locator("button[title='" + label + "']").first();
  if (await visible(loc)) return click(loc);
  loc = page.getByText(label, { exact: true }).first();
  return click(loc);
}
async function closeOverlay() {
  // Many dialogs use an explicit close button and do not register Escape.
  // Try Escape first, then close the topmost visible dialog by its accessible label
  // or the visible × glyph; repeat because nested account/import dialogs can stack.
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(180);
  for (let attempt = 0; attempt < 5; attempt++) {
    const byLabel = page.locator('button[aria-label*="閉じる"], button[title*="閉じる"], button[aria-label*="close" i], button[title*="close" i]').last();
    const byGlyph = page.locator("button").filter({ hasText: /^\s*[×✕✖]\s*$/ }).last();
    let target = await visible(byLabel) ? byLabel : (await visible(byGlyph) ? byGlyph : null);
    if (!target) {
      // Fallback for icon-only close controls inside the currently visible modal shell.
      const shell = page.locator('[role="dialog"]:visible, [aria-modal="true"]:visible, .share-modal-backdrop:visible, .acct-overlay:visible, .utility-sheet-backdrop:visible, .cp-overlay:visible').last();
      if (await visible(shell)) {
        const buttons = shell.locator("button:visible");
        const n = await buttons.count();
        for (let j = n - 1; j >= 0; j--) {
          const button = buttons.nth(j);
          const meta = await button.evaluate((el) => ({ text: (el.innerText || "").trim(), aria: el.getAttribute("aria-label") || "", title: el.getAttribute("title") || "", rect: (() => { const r=el.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height}; })() }));
          const viewportWidth = page.viewportSize()?.width || 1440;
          if (/閉じる|close|^[×✕✖]$/i.test(meta.aria + " " + meta.title + " " + meta.text) || (meta.rect.x > viewportWidth * 0.65 && meta.rect.y < 180 && meta.rect.w < 80 && meta.rect.h < 80)) {
            target = button;
            break;
          }
        }
      }
    }
    if (!target) break;
    await target.click({ timeout: 1800, force: true }).catch(() => {});
    await page.waitForTimeout(220);
  }
}
async function readMetrics() {
  return page.evaluate(() => {
    const isVisible = (e) => {
      let node = e;
      while (node instanceof Element) {
        const s = getComputedStyle(node);
        if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) < 0.03 || node.getAttribute("aria-hidden") === "true") return false;
        node = node.parentElement;
      }
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    const rect = (e) => { const r=e.getBoundingClientRect(); return {x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)}; };
    const dialogs = [...document.querySelectorAll('[role="dialog"],[aria-modal="true"],.share-modal-backdrop,.acct-overlay,.utility-sheet-backdrop,.cp-overlay')].filter(isVisible).map(e=>({className:typeof e.className==="string"?e.className:"",label:e.getAttribute("aria-label")||e.getAttribute("aria-labelledby")||(e.innerText||"").trim().slice(0,55),rect:rect(e)}));
    const smallTargets=[...document.querySelectorAll("button,[role=button],input,select,textarea,a[href]")].filter(isVisible).map(e=>({label:(e.getAttribute("aria-label")||e.innerText||e.getAttribute("title")||e.getAttribute("placeholder")||"").trim().replace(/\s+/g," ").slice(0,32),rect:rect(e)})).filter(x=>x.rect.width<32||x.rect.height<32).slice(0,25);
    const horizontalScrollers=[...document.querySelectorAll("body *")].filter(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>80&&r.height>20&&e.scrollWidth>e.clientWidth+12&&["auto","scroll","hidden"].includes(s.overflowX);}).slice(0,24).map(e=>({tag:e.tagName,className:typeof e.className==="string"?e.className:"",label:(e.getAttribute("aria-label")||e.innerText||"").trim().replace(/\s+/g," ").slice(0,42),clientWidth:e.clientWidth,scrollWidth:e.scrollWidth,overflowX:getComputedStyle(e).overflowX,rect:rect(e)}));
    const layoutElements=[...document.querySelectorAll("#lbt-preview-edge-toggle,.preview,.preview-reopen,.preview-close,.preview-edge-toggle,.preview-actions,.preview-hint,.preview-tabs,.focus,.rail,.section-title-row,.section-title,.build-tabs,.record-tabbar")].filter(isVisible).map(e=>{const s=getComputedStyle(e);return {tag:e.tagName,id:e.id||"",className:typeof e.className==="string"?e.className:"",text:(e.innerText||"").trim().replace(/\s+/g," ").slice(0,48),rect:rect(e),style:{position:s.position,display:s.display,top:s.top,right:s.right,bottom:s.bottom,width:s.width,height:s.height,writingMode:s.writingMode,opacity:s.opacity,zIndex:s.zIndex,pointerEvents:s.pointerEvents}};});
    return {viewport:{width:innerWidth,height:innerHeight},document:{width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight},horizontalOverflow:document.documentElement.scrollWidth>innerWidth+2,horizontalScrollers,layoutElements,dialogs,smallTargets,activeElement:document.activeElement?{tag:document.activeElement.tagName,aria:document.activeElement.getAttribute("aria-label"),text:(document.activeElement.innerText||"").trim().slice(0,40)}:null};
  });
}
async function snap(name, note) {
  await page.waitForTimeout(180);
  await page.evaluate(async()=>{ if(document.fonts&&document.fonts.ready) await Promise.race([document.fonts.ready,new Promise(r=>setTimeout(r,700))]); });
  const base=view+"-"+String(audit.screenshots.length+1).padStart(3,"0")+"-"+slug(name);
  const file=path.join(OUT,base+".png");
  await page.screenshot({path:file,animations:"disabled"});
  const m=await readMetrics();
  audit.screenshots.push({name:base,note:note||"",file:path.relative(ROOT,file),metrics:m});
  if(m.horizontalOverflow) audit.layoutWarnings.push({name:base,type:"document-horizontal-overflow",viewport:m.viewport,document:m.document});
  if (m.viewport.width <= 640) {
    const toggle = (m.layoutElements || []).find((item) => item.id === "lbt-preview-edge-toggle");
    if (toggle) {
      for (const target of (m.layoutElements || []).filter((item) => ["section-title-row","section-title","build-tabs","record-tabbar"].includes(item.className))) {
        const a = toggle.rect, b = target.rect;
        const overlapX = Math.max(0, Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x));
        const overlapY = Math.max(0, Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));
        if (overlapX > 4 && overlapY > 4) audit.layoutWarnings.push({name:base,type:"preview-toggle-overlaps-header",target:target.className,overlap:{width:overlapX,height:overlapY},toggle:a,targetRect:b});
      }
    }
  }
  if(view==="mobile") {
    const previewControls=(m.layoutElements||[]).filter(e=>e.id==="lbt-preview-edge-toggle" || e.className.split(/\s+/).includes("preview-reopen") || e.className.split(/\s+/).includes("preview-close"));
    if(previewControls.length>1) audit.layoutWarnings.push({name:base,type:"duplicate-preview-controls",controls:previewControls});
    for(const element of (m.layoutElements||[]).filter(e=>e.id==="lbt-preview-edge-toggle" || e.className.split(/\s+/).includes("preview-edge-toggle"))) {
      if(element.rect.y < 220) audit.layoutWarnings.push({name:base,type:"preview-toggle-overlaps-header",rect:element.rect,style:element.style});
      if(element.className.split(/\s+/).includes("is-open")) {
        for(const target of (m.layoutElements||[]).filter(e=>["preview-actions","preview-hint","preview-tabs"].includes(e.className))) {
          const a=element.rect,b=target.rect;
          const overlapX=Math.max(0,Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x));
          const overlapY=Math.max(0,Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y));
          if(overlapX>4 && overlapY>4) audit.layoutWarnings.push({name:base,type:"preview-toggle-overlaps-panel-controls",target:target.className,overlap:{width:overlapX,height:overlapY},toggle:a,targetRect:b});
        }
      }
      const open=element.className.split(/\s+/).includes("is-open");
      const owner=open
        ? (m.layoutElements||[]).find(e=>e.className.split(/\s+/).includes("preview") && e.className.split(/\s+/).includes("is-open"))
        : (m.layoutElements||[]).find(e=>e.className==="focus");
      if(owner && owner.rect.y+owner.rect.height>element.rect.y-4) {
        audit.layoutWarnings.push({name:base,type:"preview-toggle-overlaps-content-dock",owner:owner.className,ownerRect:owner.rect,toggle:element.rect});
      }
    }
  }
  log("captured "+base);
}
async function attempt(name, fn) {
  try { await fn(); audit.interactions.push({name,status:"captured"}); }
  catch(e) { const err=String(e&&e.message||e).slice(0,220); audit.failures.push({name,error:err}); audit.interactions.push({name,status:"failed",error:err}); log("skip "+name+": "+err); }
}
async function seed() {
  return page.evaluate(() => {
    const A = window.LBT_accounts;
    const DB = window.DB || {};
    if (!A || !A.getActiveId || !A.getActiveId()) return { ok: false, reason: "no active account" };
    const normal = Array.isArray(DB.normal_personas) ? DB.normal_personas : [];
    const special = Array.isArray(DB.tokui_personas) ? DB.tokui_personas : [];
    const all = [
      ...normal.map((p) => ({ p, mode: "n" })),
      ...special.map((p) => ({ p, mode: "t" }))
    ];
    const chosen = all.find(({ p }) => (p.unique_buffs || []).length > 0) || all[0];
    if (!chosen) return { ok: false, reason: "no persona in DB" };
    const p = chosen.p;
    const mode = chosen.mode;
    const now = Date.now();

    const normalizedSkills = (source, prefix) => (Array.isArray(source) ? source : []).map((skill, i) => ({
      ...skill,
      id: skill.id || (prefix + "-skill-" + (i + 1)),
      rank: skill.rank || ("スキル" + i),
      dice: (Array.isArray(skill.dice) ? skill.dice : []).map((die) => ({
        ...die, roll: die.roll || "", d: die.d ?? "", plus: !!die.plus, effect: die.effect || ""
      }))
    }));

    // Use real DB personas as fixture data, not empty placeholder cards. Keep both
    // normal and special identities so sync/original filters and long lists are visible.
    const rosterCandidates = [chosen, ...all.filter(({ p: candidate, mode: candidateMode }) =>
      candidateMode !== mode || String(candidate.no) !== String(p.no)
    )];
    const seenPersonas = new Set();
    const rosterPersonas = rosterCandidates.filter(({ p: candidate, mode: candidateMode }) => {
      const key = candidateMode + ":" + candidate.no;
      if (seenPersonas.has(key)) return false;
      seenPersonas.add(key);
      return true;
    }).slice(0, 8).map(({ p: candidate, mode: candidateMode }, index) => ({
      uid: "ui-audit-persona-" + candidateMode + "-" + candidate.no,
      mode: candidateMode,
      no: candidate.no,
      displayName: candidate.name,
      syncRank: index === 0 ? "000" : index % 2 ? "00" : "0",
      syncMax: index === 0,
      skills: normalizedSkills(candidate.skills, "ui-audit-" + candidateMode + "-" + candidate.no),
      pas: {
        name: candidate.passive_name || "",
        cond: candidate.passive_cond || "",
        always: candidate.passive_always || "",
        effect: candidate.passive_effect || "",
        quick: ""
      },
      pas2: null,
      pas2Enabled: false,
      support: null,
      spirit: null,
      enhancer: null,
      build: null
    }));

    const supports = (DB.support_passives || []).slice(0, 6).map((s, i) => ({
      uid: "ui-audit-support-" + (i + 1), name: s.name, cond: s.cond || "", effect: s.effect || "",
      lp: Number(s.lp) || 0, source: s.source || "core", slot: i < 2 ? "normal" : "library",
      equipped: i < 2, resultId: null, addedAt: now, notes: "Playwright QA sample"
    }));
    const deathSupport = (DB.death_passives || [])[0] || null;
    const egos = (DB.egos || []);
    const egoRanks = ["ZAYIN", "TETH", "HE", "WAW", "ALEPH"];
    const egoByRank = egoRanks.map((rank) => egos.find((e) => e.rank === rank)).filter(Boolean);
    const spirits = (DB.spirits || []).slice(0, 4);
    const enhancementCandidates = [
      (DB.special_enhancements || [])[0],
      (DB.normal_enhancements || [])[0],
      (DB.normal_enhancements || [])[1]
    ].filter(Boolean).map((e, i) => ({
      id: "ui-audit-enh-" + (i + 1), name: e.name, group: e.group || e.category || "common",
      category: e.category || "common", effect: e.effect || "", shards: Number(e.shards) || 0
    }));
    const itemCandidates = (DB.items || []).filter((item) =>
      ["heal-bandage", "heal-hp-ampoule", "heal-hp-bullet"].includes(item.id)
    );
    const inventory = itemCandidates.map((item, i) => ({
      uid: "ui-audit-item-" + (i + 1), itemId: item.id, quantity: i === 0 ? 2 : 1,
      memo: i === 0, palette: true, origin: "ui-audit-sample"
    }));

    const next = {
      schemaVersion: 1,
      charName: "UI監査用キャラクター",
      plName: "Playwright QA",
      imgUrls: "",
      shareImageData: "",
      shareImageBlockedReason: "",
      color: "#c8a84b",
      initiative: 12,
      personaMode: mode,
      personaNo: p.no,
      personaSrc: p,
      syncedManual: true,
      hp: p.hp || 100,
      san: p.san || 50,
      speed: p.speed || "1d8",
      bullets: p.bullets || "4",
      resS: p.res_slash || "抵抗",
      resP: p.res_pierce || "普通",
      resB: p.res_blunt || "弱点",
      pas: {
        name: p.passive_name || "",
        cond: p.passive_cond || "",
        always: p.passive_always || "",
        effect: p.passive_effect || "",
        quick: ""
      },
      pas2Enabled: true,
      pas2: {
        name: "UI監査用追加パッシブ",
        cond: "色欲x1 保有",
        always: "戦闘開始時、保護1を得る",
        effect: "マッチ勝利時、出血1を付与"
      },
      uniqueBuffs: (p.unique_buffs || []).map((b, i) => ({
        id: "ui-audit-buff-" + (i + 1),
        name: b.name || ("固有バフ" + (i + 1)),
        type: b.type || "固有バフ",
        initial: b.initial == null ? 1 : b.initial,
        max: b.max == null ? 3 : b.max,
        desc: b.desc || "Playwright QA sample",
        place: b.place || "status"
      })),
      skills: normalizedSkills(p.skills, "ui-audit-active-" + mode + "-" + p.no),
      supports: supports.slice(0, 2).map((s) => ({ ...s, slot: "normal" })),
      deathSupport,
      inventory,
      initialItems: [],
      customItems: [],
      enhancements: enhancementCandidates,
      roster: {
        personas: rosterPersonas,
        supports,
        egos: egoByRank.map((e, i) => ({
          uid: "ui-audit-ego-" + (i + 1), rank: e.rank, no: e.no, name: e.name,
          analyzed: true, analyzeMax: true, notes: "Playwright QA sample"
        })),
        spirits: spirits.map((s, i) => ({ uid: "ui-audit-spirit-" + (i + 1), name: s.name, source: s.source || "core" }))
      },
      egoSlots: Object.fromEntries(egoByRank.slice(0, 3).map((e) => [e.rank, e])),
      spirit: spirits[0]?.name || "",
      spiritMorale: spirits[0]?.morale_effect || "",
      spiritConfuse: spirits[0]?.confuse_effect || "",
      spiritAlways: spirits[0]?.always_effect || "",
      skillLibrary: [],
      favorites: [mode + ":" + p.no],
      historyRecent: [],
      results: [{
        id: "ui-audit-result-1", name: "UI監査用セッション", date: "2026-10-01",
        income: { lp: 250, shards: 80 }, exchange: { lp: 0, shards: 0 },
        note: "Playwright QA sample record", createdAt: now, updatedAt: now
      }],
      entries: [{
        id: "ui-audit-entry-1", kind: "purchase", name: "包帯",
        cost: { lp: 15, shards: 0 }, resultId: "ui-audit-result-1",
        at: now, note: "Playwright QA sample expense"
      }],
      ui: { codexMode: mode, currentSection: "persona", previewOpen: false }
    };
    const merged = Object.assign({}, A.loadActive() || {}, next);
    const saved = A.saveActive(merged);
    return {
      ok: !!saved,
      persona: p.name,
      mode,
      sample: {
        rosterPersonas: rosterPersonas.length,
        skills: next.skills.length,
        supports: supports.length,
        egos: egoByRank.length,
        spirits: spirits.length,
        inventory: inventory.length,
        enhancements: enhancementCandidates.length,
        results: next.results.length,
        entries: next.entries.length
      }
    };
  });
}
async function boot() {
  await page.goto("http://"+HOST+":"+PORT+"/",{waitUntil:"domcontentloaded",timeout:30000});
  await page.waitForLoadState("networkidle",{timeout:12000}).catch(()=>{});
  await page.waitForTimeout(700);
  if(await visible(page.locator(".acct-gate"))) {
    await snap("account-gate-initial","起動時のSINNER SELECT");
    const add=page.locator(".acct-card--add").first();
    if(await visible(add)) {
      await click(add);
      await snap("account-create-form","新規キャラクター作成フォーム");
      const name=page.locator(".acct-gate input[placeholder='キャラクター名など']").first();
      if(await visible(name)) await name.fill("UI監査用キャラクター");
      const create=page.getByRole("button",{name:"作成して開く",exact:true});
      if(await visible(create)) await click(create);
      await page.waitForTimeout(900);
      if(!(await visible(page.locator(".rail-item").first()))) {
        await snap("account-create-submit-result","作成ボタン押下後、通常画面へ遷移しない場合の診断状態");
        audit.accountCreateDiagnostic=await page.evaluate(()=>{
          const A=window.LBT_accounts;
          return {
            storageAvailable:A?.storageAvailable?.(), accounts:A?.list?.(), activeId:A?.getActiveId?.(),
            gateText:document.querySelector(".acct-gate")?.innerText?.slice(0,1400)||"",
            visibleNotices:[...document.querySelectorAll('[role="alert"],[aria-live="assertive"],.toast,.toast-message')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0;}).map(e=>(e.innerText||"").trim()).filter(Boolean).slice(0,10),
            nameInput:document.querySelector(".acct-gate input[placeholder='キャラクター名など']")?.value||"",
            buttonState:[...document.querySelectorAll(".acct-gate button")].map(b=>({text:(b.innerText||"").trim(),disabled:b.disabled,cls:b.className})).slice(-8)
          };
        });
        const fallback=await page.evaluate(()=>{
          const A=window.LBT_accounts;
          if(!A?.create||!A?.switch)return {ok:false,reason:"account API unavailable"};
          const listing=A.list?.()||{};
          const existing=Array.isArray(listing)?listing:(listing.accounts||[]);
          let entry=existing.find(x=>x.name==="UI監査用キャラクター");
          if(!entry)entry=A.create("UI監査用キャラクター","Playwright UI audit");
          if(!entry)return {ok:false,reason:"account create API returned null",existing:A.list?.()||[]};
          const switched=A.switch(entry.id);
          if(switched)window.dispatchEvent(new CustomEvent("lbt:accounts-entered",{detail:{id:entry.id}}));
          return {ok:!!switched,id:entry.id,switched,accounts:A.list?.()||[]};
        });
        audit.accountCreateFallback=fallback;
        await page.waitForTimeout(500);
      }
    } else if(await visible(page.locator(".acct-card-hit").first())) await click(page.locator(".acct-card-hit").first());
  }
  await page.locator(".rail-item").first().waitFor({state:"visible",timeout:25000});
  const seeded=await seed().catch(e=>({ok:false,reason:String(e)}));
  audit.seed=seeded;
  if(seeded&&seeded.ok) {
    // Reload to prove the fixture survives persistence. AccountGate is shown on
    // every visit, so wait for it explicitly before selecting the fixture account.
    await page.reload({waitUntil:"domcontentloaded"});
    await page.waitForLoadState("networkidle",{timeout:12000}).catch(()=>{});
    const gate=page.locator(".acct-gate").first();
    await gate.waitFor({state:"visible",timeout:15000}).catch(()=>{});
    if(await visible(gate)) {
      // Match the card (which contains the account name), then click its transparent hit area.
      // Filtering .acct-card-hit itself by text is unreliable because that button is intentionally blank.
      const card=page.locator(".acct-card--gate").filter({hasText:"UI監査用キャラクター"}).first();
      const hit=card.locator(".acct-card-hit").first();
      if(await visible(hit)) await click(hit).catch(()=>{});
      await page.waitForTimeout(350);
      // Fallback is scoped to the current active account and only affects this disposable context.
      if(await visible(gate)) {
        const activeId=await page.evaluate(()=>window.LBT_accounts?.getActiveId?.()||null);
        if(activeId) await page.evaluate((id)=>window.dispatchEvent(new CustomEvent("lbt:accounts-entered",{detail:{id}})),activeId);
      }
    }
    try {
      await page.locator(".rail-item").first().waitFor({state:"visible",timeout:15000});
    } catch(error) {
      await snap("account-gate-reload-diagnostic","保存済みの監査用キャラクターを選び直した後の起動診断");
      audit.accountGateReloadDiagnostic=await page.evaluate(()=>({
        gateVisible:!!document.querySelector(".acct-gate"),
        gateText:document.querySelector(".acct-gate")?.innerText?.slice(0,800)||"",
        activeId:window.LBT_accounts?.getActiveId?.()||null,
        accounts:window.LBT_accounts?.list?.()||null,
        railCount:document.querySelectorAll(".rail-item").length,
        appText:(document.querySelector("#root")?.innerText||"").slice(0,1200)
      }));
      throw new Error("保存済みアカウント選択後に本体ナビゲーションが表示されません: "+String(error?.message||error));
    }
  }
  await page.waitForTimeout(350);
}
async function captureProfile(browser, mode) {
  view=mode;
  const mobile=mode==="mobile";
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},deviceScaleFactor:mobile?2:1,isMobile:mobile,hasTouch:mobile,serviceWorkers:"block",colorScheme:"dark",reducedMotion:"reduce"});
  page=await context.newPage();
  page.setDefaultTimeout(5000);
  // Cloudflare Web Analytics points at /cdn-cgi/rum, which intentionally does not exist
  // on this localhost-only screenshot server. Block it so the capture log only reports app errors.
  await page.route("**/cdn-cgi/rum**", (route) => route.abort("blockedbyclient"));
  page.on("console",m=>{if(m.type()==="error")audit.consoleErrors.push({view:mode,message:m.text().slice(0,160)});});
  page.on("response",response=>{if(response.status()>=400 && !response.url().includes("/cdn-cgi/rum?"))audit.httpErrors.push({view:mode,status:response.status(),url:response.url().slice(0,240)});});
  page.on("pageerror",e=>audit.pageErrors.push({view:mode,message:e.message.slice(0,160)}));
  try {
    await boot();
    const previewToggle=page.locator("#lbt-preview-edge-toggle").first();
    if(await visible(previewToggle)) {
      await previewToggle.hover().catch(()=>{});
      await snap("preview-toggle-hover","画面右端のプレビュー開閉タブのホバー");
      await click(previewToggle);
      await snap("preview-toggled-open","プレビュー開閉タブを押して開いた状態");
      const movedToggle=page.locator("#lbt-preview-edge-toggle").first();
      if(await visible(movedToggle)) { await movedToggle.hover().catch(()=>{}); await snap("preview-toggle-open-hover","プレビューを開いた状態で開閉タブをホバー"); await click(movedToggle); await snap("preview-toggled-closed","プレビューを再度閉じた状態"); }
    }
    await snap("build-persona-default","ビルドの初期表示。専用の使い捨てデータを使用");
    const tabs=page.locator(".build-tabs [role='tab']");
    const count=await tabs.count();
    for(let i=0;i<count;i++) {
      const tab=tabs.nth(i), label=(await tab.innerText()).trim();
      await attempt("build-tab-"+label,async()=>{
        if (!mobile) {
          await tab.hover().catch(()=>{});
          await snap("build-tab-hover-"+label,"デスクトップ：ビルド内"+label+"タブのホバー状態");
        }
        await click(tab);
        await snap("build-tab-"+label,"ビルド内の"+label+"タブ");
        if(label==="人格") {
          const rosterToggle=page.locator(".pw-listbar-toggle").first();
          if(await visible(rosterToggle)) { await click(rosterToggle); await snap("persona-list-expanded","PERSONA LISTを展開した状態"); }
          const cardHit=page.locator(".p-card-hit").first();
          if(await visible(cardHit)) {
            await cardHit.hover().catch(()=>{});
            await snap("persona-card-hover","人格カードにマウスを合わせた状態");
            await click(cardHit);
            await snap("persona-card-selected","人格カードを選択し詳細を表示した状態");
            /* 詳細ダイアログが開いたままだと後続タブを覆うため、撮影後は明示的に閉じる。 */
            const closeDetail=page.locator(".detail-dialog-close").last();
            if(await visible(closeDetail)) await click(closeDetail);
            else if(await visible(page.locator(".detail-dialog-backdrop"))) {
              await page.keyboard.press("Escape").catch(()=>{});
              await page.waitForTimeout(250);
            }
            if(await visible(page.locator(".detail-dialog-backdrop"))) throw new Error("人格詳細の撮影後にダイアログを閉じられません");
          }
          const imp=page.locator(".pw-listbar-actions .persona-draft-import-trigger").first();
          if(await visible(imp)) {
            await click(imp);
            await snap("persona-text-import-dialog","人格テキスト流し込みの入口（区分入力）");
            const rawTab=page.getByRole("tab",{name:"一括テキストを貼り付け",exact:true});
            if(await visible(rawTab)) { await click(rawTab); await snap("persona-import-raw-mode","一括テキスト貼り付けへ切り替えた状態"); }
            const glassTab=page.getByRole("tab",{name:"硝子窓URLから移行",exact:true});
            if(await visible(glassTab)) { await click(glassTab); await snap("persona-import-garasumado-mode","硝子窓URL取り込みへ切り替えた状態"); }
            await closeOverlay();
          }
        }
        if(label==="サポート") {
          for(const sel of [".support-card",".support-row",".support-item",".p-card","[class*='support-passive']"]) {
            const item=page.locator(sel).first();
            if(await visible(item)) { await item.hover().catch(()=>{}); await snap("support-passive-hover","サポート候補のホバー状態"); break; }
          }
        }
      });
    }
    for(const label of ["駒整形","ショップ","記録","設定","使い方"]) {
      await attempt("section-"+label,async()=>{
        const navHover = page.locator(".rail-item").filter({hasText:label}).first();
        if (!mobile && await visible(navHover)) {
          await navHover.hover().catch(()=>{});
          await snap("navigation-hover-"+label,"デスクトップ：主ナビゲーション「"+label+"」のホバー状態");
        }
        await go(label);
        await snap("section-"+label,"主要セクション: "+label);
        if(label==="ショップ") {
          const tabsShop=page.locator(".shop-tabs [role='tab']");
          const n=Math.min(await tabsShop.count(),8);
          for(let i=0;i<n;i++) {
            const t=tabsShop.nth(i), text=(await t.innerText().catch(()=>"")).trim();
            if(text) await attempt("shop-tab-"+text,async()=>{await click(t);await snap("shop-tab-"+text,"ショップ分類: "+text);});
          }
        }
        if(label==="記録") {
          const toggle=page.locator(".ledger-import-toggle").first();
          if(!(await visible(toggle))) throw new Error("「記録 > リザルトを記録 > 取り込む」ボタンが見つかりません");
          await click(toggle);
          await snap("record-import-menu","記録の取り込みメニュー（3つの入口）");

          const textButton=page.locator(".ledger-import-menu button").filter({hasText:/^テキスト流し込み$/}).first();
          if(!(await visible(textButton))) throw new Error("リザルトのテキスト流し込みメニュー項目が表示されません");
          await click(textButton);
          // The current UI renders import tools as .ledger-gara-wrap blocks;
          // it does not assign the former #ledger-text-import-panel id.
          const textPanel=page.locator(".ledger-gara-wrap").filter({hasText:"テキスト流し込み"}).last();
          await textPanel.waitFor({state:"visible",timeout:5000});
          const textArea=textPanel.locator("textarea.ledger-textarea").first();
          await textArea.waitFor({state:"visible",timeout:5000});
          const textState=await textPanel.evaluate((el)=> {
            const r=el.getBoundingClientRect();
            const input=el.querySelector("textarea.ledger-textarea");
            const ir=input?.getBoundingClientRect();
            return {panelTop:Math.round(r.top),panelBottom:Math.round(r.bottom),inputTop:ir?Math.round(ir.top):null,inputFocused:document.activeElement===input,viewportHeight:innerHeight};
          });
          if(textState.panelTop >= textState.viewportHeight - 24 || textState.inputTop === null || textState.inputTop >= textState.viewportHeight - 36) {
            throw new Error("テキスト流し込みを開いた後も入力欄が画面内へ移動していません: "+JSON.stringify(textState));
          }
          await snap("record-result-text-import","テキスト流し込みを開き、自動スクロール後の入力欄が見える状態");
          await textArea.fill("【シナリオA】\n報酬｜LP:150/自我の欠片:70/人格抽出チケットx1\n購入｜人格抽出x2(100LP)/EGO購入-TETH[鬼退治](75欠片)\n追加購入｜壊し砕く打撃(150LP)");
          await page.waitForTimeout(250);
          await snap("record-result-text-import-preview","例文を入力し、解析結果・候補を確認する状態（確定しない）");
          const closeText= textPanel.getByRole("button",{name:"閉じる",exact:true}).first();
          if(!(await visible(closeText))) throw new Error("テキスト流し込みを閉じるボタンがありません");
          await click(closeText);

          if(await visible(toggle)) await click(toggle);
          const glass=page.locator(".ledger-import-menu button").filter({hasText:"硝子窓から一括取り込む"}).first();
          if(!(await visible(glass))) throw new Error("硝子窓から一括取り込む入口が表示されません");
          await click(glass);
          const glassPanel=page.locator("#ledger-glass-import-panel");
          await glassPanel.waitFor({state:"visible",timeout:5000});
          const glassMetrics=await glassPanel.evaluate((el)=>({top:Math.round(el.getBoundingClientRect().top),height:Math.round(el.getBoundingClientRect().height),viewportHeight:innerHeight}));
          if(glassMetrics.top >= glassMetrics.viewportHeight - 40) throw new Error("硝子窓取り込みパネルが画面内へスクロールされません: "+JSON.stringify(glassMetrics));
          await snap("record-result-glass-import","硝子窓から一括取り込むパネルを開いた状態（適用しない）");
          const closeGlass=glassPanel.getByRole("button",{name:"閉じる",exact:true}).first();
          if(await visible(closeGlass)) await click(closeGlass);

          if(await visible(toggle)) await click(toggle);
          const roster=page.locator(".ledger-import-menu button").filter({hasText:/所持人格リストを取り込む/}).first();
          if(!(await visible(roster))) throw new Error("所持人格リスト取り込みの入口が表示されません");
          await click(roster);
          const held=page.locator(".ledger-held-paste").first();
          await held.waitFor({state:"visible",timeout:5000});
          const heldRect=await held.boundingBox();
          if(!heldRect || heldRect.y >= (page.viewportSize()?.height||844)-36) throw new Error("所持人格リストの入力欄が画面内へスクロールされません");
          await snap("record-roster-import","所持人格リストの入力欄が見える状態（保存しない）");
          const heldPanel=page.locator(".ledger-gara-wrap").filter({has:held}).last();
          const heldClose=heldPanel.getByRole("button",{name:"閉じる",exact:true}).first();
          if(await visible(heldClose)) await click(heldClose);
        }
        if(label==="使い方") {
          const search=page.locator("#guide-search-input").first();
          if(await visible(search)) {
            await search.fill("アカウント"); await snap("help-search-results","使い方ガイド内検索");
            const first=page.locator(".guide-index-toggle").filter({hasText:/アカウント/}).first();
            if(await visible(first)) { await click(first); await snap("help-expanded-entry","使い方の詳細を展開"); }
          }
        }
      });
    }
    await attempt("quick-search",async()=>{
      const b=page.locator(".topbar-search").first(); if(await visible(b)) await click(b);
      const input=page.locator(".cp-input").first();
      if(await visible(input)) { await snap("quick-search-empty","クイック検索を開く"); await input.fill("人格"); await snap("quick-search-results","検索語を入力した状態"); await closeOverlay(); }
    });
    await attempt("topbar-hover",async()=>{
      const search=page.locator(".topbar-search").first();
      if(await visible(search)) { await search.hover(); await snap("topbar-search-hover","クイック検索ボタンのホバー"); }
      const buttons=page.locator(".topbar-actions button"), n=Math.min(await buttons.count(),5);
      for(let i=0;i<n;i++) { const b=buttons.nth(i); if(await b.isVisible()) { await b.hover().catch(()=>{}); const label=(await b.getAttribute("aria-label"))||(await b.getAttribute("title"))||("button-"+i); await snap("topbar-hover-"+label,"上部操作ボタンのホバー"); } }
    });
    await attempt("utility-sheet",async()=>{
      const trigger=page.locator("button.utility-trigger").first(); if(await visible(trigger)) await click(trigger);
      await snap("utility-sheet-open","操作・保存シート");
      const actions=page.locator(".utility-sheet-action"), n=Math.min(await actions.count(),8);
      for(let i=0;i<n;i++) { const a=actions.nth(i); if(await a.isVisible()) { await a.hover().catch(()=>{}); await snap("utility-hover-"+(await a.innerText()).trim(),"操作・保存シート内のホバー"); } }

      // The share action opens an in-page chooser before any new tab is opened.
      const share=page.locator(".utility-sheet-action").filter({hasText:"共有シートを開く"}).first();
      if(await visible(share)) {
        await click(share);
        const shareDialog=page.locator("#lbt-share-modal-root .share-modal").first();
        await shareDialog.waitFor({state:"visible",timeout:5000});
        await snap("share-publish-methods","共有シートの方法選択ダイアログ");
        const shareOptions=page.locator("#lbt-share-modal-root .share-opt");
        const shareCount=Math.min(await shareOptions.count(),3);
        for(let i=0;i<shareCount;i++) {
          const opt=shareOptions.nth(i);
          await opt.hover().catch(()=>{});
          await snap("share-method-hover-"+(await opt.innerText()).trim().slice(0,24),"共有方法のホバー状態");
        }
        // “自分だけプレビュー” opens a blob: HTML tab without publishing or copying a URL.
        const originalPage=page;
        const popupPromise=context.waitForEvent("page",{timeout:6500}).catch(()=>null);
        const localPreview=page.locator("#lbt-share-modal-root [data-act=tab]").first();
        if(await visible(localPreview)) await click(localPreview);
        const popup=await popupPromise;
        if(popup) {
          await popup.waitForLoadState("domcontentloaded",{timeout:10000}).catch(()=>{});
          await popup.waitForTimeout(500);
          page=popup;
          await snap("share-html-preview","共有方法から新規タブで開いた自己確認用HTML");
          page=originalPage;
          await popup.close().catch(()=>{});
        } else {
          page=originalPage;
          audit.failures.push({name:"share-html-preview",error:"共有方法の「新規タブで自分だけプレビュー」から別タブを検出できませんでした"});
        }
      }
      await closeOverlay();
    });
    await attempt("other-navigation",async()=>{
      const more=page.locator(".rail-more").first();
      if(await visible(more)) {
        await click(more);
        await snap("other-navigation-sheet","ナビゲーションの「その他」から開いたシート");
        await closeOverlay();
      }
    });
    await attempt("disclaimer",async()=>{
      const t=page.locator(".brand-author").first(); if(await visible(t)) await click(t);
      const dialog=page.locator('[role="dialog"]').filter({hasText:/免責|名称|権利/}).first();
      if(await visible(dialog)) await snap("disclaimer-dialog","作者名から開く免責事項");
      await closeOverlay();
    });
    await attempt("account-management",async()=>{
      await page.evaluate(()=>window.dispatchEvent(new Event("lbt:open-accounts")));
      await page.waitForTimeout(250); await snap("account-management-list","アカウント管理の一覧");
      const edit=page.locator(".acct-card-actions .acct-edit-btn").first();
      if(await visible(edit)) {
        await click(edit); await snap("account-edit-form","アカウント編集フォーム");
        const toggle=page.locator(".acct-import-toggle").first();
        if(await visible(toggle)) { await click(toggle); await snap("account-share-url-import","共有URLから取り込む入口"); }
      }
      await closeOverlay();
    });
    await attempt("state-import-dialog",async()=>{
      await closeOverlay();
      const trigger=page.locator("button.utility-trigger").first(); if(await visible(trigger)) await click(trigger);
      const importAction=page.locator(".utility-sheet-action").filter({hasText:"保存データを読み込む"}).first();
      if(await visible(importAction)) {
        await click(importAction);
        const input=page.locator('input[type="file"][accept="application/json"]').first();
        if(await input.count()) {
          await input.setInputFiles({name:"ui-audit-import.json",mimeType:"application/json",buffer:Buffer.from(JSON.stringify({schemaVersion:5,charName:"読み込み確認用",plName:"UI QA"}),"utf8")});
          await page.waitForTimeout(300);
          if(await visible(page.locator(".share-modal-backdrop"))) {
            await snap("state-import-scope-dialog","読み込むカテゴリを選ぶ確認画面。適用しない");
            const emptyDetails=page.locator(".import-scope-empty-categories > summary").first();
            if (await visible(emptyDetails)) {
              await click(emptyDetails);
              await snap("state-import-empty-categories-expanded","確認ダイアログでデータのないカテゴリ一覧を任意に展開した状態。適用しない");
            }
          }
        }
      }
      await closeOverlay();
    });
    await attempt("keyboard-focus",async()=>{await page.keyboard.press("Tab");await snap("keyboard-focus-visible","キーボードTabで移動したフォーカス状態");});
  } finally { await context.close(); }
}
async function main() {
  fs.mkdirSync(OUT,{recursive:true});
  const s=makeServer();
  await new Promise((resolve,reject)=>{s.once("error",reject);s.listen(PORT,HOST,resolve);});
  const browser=await chromium.launch({headless:true});
  try { for(const mode of ["desktop","mobile"]) {log("begin "+mode);await captureProfile(browser,mode);} }
  finally { await browser.close();await new Promise(resolve=>s.close(resolve)); }
  audit.count=audit.screenshots.length;
  audit.coverage=["SINNER SELECT/new-account form","all eight build tabs and desktop tab-hover states","major navigation sections and desktop navigation-hover states","all six shop category tabs","record import menu and routes with result parsing preview","share method dialog and local HTML preview","help search and expanded entry","quick search","topbar and sheet hover","disclaimer dialog","account manager/edit/share import","save-state import scope dialog and optional empty-category expansion","keyboard focus","viewport overflow, duplicate preview controls, and target-size diagnostics"];
  const requiredNotes=[
    "ビルド内の人格タブ","ビルド内のスキルタブ","ビルド内のパッシブタブ","ビルド内の強化タブ","ビルド内のサポートタブ","ビルド内のE.G.Oタブ","ビルド内の精神タブ","ビルド内のアイテムタブ",
    "ショップ分類: 人格","ショップ分類: サポート","ショップ分類: E.G.O","ショップ分類: 精神","ショップ分類: アイテム","ショップ分類: ガチャ",
    "記録の取り込みメニュー（3つの入口）",
    "テキスト流し込みを開き、自動スクロール後の入力欄が見える状態",
    "例文を入力し、解析結果・候補を確認する状態（確定しない）",
    "硝子窓から一括取り込むパネルを開いた状態（適用しない）",
    "所持人格リストの入力欄が見える状態（保存しない）",
    "確認ダイアログでデータのないカテゴリ一覧を任意に展開した状態。適用しない",
    "クイック検索を開く","操作・保存シート",
    "共有シートの方法選択ダイアログ","共有方法から新規タブで開いた自己確認用HTML",
    "共有URLから取り込む入口","読み込むカテゴリを選ぶ確認画面。適用しない"
  ];
  audit.missingRequiredCaptures=[];
  for (const mode of ["desktop","mobile"]) {
    for (const note of requiredNotes) {
      if (!audit.screenshots.some((shot)=>shot.name.startsWith(mode+"-") && shot.note.includes(note))) {
        audit.missingRequiredCaptures.push({view:mode,note});
      }
    }
  }
  audit.criticalLayoutWarnings=audit.layoutWarnings.filter((item)=>["document-horizontal-overflow","duplicate-preview-controls","preview-toggle-overlaps-header","preview-toggle-overlaps-panel-controls","preview-toggle-overlaps-content-dock"].includes(item.type));
  fs.writeFileSync(path.join(OUT,"manifest.json"),JSON.stringify(audit,null,2)+"\n");
  log("finished: "+audit.count+" screenshots; failures="+audit.failures.length+"; missing-required="+audit.missingRequiredCaptures.length+"; critical-layout-warnings="+audit.criticalLayoutWarnings.length);
  if(audit.count<80 || audit.failures.length || audit.missingRequiredCaptures.length || audit.pageErrors.length || audit.httpErrors.length || audit.consoleErrors.length || audit.criticalLayoutWarnings.length) process.exitCode=1;
}
main().catch(e=>{console.error("[ui-audit] fatal: "+(e&&e.stack||String(e)));process.exitCode=1;});
