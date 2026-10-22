/* V13: 基本機能の説明書（ヘルプ）セクション */
const HELP_ITEMS = [
  { group: "prepare", icon: "persona", title: "人格を装備する", body: "人格タブでカードを一度押すと詳細が表示され、同じカードをもう一度押すと装備します。装備後にHP、SAN、耐性、パッシブ、スキルを確認します。手動編集の具体的な操作は、上の「はじめに：人格を選ぶ・作る」を参照してください。" },
  { group: "prepare", icon: "ego", title: "E.G.Oをランク枠に装備する", body: "E.G.OタブでZAYINからALEPHまでの各ランク枠に装備します。装備済み枠を押すと右側に簡易詳細が表示されます。全文の確認・編集は、その詳細で「解析を開始」を押します。終えるときは「解析を終了」を押すと、内容を保持したまま解析モードを終了します。未解析のE.G.Oは、必要な自我の欠片が不足していると解析を開始できません。" },
  { group: "blocks", icon: "skill", title: "戦術スキルを確認・編集する", body: "スキルタブでは、戦術スキルのオーダー、名称、種別、大罪、範囲、効果、ダイスを確認・編集します。d値・d数が変動する効果は、スキル全体または個別ダイスで変動設定を選びます。" },
  { group: "blocks", icon: "passive", title: "パッシブとサポートを確認する", body: "パッシブタブでは装備中人格の人格パッシブを、サポートタブでは装備中サポートパッシブを確認します。編集できる状態で既存カードを変更する場合は、カードの「この枠を編集」を押します。サポートの候補一覧は項目を選択して詳細を確認し、「通常スロットへ装備」などの装備操作で追加します。" },
  { group: "blocks", icon: "spirit", title: "精神・強化を確認・編集する", body: "精神タブでは混乱時の挙動を、強化タブでは身体強化と特殊強化を確認・編集します。該当する項目がない場合は空欄のままにします。" },
  { group: "blocks", icon: "settings", title: "ステータスと出力順を編集する", body: "設定タブでは、既定・人格固有ステータスの初期値と上限、代入式、メモ・チャットパレット・JSONの出力順を確認・調整します。固有バフなどは出力先（ステータス側／パラメータ側／登録先なし）を選べるため、必要な出力先も確認してください。" },
  { group: "output", icon: "drag", title: "表示・出力順を変更する", body: "スキル・ステータス・メモ・チャットパレットは、各一覧の「⋮⋮」グリップをドラッグして並べ替えます。スマートフォンではグリップを押し続けてから動かすと操作しやすくなります。対応する一覧では矢印／▲▼ボタンでも移動できます。" },
  { group: "output", icon: "eye", title: "プレビューとJSON出力を確認する", body: "プレビューではメモ、チャットパレット、CCFOLIA用JSONの出力結果を確認します。PCでは通常右側に表示され、必要に応じて開閉できます。スマートフォンでは「PREVIEW」操作から開閉します。JSONをコピー／出力する前に、除外設定も含めてプレビューを確認してください。" },
  { group: "operation", icon: "undo", title: "変更を戻す・やり直す", body: "入力や並べ替えを間違えた場合は、画面上部の矢印で元に戻す・やり直すことができます。PCでは入力欄の外でCtrl+Zを押すとアプリ全体の直前の変更を戻し、Ctrl+Shift+ZまたはCtrl+Yでやり直せます。入力欄にカーソルがある間は、Ctrl+Zは文字入力の取り消しを優先します。" },
  { group: "operation", icon: "search", title: "クイック検索で画面や候補を探す", body: "クイック検索はPCではCtrl+K（Macでは⌘K）、スマートフォンでは検索ボタンから開きます。画面移動や操作、人格・E.G.O・アイテム候補を横断して探す機能です。各一覧の絞り込み項目は種類ごとに異なり、人格一覧では名前・効果・キーワードに加え、大罪・所属・耐性・所持条件など、E.G.O一覧では名前・効果・キーワードに加え、ランク・必要資源／除外資源・所持条件などを使えます。同期ランク／同期MAXは一覧の共通検索条件ではなく、人格詳細で確認・設定します。" },
  { group: "save", icon: "archive", title: "所持ライブラリを保存する", body: "記録タブでは所持人格・E.G.O、保存済みビルド、リザルトと収支を確認します。PCでは上部バーのアーカイブアイコン「所持ライブラリを保存」、スマートフォンや幅の狭い画面では「操作・保存」（または「その他」）から同じ項目を選び、所持人格・E.G.O・保存済みビルドをJSONファイルに書き出して別端末へ引き継げます。これは現在の作業状態を保存する操作とは別です。" },
  { group: "save", icon: "download", title: "作業状態を保存・復元する", body: "通常の編集内容はブラウザー内に自動保存されます（保存状態がエラーの場合はファイルにも保存してください）。上部バーの「現在の作業状態を保存」は、編集中のビルド全体をJSONファイルに書き出すバックアップ／別端末移行用の操作です。保存時に範囲は選びません。戻すときは「保存データを読み込む」からファイルを選び、読み込み画面で反映する範囲を確認してから適用します。" }
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
          h("div", null, h("h3", null, "公式人格を調整する"), h("p", null, "人格を装備して「◈ 同期化して手動編集」を押します。これはステータス・パッシブ・スキル・固有バフを手動編集するモードで、ゲーム上の同期ランク（0・00・000）や同期MAXを設定する操作ではありません。終えるときは「✓ 編集を終了（内容は保持）」を押します。ゲーム上の同期ランクと同期MAXは所持詳細で設定します。"))
        ),
        h("article", { className: "guide-item" },
          h("div", { className: "guide-item-icon" }, h(Icon, { name: "plus", size: 16 })),
          h("div", null, h("h3", null, "オリジナル人格を作る"), h("p", null, "人格図鑑の「＋ カスタム人格」から作成します。入力後は「この人格を所持に保存」。修正したら「所持人格の保存内容を更新」です。"))
        )
      )
    ),
    h("div", { className: "guide-common-note" }, h(Icon, { name: "info", size: 15 }), h("span", null, "PCでは画面左側のナビゲーション、スマートフォンでは画面下部のタブで画面を移動します。「操作・保存」から保存や復元などの操作も開けます。プレビューは開閉できます。")),
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
  /* 駒整形 → ビルド → ショップ の順。整えてから選び、選んでから携える。 */
  /* 駒整形（BASEINFO）。装備した人格の同期・固有バフ・戦闘設定をここで整える。 */
  { id: "baseinfo", label: "駒整形", icon: "persona", title: "BASE INFO", subtitle: "装備人格の同期・固有バフ・戦闘設定", num: "01", group: "build" },
  /* ビルドを主とする。人格・スキル・パッシブ・強化・サポート・E.G.O・精神・アイテム は
     BuildWorkspace の8タブ。旧 currentSection 値（skill/passive/enh/support/ego/spirit/
     items-build） も renderSection が受け、移行不要。
     所持ゲートは各タブのフィルタで解除できる（既定は所持のみ）。 */
  { id: "persona", label: "ビルド", icon: "grid", title: "BUILD WORKSPACE", subtitle: "人格・スキル・パッシブ・強化・サポート・E.G.O・精神・アイテム", num: "02", group: "build" },
  /* ショップは所持の唯一の取得口。既定は未所持のみを出す。 */
  { id: "shop", label: "ショップ", icon: "item", title: "SHOP", subtitle: "サポート・E.G.O・精神・アイテムを購入", num: "03", group: "utility" },
  { id: "roster", label: "記録", icon: "roster", title: "CHARACTER RECORD", subtitle: "所持品・リザルト・収支・取り込み", num: null, group: "utility" },
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
  /* 検索で選んだ項目。詳細を出して、取得するかどうかは利用者が決める。 */
  const [picked, setPicked] = React.useState(null);
  const inputRef = React.useRef(null);
  const paletteRef = React.useRef(null);
  const returnFocusRef = React.useRef(null);
  React.useEffect(() => {
if (open) {
returnFocusRef.current = document.activeElement;
/* 開くたびに前回の詳細は捨てる。閉じる側で捨てると、
   項目の選択（run）と閉じる処理が連続radaるため詳細が消えてしまう。 */
setPicked(null);
setTimeout(() => inputRef.current?.focus(), 20);
} else {
    setQ("");
    setIdx(0);
  }
}, [open]);
/* 詳細からの取得。人格は該当の章节へ移して詳細を開かせる。
   検索で選んだだけでは装備も取得もしない。 */
