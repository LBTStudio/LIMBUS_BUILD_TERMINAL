(() => {
  function scanText(text) {
    if (!text || typeof text !== "string") return null;
    const s = text.trim();
    if (!s) return null;
    const findings = [];
    if (/(クリティカ|クリティ|ダメー|マッ$|スキ$|ラン|ダイ)$/.test(s) && s.length > 6) {
      findings.push("word-cut");
    }
    if (/(付与|回復|消費|得る|変更)。?\s*人格\s*$/.test(s) || /(付与|回復|消費|得る|変更)\s+人格\s+使用時/.test(s)) {
      findings.push("persona-residue");
    }
    if (/[をにへとがで]$/.test(s) && !/(得る|付与|回復|減少|消費|変更|なる|する|なし)。?$/.test(s)) {
      findings.push("particle-cut");
    }
    const openF = (s.match(/[（「【]/g) || []).length;
    const closeF = (s.match(/[）」】]/g) || []).length;
    if (Math.abs(openF - closeF) >= 1) findings.push("paren-mismatch");
    return findings.length ? findings : null;
  }
  function scanPersona(p, mode) {
    const issues = [];
    ["passive_effect", "passive_always", "passive_cond"].forEach((f) => {
      const r = scanText(p[f]);
      if (r) issues.push({ path: f, text: p[f], codes: r });
    });
    (p.unique_buffs || []).forEach((ub, idx) => {
      const r = scanText(ub.desc);
      if (r) issues.push({ path: `\u56FA\u6709\u30D0\u30D5[${idx}].\u8AAC\u660E`, text: ub.desc, codes: r });
    });
    (p.skills || []).forEach((sk, i) => {
      const r = scanText(sk.effect);
      if (r) issues.push({ path: `${sk.name}.effect`, text: sk.effect, codes: r });
      (sk.dice || []).forEach((d, j) => {
        const dR = scanText(d.effect);
        if (dR) issues.push({ path: `${sk.name}.dice[${j + 1}]`, text: d.effect, codes: dR });
      });
    });
    return issues;
  }
  function scanEgo(e) {
    const issues = [];
    ["passive_effect", "passive_cond", "unique_buff"].forEach((f) => {
      const r = scanText(e[f]);
      if (r) issues.push({ path: f, text: e[f], codes: r });
    });
    ["kakusei", "shinshoku"].forEach((f) => {
      const sk = e[f];
      if (!sk) return;
      const r = scanText(sk.effect);
      if (r) issues.push({ path: `${f}.effect`, text: sk.effect, codes: r });
      (sk.dice || []).forEach((d, j) => {
        const dR = scanText(d.effect);
        if (dR) issues.push({ path: `${f}.dice[${j + 1}]`, text: d.effect, codes: dR });
      });
    });
    (e.sub_skills || []).forEach((sk, si) => {
      if (!sk.name) {
        issues.push({ path: `sub_skills[${si}].name`, text: "(\u7A7A)", codes: ["missing-name"] });
      }
      const rEff = scanText(sk.effect);
      if (rEff) issues.push({ path: `sub_skills[${si}].effect`, text: sk.effect, codes: rEff });
      if (!sk.attr) {
        issues.push({ path: `sub_skills[${si}].attr`, text: "(\u7A7A)", codes: ["missing-attr"] });
      }
      (sk.dice || []).forEach((d, j) => {
        const dR = scanText(d.effect);
        if (dR) issues.push({ path: `sub_skills[${si}].dice[${j + 1}]`, text: d.effect, codes: dR });
        if (!d.roll) {
          issues.push({ path: `sub_skills[${si}].dice[${j + 1}].roll`, text: "(\u7A7A)", codes: ["missing-roll"] });
        }
      });
    });
    return issues;
  }
  function personaHasIssue(p) {
    return scanPersona(p).length > 0;
  }
  function egoHasIssue(e) {
    return scanEgo(e).length > 0;
  }
  const QualityInspector = ({ open, onClose }) => {
    const [tab, setTab] = React.useState("personas");
    const scan = React.useMemo(() => {
      if (!open) return null;
      const personas = [];
      DB.normal_personas.forEach((p) => {
        const iss = scanPersona(p);
        if (iss.length) personas.push({ name: p.name, no: p.no, mode: "n", issues: iss });
      });
      DB.tokui_personas.forEach((p) => {
        const iss = scanPersona(p);
        if (iss.length) personas.push({ name: p.name, no: p.no, mode: "t", issues: iss });
      });
      const egos = [];
      DB.egos.forEach((e) => {
        const iss = scanEgo(e);
        if (iss.length) egos.push({ name: e.name, no: e.no, rank: e.rank, issues: iss });
      });
      return { personas, egos };
    }, [open]);
    if (!open || !scan) return null;
    const codeExplain = {
      "word-cut": "\u5358\u8A9E\u306E\u9014\u4E2D\u3067\u5207\u65AD",
      "persona-residue": "\u300C\u4EBA\u683C\u300D\u30E9\u30D9\u30EB\u306E\u6B8B\u9AB8",
      "particle-cut": "\u52A9\u8A5E\u3067\u7D42\u7AEF\uFF08\u5207\u308C\uFF09",
      "paren-mismatch": "\u62EC\u5F27\u306E\u4E0D\u6574\u5408"
    };
    return /* @__PURE__ */ React.createElement("div", { className: "cp-overlay is-open", onClick: (e) => e.target === e.currentTarget && onClose() }, /* @__PURE__ */ React.createElement("div", { className: "cp-box", style: { width: "min(880px, 94vw)", maxHeight: "80vh", display: "flex", flexDirection: "column" } }, /* @__PURE__ */ React.createElement("div", { style: { padding: "var(--s-3) var(--s-4)", borderBottom: "1px solid var(--line)", display: "flex", alignItems: "center", gap: "var(--s-3)" } }, /* @__PURE__ */ React.createElement("span", { className: "t-label", style: { color: "var(--gold)" } }, "\u30C7\u30FC\u30BF\u54C1\u8CEA\u30A4\u30F3\u30B9\u30DA\u30AF\u30BF"), /* @__PURE__ */ React.createElement("div", { className: "tabs", style: { marginLeft: "var(--s-3)", border: "none" } }, /* @__PURE__ */ React.createElement("button", { className: `tab${tab === "personas" ? " is-active" : ""}`, onClick: () => setTab("personas") }, "\u4EBA\u683C (", scan.personas.length, ")"), /* @__PURE__ */ React.createElement("button", { className: `tab${tab === "egos" ? " is-active" : ""}`, onClick: () => setTab("egos") }, "E.G.O (", scan.egos.length, ")")), /* @__PURE__ */ React.createElement("div", { className: "grow" }), /* @__PURE__ */ React.createElement("button", { className: "btn-ghost btn-icon", onClick: onClose }, /* @__PURE__ */ React.createElement(Icon, { name: "x" }))), /* @__PURE__ */ React.createElement("div", { style: { padding: "var(--s-3)", overflowY: "auto", flex: 1 } }, tab === "personas" && (scan.personas.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "empty" }, "\u{1F389} \u4EBA\u683CDB\u306B\u691C\u51FA\u53EF\u80FD\u306A\u7834\u640D\u306F\u3042\u308A\u307E\u305B\u3093") : /* @__PURE__ */ React.createElement("div", { className: "stack-2" }, scan.personas.map((p) => /* @__PURE__ */ React.createElement("div", { key: `${p.mode}${p.no}`, className: "list-item" }, /* @__PURE__ */ React.createElement("div", { className: "list-item-head" }, /* @__PURE__ */ React.createElement("span", { className: "list-item-title" }, p.mode === "n" ? "\u901A\u5E38" : "\u7279\u7570", " No.", String(p.no).padStart(3, "0"), " \u2014 ", p.name), /* @__PURE__ */ React.createElement("span", { className: "badge", style: { color: "var(--warn)" } }, p.issues.length, "\u4EF6")), /* @__PURE__ */ React.createElement("div", { className: "stack-1", style: { marginTop: "var(--s-2)" } }, p.issues.map((iss, i) => /* @__PURE__ */ React.createElement("div", { key: i, style: { padding: "6px 8px", background: "var(--surface-inset)", borderLeft: "2px solid var(--warn)", borderRadius: 2, fontSize: "var(--fs-11)" } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--f-mono)", color: "var(--tx-dim)", fontSize: 10, marginBottom: 2 } }, iss.path), /* @__PURE__ */ React.createElement("div", { style: { color: "var(--tx-2)", lineHeight: 1.4 } }, "\u300C", iss.text, "\u300D"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 9, color: "var(--warn)", marginTop: 2 } }, iss.codes.map((c) => codeExplain[c] || c).join(" / "))))))))), tab === "egos" && (scan.egos.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "empty" }, "\u{1F389} E.G.O DB\u306B\u691C\u51FA\u53EF\u80FD\u306A\u7834\u640D\u306F\u3042\u308A\u307E\u305B\u3093") : /* @__PURE__ */ React.createElement("div", { className: "stack-2" }, scan.egos.map((e) => /* @__PURE__ */ React.createElement("div", { key: `${e.rank}${e.no}`, className: "list-item" }, /* @__PURE__ */ React.createElement("div", { className: "list-item-head" }, /* @__PURE__ */ React.createElement("span", { className: "list-item-title" }, /* @__PURE__ */ React.createElement("span", { className: "badge", "data-rank": e.rank }, e.rank), " No.", String(e.no).padStart(3, "0"), " \u2014 ", e.name), /* @__PURE__ */ React.createElement("span", { className: "badge", style: { color: "var(--warn)" } }, e.issues.length, "\u4EF6")), /* @__PURE__ */ React.createElement("div", { className: "stack-1", style: { marginTop: "var(--s-2)" } }, e.issues.map((iss, i) => /* @__PURE__ */ React.createElement("div", { key: i, style: { padding: "6px 8px", background: "var(--surface-inset)", borderLeft: "2px solid var(--warn)", borderRadius: 2, fontSize: "var(--fs-11)" } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--f-mono)", color: "var(--tx-dim)", fontSize: 10, marginBottom: 2 } }, iss.path), /* @__PURE__ */ React.createElement("div", { style: { color: "var(--tx-2)", lineHeight: 1.4 } }, "\u300C", iss.text, "\u300D"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: 9, color: "var(--warn)", marginTop: 2 } }, iss.codes.map((c) => codeExplain[c] || c).join(" / ")))))))))), /* @__PURE__ */ React.createElement("div", { style: { padding: "var(--s-3)", borderTop: "1px solid var(--line)", fontSize: "var(--fs-11)", color: "var(--tx-dim)", background: "var(--surface-2)" } }, "\u7834\u640D\u30C7\u30FC\u30BF\u3092\u767A\u898B\u3057\u305F\u3089\u3001\u30AD\u30E3\u30E9\u30AF\u30BF\u30FC\u540D\u30FB\u30B9\u30AD\u30EB\u540D\u3092\u63A7\u3048\u3066\u3054\u9023\u7D61\u304F\u3060\u3055\u3044\u3002\u30EB\u30FC\u30EB\u30D6\u30C3\u30AFPDF\u3068\u7167\u5408\u306E\u4E0A\u3001\u6B21\u56DE\u30EA\u30EA\u30FC\u30B9\u3067\u4FEE\u6B63\u3057\u307E\u3059\u3002")));
  };
  Object.assign(window, {
    QualityInspector,
    scanPersona,
    scanEgo,
    personaHasIssue,
    egoHasIssue
  });
})();
