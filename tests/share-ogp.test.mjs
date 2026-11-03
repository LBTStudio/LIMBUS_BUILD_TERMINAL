import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../js/generator.js", import.meta.url), "utf8");

test("共有HTMLは外部クローラー向けのLBTキャラクターシートOGPを埋め込む", () => {
  assert.match(source, /const sharedPersonaName = p\.personaSrc \? clipShareMeta\(personaName\) : ""/);
  assert.match(source, /const shareTitle = sharedPersonaName \? `【人格】\$\{sharedPersonaName\}｜LBT`/);
  assert.match(source, /共有人格プリセット：\$\{sharedPersonaName\}/);
  assert.match(source, /const clipShareMeta = \(text, max = 56\)/);
  assert.match(source, /property="og:title"/);
  assert.match(source, /property="og:description"/);
  assert.match(source, /property="og:image"/);
  assert.match(source, /lbt-share-card\.png/);
  assert.match(source, /const embeddedShareImage = \/\^data:image\\\//);
  assert.match(source, /embeddedShareImage\.startsWith\("data:image\/webp"\) \? "image\/webp"/);
  assert.match(source, /embeddedShareImage\.startsWith\("data:image\/jpeg"\) \? "image\/jpeg"/,
    "JPEGのdata URIに対してOGPのMIMEをimage/jpegとして出す");
  assert.match(source, /const shareVisualHTML = embeddedShareImage/);
  assert.match(source, /class="share-visual"/);
  assert.match(source, /SHARE IMAGE \/ 共有シート画像/);
  assert.match(source, /object-fit:contain/);
  assert.match(source, /twitter:card/);
  assert.match(source, /const sharePersonaMode = String\(p\.personaMode \|\| p\.personaRef\?\.mode \|\| ""\)/);
  assert.match(source, /const shareOfficialPersona = Array\.isArray\(shareOfficialRows\)/);
  assert.match(source, /const candidates = shareOfficialPersona/);
  assert.match(source, /const shareHpBase = shareStatusBase\("hp"\)/);
  assert.match(source, /const shareSanBase = shareStatusBase\("san"\)/);
  assert.match(source, /share-at-a-glance/);
  assert.match(source, /eff-joined/);
  assert.match(source, /const inventoryHTML = ownedItems\.length/);
  assert.match(source, /INVENTORY \/ \\u6240\\u6301\\u30A2\\u30A4\\u30C6\\u30E0/);
  assert.match(source, /special-enhancement-fold/);
  assert.match(source, /const tacticalScopeBadges = \(sk\)/);
  assert.match(source, /scope-area/);
  assert.match(source, /scope-barrage/);
});


test("共有HTMLは公式人格DBとカスタムpersonaSrcを分けてHP/SANを補完する", () => {
  assert.match(source, /const sharePersonaMode = String/);
  assert.match(source, /const shareOfficialRows =/);
  assert.match(source, /const shareOfficialPersona = Array\.isArray/);
  assert.match(source, /const candidates = shareOfficialPersona/);
  assert.match(source, /shareOfficialPersona\[field\]/);
  assert.match(source, /p\.personaSrc/);
});;
