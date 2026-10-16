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
/* 確定結果に出す action 名の日本語。 */
  const ACTION_LABEL = {
    ADD_RESULT: "記録（リザルト）",
    ADD_ENTRY: "明細",
    ADD_ROSTER: "人格",
    ADD_ROSTER_EGO: "E.G.O",
    ADD_ROSTER_SUPPORT: "サポート",
    ADD_ROSTER_SPIRIT: "精神",
    SPEND_TICKET: "チケット消費"
  };

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
      if (item.needsAttribution && !item.pickedScenario && !(item.via && item.via.length)) return "帰属先を選んでください";
      if (!item.source) return "入手方法を選んでください";
      if (item.needsDecision === "unknown-name") return "名前が未解決";
      if (item.needsDecision === "pick-mode") return "入手手段を選んでください";
      if (item.needsDecision) return "価格なし";
      if (!price) return "価格なし";
      return "価格が決まっています";
    };

/* --- 1 項目 ---------------------------------------------------------------
   押すと候補が開く。名前は変わらない。変わるのは「どう手に入れたか」と価格。 */
function ImportRow({ item, onPick, onToggle, onPickIdentity }) {
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
item.decide ? h("div", { className: "gara-decide" },
        /* 同名複数で一意に決まらないときだけ、候補名を並べ選ぶ。 */
        (item.identityCandidates && item.identityCandidates.length > 1)
          ? h("label", { className: "gara-decide-field" },
            h("span", { className: "gara-label" }, "どれのことか"),
            h("select", {
              className: "input",
              value: item.picked?.key || "",
              "aria-label": `${item.name} がどのもの か`,
              onChange: (event) => {
                const found = item.identityCandidates.find((c) => c.key === event.target.value) || null;
                onPickIdentity(item.key, { picked: found });
              }
            },
              h("option", { value: "" }, "選んでください"),
              item.identityCandidates.map((c) => h("option", { key: c.key, value: c.key },
                c.kind === "persona" ? `${c.mode === "t" ? "外套" : "通常"}｜${c.name}` : c.rank ? `${c.rank}｜${c.name}` : c.name))
            )
          )
: null,
        h("label", { className: "gara-decide-field" },
          h("span", { className: "gara-label" }, "どのシナリオのものか"),
          h("select", {
            className: "input",
            value: item.pickedScenario || "",
            "aria-label": `${item.name} の帰属先シナリオ`,
            onChange: (event) => onPickIdentity(item.key, { pickedScenario: event.target.value })
          },
            h("option", { value: "" }, "選んでください"),
            (item.scenarioOptions || []).map((name) => h("option", { key: name, value: name }, name))
          )
        ),
        h("label", { className: "gara-decide-field" },
            h("span", { className: "gara-label" }, "入手方法"),
          h("select", {
            className: "input",
            value: item.source || "",
            "aria-label": `${item.name} の入手方法`,
            onChange: (event) => onPickIdentity(item.key, { source: event.target.value })
          },
            h("option", { value: "" }, "選んでください"),
            (item.sourceOptions || []).map((s) => h("option", { key: s.id, value: s.id }, s.label))
          )
        ),
        (item.via && item.via.length)
          ? h("p", { className: "gara-note" }, `履歴から判明：${item.via.join(" / ")}${item.matchTier === "loose" ? "（表記ゆれ照合）" : ""}`)
          : null
      ) : null,
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

/* 照合の階級。表示の文言をここ 1 か所に閉じる。 */
  const TIER_NOTE = {
    A: "獲得行と一致",
    C: "支出行と一致",
    D: "本文に言及",
    M: "利用者が指定"
  };

  /* 1シナリオ＝1リザルトのカード。割当済みの所持は最初からここに出る。
     利用者が触るのはこの中の「未決」行だけ。 */
  function ResultCard({ block, scenarioOptions, sourceOptions, onPickIdentity }) {
    const income = block.income || { lp: 0, shards: 0 };
    const note = "収入 LP " + (income.lp || 0) + "・欠片 " + (income.shards || 0)
      + "・割当 " + block.items.length + "件";
    return h("section", { className: "gara-group gara-result" },
      h("div", { className: "gara-group-head" },
        h("h4", { className: "gara-group-title" }, block.name || "無題"),
        h("p", { className: "gara-group-note" }, note)
      ),
      h("div", { className: "gara-rows", role: "group", "aria-label": (block.name || "無題") + " の割当" },
        block.items.map((item) => h("div", {
          key: item.key,
          className: "gara-row gara-row-assigned" + (item.needsSource ? " is-unsure" : "")
        },
          h("span", { className: "gara-row-name" }, item.name),
          h("span", { className: "gara-row-meta" }, [
            item.tier ? h("span", { className: "gara-tag" }, TIER_NOTE[item.tier] || "") : null,
            item.needsSource ? "入手方法を選んでください" : (item.source || "配布")
          ]),
          h("label", { className: "gara-decide-field" },
            h("span", { className: "gara-label" }, "帰属先"),
            h("select", {
              className: "input",
              value: item.tier === "M" ? block.name : "",
              "aria-label": item.name + " の帰属先シナリオ",
              onChange: (event) => onPickIdentity(item.key, { pickedScenario: event.target.value })
            },
              h("option", { value: "" }, "選んでください"),
              scenarioOptions.map((name) => h("option", { key: name, value: name }, name))
            )
          ),
          h("label", { className: "gara-decide-field" },
            h("span", { className: "gara-label" }, "入手方法"),
            h("select", {
              className: "input",
              value: item.source || "",
              "aria-label": item.name + " の入手方法",
              disabled: item.automatic,
              onChange: (event) => onPickIdentity(item.key, { source: event.target.value })
            },
              h("option", { value: "" }, "選んでください"),
              sourceOptions.map((s) => h("option", { key: s.id, value: s.id }, s.label))
            )
          )
        )),
        block.items.length === 0 ? h("p", { className: "gara-note" }, "まだ何も割り当てられていません。") : null
      )
    );
  }

  /* 未割当。1件ずつ並べて select を並べるのは手順が増えるだけなので、
     件数と内訳、一括操作だけを出す。 */
  function UnassignedPool({ items, onPickIdentity, onAssignAll }) {
    if (!items.length) return null;
    const multi = items.filter((i) => i.candidates.length > 1).length;
    const note = items.length + "件（照合できるシナリオがありません。"
      + multi + "件は候補が複数あります）";
    return h("section", { className: "gara-group" },
      h("div", { className: "gara-group-head" },
        h("h4", { className: "gara-group-title" }, "未割当"),
        h("p", { className: "gara-group-note" }, note),
        h("div", { className: "gara-group-acts" },
          h("button", { type: "button", className: "gara-mini", onClick: () => onAssignAll("") },
            "全て OFF のままにする"),
          h("button", { type: "button", className: "gara-mini", onClick: () => onAssignAll("given") },
            "全て「配布」として入れる")
        )
      ),
      h("div", { className: "gara-rows" },
        items.slice(0, 40).map((item) => h("div", {
          key: item.key,
          className: "gara-row is-unsure"
        },
          h("span", { className: "gara-row-name" }, item.name),
          h("span", { className: "gara-row-meta" }, item.reason),
          item.candidates.length === 1
            ? h("span", { className: "gara-tag" }, "候補: " + item.candidates[0].name)
            : null
        )),
        items.length > 40 ? h("p", { className: "gara-note" }, "ほか " + (items.length - 40) + " 件") : null
      )
    );
  }

const GarasumadoGroup = ({ group, onPick, onToggle, onToggleAll, onPickIdentity }) => {
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
        h(ImportRow, { item, onPick, onToggle, onPickIdentity })
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

    const built = window.LBT_buildGarasumadoManifest?.(result.doc, {
      resolve,
      /* 候補を絞らない。1 件に-collapse せず同名すべてを utilisation に出させる。 */
      candidates: (name) => window.LBT_resolveCandidates?.(index, name) || []
    }, db) || null;
    if (!built) { setError("取り込み内容を組み立てられませんでした"); return; }
    const annotated = window.LBT_annotateManifest?.(built, { db }) || built;

    /* 帰属先（どのシナリオ）と入手方法は利用者が決める。
       シナリオに載っていない所持品は、自動では紐付けず選ばせる。 */
    const scenarioOptions = (annotated.scenarios || []).map((s) => s.name).filter(Boolean);
    const sourceOptions = window.LBT_garasumado?.SOURCES || [];

/* 各項目に候補を持たせる。予測変換はここで作る。
       持論の注意: DB に価格が無く、公式ルールの「抽出 / 購入」しか候補が無い
       種別（人格・E.G.O）は、どちらで手に入れたか名smell前から決められない。
       だから自動では ON にせず、ポップオーバーで選んでもらう。 */
      for (const group of annotated.groups) {
        for (const item of group.items) {
          /* identityCandidates は同名候補（選ぶ対象）。candidates は購入候補で別物。 */
          item.identityCandidates = item.identityCandidates || item.candidates || [];
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
          /* 由来が「抽出チケット」「配布」なら支出ではない。core:9502 の抽出は
             100欠片でも、チケットなら 0、配布も 0。
             上の候補判定より後に置く。ここに置いていないと、DB の購入価格が
             include=true を上書きして、チケットで得た E.G.O に購入金額を請求する。 */
          if (item.provenance && item.provenance.priced === false
            && (item.provenance.id === "gachaTicket" || item.provenance.id === "grant")) {
            item.needsDecision = null;
            item.include = false;
          }
          /* 帰属が決まっており、入手方法も決まっていれば選択画面は出さない。 */
          item.scenarioOptions = scenarioOptions;
          item.sourceOptions = sourceOptions;
          const attributed = (item.via && item.via.length) || Boolean(item.pickedScenario);
          item.decide = !(attributed && (item.source || item.provenance?.priced === false));
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

  /* 帰属先（どのシナリオ）と入手方法の選択を manifest へ書き戻す。
     toDispatchActions は manifest を直接読むので、ここが唯一の書き込み口。 */
  /* 帰属先と入手方法の選択は UI 状態として持つ。manifest を直接書き直すと
     再描画で直前の選択が落ちるため、manifest は読み取り専用のままにする。 */
  const [identity, setIdentity] = React.useState({});
  /* 確定後の結果。シミュレーションは「反映前の1手前」なので、
     確定した時点で入る内容を残し、自動で閉じずに確認できるようにする。 */
  const [confirmed, setConfirmed] = React.useState(null);
  const onPickIdentity = (itemKey, next) => {
    setIdentity((prev) => ({ ...prev, [itemKey]: { ...(prev[itemKey] || {}), ...next } }));
    setPicked((prev) => ({ ...prev, [itemKey]: true }));
  };

  /* 利用者の選択を manifest に被せる。manifest 自体は書き換えない。 */
  const merged = manifest
    ? {
      ...manifest,
      groups: manifest.groups.map((g) => ({
        ...g,
        items: g.items.map((i) => {
          const item = { ...i, ...(identity[i.key] || {}) };
          /* 未決かどうかは保存せず、その都度ここから決める。 */
          const attributed = (item.via && item.via.length) || Boolean(item.pickedScenario);
          /* 候補が複数なら、どれか1つを明示的に選ばせないと確定しない。 */
          const identityOk = !(item.identityCandidates && item.identityCandidates.length > 1)
            || Boolean(item.picked);
          item.decide = !(attributed && identityOk && (item.source || item.provenance?.priced === false));
          return item;
        })
      }))
    }
    : null;

  /* 割当の下書き。UI とは独立した純関数から作る。
     画面に出る数字と実際に入る action が必ず一致するのは、ここを唯一の情報源に
     しているため（別途集計し直さない）。 */
  const draft = React.useMemo(() => {
    if (!manifest) return null;
    const database = window.DB || {};
    const idx = window.LBT_buildNameIndex ? window.LBT_buildNameIndex(database, {}) : null;
    const chosen = Object.keys(picked).filter((k) => picked[k]);
    return window.LBT_buildResultDraft ? window.LBT_buildResultDraft(manifest, {
      db: database,
      identity,
      selected: chosen,
      resolve: idx ? (name) => (window.LBT_resolveCandidates ? window.LBT_resolveCandidates(idx, name)?.[0] || null : null) : () => null
    }) : null;
  }, [manifest, identity, picked]);

  /* 未割当を一括で「配布」にする／OFF に戻す。1件ずつ選ばせないための逃げ道。 */
  const assignAll = (source) => {
    if (!draft) return;
    const patch = {};
    for (const item of draft.unassigned) {
      if (!source) { setPicked((prev) => ({ ...prev, [item.key]: false })); continue; }
      patch[item.key] = { ...(identity[item.key] || {}), source };
    }
    if (Object.keys(patch).length) setIdentity((prev) => ({ ...prev, ...patch }));
    setPicked((prev) => {
      const next = { ...prev };
      for (const item of draft.unassigned) next[item.key] = Boolean(source);
      return next;
    });
  };

  const findCandidate = (itemKey, candidateKey) => {
    const groups = manifest.groups.flatMap((g) => g.items.map((i) => ({ ...i, group: g.id })));
    const item = groups.find((i) => i.key === itemKey);
    return item ? (item.candidates || []).find((c) => c.key === candidateKey) : null;
  };

  /* 選択されたものを action の列にする。購入明細は「どのシナリオの支出か」
      を維持したまま渡す。順番は APPLY_IMPORT_BATCH が帰属を解決する。 */
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
const result = window.LBT_toDispatchActions?.(merged, keys, { purchases }) || { actions: [], skipped: [] };
  /* manifest と選択キーは「記録へ帰属する明細」を作るために必要。
     既存の利用側（アカウント編集）は読まないので、壊さず足すだけで済む。 */
  const applied = { actions: result.actions, skipped: result.skipped, rosterActions: result.actions, manifest, keys };
  onApply?.(applied);
  /* ここでコンバート確定。画面は閉じずに確定結果を見せる。 */
  setConfirmed({
    counts: appliedSummary(result.actions),
    skipped: applied.skipped || [],
    simulation: draft ? draft.simulation : null
  });
};

/* 実際に入る action の内訳。シミュレーションと同じ数のはずなので、
   食い違えば「表示と実体がずれた」と分かる。 */
function appliedSummary(actions) {
  const byType = {};
  let held = 0;
  for (const a of actions || []) {
    byType[a.type] = (byType[a.type] || 0) + 1;
    if (String(a.type || "").startsWith("ADD_ROSTER")) held += 1;
  }
  return { byType, held, total: (actions || []).length };
}

  /* 内訳は3つ。手段の選択が必要なもの・名前が解けないもの・それだけで足りるもの。 */
/* 帰属先と入手方法が未決の項目。取り込みの完了条件から除く。
     判定の芽は純関数（draft）なので、画面が別途数えない。 */
  const pendingCount = draft ? (draft.simulation.awaitingSource || 0) : 0;
  const counts = merged
    ? {
      total: merged.groups.flatMap((g) => g.items).length,
      pickMode: manifest.groups.flatMap((g) => g.items).filter((i) => i.needsDecision === "pick-mode").length,
      unknownName: manifest.groups.flatMap((g) => g.items).filter((i) => i.needsDecision === "unknown-name").length,
      included: Object.values(picked).filter(Boolean).length,
      ops: lines.reduce((n, o) => n + o.proposals.length, 0),
      unknownLine: lines.reduce((n, o) => n + o.unresolved.length, 0),
      lineOn: Object.values(lineToggle).filter(Boolean).length
    }
    : { total: 0, pickMode: 0, unknownName: 0, included: 0, ops: 0, unknownLine: 0, lineOn: 0 };

  if (!manifest) {
  /* 確定済みなら確定結果だけを出す。シミュレーションは「反映前の1手前」で、
     確定した内容をそのまま確認できるようにする。画面は自動で閉じない。 */
  if (confirmed) {
    const sim = confirmed.simulation;
    const mismatched = Boolean(sim) && sim.held !== confirmed.counts.held;
    const typeRows = Object.entries(confirmed.counts.byType)
      .sort((a, b) => b[1] - a[1])
      .map(([type, n]) => h("div", { key: type, className: "gara-row" },
        h("span", { className: "gara-row-name" }, ACTION_LABEL[type] || type),
        h("span", { className: "gara-row-meta" }, n + "件")
      ));
    const lead = "記録 " + (confirmed.counts.byType.ADD_RESULT || 0) + "件・所持 "
      + confirmed.counts.held + "件・処理 " + confirmed.counts.total + "件";
    return h("div", { className: "gara" },
      h("div", { className: "gara-out" },
        h("h3", { className: "gara-title" }, "変換を確定しました"),
        h("p", { className: "gara-lead" }, lead)
      ),
      mismatched
        ? h("p", { className: "gara-foot-warn" },
          "シミュレーション（所持 " + sim.held + "件）と実際に入った数（"
            + confirmed.counts.held + "件）が違います。記録を確認してください。")
        : null,
      h("div", { className: "gara-rows" }, typeRows),
      confirmed.skipped.length
        ? h("p", { className: "gara-note" },
          "入れなかった項目が " + confirmed.skipped.length + " 件あります。履歴には残っていません。")
        : null,
      h("div", { className: "gara-foot" },
        h("div", { className: "gara-foot-acts" },
          h(Button, { size: "sm", variant: "primary", icon: "check", onClick: onClose }, "閉じる")
        )
      )
    );
  }

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
    (manifest.counts?.spiritsExcluded || 0) > 0
      ? h("p", { className: "gara-note" },
        `初期精神系 ${manifest.counts.spiritsExcluded} 件は最初から持っているものとして数えるため、計上対象外にしました。`)
      : null,
    draft && draft.blocks.filter((b) => b.items.length).map((block) => h(ResultCard, {
      key: block.key || block.name,
      block,
      scenarioOptions,
      sourceOptions,
      onPickIdentity
    })),
    draft && draft.unassigned.length
      ? h(UnassignedPool, { items: draft.unassigned, onPickIdentity, onAssignAll: assignAll })
      : null,
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
              h("span", { className: "gara-row-name" }, u.line),
              h("span", { className: "gara-row-meta" }, `行 ${u.lineNo}・判定できませんでした`)
            ))
          )
        ))
      )
    ) : null,
    /* シミュレーション（適用前）。実際に入る action と同じ純関数から出すので、
       この数字と取り込み後の帳は一致する。 */
    draft ? h("div", { className: "gara-foot" },
      h("div", { className: "gara-foot-meta" },
        `シミュレーション：リザルト ${draft.simulation.results}件・所持 ${draft.simulation.held}件・`
        + `LP ${draft.simulation.lp}・欠片 ${draft.simulation.shards}`,
        [
          draft.simulation.unassigned
            ? h("span", { key: "un", className: "gara-foot-warn" }, `未割当 ${draft.simulation.unassigned}件`)
            : null,
          pendingCount
            ? h("span", { key: "pd", className: "gara-foot-warn" }, `${pendingCount}件は入手方法の選択が必要`)
            : null
        ]
      )
    ) : null,
    h("div", { className: "gara-foot" },
      h("div", { className: "gara-foot-meta" },
        `${counts.included}件を所持へ・${counts.lineOn}件を明細へ`,
        [
          counts.pickMode ? h("span", { key: "pm", className: "gara-foot-warn" }, `${counts.pickMode}件は入手手段の選択が必要`) : null,
          counts.unknownName ? h("span", { key: "un", className: "gara-foot-warn" }, `${counts.unknownName}件は名前が解けていません`) : null,
          pendingCount ? h("span", { key: "pd", className: "gara-foot-warn" }, `${pendingCount}件は帰属先・入手方法の選択が必要`) : null
        ]
      ),
      h("div", { className: "gara-foot-acts" },
        h(Button, { size: "sm", variant: "ghost", onClick: () => setManifest(null) }, "URLを貼り直す"),
        h(Button, {
          size: "sm", variant: "primary", icon: "check", onClick: apply,
          disabled: pendingCount > 0 || (counts.included === 0 && counts.lineOn === 0),
          title: pendingCount > 0 ? "帰属先と入手方法を決めてください" : ""
        }, "変換を確定する")
      )
    ),
    h("p", { className: "gara-note" }, "取り込み後も記録とリザルトはいつでも編集できます。")
  );
};

window.GarasumadoImportPanel = GarasumadoImportPanel;
})();