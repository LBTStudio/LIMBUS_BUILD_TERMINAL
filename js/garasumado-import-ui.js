/* ---------------------------------------------------------------------------
   garasumado-import-ui.js  →  硝子窓の共有URLから所持を取り込む決定面。

   この画面の仕事は 1 つだけ:「何を入れるか」を利用者が決めること。
   だから自動化は予測変換までに留め、曖昧なものは必ず提示する。

   操作の中心は「候補のポップオーバー」。
   - 項目をクリックすると、その行の変換候補が開く（hover ではない）。
   - 候補から1つ選ぶと名前と価格が確定し、明細へ紐づく。
   - 決められなければ「このまま」か「外す」を選ぶ。推測で埋めない。
   - Esc で閉じて焦点はトリガーへ戻る。外側クリックでも閉じる。

   設計:
     - 「計算に含めるか」は色だけでなく文字と記号でも示す（WCAG 1.4.1）。
     - 金色は主要動作と「含める」状態だけ。それ以外はニュートラル。
     - 動き: 低頻度の操作なのでパネル 180ms・行は 100ms 間隔で順に入れる。
       行トグルには 120ms の色変化のみ。
   --------------------------------------------------------------------------- */
(function () {
const h = React.createElement;

/* 金額を1行で読む。両方あれば「LP・欠片」、片方だけならその通货。 */
const moneyText = (price) => {
  if (!price) return "価格なし";
  if (price.lp && price.shards) return `${price.lp} LP・${price.shards} 欠片`;
  if (price.lp) return `${price.lp} LP`;
  if (price.shards) return `${price.shards} 欠片`;
  return "価格なし";
};

/* --- 候補のポップオーバー -------------------------------------------------
   IME の変換候補と同じ操作感にする。1 行に対して候補が並び、
   選んだ瞬間に名前と価格が決まる。 */
function CandidatePopover({ anchor, item, onPick, onClose }) {
  const ref = React.useRef(null);
  const [box, setBox] = React.useState(null);

  /* 位置は固定座標で計算する。親の overflow:hidden に切られると
     候補が読めなくなるので、アンカー基準の実測値を使う。 */
  React.useLayoutEffect(() => {
    const place = () => {
      const rect = anchor.current ? anchor.current.getBoundingClientRect() : null;
      if (!rect) return;
      const width = Math.min(430, window.innerWidth - 32);
      const left = Math.max(16, Math.min(rect.left, window.innerWidth - width - 16));
      const below = rect.bottom + 6;
      const maxHeight = Math.max(160, window.innerHeight - below - 24);
      setBox({ left, top: below, width, maxHeight });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchor]);

  React.useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        const buttons = ref.current ? [...ref.current.querySelectorAll("button[data-cand]")] : [];
        if (!buttons.length) return;
        const at = buttons.indexOf(document.activeElement);
        const next = event.key === "ArrowDown" ? (at + 1) % buttons.length : (at - 1 + buttons.length) % buttons.length;
        buttons[next]?.focus();
        event.preventDefault();
      }
    };
    const onDown = (event) => {
      if (ref.current && !ref.current.contains(event.target) && !anchor.current?.contains(event.target)) onClose();
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("mousedown", onDown, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("mousedown", onDown, true);
    };
  }, [onClose, anchor]);

  React.useEffect(() => {
    ref.current?.querySelector("button[data-cand]")?.focus();
  }, []);

  const candidates = item.candidates || [];
  return h("div", {
    ref,
    className: "gara-pop",
    role: "dialog",
    "aria-label": `${item.name} の変換候補`,
    style: box ? { left: box.left + "px", top: box.top + "px", width: box.width + "px", maxHeight: box.maxHeight + "px" } : { visibility: "hidden" }
  },
    h("p", { className: "gara-pop-head" }, "この行に一致した名前"),
    candidates.length
      ? h("ul", { className: "gara-pop-list" },
        candidates.map((cand) => h("li", { key: cand.key },
          h("button", {
            type: "button",
            className: `gara-pop-item${cand.chosen ? " is-chosen" : ""}`,
            "data-cand": cand.key,
            onClick: () => onPick(cand)
          },
            h("span", { className: "gara-pop-name" },
              cand.acquisitionLabel ? `${item.name}（${cand.acquisitionLabel}）` : cand.name
            ),
            h("span", { className: "gara-pop-meta" },
              moneyText(cand.price),
              h("span", { className: "gara-pick-dot", "aria-hidden": "true" }, "·"),
              cand.kindLabel,
              cand.source ? h("span", { className: "gara-pop-src" }, cand.source) : null
            )
          )
        ))
      )
      : h("p", { className: "gara-pop-empty" }, "候補がありません。DB にこの名前が無いため、推測はしません。"),
    h("div", { className: "gara-pop-foot" },
      h("button", {
        type: "button", className: "gara-mini",
        onClick: () => onPick(null)
      }, "このままにする"),
      h("button", { type: "button", className: "gara-mini", onClick: onClose }, "閉じる")
    ),
    h("p", { className: "gara-pop-hint" }, "↑↓ で候補を移動・Esc で閉じます")
  );
}

