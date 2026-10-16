const STORAGE_KEY = "lbt_v46_state";
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
    date: String(new Date().toISOString().slice(0, 10)),
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
function hasInitialGrant(results) {
  const list = Array.isArray(results) ? results : [];
  if (!list.length) return false;
  if (list.some((r) => r?.id === "res-initial" || r?.name === "初期作成")) return true;
  const latest = list[list.length - 1];
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
function cloneJSON(obj) {
  return obj == null ? obj : JSON.parse(JSON.stringify(obj));
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
    const index = egos.findIndex((entry) => entry.rank === rank && entry.no === slot.no);
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
  // 第2パッシブも本文判定へ合流させ、手動人格で追加した自己付与を取りこぼさない。
  const primaryAlways = state?.pas?.always ?? state.personaSrc.passive_always ?? "";
  const primaryEffect = state?.pas?.effect ?? state.personaSrc.passive_effect ?? "";
  const secondAlways = state?.pas2Enabled ? state?.pas2?.always || "" : "";
  const secondEffect = state?.pas2Enabled ? state?.pas2?.effect || "" : "";
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
function normalizeItemMaxOwned(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(99, parsed) : null;
}
function getItemMaxOwned(state, itemId) {
  const id = String(itemId || "");
  const official = Array.isArray(window.DB?.items) ? window.DB.items.find((item) => item?.id === id) : null;
  const custom = Array.isArray(state?.customItems) ? state.customItems.find((item) => item?.id === id) : null;
  return normalizeItemMaxOwned((official || custom)?.maxOwned) || 99;
}
function clampItemQuantity(state, itemId, quantity) {
  return Math.min(getItemMaxOwned(state, itemId), Math.max(1, Number.parseInt(quantity, 10) || 1));
}
window.LBT_getItemMaxOwned = getItemMaxOwned;
window.LBT_detectSelfManagedStatuses = detectSelfManagedStatuses;
window.LBT_getSelfManagedStatusEntries = collectSelfManagedStatusEntries;
window.LBT_getStateSelfManagedStatusEntries = getStateSelfManagedStatusEntries;

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
  const latest = pool.find((p) => p.no === next.personaNo && p.name === next.personaSrc.name);
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
  const raw = value && typeof value === "object" ? value : {};
  const toNumber = (input) => {
    const parsed = Number.parseInt(input, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  };
  return { lp: toNumber(raw.lp), shards: toNumber(raw.shards) };
}

  /* 抽出チケットも通貨と同じ収支で扱う。卓で報酬として受け渡されるもので、
     リザルトの収入に「種別ごとの枚数」として積む。パック別は pack の下に
     パック名を並べるので、どのパックなら引けるかが収入の時点で分かる。 */
  function normalizeTickets(value) {
    const raw = value && typeof value === "object" ? value : {};
    const toNumber = (input) => {
      const parsed = Number.parseInt(input, 10);
      return Number.isFinite(parsed) ? parsed : 0;
    };
    const out = { persona: toNumber(raw.persona), ego: toNumber(raw.ego), choice: toNumber(raw.choice), pack: {} };
    const packs = raw.pack && typeof raw.pack === "object" ? raw.pack : {};
    for (const [name, count] of Object.entries(packs)) {
      const n = toNumber(count);
      if (n) out.pack[name] = n;
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
      for (const [name, n] of Object.entries(inc.pack)) out.pack[name] = (out.pack[name] || 0) + n;
    }
    for (const entry of entries || []) {
      /* 消費は負数で持つ（明細は支出なので）。 */
      const used = normalizeTickets(entry?.tickets);
      out.persona -= used.persona;
      out.ego -= used.ego;
      out.choice -= used.choice;
      for (const [name, n] of Object.entries(used.pack)) out.pack[name] = (out.pack[name] || 0) - n;
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
      const nextVal = Math.max(0, (Number(next.pack[pack]) || 0) + delta);
      if (nextVal) next.pack[pack] = nextVal;
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
  ownedUidCounter = (ownedUidCounter + 1) % 100000;
  return `${prefix}-${Date.now()}-${ownedUidCounter}`;
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
function supportSlotLimit(state, slot) {
  if (slot === "death") return 1;
  const resolver = typeof window !== "undefined" ? window.LBT_getActiveEnhancements : null;
  const active = typeof resolver === "function" ? resolver(state) : (state?.enhancements || []);
  return (active || []).some((e) => String(e?.name || "").includes("サポートスロット追加")) ? 3 : 2;
}
/* 指定の所持を装備する。枠の上限は slot で決まる。 */
function equipRosterSupport(state, uid) {
  const roster = state.roster || {};
  const target = (roster.supports || []).find((s) => s.uid === uid);
  if (!target) return state;
  const limit = supportSlotLimit(state, target.slot);
  const marked = (roster.supports || []).map((s) => (s.uid === uid ? { ...s, equipped: true } : s));
  const sameSlot = marked.filter((s) => s.slot === target.slot && s.equipped);
  const overflowUids = new Set(sameSlot.slice(0, Math.max(0, sameSlot.length - limit)).map((s) => s.uid));
  const supports = overflowUids.size
    ? marked.map((s) => (overflowUids.has(s.uid) ? { ...s, equipped: false } : s))
    : marked;
  return { ...state, roster: { ...roster, supports }, ...projectEquipmentFromRoster({ ...roster, supports }) };
}
function projectEquipmentFromRoster(roster) {
  const supports = (roster?.supports || []).filter((s) => s.equipped && s.slot !== "death");
  const deathSupport = (roster?.supports || []).find((s) => s.equipped && s.slot === "death") || null;
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

function normalizeStateShape(raw) {
  const next = refreshDBReferencedData(refreshEquippedPersonaFromDB({ ...raw }));
  next.schemaVersion = next.schemaVersion || SAVE_SCHEMA_VERSION;
  // 共有用画像は端末内でWebP/JPEGへ圧縮済みのdata URIだけを保持する。
  // 外部URLや任意MIMEを受け付けないことで、共有HTMLへそのまま安全に埋め込める。
  const shareImageData = String(next.shareImageData || "");
  next.shareImageData = /^data:image\/(webp|jpeg);base64,[A-Za-z0-9+/]+=*$/.test(shareImageData) && shareImageData.length <= 48000
    ? shareImageData : "";
  next.shareImageBlockedReason = typeof next.shareImageBlockedReason === "string" ? next.shareImageBlockedReason.slice(0, 300) : "";
  // 旧版の自由文候補は確認前でも誤登録の起点になり得るため、読み込み時に引き継がない。
  next.selfStatusCandidates = [];
  if (!Array.isArray(next.supports)) next.supports = [];
  if (next.deathSupport === void 0) next.deathSupport = null;
  if (!next.deathSupport && Array.isArray(next.supports)) {
    const idx = next.supports.findIndex((s) => isDeathSupportPassiveRecord(s));
    if (idx >= 0) {
      const moved = next.supports[idx];
      next.supports = next.supports.filter((_, i) => i !== idx);
      next.deathSupport = { ...moved, id: moved.id || `sppd-${Date.now()}` };
    }
  }
  if (!next.ui) next.ui = {};
  if (!next.ui.previewCollapsed) next.ui.previewCollapsed = {};
  if (!next.roster || typeof next.roster !== "object") next.roster = { personas: [], egos: [], supports: [], spirits: [] };
  if (!Array.isArray(next.roster.personas)) next.roster.personas = [];
  if (!Array.isArray(next.roster.egos)) next.roster.egos = [];
  if (!Array.isArray(next.roster.supports)) next.roster.supports = [];
  if (!Array.isArray(next.roster.spirits)) next.roster.spirits = [];
  /* 抽出チケットは卓で報酬として受け渡されるため、リザルトの収入として管理する。
     旧セーブは state.tickets に行配列（または {persona:3} 形式）で残っているので、
     残数があるなら「抽出チケットの受領」というリザルトの収入へ移す。
     受け渡したタイミングは保存データに無いので、受領日のリザルトとして置く。 */
  const legacyTickets = (Array.isArray(next.tickets)
    ? next.tickets
    : Object.entries(next.tickets || {}).map(([kind, count], i) => ({
      kind, pack: null, count: Math.max(0, Number(count) || 0)
    }))
  ).filter((t) => t && TICKET_KINDS.includes(t.kind) && Number(t.count) > 0);
  next.tickets = [];
  if (legacyTickets.length) {
    let total = { persona: 0, ego: 0, choice: 0, pack: {} };
    for (const t of legacyTickets) {
      if (t.kind === "pack" && t.pack) total.pack[t.pack] = (total.pack[t.pack] || 0) + Number(t.count);
      else total[t.kind] = (Number(total[t.kind]) || 0) + Number(t.count);
    }
    /* 既に同じ内容を持つリザルトがあれば二重に積まない。 */
    const already = (next.results || []).some((r) => {
      const inc = normalizeTickets(r.income?.tickets);
      return inc.persona === total.persona && inc.ego === total.ego && inc.choice === total.choice
        && JSON.stringify(inc.pack) === JSON.stringify(total.pack);
    });
    if (!already) {
      next.results = [{
        id: "res-ticket-grant",
        name: "抽出チケットの受領",
        date: String(new Date().toISOString().slice(0, 10)),
        income: { lp: 0, shards: 0, tickets: total },
        note: "以前所持していた抽出チケットをリザルト収入へ移行しました。",
        createdAt: Date.now()
      }, ...(next.results || [])];
    }
  }
  next.roster = {
    ...next.roster,
    // 同期MAXは同期ランク（0/00/000）と別に保存する。旧保存データはfalseへ補完する。
    personas: next.roster.personas.map((entry) => ({
      ...entry,
      syncRank: ["0", "00", "000"].includes(String(entry?.syncRank || "")) ? String(entry.syncRank) : null,
      syncMax: entry?.syncMax === true
    })),
    /* 所持へ統合した2種は、人格・E.G.O と同じく uid と帰属先（resultId）を持つ。
       resultId は「どのリザルトで手に入れたか」。null は未分類で、
       以前のデータはここに入る（帰属の断定は利用者が行う）。 */
    supports: next.roster.supports
      .filter((entry) => entry && entry.name)
      .map((entry, index) => ({
        uid: entry.uid || `spt-${Date.now()}-${index}`,
        name: String(entry.name),
        cond: String(entry.cond || ""),
        effect: String(entry.effect || ""),
        lp: String(entry.lp || ""),
        slot: entry.slot === "death" ? "death" : "normal",
        equipped: entry.equipped === true,
        resultId: entry.resultId || null,
        addedAt: Number(entry.addedAt) || Date.now(),
        notes: String(entry.notes || ""),
        ...(entry.source ? { source: String(entry.source) } : {})
      })),
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
  for (const entry of Array.isArray(next.supports) ? next.supports : []) {
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
      equipped: true,
      resultId: null,
      addedAt: Date.now(),
      notes: ""
    });
  }
  if (next.deathSupport?.name && !seenSupport.has(next.deathSupport.name)) {
    seenSupport.add(next.deathSupport.name);
    const isDeath = deathPassiveNames.includes(next.deathSupport.name);
    next.roster.supports.push({
      uid: next.deathSupport.id || `spt-${Date.now()}-${next.roster.supports.length}`,
      name: String(next.deathSupport.name),
      cond: String(next.deathSupport.cond || ""),
      effect: String(next.deathSupport.effect || ""),
      lp: String(next.deathSupport.lp || ""),
      slot: isDeath ? "death" : "normal",
      equipped: true,
      resultId: null,
      addedAt: Date.now(),
      notes: ""
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
  /* 旧保存データの通帳を正規化する。残高は保存しないので個別の値だけ整える。
     帰属先の無い明細と、存在しないリザルトを指す明細は未分類へ戻す。
     リザルトを消しても明細は消さない。支出額が失われると残高が狂う。 */
  if (!Array.isArray(next.results)) next.results = [];
  if (!Array.isArray(next.entries)) next.entries = [];
  /* 抽出リストは追記のみ。移行が記録を書き換えるとハッシュ鎖が切れるため、
     不正な要素を落とす以外は触らない（検証はバッチ側の verifyBatch が行う）。 */
  if (!Array.isArray(next.draws)) next.draws = [];
  next.draws = next.draws.filter((batch) => batch && typeof batch === "object" && Array.isArray(batch.records));
  next.results = next.results.map((result) => ({
    ...result,
    id: result.id || makeOwnedUid("res"),
    name: String(result.name || "").slice(0, 80),
    date: String(result.date || "").slice(0, 10),
    income: { ...normalizeCurrency(result.income), tickets: normalizeTickets(result.income?.tickets) },
    /* LP→欠片の換算。core:317「2LP → 自我の欠片1」で額が決まるが、
       保存するのは利用者が入力したときの金額そのもの。導出は入力側に持たせる。 */
    exchange: normalizeCurrency(result.exchange),
    note: String(result.note || "")
  }));
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
    ref: entry.ref && typeof entry.ref === "object" ? { kind: String(entry.ref.kind || ""), uid: String(entry.ref.uid || "") } : null
  }));
  /* サポート/精神の装備は人格ごとに違う。装備中の人格に保存ビルドがあるなら
     それが正で、roster の投影（最後に開いた人格の装備）を当ててはいけない。
     投影するのは保存ビルドが無い場合だけで、そのときはロードする側の既定になる。 */
  const equippedEntry = (next.roster.personas || []).find((p) => p.equipped);
  if (equippedEntry?.build) {
    const refs = equippedEntry.build.equipmentRefs;
    if (refs) next.roster = applyEquipmentRefs(next.roster, refs);
    next.supports = Array.isArray(equippedEntry.build.supports) ? cloneJSON(equippedEntry.build.supports) : [];
    next.deathSupport = equippedEntry.build.deathSupport ? cloneJSON(equippedEntry.build.deathSupport) : null;
    next.spirit = equippedEntry.build.spirit ?? "";
    next.spiritMorale = equippedEntry.build.spiritMorale ?? "";
    next.spiritConfuse = equippedEntry.build.spiritConfuse ?? "";
    next.spiritAlways = equippedEntry.build.spiritAlways ?? "";
  } else {
    Object.assign(next, projectEquipmentFromRoster(next.roster));
  }
  // 導入済みアイテムはビルド固有の所持状態。旧保存データには空配列を補完する。
  if (!Array.isArray(next.inventory)) next.inventory = [];
  if (!Array.isArray(next.initialItems)) next.initialItems = [];
  next.initialItems = [...new Set(next.initialItems.map((id) => String(id || "").trim()).filter(Boolean))];
  next.inventory = next.inventory.filter((entry) => entry && entry.itemId).map((entry) => ({
    uid: entry.uid || `it-${Date.now()}-${entry.itemId}`,
    itemId: String(entry.itemId),
    quantity: Math.min(99, Math.max(1, Number.parseInt(entry.quantity, 10) || 1)),
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
  next.inventory = next.inventory.map((entry) => ({ ...entry, quantity: clampItemQuantity(next, entry.itemId, entry.quantity) }));
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
  return normalizeStatusCollections(next);
}
/* 残高は保存しない。収入合計から支出合計を引くだけなので、
   帰属を直すとこの値が動く。明細の帰属を直せば連載ごとに収支を説明できる。 */
/* ---- 価格の導出 ------------------------------------------------------
   通帳へ自動記録するのは「DB が価格を持つもの」だけ。
   アイテムは価格文字列（"15LP"・"50欠片"・"10LP 30SHARD" など）、強化と精神と
   死亡後サポパは欠片、通常サポパは LP の数値。表記の解釈は parsePriceText に
   一任する。価格は独立した保存値を持たせない。
   値が変わっても明細が古びないよう、表示時に DB から引く。 */
/* 明細の表示名。公式DBにあれば公式名、なければ保存在使う。 */
function ownedName(itemId) {
  const official = (window.DB?.items || []).find((i) => i.id === itemId);
  if (official?.name) return String(official.name);
  const custom = (window.LBT_customItems || []).find((i) => i.id === itemId);
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
  const text = raw.trim();
  if (!text) return { lp: 0, shards: 0 };
  /* 数字と単位語は「隣り合う対」で読み、左から順に消費する。
     先読みで結合を決めないので "LP10 SHARD30" の 10 が SHARD 側へ
     溢れない。各通貨は最初に見つかった対を採る。 */
  let lp = 0;
  let shards = 0;
  for (const m of text.matchAll(/(\d+)\s*(?:LP|SHARD|欠片|欠)|(?:LP|SHARD|欠片|欠)\s*(\d+)/gi)) {
    const amount = m[1] !== undefined ? m[1] : m[2];
    const unit = m[0].replace(/\d+/g, "").replace(/\s+/g, "");
    if (/SHARD|欠/i.test(unit)) { if (!shards) shards = amount; }
    else if (!lp) lp = amount;
  }
  if (lp || shards) return normalizeCurrency({ lp, shards });
  const bare = text.match(/^(\d+)$/);
  return normalizeCurrency(bare ? (defaultUnit === "shards" ? { shards: bare[1] } : { lp: bare[1] }) : {});
}
window.LBT_parsePriceText = parsePriceText;
function priceItemById(itemId) {
  const item = (window.DB?.items || window.DB?.itemList || []).find((i) => i.id === itemId);
  return parsePriceText(item?.price);
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

/* 明細の追記と除去。帰属は「直近のリザルト」で決める。
   利用者が購入のたびにリザルトを選ばせるのは検算のたびに手续が増えるため、
   最後に記録したリザルトへ倒し込む。リザルトが1件も無ければ分類できないので
   未分類（resultId:null = 通帳の「未分類」欄＝待機項目）に置く。
   明示的に resultId を渡せば常にそちらが勝つ（取り込み-batch は位置で渡す）。 */
function latestResultId(state) {
  const results = state?.results || [];
  return results.length ? results[results.length - 1].id : null;
}
/* 所持品の入手元シナリオ。共有データの owned にはこの列为無いので、
   シナリオ履歴との照合で求めた値をそのまま保持する。
   空なら「判別できなかった」を意味し、推測では埋めない。 */
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
/* Entities から明細を戻す。所持を消したら支出も消す（残高を狂わせない）。 */
function dropLedgerEntriesForRef(state, ref) {
  if (!ref) return state;
  const keep = (entry) => !(entry?.ref
    && entry.ref.kind === ref.kind
    && entry.ref.uid === ref.uid);
  return { ...state, entries: (state.entries || []).filter(keep) };
}

function computeLedgerBalance(results, entries) {
  let incomeLp = 0;
  let incomeShards = 0;
  let exchangeLp = 0;
  let exchangeShards = 0;
  for (const result of results || []) {
    incomeLp += normalizeCurrency(result?.income).lp;
    incomeShards += normalizeCurrency(result?.income).shards;
    /* LP を欠片に換えた分は収入でも支出でもない。「払う LP」と「得る欠片」が
       同時に起きる1つの取引なので、支出に混ぜると明細の表示が嘘になる。 */
    const exchanged = normalizeCurrency(result?.exchange);
    exchangeLp += exchanged.lp;
    exchangeShards += exchanged.shards;
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
    lp: incomeLp - spentLp - exchangeLp,
    shards: incomeShards - spentShards + exchangeShards,
    incomeLp,
    incomeShards,
    spentLp,
    spentShards,
    exchangeLp,
    exchangeShards,
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

  /* 購入 action が計上する金額。null は「購入ではない操作」。 */
function purchaseCostOf(state, action) {
  if (action.type === "ADD_ROSTER") return action.purchase ? normalizeCurrency(action.cost) : null;
  if (action.type === "ADD_ROSTER_EGO") return action.purchase ? priceEgo(action.rank, action.no) : null;
  if (action.type === "ADD_ITEM") return priceItemById(action.itemId);
  if (action.type === "ADD_ROSTER_SUPPORT") {
    const spp = action.spp || {};
    return normalizeCurrency({ lp: spp.lp });
  }
  if (action.type === "ADD_ROSTER_SPIRIT") {
    const spirit = action.spirit || {};
    return normalizeCurrency({ shards: spirit.price });
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
function writeStorageRaw(key, value) {
  const storage = lbtStorage();
  if (!storage) return false;
  try {
    storage.setItem(key, value);
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
    return true;
  } catch (_) {
    return false;
  }
}
/* 読めない保存値は上書きせず、別キーへ退避してから初めて既定で再出発できる。 */
function preserveUnreadable(key, raw) {
  if (raw == null) return;
  writeStorageRaw(`${key}.corrupt.${Date.now()}`, raw);
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
function readAccountsIndex() {
  const raw = readStorageRaw(ACCOUNTS_INDEX_KEY);
  if (raw == null) return { version: 1, accounts: [] };
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch (_) {
    preserveUnreadable(ACCOUNTS_INDEX_KEY, raw);
    return { version: 1, accounts: [] };
  }
  const list = Array.isArray(parsed?.accounts) ? parsed.accounts : Array.isArray(parsed) ? parsed : [];
  return {
    version: 1,
    accounts: list.filter((entry) => entry && typeof entry.id === "string" && entry.id).map(normalizeAccountEntry)
  };
}
function writeAccountsIndex(accounts) {
  return writeStorageRaw(ACCOUNTS_INDEX_KEY, JSON.stringify({ version: 1, accounts }));
}
function newAccountId() {
  return `acc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
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
  const id = newAccountId();
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
  // 3. 索引。書けなければ孤立キーを片付けて次回に再挑戦させる。
  if (!writeAccountsIndex([account])) {
    removeStorageRaw(ACCOUNT_PREFIX + id);
    return { accounts: [], activeId: null };
  }
  writeStorageRaw(ACCOUNT_ACTIVE_KEY, id);
  return { accounts: [account], activeId: id };
}
function listAccounts() {
  const { accounts, activeId } = migrateLegacyAccounts();
  return { accounts: accounts.map((entry) => ({ ...entry })), activeId };
}
function getActiveAccountId() {
  return migrateLegacyAccounts().activeId;
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
      preserveUnreadable(key, existing);
    }
  }
  if (!writeStorageRaw(key, serialized)) return false;
  const accounts = index.accounts.map((entry) => entry.id === targetId ? { ...entry, updatedAt: Date.now() } : entry);
  if (accounts.some((entry) => entry.id === targetId)) writeAccountsIndex(accounts);
  return true;
}
/* 無料（price 0）の精神は最初から持っているものとして数える。
   「初期選択可」は選ぶかどうかの表示ではなく、初めからあるもの。
   有料のものだけ roster に入る。明細は立てない（購入ではない）。 */
function initialFreeSpirits() {
  const list = (window.DB && window.DB.spirits) || [];
  const free = list.filter((s) => s && s.name && !(Number(s.price) > 0));
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
  const account = normalizeAccountEntry({
    id: newAccountId(),
    name,
    purpose,
    createdAt: now,
    updatedAt: now
  }, index.accounts.length);
  /* 新規アカウントは高級な精神が既に。そこに明细は立てない。 */
  const seed = { schemaVersion: SAVE_SCHEMA_VERSION, roster: { spirits: initialFreeSpirits() } };
  if (!writeStorageRaw(ACCOUNT_PREFIX + account.id, JSON.stringify(seed))) return null;
  if (!writeAccountsIndex([...index.accounts, account])) {
    removeStorageRaw(ACCOUNT_PREFIX + account.id);
    return null;
  }
  return account;
}
function updateAccount(id, patch) {
  const index = readAccountsIndex();
  if (!index.accounts.some((entry) => entry.id === id)) return false;
  const accounts = index.accounts.map((entry) => entry.id === id ? {
    ...entry,
    name: patch?.name !== void 0 ? normalizeAccountName(patch.name, entry.name) : entry.name,
    purpose: patch?.purpose !== void 0 ? String(patch.purpose || "").trim().slice(0, ACCOUNT_NAME_MAX) : entry.purpose,
    updatedAt: Date.now()
  } : entry);
  return writeAccountsIndex(accounts);
}
function switchAccount(id) {
  const index = readAccountsIndex();
  if (!index.accounts.some((entry) => entry.id === id)) return false;
  return writeStorageRaw(ACCOUNT_ACTIVE_KEY, id);
}
function deleteAccount(id) {
  const index = readAccountsIndex();
  if (index.accounts.length <= 1) return false;
  const next = index.accounts.filter((entry) => entry.id !== id);
  if (next.length === index.accounts.length) return false;
  if (!writeAccountsIndex(next)) return false;
  removeStorageRaw(ACCOUNT_PREFIX + id);
  removeAccountIcon(id);
  if (readStorageRaw(ACCOUNT_ACTIVE_KEY) === id) writeStorageRaw(ACCOUNT_ACTIVE_KEY, next[0].id);
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
  const key = ACCOUNT_PREFIX + activeId;
  const existing = readStorageRaw(key);
  if (existing != null) preserveUnreadable(key, existing);
  return writeStorageRaw(key, JSON.stringify({ schemaVersion: SAVE_SCHEMA_VERSION }));
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
    if (item.kind === "ego") { adds.push({ type: "ego", no: item.no, rank: item.rank, cost }); continue; }
    if (item.kind === "persona") { adds.push({ type: "persona", no: item.no, mode: item.mode === "t" ? "t" : "n", cost }); continue; }
    if (item.kind === "themePack") {
      /* パック内の通し番号ではなく、DB の人格番号で所持へ入れる。
         金額は記録のものをそのまま渡す：通帳の1行を、この1件で作る。 */
      const found = personaNoByName(item.name);
      if (found) adds.push({ type: "persona", no: found.no, mode: found.mode, cost });
    }
  }
  return adds;
}

function appReducer(state, action) {
  /* 購入系は残高が足りなければ行わない。UI で無効化するだけでは、
     他の入口（自動登録・取り込み）から通過する経路が残るため 这里で止める。 */
  if (action.type === "ADD_ROSTER" || action.type === "ADD_ROSTER_EGO"
    || action.type === "ADD_ITEM" || action.type === "ADD_ROSTER_SUPPORT"
    || action.type === "ADD_ROSTER_SPIRIT") {
    const cost = purchaseCostOf(state, action);
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
        "hp","san","speed","bullets","resS","resP","resB","spirit","spiritMorale","spiritConfuse","spiritAlways",
        "pas","pas2Enabled","pas2","uniqueBuffs","skills","egoSlots","supports","deathSupport","roster",
        "enhancements","customStatuses","defaultStatuses","formulas","builtinFormulasOverride","autoFml",
        "moraleLine","extraCmd","outputExclude","shareOptions","paletteOptions","results","entries","inventory","customItems",
        "favorites","historyRecent"];
      // 別端末移行（exportState/importStateFromFile）は favorites と historyRecent を
      // 出力に含む。許可リストから漏れると、移行先で★と履歴だけが黙って失われる。
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
        id: `sk-${Date.now()}-${i}`,
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
        id: `ub-${Date.now()}-${i}`,
        name: normalizeStatusLabel(b.name || ""),
        type: b.type || "\u30D0\u30D5",
        initial: b.initial !== void 0 ? b.initial : 0,
        max: b.max || 20,
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
          uid: `pr-${Date.now()}`,
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
          pas2Enabled: !!b.pas2Enabled,
          pas2: b.pas2 ? cloneJSON(b.pas2) : base.pas2,
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
      const personas = (state.roster?.personas || []).map((entry) => entry.mode === state.personaMode && entry.no === state.personaNo
        ? { ...entry, displayName: nextSrc?.name || entry.displayName || "", updatedAt: Date.now() }
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
      const target = Number(action.count) || 0;
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
      const delta = Number(action.count) || 0;
      if (!delta) return state;
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
      /* count は負数で「消費した枚数」を表す。指定が無ければ 1 枚。 */
      const asked = Math.abs(Number(action.count) || 0);
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
      const uid = `pr-${Date.now()}`;
      const entry = { uid, no, mode, syncRank: null, syncMax: false, lcb: false, equipped: false, notes: "", via: normalizeVia(action.via) };
      const next = { ...state, roster: { ...state.roster, personas: [...state.roster.personas, entry] } };
      const withTicket = consumeInitialPersonaTicket(next, action.resultId);
      if (!action.purchase) return withTicket;
      const persona = (mode === "t" ? window.DB?.tokui_personas : window.DB?.normal_personas || []).find((p) => String(p.no) === String(no));
      /* resultId の明示指定は常に勝つ（appendLedgerEntry の契約）。未指定なら
         appendLedgerEntry が Support/EGO/Item/Spirit と同じ「直近のリザルト」へ
         倒すので、人格だけ帰属が違うことはない。 */
      return appendLedgerEntry(withTicket, {
        kind: "persona",
        name: persona?.name || `人格 ${mode.toUpperCase()} No.${no}`,
        cost: normalizeCurrency(action.cost),
        resultId: action.resultId,
        ref: { kind: "rosterPersona", uid }
      });
    }
    /* 同期化・解析・そのMAX（supplement P7/P23）。人格・E.G.O の「-sync/analyze 済み」
       フラグを立てるだけで済ませると、規則が定めた自我の欠片が帳から消える。
       ここを通すので、欠片は直近リザルトの明細として落ち、収入から引かれる。
       既存アカウントのフラグ済み項目には明細が無いので、
       後からまとめて記録できる BACKFILL_SYNC_ENTRIES を用意する。 */
    case "APPLY_PERSONA_SYNC": {
      const { uid, syncRank, syncMax } = action;
      const personas = (state.roster.personas || []).map((p) => {
        if (p.uid !== uid) return p;
        return { ...p, syncRank: syncRank === undefined ? p.syncRank : syncRank, syncMax: syncMax === undefined ? p.syncMax : syncMax };
      });
      const entry = (state.roster.personas || []).find((p) => p.uid === uid);
      if (!entry) return state;
      const persona = (entry.mode === "t" ? window.DB?.tokui_personas : window.DB?.normal_personas || []).find((p) => String(p.no) === String(entry.no));
      const rankToSync = syncRank === undefined ? entry.syncRank : syncRank;
      const wantMax = syncMax === undefined ? entry.syncMax : syncMax;
      const next = { ...state, roster: { ...state.roster, personas } };
      /* 費用は「新たに同期（またはMAX）を立てた」1回だけ。
         既に立ってる状態から解除する操作、或いは既に立ってるままの呼び出しでは
         一切掛からない。 Toggle を往復させても二重で引かれない。 */
      const isMax = Boolean(wantMax);
      const wasMax = entry.syncMax === true;
      const wasSynced = Boolean(entry.syncRank) || wasMax;
      const nowSynced = Boolean(rankToSync) || isMax;
      /* 立っていなかった状態から初めて立つときだけ費用。 */
      if (wasSynced || !nowSynced) return next;
      const op = isMax ? "syncMax" : "sync";
      const cost = window.LBT_operationCost?.(op, { ...persona, no: entry.no }, window.DB);
      if (!cost) return next;
      return appendLedgerEntry(next, {
        kind: isMax ? "personaSyncMax" : "personaSync",
        name: `${persona?.name || `人格 No.${entry.no}`}${isMax ? " 同期MAX" : rankToSync ? ` 同期${rankToSync}` : " 同期"}`,
        cost: normalizeCurrency(cost),
        resultId: action.resultId,
        ref: { kind: "rosterPersona", uid }
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
      /* 解析は1回だけ。既に解析済みなら二重に引かない。 */
      if (entry.analyzed === true) return next;
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
    /* V23: 所持EGO一覧への追加・削除（人格の ADD_ROSTER / REMOVE_ROSTER に相当）
       purchase=true はショップ経由の購入。装备（SET_EGO_SLOT）からの
       自動登録では明細を立てない（購入と二重請求になるため）。 */
    case "ADD_ROSTER_EGO": {
      const { rank, no } = action;
      if ((state.roster.egos || []).some((e) => e.rank === rank && String(e.no) === String(no))) return state;
      const uid = `er-${Date.now()}`;
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
      if (entry?.build?.__custom && (!action.deleteCustomConfirmed || state.egoSlots?.[entry.rank]?.no === entry.no)) return state;
      const egos = (state.roster.egos || []).filter((e) => e.uid !== action.uid);
      /* ショップで購入したものは所持から外すと同額の支出を戻す。 */
      return dropLedgerEntriesForRef({ ...state, roster: { ...state.roster, egos } }, { kind: "rosterEgo", uid: action.uid });
    }
    case "REMOVE_ROSTER_BATCH": {
      const ids = new Set(action.uids || []);
      return { ...state, roster: { ...state.roster, personas: (state.roster.personas || []).filter((entry) => !ids.has(entry.uid)) } };
    }
    case "REMOVE_ROSTER_EGO_BATCH": {
      const ids = new Set(action.uids || []);
      return { ...state, roster: { ...state.roster, egos: (state.roster.egos || []).filter((entry) =>
        !ids.has(entry.uid) || (entry.build?.__custom && (!action.deleteCustomConfirmed || state.egoSlots?.[entry.rank]?.no === entry.no))) } };
    }
    case "RESTORE_ROSTER_BATCH": {
      const kind = action.kind === "egos" ? "egos" : "personas";
      const present = new Set((state.roster[kind] || []).map((entry) => entry.uid));
      const restored = [...(state.roster[kind] || []), ...(action.items || []).filter((entry) => !present.has(entry.uid))];
      return { ...state, roster: { ...state.roster, [kind]: restored } };
    }
    case "REMOVE_ROSTER": {
      const removed = state.roster.personas.find((p) => p.uid === action.uid);
      const personas = state.roster.personas.filter((p) => p.uid !== action.uid);
      const next = { ...state, roster: { ...state.roster, personas } };
      // V16: 削除された人格を装備中なら、編集内容を破棄して DB 既定へリセットする。
      if (removed && state.personaSrc && removed.mode === state.personaMode && removed.no === state.personaNo) {
        const srcPool = removed.mode === "n" ? (window.DB?.normal_personas || [])
          : removed.mode === "t" ? (window.DB?.tokui_personas || []) : [];
        const dbSrc = srcPool.find((x) => x.no === removed.no);
        if (dbSrc) {
          next.hp = String(dbSrc.hp || "");
          next.san = String(dbSrc.san || "");
          next.speed = dbSrc.speed || "";
          next.bullets = dbSrc.bullets || "\xD7";
          next.resS = dbSrc.res_slash || "\u666E\u901A";
          next.resP = dbSrc.res_pierce || "\u666E\u901A";
          next.resB = dbSrc.res_blunt || "\u666E\u901A";
          next.pas = { name: dbSrc.passive_name || "", cond: dbSrc.passive_cond || "", always: dbSrc.passive_always || "", effect: dbSrc.passive_effect || "", quick: "" };
          next.skills = cloneJSON(dbSrc.skills || []).map((sk, i) => ({ id: `sk-${Date.now()}-${i}`, ...sk, dice: (sk.dice || []).map((d) => ({ roll: d.roll || "", d: d.d ?? "", plus: !!d.plus, effect: d.effect || "" })) }));
          next.uniqueBuffs = cloneJSON(dbSrc.unique_buffs || []).map((b, i) => ({ id: `ub-${Date.now()}-${i}`, name: b.name || "", type: b.type || "\u56FA\u6709\u30D0\u30D5", initial: b.initial ?? 0, max: b.max ?? 0, desc: b.desc || "", place: b.place || "status", noST: b.noST === true }));
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
      const current = Array.isArray(state.inventory) ? state.inventory : [];
      const existing = current.find((entry) => entry.itemId === itemId);
      const inventory = existing
        ? current.map((entry) => entry.itemId === itemId ? { ...entry, quantity: clampItemQuantity(state, itemId, (Number(entry.quantity) || 1) + 1) } : entry)
        : [...current, { uid: `it-${Date.now()}-${itemId}`, itemId, quantity: 1, memo: true, palette: true, origin: "acquired" }];
      const next = { ...state, inventory };
      /* 導入した時だけ明細を足す。個数の増加では個別に買っていないため、
         増やした分は足さない（所持数の増減と支出がずれるのを防ぐ）。 */
      if (existing) return next;
      const owned = next.inventory.find((entry) => entry.itemId === itemId);
      return appendLedgerEntry(next, {
        kind: "item",
        name: ownedName(itemId),
        cost: priceItemById(itemId),
        resultId: action.resultId,
        ref: { kind: "inventory", uid: owned?.uid || itemId }
      });
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
  const cleaned = [...new Set(names.map((name) => String(name || "").trim()).filter(Boolean))];
  return { ...state, initialSpirits: cleaned };
}
case "APPLY_INITIAL_SPIRITS": {
  const current = Array.isArray(state.roster?.spirits) ? state.roster.spirits : [];
  const owned = new Set(current.map((entry) => entry.name));
  const wanted = (Array.isArray(state.initialSpirits) ? state.initialSpirits : []).filter((name) => !owned.has(name));
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
    case "REMOVE_CUSTOM_ITEM":
      return {
        ...state,
        customItems: (state.customItems || []).filter((item) => item.id !== action.id),
        inventory: (state.inventory || []).filter((entry) => entry.itemId !== action.id)
      };
    /* ---- Skills ---- */
    case "PATCH_SKILL": {
      const patch = action.patch || {};
      return normalizeStatusCollections({ ...state, skills: state.skills.map((s, index) => {
        if (s.id !== action.id) return s;
        const next = { ...s, ...patch };
        // rankを直接編集した場合は、以前の派生番号を優先して元へ戻さない。
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
        id: `sk-${Date.now()}`,
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
      base.id = `sk-${Date.now()}`;
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
      const egos = (state.roster.egos || []).map((e) => e.rank === rank && e.no === slot.no && e.build ? { ...e, build: null } : e);
      const nextEgoSlots = normalizeEgoSlots({ ...state.egoSlots, [rank]: cloneJSON(dbEgo) });
      return syncCustomEgoState({ ...state, egoSlots: nextEgoSlots, roster: { ...state.roster, egos } });
    }
    case "SET_EGO_SLOT": {
      let nextValue = action.value ? cloneJSON(action.value) : null;
      // V01/V25: 所持EGOに保存済みの解析ビルドがあれば DB 既定の代わりにそちらを装備する。
      if (nextValue) {
        const saved = (state.roster.egos || []).find((e) => e.rank === action.rank && e.no === nextValue.no && e.build);
        if (saved) nextValue = { ...nextValue, ...cloneJSON(saved.build) };
      }
/* 装備は所持を確定させない。所持への登録は ADD_ROSTER_EGO（指定購入＝欠片を請求、
         または購入せず所持に追加＝無料）だけが行う。装備を所持確定にしていると、未所持E.G.Oの
         詳細画面で装備を押した瞬間に指定購入を跨いで帳も明細も動かないまま所持へ入る。 */
      if (nextValue && action.preview) nextValue = { ...nextValue, __preview: true };
      const nextEgoSlots = normalizeEgoSlots({ ...state.egoSlots, [action.rank]: nextValue });
      // 装備・付け替え・解除はどれも直接編集を終了する。解除後に別スロットの詳細へ
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
      const idx = egos.findIndex((e) => e.rank === rank && e.no === slot.no);
      const wasAnalyzed = idx >= 0 && egos[idx].analyzed === true;
      if (idx >= 0) egos[idx] = { ...egos[idx], analyzed: true, build };
      else egos.push({ uid: `er-${Date.now()}`, no: slot.no, rank, analyzed: true, analyzeMax: false, notes: "", build });
      const next = { ...state, roster: { ...state.roster, egos } };
      /* 解析は危険度ランク分の自我の欠片を支払う（supplement P7）。保存のたびに
         取るのは誤りで、解析を初めて確定させた1回だけ。既に解析済みなら積まない。 */
      if (wasAnalyzed) return next;
      const uid = egos[idx >= 0 ? idx : egos.length - 1].uid;
      const cost = window.LBT_operationCost?.("analyze", { rank, no: slot.no }, window.DB);
      if (!cost) return next;
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
    case "ADD_DRAW_BATCH": {
      const batch = action.batch;
      if (!batch || typeof batch !== "object" || !Array.isArray(batch.records)) return state;
      let next = applyRosterAdds(state, rosterAddsFromDrawBatch(batch), { resultId: action.resultId });
      /* テーマパックは毎回ぶんを請求する。引いたのが DB に無い専用人格なら
         所持へ入らず、そのぶんを通帳に「消費」として残す。放入できた件は
         applyRosterAdds が記録の金額ごと記済みなので、ここで二重に書くと
         二重の請求になる。重複は所持へ入れず、代わりに欠片を受け取る。
         どちらの経路でも、記録に残った額と通帳の合計は一致する。 */
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
              resultId: action.resultId
            });
          }
          next = addShardIncome(next, Number(record.grantedShards) || 0, action.resultId);
          continue;
        }
        if (personaNoByName(record.item?.name)) continue;
        const lp = Number(record.cost?.lp) || 0;
        if (!lp) continue;
        next = appendLedgerEntry(next, {
          kind: "expense",
          name: `特定抽出パック ${record.pack || ""}${record.item?.name ? `：${record.item.name}` : ""}`.trim(),
          cost: { lp, shards: 0 },
          resultId: action.resultId
        });
      }
      return { ...next, draws: [...(next.draws || []), batch] };
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
      if (!action.spp) {
        const roster = state.roster || {};
        const supports = (roster.supports || []).map((s) => (s.slot === "death" ? { ...s, equipped: false } : s));
        const next = { ...state, roster: { ...roster, supports } };
        return { ...next, ...projectEquipmentFromRoster(next.roster) };
      }
      const owned = findOwnedSupport(state, String(action.spp?.name || ""));
      if (owned) return equipRosterSupport(state, owned.uid);
      const added = addRosterSupport(state, action.spp);
      if (!added) return state;
      const entry = [...added.roster.supports].reverse().find((s) => s.name === action.spp?.name);
      if (!entry) return state;
      return equipRosterSupport(added, entry.uid);
    }
    case "PATCH_DEATH_SUPPORT":
      if (!state.deathSupport) return state;
      return { ...state, deathSupport: { ...state.deathSupport, ...action.patch } };
    /* 通常サポートの手動編集。
       装備枠（state.supports）は roster.supports からの投影なので、
       ここだけ直しても次の projectEquipmentFromRoster で消える。
       roster の該当 uid へ書き込み、投影し直す。 */
    case "PATCH_SUPPORT": {
      const roster = state.roster || {};
      const list = roster.supports || [];
      const idx = list.findIndex((s) => s.uid === action.id);
      if (idx < 0) return state;
      const supports = list.map((s, i) => (i === idx ? { ...s, ...action.patch } : s));
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
      const entry = {
        uid: makeOwnedUid("spt"),
        name,
        cond: String(spp.cond || ""),
        effect: String(spp.effect || ""),
        lp: String(spp.lp || ""),
        slot: isDeath ? "death" : "normal",
        equipped: false,
        resultId: action.resultId === undefined ? null : action.resultId,
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
          resultId: action.resultId,
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
    /* 装備は「外す」と「付ける」の2方向。通常スロットは最大2、死亡後は1。
       上限を超える指定は既存の装備を外してから付ける（置き換え）。 */
    case "SET_ROSTER_SUPPORT_EQUIPPED": {
      const roster = state.roster || {};
      const target = (roster.supports || []).find((s) => s.uid === action.uid);
      if (!target) return state;
      const equip = action.equipped !== false;
      const limit = supportSlotLimit(state, target.slot);
      let supports = (roster.supports || []).map((s) => (
        s.uid === action.uid ? { ...s, equipped: equip } : s
      ));
      if (equip) {
        const sameSlot = supports.filter((s) => s.slot === target.slot && s.equipped);
        if (sameSlot.length > limit) {
          /* 先に付けたものから順に外し、最後の1件（操作対象）を残す。 */
          const overflow = sameSlot.slice(0, sameSlot.length - limit);
          const overflowUids = new Set(overflow.map((s) => s.uid));
          supports = supports.map((s) => (overflowUids.has(s.uid) ? { ...s, equipped: false } : s));
        }
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
      if (target.slot === slot) return state;
      const limit = supportSlotLimit(state, slot);
      const others = (roster.supports || []).filter((s) => s.uid !== action.uid && s.slot === slot && s.equipped);
      const occupantUids = new Set(others.slice(0, Math.max(0, others.length + 1 - limit)).map((s) => s.uid));
      const supports = (roster.supports || []).map((s) => {
        if (s.uid === action.uid) return { ...s, slot, equipped: true };
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
      const entry = {
        uid: makeOwnedUid("spr"),
        name,
        equipped: false,
        resultId: action.resultId === undefined ? null : action.resultId,
        addedAt: Date.now(),
        notes: "",
        source: String(action.spirit?.source || catalogSourceByName("spirit", name))
      };
      const nextRoster = { ...roster, spirits: [...(roster.spirits || []), entry] };
      const withEquipment = { ...state, roster: nextRoster, ...projectEquipmentFromRoster(nextRoster) };
      /* 精神は欠片で買う。価格はDBから引く。 */
      return appendLedgerEntry(withEquipment, {
        kind: "spirit",
        name: entry.name,
        cost: priceSpirit(entry.name),
        resultId: action.resultId,
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
      /* 強化を外したら支出も戻す（残高を狂わせない）。 */
      return dropLedgerEntriesForRef(next, { kind: "enhancement", uid: action.id });
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
          exchange: action.exchange === undefined ? r.exchange : normalizeCurrency(action.exchange),
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
          date: String(action.date || new Date().toISOString().slice(0, 10)).slice(0, 10),
          income: { ...normalizeCurrency(action.income), tickets: normalizeTickets(action.income?.tickets) },
          exchange: normalizeCurrency(action.exchange),
          note: String(action.note || "").slice(0, 2000),
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
              ...(action.patch?.income !== void 0 ? { income: normalizeCurrency(action.patch.income) } : {}),
              ...(action.patch?.exchange !== void 0 ? { exchange: normalizeCurrency(action.patch.exchange) } : {}),
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
      const resultIds = [];
      const resultIdByName = new Map();
      for (const sub of action.actions || []) {
        if (!sub || typeof sub !== "object" || sub.type !== "ADD_RESULT") continue;
        next = appReducer(next, sub);
        const added = next.results[next.results.length - 1];
        if (!added) continue;
        resultIds.push(added.id);
        const key = String(added.name || "");
        resultIdByName.set(key, [...(resultIdByName.get(key) || []), added.id]);
      }
      let lastResultId = null;
      let resultIndex = 0;
      for (const sub of action.actions || []) {
        if (!sub || typeof sub !== "object") continue;
        if (sub.type === "ADD_RESULT") {
          lastResultId = resultIds[resultIndex] || null;
          resultIndex += 1;
          continue;
        }
        if (sub.type === "ADD_ENTRY" && lastResultId && !sub.resultId) {
          next = appReducer(next, { ...sub, resultId: lastResultId });
          continue;
        }
        const rosterSub = sub.type === "ADD_ROSTER" || sub.type === "ADD_ROSTER_EGO"
          || sub.type === "ADD_ROSTER_SUPPORT" || sub.type === "ADD_ROSTER_SPIRIT";
        if (rosterSub && sub.resultId === undefined && resultIds.length > 0) {
          /* 付随物の帰属先: via の名前が唯一のリザルトへ解決すればそこへ。
             曖昧・不一致なら未分類。via 無し（シナリオの獲得一覧）は直前へ。 */
          let target = null;
          const viaNames = (Array.isArray(sub.via) ? sub.via : []).filter(Boolean);
          if (viaNames.length) {
            const ids = new Set();
            for (const viaName of viaNames) {
              for (const id of resultIdByName.get(String(viaName)) || []) ids.add(id);
            }
            target = ids.size === 1 ? [...ids][0] : null;
          } else {
            target = lastResultId;
          }
          next = appReducer(next, { ...sub, resultId: target });
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
          resultId: action.resultId || null,
          ref: action.ref && typeof action.ref === "object" ? { kind: String(action.ref.kind || ""), uid: String(action.ref.uid || "") } : null,
          at: Number(action.at) || Date.now(),
          note: String(action.note || "").slice(0, 2000)
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
              ...(action.patch?.resultId !== void 0 ? { resultId: action.patch.resultId || null } : {}),
              ...(action.patch?.note !== void 0 ? { note: String(action.patch.note).slice(0, 2000) } : {})
            }
          : e))
      };
    /* 帰属の差し替え。ドラッグ&ドロップはこの1つだけを呼ぶ。 */
    case "SET_ENTRY_RESULT": {
      const entries = (state.entries || []).map((e) => (e.id === action.id ? { ...e, resultId: action.resultId || null } : e));
      if (!(state.entries || []).some((e) => e.id === action.id)) return state;
      return { ...state, entries };
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
      return { ...state, uniqueBuffs: [...state.uniqueBuffs, {
        id: `ub-${Date.now()}`,
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
      return normalizeStatusCollections({
        ...state,
        inventory: [],
        personaMode: "custom",
        personaNo: `custom-${Date.now()}`,
        personaSrc: {
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
          keywords: [],
          __custom: true
        },
        hp: "100",
        san: "45",
        speed: "1d5",
        bullets: "\xD7",
        resS: "\u666E\u901A",
        resP: "\u666E\u901A",
        resB: "\u666E\u901A",
        pas: { name: "", cond: "", always: "", effect: "", quick: "" },
        skills: [],
        uniqueBuffs: [],
        charName: state.charName
      });
    }
    /* V65r29: Google Docs 等の同期人格草案を、確認済みのカスタム人格として装備する。
       解析器は UI 側でプレビュー済み。既存データを置換せず、元の所持人格は保持する。 */
    case "IMPORT_PERSONA_DRAFT": {
      const src = action.persona;
      if (!src || !src.__custom) return state;
      const affiliation = action.affiliation || null;
      const affiliatedMode = affiliation?.mode === "n" || affiliation?.mode === "t" ? affiliation.mode : null;
      const affiliatedNo = affiliatedMode ? affiliation?.no : null;
      const affiliatedSource = affiliatedMode
        ? ((affiliatedMode === "n" ? window.DB?.normal_personas : window.DB?.tokui_personas) || []).find((entry) => String(entry?.no) === String(affiliatedNo))
        : null;
      const isAffiliated = !!affiliatedSource;
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
      const uid = `custom-${Date.now()}`;
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
      const syncRank = ["0", "00", "000"].includes(action.syncRank) ? action.syncRank : null;
      const importedSource = isAffiliated
        ? { ...effectiveSrc, __custom: false, __draftImported: true, __affiliation: { mode: affiliatedMode, no: affiliatedSource.no } }
        : effectiveSrc;
      const importedBuild = {
        savedAt: Date.now(),
        hp: String(effectiveSrc.hp ?? 100), san: String(effectiveSrc.san ?? 45), speed: effectiveSrc.speed || "1d5", initiative: 0, bullets: effectiveSrc.bullets || "×",
        resS: effectiveSrc.res_slash || "普通", resP: effectiveSrc.res_pierce || "普通", resB: effectiveSrc.res_blunt || "普通",
        pas: { name: effectiveSrc.passive_name || "", cond: effectiveSrc.passive_cond || "", always: effectiveSrc.passive_always || "", effect: effectiveSrc.passive_effect || "", quick: "" },
        pas2Enabled: !!action.secondaryPassive?.name,
        pas2: { name: action.secondaryPassive?.name || "", cond: action.secondaryPassive?.cond || "", always: action.secondaryPassive?.always || "", effect: action.secondaryPassive?.effect || "" },
        skills: cloneJSON(skills),
        uniqueBuffs: cloneJSON(uniqueBuffs),
        personaSrc: cloneJSON(importedSource),
        syncedManual: true,
        defaultStatuses: mergeDefaultSelfStatusEntries(state.defaultStatuses, collectSelfManagedStatusEntries(importedSource)),
        selfStatusCandidates: detectSelfStatusCandidates(importedSource, [
          ...(state.defaultStatuses || getFactoryDefaultStatuses()).map((item) => item?.label),
          ...(state.customStatuses || []).filter((item) => (item?.place || "status") === "status").map((item) => item?.label),
          ...collectSelfManagedStatusEntries(importedSource).map((entry) => entry.label)
        ])
      };
      let personas = (state.roster?.personas || []).map((entry) => ({ ...entry, equipped: false }));
      if (isAffiliated) {
        const key = `${affiliatedMode}:${affiliatedSource.no}`;
        const existingIndex = personas.findIndex((entry) => `${entry.mode}:${entry.no}` === key);
        const affiliatedEntry = {
          uid: existingIndex >= 0 ? personas[existingIndex].uid : `pr-${Date.now()}`,
          no: affiliatedSource.no,
          mode: affiliatedMode,
          displayName: importedSource.name || affiliatedSource.name,
          syncRank,
          syncMax: !!action.syncMax,
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
          syncRank,
          syncMax: !!action.syncMax,
          lcb: false,
          equipped: true,
          notes: ""
        });
      }
      return normalizeStatusCollections({
        ...state,
        inventory: [],
        personaMode: isAffiliated ? affiliatedMode : "custom",
        personaNo: isAffiliated ? affiliatedSource.no : uid,
        personaSrc: importedSource,
        syncedManual: true,
        hp: String(effectiveSrc.hp ?? 100),
        san: String(effectiveSrc.san ?? 45),
        speed: effectiveSrc.speed || "1d5",
        bullets: effectiveSrc.bullets || "×",
        resS: effectiveSrc.res_slash || "普通",
        resP: effectiveSrc.res_pierce || "普通",
        resB: effectiveSrc.res_blunt || "普通",
        pas: { name: effectiveSrc.passive_name || "", cond: effectiveSrc.passive_cond || "", always: effectiveSrc.passive_always || "", effect: effectiveSrc.passive_effect || "", quick: "" },
        pas2Enabled: !!action.secondaryPassive?.name,
        pas2: { name: action.secondaryPassive?.name || "", cond: action.secondaryPassive?.cond || "", always: action.secondaryPassive?.always || "", effect: action.secondaryPassive?.effect || "" },
        skills,
        uniqueBuffs,
        defaultStatuses: importedBuild.defaultStatuses,
        selfStatusCandidates: detectSelfStatusCandidates(importedSource, [
          ...(state.defaultStatuses || getFactoryDefaultStatuses()).map((item) => item?.label),
          ...(state.customStatuses || []).filter((item) => (item?.place || "status") === "status").map((item) => item?.label),
          ...collectSelfManagedStatusEntries(importedSource).map((entry) => entry.label)
        ]),
        charName: state.charName,
        roster: { ...state.roster, personas },
        historyRecent: [`${isAffiliated ? affiliatedMode : "custom"}:${isAffiliated ? affiliatedSource.no : uid}`, ...(state.historyRecent || []).filter((key) => key !== `${isAffiliated ? affiliatedMode : "custom"}:${isAffiliated ? affiliatedSource.no : uid}`)].slice(0, 20)
      });
    }
    /* v55: 創作人格の保存 — 編集内容の全スナップショットを所持人格一覧に登録する。
       装備モード中の全フィールド (名前/ステータス/耐性/パッシブ/スキル/固有バフ/
       キーワード) を固めて roster に保存。既に登録済みなら上書き更新する。 */
    case "SAVE_CUSTOM_PERSONA": {
      const src = state.personaSrc;
      if (!src || !src.__custom) return state;
      const snap = {
        ...src,
        hp: state.hp === "" || state.hp == null ? src.hp ?? 100 : parseInt(state.hp, 10),
        san: state.san === "" || state.san == null ? src.san ?? 45 : parseInt(state.san, 10),
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
          rank: s.rank || `\u30B9\u30AD\u30EB${i}`,
          type: s.type || "",
          sin: s.sin || "",
          aoe: s.aoe || "",
          aoeCount: s.aoeCount || "",
          name: s.name || "",
          effect: s.effect || "",
          dice: (s.dice || []).map((d) => ({ roll: d.roll || "", effect: d.effect || "" }))
        })),
        unique_buffs: (state.uniqueBuffs || []).map((b) => ({
          name: b.name || "",
          type: b.type || "\u30D0\u30D5",
          initial: b.initial !== void 0 ? b.initial : 0,
          max: b.max || 20,
          desc: b.desc || "",
          place: b.place || "status",
          // 自作人格として保存する際も、対象付与専用の宣言は失わない。
          noST: b.noST === true
        })),
        keywords: src.keywords || [],
        __custom: true,
        __saved: true
      };
      const uid = state.personaNo || `custom-${Date.now()}`;
      const personas = state.roster.personas.map((p) => ({ ...p }));
      const idx = personas.findIndex((p) => p.uid === uid);
      const entry = {
        uid,
        no: uid,
        mode: "custom",
        src: snap,
        syncRank: null,
        syncMax: false,
        lcb: false,
        equipped: true,
        notes: ""
      };
      if (idx >= 0) personas[idx] = { ...personas[idx], src: snap, equipped: true };
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
        personas[idx] = { ...personas[idx], build };
      } else {
        personas.push({
          uid: `pr-${Date.now()}`, no: state.personaNo, mode: state.personaMode,
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
      if (seal.atPastLength > index) {
        skipHistoryRef.current = true;
        dispatch(seal.action);
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
