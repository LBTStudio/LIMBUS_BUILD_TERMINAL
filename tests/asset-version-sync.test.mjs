import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, writeFileSync, mkdirSync, rmSync, cpSync } from "node:fs";
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

/* バイナリは生バイトでハッシュする。 */
const BINARY_EXT = /\.(?:woff2)$/i;

/* テキストは改行を LF に正規化してからハッシュする。
   tools/sync-asset-versions.mjs の hashOf() と同じ契約で、この二重実装は
   意図的に残している（ツールの計算済み値をそのままなぞるだけの検査だと
   検査にならないため）。ここが生バイトだと Windows の core.autocrlf と
   Linux/macOS の既定とで期待値が割れ、参加者ごとに別の版になる。 */
function hashOf(abs) {
  const raw = readFileSync(abs);
  const buf = BINARY_EXT.test(abs)
    ? raw
    : Buffer.from(raw.toString("utf8").replace(/\r\n/g, "\n"), "utf8");
  return createHash("sha256").update(buf).digest("hex").slice(0, HASH_LEN);
}

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

test("?v= はチェックアウト時の行末（CRLF / LF）に依存しない", () => {
  /* 2026-10-03 の回帰。core.autocrlf は各マシンの設定でリポジトリには書けない。
     ハッシュが生バイトだと、Windows では 26/30、LF 環境では 0/30 が一致して
     全参照が偽の不一致になる。ここでは各アセットを CRLF に変換しても
     コミット済みの版が変わらないことを固定する。 */
  const indexHtml = readFileSync(resolve(ROOT, "index.html"), "utf8");
  const seen = new Set();
  let checked = 0;
  let eolFree = 0;
  for (const m of indexHtml.matchAll(VERSION_RE)) {
    const [, asset, version] = m;
    if (seen.has(asset)) continue;
    seen.add(asset);
    if (BINARY_EXT.test(asset)) continue;
    const raw = readFileSync(resolve(ROOT, asset), "utf8");
    /* 改行ゼロのミニファイ済みファイル（data/db.json）は元々 EOL 非依存。 */
    if (!raw.includes("\n")) {
      eolFree++;
      continue;
    }
    const asCrlf = raw.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n");
    assert.equal(
      createHash("sha256")
        .update(Buffer.from(asCrlf.replace(/\r\n/g, "\n"), "utf8"))
        .digest("hex")
        .slice(0, HASH_LEN),
      version,
      `${asset} の版は CRLF チェックアウトでも一致する`
    );
    checked++;
  }
  assert.ok(checked >= 20, `改行を含むアセットが 20 件以上あること（実際 ${checked}）`);
  assert.ok(eolFree >= 1, `改行ゼロのアセットを 1 件以上見分けていること（実際 ${eolFree}）`);
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
/* ---------------------------------------------------------------------------
   逆方向スキャン。VERSION_RE は `?v=` のある参照しか見ないので、
   「版パラメータの無い参照」と「参照先が 実在しないアセット」は
   構造的に検出できなかった。tools/sync-asset-versions.mjs の scanRefs() が
   両方を見て exit 1 になることを、実際の CLI 実行で固定する。

   ツールは ROOT を自分の位置から求めるので、隔離した最小構成に
   コピーして実行する。既存ファイルを汚さない。
--------------------------------------------------------------------------- */

function buildScanFixture(dir, indexBody) {
  mkdirSync(resolve(dir, "tools"), { recursive: true });
  mkdirSync(resolve(dir, "js"), { recursive: true });
  mkdirSync(resolve(dir, "assets"), { recursive: true });
  cpSync(TOOL, resolve(dir, "tools/sync-asset-versions.mjs"));
  writeFileSync(resolve(dir, "js/app.js"), "console.log(1);\n", "utf8");
  writeFileSync(resolve(dir, "js/data.json"), '{"a":1}', "utf8");
  /* ツールは SOURCES を無条件に読む。実リポジトリと同じ 4 ファイルを立てる。 */
  writeFileSync(resolve(dir, "share.html"), "<!DOCTYPE html></body>", "utf8");
  writeFileSync(resolve(dir, "assets/design-system.css"), ":root{}\n", "utf8");
  writeFileSync(resolve(dir, "js/share-viewer.js"), "// viewer\n", "utf8");
  writeFileSync(resolve(dir, "index.html"), indexBody, "utf8");
}

/** 隔離環境での --check 実行。exit code と出力を返す。 */
function runCheckInFixture(dir) {
  try {
    const stdout = execFileSync(process.execPath, ["tools/sync-asset-versions.mjs", "--check"], {
      cwd: dir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, stdout, stderr: "" };
  } catch (err) {
    return { code: err.status ?? -1, stdout: err.stdout ?? "", stderr: err.stderr ?? "" };
  }
}

const SCAN_DIR = resolve(ROOT, "tmp/asset-version-scan-fixture");

test("--check は正常な参照なら exit 0", () => {
  rmSync(SCAN_DIR, { recursive: true, force: true });
  const appV = createHash("sha256").update("console.log(1);\n").digest("hex").slice(0, HASH_LEN);
  const jsonV = createHash("sha256").update('{"a":1}').digest("hex").slice(0, HASH_LEN);
  buildScanFixture(
    SCAN_DIR,
    `<!DOCTYPE html><script src="js/app.js?v=${appV}"></script>` +
      `<script>fetch("js/data.json?v=${jsonV}")</script></body>`
  );
  const r = runCheckInFixture(SCAN_DIR);
  assert.equal(r.code, 0, `正常系は exit 0 のはず\n${r.stdout}${r.stderr}`);
  rmSync(SCAN_DIR, { recursive: true, force: true });
});

test("--check は版パラメータの無い参照で exit 1", () => {
  rmSync(SCAN_DIR, { recursive: true, force: true });
  buildScanFixture(SCAN_DIR, '<!DOCTYPE html><script src="js/app.js"></script></body>');
  const r = runCheckInFixture(SCAN_DIR);
  assert.equal(r.code, 1, `版無しの参照は exit 1 のはず\n${r.stdout}${r.stderr}`);
  assert.match(r.stderr, /版パラメータの無いアセット参照/);
  assert.match(r.stderr, /js\/app\.js/);
  rmSync(SCAN_DIR, { recursive: true, force: true });
});

test("--check は存在しないアセット参照で exit 1", () => {
  rmSync(SCAN_DIR, { recursive: true, force: true });
  buildScanFixture(SCAN_DIR, '<!DOCTYPE html><script src="js/ghost.js?v=deadbeef"></script></body>');
  const r = runCheckInFixture(SCAN_DIR);
  assert.equal(r.code, 1, `存在しない参照は exit 1 のはず\n${r.stdout}${r.stderr}`);
  assert.match(r.stderr, /参照先が存在しないアセット/);
  assert.match(r.stderr, /js\/ghost\.js/);
  rmSync(SCAN_DIR, { recursive: true, force: true });
});

test("--check は版の不一致で exit 1", () => {
  rmSync(SCAN_DIR, { recursive: true, force: true });
  buildScanFixture(SCAN_DIR, '<!DOCTYPE html><script src="js/app.js?v=00000000"></script></body>');
  const r = runCheckInFixture(SCAN_DIR);
  assert.equal(r.code, 1, `版の不一致は exit 1 のはず\n${r.stdout}${r.stderr}`);
  assert.match(r.stderr, /同期していません/);
  rmSync(SCAN_DIR, { recursive: true, force: true });
});
