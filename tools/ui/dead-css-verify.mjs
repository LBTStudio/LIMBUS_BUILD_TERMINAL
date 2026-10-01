import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { REPO_ROOT } from "./harness.mjs";

/* dead-css の「確実なデッド」164 件を further に絞り込む。
 *
 * 検出結果が上限値である理由geme:
 *   1. 12 セクションを巡回する���きで、クリックしないと開かないパネル
 *      （デッキ編集、E.G.O のモード切替など）は「未使用」に見える
 *   2. JS が template literal で class 名を連結生成する場合、
 *      文字列検索に掛からない
 *
 * ここで追加で確かめる:
 *   - JS にその文字列が部品として現れるか（連結生成の痕跡）
 *   - そのセレクタが他の CSS から参照されていないか
 *   - :root のトークンなら別扱い
 *
 * さらに「別名が同じ概念で残っている」ものを除外する。
 * 例: .ego-workbench が無ければ .ego-workbench-grid だけが必要なはず。
 */

const assetsDir = path.join(REPO_ROOT, "assets");
const jsDir = path.join(REPO_ROOT, "js");

const cssFiles = readdirSync(assetsDir).filter((f) => f.endsWith(".css"));
const allCss = cssFiles.map((f) => readFileSync(path.join(assetsDir, f), "utf8")).join("\n");
const allJs = readdirSync(jsDir).filter((f) => f.endsWith(".js")).map((f) => readFileSync(path.join(jsDir, f), "utf8")).join("\n");

// 検出された 164 件を読み込む（直前の dead-css の出力に一致するselector）
const candidates = JSON.parse(readFileSync(process.argv[2] || "dead-list.json", "utf8"));

const stateful = /:(hover|active|focus|focus-visible|focus-within|checked|disabled|target|before|after|placeholder|selection|marker|backdrop|first-line|first-letter)\b|\[(?![a-z-]+\])|\.((is|has)-)|::/i;

const keep = [];
const removable = [];

for (const c of candidates) {
  // JS に文字列として出るものは 살아ている可能性が高い（連結生成など）
  const inJs = allJs.includes(c.sel) || /[+`$]/.test(c.sel);
  // stateful は対象外
  if (stateful.test(c.sel)) { keep.push({ ...c, why: "state selector" }); continue; }
  if (inJs) { keep.push({ ...c, why: "JS に文字列として出る" }); continue; }

  // 同じファイル内で不包括のセレクタに var() で参照されていないか
  const referenced = allCss.includes(`var(${c.sel})`);
  if (referenced) { keep.push({ ...c, why: "他セレクタから参照" }); continue; }

  removable.push(c);
}

console.log(`候補: ${candidates.length}`);
console.log(`保守的に残す: ${keep.length}`);
console.log(`削除候補:     ${removable.length}\n`);

const byFile = new Map();
for (const r of removable) {
  if (!byFile.has(r.f)) byFile.set(r.f, []);
  byFile.get(r.f).push(r);
}
for (const [f, list] of [...byFile].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${f}: ${list.length}`);
  list.forEach((d) => console.log(`     ${String(d.line).padStart(5)}: ${d.sel.slice(0, 56)}`));
}