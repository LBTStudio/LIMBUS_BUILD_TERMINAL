(() => {
  const SECTIONS = [
    { id: "persona", label: "\u4EBA\u683C", icon: "persona", title: "PERSONA CODEX", subtitle: "\u88C5\u5099\u3059\u308B\u4EBA\u683C\u3092\u9078\u629E", num: "01" },
    { id: "skill", label: "\u30B9\u30AD\u30EB", icon: "skill", title: "TACTICAL SKILLS", subtitle: "\u6226\u8853\u30B9\u30AD\u30EB 0\u301C4 \u306E\u7DE8\u96C6", num: "02" },
    { id: "passive", label: "\u30D1\u30C3\u30B7\u30D6", icon: "passive", title: "PASSIVE / \u4EBA\u683C\u30D1\u30C3\u30B7\u30D6", subtitle: "\u4EBA\u683C\u30D1\u30C3\u30B7\u30D6\uFF08\u56FA\u6709\u30D0\u30D5\u306F\u300C\u4EBA\u683C\u300D\u30DA\u30FC\u30B8\u306B\u79FB\u52D5\uFF09", num: "03" },
    { id: "support", label: "\u30B5\u30DD\u30FC\u30C8", icon: "support", title: "SUPPORT PASSIVES", subtitle: "\u88C5\u50992\u301C3\u67A0", num: "04" },
    { id: "ego", label: "E.G.O", icon: "ego", title: "E.G.O EQUIPMENT", subtitle: "ZAYIN / TETH / HE / WAW / ALEPH", num: "05" },
    { id: "spirit", label: "\u7CBE\u795E", icon: "spirit", title: "SPIRIT", subtitle: "\u6DF7\u4E71\u6642\u306E\u6319\u52D5", num: "06" },
    { id: "enh", label: "\u5F37\u5316", icon: "enh", title: "ENHANCEMENTS", subtitle: "\u8EAB\u4F53\u5F37\u5316\u30FB\u7279\u6B8A\u5F37\u5316", num: "07" },
    { id: "roster", label: "\u6240\u6301", icon: "roster", title: "PERSONA ROSTER", subtitle: "\u6240\u6301\u4EBA\u683C + \u540C\u671F\u5316\u30E9\u30F3\u30AF\u7BA1\u7406", num: "08" },
    { id: "settings", label: "\u8A2D\u5B9A", icon: "settings", title: "PARAMETERS", subtitle: "\u4EE3\u5165\u5F0F\u30FB\u30AB\u30B9\u30BF\u30E0", num: "09" }
  ];
  function isComplete(section, s) {
    switch (section) {
      case "persona":
        return !!s.personaSrc;
      case "skill":
        return s.skills.length > 0 && s.skills.every((sk) => sk.name);
      case "passive":
        return !!s.pas.name;
      case "support":
        return s.supports.length > 0;
      case "ego":
        return Object.values(s.egoSlots).some((v) => v);
      case "spirit":
        return !!s.spirit;
      case "enh":
        return true;
      // optional
      case "roster":
        return true;
      // auto
      case "settings":
        return true;
      // optional
      default:
        return false;
    }
  }
  const CommandPalette = ({ open, onClose, state, dispatch }) => {
    const [q, setQ] = React.useState("");
    const [idx, setIdx] = React.useState(0);
    const inputRef = React.useRef(null);
    React.useEffect(() => {
      if (open) setTimeout(() => inputRef.current?.focus(), 20);
      else {
        setQ("");
        setIdx(0);
      }
    }, [open]);
    const items = React.useMemo(() => {
      const ql = q.trim().toLowerCase();
      const cmds = [
        ...SECTIONS.map((s) => ({ type: "nav", label: `${s.label} \u30BB\u30AF\u30B7\u30E7\u30F3\u3078\u79FB\u52D5`, kbd: s.num, run: () => dispatch({ type: "SET_UI", ui: { currentSection: s.id } }) })),
        { type: "act", label: "JSON\u3092\u30B3\u30D4\u30FC", kbd: "JSON", run: async () => {
          try {
            await navigator.clipboard.writeText(JSON.stringify(LBT_gen.buildCcfoliaJSON(state)));
            toast("JSON\u3092\u30B3\u30D4\u30FC");
          } catch (e) {
          }
        } },
        { type: "act", label: "\u72B6\u614B\u3092\u30A8\u30AF\u30B9\u30DD\u30FC\u30C8", kbd: "", run: () => exportState(state) },
        { type: "act", label: "\u3059\u3079\u3066\u30AF\u30EA\u30A2", kbd: "", run: () => {
          if (confirm("\u5165\u529B\u5185\u5BB9\u3092\u3059\u3079\u3066\u30AF\u30EA\u30A2\u3057\u307E\u3059\u304B\uFF1F")) {
            dispatch({ type: "RESET" });
            toast("\u30AF\u30EA\u30A2\u3057\u307E\u3057\u305F");
          }
        } }
      ];
      const personaHits = [];
      if (ql) {
        const all = [...DB.normal_personas.map((p) => ({ p, m: "n" })), ...DB.tokui_personas.map((p) => ({ p, m: "t" }))];
        all.forEach(({ p, m }) => {
          if ((p.name + " " + p.no).toLowerCase().includes(ql)) {
            personaHits.push({ type: "persona", label: `\u4EBA\u683C\uFF1A${p.name}`, kbd: m === "n" ? "\u901A\u5E38" : "\u7279\u7570", run: () => {
              dispatch({ type: "EQUIP_PERSONA", mode: m, no: p.no, src: p });
              dispatch({ type: "SET_UI", ui: { currentSection: "persona" } });
              toast(`\u300E${p.name}\u300F\u3092\u88C5\u5099`);
            } });
          }
        });
      }
      const cmdFiltered = ql ? cmds.filter((c) => c.label.toLowerCase().includes(ql)) : cmds;
      return [...cmdFiltered, ...personaHits.slice(0, 8)];
    }, [q, state]);
    React.useEffect(() => setIdx(0), [q]);
    const onKey = (e) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setIdx((i) => Math.min(i + 1, items.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        items[idx]?.run();
        onClose();
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    return /* @__PURE__ */ React.createElement("div", { className: `cp-overlay${open ? " is-open" : ""}`, onClick: (e) => e.target === e.currentTarget && onClose() }, /* @__PURE__ */ React.createElement("div", { className: "cp-box" }, /* @__PURE__ */ React.createElement("input", { ref: inputRef, className: "cp-input", placeholder: "\u30AF\u30A4\u30C3\u30AF\u691C\u7D22\uFF1A\u4EBA\u683C\u30FB\u64CD\u4F5C\u30FB\u30BB\u30AF\u30B7\u30E7\u30F3\u2026", value: q, onChange: (e) => setQ(e.target.value), onKeyDown: onKey }), /* @__PURE__ */ React.createElement("div", { className: "cp-list" }, items.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "cp-empty" }, "\u8A72\u5F53\u306A\u3057") : items.map((it, i) => /* @__PURE__ */ React.createElement("div", { key: i, className: `cp-item${i === idx ? " sel" : ""}`, onClick: () => {
      it.run();
      onClose();
    }, onMouseMove: () => setIdx(i) }, /* @__PURE__ */ React.createElement("span", { className: "kind" }, it.type === "nav" ? "\u25B8" : it.type === "persona" ? "\u25C8" : "\u2318"), /* @__PURE__ */ React.createElement("span", { className: "lbl" }, it.label), it.kbd && /* @__PURE__ */ React.createElement("span", { className: "kbd" }, it.kbd)))), /* @__PURE__ */ React.createElement("div", { className: "cp-hint" }, /* @__PURE__ */ React.createElement("span", null, "\u2191\u2193 \u79FB\u52D5"), /* @__PURE__ */ React.createElement("span", null, "Enter \u5B9F\u884C"), /* @__PURE__ */ React.createElement("span", null, "Esc \u9589\u3058\u308B"))));
  };
  function exportState(state) {
    const { ui, ...data } = state;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${state.charName || "character"}_lbt.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1e3);
    toast("\u72B6\u614B\u3092\u30A8\u30AF\u30B9\u30DD\u30FC\u30C8");
  }
  function importStateFromFile(file, dispatch) {
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const data = JSON.parse(rd.result);
        dispatch({ type: "HYDRATE", state: data });
        toast("\u72B6\u614B\u3092\u30A4\u30F3\u30DD\u30FC\u30C8");
      } catch (e) {
        toast("\u30A4\u30F3\u30DD\u30FC\u30C8\u5931\u6557");
      }
    };
    rd.readAsText(file);
  }
  const App = () => {
    const [state, dispatch, { undo, redo, canUndo, canRedo }] = useAppState();
    const [cpOpen, setCpOpen] = React.useState(false);
    const [qiOpen, setQiOpen] = React.useState(false);
    const fileRef = React.useRef(null);
    React.useEffect(() => {
      const onKey = (e) => {
        const isCtrl = e.ctrlKey || e.metaKey;
        if (isCtrl && e.key === "k") {
          e.preventDefault();
          setCpOpen((o) => !o);
        } else if (isCtrl && !e.shiftKey && e.key === "z") {
          e.preventDefault();
          undo();
        } else if (isCtrl && (e.shiftKey && e.key === "Z" || e.key === "y")) {
          e.preventDefault();
          redo();
        }
      };
      window.addEventListener("keydown", onKey);
      return () => window.removeEventListener("keydown", onKey);
    }, [undo, redo]);
    const current = state.ui.currentSection || "persona";
    const sec = SECTIONS.find((s) => s.id === current) || SECTIONS[0];
    const renderSection = () => {
      switch (current) {
        case "persona":
          return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(SectionTitle, { num: sec.num, title: sec.title, subtitle: sec.subtitle }), /* @__PURE__ */ React.createElement(PersonaCodex, { state, dispatch }), state.personaSrc && /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { style: { marginTop: "var(--s-6)" } }, /* @__PURE__ */ React.createElement("div", { className: "rule" }, /* @__PURE__ */ React.createElement("span", { className: "rule-l" }, "Base Info"))), /* @__PURE__ */ React.createElement("div", { style: { marginTop: "var(--s-4)" } }, /* @__PURE__ */ React.createElement(BaseSection, { state, dispatch }))));
        case "skill":
          return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(SectionTitle, { num: sec.num, title: sec.title, subtitle: sec.subtitle }), /* @__PURE__ */ React.createElement(SkillDeck, { state, dispatch }));
        case "passive":
          return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(SectionTitle, { num: sec.num, title: sec.title, subtitle: sec.subtitle }), /* @__PURE__ */ React.createElement(PassiveSection, { state, dispatch }));
        case "support":
          return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(SectionTitle, { num: sec.num, title: sec.title, subtitle: sec.subtitle }), /* @__PURE__ */ React.createElement(SupportSection, { state, dispatch }));
        case "ego":
          return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(SectionTitle, { num: sec.num, title: sec.title, subtitle: sec.subtitle }), /* @__PURE__ */ React.createElement(EgoSection, { state, dispatch }));
        case "spirit":
          return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(SectionTitle, { num: sec.num, title: sec.title, subtitle: sec.subtitle }), /* @__PURE__ */ React.createElement(SpiritSection, { state, dispatch }));
        case "enh":
          return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(SectionTitle, { num: sec.num, title: sec.title, subtitle: sec.subtitle }), /* @__PURE__ */ React.createElement(EnhancementSection, { state, dispatch }));
        case "roster":
          return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(SectionTitle, { num: sec.num, title: sec.title, subtitle: sec.subtitle }), /* @__PURE__ */ React.createElement(RosterSection, { state, dispatch }));
        case "settings":
          return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(SectionTitle, { num: sec.num, title: sec.title, subtitle: sec.subtitle }), /* @__PURE__ */ React.createElement(SettingsSection, { state, dispatch }));
        default:
          return null;
      }
    };
    const togglePreview = () => dispatch({ type: "SET_UI", ui: { previewOpen: !state.ui.previewOpen } });
    const previewOpen = state.ui.previewOpen !== false;
    return /* @__PURE__ */ React.createElement("div", { className: `app${!previewOpen ? " preview-collapsed" : ""}` }, /* @__PURE__ */ React.createElement("header", { className: "topbar" }, /* @__PURE__ */ React.createElement("div", { className: "brand" }, /* @__PURE__ */ React.createElement("span", { className: "brand-mark" }, "\u25C8"), /* @__PURE__ */ React.createElement("span", { className: "brand-name" }, "LIMBUS BUILD TERMINAL"), /* @__PURE__ */ React.createElement("span", { className: "brand-sub" }, "CCFOLIA CHARACTER BUILDER ", /* @__PURE__ */ React.createElement("span", { className: "brand-ver" }, window.LBT_VERSION || "v51"))), /* @__PURE__ */ React.createElement("div", { className: "brand-author", title: "\u4F5C\u8005\uFF1A\u3057\u3083\u3051", "aria-label": "\u4F5C\u8005\uFF1A\u3057\u3083\u3051" }, /* @__PURE__ */ React.createElement(Icon, { name: "salmon", size: 20 })), /* @__PURE__ */ React.createElement("div", { className: "topbar-spacer" }), /* @__PURE__ */ React.createElement("button", { className: "topbar-search", onClick: () => setCpOpen(true) }, /* @__PURE__ */ React.createElement(Icon, { name: "search", size: 14 }), /* @__PURE__ */ React.createElement("span", { className: "topbar-search-text" }, "\u30AF\u30A4\u30C3\u30AF\u691C\u7D22"), /* @__PURE__ */ React.createElement("kbd", null, "\u2318K")), /* @__PURE__ */ React.createElement("div", { className: "topbar-actions" }, /* @__PURE__ */ React.createElement(Button, { variant: "ghost", size: "sm", icon: "undo", onClick: undo, disabled: !canUndo, title: "\u5143\u306B\u623B\u3059 (Ctrl+Z)" }), /* @__PURE__ */ React.createElement(Button, { variant: "ghost", size: "sm", icon: "redo", onClick: redo, disabled: !canRedo, title: "\u3084\u308A\u76F4\u3057 (Ctrl+Shift+Z)" }), /* @__PURE__ */ React.createElement(Button, { variant: "ghost", size: "sm", icon: "download", onClick: () => exportState(state), title: "\u72B6\u614B\u3092\u30A8\u30AF\u30B9\u30DD\u30FC\u30C8" }), /* @__PURE__ */ React.createElement(Button, { variant: "ghost", size: "sm", icon: "upload", onClick: () => fileRef.current.click(), title: "\u72B6\u614B\u3092\u30A4\u30F3\u30DD\u30FC\u30C8" }), /* @__PURE__ */ React.createElement("input", { type: "file", ref: fileRef, accept: "application/json", style: { display: "none" }, onChange: (e) => {
      const f = e.target.files?.[0];
      if (f) importStateFromFile(f, dispatch);
      e.target.value = "";
    } }), /* @__PURE__ */ React.createElement(Button, { variant: "ghost", size: "sm", icon: "eye", onClick: togglePreview, title: "\u30D7\u30EC\u30D3\u30E5\u30FC\u5207\u66FF" }), /* @__PURE__ */ React.createElement(Button, { variant: "ghost", size: "sm", icon: "share", onClick: () => LBT_gen.openShareSheet(state), title: "\u5171\u6709\u30B7\u30FC\u30C8\uFF08\u6574\u5F62HTML\uFF09\u3092\u65B0\u898F\u30BF\u30D6\u3067\u30D7\u30EC\u30D3\u30E5\u30FC" }), /* @__PURE__ */ React.createElement(Button, { variant: "primary", size: "sm", icon: "copy", onClick: async () => {
      try {
        await navigator.clipboard.writeText(JSON.stringify(LBT_gen.buildCcfoliaJSON(state)));
        toast("JSON\u3092\u30B3\u30D4\u30FC");
      } catch (e) {
      }
    } }, "JSON\u51FA\u529B"))), /* @__PURE__ */ React.createElement("nav", { className: "rail" }, SECTIONS.map((s) => {
      const done = isComplete(s.id, state);
      const isReq = ["persona", "skill", "passive"].includes(s.id);
      const showDot = isReq || done;
      return /* @__PURE__ */ React.createElement(
        "div",
        {
          key: s.id,
          className: `rail-item${current === s.id ? " is-active" : ""}`,
          onClick: () => dispatch({ type: "SET_UI", ui: { currentSection: s.id } }),
          role: "button",
          tabIndex: 0,
          onKeyDown: (e) => e.key === "Enter" && dispatch({ type: "SET_UI", ui: { currentSection: s.id } }),
          title: s.label
        },
        /* @__PURE__ */ React.createElement("span", { className: "rail-icon" }, /* @__PURE__ */ React.createElement(Icon, { name: s.icon, size: 18 })),
        /* @__PURE__ */ React.createElement("span", { className: "rail-label" }, s.label),
        isReq && !done && /* @__PURE__ */ React.createElement("span", { className: "dot is-warn" }),
        done && /* @__PURE__ */ React.createElement("span", { className: "dot" })
      );
    })), /* @__PURE__ */ React.createElement("main", { className: "focus" }, /* @__PURE__ */ React.createElement("div", { className: "focus-inner" }, renderSection())), /* @__PURE__ */ React.createElement(LivePreview, { state, dispatch }), !previewOpen && /* @__PURE__ */ React.createElement("button", { className: "preview-reopen", onClick: togglePreview, title: "\u30D7\u30EC\u30D3\u30E5\u30FC\u3092\u958B\u304F" }, "PREVIEW \u25C8"), /* @__PURE__ */ React.createElement(CommandPalette, { open: cpOpen, onClose: () => setCpOpen(false), state, dispatch }), /* @__PURE__ */ React.createElement(QualityInspector, { open: qiOpen, onClose: () => setQiOpen(false) }));
  };
  window.App = App;
})();
