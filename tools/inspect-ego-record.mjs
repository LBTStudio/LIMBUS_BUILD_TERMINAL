import { readFileSync } from "node:fs";
const db = JSON.parse(readFileSync(new URL("../data/db.json", import.meta.url), "utf8"));
const groups = ["egos", "ego", "ego_data"];
for (const group of groups) {
  const list = db[group];
  if (!Array.isArray(list)) continue;
  for (const item of list) {
    if (String(item.name || "").includes("終末カレンダー")) {
      console.log(JSON.stringify({ group, item }, null, 2));
    }
  }
}
