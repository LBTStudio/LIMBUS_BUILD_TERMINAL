import { readFileSync } from "node:fs";
const db = JSON.parse(readFileSync(new URL("../data/db.json", import.meta.url), "utf8"));
const pdf = readFileSync("/tmp/new_limbus_trpg.txt", "utf8");
const names = [...new Set((db.egos || []).map((ego) => String(ego.name || "")).filter(Boolean))];
const missing = names.filter((name) => !pdf.includes(name));
console.log(JSON.stringify({ dbEgoNames: names.length, missingFromPdf: missing }, null, 2));
