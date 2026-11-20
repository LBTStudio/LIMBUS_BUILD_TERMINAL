import { readFileSync } from "node:fs";
const db = JSON.parse(readFileSync(new URL("../data/db.json", import.meta.url), "utf8"));
const list = Array.isArray(db.egos) ? db.egos : [];
const rows = [];
for (const ego of list) {
  for (const form of ["kakusei", "shinshoku"]) {
    const model = ego[form];
    if (!model) continue;
    rows.push({
      rank: ego.rank,
      no: ego.no,
      name: ego.name,
      form,
      effect: model.effect || "",
      dice: (model.dice || []).map((d) => d.effect || "")
    });
  }
}
console.log(JSON.stringify({ count: list.length, forms: rows.length, rows }, null, 2));
