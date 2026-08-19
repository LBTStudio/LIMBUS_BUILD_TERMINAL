const SKILL_TYPES = ["\u6253\u6483", "\u65AC\u6483", "\u8CAB\u901A", "\u9632\u5FA1", "\u56DE\u907F", "\u53CD\u6483", "\u6253\u6483\u53CD\u6483", "\u65AC\u6483\u53CD\u6483", "\u8CAB\u901A\u53CD\u6483", "\u30DE\u30C3\u30C1\u53EF\u80FD\u6253\u6483\u53CD\u6483", "\u30DE\u30C3\u30C1\u53EF\u80FD\u65AC\u6483\u53CD\u6483", "\u30DE\u30C3\u30C1\u53EF\u80FD\u8CAB\u901A\u53CD\u6483", "\u30DE\u30C3\u30C1\u53EF\u80FD\u9632\u5FA1"];
const SKILL_SINS = ["\u61A4\u6012", "\u8272\u6B32", "\u6020\u60F0", "\u66B4\u98DF", "\u6182\u9B31", "\u50B2\u6162", "\u5AC9\u59AC", "\u7279\u6B8A"];
const SKILL_RANK_SUGGESTIONS = [
  "\u30B9\u30AD\u30EB0",
  "\u30B9\u30AD\u30EB1",
  "\u30B9\u30AD\u30EB2",
  "\u30B9\u30AD\u30EB3",
  "\u30B9\u30AD\u30EB4",
  "\u30B9\u30AD\u30EB5",
  "\u30B9\u30AD\u30EB6",
  "\u30B9\u30AD\u30EB0-2",
  "\u30B9\u30AD\u30EB1-2",
  "\u30B9\u30AD\u30EB2-2",
  "\u30B9\u30AD\u30EB3-2",
  "\u30B9\u30AD\u30EB4-2",
  "\u899A\u9192\u30B9\u30AD\u30EB",
  "\u4FB5\u8755\u30B9\u30AD\u30EB",
  "\u30DE\u30C3\u30C1\u53EF\u80FD\u9632\u5FA1",
  "\u30BC\u30ED\u30B9\u30AD\u30EB",
  "\u6D3E\u751F"
];
const SKILL_AOES = ["\u5E83\u57DF", "\u5E83\u57DF\u4E71\u5C04"];
function canEditSkillState(state) {
  const src = state.personaSrc || {};
  const isCustom = state.personaMode === "custom" || src.__custom;
  const isSavedCustom = !!(isCustom && src.__saved);
  return !!(state.syncedManual || isCustom && !isSavedCustom);
}
const AutoTextarea = ({ value, onChange, minRows = 1, style = {}, className = "", ...rest }) => {
  const ref = React.useRef(null);
  const resize = React.useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.max(el.scrollHeight, minRows * 20) + "px";
  }, [minRows]);
  React.useEffect(() => {
    resize();
  }, [value, resize]);
  return /* @__PURE__ */ React.createElement(
    "textarea",
    {
      ref,
      className,
      value: value || "",
      onChange: (e) => {
        onChange(e);
        requestAnimationFrame(resize);
      },
      onInput: resize,
      style: { ...style, overflow: "hidden", resize: "none" },
      ...rest
    }
  );
};
// d値/d数の可変設定は「変更する」場合のみ展開する選択制UI。
// 固定値の別入力は持たず、ダイス式を唯一の基準として扱う。
const DiceVarControls = ({ dPlus, dCnt, dPlusLabel, dCntLabel, rn, idx, onPatch }) => {
  const [open, setOpen] = React.useState(false);
  const active = dPlus || dCnt;
  const shown = open || active;
  const activeKinds = [dPlus && "d値", dCnt && "d数"].filter(Boolean).join("・");
  const autoPlus = `S${rn}-${idx + 1}d値`;
  const autoCnt = `S${rn}-${idx + 1}d数`;
  const h = React.createElement;
  return h("div", { className: "deck-dice-var" },
    h("button", { type: "button", className: "deck-dice-var-toggle" + (active ? " is-on" : ""), onClick: () => setOpen((o) => !o), title: "このダイスだけのd値/d数を実戦で変動させる設定を開く" },
      h("span", { className: "deck-dice-var-title" }, (shown ? "▾ " : "▸ ") + "個別 d値／d数"),
      h("span", { className: "deck-dice-var-state" }, active ? `有効: ${activeKinds}` : "設定")
    ),
    shown && h("div", { className: "deck-dice-var-fields" },
      h("label", { className: `deck-dice-var-chk${dPlus ? " is-on" : ""}` }, h("input", { type: "checkbox", checked: dPlus, onChange: (e) => onPatch({ dPlus: e.target.checked }) }), h("span", { className: "deck-dice-var-label" }, "d値を可変にする"), dPlus && h("input", { className: "deck-dice-var-input", value: dPlusLabel || "", placeholder: `変数名（省略: ${autoPlus}）`, onChange: (e) => onPatch({ dPlusLabel: e.target.value }), title: "変数名はd値へ加算します。{変数名}/10 のような中括弧付き式はd値から減算して出力します。" })),
      h("label", { className: `deck-dice-var-chk${dCnt ? " is-on" : ""}` }, h("input", { type: "checkbox", checked: dCnt, onChange: (e) => onPatch({ dCnt: e.target.checked }) }), h("span", { className: "deck-dice-var-label" }, "d数を可変にする"), dCnt && h("input", { className: "deck-dice-var-input", value: dCntLabel || "", placeholder: `変数名（省略: ${autoCnt}）`, onChange: (e) => onPatch({ dCntLabel: e.target.value }), title: "変数名として入力します。{変数名}/10 のような中括弧付き式もそのまま出力します。" }))
    )
  );
};
const DiceRow = ({ dice, idx, skillRankNum, onPatch, onRemove }) => {
  const dPlus = !!dice.dPlus;
  const dCnt = !!dice.dCnt;
  const rn = skillRankNum || "";
  return /* @__PURE__ */ React.createElement("div", { className: "deck-dice-row" },
    /* @__PURE__ */ React.createElement("span", { className: "deck-dice-idx" }, idx + 1),
    /* @__PURE__ */ React.createElement("input", { className: "deck-dice-roll", placeholder: "2d7", value: dice.roll || "", onChange: (e) => onPatch({ roll: e.target.value }), title: "ダイス式（例：2d7、1-1d4、(2)d5）" }),
    /* @__PURE__ */ React.createElement(AutoTextarea, { className: "deck-dice-eff", placeholder: "ダイス効果（内容量に合わせて自動拡張）", value: dice.effect, onChange: (e) => onPatch({ effect: e.target.value }), minRows: 1 }),
    /* @__PURE__ */ React.createElement("button", { className: "deck-dice-del", onClick: onRemove, title: "削除" }, "×"),
    /* @__PURE__ */ React.createElement(DiceVarControls, { dPlus, dCnt, dPlusLabel: dice.dPlusLabel, dCntLabel: dice.dCntLabel, rn, idx, onPatch })
  );
};
const SkillVariancePanel = ({ skill, onPatch }) => {
  const dPlus = !!skill.dPlus;
  const dCnt = !!skill.dCnt;
  const dPlusLabel = skill.dPlusLabel || "";
  const dCntLabel = skill.dCntLabel || "";
  const h = React.createElement;
  return h("div", { className: "sk-var-block sk-var-block--compact" },
    h("div", { className: "sk-var-header sk-var-compact-header" },
      h("span", { className: "field-label", style: { marginBottom: 0 } }, "スキル全体"),
      h("span", { className: "sk-var-hint" }, "全ダイスへの変動適用を選択")
    ),
    /* R06: 「変動なし／d値／d数／両方」の明示選択に統合（内部表現 dPlus/dCnt は維持し後方互換を確保） */
    h("div", { className: "sk-var-mode", role: "radiogroup", "aria-label": "d値・d数の変動モード" },
      [
        { key: "none", label: "変動なし", on: !dPlus && !dCnt, next: { dPlus: false, dCnt: false }, tip: "ダイス式をそのまま出力します" },
        { key: "plus", label: "d値", on: dPlus && !dCnt, next: { dPlus: true, dCnt: false }, tip: "全ダイスの d値だけを変数化します" },
        { key: "cnt", label: "d数", on: !dPlus && dCnt, next: { dPlus: false, dCnt: true }, tip: "全ダイスの d数だけを変数化します" },
        { key: "both", label: "両方", on: dPlus && dCnt, next: { dPlus: true, dCnt: true }, tip: "d値とd数の両方を変数化します" }
      ].map((m) => h("button", {
        key: m.key, type: "button", role: "radio", "aria-checked": m.on,
        className: `sk-var-mode-btn${m.on ? " is-on" : ""}`,
        title: m.tip,
        onClick: () => onPatch(m.next)
      }, m.label))
    ),
    (dPlus || dCnt) && h("div", { className: "sk-var-compact-details" },
      dPlus && h("label", { className: "sk-var-compact-detail" },
        h("span", null, "d値の変数名（任意）"),
        h("input", { type: "text", className: "sk-var-input", placeholder: "省略で自動: S◯d値", value: dPlusLabel, onChange: (e) => onPatch({ dPlusLabel: e.target.value }), title: "変数名だけなら自動で {} を付けてd値へ加算します。{変数名}/10 のような中括弧付き式はd値から減算します。" })
      ),
      dCnt && h("label", { className: "sk-var-compact-detail" },
        h("span", null, "d数の変数名（任意）"),
        h("input", { type: "text", className: "sk-var-input", placeholder: "省略で自動: S◯d数", value: dCntLabel, onChange: (e) => onPatch({ dCntLabel: e.target.value }), title: "変数名だけなら自動で {} を付けます。{変数名}/10 のような中括弧付き式もそのまま出力します。" })
      ),
      h("label", { className: "sk-var-compact-detail" },
        h("span", null, "生成変数の出力先"),
        h("select", { className: "select", value: skill.dVarPlace || "status", onChange: (e) => onPatch({ dVarPlace: e.target.value }), title: "d値/d数の変動で生成される変数をJSONのどこへ出力するか" },
          h("option", { value: "status" }, "ST（ステータス）"),
          h("option", { value: "params" }, "ラベル（params）"),
          h("option", { value: "none" }, "出力しない")
        )
      )
    )
  );
};
const ReadonlySkillCard = ({ skill, onEdit, canEdit }) => /* @__PURE__ */ React.createElement("div", { className: "deck-card deck-focus deck-focus-readonly", "data-sin": skill.sin || "" }, /* @__PURE__ */ React.createElement("div", { className: "deck-card-head", style: { marginBottom: "var(--s-3)" } }, /* @__PURE__ */ React.createElement("span", { className: "deck-rank", style: { background: "var(--gold-tint)", color: "var(--gold)", border: "1px solid var(--gold-line)", padding: "4px 10px", fontFamily: "var(--f-display)", fontWeight: 600, fontSize: "var(--fs-12)", borderRadius: "var(--r-sm)", letterSpacing: "0.08em" } }, skill.rank || "\u30B9\u30AD\u30EB"), skill.type && /* @__PURE__ */ React.createElement("span", { style: { marginLeft: 8, fontFamily: "var(--f-mono)", fontSize: "var(--fs-10)", color: "var(--tx-dim)", padding: "3px 8px", background: "var(--surface-inset)", border: "1px solid var(--line-dim)", borderRadius: "var(--r-sm)" } }, skill.type), skill.sin && /* @__PURE__ */ React.createElement("span", { className: `sin-tag is-sin-${skill.sin}`, "data-sin": skill.sin, style: { marginLeft: 6, padding: "3px 8px", fontFamily: "var(--f-display)", fontWeight: 600, fontSize: "var(--fs-10)", borderRadius: "var(--r-sm)", letterSpacing: "0.08em" } }, skill.sin), skill.aoe && /* @__PURE__ */ React.createElement("span", { style: { marginLeft: 6, fontFamily: "var(--f-mono)", fontSize: "var(--fs-10)", color: "var(--gold)", padding: "3px 8px", border: "1px solid var(--gold-line)", borderRadius: "var(--r-sm)" } }, skill.aoe), /* @__PURE__ */ React.createElement("div", { style: { flex: 1 } }), canEdit && /* @__PURE__ */ React.createElement(Button, { variant: "ghost", size: "sm", icon: "edit", onClick: onEdit }, "\u624B\u52D5\u7DE8\u96C6")), /* @__PURE__ */ React.createElement("div", { className: "deck-name", style: { fontFamily: "var(--f-display)", fontWeight: 700, fontSize: "var(--fs-18)", color: "var(--tx)", marginBottom: "var(--s-3)", lineHeight: 1.2 } }, skill.name || "(\u540D\u79F0\u672A\u8A2D\u5B9A)"), skill.effect && /* @__PURE__ */ React.createElement("div", { style: { marginBottom: "var(--s-3)" } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--f-display)", fontSize: 9, letterSpacing: "0.18em", color: "var(--gold)", textTransform: "uppercase", marginBottom: 4 } }, "EFFECT / \u52B9\u679C"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-12)", color: "var(--tx-2)", lineHeight: 1.75, padding: "8px 12px", background: "var(--surface-inset)", border: "1px solid var(--line-dim)", borderLeft: "3px solid var(--gold)", borderRadius: "var(--r-sm)", whiteSpace: "pre-wrap" } }, window.formatEffectLines ? window.formatEffectLines(skill.effect) : skill.effect)), (skill.dice || []).length > 0 && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--f-display)", fontSize: 9, letterSpacing: "0.18em", color: "var(--gold)", textTransform: "uppercase", marginBottom: 4 } }, "DICE / \u30C0\u30A4\u30B9"), /* @__PURE__ */ React.createElement("div", { className: "ro-dice-list" }, (skill.dice || []).map((d, i) => /* @__PURE__ */ React.createElement("div", { key: i, className: "ro-dice-row" }, /* @__PURE__ */ React.createElement("span", { className: "ro-dice-idx" }, i + 1), /* @__PURE__ */ React.createElement("span", { className: "ro-dice-roll" }, d.roll || "-"), /* @__PURE__ */ React.createElement("span", { className: "ro-dice-eff", style: { whiteSpace: "pre-wrap" } }, d.effect ? window.formatEffectLines ? window.formatEffectLines(d.effect) : d.effect : /* @__PURE__ */ React.createElement("span", { style: { color: "var(--tx-mute)", fontStyle: "italic" } }, "\u52B9\u679C\u306A\u3057")))))));
const FocusedSkillCard = ({ skill, onPatch, onRemove, onAddDice, onPatchDice, onRemoveDice }) => {
  const h = React.createElement;
  const rankNum = String(skill.rank || "").replace(/[^0-9-]/g, "");
  return h("div", { className: "deck-card deck-focus", "data-sin": skill.sin || "" },
    h("div", { className: "deck-card-head" },
      h("label", { className: "deck-order-field" },
        h("span", { className: "deck-order-label" }, "オーダー"),
        h("input", { list: "skill-rank-list", className: "deck-rank deck-order-input", value: skill.rank || "", onChange: (e) => onPatch({ rank: e.target.value }), placeholder: "スキル0 / スキル4-2", title: "スキル番号。派生スキルはスキル4-2形式で表示します。同じ派生番号を複数のスキルに指定できます。", style: { background: "var(--gold-tint)", color: "var(--gold)", border: "1px solid var(--gold-line)", cursor: "text", fontSize: "var(--fs-12)", padding: "4px 10px", fontFamily: "var(--f-display)", fontWeight: 600, borderRadius: "var(--r-sm)", minWidth: 180, letterSpacing: "0.06em" } })
      ),
      h("datalist", { id: "skill-rank-list" }, SKILL_RANK_SUGGESTIONS.map((rank) => h("option", { key: rank, value: rank }))),
      h("div", { className: "grow" }),
      h("button", { className: "btn btn-sm", onClick: onRemove, style: { color: "var(--err)", borderColor: "color-mix(in oklab, var(--err) 40%, var(--line))" }, title: "このスキルを削除" }, h(Icon, { name: "trash", size: 12 }), " 削除")
    ),
      h("input", { className: "deck-name-input", placeholder: "スキル名（自由入力可）", value: skill.name || "", onChange: (e) => onPatch({ name: e.target.value }), style: { fontSize: "var(--fs-16)" } }),
    h("div", { className: "deck-focus-body" },
      h("div", { className: "stack-3" },
        h("div", { className: "deck-meta skill-meta-band" },
          h("div", { className: "skill-meta-field" }, h("label", { className: "field-label" }, "種別"), h("select", { className: "select", value: skill.type || "", onChange: (e) => onPatch({ type: e.target.value }) }, h("option", { value: "" }, "-"), SKILL_TYPES.map((type) => h("option", { key: type, value: type }, type)))),
          h("div", { className: "skill-meta-field" }, h("label", { className: "field-label" }, "大罪"), h("select", { className: `select sin-select${skill.sin ? ` is-sin-${skill.sin}` : ""}`, value: skill.sin || "", onChange: (e) => onPatch({ sin: e.target.value }), "data-sin": skill.sin || "" }, h("option", { value: "" }, "-"), SKILL_SINS.map((sin) => h("option", { key: sin, value: sin }, sin)))),
          h("div", { className: "skill-meta-field" }, h("label", { className: "field-label" }, "範囲"), h("select", { className: "select", value: skill.aoe || "", onChange: (e) => onPatch({ aoe: e.target.value }) }, h("option", { value: "" }, "単体（指定なし）"), SKILL_AOES.map((aoe) => h("option", { key: aoe, value: aoe }, aoe)))),
          skill.aoe && h("div", { className: "skill-meta-field skill-meta-field--aoe-count" }, h("label", { className: "field-label" }, "対象人数"), h("input", { className: "input", type: "number", min: "1", max: "99", placeholder: "人数", value: skill.aoeCount || "", onChange: (e) => onPatch({ aoeCount: e.target.value }), title: "広域スキルの対象人数" }))
        ),
        h("div", null, h("label", { className: "field-label" }, "効果"), h(AutoTextarea, { className: "deck-effect", placeholder: "使用時／マッチ勝利時などの効果", value: skill.effect, onChange: (e) => onPatch({ effect: e.target.value }), minRows: 4, style: { fontSize: "var(--fs-12)" } })),
        h("div", null, h("label", { className: "field-label" }, "クイックコマンド（任意）"), h("input", { className: "input", placeholder: "例：:出血+2 :呼吸+1", value: skill.quick || "", onChange: (e) => onPatch({ quick: e.target.value }), style: { fontFamily: "var(--f-mono)", fontSize: "var(--fs-11)" } })),
        h(SkillVariancePanel, { skill, onPatch })
      ),
      h("div", { className: "stack-2 deck-skill-dice" },
        h("label", { className: "field-label" }, "ダイス（何個でも追加可）"),
        h("div", { className: "deck-dice", style: { gap: 6 } }, (skill.dice || []).map((die, index) => h(DiceRow, { key: index, dice: die, idx: index, skillRankNum: rankNum, onPatch: (patch) => onPatchDice(index, patch), onRemove: () => onRemoveDice(index) }))),
        h("button", { className: "deck-add-dice", onClick: onAddDice }, "＋ ダイスを追加"),
        h("div", { className: "deck-dice-help" }, "ダイス式を基準に出力します。可変にしたd値・d数には変数名を付けられ、省略時はスキル番号・ダイス番号から既定名を生成します。")
      )
    )
  );
};
function isSkillFromDB(sk, srcSkill) {
  if (!srcSkill) return false;
  if (sk.rank !== srcSkill.rank) return false;
  if (sk.name !== srcSkill.name) return false;
  if (sk.type !== (srcSkill.type || "")) return false;
  if ((sk.effect || "") !== (srcSkill.effect || "")) return false;
  const a = sk.dice || [], b = srcSkill.dice || [];
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if ((a[i].roll || "") !== (b[i].roll || "")) return false;
    if ((a[i].effect || "") !== (b[i].effect || "")) return false;
  }
  return true;
}
const SkillDeck = ({ state, dispatch }) => {
  const skills = state.skills || [];
  const editable = canEditSkillState(state);
  const [curIdx, setCurIdx] = React.useState(0);
  const [forceEditMap, setForceEditMap] = React.useState({});
  // V18: 表示中スキルの id を保持。並べ替えでインデックスが変わっても同じスキルを
  // 表示し続けるため、DnD/ボタン並替後に画面が別スキルへ飛ぶのを防ぐ。
  const curSkillIdRef = React.useRef(null);
  const thumbsDnd = useDragReorder({
    onReorder: (from, to) => {
      // V18: 並替前の表示中スキル id を ref に記録。dispatch 後の useEffect([skills]) で
      // 同じ id の新しい位置へ curIdx を合わせ、表示スキルが入れ替わるのを防ぐ。
      curSkillIdRef.current = skills[curIdx]?.id ?? null;
      dispatch({ type: "MOVE_LIST_INDEX", field: "skills", from, to });
    }
  });
  React.useEffect(() => {
    if (curIdx >= skills.length) setCurIdx(Math.max(0, skills.length - 1));
  }, [skills.length]);
  // V18: 並替で skills 順が変わっても、記録した id のスキルを表示し続ける
  React.useEffect(() => {
    const keepId = curSkillIdRef.current;
    if (keepId == null) return;
    const idx = skills.findIndex((sk) => sk.id === keepId);
    if (idx >= 0 && idx !== curIdx) setCurIdx(idx);
    curSkillIdRef.current = null;
  }, [skills]);
  const patch = (id, patch2) => dispatch({ type: "PATCH_SKILL", id, patch: patch2 });
  const remove = (id) => {
    if (!confirm("\u3053\u306E\u30B9\u30AD\u30EB\u3092\u524A\u9664\u3057\u307E\u3059\u304B\uFF1F")) return;
    dispatch({ type: "REMOVE_SKILL", id });
    setCurIdx((i) => Math.max(0, i - 1));
  };
  const addSkill = () => {
    if (!editable) {
      toast("スキル追加は編集モード時のみ可能です");
      return;
    }
    dispatch({ type: "ADD_SKILL" });
    setTimeout(() => setCurIdx(skills.length), 10);
  };
  const deriveSkill = () => {
    if (!editable || !cur) {
      toast("派生スキルの作成は編集モード時のみ可能です");
      return;
    }
    dispatch({ type: "DERIVE_SKILL", id: cur.id });
    setTimeout(() => setCurIdx((i) => Math.min(i + 1, skills.length)), 10);
  };
  const addDice = (id) => dispatch({ type: "ADD_DICE", skillId: id });
  const patchDice = (id, idx, patch2) => dispatch({ type: "PATCH_DICE", skillId: id, diceIdx: idx, patch: patch2 });
  const removeDice = (id, idx) => dispatch({ type: "REMOVE_DICE", skillId: id, diceIdx: idx });
  React.useEffect(() => {
    const onKey = (e) => {
      if (document.activeElement && ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        setCurIdx((i) => Math.max(0, i - 1));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setCurIdx((i) => Math.min(skills.length - 1, i + 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [skills.length]);
  if (skills.length === 0) {
    return /* @__PURE__ */ React.createElement("div", { className: "deck" }, /* @__PURE__ */ React.createElement("div", { className: "deck-empty-cell", onClick: editable ? addSkill : () => toast("スキル追加は編集モード時のみ可能です"), style: { gridColumn: "1 / -1", ...(editable ? {} : { opacity: 0.45, cursor: "not-allowed" }) }, title: editable ? "" : "編集モード時のみ追加可能" }, "\uFF0B \u6700\u521D\u306E\u30B9\u30AD\u30EB\u3092\u8FFD\u52A0"));
  }
  const cur = skills[curIdx] || skills[0];
  return /* @__PURE__ */ React.createElement("div", { className: "deck-wrap" }, /* @__PURE__ */ React.createElement("div", { className: "deck-direct-nav", role: "tablist", "aria-label": "表示するスキルを選択" }, skills.map((sk, i) => /* @__PURE__ */ React.createElement("button", { key: sk.id, type: "button", role: "tab", "aria-selected": i === curIdx, className: `deck-direct-chip${i === curIdx ? " is-active" : ""}`, "data-sin": sk.sin || "", onClick: () => { curSkillIdRef.current = null; setCurIdx(i); }, title: `${sk.rank || `S${i}`}: ${sk.name || "(名称未設定)"}` }, /* @__PURE__ */ React.createElement("span", { className: "deck-direct-rank" }, sk.rank || `S${i}`), /* @__PURE__ */ React.createElement("span", { className: "deck-direct-name" }, sk.name || "(未設定)")))), /* @__PURE__ */ React.createElement("div", { className: "deck-nav" }, /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "deck-nav-btn",
      onClick: () => setCurIdx((i) => Math.max(0, i - 1)),
      disabled: curIdx === 0,
      title: "\u524D\u306E\u30B9\u30AD\u30EB (\u2190 \u30AD\u30FC)"
    },
    "\u2039"
  ), /* @__PURE__ */ React.createElement("div", { className: "deck-nav-info" }, /* @__PURE__ */ React.createElement("span", { className: "idx" }, String(curIdx + 1).padStart(2, "0"), " / ", String(skills.length).padStart(2, "0")), /* @__PURE__ */ React.createElement("span", { className: "cur" }, cur.rank || `\u30B9\u30AD\u30EB${curIdx}`, ": ", cur.name || "(\u540D\u79F0\u672A\u8A2D\u5B9A)"), /* @__PURE__ */ React.createElement("span", { style: { marginLeft: "auto", fontSize: "var(--fs-10)", color: "var(--tx-mute)", letterSpacing: "0.14em", fontFamily: "var(--f-display)" } }, "\u2190 \u2192 \u30AD\u30FC\u3067\u3082\u79FB\u52D5")), /* @__PURE__ */ React.createElement(
    "button",
    {
      className: "deck-nav-btn",
      onClick: () => setCurIdx((i) => Math.min(skills.length - 1, i + 1)),
      disabled: curIdx === skills.length - 1,
      title: "\u6B21\u306E\u30B9\u30AD\u30EB (\u2192 \u30AD\u30FC)"
    },
    "\u203A"
  ), /* @__PURE__ */ React.createElement(Button, { size: "sm", variant: "ghost", icon: "copy", onClick: deriveSkill, title: "現在のスキルの派生として、親rankを引き継いだS4-2形式のスキルを作成" }, "派生を追加"), /* @__PURE__ */ React.createElement(Button, { size: "sm", icon: "plus", onClick: addSkill }, "スキル追加")  ), !editable ? /* @__PURE__ */ React.createElement(
    ReadonlySkillCard,
    {
      skill: cur,
      canEdit: false,
      onEdit: () => toast("スキルを変更するには、人格を同期化して手動編集を開始してください")
    }
  ) : /* @__PURE__ */ React.createElement(
    FocusedSkillCard,
    {
      skill: cur,
      onPatch: (p) => patch(cur.id, p),
      onRemove: () => remove(cur.id),
      onAddDice: () => addDice(cur.id),
      onPatchDice: (idx, p) => patchDice(cur.id, idx, p),
      onRemoveDice: (idx) => removeDice(cur.id, idx)
    }
  ), /* @__PURE__ */ React.createElement("div", { className: "deck-thumbs" }, skills.map((sk, i) => /* @__PURE__ */ React.createElement(
    "div",
    {
      key: sk.id,
      className: `deck-thumb${i === curIdx ? " is-active" : ""} ${thumbsDnd.rowProps(i).className || ""}`,
      "data-sin": sk.sin || "",
      "data-drop": thumbsDnd.rowProps(i)["data-drop"],
      onDragOver: thumbsDnd.rowProps(i).onDragOver,
      onDragLeave: thumbsDnd.rowProps(i).onDragLeave,
      onDrop: thumbsDnd.rowProps(i).onDrop,
      onClick: () => { curSkillIdRef.current = null; setCurIdx(i); },
      title: `${sk.rank}: ${sk.name}`
    },
    /* @__PURE__ */ React.createElement("div", { className: "deck-thumb-head" }, /* @__PURE__ */ React.createElement(
      "span",
      {
        className: "dnd-handle",
        draggable: true,
        onDragStart: thumbsDnd.handleProps(i).onDragStart,
        onDragEnd: thumbsDnd.handleProps(i).onDragEnd,
        onClick: (e) => e.stopPropagation(),
        title: "\u30C9\u30E9\u30C3\u30B0\u3057\u3066\u4E26\u3073\u66FF\u3048"
      },
      "\u283F"
    ), /* @__PURE__ */ React.createElement("div", { className: "deck-thumb-rank" }, sk.rank), /* @__PURE__ */ React.createElement("div", { className: "deck-thumb-reorder" }, /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "deck-thumb-rbtn",
        disabled: i === 0,
        onClick: (e) => {
          e.stopPropagation();
          // V18: 並替後も表示中スキルは移動させない（id で固定）
          curSkillIdRef.current = skills[curIdx]?.id ?? null;
          dispatch({ type: "REORDER_LIST", field: "skills", key: sk.id, dir: -1 });
        },
        title: "\u5DE6\u3078 (\u4E26\u3073\u66FF\u3048)"
      },
      "\u2039"
    ), /* @__PURE__ */ React.createElement(
      "button",
      {
        className: "deck-thumb-rbtn",
        disabled: i === skills.length - 1,
        onClick: (e) => {
          e.stopPropagation();
          // V18: 並替後も表示中スキルは移動させない（id で固定）
          curSkillIdRef.current = skills[curIdx]?.id ?? null;
          dispatch({ type: "REORDER_LIST", field: "skills", key: sk.id, dir: 1 });
        },
        title: "\u53F3\u3078 (\u4E26\u3073\u66FF\u3048)"
      },
      "\u203A"
    ))),
    /* @__PURE__ */ React.createElement("div", { className: "deck-thumb-name" }, sk.name || "(\u672A\u8A2D\u5B9A)")
  )), /* @__PURE__ */ React.createElement("button", { className: "deck-thumb-add", onClick: addSkill, title: "\u30B9\u30AD\u30EB\u8FFD\u52A0" }, "\uFF0B")));
};
window.SkillDeck = SkillDeck;
