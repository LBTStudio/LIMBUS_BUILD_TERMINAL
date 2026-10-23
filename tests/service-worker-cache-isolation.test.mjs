import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../sw.js", import.meta.url), "utf8");

test("activate deletes only stale caches that contain this app's own pages", async () => {
  const cacheName = source.match(/const CACHE_NAME = "([^"]+)"/)?.[1];
  assert.ok(cacheName, "the generated current cache name is present");

  const swLocation = new URL("https://example.test/LBTStudio/LIMBUS_BUILD_TERMINAL/sw.js");
  const ownPage = (name) => new URL(name, swLocation).href;
  const otherProjectIndex = "https://example.test/LBTStudio/limbus-party-color-board/index.html";

  const contents = new Map([
    [cacheName, [{ url: ownPage("index.html") }]],
    ["lbt-old-version", [{ url: ownPage("index.html") }, { url: ownPage("share.html") }]],
    ["another-app-cache", [{ url: otherProjectIndex }]],
    ["lbt-other-project-cache", [{ url: otherProjectIndex }]],
    ["unrelated-empty-cache", []],
    ["unreadable-cache", null]
  ]);
  const deleted = [];
  const listeners = Object.create(null);
  const self = {
    location: swLocation,
    addEventListener(type, handler) { listeners[type] = handler; },
    skipWaiting: async () => {},
    clients: { claim: async () => {} }
  };
  const caches = {
    keys: async () => [...contents.keys()],
    open: async (name) => {
      if (!contents.has(name) || contents.get(name) === null) throw new Error("cache cannot be inspected");
      return { keys: async () => contents.get(name) };
    },
    delete: async (name) => {
      deleted.push(name);
      return contents.delete(name);
    }
  };

  runInNewContext(source, { self, caches, URL });

  let activation;
  listeners.activate({ waitUntil(promise) { activation = promise; } });
  await activation;

  assert.deepEqual(deleted, ["lbt-old-version"]);
  assert.ok(contents.has("another-app-cache"));
  assert.ok(contents.has("lbt-other-project-cache"));
  assert.ok(contents.has("unreadable-cache"), "uninspectable caches are preserved");
});
