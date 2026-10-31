import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const read = (path) => readFileSync(new URL("../" + path, import.meta.url), "utf8");
const worker = read("cloudflare/recovery-worker/worker.js");
const schema = read("cloudflare/recovery-worker/schema.sql");
const wrangler = read("cloudflare/recovery-worker/wrangler.toml");

test("アクセスカウンターを利用者画面と配信キャッシュから撤去する", () => {
  for (const page of ["index.html", "share.html"]) {
    const html = read(page);
    assert.doesNotMatch(html, /access-counter|lbt-access-counter|総アクセス/);
    assert.ok(!html.includes("/api/stats/view"));
    assert.ok(html.includes("static.cloudflareinsights.com/beacon.min.js"));
    assert.ok(html.includes("data-cf-beacon="));
  }
  assert.equal(existsSync(new URL("../js/access-counter.js", import.meta.url)), false);
  assert.doesNotMatch(read("sw.js"), /access-counter/);
  assert.ok(!worker.includes("/api/stats/view"));
  assert.doesNotMatch(worker, /handleCounter|site_counters|COUNTER_RATE_LIMIT|cf-connecting-ip/);
  assert.doesNotMatch(schema, /site_counters/);
  assert.doesNotMatch(wrangler, /COUNTER_RATE_LIMIT/);
});

test("提供者向けCloudflare Web Analyticsビーコンだけを維持する", () => {
  for (const page of ["index.html", "share.html"]) {
    const html = read(page);
    const beacons = [...html.matchAll(/<script[^>]*static\.cloudflareinsights\.com\/beacon\.min\.js[^>]*>/g)];
    assert.equal(beacons.length, 1, page + " にCloudflare Web Analyticsビーコンが1つある");
    assert.ok(beacons[0][0].includes("data-cf-beacon="));
  }
});
