function splitPreviewSections(text) {
  if (!text) return [];
  const lines = text.split("\n");
  const sections = [];
  let cur = null;
  const SEP_RE = /^ー{5,}$/;
  const HEAD_RE = /^(?:###\s*■?\s*(.+?)\s*$|【(.+?)】\s*$|■\s*(.+?)\s*$)/;
  for (const raw of lines) {
    if (SEP_RE.test(raw.trim())) continue;
    const m = raw.match(HEAD_RE);
    if (m) {
      if (cur) sections.push(cur);
      cur = { title: m[1] || m[2] || m[3] || "", header: raw, body: [] };
      continue;
    }
    if (!cur) {
      cur = { title: "", header: "", body: [] };
    }
    cur.body.push(raw);
  }
  if (cur) sections.push(cur);
  return sections.filter((s) => s.title || s.body.some((l) => l.trim()));
}
// プレビューに表示する原文の見出し表記を保ったまま、JSON出力から除外されたカテゴリだけを
// コピー対象から取り除く。表示の折り畳み状態はコピー内容へ影響させない。
function filterPreviewCopyOutput(text, excluded) {
  return splitPreviewSections(text)
    .filter((section) => !section.title || !(excluded || {})[section.title])
    .map((section) => {
      const body = section.body.join("\n").replace(/^\n+|\n+$/g, "");
      return [section.title ? section.header || `■ ${section.title}` : "", body].filter(Boolean).join("\n");
    })
    .filter(Boolean)
    .join("\n\n");
}
window.LBT_filterPreviewCopyOutput = filterPreviewCopyOutput;
// 生成順を標準順としつつ、ユーザーが保存した見出し順だけを優先する。
// 新規カテゴリは保存済みの手動順に含まれないため、標準順の末尾に追加される。
function orderPreviewSections(sections, order) {
  const source = Array.isArray(sections) ? sections : [];
  if (!Array.isArray(order) || !order.length) return source;
  const byTitle = new Map(source.map((section) => [section.title, section]));
  const used = new Set();
  const head = [];
  order.forEach((title) => {
    if (byTitle.has(title) && !used.has(title)) {
      head.push(byTitle.get(title));
      used.add(title);
    }
  });
  return head.concat(source.filter((section) => !used.has(section.title)));
}
window.LBT_orderPreviewSections = orderPreviewSections;
const PreviewSection = ({ section, idx, collapsed, onToggle, included, onToggleInclude, dragHandleProps, dragRowProps, canMoveUp, canMoveDown, onMoveUp, onMoveDown }) => {
  const bodyText = section.body.join("\n").replace(/^\n+|\n+$/g, "");
  const isEmpty = !bodyText.trim();
  const rowProps = dragRowProps || {};
  return /* @__PURE__ */ React.createElement("div", { className: `pv-sec${collapsed ? " is-collapsed" : ""}${isEmpty ? " is-empty" : ""}${included === false ? " is-excluded" : ""} ${rowProps.className || ""}`.trim(), "data-drop": rowProps["data-drop"], onDragOver: rowProps.onDragOver, onDragLeave: rowProps.onDragLeave, onDrop: rowProps.onDrop }, section.title ? /* @__PURE__ */ React.createElement(
    "div",
    { className: "pv-sec-head", style: { display: "flex", alignItems: "center", gap: 6 } },
    dragHandleProps ? /* @__PURE__ */ React.createElement("div", { className: "pv-sec-reorder", "aria-label": "カテゴリの並べ替え" }, /* @__PURE__ */ React.createElement("span", { ...dragHandleProps, className: "pv-sec-drag", style: { ...(dragHandleProps.style || {}) }, title: "長押ししてドラッグで並べ替え" }, "\u22EE\u22EE"), /* @__PURE__ */ React.createElement("button", { type: "button", className: "pv-sec-move", disabled: !canMoveUp, onClick: (e) => { e.stopPropagation(); onMoveUp && onMoveUp(); }, title: "このカテゴリを上へ移動", "aria-label": "このカテゴリを上へ移動" }, "\u2191"), /* @__PURE__ */ React.createElement("button", { type: "button", className: "pv-sec-move", disabled: !canMoveDown, onClick: (e) => { e.stopPropagation(); onMoveDown && onMoveDown(); }, title: "このカテゴリを下へ移動", "aria-label": "このカテゴリを下へ移動" }, "\u2193")) : null,
    /* @__PURE__ */ React.createElement("input", {
      type: "checkbox",
      checked: included !== false,
      onChange: (e) => { e.stopPropagation(); onToggleInclude && onToggleInclude(); },
      onClick: (e) => e.stopPropagation(),
      title: "OFF\u306B\u3059\u308B\u3068JSON\u51FA\u529B\u304B\u3089\u9664\u5916\u3057\u307E\u3059\uFF08\u8868\u793A\u306F\u6B8B\u308A\u307E\u3059\uFF09",
      style: { accentColor: "var(--gold)", flex: "none" }
    }),
    /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "pv-sec-head",
        onClick: onToggle,
        title: collapsed ? "\u5C55\u958B" : "\u6298\u308A\u7573\u3080",
        type: "button",
        style: { flex: 1, display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", padding: 0, cursor: "pointer", color: "inherit", textAlign: "left" }
      },
      /* @__PURE__ */ React.createElement("span", { className: "pv-sec-caret" }, collapsed ? "\u25B6" : "\u25BC"),
      /* @__PURE__ */ React.createElement("span", { className: "pv-sec-title" }, section.title),
      included === false && /* @__PURE__ */ React.createElement("span", { style: { marginLeft: "auto", fontSize: 9, color: "var(--warn)", fontFamily: "var(--f-display)", letterSpacing: "0.12em" } }, "JSON\u304B\u3089\u9664\u5916")
    )
  ) : null, !collapsed && !isEmpty && /* @__PURE__ */ React.createElement("div", { className: "pv-sec-body" }, bodyText));
};
const LivePreview = ({ state, dispatch }) => {
  const tab = state.ui.previewTab || "memo";
  const setTab = (t) => dispatch({ type: "SET_UI", ui: { previewTab: t } });
  // UI操作（プレビューの開閉・タブ切替）では出力対象のデータ参照を維持する。
  // これにより、重いMEMO/PALETTE/JSONの再生成を待たずに開閉アニメーションを開始できる。
  const previewDataRef = React.useRef(state);
  const previousPreviewData = previewDataRef.current;
  const previewDataChanged = Object.keys(state).some((key) => key !== "ui" && state[key] !== previousPreviewData[key]);
  if (previewDataChanged) previewDataRef.current = state;
  const previewData = previewDataRef.current;
  const memo = React.useMemo(() => LBT_gen.buildMemo(previewData), [previewData]);
  const palette = React.useMemo(() => LBT_gen.buildPalette(previewData), [previewData]);
  const json = React.useMemo(() => JSON.stringify(LBT_gen.buildCcfoliaJSON(previewData), null, 2), [previewData]);
  const readiness = window.LBT_getSessionReadiness?.(state) || [];
  const readinessKey = readiness.map((entry) => entry.id).join(",");
  const readinessLabel = readiness.map((entry) => entry.label).join("・");
  const memoSections = React.useMemo(() => splitPreviewSections(memo), [memo]);
  const paletteSections = React.useMemo(() => splitPreviewSections(palette), [palette]);
  const collapsedMap = state.ui.previewCollapsed || {};
  const outputExclude = state.outputExclude || { memo: {}, palette: {} };
  // V17: タブごとの DnD を最上位で初期化（Rules of Hooks 準拠。条件付き呼出内で hook を呼ばない）
  const memoDnd = useDragReorder({ onReorder: (from, to) => applySectionOrderRef.current("memo", memoSections, from, to) });
  const paletteDnd = useDragReorder({ onReorder: (from, to) => applySectionOrderRef.current("palette", paletteSections, from, to) });
  const toggleInclude = (prefix, title) => {
    if (!title) return;
    const next = { memo: { ...(outputExclude.memo || {}) }, palette: { ...(outputExclude.palette || {}) } };
    const bucket = next[prefix] || (next[prefix] = {});
    if (bucket[title]) delete bucket[title];
    else bucket[title] = true;
    dispatch({ type: "SET_FIELD", field: "outputExclude", value: next });
  };
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
    const t = tab === "memo"
      ? filterPreviewCopyOutput(memo, outputExclude.memo)
      : tab === "palette"
        ? filterPreviewCopyOutput(palette, outputExclude.palette)
        : JSON.stringify(LBT_gen.buildCcfoliaJSON(state));
    try {
      await navigator.clipboard.writeText(t);
      toast(`${tab.toUpperCase()}\u3092\u30B3\u30D4\u30FC`);
    } catch (e) {
      toast("\u30B3\u30D4\u30FC\u5931\u6557");
    }
  };
  const closePreview = () => dispatch({ type: "SET_UI", ui: { previewOpen: false } });
  // プレビュー自身の内側にある閉鎖ボタンとは別に、画面外周へ一つだけ常設する。
  // 格納・展開のどちらでも同じタブを押せるため、格納後の復帰地点が明確になる。
  const isNarrow = typeof window !== "undefined" && window.innerWidth <= 1024;
  const previewOpen = state.ui.previewOpen !== void 0 ? state.ui.previewOpen !== false : !isNarrow;
  React.useEffect(() => {
    let edgeToggle = document.getElementById("lbt-preview-edge-toggle");
    if (!edgeToggle) {
      edgeToggle = document.createElement("button");
      edgeToggle.id = "lbt-preview-edge-toggle";
      edgeToggle.type = "button";
      document.body.appendChild(edgeToggle);
    }
    edgeToggle.className = `preview-edge-toggle${previewOpen ? " is-open" : " is-collapsed"}`;
    edgeToggle.textContent = previewOpen ? "◀ 格納" : "▶ 展開";
    edgeToggle.title = previewOpen ? "プレビューを格納" : "プレビューを展開";
    edgeToggle.setAttribute("aria-label", edgeToggle.title);
    edgeToggle.onclick = () => dispatch({ type: "SET_UI", ui: { previewOpen: !previewOpen } });
  }, [previewOpen, dispatch]);
  React.useEffect(() => {
    const existing = document.getElementById("lbt-preview-readiness");
    if (!readiness.length) {
      existing?.remove();
      return;
    }
    const tabs = document.querySelector(".preview .preview-tabs");
    if (!tabs) return;
    const indicator = existing || document.createElement("div");
    indicator.id = "lbt-preview-readiness";
    indicator.className = "preview-readiness";
    indicator.setAttribute("role", "status");
    const count = document.createElement("span");
    count.className = "preview-readiness-count";
    count.textContent = `● 要確認 ${readiness.length}`;
    const list = document.createElement("span");
    list.className = "preview-readiness-list";
    list.title = readinessLabel;
    list.textContent = readinessLabel;
    const jump = document.createElement("button");
    jump.className = "preview-readiness-jump";
    jump.type = "button";
    jump.textContent = "確認";
    jump.onclick = () => dispatch({ type: "SET_UI", ui: { currentSection: readiness[0]?.id || "persona" } });
    indicator.replaceChildren(count, list, jump);
    tabs.insertAdjacentElement("afterend", indicator);
  }, [readinessKey, readinessLabel, dispatch]);
  // V17: applySectionOrder は DnD フックより後に定義されるため ref 経由で参照する
  const applySectionOrderRef = React.useRef(() => {});
  // V17: ユーザー定義の並び順（ui.previewSectionOrder[prefix]）を適用する。
  const sectionOrder = state.ui.previewSectionOrder || {};
  const orderedSections = (sections, prefix) => orderPreviewSections(sections, sectionOrder[prefix]);
  // V17: DnD 並べ替え — 順序を ui.previewSectionOrder[prefix] へ保存する。
  const applySectionOrder = (prefix, sectionsArr, from, to) => {
    const cur = orderedSections(sectionsArr, prefix);
    const titles = cur.map((sc) => sc.title);
    const [moved] = titles.splice(from, 1);
    titles.splice(to, 0, moved);
    const next = { ...sectionOrder, [prefix]: titles };
    dispatch({ type: "SET_UI", ui: { previewSectionOrder: next } });
  };
  applySectionOrderRef.current = applySectionOrder;
  const renderSectioned = (sections, prefix, dnd) => {
    // 無題ブロック（キャラクター名などの前置き）は常に先頭へ置き、カテゴリ並べ替えには混ぜない。
    // これにより、見えている最初のカテゴリが無題行のために「上へ移動できない」状態を防ぐ。
    const fixed = sections.filter((section) => !section.title);
    const movable = sections.filter((section) => !!section.title);
    const disp = orderedSections(movable, prefix);
    return /* @__PURE__ */ React.createElement("div", { className: "pv-sec-list" }, ...fixed.map((section, i) => /* @__PURE__ */ React.createElement(PreviewSection, { key: `${prefix}:fixed:${i}`, section, idx: i, collapsed: false, included: true, onToggle: () => {}, onToggleInclude: () => {} })), /* @__PURE__ */ React.createElement("div", { className: "pv-sec-toolbar" }, /* @__PURE__ */ React.createElement("button", { className: "pv-sec-tbtn", onClick: () => setAllCollapsed(disp, prefix, false), title: "\u5168\u5C55\u958B" }, "\u5168\u5C55\u958B"), /* @__PURE__ */ React.createElement("button", { className: "pv-sec-tbtn", onClick: () => setAllCollapsed(disp, prefix, true), title: "\u5168\u6298\u308A\u7573\u307F" }, "\u5168\u6298\u7573"), /* @__PURE__ */ React.createElement("span", { className: "pv-sec-dnd-note", style: { fontSize: 9, marginLeft: "auto", fontFamily: "var(--f-mono)" } }, "\u22EE\u22EE\u306F\u9577\u62BC\u3057\u30C9\u30E9\u30C3\u30B0 / \u2191\u2193\u3067\u79FB\u52D5")), disp.map((s, i) => /* @__PURE__ */ React.createElement(
      PreviewSection,
      {
        key: `${prefix}:${s.title || i}`,
        section: s,
        idx: i,
        collapsed: !!collapsedMap[`${prefix}:${disp.indexOf(s)}`],
        onToggle: () => toggleSec(`${prefix}:${disp.indexOf(s)}`),
        included: !(outputExclude[prefix] || {})[s.title],
        onToggleInclude: () => toggleInclude(prefix, s.title),
        dragHandleProps: dnd.handleProps(i),
        dragRowProps: dnd.rowProps(i),
        canMoveUp: i > 0,
        canMoveDown: i < disp.length - 1,
        onMoveUp: () => applySectionOrder(prefix, movable, i, i - 1),
        onMoveDown: () => applySectionOrder(prefix, movable, i, i + 1)
      }
    )));
  };
  return /* @__PURE__ */ React.createElement("aside", { className: `preview${state.ui.previewOpen ? " is-open" : ""}` }, /* @__PURE__ */ React.createElement("button", { className: "preview-close", onClick: closePreview, title: "\u30D7\u30EC\u30D3\u30E5\u30FC\u3092\u683C\u7D0D" }, /* @__PURE__ */ React.createElement(Icon, { name: "x", size: 14 })), /* @__PURE__ */ React.createElement("div", { className: "preview-tabs" }, /* @__PURE__ */ React.createElement("button", { className: `preview-tab${tab === "memo" ? " is-active" : ""}`, onClick: () => setTab("memo") }, "MEMO"), /* @__PURE__ */ React.createElement("button", { className: `preview-tab${tab === "palette" ? " is-active" : ""}`, onClick: () => setTab("palette") }, "PALETTE"), /* @__PURE__ */ React.createElement("button", { className: `preview-tab${tab === "json" ? " is-active" : ""}`, onClick: () => setTab("json") }, "JSON")), /* @__PURE__ */ React.createElement("div", { className: "preview-body", ...(tab === "memo" ? memoDnd.scrollContainerProps : tab === "palette" ? paletteDnd.scrollContainerProps : {}) }, tab === "memo" && renderSectioned(memoSections, "memo", memoDnd), tab === "palette" && renderSectioned(paletteSections, "palette", paletteDnd), tab === "json" && /* @__PURE__ */ React.createElement("div", { style: { whiteSpace: "pre-wrap" } }, json)), /* @__PURE__ */ React.createElement("div", { className: "preview-hint" }, tab === "memo" && "\u8AAD\u307F\u7269\u5F62\u5F0F\u306E\u30B7\u30FC\u30C8\u8981\u7D04 \u2014 \u30BB\u30C3\u30B7\u30E7\u30F3\u4E2D\u306E\u5373\u6642\u53C2\u7167\u306B\u3002\u5404\u898B\u51FA\u3057\u3092\u30AF\u30EA\u30C3\u30AF\u3067\u6298\u308A\u7573\u307F", tab === "palette" && "ccfolia \u30C1\u30E3\u30C3\u30C8\u30D1\u30EC\u30C3\u30C8\u5F62\u5F0F \u2014 \u30C1\u30A7\u30C3\u30AF\u3092\u5916\u3059\u3068JSON\u304B\u3089\u9664\u5916\u3002\u6298\u308A\u7573\u307F\u306F\u8868\u793A\u306E\u307F", tab === "json" && "ccfolia \u30AD\u30E3\u30E9\u30AF\u30BF\u30FCJSON \u2014 \u300C\u30AF\u30EA\u30C3\u30D7\u30DC\u30FC\u30C9\u304B\u3089\u8FFD\u52A0\u300D\u3067\u8CBC\u4ED8"), /* @__PURE__ */ React.createElement("div", { className: "preview-actions" }, /* @__PURE__ */ React.createElement(Button, { size: "sm", icon: "copy", onClick: copyCurrent, className: "grow" }, "\u73FE\u5728\u306E\u30BF\u30D6\u3092\u30B3\u30D4\u30FC"), /* @__PURE__ */ React.createElement(Button, { size: "sm", variant: "primary", icon: "check", onClick: copyJson }, "JSON")));
};
window.LivePreview = LivePreview;
