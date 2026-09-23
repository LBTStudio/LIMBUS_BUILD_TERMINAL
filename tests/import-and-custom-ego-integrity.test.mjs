import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { loadRuntime } from '../tools/provenance/pipeline-harness.mjs';

const publicUrl = 'https://lbt-garasumado.vercel.app/persona/view/gEp4XyLWFnFoSQhyNmiU';
function parser() {
  const context = { window: {}, console };
  vm.createContext(context);
  vm.runInContext(readFileSync(new URL('../js/state.js', import.meta.url), 'utf8'), context);
  vm.runInContext(readFileSync(new URL('../js/persona-draft-import.js', import.meta.url), 'utf8'), context);
  return context.window;
}
const publicExamples = JSON.parse(readFileSync(new URL('./fixtures/garasumado-public-examples.json', import.meta.url), 'utf8')).examples;
const example = () => ({
  isPublic: true, name: '取込検証の人格',
  status: { hp: '124', san: '50', speed: '2d3+1', bullet: 0 },
  passives: [{ name: '再会', condition: '傲慢×5　保有', alwaysEffect: '固有名を含む説明\n次行', effect: '効果：本文（1Rに1回）' }],
  tactics: [{ code: '2-1', name: '三連-残', attr: '斬撃', sin: '傲慢', effect: '使用時：呼吸2を得る\n4d4 [的中時]呼吸2を得る\n2d9[的中時]火傷2を付与\n次のRに出血1を付与\n20-1d15：破壊不能ダイス' }],
  uniques: [{ name: '剣痕[残像]', type: 'デバフ', maxCount: '100', effect: '数値10につき、斬撃脆弱1を得る（最大2）\n[人格専用効果]\n最大値が150になる' }]
});

test('structured import retains exact fields, nested names and dice continuation ownership', () => {
  const record = example();
  const result = parser().LBT_parseGarasumadoPersonaDocument(record, `https://rd.nan7.net/${publicUrl}`);
  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.equal(result.source.url, publicUrl);
  assert.equal(result.persona.passive_cond, record.passives[0].condition);
  assert.equal(result.persona.passive_always, record.passives[0].alwaysEffect);
  assert.equal(result.persona.passive_effect, record.passives[0].effect);
  assert.equal(result.persona.unique_buffs[0].name, '剣痕[残像]');
  assert.equal(result.persona.unique_buffs[0].desc, record.uniques[0].effect);
  const skill = result.persona.skills[0];
  assert.equal(skill.dice.length, 3);
  assert.equal(skill.dice[1].roll, '2d9');
  assert.equal(skill.dice[1].effect, '[的中時]火傷2を付与\n次のRに出血1を付与');
  assert.equal(skill.effect, '使用時：呼吸2を得る');
});

test('structured import cannot silently omit invalid entries or extra passives', () => {
  for (const corrupt of [
    (r) => r.tactics.push({ name: '番号欠落' }),
    (r) => r.uniques.push({ effect: '名前欠落' }),
    (r) => r.passives.push(r.passives[0], r.passives[0]),
    (r) => r.tactics.push({ ...r.tactics[0] }),
    (r) => { r.tactics[0].effect = '2d??：不明'; },
    (r) => { r.status.hp = '不明'; }
  ]) {
    const input = example(); corrupt(input);
    const result = parser().LBT_parseGarasumadoPersonaDocument(input, publicUrl);
    assert.equal(result.ok, false);
    assert.ok(result.errors.length > 0);
  }
  assert.equal(parser().LBT_parseGarasumadoPersonaUrl('https://rd.nan7.net/https://example.com/private').ok, false);
});

test('paste parser preserves same-line buff prose, stages and bracketed duration', () => {
  const result = parser().LBT_parsePersonaDraft(`人格名：検証
HP：100 SAN：45 速度：1d5
パッシブ名：検証
効果：条件を保持（1Rに1回）
【戦術スキル1】
スキル名：試行
斬撃：憤怒
使用時：呼吸2を得る
2d9[的中時]火傷2を付与
さらに出血1を付与
固有
[剣痕[残像]] 最大100 デバフ 数値10につき斬撃脆弱1を得る
[1R] 数値が減少
[人格専用効果]
最大値が150になる
-第二段階-
特殊スキルに使用される`);
  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.equal(result.persona.passive_effect, '条件を保持（1Rに1回）');
  assert.equal(result.persona.skills[0].dice[0].effect, '[的中時]火傷2を付与\nさらに出血1を付与');
  assert.equal(result.persona.unique_buffs.length, 1);
  assert.equal(result.persona.unique_buffs[0].name, '剣痕[残像]');
  assert.match(result.persona.unique_buffs[0].desc, /^数値10につき斬撃脆弱1を得る\n\[1R\]/);
  assert.match(result.persona.unique_buffs[0].desc, /-第二段階-\n特殊スキルに使用される$/);
});

