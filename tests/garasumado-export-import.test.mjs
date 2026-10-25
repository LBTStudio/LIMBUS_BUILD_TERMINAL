import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("../js/garasumado-export-import.js", import.meta.url), "utf8");
function loadApi() {
  const context = { window: {}, module: { exports: {} }, TextDecoder,
    DecompressionStream: globalThis.DecompressionStream, Blob, Response };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: "garasumado-export-import.js" });
  return context.module.exports;
}
function put16(view, offset, value) { view.setUint16(offset, value, true); }
function put32(view, offset, value) { view.setUint32(offset, value, true); }
function makeStoredZip(files) {
  const encoder = new TextEncoder(), localParts = [], centralParts = [];
  let localOffset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name), data = encoder.encode(file.content || "");
    const local = new Uint8Array(30 + name.length + data.length);
    const lv = new DataView(local.buffer);
    put32(lv, 0, 0x04034b50); put16(lv, 4, 20); put16(lv, 6, 0x800); put16(lv, 8, 0);
    put32(lv, 18, data.length); put32(lv, 22, data.length); put16(lv, 26, name.length); put16(lv, 28, 0);
    local.set(name, 30); local.set(data, 30 + name.length); localParts.push(local);
    const central = new Uint8Array(46 + name.length), cv = new DataView(central.buffer);
    put32(cv, 0, 0x02014b50); put16(cv, 4, 20); put16(cv, 6, 20); put16(cv, 8, 0x800); put16(cv, 10, 0);
    put32(cv, 20, data.length); put32(cv, 24, data.length); put16(cv, 28, name.length);
    put16(cv, 30, 0); put16(cv, 32, 0); put32(cv, 42, localOffset);
    central.set(name, 46); centralParts.push(central); localOffset += local.length;
  }
  const centralSize = centralParts.reduce((sum, value) => sum + value.length, 0);
  const end = new Uint8Array(22), ev = new DataView(end.buffer);
  put32(ev, 0, 0x06054b50); put16(ev, 8, files.length); put16(ev, 10, files.length);
  put32(ev, 12, centralSize); put32(ev, 16, localOffset);
  const parts = [...localParts, ...centralParts, end], total = parts.reduce((sum, value) => sum + value.length, 0);
  const out = new Uint8Array(total); let offset = 0;
  for (const part of parts) { out.set(part, offset); offset += part.length; }
  return out;
}
function fakeFile(name, payload) {
  const bytes = payload instanceof Uint8Array ? payload : new TextEncoder().encode(payload);
  return { name, size: bytes.byteLength,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
}
const character = {
  id: "12345678901234567890", name: "試験キャラクター", plName: "PL", isPublic: true,
  status: { hp: 100, san: 45, speed: "1d5" },
  tactics: [{ code: "0", name: "試験", attr: "斬撃", sin: "憤怒", effect: "1d5" }],
  owned: { personas: [], egos: [], supportPassives: [], spirits: [] },
  scenarioHistory: [{ name: "試験リザルト", memo: "報酬 100LP" }]
};
const persona = {
  id: "ABCDEFGHIJKLMNOPQRST", name: "試験人格", isPublic: true,
  status: { hp: "100", san: "45", speed: "1d5", slash: "普通", pierce: "普通", blunt: "普通", bullet: 0 },
  tactics: [{ code: "0", name: "試験戦術", attr: "斬撃", sin: "憤怒", effect: "1d5" }],
  passive: { name: "試験パッシブ", condition: "", alwaysEffect: "", effect: "" },
  uniques: [], enhancements: [], memo: "", chatPaletteAuto: "", chatPaletteManual: ""
};

test("ZIPからキャラクター履歴と人格JSONのみを読み、画像・PDF・TXTを除外する", async () => {
  const api = loadApi();
  const zip = makeStoredZip([
    { name: "export/キャラクター/character.json", content: JSON.stringify(character) },
    { name: "export/人格シート/persona.json", content: JSON.stringify(persona) },
    { name: "export/画像/avatar.png", content: "not-an-image" },
    { name: "export/説明書.pdf", content: "not-a-pdf" },
    { name: "export/メモ.txt", content: "not-a-text-file" }
  ]);
  const parsed = await api.readFiles([fakeFile("硝子窓.zip", zip)]);
  assert.equal(parsed.characters.length, 1);
  assert.equal(parsed.personas.length, 1);
  assert.equal(parsed.characters[0].data.scenarioHistory.length, 1);
  assert.equal(parsed.personas[0].data.name, "試験人格");
  assert.equal(parsed.ignoredCount, 3);
  assert.deepEqual(JSON.parse(JSON.stringify(parsed.errors)), []);
});
test("複数JSONを直接選択しても一括分類し、同じ人格IDを重複登録しない", async () => {
  const api = loadApi();
  const parsed = await api.readFiles([
    fakeFile("character.json", JSON.stringify(character)),
    fakeFile("persona.json", JSON.stringify(persona)),
    fakeFile("persona-duplicate.json", JSON.stringify(persona)),
    fakeFile("cover.png", "ignored")
  ]);
  assert.equal(parsed.characters.length, 1);
  assert.equal(parsed.personas.length, 1);
  assert.equal(parsed.ignoredCount, 2);
  assert.equal(parsed.errors.length, 0);
});
test("破損したJSONと破損ZIPは理由付きで返し、正常な入力の解析を止めない", async () => {
  const api = loadApi();
  const parsed = await api.readFiles([
    fakeFile("broken.json", "{"), fakeFile("broken.zip", "not a zip"), fakeFile("persona.json", JSON.stringify(persona))
  ]);
  assert.equal(parsed.personas.length, 1);
  assert.equal(parsed.errors.length, 2);
  assert.match(parsed.errors[0].message, /JSONとして解析できません/);
  assert.match(parsed.errors[1].message, /ZIPの終了レコード/);
});
