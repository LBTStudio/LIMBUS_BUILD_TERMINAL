import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TOOL_SOURCE = path.join(ROOT, "tools", "ui", "remove-dead-css.mjs");
const HARNESS_SOURCE = path.join(ROOT, "tools", "ui", "harness.mjs");

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "lbt-dead-css-safety-"));
  mkdirSync(path.join(root, "tools", "ui"), { recursive: true });
  mkdirSync(path.join(root, "assets"), { recursive: true });
  mkdirSync(path.join(root, "tmp"), { recursive: true });
  writeFileSync(path.join(root, "tools", "ui", "remove-dead-css.mjs"), readFileSync(TOOL_SOURCE, "utf8"));
  writeFileSync(path.join(root, "tools", "ui", "harness.mjs"), readFileSync(HARNESS_SOURCE, "utf8"));
  return root;
}

function runTool(root, listPath, ...flags) {
  return spawnSync(process.execPath, [
    path.join(root, "tools", "ui", "remove-dead-css.mjs"),
    listPath,
    ...flags
  ], { cwd: root, encoding: "utf8" });
}

function writeCandidates(root, records) {
  const file = path.join(root, "tmp", "dead-list.json");
  writeFileSync(file, JSON.stringify(records), "utf8");
  return file;
}

test("dead CSS removal defaults to dry-run; --apply is required to modify files", () => {
  const root = fixture();
  const cssPath = path.join(root, "assets", "sample.css");
  const original = ".unused { color: red; }\n.keep { color: blue; }\n";
  writeFileSync(cssPath, original, "utf8");
  const candidates = writeCandidates(root, [{ f: "sample.css", sel: ".unused" }]);

  try {
    const dryRun = runTool(root, candidates);
    assert.equal(dryRun.status, 0, dryRun.stderr);
    assert.match(dryRun.stdout, /dry-run; files unchanged/);
    assert.equal(readFileSync(cssPath, "utf8"), original, "既定実行はCSSを変更しない");

    const applied = runTool(root, candidates, "--apply");
    assert.equal(applied.status, 0, applied.stderr);
    const result = readFileSync(cssPath, "utf8");
    assert.doesNotMatch(result, /\.unused/);
    assert.match(result, /\.keep/);
    assert.match(applied.stdout, /applied/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("dead CSS removal rejects candidate paths outside assets without touching files", () => {
  const root = fixture();
  const victimPath = path.join(root, "victim.css");
  const cssPath = path.join(root, "assets", "sample.css");
  const originalVictim = ".unused { color: black; }\n";
  const originalAsset = ".unused { color: red; }\n";
  writeFileSync(victimPath, originalVictim, "utf8");
  writeFileSync(cssPath, originalAsset, "utf8");
  const candidates = writeCandidates(root, [{ f: "../victim.css", sel: ".unused" }]);

  try {
    const result = runTool(root, candidates, "--apply");
    assert.notEqual(result.status, 0, "assets外へのパスは拒否される");
    assert.match(result.stderr, /assets直下のCSSファイル名ではありません/);
    assert.equal(readFileSync(victimPath, "utf8"), originalVictim);
    assert.equal(readFileSync(cssPath, "utf8"), originalAsset, "候補全体の検証前に一部を書き換えない");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("dead CSS removal rejects unknown flags and conflicting modes", () => {
  const root = fixture();
  const cssPath = path.join(root, "assets", "sample.css");
  const original = ".unused { color: red; }\n";
  writeFileSync(cssPath, original, "utf8");
  const candidates = writeCandidates(root, [{ f: "sample.css", sel: ".unused" }]);

  try {
    const unknown = runTool(root, candidates, "--force");
    assert.notEqual(unknown.status, 0);
    const conflict = runTool(root, candidates, "--apply", "--dry-run");
    assert.notEqual(conflict.status, 0);
    assert.equal(readFileSync(cssPath, "utf8"), original);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
