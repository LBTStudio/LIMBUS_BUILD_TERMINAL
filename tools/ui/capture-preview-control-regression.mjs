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
async function metrics(page) {
  const toggle=page.locator("#lbt-preview-edge-toggle");
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
async function createDisposableAccount(page,profileName) {
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
  await page.locator(".rail-item").first().waitFor({state:"visible",timeout:20000});
  await page.locator("#lbt-preview-edge-toggle").waitFor({state:"visible",timeout:10000});
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
    await createDisposableAccount(page,profile.name);
    const toggle=page.locator("#lbt-preview-edge-toggle");
    const initial=await metrics(page);
    recordCheck(profile.name+": one React toggle, no legacy controls",
      initial.toggleCount===1&&initial.legacyReopenCount===0&&initial.legacyCloseCount===0&&initial.controls==="preview-panel",
      {metrics:initial});
    if(initial.expanded==="true") await toggle.click();
    await page.waitForTimeout(220);
    const closed=await metrics(page);
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
      const toggleAboveNavigation=!!closed.rail&&!!closed.toggle&&closed.toggle.bottom<=closed.rail.y-4;
      recordCheck(profile.name+": collapsed tablet/landscape control uses a reserved dock",
        closed.focusPaddingBottom>=expectedDock&&toggleAboveNavigation,
        {requiredPadding:expectedDock,focusPaddingBottom:closed.focusPaddingBottom,focusBottom:closed.focus?.bottom,dockBottom,toggleAboveNavigation,toggle:closed.toggle,rail:closed.rail});
    }
    if(profile.mobile&&profile.height>profile.width) {
      const focusSeparated=!!closed.focus&&!!closed.toggle&&closed.focus.bottom<=closed.toggle.y-4;
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
    const opened=await metrics(page);
    const commonOk=opened.expanded==="true"&&opened.panelOpen;
    recordCheck(profile.name+": open state is synchronized",commonOk,{metrics:opened});
    const controlCollisions=Object.entries(opened.overlaps).filter(([key,value])=>["footer","hint","tabs","rail","sectionTitle"].includes(key)&&value.hit);
    recordCheck(profile.name+": toggle does not overlap preview actions, tabs, hints, headings or navigation",
      controlCollisions.length===0,
      {collisions:controlCollisions,metrics:opened});
    if(profile.width>=641&&profile.width<=1024) {
      const expectedDock=profile.height<=500?48:60;
      const dockBottom=opened.rail&&opened.viewport&&opened.rail.width>=opened.viewport.width-8?opened.rail.y:opened.focus?.bottom;
      const toggleAboveNavigation=!!opened.rail&&!!opened.toggle&&opened.toggle.bottom<=opened.rail.y-4;
      recordCheck(profile.name+": open tablet/landscape control uses a reserved dock",
        opened.focusPaddingBottom>=expectedDock&&toggleAboveNavigation,
        {requiredPadding:expectedDock,focusPaddingBottom:opened.focusPaddingBottom,focusBottom:opened.focus?.bottom,dockBottom,toggleAboveNavigation,toggle:opened.toggle,rail:opened.rail});
    }
    if(profile.mobile&&profile.height>profile.width) {
      const panelSeparated=!!opened.panel&&!!opened.toggle&&opened.panel.bottom<=opened.toggle.y-4;
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
    await toggle.click();
    await page.waitForTimeout(220);
    const closedAgain=await metrics(page);
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
  if(results.failures.length||results.count!==profiles.length*2) process.exitCode=1;
}
main().catch(error=>{console.error("[preview-control-regression] fatal: "+(error?.stack||String(error)));process.exitCode=1;});
