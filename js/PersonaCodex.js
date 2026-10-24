const SINS_ORDER = ["\u61A4\u6012", "\u8272\u6B32", "\u6020\u60F0", "\u66B4\u98DF", "\u6182\u9B31", "\u50B2\u6162", "\u5AC9\u59AC"];
const RES_LEVELS = ["\u8106\u5F31", "\u5F31\u70B9", "\u666E\u901A", "\u62B5\u6297", "\u8010\u6027", "\u514D\u75AB"];

// 基本ルールPDF「バフ・デバフ一覧」(303〜307頁) の掲載順。
// 人格編集の候補は五十音順ではなく、ルールブックを読む順で提示する。
// DB独自・将来追加の語は既存データを失わないため、公式一覧の後ろへ安定して配置する。
// 人格の候補には、変換・派生・属性限定ではない直接的な基本状態だけを固定で用意する。
const PERSONA_FIXED_KEYWORD_OPTIONS = [
  "\u30D1\u30EF\u30FC", "\u5FCD\u8010", "\u30AF\u30A4\u30C3\u30AF", "\u4FDD\u8B77", "\u30C0\u30E1\u30FC\u30B8\u91CF\u5897\u52A0",
  "\u865A\u5F31", "\u6B66\u88C5\u89E3\u9664", "\u675F\u7E1B", "\u8106\u5F31", "\u30C0\u30E1\u30FC\u30B8\u91CF\u6E1B\u5C11",
  "\u5F3E\u4E38", "\u30D0\u30EA\u30A2", "\u7159"
];
// 基本ルールPDFの掲載順は js/core.js が window.LBT_PDF_KEYWORD_ORDER として定義する。
const PDF_KEYWORD_ORDER = window.LBT_PDF_KEYWORD_ORDER || [];
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
  if (!p.__aff) {
    // Prefer the errata-derived affiliation field over name-based inference.
    p.__aff = (p.affiliation && p.affiliation.trim()) || inferAffiliation(p.name);
  }
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
/* React.memo で199人格カードの無差別再レンダリングを防ぐ。
   props が変わらないカードは前回の結果を再利用する。 */
const PersonaCard = React.memo(({ persona, mode, isEquipped, isActive, isFav, isOwned, onQuickAcquire, quickAcquireLabel, onSelect, onToggleFav, onEquip, purchaseBlocked }) => {
  const p = decoratePersona(persona);
  const allKws = orderPersonaKeywordDisplay(p.keywords);
  const kws = allKws.slice(0, 3);
  const primarySin = getPrimarySin(p);
  return /* @__PURE__ */ React.createElement(
    "div",
    {
      className: `p-card${isActive ? " is-active" : ""}${isEquipped ? " is-equipped" : ""}`,
      "data-mode": mode,
      "data-persona-key": `${mode}:${p.no}`,
      style: { "--sin-primary": primarySin ? `var(--sin-${primarySin})` : "var(--gold)" }
    },
    /* カード全体を覆う透明ボタンで主操作を表す。role="button" をカード自身に
       付与すると内側の .p-fav（実 button）と入れ子になり不正なHTMLになるため、
       主操作を兄弟要素の button へ分離する。 */
    /* @__PURE__ */ React.createElement("button", {
      type: "button",
      className: "p-card-hit",
      "aria-label": `${p.name}（No.${String(p.no).padStart(3, "0")}）を選択して詳細を表示`,
      onClick: () => onSelect(p)
    }),
    /* @__PURE__ */ React.createElement("div", { className: "p-card-head" }, /* @__PURE__ */ React.createElement("span", { className: "p-num" }, "No.", String(p.no).padStart(3, "0")),
    /* @__PURE__ */ React.createElement("span", { className: "p-affil" }, decoratePersona(p).__aff), /* 破損疑いマークはDB原典データ(抽出品質)が対象。同期・カスタムなど利用者所有の人格データには無意味なため除外。 */ typeof personaHasIssue === "function" && !p.__custom && !p.__draftImported && personaHasIssue(p) && /* @__PURE__ */ React.createElement("span", { title: "\u3053\u306E\u30AB\u30FC\u30C9\u306B\u306F\u7834\u640D\u7591\u3044\u306E\u7B87\u6240\u304C\u3042\u308A\u307E\u3059", style: { fontSize: "var(--fs-10)", color: "var(--warn)", padding: "0 4px", lineHeight: 1 } }, "\u26A0"), /* @__PURE__ */ React.createElement("div", { className: "grow" }), /* @__PURE__ */ React.createElement(
      "button",
      {
        className: `p-fav${isFav ? " is-fav" : ""}`,
        onClick: (e) => {
          e.stopPropagation();
          onToggleFav(mode, p.no);
        },
        title: isFav ? "\u304A\u6C17\u306B\u5165\u308A\u89E3\u9664" : "\u304A\u6C17\u306B\u5165\u308A\u8FFD\u52A0",
        "aria-label": isFav ? p.name + " のお気に入りを解除" : p.name + " をお気に入りに追加",
        "aria-pressed": isFav,
        type: "button"
      },
      /* @__PURE__ */ React.createElement(Icon, { name: "star", size: 14 })
    )),
    /* @__PURE__ */ React.createElement("div", { className: "p-name" }, p.name),
    /* @__PURE__ */ React.createElement("div", { className: "p-stats" }, /* @__PURE__ */ React.createElement("div", { className: "p-stat" }, /* @__PURE__ */ React.createElement("span", { className: "p-stat-label" }, "HP"), /* @__PURE__ */ React.createElement("span", { className: "p-stat-value" }, p.hp)), /* @__PURE__ */ React.createElement("div", { className: "p-stat" }, /* @__PURE__ */ React.createElement("span", { className: "p-stat-label" }, "SAN"), /* @__PURE__ */ React.createElement("span", { className: "p-stat-value" }, p.san)), /* @__PURE__ */ React.createElement("div", { className: "p-stat" }, /* @__PURE__ */ React.createElement("span", { className: "p-stat-label" }, "SPD"), /* @__PURE__ */ React.createElement("span", { className: "p-stat-value" }, p.speed))),
    /* @__PURE__ */ React.createElement(ResRow, { s: p.res_slash, p: p.res_pierce, b: p.res_blunt }),
    /* @__PURE__ */ React.createElement(PersonaSinPills, { skills: p.skills }),
    kws.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "p-kw-row" }, kws.map((k) => /* @__PURE__ */ React.createElement("span", { key: k, className: "p-kw" }, k)), allKws.length > kws.length && React.createElement("span", { key: "kw-overflow", className: "p-kw", title: allKws.slice(kws.length).join(", "), "aria-label": "ほか" + (allKws.length - kws.length) + "件のキーワード" }, "+" + (allKws.length - kws.length))),
    /* 獲得は詳細ポップオーバーを開かずにカード上で完結させる。
       特異人格は指定購入できない（core P203）なので、抽出が選択されている時だけ出す。 */
    !isOwned && onQuickAcquire && !purchaseBlocked && /* @__PURE__ */ React.createElement(Button, {
      size: "sm",
      variant: "ghost",
      className: "p-card-quick-acquire",
      onClick: (event) => {
        event.stopPropagation();
        onQuickAcquire(p);
      },
      title: "詳細を開かずにこの人格を獲得する"
    }, quickAcquireLabel)
  );
});
/* AcquireBar は OtherSections.js が window に公開する。
   同名の const は自身の束縛を追うため TDZ になる。
   読み込み時点の window 実体を別名で保持してから包む。 */
const AcquireBarView = (props) => React.createElement(window.AcquireBar, props);