const acquirePicked = () => {
  if (!picked || picked.kind !== "persona") return;
  const { p, m } = picked;
  setPicked(null);
  onClose();
  dispatch({ type: "SET_UI", ui: { currentSection: "persona", personaSearchTarget: { mode: m, no: p.no } } });
};
  /* Escape と Tab を dialog 全体で捕捉する。input の onKeyDown だけに依存すると
     フォーカスが外れた瞬間に Escape が効かなくなる。UtilitySheet と同じ実装。 */
  React.useEffect(() => {
    if (!open) return void 0;
    const getFocusable = () => Array.from(paletteRef.current?.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') || []).filter((node) => node.getClientRects().length > 0);
    const onKeyDown = (event) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab") return;
      const focusable = getFocusable();
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);
  /* 閉じたら呼び出し元へフォーカスを戻す */
  React.useEffect(() => {
    if (open) return;
    const prev = returnFocusRef.current;
    if (prev && typeof prev.focus === "function") prev.focus();
  }, [open]);
  const items = React.useMemo(() => {
    const ql = q.trim().toLowerCase();
    const cmds = [
      ...SECTIONS.map((s) => ({ type: "nav", label: `${s.label} \u30BB\u30AF\u30B7\u30E7\u30F3\u3078\u79FB\u52D5`, kbd: s.num, run: () => dispatch({ type: "SET_UI", ui: { currentSection: s.id } }) })),
      /* ビルドは1画面タブ統合。タブへの直接ジャンプをパレットにも出す。 */
      ...(window.LBT_BUILD_TABS || []).map((t) => ({ type: "nav", label: `ビルド：${t.label}`, kbd: t.num, run: () => dispatch({ type: "SET_UI", ui: { currentSection: t.id } }) })),
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
      personaHits.push({ type: "persona", label: `人格：${p.name}`, kbd: m === "n" ? "通常" : "特異", run: () => {
    /* 選択しただけで装備しない。取得するかどうかは詳細で決める。 */
    setPicked({ kind: "persona", p, m });
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
  const overlay = /* @__PURE__ */ React.createElement("div", { className: `cp-overlay${open ? " is-open" : ""}`, onClick: (e) => e.target === e.currentTarget && onClose() }, /* @__PURE__ */ React.createElement("div", { ref: paletteRef, className: "cp-box", role: "dialog", "aria-modal": "true", "aria-label": "クイック検索" }, /* @__PURE__ */ React.createElement("input", { ref: inputRef, className: "cp-input", "aria-label": "クイック検索：人格・E.G.O・アイテム・操作", placeholder: "\u30AF\u30A4\u30C3\u30AF\u691C\u7D22\uFF1A\u4EBA\u683C\u30FBE.G.O\u30FB\u30A2\u30A4\u30C6\u30E0\u30FB\u64CD\u4F5C\u2026", value: q, onChange: (e) => setQ(e.target.value), onKeyDown: onKey }), /* @__PURE__ */ React.createElement("div", { className: "cp-list", tabIndex: 0 }, items.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "cp-empty" }, "\u8A72\u5F53\u306A\u3057") : items.map((it, i) => /* @__PURE__ */ React.createElement("div", { key: i, className: `cp-item${i === idx ? " sel" : ""}`, onClick: () => {
    it.run();
    onClose();
  }, onMouseMove: () => setIdx(i) }, /* @__PURE__ */ React.createElement("span", { className: "kind" }, it.type === "nav" ? "\u25B8" : it.type === "persona" ? "\u25C8" : it.type === "ego" ? "\u25C7" : it.type === "item" ? "\u25C6" : "\u2318"), /* @__PURE__ */ React.createElement("span", { className: "lbl" }, it.label), it.kbd && /* @__PURE__ */ React.createElement("span", { className: "kbd" }, it.kbd)))), /* @__PURE__ */ React.createElement("div", { className: "cp-hint" }, /* @__PURE__ */ React.createElement("span", null, "\u2191\u2193 \u79FB\u52D5"), /* @__PURE__ */ React.createElement("span", null, "Enter \u8A73\u7D30\u3092\u958B\u304F"), /* @__PURE__ */ React.createElement("span", null, "Esc \u9589\u3058\u308B"))));
  /* 検索で選んだ項目の詳細。選択だけでは装備も取得もしない。 */
  const pickedDetail = picked && picked.kind === "persona" ? /* @__PURE__ */ React.createElement("div", { className: "cp-detail", role: "dialog", "aria-label": picked.p.name + " の詳細" },
    /* @__PURE__ */ React.createElement("div", { className: "cp-detail-head" },
      /* @__PURE__ */ React.createElement("span", { className: "badge" }, picked.m === "t" ? "特異" : "通常"),
      /* @__PURE__ */ React.createElement("strong", null, picked.p.name)
    ),
    /* @__PURE__ */ React.createElement("dl", { className: "cp-detail-stats" },
      /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("dt", null, "HP"), /* @__PURE__ */ React.createElement("dd", null, String(picked.p.hp ?? "—"))),
      /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("dt", null, "SAN"), /* @__PURE__ */ React.createElement("dd", null, String(picked.p.san ?? "—"))),
      /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("dt", null, "速度"), /* @__PURE__ */ React.createElement("dd", null, String(picked.p.speed ?? "—"))),
      /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("dt", null, "パッシブ"), /* @__PURE__ */ React.createElement("dd", null, String(picked.p.passive_name ?? "—")))
    ),
    picked.p.passive_effect ? /* @__PURE__ */ React.createElement("p", { className: "cp-detail-text" }, String(picked.p.passive_effect)) : null,
    (picked.p.skills || []).slice(0, 4).map((skill, n) => /* @__PURE__ */ React.createElement("p", { key: n, className: "cp-detail-skill" },
      [skill.type, skill.sin].filter(Boolean).join("：") + " " + (skill.name || "")
    )),
    /* @__PURE__ */ React.createElement("div", { className: "cp-detail-acts" },
      /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-primary btn-sm", onClick: acquirePicked }, "この人格を取得する"),
      /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-ghost btn-sm", onClick: () => setPicked(null) }, "戻る")
    ),
    /* @__PURE__ */ React.createElement("p", { className: "cp-detail-hint" }, "選択しただけでは装備しません。取得はここで確定します。")
  ) : null;
  return /* @__PURE__ */ React.createElement("div", { className: "cp-layer" }, overlay, pickedDetail);
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
  { key: "passive", label: "\u30D1\u30C3\u30B7\u30D6", fields: ["pas","pas2Enabled","pas2","extraPassives"] },
  { key: "support", label: "\u30B5\u30DD\u30FC\u30C8\u30D1\u30C3\u30B7\u30D6\uFF08\u6B7B\u4EA1\u5F8C\u542B\u3080\uFF09", fields: ["supports","deathSupport"] },
  { key: "ego", label: "E.G.O\u88C5\u5099", fields: ["egoSlots"] },
  { key: "mental", label: "\u7CBE\u795E", fields: ["spirit","spiritMorale","spiritConfuse","spiritAlways"] },
  { key: "roster", label: "\u6240\u6301\u4EBA\u683C\u30FBE.G.O\u4E00\u89A7", fields: ["roster"] },
  { key: "ledger", label: "\u901A\u5E33\uFF08\u30EA\u30B6\u30EB\u30C8\u3068\u6536\u652F\u660E\u7D30\uFF09", fields: ["results", "entries"] },
  { key: "status", label: "\u30B9\u30C6\u30FC\u30BF\u30B9\u30FB\u56FA\u6709\u30D0\u30D5\u30FB\u51FA\u529B\u8A2D\u5B9A", fields: ["uniqueBuffs","customStatuses","defaultStatuses","outputExclude","shareOptions","paletteOptions"] },
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
  const utilitySheetRef = React.useRef(null);
  React.useEffect(() => {
    if (!open) return void 0;
    const getFocusable = () => Array.from(utilitySheetRef.current?.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])') || []).filter((node) => node.getClientRects().length > 0);
    const focusInitialControl = () => getFocusable()[0]?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); }
      if (event.key !== "Tab") return;
      const focusable = getFocusable();
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const focusFrame = requestAnimationFrame(focusInitialControl);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);
  if (!open) return null;
  const h = React.createElement;
  const activate = (fn) => { fn(); onClose(); };
  return h("div", { className: "utility-sheet-backdrop", onClick: (e) => e.target === e.currentTarget && onClose() },
    h("section", { ref: utilitySheetRef, className: "utility-sheet", role: "dialog", "aria-modal": "true", "aria-label": "操作と保存" },
      h("div", { className: "utility-sheet-head" },
        h("div", null, h("span", { className: "utility-sheet-kicker" }, "ACTIONS"), h("h2", null, "操作・保存"), h("p", null, "保存対象と表示操作を、用途の説明とともに選べます。")),
        h("button", { type: "button", className: "utility-sheet-close", onClick: onClose, "aria-label": "操作メニューを閉じる" }, h(Icon, { name: "x", size: 18 }))
      ),
      h("div", { className: "utility-sheet-grid" }, actions.map((action) => h("button", {
        type: "button", key: action.key, className: `utility-sheet-action${action.tone ? ` ${action.tone}` : ""}`,
        onClick: () => activate(action.onClick)
      }, h("span", { className: "utility-sheet-icon" }, h(Icon, { name: action.icon, size: 18 })), h("span", { className: "utility-sheet-copy" }, action.scope && h("span", { className: "utility-sheet-scope" }, action.scope), h("b", null, action.label), h("small", null, action.note))))),
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

/* 免責事項の本文。.topbar 左の鮭マーク（作者・しゃけ）から開く。 */
const DISCLAIMER_BLOCKS = [
  { head: "このツールについて", body: "本ツールは「リンバスTRPG ルールブック（以下LBT）」ユーザーの支援を目的とした非公式ツールです。" },
  { head: "公式ではありません", body: "本ツールは、原著作権者・権利者・関連企業等が公式に提供・承認・監修しているものではありません。" },
  { head: "LBT での解釈について", body: "LBTにおいては、原作者であるProject Moonが明確に定義していない事項について、原作の設定や描写に基づく解釈から定められたルールやデータが存在します。しかし、本ツールはそのような解釈を公式設定として提示すること、または原作に対する特定の解釈を示すことを意図したものではありません。" },
  { head: "正確性は保証しません", body: "本ツールに掲載・表示される情報については、可能な限り正確な内容となるよう努めていますが、その完全性、正確性、最新性を保証するものではありません。ルールの裁定やゲーム上の処理については、必ず公式の「リンバスTRPG ルールブック」および関連する公式資料を確認してください。" },
  { head: "損害について", body: "本ツールの利用によって生じた損害、データの消失、誤ったルール適用、その他のトラブルについて、運営者は責任を負いかねます。ただし、法令上免責することが認められない事項については、この限りではありません。" },
  { head: "原著作物の代替ではありません", body: "本ツールは原著作物そのものを代替することを目的としたものではありません。ルールブックその他資料の利用を妨げるものではなく、あくまでユーザーによるゲームプレイやキャラクター管理等を補助することを目的としています。" },
  { head: "名称・著作物の権利", body: "本ツールで使用される名称、設定、画像、文章その他の著作物について、運営者が権利を主張するものではありません。権利者からの申し立てや要請があった場合には、必要に応じて該当するコンテンツの修正・削除等を行う場合があります。" },
];

const DisclaimerSheet = ({ open, onClose }) => {
  const h = React.createElement;
  const ref = React.useRef(null);
  React.useEffect(() => {
    if (!open) return;
    const prev = document.activeElement;
    const focusable = () => ref.current?.querySelectorAll('button:not([disabled]), [href], a[href], [tabindex]:not([tabindex="-1"])');
    focusable()?.[0]?.focus();
    const onKey = (e) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); return; }
      if (e.key !== "Tab") return;
      const list = focusable();
      if (!list?.length) return;
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey, true);
    return () => { document.removeEventListener("keydown", onKey, true); if (prev && prev.focus) prev.focus(); };
  }, [open]);
  if (!open) return null;
  return h("div", { className: "utility-sheet-backdrop", onClick: (e) => e.target === e.currentTarget && onClose() },
    h("section", { ref, className: "utility-sheet disclaimer-sheet", role: "dialog", "aria-modal": "true", "aria-label": "免責事項" },
      h("div", { className: "utility-sheet-head" },
        h("div", null,
          h("span", { className: "utility-sheet-kicker" }, "DISCLAIMER"),
          h("h2", null, "免責事項"),
          h("p", null, "本ツールは非公式のファンによる補助ツールです。実際の裁定は必ず公式のルールブックと関連資料で確認してください。")),
        h("button", { type: "button", className: "utility-sheet-close", onClick: onClose, "aria-label": "免責事項を閉じる" }, h(Icon, { name: "x", size: 18 }))),
      h("div", { className: "disclaimer-body" },
        DISCLAIMER_BLOCKS.map((b, i) => h("section", { key: i, className: "disclaimer-block" },
          h("h3", null, b.head),
          h("p", null, b.body)))),
      h("p", { className: "disclaimer-sign" },
        h("span", { className: "brand-author-fish" }, h(Icon, { name: "salmon", size: 18 })),
        h("span", null, "作者：しゃけ"))));
};