test('all ten public records preserve full names, passive fields, unique text and dice ownership', async () => {
  const api = parser();
  const counts = [[9,7,2], [5,4,1], [8,8,2], [5,2,1], [5,1,1], [7,7,2], [7,6,1], [7,2,2], [7,10,2], [6,5,1]];
  const canon = (text) => String(text).normalize('NFKC').replace(/[\s：:]/g, '');
  for (const [index, {url, record}] of publicExamples.entries()) {
    const result = api.LBT_parseGarasumadoPersonaDocument(record, url);
    assert.equal(result.ok, true, `${url}: ${result.errors}`);
    assert.equal(result.persona.name, record.status.persona || record.name);
    assert.deepEqual([result.summary.skillCount, result.summary.buffCount, result.summary.passiveCount], counts[index]);
    assert.ok(result.persona.keywords.length > 0);
    assert.equal(result.persona.passive_effect, record.passives[0].effect?.trim() || '');
    assert.equal(result.persona.passive_always, record.passives[0].alwaysEffect?.trim() || '');
    assert.equal(result.secondaryPassive?.effect || '', record.passives[1]?.effect?.trim() || '');
    for (const [i, unique] of record.uniques.entries()) {
      assert.equal(result.persona.unique_buffs[i].desc, unique.effect.trim());
      assert.equal(result.persona.unique_buffs[i].name, unique.name.trim());
    }
    for (const [i, tactic] of record.tactics.entries()) {
      const skill = result.persona.skills[i];
      assert.equal(skill.name, tactic.name.trim());
      assert.equal(skill.rank, `スキル${tactic.code.replace('－', '-')}`);
      const sourceBody = tactic.effect.split('\n').filter((line) => !/^広域(乱射)?\s*[:：]?\s*(?:対象)?\d+(?:体|枠)?$/.test(line)).join('\n');
      const importedBody = [skill.effect, ...skill.dice.map((d) => d.roll + d.effect)].join('\n');
      assert.equal(canon(importedBody), canon(sourceBody), `${url}: ${tactic.code}`);
    }
    let endpoint;
    const fetched = await api.LBT_fetchGarasumadoPersona(url, async (u) => {
      endpoint = u;
      return { ok: true, json: async () => record };
    });
    assert.equal(fetched.persona.name, result.persona.name);
    assert.ok(endpoint.includes(`/documents/${record.status.persona ? 'characters' : 'personas'}/`));
  }
  const restricted = structuredClone(publicExamples[8]);
  restricted.record.isPublic = false;
  assert.equal(api.LBT_parseGarasumadoPersonaDocument(restricted.record, restricted.url).ok, false);
  restricted.record.isPublic = true;
  delete restricted.record.status.persona;
  restricted.record.name = 'PC名を人格名へ流用しない';
  assert.equal(api.LBT_parseGarasumadoPersonaDocument(restricted.record, restricted.url).ok, false);
});

