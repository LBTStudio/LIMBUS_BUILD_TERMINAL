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
    ADD_GARASUMADO_PERSONA: "人格シート",
    SPEND_TICKET: "チケット消費"
  };

  /* DB候補の選択値は「種別:名前」。ギャンブラーのようにサポパと精神の両方に
     同名が実在するため、名前だけでは種別を一意に決められない。 */
  const candKey = (cand) => (cand ? cand.kind + ":" + cand.name : "");
  const dupNamesOf = (candidates) => new Set(
    (candidates || []).map((c) => c.name).filter((n, i, all) => all.indexOf(n) !== i)
  );

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

/* 未割当は右レールの1本に統合する。同期/解析は獲得でも購入でも
     ないためリストには入れず、それ以外の未割当は全部入れる。
     ドラッグが使えない環境でも選べるように、各行に帰属先の select を置く。
     カードの行をここへ戻すと未割当に返り、帰属先を選び直せる（再分類）。 */
  function UnclassifiedRail({ items, scenarioOptions, onPickIdentity, onReturnItem, focusKey, onFocusHandled }) {
    const [over, setOver] = React.useState(false);
    const rowRefs = React.useRef({});
    /* 戻した直後は、返ってきた行へフォーカスを移す。カードの行が消えて
       フォーカスが body に落ちると、キーボード操作の続きが分からなくなる。 */
    React.useEffect(() => {
      if (!focusKey) return;
      const el = rowRefs.current[focusKey];
      if (!el) return;
      el.focus();
      if (onFocusHandled) onFocusHandled();
    }, [focusKey, items.length]);
    return h("aside", {
      className: "gara-rail" + (over ? " is-over" : ""),
      "aria-label": "未割当の所持",
      onDragOver: (event) => {
        if (!onReturnItem) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        if (!over) setOver(true);
      },
      onDragLeave: (event) => {
        if (event.currentTarget === event.target && over) setOver(false);
      },
      onDrop: (event) => {
        if (!onReturnItem) return;
        event.preventDefault();
        if (over) setOver(false);
        const key = event.dataTransfer.getData("text/plain");
        if (key) onReturnItem(key);
      }
    },
      h("h4", { className: "gara-rail-title" }, `未割当 ${items.length}件`),
      h("p", { className: "gara-rail-hint" }, "カードへドラッグで割当。カードの行をここへ戻すと再分類できます"),
      h("div", { className: "gara-rail-list" },
        items.map((item) => h("div", {
          key: item.key,
          ref: (el) => {
            if (el) rowRefs.current[item.key] = el;
            else delete rowRefs.current[item.key];
          },
          tabIndex: -1,
          className: "gara-row gara-row-assigned is-unsure gara-chip",
          draggable: true,
          onDragStart: (event) => {
            event.dataTransfer.setData("text/plain", item.key);
            event.dataTransfer.effectAllowed = "move";
          }
        },
          /* 名称は折り返して全文を見せる。レールは細いので select と横並びにすると
             名前が数文字で切れ、どれがどれだか分からない（2026-10-17 実機確認）。 */
          h("div", { className: "gara-item-head" },
            h("span", { className: "gara-chip-name" }, item.name),
            h("span", { className: "gara-row-meta" }, item.reason)
          ),
          h("div", { className: "gara-item-acts gara-item-acts-one" },
            h("label", { className: "gara-decide-field" },
              h("span", { className: "gara-label" }, "帰属先"),
              h("select", {
                className: "input",
                value: item.pickedScenario || "",
                "aria-label": item.name + " の帰属先シナリオ（未分類）",
                onChange: (event) => onPickIdentity(item.key, { pickedScenario: event.target.value })
              },
                h("option", { value: "" }, "選んでください"),
                scenarioOptions.map((name) => h("option", { key: name, value: name }, name))
              )
            )
          )
        ))
      ),
      items.length ? null : h("p", { className: "gara-rail-hint" }, "カードから戻した所持はここに出ます")
    );
  }

  /* 照合の階級。表示の文言をここ 1 か所に閉じる。 */
  const TIER_NOTE = {
    A: "獲得行と一致",
    C: "支出行と一致",
    D: "本文に言及",
    M: "利用者が指定"
  };

  /* 1シナリオ＝1リザルトのカード。見本（記録のリザルトカード）と同じ言語で
     見せる: .cardの面、card-headerの罫線、収入の金色大数字ペア。
     行の中身（入手方法・DB候補）だけが取り込み独自。帰属先はカード所属が
     決める。選び直しは行を未割当リストへ戻す（ドラッグ、または「未割当へ」）。 */
  function ResultCard({
    block, scenarioOptions, sourceOptions, onPickIdentity, onDropItem, onReturnItem,
    existingResults = [], legacyCandidates = [], legacyTargetId = "", onPickLegacyTarget,
    sourceAlreadyImported = false, purchaseCandidates = [], onTogglePurchaseCandidate
  }) {
    const income = block.income || { lp: 0, shards: 0 };
    /* 無題は名前が無いのでカード名として使えない。個数と合計で示す。 */
    const title = block.name && block.name !== "無題"
      ? block.name
      : "無題 " + block.orphanNote;
    /* 金額は見本と同じbigNumペア。単位は数字の横に小さく添えるだけ。 */
    const bigNum = (value, tone) =>
      h("b", { className: `ledger-chip-num is-${tone}` }, (Number(value) || 0).toLocaleString("ja-JP"));
    const pair = (value, tone, label) =>
      h("span", { className: "ledger-pair" }, bigNum(value, tone),
        h("span", { className: "ledger-pair-label" }, label));
    return h("section", { className: "card gara-result" },
      h("div", { className: "card-header gara-card-head" },
        h("span", { className: "ledger-card-title" }, title),
        h("span", { className: "ledger-card-spent" }, `割当 ${block.items.length}件`)
      ),
      h("div", { className: "card-body gara-card-body" },
        h("div", { className: "ledger-card-income" },
          pair(income.lp, "lp", "LP"),
          pair(income.shards, "shard", "欠片")
        ),
        Array.isArray(purchaseCandidates) && purchaseCandidates.length
          ? h("div", { className: "gara-note gara-purchase-review", role: "group", "aria-label": title + " の購入候補" },
            h("strong", null, "購入候補（初期状態は未承認）"),
            h("p", null, "候補名だけの言及は支出に計上しません。チェックした項目だけを購入明細・シミュレーションへ反映します。"),
            purchaseCandidates.map((proposal) => h("label", {
              key: proposal.approvalKey,
              className: "gara-purchase-candidate"
            },
              h("input", {
                type: "checkbox",
                checked: Boolean(proposal.approved),
                onChange: (event) => onTogglePurchaseCandidate?.(proposal.approvalKey, event.target.checked)
              }),
              h("span", { className: "gara-row-name" }, String(proposal.name || "名前不明")),
              h("span", { className: "gara-row-meta" }, moneyText(proposal.cost)),
              h("small", null, "原文 " + String(proposal.lineNo || "?") + "行目：" + String(proposal.line || ""))
            ))
          )
          : null,
        Array.isArray(block.currencyDiscrepancies) && block.currencyDiscrepancies.length
          ? h("div", { className: "gara-note gara-note-warn", role: "status" },
            h("strong", null, "価格差の確認（元記録額は自動修正していません）"),
            block.currencyDiscrepancies.map((entry, index) => h("p", { key: "currency-" + index },
              String(entry.title || "記録価格とDB価格の差")
              + "：" + String(entry.detail || "価格を確認してください")
              + (entry.line ? "（原文：" + String(entry.line) + "）" : "")
            ))
          )
          : null,
        Array.isArray(block.sourceAudits) && block.sourceAudits.some((entry) => entry && entry.severity !== "info")
          ? h("div", { className: "gara-note gara-note-warn", role: "status" },
            h("strong", null, "金額・検出監査（硝子窓側／ターミナル側）"),
            block.sourceAudits.filter((entry) => entry && entry.severity !== "info").map((entry, index) => h("p", { key: "audit-" + index },
              "[" + (entry.side === "source-data" ? "硝子窓側の元記録" : "ターミナル側の検出") + "] "
              + String(entry.message || "確認してください")
              + (entry.lineIndex ? "（原文 " + entry.lineIndex + "行目" + (entry.line ? "：" + entry.line : "") + "）" : "")
            ))
          )
          : null,
        Array.isArray(block.reasons) && block.reasons.length
          ? h("div", { className: "gara-note gara-note-warn", role: "status" },
            h("strong", null, "原文の読み取り要確認（" + block.reasons.length + "件）"),
            block.reasons.map((entry, index) => h("p", { key: index },
              String(entry.reason || "読み取りを確認してください")
              + (entry.line ? "（原文：" + entry.line + "）" : "")
            ))
          )
          : null,
        sourceAlreadyImported
          ? h("p", { className: "gara-note" }, "同じ共有元のリザルトを特定しました。確定時に既存記録を更新し、二重追加を防ぎます。")
          : legacyCandidates.length
            ? h("div", { className: "gara-legacy-replace" },
              h("label", { className: "gara-decide-field" },
                h("span", { className: "gara-label" }, "旧形式の既存リザルトを更新（任意）"),
                h("select", {
                  className: "input",
                  value: legacyTargetId || "",
                  "aria-label": (block.name || "無題") + " の旧形式リザルト置換先",
                  onChange: (event) => onPickLegacyTarget?.(block.key, event.target.value)
                },
                  h("option", { value: "" }, "新規として追加（既存記録を変更しない）"),
                  legacyCandidates.map((result) => {
                    const cur = result.income || {};
                    return h("option", { key: result.id, value: result.id },
                      String(result.date || "日付不明") + " · LP " + (Number(cur.lp) || 0)
                      + " / 欠片 " + (Number(cur.shards) || 0) + " · ID " + String(result.id).slice(-6));
                  })
                )
              ),
              legacyTargetId
                ? h("p", { className: "gara-note gara-note-warn" },
                  "選択した旧形式リザルトの収入・消費記録を今回の解析結果で置き換えます。紐づく明細はすべて削除して再作成するため、手入力の明細が含まれていないか確認してください。")
                : h("p", { className: "gara-note" },
                  "共有元キーが残っていない旧記録は自動では上書きしません。ここで対象を明示した場合だけ置き換えます。")
            )
            : null,
        h("div", {
          className: "gara-rows",
          role: "group",
          "aria-label": (block.name || "無題") + " の割当",
          onDragOver: (event) => {
            if (!onDropItem) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
          },
          onDrop: (event) => {
            if (!onDropItem) return;
            event.preventDefault();
            const key = event.dataTransfer.getData("text/plain");
            if (key) onDropItem(key, block.name || "");
          }
        },
        block.items.map((item) => h("div", {
          key: item.key,
          className: "gara-row gara-row-assigned" + (item.needsSource ? " is-unsure" : ""),
          /* 帰属先はカードの所属で決まる。やり直すときはこの行を右の
             未割当リストへ戻す（再分類）。決まった行に select は置かない。 */
          draggable: true,
          title: "右の未割当リストへ戻すと帰属先を選び直せます",
          onDragStart: (event) => {
            event.dataTransfer.setData("text/plain", item.key);
            event.dataTransfer.effectAllowed = "move";
          }
        },
          /* 名称は操作フィールドと縦に分ける。横並びだと select が幅を奪い
             名称が数文字で切れる（2026-10-17 実機確認）。 */
          h("div", { className: "gara-item-head" },
            h("span", { className: "gara-row-name" }, item.name),
            h("span", { className: "gara-row-meta" }, [
              item.tier ? h("span", { className: "gara-tag" }, TIER_NOTE[item.tier] || "") : null,
              item.needsSource ? "入手方法を選んでください" : (item.source || "配布")
            ])
          ),
          h("div", { className: "gara-item-acts" },
            h("label", { className: "gara-decide-field" },
            h("span", { className: "gara-label" }, "DB候補"),
            h("select", {
              className: "input",
              value: item.picked
                ? candKey(item.picked)
                : (item.candidatesNeedPick ? "" : (item.candidates.length === 1 ? candKey(item.candidates[0]) : "")),
              "aria-label": item.name + " の DB 候補",
              disabled: item.candidatesNeedPick ? false : item.candidates.length < 2,
              /* 選んだ候補は picked（完全な候補オブジェクト）として渡す。
                 pickedCandidate（名前だけ）は action を作る側が読まないため、
                 これだけでは選んでも何も変わらなかった。 */
              onChange: (event) => {
                const name = event.target.value;
                /* 候補は種別まで見て選ぶ。同名の別種（ギャンブラーはサポパと
                   精神の両方に実在する）を名前だけで比べると、先頭が常に
                   選ばれて誤った種別の明細が入る。 */
                const found = (item.candidates || []).find((c) => candKey(c) === name) || null;
                onPickIdentity(item.key, { picked: found, pickedCandidate: name });
              }
            },
              h("option", { value: "" }, item.candidatesNeedPick
                ? "選んでください"
                : (item.candidates.length > 1 ? "選んでください" : (item.candidates[0] ? item.candidates[0].name : "候補なし"))),
              item.candidates
                .map((cand) => h("option", {
                  key: candKey(cand),
                  value: candKey(cand)
                }, dupNamesOf(item.candidates).has(cand.name)
                  ? cand.name + "（" + (window.LBT_kindLabel?.(cand.kind) || cand.kind) + "）"
                  : cand.name))
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
          ),
          /* ドラッグが使えない環境（キーボード操作を含む）でも戻せるように、
             同じ戻しをボタンでも置く。 */
          h("button", {
            type: "button",
            className: "gara-mini",
            onClick: () => onReturnItem?.(item.key),
            title: item.name + " を未割当へ戻して帰属先を選び直す"
          }, "未割当へ")
          )
        )),
        block.items.length === 0
          ? h("p", { className: "ledger-empty-note" },
            (income.lp || income.shards)
              ? "報酬は記録済みです。割当てるものは下のリストから選んでください。"
              : (String(block.memo || "").trim()
                ? "メモに報酬の金額が見つからないため、収入は 0 です。金額を書き足してください。"
                : "メモが空のため、記録できる報酬がありません。"))
          : null
        )
      )
    );
  }

const GarasumadoGroup = ({ group, onPick, onToggle, onToggleAll, onPickIdentity }) => {
  const items = group.items;
  /* 所持アイテムの候補はアイテムカタログから引く。名前索引（人格・E.G.O）には
     アイテムが無いため、そのままでは候補が出ず選び直せない。 */
  const withCandidates = (item) => {
    if (group.id !== "items") return item;
    const cands = window.LBT_overlapCandidates?.(item.name, window.DB || {}, { only: "items" }) || [];
    /* 一字違いの別アイテム（鎮痛剤 ↔ 鎮静剤）を勝手に採ると、買った覚えのない
       物を所持に足すことになる。名前が同じとき以外は利用者に選ばせる。 */
    const same = cands.length === 1 && String(cands[0].name).trim() === String(item.name).trim();
    return { ...item, candidates: cands, candidatesNeedPick: cands.length > 0 && !same };
  };
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
        h(ImportRow, { item: withCandidates(item), onPick, onToggle, onPickIdentity })
      ))
    )
  );
};