const RailNavigation = ({ sections, current, dispatch, onOpenUtilities, state }) => {
  const h = React.createElement;
  const buildRailItem = (s) => {
    /* ビルド項目（persona）は 8タブ分の旧 currentSection 値でも
       アクティブ表示し、必須3項目の合成完了でドットを出す。 */
    const isBuild = s.id === "persona";
    const active = isBuild ? ["persona", "skill", "passive", "enh", "support", "ego", "spirit", "items-build"].includes(current) : current === s.id;
    const done = isBuild
      ? isComplete("persona", state) && isComplete("skill", state) && isComplete("passive", state)
      : isComplete(s.id, state);
    return h("button", {
      key: s.id,
      type: "button",
      className: `rail-item${s.group === "utility" ? " is-utility" : ""}${active ? " is-active" : ""}`,
      onClick: () => dispatch({ type: "SET_UI", ui: { currentSection: s.id } }),
      "aria-current": active ? "page" : void 0,
      title: s.label
    }, h("span", { className: "rail-icon" }, h(Icon, { name: s.icon, size: 18 })), h("span", { className: "rail-label" }, s.label), isBuild && !done && h("span", { className: "dot is-warn" }), done && h("span", { className: "dot" }));
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
  const [disclaimerOpen, setDisclaimerOpen] = React.useState(false);
  const [importData, setImportData] = React.useState(null);
  const [importSel, setImportSel] = React.useState({});
  const fileRef = React.useRef(null);
  const utilityReturnFocusRef = React.useRef(null);
  const openUtilities = (event) => {
    const trigger = event?.currentTarget || document.activeElement;
    utilityReturnFocusRef.current = trigger instanceof HTMLElement ? trigger : null;
    setUtilityOpen(true);
  };
  const closeUtilities = React.useCallback(() => {
    setUtilityOpen(false);
    const trigger = utilityReturnFocusRef.current;
    requestAnimationFrame(() => {
      if (trigger && document.contains(trigger)) trigger.focus();
    });
  }, []);
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
  

  /* 硝子窓からの取り込みは、このアカウントの state へ直接流す。
     UNDO は state の履歴機構に乗るので、取り込み後も差し戻せる。 */
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
        return;
      }
      // テキスト入力中の undo/redo はOS標準の入力履歴操作に譲る。
      // アプリ全体のundoで入力中の文字列を巻き戻すと、ユーザーの意図しない
      // ビルド状態変更が発生するため、入力要素へのフォーカス中はスキップする。
      const el = document.activeElement;
      const isTyping = !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
      if (isTyping) return;
      if (isCtrl && !e.shiftKey && e.key === "z") {
        e.preventDefault();
        undo();
      } else if (isCtrl && ((e.shiftKey && (e.key === "Z" || e.key === "Y")) || e.key === "y" || e.key === "Y")) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);
  // T12: 数値入力 UX。初期値 0 が入った number 入力はフォーカス時に全選択し、
  // 「0 を消してから打ち直す」操作を不要にする。値は変更せず選択のみ（controlled input を壊さない）。
  /* アカウント切替オーバーレイ。設定・topbar の chip からは
     lbt:open-accounts イベントだけで開く（状態の所在を App に一元化）。 */
  const [accountSwitcherOpen, setAccountSwitcherOpen] = React.useState(false);
  /* 取り込みは accounts-ui からイベントで届く。状態の所在は App に一元する。 */
  React.useEffect(() => {
    const onImport = (event) => {
      const actions = (event.detail && event.detail.actions) || [];
      if (!actions.length) return;
      dispatch({ type: "APPLY_IMPORT_BATCH", actions });
      const skipped = (event.detail && event.detail.skipped) || [];
      const bad = skipped.filter((s) => /番号|価格/.test(s.reason || ""));
      toast(bad.length
        ? actions.length + "件を取り込みました（" + bad.length + "件は判別できず飛ばしました）"
        : actions.length + "件を取り込みました（Ctrl+Z で戻せます）");
    };
    window.addEventListener("lbt:apply-import", onImport);
    return () => window.removeEventListener("lbt:apply-import", onImport);
  }, [dispatch]);
  React.useEffect(() => {
    const onOpenAccounts = () => setAccountSwitcherOpen(true);
    window.addEventListener("lbt:open-accounts", onOpenAccounts);
    return () => window.removeEventListener("lbt:open-accounts", onOpenAccounts);
  }, []);
  /* アクセス時のアカウント選択ゲート。ページを開いたら必ずこの画面を出す。
     どのアカウントの保存領域で作業するかを利用者が選んでから本体へ入る。
     保存領域そのものが使えない端末（LBT_accounts が機能しない）ときだけ
     素通しにする。ここで止めると作業の入り口が完全に塞がるため。 */
  const [accountGateOpen, setAccountGateOpen] = React.useState(() => window.LBT_accounts?.storageAvailable?.() !== false);
  /* ゲートでアカウントを選んだ通知。ページ再読込はせず、そのアカウントの
     保存領域で state を作り直す。保存の束縛先も選んだアカウントに更新する。 */
  React.useEffect(() => {
    const onAccountsEntered = (event) => {
      const id = event.detail?.id || window.LBT_accounts?.getActiveId?.() || null;
      window.__LBT_BOOT_ACCOUNT_ID = id;
      dispatch({ type: "RELOAD_ACCOUNT" });
      setAccountGateOpen(false);
    };
    window.addEventListener("lbt:accounts-entered", onAccountsEntered);
    return () => window.removeEventListener("lbt:accounts-entered", onAccountsEntered);
  }, []);
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
      /* 6タブ統合。currentSection が skill/passive/enh/support/ego の旧値でも
         BuildWorkspace が BUILD_TABS からアクティブタブを引く。 */
      case "persona":
      case "skill":
      case "passive":
      case "enh":
      case "support":
      case "ego":
      case "spirit":
      case "items-build":
        return /* @__PURE__ */ React.createElement(BuildWorkspace, { state, dispatch });
      case "baseinfo":
        /* 他のセクション（roster/help/settings）と同じく SectionTitle を付ける。
           ここは SECTIONS に title:"BASE INFO" / subtitle が定義されているのに
           描画されておらず、本文が CHARACTER NAME の入力欄から始まっていた。 */
        return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(SectionTitle, { num: sec.num, title: sec.title, subtitle: sec.subtitle }), /* @__PURE__ */ React.createElement(BaseInfoWorkspace, { state, dispatch }));
      case "roster":
        return /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement(SectionTitle, { num: sec.num, title: sec.title, subtitle: sec.subtitle }), /* @__PURE__ */ React.createElement(RosterSection, { state, dispatch }));
      case "shop":
        return /* @__PURE__ */ React.createElement(ShopSection, { state, dispatch });
