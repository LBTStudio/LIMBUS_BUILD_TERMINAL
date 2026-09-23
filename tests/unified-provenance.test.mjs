import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const detector = 'tools/provenance/detect_pdf_data.py';
const python = process.env.PYTHON || 'python3';
function run(args) {
  const result = spawnSync(python, args, { cwd: root, encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024 });
  assert.ifError(result.error);
  return result;
}

test('source geometry, omissions and corruption mutation suite passes', () => {
  const result = run(['-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_pdf_detector.py', '-v']);
  assert.equal(result.status, 0, result.stdout + result.stderr);
});

test('live PDF extraction reproduces committed shop evidence and registered DB', () => {
  const result = run([detector, '--scope', 'pack-shop', '--check-db', '--include-candidates', '--json']);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const report = JSON.parse(result.stdout);
  const evidence = JSON.parse(readFileSync(new URL('../data/provenance/pack1-shop.json', import.meta.url), 'utf8'));
  assert.equal(report.scope_passed, true);
  assert.equal(report.goal_complete, false, 'a supported subset is not the complete goal');
  assert.deepEqual(report.candidate_counts, { support_passives: 29, spirits: 5 });
  assert.deepEqual(report.registration_changes, []);
  assert.deepEqual(report.candidates, evidence.candidates);
  assert.deepEqual(report.sources[0], evidence.source);
});

test('all PDFs reproduce the ledger digest, while unsupported scope remains a failure', () => {
  const before = readFileSync(new URL('../data/db.json', import.meta.url));
  const result = run([detector, '--scope', 'all', '--json']);
  assert.equal(result.status, 1, 'unimplemented categories must not be a successful full-source audit');
  const report = JSON.parse(result.stdout);
  const saved = JSON.parse(readFileSync(new URL('../data/provenance/all-audit.json', import.meta.url), 'utf8'));
  assert.equal(report.sources.length, 4);
  assert.equal(report.sources.reduce((n, s) => n + s.pages, 0), 1429);
  assert.equal(report.sources.reduce((n, s) => n + s.rows, 0), 43977);
  assert.deepEqual(report, saved, 'source snapshot and page dispositions must reproduce exactly');
  assert.equal(report.goal_complete, false);
  assert.ok(report.issues.length > 0);
  assert.deepEqual(readFileSync(new URL('../data/db.json', import.meta.url)), before);
});
