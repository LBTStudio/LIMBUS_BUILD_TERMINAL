/* V13: 基本機能の説明書（ヘルプ）セクション */
const HELP_ITEMS = [
  { group: "prepare", icon: "persona", title: "人格を装備する", body: "人格タブでカードを選び、同じカードをもう一度押して装備します。装備後にHP、SAN、耐性、パッシブ、スキルを確認します。内容を変える場合は「同期化して手動編集」を使います。" },
  { group: "prepare", icon: "ego", title: "E.G.Oをランク枠に装備する", body: "E.G.Oタブで、ZAYINからALEPHまでの各ランク枠にE.G.Oを装備します。装備済みの枠を押すと詳細と直接編集を開けます。覚醒と侵蝕は、それぞれの入力欄で確認・編集します。" },
  { group: "blocks", icon: "skill", title: "戦術スキルを確認・編集する", body: "スキルタブでは、戦術スキルのオーダー、名称、種別、大罪、範囲、効果、ダイスを確認・編集します。d値・d数が変動する効果は、スキル全体または個別ダイスで変動設定を選びます。" },
  { group: "blocks", icon: "passive", title: "パッシブとサポートを確認する", body: "パッシブタブでは装備中人格の人格パッシブを、サポートタブではサポートパッシブを確認します。内容を変更する場合だけ「この枠を編集」を選びます。" },
  { group: "blocks", icon: "spirit", title: "精神・強化を確認・編集する", body: "精神タブでは混乱時の挙動を、強化タブでは身体強化と特殊強化を確認・編集します。該当する項目がない場合は空欄のままにします。" },
  { group: "blocks", icon: "settings", title: "ステータスと出力順を編集する", body: "設定タブでは、既定ステータスと人格固有ステータスの初期値・上限、代入式、メモ・チャットパレット・JSONの出力順を編集します。固有ステータスの数値は、各出力先に同じ値で反映されます。" },
  { group: "output", icon: "drag", title: "表示・出力順を変更する", body: "スキル、ステータス、メモ、チャットパレットは、左上の「⋮⋮」グリップで順番を変えられます。スマートフォンでは少し長押ししてから動かします。▲▼ボタンでも一段ずつ移動できます。" },
  { group: "output", icon: "eye", title: "プレビューとJSON出力を確認する", body: "プレビューでは、メモ、チャットパレット、CCFOLIA用JSONを確認できます。PCでは右側に表示され、モバイルでは開閉できます。JSONを出力する前に、プレビュー内のJSONを確認します。" },
  { group: "operation", icon: "undo", title: "変更を戻す・やり直す", body: "入力や並べ替えを間違えた場合は、画面上部の矢印で戻す・やり直すことができます。PCではCtrl+Zで戻す、Ctrl+Shift+ZまたはCtrl+Yでやり直します。" },
  { group: "operation", icon: "search", title: "クイック検索で画面や候補を探す", body: "クイック検索はPCではCtrl+K、モバイルでは検索ボタンから開きます。人格・E.G.O一覧は、名前、効果、キーワード、大罪、耐性、所持、同期状態で絞り込めます。" },
  { group: "save", icon: "archive", title: "所持ライブラリを保存する", body: "所持タブでは、所持人格、所持E.G.O、編集済みビルドを確認します。上部バーの「ライブラリ保存」は、所持ライブラリと保存済みビルドを別端末へ引き継ぐために保存します。" },
  { group: "save", icon: "download", title: "作業状態を保存・復元する", body: "「現在の作業状態を保存」は、いま編集中のキャラクターを続きから開くための保存です。人格、E.G.O、ステータスなど、保存する範囲を選びます。復元するときは、上書きする範囲を確認します。" }
];