;
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
      toast("JSONをコピーできませんでした", "assertive");
    }
  };
  const utilityActions = [
    { key: "undo", icon: "undo", label: "元に戻す", note: "直前の編集を取り消します。", onClick: undo },
    { key: "redo", icon: "redo", label: "やり直す", note: "取り消した編集をもう一度適用します。", onClick: redo },
    { key: "work", icon: "download", scope: "このビルド", label: "現在の作業状態を保存", note: saveStatus.phase === "error" ? "端末内自動保存が使えません。作業を失わないよう、ファイルとして保存してください。" : "端末内には自動保存されています。別端末への移動・長期保管にはファイルとして保存してください。", onClick: () => exportState(state) },
    { key: "library", icon: "archive", scope: "所持データ", label: "所持ライブラリを保存", note: "所持人格・E.G.O・保存済みビルドを書き出して、別端末へ引き継ぎます。", tone: "is-library-save", onClick: () => exportRoster(state) },
    { key: "import", icon: "upload", label: "保存データを読み込む", note: "読み込む範囲を確認して、現在の作業へ適用します。", onClick: () => fileRef.current?.click() },
    { key: "preview", icon: "eye", label: previewOpen ? "プレビューを閉じる" : "プレビューを開く", note: "メモ、パレット、JSONの出力結果を確認します。", onClick: togglePreview },
    { key: "share", icon: "share", label: "共有シートを開く", note: "整形されたHTMLの共有用プレビューを新規タブで開きます。", onClick: () => LBT_gen.openShareSheet(state) },
    { key: "json", icon: "copy", scope: "出力", label: "CCFOLIA JSONをコピー", note: "現在の出力対象をJSONとしてクリップボードへコピーします。", tone: "is-primary", onClick: copyJson }
  ];
  const utilitySections = SECTIONS.filter((s) => s.group === "utility");

  /* アカウント未選択なら本体を出さず、選択ゲートだけを描画する。
     「どのキャラクターのデータか」が決まるまで編集画面へ入れないことで、
     前回の作業状態が別アカウントの画面へ漏れる経路を無くす。 */
  if (accountGateOpen) {
    return /* @__PURE__ */ React.createElement(AccountGate, null);
  }
  return /* @__PURE__ */ React.createElement("div", { className: `app${!previewOpen ? " preview-collapsed" : ""}` }, /* 最初のフォーカス可能要素。WCAG 2.4.1 の bypass block。
   通常時は画面外へ逃がし、フォーカス時のみ表示する。 */ /* @__PURE__ */ React.createElement("a", { href: "#main-content", className: "skip-link" }, "本文へスキップ"), /* @__PURE__ */ React.createElement("header", { className: "topbar" }, /* @__PURE__ */ React.createElement("div", { className: "brand" }, /* @__PURE__ */ React.createElement("span", { className: "brand-mark" }, "\u25C8"), /* @__PURE__ */ React.createElement("h1", { className: "brand-name" }, "LIMBUS BUILD TERMINAL"), /* @__PURE__ */ React.createElement("span", { className: "brand-sub" }, "CCFOLIA CHARACTER BUILDER ", /* @__PURE__ */ React.createElement("span", { className: "brand-ver" }, window.LBT_VERSION || "v64r45"))), /* @__PURE__ */ React.createElement("button", { type: "button", className: "brand-author", onClick: () => setDisclaimerOpen(true), title: "\u4F5C\u8005\uFF1A\u3057\u3083\u3051\uFF08\u514D\u8CAC\u4E8B\u9805\u3092\u958B\u304F\uFF09", "aria-haspopup": "dialog" }, /* @__PURE__ */ React.createElement("span", { className: "brand-author-fish" }, /* @__PURE__ */ React.createElement(Icon, { name: "salmon", size: 20 })), /* @__PURE__ */ React.createElement("span", { className: "brand-author-name" }, "しゃけ")), /* @__PURE__ */ React.createElement("div", { className: "topbar-spacer" }), /* @__PURE__ */ React.createElement("button", { className: "topbar-search", onClick: () => setCpOpen(true) }, /* @__PURE__ */ React.createElement(Icon, { name: "search", size: 14 }), /* @__PURE__ */ React.createElement("span", { className: "topbar-search-text" }, "\u30AF\u30A4\u30C3\u30AF\u691C\u7D22"), /* @__PURE__ */ React.createElement("kbd", null, "\u2318K")), /* 残高は常に見える必要がある。.topbar-actions の中に入れると ≤640px と
   横向きで display:none になるため、.topbar の直接子として置く。 */
/* @__PURE__ */ React.createElement(BalanceChip, { state, onClick: () => dispatch({ type: "SET_UI", ui: { currentSection: "roster", libraryTab: "ledger" } }) }), /* @__PURE__ */ React.createElement("div", { className: "topbar-actions" }, /* @__PURE__ */ React.createElement(AccountChip, null), /* @__PURE__ */ React.createElement(Button, { variant: "ghost", size: "sm", icon: "undo", onClick: undo, disabled: !canUndo, title: "\u5143\u306B\u623B\u3059 (Ctrl+Z)" }), /* @__PURE__ */ React.createElement(Button, { variant: "ghost", size: "sm", icon: "redo", onClick: redo, disabled: !canRedo, title: "\u3084\u308A\u76F4\u3057 (Ctrl+Shift+Z)" }), /* @__PURE__ */ React.createElement(Button, { variant: "ghost", size: "sm", icon: "download", onClick: () => exportState(state), title: "\u73FE\u5728\u306E\u4F5C\u696D\u72B6\u614B\u3092\u4FDD\u5B58\uFF08\u8AAD\u307F\u8FBC\u307F\u6642\u306B\u7BC4\u56F2\u3092\u9078\u3079\u307E\u3059\uFF09" }), /* @__PURE__ */ React.createElement(Button, { variant: "ghost", size: "sm", icon: "archive", className: "topbar-library-save", "aria-label": "所持ライブラリを保存", onClick: () => exportRoster(state), title: "\u6240\u6301\u30E9\u30A4\u30D6\u30E9\u30EA\u3092\u4FDD\u5B58\uFF08\u7DE8\u96C6\u6E08\u307F\u4EBA\u683C\u30FBE.G.O\u3092\u5225\u7AEF\u672B\u3078\u5F15\u304D\u7D99\u304E\uFF09" }), /* @__PURE__ */ React.createElement(Button, { variant: "ghost", size: "sm", icon: "upload", onClick: () => fileRef.current.click(), title: "\u4FDD\u5B58\u30C7\u30FC\u30BF\u3092\u8AAD\u307F\u8FBC\u3080\uFF08\u4E0A\u66F8\u304D\u7BC4\u56F2\u3092\u9078\u629E\uFF09" }), /* @__PURE__ */ React.createElement("input", { type: "file", ref: fileRef, accept: "application/json", style: { display: "none" }, onChange: (e) => {
    const f = e.target.files?.[0];
    if (f) importStateFromFile(f, dispatch);
    e.target.value = "";
  } }), /* @__PURE__ */ React.createElement(Button, { variant: "ghost", size: "sm", icon: "eye", onClick: togglePreview, title: "\u30D7\u30EC\u30D3\u30E5\u30FC\u5207\u66FF" }), /* @__PURE__ */ React.createElement(Button, { variant: "ghost", size: "sm", icon: "share", onClick: () => LBT_gen.openShareSheet(state), title: "\u5171\u6709\u30B7\u30FC\u30C8\uFF08\u6574\u5F62HTML\uFF09\u3092\u65B0\u898F\u30BF\u30D6\u3067\u30D7\u30EC\u30D3\u30E5\u30FC" }), /* @__PURE__ */ React.createElement(Button, { variant: "primary", size: "sm", icon: "copy", onClick: async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(LBT_gen.buildCcfoliaJSON(state)));
      toast("JSON\u3092\u30B3\u30D4\u30FC");
    } catch (e) {
    }
  } }, "JSON\u51FA\u529B")), /* @__PURE__ */ React.createElement("button", { type: "button", className: "utility-trigger", onClick: openUtilities, "aria-haspopup": "dialog", "aria-expanded": utilityOpen }, /* @__PURE__ */ React.createElement(Icon, { name: "grid", size: 15 }), /* @__PURE__ */ React.createElement("span", null, "操作・保存"))), /* @__PURE__ */ React.createElement(RailNavigation, { sections: SECTIONS, current, dispatch, state, onOpenUtilities: openUtilities }), /* @__PURE__ */ React.createElement("main", { className: "focus", id: "main-content", tabIndex: -1 }, /* @__PURE__ */ React.createElement("div", { className: "focus-inner" }, renderSection())), /* @__PURE__ */ React.createElement(LivePreview, { state, dispatch }), !previewOpen && /* @__PURE__ */ React.createElement("button", { className: "preview-reopen", onClick: togglePreview, title: "\u30D7\u30EC\u30D3\u30E5\u30FC\u3092\u958B\u304F" }, "PREVIEW \u25C8"), /* R15 utility sheet */ utilityOpen && /* @__PURE__ */ React.createElement(UtilitySheet, { open: utilityOpen, onClose: closeUtilities, actions: utilityActions, sections: utilitySections, currentSection: current, onNavigate: (id) => dispatch({ type: "SET_UI", ui: { currentSection: id } }) }), /* @__PURE__ */ React.createElement(DisclaimerSheet, { open: disclaimerOpen, onClose: () => setDisclaimerOpen(false) }), /* @__PURE__ */ React.createElement(CommandPalette, { open: cpOpen, onClose: () => setCpOpen(false), state, dispatch }), /* @__PURE__ */ React.createElement(QualityInspector, { open: qiOpen, onClose: () => setQiOpen(false) }), /* @__PURE__ */ React.createElement(AccountSwitcher, { open: accountSwitcherOpen, onClose: () => setAccountSwitcherOpen(false) }), importData && /* @__PURE__ */ React.createElement("div", { className: "share-modal-backdrop", onClick: (e) => { if (e.target === e.currentTarget) setImportData(null); }, style: { position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 } }, /* @__PURE__ */ React.createElement("div", { className: "card", style: { maxWidth: 520, width: "100%", maxHeight: "85vh", overflow: "auto", background: "var(--surface-1, #1a1715)", border: "1px solid var(--line)", borderRadius: 6, padding: 16 } },
    /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--f-display)", fontWeight: 700, fontSize: "var(--fs-15)", color: "var(--gold)", marginBottom: 4 } }, "\u30BB\u30FC\u30D6\u30C7\u30FC\u30BF\u306E\u8AAD\u307F\u8FBC\u307F"),
    /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-11)", color: "var(--tx-2)", marginBottom: 12, lineHeight: 1.6 } }, "\u8AAD\u307F\u8FBC\u3080\u9805\u76EE\u3092\u9078\u629E\u3057\u3066\u304F\u3060\u3055\u3044\u3002\u73FE\u5728\u306E\u72B6\u614B\u306F\u4E0A\u66F8\u304D\u3055\u308C\u307E\u3059\u304C\u3001Ctrl+Z\u3067\u5DEE\u3057\u623B\u305B\u307E\u3059\u3002"),
    /* @__PURE__ */ React.createElement("div", { className: "import-apply-summary", role: "status", "aria-live": "polite", style: { fontSize: "var(--fs-11)", color: "var(--gold)", marginBottom: 10, padding: "7px 9px", background: "var(--surface-inset)", border: "1px solid var(--line-dim)", borderRadius: 4, lineHeight: 1.5 } }, "\u4ECA\u56DE\u306E\u9069\u7528\u7BC4\u56F2\uFF1A", selectedImportLabel),
    /* @__PURE__ */ React.createElement("div", { className: "stack-2" }, IMPORT_GROUPS.map((g) => {
      const has = g.fields.some((f) => f in importData);
      return /* @__PURE__ */ React.createElement("label", { key: g.key, style: { display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: has ? "var(--surface-inset)" : "transparent", border: "1px solid var(--line-dim)", borderRadius: 4, cursor: has ? "pointer" : "default", opacity: has ? 1 : 0.4, fontSize: "var(--fs-12)" } },
        /* @__PURE__ */ React.createElement("input", { type: "checkbox", disabled: !has, checked: !!importSel[g.key], onChange: (e) => setImportSel((s) => ({ ...s, [g.key]: e.target.checked })), style: { accentColor: "var(--gold)" } }),
        /* @__PURE__ */ React.createElement("span", null, g.label, !has && /* @__PURE__ */ React.createElement("span", { style: { fontSize: "var(--fs-10)", color: "var(--tx-mute)", marginLeft: 6 } }, "\uFF08\u30C7\u30FC\u30BF\u306A\u3057\uFF09"))
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
