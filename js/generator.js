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
const TIMING_MARKER = "(?:\u4F7F\u7528\u6642|\u6226\u95D8\u958B\u59CB\u6642|\u30DE\u30C3\u30C1\u958B\u59CB\u6642|\u30DE\u30C3\u30C1\u52DD\u5229\u6642|\u30DE\u30C3\u30C1\u6557\u5317\u6642|\u30DE\u30C3\u30C1\u7D42\u4E86\u6642|\u653B\u6483\u6642|\u653B\u6483\u5F8C|\u88AB\u30C0\u30E1\u30FC\u30B8\u6642|\u6575\u8A0E\u4F10\u6642|\u7684\u4E2D\u6642|\u30AF\u30EA\u30C6\u30A3\u30AB\u30EB\u7684\u4E2D\u6642|\u4E00\u65B9\u653B\u6483\u6642|R\u958B\u59CB\u6642|R\u7D42\u4E86\u6642|\\d+R|R\\d+\u958B\u59CB\u6642|R\\d+\u7D42\u4E86\u6642|\u821E\u53F0\u958B\u59CB\u6642|\u6B7B\u4EA1\u6642|\u518D\u88C5\u586B\u6642|\u5224\u5B9A\u6642|\u56DE\u907F\u6210\u529F\u6642|\u56DE\u907F\u5931\u6557\u6642|\u9632\u5FA1\u6210\u529F\u6642|\u9632\u5FA1\u5931\u6557\u6642|\u30DE\u30C3\u30C1\u6642|\u30B3\u30B9\u30C8|\u30B3\u30B9\u30C8\uFF1A|\u30B3\u30B9\u30C8:)";
// 影響などのラウンド進行は、`1R：`だけでなく`1R効果`の簡略表記でも独立段落として扱う。
const ROUND_STAGE_MARKER = "\\d+R(?:[\uFF1A:]|(?=[^\\d\\s]))";
function splitEffectLines(text) {
  const normalized = normalizeMultiline(text);
  if (!normalized) return [];
  let lines = normalized.split("\n").map((l) => l.trim()).filter(Boolean);
  const re = new RegExp("(?<!^)(?:(?=" + TIMING_MARKER + "(?:\uFF1A|:))|(?=" + ROUND_STAGE_MARKER + "))", "g");
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
  const re = new RegExp("(?<!^)(?:(?=" + TIMING_MARKER + "(?:\uFF1A|:))|(?=" + ROUND_STAGE_MARKER + "))", "g");
  const out = [];
  // T21: 引用符「」『』の内側は意味的な段落区切りとみなさない。
  // 単なる "-「" や引用内のタイミング語で誤って改行しないよう、
  // 行を走査して引用深度が0の位置でのみ分割を許可する。
  const splitLineQuoted = (line) => {
    const parts = [];
    let buf = "";
    let depth = 0;
    let i = 0;
    const markerRe = new RegExp("^" + TIMING_MARKER + "(?:\uFF1A|:)");
    const roundMarkerRe = new RegExp("^" + ROUND_STAGE_MARKER);
    while (i < line.length) {
      const ch = line[i];
      if (ch === "\u300C" || ch === "\u300E") depth++;
      else if (ch === "\u300D" || ch === "\u300F") depth = Math.max(0, depth - 1);
      if (depth === 0 && buf.length > 0 && (markerRe.test(line.slice(i)) || roundMarkerRe.test(line.slice(i)))) {
        parts.push(buf);
        buf = "";
      }
      buf += ch;
      i++;
    }
    if (buf.trim()) parts.push(buf);
    return parts.map((s) => s.trim()).filter(Boolean);
  };
  for (const line of lines) {
    out.push(...splitLineQuoted(line));
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
  { name: "DT", expr: "{\u5171\u9CF4}+{\u5FCD\u8010}-{\u6B66\u88C5\u89E3\u9664}+{\u30B9\u30AD\u30EB\u5A01\u529B}+{\u5B88\u5099\u5A01\u529B}", builtin: true },
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
  /* 固有バフのスケーリング則を解析して MT/DM/DT へ自動注入する（汎用ロジック）。
     対象は uniqueBuffs（DB由来・手動追加の双方）の各バフについて、
     その desc（説明文）内のスケーリング記述を解析し、バフ名を変数として式へ注入する。
       - 「(このバフの)数値/Nだけダメージ量増加」  → DM += floor({バフ名}/N)
       - 「(このバフの)数値/Nだけマッチ威力」      → MT += floor({バフ名}/N)
       - 「数値がN(以上)?ならマッチ威力+M」        → MT += ({バフ名}>=N)*M
       - 「(このバフの)数値/Nだけ被ダメージ(量)増加」→ DT += floor({バフ名}/N)
     desc が空のバフは解析不能のためスキップ（パレットの変数としてのみ供給）。 */
  const _mtAdds = [];
  const _dmAdds = [];
  const _dtAdds = [];
  const _seenAdd = /* @__PURE__ */ new Set();
  const _pushAdd = (arr, key, frag) => { if (_seenAdd.has(key)) return; _seenAdd.add(key); arr.push(frag); };
  const _scanBuffDesc = (buffName, desc) => {
    if (!buffName || !desc) return;
    const nm = String(buffName).trim();
    const d = String(desc);
    if (!nm || nm.length < 2) return;
    const V = "{" + nm + "}";
    let m;
    // 「(の)数値?/Nだけダメージ量増加」
    const reDM = /(?:\u6570\u5024|\u6570)?[/\u00F7](\d{1,2})\u3060\u3051\u30C0\u30E1\u30FC\u30B8\u91CF\u5897\u52A0/g;
    while ((m = reDM.exec(d)) !== null) _pushAdd(_dmAdds, "dm:" + nm + "/" + m[1], `floor(${V}/${m[1]})`);
    // 「(の)数値?/Nだけマッチ威力」
    const reMTdiv = /(?:\u6570\u5024|\u6570)?[/\u00F7](\d{1,2})\u3060\u3051\u30DE\u30C3\u30C1\u5A01\u529B/g;
    while ((m = reMTdiv.exec(d)) !== null) _pushAdd(_mtAdds, "mtdiv:" + nm + "/" + m[1], `floor(${V}/${m[1]})`);
    // 「(の)数値?/Nだけ被ダメージ(量)増加」→ DT
    const reDT = /(?:\u6570\u5024|\u6570)?[/\u00F7](\d{1,2})\u3060\u3051\u88AB\u30C0\u30E1\u30FC\u30B8/g;
    while ((m = reDT.exec(d)) !== null) _pushAdd(_dtAdds, "dt:" + nm + "/" + m[1], `floor(${V}/${m[1]})`);
    // 「数値がN(以上)?ならマッチ威力+M」
    const reMTth = /(?:\u6570\u5024|\u6570)\u304C(\d{1,2})(\u4EE5\u4E0A)?(?:\u306A\u3089|\u306A\u308B)[\u3001,]?\u30DE\u30C3\u30C1\u5A01\u529B\+?(\d{1,2})/g;
    while ((m = reMTth.exec(d)) !== null) _pushAdd(_mtAdds, "mtth:" + nm + ">=" + m[1], `(${V}>=${m[1]})*${m[3]}`);
    // 「数値がN(以上)?ならダメージ量増加+M」
    const reDMth = /(?:\u6570\u5024|\u6570)\u304C(\d{1,2})(\u4EE5\u4E0A)?(?:\u306A\u3089|\u306A\u308B)[\u3001,]?\u30C0\u30E1\u30FC\u30B8\u91CF\u5897\u52A0\+?(\d{1,2})/g;
    while ((m = reDMth.exec(d)) !== null) _pushAdd(_dmAdds, "dmth:" + nm + ">=" + m[1], `(${V}>=${m[1]})*${m[3]}`);
  };
  (state.uniqueBuffs || []).forEach((b) => _scanBuffDesc(b && b.name, b && b.desc));
  if (_mtAdds.length || _dmAdds.length || _dtAdds.length) {
    out.forEach((o) => {
      if (o.name === "MT") _mtAdds.forEach((a) => { if (!o.expr.includes(a)) o.expr += "+" + a; });
      if (o.name === "DM") _dmAdds.forEach((a) => { if (!o.expr.includes(a)) o.expr += "+" + a; });
      if (o.name === "DT") _dtAdds.forEach((a) => { if (!o.expr.includes(a)) o.expr += "+" + a; });
    });
  }
  custom.forEach((f) => {
    const i = out.findIndex((o) => o.name === f.name);
    if (i >= 0) out[i] = { name: f.name, expr: f.expr, builtin: false };
    else out.push({ name: f.name, expr: f.expr, builtin: false });
  });
  return out;
}
// CCFOLIAのSAN検索をE.G.O本文が占有しないよう、パレット内のE.G.Oブロックだけ表記を分離する。
// 実データ、編集画面、メモ、CCFOLIAのSANステータスは変更しない。
function redactEgoSanFromPalette(text) {
  return String(text || "").replace(/SAN/gu, "精神力");
}
function buildPalette(state) {
  const p = state;
  const sanBase = p.san === "" || p.san == null ? 50 : parseInt(p.san, 10);
  const san = sanBase + computeEnhancementBonuses(p).san;
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
    p.deathSupport?.effect || "",
    ...(p.enhancements || []).map((e) => e.effect)
  ].join(" ");
  const hasVar = (kw) => allEffectText.includes(kw) || (p.uniqueBuffs || []).some((b) => b.name === kw && (b.place || "status") === "status") || (p.customStatuses || []).some((c) => c.label === kw && (c.place || "status") === "status");
  const hasTaunt = hasVar("\u6311\u767A\u5024");
  const hasBreath = hasVar("\u547C\u5438");
  const personaSync = getCurrentPersonaSyncState(p);
  const showSyncRankInOutput = p.shareOptions?.showSyncRankInOutput === true;
  if (showSyncRankInOutput && p.personaSrc && personaSync.syncRank) {
    L.push("───────────────");
    L.push("### ■ 人格情報");
    L.push(`人格：${formatPersonaDisplayName(p)}`);
    L.push(`同期ランク：${personaSync.syncRank}`);
    L.push("");
  }
  L.push("### \u25A0 \u5224\u5B9A\u30FB\u901F\u5EA6");
  L.push(`${speed}+{QB} \u3010\u901F\u5EA6\u3011\u5224\u5B9A`);
  /* 「捨てた枚数」は「ランダムなスキルをNつ捨てる」等の能動的な捨て機構を持つ人格のみ必要。
     固有名詞（捨てられた殺人鬼）や受動表現（捨てられたなら）での誤検出を防ぐ。 */
  const SUTE_ACTIVE = /(?:\u30E9\u30F3\u30C0\u30E0\u306A)?\u30B9\u30AD\u30EB\u3092[^\u3002\n]{0,8}?\u6368\u3066\u308B|\u6368\u3066\u305F\u30B9\u30AD\u30EB\u306E\u6570|\u6368\u3066\u305F\u679A\u6570/;
  const _suteDump = [p.pas.always, p.pas.effect, ...(p.skills || []).map((sk) => (sk.effect || "") + " " + (sk.dice || []).map((d) => d.effect || "").join(" "))].join(" ");
  const hasSute = SUTE_ACTIVE.test(_suteDump);
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
      const isAlways = /\u5E38\u6642|\u5E38\u99D0/.test(s.cond || "");
      const effBlk = buildLabeledBlock(isAlways ? "\u5E38\u6642\u52B9\u679C\uFF1A" : "\u52B9\u679C\uFF1A", s.effect);
      if (effBlk) parts.push(effBlk);
      L.push(parts.join("\\n"));
    });
    L.push("");
  }
  if (p.deathSupport && (p.deathSupport.name || p.deathSupport.effect)) {
    L.push("\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC");
    L.push("### \u25A0 \u6B7B\u4EA1\u5F8C\u5C02\u7528\u30B5\u30DD\u30FC\u30C8\u30D1\u30C3\u30B7\u30D6");
    const ds = p.deathSupport;
    const parts = [`\u30B5\u30DD\u30FC\u30C8\u30D1\u30C3\u30B7\u30D6\u540D ${ds.name || ""}`, `\u767A\u52D5\u6761\u4EF6\uFF1A${ds.cond || ""}`];
    const effBlk = buildLabeledBlock("\u52B9\u679C\uFF1A", ds.effect);
    if (effBlk) parts.push(effBlk);
    L.push(parts.join("\\n"));
    L.push("");
  }
  if ((p.enhancements || []).length) {
    L.push("───────────────");
    L.push("### ■ 特殊強化");
    p.enhancements.forEach((e) => {
      const effBlk = buildLabeledBlock("効果：", e.effect);
      L.push(effBlk ? `【${e.name}】\n${effBlk}` : `【${e.name}】`);
    });
    L.push("");
  }
  if ((p.uniqueBuffs || []).length) {
    L.push("\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC");
    L.push("### \u25A0 \u56FA\u6709\u30D0\u30D5\u30FB\u30B9\u30C6\u30FC\u30BF\u30B9");
    p.uniqueBuffs.forEach((b) => {
      if (!b.name) return;
      const parts = [`\u3010${b.name}\u3011\uFF08${b.type || "\u56FA\u6709\u30D0\u30D5"}\uFF09 \u521D\u671F${b.initial ?? 0}${b.max !== void 0 && b.max !== "" ? ` / \u6700\u5927${b.max}` : ""}`];
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
      const skDPlusVar = !hasPerDicePlus && auto.dPlus ? sk.dPlusLabel || `S${rn}d値` : null;
      const skDCntVar = !hasPerDiceCnt && auto.dCnt ? sk.dCntLabel || `S${rn}d数` : null;
      const headParts = [`戦術${rn}：${name}`, `${typ}${sin ? "：" + sin : ""}${aoe ? "　広域：" + aoe : ""}`];
      const effBlk = buildLabeledBlock("効果：", eff);
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
        const dPlusVar = d.dPlus ? d.dPlusLabel || `S${rn}-${did}d\u5024` : !hasPerDicePlus && skDPlusVar ? skDPlusVar : null;
        const dCntVar = d.dCnt ? d.dCntLabel || `S${rn}-${did}d\u6570` : !hasPerDiceCnt && skDCntVar ? skDCntVar : null;
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
  let egoPaletteStart = -1;
  if (egoEntries.length) {
    egoPaletteStart = L.length;
    L.push("\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC\u30FC");
    L.push("### \u25A0 E.G.O");
    egoEntries.forEach(([rank, e]) => {
      const kSk = e.kakusei || {};
      const sSk = e.shinshoku || {};
      const kLabel = kSk.kind === "影響" ? "覚醒影響" : "覚醒";
      const sLabel = sSk.kind === "影響" ? "侵蝕影響" : "侵蝕";
      const cost = sanitizeInline(e.resources || "");
      const nameBase = (e.name || "").replace(/^覚醒-|^侵蝕-/, "");
      if (kSk.effect || (kSk.dice || []).length) {
        // CCFOLIAではSANの操作候補を最優先で呼び出すため、E.G.OコストのSAN表記はパレットに出さない。
        // E.G.O名・資源コスト・効果・ダイスは残し、SANコストはE.G.O編集画面とメモで確認する。
        const kParts = [`\u3010\u899A\u9192\uFF5C${rank}\u3011${e.name || nameBase}`, cost ? `\u30B3\u30B9\u30C8\uFF1A${cost}` : ""];
        if (kSk.attr || kSk.sin || kSk.aoe) {
          kParts.push(`${kSk.attr || ""}${kSk.sin ? "\uFF1A" + kSk.sin : ""}${kSk.aoe ? "\u3000\u5E83\u57DF\uFF1A" + kSk.aoe : ""}`);
        }
        // PDF記述順: パッシブは覚醒効果より先に記載される
        if (e.passive_name) {
          const passBlk = buildLabeledBlock(`E.G.O\u30D1\u30C3\u30B7\u30D6\u3010${e.passive_name}\u3011\uFF1A`, e.passive_effect);
          if (passBlk) kParts.push(passBlk);
        }
        const kEff = buildLabeledBlock("\u899A\u9192\u52B9\u679C\uFF1A", kSk.effect);
        if (kEff) kParts.push(kEff);
        const kDisplayDice = (kSk.dice || []).map((d) => d.effect ? `${d.roll}\uFF1A${d.effect}` : d.roll).filter(Boolean);
        if (kDisplayDice.length) kParts.push(kDisplayDice.join("\\n"));
        L.push(redactEgoSanFromPalette(kParts.join("\\n")));
        (kSk.dice || []).forEach((d, di) => {
          if (!d.roll) return;
          const mahi = buildMahiFormula(d.roll, "", "", null, null);
          const suf = (kSk.dice || []).length > 1 ? String(di + 1) : "";
          L.push(`${mahi}+{MT} \u899A\u9192\uFF5C${nameBase}\uFF1A\u30DE\u30C3\u30C1${suf}`);
          L.push(`${mahi}+{DM} \u899A\u9192\uFF5C${nameBase}\uFF1A\u30C0\u30E1\u30FC\u30B8${suf}`);
        });
      }
      if (sSk.effect || (sSk.dice || []).length) {
        const sParts = [`\u3010\u4FB5\u8755\uFF5C${rank}\u3011${nameBase}`, cost ? `\u30B3\u30B9\u30C8\uFF1A${cost}` : ""];
        if (sSk.attr || sSk.sin || sSk.aoe) {
          sParts.push(`${sSk.attr || ""}${sSk.sin ? "\uFF1A" + sSk.sin : ""}${sSk.aoe ? "\u3000\u5E83\u57DF\uFF1A" + sSk.aoe : ""}`);
        }
        const sBlk = buildLabeledBlock("\u4FB5\u8755\u52B9\u679C\uFF1A", sSk.effect);
        if (sBlk) sParts.push(sBlk);
        const sDisplayDice = (sSk.dice || []).map((d) => d.effect ? `${d.roll}\uFF1A${d.effect}` : d.roll).filter(Boolean);
        if (sDisplayDice.length) sParts.push(sDisplayDice.join("\\n"));
        L.push(redactEgoSanFromPalette(sParts.join("\\n")));
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
  // E.G.O名とダイス実行ラベルを含め、E.G.Oブロック内にSAN文字列を残さない。
  if (egoPaletteStart >= 0) {
    for (let i = egoPaletteStart; i < L.length; i++) L[i] = redactEgoSanFromPalette(L[i]);
  }
  const fmls = resolveFormulas(state);
  fmls.forEach((f) => {
    L.push(`//${f.name}=${f.expr}`);
  });
  L.push("");
  const KW_LABELS = { "\u6307\u4EE4": "\u6307\u4EE4\u306E\u52A0\u8B77" };
  // 基本ルールPDFのバフ（303頁）→デバフ（306〜307頁）→中立バフ（310頁）の掲載順。
  // PDF外の弾丸と既存DBの指令は標準一覧の後ろへ安定して配置する。
  const KW_CANDIDATES = [...(window.LBT_PDF_KEYWORD_ORDER || ["\u30D1\u30EF\u30FC", "\u5FCD\u8010", "\u30AF\u30A4\u30C3\u30AF", "\u4FDD\u8B77", "\u5145\u96FB", "\u547C\u5438", "\u30C0\u30E1\u30FC\u30B8\u91CF\u5897\u52A0", "\u865A\u5F31", "\u6B66\u88C5\u89E3\u9664", "\u675F\u7E1B", "\u8106\u5F31", "\u706B\u50B7", "\u6C88\u6F5C", "\u51FA\u8840", "\u6050\u614C", "\u7834\u88C2", "\u632F\u52D5", "\u30C0\u30E1\u30FC\u30B8\u91CF\u6E1B\u5C11", "\u6BD2", "\u9EBB\u75FA", "\u30D0\u30EA\u30A2", "\u5F3E\u4E38"]), "\u6307\u4EE4"];
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
  const outputKeywordOrder = new Map(KW_CANDIDATES.map((keyword, index) => [KW_LABELS[keyword] || keyword, index]));
  const orderedKeywordLabels = [...kwSet].sort((a, b) => {
    const ia = outputKeywordOrder.has(a) ? outputKeywordOrder.get(a) : Number.MAX_SAFE_INTEGER;
    const ib = outputKeywordOrder.has(b) ? outputKeywordOrder.get(b) : Number.MAX_SAFE_INTEGER;
    return ia !== ib ? ia - ib : a.localeCompare(b, "ja");
  });
  const autoCmds = [];
  orderedKeywordLabels.forEach((lbl) => {
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
    L.push("───────────────");
    L.push("### \u25A0 \u8FFD\u52A0\u30B3\u30DE\u30F3\u30C9");
    normalizeMultiline(manualCmd).split("\n").forEach((l) => L.push(l));
  }
  // 標準出力では所持品を必ず最終カテゴリへ置く。プレビューで明示的に手動順を設定済みの場合は、
  // ui.previewSectionOrder が見出しを保持しているため、その順序が優先される。
  const paletteItems = getOwnedItemEntries(p).filter(({ entry }) => entry.palette !== false);
  if (paletteItems.length) {
    L.push("───────────────");
    L.push("### ■ 所持品");
    paletteItems.forEach(({ entry, item }) => {
      L.push(`【所持品】${item.name} ×${entry.quantity}`);
      const itemEffect = buildLabeledBlock("効果：", item.palette || item.effect);
      if (itemEffect) L.push(itemEffect);
      L.push("");
    });
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
function getCurrentPersonaSyncState(state) {
  const entry = (state?.roster?.personas || []).find((persona) => persona.mode === state?.personaMode && String(persona.no) === String(state?.personaNo));
  const rawSyncRank = String(entry?.syncRank || "");
  return { syncRank: ["0", "00", "000"].includes(rawSyncRank) ? rawSyncRank : null, syncMax: entry?.syncMax === true };
}
function formatPersonaDisplayName(state) {
  const name = String(state?.personaSrc?.name || "");
  return getCurrentPersonaSyncState(state).syncMax && !/\s*\[MAX\]\s*$/i.test(name) ? `${name} [MAX]` : name;
}
function getOwnedItemEntries(state) {
  const records = [
    ...(Array.isArray(window.DB?.items) ? window.DB.items : []),
    ...(Array.isArray(state?.customItems) ? state.customItems : [])
  ];
  const byId = new Map(records.map((item) => [String(item.id), item]));
  return (state?.inventory || []).map((entry) => ({ entry, item: byId.get(String(entry?.itemId)) })).filter(({ item }) => !!item);
}
function buildMemo(state) {
  const p = state;
  const L = [];
  L.push(`\u3010PC\u3011${p.charName || "\u30AD\u30E3\u30E9\u30AF\u30BF\u30FC"}${p.plName ? `\u3000\u3010PL\u3011${p.plName}` : ""}`);
  L.push("");
  L.push("\u3010\u30B9\u30C6\u30FC\u30BF\u30B9\u3011");
  if (p.personaSrc) L.push(`\u4EBA\u683C\uFF1A${formatPersonaDisplayName(p)}`);
  if (p.shareOptions?.showSyncRankInOutput === true) {
    const personaSync = getCurrentPersonaSyncState(p);
    if (p.personaSrc && personaSync.syncRank) L.push(`\u540C\u671F\u30E9\u30F3\u30AF\uFF1A${personaSync.syncRank}`);
  }
  const _eb = computeEnhancementBonuses(p);
  const _hpV = p.hp === "" || p.hp == null ? "?" : String((parseInt(p.hp, 10) || 0) + _eb.hp);
  const _sanV = p.san === "" || p.san == null ? "?" : String((parseInt(p.san, 10) || 0) + _eb.san);
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
      const isAlways = /\u5E38\u6642|\u5E38\u99D0/.test(s.cond || "");
      if (s.effect) s.effect.split("\n").filter(Boolean).forEach((l, j) => L.push(`\u3000\u3000${j === 0 ? (isAlways ? "\u5E38\u6642\u52B9\u679C\uFF1A" : "\u52B9\u679C\uFF1A") : ""}${l.trim()}`));
    });
    L.push("");
  }
  if (p.deathSupport && (p.deathSupport.name || p.deathSupport.effect)) {
    L.push("\u25A0 \u6B7B\u4EA1\u5F8C\u5C02\u7528\u30B5\u30DD\u30FC\u30C8\u30D1\u30C3\u30B7\u30D6");
    const ds = p.deathSupport;
    L.push(`\u3000${ds.name || ""}\uFF08${ds.cond || ""}\uFF09  LP${ds.lp || ""}`);
    if (ds.effect) ds.effect.split("\n").filter(Boolean).forEach((l, j) => L.push(`\u3000\u3000${j === 0 ? "\u52B9\u679C\uFF1A" : ""}${l.trim()}`));
    L.push("");
  }
  if ((p.uniqueBuffs || []).length) {
    L.push("\u25A0 \u56FA\u6709\u30D0\u30D5\u30FB\u30B9\u30C6\u30FC\u30BF\u30B9");
    p.uniqueBuffs.forEach((b) => {
      L.push(`\u3000\u30FB${b.name}\uFF08${b.type || "\u56FA\u6709\u30D0\u30D5"}\u3001\u521D\u671F${b.initial ?? 0}${b.max !== void 0 && b.max !== "" ? `\u3001\u6700\u5927${b.max}` : ""}\uFF09${b.desc ? `\uFF1A${b.desc}` : ""}`);
    });
    L.push("");
  }
  if ((p.enhancements || []).length) {
    L.push("■ 特殊強化");
    p.enhancements.forEach((e) => L.push(`　・${e.name}（欠片${e.shards || "-"}）：${e.effect || ""}`));
    L.push("");
  }
  const egoEntries = Object.entries(p.egoSlots || {}).filter(([, v]) => v);
  if (egoEntries.length) {
    L.push("\u25A0 \u88C5\u5099E.G.O");
    egoEntries.forEach(([rank, e]) => {
      // T17: E.G.O名称は「：」を含むため「ランク：名称」表記は使わず、
      // 【ランク】『名称』の括弧構造でメタデータと名称を分離する（名称文字列は不変）。
      const parts = [`\u3010${rank}\u3011\u300E${e.name}\u300F`];
      if (e.resources) parts.push(e.resources);
      if (e.san_cost) parts.push(`SAN-${e.san_cost}`);
      L.push(`\u3000${parts.join("\u3000")}`);
    });
    L.push("");
  }
  const memoItems = getOwnedItemEntries(p).filter(({ entry }) => entry.memo !== false);
  if (memoItems.length) {
    L.push("■ 所持品");
    memoItems.forEach(({ entry, item }) => L.push(`　・${item.name} ×${entry.quantity}${item.effect ? `：${item.effect}` : ""}`));
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

// T15: D値/D数変動で生成される変数ラベルを buildPalette と同一規則で収集する。
// UI表示とJSON出力の単一情報源とし、解釈の二重化を防ぐ。
function collectSkillDiceVars(state) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  (state.skills || []).forEach((sk, skIdx) => {
    const rnk = sk.rank || `\u30B9\u30AD\u30EB${skIdx}`;
    const rn = String(rnk).replace("\u30B9\u30AD\u30EB", "") || String(skIdx);
    const auto = detectSkillDiceVariance(sk);
    const hasPerDicePlus = (sk.dice || []).some((d) => d.dPlus);
    const hasPerDiceCnt = (sk.dice || []).some((d) => d.dCnt);
    const skDPlusVar = !hasPerDicePlus && auto.dPlus ? sk.dPlusLabel || `S${rn}d\u5024` : null;
    const skDCntVar = !hasPerDiceCnt && auto.dCnt ? sk.dCntLabel || `S${rn}d\u6570` : null;
    if (skDPlusVar && !seen.has(skDPlusVar)) { seen.add(skDPlusVar); out.push({ label: skDPlusVar, place: sk.dVarPlace || "status" }); }
    if (skDCntVar && !seen.has(skDCntVar)) { seen.add(skDCntVar); out.push({ label: skDCntVar, place: sk.dVarPlace || "status" }); }
    (sk.dice || []).forEach((d, did0) => {
      const did = did0 + 1;
      if (d.dPlus) {
        const l = d.dPlusLabel || `S${rn}-${did}d\u5024`;
        if (!seen.has(l)) { seen.add(l); out.push({ label: l, place: sk.dVarPlace || "status" }); }
      }
      if (d.dCnt) {
        const l = d.dCntLabel || `S${rn}-${did}d\u6570`;
        if (!seen.has(l)) { seen.add(l); out.push({ label: l, place: sk.dVarPlace || "status" }); }
      }
    });
  });
  return out;
}
window.LBT_collectSkillDiceVars = collectSkillDiceVars;

// T18/T19: テキストを見出しセクションへ分割する（LivePreview と共有する単一情報源）。
// メモは「■ X」「【X】」、パレットは「### ■ X」見出しを区切りとする。
function splitOutputSections(text) {
  if (!text) return [];
  const lines = String(text).split("\n");
  const sections = [];
  let cur = null;
  const SEP_RE = /^\u30FC{5,}$/;
  const HEAD_RE = /^(?:###\s*\u25A0?\s*(.+?)\s*$|\u3010(.+?)\u3011\s*$|\u25A0\s*(.+?)\s*$)/;
  for (const raw of lines) {
    if (SEP_RE.test(raw.trim())) continue;
    const m = raw.match(HEAD_RE);
    if (m) {
      if (cur) sections.push(cur);
      cur = { title: m[1] || m[2] || m[3] || "", body: [] };
      continue;
    }
    if (!cur) cur = { title: "", body: [] };
    cur.body.push(raw);
  }
  if (cur) sections.push(cur);
  return sections.filter((s) => s.title || s.body.some((l) => l.trim()));
}
// 除外タイトル集合に基づきセクションを落として再結合する。
function filterOutputSections(text, excluded) {
  if (!excluded || !Object.keys(excluded).length) return text;
  const secs = splitOutputSections(text);
  return secs.filter((s) => !s.title || !excluded[s.title])
    .map((s) => (s.title ? "\u25A0 " + s.title + "\n" : "") + s.body.join("\n"))
    .join("\n");
}
window.LBT_splitOutputSections = splitOutputSections;
function buildCcfoliaJSON(state) {
  const p = state;
  const charName = p.charName || "\u30AD\u30E3\u30E9\u30AF\u30BF\u30FC";
  const plName = p.plName || "";
  const color = p.color || "#c8a84b";
  const initiative = Number.isFinite(Number(p.initiative)) ? Number(p.initiative) : 0;
  const _enhBonus = computeEnhancementBonuses(p);
  const hp = (p.hp === "" || p.hp == null ? 100 : parseInt(p.hp, 10)) + _enhBonus.hp;
  const san = (p.san === "" || p.san == null ? 50 : parseInt(p.san, 10)) + _enhBonus.san;
  const morale = p.moraleLine || String(Math.floor(san * 0.25));
  const { atkModLabel, hasVigor, hasDefMod } = detectMTMods(state);
  const normalizeLabel = (label) => window.LBT_normalizeStatusLabel ? window.LBT_normalizeStatusLabel(label) : String(label || "").trim();
  // 設定画面とJSON出力は必ず同じ根拠集合を使う。バリアだけの特例は持たない。
  const managedEntries = window.LBT_getStateSelfManagedStatusEntries ? window.LBT_getStateSelfManagedStatusEntries(p) : [];
  const managedByLabel = new Map(managedEntries.map((entry) => [normalizeLabel(entry.label), entry]));
  const baseList = p.defaultStatuses || DEFAULT_STATUS_LIST;
  const status = [];
  const statusByLabel = new Map();
  baseList.forEach((f) => {
    const label = normalizeLabel(f.label);
    const isAutoManaged = f.source === "self_status" || f.auto === true;
    if (!label || (isAutoManaged && !managedByLabel.has(label)) || (label === "バリア" && !managedByLabel.has("バリア")) || statusByLabel.has(label)) return;
    if (label === "HP") { status.push({ label, value: hp, max: hp }); statusByLabel.set(label, status[status.length - 1]); return; }
    if (label === "SAN") { status.push({ label, value: san, max: san }); statusByLabel.set(label, status[status.length - 1]); return; }
    let max = f.max;
    if (max === "hp") max = hp;
    if (max === "san") max = san;
    if (typeof max === "string") max = parseInt(max) || 10;
    const item = { label, value: f.initial ?? 0, max };
    status.push(item);
    statusByLabel.set(label, item);
  });
  const DEF_ST = new Set(statusByLabel.keys());
  // サポートパッシブ・強化由来の補正（打撃/斬撃/貫通補正、守備威力、闘志）は
  // CCFOLIAでは数値を管理するSTではなく、代入式から参照するラベルとしてのみ出力する。
  // 自動検出: 人格が自分で管理する状態異常（紅炎殺の火傷など）をデフォルトステータスへ常に統合する。
  // defaultStatuses未設定（工場出荷状態）でも JSON 出力へ反映されるよう、ここで最終統合する。
  // DB指定または自己付与の文面根拠がある状態だけを最終統合する。
  // defaultStatuses未設定でも、設定画面と同じ上限値でJSONへ出力される。
  managedEntries.forEach((entry) => {
    const label = normalizeLabel(entry.label);
    if (!label || DEF_ST.has(label)) return;
    /* 初期付与（舞台開始時にN得る／弾丸＝bullets等）が検出されている場合は初期値を反映する */
    status.push({ label, value: entry.initial ?? 0, max: entry.max ?? 99 });
    statusByLabel.set(label, status[status.length - 1]);
    DEF_ST.add(label);
  });
  const UB_ST = /* @__PURE__ */ new Set();
  (p.uniqueBuffs || []).forEach((b) => {
    const label = normalizeLabel(b.name);
    /* 中立バフでも数値管理が必要なもの（max>0、またはdescに数値参照がある）はstatusへ反映する。
       従来の一律除外では「12区産燃料」「過熱燃料」等の資源管理バフが落ちていた。 */
    const _ubMax = parseInt(b.max, 10);
    const _ubHasNumeric = (!isNaN(_ubMax) && _ubMax > 0) || /(?:\u6570\u5024|\u6570)(?:[/\u00F7]|\u304C\d|\u3092\d*\u6D88\u8CBB)/.test(b.desc || "");
    if (!label || (b.place || "status") !== "status") return;
    if (b.type === "中立バフ" && !_ubHasNumeric) return;
    const canonical = statusByLabel.get(label);
    // 固有値は同名デフォルト項目へ統合し、JSON側で二重登録しない。
    if (canonical) {
      if (b.initial !== void 0 && b.initial !== "") canonical.value = b.initial;
      if (b.max !== void 0 && b.max !== "") canonical.max = b.max;
      return;
    }
    if (UB_ST.has(label)) return;
    UB_ST.add(label);
    const item = { label, value: b.initial ?? 0, max: b.max ?? 10 };
    status.push(item);
    statusByLabel.set(label, item);
  });
  (p.customStatuses || []).forEach((c) => {
    const label = normalizeLabel(c.label);
    if (!label || (c.place || "status") !== "status") return;
    if (statusByLabel.has(label) || UB_ST.has(label)) return;
    const item = { label, value: c.initial ?? 0, max: c.max ?? 10 };
    status.push(item);
    statusByLabel.set(label, item);
  });
  // T15: D値/D数の可変変数を JSON へ伝播（place=status → ST、place=params → ラベル、none → 出力しない）
  collectSkillDiceVars(p).forEach((v) => {
    if (!v.label || v.place === "none") return;
    if (v.place !== "status") return;
    const label = normalizeLabel(v.label);
    if (!label || statusByLabel.has(label) || UB_ST.has(label)) return;
    UB_ST.add(label);
    const item = { label, value: 0, max: 99 };
    status.push(item);
    statusByLabel.set(label, item);
  });
  // V05: 全体ソート整形 — ui.statusOrder（ラベル配列）があれば status をその順に並べ替える。
  // 指定のない項目は末尾に既存順で残す（デフォルト→固有→カスタム→変数）。
  const _stOrder = (p.ui && p.ui.statusOrder) || (state.ui && state.ui.statusOrder) || null;
  if (Array.isArray(_stOrder) && _stOrder.length) {
    const _rank = new Map(_stOrder.map((lb, i) => [lb, i]));
    status.sort((a, b) => {
      const ra = _rank.has(a.label) ? _rank.get(a.label) : 1e9;
      const rb = _rank.has(b.label) ? _rank.get(b.label) : 1e9;
      return ra - rb;
    });
  }
  const params = [{ label: "\u58EB\u6C17\u4F4E\u4E0B\u30E9\u30A4\u30F3", value: morale }];
  if (atkModLabel) params.push({ label: atkModLabel, value: 1 });
  if (hasVigor) params.push({ label: "\u95D8\u5FD7", value: 1 });
  if (hasDefMod) params.push({ label: "\u5B88\u5099\u5A01\u529B", value: 1 });
  (p.uniqueBuffs || []).forEach((b) => {
    const label = normalizeLabel(b.name);
    if (!label || (b.place || "status") !== "params") return;
    params.push({ label, value: "" });
  });
  (p.customStatuses || []).forEach((c) => {
    const label = normalizeLabel(c.label);
    if (!label || (c.place || "status") !== "params") return;
    params.push({ label, value: c.initial ?? "" });
  });
  collectSkillDiceVars(p).forEach((v) => {
    if (!v.label || v.place !== "params") return;
    if (params.some((x) => x.label === v.label)) return;
    params.push({ label: v.label, value: "" });
  });
  // T18/T19: プレビューの項目別チェック（outputExclude）を JSON の memo/commands へ直接反映する。
  // 「表示＝出力」と混同しないよう、除外された項目は JSON からのみ除く。
  const excl = p.outputExclude || {};
  const commands = filterOutputSections(buildPalette(state), excl.palette);
  const memo = filterOutputSections(buildMemo(state), excl.memo);
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
      initiative,
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
  const personaSync = getCurrentPersonaSyncState(p);
  const personaName = formatPersonaDisplayName(p);
  const showSyncRank = p.shareOptions?.showSyncRank !== false;
  const esc = (s) => String(s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  // 外部HTMLホストへ発行したページは、Discord等のクローラーが実行前のheadだけを読む。
  // そのため、ページごとに確定した文言をここでOGPタグへ埋め込む。
  const clipShareMeta = (text, max = 56) => {
    const chars = Array.from(String(text || "").trim());
    return chars.length > max ? `${chars.slice(0, max - 1).join("")}…` : chars.join("");
  };
  const sharedPersonaName = p.personaSrc ? clipShareMeta(personaName) : "";
  const sharedPcName = clipShareMeta(p.charName || "PC", 36);
  const shareEnhancements = computeEnhancementBonuses(p);
  const shareHp = p.hp === "" || p.hp == null ? "—" : String((parseInt(p.hp, 10) || 0) + shareEnhancements.hp);
  const shareSan = p.san === "" || p.san == null ? "—" : String((parseInt(p.san, 10) || 0) + shareEnhancements.san);
  const syncLabel = p.personaSrc && showSyncRank && personaSync.syncRank ? `・同期${personaSync.syncRank}${personaSync.syncMax ? " MAX" : ""}` : "";
  // 人格データがある共有では、Discordの小さなタイトル枠で最初に人格名を読めることを最優先する。
  const shareTitle = sharedPersonaName ? `【人格】${sharedPersonaName}｜LBT` : `${sharedPcName}｜LIMBUS BUILD TERMINAL キャラクターシート`;
  const shareDescription = sharedPersonaName
    ? `共有人格プリセット：${sharedPersonaName}${syncLabel}。PC ${sharedPcName} / HP ${shareHp} / SAN ${shareSan} / 速度 ${p.speed || "—"}。CCFOLIA用キャラクターシート`
    : `LIMBUS BUILD TERMINALで作成されたキャラクターシート。HP ${shareHp} / SAN ${shareSan} / 速度 ${p.speed || "—"}。CCFOLIA用TRPGキャラクターシート`;
  // Base infoで設定した共有画像は自己完結HTMLでは直接OGPメタにも使える。
  // 静的share.htmlのDiscordカードはサーバー側動的headが必要なため、既定カードを維持する。
  const embeddedShareImage = /^data:image\/(webp|jpeg);base64,[A-Za-z0-9+/]+=*$/.test(String(p.shareImageData || "")) && String(p.shareImageData).length <= 48000 ? String(p.shareImageData) : "";
  const shareImage = embeddedShareImage || "https://lbtstudio.github.io/LIMBUS_BUILD_TERMINAL/assets/lbt-share-card.png";
  const shareImageType = embeddedShareImage.startsWith("data:image/webp") ? "image/webp" : "image/png";
  const shareVisualHTML = embeddedShareImage ? `<figure class="share-visual"><img src="${embeddedShareImage}" alt="${esc(p.charName || "共有シート画像")}"><figcaption>SHARE IMAGE / 共有シート画像</figcaption></figure>` : "";
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
  const tacticalScopeBadges = (sk) => {
    const source = `${sk.name || ""}\n${sk.effect || ""}\n${sk.type || ""}`;
    const isBarrage = /広域乱射|乱射/.test(source);
    const isArea = Boolean(sk.aoe) || Number(sk.aoeCount || 0) > 1 || /広域|対象\s*\d+\s*体/.test(source);
    return `<span class="scope-tag ${isArea ? "scope-area" : "scope-single"}">${isArea ? "広域" : "通常"}</span>${isBarrage ? '<span class="scope-tag scope-barrage">乱射</span>' : ""}`;
  };
  const skillsHTML = p.skills.length ? `
    <section class="sec"><h2>TACTICAL SKILLS / \u6226\u8853\u30B9\u30AD\u30EB</h2>
      <div class="grid-skills">
        ${p.skills.map((sk) => `
          <article class="skl" data-sin="${esc(sk.sin)}">
            <div class="skl-h">
              <span class="skl-rank">${esc(sk.rank || "")}</span>
              <span class="skl-name">${esc(sk.name || "")}</span>
            </div>
            <div class="skl-meta">${sk.type ? `<span class="attr-tag">${esc(sk.type)}</span>` : ""}${sk.sin ? `<b class="sin-tag" data-sin="${esc(sk.sin)}">${esc(sk.sin)}</b>` : ""}${tacticalScopeBadges(sk)}${sk.aoe ? `<span class="aoe-tag">${esc(formatAoe(sk.aoe, sk.aoeCount))}</span>` : ""}</div>
            ${sk.effect ? `<div class="skl-e">${fmt(sk.effect)}</div>` : ""}
            ${(sk.dice || []).length ? `<div class="dice-title">DICE / \u30C0\u30A4\u30B9</div><div class="dice-block">${diceHTML(sk.dice)}</div>` : ""}
          </article>
        `).join("")}
      </div>
    </section>` : "";
  const joinedEffectHTML = (always, effect) => {
    const parts = [];
    if (always) parts.push(`<b class="eff-label">常時:</b> ${fmt(always)}`);
    if (effect) parts.push(`<b class="eff-label">効果:</b> ${fmt(effect)}`);
    return parts.length ? `<div class="eff eff-joined">${parts.join('<span class="eff-sep"> / </span>')}</div>` : "";
  };
  const deathSpp = p.deathSupport && (p.deathSupport.name || p.deathSupport.effect) ? `
        <div class="spp is-death">
          <div class="spp-h"><b>${esc(p.deathSupport.name)}</b><span class="cond death">\u6B7B\u4EA1\u5F8C\u5C02\u7528</span>${p.deathSupport.lp ? `<span class="cond lp">LP${esc(p.deathSupport.lp)}</span>` : ""}${p.deathSupport.cond ? `<span class="cond">${esc(p.deathSupport.cond)}</span>` : ""}</div>
          ${joinedEffectHTML(p.deathSupport.always || p.deathSupport.always_effect, p.deathSupport.effect)}
        </div>` : "";
  const supportHTML = p.supports.length || deathSpp ? `
    <section class="sec"><details class="fold"><summary><h2>SUPPORT PASSIVES / \u30B5\u30DD\u30FC\u30C8\u30D1\u30C3\u30B7\u30D6</h2></summary>
      ${p.supports.map((s) => `
        <div class="spp">
          <div class="spp-h"><b>${esc(s.name)}</b>${s.lp ? `<span class="cond lp">LP${esc(s.lp)}</span>` : ""}${s.cond ? `<span class="cond">${esc(s.cond)}</span>` : ""}</div>
          ${joinedEffectHTML(s.always || s.always_effect, s.effect)}
        </div>
      `).join("")}
      ${deathSpp}
    </details></section>` : "";
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
    <section class="sec"><details class="fold"><summary><h2>E.G.O EQUIPMENT / E.G.O \u88C5\u5099</h2></summary>
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
    </details></section>` : "";
  const _shareAuto = (window.LBT_getStateSelfManagedStatusEntries ? window.LBT_getStateSelfManagedStatusEntries(p) : [])
    .map((entry) => entry.label)
    .filter((kw) => !(p.uniqueBuffs || []).some((u) => (u.name || "") === kw) && !(p.customStatuses || []).some((c) => (c.label || "") === kw));
  const uniqueHTML = ((p.uniqueBuffs || []).length || _shareAuto.length) ? `
    <section class="sec"><h2>UNIQUE / \u56FA\u6709\u30D0\u30D5\u30FB\u30B9\u30C6\u30FC\u30BF\u30B9</h2>
      <div class="panel">${p.uniqueBuffs.map((u) => `
        <div class="share-unique">
          <div class="u-head">
            <b>${esc(u.name)}</b>
            <span class="u-type u-${esc(u.type || "\u56FA\u6709\u30D0\u30D5")}">${esc(u.type || "\u56FA\u6709\u30D0\u30D5")}</span>
            <span class="u-val">\u521D\u671F ${esc(u.initial ?? 0)}</span>
            ${u.max !== void 0 && u.max !== "" ? `<span class="u-val">\u6700\u5927 ${esc(u.max)}</span>` : ""}
          </div>
          ${u.desc ? `<div class="eff">${nl(u.desc)}</div>` : ""}
        </div>`).join("")}
        ${_shareAuto.map((kw) => `
        <div class="share-unique">
          <div class="u-head">
            <b>${esc(kw)}</b>
            <span class="u-type">\u81EA\u52D5\u691C\u51FA</span>
          </div>
          <div class="eff">\u4EBA\u683C\u306E\u52B9\u679C\u30C6\u30AD\u30B9\u30C8\u304B\u3089\u691C\u51FA\u3055\u308C\u305F\u81EA\u5DF1\u7BA1\u7406\u30B9\u30C6\u30FC\u30BF\u30B9\u3002JSON\u51FA\u529B\u306E\u30B9\u30C6\u30FC\u30BF\u30B9\u306B\u3082\u542B\u307E\u308C\u307E\u3059\u3002</div>
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
  const ownedItems = getOwnedItemEntries(p);
  const inventoryHTML = ownedItems.length ? `
    <section class="sec"><h2>INVENTORY / \u6240\u6301\u30A2\u30A4\u30C6\u30E0 <span class="section-count">${ownedItems.length}\u7A2E</span></h2>
      <div class="panel share-inventory">
        ${ownedItems.map(({ entry, item }) => `<article class="share-item">
          <div class="share-item-h"><b>${esc(item.name)}</b><span class="item-count">\xD7${esc(entry.quantity ?? 1)}</span>${item.category ? `<span class="item-category">${esc(item.category)}</span>` : ""}</div>
          ${item.effect ? `<div class="eff">${nl(item.effect)}</div>` : ""}
        </article>`).join("")}
      </div>
    </section>` : "";
  const specialEnhancementNames = new Set((window.DB?.special_enhancements || []).map((entry) => entry.name));
  const enhHTML = (p.enhancements || []).length ? `
    <section class="sec"><h2>ENHANCEMENTS / \u5F37\u5316</h2>
      ${p.enhancements.map((e) => specialEnhancementNames.has(e.name) ? `<details class="spp special-enhancement-fold">
        <summary class="spp-h"><b>${esc(e.name)}</b><span class="cond">\u7279\u6B8A\u5F37\u5316</span>${e.shards ? `<span class="cond">\u6B20\u7247${esc(e.shards)}</span>` : ""}</summary>
        <div class="eff">${nl(e.effect)}</div>
      </details>` : `<div class="spp"><div class="spp-h"><b>${esc(e.name)}</b><span class="cond">\u6B20\u7247${esc(e.shards)}</span></div><div class="eff">${nl(e.effect)}</div></div>`).join("")}
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
	<title>${esc(shareTitle)}</title>
	<meta name="description" content="${esc(shareDescription)}">
	<meta name="theme-color" content="#0e0b09">
	<meta property="og:title" content="${esc(shareTitle)}">
	<meta property="og:description" content="${esc(shareDescription)}">
	<meta property="og:type" content="website">
	<meta property="og:site_name" content="LIMBUS BUILD TERMINAL">
	<meta property="og:locale" content="ja_JP">
	<meta property="og:image" content="${shareImage}">
	<meta property="og:image:secure_url" content="${shareImage}">
	<meta property="og:image:type" content="${shareImageType}">
	<meta property="og:image:width" content="1200">
	<meta property="og:image:height" content="630">
	<meta property="og:image:alt" content="LIMBUS BUILD TERMINAL CHARACTER SHEET">
	<meta name="twitter:card" content="summary_large_image">
	<meta name="twitter:title" content="${esc(shareTitle)}">
	<meta name="twitter:description" content="${esc(shareDescription)}">
	<meta name="twitter:image" content="${shareImage}">
	<link href="https://fonts.googleapis.com/css2?family=Rajdhani:wght@500;600;700&family=Share+Tech+Mono&family=Noto+Sans+JP:wght@400;500;700;900&family=Cormorant+Garamond:wght@500;600;700&display=swap" rel="stylesheet">
<style>
/* v55: \u5171\u6709\u30B7\u30FC\u30C8\u3092\u300CDANTE HOMAGE\u300D\u914D\u8272\u3078\u66F4\u65B0\u3002
   \u7DE8\u96C6\u753B\u9762 (v55-dante.css) \u3068\u540C\u4E00\u306E\u8A2D\u8A08\u8A00\u8A9E\u3067\u7D71\u4E00\u3059\u308B:
     \u57FA\u8ABF=\u6696\u307F\u306E\u30C1\u30E3\u30B3\u30FC\u30EB\u9ED2 / \u30A2\u30AF\u30BB\u30F3\u30C8=\u6DF1\u7D05\u30AF\u30EA\u30E0\u30BE\u30F3+\u30B4\u30FC\u30EB\u30C9 /
     \u5927\u7F6A\u8272=\u30B2\u30FC\u30E0\u5185\u30B7\u30F3\u30A2\u30A4\u30B3\u30F3\u53C2\u7167\u6E96\u62E0 / \u80CC\u666F=\u6642\u8A08\u30FB\u6B6F\u8ECA\u30FB\u30C1\u30A7\u30FC\u30F3\u306E\u900F\u304B\u3057
   \uFF08\u900F\u304B\u3057\u306F\u72EC\u81EA\u751F\u6210\u306E\u5E7E\u4F55\u5B66 SVG\u3002\u516C\u5F0F\u7D20\u6750\u4E0D\u4F7F\u7528\uFF09 */
:root{
  --bg:#0e0b09;             /* \u6696\u307F\u306E\u30C1\u30E3\u30B3\u30FC\u30EB\uFF08\u713C\u3051\u305F\u91D1\u5C5E\u611F\uFF09 */
  --panel:#1a1715;          /* --surface-1 */
  --panel2:#211d1a;         /* --surface-2 */
  --line:#3d342c;           /* line \u76F8\u5F53 */
  --line2:#211d1a;
  --gold:#d4af5f;           /* \u6642\u8A08\u91DD\u30FB\u6B6F\u8ECA\u306E\u91D1\u5C5E\u30B4\u30FC\u30EB\u30C9 */
  --gold-hi:#eecf8a;
  --accent:#c8352b;         /* \u6DF1\u7D05\u30AF\u30EA\u30E0\u30BE\u30F3\uFF08\u5916\u8F2A\u30FB\u30CD\u30AF\u30BF\u30A4\uFF09 */
  --accent-hi:#e85c4a;
  --amber:#e8963c;          /* \u4E2D\u592E\u6A5F\u69CB\u306E\u7425\u73C0\u767A\u5149 */
  --tx:#f2ece1;             /* \u30A2\u30A4\u30DC\u30EA\u30FC\uFF08\u30B7\u30E3\u30C4\u306E\u767D\u307F\uFF09 */
  --tx2:#d9d0c0;
  --tx3:#a89e8c;
  --mono:'Share Tech Mono',monospace; --head:'Rajdhani','Noto Sans JP',sans-serif;
  /* \u5927\u7F6A\u8272 v55\uFF1A\u516C\u5F0F\u30B7\u30F3\u30A2\u30A4\u30B3\u30F3\u53C2\u7167\u6E96\u62E0\uFF08\u6697\u80CC\u666F\u7528\u306B\u8F1D\u5EA6\u306E\u307F\u5FAE\u5897\uFF09\u3002 */
  --sin-\u61A4\u6012:#c13b31; --sin-\u8272\u6B32:#c96424; --sin-\u6020\u60F0:#e29a20; --sin-\u66B4\u98DF:#7a9b40;
  --sin-\u6182\u9B31:#35808d; --sin-\u50B2\u6162:#2d5a99; --sin-\u5AC9\u59AC:#90509b; --sin-\u7279\u6B8A:#9a989b;
  --rank-ZAYIN:#6ea555; --rank-TETH:#4a9fe0; --rank-HE:#c9c650; --rank-WAW:#d97e3a; --rank-ALEPH:#b83a3a;
  /* \u30C0\u30F3\u30C6\u30E2\u30C1\u30FC\u30D5\u900F\u304B\u3057\uFF08\u72EC\u81EASVG\uFF09 */
  --dante-gear:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'%3E%3Cg fill='none' stroke='%23d4af5f' stroke-opacity='0.5'%3E%3Ccircle cx='60' cy='60' r='26' stroke-width='3'/%3E%3Ccircle cx='60' cy='60' r='10' stroke-width='3'/%3E%3Cg stroke-width='7' stroke-linecap='round'%3E%3Cpath d='M60 26v12M60 82v12M26 60h12M82 60h12M36 36l9 9M75 75l9 9M84 36l-9 9M45 75l-9 9'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E");
  --dante-clock:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 160 160'%3E%3Cg fill='none' stroke='%23c8352b' stroke-opacity='0.45'%3E%3Ccircle cx='80' cy='80' r='52' stroke-width='3'/%3E%3Ccircle cx='80' cy='80' r='44' stroke-width='1.5' stroke-opacity='0.3'/%3E%3Cg stroke-width='4' stroke-linecap='round'%3E%3Cpath d='M80 34v8M80 118v8M34 80h8M118 80h8M54 49l6 6M106 103l6 6M49 106l6-6M103 54l6-6'/%3E%3C/g%3E%3Cpath d='M80 80V50M80 80l22 14' stroke='%23d4af5f' stroke-opacity='0.6' stroke-width='4' stroke-linecap='round'/%3E%3Ccircle cx='80' cy='80' r='5' fill='%23d4af5f' fill-opacity='0.6' stroke='none'/%3E%3C/g%3E%3C/svg%3E");
  --dante-chain:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60' viewBox='0 0 60 60'%3E%3Cg fill='none' stroke='%23a89e8c' stroke-opacity='0.28' stroke-width='3'%3E%3Cpath d='M-10 30 Q 5 18 20 30 T 50 30 T 80 30'/%3E%3Cpath d='M-10 46 Q 5 34 20 46 T 50 46 T 80 46' stroke-opacity='0.18'/%3E%3C/g%3E%3C/svg%3E");
}
*{box-sizing:border-box}
body{margin:0;color:var(--tx);font-family:'Noto Sans JP',sans-serif;font-size:14px;line-height:1.7;padding:24px;
  /* T20: 装飾背景は情報可読性の妨げになるとの現場報告を受け、単色化。
     視認の主役をパネルと文字に戻し、スクショ・印刷・モバイルでのムラを排除する */
  background:var(--bg);
}
.wrap{max-width:960px;margin:0 auto}
/* v52: \u30C6\u30FC\u30DE\u5207\u66FF\u30DC\u30BF\u30F3\u5EC3\u6B62\u3002\u30C0\u30FC\u30AF\u4E00\u672C\u5316 */
.theme-btn{display:none}

/* T22+V12: 共有シートの折り畳みセクション — 開閉状態を明確に識別できるデザイン */
details.fold>summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:10px;padding:8px 12px;user-select:none;-webkit-tap-highlight-color:transparent;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.12);border-radius:4px;transition:background .15s ease,border-color .15s ease}
details.fold>summary::-webkit-details-marker{display:none}
details.fold>summary h2{margin:0;flex:1;pointer-events:none}
details.fold>summary::before{content:'\\25B6';display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;flex:none;font-size:11px;color:var(--gold);border:1px solid var(--gold);border-radius:3px;background:rgba(200,168,75,.10);transition:transform .18s ease}
details.fold[open]>summary::before{transform:rotate(90deg)}
details.fold>summary::after{content:'クリックで展開';font-size:9px;letter-spacing:.12em;color:var(--tx3,#888);border:1px dashed rgba(255,255,255,.25);padding:2px 8px;border-radius:99px;flex:none;font-family:var(--mono,monospace)}
details.fold[open]>summary::after{content:'クリックで折りたたむ';color:var(--gold);border-style:solid;border-color:var(--gold)}
details.fold>summary:focus-visible{outline:2px solid var(--gold);outline-offset:3px;border-radius:4px}
details.fold:not([open])>summary{opacity:.9}
details.fold[open]>summary{background:rgba(200,168,75,.08);border-color:var(--gold)}
details.fold>summary:hover{background:rgba(200,168,75,.12)}
details.fold>summary:hover h2{color:var(--gold-hi)}
@keyframes lbt-copy-pop{0%{transform:translateY(-8px);opacity:0}100%{transform:translateY(0);opacity:1}}

/* --- Header: PC/PL/\u4EBA\u683C\u540D \u306E\u8996\u8A8D\u6027\u3092\u6700\u5927\u5316 --- */
.hd{border-bottom:2px solid var(--gold);padding-bottom:18px;margin-bottom:24px}
.hd-plpc{display:flex;gap:14px;flex-wrap:wrap;margin-bottom:10px;font-size:11px;font-family:var(--mono);letter-spacing:0.14em}
.hd-plpc span b{color:var(--gold);margin-right:6px;font-weight:normal}
.hd-plpc span{color:var(--tx2)}
.hd h1{font-family:var(--head);font-weight:700;letter-spacing:0.04em;font-size:38px;margin:0 0 6px;color:var(--tx);line-height:1.1}
.hd .persona-line{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:8px}
.hd .persona-line .lbl{font-family:var(--mono);font-size:10px;letter-spacing:0.2em;color:var(--tx3);text-transform:uppercase;padding:3px 10px;background:rgba(212,175,95,0.1);border:1px solid rgba(212,175,95,0.4);border-radius:2px}
.hd .persona-line .val{font-family:var(--head);font-weight:700;font-size:24px;color:var(--gold-hi);letter-spacing:0.02em}
	.hd .persona-line .sync-max{background:rgba(200,53,43,.18);border-color:rgba(232,92,74,.72);color:#ffd4cf}
	.share-visual{margin:0 0 20px;border:1px solid var(--line);background:var(--panel);padding:8px;border-radius:3px}
	.share-visual img{display:block;width:100%;max-height:460px;object-fit:contain;border-radius:2px;background:#0e0b09}
	.share-visual figcaption{font:10px var(--mono);letter-spacing:.15em;color:var(--tx3);padding:7px 3px 0;text-transform:uppercase}

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
/* v55: \u8010\u6027\u8272\u3092\u30C0\u30F3\u30C6\u914D\u8272 (v55-dante.css --res-*) \u3068\u540C\u4E00\u5024\u3078\u66F4\u65B0\u3002
   \u30B0\u30EC\u30FC\u7CFB(\u666E\u901A)\u306F\u6E29\u304B\u307F\u306E\u3042\u308B\u77F3\u8272\u3078\u7F6E\u63DB\u3057\u30D6\u30E9\u30F3\u30C9\u8ABF\u548C\u3092\u4FDD\u3064 */
.res[data-r="\u8106\u5F31"]{background:#8f3a33;color:#f4e2e0;border-color:#66281f}
.res[data-r="\u5F31\u70B9"]{background:#a56a35;color:#f7e9d8;border-color:#754a1e}
.res[data-r="\u666E\u901A"]{background:#7a7060;color:#f2ece1;border-color:#57493c}
.res[data-r="\u62B5\u6297"]{background:#4e7a52;color:#e3f0e6;border-color:#36573a}
.res[data-r="\u8010\u6027"]{background:#3f6d85;color:#e2ecf2;border-color:#2b4c5e}
.res[data-r="\u514D\u75AB"]{background:#6b5a8a;color:#eae4f2;border-color:#4b3f63}

/* --- Sections v52: h2\u306B\u30B4\u30FC\u30EB\u30C9\u5E2F\u3092\u4F34\u3046\u5927\u898B\u51FA\u3057\uFF0F\u30D1\u30CD\u30EB\u306B\u5185\u90E8\u30BB\u30D1\u30EC\u30FC\u30BF --- */
.sec{margin-bottom:32px;position:relative}
.sec h2{font-family:var(--head);font-weight:700;letter-spacing:0.22em;font-size:15px;color:var(--gold);margin:0 0 14px;padding:8px 0 8px 14px;border-left:4px solid var(--gold);background:linear-gradient(90deg,rgba(212,175,95,0.10),transparent 60%);text-transform:uppercase;position:relative}
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
.skl-rank{font-family:var(--head);font-weight:700;font-size:11px;letter-spacing:0.14em;color:var(--gold);padding:2px 8px;background:rgba(212,175,95,0.1);border:1px solid rgba(212,175,95,0.4)}
.skl-name{font-family:var(--head);font-weight:700;font-size:16px;color:var(--tx)}
.skl-meta{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin:-4px 0 10px;padding-bottom:8px;border-bottom:1px solid var(--line2)}
.attr-tag{display:inline-block;padding:2px 8px;font-family:var(--head);font-size:11px;font-weight:700;letter-spacing:0.1em;color:var(--tx2);background:var(--panel2);border:1px solid var(--line);border-radius:2px}
.skl-name{overflow-wrap:anywhere;line-height:1.25}
.skl-h{display:flex;align-items:baseline;gap:8px;margin-bottom:8px;padding-bottom:8px;border-bottom:none;flex-wrap:wrap}
.skl-e{font-size:13px;color:var(--tx);line-height:1.75;margin-bottom:6px;padding:8px 10px;background:rgba(0,0,0,0.20);border-left:2px solid var(--gold);border-radius:2px}

/* v52: \u30C0\u30A4\u30B9\u30BB\u30AF\u30B7\u30E7\u30F3\u306E\u533A\u5207\u308A\u5F37\u5316 */
.dice-title{font-family:var(--head);font-size:11px;letter-spacing:0.28em;color:var(--gold);text-transform:uppercase;margin:12px 0 8px;padding:4px 8px;background:linear-gradient(90deg,rgba(212,175,95,0.15),transparent 70%);border-left:2px solid var(--gold);font-weight:700}
.dice-block{display:flex;flex-direction:column;gap:4px;padding:6px;background:rgba(0,0,0,0.25);border:1px solid var(--line);border-radius:3px}
.dice-row{display:grid;grid-template-columns:20px minmax(64px,max-content) 1fr;gap:8px;align-items:baseline;font-size:12.5px;padding:5px 8px;background:var(--panel2);border:1px solid var(--line);border-left:3px solid var(--gold-hi);border-radius:2px}
.dice-row + .dice-row{margin-top:0}
.dice-idx{font-family:var(--mono);font-size:12px;font-weight:700;color:var(--gold-hi);text-align:center;line-height:1.4;background:rgba(212,175,95,0.15);border:1px solid var(--gold);border-radius:2px;padding:2px 0}
.dice-roll{font-family:var(--mono);color:var(--gold-hi);font-weight:700;font-size:13.5px;letter-spacing:0.04em;padding-right:8px;border-right:1px dashed var(--line2);white-space:nowrap}
.dice-eff{color:var(--tx);line-height:1.6;min-width:0;word-break:break-word;font-size:12.5px}

/* --- \u5927\u7F6A\u30AB\u30E9\u30FC\u30BF\u30B0 --- */
.sin-tag{display:inline-block;padding:2px 10px;font-family:var(--head);font-size:11px;font-weight:700;letter-spacing:0.08em;border-radius:2px;background:var(--sin-color,var(--panel2));color:#fff;text-shadow:0 1px 2px rgba(0,0,0,0.55),0 0 2px rgba(0,0,0,0.35);border:1px solid rgba(0,0,0,0.25)}
/* v51: \u5927\u7F6A\u30D9\u30BF\u5857\u308A\u30BF\u30B0\u306E\u524D\u666F\u8272\u3002\u660E\u5EA6\u304C\u9AD8\u3044\u8272 (\u6020\u60F0:\u9EC4, \u66B4\u98DF:\u7DD1, \u50B2\u6162:teal, \u7279\u6B8A:\u7070) \u306F
   \u9ED2\u30C6\u30AD\u30B9\u30C8+\u5F71\u306A\u3057\u3067\u53EF\u8AAD\u6027\u78BA\u4FDD\u3001\u305D\u308C\u4EE5\u5916\u306F\u767D\u30C6\u30AD\u30B9\u30C8+\u9ED2\u5F71 */
.sin-tag[data-sin="\u61A4\u6012"]{--sin-color:var(--sin-\u61A4\u6012)}
.sin-tag[data-sin="\u8272\u6B32"]{--sin-color:var(--sin-\u8272\u6B32)}
.sin-tag[data-sin="\u6020\u60F0"]{--sin-color:var(--sin-\u6020\u60F0)}
.sin-tag[data-sin="\u66B4\u98DF"]{--sin-color:var(--sin-\u66B4\u98DF)}
.sin-tag[data-sin="\u6182\u9B31"]{--sin-color:var(--sin-\u6182\u9B31)}
.sin-tag[data-sin="\u50B2\u6162"]{--sin-color:var(--sin-\u50B2\u6162)}
.sin-tag[data-sin="\u5AC9\u59AC"]{--sin-color:var(--sin-\u5AC9\u59AC)}
.sin-tag[data-sin="\u7279\u6B8A"]{--sin-color:var(--sin-\u7279\u6B8A)}
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
.spp .cond.lp{color:var(--gold);border-color:rgba(212,175,95,0.4)}
.spp.is-death{border-left:3px solid var(--accent-hi);}
.cond.death{background:rgba(232,92,74,0.14);border-color:rgba(232,92,74,0.45);color:#fff;}
.spp .eff{margin-top:4px;font-size:12.5px;color:var(--tx2);line-height:1.7}
.special-enhancement-fold{padding:0}
.special-enhancement-fold>summary{list-style:none;cursor:pointer;padding:10px 14px;margin:0;user-select:none;-webkit-tap-highlight-color:transparent}
.special-enhancement-fold>summary::-webkit-details-marker{display:none}
.special-enhancement-fold>summary::after{content:'▶ 展開';margin-left:auto;color:var(--gold);font-size:10px;font-family:var(--mono)}
.special-enhancement-fold[open]>summary::after{content:'▼ 折り畳み'}
.special-enhancement-fold>.eff{padding:0 14px 12px;margin-top:0;border-top:1px solid var(--line)}
.special-enhancement-fold>summary:focus-visible{outline:2px solid var(--gold);outline-offset:-2px}
.section-count{font:10px var(--mono);color:var(--gold);border:1px solid rgba(212,175,95,.4);padding:2px 6px;margin-left:7px;vertical-align:middle}
.share-inventory{padding-bottom:4px}
.share-item{padding:9px 0 10px;border-bottom:1px solid var(--line)}
.share-item:last-child{border-bottom:0}
.share-item-h{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
.share-item-h b{font-family:var(--head);font-size:14px;color:var(--tx)}
.item-count{font:12px var(--mono);color:var(--gold-hi);margin-left:auto}
.item-category{font:10px var(--mono);color:var(--tx3);border:1px solid var(--line2);padding:1px 6px}
.scope-tag{font:10px var(--mono);letter-spacing:.04em;border:1px solid var(--line2);padding:2px 6px;white-space:nowrap}
.scope-single{color:var(--tx3)}
.scope-area{color:#edb57a;border-color:rgba(237,181,122,.55);background:rgba(237,181,122,.08)}
.scope-barrage{color:#ff917f;border-color:rgba(255,145,127,.62);background:rgba(255,145,127,.10)}
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
.eff.always{padding:6px 10px;background:rgba(212,175,95,0.06);border-left:2px solid var(--gold);margin-bottom:6px}
.eff-joined{padding:7px 10px;background:rgba(212,175,95,0.045);border-left:2px solid var(--gold)}
.eff-label{color:var(--gold);font-family:var(--head);font-size:11px;letter-spacing:.08em}
.eff-sep{color:var(--tx3);padding:0 5px}
.eff u{color:var(--gold);text-decoration:none;font-family:var(--head);font-size:11px;letter-spacing:0.14em;text-transform:uppercase;font-weight:700}
.tim{color:var(--gold);font-family:var(--head);font-size:11.5px;letter-spacing:0.08em;font-weight:700}
.foot{margin-top:36px;padding-top:16px;border-top:1px solid var(--line2);font-family:var(--mono);font-size:10px;color:var(--tx3);letter-spacing:0.1em;text-align:center}
@media print{ body{background:#fff;color:#000} }
@media (max-width:640px){ body{padding:12px;font-size:13px} .stats{grid-template-columns:repeat(2,1fr)} .hd h1{font-size:28px} .res{min-width:120px;padding:9px 16px;font-size:17px} }
</style></head><body>
<div class="wrap">
	  <header class="hd">
    ${p.personaSrc ? `<div class="persona-line share-at-a-glance"><span class="lbl">\u4EBA\u683C</span><span class="val">${esc(personaName)}</span>${p.personaMode === "t" ? '<span class="lbl" style="background:rgba(212,175,95,0.2)">\u7279\u7570</span>' : ""}<span class="lbl">HP ${esc(shareHp)}</span><span class="lbl">SAN ${esc(shareSan)}</span>${showSyncRank && personaSync.syncRank ? `<span class="lbl">\u540C\u671F${esc(personaSync.syncRank)}</span>` : ""}${personaSync.syncMax ? '<span class="lbl sync-max">\u540C\u671FMAX</span>' : ""}</div>` : ""}
    <div class="hd-plpc">
      <span><b>\u3010PC\u3011</b>${esc(p.charName || "\u2014")}</span>
      ${p.plName ? `<span><b>\u3010PL\u3011</b>${esc(p.plName)}</span>` : ""}
    </div>
	    <h1>${esc(p.charName || "PC")}</h1>
	  </header>
	  ${shareVisualHTML}
  <div class="stats">
    <div class="stat"><div class="lbl">HP</div><div class="val">${esc(shareHp)}</div></div>
    <div class="stat"><div class="lbl">SAN</div><div class="val">${esc(shareSan)}</div></div>
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
  ${spiritHTML}
  ${skillsHTML}
  ${egosHTML}
  ${supportHTML}
  ${uniqueHTML}
  ${enhHTML}
  ${inventoryHTML}
  <div class="foot">LIMBUS BUILD TERMINAL ${esc(window.LBT_VERSION || "v64r45")} \xB7 Character Sheet \xB7 Generated ${(/* @__PURE__ */ new Date()).toLocaleString("ja-JP")}</div>
</div></body></html>`;
}
// 通常はURL fragmentに圧縮して保持する。Discord実用長を超える場合は分散トークン保存を使い、
// LBT共有ページを最初の到達先として完全共有ビューアを自動復元する。
const LBT_SHARE_VIEWER_URL = "https://lbtstudio.github.io/LIMBUS_BUILD_TERMINAL/share.html";
async function openShareSheet(state) {
  const html = buildShareSheetHTML(state);
  const filename = `${(state.charName || "character").replace(/[^\w\-一-龥ぁ-んァ-ヴ]/g, "_") || "character"}_sheet.html`;
  const prev = document.getElementById("lbt-share-modal-root");
  if (prev) prev.remove();
  const root = document.createElement("div");
  root.id = "lbt-share-modal-root";
  root.innerHTML = `
    <style>/* 共有モーダル: 進行中ステータスのローラー表示 */.share-opt-status.is-progress::before{content:'';display:inline-block;width:10px;height:10px;margin-right:6px;border:2px solid var(--gold-line,rgba(212,175,95,0.4));border-top-color:var(--gold,#c8a84b);border-radius:50%;animation:lbtShareSpin 0.8s linear infinite;vertical-align:-1px}@keyframes lbtShareSpin{to{transform:rotate(360deg)}}</style>
    <div class="share-modal-backdrop" data-close>
      <div class="share-modal" role="dialog" aria-labelledby="lbt-share-title">
        <div class="share-modal-head">
          <div class="share-modal-title" id="lbt-share-title">\u25C8 \u5171\u6709\u30B7\u30FC\u30C8 \u2014 \u767A\u884C\u65B9\u6CD5\u3092\u9078\u629E</div>
          <button class="share-modal-close" data-close aria-label="\u9589\u3058\u308B">\u2715</button>
        </div>
        <div class="share-modal-desc">
          \u6574\u5F62\u30B7\u30FC\u30C8\uFF08\u7DE8\u96C6\u753B\u9762\u3068\u540C\u3058\u30C0\u30FC\u30AF\uFF0B\u30B4\u30FC\u30EB\u30C9\uFF09\u306E\u5171\u6709\u624B\u6BB5\u3092\u9078\u3093\u3067\u304F\u3060\u3055\u3044\u3002<br>
          <b>他者へURLで見せるなら①「Discord対応URLを発行」が最適です。</b>発行後に表示される「Discordへ貼るURL」を、そのまま貼り付けてください。
        </div>
        <div class="share-opt-list">
          <button class="share-opt is-recommended" data-act="publish">
            <span class="share-opt-icon">\u2460</span>
            <span class="share-opt-body">
	              <span class="share-opt-title">Discord対応URLを発行</span>
	              <span class="share-opt-desc">GitHub Pagesの完全シートを直接開くURLを発行します。長文も最初からLBT共有ページで自動復元します。アカウント作成・ログインは不要で、発行後は主URLを自動コピー・手動コピーできます。</span>
              <span class="share-opt-status" data-status="publish"></span>
            </span>
          </button>
          <button class="share-opt" data-act="download">
            <span class="share-opt-icon">\u2461</span>
            <span class="share-opt-body">
              <span class="share-opt-title">HTML\u30D5\u30A1\u30A4\u30EB\u3068\u3057\u3066\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9</span>
              <span class="share-opt-desc">${filename} \u540D\u3067\u4FDD\u5B58\u3002\u76F8\u624B\u306B\u30D5\u30A1\u30A4\u30EB\u3092\u76F4\u63A5\u6E21\u3059\u5834\u5408\u3084\u30AA\u30D5\u30E9\u30A4\u30F3\u3067\u306E\u4FDD\u7BA1\u306B\u3002\u6700\u3082\u78BA\u5B9F\u306A\u624B\u6BB5\u3067\u3059\u3002</span>
              <span class="share-opt-status" data-status="download"></span>
            </span>
          </button>
          <button class="share-opt" data-act="tab">
            <span class="share-opt-icon">\u2462</span>
            <span class="share-opt-body">
              <span class="share-opt-title">\u65B0\u898F\u30BF\u30D6\u3067\u81EA\u5206\u3060\u3051\u30D7\u30EC\u30D3\u30E5\u30FC</span>
              <span class="share-opt-desc">\u3053\u306E\u7AEF\u672B\u3067\u5185\u5BB9\u3092\u78BA\u8A8D\u3059\u308B\u3060\u3051\u306E\u7528\u9014\u3002\u4ED6\u8005\u306F\u958B\u3051\u307E\u305B\u3093\uFF08\u30DD\u30C3\u30D7\u30A2\u30C3\u30D7\u30D6\u30ED\u30C3\u30AF\u3067\u5931\u6557\u3059\u308B\u3053\u3068\u304C\u3042\u308A\u307E\u3059\uFF09\u3002</span>
              <span class="share-opt-status" data-status="tab"></span>
            </span>
          </button>
        </div>
        <div class="share-modal-foot">
          LBT ${window.LBT_VERSION || "v64r45"} \u2014 Shift+Escape \u3067\u3082\u9589\u3058\u3089\u308C\u307E\u3059
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
      // 背景そのものを押した時だけ閉じる。currentTarget は子要素のクリックでも
      // 常に背景になるため、共有発行・URLコピーの結果表示を消してしまう。
      if (e.target === el) close();
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
      setStatus("publish", "is-progress", "\u516C\u958B\u3092\u958B\u59CB\u3057\u307E\u3059\u2026");
      try {
        if (!window.LBT_shareLink?.createPublishedUrl) throw new Error("\u5171\u6709URL\u751F\u6210\u30E2\u30B8\u30E5\u30FC\u30EB\u3092\u8AAD\u307F\u8FBC\u3081\u307E\u305B\u3093\u3067\u3057\u305F\u3002\u30DA\u30FC\u30B8\u3092\u518D\u8AAD\u307F\u8FBC\u307F\u3057\u3066\u304F\u3060\u3055\u3044");
        const r = await window.LBT_shareLink.createPublishedUrl(state, LBT_SHARE_VIEWER_URL);
        const routeLabel = r.strategy === "rentry" || r.strategy === "telegraph" ? "LBT\u5171\u6709\u30DA\u30FC\u30B8\u3067\u81EA\u52D5\u5FA9\u5143" : "\u81EA\u5DF1\u5B8C\u7D50URL";
        const tag = `${routeLabel}\uFF08${r.length.toLocaleString()}\u6587\u5B57\uFF09`;
        // 非同期処理後でも自動コピーを試みる。ブラウザが拒否しても、下の入力欄と
        // ボタンで同じURLを手動コピーできるため、共有結果を失わない。
        let copied = false;
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(r.url);
            copied = true;
          }
        } catch (e) {
          copied = false;
        }
        if (!copied) {
          try {
            const ta = document.createElement("textarea");
            ta.value = r.url;
            ta.style.cssText = "position:fixed;opacity:0;pointer-events:none";
            document.body.appendChild(ta);
            ta.focus();
            ta.select();
            copied = !!(document.execCommand && document.execCommand("copy"));
            ta.remove();
          } catch (e) {
            copied = false;
          }
        }
        setStatus("publish", "is-ok", copied
          ? `✓ 共有URLをコピーしました。Discordへそのまま貼り付けてください。 ${tag}`
          : `共有URLを発行しました。下の「Discordへ貼るURLをコピー」を押してください。 ${tag}`);
        // 主URLはDiscordへ貼る対象として常に最初に見せ、手動コピーもここで完結させる。
        const statusEl = root.querySelector('[data-status="publish"]');
        if (statusEl) {
          const resultArea = statusEl.parentElement;
          resultArea.querySelectorAll(".share-url-field,.share-url-backups").forEach((el) => el.remove());
          const addUrlField = (parent, entry, primary) => {
            const wrap = document.createElement("div");
            wrap.className = "share-url-field";
            wrap.style.cssText = primary ? "margin-top:8px;padding:8px;border:1px solid rgba(200,168,75,.55);background:rgba(200,168,75,.06)" : "display:flex;gap:6px;margin-top:6px";
            const label = document.createElement("div");
            label.textContent = entry.label;
            label.style.cssText = primary ? "font-size:11px;font-weight:700;color:var(--gold,#c8a84b);margin-bottom:5px" : "align-self:center;font-size:10px;white-space:nowrap;color:var(--muted,#a59d8a)";
            const row = document.createElement("div");
            row.style.cssText = "display:flex;gap:6px;min-width:0";
            const inp = document.createElement("input");
            inp.className = "input";
            inp.readOnly = true;
            inp.value = entry.url;
            inp.style.cssText = "flex:1;min-width:0;font-family:var(--f-mono);font-size:11px";
            inp.addEventListener("click", () => { inp.select(); });
            const cpBtn = document.createElement("button");
            cpBtn.className = "btn btn-sm";
            cpBtn.textContent = primary ? "Discordへ貼るURLをコピー" : "予備URLをコピー";
            cpBtn.addEventListener("click", async () => {
              inp.select();
              let ok = false;
              try { await navigator.clipboard.writeText(inp.value); ok = true; } catch (e) {
                try { ok = document.execCommand && document.execCommand("copy"); } catch (e2) {}
              }
              cpBtn.textContent = ok ? "✓ コピー済" : "選択済み：Ctrl+Cでコピー";
              if (!ok) inp.focus();
              setTimeout(() => { cpBtn.textContent = primary ? "Discordへ貼るURLをコピー" : "予備URLをコピー"; }, 2200);
            });
            if (primary) wrap.appendChild(label); else row.appendChild(label);
            row.appendChild(inp);
            row.appendChild(cpBtn);
            wrap.appendChild(row);
            parent.appendChild(wrap);
          };
          addUrlField(resultArea, { label: copied ? "Discordへ貼るURL（コピー済み）" : "Discordへ貼るURL", url: r.url }, true);
          if ((r.backups || []).length) {
            const backups = document.createElement("details");
            backups.className = "share-url-backups";
            backups.style.cssText = "margin-top:6px;font-size:11px;color:var(--muted,#a59d8a)";
            const summary = document.createElement("summary");
            summary.textContent = "予備URL（通常は使いません）";
            summary.style.cssText = "cursor:pointer;color:var(--muted,#a59d8a)";
            backups.appendChild(summary);
            const help = document.createElement("div");
            help.textContent = "主URLが開けない場合だけ、こちらをコピーして使ってください。";
            help.style.cssText = "margin:5px 0 2px";
            backups.appendChild(help);
            (r.backups || []).forEach((entry) => addUrlField(backups, { label: `${entry.source} 予備URL`, url: entry.url }, false));
            resultArea.appendChild(backups);
          }
        }
      } catch (e) {
        setStatus("publish", "is-err", "\u2717 " + (e.message || "\u516C\u958B\u5931\u6557") + " \u2014 \u2461\u30C0\u30A6\u30F3\u30ED\u30FC\u30C9\u304B\u3001\u6642\u9593\u3092\u7F6E\u3044\u3066\u518D\u8A66\u884C\u3057\u3066\u304F\u3060\u3055\u3044");
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
