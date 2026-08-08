(() => {
  function normalizeMultiline(s) {
    if (!s) return "";
    return String(s).replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").map((l) => l.trim()).filter(Boolean).join("\n");
  }
  function sanitizeInline(s) {
    if (!s) return "";
    return String(s).replace(/\r\n|\r|\n/g, " ").replace(/\s+/g, " ").trim();
  }
  function formatAoe(aoe, aoeCount) {
    const a = sanitizeInline(aoe);
    if (!a) return "";
    const n = sanitizeInline(aoeCount);
    return n ? `${a} ${n}\u540D` : a;
  }
  window.formatAoe = formatAoe;
  const TIMING_MARKER = "(?:\u4F7F\u7528\u6642|\u6226\u95D8\u958B\u59CB\u6642|\u30DE\u30C3\u30C1\u958B\u59CB\u6642|\u30DE\u30C3\u30C1\u52DD\u5229\u6642|\u30DE\u30C3\u30C1\u6557\u5317\u6642|\u30DE\u30C3\u30C1\u7D42\u4E86\u6642|\u653B\u6483\u6642|\u653B\u6483\u5F8C|\u88AB\u30C0\u30E1\u30FC\u30B8\u6642|\u6575\u8A0E\u4F10\u6642|\u7684\u4E2D\u6642|\u30AF\u30EA\u30C6\u30A3\u30AB\u30EB\u7684\u4E2D\u6642|\u4E00\u65B9\u653B\u6483\u6642|R\u958B\u59CB\u6642|R\u7D42\u4E86\u6642|R\\d+\u958B\u59CB\u6642|R\\d+\u7D42\u4E86\u6642|\u821E\u53F0\u958B\u59CB\u6642|\u6B7B\u4EA1\u6642|\u518D\u88C5\u586B\u6642|\u5224\u5B9A\u6642|\u56DE\u907F\u6210\u529F\u6642|\u56DE\u907F\u5931\u6557\u6642|\u9632\u5FA1\u6210\u529F\u6642|\u9632\u5FA1\u5931\u6557\u6642|\u30DE\u30C3\u30C1\u6642|\u30B3\u30B9\u30C8|\u30B3\u30B9\u30C8\uFF1A|\u30B3\u30B9\u30C8:)";
  function splitEffectLines(text) {
    const normalized = normalizeMultiline(text);
    if (!normalized) return [];
    let lines = normalized.split("\n").map((l) => l.trim()).filter(Boolean);
    const re = new RegExp("(?<!^)(?=" + TIMING_MARKER + "(?:\uFF1A|:))", "g");
    const out = [];
    for (const line of lines) {
      const parts = line.split(re).map((s) => s.trim()).filter(Boolean);
      out.push(...parts);
    }
    return out.map((s) => s.startsWith("\u25B6\uFE0E") ? s : "\u25B6\uFE0E" + s);
  }
  function splitEffectLinesPlain(text) {
    const normalized = normalizeMultiline(text);
    if (!normalized) return [];
    let lines = normalized.split("\n").map((l) => l.trim()).filter(Boolean);
    const re = new RegExp("(?<!^)(?=" + TIMING_MARKER + "(?:\uFF1A|:))", "g");
    const out = [];
    for (const line of lines) {
      const parts = line.split(re).map((s) => s.trim()).filter(Boolean);
      out.push(...parts);
    }
    return out;
  }
  function formatEffectLines(text) {
    const lines = splitEffectLinesPlain(text);
    return lines.join("\n");
  }
  window.formatEffectLines = formatEffectLines;
  window.splitEffectLinesPlain = splitEffectLinesPlain;
  function toArrowLines(text) {
    return splitEffectLines(text);
  }
  function buildLabeledBlock(header, text) {
    const lines = toArrowLines(text);
    if (!lines.length) return "";
    const first = lines[0];
    const rest = lines.slice(1);
    if (rest.length) return header + first + "\\n" + rest.join("\\n");
    return header + first;
  }
  function buildMahiFormula(roll, dval, fix, dPlusVar, dCntVar) {
    roll = sanitizeInline(roll);
    dval = sanitizeInline(dval);
    fix = sanitizeInline(fix);
    if (!roll && !dval) return roll || "";
    const ex = fix || "";
    const mahi = "({\u9EBB\u75FA}*4+5)/9";
    const wrapN = (nExpr) => dCntVar ? `(${nExpr}+{${dCntVar}})` : nExpr;
    const buildDside = (vExpr) => {
      const withPlus = dPlusVar ? `${vExpr}+{${dPlusVar}}` : vExpr;
      return `(${withPlus}-${mahi})`;
    };
    const varDM = roll.match(/^(\d+)d\(([^)]+)\)(.*)$/);
    if (varDM) {
      return `${wrapN(varDM[1])}d(${dPlusVar ? varDM[2] + "+{" + dPlusVar + "}" : varDM[2]}-${mahi})${varDM[3]}${ex}`;
    }
    const specN = roll.match(/^\(([^)]+)\)d(\d+)(.*)$/);
    if (specN) {
      const d = dval || specN[2];
      const inner = dCntVar ? `${specN[1]}+{${dCntVar}}` : specN[1];
      return `(${inner})d${buildDside(d)}${specN[3]}${ex}`;
    }
    const specM = roll.match(/^(\d+)-(\d+)d(\d+)(.*)$/);
    if (specM) {
      const d = dval || specM[3];
      return `${specM[1]}-${wrapN(specM[2])}d${buildDside(d)}${specM[4]}${ex}`;
    }
    const normM = roll.match(/^(\d+)d(\d+)(.*)$/);
    if (normM) {
      const d = dval || normM[2];
      return `${wrapN(normM[1])}d${buildDside(d)}${normM[3]}${ex}`;
    }
    if (dval) return `${wrapN("1")}d${buildDside(dval)}${ex}`;
    return roll;
  }
  function detectSkillDiceVariance(effectTextOrSkill) {
    if (typeof effectTextOrSkill === "string") {
      const t2 = String(effectTextOrSkill).replace(/\s+/g, "");
      if (!t2) return { dPlus: false, dCnt: false };
      const dPlusRe2 = /d値(?:[+＋\-−―ー]\d+|(?:が|は|も)?(?:増加|減少|上昇|低下|強化|増やす|減らす))/;
      const dCntRe2 = /d数(?:[+＋\-−―ー]\d+|(?:が|は|も)?(?:増加|減少|上昇|低下|強化|増やす|減らす))/;
      return { dPlus: dPlusRe2.test(t2), dCnt: dCntRe2.test(t2) };
    }
    const sk = effectTextOrSkill || {};
    if (sk.dPlus === true || sk.dCnt === true) {
      return { dPlus: !!sk.dPlus, dCnt: !!sk.dCnt };
    }
    const t = String(sk.effect || "").replace(/\s+/g, "");
    if (!t) return { dPlus: false, dCnt: false };
    const dPlusRe = /d値(?:[+＋\-−―ー]\d+|(?:が|は|も)?(?:増加|減少|上昇|低下|強化|増やす|減らす))/;
    const dCntRe = /d数(?:[+＋\-−―ー]\d+|(?:が|は|も)?(?:増加|減少|上昇|低下|強化|増やす|減らす))/;
    return { dPlus: dPlusRe.test(t), dCnt: dCntRe.test(t) };
  }
  const DEF_FMLS = [
    { name: "MT", expr: "{\u30D1\u30EF\u30FC}-{\u865A\u5F31}+{\u5171\u9CF4}+{\u30B9\u30AD\u30EB\u5A01\u529B}+{\u30DE\u30C3\u30C1\u5A01\u529B\u5897\u52A0}-{\u30DE\u30C3\u30C1\u5A01\u529B\u4F4E\u4E0B}", builtin: true },
    { name: "DM", expr: "{\u30D1\u30EF\u30FC}-{\u865A\u5F31}+{\u5171\u9CF4}+{\u30B9\u30AD\u30EB\u5A01\u529B}+{\u30C0\u30E1\u30FC\u30B8\u91CF\u5897\u52A0}-{\u30C0\u30E1\u30FC\u30B8\u91CF\u6E1B\u5C11}", builtin: true },
    { name: "DT", expr: "{\u5171\u9CF4}+{\u5FCD\u8010}-{\u6B66\u88C5\u89E3\u9664}+{\u5B88\u5099\u5A01\u529B}", builtin: true },
    { name: "QB", expr: "{\u675F\u7E1B}+{\u30AF\u30A4\u30C3\u30AF}", builtin: true }
  ];
  const DEFAULT_STATUS_LIST = [
    { label: "HP", initial: 0, max: "hp" },
    { label: "SAN", initial: 0, max: "san" },
    { label: "\u5171\u9CF4", initial: 0, max: 5 },
    { label: "\u30D1\u30EF\u30FC", initial: 0, max: 10 },
    { label: "\u865A\u5F31", initial: 0, max: 10 },
    { label: "\u30B9\u30AD\u30EB\u5A01\u529B", initial: 0, max: 10 },
    { label: "\u30DE\u30C3\u30C1\u5A01\u529B\u5897\u52A0", initial: 0, max: 10 },
    { label: "\u30DE\u30C3\u30C1\u5A01\u529B\u4F4E\u4E0B", initial: 0, max: 10 },
    { label: "\u30C0\u30E1\u30FC\u30B8\u91CF\u5897\u52A0", initial: 0, max: 10 },
    { label: "\u30C0\u30E1\u30FC\u30B8\u91CF\u6E1B\u5C11", initial: 0, max: 10 },
    { label: "\u30D0\u30EA\u30A2", initial: 0, max: 1e3 },
    { label: "\u9EBB\u75FA", initial: 0, max: 10 },
    { label: "\u5FCD\u8010", initial: 0, max: 10 },
    { label: "\u6B66\u88C5\u89E3\u9664", initial: 0, max: 10 },
    { label: "\u30AF\u30A4\u30C3\u30AF", initial: 0, max: 10 },
    { label: "\u675F\u7E1B", initial: 0, max: 10 }
  ];
  function detectMTMods(state) {
    const hasSPP = (kw) => state.supports.some((s) => (s.name || "").includes(kw));
    const hasENH = (kw) => (state.enhancements || []).some((e) => (e.name || "").includes(kw));
    const atkModLabel = hasSPP("\u58CA\u3057\u7815\u304F\u6253\u6483") ? "\u6253\u6483\u88DC\u6B63" : hasSPP("\u5207\u308A\u4F0F\u305B\u308B\u65AC\u6483") ? "\u65AC\u6483\u88DC\u6B63" : hasSPP("\u523A\u3057\u8CAB\u304F\u8CAB\u901A") ? "\u8CAB\u901A\u88DC\u6B63" : null;
    const hasVigor = hasENH("\u71C3\u3048\u4E0A\u304C\u308B\u95D8\u5FD7");
    const hasDefMod = hasENH("\u9032\u3080\u3079\u304D\u5B88\u5099");
    return { atkModLabel, hasVigor, hasDefMod };
  }
  function resolveFormulas(state) {
    const custom = (state.formulas || []).filter((f) => f.name && f.expr);
    const { atkModLabel, hasVigor } = detectMTMods(state);
    const ov = state.builtinFormulasOverride || {};
    const out = [];
    DEF_FMLS.forEach((f) => {
      if (Object.prototype.hasOwnProperty.call(ov, f.name) && ov[f.name] === null) return;
      let expr = typeof ov[f.name] === "string" ? ov[f.name] : f.expr;
      if (f.name === "MT" || f.name === "DM") {
        if (hasVigor && !expr.includes("{\u95D8\u5FD7}")) expr += "+{\u95D8\u5FD7}";
        if (atkModLabel && !expr.includes("{" + atkModLabel + "}")) expr += "+{" + atkModLabel + "}";
      }
      out.push({ name: f.name, expr, builtin: true, overridden: typeof ov[f.name] === "string" });
    });
    custom.forEach((f) => {
      const i = out.findIndex((o) => o.name === f.name);
      if (i >= 0) out[i] = { name: f.name, expr: f.expr, builtin: false };
      else out.push({ name: f.name, expr: f.expr, builtin: false });
    });
    return out;
  }
  function buildPalette(state) {
    const p = state;
    const san = (parseInt(p.san) || 50) + computeEnhancementBonuses(p).san;
    const speed = sanitizeInline(p.speed) || "2d4";
    const spirit = sanitizeInline(p.spirit);
    const morale = p.moraleLine || String(Math.floor(san * 0.25));
    const L = [];
    const allEffectText = [
      p.pas.always,
      p.pas.effect,
      p.pas2Enabled ? p.pas2.effect : "",
      p.spiritMorale,
      p.spiritConfuse,
      p.spiritAlways,
      ...p.supports.map((s) => s.effect),
      ...(p.enhancements || []).map((e) => e.effect)
    ].join(" ");
    const hasVar = (kw) => allEffectText.includes(kw) || (p.uniqueBuffs || []).some((b) => b.name === kw && (b.place || "status") === "status") || (p.customStatuses || []).some((c) => c.label === kw && (c.place || "status") === "status");
    const hasTaunt = hasVar("\u6311\u767A\u5024");
    const hasBreath = hasVar("\u547C\u5438");
    L.push("### \u25A0 \u5224\u5B9A\u30FB\u901F\u5EA6");
    L.push(`${speed}+{QB} \u3010\u901F\u5EA6\u3011\u5224\u5B9A`);
    const hasSute = p.skills.some((sk) => (sk.effect || "").includes("\u6368\u3066")) || (p.pas.always || "").includes("\u6368\u3066") || (p.pas.effect || "").includes("\u6368\u3066");
    if (hasSute) {
      L.push(`2b(4-{\u6368\u3066\u305F\u679A\u6570}) \u3010\u6226\u8853\u3011\u9078\u629E`);
      L.push(`3b(4-{\u6368\u3066\u305F\u679A\u6570}) \u3010\u611F\u60C5\u6226\u8853\u3011\u9078\u629E`);
    } else {
      L.push(`2b4 \u3010\u6226\u8853\u3011\u9078\u629E`);
      L.push(`3b4 \u3010\u611F\u60C5\u6226\u8853\u3011\u9078\u629E`);
    }
    if (hasBreath) L.push(`1d100<={\u547C\u5438}*5 \u547C\u5438\u30C1\u30A7\u30C3\u30AF\uFF08\u51FA\u76EE\u2264\u547C\u5438\xD75\u3067\u6210\u529F\uFF09`);
    if (hasTaunt) L.push(`1d100<={\u6311\u767A\u5024}*5 \u6311\u767A\u5224\u5B9A`);
    L.push("");
    if (spirit) {
      L.push("\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC");
      L.push(`### \u25A0 \u7CBE\u795E\uFF1A${spirit}`);
      const parts = [`\u7CBE\u795E\u3010${spirit}\u3011`];
      const alwaysBlk = buildLabeledBlock("\u5E38\u6642\u767A\u52D5\uFF1A", p.spiritAlways);
      if (alwaysBlk) parts.push(alwaysBlk);
      const moraleBlk = buildLabeledBlock("\u58EB\u6C17\u4F4E\u4E0B\u52B9\u679C\uFF1A", p.spiritMorale);
      if (moraleBlk) parts.push(moraleBlk);
      const confuseBlk = buildLabeledBlock("\u6DF7\u4E71\u52B9\u679C\uFF1A", p.spiritConfuse);
      if (confuseBlk) parts.push(confuseBlk);
      L.push(parts.join("\\n"));
      const spiritQuickText = `${p.spiritAlways || ""} ${p.spiritMorale || ""} ${p.spiritConfuse || ""}`;
      const seenQ = /* @__PURE__ */ new Set();
      const kws = "(\u30AF\u30A4\u30C3\u30AF|\u675F\u7E1B|\u30D1\u30EF\u30FC|\u4FDD\u8B77|\u5FCD\u8010|\u865A\u5F31|\u8106\u5F31|\u6B66\u88C5\u89E3\u9664|\u5171\u9CF4|\u30B9\u30AD\u30EB\u5A01\u529B|\u95D8\u5FD7|\u30DE\u30C3\u30C1\u5A01\u529B(?:\u5897\u52A0|\u4F4E\u4E0B)?|\u30C0\u30E1\u30FC\u30B8\u91CF(?:\u5897\u52A0|\u6E1B\u5C11)?|\u547C\u5438|\u632F\u52D5|\u51FA\u8840|\u7834\u88C2|\u5145\u96FB|\u706B\u50B7|\u9EBB\u75FA|\u6050\u614C|\u6DF7\u4E71|\u6C88\u6F5C|\u7206\u767A|\u6BD2|\u6307\u4EE4)";
      const gainRe = new RegExp(kws + "(\\d+)(?:\u3092(?:\u6B21\u306ER\u306B)?)?(?:\u3092)?(?:\u5F97\u308B|\u81EA\u5206\u306B\u4ED8\u4E0E|\u81EA\u5206\u81EA\u8EAB\u306B\u4ED8\u4E0E|\u81EA\u8EAB\u306B\u4ED8\u4E0E)", "g");
      let qm;
      while ((qm = gainRe.exec(spiritQuickText)) !== null) {
        const cmd = `:${qm[1]}+${qm[2]}`;
        if (!seenQ.has(cmd)) {
          seenQ.add(cmd);
          L.push(cmd);
        }
      }
      L.push("");
    }
    if (p.pas.name) {
      L.push("\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC");
      L.push("### \u25A0 \u30D1\u30C3\u30B7\u30D6");
      const parts = [`\u4EBA\u683C\u30D1\u30C3\u30B7\u30D6\u3010${p.pas.name}\u3011`, `\u767A\u52D5\u6761\u4EF6\uFF1A${p.pas.cond || ""}`];
      const alwaysBlk = buildLabeledBlock("\u5E38\u6642\u52B9\u679C\uFF1A", p.pas.always);
      if (alwaysBlk) parts.push(alwaysBlk);
      const effBlk = buildLabeledBlock("\u52B9\u679C\uFF1A", p.pas.effect);
      if (effBlk) parts.push(effBlk);
      L.push(parts.join("\\n"));
      if (p.pas.quick) {
        p.pas.quick.split(/\s+/).filter((s) => s.startsWith(":")).forEach((cmd) => L.push(sanitizeInline(cmd)));
      }
      if (p.pas2Enabled && p.pas2.name) {
        const p2 = [`\u4EBA\u683C\u30D1\u30C3\u30B7\u30D6\u3010${p.pas2.name}\u3011`, `\u767A\u52D5\u6761\u4EF6\uFF1A${p.pas2.cond || ""}`];
        const p2eff = buildLabeledBlock("\u52B9\u679C\uFF1A", p.pas2.effect);
        if (p2eff) p2.push(p2eff);
        L.push(p2.join("\\n"));
      }
      L.push("");
    }
    if (p.supports.length) {
      L.push("\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC");
      L.push("### \u25A0 \u30B5\u30DD\u30FC\u30C8\u30D1\u30C3\u30B7\u30D6");
      p.supports.forEach((s) => {
        const parts = [`\u30B5\u30DD\u30FC\u30C8\u30D1\u30C3\u30B7\u30D6\u540D ${s.name}`, `\u767A\u52D5\u6761\u4EF6\uFF1A${s.cond || ""}`];
        const effBlk = buildLabeledBlock("\u52B9\u679C\uFF1A", s.effect);
        if (effBlk) parts.push(effBlk);
        L.push(parts.join("\\n"));
      });
      L.push("");
    }
    if ((p.enhancements || []).length) {
      L.push("\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC");
      L.push("### \u25A0 \u7279\u6B8A\u5F37\u5316");
      p.enhancements.forEach((e) => {
        const effBlk = buildLabeledBlock("\u52B9\u679C\uFF1A", e.effect);
        L.push(effBlk ? `\u3010${e.name}\u3011\\n${effBlk}` : `\u3010${e.name}\u3011`);
      });
      L.push("");
    }
    if ((p.uniqueBuffs || []).length) {
      L.push("\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC");
      L.push("### \u25A0 \u56FA\u6709\u30D0\u30D5\u30FB\u30B9\u30C6\u30FC\u30BF\u30B9");
      p.uniqueBuffs.forEach((b) => {
        if (!b.name) return;
        const parts = [`\u3010${b.name}\u3011\uFF08${b.type || "\u56FA\u6709\u30D0\u30D5"}\uFF09${b.max ? ` \u6700\u5927${b.max}` : ""}`];
        if (b.desc) {
          const effBlk = buildLabeledBlock("\u52B9\u679C\uFF1A", b.desc);
          if (effBlk) parts.push(effBlk);
        }
        L.push(parts.join("\\n"));
        L.push(`:${b.name}+1`);
        L.push(`:${b.name}-1`);
      });
      L.push("");
    }
    if (p.skills.length) {
      L.push("\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC");
      L.push("### \u25A0 \u6226\u8853\u30B9\u30AD\u30EB");
      p.skills.forEach((sk, skIdx) => {
        const rnk = sk.rank || `\u30B9\u30AD\u30EB${skIdx}`;
        const typ = sk.type || "\u6253\u6483";
        const sin = sk.sin || "";
        const name = sanitizeInline(sk.name);
        const aoe = formatAoe(sk.aoe, sk.aoeCount);
        const eff = sk.effect || "";
        const rn = String(rnk).replace("\u30B9\u30AD\u30EB", "") || String(skIdx);
        const isDefense = typ === "\u9632\u5FA1" || typ === "\u30DE\u30C3\u30C1\u53EF\u80FD\u9632\u5FA1" || typ === "\u56DE\u907F" || typ.includes("\u53CD\u6483");
        const hasPerDicePlus = (sk.dice || []).some((d) => d.dPlus);
        const hasPerDiceCnt = (sk.dice || []).some((d) => d.dCnt);
        const auto = detectSkillDiceVariance(sk);
        const skDPlusVar = !hasPerDicePlus && auto.dPlus ? sk.dPlusLabel || `S${rn}d\u5024` : null;
        const skDCntVar = !hasPerDiceCnt && auto.dCnt ? sk.dCntLabel || `S${rn}d\u6570` : null;
        const headParts = [`\u6226\u8853${rn}\uFF1A${name}`, `${typ}${sin ? "\uFF1A" + sin : ""}${aoe ? "\u3000\u5E83\u57DF\uFF1A" + aoe : ""}`];
        const effBlk = buildLabeledBlock("\u52B9\u679C\uFF1A", eff);
        if (effBlk) headParts.push(effBlk);
        const displayDice = [];
        const execRows = [];
        const effectiveDiceCount = (sk.dice || []).filter((d) => d.roll || d.dval).length;
        const useDiceIdx = effectiveDiceCount > 1;
        (sk.dice || []).forEach((d, did0) => {
          const did = did0 + 1;
          const roll = sanitizeInline(d.roll);
          const dval = sanitizeInline(d.dval || "");
          const deff = sanitizeInline(d.effect);
          if (!roll && !dval) return;
          let showDeff = deff;
          if (deff) {
            const colIdx = deff.indexOf("\uFF1A");
            if (colIdx > 0) {
              const part0 = deff.slice(0, colIdx).trim();
              const part1 = deff.slice(colIdx + 1).trim();
              if (/^\d[\d-]*$/.test(part0)) showDeff = part1;
            } else if (/^\d[\d-]*$/.test(deff.trim())) {
              showDeff = "";
            }
          }
          displayDice.push(showDeff ? `${roll}\uFF1A${showDeff}` : roll);
          const dPlusVar = d.dPlus ? `S${rn}-${did}d\u5024` : !hasPerDicePlus && skDPlusVar ? skDPlusVar : null;
          const dCntVar = d.dCnt ? `S${rn}-${did}d\u6570` : !hasPerDiceCnt && skDCntVar ? skDCntVar : null;
          const mahi = buildMahiFormula(roll, dval, "", dPlusVar, dCntVar);
          if (isDefense) {
            const defLabel = useDiceIdx ? `${rn}-${did}` : `${rn}`;
            execRows.push(`${mahi}+{DT} ${defLabel}\uFF1A\u5224\u5B9A`);
          } else {
            const label = useDiceIdx ? `${rn}-${did}` : `${rn}`;
            execRows.push(`${mahi}+{MT} ${label}\uFF1A\u30DE\u30C3\u30C1`);
            execRows.push(`${mahi}+{DM} ${label}\uFF1A\u30C0\u30E1\u30FC\u30B8`);
          }
        });
        if (displayDice.length) headParts.push(displayDice.join("\\n"));
        L.push(headParts.join("\\n"));
        execRows.forEach((r) => L.push(r));
        L.push("");
      });
    }
    const hasDokaSupport = (p.supports || []).some((s) => (s.name || "").includes("E.G.O\u540C\u5316"));
    if (hasDokaSupport) {
      const dokaEgos = Object.entries(p.egoSlots || {}).filter(([, e]) => e && (e.sub_skills || []).length > 0);
      if (dokaEgos.length) {
        L.push("\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC");
        L.push("### \u25A0 \u540C\u5316\u30B9\u30AD\u30EB (E.G.O\u540C\u5316)");
        dokaEgos.forEach(([rank, e]) => {
          (e.sub_skills || []).forEach((sk, skIdx) => {
            const rn = String(sk.no ?? skIdx + 1);
            const rnk = `\u540C\u5316S${rn}`;
            const typ = sk.attr || "\u6253\u6483";
            const sin = sk.sin || "";
            const name = sanitizeInline(sk.name);
            const aoe = formatAoe(sk.aoe, sk.aoeCount);
            const eff = sk.effect || "";
            const isDefense = typ === "\u9632\u5FA1" || typ === "\u30DE\u30C3\u30C1\u53EF\u80FD\u9632\u5FA1" || typ === "\u56DE\u907F" || typ.includes("\u53CD\u6483");
            const headParts = [
              `\u3010\u540C\u5316\uFF5C${rank}\u3011${rnk}\uFF1A${name}`,
              `${typ}${sin ? "\uFF1A" + sin : ""}${aoe ? "\u3000\u5E83\u57DF\uFF1A" + aoe : ""}`
            ];
            const effBlk = buildLabeledBlock("\u52B9\u679C\uFF1A", eff);
            if (effBlk) headParts.push(effBlk);
            const displayDice = [];
            const execRows = [];
            const effectiveDiceCount = (sk.dice || []).filter((d) => d.roll || d.dval).length;
            const useDiceIdx = effectiveDiceCount > 1;
            (sk.dice || []).forEach((d, did0) => {
              const did = did0 + 1;
              const roll = sanitizeInline(d.roll);
              const dval = sanitizeInline(d.dval || "");
              const deff = sanitizeInline(d.effect);
              if (!roll && !dval) return;
              let showDeff = deff;
              if (deff) {
                const colIdx = deff.indexOf("\uFF1A");
                if (colIdx > 0) {
                  const part0 = deff.slice(0, colIdx).trim();
                  const part1 = deff.slice(colIdx + 1).trim();
                  if (/^\d[\d-]*$/.test(part0)) showDeff = part1;
                } else if (/^\d[\d-]*$/.test(deff.trim())) {
                  showDeff = "";
                }
              }
              displayDice.push(showDeff ? `${roll}\uFF1A${showDeff}` : roll);
              const mahi = buildMahiFormula(roll, dval, "", null, null);
              if (isDefense) {
                const defLabel = useDiceIdx ? `\u540C\u5316${rn}-${did}` : `\u540C\u5316${rn}`;
                execRows.push(`${mahi}+{DT} ${defLabel}\uFF1A\u5224\u5B9A`);
              } else {
                const label = useDiceIdx ? `\u540C\u5316${rn}-${did}` : `\u540C\u5316${rn}`;
                execRows.push(`${mahi}+{MT} ${label}\uFF1A\u30DE\u30C3\u30C1`);
                execRows.push(`${mahi}+{DM} ${label}\uFF1A\u30C0\u30E1\u30FC\u30B8`);
              }
            });
            if (displayDice.length) headParts.push(displayDice.join("\\n"));
            L.push(headParts.join("\\n"));
            execRows.forEach((r) => L.push(r));
            L.push("");
          });
        });
      }
    }
    const egoEntries = Object.entries(p.egoSlots || {}).filter(([, v]) => v);
    if (egoEntries.length) {
      L.push("\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC");
      L.push("### \u25A0 E.G.O");
      egoEntries.forEach(([rank, e]) => {
        const kSk = e.kakusei || {};
        const sSk = e.shinshoku || {};
        const cost = sanitizeInline(e.resources || "");
        const scK = sanitizeInline(e.san_cost || "");
        const nameBase = (e.name || "").replace(/^覚醒-|^侵蝕-/, "");
        if (kSk.effect || (kSk.dice || []).length) {
          const kParts = [`\u3010\u899A\u9192\uFF5C${rank}\u3011${e.name || nameBase}`, `\u30B3\u30B9\u30C8\uFF1A${cost} SAN-${scK}`];
          if (kSk.attr || kSk.sin || kSk.aoe) {
            kParts.push(`${kSk.attr || ""}${kSk.sin ? "\uFF1A" + kSk.sin : ""}${kSk.aoe ? "\u3000\u5E83\u57DF\uFF1A" + kSk.aoe : ""}`);
          }
          const kEff = buildLabeledBlock("\u899A\u9192\u52B9\u679C\uFF1A", kSk.effect);
          if (kEff) kParts.push(kEff);
          if (e.passive_name) {
            const passBlk = buildLabeledBlock(`E.G.O\u30D1\u30C3\u30B7\u30D6\u3010${e.passive_name}\u3011\uFF1A`, e.passive_effect);
            if (passBlk) kParts.push(passBlk);
          }
          const kDisplayDice = (kSk.dice || []).map((d) => d.effect ? `${d.roll}\uFF1A${d.effect}` : d.roll).filter(Boolean);
          if (kDisplayDice.length) kParts.push(kDisplayDice.join("\\n"));
          L.push(kParts.join("\\n"));
          (kSk.dice || []).forEach((d, di) => {
            if (!d.roll) return;
            const mahi = buildMahiFormula(d.roll, "", "", null, null);
            const suf = (kSk.dice || []).length > 1 ? String(di + 1) : "";
            L.push(`${mahi}+{MT} \u899A\u9192\uFF5C${nameBase}\uFF1A\u30DE\u30C3\u30C1${suf}`);
            L.push(`${mahi}+{DM} \u899A\u9192\uFF5C${nameBase}\uFF1A\u30C0\u30E1\u30FC\u30B8${suf}`);
          });
        }
        if (sSk.effect || (sSk.dice || []).length) {
          const sParts = [`\u3010\u4FB5\u8755\uFF5C${rank}\u3011${nameBase}`, `\u30B3\u30B9\u30C8\uFF1A${cost} SAN-${scK}`];
          if (sSk.attr || sSk.sin || sSk.aoe) {
            sParts.push(`${sSk.attr || ""}${sSk.sin ? "\uFF1A" + sSk.sin : ""}${sSk.aoe ? "\u3000\u5E83\u57DF\uFF1A" + sSk.aoe : ""}`);
          }
          const sBlk = buildLabeledBlock("\u4FB5\u8755\u52B9\u679C\uFF1A", sSk.effect);
          if (sBlk) sParts.push(sBlk);
          const sDisplayDice = (sSk.dice || []).map((d) => d.effect ? `${d.roll}\uFF1A${d.effect}` : d.roll).filter(Boolean);
          if (sDisplayDice.length) sParts.push(sDisplayDice.join("\\n"));
          L.push(sParts.join("\\n"));
          (sSk.dice || []).forEach((d, di) => {
            if (!d.roll) return;
            const mahi = buildMahiFormula(d.roll, "", "", null, null);
            const suf = (sSk.dice || []).length > 1 ? String(di + 1) : "";
            L.push(`${mahi}+{MT} \u4FB5\u8755\uFF5C${nameBase}\uFF1A\u30DE\u30C3\u30C1${suf}`);
            L.push(`${mahi}+{DM} \u4FB5\u8755\uFF5C${nameBase}\uFF1A\u30C0\u30E1\u30FC\u30B8${suf}`);
          });
        }
        L.push("");
      });
    }
    L.push("\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC");
    L.push("### \u25A0 \u4EE3\u5165\u5F0F");
    const fmls = resolveFormulas(state);
    fmls.forEach((f) => {
      L.push(`//${f.name}=${f.expr}`);
    });
    L.push("");
    const KW_LABELS = { "\u6307\u4EE4": "\u6307\u4EE4\u306E\u52A0\u8B77" };
    const KW_CANDIDATES = ["\u547C\u5438", "\u632F\u52D5", "\u51FA\u8840", "\u7834\u88C2", "\u5145\u96FB", "\u6C88\u6F5C", "\u706B\u50B7", "\u9EBB\u75FA", "\u6050\u614C", "\u6BD2", "\u6307\u4EE4"];
    const kwSet = /* @__PURE__ */ new Set();
    (p.uniqueBuffs || []).forEach((b) => {
      const n = (b.name || "").trim();
      if (n && (b.place || "status") === "status") kwSet.add(n);
    });
    (p.customStatuses || []).forEach((c) => {
      const n = (c.label || "").trim();
      if (n && (c.place || "status") === "status") kwSet.add(n);
    });
    if (p.personaSrc && Array.isArray(p.personaSrc.keywords)) {
      p.personaSrc.keywords.forEach((k) => {
        const lbl = KW_LABELS[k] || k;
        if (KW_CANDIDATES.includes(k)) kwSet.add(lbl);
      });
    }
    const effectDump = [p.pas.always, p.pas.effect, p.pas2.effect, ...(p.skills || []).map((s) => (s.effect || "") + (s.dice || []).map((d) => d.effect).join(" ")), p.spiritAlways, p.spiritMorale, p.spiritConfuse, ...(p.supports || []).map((s) => s.effect), ...(p.enhancements || []).map((e) => e.effect || "")].join(" ");
    KW_CANDIDATES.forEach((k) => {
      const lbl = KW_LABELS[k] || k;
      if (effectDump.includes(k) || effectDump.includes(lbl)) kwSet.add(lbl);
    });
    const autoCmds = [];
    kwSet.forEach((lbl) => {
      if (lbl.endsWith("\u4FDD\u8B77")) return;
      autoCmds.push(`:${lbl}+1`);
      autoCmds.push(`:${lbl}-1`);
    });
    const manualCmd = (p.extraCmd || "").trim();
    if (autoCmds.length) {
      L.push("\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC");
      L.push("### \u25A0 \u30D0\u30D5\u30FB\u30C7\u30D0\u30D5\u7BA1\u7406");
      autoCmds.forEach((c) => L.push(c));
      if (manualCmd) {
        L.push("");
        normalizeMultiline(manualCmd).split("\n").forEach((l) => L.push(l));
      }
    } else if (manualCmd) {
      L.push("\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC");
      L.push("### \u25A0 \u8FFD\u52A0\u30B3\u30DE\u30F3\u30C9");
      normalizeMultiline(manualCmd).split("\n").forEach((l) => L.push(l));
    }
    const filtered = [];
    let prevEmpty = false;
    for (const line of L) {
      const isEmpty = line === "";
      if (isEmpty && prevEmpty) continue;
      filtered.push(line);
      prevEmpty = isEmpty;
    }
    while (filtered.length && filtered[filtered.length - 1] === "") filtered.pop();
    return filtered.join("\n");
  }
  function buildMemo(state) {
    const p = state;
    const L = [];
    L.push(`\u3010PC\u3011${p.charName || "\u30AD\u30E3\u30E9\u30AF\u30BF\u30FC"}${p.plName ? `\u3000\u3010PL\u3011${p.plName}` : ""}`);
    L.push("");
    L.push("\u3010\u30B9\u30C6\u30FC\u30BF\u30B9\u3011");
    if (p.personaSrc) L.push(`\u4EBA\u683C\uFF1A${p.personaSrc.name || ""}`);
    const _eb = computeEnhancementBonuses(p);
    const _hpV = p.hp ? String((parseInt(p.hp) || 0) + _eb.hp) : "?";
    const _sanV = p.san ? String((parseInt(p.san) || 0) + _eb.san) : "?";
    L.push(`HP\uFF1A${_hpV}   SAN\uFF1A${_sanV}   \u901F\u5EA6\uFF1A${p.speed || "?"}${p.bullets && p.bullets !== "\xD7" ? `   \u5F3E\u4E38\uFF1A${p.bullets}` : ""}`);
    L.push(`\u65AC\u6483\uFF1A${p.resS}   \u8CAB\u901A\uFF1A${p.resP}   \u6253\u6483\uFF1A${p.resB}`);
    if (p.spirit) {
      L.push(`\u7CBE\u795E\uFF1A${p.spirit}`);
      if (p.spiritAlways) L.push(`\u3000\u5E38\u6642\uFF1A${p.spiritAlways.trim()}`);
      if (p.spiritMorale && p.spiritMorale !== "\u306A\u3057") L.push(`\u3000\u58EB\u6C17\u4F4E\u4E0B\uFF1A${p.spiritMorale.trim()}`);
      if (p.spiritConfuse) L.push(`\u3000\u6DF7\u4E71\uFF1A${p.spiritConfuse.trim()}`);
    }
    L.push("");
    if (p.pas.name) {
      L.push("\u25A0 \u4EBA\u683C\u30D1\u30C3\u30B7\u30D6");
      L.push(`\u3000${p.pas.name}\uFF08${p.pas.cond || "\u5E38\u6642"}\uFF09`);
      if (p.pas.always) p.pas.always.split("\n").filter(Boolean).forEach((l, i) => L.push(`\u3000\u3000${i === 0 ? "\u5E38\u6642\uFF1A" : ""}${l.trim()}`));
      if (p.pas.effect) p.pas.effect.split("\n").filter(Boolean).forEach((l, i) => L.push(`\u3000\u3000${i === 0 ? "\u52B9\u679C\uFF1A" : ""}${l.trim()}`));
      if (p.pas2Enabled && p.pas2.name) {
        L.push(`\u3000${p.pas2.name}\uFF08${p.pas2.cond || ""}\uFF09`);
        if (p.pas2.effect) p.pas2.effect.split("\n").filter(Boolean).forEach((l, i) => L.push(`\u3000\u3000${i === 0 ? "\u52B9\u679C\uFF1A" : ""}${l.trim()}`));
      }
      L.push("");
    }
    if (p.supports.length) {
      L.push("\u25A0 \u30B5\u30DD\u30FC\u30C8\u30D1\u30C3\u30B7\u30D6");
      p.supports.forEach((s, i) => {
        L.push(`\u3000${i + 1}. ${s.name}\uFF08${s.cond || ""}\uFF09  LP${s.lp || ""}`);
        if (s.effect) s.effect.split("\n").filter(Boolean).forEach((l, j) => L.push(`\u3000\u3000${j === 0 ? "\u52B9\u679C\uFF1A" : ""}${l.trim()}`));
      });
      L.push("");
    }
    if ((p.uniqueBuffs || []).length) {
      L.push("\u25A0 \u56FA\u6709\u30D0\u30D5\u30FB\u30B9\u30C6\u30FC\u30BF\u30B9");
      p.uniqueBuffs.forEach((b) => {
        L.push(`\u3000\u30FB${b.name}\uFF08${b.type || "\u56FA\u6709\u30D0\u30D5"}${b.max ? `\u3001\u6700\u5927${b.max}` : ""}\uFF09${b.desc ? `\uFF1A${b.desc}` : ""}`);
      });
      L.push("");
    }
    if ((p.enhancements || []).length) {
      L.push("\u25A0 \u7279\u6B8A\u5F37\u5316");
      p.enhancements.forEach((e) => L.push(`\u3000\u30FB${e.name}\uFF08\u6B20\u7247${e.shards || "-"}\uFF09\uFF1A${e.effect || ""}`));
      L.push("");
    }
    const egoEntries = Object.entries(p.egoSlots || {}).filter(([, v]) => v);
    if (egoEntries.length) {
      L.push("\u25A0 \u88C5\u5099E.G.O");
      egoEntries.forEach(([rank, e]) => {
        const parts = [`${rank}\uFF1A${e.name}`];
        if (e.resources) parts.push(e.resources);
        if (e.san_cost) parts.push(`SAN-${e.san_cost}`);
        L.push(`\u3000${parts.join("\u3000")}`);
      });
      L.push("");
    }
    const filtered = [];
    let prevEmpty = false;
    for (const line of L) {
      const isEmpty = line === "";
      if (isEmpty && prevEmpty) continue;
      filtered.push(line);
      prevEmpty = isEmpty;
    }
    while (filtered.length && filtered[filtered.length - 1] === "") filtered.pop();
    return filtered.join("\n");
  }
  function computeEnhancementBonuses(state) {
    const bonus = { hp: 0, san: 0 };
    const list = state.enhancements || [];
    for (const e of list) {
      const t = String(e.effect || "");
      let m;
      const reHp = /HPを(\d+)上昇/g;
      while ((m = reHp.exec(t)) !== null) bonus.hp += parseInt(m[1], 10);
      const reSan = /SANを(\d+)上昇/g;
      while ((m = reSan.exec(t)) !== null) bonus.san += parseInt(m[1], 10);
      const reHpP = /HP\+(\d+)/g;
      while ((m = reHpP.exec(t)) !== null) bonus.hp += parseInt(m[1], 10);
      const reSanP = /SAN\+(\d+)/g;
      while ((m = reSanP.exec(t)) !== null) bonus.san += parseInt(m[1], 10);
    }
    return bonus;
  }
  window.computeEnhancementBonuses = computeEnhancementBonuses;
  function buildCcfoliaJSON(state) {
    const p = state;
    const charName = p.charName || "\u30AD\u30E3\u30E9\u30AF\u30BF\u30FC";
    const plName = p.plName || "";
    const color = p.color || "#c8a84b";
    const _enhBonus = computeEnhancementBonuses(p);
    const hp = (parseInt(p.hp) || 100) + _enhBonus.hp;
    const san = (parseInt(p.san) || 50) + _enhBonus.san;
    const morale = p.moraleLine || String(Math.floor(san * 0.25));
    const { atkModLabel, hasVigor, hasDefMod } = detectMTMods(state);
    const baseList = p.defaultStatuses || DEFAULT_STATUS_LIST;
    const status = baseList.map((f) => {
      if (f.label === "HP") return { label: "HP", value: hp, max: hp };
      if (f.label === "SAN") return { label: "SAN", value: san, max: san };
      let max = f.max;
      if (max === "hp") max = hp;
      if (max === "san") max = san;
      if (typeof max === "string") max = parseInt(max) || 10;
      return { label: f.label, value: f.initial || 0, max };
    });
    const DEF_ST = new Set(status.map((s) => s.label));
    if (atkModLabel && !DEF_ST.has(atkModLabel)) {
      status.push({ label: atkModLabel, value: 1, max: 10 });
      DEF_ST.add(atkModLabel);
    }
    const hasTaunt = p.supports.some((s) => (s.effect || "").includes("\u6311\u767A\u5024")) || ((p.pas.always || "") + (p.pas.effect || "") + (p.pas2?.effect || "")).includes("\u6311\u767A\u5024");
    if (hasTaunt && !DEF_ST.has("\u6311\u767A\u5024")) {
      status.push({ label: "\u6311\u767A\u5024", value: 0, max: 10 });
      DEF_ST.add("\u6311\u767A\u5024");
    }
    if (hasDefMod && !DEF_ST.has("\u5B88\u5099\u5A01\u529B")) {
      status.push({ label: "\u5B88\u5099\u5A01\u529B", value: 1, max: 1 });
      DEF_ST.add("\u5B88\u5099\u5A01\u529B");
    }
    const UB_ST = /* @__PURE__ */ new Set();
    (p.uniqueBuffs || []).forEach((b) => {
      if (!b.name) return;
      if ((b.place || "status") !== "status") return;
      if (b.type === "\u4E2D\u7ACB\u30D0\u30D5") return;
      if (DEF_ST.has(b.name)) return;
      UB_ST.add(b.name);
      status.push({ label: b.name, value: b.initial !== void 0 ? b.initial : 0, max: b.max || 10 });
    });
    (p.customStatuses || []).forEach((c) => {
      if (!c.label) return;
      if ((c.place || "status") !== "status") return;
      if (DEF_ST.has(c.label) || UB_ST.has(c.label)) return;
      status.push({ label: c.label, value: c.initial || 0, max: c.max || 10 });
    });
    const params = [{ label: "\u58EB\u6C17\u4F4E\u4E0B\u30E9\u30A4\u30F3", value: morale }];
    if (hasVigor) params.push({ label: "\u95D8\u5FD7", value: 1 });
    if (hasDefMod) params.push({ label: "\u5B88\u5099\u5A01\u529B", value: 1 });
    (p.uniqueBuffs || []).forEach((b) => {
      if (!b.name) return;
      if ((b.place || "status") !== "params") return;
      params.push({ label: b.name, value: "" });
    });
    (p.customStatuses || []).forEach((c) => {
      if (!c.label) return;
      if ((c.place || "status") !== "params") return;
      params.push({ label: c.label, value: c.initial ?? "" });
    });
    const commands = buildPalette(state);
    const memo = buildMemo(state);
    const imgs = (p.imgUrls || "").split(/\r\n|\r|\n/).map((s) => s.trim()).filter(Boolean);
    const imgFields = imgs.length ? {
      iconUrl: imgs[0],
      faces: imgs.map((u, i) => ({ iconUrl: u, label: i === 0 ? charName : `${charName} \u5DEE\u5206${i}` })),
      externalUrl: imgs[0]
    } : {};
    const obj = {
      kind: "character",
      data: {
        name: charName,
        playerName: plName,
        color,
        status,
        params,
        commands,
        memo,
        ...imgFields
      }
    };
    return obj;
  }
  function buildShareSheetHTML(state) {
    const p = state;
    const esc = (s) => String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
    const nl = (s) => esc(s).replace(/\n/g, "<br>");
    const fmt = (t) => {
      if (!t) return "";
      const normalized = formatEffectLines(t);
      return esc(normalized).replace(/(【[^】]+】)/g, '<br><b class="tim">$1</b> ').replace(/(◆[^\n]+)/g, '<br><b class="tim">$1</b> ').replace(/^<br>/, "").replace(/\n/g, "<br>");
    };
    const eqEgos = ["ZAYIN", "TETH", "HE", "WAW", "ALEPH"].map((rk) => p.egoSlots[rk] ? { ...p.egoSlots[rk], _rank: rk } : null).filter(Boolean);
    const diceHTML = (dice) => (dice || []).map((d, i) => `
    <div class="dice-row">
      <span class="dice-idx">${i + 1}</span>
      <span class="dice-roll">${esc(d.roll || "-")}</span>
      <span class="dice-eff">${nl(d.effect || "")}</span>
    </div>
  `).join("");
    const skillsHTML = p.skills.length ? `
    <section class="sec"><h2>TACTICAL SKILLS / \u6226\u8853\u30B9\u30AD\u30EB</h2>
      <div class="grid-skills">
        ${p.skills.map((sk) => `
          <article class="skl" data-sin="${esc(sk.sin)}">
            <div class="skl-h">
              <span class="skl-rank">${esc(sk.rank || "")}</span>
              <span class="skl-name">${esc(sk.name || "")}</span>
            </div>
            <div class="skl-meta">${sk.type ? `<span class="attr-tag">${esc(sk.type)}</span>` : ""}${sk.sin ? `<b class="sin-tag" data-sin="${esc(sk.sin)}">${esc(sk.sin)}</b>` : ""}${sk.aoe ? `<span class="aoe-tag">${esc(formatAoe(sk.aoe, sk.aoeCount))}</span>` : ""}</div>
            ${sk.effect ? `<div class="skl-e">${fmt(sk.effect)}</div>` : ""}
            ${(sk.dice || []).length ? `<div class="dice-title">DICE / \u30C0\u30A4\u30B9</div><div class="dice-block">${diceHTML(sk.dice)}</div>` : ""}
          </article>
        `).join("")}
      </div>
    </section>` : "";
    const supportHTML = p.supports.length ? `
    <section class="sec"><h2>SUPPORT PASSIVES / \u30B5\u30DD\u30FC\u30C8\u30D1\u30C3\u30B7\u30D6</h2>
      ${p.supports.map((s) => `
        <div class="spp">
          <div class="spp-h"><b>${esc(s.name)}</b>${s.lp ? `<span class="cond lp">LP${esc(s.lp)}</span>` : ""}${s.cond ? `<span class="cond">${esc(s.cond)}</span>` : ""}</div>
          ${s.effect ? `<div class="eff">${fmt(s.effect)}</div>` : ""}
        </div>
      `).join("")}
    </section>` : "";
    const egoSkillHTML = (label, sk, cls) => {
      if (!sk || !sk.effect && !(sk.dice || []).length) return "";
      return `
      <div class="ego-sk ${cls}">
        <div class="ego-sk-h">
          <u>${label}</u>
          ${sk.attr ? `<span class="ego-sk-attr">${esc(sk.attr)}</span>` : ""}
          ${sk.sin ? `<span class="sin-tag" data-sin="${esc(sk.sin)}">${esc(sk.sin)}</span>` : ""}
          ${sk.aoe ? `<span class="aoe-tag">${esc(formatAoe(sk.aoe, sk.aoeCount))}</span>` : ""}
        </div>
        ${sk.effect ? `<div class="eff">${fmt(sk.effect)}</div>` : ""}
        ${(sk.dice || []).length ? `<div class="dice-title">DICE / \u30C0\u30A4\u30B9</div><div class="dice-block">${diceHTML(sk.dice)}</div>` : ""}
      </div>
    `;
    };
    const egosHTML = eqEgos.length ? `
    <section class="sec"><h2>E.G.O EQUIPMENT / E.G.O \u88C5\u5099</h2>
      ${eqEgos.map((e) => `
        <article class="ego" data-rank="${esc(e._rank)}">
          <div class="ego-h">
            <span class="ego-rank">${esc(e._rank)}</span>
            <span class="ego-name">${esc(e.name)}</span>
            <span class="ego-cost">SAN ${esc(e.san_cost)} \xB7 \u6B20\u7247 ${esc(e.shards)}</span>
          </div>
          ${e.resources ? `<div class="ego-res">${esc(e.resources)}</div>` : ""}
          ${e.passive_name ? `<div class="ego-p"><b>${esc(e.passive_name)}</b>${e.passive_cond ? ` <span class="cond">${esc(e.passive_cond)}</span>` : ""}<div class="eff">${fmt(e.passive_effect || "")}</div></div>` : ""}
          ${egoSkillHTML("\u899A\u9192\u52B9\u679C", e.kakusei, "kakusei")}
          ${egoSkillHTML("\u4FB5\u8755\u52B9\u679C", e.shinshoku, "shinshoku")}
          ${e.unique_buff ? `<div class="eff"><u>\u56FA\u6709\u30D0\u30D5</u><br>${nl(e.unique_buff)}</div>` : ""}
        </article>
      `).join("")}
    </section>` : "";
    const uniqueHTML = (p.uniqueBuffs || []).length ? `
    <section class="sec"><h2>UNIQUE / \u56FA\u6709\u30D0\u30D5\u30FB\u30B9\u30C6\u30FC\u30BF\u30B9</h2>
      <div class="panel">${p.uniqueBuffs.map((u) => `
        <div class="share-unique">
          <div class="u-head">
            <b>${esc(u.name)}</b>
            <span class="u-type u-${esc(u.type || "\u56FA\u6709\u30D0\u30D5")}">${esc(u.type || "\u56FA\u6709\u30D0\u30D5")}</span>
            ${u.max ? `<span class="u-val">\u6700\u5927 ${esc(u.max)}</span>` : ""}
          </div>
          ${u.desc ? `<div class="eff">${nl(u.desc)}</div>` : ""}
        </div>`).join("")}
      </div>
    </section>` : "";
    const spiritHTML = p.spirit ? `
    <section class="sec"><h2>SPIRIT / \u7CBE\u795E</h2>
      <div class="panel">
        <div class="spirit-h"><b>${esc(p.spirit)}</b></div>
        ${p.spiritAlways ? `<div class="eff"><u>\u5E38\u6642</u> ${fmt(p.spiritAlways)}</div>` : ""}
        ${p.spiritMorale ? `<div class="eff"><u>\u58EB\u6C17\u4F4E\u4E0B</u> ${fmt(p.spiritMorale)}</div>` : ""}
        ${p.spiritConfuse ? `<div class="eff"><u>\u6DF7\u4E71</u> ${fmt(p.spiritConfuse)}</div>` : ""}
      </div>
    </section>` : "";
    const enhHTML = (p.enhancements || []).length ? `
    <section class="sec"><h2>ENHANCEMENTS / \u5F37\u5316</h2>
      ${p.enhancements.map((e) => `<div class="spp"><div class="spp-h"><b>${esc(e.name)}</b><span class="cond">\u6B20\u7247${esc(e.shards)}</span></div><div class="eff">${nl(e.effect)}</div></div>`).join("")}
    </section>` : "";
    const pasHTML = p.pas.name ? `
    <section class="sec"><h2>PASSIVE / \u30D1\u30C3\u30B7\u30D6</h2>
      <div class="panel">
        <div class="pas-h"><b>${esc(p.pas.name)}</b>${p.pas.cond ? `<span class="cond">${esc(p.pas.cond)}</span>` : ""}</div>
        ${p.pas.always ? `<div class="eff always">\u5E38\u6642\uFF1A${fmt(p.pas.always)}</div>` : ""}
        ${p.pas.effect ? `<div class="eff">${fmt(p.pas.effect)}</div>` : ""}
      </div>
      ${p.pas2Enabled && p.pas2.name ? `<div class="panel"><div class="pas-h"><b>${esc(p.pas2.name)}</b>${p.pas2.cond ? `<span class="cond">${esc(p.pas2.cond)}</span>` : ""}</div>${p.pas2.effect ? `<div class="eff">${fmt(p.pas2.effect)}</div>` : ""}</div>` : ""}
    </section>` : "";
    return `<!DOCTYPE html>
<html lang="ja"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(p.charName || "PC")} \u2014 Limbus TRPG \u30B7\u30FC\u30C8</title>
<link href="https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=Share+Tech+Mono&family=Noto+Sans+JP:wght@400;500;700;900&family=Cormorant+Garamond:wght@500;600;700&display=swap" rel="stylesheet">
<style>
/* v52 (H): \u5171\u6709\u30B7\u30FC\u30C8\u306E\u30AB\u30E9\u30FC\u3092\u7DE8\u96C6\u753B\u9762 (design-system.css) \u3068\u53B3\u5BC6\u306B\u7D71\u4E00\u3002
   sepia \u30C6\u30FC\u30DE\u306F\u5EC3\u6B62\u3002\u30C0\u30FC\u30AF+\u30B4\u30FC\u30EB\u30C9\u306E\u307F\u3002
   \u3053\u308C\u306B\u3088\u308A\u300C\u7DE8\u96C6\u753B\u9762 \u2192 \u5171\u6709\u30B7\u30FC\u30C8\u300D\u306E\u8996\u899A\u7684\u65AD\u7D76\u304C\u306A\u304F\u306A\u308A\u3001
   \u8AAD\u307F\u624B\u3082\u540C\u3058\u4E16\u754C\u89B3\u3067\u60C5\u5831\u3092\u8FFD\u3048\u308B\u3002 */
:root{
  --bg:#14110d;             /* design-system.css --bg */
  --panel:#23201a;          /* --surface-1 */
  --panel2:#2b2820;         /* --surface-2 */
  --line:#3f3b34;           /* --surface-4 / line \u76F8\u5F53 */
  --line2:#2b2820;
  --gold:#d4b158;           /* --gold */
  --gold-hi:#e6c876;        /* --gold-hi */
  --tx:#f2ecd8;             /* --tx */
  --tx2:#d6cfb3;
  --tx3:#a79b80;
  --mono:'Share Tech Mono',monospace; --head:'Rajdhani','Noto Sans JP',sans-serif;
  /* \u5927\u7F6A\u8272 v51\uFF1A\u672C\u4F53UI\u3068\u53B3\u5BC6\u306B\u540C\u4E00\u5024\u3002 */
  --sin-\u61A4\u6012:#d94d3f; --sin-\u8272\u6B32:#ea813a; --sin-\u6020\u60F0:#d9d357; --sin-\u66B4\u98DF:#7ec455;
  --sin-\u6182\u9B31:#4aa8ee; --sin-\u50B2\u6162:#6ad8d1; --sin-\u5AC9\u59AC:#b872d9; --sin-\u7279\u6B8A:#b0adaf;
  --rank-ZAYIN:#6ea555; --rank-TETH:#4a9fe0; --rank-HE:#c9c650; --rank-WAW:#d97e3a; --rank-ALEPH:#b83a3a;
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--tx);font-family:'Noto Sans JP',sans-serif;font-size:14px;line-height:1.7;padding:24px}
.wrap{max-width:960px;margin:0 auto}
/* v52: \u30C6\u30FC\u30DE\u5207\u66FF\u30DC\u30BF\u30F3\u5EC3\u6B62\u3002\u30C0\u30FC\u30AF\u4E00\u672C\u5316 */
.theme-btn{display:none}

/* --- Header: PC/PL/\u4EBA\u683C\u540D \u306E\u8996\u8A8D\u6027\u3092\u6700\u5927\u5316 --- */
.hd{border-bottom:2px solid var(--gold);padding-bottom:18px;margin-bottom:24px}
.hd-plpc{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:10px;font-size:11px;font-family:var(--mono);letter-spacing:0.14em}
.hd-plpc span b{color:var(--gold);margin-right:6px;font-weight:normal}
.hd-plpc span{color:var(--tx2)}
.hd h1{font-family:var(--head);font-weight:700;letter-spacing:0.04em;font-size:38px;margin:0 0 6px;color:var(--tx);line-height:1.1}
.hd .persona-line{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:8px}
.hd .persona-line .lbl{font-family:var(--mono);font-size:10px;letter-spacing:0.2em;color:var(--tx3);text-transform:uppercase;padding:3px 10px;background:rgba(200,168,75,0.1);border:1px solid rgba(200,168,75,0.4);border-radius:2px}
.hd .persona-line .val{font-family:var(--head);font-weight:700;font-size:24px;color:var(--gold-hi);letter-spacing:0.02em}

/* --- Stats --- */
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:18px}
.stat{padding:10px 14px;background:var(--panel2);border:1px solid var(--line);border-radius:2px}
.stat .lbl{font-family:var(--mono);font-size:10px;letter-spacing:0.14em;color:var(--tx3);text-transform:uppercase;margin-bottom:2px}
.stat .val{font-family:var(--head);font-weight:700;font-size:22px;color:var(--tx)}

/* --- Resistance (\u5927\u304D\u304F\u3059\u308B) --- */
.res-title{font-family:var(--head);font-weight:700;letter-spacing:0.18em;font-size:13px;color:var(--gold);margin-bottom:10px;text-transform:uppercase}
.res-row{display:flex;gap:10px;margin-bottom:26px;flex-wrap:wrap}
.res{padding:12px 22px;font-family:var(--head);font-size:20px;font-weight:800;letter-spacing:0.08em;border:2px solid;border-radius:4px;display:inline-flex;align-items:center;gap:12px;min-width:150px;box-shadow:0 2px 6px rgba(0,0,0,0.28)}
.res .attr{font-size:16px;font-weight:700;opacity:0.92;padding-right:12px;border-right:1px solid rgba(255,255,255,0.35);letter-spacing:0.04em}
/* v54: \u8010\u6027\u8272\u3092\u9577\u6642\u9593\u8996\u8A8D\u30C8\u30FC\u30F3\u3078\u3002\u9AD8\u5F69\u5EA6\u30D9\u30BF\u5857\u308A\u306F\u6697\u6240\u3067\u307E\u3076\u3057\u3044\u305F\u3081\u6E1B\u5149\u3057\u3001
   \u7DE8\u96C6\u753B\u9762\u306E design-system \u8010\u6027\u8272 (--res-*) \u3068\u540C\u3058\u8272\u8ABF\u306B\u63C3\u3048\u3066\u8996\u899A\u65AD\u7D76\u3092\u89E3\u6D88 */
.res[data-r="\u8106\u5F31"]{background:#8f4a44;color:#f4e2e0;border-color:#6b322e}
.res[data-r="\u5F31\u70B9"]{background:#96683c;color:#f7e9d8;border-color:#6e4a24}
.res[data-r="\u666E\u901A"]{background:var(--panel2);color:var(--tx2);border-color:var(--line)}
.res[data-r="\u62B5\u6297"]{background:#4c7055;color:#e3f0e6;border-color:#33503a}
.res[data-r="\u8010\u6027"]{background:#436a85;color:#e2ecf2;border-color:#2c4a5f}
.res[data-r="\u514D\u75AB"]{background:#635684;color:#eae4f2;border-color:#443a5e}

/* --- Sections v52: h2\u306B\u30B4\u30FC\u30EB\u30C9\u5E2F\u3092\u4F34\u3046\u5927\u898B\u51FA\u3057\uFF0F\u30D1\u30CD\u30EB\u306B\u5185\u90E8\u30BB\u30D1\u30EC\u30FC\u30BF --- */
.sec{margin-bottom:32px;position:relative}
.sec h2{font-family:var(--head);font-weight:700;letter-spacing:0.22em;font-size:15px;color:var(--gold);margin:0 0 14px;padding:8px 0 8px 14px;border-left:4px solid var(--gold);background:linear-gradient(90deg,rgba(212,177,88,0.10),transparent 60%);text-transform:uppercase;position:relative}
.sec h2::after{content:'';position:absolute;left:0;right:0;bottom:-6px;height:1px;background:linear-gradient(90deg,var(--gold),transparent 40%)}
.panel{padding:14px 16px;background:var(--panel);border:1px solid var(--line);border-left:3px solid var(--gold);border-radius:2px;margin-bottom:12px}

/* --- Skills --- */
.grid-skills{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:10px}
.skl{padding:12px 14px;background:var(--panel);border:1px solid var(--line);border-top:3px solid var(--sin-color,var(--tx3));border-radius:0 0 2px 2px;box-shadow:0 1px 0 rgba(0,0,0,0.4),0 2px 8px rgba(0,0,0,0.15)}
.skl[data-sin="\u61A4\u6012"]{--sin-color:var(--sin-\u61A4\u6012)} .skl[data-sin="\u8272\u6B32"]{--sin-color:var(--sin-\u8272\u6B32)}
.skl[data-sin="\u6020\u60F0"]{--sin-color:var(--sin-\u6020\u60F0)} .skl[data-sin="\u66B4\u98DF"]{--sin-color:var(--sin-\u66B4\u98DF)}
.skl[data-sin="\u6182\u9B31"]{--sin-color:var(--sin-\u6182\u9B31)} .skl[data-sin="\u50B2\u6162"]{--sin-color:var(--sin-\u50B2\u6162)}
.skl[data-sin="\u5AC9\u59AC"]{--sin-color:var(--sin-\u5AC9\u59AC)} .skl[data-sin="\u7279\u6B8A"]{--sin-color:var(--sin-\u7279\u6B8A)}
.skl-h{display:flex;align-items:baseline;gap:8px;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid var(--line2);flex-wrap:wrap}
.skl-rank{font-family:var(--head);font-weight:700;font-size:11px;letter-spacing:0.14em;color:var(--gold);padding:2px 8px;background:rgba(200,168,75,0.1);border:1px solid rgba(200,168,75,0.4)}
.skl-name{font-family:var(--head);font-weight:700;font-size:16px;color:var(--tx)}
.skl-meta{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:-4px 0 10px;padding-bottom:8px;border-bottom:1px solid var(--line2)}
.attr-tag{display:inline-block;padding:2px 8px;font-family:var(--head);font-size:11px;font-weight:700;letter-spacing:0.1em;color:var(--tx2);background:var(--panel2);border:1px solid var(--line);border-radius:2px}
.skl-name{overflow-wrap:anywhere;line-height:1.25}
.skl-h{display:flex;align-items:baseline;gap:8px;margin-bottom:8px;padding-bottom:8px;border-bottom:none;flex-wrap:wrap}
.skl-e{font-size:13px;color:var(--tx);line-height:1.75;margin-bottom:6px;padding:8px 10px;background:rgba(0,0,0,0.20);border-left:2px solid var(--gold);border-radius:2px}

/* v52: \u30C0\u30A4\u30B9\u30BB\u30AF\u30B7\u30E7\u30F3\u306E\u533A\u5207\u308A\u5F37\u5316 */
.dice-title{font-family:var(--head);font-size:11px;letter-spacing:0.28em;color:var(--gold);text-transform:uppercase;margin:12px 0 8px;padding:4px 8px;background:linear-gradient(90deg,rgba(212,177,88,0.15),transparent 70%);border-left:2px solid var(--gold);font-weight:700}
.dice-block{display:flex;flex-direction:column;gap:4px;padding:6px;background:rgba(0,0,0,0.25);border:1px solid var(--line);border-radius:3px}
.dice-row{display:grid;grid-template-columns:20px minmax(64px,max-content) 1fr;gap:8px;align-items:baseline;font-size:12.5px;padding:5px 8px;background:var(--panel2);border:1px solid var(--line);border-left:3px solid var(--gold-hi);border-radius:2px}
.dice-row + .dice-row{margin-top:0}
.dice-idx{font-family:var(--mono);font-size:12px;font-weight:700;color:var(--gold-hi);text-align:center;line-height:1.4;background:rgba(212,177,88,0.15);border:1px solid var(--gold);border-radius:2px;padding:2px 0}
.dice-roll{font-family:var(--mono);color:var(--gold-hi);font-weight:700;font-size:13.5px;letter-spacing:0.04em;padding-right:8px;border-right:1px dashed var(--line2);white-space:nowrap}
.dice-eff{color:var(--tx);line-height:1.6;min-width:0;word-break:break-word;font-size:12.5px}

/* --- \u5927\u7F6A\u30AB\u30E9\u30FC\u30BF\u30B0 --- */
.sin-tag{display:inline-block;padding:2px 10px;font-family:var(--head);font-size:11px;font-weight:700;letter-spacing:0.08em;border-radius:2px;background:var(--sin-color,var(--panel2));color:#fff;text-shadow:0 1px 0 rgba(0,0,0,0.35);border:1px solid rgba(0,0,0,0.2)}
/* v51: \u5927\u7F6A\u30D9\u30BF\u5857\u308A\u30BF\u30B0\u306E\u524D\u666F\u8272\u3002\u660E\u5EA6\u304C\u9AD8\u3044\u8272 (\u6020\u60F0:\u9EC4, \u66B4\u98DF:\u7DD1, \u50B2\u6162:teal, \u7279\u6B8A:\u7070) \u306F
   \u9ED2\u30C6\u30AD\u30B9\u30C8+\u5F71\u306A\u3057\u3067\u53EF\u8AAD\u6027\u78BA\u4FDD\u3001\u305D\u308C\u4EE5\u5916\u306F\u767D\u30C6\u30AD\u30B9\u30C8+\u9ED2\u5F71 */
.sin-tag[data-sin="\u61A4\u6012"]{--sin-color:var(--sin-\u61A4\u6012)}
.sin-tag[data-sin="\u8272\u6B32"]{--sin-color:var(--sin-\u8272\u6B32)}
.sin-tag[data-sin="\u6020\u60F0"]{--sin-color:var(--sin-\u6020\u60F0);color:#1a1500;text-shadow:none}
.sin-tag[data-sin="\u66B4\u98DF"]{--sin-color:var(--sin-\u66B4\u98DF);color:#0a1a02;text-shadow:none}
.sin-tag[data-sin="\u6182\u9B31"]{--sin-color:var(--sin-\u6182\u9B31)}
.sin-tag[data-sin="\u50B2\u6162"]{--sin-color:var(--sin-\u50B2\u6162);color:#052422;text-shadow:none}
.sin-tag[data-sin="\u5AC9\u59AC"]{--sin-color:var(--sin-\u5AC9\u59AC)}
.sin-tag[data-sin="\u7279\u6B8A"]{--sin-color:var(--sin-\u7279\u6B8A);color:#151515;text-shadow:none}
.aoe-tag{display:inline-block;padding:1px 8px;font-family:var(--head);font-size:10px;color:var(--gold);border:1px solid var(--gold);border-radius:2px;letter-spacing:0.12em;font-weight:700}

/* --- EGO --- */
.ego{padding:14px 16px;margin-bottom:14px;background:var(--panel);border:1px solid var(--line);border-top:3px solid var(--rank-color);box-shadow:0 2px 8px rgba(0,0,0,0.2)}
.ego[data-rank="ZAYIN"]{--rank-color:var(--rank-ZAYIN)} .ego[data-rank="TETH"]{--rank-color:var(--rank-TETH)}
.ego[data-rank="HE"]{--rank-color:var(--rank-HE)} .ego[data-rank="WAW"]{--rank-color:var(--rank-WAW)}
.ego[data-rank="ALEPH"]{--rank-color:var(--rank-ALEPH)}
.ego-h{display:flex;align-items:baseline;gap:12px;margin-bottom:8px;flex-wrap:wrap}
.ego-rank{font-family:var(--head);font-weight:700;font-size:12px;letter-spacing:0.22em;color:var(--rank-color)}
.ego-name{font-family:var(--head);font-weight:700;font-size:18px;color:var(--tx)}
.ego-cost{font-family:var(--mono);font-size:11px;color:var(--tx3);margin-left:auto}
.ego-res{font-family:var(--mono);font-size:11px;color:var(--tx2);margin-bottom:8px}
.ego-p{margin-top:10px;padding-top:8px;border-top:1px dashed var(--line2)}
.ego-sk{margin-top:14px;padding:12px 14px;background:rgba(0,0,0,0.25);border:1px solid var(--line);border-radius:3px;position:relative}
.ego-sk.kakusei{border-left:3px solid var(--gold)}
.ego-sk.shinshoku{border-left:3px solid #b83a3a}
.ego-sk-h{display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap}
.ego-sk-h u{color:var(--gold);text-decoration:none;font-family:var(--head);font-size:12px;letter-spacing:0.16em;font-weight:700;text-transform:uppercase}
.ego-sk.shinshoku .ego-sk-h u{color:#e5a0a0}
.ego-sk-attr{font-family:var(--mono);font-size:10px;color:var(--tx3);padding:1px 6px;background:var(--panel2);border:1px solid var(--line2);border-radius:2px}

/* --- Support Passives, Enh, Unique, Spirit --- */
.spp{padding:10px 14px;margin-bottom:10px;background:var(--panel);border:1px solid var(--line);border-left:3px solid var(--gold);border-radius:2px}
.spp-h{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px}
.spp b{font-family:var(--head);font-size:14px;color:var(--tx);letter-spacing:0.02em;font-weight:700}
.spp .cond{padding:2px 8px;font-family:var(--mono);font-size:10px;color:var(--tx3);border:1px solid var(--line2)}
.spp .cond.lp{color:var(--gold);border-color:rgba(200,168,75,0.4)}
.spp .eff{margin-top:4px;font-size:12.5px;color:var(--tx2);line-height:1.7}
.share-unique{border:1px solid var(--line);border-left:3px solid var(--gold);padding:10px 12px;margin-bottom:10px;background:var(--panel2);border-radius:2px}
.share-unique .u-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.share-unique b{font-family:var(--head);font-size:15px;color:var(--tx);letter-spacing:0.02em;font-weight:700}
.share-unique .u-type{display:inline-block;font-family:var(--mono);font-size:10px;padding:1px 7px;border:1px solid var(--gold);color:var(--gold);letter-spacing:0.08em}
.share-unique .u-type.u-\u30D0\u30D5{border-color:#9dd764;color:#9dd764}
.share-unique .u-type.u-\u30C7\u30D0\u30D5{border-color:#e5786f;color:#e5786f}
.share-unique .u-type.u-\u4E2D\u7ACB\u30D0\u30D5{border-color:#dfc06a;color:#dfc06a}
.share-unique .u-val{margin-left:auto;font-family:var(--mono);color:var(--gold-hi);font-size:12px}
.spirit-h b{font-family:var(--head);font-weight:700;font-size:16px;color:var(--tx)}
.pas-h b{font-family:var(--head);font-weight:700;font-size:16px;color:var(--tx)}
.pas-h .cond{margin-left:10px;font-family:var(--mono);font-size:11px;color:var(--tx3)}
.eff{font-size:12.5px;color:var(--tx2);line-height:1.7;margin-top:6px}
.eff.always{padding:6px 10px;background:rgba(200,168,75,0.06);border-left:2px solid var(--gold);margin-bottom:6px}
.eff u{color:var(--gold);text-decoration:none;font-family:var(--head);font-size:11px;letter-spacing:0.14em;text-transform:uppercase;font-weight:700}
.tim{color:var(--gold);font-family:var(--head);font-size:11.5px;letter-spacing:0.08em;font-weight:700}
.foot{margin-top:36px;padding-top:16px;border-top:1px solid var(--line2);font-family:var(--mono);font-size:10px;color:var(--tx3);letter-spacing:0.1em;text-align:center}
@media print{ body{background:#fff;color:#000} }
@media (max-width:640px){ body{padding:12px;font-size:13px} .stats{grid-template-columns:repeat(2,1fr)} .hd h1{font-size:28px} .res{min-width:120px;padding:9px 16px;font-size:17px} }
</style></head><body>
<div class="wrap">
  <header class="hd">
    <div class="hd-plpc">
      <span><b>\u3010PC\u3011</b>${esc(p.charName || "\u2014")}</span>
      ${p.plName ? `<span><b>\u3010PL\u3011</b>${esc(p.plName)}</span>` : ""}
    </div>
    <h1>${esc(p.charName || "PC")}</h1>
    ${p.personaSrc ? `<div class="persona-line"><span class="lbl">\u4EBA\u683C</span><span class="val">${esc(p.personaSrc.name)}</span>${p.personaMode === "t" ? '<span class="lbl" style="background:rgba(200,168,75,0.2)">\u7279\u7570</span>' : ""}</div>` : ""}
  </header>
  <div class="stats">
    <div class="stat"><div class="lbl">HP</div><div class="val">${esc(p.hp || "\u2014")}</div></div>
    <div class="stat"><div class="lbl">SAN</div><div class="val">${esc(p.san || "\u2014")}</div></div>
    <div class="stat"><div class="lbl">\u901F\u5EA6</div><div class="val">${esc(p.speed || "\u2014")}</div></div>
    <div class="stat"><div class="lbl">\u5F3E\u4E38</div><div class="val">${esc(p.bullets || "\xD7")}</div></div>
  </div>
  <div class="res-title">\u8010\u6027 / RESISTANCE</div>
  <div class="res-row">
    <span class="res" data-r="${esc(p.resS)}"><span class="attr">\u65AC\u6483</span><span>${esc(p.resS)}</span></span>
    <span class="res" data-r="${esc(p.resP)}"><span class="attr">\u8CAB\u901A</span><span>${esc(p.resP)}</span></span>
    <span class="res" data-r="${esc(p.resB)}"><span class="attr">\u6253\u6483</span><span>${esc(p.resB)}</span></span>
  </div>
  ${pasHTML}
  ${skillsHTML}
  ${egosHTML}
  ${supportHTML}
  ${spiritHTML}
  ${uniqueHTML}
  ${enhHTML}
  <div class="foot">LIMBUS BUILD TERMINAL ${esc(window.LBT_VERSION || "v52")} \xB7 Character Sheet \xB7 Generated ${(/* @__PURE__ */ new Date()).toLocaleString("ja-JP")}</div>
</div></body></html>`;
  }
  const LBT_SHARE_HOSTS = [
    {
      id: "catbox",
      label: "Catbox\uFF08\u6C38\u7D9A\uFF09",
      kind: "form",
      url: "https://catbox.moe/user/api.php",
      build(htmlBlob, fd) {
        fd.append("reqtype", "fileupload");
        fd.append("fileToUpload", htmlBlob, "sheet.html");
      },
      parse: (t) => /^https?:\/\/files\.catbox\.moe\/\S+\.html/.test(t.trim()) ? t.trim() : null
    },
    {
      id: "0x0",
      label: "0x0.st\uFF0830\u65E5\u301C\uFF09",
      kind: "form",
      url: "https://0x0.st",
      build(htmlBlob, fd) {
        fd.append("file", htmlBlob, "sheet.html");
      },
      parse: (t) => /^https?:\/\/0x0\.st\/\S+/.test(t.trim()) ? t.trim() : null
    },
    {
      id: "uguu",
      label: "Uguu\uFF083\u6642\u9593\u30FB\u5FDC\u6025\uFF09",
      kind: "form",
      url: "https://uguu.se/upload.php",
      build(htmlBlob, fd) {
        fd.append("files[]", htmlBlob, "sheet.html");
      },
      parse: (t) => {
        try {
          const j = JSON.parse(t);
          const u = j.files && j.files[0] && j.files[0].url;
          return u || null;
        } catch (e) {
          return null;
        }
      }
    }
  ];
  async function lbtSha256Hex(text) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  function lbtShareLinkMap() {
    try {
      return JSON.parse(localStorage.getItem("lbt_share_links") || "{}");
    } catch (e) {
      return {};
    }
  }
  function lbtShareLinkSave(hash, entry) {
    const m = lbtShareLinkMap();
    m[hash] = entry;
    try {
      localStorage.setItem("lbt_share_links", JSON.stringify(m));
    } catch (e) {
    }
  }
  async function lbtUploadTo(host, htmlBlob, timeoutMs) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs || 2e4);
    try {
      const fd = new FormData();
      host.build(htmlBlob, fd);
      const res = await fetch(host.url, { method: "POST", body: fd, signal: ctrl.signal });
      const text = await res.text();
      if (!res.ok) throw new Error(host.label + " http " + res.status);
      const url = host.parse(text);
      if (!url) throw new Error(host.label + " \u5FDC\u7B54\u3092\u89E3\u91C8\u3067\u304D\u307E\u305B\u3093");
      return url;
    } finally {
      clearTimeout(timer);
    }
  }
  async function publishShareSheetOnline(html) {
    const hash = await lbtSha256Hex(html);
    const cached = lbtShareLinkMap()[hash];
    if (cached && cached.url) {
      return { url: cached.url, host: cached.host, cached: true };
    }
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    let lastErr = null;
    for (const h of LBT_SHARE_HOSTS) {
      try {
        const url = await lbtUploadTo(h, blob, 25e3);
        const entry = { url, host: h.label, at: Date.now() };
        lbtShareLinkSave(hash, entry);
        return { url, host: h.label, cached: false };
      } catch (e) {
        lastErr = e;
      }
    }
    throw new Error("\u5168\u3066\u306E\u30DB\u30B9\u30C8\u3067\u516C\u958B\u306B\u5931\u6557\u3057\u307E\u3057\u305F\uFF08\u6700\u5F8C\u306E\u30A8\u30E9\u30FC: " + (lastErr && lastErr.message || "\u4E0D\u660E") + "\uFF09");
  }
  window.publishShareSheetOnline = publishShareSheetOnline;
  async function openShareSheet(state) {
    const html = buildShareSheetHTML(state);
    const filename = `${(state.charName || "character").replace(/[^\w\-一-龥ぁ-んァ-ヴ]/g, "_") || "character"}_sheet.html`;
    const prev = document.getElementById("lbt-share-modal-root");
    if (prev) prev.remove();
    const root = document.createElement("div");
    root.id = "lbt-share-modal-root";
    root.innerHTML = `
    <div class="share-modal-backdrop" data-close>
      <div class="share-modal" role="dialog" aria-labelledby="lbt-share-title">
        <div class="share-modal-head">
          <div class="share-modal-title" id="lbt-share-title">\u25C8 \u5171\u6709\u30B7\u30FC\u30C8 \u2014 \u767A\u884C\u65B9\u6CD5\u3092\u9078\u629E</div>
          <button class="share-modal-close" data-close aria-label="\u9589\u3058\u308B">\u2715</button>
        </div>
        <div class="share-modal-desc">
          v54: \u6574\u5F62\u30B7\u30FC\u30C8 (\u7DE8\u96C6\u753B\u9762\u3068\u540C\u3058\u30C0\u30FC\u30AF+\u30B4\u30FC\u30EB\u30C9) \u3092 4 \u7A2E\u985E\u306E\u624B\u6BB5\u3067\u767A\u884C\u3067\u304D\u307E\u3059\u3002<br>
          \u30DC\u30BF\u30F3\u306F<b>\u30AF\u30EA\u30C3\u30AF\u3057\u305F\u6642\u3060\u3051</b>\u5B9F\u884C\u3055\u308C\u307E\u3059 \u2014 \u610F\u56F3\u305B\u305A\u30BF\u30D6\u304C\u958B\u304F\u3053\u3068\u306F\u3042\u308A\u307E\u305B\u3093\u3002
        </div>
        <div class="share-opt-list">
          <button class="share-opt is-recommended" data-act="tab">
            <span class="share-opt-icon">\u2460</span>
            <span class="share-opt-body">
              <span class="share-opt-title">\u65B0\u898F\u30BF\u30D6\u3067\u958B\u304F</span>
              <span class="share-opt-desc">Blob URL \u3092 <code>window.open</code>\u3002\u30DD\u30C3\u30D7\u30A2\u30C3\u30D7\u30D6\u30ED\u30C3\u30AF\u3084 sandboxed iframe \u3060\u3068\u5931\u6557\u3059\u308B\u3053\u3068\u304C\u3042\u308B\u3002</span>
              <span class="share-opt-status" data-status="tab"></span>
            </span>
          </button>
          <button class="share-opt" data-act="copyurl">
            <span class="share-opt-icon">\u2461</span>
            <span class="share-opt-body">
              <span class="share-opt-title">\u95B2\u89A7\u7528 URL \u3092\u30AF\u30EA\u30C3\u30D7\u30DC\u30FC\u30C9\u3078</span>
              <span class="share-opt-desc"><code>data:</code> URL \u3092\u767A\u884C\u3057\u3066\u30B3\u30D4\u30FC\u3002\u65B0\u898F\u30BF\u30D6\u306E\u30A2\u30C9\u30EC\u30B9\u30D0\u30FC\u306B\u8CBC\u4ED8\u3067\u958B\u3051\u308B\u3002</span>
              <span class="share-opt-status" data-status="copyurl"></span>
            </span>
          </button>
          <button class="share-opt is-recommended" data-act="publish">
            <span class="share-opt-icon">\u2463</span>
            <span class="share-opt-body">
              <span class="share-opt-title">\u95B2\u89A7\u7528URL\u3092\u767A\u884C\uFF08\u5916\u90E8\u516C\u958B\uFF09</span>
              <span class="share-opt-desc">\u30A2\u30AB\u30A6\u30F3\u30C8\u4E0D\u8981\u306EHTML\u30DB\u30B9\u30C8\u3078\u30A2\u30C3\u30D7\u30ED\u30FC\u30C9\u3002\u540C\u4E00\u5185\u5BB9\u306A\u3089\u767A\u884C\u6E08\u307F\u30EA\u30F3\u30AF\u3092\u518D\u5229\u7528\u3002\u5931\u6557\u6642\u306F\u6B21\u306E\u30DB\u30B9\u30C8\u3078\u9806\u306B\u5207\u66FF\u3002</span>
              <span class="share-opt-status" data-status="publish"></span>
            </span>
          </button>
          <button class="share-opt" data-act="download">
            <span class="share-opt-icon">\u2462</span>
            <span class="share-opt-body">
              <span class="share-opt-title">HTML \u30D5\u30A1\u30A4\u30EB\u3068\u3057\u3066\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9</span>
              <span class="share-opt-desc">${filename} \u540D\u3067\u4FDD\u5B58\u3002\u30AA\u30D5\u30E9\u30A4\u30F3\u3067\u3082\u898B\u8FD4\u305B\u308B\u3002\u6700\u3082\u78BA\u5B9F\u306A\u624B\u6BB5\u3002</span>
              <span class="share-opt-status" data-status="download"></span>
            </span>
          </button>
          <!-- v52 (I): \u300CHTML \u672C\u6587\u3092\u5168\u6587\u30B3\u30D4\u30FC\u300D\u306F\u7528\u9014\u3068\u98DF\u3044\u9055\u3046\u305F\u3081\u524A\u9664 -->
        </div>
        <div class="share-modal-foot">
          LBT ${window.LBT_VERSION || "v51"} \u2014 Shift+Escape \u3067\u3082\u9589\u3058\u3089\u308C\u307E\u3059
        </div>
      </div>
    </div>
  `;
    document.body.appendChild(root);
    const close = () => {
      root.remove();
      document.removeEventListener("keydown", onKey);
    };
    const onKey = (e) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    root.querySelectorAll("[data-close]").forEach((el) => {
      el.addEventListener("click", (e) => {
        if (e.target === el || e.currentTarget === el) close();
      });
    });
    const setStatus = (act, cls, msg) => {
      const el = root.querySelector(`[data-status="${act}"]`);
      if (!el) return;
      el.className = "share-opt-status " + (cls || "");
      el.textContent = msg || "";
    };
    const setDisabled = (act, on) => {
      const btn = root.querySelector(`[data-act="${act}"]`);
      if (btn) btn.disabled = !!on;
    };
    const actions = {
      async tab() {
        setStatus("tab", "is-progress", "\u8D77\u52D5\u4E2D\u2026");
        const blob = new Blob([html], { type: "text/html;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        let win = null;
        try {
          win = window.open(url, "_blank", "noopener");
        } catch (e) {
        }
        await new Promise((r) => setTimeout(r, 120));
        if (win && !win.closed) {
          setTimeout(() => {
            try {
              URL.revokeObjectURL(url);
            } catch (e) {
            }
          }, 6e4);
          setStatus("tab", "is-ok", "\u2713 \u65B0\u898F\u30BF\u30D6\u3067\u958B\u304D\u307E\u3057\u305F");
        } else {
          try {
            URL.revokeObjectURL(url);
          } catch (e) {
          }
          setStatus("tab", "is-err", "\u2717 \u30DD\u30C3\u30D7\u30A2\u30C3\u30D7\u304C\u30D6\u30ED\u30C3\u30AF\u3055\u308C\u307E\u3057\u305F\u3002\u2461\u301C\u2463\u3092\u8A66\u3057\u3066\u304F\u3060\u3055\u3044");
        }
      },
      async copyurl() {
        setStatus("copyurl", "is-progress", "\u751F\u6210\u4E2D\u2026");
        try {
          const b64 = btoa(unescape(encodeURIComponent(html)));
          const dataUrl = `data:text/html;charset=utf-8;base64,${b64}`;
          if (!navigator.clipboard || !navigator.clipboard.writeText) {
            throw new Error("clipboard API unavailable");
          }
          await navigator.clipboard.writeText(dataUrl);
          setStatus("copyurl", "is-ok", `\u2713 ${(dataUrl.length / 1024).toFixed(1)}KB \u306E data URL \u3092\u30B3\u30D4\u30FC`);
        } catch (e) {
          setStatus("copyurl", "is-err", "\u2717 \u30AF\u30EA\u30C3\u30D7\u30DC\u30FC\u30C9\u66F8\u8FBC\u5931\u6557\u3002\u2462\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u3092\u63A8\u5968");
        }
      },
      async download() {
        setStatus("download", "is-progress", "\u751F\u6210\u4E2D\u2026");
        try {
          const blob = new Blob([html], { type: "text/html;charset=utf-8" });
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => {
            try {
              URL.revokeObjectURL(a.href);
            } catch (e) {
            }
          }, 1e3);
          setStatus("download", "is-ok", `\u2713 ${filename} \u3092\u4FDD\u5B58`);
        } catch (e) {
          setStatus("download", "is-err", "\u2717 \u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u5931\u6557");
        }
      },
      async publish() {
        setStatus("publish", "is-progress", "\u516C\u958B\u4E2D\u2026\uFF08\u6700\u901F\u30DB\u30B9\u30C8\u3092\u81EA\u52D5\u9078\u629E\uFF09");
        try {
          const r = await publishShareSheetOnline(html);
          const tag = r.cached ? "\u65E2\u5B58\u30EA\u30F3\u30AF\uFF08\u540C\u4E00\u5185\u5BB9\uFF09" : r.host;
          try {
            await navigator.clipboard.writeText(r.url);
          } catch (e) {
          }
          setStatus("publish", "is-ok", "\u2713 " + tag + ": " + r.url + " \uFF08\u30B3\u30D4\u30FC\u6E08\uFF09");
        } catch (e) {
          setStatus("publish", "is-err", "\u2717 " + (e.message || "\u516C\u958B\u5931\u6557") + " \u2014 \u2460\u2462\u3092\u304A\u8A66\u3057\u304F\u3060\u3055\u3044");
        }
      }
      // v52 (I): copyhtml アクションは廃止（用途と食い違うため）
    };
    root.querySelectorAll("[data-act]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const act = btn.dataset.act;
        if (actions[act]) {
          setDisabled(act, true);
          try {
            await actions[act]();
          } finally {
            setDisabled(act, false);
          }
        }
      });
    });
  }
  function downloadShareSheet(state) {
    const html = buildShareSheetHTML(state);
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${state.charName || "character"}_sheet.html`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1e3);
  }
  window.LBT_gen = {
    buildMemo,
    buildPalette,
    buildCcfoliaJSON,
    buildShareSheetHTML,
    openShareSheet,
    downloadShareSheet,
    resolveFormulas,
    detectMTMods,
    DEFAULT_STATUS_LIST,
    DEF_FMLS
  };
})();