const HelpSection = () => {
  const h = React.createElement;
  const [opened, setOpened] = React.useState("prepare");
  const groups = [
    { key: "prepare", label: "最初に選ぶもの", lead: "人格とE.G.Oを装備します。" },
    { key: "blocks", label: "必要な項目を確認・編集する", lead: "スキル、パッシブ、精神、強化、設定。" },
    { key: "output", label: "セッション前に確認する", lead: "メモ、パレット、JSONを確認します。" },
    { key: "operation", label: "操作を戻す・探す", lead: "戻す・やり直すと検索を使います。" },
    { key: "save", label: "作業を残す・引き継ぐ", lead: "作業状態と所持ライブラリを保存します。" }
  ];
  return h("div", { className: "guide stack-4" },
    h("section", { className: "guide-intro" },
      h("div", { className: "guide-kicker" }, "使い方"),
      h("h2", null, "キャラクターの準備"),
      h("p", null, "人格を装備し、E.G.O、スキル、ステータスを確認します。最後にプレビューで出力を確認して保存します。"),
      h("div", { className: "guide-quick" },
        [["1", "人格を装備する", "カードを選び、同じカードをもう一度押します。"], ["2", "必要な項目を確認する", "E.G.O、スキル、設定を確認します。"], ["3", "出力を確認して保存する", "プレビューで確認して保存します。"]].map(([n, t, d]) => h("div", { key: n, className: "guide-step" }, h("span", null, n), h("b", null, t), h("p", null, d)))
      )
    ),
    h("section", { className: "guide-group guide-beginner is-open", "aria-label": "人格の基本操作" },
      h("div", { className: "guide-group-head guide-beginner-head" },
        h("span", { className: "guide-group-caret", "aria-hidden": true }, "◆"),
        h("span", null, h("b", null, "はじめに：人格を選ぶ・作る"), h("small", null, "公式人格を卓用に調整するか、オリジナル人格を作るかを選びます。"))
      ),
      h("div", { className: "guide-items" },
        h("article", { className: "guide-item" },
          h("div", { className: "guide-item-icon" }, h(Icon, { name: "persona", size: 16 })),
          h("div", null, h("h3", null, "公式人格を調整する"), h("p", null, "人格を装備して「◇ 同期化して手動編集」を押します。編集後は「✓ 編集を終了」。同期ランクは0・00・000、MAXなら「同期MAX」を使います。"))
        ),
        h("article", { className: "guide-item" },
          h("div", { className: "guide-item-icon" }, h(Icon, { name: "plus", size: 16 })),
          h("div", null, h("h3", null, "オリジナル人格を作る"), h("p", null, "人格図鑑の「＋ カスタム人格」から作成します。入力後は「この人格を所持に保存」。修正したら「所持人格の保存内容を更新」です。"))
        )
      )
    ),
    h("div", { className: "guide-common-note" }, h(Icon, { name: "info", size: 15 }), h("span", null, "PCでは上部バー、モバイルでは下部のタブで画面を移動します。プレビューは開閉できます。")),
    groups.map((g) => {
      const items = HELP_ITEMS.filter((item) => item.group === g.key);
      return h("section", { key: g.key, className: `guide-group${opened === g.key ? " is-open" : ""}` },
        h("button", { className: "guide-group-head", onClick: () => setOpened(opened === g.key ? "" : g.key), "aria-expanded": opened === g.key },
          h("span", { className: "guide-group-caret" }, opened === g.key ? "▼" : "▶"),
          h("span", null, h("b", null, g.label), h("small", null, g.lead))
        ),
        opened === g.key && h("div", { className: "guide-items" }, items.map((item) => h("article", { key: item.title, className: "guide-item" },
          h("div", { className: "guide-item-icon" }, h(Icon, { name: item.icon, size: 16 })),
          h("div", null, h("h3", null, item.title), h("p", null, item.body))
        )))
      );
    })
  );
};

