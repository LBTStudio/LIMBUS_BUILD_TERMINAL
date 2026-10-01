/* 2 組のスクリーンショットをピクセル比較する。
 *
 *   node tools/ui/compare-shots.mjs <tagA> <tagB>
 *
 * 差分のバウンディングボックスと最大デルタをセクションごとに出す。
 * 差分がある場合は切り出した比較画像も保存する（corpse_post — 差分領域のみ）。
 *
 * 注意: 描画は決定的であるべきだが、実際には環境差で 1px 動くことがある。
 * 先に同一ツリーを 2 回撮って（node tools/ui/capture.mjs x1 && x2）、
 * 同じツリーで差分が出ないことを確認してから変更前後を比較する。
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { requireDep, SHOT_DIR, SECTIONS } from "./harness.mjs";

const Png = requireDep("pngjs").PNG;

const tagA = process.argv[2];
const tagB = process.argv[3];
if (!tagA || !tagB) {
  console.error("usage: node tools/ui/compare-shots.mjs <tagA> <tagB>");
  process.exit(1);
}

const read = (tag, id) => Png.sync.read(readFileSync(path.join(SHOT_DIR, `${tag}-${id}.png`)));

let identical = 0;
const diffs = [];

for (let i = 0; i < SECTIONS.length; i++) {
  const id = String(i).padStart(2, "0");
  const a = read(tagA, id);
  const b = read(tagB, id);
  if (a.width !== b.width || a.height !== b.height) {
    diffs.push({ i, sizeMismatch: true, a: `${a.width}x${a.height}`, b: `${b.width}x${b.height}` });
    continue;
  }
  let count = 0;
  let maxDelta = 0;
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let p = 0; p < a.data.length; p += 4) {
    const d = Math.max(
      Math.abs(a.data[p] - b.data[p]),
      Math.abs(a.data[p + 1] - b.data[p + 1]),
      Math.abs(a.data[p + 2] - b.data[p + 2]),
    );
    if (!d) continue;
    count++;
    if (d > maxDelta) maxDelta = d;
    const px = (p / 4) % a.width;
    const py = Math.floor(p / 4 / a.width);
    if (px < x0) x0 = px;
    if (px > x1) x1 = px;
    if (py < y0) y0 = py;
    if (py > y1) y1 = py;
  }
  if (!count) { identical++; continue; }
  diffs.push({ i, count, maxDelta, x0, y0, x1, y1 });
}

console.log(`identical sections: ${identical}/${SECTIONS.length}\n`);
for (const d of diffs) {
  if (d.sizeMismatch) {
    console.log(`  ${String(d.i).padStart(2)} ${SECTIONS[d.i].padEnd(6)} SIZE ${d.a} vs ${d.b}`);
    continue;
  }
  const w = d.x1 - d.x0 + 1, h = d.y1 - d.y0 + 1;
  console.log(`  ${String(d.i).padStart(2)} ${SECTIONS[d.i].padEnd(6)} ${String(d.count).padStart(7)} px  maxDelta=${String(d.maxDelta).padStart(3)}  bbox=(${d.x0},${d.y0})-(${d.x1},${d.y1})  ${w}x${h}`);
}

// 差分があれば切り出して保存（上下に並べた比較画像）
if (diffs.length) {
  const GAP = 6;
  for (const d of diffs) {
    if (d.sizeMismatch) continue;
    const a = read(tagA, String(d.i).padStart(2, "0"));
    const b = read(tagB, String(d.i).padStart(2, "0"));
    const w = d.x1 - d.x0 + 1, h = d.y1 - d.y0 + 1;
    const out = new Png({ width: w, height: h * 2 + GAP });
    for (const [src, dy] of [[a, 0], [b, h + GAP]]) {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const si = ((y + d.y0) * src.width + (x + d.x0)) * 4;
          const di = ((y + dy) * w + x) * 4;
          out.data[di] = src.data[si];
          out.data[di + 1] = src.data[si + 1];
          out.data[di + 2] = src.data[si + 2];
          out.data[di + 3] = 255;
        }
      }
    }
    const file = path.join(SHOT_DIR, `diff-${SECTIONS[d.i]}-${tagA}-vs-${tagB}.png`);
    writeFileSync(file, Png.sync.write(out));
    console.log(`\n  -> ${file}  (top=${tagA} bottom=${tagB})`);
  }
  process.exitCode = 1;
}