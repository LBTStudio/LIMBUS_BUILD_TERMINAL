const STORAGE_KEY = "lbt_v46_state";
// 基本ルールPDFのバフ（303頁）→デバフ（306〜307頁）→中立バフ（310頁）の掲載順。
// 人格候補・E.G.O検索・出力で共通して使い、PDF外の弾丸は標準一覧の最後に置く。
window.LBT_PDF_KEYWORD_ORDER = [
  "パワー", "忍耐", "クイック", "保護", "充電", "呼吸", "ダメージ量増加",
  "虚弱", "武装解除", "束縛", "脆弱", "火傷", "沈潜", "出血", "恐慌", "破裂", "振動", "ダメージ量減少", "毒", "麻痺",
  "バリア", "弾丸"
];
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
function enrichPersonaKeywords(database) {
  const keywords = window.LBT_PDF_KEYWORD_ORDER || [];
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
const HISTORY_LIMIT = 60;
const SAVE_SCHEMA_VERSION = 5;
const SUPPORT_DEATH_RE = /(死亡|退場|戦闘不能|死亡した|死亡時|味方死亡|自分が死亡|撃破|倒れ)/;
function isDeathSupportPassiveRecord(s) {
  const txt = `${s?.name || ""} ${s?.cond || ""} ${s?.effect || ""}`;
  return SUPPORT_DEATH_RE.test(txt);
}
function cloneJSON(obj) {
  return obj == null ? obj : JSON.parse(JSON.stringify(obj));
}
// 派生スキルは根の連番ではなく、親スキルと派生番号を持つ（例：スキル4 → スキル4-2）。
// rank文字列だけの旧データも読み込み時に親子情報へ正規化する。
function parseDerivedSkillRank(rank) {
  const match = String(rank || "").match(/^(スキル\d+)-(\d+)$/);
  return match ? { parent: match[1], index: Math.max(2, Number(match[2]) || 2) } : null;
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
  if (parent && Number.isFinite(derivedIndex) && derivedIndex >= 2) {
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
function egoVariantLabel(value) {
  return value === "assimilation" ? "同化" : value === "influence" ? "影響" : "スキル";
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
function statusGainTailMatches(tail) {
  const gain = "(?:得る|得て(?!い)|獲得(?:する|して)?)(?![てたな])";
  if (new RegExp(`^(?:[0-9０-９]*を?[0-9０-９]*を?)${gain}`, "u").test(tail)) return true;
  // 「呼吸2とクイック1を得る」「呼吸3と次のRにクイック1を得る」のように、
  // 複数の状態で取得動詞を共有する本文を扱う。対象側は呼出元で除外する。
  // クイック等、既定一覧に常設される語も連結の区切りとしては認識する。
  // ただし呼出側の追加対象はLBT_TRACKABLE_STATUSESだけなので、常設値を重複追加しない。
  const chainVocabulary = [...new Set([...LBT_TRACKABLE_STATUSES, ...(window.LBT_PDF_KEYWORD_ORDER || [])])];
  const names = chainVocabulary.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
  const chained = `^(?:[0-9０-９]*を?)(?:(?:と|、|及び|・)(?:(?:次のR|R開始時|戦闘開始時)(?:に|、)?)?(?:${names})(?:[0-9０-９]*を?)){1,4}${gain}`;
  return new RegExp(chained, "u").test(tail);
}
function textAwardsSelfManagedStatus(rawText, label) {
  const text = stripStatusDetectionLiterals(rawText);
  if (!text.includes(label)) return false;
  let index = text.indexOf(label);
  while (index >= 0) {
    if (statusOccurrenceIsStandalone(text, label, index) && !statusOccurrenceHasForeignRecipient(text, index)) {
      const tail = text.slice(index + label.length, index + label.length + 14);
      // 「保護1を得る」「挑発値を10得る」に加え、後続の自己変換へつながる「得て」を受ける。
      // 「得ている」は状態参照なので除外する。
      if (statusGainTailMatches(tail)) return true;
      const before = text.slice(Math.max(0, index - 14), index);
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
function normalizeStateShape(raw) {
  const next = { ...raw };
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
  if (!next.roster || typeof next.roster !== "object") next.roster = { personas: [], egos: [] };
  if (!Array.isArray(next.roster.personas)) next.roster.personas = [];
  if (!Array.isArray(next.roster.egos)) next.roster.egos = [];
  next.roster = {
    ...next.roster,
    // 同期MAXは同期ランク（0/00/000）と別に保存する。旧保存データはfalseへ補完する。
    personas: next.roster.personas.map((entry) => ({
      ...entry,
      syncRank: ["0", "00", "000"].includes(String(entry?.syncRank || "")) ? String(entry.syncRank) : null,
      syncMax: entry?.syncMax === true
    }))
  };
  // 導入済みアイテムはビルド固有の所持状態。旧保存データには空配列を補完する。
  if (!Array.isArray(next.inventory)) next.inventory = [];
  next.inventory = next.inventory.filter((entry) => entry && entry.itemId).map((entry) => ({
    uid: entry.uid || `it-${Date.now()}-${entry.itemId}`,
    itemId: String(entry.itemId),
    quantity: Math.min(99, Math.max(1, Number.parseInt(entry.quantity, 10) || 1)),
    memo: entry.memo !== false,
    palette: entry.palette !== false
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
  next.skills = migrateLegacyDerivedSkills(next.skills || [], next.personaSrc?.skills || []);
  if (next.personaSrc?.skills) next.personaSrc = { ...next.personaSrc, skills: migrateLegacyDerivedSkills(next.personaSrc.skills) };
  next.egoSlots = normalizeEgoSlots(next.egoSlots);
  return normalizeStatusCollections(next);
}
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
  pas2: { name: "", cond: "", effect: "" },
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
  roster: {
    personas: [],
    // {uid, no, mode, syncRank:'0'|'00'|'000'|null, syncMax:bool, lcb:bool, equipped:bool, notes}
    egos: []
    // {uid, no, rank, analyzed:bool, analyzeMax:bool, notes}
  },
  // DB由来のアイテムをビルドへ導入した一覧。{uid,itemId,quantity,memo,palette}
  inventory: [],
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
  moraleLine: "12",
  // Extra commands (memo)
  extraCmd: "",
  // T18/T19: メモ/パレットの項目別出力除外（セクションタイトル→true で除外）
  outputExclude: { memo: {}, palette: {} },
  // 同期情報の表示設定。同期MAXは名称の[MAX]表記として常に反映する。
  shareOptions: { showSyncRank: true, showSyncRankInOutput: false },
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
function appReducer(state, action) {
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
    case "PATCH_SPIRIT":
      return { ...state, ...action.patch };
    case "RESET":
      return {
        ...INIT_STATE,
        favorites: state.favorites,
        historyRecent: state.historyRecent,
        ui: state.ui
      };
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
        "moraleLine","extraCmd","outputExclude","shareOptions","inventory","customItems"];
      const patch = {};
      const src = action.state || {};
      const fields = Array.isArray(action.fields) ? action.fields : [];
      for (const f of fields) {
        if (!ALLOWED.includes(f)) continue;
        if (!(f in src)) continue;
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
        place: b.place || "status"
      }));
      const uniqKey = `${mode}:${no}`;
      let personas = state.roster.personas.slice();
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
        inventory: [],
        pas2Enabled: false,
        pas2: { name: "", cond: "", effect: "" },
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
        charName: state.charName || src.name || "",
        roster: { ...state.roster, personas },
        historyRecent: hist
      };
      // T35/T36: 所持人格に保存済みビルドがある場合はそちらを復元する。
      // （精神・サポートパッシブ・E.G.O・スキル・固有バフ・強化を人格ごとに割り振り保持）
      if (savedBuild) {
        const b = savedBuild;
        return normalizeStatusCollections({
          ...base,
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
          inventory: Array.isArray(b.inventory) ? cloneJSON(b.inventory) : [],
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
    case "ADD_ROSTER": {
      const { mode, no } = action;
      const uniqKey = `${mode}:${no}`;
      if (state.roster.personas.some((p) => `${p.mode}:${p.no}` === uniqKey)) return state;
      return { ...state, roster: { ...state.roster, personas: [
        ...state.roster.personas,
        { uid: `pr-${Date.now()}`, no, mode, syncRank: null, syncMax: false, lcb: false, equipped: false, notes: "" }
      ] } };
    }
    /* V23: 所持EGO一覧への追加・削除（人格の ADD_ROSTER / REMOVE_ROSTER に相当） */
    case "ADD_ROSTER_EGO": {
      const { rank, no } = action;
      if ((state.roster.egos || []).some((e) => e.rank === rank && e.no === no)) return state;
      const egos = [...(state.roster.egos || []), { uid: `er-${Date.now()}`, no, rank, analyzed: false, analyzeMax: false, notes: "", build: null }];
      return { ...state, roster: { ...state.roster, egos } };
    }
    case "REMOVE_ROSTER_EGO": {
      const egos = (state.roster.egos || []).filter((e) => e.uid !== action.uid);
      return { ...state, roster: { ...state.roster, egos } };
    }
    case "REMOVE_ROSTER_BATCH": {
      const ids = new Set(action.uids || []);
      return { ...state, roster: { ...state.roster, personas: (state.roster.personas || []).filter((entry) => !ids.has(entry.uid)) } };
    }
    case "REMOVE_ROSTER_EGO_BATCH": {
      const ids = new Set(action.uids || []);
      return { ...state, roster: { ...state.roster, egos: (state.roster.egos || []).filter((entry) => !ids.has(entry.uid)) } };
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
          next.uniqueBuffs = cloneJSON(dbSrc.unique_buffs || []).map((b, i) => ({ id: `ub-${Date.now()}-${i}`, name: b.name || "", type: b.type || "\u56FA\u6709\u30D0\u30D5", initial: b.initial ?? 0, max: b.max ?? 0, desc: b.desc || "", place: b.place || "status" }));
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
        : [...current, { uid: `it-${Date.now()}-${itemId}`, itemId, quantity: 1, memo: true, palette: true }];
      return { ...state, inventory };
    }
    case "PATCH_ITEM": {
      const inventory = (state.inventory || []).map((entry) => entry.uid === action.uid ? { ...entry, ...action.patch, quantity: clampItemQuantity(state, entry.itemId, action.patch?.quantity ?? entry.quantity) } : entry);
      return { ...state, inventory };
    }
    case "REMOVE_ITEM":
      return { ...state, inventory: (state.inventory || []).filter((entry) => entry.uid !== action.uid) };
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
    case "SET_EGO_SLOT": {
      let nextValue = action.value ? cloneJSON(action.value) : null;
      // V01/V25: 所持EGOに保存済みの解析ビルドがあれば DB 既定の代わりにそちらを装備する。
      if (nextValue) {
        const saved = (state.roster.egos || []).find((e) => e.rank === action.rank && e.no === nextValue.no && e.build);
        if (saved) nextValue = { ...nextValue, ...cloneJSON(saved.build) };
      }
      let rosterEgos = [...(state.roster?.egos || [])];
      // 装備は所持の確定行為として扱う。解析を終える前でもライブラリから再選択できるようにする。
      if (nextValue && !rosterEgos.some((entry) => entry.rank === action.rank && entry.no === nextValue.no)) {
        rosterEgos.push({ uid: `er-${Date.now()}`, no: nextValue.no, rank: action.rank, analyzed: false, analyzeMax: false, notes: "", build: null });
      }
      const nextEgoSlots = normalizeEgoSlots({ ...state.egoSlots, [action.rank]: nextValue });
      // 装備・付け替え・解除はどれも直接編集を終了する。解除後に別スロットの詳細へ
      // 編集状態だけが残り、クリック一回で解析面が表示されることを防ぐ。
      const nextUi = { ...state.ui, ...(nextValue ? { egoListExpanded: false } : {}), egoDetailSlot: null };
      return normalizeStatusCollections({ ...state, egoSlots: nextEgoSlots, roster: { ...state.roster, egos: rosterEgos }, ui: nextUi, egoManual: false });
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
      if (idx >= 0) egos[idx] = { ...egos[idx], analyzed: true, build };
      else egos.push({ uid: `er-${Date.now()}`, no: slot.no, rank, analyzed: true, analyzeMax: false, notes: "", build });
      return { ...state, roster: { ...state.roster, egos } };
    }
    /* V01/V25: 所持EGOの保存解析を破棄して DB 既定に戻す */
    case "CLEAR_EGO_BUILD": {
      const egos = (state.roster.egos || []).map((e) => e.uid === action.uid ? { ...e, build: null } : e);
      return { ...state, roster: { ...state.roster, egos } };
    }
    case "PATCH_EGO_SLOT": {
      const cur = state.egoSlots[action.rank];
      if (!cur) return state;
      return normalizeStatusCollections({ ...state, egoSlots: normalizeEgoSlots({ ...state.egoSlots, [action.rank]: { ...cur, ...action.patch } }) });
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
      return normalizeStatusCollections({ ...state, egoSlots: normalizeEgoSlots({ ...state.egoSlots, [action.rank]: next }) });
    }
    case "PATCH_EGO_DICE": {
      const cur = state.egoSlots[action.rank];
      if (!cur) return state;
      const next = cloneJSON(cur);
      const list = action.skillKey === "sub_skills" ? next.sub_skills?.[action.index]?.dice : next[action.skillKey]?.dice;
      if (!list?.[action.diceIdx]) return state;
      list[action.diceIdx] = { ...list[action.diceIdx], ...action.patch };
      return normalizeStatusCollections({ ...state, egoSlots: normalizeEgoSlots({ ...state.egoSlots, [action.rank]: next }) });
    }
    case "ADD_EGO_DICE": {
      const cur = state.egoSlots[action.rank];
      if (!cur) return state;
      const next = cloneJSON(cur);
      const list = action.skillKey === "sub_skills" ? next.sub_skills?.[action.index]?.dice : next[action.skillKey]?.dice;
      if (!Array.isArray(list)) return state;
      list.push({ roll: "", dval: "", d: "", dPlus: false, dCnt: false, plus: false, effect: "" });
      return normalizeStatusCollections({ ...state, egoSlots: normalizeEgoSlots({ ...state.egoSlots, [action.rank]: next }) });
    }
    case "REMOVE_EGO_DICE": {
      const cur = state.egoSlots[action.rank];
      if (!cur) return state;
      const next = cloneJSON(cur);
      const list = action.skillKey === "sub_skills" ? next.sub_skills?.[action.index]?.dice : next[action.skillKey]?.dice;
      if (!Array.isArray(list)) return state;
      if (action.diceIdx < 0 || action.diceIdx >= list.length) return state;
      list.splice(action.diceIdx, 1);
      return normalizeStatusCollections({ ...state, egoSlots: normalizeEgoSlots({ ...state.egoSlots, [action.rank]: next }) });
    }
    /* ---- Support ---- */
    case "ADD_SUPPORT":
      if ((action.spp?.name || "") && (state.supports.some((s) => s.name === action.spp.name) || state.deathSupport?.name === action.spp.name)) return state;
      return { ...state, supports: [...state.supports, { id: `spp-${Date.now()}`, name: "", cond: "", effect: "", lp: "", ...action.spp }] };
    case "PATCH_SUPPORT":
      return { ...state, supports: state.supports.map((s) => s.id === action.id ? { ...s, ...action.patch } : s) };
    case "REMOVE_SUPPORT":
      return { ...state, supports: state.supports.filter((s) => s.id !== action.id) };
    case "SET_DEATH_SUPPORT":
      if (!action.spp) return { ...state, deathSupport: null };
      if ((action.spp?.name || "") && state.supports.some((s) => s.name === action.spp.name)) return state;
      return { ...state, deathSupport: { id: `sppd-${Date.now()}`, name: "", cond: "", effect: "", lp: "", ...action.spp } };
    case "PATCH_DEATH_SUPPORT":
      if (!state.deathSupport) return state;
      return { ...state, deathSupport: { ...state.deathSupport, ...action.patch } };
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
        charName: state.charName || action.name || "カスタムPC"
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
          place: b.place || "status"
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
      const build = {
        savedAt: Date.now(),
        hp: state.hp, san: state.san, speed: state.speed, initiative: state.initiative, bullets: state.bullets,
        resS: state.resS, resP: state.resP, resB: state.resB,
        pas: cloneJSON(state.pas), pas2Enabled: !!state.pas2Enabled, pas2: cloneJSON(state.pas2),
        skills: cloneJSON(state.skills || []),
        uniqueBuffs: cloneJSON(state.uniqueBuffs || []),
        spirit: state.spirit, spiritMorale: state.spiritMorale,
        spiritConfuse: state.spiritConfuse, spiritAlways: state.spiritAlways,
        supports: cloneJSON(state.supports || []),
        deathSupport: state.deathSupport ? cloneJSON(state.deathSupport) : null,
        egoSlots: cloneJSON(state.egoSlots || {}),
        enhancements: cloneJSON(state.enhancements || []),
        inventory: cloneJSON(state.inventory || []),
        personaSrc: cloneJSON(state.personaSrc),
        syncedManual: !!state.syncedManual,
        // V06: 代入式・ステータス関係を人格ビルドに紐付けて人格ごとに管理する
        formulas: cloneJSON(state.formulas || []),
        customStatuses: cloneJSON(state.customStatuses || []),
        defaultStatuses: state.defaultStatuses ? cloneJSON(state.defaultStatuses) : null,
        selfStatusCandidates: cloneJSON(state.selfStatusCandidates || [])
      };
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
    case "APPLY_SPIRIT": {
      const sp = action.spirit;
      return {
        ...state,
        spirit: sp.name || "",
        spiritMorale: sp.morale_effect || "",
        spiritConfuse: sp.confuse_effect || "",
        spiritAlways: sp.always_effect || ""
      };
    }
    default:
      return state;
  }
}
function useAppState() {
  const [state, dispatch] = React.useReducer(appReducer, INIT_STATE, (init) => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        return normalizeStateShape({ ...init, ...saved, ui: { ...init.ui, ...saved.ui || {} } });
      }
    } catch (e) {
    }
    return normalizeStateShape(init);
  });
  const historyRef = React.useRef({ past: [], future: [] });
  const skipHistoryRef = React.useRef(false);
  React.useEffect(() => {
    const t = setTimeout(() => {
      try {
        const { ui, ...rest } = state;
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          ...rest,
          ui: {
            previewTab: ui.previewTab,
            currentSection: ui.currentSection,
            codexMode: ui.codexMode,
            codexExpanded: ui.codexExpanded,
            previewCollapsed: ui.previewCollapsed || {}
          }
        }));
      } catch (e) {
      }
    }, 400);
    return () => clearTimeout(t);
  }, [state]);
  const wrappedDispatch = React.useCallback((action) => {
    if (action.type !== "SET_UI" && !skipHistoryRef.current) {
      historyRef.current.past.push(state);
      if (historyRef.current.past.length > HISTORY_LIMIT) historyRef.current.past.shift();
      historyRef.current.future = [];
    }
    skipHistoryRef.current = false;
    dispatch(action);
  }, [state]);
  const undo = React.useCallback(() => {
    if (!historyRef.current.past.length) return;
    const prev = historyRef.current.past.pop();
    historyRef.current.future.unshift(state);
    skipHistoryRef.current = true;
    dispatch({ type: "HYDRATE", state: prev });
  }, [state]);
  const redo = React.useCallback(() => {
    if (!historyRef.current.future.length) return;
    const next = historyRef.current.future.shift();
    historyRef.current.past.push(state);
    skipHistoryRef.current = true;
    dispatch({ type: "HYDRATE", state: next });
  }, [state]);
  const canUndo = historyRef.current.past.length > 0;
  const canRedo = historyRef.current.future.length > 0;
  return [state, wrappedDispatch, { undo, redo, canUndo, canRedo }];
}
window.useAppState = useAppState;
window.appReducer = appReducer;
window.INIT_STATE = INIT_STATE;
