const Icon = ({ name, size = 16, className = "" }) => {
  const paths = ICON_PATHS[name];
  if (!paths) return null;
  return /* @__PURE__ */ React.createElement(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: "1.6",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      className
    },
    paths
  );
};
const ICON_PATHS = {
  persona: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "7", r: "4" }), /* @__PURE__ */ React.createElement("path", { d: "M4 21v-1a8 8 0 0116 0v1" })),
  skill: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("path", { d: "M4 20l6-6" }), /* @__PURE__ */ React.createElement("path", { d: "M14 4l6 6-8 8H6v-6z" })),
  ego: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("path", { d: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" }), /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "3" })),
  passive: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("polygon", { points: "12,2 22,7 22,17 12,22 2,17 2,7" }), /* @__PURE__ */ React.createElement("polyline", { points: "13,8 10,13 14,13 11,18" })),
  support: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("path", { d: "M12 2l2.4 5.3 5.6.6-4.2 3.9 1.2 5.6-5-2.9-5 2.9 1.2-5.6L4 7.9l5.6-.6z" })),
  spirit: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("path", { d: "M12 21C12 21 3 14 3 8a5 5 0 019-3 5 5 0 019 3c0 6-9 13-9 13z" })),
  enh: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("path", { d: "M13 2L3 14h7l-1 8 10-12h-7l1-8z" })),
  roster: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("rect", { x: "3", y: "4", width: "18", height: "4", rx: "1" }), /* @__PURE__ */ React.createElement("rect", { x: "3", y: "10", width: "18", height: "4", rx: "1" }), /* @__PURE__ */ React.createElement("rect", { x: "3", y: "16", width: "18", height: "4", rx: "1" })),
  item: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("path", { d: "M4 7h16v13H4z" }), /* @__PURE__ */ React.createElement("path", { d: "M8 7V5a4 4 0 018 0v2" }), /* @__PURE__ */ React.createElement("path", { d: "M9 13h6" }), /* @__PURE__ */ React.createElement("path", { d: "M12 10v6" })),
  settings: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "3" }), /* @__PURE__ */ React.createElement("path", { d: "M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.6 1.7 1.7 0 00-1.8.4l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.6-1.1 1.7 1.7 0 00-.4-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" })),
  search: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("circle", { cx: "11", cy: "11", r: "7" }), /* @__PURE__ */ React.createElement("path", { d: "M21 21l-4.35-4.35" })),
  undo: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("path", { d: "M3 7v6h6" }), /* @__PURE__ */ React.createElement("path", { d: "M21 17a9 9 0 00-15-6.7L3 13" })),
  redo: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("path", { d: "M21 7v6h-6" }), /* @__PURE__ */ React.createElement("path", { d: "M3 17a9 9 0 0115-6.7L21 13" })),
  trash: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("path", { d: "M3 6h18" }), /* @__PURE__ */ React.createElement("path", { d: "M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2" }), /* @__PURE__ */ React.createElement("path", { d: "M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" })),
  plus: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("line", { x1: "12", y1: "5", x2: "12", y2: "19" }), /* @__PURE__ */ React.createElement("line", { x1: "5", y1: "12", x2: "19", y2: "12" })),
  minus: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("line", { x1: "5", y1: "12", x2: "19", y2: "12" })),
  chevron: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("polyline", { points: "9,6 15,12 9,18" })),
  chevronD: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("polyline", { points: "6,9 12,15 18,9" })),
  chevronU: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("polyline", { points: "18,15 12,9 6,15" })),
  chevronL: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("polyline", { points: "15,18 9,12 15,6" })),
  chevronR: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("polyline", { points: "9,18 15,12 9,6" })),
  edit: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("path", { d: "M12 20h9" }), /* @__PURE__ */ React.createElement("path", { d: "M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z" })),
  sync: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("polyline", { points: "23 4 23 10 17 10" }), /* @__PURE__ */ React.createElement("polyline", { points: "1 20 1 14 7 14" }), /* @__PURE__ */ React.createElement("path", { d: "M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" })),
  grip: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("circle", { cx: "9", cy: "6", r: "1" }), /* @__PURE__ */ React.createElement("circle", { cx: "15", cy: "6", r: "1" }), /* @__PURE__ */ React.createElement("circle", { cx: "9", cy: "12", r: "1" }), /* @__PURE__ */ React.createElement("circle", { cx: "15", cy: "12", r: "1" }), /* @__PURE__ */ React.createElement("circle", { cx: "9", cy: "18", r: "1" }), /* @__PURE__ */ React.createElement("circle", { cx: "15", cy: "18", r: "1" })),
  x: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("line", { x1: "18", y1: "6", x2: "6", y2: "18" }), /* @__PURE__ */ React.createElement("line", { x1: "6", y1: "6", x2: "18", y2: "18" })),
  check: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("polyline", { points: "20,6 9,17 4,12" })),
  eye: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("path", { d: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" }), /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "3" })),
  copy: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("rect", { x: "9", y: "9", width: "13", height: "13", rx: "2" }), /* @__PURE__ */ React.createElement("path", { d: "M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" })),
  download: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("path", { d: "M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" }), /* @__PURE__ */ React.createElement("polyline", { points: "7,10 12,15 17,10" }), /* @__PURE__ */ React.createElement("line", { x1: "12", y1: "15", x2: "12", y2: "3" })),
  archive: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("rect", { x: "3", y: "4", width: "18", height: "5", rx: "1" }), /* @__PURE__ */ React.createElement("path", { d: "M5 9v10a2 2 0 002 2h10a2 2 0 002-2V9" }), /* @__PURE__ */ React.createElement("line", { x1: "9", y1: "13", x2: "15", y2: "13" })),
  upload: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("path", { d: "M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" }), /* @__PURE__ */ React.createElement("polyline", { points: "17,8 12,3 7,8" }), /* @__PURE__ */ React.createElement("line", { x1: "12", y1: "3", x2: "12", y2: "15" })),
  share: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("circle", { cx: "18", cy: "5", r: "3" }), /* @__PURE__ */ React.createElement("circle", { cx: "6", cy: "12", r: "3" }), /* @__PURE__ */ React.createElement("circle", { cx: "18", cy: "19", r: "3" }), /* @__PURE__ */ React.createElement("line", { x1: "8.59", y1: "13.51", x2: "15.42", y2: "17.49" }), /* @__PURE__ */ React.createElement("line", { x1: "15.41", y1: "6.51", x2: "8.59", y2: "10.49" })),
  star: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("polygon", { points: "12,2 15,9 22,10 17,15 18,22 12,19 6,22 7,15 2,10 9,9" })),
  filter: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("polygon", { points: "22,3 2,3 10,12.46 10,19 14,21 14,12.46" })),
  play: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("polygon", { points: "5,3 19,12 5,21" })),
  clock: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "10" }), /* @__PURE__ */ React.createElement("polyline", { points: "12,6 12,12 16,14" })),
  book: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("path", { d: "M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z" }), /* @__PURE__ */ React.createElement("path", { d: "M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z" })),
  grid: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("rect", { x: "3", y: "3", width: "7", height: "7" }), /* @__PURE__ */ React.createElement("rect", { x: "14", y: "3", width: "7", height: "7" }), /* @__PURE__ */ React.createElement("rect", { x: "14", y: "14", width: "7", height: "7" }), /* @__PURE__ */ React.createElement("rect", { x: "3", y: "14", width: "7", height: "7" })),
  external: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("path", { d: "M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" }), /* @__PURE__ */ React.createElement("polyline", { points: "15,3 21,3 21,9" }), /* @__PURE__ */ React.createElement("line", { x1: "10", y1: "14", x2: "21", y2: "3" })),
  // 鮭アイコン（作者・しゃけ）— 極力シンプルなデフォルメ魚
  salmon: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("path", { d: "M3 12c2-3 5-4.5 9-4.5s7 1.5 9 4.5c-2 3-5 4.5-9 4.5s-7-1.5-9-4.5z", fill: "none" }), /* @__PURE__ */ React.createElement("path", { d: "M3 12l-1.5-2M3 12l-1.5 2", strokeLinecap: "round" }), /* @__PURE__ */ React.createElement("circle", { cx: "15", cy: "11", r: "0.9", fill: "currentColor", stroke: "none" })),
  edit: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("path", { d: "M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" }), /* @__PURE__ */ React.createElement("path", { d: "M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" })),
  drag: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("circle", { cx: "9", cy: "6", r: "1" }), /* @__PURE__ */ React.createElement("circle", { cx: "9", cy: "12", r: "1" }), /* @__PURE__ */ React.createElement("circle", { cx: "9", cy: "18", r: "1" }), /* @__PURE__ */ React.createElement("circle", { cx: "15", cy: "6", r: "1" }), /* @__PURE__ */ React.createElement("circle", { cx: "15", cy: "12", r: "1" }), /* @__PURE__ */ React.createElement("circle", { cx: "15", cy: "18", r: "1" })),
  arrowU: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("line", { x1: "12", y1: "19", x2: "12", y2: "5" }), /* @__PURE__ */ React.createElement("polyline", { points: "5,12 12,5 19,12" })),
  arrowD: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("line", { x1: "12", y1: "5", x2: "12", y2: "19" }), /* @__PURE__ */ React.createElement("polyline", { points: "19,12 12,19 5,12" })),
  info: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "12", r: "10" }), /* @__PURE__ */ React.createElement("line", { x1: "12", y1: "10", x2: "12", y2: "16" }), /* @__PURE__ */ React.createElement("circle", { cx: "12", cy: "7", r: "0.8", fill: "currentColor", stroke: "none" })),
  fileText: /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("path", { d: "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" }), /* @__PURE__ */ React.createElement("polyline", { points: "14,2 14,8 20,8" }), /* @__PURE__ */ React.createElement("line", { x1: "16", y1: "13", x2: "8", y2: "13" }), /* @__PURE__ */ React.createElement("line", { x1: "16", y1: "17", x2: "8", y2: "17" }), /* @__PURE__ */ React.createElement("polyline", { points: "10,9 9,9 8,9" }))
};
let _toastEl = null;
let _toastT = null;
function toast(msg) {
  if (!_toastEl) {
    _toastEl = document.createElement("div");
    _toastEl.className = "toast";
    document.body.appendChild(_toastEl);
  }
  _toastEl.textContent = msg;
  _toastEl.classList.add("is-show");
  clearTimeout(_toastT);
  _toastT = setTimeout(() => _toastEl.classList.remove("is-show"), 1800);
}
const Chip = ({ children, active, sin, onClick, size, count }) => /* @__PURE__ */ React.createElement(
  "button",
  {
    className: `chip${active ? " is-active" : ""}${size === "sm" ? " is-sm" : ""}`,
    "data-sin": sin || void 0,
    onClick,
    type: "button"
  },
  children,
  count !== void 0 && count !== null && /* @__PURE__ */ React.createElement("span", { style: { opacity: 0.6, fontFamily: "var(--f-mono)", fontSize: 9, marginLeft: 4 } }, count)
);
const Button = ({ variant = "default", size = "md", icon, iconRight, children, className = "", ...rest }) => {
  const roleClass = {
    primary: "btn-primary btn--primary",
    secondary: "btn--secondary",
    quiet: "btn-ghost btn--quiet",
    danger: "btn--danger",
    ghost: "btn-ghost btn--quiet"
  }[variant] || "btn--secondary";
  return /* @__PURE__ */ React.createElement(
    "button",
    {
      className: `btn ${roleClass}${size === "sm" ? " btn-sm" : size === "lg" ? " btn-lg" : ""} ${className}`.trim(),
      ...rest
    },
    icon && /* @__PURE__ */ React.createElement(Icon, { name: icon, size: 14 }),
    children,
    iconRight && /* @__PURE__ */ React.createElement(Icon, { name: iconRight, size: 14 })
  );
};
const Card = ({ children, className = "", frame = false }) => /* @__PURE__ */ React.createElement("div", { className: `${frame ? "frame" : "card"} ${className}`.trim() }, children);
const SectionTitle = ({ num, title, subtitle, children }) => /* @__PURE__ */ React.createElement("div", { className: "section-title-row" }, num && /* @__PURE__ */ React.createElement("span", { className: "section-title-num" }, num), /* @__PURE__ */ React.createElement("span", { className: "section-title" }, title), subtitle && /* @__PURE__ */ React.createElement("span", { className: "section-subtitle" }, subtitle), children);
const Segmented = ({ value, onChange, options }) => /* @__PURE__ */ React.createElement("div", { className: "segmented", role: "tablist" }, options.map((opt) => /* @__PURE__ */ React.createElement(
  "button",
  {
    key: opt.value,
    role: "tab",
    "aria-selected": value === opt.value,
    className: value === opt.value ? "is-active" : "",
    onClick: () => onChange(opt.value),
    type: "button"
  },
  opt.label
)));
/* W01: エラーバウンダリ — 一部セクションの描画エラーでアプリ全体が真っ黒に
   ならないよう、クラッシュを捕捉してエラー表示＋リロード導線を提供する。 */
class LBTErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { try { console.error("[LBT] render error:", error, info); } catch (_) {} }
  render() {
    if (this.state.error) {
      return React.createElement("div", { style: { padding: 40, textAlign: "center", color: "#d4b158", fontFamily: "sans-serif" } },
        React.createElement("div", { style: { fontSize: 18, fontWeight: 700, marginBottom: 12 } }, "表示中にエラーが発生しました"),
        React.createElement("div", { style: { fontSize: 12, color: "#a79b7c", marginBottom: 16, whiteSpace: "pre-wrap" } }, String(this.state.error && this.state.error.message || this.state.error)),
        React.createElement("button", { className: "btn", onClick: () => location.reload() }, "ページを再読み込み")
      );
    }
    return this.props.children;
  }
}
/* W01: Grid — EquippedEgoEditor 等が参照する汎用グリッド。未定義だと参照箇所で
   ReferenceError となり React ツリー全体がアンマウント（画面が真っ黒）する。 */
const Grid = ({ cols = 2, gap = "var(--s-2)", children, style = {} }) => /* @__PURE__ */ React.createElement(
  "div",
  { style: { display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap, ...style } },
  children
);
const Field = ({ label, children, hint }) => /* @__PURE__ */ React.createElement("div", null, label && /* @__PURE__ */ React.createElement("label", { className: "field-label" }, label), children, hint && /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-10)", color: "var(--tx-mute)", marginTop: 4 } }, hint));
const SinBar = ({ skills }) => {
  const counts = {};
  (skills || []).forEach((sk) => {
    if (sk.sin && sk.sin !== "\u7279\u6B8A") counts[sk.sin] = (counts[sk.sin] || 0) + 1;
  });
  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
  const order = ["\u61A4\u6012", "\u8272\u6B32", "\u6020\u60F0", "\u66B4\u98DF", "\u6182\u9B31", "\u50B2\u6162", "\u5AC9\u59AC"];
  return /* @__PURE__ */ React.createElement("div", { className: "sin-bar" }, order.map((s) => counts[s] && /* @__PURE__ */ React.createElement("span", { key: s, "data-sin": s, style: { width: `${counts[s] / total * 100}%` }, title: `${s} ${counts[s]}` })));
};
const ResRow = ({ s, p, b, showLabels = false }) => /* @__PURE__ */ React.createElement("div", { className: "p-res-mini" }, showLabels && /* @__PURE__ */ React.createElement("span", { className: "lbl" }, "RES"), /* @__PURE__ */ React.createElement("span", { className: "res-dot", "data-res": s, "data-attr": "\u65AC", title: `\u65AC\u6483\uFF1A${s}` }, s), /* @__PURE__ */ React.createElement("span", { className: "res-dot", "data-res": p, "data-attr": "\u8CAB", title: `\u8CAB\u901A\uFF1A${p}` }, p), /* @__PURE__ */ React.createElement("span", { className: "res-dot", "data-res": b, "data-attr": "\u6253", title: `\u6253\u6483\uFF1A${b}` }, b));
const PersonaSinPills = ({ skills, size = "md" }) => {
  const counts = {};
  (skills || []).forEach((sk) => {
    if (sk.sin && sk.sin !== "\u7279\u6B8A") counts[sk.sin] = (counts[sk.sin] || 0) + 1;
  });
  const order = ["\u61A4\u6012", "\u8272\u6B32", "\u6020\u60F0", "\u66B4\u98DF", "\u6182\u9B31", "\u50B2\u6162", "\u5AC9\u59AC"];
  return /* @__PURE__ */ React.createElement("div", { className: "p-sin-row" }, order.map((s) => counts[s] && /* @__PURE__ */ React.createElement("span", { key: s, className: "p-sin-pill", "data-sin": s }, /* @__PURE__ */ React.createElement("span", null, s.slice(0, 1)), /* @__PURE__ */ React.createElement("span", { className: "n" }, counts[s]))));
};
function useDragReorder({ onReorder }) {
  const [dragIdx, setDragIdx] = React.useState(-1);
  const [overIdx, setOverIdx] = React.useState(-1);
  const [dropSide, setDropSide] = React.useState("above");
  const dragIdxRef = React.useRef(-1);
  const overIdxRef = React.useRef(-1);
  const dropSideRef = React.useRef("above");
  const touchRef = React.useRef({ active: false, idx: -1, x: 0, y: 0, startX: 0, startY: 0, holdTimer: null });
  // ネイティブD&D中でもホイールはdocumentへ届くため、対象リストを明示して手動スクロールする。
  // これにより「掴む→ホイールで遠くへ移動→離す」が成立する。
  const scrollContainerRef = React.useRef(null);

  const setDrag = (idx) => {
    dragIdxRef.current = idx;
    setDragIdx(idx);
  };
  const setOver = (idx, side) => {
    overIdxRef.current = idx;
    dropSideRef.current = side;
    setOverIdx(idx);
    setDropSide(side);
  };
  const resetDrag = () => {
    if (touchRef.current?.holdTimer) clearTimeout(touchRef.current.holdTimer);
    dragIdxRef.current = -1;
    overIdxRef.current = -1;
    touchRef.current = { active: false, idx: -1, x: 0, y: 0, startX: 0, startY: 0, holdTimer: null };
    setDragIdx(-1);
    setOverIdx(-1);
  };
  React.useEffect(() => {
    const onWheelWhileDragging = (event) => {
      if (dragIdxRef.current < 0) return;
      const container = scrollContainerRef.current;
      if (!container || container.scrollHeight <= container.clientHeight + 2) return;
      container.scrollTop += event.deltaY;
      // ページ側も一緒に動くとドロップ先が失われるため、並べ替え中だけ対象リストへ固定する。
      event.preventDefault();
    };
    window.addEventListener("wheel", onWheelWhileDragging, { passive: false, capture: true });
    return () => window.removeEventListener("wheel", onWheelWhileDragging, { capture: true });
  }, []);
  const autoScroll = (clientX, clientY, target) => {
    if (typeof window === "undefined") return;
    const threshold = 72;
    const maxStep = 26;
    const h = window.innerHeight || document.documentElement.clientHeight;
    let dy = 0;
    if (clientY < threshold) dy = -Math.ceil((threshold - clientY) / threshold * maxStep);
    else if (clientY > h - threshold) dy = Math.ceil((clientY - (h - threshold)) / threshold * maxStep);
    if (!dy) return;
    const scrollEl = target?.closest?.('[data-scroll-container], .focus, .codex-main, .preview-body, .pv-body');
    if (scrollEl && scrollEl.scrollHeight > scrollEl.clientHeight + 2) {
      scrollEl.scrollTop += dy;
    } else {
      window.scrollBy(0, dy);
    }
  };
  const updateTouchTarget = (clientX, clientY) => {
    const el = document.elementFromPoint(clientX, clientY);
    // 固定ナビゲーションやオーバーレイが要素取得を覆う場合でも、可視行の矩形から挿入先を特定する。
    // モバイルでは指が大きく、ドラッグ中の見かけと実際のヒット要素がずれることがあるためのフォールバック。
    const rows = [...document.querySelectorAll('[data-dnd-index]')];
    const row = el?.closest?.('[data-dnd-index]') || rows.find((candidate) => {
      const rect = candidate.getBoundingClientRect();
      return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
    });
    if (!row) return;
    const idx = Number(row.getAttribute('data-dnd-index'));
    const rect = row.getBoundingClientRect();
    const side = clientY < rect.top + rect.height / 2 ? "above" : "below";
    // 同じ行の上半分／下半分をまたいだ場合も挿入位置を更新する。
    // これにより、隣接行へ移す途中のモバイルD&Dでドロップ位置が古い側に固定されない。
    if (dragIdxRef.current !== idx || overIdxRef.current !== idx || dropSideRef.current !== side) setOver(idx, side);
    autoScroll(clientX, clientY, row);
  };
  const finishTouch = (e) => {
    const t = touchRef.current;
    if (!t.active || dragIdxRef.current < 0) return;
    e.preventDefault();
    updateTouchTarget(t.x, t.y);
    const from = dragIdxRef.current;
    const toIdx = overIdxRef.current;
    const to = dropSideRef.current === "below" ? toIdx + 1 : toIdx;
    const adjustedTo = from < to ? to - 1 : to;
    if (toIdx >= 0 && from !== adjustedTo) onReorder(from, adjustedTo);
    resetDrag();
  };
  const handleProps = (idx) => ({
    draggable: true,
    onDragStart: (e) => {
      setDrag(idx);
      try {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", String(idx));
      } catch (_) {}
    },
    onDragEnd: resetDrag,
    onTouchStart: (e) => {
      const t = e.touches?.[0];
      if (!t) return;
      const ref = { active: false, idx, x: t.clientX, y: t.clientY, startX: t.clientX, startY: t.clientY, holdTimer: null };
      // グリップでは短いタップと縦スワイプをスクロールに譲り、長押し後だけ並べ替えを開始する。
      ref.holdTimer = setTimeout(() => {
        if (touchRef.current === ref && !ref.active) {
          ref.active = true;
          ref.holdTimer = null;
          setDrag(idx);
          try { navigator.vibrate && navigator.vibrate(8); } catch (_) {}
        }
      }, 220);
      touchRef.current = ref;
    },
    onTouchMove: (e) => {
      const t = e.touches?.[0];
      if (!t) return;
      const ref = touchRef.current;
      ref.x = t.clientX;
      ref.y = t.clientY;
      const distance = Math.hypot(ref.x - ref.startX, ref.y - ref.startY);
      // 長押し前の縦スワイプは通常スクロールとして扱う。移動を検知した時点で保留を解除し、
      // スクロール中に意図せずカテゴリを掴まないようにする。
      if (!ref.active && distance > 10) {
        if (ref.holdTimer) clearTimeout(ref.holdTimer);
        ref.holdTimer = null;
        return;
      }
      if (!ref.active) return;
      e.preventDefault();
      updateTouchTarget(ref.x, ref.y);
    },
    onTouchEnd: (e) => {
      const wasActive = touchRef.current.active;
      if (wasActive) finishTouch(e);
      else resetDrag();
    },
    onTouchCancel: resetDrag,
    // 長押し前は縦スクロールを許可し、ドラッグ開始後だけイベント側で移動を制御する。
    style: { cursor: "grab", touchAction: "pan-y" },
    title: "長押ししてドラッグで並べ替え"
  });
  const rowProps = (idx) => ({
    "data-dnd-index": idx,
    onDragOver: (e) => {
      const active = dragIdxRef.current;
      if (active < 0 || active === idx) return;
      e.preventDefault();
      try { e.dataTransfer.dropEffect = "move"; } catch (_) {}
      const rect = e.currentTarget.getBoundingClientRect();
      const side = e.clientY < rect.top + rect.height / 2 ? "above" : "below";
      setOver(idx, side);
      autoScroll(e.clientX, e.clientY, e.currentTarget);
    },
    onDragLeave: (e) => {
      if (e.currentTarget.contains(e.relatedTarget)) return;
      if (overIdxRef.current === idx) setOverIdx(-1);
    },
    onDrop: (e) => {
      const active = dragIdxRef.current;
      if (active < 0 || active === idx) return;
      e.preventDefault();
      const to = dropSideRef.current === "below" ? idx + 1 : idx;
      const adjustedTo = active < to ? to - 1 : to;
      if (active !== adjustedTo) onReorder(active, adjustedTo);
      resetDrag();
    },
    className: ["dnd-row", dragIdx === idx ? "is-dragging" : "", overIdx === idx && dragIdx >= 0 ? "is-drop-target" : ""].filter(Boolean).join(" "),
    "data-drop": overIdx === idx ? dropSide : void 0
  });
  const scrollContainerProps = {
    ref: (node) => { scrollContainerRef.current = node; },
    "data-scroll-container": "true",
    "data-dnd-wheel-scroll": "true"
  };
  return { handleProps, rowProps, scrollContainerProps, dragIdx, overIdx };
}
const SIN_TOKEN_RE = /(憤怒|色欲|怠惰|暴食|憂鬱|傲慢|嫉妬)(x\d+)?/g;
const CondChips = ({ cond }) => {
  const text = String(cond || "");
  if (!text) return null;
  const parts = [];
  let last = 0, m, key = 0;
  const re = new RegExp(SIN_TOKEN_RE.source, "g");
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ t: text.slice(last, m.index), sin: null, key: key++ });
    parts.push({ t: m[0], sin: m[1], key: key++ });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ t: text.slice(last), sin: null, key: key++ });
  return /* @__PURE__ */ React.createElement("span", { className: "cond-chips" }, parts.map(
    (pt) => pt.sin ? /* @__PURE__ */ React.createElement("span", { key: pt.key, className: "cond-chip is-sin", "data-sin": pt.sin }, pt.t) : pt.t.trim() ? /* @__PURE__ */ React.createElement("span", { key: pt.key, className: "cond-chip" }, pt.t.trim()) : null
  ));
};
window.CondChips = CondChips;
Object.assign(window, {
  Icon,
  Chip,
  Button,
  Card,
  Grid,
  LBTErrorBoundary,
  SectionTitle,
  Segmented,
  Field,
  SinBar,
  ResRow,
  PersonaSinPills,
  toast,
  useDragReorder,
  CondChips
});
