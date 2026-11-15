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
  const rail=await rect(page.locator(profile.width <= 640 ? ".btype-mobile-bottom-nav" : ".rail"));
  const accessBadge=await rect(page.locator("#lbt-access-counter"));
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
      sectionTitle:intersects(t,title),
      accessCounterVsNav:intersects(accessBadge,rail)
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
      const name=page.locator(".acct-gate input[placeholder='キャラクター名']").first();
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
  if (await visible(homeNav)) await homeNav.click();
  await page.locator(".btype-home-v2").waitFor({ state: "visible", timeout: 10000 });
  const homePath = path.join(OUT, profile.name + "-btype-home.png");
  await page.screenshot({ path: homePath, animations: "disabled" });
  results.screenshots.push({ file: path.relative(ROOT, homePath), profile: profile.name, state: "btype-home" });
  const buildNav = page.locator(".rail-item[title='ビルド']");
  const mobileBuildNav = page.locator(".btype-mobile-bottom-nav button").filter({ hasText: "ビルド" });
  const oldBuildNav = page.locator(".rail-item[title='ワークベンチ']");
  const homeEyebrow = (await page.locator(".btype-eyebrow").textContent().catch(() => "") || "").trim();
  const homeAction = (await page.locator(".btype-home-primary-action").innerText().catch(() => "") || "").trim();
  const buildEntry = profile.width <= 640 ? mobileBuildNav : buildNav;
  const buildBrandingOk = await buildEntry.count() === 1
    && await buildEntry.isVisible()
    && await oldBuildNav.count() === 0
    && homeEyebrow === "LIMBUS BUILD TERMINAL"
    && homeAction.includes("次へ：");
  recordCheck(profile.name + ": B-type launcher and workbench labels match the approved prototype",
    buildBrandingOk, { desktopBuildNavCount: await buildNav.count(), mobileBuildNavCount: await mobileBuildNav.count(), oldBuildNavCount: await oldBuildNav.count(), homeEyebrow, homeAction });
  await buildEntry.waitFor({state:"visible",timeout:10000});
  await buildEntry.click();
  await page.getByLabel("キャラクター名").fill("サンプル・フィクサー");
  await page.getByLabel("プレイヤー名").fill("テスト卓");
  await page.getByLabel("駒の行動順").fill("12");
  await page.getByLabel("駒の色（16進数）").fill("#697887");
  const basicTab = page.locator(".build-tabs button[role='tab']").filter({ hasText: "基本" }).first();
  await basicTab.waitFor({ state: "visible", timeout: 10000 });
  await basicTab.click();
  const imageDetails = page.locator(".piece-image-details > summary").first();
  await imageDetails.waitFor({ state: "visible", timeout: 10000 });
  if (!await imageDetails.evaluate((node) => node.parentElement?.open === true)) await imageDetails.click();
  const imageField = page.locator("#piece-image-urls");
  const imageUrl = "http://" + HOST + ":" + PORT + "/tests/fixtures/ccfolia-preview-sample.svg";
  await imageField.fill(imageUrl);
  const toggle = page.locator(profile.mobile ? ".preview-mobile-toggle" : "#lbt-preview-edge-toggle");
  await toggle.waitFor({state:"visible",timeout:10000});
  const closedState = {
    toggleExpanded: await toggle.getAttribute("aria-expanded"),
    previewPanelCount: await page.locator("#preview-panel").count(),
    inlinePortraitCount: await page.locator(".piece-art-frame, .piece-art-wrap, .piece-art-thumbs").count(),
    inlineCcfBoardCount: await page.locator(".basic-ccfolia-preview, .build-params-panel-preview, #build-params-tab-preview, .btype-workbench-preview-panel, .preview-lines, .btype-preflight-note").count()
  };
  const closedClean = closedState.toggleExpanded === "false"
    && closedState.previewPanelCount === 0
    && closedState.inlinePortraitCount === 0
    && closedState.inlineCcfBoardCount === 0;
  recordCheck(profile.name + ": collapsed Basic workspace contains no preview image, miniature or duplicate panel",
    closedClean, closedState);

  const artPreviewToggle = page.locator(".piece-art-preview-toggle").first();
  await artPreviewToggle.waitFor({ state: "visible", timeout: 10000 });
  const initialArtPreview = await artPreviewToggle.evaluate(button => ({
    expanded: button.getAttribute("aria-expanded"),
    previewVisible: !!document.querySelector(".piece-art-preview-live")?.getClientRects().length
  }));
  recordCheck(profile.name + ": pawn image preview starts expanded by default",
    initialArtPreview.expanded === "true" && initialArtPreview.previewVisible,
    initialArtPreview);

  const portraitFrame = page.locator(".piece-url-preview-featured-frame").first();
  const portraitImage = portraitFrame.locator("img").first();
  await portraitImage.waitFor({ state: "visible", timeout: 10000 });
  await page.waitForFunction(() => {
    const image = document.querySelector(".piece-url-preview-featured-frame img");
    return !!image && image.complete && image.naturalWidth > 0 && image.naturalHeight > 0;
  }, { timeout: 10000 });
  const portraitFit = await portraitImage.evaluate(image => {
    const frame = image.parentElement.getBoundingClientRect();
    const rect = image.getBoundingClientRect();
    return {
      objectFit: getComputedStyle(image).objectFit,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
      imageWithinFrame: rect.left >= frame.left - 1 && rect.top >= frame.top - 1
        && rect.right <= frame.right + 1 && rect.bottom <= frame.bottom + 1,
      transform: getComputedStyle(image).transform
    };
  });
  recordCheck(profile.name + ": standing portrait is loaded, fully contained and aspect-fit",
    portraitFit.objectFit === "contain" && portraitFit.naturalWidth > 0
      && portraitFit.naturalHeight > 0 && portraitFit.imageWithinFrame
      && portraitFit.transform === "matrix(1, 0, 0, 1, 0, 0)",
    portraitFit);
  const zoomDragReset = page.getByRole("button", { name: "立ち絵を全体表示に戻す" });
  const dragZoomBox = await portraitFrame.boundingBox();
  if (!dragZoomBox) throw new Error(profile.name + ": portrait frame has no bounding box for drag zoom");
  await page.mouse.move(dragZoomBox.x + dragZoomBox.width / 2, dragZoomBox.y + dragZoomBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(dragZoomBox.x + dragZoomBox.width / 2, dragZoomBox.y + dragZoomBox.height / 2 - 48, { steps: 6 });
  await page.mouse.up();
  await page.waitForFunction(() => {
    const image = document.querySelector(".piece-url-preview-featured-frame > img");
    return image && new DOMMatrixReadOnly(getComputedStyle(image).transform).a > 1.1;
  }, null, { timeout: 5000 });
  const dragZoomScale = await portraitImage.evaluate(image => new DOMMatrixReadOnly(getComputedStyle(image).transform).a);
  recordCheck(profile.name + ": dragging vertically at 1x zooms the portrait without a click",
    dragZoomScale > 1.1 && dragZoomScale <= 4,
    { dragZoomScale });
  await zoomDragReset.click();
  await page.waitForFunction(() => {
    const image = document.querySelector(".piece-url-preview-featured-frame > img");
    return image && Math.abs(new DOMMatrixReadOnly(getComputedStyle(image).transform).a - 1) < 0.001;
  }, null, { timeout: 5000 });
  if (profile.mobile) {
    const pinchOutcome = await portraitFrame.evaluate(frame => {
      if (typeof Touch !== "function" || typeof TouchEvent !== "function") return { supported: false };
      const rect = frame.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const makeTouch = (identifier, clientX) => new Touch({
        identifier, target: frame, clientX, clientY: y, screenX: clientX, screenY: y,
        radiusX: 1, radiusY: 1, force: 1
      });
      const dispatch = (type, touches, changedTouches) => {
        const event = new TouchEvent(type, {
          bubbles: true, cancelable: true,
          touches, targetTouches: touches, changedTouches
        });
        frame.dispatchEvent(event);
        return event.defaultPrevented;
      };
      const firstStart = makeTouch(1, x - 22);
      const secondStart = makeTouch(2, x + 22);
      const startPrevented = dispatch("touchstart", [firstStart, secondStart], [firstStart, secondStart]);
      const firstMove = makeTouch(1, x - 36);
      const secondMove = makeTouch(2, x + 36);
      const movePrevented = dispatch("touchmove", [firstMove, secondMove], [firstMove, secondMove]);
      dispatch("touchend", [], [firstMove, secondMove]);
      return { supported: true, startPrevented, movePrevented };
    });
    if (pinchOutcome.supported) {
      await page.waitForFunction(() => {
        const image = document.querySelector(".piece-url-preview-featured-frame > img");
        return image && new DOMMatrixReadOnly(getComputedStyle(image).transform).a > 1.2;
      }, null, { timeout: 5000 });
      const pinchScale = await portraitImage.evaluate(image => new DOMMatrixReadOnly(getComputedStyle(image).transform).a);
      recordCheck(profile.name + ": two-finger pinch zooms the portrait on touch devices",
        pinchOutcome.startPrevented && pinchOutcome.movePrevented && pinchScale > 1.2 && pinchScale <= 4,
        { pinchOutcome, pinchScale });
      await zoomDragReset.click();
      await page.waitForFunction(() => {
        const image = document.querySelector(".piece-url-preview-featured-frame > img");
        return image && Math.abs(new DOMMatrixReadOnly(getComputedStyle(image).transform).a - 1) < 0.001;
      }, null, { timeout: 5000 });
    } else {
      recordCheck(profile.name + ": touch pinch event API is available for mobile zoom tests", false, pinchOutcome);
    }
  }
  const wheelOutcome = await portraitFrame.evaluate(frame => {
    const rect = frame.getBoundingClientRect();
    const event = new WheelEvent("wheel", {
      deltaY: -520,
      clientX: rect.left + rect.width * 0.32,
      clientY: rect.top + rect.height * 0.38,
      bubbles: true,
      cancelable: true
    });
    frame.dispatchEvent(event);
    return { defaultPrevented: event.defaultPrevented };
  });
  await page.waitForTimeout(120);
  const zoomed = await portraitImage.evaluate(image => ({
    transform: getComputedStyle(image).transform,
    transformOrigin: getComputedStyle(image).transformOrigin
  }));
  const zoomScale = Number((zoomed.transform.match(/^matrix\(([-+0-9.e]+),/) || [])[1] || 1);
  recordCheck(profile.name + ": mouse wheel zooms the full portrait within the 4x cap",
    wheelOutcome.defaultPrevented && zoomScale > 1 && zoomScale <= 4
      && zoomed.transformOrigin !== "50% 50%",
    { wheelOutcome, zoomed, zoomScale });
  const dispatchPreviewWheel = deltaY => portraitFrame.evaluate((frame, delta) => {
    const rect = frame.getBoundingClientRect();
    const event = new WheelEvent("wheel", {
      deltaY: delta,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
      bubbles: true,
      cancelable: true
    });
    frame.dispatchEvent(event);
    return { defaultPrevented: event.defaultPrevented };
  }, deltaY);
  const wheelToMaximum = await dispatchPreviewWheel(-100000);
  await page.waitForFunction(() => {
    const image = document.querySelector(".piece-url-preview-featured-frame > img");
    return image && new DOMMatrixReadOnly(getComputedStyle(image).transform).a >= 3.99;
  }, null, { timeout: 5000 });
  const maximumWheelBoundary = await dispatchPreviewWheel(-240);
  const maximumScale = await portraitImage.evaluate(image => new DOMMatrixReadOnly(getComputedStyle(image).transform).a);
  recordCheck(profile.name + ": wheel input at the 4x zoom cap is consumed without page scrolling",
    wheelToMaximum.defaultPrevented && maximumWheelBoundary.defaultPrevented && maximumScale >= 3.99,
    { wheelToMaximum, maximumWheelBoundary, maximumScale });
  const wheelToMinimum = await dispatchPreviewWheel(100000);
  await page.waitForFunction(() => {
    const image = document.querySelector(".piece-url-preview-featured-frame > img");
    return image && Math.abs(new DOMMatrixReadOnly(getComputedStyle(image).transform).a - 1) < 0.001;
  }, null, { timeout: 5000 });
  const minimumWheelBoundary = await dispatchPreviewWheel(240);
  const minimumScale = await portraitImage.evaluate(image => new DOMMatrixReadOnly(getComputedStyle(image).transform).a);
  recordCheck(profile.name + ": wheel input at the 1x zoom floor is consumed without page scrolling",
    wheelToMinimum.defaultPrevented && minimumWheelBoundary.defaultPrevented && Math.abs(minimumScale - 1) < 0.001,
    { wheelToMinimum, minimumWheelBoundary, minimumScale });
  const wheelRezoom = await dispatchPreviewWheel(-520);
  await page.waitForFunction(() => {
    const image = document.querySelector(".piece-url-preview-featured-frame > img");
    return image && new DOMMatrixReadOnly(getComputedStyle(image).transform).a > 1.1;
  }, null, { timeout: 5000 });
  recordCheck(profile.name + ": wheel zoom remains responsive after reaching both boundaries",
    wheelRezoom.defaultPrevented,
    { wheelRezoom });
  const resetPortrait = page.getByRole("button", { name: "立ち絵を全体表示に戻す" });
  await resetPortrait.waitFor({ state: "visible", timeout: 5000 });
  const resetControlGeometry = await resetPortrait.evaluate(button => {
    const rect = button.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(button);
    const textRects = [...range.getClientRects()].filter(item => item.width > 0 && item.height > 0);
    const style = getComputedStyle(button);
    return {
      width: rect.width,
      height: rect.height,
      textLineCount: new Set(textRects.map(item => Math.round(item.y))).size,
      whiteSpace: style.whiteSpace,
      writingMode: style.writingMode
    };
  });
  const resetControlPlacement = await resetPortrait.evaluate(button => {
    const rect = button.getBoundingClientRect();
    const frame = document.querySelector(".piece-url-preview-featured-frame").getBoundingClientRect();
    return { outsideImageFrame: rect.top >= frame.bottom, gap: rect.top - frame.bottom };
  });
  recordCheck(profile.name + ": zoom controls sit below the image without covering the portrait",
    resetControlPlacement.outsideImageFrame && resetControlPlacement.gap >= 0,
    resetControlPlacement);
  recordCheck(profile.name + ": zoom reset control remains horizontal and readable on narrow screens",
    resetControlGeometry.width > resetControlGeometry.height
      && resetControlGeometry.textLineCount === 1
      && resetControlGeometry.whiteSpace === "nowrap"
      && resetControlGeometry.writingMode === "horizontal-tb",
    resetControlGeometry);
  await portraitFrame.scrollIntoViewIfNeeded();
  await page.waitForTimeout(120);
  const dragStart = await portraitFrame.evaluate(frame => {
    const rect = frame.getBoundingClientRect();
    const left = Math.max(1, rect.left);
    const right = Math.min(innerWidth - 1, rect.right);
    const top = Math.max(1, rect.top);
    const bottom = Math.min(innerHeight - 1, rect.bottom);
    const candidates = [
      [(left + right) / 2, (top + bottom) / 2],
      [left + (right - left) * 0.35, top + (bottom - top) * 0.35],
      [left + (right - left) * 0.65, top + (bottom - top) * 0.35],
      [left + (right - left) * 0.35, top + (bottom - top) * 0.65],
      [left + (right - left) * 0.65, top + (bottom - top) * 0.65]
    ];
    for (const [x, y] of candidates) {
      if (right - left < 24 || bottom - top < 24) break;
      const hit = document.elementFromPoint(x, y);
      if (hit && frame.contains(hit)) {
        return { x, y, hitTag: hit.tagName, hitClass: typeof hit.className === "string" ? hit.className : "", rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, visibleRect: { left, top, right, bottom }, hitFrame: true };
      }
    }
    return { x: (left + right) / 2, y: (top + bottom) / 2, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, visibleRect: { left, top, right, bottom }, hitFrame: false, hitTag: document.elementFromPoint((left + right) / 2, (top + bottom) / 2)?.tagName || null };
  });
  if (!dragStart.hitFrame) throw new Error(profile.name + ": portrait frame is covered at every visible drag point: " + JSON.stringify(dragStart));
  const transformBeforeDrag = await portraitImage.evaluate(image => {
    const matrix = new DOMMatrixReadOnly(getComputedStyle(image).transform);
    return { scale: matrix.a, x: matrix.e, y: matrix.f };
  });
  const panDirections = [[32, 20], [-32, 20], [32, -20], [-32, -20]];
  let panMoved = false;
  for (const [dx, dy] of panDirections) {
    await page.mouse.move(dragStart.x, dragStart.y);
    await page.mouse.down();
    await page.mouse.move(dragStart.x + dx, dragStart.y + dy, { steps: 5 });
    await page.mouse.up();
    try {
      await page.waitForFunction(({ before, minimum }) => {
        const image = document.querySelector(".piece-url-preview-featured-frame > img");
        if (!image) return false;
        const matrix = new DOMMatrixReadOnly(getComputedStyle(image).transform);
        return Math.abs(matrix.e - before.x) + Math.abs(matrix.f - before.y) > minimum;
      }, { before: transformBeforeDrag, minimum: 4 }, { timeout: 1100 });
      panMoved = true;
      break;
    } catch {
      /* At a pan boundary, try another direction before deciding the image is immovable. */
    }
  }
  const transformAfterDrag = await portraitImage.evaluate(image => {
    const matrix = new DOMMatrixReadOnly(getComputedStyle(image).transform);
    return { scale: matrix.a, x: matrix.e, y: matrix.f };
  });
  const panDistance = Math.abs(transformAfterDrag.x - transformBeforeDrag.x) + Math.abs(transformAfterDrag.y - transformBeforeDrag.y);
  recordCheck(profile.name + ": zoomed portrait can be repositioned by dragging",
    panMoved && transformAfterDrag.scale > 1 && panDistance > 4,
    { transformBeforeDrag, transformAfterDrag, panDistance, attemptedDirections: panDirections, dragStart });

  await resetPortrait.click();
  await page.waitForTimeout(120);
  const resetTransform = await portraitImage.evaluate(image => getComputedStyle(image).transform);
  const resetMatrix = await portraitImage.evaluate(image => {
    const matrix = new DOMMatrixReadOnly(getComputedStyle(image).transform);
    return { scale: matrix.a, x: matrix.e, y: matrix.f };
  });
  recordCheck(profile.name + ": full-fit reset clears both zoom and drag offset",
    Math.abs(resetMatrix.scale - 1) < 0.001 && Math.abs(resetMatrix.x) < 0.1 && Math.abs(resetMatrix.y) < 0.1,
    resetMatrix);
  recordCheck(profile.name + ": full-fit control restores the complete portrait",
    resetTransform === "matrix(1, 0, 0, 1, 0, 0)",
    { resetTransform });
  await artPreviewToggle.click();
  const hiddenAgain = await artPreviewToggle.evaluate(button => ({
    expanded: button.getAttribute("aria-expanded"),
    visible: !!document.querySelector(".piece-art-preview-live")?.getClientRects().length
  }));
  recordCheck(profile.name + ": pawn image preview can be folded again after use",
    hiddenAgain.expanded === "false" && !hiddenAgain.visible,
    hiddenAgain);
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

    const parameterTabs = page.locator(".build-params-tabs");
    await parameterTabs.waitFor({ state: "visible", timeout: 10000 });
    const statusFormatTab = page.getByRole("tab", { name: "ステータス（ST）", exact: true });
    const labelFormatTab = page.getByRole("tab", { name: "ラベル（パラメータ）", exact: true });
    const statusFormatPanel = page.locator("#build-params-panel-statuses");
    const labelFormatPanel = page.locator("#build-params-panel-labels");

    recordCheck(profile.name + ": Basic format has only ST and label tabs, not an embedded preview",
      await page.locator("#build-params-tab-preview").count() === 0
      && await page.locator(".basic-ccfolia-preview").count() === 0,
      { tabCount: await parameterTabs.getByRole("tab").count() });

    await statusFormatTab.click();
    recordCheck(profile.name + ": Basic format ST tab shows the existing status editor",
      await statusFormatPanel.isVisible() && !(await labelFormatPanel.isVisible()));
    const statusFormatPath = path.join(OUT, profile.name + "-build-params-status-tab.png");
    await page.screenshot({ path: statusFormatPath, animations: "disabled" });
    results.screenshots.push({ file: path.relative(ROOT, statusFormatPath), profile: profile.name, state: "build-params-status-tab" });

    await labelFormatTab.click();
    recordCheck(profile.name + ": Basic format labels tab shows the existing parameter editor",
      await labelFormatPanel.isVisible() && !(await statusFormatPanel.isVisible()));
    const labelFormatPath = path.join(OUT, profile.name + "-build-params-label-tab.png");
    await page.screenshot({ path: labelFormatPath, animations: "disabled" });
    results.screenshots.push({ file: path.relative(ROOT, labelFormatPath), profile: profile.name, state: "build-params-label-tab" });

    // On phones, exercise the approved four-item bottom navigation; Home is reachable from Other.
    if (profile.width <= 640) {
      const mobileNav = page.locator(".btype-mobile-bottom-nav");
      const mobileLabels = (await mobileNav.locator("button").allTextContents()).map(text => text.trim());
      recordCheck(profile.name + ": phone navigation matches the approved four destinations",
        JSON.stringify(mobileLabels) === JSON.stringify(["ビルド", "記録", "取込", "その他"]),
        { mobileLabels });
      await mobileNav.getByRole("button", { name: "その他", exact: true }).click();
      const utilityHome = page.locator(".utility-section-grid").getByRole("button", { name: "ホーム", exact: true });
      await utilityHome.waitFor({ state: "visible", timeout: 5000 });
      await utilityHome.click();
    } else {
      await page.locator(".rail-item[title='ホーム']").click();
    }
    await page.locator(".btype-home-v2").waitFor({ state: "visible", timeout: 5000 });
    await page.locator(".btype-home-step.is-preview").click();
    const globalPreview = page.locator("#preview-panel");
    await globalPreview.waitFor({ state: "visible", timeout: 5000 });
    const globalTokenTab = globalPreview.locator(".preview-tabs button[aria-label='ココフォリア駒プレビュー']");
    await globalTokenTab.waitFor({state:"visible",timeout:5000});
    const globalTokenSelected = await globalTokenTab.evaluate(el => el.classList.contains("is-active"));
    recordCheck(profile.name + ": Home preview shortcut opens the shared CCFOLIA tab",
      await globalPreview.isVisible() && globalTokenSelected
      && await page.locator(".pv-ccfolia-map").isVisible(),
      { globalPreviewOpen: await globalPreview.isVisible(), globalTokenSelected });
    const closePreviewShortcut = page.locator(profile.mobile ? ".preview-mobile-toggle" : "#lbt-preview-edge-toggle");
    await closePreviewShortcut.click();
    await page.waitForFunction(() => !document.querySelector("#preview-panel"), { timeout: 5000 });
    await statusFormatTab.click();
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
      initial.toggleCount===1&&initial.legacyReopenCount===0&&initial.legacyCloseCount===0&&initial.expanded==="false"&&!initial.panelOpen&&initial.controls===null,
      {metrics:initial});
    if(initial.expanded==="true") await toggle.click();
    await page.waitForTimeout(220);
    const closed=await metrics(page,profile);
    recordCheck(profile.name+": closed state is synchronized",
      closed.expanded==="false"&&!closed.panelOpen&&closed.controls===null,
      {metrics:closed});
    const closedCollisions=Object.entries(closed.overlaps).filter(([key,value])=>["footer","hint","tabs","rail","sectionTitle","accessCounterVsNav"].includes(key)&&value.hit);
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
    const commonOk=opened.expanded==="true"&&opened.panelOpen&&opened.controls==="preview-panel";
    recordCheck(profile.name+": open state is synchronized",commonOk,{metrics:opened});
    const controlCollisions=Object.entries(opened.overlaps).filter(([key,value])=>["footer","hint","tabs","rail","sectionTitle","accessCounterVsNav"].includes(key)&&value.hit);
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
    await page.locator(".preview .pv-ccfolia-map").waitFor({state:"visible",timeout:5000});
    const tokenActions=await page.locator(".preview .preview-actions button").count();
    const tokenOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2);
    recordCheck(profile.name+": CCFOLIA board preview opens with one JSON action and no horizontal overflow",
      await page.locator(".preview .pv-token-preview").isVisible()&&tokenActions===1&&!tokenOverflow,
      {tokenActions,horizontalOverflow:tokenOverflow,viewport:page.viewportSize()});
    const tokenLookPath=path.join(OUT,profile.name+"-token-board.png");
    await page.screenshot({path:tokenLookPath,animations:"disabled"});
    results.screenshots.push({file:path.relative(ROOT,tokenLookPath),profile:profile.name,state:"token-board"});

    const boardStatus=page.locator(".pv-ccfolia-roster .pv-ccfolia-status").first();
    await boardStatus.scrollIntoViewIfNeeded({timeout:5000});
    const boardStatusBounds=await boardStatus.evaluate(el=>{
      const r=el.getBoundingClientRect(), body=el.closest(".preview-body"), b=body.getBoundingClientRect();
      /* Fractional viewport and scrollbar-gutter rounding can leave a sub-4px edge delta
         even after the final row has reached the scroll boundary. */
      const edgeTolerance=4;
      return {top:r.top,bottom:r.bottom,bodyTop:b.top,bodyBottom:b.bottom,scrollTop:body.scrollTop,edgeTolerance,within:r.top>=b.top-edgeTolerance&&r.bottom<=b.bottom+edgeTolerance};
    }).catch(()=>({within:false,error:"board status was not reachable"}));
    recordCheck(profile.name+": board roster can scroll to status values below the token image",
      boardStatusBounds.within,{bounds:boardStatusBounds});
    await page.locator(".preview-body").evaluate(el=>{el.scrollTop=0;});

    await page.getByRole("button",{name:"編集画面",exact:true}).click();
    await page.locator(".pv-ccfolia-editor").waitFor({state:"visible",timeout:5000});
    const itemActions=await page.locator(".preview .preview-actions button").count();
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
      closedAgain.expanded==="false"&&!closedAgain.panelOpen&&closedAgain.controls===null,
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
  if(results.failures.length||results.count!==profiles.length*9) process.exitCode=1;
}
main().catch(error=>{console.error("[preview-control-regression] fatal: "+(error?.stack||String(error)));process.exitCode=1;});
