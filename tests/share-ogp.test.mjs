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
  assert.match(source, /const shareVisualHTML = embeddedShareImage/);
  assert.match(source, /class="share-visual"/);
  assert.match(source, /SHARE IMAGE \/ 共有シート画像/);
  assert.match(source, /object-fit:contain/);
  assert.match(source, /twitter:card/);
  assert.match(source, /const shareHp = p\.hp === "" \|\| p\.hp == null/);
  assert.match(source, /share-at-a-glance/);
  assert.match(source, /eff-joined/);
  assert.match(source, /const inventoryHTML = ownedItems\.length/);
  assert.match(source, /INVENTORY \/ \\u6240\\u6301\\u30A2\\u30A4\\u30C6\\u30E0/);
  assert.match(source, /special-enhancement-fold/);
  assert.match(source, /const tacticalScopeBadges = \(sk\)/);
  assert.match(source, /scope-area/);
  assert.match(source, /scope-barrage/);
});