/* 項目の状態文。価格と判断の有無を重複させずに1回だけ言う。 */
  const stateText = (item, price) => {
    if (item.needsDecision === "unknown-name") return "名前が未解決";
    if (item.needsDecision === "pick-mode") return "入手手段を選んでください";
    if (item.needsDecision) return "価格なし";
    if (!price) return "価格なし";
    return "価格が決まっています";
  };

/* --- 1 項目 ---------------------------------------------------------------
   押すと候補が開く。名前は変わらない。変わるのは「どう手に入れたか」と価格。 */
function ImportRow({ item, onPick, onToggle }) {
  const [open, setOpen] = React.useState(false);
  const anchor = React.useRef(null);
  const chosen = item.candidates?.find((c) => c.chosen);
  const price = chosen ? chosen.price : item.price;
  const acquisition = chosen ? chosen.acquisitionLabel : "";

  return h("div", { className: "gara-row" },
    h("button", {
      ref: anchor,
      type: "button",
      className: `gara-row-hit${open ? " is-open" : ""}${item.needsDecision ? " is-unsure" : ""}`,
      "aria-haspopup": "dialog",
      "aria-expanded": open,
      onClick: () => setOpen((v) => !v)
    },
      h("span", { className: "gara-row-name" }, item.name),
      h("span", { className: "gara-row-meta" },
        acquisition ? h("span", { className: "gara-tag" }, acquisition) : null,
        moneyText(price),
        h("span", { className: "gara-pick-dot", "aria-hidden": "true" }, "·"),
        stateText(item, price)
      ),
      h("span", { className: "gara-row-caret", "aria-hidden": "true" }, "▾")
    ),
      h("button", {
        type: "button",
        className: `gara-switch${item.include ? " is-on" : ""}`,
        "aria-pressed": item.include,
        onClick: () => onToggle(item.key),
        title: item.include ? "計算に入れます" : "計算に入れません"
      },
      h("span", { className: "gara-switch-dot", "aria-hidden": "true" }),
      h("span", { className: "gara-switch-text" }, item.include ? "ON" : "OFF")
    ),
    open ? h(CandidatePopover, {
      anchor, item,
      onClose: () => { setOpen(false); anchor.current?.focus(); },
      onPick: (cand) => {
        if (cand) onPick(item.key, cand.key);
        else onPick(item.key, null);
        setOpen(false);
        anchor.current?.focus();
      }
    }) : null
  );
}