const SECTIONS = [
  { id: "persona", label: "人格", icon: "persona", title: "PERSONA CODEX", subtitle: "装備する人格を選択", num: "01", group: "build" },
  { id: "skill", label: "スキル", icon: "skill", title: "TACTICAL SKILLS", subtitle: "戦術スキル 0〜4 の編集", num: "02", group: "build" },
  { id: "passive", label: "パッシブ", icon: "passive", title: "PASSIVE / 人格パッシブ", subtitle: "人格パッシブと固有効果", num: "03", group: "build" },
  { id: "support", label: "サポート", icon: "support", title: "SUPPORT PASSIVES", subtitle: "装備枠と死亡後専用サポート", num: null, group: "optional" },
  { id: "ego", label: "E.G.O", icon: "ego", title: "E.G.O EQUIPMENT", subtitle: "ZAYIN / TETH / HE / WAW / ALEPH", num: null, group: "optional" },
  { id: "spirit", label: "精神", icon: "spirit", title: "SPIRIT", subtitle: "混乱時の挙動", num: null, group: "optional" },
  { id: "enh", label: "強化", icon: "enh", title: "ENHANCEMENTS", subtitle: "身体強化・特殊強化", num: null, group: "optional" },
  { id: "roster", label: "所持", icon: "roster", title: "OWNED LIBRARY", subtitle: "所持人格・E.G.O・保存ビルド", num: null, group: "utility" },
  { id: "items", label: "アイテム", icon: "item", title: "ITEM CODEX", subtitle: "アイテムを選択・一覧へ導入", num: null, group: "utility" },
  { id: "settings", label: "設定", icon: "settings", title: "BUILD PARAMETERS", subtitle: "ステータス設計・計算・出力", num: null, group: "utility" },
  { id: "help", label: "使い方", icon: "book", title: "操作ガイド", subtitle: "準備・確認・出力・保存", num: null, group: "utility" }
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
    case "items":
      return true;
    // auto
    case "settings":
      return true;
    // optional
    default:
      return false;
  }
}
function getSessionReadiness(s) {
  return [
    { id: "persona", label: "人格" },
    { id: "skill", label: "スキル" },
    { id: "passive", label: "パッシブ" }
  ].filter((entry) => !isComplete(entry.id, s));
}
window.LBT_getSessionReadiness = getSessionReadiness;
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
      { type: "act", label: "\u73FE\u5728\u306E\u4F5C\u696D\u72B6\u614B\u3092\u4FDD\u5B58", keywords: ["\u72B6\u614B\u3092\u30A8\u30AF\u30B9\u30DD\u30FC\u30C8", "\u30A8\u30AF\u30B9\u30DD\u30FC\u30C8", "\u4FDD\u5B58"], kbd: "", run: () => exportState(state) },
      { type: "act", label: "\u3059\u3079\u3066\u30AF\u30EA\u30A2", kbd: "", run: () => {
        if (confirm("\u5165\u529B\u5185\u5BB9\u3092\u3059\u3079\u3066\u30AF\u30EA\u30A2\u3057\u307E\u3059\u304B\uFF1F")) {
          dispatch({ type: "RESET" });
          toast("\u30AF\u30EA\u30A2\u3057\u307E\u3057\u305F");
        }
      } }
    ];
    const personaHits = [];
    const egoHits = [];
    const itemHits = [];
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
      (DB.egos || []).forEach((ego) => {
        const haystack = `${ego.name || ""} ${ego.rank || ""} ${ego.resources || ""} ${(ego.keywords || []).join(" ")} ${ego.kakusei?.effect || ""} ${ego.shinshoku?.effect || ""}`.toLowerCase();
        if (haystack.includes(ql)) {
          egoHits.push({ type: "ego", label: `E.G.O：${ego.name}`, kbd: `${ego.rank} / 詳細`, run: () => {
            dispatch({ type: "SET_UI", ui: { currentSection: "ego", egoSearchTarget: { rank: ego.rank, no: ego.no } } });
          } });
        }
      });
      [...(DB.items || []), ...(state.customItems || [])].forEach((item) => {
        const haystack = `${item.name || ""} ${item.category || ""} ${(item.tags || []).join(" ")} ${item.effect || ""}`.toLowerCase();
        if (haystack.includes(ql)) {
          itemHits.push({ type: "item", label: `アイテム：${item.name}`, kbd: "詳細", run: () => {
            dispatch({ type: "SET_UI", ui: { currentSection: "items", itemSearchTarget: { id: item.id } } });
          } });
        }
      });
    }
    const cmdFiltered = ql ? cmds.filter((c) => c.label.toLowerCase().includes(ql) || (c.keywords || []).some((keyword) => keyword.toLowerCase().includes(ql))) : cmds;
    return [...cmdFiltered, ...personaHits.slice(0, 6), ...egoHits.slice(0, 5), ...itemHits.slice(0, 5)];
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
  return /* @__PURE__ */ React.createElement("div", { className: `cp-overlay${open ? " is-open" : ""}`, onClick: (e) => e.target === e.currentTarget && onClose() }, /* @__PURE__ */ React.createElement("div", { className: "cp-box" }, /* @__PURE__ */ React.createElement("input", { ref: inputRef, className: "cp-input", placeholder: "\u30AF\u30A4\u30C3\u30AF\u691C\u7D22\uFF1A\u4EBA\u683C\u30FBE.G.O\u30FB\u30A2\u30A4\u30C6\u30E0\u30FB\u64CD\u4F5C\u2026", value: q, onChange: (e) => setQ(e.target.value), onKeyDown: onKey }), /* @__PURE__ */ React.createElement("div", { className: "cp-list" }, items.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "cp-empty" }, "\u8A72\u5F53\u306A\u3057") : items.map((it, i) => /* @__PURE__ */ React.createElement("div", { key: i, className: `cp-item${i === idx ? " sel" : ""}`, onClick: () => {
    it.run();
    onClose();
  }, onMouseMove: () => setIdx(i) }, /* @__PURE__ */ React.createElement("span", { className: "kind" }, it.type === "nav" ? "\u25B8" : it.type === "persona" ? "\u25C8" : it.type === "ego" ? "\u25C7" : it.type === "item" ? "\u25C6" : "\u2318"), /* @__PURE__ */ React.createElement("span", { className: "lbl" }, it.label), it.kbd && /* @__PURE__ */ React.createElement("span", { className: "kbd" }, it.kbd)))), /* @__PURE__ */ React.createElement("div", { className: "cp-hint" }, /* @__PURE__ */ React.createElement("span", null, "\u2191\u2193 \u79FB\u52D5"), /* @__PURE__ */ React.createElement("span", null, "Enter \u8A73\u7D30\u3092\u958B\u304F"), /* @__PURE__ */ React.createElement("span", null, "Esc \u9589\u3058\u308B"))));
};
function exportState(state) {
  const { ui, ...data } = state;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  const _pn = state.personaSrc?.name ? `_${state.personaSrc.name.replace(/[\\/:*?"<>|\s]+/g, "")}` : "";
  a.download = `${(state.charName || "character").replace(/[\\/:*?"<>|\s]+/g, "")}${_pn}_current-work_lbt.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1e3);
  toast("\u73FE\u5728\u306E\u4F5C\u696D\u72B6\u614B\u3092\u4FDD\u5B58\u3057\u307E\u3057\u305F");
}
/* V22: 所持人格・所持E.G.Oのみを単体ファイルとしてエクスポートする。
   統合セーブデータから分離し、所持データだけを別端末へ引き継ぐ運用を可能にする。
   編集済み人格（build）は roster エントリに内包されるため、そのまま持ち運べる。 */
function exportRoster(state) {
  const payload = {
    schemaVersion: state.schemaVersion || 2,
    _lbtRosterOnly: true,
    exportedAt: new Date().toISOString(),
    roster: state.roster || { personas: [], egos: [] },
    favorites: state.favorites || [],
    historyRecent: state.historyRecent || []
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  const cn = (state.charName || "character").replace(/[\\/:*?"<>|\s]+/g, "");
  a.download = `${cn}_owned-library_lbt.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1e3);
  toast("所持ライブラリを保存しました");
}

/* T26: セーブデータのカテゴリ定義（部分ロード用）。
   各カテゴリはトップレベル state フィールドの集合。 */
