import test from 'node:test';
import assert from 'node:assert/strict';
import { auditOutputContent, loadContentRuntime, CONTENT_ROUTES, visibleText } from '../tools/provenance/audit-output-content.mjs';
import { auditOutputParagraphs } from '../tools/provenance/output-paragraphs.mjs';
import { equipPersona } from '../tools/provenance/pipeline-harness.mjs';

function sampleRuntime() {
  const rt = loadContentRuntime();
  rt.db.support_passives = [rt.db.support_passives.find(s => s.name === '魔王の行進')];
  rt.db.spirits = [rt.db.spirits.find(s => s.name === '破砕痕')];
  return rt;
}

test('all DB categories reach their actual export fields with no missing text', () => {
  const rt = loadContentRuntime();
  const report = auditOutputContent(rt);
  assert.deepEqual(report.findings, []);
  assert.ok(report.checked > 28000);
  for (const [kind, count] of Object.entries(report.counts)) {
    assert.equal(count.records, rt.db[kind].length, kind);
    assert.equal(count.routes, count.records * CONTENT_ROUTES.length, kind);
    assert.ok(count.fields > 0, kind);
  }
  assert.ok(report.omittedByContract['egos/memo/summary-or-alternate-field'] > 0,
    'summary-only fields must be explicit, not silently counted as verified');
});

for (const route of CONTENT_ROUTES) {
  test(`${route.key}: complete missing effect is detected; other routes stay healthy`, () => {
    const rt = sampleRuntime();
    const body = rt.db.support_passives[0].effect;
    const report = auditOutputContent(rt, {
      kinds: ['support_passives'],
      mutate: (key, output) => key === route.key ? output.split(body).join('') : output
    });
    assert.ok(report.findings.some(f => f.route === route.key && f.path.endsWith('/effect')));
    assert.ok(report.findings.every(f => f.route === route.key));
  });
}

test('JSON memo cannot hide missing JSON commands', () => {
  const rt = sampleRuntime();
  const real = rt.gen.buildCcfoliaJSON;
  rt.gen.buildCcfoliaJSON = s => { const out = real(s); out.data.commands = ''; return out; };
  const report = auditOutputContent(rt, { kinds: ['spirits'] });
  assert.ok(report.findings.some(f => f.route === 'json.commands' && f.code === 'empty_output'));
  assert.ok(report.findings.every(f => f.route === 'json.commands'));
});

test('exceptions, empty categories and empty audits fail closed', () => {
  const rt = sampleRuntime();
  rt.gen.buildShareSheetHTML = () => { throw new Error('injected failure'); };
  const report = auditOutputContent(rt, { kinds: ['support_passives'] });
  assert.ok(report.findings.some(f => f.route === 'share' && f.code === 'output_error'));
  rt.db.support_passives = [];
  assert.ok(auditOutputContent(rt, { kinds: ['support_passives'] }).findings.some(f => f.code === 'empty_category'));
  assert.ok(auditOutputContent(rt, { kinds: [] }).findings.some(f => f.code === 'nothing_checked'));
});

test('paragraph audit no longer swallows equipment/export failures', () => {
  const rt = sampleRuntime();
  rt.db.normal_personas = [rt.db.normal_personas.find(p => p.passive_effect.includes('\n'))];
  rt.db.tokui_personas = [];
  assert.ok(auditOutputParagraphs(rt, () => { throw new Error('equip failed'); }).findings.some(f => f.code === 'equip_error'));
  rt.gen.buildShareSheetHTML = () => { throw new Error('export failed'); };
  assert.ok(auditOutputParagraphs(rt, equipPersona).findings.some(f => f.code === 'output_error'));
  assert.ok(auditOutputParagraphs(rt, equipPersona, { mutate: () => '' }).findings.some(f => f.code === 'empty_output'));
});

test('EGO regressions retain unique buffs and assimilation effects, escaping HTML', () => {
  const rt = loadContentRuntime();
  const ego = structuredClone(rt.db.egos.find(e => e.sub_skills?.length));
  ego.sub_skills[0].name = '<script>unsafe & name</script>';
  ego.sub_skills[0].effect = '使用時：SANを7回復\nマッチ勝利時：追加効果を発動';
  ego.unique_buff = '[検証用] 最大1 バフ\n効果の後半を欠落させない';
  let s = equipPersona(rt, 'n', rt.db.normal_personas[0]);
  s = rt.reducer(s, { type: 'SET_EGO_SLOT', rank: ego.rank, value: ego });
  s = rt.reducer(s, { type: 'ADD_SUPPORT', spp: { name: 'E.G.O同化', effect: '' } });
  const palette = rt.gen.buildPalette(s);
  const html = rt.gen.buildShareSheetHTML(s);
  assert.ok(visibleText(palette).includes(visibleText(ego.unique_buff)));
  assert.ok(palette.includes('精神力を7回復'));
  assert.ok(html.includes('&lt;script&gt;unsafe &amp; name&lt;/script&gt;'));
  assert.ok(!html.includes('<script>unsafe'));
  assert.ok(html.includes('追加効果を発動'));
});

test('registered shop data survive equip, save and restore', () => {
  const rt = sampleRuntime();
  let s = equipPersona(rt, 'n', rt.db.normal_personas[0]);
  s = rt.reducer(s, { type: 'ADD_SUPPORT', spp: rt.db.support_passives[0] });
  s = rt.reducer(s, { type: 'APPLY_SPIRIT', spirit: rt.db.spirits[0] });
  s = rt.reducer(s, { type: 'SAVE_PERSONA_BUILD' });
  s = equipPersona({ ...rt, initialState: s }, 'n', rt.db.normal_personas[1]);
  s = equipPersona({ ...rt, initialState: JSON.parse(JSON.stringify(s)) }, 'n', rt.db.normal_personas[0]);
  assert.equal(s.supports[0].effect, rt.db.support_passives[0].effect);
  assert.equal(s.spiritConfuse, rt.db.spirits[0].confuse_effect);
});