const GarasumadoGroup = ({ group, onPick, onToggle, onToggleAll }) => {
  const items = group.items;
  const included = items.filter((i) => i.include).length;
  const priced = items.filter((i) => (i.price || (i.candidates || []).some((c) => c.price))).length;
  /* n件中m件、ではなく「何件に価格があるか」を1文で言う。 */
  const note = items.length === 0 ? "該当なし"
    : priced === 0 ? `${items.length}件・価格が決まるものはありません`
    : priced === items.length ? `${items.length}件・すべて価格が決まります`
    : `${items.length}件のうち ${priced}件に価格があります`;
  return h("section", { className: "gara-group" },
    h("div", { className: "gara-group-head" },
      h("h4", { className: "gara-group-title" }, group.label),
      h("p", { className: "gara-group-note" }, note),
      h("div", { className: "gara-group-acts" },
        h("button", { type: "button", className: "gara-mini", onClick: () => onToggleAll(group.id, true), disabled: included === items.length }, "すべてON"),
        h("button", { type: "button", className: "gara-mini", onClick: () => onToggleAll(group.id, false), disabled: included === 0 }, "すべてOFF")
      )
    ),
    h("div", { className: "gara-rows", role: "group", "aria-label": `${group.label} の取り込み` },
      items.map((item, index) => h("div", { key: item.key, style: { "--i": index } },
        h(ImportRow, { item, onPick, onToggle })
      ))
    )
  );
};

