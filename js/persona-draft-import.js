/* LBT persona draft paste parser. Keeps parsing deterministic and entirely client-side. */
(function () {
  const toHalfWidth = (value) => String(value || "").replace(/[０-９Ａ-Ｚａ-ｚ]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xFEE0)).replace(/[：︰﹕]/g, ":").replace(/[＋﹢]/g, "+").replace(/[‐‑‒–—－−﹣]/g, "-").replace(/[（]/g, "(").replace(/[）]/g, ")").replace(/　/g, " ");
  const forMatch = (value) => toHalfWidth(value).replace(/^`{3,}\s*|\s*`{3,}$/g, "").replace(/\s*-\s*/g, "-").replace(/[\t ]+/g, " ").trim();
  const clean = (value) => String(value ?? "").replace(/\r/g, "").trim();
  const linesOf = (value) => String(value || "").replace(/\r/g, "").split("\n").map((line) => line.trim());
  const appendLine = (target, key, value) => {
    const next = clean(value);
    if (next) target[key] = target[key] ? `${target[key]}\n${next}` : next;
  };
  // Syntax is detected separately from prose; preserve effect punctuation.
  const detectDice = (raw) => {
    const line = clean(raw);
    const match = toHalfWidth(line).match(/^((?:\d+\s*-\s*)?(?:\d+|\{[^{}]+\})\s*[dD]\s*(?:\d+|\{[^{}]+\})(?:\s*[+*/-]\s*(?:\d+|\{[^{}]+\}))*)(?=$|\s|:|\[)/);
    if (!match) return null;
    return { roll: match[1].replace(/\s+/g, ""), effect: line.slice(match[1].length).replace(/^\s*[:：]?\s*/, "") };
  };
  const detectBuffHeader = (raw) => {
    const line = clean(raw);
    if (line[0] !== "[") return null;
    let depth = 0, end = -1;
    for (let i = 0; i < line.length; i += 1) {
      if (line[i] === "[") depth += 1;
      if (line[i] === "]" && --depth === 0) { end = i; break; }
    }
    if (end < 0) return null;
    const tail = line.slice(end + 1).trim();
    // Metadata must start the tail. [1R] and [人格専用効果] remain prose.
    const metadata = tail.match(/^(?:(?:最大(?:値|数)?\s*[:：;；]?\s*[０-９0-9]+|中立デバフ|中立バフ|デバフ|バフ|その他|特別処理)\s*)+/);
    if (!metadata) return null;
    const normalized = forMatch(metadata[0]);
    const max = normalized.match(/最大(?:値|数)?\s*[:;]?\s*(\d+)/);
    return { name: line.slice(1, end), type: (normalized.match(/中立デバフ|中立バフ|デバフ|バフ|その他|特別処理/) || ["バフ"])[0],
      max: max ? Number(max[1]) : 20, desc: tail.slice(metadata[0].length).replace(/^効果\s*[:：]\s*/, "") };
  };
  const sectionTitle = (line) => clean(line).match(/^[◯○●]\s*(.+)$/)?.[1] || "";
  const buffHeaderAt = (lines, index) => {
    const direct = detectBuffHeader(lines[index]);
    if (direct) return { header: direct, end: index };
    if (!/^\[.*\]$/.test(clean(lines[index]))) return null;
    let next = index + 1;
    while (next < lines.length && !clean(lines[next])) next += 1;
    const combined = detectBuffHeader(`${clean(lines[index])} ${clean(lines[next])}`);
    return combined ? { header: combined, end: next } : null;
  };
  const stripPersonaQuotes = (value) => {
    const raw = clean(value).replace(/^(?:人格\s*(?:名|名称)?|名称)\s*[:：]\s*/i, "").trim();
    const wrapped = [
      [/^「\s*([\s\S]*?)\s*」$/u, 1],
      [/^『\s*([\s\S]*?)\s*』$/u, 1],
      [/^"\s*([\s\S]*?)\s*"$/u, 1],
      [/^【\s*([\s\S]*?)\s*】$/u, 1],
      [/^\[\s*([\s\S]*?)\s*\]$/u, 1],
      [/^（\s*([\s\S]*?)\s*）$/u, 1],
      [/^\(\s*([\s\S]*?)\s*\)$/u, 1]
    ];
    const match = wrapped.map(([pattern]) => raw.match(pattern)).find(Boolean);
    return clean(match ? match[1] : raw);
  };
  const personaNameFromLine = (line) => {
    const raw = clean(line).replace(/^`{3,}\s*|\s*`{3,}$/g, "").trim();
    const normalized = forMatch(line);
    const labeled = normalized.match(/^(?:人格\s*(?:名|名称)?|名称)\s*:\s*(.+)$/i);
    const labeledRaw = raw.match(/^(?:人格\s*(?:名|名称)?|名称)\s*[:：]\s*(.+)$/i);
    if (labeled) return { value: stripPersonaQuotes(labeledRaw ? labeledRaw[1] : labeled[1]), labeled: true };
    const quoted = raw.match(/^[「『\"]\s*([^」』\"]+?)\s*[」』\"]/);
    if (quoted) return stripPersonaQuotes(quoted[1]);
    return "";
  };
  const findLastSyncDraftStart = (lines) => lines.reduce((found, line, index) => /同期\s*(?:MAX)?\s*草案/i.test(forMatch(line)) ? index : found, -1);
  const normalizeRank = (raw, fallback) => {
    const rank = toHalfWidth(raw).replace(/\s+/g, "");
    return rank ? `スキル${rank}` : `スキル${fallback}`;
  };
  const numeric = (value, fallback) => {
    const found = String(value || "").match(/\d+/);
    return found ? Number(found[0]) : fallback;
  };
  const isDiceFormula = (value) => /^\s*(?:\d+|\{[^{}]+\})\s*[dD]\s*(?:\d+|\{[^{}]+\})(?:\s*[+\-]\s*(?:\d+|\{[^{}]+\}))?\s*$/.test(toHalfWidth(value));
  const collectField = (text, label) => {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = text.match(new RegExp(`${escaped}\\s*[:：]\\s*([^\\n]*?)(?=\\s*(?:HP|SAN|速度|弾丸)\\s*[:：]|\\n|$)`, "i"));
    return match ? clean(match[1]) : "";
  };
  const parseResistances = (lines) => {
    const values = { slash: "普通", pierce: "普通", blunt: "普通" };
    const keys = { "斬撃": "slash", "貫通": "pierce", "打撃": "blunt" };
    for (const line of lines.slice(0, 24)) {
      const matches = [...forMatch(line).matchAll(/(斬撃|貫通|打撃)\s*:\s*(脆弱|弱点|普通|抵抗|耐性|免疫)/g)];
      for (const match of matches) values[keys[match[1]]] = match[2];
    }
    return values;
  };
  const parsePassives = (lines) => {
    const passives = [];
    let current = null;
    let section = "";
    const push = () => {
      if (current?.name) passives.push(current);
      current = null;
      section = "";
    };
    const stop = (line) => /^【\s*戦術(?:\s*スキル\s*[^】]*)?\s*】/.test(line) || /^(?:戦術\s*)?\d+(?:[-－ー]\d+)?\s*[:：]/.test(toHalfWidth(line)) || /^(固有|人格コンセプト)/.test(line) || /戦術|固有/.test(sectionTitle(line));
    for (let index = 0; index < lines.length; index += 1) {
      const line = clean(lines[index]);
      const normalized = forMatch(line);
      if (!line) continue;
      const named = line.match(/^パッシブ\s*名\s*[:：]\s*(.+)$/)
        || (current && line.match(/^名称\s*[:：]\s*(.+)$/));
      if (named) {
        push();
        current = { name: clean(named[1]), cond: "", always: "", effect: "" };
        continue;
      }
      if (/^【\s*パッシブ(?:\s*\d+)?\s*】/.test(normalized) || /^(?:人格)?パッシブ(?:\s*\d+)?$/.test(sectionTitle(line))) {
        push();
        current = { name: "", cond: "", always: "", effect: "" };
        continue;
      }
      if (!current) continue;
      if (stop(normalized)) {
        push();
        continue;
      }
      const condition = line.match(/^(?:発動\s*)?条件\s*[:：]\s*(.*)$/);
      const always = line.match(/^常時(?:効果|発動)?\s*[:：]\s*(.*)$/);
      const effect = line.match(/^効果\s*[:：]\s*(.*)$/);
      if (condition) { current.cond = clean(condition[1]); section = "cond"; continue; }
      if (always) { appendLine(current, "always", always[1]); section = "always"; continue; }
      if (effect) { appendLine(current, "effect", effect[1]); section = "effect"; continue; }
      if (!current.name && !section) { current.name = line; continue; }
      if (section) appendLine(current, section, line);
    }
    push();
    return passives;
  };
  const parseSkills = (lines) => {
    const skills = [];
    const skillTypePattern = "(?:斬撃|貫通|打撃|回避|防御|物理|(?:斬撃|貫通|打撃)?反撃|マッチ可能防御|マッチ可能(?:斬撃|貫通|打撃)?反撃)";
    let current = null;
    const push = () => {
      if (current?.name || current?.dice?.length) {
        current.effect = clean(current.effect);
        skills.push(current);
      }
      current = null;
    };
    const start = (rank, name) => {
      push();
      current = { rank: normalizeRank(rank, skills.length), type: "", sin: "", aoe: "", aoeCount: "", name: clean(name), effect: "", dice: [] };
    };
    const parseDice = (line) => {
      const die = detectDice(line);
      if (!die || !current) return false;
      current.dice.push(die);
      return true;
    };
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const rawLine = lines[lineIndex];
      const line = clean(rawLine);
      const normalized = forMatch(line);
      if (!line) continue;
      if (/^(固有|人格コンセプト|派生戦術|外付け補正)/.test(normalized) || /固有/.test(sectionTitle(line)) || (buffHeaderAt(lines, lineIndex) && current)) { push(); break; }
      const header = normalized.match(/^【\s*戦術\s*スキル\s*([^】]+)】/);
      if (header) { start(header[1], ""); continue; }
      if (/^【\s*戦術\s*】/.test(normalized)) continue;
      const compact = line.match(/^(?:戦術\s*)?([０-９0-9]+(?:[-－ー][０-９0-9]+)?)\s*[:：]\s*(.+)$/);
      if (compact && !/^\d+d/i.test(compact[1])) {
        const tail = clean(compact[2]);
        const typed = tail.match(new RegExp(`^(.+?)\\s+(${skillTypePattern})\\s*[:：]\\s*(\\S+)`));
        start(compact[1], typed ? typed[1] : tail);
        if (typed) {
          current.type = typed[2];
          current.sin = typed[3];
          const aoe = tail.slice(typed[0].length).match(/(広域(?:乱射)?)\s*[:：]?\s*(\d+)?/);
          if (aoe) {
            current.aoe = aoe[1];
            current.aoeCount = aoe[2] || "";
          }
        }
        continue;
      }
      const standaloneRank = normalized.match(/^(?:(?:戦術(?:\s*スキル)?(?:\s*番号)?)\s*[:：]?\s*)?(\d+(?:-\d+)?)\s*(?::)?$/);
      const following = lines.slice(lineIndex + 1).map((entry) => forMatch(entry)).filter(Boolean).slice(0, 2);
      const nextLooksLikeSkillType = new RegExp(`^${skillTypePattern}\\s*:\\s*(\\S+)`).test(following[1] || "");
      if (standaloneRank && nextLooksLikeSkillType && !/^\d+d/i.test(standaloneRank[1])) {
        start(standaloneRank[1], "");
        continue;
      }
      if (!current) continue;
      const name = normalized.match(/^スキル\s*名\s*:\s*(.+)$/);
      if (name) { current.name = clean(name[1]); continue; }
      const nextLine = forMatch(lines[lineIndex + 1] || "");
      const nextType = new RegExp(`^${skillTypePattern}\\s*:\\s*(\\S+)`).test(nextLine);
      if (!current.name && nextType && !/^\[/.test(normalized)) { current.name = line; continue; }
      const typed = normalized.match(new RegExp(`^(${skillTypePattern})\\s*:\\s*(\\S+)`));
      if (typed) {
        current.type = typed[1];
        current.sin = typed[2];
        continue;
      }
      const aoe = normalized.match(/^(広域(?:乱射)?)\s*:?\s*(\d+)?/);
      if (aoe) {
        current.aoe = aoe[1];
        current.aoeCount = aoe[2] || "";
        continue;
      }
      if (parseDice(line)) continue;
      if (/^効果\s*[:：]/.test(line)) { appendLine(current, "effect", line.replace(/^効果\s*[:：]\s*/, "")); continue; }
      // A continuation belongs to its current cell, like the PDF detector.
      if (!/^コンセプト\s*[:：]/.test(normalized)) appendLine(current.dice.at(-1) || current, "effect", line);
    }
    push();
    return skills;
  };
  const parseBuffs = (lines) => {
    const titledStartAt = lines.findIndex((line) => /^(固有(?:-|$)|固有-同期MAX)/.test(forMatch(line)) || /固有/.test(sectionTitle(line)));
    const implicitStartAt = lines.findIndex((line, index) => buffHeaderAt(lines, index));
    const startAt = titledStartAt >= 0 ? titledStartAt : implicitStartAt;
    if (startAt < 0) return [];
    const buffs = [];
    let current = null;
    const push = () => {
      if (current?.name) buffs.push(current);
      current = null;
    };
    let condition = "";
    for (let index = startAt; index < lines.length; index += 1) {
      const line = clean(lines[index]);
      const normalized = forMatch(line);
      if (!line || /^外付け補正/.test(line)) continue;
      const title = sectionTitle(line);
      if (/固有/.test(title) || /^(固有(?:-|$)|固有-同期MAX)/.test(normalized)) {
        push();
        condition = title && title !== "固有" ? line : "";
        continue;
      }
      const detected = buffHeaderAt(lines, index);
      if (detected) {
        push();
        current = { ...detected.header, initial: 0, place: "status" };
        if (condition) current.desc = [condition, current.desc].filter(Boolean).join("\n");
        index = detected.end;
        continue;
      }
      if (current) appendLine(current, "desc", line.replace(/^効果\s*[:：]\s*/, ""));
    }
    push();
    return buffs;
  };
  const composePersonaDraftSections = (sections) => {
    const value = sections || {};
    const name = clean(value.name);
    const status = clean(value.status);
    const skills = clean(value.skills);
    const uniques = clean(value.uniques);
    const labeledName = name && /^(?:人格\s*(?:名|名称)?|名称)\s*[:：]/i.test(forMatch(name)) ? name : (name ? `人格名：${name}` : "");
    return [labeledName, status, skills, uniques ? `固有\n${uniques}` : ""].filter(Boolean).join("\n\n");
  };
  const garasumadoUrlPattern = /^https:\/\/lbt-garasumado\.vercel\.app\/(persona\/)?view\/([A-Za-z0-9]{20})\/?$/i;
  const garasumadoApiKey = "AIzaSyCzpUWr3EBQMLLEBXAixCMSl0abxSZCgY4";
  const parseGarasumadoUrl = (value) => {
    // Unwrap only this documented redirect; never fetch arbitrary targets.
    const url = clean(value).replace(/^https:\/\/rd\.nan7\.net\/(?=https:\/\/lbt-garasumado\.vercel\.app\/)/i, "");
    const match = url.match(garasumadoUrlPattern);
    if (!match) return { ok: false, errors: ["硝子窓の公開人格URLを貼り付けてください。対応形式は https://lbt-garasumado.vercel.app/persona/view/… または /view/… です。"] };
    return { ok: true, url, id: match[2], collection: match[1] ? "personas" : "characters" };
  };
  const firestoreValue = (value) => {
    if (!value || typeof value !== "object") return undefined;
    if (Object.prototype.hasOwnProperty.call(value, "stringValue")) return value.stringValue;
    if (Object.prototype.hasOwnProperty.call(value, "integerValue")) return String(value.integerValue);
    if (Object.prototype.hasOwnProperty.call(value, "doubleValue")) return String(value.doubleValue);
    if (Object.prototype.hasOwnProperty.call(value, "booleanValue")) return !!value.booleanValue;
    if (Object.prototype.hasOwnProperty.call(value, "nullValue")) return null;
    if (value.mapValue) return firestoreFields(value.mapValue.fields || {});
    if (value.arrayValue) return (value.arrayValue.values || []).map(firestoreValue);
    return undefined;
  };
  const firestoreFields = (fields) => Object.fromEntries(Object.entries(fields || {}).map(([key, value]) => [key, firestoreValue(value)]));
  // Rank hints are read independently; never abbreviate public names.
  const cleanGarasumadoName = clean;
  const normalizedGarasumadoBullet = (value) => {
    const bullet = clean(value);
    return !bullet || bullet === "0" ? "×" : bullet;
  };
  const isGarasumadoRecord = (value) => value && typeof value === "object" && !Array.isArray(value);
  const garasumadoError = (message, source) => ({ ok: false, errors: [message], warnings: [], persona: null, source: source || null });
  const composeGarasumadoDraft = (record, source) => {
    if (!isGarasumadoRecord(record)) return garasumadoError("硝子窓の公開データ形式を確認できません。人格データは反映していません。", source);
    if (record.isPublic !== true) return garasumadoError("この硝子窓の人格は公開されていないため、反映できません。", source);
    const status = record.status;
    const tactics = Array.isArray(record.tactics) ? record.tactics : [];
    if (!isGarasumadoRecord(status) || !tactics.length) return garasumadoError("硝子窓の人格データにステータスまたは戦術スキルを確認できません。人格データは反映していません。", source);
    const rawName = clean(source?.collection === "characters" ? status.persona : record.name);
    const displayName = cleanGarasumadoName(rawName);
    const rankMatch = forMatch(rawName).match(/(?:RANK|LANK|ランク|同期)\s*[:：]?\s*(0{1,3})/i) || rawName.match(/の人格\s+(0{1,3})(?:\s|$)/u);
    const syncMax = /同期\s*MAX/i.test(rawName);
    if (!displayName || !/^\d+$/.test(clean(status.hp)) || !/^\d+$/.test(clean(status.san)) || !isDiceFormula(status.speed)) return garasumadoError("硝子窓の人格名・HP・SAN・速度を確認できません。人格データは反映していません。", source);
    const passives = record.passives ?? (isGarasumadoRecord(record.passive) ? [record.passive] : []);
    const uniques = record.uniques ?? [];
    if (!Array.isArray(passives) || !Array.isArray(uniques) || passives.length > 2
      || tactics.some((t) => !isGarasumadoRecord(t) || !/^\d+(?:-\d+)?$/.test(forMatch(t.code)) || !clean(t.name) || !clean(t.attr) || !clean(t.sin))
      || passives.some((p) => !isGarasumadoRecord(p) || !clean(p.name))
      || uniques.some((u) => !isGarasumadoRecord(u) || !clean(u.name) || (clean(u.maxCount) && forMatch(u.maxCount) !== "-" && !/^\d+$/.test(toHalfWidth(clean(u.maxCount)))))) {
      return garasumadoError("不完全な戦術・固有・パッシブ、または未対応の3件目以降のパッシブがあります。欠落を防ぐため反映を中止しました。", source);
    }
    const skills = [], warnings = [];
    for (const tactic of tactics) {
      // The structured record already supplies cell boundaries. Do not flatten
      // names or passives and rediscover them with a prose regex.
      const skill = { rank: normalizeRank(tactic.code, 0), name: clean(tactic.name), type: clean(tactic.attr), sin: clean(tactic.sin), aoe: "", aoeCount: "", effect: "", dice: [] };
      for (const line of linesOf(tactic.effect)) {
        if (!line) continue;
        const die = detectDice(line);
        if (die) skill.dice.push(die);
        else {
          if (/^(?:\d+\s*-\s*)?\d+\s*d/i.test(forMatch(line))) return garasumadoError(`戦術${tactic.code}のダイス式を判別できません：${line}`, source);
          const area = forMatch(line).match(/^広域(乱射)?\s*:?\s*(?:対象)?(\d+)(?:体|枠)?$/);
          if (area && !skill.dice.length) { skill.aoe = area[1] ? "広域乱射" : "広域"; skill.aoeCount = area[2]; }
          else appendLine(skill.dice.at(-1) || skill, "effect", line);
        }
      }
      if (!skill.dice.length) warnings.push(`戦術${tactic.code}「${skill.name}」はダイス未検出です。効果のみのスキルか確認してください。`);
      skills.push(skill);
    }
    if (new Set(skills.map((s) => s.rank)).size !== skills.length) return garasumadoError("戦術番号が重複しています。反映前に移行元を確認してください。", source);
    const passive = (p) => ({ name: clean(p?.name), cond: clean(p?.condition), always: clean(p?.alwaysEffect), effect: clean(p?.effect) });
    const first = passive(passives[0]);
    const result = { ok: true, errors: [], warnings,
      persona: { name: displayName, no: 999, hp: Number(status.hp), san: Number(status.san), speed: forMatch(status.speed), bullets: normalizedGarasumadoBullet(status.bullet),
        res_slash: clean(status.slash) || "普通", res_pierce: clean(status.pierce) || "普通", res_blunt: clean(status.blunt) || "普通",
        passive_name: first.name, passive_cond: first.cond, passive_always: first.always, passive_effect: first.effect,
        skills, unique_buffs: uniques.map((u) => ({ name: clean(u.name), type: clean(u.type) || "バフ", initial: 0,
          max: /^\d+$/.test(toHalfWidth(clean(u.maxCount))) ? Number(toHalfWidth(clean(u.maxCount))) : null, desc: clean(u.effect), place: "status" })),
        keywords: [], __custom: true, __draftImported: true },
      secondaryPassive: passives[1] ? passive(passives[1]) : null,
      provided: { name: true, hp: true, san: true, speed: true, bullets: true, resistances: true, passives: passives.length > 0, skills: true, uniques: uniques.length > 0 },
      summary: { skillCount: skills.length, buffCount: uniques.length, passiveCount: passives.length } };
    result.persona.keywords = window.LBT_inferPersonaKeywords?.(result.persona, result.secondaryPassive) || [];
    if (source?.collection === "characters") result.warnings.push("キャラクターシートの人格名・能力・パッシブ・戦術・固有のみを取り込みます。PC名、PL名、精神、E.G.O、所持品は取り込みません。");
    return {
      ...result,
      syncRank: rankMatch?.[1] || result.syncRank,
      suggestSyncMax: syncMax,
      source: { kind: "garasumado", id: source?.id || "", url: source?.url || "", label: rawName }
    };
  };
  const parseGarasumadoPersonaDocument = (document, sourceUrl) => {
    const source = parseGarasumadoUrl(sourceUrl);
    if (!source.ok) return garasumadoError(source.errors[0]);
    const record = document?.fields ? firestoreFields(document.fields) : document;
    return composeGarasumadoDraft(record, source);
  };
  const fetchGarasumadoPersona = async (sourceUrl, fetchImpl) => {
    const source = parseGarasumadoUrl(sourceUrl);
    if (!source.ok) return garasumadoError(source.errors[0]);
    const request = fetchImpl || window.fetch?.bind(window);
    if (typeof request !== "function") return garasumadoError("このブラウザでは硝子窓の公開人格データを取得できません。", source);
    try {
      const endpoint = `https://firestore.googleapis.com/v1/projects/lbt-garasumado/databases/(default)/documents/${source.collection}/${source.id}?key=${garasumadoApiKey}`;
      const response = await request(endpoint, { method: "GET", headers: { Accept: "application/json" } });
      if (!response?.ok) return garasumadoError(response?.status === 404 ? "この硝子窓URLの公開人格は見つかりません。" : "硝子窓の公開人格データを取得できませんでした。時間を置いて再度お試しください。", source);
      return parseGarasumadoPersonaDocument(await response.json(), source.url);
    } catch (error) {
      return garasumadoError("硝子窓の公開人格データを取得できませんでした。ネットワーク接続を確認して再度お試しください。", source);
    }
  };
  const parsePersonaDraft = (rawText, options) => {
    const allowPartial = !!options?.allowPartial;
    const original = String(rawText || "").replace(/\r/g, "").trim();
    const errors = [];
    const warnings = [];
    if (original.length < 8) return { ok: false, errors: ["草案テキストを貼り付けてください。"], warnings, persona: null };
    const allLines = linesOf(original);
    const syncStart = findLastSyncDraftStart(allLines);
    const lines = syncStart >= 0 ? allLines.slice(syncStart + 1) : allLines;
    const text = lines.map(forMatch).join("\n");
    const firstStructuredLine = lines.findIndex((line) => /^(?:HP|SAN|速度|弾丸|パッシブ|【\s*(?:パッシブ|戦術)|戦術\s*\d|\d+\s*[-:：])/.test(forMatch(line)) || /^(?:ステータス|人格パッシブ|パッシブ|戦術|固有)/.test(sectionTitle(line)));
    const labeledNames = lines.slice(0, firstStructuredLine >= 0 ? firstStructuredLine : lines.length).map(personaNameFromLine).filter((entry) => entry?.labeled && entry.value).map((entry) => entry.value);
    const fallbackNames = lines.slice(0, firstStructuredLine >= 0 ? firstStructuredLine : 12)
      .map(personaNameFromLine).filter((entry) => typeof entry === "string" && entry);
    // ラベル付き人格名がある場合は、同期草案ブロック内で最後に明示されたものを採用する。
    // 無ラベルの引用名は簡略草案の先頭に限るため、本文中の台詞・引用は人格名として扱わない。
    const name = labeledNames.at(-1) || fallbackNames[0] || "";
    const hp = numeric(collectField(text, "HP"), 0);
    const san = numeric(collectField(text, "SAN"), 0);
    const speed = collectField(text, "速度");
    const bullets = collectField(text, "弾丸") || "×";
    const resistances = parseResistances(lines);
    const passives = parsePassives(lines);
    const skills = parseSkills(lines);
    const uniqueBuffs = parseBuffs(lines);
    const rank = ((text.match(/(?:RANK|LANK|ランク)\s*[:：]?\s*(0{1,3})/i) || [])[1]) || null;
    const provided = {
      name: !!name,
      hp: !!collectField(text, "HP"),
      san: !!collectField(text, "SAN"),
      speed: !!speed,
      bullets: !!collectField(text, "弾丸"),
      resistances: lines.slice(0, 24).some((line) => /(斬撃|貫通|打撃)\s*[:：]\s*(脆弱|弱点|普通|抵抗|耐性|免疫)/.test(forMatch(line))),
      passives: passives.length > 0,
      skills: skills.length > 0,
      uniques: uniqueBuffs.length > 0
    };
    if (allowPartial) {
      if (!Object.values(provided).some(Boolean)) errors.push("反映できる項目を確認できません。人格名、ステータス・パッシブ、戦術スキル、固有のいずれかを入力してください。");
    } else {
      if (!name) errors.push("人格名を確認できません。『人格名：』または『「人格名」』を含めてください。");
      if (!hp || !san || !isDiceFormula(speed)) errors.push("HP・SAN・速度を確認できません。HP・SANは数値、速度は『1d5+2』形式で記載してください。");
      if (!skills.length) errors.push("戦術スキルを確認できません。『【戦術スキルN】』または『1-1：スキル名』形式を含めてください。");
    }
    if (passives.length > 2) errors.push("パッシブは2件まで対応しています。3件目以降があるため反映できません。");
    if (new Set(skills.map((s) => s.rank)).size !== skills.length) errors.push("戦術番号が重複しています。");
    for (const skill of skills) {
      if (!skill.dice.length) warnings.push(`「${skill.name}」はダイス未検出です。効果のみのスキルか確認してください。`);
      for (const text of [skill.effect, ...skill.dice.map((d) => d.effect)]) {
        if (linesOf(text).some((line) => /^(?:\d+\s*-\s*)?\d+\s*d/i.test(forMatch(line)))) errors.push(`「${skill.name}」に未検出のダイス式があります。表記を確認してください。`);
      }
    }
    if (!passives.length) warnings.push("パッシブを確認できません。適用後にパッシブ欄で追加できます。");
    const persona = {
      name: name || "テキスト反映人格",
      no: 999,
      hp: hp || 100,
      san: san || 45,
      speed: speed || "1d5",
      bullets,
      res_slash: resistances.slash,
      res_pierce: resistances.pierce,
      res_blunt: resistances.blunt,
      passive_name: passives[0]?.name || "",
      passive_cond: passives[0]?.cond || "",
      passive_always: passives[0]?.always || "",
      passive_effect: passives[0]?.effect || "",
      skills,
      unique_buffs: uniqueBuffs,
      keywords: [],
      __custom: true,
      __draftImported: true
    };
    persona.keywords = window.LBT_inferPersonaKeywords?.(persona, passives[1]) || [];
    return {
      ok: errors.length === 0,
      errors,
      warnings,
      persona,
      secondaryPassive: passives[1] || null,
      provided,
      syncRank: ["0", "00", "000"].includes(rank) ? rank : null,
      suggestSyncMax: syncStart >= 0 && /同期\s*MAX/i.test(forMatch(allLines[syncStart] || "")),
      nameSource: syncStart >= 0 ? "sync-draft" : "document",
      summary: { skillCount: skills.length, buffCount: uniqueBuffs.length, passiveCount: passives.length }
    };
  };
  window.LBT_parsePersonaDraft = parsePersonaDraft;
  window.LBT_composePersonaDraftSections = composePersonaDraftSections;
  window.LBT_parsePersonaDraftSections = (sections) => parsePersonaDraft(composePersonaDraftSections(sections), { allowPartial: true });
  window.LBT_parseGarasumadoPersonaUrl = parseGarasumadoUrl;
  window.LBT_parseGarasumadoPersonaDocument = parseGarasumadoPersonaDocument;
  window.LBT_fetchGarasumadoPersona = fetchGarasumadoPersona;
})();
