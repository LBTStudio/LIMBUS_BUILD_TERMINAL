#!/usr/bin/env node
/* Actual export presence audit. Unlike the paragraph-only audit, absent text,
   empty exports and exceptions fail. JSON commands and memo are checked
   independently so a healthy memo cannot mask broken commands.
   This checks DB -> output, NOT PDF -> DB or field-level UI rendering. */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { loadRuntime, equipPersona } from './pipeline-harness.mjs';

export const CONTENT_ROUTES = [
  { key: 'palette', build: (g, s) => g.buildPalette(s), family: 'palette' },
  { key: 'memo', build: (g, s) => g.buildMemo(s), family: 'memo' },
  { key: 'json.commands', build: (g, s) => g.buildCcfoliaJSON(s).data.commands, family: 'palette' },
  { key: 'json.memo', build: (g, s) => g.buildCcfoliaJSON(s).data.memo, family: 'memo' },
  { key: 'share', build: (g, s) => g.buildShareSheetHTML(s), family: 'share' }
];

export function visibleText(value, html = false) {
  let text = String(value ?? '');
  if (html) text = text.replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#(?:39|x27);/gi, "'").replace(/&amp;/g, '&');
  // Display-only timing brackets/arrows and colon styling. Preserve digits,
  // signs, Japanese punctuation and square/round brackets in rules text.
  return text.normalize('NFKC').replace(/\\n/g, '').replace(/[\s【】▶◆\uFE0E\uFE0F:]/g, '');
}

function fieldsFor(kind, record) {
  const fields = [];
  const add = (path, text, routes = ['palette', 'memo', 'share']) => {
    if (typeof text === 'string' && text.trim()) fields.push({ path, text, routes });
  };
  const skill = (s, path, routes) => {
    add(`${path}/name`, s?.name, routes);
    add(`${path}/effect`, s?.effect, routes);
    (s?.dice || []).forEach((d, n) => add(`${path}/dice/${n}/effect`, d.effect, routes));
  };
  // Character identity is carried by JSON.name / memo / share; the tactical
  // chat palette has no persona-name header. Do not mistake that contract for
  // lost rules text. These exclusions remain counted in omittedByContract.
  add('name', record.name, kind.endsWith('personas') ? ['memo', 'share'] : undefined);
  if (kind.endsWith('personas')) {
    for (const key of ['passive_name', 'passive_cond', 'passive_always', 'passive_effect']) add(key, record[key]);
    (record.unique_buffs || []).forEach((b, n) => { add(`unique_buffs/${n}/name`, b.name); add(`unique_buffs/${n}/desc`, b.desc); });
    // Memo is intentionally a build summary, not a tactical command list.
    (record.skills || []).forEach((s, n) => skill(s, `skills/${n}`, ['palette', 'share']));
  } else if (kind === 'egos') {
    // Memo deliberately contains only equipment name/resources/SAN cost.
    for (const key of ['passive_name', 'passive_cond', 'passive_effect', 'unique_buff']) add(key, record[key], ['palette', 'share']);
    for (const key of ['kakusei', 'shinshoku']) skill(record[key], key, ['palette', 'share']);
    (record.sub_skills || []).forEach((s, n) => skill(s, `sub_skills/${n}`, ['palette', 'share']));
  } else if (kind === 'spirits') {
    for (const key of ['always_effect', 'morale_effect', 'confuse_effect']) {
      add(key, record[key], key === 'morale_effect' && record[key] === 'なし' ? ['palette', 'share'] : undefined);
    }
  } else if (kind === 'items') {
    add('effect', record.effect, ['memo', 'share']);
    add('palette', record.palette || record.effect, ['palette']);
  } else {
    add('cond', record.cond);
    add('effect', record.effect);
  }
  return fields;
}

function equip(runtime, kind, record) {
  let state;
  if (kind.endsWith('personas')) return equipPersona(runtime, kind === 'normal_personas' ? 'n' : 't', record);
  state = equipPersona(runtime, 'n', runtime.db.normal_personas[0]);
  if (kind === 'egos') {
    state = runtime.reducer(state, { type: 'SET_EGO_SLOT', rank: record.rank, value: record });
    if (record.sub_skills?.length) state = runtime.reducer(state, { type: 'ADD_SUPPORT', spp: { name: 'E.G.O同化', effect: '' } });
  } else if (kind === 'support_passives') state = runtime.reducer(state, { type: 'ADD_SUPPORT', spp: record });
  else if (kind === 'death_passives') state = runtime.reducer(state, { type: 'SET_DEATH_SUPPORT', spp: record });
  else if (kind === 'spirits') state = runtime.reducer(state, { type: 'APPLY_SPIRIT', spirit: record });
  else if (kind === 'items') state = runtime.reducer(state, { type: 'ADD_ITEM', itemId: record.id });
  else state = { ...state, enhancements: [record] };
  return state;
}

export function auditOutputContent(runtime, { mutate = null, kinds = null } = {}) {
  const categories = kinds || ['normal_personas', 'tokui_personas', 'egos', 'support_passives', 'spirits',
    'normal_enhancements', 'special_enhancements', 'death_passives', 'items'];
  const findings = [], counts = {}, omittedByContract = {};
  let checked = 0;
  for (const kind of categories) {
    counts[kind] = { records: 0, fields: 0, routes: 0 };
    if (!runtime.db[kind]?.length) findings.push({ code: 'empty_category', kind });
    for (const record of runtime.db[kind] || []) {
      const base = `${kind}/${record.name}`;
      counts[kind].records++;
      const fields = fieldsFor(kind, record);
      let state;
      try { state = equip(runtime, kind, record); }
      catch (error) { findings.push({ code: 'equip_error', path: base, message: error.message }); continue; }
      for (const route of CONTENT_ROUTES) {
        let output;
        try { output = route.build(runtime.gen, state); }
        catch (error) { findings.push({ code: 'output_error', route: route.key, path: base, message: error.message }); continue; }
        if (mutate) output = mutate(route.key, output, { kind, record });
        if (typeof output !== 'string' || !output.trim()) {
          findings.push({ code: 'empty_output', route: route.key, path: base }); continue;
        }
        counts[kind].routes++;
        const actual = visibleText(output, route.family === 'share');
        for (const field of fields) {
          if (!field.routes.includes(route.family)) {
            const key = `${kind}/${route.key}/summary-or-alternate-field`;
            omittedByContract[key] = (omittedByContract[key] || 0) + 1;
            continue;
          }
          checked++;
          counts[kind].fields++;
          const expected = kind === 'egos' && route.family === 'palette'
            ? field.text.replace(/SAN/g, '精神力') : field.text;
          if (!actual.includes(visibleText(expected))) findings.push({ code: 'missing_text',
            route: route.key, path: `${base}/${field.path}`, text: field.text });
        }
      }
    }
  }
  if (!checked) findings.push({ code: 'nothing_checked' });
  return { checked, counts, omittedByContract, findings };
}

export function loadContentRuntime() {
  const runtime = loadRuntime();
  runtime.db.items = JSON.parse(readFileSync(new URL('../../data/items.json', import.meta.url), 'utf8'));
  return runtime;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = auditOutputContent(loadContentRuntime());
  if (process.argv.includes('--json')) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`checked=${result.checked}; findings=${result.findings.length}`);
    console.log(JSON.stringify(result.counts, null, 2));
    result.findings.slice(0, 30).forEach(f => console.log(JSON.stringify(f)));
    console.log('Explicit summary/alternate-field omissions:', JSON.stringify(result.omittedByContract));
  }
  process.exitCode = result.findings.length ? 1 : 0;
}