const PersonaDetail = ({ persona, mode, isEquipped, onEquip, onUnequip, onAddRoster, isInRoster, acquireHow, onAcquireHowChange, onAcquire, onReturnToList, embed, onOpenDraft, state }) => {
  if (!persona && onOpenDraft) {
    return /* @__PURE__ */ React.createElement("div", { className: "codex-detail" }, /* @__PURE__ */ React.createElement("div", { className: "detail-empty" }, /* @__PURE__ */ React.createElement("div", { className: "detail-empty-icon" }, "◈"), /* @__PURE__ */ React.createElement("div", { className: "t-label" }, "人格を選択 または テキスト流し込み反映"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-11)", color: "var(--tx-mute)", marginTop: 8 } }, "完成した人格データを流し込み、確認してからカスタム人格または同期人格として反映できます。"), /* @__PURE__ */ React.createElement("button", { className: "persona-draft-import-trigger persona-draft-import-trigger--empty", type: "button", onClick: onOpenDraft }, "テキスト流し込み反映")));
  }
  if (!persona) {
    return /* @__PURE__ */ React.createElement("div", { className: "codex-detail" }, /* @__PURE__ */ React.createElement("div", { className: "detail-empty" }, /* @__PURE__ */ React.createElement("div", { className: "detail-empty-icon" }, "\u25C8"), /* @__PURE__ */ React.createElement("div", { className: "t-label" }, "\u5DE6\u306E\u30AB\u30FC\u30C9\u3092\u9078\u629E"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-11)", color: "var(--tx-mute)", marginTop: 8 } }, "\u4EBA\u683C\u3092\u9078\u629E\u3059\u308B\u3068\u8A73\u7D30\u304C\u8868\u793A\u3055\u308C\u307E\u3059\u3002", /* @__PURE__ */ React.createElement("br", null), "\u30C0\u30D6\u30EB\u30AF\u30EA\u30C3\u30AF\u3067\u88C5\u5099\u3002")));
  }
  const p = persona;
  const primarySin = getPrimarySin(p);
  const kws = orderPersonaKeywordDisplay(p.keywords);
  return /* @__PURE__ */ React.createElement("div", { id: !embed ? "persona-selected-detail" : void 0, className: `codex-detail${embed ? " is-embedded" : ""}`, style: { "--sin-primary": primarySin ? `var(--sin-${primarySin})` : "var(--gold)" } }, !embed && /* @__PURE__ */ React.createElement("div", { className: "detail-head" }, /* @__PURE__ */ React.createElement("div", { className: "detail-eyebrow" }, /* @__PURE__ */ React.createElement("span", { className: "detail-num" }, "No.", String(p.no).padStart(3, "0")), /* @__PURE__ */ React.createElement("span", { className: "detail-type" }, mode === "n" ? "\u901A\u5E38\u4EBA\u683C / NORMAL" : "\u7279\u7570\u4EBA\u683C / SPECIAL")), /* @__PURE__ */ React.createElement("div", { className: "detail-name" }, p.name), /* @__PURE__ */ React.createElement("div", { style: { marginBottom: "var(--s-3)" } }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-10)", color: "var(--tx-mute)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 4 } }, "\u6240\u5C5E"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-12)", color: "var(--tx-2)" } }, decoratePersona(p).__aff)), /* @__PURE__ */ React.createElement("div", { className: "detail-stats" }, /* @__PURE__ */ React.createElement("div", { className: "detail-stat" }, /* @__PURE__ */ React.createElement("span", { className: "detail-stat-label" }, "HP"), /* @__PURE__ */ React.createElement("span", { className: "detail-stat-value" }, p.hp)), /* @__PURE__ */ React.createElement("div", { className: "detail-stat" }, /* @__PURE__ */ React.createElement("span", { className: "detail-stat-label" }, "SAN"), /* @__PURE__ */ React.createElement("span", { className: "detail-stat-value" }, p.san)), /* @__PURE__ */ React.createElement("div", { className: "detail-stat" }, /* @__PURE__ */ React.createElement("span", { className: "detail-stat-label" }, "\u901F\u5EA6"), /* @__PURE__ */ React.createElement("span", { className: "detail-stat-value" }, p.speed)), /* @__PURE__ */ React.createElement("div", { className: "detail-stat" }, /* @__PURE__ */ React.createElement("span", { className: "detail-stat-label" }, "\u5F3E\u4E38"), /* @__PURE__ */ React.createElement("span", { className: "detail-stat-value" }, p.bullets || "\xD7")))), /* @__PURE__ */ React.createElement("div", { className: "detail-body" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "detail-section-title" }, "\u8010\u6027 / RESISTANCE"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "var(--s-3)", flexWrap: "wrap", padding: "8px 0 12px", alignItems: "center" } }, /* @__PURE__ */ React.createElement(ResRow, { s: p.res_slash, p: p.res_pierce, b: p.res_blunt, showLabels: true }))), !embed && kws.length > 0 && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "detail-section-title" }, "\u30AD\u30FC\u30EF\u30FC\u30C9 / KEYWORDS"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 6, flexWrap: "wrap" } }, kws.map((k) => /* @__PURE__ */ React.createElement("span", { key: k, className: "chip is-sm" }, k)))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "detail-section-title" }, "\u30D1\u30C3\u30B7\u30D6 / PASSIVE"), /* @__PURE__ */ React.createElement("div", { className: "detail-passive" }, /* @__PURE__ */ React.createElement("div", { className: "detail-passive-name" }, p.passive_name || "\uFF08\u306A\u3057\uFF09"), /* @__PURE__ */ React.createElement("div", { className: "detail-passive-cond cond-chips-lg", style: { display: "flex", alignItems: "center", gap: 6 } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: "var(--fs-10)", color: "var(--tx-mute)" } }, "\u767A\u52D5\u6761\u4EF6"), /* @__PURE__ */ React.createElement(CondChips, { cond: p.passive_cond || "\u306A\u3057" })), p.passive_always && /* @__PURE__ */ React.createElement("div", { className: "detail-passive-effect", style: { marginBottom: 6, color: "var(--tx-dim)" } }, /* @__PURE__ */ React.createElement("b", { style: { color: "var(--gold)", fontFamily: "var(--f-display)", fontSize: "var(--fs-10)", letterSpacing: "0.14em" } }, "\u5E38\u6642\uFF1A"), window.LBT_GLOSSARY_TEXT ? window.LBT_GLOSSARY_TEXT(p.passive_always, "人格パッシブ:" + p.name) : p.passive_always), /* @__PURE__ */ React.createElement("div", { className: "detail-passive-effect" }, window.LBT_GLOSSARY_TEXT ? window.LBT_GLOSSARY_TEXT(p.passive_effect, "人格パッシブ:" + p.name) : p.passive_effect))), Array.isArray(p.extra_passives) && p.extra_passives.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "detail-extra-passives", style: { marginTop: 10 } },
        /* @__PURE__ */ React.createElement("div", { className: "detail-section-title" }, "追加パッシブ / EXTRA PASSIVES"),
        p.extra_passives.map((passive, index) => /* @__PURE__ */ React.createElement("div", { key: index, className: "detail-passive", style: { marginBottom: 8 } },
          /* @__PURE__ */ React.createElement("div", { className: "detail-passive-name" }, passive.name || "名称未設定"),
          passive.cond && /* @__PURE__ */ React.createElement("div", { className: "detail-passive-cond cond-chips-lg", style: { display: "flex", alignItems: "center", gap: 6 } },
            /* @__PURE__ */ React.createElement("span", { style: { fontSize: "var(--fs-10)", color: "var(--tx-mute)" } }, "発動条件"),
            React.createElement(CondChips, { cond: passive.cond })),
          passive.always && /* @__PURE__ */ React.createElement("div", { className: "detail-passive-effect", style: { marginBottom: 6, color: "var(--tx-dim)" } },
            React.createElement("b", { style: { color: "var(--gold)", fontSize: "var(--fs-10)" } }, "常時："),
            window.LBT_GLOSSARY_TEXT ? window.LBT_GLOSSARY_TEXT(passive.always, "追加パッシブ:" + p.name) : passive.always),
          passive.effect && /* @__PURE__ */ React.createElement("div", { className: "detail-passive-effect" },
            window.LBT_GLOSSARY_TEXT ? window.LBT_GLOSSARY_TEXT(passive.effect, "追加パッシブ:" + p.name) : passive.effect)))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "detail-section-title" }, "\u6226\u8853\u30B9\u30AD\u30EB / SKILLS"), /* @__PURE__ */ React.createElement("div", { className: "detail-skills" }, (p.skills || []).map((sk, i) => /* @__PURE__ */ React.createElement("div", { key: i, className: "detail-skill", "data-sin": sk.sin, style: { flexDirection: "column", alignItems: "stretch" } },
        /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "baseline", gap: 8 } },
          /* @__PURE__ */ React.createElement("span", { className: "detail-skill-rank" }, "S", (sk.rank || "").replace(/[^0-9-]/g, "") || i),
          /* @__PURE__ */ React.createElement("span", { className: "detail-skill-name" }, sk.name),
          /* @__PURE__ */ React.createElement("span", { className: "detail-skill-type" }, sk.type)),
        // V15: 具体効果テキストを反映
        sk.effect ? /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-11)", color: "var(--tx-2)", lineHeight: 1.55, marginTop: 4, whiteSpace: "pre-wrap", paddingLeft: 2 } }, window.LBT_GLOSSARY_TEXT ? window.LBT_GLOSSARY_TEXT(sk.effect, "人格スキル:" + p.name) : sk.effect) : null,
        // V15: ダイスを反映
        (sk.dice || []).length > 0 ? /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 2, marginTop: 4 } }, (sk.dice || []).map((d, di) => /* @__PURE__ */ React.createElement("div", { key: di, style: { display: "flex", gap: 8, fontSize: "var(--fs-10)", fontFamily: "var(--f-mono)", color: "var(--gold-hi)" } }, /* @__PURE__ */ React.createElement("span", { style: { minWidth: 52, fontWeight: 600 } }, d.roll || ""), d.effect ? /* @__PURE__ */ React.createElement("span", { style: { color: "var(--tx-dim)", fontFamily: "var(--f-body)", whiteSpace: "pre-wrap" } }, window.LBT_GLOSSARY_TEXT ? window.LBT_GLOSSARY_TEXT(d.effect, "人格ダイス:" + p.name) : d.effect) : null))) : null
      )))), (p.unique_buffs || []).length > 0 ? /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "detail-section-title", style: { color: "var(--gold-hi)", display: "flex", alignItems: "center", gap: 6 } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: "var(--fs-14)" } }, "\u25C6"), /* @__PURE__ */ React.createElement("span", null, "\u56FA\u6709\u30D0\u30D5 / UNIQUE"), /* @__PURE__ */ React.createElement("span", { style: { marginLeft: "auto", fontFamily: "var(--f-mono)", fontSize: "var(--fs-9)", color: "var(--tx-mute)", letterSpacing: "0.06em" } }, p.unique_buffs.length, "\u4EF6")), /* @__PURE__ */ React.createElement("div", { className: "stack-2", style: { padding: "8px", background: "var(--gold-tint)", border: "1px solid var(--gold-line)", borderRadius: "var(--r)" } }, p.unique_buffs.map((b, i) => /* @__PURE__ */ React.createElement("div", { key: i, style: { padding: "6px 10px", background: "var(--surface-inset)", borderRadius: "var(--r)", border: "1px solid var(--line-dim)" } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--f-display)", fontWeight: 600, fontSize: "var(--fs-12)", color: "var(--tx)" } }, window.LBT_GLOSSARY_TEXT ? window.LBT_GLOSSARY_TEXT(b.name, "人格固有バフ:" + p.name) : b.name, " ", /* @__PURE__ */ React.createElement("span", { style: { fontSize: "var(--fs-10)", color: "var(--tx-dim)", fontWeight: 400 } }, "(", b.type, " / \u6700\u5927", b.max || "\u221E", ")")), b.desc && /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-11)", color: "var(--tx-2)", marginTop: 4, lineHeight: 1.5, whiteSpace: "pre-wrap" } }, window.LBT_GLOSSARY_TEXT ? window.LBT_GLOSSARY_TEXT(b.desc, "人格固有バフ:" + p.name) : b.desc)))), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-10)", color: "var(--tx-mute)", marginTop: 6, lineHeight: 1.4, fontStyle: "italic" } }, "\u88C5\u5099\u4E2D\u30DA\u30F3\u30EB\u306E\u300C\u56FA\u6709\u30D0\u30D5\u30FB\u30B9\u30C6\u30FC\u30BF\u30B9\u2026\u300D\u306F\u88C5\u5099\u4E2D\u30DA\u30F3\u30EB\u306E\u300C\u56FA\u6709\u30D0\u30D5\u30FB\u30B9\u30C6\u30FC\u30BF\u30B9\u2026\u300D\u306F\u88C5\u5099\u3059\u308B\u3068 ", /* @__PURE__ */ React.createElement("b", { style: { color: "var(--gold)" } }, "\u30D1\u30C3\u30B7\u30D6"), " \u30DA\u30FC\u30B8\u306E\u300C\u56FA\u6709\u30D0\u30D5\u30FB\u30B9\u30C6\u30FC\u30BF\u30B9\u300D\u306B\u81EA\u52D5\u8FFD\u52A0\u3055\u308C\u307E\u3059")) : /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "detail-section-title", style: { color: "var(--tx-mute)" } }, "\u56FA\u6709\u30D0\u30D5 / UNIQUE"), /* @__PURE__ */ React.createElement("div", { style: { padding: "8px 10px", fontSize: "var(--fs-11)", color: "var(--tx-mute)", fontStyle: "italic", background: "var(--surface-inset)", border: "1px dashed var(--line-dim)", borderRadius: "var(--r)" } }, "\u3053\u306E\u4EBA\u683C\u306B\u56FA\u6709\u30D0\u30D5\u306FDB\u767B\u9332\u3055\u308C\u3066\u3044\u307E\u305B\u3093\u3002", /* @__PURE__ */ React.createElement("br", null), "\u5FC5\u8981\u306A\u5834\u5408\u306F\u88C5\u5099\u5F8C\u3001", /* @__PURE__ */ React.createElement("b", { style: { color: "var(--tx-dim)" } }, "\u30D1\u30C3\u30B7\u30D6"), " \u30DA\u30FC\u30B8\u304B\u3089\u624B\u52D5\u8FFD\u52A0\u3067\u304D\u307E\u3059\u3002"))), !embed && /* @__PURE__ */ React.createElement("div", { className: "detail-actions" }, isEquipped ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-10)", color: "var(--gold)", textAlign: "center", fontFamily: "var(--f-display)", letterSpacing: "0.2em", textTransform: "uppercase" } }, "\u2605 \u73FE\u5728\u88C5\u5099\u4E2D"), /* @__PURE__ */ React.createElement(Button, { variant: "ghost", size: "sm", onClick: onUnequip, icon: "x" }, "\u88C5\u5099\u89E3\u9664")) : /* @__PURE__ */ React.createElement(React.Fragment, null, isInRoster && /* @__PURE__ */ React.createElement(Button, { variant: "primary", onClick: onEquip, icon: "check" }, "\u88C5\u5099\u3059\u308B"), !isInRoster && acquireHow && onAcquireHowChange && /* @__PURE__ */ React.createElement(AcquireBarView, { state, kind: "persona", name: p.name, how: acquireHow, setHow: onAcquireHowChange, onAcquire }))));
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
  const saved = (state.roster?.personas || []).find((entry) => entry.mode === state.personaMode && String(entry.no) === String(state.personaNo))?.build;
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

