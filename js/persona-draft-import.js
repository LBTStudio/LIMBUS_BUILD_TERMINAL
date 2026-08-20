/* LBT persona draft paste parser. Keeps parsing deterministic and entirely client-side. */
(function () {
  const toHalfWidth = (value) => String(value || "").replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xFEE0)).replace(/[：]/g, ":").replace(/[‐‑‒–—－−]/g, "-");
  const clean = (value) => String(value || "").replace(/\r/g, "").trim();
  const linesOf = (value) => String(value || "").replace(/\r/g, "").split("\n").map((line) => line.trim());
  const appendLine = (target, key, value) => {
    const next = clean(value);
    if (next) target[key] = target[key] ? `${target[key]}\n${next}` : next;
  };
  const stripPersonaQuotes = (value) => clean(value).replace(/^人格名\s*[:：]\s*/i, "").replace(/^[「『\"]+|[」』\"]+$/g, "").trim();
  const normalizeRank = (raw, fallback) => {
    const rank = toHalfWidth(raw).replace(/\s+/g, "");
    return rank ? `スキル${rank}` : `スキル${fallback}`;
  };
  const numeric = (value, fallback) => {
    const found = String(value || "").match(/\d+/);
    return found ? Number(found[0]) : fallback;
  };
  const collectField = (text, label) => {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = text.match(new RegExp(`${escaped}\\s*[:：]\\s*([^\\n]*?)(?=\\s*(?:HP|SAN|速度|弾丸)\\s*[:：]|\\n|$)`, "i"));
    return match ? clean(match[1]) : "";
  };
  const parseResistances = (lines) => {
    const values = { slash: "普通", pierce: "普通", blunt: "普通" };
    const keys = { "斬撃": "slash", "貫通": "pierce", "打撃": "blunt" };
    for (const line of lines.slice(0, 24)) {
      const matches = [...line.matchAll(/(斬撃|貫通|打撃)\s*[:：]\s*(脆弱|弱点|普通|抵抗|耐性|免疫)/g)];
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
    const stop = (line) => /^【\s*戦術スキル/.test(line) || /^\d+(?:[-－ー]\d+)?\s*[:：]/.test(toHalfWidth(line)) || /^(固有|人格コンセプト)/.test(line);
    for (let index = 0; index < lines.length; index += 1) {
      const line = clean(lines[index]);
      if (!line) continue;
      const named = line.match(/^パッシブ名\s*[:：]\s*(.+)$/);
      if (named) {
        push();
        current = { name: clean(named[1]), cond: "", always: "", effect: "" };
        continue;
      }
      if (/^【\s*パッシブ\s*】/.test(line)) {
        push();
        const next = lines.slice(index + 1).find((candidate) => clean(candidate));
        if (next && !/^(発動条件|常時(?:効果|発動)?|効果)\s*[:：]/.test(next)) current = { name: clean(next), cond: "", always: "", effect: "" };
        continue;
      }
      if (!current) continue;
      if (stop(line)) {
        push();
        continue;
      }
      const condition = line.match(/^発動条件\s*[:：]\s*(.+)$/);
      const always = line.match(/^常時(?:効果|発動)?\s*[:：]\s*(.+)$/);
      const effect = line.match(/^効果\s*[:：]\s*(.+)$/);
      if (condition) { current.cond = clean(condition[1]); section = "cond"; continue; }
      if (always) { appendLine(current, "always", always[1]); section = "always"; continue; }
      if (effect) { appendLine(current, "effect", effect[1]); section = "effect"; continue; }
      if (section) appendLine(current, section, line);
    }
    push();
    return passives;
  };
  const parseSkills = (lines) => {
    const skills = [];
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
      const match = line.match(/^((?:\d+\s*[-－]\s*)?\d+\s*[dD]\s*[^：:\s]+)\s*(?:[:：]\s*(.*))?$/);
      if (!match || !current) return false;
      current.dice.push({ roll: toHalfWidth(match[1]).replace(/\s+/g, ""), effect: clean(match[2] || "") });
      return true;
    };
    for (const rawLine of lines) {
      const line = clean(rawLine);
      if (!line) continue;
      if (/^(固有|人格コンセプト|派生戦術|外付け補正)/.test(line)) { push(); break; }
      const header = line.match(/^【\s*戦術スキル\s*([^】]+)】/);
      if (header) { start(header[1], ""); continue; }
      const compact = toHalfWidth(line).match(/^(\d+(?:-\d+)?)\s*[:：]\s*(.+)$/);
      if (compact && !/^\d+d/i.test(compact[1])) {
        const tail = clean(compact[2]);
        const typed = tail.match(/^(.+?)\s+(斬撃|貫通|打撃|回避|防御|物理|マッチ可能防御|マッチ可能斬撃反撃)\s*[:：]\s*(\S+)/);
        start(compact[1], typed ? typed[1] : tail);
        if (typed) {
          current.type = typed[2].replace("マッチ可能", "");
          current.sin = typed[3];
          const aoe = tail.slice(typed[0].length).match(/(広域(?:乱射)?)\s*[:：]?\s*(\d+)?/);
          if (aoe) {
            current.aoe = aoe[1];
            current.aoeCount = aoe[2] || "";
          }
        }
        continue;
      }
      if (!current) continue;
      const name = line.match(/^スキル名\s*[:：]\s*(.+)$/);
      if (name) { current.name = clean(name[1]); continue; }
      const typed = line.match(/^(斬撃|貫通|打撃|回避|防御|物理|マッチ可能防御|マッチ可能斬撃反撃)\s*[:：]\s*(\S+)/);
      if (typed) {
        current.type = typed[1].replace("マッチ可能", "");
        current.sin = typed[2];
        continue;
      }
      const aoe = line.match(/^(広域(?:乱射)?)\s*[:：]?\s*(\d+)?/);
      if (aoe) {
        current.aoe = aoe[1];
        current.aoeCount = aoe[2] || "";
        continue;
      }
      if (parseDice(line)) continue;
      if (!/^コンセプト\s*[:：]/.test(line)) appendLine(current, "effect", line);
    }
    push();
    return skills;
  };
  const parseBuffs = (lines) => {
    const startAt = lines.findIndex((line) => /^(固有(?:-|$)|固有-同期MAX)/.test(clean(line)));
    if (startAt < 0) return [];
    const buffs = [];
    let current = null;
    const push = () => {
      if (current?.name) buffs.push(current);
      current = null;
    };
    for (const rawLine of lines.slice(startAt + 1)) {
      const line = clean(rawLine);
      if (!line || /^外付け補正/.test(line)) continue;
      const header = line.match(/^\[([^\]]+)\]\s*(.*)$/);
      if (header) {
        push();
        const tail = clean(header[2]);
        const max = numeric((tail.match(/最大(?:値)?\s*[:：;；]?\s*(\d+)/) || [])[1], 20);
        const type = (tail.match(/(中立バフ|バフ|デバフ|その他)/) || [])[1] || "バフ";
        current = { name: clean(header[1]), type, initial: 0, max, desc: "", place: "status" };
        continue;
      }
      if (current) appendLine(current, "desc", line.replace(/^効果\s*[:：]\s*/, ""));
    }
    push();
    return buffs;
  };
  const parsePersonaDraft = (rawText) => {
    const original = String(rawText || "").replace(/\r/g, "").trim();
    const errors = [];
    const warnings = [];
    if (original.length < 8) return { ok: false, errors: ["草案テキストを貼り付けてください。"], warnings, persona: null };
    const allLines = linesOf(original);
    const syncStart = allLines.findIndex((line) => /同期(?:MAX)?草案/.test(line));
    const lines = syncStart >= 0 ? allLines.slice(syncStart + 1) : allLines;
    const text = lines.join("\n");
    const labeledName = lines.find((line) => /^人格名\s*[:：]/.test(line));
    const quotedName = lines.find((line) => /^[「『].+[」』]$/.test(line));
    const name = stripPersonaQuotes(labeledName || quotedName || "");
    const hp = numeric(collectField(text, "HP"), 0);
    const san = numeric(collectField(text, "SAN"), 0);
    const speed = collectField(text, "速度");
    const bullets = collectField(text, "弾丸") || "×";
    const resistances = parseResistances(lines);
    const passives = parsePassives(lines);
    const skills = parseSkills(lines);
    const uniqueBuffs = parseBuffs(lines);
    const rank = ((text.match(/RANK\s*[:：]\s*(0{1,3})/i) || [])[1]) || null;
    if (!name) errors.push("人格名を確認できません。『人格名：』または『「人格名」』を含めてください。");
    if (!hp || !san || !speed) warnings.push("HP・SAN・速度の一部を確認できません。適用後に基本情報で補完してください。");
    if (!skills.length) errors.push("戦術スキルを確認できません。『【戦術スキルN】』または『1-1：スキル名』形式を含めてください。");
    if (!passives.length) warnings.push("パッシブを確認できません。適用後にパッシブ欄で追加できます。");
    const persona = {
      name: name || "草案人格",
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
    return {
      ok: errors.length === 0,
      errors,
      warnings,
      persona,
      secondaryPassive: passives[1] || null,
      syncRank: ["0", "00", "000"].includes(rank) ? rank : null,
      suggestSyncMax: syncStart >= 0 && /同期MAX/.test(allLines[syncStart] || ""),
      summary: { skillCount: skills.length, buffCount: uniqueBuffs.length, passiveCount: passives.length }
    };
  };
  window.LBT_parsePersonaDraft = parsePersonaDraft;
})();