/* --- パネル本体 ----------------------------------------------------------- */
const GarasumadoImportPanel = ({ onClose, onApply }) => {
  const [url, setUrl] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [manifest, setManifest] = React.useState(null);
  const [picked, setPicked] = React.useState({});
  const [lines, setLines] = React.useState([]);
  const [lineToggle, setLineToggle] = React.useState({});
  const [choices, setChoices] = React.useState({});
  const [decided, setDecided] = React.useState({});

  const load = async () => {
    const parsed = window.LBT_parseShareUrl?.(url);
    if (!parsed || !parsed.ok) { setError(parsed?.error || "URL を確認してください"); return; }
    setBusy(true);
    setError("");
    const result = await window.LBT_fetchGarasumadoDocument?.(url);
    setBusy(false);
    if (!result || !result.ok) { setError(result?.error || "取得に失敗しました"); return; }

    const db = window.DB || {};
    const index = window.LBT_buildNameIndex?.(db, {}) || null;
    const resolve = index ? (name) => window.LBT_resolveCandidates?.(index, name)?.[0] || null : () => null;

    const built = window.LBT_buildGarasumadoManifest?.(result.doc, { resolve }) || null;
    if (!built) { setError("取り込み内容を組み立てられませんでした"); return; }
    const annotated = window.LBT_annotateManifest?.(built, { db }) || built;

/* 各項目に候補を持たせる。予測変換はここで作る。
       持論の注意: DB に価格が無く、公式ルールの「抽出 / 購入」しか候補が無い
       種別（人格・E.G.O）は、どちらで手に入れたか名smell前から決められない。
       だから自動では ON にせず、ポップオーバーで選んでもらう。 */
      for (const group of annotated.groups) {
        for (const item of group.items) {
          item.candidates = window.LBT_candidatesFor?.(item, index) || [];
          const fromDb = item.candidates.filter((c) => c.acquisition === "db" && c.price);
          const fromRule = item.candidates.filter((c) => c.acquisition !== "db" && c.price);
          if (fromDb.length) {
            item.needsDecision = null;
            item.include = true;
          } else if (fromRule.length) {
            /* 名前は解けたが、手に入れた手段が不明。利用者の選択を待つ。 */
            item.needsDecision = "pick-mode";
            item.include = false;
          } else if (!item.candidates.length) {
            item.needsDecision = "unknown-name";
            item.include = false;
          }
        }
      }

    /* 購入履歴もメモの行ごとに推定する。 */
    const ops = [];
    for (const scenario of annotated.scenarios || []) {
      const found = window.LBT_proposePurchases?.(scenario.memo, { resolve }, {}) || { proposals: [], unresolved: [] };
      ops.push({ key: scenario.key || ("scenario:" + ops.length), title: scenario.name, memo: scenario.memo, proposals: found.proposals, unresolved: found.unresolved });
    }

    setManifest(annotated);
    setLines(ops);
    const next = {};
    for (const g of annotated.groups) for (const i of g.items) next[i.key] = i.include;
    setPicked(next);
    const nextLine = {};
    for (const op of ops) for (const p of op.proposals) nextLine[p.key] = p.include;
    setLineToggle(nextLine);
  };

  /* 候補を選んだとき。名前は変えずに、価格と入手手段だけを確定する。
     picked は「計算に含めるか」の bool のままに保つ。価格は候補が持つ。 */
  const pick = (itemKey, candidateKey) => {
    setChoices((prev) => ({ ...prev, [itemKey]: candidateKey }));
    if (!candidateKey) return;
    setPicked((prev) => {
      const chosen = findCandidate(itemKey, candidateKey);
      /* 価格が決まったら計算に含める。外したいときは switch を押す。 */
      return { ...prev, [itemKey]: Boolean(chosen && chosen.price) || Boolean(prev[itemKey]) };
    });
    /* 手段が決まったので「選んでください」は引っ込める。 */
    setDecided((prev) => ({ ...prev, [itemKey]: true }));
  };

  const findCandidate = (itemKey, candidateKey) => {
    const groups = manifest.groups.flatMap((g) => g.items.map((i) => ({ ...i, group: g.id })));
    const item = groups.find((i) => i.key === itemKey);
    return item ? (item.candidates || []).find((c) => c.key === candidateKey) : null;
  };

  /* 選択されたものを action の列にする。購入明細は「どのシナリオの支出か」
      を維持したまま渡す。順番は APPLY_IMPORT_BATCH が歸属を解決する。 */
  const apply = () => {
    if (!manifest) return;
    const keys = Object.keys(picked).filter((k) => picked[k]);
    const purchases = {};
    for (const op of lines) {
      const picks = op.proposals
        .filter((p) => lineToggle[p.key])
        .map((p) => ({ name: p.name, kind: p.kind, cost: p.cost }));
      if (picks.length) purchases[op.key] = picks;
    }
const result = window.LBT_toDispatchActions?.(manifest, keys, { purchases }) || { actions: [], skipped: [] };
  /* manifest と選択キーは「記録へ歸属する明細」を作るために必要。
     既存の利用側（アカウント編集）は読まないので、壊さず足すだけで済む。 */
  onApply?.({ actions: result.actions, skipped: result.skipped, rosterActions: result.actions, manifest, keys });
  onClose?.();
};

  /* 内訳は3つ。手段の選択が必要なもの・名前が解けないもの・それだけで足りるもの。 */
  const counts = manifest
    ? {
      total: manifest.groups.flatMap((g) => g.items).length,
      pickMode: manifest.groups.flatMap((g) => g.items).filter((i) => i.needsDecision === "pick-mode").length,
      unknownName: manifest.groups.flatMap((g) => g.items).filter((i) => i.needsDecision === "unknown-name").length,
      included: Object.values(picked).filter(Boolean).length,
      ops: lines.reduce((n, o) => n + o.proposals.length, 0),
      unknownLine: lines.reduce((n, o) => n + o.unresolved.length, 0),
      lineOn: Object.values(lineToggle).filter(Boolean).length
    }
    : { total: 0, pickMode: 0, unknownName: 0, included: 0, ops: 0, unknownLine: 0, lineOn: 0 };

  if (!manifest) {
    return h("div", { className: "gara" },
      h("h3", { className: "gara-title" }, "硝子窓から取り込む"),
      h("p", { className: "gara-lead" }, "共有URLを貼り付けると、そのキャラクターの所持が読み込まれます。取り込むものは1件ずつ選べます。"),
      h("div", { className: "gara-input-row" },
        h("label", { className: "acct-field gara-field" },
          h("span", { className: "gara-label" }, "硝子窓の共有URL"),
          h("input", {
            className: "input", value: url, autoFocus: true, inputMode: "url",
            placeholder: "https://lbt-garasumado.vercel.app/view/…",
            onChange: (event) => { setUrl(event.target.value); setError(""); }
          })
        ),
        h(Button, { size: "sm", variant: "primary", icon: "link", onClick: load, disabled: busy || !url.trim() },
          busy ? "読み込み中…" : "読み込む")
      ),
      error ? h("p", { className: "gara-error", role: "alert" }, error) : null,
      h("p", { className: "gara-note" }, "URLは保存しません。読み取りはその場だけです。")
    );
  }

  return h("div", { className: "gara" },
    h("div", { className: "gara-out" },
      h("h3", { className: "gara-title" }, manifest.character.name || "名称未設定"),
      h("p", { className: "gara-lead" }, `残高 LP ${manifest.currency.lp || "—"}・欠片 ${manifest.currency.shards || "—"}`)
    ),
    h("p", { className: "gara-hint" }, "項目を押すと変換候補が開きます。候補を選ぶと価格が決まります。"),
    manifest.groups.filter((g) => g.items.length).map((group) => h(GarasumadoGroup, {
      key: group.id,
      group: { ...group, items: group.items.map((i) => ({
          ...i,
          include: picked[i.key],
          needsDecision: decided[i.key] ? null : i.needsDecision,
          candidates: (i.candidates || []).map(function (c) { return { ...c, chosen: Boolean(decided[i.key]) && choices[i.key] === c.key }; })
        })) },
      onPick: pick,
      onToggle: (key) => setPicked({ ...picked, [key]: !picked[key] }),
      onToggleAll: (id, value) => {
        const next = { ...picked };
        for (const g of manifest.groups) if (g.id === id) for (const i of g.items) next[i.key] = value;
        setPicked(next);
      }
    })),
    counts.ops || counts.unknownName ? h("section", { className: "gara-group" },
      h("div", { className: "gara-group-head" },
        h("h4", { className: "gara-group-title" }, "購入履歴（予測変換）"),
        h("p", { className: "gara-group-note" }, `${counts.ops}件の候補・${counts.unknownLine}件は判定できませんでした`)
      ),
      h("div", { className: "gara-scen" },
        lines.filter((o) => o.proposals.length || o.unresolved.length).slice(0, 10).map((op) => h("div", { key: op.title + (op.memo || ""), className: "gara-scen-row" },
          h("span", { className: "gara-scen-name" }, op.title || "無題"),
          h("div", { className: "gara-rows" },
            op.proposals.map((p) => h("div", { key: p.key, className: "gara-row" },
              h("span", { className: "gara-row-name" }, p.name),
              h("span", { className: "gara-row-meta" },
                p.price ? (p.price.lp ? `${p.price.lp} LP` : `${p.price.shards} 欠片`) : "価格なし",
                h("span", { className: "gara-pick-dot", "aria-hidden": "true" }, "·"),
                `行 ${p.lineNo}`,
                p.confidence ? h("span", { className: "gara-pop-src" }, p.confidence) : null
              ),
              h("button", {
                type: "button",
                className: `gara-switch${lineToggle[p.key] ? " is-on" : ""}`,
                "aria-pressed": Boolean(lineToggle[p.key]),
                onClick: () => setLineToggle({ ...lineToggle, [p.key]: !lineToggle[p.key] })
              },
                h("span", { className: "gara-switch-dot", "aria-hidden": "true" }),
                h("span", { className: "gara-switch-text" }, lineToggle[p.key] ? "ON" : "OFF")
              )
            )),
            op.unresolved.map((u) => h("div", { key: "u" + u.lineNo, className: "gara-row is-unsure" },
              h("span", { className: "gara-row-name" }, `行 ${u.lineNo}`),
              h("span", { className: "gara-row-meta" }, "判定できませんでした")
            ))
          )
        ))
      )
    ) : null,
    h("div", { className: "gara-foot" },
      h("div", { className: "gara-foot-meta" },
        `${counts.included}件を所持へ・${counts.lineOn}件を明細へ`,
        [
          counts.pickMode ? h("span", { key: "pm", className: "gara-foot-warn" }, `${counts.pickMode}件は入手手段の選択が必要`) : null,
          counts.unknownName ? h("span", { key: "un", className: "gara-foot-warn" }, `${counts.unknownName}件は名前が解けていません`) : null
        ]
      ),
      h("div", { className: "gara-foot-acts" },
        h(Button, { size: "sm", variant: "ghost", onClick: () => setManifest(null) }, "URLを貼り直す"),
        h(Button, {
          size: "sm", variant: "primary", icon: "check", onClick: apply,
          disabled: counts.included === 0 && counts.lineOn === 0
        }, "この内容で取り込む")
      )
    ),
    h("p", { className: "gara-note" }, "取り込み後も記録とリザルトはいつでも編集できます。")
  );
};

window.GarasumadoImportPanel = GarasumadoImportPanel;
})();
