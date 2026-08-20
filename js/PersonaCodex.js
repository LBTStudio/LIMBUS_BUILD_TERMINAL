const SINS_ORDER = ["\u61A4\u6012", "\u8272\u6B32", "\u6020\u60F0", "\u66B4\u98DF", "\u6182\u9B31", "\u50B2\u6162", "\u5AC9\u59AC"];
const RES_LEVELS = ["\u8106\u5F31", "\u5F31\u70B9", "\u666E\u901A", "\u62B5\u6297", "\u8010\u6027", "\u514D\u75AB"];

// 基本ルールPDF「バフ・デバフ一覧」(303〜307頁) の掲載順。
// 人格編集の候補は五十音順ではなく、ルールブックを読む順で提示する。
// DB独自・将来追加の語は既存データを失わないため、公式一覧の後ろへ安定して配置する。
// 人格の候補には、変換・派生・属性限定ではない直接的な基本状態だけを固定で用意する。
const PERSONA_FIXED_KEYWORD_OPTIONS = [
  "\u30D1\u30EF\u30FC", "\u5FCD\u8010", "\u30AF\u30A4\u30C3\u30AF", "\u4FDD\u8B77", "\u30C0\u30E1\u30FC\u30B8\u91CF\u5897\u52A0",
  "\u865A\u5F31", "\u6B66\u88C5\u89E3\u9664", "\u675F\u7E1B", "\u8106\u5F31", "\u30C0\u30E1\u30FC\u30B8\u91CF\u6E1B\u5C11",
  "\u5F3E\u4E38", "\u30D0\u30EA\u30A2"
];
const PDF_KEYWORD_ORDER = window.LBT_PDF_KEYWORD_ORDER || [
  // 基本ルールPDF 303頁「バフ」の掲載順。
  "\u30D1\u30EF\u30FC", "\u5FCD\u8010", "\u30AF\u30A4\u30C3\u30AF", "\u4FDD\u8B77", "\u5145\u96FB", "\u547C\u5438", "\u30C0\u30E1\u30FC\u30B8\u91CF\u5897\u52A0",
  // 基本ルールPDF 306〜307頁「デバフ」の掲載順。
  "\u865A\u5F31", "\u6B66\u88C5\u89E3\u9664", "\u675F\u7E1B", "\u8106\u5F31", "\u706B\u50B7", "\u6C88\u6F5C", "\u51FA\u8840", "\u6050\u614C", "\u7834\u88C2", "\u632F\u52D5", "\u30C0\u30E1\u30FC\u30B8\u91CF\u6E1B\u5C11", "\u6BD2", "\u9EBB\u75FA",
  // 基本ルールPDF 310頁の中立バフ。PDF外の弾丸は標準一覧の後ろへ置く。
  "\u30D0\u30EA\u30A2", "\u5F3E\u4E38"
];
const sortPersonaKeywordsByPdf = (values) => {
  const unique = [...new Set((values || []).filter(Boolean))];
  const orderIndex = new Map(PDF_KEYWORD_ORDER.map((value, index) => [value, index]));
  return unique.slice().sort((a, b) => {
    const ia = orderIndex.has(a) ? orderIndex.get(a) : Number.MAX_SAFE_INTEGER;
    const ib = orderIndex.has(b) ? orderIndex.get(b) : Number.MAX_SAFE_INTEGER;
    return ia !== ib ? ia - ib : a.localeCompare(b, "ja");
  });
};
const orderPersonaKeywordOptions = (values) => sortPersonaKeywordsByPdf(values).filter((value) => value !== "\u7206\u767A" && value !== "\u6DF7\u4E71" && value !== "\u6307\u4EE4");
const orderPersonaKeywordDisplay = (values) => sortPersonaKeywordsByPdf(values).filter((value) => value !== "\u7206\u767A" && value !== "\u6DF7\u4E71");
function inferAffiliation(name) {
  if (!name) return "";
  const rules = [
    ["\u9ED2\u96F2\u4F1A", "\u9ED2\u96F2\u4F1A"],
    ["\u5263\u5951", "\u5263\u5951"],
    ["\u5357\u90E8\u89AA\u6307", "\u89AA\u6307"],
    ["\u6771\u90E8\u89AA\u6307", "\u89AA\u6307"],
    ["\u4EBA\u5DEE\u3057\u6307", "\u4EBA\u5DEE\u3057\u6307"],
    ["\u4E2D\u6307", "\u4E2D\u6307"],
    ["\u85AC\u6307", "\u85AC\u6307"],
    ["\u30AB\u30B8\u30CE", "\u30AB\u30B8\u30CE\u8B66\u5099\u54E1"],
    ["\u307D\u3093\u307D\u3093", "\u307D\u3093\u307D\u3093\u6D3E"],
    ["\u30DE\u30EA\u30A2\u30C3\u30C1", "\u30DE\u30EA\u30A2\u30C3\u30C1"],
    ["\u9244\u5DE5\u4F1A", "\u9244\u5DE5\u4F1A"],
    ["\u53CC\u9264", "\u53CC\u9264\u6D77\u8CCA\u56E3"],
    ["\u30D4\u30FC\u30AF\u30A9\u30C9", "\u30D4\u30FC\u30AF\u30A9\u30C9\u53F7"],
    ["\u30C7\u30C3\u30C9\u30E9\u30D3\u30C3\u30C4", "\u30C7\u30C3\u30C9\u30E9\u30D3\u30C3\u30C4"],
    ["20\u533A", "20\u533A\u30E6\u30ED\u30FC\u30B8\u30F4\u30A3"],
    ["\u30E6\u30ED\u30FC\u30B8\u30F4\u30A3", "20\u533A\u30E6\u30ED\u30FC\u30B8\u30F4\u30A3"],
    ["\u7B11\u3046\u9854", "\u7B11\u3046\u9854"],
    ["\u30C4\u30F4\u30A1\u30A4\u5354\u4F1A", "\u30C4\u30F4\u30A1\u30A4\u5354\u4F1A"],
    ["\u30B7\u5354\u4F1A", "\u30B7\u5354\u4F1A"],
    ["\u30BB\u30F3\u30AF\u5354\u4F1A", "\u30BB\u30F3\u30AF\u5354\u4F1A"],
    ["\u30EA\u30A6\u5354\u4F1A", "\u30EA\u30A6\u5354\u4F1A"],
    ["\u30BB\u30D6\u30F3\u5354\u4F1A", "\u30BB\u30D6\u30F3\u5354\u4F1A"],
    ["\u30C2\u30A7\u30FC\u30F4\u30A3\u30C1", "\u30C2\u30A7\u30FC\u30F4\u30A3\u30C1\u5354\u4F1A"],
    ["\u30C7\u30A3\u30A8\u30FC\u30C1", "\u30C7\u30A3\u30A8\u30FC\u30C1\u5354\u4F1A"],
    ["\u30A6\u30FC\u30D5\u30A3", "\u30A6\u30FC\u30D5\u30A3\u5354\u4F1A"],
    ["\u30D0\u30E9\u306E\u30B9\u30D1\u30CA", "\u30D0\u30E9\u306E\u30B9\u30D1\u30CA\u5DE5\u623F"],
    ["\u30EF\u30B6\u30EA\u30F3\u30B0", "\u30EF\u30B6\u30EA\u30F3\u30B0\u30FB\u30CF\u30A4\u30C4"],
    ["\u30A8\u30C9\u30AC\u30FC", "\u30A8\u30C9\u30AC\u30FC\u5BB6"],
    ["\u30DE\u30EB\u30C1\u30AF\u30E9\u30C3\u30AF", "\u30DE\u30EB\u30C1\u30AF\u30E9\u30C3\u30AF\u4E8B\u52D9\u6240"],
    ["\u7259\u72E9", "\u7259\u72E9\u4E8B\u52D9\u6240"],
    ["\u708E\u62F3", "\u708E\u62F3\u4E8B\u52D9\u6240"],
    ["\u920E", "\u920E\u4E8B\u52D9\u6240"],
    ["\u65E7G\u793E", "\u65E7G\u793E"],
    ["\u9ED2\u7363", "\u9ED2\u7363"],
    ["\u30B7\u30FC\u5BB6", "\u30B7\u30FC\u5BB6"],
    ["\u30B7\u30E5\u30A8\u5BB6", "\u30B7\u30E5\u30A8\u5BB6"],
    ["\u30EF\u30F3\u5BB6", "\u30EF\u30F3\u5BB6"],
    ["\u30B8\u30A2\u5BB6", "\u30B8\u30A2\u5BB6"],
    ["K\u793E", "K\u793E"],
    ["LCCB", "LCCB"],
    ["N\u793E", "N\u793E"],
    ["R\u793E", "R\u793E"],
    ["T\u793E", "T\u793E"],
    ["W\u793E", "W\u793E"],
    ["\u30ED\u30DC\u30C8\u30DF\u30FC", "\u30ED\u30DC\u30C8\u30DF\u30FCE.G.O\u7FA4"],
    ["LCE", "LCEE.G.O"],
    ["\u767D\u84EE", "\u767D\u84EE"],
    ["\u9244\u8155", "\u9244\u8155\u5144\u5F1F"],
    ["\u6E6F\u306E\u82B1", "\u6E6F\u306E\u82B1\u904B\u9001"],
    ["\u30B9\u30C8\u30EC\u30F3\u30B0\u30B9", "\u30B9\u30C8\u30EC\u30F3\u30B0\u30B9"],
    ["\u68D2\u6D3E", "\u68D2\u6D3E"],
    ["\u30AC\u30E9\u30B9\u306E\u9774", "\u30AC\u30E9\u30B9\u306E\u9774\u56E3"],
    ["\u30F4\u30A3\u30EA\u30FC\u30D6", "\u30F4\u30A3\u30EA\u30FC\u30D6\u5DE5\u623F"],
    ["\u30B8\u30E3\u30FC\u30DE", "\u30B8\u30E3\u30FC\u30DE\u5DE5\u623F"],
    ["\u7B2C\u56DB\u9280\u5DE5\u623F", "\u7B2C\u56DB\u9280\u5DE5\u623F"],
    ["\u30E1\u30EA\u30A2\u30CB\u30A2", "\u30E1\u30EA\u30A2\u30CB\u30A2\u5DE5\u623F"],
    ["\u30E1\u30E1\u30E1\u30E1\u30E1", "\u30E1\u30E1\u30E1\u30E1\u30E1\u5DE5\u623F"],
    ["\u30C0\u30F3\u30C0\u30C0\u30C0\u30C0", "\u30C0\u30F3\u30C0\u30C0\u30C0\u30C0\u5DE5\u623F"],
    ["\u91DD\u91D1", "\u91DD\u91D1\u5DE5\u623F"],
    ["\u30DC\u30EB\u30C8\u30C3\u30C8", "\u30DC\u30EB\u30C8\u30C3\u30C8\u5DE5\u623F"],
    ["\u30DE\u30C3\u30C1\u30ED\u30C3\u30AF", "\u30DE\u30C3\u30C1\u30ED\u30C3\u30AF\u5DE5\u623F"],
    ["\u30AB\u30EB\u30DC\u30CA\u30FC\u30E9", "\u30AB\u30EB\u30DC\u30CA\u30FC\u30E9\u5DE5\u623F"],
    ["\u7B1B\u5439\u304D", "\u7B1B\u5439\u304D\u306E\u97F3\u697D\u968A"],
    ["\u30C7\u30A3\u30A2\u30DE\u30F3", "\u30C7\u30A3\u30A2\u30DE\u30F3\u30FB\u30CE\u30EF\u30FC\u30EB"],
    ["\u30AF\u4E8B\u52D9\u6240", "\u30AF\u4E8B\u52D9\u6240"],
    ["\u9B3C\u9580", "\u9B3C\u9580\u4E8B\u52D9\u6240"],
    ["\u89E6\u8155", "\u89E6\u8155\u4E8B\u52D9\u6240"],
    ["\u30E9\u30FB\u30DE\u30F3\u30C1\u30E3", "\u30E9\u30FB\u30DE\u30F3\u30C1\u30E3\u30E9\u30F3\u30C9"],
    ["\u30ED\u30B8\u30C3\u30AF", "\u30ED\u30B8\u30C3\u30AF\u30FB\u30A2\u30C8\u30EA\u30A8"],
    ["\u30CB\u30C8\u30ED", "\u30CB\u30C8\u30ED\u7814\u7A76\u6240"],
    ["\u7FA4\u308C\u305F\u30CF\u30A4\u30A8\u30CA", "\u7FA4\u308C\u305F\u30CF\u30A4\u30A8\u30CA"],
    ["\u5965\u6B6F", "\u5965\u6B6F\u4E8B\u52D9\u6240"],
    ["\u7D42\u6B62\u7B26", "\u7D42\u6B62\u7B26\u4E8B\u52D9\u6240"],
    ["\u591C\u660E", "\u591C\u660E\u4E8B\u52D9\u6240"],
    ["\u958B\u82B1", "\u958B\u82B1E.G.O"]
  ];
  for (const [k, label] of rules) {
    if (name.includes(k)) return label;
  }
  return "\u305D\u306E\u4ED6";
}
function decoratePersona(p) {
  if (!p.__aff) p.__aff = inferAffiliation(p.name);
  return p;
}
function getPrimarySin(p) {
  const counts = {};
  (p.skills || []).forEach((sk) => {
    if (sk.sin && sk.sin !== "\u7279\u6B8A") counts[sk.sin] = (counts[sk.sin] || 0) + 1;
  });
  let best = null, bestC = 0;
  for (const [s, c] of Object.entries(counts)) {
    if (c > bestC) {
      bestC = c;
      best = s;
    }
  }
  return best;
}
const PersonaCard = ({ persona, mode, isEquipped, isActive, isFav, onSelect, onToggleFav, onEquip }) => {
  const p = decoratePersona(persona);
  const kws = orderPersonaKeywordDisplay(p.keywords).slice(0, 3);
  const primarySin = getPrimarySin(p);
  return /* @__PURE__ */ React.createElement(
    "div",
    {
      className: `p-card${isActive ? " is-active" : ""}${isEquipped ? " is-equipped" : ""}`,
      "data-mode": mode,
      "data-persona-key": `${mode}:${p.no}`,
      style: { "--sin-primary": primarySin ? `var(--sin-${primarySin})` : "var(--gold)" },
      onClick: () => onSelect(p),
      role: "button",
      tabIndex: 0
    },
    /* @__PURE__ */ React.createElement("div", { className: "p-card-head" }, /* @__PURE__ */ React.createElement("span", { className: "p-num" }, "No.", String(p.no).padStart(3, "0")), typeof personaHasIssue === "function" && personaHasIssue(p) && /* @__PURE__ */ React.createElement("span", { title: "\u3053\u306E\u30AB\u30FC\u30C9\u306B\u306F\u7834\u640D\u7591\u3044\u306E\u7B87\u6240\u304C\u3042\u308A\u307E\u3059", style: { fontSize: 10, color: "var(--warn)", padding: "0 4px", lineHeight: 1 } }, "\u26A0"), /* @__PURE__ */ React.createElement("div", { className: "grow" }), /* @__PURE__ */ React.createElement(
      "button",
      {
        className: `p-fav${isFav ? " is-fav" : ""}`,
        onClick: (e) => {
          e.stopPropagation();
          onToggleFav(mode, p.no);
        },
        title: isFav ? "\u304A\u6C17\u306B\u5165\u308A\u89E3\u9664" : "\u304A\u6C17\u306B\u5165\u308A\u8FFD\u52A0",
        type: "button"
      },
      /* @__PURE__ */ React.createElement(Icon, { name: "star", size: 14 })
    )),
    /* @__PURE__ */ React.createElement("div", { className: "p-name" }, p.name),
    /* @__PURE__ */ React.createElement("div", { className: "p-stats" }, /* @__PURE__ */ React.createElement("div", { className: "p-stat" }, /* @__PURE__ */ React.createElement("span", { className: "p-stat-label" }, "HP"), /* @__PURE__ */ React.createElement("span", { className: "p-stat-value" }, p.hp)), /* @__PURE__ */ React.createElement("div", { className: "p-stat" }, /* @__PURE__ */ React.createElement("span", { className: "p-stat-label" }, "SAN"), /* @__PURE__ */ React.createElement("span", { className: "p-stat-value" }, p.san)), /* @__PURE__ */ React.createElement("div", { className: "p-stat" }, /* @__PURE__ */ React.createElement("span", { className: "p-stat-label" }, "SPD"), /* @__PURE__ */ React.createElement("span", { className: "p-stat-value" }, p.speed))),
    /* @__PURE__ */ React.createElement(ResRow, { s: p.res_slash, p: p.res_pierce, b: p.res_blunt }),
    /* @__PURE__ */ React.createElement(PersonaSinPills, { skills: p.skills }),
    kws.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "p-kw-row" }, kws.map((k) => /* @__PURE__ */ React.createElement("span", { key: k, className: "p-kw" }, k)))
  );
};
const PersonaDetail = ({ persona, mode, isEquipped, onEquip, onUnequip, onAddRoster, isInRoster, onReturnToList, embed, onOpenDraft }) => {
  if (!persona && onOpenDraft) {
    return /* @__PURE__ */ React.createElement("div", { className: "codex-detail" }, /* @__PURE__ */ React.createElement("div", { className: "detail-empty" }, /* @__PURE__ */ React.createElement("div", { className: "detail-empty-icon" }, "◈"), /* @__PURE__ */ React.createElement("div", { className: "t-label" }, "人格を選択 または テキスト流し込み反映"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-11)", color: "var(--tx-mute)", marginTop: 8 } }, "完成した人格データを流し込み、確認してからカスタム人格または同期人格として反映できます。"), /* @__PURE__ */ React.createElement("button", { className: "persona-draft-import-trigger persona-draft-import-trigger--empty", type: "button", onClick: onOpenDraft }, "テキスト流し込み反映")));
  }
  if (!persona) {
    return /* @__PURE__ */ React.createElement("div", { className: "codex-detail" }, /* @__PURE__ */ React.createElement("div", { className: "detail-empty" }, /* @__PURE__ */ React.createElement("div", { className: "detail-empty-icon" }, "\u25C8"), /* @__PURE__ */ React.createElement("div", { className: "t-label" }, "\u5DE6\u306E\u30AB\u30FC\u30C9\u3092\u9078\u629E"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-11)", color: "var(--tx-mute)", marginTop: 8 } }, "\u4EBA\u683C\u3092\u9078\u629E\u3059\u308B\u3068\u8A73\u7D30\u304C\u8868\u793A\u3055\u308C\u307E\u3059\u3002", /* @__PURE__ */ React.createElement("br", null), "\u30C0\u30D6\u30EB\u30AF\u30EA\u30C3\u30AF\u3067\u88C5\u5099\u3002")));
  }
  const p = persona;
  const primarySin = getPrimarySin(p);
  const kws = orderPersonaKeywordDisplay(p.keywords);
  return /* @__PURE__ */ React.createElement("div", { id: !embed ? "persona-selected-detail" : void 0, className: `codex-detail${embed ? " is-embedded" : ""}`, style: { "--sin-primary": primarySin ? `var(--sin-${primarySin})` : "var(--gold)" } }, !embed && onReturnToList && /* @__PURE__ */ React.createElement("div", { className: "persona-detail-return" }, /* @__PURE__ */ React.createElement(Button, { variant: "ghost", size: "sm", icon: "arrowU", onClick: onReturnToList, title: "選択した人格カードの位置へ戻る" }, "一覧へ戻る")), !embed && /* @__PURE__ */ React.createElement("div", { className: "detail-head" }, /* @__PURE__ */ React.createElement("div", { className: "detail-eyebrow" }, /* @__PURE__ */ React.createElement("span", { className: "detail-num" }, "No.", String(p.no).padStart(3, "0")), /* @__PURE__ */ React.createElement("span", { className: "detail-type" }, mode === "n" ? "\u901A\u5E38\u4EBA\u683C / NORMAL" : "\u7279\u7570\u4EBA\u683C / SPECIAL")), /* @__PURE__ */ React.createElement("div", { className: "detail-name" }, p.name), /* @__PURE__ */ React.createElement("div", { style: { marginBottom: "var(--s-3)" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-10)", color: "var(--tx-mute)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 4 } }, "\u6240\u5C5E"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-12)", color: "var(--tx-2)" } }, decoratePersona(p).__aff)), /* @__PURE__ */ React.createElement("div", { className: "detail-stats" }, /* @__PURE__ */ React.createElement("div", { className: "detail-stat" }, /* @__PURE__ */ React.createElement("span", { className: "detail-stat-label" }, "HP"), /* @__PURE__ */ React.createElement("span", { className: "detail-stat-value" }, p.hp)), /* @__PURE__ */ React.createElement("div", { className: "detail-stat" }, /* @__PURE__ */ React.createElement("span", { className: "detail-stat-label" }, "SAN"), /* @__PURE__ */ React.createElement("span", { className: "detail-stat-value" }, p.san)), /* @__PURE__ */ React.createElement("div", { className: "detail-stat" }, /* @__PURE__ */ React.createElement("span", { className: "detail-stat-label" }, "\u901F\u5EA6"), /* @__PURE__ */ React.createElement("span", { className: "detail-stat-value" }, p.speed)), /* @__PURE__ */ React.createElement("div", { className: "detail-stat" }, /* @__PURE__ */ React.createElement("span", { className: "detail-stat-label" }, "\u5F3E\u4E38"), /* @__PURE__ */ React.createElement("span", { className: "detail-stat-value" }, p.bullets || "\xD7")))), /* @__PURE__ */ React.createElement("div", { className: "detail-body" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "detail-section-title" }, "\u8010\u6027 / RESISTANCE"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "var(--s-3)", flexWrap: "wrap", padding: "8px 0 12px", alignItems: "center" } }, /* @__PURE__ */ React.createElement(ResRow, { s: p.res_slash, p: p.res_pierce, b: p.res_blunt, showLabels: true }))), !embed && kws.length > 0 && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "detail-section-title" }, "\u30AD\u30FC\u30EF\u30FC\u30C9 / KEYWORDS"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 6, flexWrap: "wrap" } }, kws.map((k) => /* @__PURE__ */ React.createElement("span", { key: k, className: "chip is-sm" }, k)))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "detail-section-title" }, "\u30D1\u30C3\u30B7\u30D6 / PASSIVE"), /* @__PURE__ */ React.createElement("div", { className: "detail-passive" }, /* @__PURE__ */ React.createElement("div", { className: "detail-passive-name" }, p.passive_name || "\uFF08\u306A\u3057\uFF09"), /* @__PURE__ */ React.createElement("div", { className: "detail-passive-cond cond-chips-lg", style: { display: "flex", alignItems: "center", gap: 6 } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: "var(--fs-10)", color: "var(--tx-mute)" } }, "\u767A\u52D5\u6761\u4EF6"), /* @__PURE__ */ React.createElement(CondChips, { cond: p.passive_cond || "\u306A\u3057" })), p.passive_always && /* @__PURE__ */ React.createElement("div", { className: "detail-passive-effect", style: { marginBottom: 6, color: "var(--tx-dim)" } }, /* @__PURE__ */ React.createElement("b", { style: { color: "var(--gold)", fontFamily: "var(--f-display)", fontSize: 10, letterSpacing: "0.14em" } }, "\u5E38\u6642\uFF1A"), p.passive_always), /* @__PURE__ */ React.createElement("div", { className: "detail-passive-effect" }, p.passive_effect))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "detail-section-title" }, "\u6226\u8853\u30B9\u30AD\u30EB / SKILLS"), /* @__PURE__ */ React.createElement("div", { className: "detail-skills" }, (p.skills || []).map((sk, i) => /* @__PURE__ */ React.createElement("div", { key: i, className: "detail-skill", "data-sin": sk.sin, style: { flexDirection: "column", alignItems: "stretch" } },
        /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "baseline", gap: 8 } },
          /* @__PURE__ */ React.createElement("span", { className: "detail-skill-rank" }, "S", (sk.rank || "").replace(/[^0-9-]/g, "") || i),
          /* @__PURE__ */ React.createElement("span", { className: "detail-skill-name" }, sk.name),
          /* @__PURE__ */ React.createElement("span", { className: "detail-skill-type" }, sk.type)),
        // V15: 具体効果テキストを反映
        sk.effect ? /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-11)", color: "var(--tx-2)", lineHeight: 1.55, marginTop: 4, whiteSpace: "pre-wrap", paddingLeft: 2 } }, sk.effect) : null,
        // V15: ダイスを反映
        (sk.dice || []).length > 0 ? /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 2, marginTop: 4 } }, (sk.dice || []).map((d, di) => /* @__PURE__ */ React.createElement("div", { key: di, style: { display: "flex", gap: 8, fontSize: "var(--fs-10)", fontFamily: "var(--f-mono)", color: "var(--gold-hi)" } }, /* @__PURE__ */ React.createElement("span", { style: { minWidth: 52, fontWeight: 600 } }, d.roll || ""), d.effect ? /* @__PURE__ */ React.createElement("span", { style: { color: "var(--tx-dim)", fontFamily: "var(--f-body)", whiteSpace: "pre-wrap" } }, d.effect) : null))) : null
      )))), (p.unique_buffs || []).length > 0 ? /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "detail-section-title", style: { color: "var(--gold-hi)", display: "flex", alignItems: "center", gap: 6 } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 14 } }, "\u25C6"), /* @__PURE__ */ React.createElement("span", null, "\u56FA\u6709\u30D0\u30D5 / UNIQUE"), /* @__PURE__ */ React.createElement("span", { style: { marginLeft: "auto", fontFamily: "var(--f-mono)", fontSize: 9, color: "var(--tx-mute)", letterSpacing: "0.06em" } }, p.unique_buffs.length, "\u4EF6")), /* @__PURE__ */ React.createElement("div", { className: "stack-2", style: { padding: "8px", background: "var(--gold-tint)", border: "1px solid var(--gold-line)", borderRadius: "var(--r)" } }, p.unique_buffs.map((b, i) => /* @__PURE__ */ React.createElement("div", { key: i, style: { padding: "6px 10px", background: "var(--surface-inset)", borderRadius: "var(--r)", border: "1px solid var(--line-dim)" } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--f-display)", fontWeight: 600, fontSize: "var(--fs-12)", color: "var(--tx)" } }, b.name, " ", /* @__PURE__ */ React.createElement("span", { style: { fontSize: "var(--fs-10)", color: "var(--tx-dim)", fontWeight: 400 } }, "(", b.type, " / \u6700\u5927", b.max || "\u221E", ")")), b.desc && /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-11)", color: "var(--tx-2)", marginTop: 4, lineHeight: 1.5, whiteSpace: "pre-wrap" } }, b.desc)))), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-10)", color: "var(--tx-mute)", marginTop: 6, lineHeight: 1.4, fontStyle: "italic" } }, "\u88C5\u5099\u3059\u308B\u3068 ", /* @__PURE__ */ React.createElement("b", { style: { color: "var(--gold)" } }, "\u30D1\u30C3\u30B7\u30D6"), " \u30DA\u30FC\u30B8\u306E\u300C\u56FA\u6709\u30D0\u30D5\u30FB\u30B9\u30C6\u30FC\u30BF\u30B9\u300D\u306B\u81EA\u52D5\u8FFD\u52A0\u3055\u308C\u307E\u3059")) : /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "detail-section-title", style: { color: "var(--tx-mute)" } }, "\u56FA\u6709\u30D0\u30D5 / UNIQUE"), /* @__PURE__ */ React.createElement("div", { style: { padding: "8px 10px", fontSize: "var(--fs-11)", color: "var(--tx-mute)", fontStyle: "italic", background: "var(--surface-inset)", border: "1px dashed var(--line-dim)", borderRadius: "var(--r)" } }, "\u3053\u306E\u4EBA\u683C\u306B\u56FA\u6709\u30D0\u30D5\u306FDB\u767B\u9332\u3055\u308C\u3066\u3044\u307E\u305B\u3093\u3002", /* @__PURE__ */ React.createElement("br", null), "\u5FC5\u8981\u306A\u5834\u5408\u306F\u88C5\u5099\u5F8C\u3001", /* @__PURE__ */ React.createElement("b", { style: { color: "var(--tx-dim)" } }, "\u30D1\u30C3\u30B7\u30D6"), " \u30DA\u30FC\u30B8\u304B\u3089\u624B\u52D5\u8FFD\u52A0\u3067\u304D\u307E\u3059\u3002"))), !embed && /* @__PURE__ */ React.createElement("div", { className: "detail-actions" }, isEquipped ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-10)", color: "var(--gold)", textAlign: "center", fontFamily: "var(--f-display)", letterSpacing: "0.2em", textTransform: "uppercase" } }, "\u2605 \u73FE\u5728\u88C5\u5099\u4E2D"), /* @__PURE__ */ React.createElement(Button, { variant: "ghost", size: "sm", onClick: onUnequip, icon: "x" }, "\u88C5\u5099\u89E3\u9664")) : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(Button, { variant: "primary", onClick: onEquip, icon: "check" }, "\u88C5\u5099\u3059\u308B"), !isInRoster && /* @__PURE__ */ React.createElement(Button, { variant: "ghost", size: "sm", onClick: onAddRoster, icon: "plus" }, "\u6240\u6301\u30EA\u30B9\u30C8\u306E\u307F\u3078\u8FFD\u52A0"))));
};

