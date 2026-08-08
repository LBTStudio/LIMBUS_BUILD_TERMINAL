(() => {
  const SINS_ORDER = ["\u61A4\u6012", "\u8272\u6B32", "\u6020\u60F0", "\u66B4\u98DF", "\u6182\u9B31", "\u50B2\u6162", "\u5AC9\u59AC"];
  const RES_LEVELS = ["\u8106\u5F31", "\u5F31\u70B9", "\u666E\u901A", "\u62B5\u6297", "\u8010\u6027", "\u514D\u75AB"];
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
    const kws = (p.keywords || []).filter((k) => !["\u7206\u767A", "\u6DF7\u4E71"].includes(k)).slice(0, 3);
    const primarySin = getPrimarySin(p);
    return /* @__PURE__ */ React.createElement(
      "div",
      {
        className: `p-card${isActive ? " is-active" : ""}${isEquipped ? " is-equipped" : ""}`,
        "data-mode": mode,
        style: { "--sin-primary": primarySin ? `var(--sin-${primarySin})` : "var(--gold)" },
        onClick: () => onSelect(p),
        onDoubleClick: () => onEquip(p),
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
  const PersonaDetail = ({ persona, mode, isEquipped, onEquip, onUnequip, onAddRoster, isInRoster, embed }) => {
    if (!persona) {
      return /* @__PURE__ */ React.createElement("div", { className: "codex-detail" }, /* @__PURE__ */ React.createElement("div", { className: "detail-empty" }, /* @__PURE__ */ React.createElement("div", { className: "detail-empty-icon" }, "\u25C8"), /* @__PURE__ */ React.createElement("div", { className: "t-label" }, "\u5DE6\u306E\u30AB\u30FC\u30C9\u3092\u9078\u629E"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-11)", color: "var(--tx-mute)", marginTop: 8 } }, "\u4EBA\u683C\u3092\u9078\u629E\u3059\u308B\u3068\u8A73\u7D30\u304C\u8868\u793A\u3055\u308C\u307E\u3059\u3002", /* @__PURE__ */ React.createElement("br", null), "\u30C0\u30D6\u30EB\u30AF\u30EA\u30C3\u30AF\u3067\u88C5\u5099\u3002")));
    }
    const p = persona;
    const primarySin = getPrimarySin(p);
    const kws = (p.keywords || []).filter((k) => !["\u7206\u767A", "\u6DF7\u4E71"].includes(k));
    return /* @__PURE__ */ React.createElement("div", { className: `codex-detail${embed ? " is-embedded" : ""}`, style: { "--sin-primary": primarySin ? `var(--sin-${primarySin})` : "var(--gold)" } }, !embed && /* @__PURE__ */ React.createElement("div", { className: "detail-head" }, /* @__PURE__ */ React.createElement("div", { className: "detail-eyebrow" }, /* @__PURE__ */ React.createElement("span", { className: "detail-num" }, "No.", String(p.no).padStart(3, "0")), /* @__PURE__ */ React.createElement("span", { className: "detail-type" }, mode === "n" ? "\u901A\u5E38\u4EBA\u683C / NORMAL" : "\u7279\u7570\u4EBA\u683C / SPECIAL")), /* @__PURE__ */ React.createElement("div", { className: "detail-name" }, p.name), /* @__PURE__ */ React.createElement("div", { style: { marginBottom: "var(--s-3)" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-10)", color: "var(--tx-mute)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 4 } }, "\u6240\u5C5E"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-12)", color: "var(--tx-2)" } }, decoratePersona(p).__aff)), /* @__PURE__ */ React.createElement("div", { className: "detail-stats" }, /* @__PURE__ */ React.createElement("div", { className: "detail-stat" }, /* @__PURE__ */ React.createElement("span", { className: "detail-stat-label" }, "HP"), /* @__PURE__ */ React.createElement("span", { className: "detail-stat-value" }, p.hp)), /* @__PURE__ */ React.createElement("div", { className: "detail-stat" }, /* @__PURE__ */ React.createElement("span", { className: "detail-stat-label" }, "SAN"), /* @__PURE__ */ React.createElement("span", { className: "detail-stat-value" }, p.san)), /* @__PURE__ */ React.createElement("div", { className: "detail-stat" }, /* @__PURE__ */ React.createElement("span", { className: "detail-stat-label" }, "\u901F\u5EA6"), /* @__PURE__ */ React.createElement("span", { className: "detail-stat-value" }, p.speed)), /* @__PURE__ */ React.createElement("div", { className: "detail-stat" }, /* @__PURE__ */ React.createElement("span", { className: "detail-stat-label" }, "\u5F3E\u4E38"), /* @__PURE__ */ React.createElement("span", { className: "detail-stat-value" }, p.bullets || "\xD7")))), /* @__PURE__ */ React.createElement("div", { className: "detail-body" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "detail-section-title" }, "\u8010\u6027 / RESISTANCE"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "var(--s-3)", flexWrap: "wrap", padding: "8px 0 12px", alignItems: "center" } }, /* @__PURE__ */ React.createElement(ResRow, { s: p.res_slash, p: p.res_pierce, b: p.res_blunt, showLabels: true }), /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--f-mono)", fontSize: "var(--fs-10)", color: "var(--tx-dim)", display: "flex", gap: 12 } }, /* @__PURE__ */ React.createElement("span", null, "\u65AC ", p.res_slash), /* @__PURE__ */ React.createElement("span", null, "\u8CAB ", p.res_pierce), /* @__PURE__ */ React.createElement("span", null, "\u6253 ", p.res_blunt)))), !embed && kws.length > 0 && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "detail-section-title" }, "\u30AD\u30FC\u30EF\u30FC\u30C9 / KEYWORDS"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 6, flexWrap: "wrap" } }, kws.map((k) => /* @__PURE__ */ React.createElement("span", { key: k, className: "chip is-sm" }, k)))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "detail-section-title" }, "\u30D1\u30C3\u30B7\u30D6 / PASSIVE"), /* @__PURE__ */ React.createElement("div", { className: "detail-passive" }, /* @__PURE__ */ React.createElement("div", { className: "detail-passive-name" }, p.passive_name || "\uFF08\u306A\u3057\uFF09"), /* @__PURE__ */ React.createElement("div", { className: "detail-passive-cond cond-chips-lg", style: { display: "flex", alignItems: "center", gap: 6 } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: "var(--fs-10)", color: "var(--tx-mute)" } }, "\u767A\u52D5\u6761\u4EF6"), /* @__PURE__ */ React.createElement(CondChips, { cond: p.passive_cond || "\u306A\u3057" })), p.passive_always && /* @__PURE__ */ React.createElement("div", { className: "detail-passive-effect", style: { marginBottom: 6, color: "var(--tx-dim)" } }, /* @__PURE__ */ React.createElement("b", { style: { color: "var(--gold)", fontFamily: "var(--f-display)", fontSize: 10, letterSpacing: "0.14em" } }, "\u5E38\u6642\uFF1A"), p.passive_always), /* @__PURE__ */ React.createElement("div", { className: "detail-passive-effect" }, p.passive_effect))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "detail-section-title" }, "\u6226\u8853\u30B9\u30AD\u30EB / SKILLS"), /* @__PURE__ */ React.createElement("div", { className: "detail-skills" }, (p.skills || []).map((sk, i) => /* @__PURE__ */ React.createElement("div", { key: i, className: "detail-skill", "data-sin": sk.sin }, /* @__PURE__ */ React.createElement("span", { className: "detail-skill-rank" }, "S", (sk.rank || "").replace(/[^0-9-]/g, "") || i), /* @__PURE__ */ React.createElement("span", { className: "detail-skill-name" }, sk.name), /* @__PURE__ */ React.createElement("span", { className: "detail-skill-type" }, sk.type))))), (p.unique_buffs || []).length > 0 ? /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "detail-section-title", style: { color: "var(--gold-hi)", display: "flex", alignItems: "center", gap: 6 } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 14 } }, "\u25C6"), /* @__PURE__ */ React.createElement("span", null, "\u56FA\u6709\u30D0\u30D5 / UNIQUE"), /* @__PURE__ */ React.createElement("span", { style: { marginLeft: "auto", fontFamily: "var(--f-mono)", fontSize: 9, color: "var(--tx-mute)", letterSpacing: "0.06em" } }, p.unique_buffs.length, "\u4EF6")), /* @__PURE__ */ React.createElement("div", { className: "stack-2", style: { padding: "8px", background: "var(--gold-tint)", border: "1px solid var(--gold-line)", borderRadius: "var(--r)" } }, p.unique_buffs.map((b, i) => /* @__PURE__ */ React.createElement("div", { key: i, style: { padding: "6px 10px", background: "var(--surface-inset)", borderRadius: "var(--r)", border: "1px solid var(--line-dim)" } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--f-display)", fontWeight: 600, fontSize: "var(--fs-12)", color: "var(--tx)" } }, b.name, " ", /* @__PURE__ */ React.createElement("span", { style: { fontSize: "var(--fs-10)", color: "var(--tx-dim)", fontWeight: 400 } }, "(", b.type, " / \u6700\u5927", b.max || "\u221E", ")")), b.desc && /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-11)", color: "var(--tx-2)", marginTop: 4, lineHeight: 1.5 } }, b.desc)))), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-10)", color: "var(--tx-mute)", marginTop: 6, lineHeight: 1.4, fontStyle: "italic" } }, "\u88C5\u5099\u3059\u308B\u3068 ", /* @__PURE__ */ React.createElement("b", { style: { color: "var(--gold)" } }, "\u30D1\u30C3\u30B7\u30D6"), " \u30DA\u30FC\u30B8\u306E\u300C\u56FA\u6709\u30D0\u30D5\u30FB\u30B9\u30C6\u30FC\u30BF\u30B9\u300D\u306B\u81EA\u52D5\u8FFD\u52A0\u3055\u308C\u307E\u3059")) : /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "detail-section-title", style: { color: "var(--tx-mute)" } }, "\u56FA\u6709\u30D0\u30D5 / UNIQUE"), /* @__PURE__ */ React.createElement("div", { style: { padding: "8px 10px", fontSize: "var(--fs-11)", color: "var(--tx-mute)", fontStyle: "italic", background: "var(--surface-inset)", border: "1px dashed var(--line-dim)", borderRadius: "var(--r)" } }, "\u3053\u306E\u4EBA\u683C\u306B\u56FA\u6709\u30D0\u30D5\u306FDB\u767B\u9332\u3055\u308C\u3066\u3044\u307E\u305B\u3093\u3002", /* @__PURE__ */ React.createElement("br", null), "\u5FC5\u8981\u306A\u5834\u5408\u306F\u88C5\u5099\u5F8C\u3001", /* @__PURE__ */ React.createElement("b", { style: { color: "var(--tx-dim)" } }, "\u30D1\u30C3\u30B7\u30D6"), " \u30DA\u30FC\u30B8\u304B\u3089\u624B\u52D5\u8FFD\u52A0\u3067\u304D\u307E\u3059\u3002"))), !embed && /* @__PURE__ */ React.createElement("div", { className: "detail-actions" }, isEquipped ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-10)", color: "var(--gold)", textAlign: "center", fontFamily: "var(--f-display)", letterSpacing: "0.2em", textTransform: "uppercase" } }, "\u2605 \u73FE\u5728\u88C5\u5099\u4E2D"), /* @__PURE__ */ React.createElement(Button, { variant: "ghost", size: "sm", onClick: onUnequip, icon: "x" }, "\u88C5\u5099\u89E3\u9664")) : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(Button, { variant: "primary", onClick: onEquip, icon: "check" }, "\u88C5\u5099\u3059\u308B"), !isInRoster && /* @__PURE__ */ React.createElement(Button, { variant: "ghost", size: "sm", onClick: onAddRoster, icon: "plus" }, "\u6240\u6301\u30EA\u30B9\u30C8\u306E\u307F\u3078\u8FFD\u52A0"))));
  };
  const EquippedSummary = ({ state, dispatch, onExpand, onShowDetail, detailShown }) => {
    const p = state.personaSrc;
    if (!p) return null;
    const primarySin = getPrimarySin(p);
    const isCustom = state.personaMode === "custom" || p.__custom;
    const isSynced = state.syncedManual;
    const editable = isSynced || isCustom;
    const patchMeta = (patch) => dispatch({ type: "PATCH_PERSONA_META", patch });
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
    ) : /* @__PURE__ */ React.createElement("div", { className: "es-name" }, p.name)), /* @__PURE__ */ React.createElement("div", { className: "es-body" }, /* @__PURE__ */ React.createElement("div", { className: "es-stats" }, /* @__PURE__ */ React.createElement("div", { className: "es-stat" }, /* @__PURE__ */ React.createElement("span", { className: "es-stat-label" }, "HP"), /* @__PURE__ */ React.createElement(
      "input",
      {
        className: "es-stat-input",
        type: "number",
        value: state.hp ?? p.hp,
        onChange: (e) => dispatch({ type: "SET_FIELD", field: "hp", value: e.target.value }),
        title: "HP\uFF08\u76F4\u63A5\u7DE8\u96C6\u53EF\uFF09"
      }
    )), /* @__PURE__ */ React.createElement("div", { className: "es-stat" }, /* @__PURE__ */ React.createElement("span", { className: "es-stat-label" }, "SAN"), /* @__PURE__ */ React.createElement(
      "input",
      {
        className: "es-stat-input",
        type: "number",
        value: state.san ?? p.san,
        onChange: (e) => dispatch({ type: "SET_FIELD", field: "san", value: e.target.value }),
        title: "SAN\uFF08\u76F4\u63A5\u7DE8\u96C6\u53EF\uFF09"
      }
    )), /* @__PURE__ */ React.createElement("div", { className: "es-stat" }, /* @__PURE__ */ React.createElement("span", { className: "es-stat-label" }, "\u901F\u5EA6"), /* @__PURE__ */ React.createElement(
      "input",
      {
        className: "es-stat-input",
        value: state.speed || p.speed,
        onChange: (e) => dispatch({ type: "SET_FIELD", field: "speed", value: e.target.value }),
        title: "\u901F\u5EA6\uFF08\u76F4\u63A5\u7DE8\u96C6\u53EF\uFF09"
      }
    )), /* @__PURE__ */ React.createElement("div", { className: "es-stat" }, /* @__PURE__ */ React.createElement("span", { className: "es-stat-label" }, "\u5F3E\u4E38"), /* @__PURE__ */ React.createElement(
      "input",
      {
        className: "es-stat-input",
        value: state.bullets || p.bullets || "\xD7",
        onChange: (e) => dispatch({ type: "SET_FIELD", field: "bullets", value: e.target.value }),
        title: "\u5F3E\u4E38\uFF08\u76F4\u63A5\u7DE8\u96C6\u53EF\uFF09"
      }
    )), /* @__PURE__ */ React.createElement("div", { className: "es-stat" }, /* @__PURE__ */ React.createElement("span", { className: "es-stat-label" }, "\u30E9\u30F3\u30AF"), /* @__PURE__ */ React.createElement(
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
    ))), /* @__PURE__ */ React.createElement("div", { className: "es-keywords" }, /* @__PURE__ */ React.createElement("span", { className: "es-stat-label", style: { alignSelf: "center" } }, "\u30AD\u30FC\u30EF\u30FC\u30C9"), (state.personaSrc?.keywords || []).map((k, i) => /* @__PURE__ */ React.createElement("span", { key: i, className: "es-kw-tag" }, k, editable && /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "es-kw-rm",
        title: "\u3053\u306E\u30AD\u30FC\u30EF\u30FC\u30C9\u3092\u524A\u9664",
        onClick: () => {
          const next = (state.personaSrc.keywords || []).filter((_, j) => j !== i);
          patchMeta({ src: { keywords: next } });
        }
      },
      "\xD7"
    ))), editable && /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "es-kw-add",
        title: "\u30AD\u30FC\u30EF\u30FC\u30C9\u3092\u8FFD\u52A0",
        onClick: () => {
          const v = prompt("\u8FFD\u52A0\u3059\u308B\u30AD\u30FC\u30EF\u30FC\u30C9\uFF08\u4F8B: \u51FA\u8840, \u547C\u5438, \u7834\u88C2\uFF09:");
          if (!v || !v.trim()) return;
          const cur = state.personaSrc.keywords || [];
          if (cur.includes(v.trim())) {
            toast("\u65E2\u306B\u5B58\u5728\u3057\u307E\u3059");
            return;
          }
          patchMeta({ src: { keywords: [...cur, v.trim()] } });
        }
      },
      "\uFF0B \u8FFD\u52A0"
    )), /* @__PURE__ */ React.createElement("div", { className: "es-actions" }, /* @__PURE__ */ React.createElement(
      Button,
      {
        size: "sm",
        variant: detailShown ? "primary" : "ghost",
        icon: detailShown ? "x" : "eye",
        onClick: () => onShowDetail(!detailShown),
        title: detailShown ? "\u8A73\u7D30\u3092\u9589\u3058\u308B" : "\u88C5\u5099\u4E2D\u306E\u52B9\u679C\u8A73\u7D30\u3092\u4E0A\u90E8\u306B\u8868\u793A\uFF08Codex\u3092\u958B\u304B\u306A\u304F\u3066\u3082\u898B\u3089\u308C\u308B\uFF09"
      },
      detailShown ? "\u8A73\u7D30\u3092\u9589\u3058\u308B" : "\u88C5\u5099\u4E2D\u306E\u52B9\u679C\u8A73\u7D30\u3092\u8868\u793A"
    ), /* @__PURE__ */ React.createElement(
      Button,
      {
        size: "sm",
        variant: isSynced ? "primary" : "ghost",
        icon: isSynced ? "check" : "edit",
        onClick: () => {
          if (isSynced) {
            if (!confirm("\u540C\u671F\u5316\u30E2\u30FC\u30C9\u3092\u89E3\u9664\u3057\u3066\u88C5\u5099\u30C7\u30FC\u30BF\u306B\u623B\u3057\u307E\u3059\u304B\uFF1F\n\u624B\u52D5\u7DE8\u96C6\u3057\u305F\u5185\u5BB9\u306F\u6B8B\u308A\u307E\u305B\u3093\u3002")) return;
            dispatch({ type: "SET_SYNCED_MANUAL", value: false });
            if (state.personaSrc) {
              dispatch({ type: "EQUIP_PERSONA", mode: state.personaMode, no: state.personaNo, src: state.personaSrc });
            }
            toast("\u540C\u671F\u5316\u30E2\u30FC\u30C9\u3092\u89E3\u9664");
          } else {
            dispatch({ type: "SET_SYNCED_MANUAL", value: true });
            toast("\u540C\u671F\u5316\uFF1A\u5168\u9805\u76EE\u3092\u624B\u52D5\u7DE8\u96C6\u53EF\u80FD\u306B");
          }
        },
        title: isSynced ? "\u540C\u671F\u5316\u3092\u89E3\u9664" : "\u540C\u671F\u5316\uFF1A\u30B9\u30C6\u30FC\u30BF\u30B9\u30FB\u30D1\u30C3\u30B7\u30D6\u30FB\u30B9\u30AD\u30EB\u30FB\u56FA\u6709\u30D0\u30D5\u3092\u624B\u52D5\u3067\u66F8\u304D\u63DB\u3048\u53EF\u80FD\u306B\u3059\u308B"
      },
      isSynced ? "\u540C\u671F\u5316\uFF1AON" : "\u25C8 \u540C\u671F\u5316\u3057\u3066\u624B\u52D5\u7DE8\u96C6"
    ), /* @__PURE__ */ React.createElement(
      Button,
      {
        size: "sm",
        variant: "ghost",
        icon: "x",
        onClick: () => {
          dispatch({ type: "UNEQUIP_PERSONA" });
          toast("\u88C5\u5099\u3092\u89E3\u9664");
        },
        title: "\u88C5\u5099\u3092\u89E3\u9664"
      },
      "\u88C5\u5099\u89E3\u9664"
    ), /* @__PURE__ */ React.createElement("div", { style: { flex: 1 } }), /* @__PURE__ */ React.createElement(
      Button,
      {
        size: "sm",
        icon: onExpand.expanded ? "chevronU" : "chevronD",
        onClick: () => onExpand.set(!onExpand.expanded),
        title: onExpand.expanded ? "\u4E00\u89A7\u3092\u6298\u308A\u7573\u3080" : "\u5225\u306E\u4EBA\u683C\u3092\u9078\u3076 (Codex \u3092\u5C55\u958B)"
      },
      onExpand.expanded ? "\u4E00\u89A7\u3092\u7573\u3080" : "\u5225\u306E\u4EBA\u683C\u3092\u9078\u3076"
    ))), /* @__PURE__ */ React.createElement("div", { className: "es-hint" }, isSynced ? "\u540C\u671F\u5316\u30E2\u30FC\u30C9\uFF1A\u53F3\u5074\u30D1\u30CD\u30EB\u306E\u8A73\u7D30\u306F\u88C5\u5099\u6642\u70B9\u306E\u60C5\u5831\u3002\u7DE8\u96C6\u306F\u4E0B\u306E\u300CBase Info\u300D/ \u30B9\u30AD\u30EB\u30FB\u30D1\u30C3\u30B7\u30D6\u5404\u30BB\u30AF\u30B7\u30E7\u30F3\u3067\u884C\u3048\u307E\u3059\u3002" : "\u88C5\u5099\u30C7\u30FC\u30BF\u306E\u624B\u52D5\u66F8\u304D\u63DB\u3048\u3092\u884C\u3044\u305F\u3044\u5834\u5408\u306F\u300C\u25C8 \u540C\u671F\u5316\u3057\u3066\u624B\u52D5\u7DE8\u96C6\u300D\u3092\u62BC\u3057\u3066\u304F\u3060\u3055\u3044\u3002"));
  };
  const PersonaCodex = ({ state, dispatch }) => {
    const { ui, personaMode, personaNo, favorites, historyRecent, roster } = state;
    const mode = ui.codexMode || "n";
    const [selectedPersona, setSelectedPersona] = React.useState(null);
    const [showEquippedDetail, setShowEquippedDetail] = React.useState(!!state.personaSrc);
    React.useEffect(() => {
      if (state.personaSrc) setShowEquippedDetail(true);
    }, [state.personaSrc?.no, state.personaSrc?.name]);
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
        const src = r.mode === "n" ? DB.normal_personas : DB.tokui_personas;
        const found = src.find((x) => x.no === r.no);
        return found ? { p: found, mode: r.mode, roster: r } : null;
      }).filter(Boolean);
      return [];
    }, [mode, favorites, historyRecent, roster]);
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
      return Array.from(counts.entries()).filter(([_, c]) => c >= 2).map(([k]) => k).sort();
    }, [pool]);
    const filtered = React.useMemo(() => {
      const q = (ui.searchQuery || "").trim().toLowerCase();
      return pool.filter(({ p }) => {
        if (ui.filterSins.length) {
          const sinSet = new Set((p.skills || []).map((sk) => sk.sin).filter(Boolean));
          if (!ui.filterSins.every((s) => sinSet.has(s))) return false;
        }
        if (ui.filterKws.length) {
          const kws = new Set(p.keywords || []);
          if (!ui.filterKws.every((k) => kws.has(k))) return false;
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
    }, [pool, ui]);
    const sorted = React.useMemo(() => {
      const arr = filtered.slice();
      const sortKey = ui.sortBy || "no";
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
    }, [filtered, ui.sortBy]);
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
      filterResB: ""
    } });
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
    const hasActiveFilters = ui.filterSins.length || ui.filterKws.length || ui.filterAffs.length || ui.searchQuery || ui.filterResS || ui.filterResP || ui.filterResB;
    const equippedPersona = state.personaSrc;
    const equippedMeta = equippedPersona ? { p: equippedPersona, mode: state.personaMode || "n" } : null;
    return /* @__PURE__ */ React.createElement("div", { className: "codex-shell" }, /* @__PURE__ */ React.createElement("div", { className: "persona-workspace" }, equippedPersona && /* @__PURE__ */ React.createElement("div", { className: "equipped-unified" }, /* @__PURE__ */ React.createElement(
      EquippedSummary,
      {
        state,
        dispatch,
        onExpand: { expanded: codexExpanded, set: setCodexExpanded },
        onShowDetail: setShowEquippedDetail,
        detailShown: showEquippedDetail
      }
    ), equippedPersona && showEquippedDetail && /* @__PURE__ */ React.createElement("div", { className: "equipped-detail-wrap" }, /* @__PURE__ */ React.createElement("div", { className: "equipped-detail-inner" }, /* @__PURE__ */ React.createElement(
      PersonaDetail,
      {
        persona: equippedPersona,
        mode: state.personaMode || "n",
        isEquipped: true,
        onEquip: () => {
        },
        onUnequip: () => {
          dispatch({ type: "UNEQUIP_PERSONA" });
          setShowEquippedDetail(false);
          toast("\u88C5\u5099\u3092\u89E3\u9664");
        },
        onAddRoster: () => {
        },
        isInRoster: true,
        embed: true
      }
    )))), equippedPersona && /* @__PURE__ */ React.createElement(
      "div",
      {
        className: "pw-listbar",
        onClick: () => setCodexExpanded(!codexExpanded),
        role: "button",
        title: codexExpanded ? "\u4EBA\u683C\u4E00\u89A7\u3092\u6298\u308A\u7573\u3080" : "\u4EBA\u683C\u4E00\u89A7\u3092\u5C55\u958B\u3057\u3066\u5225\u306E\u4EBA\u683C\u3092\u9078\u3076"
      },
      /* @__PURE__ */ React.createElement("span", { className: "caret" }, codexExpanded ? "\u25BC" : "\u25B6"),
      /* @__PURE__ */ React.createElement("span", { style: { fontFamily: "var(--f-display)", fontSize: "var(--fs-11)", letterSpacing: "0.14em", color: "var(--tx-2)" } }, "PERSONA LIST / \u4EBA\u683C\u4E00\u89A7"),
      /* @__PURE__ */ React.createElement("span", { style: { fontSize: "var(--fs-10)", color: "var(--tx-mute)" } }, codexExpanded ? `${sorted.length}\u4EF6\u8868\u793A\u4E2D` : "\u6298\u308A\u7573\u307F\u4E2D"),
      /* @__PURE__ */ React.createElement("div", { style: { flex: 1 } }),
      !codexExpanded && /* @__PURE__ */ React.createElement("span", { style: { fontSize: "var(--fs-10)", color: "var(--gold)" } }, "\u30AF\u30EA\u30C3\u30AF\u3067\u5C55\u958B")
    ), (!equippedPersona || codexExpanded) && /* @__PURE__ */ React.createElement("div", { className: "codex pw-body" }, /* @__PURE__ */ React.createElement("div", { className: "codex-main" }, /* @__PURE__ */ React.createElement("div", { className: "codex-modes" }, modes.map((m) => /* @__PURE__ */ React.createElement("button", { key: m.value, className: mode === m.value ? "is-active" : "", onClick: () => dispatch({ type: "SET_UI", ui: { codexMode: m.value } }), type: "button" }, m.label, " ", /* @__PURE__ */ React.createElement("span", { className: "count" }, m.count))), /* @__PURE__ */ React.createElement("div", { style: { flex: 1 } }), /* @__PURE__ */ React.createElement(
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
    )), /* @__PURE__ */ React.createElement("div", { className: "codex-filters" }, /* @__PURE__ */ React.createElement("div", { className: "codex-filter-row" }, /* @__PURE__ */ React.createElement("div", { className: "codex-search" }, /* @__PURE__ */ React.createElement(Icon, { name: "search", size: 14 }), /* @__PURE__ */ React.createElement("input", { type: "text", placeholder: "\u540D\u524D\u30FB\u30D1\u30C3\u30B7\u30D6\u52B9\u679C\u30FB\u30AD\u30FC\u30EF\u30FC\u30C9\u3067\u691C\u7D22...", value: ui.searchQuery || "", onChange: (e) => dispatch({ type: "SET_UI", ui: { searchQuery: e.target.value } }) })), /* @__PURE__ */ React.createElement("div", { className: "codex-count" }, /* @__PURE__ */ React.createElement("strong", null, sorted.length), " / ", pool.length), /* @__PURE__ */ React.createElement("select", { className: "codex-sort", value: ui.sortBy || "no", onChange: (e) => dispatch({ type: "SET_UI", ui: { sortBy: e.target.value } }) }, /* @__PURE__ */ React.createElement("optgroup", { label: "\u57FA\u672C" }, /* @__PURE__ */ React.createElement("option", { value: "no" }, "No.\u9806"), /* @__PURE__ */ React.createElement("option", { value: "name" }, "\u540D\u524D\u9806"), /* @__PURE__ */ React.createElement("option", { value: "hp" }, "HP\u964D\u9806"), /* @__PURE__ */ React.createElement("option", { value: "san" }, "SAN\u964D\u9806"), /* @__PURE__ */ React.createElement("option", { value: "speed" }, "\u901F\u5EA6\u4E0A\u9650\u964D\u9806")), /* @__PURE__ */ React.createElement("optgroup", { label: "\u5927\u7F6A\u30B9\u30AD\u30EB\u6570\u304C\u591A\u3044\u9806" }, SINS_ORDER.map((s) => /* @__PURE__ */ React.createElement("option", { key: s, value: `sin:${s}` }, s, "\u30B9\u30AD\u30EB\u591A\u3044\u9806"))))), /* @__PURE__ */ React.createElement("div", { className: "codex-filter-row" }, /* @__PURE__ */ React.createElement("span", { className: "filter-label" }, "\u5927\u7F6A"), /* @__PURE__ */ React.createElement("div", { className: "chips-group" }, SINS_ORDER.map((s) => /* @__PURE__ */ React.createElement(
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
    }))), allKws.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "codex-filter-row" }, /* @__PURE__ */ React.createElement("span", { className: "filter-label" }, "\u30AD\u30FC\u30EF\u30FC\u30C9"), /* @__PURE__ */ React.createElement("div", { className: "chips-group" }, allKws.slice(0, 20).map((k) => /* @__PURE__ */ React.createElement(Chip, { key: k, size: "sm", active: ui.filterKws.includes(k), onClick: () => toggleKw(k) }, k)))), hasActiveFilters ? /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "flex-end" } }, /* @__PURE__ */ React.createElement(Button, { variant: "ghost", size: "sm", onClick: resetFilters, icon: "x" }, "\u30D5\u30A3\u30EB\u30BF\u3092\u30EA\u30BB\u30C3\u30C8")) : null), /* @__PURE__ */ React.createElement("div", { className: "codex-grid" }, sorted.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "empty", style: { gridColumn: "1/-1" } }, mode === "fav" && favorites.length === 0 ? "\u2605\u3092\u30AF\u30EA\u30C3\u30AF\u3057\u3066\u304A\u6C17\u306B\u5165\u308A\u3092\u8FFD\u52A0\u3057\u3066\u304F\u3060\u3055\u3044" : mode === "history" && historyRecent.length === 0 ? "\u307E\u3060\u4EBA\u683C\u3092\u9078\u3093\u3067\u3044\u307E\u305B\u3093" : mode === "roster" && roster.personas.length === 0 ? "\u88C5\u5099\u3057\u305F\u4EBA\u683C\u306F\u6240\u6301\u30EA\u30B9\u30C8\u306B\u81EA\u52D5\u8FFD\u52A0\u3055\u308C\u307E\u3059" : "\u8A72\u5F53\u3059\u308B\u4EBA\u683C\u304C\u3042\u308A\u307E\u305B\u3093 \u2014 \u30D5\u30A3\u30EB\u30BF\u3092\u30EA\u30BB\u30C3\u30C8\u3057\u3066\u304F\u3060\u3055\u3044") : sorted.map(({ p, mode: m }) => /* @__PURE__ */ React.createElement(
      PersonaCard,
      {
        key: `${m}:${p.no}`,
        persona: p,
        mode: m,
        isEquipped: personaMode === m && personaNo === p.no,
        isActive: selectedPersona === p,
        isFav: favorites.includes(`${m}:${p.no}`),
        onSelect: setSelectedPersona,
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
        isInRoster: currentIsInRoster
      }
    )), /* @__PURE__ */ React.createElement("div", { className: "codex-unique-footer" }, /* @__PURE__ */ React.createElement(UniqueBuffsBlock, { state, dispatch }))));
  };
  window.PersonaCodex = PersonaCodex;
  window.getPrimarySin = getPrimarySin;
  window.inferAffiliation = inferAffiliation;
  window.decoratePersona = decoratePersona;
})();