test('persona create, import, hydrate and re-equip never populate basic character identity', () => {
  const api = parser();
  const rt = loadRuntime();
  for (const charName of ['', '変更しないPC名']) {
    const initial = { ...rt.initialState, charName, plName: '変更しないPL名', color: '#123456' };
    const manual = rt.reducer(initial, { type: 'EQUIP_CUSTOM_PERSONA', name: '創作人格' });
    assert.equal(manual.charName, charName);
    for (const {url, record} of publicExamples) {
      const parsed = api.LBT_parseGarasumadoPersonaDocument(record, url);
      let state = rt.reducer(initial, { type: 'IMPORT_PERSONA_DRAFT', ...parsed });
      assert.equal(state.charName, charName);
      assert.equal(state.plName, initial.plName);
      assert.equal(state.color, initial.color);
      assert.equal(state.personaSrc.name, parsed.persona.name);
      assert.ok(state.personaSrc.keywords.length > 0);
      const name = state.personaSrc.name;
      const keywords = JSON.stringify(state.personaSrc.keywords);
      state = rt.reducer(rt.initialState, { type: 'HYDRATE', state: JSON.parse(JSON.stringify(state)) });
      const entry = state.roster.personas.at(-1);
      state = rt.reducer(state, { type: 'EQUIP_PERSONA', mode: entry.mode, no: entry.no, src: entry.src });
      assert.equal(state.charName, charName);
      assert.equal(state.personaSrc.name, name);
      assert.equal(JSON.stringify(state.personaSrc.keywords), keywords);
      assert.equal(state.pas2.effect, parsed.secondaryPassive?.effect || '');
    }
  }
});

test('contextual synthetic notation preserves conditions and infers keywords from both passives', () => {
  // Synthetic syntax fixture, not a transcription of the user's complete persona.
  const skills = [1, 2, 1, 3, 3].map((count, i) => `戦術${i}：検証技${i}\n${i === 0 ? '回避' : '物理'}：傲慢\n使用時：呼吸2を得る\n${Array(count).fill('2d9：的中時、沈潜2を付与').join('\n')}`).join('\n\n');
  const result = parser().LBT_parsePersonaDraft(`人格：【特異】検証の人格
LANK：000
◯ステータス
HP：155
SAN：40
速度：1d4+3
◯耐性
斬撃：普通 貫通：抵抗 打撃：弱点
◯人格パッシブ
名称：人格名ではないパッシブ
条件：嫉妬x2 傲慢x2 保有
常時効果：[＿＿＿]として扱う
効果：呼吸1を得る
◯人格パッシブ2
名称：第二
条件：常時
効果：充電1を得る
◯戦術
${skills}
◯固有
[検証A]
デバフ 最大：1
[1R] 第一の説明
[検証B]
特別処理 最大数：3
速度盤に付与される
R終了時、数値が1減少
[検証C]
デバフ 最大：30
第三の説明
◯船長と同時編成で追加される固有
[検証D]
中立バフ 最大：1
[人格専用効果]
効果を「[＿＿＿]に変更
次の行も保持」に変更`);
  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.equal(result.persona.name, '【特異】検証の人格');
  assert.equal(result.syncRank, '000');
  assert.equal(result.persona.passive_name, '人格名ではないパッシブ');
  assert.equal(result.persona.passive_cond, '嫉妬x2 傲慢x2 保有');
  assert.equal(result.summary.skillCount, 5);
  assert.equal(result.persona.skills.flatMap((s) => s.dice).length, 10);
  assert.equal(result.summary.buffCount, 4);
  assert.equal(result.persona.unique_buffs[1].type, '特別処理');
  assert.equal(result.persona.unique_buffs[1].max, 3);
  assert.match(result.persona.unique_buffs[3].desc, /^◯船長と同時編成で追加される固有\n\[人格専用効果\]/);
  assert.match(result.persona.unique_buffs[3].desc, /次の行も保持」に変更$/);
  for (const keyword of ['呼吸', '沈潜', '充電']) assert.ok(result.persona.keywords.includes(keyword));
  const rt = loadRuntime();
  const imported = rt.reducer(rt.initialState, { type: 'IMPORT_PERSONA_DRAFT', ...result });
  assert.equal(imported.uniqueBuffs[3].desc, result.persona.unique_buffs[3].desc);
  assert.ok(rt.gen.buildPalette(imported).includes('船長と同時編成で追加される固有'));
});