function stablePersonaDiffValue(value) {
  return JSON.stringify(value == null ? null : value);
}
function compactSkillsForPersonaDiff(skills) {
  return (skills || []).map((sk, index) => ({
    rank: sk.rank || `スキル${index}`,
    derived_from: sk.derived_from || "",
    derived_index: sk.derived_index ?? null,
    derived_condition: sk.derived_condition || "",
    type: sk.type || "",
    sin: sk.sin || "",
    aoe: sk.aoe || "",
    aoeCount: sk.aoeCount || "",
    name: sk.name || "",
    effect: sk.effect || "",
    dice: (sk.dice || []).map((d) => ({ roll: d.roll || "", effect: d.effect || "" }))
  }));
}
function compactUniqueForPersonaDiff(items) {
  return (items || []).map((item) => ({
    name: item.name || "",
    type: item.type || "バフ",
    initial: item.initial ?? 0,
    max: item.max ?? 20,
    desc: item.desc || "",
    place: item.place || "status"
  }));
}
function getPersonaDetachChanges(state) {
  const src = state.personaSrc || {};
  const saved = (state.roster?.personas || []).find((entry) => entry.mode === state.personaMode && entry.no === state.personaNo)?.build;
  const current = {
    stats: [state.hp, state.san, state.speed, state.bullets, state.resS, state.resP, state.resB],
    passive: state.pas || {},
    skills: compactSkillsForPersonaDiff(state.skills),
    unique: compactUniqueForPersonaDiff(state.uniqueBuffs),
    spirit: [state.spirit, state.spiritMorale, state.spiritConfuse, state.spiritAlways],
    supports: [state.supports || [], state.deathSupport || null],
    egos: state.egoSlots || {},
    enhancements: state.enhancements || [],
    formulas: [state.formulas || [], state.customStatuses || [], state.defaultStatuses || null]
  };
  const baseline = saved ? {
    stats: [saved.hp, saved.san, saved.speed, saved.bullets, saved.resS, saved.resP, saved.resB],
    passive: saved.pas || {},
    skills: compactSkillsForPersonaDiff(saved.skills),
    unique: compactUniqueForPersonaDiff(saved.uniqueBuffs),
    spirit: [saved.spirit, saved.spiritMorale, saved.spiritConfuse, saved.spiritAlways],
    supports: [saved.supports || [], saved.deathSupport || null],
    egos: saved.egoSlots || {},
    enhancements: saved.enhancements || [],
    formulas: [saved.formulas || [], saved.customStatuses || [], saved.defaultStatuses || null]
  } : {
    stats: [String(src.hp || ""), String(src.san || ""), src.speed || "", src.bullets || "×", src.res_slash || "普通", src.res_pierce || "普通", src.res_blunt || "普通"],
    passive: { name: src.passive_name || "", cond: src.passive_cond || "", always: src.passive_always || "", effect: src.passive_effect || "", quick: "" },
    skills: compactSkillsForPersonaDiff(src.skills),
    unique: compactUniqueForPersonaDiff(src.unique_buffs),
    spirit: ["", "", "", ""],
    supports: [[], null],
    egos: { ZAYIN: null, TETH: null, HE: null, WAW: null, ALEPH: null },
    enhancements: [],
    formulas: [[], [], null]
  };
  const labels = {
    stats: "基礎ステータス・耐性",
    passive: "人格パッシブ",
    skills: "戦術スキル",
    unique: "固有バフ・固有ステータス",
    spirit: "精神",
    supports: "サポートパッシブ",
    egos: "E.G.O装備・解析内容",
    enhancements: "強化",
    formulas: "式・追加ステータス"
  };
  return Object.keys(labels).filter((key) => stablePersonaDiffValue(current[key]) !== stablePersonaDiffValue(baseline[key])).map((key) => labels[key]);
}

