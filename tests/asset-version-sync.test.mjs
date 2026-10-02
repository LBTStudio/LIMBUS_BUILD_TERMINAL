import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/* ---------------------------------------------------------------------------
   ?v= キャッシュバージョンの同期を全アセット 대해検証する。

   これまで版の検証はファイルごとに手書きで、share-link.js と generator.js の
   2 つしかなかった。実際に index.html と share.html で share-link.js の版が
   食い違い、発行側と閲覧側で別の revision が走る事故が起きている。
   tools/sync-asset-versions.mjs が内容をハッシュに置き換えたので、版の正しさは
   1 本のコマンドとこの 1 本のテストで決まる。
--------------------------------------------------------------------------- */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TOOL = resolve(ROOT, "tools/sync-asset-versions.mjs");
const HASH_LEN = 8;

/** ?v= の相手が解決できる参照元。js/ は share.html から読まれるので document 相対。
 *  assets/design-system.css は CSS 内の url() が CSS 自身の位置（assets/）相対。 */
const SOURCES = [
  { file: "index.html", base: "." },
  { file: "share.html", base: "." },
  { file: "assets/design-system.css", base: "assets" },
  { file: "js/share-viewer.js", base: "." },
];
const VERSION_RE = /([A-Za-z0-9._/-]+\.(?:css|js|json|woff2))\?v=([0-9a-zA-Z._-]+)/g;

const hashOf = (abs) => createHash("sha256").update(readFileSync(abs)).digest("hex").slice(0, HASH_LEN);

test("?v= は全参照がファイル内容ハッシュと同期している", () => {
  assert.ok(existsSync(TOOL), "tools/sync-asset-versions.mjs があること");
  let out = "";
  try {
    out = execFileSync(process.execPath, [TOOL, "--check"], { cwd: ROOT, encoding: "utf8" });
  } catch (err) {
    // --check はずれていれば exit 1。どの参照がずれているかをそのまま見せる。
    assert.fail(`?v= が内容ハッシュと同期していません。node tools/sync-asset-versions.mjs を実行してください。\n${err.stdout || ""}${err.stderr || ""}`);
  }
  assert.match(out, /同期しています/);
});

test("参照されるアセットは実在し、旧来の手動版（65r69 など）は残っていない", () => {
  const seen = new Set();
  let refs = 0;
  for (const { file: rel, base } of SOURCES) {
    const html = readFileSync(resolve(ROOT, rel), "utf8");
    for (const m of html.matchAll(VERSION_RE)) {
      const [, asset, version] = m;
      refs++;
      assert.ok(existsSync(resolve(ROOT, base, asset)), `${rel} が参照する ${asset} が実在すること`);
      assert.equal(version.length, HASH_LEN, `${rel} の ${asset} の版は ${HASH_LEN} 桁のハッシュ`);
      assert.match(version, /^[0-9a-f]+$/, `${rel} の ${asset} の版は hex（小文字）: ${version}`);
      // 手動で bump し続けた裾の版が混入していないこと
      assert.doesNotMatch(version, /^6[456]r\d+$/, `${rel} の ${asset} に旧来の手動版 ${version} が残っている`);
      seen.add(asset);
    }
  }
  assert.ok(refs >= 30, `参照が 30 箇所以上あること（実際 ${refs}）`);
  assert.ok(seen.size >= 25, `アセットが 25 件以上あること（実際 ${seen.size}）`);
});

test("index.html と share.html は同じアセットに同じ版を使う", () => {
  const indexHtml = readFileSync(resolve(ROOT, "index.html"), "utf8");
  const shareHtml = readFileSync(resolve(ROOT, "share.html"), "utf8");
  const versionsOf = (html) => {
    const map = new Map();
    for (const m of html.matchAll(VERSION_RE)) map.set(m[1], m[2]);
    return map;
  };
  const a = versionsOf(indexHtml);
  const b = versionsOf(shareHtml);
  const shared = [...b.keys()].filter((k) => a.has(k));
  assert.ok(shared.length >= 3, `両者が共有するアセットがあること（実際 ${shared.length}）`);
  for (const asset of shared) {
    // ハッシュから導出するので原理的に一致するが、ここが食い違う階層なので
    // 「片方だけ手動で bump した」状態を将来も弾く。
    assert.equal(a.get(asset), b.get(asset), `${asset} の版が index.html と share.html で一致する`);
  }
  for (const asset of shared) {
    assert.equal(a.get(asset), hashOf(resolve(ROOT, asset)), `${asset} の版が内容ハッシュと一致する`);
  }
});

test("share-viewer.js のデータ URL は index.html と同じ版を使う", () => {
  const indexHtml = readFileSync(resolve(ROOT, "index.html"), "utf8");
  const viewer = readFileSync(resolve(ROOT, "js/share-viewer.js"), "utf8");
  const indexDb = [...indexHtml.matchAll(/data\/db\.json\?v=([0-9a-z]+)/g)].map((m) => m[1]);
  const viewerDb = [...viewer.matchAll(/data\/db\.json\?v=([0-9a-z]+)/g)].map((m) => m[1]);
  assert.ok(indexDb.length >= 1, "index.html が data/db.json を版付きで読んでいる");
  assert.ok(viewerDb.length >= 1, "share-viewer.js が data/db.json を版付きで読んでいる");
  // index.html 内には fetch と XHR の二重定義がある。両方が同じ版であること。
  assert.equal(new Set(indexDb).size, 1, `index.html の data/db.json の版が1種類に揃っていること: ${[...new Set(indexDb)]}`);
  for (const v of viewerDb) {
    assert.equal(v, indexDb[0], "share-viewer.js と index.html の data/db.json の版が一致する");
  }
});