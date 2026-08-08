(() => {
  const SKILL_TYPES = ["\u6253\u6483", "\u65AC\u6483", "\u8CAB\u901A", "\u9632\u5FA1", "\u56DE\u907F", "\u53CD\u6483", "\u6253\u6483\u53CD\u6483", "\u65AC\u6483\u53CD\u6483", "\u8CAB\u901A\u53CD\u6483", "\u30DE\u30C3\u30C1\u53EF\u80FD\u6253\u6483\u53CD\u6483", "\u30DE\u30C3\u30C1\u53EF\u80FD\u65AC\u6483\u53CD\u6483", "\u30DE\u30C3\u30C1\u53EF\u80FD\u8CAB\u901A\u53CD\u6483", "\u30DE\u30C3\u30C1\u53EF\u80FD\u9632\u5FA1"];
  const SKILL_SINS = ["\u61A4\u6012", "\u8272\u6B32", "\u6020\u60F0", "\u66B4\u98DF", "\u6182\u9B31", "\u50B2\u6162", "\u5AC9\u59AC", "\u7279\u6B8A"];
  const SKILL_RANK_SUGGESTIONS = [
    "\u30B9\u30AD\u30EB0",
    "\u30B9\u30AD\u30EB1",
    "\u30B9\u30AD\u30EB2",
    "\u30B9\u30AD\u30EB3",
    "\u30B9\u30AD\u30EB4",
    "\u30B9\u30AD\u30EB5",
    "\u30B9\u30AD\u30EB6",
    "\u30B9\u30AD\u30EB0-2",
    "\u30B9\u30AD\u30EB1-2",
    "\u30B9\u30AD\u30EB2-2",
    "\u30B9\u30AD\u30EB3-2",
    "\u30B9\u30AD\u30EB4-2",
    "\u899A\u9192\u30B9\u30AD\u30EB",
    "\u4FB5\u8755\u30B9\u30AD\u30EB",
    "\u30DE\u30C3\u30C1\u53EF\u80FD\u9632\u5FA1",
    "\u30BC\u30ED\u30B9\u30AD\u30EB",
    "\u6D3E\u751F"
  ];
  const SKILL_AOES = ["\u5E83\u57DF", "\u5E83\u57DF\u4E71\u5C04"];
  const AutoTextarea = ({ value, onChange, minRows = 1, style = {}, className = "", ...rest }) => {
    const ref = React.useRef(null);
    const resize = React.useCallback(() => {
      const el = ref.current;
      if (!el) return;
      el.style.height = "auto";
      el.style.height = Math.max(el.scrollHeight, minRows * 20) + "px";
    }, [minRows]);
    React.useEffect(() => {
      resize();
    }, [value, resize]);
    return /* @__PURE__ */ React.createElement(
      "textarea",
      {
        ref,
        className,
        value: value || "",
        onChange: (e) => {
          onChange(e);
          requestAnimationFrame(resize);
        },
        onInput: resize,
        style: { ...style, overflow: "hidden", resize: "none" },
        ...rest
      }
    );
  };
  const DiceRow = ({ dice, idx, skillRankNum, onPatch, onRemove }) => {
    const dPlus = !!dice.dPlus;
    const dCnt = !!dice.dCnt;
    const rn = skillRankNum || "";
    return /* @__PURE__ */ React.createElement("div", { className: "deck-dice-row" }, /* @__PURE__ */ React.createElement("span", { className: "deck-dice-idx" }, idx + 1), /* @__PURE__ */ React.createElement("div", { className: "deck-dice-roll-col" }, /* @__PURE__ */ React.createElement(
      "input",
      {
        className: "deck-dice-roll",
        placeholder: "2d7",
        value: dice.roll || "",
        onChange: (e) => onPatch({ roll: e.target.value }),
        title: "\u30C0\u30A4\u30B9\u5F0F\uFF08\u4F8B\uFF1A2d7\u30011-1d4\u3001(2)d5\uFF09"
      }
    ), /* @__PURE__ */ React.createElement(
      "input",
      {
        className: "deck-dice-dval",
        placeholder: "d\u5024\u4E0A\u66F8\u304D",
        value: dice.dval || "",
        onChange: (e) => onPatch({ dval: e.target.value }),
        title: "d\u5024\u306E\u4E0A\u66F8\u304D\uFF08\u7A7A\u6B04\u306A\u3089\u4E0A\u306E\u30C0\u30A4\u30B9\u5F0F\u304B\u3089\u81EA\u52D5\u62BD\u51FA\uFF09"
      }
    ), /* @__PURE__ */ React.createElement("div", { className: "deck-dice-var" }, /* @__PURE__ */ React.createElement("label", { className: `deck-dice-var-chk${dPlus ? " is-on" : ""}`, title: `\u3053\u306E\u30C0\u30A4\u30B9\u306E d\u5024\u3092 {S${rn}-${idx + 1}d\u5024} \u3067\u53EF\u5909\u306B\u3059\u308B (v45\u76F8\u5F53)` }, /* @__PURE__ */ React.createElement("input", { type: "checkbox", checked: dPlus, onChange: (e) => onPatch({ dPlus: e.target.checked }) }), /* @__PURE__ */ React.createElement("span", null, "d\u5024")), /* @__PURE__ */ React.createElement("label", { className: `deck-dice-var-chk${dCnt ? " is-on" : ""}`, title: `\u3053\u306E\u30C0\u30A4\u30B9\u306E d\u6570\u3092 {S${rn}-${idx + 1}d\u6570} \u3067\u53EF\u5909\u306B\u3059\u308B (v45\u76F8\u5F53)` }, /* @__PURE__ */ React.createElement("input", { type: "checkbox", checked: dCnt, onChange: (e) => onPatch({ dCnt: e.target.checked }) }), /* @__PURE__ */ React.createElement("span", null, "d\u6570")))), /* @__PURE__ */ React.createElement(
      AutoTextarea,
      {
        className: "deck-dice-eff",
        placeholder: "\u30C0\u30A4\u30B9\u52B9\u679C\uFF08\u5185\u5BB9\u91CF\u306B\u5408\u308F\u305B\u3066\u81EA\u52D5\u62E1\u5F35\uFF09",
        value: dice.effect,
        onChange: (e) => onPatch({ effect: e.target.value }),
        minRows: 1
      }
    ), /* @__PURE__ */ React.createElement("button", { className: "deck-dice-del", onClick: onRemove, title: "\u524A\u9664" }, "\xD7"));
  };
  const ReadonlySkillCard = ({ skill, onEdit }) => /* @__PURE__ */ React.createElement("div", { className: "deck-card deck-focus deck-focus-readonly", "data-sin": skill.sin || "" }, /* @__PURE__ */ React.createElement("div", { className: "deck-card-head", style: { marginBottom: "var(--s-3)" } }, /* @__PURE__ */ React.createElement("span", { className: "deck-rank", style: { background: "var(--gold-tint)", color: "var(--gold)", border: "1px solid var(--gold-line)", padding: "4px 10px", fontFamily: "var(--f-display)", fontWeight: 600, fontSize: "var(--fs-12)", borderRadius: "var(--r-sm)", letterSpacing: "0.08em" } }, skill.rank || "\u30B9\u30AD\u30EB"), skill.type && /* @__PURE__ */ React.createElement("span", { style: { marginLeft: 8, fontFamily: "var(--f-mono)", fontSize: "var(--fs-10)", color: "var(--tx-dim)", padding: "3px 8px", background: "var(--surface-inset)", border: "1px solid var(--line-dim)", borderRadius: "var(--r-sm)" } }, skill.type), skill.sin && /* @__PURE__ */ React.createElement("span", { className: `sin-tag is-sin-${skill.sin}`, "data-sin": skill.sin, style: { marginLeft: 6, padding: "3px 8px", fontFamily: "var(--f-display)", fontWeight: 600, fontSize: "var(--fs-10)", borderRadius: "var(--r-sm)", letterSpacing: "0.08em" } }, skill.sin), skill.aoe && /* @__PURE__ */ React.createElement("span", { style: { marginLeft: 6, fontFamily: "var(--f-mono)", fontSize: "var(--fs-10)", color: "var(--gold)", padding: "3px 8px", border: "1px solid var(--gold-line)", borderRadius: "var(--r-sm)" } }, skill.aoe), /* @__PURE__ */ React.createElement("div", { style: { flex: 1 } }), /* @__PURE__ */ React.createElement(Button, { variant: "ghost", size: "sm", icon: "edit", onClick: onEdit }, "\u624B\u52D5\u7DE8\u96C6")), /* @__PURE__ */ React.createElement("div", { className: "deck-name", style: { fontFamily: "var(--f-display)", fontWeight: 700, fontSize: "var(--fs-18)", color: "var(--tx)", marginBottom: "var(--s-3)", lineHeight: 1.2 } }, skill.name || "(\u540D\u79F0\u672A\u8A2D\u5B9A)"), skill.effect && /* @__PURE__ */ React.createElement("div", { style: { marginBottom: "var(--s-3)" } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--f-display)", fontSize: 9, letterSpacing: "0.18em", color: "var(--gold)", textTransform: "uppercase", marginBottom: 4 } }, "EFFECT / \u52B9\u679C"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-12)", color: "var(--tx-2)", lineHeight: 1.75, padding: "8px 12px", background: "var(--surface-inset)", border: "1px solid var(--line-dim)", borderLeft: "3px solid var(--gold)", borderRadius: "var(--r-sm)", whiteSpace: "pre-wrap" } }, window.formatEffectLines ? window.formatEffectLines(skill.effect) : skill.effect)), (skill.dice || []).length > 0 && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--f-display)", fontSize: 9, letterSpacing: "0.18em", color: "var(--gold)", textTransform: "uppercase", marginBottom: 4 } }, "DICE / \u30C0\u30A4\u30B9"), /* @__PURE__ */ React.createElement("div", { className: "ro-dice-list" }, (skill.dice || []).map((d, i) => /* @__PURE__ */ React.createElement("div", { key: i, className: "ro-dice-row" }, /* @__PURE__ */ React.createElement("span", { className: "ro-dice-idx" }, i + 1), /* @__PURE__ */ React.createElement("span", { className: "ro-dice-roll" }, d.roll || "-"), /* @__PURE__ */ React.createElement("span", { className: "ro-dice-eff", style: { whiteSpace: "pre-wrap" } }, d.effect ? window.formatEffectLines ? window.formatEffectLines(d.effect) : d.effect : /* @__PURE__ */ React.createElement("span", { style: { color: "var(--tx-mute)", fontStyle: "italic" } }, "\u52B9\u679C\u306A\u3057")))))));
  const FocusedSkillCard = ({ skill, onPatch, onRemove, onAddDice, onPatchDice, onRemoveDice }) => /* @__PURE__ */ React.createElement("div", { className: "deck-card deck-focus", "data-sin": skill.sin || "" }, /* @__PURE__ */ React.createElement("div", { className: "deck-card-head" }, /* @__PURE__ */ React.createElement(
    "input",
    {
      list: "skill-rank-list",
      className: "deck-rank",
      value: skill.rank || "",
      onChange: (e) => onPatch({ rank: e.target.value }),
      placeholder: "\u30B9\u30AD\u30EB\u540D/\u6D3E\u751F\u540D\uFF08\u81EA\u7531\u5165\u529B\uFF09",
      style: {
        background: "var(--gold-tint)",
        color: "var(--gold)",
        border: "1px solid var(--gold-line)",
        cursor: "text",
        fontSize: "var(--fs-12)",
        padding: "4px 10px",
        fontFamily: "var(--f-display)",
        fontWeight: 600,
        borderRadius: "var(--r-sm)",
        minWidth: 180,
        letterSpacing: "0.06em"
      },
      title: "\u898F\u5B9A\u540D(\u30B9\u30AD\u30EB0\u301C)\u3092\u4E88\u6E2C\u3057\u3064\u3064\u3001\u6D3E\u751F\u30FB\u81EA\u4F5C\u540D\u3082\u81EA\u7531\u5165\u529B\u53EF\u80FD"
    }
  ), /* @__PURE__ */ React.createElement("datalist", { id: "skill-rank-list" }, SKILL_RANK_SUGGESTIONS.map((r) => /* @__PURE__ */ React.createElement("option", { key: r, value: r }))), /* @__PURE__ */ React.createElement("div", { style: { flex: 1 } }), /* @__PURE__ */ React.createElement("button", { className: "btn btn-sm", onClick: onRemove, style: { color: "var(--err)", borderColor: "color-mix(in oklab, var(--err) 40%, var(--line))" }, title: "\u3053\u306E\u30B9\u30AD\u30EB\u3092\u524A\u9664" }, /* @__PURE__ */ React.createElement(Icon, { name: "trash", size: 12 }), " \u524A\u9664")), /* @__PURE__ */ React.createElement(
    "input",
    {
      className: "deck-name-input",
      placeholder: "\u30B9\u30AD\u30EB\u540D\uFF08\u81EA\u7531\u5165\u529B\u53EF\uFF09",
      value: skill.name || "",
      onChange: (e) => onPatch({ name: e.target.value }),
      style: { fontSize: "var(--fs-16)" }
    }
  ), /* @__PURE__ */ React.createElement("div", { className: "deck-focus-body" }, /* @__PURE__ */ React.createElement("div", { className: "stack-3" }, /* @__PURE__ */ React.createElement("div", { className: "deck-meta" }, /* @__PURE__ */ React.createElement("div", { style: { flex: 1 } }, /* @__PURE__ */ React.createElement("label", { className: "field-label" }, "\u5C5E\u6027"), /* @__PURE__ */ React.createElement("select", { className: "select", value: skill.type || "", onChange: (e) => onPatch({ type: e.target.value }) }, /* @__PURE__ */ React.createElement("option", { value: "" }, "-"), SKILL_TYPES.map((t) => /* @__PURE__ */ React.createElement("option", { key: t, value: t }, t)))), /* @__PURE__ */ React.createElement("div", { style: { flex: 1 } }, /* @__PURE__ */ React.createElement("label", { className: "field-label" }, "\u5927\u7F6A"), /* @__PURE__ */ React.createElement(
    "select",
    {
      className: `select sin-select${skill.sin ? ` is-sin-${skill.sin}` : ""}`,
      value: skill.sin || "",
      onChange: (e) => onPatch({ sin: e.target.value }),
      "data-sin": skill.sin || ""
    },
    /* @__PURE__ */ React.createElement("option", { value: "" }, "-"),
    SKILL_SINS.map((s) => /* @__PURE__ */ React.createElement("option", { key: s, value: s }, s))
  )), /* @__PURE__ */ React.createElement("div", { style: { flex: 1 } }, /* @__PURE__ */ React.createElement("label", { className: "field-label" }, "\u5E83\u57DF\uFF08PDF\u516C\u5F0F: \u5E83\u57DF / \u5E83\u57DF\u4E71\u5C04\uFF09"), /* @__PURE__ */ React.createElement("select", { className: "select", value: skill.aoe || "", onChange: (e) => onPatch({ aoe: e.target.value }) }, /* @__PURE__ */ React.createElement("option", { value: "" }, "\u5358\u4F53\uFF08\u6307\u5B9A\u306A\u3057\uFF09"), SKILL_AOES.map((a) => /* @__PURE__ */ React.createElement("option", { key: a, value: a }, a)))), skill.aoe && /* @__PURE__ */ React.createElement("div", { style: { flex: 0.6 } }, /* @__PURE__ */ React.createElement("label", { className: "field-label" }, "\u5E83\u57DF\u5BFE\u8C61\u4EBA\u6570"), /* @__PURE__ */ React.createElement(
    "input",
    {
      className: "input",
      type: "number",
      min: "1",
      max: "99",
      placeholder: "\u4EBA\u6570",
      value: skill.aoeCount || "",
      onChange: (e) => onPatch({ aoeCount: e.target.value }),
      title: "\u5E83\u57DF\u30B9\u30AD\u30EB\u306E\u5BFE\u8C61\u4EBA\u6570"
    }
  ))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "field-label" }, "\u52B9\u679C"), /* @__PURE__ */ React.createElement(
    AutoTextarea,
    {
      className: "deck-effect",
      placeholder: "\u4F7F\u7528\u6642\uFF0F\u30DE\u30C3\u30C1\u52DD\u5229\u6642 \u7B49\u306E\u52B9\u679C\uFF08\u5185\u5BB9\u91CF\u306B\u5408\u308F\u305B\u3066\u81EA\u52D5\u62E1\u5F35\uFF09",
      value: skill.effect,
      onChange: (e) => onPatch({ effect: e.target.value }),
      minRows: 4,
      style: { fontSize: "var(--fs-12)" }
    }
  )), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("label", { className: "field-label" }, "\u30AF\u30A4\u30C3\u30AF\u30B3\u30DE\u30F3\u30C9 (\u4EFB\u610F)"), /* @__PURE__ */ React.createElement(
    "input",
    {
      className: "input",
      placeholder: "\u4F8B\uFF1A:\u51FA\u8840+2 :\u547C\u5438+1",
      value: skill.quick || "",
      onChange: (e) => onPatch({ quick: e.target.value }),
      style: { fontFamily: "var(--f-mono)", fontSize: "var(--fs-11)" }
    }
  )), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "var(--s-3)", alignItems: "center", padding: "8px 12px", background: "var(--surface-inset)", border: "1px solid var(--line-dim)", borderRadius: "var(--r-sm)" } }, /* @__PURE__ */ React.createElement("span", { style: { fontFamily: "var(--f-display)", fontSize: 10, letterSpacing: "0.14em", color: "var(--tx-dim)", textTransform: "uppercase" } }, "\u30B9\u30AD\u30EB\u5168\u4F53"), /* @__PURE__ */ React.createElement(
    "label",
    {
      style: { display: "flex", alignItems: "center", gap: 6, fontSize: "var(--fs-11)", color: "var(--tx-2)", cursor: "pointer" },
      title: `\u3053\u306E\u30B9\u30AD\u30EB\u306E\u5168\u30C0\u30A4\u30B9\u306E d\u5024\u3092 {S${String(skill.rank || "").replace(/[^0-9-]/g, "")}d\u5024} \u3067\u53EF\u5909\u306B\u3059\u308B`
    },
    /* @__PURE__ */ React.createElement("input", { type: "checkbox", checked: !!skill.dPlus, onChange: (e) => onPatch({ dPlus: e.target.checked }) }),
    /* @__PURE__ */ React.createElement("span", null, "\u5168\u30C0\u30A4\u30B9 d\u5024\u3092\u53EF\u5909")
  ), /* @__PURE__ */ React.createElement(
    "label",
    {
      style: { display: "flex", alignItems: "center", gap: 6, fontSize: "var(--fs-11)", color: "var(--tx-2)", cursor: "pointer" },
      title: `\u3053\u306E\u30B9\u30AD\u30EB\u306E\u5168\u30C0\u30A4\u30B9\u306E d\u6570\u3092 {S${String(skill.rank || "").replace(/[^0-9-]/g, "")}d\u6570} \u3067\u53EF\u5909\u306B\u3059\u308B`
    },
    /* @__PURE__ */ React.createElement("input", { type: "checkbox", checked: !!skill.dCnt, onChange: (e) => onPatch({ dCnt: e.target.checked }) }),
    /* @__PURE__ */ React.createElement("span", null, "\u5168\u30C0\u30A4\u30B9 d\u6570\u3092\u53EF\u5909")
  ), /* @__PURE__ */ React.createElement("span", { style: { marginLeft: "auto", fontSize: 9, color: "var(--tx-mute)", fontStyle: "italic" } }, "\u500B\u5225\u30C1\u30A7\u30C3\u30AF\u306F\u5404\u30C0\u30A4\u30B9\u884C\u3002\u5168\u4F53\u3068\u500B\u5225\u306FOR\u5408\u6210\u3055\u308C\u307E\u3059"))), /* @__PURE__ */ React.createElement("div", { className: "stack-2" }, /* @__PURE__ */ React.createElement("label", { className: "field-label" }, "\u30C0\u30A4\u30B9 (\u4F55\u500B\u3067\u3082\u8FFD\u52A0\u53EF)"), /* @__PURE__ */ React.createElement("div", { className: "deck-dice", style: { gap: 6 } }, (skill.dice || []).map((d, i) => /* @__PURE__ */ React.createElement(
    DiceRow,
    {
      key: i,
      dice: d,
      idx: i,
      skillRankNum: String(skill.rank || "").replace(/[^0-9-]/g, ""),
      onPatch: (patch) => onPatchDice(i, patch),
      onRemove: () => onRemoveDice(i)
    }
  )), /* @__PURE__ */ React.createElement("button", { className: "deck-add-dice", onClick: onAddDice }, "\uFF0B \u30C0\u30A4\u30B9\u3092\u8FFD\u52A0"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 10, color: "var(--tx-mute)", fontFamily: "var(--f-display)", letterSpacing: "0.1em", marginTop: 4, lineHeight: 1.4 } }, "\u25C7 d\u5024/d\u6570 \u30C1\u30A7\u30C3\u30AF\uFF1A\u5B9F\u6226\u3067\u5909\u52D5\u3059\u308B\u30C0\u30A4\u30B9\u3092 ", /* @__PURE__ */ React.createElement("code", { style: { color: "var(--gold)" } }, `{S\u25C9-\u25B3d\u5024}`), " / ", /* @__PURE__ */ React.createElement("code", { style: { color: "var(--gold)" } }, `{S\u25C9-\u25B3d\u6570}`), " \u3067\u81EA\u52D5\u4EE3\u5165\u3055\u305B\u308B (v45\u4E92\u63DB)")))));
  function isSkillFromDB(sk, srcSkill) {
    if (!srcSkill) return false;
    if (sk.rank !== srcSkill.rank) return false;
    if (sk.name !== srcSkill.name) return false;
    if (sk.type !== (srcSkill.type || "")) return false;
    if ((sk.effect || "") !== (srcSkill.effect || "")) return false;
    const a = sk.dice || [], b = srcSkill.dice || [];
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if ((a[i].roll || "") !== (b[i].roll || "")) return false;
      if ((a[i].effect || "") !== (b[i].effect || "")) return false;
    }
    return true;
  }
  const SkillDeck = ({ state, dispatch }) => {
    const skills = state.skills || [];
    const [curIdx, setCurIdx] = React.useState(0);
    const [forceEditMap, setForceEditMap] = React.useState({});
    React.useEffect(() => {
      if (curIdx >= skills.length) setCurIdx(Math.max(0, skills.length - 1));
    }, [skills.length]);
    const patch = (id, patch2) => dispatch({ type: "PATCH_SKILL", id, patch: patch2 });
    const remove = (id) => {
      if (!confirm("\u3053\u306E\u30B9\u30AD\u30EB\u3092\u524A\u9664\u3057\u307E\u3059\u304B\uFF1F")) return;
      dispatch({ type: "REMOVE_SKILL", id });
      setCurIdx((i) => Math.max(0, i - 1));
    };
    const addSkill = () => {
      dispatch({ type: "ADD_SKILL" });
      setTimeout(() => setCurIdx(skills.length), 10);
    };
    const addDice = (id) => dispatch({ type: "ADD_DICE", skillId: id });
    const patchDice = (id, idx, patch2) => dispatch({ type: "PATCH_DICE", skillId: id, diceIdx: idx, patch: patch2 });
    const removeDice = (id, idx) => dispatch({ type: "REMOVE_DICE", skillId: id, diceIdx: idx });
    React.useEffect(() => {
      const onKey = (e) => {
        if (document.activeElement && ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) return;
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          setCurIdx((i) => Math.max(0, i - 1));
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          setCurIdx((i) => Math.min(skills.length - 1, i + 1));
        }
      };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }, [skills.length]);
    if (skills.length === 0) {
      return /* @__PURE__ */ React.createElement("div", { className: "deck" }, /* @__PURE__ */ React.createElement("div", { className: "deck-empty-cell", onClick: addSkill, style: { gridColumn: "1 / -1" } }, "\uFF0B \u6700\u521D\u306E\u30B9\u30AD\u30EB\u3092\u8FFD\u52A0"));
    }
    const cur = skills[curIdx] || skills[0];
    return /* @__PURE__ */ React.createElement("div", { className: "deck-wrap" }, /* @__PURE__ */ React.createElement("div", { className: "deck-nav" }, /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "deck-nav-btn",
        onClick: () => setCurIdx((i) => Math.max(0, i - 1)),
        disabled: curIdx === 0,
        title: "\u524D\u306E\u30B9\u30AD\u30EB (\u2190 \u30AD\u30FC)"
      },
      "\u2039"
    ), /* @__PURE__ */ React.createElement("div", { className: "deck-nav-info" }, /* @__PURE__ */ React.createElement("span", { className: "idx" }, String(curIdx + 1).padStart(2, "0"), " / ", String(skills.length).padStart(2, "0")), /* @__PURE__ */ React.createElement("span", { className: "cur" }, cur.rank || `\u30B9\u30AD\u30EB${curIdx}`, ": ", cur.name || "(\u540D\u79F0\u672A\u8A2D\u5B9A)"), /* @__PURE__ */ React.createElement("span", { style: { marginLeft: "auto", fontSize: "var(--fs-10)", color: "var(--tx-mute)", letterSpacing: "0.14em", fontFamily: "var(--f-display)" } }, "\u2190 \u2192 \u30AD\u30FC\u3067\u3082\u79FB\u52D5")), /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "deck-nav-btn",
        onClick: () => setCurIdx((i) => Math.min(skills.length - 1, i + 1)),
        disabled: curIdx === skills.length - 1,
        title: "\u6B21\u306E\u30B9\u30AD\u30EB (\u2192 \u30AD\u30FC)"
      },
      "\u203A"
    ), /* @__PURE__ */ React.createElement(Button, { size: "sm", icon: "plus", onClick: addSkill }, "\u30B9\u30AD\u30EB\u8FFD\u52A0")), (() => {
      const srcSkill = (state.personaSrc?.skills || [])[curIdx];
      const isAuto = !state.syncedManual && isSkillFromDB(cur, srcSkill);
      const forceEdit = !!forceEditMap[cur.id];
      if (isAuto && !forceEdit) {
        return /* @__PURE__ */ React.createElement(
          ReadonlySkillCard,
          {
            skill: cur,
            onEdit: () => setForceEditMap((m) => ({ ...m, [cur.id]: true }))
          }
        );
      }
      return /* @__PURE__ */ React.createElement(React.Fragment, null, isAuto && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: "var(--s-2)", padding: "4px 12px", background: "var(--gold-tint)", border: "1px solid var(--gold-line)", borderRadius: "var(--r-sm)" } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: "var(--fs-10)", color: "var(--gold)", letterSpacing: "0.14em", fontFamily: "var(--f-display)" } }, "\u25C8 \u624B\u52D5\u7DE8\u96C6\u30E2\u30FC\u30C9"), /* @__PURE__ */ React.createElement("div", { style: { flex: 1 } }), /* @__PURE__ */ React.createElement(Button, { variant: "ghost", size: "sm", icon: "eye", onClick: () => setForceEditMap((m) => ({ ...m, [cur.id]: false })) }, "\u30AB\u30FC\u30C9\u8868\u793A\u306B\u623B\u3059")), /* @__PURE__ */ React.createElement(
        FocusedSkillCard,
        {
          skill: cur,
          onPatch: (p) => patch(cur.id, p),
          onRemove: () => remove(cur.id),
          onAddDice: () => addDice(cur.id),
          onPatchDice: (idx, p) => patchDice(cur.id, idx, p),
          onRemoveDice: (idx) => removeDice(cur.id, idx)
        }
      ));
    })(), /* @__PURE__ */ React.createElement("div", { className: "deck-thumbs" }, skills.map((sk, i) => /* @__PURE__ */ React.createElement(
      "div",
      {
        key: sk.id,
        className: `deck-thumb${i === curIdx ? " is-active" : ""}`,
        "data-sin": sk.sin || "",
        onClick: () => setCurIdx(i),
        title: `${sk.rank}: ${sk.name}`
      },
      /* @__PURE__ */ React.createElement("div", { className: "deck-thumb-head" }, /* @__PURE__ */ React.createElement("div", { className: "deck-thumb-rank" }, sk.rank), /* @__PURE__ */ React.createElement("div", { className: "deck-thumb-reorder" }, /* @__PURE__ */ React.createElement(
        "button",
        {
          className: "deck-thumb-rbtn",
          disabled: i === 0,
          onClick: (e) => {
            e.stopPropagation();
            dispatch({ type: "REORDER_LIST", field: "skills", key: sk.id, dir: -1 });
            if (curIdx === i) setCurIdx(i - 1);
          },
          title: "\u5DE6\u3078 (\u4E26\u3073\u66FF\u3048)"
        },
        "\u2039"
      ), /* @__PURE__ */ React.createElement(
        "button",
        {
          className: "deck-thumb-rbtn",
          disabled: i === skills.length - 1,
          onClick: (e) => {
            e.stopPropagation();
            dispatch({ type: "REORDER_LIST", field: "skills", key: sk.id, dir: 1 });
            if (curIdx === i) setCurIdx(i + 1);
          },
          title: "\u53F3\u3078 (\u4E26\u3073\u66FF\u3048)"
        },
        "\u203A"
      ))),
      /* @__PURE__ */ React.createElement("div", { className: "deck-thumb-name" }, sk.name || "(\u672A\u8A2D\u5B9A)")
    )), /* @__PURE__ */ React.createElement("button", { className: "deck-thumb-add", onClick: addSkill, title: "\u30B9\u30AD\u30EB\u8FFD\u52A0" }, "\uFF0B")));
  };
  window.SkillDeck = SkillDeck;
})();
