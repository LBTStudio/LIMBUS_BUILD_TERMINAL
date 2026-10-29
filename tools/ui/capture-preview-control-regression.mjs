#!/usr/bin/env node
/* Focused visual regression for the single preview expand/collapse control. */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = path.resolve(ROOT, "artifacts/preview-control-regression");
const HOST = "127.0.0.1";
const PORT = 4175;
const MIME = { ".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8", ".css":"text/css; charset=utf-8", ".json":"application/json; charset=utf-8", ".svg":"image/svg+xml", ".png":"image/png", ".webp":"image/webp", ".woff2":"font/woff2" };
const results = { generatedAt:new Date().toISOString(), screenshots:[], checks:[], failures:[] };
const profiles = [
  {name:"desktop",width:1440,height:1000,mobile:false},
  {name:"tablet",width:1024,height:768,mobile:false},
  {name:"mobile-portrait",width:390,height:844,mobile:true},
  {name:"mobile-small",width:360,height:800,mobile:true},
  {name:"phone-landscape",width:844,height:390,mobile:false}
];
const server = http.createServer((req,res)=>{
  let pathname;
  try { pathname=decodeURIComponent(new URL(req.url||"/","http://"+HOST).pathname); }
  catch { res.writeHead(400).end("Bad request"); return; }
  if(pathname==="/") pathname="/index.html";
  const file=path.resolve(ROOT,"."+pathname);
  if(file!==ROOT && !file.startsWith(ROOT+path.sep)){res.writeHead(403).end("Forbidden");return;}
  fs.stat(file,(err,stat)=>{
    if(err||!stat.isFile()){res.writeHead(404).end("Not found");return;}
    res.writeHead(200,{"content-type":MIME[path.extname(file).toLowerCase()]||"application/octet-stream","cache-control":"no-store","x-content-type-options":"nosniff"});
    fs.createReadStream(file).pipe(res);
  });
});
function recordCheck(name,ok,detail={}) {
  results.checks.push({name,ok,...detail});
  if(!ok) results.failures.push({name,...detail});
}
async function visible(locator) {
  try { return await locator.count()>0 && await locator.first().isVisible(); } catch { return false; }
}
async function rect(locator) {
  if(!await visible(locator)) return null;
  return await locator.first().evaluate(el=>{const r=el.getBoundingClientRect();return{x:+r.x.toFixed(1),y:+r.y.toFixed(1),width:+r.width.toFixed(1),height:+r.height.toFixed(1),right:+r.right.toFixed(1),bottom:+r.bottom.toFixed(1)};});
}
function intersects(a,b) {
  if(!a||!b)return {hit:false,width:0,height:0};
  const width=Math.max(0,Math.min(a.right,b.right)-Math.max(a.x,b.x));
  const height=Math.max(0,Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y));
  return {hit:width>4&&height>4,width:+width.toFixed(1),height:+height.toFixed(1)};
}
async function metrics(page,profile) {
  const toggleSelector=profile.mobile?".preview-mobile-toggle":"#lbt-preview-edge-toggle";
  const toggle=page.locator(toggleSelector);
  const panel=page.locator("#preview-panel");
  const t=await rect(toggle), p=await rect(panel);
  const actions=await rect(page.locator(".preview-actions"));
  const hint=await rect(page.locator(".preview-hint"));
  const tabs=await rect(page.locator(".preview-tabs"));
  const rail=await rect(page.locator(".rail"));
  const title=await rect(page.locator(".section-title-row"));
  const heading=await rect(page.locator(".section-title"));
  const headingLayout=await page.locator(".section-title").evaluate(el=>{
    const style=getComputedStyle(el);
    const range=document.createRange();
    range.selectNodeContents(el);
    const rects=[...range.getClientRects()].filter(r=>r.width>0&&r.height>0);
    const lines=[...new Set(rects.map(r=>Math.round(r.y)))];
    return {fontSize:Number.parseFloat(style.fontSize)||0,lineCount:lines.length,lineYs:lines};
  }).catch(()=>({fontSize:0,lineCount:0,lineYs:[]}));
  const focus=await rect(page.locator(".focus"));
  const focusPaddingBottom=await page.locator(".focus").evaluate(el=>Number.parseFloat(getComputedStyle(el).paddingBottom)||0).catch(()=>0);
  return {
    viewport:page.viewportSize(),
    toggleCount:await toggle.count(),
    toggleLabel:await toggle.getAttribute("aria-label"),
    expanded:await toggle.getAttribute("aria-expanded"),
    controls:await toggle.getAttribute("aria-controls"),
    legacyReopenCount:await page.locator(".preview-reopen").count(),
    legacyCloseCount:await page.locator(".preview-close").count(),
    panelOpen:await panel.evaluate(el=>el.classList.contains("is-open")).catch(()=>false),
    toggle:t,panel:p,actions,hint,tabs,rail,title,heading,headingLayout,focus,focusPaddingBottom,
    overlaps:{
      footer:intersects(t,actions),
      hint:intersects(t,hint),
      tabs:intersects(t,tabs),
      rail:intersects(t,rail),
      sectionTitle:intersects(t,title)
    },
    horizontalOverflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2)
  };
}
async function createDisposableAccount(page,profile) {
  const profileName=profile.name;
  await page.goto("http://"+HOST+":"+PORT+"/",{waitUntil:"domcontentloaded",timeout:30000});
  await page.waitForLoadState("networkidle",{timeout:12000}).catch(()=>{});
  const gate=page.locator(".acct-gate").first();
  if(await visible(gate)) {
    const add=page.locator(".acct-card--add").first();
    if(await visible(add)) {
      await add.click({timeout:5000});
      const name=page.locator(".acct-gate input[placeholder='キャラクター名など']").first();
      await name.waitFor({state:"visible",timeout:5000});
      await name.fill("Preview control QA "+profileName);
      await page.getByRole("button",{name:"作成して開く",exact:true}).click({timeout:5000});
    } else {
      const existing=page.locator(".acct-card-hit").first();
      await existing.click({timeout:5000});
    }
  }
  // B-type opens on its command launcher; explicitly selecting Home keeps the capture deterministic.
  const homeNav = page.locator(".rail-item[title='ホーム']");
  await homeNav.waitFor({ state: "visible", timeout: 10000 });
  await homeNav.click();
  await page.locator(".btype-command-hero").waitFor({ state: "visible", timeout: 10000 });
  const homePath = path.join(OUT, profile.name + "-btype-home.png");
  await page.screenshot({ path: homePath, animations: "disabled" });
  results.screenshots.push({ file: path.relative(ROOT, homePath), profile: profile.name, state: "btype-home" });
  // Assert current branding before entering the Build editor; prevents stale Workbench screenshots.
  const buildNav = page.locator(".rail-item[title='ワークベンチ']");
  const oldBuildNav = page.locator(".rail-item[title='ビルド']");
  const homeEyebrow = (await page.locator(".btype-eyebrow").textContent().catch(() => "") || "").trim();
  const homeAction = (await page.locator(".btype-continue-panel").innerText().catch(() => "") || "").trim();
  const buildBrandingOk = await buildNav.count() === 1
    && await buildNav.isVisible()
    && await oldBuildNav.count() === 0
    && homeEyebrow === "HOME / MULTI-PURPOSE LAUNCHER"
    && homeAction.includes("ワークベンチを開く");
  recordCheck(profile.name + ": B-type launcher and workbench labels match the approved prototype",
    buildBrandingOk, { buildNavCount: await buildNav.count(), oldBuildNavCount: await oldBuildNav.count(), homeEyebrow, homeAction });
  await buildNav.waitFor({state:"visible",timeout:10000});
  await buildNav.click();
  await page.getByLabel("キャラクター名").fill("サンプル・フィクサー");
  await page.getByLabel("プレイヤー名").fill("テスト卓");
  await page.getByLabel("駒の行動順").fill("12");
  await page.getByLabel("駒の色（16進数）").fill("#697887");
  const imageDetails = page.locator("details.pc-edit");
  await imageDetails.locator("summary").click();
  await imageDetails.locator("textarea").fill("http://"+HOST+":"+PORT+"/tests/fixtures/ccfolia-preview-sample.svg");
  await page.waitForTimeout(200);
  await page.locator(profile.mobile?".preview-mobile-toggle":"#lbt-preview-edge-toggle").waitFor({state:"visible",timeout:10000});
}
async function runProfile(browser,profile) {
  const context=await browser.newContext({
    viewport:{width:profile.width,height:profile.height},
    deviceScaleFactor:profile.mobile?2:1,
    isMobile:profile.mobile,
    hasTouch:profile.mobile,
    serviceWorkers:"block",
    colorScheme:"dark",
    reducedMotion:"reduce"
  });
  const page=await context.newPage();
  page.setDefaultTimeout(5000);
  await page.route("**/cdn-cgi/rum**",route=>route.abort("blockedbyclient"));
  const pageErrors=[];
  page.on("pageerror",e=>pageErrors.push(e.message));
  try {
    await createDisposableAccount(page,profile);
    const buildOverviewPath = path.join(OUT, profile.name + "-build-overview.png");
    await page.screenshot({ path: buildOverviewPath, animations: "disabled" });
    results.screenshots.push({ file: path.relative(ROOT, buildOverviewPath), profile: profile.name, state: "build-overview" });
    /* Capture the actual Build > Basic status editor, not a separate or mocked sample. */
    const statusPanel = page.locator(".settings-order-embedded").first();
    const statusTitle = statusPanel.locator(".settings-status-workspace-head .t-label");
    await statusTitle.evaluate(el => el.scrollIntoView({ block: "start", inline: "nearest", behavior: "auto" }));
    await page.locator(".focus").evaluate(el => {
      const title = el.querySelector(".settings-order-embedded .settings-status-workspace-head .t-label");
      if (!title) return;
      const desiredTop = el.getBoundingClientRect().top + (innerWidth <= 640 ? 150 : 112);
      el.scrollTop = Math.max(0, el.scrollTop + title.getBoundingClientRect().top - desiredTop);
    });
    await page.waitForTimeout(100);
    const statusRows = statusPanel.locator(".status-order-row");
    const statusInputs = statusPanel.locator("input");
    const reorderControls = statusPanel.locator(".status-order-row .reorder-btn");
    const dragHandles = statusPanel.locator(".status-order-row .status-order-handle");
    const statusEditor = {
      panelCount: await page.locator(".settings-order-embedded").count(),
      title: (await statusTitle.textContent().catch(() => "") || "").trim(),
      rowCount: await statusRows.count(),
      inputCount: await statusInputs.count(),
      reorderCount: await reorderControls.count(),
      dragHandleCount: await dragHandles.count(),
      viewport: page.viewportSize()
    };
    const statusEditorOk = statusEditor.panelCount === 1
      && statusEditor.title === "ステータス一覧・編集・出力順"
      && statusEditor.rowCount >= 3
      && statusEditor.inputCount >= 2
      && statusEditor.reorderCount >= 2
      && statusEditor.dragHandleCount >= 1;
    recordCheck(profile.name + ": Build status list exposes editing and emitted-order controls",
      statusEditorOk, statusEditor);
    const statusPath = path.join(OUT, profile.name + "-build-status-editor.png");
    await page.screenshot({ path: statusPath, animations: "disabled" });
    results.screenshots.push({ file: path.relative(ROOT, statusPath), profile: profile.name, state: "build-status-editor" });
    await page.locator(".focus").evaluate(el => { el.scrollTop = 0; });
    await page.waitForTimeout(80);
    const toggle=page.locator(profile.mobile?".preview-mobile-toggle":"#lbt-preview-edge-toggle");
    const initial=await metrics(page,profile);
    recordCheck(profile.name+": one React toggle, no legacy controls",
      initial.toggleCount===1&&initial.legacyReopenCount===0&&initial.legacyCloseCount===0&&initial.controls==="preview-panel",
      {metrics:initial});
    if(initial.expanded==="true") await toggle.click();
    await page.waitForTimeout(220);
    const closed=await metrics(page,profile);
    recordCheck(profile.name+": closed state is synchronized",
      closed.expanded==="false"&&!closed.panelOpen,
      {metrics:closed});
    const closedCollisions=Object.entries(closed.overlaps).filter(([key,value])=>["footer","hint","tabs","rail","sectionTitle"].includes(key)&&value.hit);
    recordCheck(profile.name+": closed toggle avoids preview actions, tabs, hints, headings and navigation",
      closedCollisions.length===0,
      {collisions:closedCollisions,metrics:closed});
    if(profile.width>=641&&profile.width<=1024) {
      const expectedDock=profile.height<=500?48:60;
      const dockBottom=closed.rail&&closed.viewport&&closed.rail.width>=closed.viewport.width-8?closed.rail.y:closed.focus?.bottom;
      const horizontalRail=!!closed.rail&&!!closed.viewport&&closed.rail.width>=closed.viewport.width-8;
      const toggleAboveNavigation=!horizontalRail||(!!closed.toggle&&closed.toggle.bottom<=closed.rail.y-4);
      recordCheck(profile.name+": collapsed tablet/landscape control uses a reserved dock",
        closed.focusPaddingBottom>=expectedDock&&toggleAboveNavigation,
        {requiredPadding:expectedDock,focusPaddingBottom:closed.focusPaddingBottom,focusBottom:closed.focus?.bottom,dockBottom,horizontalRail,toggleAboveNavigation,toggle:closed.toggle,rail:closed.rail});
    }
    if(profile.mobile&&profile.height>profile.width) {
      const focusSeparated=!!closed.focus&&!!closed.toggle&&closed.toggle.bottom<=closed.focus.y+4;
      const navSeparated=!!closed.rail&&!!closed.toggle&&closed.toggle.bottom<=closed.rail.y-4;
      recordCheck(profile.name+": collapsed content viewport reserves the toggle dock",
        focusSeparated&&navSeparated,
        {focusBottom:closed.focus?.bottom,toggleTop:closed.toggle?.y,toggleBottom:closed.toggle?.bottom,railTop:closed.rail?.y});
    }
    const closedPath=path.join(OUT,profile.name+"-closed.png");
    await page.screenshot({path:closedPath,animations:"disabled"});
    results.screenshots.push({file:path.relative(ROOT,closedPath),profile:profile.name,state:"closed",metrics:closed});

    await toggle.click();
    await page.waitForTimeout(300);
    const opened=await metrics(page,profile);
    const commonOk=opened.expanded==="true"&&opened.panelOpen;
    recordCheck(profile.name+": open state is synchronized",commonOk,{metrics:opened});
    const controlCollisions=Object.entries(opened.overlaps).filter(([key,value])=>["footer","hint","tabs","rail","sectionTitle"].includes(key)&&value.hit);
    recordCheck(profile.name+": toggle does not overlap preview actions, tabs, hints, headings or navigation",
      controlCollisions.length===0,
      {collisions:controlCollisions,metrics:opened});
    if(profile.width>=641&&profile.width<=1024) {
      const expectedDock=profile.height<=500?48:60;
      const dockBottom=opened.rail&&opened.viewport&&opened.rail.width>=opened.viewport.width-8?opened.rail.y:opened.focus?.bottom;
      const horizontalRail=!!opened.rail&&!!opened.viewport&&opened.rail.width>=opened.viewport.width-8;
      const toggleAboveNavigation=!horizontalRail||(!!opened.toggle&&opened.toggle.bottom<=opened.rail.y-4);
      recordCheck(profile.name+": open tablet/landscape control uses a reserved dock",
        opened.focusPaddingBottom>=expectedDock&&toggleAboveNavigation,
        {requiredPadding:expectedDock,focusPaddingBottom:opened.focusPaddingBottom,focusBottom:opened.focus?.bottom,dockBottom,horizontalRail,toggleAboveNavigation,toggle:opened.toggle,rail:opened.rail});
    }
    if(profile.mobile&&profile.height>profile.width) {
      const panelSeparated=!!opened.panel&&!!opened.toggle&&opened.toggle.bottom<=opened.panel.y+4;
      const navSeparated=!!opened.rail&&!!opened.toggle&&opened.toggle.bottom<=opened.rail.y-4;
      recordCheck(profile.name+": open preview footer and toggle have a separate dock",panelSeparated&&navSeparated,
        {panelBottom:opened.panel?.bottom,toggleTop:opened.toggle?.y,toggleBottom:opened.toggle?.bottom,railTop:opened.rail?.y,gapFromPanel:opened.toggle&&opened.panel?opened.toggle.y-opened.panel.bottom:null});
    }
    if(profile.mobile&&profile.height>profile.width) {
      recordCheck(profile.name+": mobile section title has no orphaned line",!!opened.headingLayout&&opened.headingLayout.lineCount<=1,
        {heading:opened.heading,headingLayout:opened.headingLayout});
    }
        recordCheck(profile.name+": no horizontal document overflow",!opened.horizontalOverflow,{viewport:opened.viewport});
    const openPath=path.join(OUT,profile.name+"-open.png");
    await page.screenshot({path:openPath,animations:"disabled"});
    results.screenshots.push({file:path.relative(ROOT,openPath),profile:profile.name,state:"open",metrics:opened});

    /* The token preview must work within the same panel on desktop and mobile,
       and must not duplicate the JSON-copy action when the user is already viewing output data. */
    const tokenTab=page.locator(".preview-tabs button[aria-label='ココフォリア駒プレビュー']");
    await tokenTab.waitFor({state:"visible",timeout:5000});
    await tokenTab.click();
    await page.locator(".pv-ccfolia-map").waitFor({state:"visible",timeout:5000});
    const tokenActions=await page.locator(".preview-actions button").count();
    const tokenOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2);
    recordCheck(profile.name+": CCFOLIA board preview opens with one JSON action and no horizontal overflow",
      await page.locator(".pv-token-preview").isVisible()&&tokenActions===1&&!tokenOverflow,
      {tokenActions,horizontalOverflow:tokenOverflow,viewport:page.viewportSize()});
    const tokenLookPath=path.join(OUT,profile.name+"-token-board.png");
    await page.screenshot({path:tokenLookPath,animations:"disabled"});
    results.screenshots.push({file:path.relative(ROOT,tokenLookPath),profile:profile.name,state:"token-board"});

    const boardStatus=page.locator(".pv-ccfolia-roster .pv-ccfolia-status").first();
    await boardStatus.scrollIntoViewIfNeeded({timeout:5000});
    const boardStatusBounds=await boardStatus.evaluate(el=>{
      const r=el.getBoundingClientRect(), body=el.closest(".preview-body"), b=body.getBoundingClientRect();
      return {top:r.top,bottom:r.bottom,bodyTop:b.top,bodyBottom:b.bottom,scrollTop:body.scrollTop,within:r.top>=b.top-2&&r.bottom<=b.bottom+2};
    }).catch(()=>({within:false,error:"board status was not reachable"}));
    recordCheck(profile.name+": board roster can scroll to status values below the token image",
      boardStatusBounds.within,{bounds:boardStatusBounds});
    await page.locator(".preview-body").evaluate(el=>{el.scrollTop=0;});

    await page.getByRole("button",{name:"編集画面",exact:true}).click();
    await page.locator(".pv-ccfolia-editor").waitFor({state:"visible",timeout:5000});
    const itemActions=await page.locator(".preview-actions button").count();
    const itemOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2);
    recordCheck(profile.name+": editor view keeps one JSON action and fits the viewport",
      await page.locator(".pv-ccfolia-editor").isVisible()&&itemActions===1&&!itemOverflow,
      {itemActions,horizontalOverflow:itemOverflow,viewport:page.viewportSize()});
    const tokenFieldsPath=path.join(OUT,profile.name+"-token-editor.png");
    await page.screenshot({path:tokenFieldsPath,animations:"disabled"});
    results.screenshots.push({file:path.relative(ROOT,tokenFieldsPath),profile:profile.name,state:"token-editor"});

    const sheetStatus=page.locator(".pv-ccfolia-editor .pv-ccfolia-edit-status-row").first();
    await sheetStatus.scrollIntoViewIfNeeded({timeout:5000});
    const sheetStatusBounds=await sheetStatus.evaluate(el=>{
      const r=el.getBoundingClientRect(), body=el.closest(".preview-body"), b=body.getBoundingClientRect();
      return {top:r.top,bottom:r.bottom,bodyTop:b.top,bodyBottom:b.bottom,scrollTop:body.scrollTop,within:r.top>=b.top-2&&r.bottom<=b.bottom+2};
    }).catch(()=>({within:false,error:"sheet status was not reachable"}));
    recordCheck(profile.name+": editor view can scroll to status values above the fixed footer",
      sheetStatusBounds.within,{bounds:sheetStatusBounds});

    await toggle.click();
    await page.waitForTimeout(220);
    const closedAgain=await metrics(page,profile);
    recordCheck(profile.name+": second click closes the same control",
      closedAgain.expanded==="false"&&!closedAgain.panelOpen,
      {expanded:closedAgain.expanded,panelOpen:closedAgain.panelOpen});
    if(pageErrors.length) recordCheck(profile.name+": no uncaught page errors",false,{pageErrors});
    else recordCheck(profile.name+": no uncaught page errors",true);
  } catch(e) {
    results.failures.push({name:profile.name+": harness",error:String(e?.stack||e).slice(0,1000)});
  } finally {
    await context.close();
  }
}
async function main() {
  fs.mkdirSync(OUT,{recursive:true});
  await new Promise((resolve,reject)=>{server.once("error",reject);server.listen(PORT,HOST,resolve);});
  const browser=await chromium.launch({headless:true});
  try { for(const profile of profiles) await runProfile(browser,profile); }
  finally { await browser.close(); await new Promise(resolve=>server.close(resolve)); }
  results.count=results.screenshots.length;
  results.checkCount=results.checks.length;
  fs.writeFileSync(path.join(OUT,"manifest.json"),JSON.stringify(results,null,2)+"\n");
  console.log("[preview-control-regression] "+JSON.stringify({screenshots:results.count,checks:results.checkCount,failures:results.failures.length,summary:results.failures.map(f=>({name:f.name,error:f.error,collisions:f.collisions,gapFromPanel:f.gapFromPanel}))}));
  if(results.failures.length||results.count!==profiles.length*7) process.exitCode=1;
}
main().catch(error=>{console.error("[preview-control-regression] fatal: "+(error?.stack||String(error)));process.exitCode=1;});