const IMPORT_GROUPS = [
  { key: "persona", label: "\u88C5\u5099\u4EBA\u683C\u30FB\u57FA\u672C\u60C5\u5831", fields: ["charName","plName","imgUrls","shareImageData","color","personaMode","personaNo","personaSrc","syncedManual","hp","san","speed","bullets","resS","resP","resB"] },
  { key: "skills", label: "\u30B9\u30AD\u30EB\uFF08\u6D3E\u751F\u542B\u3080\uFF09", fields: ["skills"] },
  { key: "passive", label: "\u30D1\u30C3\u30B7\u30D6", fields: ["pas","pas2Enabled","pas2"] },
  { key: "support", label: "\u30B5\u30DD\u30FC\u30C8\u30D1\u30C3\u30B7\u30D6\uFF08\u6B7B\u4EA1\u5F8C\u542B\u3080\uFF09", fields: ["supports","deathSupport"] },
  { key: "ego", label: "E.G.O\u88C5\u5099", fields: ["egoSlots"] },
  { key: "mental", label: "\u7CBE\u795E", fields: ["spirit","spiritMorale","spiritConfuse","spiritAlways"] },
  { key: "roster", label: "\u6240\u6301\u4EBA\u683C\u30FBE.G.O\u4E00\u89A7", fields: ["roster"] },
  { key: "status", label: "\u30B9\u30C6\u30FC\u30BF\u30B9\u30FB\u56FA\u6709\u30D0\u30D5\u30FB\u51FA\u529B\u8A2D\u5B9A", fields: ["uniqueBuffs","customStatuses","defaultStatuses","outputExclude","shareOptions"] },
  { key: "enh", label: "\u7279\u6B8A\u5F37\u5316", fields: ["enhancements"] },
  { key: "items", label: "\u5C0E\u5165\u6E08\u307F\u30A2\u30A4\u30C6\u30E0", fields: ["inventory","customItems"] },
  { key: "formulas", label: "\u4EE3\u5165\u5F0F\u30FB\u305D\u306E\u4ED6\u8A2D\u5B9A", fields: ["formulas","builtinFormulasOverride","autoFml","moraleLine","extraCmd"] }
];
function validateImportData(data) {
  // 既知の構造のみ受け入れる。壊れたデータの部分適用で state を壊さない。
  if (!data || typeof data !== "object" || Array.isArray(data)) return "\u30AA\u30D6\u30B8\u30A7\u30AF\u30C8\u5F62\u5F0F\u3067\u306F\u3042\u308A\u307E\u305B\u3093";
  // V22: roster 単体ファイル（所持人格/E.G.Oのみ）はそのまま許可
  if (data._lbtRosterOnly && data.roster) return null;
  const known = IMPORT_GROUPS.flatMap((g) => g.fields).concat(["schemaVersion","favorites","historyRecent","ui"]);
  const unknown = Object.keys(data).filter((k) => !known.includes(k));
  if (unknown.length > Object.keys(data).length * 0.8 && unknown.length > 3) return "LBT\u306E\u30BB\u30FC\u30D6\u30C7\u30FC\u30BF\u3067\u306F\u306A\u3044\u53EF\u80FD\u6027\u304C\u3042\u308A\u307E\u3059";
  if (data.skills !== void 0 && !Array.isArray(data.skills)) return "skills \u304C\u914D\u5217\u3067\u306F\u3042\u308A\u307E\u305B\u3093";
  if (data.supports !== void 0 && !Array.isArray(data.supports)) return "supports \u304C\u914D\u5217\u3067\u306F\u3042\u308A\u307E\u305B\u3093";
  return null;
}
function importStateFromFile(file, dispatch) {
  const rd = new FileReader();
  rd.onload = () => {
    let data = null;
    try {
      data = JSON.parse(rd.result);
    } catch (e) {
      toast("\u30A4\u30F3\u30DD\u30FC\u30C8\u5931\u6557\uFF08JSON\u3068\u3057\u3066\u8AAD\u3081\u307E\u305B\u3093\uFF09");
      return;
    }
    const err = validateImportData(data);
    if (err) {
      toast("\u30A4\u30F3\u30DD\u30FC\u30C8\u5931\u6557: " + err);
      return;
    }
    // 部分ロードの選択ダイアログを表示（全選択が既定）
    window.LBT_openImportDialog && window.LBT_openImportDialog(data);
  };
  rd.readAsText(file);
}

