import { mkdirSync, statSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

/* コーポレート・ロゴ（LOGOTYPE.JP / SIL OFL 1.1）を web 向けに subset する。
 *
 * なぜ subset が必要か
 *   配布元の OTF は 1 ウェイトあたり約 2.7 MB。Medium と Bold の 2 つをそのまま
 *   置くと約 5.4 MB になる。現状の Noto Sans JP は Google Fonts が unicode-range で
 *   分割してくれていて、実際に落ちているのは 3.06 MB。素のまま入れると約 2 倍悪化する。
 *
 * なぜ仮名だけに絞れるか
 *   このフォントは「仮名がロゴ風、漢字と英字は源ノ角ゴシック（Source Han Sans）」
 *   という構成で、漢字とラテンは Noto Sans JP と同一の由来。つまり漢字は
 *   Google Fonts の Noto Sans JP に任せれば見た目も solemn で同じになる。
 *   したがってこのフォントが担うべきなのはロゴ attorneys な仮名だけ。
 *
 *   font-family: 'CorporateLogo', 'Noto Sans JP', sans-serif
 *   とすれば、かなだけ CorporateLogo、漢字と英字は Noto Sans JP に
 *   CSS 仕様の per-character fallback で自動で分かれる。
 *
 * 使う文字
 *   U+0020-007E  ASCII（英字 数字 記号）
 *   U+00A0-00FF  Latin-1 補足
 *   U+3000-303F  CJK 記号（、。「」〜など）
 *   U+3040-30FF  ひらがな ＋ カタカナ
 *   U+FF01-FF60  全角記号（：＜＞など）
 *
 * 実行: py -3 tools/subset-corplogo.mjs
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = process.argv[2] || "C:/Users/hanap/AppData/Local/Temp/opencode/corplogo";
const OUT = resolve(ROOT, "assets/fonts");
const UNICODES = "U+0020-007E,U+00A0-00FF,U+3000-303F,U+3040-30FF,U+FF01-FF60";

mkdirSync(OUT, { recursive: true });

const rows = [];
for (const weight of ["Medium", "Bold"]) {
  // 展開すると ver3 名のサブフォルダasionally入るので一段だけ降りる
  const candidates = [
    resolve(SRC, weight, `Corporate-Logo-${weight}-ver3.otf`),
    resolve(SRC, weight, `Corporate-Logo-${weight}-ver3`, `Corporate-Logo-${weight}-ver3.otf`),
  ];
  const inFile = candidates.find((p) => existsSync(p));
  if (!inFile) {
    console.error(`  入力が無い: ${candidates[0]}`);
    console.error(`  先に配布元から ver3 の OTF を入手して展開してください（OFL 1.1・商用可）。`);
    process.exit(1);
  }
  const outFile = resolve(OUT, `corporate-logo-${weight.toLowerCase()}-subset.woff2`);
  execFileSync("py", [
    "-3", "-m", "fontTools.subset", inFile,
    `--unicodes=${UNICODES}`,
    "--flavor=woff2",
    "--layout-features=kern,liga,vert,vrt2,palt",
    "--name-IDs=*",
    "--no-hinting",
    "--desubroutinize",
    `--output-file=${outFile}`,
  ], { stdio: "pipe" });

  const src = statSync(inFile).size;
  const dst = statSync(outFile).size;
  rows.push({
    weight,
    out: outFile.replace(ROOT + "\\", "").replace(/\\/g, "/"),
    srcKB: Math.round(src / 1024),
    dstKB: Math.round(dst / 1024),
    pct: ((dst / src) * 100).toFixed(1) + "%",
  });
}

let srcTotal = 0;
let dstTotal = 0;
for (const r of rows) {
  srcTotal += r.srcKB;
  dstTotal += r.dstKB;
  console.log(`  ${r.weight.padEnd(7)} ${String(r.srcKB).padStart(5)} KB → ${String(r.dstKB).padStart(4)} KB  (${r.pct})  ${r.out}`);
}
console.log(`\n  合計 ${srcTotal} KB → ${dstTotal} KB`);
console.log("  漢字と英字は Noto Sans JP（Google Fonts）が担うので、追加転送はこの分だけ。");