function requestPersonaUnequip(state, dispatch, afterUnequip) {
  const changes = getPersonaDetachChanges(state);
  if (changes.length) {
    const message = [
      "この人格に紐づく変更があります。",
      "",
      "変更箇所：",
      ...changes.map((label) => `・${label}`),
      "",
      "OK：変更を所持人格へ保存して装備解除",
      "キャンセル：装備を継続（変更はそのまま）"
    ].join("\n");
    if (!window.confirm(message)) return false;
    dispatch({ type: "SAVE_PERSONA_BUILD" });
    dispatch({ type: "UNEQUIP_PERSONA" });
    afterUnequip?.();
    toast("変更を所持人格へ保存して装備解除しました");
    return true;
  }
  dispatch({ type: "UNEQUIP_PERSONA" });
  afterUnequip?.();
  toast("装備を解除");
  return true;
}

const EquippedSummary = ({ state, dispatch, onExpand, onShowDetail, detailShown, syncMaxControl }) => {
  // T35/T36: 所持人格エントリに保存済みビルドがあるか（Modified 状態の有無）
  const hasSavedBuild = !!state.roster?.personas?.some((r) => r.mode === state.personaMode && r.no === state.personaNo && r.build);
  const p = state.personaSrc;
  if (!p) return null;
  const primarySin = getPrimarySin(p);
  const isCustom = state.personaMode === "custom" || p.__custom;
  const isSynced = state.syncedManual;
  const isSavedCustom = isCustom && p.__saved;
  const editable = isSynced || isCustom && !isSavedCustom;
  const patchMeta = (patch) => dispatch({ type: "PATCH_PERSONA_META", patch });
  const rosterEntry = (state.roster?.personas || []).find((persona) => persona.mode === state.personaMode && String(persona.no) === String(state.personaNo));
  const displayPersonaName = rosterEntry?.syncMax && !/\s*\[MAX\]\s*$/i.test(p.name || "") ? `${p.name || ""} [MAX]` : p.name;
  return /* @__PURE__ */ React.createElement("div", { className: "equipped-summary", style: { "--sin-primary": primarySin ? `var(--sin-${primarySin})` : "var(--gold)" } }, /* @__PURE__ */ React.createElement("div", { className: "es-head" }, /* @__PURE__ */ React.createElement("div", { className: "es-eyebrow" }, /* @__PURE__ */ React.createElement("span", { className: "es-label" }, "\u73FE\u5728\u88C5\u5099\u4E2D"), editable ? /* @__PURE__ */ React.createElement(
    "select",
    {
      className: "es-mode-select",
      value: state.personaMode || "custom",
      onChange: (e) => patchMeta({ personaMode: e.target.value }),
      title: "\u88C5\u5099\u5206\u985E\u3092\u5909\u66F4"
    },
    /* @__PURE__ */ React.createElement("option", { value: "n" }, "NORMAL / \u901A\u5E38"),
    /* @__PURE__ */ React.createElement("option", { value: "t" }, "SPECIAL / \u7279\u7570"),
    /* @__PURE__ */ React.createElement("option", { value: "custom" }, "CUSTOM / \u5275\u4F5C")
  ) : isCustom ? /* @__PURE__ */ React.createElement("span", { className: "es-mode" }, "CUSTOM / \u5275\u4F5C") : /* @__PURE__ */ React.createElement("span", { className: "es-mode" }, state.personaMode === "n" ? "NORMAL / \u901A\u5E38" : "SPECIAL / \u7279\u7570"), editable ? /* @__PURE__ */ React.createElement(
    "input",
    {
      className: "es-num-input",
      type: "text",
      value: typeof p.no === "number" ? String(p.no).padStart(3, "0") : String(p.no || "").replace(/^No\.?/, ""),
      onChange: (e) => {
        const v = e.target.value.trim();
        const n = parseInt(v.replace(/\D/g, ""), 10);
        patchMeta({ src: { no: isNaN(n) ? v : n } });
      },
      title: "No. \u3092\u5909\u66F4",
      placeholder: "No."
    }
  ) : !isCustom && /* @__PURE__ */ React.createElement("span", { className: "es-num" }, "No.", String(p.no).padStart(3, "0")), isSynced && /* @__PURE__ */ React.createElement("span", { className: "es-badge-sync" }, "\u25C8 \u540C\u671F\u5316\uFF1A\u624B\u52D5\u7DE8\u96C6\u30E2\u30FC\u30C9")), editable ? /* @__PURE__ */ React.createElement(
    "input",
    {
      className: "es-name-input",
      value: p.name || "",
      onChange: (e) => patchMeta({ src: { name: e.target.value } }),
      placeholder: "\u4EBA\u683C\u540D\uFF08\u540C\u671F\u5316\u30FB\u30AB\u30B9\u30BF\u30E0\u3067\u306E\u307F\u7DE8\u96C6\u53EF\uFF09",
      title: "\u4EBA\u683C\u540D\u3092\u7DE8\u96C6"
    }
  ) : /* @__PURE__ */ React.createElement("div", { className: "es-name" }, displayPersonaName)), /* @__PURE__ */ React.createElement("div", { className: "es-body" }, /* @__PURE__ */ React.createElement("div", { className: "es-stats" }, /* @__PURE__ */ React.createElement("div", { className: "es-stat" }, /* @__PURE__ */ React.createElement("span", { className: "es-stat-label" }, "HP"), editable ? /* @__PURE__ */ React.createElement(
    "input",
    {
      className: "es-stat-input",
      type: "number",
      value: state.hp ?? p.hp,
      onChange: (e) => dispatch({ type: "SET_FIELD", field: "hp", value: e.target.value }),
      title: "HP\uFF08\u7DE8\u96C6\u30E2\u30FC\u30C9\uFF09"
    }
  ) : /* @__PURE__ */ React.createElement("span", { className: "es-stat-value" }, state.hp ?? p.hp)), /* @__PURE__ */ React.createElement("div", { className: "es-stat" }, /* @__PURE__ */ React.createElement("span", { className: "es-stat-label" }, "SAN"), editable ? /* @__PURE__ */ React.createElement(
    "input",
    {
      className: "es-stat-input",
      type: "number",
      value: state.san ?? p.san,
      onChange: (e) => dispatch({ type: "SET_FIELD", field: "san", value: e.target.value }),
      title: "SAN\uFF08\u7DE8\u96C6\u30E2\u30FC\u30C9\uFF09"
    }
  ) : /* @__PURE__ */ React.createElement("span", { className: "es-stat-value" }, state.san ?? p.san)), /* @__PURE__ */ React.createElement("div", { className: "es-stat" }, /* @__PURE__ */ React.createElement("span", { className: "es-stat-label" }, "\u901F\u5EA6"), editable ? /* @__PURE__ */ React.createElement(
    "input",
    {
      className: "es-stat-input",
      value: state.speed ?? p.speed,
      onChange: (e) => dispatch({ type: "SET_FIELD", field: "speed", value: e.target.value }),
      title: "\u901F\u5EA6\uFF08\u7DE8\u96C6\u30E2\u30FC\u30C9\uFF09"
    }
  ) : /* @__PURE__ */ React.createElement("span", { className: "es-stat-value" }, state.speed ?? p.speed)), /* @__PURE__ */ React.createElement("div", { className: "es-stat" }, /* @__PURE__ */ React.createElement("span", { className: "es-stat-label" }, "\u5F3E\u4E38"), editable ? /* @__PURE__ */ React.createElement(
    "input",
    {
      className: "es-stat-input",
      value: state.bullets || p.bullets || "\xD7",
      onChange: (e) => dispatch({ type: "SET_FIELD", field: "bullets", value: e.target.value }),
      title: "\u5F3E\u4E38\uFF08\u7DE8\u96C6\u30E2\u30FC\u30C9\uFF09"
    }
  ) : /* @__PURE__ */ React.createElement("span", { className: "es-stat-value" }, state.bullets || p.bullets || "\xD7")), /* @__PURE__ */ React.createElement("div", { className: "es-stat" }, /* @__PURE__ */ React.createElement("span", { className: "es-stat-label" }, "\u30E9\u30F3\u30AF"), editable ? /* @__PURE__ */ React.createElement(
    "select",
    {
      className: "es-stat-input",
      value: (state.roster.personas.find((r) => r.mode === state.personaMode && r.no === state.personaNo) || {}).syncRank || "",
      onChange: (e) => {
        const uid = (state.roster.personas.find((r) => r.mode === state.personaMode && r.no === state.personaNo) || {}).uid;
        if (uid) dispatch({ type: "PATCH_ROSTER", uid, patch: { syncRank: e.target.value || null } });
        else toast("\u88C5\u5099\u4E2D\u4EBA\u683C\u304C\u6240\u6301\u30EA\u30B9\u30C8\u306B\u3042\u308A\u307E\u305B\u3093");
      },
      title: "\u540C\u671F\u5316\u30E9\u30F3\u30AF\uFF08\u306A\u3057/0/00/000\uFF09"
    },
    /* @__PURE__ */ React.createElement("option", { value: "" }, "\u306A\u3057"),
    /* @__PURE__ */ React.createElement("option", { value: "0" }, "\u540C\u671F0"),
    /* @__PURE__ */ React.createElement("option", { value: "00" }, "\u540C\u671F00"),
    /* @__PURE__ */ React.createElement("option", { value: "000" }, "\u540C\u671F000")
  ) : /* @__PURE__ */ React.createElement("span", { className: "es-stat-value" }, (state.roster.personas.find((r) => r.mode === state.personaMode && r.no === state.personaNo) || {}).syncRank || "\u2014"))), syncMaxControl, /* @__PURE__ */ React.createElement("section", { className: "es-resistance", role: "group", "aria-label": "耐性" }, /* @__PURE__ */ React.createElement("div", { className: "es-resistance-heading" }, "耐性"), /* @__PURE__ */ React.createElement("div", { className: "es-resistance-grid" }, ["resS", "resP", "resB"].map((field, i) => {
      const label = ["斬撃", "貫通", "打撃"][i];
      const srcKey = ["res_slash", "res_pierce", "res_blunt"][i];
      const cur = state[field] ?? p[srcKey] ?? "普通";
      return /* @__PURE__ */ React.createElement("div", { key: field, className: "es-resistance-cell", "data-res": cur }, /* @__PURE__ */ React.createElement("span", { className: "es-resistance-label" }, label), editable ? /* @__PURE__ */ React.createElement(
        "select",
        {
          className: "es-resistance-select",
          value: cur,
          onChange: (e) => dispatch({ type: "SET_FIELD", field, value: e.target.value }),
          title: label + "耐性（編集モード）",
          "aria-label": label + "耐性"
        },
        ["普通", "脆弱", "弱点", "抵抗", "耐性", "免疫"].map((r) => /* @__PURE__ */ React.createElement("option", { key: r, value: r }, r))
      ) : /* @__PURE__ */ React.createElement("span", { className: "es-resistance-value" }, cur));
    }))), /* @__PURE__ */ React.createElement("div", { className: "es-keywords" }, /* @__PURE__ */ React.createElement("span", { className: "es-stat-label", style: { alignSelf: "center" } }, "\u30AD\u30FC\u30EF\u30FC\u30C9"), orderPersonaKeywordDisplay(state.personaSrc?.keywords).map((k) => /* @__PURE__ */ React.createElement("span", { key: k, className: "es-kw-tag" }, k, editable && /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "es-kw-rm",
      title: "\u3053\u306E\u30AD\u30FC\u30EF\u30FC\u30C9\u3092\u524A\u9664",
      onClick: () => {
        const sourceKeywords = state.personaSrc.keywords || [];
        const targetIndex = sourceKeywords.indexOf(k);
        const next = sourceKeywords.filter((_, j) => j !== targetIndex);
        patchMeta({ src: { keywords: next } });
      }
    },
    "\xD7"
  ))), editable && /* @__PURE__ */ React.createElement("span", { className: "es-kw-addrow" }, /* @__PURE__ */ React.createElement(
    "select",
    {
      className: "es-kw-select",
      value: "",
      title: "\u65E2\u5B58\u30AD\u30FC\u30EF\u30FC\u30C9\u304B\u3089\u9078\u629E\u3057\u3066\u8FFD\u52A0",
      onChange: (e) => {
        const v = e.target.value;
        if (!v) return;
        const cur = state.personaSrc.keywords || [];
        if (cur.includes(v)) {
          toast("\u65E2\u306B\u5B58\u5728\u3057\u307E\u3059");
          return;
        }
        patchMeta({ src: { keywords: [...cur, v] } });
      }
    },
    /* @__PURE__ */ React.createElement("option", { value: "" }, "\uFF0B \u9078\u629E\u3057\u3066\u8FFD\u52A0\u2026"),
    // T33: ソート実験の残骸「爆発」「混乱」を候補から除去（DB 原文は非破壊）。
    // T34: ルール上の基本状態は、DB に未収録でも選択可能にする。
    // 変換・派生・属性限定の状態は候補を増やしすぎないよう含めない。
    orderPersonaKeywordOptions([...(window.DB?.normal_personas || []), ...(window.DB?.tokui_personas || [])].flatMap((pp) => pp.keywords || []).concat(PERSONA_FIXED_KEYWORD_OPTIONS))
      .filter((k) => !(state.personaSrc.keywords || []).includes(k))
      .map((k) => /* @__PURE__ */ React.createElement("option", { key: k, value: k }, k))
  ), /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "es-kw-add",
      title: "\u4EFB\u610F\u306E\u30AD\u30FC\u30EF\u30FC\u30C9\u3092\u624B\u5165\u529B\u3067\u8FFD\u52A0",
      onClick: () => {
        const v = prompt("\u8FFD\u52A0\u3059\u308B\u30AD\u30FC\u30EF\u30FC\u30C9\u3092\u5165\u529B\uFF08\u65E2\u5B58\u4E00\u89A7\u306B\u306A\u3044\u4EFB\u610F\u306E\u8A9E\uFF09:");
        if (!v || !v.trim()) return;
        const cur = state.personaSrc.keywords || [];
        if (cur.includes(v.trim())) {
          toast("\u65E2\u306B\u5B58\u5728\u3057\u307E\u3059");
          return;
        }
        patchMeta({ src: { keywords: [...cur, v.trim()] } });
      }
    },
    "\u624B\u5165\u529B"
  ))), /* @__PURE__ */ React.createElement("div", { className: "es-actions" }, /* @__PURE__ */ React.createElement(
    Button,
    {
      size: "sm",
      variant: detailShown ? "primary" : "ghost",
      icon: detailShown ? "x" : "eye",
      onClick: () => onShowDetail(!detailShown),
      title: detailShown ? "\u7C21\u6613\u307E\u3068\u3081\u3092\u9589\u3058\u308B" : "\u88C5\u5099\u4E2D\u306E\u52B9\u679C\u3092\u7C21\u6613\u307E\u3068\u3081\u8868\u793A\u3059\u308B\uFF08Codex\u3092\u958B\u304B\u306A\u304F\u3066\u3082\u898B\u3089\u308C\u308B\uFF09"
    },
    detailShown ? "\u7C21\u6613\u307E\u3068\u3081\u3092\u9589\u3058\u308B" : "\u7C21\u6613\u307E\u3068\u3081\u3092\u8868\u793A"
  ), isCustom && /* @__PURE__ */ React.createElement(
    Button,
    {
      size: "md",
      variant: "primary",
      className: "persona-save-primary",
      icon: "download",
      onClick: () => {
        dispatch({ type: "SAVE_CUSTOM_PERSONA" });
        toast(isSavedCustom ? "\u6240\u6301\u4EBA\u683C\u306E\u5185\u5BB9\u3092\u66F4\u65B0\u3057\u307E\u3057\u305F\uFF08\u88C5\u5099\u30E2\u30FC\u30C9\u3078\u79FB\u884C\uFF09" : "\u6240\u6301\u4EBA\u683C\u4E00\u89A7\u306B\u4FDD\u5B58\u3057\u307E\u3057\u305F\uFF08\u88C5\u5099\u30E2\u30FC\u30C9\u3078\u79FB\u884C\uFF09");
      },
      title: "\u73FE\u5728\u306E\u7DE8\u96C6\u5185\u5BB9\u3092\u6240\u6301\u4EBA\u683C\u4E00\u89A7\u306B\u767B\u9332\u3002\u4FDD\u5B58\u5F8C\u306F\u88C5\u5099\u30E2\u30FC\u30C9\uFF08\u8AAD\u53D6\u5C02\u7528\uFF09\u306B\u306A\u308A\u3001\u518D\u5EA6\u7DE8\u96C6\u3059\u308B\u306B\u306F\u300C\u25C8 \u540C\u671F\u5316\u3057\u3066\u624B\u52D5\u7DE8\u96C6\u300D\u3092\u4F7F\u7528"
    },
    isSavedCustom ? "\u6240\u6301\u4EBA\u683C\u306E\u4FDD\u5B58\u5185\u5BB9\u3092\u66F4\u65B0" : "\u3053\u306E\u4EBA\u683C\u3092\u6240\u6301\u306B\u4FDD\u5B58"
  ), /* @__PURE__ */ React.createElement(
    Button,
    {
      size: "sm",
      variant: isSynced ? "primary" : "ghost",
      icon: isSynced ? "check" : "edit",
      onClick: () => {
        if (isSynced) {
          // R18: 保存は解除時に必要な場合だけ選択する。編集終了は現在の作業状態を保持するだけ。
          dispatch({ type: "SET_SYNCED_MANUAL", value: false });
          toast("編集モードを終了しました。変更は装備解除時に保存を選べます");
        } else {
          dispatch({ type: "SET_SYNCED_MANUAL", value: true });
          toast(isSavedCustom ? "\u7DE8\u96C6\u30E2\u30FC\u30C9\uFF1A\u4FDD\u5B58\u6E08\u307F\u4EBA\u683C\u3092\u624B\u52D5\u7DE8\u96C6\u4E2D" : "\u540C\u671F\u5316\uFF1A\u5168\u9805\u76EE\u3092\u624B\u52D5\u7DE8\u96C6\u53EF\u80FD\u306B");
        }
      },
      title: isSynced ? "\u7DE8\u96C6\u30E2\u30FC\u30C9\u3092\u89E3\u9664" : "\u540C\u671F\u5316\uFF1A\u30B9\u30C6\u30FC\u30BF\u30B9\u30FB\u30D1\u30C3\u30B7\u30D6\u30FB\u30B9\u30AD\u30EB\u30FB\u56FA\u6709\u30D0\u30D5\u3092\u624B\u52D5\u3067\u66F8\u304D\u63DB\u3048\u53EF\u80FD\u306B\u3059\u308B"
    },
    isSynced ? "\u2713 \u7DE8\u96C6\u3092\u7D42\u4E86\uFF08\u5185\u5BB9\u306F\u4FDD\u6301\uFF09" : "\u25C8 \u540C\u671F\u5316\u3057\u3066\u624B\u52D5\u7DE8\u96C6"
  ), /* @__PURE__ */ React.createElement(
    Button,
    {
      size: "sm",
      variant: "ghost",
      icon: "x",
      onClick: () => requestPersonaUnequip(state, dispatch),
      title: "\u88C5\u5099\u3092\u89E3\u9664"
    },
    "\u88C5\u5099\u89E3\u9664"
  ), hasSavedBuild && /* @__PURE__ */ React.createElement(
    Button,
    {
      size: "sm",
      variant: "ghost",
      icon: "x",
      onClick: () => {
        if (!confirm("\u4FDD\u5B58\u3057\u305F\u30D3\u30EB\u30C9\u3092\u7834\u68C4\u3057\u307E\u3059\u304B\uFF1F\uFF08\u6B21\u56DE\u88C5\u5099\u6642\u306FDB\u65E2\u5B9A\u5024\u306B\u623B\u308A\u307E\u3059\u3002\u73FE\u5728\u306E\u7DE8\u96C6\u306F\u5909\u308F\u308A\u307E\u305B\u3093\uFF09")) return;
        dispatch({ type: "CLEAR_PERSONA_BUILD", key: `${state.personaMode}:${state.personaNo}` });
        toast("\u4FDD\u5B58\u30D3\u30EB\u30C9\u3092\u7834\u68C4\u3057\u307E\u3057\u305F");
      },
      title: "\u4FDD\u5B58\u30D3\u30EB\u30C9\u3092\u7834\u68C4\u3057\u3066DB\u65E2\u5B9A\u306B\u623B\u3059"
    },
    "\u4FDD\u5B58\u3092\u7834\u68C4"
  ), /* @__PURE__ */ React.createElement("div", { style: { flex: 1 } }), /* @__PURE__ */ React.createElement(
    Button,
    {
      size: "sm",
      icon: onExpand.expanded ? "chevronU" : "chevronD",
      className: "persona-list-toggle",
      onClick: onExpand.toggle,
      title: onExpand.expanded ? "\u4E00\u89A7\u3092\u6298\u308A\u7573\u3080" : "\u5225\u306E\u4EBA\u683C\u3092\u9078\u3076 (Codex \u3092\u5C55\u958B)"
    },
    onExpand.expanded ? "\u4E00\u89A7\u3092\u7573\u3080" : "\u5225\u306E\u4EBA\u683C\u3092\u9078\u3076"
  ))), /* @__PURE__ */ React.createElement("div", { className: "es-hint" }, isSynced ? "\u540C\u671F\u5316\u30E2\u30FC\u30C9\uFF1A\u53F3\u5074\u30D1\u30CD\u30EB\u306E\u8A73\u7D30\u306F\u88C5\u5099\u6642\u70B9\u306E\u60C5\u5831\u3002\u7DE8\u96C6\u306F\u4E0B\u306E\u300CBase Info\u300D/ \u30B9\u30AD\u30EB\u30FB\u30D1\u30C3\u30B7\u30D6\u5404\u30BB\u30AF\u30B7\u30E7\u30F3\u3067\u884C\u3048\u307E\u3059\u3002" : "\u88C5\u5099\u30C7\u30FC\u30BF\u306E\u624B\u52D5\u66F8\u304D\u63DB\u3048\u3092\u884C\u3044\u305F\u3044\u5834\u5408\u306F\u300C\u25C8 \u540C\u671F\u5316\u3057\u3066\u624B\u52D5\u7DE8\u96C6\u300D\u3092\u62BC\u3057\u3066\u304F\u3060\u3055\u3044\u3002"));
};
function buildEquippedDetailPersona(state) {
  const src = state.personaSrc;
  if (!src) return null;
  // state 側は「未タッチ=undefined / タッチ済み=空文字を含む実値」の2値運用。
  // 空文字もユーザー編集結果として尊重し、src へのフォールバックは未タッチ時のみに限定する。
  const pick = (v, fallback) => (v === void 0 || v === null ? fallback : v);
  return {
    ...src,
    hp: pick(state.hp, src.hp) ?? "",
    san: pick(state.san, src.san) ?? "",
    speed: pick(state.speed, src.speed) ?? "",
    bullets: pick(state.bullets, src.bullets) ?? "×",
    res_slash: pick(state.resS, src.res_slash) ?? "普通",
    res_pierce: pick(state.resP, src.res_pierce) ?? "普通",
    res_blunt: pick(state.resB, src.res_blunt) ?? "普通",
    passive_name: pick(state.pas?.name, src.passive_name) ?? "",
    passive_cond: pick(state.pas?.cond, src.passive_cond) ?? "",
    passive_always: pick(state.pas?.always, src.passive_always) ?? "",
    passive_effect: pick(state.pas?.effect, src.passive_effect) ?? "",
    skills: (state.skills || []).map((sk, i) => ({
      rank: sk.rank || `スキル${i}`,
      derived_from: sk.derived_from || "",
      derived_index: sk.derived_index ?? null,
      derived_condition: sk.derived_condition || "",
      type: sk.type || "",
      sin: sk.sin || "",
      aoe: sk.aoe || "",
      aoeCount: sk.aoeCount || "",
      name: sk.name || "",
      effect: sk.effect || "",
      dice: (sk.dice || []).map((d) => ({ roll: d.roll || "", effect: d.effect || "" }))
    })),
    unique_buffs: (state.uniqueBuffs || []).map((b) => ({
      name: b.name || "",
      type: b.type || "固有バフ",
      initial: b.initial ?? 0,
      max: b.max ?? 0,
      desc: b.desc || "",
      place: b.place || "status"
    })),
    keywords: Array.isArray(src.keywords) ? src.keywords.slice() : []
  };
}
const SyncMaxControl = ({ state, dispatch }) => {
  const entry = (state.roster?.personas || []).find((persona) => persona.mode === state.personaMode && String(persona.no) === String(state.personaNo));
  if (!state.personaSrc || !entry) return null;
  const baseName = state.personaSrc.name || "名称未設定";
  const syncRank = ["0", "00", "000"].includes(entry.syncRank) ? entry.syncRank : null;
  const isCustom = state.personaMode === "custom" || state.personaSrc.__custom;
  const isSavedCustom = isCustom && state.personaSrc.__saved;
  const editable = Boolean(state.syncedManual || isCustom && !isSavedCustom);
  return React.createElement("section", { className: `es-sync-max-control${entry.syncMax ? " is-on" : ""}${editable ? "" : " is-readonly"}`, "aria-label": "同期状態" },
    React.createElement("div", { className: "es-sync-max-status" },
      React.createElement("span", { className: "es-sync-max-kicker" }, "SYNC STATUS / 同期状態"),
      React.createElement("span", { className: "es-sync-max-rank" }, syncRank ? `同期${syncRank}` : "同期ランク未設定"),
      entry.syncMax && React.createElement("span", { className: "es-sync-max-badge" }, "[MAX]")
    ),
    editable && React.createElement("label", { className: "es-sync-max-toggle", title: "同期MAXを設定・解除" },
      React.createElement("input", { type: "checkbox", checked: entry.syncMax === true, onChange: (event) => dispatch({ type: "PATCH_ROSTER", uid: entry.uid, patch: { syncMax: event.target.checked } }) }),
      React.createElement("span", { className: "es-sync-max-label" }, "同期MAXとして設定"),
    ),
    editable && React.createElement("span", { className: "es-sync-max-note" }, "同期ランクとは別・名称と共有に [MAX] を反映")
  );
};
const normalizeDraftAffiliationName = (value) => String(value || "").normalize("NFKC").replace(/[「」『』【】\[\]()（）\s　・]/g, "").toLowerCase();
const findDraftAffiliationCandidates = (name, options) => {
  const normalized = normalizeDraftAffiliationName(name);
  if (!normalized) return [];
  return (options || []).filter((entry) => normalizeDraftAffiliationName(entry.name) === normalized);
};
const PersonaDraftImportDialog = ({ draftText, draftSections, draftInputMode, draftResult, draftSyncMax, draftAffiliationKey, draftAffiliationQuery, autoAffiliationKey, affiliationOptions, onChange, onSectionsChange, onInputModeChange, onAnalyze, onSyncMaxChange, onAffiliationChange, onAffiliationQueryChange, onApply, onClose }) => {
  const h = React.createElement;
  const affiliation = (affiliationOptions || []).find((entry) => entry.key === draftAffiliationKey) || null;
  const autoMatched = !!affiliation && affiliation.key === autoAffiliationKey;
  const affiliationQuery = String(draftAffiliationQuery || "").trim().toLowerCase();
  const affiliationSearchResults = affiliationQuery ? (affiliationOptions || []).filter((entry) => `${entry.name} ${entry.no} ${entry.label}`.toLowerCase().includes(affiliationQuery)).slice(0, 12) : [];
  const section = (key, label, hint, placeholder) => h("label", { className: `persona-draft-section persona-draft-section--${key}` },
    h("span", { className: "persona-draft-section-label" }, label),
    h("span", { className: "persona-draft-section-hint" }, hint),
    h("textarea", { className: "persona-draft-section-text", value: draftSections?.[key] || "", onChange: (event) => onSectionsChange(key, event.target.value), placeholder }));
  const hasInput = draftInputMode === "sections" ? Object.values(draftSections || {}).some((value) => String(value || "").trim()) : draftText.trim();
  return h("div", { className: "persona-draft-backdrop", role: "presentation", onClick: (event) => { event.stopPropagation(); onClose(); } },
    h("section", { className: "persona-draft-dialog", role: "dialog", "aria-modal": "true", "aria-labelledby": "persona-draft-title", onClick: (event) => event.stopPropagation() },
      h("header", { className: "persona-draft-dialog-head" },
        h("div", null,
          h("span", { className: "t-label" }, "SYNC PERSONA DRAFT / 同期人格草案"),
          h("h2", { id: "persona-draft-title" }, "テキスト流し込み反映"),
          h("p", null, "完成済みの内容を区分ごとに確認してから反映します。表記や必須項目の不足により読み取れない場合は、エラー内容に沿って修正してください。既存人格は変更しません。")),
        h("button", { className: "btn btn--quiet btn-icon", type: "button", onClick: onClose, "aria-label": "草案取込を閉じる", title: "閉じる" }, "×")),
      h("div", { className: "persona-draft-input-mode", role: "tablist", "aria-label": "人格データの入力形式" },
        h("button", { className: `btn ${draftInputMode === "sections" ? "btn--primary" : "btn--secondary"}`, type: "button", role: "tab", "aria-selected": draftInputMode === "sections", onClick: () => onInputModeChange("sections") }, "完成データを分けて入力"),
        h("button", { className: `btn ${draftInputMode === "raw" ? "btn--primary" : "btn--secondary"}`, type: "button", role: "tab", "aria-selected": draftInputMode === "raw", onClick: () => onInputModeChange("raw") }, "一括テキストを貼り付け")),
      draftInputMode === "sections" ? h("div", { className: "persona-draft-sections" },
        section("name", "人格名（任意）", "空欄でも反映可。既存人格へ同期帰属する場合は、下部で手動選択できます。", "黒雲会組員 または 人格名：「黒雲会組員」"),
        section("status", "ステータス・パッシブ（任意）", "HP・SAN・速度・耐性・弾丸と、パッシブ名・発動条件・常時効果・効果をまとめて入力。", "HP:160　SAN：55　速度:1d5＋2\n斬撃：普通 貫通：抵抗 打撃：弱点\nパッシブ名：固有パッシブ\n発動条件：傲慢x3保有\n効果：..."),
        section("skills", "戦術スキル一覧", "0： / 0-2： / ０－２： / 【戦術スキル1】のいずれも可。", "０－２：\nスキル名\n斬撃:傲慢\n2d9：的中時、..."),
        section("uniques", "固有一覧（明示登録）", "正式な固有見出しがなくても、指令などをここへ入力すると固有一覧へ登録。", "[指令] 最大1 中立バフ\n説明\n[指令の加護] 最大9 バフ\n説明")) :
        h("textarea", { className: "persona-draft-import-text", value: draftText, onChange: (event) => onChange(event.target.value), placeholder: "表記は多少異なっても読み込みます\n人格 名：「完成人格」\nHP:160　SAN：55　速度:1d5＋2\nパッシブ名：...\n０－２：スキル名\n斬撃:傲慢\n2d9：的中時、...\n\n【戦術スキル１】・0：・0-2：も対応\n※必須項目の不足や文章型速度は修正が必要です", autoFocus: true }),
      h("div", { className: "persona-draft-import-actions" },
        h("button", { className: "btn btn--secondary", type: "button", onClick: onAnalyze, disabled: !hasInput }, "解析する"),
        draftResult?.ok && h("label", { className: "persona-draft-max-option" },
          h("input", { type: "checkbox", checked: draftSyncMax, onChange: (event) => onSyncMaxChange(event.target.checked) }),
          "同期MAXとして作成"),
        draftResult?.ok && h("button", { className: "btn btn--primary", type: "button", onClick: onApply }, affiliation ? "同期人格として反映" : "この人格を作成")),
      draftResult?.ok && h("div", { className: "persona-draft-affiliation" },
        h("label", { className: "persona-draft-affiliation-label", htmlFor: "persona-draft-affiliation-search" }, "同期元を検索して選択"),
        h("input", { id: "persona-draft-affiliation-search", className: "persona-draft-affiliation-search", type: "search", value: draftAffiliationQuery, onChange: (event) => onAffiliationQueryChange(event.target.value), placeholder: "人格名・No.で検索（クイック検索と同じ）", "aria-label": "同期元を検索" }),
        affiliationQuery && h("div", { className: "persona-draft-affiliation-results", role: "listbox", "aria-label": "同期元の検索結果" },
          affiliationSearchResults.length ? affiliationSearchResults.map((entry) => h("button", { key: entry.key, type: "button", role: "option", "aria-selected": entry.key === draftAffiliationKey, className: `persona-draft-affiliation-result${entry.key === draftAffiliationKey ? " is-selected" : ""}`, onClick: () => onAffiliationChange(entry.key) }, entry.label)) : h("p", { className: "persona-draft-affiliation-empty" }, "該当する通常・特異人格はありません。")),
        h("div", { className: "persona-draft-affiliation-current" }, affiliation ? h(React.Fragment, null, h("strong", null, `選択中：${affiliation.label}`), h("button", { className: "btn btn--quiet", type: "button", onClick: () => onAffiliationChange("") }, "新規として反映")) : h("span", null, "同期元を選ばない場合は、新規カスタム人格として反映します。")),
        h("p", { className: "persona-draft-affiliation-help" }, affiliation ? (autoMatched ? `解析した人格名と一致した『${affiliation.name}』を同期元として初期選択しています。検索して変更もできます。元のDBデータは変更しません。` : `『${affiliation.name}』を同期元として選択中です。元のDBデータは変更しません。`) : "入力欄の人格名が空でも、ここで検索して同期元を選択できます。")),
      draftResult && h("div", { className: `persona-draft-result${draftResult.ok ? " is-ready" : " is-error"}` },
        draftResult.ok && h(React.Fragment, null,
          h("strong", { className: "persona-draft-result-title" }, draftResult.persona.name),
          h("div", { className: "persona-draft-result-meta" }, `HP ${draftResult.persona.hp} / SAN ${draftResult.persona.san} / 速度 ${draftResult.persona.speed} / 弾丸 ${draftResult.persona.bullets}`),
          h("div", { className: "persona-draft-result-meta" }, `戦術スキル ${draftResult.summary.skillCount}件 / パッシブ ${draftResult.summary.passiveCount}件 / 固有 ${draftResult.summary.buffCount}件`),
          h("div", { className: "persona-draft-result-meta" }, `反映対象: ${[draftResult.provided?.name && "人格名", (draftResult.provided?.hp || draftResult.provided?.san || draftResult.provided?.speed || draftResult.provided?.passives) && "ステータス・パッシブ", draftResult.provided?.skills && "戦術スキル", draftResult.provided?.uniques && "固有"].filter(Boolean).join(" / ") || "なし"}`)),
        (draftResult.errors || []).map((message, index) => h("p", { key: `error-${index}`, className: "persona-draft-message is-error" }, message)),
        (draftResult.warnings || []).map((message, index) => h("p", { key: `warning-${index}`, className: "persona-draft-message is-warning" }, message)))));
};
const PersonaCodex = ({ state, dispatch }) => {
  const { ui, personaMode, personaNo, favorites, historyRecent, roster } = state;
  const mode = ui.codexMode || "n";
  const [selectedPersona, setSelectedPersona] = React.useState(null);
  const pendingDetailFocusRef = React.useRef(false);
  const [draftImportOpen, setDraftImportOpen] = React.useState(false);
  const [draftText, setDraftText] = React.useState("");
  const [draftSections, setDraftSections] = React.useState({ name: "", status: "", skills: "", uniques: "" });
  const [draftInputMode, setDraftInputMode] = React.useState("sections");
  const [draftResult, setDraftResult] = React.useState(null);
  const [draftSyncMax, setDraftSyncMax] = React.useState(false);
  const [draftAffiliationKey, setDraftAffiliationKey] = React.useState("");
  const [draftAffiliationQuery, setDraftAffiliationQuery] = React.useState("");
  // V14: 装備中の効果詳細はデフォルトで閉じる（装備時の自動展開も廃止）
  const [showEquippedDetail, setShowEquippedDetail] = React.useState(false);
  const codexExpanded = ui.codexExpanded !== void 0 ? ui.codexExpanded : !state.personaSrc;
  const setCodexExpanded = (v) => dispatch({ type: "SET_UI", ui: { codexExpanded: v } });
  React.useEffect(() => {
    if (!selectedPersona && state.personaSrc) setSelectedPersona(state.personaSrc);
  }, []);
  const pool = React.useMemo(() => {
    if (mode === "n") return DB.normal_personas.map((p) => ({ p, mode: "n" }));
    if (mode === "t") return DB.tokui_personas.map((p) => ({ p, mode: "t" }));
    if (mode === "fav") return favorites.map((k) => {
      const [m, no] = k.split(":");
      const src = m === "n" ? DB.normal_personas : DB.tokui_personas;
      const found = src.find((x) => x.no === parseInt(no));
      return found ? { p: found, mode: m } : null;
    }).filter(Boolean);
    if (mode === "history") return historyRecent.map((k) => {
      const [m, no] = k.split(":");
      const src = m === "n" ? DB.normal_personas : DB.tokui_personas;
      const found = src.find((x) => x.no === parseInt(no));
      return found ? { p: found, mode: m } : null;
    }).filter(Boolean);
    if (mode === "roster") return roster.personas.map((r) => {
      if (r.mode === "custom") {
        return r.src ? { p: r.src, mode: "custom", roster: r } : null;
      }
      const src = r.mode === "n" ? DB.normal_personas : DB.tokui_personas;
      const found = src.find((x) => x.no === r.no);
      return found ? { p: found, mode: r.mode, roster: r } : null;
    }).filter(Boolean);
    return [];
  }, [mode, favorites, historyRecent, roster]);
  const draftAffiliationOptions = React.useMemo(() => [
    ...(DB.normal_personas || []).map((persona) => ({ key: `n:${persona.no}`, mode: "n", no: persona.no, name: persona.name, label: `通常 · No.${String(persona.no).padStart(3, "0")} · ${persona.name}` })),
    ...(DB.tokui_personas || []).map((persona) => ({ key: `t:${persona.no}`, mode: "t", no: persona.no, name: persona.name, label: `特異 · No.${String(persona.no).padStart(3, "0")} · ${persona.name}` }))
  ], []);
  const draftAffiliationCandidates = React.useMemo(() => findDraftAffiliationCandidates(draftResult?.persona?.name, draftAffiliationOptions), [draftResult, draftAffiliationOptions]);
  const draftAutoAffiliationKey = draftAffiliationCandidates.length === 1 ? draftAffiliationCandidates[0].key : "";
  const affiliations = React.useMemo(() => {
    const set = /* @__PURE__ */ new Set();
    pool.forEach(({ p }) => set.add(decoratePersona(p).__aff));
    return Array.from(set).sort();
  }, [pool]);
  const allKws = React.useMemo(() => {
    const BL = /* @__PURE__ */ new Set(["\u7206\u767A", "\u6DF7\u4E71", "\u6307\u4EE4"]);
    const counts = /* @__PURE__ */ new Map();
    pool.forEach(({ p }) => (p.keywords || []).forEach((k) => {
      if (BL.has(k)) return;
      counts.set(k, (counts.get(k) || 0) + 1);
    }));
    // 基本ルール由来の直接状態と弾丸は、DB内の出現回数に依存させず固定フィルタとして提供する。
    PERSONA_FIXED_KEYWORD_OPTIONS.forEach((keyword) => counts.set(keyword, counts.get(keyword) || 0));
    return orderPersonaKeywordOptions(Array.from(counts.entries())
      .filter(([k, c]) => PERSONA_FIXED_KEYWORD_OPTIONS.includes(k) || c >= 2)
      .map(([k]) => k));
  }, [pool]);
  // N19: 所持人格キーセット（フィルタとソートの両方で使うため filtered より前に定義）
  const ownedPersonaKeys = React.useMemo(() => new Set((roster.personas || []).map((r) => `${r.mode}:${r.no}`)), [roster.personas]);
  const filtered = React.useMemo(() => {
    const q = (ui.searchQuery || "").trim().toLowerCase();
    return pool.filter(({ p, mode: m, roster: rosterEntry }) => {
      // N19: 「所持しているもののみ」フィルタ
      if (ui.filterOwnedOnly && !ownedPersonaKeys.has(`${m}:${p.no}`)) return false;
      if (mode === "roster") {
        const buildFilter = ui.rosterBuildFilter || "all";
        if (buildFilter === "saved" && !rosterEntry?.build) return false;
        if (buildFilter === "default" && rosterEntry?.build) return false;
      }
      if (ui.filterSins.length) {
        const sinSet = new Set((p.skills || []).map((sk) => sk.sin).filter(Boolean));
        if (!ui.filterSins.every((s) => sinSet.has(s))) return false;
      }
      if (ui.filterKws.length) {
        const kws = new Set(p.keywords || []);
        const hasBullets = !!(p.bullets && p.bullets !== "×" && p.bullets !== "x" && p.bullets !== "X");
        if (!ui.filterKws.every((k) => k === "弾丸" ? hasBullets : kws.has(k))) return false;
      }
      if (ui.filterAffs.length && !ui.filterAffs.includes(decoratePersona(p).__aff)) return false;
      if (ui.filterResS && p.res_slash !== ui.filterResS) return false;
      if (ui.filterResP && p.res_pierce !== ui.filterResP) return false;
      if (ui.filterResB && p.res_blunt !== ui.filterResB) return false;
      if (q) {
        const hay = `${p.name} ${p.no} ${(p.keywords || []).join(" ")} ${(p.skills || []).map((sk) => `${sk.name} ${sk.effect || ""}`).join(" ")} ${p.passive_name || ""} ${p.passive_effect || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [pool, ui, ownedPersonaKeys]);
  const sorted = React.useMemo(() => {
    const arr = filtered.slice();
    const sortKey = ui.sortBy || "no";
    // V24: 「所持」ソート — 所持している人格を先頭に固め、あとは No. 順
    if (sortKey === "owned") {
      arr.sort((a, b) => {
        const oa = ownedPersonaKeys.has(`${a.mode}:${a.p.no}`) ? 0 : 1;
        const ob = ownedPersonaKeys.has(`${b.mode}:${b.p.no}`) ? 0 : 1;
        return oa - ob || (a.p.no || 0) - (b.p.no || 0);
      });
      return arr;
    }
    if (sortKey.startsWith("sin:")) {
      const target = sortKey.slice(4);
      arr.sort((a, b) => {
        const ca = (a.p.skills || []).filter((sk) => sk.sin === target).length;
        const cb = (b.p.skills || []).filter((sk) => sk.sin === target).length;
        return cb - ca || a.p.no - b.p.no;
      });
    } else {
      switch (sortKey) {
        case "hp":
          arr.sort((a, b) => (b.p.hp || 0) - (a.p.hp || 0));
          break;
        case "san":
          arr.sort((a, b) => (b.p.san || 0) - (a.p.san || 0));
          break;
        case "speed":
          arr.sort((a, b) => {
            const sa = parseInt((a.p.speed || "").match(/d(\d+)/)?.[1] || 0) * parseInt((a.p.speed || "").match(/^(\d+)/)?.[1] || 0);
            const sb = parseInt((b.p.speed || "").match(/d(\d+)/)?.[1] || 0) * parseInt((b.p.speed || "").match(/^(\d+)/)?.[1] || 0);
            return sb - sa;
          });
          break;
        case "name":
          arr.sort((a, b) => (a.p.name || "").localeCompare(b.p.name || ""));
          break;
        default:
          arr.sort((a, b) => (a.p.no || 0) - (b.p.no || 0));
      }
    }
    return arr;
  }, [filtered, ui.sortBy, ownedPersonaKeys]);
  const toggleSin = (s) => {
    const list = ui.filterSins.includes(s) ? ui.filterSins.filter((x) => x !== s) : [...ui.filterSins, s];
    dispatch({ type: "SET_UI", ui: { filterSins: list } });
  };
  const toggleKw = (k) => {
    const list = ui.filterKws.includes(k) ? ui.filterKws.filter((x) => x !== k) : [...ui.filterKws, k];
    dispatch({ type: "SET_UI", ui: { filterKws: list } });
  };
  const resetFilters = () => dispatch({ type: "SET_UI", ui: {
    filterSins: [],
    filterKws: [],
    filterAffs: [],
    searchQuery: "",
    filterResS: "",
    filterResP: "",
    filterResB: "",
    filterOwnedOnly: false
  } });
  const getFocusScroller = () => document.querySelector("main.focus");
  const scrollIntoFocus = (target, block = "start") => {
    if (!target) return;
    // まずブラウザーに実際のスクロール祖先を解決させる。レイアウトが画面幅で変わるPC・モバイル双方に自然に追従する。
    target.scrollIntoView({ behavior: "smooth", block, inline: "nearest" });
    // 固定レール等で主スクロール領域に残る環境だけを補正する。
    window.setTimeout(() => {
      const scroller = getFocusScroller();
      if (!scroller || !target.isConnected) return;
      const targetRect = target.getBoundingClientRect();
      const scrollerRect = scroller.getBoundingClientRect();
      const visible = targetRect.top < scrollerRect.bottom - 12 && targetRect.bottom > scrollerRect.top + 12;
      if (visible) return;
      const targetTop = scroller.scrollTop + targetRect.top - scrollerRect.top;
      const offset = block === "center" ? Math.max(0, (scroller.clientHeight - targetRect.height) / 2) : 12;
      scroller.scrollTo({ top: Math.max(0, targetTop - offset), behavior: "smooth" });
    }, 140);
  };
  React.useEffect(() => {
    if (!pendingDetailFocusRef.current || !selectedPersona) return;
    const timer = window.setTimeout(() => {
      const detail = document.getElementById("persona-selected-detail");
      if (!detail) return;
      pendingDetailFocusRef.current = false;
      scrollIntoFocus(detail, "start");
    }, 24);
    return () => window.clearTimeout(timer);
  }, [selectedPersona, codexExpanded]);
  const toggleCodexList = () => {
    const willExpand = !codexExpanded;
    setCodexExpanded(willExpand);
    window.setTimeout(() => {
      if (willExpand) {
        scrollIntoFocus(document.getElementById("persona-list-region"), "start");
      } else {
        getFocusScroller()?.scrollTo({ top: 0, behavior: "smooth" });
      }
    }, 40);
  };
  const returnToSelectedCard = () => {
    if (!selectedPersona) return;
    const key = `${currentMode}:${selectedPersona.no}`;
    window.setTimeout(() => {
      const card = document.querySelector(`[data-persona-key="${key}"]`);
      if (!card) return;
      scrollIntoFocus(card, "center");
      window.setTimeout(() => card.focus({ preventScroll: true }), 260);
    }, 20);
  };
  const equipPersona = (p) => {
    const m = pool.find((x) => x.p === p)?.mode || mode;
    dispatch({ type: "EQUIP_PERSONA", mode: m, no: p.no, src: p });
    dispatch({ type: "SET_UI", ui: { codexExpanded: false } });
    setShowEquippedDetail(false);
    setTimeout(() => {
      const focusEl = document.querySelector("main.focus");
      if (focusEl) {
        focusEl.scrollTo({ top: 0, behavior: "smooth" });
      }
    }, 20);
    toast(`\u300E${p.name}\u300F\u3092\u88C5\u5099`);
  };
  const addRoster = (p) => {
    const m = pool.find((x) => x.p === p)?.mode || mode;
    dispatch({ type: "ADD_ROSTER", mode: m, no: p.no });
    toast("\u6240\u6301\u30EA\u30B9\u30C8\u3078\u8FFD\u52A0");
  };
  const unequip = () => {
    dispatch({ type: "UNEQUIP_PERSONA" });
    toast("\u88C5\u5099\u3092\u89E3\u9664");
  };
  const toggleFav = (m, no) => dispatch({ type: "TOGGLE_FAV", mode: m, no });
  const currentMeta = pool.find((x) => x.p === selectedPersona);
  const currentMode = currentMeta?.mode || mode;
  const currentIsEquipped = personaNo === selectedPersona?.no && personaMode === currentMode;
  const currentIsInRoster = selectedPersona && roster.personas.some((r) => r.no === selectedPersona.no && r.mode === currentMode);
  const currentIsFav = selectedPersona && favorites.includes(`${currentMode}:${selectedPersona.no}`);
  const modes = [
    { value: "n", label: "\u901A\u5E38", count: DB.normal_personas.length },
    { value: "t", label: "\u7279\u7570", count: DB.tokui_personas.length },
    { value: "roster", label: "\u6240\u6301", count: roster.personas.length },
    { value: "fav", label: "\u2605", count: favorites.length },
    { value: "history", label: "\u5C65\u6B74", count: historyRecent.length }
  ];
  const equipCustom = () => {
    const name = prompt("\u30AB\u30B9\u30BF\u30E0\u4EBA\u683C\u306E\u540D\u524D\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\uFF08\u5F8C\u304B\u3089\u5168\u9805\u76EE\u3092\u7DE8\u96C6\u53EF\u80FD\uFF09", "\u5275\u4F5C\u4EBA\u683C");
    if (!name) return;
    dispatch({ type: "EQUIP_CUSTOM_PERSONA", name });
    dispatch({ type: "SET_UI", ui: { codexExpanded: false } });
    setShowEquippedDetail(false);
    setTimeout(() => {
      const focusEl = document.querySelector("main.focus");
      if (focusEl) focusEl.scrollTo({ top: 0, behavior: "smooth" });
    }, 20);
    toast(`\u30AB\u30B9\u30BF\u30E0\u4EBA\u683C\u300E${name}\u300F\u3092\u88C5\u5099`);
  };
  const analyzeDraft = () => {
    const result = (draftInputMode === "sections" ? window.LBT_parsePersonaDraftSections?.(draftSections) : window.LBT_parsePersonaDraft?.(draftText)) || { ok: false, errors: ["草案解析器を読み込めませんでした。ページを再読み込みしてください。"], warnings: [] };
    setDraftResult(result);
    setDraftSyncMax(!!result.suggestSyncMax);
    const candidates = result.ok ? findDraftAffiliationCandidates(result.persona?.name, draftAffiliationOptions) : [];
    setDraftAffiliationKey(candidates.length === 1 ? candidates[0].key : "");
    setDraftAffiliationQuery("");
  };
  const applyDraft = () => {
    if (!draftResult?.ok) return;
    const affiliation = draftAffiliationOptions.find((entry) => entry.key === draftAffiliationKey) || null;
    dispatch({ type: "IMPORT_PERSONA_DRAFT", persona: draftResult.persona, secondaryPassive: draftResult.secondaryPassive, provided: draftResult.provided, syncRank: draftResult.syncRank, syncMax: draftSyncMax, affiliation: affiliation ? { mode: affiliation.mode, no: affiliation.no } : null });
    dispatch({ type: "SET_UI", ui: { codexExpanded: false } });
    setShowEquippedDetail(false);
    setDraftImportOpen(false);
    setDraftText("");
    setDraftSections({ name: "", status: "", skills: "", uniques: "" });
    setDraftResult(null);
    setDraftAffiliationKey("");
    setDraftAffiliationQuery("");
    toast(affiliation ? `草案を『${affiliation.name}』の同期人格として反映` : `草案人格『${draftResult.persona.name}』を編集中として装備`);
    setTimeout(() => document.querySelector("main.focus")?.scrollTo({ top: 0, behavior: "smooth" }), 20);
  };
  const hasActiveFilters = ui.filterSins.length || ui.filterKws.length || ui.filterAffs.length || ui.searchQuery || ui.filterResS || ui.filterResP || ui.filterResB || ui.filterOwnedOnly;
  const equippedPersona = state.personaSrc;
  const equippedDetailPersona = buildEquippedDetailPersona(state);
  const equippedMeta = equippedPersona ? { p: equippedPersona, mode: state.personaMode || "n" } : null;
  return /* @__PURE__ */ React.createElement(React.Fragment, null, draftImportOpen && /* @__PURE__ */ React.createElement(PersonaDraftImportDialog, { draftText, draftSections, draftInputMode, draftResult, draftSyncMax, draftAffiliationKey, draftAffiliationQuery, autoAffiliationKey: draftAutoAffiliationKey, affiliationOptions: draftAffiliationOptions, onChange: (value) => { setDraftText(value); setDraftResult(null); setDraftAffiliationKey(""); setDraftAffiliationQuery(""); }, onSectionsChange: (key, value) => { setDraftSections((current) => ({ ...current, [key]: value })); setDraftResult(null); setDraftAffiliationKey(""); setDraftAffiliationQuery(""); }, onInputModeChange: (modeValue) => { setDraftInputMode(modeValue); setDraftResult(null); setDraftAffiliationKey(""); setDraftAffiliationQuery(""); }, onAnalyze: analyzeDraft, onSyncMaxChange: setDraftSyncMax, onAffiliationChange: setDraftAffiliationKey, onAffiliationQueryChange: setDraftAffiliationQuery, onApply: applyDraft, onClose: () => { setDraftImportOpen(false); setDraftAffiliationKey(""); setDraftAffiliationQuery(""); } }), /* @__PURE__ */ React.createElement("div", { className: "codex-shell" }, /* @__PURE__ */ React.createElement("div", { className: "persona-workspace" }, equippedPersona && /* @__PURE__ */ React.createElement("div", { className: "equipped-unified" }, /* @__PURE__ */ React.createElement(
    EquippedSummary,
    {
      state,
      dispatch,
      onExpand: { expanded: codexExpanded, toggle: toggleCodexList },
      onShowDetail: setShowEquippedDetail,
      detailShown: showEquippedDetail,
      syncMaxControl: equippedPersona && /* @__PURE__ */ React.createElement(SyncMaxControl, { state, dispatch })
    }
  ), equippedPersona && showEquippedDetail && /* @__PURE__ */ React.createElement("div", { className: "equipped-detail-wrap" }, /* @__PURE__ */ React.createElement("div", { className: "equipped-detail-inner" }, /* @__PURE__ */ React.createElement(
    PersonaDetail,
    {
      persona: equippedDetailPersona,
      mode: state.personaMode || "n",
      isEquipped: true,
      onEquip: () => {
      },
      onUnequip: () => requestPersonaUnequip(state, dispatch, () => setShowEquippedDetail(false)),
      onAddRoster: () => {
      },
      isInRoster: true,
      embed: true
    }
  )))), equippedPersona && /* @__PURE__ */ React.createElement(
    React.Fragment,
    null,
    /* W07: 基本情報（名前/PL/立ち絵/色）を装備中パネル内に折りたたみ統合 */
    /* @__PURE__ */ React.createElement("details", { className: "fold pw-subsec", style: { marginTop: "var(--s-3)", background: "var(--surface-1)", border: "1px solid var(--line-dim)", borderRadius: 6 } },
      /* @__PURE__ */ React.createElement("summary", { style: { cursor: "pointer", padding: "10px 14px", fontFamily: "var(--f-display)", fontWeight: 700, fontSize: 13, color: "var(--gold)", listStyle: "none", display: "flex", alignItems: "center", gap: 10 } },
        /* @__PURE__ */ React.createElement("span", { className: "pw-subsec-caret", style: { fontSize: 10 } }, "▶"),
        "BASE INFO / 基本情報",
        /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, color: "var(--tx-mute)", fontWeight: 400 } }, "名前・PL・立ち絵・駒の色")),
      /* @__PURE__ */ React.createElement("div", { style: { padding: "4px 14px 14px" } }, /* @__PURE__ */ React.createElement(BaseSection, { state, dispatch }))),
    /* W07: 固有バフ・ステータスを装備中パネル内に折りたたみ統合 */
    /* @__PURE__ */ React.createElement("details", { className: "fold pw-subsec", style: { marginTop: "var(--s-2)", background: "var(--surface-1)", border: "1px solid var(--line-dim)", borderRadius: 6 } },
      /* @__PURE__ */ React.createElement("summary", { style: { cursor: "pointer", padding: "10px 14px", fontFamily: "var(--f-display)", fontWeight: 700, fontSize: 13, color: "var(--gold)", listStyle: "none", display: "flex", alignItems: "center", gap: 10 } },
        /* @__PURE__ */ React.createElement("span", { className: "pw-subsec-caret", style: { fontSize: 10 } }, "▶"),
        "UNIQUE BUFFS / 固有バフ・ステータス",
        /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, color: "var(--tx-mute)", fontWeight: 400 } }, "この人格固有の蓄積バフ・固有ステータス")),
      /* @__PURE__ */ React.createElement("div", { style: { padding: "4px 14px 14px" } }, /* @__PURE__ */ React.createElement(UniqueBuffsBlock, { state, dispatch })))),
  equippedPersona && /* @__PURE__ */ React.createElement(
    "div",
    {
      className: "pw-listbar",
      onClick: toggleCodexList,
      role: "button",
      title: codexExpanded ? "\u4EBA\u683C\u4E00\u89A7\u3092\u6298\u308A\u7573\u3080" : "\u4EBA\u683C\u4E00\u89A7\u3092\u5C55\u958B\u3057\u3066\u5225\u306E\u4EBA\u683C\u3092\u9078\u3076"
    },
    /* @__PURE__ */ React.createElement("span", { className: "caret" }, codexExpanded ? "\u25BC" : "\u25B6"),
    /* @__PURE__ */ React.createElement("span", { style: { fontFamily: "var(--f-display)", fontSize: "var(--fs-11)", letterSpacing: "0.14em", color: "var(--tx-2)" } }, "PERSONA LIST / \u4EBA\u683C\u4E00\u89A7"),
    /* @__PURE__ */ React.createElement("span", { style: { fontSize: "var(--fs-10)", color: "var(--tx-mute)" } }, codexExpanded ? `${sorted.length}\u4EF6\u8868\u793A\u4E2D` : "\u6298\u308A\u7573\u307F\u4E2D"),
    /* @__PURE__ */ React.createElement("div", { style: { flex: 1 } }),
    !codexExpanded && /* @__PURE__ */ React.createElement("span", { style: { fontSize: "var(--fs-10)", color: "var(--gold)" } }, "\u30AF\u30EA\u30C3\u30AF\u3067\u5C55\u958B"),
    /* @__PURE__ */ React.createElement("button", { className: "persona-draft-import-trigger", type: "button", onClick: (event) => { event.stopPropagation(); setDraftImportOpen(true); }, title: "完成した人格データをテキストで流し込み、確認して反映" }, "テキスト流し込み反映"),
    null
  ), (!equippedPersona || codexExpanded) && /* @__PURE__ */ React.createElement("div", { id: "persona-list-region", className: "codex pw-body" }, /* @__PURE__ */ React.createElement("div", { className: "codex-main" }, /* @__PURE__ */ React.createElement("div", { className: "codex-modes" }, modes.map((m) => /* @__PURE__ */ React.createElement("button", { key: m.value, className: mode === m.value ? "is-active" : "", onClick: () => dispatch({ type: "SET_UI", ui: { codexMode: m.value } }), type: "button" }, m.label, " ", /* @__PURE__ */ React.createElement("span", { className: "count" }, m.count))), /* @__PURE__ */ React.createElement("div", { style: { flex: 1 } }), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: equipCustom,
      type: "button",
      style: {
        padding: "6px 12px",
        fontFamily: "var(--f-display)",
        fontSize: "var(--fs-11)",
        letterSpacing: "0.12em",
        color: "var(--gold)",
        background: "transparent",
        border: "1px dashed var(--gold-line)",
        borderRadius: "var(--r-sm)",
        cursor: "pointer",
        fontWeight: 600
      },
      title: "DB\u306B\u7121\u3044\u5275\u4F5C\u4EBA\u683C\u3092\u624B\u5165\u529B\u3067\u88C5\u5099 (v45\u4E92\u63DB)"
    },
    "\uFF0B \u30AB\u30B9\u30BF\u30E0\u4EBA\u683C"
  )), /* @__PURE__ */ React.createElement("div", { className: "codex-filters" }, /* @__PURE__ */ React.createElement("div", { className: "codex-filter-row" }, /* @__PURE__ */ React.createElement("div", { className: "codex-search" }, /* @__PURE__ */ React.createElement(Icon, { name: "search", size: 14 }), /* @__PURE__ */ React.createElement("input", { type: "text", placeholder: "\u540D\u524D\u30FB\u30D1\u30C3\u30B7\u30D6\u52B9\u679C\u30FB\u30AD\u30FC\u30EF\u30FC\u30C9\u3067\u691C\u7D22...", value: ui.searchQuery || "", onChange: (e) => dispatch({ type: "SET_UI", ui: { searchQuery: e.target.value } }) })), /* @__PURE__ */ React.createElement("div", { className: "codex-count" }, /* @__PURE__ */ React.createElement("strong", null, sorted.length), " / ", pool.length), /* @__PURE__ */ React.createElement("select", { className: "codex-sort", value: ui.sortBy || "no", onChange: (e) => dispatch({ type: "SET_UI", ui: { sortBy: e.target.value } }) }, /* @__PURE__ */ React.createElement("optgroup", { label: "\u57FA\u672C" }, /* @__PURE__ */ React.createElement("option", { value: "owned" }, "\u6240\u6301\u3057\u3066\u3044\u308B\u3082\u306E\u512A\u5148"), /* @__PURE__ */ React.createElement("option", { value: "no" }, "No.\u9806"), /* @__PURE__ */ React.createElement("option", { value: "name" }, "\u540D\u524D\u9806"), /* @__PURE__ */ React.createElement("option", { value: "hp" }, "HP\u964D\u9806"), /* @__PURE__ */ React.createElement("option", { value: "san" }, "SAN\u964D\u9806"), /* @__PURE__ */ React.createElement("option", { value: "speed" }, "\u901F\u5EA6\u4E0A\u9650\u964D\u9806")), /* @__PURE__ */ React.createElement("optgroup", { label: "\u5927\u7F6A\u30B9\u30AD\u30EB\u6570\u304C\u591A\u3044\u9806" }, SINS_ORDER.map((s) => /* @__PURE__ */ React.createElement("option", { key: s, value: `sin:${s}` }, s, "\u30B9\u30AD\u30EB\u591A\u3044\u9806"))))), /* @__PURE__ */ React.createElement("div", { className: "codex-filter-row" }, /* @__PURE__ */ React.createElement("span", { className: "filter-label" }, "\u5927\u7F6A"), /* @__PURE__ */ React.createElement("div", { className: "chips-group" }, SINS_ORDER.map((s) => /* @__PURE__ */ React.createElement(
    Chip,
    {
      key: s,
      sin: s,
      active: ui.filterSins.includes(s),
      onClick: () => toggleSin(s)
    },
    s
  )), /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "chip is-sm",
      style: {
        marginLeft: 6,
        borderStyle: (ui.sortBy || "").startsWith("sin:") ? "solid" : "dashed",
        color: (ui.sortBy || "").startsWith("sin:") ? "var(--gold)" : "var(--tx-dim)",
        borderColor: (ui.sortBy || "").startsWith("sin:") ? "var(--gold-line)" : "var(--line)",
        background: (ui.sortBy || "").startsWith("sin:") ? "var(--gold-tint)" : "transparent"
      },
      onClick: () => {
        if ((ui.sortBy || "").startsWith("sin:")) {
          dispatch({ type: "SET_UI", ui: { sortBy: "no" } });
        } else if (ui.filterSins.length) {
          dispatch({ type: "SET_UI", ui: { sortBy: `sin:${ui.filterSins[ui.filterSins.length - 1]}` } });
        } else {
          toast("\u5927\u7F6A\u30C1\u30C3\u30D7\u30921\u3064\u4EE5\u4E0A\u9078\u629E\u3057\u3066\u304B\u3089\u30AF\u30EA\u30C3\u30AF");
        }
      },
      title: "\u9078\u629E\u4E2D\u306E\u5927\u7F6A\u3067\u30B9\u30AD\u30EB\u591A\u3044\u9806\u306B\u30BD\u30FC\u30C8"
    },
    "\u{1F3AF} \u5927\u7F6A\u30BD\u30FC\u30C8"
  ))), /* @__PURE__ */ React.createElement("div", { className: "codex-filter-row" }, /* @__PURE__ */ React.createElement("span", { className: "filter-label" }, "\u8010\u6027"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "var(--s-2)", flexWrap: "wrap", alignItems: "center" } }, ["S", "P", "B"].map((k, i) => {
    const key = `filterRes${k}`;
    const label = ["\u65AC\u6483", "\u8CAB\u901A", "\u6253\u6483"][i];
    return /* @__PURE__ */ React.createElement("div", { key: k, style: { display: "flex", alignItems: "center", gap: 6 } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: "var(--fs-10)", color: "var(--tx-dim)", fontFamily: "var(--f-display)", letterSpacing: "0.14em", textTransform: "uppercase", minWidth: 32 } }, label), /* @__PURE__ */ React.createElement("select", { className: "codex-sort", value: ui[key] || "", onChange: (e) => dispatch({ type: "SET_UI", ui: { [key]: e.target.value } }), style: { minWidth: 80 } }, /* @__PURE__ */ React.createElement("option", { value: "" }, "\u6307\u5B9A\u306A\u3057"), RES_LEVELS.map((r) => /* @__PURE__ */ React.createElement("option", { key: r, value: r }, r))));
  }))), allKws.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "codex-filter-row" }, /* @__PURE__ */ React.createElement("span", { className: "filter-label" }, "\u30AD\u30FC\u30EF\u30FC\u30C9"), /* @__PURE__ */ React.createElement("div", { className: "chips-group" }, allKws.slice(0, PDF_KEYWORD_ORDER.length).map((k) => /* @__PURE__ */ React.createElement(Chip, { key: k, size: "sm", active: ui.filterKws.includes(k), onClick: () => toggleKw(k) }, k)))), /* @__PURE__ */ React.createElement("div", { className: "codex-filter-row" }, /* @__PURE__ */ React.createElement("span", { className: "filter-label" }, "\u6240\u6301"), /* @__PURE__ */ React.createElement("div", { className: "chips-group" }, /* @__PURE__ */ React.createElement(Chip, { size: "sm", active: !!ui.filterOwnedOnly, onClick: () => dispatch({ type: "SET_UI", ui: { filterOwnedOnly: !ui.filterOwnedOnly } }) }, "\u6240\u6301\u3057\u3066\u3044\u308B\u3082\u306E\u306E\u307F", ui.filterOwnedOnly ? ` (${ownedPersonaKeys.size})` : ""))), mode === "roster" && /* @__PURE__ */ React.createElement("div", { className: "codex-filter-row" }, /* @__PURE__ */ React.createElement("span", { className: "filter-label" }, "\u4FDD\u5B58\u72B6\u614B"), /* @__PURE__ */ React.createElement("div", { className: "chips-group" }, [["all", "\u3059\u3079\u3066"], ["saved", "\u7DE8\u96C6\u4FDD\u5B58\u6E08\u307F"], ["default", "\u65E2\u5B9A\u5024\u306E\u307E\u307E"]].map(([key, label]) => /* @__PURE__ */ React.createElement("button", { key, className: `chip is-sm${(ui.rosterBuildFilter || "all") === key ? " is-active" : ""}`, onClick: () => dispatch({ type: "SET_UI", ui: { rosterBuildFilter: key } }) }, label)))), hasActiveFilters ? /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "flex-end" } }, /* @__PURE__ */ React.createElement(Button, { variant: "ghost", size: "sm", onClick: resetFilters, icon: "x" }, "\u30D5\u30A3\u30EB\u30BF\u3092\u30EA\u30BB\u30C3\u30C8")) : null), /* @__PURE__ */ React.createElement("div", { className: "codex-grid" }, sorted.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "empty", style: { gridColumn: "1/-1" } }, mode === "fav" && favorites.length === 0 ? "\u2605\u3092\u30AF\u30EA\u30C3\u30AF\u3057\u3066\u304A\u6C17\u306B\u5165\u308A\u3092\u8FFD\u52A0\u3057\u3066\u304F\u3060\u3055\u3044" : mode === "history" && historyRecent.length === 0 ? "\u307E\u3060\u4EBA\u683C\u3092\u9078\u3093\u3067\u3044\u307E\u305B\u3093" : mode === "roster" && roster.personas.length === 0 ? "\u88C5\u5099\u3057\u305F\u4EBA\u683C\u306F\u6240\u6301\u30EA\u30B9\u30C8\u306B\u81EA\u52D5\u8FFD\u52A0\u3055\u308C\u307E\u3059" : "\u8A72\u5F53\u3059\u308B\u4EBA\u683C\u304C\u3042\u308A\u307E\u305B\u3093 \u2014 \u30D5\u30A3\u30EB\u30BF\u3092\u30EA\u30BB\u30C3\u30C8\u3057\u3066\u304F\u3060\u3055\u3044") : sorted.map(({ p, mode: m }) => /* @__PURE__ */ React.createElement(
    PersonaCard,
    {
      key: `${m}:${p.no}`,
      persona: p,
      mode: m,
      isEquipped: personaMode === m && personaNo === p.no,
      isActive: selectedPersona === p,
      isFav: favorites.includes(`${m}:${p.no}`),
      onSelect: (persona) => {
        // V02: 既に選択中（簡易詳細が出ている）同じカードを再度クリックしたら装備。
        if (selectedPersona === persona) {
          equipPersona(persona);
          return;
        }
        // 描画後に詳細先頭へ確実に移動する。選択結果と次の行為を連続して提示する。
        pendingDetailFocusRef.current = true;
        setSelectedPersona(persona);
      },
      onEquip: equipPersona,
      onToggleFav: toggleFav
    }
  )))), /* @__PURE__ */ React.createElement(
    PersonaDetail,
    {
      persona: selectedPersona,
      mode: currentMode,
      isEquipped: currentIsEquipped,
      onEquip: () => equipPersona(selectedPersona),
      onUnequip: unequip,
      onAddRoster: () => addRoster(selectedPersona),
      isInRoster: currentIsInRoster,
      onReturnToList: returnToSelectedCard,
      onOpenDraft: () => setDraftImportOpen(true)
    }
  )))));
};
window.PersonaCodex = PersonaCodex;
window.PersonaDetail = PersonaDetail;
window.getPrimarySin = getPrimarySin;
window.inferAffiliation = inferAffiliation;
window.decoratePersona = decoratePersona;