const UtilitySheet = ({ open, onClose, actions, sections, currentSection, onNavigate }) => {
  React.useEffect(() => {
    if (!open) return void 0;
    const onKeyDown = (event) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);
  if (!open) return null;
  const h = React.createElement;
  const activate = (fn) => { fn(); onClose(); };
  return h("div", { className: "utility-sheet-backdrop", onClick: (e) => e.target === e.currentTarget && onClose() },
    h("section", { className: "utility-sheet", role: "dialog", "aria-modal": "true", "aria-label": "操作と保存" },
      h("div", { className: "utility-sheet-head" },
        h("div", null, h("span", { className: "utility-sheet-kicker" }, "ACTIONS"), h("h2", null, "操作・保存"), h("p", null, "保存対象と表示操作を、用途の説明とともに選べます。")),
        h("button", { type: "button", className: "utility-sheet-close", onClick: onClose, autoFocus: true, "aria-label": "操作メニューを閉じる" }, h(Icon, { name: "x", size: 18 }))
      ),
      h("div", { className: "utility-sheet-grid" }, actions.map((action) => h("button", {
        type: "button", key: action.key, className: `utility-sheet-action${action.tone ? ` ${action.tone}` : ""}`,
        onClick: () => activate(action.onClick)
      }, h("span", { className: "utility-sheet-icon" }, h(Icon, { name: action.icon, size: 18 })), h("span", { className: "utility-sheet-copy" }, h("b", null, action.label), h("small", null, action.note))))),
      h("div", { className: "utility-sheet-section" },
        h("span", { className: "utility-sheet-kicker" }, "OTHER SECTIONS"),
        h("p", null, "構築の補助、保存済みデータ、設定、ガイドへ移動します。"),
        h("div", { className: "utility-section-grid" }, sections.map((section) => h("button", {
          key: section.id, type: "button", className: `utility-section-link${currentSection === section.id ? " is-active" : ""}`,
          "aria-current": currentSection === section.id ? "page" : void 0,
          onClick: () => { onNavigate(section.id); onClose(); }
        }, h(Icon, { name: section.icon, size: 16 }), h("span", null, section.label))))
      )
    )
  );
};

const RailNavigation = ({ sections, current, dispatch, onOpenUtilities, state }) => {
  const h = React.createElement;
  const buildRailItem = (s) => {
    const done = isComplete(s.id, state);
    const isReq = ["persona", "skill", "passive"].includes(s.id);
    return h("button", {
      key: s.id,
      type: "button",
      className: `rail-item${s.group === "utility" ? " is-utility" : ""}${s.id === "enh" ? " is-overflow" : ""}${current === s.id ? " is-active" : ""}`,
      onClick: () => dispatch({ type: "SET_UI", ui: { currentSection: s.id } }),
      "aria-current": current === s.id ? "page" : void 0,
      title: s.label
    }, h("span", { className: "rail-icon" }, h(Icon, { name: s.icon, size: 18 })), h("span", { className: "rail-label" }, s.label), isReq && !done && h("span", { className: "dot is-warn" }), done && h("span", { className: "dot" }));
  };
  return h("nav", { className: "rail", "aria-label": "画面移動" }, sections.map(buildRailItem),
    h("button", { type: "button", className: "rail-item rail-more", onClick: onOpenUtilities, "aria-haspopup": "dialog", title: "その他の操作と画面" }, h("span", { className: "rail-icon" }, h(Icon, { name: "grid", size: 18 })), h("span", { className: "rail-label" }, "その他"))
  );
};

const App = () => {
  const [state, dispatch, { undo, redo, canUndo, canRedo, saveStatus }] = useAppState();
  const [cpOpen, setCpOpen] = React.useState(false);
  const [qiOpen, setQiOpen] = React.useState(false);
  const [utilityOpen, setUtilityOpen] = React.useState(false);
  const [importData, setImportData] = React.useState(null);
  const [importSel, setImportSel] = React.useState({});
  const fileRef = React.useRef(null);
  // T26: インポートファイル検証後に部分ロードダイアログを開く（既定=全カテゴリ選択）
  React.useEffect(() => {
    window.LBT_openImportDialog = (data) => {
      const sel = {};
      IMPORT_GROUPS.forEach((g) => {
        // データ内に該当フィールドが存在するカテゴリのみ既定ON
        sel[g.key] = g.fields.some((f) => f in data);
      });
      setImportSel(sel);
      setImportData(data);
    };
    return () => { delete window.LBT_openImportDialog; };
  }, []);
  const applyImport = (all) => {
    if (!importData) return;
    const fields = all
      ? IMPORT_GROUPS.flatMap((g) => g.fields)
      : IMPORT_GROUPS.filter((g) => importSel[g.key]).flatMap((g) => g.fields);
    if (!fields.length) { toast("\u8AAD\u307F\u8FBC\u3080\u9805\u76EE\u304C\u9078\u629E\u3055\u308C\u3066\u3044\u307E\u305B\u3093"); return; }
    dispatch({ type: "APPLY_PARTIAL", state: importData, fields });
    setImportData(null);
    toast(all ? "\u5168\u9805\u76EE\u3092\u30A4\u30F3\u30DD\u30FC\u30C8\u3057\u307E\u3057\u305F\uFF08Ctrl+Z\u3067\u5DEE\u3057\u623B\u3057\u53EF\uFF09" : "\u9078\u629E\u9805\u76EE\u3092\u30A4\u30F3\u30DD\u30FC\u30C8\u3057\u307E\u3057\u305F\uFF08Ctrl+Z\u3067\u5DEE\u3057\u623B\u3057\u53EF\uFF09");
  };
  const selectedImportGroups = importData ? IMPORT_GROUPS.filter((g) => importSel[g.key] && g.fields.some((f) => f in importData)) : [];
  const selectedImportLabel = selectedImportGroups.length ? selectedImportGroups.map((g) => g.label).join("\u30FB") : "\u9078\u629E\u306A\u3057";
  const saveStateLabel = saveStatus.phase === "error" ? "\u7AEF\u672B\u5185\u4FDD\u5B58\u4E0D\u53EF" : saveStatus.phase === "saved" ? "\u7AEF\u672B\u5185\u306B\u81EA\u52D5\u4FDD\u5B58\u6E08\u307F" : "\u7AEF\u672B\u5185\u3078\u81EA\u52D5\u4FDD\u5B58\u4E2D";
  React.useEffect(() => {
    const host = document.querySelector(".topbar");
    const anchor = host?.querySelector(".topbar-search");
    if (!host || !anchor) return;
    anchor.dataset.autosave = saveStateLabel;
    anchor.dataset.autosaveState = saveStatus.phase;
    anchor.setAttribute("aria-label", `\u30AF\u30A4\u30C3\u30AF\u691C\u7D22\u3002${saveStateLabel}`);
    const indicator = document.getElementById("lbt-autosave-status") || document.createElement("div");
    indicator.id = "lbt-autosave-status";
    indicator.className = `topbar-save-state is-${saveStatus.phase}`;
    indicator.setAttribute("role", "status");
    indicator.setAttribute("aria-atomic", "true");
    indicator.title = saveStatus.phase === "saved" && saveStatus.savedAt ? `\u7AEF\u672B\u5185\u4FDD\u5B58: ${new Date(saveStatus.savedAt).toLocaleTimeString()}` : saveStateLabel;
    const label = document.createElement("span");
    label.textContent = saveStateLabel;
    indicator.replaceChildren(label);
    if (saveStatus.phase === "error") {
      const backup = document.createElement("button");
      backup.type = "button";
      backup.textContent = "\u4F5C\u696D\u72B6\u614B\u3092\u4FDD\u5B58";
      backup.title = "\u73FE\u5728\u306E\u4F5C\u696D\u72B6\u614B\u3092\u30D5\u30A1\u30A4\u30EB\u3068\u3057\u3066\u4FDD\u5B58";
      backup.onclick = () => exportState(state);
      indicator.appendChild(backup);
    }
    anchor.insertAdjacentElement("afterend", indicator);
    return () => indicator.remove();
  }, [saveStatus.phase, saveStatus.savedAt, saveStateLabel, state]);
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
  // T12: 数値入力 UX。初期値 0 が入った number 入力はフォーカス時に全選択し、
  // 「0 を消してから打ち直す」操作を不要にする。値は変更せず選択のみ（controlled input を壊さない）。
  React.useEffect(() => {
    const onFocusIn = (e) => {
      const el = e.target;
      if (!el || el.tagName !== "INPUT" || el.type !== "number") return;
      // フォーカス直後のブラウザ既定選択を上書きするため次フレームで実行
      requestAnimationFrame(() => {
        try {
          if (document.activeElement === el) el.select();
        } catch (err) {}
      });
    };
    document.addEventListener("focusin", onFocusIn, true);
    return () => document.removeEventListener("focusin", onFocusIn, true);
  }, []);
  const current = state.ui.currentSection || "persona";
  const sec = SECTIONS.find((s) => s.id === current) || SECTIONS[0];
  const renderSection = () => {
    switch (current) {
      case "persona":
        // W07: 人格ページは装備中パネル＋人格一覧のみ。Base Info・固有バフは
        // PersonaCodex 側の装備中パネル内へ折りたたみ統合され、一覧より下には何も描かれない。
        return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(SectionTitle, { num: sec.num, title: sec.title, subtitle: sec.subtitle }), /* @__PURE__ */ React.createElement(PersonaCodex, { state, dispatch }));
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
      case "items":
        return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(SectionTitle, { num: sec.num, title: sec.title, subtitle: sec.subtitle }), /* @__PURE__ */ React.createElement(ItemCodex, { state, dispatch }));
      case "help":
        return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(SectionTitle, { num: sec.num, title: sec.title, subtitle: sec.subtitle }), /* @__PURE__ */ React.createElement(HelpSection, null));
      case "settings":
        return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(SectionTitle, { num: sec.num, title: sec.title, subtitle: sec.subtitle }), /* @__PURE__ */ React.createElement(SettingsSection, { state, dispatch }));
      default:
        return null;
    }
  };
  const isNarrow = typeof window !== "undefined" && window.innerWidth <= 1024;
  const previewOpen = state.ui.previewOpen !== void 0 ? state.ui.previewOpen !== false : !isNarrow;
  // 初期値が未保存でも、画面に実際に表示されている状態を基準に即時反転する。
  const togglePreview = () => dispatch({ type: "SET_UI", ui: { previewOpen: !previewOpen } });
  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(LBT_gen.buildCcfoliaJSON(state)));
      toast("JSONをコピー");
    } catch (_) {
      toast("JSONをコピーできませんでした");
    }
  };
  const utilityActions = [
    { key: "undo", icon: "undo", label: "元に戻す", note: "直前の編集を取り消します。", onClick: undo },
    { key: "redo", icon: "redo", label: "やり直す", note: "取り消した編集をもう一度適用します。", onClick: redo },
    { key: "work", icon: "download", label: "現在の作業状態を保存", note: saveStatus.phase === "error" ? "端末内自動保存が使えません。作業を失わないよう、ファイルとして保存してください。" : "端末内には自動保存されています。別端末への移動・長期保管にはファイルとして保存してください。", onClick: () => exportState(state) },
    { key: "library", icon: "archive", label: "所持ライブラリを保存", note: "所持人格・E.G.O・保存済みビルドを書き出して、別端末へ引き継ぎます。", tone: "is-library-save", onClick: () => exportRoster(state) },
    { key: "import", icon: "upload", label: "保存データを読み込む", note: "読み込む範囲を確認して、現在の作業へ適用します。", onClick: () => fileRef.current?.click() },
    { key: "preview", icon: "eye", label: previewOpen ? "プレビューを閉じる" : "プレビューを開く", note: "メモ、パレット、JSONの出力結果を確認します。", onClick: togglePreview },
    { key: "share", icon: "share", label: "共有シートを開く", note: "整形されたHTMLの共有用プレビューを新規タブで開きます。", onClick: () => LBT_gen.openShareSheet(state) },
    { key: "json", icon: "copy", label: "CCFOLIA JSONをコピー", note: "現在の出力対象をJSONとしてクリップボードへコピーします。", tone: "is-primary", onClick: copyJson }
  ];
  const utilitySections = SECTIONS.filter((s) => s.group === "utility" || s.id === "enh");

  return /* @__PURE__ */ React.createElement("div", { className: `app${!previewOpen ? " preview-collapsed" : ""}` }, /* @__PURE__ */ React.createElement("header", { className: "topbar" }, /* @__PURE__ */ React.createElement("div", { className: "brand" }, /* @__PURE__ */ React.createElement("span", { className: "brand-mark" }, "\u25C8"), /* @__PURE__ */ React.createElement("span", { className: "brand-name" }, "LIMBUS BUILD TERMINAL"), /* @__PURE__ */ React.createElement("span", { className: "brand-sub" }, "CCFOLIA CHARACTER BUILDER ", /* @__PURE__ */ React.createElement("span", { className: "brand-ver" }, window.LBT_VERSION || "v64r45"))), /* @__PURE__ */ React.createElement("div", { className: "brand-author", title: "\u4F5C\u8005\uFF1A\u3057\u3083\u3051", "aria-label": "\u4F5C\u8005\uFF1A\u3057\u3083\u3051" }, /* @__PURE__ */ React.createElement(Icon, { name: "salmon", size: 20 })), /* @__PURE__ */ React.createElement("div", { className: "topbar-spacer" }), /* @__PURE__ */ React.createElement("button", { className: "topbar-search", onClick: () => setCpOpen(true) }, /* @__PURE__ */ React.createElement(Icon, { name: "search", size: 14 }), /* @__PURE__ */ React.createElement("span", { className: "topbar-search-text" }, "\u30AF\u30A4\u30C3\u30AF\u691C\u7D22"), /* @__PURE__ */ React.createElement("kbd", null, "\u2318K")), /* @__PURE__ */ React.createElement("div", { className: "topbar-actions" }, /* @__PURE__ */ React.createElement(Button, { variant: "ghost", size: "sm", icon: "undo", onClick: undo, disabled: !canUndo, title: "\u5143\u306B\u623B\u3059 (Ctrl+Z)" }), /* @__PURE__ */ React.createElement(Button, { variant: "ghost", size: "sm", icon: "redo", onClick: redo, disabled: !canRedo, title: "\u3084\u308A\u76F4\u3057 (Ctrl+Shift+Z)" }), /* @__PURE__ */ React.createElement(Button, { variant: "ghost", size: "sm", icon: "download", onClick: () => exportState(state), title: "\u73FE\u5728\u306E\u4F5C\u696D\u72B6\u614B\u3092\u4FDD\u5B58\uFF08\u8AAD\u307F\u8FBC\u307F\u6642\u306B\u7BC4\u56F2\u3092\u9078\u3079\u307E\u3059\uFF09" }), /* @__PURE__ */ React.createElement(Button, { variant: "ghost", size: "sm", icon: "archive", className: "topbar-library-save", "aria-label": "所持ライブラリを保存", onClick: () => exportRoster(state), title: "\u6240\u6301\u30E9\u30A4\u30D6\u30E9\u30EA\u3092\u4FDD\u5B58\uFF08\u7DE8\u96C6\u6E08\u307F\u4EBA\u683C\u30FBE.G.O\u3092\u5225\u7AEF\u672B\u3078\u5F15\u304D\u7D99\u304E\uFF09" }), /* @__PURE__ */ React.createElement(Button, { variant: "ghost", size: "sm", icon: "upload", onClick: () => fileRef.current.click(), title: "\u4FDD\u5B58\u30C7\u30FC\u30BF\u3092\u8AAD\u307F\u8FBC\u3080\uFF08\u4E0A\u66F8\u304D\u7BC4\u56F2\u3092\u9078\u629E\uFF09" }), /* @__PURE__ */ React.createElement("input", { type: "file", ref: fileRef, accept: "application/json", style: { display: "none" }, onChange: (e) => {
    const f = e.target.files?.[0];
    if (f) importStateFromFile(f, dispatch);
    e.target.value = "";
  } }), /* @__PURE__ */ React.createElement(Button, { variant: "ghost", size: "sm", icon: "eye", onClick: togglePreview, title: "\u30D7\u30EC\u30D3\u30E5\u30FC\u5207\u66FF" }), /* @__PURE__ */ React.createElement(Button, { variant: "ghost", size: "sm", icon: "share", onClick: () => LBT_gen.openShareSheet(state), title: "\u5171\u6709\u30B7\u30FC\u30C8\uFF08\u6574\u5F62HTML\uFF09\u3092\u65B0\u898F\u30BF\u30D6\u3067\u30D7\u30EC\u30D3\u30E5\u30FC" }), /* @__PURE__ */ React.createElement(Button, { variant: "primary", size: "sm", icon: "copy", onClick: async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(LBT_gen.buildCcfoliaJSON(state)));
      toast("JSON\u3092\u30B3\u30D4\u30FC");
    } catch (e) {
    }
  } }, "JSON\u51FA\u529B")), /* @__PURE__ */ React.createElement("button", { type: "button", className: "utility-trigger", onClick: () => setUtilityOpen(true), "aria-haspopup": "dialog", "aria-expanded": utilityOpen }, /* @__PURE__ */ React.createElement(Icon, { name: "grid", size: 15 }), /* @__PURE__ */ React.createElement("span", null, "操作・保存"))), /* @__PURE__ */ React.createElement(RailNavigation, { sections: SECTIONS, current, dispatch, state, onOpenUtilities: () => setUtilityOpen(true) }), /* @__PURE__ */ React.createElement("main", { className: "focus" }, /* @__PURE__ */ React.createElement("div", { className: "focus-inner" }, renderSection())), /* @__PURE__ */ React.createElement(LivePreview, { state, dispatch }), !previewOpen && /* @__PURE__ */ React.createElement("button", { className: "preview-reopen", onClick: togglePreview, title: "\u30D7\u30EC\u30D3\u30E5\u30FC\u3092\u958B\u304F" }, "PREVIEW \u25C8"), /* R15 utility sheet */ utilityOpen && /* @__PURE__ */ React.createElement(UtilitySheet, { open: utilityOpen, onClose: () => setUtilityOpen(false), actions: utilityActions, sections: utilitySections, currentSection: current, onNavigate: (id) => dispatch({ type: "SET_UI", ui: { currentSection: id } }) }), /* @__PURE__ */ React.createElement(CommandPalette, { open: cpOpen, onClose: () => setCpOpen(false), state, dispatch }), /* @__PURE__ */ React.createElement(QualityInspector, { open: qiOpen, onClose: () => setQiOpen(false) }), importData && /* @__PURE__ */ React.createElement("div", { className: "share-modal-backdrop", onClick: (e) => { if (e.target === e.currentTarget) setImportData(null); }, style: { position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 } }, /* @__PURE__ */ React.createElement("div", { className: "card", style: { maxWidth: 520, width: "100%", maxHeight: "85vh", overflow: "auto", background: "var(--surface-1, #1a1715)", border: "1px solid var(--line)", borderRadius: 6, padding: 16 } },
    /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--f-display)", fontWeight: 700, fontSize: 15, color: "var(--gold)", marginBottom: 4 } }, "\u30BB\u30FC\u30D6\u30C7\u30FC\u30BF\u306E\u8AAD\u307F\u8FBC\u307F"),
    /* @__PURE__ */ React.createElement("div", { style: { fontSize: 11, color: "var(--tx-2)", marginBottom: 12, lineHeight: 1.6 } }, "\u8AAD\u307F\u8FBC\u3080\u9805\u76EE\u3092\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044\u3002\u73FE\u5728\u306E\u72B6\u614B\u306F\u4E0A\u66F8\u304D\u3055\u308C\u307E\u3059\u304C\u3001Ctrl+Z\u3067\u5DEE\u3057\u623B\u305B\u307E\u3059\u3002"),
    /* @__PURE__ */ React.createElement("div", { className: "import-apply-summary", role: "status", "aria-live": "polite", style: { fontSize: 11, color: "var(--gold)", marginBottom: 10, padding: "7px 9px", background: "var(--surface-inset)", border: "1px solid var(--line-dim)", borderRadius: 4, lineHeight: 1.5 } }, "\u4ECA\u56DE\u306E\u9069\u7528\u7BC4\u56F2\uFF1A", selectedImportLabel),
    /* @__PURE__ */ React.createElement("div", { className: "stack-2" }, IMPORT_GROUPS.map((g) => {
      const has = g.fields.some((f) => f in importData);
      return /* @__PURE__ */ React.createElement("label", { key: g.key, style: { display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: has ? "var(--surface-inset)" : "transparent", border: "1px solid var(--line-dim)", borderRadius: 4, cursor: has ? "pointer" : "default", opacity: has ? 1 : 0.4, fontSize: 12 } },
        /* @__PURE__ */ React.createElement("input", { type: "checkbox", disabled: !has, checked: !!importSel[g.key], onChange: (e) => setImportSel((s) => ({ ...s, [g.key]: e.target.checked })), style: { accentColor: "var(--gold)" } }),
        /* @__PURE__ */ React.createElement("span", null, g.label, !has && /* @__PURE__ */ React.createElement("span", { style: { fontSize: 10, color: "var(--tx-mute)", marginLeft: 6 } }, "\uFF08\u30C7\u30FC\u30BF\u306A\u3057\uFF09"))
      );
    })),
    /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8, marginTop: 14, justifyContent: "flex-end", flexWrap: "wrap" } },
      /* @__PURE__ */ React.createElement("button", { className: "btn btn-ghost btn-sm", onClick: () => {
        const sel = {};
        IMPORT_GROUPS.forEach((g) => { sel[g.key] = false; });
        setImportSel(sel);
      }, title: "\u5168\u30AB\u30C6\u30B4\u30EA\u306E\u30C1\u30A7\u30C3\u30AF\u3092\u5916\u3059" }, "\u3059\u3079\u3066\u5916\u3059"),
      /* @__PURE__ */ React.createElement("button", { className: "btn btn-ghost btn-sm", onClick: () => {
        const sel = {};
        IMPORT_GROUPS.forEach((g) => { sel[g.key] = g.fields.some((f) => f in importData); });
        setImportSel(sel);
      }, title: "\u30C7\u30FC\u30BF\u304C\u5B58\u5728\u3059\u308B\u30AB\u30C6\u30B4\u30EA\u306E\u307F\u9078\u629E\u3057\u305F\u521D\u671F\u72B6\u614B\u306B\u623B\u3059" }, "\u9078\u629E\u3092\u521D\u671F\u72B6\u614B\u306B\u623B\u3059"),
      /* @__PURE__ */ React.createElement("div", { style: { flex: 1 } }),
      /* @__PURE__ */ React.createElement("button", { className: "btn btn-ghost btn-sm", onClick: () => setImportData(null) }, "\u30AD\u30E3\u30F3\u30BB\u30EB"),
      /* @__PURE__ */ React.createElement("button", { className: "btn btn-sm btn-primary", onClick: () => applyImport(false), disabled: selectedImportGroups.length === 0, title: selectedImportGroups.length ? "\u8868\u793A\u4E2D\u306E\u9069\u7528\u7BC4\u56F2\u3092\u73FE\u5728\u306E\u4F5C\u696D\u72B6\u614B\u3078\u8AAD\u307F\u8FBC\u307F\u307E\u3059" : "\u8AAD\u307F\u8FBC\u3080\u9805\u76EE\u3092\u4E00\u3064\u4EE5\u4E0A\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044" }, "\u9078\u629E\u9805\u76EE\u3092\u8AAD\u307F\u8FBC\u3080")
    )
  )));
};
window.App = App;
