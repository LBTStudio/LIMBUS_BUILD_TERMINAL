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
    assert.doesNotMatch(html, /access-counter|lbt-access-counter|総アクセス|\/api\/stats\/view/);
    assert.match(html, /static\.cloudflareinsights\.com\/beacon\.min\.js/);
    assert.match(html, /data-cf-beacon=/);
  }
  assert.equal(existsSync(new URL("../js/access-counter.js", import.meta.url)), false);
  assert.doesNotMatch(read("sw.js"), /access-counter/);
  assert.doesNotMatch(worker, /stats\\/view|handleCounter|site_counters|COUNTER_RATE_LIMIT|cf-connecting-ip/);
  assert.doesNotMatch(schema, /site_counters/);
  assert.doesNotMatch(wrangler, /COUNTER_RATE_LIMIT/);
});

test("提供者向けCloudflare Web Analyticsビーコンだけを維持する", () => {
  for (const page of ["index.html", "share.html"]) {
    const html = read(page);
    const beacons = [...html.matchAll(/<script[^>]*static\.cloudflareinsights\.com\/beacon\.min\.js[^>]*>/g)];
    assert.equal(beacons.length, 1, page + " にCloudflare Web Analyticsビーコンが1つある");
    assert.match(beacons[0][0], /data-cf-beacon=/);
    assert.doesNotMatch(html, /lbt-recovery\.lbtstudio-share\.workers\.dev\/api\/stats/);
  }
});
