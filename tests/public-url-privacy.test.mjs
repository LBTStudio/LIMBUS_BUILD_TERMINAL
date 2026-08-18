import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const publicHtml = ["index.html", "share.html", "mobile-preview.html"]
  .map((file) => readFileSync(new URL(file, root), "utf8"))
  .join("\n");

test("公開HTMLのOGPゲートウェイは中立なブランド用Workersサブドメインだけを使う", () => {
  const hosts = [...publicHtml.matchAll(/https:\/\/lbt-ogp\.([a-z0-9-]+)\.workers\.dev/gi)]
    .map((match) => match[1].toLowerCase());
  assert.deepEqual(hosts, ["lbtstudio-share"]);
  assert.doesNotMatch(publicHtml, /@[a-z0-9.-]+\.[a-z]{2,}/i);
});
