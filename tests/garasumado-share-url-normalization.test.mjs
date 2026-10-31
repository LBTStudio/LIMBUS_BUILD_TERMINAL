import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../js/garasumado-roster-import.js", import.meta.url), "utf8");
const context = { window: {}, module: { exports: {} }, console, URL };
vm.createContext(context);
vm.runInContext(source, context, { filename: "garasumado-roster-import.js" });
const gara = context.module.exports;
const id = "AbCdEf123456_789-XYZ";
const host = "lbt-garasumado.vercel.app";
const official = `https://${host}/view/${id}`;

test("share URL parsing accepts full-width Japanese brackets and punctuation", () => {
  for (const input of [`（${official}）`, `［${official}］`, `「${official}」。`]) {
    const parsed = gara.parseShareUrl(input);
    assert.equal(parsed.ok, true, input);
    assert.equal(parsed.id, id);
    assert.equal(parsed.collection, "characters");
  }
});

test("share URL parsing trims Japanese particles attached after the route ID", () => {
  for (const suffix of ["から", "まで", "について", "です"]) {
    const parsed = gara.parseShareUrl(official + suffix + "。");
    assert.equal(parsed.ok, true, suffix);
    assert.equal(parsed.id, id);
  }
});

test("scheme-less official URLs wrapped in Japanese brackets are recognized", () => {
  const parsed = gara.parseShareUrl(`（${host}/view/${id}）`);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.id, id);
  const many = gara.parseShareUrls(`（${host}/view/${id}）`);
  assert.equal(many.urls.length, 1);
  assert.equal(many.urls[0].id, id);
  assert.equal(many.invalid.length, 0);
});

test("multiple URL parsing keeps valid official links and reports foreign hosts", () => {
  const parsed = gara.parseShareUrls(`（${official}）\nhttps://example.invalid/view/${id}`);
  assert.equal(parsed.urls.length, 1);
  assert.equal(parsed.urls[0].id, id);
  assert.equal(parsed.invalid.length, 1);
  assert.match(parsed.invalid[0].reason, /共有URL|URL形式/);
});

test("URL normalization never truncates valid ASCII characters from share IDs", () => {
  const extendedId = id + "ABC_9-z";
  const parsed = gara.parseShareUrl(`（https://${host}/view/${extendedId}）`);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.id, extendedId);
});

test("the known rd.nan7.net wrapper remains supported but arbitrary outer hosts do not", () => {
  const wrapped = gara.parseShareUrl(`https://rd.nan7.net/${official}`);
  assert.equal(wrapped.ok, true);
  assert.equal(wrapped.id, id);
  const wrappedMany = gara.parseShareUrls(`https://rd.nan7.net/${official}`);
  assert.equal(wrappedMany.urls.length, 1);
  assert.equal(wrappedMany.urls[0].id, id);
  assert.equal(gara.parseShareUrl(`https://outside.invalid/${official}`).ok, false);
});

test("URL normalization does not permit lookalike or foreign hosts", () => {
  for (const url of [
    `https://${host}.example.invalid/view/${id}`,
    `https://example.invalid/${official}`
  ]) {
    assert.equal(gara.parseShareUrl(url).ok, false, url);
  }
});