function saveUnsavedCustomPersonaBeforeSwitch(state, dispatch) {
  if (state?.personaMode !== "custom" || !state.personaSrc) return true;
  const uid = String(state.personaNo ?? "");
  const alreadyOwned = (state.roster?.personas || []).some((entry) =>
    entry?.mode === "custom" && (String(entry.uid ?? "") === uid || String(entry.no ?? "") === uid)
  );
  if (alreadyOwned) return true;
  const confirmed = window.confirm([
    "現在のカスタム人格は所持リストへ未保存です。",
    "",
    "OK：現在の人格を保存して切り替える",
    "キャンセル：切り替えを中止して編集を続ける"
  ].join("\n"));
  if (!confirmed) return false;
  dispatch({ type: "SAVE_CUSTOM_PERSONA" });
  return true;
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
    dispatch({ type: state.personaMode === "custom" ? "SAVE_CUSTOM_PERSONA" : "SAVE_PERSONA_BUILD" });
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

/* 現在装備中の人格の所持レコード。no はグループ間で重複するため mode も見る。
   ここを「同じ mode の先頭」で済ませると、別人格の MAX が名前へ漏れる。 */
const findCurrentRosterPersona = (state) => (state?.roster?.personas || [])
  .find((persona) => persona.mode === state?.personaMode && String(persona.no) === String(state?.personaNo)) || null;

const EquippedSummary = ({ state, dispatch, onExpand, onShowDetail, detailShown, syncMaxControl, innateSlot }) => {
  const hasSavedBuild = !!state.roster?.personas?.some((r) => r.mode === state.personaMode && String(r.no) === String(state.personaNo) && r.build);
  const p = state.personaSrc;
  if (!p) return null;
  const primarySin = getPrimarySin(p);
  const isCustom = state.personaMode === "custom" || p.__custom;
  const isSynced = state.syncedManual;
  const isSavedCustom = isCustom && p.__saved;
  const editable = isSynced || isCustom && !isSavedCustom;
  const patchMeta = (patch) => dispatch({ type: "PATCH_PERSONA_META", patch });
  const rosterEntry = findCurrentRosterPersona(state);
  const displayPersonaName = rosterEntry?.syncMax && !/\s*\[MAX\]\s*$/i.test(p.name || "") ? `${p.name || ""} [MAX]` : p.name;
  const affiliation = decoratePersona(p).__aff;
  const RES_VALUES = ["普通", "脆弱", "弱点", "抵抗", "耐性", "免疫"];

  /* 設計方針（Kimi K3）:
     1 識別（誰か） → 2 戦闘値と耐性（数字） → 3 固有バフ（個性） → 4 キーワード → 操作。
     名前・PL・立ち絵・INITIATIVE・COLOR・共有画像は駒整形が所有するため、ここでは
     読み取り専用の識別表示だけを残し、編集 affordance は置かない。 */
  return /* @__PURE__ */ React.createElement("div", { className: "equipped-summary esc pc-persona", "data-editable": editable ? "1" : "0" },

    /* @__PURE__ */ React.createElement("div", { className: "es-body" },

      /* 識別: 名前の読み取り専用表示。編集は駒整形で行う。 */
      /* @__PURE__ */ React.createElement("div", { className: "es-idstripe" },
        /* @__PURE__ */ React.createElement("div", { className: "es-id-main" },
          /* @__PURE__ */ React.createElement("div", { className: "es-id-name", title: displayPersonaName }, displayPersonaName),
          /* @__PURE__ */ React.createElement("div", { className: "es-id-meta" },
            /* @__PURE__ */ React.createElement("span", { className: "es-label" }, isCustom ? "CUSTOM / 創作" : state.personaMode === "n" ? "NORMAL / 通常" : "SPECIAL / 特異"),
            primarySin && /* @__PURE__ */ React.createElement("span", { className: "es-id-sin" }, primarySin),
            affiliation && /* @__PURE__ */ React.createElement("span", { className: "es-id-affil" }, affiliation),
            !isCustom && /* @__PURE__ */ React.createElement("span", { className: "es-num" }, "No.", String(p.no).padStart(3, "0")),
            !editable && /* @__PURE__ */ React.createElement("span", { className: "es-id-editbadge" }, "閲覧中")
          )
        ),
        /* 同期ランクは rank/MAX の両方を担うため、名前の横に固定する。 */
        /* @__PURE__ */ React.createElement("div", { className: "es-id-sync" },
          /* @__PURE__ */ React.createElement("span", { className: "es-stat-label" }, "同期ランク"),
          syncMaxControl)
      ),

      /* 戦闘値と耐性: 判断に直結する数字を1つの帯にまとめる。 */
      /* @__PURE__ */ React.createElement("div", { className: "es-vitals" },
        React.createElement("div", { className: "es-stats" },
          [["HP", "hp", state.hp ?? p.hp], ["SAN", "san", state.san ?? p.san], ["速度", "speed", state.speed ?? p.speed], ["弾丸", "bullets", state.bullets || p.bullets || "×"]].map(([label, field, value]) =>
            /* @__PURE__ */ React.createElement("div", { key: field, className: "es-stat" },
              /* @__PURE__ */ React.createElement("span", { className: "es-stat-label" }, label),
              editable ? /* @__PURE__ */ React.createElement("input", { className: "es-stat-input", value: value, onChange: (e) => dispatch({ type: "SET_FIELD", field, value: e.target.value }), title: label + "（編集モード）" }) : /* @__PURE__ */ React.createElement("span", { className: "es-stat-value" }, value)
            )
          )
        ),
        /* 耐性とキーワードは同じ帯に置き、2枚の板を1枚にまとめる。 */
        /* @__PURE__ */ React.createElement("div", { className: "es-vitals-right" },
          React.createElement("section", { className: "es-resistance", role: "group", "aria-label": "耐性" },
          /* @__PURE__ */ React.createElement("div", { className: "es-resistance-heading" }, "耐性"),
          /* @__PURE__ */ React.createElement("div", { className: "es-resistance-grid" }, ["resS", "resP", "resB"].map((field, i) => {
            const label = ["斬撃", "貫通", "打撃"][i];
            const srcKey = ["res_slash", "res_pierce", "res_blunt"][i];
            const cur = state[field] ?? p[srcKey] ?? "普通";
            return /* @__PURE__ */ React.createElement("div", { key: field, className: "es-resistance-cell", "data-grade": cur },
              /* @__PURE__ */ React.createElement("span", { className: "es-resistance-label" }, label),
              editable ? /* @__PURE__ */ React.createElement("select", { className: "es-resistance-select", value: cur, onChange: (e) => dispatch({ type: "SET_FIELD", field, value: e.target.value }), title: label + "耐性（編集モード）", "aria-label": label + "耐性" }, RES_VALUES.map((r) => /* @__PURE__ */ React.createElement("option", { key: r, value: r }, r))) : /* @__PURE__ */ React.createElement("span", { className: "es-resistance-value" }, cur)
            );
          }))
        ),
          )
      ),

      /* 固有バフ: この人格を他の人格と分ける要素。 */
      innateSlot,

      /* キーワード: 最も低頻度のメタ。/actions の直上に留める。 */
      /* @__PURE__ */ React.createElement("div", { className: "es-keywords" },
        orderPersonaKeywordDisplay(state.personaSrc?.keywords).map((k) => /* @__PURE__ */ React.createElement("span", { key: k, className: "es-kw-tag" }, k, editable && /* @__PURE__ */ React.createElement("button", { className: "es-kw-rm", title: "このキーワードを削除", onClick: () => { const sourceKeywords = state.personaSrc.keywords || []; const targetIndex = sourceKeywords.indexOf(k); patchMeta({ src: { keywords: sourceKeywords.filter((_, j) => j !== targetIndex) } }); } }, "×"))),
        editable && /* @__PURE__ */ React.createElement("span", { className: "es-kw-addrow" },
          /* @__PURE__ */ React.createElement("select", { className: "es-kw-select", value: "", title: "既存キーワードから選択して追加", onChange: (e) => { const v = e.target.value; if (!v) return; const cur = state.personaSrc.keywords || []; if (cur.includes(v)) { toast("既に存在します"); return; } patchMeta({ src: { keywords: [...cur, v] } }); } }, /* @__PURE__ */ React.createElement("option", { value: "" }, "＋ 選択して追加…"),
            orderPersonaKeywordOptions([...(window.DB?.normal_personas || []), ...(window.DB?.tokui_personas || [])].flatMap((pp) => pp.keywords || []).concat(PERSONA_FIXED_KEYWORD_OPTIONS)).filter((k) => !(state.personaSrc.keywords || []).includes(k)).map((k) => /* @__PURE__ */ React.createElement("option", { key: k, value: k }, k))
          ),
          /* @__PURE__ */ React.createElement("button", { className: "es-kw-add", title: "任意のキーワードを手入力で追加", onClick: () => { const v = prompt("追加するキーワードを入力（既存一覧にない任意の語）:"); if (!v || !v.trim()) return; const cur = state.personaSrc.keywords || []; if (cur.includes(v.trim())) { toast("既に存在します"); return; } patchMeta({ src: { keywords: [...cur, v.trim()] } }); } }, "手入力")
        )
      )
    ),

    /* @__PURE__ */ React.createElement("div", { className: "es-actions" }, /* @__PURE__ */ React.createElement(
      Button,
      {
        size: "sm",
        variant: detailShown ? "primary" : "ghost",
        icon: detailShown ? "x" : "eye",
        onClick: () => onShowDetail(!detailShown),
        title: detailShown ? "簡易まとめを閉じる" : "装備中の効果を簡易まとめで表示する（Codexを開かなくても見られる）"
      },
      detailShown ? "簡易まとめを閉じる" : "簡易まとめを表示"
    ), isCustom && /* @__PURE__ */ React.createElement(
      Button,
      {
        size: "md",
        variant: "primary",
        className: "persona-save-primary",
        icon: "download",
        onClick: () => {
          dispatch({ type: "SAVE_CUSTOM_PERSONA" });
          toast(isSavedCustom ? "所持人格の内容を更新しました（装備モードへ移行）" : "所持人格一覧に保存しました（装備モードへ移行）");
        },
        title: "現在の編集内容を所持人格一覧に登録"
      },
      isSavedCustom ? "所持人格の保存内容を更新" : "この人格を所持に保存"
    ), /* @__PURE__ */ React.createElement(
      Button,
      {
        size: "sm",
        variant: isSynced ? "primary" : "secondary",
        className: "persona-edit-toggle",
        "aria-pressed": isSynced,
        icon: isSynced ? "check" : "edit",
        onClick: () => {
          if (isSynced) {
            dispatch({ type: "SET_SYNCED_MANUAL", value: false });
            toast("編集モードを終了しました。変更は装備解除時に保存を選べます");
          } else {
            dispatch({ type: "SET_SYNCED_MANUAL", value: true });
            toast(isSavedCustom ? "編集モード：保存済み人格を手動編集中" : "同期化：全項目を手動編集可能に");
          }
        },
        title: isSynced ? "編集モードを解除" : "同期化：ステータス・パッシブ・スキル・固有バフを手動で書き換え可能にする"
      },
      isSynced ? "✓ 編集を終了（内容は保持）" : "◈ 同期化して手動編集"
    ), /* @__PURE__ */ React.createElement(
      Button,
      {
        size: "sm",
        variant: "ghost",
        icon: "x",
        onClick: () => requestPersonaUnequip(state, dispatch),
        title: "装備を解除"
      },
      "装備解除"
    ), hasSavedBuild && /* @__PURE__ */ React.createElement(
      Button,
      {
        size: "sm",
        variant: "ghost",
        icon: "x",
        onClick: () => {
          if (!confirm("保存したビルドを破棄しますか？（次回装備時はDB既定値に戻ります。現在の編集は変わりません）")) return;
          dispatch({ type: "CLEAR_PERSONA_BUILD", key: `${state.personaMode}:${state.personaNo}` });
          toast("保存ビルドを破棄しました");
        },
        title: "保存ビルドを破棄してDB既定に戻す"
      },
      "保存を破棄"
    ), /* @__PURE__ */ React.createElement("div", { style: { flex: 1 } }), /* @__PURE__ */ React.createElement(
      Button,
      {
        size: "sm",
        icon: onExpand.expanded ? "chevronU" : "chevronD",
        className: "persona-list-toggle",
        onClick: onExpand.toggle,
        title: onExpand.expanded ? "一覧を折り畳む" : "別の人格を選ぶ (Codex を展開)"
      },
      onExpand.expanded ? "一覧を畳む" : "別の人格を選ぶ"
    )), /* @__PURE__ */ React.createElement("div", { className: "es-hint" }, isSynced ? "同期化モード：装備時点のデータを組んしています。" : "装備データを手動書き換えする場合は「◈ 同期化して手動編集」を押してください。"));
};
/* 駒整形（BASE INFO）。名前・PL・立ち絵・INITIATIVE・COLOR・共有シート画像を置く。
   HP/SAN/速度・耐性・キーワード・固有バフはビルドの人格タブが担当する。 */
const BaseInfoPanel = ({ state, dispatch }) => {
  const BaseSection = window.BaseSection;
  /* 名前・PL・立ち絵・INITIATIVE・COLOR はキャラクター自身の設定で、人格とは
     独立している。ここで人格未装備を理由に null を返すと、キャラクターを作る
     前の段階で駒整机を触れなくなり、「人格を選んでから名前をつける」順序になる。 */
  if (!BaseSection) return null;
  return /* @__PURE__ */ React.createElement("div", { className: "base-info-panel" },
    /* @__PURE__ */ React.createElement(BaseSection, { state, dispatch })
  );
};

const BaseInfoWorkspace = ({ state, dispatch }) => {
  const h = React.createElement;
  const equipped = !!state.personaSrc;
  return h("div", { className: "baseinfo-workspace" },
    /* 名前・PL・立ち絵・INITIATIVE・COLOR は人格と無関係なので、常に開ける。
       人格が無くてもここでキャラクターを組み立ててから人格を選べる。 */
    h("div", { className: "equipped-unified" }, h(BaseInfoPanel, { state, dispatch })),
    !equipped && h("p", { className: "ledger-note", style: { marginTop: "var(--s-2)" } },
      "人格は未装備です。上の名前・PL・立ち絵・INITIATIVE・COLOR は人格と無関係なので、先にここで整えてからビルドの人格タブで人格を選んでください。"),
    /* 組み立て設定（ステータス一覧・ラベル一覧）はここが唯一の場所。
       人格と無関係なので、人格が装備されていなくても開ける。 */
    typeof window.LBT_BuildParamsPanel === "function" ? window.LBT_BuildParamsPanel({ state, dispatch }) : null
  );
};
function buildEquippedDetailPersona(state) {
  const src = state.personaSrc;
  if (!src) return null;
  // state 側は「未タッチ=undefined / タッチ済み=空文字を含む実値」の2値運用。
  // 空文字もユーザー編集結果として尊重し、src へのフォールバックは未タッチ時のみに限定する。
  const pick = (v, fallback) => (v === void 0 || v === null ? fallback : v);
  return {
    ...src,
    // Custom roster identity lives in personaNo; source.no may be the shared placeholder 999.
    no: state.personaMode === "custom" ? state.personaNo : src.no,
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
    extra_passives: (state.extraPassives || []).map((p) => ({
      name: p.name || "", cond: p.cond || "", always: p.always || "", effect: p.effect || ""
    })),
    keywords: Array.isArray(src.keywords) ? src.keywords.slice() : []
  };
}
function resolvePersonaDisplayName(entry, sourceName) {
  const displayName = String(entry?.displayName || "").trim();
  const savedName = String(sourceName || "").trim();
  if (!displayName) return savedName;
  if (!savedName) return displayName;
  /* account import can carry an older roster displayName and a newer saved build.
     PATCH_PERSONA_META updates entry.updatedAt; SAVE_PERSONA_BUILD updates build.savedAt.
     Prefer whichever name record is newer, while keeping displayName authoritative on ties. */
  const displayUpdatedAt = Number(entry?.updatedAt) || 0;
  const buildSavedAt = Number(entry?.build?.savedAt) || 0;
  return buildSavedAt > displayUpdatedAt ? savedName : displayName;
}
function buildRosterDetailPersona(entry, fallback) {
  const build = entry?.build;
  if (!build) {
    if (!fallback) return fallback;
    const resolvedName = resolvePersonaDisplayName(entry, fallback.name);
    const persona = resolvedName === fallback.name ? fallback : { ...fallback, name: resolvedName };
    // Keep custom rows keyed by their roster UID, even when their source uses no=999.
    return entry?.mode === "custom" ? { ...persona, no: entry.no } : persona;
  }
  const source = build.personaSrc && typeof build.personaSrc === "object" ? build.personaSrc : {};
  const persona = { ...fallback, ...source, no: entry?.mode === "custom" ? entry.no : fallback?.no };
  return {
    ...persona,
    hp: build.hp ?? persona.hp,
    san: build.san ?? persona.san,
    speed: build.speed ?? persona.speed,
    bullets: build.bullets ?? persona.bullets,
    res_slash: build.resS ?? persona.res_slash,
    res_pierce: build.resP ?? persona.res_pierce,
    res_blunt: build.resB ?? persona.res_blunt,
    passive_name: build.pas?.name ?? persona.passive_name,
    passive_cond: build.pas?.cond ?? persona.passive_cond,
    passive_always: build.pas?.always ?? persona.passive_always,
    passive_effect: build.pas?.effect ?? persona.passive_effect,
    name: resolvePersonaDisplayName(entry, persona.name),
    skills: Array.isArray(build.skills) ? build.skills : persona.skills,
    unique_buffs: Array.isArray(build.uniqueBuffs) ? build.uniqueBuffs : persona.unique_buffs,
    extra_passives: Array.isArray(build.extraPassives) ? build.extraPassives.map((p) => ({
      name: p.name || "", cond: p.cond || "", always: p.always || "", effect: p.effect || ""
    })) : (persona.extra_passives || []),
    keywords: Array.isArray(source.keywords) ? source.keywords.slice() : (persona.keywords || [])
  };
}
function resolveSelectedPersonaFromPool(pool, selectedPersona, selectedMode) {
  if (!selectedPersona || !Array.isArray(pool)) return selectedPersona || null;
  const selectedNo = String(selectedPersona.no ?? "");
  const matched = pool.find((entry) => entry?.mode === selectedMode
    && String(entry?.p?.no ?? "") === selectedNo);
  return matched?.p || selectedPersona;
}
function resolvePersonaCodexEntry(entry, fallback, state) {
  const isEquipped = Boolean(state?.personaSrc)
    && String(state.personaMode) === String(entry?.mode)
    && String(state.personaNo) === String(entry?.no);
  return isEquipped ? buildEquippedDetailPersona(state) : buildRosterDetailPersona(entry, fallback);
}
if (typeof window !== "undefined") {
  window.LBT_buildEquippedDetailPersona = buildEquippedDetailPersona;
  window.LBT_resolvePersonaCodexEntry = resolvePersonaCodexEntry;
  window.LBT_resolvePersonaDisplayName = resolvePersonaDisplayName;
  window.LBT_resolveSelectedPersonaFromPool = resolveSelectedPersonaFromPool;
}
const SyncMaxControl = ({ state, dispatch }) => {
  const entry = findCurrentRosterPersona(state);
  if (!state.personaSrc || !entry) return null;
  const syncRank = ["0", "00", "000"].includes(entry.syncRank) ? entry.syncRank : null;
  const toggle = (checked) => {
    if (!checked) {
      dispatch({ type: "APPLY_PERSONA_SYNC", uid: entry.uid, syncMax: false });
      return;
    }
    const persona = (entry.mode === "t" ? window.DB?.tokui_personas || [] : window.DB?.normal_personas || [])
      .find((p) => String(p.no) === String(entry.no));
    const cost = window.LBT_operationCost?.("syncMax", { ...persona, no: entry.no }, window.DB) || null;
    const bal = window.LBT_computeLedgerBalance?.(state.results, state.entries);
    if (cost && bal && Number(bal.shards) < Number(cost.shards)) {
      toast(`自我の欠片が足りません（必要 ${cost.shards} / 手持ち ${bal.shards}）`);
      return;
    }
    dispatch({ type: "APPLY_PERSONA_SYNC", uid: entry.uid, syncMax: true });
  };
  /* MAX は HP/SAN の手編集モードとは別の保守操作。所持していれば DB 人格でも
     設定・解除できる（所持詳細のトグルと同じ扱い）。 */
  return React.createElement("section", { className: `es-sync-max-control${entry.syncMax ? " is-on" : ""}`, "aria-label": "同期状態" },
    React.createElement("div", { className: "es-sync-max-status" },
      React.createElement("span", { className: "es-sync-max-kicker" }, "SYNC STATUS / 同期状態"),
      React.createElement("span", { className: "es-sync-max-rank" }, syncRank ? `同期${syncRank}` : "同期ランク未設定"),
      entry.syncMax && React.createElement("span", { className: "es-sync-max-badge" }, "[MAX]")
    ),
    React.createElement("label", { className: "es-sync-max-toggle", title: "同期MAXを設定・解除" },
      React.createElement("input", { type: "checkbox", checked: entry.syncMax === true, onChange: (event) => toggle(event.target.checked) }),
      React.createElement("span", { className: "es-sync-max-label" }, "同期MAXとして設定"),
    ),
    React.createElement("span", { className: "es-sync-max-note" }, "同期ランクとは別・名称と共有に [MAX] を反映")
  );
};
const normalizeDraftAffiliationName = (value) => String(value || "").normalize("NFKC").replace(/[「」『』【】\[\]()（）\s　・]/g, "").toLowerCase();
const findDraftAffiliationCandidates = (name, options) => {
  const normalized = normalizeDraftAffiliationName(name);
  if (!normalized) return [];
  return (options || []).filter((entry) => normalizeDraftAffiliationName(entry.name) === normalized);
};
const PersonaDraftImportDialog = ({ draftText, draftSections, draftInputMode, draftResult, draftSyncMax, draftSyncMaxLocked, draftAffiliationKey, draftAffiliationQuery, autoAffiliationKey, affiliationOptions, onChange, onSectionsChange, onInputModeChange, onAnalyze, onSyncMaxChange, onAffiliationChange, onAffiliationQueryChange, onApply, onClose }) => {
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
        h("button", { className: `btn ${draftInputMode === "raw" ? "btn--primary" : "btn--secondary"}`, type: "button", role: "tab", "aria-selected": draftInputMode === "raw", onClick: () => onInputModeChange("raw") }, "一括テキストを貼り付け"),
        h("button", { className: `btn ${draftInputMode === "garasumado" ? "btn--primary" : "btn--secondary"}`, type: "button", role: "tab", "aria-selected": draftInputMode === "garasumado", onClick: () => onInputModeChange("garasumado") }, "硝子窓URLから移行")),
      draftInputMode === "sections" ? h("div", { className: "persona-draft-sections" },
        section("name", "人格名（任意）", "空欄でも反映可。既存人格へ同期帰属する場合は、下部で手動選択できます。", "黒雲会組員 または 人格名：「黒雲会組員」"),
        section("status", "ステータス・パッシブ（任意）", "HP・SAN・速度・耐性・弾丸と、パッシブ名・発動条件・常時効果・効果をまとめて入力。", "HP:160　SAN：55　速度:1d5＋2\n斬撃：普通 貫通：抵抗 打撃：弱点\nパッシブ名：固有パッシブ\n発動条件：傲慢x3保有\n効果：..."),
        section("skills", "戦術スキル一覧", "0： / 0-2： / ０－２： / 【戦術スキル1】のいずれも可。", "０－２：\nスキル名\n斬撃:傲慢\n2d9：的中時、..."),
        section("uniques", "固有一覧（明示登録）", "正式な固有見出しがなくても、指令などをここへ入力すると固有一覧へ登録。", "[指令] 最大1 中立バフ\n説明\n[指令の加護] 最大9 バフ\n説明")) :
        draftInputMode === "garasumado" ? h("div", { className: "persona-draft-garasumado" },
          h("p", { className: "persona-draft-garasumado-lead" }, "公開人格（/persona/view/）と公開キャラクターシート（/view/）の人格部分に対応します。名称は省略せず、本文からキーワードを補完します。PC名・PL名などの基本情報は変更しません。所有者、メモ、チャットパレット、強化一覧は移行しません。"),
          h("label", { className: "persona-draft-garasumado-label", htmlFor: "persona-draft-garasumado-url" }, "硝子窓の公開人格URL"),
          h("textarea", { id: "persona-draft-garasumado-url", className: "persona-draft-import-text persona-draft-garasumado-url", value: draftText, onChange: (event) => onChange(event.target.value), placeholder: "https://lbt-garasumado.vercel.app/persona/view/7bLdY187iD7AteytkyYe", autoFocus: true }),
          h("p", { className: "persona-draft-garasumado-help" }, "解析後は内容を確認し、必要に応じて同期元を検索してから反映します。非公開URL・別サイトのURLは反映しません。")) :
        h("textarea", { className: "persona-draft-import-text", value: draftText, onChange: (event) => onChange(event.target.value), placeholder: "表記は多少異なっても読み込みます\n人格 名：「完成人格」\nHP:160　SAN：55　速度:1d5＋2\nパッシブ名：...\n０－２：スキル名\n斬撃:傲慢\n2d9：的中時、...\n\n【戦術スキル１】・0：・0-2：も対応\n※必須項目の不足や文章型速度は修正が必要です", autoFocus: true }),
      h("div", { className: "persona-draft-import-actions" },
        h("button", { className: "btn btn--secondary", type: "button", onClick: onAnalyze, disabled: !hasInput }, draftInputMode === "garasumado" ? "公開人格を解析" : "解析する"),
        draftResult?.ok && h("label", { className: `persona-draft-max-option${draftSyncMaxLocked ? " is-locked" : ""}`, title: draftSyncMaxLocked ? "この人格は既に同期MAXです。解除は人格詳細の同期MAXトグルから行えます。" : void 0 },
          h("input", { type: "checkbox", checked: draftSyncMax, disabled: draftSyncMaxLocked, onChange: (event) => onSyncMaxChange(event.target.checked) }),
          draftSyncMaxLocked ? "同期MAX（解除は人格詳細から）" : "同期MAXとして作成"),
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
          draftResult.source?.kind === "garasumado" && h("div", { className: "persona-draft-result-meta" }, "移行元：硝子窓の公開人格（所有者・メモ・チャットパレット・強化一覧は移行しません）"),
          h("div", { className: "persona-draft-result-meta" }, `HP ${draftResult.persona.hp} / SAN ${draftResult.persona.san} / 速度 ${draftResult.persona.speed} / 弾丸 ${draftResult.persona.bullets}`),
          h("div", { className: "persona-draft-result-meta" }, `戦術スキル ${draftResult.summary.skillCount}件 / パッシブ ${draftResult.summary.passiveCount}件 / 固有 ${draftResult.summary.buffCount}件`),
          h("div", { className: "persona-draft-result-meta" }, `本文から検出したキーワード：${(draftResult.persona.keywords || []).join(" / ") || "なし"}`),
          h("div", { className: "persona-draft-result-meta" }, `反映対象: ${[draftResult.provided?.name && "人格名", (draftResult.provided?.hp || draftResult.provided?.san || draftResult.provided?.speed || draftResult.provided?.passives) && "ステータス・パッシブ", draftResult.provided?.skills && "戦術スキル", draftResult.provided?.uniques && "固有"].filter(Boolean).join(" / ") || "なし"}`)),
        (draftResult.errors || []).map((message, index) => h("p", { key: `error-${index}`, className: "persona-draft-message is-error" }, message)),
        (draftResult.warnings || []).map((message, index) => h("p", { key: `warning-${index}`, className: "persona-draft-message is-warning" }, message)))));
};
const PersonaCodex = ({ state, dispatch, ownedOnly = false }) => {
  /* ビルド側の人格タブは既定で「所持して装備するもの」だけを出す。
     これはロックではなく、未所持を探したいときのために解除できる。 */
  const [showAll, setShowAll] = React.useState(false);
  const gated = ownedOnly && !showAll;

  /* 枠（通常人格/特異人格）の解決は roster-resolver の resolvePersonaMode に任せる。
     no はグループ間で重複する（no=30 は通常人格の「南部リウ協会4課フィクサー」と
     特異人格の「LCAウアジェト 先鋒三隊隊長」の両方にある）。no だけで決めると
     特異人格を通常人格と誤認し、獲得した内容が別の人格の名前で入ってしまう。 */
  const personaModeFor = (persona) => window.LBT_resolvePersonaMode?.(persona) || "n";

  const personaPurchaseBlocked = (persona, mode) => (mode === "t" ? "特異人格は抽出しでのみ入手できます" : null);
  /* カード内購入。詳細ポップオーバーを開かずに獲得を完結させる。 */

  /* 所持ゲートの解除。解除すると全DBから選べるので、未所持を探索できる。 */
  const ownedGateOpen = showAll;

  const [acquireHow, setAcquireHow] = React.useState("purchase");
  const resolveAcquireCost = (kind, how, context) => (window.LBT_resolveAcquireCost ? window.LBT_resolveAcquireCost(kind, how, context) : { lp: 0, shards: 0, label: "無料" });
  const acquirePersona = (persona) => {
    const personaMode = personaModeFor(persona);
    /* 所持済みの再獲得は二重計上と嘘のトーストになるので断る。
       reducer と同じ mode:no の一意キーで判定する。 */
    if ((state.roster?.personas || []).some((r) => `${r.mode}:${r.no}` === `${personaMode}:${persona.no}`)) {
      toast(`『${persona.name}』は既に所持しています`);
      return;
    }
    /* 指定購入は通常人格だけ。特異人格は抽出のみ。 */
    const blocked = acquireHow === "purchase" ? personaPurchaseBlocked(persona, personaMode) : null;
    if (blocked) { toast(blocked); return; }
    const cost = resolveAcquireCost("persona", acquireHow, { name: persona.name, ownsPersona: (state.roster?.personas || []).length > 0 });
    dispatch({ type: "ADD_ROSTER", mode: personaMode, no: persona.no, purchase: true, cost: { lp: cost.lp || 0, shards: cost.shards || 0 } });
    toast(`${persona.name} を獲得しました（${cost.label}）`);
  };


  const { ui, personaMode, personaNo, favorites, historyRecent, roster } = state;
  const mode = gated ? "roster" : ui.codexMode || "n";
  const [selectedPersona, setSelectedPersona] = React.useState(null);
  const [selectedPersonaMode, setSelectedPersonaMode] = React.useState(null);
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
    if (!selectedPersona && state.personaSrc) setSelectedPersona(null);
  }, []);
  const pool = React.useMemo(() => {
    const resolveOwnedEntry = (entry, fallback) => ({ p: resolvePersonaCodexEntry(entry, fallback, state), mode: entry.mode, roster: entry });
    const resolveCatalogEntry = (persona, personaMode) => {
      const entry = roster.personas.find((owned) => owned.mode === personaMode && String(owned.no) === String(persona.no));
      return entry ? resolveOwnedEntry(entry, persona) : { p: persona, mode: personaMode };
    };
    const resolveKey = (key) => {
      const [personaMode, ...rest] = key.split(":");
      const no = rest.join(":");
      if (personaMode === "custom") {
        const entry = roster.personas.find((owned) => owned.mode === "custom" && (String(owned.uid) === no || String(owned.no) === no));
        return entry ? resolveOwnedEntry(entry, entry.src || entry.build?.personaSrc || null) : null;
      }
      const source = personaMode === "n" ? DB.normal_personas : DB.tokui_personas;
      const found = source.find((persona) => String(persona.no) === no);
      return found ? resolveCatalogEntry(found, personaMode) : null;
    };
    if (mode === "n") return DB.normal_personas.map((p) => resolveCatalogEntry(p, "n"));
    if (mode === "t") return DB.tokui_personas.map((p) => resolveCatalogEntry(p, "t"));
    if (mode === "fav") return favorites.map(resolveKey).filter(Boolean);
    if (mode === "history") return historyRecent.map(resolveKey).filter(Boolean);
    if (mode === "roster") return roster.personas.map((entry) => {
      if (entry.mode === "custom") {
        const fallback = entry.src || entry.build?.personaSrc || null;
        return fallback ? resolveOwnedEntry(entry, fallback) : null;
      }
      const source = entry.mode === "n" ? DB.normal_personas : DB.tokui_personas;
      const fallback = source.find((p) => String(p.no) === String(entry.no));
      return fallback ? resolveOwnedEntry(entry, fallback) : null;
    }).filter(Boolean);
    return [];
  }, [mode, favorites, historyRecent, roster, state]);
  const selectedPersonaView = resolveSelectedPersonaFromPool(pool, selectedPersona, selectedPersonaMode);
  React.useEffect(() => {
    if (selectedPersonaView && selectedPersonaView !== selectedPersona) setSelectedPersona(selectedPersonaView);
  }, [selectedPersonaView, selectedPersona]);
  // ★/履歴のバッジ件数は、実際に表示できる件数と一致させる。
  // 解決できないキー（例: 削除済みロスターの custom）を含めて数えると
  // 「★3 なのに一覧が2件」のような不一致が起きる。
  const favCount = React.useMemo(() => favorites.filter((k) => {
    const [m, no] = k.split(":");
    if (m === "custom") return roster.personas.some((r) => r.mode === "custom" && (String(r.uid) === String(no) || String(r.no) === String(no)));
    const src = m === "n" ? DB.normal_personas : DB.tokui_personas;
    return src.some((x) => x.no === parseInt(no));
  }).length, [favorites, roster.personas]);
  const historyCount = React.useMemo(() => historyRecent.filter((k) => {
    const [m, no] = k.split(":");
    if (m === "custom") return roster.personas.some((r) => r.mode === "custom" && (String(r.uid) === String(no) || String(r.no) === String(no)));
    const src = m === "n" ? DB.normal_personas : DB.tokui_personas;
    return src.some((x) => x.no === parseInt(no));
  }).length, [historyRecent, roster.personas]);
  const draftAffiliationOptions = React.useMemo(() => [
    ...(DB.normal_personas || []).map((persona) => ({ key: `n:${persona.no}`, mode: "n", no: persona.no, name: persona.name, label: `通常 · No.${String(persona.no).padStart(3, "0")} · ${persona.name}` })),
    ...(DB.tokui_personas || []).map((persona) => ({ key: `t:${persona.no}`, mode: "t", no: persona.no, name: persona.name, label: `特異 · No.${String(persona.no).padStart(3, "0")} · ${persona.name}` }))
  ], []);
  const draftAffiliationCandidates = React.useMemo(() => findDraftAffiliationCandidates(draftResult?.persona?.name, draftAffiliationOptions), [draftResult, draftAffiliationOptions]);
  const draftAutoAffiliationKey = draftAffiliationCandidates.length === 1 ? draftAffiliationCandidates[0].key : "";
  const draftSyncMaxLocked = React.useMemo(() => {
    const option = draftAffiliationOptions.find((entry) => entry.key === draftAffiliationKey);
    if (!option) return false;
    return (roster.personas || []).some((entry) => entry.mode === option.mode && String(entry.no) === String(option.no) && entry.syncMax === true);
  }, [draftAffiliationKey, draftAffiliationOptions, roster.personas]);
  const affiliations = React.useMemo(() => {
    const set = /* @__PURE__ */ new Set();
    pool.forEach(({ p }) => { const aff = decoratePersona(p).__aff; if (aff) set.add(aff); });
    (ui.filterAffs || []).forEach((aff) => { if (aff) set.add(aff); });
    return Array.from(set).sort();
  }, [pool, ui.filterAffs]);
  const keywordCounts = React.useMemo(() => {
    const counts = new Map();
    pool.forEach(({ p }) => {
      const tags = new Set(p.keywords || []);
      const hasBullets = !!(p.bullets && p.bullets !== "×" && p.bullets !== "x" && p.bullets !== "X");
      if (hasBullets) tags.add("弾丸");
      tags.forEach((keyword) => counts.set(keyword, (counts.get(keyword) || 0) + 1));
    });
    PERSONA_FIXED_KEYWORD_OPTIONS.forEach((keyword) => counts.set(keyword, counts.get(keyword) || 0));
    // Keep a previously selected tag visible when switching to a list with zero matches.
    (ui.filterKws || []).forEach((keyword) => counts.set(keyword, counts.get(keyword) || 0));
    return counts;
  }, [pool, ui.filterKws]);
  // The source list is independent of the PDF status list length: custom and one-off tags stay filterable.
  const allKws = React.useMemo(() => orderPersonaKeywordOptions(Array.from(keywordCounts.keys())), [keywordCounts]);
  const countKeywordInPool = (keyword) => keywordCounts.get(keyword) || 0;
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
        const matchedSins = ui.filterSins.filter((s) => sinSet.has(s)).length;
        if (ui.filterMatch === "all" ? matchedSins !== ui.filterSins.length : matchedSins === 0) return false;
      }
      if (ui.filterKws.length) {
        const kws = new Set(p.keywords || []);
        const hasBullets = !!(p.bullets && p.bullets !== "×" && p.bullets !== "x" && p.bullets !== "X");
        const matchedKeywords = ui.filterKws.filter((k) => k === "弾丸" ? hasBullets : kws.has(k)).length;
        if (ui.filterMatch === "all" ? matchedKeywords !== ui.filterKws.length : matchedKeywords === 0) return false;
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
  const toggleAff = (aff) => {
    const list = ui.filterAffs.includes(aff) ? ui.filterAffs.filter((x) => x !== aff) : [...ui.filterAffs, aff];
    dispatch({ type: "SET_UI", ui: { filterAffs: list } });
  };
  const resetFilters = () => dispatch({ type: "SET_UI", ui: {
    filterSins: [],
    filterKws: [],
    filterAffs: [],
    searchQuery: "",
    filterResS: "",
    filterResP: "",
    filterResB: "",
    filterOwnedOnly: false,
    filterMatch: "any",
    rosterBuildFilter: "all"
  } });
  const getFocusScroller = () => document.querySelector("main.focus");
  const scrollIntoFocus = (target, block = "start") => {
    if (!target) return;
    const behavior = scrollBehavior();
    // まずブラウザーに実際のスクロール祖先を解決させる。レイアウトが画面幅で変わるPC・モバイル双方に自然に追従する。
    target.scrollIntoView({ behavior, block, inline: "nearest" });
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
      scroller.scrollTo({ top: Math.max(0, targetTop - offset), behavior });
    }, 140);
  };
  React.useEffect(() => {
    if (!pendingDetailFocusRef.current || !selectedPersona) return;
    const timer = window.setTimeout(() => {
      const detail = document.getElementById("persona-selected-detail");
      if (!detail) return;
      pendingDetailFocusRef.current = false;
      scrollIntoFocus(detail, "nearest");
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
        getFocusScroller()?.scrollTo({ top: 0, behavior: scrollBehavior() });
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
    if (!saveUnsavedCustomPersonaBeforeSwitch(state, dispatch)) return;
    // 参照比較は、roster詳細パネルや再装備時の clone で同一人格を別参照として
    // 見逃す。名前とNoで照合し、それでも解決しないカスタム人格は __custom
    // フラグで確定する。フォールバックで現在タブのモードを使うと、
    // DBに存在しない No.999 の通常人格といった幽霊エントリが生まれる。
    const meta = pool.find((x) => x.p === p) || pool.find((x) => x.p?.no === p?.no && x.p?.name === p?.name);
    const m = meta?.mode || (p.__custom ? "custom" : mode);
    dispatch({ type: "EQUIP_PERSONA", mode: m, no: p.no, src: p });
    dispatch({ type: "SET_UI", ui: { codexExpanded: false } });
    setShowEquippedDetail(false);
    setTimeout(() => {
      const focusEl = document.querySelector("main.focus");
      if (focusEl) {
        focusEl.scrollTo({ top: 0, behavior: scrollBehavior() });
      }
    }, 20);
    toast(`\u300E${p.name}\u300F\u3092\u88C5\u5099`);
  };
const addRoster = (p) => {
    const m = pool.find((x) => x.p === p)?.mode || mode;
    /* 既に所持なら「追加した」と嘘をつくので在这里で止める。 */
    if ((roster.personas || []).some((r) => `${r.mode}:${r.no}` === `${m}:${p.no}`)) {
      toast(`『${p.name}』は既に所持しています`);
      return;
    }
    /* 指定購入は通常人格だけ。特異人格は抽出のみ（core P203）。 */
    const blocked = acquireHow === "purchase" ? personaPurchaseBlocked(p, m) : null;
    if (blocked) { toast(blocked); return; }
    const cost = resolveAcquireCost("persona", acquireHow, { name: p.name, ownsPersona: (roster.personas || []).length > 0 });
    dispatch({ type: "ADD_ROSTER", mode: m, no: p.no, purchase: true, cost: { lp: cost.lp || 0, shards: cost.shards || 0 } });
    toast("所持リストへ追加");
  };
  const unequip = () => {
    dispatch({ type: "UNEQUIP_PERSONA" });
    toast("\u88C5\u5099\u3092\u89E3\u9664");
  };
  const toggleFav = (m, no) => dispatch({ type: "TOGGLE_FAV", mode: m, no });
  const currentMeta = pool.find((x) => x.mode === selectedPersonaMode && String(x.p.no) === String(selectedPersona?.no));
  const currentMode = currentMeta?.mode || selectedPersonaMode || mode;
  const currentIsEquipped = String(personaNo) === String(selectedPersonaView?.no) && personaMode === currentMode;
  const currentIsInRoster = selectedPersonaView && roster.personas.some((r) => String(r.no) === String(selectedPersonaView.no) && r.mode === currentMode);
  const currentIsFav = selectedPersonaView && favorites.includes(`${currentMode}:${selectedPersonaView.no}`);
  const modes = [
    { value: "n", label: "\u901A\u5E38", count: DB.normal_personas.length },
    { value: "t", label: "\u7279\u7570", count: DB.tokui_personas.length },
    { value: "roster", label: "\u6240\u6301", count: roster.personas.length },
    { value: "fav", label: "\u2605", count: favCount },
    { value: "history", label: "\u5C65\u6B74", count: historyCount }
  ];
  const equipCustom = () => {
    const name = prompt("\u30AB\u30B9\u30BF\u30E0\u4EBA\u683C\u306E\u540D\u524D\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044\uFF08\u5F8C\u304B\u3089\u5168\u9805\u76EE\u3092\u7DE8\u96C6\u53EF\u80FD\uFF09", "\u5275\u4F5C\u4EBA\u683C");
    if (!name) return;
    if (!saveUnsavedCustomPersonaBeforeSwitch(state, dispatch)) return;
    dispatch({ type: "EQUIP_CUSTOM_PERSONA", name });
    dispatch({ type: "SET_UI", ui: { codexExpanded: false } });
    setShowEquippedDetail(false);
    setTimeout(() => {
      const focusEl = document.querySelector("main.focus");
      if (focusEl) focusEl.scrollTo({ top: 0, behavior: scrollBehavior() });
    }, 20);
    toast(`\u30AB\u30B9\u30BF\u30E0\u4EBA\u683C\u300E${name}\u300F\u3092\u88C5\u5099`);
  };
  const chooseDraftAffiliation = (key) => {
    setDraftAffiliationKey(key);
    const option = draftAffiliationOptions.find((entry) => entry.key === key);
    const existing = option ? (roster.personas || []).find((entry) => entry.mode === option.mode && String(entry.no) === String(option.no)) : null;
    setDraftSyncMax(existing?.syncMax === true || !!draftResult?.suggestSyncMax);
  };
  const analyzeDraft = async () => {
    const result = (draftInputMode === "garasumado" ? await window.LBT_fetchGarasumadoPersona?.(draftText) : (draftInputMode === "sections" ? window.LBT_parsePersonaDraftSections?.(draftSections) : window.LBT_parsePersonaDraft?.(draftText))) || { ok: false, errors: ["草案解析器を読み込めませんでした。ページを再読み込みしてください。"], warnings: [] };
    const candidates = result.ok ? findDraftAffiliationCandidates(result.persona?.name, draftAffiliationOptions) : [];
    const candidate = candidates.length === 1 ? candidates[0] : null;
    const existing = candidate ? (roster.personas || []).find((entry) => entry.mode === candidate.mode && String(entry.no) === String(candidate.no)) : null;
    setDraftResult(result);
    setDraftSyncMax(existing?.syncMax === true || !!result.suggestSyncMax);
    setDraftAffiliationKey(candidate?.key || "");
    setDraftAffiliationQuery("");
  };
  const applyDraft = () => {
    if (!draftResult?.ok) return;
    if (!saveUnsavedCustomPersonaBeforeSwitch(state, dispatch)) return;
    const affiliation = draftAffiliationOptions.find((entry) => entry.key === draftAffiliationKey) || null;
    const existing = affiliation ? (roster.personas || []).find((entry) => entry.mode === affiliation.mode && String(entry.no) === String(affiliation.no)) : null;
    const draftRank = ["0", "00", "000"].includes(draftResult.syncRank) ? draftResult.syncRank : null;
    const existingRank = String(existing?.syncRank || "") || null;
    const wantRank = draftRank && String(draftRank).length > String(existingRank || "").length ? draftRank : (existingRank || draftRank);
    const wantMax = draftSyncMax || existing?.syncMax === true;
    const wasSynced = Boolean(existing && (existing.syncRank || existing.syncMax === true || existing.synced === true));
    const maxJustOn = wantMax === true && existing?.syncMax !== true;
    const syncJustOn = !wasSynced && (Boolean(wantRank) || wantMax === true);
    const op = maxJustOn ? "syncMax" : (syncJustOn ? "sync" : null);
    const persona = affiliation ? (affiliation.mode === "t" ? DB.tokui_personas || [] : DB.normal_personas || []).find((entry) => String(entry.no) === String(affiliation.no)) : null;
    const cost = op ? window.LBT_operationCost?.(op, { ...persona, no: affiliation?.no }, window.DB) : null;
    const bal = cost ? window.LBT_computeLedgerBalance?.(state.results, state.entries) : null;
    const short = !!(cost && bal && Number(bal.shards) < Number(cost.shards));
    dispatch({
      type: "IMPORT_PERSONA_DRAFT",
      persona: draftResult.persona,
      secondaryPassive: draftResult.secondaryPassive,
      provided: draftResult.provided,
      syncRank: short ? existingRank : draftResult.syncRank,
      syncMax: short ? existing?.syncMax === true : draftSyncMax,
      affiliation: affiliation ? { mode: affiliation.mode, no: affiliation.no } : null
    });
    dispatch({ type: "SET_UI", ui: { codexExpanded: false } });
    setShowEquippedDetail(false);
    setDraftImportOpen(false);
    setDraftText("");
    setDraftSections({ name: "", status: "", skills: "", uniques: "" });
    setDraftResult(null);
    setDraftAffiliationKey("");
    setDraftAffiliationQuery("");
    toast(short
      ? "草案を反映しました（自我の欠片が足りないため同期は未設定）"
      : (affiliation ? `草案を『${affiliation.name}』の同期人格として反映` : `草案人格『${draftResult.persona.name}』を編集中として装備`), short ? "assertive" : void 0);
    setTimeout(() => document.querySelector("main.focus")?.scrollTo({ top: 0, behavior: scrollBehavior() }), 20);
  };
  const hasActiveFilters = ui.filterSins.length || ui.filterKws.length || ui.filterAffs.length || ui.searchQuery || ui.filterResS || ui.filterResP || ui.filterResB || ui.filterOwnedOnly || (mode === "roster" && ui.rosterBuildFilter && ui.rosterBuildFilter !== "all");
  const equippedPersona = state.personaSrc;
  const equippedDetailPersona = buildEquippedDetailPersona(state);
  const equippedMeta = equippedPersona ? { p: equippedPersona, mode: state.personaMode || "n" } : null;
  return /* @__PURE__ */ React.createElement(React.Fragment, null, draftImportOpen && /* @__PURE__ */ React.createElement(PersonaDraftImportDialog, { draftText, draftSections, draftInputMode, draftResult, draftSyncMax, draftSyncMaxLocked, draftAffiliationKey, draftAffiliationQuery, autoAffiliationKey: draftAutoAffiliationKey, affiliationOptions: draftAffiliationOptions, onChange: (value) => { setDraftText(value); setDraftResult(null); setDraftAffiliationKey(""); setDraftAffiliationQuery(""); }, onSectionsChange: (key, value) => { setDraftSections((current) => ({ ...current, [key]: value })); setDraftResult(null); setDraftAffiliationKey(""); setDraftAffiliationQuery(""); }, onInputModeChange: (modeValue) => { setDraftInputMode(modeValue); setDraftResult(null); setDraftAffiliationKey(""); setDraftAffiliationQuery(""); }, onAnalyze: analyzeDraft, onSyncMaxChange: setDraftSyncMax, onAffiliationChange: chooseDraftAffiliation, onAffiliationQueryChange: setDraftAffiliationQuery, onApply: applyDraft, onClose: () => { setDraftImportOpen(false); setDraftAffiliationKey(""); setDraftAffiliationQuery(""); } }), /* @__PURE__ */ React.createElement("div", { className: "codex-shell" }, /* @__PURE__ */ React.createElement("div", { className: "persona-workspace" }, equippedPersona && /* @__PURE__ */ React.createElement("div", { className: "equipped-unified" }, /* @__PURE__ */ React.createElement(
    EquippedSummary,
    {
      state,
      dispatch,
      onExpand: { expanded: codexExpanded, toggle: toggleCodexList },
      onShowDetail: setShowEquippedDetail,
      detailShown: showEquippedDetail,
      syncMaxControl: equippedPersona && /* @__PURE__ */ React.createElement(SyncMaxControl, { state, dispatch }),
      /* 固有バフは人格カード内に統合済み。独立した折りたみしでは出さない。 */
      innateSlot: equippedPersona && /* @__PURE__ */ React.createElement(UniqueBuffsBlock, { state, dispatch })
    }
  ), equippedPersona && showEquippedDetail && /* @__PURE__ */ React.createElement("div", { className: "equipped-detail-wrap" }, /* @__PURE__ */ React.createElement("div", { className: "equipped-detail-inner" }, /* @__PURE__ */ React.createElement(
    DetailDialog,
    {
      open: !!selectedPersona, onClose: () => { setSelectedPersona(null); setSelectedPersonaMode(null); }, label: "\u4EBA\u683C\u8A73\u7D30",
      children: /* @__PURE__ */ React.createElement(
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
  )
    })))), 
  /* 人格未装備でも、カスタム作成とテキスト取り込みは常に利用可能にする。
   開閉ボタンと操作ボタンを分離し、button の入れ子も避ける。 */
  /* @__PURE__ */ React.createElement(
    "div",
    { className: "pw-listbar", "data-equipped": equippedPersona ? "1" : "0" },
    equippedPersona
      ? /* @__PURE__ */ React.createElement("button", {
          type: "button",
          className: "pw-listbar-toggle",
          onClick: toggleCodexList,
          "aria-expanded": codexExpanded,
          title: codexExpanded ? "人格一覧を折り畳む" : "人格一覧を展開して別の人格を選ぶ"
        },
          /* @__PURE__ */ React.createElement("span", { className: "caret" }, codexExpanded ? "▼" : "▶"),
          /* @__PURE__ */ React.createElement("span", { className: "pw-listbar-title" }, "PERSONA LIST / 人格一覧"),
          /* @__PURE__ */ React.createElement("span", { className: "pw-listbar-count" }, codexExpanded ? `${sorted.length}件表示中` : "折り畳み中"),
          /* @__PURE__ */ React.createElement("span", { className: "pw-listbar-spacer" }),
          !codexExpanded && /* @__PURE__ */ React.createElement("span", { className: "pw-listbar-hint" }, "クリックで展開")
        )
      : /* @__PURE__ */ React.createElement("div", { className: "pw-listbar-static" },
          /* @__PURE__ */ React.createElement("span", { className: "pw-listbar-title" }, "PERSONA LIST / 人格一覧"),
          /* @__PURE__ */ React.createElement("span", { className: "pw-listbar-count" }, `${sorted.length}件表示中`),
          /* @__PURE__ */ React.createElement("span", { className: "pw-listbar-spacer" }),
          /* @__PURE__ */ React.createElement("span", { className: "pw-listbar-hint" }, "人格未装備でも作成・流し込みできます")
        ),
    /* @__PURE__ */ React.createElement("div", { className: "pw-listbar-actions" },
      /* @__PURE__ */ React.createElement("button", {
        className: "persona-custom-trigger",
        type: "button",
        onClick: equipCustom,
        title: "DBに無い創作人格を手入力で装備"
      }, "＋ カスタム人格"),
      /* @__PURE__ */ React.createElement("button", {
        className: "persona-draft-import-trigger",
        type: "button",
        onClick: () => setDraftImportOpen(true),
        title: "完成した人格データをテキストで流し込み、確認して反映"
      }, "テキスト流し込み反映")
    )
  ), (!equippedPersona || codexExpanded) && /* @__PURE__ */ React.createElement("div", { id: "persona-list-region", className: "codex pw-body" }, /* @__PURE__ */ React.createElement("div", { className: "codex-main" }, !gated && /* @__PURE__ */ React.createElement("div", { className: "codex-modes" }, modes.map((m) => /* @__PURE__ */ React.createElement("button", { key: m.value, className: mode === m.value ? "is-active" : "", onClick: () => dispatch({ type: "SET_UI", ui: { codexMode: m.value } }), type: "button" }, m.label, " ", /* @__PURE__ */ React.createElement("span", { className: "count" }, m.count)))), /* @__PURE__ */ React.createElement("div", { className: "codex-filters" }, /* @__PURE__ */ React.createElement("div", { className: "codex-filter-row" }, /* @__PURE__ */ React.createElement("div", { className: "codex-search" }, /* @__PURE__ */ React.createElement(Icon, { name: "search", size: 14 }), /* @__PURE__ */ React.createElement("input", { type: "text", "aria-label": "人格コードと名前で検索", placeholder: "\u540D\u524D\u30FB\u30D1\u30C3\u30B7\u30D6\u52B9\u679C\u30FB\u30AD\u30FC\u30EF\u30FC\u30C9\u3067\u691C\u7D22...", value: ui.searchQuery || "", onChange: (e) => dispatch({ type: "SET_UI", ui: { searchQuery: e.target.value } }) })), /* @__PURE__ */ React.createElement("div", { className: "codex-count" }, /* @__PURE__ */ React.createElement("strong", null, sorted.length), " / ", pool.length), /* @__PURE__ */ React.createElement("select", { className: "codex-sort", "aria-label": "人格の並び替え", value: ui.sortBy || "no", onChange: (e) => dispatch({ type: "SET_UI", ui: { sortBy: e.target.value } }) }, /* @__PURE__ */ React.createElement("optgroup", { label: "\u57FA\u672C" }, /* @__PURE__ */ React.createElement("option", { value: "owned" }, "\u6240\u6301\u3057\u3066\u3044\u308B\u3082\u306E\u512A\u5148"), /* @__PURE__ */ React.createElement("option", { value: "no" }, "No.\u9806"), /* @__PURE__ */ React.createElement("option", { value: "name" }, "\u540D\u524D\u9806"), /* @__PURE__ */ React.createElement("option", { value: "hp" }, "HP\u964D\u9806"), /* @__PURE__ */ React.createElement("option", { value: "san" }, "SAN\u964D\u9806"), /* @__PURE__ */ React.createElement("option", { value: "speed" }, "\u901F\u5EA6\u4E0A\u9650\u964D\u9806")), /* @__PURE__ */ React.createElement("optgroup", { label: "\u5927\u7F6A\u30B9\u30AD\u30EB\u6570\u304C\u591A\u3044\u9806" }, SINS_ORDER.map((s) => /* @__PURE__ */ React.createElement("option", { key: s, value: `sin:${s}` }, s, "\u30B9\u30AD\u30EB\u591A\u3044\u9806"))))), /* @__PURE__ */ React.createElement("div", { className: "codex-filter-row" },
  /* @__PURE__ */ React.createElement("span", { className: "filter-label" }, "複数選択"),
  React.createElement("div", { className: "chips-group", role: "group", "aria-label": "同じカテゴリ内の複数条件の一致方式" },
    React.createElement("button", { type: "button", className: (ui.filterMatch || "any") === "any" ? "chip is-sm is-active" : "chip is-sm", "aria-pressed": (ui.filterMatch || "any") === "any", title: "同じカテゴリ内で、選択した条件のどれかに一致", onClick: () => dispatch({ type: "SET_UI", ui: { filterMatch: "any" } }) }, "いずれか一致"),
    React.createElement("button", { type: "button", className: (ui.filterMatch || "any") === "all" ? "chip is-sm is-active" : "chip is-sm", "aria-pressed": (ui.filterMatch || "any") === "all", title: "同じカテゴリ内で、選択した条件すべてに一致", onClick: () => dispatch({ type: "SET_UI", ui: { filterMatch: "all" } }) }, "すべて一致")
  )
), /* @__PURE__ */ React.createElement("div", { className: "codex-filter-row" }, /* @__PURE__ */ React.createElement("span", { className: "filter-label" }, "\u5927\u7F6A"), /* @__PURE__ */ React.createElement("div", { className: "chips-group" }, SINS_ORDER.map((s) => /* @__PURE__ */ React.createElement(
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
    "\u5927\u7F6A\u30BD\u30FC\u30C8"
  ))), /* @__PURE__ */ React.createElement("div", { className: "codex-filter-row" }, /* @__PURE__ */ React.createElement("span", { className: "filter-label" }, "\u8010\u6027"), /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: "var(--s-2)", flexWrap: "wrap", alignItems: "center" } }, ["S", "P", "B"].map((k, i) => {
    const key = `filterRes${k}`;
    const label = ["\u65AC\u6483", "\u8CAB\u901A", "\u6253\u6483"][i];
    return /* @__PURE__ */ React.createElement("div", { key: k, style: { display: "flex", alignItems: "center", gap: 6 } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: "var(--fs-10)", color: "var(--tx-dim)", fontFamily: "var(--f-display)", letterSpacing: "0.14em", textTransform: "uppercase", minWidth: 32 } }, label), /* @__PURE__ */ React.createElement("select", { className: "codex-sort", "aria-label": `${label}抵抗で絞り込み`, value: ui[key] || "", onChange: (e) => dispatch({ type: "SET_UI", ui: { [key]: e.target.value } }), style: { minWidth: 80 } }, /* @__PURE__ */ React.createElement("option", { value: "" }, "\u6307\u5B9A\u306A\u3057"), RES_LEVELS.map((r) => /* @__PURE__ */ React.createElement("option", { key: r, value: r }, r))));
  }))), affiliations.length > 0 && React.createElement("div", { className: "codex-filter-row" },
  React.createElement("span", { className: "filter-label" }, "所属"),
  React.createElement("div", { className: "chips-group" }, affiliations.map((aff) => React.createElement(Chip, { key: aff, size: "sm", active: ui.filterAffs.includes(aff), onClick: () => toggleAff(aff) }, aff))
)), allKws.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "codex-filter-row" }, /* @__PURE__ */ React.createElement("span", { className: "filter-label" }, "\u30AD\u30FC\u30EF\u30FC\u30C9"), /* @__PURE__ */ React.createElement("div", { className: "chips-group" }, allKws.map((k) => /* @__PURE__ */ React.createElement(Chip, { key: k, size: "sm", active: ui.filterKws.includes(k), onClick: () => toggleKw(k), title: "このタグを持つ人格: " + countKeywordInPool(k) + "件" }, k + " · " + countKeywordInPool(k))))), /* @__PURE__ */ showAll && /* @__PURE__ */ React.createElement("div", { className: "codex-filter-row" }, /* @__PURE__ */ React.createElement("span", { className: "filter-label" }, "\u6240\u6301"), /* @__PURE__ */ React.createElement("div", { className: "chips-group" }, /* @__PURE__ */ React.createElement(Chip, { active: !!ui.filterOwnedOnly, onClick: () => dispatch({ type: "SET_UI", ui: { filterOwnedOnly: !ui.filterOwnedOnly } }) }, "\u6240\u6301\u3057\u3066\u3044\u308B\u3082\u306E\u306E\u307F", ui.filterOwnedOnly ? ` (${ownedPersonaKeys.size})` : ""))), mode === "roster" && /* @__PURE__ */ React.createElement("div", { className: "codex-filter-row" }, /* @__PURE__ */ React.createElement("span", { className: "filter-label" }, "\u4FDD\u5B58\u72B6\u614B"), /* @__PURE__ */ React.createElement("div", { className: "chips-group" }, [["all", "\u3059\u3079\u3066"], ["saved", "\u7DE8\u96C6\u4FDD\u5B58\u6E08\u307F"], ["default", "\u65E2\u5B9A\u5024\u306E\u307E\u307E"]].map(([key, label]) => /* @__PURE__ */ React.createElement("button", { key, className: `chip is-sm${(ui.rosterBuildFilter || "all") === key ? " is-active" : ""}`, onClick: () => dispatch({ type: "SET_UI", ui: { rosterBuildFilter: key } }) }, label)))),     ownedOnly && /* @__PURE__ */ React.createElement("div", { className: "codex-filter-row owned-gate-row" },
      /* @__PURE__ */ React.createElement("span", { className: "filter-label" }, "\u8868\u793a\u7bc4\u56f2"),
      /* @__PURE__ */ React.createElement("div", { className: "chips-group" },
        /* @__PURE__ */ React.createElement("button", {
          type: "button",
          className: `chip${showAll ? "" : " is-active"}`,
          "aria-pressed": !showAll,
          title: "\u6240\u6301\u306e\u4eba\u683c\u3060\u3051\u51fa\u3059",
          onClick: () => {
            setShowAll(false);
            dispatch({ type: "SET_UI", ui: { searchQuery: "" } });
          }
        }, "\u6240\u6301\u306e\u307f"),
        /* @__PURE__ */ React.createElement("button", {
          type: "button",
          className: `chip${showAll ? " is-active" : ""}`,
          "aria-pressed": showAll,
          title: "\u672a\u6240\u6301\u306e\u4eba\u683c\u3082\u4e00\u89a7\u3078\u51fa\u3057\u3066\u9078\u3076",
          onClick: () => {
            setShowAll(true);
            dispatch({ type: "SET_UI", ui: { searchQuery: "" } });
          }
        }, "\u5168\u4ef6\uff08\u672a\u6240\u6301\u3082\u542b\u3080\uff09"))), hasActiveFilters ? /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "flex-end" } }, /* @__PURE__ */ React.createElement(Button, { variant: "ghost", size: "sm", onClick: resetFilters, icon: "x" }, "\u30D5\u30A3\u30EB\u30BF\u3092\u30EA\u30BB\u30C3\u30C8")) : null), /* @__PURE__ */ React.createElement("div", { className: "codex-grid" }, sorted.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "empty", style: { gridColumn: "1/-1" } }, mode === "fav" && favorites.length === 0 ? "\u2605\u3092\u30AF\u30EA\u30C3\u30AF\u3057\u3066\u304A\u6C17\u306B\u5165\u308A\u3092\u8FFD\u52A0\u3057\u3066\u304F\u3060\u3055\u3044" : mode === "history" && historyRecent.length === 0 ? "\u307E\u3060\u4EBA\u683C\u3092\u9078\u3093\u3067\u3044\u307E\u305B\u3093" : mode === "roster" && roster.personas.length === 0 ? "\u88C5\u5099\u3057\u305F\u4EBA\u683C\u306F\u6240\u6301\u30EA\u30B9\u30C8\u306B\u81EA\u52D5\u8FFD\u52A0\u3055\u308C\u307E\u3059" : "\u8A72\u5F53\u3059\u308B\u4EBA\u683C\u304C\u3042\u308A\u307E\u305B\u3093 \u2014 \u30D5\u30A3\u30EB\u30BF\u3092\u30EA\u30BB\u30C3\u30C8\u3057\u3066\u304F\u3060\u3055\u3044") : sorted.map(({ p, mode: m }) => /* @__PURE__ */ React.createElement(
    PersonaCard,
    {
      key: `${m}:${p.no}`,
      persona: p,
      mode: m,
      isEquipped: personaMode === m && String(personaNo) === String(p.no),
      isActive: selectedPersonaMode === m && String(selectedPersona?.no) === String(p.no),
      isFav: favorites.includes(`${m}:${p.no}`),
      onSelect: (persona) => {
        // 同じモード・No の選択中カードを再クリックしたら装備する。
        if (selectedPersonaMode === m && String(selectedPersona?.no) === String(persona.no)) {
          equipPersona(persona);
          return;
        }
        pendingDetailFocusRef.current = true;
        setSelectedPersonaMode(m);
        setSelectedPersona(persona);
      },
      onEquip: equipPersona,
      onToggleFav: toggleFav,
      /* カード上での獲得は詳細ポップオーバーを経由しない。 */
      isOwned: gated || ownedPersonaKeys.has(`${m}:${p.no}`),
      /* 特異人格は指定購入できない（core P203）。購入選択時は押せないようにする。 */
      purchaseBlocked: acquireHow === "purchase" && Boolean(personaPurchaseBlocked(p, m)),
      onQuickAcquire: gated || (acquireHow === "purchase" && personaPurchaseBlocked(p, m))
        ? null
        : (persona) => acquirePersona(persona),
      quickAcquireLabel: `${resolveAcquireCost("persona", acquireHow, { name: p.name, ownsPersona: (roster.personas || []).length > 0 }).label} 獲得`
    }
  )))), /* @__PURE__ */ React.createElement(
    DetailDialog,
    {
      open: !!selectedPersona, onClose: () => { setSelectedPersona(null); setSelectedPersonaMode(null); }, label: "\u4EBA\u683C\u8A73\u7D30",
      children: /* @__PURE__ */ React.createElement(
    PersonaDetail,
    {
      persona: selectedPersonaView,
      mode: currentMode,
      isEquipped: currentIsEquipped,
      onEquip: () => equipPersona(selectedPersonaView),
      onUnequip: unequip,
      onAddRoster: () => addRoster(selectedPersonaView),
      isInRoster: currentIsInRoster,
      onReturnToList: returnToSelectedCard,
      onOpenDraft: () => setDraftImportOpen(true),
      state,
      acquireHow,
      onAcquireHowChange: setAcquireHow,
      onAcquire: () => acquirePersona(selectedPersonaView)
    }
  )
    })))));
};
window.PersonaCodex = PersonaCodex;
window.PersonaDetail = PersonaDetail;
window.LBT_buildRosterDetailPersona = buildRosterDetailPersona;
window.LBT_findCurrentRosterPersona = findCurrentRosterPersona;
window.getPrimarySin = getPrimarySin;
