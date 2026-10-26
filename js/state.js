const STORAGE_KEY = "lbt_v46_state";

/* ユーザーが記録する日付は端末のローカル暦日を使う。toISOString() はUTC日付なので、
   日本時間の0:00〜8:59などでは意図せず前日が記録される。 */
function localDateString(date = new Date()) {
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
window.LBT_localDateString = localDateString;
// 基本ルールPDFのキーワード掲載順は js/core.js が window.LBT_PDF_KEYWORD_ORDER
// として定義する（両ページが最初に読み込む）。ここでは再定義しない。
// 人格キーワードは効果本文・固有バフ・ダイス効果で検索できる状態名を漏れなく持つ。
// DBの旧データを読み込んでも、同じ根拠から補完することで一覧フィルタの不整合を防ぐ。
function personaKeywordEvidence(persona) {
  return [
    persona?.passive_always,
    persona?.passive_effect,
    ...(persona?.unique_buffs || []).flatMap((buff) => [buff?.name, buff?.desc]),
    ...(persona?.skills || []).flatMap((skill) => [
      skill?.effect,
      ...(skill?.dice || []).flatMap((die) => [die?.roll, die?.effect])
    ])
  ].filter(Boolean).join("\n");
}
/* キャラ作成時の支給額。core 3章 P19-20「PCにはキャラ作成時に30LPが支給」
   （core:344）。人格出家/購入の値段ではなく初期資金で、「初期作成」リザルトの
   収入として計上する。 */
const INITIAL_LP = 30;
window.LBT_INITIAL_LP = INITIAL_LP;

/* 「初期作成」リザルトを作る。キャラ作成時の支給（core:344）を収入に置く。
   人格を1つも持たないこの段階では、最初の1人格は「指定購入（20LP）」でも
   「初期作成用人格チケットでの抽出」でも決められる。どちらを選んでも
   初期作成に1枚だけ与えておく。 */
function makeInitialResult(options) {
  const withPersonaTicket = options?.withPersonaTicket === true;
  return {
    id: "res-initial",
    name: "初期作成",
    date: localDateString(),
    income: {
      ...normalizeCurrency({ lp: INITIAL_LP, shards: 0 }),
      tickets: normalizeTickets(withPersonaTicket ? { persona: 1 } : {})
    },
    note: "キャラ作成時の支給（core:344）。この直後の獲得はここに帰属します。",
    createdAt: Date.now()
  };
}

/* 初期作成用人格チケットの消費。最初の1人格が所持になった時点で1枚消す。
   指定購入でも所持追加でも抽出でも通す。そうしないと
   「20LPで指定して、さらに無料抽出チケットも残る」二重得になる。
   チケットで抽出した場合は既に消費済み（残高0）なので素通りする。 */
function consumeInitialPersonaTicket(state, resultId) {
  const balance = computeTicketBalance(state.results, state.entries);
  if ((Number(balance?.persona) || 0) <= 0) return state;
  return appendTicketSpend(state, "persona", null, 1, { kind: "initialPersonaTicket" }, resultId);
}

/* 継承アカウントの判定。直近リザルトの収入が初期支給（30LP）と一致するなら、
   その支給は既に記録済みなので「初期作成」を重ねない。
   一致の判定は「リザルト名が初期作成」または「収入がちょうど30LP」で見る。 */
/* リザルト画面の「新しい順」と同じ並び基準を共有する。
   日付が同じ場合は createdAt の新しい方を先頭にする。配列順には依存しない。 */
function latestResultByDisplayOrder(results) {
  const list = Array.isArray(results) ? results : [];
  if (!list.length) return null;
  const stamp = (result) => {
    const parsed = Date.parse(String(result?.date || "") + "T00:00:00Z");
    return Number.isFinite(parsed) ? parsed : (Number(result?.createdAt) || 0);
  };
  let latest = list[0];
  for (let index = 1; index < list.length; index += 1) {
    const candidate = list[index];
    const difference = stamp(candidate) - stamp(latest);
    if (difference > 0 || (difference === 0
      && (Number(candidate?.createdAt) || 0) > (Number(latest?.createdAt) || 0))) {
      latest = candidate;
    }
  }
  return latest;
}
function hasInitialGrant(results) {
  const list = Array.isArray(results) ? results : [];
  if (!list.length) return false;
  if (list.some((r) => r?.id === "res-initial" || r?.name === "初期作成")) return true;
  const latest = latestResultByDisplayOrder(list);
  const income = normalizeCurrency(latest?.income);
  return income.lp === INITIAL_LP && income.shards === 0;
}
/* 抽出チケットの分類。ローカルルール（ルールブックには無いが卓で配られる）。
   kind=persona 人格抽出チケット … 人格からランダム1つ
   kind=ego     E.G.O抽出チケット … E.G.Oからランダム1つ
   kind=choice  選択抽出チケット … 人格かE.G.Oのどちらかを選んでランダム1つ
   kind=pack    特定抽出パック … そのパックの中からランダム1つ（pack にパック名） */
const TICKET_KINDS = ["persona", "ego", "choice", "pack"];
const TICKET_KIND_LABEL = {
    persona: "人格抽出チケット",
    ego: "E.G.O抽出チケット",
    choice: "選択抽出チケット",
    pack: "特定抽出パック"
  };
  /* パック別チケットは「〈パック名〉抽出チケット」と表記する。卓で配られる時に
     「このパックなら引ける」という名前で渡されることが多いので、
     パックの識別がそのまま立つようにする。 */
  window.LBT_ticketLabel = function (kind, pack) {
    const base = TICKET_KIND_LABEL[kind] || "抽出チケット";
    if (kind !== "pack") return base;
    return pack ? `〈${pack}〉抽出チケット` : "特定抽出パック";
  };
function inferPersonaKeywords(persona, secondaryPassive) {
  const evidence = [personaKeywordEvidence(persona), secondaryPassive?.always, secondaryPassive?.effect].filter(Boolean).join("\n");
  const existing = Array.isArray(persona?.keywords) ? persona.keywords.filter(Boolean) : [];
  return [...new Set([...existing, ...(window.LBT_PDF_KEYWORD_ORDER || []).filter((keyword) => evidence.includes(keyword))])];
}
window.LBT_inferPersonaKeywords = inferPersonaKeywords;
window.LBT_TICKET_KINDS = TICKET_KINDS;
window.LBT_TICKET_KIND_LABEL = TICKET_KIND_LABEL;
/* Ticket stock: result income minus entries, the same shape as LP and shards. */
window.LBT_ticketCount = function (state, kind, pack) {
  const src = state && state.results ? state : { results: state, entries: [] };
  return ticketTotal(computeTicketBalance(src.results || [], src.entries || []), kind, pack);
};
function enrichPersonaKeywords(database) {  const keywords = window.LBT_PDF_KEYWORD_ORDER || [];
  const groups = ["normal_personas", "tokui_personas", "abnormal_personas"];
  const updated = [];
  let total = 0;
  groups.forEach((group) => {
    (database?.[group] || []).forEach((persona) => {
      total += 1;
      const evidence = personaKeywordEvidence(persona);
      const current = Array.isArray(persona.keywords) ? persona.keywords.filter(Boolean) : [];
      const known = new Set(current);
      const missing = keywords.filter((keyword) => evidence.includes(keyword) && !known.has(keyword));
      if (!missing.length) return;
      persona.keywords = [...current, ...missing];
      updated.push({ group, no: persona.no, name: persona.name, missing });
    });
  });
  return { total, updated };
}
window.LBT_enrichPersonaKeywords = enrichPersonaKeywords;
// E.G.Oは名称・大罪・資源から推測せず、パッシブ・固有バフ・覚醒・侵蝕・
// 同化スキルと各ダイスの効果文だけを根拠にキーワードを補完する。
function egoKeywordEvidence(ego) {
  const skillEffects = (skill) => [
    skill?.effect,
    ...(skill?.dice || []).map((die) => die?.effect)
  ];
  return [
    ego?.passive_effect,
    ego?.unique_buff,
    ...skillEffects(ego?.kakusei),
    ...skillEffects(ego?.shinshoku),
    ...(ego?.sub_skills || []).flatMap((skill) => skillEffects(skill))
  ].filter(Boolean).join("\n");
}
function enrichEgoKeywords(database) {
  const keywords = window.LBT_PDF_KEYWORD_ORDER || [];
  const updated = [];
  let total = 0;
  (database?.egos || []).forEach((ego) => {
    total += 1;
    const evidence = egoKeywordEvidence(ego);
    const current = Array.isArray(ego.keywords) ? ego.keywords.filter(Boolean) : [];
    const known = new Set(current);
    const missing = keywords.filter((keyword) => evidence.includes(keyword) && !known.has(keyword));
    if (!missing.length) return;
    ego.keywords = [...current, ...missing];
    updated.push({ rank: ego.rank, no: ego.no, name: ego.name, missing });
  });
  return { total, updated };
}
window.LBT_enrichEgoKeywords = enrichEgoKeywords;
const HISTORY_LIMIT = 60;
const SAVE_SCHEMA_VERSION = 5;
// 旧版の保存で通常スロットに混入した死亡後パッシブの移行判定。
// 語彙の正規表現で推測分類すると「墓守」「高危険作戦」「勤勉」等、
// 本文に死亡系の語を含むだけの通常サポートまで誤検出して無断で移動し、
// リロードやundoのたびにビルドが書き換わる。UIの死亡後スロット候補が
// DB.death_passives 名簿のみを参照するのと同じ基準へ揃え、
// 名簿の名称と完全一致するレコードだけを移行対象にする。
function isDeathSupportPassiveRecord(s) {
  const roster = Array.isArray(window.DB?.death_passives) ? window.DB.death_passives : [];
  const name = String(s?.name || "").trim();
  return !!name && roster.some((entry) => String(entry?.name || "").trim() === name);
}

// Older per-persona snapshots stored every equipped support in "supports".
// If a death-only catalogue entry slipped into that array, loading the snapshot
// restored it to a normal slot and bypassed the reducer's slot guard. Migrate
// only exact catalogue matches; preserve the first legacy selection as the
// death slot and keep the owned roster entry itself intact.
function normalizePersonaSupportSnapshot(build, rosterSupports = []) {
  if (!build || typeof build !== "object" || Array.isArray(build) || !Array.isArray(build.supports)) return build;
  const deathRows = build.supports.filter(isDeathSupportPassiveRecord);
  if (!deathRows.length) return build;

  const normalSupports = build.supports.filter((entry) => !isDeathSupportPassiveRecord(entry));
  const currentDeath = build.deathSupport && typeof build.deathSupport === "object" && build.deathSupport.name
    ? build.deathSupport
    : null;
  const promoted = currentDeath ? null : deathRows[0];
  const promotedRoster = promoted
    ? rosterSupports.find((entry) => entry && String(entry.name || "").trim() === String(promoted.name || "").trim())
    : null;
  const promotedId = String(promoted?.id || promotedRoster?.uid || "");
  const deathSupport = currentDeath || (promoted ? {
    ...promoted,
    id: promotedId || `sppd-legacy-${String(promoted.name || "death").trim().replace(/\s+/g, "-").slice(0, 48)}`
  } : null);

  const removedIds = new Set(deathRows.map((entry) => String(entry?.id || "")).filter(Boolean));
  // If the snapshot already had an explicit death slot, retain that selection's
  // roster reference when the same catalogue item also appears in the stale list.
  const currentDeathRoster = currentDeath && isDeathSupportPassiveRecord(currentDeath)
    ? rosterSupports.find((entry) => String(entry?.name || "").trim() === String(currentDeath.name || "").trim())
    : null;
  const keptDeathId = currentDeathRoster?.uid || (isDeathSupportPassiveRecord(currentDeath) ? currentDeath?.id : "")
    || (promoted ? promotedId : "");
  if (keptDeathId) removedIds.delete(String(keptDeathId));

  let equipmentRefs = build.equipmentRefs;
  if (equipmentRefs && typeof equipmentRefs === "object" && Array.isArray(equipmentRefs.supportUids)) {
    const supportUids = equipmentRefs.supportUids.filter((uid) => !removedIds.has(String(uid)));
    if (promotedId && !supportUids.some((uid) => String(uid) === promotedId)) supportUids.push(promotedId);
    equipmentRefs = { ...equipmentRefs, supportUids };
  }
  return {
    ...build,
    supports: normalSupports,
    deathSupport,
    ...(equipmentRefs !== undefined ? { equipmentRefs } : {})
  };
}
function cloneJSON(obj) {
  return obj == null ? obj : JSON.parse(JSON.stringify(obj));
}

/* 人格パッシブは pas を根とし、2件目以降は extraPassives に上限なく積む。
   旧保存データの pas2（1件だけ）は読み込み時に1件目へ畳み込む。 */
function normalizeExtraPassive(entry, index = 0) {
  const p = entry || {};
  return {
    id: String(p.id || `pas-extra-${index}`),
    name: String(p.name || ""),
    cond: String(p.cond || ""),
    always: String(p.always || ""),
    effect: String(p.effect || ""),
    quick: String(p.quick || "")
  };
}
function mergeExtraPassives(list, legacy) {
  const out = Array.isArray(list) ? list.filter((p) => p && typeof p === "object") : [];
  const passive = legacy?.passive;
  if (legacy?.enabled && passive && (passive.name || passive.effect)) {
    const dup = out.some((p) => String(p.name || "") === String(passive.name || "")
      && String(p.effect || "") === String(passive.effect || ""));
    if (!dup) out.push({ ...passive, quick: passive.quick || "" });
  }
  return out.map(normalizeExtraPassive);
}

// 人格切替・明示保存で共有する完全ビルドスナップショット。
// 切替前にE.G.O・精神・サポート・強化等を人格別rosterへ退避する。
function createPersonaBuildSnapshot(state) {
  if (!state?.personaSrc || state.personaMode == null || state.personaNo == null) return null;
  return {
    savedAt: Date.now(),
    hp: state.hp, san: state.san, speed: state.speed, initiative: state.initiative, bullets: state.bullets,
    resS: state.resS, resP: state.resP, resB: state.resB,
    pas: cloneJSON(state.pas), pas2Enabled: !!state.pas2Enabled, pas2: cloneJSON(state.pas2),
    extraPassives: cloneJSON(state.extraPassives || []),
    skills: cloneJSON(state.skills || []), uniqueBuffs: cloneJSON(state.uniqueBuffs || []),
    spirit: state.spirit, spiritMorale: state.spiritMorale, spiritConfuse: state.spiritConfuse, spiritAlways: state.spiritAlways,
    supports: cloneJSON(state.supports || []), deathSupport: state.deathSupport ? cloneJSON(state.deathSupport) : null,
    /* アイテムだけは人格を跨いで共有する。支持/精神/強化のように人格ごとに
   退避すると、所持したアイテムが他の人格へ持ち越せず消えてしまう。
   「持っていくか・MEMO/PALETTE へ出すか」だけビルド側の選択で決める。 */
    egoSlots: cloneJSON(state.egoSlots || {}), enhancements: cloneJSON(state.enhancements || []),
    equipmentRefs: captureEquipmentRefs(state),
    personaSrc: cloneJSON(state.personaSrc), syncedManual: !!state.syncedManual,
    formulas: cloneJSON(state.formulas || []), customStatuses: cloneJSON(state.customStatuses || []),
    defaultStatuses: state.defaultStatuses ? cloneJSON(state.defaultStatuses) : null,
    selfStatusCandidates: cloneJSON(state.selfStatusCandidates || [])
  };
}
// 派生スキルは根の連番ではなく、親スキルと派生番号を持つ（例：スキル4 → スキル4-2）。
// rank文字列だけの旧データも読み込み時に親子情報へ正規化する。
function parseDerivedSkillRank(rank) {
  const match = String(rank || "").match(/^(スキル\d+)-(\d+)$/);
  return match ? { parent: match[1], index: Math.max(1, Number(match[2]) || 1) } : null;
}
function normalizeEditedSkillRank(rank) {
  const value = String(rank ?? "").trim();
  const shorthand = value.match(/^(\d+)(?:-(\d+))?$/);
  if (!shorthand) return value;
  return `スキル${shorthand[1]}${shorthand[2] ? `-${shorthand[2]}` : ""}`;
}
function normalizePersonaSkill(skill, index = 0) {
  const next = { ...(skill || {}) };
  const parsed = parseDerivedSkillRank(next.rank);
  const parent = next.derived_from || parsed?.parent || "";
  const derivedIndex = Number(next.derived_index ?? parsed?.index);
  if (parent && Number.isFinite(derivedIndex) && derivedIndex >= 1) {
    next.derived_from = parent;
    next.derived_index = derivedIndex;
    next.derived_condition = next.derived_condition || "";
    next.rank = `${parent}-${derivedIndex}`;
  }
  if (!next.rank) next.rank = `スキル${index}`;
  return next;
}
function migrateLegacyDerivedSkills(skills, sourceSkills = []) {
  return (skills || []).map((skill, index) => {
    const source = sourceSkills[index];
    const sourceDerived = source && (source.derived_from || parseDerivedSkillRank(source.rank));
    const legacyRank = `スキル${index}`;
    // 旧DBが配列位置だけで採番したS5を、最新版DBの同一名称の派生rankへ移行する。
    if (sourceDerived && String(skill?.rank || "") === legacyRank && String(skill?.name || "") === String(source?.name || "")) {
      return normalizePersonaSkill({
        ...skill,
        rank: source.rank,
        derived_from: source.derived_from || sourceDerived.parent,
        derived_index: source.derived_index || sourceDerived.index,
        derived_condition: source.derived_condition || ""
      }, index);
    }
    return normalizePersonaSkill(skill, index);
  });
}
function nextRootSkillRank(skills) {
  const rootNumbers = (skills || []).map((skill, index) => {
    const match = String(skill?.derived_from || skill?.rank || `スキル${index}`).match(/^スキル(\d+)/);
    return match ? Number(match[1]) : -1;
  });
  return `スキル${Math.max(-1, ...rootNumbers) + 1}`;
}
function normalizeEgoVariantName(value) {
  if (value === "同化" || value === "assimilation") return "assimilation";
  if (value === "影響" || value === "influence") return "influence";
  return "skill";
}
// 基本PDF／DBの影響は、属性・罪悪・ダイスのない`[影響] nR`効果として記録される。
// 明示的なkindがない旧データでも、攻撃スキルとして誤って編集させないよう分岐を推定する。
function inferEgoVariantFromSkill(skill) {
  if (skill?.kind !== void 0 && skill?.kind !== null && skill.kind !== "") return normalizeEgoVariantName(skill.kind);
  const text = `${skill?.effect || ""} ${skill?.name || ""}`;
  const hasCombatFields = !!(skill?.attr || skill?.type || skill?.sin || skill?.aoe || (skill?.dice || []).length);
  return !hasCombatFields && /\[\s*影響\s*\]/.test(text) ? "influence" : "skill";
}
function resolveEgoSlotForms(slot) {
  const direct = slot?.slot_forms || slot?.slotForms;
  if (direct && typeof direct === "object") return direct;
  const known = window.LBT_EGO_SLOT_FORMS?.[`${slot?.rank || ""}:${slot?.no || ""}`];
  if (known && typeof known === "object") return known;
  const dbRecord = (window.DB?.egos || []).find((entry) => entry && entry.name === slot?.name && String(entry.no ?? "") === String(slot?.no ?? ""));
  return dbRecord?.slot_forms || dbRecord?.slotForms || {};
}
function normalizeEgoSlotVariants(slot) {
  if (!slot || typeof slot !== "object") return slot;
  const next = cloneJSON(slot);
  const hasVariants = !!next.slotVariants;
  const variants = cloneJSON(next.slotVariants || {});
  const declaredForms = resolveEgoSlotForms(next);

  ["kakusei", "shinshoku"].forEach((slotKey) => {
    const current = variants[slotKey] || {};
    const branches = cloneJSON(current.branches || {});
    const inferredVariant = inferEgoVariantFromSkill(next[slotKey] || {});
    const declaredVariant = declaredForms[slotKey] ? normalizeEgoVariantName(declaredForms[slotKey]) : null;
    const hasUserChoice = current.selectedByUser === true;
    const loadSourceAssimilation = !hasUserChoice && (
      declaredVariant === "assimilation" || (!hasVariants && !declaredVariant && slotKey === "shinshoku")
    );

    if (!branches.skill) branches.skill = cloneJSON(next[slotKey] || {});
    // 覚醒・侵蝕の「通常」形態にも、戦術スキルと同じ派生スキルを任意数持たせる。
    // 根のスキルは branches.skill 自体、派生は branches.skill.derived[] に置く。
    branches.skill.derived = (Array.isArray(branches.skill.derived) ? branches.skill.derived : [])
      .filter((sk) => sk && typeof sk === "object")
      .map((sk, i) => ({
        ...sk,
        id: sk.id || `${slotKey}-derived-${i}`,
        kind: "スキル",
        originSlot: slotKey
      }));
    if (!branches.assimilation) branches.assimilation = { skills: [] };
    if (loadSourceAssimilation) {
      branches.assimilation.skills = cloneJSON(next.sub_skills || []);
    }
    if (!Array.isArray(branches.assimilation.skills)) branches.assimilation.skills = [];
    branches.assimilation.skills = branches.assimilation.skills.map((sk, i) => ({
      ...sk,
      id: sk?.id || `${slotKey}-assim-${i}`,
      kind: "同化",
      originSlot: slotKey
    }));
    if (!branches.influence) branches.influence = inferredVariant === "influence" ? cloneJSON(next[slotKey] || {}) : {};

    const selected = hasUserChoice ? (current.active || current.variant) : null;
    variants[slotKey] = {
      active: normalizeEgoVariantName(selected || declaredVariant || inferredVariant),
      selectedByUser: hasUserChoice,
      branches
    };
  });
  next.slotVariants = variants;
  ["kakusei", "shinshoku"].forEach((slotKey) => {
    const variant = variants[slotKey];
    // 同化は選択時に同化スキル群を扱う。通常スキルを破棄・置換してはならない。
    const canonical = variant.active === "influence" ? variant.branches.influence : variant.branches.skill;
    next[slotKey] = { ...(canonical || {}), kind: variant.active === "influence" ? "影響" : "スキル" };
  });
  // 既存出力経路との互換のため、同化スキルは帰属スロットを持つミラーとして保持する。
  next.sub_skills = ["kakusei", "shinshoku"].flatMap((slotKey) => {
    const variant = variants[slotKey];
    return (variant.branches.assimilation.skills || []).map((sk) => ({ ...sk, originSlot: slotKey, kind: "同化" }));
  });
  return next;
}
function normalizeEgoSlots(egoSlots) {
  const slots = egoSlots || {};
  return Object.fromEntries(Object.entries(slots).map(([rank, slot]) => [rank, normalizeEgoSlotVariants(slot)]));
}
// Custom E.G.O has no DB fallback: persist every edit before it can be unequipped.
function syncCustomEgoState(next) {
  const slots = normalizeEgoSlots(next.egoSlots);
  const egos = [...(next.roster?.egos || [])];
  for (const [rank, slot] of Object.entries(slots)) {
    if (!slot?.__custom) continue;
    const index = egos.findIndex((entry) => entry.rank === rank && String(entry.no) === String(slot.no));
    const entry = { ...(index >= 0 ? egos[index] : { uid: `er-${slot.no}`, no: slot.no, rank, notes: "", analyzeMax: false }), analyzed: true, build: cloneJSON(slot) };
    if (index >= 0) egos[index] = entry;
    else egos.push(entry);
  }
  return normalizeStatusCollections({ ...next, egoSlots: slots, roster: { ...next.roster, egos } });
}
function normalizeStatusLabel(label) {
  const value = String(label ?? "").trim();
  // 過去データの「クイック0」「バリア0」はラベルと初期値の混在なので修復する。
  return value.replace(/^(クイック|バリア)0+$/u, "$1");
}
/*
 * 自己管理ステータスの判定は、人格DBの明示指定を最優先とする。
 * 文面判定は「状態を得る／獲得する」または「自分に付与する」だけを強い根拠とし、
 * 敵・味方・対象への付与や、単に状態を参照するだけの文章は採用しない。
 * これにより、敵のバリアを参照する人格へバリアを誤追加しない。
 */
const LBT_TRACKABLE_STATUSES = [
  "ダメージ量増加","ダメージ量減少","マッチ威力増加","マッチ威力低下","斬撃威力増加","貫通威力増加","打撃威力増加","斬撃威力","貫通威力","打撃威力","混乱保護","憤怒保護","出血保護",
  "挑発値","バリア","破裂","出血","火傷","沈潜","振動","脆弱","恐慌","混乱","呼吸","煙","釘","蝶","充電",
  "毒","保護","武装","黒炎","追撃","狂信","木霊","烙印","時間猶予","盾",
  "沈黙","眩暈","燃焼","凍結","感電","盲目","睡眠","気絶","再生","暴走","集中","加速",
  "迅速","頑強","鋭利","潜伏","隠密","照準","援護","庇護","連携","連鎖","反射","吸収",
  "強化","弱体","硬化","軟化","鈍化","時間貸与","魔弾","激熱","紅硬","デュラハン","振動同化","共振","区産燃料","探求した知識","結束効果","研磨","刺突爆雷"
].sort((a, b) => b.length - a.length);
const LBT_SELF_STATUS_LIMITS = { "バリア": 99, "挑発値": 10, "保護": 10, "混乱保護": 10, "憤怒保護": 10, "出血保護": 20 };
function selfStatusMax(label) {
  return LBT_SELF_STATUS_LIMITS[label] ?? 99;
}
function statusTextEntries(personaSrc) {
  if (!personaSrc) return [];
  const entries = [];
  const add = (source, skillName, text) => {
    if (text) entries.push({ source, skillName, text: String(text) });
  };
  add("パッシブ", personaSrc.passive_name || "", personaSrc.passive_always);
  add("パッシブ", personaSrc.passive_name || "", personaSrc.passive_effect);
  (personaSrc.skills || []).forEach((skill, index) => {
    const source = `戦術${skill?.rank || index}`;
    add(source, skill?.name || "", skill?.effect);
    (skill?.dice || []).forEach((die) => add(`${source}ダイス`, skill?.name || "", die?.effect));
  });
  (personaSrc.unique_buffs || []).forEach((buff) => add("固有バフ", buff?.name || "", buff?.desc));
  return entries;
}
function statusOccurrenceIsStandalone(text, label, index) {
  // 1〜2文字の語は、固有名称の末尾（例: 死んだ蝶、d値強化）を一般状態として拾わない。
  const before = text.slice(Math.max(0, index - 1), index);
  // 助詞（「自分に保護」など）は有効な語境界として扱い、固有名称・英数字の直結だけを除外する。
  if (label.length <= 2 && /[ァ-ヶー一-龥々A-Za-z0-9]/u.test(before)) return false;
  return !LBT_TRACKABLE_STATUSES.some((other) => {
    if (other === label || other.length <= label.length || !other.endsWith(label)) return false;
    const start = index - (other.length - label.length);
    return start >= 0 && text.slice(start, index + label.length) === other;
  });
}
// 条件文・引用・カード名・選択肢の中身は、状態を実際に付与する本文ではない。
// そのため日本語の引用符、角括弧、丸括弧の内部を検出対象から外す。
function stripStatusDetectionLiterals(rawText) {
  return String(rawText || "")
    .replace(/[「『【［(（][^」』】］)）\n]{0,120}[」』】］)）]/gu, " ")
    .replace(/\[[^\]\n]{0,120}\]/gu, " ")
    .replace(/\s+/gu, "");
}
function statusOccurrenceHasForeignRecipient(text, index) {
  // 直近の文節に対象側の主語・助詞があれば、取得・獲得の主体は自分ではない。
  const start = Math.max(text.lastIndexOf("。", index - 1), text.lastIndexOf("！", index - 1), text.lastIndexOf("？", index - 1), text.lastIndexOf("\n", index - 1));
  const before = text.slice(start + 1, index);
  // 同じ文に「対象へ付与し、自分が得る」が続く場合、より近い自分参照を優先する。
  if (/(?:自分自身|自分|自身|あなた)(?:は|が|に|へ|の)?[^。！？\n]{0,18}$/u.test(before)) return false;
  const foreign = /(?:^|[、】【、])(?:対象|敵|相手|味方|両隣|他者|任意の味方|任意の対象|選んだ味方|選んだ対象)(?:は|が|に|へ|の)?([^。！？\n]{0,18})$/u.exec(before);
  if (!foreign) return false;
  // 「対象が黒炎状態なら」「敵が死亡した時」は付与先ではなく発動条件。
  // 条件節の後に主語が省略された取得は、自分が受け取る効果として扱う。
  return !/(?:なら|場合|時|ごと|以上|未満|状態|死亡|混乱|侵蝕)/u.test(foreign[1] || "");
}
/* 連結取得パターンの正規表現は90項目程度の選言を含むため、毎回構築すると
   状態検出1回あたり最大1750回のRegExpコンパイルが発生し、テキスト量の
   多い人格でキー入力1回あたり86msの劣化要因になる。モジュールスコープで
   一度だけ構築する。 */
const STATUS_CHAINED_RE_CACHE = {};
function statusGainChainRegExp() {
  const key = (window.LBT_PDF_KEYWORD_ORDER || []).length + ":" + LBT_TRACKABLE_STATUSES.length;
  if (!STATUS_CHAINED_RE_CACHE[key]) {
    const gain = "(?:得る|得て(?!い)|獲得(?:する|して)?)(?![てたな])";
    const chainVocabulary = [...new Set([...LBT_TRACKABLE_STATUSES, ...(window.LBT_PDF_KEYWORD_ORDER || [])])];
    const names = chainVocabulary.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
    const chained = `^(?:[0-9０-９]*を?)(?:(?:と|、|及び|・)(?:(?:次のR|R開始時|戦闘開始時)(?:に|、)?)?(?:${names})(?:[0-9０-９]*を?)){1,4}${gain}`;
    STATUS_CHAINED_RE_CACHE[key] = new RegExp(chained, "u");
  }
  return STATUS_CHAINED_RE_CACHE[key];
}
function statusGainTailMatches(tail) {
  if (new RegExp(`^(?:[0-9０-９]*を?[0-9０-９]*を?)${"(?:得る|得て(?!い)|獲得(?:する|して)?)(?![てたな])"}`, "u").test(tail)) return true;
  // 「呼吸2とクイック1を得る」「呼吸3と次のRにクイック1を得る」のように、
  // 複数の状態で取得動詞を共有する本文を扱う。対象側は呼出元で除外する。
  // クイック等、既定一覧に常設される語も連結の区切りとしては認識する。
  // ただし呼出側の追加対象はLBT_TRACKABLE_STATUSESだけなので、常設値を重複追加しない。
  return statusGainChainRegExp().test(tail);
}
function textAwardsSelfManagedStatus(rawText, label) {
  const text = stripStatusDetectionLiterals(rawText);
  if (!text.includes(label)) return false;
  let index = text.indexOf(label);
  while (index >= 0) {
    if (statusOccurrenceIsStandalone(text, label, index) && !statusOccurrenceHasForeignRecipient(text, index)) {
      const before = text.slice(Math.max(0, index - 14), index);
      // 「次のRに斬撃威力増加1を得る」は初期所持ではない。一時的な次ラウンド効果を
      // 人格装備時の初期ステータスへ昇格させない。
      if (/(?:次のR|次ラウンド)(?:に|、)?$/u.test(before)) {
        index = text.indexOf(label, index + label.length);
        continue;
      }
      const tail = text.slice(index + label.length, index + label.length + 14);
      // 「保護1を得る」「挑発値を10得る」に加え、後続の自己変換へつながる「得て」を受ける。
      // 「得ている」は状態参照なので除外する。
      if (statusGainTailMatches(tail)) return true;
      // 自分への付与だけを採る。対象・味方・両隣への付与はここに一致しない。
      if (/(?:自分自身|自分|自身|あなた)(?:に|へ)[^。\n]{0,8}$/u.test(before) && /^(?:[0-9０-９]*を?)(?:付与)(?:する)?/u.test(tail)) return true;
    }
    index = text.indexOf(label, index + label.length);
  }
  return false;
}
function collectSelfManagedStatusEntries(personaSrc) {
  if (!personaSrc) return [];
  const found = new Map();
  const uniqueStatusNames = collectUniqueStatusNames(personaSrc);
  const isUniqueStatus = (label) => uniqueStatusNameCoversLabel(uniqueStatusNames, label);
  const add = (label, meta) => {
    const normalized = normalizeStatusLabel(label);
    if (!normalized) return;
    const existing = found.get(normalized);
    // DBで明示された自己管理状態は、文面由来の推定より常に優先する。
    if (!existing || meta.kind === "declared") found.set(normalized, { label: normalized, max: selfStatusMax(normalized), ...meta });
  };
  declaredSelfStatusLabels(personaSrc).forEach((label) => {
    if (!isUniqueStatus(label)) add(label, { kind: "declared", source: "DB指定", evidence: "人格DBのself_status" });
  });
  const entries = statusTextEntries(personaSrc);
  LBT_TRACKABLE_STATUSES.forEach((label) => {
    // DB固有値は、self_status・効果文・末尾一致のいずれを根拠にしても既定へ昇格させない。
    if (isUniqueStatus(label)) return;
    const evidence = entries.find((entry) => textAwardsSelfManagedStatus(entry.text, label));
    if (evidence) add(label, { kind: "text", source: evidence.source, skillName: evidence.skillName, evidence: evidence.text });
  });
  /* 変換先ステータスの自動検出: 「Xへと[◯変換]」「Xに変換される」「Xへ振幅変換」等の
     変換系記述から、変換後のステータス（呼吸-終止符、出血-裂傷、振動-灼熱 等）を拾う。
     これらは固定語彙リストに載らない派生・複合名のため、パターンで汎用検出する。 */
  const CONV_RE = /([一-龥ァ-ヶ・]{1,14}(?:-[一-龥ァ-ヶ・0-9]{1,12})?)(?:へ(?:と)?\[[^\]]*変換\]|(?:へ|に)(?:振幅変換|血蓮変換|変換される|変換する))/g;
  entries.forEach((entry) => {
    // 変換形式の[変換]だけは意味を持つため、引用・条件文を除いた後に検査しない。
    // 代わりに変換先の直近文節に対象側の主語がある場合を除外する。
    const conversionText = String(entry.text || "")
      .replace(/[「『【［(（][^」』】］)）\n]{0,120}[」』】］)）]/gu, " ")
      // PDF・手動改行で「対象の火\n傷」が分断されても所有者判定を維持する。
      .replace(/\s+/gu, "");
    let cm;
    const re = new RegExp(CONV_RE.source, "g");
    while ((cm = re.exec(conversionText)) !== null) {
      const w = cm[1];
      if (!w || w.length < 2) continue;
      /* 他者のステータスを変換する効果（例: 「対象の出血が8以上なら出血-裂傷に変換」）は
         自分が管理するステータスではないため除外する。
         変換元の所有を前方文脈で判定し、「対象のX」「敵のX」に続く変換のみを除く。 */
      const before = conversionText.slice(Math.max(0, cm.index - 48), cm.index);
      if (statusOccurrenceHasForeignRecipient(conversionText, cm.index) || /(?:対象|敵|相手|両隣|味方|他者)(?:の|に)[^。、\n]{0,14}$/.test(before)) continue;
      /* 所有省略の変換は直前の動詞で帰属を判定する。本ルールの記法では
         「付与」＝対象へ、「得る／獲得」＝自分が受け取る、が基本形。
         直近に「付与」があれば対象側の変換（例: カポIIII「振動3を付与。…振動-灼熱へと[振幅変換]」）として除外し、
         直近に「得る／獲得」または「自分の」があれば自己側（例: 終止符「呼吸2を得て、呼吸-終止符へと[深吸変換]」）として採用する。 */
      const hasSelfRef = /(?:自分|自身|あなた)(?:の|は|に)/.test(before);
      // 「対象の火傷が15以上なら火傷-炬火へ変換」のように、他者の値を条件にした
      // 変換は対象側の操作である。自己参照がなければ状態として追加しない。
      const foreignCondition = /(?:対象|敵|相手|味方|両隣|他者)(?:の|が)[^。！？\n]{0,24}(?:なら|場合|時)/u.test(before);
      if (foreignCondition && !hasSelfRef) continue;
      if (!hasSelfRef) {
        const lastGrant = before.lastIndexOf("\u4ED8\u4E0E"); // 付与
        const lastGain = Math.max(before.lastIndexOf("\u5F97"), before.lastIndexOf("\u7372\u5F97")); // 得/獲得
        if (lastGrant >= 0 && lastGrant > lastGain) continue;
      }
      /* DBで noST:true と明示された固有バフ（例: 厳粛な哀悼の「蝶」）と同名の変換先は
         ステータス化しない指定に従って登録しない。 */
      const normW = normalizeStatusLabel(w);
      if (isUniqueStatus(normW)) continue;
      // ベース状態（呼吸、振動等）は既に検出済み。ハイフン複合型（呼吸-終止符）や
      // リスト外の派生名のみ追加する。
      const norm = normalizeStatusLabel(w);
      if (!norm) continue;
      const isCompound = norm.includes("-");
      const isNew = !LBT_TRACKABLE_STATUSES.includes(norm) && !found.has(norm);
      if (isCompound || isNew) {
        add(norm, { kind: "text", source: entry.source, skillName: entry.skillName, evidence: entry.text });
      }
    }
  });
  /* 弾丸: DBの bullets フィールド（最大弾丸数＝ルールブック p.56 により初期値=最大）が
     数値なら「弾丸」を初期値付きで管理対象へ追加する。「×」・未設定は非銃撃なので除外。 */
  const bulletMax = parseInt(personaSrc && personaSrc.bullets, 10);
  if (!isNaN(bulletMax) && bulletMax > 0) {
    found.set(normalizeStatusLabel("\u5F3E\u4E38"), { label: normalizeStatusLabel("\u5F3E\u4E38"), max: bulletMax, initial: bulletMax, kind: "declared", source: "DB指定", evidence: "人格DBのbullets" });
  }
  /* 「舞台開始時／戦闘開始時に X を N 得る」「XをN得て開始」等の初期付与を解析し、
     初期値を管理対象へ反映する（既にDB宣言がある場合は初期値のみ補完）。 */
  const _initTexts = [];
  const _pushT = (s) => { if (s) _initTexts.push(String(s)); };
  _pushT(personaSrc && personaSrc.passive_always);
  _pushT(personaSrc && personaSrc.passive_effect);
  (personaSrc && personaSrc.unique_buffs || []).forEach((b) => { _pushT(b && b.desc); });
  const _blob = _initTexts.join("\n");
  /* 「舞台開始時／戦闘開始時」に加え、「〜得て舞台開始」「Nの状態で舞台開始」
     「舞台開始後」等の表記揺れも初期付与として拾う。 */
  const _startBlocks = _blob.split(/[\n\u3002]/).filter((s) => /(?:\u821E\u53F0|\u6226\u95D8)\u958B\u59CB/.test(s));
  const _setInitial = (label, n, sourceText) => {
    label = normalizeStatusLabel(label);
    const num = parseInt(n, 10);
    // 火傷はバリアと同様に「管理対象として追加するか」を人格ごとに判定するだけで、
    // 戦闘開始時の効果文から値を先取りしない。常に0から開始し、実際の効果で増減させる。
    if (label === "火傷") return;
    const text = stripStatusDetectionLiterals(sourceText);
    const explicitStartingState = new RegExp(`${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:が|を)?[0-9０-９]+の状態で(?:開始|舞台開始)`, "u").test(text);
    const startPrefix = text.replace(/^.*?(?:(?:舞台|戦闘)開始時)(?:に|：|:|、)?/u, "");
    const targetIndex = startPrefix.indexOf(label);
    const beforeTarget = targetIndex >= 0 ? startPrefix.slice(0, targetIndex) : "";
    // 「戦闘開始時、HPが30以上なら火傷4を得る」のような条件付き付与は、開始時に必ず保持する値ではない。
    // 初期値には無条件の開始時付与、または「XがNの状態で開始」だけを反映する。
    const hasConditionalGate = /(?:なら|場合|以上|未満|ごと|毎|かつ|および|または|に応じ|につき|によって)/u.test(beforeTarget);
    if (!label || isNaN(num) || isUniqueStatus(label) || hasConditionalGate || statusOccurrenceHasForeignRecipient(text, text.indexOf(label)) || (!textAwardsSelfManagedStatus(sourceText, label) && !explicitStartingState)) return;
    const ex = found.get(label);
    if (ex) { if (!ex.initial) ex.initial = num; }
    else found.set(label, { label, max: selfStatusMax(label), initial: num, kind: "text", source: "初期付与", evidence: "\u821E\u53F0\u958B\u59CB\u6642\u306E\u4ED8\u4E0E" });
  };
  for (const s of _startBlocks) {
    let m;
    /* 「XNを得る」「XをN得る」「XをN得て」の表記揺れに対応 */
    const re1 = /([\u4E00-\u9FA5\u30A1-\u30F6\u30FB0-9]{1,12}?)\u3092?(\d{1,3})\u3092?(?:\u5F97\u308B|\u7372\u5F97|\u5F97\u3066)/g;
    while ((m = re1.exec(s)) !== null) _setInitial(m[1], m[2], s);
    /* 「Xが0の状態で開始」「Xを0の状態で開始」（初期値0の明示） */
    const re0 = /([\u4E00-\u9FA5\u30A1-\u30F6\u30FB0-9]{1,12}?)\u304C?(\d{1,3})\u306E\u72B6\u614B\u3067(?:\u958B\u59CB|\u821E\u53F0\u958B\u59CB)/g;
    while ((m = re0.exec(s)) !== null) _setInitial(m[1], m[2], s);
    const re2 = /([\u4E00-\u9FA5\u30A1-\u30F6\u30FB]{1,10}?)\u304C?(\d{1,3})\u306E\u72B6\u614B\u3067\u958B\u59CB/g;
    while ((m = re2.exec(s)) !== null) _setInitial(m[1], m[2], s);
  }
  return [...found.values()];
}
function detectSelfManagedStatuses(personaSrc) {
  return collectSelfManagedStatusEntries(personaSrc).map((entry) => entry.label);
}
function activePersonaStatusSource(state) {
  if (!state?.personaSrc) return null;
  // 同期化（手動編集）では、画面で編集中のパッシブ・スキル・固有バフを優先する。
  // 追加パッシブ（上限なし）も本文判定へ合流させ、手動人格で追加した自己付与を取りこぼさない。
  const primaryAlways = state?.pas?.always ?? state.personaSrc.passive_always ?? "";
  const primaryEffect = state?.pas?.effect ?? state.personaSrc.passive_effect ?? "";
  const extraRecords = [
    ...(state?.pas2Enabled && state?.pas2 ? [state.pas2] : []),
    ...(Array.isArray(state?.extraPassives) ? state.extraPassives : [])
  ];
  const secondAlways = extraRecords.map((p) => p?.always || "").filter(Boolean).join("\n");
  const secondEffect = extraRecords.map((p) => p?.effect || "").filter(Boolean).join("\n");
  return {
    ...state.personaSrc,
    passive_name: state?.pas?.name ?? state.personaSrc.passive_name,
    passive_cond: state?.pas?.cond ?? state.personaSrc.passive_cond,
    passive_always: [primaryAlways, secondAlways].filter(Boolean).join("\n"),
    passive_effect: [primaryEffect, secondEffect].filter(Boolean).join("\n"),
    skills: Array.isArray(state?.skills) ? state.skills : state.personaSrc.skills,
    // 元のDB固有定義は、手動編集後のuniqueBuffsとは別に保持して分類規則の根拠にする。
    db_unique_buffs: state.personaSrc.unique_buffs || [],
    unique_buffs: Array.isArray(state?.uniqueBuffs) ? state.uniqueBuffs : state.personaSrc.unique_buffs
  };
}
function getStateSelfManagedStatusEntries(state) {
  return collectSelfManagedStatusEntries(activePersonaStatusSource(state));
}
function stateUsesBarrier(state) {
  return getStateSelfManagedStatusEntries(state).some((entry) => entry.label === "バリア");
}
function parsePositiveIntegerStrict(value) {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!/^\d+$/.test(text)) return null;
  const parsed = Number(text);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}
function normalizeItemMaxOwned(value) {
  const parsed = parsePositiveIntegerStrict(value);
  return parsed === null ? null : Math.min(99, parsed);
}
function getItemMaxOwned(state, itemId) {
  const id = String(itemId || "");
  const official = Array.isArray(window.DB?.items) ? window.DB.items.find((item) => item?.id === id) : null;
  const special = Array.isArray(window.DB?.specialItems) ? window.DB.specialItems.find((item) => item?.id === id) : null;
  const custom = Array.isArray(state?.customItems) ? state.customItems.find((item) => item?.id === id) : null;
  return normalizeItemMaxOwned((official || special || custom)?.maxOwned) || 99;
}
function clampItemQuantity(state, itemId, quantity) {
  /* セーブが壊れていても "12abc" を12個と読み替えない。正しい整数以外は既定の1個へ安全に正規化し、
     JSONインポートでは適用前に別途エラーとして拒否する。 */
  const parsed = parsePositiveIntegerStrict(quantity);
  return Math.min(getItemMaxOwned(state, itemId), parsed === null ? 1 : parsed);
}
window.LBT_getItemMaxOwned = getItemMaxOwned;
window.LBT_detectSelfManagedStatuses = detectSelfManagedStatuses;
window.LBT_getSelfManagedStatusEntries = collectSelfManagedStatusEntries;
window.LBT_getStateSelfManagedStatusEntries = getStateSelfManagedStatusEntries;

/* 手動追加の固有バフ id。同じミリ秒に続けて追加しても重複させない。
   id は編集・削除・並べ替えの引き当てに使うため、重複すると別のカードを巻き込む。 */
function nextUniqueBuffId(list) {
  const base = `ub-${Date.now()}`;
  let id = base;
  let n = 0;
  while ((list || []).some((buff) => buff && buff.id === id)) id = `${base}-${n += 1}`;
  return id;
}

function normalizeStatusCollections(state) {
  const next = { ...state };
  // DBで固有バフとして定義された名前は、編集中の名称が変わったり削除された後も
  // 既定ステータスへ自動昇格させない。旧版が自動追加した同名行だけをここで回収する。
  const uniqueStatusNames = collectUniqueStatusNames(activePersonaStatusSource(next));
  if (Array.isArray(next.uniqueBuffs)) {
    // DBが出力対象外と定義した固有処理（例: 厳粛な哀悼の「生きた蝶・死んだ蝶」）は、
    // 旧保存値や再読込でstatus側へ戻さない。分化後の個別値だけをstatusに残す。
    const dbPlaceByName = new Map((next.personaSrc?.unique_buffs || []).map((buff) => [normalizeStatusLabel(buff?.name), buff?.place || "status"]));
    next.uniqueBuffs = next.uniqueBuffs.map((b) => {
      const name = normalizeStatusLabel(b?.name);
      return { ...b, name, place: dbPlaceByName.get(name) === "none" ? "none" : b?.place || "status" };
    });
  }
  if (Array.isArray(next.customStatuses)) {
    next.customStatuses = next.customStatuses.map((c) => ({ ...c, label: normalizeStatusLabel(c?.label) }));
  }
  const managedEntries = getStateSelfManagedStatusEntries(next);
  const managedByLabel = new Map(managedEntries.map((entry) => [entry.label, entry]));
  if (Array.isArray(next.defaultStatuses)) {
    const seen = new Set();
    next.defaultStatuses = next.defaultStatuses
      .map((f) => ({ ...f, label: normalizeStatusLabel(f?.label) }))
      .filter((f) => {
        if (!f.label || seen.has(f.label)) return false;
        const isAutoManaged = f.source === "self_status" || f.auto === true;
        // DB固有名と同名（または固有名の末尾だけ）の旧自動行は、固有値と重複するため残さない。
        if (isAutoManaged && uniqueStatusNameCoversLabel(uniqueStatusNames, f.label)) return false;
        // 旧版の常時バリアもここで回収する。現在の人格に根拠がないバリアは残さない。
        if ((isAutoManaged && !managedByLabel.has(f.label)) || (f.label === "バリア" && !managedByLabel.has("バリア"))) return false;
        seen.add(f.label);
        return true;
      });
    // 保存済みビルドを復元した場合も、現在の人格の根拠を必ず再統合する。
    // これにより旧保存値で自動状態が欠けることはなく、前人格由来の状態は上の除去処理で残らない。
    next.defaultStatuses = mergeDefaultSelfStatusEntries(next.defaultStatuses, managedEntries);
  }
  // 自己付与根拠がある状態だけを、出力直前の統合候補として保持する。
  // nullの既定一覧はそのまま維持し、UIとJSONの最終統合で同じ候補を追加する。
  next.autoDetectedStatuses = managedEntries.filter((entry) => entry.kind === "text").map((entry) => entry.label);
  return next;
}
const FALLBACK_FACTORY_STATUSES = [
  { label: "HP", initial: 0, max: "hp" }, { label: "SAN", initial: 0, max: "san" },
  { label: "共鳴", initial: 0, max: 5 }, { label: "パワー", initial: 0, max: 10 },
  { label: "虚弱", initial: 0, max: 10 }, { label: "スキル威力", initial: 0, max: 10 },
  { label: "マッチ威力増加", initial: 0, max: 10 }, { label: "マッチ威力低下", initial: 0, max: 10 },
  { label: "ダメージ量増加", initial: 0, max: 10 }, { label: "ダメージ量減少", initial: 0, max: 10 },
  { label: "麻痺", initial: 0, max: 10 }, { label: "忍耐", initial: 0, max: 10 },
  { label: "武装解除", initial: 0, max: 10 }, { label: "クイック", initial: 0, max: 10 }, { label: "束縛", initial: 0, max: 10 }
];
function getFactoryDefaultStatuses() {
  const fromGenerator = window.LBT_gen?.DEFAULT_STATUS_LIST;
  return cloneJSON(Array.isArray(fromGenerator) && fromGenerator.length ? fromGenerator : FALLBACK_FACTORY_STATUSES);
}
function mergeDefaultStatusLabels(list, labels) {
  return mergeDefaultSelfStatusEntries(list, (labels || []).map((raw) => ({ label: raw, max: selfStatusMax(normalizeStatusLabel(raw)), kind: "declared" })));
}
function mergeDefaultSelfStatusEntries(list, entries) {
  const base = Array.isArray(list) ? cloneJSON(list) : getFactoryDefaultStatuses();
  const indexByLabel = new Map(base.map((item, index) => [normalizeStatusLabel(item?.label), index]).filter(([label]) => Boolean(label)));
  (entries || []).forEach((entry) => {
    const label = normalizeStatusLabel(entry?.label);
    if (!label) return;
    const max = entry?.max ?? selfStatusMax(label);
    if (indexByLabel.has(label)) {
      const index = indexByLabel.get(label);
      const existing = base[index];
      // 手動で作った同名項目の設定は人格切替で奪わない。自動由来だけを追跡する。
      if (existing.source === "self_status" || existing.auto === true) {
        /* 自動由来の初期値は、現在の人格データと効果文から毎回再計算する。
           旧版が条件付き開始時効果を初期値へ誤採用した保存値（火傷1/4など）を残さない。
           現行UIで明示的に変更した値だけは initialManual で保護する。 */
        const detectedInitial = entry?.initial ?? 0;
        const existingInitial = existing.initial ?? 0;
        base[index] = {
          ...existing,
          initial: existing.initialManual === true ? existingInitial : detectedInitial,
          max: existing.max ?? max,
          source: "self_status",
          selfStatusKind: entry?.kind || "declared"
        };
      }
      return;
    }
    indexByLabel.set(label, base.length);
    /* 新規追加: 検出された初期値（entry.initial）をそのまま反映する。
       弾丸=bullets、舞台開始時の初期付与（時間貸与3等）がここで失われていた。 */
    base.push({ label, initial: entry?.initial ?? 0, max, source: "self_status", selfStatusKind: entry?.kind || "declared" });
  });
  return base;
}
function declaredSelfStatusLabels(src) {
  return Array.from(new Set((src?.self_status || src?.selfStatus || []).map(normalizeStatusLabel).filter(Boolean)));
}
// 固有値は「現在の編集値」だけでなく、人格DBに元から記録された定義も所有元として扱う。
// これにより、ワイルドハントのデュラハンのように効果文に「得る」があっても既定一覧へは入らない。
function collectUniqueStatusNames(src) {
  const names = [];
  const addAll = (buffs) => {
    (Array.isArray(buffs) ? buffs : []).forEach((buff) => {
      const name = normalizeStatusLabel(buff?.name ?? buff);
      if (name) names.push(name);
    });
  };
  addAll(src?.unique_buffs || src?.uniqueBuffs);
  addAll(src?.db_unique_buffs || src?.dbUniqueBuffs);
  return Array.from(new Set(names));
}
function uniqueStatusNameCoversLabel(uniqueNames, rawLabel) {
  const label = normalizeStatusLabel(rawLabel);
  return !!label && (uniqueNames || []).some((name) => name === label || name.endsWith(label));
}
function detectSelfStatusCandidates(_src, _existingLabels = []) {
  // 自由文は条件、引用、カード名、任意の説明を同じ構文で書けるため、名称推定には使わない。
  // 自己管理する既定状態はDBのself_statusまたは固定語彙の明確な自己付与だけを自動統合し、
  // それ以外の値は「カスタムステータスを編集」または「手動追加」から明示的に登録する。
  return [];
}
window.LBT_normalizeStatusLabel = normalizeStatusLabel;
window.LBT_stateUsesBarrier = stateUsesBarrier;
window.LBT_normalizeEgoSlotVariants = normalizeEgoSlotVariants;
window.LBT_normalizeEgoSlots = normalizeEgoSlots;
window.LBT_detectSelfStatusCandidates = detectSelfStatusCandidates;
const SWORD_CONTRACT_HEAD_ALWAYS = "斬撃スキル威力+2";
const SWORD_CONTRACT_HEAD_BREATH_EFFECT = "スキル効果で呼吸を得る時、呼吸の保有数が最も少ない味方1名に呼吸2を付与、剣契所属なら代わりに4付与。戦闘に参加した剣契が6名以上なら代わりに全ての味方が呼吸4を得る";
const SWORD_CONTRACT_HEAD_BATTLE_START_EFFECT = "戦闘開始時、剣契所属の全ての味方に本国剣術1を付与";
const SWORD_CONTRACT_HEAD_EFFECT = `${SWORD_CONTRACT_HEAD_BREATH_EFFECT}。${SWORD_CONTRACT_HEAD_BATTLE_START_EFFECT}`;
function normalizeSwordContractHeadPassive(record) {
  if (!record || Number(record.no) !== 16 || record.name !== "剣契頭目") return record;
  if (record.passive_always === SWORD_CONTRACT_HEAD_ALWAYS && record.passive_effect === SWORD_CONTRACT_HEAD_EFFECT) return record;
  return { ...record, passive_always: SWORD_CONTRACT_HEAD_ALWAYS, passive_effect: SWORD_CONTRACT_HEAD_EFFECT };
}
function migrateSwordContractHeadPassiveState(next) {
  if (next?.syncedManual || Number(next?.personaNo) !== 16 || next?.personaSrc?.name !== "剣契頭目") return;
  next.personaSrc = normalizeSwordContractHeadPassive(next.personaSrc);
  if (next.pas) next.pas = { ...next.pas, always: SWORD_CONTRACT_HEAD_ALWAYS, effect: SWORD_CONTRACT_HEAD_EFFECT };
}
/* 束縛は「[1R] 速度が束縛の数だけ減少（最大10）」（基本ルールPDF 306頁 デバフ表）であり、
   クイックは「[1R] 速度がクイックの数だけ増加（最大10）」（同 303頁 バフ表）である。
   旧版の組込式QBは束縛を加算していたため、速度が逆に増える誤った式が保存されている。
   利用者が独自に書き換えたQBは尊重し、旧既定式と完全一致する場合だけ現行の既定式へ戻す。 */
const LEGACY_QB_EXPRS = new Set(["{\u675F\u7E1B}+{\u30AF\u30A4\u30C3\u30AF}", "{\u30AF\u30A4\u30C3\u30AF}+{\u675F\u7E1B}"]);
const CURRENT_QB_EXPR = "{\u30AF\u30A4\u30C3\u30AF}-{\u675F\u7E1B}";
function migrateLegacyQuickBindFormula(next) {
  const override = next?.builtinFormulasOverride;
  if (override && LEGACY_QB_EXPRS.has(override.QB)) {
    next.builtinFormulasOverride = { ...override, QB: CURRENT_QB_EXPR };
  }
  if (Array.isArray(next?.formulas)) {
    next.formulas = next.formulas.map((formula) => (
      formula && formula.name === "QB" && LEGACY_QB_EXPRS.has(formula.expr)
        ? { ...formula, expr: CURRENT_QB_EXPR }
        : formula
    ));
  }
}
/* 士気低下ラインはSAN最大値の25%（基本ルールPDF 39頁）で決まる派生値である。
   旧版は初期状態で固定値 "12" を保持しており、これが利用者の入力値と区別できないため、
   SAN 55 の人格でも 12 のまま出力され自動計算が働かなかった。
   旧既定値と一致する保存データだけを自動計算（空文字）へ戻し、それ以外の数値は
   利用者が意図して指定した上書き値として保持する。 */
const LEGACY_DEFAULT_MORALE_LINE = "12";
function migrateLegacyMoraleLine(next) {
  if (String(next?.moraleLine ?? "") === LEGACY_DEFAULT_MORALE_LINE) next.moraleLine = "";
}
/* ロード時に装備中の人格参照と固有バフを DB の最新データへ更新する。
   ビルドスナップショットには装備時点の personaSrc / uniqueBuffs のコピーが
   保存されており、DB（エラッタ等）を更新しても保存済みビルドから古い
   テキストが復元され続ける。DB に同名・同 No の人格が存在する場合のみ
   参照データを置き換え、ユーザーが手動で追加・改名したバフは保護する。 */
function refreshEquippedPersonaFromDB(next) {
  if (!next?.personaSrc || next.personaMode == null || next.personaNo == null) return next;
  const core = window.LBT_core;
  const pool = next.personaMode === "n" ? window.DB?.normal_personas
    : next.personaMode === "t" ? window.DB?.tokui_personas : null;
  if (!Array.isArray(pool)) return next;
  const latest = pool.find((p) => String(p.no) === String(next.personaNo) && p.name === next.personaSrc.name);
  if (!latest) return next;
  // DB 参照データ（図鑑の説明文・パッシブ原文等）は常に最新に置き換える。
  next.personaSrc = latest;
  // 固有バフ: core.js の refreshUniqueBuffsFromDB でDB同名バフを最新へ更新する。
  if (core?.refreshUniqueBuffsFromDB) {
    next.uniqueBuffs = core.refreshUniqueBuffsFromDB(next.uniqueBuffs, latest.unique_buffs);
  } else if (Array.isArray(latest.unique_buffs) && Array.isArray(next.uniqueBuffs)) {
    next.uniqueBuffs = next.uniqueBuffs.map((ub) => {
      const dbBuff = latest.unique_buffs.find((db) => db.name === ub.name);
      if (!dbBuff) return ub;
      return { ...ub, desc: dbBuff.desc, type: dbBuff.type || ub.type, initial: dbBuff.initial, max: dbBuff.max || 20, place: dbBuff.place || ub.place };
    });
  }
  // パッシブ原文も DB 最新に置き換える（ユーザー編集欄 pas/pas2 とは別物）。
  if (latest.passive_always !== void 0) next.personaSrc.passive_always = latest.passive_always;
  if (latest.passive_effect !== void 0) next.personaSrc.passive_effect = latest.passive_effect;
  return next;
}
/* 出典はカタログ（DB）側の属性。所持エントリはカタログの抜粋を写すので、
   写し漏らすと「所持のみ」表示の出典フィルタが全件ルールブックに化ける
   （未所持も表示なら正しいので、所持を持つまで気づけない）。名前で引き直す。 */
function catalogSourceByName(kind, name) {
  const db = window.DB || {};
  const lists = kind === "support" ? [db.support_passives, db.death_passives] : [db.spirits];
  for (const list of lists) {
    const hit = (Array.isArray(list) ? list : []).find((entry) => entry && entry.name === name);
    if (hit) return String(hit.source || "core");
  }
  return "core";
}
/* personaSrc と同様に、DB 由来のデータコピー（サポート・死亡後・強化・精神・
   E.G.O スロット）も保存済みビルドから古いまま復元され続ける。
   名前で DB と照合し、公式由来のレコードだけを最新へ更新する。
   ユーザーが手動で追加・改名したもの（DB に存在しない名前）は保護する。 */
function refreshDBReferencedData(next) {
  if (!window.DB) return next;

  // E.G.O スロット: 保存済み解析ビルドがあるものはユーザー編集なので保持し、
  // それ以外を DB 最新に置き換える（normalizeEgoSlots が後段で変種を再構築する）。
  if (next.egoSlots && typeof next.egoSlots === "object") {
    const dbEgos = window.DB.egos || [];
    const rosterEgos = next.roster?.egos || [];
    for (const rank of Object.keys(next.egoSlots)) {
      const slot = next.egoSlots[rank];
      if (!slot || slot.no == null) continue;
      const dbEgo = dbEgos.find((e) => String(e.no) === String(slot.no) && e.rank === rank);
      if (!dbEgo) continue;
      const hasSavedBuild = rosterEgos.some((e) => e.rank === rank && String(e.no) === String(slot.no) && e.build);
      if (hasSavedBuild) continue;
      next.egoSlots[rank] = dbEgo;
    }
  }

  // サポートパッシブ: 公式由来（DB に同名があるもの）だけ cond/effect/lp を最新に。
  if (Array.isArray(next.supports)) {
    const spDB = window.DB.support_passives || [];
    next.supports = next.supports.map((s) => {
      const db = spDB.find((d) => d.name === s.name);
      if (!db) return s;
      return { ...s, cond: db.cond, effect: db.effect, lp: db.lp, type: db.type || s.type };
    });
  }

  // 死亡後パッシブ: 同様に公式由来のみ。
  if (next.deathSupport?.name) {
    const dpDB = window.DB.death_passives || [];
    const db = dpDB.find((d) => d.name === next.deathSupport.name);
    if (db) next.deathSupport = { ...next.deathSupport, cond: db.cond, effect: db.effect, lp: db.lp };
  }

  // 強化: 公式由来の effect を最新に。
  if (Array.isArray(next.enhancements)) {
    const enhDB = [...(window.DB.normal_enhancements || []), ...(window.DB.special_enhancements || [])];
    next.enhancements = next.enhancements.map((e) => {
      const db = enhDB.find((d) => d.name === e.name);
      if (!db) return e;
      return { ...e, effect: db.effect || e.effect };
    });
  }

  // 精神: 名前で DB と照合し、効果文字列を最新に。
  if (next.spirit) {
    const spDB = window.DB.spirits || [];
    const db = spDB.find((s) => s.name === next.spirit);
    if (db) {
      next.spiritMorale = db.morale_effect || "";
      next.spiritConfuse = db.confuse_effect || "";
      next.spiritAlways = db.always_effect || "";
    }
  }

  return next;
}
/* 装備スロットは所持（roster.supports / roster.spirits）の投影として導く。
   所持を単一の情報源にし、装備は equipped フラグの結果だけを書き戻すことで、
   「所持していないものを装備できる」「装備中のものが所持一覧に無い」という
   食い違いを起こせない。効果文はDBから取り直して古い文言を引きずらない。 */
/* 明細の種別。表示と集計の単位。 */
const LEDGER_ENTRY_KINDS = [
  { id: "expense", label: "手動支出", hint: "DBに載っていない支出（自作アイテムなど）" },
  { id: "consumption", label: "消耗", hint: "戦闘で消えた・使ったアイテム" },
  { id: "item", label: "アイテム購入" },
  { id: "support", label: "サポートパッシブ" },
  { id: "deathSupport", label: "死亡後パッシブ" },
  { id: "spirit", label: "精神" },
  { id: "enhancement", label: "強化" },
  { id: "persona", label: "人格入手" },
  { id: "ego", label: "E.G.O入手" },
  { id: "other", label: "その他" }
];
window.LBT_LEDGER_ENTRY_KINDS = LEDGER_ENTRY_KINDS;
/* 所持エントリの uid を採番する。Date.now() だけだと同じミリ秒に作出的で
   衝突し、uid をキーにした装備・帰属の更新が別の要素へ誤爆する。
   連番を添えて必ず一意にする。 */
/* 通約を LP と欠片の2種に揃える。文字列や未定義が入っても計算が場わないよう、
   必ず数値へ落とす（不清な値や0として扱う）。 */
function normalizeCurrency(value) {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const toNumber = (input) => {
    let parsed;
    if (typeof input === "number") {
      parsed = input;
    } else {
      /* 価格の入力は "15LP" や全角 "１５ＬＰ" で届くことがある（正規な形式）。
         単位だけを外してから検査する。parseInt と違い "1200abc" のような
         部分一致は拒否し、桁区切りは正しく3桁ごとに分かれた形だけ許可する。 */
      const text = String(input ?? "").trim()
        .replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
        .replace(/\s+/g, "")
        .replace(/LP$/i, "");
      if (!/^\+?(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(text)) return 0;
      parsed = Number(text.replace(/,/g, ""));
    }
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
  };
  return { lp: toNumber(raw.lp), shards: toNumber(raw.shards) };
}

  /* パック名はユーザー定義文字列なので、"__proto__" 等もデータとして保持する。 */
  function setSafeRecordEntry(record, key, value) {
    Object.defineProperty(record, String(key), { value, writable: true, enumerable: true, configurable: true });
  }
  function getSafeRecordEntry(record, key, fallback = 0) {
    return record && Object.prototype.hasOwnProperty.call(record, String(key)) ? record[String(key)] : fallback;
  }

  /* 抽出チケットも通貨と同じ収支で扱う。卓で報酬として受け渡されるもので、
     リザルトの収入に「種別ごとの枚数」として積む。パック別は pack の下に
     パック名を並べるので、どのパックなら引けるかが収入の時点で分かる。 */
  function normalizeTickets(value) {
    const raw = value && typeof value === "object" && !Array.isArray(value) ? value : {};
    const toNumber = (input) => {
      let parsed;
      if (typeof input === "number") {
        parsed = input;
      } else {
        const text = String(input ?? "").trim();
        // Ticket counts are non-negative. Reject partial numeric strings and negative
        // imported entry counts, which would otherwise mint tickets when subtracted.
        if (!/^\+?(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(text)) return 0;
        parsed = Number(text.replace(/,/g, ""));
      }
      return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
    };
    const out = { persona: toNumber(raw.persona), ego: toNumber(raw.ego), choice: toNumber(raw.choice), pack: {} };
    const packs = raw.pack && typeof raw.pack === "object" && !Array.isArray(raw.pack) ? raw.pack : {};
    for (const [name, count] of Object.entries(packs)) {
      const n = toNumber(count);
      if (n) setSafeRecordEntry(out.pack, name, n);
    }
    return out;
  }

  /* 所持の抽出チケットは「全リザルトの収入 − 全明細の消費」で求める。
     LP/欠片と同じ式なので、増減を追う経路がどこであれ結果が求まる。 */
  function computeTicketBalance(results, entries) {
    const out = { persona: 0, ego: 0, choice: 0, pack: {} };
    for (const result of results || []) {
      const inc = normalizeTickets(result?.income?.tickets);
      out.persona += inc.persona;
      out.ego += inc.ego;
      out.choice += inc.choice;
      for (const [name, n] of Object.entries(inc.pack)) setSafeRecordEntry(out.pack, name, Number(getSafeRecordEntry(out.pack, name, 0)) + n);
    }
    for (const entry of entries || []) {
      /* 消費は負数で持つ（明細は支出なので）。 */
      const used = normalizeTickets(entry?.tickets);
      out.persona -= used.persona;
      out.ego -= used.ego;
      out.choice -= used.choice;
      for (const [name, n] of Object.entries(used.pack)) setSafeRecordEntry(out.pack, name, Number(getSafeRecordEntry(out.pack, name, 0)) - n);
    }
    for (const key of ["persona", "ego", "choice"]) out[key] = Math.max(0, out[key]);
    for (const [name, n] of Object.entries(out.pack)) out.pack[name] = Math.max(0, n);
    return out;
  }

function ticketTotal(balance, kind, pack) {
  if (!balance) return 0;
  if (kind === "pack") return Number(balance.pack?.[pack]) || 0;
  return Number(balance[kind]) || 0;
}

/* 抽出チケットの増減を「直近リザルトの収入」に積む。卓報酬としての受け渡しなので、
   収入に置くのが自然。resultId の指定があればそのリザルト、無ければ直近。 */
function parseStrictTicketInteger(value, options = {}) {
  const allowZero = options.allowZero === true;
  const allowNegative = options.allowNegative === true;
  let parsed;
  if (typeof value === "number") {
    parsed = value;
  } else if (typeof value === "string") {
    const text = value.trim();
    if (!/^[+-]?\d+$/.test(text)) return null;
    parsed = Number(text);
  } else {
    return null;
  }
  if (!Number.isSafeInteger(parsed)) return null;
  if (!allowNegative && parsed < 0) return null;
  if (!allowZero && parsed === 0) return null;
  return parsed;
}

/* 抽出チケットの枚数は整数だけを受け入れる。
   小数を income に直接保存すると、次回 normalizeTickets で 0 枚として扱われ、
   画面の保存値と実際の残数が食い違うため、reducer 境界で厳密に検証する。 */
function setTicketIncome(state, kind, pack, delta, resultId) {
  const targetId = resultId || latestResultId(state);
  if (!targetId) return state;
  const results = (state.results || []).map((r) => {
    if (r.id !== targetId) return r;
    const cur = normalizeTickets(r.income?.tickets);
    const next = kind === "pack"
      ? { ...cur, pack: { ...cur.pack } }
      : { ...cur };
    if (kind === "pack") {
      const nextVal = Math.max(0, (Number(getSafeRecordEntry(next.pack, pack, 0)) || 0) + delta);
      if (nextVal) setSafeRecordEntry(next.pack, pack, nextVal);
      else delete next.pack[pack];
    } else {
      next[kind] = Math.max(0, (Number(next[kind]) || 0) + delta);
    }
    return { ...r, income: { ...normalizeCurrency(r.income), tickets: next } };
  });
  return { ...state, results };
}

/* テーマパック重複で受け取った自我の欠片を「直近リザルトの収入」に積む。
   支出側（entries の負コスト）に置くと支出合計が狂う。収入はリザルト側の概念。 */
function addShardIncome(state, delta, resultId) {
  const add = Math.max(0, Number(delta) || 0);
  if (!add) return state;
  const targetId = resultId || latestResultId(state);
  if (!targetId) return state;
  const results = (state.results || []).map((r) => {
    if (r.id !== targetId) return r;
    const cur = normalizeCurrency(r.income);
    const income = { ...cur, shards: cur.shards + add };
    if (r.income && r.income.tickets !== undefined) income.tickets = r.income.tickets;
    return { ...r, income };
  });
  return { ...state, results };
}

/* 抽出チケットを消費した明細を立てる（所持を引いた証拠）。 */
function appendTicketSpend(state, kind, pack, count, ref, resultId) {
  const n = Math.max(1, Number(count) || 1);
  const label = window.LBT_ticketLabel ? window.LBT_ticketLabel(kind, pack) : (TICKET_KIND_LABEL[kind] || "抽出チケット");
  const tickets = kind === "pack"
    ? { persona: 0, ego: 0, choice: 0, pack: { [pack]: n } }
    : { persona: 0, ego: 0, choice: 0, pack: {}, [kind]: n };
  return appendLedgerEntry(state, {
    kind: "ticket",
    name: n > 1 ? `${label} を${n}枚使用` : `${label} を使用`,
    cost: { lp: 0, shards: 0 },
    tickets,
    resultId,
    ref
  });
}

let ownedUidCounter = 0;
function makeOwnedUid(prefix) {
  ownedUidCounter += 1;
  let entropy = "";
  try {
    const cryptoApi = window.crypto || window.msCrypto;
    if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
      entropy = cryptoApi.randomUUID();
    } else if (cryptoApi && typeof cryptoApi.getRandomValues === "function") {
      const bytes = new Uint8Array(8);
      cryptoApi.getRandomValues(bytes);
      entropy = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    }
  } catch (_) {
    // In restricted browser contexts, fall back to local entropy plus the monotonic counter.
  }
  if (!entropy) entropy = Math.random().toString(36).slice(2, 10) || ownedUidCounter.toString(36);
  return `${prefix}-${Date.now()}-${ownedUidCounter}-${entropy}`;
}

/* 未所持のサポパを所持へ写す（同名の重複は写さない。空名=手動追加は重複扱いしない）。 */
function addRosterSupport(state, spp) {
  const name = String(spp?.name || "");
  const roster = state.roster || {};
  if (name && (roster.supports || []).some((s) => s.name === name)) return null;
  const isDeath = isDeathSupportPassiveRecord({ name });
  const entry = {
    uid: makeOwnedUid("spt"),
    name,
    cond: String(spp?.cond || ""),
    effect: String(spp?.effect || ""),
    lp: String(spp?.lp || ""),
    slot: isDeath ? "death" : "normal",
    equipped: false,
    resultId: null,
    addedAt: Date.now(),
    notes: "",
    source: String(spp?.source || catalogSourceByName("support", name))
  };
  return { ...state, roster: { ...roster, supports: [...(roster.supports || []), entry] } };
}
/* 所持（roster.supports）から同名の1件を探す。空名（手動追加）は対象外。 */
function findOwnedSupport(state, name) {
  if (!name) return null;
  return (state?.roster?.supports || []).find((s) => s.name === name) || null;
}
/* 通常スロットの上限は拡張「サポートスロット追加」で3。UI（maxSupports）と
   出力（stateWithVisibleSupports）は既にそう振る舞う。reducer だけ2のままだと
   3枠目を装備した瞬間に既存が外れて消えるため、generator と同じ判定で数える。 */
function deathSupportSlotUnlocked(state) {
  const resolver = typeof window !== "undefined" ? window.LBT_getActiveEnhancements : null;
  const active = typeof resolver === "function" ? resolver(state) : (state?.enhancements || []);
  return (active || []).some((entry) => String(entry?.name || "") === "死亡後パッシブ追加");
}
function supportSlotLimit(state, slot) {
  if (slot === "death") return 1;
  const resolver = typeof window !== "undefined" ? window.LBT_getActiveEnhancements : null;
  const active = typeof resolver === "function" ? resolver(state) : (state?.enhancements || []);
  return (active || []).some((e) => String(e?.name || "").includes("サポートスロット追加")) ? 3 : 2;
}
/* 指定の所持を装備する。枠の上限は slot で決まる。 */
function trimSupportEquippedOverflow(supports, targetUid, slot, limit) {
  const sameSlot = supports.filter((s) => s.slot === slot && s.equipped);
  const overflowCount = Math.max(0, sameSlot.length - limit);
  if (!overflowCount) return supports;
  // Keep the explicit target equipped regardless of its position in the roster array.
  const overflowUids = new Set(sameSlot
    .filter((s) => s.uid !== targetUid)
    .slice(0, overflowCount)
    .map((s) => s.uid));
  return overflowUids.size
    ? supports.map((s) => (overflowUids.has(s.uid) ? { ...s, equipped: false } : s))
    : supports;
}
function equipRosterSupport(state, uid) {
  const roster = state.roster || {};
  /* 保存データの slot ラベルは古い版や手編集で誤っている可能性がある。
     公式死亡後パッシブ名簿を唯一の判定基準として、装備判定より先に正規化する。
     そうしないと slot:"normal" に偽装された死亡後パッシブが、未開放でも
     通常枠へ装備され、出力へ流れてしまう。 */
  let normalizedSupports = (roster.supports || []).map((s) => ({
    ...s,
    // Canonical death-only records can never be demoted by a stale label, while
    // custom records explicitly assigned to the death slot must retain that choice.
    slot: isDeathSupportPassiveRecord(s) || (s.slot === "death" && s.deathSlotManual === true) ? "death" : "normal"
  }));
  const unlocked = deathSupportSlotUnlocked(state);
  if (!unlocked) {
    // ロック中に残った死亡後装備も、別の通常装備操作で出力へ復活させない。
    normalizedSupports = normalizedSupports.map((s) => s.slot === "death" ? { ...s, equipped: false } : s);
  }
  const target = normalizedSupports.find((s) => s.uid === uid);
  if (!target) return state;

  if (target.slot === "death" && !unlocked) {
    const nextRoster = { ...roster, supports: normalizedSupports };
    return { ...state, roster: nextRoster, ...projectEquipmentFromRoster(nextRoster) };
  }

  const limit = supportSlotLimit(state, target.slot);
  const marked = normalizedSupports.map((s) => (s.uid === uid ? { ...s, equipped: true } : s));
  const supports = trimSupportEquippedOverflow(marked, uid, target.slot, limit);
  const nextRoster = { ...roster, supports };
  return { ...state, roster: nextRoster, ...projectEquipmentFromRoster(nextRoster) };
}
function projectEquipmentFromRoster(roster) {
  // The canonical death-passive catalogue wins over stale slot labels, including
  // values modified in-place by an edit action between save/normalize cycles.
  const supports = (roster?.supports || []).filter((s) => s.equipped
    && s.slot !== "death" && !isDeathSupportPassiveRecord(s));
  const deathSupport = (roster?.supports || []).find((s) => s.equipped
    && (s.slot === "death" || isDeathSupportPassiveRecord(s))) || null;
  const spiritEntry = (roster?.spirits || []).find((s) => s.equipped) || null;
  const spiritName = spiritEntry?.name || "";
  const dbSpirit = (window.DB?.spirits || []).find((s) => s.name === spiritName) || null;
  return {
    supports: supports.map((s) => ({
      id: s.uid,
      name: s.name,
      cond: dbSupportCond(s, "cond"),
      effect: dbSupportCond(s, "effect"),
      lp: s.lp
    })),
    deathSupport: deathSupport
      ? {
          id: deathSupport.uid,
          name: deathSupport.name,
          cond: dbSupportCond(deathSupport, "cond"),
          effect: dbSupportCond(deathSupport, "effect"),
          lp: deathSupport.lp
        }
      : null,
    spirit: spiritName,
    spiritMorale: dbSpirit?.morale_effect || "",
    spiritConfuse: dbSpirit?.confuse_effect || "",
    spiritAlways: dbSpirit?.always_effect || ""
  };
}
/* サポート/精神の equipped は roster 全体で1本のままだった。序列を確認しても
   最後に終わった人格の装備しか残らないので、ビルドには「どの uid を付けているか」を
   退避し、切替時に人格側の選択を roster へ押し戻す。これで人格ごとに独立する。 */
function captureEquipmentRefs(state) {
  const roster = state.roster || {};
  return {
    supportUids: (roster.supports || []).filter((s) => s.equipped).map((s) => s.uid),
    spiritUid: (roster.spirits || []).find((s) => s.equipped)?.uid || null
  };
}
function applyEquipmentRefs(roster, refs) {
  if (!refs) return roster;
  const supportUids = new Set(refs.supportUids || []);
  const supports = (roster.supports || []).map((s) => ({ ...s, equipped: supportUids.has(s.uid) }));
  const spiritUid = refs.spiritUid || null;
  const spirits = (roster.spirits || []).map((s) => ({ ...s, equipped: s.uid === spiritUid }));
  return { ...roster, supports, spirits };
}
/* 効果文はDB定義を正とする（保存側の古い文言を引きずらない）。DBに無い
   カスタム登録のときだけ保存値を使う。 */
function dbSupportCond(entry, field) {
  const pool = entry.slot === "death" ? (window.DB?.death_passives || []) : (window.DB?.support_passives || []);
  const db = pool.find((s) => s.name === entry.name);
  if (db && db[field] !== void 0 && db[field] !== null) return String(db[field]);
  return String(entry[field] || "");
}

/* ブラウザー内の旧セーブはJSONとして読めても、配列にnullやプリミティブを含む場合がある。
   DB参照による正規化の前にオブジェクト配列を掃除し、読み込み例外→初期状態保存で
   利用者の既存データを上書きする経路を防ぐ。配列要素の順序と正常なレコードは保持する。 */
function sanitizeStateCollections(raw) {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const next = { ...source };
  const recordArrays = [
    "skills", "supports", "gachaLog", "results", "entries", "inventory",
    "customItems", "enhancements", "uniqueBuffs", "extraPassives", "customStatuses", "formulas"
  ];
  const isRecord = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
  const sanitizeBooleanMap = (value) => isRecord(value)
    ? Object.fromEntries(Object.entries(value).filter(([, enabled]) => typeof enabled === "boolean"))
    : {};
  const sanitizeFormulaOverrides = (value) => isRecord(value)
    ? Object.fromEntries(Object.entries(value).filter(([, expression]) => expression === null || typeof expression === "string"))
    : {};
  const sanitizeSkillList = (value) => (Array.isArray(value) ? value : [])
    .filter(isRecord)
    .map((skill) => ({
      ...skill,
      ...(skill.dice !== undefined
        ? { dice: Array.isArray(skill.dice) ? skill.dice.filter(isRecord) : [] }
        : {})
    }));
  const sanitizePersonaSource = (value) => {
    if (!isRecord(value)) return value == null ? value : null;
    const result = { ...value };
    if (result.skills !== undefined) result.skills = sanitizeSkillList(result.skills);
    if (result.unique_buffs !== undefined) {
      result.unique_buffs = Array.isArray(result.unique_buffs) ? result.unique_buffs.filter(isRecord) : [];
    }
    if (result.extra_passives !== undefined) {
      result.extra_passives = Array.isArray(result.extra_passives) ? result.extra_passives.filter(isRecord) : [];
    }
    if (result.keywords !== undefined) {
      result.keywords = Array.isArray(result.keywords)
        ? result.keywords.filter((keyword) => typeof keyword === "string")
        : [];
    }
    return result;
  };
  const sanitizePersonaBuild = (value) => {
    if (!isRecord(value)) return null;
    const result = { ...value };
    if (result.skills !== undefined) result.skills = sanitizeSkillList(result.skills);
    for (const field of ["uniqueBuffs", "extraPassives", "supports", "enhancements", "customStatuses", "formulas"]) {
      if (result[field] !== undefined) {
        result[field] = Array.isArray(result[field]) ? result[field].filter(isRecord) : [];
      }
    }
    if (result.personaSrc !== undefined) result.personaSrc = sanitizePersonaSource(result.personaSrc);
    return result;
  };

  for (const field of recordArrays) {
    if (Array.isArray(next[field])) next[field] = next[field].filter(isRecord);
  }
  // 設定画面は formulas を map/filter するため、破損した保存値を文字列のまま残さない。
  next.formulas = Array.isArray(next.formulas) ? next.formulas.filter(isRecord) : [];
  if (next.defaultStatuses !== null && next.defaultStatuses !== void 0) {
    next.defaultStatuses = Array.isArray(next.defaultStatuses) ? next.defaultStatuses.filter(isRecord) : null;
  }
  // 偽のJSONでは型が崩れやすい設定オブジェクトを、使用側が前提にする形へ戻す。
  const excludes = isRecord(next.outputExclude) ? next.outputExclude : {};
  next.outputExclude = {
    memo: sanitizeBooleanMap(excludes.memo),
    palette: sanitizeBooleanMap(excludes.palette)
  };
  next.builtinFormulasOverride = sanitizeFormulaOverrides(next.builtinFormulasOverride);
  const egoRanks = ["ZAYIN", "TETH", "HE", "WAW", "ALEPH"];
  const rawSlots = isRecord(next.egoSlots) ? next.egoSlots : {};
  next.egoSlots = Object.fromEntries(egoRanks.map((rank) => [
    rank,
    rawSlots[rank] == null || isRecord(rawSlots[rank]) ? (rawSlots[rank] ?? null) : null
  ]));
  next.pas = isRecord(next.pas) ? next.pas : { name: "", cond: "", always: "", effect: "", quick: "" };
  next.pas2 = isRecord(next.pas2) ? next.pas2 : { name: "", cond: "", always: "", effect: "" };
  next.ui = isRecord(next.ui) ? next.ui : {};
  next.ui.previewCollapsed = isRecord(next.ui.previewCollapsed) ? next.ui.previewCollapsed : {};
  next.skills = sanitizeSkillList(next.skills);
  if (next.uniqueBuffs !== undefined) {
    next.uniqueBuffs = Array.isArray(next.uniqueBuffs) ? next.uniqueBuffs.filter(isRecord) : [];
  }
  if (next.personaSrc != null) next.personaSrc = sanitizePersonaSource(next.personaSrc);
  if (Array.isArray(next.draws)) {
    // 封緘済み証明のrecordsの形状は改変せず、バッチ自体を保持して検証器で不合格にできるようにする。
    next.draws = next.draws.filter((batch) => isRecord(batch) && Array.isArray(batch.records));
  }
  if (next.deathSupport != null && !isRecord(next.deathSupport)) next.deathSupport = null;
  if (!isRecord(next.roster)) {
    next.roster = { personas: [], egos: [], supports: [], spirits: [] };
  } else {
    next.roster = { ...next.roster };
    for (const field of ["personas", "egos", "supports", "spirits"]) {
      next.roster[field] = Array.isArray(next.roster[field])
        ? next.roster[field].filter(isRecord)
        : [];
    }
    next.roster.personas = next.roster.personas.map((entry) => {
      const build = entry.build !== undefined ? sanitizePersonaBuild(entry.build) : undefined;
      const source = entry.src !== undefined ? sanitizePersonaSource(entry.src) : null;
      const shouldSetSource = entry.src !== undefined || entry.mode === "custom";
      let safeSource = source || build?.personaSrc || null;
      if (entry.mode === "custom") {
        if (!safeSource) {
          safeSource = {
            no: entry.no,
            name: String(entry.displayName || "復旧用カスタム人格"),
            skills: [],
            unique_buffs: [],
            keywords: [],
            __custom: true
          };
        } else {
          safeSource = { ...safeSource, __custom: true };
        }
      }
      return {
        ...entry,
        ...(shouldSetSource ? { src: safeSource } : {}),
        ...(entry.build !== undefined ? { build } : {})
      };
    });
    next.roster.egos = next.roster.egos.map((entry) => ({
      ...entry,
      ...(entry.build !== undefined && !isRecord(entry.build) ? { build: null } : {})
    }));
  }
  return next;
}

/* Legacy custom Personas and imported/legacy Persona rows must have a unique mutation key. Without one,
   an APPLY_PERSONA_SYNC action can update every row sharing the same UID. Keep the
   first owner of an existing UID so historical ledger references stay attached to it;
   give missing/duplicate IDs a deterministic replacement. Custom source.no=999 is a
   shared placeholder, so the custom roster key must also be written to no. */
function normalizeCustomPersonaRosterIdentity(personas) {
  const rows = Array.isArray(personas) ? personas : [];
  const reserved = new Set(rows
    .filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry))
    .map((entry) => String(entry.uid ?? "").trim())
    .filter(Boolean));
  const seen = new Set();
  return rows.map((entry, index) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return entry;
    const isCustom = entry.mode === "custom";
    const sourceNo = String(entry.no ?? "").trim();
    let uid = String(entry.uid ?? "").trim();
    if (!uid || seen.has(uid)) {
      const mode = String(entry.mode || "unknown").trim() || "unknown";
      const base = isCustom
        ? (sourceNo && sourceNo !== "999" ? sourceNo : `custom-legacy-${index + 1}`)
        : `pr-legacy-${mode}-${sourceNo || index + 1}`;
      uid = base;
      let suffix = 2;
      while (seen.has(uid) || reserved.has(uid)) uid = `${base}-${suffix++}`;
    }
    seen.add(uid);
    return isCustom ? { ...entry, uid, no: uid } : { ...entry, uid };
  });
}

/* Favorites/history were keyed by no before custom roster rows moved from shared
   no=999 to stable UIDs. Migrate those references with the same identity change. */
function migrateLegacyCustomPersonaReferenceKeys(rawRows, normalizedRows, favorites, historyRecent, activeNo) {
  const legacyUids = (Array.isArray(normalizedRows) ? normalizedRows : [])
    .filter((entry, index) => rawRows?.[index]?.mode === "custom"
      && String(rawRows[index]?.no ?? "").trim() === "999")
    .map((entry) => String(entry?.uid ?? entry?.no ?? "").trim())
    .filter(Boolean);
  if (!legacyUids.length) return { favorites, historyRecent };

  let nextFavorites = favorites;
  if (Array.isArray(favorites)) {
    const expanded = [];
    for (const key of favorites) {
      if (key === "custom:999") expanded.push(...legacyUids.map((uid) => `custom:${uid}`));
      else expanded.push(key);
    }
    nextFavorites = [...new Set(expanded)];
  }

  let nextHistory = historyRecent;
  if (Array.isArray(historyRecent)) {
    const activeUid = String(activeNo ?? "").trim();
    const historyUid = legacyUids.includes(activeUid) ? activeUid : legacyUids[0];
    const migrated = historyRecent.map((key) => key === "custom:999" ? `custom:${historyUid}` : key);
    nextHistory = [...new Set(migrated)].slice(0, 20);
  }
  return { favorites: nextFavorites, historyRecent: nextHistory };
}

/* Reconcile the active custom Persona after legacy roster IDs are migrated.
   Old saves can still have personaNo=999 even though the owned roster now has
   stable UIDs. Resolve by a real UID first, then source name/equipped marker;
   if ambiguity remains, assign a fresh draft UID instead of overwriting the
   wrong custom Persona on the next save. */
function resolveActiveCustomPersonaIdentity(state) {
  if (state?.personaMode !== "custom" || !state.personaSrc) {
    return { personaNo: state?.personaNo ?? null, activeUid: null };
  }
  const entries = (state.roster?.personas || []).filter((entry) => entry?.mode === "custom");
  const currentNo = String(state.personaNo ?? "").trim();
  let active = null;

  if (currentNo && currentNo !== "999") {
    active = entries.find((entry) => String(entry.uid ?? "") === currentNo || String(entry.no ?? "") === currentNo) || null;
    /* A non-placeholder key with no roster match is a real unsaved draft identity.
       Never attach it to a different owned Persona merely because the names match. */
    if (active) return { personaNo: String(active.no), activeUid: String(active.no) };
    return { personaNo: currentNo, activeUid: null };
  }
  if (!active) {
    const sourceName = String(state.personaSrc?.name || "").trim();
    if (sourceName) {
      const matches = entries.filter((entry) => [
        entry.src?.name,
        entry.build?.personaSrc?.name
      ].some((name) => String(name || "").trim() === sourceName));
      if (matches.length === 1) active = matches[0];
    }
  }
  if (!active) {
    const equipped = entries.filter((entry) => entry.equipped === true);
    if (equipped.length === 1) active = equipped[0];
  }
  if (!active && entries.length === 1) active = entries[0];

  if (active) return { personaNo: String(active.no), activeUid: String(active.no) };
  if (currentNo && currentNo !== "999") return { personaNo: currentNo, activeUid: null };
  return { personaNo: makeOwnedUid("custom"), activeUid: null };
}

/* Restore the active custom Persona source after a damaged or legacy save.
   A stable active UID may only recover from its matching roster row. The legacy
   placeholder 999 can recover from one unambiguous equipped/sole row; ambiguity
   creates a new editable draft instead of silently attaching the wrong Persona. */
function normalizeActiveCustomPersonaState(state) {
  if (state?.personaMode !== "custom") return state;
  const rows = Array.isArray(state.roster?.personas) ? state.roster.personas : [];
  const isRecord = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
  let personaNo = state.personaNo;
  let source = isRecord(state.personaSrc) ? state.personaSrc : null;

  if (!source) {
    const currentNo = String(personaNo ?? "").trim();
    const customRows = rows.filter((entry) => entry?.mode === "custom");
    let candidate = null;
    if (currentNo && currentNo !== "999") {
      candidate = customRows.find((entry) =>
        String(entry.uid ?? "") === currentNo || String(entry.no ?? "") === currentNo
      ) || null;
    } else {
      const equipped = customRows.filter((entry) => entry.equipped === true);
      if (equipped.length === 1) candidate = equipped[0];
      else if (customRows.length === 1) candidate = customRows[0];
    }

    const buildSource = candidate?.build?.personaSrc;
    source = isRecord(buildSource) ? buildSource
      : isRecord(candidate?.src) ? candidate.src
      : null;
    if (source && candidate) {
      personaNo = String(candidate.no);
    } else {
      // Keep a corrupted active custom Persona editable without claiming any owned row.
      // A real stable UID is retained; only the legacy shared placeholder gets replaced.
      personaNo = currentNo && currentNo !== "999" ? currentNo : makeOwnedUid("custom");
      source = {
        no: 999,
        name: "復旧用カスタム人格",
        skills: [],
        unique_buffs: [],
        extra_passives: [],
        keywords: [],
        __custom: true
      };
    }
  }

  source = { ...source, __custom: true };
  const identity = resolveActiveCustomPersonaIdentity({ ...state, personaNo, personaSrc: source });
  personaNo = identity.personaNo;
  return {
    ...state,
    personaNo,
    personaSrc: source,
    roster: {
      ...state.roster,
      personas: rows.map((entry) => ({
        ...entry,
        equipped: identity.activeUid
          ? entry.mode === "custom" && String(entry.no) === identity.activeUid
          : false
      }))
    }
  };
}

/* Resolve the roster entry that actually matches the active Persona identity.
   An imported owned library may carry equipped=true from another character; that
   flag must not override the active mode/no stored in the current build. */
function findActiveRosterPersona(state) {
  const personas = Array.isArray(state?.roster?.personas) ? state.roster.personas : [];
  if (state?.personaMode != null && state?.personaNo != null) {
    return personas.find((entry) => entry?.mode === state.personaMode
      && String(entry.no) === String(state.personaNo)) || null;
  }
  return personas.find((entry) => entry?.equipped) || null;
}

function normalizeStateShape(raw) {
  const rawPersonaRows = Array.isArray(raw?.roster?.personas) ? raw.roster.personas : [];
  const next = refreshDBReferencedData(refreshEquippedPersonaFromDB(sanitizeStateCollections(raw)));
  next.schemaVersion = next.schemaVersion || SAVE_SCHEMA_VERSION;
  // パッシブ2は追加パッシブ列の1件目へ移行する。以後は上限なしの extraPassives が正準。
  next.extraPassives = mergeExtraPassives(next.extraPassives, { enabled: next.pas2Enabled, passive: next.pas2 });
  next.pas2Enabled = false;
  // 共有用画像は端末内でWebP/JPEGへ圧縮済みのdata URIだけを保持する。
  // 外部URLや任意MIMEを受け付けないことで、共有HTMLへそのまま安全に埋め込める。
  const shareImageData = String(next.shareImageData || "");
  next.shareImageData = /^data:image\/(webp|jpeg);base64,[A-Za-z0-9+/]+=*$/.test(shareImageData) && shareImageData.length <= 48000
    ? shareImageData : "";
  next.shareImageBlockedReason = typeof next.shareImageBlockedReason === "string" ? next.shareImageBlockedReason.slice(0, 300) : "";
  // 旧版の自由文候補は確認前でも誤登録の起点になり得るため、読み込み時に引き継がない。
  next.selfStatusCandidates = [];
  if (!Array.isArray(next.gachaLog)) next.gachaLog = [];
  if (!Array.isArray(next.supports)) next.supports = [];
  if (next.deathSupport === void 0) next.deathSupport = null;
  // Older saves could contain more than one death-only passive in the normal
  // build array. Keep one selection for the single death slot, but preserve all
  // discovered entries in the owned roster as unequipped alternatives.
  const legacyDeathSupportRows = next.supports.filter((s) => isDeathSupportPassiveRecord(s));
  if (legacyDeathSupportRows.length) {
    if (!next.deathSupport) {
      const moved = legacyDeathSupportRows[0];
      next.deathSupport = { ...moved, id: moved.id || `sppd-${Date.now()}` };
    }
    next.supports = next.supports.filter((s) => !isDeathSupportPassiveRecord(s));
  }
  if (!next.ui) next.ui = {};
  if (!next.ui.previewCollapsed) next.ui.previewCollapsed = {};
  if (!next.roster || typeof next.roster !== "object") next.roster = { personas: [], egos: [], supports: [], spirits: [] };
  if (!Array.isArray(next.roster.personas)) next.roster.personas = [];
  next.roster.personas = normalizeCustomPersonaRosterIdentity(next.roster.personas);
  if (next.personaMode === "custom") {
    Object.assign(next, normalizeActiveCustomPersonaState(next));
  }
  const migratedCustomReferences = migrateLegacyCustomPersonaReferenceKeys(
    rawPersonaRows, next.roster.personas, next.favorites, next.historyRecent,
    next.personaMode === "custom" ? next.personaNo : null
  );
  if (Array.isArray(next.favorites)) next.favorites = migratedCustomReferences.favorites;
  if (Array.isArray(next.historyRecent)) next.historyRecent = migratedCustomReferences.historyRecent;
  /* The active build identity is authoritative for every Persona mode. This also
     neutralizes stale equipped flags imported from another character's library. */
  if (next.personaMode != null && next.personaNo != null) {
    const hasActiveEntry = next.roster.personas.some((entry) => entry.mode === next.personaMode
      && String(entry.no) === String(next.personaNo));
    next.roster.personas = next.roster.personas.map((entry) => ({
      ...entry,
      equipped: hasActiveEntry && entry.mode === next.personaMode && String(entry.no) === String(next.personaNo)
    }));
  }
  if (!Array.isArray(next.roster.egos)) next.roster.egos = [];
  if (!Array.isArray(next.roster.supports)) next.roster.supports = [];
  if (!Array.isArray(next.roster.spirits)) next.roster.spirits = [];
  /* 抽出チケットは卓で報酬として受け渡されるため、リザルトの収入として管理する。
     旧セーブは state.tickets に行配列（または {persona:3} 形式）で残っているので、
     残数があるなら「抽出チケットの受領」というリザルトの収入へ移す。
     受け渡したタイミングは保存データに無いので、受領日のリザルトとして置く。 */
  const legacyTicketRows = (Array.isArray(next.tickets)
    ? next.tickets
    : (next.tickets && typeof next.tickets === "object"
      ? Object.entries(next.tickets).map(([kind, count]) => ({ kind, pack: null, count }))
      : next.tickets == null || next.tickets === "" ? [] : [next.tickets]));
  const legacyTicketCount = (ticket) => {
    if (!ticket || typeof ticket !== "object" || Array.isArray(ticket) || ticket._lbtLegacyUnresolved === true) return null;
    const raw = ticket.count;
    let count;
    if (typeof raw === "number") {
      count = raw;
    } else if (typeof raw === "string") {
      const text = raw.trim();
      if (!/^\+?(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(text)) return null;
      count = Number(text.replace(/,/g, ""));
    } else {
      return null;
    }
    return Number.isSafeInteger(count) && count > 0 ? count : null;
  };
  const legacyTicketReason = (ticket) => {
    if (!ticket || typeof ticket !== "object" || Array.isArray(ticket)) return "invalid-ticket-record";
    if (ticket._lbtLegacyUnresolved === true) return String(ticket._lbtLegacyUnresolvedReason || "unresolved-legacy-ticket");
    if (!TICKET_KINDS.includes(ticket.kind)) return "unknown-ticket-kind";
    if (legacyTicketCount(ticket) === null) return "invalid-ticket-count";
    if (ticket.kind === "pack" && (typeof ticket.pack !== "string" || !ticket.pack.trim())) return "missing-pack-name";
    return "unresolved-legacy-ticket";
  };
  const isMigratableLegacyTicket = (ticket) => !!ticket
    && typeof ticket === "object" && !Array.isArray(ticket)
    && TICKET_KINDS.includes(ticket.kind)
    && legacyTicketCount(ticket) !== null
    && (ticket.kind !== "pack" || (typeof ticket.pack === "string" && !!ticket.pack.trim()));
  const legacyTickets = legacyTicketRows.filter(isMigratableLegacyTicket);
  // 正規化できない旧行は誤変換せず、理由と原値を保持する。プリミティブ行も
  // オブジェクトで包むことで、別端末へのJSON移送時に検証器が行ごと捨てないようにする。
  const unresolvedLegacyTickets = legacyTicketRows.filter((ticket) => !isMigratableLegacyTicket(ticket)).map((ticket) => {
    if (ticket && typeof ticket === "object" && !Array.isArray(ticket)) {
      if (ticket._lbtLegacyUnresolved === true) return ticket;
      return { ...ticket, _lbtLegacyUnresolved: true, _lbtLegacyUnresolvedReason: legacyTicketReason(ticket) };
    }
    return {
      _lbtLegacyUnresolved: true,
      _lbtLegacyUnresolvedReason: legacyTicketReason(ticket),
      sourceValue: ticket
    };
  });
  if (legacyTickets.length) {
    let total = { persona: 0, ego: 0, choice: 0, pack: {} };
    for (const t of legacyTickets) {
      const count = legacyTicketCount(t);
      if (t.kind === "pack") setSafeRecordEntry(total.pack, t.pack, Number(getSafeRecordEntry(total.pack, t.pack, 0)) + count);
      else total[t.kind] = (Number(total[t.kind]) || 0) + count;
    }
    /* 数量が一致するだけの通常リザルトは移行済みとはみなさない。
       移行専用IDを持つ記録が完全一致する場合だけ、再度の加算を防ぐ。 */
    const already = (next.results || []).some((r) => {
      if (r?.id !== "res-ticket-grant") return false;
      const inc = normalizeTickets(r.income?.tickets);
      return inc.persona === total.persona && inc.ego === total.ego && inc.choice === total.choice
        && JSON.stringify(inc.pack) === JSON.stringify(total.pack);
    });
    if (!already) {
      const migrationId = (next.results || []).some((r) => r?.id === "res-ticket-grant")
        ? makeOwnedUid("res-ticket-grant") : "res-ticket-grant";
      next.results = [{
        id: migrationId,
        name: "抽出チケットの受領",
        date: localDateString(),
        income: { lp: 0, shards: 0, tickets: total },
        note: "以前所持していた抽出チケットをリザルト収入へ移行しました。",
        createdAt: Date.now()
      }, ...(next.results || [])];
    }
  }
  next.tickets = unresolvedLegacyTickets;
  next.roster = {
    ...next.roster,
    // 同期MAXは同期ランク（0/00/000）と別に保存する。旧保存データはfalseへ補完する。
    personas: next.roster.personas.map((entry) => ({
      ...entry,
      syncRank: ["0", "00", "000"].includes(String(entry?.syncRank || "")) ? String(entry.syncRank) : null,
      syncMax: entry?.syncMax === true,
      /* 同期の段階（0/00/000）が記録できないでも「同期化した」事実は残す。
         取り込みのメモには段階が書かれておらず、段階が無いまま
         素通りさせると費用だけが失われる。 */
      synced: entry?.synced === true || Boolean(entry?.syncRank) || entry?.syncMax === true
    })),
    /* 所持へ統合した2種は、人格・E.G.O と同じく uid と帰属先（resultId）を持つ。
       resultId は「どのリザルトで手に入れたか」。null は未分類で、
       以前のデータはここに入る（帰属の断定は利用者が行う）。 */
    supports: next.roster.supports
      .filter((entry) => entry && entry.name)
      .map((entry, index) => {
        // Older roster records may have no slot or may have a stale "normal" slot.
        // The canonical death-passive roster is the migration source of truth.
        const slot = entry.slot === "death" || isDeathSupportPassiveRecord(entry) ? "death" : "normal";
        return {
          uid: entry.uid || `spt-${Date.now()}-${index}`,
          name: String(entry.name),
          cond: String(entry.cond || ""),
          effect: String(entry.effect || ""),
          lp: String(entry.lp || ""),
          slot,
          // A manually chosen custom death slot is persisted state, not a catalogue guess.
          ...(entry.deathSlotManual === true ? { deathSlotManual: true } : {}),
          // Normalize the slot type without silently changing an existing build's equipment.
          // New equip/move actions still require the death-slot unlock below.
          equipped: entry.equipped === true,
          resultId: entry.resultId || null,
          addedAt: Number(entry.addedAt) || Date.now(),
          notes: String(entry.notes || ""),
          ...(entry.source ? { source: String(entry.source) } : {})
        };
      }),
    spirits: next.roster.spirits
      .filter((entry) => entry && entry.name)
      .map((entry, index) => ({
        uid: entry.uid || `spr-${Date.now()}-${index}`,
        name: String(entry.name),
        equipped: entry.equipped === true,
        resultId: entry.resultId || null,
        addedAt: Number(entry.addedAt) || Date.now(),
        notes: String(entry.notes || ""),
        ...(entry.source ? { source: String(entry.source) } : {})
      }))
  };
  /* 所持モデルへ移行する前のデータ（装備スロットしか持たない版）は、
     裝備中の1件を「所持済み・裝備中・未分類」として susan 所持へ写す。
     ここで落とすと spell 取り中のサポパ・精神が消えるため、無条件に保全する。 */
  const deathPassiveNames = Array.isArray(window.DB?.death_passives) ? window.DB.death_passives.map((d) => d?.name) : [];
  const seenSupport = new Set(next.roster.supports.map((s) => s.name));
  const legacySupportRows = [
    ...(Array.isArray(next.supports) ? next.supports : []),
    ...legacyDeathSupportRows
  ];
  const selectedDeathName = String(next.deathSupport?.name || "").trim();
  for (const entry of legacySupportRows) {
    if (!entry?.name || seenSupport.has(entry.name)) continue;
    seenSupport.add(entry.name);
    const isDeath = deathPassiveNames.includes(entry.name);
    next.roster.supports.push({
      uid: entry.id || `spt-${Date.now()}-${next.roster.supports.length}`,
      name: String(entry.name),
      cond: String(entry.cond || ""),
      effect: String(entry.effect || ""),
      lp: String(entry.lp || ""),
      slot: isDeath ? "death" : "normal",
      equipped: !isDeath || String(entry.name).trim() === selectedDeathName,
      resultId: null,
      addedAt: Date.now(),
      notes: ""
    });
  }
  if (next.deathSupport?.name && !seenSupport.has(next.deathSupport.name)) {
    seenSupport.add(next.deathSupport.name);
    const isDeath = isDeathSupportPassiveRecord(next.deathSupport);
    next.roster.supports.push({
      uid: next.deathSupport.id || `spt-${Date.now()}-${next.roster.supports.length}`,
      name: String(next.deathSupport.name),
      cond: String(next.deathSupport.cond || ""),
      effect: String(next.deathSupport.effect || ""),
      lp: String(next.deathSupport.lp || ""),
      slot: "death",
      deathSlotManual: !isDeath,
      equipped: true,
      resultId: null,
      addedAt: Date.now(),
      notes: ""
    });
  }
  // Multiple legacy death-only rows must not remain equipped together. Existing
  // roster records are kept, but any row from this legacy normal-slot list other
  // than the selected death passive is normalized to an unequipped death option.
  if (legacyDeathSupportRows.length) {
    const migratedDeathNames = new Set(legacyDeathSupportRows.map((entry) => String(entry?.name || "").trim()).filter(Boolean));
    const selectedName = String(next.deathSupport?.name || "").trim();
    next.roster.supports = next.roster.supports.map((entry) => {
      const name = String(entry?.name || "").trim();
      if (!migratedDeathNames.has(name) || name === selectedName) return entry;
      return { ...entry, slot: "death", equipped: false };
    });
  }
  // In legacy saves, a selected deathSupport may already have a matching roster row
  // under a stale normal slot. The explicit deathSupport selection is authoritative.
  if (next.deathSupport?.name) {
    const deathUid = String(next.deathSupport.id || "");
    const deathName = String(next.deathSupport.name || "").trim();
    const uidIndex = deathUid
      ? next.roster.supports.findIndex((entry) => String(entry?.uid || "") === deathUid)
      : -1;
    const matchIndex = uidIndex >= 0
      ? uidIndex
      : next.roster.supports.findIndex((entry) => String(entry?.name || "").trim() === deathName);
    if (matchIndex >= 0) {
      const selected = next.deathSupport;
      const isDeath = isDeathSupportPassiveRecord({ name: deathName });
      next.roster.supports = next.roster.supports.map((entry, index) => index === matchIndex ? {
        ...entry,
        name: deathName,
        cond: String(selected.cond ?? entry.cond ?? ""),
        effect: String(selected.effect ?? entry.effect ?? ""),
        lp: String(selected.lp ?? entry.lp ?? ""),
        slot: "death",
        deathSlotManual: !isDeath,
        equipped: true
      } : entry);
    }
  }
  // A previous normalization may have already persisted multiple death-slot
  // roster rows as equipped. The explicit active deathSupport is authoritative;
  // otherwise keep the first equipped death-slot row and clear the overflow.
  const deathSlotRows = next.roster.supports.filter((entry) => entry?.slot === "death" || isDeathSupportPassiveRecord(entry));
  const equippedDeathRows = deathSlotRows.filter((entry) => entry.equipped === true);
  if (equippedDeathRows.length > 1) {
    const selectedName = String(next.deathSupport?.name || "").trim();
    const selectedId = String(next.deathSupport?.id || "");
    const preferred = selectedName
      ? deathSlotRows.find((entry) => (selectedId && String(entry?.uid || "") === selectedId)
        || String(entry?.name || "").trim() === selectedName)
      : null;
    const keepUid = String(preferred?.uid || equippedDeathRows[0]?.uid || "");
    next.roster.supports = next.roster.supports.map((entry) => {
      if (!(entry?.slot === "death" || isDeathSupportPassiveRecord(entry)) || entry.equipped !== true) return entry;
      return { ...entry, equipped: String(entry.uid || "") === keepUid };
    });
  }
  const seenSpirit = new Set(next.roster.spirits.map((s) => s.name));
  if (typeof next.spirit === "string" && next.spirit && !seenSpirit.has(next.spirit)) {
    next.roster.spirits.push({
      uid: makeOwnedUid("spr"),
      name: next.spirit,
      equipped: true,
      resultId: null,
      addedAt: Date.now(),
      notes: ""
    });
  }
  /* 装備スロットは所持の投影。所持を書き換えたら必ずここで整合させる。 */
  /* すべての人格別ビルドをロード前に正規化する。
     非アクティブの保存ビルドも次回の人格切替で同じ不具合を再現しないよう、
     死亡後専用カタログ項目を通常枠から分離する。所持 roster は削除しない。 */
  next.roster.personas = next.roster.personas.map((entry) => {
    if (!entry?.build || typeof entry.build !== "object") return entry;
    const build = normalizePersonaSupportSnapshot(entry.build, next.roster.supports);
    return build === entry.build ? entry : { ...entry, build };
  });
  /* 旧保存データの通帳を正規化する。残高は保存しないので個別の値だけ整える。
     帰属先の無い明細と、存在しないリザルトを指す明細は未分類へ戻す。
     リザルトを消しても明細は消さない。支出額が失われると残高が狂う。 */
  if (!Array.isArray(next.results)) next.results = [];
  if (!Array.isArray(next.entries)) next.entries = [];
  /* 抽出リストは追記のみ。移行が記録を書き換えるとハッシュ鎖が切れるため、
     不正な要素を落とす以外は触らない（検証はバッチ側の verifyBatch が行う）。 */
  if (!Array.isArray(next.draws)) next.draws = [];
  next.draws = next.draws.filter((batch) => batch && typeof batch === "object" && Array.isArray(batch.records));
  /* 旧版ではLP→自我の欠片の交換を result.exchange に保存していた。
     UIから交換機能を削除する際に残高を変えないよう、旧交換を一度だけ
     通常の「LP支出明細」と「獲得欠片」へ移行する。exchange を取り除けば
     次回の hydrate で再移行されない。大きすぎて安全整数にならない旧記録だけは
     原値を残し、computeLedgerBalance の後方互換経路で残高を保つ。 */
  const migratedExchangeEntries = [];
  next.results = next.results.map((result) => {
    const id = result.id || makeOwnedUid("res");
    const name = String(result.name || "").slice(0, 80);
    const date = String(result.date || "").slice(0, 10);
    const income = { ...normalizeCurrency(result.income), tickets: normalizeTickets(result.income?.tickets) };
    const exchange = normalizeCurrency(result.exchange);
    let note = String(result.note || "");
    const consumedItems = normalizeConsumedItems(result.consumedItems);
    const hasExchange = exchange.lp > 0 || exchange.shards > 0;
    if (hasExchange && Number.isSafeInteger(income.shards + exchange.shards)) {
      income.shards += exchange.shards;
      if (exchange.lp > 0) {
        migratedExchangeEntries.push({
          id: makeOwnedUid("ent"),
          kind: "expense",
          name: "旧記録：LPから自我の欠片を交換",
          cost: { lp: exchange.lp, shards: 0 },
          tickets: normalizeTickets(null),
          resultId: id,
          at: Date.now(),
          note: "旧記録移行: " + exchange.lp + "LP → 自我の欠片 " + exchange.shards + "個",
          ref: null
        });
      }
      const migrationNote = "旧LP換算を移行済み（" + exchange.lp + "LP → 自我の欠片 " + exchange.shards + "個）";
      note = [note, migrationNote].filter(Boolean).join("\n").slice(0, 2000);
      const { exchange: _legacyExchange, ...withoutExchange } = result;
      return { ...withoutExchange, id, name, date, income, note, consumedItems };
    }
    if (hasExchange) {
      /* 安全整数を超える旧記録は計算値を変えず、旧フィールドを保全する。 */
      return { ...result, id, name, date, income, exchange, note, consumedItems };
    }
    const { exchange: _legacyExchange, ...withoutExchange } = result;
    return { ...withoutExchange, id, name, date, income, note, consumedItems };
  });
  next.entries.push(...migratedExchangeEntries);
  /* キャラ作成直後の所得は「初期作成」リザルトにまとめる。
     core 3章 P19-20「PCにはキャラ作成時に30LPが支給」（core:344）なので、
     その30LPをこのリザルトの収入に置き、最初に選んだ人格などの支出も
     ここに帰属させる（直近リザルトが1件だけなので自然にここへ落ちる）。

     継承アカウントの判定：
       - リザルトが無い … 新規作成。初期作成を作って 30LP を置く。
       - 直近リザルトが初期支給と一致 … 既に誰かがこの支給を記録済み。
         30LP を重ねると二重計上なので触らない。
       - 直近リザルトが初期支給と違う … 記録済みだが支給が別リザルトに
         散らばっている可能性。.initial を先頭に差し、ここへ 30LP を置いて
         以後の差分をこのリザルト起点で追えるようにする。 */
  if (!next.results.length) {
    /* 新規キャラクター作成。人格を1つも持たないなら、最初の1人格を
       指定購入でも初期作成用人格チケットでの抽出でも決められるようにする。 */
    next.results = [makeInitialResult({ withPersonaTicket: !(next.roster?.personas || []).length })];
  } else if (!hasInitialGrant(next.results)) {
    /* 既存アカウントへの後付けは支給だけ足す。初期作成用人格チケットは
       新規キャラクター作成のときの1枚だけで、継承アカウントに配ると
       既に都市参加済みのキャラでも無料抽出が1回湧くことになる。 */
    next.results = [makeInitialResult(), ...next.results];
  }
  const knownResultIds = new Set(next.results.map((r) => r.id));
  next.entries = next.entries.map((entry) => ({
    ...entry,
    id: entry.id || makeOwnedUid("ent"),
    kind: String(entry.kind || "other"),
    name: String(entry.name || "").slice(0, 120),
    cost: normalizeCurrency(entry.cost),
    /* 抽出チケットの消費も明細に持つ（残数 = 収入 − 消費）。 */
    tickets: normalizeTickets(entry.tickets),
    resultId: knownResultIds.has(entry.resultId) ? entry.resultId : null,
    ref: entry.ref && typeof entry.ref === "object" ? {
      kind: String(entry.ref.kind || ""),
      uid: String(entry.ref.uid || ""),
      ...(String(entry.ref.kind || "") === "gachaBatch" && entry.ref.commit
        ? { commit: String(entry.ref.commit).slice(0, 160) } : {})
    } : null
  }));
  /* サポート/精神の装備は人格ごとに違う。装備中の人格に保存ビルドがあるなら
     それが正で、roster の投影（最後に開いた人格の装備）を当ててはいけない。
     投影するのは保存ビルドが無い場合だけで、そのときはロードする側の既定になる。 */
  const hasActivePersonaIdentity = next.personaMode != null && next.personaNo != null;
  const equippedEntry = findActiveRosterPersona(next);
  if (equippedEntry?.build) {
    const refs = equippedEntry.build.equipmentRefs;
    if (refs) next.roster = applyEquipmentRefs(next.roster, refs);
    next.supports = Array.isArray(equippedEntry.build.supports) ? cloneJSON(equippedEntry.build.supports) : [];
    next.deathSupport = equippedEntry.build.deathSupport ? cloneJSON(equippedEntry.build.deathSupport) : null;
    next.spirit = equippedEntry.build.spirit ?? "";
    next.spiritMorale = equippedEntry.build.spiritMorale ?? "";
    next.spiritConfuse = equippedEntry.build.spiritConfuse ?? "";
    next.spiritAlways = equippedEntry.build.spiritAlways ?? "";
  } else if (equippedEntry || !hasActivePersonaIdentity) {
    Object.assign(next, projectEquipmentFromRoster(next.roster));
  }
  /* If a partial roster import does not contain the active Persona, keep the
     current support/mental projection. Do not apply another Persona's equipped
     roster flags to the character whose active identity is still unchanged. */
  // 導入済みアイテムはビルド固有の所持状態。旧保存データには空配列を補完する。
  if (!Array.isArray(next.inventory)) next.inventory = [];
  if (!Array.isArray(next.initialItems)) next.initialItems = [];
  next.initialItems = [...new Set(next.initialItems.map((id) => String(id || "").trim()).filter(Boolean))];
  next.inventory = next.inventory.filter((entry) => entry && entry.itemId).map((entry) => ({
    uid: entry.uid || `it-${Date.now()}-${entry.itemId}`,
    itemId: String(entry.itemId),
    quantity: parsePositiveIntegerStrict(entry.quantity) ?? 1,
    memo: entry.memo !== false,
    palette: entry.palette !== false,
    /* origin は「初期枠から来たのか、買ったのか」。旧保存データは買った側。 */
    origin: entry.origin === "initial" ? "initial" : "acquired"
  }));
  // オリジナルアイテムは公式DBとは別にビルドへ保存する。空名称・重複IDは除外する。
  const seenCustomItemIds = new Set();
  next.customItems = (Array.isArray(next.customItems) ? next.customItems : []).map((item) => ({
    id: String(item?.id || `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
    name: String(item?.name || "").trim().slice(0, 80),
    category: String(item?.category || "その他").trim().slice(0, 24) || "その他",
    tags: Array.isArray(item?.tags) ? item.tags.map((tag) => String(tag || "").trim()).filter(Boolean).slice(0, 12) : [],
    effect: String(item?.effect || "").trim().slice(0, 2000),
    palette: String(item?.palette || "").trim().slice(0, 2000),
    price: String(item?.price || "").trim().slice(0, 24),
    maxOwned: normalizeItemMaxOwned(item?.maxOwned),
    custom: true
  })).filter((item) => item.name && !seenCustomItemIds.has(item.id) && (seenCustomItemIds.add(item.id) || true));
  // 旧保存データも、現在の公式・オリジナル定義の上限へ正規化する。
  /* 1アイテムIDにつき所持スタックは1行。破損した旧セーブに同じ itemId が複数行あると、
     行ごとの maxOwned で合計上限を超えられ、追加時も先頭行だけ更新されてしまう。
     ここで合算・上限適用し、削除や支出取消の参照UIDも代表行へ寄せる。 */
  const inventoryByItemId = new Map();
  const inventoryUidAliases = new Map();
  for (const rawEntry of next.inventory) {
    const itemId = String(rawEntry.itemId || "").trim();
    if (!itemId) continue;
    const entry = { ...rawEntry, itemId, quantity: clampItemQuantity(next, itemId, rawEntry.quantity) };
    const current = inventoryByItemId.get(itemId);
    if (!current) {
      inventoryByItemId.set(itemId, entry);
      continue;
    }
    current.quantity = clampItemQuantity(next, itemId, current.quantity + entry.quantity);
    current.memo = current.memo !== false || entry.memo !== false;
    current.palette = current.palette !== false || entry.palette !== false;
    if (current.origin !== entry.origin) current.origin = "acquired";
    if (entry.uid && current.uid && entry.uid !== current.uid) inventoryUidAliases.set(entry.uid, current.uid);
  }
  next.inventory = [...inventoryByItemId.values()];
  if (inventoryUidAliases.size && Array.isArray(next.entries)) {
    next.entries = next.entries.map((entry) => {
      if (entry?.ref?.kind !== "inventory") return entry;
      const uid = inventoryUidAliases.get(String(entry.ref.uid || ""));
      return uid ? { ...entry, ref: { ...entry.ref, uid } } : entry;
    });
  }
  next.shareOptions = {
    showSyncRank: next.shareOptions?.showSyncRank !== false,
    showSyncRankInOutput: next.shareOptions?.showSyncRankInOutput === true
  };
  /* パレットの効果段落に付ける▶︎は端末ごとの表示設定。
     shareOptions は共有リンクで同期ランクの明示的な意思表示として絞り込まれるため、
     出力書式はここ（共有しない設定）へ置く。 */
  next.paletteOptions = {
    effectBullet: next.paletteOptions?.effectBullet !== false
  };
  next.skills = migrateLegacyDerivedSkills(next.skills || [], next.personaSrc?.skills || []);
  if (next.personaSrc?.skills) next.personaSrc = { ...next.personaSrc, skills: migrateLegacyDerivedSkills(next.personaSrc.skills) };
  // V65r58: 通常人格の剣契頭目は、DB原文どおり斬撃補正を常時効果、
  // 呼吸付与・戦闘開始時付与を通常効果へ統一する。同期手動編集は変更しない。
  migrateSwordContractHeadPassiveState(next);
  // V65r62: 旧既定のQB（束縛を加算）を、速度減少という束縛の定義どおりの減算式へ戻す。
  migrateLegacyQuickBindFormula(next);
  // V65r63: 旧既定の固定値12を、SAN最大値の25%という定義どおりの自動計算へ戻す。
  migrateLegacyMoraleLine(next);
  next.egoSlots = normalizeEgoSlots(next.egoSlots);
  /* 無料の精神は初めから持つ。ここ是不够していた場合の補完であり、
     購入ではないので明細は立てない。 */
  const roster = next.roster || (next.roster = {});
  const spiritList = Array.isArray(roster.spirits) ? roster.spirits : (roster.spirits = []);
  const ownedSpirit = new Set(spiritList.map((s) => s && s.name));
  for (const seed of initialFreeSpirits()) {
    if (!ownedSpirit.has(seed.name)) spiritList.push(seed);
  }
  /* 保存済みデータに、ごみ箱時代の trashedAt が残っていることがある。
     復元用の面はない（削除は Undo/Redo が生む）ので、その場で通常明細へ戻す。
     黙って残額から抜くと「消えた支出」に見えるため、見える形で落とす。 */
  if ((next.entries || []).some((e) => e && e.trashedAt != null)) {
    next.entries = next.entries.map((e) => {
      if (!e || e.trashedAt == null) return e;
      const { trashedAt, ...rest } = e;
      return rest;
    });
  }
  /* 所持エントリの出典を名前で補う。生成点が複数（ショップ購入・一括取り込み・
     旧保存の移行・初期支給の精神）あるので、作り手ごとではなくここで一度に揃える。
     DB が未ロードのときは空のまま残す。既定値を焼き込むと、後から正しい値へ
     直せなくなる（未所持も表示なら正しく、所持のみ表示のときだけ全件ルールブックに
     化けていた＝この非対称が発見を遅らせた）。 */
  if (window.DB) {
    for (const entry of next.roster.supports) {
      if (entry && !entry.source) entry.source = catalogSourceByName("support", entry.name);
    }
    for (const entry of next.roster.spirits) {
      if (entry && !entry.source) entry.source = catalogSourceByName("spirit", entry.name);
    }
  }
  return repairGachaResultAttribution(normalizeStatusCollections(next));
}
/* 残高は保存しない。収入合計から支出合計を引くだけなので,
   帰属を直すとこの値が動く。明細の帰属を直せば連載ごとに収支を説明できる。 */
/* ---- 価格の導出 ------------------------------------------------------
   通帳へ自動記録するのは「DB が価格を持つもの」だけ。
   アイテムは価格文字列（"15LP"・"50欠片"・"10LP 30SHARD" など）、強化と精神と
   死亡後サポパは欠片、通常サポパは LP の数値。表記の解釈は parsePriceText に
   一任する。価格は独立した保存値を持たせない。
   値が変わっても明細が古びないよう、表示時に DB から引く。 */
/* 明細の表示名。公式DBにあれば公式名、なければ所持しているカスタム定義を使う。
   かつてここは window.LBT_customItems を読んでいたが、どこでも代入されない
   死んだ参照で、カスタムアイテムの明細が "custom-…" のまま表示されていた。 */
function ownedName(state, itemId) {
  const official = (window.DB?.items || []).find((i) => i.id === itemId);
  if (official?.name) return String(official.name);
  const special = (window.DB?.specialItems || []).find((i) => i?.id === itemId);
  if (special?.name) return String(special.name);
  const custom = Array.isArray(state?.customItems) ? state.customItems.find((i) => i?.id === itemId) : null;
  return String(custom?.name || itemId || "");
}
/* 価格表記を LP と欠片に分けて読む。単位語（LP・SHARD・欠片・欠）が
   指す通貨へ数字を割り当て、単位語の無い素の数字は defaultUnit
   （"lp"|"shards"、既定はLP）へ倒す。読み取れない表記は0に落とす。
   最後は必ず normalizeCurrency を通すので、ここより下に負や NaN が
   漏れない。この1関数が価格文字列の唯一の解釈経路である
   （shop 表示や取り込み側も window.LBT_parsePriceText を使う）。 */
function parsePriceText(raw, defaultUnit) {
  if (typeof raw === "number") return normalizeCurrency(defaultUnit === "shards" ? { shards: raw } : { lp: raw });
  if (typeof raw !== "string") return normalizeCurrency(raw);
  /* 日本語入力は全角数字・全角アルファベット（１５ＬＰ）を出す。
     半角しか読めないと価格が常に 0 になり、帳の残高が動かない。 */
  const normalized = raw.replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
  const text = normalized.trim();
  if (!text) return { lp: 0, shards: 0 };
  /* 数字と単位語は「隣り合う対」で読み、左から順に消費する。
     先読みで結合を決めないので "LP10 SHARD30" の 10 が SHARD 側へ
     溢れない。各通貨は最初に見つかった対を採る。 */
  let lp = 0;
  let shards = 0;
  /* 桁区切り付き金額をひとまとまりとして読む。単純な \d+ では
     「1,200LP」が「200LP」に途中一致し、支出が1,000LP少なく記録される。 */
  const amountPattern = "(?:\\d{1,3}(?:,\\d{3})+|\\d+)";
  const unitPattern = "(?:LP|SHARD|欠片|欠)";
  const pricePairs = new RegExp(
    "(" + amountPattern + ")\\s*(" + unitPattern + ")(?![A-Z])"
      + "|(" + unitPattern + ")\\s*(" + amountPattern + ")(?![\\d,])",
    "gi"
  );
  for (const m of text.matchAll(pricePairs)) {
    let amount;
    let unit;
    if (m[1] !== undefined) {
      /* 「1,20LP」のような不正な桁区切りで末尾の「20LP」だけを採らない。 */
      if (/[\d,]/.test(text[m.index - 1] || "")) continue;
      amount = m[1];
      unit = m[2];
    } else {
      amount = m[4];
      unit = m[3];
    }
    if (/SHARD|欠/i.test(unit)) { if (!shards) shards = amount; }
    else if (!lp) lp = amount;
  }
  if (lp || shards) return normalizeCurrency({ lp, shards });
  const bare = text.match(/^((?:\d{1,3}(?:,\d{3})+|\d+))$/);
  return normalizeCurrency(bare ? (defaultUnit === "shards" ? { shards: bare[1] } : { lp: bare[1] }) : {});
}
window.LBT_parsePriceText = parsePriceText;
function priceItemById(state, itemId) {
  const id = String(itemId || "");
  const special = (window.DB?.specialItems || []).find((item) => item?.id === id && item.specialResource);
  if (special?.ledgerResource === "shards") return parsePriceText(special.price || "2LP");
  if (special) {
    const configured = parsePriceText(special.price);
    return configured.lp > 0 || configured.shards > 0 ? configured : null;
  }
  const official = (window.DB?.items || window.DB?.itemList || []).find((i) => i?.id === id);
  if (official) return parsePriceText(official.price);
  /* オリジナルアイテムも価格を持てる。state を参照しないと購入明細の
     価格が常に 0 になり、帳の残高から購入が消える。 */
  const custom = Array.isArray(state?.customItems) ? state.customItems.find((i) => i?.id === id) : null;
  return parsePriceText(custom?.price);
}
function priceEnhancement(group, name) {
  const all = [...(window.DB?.normal_enhancements || []), ...(window.DB?.special_enhancements || [])];
  const hit = all.find((e) => e.name === name && (!group || e.group === group));
  return parsePriceText(hit?.shards, "shards");
}
function priceSpirit(name) {
  const hit = (window.DB?.spirits || []).find((s) => s.name === name);
  return parsePriceText(hit?.price, "shards");
}
/* 人格エントリから DB の正式名を引く（同期化・解析の対象解決に使う）。 */
function personaDbName(entry) {
  if (!entry) return "";
  const list = entry.mode === "t" ? window.DB?.tokui_personas : window.DB?.normal_personas;
  const hit = (list || []).find((p) => String(p.no) === String(entry.no));
  return hit ? String(hit.name || "") : "";
}

/* E.G.O エントリから DB の正式名を引く。 */
function egoDbName(entry) {
  if (!entry) return "";
  const hit = (window.DB?.egos || []).find((e) => e.rank === entry.rank && String(e.no) === String(entry.no));
  return hit ? String(hit.name || "") : String(entry.build?.name || entry.name || "");
}

function priceSupport(name, slot) {
  if (slot === "death") {
    const hit = (window.DB?.death_passives || []).find((s) => s.name === name);
    return parsePriceText(hit?.shards, "shards");
  }
  const hit = (window.DB?.support_passives || []).find((s) => s.name === name);
  return parsePriceText(hit?.lp, "lp");
}
function priceEgo(rank, no) {
  const hit = (window.DB?.egos || []).find((e) => e.rank === rank && String(e.no) === String(no));
  return parsePriceText(hit?.shards, "shards");
}

/* 明細の追記と除去。帰属はリザルト画面の「新しい順」と同じ規則で決める。
   表示側は日付、同日なら createdAt の降順で並べる。共有データの取り込みなどで
   results 配列の順番が変わっていても、配列末尾を最新と誤認しない。
   リザルトが無ければ未分類（resultId:null）に置く。明示 resultId は呼び出し側を優先。 */
function latestResultId(state) {
  return latestResultByDisplayOrder(state?.results)?.id || null;
}

/* 前回の誤修正では results 配列末尾を最新とみなしたため、抽出時刻・封緘バッチ・
   直後に作られた明細が揃っている保存データは、表示上の最新リザルトへ一度だけ直す。
   証明バッチそのものは変更しない。日時・バッチ・同じ結果IDを持つ明細を照合できない
   古い履歴には触れず、利用者が手で動かした明細も上書きしない。 */
function repairGachaResultAttribution(state) {
  const logs = Array.isArray(state?.gachaLog) ? state.gachaLog : [];
  const draws = Array.isArray(state?.draws) ? state.draws : [];
  const results = Array.isArray(state?.results) ? state.results : [];
  const originalEntries = Array.isArray(state?.entries) ? state.entries : [];
  if (!logs.length || !draws.length || !results.length) return state;

  const roster = state.roster || {};
  const personas = Array.isArray(roster.personas) ? roster.personas : [];
  const egos = Array.isArray(roster.egos) ? roster.egos : [];
  const validResultIds = new Set(results.map((result) => String(result?.id || "")).filter(Boolean));
  let changedEntries = false;
  let nextEntries = originalEntries;

  const normalizedName = (value) => String(value || "").normalize("NFKC").replace(/\s+/g, "").toLocaleLowerCase("ja-JP");
  const sameCost = (left, right) => {
    const a = normalizeCurrency(left);
    const b = normalizeCurrency(right);
    return a.lp === b.lp && a.shards === b.shards;
  };
  const costIsPositive = (value) => {
    const cost = normalizeCurrency(value);
    return cost.lp > 0 || cost.shards > 0;
  };
  const hasRecordForPersona = (batch, persona) => (batch.records || []).some((record) => {
    if (!record || record.duplicate) return false;
    const item = record.item || {};
    const kind = String(record.kind || item.kind || batch.kind || "");
    if (kind === "specialPersona") return persona.mode === "t" && String(persona.no) === String(item.no);
    if (kind === "persona") return persona.mode === "n" && String(persona.no) === String(item.no);
    if (kind === "themePack") {
      const found = personaNoByName(item.name);
      return !!found && persona.mode === found.mode && String(persona.no) === String(found.no);
    }
    return false;
  });
  const hasRecordForEgo = (batch, ego) => (batch.records || []).some((record) => {
    if (!record || record.duplicate) return false;
    const item = record.item || {};
    return String(record.kind || item.kind || batch.kind || "") === "ego"
      && String(ego.rank || "") === String(item.rank || "")
      && String(ego.no) === String(item.no);
  });
  const matchesTransaction = (entry, batch, logAt, sourceResultId) => {
    if (String(entry?.resultId || "") !== sourceResultId) return false;
    const at = Number(entry.at);
    if (!Number.isFinite(at) || at < logAt - 2000 || at > logAt + 15000) return false;
    if (entry.ref?.kind === "gachaBatch") {
      const referencedCommit = String(entry.ref.commit || "");
      const batchCommit = String(batch.commit || batch.batchHash || "");
      /* 新形式は抽選固有commitで厳密に照合する。commitの無い旧形式だけ、
         既存互換として時刻窓を使う（複数候補ならsourceResultIdが一意にならず移動しない）。 */
      if (referencedCommit) return referencedCommit === batchCommit;
      /* バッチIDが保存されていない旧明細は、時刻だけで複数抽選に一致する場合、
         どれの支出か証明できないため移動しない。 */
      const possibleLogs = logs.filter((candidateLog) => {
        const candidateAt = Date.parse(String(candidateLog?.at || ""));
        const candidateCommit = String(candidateLog?.commit || "");
        if (!Number.isFinite(candidateAt) || !candidateCommit
          || at < candidateAt - 2000 || at > candidateAt + 15000) return false;
        return draws.some((candidateBatch) =>
          String(candidateBatch?.commit || "") === candidateCommit
          || String(candidateBatch?.batchHash || "") === candidateCommit);
      });
      return possibleLogs.length === 1
        && String(possibleLogs[0]?.commit || "") === batchCommit;
    }
    if (entry.ref?.kind === "rosterPersona") {
      const persona = personas.find((row) => String(row?.uid || "") === String(entry.ref.uid || ""));
      return !!persona && hasRecordForPersona(batch, persona);
    }
    if (entry.ref?.kind === "rosterEgo") {
      const ego = egos.find((row) => String(row?.uid || "") === String(entry.ref.uid || ""));
      return !!ego && hasRecordForEgo(batch, ego);
    }
    /* 自由入力の支出は、名前・金額・時刻が似ていても抽選明細と断定できない。
       resultId を自動で書き換えない。特にユーザーが登録した手動支出は保持する。 */
    return false;
  };
  const manualSpendMatches = (names, expectedCost, entries) => {
    if (!costIsPositive(expectedCost)) return false;
    const wanted = new Set(names.map(normalizedName).filter(Boolean));
    return entries.some((entry) => {
      const ref = entry?.ref;
      if (ref && (String(ref.kind || "") || String(ref.uid || ""))) return false;
      if (!entry || entry.kind === "ticket") return false;
      if (!wanted.has(normalizedName(entry.name))) return false;
      return sameCost(entry.cost, expectedCost);
    });
  };
  const acquisitionForRecord = (record, batch) => {
    if (!record || record.duplicate) return null;
    const item = record.item || {};
    const kind = String(record.kind || item.kind || batch.kind || "");
    let row = null;
    let entryKind = "";
    let refKind = "";
    let ledgerName = "";
    let aliases = [String(item.name || "").trim()];
    let identity = null;

    if (kind === "persona" || kind === "specialPersona") {
      const mode = kind === "specialPersona" || item.mode === "t" ? "t" : "n";
      identity = { mode, no: String(item.no) };
      row = personas.find((candidate) => candidate.mode === mode && String(candidate.no) === identity.no) || null;
      const sourceList = mode === "t" ? (window.DB?.tokui_personas || []) : (window.DB?.normal_personas || []);
      const source = sourceList.find((candidate) => String(candidate.no) === identity.no);
      ledgerName = String(source?.name || row?.name || row?.displayName || item.name || ("人格 " + mode.toUpperCase() + " No." + identity.no));
      aliases.push(ledgerName);
      entryKind = "persona";
      refKind = "rosterPersona";
    } else if (kind === "ego") {
      identity = { rank: String(item.rank || ""), no: String(item.no) };
      row = egos.find((candidate) => String(candidate.rank || "") === identity.rank && String(candidate.no) === identity.no) || null;
      const source = (window.DB?.egos || []).find((candidate) => String(candidate.rank || "") === identity.rank && String(candidate.no) === identity.no);
      ledgerName = identity.rank + " No." + identity.no;
      aliases.push(String(source?.name || ""));
      aliases.push(ledgerName);
      entryKind = "ego";
      refKind = "rosterEgo";
    } else if (kind === "themePack") {
      const found = personaNoByName(item.name);
      if (!found) return null;
      identity = { mode: found.mode, no: String(found.no) };
      row = personas.find((candidate) => candidate.mode === found.mode && String(candidate.no) === identity.no) || null;
      const sourceList = found.mode === "t" ? (window.DB?.tokui_personas || []) : (window.DB?.normal_personas || []);
      const source = sourceList.find((candidate) => String(candidate.no) === identity.no);
      ledgerName = String(source?.name || row?.name || row?.displayName || item.name || "");
      aliases.push(ledgerName);
      entryKind = "persona";
      refKind = "rosterPersona";
    } else {
      return null;
    }
    if (!row || !row.uid || !ledgerName) return null;
    return {
      row,
      entryKind,
      refKind,
      ledgerName,
      aliases: [...new Set(aliases.map((name) => String(name || "").trim()).filter(Boolean))],
      cost: normalizeCurrency(record.cost),
      uid: String(row.uid)
    };
  };

  const repairedLogs = logs.map((log) => {
    if (!log || typeof log !== "object" || Number(log.resultAttributionRepairVersion) >= 2) return log;
    const recordedResultId = String(log.resultId || "");
    const logAt = Date.parse(String(log.at || ""));
    const commit = String(log.commit || "");
    if (!Number.isFinite(logAt) || !commit) return log;

    const batch = draws.find((candidate) => String(candidate?.commit || "") === commit
      || String(candidate?.batchHash || "") === commit);
    if (!batch || !Array.isArray(batch.records) || !batch.records.length) return log;

    /* 抽選時点で既に存在したリザルトだけを候補にする。後から作られた記録へ過去の
       抽選を移動しない。作成時刻のないレコードは推測で対象にしない。 */
    const existingAtDraw = results.filter((result) => {
      const createdAt = Number(result?.createdAt);
      return Number.isFinite(createdAt) && createdAt > 0 && createdAt <= logAt;
    });
    const targetResultId = latestResultId({ results: existingAtDraw });
    if (!targetResultId || !validResultIds.has(String(targetResultId))) return log;

    /* 旧ログの resultId が無い形式も、紐づく所持明細の候補が一意なら元の帰属を推定する。
       手動支出（ref がない明細）は、この照合対象に入れない。 */
    const candidateResultIds = new Set();
    for (const entry of nextEntries) {
      const entryResultId = String(entry?.resultId || "");
      if (!entryResultId || !validResultIds.has(entryResultId)) continue;
      if (matchesTransaction(entry, batch, logAt, entryResultId)) candidateResultIds.add(entryResultId);
    }
    const sourceResultId = validResultIds.has(recordedResultId)
      ? recordedResultId
      : (candidateResultIds.size === 1 ? [...candidateResultIds][0] : "");

    if (sourceResultId && targetResultId !== sourceResultId) {
      const moved = nextEntries.map((entry) => {
        if (!matchesTransaction(entry, batch, logAt, sourceResultId)) return entry;
        return { ...entry, resultId: targetResultId };
      });
      if (moved.some((entry, index) => entry !== nextEntries[index])) {
        changedEntries = true;
        nextEntries = moved;
      }
    }

    /* 抽選ログは残っているのに取得明細が欠けている場合の復元。
       同じ所持UIDの取得明細が既にあれば二重作成しない。手動支出と同じ名前・額が
       見つかったら、その手動行を移動・削除せず、復元する取得行は0円にして二重課金を防ぐ。 */
    const transactionEntries = [...nextEntries];
    const records = Array.isArray(batch.records) ? batch.records : [];
    for (const record of records) {
      const info = acquisitionForRecord(record, batch);
      if (!info) continue;
      const linked = nextEntries.filter((entry) =>
        entry?.ref?.kind === info.refKind
        && String(entry.ref.uid || "") === info.uid
        && entry.kind === info.entryKind
      );
      const matchingManualSpend = manualSpendMatches(info.aliases, info.cost, transactionEntries);

      if (linked.length) {
        if (matchingManualSpend && costIsPositive(info.cost)) {
          let adjusted = false;
          nextEntries = nextEntries.map((entry) => {
            if (!(entry?.ref?.kind === info.refKind
              && String(entry.ref.uid || "") === info.uid
              && entry.kind === info.entryKind)) return entry;
            const currentCost = normalizeCurrency(entry.cost);
            if (currentCost.lp === 0 && currentCost.shards === 0) return entry;
            adjusted = true;
            return {
              ...entry,
              cost: { lp: 0, shards: 0 },
              note: (String(entry.note || "") + (entry.note ? "\n" : "")
                + "抽出履歴補正：一致する手動支出を維持し、取得行の費用重複を回避").slice(0, 2000)
            };
          });
          if (adjusted) changedEntries = true;
        }
        continue;
      }

      const entryCost = matchingManualSpend ? { lp: 0, shards: 0 } : info.cost;
      nextEntries = [...nextEntries, {
        id: makeOwnedUid("ent"),
        kind: info.entryKind,
        name: info.ledgerName.slice(0, 120),
        cost: entryCost,
        resultId: targetResultId,
        ref: { kind: info.refKind, uid: info.uid },
        at: logAt,
        note: matchingManualSpend
          ? "抽出リストから復元。既存の手動支出を維持するため取得行の費用は0円"
          : "抽出リストから取得明細を復元"
      }];
      changedEntries = true;
    }

    /* 対象の所持オブジェクトが今も存在する分は、すべて最新の帰属先にあるときだけ
       補正済み印を付ける。曖昧な手動移動が残る場合は次回も安全に再評価する。 */
    const allOwnedRecordsResolved = records.every((record) => {
      const info = acquisitionForRecord(record, batch);
      if (!info) return true;
      return nextEntries.some((entry) =>
        entry?.ref?.kind === info.refKind
        && String(entry.ref.uid || "") === info.uid
        && entry.kind === info.entryKind
        && String(entry.resultId || "") === String(targetResultId)
      );
    });
    const ambiguousLegacyBatchRef = nextEntries.some((entry) => {
      if (entry?.ref?.kind !== "gachaBatch" || entry.ref.commit) return false;
      const entryAt = Number(entry.at);
      if (!Number.isFinite(entryAt)) return false;
      const possibleLogs = logs.filter((candidateLog) => {
        const candidateAt = Date.parse(String(candidateLog?.at || ""));
        const candidateCommit = String(candidateLog?.commit || "");
        if (!Number.isFinite(candidateAt) || !candidateCommit
          || entryAt < candidateAt - 2000 || entryAt > candidateAt + 15000) return false;
        return draws.some((candidateBatch) =>
          String(candidateBatch?.commit || "") === candidateCommit
          || String(candidateBatch?.batchHash || "") === candidateCommit);
      });
      return possibleLogs.length > 1;
    });
    if (!allOwnedRecordsResolved || ambiguousLegacyBatchRef) return log;
    return {
      ...log,
      resultId: targetResultId,
      resultAttributionRepairVersion: 2
    };
  });

  if (!changedEntries && repairedLogs.every((log, index) => log === logs[index])) return state;
  return {
    ...state,
    entries: changedEntries ? nextEntries : originalEntries,
    gachaLog: repairedLogs
  };
}
/* 所持品の入手元シナリオ。共有データの owned にはこの列为無いので、
   シナリオ履歴との照合で求めた値をそのまま保持する。
   空なら「判別できなかった」を意味し、推測では埋めない。 */
function normalizeConsumedItems(items) {
  if (!Array.isArray(items)) return [];
  return items.filter((item) => item && typeof item === "object" && !Array.isArray(item)).map((item) => {
    const itemId = String(item.itemId || "").trim().slice(0, 120);
    const itemName = String(item.itemName || item.name || itemId).trim().slice(0, 120);
    const parsedQuantity = parsePositiveIntegerStrict(item.quantity);
    const rawAt = Number(item.consumedAt);
    return {
      id: String(item.id || makeOwnedUid("use")).slice(0, 120),
      itemId, itemName,
      quantity: parsedQuantity ?? 1,
      reason: (() => {
        const reason = String(item.reason || "").trim();
        /* 旧UIは一般的なアイテム消費を phenomenon_processing と誤記していた。
           これまでの汎用減少操作の履歴は「消費」へ補正する。 */
        return !reason || reason === "phenomenon_processing" ? "consumption" : reason.slice(0, 80);
      })(),
      consumedAt: Number.isSafeInteger(rawAt) && rawAt > 0 ? rawAt : Date.now(),
      operationId: String(item.operationId || "").trim().slice(0, 120),
      detail: String(item.detail || "").trim().slice(0, 500)
    };
  }).filter((item) => item.itemId && item.itemName);
}

function normalizeVia(via) {
  if (!Array.isArray(via)) return [];
  const seen = new Set();
  for (const name of via) {
    const s = String(name || "").trim();
    if (s) seen.add(s.slice(0, 120));
  }
  return [...seen];
}

function appendLedgerEntry(state, detail) {
  if (!detail || !detail.name) return state;
  const resultId = detail.resultId === undefined ? latestResultId(state) : detail.resultId;
  return {
    ...state,
    entries: [...(state.entries || []), {
      id: makeOwnedUid("ent"),
      kind: String(detail.kind || "other"),
      name: String(detail.name).slice(0, 120),
        cost: normalizeCurrency(detail.cost),
        /* 抽出チケットの消費。収入側（リザルト）と対で残数が求まる。 */
        tickets: normalizeTickets(detail.tickets),
      resultId: resultId || null,
      ref: detail.ref || null,
      at: Date.now(),
      note: ""
    }]
  };
}
/* 同期化・同期MAXの費用を、操作前の状態から1回だけ請求する。
   同期MAXは同期ランクとは別の操作なので、同期済みの人格をMAXにしても50欠片かかる
   （supplement P23「同期化と同じ個数」）。解除は請求せず、返金もしない。 */
function chargeSyncOperation(state, uid, options) {
  const entry = (state.roster?.personas || []).find((p) => p.uid === uid);
  if (!entry) return state;
  const before = options.before === undefined ? entry : options.before;
  const wantMax = options.syncMax === undefined ? entry.syncMax : options.syncMax;
  const wantRank = options.syncRank === undefined ? entry.syncRank : options.syncRank;
  const wasMax = before?.syncMax === true;
  const wasSynced = Boolean(before?.syncRank) || wasMax || before?.synced === true;
  const maxJustOn = wantMax === true && !wasMax;
  const syncJustOn = !wasSynced && (Boolean(wantRank) || wantMax === true || options.synced === true);
  if (!maxJustOn && !syncJustOn) return state;
  const persona = (entry.mode === "t" ? window.DB?.tokui_personas : window.DB?.normal_personas || []).find((p) => String(p.no) === String(entry.no));
  const op = maxJustOn ? "syncMax" : "sync";
  const cost = window.LBT_operationCost?.(op, { ...persona, no: entry.no }, window.DB);
  if (!cost) return state;
  return appendLedgerEntry(state, {
    kind: op === "syncMax" ? "personaSyncMax" : "personaSync",
    name: `${persona?.name || `人格 No.${entry.no}`}${op === "syncMax" ? " 同期MAX" : wantRank ? ` 同期${wantRank}` : " 同期"}`,
    cost: normalizeCurrency(cost),
    resultId: options.resultId,
    ref: { kind: "rosterPersona", uid }
  });
}
/* Entities から明細を戻す。所持を消したら支出も消す（残高を狂わせない）。 */
function dropLedgerEntriesForRef(state, ref) {
  if (!ref) return state;
  const keep = (entry) => !(entry?.ref
    && entry.ref.kind === ref.kind
    && entry.ref.uid === ref.uid);
  return { ...state, entries: (state.entries || []).filter(keep) };
}

function dropLedgerEntriesForRefs(state, kind, uids) {
  const ids = new Set(uids || []);
  if (!ids.size) return state;
  return {
    ...state,
    entries: (state.entries || []).filter((entry) => !(entry?.ref?.kind === kind && ids.has(entry.ref.uid)))
  };
}

function computeLedgerBalance(results, entries) {
  let incomeLp = 0;
  let incomeShards = 0;
  /* 交換機能の撤去後は、通常のLP支出明細と獲得欠片だけを集計する。
     exchange は安全整数を超えて移行できなかった旧保存データだけの互換用。 */
  let legacyExchangeLp = 0;
  let legacyExchangeShards = 0;
  for (const result of results || []) {
    incomeLp += normalizeCurrency(result?.income).lp;
    incomeShards += normalizeCurrency(result?.income).shards;
    const legacyExchange = normalizeCurrency(result?.exchange);
    legacyExchangeLp += legacyExchange.lp;
    legacyExchangeShards += legacyExchange.shards;
  }
  let spentLp = 0;
  let spentShards = 0;
  let unclassified = 0;
  for (const entry of entries || []) {
    const cost = normalizeCurrency(entry?.cost);
    spentLp += cost.lp;
    spentShards += cost.shards;
    if (!entry?.resultId) unclassified += 1;
  }
  return {
    lp: incomeLp - spentLp - legacyExchangeLp,
    shards: incomeShards - spentShards + legacyExchangeShards,
    incomeLp,
    incomeShards,
    spentLp,
    spentShards,
    exchangeLp: legacyExchangeLp,
    exchangeShards: legacyExchangeShards,
    /* 抽出チケットも同じ収支。卓報酬としてリザルトの収入に積まれる。 */
    tickets: computeTicketBalance(results, entries),
    unclassified
  };
}
window.LBT_computeLedgerBalance = computeLedgerBalance;
window.LBT_normalizeTickets = normalizeTickets;
window.LBT_computeTicketBalance = computeTicketBalance;
window.LBT_ticketTotal = ticketTotal;
window.LBT_latestResultId = latestResultId;
window.LBT_normalizeStateShape = normalizeStateShape;

/* 購入できるかを残高で判定する。
   商店は「所持にできてから使う」のが前提なので、残高が足りなければ
   購入そのものを止めない。残高がマイナスなのは「まだ収入を記録していない」
   状態であり、そこで全部を弾くと新規ユーザーは何も買えなくなる。
   したがって「収入記録が1件もないときだけ無制限、記録済みの後は残高で止める」。 */
function purchaseAffordability(state, cost) {
  const want = normalizeCurrency(cost);
  const balance = computeLedgerBalance(state?.results || [], state?.entries || []);
  const tracked = ((state?.results || []).length > 0);
  /* 比較するのは「必要としている通貨」だけ。必要額0の通貨と残高を比べると、
     欠片が負のとき LP だけで買える人格購入まで『欠片 -160 / 必要 0』で
     止まり、購入も記録も黙って消える。欠片は人格購入の値段に無関係。 */
  const lpOk = want.lp <= 0 || balance.lp >= want.lp;
  const shardsOk = want.shards <= 0 || balance.shards >= want.shards;
  const ok = !tracked || (lpOk && shardsOk);
  const short = [];
  if (tracked && !lpOk) short.push(`LP ${balance.lp} / 必要 ${want.lp}`);
  if (tracked && !shardsOk) short.push(`欠片 ${balance.shards} / 必要 ${want.shards}`);
  return { ok, tracked, lp: balance.lp, shards: balance.shards, need: want, reason: ok ? "" : `残高が不足しています（${short.join("・")}）` };
}
window.LBT_purchaseAffordability = purchaseAffordability;

/* 同期・解析のような操作は購入ではないので、未記録収入の例外を適用しない。
   明細を立てる前に手元の欠片で足りるかを判定する。 */
function operationAffordability(state, cost) {
  const want = normalizeCurrency(cost);
  const balance = computeLedgerBalance(state?.results || [], state?.entries || []);
  const lpOk = want.lp <= 0 || balance.lp >= want.lp;
  const shardsOk = want.shards <= 0 || balance.shards >= want.shards;
  const short = [];
  if (!lpOk) short.push(`LP ${balance.lp} / 必要 ${want.lp}`);
  if (!shardsOk) short.push(`欠片 ${balance.shards} / 必要 ${want.shards}`);
  return { ok: short.length === 0, lp: balance.lp, shards: balance.shards, need: want, reason: short.length ? `残高が不足しています（${short.join("・")}）` : "" };
}
window.LBT_operationAffordability = operationAffordability;

  /* 購入 action が計上する金額。null は「購入ではない操作」。 */
function purchaseCostOf(state, action) {
  if (action.type === "ADD_ROSTER") {
    if (!action.purchase) return null;
    /* UI購入は cost を渡す。硝子窓取込は source="buy" だけを渡すので、
       欠落額を0へ丸めず、現在の所持状態に応じたルール価格を解決する。 */
    if (action.cost !== undefined && action.cost !== null) return normalizeCurrency(action.cost);
    const ownsPersona = (state?.roster?.personas || []).length > 0;
    const rule = window.LBT_acquireCost?.("persona", "purchase", { ownsPersona });
    if (!rule || !(Number(rule.lp) > 0 || Number(rule.shards) > 0)) return null;
    return normalizeCurrency(rule);
  }
  if (action.type === "ADD_ROSTER_EGO") return action.purchase ? priceEgo(action.rank, action.no) : null;
  if (action.type === "ADD_ITEM") {
    const itemId = String(action.itemId || "");
    const special = (window.DB?.specialItems || []).find((item) => item?.id === itemId && item.specialResource);
    /* 価格付き特殊アイテムは消耗品なので、所持済みでも購入ごとに価格ゲートへ通す。 */
    if (special) {
      const cost = priceItemById(state, itemId);
      return cost && (cost.lp > 0 || cost.shards > 0) ? cost : null;
    }
    /* 通常アイテムの ADD_ITEM は既存行なら数量加算（購入ではない）という従来契約を維持する。 */
    const alreadyOwned = (state?.inventory || []).some((entry) => entry?.itemId === itemId);
    return alreadyOwned ? null : priceItemById(state, itemId);
  }
  if (action.type === "ADD_ROSTER_SUPPORT") {
    if (action.purchase === false) return null;
    const name = String(action.spp?.name || "");
    const slot = isDeathSupportPassiveRecord({ name }) ? "death" : "normal";
    return priceSupport(name, slot);
  }
  if (action.type === "ADD_ROSTER_SPIRIT") {
    if (action.purchase === false) return null;
    return priceSpirit(String(action.spirit?.name || ""));
  }
  if (action.type === "ADD_ENHANCEMENT") {
    return priceEnhancement(String(action.group || ""), String(action.name || ""));
  }
  return null;
}
window.LBT_purchaseCostOf = purchaseCostOf;
/* ---------------------------------------------------------------------------
   ローカルアカウント（= キャラクター単位の保存領域）。

   現行は lbt_v46_state 1キーに全状態を詰めている。ここを「アカウントごとに
   独立したキー」へ分割することで、キャラクター別・用途別の切替をローカルの
   まま実現する。移行は破壊的であってはならない:
     1. 旧 lbt_v46_state をタイムスタンプ付きバックアップへ複製する
     2. 旧キーは決して削除しない（ロールバック経路を残す）
     3. 新形式を書けなければ旧データを正として何も変えない
     4. 再実行しても二重移行しない（冪等）
--------------------------------------------------------------------------- */
const ACCOUNTS_INDEX_KEY = "lbt_accounts_index";
const ACCOUNT_PREFIX = "lbt_account_";
const ACCOUNT_ACTIVE_KEY = "lbt_account_active";
const ACCOUNT_ICONS_KEY = "lbt_accounts_icons";
const ACCOUNT_EPOCH_PREFIX = "lbt_epoch_account_";
const BOOT_ACCOUNT_EPOCHS = new Map();
const LEGACY_BACKUP_PREFIX = `${STORAGE_KEY}.backup.`;
const ACCOUNT_NAME_MAX = 40;
/* アイコンは索引とは別キーに置く。索引は毎回の一覧描画で読むため、
   画像を埋め込むと読む量がアカウント数倍に膨らむ。 */
const ACCOUNT_ICON_MAX_BYTES = 24 * 1024;
const ACCOUNT_ICON_MAX_URI = 40 * 1024;
/* 共有シートと同じ契約: 端末内で圧縮済みのdataURIだけを受け付ける。
   外部URLや任意MIMEは保存しない（共有HTMLと同様の安全側）。 */
function isValidAccountIcon(value) {
  if (typeof value !== "string") return false;
  if (value.length > ACCOUNT_ICON_MAX_URI) return false;
  if (!/^data:image\/(webp|jpeg);base64,[A-Za-z0-9+/]+=*$/.test(value)) return false;
  const base64 = value.slice(value.indexOf(",") + 1);
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.floor(base64.length * 3 / 4) - padding <= ACCOUNT_ICON_MAX_BYTES;
}
function lbtStorage() {
  try {
    return window.localStorage && typeof window.localStorage.getItem === "function" ? window.localStorage : null;
  } catch (_) {
    return null;
  }
}
function readStorageRaw(key) {
  const storage = lbtStorage();
  if (!storage) return null;
  try {
    return storage.getItem(key);
  } catch (_) {
    return null;
  }
}

/* reset 前から開いている別タブの遅延保存を無効化するための世代トークン。
   accountId は維持したままでも、reset 時に epoch が変われば古い画面からの
   saveActive は拒否される。 */ 
function readAccountEpoch(id) {
  return readStorageRaw(ACCOUNT_EPOCH_PREFIX + id) ?? "";
}
function captureBootAccountEpoch(id) {
  if (id && !BOOT_ACCOUNT_EPOCHS.has(id)) BOOT_ACCOUNT_EPOCHS.set(id, readAccountEpoch(id));
}
function makeAccountEpoch(previous) {
  let next = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  if (next === previous) next += "-next";
  return next;
}
/* Online account backup subscribes to local-data writes but remains a no-op unless
   the user has explicitly enabled sync. Credentials and cloud settings are excluded. */
function announceBackupSourceChanged(key, operation) {
  const name = String(key || "");
  const isBackupData = name === STORAGE_KEY
    || name.startsWith(`${STORAGE_KEY}.backup.`)
    || name.startsWith(`${STORAGE_KEY}.corrupt.`)
    || name === "lbt_accounts_index"
    || name === "lbt_account_active"
    || name === "lbt_accounts_icons"
    || name.startsWith("lbt_account_")
    || name.startsWith("lbt_epoch_account_");
  if (!isBackupData || typeof window.dispatchEvent !== "function" || typeof CustomEvent === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent("lbt:backup-source-changed", { detail: { key: name, operation } }));
  } catch (_) {}
}
function writeStorageRaw(key, value) {
  const storage = lbtStorage();
  if (!storage) return false;
  try {
    storage.setItem(key, value);
    announceBackupSourceChanged(key, "write");
    return true;
  } catch (_) {
    return false;
  }
}
function removeStorageRaw(key) {
  const storage = lbtStorage();
  if (!storage) return false;
  try {
    storage.removeItem(key);
    announceBackupSourceChanged(key, "remove");
    return true;
  } catch (_) {
    return false;
  }
}
/* 読めない保存値は上書きせず、別キーへ退避してから初めて既定で再出発できる。 */
function preserveUnreadable(key, raw) {
  if (raw == null) return true;
  const prefix = `${key}.corrupt.`;
  const storage = lbtStorage();
  /* 同じ原文を既に退避していれば再利用し、一覧表示や複数タブの再試行で
     同じ破損内容のコピーを際限なく増やさない。 */
  if (storage && typeof storage.key === "function") {
    try {
      for (let i = 0; i < storage.length; i += 1) {
        const candidate = storage.key(i);
        if (typeof candidate === "string" && candidate.startsWith(prefix)
          && readStorageRaw(candidate) === raw) return true;
      }
    } catch (_) {}
  }
  /* 同一ミリ秒に別の破損値が来ても前の退避を上書きしない。 */
  const base = `${prefix}${Date.now()}`;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}.${attempt}`;
    const existing = readStorageRaw(candidate);
    if (existing === raw) return true;
    if (existing == null) return writeStorageRaw(candidate, raw);
  }
  return false;
}
function normalizeAccountName(value, fallback) {
  const name = String(value || "").trim().slice(0, ACCOUNT_NAME_MAX);
  return name || fallback;
}
function normalizeAccountEntry(entry, index) {
  return {
    id: String(entry?.id || ""),
    name: normalizeAccountName(entry?.name, `アカウント${index + 1}`),
    purpose: String(entry?.purpose || "").trim().slice(0, ACCOUNT_NAME_MAX),
    createdAt: Number(entry?.createdAt) || Date.now(),
    updatedAt: Number(entry?.updatedAt) || Number(entry?.createdAt) || Date.now()
  };
}
/* 索引が壊れていても、アカウント本体は個別キーに残っている場合がある。
   INDEX を既定の空配列で上書きすると複数キャラクターの保存が UI から消えるため、
   本体キーを走査して索引を再構築する。内容を読めない本体も削除せず一覧に残し、
   選択後の通常の破損データ退避へ渡す。 */
function recoverAccountsFromStorage() {
  const storage = lbtStorage();
  if (!storage || typeof storage.key !== "function") return [];
  let length = 0;
  try { length = Number(storage.length) || 0; } catch (_) { return []; }
  const recovered = [];
  const seenIds = new Set();
  const now = Date.now();
  for (let i = 0; i < length; i += 1) {
    let key = null;
    try { key = storage.key(i); } catch (_) { break; }
    if (typeof key !== "string"
      || !key.startsWith(ACCOUNT_PREFIX)
      || key === ACCOUNT_ACTIVE_KEY
      || key.includes(".corrupt.")) continue;
    const id = key.slice(ACCOUNT_PREFIX.length);
    if (!id || seenIds.has(id)) continue;
    seenIds.add(id);
    const raw = readStorageRaw(key);
    if (raw == null) continue;
    let state = null;
    try { state = JSON.parse(raw); } catch (_) {}
    const name = state?.charName || state?.personaSrc?.name || "";
    recovered.push(normalizeAccountEntry({
      id,
      name,
      purpose: "",
      createdAt: now,
      updatedAt: now
    }, recovered.length));
  }
  // アクティブIDが分かれば先頭へ置き、一覧再構築後も同じキャラクターを開く。
  const activeId = readStorageRaw(ACCOUNT_ACTIVE_KEY);
  const activeIndex = recovered.findIndex((entry) => entry.id === activeId);
  if (activeIndex > 0) recovered.unshift(recovered.splice(activeIndex, 1)[0]);
  return recovered;
}
function accountsIndexRawIsUsable(raw) {
  let parsed;
  try { parsed = JSON.parse(raw); } catch (_) { return false; }
  const list = Array.isArray(parsed?.accounts) ? parsed.accounts : Array.isArray(parsed) ? parsed : null;
  if (!Array.isArray(list) || list.length === 0) return false;
  const ids = new Set();
  for (const entry of list) {
    if (!entry || typeof entry.id !== "string" || !entry.id || ids.has(entry.id)) return false;
    ids.add(entry.id);
  }
  return true;
}
function writeAccountsIndex(accounts) {
  const existing = readStorageRaw(ACCOUNTS_INDEX_KEY);
  /* 不正な索引を再構築で置き換える場合も、原文を確保できることが先。
     ここを唯一の書き込み境界にして、別の呼び出し元からの上書きも防ぐ。 */
  if (existing != null && !accountsIndexRawIsUsable(existing)
    && !preserveUnreadable(ACCOUNTS_INDEX_KEY, existing)) return false;
  return writeStorageRaw(ACCOUNTS_INDEX_KEY, JSON.stringify({ version: 1, accounts }));
}
function readAccountsIndex() {
  const raw = readStorageRaw(ACCOUNTS_INDEX_KEY);
  if (raw == null) {
    // 索引キー自体が消えても、保存本体が残っていれば復旧できるようにする。
    const recovered = recoverAccountsFromStorage();
    if (recovered.length) writeAccountsIndex(recovered);
    return { version: 1, accounts: recovered };
  }
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch (_) {
    const recovered = recoverAccountsFromStorage();
    if (recovered.length) writeAccountsIndex(recovered);
    else preserveUnreadable(ACCOUNTS_INDEX_KEY, raw);
    return { version: 1, accounts: recovered };
  }
  const list = Array.isArray(parsed?.accounts) ? parsed.accounts : Array.isArray(parsed) ? parsed : null;
  if (!list || list.length === 0) {
    // {} や accounts が文字列になったセーブ、あるいは空索引に見えるのに
    // 本体だけ残っている状態を「初回訪問」と誤認しない。
    const recovered = recoverAccountsFromStorage();
    if (recovered.length) writeAccountsIndex(recovered);
    else if (!list) preserveUnreadable(ACCOUNTS_INDEX_KEY, raw);
    return { version: 1, accounts: recovered };
  }
  /* The index is a lookup table, so one ID may refer to exactly one account blob.
     Treat a duplicate ID as a duplicate pointer, not as a second account: showing
     both entries makes delete/switch ambiguous because they share one storage key. */
  const seenIds = new Set();
  const accounts = [];
  for (const entry of list) {
    if (!entry || typeof entry.id !== "string" || !entry.id || seenIds.has(entry.id)) continue;
    seenIds.add(entry.id);
    accounts.push(normalizeAccountEntry(entry, accounts.length));
  }
  /* 無効な行が混じった場合だけ保存本体を走査する。重複IDは別保存領域ではない
     ため、従来どおり最初の索引エントリ（名前・用途）を優先する。復旧結果にも
     現在の索引にあった有効エントリを残し、索引から欠落していた本体だけを足す。 */
  const hasInvalidEntries = list.some((entry) =>
    !entry || typeof entry.id !== "string" || !entry.id);
  if (hasInvalidEntries) {
    const recovered = recoverAccountsFromStorage();
    if (recovered.length) {
      const knownIds = new Set(accounts.map((entry) => entry.id));
      const merged = [
        ...accounts,
        ...recovered.filter((entry) => !knownIds.has(entry.id))
      ];
      writeAccountsIndex(merged);
      return { version: 1, accounts: merged };
    }
    preserveUnreadable(ACCOUNTS_INDEX_KEY, raw);
  }
  return { version: 1, accounts };
}
/* IDs are opaque storage keys. Check both the index and the backing store before
   returning one: a collision must never overwrite an existing character save.
   Prefer browser crypto for a wider random suffix; the bounded retry also makes
   deterministic/failed RNG degrade safely instead of clobbering data. */
function newAccountId(existingAccounts = []) {
  const usedIds = new Set((Array.isArray(existingAccounts) ? existingAccounts : [])
    .map((entry) => String(entry?.id || "")).filter(Boolean));
  const storage = lbtStorage();
  const cryptoApi = window.crypto || window.msCrypto;
  for (let attempt = 0; attempt < 32; attempt += 1) {
    let suffix = "";
    try {
      if (cryptoApi && typeof cryptoApi.getRandomValues === "function") {
        const bytes = new Uint8Array(16);
        cryptoApi.getRandomValues(bytes);
        suffix = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
      }
    } catch (_) {
      suffix = "";
    }
    if (!suffix) {
      suffix = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
    }
    /* Including the retry number makes retries distinct even if a test/browser
       RNG repeats the same value. Existing IDs and orphaned blobs are still checked. */
    const id = `acc-${Date.now().toString(36)}-${suffix}-${attempt.toString(36)}`;
    if (usedIds.has(id)) continue;
    if (storage && readStorageRaw(ACCOUNT_PREFIX + id) != null) continue;
    /* 削除・リセット前に開いていたタブの保存世代を誤って再利用しない。 */
    if (readStorageRaw(ACCOUNT_EPOCH_PREFIX + id) != null) continue;
    return id;
  }
  return null;
}
/* 初回のみ旧キーからアカウントを作る。既に索引があれば何もしない（冪等）。 */
function migrateLegacyAccounts() {
  const storage = lbtStorage();
  if (!storage) return { accounts: [], activeId: null };
  const index = readAccountsIndex();
  if (index.accounts.length) {
    let activeId = readStorageRaw(ACCOUNT_ACTIVE_KEY);
    if (!activeId || !index.accounts.some((entry) => entry.id === activeId)) {
      activeId = index.accounts[0].id;
      writeStorageRaw(ACCOUNT_ACTIVE_KEY, activeId);
    }
    return { accounts: index.accounts, activeId };
  }
  const legacyRaw = readStorageRaw(STORAGE_KEY);
  /* 旧データがまったく無い = 初回訪問。ここで空アカウントを自動採番すると
     利用者は名前を付けられず「アカウント1」で作業することになる。
     0件のままにして、アクセス時のアカウント選択ゲートで
     名前・用途・アイコンを決めてもらう。 */
  if (legacyRaw == null) return { accounts: [], activeId: null };
  let legacyState = null;
  try {
    legacyState = legacyRaw == null ? null : JSON.parse(legacyRaw);
  } catch (_) {
    legacyState = null;
  }
  const now = Date.now();
  const id = newAccountId(index.accounts);
  if (!id) return { accounts: [], activeId: null };
  const account = normalizeAccountEntry({
    id,
    name: legacyState?.charName || legacyState?.personaSrc?.name || "アカウント1",
    purpose: "",
    createdAt: now,
    updatedAt: now
  }, 0);
  // 1. まずバックアップ。失敗したら新形式を一切書かない（旧データを正とする）。
  if (legacyRaw != null && !writeStorageRaw(`${LEGACY_BACKUP_PREFIX}${id}`, legacyRaw)) {
    return { accounts: [], activeId: null };
  }
  // 2. アカウント本体。壊れた旧JSONでも退避済みなので既定から始める。
  const stateToStore = legacyState != null ? JSON.stringify(legacyState) : JSON.stringify({ schemaVersion: SAVE_SCHEMA_VERSION });
  if (!writeStorageRaw(ACCOUNT_PREFIX + id, stateToStore)) {
    return { accounts: [], activeId: null };
  }
  /* 3. 索引。別タブが同時に旧セーブを移行している可能性があるため、
     関数冒頭で読んだ空索引をそのまま書かず、保存本体作成後の最新索引へ追加する。
     最新索引が空でも readAccountsIndex() が自分や他タブの本体を復旧する場合があるので、
     自分のIDだけ差し替え、他の有効なアカウントを維持する。 */
  const latestIndex = readAccountsIndex();
  const latestOthers = latestIndex.accounts.filter((entry) => entry.id !== id);
  const mergedAccounts = [...latestOthers, account];
  if (!writeAccountsIndex(mergedAccounts)) {
    removeStorageRaw(ACCOUNT_PREFIX + id);
    return { accounts: latestIndex.accounts, activeId: readStorageRaw(ACCOUNT_ACTIVE_KEY) };
  }
  writeStorageRaw(ACCOUNT_ACTIVE_KEY, id);
  return { accounts: mergedAccounts, activeId: id };
}
function listAccounts() {
  const { accounts, activeId } = migrateLegacyAccounts();
  return { accounts: accounts.map((entry) => ({ ...entry })), activeId };
}
function getActiveAccountId() {
  const id = migrateLegacyAccounts().activeId;
  captureBootAccountEpoch(id);
  return id;
}
function loadActiveAccountState() {
  const { activeId } = migrateLegacyAccounts();
  if (!activeId) return null;
  const key = ACCOUNT_PREFIX + activeId;
  const raw = readStorageRaw(key);
  if (raw == null) return null;
  try {
    return JSON.parse(raw);
  } catch (_) {
    preserveUnreadable(key, raw);
    return null;
  }
}
/* accountId を明示すると、そのアカウントへ束縛して書き込む。
   切替（activeの書換+再読込）直後に旧画面のデバウンス保存が発火しても、
   「起動時に読んだアカウント」= 正しい宛先へ書くため、切替先の新規
   アカウントへ旧キャラの状態が混入する競合が構造的に起きない。
   また索引に存在しないIDへは書きません（削除済みアカウントの蘇生防止）。 */
function saveActiveAccountState(state, accountId) {
  let targetId = accountId || null;
  const index = readAccountsIndex();
  if (targetId) {
    if (!index.accounts.some((entry) => entry.id === targetId)) return false;
  } else {
    targetId = migrateLegacyAccounts().activeId;
    if (!targetId) return false;
  }
  /* 起動後に同じアカウントが完全リセットされた場合、旧画面が残した state を
     保存すると削除済みデータが復活する。世代が変わった save は拒否する。 */
  if (BOOT_ACCOUNT_EPOCHS.has(targetId)
    && readAccountEpoch(targetId) !== BOOT_ACCOUNT_EPOCHS.get(targetId)) return false;
  let serialized = "";
  try {
    serialized = JSON.stringify(state);
  } catch (_) {
    return false;
  }
  const key = ACCOUNT_PREFIX + targetId;
  const existing = readStorageRaw(key);
  if (existing != null) {
    try {
      JSON.parse(existing);
    } catch (_) {
      /* バックアップを確保できないなら、唯一の壊れた原本を上書きしない。 */
      if (!preserveUnreadable(key, existing)) return false;
    }
  }
  if (!writeStorageRaw(key, serialized)) return false;
  /* 別タブが保存中にアカウントを作成すると、開始時の index は古くなる。
     保存本体を書いた後に索引を読み直し、後から追加された保存領域を落とさない。 */
  const latestIndex = readAccountsIndex();
  if (!latestIndex.accounts.some((entry) => entry.id === targetId)) {
    /* 他タブの削除が先に完了していた場合、孤立本体を残して復旧時に蘇生させない。 */
    removeStorageRaw(key);
    return false;
  }
  const accounts = latestIndex.accounts.map((entry) => entry.id === targetId ? { ...entry, updatedAt: Date.now() } : entry);
  if (accounts.some((entry) => entry.id === targetId)) writeAccountsIndex(accounts);
  return true;
}
/* 無料（price 0）の精神は最初から持っているものとして数える。
   「初期選択可」は選ぶかどうかの表示ではなく、初めからあるもの。
   有料のものだけ roster に入る。明細は立てない（購入ではない）。 */
/* 価格の欠落・null・空欄・不正値を0と混同しない。
   初期所持、初期枠の表示、適用アクションで同じ価格判定を共有する。 */
function hasExplicitSpiritPrice(definition) {
  if (!definition || !definition.name) return false;
  const price = definition.price;
  const hasNumericValue =
    (typeof price === "number" && Number.isFinite(price)) ||
    (typeof price === "string" && price.trim() !== "" && Number.isFinite(Number(price)));
  return hasNumericValue && Number(price) >= 0;
}
function isExplicitlyFreeSpirit(definition) {
  return hasExplicitSpiritPrice(definition) && Number(definition.price) === 0;
}
window.LBT_hasExplicitSpiritPrice = hasExplicitSpiritPrice;
window.LBT_isExplicitlyFreeSpirit = isExplicitlyFreeSpirit;

function initialFreeSpirits() {
  const list = (window.DB && window.DB.spirits) || [];
  const free = list.filter(isExplicitlyFreeSpirit);
  if (!free.length) return [];
  return free.map((s, i) => ({
    uid: `spr-init-${i}-${String(s.name).replace(/[^\w-]+/g, "")}`,
    name: s.name,
    equipped: false,
    resultId: null,
    addedAt: 0,
    origin: "initial",
    notes: ""
  }));
}

function createAccount(name, purpose) {
  const index = readAccountsIndex();
  const now = Date.now();
  const id = newAccountId(index.accounts);
  if (!id) return null;
  const account = normalizeAccountEntry({
    id,
    name,
    purpose,
    createdAt: now,
    updatedAt: now
  }, index.accounts.length);
  /* 新規アカウントは高級な精神が既に。そこに明细は立てない。 */
  const seed = { schemaVersion: SAVE_SCHEMA_VERSION, roster: { spirits: initialFreeSpirits() } };
  if (!writeStorageRaw(ACCOUNT_PREFIX + account.id, JSON.stringify(seed))) return null;
  /* アカウント本体を書いている間に別タブが作成を完了している可能性がある。
     作成開始時に読んだ index をそのまま書くと、後から完了したタブが先に作られた
     別アカウントの索引エントリを消してしまう。索引書き込み直前の最新版へ追加する。 */
  const latestIndex = readAccountsIndex();
  /* 索引自体がまだ無い初回環境では、上で書いた自分の本体を readAccountsIndex()
     が孤立本体として復旧し、同じIDを返すことがある。その行だけは作成競合では
     ないので除いて、フォームから入力された正式な名前・用途を持つ account を足す。 */
  const latestOthers = latestIndex.accounts.filter((entry) => entry.id !== account.id);
  if (!writeAccountsIndex([...latestOthers, account])) {
    removeStorageRaw(ACCOUNT_PREFIX + account.id);
    return null;
  }
  return account;
}
function updateAccount(id, patch) {
  const index = readAccountsIndex();
  if (!index.accounts.some((entry) => entry.id === id)) return false;
  /* フォーム値を先に確定し、その間に別タブが作成したアカウントを
     書き戻し前の索引再読込で取り込む。開始時の一覧で全索引を上書きしない。 */
  const requestedName = patch?.name;
  const hasName = requestedName !== void 0;
  const requestedPurpose = patch?.purpose;
  const hasPurpose = requestedPurpose !== void 0;
  const latestIndex = readAccountsIndex();
  if (!latestIndex.accounts.some((entry) => entry.id === id)) return false;
  const accounts = latestIndex.accounts.map((entry) => entry.id === id ? {
    ...entry,
    name: hasName ? normalizeAccountName(requestedName, entry.name) : entry.name,
    purpose: hasPurpose ? String(requestedPurpose || "").trim().slice(0, ACCOUNT_NAME_MAX) : entry.purpose,
    updatedAt: Date.now()
  } : entry);
  return writeAccountsIndex(accounts);
}
function switchAccount(id) {
  const index = readAccountsIndex();
  if (!index.accounts.some((entry) => entry.id === id)) return false;
  return writeStorageRaw(ACCOUNT_ACTIVE_KEY, id);
}
function restoreAccountIndexAfterFailedDelete(entry, originalPosition) {
  /* 失敗後のロールバックも元の索引スナップショットで上書きしない。
     削除処理中に別タブが作成したアカウントを取り込み、対象だけ復元する。 */
  const latest = readAccountsIndex().accounts;
  if (latest.some((candidate) => candidate.id === entry.id)) return writeAccountsIndex(latest);
  const restored = [...latest];
  restored.splice(Math.max(0, Math.min(originalPosition, restored.length)), 0, entry);
  return writeAccountsIndex(restored);
}
function deleteAccount(id) {
  const index = readAccountsIndex();
  if (index.accounts.length <= 1) return false;
  const originalPosition = index.accounts.findIndex((entry) => entry.id === id);
  if (originalPosition < 0) return false;
  const originalEntry = index.accounts[originalPosition];
  const initialNext = index.accounts.filter((entry) => entry.id !== id);
  if (!initialNext.length) return false;

  const storageKey = ACCOUNT_PREFIX + id;
  const previousState = readStorageRaw(storageKey);
  const previousActiveId = readStorageRaw(ACCOUNT_ACTIVE_KEY);
  const wasActive = previousActiveId === id;
  /* 削除が失敗したときに active ID を戻せるよう、先に選択先を切り替える。 */
  if (wasActive && !writeStorageRaw(ACCOUNT_ACTIVE_KEY, initialNext[0].id)) return false;

  /* 切替の間に別タブで作成・削除が終わり得る。削除前に必ず最新索引を読み直し、
     その時点で存在する他のアカウントを維持したまま対象だけを外す。 */
  const latestIndex = readAccountsIndex();
  if (!latestIndex.accounts.some((entry) => entry.id === id)) {
    if (wasActive) {
      const active = latestIndex.accounts.find((entry) => entry.id === readStorageRaw(ACCOUNT_ACTIVE_KEY));
      const fallbackId = active?.id || latestIndex.accounts[0]?.id;
      if (fallbackId) writeStorageRaw(ACCOUNT_ACTIVE_KEY, fallbackId);
      else removeStorageRaw(ACCOUNT_ACTIVE_KEY);
    }
    return false;
  }
  if (latestIndex.accounts.length <= 1) {
    if (wasActive) writeStorageRaw(ACCOUNT_ACTIVE_KEY, id);
    return false;
  }
  const next = latestIndex.accounts.filter((entry) => entry.id !== id);
  if (wasActive && !next.some((entry) => entry.id === readStorageRaw(ACCOUNT_ACTIVE_KEY))
    && !writeStorageRaw(ACCOUNT_ACTIVE_KEY, next[0].id)) {
    writeStorageRaw(ACCOUNT_ACTIVE_KEY, id);
    return false;
  }
  if (!writeAccountsIndex(next)) {
    if (wasActive) writeStorageRaw(ACCOUNT_ACTIVE_KEY, previousActiveId);
    return false;
  }
  if (!removeStorageRaw(storageKey)) {
    /* 本体削除失敗時、最新索引に対象だけを戻し、途中で増えた別アカウントは保持する。 */
    restoreAccountIndexAfterFailedDelete(originalEntry, originalPosition);
    if (wasActive) writeStorageRaw(ACCOUNT_ACTIVE_KEY, previousActiveId);
    return false;
  }
  if (!removeAccountIcon(id)) {
    /* アイコン除去に失敗したら本体と対象行を復旧。索引の最新項目も維持する。 */
    if (previousState != null) writeStorageRaw(storageKey, previousState);
    restoreAccountIndexAfterFailedDelete(originalEntry, originalPosition);
    if (wasActive) writeStorageRaw(ACCOUNT_ACTIVE_KEY, previousActiveId);
    return false;
  }
  return true;
}
/* ---- アカウントアイコン（ユーザーアップロード画像） ---- */
function readAccountIcons() {
  const raw = readStorageRaw(ACCOUNT_ICONS_KEY);
  if (raw == null) return {};
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch (_) {
    preserveUnreadable(ACCOUNT_ICONS_KEY, raw);
    return {};
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const icons = {};
  for (const [id, value] of Object.entries(parsed)) {
    if (isValidAccountIcon(value)) icons[id] = value;
  }
  return icons;
}
function writeAccountIcons(icons) {
  return writeStorageRaw(ACCOUNT_ICONS_KEY, JSON.stringify(icons));
}
function setAccountIcon(id, value) {
  if (!id || !isValidAccountIcon(value)) return false;
  const index = readAccountsIndex();
  if (!index.accounts.some((entry) => entry.id === id)) return false;
  const icons = readAccountIcons();
  icons[id] = value;
  return writeAccountIcons(icons);
}
function removeAccountIcon(id) {
  if (!id) return false;
  const icons = readAccountIcons();
  if (!(id in icons)) return true;
  delete icons[id];
  return writeAccountIcons(icons);
}
/* 「保存データを完全削除」用。旧キーには触れず、現アカウントだけ空へ戻す。 */
function resetActiveAccount() {
  const { activeId } = migrateLegacyAccounts();
  if (!activeId) return false;
  if (BOOT_ACCOUNT_EPOCHS.has(activeId)
    && readAccountEpoch(activeId) !== BOOT_ACCOUNT_EPOCHS.get(activeId)) return false;
  captureBootAccountEpoch(activeId);
  const key = ACCOUNT_PREFIX + activeId;
  const epochKey = ACCOUNT_EPOCH_PREFIX + activeId;
  const previousEpoch = readStorageRaw(epochKey);
  const storage = lbtStorage();
  if (!storage || typeof storage.key !== "function") return false;
  /* リセット対象の本体を書き換える前に、現アカウントの破損退避を削除する。
     どれか1つでも削除できない場合は本体を残し、既に消した退避は可能な限り戻す。
     これにより false を返したのに保存本体だけ空になる部分更新を防ぐ。 */
  const prefix = `${key}.corrupt.`;
  const snapshots = [];
  try {
    for (let i = 0; i < storage.length; i += 1) {
      const candidate = storage.key(i);
      if (typeof candidate !== "string" || !candidate.startsWith(prefix)) continue;
      const raw = readStorageRaw(candidate);
      if (raw != null) snapshots.push({ key: candidate, raw });
    }
  } catch (_) {
    return false;
  }
  const removed = [];
  const restoreSnapshots = () => {
    for (const previous of removed) {
      if (readStorageRaw(previous.key) == null) writeStorageRaw(previous.key, previous.raw);
    }
  };
  for (const snapshot of snapshots) {
    if (!removeStorageRaw(snapshot.key)) {
      restoreSnapshots();
      return false;
    }
    removed.push(snapshot);
  }
  /* 世代トークンを更新してから空状態を保存する。既存タブの保存は世代不一致で
     拒否される。世代の書き込みに失敗した場合は本体へ触れずに戻す。 */
  if (!writeStorageRaw(epochKey, makeAccountEpoch(previousEpoch ?? ""))) {
    restoreSnapshots();
    return false;
  }
  if (!writeStorageRaw(key, JSON.stringify({ schemaVersion: SAVE_SCHEMA_VERSION }))) {
    if (previousEpoch == null) removeStorageRaw(epochKey);
    else writeStorageRaw(epochKey, previousEpoch);
    restoreSnapshots();
    return false;
  }
  return true;
}
window.LBT_accounts = {
  list: listAccounts,
  storageAvailable: () => lbtStorage() !== null,
  getActiveId: getActiveAccountId,
  loadActive: loadActiveAccountState,
  saveActive: saveActiveAccountState,
  icons: readAccountIcons,
  setIcon: setAccountIcon,
  removeIcon: removeAccountIcon,
  create: createAccount,
  update: updateAccount,
  switch: switchAccount,
  delete: deleteAccount,
  resetActive: resetActiveAccount
};
const INIT_STATE = {
  schemaVersion: SAVE_SCHEMA_VERSION,
  // Base identity
  charName: "",
  plName: "",
  imgUrls: "",
  // Base infoで選択した共有用OGP画像。縮小済みdata URIのみ保存する。
  shareImageData: "",
  // 圧縮後に上限へ収まらなかった直近の画像は、再アップロード成功まで共有発行を停止する。
  shareImageBlockedReason: "",
  color: "#c8a84b",
  initiative: 0,
  // Equipped persona reference
  personaMode: null,
  // 'n' | 't' | null
  personaNo: null,
  // number
  personaSrc: null,
  // snapshot of imported persona (immutable ref)
  // v48: 同期化(=手動編集)モード。true にすると装備人格を保ったまま
  // ステータス/パッシブ/スキル/固有バフをすべて自由編集可能扱いにする。
  syncedManual: false,
  // Stats (may diverge from persona template if edited)
  hp: "",
  san: "",
  speed: "",
  bullets: "",
  resS: "\u666E\u901A",
  resP: "\u666E\u901A",
  resB: "\u666E\u901A",
  // Spirit
  spirit: "",
  spiritMorale: "",
  spiritConfuse: "",
  spiritAlways: "",
  // Passives
  pas: { name: "", cond: "", always: "", effect: "", quick: "" },
  pas2Enabled: false,
  pas2: { name: "", cond: "", always: "", effect: "" },
  // 2件目以降の人格パッシブ。上限なし。{id,name,cond,always,effect,quick}
  extraPassives: [],
  // Unique buffs (custom keyword-like statuses on this persona)
  uniqueBuffs: [],
  // {id, name, type, initial, max, desc, place:'status'|'params'|'none'}
  // Skills 0..4 (or more)
  skills: [],
  // {id, rank, type, sin, aoe('広域'|'広域乱射'|''), aoeCount, name, effect, dice:[{roll,effect,dPlus,dCnt}], quick}
  // V01/V25: EGO解析モード（人格の syncedManual に相当する編集フラグ）
  egoManual: false,
  // Equipped EGO slots
  egoSlots: {
    ZAYIN: null,
    TETH: null,
    HE: null,
    WAW: null,
    ALEPH: null
    // each null | {no, name, kakusei|shinshoku, ...}
  },
  // Support passives (max 3 with special enh)
  supports: [],
  // {id, name, cond, effect, lp}
  deathSupport: null,
  // dedicated death-passive slot
  // {id, name, cond, effect, lp}
  // Roster: owned personas & egos with supplement flags
  // 抽選の決定記録。支払いと取得物はUndoで巻き戻るが、この記録は残る。
  // { id, at, route, times, pay, cost, hits, commit }
  gachaLog: [],
  roster: {
    personas: [],
    // {uid, no, mode, syncRank:'0'|'00'|'000'|null, syncMax:bool, lcb:bool, equipped:bool, notes}
    egos: [],
    // {uid, no, rank, analyzed:bool, analyzeMax:bool, notes}
    /* サポートパッシブと精神も所持モデルへ統合する。人格・E.G.O は所持一覧が
       あるが、この2つは装備スロットしか無く、所持と帰属（リザルト）を持てなかった。
       equipped は装備中、resultId は帰属先のリザルト（null=未分類）。 */
    supports: [],
    // {uid, name, cond, effect, lp, slot:'normal'|'death', equipped:bool, resultId:string|null, addedAt:number, notes}
    spirits: []
    // {uid, name, equipped:bool, resultId:string|null, addedAt:number, notes}
  },
    /* 卓で配られる抽出チケット。ルールブックには無いローカルルール（core 3章 P19-20 の
     有料抽出とは別経路）。分類ごとに在庫を持つ：
       kind=persona  人格抽出チケット … 人格からランダム1つ
       kind=ego      E.G.O抽出チケット … E.G.Oからランダム1つ
       kind=choice   選択抽出チケット … 人格かE.G.Oのどちらか（利用者が選ぶ）から1つ
       kind=pack     特定抽出パック（P.7-18）… そのパックの中からランダム1つ
     pack には data/gacha-theme-packs.json のパック名が入る。kind=pack のときだけ必須。
     取得はリザルトへの帰属を持つ（acquiredAt / resultId）。 */
  tickets: [],
  /* 通帳。リザルト（1回の周回）と、その収支明細。
     所持・強化・アイテムはすべて entries（明細）として書き出し、
     どのリザルトで入手したかは resultId が持つ。resultId が null の明細は
     「未分類」。income は利用者が獲得額だけ入力する（自動取得はしない）。
     exchange は LP を欠片に換えた取引。core:317「2LP → 自我の欠片1」なので
     額は対になり、使う LP も得る欠片も導出できる。明細にしないのは、換算額を
     帰属済みの明細として残すと、リザルトを編集した瞬間に明細だけ古くなるから。
     残高は保存せず全リザルトの収入から全明細の支出を引いて導出する。 */
  results: [],
  // [{id, name, date, income:{lp,shards}, exchange:{lp,shards}, note, createdAt, updatedAt}]
  entries: [],
  // [{id, kind, name, cost:{lp,shards}, resultId, at, note}]
  /* 抽出リスト。ガチャ結果をバッチ単位で保存する（結果と錨を紐付ける）。
     改ざん検出の鎖はバッチ側（gacha.js）が持ち、ここは追記のみ行う。
     旧保存データには無いので hydrate で空配列を補完する。 */
  draws: [],
  // [{batchId, kind, count, commit, serverSeed, clientSeed, rolls, records, batchHash, beacon, rulesetHash, signature?}]
  // DB由来のアイテムをビルドへ導入した一覧。{uid,itemId,quantity,memo,palette,origin}
  inventory: [],
  /* 初期枠として定義したアイテムID。ここに載ったものは購入ではなく
     「最初から所持している」ものとして取り込み、明細を起こさない。 */
  initialItems: [],
  // ユーザー作成アイテム。公式data/items.jsonとは別に保存し、公式DBは変更しない。
  customItems: [],
  // Enhancements
  enhancements: [],
  // {id, group, name, effect, shards, category}
  // Custom statuses & default statuses
  customStatuses: [],
  // {id, label, initial, max, place:'status'|'params'}
  defaultStatuses: null,
  // if null, use factory defaults
  // 未宣言の自己管理ステータスは、根拠文を付けて確認候補としてだけ保持する。
  selfStatusCandidates: [],
  // Formulas
  formulas: [],
  // {id, name, expr}
  builtinFormulasOverride: {},
  // v50: 組込式の上書き。{ MT: 'expr', DM: 'expr' } または {MT: null} = 非表示
  autoFml: true,
  /* 士気低下ラインは「SANが最大値の25%以下」（基本ルールPDF 39頁）という定義上の派生値であり、
     人格ごとのSANから決まる。既定値を固定数値で持つと、SANが異なる人格でも常に同じ値が
     入力済みとして扱われ、自動計算が働かなくなる。空文字＝自動計算（SAN最大値の25%）とし、
     利用者が明示的に数値を入れた場合だけその値を使う。 */
  moraleLine: "",
  // Extra commands (memo)
  extraCmd: "",
  // T18/T19: メモ/パレットの項目別出力除外（セクションタイトル→true で除外）
  outputExclude: { memo: {}, palette: {} },
  // 同期情報の表示設定。同期MAXは名称の[MAX]表記として常に反映する。
  shareOptions: { showSyncRank: true, showSyncRankInOutput: false },
  // パレットの出力書式。共有リンクへは持ち込まない端末設定。
  paletteOptions: { effectBullet: true },
  // Favorites & history (persistent across sessions)
  favorites: [],
  // ['n:1', 't:5'] etc
  historyRecent: [],
  // same format, LRU 20
  // UI state (not part of undo)
  ui: {
    currentSection: "persona",
    previewTab: "memo",
    previewOpen: void 0,
    // v54: undefined=画面幅で自動決定（狭い画面では初期OFF）
    codexMode: "n",
    // 'n'|'t'|'roster'|'fav'|'history'
    filterSins: [],
    filterKws: [],
    filterAffs: [],
    // affiliations
    filterResS: "",
    filterResP: "",
    filterResB: "",
    // N19: 「所持しているもののみ」フィルタ
    filterOwnedOnly: false,
    searchQuery: "",
    sortBy: "no",
    // 'no' | 'hp' | 'san' | 'speed'
    hoveredPersona: null,
    // v48: PERSONA CODEX グリッドの展開状態。装備済み時のデフォルトは false（=畳む）
    codexExpanded: false,
    // v48: EGO 詳細を上部に引き上げる際の対象スロット
    egoDetailSlot: null,
    // 'ZAYIN'|'TETH'|'HE'|'WAW'|'ALEPH'|null
    egoRankFilter: "",
    // クリックで自動セットされるランクフィルタ
    // v52 (G): EGO カードリストの展開状態。undefined=装備有無で自動判定 / true/false=固定
    egoListExpanded: void 0,
    // v48: LivePreview 折り畳みセクション state
    previewCollapsed: {}
    // {sectionKey: true/false}
  }
};
/* 所持へまとめて足し、その支出を通帳に積む。
   購入（一括）と抽出（封緘済みの記録）は別の入口だが、所持の写法は
   1つにまとめたい。2つにすると、抽出だけ明細の付き方が変わる。 */
function applyRosterAdds(state, adds, options) {
  const list = Array.isArray(adds) ? adds : [];
  if (!list.length) return state;
  const opts = options || {};
  /* 移行途中の保存データでは roster が無いことがある。落ちると
     抽出した gente が丸ごと消えるので、必ず書き込みできる形にしてから出す。 */
  const roster = state.roster || {};
  const personas = [...(roster.personas || [])];
  const egos = [...(roster.egos || [])];
  const known = new Set(personas.map((p) => `${p.mode}:${p.no}`));
  const knownEgo = new Set(egos.map((e) => `${e.rank}:${e.no}`));
  const startedAt = Date.now();
  let next = state;
  let n = 0;
  let gainedPersona = false;
  for (const add of list) {
    /* 1件ごとに価格が違う抽出では、その件の record.cost を優先する。
       零售商は「全部同じ額」なので既定の cost へ落とす。 */
    const own = add?.cost || opts.cost || null;
    if (add?.type === "ego") {
      if (knownEgo.has(`${add.rank}:${add.no}`)) continue;
      knownEgo.add(`${add.rank}:${add.no}`);
      egos.push({ uid: `er-${startedAt}-${n}`, no: add.no, rank: add.rank, analyzed: false, analyzeMax: false, notes: "", build: null });
      next = appendLedgerEntry(next, {
        kind: "ego",
        name: `${add.rank} No.${add.no}`,
        cost: own || priceEgo(add.rank, add.no),
        resultId: opts.resultId,
        ref: { kind: "rosterEgo", uid: `er-${startedAt}-${n}` }
      });
    } else if (add?.type === "persona") {
      if (known.has(`${add.mode}:${add.no}`)) continue;
      known.add(`${add.mode}:${add.no}`);
      const uid = `pr-${startedAt}-${n}`;
      personas.push({ uid, no: add.no, mode: add.mode, equipped: false, syncRank: null, syncMax: false, notes: "" });
      const persona = (add.mode === "t" ? window.DB?.tokui_personas : window.DB?.normal_personas || []).find((p) => String(p.no) === String(add.no));
      next = appendLedgerEntry(next, {
        kind: "persona",
        name: persona?.name || `人格 ${String(add.mode).toUpperCase()} No.${add.no}`,
        cost: normalizeCurrency(own),
        resultId: opts.resultId,
        ref: { kind: "rosterPersona", uid }
      });
      gainedPersona = true;
    }
    n += 1;
  }
  /* 最初の人格が所持になったら初期作成用チケットを1枚消す。
     抽出した場合は既に消費済み（残高0）で素通りする。 */
  if (gainedPersona) next = consumeInitialPersonaTicket(next, opts.resultId);
  return { ...next, roster: { ...next.roster, personas, egos } };
}

/* パックの項目は pack 内の通し番号しか持ってない。所持へ写すには
   DB の人格へ名前に引き直す。特定抽出パックには DB に無い専用人格が
   混ざっているので、引けないものは所持にも通帳の明細にもしない。 */
function personaNoByName(name) {
  const hit = String(name || "").trim();
  if (!hit) return null;
  const normal = (window.DB?.normal_personas || []).find((p) => p.name === hit);
  if (normal) return { no: Number(normal.no), mode: "n" };
  const special = (window.DB?.tokui_personas || []).find((p) => p.name === hit);
  if (special) return { no: Number(special.no), mode: "t" };
  return null;
}

/* 封緘済みバッチの records から、所持へ足す形へ落とす。
   記録が正である限りここから復元できる（画面側の state を
   信用しない。「引いたか」を記録側に持たせる必要もない）。 */
function rosterAddsFromDrawBatch(batch) {
  const records = Array.isArray(batch?.records) ? batch.records : [];
  const adds = [];
  for (const record of records) {
    const item = record && record.item;
    if (!item) continue;
    /* テーマパックの重複は欠片50への変換で、所持には入らない。 */
    if (record.duplicate) continue;
    const cost = { lp: Number(record.cost?.lp) || 0, shards: Number(record.cost?.shards) || 0 };
    // record.kind is canonical. Older records may legitimately omit item.kind;
    // relying only on item.kind would validate/pay those draws but drop ownership.
    const kind = String(record.kind || item.kind || "");
    if (kind === "specialPersona") {
      adds.push({ type: "persona", no: item.no, mode: "t", cost });
      continue;
    }
    if (kind === "ego") { adds.push({ type: "ego", no: item.no, rank: item.rank, cost }); continue; }
    if (kind === "persona") { adds.push({ type: "persona", no: item.no, mode: "n", cost }); continue; }
    if (kind === "themePack") {
      /* パック内の通し番号ではなく、DB の人格番号で所持へ入れる。
         金額は記録のものをそのまま渡す：通帳の1行を、この1件で作る。 */
      const found = personaNoByName(item.name);
      if (found) adds.push({ type: "persona", no: found.no, mode: found.mode, cost });
    }
  }
  return adds;
}

/* 抽選バッチの経済的な副作用。証明の保存は ADD_DRAW_RECORD と分ける。
   通常履歴にこの副作用だけを1回積み、Undo後には証明だけを再生できるようにする。 */
function applyDrawBatchEffects(state, batch, resultId) {
  let next = applyRosterAdds(state, rosterAddsFromDrawBatch(batch), { resultId });
  for (const record of batch.records) {
    if (record?.kind !== "themePack") continue;
    if (record.duplicate) {
      /* 重複でも1回ぶんは払う。支出は通帳へ、欠片はリザルトの収入へ分けて積む。 */
      const lp = Number(record.cost?.lp) || 0;
      if (lp) {
        next = appendLedgerEntry(next, {
          kind: "expense",
          name: `特定抽出パック ${record.pack || ""}${record.item?.name ? `：${record.item.name}` : ""}（重複）`.trim(),
          cost: { lp, shards: 0 },
          resultId,
          ref: { kind: "gachaBatch", commit: String(batch.commit || batch.batchHash || "") }
        });
      }
      next = addShardIncome(next, Number(record.grantedShards) || 0, resultId);
      continue;
    }
    if (personaNoByName(record.item?.name)) continue;
    const lp = Number(record.cost?.lp) || 0;
    if (!lp) continue;
    next = appendLedgerEntry(next, {
      kind: "expense",
      name: `特定抽出パック ${record.pack || ""}${record.item?.name ? `：${record.item.name}` : ""}`.trim(),
      cost: { lp, shards: 0 },
      resultId,
      ref: { kind: "gachaBatch", commit: String(batch.commit || batch.batchHash || "") }
    });
  }
  return next;
}

/* 抽選結果を計算した後、ビーコン／署名待ちの間に所持状態が変わっていないか確認する。
   roster はDB参照型（人格は mode/no、E.G.Oは rank/no）なので、名前だけで重複を判定しない。
   テーマパックの duplicate フラグは所持名から引き直し、バッチ内の先行抽選も順に反映する。 */
function drawOwnershipSnapshot(state) {
  const roster = state?.roster || {};
  const personas = Array.isArray(roster.personas) ? roster.personas : [];
  const egos = Array.isArray(roster.egos) ? roster.egos : [];
  const personaKeys = new Set();
  const egoKeys = new Set();
  const names = new Set();
  for (const entry of personas) {
    if (!entry) continue;
    const mode = entry.mode === "t" ? "t" : "n";
    if (entry.no != null) personaKeys.add(`${mode}:${String(entry.no)}`);
    const pool = mode === "t" ? (window.DB?.tokui_personas || []) : (window.DB?.normal_personas || []);
    const source = pool.find((persona) => String(persona?.no) === String(entry.no));
    const name = String(entry.name || entry.displayName || entry.build?.personaSrc?.name || source?.name || "").trim();
    if (name) names.add(name);
  }
  for (const entry of egos) {
    if (!entry) continue;
    if (entry.no != null) egoKeys.add(`${String(entry.rank || "")}:${String(entry.no)}`);
    const source = (window.DB?.egos || []).find((ego) =>
      String(ego?.no) === String(entry.no) && String(ego?.rank || "") === String(entry.rank || "")
    );
    const name = String(entry.name || entry.displayName || entry.build?.name || source?.name || "").trim();
    if (name) names.add(name);
  }
  return { personaKeys, egoKeys, names };
}

function isValidDrawItemNumber(value) {
  if (typeof value === "number") return Number.isSafeInteger(value) && value > 0;
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return false;
  return Number.isSafeInteger(Number(value));
}
const VALID_GACHA_EGO_RANKS = new Set(["ZAYIN", "TETH", "HE", "WAW", "ALEPH"]);

function validateDrawTargetsCurrent(state, batch) {
  const owned = drawOwnershipSnapshot(state);
  for (let index = 0; index < batch.records.length; index += 1) {
    const record = batch.records[index];
    const item = record?.item || {};
    const kind = String(record?.kind || item.kind || batch.kind || "");
    if (kind === "themePack" || item.kind === "themePack") {
      const name = String(item.name || "").trim();
      if (!name) return { ok: false, reason: "invalid-theme-pack-item", index };
      const expectedDuplicate = owned.names.has(name);
      if (!!record.duplicate !== expectedDuplicate) {
        return { ok: false, reason: "stale-duplicate-state", index, name, expectedDuplicate, recordedDuplicate: !!record.duplicate };
      }
      owned.names.add(name);
      continue;
    }
    if (kind === "persona" || kind === "specialPersona" || item.kind === "persona" || item.kind === "specialPersona") {
      if (!isValidDrawItemNumber(item.no)) return { ok: false, reason: "invalid-persona-item", index };
      const mode = kind === "specialPersona" || item.kind === "specialPersona" || item.mode === "t" ? "t" : "n";
      const key = `${mode}:${String(item.no)}`;
      if (owned.personaKeys.has(key)) return { ok: false, reason: "draw-target-already-owned", index, key };
      owned.personaKeys.add(key);
      const name = String(item.name || "").trim();
      if (name) owned.names.add(name);
      continue;
    }
    if (kind === "ego" || item.kind === "ego") {
      if (!isValidDrawItemNumber(item.no) || !VALID_GACHA_EGO_RANKS.has(String(item.rank || "").trim())) {
        return { ok: false, reason: "invalid-ego-item", index };
      }
      const key = `${String(item.rank)}:${String(item.no)}`;
      if (owned.egoKeys.has(key)) return { ok: false, reason: "draw-target-already-owned", index, key };
      owned.egoKeys.add(key);
      const name = String(item.name || "").trim();
      if (name) owned.names.add(name);
    }
  }
  return { ok: true, reason: "" };
}

/* 証明バッチの種別とペイロードを確定前に検査する。
   未知の record.kind を料金だけ徴収して所持へ変換しない「成功扱い」にしない。 */
function validateDrawRecordShapes(batch) {
  const validBatchKinds = new Set(["persona", "ego", "themePack"]);
  const validRecordKinds = new Set(["persona", "specialPersona", "ego", "themePack"]);
  const batchKind = batch.kind == null || batch.kind === "" ? null : String(batch.kind);
  if (batchKind && !validBatchKinds.has(batchKind)) {
    return { ok: false, reason: "invalid-batch-kind", kind: batchKind };
  }
  let inferredFamily = batchKind;
  for (let index = 0; index < batch.records.length; index += 1) {
    const record = batch.records[index];
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      return { ok: false, reason: "invalid-record", index };
    }
    const kind = String(record.kind || "");
    const item = record.item;
    if (!validRecordKinds.has(kind)) {
      return { ok: false, reason: "invalid-record-kind", index, kind };
    }
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return { ok: false, reason: "invalid-record-item", index };
    }
    // 一部の旧バージョンに item.kind が無い記録は許容するが、
    // 値がある場合に record.kind と不一致なら拒否する。
    if (item.kind != null && String(item.kind) !== kind) {
      return { ok: false, reason: "record-item-kind-mismatch", index, kind, itemKind: String(item.kind) };
    }

    // 重複欠片はテーマパックの規定報酬だけ。費用やハッシュが整っていても
    // 任意の grantedShards を通すと、誤った確定バッチが残高を増やせてしまう。
    if (record.duplicate !== undefined && typeof record.duplicate !== "boolean") {
      return { ok: false, reason: "invalid-duplicate-flag", index };
    }
    const isDuplicate = record.duplicate === true;
    if (kind !== "themePack" && isDuplicate) {
      return { ok: false, reason: "invalid-duplicate-flag", index, kind };
    }
    const grantedShards = record.grantedShards === undefined ? 0 : record.grantedShards;
    if (typeof grantedShards !== "number" || !Number.isSafeInteger(grantedShards) || grantedShards < 0) {
      return { ok: false, reason: "invalid-shard-grant", index };
    }
    const configuredDuplicateShards = Number(window.LBT_gacha?.RULES?.themePack?.duplicateShards);
    const duplicateShardReward = Number.isSafeInteger(configuredDuplicateShards) && configuredDuplicateShards >= 0
      ? configuredDuplicateShards : 50;
    const expectedShardGrant = kind === "themePack" && isDuplicate ? duplicateShardReward : 0;
    if (grantedShards !== expectedShardGrant) {
      return { ok: false, reason: "invalid-shard-grant", index, expected: expectedShardGrant, actual: grantedShards };
    }

    const family = kind === "specialPersona" ? "persona" : kind;
    if (!inferredFamily) inferredFamily = family;
    if (family !== inferredFamily) {
      return { ok: false, reason: "mixed-record-kinds", index, expected: inferredFamily, actual: family };
    }
    if ((kind === "persona" || kind === "specialPersona") && !isValidDrawItemNumber(item.no)) {
      return { ok: false, reason: "invalid-persona-item", index };
    }
    if (kind === "persona" && item.mode != null && item.mode !== "n") {
      return { ok: false, reason: "invalid-persona-mode", index, expected: "n", actual: item.mode };
    }
    if (kind === "specialPersona" && item.mode != null && item.mode !== "t") {
      return { ok: false, reason: "invalid-persona-mode", index, expected: "t", actual: item.mode };
    }
    if (kind === "ego" && (!isValidDrawItemNumber(item.no) || !VALID_GACHA_EGO_RANKS.has(String(item.rank || "").trim()))) {
      return { ok: false, reason: "invalid-ego-item", index };
    }
    if (kind === "themePack" && !String(item.name || "").trim()) {
      return { ok: false, reason: "invalid-theme-pack-item", index };
    }
  }
  return { ok: true, reason: "" };
}

function validateDrawBatchApplication(state, action) {
  const batch = action?.batch;
  if (!batch || typeof batch !== "object" || !Array.isArray(batch.records)) {
    return { ok: false, reason: "invalid-batch" };
  }
  const proofKey = String(batch.batchHash || batch.commit || "");
  if (!proofKey) return { ok: false, reason: "missing-proof-key" };
  const draws = Array.isArray(state?.draws) ? state.draws : [];
  if (draws.some((existing) => String(existing?.batchHash || existing?.commit || "") === proofKey)) {
    return { ok: false, reason: "duplicate-batch" };
  }
  if (!batch.records.length) return { ok: false, reason: "empty-batch" };

  /* 現行 schema v2 は、ハッシュ鎖・seed/rolls・メタデータ整合性を検査してから
     所持・通帳へ適用する。形状と料金だけの検証では、record を変更しても
     hash chain を検査せず経済効果が適用され得る。旧 v1 は後方互換のため
     従来どおり形状検証で受け入れる。検証器が欠落している環境は fail closed。 */
  if (Number(batch.schemaVersion) >= 2) {
    const verifyBatch = window.LBT_gacha?.verifyBatch;
    if (typeof verifyBatch !== "function") {
      return { ok: false, reason: "draw-proof-verifier-unavailable" };
    }
    let proof;
    try {
      proof = verifyBatch(batch);
    } catch (_) {
      return { ok: false, reason: "invalid-batch-proof" };
    }
    if (!proof?.ok) {
      return {
        ok: false,
        reason: "invalid-batch-proof",
        proofReasons: Array.isArray(proof?.reasons) ? proof.reasons : []
      };
    }
  }

  const recordShapes = validateDrawRecordShapes(batch);
  if (!recordShapes.ok) return recordShapes;

  // 費用の正本は各抽選レコード。呼び出し側が渡す action.cost だけを信頼すると、
  // 別の経路や将来の回帰でゼロを渡して支払いを迂回できる。
  const batchCost = { lp: 0, shards: 0 };
  for (let i = 0; i < batch.records.length; i += 1) {
    const record = batch.records[i];
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      return { ok: false, reason: "invalid-record", index: i };
    }
    const rawCost = record.cost;
    if (!rawCost || typeof rawCost !== "object" || Array.isArray(rawCost)) {
      return { ok: false, reason: "invalid-record-cost", index: i };
    }
    for (const currency of ["lp", "shards"]) {
      const raw = rawCost[currency] === void 0 ? 0 : rawCost[currency];
      let amount;
      if (typeof raw === "number") {
        amount = Number.isSafeInteger(raw) && raw >= 0 ? raw : null;
      } else {
        const text = String(raw ?? "").trim();
        if (!/^\+?(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(text)) amount = null;
        else amount = Number(text.replace(/,/g, ""));
        if (amount !== null && (!Number.isSafeInteger(amount) || amount < 0)) amount = null;
      }
      if (amount === null) return { ok: false, reason: "invalid-record-cost", index: i, currency };
      batchCost[currency] += amount;
      if (!Number.isSafeInteger(batchCost[currency])) {
        return { ok: false, reason: "invalid-record-cost", index: i, currency };
      }
    }
  }

  const targetState = validateDrawTargetsCurrent(state, batch);
  if (!targetState.ok) return targetState;

  if (batch.count != null && Number(batch.count) !== batch.records.length) {
    return { ok: false, reason: "batch-count-mismatch" };
  }
  const recordMethods = batch.records.map((record) => String(record?.method || "draw"));
  const isTicketBatch = batch.ruleset === "core-ticket" || recordMethods.includes("ticket");
  const ticketSpend = action?.ticketSpend;
  if (ticketSpend) {
    const kind = ticketSpend.kind;
    if (!TICKET_KINDS.includes(kind)) return { ok: false, reason: "invalid-ticket-kind" };
    const pack = kind === "pack" ? String(ticketSpend.pack || "") : null;
    const rawCount = Number(ticketSpend.count);
    if (!Number.isSafeInteger(rawCount) || rawCount <= 0 || (kind === "pack" && !pack)) {
      return { ok: false, reason: "invalid-ticket-count" };
    }
    if (!isTicketBatch || recordMethods.some((method) => method !== "ticket")) {
      return { ok: false, reason: "ticket-method-mismatch" };
    }
    if (rawCount !== batch.records.length) {
      return { ok: false, reason: "ticket-count-mismatch", requested: rawCount, records: batch.records.length };
    }
    const compatibleKinds = {
      persona: ["persona"],
      ego: ["ego"],
      choice: ["persona", "ego"],
      pack: ["themePack"]
    };
    if (!compatibleKinds[kind]?.includes(String(batch.kind || ""))) {
      return { ok: false, reason: "ticket-kind-mismatch", ticketKind: kind, batchKind: batch.kind || null };
    }
    if (kind === "pack" && batch.records.some((record) => String(record.pack || "") !== pack)) {
      return { ok: false, reason: "ticket-pack-mismatch", pack };
    }
    if (batchCost.lp !== 0 || batchCost.shards !== 0) {
      return { ok: false, reason: "ticket-batch-has-currency-cost" };
    }
    const balance = computeTicketBalance(state?.results || [], state?.entries || []);
    const available = ticketTotal(balance, kind, pack);
    if (available < rawCount) {
      return { ok: false, reason: "insufficient-tickets", available, requested: rawCount };
    }
  } else {
    if (isTicketBatch || recordMethods.some((method) => method === "ticket")) {
      return { ok: false, reason: "ticket-spend-required" };
    }
    if (action?.cost) {
      const provided = normalizeCurrency(action.cost);
      if (provided.lp !== batchCost.lp || provided.shards !== batchCost.shards) {
        return {
          ok: false,
          reason: "cost-mismatch",
          expected: batchCost,
          provided
        };
      }
    }
    const affordability = purchaseAffordability(state, batchCost);
    /* affordability.reason は人間向け文言。スプレッドの後から機械可読な理由で
       上書きする（UI は reason のコードでトーストを選ぶため、順序を逆に壊せない）。 */
    if (!affordability.ok) return { ok: false, ...affordability, reason: "insufficient-currency" };
  }
  return { ok: true, reason: "" };
}
window.LBT_validateDrawBatchApplication = validateDrawBatchApplication;

function appReducer(state, action) {
  /* 購入系は残高が足りなければ行わない。UI で無効化するだけでは、
     他の入口（自動登録・取り込み）から通過する経路が残るため 这里で止める。 */
  if (action.type === "ADD_ROSTER" || action.type === "ADD_ROSTER_EGO"
    || action.type === "ADD_ITEM" || action.type === "ADD_ROSTER_SUPPORT"
    || action.type === "ADD_ROSTER_SPIRIT" || action.type === "ADD_ENHANCEMENT") {
    const cost = purchaseCostOf(state, action);
    /* 購入扱いなのに価格が解決できない人格は、無料購入として通さず停止する。 */
    if (action.type === "ADD_ROSTER" && action.purchase && !cost) return state;
    if (cost && !purchaseAffordability(state, cost).ok) return state;
  }
  switch (action.type) {
    case "SET_FIELD": {
      const next = { ...state, [action.field]: action.value };
      return ["uniqueBuffs", "customStatuses", "defaultStatuses"].includes(action.field)
        ? normalizeStatusCollections(next) : next;
    }
    case "SET_UI":
      return { ...state, ui: { ...state.ui, ...action.ui } };
    case "PATCH":
      return { ...state, ...action.patch };
    case "CONFIRM_SELF_STATUS_CANDIDATE": {
      const candidate = (state.selfStatusCandidates || []).find((item) => item.id === action.id);
      if (!candidate) return state;
      return normalizeStatusCollections({
        ...state,
        defaultStatuses: mergeDefaultStatusLabels(state.defaultStatuses, [candidate.label]),
        selfStatusCandidates: state.selfStatusCandidates.filter((item) => item.id !== action.id)
      });
    }
    case "DISMISS_SELF_STATUS_CANDIDATE":
      return { ...state, selfStatusCandidates: (state.selfStatusCandidates || []).filter((item) => item.id !== action.id) };
    case "PATCH_PAS":
      return normalizeStatusCollections({ ...state, pas: { ...state.pas, ...action.patch } });
    case "PATCH_PAS2":
      return normalizeStatusCollections({ ...state, pas2: { ...state.pas2, ...action.patch } });
    /* 追加パッシブ（2件目以降）は上限なし。index で1件を編集・削除する。 */
    case "ADD_EXTRA_PASSIVE":
      return normalizeStatusCollections({
        ...state,
        extraPassives: [...(state.extraPassives || []), { id: makeOwnedUid("pas"), name: "", cond: "", always: "", effect: "", quick: "" }]
      });
    case "PATCH_EXTRA_PASSIVE": {
      const index = Number(action.index);
      if (!Number.isInteger(index) || index < 0) return state;
      return normalizeStatusCollections({
        ...state,
        extraPassives: (state.extraPassives || []).map((p, i) => i === index ? { ...p, ...action.patch } : p)
      });
    }
    case "REMOVE_EXTRA_PASSIVE": {
      const index = Number(action.index);
      if (!Number.isInteger(index) || index < 0) return state;
      return normalizeStatusCollections({
        ...state,
        extraPassives: (state.extraPassives || []).filter((_, i) => i !== index)
      });
    }
    /* 精神の手動入力（旧UIの退路）。所持へは写さず、装備投影のみを書き換える。
       所持一覧に無い精神が装備できる状態になりうるため、新規UIは
       APPLY_SPIRIT / REMOVE_ROSTER_SPIRIT を使う。 */
    case "PATCH_SPIRIT":
      return { ...state, ...action.patch };
    case "RESET":
      return {
        ...INIT_STATE,
        favorites: state.favorites,
        historyRecent: state.historyRecent,
        ui: state.ui
      };
    /* アカウント選択ゲートで別アカウントを選んだとき、ページを再読込せずに
       そのアカウントの保存領域を読み直す。再読込にすると常時ゲートと競合して
       「選んでもう一度ゲート」のループになるため、state 差し替えで対応する。 */
    case "RELOAD_ACCOUNT":
      return normalizeStateShape({
        ...INIT_STATE,
        ...(window.LBT_accounts?.loadActive?.() || {}),
        ui: state.ui
      });
    case "HYDRATE":
      return normalizeStateShape({
        ...INIT_STATE,
        ...action.state,
        ui: { ...INIT_STATE.ui, ...action.state.ui || {} }
      });
    /* T26: 部分ロード。許可されたトップレベルフィールドのみ現行 state へマージする。
       未知フィールド・ui は対象外。検証は呼び出し側（import）で実施済み前提だが、
       ここでも配列/オブジェクトの型だけは防御的に確認する。 */
    case "APPLY_PARTIAL": {
      const ALLOWED = ["charName","plName","imgUrls","shareImageData","color","personaMode","personaNo","personaSrc","syncedManual",
        "hp","san","initiative","speed","bullets","resS","resP","resB","spirit","spiritMorale","spiritConfuse","spiritAlways",
        "pas","pas2Enabled","pas2","extraPassives","uniqueBuffs","skills","egoSlots","supports","deathSupport","roster",
        "enhancements","initialItems","draws","customStatuses","defaultStatuses","formulas","builtinFormulasOverride","autoFml",
        "moraleLine","extraCmd","outputExclude","shareOptions","paletteOptions","results","entries","inventory","customItems",
        "favorites","historyRecent","gachaLog","tickets"];
      // 別端末移行（exportState/importStateFromFile）には initiative、initialItems、
      // draws、favorites、historyRecent、gachaLog、tickets（未解決の旧チケット移行行）が含まれる。許可リスト／カテゴリから
      // 漏れると設定や検証履歴が黙って失われる。
      const isSafePartialValue = (v) => {
        if (v === null || v === void 0) return true;
        if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return true;
        if (typeof v === "object") return Object.values(v).every(isSafePartialValue);
        return false; // function / symbol / bigint 等は state に混入させない
      };
      const patch = {};
      const src = action.state || {};
      const fields = Array.isArray(action.fields) ? action.fields : [];
      for (const f of fields) {
        if (!ALLOWED.includes(f)) continue;
        if (!(f in src)) continue;
        if (!isSafePartialValue(src[f])) continue;
        patch[f] = cloneJSON(src[f]);
      }
      return normalizeStateShape({ ...state, ...patch });
    }
    /* ---- Persona equipment ---- */
    case "EQUIP_PERSONA": {
      const { mode, no, src } = action;
      const kw = (src.keywords || []).filter((k) => !["\u7206\u767A", "\u6DF7\u4E71"].includes(k));
      const skills = migrateLegacyDerivedSkills((src.skills || []).map((sk, i) => ({
        id: makeOwnedUid("sk"),
        rank: sk.rank || `スキル${i}`,
        derived_from: sk.derived_from || "",
        derived_index: sk.derived_index,
        derived_condition: sk.derived_condition || "",
        type: sk.type || "",
        sin: sk.sin || "",
        aoe: sk.aoe || "",
        aoeCount: sk.aoeCount || "",
        name: sk.name || "",
        effect: sk.effect || "",
        dice: (sk.dice || []).map((d) => ({ roll: d.roll || "", dval: d.dval ?? d.d ?? "", d: d.d ?? d.dval ?? "", dPlus: !!(d.dPlus ?? d.plus), dCnt: !!d.dCnt, plus: !!(d.plus ?? d.dPlus), effect: d.effect || "" })),
        quick: ""
      })));
      const ubs = (src.unique_buffs || []).map((b, i) => ({
        id: makeOwnedUid("ub"),
        name: normalizeStatusLabel(b.name || ""),
        type: b.type || "\u30D0\u30D5",
        initial: b.initial !== void 0 ? b.initial : 0,
        max: b.max ?? 20,
        desc: b.desc || "",
        place: b.place || "status",
        // noST は「対象に付与する値で、自分は保持しない」というDB側の明示宣言。装備後も保持する。
        noST: b.noST === true
      }));
      const uniqKey = `${mode}:${no}`;
      // 人格一覧・所持一覧など、どの入口からの切替でも現在人格を先に保存する。
      // これがないと直接EQUIP_PERSONAされた場合に編集内容が初期化で失われる。
      let personas = state.roster.personas.slice();
      const currentKey = state.personaMode != null && state.personaNo != null ? `${state.personaMode}:${state.personaNo}` : null;
      const currentBuild = createPersonaBuildSnapshot(state);
      if (currentKey && currentBuild) {
        const currentIndex = personas.findIndex((p) => `${p.mode}:${p.no}` === currentKey);
        if (currentIndex >= 0) personas[currentIndex] = { ...personas[currentIndex], build: currentBuild };
      }
      personas = personas.map((p) => ({ ...p, equipped: false }));
      const existing = personas.findIndex((p) => `${p.mode}:${p.no}` === uniqKey);
      const savedBuild = existing >= 0 ? personas[existing].build : null;
      if (existing >= 0) {
        personas[existing] = { ...personas[existing], equipped: true };
      } else {
        personas.push({
          uid: makeOwnedUid("pr"),
          no,
          mode,
          syncRank: null,
          syncMax: false,
          lcb: false,
          equipped: true,
          notes: ""
        });
      }
      const hist = [uniqKey, ...state.historyRecent.filter((k) => k !== uniqKey)].slice(0, 20);
      const base = {
        ...state,
        personaMode: mode,
        personaNo: no,
        personaSrc: src,
        syncedManual: false,
        // v48: 装備切替時は同期化モードをリセット
        // T35/T36: 装備切替時は前人格の戦闘設定を引き継がない（人格ごとに独立割り振り）。
        // 保存ビルドがある場合は後段で復元されるため、ここではクリーンに初期化する。
        spirit: "",
        spiritMorale: "",
        spiritConfuse: "",
        spiritAlways: "",
        supports: [],
        deathSupport: null,
        egoSlots: { ZAYIN: null, TETH: null, HE: null, WAW: null, ALEPH: null },
        enhancements: [],
        inventory: state.inventory,
        pas2Enabled: false,
        pas2: { name: "", cond: "", always: "", effect: "" },
        extraPassives: Array.isArray(src.extra_passives)
          ? src.extra_passives.map((passive, index) => normalizeExtraPassive(passive, index))
          : [],
        hp: String(src.hp || ""),
        san: String(src.san || ""),
        speed: src.speed || "",
        initiative: 0,
        bullets: src.bullets || "\xD7",
        resS: src.res_slash || "\u666E\u901A",
        resP: src.res_pierce || "\u666E\u901A",
        resB: src.res_blunt || "\u666E\u901A",
        pas: {
          name: src.passive_name || "",
          cond: src.passive_cond || "",
          always: src.passive_always || "",
          effect: src.passive_effect || "",
          quick: ""
        },
        uniqueBuffs: ubs,
        skills,
        // DB指定と「得る／自分に付与」の文面根拠を同じ経路で統合する。
        defaultStatuses: mergeDefaultSelfStatusEntries(state.defaultStatuses, collectSelfManagedStatusEntries(src)),
        // 共通辞書にない名称だけは、根拠付きの確認候補として提示する。
        selfStatusCandidates: detectSelfStatusCandidates(src, [
          ...(state.defaultStatuses || getFactoryDefaultStatuses()).map((item) => item?.label),
          ...(state.customStatuses || []).filter((item) => (item?.place || "status") === "status").map((item) => item?.label),
          ...collectSelfManagedStatusEntries(src).map((entry) => entry.label)
        ]),
        charName: state.charName,
        roster: { ...state.roster, personas },
        historyRecent: hist
      };
      // T35/T36: 所持人格に保存済みビルドがある場合はそちらを復元する。
      // （精神・サポートパッシブ・E.G.O・スキル・固有バフ・強化を人格ごとに割り振り保持）
      if (savedBuild) {
        const b = savedBuild;
        /* 人格ごとに「どのサポート/精神を付けているか」を roster へ押し戻す。
           戻さないと別人格の装備がそのまま残って人格を跨いで混ざる。 */
        const rosterForPersona = b.equipmentRefs ? applyEquipmentRefs(base.roster, b.equipmentRefs) : base.roster;
        return normalizeStatusCollections({
          ...base,
          roster: rosterForPersona,
          hp: b.hp ?? base.hp,
          san: b.san ?? base.san,
          speed: b.speed ?? base.speed,
          initiative: b.initiative ?? base.initiative,
          bullets: b.bullets ?? base.bullets,
          resS: b.resS ?? base.resS,
          resP: b.resP ?? base.resP,
          resB: b.resB ?? base.resB,
          pas: b.pas ? cloneJSON(b.pas) : base.pas,
          extraPassives: mergeExtraPassives(b.extraPassives, { enabled: b.pas2Enabled, passive: b.pas2 }),
          pas2Enabled: false,
          pas2: base.pas2,
          skills: Array.isArray(b.skills) ? migrateLegacyDerivedSkills(cloneJSON(b.skills), src.skills || []) : base.skills,
          uniqueBuffs: Array.isArray(b.uniqueBuffs) ? cloneJSON(b.uniqueBuffs) : base.uniqueBuffs,
          spirit: b.spirit ?? "",
          spiritMorale: b.spiritMorale ?? "",
          spiritConfuse: b.spiritConfuse ?? "",
          spiritAlways: b.spiritAlways ?? "",
          supports: Array.isArray(b.supports) ? cloneJSON(b.supports) : [],
          deathSupport: b.deathSupport ? cloneJSON(b.deathSupport) : null,
          egoSlots: b.egoSlots ? cloneJSON(b.egoSlots) : base.egoSlots,
          enhancements: Array.isArray(b.enhancements) ? cloneJSON(b.enhancements) : [],
          /* アイテムは人格を跨いで共有する。ビルド側で選択する。 */
          personaSrc: b.personaSrc ? { ...cloneJSON(b.personaSrc), skills: migrateLegacyDerivedSkills(b.personaSrc.skills || [], src.skills || []) } : base.personaSrc,
          syncedManual: !!b.syncedManual,
          // V06: 人格ごとの代入式・ステータス関係を復元
          formulas: Array.isArray(b.formulas) ? cloneJSON(b.formulas) : base.formulas,
          customStatuses: Array.isArray(b.customStatuses) ? cloneJSON(b.customStatuses) : base.customStatuses,
          // 保存済みビルドが古くても、DB指定・自己付与文面の両方を再統合する。
          defaultStatuses: mergeDefaultSelfStatusEntries(b.defaultStatuses ? cloneJSON(b.defaultStatuses) : base.defaultStatuses, collectSelfManagedStatusEntries(src)),
          selfStatusCandidates: Array.isArray(b.selfStatusCandidates) ? cloneJSON(b.selfStatusCandidates) : base.selfStatusCandidates
        });
      }
      return normalizeStatusCollections(base);
    }
    case "UNEQUIP_PERSONA":
      return normalizeStatusCollections({
        ...state,
        personaMode: null,
        personaNo: null,
        personaSrc: null,
        syncedManual: false,
        roster: { ...state.roster, personas: state.roster.personas.map((p) => ({ ...p, equipped: false })) }
      });
    /* v48: 同期化＝手動編集モードのトグル */
    case "SET_SYNCED_MANUAL":
      return { ...state, syncedManual: !!action.value };
    /* v49: 同期化時、装備中人格の名前/No/モードを書き換え（personaSrcも更新） */
    case "PATCH_PERSONA_META": {
      const patch = action.patch || {};
      const nextSrc = state.personaSrc ? { ...state.personaSrc, ...patch.src || {} } : state.personaSrc;
      const personas = (state.roster?.personas || []).map((entry) => entry.mode === state.personaMode && String(entry.no) === String(state.personaNo)
        ? { ...entry, displayName: nextSrc?.name ?? entry.displayName ?? "", updatedAt: Date.now() }
        : entry);
      return {
        ...state,
        personaSrc: nextSrc,
        roster: { ...state.roster, personas },
        ...patch.personaMode !== void 0 ? { personaMode: patch.personaMode } : {},
        ...patch.personaNo !== void 0 ? { personaNo: patch.personaNo } : {}
      };
    }
    /* ---- Favorites ---- */
    case "TOGGLE_FAV": {
      const k = `${action.mode}:${action.no}`;
      const has = state.favorites.includes(k);
      return { ...state, favorites: has ? state.favorites.filter((x) => x !== k) : [...state.favorites, k] };
    }
    /* ---- Roster ---- */
    /* 抽出チケットは卓で報酬として受け渡されるもので、所持ている monologue lists ではなく
       リザルトの収入として記録する。種別ごとに数え、パック別はパック名ごとに並べる。
       所持の残数は「全リザルトの収入 − 全明細の消費」で求まるので、
       どこで受け取ってどこで使っても同じ数になる。 */
    case "SET_TICKET_COUNT": {
      const kind = action.kind;
      if (!TICKET_KINDS.includes(kind)) return state;
      const pack = kind === "pack" ? String(action.pack || "") : null;
      if (kind === "pack" && !pack) return state;
      const target = action.count === undefined || action.count === null || action.count === ""
        ? 0
        : parseStrictTicketInteger(action.count, { allowZero: true });
      if (target === null) return state;
      const balance = computeTicketBalance(state.results || [], state.entries || []);
      const current = ticketTotal(balance, kind, pack);
      const delta = target - current;
      if (!delta) return state;
      return setTicketIncome(state, kind, pack, delta, action.resultId);
    }
    case "GRANT_TICKET": {
      const kind = action.kind;
      if (!TICKET_KINDS.includes(kind)) return state;
      const pack = kind === "pack" ? String(action.pack || "") : null;
      if (kind === "pack" && !pack) return state;
      const delta = action.count === undefined || action.count === null || action.count === ""
        ? 0
        : parseStrictTicketInteger(action.count, { allowZero: true, allowNegative: true });
      if (delta === null || delta === 0) return state;
      return setTicketIncome(state, kind, pack, delta, action.resultId);
    }
    /* 抽出チケットを使ったときの消費。収入から引いて残数が減る。
       一括抽選は「引いた回数ぶん」をまとめて 1 action で送るので、
       count を honoured しないと 5 回引いて 1 枚しか消費されない。
       実際は 5 枚で 5 回引くと残数が 5 → 6 になり、引くほど増える。 */
    case "SPEND_TICKET": {
      const kind = action.kind;
      if (!TICKET_KINDS.includes(kind)) return state;
      const pack = kind === "pack" ? String(action.pack || "") : null;
      if (kind === "pack" && !pack) return state;
      const balance = computeTicketBalance(state.results || [], state.entries || []);
      const available = ticketTotal(balance, kind, pack);
      if (available <= 0) return state;
      /* count は負数で「消費した枚数」を表す。指定が無ければ 1 枚。
         明示値に小数・部分一致文字列・安全整数外があれば状態を変更しない。 */
      const omitted = action.count === undefined || action.count === null || action.count === "";
      const parsedCount = omitted ? 0 : parseStrictTicketInteger(action.count, { allowZero: true, allowNegative: true });
      if (parsedCount === null) return state;
      const asked = Math.abs(parsedCount);
      const use = asked > 0 ? asked : 1;
      /* 所持より多くは消費できない。足りなければそれだけ使う。 */
      const take = Math.min(use, available);
      if (take <= 0) return state;
      return appendTicketSpend(state, kind, pack, take, action.ref, action.resultId);
    }
    /* 所持への追加。人格は DB 価格が無いため、purchase に core ルールの金額
       （抽出/購入）を渡されたときだけ明細を立てる。所持だけの操作は
       明細を立てない（UTO など明細の要らない経路もあるため）。 */
    case "ADD_ROSTER": {
      const { mode, no } = action;
      const uniqKey = `${mode}:${no}`;
      if (state.roster.personas.some((p) => `${p.mode}:${p.no}` === uniqKey)) return state;
      const uid = makeOwnedUid("pr");
      const entry = { uid, no, mode, syncRank: null, syncMax: false, lcb: false, equipped: false, notes: "", via: normalizeVia(action.via) };
      const next = { ...state, roster: { ...state.roster, personas: [...state.roster.personas, entry] } };
      const withTicket = action.skipInitialTicketConsumption === true ? next : consumeInitialPersonaTicket(next, action.resultId);
      if (!action.purchase) return withTicket;
      const persona = (mode === "t" ? window.DB?.tokui_personas : window.DB?.normal_personas || []).find((p) => String(p.no) === String(no));
      /* resultId の明示指定は常に勝つ（appendLedgerEntry の契約）。未指定なら
         appendLedgerEntry が Support/EGO/Item/Spirit と同じ「直近のリザルト」へ
         倒すので、人格だけ帰属が違うことはない。 */
      const purchaseCost = purchaseCostOf(state, action);
      if (!purchaseCost) return state;
      return appendLedgerEntry(withTicket, {
        kind: "persona",
        name: persona?.name || `人格 ${mode.toUpperCase()} No.${no}`,
        cost: normalizeCurrency(purchaseCost),
        resultId: action.resultId,
        ref: { kind: "rosterPersona", uid }
      });
    }
    /* 硝子窓から取得した人格別の強化を、購入明細を増やさず保存する。
       共有文書に記録済みの所持は購入操作ではないので ADD_ENHANCEMENT を使わない。
       アクティブ人格なら画面上の選択と人格切替時の復元ビルドを同時に更新する。 */
    case "IMPORT_PERSONA_ENHANCEMENTS": {
      const mode = String(action.mode || "n");
      const no = String(action.no ?? "");
      if (!no || !Array.isArray(action.enhancements)) return state;
      const personasBefore = Array.isArray(state.roster?.personas) ? state.roster.personas : [];
      const targetIndex = personasBefore.findIndex((entry) => entry.mode === mode && String(entry.no) === no);
      if (targetIndex < 0) return state;
      const imported = action.enhancements
        .filter((entry) => entry && typeof entry === "object" && String(entry.name || "").trim())
        .map((entry) => ({
          id: makeOwnedUid("enh"),
          group: String(entry.group || ""),
          name: String(entry.name || "").trim().slice(0, 120),
          effect: String(entry.effect || ""),
          shards: Number.isSafeInteger(Number(entry.shards)) && Number(entry.shards) >= 0 ? Number(entry.shards) : 0,
          category: String(entry.category || "")
        }));
      const active = state.personaMode != null && String(state.personaMode) === mode
        && state.personaNo != null && String(state.personaNo) === no;
      const existing = personasBefore[targetIndex];
      const activeBuild = active ? createPersonaBuildSnapshot(state) : null;
      const savedBuild = existing.build && typeof existing.build === "object" && !Array.isArray(existing.build)
        ? existing.build : {};
      const build = { ...(activeBuild || savedBuild), enhancements: cloneJSON(imported) };
      const personas = personasBefore.map((entry, index) =>
        index === targetIndex ? { ...entry, build } : entry
      );
      return {
        ...state,
        roster: { ...state.roster, personas },
        ...(active ? { enhancements: cloneJSON(imported) } : {})
      };
    }
    /* 同期化・解析・そのMAX（supplement P7/P23）。人格・E.G.O の「-sync/analyze 済み」
       フラグを立てるだけで済ませると、規則が定めた自我の欠片が帳から消える。
       ここを通すので、欠片は直近リザルトの明細として落ち、収入から引かれる。
       既存アカウントのフラグ済み項目には明細が無いので、
       後からまとめて記録できる BACKFILL_SYNC_ENTRIES を用意する。 */
    case "APPLY_PERSONA_SYNC": {
      const { uid, syncRank, syncMax } = action;
      const personasBefore = Array.isArray(state.roster?.personas) ? state.roster.personas : [];
      const targetUid = String(uid ?? "").trim();
      if (!targetUid) return state;
      let targetIndex = -1;
      for (let index = 0; index < personasBefore.length; index += 1) {
        if (String(personasBefore[index]?.uid ?? "").trim() !== targetUid) continue;
        // An ambiguous legacy/imported UID is never permission to mutate several Personas.
        if (targetIndex !== -1) return state;
        targetIndex = index;
      }
      if (targetIndex === -1) return state;
      const before = personasBefore[targetIndex];
      const personas = personasBefore.map((p, index) => index !== targetIndex ? p : {
        ...p,
        syncRank: syncRank === undefined ? p.syncRank : syncRank,
        syncMax: syncMax === undefined ? p.syncMax : syncMax,
        synced: action.synced === undefined ? p.synced : action.synced === true
      });
      const next = { ...state, roster: { ...state.roster, personas } };
      /* 費用は chargeSyncOperation が操作前の状態から1回だけ決める。
         同期MAXは同期済みでも別操作として50欠片かかり、解除では請求しない。 */
      return chargeSyncOperation(next, before.uid, {
        before,
        syncRank,
        syncMax,
        synced: action.synced,
        resultId: action.resultId
      });
    }
    case "APPLY_EGO_ANALYZE": {
      const { uid, analyzeMax } = action;
      const egos = (state.roster.egos || []).map((e) => {
        if (e.uid !== uid) return e;
        return { ...e, analyzed: true, analyzeMax: analyzeMax === undefined ? e.analyzeMax : analyzeMax };
      });
      const entry = (state.roster.egos || []).find((e) => e.uid === uid);
      if (!entry) return state;
      const next = { ...state, roster: { ...state.roster, egos } };
      const wantMax = analyzeMax === undefined ? entry.analyzeMax : analyzeMax;
      const wasMax = entry.analyzeMax === true;
      const alreadyAnalyzed = entry.analyzed === true || wasMax;
      /* 解析は1回だけ。ただし解析済み→MAXは別操作なので、その1回だけ請求する。
         MAXを解除しても返金せず、再設定では新たに請求する。 */
      if (alreadyAnalyzed && (!wantMax || wasMax)) return next;
      const isMax = Boolean(wantMax);
      const cost = window.LBT_operationCost?.(isMax ? "analyzeMax" : "analyze", { rank: entry.rank, no: entry.no }, window.DB);
      if (!cost) return next;
      return appendLedgerEntry(next, {
        kind: isMax ? "egoAnalyzeMax" : "egoAnalyze",
        name: `${entry.rank} No.${entry.no} ${isMax ? "解析MAX" : "解析"}`,
        cost: normalizeCurrency(cost),
        resultId: action.resultId,
        ref: { kind: "rosterEgo", uid }
      });
    }
    /* 既存アカウント用の遡及記録。同期/解析のフラグは既に立ってるが、明細が無い
       状態が残ってる（従来はただのフラグで記録されずに通っていた）。
       既存明細に同 uid の明細が無いものだけを、開いたリザルトへ遡って積む。
       二重計上を避けるため uid+kind で一度だけ。 */
    case "BACKFILL_SYNC_ENTRIES": {
      const existing = new Set((state.entries || []).map((e) => `${e.kind}:${e.ref?.uid}`));
      let next = state;
      const fallback = next.results.length ? next.results[next.results.length - 1].id : null;
      for (const entry of next.roster.personas || []) {
        const persona = (entry.mode === "t" ? window.DB?.tokui_personas : window.DB?.normal_personas || []).find((p) => String(p.no) === String(entry.no));
        const hasSync = Boolean(entry.syncRank) || entry.syncMax === true;
        if (!hasSync) continue;
        const key = `${entry.syncMax === true ? "personaSyncMax" : "personaSync"}:${entry.uid}`;
        if (existing.has(key)) continue;
        const op = entry.syncMax === true ? "syncMax" : "sync";
        const cost = window.LBT_operationCost?.(op, { ...persona, no: entry.no }, window.DB);
        if (!cost) continue;
        next = appendLedgerEntry(next, {
          kind: entry.syncMax === true ? "personaSyncMax" : "personaSync",
          name: `${persona?.name || `人格 No.${entry.no}`}${entry.syncRank ? ` 同期${entry.syncRank}` : " 同期"}`,
          cost: normalizeCurrency(cost),
          resultId: action.resultId === undefined ? fallback : action.resultId,
          ref: { kind: "rosterPersona", uid: entry.uid }
        });
        existing.add(key);
      }
      for (const entry of next.roster.egos || []) {
        const hasAnalyze = entry.analyzed === true || entry.analyzeMax === true;
        if (!hasAnalyze) continue;
        const key = `${entry.analyzeMax === true ? "egoAnalyzeMax" : "egoAnalyze"}:${entry.uid}`;
        if (existing.has(key)) continue;
        const op = entry.analyzeMax === true ? "analyzeMax" : "analyze";
        const cost = window.LBT_operationCost?.(op, { rank: entry.rank, no: entry.no }, window.DB);
        if (!cost) continue;
        next = appendLedgerEntry(next, {
          kind: entry.analyzeMax === true ? "egoAnalyzeMax" : "egoAnalyze",
          name: `${entry.rank} No.${entry.no} ${entry.analyzeMax === true ? "解析MAX" : "解析"}`,
          cost: normalizeCurrency(cost),
          resultId: action.resultId === undefined ? fallback : action.resultId,
          ref: { kind: "rosterEgo", uid: entry.uid }
        });
        existing.add(key);
      }
      return next;
    }
    case "ADD_CUSTOM_ROSTER_EGO": {
      const name = String(action.name || "").trim().slice(0, 120);
      const rank = String(action.rank || "").toUpperCase();
      if (!name || !["ZAYIN", "TETH", "HE", "WAW", "ALEPH"].includes(rank)) return state;
      const duplicate = (state.roster.egos || []).some((entry) =>
        entry.rank === rank && String(entry.build?.name || entry.name || "") === name);
      if (duplicate) return state;
      const no = "custom-import-" + (window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`);
      const form = () => ({ attr: "", sin: "", aoe: "", effect: "", dice: [] });
      const build = {
        __custom: true, __manual: true, __importedFromShare: true, no, rank, name,
        resources: "", san_cost: 0, shards: 0, passive_name: "", passive_cond: "",
        passive_effect: "", unique_buff: "", kakusei: form(), shinshoku: form(), sub_skills: []
      };
      const entry = {
        uid: makeOwnedUid("er"), no, rank, name, analyzed: false, analyzeMax: false,
        notes: "硝子窓共有データから取り込んだ独自E.G.O。詳細は必要に応じて編集してください。",
        build, via: normalizeVia(action.via)
      };
      return { ...state, roster: { ...state.roster, egos: [...(state.roster.egos || []), entry] } };
    }
    /* V23: 所持EGO一覧への追加・削除（人格の ADD_ROSTER / REMOVE_ROSTER に相当）
       purchase=true はショップ経由の購入。装备（SET_EGO_SLOT）からの
       自動登録では明細を立てない（購入と二重請求になるため）。 */
    case "ADD_ROSTER_EGO": {
      const { rank, no } = action;
      if ((state.roster.egos || []).some((e) => e.rank === rank && String(e.no) === String(no))) return state;
      const uid = makeOwnedUid("er");
      const egos = [...(state.roster.egos || []), { uid, no, rank, analyzed: false, analyzeMax: false, notes: "", build: null, via: normalizeVia(action.via) }];
      const next = { ...state, roster: { ...state.roster, egos } };
      if (!action.purchase) return next;
      const ego = (window.DB?.egos || []).find((e) => e.rank === rank && String(e.no) === String(no));
return appendLedgerEntry(next, {
      kind: "ego",
      name: ego?.name || `E.G.O ${rank} No.${no}`,
      cost: priceEgo(rank, no),
      resultId: action.resultId,
      ref: { kind: "rosterEgo", uid }
    });
    }
    case "REMOVE_ROSTER_EGO": {
      const entry = (state.roster.egos || []).find((e) => e.uid === action.uid);
      if (entry?.build?.__custom && entry.build.__importedFromShare) {
        if (String(state.egoSlots?.[entry.rank]?.no) === String(entry.no)) return state;
      } else if (entry?.build?.__custom && (!action.deleteCustomConfirmed || String(state.egoSlots?.[entry.rank]?.no) === String(entry.no))) return state;
      const egos = (state.roster.egos || []).filter((e) => e.uid !== action.uid);
      /* ショップで購入したものは所持から外すと同額の支出を戻す。 */
      return dropLedgerEntriesForRef({ ...state, roster: { ...state.roster, egos } }, { kind: "rosterEgo", uid: action.uid });
    }
    case "REMOVE_ROSTER_BATCH": {
      const ids = new Set(action.uids || []);
      const currentIsRemoved = state.personaMode != null && state.personaNo != null
        && (state.roster.personas || []).some((entry) => ids.has(entry.uid)
          && entry.mode === state.personaMode && String(entry.no) === String(state.personaNo));
      const remaining = (state.roster.personas || []).filter((entry) => !ids.has(entry.uid));
      /* Deleting the active custom Persona must not leave an equipped object that
         no longer exists in the owned roster. Keep the current fields as an editable
         draft, but detach the deleted identity and clear all equipped flags. */
      const personas = currentIsRemoved ? remaining.map((entry) => ({ ...entry, equipped: false })) : remaining;
      const next = {
        ...state,
        roster: { ...state.roster, personas },
        ...(currentIsRemoved ? { personaMode: null, personaNo: null, personaSrc: null, syncedManual: false } : {})
      };
      return dropLedgerEntriesForRefs(next, "rosterPersona", ids);
    }
    case "REMOVE_ROSTER_EGO_BATCH": {
      const ids = new Set(action.uids || []);
      const egos = (state.roster.egos || []).filter((entry) =>
        !ids.has(entry.uid) || (entry.build?.__custom && (!action.deleteCustomConfirmed || String(state.egoSlots?.[entry.rank]?.no) === String(entry.no))));
      /* 装備中の創作E.G.Oは保護される。消えていないものの明細まで外さない。 */
      const removed = [...ids].filter((uid) => !egos.some((entry) => entry.uid === uid));
      const next = { ...state, roster: { ...state.roster, egos } };
      return dropLedgerEntriesForRefs(next, "rosterEgo", removed);
    }
    case "RESTORE_ROSTER_BATCH": {
      const kind = action.kind === "egos" ? "egos"
        : action.kind === "supports" ? "supports"
        : action.kind === "spirits" ? "spirits"
        : "personas";
      const existing = kind === "personas"
        ? normalizeCustomPersonaRosterIdentity(state.roster[kind] || [])
        : (state.roster[kind] || []);
      const present = new Set(existing.map((entry) => entry.uid));
      const restoredRows = [...existing, ...(action.items || []).filter((entry) => entry && !present.has(entry.uid))];
      const restored = kind === "personas"
        ? normalizeCustomPersonaRosterIdentity(restoredRows)
        : restoredRows;
      const roster = { ...state.roster, [kind]: restored };
      const withRoster = {
        ...state,
        roster,
        ...(kind === "supports" || kind === "spirits" ? projectEquipmentFromRoster(roster) : {})
      };
      /* 削除時に外した購入明細も戻す。所持だけ戻して明細を落とすと、
         支払いが消えて残高が増える（削除が得になる）。 */
      const entryIds = new Set((withRoster.entries || []).map((entry) => entry.id));
      const restoredEntries = (action.entries || []).filter((entry) => entry?.id && !entryIds.has(entry.id));
      return restoredEntries.length
        ? { ...withRoster, entries: [...(withRoster.entries || []), ...restoredEntries] }
        : withRoster;
    }
    case "REMOVE_ROSTER": {
      const removed = state.roster.personas.find((p) => p.uid === action.uid);
      const personas = state.roster.personas.filter((p) => p.uid !== action.uid);
      const next = { ...state, roster: { ...state.roster, personas } };
      // V16: 削除された人格を装備中なら、編集内容を破棄して DB 既定へリセットする。
      if (removed && state.personaSrc && removed.mode === state.personaMode && String(removed.no) === String(state.personaNo)) {
        /* A custom Persona has no DB fallback. Removing it must clear the active
           identity rather than leaving an unowned, still-equipped ghost Persona. */
        if (removed.mode === "custom") {
          return {
            ...next,
            personaMode: null,
            personaNo: null,
            personaSrc: null,
            syncedManual: false,
            roster: { ...next.roster, personas: personas.map((entry) => ({ ...entry, equipped: false })) }
          };
        }
        const srcPool = removed.mode === "n" ? (window.DB?.normal_personas || [])
          : removed.mode === "t" ? (window.DB?.tokui_personas || []) : [];
        const dbSrc = srcPool.find((x) => String(x.no) === String(removed.no));
        if (dbSrc) {
          next.hp = String(dbSrc.hp || "");
          next.san = String(dbSrc.san || "");
          next.speed = dbSrc.speed || "";
          next.bullets = dbSrc.bullets || "\xD7";
          next.resS = dbSrc.res_slash || "\u666E\u901A";
          next.resP = dbSrc.res_pierce || "\u666E\u901A";
          next.resB = dbSrc.res_blunt || "\u666E\u901A";
          next.pas = { name: dbSrc.passive_name || "", cond: dbSrc.passive_cond || "", always: dbSrc.passive_always || "", effect: dbSrc.passive_effect || "", quick: "" };
          next.skills = cloneJSON(dbSrc.skills || []).map((sk, i) => ({ id: makeOwnedUid("sk"), ...sk, dice: (sk.dice || []).map((d) => ({ roll: d.roll || "", d: d.d ?? "", plus: !!d.plus, effect: d.effect || "" })) }));
          next.uniqueBuffs = cloneJSON(dbSrc.unique_buffs || []).map((b, i) => ({ id: makeOwnedUid("ub"), name: b.name || "", type: b.type || "\u56FA\u6709\u30D0\u30D5", initial: b.initial ?? 0, max: b.max ?? 0, desc: b.desc || "", place: b.place || "status", noST: b.noST === true }));
          next.personaSrc = cloneJSON(dbSrc);
          next.spirit = ""; next.spiritMorale = ""; next.spiritConfuse = ""; next.spiritAlways = "";
          next.supports = []; next.deathSupport = null;
          next.egoSlots = { ZAYIN: null, TETH: null, HE: null, WAW: null, ALEPH: null };
          next.enhancements = [];
          next.syncedManual = false;
        }
      }
      return next;
    }
    case "PATCH_ROSTER": {
      return { ...state, roster: {
        ...state.roster,
        personas: state.roster.personas.map((p) => p.uid === action.uid ? { ...p, ...action.patch } : p)
      } };
    }
    /* ---- Build-owned items ---- */
    case "ADD_ITEM": {
      const itemId = String(action.itemId || "");
      if (!itemId) return state;
      /* 特殊資源は買い物ではなく所持数だけを管理する。
         通常の ADD_ITEM 経路で 0LP の購入明細を作らないため、所持専用経路へ委譲する。 */
      const specialResource = (window.DB?.specialItems || []).find((item) => item?.id === itemId && item.specialResource);
      /* 自我の欠片は所持数を別保存せず、通帳残高を唯一の情報源とする。
         アイテム欄から購入したら LP 支出を記録し、同じリザルトの獲得欠片を増やす。 */
      if (specialResource?.ledgerResource === "shards") {
        const targetId = action.resultId || latestResultId(state);
        const target = (state.results || []).find((result) => result.id === targetId);
        if (!target) return state;
        const purchaseCost = priceItemById(state, itemId);
        const balanceBeforePurchase = computeLedgerBalance(state.results, state.entries);
        if (!purchaseCost || purchaseCost.lp < 1 || balanceBeforePurchase.lp < purchaseCost.lp) return state;
        const currentIncome = normalizeCurrency(target.income);
        const nextShardIncome = currentIncome.shards + 1;
        if (!Number.isSafeInteger(nextShardIncome)) return state;
        const results = (state.results || []).map((result) => result.id === targetId
          ? { ...result, income: { ...currentIncome, shards: nextShardIncome, tickets: normalizeTickets(target.income?.tickets) }, updatedAt: Date.now() }
          : result);
        return appendLedgerEntry({ ...state, results }, {
          kind: "item",
          name: String(specialResource.name || "自我の欠片"),
          cost: purchaseCost,
          resultId: targetId,
          note: "2LPで自我の欠片1個を購入"
        });
      }
      if (specialResource) {
        const purchaseCost = priceItemById(state, itemId);
        const hasPrice = purchaseCost && (purchaseCost.lp > 0 || purchaseCost.shards > 0);
        /* 価格のない特殊アイテムは所持欄への登録として扱う。価格付き特殊アイテムは
           ショップ購入として毎回残高を検証し、在庫追加と支出明細を同時に反映する。 */
        if (!hasPrice) return appReducer(state, { type: "ADD_ITEM_INVENTORY", itemId, quantity: 1 });
        if (!purchaseAffordability(state, purchaseCost).ok) return state;
        const current = Array.isArray(state.inventory) ? state.inventory : [];
        const existing = current.find((entry) => entry.itemId === itemId);
        const maxOwned = window.LBT_getItemMaxOwned?.(state, itemId) || 99;
        if (existing && (Number(existing.quantity) || 0) >= maxOwned) return state;
        const inventory = existing
          ? current.map((entry) => entry.itemId === itemId
            ? { ...entry, quantity: clampItemQuantity(state, itemId, (Number(entry.quantity) || 1) + 1) }
            : entry)
          : [...current, { uid: makeOwnedUid("it"), itemId, quantity: 1, memo: true, palette: true, origin: "acquired" }];
        const next = { ...state, inventory };
        const owned = next.inventory.find((entry) => entry.itemId === itemId);
        return appendLedgerEntry(next, {
          kind: "item",
          name: String(specialResource.name || itemId),
          cost: purchaseCost,
          resultId: action.resultId,
          ref: { kind: "inventory", uid: owned?.uid || itemId },
          note: `${String(specialResource.name || itemId)}を購入`
        });
      }
      const purchaseFromShop = action.purchase === true;
      const purchaseCost = purchaseFromShop ? priceItemById(state, itemId) : null;
      if (purchaseFromShop && (!purchaseCost || (purchaseCost.lp <= 0 && purchaseCost.shards <= 0) || !purchaseAffordability(state, purchaseCost).ok)) return state;
      const current = Array.isArray(state.inventory) ? state.inventory : [];
      const existing = current.find((entry) => entry.itemId === itemId);
      const existingQuantity = existing ? (parsePositiveIntegerStrict(existing.quantity) ?? 1) : 0;
      const maxOwned = window.LBT_getItemMaxOwned?.(state, itemId) || 99;
      if (purchaseFromShop && existingQuantity >= maxOwned) return state;
      const inventory = existing
        ? current.map((entry) => entry.itemId === itemId ? { ...entry, quantity: clampItemQuantity(state, itemId, existingQuantity + 1) } : entry)
        : [...current, { uid: `it-${Date.now()}-${itemId}`, itemId, quantity: 1, memo: true, palette: true, origin: "acquired" }];
      const next = { ...state, inventory };
      /* ショップ購入は毎回1個を購入し、購入履歴を独立して残す。消費後も購入履歴は保持。 */
      if (purchaseFromShop) return appendLedgerEntry(next, { kind: "item", name: ownedName(state, itemId), cost: purchaseCost, resultId: action.resultId });
      /* 通常の所持追加は導入時だけ明細を作り、数量加算の二重計上を避ける。 */
      if (existing) return next;
      const owned = next.inventory.find((entry) => entry.itemId === itemId);
      return appendLedgerEntry(next, { kind: "item", name: ownedName(state, itemId), cost: priceItemById(state, itemId), resultId: action.resultId, ref: { kind: "inventory", uid: owned?.uid || itemId } });
    }
    /* 共有データから「所持」だけを取り込む。ADD_ITEM と違い明細を起こさない。
       支出はメモ（リザルトの支出行）が持っており、ここで DB 価格を課すと
       二重計上になる。取得の事実だけを所持へ足す。 */
    case "ADD_ITEM_INVENTORY": {
      const itemId = String(action.itemId || "");
      if (!itemId) return state;
      /* 通帳連動資源は共有データから独立した所持数へ複製しない。 */
      if ((window.DB?.specialItems || []).some((item) => item?.id === itemId && item?.ledgerResource)) return state;
      // 共有／移送で明示された数量は厳密に検証する。未指定だけを後方互換で1個とし、
      // "12abc" や小数を部分一致で数量へ変換しない。
      const qty = action.quantity === void 0 || action.quantity === null || action.quantity === ""
        ? 1
        : parsePositiveIntegerStrict(action.quantity);
      if (qty === null) return state;
      const current = Array.isArray(state.inventory) ? state.inventory : [];
      const existing = current.find((entry) => entry.itemId === itemId);
      const inventory = existing
        ? current.map((entry) => entry.itemId === itemId
          ? { ...entry, quantity: clampItemQuantity(state, itemId, (Number(entry.quantity) || 1) + qty) }
          : entry)
        : [...current, { uid: makeOwnedUid("it"), itemId, quantity: clampItemQuantity(state, itemId, qty), memo: true, palette: true, origin: "acquired" }];
      return { ...state, inventory };
    }
    case "CONSUME_ITEM": {
      const itemId = String(action.itemId || "").trim();
      const quantity = parsePositiveIntegerStrict(action.quantity);
      if (!itemId || quantity === null) return state;
      const current = Array.isArray(state.inventory) ? state.inventory : [];
      const target = current.find((entry) => entry?.itemId === itemId);
      if (!target) return state;
      const ownedQuantity = parsePositiveIntegerStrict(target.quantity) ?? 1;
      if (quantity > ownedQuantity) return state;
      /* 通帳連動資源は所持在庫ではなく残高が唯一の情報源。 */
      const ledgerResource = (window.DB?.specialItems || []).find((item) => item?.id === itemId && item?.ledgerResource);
      if (ledgerResource) return state;
      const results = Array.isArray(state.results) ? state.results : [];
      const targetResultId = action.resultId === undefined ? latestResultId(state) : String(action.resultId || "");
      const targetResult = results.find((result) => result.id === targetResultId);
      if (!targetResult) return state;
      const operationId = String(action.operationId || "").trim().slice(0, 120);
      if (operationId && results.some((result) => Array.isArray(result.consumedItems)
        && result.consumedItems.some((item) => item?.operationId === operationId))) return state;
      const consumedAt = Date.now();
      const consumedItem = {
        id: makeOwnedUid("use"),
        operationId: operationId || makeOwnedUid("op"),
        itemId,
        itemName: ownedName(state, itemId),
        quantity,
        reason: String(action.reason || "consumption").trim().slice(0, 80) || "consumption",
        consumedAt
      };
      const inventory = ownedQuantity === quantity
        ? current.filter((entry) => entry.uid !== target.uid)
        : current.map((entry) => entry.uid === target.uid ? { ...entry, quantity: ownedQuantity - quantity } : entry);
      const nextResults = results.map((result) => result.id === targetResultId
        ? { ...result, consumedItems: [...normalizeConsumedItems(result.consumedItems), consumedItem], updatedAt: consumedAt }
        : result);
      /* 購入時の明細は購入の履歴。消費で所持が0になっても削除しない。 */
      return { ...state, inventory, results: nextResults };
    }
    case "PATCH_ITEM": {
      const inventory = (state.inventory || []).map((entry) => entry.uid === action.uid ? { ...entry, ...action.patch, quantity: clampItemQuantity(state, entry.itemId, action.patch?.quantity ?? entry.quantity) } : entry);
      return { ...state, inventory };
    }
    case "REMOVE_ITEM": {
      const target = (state.inventory || []).find((entry) => entry.uid === action.uid);
      /* 所持を消したら支出も消す。残しておけば残高（収入−支出）が狂う。 */
      return dropLedgerEntriesForRef({ ...state, inventory: (state.inventory || []).filter((entry) => entry.uid !== action.uid) },
        target ? { kind: "inventory", uid: target.uid } : null);
    }
    /* 初期枠の定義。どのアイテムを「最初から持っている」ものとするかの集合で、
       所持そのものではない（取り込みは APPLY_INITIAL_ITEMS が行う）。 */
    case "SET_INITIAL_ITEMS": {
      const ids = Array.isArray(action.ids) ? action.ids : [];
      const cleaned = [...new Set(ids.map((id) => String(id || "").trim()).filter(Boolean))];
      return { ...state, initialItems: cleaned };
    }
    /* 初期枠を所持として取り込む。既に所持しているものは触らず、
       支払っていないので明細も起こさない（残高を狂わせない）。 */
    case "APPLY_INITIAL_ITEMS": {
      const current = Array.isArray(state.inventory) ? state.inventory : [];
      const owned = new Set(current.map((entry) => entry.itemId));
      const wanted = (Array.isArray(state.initialItems) ? state.initialItems : []).filter((id) => !owned.has(id));
      if (wanted.length === 0) return state;
      const seeded = wanted.map((itemId) => ({
        uid: makeOwnedUid("it"),
        itemId,
        quantity: 1,
        memo: true,
        palette: true,
        origin: "initial"
      }));
      return { ...state, inventory: [...current, ...seeded] };
    }
    /* 精神の初期枠。アイテムと同じ考えだが、精神は「買うもの」ではなく
   「装備するもの」なので所持へ送るだけで、明細は立てない（購入と数えない）。 */
case "SET_INITIAL_SPIRITS": {
  const names = Array.isArray(action.names) ? action.names : [];
  const freeSpiritNames = new Set(
    (Array.isArray(window.DB?.spirits) ? window.DB.spirits : [])
      .filter(isExplicitlyFreeSpirit)
      .map((definition) => definition.name)
  );
  const cleaned = [...new Set(names.map((name) => String(name || "").trim()).filter((name) => name && freeSpiritNames.has(name)))];
  return { ...state, initialSpirits: cleaned };
}
case "APPLY_INITIAL_SPIRITS": {
  const current = Array.isArray(state.roster?.spirits) ? state.roster.spirits : [];
  const owned = new Set(current.map((entry) => entry.name));
  const freeSpiritNames = new Set(
    (Array.isArray(window.DB?.spirits) ? window.DB.spirits : [])
      .filter(isExplicitlyFreeSpirit)
      .map((definition) => definition.name)
  );
  /* 旧保存値や手動dispatchから、有料・価格不明の精神を無料初期所持へ追加させない。 */
  const wanted = (Array.isArray(state.initialSpirits) ? state.initialSpirits : [])
    .filter((name) => !owned.has(name) && freeSpiritNames.has(name));
  if (wanted.length === 0) return state;
  const roster = [...current, ...wanted.map((name) => ({
    uid: makeOwnedUid("spr"),
    name,
    equipped: false,
    resultId: null,
    addedAt: Date.now(),
    origin: "initial",
    notes: ""
  }))];
  return { ...state, roster: { ...state.roster, spirits: roster } };
}
case "ADD_CUSTOM_ITEM": {
      const raw = action.item || {};
      const name = String(raw.name || "").trim().slice(0, 80);
      if (!name) return state;
      const id = String(raw.id || `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);
      if ((state.customItems || []).some((item) => item.id === id)) return state;
      const item = {
        id,
        name,
        category: String(raw.category || "その他").trim().slice(0, 24) || "その他",
        tags: Array.isArray(raw.tags) ? raw.tags.map((tag) => String(tag || "").trim()).filter(Boolean).slice(0, 12) : [],
        effect: String(raw.effect || "").trim().slice(0, 2000),
        palette: String(raw.palette || "").trim().slice(0, 2000),
        price: String(raw.price || "").trim().slice(0, 24),
        maxOwned: normalizeItemMaxOwned(raw.maxOwned),
        custom: true
      };
      return { ...state, customItems: [...(state.customItems || []), item] };
    }
    case "PATCH_CUSTOM_ITEM": {
      const customItems = (state.customItems || []).map((item) => {
        if (item.id !== action.id) return item;
        const patch = action.patch || {};
        return {
          ...item,
          name: patch.name !== void 0 ? String(patch.name || "").trim().slice(0, 80) : item.name,
          category: patch.category !== void 0 ? String(patch.category || "その他").trim().slice(0, 24) || "その他" : item.category,
          tags: patch.tags !== void 0 ? (Array.isArray(patch.tags) ? patch.tags.map((tag) => String(tag || "").trim()).filter(Boolean).slice(0, 12) : []) : item.tags,
          effect: patch.effect !== void 0 ? String(patch.effect || "").slice(0, 2000) : item.effect,
          palette: patch.palette !== void 0 ? String(patch.palette || "").slice(0, 2000) : item.palette,
          price: patch.price !== void 0 ? String(patch.price || "").slice(0, 24) : item.price,
          maxOwned: patch.maxOwned !== void 0 ? normalizeItemMaxOwned(patch.maxOwned) : normalizeItemMaxOwned(item.maxOwned),
          custom: true
        };
      });
      const next = { ...state, customItems };
      return {
        ...next,
        inventory: (state.inventory || []).map((entry) => ({ ...entry, quantity: clampItemQuantity(next, entry.itemId, entry.quantity) }))
      };
    }
    case "REMOVE_CUSTOM_ITEM": {
      const id = String(action.id || "");
      if (!id) return state;
      const removedInventory = (state.inventory || []).filter((entry) => entry.itemId === id);
      let next = {
        ...state,
        customItems: (state.customItems || []).filter((item) => item.id !== id),
        inventory: (state.inventory || []).filter((entry) => entry.itemId !== id),
        initialItems: (state.initialItems || []).filter((itemId) => String(itemId) !== id)
      };
      // 所持削除の契約を維持する。初期枠からも外し、購入時の通帳明細も
      // 代表UID参照で削除する。定義だけ消して明細を残すと収支が不一致になる。
      next = dropLedgerEntriesForRefs(next, "inventory", removedInventory.map((entry) => entry.uid));
      return next;
    }
    /* ---- Skills ---- */
    case "PATCH_SKILL": {
      const patch = action.patch || {};
      return normalizeStatusCollections({ ...state, skills: state.skills.map((s, index) => {
        if (s.id !== action.id) return s;
        const next = { ...s, ...patch };
        // rankを書き換えた場合は、以前の派生番号を優先して元へ戻さない。
        // 同じ親番号・派生番号を複数のスキルへ指定することも許可する。
        if (Object.prototype.hasOwnProperty.call(patch, "rank")) {
          next.rank = normalizeEditedSkillRank(patch.rank);
          const parsed = parseDerivedSkillRank(next.rank);
          if (parsed) {
            next.derived_from = parsed.parent;
            next.derived_index = parsed.index;
          } else {
            delete next.derived_from;
            delete next.derived_index;
          }
        }
        return normalizePersonaSkill(next, index);
      }) });
    }
    case "ADD_SKILL":
      return normalizeStatusCollections({ ...state, skills: [...state.skills, {
        id: makeOwnedUid("sk"),
        rank: nextRootSkillRank(state.skills),
        type: "\u6253\u6483",
        sin: "",
        aoe: "",
        aoeCount: "",
        name: "",
        effect: "",
        dice: [{ roll: "", effect: "" }],
        quick: ""
      }] });
    case "DERIVE_SKILL": {
      const from = state.skills.findIndex((s) => s.id === action.id);
      if (from < 0) return state;
      const base = cloneJSON(state.skills[from]);
      const parsed = parseDerivedSkillRank(base.rank);
      const family = base.derived_from || parsed?.parent || String(base.rank || `スキル${from}`).replace(/-\d+$/, "");
      const maxNo = (state.skills || []).reduce((max, skill) => {
        const candidate = skill.derived_from === family ? Number(skill.derived_index) : parseDerivedSkillRank(skill.rank)?.parent === family ? parseDerivedSkillRank(skill.rank).index : 1;
        return Math.max(max, Number.isFinite(candidate) ? candidate : 1);
      }, 1);
      base.id = makeOwnedUid("sk");
      base.derived_from = family;
      base.derived_index = Math.max(2, maxNo + 1);
      base.derived_condition = base.derived_condition || "";
      base.rank = `${family}-${base.derived_index}`;
      const skills = state.skills.slice();
      skills.splice(from + 1, 0, base);
      return normalizeStatusCollections({ ...state, skills });
    }
    case "REMOVE_SKILL":
      return normalizeStatusCollections({ ...state, skills: state.skills.filter((s) => s.id !== action.id) });
    case "ADD_DICE":
      return normalizeStatusCollections({ ...state, skills: state.skills.map((s) => s.id === action.skillId ? { ...s, dice: [...s.dice, { roll: "", effect: "" }] } : s) });
    case "REMOVE_DICE":
      return normalizeStatusCollections({ ...state, skills: state.skills.map((s) => s.id === action.skillId ? { ...s, dice: s.dice.filter((_, i) => i !== action.diceIdx) } : s) });
    case "PATCH_DICE":
      return normalizeStatusCollections({ ...state, skills: state.skills.map((s) => s.id === action.skillId ? { ...s, dice: s.dice.map((d, i) => i === action.diceIdx ? { ...d, ...action.patch } : d) } : s) });
    /* ---- EGO ---- */
    case "CREATE_CUSTOM_EGO": {
      const rank = action.rank;
      const name = String(action.name || "").trim();
      if (!["ZAYIN", "TETH", "HE", "WAW", "ALEPH"].includes(rank) || !name) return state;
      if (state.egoSlots[rank] && action.replaceConfirmed !== true) return state;
      const no = `custom-${window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
      const form = () => ({ attr: "", sin: "", aoe: "", effect: "", dice: [] });
      const slot = { __custom: true, __manual: true, no, rank, name, resources: "", san_cost: 0, shards: 0,
        passive_name: "", passive_cond: "", passive_effect: "", unique_buff: "", kakusei: form(), shinshoku: form(), sub_skills: [] };
      // Preserve the outgoing slot's current edits before replacing it.
      const saved = state.egoSlots[rank] ? appReducer(state, { type: "SAVE_EGO_BUILD", rank }) : state;
      return syncCustomEgoState({ ...saved, egoSlots: { ...saved.egoSlots, [rank]: slot }, egoManual: true,
        ui: { ...saved.ui, egoDetailSlot: rank, egoListExpanded: false } });
    }
    /* ---- E.G.O ---- */
    /* 「既定データを再読込」: 保存済み解析ビルドをクリアし、DBの該当E.G.O
       レコードでスロットを再装備する。解析モード（egoManual）は維持し、
       編集パネルの内容だけを原典の既定へ戻す。 */
    case "RESET_EGO_SLOT_TO_DB": {
      const rank = action.rank;
      const slot = state.egoSlots[rank];
      if (!slot) return state;
      const dbEgo = (window.DB?.egos || []).find((e) => String(e.no ?? "") === String(slot.no ?? "") && e.rank === rank);
      if (!dbEgo) return state;
      const egos = (state.roster.egos || []).map((e) => e.rank === rank && String(e.no) === String(slot.no) && e.build ? { ...e, build: null } : e);
      const nextEgoSlots = normalizeEgoSlots({ ...state.egoSlots, [rank]: cloneJSON(dbEgo) });
      return syncCustomEgoState({ ...state, egoSlots: nextEgoSlots, roster: { ...state.roster, egos } });
    }
    case "SET_EGO_SLOT": {
      let nextValue = action.value ? cloneJSON(action.value) : null;
      // V01/V25: 所持EGOに保存済みの解析ビルドがあれば DB 既定の代わりにそちらを装備する。
      if (nextValue) {
        const saved = (state.roster.egos || []).find((e) => e.rank === action.rank && String(e.no) === String(nextValue.no) && e.build);
        if (saved) nextValue = { ...nextValue, ...cloneJSON(saved.build) };
      }
/* 装備は所持を確定させない。所持への登録は ADD_ROSTER_EGO（指定購入＝欠片を請求、
         または購入せず所持に追加＝無料）だけが行う。装備を所持確定にしていると、未所持E.G.Oの
         詳細画面で装備を押した瞬間に指定購入を跨いで帳も明細も動かないまま所持へ入る。 */
      if (nextValue && action.preview) nextValue = { ...nextValue, __preview: true };
      const nextEgoSlots = normalizeEgoSlots({ ...state.egoSlots, [action.rank]: nextValue });
      // 装備・付け替え・解除はどれも解析モードを終了する。解除後に別スロットの詳細へ
      // 編集状態だけが残り、クリック一回で解析面が表示されることを防ぐ。
      const nextUi = { ...state.ui, ...(nextValue ? { egoListExpanded: false } : {}), egoDetailSlot: null };
      return syncCustomEgoState({ ...state, egoSlots: nextEgoSlots, ui: nextUi, egoManual: false });
    }
    /* V01/V25: EGO解析モード（手動編集）のトグル。人格の SET_SYNCED_MANUAL に相当 */
    case "SET_EGO_MANUAL":
      return { ...state, egoManual: !!action.value };
    /* V01/V25: 装備中EGOの解析内容を所持EGOエントリへ保存（人格の SAVE_PERSONA_BUILD に相当）。
       roster.egos にエントリが無ければ新規作成する（所持＝装備の扱い）。 */
    case "SAVE_EGO_BUILD": {
      const rank = action.rank;
      const slot = state.egoSlots?.[rank];
      if (!slot) return state;
      const build = { savedAt: Date.now(), ...cloneJSON(slot) };
      const egos = (state.roster.egos || []).slice();
      const idx = egos.findIndex((e) => e.rank === rank && String(e.no) === String(slot.no));
      const wasAnalyzed = idx >= 0 && (egos[idx].analyzed === true || egos[idx].analyzeMax === true);
      /* 解析は危険度ランク分の自我の欠片を支払う（supplement P7）。保存のたびに
         取るのは誤りで、解析を初めて確定させた1回だけ。既に解析済みなら積まない。
         残高が足りないときも編集内容は捨てず、解析フラグだけ立てない
         （後から精算できるよう BACKFILL の対象に残す）。 */
      const cost = wasAnalyzed ? null : window.LBT_operationCost?.("analyze", { rank, no: slot.no }, window.DB);
      const canAnalyze = wasAnalyzed || !cost || operationAffordability(state, cost).ok;
      if (idx >= 0) egos[idx] = { ...egos[idx], analyzed: canAnalyze, build };
      else egos.push({ uid: makeOwnedUid("er"), no: slot.no, rank, analyzed: canAnalyze, analyzeMax: false, notes: "", build });
      const next = { ...state, roster: { ...state.roster, egos } };
      if (!canAnalyze || wasAnalyzed || !cost) return next;
      const uid = egos[idx >= 0 ? idx : egos.length - 1].uid;
      return appendLedgerEntry(next, {
        kind: "egoAnalyze",
        name: `${rank} No.${slot.no} 解析`,
        cost: normalizeCurrency(cost),
        ref: { kind: "rosterEgo", uid }
      });
    }
    /* V01/V25: 所持EGOの保存解析を破棄して DB 既定に戻す */
    case "CLEAR_EGO_BUILD": {
      const egos = (state.roster.egos || []).map((e) => e.uid === action.uid && !e.build?.__custom ? { ...e, build: null } : e);
      return { ...state, roster: { ...state.roster, egos } };
    }
    case "PATCH_EGO_SLOT": {
      const cur = state.egoSlots[action.rank];
      if (!cur) return state;
      return syncCustomEgoState({ ...state, egoSlots: normalizeEgoSlots({ ...state.egoSlots, [action.rank]: { ...cur, ...action.patch } }) });
    }
    case "PATCH_EGO_SKILL": {
      const cur = state.egoSlots[action.rank];
      if (!cur) return state;
      const next = cloneJSON(cur);
      if (action.skillKey === "sub_skills") {
        if (!next.sub_skills?.[action.index]) return state;
        next.sub_skills[action.index] = { ...next.sub_skills[action.index], ...action.patch };
      } else {
        next[action.skillKey] = { ...(next[action.skillKey] || {}), ...action.patch };
      }
      return syncCustomEgoState({ ...state, egoSlots: normalizeEgoSlots({ ...state.egoSlots, [action.rank]: next }) });
    }
    case "PATCH_EGO_DICE": {
      const cur = state.egoSlots[action.rank];
      if (!cur) return state;
      const next = cloneJSON(cur);
      const list = action.skillKey === "sub_skills" ? next.sub_skills?.[action.index]?.dice : next[action.skillKey]?.dice;
      if (!list?.[action.diceIdx]) return state;
      list[action.diceIdx] = { ...list[action.diceIdx], ...action.patch };
      return syncCustomEgoState({ ...state, egoSlots: normalizeEgoSlots({ ...state.egoSlots, [action.rank]: next }) });
    }
    case "ADD_EGO_DICE": {
      const cur = state.egoSlots[action.rank];
      if (!cur) return state;
      const next = cloneJSON(cur);
      const list = action.skillKey === "sub_skills" ? next.sub_skills?.[action.index]?.dice : next[action.skillKey]?.dice;
      if (!Array.isArray(list)) return state;
      list.push({ roll: "", dval: "", d: "", dPlus: false, dCnt: false, plus: false, effect: "" });
      return syncCustomEgoState({ ...state, egoSlots: normalizeEgoSlots({ ...state.egoSlots, [action.rank]: next }) });
    }
    case "REMOVE_EGO_DICE": {
      const cur = state.egoSlots[action.rank];
      if (!cur) return state;
      const next = cloneJSON(cur);
      const list = action.skillKey === "sub_skills" ? next.sub_skills?.[action.index]?.dice : next[action.skillKey]?.dice;
      if (!Array.isArray(list)) return state;
      if (action.diceIdx < 0 || action.diceIdx >= list.length) return state;
      list.splice(action.diceIdx, 1);
      return syncCustomEgoState({ ...state, egoSlots: normalizeEgoSlots({ ...state.egoSlots, [action.rank]: next }) });
    }
    /* ---- 抽出リスト（ガチャ結果の保存所）----
       結果と錨はバッチ単位で束ねて保存する。再計算や整形はしない
       （移行が記録を書き換えるとハッシュ鎖が切れる）。
       所持への反映もここから行う。記録の records が唯一のソースなので、
       画面が渡した顔ではなく「封緘された顔」が所持に入る。 */
    case "ADD_DRAW_RECORD": {
      const batch = action.batch;
      if (!batch || typeof batch !== "object" || !Array.isArray(batch.records)) return state;
      const proofKey = String(batch.batchHash || batch.commit || "");
      if (!proofKey) return state;
      const proofOnly = action.proofOnly === true;
      if (!proofOnly && state._pendingDrawProofHash !== proofKey) return state;
      const { _pendingDrawProofHash, ...cleanState } = state;
      const draws = Array.isArray(cleanState.draws) ? cleanState.draws : [];
      if (proofKey && draws.some((existing) => String(existing?.batchHash || existing?.commit || "") === proofKey)) {
        return cleanState;
      }
      const next = { ...cleanState, draws: [...draws, batch] };
      const entry = action.entry;
      if (entry?.id) {
        const log = Array.isArray(next.gachaLog) ? next.gachaLog : [];
        if (!log.some((item) => item?.id === entry.id)) {
          next.gachaLog = [...log, entry];
        }
      }
      return next;
    }
    /* 抽選の所持・費用・チケットを通常のUndo履歴へ1つの取引として積む。
       証明本体はこのactionでは保存せず、呼び出し側が別途sealedにする。 */
    case "APPLY_DRAW_BATCH": {
      const batch = action.batch;
      const validation = validateDrawBatchApplication(state, action);
      // UI側も確定直前に同じ検証関数を呼ぶ。reducerで拒否された場合は
      // ticket/ownership/proof/log を部分的に積まないよう、先に失敗理由を共有する。
      if (!validation.ok) return state;
      let next = state;
      const ticketSpend = action.ticketSpend;
      if (ticketSpend) {
        const kind = ticketSpend.kind;
        const pack = kind === "pack" ? String(ticketSpend.pack || "") : null;
        const count = Math.max(0, Math.trunc(Number(ticketSpend.count) || 0));
        next = appendTicketSpend(next, kind, pack, count, {
          kind: "gachaBatch", commit: String(batch.commit || batch.batchHash || "")
        }, action.resultId);
      }
      next = applyDrawBatchEffects(next, batch, action.resultId);
      const proofKey = String(batch.batchHash || batch.commit || "");
      return proofKey ? { ...next, _pendingDrawProofHash: proofKey } : next;
    }
    /* 互換用: 旧呼び出しは経済効果と証明の両方を適用する。Undoでの再生は
       replaySealedAction が ADD_DRAW_RECORD に変換し、証明だけを残す。 */
    case "ADD_DRAW_BATCH": {
      const batch = action.batch;
      if (!batch || typeof batch !== "object" || !Array.isArray(batch.records)) return state;
      const validation = validateDrawBatchApplication(state, action);
      if (!validation.ok) return state;
      let next = state;
      // 旧互換経路でも、検証済みのチケット抽選は消費明細を同じ reducer 遷移内で積む。
      // validation は ticketSpend の種別・枚数・在庫を先に検査するので、
      // ここでチケットを消費し、後段で二重に SPEND_TICKET しない。
      const ticketSpend = action.ticketSpend;
      if (ticketSpend) {
        const pack = ticketSpend.kind === "pack" ? String(ticketSpend.pack || "") : null;
        next = appendTicketSpend(next, ticketSpend.kind, pack, ticketSpend.count,
          { kind: "gachaBatch", commit: String(batch.commit || batch.batchHash || "") }, action.resultId);
      }
      next = applyDrawBatchEffects(next, batch, action.resultId);
      const proofKey = String(batch.batchHash || batch.commit || "");
      const staged = proofKey ? { ...next, _pendingDrawProofHash: proofKey } : next;
      return appReducer(staged, { type: "ADD_DRAW_RECORD", batch, entry: action.entry });
    }
    /* ---- Support ---- */
    /* 装備の入口は所持（roster.supports）を経由する。未所持のものは
       同時に所持へ写してから装備する。所持済みの装備操作は所持を増やさず
       既存の1件を装備し直す（写さずに return すると装備が空振りする）。 */
    case "ADD_SUPPORT": {
      const owned = findOwnedSupport(state, String(action.spp?.name || ""));
      if (owned) return equipRosterSupport(state, owned.uid);
      const added = addRosterSupport(state, action.spp);
      if (!added) return state;
      return equipRosterSupport(added, added.roster.supports[added.roster.supports.length - 1].uid);
    }
    case "REMOVE_SUPPORT": {
      /* 装備の取り外しは equipped を落とすだけ。所持ごと消すと
         「外したら一覧から消えた」= 欠損になる。所持の削除は
         REMOVE_ROSTER_SUPPORT（支出も戻る）が担う。 */
      const roster = state.roster || {};
      const target = (roster.supports || []).find((s) => s.uid === action.id);
      if (!target) return { ...state, supports: (state.supports || []).filter((s) => s.id !== action.id) };
      const supports = (roster.supports || []).map((s) => (s.uid === action.id ? { ...s, equipped: false } : s));
      const next = { ...state, roster: { ...roster, supports } };
      return { ...next, ...projectEquipmentFromRoster(next.roster) };
    }
    case "SET_DEATH_SUPPORT": {
      if (action.spp && !deathSupportSlotUnlocked(state)) return state;
      if (!action.spp) {
        const roster = state.roster || {};
        const supports = (roster.supports || []).map((s) => (
          s.slot === "death" || isDeathSupportPassiveRecord(s) ? { ...s, slot: "death", equipped: false } : s
        ));
        const next = { ...state, roster: { ...roster, supports } };
        return { ...next, ...projectEquipmentFromRoster(next.roster) };
      }
      const requestedName = String(action.spp?.name || "").trim();
      if (!requestedName) {
        // The UI's "manual add" starts with an empty edit form. Keep it as a
        // transient death-slot draft; PATCH_DEATH_SUPPORT will create its roster
        // row as soon as the user enters the first character.
        return {
          ...state,
          deathSupport: {
            id: makeOwnedUid("sppd"),
            name: "",
            cond: String(action.spp?.cond || ""),
            effect: String(action.spp?.effect || ""),
            lp: String(action.spp?.lp || "")
          }
        };
      }
      const owned = findOwnedSupport(state, requestedName);
      if (owned) {
        const roster = state.roster || {};
        const supports = (roster.supports || []).map((entry) => entry.uid === owned.uid
          ? { ...entry, slot: "death", deathSlotManual: !isDeathSupportPassiveRecord(entry) }
          : entry);
        return equipRosterSupport({ ...state, roster: { ...roster, supports } }, owned.uid);
      }
      const added = addRosterSupport(state, { ...action.spp, name: requestedName });
      if (!added) return state;
      const entry = [...added.roster.supports].reverse().find((s) => s.name === requestedName);
      if (!entry) return state;
      // SET_DEATH_SUPPORT is called from the death-only list; custom names must
      // never get classified into a regular slot merely because they are absent
      // from the canonical death-passive catalogue.
      const supports = added.roster.supports.map((s) => s.uid === entry.uid
        ? { ...s, slot: "death", deathSlotManual: !isDeathSupportPassiveRecord(s) } : s);
      return equipRosterSupport({ ...added, roster: { ...added.roster, supports } }, entry.uid);
    }
    case "PATCH_DEATH_SUPPORT": {
      const current = state.deathSupport;
      // Direct reducer callers must obey the same unlock gate as the UI.
      // Otherwise a stale deathSupport object can re-equip its roster row after
      // the final unlock enhancement has been removed.
      if (!current || !deathSupportSlotUnlocked(state)) return state;
      const patch = action.patch && typeof action.patch === "object" && !Array.isArray(action.patch)
        ? action.patch : {};
      const safePatch = {};
      for (const key of ["name", "cond", "effect", "lp"]) {
        if (Object.prototype.hasOwnProperty.call(patch, key)) {
          const value = patch[key];
          safePatch[key] = key === "lp" && typeof value === "number" && Number.isFinite(value)
            ? value : String(value ?? "");
        }
      }
      if (!Object.keys(safePatch).length) return state;
      const edited = { ...current, ...safePatch };
      const roster = state.roster || {};
      const list = Array.isArray(roster.supports) ? roster.supports : [];
      let idx = list.findIndex((entry) => String(entry?.uid || "") === String(current.id || ""));
      if (idx < 0 && current.name) {
        idx = list.findIndex((entry) => entry?.slot === "death" && String(entry?.name || "") === String(current.name));
      }

      // A blank manual-add draft has no owned row until it acquires a name.
      // The very first keystroke creates that row; subsequent keystrokes patch it.
      if (idx < 0 && !String(edited.name || "").trim()) {
        return { ...state, deathSupport: edited };
      }

      let uid;
      let supports;
      if (idx >= 0) {
        uid = list[idx].uid;
        supports = list.map((entry, i) => i === idx
          ? { ...entry, ...safePatch, slot: "death", deathSlotManual: !isDeathSupportPassiveRecord({ ...entry, ...safePatch }), equipped: true }
          : entry);
      } else {
        uid = String(current.id || makeOwnedUid("spt"));
        supports = [...list, {
          uid,
          name: String(edited.name || "").trim(),
          cond: String(edited.cond || ""),
          effect: String(edited.effect || ""),
          lp: String(edited.lp || ""),
          slot: "death",
          deathSlotManual: !isDeathSupportPassiveRecord({ name: String(edited.name || "").trim() }),
          equipped: true,
          resultId: null,
          addedAt: Date.now(),
          notes: "",
          source: "manual"
        }];
      }
      supports = trimSupportEquippedOverflow(supports, uid, "death", supportSlotLimit(state, "death"));
      const nextRoster = { ...roster, supports };
      const next = { ...state, roster: nextRoster, deathSupport: { ...edited, id: uid } };
      // Always re-project from the roster so unrelated reducer actions cannot
      // restore stale death-slot text over the user's edits.
      return { ...next, ...projectEquipmentFromRoster(nextRoster) };
    }
    /* 通常サポートの手動編集。
       装備枠（state.supports）は roster.supports からの投影なので、
       ここだけ直しても次の projectEquipmentFromRoster で消える。
       roster の該当 uid へ書き込み、投影し直す。 */
    case "PATCH_SUPPORT": {
      const roster = state.roster || {};
      const list = roster.supports || [];
      const idx = list.findIndex((s) => s.uid === action.id);
      if (idx < 0) return state;
      const patch = action.patch && typeof action.patch === "object" && !Array.isArray(action.patch)
        ? action.patch : {};
      // UI edits only these text fields. A patch must never mutate ownership IDs,
      // equipment state, result attribution, or slot classification directly.
      const safePatch = {};
      for (const key of ["name", "cond", "effect", "lp"]) {
        if (Object.prototype.hasOwnProperty.call(patch, key)) {
          const value = patch[key];
          // Older reducer callers may send numeric LP; preserve that contract.
          safePatch[key] = key === "lp" && typeof value === "number" && Number.isFinite(value)
            ? value : String(value ?? "");
        }
      }
      if (!Object.keys(safePatch).length) return state;

      const normalizedList = list.map((entry) => ({
        ...entry,
        slot: entry.slot === "death" || isDeathSupportPassiveRecord(entry) ? "death" : "normal"
      }));
      const current = normalizedList[idx];
      const candidate = { ...current, ...safePatch };
      // Editing a normal support into an official death-only catalogue name is
      // rejected while that slot is locked. Once unlocked, classification comes
      // from the catalogue, not caller-supplied slot/equipped properties.
      if (current.slot !== "death" && !isDeathSupportPassiveRecord(current)
        && isDeathSupportPassiveRecord(candidate) && !deathSupportSlotUnlocked(state)) return state;

      const slot = current.slot === "death" || isDeathSupportPassiveRecord(candidate) ? "death" : "normal";
      let supports = normalizedList.map((entry, i) => i === idx
        ? { ...entry, ...safePatch, slot }
        : entry);
      if (slot === "death" && supports[idx].equipped) {
        supports = trimSupportEquippedOverflow(supports, action.id, "death", supportSlotLimit(state, "death"));
      }
      const next = { ...state, roster: { ...roster, supports } };
      return { ...next, ...projectEquipmentFromRoster(next.roster) };
    }
    /* ---- 所持モデル（サポパ・精神）----
       裝備は所持の投影なので、どの操作でも最後に projectEquipmentFromRoster を通す。
       slot は「通常スロット」と「死亡後スロット」の別。同一名称は重複所持しない。 */
    case "ADD_ROSTER_SUPPORT": {
      const spp = action.spp || {};
      const name = String(spp.name || "");
      if (!name) return state;
      const roster = state.roster || {};
      const exists = (roster.supports || []).some((s) => s.name === name);
      if (exists) return state;
      const isDeath = isDeathSupportPassiveRecord({ name });
      /* 購入なら明細と同じ直近リザルトへ。購入でない所持（報酬・取り込み）は
         明細が無いので、指定が無ければ未分類のままにする。 */
      const resultId = action.resultId === undefined
        ? (action.purchase === false ? null : latestResultId(state))
        : action.resultId;
      const entry = {
        uid: makeOwnedUid("spt"),
        name,
        cond: String(spp.cond || ""),
        effect: String(spp.effect || ""),
        lp: String(spp.lp || ""),
        slot: isDeath ? "death" : "normal",
        equipped: false,
        resultId,
        addedAt: Date.now(),
        notes: "",
        source: String(spp.source || catalogSourceByName("support", name))
      };
      const nextRoster = { ...roster, supports: [...(roster.supports || []), entry] };
      const withEquipment = { ...state, roster: nextRoster, ...projectEquipmentFromRoster(nextRoster) };
      /* 所持へ入れた時点で支出として明細を足す（価格はDBから引く）。
         ただし購入として扱われたときだけ。シナリオ報酬や配布で得たパッシブに
         7LP を課すと帳が実際より膨らむ。人格の ADD_ROSTER と同じ契約
         （purchase が false なら明細を立てない）。指定省略は購入とみなす。 */
      if (action.purchase === false) return withEquipment;
      return appendLedgerEntry(withEquipment, {
        kind: entry.slot === "death" ? "deathSupport" : "support",
        name: entry.name,
        cost: priceSupport(entry.name, entry.slot),
        resultId,
        ref: { kind: "rosterSupport", uid: entry.uid }
      });
    }
    /* 硝子窓の所持まるごと取り込み。既存と重複する No は入れ替えない。 */
    case "ADD_ROSTER_PERSONAS_BULK": {
      const incoming = Array.isArray(action.personas) ? action.personas : [];
      if (!incoming.length) return state;
      const roster = state.roster || {};
      const personas = [...(roster.personas || [])];
      const seen = new Set(personas.map((p) => `${p.mode}:${p.no}`));
      let next = state;
      for (const item of incoming) {
        const no = String(item?.no || "");
        const mode = item?.mode === "t" ? "t" : "n";
        const key = `${mode}:${no}`;
        if (!no || seen.has(key)) continue;
        seen.add(key);
        personas.push({
          uid: makeOwnedUid("pr"),
          no,
          mode,
          syncRank: ["0", "00", "000"].includes(String(item?.syncRank || "")) ? String(item.syncRank) : null,
          syncMax: item?.syncMax === true,
          lcb: item?.lcb === true,
          equipped: false,
          resultId: null,
          addedAt: Date.now(),
          notes: ""
        });
      }
      if (personas.length === (roster.personas || []).length) return state;
      /* 取り込んだ人格は人格入手なので、通帳には明細を立てない。
         DB に人格の価格が無いため、推測の費用を足すと残高を狂わせる。 */
      return { ...state, roster: { ...roster, personas } };
    }
    case "REMOVE_ROSTER_SUPPORT": {
      const roster = state.roster || {};
      if (!(roster.supports || []).some((s) => s.uid === action.uid)) return state;
      const supports = (roster.supports || []).filter((s) => s.uid !== action.uid);
      const nextRoster = { ...roster, supports };
      const next = { ...state, roster: nextRoster, ...projectEquipmentFromRoster(nextRoster) };
      /* 所持から外したサポパは支出も戻す（残高を狂わせない）。 */
      return dropLedgerEntriesForRef(next, { kind: "rosterSupport", uid: action.uid });
    }
    case "REMOVE_ROSTER_SUPPORT_BATCH": {
      const ids = new Set(action.uids || []);
      const roster = state.roster || {};
      const supports = (roster.supports || []).filter((s) => !ids.has(s.uid));
      const nextRoster = { ...roster, supports };
      const next = { ...state, roster: nextRoster, ...projectEquipmentFromRoster(nextRoster) };
      return dropLedgerEntriesForRefs(next, "rosterSupport", ids);
    }
    /* 装備は「外す」と「付ける」の2方向。通常スロットは最大2、死亡後は1。
       上限を超える指定は既存の装備を外してから付ける（置き換え）。 */
    case "SET_ROSTER_SUPPORT_EQUIPPED": {
      const roster = state.roster || {};
      const target = (roster.supports || []).find((s) => s.uid === action.uid);
      if (!target) return state;
      const equip = action.equipped !== false;
      // The canonical death-passive catalogue takes precedence over a stale or
      // forged slot field. This prevents relabeling a death-only passive as normal.
      const deathOnly = target.slot === "death" || isDeathSupportPassiveRecord(target);
      const slot = deathOnly ? "death" : target.slot;
      if (equip && deathOnly && !deathSupportSlotUnlocked(state)) return state;
      const limit = supportSlotLimit(state, slot);
      let supports = (roster.supports || []).map((s) => (
        s.uid === action.uid ? { ...s, slot, equipped: equip } : s
      ));
      if (equip) {
        supports = trimSupportEquippedOverflow(supports, action.uid, slot, limit);
      }
      const nextRoster = { ...roster, supports };
      return { ...state, roster: nextRoster, ...projectEquipmentFromRoster(nextRoster) };
    }
    /* 枠の変更。移動先が埋まっている場合は、先に入っていたものを外す。
       上限は移動先の slot で決まる（通常2 / 死亡後1）。 */
    case "SET_ROSTER_SUPPORT_SLOT": {
      const roster = state.roster || {};
      const target = (roster.supports || []).find((s) => s.uid === action.uid);
      if (!target) return state;
      const slot = action.slot === "death" ? "death" : "normal";
      const deathOnly = isDeathSupportPassiveRecord(target)
        || (target.slot === "death" && target.deathSlotManual !== true);
      // Canonical death-only passives and untrusted legacy death labels cannot be
      // demoted. A slot explicitly assigned by the user can still be moved back.
      if (deathOnly && slot !== "death") return state;
      if (target.slot === slot) return state;
      if (slot === "death" && !deathSupportSlotUnlocked(state)) return state;
      const limit = supportSlotLimit(state, slot);
      const others = (roster.supports || []).filter((s) => s.uid !== action.uid && s.slot === slot && s.equipped);
      const occupantUids = new Set(others.slice(0, Math.max(0, others.length + 1 - limit)).map((s) => s.uid));
      const supports = (roster.supports || []).map((s) => {
        if (s.uid === action.uid) return {
          ...s,
          slot,
          deathSlotManual: slot === "death" && !isDeathSupportPassiveRecord(s),
          equipped: true
        };
        if (occupantUids.has(s.uid)) return { ...s, equipped: false };
        return s;
      });
      const nextRoster = { ...roster, supports };
      return { ...state, roster: nextRoster, ...projectEquipmentFromRoster(nextRoster) };
    }
    case "SET_ROSTER_SUPPORT_RESULT": {
      const roster = state.roster || {};
      const supports = (roster.supports || []).map((s) => (
        s.uid === action.uid ? { ...s, resultId: action.resultId || null } : s
      ));
      if (!(roster.supports || []).some((s) => s.uid === action.uid)) return state;
      return { ...state, roster: { ...roster, supports } };
    }
    case "ADD_ROSTER_SPIRIT": {
      const name = String(action.spirit?.name || "");
      if (!name) return state;
      const roster = state.roster || {};
      if ((roster.spirits || []).some((s) => s.name === name)) return state;
      const resultId = action.resultId === undefined
        ? (action.purchase === false ? null : latestResultId(state))
        : action.resultId;
      const entry = {
        uid: makeOwnedUid("spr"),
        name,
        equipped: false,
        resultId,
        addedAt: Date.now(),
        notes: "",
        source: String(action.spirit?.source || catalogSourceByName("spirit", name))
      };
      const nextRoster = { ...roster, spirits: [...(roster.spirits || []), entry] };
      const withEquipment = { ...state, roster: nextRoster, ...projectEquipmentFromRoster(nextRoster) };
      /* 精神は欠片で買う。価格はDBから引く。報酬・所持の取り込みは
         購入ではないので、サポパと同じく purchase:false で明細を立てない。 */
      if (action.purchase === false) return withEquipment;
      return appendLedgerEntry(withEquipment, {
        kind: "spirit",
        name: entry.name,
        cost: priceSpirit(entry.name),
        resultId,
        ref: { kind: "rosterSpirit", uid: entry.uid }
      });
    }
    /* 強化の購入。欠片の価格は DB 定義の shards を引く。 */
    case "ADD_ENHANCEMENT": {
      const group = String(action.group || "");
      const name = String(action.name || "");
      if (!name) return state;
      const current = state.enhancements || [];
      if (current.some((e) => e.name === name && e.group === group)) return state;
      const entry = {
        id: makeOwnedUid("enh"),
        group,
        name,
        effect: String(action.effect || ""),
        shards: priceEnhancement(group, name).shards,
        category: String(action.category || "")
      };
      const next = { ...state, enhancements: [...current, entry] };
      return appendLedgerEntry(next, {
        kind: "enhancement",
        name,
        cost: { shards: entry.shards },
        resultId: action.resultId,
        ref: { kind: "enhancement", uid: entry.id }
      });
    }
    case "REMOVE_ENHANCEMENT": {
      const target = (state.enhancements || []).find((e) => e.id === action.id);
      if (!target) return state;
      const next = { ...state, enhancements: (state.enhancements || []).filter((e) => e.id !== action.id) };
      let nextState = next;
      // Removing the last unlock must not leave a death-only passive active in a locked slot.
      if (deathSupportSlotUnlocked(state) && !deathSupportSlotUnlocked(next)) {
        const roster = next.roster || {};
        const supports = (roster.supports || []).map((entry) => (
          entry.slot === "death" || isDeathSupportPassiveRecord(entry)
            ? { ...entry, slot: "death", equipped: false }
            : entry
        ));
        const nextRoster = { ...roster, supports };
        nextState = { ...next, roster: nextRoster, ...projectEquipmentFromRoster(nextRoster) };
      }
      /* 強化を外したら支出も戻す（残高を狂わせない）。 */
      return dropLedgerEntriesForRef(nextState, { kind: "enhancement", uid: action.id });
    }
    /* 所持から外したサポパ・精神は支出も戻す。 */
    case "REMOVE_ROSTER_SPIRIT": {
      const roster = state.roster || {};
      if (!(roster.spirits || []).some((s) => s.uid === action.uid)) return state;
      const spirits = (roster.spirits || []).filter((s) => s.uid !== action.uid);
      const nextRoster = { ...roster, spirits };
      const next = { ...state, roster: nextRoster, ...projectEquipmentFromRoster(nextRoster) };
      /* 所持から外した精神は支出も戻す。 */
      return dropLedgerEntriesForRef(next, { kind: "rosterSpirit", uid: action.uid });
    }
    case "REMOVE_ROSTER_SPIRIT_BATCH": {
      const ids = new Set(action.uids || []);
      const roster = state.roster || {};
      const spirits = (roster.spirits || []).filter((s) => !ids.has(s.uid));
      const nextRoster = { ...roster, spirits };
      const next = { ...state, roster: nextRoster, ...projectEquipmentFromRoster(nextRoster) };
      return dropLedgerEntriesForRefs(next, "rosterSpirit", ids);
    }
    /* ---- 通帳（リザルトと収支明細）---- 残高は保存しない。収入合計から支出合計を引くだけなので、帰属を直せばリザルトごとに収支が説明できる。 */
    /* 複数まとめての所持追加。一括抽出のように同じ手つきで何件も入る操作で
       は、1回ごとに dispatch すると前の更新が次の書き込みで上書きされる。
       まとめて1つの action としてphal 同じ state に対して積む。 */
    /* 抽選の決定記録。支払いも取得物も通常どおりUndoで巻き戻るが、
       「この抽選で何が出たか」は_account ごとに永久に残る。
       後から追記されるだけなので、同じ id が二重に生まれないよう弾く。 */
    case "ADD_GACHA_LOG": {
      const entry = action.entry || null;
      if (!entry || !entry.id) return state;
      const log = Array.isArray(state.gachaLog) ? state.gachaLog : [];
      if (log.some((e) => e && e.id === entry.id)) return state;
      return { ...state, gachaLog: [...log, entry] };
    }
    case "ADD_ROSTER_MANY": {
      return applyRosterAdds(state, Array.isArray(action.adds) ? action.adds : [], { cost: action.cost, resultId: action.resultId });
    }
    /* 既存リザルトの登録情報の書き換え。収入を差し替えるので、
       抽出チケットの残数はここから読み直す（明細側は変えない）。 */
    case "UPDATE_RESULT": {
      const id = action.id;
      const now = Date.now();
      let hit = false;
      const results = (state.results || []).map((r) => {
        if (r.id !== id) return r;
        hit = true;
        return {
          ...r,
          name: action.name === undefined ? r.name : String(action.name).slice(0, 80),
          date: action.date === undefined ? r.date : String(action.date).slice(0, 10),
          income: action.income === undefined
            ? r.income
            : { ...normalizeCurrency(action.income), tickets: normalizeTickets(action.income?.tickets) },
          ...(action.note !== undefined ? { note: String(action.note || "").slice(0, 2000) } : {}),
          ...(action.consumedItems !== undefined ? { consumedItems: normalizeConsumedItems(action.consumedItems) } : {}),
          ...(action.importSourceKey !== undefined
            ? (String(action.importSourceKey || "").trim()
              ? { importSourceKey: String(action.importSourceKey).slice(0, 180) }
              : {})
            : {}),
          updatedAt: now
        };
      });
      return hit ? { ...state, results } : state;
    }
    case "ADD_RESULT": {
      const now = Date.now();
      return {
        ...state,
        results: [...(state.results || []), {
          id: makeOwnedUid("res"),
          name: String(action.name || "").slice(0, 80) || "無題",
          date: String(action.date || localDateString()).slice(0, 10),
          income: { ...normalizeCurrency(action.income), tickets: normalizeTickets(action.income?.tickets) },
          note: String(action.note || "").slice(0, 2000),
          consumedItems: normalizeConsumedItems(action.consumedItems),
          ...(String(action.importSourceKey || "").trim()
            ? { importSourceKey: String(action.importSourceKey).slice(0, 180) }
            : {}),
          createdAt: now,
          updatedAt: now
        }]
      };
    }
    case "PATCH_RESULT":
      return {
        ...state,
        results: (state.results || []).map((r) => (r.id === action.id
          ? {
              ...r,
              ...(action.patch?.name !== void 0 ? { name: String(action.patch.name).slice(0, 80) } : {}),
              ...(action.patch?.date !== void 0 ? { date: String(action.patch.date).slice(0, 10) } : {}),
              ...(action.patch?.note !== void 0 ? { note: String(action.patch.note).slice(0, 2000) } : {}),
              ...(action.patch?.income !== void 0 ? { income: { ...normalizeCurrency(action.patch.income), tickets: normalizeTickets(action.patch.income?.tickets) } } : {}),
              updatedAt: Date.now()
            }
          : r))
      };
    /* リザルトを消したら、そのリザルトに紐づく明細も消す。
       かつ未分類へ戻すと、削除した支出が別の予算に紛れ込んで
       「消したのにまだ残っている」ように見える。削除なら削除。 */
    case "REMOVE_RESULT":
      return {
        ...state,
        results: (state.results || []).filter((r) => r.id !== action.id),
        entries: (state.entries || []).filter((e) => e.resultId !== action.id)
      };
    
/* 取り込みは 1 手で終わらせる。複数の action を順に適用し、明細をどの
     リザルトへ帰属させるかをこの中で解決する。利用者からは UNDO 1 回で全部戻る。
     所持の action はシナリオのリザルトより前に並ぶため、先に全リザルトを作って
     シナリオ名 → リザルト id の索引を引き、via（どのシナリオの記載か）の名前で
     引き当てる。引けない・同名が複数なら未分類(null)のまま、勝手に決めない。
     ADD_ENTRY は従来どおり直前の ADD_RESULT に帰属する（位置契約）。 */
    case "APPLY_IMPORT_BATCH": {
      let next = state;
      /* 自由メモの購入は resultId:null の未分類明細だが、共有元単位で再構築する。
         専用の provenance prefix が付いた行だけを消し、手入力や別URLの行には触れない。 */
      const refreshFreeNoteSourceIds = new Set((action.actions || [])
        .filter((sub) => sub && sub.type === "REFRESH_GARASUMADO_FREE_NOTES")
        .map((sub) => String(sub.sourceId || "").trim())
        .filter((sourceId) => /^[A-Za-z0-9_-]{6,}$/.test(sourceId)));
      if (refreshFreeNoteSourceIds.size) {
        const existingEntries = Array.isArray(next.entries) ? next.entries : [];
        const entries = existingEntries.filter((entry) => {
          const key = String(entry && entry.importResultKey || "");
          for (const sourceId of refreshFreeNoteSourceIds) {
            if (key.startsWith("gara-free:" + sourceId + ":")) return false;
          }
          return true;
        });
        if (entries.length !== existingEntries.length) next = { ...next, entries };
      }
      /* 配列位置と対応させるため、追加／更新の成否に関わらず ADD_RESULT ごとに枠を持つ。 */
      const resultIds = [];
      const resultSourceKeys = [];
      const resultIdByName = new Map();
      const claimedLegacyResultIds = new Set();
      for (const sub of action.actions || []) {
        if (!sub || typeof sub !== "object" || sub.type !== "ADD_RESULT") continue;
        const sourceKey = String(sub.importSourceKey || "").trim().slice(0, 180);
        const matchingBySource = sourceKey
          ? (next.results || []).filter((result) => result && result.importSourceKey === sourceKey)
          : [];
        /* 自動上書きは安定した共有元キーが1件だけ一致した場合に限る。重複キーは推測で選ばない。 */
        if (matchingBySource.length > 1) {
          resultIds.push(null);
          resultSourceKeys.push(sourceKey);
          continue;
        }
        let target = matchingBySource.length === 1 ? matchingBySource[0] : null;
        const legacyId = String(sub.legacyResultId || "").trim();
        if (!target && !matchingBySource.length && legacyId && !claimedLegacyResultIds.has(legacyId)) {
          /* 旧形式には出典キーがない。UIで利用者が選んだ、かつ未タグの記録だけを移行できる。 */
          target = (next.results || []).find((result) => result && result.id === legacyId
            && !String(result.importSourceKey || "").trim()) || null;
        }
        let added = null;
        if (target) {
          const isExplicitLegacyReplace = Boolean(
            legacyId && sub.replaceLegacyEntries === true && target.id === legacyId && !matchingBySource.length
          );
          const existingEntries = Array.isArray(next.entries) ? next.entries : [];
          const entries = isExplicitLegacyReplace
            ? existingEntries.filter((entry) => entry?.resultId !== target.id)
            : (sourceKey
              ? existingEntries.filter((entry) => entry?.importResultKey !== sourceKey)
              : existingEntries);
          if (entries !== existingEntries) next = { ...next, entries };
          next = appReducer(next, {
            type: "UPDATE_RESULT",
            id: target.id,
            name: sub.name,
            date: sub.date,
            income: sub.income,
            note: sub.note,
            consumedItems: sub.consumedItems,
            ...(sourceKey ? { importSourceKey: sourceKey } : {})
          });
          added = (next.results || []).find((result) => result && result.id === target.id) || null;
          if (legacyId && target.id === legacyId) claimedLegacyResultIds.add(legacyId);
        } else {
          next = appReducer(next, sub);
          added = (next.results || [])[next.results.length - 1] || null;
        }
        resultIds.push(added?.id || null);
        resultSourceKeys.push(sourceKey || String(added?.importSourceKey || ""));
        if (added) {
          const key = String(added.name || "");
          resultIdByName.set(key, [...(resultIdByName.get(key) || []), added.id]);
        }
      }
      let lastResultId = null;
      let lastResultSourceKey = "";
      let resultIndex = 0;
      for (const sub of action.actions || []) {
        if (!sub || typeof sub !== "object") continue;
        if (sub.type === "REFRESH_GARASUMADO_FREE_NOTES") continue;
        if (sub.type === "ADD_RESULT") {
          lastResultId = resultIds[resultIndex] || null;
          lastResultSourceKey = resultSourceKeys[resultIndex] || "";
          resultIndex += 1;
          continue;
        }
        /* undefined だけが「直前に倒す」。null は明示的な未分類なので触らない。 */
        if (sub.type === "ADD_ENTRY" && lastResultId && sub.resultId === undefined) {
          next = appReducer(next, {
            ...sub,
            resultId: lastResultId,
            ...(lastResultSourceKey ? { importResultKey: lastResultSourceKey } : {})
          });
          continue;
        }
        /* 過去のテキスト記録から再生する消費は、その行が属するリザルトへ保存する。 */
        if (sub.type === "CONSUME_ITEM" && lastResultId && sub.resultId === undefined) {
          next = appReducer(next, { ...sub, resultId: lastResultId });
          continue;
        }
        /* Historical result text can explicitly say a ticket was used. Attribute
           its spend row to that result, preserving the account-wide ticket balance. */
        if (sub.type === "SPEND_TICKET" && lastResultId && sub.resultId === undefined) {
          next = appReducer(next, { ...sub, resultId: lastResultId });
          continue;
        }
        const rosterSub = sub.type === "ADD_ROSTER" || sub.type === "ADD_ROSTER_EGO"
          || sub.type === "ADD_CUSTOM_ROSTER_EGO" || sub.type === "ADD_ROSTER_SUPPORT" || sub.type === "ADD_ROSTER_SPIRIT";
        if (rosterSub && sub.resultId === undefined && (resultIds.length > 0 || sub.unclassified === true)) {
          /* 取込アクションの公開契約では resultId を直接持たせない。
             unclassified=true の項目は、既存の直近リザルトへ誤帰属させず、ここでのみ null に解決する。 */
          let target = null;
          const viaNames = (Array.isArray(sub.via) ? sub.via : []).filter(Boolean);
          if (sub.unclassified !== true) {
            if (viaNames.length) {
              const ids = new Set();
              for (const viaName of viaNames) {
                for (const id of resultIdByName.get(String(viaName)) || []) ids.add(id);
              }
              target = ids.size === 1 ? [...ids][0] : null;
            } else {
              target = lastResultId;
            }
          }
          const { unclassified: _unclassified, ...rosterAction } = sub;
          next = appReducer(next, { ...rosterAction, resultId: target });
          continue;
        }
        /* 同期化・解析は「名前」で指定できる。uid は reducer が生成する
           ので、取り込み側からは (-> 名前) で解決する。解決できなかった
           ものは黙って捨てる（推測で他的人格へ当てない）。 */
        if (sub.type === "APPLY_PERSONA_SYNC" || sub.type === "APPLY_EGO_ANALYZE") {
          const resolved = sub.type === "APPLY_PERSONA_SYNC"
            ? (next.roster.personas || []).find((p) => personaDbName(p) === String(sub.personaName || ""))
            : (next.roster.egos || []).find((e) => egoDbName(e) === String(sub.egoName || ""));
          if (!resolved) continue;
          next = appReducer(next, { ...sub, uid: resolved.uid, resultId: sub.resultId === undefined ? lastResultId : sub.resultId });
          continue;
        }
        const applied = appReducer(next, sub);
        /* 未知の action は state を返さない。その場合は取り込み前の値に戻す。 */
        next = applied && applied.roster ? applied : next;
      }
      return next;
    }

case "ADD_ENTRY":
      return {
        ...state,
        entries: [...(state.entries || []), {
          id: makeOwnedUid("ent"),
          kind: String(action.kind || "other"),
          name: String(action.name || "").slice(0, 120),
          cost: normalizeCurrency(action.cost),
          /* 抽出チケットの消費明細。残数は全リザルトの収入からこの明細を差し引く。 */
          tickets: normalizeTickets(action.tickets),
          resultId: action.resultId || null,
          ref: action.ref && typeof action.ref === "object" ? {
            kind: String(action.ref.kind || ""),
            uid: String(action.ref.uid || ""),
            ...(String(action.ref.kind || "") === "gachaBatch" && action.ref.commit
              ? { commit: String(action.ref.commit).slice(0, 160) } : {})
          } : null,
          at: Number(action.at) || Date.now(),
          note: String(action.note || "").slice(0, 2000),
          ...(String(action.importResultKey || "").trim()
            ? { importResultKey: String(action.importResultKey).slice(0, 180) }
            : {})
        }]
      };
    case "PATCH_ENTRY":
      return {
        ...state,
        entries: (state.entries || []).map((e) => (e.id === action.id
          ? {
              ...e,
              ...(action.patch?.name !== void 0 ? { name: String(action.patch.name).slice(0, 120) } : {}),
              ...(action.patch?.cost !== void 0 ? { cost: normalizeCurrency(action.patch.cost) } : {}),
              ...(action.patch?.tickets !== void 0 ? { tickets: normalizeTickets(action.patch.tickets) } : {}),
              ...(action.patch?.resultId !== void 0 ? { resultId: action.patch.resultId || null } : {}),
              ...(action.patch?.note !== void 0 ? { note: String(action.patch.note).slice(0, 2000) } : {})
            }
          : e))
      };
    /* 帰属の差し替え。ドラッグ&ドロップはこの1つだけを呼ぶ。 */
    case "SET_ENTRY_RESULT": {
      const target = (state.entries || []).find((e) => e.id === action.id);
      if (!target) return state;
      const resultId = action.resultId || null;
      const entries = state.entries.map((e) => (e.id === action.id ? { ...e, resultId } : e));
      /* 所持レコードにも帰属を持つもの（サポパ・精神）は、通帳側の
         付け替えに合わせる。片方だけ動くと、同じ購入が別のリザルトを
         指しているように見える。 */
      let roster = state.roster;
      if (target.ref?.kind === "rosterSupport" && roster?.supports) {
        roster = { ...roster, supports: roster.supports.map((s) => (s.uid === target.ref.uid ? { ...s, resultId } : s)) };
      } else if (target.ref?.kind === "rosterSpirit" && roster?.spirits) {
        roster = { ...roster, spirits: roster.spirits.map((s) => (s.uid === target.ref.uid ? { ...s, resultId } : s)) };
      }
      return roster === state.roster ? { ...state, entries } : { ...state, entries, roster };
    }
  case "PURGE_ENTRY":
    if (!(state.entries || []).some((e) => e.id === action.id)) return state;
    return { ...state, entries: (state.entries || []).filter((e) => e.id !== action.id) };
  case "REMOVE_ENTRY":
      if (!(state.entries || []).some((e) => e.id === action.id)) return state;
      return { ...state, entries: (state.entries || []).filter((e) => e.id !== action.id) };
    case "SET_ROSTER_SPIRIT_RESULT": {
      const roster = state.roster || {};
      if (!(roster.spirits || []).some((s) => s.uid === action.uid)) return state;
      const spirits = (roster.spirits || []).map((s) => (
        s.uid === action.uid ? { ...s, resultId: action.resultId || null } : s
      ));
      return { ...state, roster: { ...roster, spirits } };
    }
    /* 精神の装備は常に1件。他を全部外してから対象だけを装備する。 */
    case "SET_ROSTER_SPIRIT_EQUIPPED": {
      const roster = state.roster || {};
      if (!(roster.spirits || []).some((s) => s.uid === action.uid)) return state;
      const equip = action.equipped !== false;
      const spirits = (roster.spirits || []).map((s) => ({ ...s, equipped: equip && s.uid === action.uid }));
      const nextRoster = { ...roster, spirits };
      return { ...state, roster: nextRoster, ...projectEquipmentFromRoster(nextRoster) };
    }
    /* ---- Unique buffs ---- */
    case "ADD_UB":
      // 手動新規の既定種別は "バフ"（DB実測の最大多数かつ中立でない通常種別）。
      // "固有バフ" はDB人格由来の語であり、手動新規の既定にするとセレクトの初期表示と
      // 齟齬して「固定バフ内の固定バフがdefault」に見える原因になるため使用しない。
      // 既存保存データの type は変更しない（非破壊・後方互換）。
      //
      // id は既存と衝突させない。同一ミリ秒に連続で追加すると `ub-<時刻>` が重複し、
      // id で引く編集・削除・並べ替えが別のカードへ当たる（実測: 2枚が同時に書き換わった）。
      return { ...state, uniqueBuffs: [...state.uniqueBuffs, {
        id: nextUniqueBuffId(state.uniqueBuffs),
        name: "",
        type: "\u30D0\u30D5",
        max: 20,
        desc: "",
        place: "status"
        // v49+: 'status'=ST側 / 'params'=ラベル側 (v45互換)
      }] };
    case "PATCH_UB": {
      const next = { ...state, uniqueBuffs: state.uniqueBuffs.map((b) => b.id === action.id ? { ...b, ...action.patch, name: action.patch?.name !== void 0 ? normalizeStatusLabel(action.patch.name) : b.name } : b) };
      return normalizeStatusCollections(next);
    }
    case "REMOVE_UB":
      return normalizeStatusCollections({ ...state, uniqueBuffs: state.uniqueBuffs.filter((b) => b.id !== action.id) });
    /* ---- Reorder generic list (move item up/down) ---- */
    case "REORDER_LIST": {
      const list = state[action.field];
      if (!Array.isArray(list)) return state;
      const i = list.findIndex((x) => (x.id || x.name || x.label) === action.key);
      if (i < 0) return state;
      const dir = action.dir;
      const j = i + dir;
      if (j < 0 || j >= list.length) return state;
      const copy = list.slice();
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return { ...state, [action.field]: copy };
    }
    case "REORDER_DEFAULT_STATUS": {
      const list = (state.defaultStatuses || []).slice();
      const i = action.from, j = action.to;
      if (i < 0 || j < 0 || i >= list.length || j >= list.length) return state;
      const [item] = list.splice(i, 1);
      list.splice(j, 0, item);
      return { ...state, defaultStatuses: list };
    }
    /* v50: 汎用 index-based 並び替え (D&D 用) */
    case "MOVE_LIST_INDEX": {
      const list = state[action.field];
      if (!Array.isArray(list)) return state;
      const { from, to } = action;
      if (from < 0 || from >= list.length || to < 0 || to >= list.length) return state;
      const copy = list.slice();
      const [item] = copy.splice(from, 1);
      copy.splice(to, 0, item);
      return { ...state, [action.field]: copy };
    }
    /* ---- Custom persona/skill for user-created data ---- */
    case "EQUIP_CUSTOM_PERSONA": {
      const personaNo = makeOwnedUid("custom");
      const personaSrc = {
        name: action.name || "\u30AB\u30B9\u30BF\u30E0\u4EBA\u683C",
        no: 999,
        hp: 100,
        san: 45,
        speed: "1d5",
        res_slash: "\u666E\u901A",
        res_pierce: "\u666E\u901A",
        res_blunt: "\u666E\u901A",
        bullets: "\xD7",
        passive_name: "",
        passive_cond: "",
        passive_always: "",
        passive_effect: "",
        skills: [],
        unique_buffs: [],
        extra_passives: [],
        keywords: [],
        __custom: true
      };
      // Preserve the previous equipped build before starting a new custom draft.
      let personas = (state.roster?.personas || []).slice();
      const currentBuild = createPersonaBuildSnapshot(state);
      if (state.personaMode != null && state.personaNo != null && currentBuild) {
        const currentIndex = personas.findIndex((entry) => entry.mode === state.personaMode
          && String(entry.no) === String(state.personaNo));
        if (currentIndex >= 0) personas[currentIndex] = { ...personas[currentIndex], build: currentBuild };
      }
      // A new draft has no owned roster row yet, so no existing Persona should
      // remain marked equipped while the active identity points at this draft.
      personas = personas.map((entry) => ({ ...entry, equipped: false }));
      const roster = {
        ...state.roster,
        personas,
        supports: (state.roster?.supports || []).map((entry) => ({ ...entry, equipped: false })),
        spirits: (state.roster?.spirits || []).map((entry) => ({ ...entry, equipped: false }))
      };
      const emptyEgoSlots = { ZAYIN: null, TETH: null, HE: null, WAW: null, ALEPH: null };
      return normalizeStatusCollections({
        ...state,
        // Inventory is owned by the character/account, not by the equipped Persona.
        inventory: state.inventory,
        personaMode: "custom",
        personaNo,
        personaSrc,
        syncedManual: false,
        spirit: "",
        spiritMorale: "",
        spiritConfuse: "",
        spiritAlways: "",
        supports: [],
        deathSupport: null,
        egoSlots: emptyEgoSlots,
        egoManual: false,
        enhancements: [],
        formulas: [],
        customStatuses: [],
        defaultStatuses: cloneJSON(getFactoryDefaultStatuses()),
        selfStatusCandidates: [],
        pas2Enabled: false,
        pas2: { name: "", cond: "", always: "", effect: "" },
        extraPassives: [],
        hp: "100",
        san: "45",
        speed: "1d5",
        initiative: 0,
        bullets: "\xD7",
        resS: "\u666E\u901A",
        resP: "\u666E\u901A",
        resB: "\u666E\u901A",
        pas: { name: "", cond: "", always: "", effect: "", quick: "" },
        skills: [],
        uniqueBuffs: [],
        roster,
        charName: state.charName
      });
    }
    /* V65r29: Google Docs 等の同期人格草案を、確認済みのカスタム人格として装備する。
       解析器は UI 側でプレビュー済み。既存データを置換せず、元の所持人格は保持する。 */
    /* 硝子窓の公開人格URLから、所持人格ライブラリへ複数人格を個別登録する。
       IMPORT_PERSONA_DRAFT と違い、現在装備中の人格・ビルド・装備状態は変更しない。
       入力は公開人格パーサーが名前・ステータス・戦術・パッシブ・固有だけに絞った値。 */
    case "ADD_GARASUMADO_PERSONA": {
      const source = action.source && typeof action.source === "object" ? action.source : {};
      const sourceId = String(source.id || "").trim();
      const sourceUrl = String(source.url || "").trim();
      const persona = action.persona;
      if (!sourceId || !sourceUrl || !persona || typeof persona !== "object"
        || persona.__custom !== true || !String(persona.name || "").trim()
        || !Array.isArray(persona.skills) || !persona.skills.length
        || !Number.isSafeInteger(Number(persona.hp)) || Number(persona.hp) <= 0
        || !Number.isSafeInteger(Number(persona.san)) || Number(persona.san) <= 0
        || !String(persona.speed || "").trim()) return state;

      const roster = state.roster || {};
      const existingPersonas = Array.isArray(roster.personas) ? roster.personas : [];
      /* 同じ共有ドキュメントを再度貼っても二重登録しない。別URLの同名人格は
         別バージョンの可能性があるため、名前だけで自動統合・上書きはしない。 */
      if (existingPersonas.some((entry) => entry?.importSource?.kind === "garasumado-persona"
        && String(entry.importSource.id || "") === sourceId)) return state;

      let uid = makeOwnedUid("custom");
      while (existingPersonas.some((entry) => entry?.mode === "custom"
        && (String(entry.uid || "") === uid || String(entry.no || "") === uid))) {
        uid = makeOwnedUid("custom");
      }
      const importedSource = {
        ...cloneJSON(persona),
        no: 999,
        __custom: true,
        __draftImported: true
      };
      const skills = migrateLegacyDerivedSkills((importedSource.skills || []).map((skill, index) => ({
        ...skill,
        id: skill?.id || `sk-${uid}-${index + 1}`,
        rank: skill?.rank || `スキル${index}`,
        derived_from: skill?.derived_from || "",
        derived_index: skill?.derived_index,
        derived_condition: skill?.derived_condition || "",
        type: skill?.type || "",
        sin: skill?.sin || "",
        aoe: skill?.aoe || "",
        aoeCount: skill?.aoeCount || "",
        name: skill?.name || "",
        effect: skill?.effect || "",
        dice: (skill?.dice || []).map((die) => ({
          ...die,
          roll: die?.roll || "",
          dval: die?.dval ?? die?.d ?? "",
          d: die?.d ?? die?.dval ?? "",
          dPlus: !!(die?.dPlus ?? die?.plus),
          dCnt: !!die?.dCnt,
          plus: !!(die?.plus ?? die?.dPlus),
          effect: die?.effect || ""
        })),
        quick: ""
      })));
      const uniqueBuffs = (importedSource.unique_buffs || []).map((buff, index) => ({
        id: `ub-${uid}-${index + 1}`,
        name: normalizeStatusLabel(buff?.name || ""),
        type: buff?.type || "バフ",
        initial: buff?.initial !== undefined ? buff.initial : 0,
        max: buff?.max !== undefined ? buff.max : 20,
        desc: buff?.desc || "",
        place: buff?.place || "status",
        noST: buff?.noST === true
      }));
      const secondary = action.secondaryPassive && typeof action.secondaryPassive === "object"
        ? action.secondaryPassive : null;
      const extraPassives = secondary && String(secondary.name || "").trim() ? [{
        id: `pas-import-${uid}-2`,
        name: String(secondary.name || ""),
        cond: String(secondary.cond || ""),
        always: String(secondary.always || ""),
        effect: String(secondary.effect || ""),
        quick: ""
      }] : [];
      const emptyEgoSlots = { ZAYIN: null, TETH: null, HE: null, WAW: null, ALEPH: null };
      const defaultStatuses = getFactoryDefaultStatuses() || [];
      const selfStatusEntries = collectSelfManagedStatusEntries(importedSource);
      const importedDefaultStatuses = mergeDefaultSelfStatusEntries(defaultStatuses, selfStatusEntries);
      const importedSelfStatusCandidates = detectSelfStatusCandidates(importedSource, [
        ...defaultStatuses.map((item) => item?.label),
        ...selfStatusEntries.map((entry) => entry.label)
      ]);
      const sourceStatus = {
        hp: String(importedSource.hp),
        san: String(importedSource.san),
        speed: String(importedSource.speed),
        bullets: String(importedSource.bullets || "×"),
        resS: String(importedSource.res_slash || "普通"),
        resP: String(importedSource.res_pierce || "普通"),
        resB: String(importedSource.res_blunt || "普通")
      };
      const build = {
        savedAt: Date.now(),
        ...sourceStatus,
        initiative: 0,
        spirit: "",
        spiritMorale: "",
        spiritConfuse: "",
        spiritAlways: "",
        supports: [],
        deathSupport: null,
        egoSlots: cloneJSON(emptyEgoSlots),
        egoManual: false,
        enhancements: [],
        formulas: [],
        customStatuses: [],
        equipmentRefs: { supportUids: [], spiritUid: null },
        pas: {
          name: importedSource.passive_name || "",
          cond: importedSource.passive_cond || "",
          always: importedSource.passive_always || "",
          effect: importedSource.passive_effect || "",
          quick: ""
        },
        extraPassives,
        pas2Enabled: false,
        pas2: { name: "", cond: "", always: "", effect: "" },
        skills,
        uniqueBuffs,
        personaSrc: cloneJSON(importedSource),
        syncedManual: true,
        defaultStatuses: importedDefaultStatuses,
        selfStatusCandidates: importedSelfStatusCandidates
      };
      const entry = {
        uid,
        no: uid,
        mode: "custom",
        src: cloneJSON(importedSource),
        build,
        syncRank: ["0", "00", "000"].includes(String(action.syncRank || "")) ? String(action.syncRank) : null,
        syncMax: action.syncMax === true,
        lcb: false,
        equipped: false,
        notes: "",
        importSource: {
          kind: "garasumado-persona",
          id: sourceId,
          url: sourceUrl,
          label: String(source.label || importedSource.name || "").slice(0, 180),
          ...(source.extras && typeof source.extras === "object" && !Array.isArray(source.extras)
            ? { metadata: cloneJSON(source.extras) }
            : {}),
          importedAt: Date.now()
        }
      };
      return { ...state, roster: { ...roster, personas: [...existingPersonas, entry] } };
    }
    case "IMPORT_PERSONA_DRAFT": {
      const src = action.persona;
      if (!src || !src.__custom) return state;
      // Individual legacy imports may start from a roster row without a stable UID.
      // Normalize before resolving affiliation so the new build and sync charge share one exact target.
      if (typeof normalizeCustomPersonaRosterIdentity === "function") {
        state = {
          ...state,
          roster: {
            ...(state.roster || {}),
            personas: normalizeCustomPersonaRosterIdentity(state.roster?.personas || [])
          }
        };
      }
      const affiliation = action.affiliation || null;
      const affiliatedMode = affiliation?.mode === "n" || affiliation?.mode === "t" ? affiliation.mode : null;
      const affiliatedNo = affiliatedMode ? affiliation?.no : null;
      const affiliatedSource = affiliatedMode
        ? ((affiliatedMode === "n" ? window.DB?.normal_personas : window.DB?.tokui_personas) || []).find((entry) => String(entry?.no) === String(affiliatedNo))
        : null;
      const isAffiliated = !!affiliatedSource;
      const affiliatedEntryBefore = isAffiliated
        ? (state.roster?.personas || []).find((entry) => entry.mode === affiliatedMode && String(entry.no) === String(affiliatedSource.no))
        : null;
      const affiliatedBuildBefore = affiliatedEntryBefore?.build && typeof affiliatedEntryBefore.build === "object"
        && !Array.isArray(affiliatedEntryBefore.build) ? affiliatedEntryBefore.build : null;
      const affiliatedIsActive = isAffiliated && state.personaMode === affiliatedMode
        && String(state.personaNo) === String(affiliatedSource.no);
      const targetBuildValue = (buildField, stateField, fallback) => {
        if (affiliatedIsActive && stateField && state[stateField] !== undefined) return state[stateField];
        if (affiliatedBuildBefore && affiliatedBuildBefore[buildField] !== undefined) return affiliatedBuildBefore[buildField];
        return fallback;
      };
      const provided = action.provided || { name: true, hp: true, san: true, speed: true, bullets: true, resistances: true, passives: true, skills: true, uniques: true };
      const sourceBase = isAffiliated ? affiliatedSource : src;
      const effectiveSrc = {
        ...sourceBase,
        ...src,
        name: provided.name ? src.name : (sourceBase.name || src.name),
        hp: provided.hp ? src.hp : (sourceBase.hp ?? src.hp),
        san: provided.san ? src.san : (sourceBase.san ?? src.san),
        speed: provided.speed ? src.speed : (sourceBase.speed || src.speed),
        bullets: provided.bullets ? src.bullets : (sourceBase.bullets || src.bullets),
        res_slash: provided.resistances ? src.res_slash : (sourceBase.res_slash || src.res_slash),
        res_pierce: provided.resistances ? src.res_pierce : (sourceBase.res_pierce || src.res_pierce),
        res_blunt: provided.resistances ? src.res_blunt : (sourceBase.res_blunt || src.res_blunt),
        passive_name: provided.passives ? src.passive_name : (sourceBase.passive_name || src.passive_name),
        passive_cond: provided.passives ? src.passive_cond : (sourceBase.passive_cond || src.passive_cond),
        passive_always: provided.passives ? src.passive_always : (sourceBase.passive_always || src.passive_always),
        passive_effect: provided.passives ? src.passive_effect : (sourceBase.passive_effect || src.passive_effect),
        skills: provided.skills ? src.skills : (sourceBase.skills || src.skills),
        unique_buffs: provided.uniques ? src.unique_buffs : (sourceBase.unique_buffs || src.unique_buffs)
      };
      effectiveSrc.keywords = inferPersonaKeywords(effectiveSrc, action.secondaryPassive);
      const uid = makeOwnedUid("custom");
      /* 硝子窓の派生番号は 1 始まり（0-1, 0-2）で届く。かつ LBT 準拠の
         2 始まり（0-2, 0-3）が混在しうる。どちらが正解かは受信データだけでは
         判別できないので、rank 文字列はそのまま保持する。
         かつて「-1 を含む base は全部 +1 する」補正をここに置いていたが、
         それが全戦術番号を 1 ずらす原因だった。正式データには -1 が 1 件も
         無い（base は スキル0〜4、派生は スキル4-2）ので、この補正は不要であり、
残した.And その二重化の原因だった。派生番号の 1 は正式に許容し、
         parseDerivedSkillRank 側の Math.max(1, ...) で潰さないようにする。 */
      const skills = migrateLegacyDerivedSkills((effectiveSrc.skills || []).map((sk, index) => {
        const rawRank = String(sk?.rank || "");
        return {
          id: `sk-${Date.now()}-${index}`,
          rank: rawRank || `スキル${index}`,
        derived_from: sk.derived_from || "",
        derived_index: sk.derived_index,
        derived_condition: sk.derived_condition || "",
        type: sk.type || "",
        sin: sk.sin || "",
        aoe: sk.aoe || "",
        aoeCount: sk.aoeCount || "",
        name: sk.name || "",
        effect: sk.effect || "",
        dice: (sk.dice || []).map((die) => ({ roll: die.roll || "", dval: die.dval ?? die.d ?? "", d: die.d ?? die.dval ?? "", dPlus: !!(die.dPlus ?? die.plus), dCnt: !!die.dCnt, plus: !!(die.plus ?? die.dPlus), effect: die.effect || "" })),
        quick: ""
      };
      }));
      const uniqueBuffs = (effectiveSrc.unique_buffs || []).map((buff, index) => ({
        id: `ub-${Date.now()}-${index}`,
        name: normalizeStatusLabel(buff.name || ""),
        type: buff.type || "バフ",
        initial: buff.initial !== void 0 ? buff.initial : 0,
        max: buff.max !== undefined ? buff.max : 20,
        desc: buff.desc || "",
        place: buff.place || "status",
        // noST は「対象に付与する値で、自分は保持しない」というDB側の明示宣言。下書き取り込みでも保持する。
        noST: buff.noST === true
      }));
      const draftSyncRank = ["0", "00", "000"].includes(action.syncRank) ? action.syncRank : null;
      const draftSyncMax = !!action.syncMax;
      const importedSource = isAffiliated
        ? { ...effectiveSrc, __custom: false, __draftImported: true, __affiliation: { mode: affiliatedMode, no: affiliatedSource.no } }
        : effectiveSrc;
      const emptyEgoSlots = { ZAYIN: null, TETH: null, HE: null, WAW: null, ALEPH: null };
      const targetCustomStatuses = targetBuildValue("customStatuses", "customStatuses", []);
      const baseStatuses = targetBuildValue("defaultStatuses", "defaultStatuses", getFactoryDefaultStatuses()) || getFactoryDefaultStatuses();
      const importedDefaultStatuses = mergeDefaultSelfStatusEntries(baseStatuses, collectSelfManagedStatusEntries(importedSource));
      const importedSelfStatusCandidates = detectSelfStatusCandidates(importedSource, [
        ...(baseStatuses || []).map((item) => item?.label),
        ...(targetCustomStatuses || []).filter((item) => (item?.place || "status") === "status").map((item) => item?.label),
        ...collectSelfManagedStatusEntries(importedSource).map((entry) => entry.label)
      ]);
      const targetEquipmentRefs = affiliatedIsActive
        ? captureEquipmentRefs(state)
        : cloneJSON(affiliatedBuildBefore?.equipmentRefs || { supportUids: [], spiritUid: null });
      const importedBuild = {
        savedAt: Date.now(),
        hp: String(effectiveSrc.hp ?? 100), san: String(effectiveSrc.san ?? 45), speed: effectiveSrc.speed || "1d5",
        initiative: Number(targetBuildValue("initiative", "initiative", 0)) || 0,
        bullets: effectiveSrc.bullets || "×",
        resS: effectiveSrc.res_slash || "普通", resP: effectiveSrc.res_pierce || "普通", resB: effectiveSrc.res_blunt || "普通",
        spirit: targetBuildValue("spirit", "spirit", "") || "",
        spiritMorale: targetBuildValue("spiritMorale", "spiritMorale", "") || "",
        spiritConfuse: targetBuildValue("spiritConfuse", "spiritConfuse", "") || "",
        spiritAlways: targetBuildValue("spiritAlways", "spiritAlways", "") || "",
        supports: cloneJSON(targetBuildValue("supports", "supports", []) || []),
        deathSupport: cloneJSON(targetBuildValue("deathSupport", "deathSupport", null)),
        egoSlots: cloneJSON(targetBuildValue("egoSlots", "egoSlots", emptyEgoSlots) || emptyEgoSlots),
        egoManual: !!targetBuildValue("egoManual", "egoManual", false),
        enhancements: cloneJSON(targetBuildValue("enhancements", "enhancements", []) || []),
        formulas: cloneJSON(targetBuildValue("formulas", "formulas", []) || []),
        customStatuses: cloneJSON(targetCustomStatuses || []),
        equipmentRefs: targetEquipmentRefs,
        pas: { name: effectiveSrc.passive_name || "", cond: effectiveSrc.passive_cond || "", always: effectiveSrc.passive_always || "", effect: effectiveSrc.passive_effect || "", quick: "" },
        extraPassives: action.secondaryPassive?.name ? [{
          id: "pas-import-1",
          name: action.secondaryPassive?.name || "",
          cond: action.secondaryPassive?.cond || "",
          always: action.secondaryPassive?.always || "",
          effect: action.secondaryPassive?.effect || "",
          quick: ""
        }] : [],
        pas2Enabled: false,
        pas2: { name: "", cond: "", always: "", effect: "" },
        skills: cloneJSON(skills),
        uniqueBuffs: cloneJSON(uniqueBuffs),
        personaSrc: cloneJSON(importedSource),
        syncedManual: true,
        defaultStatuses: importedDefaultStatuses,
        selfStatusCandidates: importedSelfStatusCandidates
      };
      const baseRoster = isAffiliated ? state.roster : {
        ...state.roster,
        supports: (state.roster?.supports || []).map((entry) => ({ ...entry, equipped: false })),
        spirits: (state.roster?.spirits || []).map((entry) => ({ ...entry, equipped: false }))
      };
      let personas = (baseRoster.personas || []).map((entry) => ({ ...entry, equipped: false }));
      let beforeSync = null;
      let appliedSyncRank = draftSyncRank;
      let appliedSyncMax = draftSyncMax;
      if (isAffiliated) {
        const key = `${affiliatedMode}:${affiliatedSource.no}`;
        const existingIndex = personas.findIndex((entry) => `${entry.mode}:${entry.no}` === key);
        beforeSync = existingIndex >= 0 ? (state.roster.personas || [])[existingIndex] : null;
        /* 草案の取り込みは同期状態を足すだけ。未指定の下書きで既存の
           同期ランク/MAXを消すと、所持側の表示が請求履歴と食い違う。 */
        appliedSyncRank = beforeSync
          ? (draftSyncRank && String(draftSyncRank).length > String(beforeSync.syncRank || "").length ? draftSyncRank : (beforeSync.syncRank || draftSyncRank))
          : draftSyncRank;
        appliedSyncMax = beforeSync ? beforeSync.syncMax === true || draftSyncMax : draftSyncMax;
        const affiliatedEntry = {
          uid: existingIndex >= 0 ? personas[existingIndex].uid : makeOwnedUid("pr"),
          no: affiliatedSource.no,
          mode: affiliatedMode,
          displayName: importedSource.name || affiliatedSource.name,
          syncRank: appliedSyncRank,
          syncMax: appliedSyncMax,
          lcb: existingIndex >= 0 ? !!personas[existingIndex].lcb : false,
          equipped: true,
          notes: existingIndex >= 0 ? personas[existingIndex].notes || "" : "",
          build: importedBuild
        };
        if (existingIndex >= 0) personas[existingIndex] = { ...personas[existingIndex], ...affiliatedEntry };
        else personas.push(affiliatedEntry);
      } else {
        personas.push({
          uid,
          no: uid,
          mode: "custom",
          src: cloneJSON(importedSource),
          build: importedBuild,
          syncRank: draftSyncRank,
          syncMax: draftSyncMax,
          lcb: false,
          equipped: true,
          notes: ""
        });
      }
      const next = normalizeStatusCollections({
        ...state,
        // The inventory belongs to the character/account and must survive Persona changes.
        inventory: state.inventory,
        personaMode: isAffiliated ? affiliatedMode : "custom",
        personaNo: isAffiliated ? affiliatedSource.no : uid,
        personaSrc: importedSource,
        syncedManual: true,
        spirit: importedBuild.spirit,
        spiritMorale: importedBuild.spiritMorale,
        spiritConfuse: importedBuild.spiritConfuse,
        spiritAlways: importedBuild.spiritAlways,
        supports: cloneJSON(importedBuild.supports),
        deathSupport: cloneJSON(importedBuild.deathSupport),
        egoSlots: cloneJSON(importedBuild.egoSlots),
        egoManual: importedBuild.egoManual,
        enhancements: cloneJSON(importedBuild.enhancements),
        formulas: cloneJSON(importedBuild.formulas),
        customStatuses: cloneJSON(importedBuild.customStatuses),
        initiative: importedBuild.initiative,
        hp: String(effectiveSrc.hp ?? 100),
        san: String(effectiveSrc.san ?? 45),
        speed: effectiveSrc.speed || "1d5",
        bullets: effectiveSrc.bullets || "×",
        resS: effectiveSrc.res_slash || "普通",
        resP: effectiveSrc.res_pierce || "普通",
        resB: effectiveSrc.res_blunt || "普通",
        pas: { name: effectiveSrc.passive_name || "", cond: effectiveSrc.passive_cond || "", always: effectiveSrc.passive_always || "", effect: effectiveSrc.passive_effect || "", quick: "" },
        extraPassives: action.secondaryPassive?.name ? [{
          id: "pas-import-1",
          name: action.secondaryPassive?.name || "",
          cond: action.secondaryPassive?.cond || "",
          always: action.secondaryPassive?.always || "",
          effect: action.secondaryPassive?.effect || "",
          quick: ""
        }] : [],
        pas2Enabled: false,
        pas2: { name: "", cond: "", always: "", effect: "" },
        skills,
        uniqueBuffs,
        defaultStatuses: importedBuild.defaultStatuses,
        selfStatusCandidates: importedBuild.selfStatusCandidates,
        charName: state.charName,
        roster: { ...applyEquipmentRefs(baseRoster, importedBuild.equipmentRefs), personas },
        historyRecent: [`${isAffiliated ? affiliatedMode : "custom"}:${isAffiliated ? affiliatedSource.no : uid}`, ...(state.historyRecent || []).filter((key) => key !== `${isAffiliated ? affiliatedMode : "custom"}:${isAffiliated ? affiliatedSource.no : uid}`)].slice(0, 20)
      });
      const syncEntry = isAffiliated
        ? personas.find((p) => p.mode === affiliatedMode && String(p.no) === String(affiliatedSource.no))
        : personas.find((p) => p.uid === uid);
      return chargeSyncOperation(next, syncEntry?.uid, {
        before: beforeSync,
        syncRank: appliedSyncRank,
        syncMax: appliedSyncMax,
        synced: true,
        resultId: action.resultId
      });
    }
    /* v55: 創作人格の保存 — 編集内容の全スナップショットを所持人格一覧に登録する。
       装備モード中の全フィールド (名前/ステータス/耐性/パッシブ/スキル/固有バフ/
       キーワード) を固めて roster に保存。既に登録済みなら上書き更新する。 */
    case "SAVE_CUSTOM_PERSONA": {
      const src = state.personaSrc;
      if (!src || !src.__custom) return state;
      // Reject partial/non-integer input instead of persisting NaN or silently
      // truncating values such as "12abc" or "45.5" into a different stat.
      const savedStat = (value, fallback) => {
        if (value === "" || value == null) return fallback;
        const raw = String(value).trim();
        if (!/^-?\d+$/.test(raw)) return fallback;
        const parsed = Number(raw);
        return Number.isSafeInteger(parsed) ? parsed : fallback;
      };
      const snap = {
        ...src,
        hp: savedStat(state.hp, src.hp ?? 100),
        san: savedStat(state.san, src.san ?? 45),
        speed: state.speed ?? src.speed ?? "1d5",
        bullets: state.bullets ?? src.bullets ?? "\xD7",
        res_slash: state.resS || src.res_slash || "\u666E\u901A",
        res_pierce: state.resP || src.res_pierce || "\u666E\u901A",
        res_blunt: state.resB || src.res_blunt || "\u666E\u901A",
        passive_name: state.pas?.name ?? src.passive_name ?? "",
        passive_cond: state.pas?.cond ?? src.passive_cond ?? "",
        passive_always: state.pas?.always ?? src.passive_always ?? "",
        passive_effect: state.pas?.effect ?? src.passive_effect ?? "",
        skills: (state.skills || []).map((s, i) => ({
          ...s,
          rank: s.rank || `\u30B9\u30AD\u30EB${i}`,
          type: s.type || "",
          sin: s.sin || "",
          aoe: s.aoe || "",
          aoeCount: s.aoeCount || "",
          name: s.name || "",
          effect: s.effect || "",
          dice: (s.dice || []).map((d) => ({ ...d, roll: d.roll || "", effect: d.effect || "" }))
        })),
        unique_buffs: (state.uniqueBuffs || []).map((b) => ({
          name: b.name || "",
          type: b.type || "\u30D0\u30D5",
          initial: b.initial !== void 0 ? b.initial : 0,
          max: b.max ?? 20,
          desc: b.desc || "",
          place: b.place || "status",
          // 自作人格として保存する際も、対象付与専用の宣言は失わない。
          noST: b.noST === true
        })),
        extra_passives: (state.extraPassives || []).map((p) => ({
          ...p,
          name: p.name || "",
          cond: p.cond || "",
          always: p.always || "",
          effect: p.effect || "",
          quick: p.quick || ""
        })),
        keywords: src.keywords || [],
        __custom: true,
        __saved: true
      };
      const uid = String(state.personaNo || makeOwnedUid("custom"));
      /* Saving a custom Persona must update its complete build as well as its
         source definition. Otherwise re-equipping restores a stale build (or
         loses E.G.O, support passives, mental state and enhancements on first save). */
      const build = createPersonaBuildSnapshot(state);
      if (build) build.personaSrc = cloneJSON(snap);
      const personas = state.roster.personas.map((p) => ({ ...p }));
      const idx = personas.findIndex((p) => p.mode === "custom"
        && (String(p.uid) === uid || String(p.no) === uid));
      const entry = {
        uid,
        no: uid,
        mode: "custom",
        src: snap,
        build,
        syncRank: null,
        syncMax: false,
        lcb: false,
        equipped: true,
        notes: ""
      };
      if (idx >= 0) personas[idx] = { ...personas[idx], uid, no: uid, src: snap, build, equipped: true };
      else personas.push(entry);
      return {
        ...state,
        personaSrc: snap,
        roster: { ...state.roster, personas }
      };
    }
    /* T35/T36: 現在の編集状態を所持人格エントリへビルドとして保存する。
       DB オリジナルは変更せず、roster.personas[].build に Modified 状態を保持する。 */
    case "SAVE_PERSONA_BUILD": {
      if (!state.personaSrc || state.personaMode == null || state.personaNo == null) return state;
      const uniqKey = `${state.personaMode}:${state.personaNo}`;
      const build = createPersonaBuildSnapshot(state);
      let personas = state.roster.personas.slice();
      const idx = personas.findIndex((p) => `${p.mode}:${p.no}` === uniqKey);
      if (idx >= 0) {
        const existing = personas[idx];
        personas[idx] = state.personaMode === "custom"
          ? {
            ...existing,
            uid: String(state.personaNo),
            no: String(state.personaNo),
            src: existing.src || cloneJSON(state.personaSrc),
            build
          }
          : { ...existing, build };
      } else {
        const custom = state.personaMode === "custom";
        const uid = custom ? String(state.personaNo) : makeOwnedUid("pr");
        personas.push({
          uid,
          no: custom ? uid : state.personaNo,
          mode: state.personaMode,
          ...(custom ? { src: cloneJSON(state.personaSrc) } : {}),
          syncRank: null, syncMax: false, lcb: false, equipped: true, notes: "", build
        });
      }
      return { ...state, roster: { ...state.roster, personas } };
    }
    /* T36: 所持人格の保存ビルドを破棄して DB 既定に戻す */
    case "CLEAR_PERSONA_BUILD": {
      const personas = state.roster.personas.map((p) => `${p.mode}:${p.no}` === action.key ? { ...p, build: null } : p);
      return { ...state, roster: { ...state.roster, personas } };
    }
    /* ---- Spirit shortcut ---- */
    /* 精神も所持（roster.spirits）を経由する。未所持なら写してから装備。 */
    case "APPLY_SPIRIT": {
      const name = action.spirit?.name || "";
      if (!name) return state;
      const roster = state.roster || {};
      let spirits = roster.spirits || [];
      if (!spirits.some((s) => s.name === name)) {
        spirits = [...spirits, { uid: makeOwnedUid("spr"), name, equipped: false, resultId: null, addedAt: Date.now(), notes: "" }];
      }
      spirits = spirits.map((s) => ({ ...s, equipped: s.name === name }));
      const nextRoster = { ...roster, spirits };
      return { ...state, roster: nextRoster, ...projectEquipmentFromRoster(nextRoster) };
    }
    default:
      return state;
  }
}
/* Undoで抽選を越えて過去状態へ戻るとき、永久に残すのは証明記録だけ。
   ADD_DRAW_BATCH は最初の確定時に所持・支出も反映するため、そのまま再生すると
   Undoで戻した所持品を復活させたり、チケット消費を戻した状態で抽選品だけ残す。
   再生時には proof（draws）の追記専用アクションへ変換する。 */
function replaySealedAction(action) {
  if (action?.type === "ADD_DRAW_BATCH" || action?.type === "ADD_DRAW_RECORD") {
    return {
      type: "ADD_DRAW_RECORD",
      batch: action.batch,
      entry: action.entry,
      proofOnly: true
    };
  }
  return action;
}

/* Sealed action は dispatch 時点では reducer の検証結果をまだ受け取れない。
   取引が拒否された場合でも sealsRef に意図だけが残ることがあるため、Undo再生直前に
   実際の state に proof が保存済みか照合し、未確定の証明を後から生やさない。 */
function isSealedActionCommitted(action, committedState) {
  if (action?.type === "ADD_DRAW_BATCH" || action?.type === "ADD_DRAW_RECORD") {
    const batch = action.batch;
    const key = String(batch?.batchHash || batch?.commit || "");
    if (!key) return false;
    return (Array.isArray(committedState?.draws) ? committedState.draws : [])
      .some((entry) => String(entry?.batchHash || entry?.commit || "") === key);
  }
  if (action?.type === "ADD_GACHA_LOG") {
    const id = String(action.entry?.id || "");
    if (!id) return false;
    return (Array.isArray(committedState?.gachaLog) ? committedState.gachaLog : [])
      .some((entry) => String(entry?.id || "") === id);
  }
  return true;
}

function useAppState() {
  const [state, dispatch] = React.useReducer(appReducer, INIT_STATE, (init) => {
    try {
      /* 起動時点のアクティブアカウントへ保存を束縛する。切替は active キーの
         書換+再読込で行うため、この束縛が無いと旧画面の遅延保存が新アカウント
         へ書き込む競合が生じ得る。 */
      const bootAccountId = window.LBT_accounts?.getActiveId?.() || null;
      window.__LBT_BOOT_ACCOUNT_ID = bootAccountId;
      const saved = window.LBT_accounts?.loadActive?.();
      if (saved) {
        return normalizeStateShape({ ...init, ...saved, ui: { ...init.ui, ...saved.ui || {} } });
      }
    } catch (e) {
    }
    return normalizeStateShape(init);
  });
  /* seals は「巻き戻させない操作」の記録。
     履歴を全部消すと他の操作まで巻き添えになり、
     抽選より前までUndo不可にするのも他の編集の巻き戻しを奪う。
     そこで、履歴を通常どおり残し、Undoで過去のスナップショットへ戻るときに
     抽選の記録だけを叠加え直す。支払いも取得物も通常どおり巻き戻り、
     「この抽選で何が出た」という決定だけが残る。
     atPastLength は、その action の直前に積まれていたスナップショット数。
     つまりインデックスがそれ未満のスナップショットは抽選より前の状態。 */
  const historyRef = React.useRef({ past: [], future: [] });
  const sealsRef = React.useRef([]);
  const skipHistoryRef = React.useRef(false);
  const [saveStatus, setSaveStatus] = React.useState({ phase: "saving", savedAt: null, error: "" });
  React.useEffect(() => {
    setSaveStatus((previous) => ({ phase: "saving", savedAt: previous.savedAt, error: "" }));
    const t = setTimeout(() => {
      try {
        const { ui, ...rest } = state;
        const saved = window.LBT_accounts?.saveActive?.({
          ...rest,
          ui: {
            previewTab: ui.previewTab,
            currentSection: ui.currentSection,
            codexMode: ui.codexMode,
            codexExpanded: ui.codexExpanded,
            previewCollapsed: ui.previewCollapsed || {}
          }
        }, window.__LBT_BOOT_ACCOUNT_ID || undefined);
        if (!saved) throw new Error("storage-error");
        setSaveStatus({ phase: "saved", savedAt: Date.now(), error: "" });
      } catch (e) {
        // private browsing, quota exceeded, blocked storage等では保存済みと見せず、
        // UIに回復経路（ファイル保存）を示せる状態だけを渡す。
        setSaveStatus({ phase: "error", savedAt: null, error: e?.name || "storage-error" });
      }
    }, 400);
    return () => clearTimeout(t);
  }, [state]);
  const wrappedDispatch = React.useCallback((action) => {
    /* __sealed は「履歴に記録しないが、Undoで巻き戻されたとき復元する」。
       抽選の決定記録に使う。支払いと取得物は普通の action なので、
       それらは通常どおりUndoで巻き戻る。 */
    if (action && action.__sealed) {
      const h = historyRef.current;
      sealsRef.current.push({ atPastLength: h.past.length, action });
      skipHistoryRef.current = false;
      dispatch(action);
      return;
    }
    if (action.type !== "SET_UI" && !skipHistoryRef.current) {
      // 1つのハンドラで連続dispatchした場合、再レンダリングが走るまで
      // 同じstate参照が閉包に残る。同一参照を重ねて積むと、1回目のundoで
      // 何も変わらない操作が履歴に混入し、2回押す必要が出る。
      const past = historyRef.current.past;
      if (past.length === 0 || past[past.length - 1] !== state) {
        past.push(state);
        if (past.length > HISTORY_LIMIT) past.shift();
      }
      historyRef.current.future = [];
    }
    skipHistoryRef.current = false;
    dispatch(action);
  }, [state]);
  /* 戻ったスナップショットより後に決まった抽選があれば、記録だけ戻す。 */
  const reseal = (index) => {
    for (const seal of sealsRef.current) {
      if (seal.atPastLength > index && isSealedActionCommitted(seal.action, state)) {
        skipHistoryRef.current = true;
        dispatch(replaySealedAction(seal.action));
      }
    }
  };
  const undo = React.useCallback(() => {
    const h = historyRef.current;
    if (!h.past.length) return;
    const index = h.past.length - 1;
    const prev = h.past.pop();
    h.future.unshift(state);
    skipHistoryRef.current = true;
    dispatch({ type: "HYDRATE", state: prev });
    reseal(index);
  }, [state]);
  const redo = React.useCallback(() => {
    const h = historyRef.current;
    if (!h.future.length) return;
    const next = h.future.shift();
    h.past.push(state);
    skipHistoryRef.current = true;
    dispatch({ type: "HYDRATE", state: next });
  }, [state]);
  const canUndo = historyRef.current.past.length > 0;
  const canRedo = historyRef.current.future.length > 0;
  return [state, wrappedDispatch, { undo, redo, canUndo, canRedo, saveStatus }];
}
window.useAppState = useAppState;
window.appReducer = appReducer;
window.INIT_STATE = INIT_STATE;