/* --- パネル本体 ----------------------------------------------------------- */
const GarasumadoImportPanel = ({ onClose, onApply, existingPersonas = [], existingResults = [] }) => {
  const [url, setUrl] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [manifest, setManifest] = React.useState(null);
  const [picked, setPicked] = React.useState({});
  const [lines, setLines] = React.useState([]);
  /* 購入候補は表示だけでは課金しない。明示的なチェックを承認として扱う。 */
  const [purchaseApprovals, setPurchaseApprovals] = React.useState({});
  const [choices, setChoices] = React.useState({});
  const [decided, setDecided] = React.useState({});
  /* 残高照合は元文書（doc）にも当てるので、manifest と並べて保持する。 */
  const [doc, setDoc] = React.useState(null);
  const [urlReport, setUrlReport] = React.useState(null);
  const [bundleReport, setBundleReport] = React.useState(null);
  const [progress, setProgress] = React.useState("");
  /* 人格共有URLはキャラクター所持・履歴とは別パネルで、人格ごとに識別して取り込む。 */
  const [personaItems, setPersonaItems] = React.useState(null);
  const [personaPicked, setPersonaPicked] = React.useState({});
  const [personaConfirmed, setPersonaConfirmed] = React.useState(null);
  const currentRosterPersonas = Array.isArray(existingPersonas) ? existingPersonas : [];
  const personaNameKey = (value) => String(value || "").replace(/[\\s\\u3000]/g, "").toLowerCase();
  const personaAlreadyImported = (id) => currentRosterPersonas.some((entry) =>
    entry?.importSource?.kind === "garasumado-persona"
      && String(entry.importSource.id || "") === String(id || ""));
  const personaNameExists = (row, rows) => {
    const name = personaNameKey(row?.result?.persona?.name);
    if (!name) return false;
    const existing = currentRosterPersonas.some((entry) => entry?.mode === "custom"
      && personaNameKey(entry.src?.name || entry.build?.personaSrc?.name) === name);
    const inBatch = (rows || []).some((other) => other && other.id !== row.id && other.ok
      && personaNameKey(other.result?.persona?.name) === name);
    return existing || inBatch;
  };
  const personaExtraSummary = (extra) => {
    const value = extra || {};
    const hasPalette = Boolean(String(value.chatPaletteAuto || "").trim() || String(value.chatPaletteManual || "").trim());
    const count = Array.isArray(value.enhancements) ? value.enhancements.length : 0;
    return "強化 " + count + "件・メモ " + (String(value.memo || "").trim() ? "あり" : "なし")
      + "・チャットパレット " + (hasPalette ? "あり" : "なし") + "（元データを保持）";
  };
  const renderBundleReport = () => {
    if (!bundleReport) return null;
    return h("section", { className: "gara-url-report" },
      h("strong", null,
        "JSON取込：キャラクター " + bundleReport.characterFiles + "件・リザルト "
        + bundleReport.resultCount + "件・人格シート " + bundleReport.validPersonas
        + "/" + bundleReport.personaFiles + "件を解析"),
      bundleReport.ignoredCount
        ? h("p", { className: "gara-url-report-summary" }, "画像・PDF・TXTなど " + bundleReport.ignoredCount + "ファイルを除外しました。")
        : h("p", { className: "gara-url-report-summary" }, "除外対象ファイルはありません。"),
      (bundleReport.errors || []).length
        ? h("div", { className: "gara-url-report-summary" },
          h("span", { className: "gara-note-warn" }, "一部のデータを読み込めませんでした。"),
          (bundleReport.errors || []).slice(0, 6).map((item, index) => h("div", {
            className: "gara-url-report-item", key: (item.fileName || item.url || "file") + "-" + index
          },
            h("code", null, item.fileName || item.url || "ファイル名不明"),
            h("span", null, item.message || item.reason || "読み込みに失敗しました")
          ))
        )
        : null
    );
  };

  const load = async (event) => {
    if (event && typeof event.preventDefault === "function") event.preventDefault();
    setError("");
    setUrlReport(null);
    setBundleReport(null);
    setProgress("");
    const parsedBatch = window.LBT_parseShareUrls?.(url);
    if (!parsedBatch || !Array.isArray(parsedBatch.urls) || !parsedBatch.urls.length) {
      const single = window.LBT_parseShareUrl?.(url);
      setError(parsedBatch?.invalid?.[0]?.reason || single?.error || "硝子窓の共有URLを1件以上貼り付けてください");
      return;
    }
    const collectionKinds = new Set(parsedBatch.urls.map((entry) => entry.collection || "characters"));
    if (collectionKinds.size > 1) {
      setError("キャラクターURL（/view/）と人格URL（/persona/view/）は混在できません。URLの種類ごとに分けてください。");
      return;
    }
    if (parsedBatch.urls.length > 150) {
      setError("一度に読み込めるのは150件までです。URLを分けて読み込んでください");
      return;
    }

    setBusy(true);
    setError("");
    setManifest(null);
    setDoc(null);
    setUrlReport(null);
    setPicked({});
    setChoices({});
    setDecided({});
    setIdentity({});
    setLegacyTargets({});
    setLines([]); setPurchaseApprovals({});
    setConfirmed(null);
    setPersonaItems(null);
    setPersonaPicked({});
    setPersonaConfirmed(null);
    const failed = (parsedBatch.invalid || []).map((item) => ({ url: item.text, reason: item.reason }));
    const successful = [];
    let completed = 0;
    try {
      if (collectionKinds.has("personas")) {
        /* 人格文書は1URL=1人格。キャラクター側の merge/history/manifest へ渡さない。 */
        const imported = [];
        for (let offset = 0; offset < parsedBatch.urls.length; offset += 4) {
          const batch = parsedBatch.urls.slice(offset, offset + 4);
          const settled = await Promise.all(batch.map(async (entry) => {
            const canonicalUrl = "https://lbt-garasumado.vercel.app/persona/view/" + entry.id;
            try {
              const result = await window.LBT_fetchGarasumadoPersona?.(canonicalUrl);
              if (!result?.ok || !result?.persona) {
                return { id: entry.id, url: canonicalUrl, ok: false,
                  reason: (result?.errors || [])[0] || "人格データを解析できませんでした", result: result || null };
              }
              return { id: entry.id, url: canonicalUrl, ok: true, result };
            } catch (error) {
              return { id: entry.id, url: canonicalUrl, ok: false,
                reason: error?.message || "通信に失敗しました", result: null };
            }
          }));
          imported.push(...settled);
          completed += batch.length;
          setProgress("人格URLを確認中：" + completed + "/" + parsedBatch.urls.length);
        }
        setPersonaItems(imported);
        setPersonaPicked(Object.fromEntries(imported
          .filter((row) => row.ok && !personaAlreadyImported(row.id))
          .map((row) => [row.id, true])));
        setPersonaConfirmed(null);
        setUrlReport({
          requested: parsedBatch.urls.length + (parsedBatch.invalid || []).length,
          successful: imported.filter((row) => row.ok).length,
          /* URL解析時点で不正だった行と、取得・解析に失敗した人格URLの両方を表示する。 */
          failed: [
            ...failed,
            ...imported.filter((row) => !row.ok).map((row) => ({ url: row.url, reason: row.reason }))
          ]
        });
        setProgress("人格URLの確認が完了しました。取り込む人格を選んでください。");
        return;
      }

      /* 共有データは1ドキュメントずつしか読めない。4件ずつ並列取得し、
         1件失敗しても残りを続け、最後に成功した文書だけ統合する。 */
      for (let offset = 0; offset < parsedBatch.urls.length; offset += 4) {
        const batch = parsedBatch.urls.slice(offset, offset + 4);
        const settled = await Promise.all(batch.map(async (entry) => {
          try {
            const fetched = await window.LBT_fetchGarasumadoDocument?.(entry.url);
            if (!fetched || !fetched.ok || !fetched.doc) {
              return { ok: false, url: entry.url, reason: fetched?.error || "取得に失敗しました" };
            }
            return { ok: true, ...fetched, url: entry.url };
          } catch (error) {
            return { ok: false, url: entry.url, reason: error?.message || "通信に失敗しました" };
          }
        }));
        for (const row of settled) {
          if (row.ok) successful.push(row);
          else failed.push(row);
        }
        completed += batch.length;
        setProgress(`硝子窓URLを取得中：${completed}/${parsedBatch.urls.length}`);
      }
      if (!successful.length) {
        setUrlReport({ requested: parsedBatch.urls.length + (parsedBatch.invalid || []).length, successful: 0, failed });
        setError("共有データを取得できませんでした。公開設定とURLを確認してください");
        return;
      }

      const mergedDoc = window.LBT_mergeGarasumadoDocuments?.(successful);
      if (mergedDoc?.error) {
        setUrlReport({
          requested: parsedBatch.urls.length + (parsedBatch.invalid || []).length,
          successful: 0,
          failed: [...failed, { url: "一括統合", reason: mergedDoc.error }]
        });
        setError(mergedDoc.error);
        return;
      }
      const sourceDoc = mergedDoc || successful[successful.length - 1].doc;
      setDoc(sourceDoc);
      setUrlReport({
        requested: parsedBatch.urls.length + (parsedBatch.invalid || []).length,
        successful: successful.length,
        failed
      });

      const db = window.DB || {};
      const index = window.LBT_buildNameIndex?.(db, {}) || null;
      const resolve = index ? (name) => window.LBT_resolveCandidates?.(index, name)?.[0] || null : () => null;
      const built = window.LBT_buildGarasumadoManifest?.(sourceDoc, {
        resolve,
        /* 候補を絞らない。1件に絞らず同名候補すべてを利用者に見せる。 */
        candidates: (name) => window.LBT_resolveCandidates?.(index, name) || []
      }, db) || null;
      if (!built) { setError("取り込み内容を組み立てられませんでした"); return; }
    const annotated = window.LBT_annotateManifest?.(built, { db }) || built;
    const scenarioOptionsForLoad = (annotated.scenarios || []).map((scenario) => scenario && scenario.name).filter(Boolean);
    const sourceOptionsForLoad = window.LBT_garasumado?.SOURCES || [];

    /* 帰属先（どのシナリオ）と入手方法は利用者が決める。
       シナリオに載っていない所持品は、自動では紐付けず選ばせる。 */

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
          item.scenarioOptions = scenarioOptionsForLoad;
          item.sourceOptions = sourceOptionsForLoad;
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
    setLines(ops); setPurchaseApprovals({});
    const next = {};
    for (const g of annotated.groups) for (const i of g.items) next[i.key] = i.include;
    setPicked(next);
    } catch (_) { setError("共有URLの読み込み中に問題が発生しました。URLが公開されているか、通信状態をご確認のうえ再試行してください。");
    } finally { setBusy(false); setProgress(""); }
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
  const [legacyTargets, setLegacyTargets] = React.useState({});
  /* 割当ミスは取り込み画面内で戻せる。履歴は identity と picked の対ごと積む。
     上限は 50 手前まで。入力欄での文字取り消しは横取りしない。
     取り込み確定前はアプリ側 state を触らないので、ここを奪わない。 */
  const [past, setPast] = React.useState([]);
  const [future, setFuture] = React.useState([]);
  /* 確定後の結果。シミュレーションは「反映前の1手前」なので、
     確定した時点で入る内容を残し、自動で閉じずに確認できるようにする。 */
  const [confirmed, setConfirmed] = React.useState(null);

  /* URL取込後のレビューはアカウント編集カードから切り離した全画面ワークスペースへ。
     URL入力の入口は従来どおりに残し、内容の確認・確定時だけ作業面を切り替える。 */
  const renderWorkspace = (content) => {
    if (!manifest && !confirmed) return content;
    return ReactDOM.createPortal(
      h("div", {
        className: "gara-import-workspace",
        role: "dialog",
        "aria-modal": true,
        "aria-label": "共有データ取り込みの確認"
      }, content),
      document.body
    );
  };
  React.useEffect(() => {
    if (!manifest && !confirmed) return undefined;
    const handleEscape = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose?.();
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [manifest, confirmed, onClose]);
  const onPickIdentity = (itemKey, next) => {
    setPast((h) => [...h.slice(-49), { identity, picked }]);
    setFuture([]);
    setIdentity((prev) => ({ ...prev, [itemKey]: { ...(prev[itemKey] || {}), ...next } }));
    setPicked((prev) => ({ ...prev, [itemKey]: true }));
  };
  const undoPick = React.useCallback(() => {
    const snap = past[past.length - 1];
    if (!snap) return;
    setPast((h) => h.slice(0, -1));
    setFuture((f) => [...f, { identity, picked }]);
    setIdentity(snap.identity || {});
    setPicked(snap.picked || {});
  }, [past, future, identity, picked]);
  const redoPick = React.useCallback(() => {
    const snap = future[future.length - 1];
    if (!snap) return;
    setFuture((f) => f.slice(0, -1));
    setPast((h) => [...h.slice(-49), { identity, picked }]);
    setIdentity(snap.identity);
    setPicked(snap.picked);
  }, [past, future, identity, picked]);
  /* Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y。App.js のアプリ全体 undo（window で拾う）より
     先に裁くため capture で受け、パネルが開いている間は横流ししない。
     履歴が無ければ何もしないが、巻き戻しもしない（取り込み途中の巻き戻しは事故る）。 */
  React.useEffect(() => {
    const onKey = (event) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const t = event.target;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const k = String(event.key).toLowerCase();
      if (k !== "z" && k !== "y") return;
      event.preventDefault();
      event.stopPropagation();
      if (k === "z" && !event.shiftKey) undoPick();
      else if (k === "y" || k === "z") redoPick();
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [undoPick, redoPick]);

  /* 利用者の選択を manifest に被せる。manifest 自体は書き換えない。 */
  const merged = manifest
    ? {
      ...manifest,
      groups: manifest.groups.map((g) => ({
        ...g,
        items: g.items.map((i) => {
          const item = { ...i, ...(identity[i.key] || {}) };
          /* 未決かどうかは保存せず、その都度ここから決める。
             カードから戻された所持は照合より戻しを優先して未決に戻る。 */
          const attributed = !(item.returned && !item.pickedScenario)
            && ((item.via && item.via.length) || Boolean(item.pickedScenario));
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
  /* 帰属先（どのシナリオ）と入手方法の選択肢。描画から使うので
     コンポーネントのスコープで持つ（load の中の一時変数だと参照できない）。 */
  const scenarioOptions = manifest
    ? (manifest.scenarios || []).map((s) => s && s.name).filter(Boolean)
    : [];
  const sourceOptions = window.LBT_garasumado?.SOURCES || [];

  /* カードへ落とした未割当は、そのシナリオの帰属先として確定させる。
     ドラッグ済みのものも undo で戻せるよう、拾われ口は onPickIdentity 1 本にする。 */
  const dropToBlock = (itemKey, blockName) => {
    if (!itemKey || !blockName) return;
    onPickIdentity(itemKey, { pickedScenario: blockName, returned: false });
  };

  /* カードから戻された行は未割当へ返し、帰属先を選び直せるようにする。
     照合結果より戻しを優先する印（returned）を立てる。
     返った先（レールの行）へフォーカスを移すため、戻したキーを預ける。 */
  const [focusKey, setFocusKey] = React.useState("");
  const returnItem = (itemKey) => {
    if (!itemKey) return;
    onPickIdentity(itemKey, { pickedScenario: "", returned: true });
    setFocusKey(itemKey);
  };

  /* 候補表示と課金承認を分離する。DB名に解決しただけでは購入確定にしない。 */
  const purchaseCandidateKey = (op, proposal) =>
    String(op.key || "") + "::" + String(proposal.key || ("line:" + proposal.lineNo + ":" + proposal.kind + ":" + proposal.name));
  const purchaseNameKey = (value) =>
    String(value || "").normalize("NFKC").replace(/[\s・･]/g, "").toLocaleLowerCase("ja-JP");
  const purchaseReviewPlan = React.useMemo(() => {
    if (!manifest) return {};
    const idx = window.LBT_buildNameIndex ? window.LBT_buildNameIndex(window.DB || {}, {}) : null;
    const resolveName = (n) => (idx && window.LBT_resolveCandidates
      ? (window.LBT_resolveCandidates(idx, n)?.[0] || {}).name || "" : "");
    const byKey = new Map((manifest.scenarios || []).map((s) => [s.key, s]));
    const out = {};
    for (const op of lines) {
      const scenario = byKey.get(op.key);
      const booked = new Set((scenario?.spends || [])
        .flatMap((spend) => [spend?.name, resolveName(spend?.name)])
        .map(purchaseNameKey)
        .filter(Boolean));
      const candidates = (op.proposals || [])
        .filter((proposal) => proposal.negated !== true && !booked.has(purchaseNameKey(proposal.name)))
        .map((proposal) => ({
          ...proposal,
          approvalKey: purchaseCandidateKey(op, proposal),
          approved: purchaseApprovals[purchaseCandidateKey(op, proposal)] === true
        }));
      if (candidates.length) out[op.key] = candidates;
    }
    return out;
  }, [manifest, lines, purchaseApprovals]);

  /* 確定 action・残高シミュレーションに入れるのは、利用者が承認した候補だけ。 */
  const purchasePlan = React.useMemo(() => {
    const out = {};
    for (const [scenarioKey, candidates] of Object.entries(purchaseReviewPlan)) {
      const approved = candidates
        .filter((proposal) => proposal.approved)
        .map((proposal) => ({ name: proposal.name, kind: proposal.kind, cost: proposal.cost, lineNo: proposal.lineNo }));
      if (approved.length) out[scenarioKey] = approved;
    }
    return out;
  }, [purchaseReviewPlan]);

  const togglePurchaseApproval = (approvalKey, approved) => {
    setPurchaseApprovals((current) => ({ ...current, [approvalKey]: approved === true }));
  };

  const draft = React.useMemo(() => {
    if (!manifest) return null;
    const database = window.DB || {};
    const idx = window.LBT_buildNameIndex ? window.LBT_buildNameIndex(database, {}) : null;
    const chosen = Object.keys(picked).filter((k) => picked[k]);
    return window.LBT_buildResultDraft ? window.LBT_buildResultDraft(manifest, {
      db: database,
      identity,
      selected: chosen,
      purchases: purchasePlan,
      resolve: idx ? (name) => (window.LBT_resolveCandidates ? window.LBT_resolveCandidates(idx, name)?.[0] || null : null) : () => null
    }) : null;
  }, [manifest, identity, picked, purchasePlan]);

  /* 右レールに出す未分類所持。同期・解析は獲得でも購入でもないので外す。 */
  const unclassified = draft
    ? draft.unassigned.filter((it) => it.tier !== "F"
      && !(it.via || []).some((v) => /同期|解析/.test(String(v))))
    : [];

  /* 残高照合。変動記載の無いユーザー（checked=false）には何も言わない。 */
  const balance = manifest && doc && window.LBT_reconcileBalance
    ? window.LBT_reconcileBalance(manifest, doc, { purchases: purchasePlan })
    : null;
  const negativeImpliedOpening = Boolean(
    balance && !balance.checked && balance.hasManualReference &&
    ((Number.isFinite(balance.impliedOpeningLp) && balance.impliedOpeningLp < 0) ||
      (Number.isFinite(balance.impliedOpeningShards) && balance.impliedOpeningShards < 0))
  );

  const loadExportBundle = async (event) => {
    const files = Array.from(event?.target?.files || []);
    if (event?.target) event.target.value = "";
    if (!files.length) return;
    setBusy(true);
    setError("");
    setUrlReport(null);
    setBundleReport(null);
    setProgress("ZIP / JSON のデータを読み込んでいます…");
    setManifest(null);
    setDoc(null);
    setPicked({});
    setChoices({});
    setDecided({});
    setIdentity({});
    setLines([]); setPurchaseApprovals({});
    setConfirmed(null);
    setPersonaItems(null);
    setPersonaPicked({});
    setPersonaConfirmed(null);
    try {
      const bundle = await window.LBT_readGarasumadoExportFiles?.(files);
      if (!bundle) throw new Error("ZIP / JSON の読み込み機能を利用できません。ページを再読み込みしてください。");

      const personaRows = (bundle.personas || []).map((entry, index) => {
        const id = String(entry.id || "");
        const sourceUrl = id ? "https://lbt-garasumado.vercel.app/persona/view/" + id : "";
        const result = sourceUrl
          ? window.LBT_parseGarasumadoPersonaDocument?.(entry.data, sourceUrl)
          : null;
        const valid = Boolean(result?.ok && result?.persona);
        return {
          id: id || "invalid-persona-" + index,
          url: sourceUrl || entry.fileName,
          fileName: entry.fileName || entry.path || "人格JSON",
          ok: valid,
          result: result || null,
          reason: result?.errors?.[0] || (sourceUrl ? "人格データを解析できませんでした。" : "人格データIDを確認できません。")
        };
      });
      setPersonaItems(personaRows.length ? personaRows : null);
      setPersonaPicked(Object.fromEntries(personaRows
        .filter((row) => row.ok && !personaAlreadyImported(row.id))
        .map((row) => [row.id, true])));

      const reportErrors = [...(bundle.errors || [])];
      personaRows.filter((row) => !row.ok).forEach((row) => {
        reportErrors.push({ fileName: row.fileName, message: row.reason || "人格データを解析できませんでした。" });
      });
      let sourceDoc = null;
      let resultCount = 0;
      const characterFiles = (bundle.characters || []).length;
      let manifestReady = false;

      if (characterFiles) {
        const sources = bundle.characters.map((entry) => {
          const doc = { ...entry.data };
          delete doc.imageUrl;
          return { doc, updateTime: doc.updatedAt || doc.createdAt || "" };
        });
        const mergedDoc = window.LBT_mergeGarasumadoDocuments?.(sources);
        if (mergedDoc?.error) {
          reportErrors.push({ fileName: "キャラクターJSONの統合", message: mergedDoc.error });
        } else if (mergedDoc) {
          sourceDoc = mergedDoc;
          resultCount = Array.isArray(sourceDoc.scenarioHistory) ? sourceDoc.scenarioHistory.length : 0;
          setDoc(sourceDoc);
          const db = window.DB || {};
          const index = window.LBT_buildNameIndex?.(db, {}) || null;
          const resolve = index ? (name) => window.LBT_resolveCandidates?.(index, name)?.[0] || null : () => null;
          const built = window.LBT_buildGarasumadoManifest?.(sourceDoc, {
            resolve,
            candidates: (name) => window.LBT_resolveCandidates?.(index, name) || []
          }, db) || null;
          if (!built) {
            reportErrors.push({ fileName: "キャラクターJSON", message: "リザルトと所持データを組み立てられませんでした。" });
          } else {
            const annotated = window.LBT_annotateManifest?.(built, { db }) || built;
            const scenarioOptionsForLoad = (annotated.scenarios || []).map((scenario) => scenario && scenario.name).filter(Boolean);
            const sourceOptionsForLoad = window.LBT_garasumado?.SOURCES || [];
            for (const group of annotated.groups || []) {
              for (const item of group.items || []) {
                item.identityCandidates = item.identityCandidates || item.candidates || [];
                item.candidates = window.LBT_candidatesFor?.(item, index) || [];
                const fromDb = item.candidates.filter((candidate) => candidate.acquisition === "db" && candidate.price);
                const fromRule = item.candidates.filter((candidate) => candidate.acquisition !== "db" && candidate.price);
                if (fromDb.length) {
                  item.needsDecision = null;
                  item.include = true;
                } else if (fromRule.length) {
                  item.needsDecision = "pick-mode";
                  item.include = false;
                } else if (!item.candidates.length) {
                  item.needsDecision = "unknown-name";
                  item.include = false;
                }
                if (item.provenance && item.provenance.priced === false
                  && (item.provenance.id === "gachaTicket" || item.provenance.id === "grant")) {
                  item.needsDecision = null;
                  item.include = false;
                }
                item.scenarioOptions = scenarioOptionsForLoad;
                item.sourceOptions = sourceOptionsForLoad;
                const attributed = (item.via && item.via.length) || Boolean(item.pickedScenario);
                item.decide = !(attributed && (item.source || item.provenance?.priced === false));
              }
            }
            const ops = [];
            for (const scenario of annotated.scenarios || []) {
              const found = window.LBT_proposePurchases?.(scenario.memo, { resolve }, {}) || { proposals: [], unresolved: [] };
              ops.push({
                key: scenario.key || ("scenario:" + ops.length),
                title: scenario.name,
                memo: scenario.memo,
                proposals: found.proposals,
                unresolved: found.unresolved
              });
            }
            const next = {};
            for (const group of annotated.groups || []) {
              for (const item of group.items || []) next[item.key] = item.include;
            }
            setManifest(annotated);
            setLines(ops); setPurchaseApprovals({});
            setPicked(next);
            manifestReady = true;
          }
        } else {
          reportErrors.push({ fileName: "キャラクターJSON", message: "キャラクターJSONが空でした。" });
        }
      }

      const validPersonas = personaRows.filter((row) => row.ok).length;
      const resultManifestCount = manifestReady && sourceDoc && Array.isArray(sourceDoc.scenarioHistory)
        ? sourceDoc.scenarioHistory.filter((row) => row && (row.name || row.memo)).length
        : resultCount;
      setBundleReport({
        characterFiles,
        resultCount: resultManifestCount,
        personaFiles: personaRows.length,
        validPersonas,
        ignoredCount: Number(bundle.ignoredCount || 0),
        errors: reportErrors
      });
      setUrlReport(null);
      if (!manifestReady && personaRows.length === 0) {
        setError(reportErrors[0]?.message || "読み込めるキャラクター履歴または人格シートのJSONがありません。");
        return;
      }
      setError("");
      setProgress("ZIP / JSON の読込が完了しました。反映対象を確認してください。");
    } catch (error) {
      setError(error?.message || "ZIP / JSON の読み込みに失敗しました。ファイル形式を確認してください。");
    } finally {
      setBusy(false);
      setProgress("");
    }
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
    const purchases = purchasePlan;
    /* 同期・解析の対象名を DB の人格/E.G.O へ引く。渡さないと
       toDispatchActions は操作行を解決できず、費用の明細が立たない。 */
    const index = window.LBT_buildNameIndex ? window.LBT_buildNameIndex(window.DB || {}, {}) : null;
    const resolve = index && window.LBT_resolveCandidates
      ? (name) => window.LBT_resolveCandidates(index, name)?.[0] || null
      : () => null;
    const result = window.LBT_toDispatchActions?.(merged, keys, { purchases, resolve, legacyResultTargets: legacyTargets }) || { actions: [], skipped: [] };
    const personaActions = (personaItems || [])
      .filter((row) => row.ok && personaPicked[row.id] && !personaAlreadyImported(row.id))
      .map((row) => ({
        type: "ADD_GARASUMADO_PERSONA",
        persona: row.result.persona,
        secondaryPassive: row.result.secondaryPassive || null,
        syncRank: row.result.syncRank || null,
        syncMax: row.result.suggestSyncMax === true,
        source: {
          kind: "garasumado-persona",
          id: row.id,
          url: row.url,
          label: row.fileName || row.result.source?.label || row.result.persona.name,
          extras: row.result.extraData || {}
        }
      }));
    const failedPersonas = (personaItems || []).filter((row) => !row.ok)
      .map((row) => ({ key: row.id, url: row.url, reason: row.reason || "人格データを解析できませんでした。" }));
    const actions = [...(result.actions || []), ...personaActions];
    const skipped = [...(result.skipped || []), ...failedPersonas];
    /* 人格シートも同じ action batch に載せ、Ctrl+Z 1 回で全体を戻せるようにする。 */
    const applied = { actions, skipped, rosterActions: actions, manifest, keys };
    onApply?.(applied);
    const simulation = draft ? {
      ...draft.simulation,
      held: (draft.simulation.held || 0) + personaActions.length
    } : null;
    setConfirmed({
      counts: appliedSummary(actions),
      skipped,
      simulation
    });
};

/* 実際に入る action の内訳。シミュレーションと同じ数のはずなので、
   食い違えば「表示と実体がずれた」と分かる。 */
function appliedSummary(actions) {
  const byType = {};
  let held = 0;
  for (const a of actions || []) {
    byType[a.type] = (byType[a.type] || 0) + 1;
    if (String(a.type || "").startsWith("ADD_ROSTER") || a.type === "ADD_GARASUMADO_PERSONA") held += 1;
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
      ops: 0,
      unknownLine: lines.reduce((n, o) => n + o.unresolved.length, 0),
      lineOn: Object.values(purchasePlan).reduce((n, picks) => n + picks.length, 0),
      lineCandidates: Object.values(purchaseReviewPlan).reduce((n, proposals) => n + proposals.length, 0)
    }
    : { total: 0, pickMode: 0, unknownName: 0, included: 0, ops: 0, unknownLine: 0, lineOn: 0, lineCandidates: 0 };

  if (personaItems !== null && !manifest) {
    const selectedRows = personaItems.filter((row) => row.ok && personaPicked[row.id] && !personaAlreadyImported(row.id));
    const failedRows = personaItems.filter((row) => !row.ok);
    if (personaConfirmed) {
      return h("div", { className: "gara" },
        renderBundleReport(),
        h("div", { className: "gara-out" },
          h("h3", { className: "gara-title" }, "人格の一括取り込みを確定しました"),
          h("p", { className: "gara-lead" }, personaConfirmed.count + "件の人格を所持ライブラリへ登録しました。既存の装備中人格やキャラクターの履歴は変更していません。")
        ),
        h("div", { className: "gara-rows" }, personaConfirmed.names.map((name, index) =>
          h("div", { key: name + ":" + index, className: "gara-row" },
            h("span", { className: "gara-row-name" }, name),
            h("span", { className: "gara-row-meta" }, "人格")
          )
        )),
        failedRows.length
          ? h("p", { className: "gara-note" }, "取得・解析できなかったURLが " + failedRows.length + " 件あります。")
          : null,
        h("div", { className: "gara-foot" },
          h("div", { className: "gara-foot-acts" },
            h(Button, { size: "sm", variant: "primary", icon: "check", onClick: onClose }, "閉じる"),
            h(Button, { size: "sm", variant: "quiet", onClick: () => { setPersonaItems(null); setPersonaConfirmed(null); setError(""); setUrlReport(null); setProgress(""); } }, "別のURLを取り込む")
          )
        )
      );
    }
    return h("div", { className: "gara" },
      renderBundleReport(),
      h("div", { className: "gara-out" },
        h("h3", { className: "gara-title" }, "硝子窓の人格を一括取り込む"),
        h("p", { className: "gara-lead" }, "URLごとに人格を識別しました。選択した人格だけを自作・派生人格として所持ライブラリに追加します。既存の人格や装備中のビルドは上書きしません。")
      ),
      h("p", { className: "gara-note" },
        "有効な人格 " + personaItems.filter((row) => row.ok).length + "件・選択中 " + selectedRows.length + "件"
        + (failedRows.length ? "・取得／解析失敗 " + failedRows.length + "件" : "")),
      personaItems.map((row) => {
        const name = row.result?.persona?.name || "名前を確認できません";
        const already = personaAlreadyImported(row.id);
        const sameName = row.ok && personaNameExists(row, personaItems);
        const result = row.result || {};
        const persona = result.persona || {};
        const warningRows = [...(result.warnings || []), ...(sameName ? ["同名の人格が既にあります。別バージョンの可能性があるため、内容を確認してください。"] : [])];
        return h("section", { key: row.id, className: "gara-group gara-result" },
          h("div", { className: "gara-group-head" },
            h("label", { className: "gara-row-name", style: { display: "flex", alignItems: "flex-start", gap: "8px", cursor: row.ok && !already ? "pointer" : "default" } },
              h("input", {
                type: "checkbox",
                checked: Boolean(personaPicked[row.id]) && !already,
                disabled: !row.ok || already,
                onChange: (event) => setPersonaPicked((current) => ({ ...current, [row.id]: event.target.checked }))
              }),
              h("span", null, name)
            ),
            h("span", { className: "gara-row-meta" }, already ? "取込済み" : row.ok ? "個別登録" : "取込不可")
          ),
          row.ok
            ? h("div", { className: "gara-rows" },
              h("div", { className: "gara-row" },
                h("span", { className: "gara-row-name" }, "基本情報"),
                h("span", { className: "gara-row-meta" }, "HP " + persona.hp + "・SAN " + persona.san + "・速度 " + persona.speed)
              ),
              h("div", { className: "gara-row" },
                h("span", { className: "gara-row-name" }, "データ内容"),
                h("span", { className: "gara-row-meta" },
                  "スキル " + (persona.skills || []).length + "・パッシブ "
                  + ((persona.passive_name ? 1 : 0) + (result.secondaryPassive?.name ? 1 : 0))
                  + "・固有 " + (persona.unique_buffs || []).length)
              ),
              result.extraData
                ? h("div", { className: "gara-row" },
                  h("span", { className: "gara-row-name" }, "追加情報"),
                  h("span", { className: "gara-row-meta" }, personaExtraSummary(result.extraData))
                )
                : null,
              row.fileName ? h("p", { className: "gara-note" }, row.fileName) : null,
              result.source?.id
                ? h("p", { className: "gara-note" }, "共有ID: " + result.source.id)
                : null,
              warningRows.length
                ? h("p", { className: "gara-note gara-note-warn" }, warningRows.join(" "))
                : null
            )
            : h("p", { className: "gara-note gara-note-warn" }, row.reason || "人格データを読み込めませんでした。")
        );
      }),
      h("div", { className: "gara-foot" },
        h("div", { className: "gara-foot-meta" },
          selectedRows.length + "件を所持人格ライブラリへ追加。既存の人格名が同じでも、共有IDが違うものは別データとして扱います。"
        ),
        h("div", { className: "gara-foot-acts" },
          h(Button, { size: "sm", variant: "quiet", onClick: () => { setPersonaItems(null); setPersonaPicked({}); setPersonaConfirmed(null); setError(""); setUrlReport(null); setProgress(""); } }, "URLを修正"),
          h(Button, {
            size: "sm", variant: "primary", icon: "check",
            disabled: busy || selectedRows.length === 0,
            onClick: () => {
              const actions = selectedRows.map((row) => ({
                type: "ADD_GARASUMADO_PERSONA",
                persona: row.result.persona,
                secondaryPassive: row.result.secondaryPassive || null,
                syncRank: row.result.syncRank || null,
                syncMax: row.result.suggestSyncMax === true,
                source: {
                  kind: "garasumado-persona",
                  id: row.id,
                  url: row.url,
                  label: row.fileName || row.result.source?.label || row.result.persona.name,
                  extras: row.result.extraData || {}
                }
              }));
              const skipped = failedRows.map((row) => ({ key: row.id, url: row.url, reason: row.reason }));
              onApply?.({ actions, skipped });
              setPersonaConfirmed({ count: actions.length, names: selectedRows.map((row) => row.result.persona.name) });
            }
          }, "選択した人格を取り込む")
        )
      )
    );
  }

  if (confirmed) {
  /* 確定済みなら確定結果だけを出す。シミュレーションは「反映前の1手前」で、
     確定した内容をそのまま確認できるようにする。画面は自動で閉じない。 */
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
    return renderWorkspace(h("div", { className: "gara gara-import-complete" },
      h("div", { className: "gara-step-kicker" }, "STEP 3 / 3 · 反映結果"),
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
    ));
  }

  if (!manifest) {
    return h("div", { className: "gara gara-import-start" },
      h("div", { className: "gara-step-kicker" }, "STEP 1 / 3 · 共有元を指定"),
      h("h3", { className: "gara-title" }, "硝子窓の共有URLから取り込む"),
      h("p", { className: "gara-lead" }, "共有URLを読み込んだ後、所持や購入履歴の候補を確認してから反映します。複数のURLは改行でまとめて貼り付けられます。読み込みだけではデータは変更されません。"),
      h("form", { className: "gara-url-form", onSubmit: load, "aria-busy": busy },
        h("label", { className: "acct-field gara-field" },
          h("span", { className: "gara-label" }, "硝子窓の共有URL（1行に1件）"),
          h("textarea", {
            className: "input gara-url-list", name: "shareUrls", value: url, autoFocus: true, rows: 5,
            autoComplete: "off", spellCheck: false, required: true,
            "aria-describedby": "gara-url-help",
            placeholder: "https://lbt-garasumado.vercel.app/view/…\nhttps://lbt-garasumado.vercel.app/view/…",
            onChange: (event) => { setUrl(event.target.value); setError(""); setUrlReport(null); }
          })
        ),
        h("button", { type: "submit", className: "gara-load-button", disabled: busy || !url.trim() },
          h("span", { "aria-hidden": "true" }, busy ? "◌" : "↧"),
          busy ? "共有データを読み込み中…" : "共有データを読み込む"
        )
      ),
      progress ? h("p", { className: "gara-loading", role: "status", "aria-live": "polite" }, progress) : null,
      error ? h("p", { className: "gara-error", role: "alert" }, error) : null,
      urlReport ? h("section", { className: `gara-url-report${urlReport.failed.length ? " has-errors" : ""}`, role: "status", "aria-live": "polite" },
        h("strong", null, `URL ${urlReport.requested}件中 ${urlReport.successful}件を読み込みました`),
        urlReport.failed.length ? h("p", { className: "gara-url-report-summary" }, `取得できなかったURL：${urlReport.failed.length}件（先頭6件を表示）`) : h("p", { className: "gara-url-report-summary" }, "すべてのURLを読み込みました"),
        urlReport.failed.slice(0, 6).map((entry, index) => h("div", { className: "gara-url-report-item", key: `${entry.url}-${index}` },
          h("code", null, entry.url || entry.text || "URL不明"),
          h("span", null, entry.reason || "取得できませんでした")))
      ) : null,
      h("p", { className: "gara-field-help", id: "gara-url-help" }, "URLはこの読み込みにのみ使用し、アカウントへ保存しません。Enterキーでも読み込めます。最大150件まで一括処理できます。"),
      h("section", { className: "gara-group", style: { marginTop: "18px" } },
        h("h4", { className: "gara-group-title" }, "ZIP / JSON ファイルから一括読み込み"),
        h("label", { className: "acct-field gara-field" },
          h("span", { className: "gara-label" }, "硝子窓のエクスポート（ZIPまたはJSONを複数選択）"),
          h("input", {
            className: "input", type: "file", name: "garasumadoExport",
            accept: ".zip,.json,application/zip,application/json", multiple: true,
            disabled: busy, onChange: loadExportBundle
          })
        ),
        h("p", { className: "gara-note" }, "ZIP内のキャラクターJSONからリザルト履歴・所持情報を、人格シートJSONから人格をまとめて読み込みます。画像・PDF・TXTは読み込まず、反映前に確認できます。")
      ),
      renderBundleReport()
    );
  }

  return renderWorkspace(h("div", { className: "gara gara-import-review" },
    h("header", { className: "gara-import-heading" },
      h("div", { className: "gara-import-heading-copy" },
        h("span", { className: "gara-step-kicker" }, "STEP 2 / 3 · 取込内容の確認"),
        h("h3", { className: "gara-title" }, "取り込み内容を確認"),
        h("p", { className: "gara-lead" }, `共有元：${manifest.character.name || "名称未設定"}。反映する項目を選び、未決の内容を確認してから確定してください。`),
        h("p", { className: "gara-import-balance" }, `硝子窓の申告残高（手入力・照合用）　LP ${manifest.currency.lp || "—"} ・ 欠片 ${manifest.currency.shards || "—"}`)
      ),
      h("div", { className: "gara-import-heading-actions" },
        h("button", { type: "button", className: "gara-change-url", onClick: () => { setManifest(null); setConfirmed(null); setError(""); setUrlReport(null); setBundleReport(null); setPersonaItems(null); setPersonaPicked({}); setPersonaConfirmed(null); setProgress(""); setPicked({}); setIdentity({}); setLegacyTargets({}); setLines([]); setPurchaseApprovals({}); setChoices({}); setDecided({}); setPast([]); setFuture([]); setDoc(null); } }, "URLを貼り直す"),
        h("button", { type: "button", className: "gara-review-dismiss", onClick: onClose, title: "取り込み確認を閉じてアカウント編集へ戻る" }, "閉じて戻る")
      )
    ),
    renderBundleReport(),
    urlReport && urlReport.failed.length ? h("section", { className: "gara-url-report has-errors", role: "status" },
      h("strong", null, `${urlReport.successful}/${urlReport.requested}件のURLを読み込みました`),
      h("p", { className: "gara-url-report-summary" }, "一部のURLを取得できませんでした。以下は読み込みに失敗したURLです。今回読み込めた内容は引き続き確認できます。"),
      urlReport.failed.slice(0, 6).map((entry, index) => h("div", { className: "gara-url-report-item", key: `${entry.url}-${index}` },
        h("code", null, entry.url || entry.text || "URL不明"),
        h("span", null, entry.reason || "取得できませんでした")))
    ) : null,
    h("section", { className: "gara-import-overview", "aria-label": "取り込み内容の概要" },
      h("div", { className: "gara-import-stat" },
        h("span", { className: "gara-import-stat-label" }, "取り込み対象"),
        h("strong", { className: "gara-import-stat-value" }, `${counts.included} / ${counts.total}`),
        h("span", { className: "gara-import-stat-detail" }, "項目がON")
      ),
      h("div", { className: `gara-import-stat${pendingCount ? " is-warning" : " is-ready"}` },
        h("span", { className: "gara-import-stat-label" }, "確定前に要確認"),
        h("strong", { className: "gara-import-stat-value" }, `${pendingCount}件`),
        h("span", { className: "gara-import-stat-detail" }, pendingCount ? "帰属先・入手方法の選択待ち" : "必須の選択は完了")
      ),
      h("div", { className: "gara-import-stat" },
        h("span", { className: "gara-import-stat-label" }, "追加予定のリザルト"),
        h("strong", { className: "gara-import-stat-value" }, `${draft ? draft.simulation.results : 0}件`),
        h("span", { className: "gara-import-stat-detail" }, `所持へ追加 ${draft ? draft.simulation.held : 0}件`)
      )
    ),
    h("p", { className: "gara-import-instructions" }, "項目名を押すと候補や価格を確認できます。ON / OFFで反映対象を切り替えます。未決の項目は帰属先・入手方法を選んでください。"),
    h("p", { className: "gara-hint" }, "候補が一意でない場合は自動決定しません。入力内容に誤りがないことを確認してから確定してください。"),
    personaItems !== null ? h("section", { className: "gara-group gara-result" },
      h("div", { className: "gara-group-head" },
        h("h4", { className: "gara-group-title" }, "人格シート（ZIP / JSON）"),
        h("p", { className: "gara-group-note" },
          "選択中 " + personaItems.filter((row) => row.ok && personaPicked[row.id] && !personaAlreadyImported(row.id)).length
          + " / " + personaItems.filter((row) => row.ok).length + "件")
      ),
      personaItems.map((row) => {
        const name = row.result?.persona?.name || row.fileName || "人格名不明";
        const already = personaAlreadyImported(row.id);
        const result = row.result || {};
        const persona = result.persona || {};
        const sameName = row.ok && personaNameExists(row, personaItems);
        const notes = [...(result.warnings || []), ...(sameName ? ["同名の人格が既にあります。別バージョンの可能性があるため、内容を確認してください。"] : [])];
        return h("div", { key: row.id, className: "gara-rows" },
          h("div", { className: "gara-row" },
            h("label", { className: "gara-row-name", style: { display: "flex", alignItems: "flex-start", gap: "8px" } },
              h("input", {
                type: "checkbox",
                checked: Boolean(personaPicked[row.id]) && !already,
                disabled: !row.ok || already,
                onChange: (event) => setPersonaPicked((current) => ({ ...current, [row.id]: event.target.checked }))
              }),
              h("span", null, name)
            ),
            h("span", { className: "gara-row-meta" }, already ? "取込済み" : row.ok ? "登録予定" : "取込不可")
          ),
          row.ok ? h("div", { className: "gara-row" },
            h("span", { className: "gara-row-name" }, "基本情報"),
            h("span", { className: "gara-row-meta" }, "HP " + persona.hp + "・SAN " + persona.san + "・速度 " + persona.speed)
          ) : null,
          row.ok ? h("div", { className: "gara-row" },
            h("span", { className: "gara-row-name" }, "データ内容"),
            h("span", { className: "gara-row-meta" },
              "スキル " + (persona.skills || []).length + "・パッシブ "
              + ((persona.passive_name ? 1 : 0) + (result.secondaryPassive?.name ? 1 : 0))
              + "・固有 " + (persona.unique_buffs || []).length)
          ) : null,
          result.extraData ? h("div", { className: "gara-row" },
            h("span", { className: "gara-row-name" }, "追加情報"),
            h("span", { className: "gara-row-meta" }, personaExtraSummary(result.extraData))
          ) : null,
          row.fileName ? h("p", { className: "gara-note" }, row.fileName) : null,
          !row.ok ? h("p", { className: "gara-note gara-note-warn" }, row.reason || "人格データを解析できませんでした。") : null,
          notes.length ? h("p", { className: "gara-note gara-note-warn" }, notes.join(" ")) : null
        );
      }),
      h("p", { className: "gara-note" }, "選んだ人格も、リザルトや所持データと同じ一回の反映処理で登録します。追加情報は元データとして保存し、既存の人格や装備中のビルドは上書きしません。")
    ) : null,
    (manifest.counts?.initialSpirits || 0) > 0
      ? h("p", { className: "gara-note" },
        `初期精神 ${manifest.counts.initialSpirits} 件（${(manifest.counts.initialSpiritsOwned || []).join("・")}）は最初から所持として数えます。`)
      : null,
    manifest.counts?.initialSpiritOverflow
      ? h("p", { className: "gara-note gara-note-warn" },
        `初期精神は3件までなので共有URLの記載を確認してください（現在 ${manifest.counts.initialSpirits} 件）。`)
      : null,
    balance && balance.checked && !balance.ok
      ? h("p", { className: "gara-note gara-note-warn" },
        `残高照合: ${balance.message}（最初の「現在」記録を開始基準と仮定。計算 LP ${balance.computedLp} / 欠片 ${balance.computedShards}、硝子窓の申告値 LP ${balance.shownLp} / 欠片 ${balance.shownShards}）。申告値は手入力のため、差額を自動計上しません。`)
      : null,
    balance && !balance.checked && balance.hasManualReference
      ? h("p", {
        className: negativeImpliedOpening ? "gara-note gara-note-warn" : "gara-note",
        ...(negativeImpliedOpening ? { role: "alert" } : {})
      },
        `履歴から確定できる純増減: LP ${balance.historyNetLp >= 0 ? "+" : ""}${balance.historyNetLp} / 欠片 ${balance.historyNetShards >= 0 ? "+" : ""}${balance.historyNetShards}。硝子窓の申告値（手入力・参考）: LP ${balance.shownLp ?? "未記載"} / 欠片 ${balance.shownShards ?? "未記載"}。差から逆算した開始前残高は LP ${balance.impliedOpeningLp ?? "不明"} / 欠片 ${balance.impliedOpeningShards ?? "不明"} です。${negativeImpliedOpening ? "【残高整合性の警告】逆算した開始前残高が負数です。支出の未記録、収入の重複計上、履歴不足、申告残高の誤入力を確認してください。原因を特定できるまでは確定値として扱わず、差額を帳簿へ自動計上しません。" : "これは照合用の参考推定です。履歴漏れ・開始残高・手入力ミスのいずれでも差が生じるため、帳簿へ自動加算しません。"}`)
      : null,
    unclassified.length || (draft && draft.blocks.some((b) => (b.items || []).length))
      ? h(UnclassifiedRail, {
        items: unclassified,
        scenarioOptions,
        onPickIdentity,
        onReturnItem: returnItem,
        focusKey,
        onFocusHandled: () => setFocusKey("")
      })
      : null,
    draft && draft.blocks.map((block) => {
      const scenario = (manifest.scenarios || []).find((row) => row && row.key === block.key);
      const importSourceKey = String(scenario?.importSourceKey || "");
      const sourceAlreadyImported = Boolean(importSourceKey && (existingResults || []).some(
        (result) => result && result.importSourceKey === importSourceKey
      ));
      const selectedLegacyId = String(legacyTargets[block.key] || "");
      const reservedLegacyIds = new Set(Object.entries(legacyTargets)
        .filter(([key, id]) => key !== block.key && id)
        .map(([, id]) => String(id)));
      const blockNameKey = String(block.name || "").normalize("NFKC").replace(/\s+/g, "").toLocaleLowerCase("ja-JP");
      const legacyCandidates = sourceAlreadyImported ? [] : (existingResults || []).filter((result) => {
        if (!result || !result.id || String(result.importSourceKey || "").trim()) return false;
        const resultNameKey = String(result.name || "").normalize("NFKC").replace(/\s+/g, "").toLocaleLowerCase("ja-JP");
        return resultNameKey === blockNameKey
          && (!reservedLegacyIds.has(String(result.id)) || String(result.id) === selectedLegacyId);
      });
      return h(ResultCard, {
        key: block.key || block.name,
        block,
        scenarioOptions,
        sourceOptions,
        purchaseCandidates: purchaseReviewPlan[block.key] || [],
        onTogglePurchaseCandidate: togglePurchaseApproval,
        onPickIdentity,
        onDropItem: dropToBlock,
        onReturnItem: returnItem,
        existingResults,
        legacyCandidates,
        legacyTargetId: selectedLegacyId,
        onPickLegacyTarget: (key, id) => setLegacyTargets((current) => {
          const next = { ...current };
          if (id) next[key] = id;
          else delete next[key];
          return next;
        }),
        sourceAlreadyImported
      });
    }),
    /* 分類できた購入はリザルトの行として既に帰属しているので、ここには
       残らない。名前も価格も引けなかった購入行だけを別枠で見せる。 */
    counts.unknownLine ? h("section", { className: "gara-group gara-result" },
      h("div", { className: "gara-group-head" },
        h("h4", { className: "gara-group-title" }, "判定できなかった購入行"),
        h("p", { className: "gara-group-note" }, `${counts.unknownLine}件。金額を書き足すか、支出として残してください`)
      ),
      h("div", { className: "gara-scen" },
        lines.filter((o) => o.unresolved.length).slice(0, 10).map((op) => h("div", { key: op.title + (op.memo || ""), className: "gara-scen-row" },
          h("span", { className: "gara-scen-name" }, op.title || "無題"),
          h("div", { className: "gara-rows" },
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
    h("div", { className: "gara-foot gara-import-actions" },
      h("div", { className: "gara-foot-meta" },
        `${counts.included}件を所持へ・購入候補 ${counts.lineCandidates}件（明示承認済み ${counts.lineOn}件）を明細へ計上（メモに明記された支出は別途そのまま明細）`,
        [
          counts.pickMode ? h("span", { key: "pm", className: "gara-foot-warn" }, `${counts.pickMode}件は入手手段の選択が必要`) : null,
          counts.unknownName ? h("span", { key: "un", className: "gara-foot-warn" }, `${counts.unknownName}件は名前が解けていません`) : null,
          pendingCount ? h("span", { key: "pd", className: "gara-foot-warn" }, `${pendingCount}件は帰属先・入手方法の選択が必要`) : null
        ]
      ),
      h("div", { className: "gara-foot-acts" },
        h(Button, {
          size: "sm", variant: "ghost",
          onClick: undoPick,
          disabled: past.length === 0,
          title: "Ctrl+Z"
        }, "元に戻す"),
        h(Button, {
          size: "sm", variant: "ghost",
          onClick: redoPick,
          disabled: future.length === 0,
          title: "Ctrl+Y"
        }, "やり直す"),
        h(Button, { size: "sm", variant: "ghost", onClick: () => setManifest(null) }, "URLを貼り直す"),
        h(Button, {
          size: "sm", variant: "primary", icon: "check", onClick: apply,
          disabled: pendingCount > 0
            || (counts.included === 0 && counts.lineOn === 0
              && !(draft && draft.simulation.results > 0)
              && !(personaItems || []).some((row) => row.ok && personaPicked[row.id] && !personaAlreadyImported(row.id))),
          title: pendingCount > 0 ? "帰属先と入手方法を決めてください" : ""
        }, "変換を確定する")
      )
    ),
    h("p", { className: "gara-note" }, "取り込み後も記録とリザルトはいつでも編集できます。")
  ));
};

window.GarasumadoImportPanel = GarasumadoImportPanel;
})();
