#!/usr/bin/env node
/* ---------------------------------------------------------------------------
   tools/sync-asset-versions.mjs
   ?v= キャッシュバージョンをファイル内容から自動導出して index.html / share.html /
   js/share-viewer.js に同期する。ビルド不要。コミット前に1回走らせるだけ。

   なぜ内容ハッシュなのか
   ---------------------------------------------------------------------------
   これまで ?v= は「人が号文件を手で bump する」方式だった。実測で 36 箇所に
   9 つの版（64r45 / 64r60 / 65r19 / 65r68 / 65r69 / 66r23 / 66r31 / 66r32）が
   併存し、変更したファイルだけ bump する運用は「漏れたファイルだけ古い JS が
   残り直す」という形で実際に，先后 index.html と share.html の
   js/share-link.js の版が食い違い、発行側と閲覧側で別の revision が走る事故も
   起きている（docs/ui-improvement-plan.md に記録）。

   ハッシュなら版はファイル内容から決まるので、
     - bump し忘れるファイルが存在しない（編集=ハッシュ変化）
     - index.html と share.html は同じファイルから同じハッシュを引くので
       食い違いようがない
     - 編集していないファイルは URL が変わらないのでキャッシュが生き残る
   という3点が同時に解決する。版番号が))),
   読み込みが遅くならない理由は別に後述。

   使い方
     node tools/sync-asset-versions.mjs            # 同期する（ファイルを書く）
     node tools/sync-asset-versions.mjs --check    # 検査のみ。ずれてたら exit 1
     node tools/sync-asset-versions.mjs --all abc123  # 全アセットを強制破棄

   --check は tests/asset-version-sync.test.mjs から呼ばれるので、
   index.html を編集して同期し忘れると CI 的に落ちる。
--------------------------------------------------------------------------- */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, resolve, relative } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HASH_LEN = 8;

const argv = process.argv.slice(2);
const CHECK = argv.includes("--check");
const ALL = argv.includes("--all") ? argv[argv.indexOf("--all") + 1] : null;

if (ALL && /[^0-9a-zA-Z_-]/.test(ALL)) {
  console.error(`--all のトークンに使えるのは英数字と - _ だけです: ${ALL}`);
  process.exit(1);
}

/** 参照元ファイル。HTML 2 枚と、?v= を持つ CSS、そしてデータURLをハードコードしている共有ビューア。
 *  base は ?v= の相手アセットを解決する基準ディレクトリ。
 *  js/share-viewer.js は share.html（リポジトリ直下）から読み込まれるので、
 *  中の fetch("data/db.json") は実行時に document 相対＝ルート起点になる。
 *  そのため JS の base も ROOT にする。
 *  assets/design-system.css は CSS 内の url() が CSS 自身の位置（assets/）相対。 */
const SOURCES = [
  { file: "index.html", base: "." },
  { file: "share.html", base: "." },
  { file: "assets/design-system.css", base: "assets" },
  { file: "js/share-viewer.js", base: "." },
];

/* data/db.json は index.html 内で fetch と XHR の二重定義になっている
   （L57 と L62）。両方を同じハッシュに揃えて二重定義のずれも同時に潰す。 */

const hashCache = new Map();
function hashOf(absPath) {
  if (hashCache.has(absPath)) return hashCache.get(absPath);
  if (!existsSync(absPath)) return null;
  const h = createHash("sha256").update(readFileSync(absPath)).digest("hex").slice(0, HASH_LEN);
  hashCache.set(absPath, h);
  return h;
}

/** `path?v=old` の一致を全部返す。拡張子しつつ、URL 全体も返す。 */
/* woff2 も対象。tools/subset-corplogo.mjs が同じ内容を再生成しても
   ファイル名が変わらないため、中身のハッシュでキャッシュを破棄する。 */
const VERSION_RE = /((?:[A-Za-z0-9._/-]+\.(?:css|js|json|woff2))(?:\?v=)([0-9a-zA-Z._-]+))/g;

/**
 * 1 つのソースファイル内の全 ?v= を更新する。
 * 戻り値は { text, changes }。changes は人が読めるようにまとめる。
 */