test('custom EGO survives edit, unequip, hydrate, re-equip and same-name creation', () => {
  const rt = loadRuntime();
  const originalDb = JSON.stringify(rt.db);
  let state = rt.reducer(rt.initialState, { type: 'CREATE_CUSTOM_EGO', rank: 'HE', name: '手動EGO' });
  const firstNo = state.egoSlots.HE.no;
  assert.match(firstNo, /^custom-/);
  assert.equal(state.egoManual, true);
  assert.equal(state.ui.egoDetailSlot, 'HE');
  state = rt.reducer(state, { type: 'PATCH_EGO_SLOT', rank: 'HE', patch: { name: '編集EGO', resources: '憤怒x3', san_cost: 25, shards: 100, passive_effect: '条件付きの全文', unique_buff: '第一段階\n第二段階' } });
  state = rt.reducer(state, { type: 'SET_EGO_SLOT', rank: 'HE', value: null });
  state = rt.reducer(rt.initialState, { type: 'HYDRATE', state: JSON.parse(JSON.stringify(state)) });
  const entry = state.roster.egos.find((e) => e.no === firstNo);
  assert.equal(entry.build.name, '編集EGO');
  state = rt.reducer(state, { type: 'SET_EGO_SLOT', rank: 'HE', value: entry.build });
  assert.equal(state.egoSlots.HE.unique_buff, '第一段階\n第二段階');
  assert.equal(state.egoSlots.HE.san_cost, 25);
  const noOp = rt.reducer(state, { type: 'CREATE_CUSTOM_EGO', rank: 'HE', name: '編集EGO' });
  assert.equal(noOp, state, 'occupied slot requires explicit confirmation');
  state = rt.reducer(state, { type: 'CREATE_CUSTOM_EGO', rank: 'HE', name: '編集EGO', replaceConfirmed: true });
  assert.notEqual(state.egoSlots.HE.no, firstNo);
  assert.equal(state.roster.egos.length, 2);
  assert.equal(state.egoSlots.HE.passive_effect, '', 'new record starts blank');
  assert.equal(JSON.stringify(rt.db), originalDb);
  assert.equal(rt.reducer(state, { type: 'CREATE_CUSTOM_EGO', rank: 'bad', name: 'invalid' }), state);
});

test('custom EGO deletion requires confirmation and never deletes an equipped definition', () => {
  const rt = loadRuntime();
  let state = rt.reducer(rt.initialState, { type: 'CREATE_CUSTOM_EGO', rank: 'HE', name: '保護対象' });
  const entry = state.roster.egos[0];
  assert.equal(rt.reducer(state, { type: 'REMOVE_ROSTER_EGO', uid: entry.uid, deleteCustomConfirmed: true }), state);
  assert.equal(rt.reducer(state, { type: 'REMOVE_ROSTER_EGO_BATCH', uids: [entry.uid], deleteCustomConfirmed: true }).roster.egos.length, 1);
  state = rt.reducer(state, { type: 'SET_EGO_SLOT', rank: 'HE', value: null });
  assert.equal(rt.reducer(state, { type: 'REMOVE_ROSTER_EGO', uid: entry.uid }), state);
  assert.equal(rt.reducer(state, { type: 'REMOVE_ROSTER_EGO_BATCH', uids: [entry.uid] }).roster.egos.length, 1);
  const deleted = rt.reducer(state, { type: 'REMOVE_ROSTER_EGO', uid: entry.uid, deleteCustomConfirmed: true });
  assert.equal(deleted.roster.egos.length, 0);
  const restored = rt.reducer(deleted, { type: 'RESTORE_ROSTER_BATCH', kind: 'egos', items: [entry] });
  assert.equal(restored.roster.egos[0].build.name, '保護対象');
});

test('import dialog uses the shared modal layer above the mobile navigation', () => {
  const css = readFileSync(new URL('../assets/v65r29-draft-import.css', import.meta.url), 'utf8');
  assert.match(css, /\.persona-draft-backdrop\s*\{[^}]*z-index:\s*var\(--z-modal\)/);
});

test('joined prose stays in one field and one palette command without losing timing text', () => {
  const rt = loadRuntime();
  const effect = '説明。R終了時、呼吸1を得る（1Rに1回）。クリティカル的中時、火傷2を付与';
  const pieces = rt.splitEffectLinesPlain(effect);
  assert.equal(pieces.join(''), effect);
  assert.ok(pieces.includes('R終了時、呼吸1を得る（1Rに1回）。'));
  const state = rt.reducer(rt.initialState, { type: 'ADD_SUPPORT', spp: { name: '連結検証', effect } });
  const palette = rt.gen.buildPalette(state);
  const line = palette.split('\n').find((l) => l.includes('連結検証'));
  assert.ok(line.includes('R終了時') && line.includes('クリティカル的中時'));
});
