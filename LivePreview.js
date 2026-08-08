(() => {
  function splitPreviewSections(text) {
    if (!text) return [];
    const lines = text.split("\n");
    const sections = [];
    let cur = null;
    const SEP_RE = /^ー{5,}$/;
    const HEAD_RE = /^###\s*■?\s*(.+?)\s*$/;
    for (const raw of lines) {
      if (SEP_RE.test(raw.trim())) continue;
      const m = raw.match(HEAD_RE);
      if (m) {
        if (cur) sections.push(cur);
        cur = { title: m[1], body: [] };
        continue;
      }
      if (!cur) {
        cur = { title: "", body: [] };
      }
      cur.body.push(raw);
    }
    if (cur) sections.push(cur);
    return sections.filter((s) => s.title || s.body.some((l) => l.trim()));
  }
  const PreviewSection = ({ section, idx, collapsed, onToggle }) => {
    const bodyText = section.body.join("\n").replace(/^\n+|\n+$/g, "");
    const isEmpty = !bodyText.trim();
    return /* @__PURE__ */ React.createElement("div", { className: `pv-sec${collapsed ? " is-collapsed" : ""}${isEmpty ? " is-empty" : ""}` }, section.title ? /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "pv-sec-head",
        onClick: onToggle,
        title: collapsed ? "\u5C55\u958B" : "\u6298\u308A\u7573\u3080",
        type: "button"
      },
      /* @__PURE__ */ React.createElement("span", { className: "pv-sec-caret" }, collapsed ? "\u25B6" : "\u25BC"),
      /* @__PURE__ */ React.createElement("span", { className: "pv-sec-title" }, section.title)
    ) : null, !collapsed && !isEmpty && /* @__PURE__ */ React.createElement("div", { className: "pv-sec-body" }, bodyText));
  };
  const LivePreview = ({ state, dispatch }) => {
    const tab = state.ui.previewTab || "memo";
    const setTab = (t) => dispatch({ type: "SET_UI", ui: { previewTab: t } });
    const memo = React.useMemo(() => LBT_gen.buildMemo(state), [state]);
    const palette = React.useMemo(() => LBT_gen.buildPalette(state), [state]);
    const json = React.useMemo(() => JSON.stringify(LBT_gen.buildCcfoliaJSON(state), null, 2), [state]);
    const memoSections = React.useMemo(() => splitPreviewSections(memo), [memo]);
    const paletteSections = React.useMemo(() => splitPreviewSections(palette), [palette]);
    const collapsedMap = state.ui.previewCollapsed || {};
    const toggleSec = (key) => {
      const next = { ...collapsedMap, [key]: !collapsedMap[key] };
      dispatch({ type: "SET_UI", ui: { previewCollapsed: next } });
    };
    const setAllCollapsed = (secs, prefix, value) => {
      const next = { ...collapsedMap };
      secs.forEach((s, i) => {
        next[`${prefix}:${i}`] = value;
      });
      dispatch({ type: "SET_UI", ui: { previewCollapsed: next } });
    };
    const copyJson = async () => {
      try {
        await navigator.clipboard.writeText(JSON.stringify(LBT_gen.buildCcfoliaJSON(state)));
        toast("JSON\u3092\u30AF\u30EA\u30C3\u30D7\u30DC\u30FC\u30C9\u306B\u30B3\u30D4\u30FC");
      } catch (e) {
        toast("\u30B3\u30D4\u30FC\u5931\u6557");
      }
    };
    const copyCurrent = async () => {
      const t = tab === "memo" ? memo : tab === "palette" ? palette : JSON.stringify(LBT_gen.buildCcfoliaJSON(state));
      try {
        await navigator.clipboard.writeText(t);
        toast(`${tab.toUpperCase()}\u3092\u30B3\u30D4\u30FC`);
      } catch (e) {
        toast("\u30B3\u30D4\u30FC\u5931\u6557");
      }
    };
    const closePreview = () => dispatch({ type: "SET_UI", ui: { previewOpen: false } });
    const renderSectioned = (sections, prefix) => /* @__PURE__ */ React.createElement("div", { className: "pv-sec-list" }, /* @__PURE__ */ React.createElement("div", { className: "pv-sec-toolbar" }, /* @__PURE__ */ React.createElement("button", { className: "pv-sec-tbtn", onClick: () => setAllCollapsed(sections, prefix, false), title: "\u5168\u5C55\u958B" }, "\u5168\u5C55\u958B"), /* @__PURE__ */ React.createElement("button", { className: "pv-sec-tbtn", onClick: () => setAllCollapsed(sections, prefix, true), title: "\u5168\u6298\u308A\u7573\u307F" }, "\u5168\u6298\u7573")), sections.map((s, i) => /* @__PURE__ */ React.createElement(
      PreviewSection,
      {
        key: `${prefix}:${i}`,
        section: s,
        idx: i,
        collapsed: !!collapsedMap[`${prefix}:${i}`],
        onToggle: () => toggleSec(`${prefix}:${i}`)
      }
    )));
    return /* @__PURE__ */ React.createElement("aside", { className: `preview${state.ui.previewOpen ? " is-open" : ""}` }, /* @__PURE__ */ React.createElement("button", { className: "preview-close", onClick: closePreview, title: "\u30D7\u30EC\u30D3\u30E5\u30FC\u3092\u683C\u7D0D" }, /* @__PURE__ */ React.createElement(Icon, { name: "x", size: 14 })), /* @__PURE__ */ React.createElement("div", { className: "preview-tabs" }, /* @__PURE__ */ React.createElement("button", { className: `preview-tab${tab === "memo" ? " is-active" : ""}`, onClick: () => setTab("memo") }, "MEMO"), /* @__PURE__ */ React.createElement("button", { className: `preview-tab${tab === "palette" ? " is-active" : ""}`, onClick: () => setTab("palette") }, "PALETTE"), /* @__PURE__ */ React.createElement("button", { className: `preview-tab${tab === "json" ? " is-active" : ""}`, onClick: () => setTab("json") }, "JSON")), /* @__PURE__ */ React.createElement("div", { className: "preview-body" }, tab === "memo" && renderSectioned(memoSections, "memo"), tab === "palette" && renderSectioned(paletteSections, "palette"), tab === "json" && /* @__PURE__ */ React.createElement("div", { style: { whiteSpace: "pre-wrap" } }, json)), /* @__PURE__ */ React.createElement("div", { className: "preview-hint" }, tab === "memo" && "\u8AAD\u307F\u7269\u5F62\u5F0F\u306E\u30B7\u30FC\u30C8\u8981\u7D04 \u2014 \u30BB\u30C3\u30B7\u30E7\u30F3\u4E2D\u306E\u5373\u6642\u53C2\u7167\u306B\u3002\u5404\u898B\u51FA\u3057\u3092\u30AF\u30EA\u30C3\u30AF\u3067\u6298\u308A\u7573\u307F", tab === "palette" && "ccfolia \u30C1\u30E3\u30C3\u30C8\u30D1\u30EC\u30C3\u30C8\u5F62\u5F0F \u2014 \u300C\u30D1\u30EC\u30C3\u30C8\u300D\u6B04\u3078\u8CBC\u4ED8\u3002\u6298\u308A\u7573\u3093\u3067\u3082\u30B3\u30D4\u30FC\u306F\u5168\u4F53\u304C\u5BFE\u8C61", tab === "json" && "ccfolia \u30AD\u30E3\u30E9\u30AF\u30BF\u30FCJSON \u2014 \u300C\u30AF\u30EA\u30C3\u30D7\u30DC\u30FC\u30C9\u304B\u3089\u8FFD\u52A0\u300D\u3067\u8CBC\u4ED8"), /* @__PURE__ */ React.createElement("div", { className: "preview-actions" }, /* @__PURE__ */ React.createElement(Button, { size: "sm", icon: "copy", onClick: copyCurrent, className: "grow" }, "\u73FE\u5728\u306E\u30BF\u30D6\u3092\u30B3\u30D4\u30FC"), /* @__PURE__ */ React.createElement(Button, { size: "sm", variant: "primary", icon: "check", onClick: copyJson }, "JSON")));
  };
  window.LivePreview = LivePreview;
})();
