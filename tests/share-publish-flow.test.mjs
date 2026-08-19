import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const generator = readFileSync(new URL("../js/generator.js", import.meta.url), "utf8");
const mobileOverlay = readFileSync(new URL("../assets/v53-overlay.css", import.meta.url), "utf8");

test("共有URL発行はGitHub Pagesの完全ビューアを維持し、長文時はLBT直接復元URLを使う", () => {
  assert.match(generator, /const LBT_SHARE_VIEWER_URL = "https:\/\/lbtstudio\.github\.io\/LIMBUS_BUILD_TERMINAL\/share\.html"/);
  assert.match(generator, /window\.LBT_shareLink\.createPublishedUrl\(state, LBT_SHARE_VIEWER_URL\)/);
  assert.match(generator, /const routeLabel = r\.strategy === "rentry" \|\| r\.strategy === "telegraph"/);
  assert.doesNotMatch(generator, /r\.strategy === "tinyurl"/);
  assert.match(generator, /Discordへ貼るURL/);
  assert.doesNotMatch(generator, /外部ホストへアップロードしません/);
  assert.doesNotMatch(generator, /catbox\.moe/);
  assert.doesNotMatch(generator, /litterbox\.catbox\.moe/);
  assert.doesNotMatch(generator, /publishShareSheetOnline/);
});

test("共有URLは非同期完了後に自動コピーを試行し、ユーザー操作のコピーと手動復旧欄も表示する", () => {
  assert.match(generator, /await navigator\.clipboard\.writeText\(r\.url\)/);
  assert.match(generator, /Discordへ貼るURL（コピー済み）/);
  assert.match(generator, /Discordへ貼るURLをコピー/);
  assert.match(generator, /予備URL（通常は使いません）/);
  assert.match(generator, /主URLが開けない場合だけ/);
  assert.match(generator, /選択済み：Ctrl\+Cでコピー/);
  assert.match(generator, /下の「Discordへ貼るURLをコピー」を押してください/);
  assert.match(generator, /share-publish-card/);
  assert.match(generator, /共有内容を確認/);
  assert.match(generator, /直近URLを再利用/);
  assert.match(generator, /OGP: \$\{state\.shareImageData \? "手動画像" : "自動生成カード"\}/);
});

test("共有発行とURLコピーのクリックでは共有モーダルを閉じず、背景クリックだけで閉じる", () => {
  assert.match(generator, /if \(e\.target === el\) close\(\);/);
  assert.doesNotMatch(generator, /e\.currentTarget === el/);
});

test("モバイル幅では共有URLの入力欄とコピー操作を縦積みにして操作領域を確保する", () => {
  assert.match(mobileOverlay, /\.share-url-field > div\{\s*flex-direction:column;/);
  assert.match(mobileOverlay, /\.share-url-field \.input\{\s*width:100%;\s*min-height:40px;/);
  assert.match(mobileOverlay, /\.share-url-field \.btn\{\s*width:100%;\s*min-height:40px;/);
});
