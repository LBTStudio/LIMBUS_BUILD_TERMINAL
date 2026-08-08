(() => {
  const SIN_LIST = ["\u61A4\u6012", "\u8272\u6B32", "\u6020\u60F0", "\u66B4\u98DF", "\u6182\u9B31", "\u50B2\u6162", "\u5AC9\u59AC"];
  const BaseSection = ({ state, dispatch }) => {
    const setF = (field, value) => dispatch({ type: "SET_FIELD", field, value });
    return /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--s-4)" } }, /* @__PURE__ */ React.createElement("div", { className: "stack-3" }, /* @__PURE__ */ React.createElement(Field, { label: "CHARACTER NAME / \u30AD\u30E3\u30E9\u30AF\u30BF\u30FC\u540D" }, /* @__PURE__ */ React.createElement("input", { className: "input", placeholder: "\u4F8B\uFF1A\u9ED2\u96F2\u4F1A\u7D44\u54E1 - \u6607", value: state.charName, onChange: (e) => setF("charName", e.target.value) })), /* @__PURE__ */ React.createElement(Field, { label: "PLAYER NAME" }, /* @__PURE__ */ React.createElement("input", { className: "input", placeholder: "PL\u540D", value: state.plName, onChange: (e) => setF("plName", e.target.value) })), /* @__PURE__ */ React.createElement(Field, { label: "IMAGE URL / \u7ACB\u3061\u7D75URL\uFF08\u8907\u6570\u884C\u53EF\u30011\u884C\u76EE=\u57FA\u672C\u3001\u4EE5\u964D=\u5DEE\u5206\uFF09" }, /* @__PURE__ */ React.createElement("textarea", { className: "textarea", rows: 3, placeholder: "https://...", value: state.imgUrls, onChange: (e) => setF("imgUrls", e.target.value) })), /* @__PURE__ */ React.createElement(Field, { label: "COLOR / \u99D2\u306E\u8272" }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8, alignItems: "center" } }, /* @__PURE__ */ React.createElement("input", { type: "color", value: state.color, onChange: (e) => setF("color", e.target.value), style: { width: 44, height: 36, padding: 2, background: "var(--surface-inset)", border: "1px solid var(--line)", borderRadius: "var(--r)", cursor: "pointer" } }), /* @__PURE__ */ React.createElement("input", { className: "input", value: state.color, onChange: (e) => setF("color", e.target.value), style: { flex: 1, fontFamily: "var(--f-mono)" } })))), /* @__PURE__ */ React.createElement("div", { className: "stack-3" }, /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "var(--s-2)" } }, /* @__PURE__ */ React.createElement(Field, { label: "HP" }, /* @__PURE__ */ React.createElement("input", { type: "number", className: "input", placeholder: "105", value: state.hp, onChange: (e) => setF("hp", e.target.value) })), /* @__PURE__ */ React.createElement(Field, { label: "SAN" }, /* @__PURE__ */ React.createElement("input", { type: "number", className: "input", placeholder: "48", value: state.san, onChange: (e) => setF("san", e.target.value) })), /* @__PURE__ */ React.createElement(Field, { label: "\u901F\u5EA6" }, /* @__PURE__ */ React.createElement("input", { className: "input", placeholder: "1d5", value: state.speed, onChange: (e) => setF("speed", e.target.value) })), /* @__PURE__ */ React.createElement(Field, { label: "\u5F3E\u4E38" }, /* @__PURE__ */ React.createElement("input", { className: "input", placeholder: "\xD7", value: state.bullets, onChange: (e) => setF("bullets", e.target.value) }))), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "var(--s-2)" } }, ["S", "P", "B"].map((k, i) => {
      const label = ["\u65AC\u6483", "\u8CAB\u901A", "\u6253\u6483"][i];
      const field = ["resS", "resP", "resB"][i];
      return /* @__PURE__ */ React.createElement(Field, { key: k, label: `RES ${["SLASH", "PIERCE", "BLUNT"][i]} / ${label}\u8010\u6027` }, /* @__PURE__ */ React.createElement("select", { className: "select", value: state[field], onChange: (e) => setF(field, e.target.value) }, ["\u666E\u901A", "\u8106\u5F31", "\u5F31\u70B9", "\u62B5\u6297", "\u8010\u6027", "\u514D\u75AB"].map((r) => /* @__PURE__ */ React.createElement("option", { key: r, value: r }, r))));
    })), state.personaSrc && /* @__PURE__ */ React.createElement("div", { style: { padding: "var(--s-3)", background: "var(--gold-tint)", border: "1px solid var(--gold-line)", borderRadius: "var(--r)", fontSize: "var(--fs-11)", color: "var(--tx-2)" } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--f-display)", fontSize: 10, letterSpacing: "0.2em", color: "var(--gold)", textTransform: "uppercase", marginBottom: 4 } }, "\u88C5\u5099\u4E2D\u306E\u4EBA\u683C"), /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--f-display)", fontSize: "var(--fs-14)", color: "var(--tx)", fontWeight: 600 } }, state.personaSrc.name), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-10)", color: "var(--tx-dim)", marginTop: 2, fontFamily: "var(--f-mono)" } }, "No.", String(state.personaSrc.no).padStart(3, "0"), " \xB7 ", state.personaMode === "n" ? "\u901A\u5E38" : "\u7279\u7570"))));
  };
  const PassiveCard = ({ title, pas, sin }) => /* @__PURE__ */ React.createElement("div", { className: "deck-card deck-focus", "data-sin": sin || "", style: { padding: "var(--s-4)" } }, /* @__PURE__ */ React.createElement("div", { className: "deck-card-head", style: { marginBottom: "var(--s-3)" } }, /* @__PURE__ */ React.createElement(
    "span",
    {
      className: "deck-rank",
      style: { background: "var(--gold-tint)", color: "var(--gold)", border: "1px solid var(--gold-line)", padding: "4px 10px", fontFamily: "var(--f-display)", fontWeight: 600, fontSize: "var(--fs-12)", borderRadius: "var(--r-sm)", letterSpacing: "0.08em" }
    },
    title
  ), pas.cond && /* @__PURE__ */ React.createElement("span", { className: "cond-chips-lg", style: { marginLeft: 8 } }, /* @__PURE__ */ React.createElement(CondChips, { cond: pas.cond }))), /* @__PURE__ */ React.createElement("div", { className: "deck-name", style: { fontFamily: "var(--f-display)", fontWeight: 700, fontSize: "var(--fs-18)", color: "var(--tx)", marginBottom: "var(--s-3)", lineHeight: 1.2 } }, pas.name), /* @__PURE__ */ React.createElement("div", { className: "stack-3" }, pas.always && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--f-display)", fontSize: 9, letterSpacing: "0.18em", color: "var(--gold)", textTransform: "uppercase", marginBottom: 4 } }, "ALWAYS / \u5E38\u6642\u52B9\u679C"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-12)", color: "var(--tx-2)", lineHeight: 1.7, padding: "8px 12px", background: "var(--gold-tint)", border: "1px solid var(--gold-line)", borderLeft: "3px solid var(--gold)", borderRadius: "var(--r-sm)", whiteSpace: "pre-wrap" } }, pas.always)), pas.effect && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--f-display)", fontSize: 9, letterSpacing: "0.18em", color: "var(--gold)", textTransform: "uppercase", marginBottom: 4 } }, "EFFECT / \u52B9\u679C"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-12)", color: "var(--tx-2)", lineHeight: 1.7, padding: "8px 12px", background: "var(--surface-inset)", border: "1px solid var(--line-dim)", borderLeft: "3px solid var(--gold)", borderRadius: "var(--r-sm)", whiteSpace: "pre-wrap" } }, pas.effect)), pas.quick && /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--f-mono)", fontSize: "var(--fs-11)", color: "var(--tx-dim)", padding: "4px 8px", background: "var(--surface-2)", borderRadius: "var(--r-sm)" } }, /* @__PURE__ */ React.createElement("span", { style: { color: "var(--gold)" } }, "QUICK"), " ", pas.quick)));
  const PassiveSection = ({ state, dispatch }) => {
    const patchPas = (patch) => dispatch({ type: "PATCH_PAS", patch });
    const patchPas2 = (patch) => dispatch({ type: "PATCH_PAS2", patch });
    const togglePas2 = () => dispatch({ type: "SET_FIELD", field: "pas2Enabled", value: !state.pas2Enabled });
    const [forceEdit, setForceEdit] = React.useState(false);
    const src = state.personaSrc;
    const isAutoFromDB = !!src && !state.syncedManual && !forceEdit && state.pas.name === (src.passive_name || "") && !!state.pas.name;
    const primarySin = src ? window.getPrimarySin ? window.getPrimarySin(src) : null : null;
    return /* @__PURE__ */ React.createElement("div", { className: "stack-6" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "baseline", gap: "var(--s-3)", marginBottom: "var(--s-3)", paddingBottom: "var(--s-2)", borderBottom: "1px solid var(--line-dim)" } }, /* @__PURE__ */ React.createElement("span", { className: "section-title-num", style: { fontSize: "var(--fs-18)" } }, "A"), /* @__PURE__ */ React.createElement("span", { style: { fontFamily: "var(--f-display)", fontWeight: 700, fontSize: "var(--fs-16)", letterSpacing: "0.06em", color: "var(--tx)" } }, "PERSONA PASSIVE / \u4EBA\u683C\u30D1\u30C3\u30B7\u30D6"), /* @__PURE__ */ React.createElement("div", { style: { flex: 1 } }), isAutoFromDB && /* @__PURE__ */ React.createElement(Button, { variant: "ghost", size: "sm", icon: "edit", onClick: () => setForceEdit(true) }, "\u624B\u52D5\u7DE8\u96C6"), forceEdit && /* @__PURE__ */ React.createElement(Button, { variant: "ghost", size: "sm", icon: "eye", onClick: () => setForceEdit(false) }, "\u30AB\u30FC\u30C9\u8868\u793A\u306B\u623B\u3059")), isAutoFromDB ? /* @__PURE__ */ React.createElement(PassiveCard, { title: "PERSONA PASSIVE / \u4EBA\u683C\u30D1\u30C3\u30B7\u30D6", pas: state.pas, sin: primarySin }) : /* @__PURE__ */ React.createElement(Card, null, /* @__PURE__ */ React.createElement("div", { className: "card-body stack-3" }, /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--s-3)" } }, /* @__PURE__ */ React.createElement(Field, { label: "\u30D1\u30C3\u30B7\u30D6\u540D" }, /* @__PURE__ */ React.createElement("input", { className: "input", placeholder: "\u4F8B\uFF1A\u6289\u308A\u51FA\u3057", value: state.pas.name, onChange: (e) => patchPas({ name: e.target.value }) })), /* @__PURE__ */ React.createElement(Field, { label: "\u767A\u52D5\u6761\u4EF6" }, /* @__PURE__ */ React.createElement("input", { className: "input", placeholder: "\u4F8B\uFF1A\u8272\u6B32x2 \u5171\u9CF4", value: state.pas.cond, onChange: (e) => patchPas({ cond: e.target.value }) }))), /* @__PURE__ */ React.createElement(Field, { label: "\u5E38\u6642\u52B9\u679C\uFF08\u4EFB\u610F\uFF09" }, /* @__PURE__ */ React.createElement("textarea", { className: "textarea", rows: 2, placeholder: "\u5E38\u6642\u767A\u52D5\u3059\u308B\u52B9\u679C", value: state.pas.always, onChange: (e) => patchPas({ always: e.target.value }) })), /* @__PURE__ */ React.createElement(Field, { label: "\u52B9\u679C" }, /* @__PURE__ */ React.createElement("textarea", { className: "textarea", rows: 3, placeholder: "\u4F8B\uFF1A\u30DE\u30C3\u30C1\u52DD\u5229\u6642\u3001\u5BFE\u8C61\u304C\u51FA\u8840\u72B6\u614B\u306A\u3089\u2026", value: state.pas.effect, onChange: (e) => patchPas({ effect: e.target.value }) })), /* @__PURE__ */ React.createElement(Field, { label: "\u30AF\u30A4\u30C3\u30AF\u30D1\u30EC\u30C3\u30C8\uFF08:\u30B3\u30DE\u30F3\u30C9\uFF09", hint: "\u4F8B\uFF1A:\u51FA\u8840+1 :\u51FA\u8840-1\uFF08\u4EBA\u683CDB\u304B\u3089\u81EA\u52D5\u62BD\u51FA\u53EF\uFF09" }, /* @__PURE__ */ React.createElement("input", { className: "input", placeholder: ":\u51FA\u8840+1 :\u51FA\u8840-1", value: state.pas.quick, onChange: (e) => patchPas({ quick: e.target.value }) })))), state.pas2Enabled ? /* @__PURE__ */ React.createElement(Card, { className: "mt-3", style: { marginTop: "var(--s-3)" } }, /* @__PURE__ */ React.createElement("div", { className: "card-header", style: { justifyContent: "space-between" } }, /* @__PURE__ */ React.createElement("span", { className: "t-label" }, "PASSIVE 2\uFF08\u4EFB\u610F\uFF09"), /* @__PURE__ */ React.createElement(Button, { variant: "ghost", size: "sm", onClick: togglePas2, icon: "x" }, "\u30D1\u30C3\u30B7\u30D62\u3092\u524A\u9664")), /* @__PURE__ */ React.createElement("div", { className: "card-body stack-3" }, /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--s-3)" } }, /* @__PURE__ */ React.createElement(Field, { label: "\u30D1\u30C3\u30B7\u30D6\u540D2" }, /* @__PURE__ */ React.createElement("input", { className: "input", value: state.pas2.name, onChange: (e) => patchPas2({ name: e.target.value }) })), /* @__PURE__ */ React.createElement(Field, { label: "\u767A\u52D5\u6761\u4EF62" }, /* @__PURE__ */ React.createElement("input", { className: "input", value: state.pas2.cond, onChange: (e) => patchPas2({ cond: e.target.value }) }))), /* @__PURE__ */ React.createElement(Field, { label: "\u52B9\u679C2" }, /* @__PURE__ */ React.createElement("textarea", { className: "textarea", rows: 2, value: state.pas2.effect, onChange: (e) => patchPas2({ effect: e.target.value }) })))) : /* @__PURE__ */ React.createElement("div", { style: { marginTop: "var(--s-3)" } }, /* @__PURE__ */ React.createElement(Button, { variant: "ghost", icon: "plus", onClick: togglePas2 }, "\u30D1\u30C3\u30B7\u30D62\u3092\u8FFD\u52A0"))));
  };
  const UNIQUE_BUFF_PLACES = [
    { value: "status", label: "ST\u5074\uFF08\u6570\u5024\u7BA1\u7406\uFF09" },
    { value: "params", label: "\u30E9\u30D9\u30EB\u5074\uFF08params\uFF09" },
    { value: "none", label: "\u51FA\u529B\u3057\u306A\u3044" }
  ];
  const UNIQUE_BUFF_TYPES = ["\u30D0\u30D5", "\u30C7\u30D0\u30D5", "\u4E2D\u7ACB\u30D0\u30D5", "\u4E2D\u7ACB\u30C7\u30D0\u30D5", "\u305D\u306E\u4ED6"];
  const UniqueBuffsBlock = ({ state, dispatch }) => {
    return /* @__PURE__ */ React.createElement("div", { className: "unique-block" }, /* @__PURE__ */ React.createElement("div", { className: "unique-header" }, /* @__PURE__ */ React.createElement("div", { className: "unique-header-icon" }, "\u25C6"), /* @__PURE__ */ React.createElement("div", { className: "unique-header-text" }, /* @__PURE__ */ React.createElement("div", { className: "unique-header-title" }, "UNIQUE STATUS / \u56FA\u6709\u30D0\u30D5\u30FB\u30B9\u30C6\u30FC\u30BF\u30B9"), /* @__PURE__ */ React.createElement("div", { className: "unique-header-sub" }, "\u4EBA\u683CDB\u304B\u3089 ", /* @__PURE__ */ React.createElement("b", { style: { color: "var(--gold)" } }, "\u81EA\u52D5\u62BD\u51FA\u3055\u308C\u305F\u56FA\u6709\u30D0\u30D5"), "\u306F\u88C5\u5099\u6642\u306B\u3053\u3053\u3078\u73FE\u308C\u307E\u3059\u3002 \u624B\u52D5\u3067\u3082\u8FFD\u52A0/\u7DE8\u96C6/\u524A\u9664\u53EF\u80FD\u3002")), /* @__PURE__ */ React.createElement(Button, { variant: "primary", size: "sm", icon: "plus", onClick: () => dispatch({ type: "ADD_UB" }) }, "\u624B\u52D5\u8FFD\u52A0")), state.uniqueBuffs.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "unique-empty" }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 24, color: "var(--tx-mute)", marginBottom: 6 } }, "\u2014"), /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--f-display)", fontSize: "var(--fs-12)", color: "var(--tx-dim)", letterSpacing: "0.06em", marginBottom: 4 } }, state.personaSrc ? `\u300E${state.personaSrc.name}\u300F\u306B\u306FDB\u767B\u9332\u306E\u56FA\u6709\u30D0\u30D5\u304C\u3042\u308A\u307E\u305B\u3093` : "\u4EBA\u683C\u672A\u88C5\u5099 \u2014 \u4E0A\u306E\u4E00\u89A7\u304B\u3089\u88C5\u5099\u3057\u3066\u304F\u3060\u3055\u3044"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-11)", color: "var(--tx-mute)", lineHeight: 1.6 } }, "\u56FA\u6709\u30D0\u30D5\u304C\u767B\u9332\u3055\u308C\u3066\u3044\u308B\u4EBA\u683C\u3092\u88C5\u5099\u3059\u308B\u3068", /* @__PURE__ */ React.createElement("b", { style: { color: "var(--gold)" } }, "\u81EA\u52D5\u3067\u8FFD\u52A0"), "\u3055\u308C\u307E\u3059\u3002", /* @__PURE__ */ React.createElement("br", null), "\u81EA\u4F5C\u30AB\u30A6\u30F3\u30BF\u3084\u540C\u671F\u5316\u5F8C\u306E\u6D3E\u751F\u30B9\u30C6\u30FC\u30BF\u30B9\u3092\u8A18\u9332\u3057\u305F\u3044\u5834\u5408\u306F\u300C\u624B\u52D5\u8FFD\u52A0\u300D\u304B\u3089\u3002"), state.personaSrc && (state.personaSrc.unique_buffs || []).length > 0 && /* @__PURE__ */ React.createElement("div", { style: { marginTop: 12, padding: "8px 12px", background: "color-mix(in oklab, var(--warn) 10%, var(--surface-inset))", border: "1px solid color-mix(in oklab, var(--warn) 30%, var(--line))", borderRadius: "var(--r)", fontSize: "var(--fs-11)", color: "var(--warn)", lineHeight: 1.5 } }, "\u26A0 \u88C5\u5099\u4E2D\u306E\u4EBA\u683C\u306B\u306F ", /* @__PURE__ */ React.createElement("b", null, state.personaSrc.unique_buffs.length, "\u4EF6"), " \u306E\u56FA\u6709\u30D0\u30D5\u304CDB\u5B9A\u7FA9\u3055\u308C\u3066\u3044\u307E\u3059\u304C\u3001\u73FE\u5728\u306E\u30EA\u30B9\u30C8\u306B\u306F\u53CD\u6620\u3055\u308C\u3066\u3044\u307E\u305B\u3093\u3002", /* @__PURE__ */ React.createElement("br", null), /* @__PURE__ */ React.createElement(
      "button",
      {
        onClick: () => {
          const ubs = state.personaSrc.unique_buffs.map((b, i) => ({
            id: `ub-${Date.now()}-${i}`,
            name: b.name || "",
            type: b.type || "\u56FA\u6709\u30D0\u30D5",
            max: b.max || 20,
            desc: b.desc || "",
            place: "status"
          }));
          dispatch({ type: "SET_FIELD", field: "uniqueBuffs", value: ubs });
          toast("\u56FA\u6709\u30D0\u30D5\u3092\u518D\u8AAD\u8FBC");
        },
        style: { marginTop: 6, padding: "4px 10px", background: "var(--warn)", color: "#1a1400", border: "none", borderRadius: "var(--r-sm)", cursor: "pointer", fontFamily: "var(--f-display)", fontSize: "var(--fs-10)", letterSpacing: "0.14em", fontWeight: 700 }
      },
      "\u56FA\u6709\u30D0\u30D5\u3092\u518D\u8AAD\u8FBC"
    ))) : /* @__PURE__ */ React.createElement("div", { className: "stack-2" }, state.uniqueBuffs.map((b, i) => /* @__PURE__ */ React.createElement("div", { key: b.id, className: "unique-item" }, /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "auto 2fr 1fr 70px 70px 130px auto", gap: "var(--s-2)", alignItems: "end" } }, /* @__PURE__ */ React.createElement("div", { className: "reorder-btns", style: { alignSelf: "center" } }, /* @__PURE__ */ React.createElement("button", { className: "reorder-btn", onClick: () => dispatch({ type: "REORDER_LIST", field: "uniqueBuffs", key: b.id, dir: -1 }), disabled: i === 0, title: "\u4E0A\u3078" }, /* @__PURE__ */ React.createElement(Icon, { name: "arrowU", size: 10 })), /* @__PURE__ */ React.createElement("button", { className: "reorder-btn", onClick: () => dispatch({ type: "REORDER_LIST", field: "uniqueBuffs", key: b.id, dir: 1 }), disabled: i === state.uniqueBuffs.length - 1, title: "\u4E0B\u3078" }, /* @__PURE__ */ React.createElement(Icon, { name: "arrowD", size: 10 }))), /* @__PURE__ */ React.createElement(Field, { label: "\u540D\u524D" }, /* @__PURE__ */ React.createElement("input", { className: "input", value: b.name, onChange: (e) => dispatch({ type: "PATCH_UB", id: b.id, patch: { name: e.target.value } }) })), /* @__PURE__ */ React.createElement(Field, { label: "\u7A2E\u5225" }, /* @__PURE__ */ React.createElement("select", { className: "select", value: b.type, onChange: (e) => dispatch({ type: "PATCH_UB", id: b.id, patch: { type: e.target.value } }) }, [.../* @__PURE__ */ new Set([b.type, ...UNIQUE_BUFF_TYPES])].filter(Boolean).map((t) => /* @__PURE__ */ React.createElement("option", { key: t, value: t }, t)))), /* @__PURE__ */ React.createElement(Field, { label: "\u521D\u671F\u5024" }, /* @__PURE__ */ React.createElement("input", { type: "number", className: "input", value: b.initial ?? 0, onChange: (e) => dispatch({ type: "PATCH_UB", id: b.id, patch: { initial: parseInt(e.target.value) || 0 } }) })), /* @__PURE__ */ React.createElement(Field, { label: "\u6700\u5927\u5024" }, /* @__PURE__ */ React.createElement("input", { type: "number", className: "input", value: b.max, onChange: (e) => dispatch({ type: "PATCH_UB", id: b.id, patch: { max: parseInt(e.target.value) || 0 } }) })), /* @__PURE__ */ React.createElement(Field, { label: "\u5E30\u5C5E" }, /* @__PURE__ */ React.createElement("select", { className: "select", value: b.place || "status", onChange: (e) => dispatch({ type: "PATCH_UB", id: b.id, patch: { place: e.target.value } }), title: "ST\u5074=JSON\u306Estatus\u3078 / \u30E9\u30D9\u30EB\u5074=JSON\u306Eparams(label)\u3078 / \u51FA\u529B\u3057\u306A\u3044=JSON\u306B\u542B\u3081\u306A\u3044\uFF08memo\u30FB\u30D1\u30EC\u30C3\u30C8\u306F\u9664\u304F\uFF09" }, UNIQUE_BUFF_PLACES.map((o) => /* @__PURE__ */ React.createElement("option", { key: o.value, value: o.value }, o.label)))), /* @__PURE__ */ React.createElement("button", { className: "btn btn-sm lbt-del", onClick: () => dispatch({ type: "REMOVE_UB", id: b.id }), title: "\u3053\u306E\u56FA\u6709\u30D0\u30D5\u3092\u524A\u9664" }, /* @__PURE__ */ React.createElement(Icon, { name: "trash", size: 12 }), " \u524A\u9664")), /* @__PURE__ */ React.createElement(Field, { label: "\u52B9\u679C\u30E1\u30E2\uFF08\u4EFB\u610F\uFF09" }, /* @__PURE__ */ React.createElement("textarea", { className: "textarea", rows: 2, value: b.desc || "", onChange: (e) => dispatch({ type: "PATCH_UB", id: b.id, patch: { desc: e.target.value } }) }))))));
  };
  const SupportSection = ({ state, dispatch }) => {
    const [query, setQuery] = React.useState("");
    const [sinFilter, setSinFilter] = React.useState("");
    const [lpFilter, setLpFilter] = React.useState("");
    const [selected, setSelected] = React.useState(null);
    const filtered = React.useMemo(() => {
      const q = query.trim().toLowerCase();
      return DB.support_passives.filter((s) => {
        if (sinFilter && !(s.cond || "").includes(sinFilter)) return false;
        if (lpFilter) {
          const lp = Number(s.lp) || 0;
          if (lpFilter === "lt20" && !(lp < 20)) return false;
          if (lpFilter === "20-49" && !(lp >= 20 && lp < 50)) return false;
          if (lpFilter === "50-99" && !(lp >= 50 && lp < 100)) return false;
          if (lpFilter === "gte100" && !(lp >= 100)) return false;
        }
        if (q) {
          const hay = `${s.name} ${s.cond} ${s.effect}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });
    }, [query, sinFilter, lpFilter]);
    const equipped = state.supports;
    const isEquipped = (name) => equipped.some((s) => s.name === name);
    const maxSupports = state.enhancements.some((e) => e.name === "\u30B5\u30DD\u30FC\u30C8\u30B9\u30ED\u30C3\u30C8\u8FFD\u52A0") ? 3 : 2;
    const tryEquip = (s) => {
      if (isEquipped(s.name)) return;
      if (equipped.length >= maxSupports) {
        toast(`\u30B9\u30ED\u30C3\u30C8\u4E0A\u9650\uFF08${maxSupports}\u67A0\uFF09\u3067\u3059`);
        return;
      }
      dispatch({ type: "ADD_SUPPORT", spp: s });
      toast(`\u300E${s.name}\u300F\u3092\u88C5\u5099`);
    };
    return /* @__PURE__ */ React.createElement("div", { className: "stack-4" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "t-label", style: { marginBottom: "var(--s-2)" } }, "\u88C5\u5099\u4E2D\u30B5\u30DD\u30FC\u30C8\u30D1\u30C3\u30B7\u30D6 (", equipped.length, "/", maxSupports, ") \u2014 \u5DE6\u53F3\u77E2\u5370\u3067\u9806\u5E8F\u5909\u66F4"), /* @__PURE__ */ React.createElement("div", { className: "spp-slots", style: { gridTemplateColumns: `repeat(${maxSupports}, 1fr)` } }, Array.from({ length: maxSupports }).map((_, i) => {
      const spp = equipped[i];
      return /* @__PURE__ */ React.createElement("div", { key: i, className: `spp-slot${spp ? " is-filled" : ""}` }, spp ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("button", { className: "rm", onClick: () => dispatch({ type: "REMOVE_SUPPORT", id: spp.id }), title: "\u5916\u3059" }, /* @__PURE__ */ React.createElement(Icon, { name: "x", size: 12 })), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6 } }, /* @__PURE__ */ React.createElement("div", { className: "spp-slot-idx" }, "\u30B9\u30ED\u30C3\u30C8 ", i + 1), /* @__PURE__ */ React.createElement("div", { style: { flex: 1 } }), /* @__PURE__ */ React.createElement("div", { className: "reorder-btns", style: { flexDirection: "row", gap: 2 } }, /* @__PURE__ */ React.createElement("button", { className: "reorder-btn", onClick: () => dispatch({ type: "REORDER_LIST", field: "supports", key: spp.id, dir: -1 }), disabled: i === 0, title: "\u5DE6\u3078" }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10 } }, "\u2039")), /* @__PURE__ */ React.createElement("button", { className: "reorder-btn", onClick: () => dispatch({ type: "REORDER_LIST", field: "supports", key: spp.id, dir: 1 }), disabled: i >= equipped.length - 1, title: "\u53F3\u3078" }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10 } }, "\u203A")))), /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--f-display)", fontWeight: 600, fontSize: "var(--fs-13)", color: "var(--tx)" } }, spp.name), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-11)" } }, /* @__PURE__ */ React.createElement(CondChips, { cond: spp.cond })), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-11)", color: "var(--tx-2)", lineHeight: 1.4, marginTop: 4 } }, spp.effect), /* @__PURE__ */ React.createElement("div", { style: { marginTop: "auto", paddingTop: 4, fontSize: "var(--fs-10)", color: "var(--gold)" } }, "LP ", spp.lp)) : /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { className: "spp-slot-idx" }, "\u30B9\u30ED\u30C3\u30C8 ", i + 1), /* @__PURE__ */ React.createElement("div", { style: { color: "var(--tx-mute)", fontStyle: "italic", fontSize: "var(--fs-12)" } }, "\u4E0B\u304B\u3089\u9078\u629E")));
    }))), /* @__PURE__ */ React.createElement("div", { className: "codex" }, /* @__PURE__ */ React.createElement("div", { className: "codex-main" }, /* @__PURE__ */ React.createElement("div", { className: "codex-filters" }, /* @__PURE__ */ React.createElement("div", { className: "codex-filter-row" }, /* @__PURE__ */ React.createElement("div", { className: "codex-search" }, /* @__PURE__ */ React.createElement(Icon, { name: "search", size: 14 }), /* @__PURE__ */ React.createElement("input", { type: "text", placeholder: "\u30B5\u30DD\u30FC\u30C8\u30D1\u30C3\u30B7\u30D6\u540D\u30FB\u6761\u4EF6\u30FB\u52B9\u679C\u3067\u691C\u7D22...", value: query, onChange: (e) => setQuery(e.target.value) })), /* @__PURE__ */ React.createElement("div", { className: "codex-count" }, /* @__PURE__ */ React.createElement("strong", null, filtered.length), " / ", DB.support_passives.length)), /* @__PURE__ */ React.createElement("div", { className: "codex-filter-row", style: { gap: 8 } }, /* @__PURE__ */ React.createElement("select", { className: "select", value: sinFilter, onChange: (e) => setSinFilter(e.target.value), style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React.createElement("option", { value: "" }, "\u5168\u5927\u7F6A"), SIN_LIST.map((s) => /* @__PURE__ */ React.createElement("option", { key: s, value: s }, s))), /* @__PURE__ */ React.createElement("select", { className: "select", value: lpFilter, onChange: (e) => setLpFilter(e.target.value), style: { flex: 1, minWidth: 0 } }, /* @__PURE__ */ React.createElement("option", { value: "" }, "\u5168LP\u5E2F"), /* @__PURE__ */ React.createElement("option", { value: "lt20" }, "LP 20\u672A\u6E80"), /* @__PURE__ */ React.createElement("option", { value: "20-49" }, "LP 20-49"), /* @__PURE__ */ React.createElement("option", { value: "50-99" }, "LP 50-99"), /* @__PURE__ */ React.createElement("option", { value: "gte100" }, "LP 100\u4EE5\u4E0A")))), /* @__PURE__ */ React.createElement("div", { className: "spirit-list" }, filtered.map((s) => {
      const isSel = selected?.name === s.name;
      const eq = isEquipped(s.name);
      return /* @__PURE__ */ React.createElement(
        "div",
        {
          key: s.name,
          className: `spirit-item${isSel ? " is-active" : ""}${eq ? " is-equipped" : ""}`,
          onClick: () => setSelected(s),
          onDoubleClick: () => tryEquip(s)
        },
        /* @__PURE__ */ React.createElement("div", { className: "spirit-item-head" }, /* @__PURE__ */ React.createElement("div", { className: "spirit-item-name" }, s.name), /* @__PURE__ */ React.createElement("span", { className: "spirit-item-price" }, "LP ", s.lp), eq && /* @__PURE__ */ React.createElement("span", { style: { marginLeft: "auto", fontSize: 9, color: "var(--gold)", fontFamily: "var(--f-display)", letterSpacing: "0.16em" } }, "\u2605 \u88C5\u5099\u4E2D")),
        /* @__PURE__ */ React.createElement("div", { className: "spirit-item-line" }, /* @__PURE__ */ React.createElement("span", { className: "spirit-item-tag", "data-tag": "always" }, "\u6761\u4EF6"), /* @__PURE__ */ React.createElement("span", null, /* @__PURE__ */ React.createElement(CondChips, { cond: s.cond }))),
        /* @__PURE__ */ React.createElement("div", { className: "spirit-item-line" }, /* @__PURE__ */ React.createElement("span", { className: "spirit-item-tag", "data-tag": "morale" }, "\u52B9\u679C"), /* @__PURE__ */ React.createElement("span", null, s.effect))
      );
    }), filtered.length === 0 && /* @__PURE__ */ React.createElement("div", { style: { padding: "var(--s-4)", textAlign: "center", color: "var(--tx-mute)", fontSize: "var(--fs-11)" } }, "\u6761\u4EF6\u306B\u4E00\u81F4\u3059\u308B\u30B5\u30DD\u30FC\u30C8\u30D1\u30C3\u30B7\u30D6\u304C\u3042\u308A\u307E\u305B\u3093"))), selected ? /* @__PURE__ */ React.createElement("div", { className: "codex-detail" }, /* @__PURE__ */ React.createElement("div", { className: "detail-head", style: { "--sin-primary": "var(--gold)" } }, /* @__PURE__ */ React.createElement("div", { className: "detail-eyebrow" }, /* @__PURE__ */ React.createElement("span", { className: "detail-num" }, "LP ", selected.lp), /* @__PURE__ */ React.createElement("span", { className: "detail-type" }, "SUPPORT PASSIVE / \u30B5\u30DD\u30FC\u30C8\u30D1\u30C3\u30B7\u30D6")), /* @__PURE__ */ React.createElement("div", { className: "detail-name" }, selected.name), /* @__PURE__ */ React.createElement("div", { className: "cond-chips-lg", style: { marginTop: "var(--s-2)", display: "flex", alignItems: "center", gap: 6 } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: "var(--fs-10)", color: "var(--tx-mute)", fontFamily: "var(--f-display)", letterSpacing: "0.12em" } }, "\u767A\u52D5\u6761\u4EF6"), /* @__PURE__ */ React.createElement(CondChips, { cond: selected.cond }))), /* @__PURE__ */ React.createElement("div", { className: "detail-body" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "detail-section-title" }, "\u52B9\u679C"), /* @__PURE__ */ React.createElement("div", { className: "detail-passive" }, /* @__PURE__ */ React.createElement("div", { className: "detail-passive-effect", style: { whiteSpace: "pre-wrap" } }, selected.effect)))), /* @__PURE__ */ React.createElement("div", { className: "detail-actions" }, isEquipped(selected.name) ? /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-10)", color: "var(--gold)", textAlign: "center", fontFamily: "var(--f-display)", letterSpacing: "0.2em", textTransform: "uppercase" } }, "\u2605 \u73FE\u5728\u88C5\u5099\u4E2D") : /* @__PURE__ */ React.createElement(Button, { variant: "primary", onClick: () => tryEquip(selected), icon: "check" }, "\u3053\u306E\u30D1\u30C3\u30B7\u30D6\u3092\u88C5\u5099"))) : /* @__PURE__ */ React.createElement("div", { className: "codex-detail" }, /* @__PURE__ */ React.createElement("div", { className: "detail-empty" }, /* @__PURE__ */ React.createElement("div", { className: "detail-empty-icon" }, "\u25C8"), /* @__PURE__ */ React.createElement("div", { className: "t-label" }, "\u5DE6\u306E\u30AB\u30FC\u30C9\u3092\u9078\u629E"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-11)", color: "var(--tx-mute)", marginTop: 8 } }, "\u30B5\u30DD\u30FC\u30C8\u30D1\u30C3\u30B7\u30D6\u3092\u9078\u629E\u3059\u308B\u3068\u8A73\u7D30\u304C\u8868\u793A\u3055\u308C\u307E\u3059\u3002", /* @__PURE__ */ React.createElement("br", null), "\u30C0\u30D6\u30EB\u30AF\u30EA\u30C3\u30AF\u3067\u88C5\u5099\u3002")))));
  };
  const EGO_RANKS = ["ZAYIN", "TETH", "HE", "WAW", "ALEPH"];
  const EgoDetail = ({ ego, equipTo, currentSlot, onEquip, onUnequip }) => {
    if (!ego) return /* @__PURE__ */ React.createElement("div", { className: "codex-detail" }, /* @__PURE__ */ React.createElement("div", { className: "detail-empty" }, /* @__PURE__ */ React.createElement("div", { className: "detail-empty-icon" }, "\u25C8"), /* @__PURE__ */ React.createElement("div", { className: "t-label" }, "\u5DE6\u306EEGO\u3092\u9078\u629E"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-11)", color: "var(--tx-mute)", marginTop: 8 } }, "EGO\u3092\u9078\u629E\u3059\u308B\u3068\u8A73\u7D30\u304C\u8868\u793A\u3055\u308C\u307E\u3059\u3002", /* @__PURE__ */ React.createElement("br", null), "\u30C0\u30D6\u30EB\u30AF\u30EA\u30C3\u30AF\u3067\u88C5\u5099\u3002")));
    const fmt = (t) => window.formatEffectLines ? window.formatEffectLines(t) : t || "";
    const Skill = ({ label, skill, badge }) => {
      if (!skill || !skill.dice?.length && !skill.effect) return null;
      return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "detail-section-title", style: { display: "flex", alignItems: "center", gap: 6 } }, label, " ", badge && /* @__PURE__ */ React.createElement("span", { className: "badge", style: { marginLeft: "auto", color: label.includes("\u4FB5\u8755") ? "var(--err)" : "var(--ok)" } }, badge)), /* @__PURE__ */ React.createElement("div", { className: "detail-passive", style: { borderLeftColor: label.includes("\u4FB5\u8755") ? "var(--err)" : "var(--gold)" } }, (skill.attr || skill.sin) && /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-10)", fontFamily: "var(--f-mono)", color: "var(--tx-dim)", marginBottom: 4 } }, skill.attr && /* @__PURE__ */ React.createElement("span", null, skill.attr), skill.attr && skill.sin && " \xB7 ", skill.sin && /* @__PURE__ */ React.createElement("span", { style: { color: `var(--sin-${skill.sin}, var(--tx-dim))` } }, skill.sin), skill.aoe && /* @__PURE__ */ React.createElement("span", { style: { marginLeft: 6, padding: "1px 5px", background: "var(--gold-tint)", border: "1px solid var(--gold-line)", borderRadius: 2, color: "var(--gold)" } }, skill.aoe)), skill.effect && /* @__PURE__ */ React.createElement("div", { className: "detail-passive-effect", style: { marginBottom: 6, color: "var(--tx-2)", whiteSpace: "pre-wrap" } }, fmt(skill.effect)), skill.dice?.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "stack-1", style: { marginTop: 4 } }, skill.dice.map((d, i) => /* @__PURE__ */ React.createElement("div", { key: i, style: { display: "flex", gap: 8, fontSize: "var(--fs-11)", padding: "4px 6px", background: "var(--surface-2)", borderRadius: 2 } }, /* @__PURE__ */ React.createElement("span", { style: { fontFamily: "var(--f-mono)", color: "var(--gold-hi)", minWidth: 60, fontWeight: 600 } }, d.roll), /* @__PURE__ */ React.createElement("span", { style: { color: "var(--tx-2)", lineHeight: 1.4, whiteSpace: "pre-wrap" } }, d.effect ? fmt(d.effect) : "\u2014"))))));
    };
    const isAssim = (ego.sub_skills || []).length > 0;
    return /* @__PURE__ */ React.createElement("div", { className: "codex-detail", style: { "--sin-primary": `var(--rank-${ego.rank})` } }, /* @__PURE__ */ React.createElement("div", { className: "detail-head" }, /* @__PURE__ */ React.createElement("div", { className: "detail-eyebrow" }, /* @__PURE__ */ React.createElement("span", { className: "detail-num" }, "No.", String(ego.no).padStart(3, "0")), /* @__PURE__ */ React.createElement("span", { className: "badge", "data-rank": ego.rank, style: { fontSize: 9 } }, ego.rank)), /* @__PURE__ */ React.createElement("div", { className: "detail-name" }, ego.name), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--s-2)" } }, /* @__PURE__ */ React.createElement("div", { style: { padding: "6px 8px", background: "var(--surface-inset)", border: "1px solid var(--line-dim)", borderRadius: "var(--r)" } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--f-display)", fontSize: 9, letterSpacing: "0.14em", color: "var(--tx-mute)", textTransform: "uppercase" } }, "\u6D88\u8CBBSAN"), /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--f-mono)", fontSize: "var(--fs-15)", color: "var(--tx)" } }, ego.san_cost)), /* @__PURE__ */ React.createElement("div", { style: { padding: "6px 8px", background: "var(--surface-inset)", border: "1px solid var(--line-dim)", borderRadius: "var(--r)" } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--f-display)", fontSize: 9, letterSpacing: "0.14em", color: "var(--tx-mute)", textTransform: "uppercase" } }, "\u81EA\u6211\u306E\u6B20\u7247"), /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--f-mono)", fontSize: "var(--fs-15)", color: "var(--tx)" } }, ego.shards))), /* @__PURE__ */ React.createElement("div", { style: { marginTop: "var(--s-2)", fontSize: "var(--fs-11)", color: "var(--tx-dim)", fontFamily: "var(--f-mono)" } }, "\u8CC7\u6E90: ", /* @__PURE__ */ React.createElement("span", { style: { color: "var(--tx-2)" } }, ego.resources))), /* @__PURE__ */ React.createElement("div", { className: "detail-body" }, ego.passive_name && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "detail-section-title" }, "\u30D1\u30C3\u30B7\u30D6"), /* @__PURE__ */ React.createElement("div", { className: "detail-passive" }, /* @__PURE__ */ React.createElement("div", { className: "detail-passive-name" }, ego.passive_name), ego.passive_cond && /* @__PURE__ */ React.createElement("div", { className: "detail-passive-cond cond-chips-lg", style: { display: "flex", alignItems: "center", gap: 6 } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: "var(--fs-10)", color: "var(--tx-mute)" } }, "\u767A\u52D5\u6761\u4EF6"), /* @__PURE__ */ React.createElement(CondChips, { cond: ego.passive_cond })), /* @__PURE__ */ React.createElement("div", { className: "detail-passive-effect", style: { whiteSpace: "pre-wrap" } }, fmt(ego.passive_effect)))), /* @__PURE__ */ React.createElement(Skill, { label: "\u899A\u9192\u30B9\u30AD\u30EB / KAKUSEI", skill: ego.kakusei, badge: "\u899A\u9192" }), isAssim ? /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "detail-section-title", style: { display: "flex", alignItems: "center", gap: 6 } }, /* @__PURE__ */ React.createElement("span", null, "\u4FB5\u8755\u30B9\u30AD\u30EB / SHINSHOKU"), /* @__PURE__ */ React.createElement("span", { className: "ego-doka-badge", style: { marginLeft: "auto" }, title: "\u3053\u306EEGO\u306F\u540C\u5316\u578B" }, "\u25C6 \u540C\u5316")), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-10)", color: "var(--tx-mute)", lineHeight: 1.5, marginTop: -2, marginBottom: 8, fontStyle: "italic", fontFamily: "var(--f-mono)" } }, "\u540C\u5316\u578BEGO\uFF1A\u4FB5\u8755\u30B9\u30AD\u30EB\u305D\u306E\u3082\u306E\u304C\u4E0B\u8A18\u306E\u540C\u5316\u30B9\u30AD\u30EB\u7FA4\u3068\u3057\u3066\u767A\u52D5\u3057\u307E\u3059\u3002"), /* @__PURE__ */ React.createElement("div", { className: "assim-tactical-grid" }, ego.sub_skills.map((s, i) => /* @__PURE__ */ React.createElement("div", { key: i, className: "assim-tactical-card", "data-sin": s.sin || "" }, /* @__PURE__ */ React.createElement("div", { className: "assim-tactical-head" }, /* @__PURE__ */ React.createElement("span", { className: "assim-tactical-idx" }, "S", s.no ?? i + 1), /* @__PURE__ */ React.createElement("span", { className: "assim-tactical-name" }, s.name || "(\u540D\u79F0\u672A\u8A2D\u5B9A)"), s.attr && /* @__PURE__ */ React.createElement("span", { className: "assim-tactical-attr" }, s.attr), s.sin && /* @__PURE__ */ React.createElement("span", { className: "sin-tag", "data-sin": s.sin, style: { fontFamily: "var(--f-display)", fontSize: "var(--fs-10)", padding: "2px 8px", borderRadius: "var(--r-sm)", letterSpacing: "0.06em", fontWeight: 600 } }, s.sin), s.aoe && /* @__PURE__ */ React.createElement("span", { className: "assim-tactical-aoe" }, s.aoe)), s.effect && /* @__PURE__ */ React.createElement("div", { className: "assim-tactical-eff", style: { whiteSpace: "pre-wrap" } }, fmt(s.effect)), (s.dice || []).length > 0 && /* @__PURE__ */ React.createElement("div", { className: "ro-dice-list", style: { marginTop: 6 } }, s.dice.map((d, j) => /* @__PURE__ */ React.createElement("div", { key: j, className: "ro-dice-row" }, /* @__PURE__ */ React.createElement("span", { className: "ro-dice-idx" }, j + 1), /* @__PURE__ */ React.createElement("span", { className: "ro-dice-roll" }, d.roll || "-"), /* @__PURE__ */ React.createElement("span", { className: "ro-dice-eff", style: { whiteSpace: "pre-wrap" } }, d.effect ? fmt(d.effect) : /* @__PURE__ */ React.createElement("span", { style: { color: "var(--tx-mute)", fontStyle: "italic" } }, "\u52B9\u679C\u306A\u3057"))))))))) : /* @__PURE__ */ React.createElement(Skill, { label: "\u4FB5\u8755\u30B9\u30AD\u30EB / SHINSHOKU", skill: ego.shinshoku, badge: "\u4FB5\u8755" }), ego.unique_buff && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "detail-section-title" }, "\u56FA\u6709\u30D0\u30D5"), /* @__PURE__ */ React.createElement("div", { style: { padding: "8px 10px", background: "var(--surface-inset)", borderRadius: "var(--r)", border: "1px solid var(--line-dim)", fontSize: "var(--fs-11)", color: "var(--tx-2)", lineHeight: 1.5 } }, ego.unique_buff))), /* @__PURE__ */ React.createElement("div", { className: "detail-actions" }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-10)", color: "var(--tx-dim)", letterSpacing: "0.12em", textTransform: "uppercase", fontFamily: "var(--f-display)", marginBottom: 4 } }, equipTo === ego.rank ? `\u2192 ${ego.rank} \u30B9\u30ED\u30C3\u30C8\u3078\u88C5\u5099` : `\u2192 ${ego.rank} \u30B9\u30ED\u30C3\u30C8\u3078\u88C5\u5099`), currentSlot ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-10)", color: "var(--gold)", textAlign: "center", fontFamily: "var(--f-display)", letterSpacing: "0.16em", textTransform: "uppercase" } }, "\u2605 \u73FE\u5728 ", currentSlot, " \u306B\u88C5\u5099\u4E2D"), /* @__PURE__ */ React.createElement(Button, { variant: "ghost", size: "sm", onClick: onUnequip, icon: "x" }, "\u88C5\u5099\u89E3\u9664")) : /* @__PURE__ */ React.createElement(Button, { variant: "primary", onClick: onEquip, icon: "check" }, ego.rank, " \u30B9\u30ED\u30C3\u30C8\u3078\u88C5\u5099")));
  };
  const EgoSection = ({ state, dispatch }) => {
    const [selected, setSelected] = React.useState(null);
    const [query, setQuery] = React.useState("");
    const rankFilter = state.ui.egoRankFilter || "";
    const setRankFilter = (v) => dispatch({ type: "SET_UI", ui: { egoRankFilter: v } });
    const [sinFilter, setSinFilter] = React.useState("");
    const detailSlot = state.ui.egoDetailSlot;
    const setDetailSlot = (v) => dispatch({ type: "SET_UI", ui: { egoDetailSlot: v } });
    const hasAnyEgo = Object.values(state.egoSlots).some((v) => v);
    const listExpanded = state.ui.egoListExpanded !== void 0 ? state.ui.egoListExpanded : !hasAnyEgo;
    const setListExpanded = (v) => dispatch({ type: "SET_UI", ui: { egoListExpanded: v } });
    const filtered = React.useMemo(() => {
      const q = query.trim().toLowerCase();
      return DB.egos.filter((e) => {
        if (rankFilter && e.rank !== rankFilter) return false;
        if (sinFilter && !(e.resources || "").includes(sinFilter)) return false;
        if (q) {
          const hay = `${e.name} ${e.resources} ${e.passive_name || ""} ${e.passive_effect || ""} ${e.kakusei?.effect || ""} ${e.shinshoku?.effect || ""}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });
    }, [query, rankFilter, sinFilter]);
    const equip = () => {
      if (!selected) return;
      dispatch({ type: "SET_EGO_SLOT", rank: selected.rank, value: selected });
      toast(`${selected.rank}: \u300E${selected.name}\u300F\u3092\u88C5\u5099`);
    };
    const unequip = () => {
      if (!selected) return;
      const slot = Object.entries(state.egoSlots).find(([_, v]) => v && v.name === selected.name)?.[0];
      if (slot) dispatch({ type: "SET_EGO_SLOT", rank: slot, value: null });
    };
    const clearSlot = (rk) => dispatch({ type: "SET_EGO_SLOT", rank: rk, value: null });
    const currentSlot = selected ? Object.entries(state.egoSlots).find(([_, v]) => v && v.name === selected.name && v.no === selected.no)?.[0] : null;
    return /* @__PURE__ */ React.createElement("div", { className: "stack-4" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "t-label", style: { marginBottom: "var(--s-2)", display: "flex", alignItems: "center", gap: 8 } }, /* @__PURE__ */ React.createElement("span", null, "\u88C5\u5099\u4E2D\u306EE.G.O"), /* @__PURE__ */ React.createElement("span", { style: { fontSize: 9, color: "var(--tx-mute)", fontWeight: 400, letterSpacing: "0.08em" } }, "\u88C5\u5099\u6E08\u30B9\u30ED\u30C3\u30C8\uFF1A\u30AF\u30EA\u30C3\u30AF\u3067\u8A73\u7D30\u3092\u4E0A\u306B\u8868\u793A\u3000\u3000\u672A\u88C5\u5099\u30B9\u30ED\u30C3\u30C8\uFF1A\u30AF\u30EA\u30C3\u30AF\u3067\u4E00\u89A7\u3092\u5C55\u958B\uFF0B\u305D\u306E\u30E9\u30F3\u30AF\u7D5E\u308A\u8FBC\u307F"), /* @__PURE__ */ React.createElement("div", { style: { flex: 1 } }), hasAnyEgo && /* v52 (G): 別のEGOを選ぶ / 畳む トグル */
    /* @__PURE__ */ React.createElement(
      Button,
      {
        size: "sm",
        icon: listExpanded ? "chevronU" : "chevronD",
        onClick: () => {
          setListExpanded(!listExpanded);
          if (listExpanded) setRankFilter("");
        },
        title: listExpanded ? "\u4E00\u89A7\u3092\u6298\u308A\u7573\u3080" : "\u5225\u306EE.G.O\u3092\u9078\u3076 (\u4E00\u89A7\u3092\u5C55\u958B)"
      },
      listExpanded ? "\u4E00\u89A7\u3092\u7573\u3080" : "\u5225\u306EE.G.O\u3092\u9078\u3076"
    )), /* @__PURE__ */ React.createElement("div", { className: "ego-slots" }, EGO_RANKS.map((rk) => {
      const e = state.egoSlots[rk];
      const isDetailActive = detailSlot === rk;
      return /* @__PURE__ */ React.createElement(
        "div",
        {
          key: rk,
          className: `ego-slot${isDetailActive ? " is-detail-active" : ""}`,
          "data-rank": rk,
          onClick: () => {
            if (e) {
              setSelected(e);
              setDetailSlot(isDetailActive ? null : rk);
            } else {
              if (rankFilter === rk && listExpanded) {
                setRankFilter("");
                toast("\u30E9\u30F3\u30AF\u30D5\u30A3\u30EB\u30BF\u3092\u89E3\u9664");
              } else {
                setRankFilter(rk);
                setListExpanded(true);
                toast(`${rk} \u30E9\u30F3\u30AF\u3067\u7D5E\u308A\u8FBC\u307F \u2014 \u30AB\u30FC\u30C9\u4E00\u89A7\u3092\u5C55\u958B`);
              }
              setDetailSlot(null);
            }
          },
          title: e ? isDetailActive ? "\u30AF\u30EA\u30C3\u30AF\u3067\u8A73\u7D30\u3092\u9589\u3058\u308B" : "\u30AF\u30EA\u30C3\u30AF\u3067\u88C5\u5099\u4E2D\u306E\u52B9\u679C\u8A73\u7D30\u3092\u4E0A\u306B\u8868\u793A" : `\u30AF\u30EA\u30C3\u30AF\u3067 ${rk} \u30E9\u30F3\u30AF\u306E\u30AB\u30FC\u30C9\u4E00\u89A7\u3092\u5C55\u958B`
        },
        /* @__PURE__ */ React.createElement("div", { className: "ego-slot-rank" }, rk),
        /* @__PURE__ */ React.createElement("div", { className: `ego-slot-name${!e ? " ego-slot-empty" : ""}` }, e ? e.name : "\uFF08\u672A\u88C5\u5099\uFF09"),
        e && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--f-mono)", fontSize: 9, color: "var(--tx-dim)" } }, e.resources), /* @__PURE__ */ React.createElement("div", { className: "ego-slot-meta" }, /* @__PURE__ */ React.createElement("span", { className: "ego-slot-flag" }, "SAN", e.san_cost), /* @__PURE__ */ React.createElement("span", { className: "ego-slot-flag" }, "\u6B20\u7247", e.shards), (e.sub_skills || []).length > 0 && /* @__PURE__ */ React.createElement("span", { className: "ego-slot-flag", style: { background: "var(--gold-tint)", color: "var(--gold)", borderColor: "var(--gold-line)" } }, "\u25C6\u540C\u5316")), /* @__PURE__ */ React.createElement("button", { className: "btn-ghost btn-icon", onClick: (ev) => {
          ev.stopPropagation();
          clearSlot(rk);
          setDetailSlot(null);
        }, style: { position: "absolute", top: 4, right: 4, width: 20, height: 20 }, title: "\u5916\u3059" }, /* @__PURE__ */ React.createElement(Icon, { name: "x", size: 10 }))),
        !e && rankFilter === rk && /* @__PURE__ */ React.createElement("div", { style: { marginTop: 4, padding: "2px 6px", fontSize: 9, fontFamily: "var(--f-display)", letterSpacing: "0.14em", color: "var(--gold)", background: "var(--gold-tint)", border: "1px solid var(--gold-line)", borderRadius: 2, alignSelf: "flex-start" } }, "\u25BC \u4E0B\u3067\u7D5E\u308A\u8FBC\u307F\u4E2D")
      );
    }))), detailSlot && state.egoSlots[detailSlot] && /* @__PURE__ */ React.createElement("div", { className: "equipped-detail-wrap" }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", background: "var(--surface-2)", borderBottom: "1px solid var(--line-dim)" } }, /* @__PURE__ */ React.createElement("span", { className: "badge", "data-rank": detailSlot }, detailSlot), /* @__PURE__ */ React.createElement("span", { style: { fontFamily: "var(--f-display)", fontWeight: 600, color: "var(--tx)" } }, "\u88C5\u5099\u4E2D\u306E\u52B9\u679C\u8A73\u7D30"), /* @__PURE__ */ React.createElement("div", { style: { flex: 1 } }), /* @__PURE__ */ React.createElement("button", { className: "btn btn-sm btn-ghost", onClick: () => setDetailSlot(null), title: "\u9589\u3058\u308B" }, /* @__PURE__ */ React.createElement(Icon, { name: "x", size: 12 }), " \u9589\u3058\u308B")), /* @__PURE__ */ React.createElement("div", { className: "equipped-detail-inner" }, /* @__PURE__ */ React.createElement(
      EgoDetail,
      {
        ego: state.egoSlots[detailSlot],
        equipTo: detailSlot,
        currentSlot: detailSlot,
        onEquip: () => {
        },
        onUnequip: () => {
          clearSlot(detailSlot);
          setDetailSlot(null);
        }
      }
    ))), hasAnyEgo && !listExpanded && /* @__PURE__ */ React.createElement("div", { className: "codex-collapsed-hint" }, /* @__PURE__ */ React.createElement("span", { style: { color: "var(--tx-mute)", fontSize: "var(--fs-11)", letterSpacing: "0.14em", fontFamily: "var(--f-display)" } }, "\u25C7 E.G.O \u4E00\u89A7\u306F\u6298\u308A\u7573\u307F\u4E2D"), /* @__PURE__ */ React.createElement("span", { style: { marginLeft: 12, fontSize: "var(--fs-10)", color: "var(--tx-dim)" } }, "\u672A\u88C5\u5099\u30B9\u30ED\u30C3\u30C8\u3092\u30AF\u30EA\u30C3\u30AF\u3059\u308B\u3068\u3001\u305D\u306E\u30E9\u30F3\u30AF\u3060\u3051\u7D5E\u308A\u8FBC\u3093\u3067\u5C55\u958B\u3055\u308C\u307E\u3059\u3002"), /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "btn btn-sm",
        style: { marginLeft: "auto" },
        onClick: () => {
          setListExpanded(true);
          setRankFilter("");
        }
      },
      "\u4E00\u89A7\u3092\u5C55\u958B"
    )), (!hasAnyEgo || listExpanded) && /* @__PURE__ */ React.createElement("div", { className: "codex" }, /* @__PURE__ */ React.createElement("div", { className: "codex-main" }, /* @__PURE__ */ React.createElement("div", { className: "codex-filters" }, /* @__PURE__ */ React.createElement("div", { className: "codex-filter-row" }, /* @__PURE__ */ React.createElement("div", { className: "codex-search" }, /* @__PURE__ */ React.createElement(Icon, { name: "search", size: 14 }), /* @__PURE__ */ React.createElement("input", { type: "text", placeholder: "EGO\u540D\u30FB\u52B9\u679C\u30FB\u8CC7\u6E90\u3067\u691C\u7D22...", value: query, onChange: (e) => setQuery(e.target.value) })), /* @__PURE__ */ React.createElement("div", { className: "codex-count" }, /* @__PURE__ */ React.createElement("strong", null, filtered.length), " / ", DB.egos.length), rankFilter && /* @__PURE__ */ React.createElement("button", { className: "btn btn-sm", onClick: () => setRankFilter(""), style: { color: "var(--gold)", borderColor: "var(--gold-line)" } }, rankFilter, " \u7D5E\u308A\u8FBC\u307F\u4E2D \xD7")), /* @__PURE__ */ React.createElement("div", { className: "codex-filter-row" }, /* @__PURE__ */ React.createElement("span", { className: "filter-label" }, "\u30E9\u30F3\u30AF"), /* @__PURE__ */ React.createElement("div", { className: "chips-group" }, EGO_RANKS.map((r) => /* @__PURE__ */ React.createElement(
      "button",
      {
        key: r,
        className: "chip",
        onClick: () => setRankFilter(rankFilter === r ? "" : r),
        style: {
          background: rankFilter === r ? `color-mix(in oklab, var(--rank-${r}) 25%, var(--surface-2))` : void 0,
          borderColor: rankFilter === r ? `var(--rank-${r})` : void 0,
          color: rankFilter === r ? "var(--tx)" : void 0
        }
      },
      /* @__PURE__ */ React.createElement("span", { style: { width: 6, height: 6, borderRadius: 999, background: `var(--rank-${r})`, marginRight: 4, display: "inline-block" } }),
      r
    )))), /* @__PURE__ */ React.createElement("div", { className: "codex-filter-row" }, /* @__PURE__ */ React.createElement("span", { className: "filter-label" }, "\u5927\u7F6A"), /* @__PURE__ */ React.createElement("div", { className: "chips-group" }, SIN_LIST.map((s) => /* @__PURE__ */ React.createElement(Chip, { key: s, sin: s, active: sinFilter === s, onClick: () => setSinFilter(sinFilter === s ? "" : s) }, s))))), /* @__PURE__ */ React.createElement("div", { className: "codex-grid", style: { gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" } }, filtered.map((e) => {
      const isEquipped = Object.values(state.egoSlots).some((v) => v && v.no === e.no && v.name === e.name);
      return /* @__PURE__ */ React.createElement(
        "div",
        {
          key: `${e.rank}-${e.no}`,
          className: `p-card${selected?.no === e.no && selected?.name === e.name ? " is-active" : ""}${isEquipped ? " is-equipped" : ""}`,
          style: { "--sin-primary": `var(--rank-${e.rank})`, minHeight: 120 },
          onClick: () => setSelected(e),
          onDoubleClick: () => {
            setSelected(e);
            dispatch({ type: "SET_EGO_SLOT", rank: e.rank, value: e });
            toast(`${e.rank}: \u300E${e.name}\u300F\u3092\u88C5\u5099`);
          }
        },
        /* @__PURE__ */ React.createElement("div", { className: "p-card-head" }, /* @__PURE__ */ React.createElement("span", { className: "p-num" }, "No.", String(e.no).padStart(3, "0")), /* @__PURE__ */ React.createElement("span", { className: "badge", "data-rank": e.rank, style: { fontSize: 9 } }, e.rank), (e.sub_skills || []).length > 0 && /* @__PURE__ */ React.createElement("span", { className: "ego-doka-badge", title: "\u540C\u5316\u30B9\u30AD\u30EB\u5BFE\u5FDCEGO" }, "\u25C6 \u540C\u5316")),
        /* @__PURE__ */ React.createElement("div", { className: "p-name" }, e.name),
        /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--f-mono)", fontSize: 9, color: "var(--tx-dim)", lineHeight: 1.4 } }, e.resources),
        /* @__PURE__ */ React.createElement("div", { className: "p-kw-row", style: { marginTop: "auto" } }, /* @__PURE__ */ React.createElement("span", { className: "p-kw" }, "SAN ", e.san_cost), /* @__PURE__ */ React.createElement("span", { className: "p-kw" }, "\u6B20\u7247 ", e.shards))
      );
    }))), /* @__PURE__ */ React.createElement(
      EgoDetail,
      {
        ego: selected,
        equipTo: selected?.rank,
        currentSlot,
        onEquip: equip,
        onUnequip: unequip
      }
    )));
  };
  const SpiritSection = ({ state, dispatch }) => {
    const [selected, setSelected] = React.useState(null);
    const [query, setQuery] = React.useState("");
    const filtered = React.useMemo(() => {
      const q = query.trim().toLowerCase();
      if (!q) return DB.spirits;
      return DB.spirits.filter(
        (s) => `${s.name} ${s.morale_effect || ""} ${s.confuse_effect || ""} ${s.always_effect || ""}`.toLowerCase().includes(q)
      );
    }, [query]);
    const applySpirit = (sp) => {
      dispatch({ type: "APPLY_SPIRIT", spirit: sp });
      toast(`\u7CBE\u795E\u300E${sp.name}\u300F\u3092\u9069\u7528`);
    };
    const setF = (field, value) => dispatch({ type: "SET_FIELD", field, value });
    const isCurrentSpirit = state.spirit;
    const dbSpirit = DB.spirits.find((sp) => sp.name === state.spirit);
    const isAutoSpirit = !!dbSpirit && state.spiritMorale === (dbSpirit.morale_effect || "") && state.spiritConfuse === (dbSpirit.confuse_effect || "") && state.spiritAlways === (dbSpirit.always_effect || "");
    const [forceEditSpirit, setForceEditSpirit] = React.useState(false);
    const showAsCard = isCurrentSpirit && isAutoSpirit && !forceEditSpirit;
    const addManualSpirit = () => {
      const name = prompt("\u624B\u52D5\u8FFD\u52A0\u3059\u308B\u7CBE\u795E\u306E\u540D\u524D\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044:", "");
      if (!name) return;
      setF("spirit", name.trim());
      setF("spiritMorale", "");
      setF("spiritConfuse", "");
      setF("spiritAlways", "");
      setForceEditSpirit(true);
      toast(`\u7CBE\u795E\u300E${name.trim()}\u300F\u3092\u624B\u52D5\u8FFD\u52A0`);
    };
    return /* @__PURE__ */ React.createElement("div", { className: "stack-4" }, isCurrentSpirit && (showAsCard ? (
      /* v50 (N5): スキルカード風表示（DB由来・自動入力時） */
      /* @__PURE__ */ React.createElement("div", { className: "deck-card deck-focus", style: { padding: "var(--s-4)" } }, /* @__PURE__ */ React.createElement("div", { className: "deck-card-head", style: { marginBottom: "var(--s-3)" } }, /* @__PURE__ */ React.createElement(
        "span",
        {
          className: "deck-rank",
          style: { background: "var(--gold-tint)", color: "var(--gold)", border: "1px solid var(--gold-line)", padding: "4px 10px", fontFamily: "var(--f-display)", fontWeight: 600, fontSize: "var(--fs-12)", borderRadius: "var(--r-sm)", letterSpacing: "0.08em" }
        },
        "SPIRIT / \u7CBE\u795E"
      ), dbSpirit.price > 0 && /* @__PURE__ */ React.createElement("span", { style: { marginLeft: 8, fontFamily: "var(--f-mono)", fontSize: "var(--fs-10)", color: "var(--gold)", padding: "3px 8px", background: "var(--surface-inset)", border: "1px solid var(--line-dim)", borderRadius: "var(--r-sm)" } }, "LP ", dbSpirit.price), /* @__PURE__ */ React.createElement("div", { style: { flex: 1 } }), /* @__PURE__ */ React.createElement(Button, { variant: "ghost", size: "sm", icon: "edit", onClick: () => setForceEditSpirit(true) }, "\u624B\u52D5\u7DE8\u96C6"), /* @__PURE__ */ React.createElement(Button, { variant: "ghost", size: "sm", icon: "x", onClick: () => {
        setF("spirit", "");
        setF("spiritMorale", "");
        setF("spiritConfuse", "");
        setF("spiritAlways", "");
        setForceEditSpirit(false);
        toast("\u7CBE\u795E\u3092\u89E3\u9664");
      } }, "\u89E3\u9664")), /* @__PURE__ */ React.createElement("div", { className: "deck-name", style: { fontFamily: "var(--f-display)", fontWeight: 700, fontSize: "var(--fs-18)", color: "var(--tx)", marginBottom: "var(--s-3)", lineHeight: 1.2 } }, state.spirit), /* @__PURE__ */ React.createElement("div", { className: "stack-3" }, state.spiritAlways && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--f-display)", fontSize: 9, letterSpacing: "0.18em", color: "var(--gold)", textTransform: "uppercase", marginBottom: 4 } }, "ALWAYS / \u5E38\u6642\u767A\u52D5"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-12)", color: "var(--tx-2)", lineHeight: 1.7, padding: "8px 12px", background: "var(--gold-tint)", border: "1px solid var(--gold-line)", borderLeft: "3px solid var(--gold)", borderRadius: "var(--r-sm)", whiteSpace: "pre-wrap" } }, state.spiritAlways)), state.spiritMorale && state.spiritMorale !== "\u306A\u3057" && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--f-display)", fontSize: 9, letterSpacing: "0.18em", color: "var(--warn)", textTransform: "uppercase", marginBottom: 4 } }, "MORALE / \u58EB\u6C17\u4F4E\u4E0B\u52B9\u679C"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-12)", color: "var(--tx-2)", lineHeight: 1.7, padding: "8px 12px", background: "color-mix(in oklab, var(--warn) 8%, var(--surface-inset))", border: "1px solid color-mix(in oklab, var(--warn) 30%, var(--line-dim))", borderLeft: "3px solid var(--warn)", borderRadius: "var(--r-sm)", whiteSpace: "pre-wrap" } }, state.spiritMorale)), state.spiritConfuse && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--f-display)", fontSize: 9, letterSpacing: "0.18em", color: "var(--err)", textTransform: "uppercase", marginBottom: 4 } }, "CONFUSE / \u6DF7\u4E71\u52B9\u679C"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-12)", color: "var(--tx-2)", lineHeight: 1.7, padding: "8px 12px", background: "color-mix(in oklab, var(--err) 8%, var(--surface-inset))", border: "1px solid color-mix(in oklab, var(--err) 30%, var(--line-dim))", borderLeft: "3px solid var(--err)", borderRadius: "var(--r-sm)", whiteSpace: "pre-wrap" } }, state.spiritConfuse))))
    ) : (
      /* 従来のフォーム表示（手動入力/編集時） */
      /* @__PURE__ */ React.createElement(Card, null, /* @__PURE__ */ React.createElement("div", { className: "card-header", style: { background: "var(--gold-tint)" } }, /* @__PURE__ */ React.createElement("span", { className: "t-label", style: { color: "var(--gold)" } }, "\u73FE\u5728\u88C5\u5099\u4E2D\u306E\u7CBE\u795E"), /* @__PURE__ */ React.createElement("span", { style: { fontFamily: "var(--f-display)", fontSize: "var(--fs-15)", fontWeight: 600, color: "var(--tx)", marginLeft: "var(--s-2)" } }, state.spirit), /* @__PURE__ */ React.createElement("div", { className: "grow" }), isAutoSpirit && forceEditSpirit && /* @__PURE__ */ React.createElement(Button, { variant: "ghost", size: "sm", icon: "eye", onClick: () => setForceEditSpirit(false) }, "\u30AB\u30FC\u30C9\u8868\u793A\u306B\u623B\u3059"), /* @__PURE__ */ React.createElement(Button, { variant: "ghost", size: "sm", icon: "x", onClick: () => {
        setF("spirit", "");
        setF("spiritMorale", "");
        setF("spiritConfuse", "");
        setF("spiritAlways", "");
        setForceEditSpirit(false);
        toast("\u7CBE\u795E\u3092\u89E3\u9664");
      } }, "\u89E3\u9664")), /* @__PURE__ */ React.createElement("div", { className: "card-body stack-3" }, /* @__PURE__ */ React.createElement(Field, { label: "\u7CBE\u795E\u540D" }, /* @__PURE__ */ React.createElement("input", { className: "input", value: state.spirit, onChange: (e) => setF("spirit", e.target.value) })), /* @__PURE__ */ React.createElement(Field, { label: "\u58EB\u6C17\u4F4E\u4E0B\u52B9\u679C" }, /* @__PURE__ */ React.createElement("textarea", { className: "textarea", rows: 2, value: state.spiritMorale, onChange: (e) => setF("spiritMorale", e.target.value) })), /* @__PURE__ */ React.createElement(Field, { label: "\u6DF7\u4E71\u52B9\u679C" }, /* @__PURE__ */ React.createElement("textarea", { className: "textarea", rows: 2, value: state.spiritConfuse, onChange: (e) => setF("spiritConfuse", e.target.value) })), /* @__PURE__ */ React.createElement(Field, { label: "\u5E38\u6642\u767A\u52D5\uFF08\u4EFB\u610F\uFF09" }, /* @__PURE__ */ React.createElement("input", { className: "input", value: state.spiritAlways, onChange: (e) => setF("spiritAlways", e.target.value) }))))
    )), !isCurrentSpirit && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "flex-end" } }, /* @__PURE__ */ React.createElement(Button, { variant: "ghost", size: "sm", icon: "plus", onClick: addManualSpirit }, "\u624B\u52D5\u3067\u7CBE\u795E\u3092\u8FFD\u52A0")), /* @__PURE__ */ React.createElement("div", { className: "codex" }, /* @__PURE__ */ React.createElement("div", { className: "codex-main" }, /* @__PURE__ */ React.createElement("div", { className: "codex-filters" }, /* @__PURE__ */ React.createElement("div", { className: "codex-filter-row" }, /* @__PURE__ */ React.createElement("div", { className: "codex-search" }, /* @__PURE__ */ React.createElement(Icon, { name: "search", size: 14 }), /* @__PURE__ */ React.createElement("input", { type: "text", placeholder: "\u7CBE\u795E\u540D\u30FB\u52B9\u679C\u3067\u691C\u7D22...", value: query, onChange: (e) => setQuery(e.target.value) })), /* @__PURE__ */ React.createElement("div", { className: "codex-count" }, /* @__PURE__ */ React.createElement("strong", null, filtered.length), " / ", DB.spirits.length))), /* @__PURE__ */ React.createElement("div", { className: "spirit-list" }, filtered.map((sp) => {
      const isSelected = selected?.name === sp.name;
      const isEquipped = state.spirit === sp.name;
      return /* @__PURE__ */ React.createElement(
        "div",
        {
          key: sp.name,
          className: `spirit-item${isSelected ? " is-active" : ""}${isEquipped ? " is-equipped" : ""}`,
          onClick: () => setSelected(sp),
          onDoubleClick: () => applySpirit(sp)
        },
        /* @__PURE__ */ React.createElement("div", { className: "spirit-item-head" }, /* @__PURE__ */ React.createElement("div", { className: "spirit-item-name" }, sp.name), /* @__PURE__ */ React.createElement("span", { className: "spirit-item-price" }, sp.price > 0 ? `LP ${sp.price}` : "\u521D\u671F\u9078\u629E\u53EF"), isEquipped && /* @__PURE__ */ React.createElement("span", { style: { marginLeft: "auto", fontSize: 9, color: "var(--gold)", fontFamily: "var(--f-display)", letterSpacing: "0.16em" } }, "\u2605 \u88C5\u5099\u4E2D")),
        sp.always_effect && /* @__PURE__ */ React.createElement("div", { className: "spirit-item-line" }, /* @__PURE__ */ React.createElement("span", { className: "spirit-item-tag", "data-tag": "always" }, "\u5E38\u6642"), /* @__PURE__ */ React.createElement("span", null, sp.always_effect)),
        sp.morale_effect && sp.morale_effect !== "\u306A\u3057" && /* @__PURE__ */ React.createElement("div", { className: "spirit-item-line" }, /* @__PURE__ */ React.createElement("span", { className: "spirit-item-tag", "data-tag": "morale" }, "\u58EB\u6C17"), /* @__PURE__ */ React.createElement("span", null, sp.morale_effect)),
        /* @__PURE__ */ React.createElement("div", { className: "spirit-item-line" }, /* @__PURE__ */ React.createElement("span", { className: "spirit-item-tag", "data-tag": "confuse" }, "\u6DF7\u4E71"), /* @__PURE__ */ React.createElement("span", null, sp.confuse_effect))
      );
    }))), selected ? /* @__PURE__ */ React.createElement("div", { className: "codex-detail" }, /* @__PURE__ */ React.createElement("div", { className: "detail-head", style: { "--sin-primary": "var(--gold)" } }, /* @__PURE__ */ React.createElement("div", { className: "detail-eyebrow" }, /* @__PURE__ */ React.createElement("span", { className: "detail-num" }, selected.price > 0 ? `LP ${selected.price}` : "\u521D\u671F\u9078\u629E\u53EF"), /* @__PURE__ */ React.createElement("span", { className: "detail-type" }, "SPIRIT / \u7CBE\u795E")), /* @__PURE__ */ React.createElement("div", { className: "detail-name" }, selected.name)), /* @__PURE__ */ React.createElement("div", { className: "detail-body" }, selected.always_effect && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "detail-section-title" }, "\u5E38\u6642\u52B9\u679C"), /* @__PURE__ */ React.createElement("div", { className: "detail-passive" }, /* @__PURE__ */ React.createElement("div", { className: "detail-passive-effect" }, selected.always_effect))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "detail-section-title" }, "\u58EB\u6C17\u4F4E\u4E0B\u52B9\u679C"), /* @__PURE__ */ React.createElement("div", { className: "detail-passive", style: { borderLeftColor: "var(--warn)" } }, /* @__PURE__ */ React.createElement("div", { className: "detail-passive-effect" }, selected.morale_effect || "\u306A\u3057"))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "detail-section-title" }, "\u6DF7\u4E71\u52B9\u679C"), /* @__PURE__ */ React.createElement("div", { className: "detail-passive", style: { borderLeftColor: "var(--err)" } }, /* @__PURE__ */ React.createElement("div", { className: "detail-passive-effect" }, selected.confuse_effect)))), /* @__PURE__ */ React.createElement("div", { className: "detail-actions" }, state.spirit === selected.name ? /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-10)", color: "var(--gold)", textAlign: "center", fontFamily: "var(--f-display)", letterSpacing: "0.2em", textTransform: "uppercase" } }, "\u2605 \u73FE\u5728\u88C5\u5099\u4E2D") : /* @__PURE__ */ React.createElement(Button, { variant: "primary", onClick: () => applySpirit(selected), icon: "check" }, "\u3053\u306E\u7CBE\u795E\u3092\u88C5\u5099"))) : /* @__PURE__ */ React.createElement("div", { className: "codex-detail" }, /* @__PURE__ */ React.createElement("div", { className: "detail-empty" }, /* @__PURE__ */ React.createElement("div", { className: "detail-empty-icon" }, "\u{1F701}"), /* @__PURE__ */ React.createElement("div", { className: "t-label" }, "\u5DE6\u306E\u30AB\u30FC\u30C9\u3092\u9078\u629E"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-11)", color: "var(--tx-mute)", marginTop: 8 } }, "\u7CBE\u795E\u3092\u9078\u629E\u3059\u308B\u3068\u8A73\u7D30\u304C\u8868\u793A\u3055\u308C\u307E\u3059\u3002", /* @__PURE__ */ React.createElement("br", null), "\u30C0\u30D6\u30EB\u30AF\u30EA\u30C3\u30AF\u3067\u88C5\u5099\u3002")))));
  };
  const EnhancementSection = ({ state, dispatch }) => {
    const setEnh = (list) => dispatch({ type: "SET_FIELD", field: "enhancements", value: list });
    const addEnh = (e) => {
      if (state.enhancements.some((x) => x.name === e.name)) {
        toast("\u65E2\u306B\u8FFD\u52A0\u6E08\u307F");
        return;
      }
      setEnh([...state.enhancements, { ...e, id: `enh-${Date.now()}` }]);
      toast(`\u300E${e.name}\u300F\u3092\u8FFD\u52A0`);
    };
    const removeEnh = (id) => setEnh(state.enhancements.filter((e) => e.id !== id));
    const [category, setCategory] = React.useState("special");
    const catList = category === "special" ? DB.special_enhancements : DB.normal_enhancements.filter((e) => e.category === category);
    const cats = [
      { v: "special", l: "\u7279\u6B8A\u5F37\u5316" },
      { v: "persona", l: "\u901A\u5E38\u4EBA\u683C" },
      { v: "prisoner", l: "LCB\u4EBA\u683C" },
      { v: "sync", l: "\u540C\u671F\u5316\u4EBA\u683C" }
    ];
    return /* @__PURE__ */ React.createElement("div", { className: "stack-4" }, /* @__PURE__ */ React.createElement(Card, null, /* @__PURE__ */ React.createElement("div", { className: "card-header" }, /* @__PURE__ */ React.createElement("span", { className: "t-label" }, "\u5F37\u5316DB"), /* @__PURE__ */ React.createElement("div", { className: "grow" }), /* @__PURE__ */ React.createElement("div", { className: "segmented" }, cats.map((c) => /* @__PURE__ */ React.createElement("button", { key: c.v, className: category === c.v ? "is-active" : "", onClick: () => setCategory(c.v) }, c.l)))), /* @__PURE__ */ React.createElement("div", { style: { padding: "var(--s-2)", maxHeight: 320, overflowY: "auto" } }, /* @__PURE__ */ React.createElement("div", { className: "spp-list", style: { maxHeight: "none", padding: 0, background: "transparent", border: "none" } }, catList.map((e) => /* @__PURE__ */ React.createElement("div", { key: e.name, className: "spp-item", onClick: () => addEnh(e) }, /* @__PURE__ */ React.createElement("div", { className: "spp-item-name" }, e.name, " ", /* @__PURE__ */ React.createElement("span", { style: { fontSize: "var(--fs-10)", color: "var(--gold)", fontWeight: 400 } }, "\u6B20\u7247", e.shards)), /* @__PURE__ */ React.createElement("div", { className: "spp-item-eff" }, e.effect)))))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "t-label", style: { marginBottom: "var(--s-2)" } }, "\u53D6\u5F97\u6E08\u307F (", state.enhancements.length, ")"), state.enhancements.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "empty" }, "\u5F37\u5316\u306F\u3042\u308A\u307E\u305B\u3093") : /* @__PURE__ */ React.createElement("div", { className: "stack-2" }, state.enhancements.map((e) => /* @__PURE__ */ React.createElement("div", { key: e.id, className: "list-item" }, /* @__PURE__ */ React.createElement("div", { className: "list-item-head" }, /* @__PURE__ */ React.createElement("span", { className: "list-item-title" }, e.name), /* @__PURE__ */ React.createElement("span", { className: "badge" }, "\u6B20\u7247", e.shards), /* @__PURE__ */ React.createElement("button", { className: "btn-ghost btn-icon", onClick: () => removeEnh(e.id) }, /* @__PURE__ */ React.createElement(Icon, { name: "trash", size: 12 }))), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-12)", color: "var(--tx-2)" } }, e.effect))))));
  };
  const SYNC_RANKS = [null, "0", "00", "000"];
  const RosterSection = ({ state, dispatch }) => {
    const cycleFlag = (uid, field, cycle) => {
      const p = state.roster.personas.find((x) => x.uid === uid);
      if (!p) return;
      const idx = cycle.indexOf(p[field]);
      const next = cycle[(idx + 1) % cycle.length];
      dispatch({ type: "PATCH_ROSTER", uid, patch: { [field]: next } });
    };
    const toggleFlag = (uid, field) => {
      const p = state.roster.personas.find((x) => x.uid === uid);
      if (!p) return;
      dispatch({ type: "PATCH_ROSTER", uid, patch: { [field]: !p[field] } });
    };
    const equipFromRoster = (uid) => {
      const p = state.roster.personas.find((x) => x.uid === uid);
      if (!p) return;
      const src = p.mode === "n" ? DB.normal_personas : DB.tokui_personas;
      const found = src.find((x) => x.no === p.no);
      if (found) {
        dispatch({ type: "EQUIP_PERSONA", mode: p.mode, no: p.no, src: found });
        toast(`\u300E${found.name}\u300F\u3092\u88C5\u5099`);
      }
    };
    const removeRoster = (uid, name) => {
      if (confirm(`\u300E${name}\u300F\u3092\u6240\u6301\u30EA\u30B9\u30C8\u304B\u3089\u524A\u9664\u3057\u307E\u3059\u304B\uFF1F\uFF08\u88C5\u5099\u30C7\u30FC\u30BF\u306F\u6B8B\u308A\u307E\u3059\uFF09`)) {
        dispatch({ type: "REMOVE_ROSTER", uid });
        toast("\u6240\u6301\u30EA\u30B9\u30C8\u304B\u3089\u524A\u9664");
      }
    };
    const clearAll = () => {
      if (confirm(`\u6240\u6301\u30EA\u30B9\u30C8 ${state.roster.personas.length} \u4EF6\u3092\u3059\u3079\u3066\u524A\u9664\u3057\u307E\u3059\u304B\uFF1F`)) {
        state.roster.personas.forEach((p) => {
          if (!p.equipped) dispatch({ type: "REMOVE_ROSTER", uid: p.uid });
        });
        toast("\u88C5\u5099\u4E2D\u4EE5\u5916\u3092\u524A\u9664");
      }
    };
    return /* @__PURE__ */ React.createElement("div", { className: "stack-3" }, /* @__PURE__ */ React.createElement("div", { style: { padding: "var(--s-3)", background: "var(--surface-inset)", border: "1px solid var(--line-dim)", borderRadius: "var(--r)" } }, /* @__PURE__ */ React.createElement("div", { className: "t-label", style: { color: "var(--gold)", marginBottom: 6 } }, "\u6240\u6301\u4EBA\u683C\u306E\u7BA1\u7406"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-11)", color: "var(--tx-2)", lineHeight: 1.6 } }, "\u88C5\u5099\u3057\u305F\u4EBA\u683C\u306F\u81EA\u52D5\u7684\u306B\u6240\u6301\u30EA\u30B9\u30C8\u3078\u8FFD\u52A0\u3055\u308C\u307E\u3059\u3002", /* @__PURE__ */ React.createElement("b", { style: { color: "var(--gold)" } }, "[\u540C\u671F 0/00/000]"), " \u306E\u30D0\u30C3\u30B8\u306F\u300E\u30A2\u30F3\u30ED\u30C3\u30AF\u30C9\u30FB\u30B7\u30F3\u30AF\u300F\u30B5\u30D7\u30EA\u30E1\u30F3\u30C8\u7528\u306E\u540C\u671F\u5316\u30E9\u30F3\u30AF\u7BA1\u7406\u3002", /* @__PURE__ */ React.createElement("br", null), /* @__PURE__ */ React.createElement("span", { style: { color: "var(--tx-dim)", display: "inline-flex", alignItems: "center", gap: 4, flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement("b", { style: { color: "var(--warn)" } }, "\u25B6 \u540C\u671F\u5316\u3057\u305F\u4EBA\u683C\u306E\u5024\u304C\u5909\u308F\u308B\u5834\u5408\uFF1A"), "\u4E0A\u306E\u300C\u4EBA\u683C\u300D\u30DA\u30FC\u30B8\u3067\u88C5\u5099 \u2192 ", /* @__PURE__ */ React.createElement("b", { style: { color: "var(--tx-2)" } }, "Base Info"), " \u30D6\u30ED\u30C3\u30AF\u3067 HP/SAN/\u901F\u5EA6/\u8010\u6027/\u30D1\u30C3\u30B7\u30D6\u52B9\u679C\u3092\u624B\u52D5\u7DE8\u96C6\u3067\u304D\u307E\u3059\u3002"))), state.roster.personas.length > 0 && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "flex-end", gap: "var(--s-2)" } }, /* @__PURE__ */ React.createElement(Button, { variant: "ghost", size: "sm", icon: "trash", onClick: clearAll }, "\u88C5\u5099\u4E2D\u4EE5\u5916\u3092\u4E00\u62EC\u524A\u9664")), state.roster.personas.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "empty", style: { padding: "var(--s-6)" } }, "\u6240\u6301\u4EBA\u683C\u306F\u307E\u3060\u3042\u308A\u307E\u305B\u3093 \u2014 \u4EBA\u683C\u30DA\u30FC\u30B8\u304B\u3089\u88C5\u5099\u3059\u308B\u3068\u81EA\u52D5\u8FFD\u52A0\u3055\u308C\u307E\u3059") : /* @__PURE__ */ React.createElement("div", { className: "stack-2" }, state.roster.personas.map((r) => {
      const src = r.mode === "n" ? DB.normal_personas : DB.tokui_personas;
      const found = src.find((x) => x.no === r.no);
      if (!found) return null;
      const primarySin = getPrimarySin(found);
      return /* @__PURE__ */ React.createElement("div", { key: r.uid, className: `roster-item${r.equipped ? " is-equipped" : ""}`, "data-sin": primarySin || "" }, /* @__PURE__ */ React.createElement("div", { className: "roster-item-info" }, /* @__PURE__ */ React.createElement("div", { className: "roster-item-name" }, found.name, r.equipped && /* @__PURE__ */ React.createElement("span", { style: { marginLeft: 8, fontSize: "var(--fs-10)", color: "var(--gold)", fontFamily: "var(--f-display)", letterSpacing: "0.16em" } }, "\u2605 EQUIPPED")), /* @__PURE__ */ React.createElement("div", { className: "roster-item-meta" }, /* @__PURE__ */ React.createElement("span", null, "No.", String(found.no).padStart(3, "0")), /* @__PURE__ */ React.createElement("span", null, r.mode === "n" ? "\u901A\u5E38" : "\u7279\u7570"), /* @__PURE__ */ React.createElement("span", null, "HP ", found.hp, " \xB7 SAN ", found.san))), /* @__PURE__ */ React.createElement("div", { className: "roster-flags" }, /* @__PURE__ */ React.createElement("button", { className: `roster-flag${r.syncRank ? " is-on" : ""}`, onClick: () => cycleFlag(r.uid, "syncRank", SYNC_RANKS), title: "\u540C\u671F\u5316\u30E9\u30F3\u30AF\u3092\u5FAA\u74B0\uFF08\u306A\u3057\u21920\u219200\u2192000\uFF09" }, r.syncRank ? `\u540C\u671F${r.syncRank}` : "\u540C\u671F\u5316\u306A\u3057"), /* @__PURE__ */ React.createElement("button", { className: `roster-flag${r.syncMax ? " is-on" : ""}`, onClick: () => toggleFlag(r.uid, "syncMax"), title: "\u540C\u671FMAX" }, "MAX"), !r.equipped && /* @__PURE__ */ React.createElement(
        "button",
        {
          className: "btn btn-sm",
          onClick: () => equipFromRoster(r.uid),
          style: { fontSize: "var(--fs-10)", padding: "4px 8px" }
        },
        "\u88C5\u5099"
      ), /* @__PURE__ */ React.createElement(
        "button",
        {
          className: "btn btn-sm",
          onClick: () => removeRoster(r.uid, found.name),
          style: {
            fontSize: "var(--fs-10)",
            padding: "4px 8px",
            color: "var(--err)",
            borderColor: "color-mix(in oklab, var(--err) 40%, var(--line))",
            background: "color-mix(in oklab, var(--err) 6%, var(--surface-2))"
          },
          title: "\u6240\u6301\u30EA\u30B9\u30C8\u304B\u3089\u524A\u9664"
        },
        /* @__PURE__ */ React.createElement(Icon, { name: "trash", size: 11 }),
        " \u524A\u9664"
      )));
    })));
  };
  const DEFAULT_FMLs = [
    { name: "MT", expr: "{\u30D1\u30EF\u30FC}-{\u865A\u5F31}+{\u5171\u9CF4}+{\u30B9\u30AD\u30EB\u5A01\u529B}+{\u30DE\u30C3\u30C1\u5A01\u529B\u5897\u52A0}-{\u30DE\u30C3\u30C1\u5A01\u529B\u4F4E\u4E0B}", builtin: true },
    { name: "DM", expr: "{\u30D1\u30EF\u30FC}-{\u865A\u5F31}+{\u5171\u9CF4}+{\u30B9\u30AD\u30EB\u5A01\u529B}+{\u30C0\u30E1\u30FC\u30B8\u91CF\u5897\u52A0}-{\u30C0\u30E1\u30FC\u30B8\u91CF\u6E1B\u5C11}", builtin: true },
    { name: "DT", expr: "{\u5171\u9CF4}+{\u5FCD\u8010}-{\u6B66\u88C5\u89E3\u9664}+{\u5B88\u5099\u5A01\u529B}", builtin: true },
    { name: "QB", expr: "{\u675F\u7E1B}+{\u30AF\u30A4\u30C3\u30AF}", builtin: true }
  ];
  const FACTORY_DEFAULT_STATUS = [
    { label: "HP", initial: 100, max: 100 },
    { label: "SAN", initial: 45, max: 45 },
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
  const SettingsSection = ({ state, dispatch }) => {
    const setF = (field, value) => dispatch({ type: "SET_FIELD", field, value });
    const [showDefaults, setShowDefaults] = React.useState(false);
    const addFml = () => setF("formulas", [...state.formulas, { id: `fml-${Date.now()}`, name: "", expr: "" }]);
    const patchFml = (id, patch) => setF("formulas", state.formulas.map((f) => f.id === id ? { ...f, ...patch } : f));
    const rmFml = (id) => setF("formulas", state.formulas.filter((f) => f.id !== id));
    const bov = state.builtinFormulasOverride || {};
    const setBov = (name, val) => setF("builtinFormulasOverride", { ...bov, [name]: val });
    const [editingBuiltin, setEditingBuiltin] = React.useState(null);
    const [editDraft, setEditDraft] = React.useState("");
    const startEditBuiltin = (name, currentExpr) => {
      setEditingBuiltin(name);
      setEditDraft(currentExpr);
    };
    const commitEditBuiltin = () => {
      if (editingBuiltin) {
        setBov(editingBuiltin, editDraft);
        setEditingBuiltin(null);
        toast("\u7D44\u8FBC\u5F0F\u3092\u4E0A\u66F8\u304D");
      }
    };
    const cancelEditBuiltin = () => {
      setEditingBuiltin(null);
      setEditDraft("");
    };
    const removeBuiltin = (name) => {
      if (confirm(`\u7D44\u8FBC\u5F0F\u300C${name}\u300D\u3092\u975E\u8868\u793A\uFF08\u524A\u9664\uFF09\u3057\u307E\u3059\u304B\uFF1F\u30C1\u30E3\u30C3\u30C8\u30D1\u30EC\u30C3\u30C8\u306B\u51FA\u529B\u3055\u308C\u306A\u304F\u306A\u308A\u307E\u3059\u3002`)) {
        setBov(name, null);
        toast(`${name} \u3092\u524A\u9664`);
      }
    };
    const restoreBuiltin = (name) => {
      const next = { ...bov };
      delete next[name];
      setF("builtinFormulasOverride", next);
      toast(`${name} \u3092\u5FA9\u5143`);
    };
    const resetAllFormulas = () => {
      if (confirm("\u4EE3\u5165\u5F0F\u3092\u5168\u3066\u30EA\u30BB\u30C3\u30C8\u3057\u307E\u3059\u304B\uFF1F\n\u30FB\u7D44\u8FBC\u5F0F(MT/DM/DT/QB)\u3092\u521D\u671F\u72B6\u614B\u306B\u623B\u3059\n\u30FB\u30AB\u30B9\u30BF\u30E0\u4EE3\u5165\u5F0F\u3092\u3059\u3079\u3066\u524A\u9664\n\u3053\u306E\u64CD\u4F5C\u306F\u53D6\u308A\u6D88\u305B\u307E\u305B\u3093\u3002")) {
        setF("builtinFormulasOverride", {});
        setF("formulas", []);
        toast("\u4EE3\u5165\u5F0F\u3092\u30EA\u30BB\u30C3\u30C8");
      }
    };
    const addCs = (place = "status") => setF("customStatuses", [...state.customStatuses, { id: `cs-${Date.now()}`, label: "", initial: 0, max: 99, place }]);
    const patchCs = (id, patch) => setF("customStatuses", state.customStatuses.map((c) => c.id === id ? { ...c, ...patch } : c));
    const rmCs = (id) => setF("customStatuses", state.customStatuses.filter((c) => c.id !== id));
    const csDnd = useDragReorder({
      onReorder: (from, to) => dispatch({ type: "MOVE_LIST_INDEX", field: "customStatuses", from, to })
    });
    const dst = state.defaultStatuses || FACTORY_DEFAULT_STATUS;
    const setDst = (list) => setF("defaultStatuses", list);
    const patchDst = (i, patch) => setDst(dst.map((s, j) => i === j ? { ...s, ...patch } : s));
    const rmDst = (i) => setDst(dst.filter((_, j) => j !== i));
    const addDst = () => setDst([...dst, { label: "", initial: 0, max: 99 }]);
    const resetDst = () => {
      if (confirm("\u30C7\u30D5\u30A9\u30EB\u30C8\u30B9\u30C6\u30FC\u30BF\u30B9\u3092\u51FA\u8377\u6642\uFF0816\u9805\u76EE\uFF09\u306B\u623B\u3057\u307E\u3059\u304B\uFF1F")) setDst(FACTORY_DEFAULT_STATUS);
    };
    return /* @__PURE__ */ React.createElement("div", { className: "stack-4" }, /* @__PURE__ */ React.createElement(Card, null, /* @__PURE__ */ React.createElement("div", { className: "card-header" }, /* @__PURE__ */ React.createElement("span", { className: "t-label" }, "FORMULAS / \u4EE3\u5165\u5F0F"), /* @__PURE__ */ React.createElement("div", { className: "grow" }), /* @__PURE__ */ React.createElement(Button, { size: "sm", variant: "ghost", icon: "trash", onClick: resetAllFormulas, title: "\u7D44\u8FBC\u3092\u521D\u671F\u72B6\u614B\u3001\u30AB\u30B9\u30BF\u30E0\u3092\u5168\u524A\u9664" }, "\u5168\u30EA\u30BB\u30C3\u30C8"), /* @__PURE__ */ React.createElement(Button, { size: "sm", icon: "plus", onClick: addFml }, "\u8FFD\u52A0")), /* @__PURE__ */ React.createElement("div", { className: "card-body" }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-11)", color: "var(--tx-2)", marginBottom: "var(--s-3)", lineHeight: 1.5 } }, /* @__PURE__ */ React.createElement("b", { style: { color: "var(--gold)" } }, "//\u5909\u6570\u540D=\u5F0F"), " \u3067\u4EE3\u5165\u5F0F\u3092\u5B9A\u7FA9\u3002", /* @__PURE__ */ React.createElement("code", { style: { fontFamily: "var(--f-mono)", color: "var(--gold)" } }, "{\u9EBB\u75FA}"), "\u7B49\u306E\u30B9\u30C6\u30FC\u30BF\u30B9\u5909\u6570\u3092\u4F7F\u7528\u53EF\u80FD\u3002\u7D44\u8FBC\u5F0F(MT/DM/DT/QB)\u3082\u7DE8\u96C6\u30FB\u524A\u9664\u53EF\u80FD\u3002"), /* @__PURE__ */ React.createElement("div", { className: "stack-1", style: { marginBottom: "var(--s-3)" } }, DEFAULT_FMLs.map((f) => {
      const isHidden = bov[f.name] === null;
      if (isHidden) {
        return /* @__PURE__ */ React.createElement("div", { key: f.name, style: { display: "flex", gap: "var(--s-2)", alignItems: "center", padding: "6px 10px", background: "var(--surface-inset)", border: "1px dashed var(--line-dim)", borderRadius: "var(--r-sm)", opacity: 0.7 } }, /* @__PURE__ */ React.createElement("span", { style: { fontFamily: "var(--f-mono)", color: "var(--tx-mute)", fontSize: "var(--fs-12)", minWidth: 60, textDecoration: "line-through" } }, f.name), /* @__PURE__ */ React.createElement("span", { style: { fontSize: "var(--fs-10)", color: "var(--tx-mute)", fontStyle: "italic", flex: 1 } }, "\u975E\u8868\u793A\u4E2D\uFF08\u30C1\u30E3\u30C3\u30C8\u30D1\u30EC\u30C3\u30C8\u672A\u51FA\u529B\uFF09"), /* @__PURE__ */ React.createElement("button", { className: "btn btn-sm", onClick: () => restoreBuiltin(f.name) }, /* @__PURE__ */ React.createElement(Icon, { name: "undo", size: 10 }), " \u5FA9\u5143"));
      }
      const resolved = window.LBT_gen && window.LBT_gen.resolveFormulas ? window.LBT_gen.resolveFormulas(state).find((x) => x.name === f.name) : null;
      const finalExpr = resolved ? resolved.expr : f.expr;
      const isOverridden = typeof bov[f.name] === "string";
      const baseExpr = isOverridden ? bov[f.name] : f.expr;
      const isAutoModified = finalExpr !== baseExpr;
      const isEditing = editingBuiltin === f.name;
      return /* @__PURE__ */ React.createElement("div", { key: f.name, style: { display: "grid", gridTemplateColumns: "140px 1fr auto", gap: "var(--s-2)", alignItems: "center", padding: "6px 0" } }, /* @__PURE__ */ React.createElement("span", { style: { fontFamily: "var(--f-mono)", color: "var(--gold)", fontSize: "var(--fs-12)", padding: "6px 10px", background: "var(--gold-tint)", border: "1px solid var(--gold-line)", borderRadius: "var(--r-sm)", display: "flex", alignItems: "center", gap: 6 } }, f.name, isOverridden && /* @__PURE__ */ React.createElement(
        "span",
        {
          style: { fontSize: 9, color: "var(--warn)", fontFamily: "var(--f-display)", letterSpacing: "0.14em", padding: "1px 4px", background: "color-mix(in oklab, var(--warn) 15%, transparent)", border: "1px solid color-mix(in oklab, var(--warn) 40%, transparent)", borderRadius: 2 },
          title: "\u30E6\u30FC\u30B6\u30FC\u7DE8\u96C6\u6E08\u307F"
        },
        "\u7DE8\u96C6\u6E08"
      ), isAutoModified && !isOverridden && /* @__PURE__ */ React.createElement(
        "span",
        {
          style: { fontSize: 9, color: "var(--ok)", fontFamily: "var(--f-display)", letterSpacing: "0.14em", padding: "1px 4px", background: "color-mix(in oklab, var(--ok) 15%, transparent)", border: "1px solid color-mix(in oklab, var(--ok) 40%, transparent)", borderRadius: 2 },
          title: "\u88C5\u5099\u4E2D\u306E\u7279\u6B8A\u5F37\u5316\u30FB\u30B5\u30DD\u30FC\u30C8\u30D1\u30C3\u30B7\u30D6\u304B\u3089\u81EA\u52D5\u53CD\u6620\u3055\u308C\u305F\u9805\u76EE\u304C\u3042\u308A\u307E\u3059"
        },
        "+AUTO"
      )), isEditing ? /* @__PURE__ */ React.createElement(
        "input",
        {
          className: "input",
          autoFocus: true,
          value: editDraft,
          onChange: (e) => setEditDraft(e.target.value),
          onKeyDown: (e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitEditBuiltin();
            } else if (e.key === "Escape") {
              e.preventDefault();
              cancelEditBuiltin();
            }
          },
          onBlur: commitEditBuiltin,
          style: { fontFamily: "var(--f-mono)", fontSize: "var(--fs-11)" }
        }
      ) : /* @__PURE__ */ React.createElement(
        "code",
        {
          onClick: () => startEditBuiltin(f.name, baseExpr),
          title: "\u30AF\u30EA\u30C3\u30AF\u3067\u7DE8\u96C6",
          style: { fontFamily: "var(--f-mono)", color: isAutoModified ? "var(--gold-hi)" : "var(--tx-2)", fontSize: "var(--fs-11)", padding: "6px 10px", background: isAutoModified ? "color-mix(in oklab, var(--ok) 6%, var(--surface-inset))" : "var(--surface-inset)", border: `1px solid ${isAutoModified ? "color-mix(in oklab, var(--ok) 30%, var(--line-dim))" : "var(--line-dim)"}`, borderRadius: "var(--r-sm)", lineHeight: 1.4, cursor: "text" }
        },
        finalExpr
      ), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 4, alignItems: "center" } }, isOverridden && /* @__PURE__ */ React.createElement("button", { className: "btn-ghost btn-icon", onClick: () => restoreBuiltin(f.name), title: "\u7D44\u8FBC\u306E\u30C7\u30D5\u30A9\u30EB\u30C8\u5F0F\u306B\u623B\u3059" }, /* @__PURE__ */ React.createElement(Icon, { name: "undo", size: 12 })), /* @__PURE__ */ React.createElement("button", { className: "btn-ghost btn-icon", onClick: () => removeBuiltin(f.name), title: "\u3053\u306E\u7D44\u8FBC\u5F0F\u3092\u524A\u9664\uFF08\u975E\u8868\u793A\uFF09" }, /* @__PURE__ */ React.createElement(Icon, { name: "trash", size: 12 }))));
    }), (() => {
      const enhNames = (state.enhancements || []).map((e) => e.name).filter((n) => ["\u71C3\u3048\u4E0A\u304C\u308B\u95D8\u5FD7", "\u9032\u3080\u3079\u304D\u5B88\u5099"].includes(n));
      const sppNames = (state.supports || []).map((s) => s.name).filter((n) => n.includes("\u58CA\u3057\u7815\u304F\u6253\u6483") || n.includes("\u5207\u308A\u4F0F\u305B\u308B\u65AC\u6483") || n.includes("\u523A\u3057\u8CAB\u304F\u8CAB\u901A"));
      const triggers = [...enhNames, ...sppNames];
      if (triggers.length === 0) return null;
      return /* @__PURE__ */ React.createElement("div", { style: { padding: "6px 10px", background: "color-mix(in oklab, var(--ok) 6%, var(--surface-inset))", border: "1px dashed color-mix(in oklab, var(--ok) 35%, var(--line-dim))", borderRadius: "var(--r-sm)", fontSize: "var(--fs-10)", color: "var(--tx-2)", lineHeight: 1.6, marginTop: 4 } }, /* @__PURE__ */ React.createElement("b", { style: { color: "var(--ok)" } }, "\u25B6 \u81EA\u52D5\u53CD\u6620\u4E2D"), "\uFF1A", triggers.map((n) => /* @__PURE__ */ React.createElement("span", { key: n, style: { padding: "1px 6px", margin: "0 3px", background: "var(--surface-2)", border: "1px solid var(--line-dim)", borderRadius: 2, fontFamily: "var(--f-display)", fontSize: 10, letterSpacing: "0.06em" } }, n)), /* @__PURE__ */ React.createElement("span", { style: { color: "var(--tx-dim)", marginLeft: 6 } }, "\u2192 MT/DM \u5F0F\u306B ", /* @__PURE__ */ React.createElement("code", { style: { color: "var(--gold)" } }, "+\u95D8\u5FD7"), " / ", /* @__PURE__ */ React.createElement("code", { style: { color: "var(--gold)" } }, "+\u6253\u6483\u88DC\u6B63"), " \u7B49\u3092\u81EA\u52D5\u8FFD\u52A0"));
    })()), /* @__PURE__ */ React.createElement("div", { className: "stack-2" }, state.formulas.length === 0 ? /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-11)", color: "var(--tx-mute)", padding: "var(--s-2)", fontStyle: "italic" } }, "\u30AB\u30B9\u30BF\u30E0\u4EE3\u5165\u5F0F\u306F\u307E\u3060\u3042\u308A\u307E\u305B\u3093 \u2014 \u300C\u8FFD\u52A0\u300D\u30DC\u30BF\u30F3\u3067\u4F5C\u6210\u3067\u304D\u307E\u3059") : state.formulas.map((f, i) => /* @__PURE__ */ React.createElement("div", { key: f.id, style: { display: "grid", gridTemplateColumns: "auto 140px 1fr auto", gap: "var(--s-2)", alignItems: "center" } }, /* @__PURE__ */ React.createElement("div", { className: "reorder-btns" }, /* @__PURE__ */ React.createElement("button", { className: "reorder-btn", onClick: () => dispatch({ type: "REORDER_LIST", field: "formulas", key: f.id, dir: -1 }), disabled: i === 0, title: "\u4E0A\u3078" }, /* @__PURE__ */ React.createElement(Icon, { name: "arrowU", size: 10 })), /* @__PURE__ */ React.createElement("button", { className: "reorder-btn", onClick: () => dispatch({ type: "REORDER_LIST", field: "formulas", key: f.id, dir: 1 }), disabled: i === state.formulas.length - 1, title: "\u4E0B\u3078" }, /* @__PURE__ */ React.createElement(Icon, { name: "arrowD", size: 10 }))), /* @__PURE__ */ React.createElement("input", { className: "input", placeholder: "\u5909\u6570\u540D", value: f.name, onChange: (e) => patchFml(f.id, { name: e.target.value }), style: { fontFamily: "var(--f-mono)" } }), /* @__PURE__ */ React.createElement("input", { className: "input", placeholder: "\u5F0F\uFF08\u4F8B\uFF1A\u30B9\u30AD\u30EB\u5A01\u529B+\u30DE\u30C3\u30C1\u5A01\u529B\u5897\u52A0\uFF09", value: f.expr, onChange: (e) => patchFml(f.id, { expr: e.target.value }) }), /* @__PURE__ */ React.createElement("button", { className: "btn-ghost btn-icon", onClick: () => rmFml(f.id), title: "\u524A\u9664" }, /* @__PURE__ */ React.createElement(Icon, { name: "trash", size: 12 }))))), /* @__PURE__ */ React.createElement("div", { style: { marginTop: "var(--s-4)", paddingTop: "var(--s-3)", borderTop: "1px solid var(--line-dim)", display: "flex", alignItems: "center", gap: "var(--s-3)", flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement("label", { style: { display: "flex", alignItems: "center", gap: "var(--s-2)", cursor: "pointer", fontSize: "var(--fs-12)" } }, /* @__PURE__ */ React.createElement("input", { type: "checkbox", checked: state.autoFml !== false, onChange: (e) => setF("autoFml", e.target.checked), style: { accentColor: "var(--gold)" } }), /* @__PURE__ */ React.createElement("span", null, "\u52B9\u679C\u30C6\u30AD\u30B9\u30C8\u304B\u3089\u4EE3\u5165\u5F0F\u3078\u81EA\u52D5\u53CD\u6620")), /* @__PURE__ */ React.createElement("span", { style: { fontSize: "var(--fs-10)", color: "var(--tx-mute)", marginLeft: "auto" } }, "OFF\u306B\u3059\u308B\u3068\u624B\u52D5\u7DE8\u96C6\u306E\u307F")), /* @__PURE__ */ React.createElement("div", { style: { marginTop: "var(--s-4)", paddingTop: "var(--s-3)", borderTop: "1px solid var(--line-dim)" } }, /* @__PURE__ */ React.createElement(Field, { label: "\u58EB\u6C17\u4F4E\u4E0B\u30E9\u30A4\u30F3" }, /* @__PURE__ */ React.createElement("input", { className: "input", type: "number", placeholder: "12", value: state.moraleLine, onChange: (e) => setF("moraleLine", e.target.value), style: { maxWidth: 120 } })), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-11)", color: "var(--tx-dim)", marginTop: 6, lineHeight: 1.5 } }, "\u95D8\u5FD7\u30FB\u5B88\u5099\u5A01\u529B\u30FB\u6253\u6483\u88DC\u6B63\uFF08\u65AC\u6483/\u8CAB\u901A\u88DC\u6B63\uFF09\u306F\u521D\u671F\u50240\u3002\u5BFE\u5FDC\u3059\u308B\u7279\u6B8A\u5F37\u5316\u30FB\u30B5\u30DD\u30FC\u30C8\u30D1\u30C3\u30B7\u30D6\u304C\u9078\u629E\u3055\u308C\u3066\u3044\u308B\u5834\u5408\u306E\u307F\u81EA\u52D5\u7684\u306B1\u3068\u3057\u3066\u53CD\u6620\u3055\u308C\u307E\u3059\u3002")))), /* @__PURE__ */ React.createElement(Card, null, /* @__PURE__ */ React.createElement("div", { className: "card-header" }, /* @__PURE__ */ React.createElement("span", { className: "t-label" }, "DEFAULT STATUS / \u30C7\u30D5\u30A9\u30EB\u30C8\u30B9\u30C6\u30FC\u30BF\u30B9\u7DE8\u96C6"), /* @__PURE__ */ React.createElement("div", { className: "grow" }), /* @__PURE__ */ React.createElement(Button, { size: "sm", variant: "ghost", icon: showDefaults ? "chevronD" : "chevron", onClick: () => setShowDefaults(!showDefaults) }, showDefaults ? "\u9589\u3058\u308B" : "\u958B\u304F")), showDefaults && /* @__PURE__ */ React.createElement("div", { className: "card-body" }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-11)", color: "var(--tx-2)", marginBottom: "var(--s-3)", lineHeight: 1.5 } }, "JSON\u51FA\u529B\u306E ", /* @__PURE__ */ React.createElement("code", { style: { color: "var(--gold)" } }, "status"), " \u306B\u542B\u307E\u308C\u308B\u30C7\u30D5\u30A9\u30EB\u30C8\u9805\u76EE (", dst.length, "\u500B)\u3002\u8FFD\u52A0\u30FB\u524A\u9664\u30FB\u540D\u79F0\u30FB\u521D\u671F\u5024/\u6700\u5927\u5024\u306E\u5909\u66F4\u304C\u53EF\u80FD\u3002"), /* @__PURE__ */ React.createElement("div", { className: "stack-2", style: { maxHeight: 340, overflowY: "auto", padding: 2 } }, dst.map((s, i) => {
      const linked = s.label === "HP" || s.label === "SAN";
      const linkedVal = s.label === "HP" ? state.hp || state.personaSrc?.hp || "?" : s.label === "SAN" ? state.san || state.personaSrc?.san || "?" : null;
      return /* @__PURE__ */ React.createElement("div", { key: i, style: { display: "grid", gridTemplateColumns: "auto 2fr 90px 90px auto", gap: "var(--s-2)", alignItems: "center" } }, /* @__PURE__ */ React.createElement("div", { className: "reorder-btns" }, /* @__PURE__ */ React.createElement("button", { className: "reorder-btn", onClick: () => dispatch({ type: "REORDER_DEFAULT_STATUS", from: i, to: i - 1 }), disabled: i === 0, title: "\u4E0A\u3078" }, /* @__PURE__ */ React.createElement(Icon, { name: "arrowU", size: 10 })), /* @__PURE__ */ React.createElement("button", { className: "reorder-btn", onClick: () => dispatch({ type: "REORDER_DEFAULT_STATUS", from: i, to: i + 1 }), disabled: i === dst.length - 1, title: "\u4E0B\u3078" }, /* @__PURE__ */ React.createElement(Icon, { name: "arrowD", size: 10 }))), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6 } }, /* @__PURE__ */ React.createElement("input", { className: "input", placeholder: "\u30E9\u30D9\u30EB", value: s.label, onChange: (e) => patchDst(i, { label: e.target.value }), disabled: linked, title: linked ? "HP/SAN\u306F\u88C5\u5099\u4EBA\u683C\u306B\u9023\u52D5\u3059\u308B\u305F\u3081\u540D\u79F0\u56FA\u5B9A" : "\u30E9\u30D9\u30EB\u540D" }), linked && /* @__PURE__ */ React.createElement(
        "span",
        {
          style: { whiteSpace: "nowrap", fontSize: 9, padding: "2px 6px", fontFamily: "var(--f-display)", letterSpacing: "0.08em", color: "var(--ok)", background: "color-mix(in oklab, var(--ok) 10%, var(--surface-inset))", border: "1px solid color-mix(in oklab, var(--ok) 35%, var(--line))", borderRadius: 2 },
          title: "\u3053\u306E\u9805\u76EE\u306F\u88C5\u5099\u4E2D\u4EBA\u683C\u306E {s.label} \u306B\u81EA\u52D5\u9023\u52D5\u3057\u307E\u3059\u3002\u5909\u66F4\u306F\u4EBA\u683C\u30B5\u30DE\u30EA\u3067\u884C\u3063\u3066\u304F\u3060\u3055\u3044"
        },
        "\u21C4 \u4EBA\u683C\u9023\u52D5"
      )), linked ? /* @__PURE__ */ React.createElement(
        "div",
        {
          className: "input",
          style: { display: "flex", alignItems: "center", justifyContent: "center", color: "var(--gold)", fontFamily: "var(--f-mono)", background: "var(--surface-inset)", borderStyle: "dashed" },
          title: "\u88C5\u5099\u4EBA\u683C\u306E\u73FE\u5728\u5024\uFF08\u9023\u52D5\uFF09"
        },
        linkedVal
      ) : /* @__PURE__ */ React.createElement("input", { className: "input", type: "number", placeholder: "\u521D\u671F", value: s.initial, onChange: (e) => patchDst(i, { initial: parseInt(e.target.value) || 0 }) }), linked ? /* @__PURE__ */ React.createElement(
        "div",
        {
          className: "input",
          style: { display: "flex", alignItems: "center", justifyContent: "center", color: "var(--tx-mute)", fontFamily: "var(--f-mono)", background: "var(--surface-inset)", borderStyle: "dashed" },
          title: "\u6700\u5927\u5024\u3082\u88C5\u5099\u4EBA\u683C\u306B\u9023\u52D5"
        },
        linkedVal
      ) : /* @__PURE__ */ React.createElement("input", { className: "input", type: "number", placeholder: "\u6700\u5927", value: s.max, onChange: (e) => patchDst(i, { max: parseInt(e.target.value) || 0 }) }), /* @__PURE__ */ React.createElement("button", { className: "btn-ghost btn-icon", onClick: () => rmDst(i), title: "\u524A\u9664", disabled: linked, style: linked ? { opacity: 0.3, cursor: "not-allowed" } : {} }, /* @__PURE__ */ React.createElement(Icon, { name: "trash", size: 12 })));
    })), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "var(--s-2)", marginTop: "var(--s-3)" } }, /* @__PURE__ */ React.createElement(Button, { size: "sm", icon: "plus", onClick: addDst }, "\u30C7\u30D5\u30A9\u30EB\u30C8\u30B9\u30C6\u30FC\u30BF\u30B9\u3092\u8FFD\u52A0"), /* @__PURE__ */ React.createElement(Button, { size: "sm", variant: "ghost", onClick: resetDst }, "\u521D\u671F\u72B6\u614B\u306B\u30EA\u30BB\u30C3\u30C8")))), /* @__PURE__ */ React.createElement(Card, null, /* @__PURE__ */ React.createElement("div", { className: "card-header" }, /* @__PURE__ */ React.createElement("span", { className: "t-label" }, "CUSTOM STATUS / \u30AB\u30B9\u30BF\u30E0\u30B9\u30C6\u30FC\u30BF\u30B9"), /* @__PURE__ */ React.createElement("div", { className: "grow" }), /* @__PURE__ */ React.createElement(Button, { size: "sm", variant: "ghost", icon: "plus", onClick: () => addCs("none") }, "\u51FA\u529B\u3057\u306A\u3044\u9805\u76EE"), /* @__PURE__ */ React.createElement(Button, { size: "sm", variant: "ghost", icon: "plus", onClick: () => addCs("params") }, "\u30E9\u30D9\u30EB\u5074\u3092\u8FFD\u52A0"), /* @__PURE__ */ React.createElement(Button, { size: "sm", icon: "plus", onClick: () => addCs("status") }, "ST\u5074\u3092\u8FFD\u52A0")), /* @__PURE__ */ React.createElement("div", { className: "card-body" }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-11)", color: "var(--tx-2)", marginBottom: "var(--s-3)", lineHeight: 1.5 } }, "\u56FA\u6709\u30D0\u30D5\u30FB\u84C4\u7A4D\u7CFB\u306A\u3069\u30AB\u30B9\u30BF\u30E0\u30B9\u30C6\u30FC\u30BF\u30B9\u3092\u8FFD\u52A0\u3002", /* @__PURE__ */ React.createElement("b", { style: { color: "var(--gold)" } }, "ST\u5074"), "=\u53EF\u5909\u30B9\u30C6\u30FC\u30BF\u30B9\uFF08\u5897\u6E1B\u3059\u308B\u6570\u5024\uFF09 / ", /* @__PURE__ */ React.createElement("b", { style: { color: "var(--gold)" } }, "\u30E9\u30D9\u30EB\u5074"), "=params\uFF08\u4EE3\u5165\u5F0F\u5C02\u7528\u306E\u5B9A\u6570\uFF09\u3002\u30E9\u30D9\u30EB/\u30C9\u30E9\u30C3\u30B0\u3067\u4E26\u3073\u66FF\u3048\u53EF\u80FD\u3002"), state.customStatuses.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "empty", style: { padding: "var(--s-3)" } }, "\u30AB\u30B9\u30BF\u30E0\u30B9\u30C6\u30FC\u30BF\u30B9\u306F\u3042\u308A\u307E\u305B\u3093") : /* @__PURE__ */ React.createElement("div", { className: "stack-3" }, [
      ["status", "ST\u5074 / \u6570\u5024\u30B9\u30C6\u30FC\u30BF\u30B9", "\u5897\u6E1B\u3059\u308B\u6570\u5024\u3068\u3057\u3066 JSON \u306E status \u306B\u51FA\u529B"],
      ["params", "\u30E9\u30D9\u30EB\u5074 / params", "\u8A2D\u5B9A\u5024\u30FB\u53C2\u7167\u30E9\u30D9\u30EB\u3068\u3057\u3066 JSON \u306E params(label) \u306B\u51FA\u529B"],
      ["none", "\u51FA\u529B\u3057\u306A\u3044 / \u30E1\u30E2\u30FB\u30D1\u30EC\u30C3\u30C8\u5C02\u7528", "JSON \u306B\u306F\u542B\u3081\u306A\u3044\uFF08memo\u30FB\u30C1\u30E3\u30C3\u30C8\u30D1\u30EC\u30C3\u30C8\u7B49\u306E\u30C6\u30AD\u30B9\u30C8\u7CFB\u306E\u307F\uFF09"]
    ].map(([place, placeLabel, placeHint]) => {
      const rows = state.customStatuses.map((c, i) => ({ c, i })).filter(({ c }) => (c.place || "status") === place);
      return /* @__PURE__ */ React.createElement("div", { key: place, style: { padding: "10px", background: "var(--surface-inset)", border: "1px solid var(--line-dim)", borderRadius: "var(--r)" } }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 8 } }, /* @__PURE__ */ React.createElement("span", { className: "t-label", style: { color: place === "status" ? "var(--gold)" : place === "params" ? "var(--tx-2)" : "var(--tx-mute)" } }, placeLabel), /* @__PURE__ */ React.createElement("span", { style: { fontSize: "var(--fs-10)", color: "var(--tx-mute)" } }, placeHint), /* @__PURE__ */ React.createElement("div", { style: { flex: 1 } }), /* @__PURE__ */ React.createElement(Button, { size: "sm", icon: "plus", onClick: () => addCs(place) }, "\u8FFD\u52A0")), rows.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "empty", style: { padding: "var(--s-2)" } }, "\u672A\u767B\u9332") : /* @__PURE__ */ React.createElement("div", { className: "stack-2" }, /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "22px 2fr 90px 80px 80px auto", gap: "var(--s-2)", alignItems: "center", padding: "0 var(--s-2)", fontSize: 9, color: "var(--tx-mute)", fontFamily: "var(--f-display)", letterSpacing: "0.14em", textTransform: "uppercase" } }, /* @__PURE__ */ React.createElement("span", null), /* @__PURE__ */ React.createElement("span", null, "\u30E9\u30D9\u30EB"), /* @__PURE__ */ React.createElement("span", null, "\u5E30\u5C5E"), /* @__PURE__ */ React.createElement("span", null, place === "status" ? "\u521D\u671F" : "\u5024"), /* @__PURE__ */ React.createElement("span", null, place === "status" ? "\u6700\u5927" : "\u4E88\u5099"), /* @__PURE__ */ React.createElement("span", null)), rows.map(({ c, i }) => /* @__PURE__ */ React.createElement(
        "div",
        {
          key: c.id,
          ...csDnd.rowProps(i),
          style: { display: "grid", gridTemplateColumns: "22px 2fr 90px 80px 80px auto", gap: "var(--s-2)", alignItems: "center", padding: "4px 6px", background: "var(--surface-1)", border: "1px solid var(--line-dim)", borderRadius: "var(--r-sm)" }
        },
        /* @__PURE__ */ React.createElement("span", { ...csDnd.handleProps(i), className: "dnd-handle", title: "\u30C9\u30E9\u30C3\u30B0\u3057\u3066\u4E26\u3073\u66FF\u3048" }, /* @__PURE__ */ React.createElement(Icon, { name: "drag", size: 12 })),
        /* @__PURE__ */ React.createElement("input", { className: "input", placeholder: place === "status" ? "\u30B9\u30C6\u30FC\u30BF\u30B9\u540D" : "\u30E9\u30D9\u30EB\u540D", value: c.label, onChange: (e) => patchCs(c.id, { label: e.target.value }) }),
        /* @__PURE__ */ React.createElement(
          "select",
          {
            className: "select",
            value: c.place || "status",
            onChange: (e) => patchCs(c.id, { place: e.target.value }),
            title: "ST\u5074=\u53EF\u5909\u30B9\u30C6\u30FC\u30BF\u30B9 / \u30E9\u30D9\u30EB\u5074=params(\u4EE3\u5165\u5F0F\u5C02\u7528)"
          },
          /* @__PURE__ */ React.createElement("option", { value: "status" }, "ST\u5074"),
          /* @__PURE__ */ React.createElement("option", { value: "params" }, "\u30E9\u30D9\u30EB\u5074"),
          /* @__PURE__ */ React.createElement("option", { value: "none" }, "\u51FA\u529B\u3057\u306A\u3044")
        ),
        /* @__PURE__ */ React.createElement("input", { className: "input", type: "number", placeholder: place === "status" ? "\u521D\u671F" : "\u5024", value: c.initial, onChange: (e) => patchCs(c.id, { initial: parseInt(e.target.value) || 0 }) }),
        /* @__PURE__ */ React.createElement("input", { className: "input", type: "number", placeholder: place === "status" ? "\u6700\u5927" : "\u4E88\u5099", value: c.max, onChange: (e) => patchCs(c.id, { max: parseInt(e.target.value) || 0 }) }),
        /* @__PURE__ */ React.createElement("button", { className: "btn-ghost btn-icon", onClick: () => rmCs(c.id), title: "\u524A\u9664" }, /* @__PURE__ */ React.createElement(Icon, { name: "trash", size: 12 }))
      ))));
    })))), /* @__PURE__ */ React.createElement(Card, null, /* @__PURE__ */ React.createElement("div", { className: "card-header" }, /* @__PURE__ */ React.createElement("span", { className: "t-label" }, "EXTRA COMMANDS / \u8FFD\u8A18\u30B3\u30DE\u30F3\u30C9")), /* @__PURE__ */ React.createElement("div", { className: "card-body" }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-11)", color: "var(--tx-2)", marginBottom: "var(--s-2)", lineHeight: 1.5 } }, "\u8FFD\u52A0\u30B3\u30DE\u30F3\u30C9\u3002", /* @__PURE__ */ React.createElement("b", { style: { color: "var(--gold)" } }, "\u547C\u5438\u30C1\u30A7\u30C3\u30AF\u7B49\u30AD\u30FC\u30EF\u30FC\u30C9\u7531\u6765\u306E\u30B3\u30DE\u30F3\u30C9\u306F\u81EA\u52D5\u8FFD\u8A18"), "\u3055\u308C\u307E\u3059\uFF08\u56FA\u6709\u30D0\u30D5\u30FB\u30AB\u30B9\u30BF\u30E0ST\u30FB\u4EBA\u683C\u30AD\u30FC\u30EF\u30FC\u30C9\u30FB\u52B9\u679C\u30C6\u30AD\u30B9\u30C8\u304B\u3089\u62BD\u51FA\uFF09\u3002\u624B\u52D5\u8A18\u8FF0\u306F\u81EA\u52D5\u5206\u306E\u5F8C\u6BB5\u306B\u51FA\u529B\u3002"), (() => {
      const KW_LABELS = { "\u6307\u4EE4": "\u6307\u4EE4\u306E\u52A0\u8B77" };
      const KW_CANDIDATES = ["\u547C\u5438", "\u632F\u52D5", "\u51FA\u8840", "\u7834\u88C2", "\u5145\u96FB", "\u6C88\u6F5C", "\u706B\u50B7", "\u9EBB\u75FA", "\u6050\u614C", "\u6BD2", "\u6307\u4EE4"];
      const kwSet = /* @__PURE__ */ new Set();
      (state.uniqueBuffs || []).forEach((b) => {
        const n = (b.name || "").trim();
        if (n && (b.place || "status") === "status") kwSet.add(n);
      });
      (state.customStatuses || []).forEach((c) => {
        const n = (c.label || "").trim();
        if (n && (c.place || "status") === "status") kwSet.add(n);
      });
      if (state.personaSrc && Array.isArray(state.personaSrc.keywords)) {
        state.personaSrc.keywords.forEach((k) => {
          const lbl = KW_LABELS[k] || k;
          if (KW_CANDIDATES.includes(k)) kwSet.add(lbl);
        });
      }
      const effectDump = [state.pas.always, state.pas.effect, state.pas2.effect, ...(state.skills || []).map((s) => (s.effect || "") + (s.dice || []).map((d) => d.effect).join(" ")), state.spiritAlways, state.spiritMorale, state.spiritConfuse, ...(state.supports || []).map((s) => s.effect), ...(state.enhancements || []).map((e) => e.effect || "")].join(" ");
      KW_CANDIDATES.forEach((k) => {
        const lbl = KW_LABELS[k] || k;
        if (effectDump.includes(k) || effectDump.includes(lbl)) kwSet.add(lbl);
      });
      const labels = [...kwSet].filter((l) => !l.endsWith("\u4FDD\u8B77"));
      if (labels.length === 0) {
        return /* @__PURE__ */ React.createElement("div", { style: { padding: "6px 10px", background: "var(--surface-inset)", border: "1px dashed var(--line-dim)", borderRadius: "var(--r-sm)", fontSize: "var(--fs-10)", color: "var(--tx-mute)", marginBottom: "var(--s-2)", lineHeight: 1.5, fontStyle: "italic" } }, "\u81EA\u52D5\u8FFD\u8A18\u5BFE\u8C61\u306A\u3057 \u2014 \u56FA\u6709\u30D0\u30D5\u3084\u30AB\u30B9\u30BF\u30E0ST\u3092\u8FFD\u52A0\u3059\u308B\u3068 ", /* @__PURE__ */ React.createElement("code", null, ":", "{", "\u30E9\u30D9\u30EB", "}", "+1"), "/", /* @__PURE__ */ React.createElement("code", null, "-1"), " \u304C\u81EA\u52D5\u751F\u6210\u3055\u308C\u307E\u3059");
      }
      return /* @__PURE__ */ React.createElement("div", { style: { padding: "6px 10px", background: "color-mix(in oklab, var(--ok) 6%, var(--surface-inset))", border: "1px dashed color-mix(in oklab, var(--ok) 35%, var(--line-dim))", borderRadius: "var(--r-sm)", fontSize: "var(--fs-10)", color: "var(--tx-2)", lineHeight: 1.6, marginBottom: "var(--s-2)" } }, /* @__PURE__ */ React.createElement("b", { style: { color: "var(--ok)" } }, "\u25B6 \u81EA\u52D5\u8FFD\u8A18\u4E2D\uFF08", labels.length, "\u4EF6\uFF09"), "\uFF1A", labels.map((l) => /* @__PURE__ */ React.createElement("span", { key: l, style: { padding: "1px 6px", margin: "0 3px 3px 0", background: "var(--surface-2)", border: "1px solid var(--line-dim)", borderRadius: 2, fontFamily: "var(--f-mono)", fontSize: 10, display: "inline-block" } }, ":", l, "\xB11")));
    })(), /* @__PURE__ */ React.createElement("textarea", { className: "textarea", rows: 4, placeholder: "\u81EA\u7531\u8A18\u8FF0\uFF08\u4F8B\uFF1A\u30AB\u30B9\u30BF\u30E0\u30B3\u30DE\u30F3\u30C9\u3084\u30E1\u30E2\uFF09\u2014 \u81EA\u52D5\u8FFD\u8A18\u306E\u5F8C\u6BB5\u306B\u51FA\u529B\u3055\u308C\u307E\u3059", value: state.extraCmd, onChange: (e) => setF("extraCmd", e.target.value) }))), /* @__PURE__ */ React.createElement(Card, { style: { borderColor: "color-mix(in oklab, var(--err) 30%, var(--line))" } }, /* @__PURE__ */ React.createElement("div", { className: "card-header", style: { color: "var(--err)" } }, /* @__PURE__ */ React.createElement("span", { className: "t-label", style: { color: "var(--err)" } }, "DANGER ZONE / \u5371\u967A\u64CD\u4F5C")), /* @__PURE__ */ React.createElement("div", { className: "card-body", style: { display: "flex", gap: "var(--s-2)", flexWrap: "wrap" } }, /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "btn btn-sm",
        style: { color: "var(--err)", borderColor: "color-mix(in oklab, var(--err) 40%, var(--line))" },
        onClick: () => {
          if (confirm("\u5168\u3066\u306E\u5165\u529B\u3092\u30AF\u30EA\u30A2\u3057\u307E\u3059\u304B\uFF1F\uFF08\u304A\u6C17\u306B\u5165\u308A\u30FB\u5C65\u6B74\u30FB\u6240\u6301\u30EA\u30B9\u30C8\u306F\u4FDD\u6301\uFF09")) {
            dispatch({ type: "RESET" });
            toast("\u5165\u529B\u3092\u30AF\u30EA\u30A2");
          }
        }
      },
      "\u5165\u529B\u3092\u5168\u3066\u30AF\u30EA\u30A2"
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "btn btn-sm",
        style: { color: "var(--err)", borderColor: "color-mix(in oklab, var(--err) 40%, var(--line))" },
        onClick: () => {
          if (confirm("LocalStorage\u306E\u4FDD\u5B58\u5185\u5BB9\u3082\u542B\u3081\u3066\u3059\u3079\u3066\u524A\u9664\u3057\u307E\u3059\u304B\uFF1F\u3053\u306E\u64CD\u4F5C\u306F\u53D6\u308A\u6D88\u305B\u307E\u305B\u3093\u3002")) {
            localStorage.removeItem("lbt_v46_state");
            location.reload();
          }
        }
      },
      "\u4FDD\u5B58\u30C7\u30FC\u30BF\u3092\u5B8C\u5168\u524A\u9664"
    ))));
  };
  Object.assign(window, {
    BaseSection,
    PassiveSection,
    SupportSection,
    EgoSection,
    SpiritSection,
    EnhancementSection,
    RosterSection,
    SettingsSection,
    UniqueBuffsBlock
    // v52 (F): PersonaCodex 末尾で使う
  });
})();
