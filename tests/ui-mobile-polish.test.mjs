import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workspace = readFileSync(new URL("../assets/workspace.css", import.meta.url), "utf8");
const draftImport = readFileSync(new URL("../assets/v65r29-draft-import.css", import.meta.url), "utf8");
const refinements = readFileSync(new URL("../assets/v56-refinements.css", import.meta.url), "utf8");
const accounts = readFileSync(new URL("../assets/v66-accounts.css", import.meta.url), "utf8");

test("mobile preview toggle is a compact horizontal pill above the fixed navigation", () => {
  const mobile = workspace.slice(workspace.lastIndexOf("/* Mobile UX audit:"));
  assert.match(mobile, /@media \(max-width: 640px\)/);
  assert.match(mobile, /\.preview-edge-toggle\s*\{[\s\S]*?top:\s*auto;/);
  assert.match(mobile, /bottom:\s*calc\(114px \+ env\(safe-area-inset-bottom, 0px\) \+ 8px\)/);
  assert.match(mobile, /writing-mode:\s*horizontal-tb/);
  assert.match(mobile, /border-radius:\s*999px/);
  assert.match(refinements, /\.focus \{ padding-bottom: calc\(var\(--lbt-mobile-rail-h\) \+ 60px\); \}/);
});

test("mobile section heading can use the full row and avoids one-character orphan wrapping", () => {
  const mobile = workspace.slice(workspace.lastIndexOf("/* Mobile UX audit:"));
  assert.match(mobile, /\.section-title-row\s*\{\s*padding-right:\s*0;/);
  assert.match(mobile, /\.section-title\s*\{[\s\S]*?font-size:\s*clamp\(16px, 4\.4vw, 18px\)/);
  assert.match(mobile, /text-wrap:\s*balance/);
});

test("mobile persona import keeps the heading balanced and action controls sticky", () => {
  const mobile = draftImport.slice(draftImport.lastIndexOf("/* Mobile audit:"));
  assert.match(mobile, /\.persona-draft-dialog-head p\s*\{[\s\S]*?font-size:\s*clamp\(9px, 2\.7vw, 10px\)/);
  assert.match(mobile, /text-wrap:\s*balance/);
  assert.match(mobile, /\.persona-draft-import-actions\s*\{[\s\S]*?position:\s*sticky;[\s\S]*?bottom:\s*0/);
  assert.match(mobile, /\.persona-draft-import-actions > \.btn\s*\{[\s\S]*?min-height:\s*42px/);
});


test("mobile account cards reserve space for their absolute edit/delete buttons", () => {
  assert.match(accounts, /\.acct-card \{ min-height: 124px; padding: var\(--s-3\) var\(--s-2\) calc\(var\(--s-2\) \+ 32px\); \}/);
});
