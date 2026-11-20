import { readFileSync, writeFileSync } from "node:fs";
const path = new URL("../data/db.json", import.meta.url);
const db = JSON.parse(readFileSync(path, "utf8"));
const target = (db.egos || []).find((ego) => ego.name === "迫りくる日：終末カレンダー");
if (!target) throw new Error("終末カレンダーのE.G.Oレコードが見つかりません");
// 正規基準は新リンバスTRPG.pdf（251ページ相当）とdata/db.jsonのみ。
target.kakusei.effect = "対象のHPが25％未満ならダメージ量+8";
target.kakusei.dice[0].effect = "敵討伐時、次のRにパワー2を得て全ての味方のHPを15回復";
target.shinshoku.effect = "[敵味方識別不可]対象のHPが25％未満ならダメージ量+8";
target.shinshoku.dice[0].effect = "敵討伐失敗時、次のRに出血10とパワー3を得る";
/* data/db.json を直接書き換える。dry-run 既定にして、
   打ち間違いでも本番データを壊さないようにする。 */
const write = process.argv.includes("--write");

console.log(JSON.stringify(target, null, 2));

if (!write) {
  console.error("\n[--write 無し] data/db.json は変更していません。");
  console.error("適用するには: node tools/repair-end-calendar.mjs --write");
  process.exit(0);
}

writeFileSync(path, JSON.stringify(db));
console.log("\ndata/db.json を更新しました。");
