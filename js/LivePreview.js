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
// プレビューに表示する原文の見出し表記と改行を保ったまま、JSON出力から除外された
// カテゴリだけをコピー対象から取り除く。表示の折り畳み状態はコピー内容へ影響させない。
function filterPreviewCopyOutput(text, excluded) {
  if (!text) return "";
  const ex = excluded || {};
  if (!Object.keys(ex).length) return text;
  const lines = String(text).split("\n");
  const HEAD_RE = /^(?:###\s*■?\s*(.+?)\s*$|【(.+?)】\s*$|■\s*(.+?)\s*$)/;
  const SEP_RE = /^\s*[ー─]{5,}\s*$/;
  const drop = new Array(lines.length).fill(false);
  let hide = false;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(HEAD_RE);
    if (m) {
      const title = m[1] || m[2] || m[3] || "";
      hide = !!ex[title];
      if (hide) {
        // 見出し直前の空行1つと区切り線も落とし、見出しだけ消えた余白を残さない。
        let j = i - 1;
        if (j >= 0 && !lines[j].trim()) drop[j--] = true;
        while (j >= 0 && SEP_RE.test(lines[j])) drop[j--] = true;
      }
    }
    if (!hide) continue;
    // 除外したセクションの末尾にある空行は、次に残る見出しとの区切りとしてだけ残す。
    if (!lines[i].trim()) {
      let k = i + 1;
      while (k < lines.length && !lines[k].trim()) k++;
      const next = k < lines.length ? lines[k].match(HEAD_RE) : null;
      if (next && !ex[next[1] || next[2] || next[3] || ""]) continue;
    }
    drop[i] = true;
  }
  return lines.filter((_, i) => !drop[i]).join("\n").replace(/^\n+|\n+$/g, "");
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
    /* gap はインラインスタイルで 6px を指定していたため、CSS の
   .pv-sec > .pv-sec-head { gap: 8px } を !important で上書きする必要があった。
   !important を不要にするため、間隔の責務をスタイルシートへ統一する。
   display / align-items は CSS 側（workspace.css の .pv-sec-head）に既にある。 */
{ className: "pv-sec-head" },
    dragHandleProps ? /* @__PURE__ */ React.createElement("div", { className: "pv-sec-reorder", "aria-label": "カテゴリの並べ替え" }, /* @__PURE__ */ React.createElement("span", { ...dragHandleProps, className: "pv-sec-drag", style: { ...(dragHandleProps.style || {}) }, title: "長押ししてドラッグで並べ替え" }, "\u22EE\u22EE"), /* @__PURE__ */ React.createElement("button", { type: "button", className: "pv-sec-move", disabled: !canMoveUp, onClick: (e) => { e.stopPropagation(); onMoveUp && onMoveUp(); }, title: "このカテゴリを上へ移動", "aria-label": "このカテゴリを上へ移動" }, "\u2191"), /* @__PURE__ */ React.createElement("button", { type: "button", className: "pv-sec-move", disabled: !canMoveDown, onClick: (e) => { e.stopPropagation(); onMoveDown && onMoveDown(); }, title: "このカテゴリを下へ移動", "aria-label": "このカテゴリを下へ移動" }, "\u2193")) : null,
    /* @__PURE__ */ React.createElement("input", {
      type: "checkbox",
      checked: included !== false,
      onChange: (e) => { e.stopPropagation(); onToggleInclude && onToggleInclude(); },
      onClick: (e) => e.stopPropagation(),
      title: "OFF\u306B\u3059\u308B\u3068JSON\u51FA\u529B\u304B\u3089\u9664\u5916\u3057\u307E\u3059\uFF08\u8868\u793A\u306F\u6B8B\u308A\u307E\u3059\uFF09",
      "aria-label": `${section.title || "このカテゴリ"}をJSON出力に含める`,
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
      included === false && /* @__PURE__ */ React.createElement("span", { style: { marginLeft: "auto", fontSize: "var(--fs-9)", color: "var(--warn)", fontFamily: "var(--f-display)", letterSpacing: "0.12em" } }, "JSON\u304B\u3089\u9664\u5916")
    )
  ) : null, !collapsed && !isEmpty && /* @__PURE__ */ React.createElement("div", { className: "pv-sec-body" }, bodyText));
};
const LivePreview = ({ state, dispatch }) => {
  const h = React.createElement;
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
  const json = React.useMemo(() => JSON.stringify(LBT_gen.buildCcfoliaJSON(previewData, { palette, memo }), null, 2), [previewData, palette, memo]);
  /* TOKEN preview uses the exact CCFOLIA JSON data object; it does not create a second export path. */
  const tokenData = React.useMemo(() => {
    try { return JSON.parse(json)?.data || {}; }
    catch (_) { return {}; }
  }, [json]);
  const tokenImage = String(tokenData.iconUrl || tokenData.faces?.[0]?.iconUrl || "");
  const tokenMode = state.ui.tokenPreviewMode === "sheet" ? "sheet" : "board";
  const setTokenMode = (mode) => dispatch({ type: "SET_UI", ui: { tokenPreviewMode: mode } });
  const [tokenImageFailed, setTokenImageFailed] = React.useState(false);
  React.useEffect(() => { setTokenImageFailed(false); }, [tokenImage]);
  const tokenName = String(tokenData.name || "キャラクター");
  const tokenColor = /^#[0-9a-f]{6}$/i.test(String(tokenData.color || "")) ? tokenData.color : "#c8a84b";
  const tokenStatus = Array.isArray(tokenData.status) ? tokenData.status : [];
  const tokenParams = Array.isArray(tokenData.params) ? tokenData.params : [];
  const renderTokenImage = (className, alt) => h("div", { className },
    tokenImage && !tokenImageFailed
      ? h("img", { src: tokenImage, alt, onError: () => setTokenImageFailed(true) })
      : h("span", { className: "pv-token-image-empty", role: "img", "aria-label": alt + "：画像なし" }, "◈")
  );
  const renderTokenStatus = (entry) => {
    const value = Number(entry.value);
    const max = Number(entry.max);
    const hasRatio = Number.isFinite(value) && Number.isFinite(max) && max > 0;
    const ratio = hasRatio ? Math.max(0, Math.min(100, value / max * 100)) : 0;
    return h("div", { key: String(entry.label || ""), className: "pv-token-status" },
      h("div", { className: "pv-token-status-top" },
        h("span", { className: "pv-token-status-label" }, String(entry.label || "状態")),
        h("span", { className: "pv-token-status-value" }, String(entry.value ?? "—") + (entry.max == null ? "" : " / " + entry.max))
      ),
      h("div", { className: "pv-token-status-track", "aria-hidden": "true" },
        h("span", { style: { width: String(ratio) + "%", backgroundColor: tokenColor } })
      )
    );
  };
  const renderTokenPreview = () => h("section", { className: "pv-token-preview", "aria-label": "ココフォリア駒プレビュー" },
    h("header", { className: "pv-token-preview-head" },
      h("div", null,
        h("div", { className: "pv-token-eyebrow" }, "CCFOLIA / TOKEN PREVIEW"),
        h("h3", null, "駒プレビュー"),
        h("p", null, "出力される画像・名前・行動順を確認します")
      ),
      h("div", { className: "pv-token-mode-switch", role: "tablist", "aria-label": "駒の表示方式" },
        h("button", { type: "button", role: "tab", "aria-selected": tokenMode === "board", className: tokenMode === "board" ? "is-active" : "", onClick: () => setTokenMode("board") }, "盤面"),
        h("button", { type: "button", role: "tab", "aria-selected": tokenMode === "sheet", className: tokenMode === "sheet" ? "is-active" : "", onClick: () => setTokenMode("sheet") }, "シート")
      )
    ),
    tokenMode === "board"
      ? h("div", { className: "pv-token-board-view" },
          h("div", { className: "pv-token-board", "aria-label": "盤面上の駒の見え方" },
            h("div", { className: "pv-token-board-grid", "aria-hidden": "true" }),
            h("div", { className: "pv-token-board-token", style: { "--pv-token-color": tokenColor } },
              h("span", { className: "pv-token-initiative" }, "行動順 " + String(tokenData.initiative ?? 0)),
              renderTokenImage("pv-token-board-avatar", tokenName + "の駒画像"),
              h("strong", { className: "pv-token-board-name" }, tokenName)
            )
          ),
          h("div", { className: "pv-token-board-details" },
            h("div", { className: "pv-token-identity" },
              h("span", null, "PL"),
              h("strong", null, String(tokenData.playerName || "未設定"))
            ),
            h("div", { className: "pv-token-status-grid" },
              tokenStatus.filter((entry) => ["HP", "SAN"].includes(String(entry.label || "").toUpperCase())).map(renderTokenStatus)
            )
          )
        )
      : h("div", { className: "pv-token-sheet-view" },
          h("div", { className: "pv-token-sheet-layout" },
            h("div", { className: "pv-token-sheet-portrait", style: { "--pv-token-color": tokenColor } },
              renderTokenImage("pv-token-sheet-image", tokenName + "の立ち絵")
            ),
            h("div", { className: "pv-token-sheet-main" },
              h("div", { className: "pv-token-sheet-overline" }, "CHARACTER SHEET"),
              h("div", { className: "pv-token-sheet-title-row" },
                h("h3", null, tokenName),
                h("span", { className: "pv-token-sheet-init", style: { borderColor: tokenColor } }, "行動順 " + String(tokenData.initiative ?? 0))
              ),
              h("p", { className: "pv-token-sheet-player" }, "PL　" + String(tokenData.playerName || "未設定")),
              h("div", { className: "pv-token-sheet-section-title" }, "ステータス"),
              h("div", { className: "pv-token-status-grid" }, tokenStatus.slice(0, 8).map(renderTokenStatus)),
              tokenParams.length ? h(React.Fragment, null,
                h("div", { className: "pv-token-sheet-section-title" }, "パラメータ"),
                h("div", { className: "pv-token-param-grid" },
                  tokenParams.slice(0, 8).map((entry) => h("div", { key: String(entry.label || ""), className: "pv-token-param" },
                    h("span", null, String(entry.label || "ラベル")),
                    h("strong", null, String(entry.value ?? "—"))
                  ))
                )
              ) : null
            )
          )
        )
  );

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
  /* コピーは表示の折り畳みには影響されないが、JSON出力から除外したカテゴリは
     JSONへ送らないという利用者の意思なので、コピーからも外す。
     除外の判定は表示のチェックと同じ outputExclude を参照する。 */
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
    return /* @__PURE__ */ React.createElement("div", { className: "pv-sec-list" }, ...fixed.map((section, i) => /* @__PURE__ */ React.createElement(PreviewSection, { key: `${prefix}:fixed:${i}`, section, idx: i, collapsed: false, included: true, onToggle: () => {}, onToggleInclude: () => {} })), /* @__PURE__ */ React.createElement("div", { className: "pv-sec-toolbar" }, /* @__PURE__ */ React.createElement("button", { className: "pv-sec-tbtn", onClick: () => setAllCollapsed(disp, prefix, false), title: "\u5168\u5C55\u958B" }, "\u5168\u5C55\u958B"), /* @__PURE__ */ React.createElement("button", { className: "pv-sec-tbtn", onClick: () => setAllCollapsed(disp, prefix, true), title: "\u5168\u6298\u308A\u7573\u307F" }, "\u5168\u6298\u7573"), /* @__PURE__ */ prefix === "palette" && /* @__PURE__ */ React.createElement("label", { className: "pv-sec-bullet-toggle", title: "\u52b9\u679c\u6bb5\u843d\u306e\u5148\u982d\u306b\u4ed8\u3051\u308b\u25b6\ufe0e\u3002ON\u3067\u4ed8\u3051\u308b\uFF0FOFF\u3067\u4ed8\u3051\u306a\u3044\u3002\u672c\u6587\u3068\u6bb5\u843d\u306f\u3069\u3061\u3089\u3067\u3082\u5909\u308f\u3089\u306a\u3044" }, /* @__PURE__ */ React.createElement("input", { type: "checkbox", checked: state.paletteOptions?.effectBullet !== false, onClick: (e) => e.stopPropagation(), onChange: () => dispatch({ type: "SET_FIELD", field: "paletteOptions", value: { ...(state.paletteOptions || {}), effectBullet: state.paletteOptions?.effectBullet === false } }), "aria-label": "\u52b9\u679c\u6bb5\u843d\u306e\u25b6\ufe0e\u3092\u8868\u793a\u3059\u308b" }), "\u52b9\u679c\u6bb5\u843d\u306e\u25b6\ufe0e", /* @__PURE__ */ React.createElement("span", { className: "pv-sec-bullet-state" }, state.paletteOptions?.effectBullet === false ? "OFF" : "ON"))), disp.map((s, i) => /* @__PURE__ */ React.createElement(
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
  return /* @__PURE__ */ React.createElement("aside", { id: "preview-panel", "aria-label": "プレビュー", className: `preview${state.ui.previewOpen ? " is-open" : ""}` }, /* @__PURE__ */ React.createElement("div", { className: "preview-tabs" }, /* @__PURE__ */ React.createElement("button", { className: `preview-tab${tab === "memo" ? " is-active" : ""}`, onClick: () => setTab("memo") }, "MEMO"), /* @__PURE__ */ React.createElement("button", { className: `preview-tab${tab === "palette" ? " is-active" : ""}`, onClick: () => setTab("palette") }, "PALETTE"), /* @__PURE__ */ React.createElement("button", { className: `preview-tab${tab === "json" ? " is-active" : ""}`, onClick: () => setTab("json") }, "JSON"), h("button", { className: tab === "token" ? "preview-tab is-active" : "preview-tab", onClick: () => setTab("token"), title: "ココフォリア駒の表示を確認", "aria-label": "ココフォリア駒プレビュー" }, "駒")), /* @__PURE__ */ React.createElement("div", { className: "preview-body", ...(tab === "memo" ? memoDnd.scrollContainerProps : tab === "palette" ? paletteDnd.scrollContainerProps : {}) }, tab === "memo" && renderSectioned(memoSections, "memo", memoDnd), tab === "palette" && renderSectioned(paletteSections, "palette", paletteDnd), tab === "json" && /* @__PURE__ */ React.createElement("div", { style: { whiteSpace: "pre-wrap" } }, json), tab === "token" && renderTokenPreview()), /* @__PURE__ */ React.createElement("div", { className: "preview-hint" }, tab === "memo" && "\u8AAD\u307F\u7269\u5F62\u5F0F\u306E\u8981\u7D04 \u2014 \u6298\u308A\u7573\u307F\u306F\u5404\u898B\u51FA\u3057\u30FB\u4E26\u3079\u66FF\u3048\u306F \u22EE\u22EE / \u2191\u2193", tab === "palette" && "\u30C1\u30E3\u30C3\u30C8\u30D1\u30EC\u30C3\u30C8\u5F62\u5F0F \u2014 \u6298\u308A\u7573\u307F\u306F\u8868\u793A\u306E\u307F\u30FB\u4E26\u3079\u66FF\u3048\u306F \u22EE\u22EE / \u2191\u2193", tab === "json" && "ccfolia \u30AD\u30E3\u30E9\u30AF\u30BF\u30FCJSON \u2014 \u300C\u30AF\u30EA\u30C3\u30D7\u30DC\u30FC\u30C9\u304B\u3089\u8FFD\u52A0\u300D\u3067\u8CBC\u4ED8"), /* @__PURE__ */ React.createElement("div", { className: "preview-actions" }, /* @__PURE__ */ React.createElement(Button, { size: "sm", icon: "copy", onClick: copyCurrent, className: "grow" }, "\u73FE\u5728\u306E\u30BF\u30D6\u3092\u30B3\u30D4\u30FC"), /* @__PURE__ */ React.createElement(Button, { size: "sm", variant: "primary", icon: "check", onClick: copyJson }, "JSON")));
};
window.LivePreview = LivePreview;