function rewriteSource(source) {
  const relSource = source.file;
  const abs = resolve(ROOT, relSource);
  const baseDir = resolve(ROOT, source.base);
  const before = readFileSync(abs, "utf8");

  const changes = [];
  const after = before.replace(VERSION_RE, (whole, withQuery) => {
    const m = /^([^?]+)\?v=([0-9a-zA-Z._-]+)$/.exec(withQuery);
    if (!m) return whole;
    const [, assetRel, oldVersion] = m;
    const assetAbs = resolve(baseDir, assetRel);
    if (!existsSync(assetAbs)) {
      console.error(`  ! 参照先が存在しない: ${relSource} → ${assetRel}`);
      return whole;
    }
    const newVersion = ALL || hashOf(assetAbs);
    if (!newVersion) return whole;
    if (oldVersion !== newVersion) {
      changes.push({
        asset: relative(ROOT, assetAbs).replace(/\\/g, "/"),
        from: oldVersion,
        to: newVersion,
        bytes: readFileSync(assetAbs).length,
      });
    }
    return `${assetRel}?v=${newVersion}`;
  });

  return { text: after, before, changes };
}

/* ---------------------------------------------------------------------------
   実行。js/share-viewer.js はデータ URL を内包しているため、
   書き換えると自分自身のハッシュが変わる。だから2巡する:
     1巡目: データ URL を確定し、share-viewer.js を書く
     2巡目: その後の share-viewer.js のハッシュで share.html を書く
--------------------------------------------------------------------------- */
function run() {
  const allChanges = [];
  let wroteAny = false;

  for (const source of SOURCES) {
    const relSource = source.file;
    const { text, before, changes } = rewriteSource(source);
    allChanges.push(...changes.map((c) => ({ ...c, source: relSource })));
    if (text !== before) {
      wroteAny = true;
      if (!CHECK) writeFileSync(resolve(ROOT, relSource), text, "utf8");
    }
  }

  return { allChanges, wroteAny };
}

/* 2巡目: js/share-viewer.js はデータ URL を内包しているため、1巡目で書くと
   自分のハッシュが変わる。その新しいハッシュで share.html を直す必要がある。
   1巡目の「書き換えたアセット一覧」と 2巡目の「それ引发的追加分」を分けて集計する。 */
const pass1 = run();
let pass2 = null;
if (pass1.wroteAny || CHECK) {
  hashCache.clear();
  pass2 = run();
}

// 報告に使うのは 1巡目の全変更 + 2巡目で確定した分。
// 2巡目の結果は 1巡目の内容に対して差分なので、そのまま足すと二重計上になる。
// 必要なのは「最終的な old→new」なので、2巡目が実際に直したアセットだけ足す。
const report = [...pass1.allChanges];
if (pass2) {
  const seen = new Set(report.map((c) => `${c.source}|${c.asset}`));
  for (const c of pass2.allChanges) if (!seen.has(`${c.source}|${c.asset}`)) report.push(c);
}
const drifted = CHECK ? report : [];

if (CHECK) {
  if (drifted.length) {
    console.error("?v= が内容ハッシュと同期していません。node tools/sync-asset-versions.mjs を実行してください。\n");
    for (const c of drifted) {
      console.error(`  ${c.source}: ${c.asset}  ${c.from} → ${c.to}`);
    }
    process.exit(1);
  }
  console.log("?v= は全ファイルの内容ハッシュと同期しています。");
  process.exit(0);
}

if (!report.length) {
  console.log("同期する変更はありませんでした（すでに最新）。");
} else {
  console.log(`?v= を ${report.length} 箇所同期しました${ALL ? `（--all ${ALL} で全破棄）` : ""}:\n`);
  const w = Math.max(...report.map((c) => c.asset.length));
  for (const c of report) {
    console.log(`  ${c.asset.padEnd(w)}  ${c.from} → ${c.to}   ${(c.bytes / 1024).toFixed(1)} KB   [${c.source}]`);
  }
  const touched = new Set(report.map((c) => c.asset));
  console.log(`\n変更されたアセット ${touched.size} 件 / 参照 ${hashCache.size} 件`);
  console.log("編集していないファイルの ?v= は変わらず、ブラウザキャッシュはそのまま効きます。");
}