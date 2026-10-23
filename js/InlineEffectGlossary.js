/* LIMBUS BUILD TERMINAL — inline reference glossary.
   PC: delayed hover / keyboard focus. Touch: tap or long-press.
   Definitions come from the committed core-rules corpus and current DB.
   Unknown named references show their closest source effect instead of guessing. */
(function (global) {
  "use strict";
  const OFFICIAL_TERMS = {
    "パワー": { group: "バフ", source: "基本ルール p.304", text: "[1R] パワーの数だけ攻撃スキル威力が増加する（最大10）。" },
    "忍耐": { group: "バフ", source: "基本ルール p.304", text: "[1R] 忍耐の数だけ守備スキル威力が増加する（最大10）。" },
    "クイック": { group: "バフ", source: "基本ルール p.304", text: "[1R] 速度がクイックの数だけ増加する（最大10）。" },
    "保護": { group: "バフ", source: "基本ルール p.304", text: "[1R] 保護の数だけ、スキルで受けるHPダメージが減少する（最大10）。" },
    "混乱保護": { group: "バフ", source: "基本ルール p.304", text: "[1R] 混乱保護の数だけ、スキルで受けるSANダメージが減少する（最大10）。" },
    "充電": { group: "バフ／蓄積資源", source: "基本ルール p.304", text: "消費時に特定スキルの能力が上昇する。R終了時に1減少する（最大20）。" },
    "呼吸": { group: "バフ／蓄積資源", source: "基本ルール p.304", text: "攻撃前、数値×5%の確率でクリティカル攻撃になる。成功時はスキルの全ダイスのダメージが2増加し、ダイス数×3だけ呼吸が減少する。R終了時に1減少（最大99）。" },
    "HP回復量増加": { group: "バフ", source: "基本ルール p.304", text: "[1R] HPを回復する効果を受けた時、数値だけ回復量が増加する（最大10）。" },
    "SAN回復量増加": { group: "バフ", source: "基本ルール p.304", text: "[1R] SANを回復する効果を受けた時、数値だけ回復量が増加する（最大10）。" },
    "ダメージ量増加": { group: "バフ", source: "基本ルール p.304", text: "[1R] スキルで与えるダメージ量が数値だけ増加する（最大10）。" },
    "虚弱": { group: "デバフ", source: "基本ルール p.307", text: "[1R] 虚弱の数だけ攻撃スキル威力が減少する（最大10）。" },
    "武装解除": { group: "デバフ", source: "基本ルール p.307", text: "[1R] 武装解除の数だけ守備スキル威力が減少する（最大10）。" },
    "束縛": { group: "デバフ", source: "基本ルール p.307", text: "[1R] 速度が束縛の数だけ減少する（最大10）。" },
    "脆弱": { group: "デバフ", source: "基本ルール p.307", text: "[1R] 脆弱の数だけ、スキルで受けるHPダメージが増加する（最大10）。" },
    "混乱脆弱": { group: "デバフ", source: "基本ルール p.307", text: "[1R] 混乱脆弱の数だけ、スキルで受けるSANダメージが増加する（最大10）。" },
    "火傷": { group: "デバフ", source: "基本ルール p.307", text: "R終了時、火傷の数だけHPダメージを受け、火傷の数を半減する（最大99）。" },
    "沈潜": { group: "デバフ", source: "基本ルール p.307", text: "R終了時、沈潜の数だけSANダメージを受け、数値を半減する。SANが存在しない、または0なら、代わりに沈潜の数の半分だけHPダメージを受けて数値を半減する（最大99）。" },
    "出血": { group: "デバフ", source: "基本ルール p.307", text: "[1R] 攻撃スキルのダイスロール時、出血の数だけHPダメージを受ける（最大99）。" },
    "恐慌": { group: "デバフ", source: "基本ルール p.307", text: "[1R] 攻撃スキルのダイスロール時、恐慌の数だけSANダメージを受ける（最大99）。" },
    "破裂": { group: "デバフ", source: "基本ルール p.307", text: "破裂爆発を受けた時、破裂の数だけHPダメージを受ける。R終了時に1減少する（最大99）。" },
    "振動": { group: "デバフ", source: "基本ルール p.307", text: "振動爆発を受けた時、振動の数だけSANダメージを受ける。R終了時に1減少する（最大99）。" },
    "HP回復量減少": { group: "デバフ", source: "基本ルール p.307", text: "[1R] HPを回復する効果を受けた時、数値だけ回復量が減少する（最大10）。" },
    "SAN回復量減少": { group: "デバフ", source: "基本ルール p.307", text: "[1R] SANを回復する効果を受けた時、数値だけ回復量が減少する（最大10）。" },
    "ダメージ量減少": { group: "デバフ", source: "基本ルール p.307", text: "[1R] スキルで与えるダメージ量が数値だけ減少する（最大10）。" },
    "毒": { group: "デバフ", source: "基本ルール p.308", text: "R終了時、毒の数だけダメージを受け、数値を半減する（最大99）。" },
    "麻痺": { group: "デバフ", source: "基本ルール p.308", text: "麻痺の数÷2だけ、スキルの全ダイスのd値が減少する。麻痺が1なら代わりに1減少する（最大10）。" },
    "煙": { group: "中立バフ", source: "基本ルール p.311", text: "煙の数だけ受けるダメージが増加し、与えるダメージが煙÷2だけ増加する。R終了時に1減少する（最大10）。" },
    "バリア": { group: "中立バフ", source: "基本ルール p.311", text: "[1R] バリアの数だけ被ダメージをカットし、カットしたダメージ分バリアが減少する（最大1000）。" },
    "弾丸": { group: "特殊資源", source: "基本ルール p.312", text: "弾丸は種類ごとに銃撃ダイスでの効果が異なる。消費すると特定戦術の能力が向上する場合がある。具体的な種類は弾丸名をホバー／タップして確認できる。" },
    "爆発": { group: "特殊処理", source: "基本ルール p.313", text: "基本ルールの特殊処理一覧に登場する語。下の関連効果は、このツール内で記載された実例。" },
    "混乱": { group: "状態", source: "基本ルール／データ内参照", text: "混乱に関する専用処理は効果文ごとに条件が異なる。下の関連効果から、該当する人格・E.G.Oの条件や解除方法を確認できる。" },
    "指令": { group: "特殊用語", source: "基本ルール／データ内参照", text: "人格・E.G.Oの効果文に登場する特殊用語。具体的な数値や条件は、該当する参照元の効果文を併せて確認できる。" }
  };

  const escapeRegExp = (value) => value.replace(/[.*+?^$()|[\]\\]/g, "\\$&");
  const cleanTerm = (value) => String(value || "").replace(/^\[|\]$/g, "").trim();
  const shortText = (value, limit = 250) => {
    const text = String(value || "").trim();
    return text.length > limit ? text.slice(0, limit - 1) + "…" : text;
  };
  let cachedDb = null;
  let cachedGlossary = null;
  let cachedPattern = null;
  let cachedTerms = [];

  function buildGlossary(db) {
    if (db && db === cachedDb && cachedGlossary) return cachedGlossary;
    const glossary = new Map();
    const sourceRows = [];
    const add = (term, entry) => {
      const key = cleanTerm(term);
      if (key.length < 2 || key.length > 64) return;
      if (!glossary.has(key)) glossary.set(key, []);
      const entries = glossary.get(key);
      const uniqueKey = [entry.category, entry.source, entry.description].join("|");
      if (entries.some((item) => item._key === uniqueKey)) return;
      entries.push({ ...entry, term: key, _key: uniqueKey });
    };
    const addSourceRow = (text, category, source, title) => {
      const value = String(text || "").trim();
      if (!value) return;
      const row = { text: value, category: category || "効果本文", source: source || "データ", title: title || "" };
      sourceRows.push(row);
      for (const match of value.matchAll(/\[([^\]\n]{2,64})\]/gu)) {
        const name = cleanTerm(match[1]);
        if (!name || /^\d+R$/u.test(name)) continue;
        add(name, { category: "本文中の参照", source: row.source, description: shortText(value), priority: 20 });
      }
    };
    const addEntity = (term, category, source, description, priority = 80) => {
      const value = String(description || "").trim();
      add(term, {
        category: category || "固有効果",
        source: source || "データベース",
        description: value || "この項目の個別説明はデータに登録されていません。下の関連効果で実際の使用箇所を確認できます。",
        priority
      });
      if (value) addSourceRow(value, category, source, term);
    };
    const combine = (...values) => values.map((value) => String(value || "").trim()).filter(Boolean).join("\n");

    Object.entries(OFFICIAL_TERMS).forEach(([term, entry]) => {
      add(term, { category: entry.group, source: entry.source, description: entry.text, priority: 120 });
      sourceRows.push({ text: entry.text, category: entry.group, source: entry.source, title: term });
    });

    const personas = [...(db && Array.isArray(db.normal_personas) ? db.normal_personas : []),
      ...(db && Array.isArray(db.tokui_personas) ? db.tokui_personas : [])];
    personas.forEach((persona) => {
      const identity = "人格：" + (persona.name || "名称未設定");
      const passive = combine(persona.passive_cond && "発動条件：" + persona.passive_cond, persona.passive_always && "常時：" + persona.passive_always, persona.passive_effect);
      if (persona.passive_name) addEntity(persona.passive_name, "人格パッシブ", identity, passive, 90);
      addSourceRow(passive, "人格パッシブ", identity, persona.passive_name);
      (persona.unique_buffs || []).forEach((buff) => {
        const description = combine(buff.desc, buff.type && "種別：" + buff.type, buff.initial != null && "初期値：" + buff.initial, buff.max != null && "最大値：" + buff.max);
        addEntity(buff.name, buff.type || "人格固有バフ", identity, description, 105);
      });
      (persona.skills || []).forEach((skill, index) => {
        const source = identity + "／" + (skill.name || skill.rank || "スキル" + index);
        addSourceRow(skill.effect, "人格スキル", source, skill.name);
        (skill.dice || []).forEach((die, dieIndex) => addSourceRow(die.effect, "人格ダイス", source + "／ダイス" + (dieIndex + 1), skill.name));
      });
    });

    (db && Array.isArray(db.egos) ? db.egos : []).forEach((ego) => {
      const source = "E.G.O：" + (ego.rank ? "[" + ego.rank + "] " : "") + (ego.name || "名称未設定");
      if (ego.passive_name) addEntity(ego.passive_name, "E.G.Oパッシブ", source, combine(ego.passive_cond && "発動条件：" + ego.passive_cond, ego.passive_effect), 95);
      addSourceRow(ego.passive_effect, "E.G.Oパッシブ", source, ego.passive_name);
      if (ego.unique_buff) {
        const uniqueText = String(ego.unique_buff);
        const names = [...uniqueText.matchAll(/\[([^\]\n]{2,64})\]/gu)]
          .map((match) => cleanTerm(match[1]))
          .filter((name) => name && !/^\d+R$/u.test(name));
        const mainName = names[0] || uniqueText.split(/\r?\n/u)[0].replace(/^(?:固有バフ|固有効果)\s*[:：]?/u, "").trim();
        if (mainName) addEntity(mainName, "E.G.O固有効果", source, uniqueText, 110);
        addSourceRow(uniqueText, "E.G.O固有効果", source, mainName);
      }
      [ego.kakusei, ego.shinshoku, ...(ego.sub_skills || [])].filter(Boolean).forEach((skill, index) => {
        const label = skill.name || skill.kind || (index === 0 ? "覚醒スキル" : "派生スキル");
        const skillSource = source + "／" + label;
        addSourceRow(skill.effect, "E.G.Oスキル", skillSource, label);
        (skill.dice || []).forEach((die, dieIndex) => addSourceRow(die.effect, "E.G.Oダイス", skillSource + "／ダイス" + (dieIndex + 1), label));
      });
    });

    (db && Array.isArray(db.support_passives) ? db.support_passives : []).forEach((item) => {
      addEntity(item.name, "サポートパッシブ", "サポートパッシブ", combine(item.cond && "発動条件：" + item.cond, item.effect), 95);
    });
    (db && Array.isArray(db.death_passives) ? db.death_passives : []).forEach((item) => {
      addEntity(item.name, "死亡後パッシブ", "死亡後パッシブ", combine(item.cond && "発動条件：" + item.cond, item.effect), 90);
    });
    (db && Array.isArray(db.special_enhancements) ? db.special_enhancements : []).forEach((item) => {
      addEntity(item.name, "特殊強化", "特殊強化", item.effect, 90);
    });
    (db && Array.isArray(db.normal_enhancements) ? db.normal_enhancements : []).forEach((item) => {
      addEntity(item.name, "通常強化", "通常強化", item.effect, 80);
    });
    (db && Array.isArray(db.spirits) ? db.spirits : []).forEach((item) => {
      addEntity(item.name, "精神状態", "精神状態", combine(item.always_effect, item.morale_effect, item.confuse_effect), 85);
    });
    (db && Array.isArray(db.items) ? db.items : []).forEach((item) => {
      addEntity(item.name, "アイテム", "アイテム", item.effect, 80);
    });

    const usageTerms = [...glossary.keys()].sort((a, b) => b.length - a.length);
    usageTerms.forEach((term) => {
      const entries = glossary.get(term);
      let added = 0;
      for (const row of sourceRows) {
        if (!row.text.includes(term) || row.title === term) continue;
        add(term, { category: "関連効果の例", source: row.source, description: shortText(row.text), priority: 25 });
        added += 1;
        if (added >= 3 || entries.length >= 7) break;
      }
    });

    glossary.forEach((entries) => entries.sort((a, b) => (b.priority || 0) - (a.priority || 0)));
    cachedDb = db;
    cachedGlossary = glossary;
    cachedTerms = [...glossary.keys()].sort((a, b) => b.length - a.length || a.localeCompare(b, "ja"));
    cachedPattern = cachedTerms.length ? new RegExp(cachedTerms.map(escapeRegExp).join("|"), "gu") : null;
    return glossary;
  }

  function tokenize(text, db) {
    const input = String(text == null ? "" : text);
    const glossary = buildGlossary(db || global.DB);
    if (!input || !cachedPattern) return [{ text: input, term: null, entries: [] }];
    cachedPattern.lastIndex = 0;
    const parts = [];
    let lastIndex = 0;
    for (const match of input.matchAll(cachedPattern)) {
      if (match.index > lastIndex) parts.push({ text: input.slice(lastIndex, match.index), term: null, entries: [] });
      const term = match[0];
      parts.push({ text: term, term, entries: (glossary.get(term) || []).slice(0, 7) });
      lastIndex = match.index + term.length;
    }
    if (lastIndex < input.length) parts.push({ text: input.slice(lastIndex), term: null, entries: [] });
    return parts.length ? parts : [{ text: input, term: null, entries: [] }];
  }

  function TooltipTerm(props) {
    const React = global.React;
    const ReactDOM = global.ReactDOM;
    const term = props.term;
    const entries = props.entries || [];
    const [open, setOpen] = React.useState(false);
    const [position, setPosition] = React.useState(null);
    const anchorRef = React.useRef(null);
    const panelRef = React.useRef(null);
    const hoverTimer = React.useRef(null);
    const closeTimer = React.useRef(null);
    const longPressTimer = React.useRef(null);
    const suppressClick = React.useRef(false);
    const uid = React.useId().replace(/:/g, "");
    const panelId = "lbt-glossary-" + uid;
    const clearTimer = (ref) => { if (ref.current) global.clearTimeout(ref.current); ref.current = null; };
    const closeSoon = (delay = 300) => {
      clearTimer(closeTimer);
      closeTimer.current = global.setTimeout(() => setOpen(false), delay);
    };
    const placePanel = () => {
      const node = anchorRef.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const viewportWidth = Math.max(220, global.innerWidth - 24);
      const width = Math.min(370, viewportWidth);
      const estimatedHeight = Math.min(330, Math.max(180, global.innerHeight * 0.48));
      const left = Math.max(12, Math.min(rect.left, global.innerWidth - width - 12));
      let top = rect.bottom + 8;
      if (top + estimatedHeight > global.innerHeight - 12) top = Math.max(12, rect.top - estimatedHeight - 8);
      setPosition({ top, left, width });
    };
    React.useEffect(() => {
      if (!open) return undefined;
      placePanel();
      const update = () => placePanel();
      const outside = (event) => {
        if (anchorRef.current && anchorRef.current.contains(event.target)) return;
        if (panelRef.current && panelRef.current.contains(event.target)) return;
        setOpen(false);
      };
      global.addEventListener("resize", update);
      global.addEventListener("scroll", update, true);
      global.document.addEventListener("pointerdown", outside, true);
      return () => {
        global.removeEventListener("resize", update);
        global.removeEventListener("scroll", update, true);
        global.document.removeEventListener("pointerdown", outside, true);
      };
    }, [open]);
    const startHover = (event) => {
      if (event.pointerType !== "mouse") return;
      clearTimer(closeTimer);
      clearTimer(hoverTimer);
      hoverTimer.current = global.setTimeout(() => setOpen(true), 280);
    };
    const endHover = (event) => {
      if (event.pointerType !== "mouse") return;
      clearTimer(hoverTimer);
      closeSoon(360);
    };
    const onPointerDown = (event) => {
      if (event.pointerType !== "touch") return;
      clearTimer(longPressTimer);
      suppressClick.current = false;
      longPressTimer.current = global.setTimeout(() => {
        suppressClick.current = true;
        setOpen(true);
      }, 480);
    };
    const onPointerUp = () => clearTimer(longPressTimer);
    const onClick = (event) => {
      if (suppressClick.current) {
        suppressClick.current = false;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      setOpen((value) => !value);
    };
    const panel = open && position ? React.createElement("div", {
      id: panelId, ref: panelRef, className: "lbt-glossary-popover", role: "tooltip",
      style: { position: "fixed", top: position.top, left: position.left, width: position.width },
      onPointerEnter: () => { clearTimer(closeTimer); },
      onPointerLeave: () => closeSoon(220)
    },
      React.createElement("div", { className: "lbt-glossary-popover-head" },
        React.createElement("span", { className: "lbt-glossary-popover-kicker" }, "用語リファレンス"),
        React.createElement("strong", { className: "lbt-glossary-popover-title" }, term),
        React.createElement("button", { type: "button", className: "lbt-glossary-popover-close", "aria-label": "用語詳細を閉じる", onClick: () => setOpen(false) }, "×")
      ),
      React.createElement("div", { className: "lbt-glossary-popover-body" },
        entries.slice(0, 5).map((entry, index) => React.createElement("section", { key: entry._key || entry.source + index, className: "lbt-glossary-entry" },
          React.createElement("div", { className: "lbt-glossary-entry-meta" },
            React.createElement("b", null, entry.category || "関連効果"),
            entry.source ? React.createElement("span", null, entry.source) : null
          ),
          React.createElement("p", null, entry.description || "この項目の説明は未登録です。")
        )),
        entries.length > 5 ? React.createElement("div", { className: "lbt-glossary-more" }, "ほか " + (entries.length - 5) + " 件の参照があります。") : null
      ),
      React.createElement("div", { className: "lbt-glossary-popover-foot" }, "PC：ホバー／クリック　スマホ：タップ／長押し　Escで閉じる")
    ) : null;
    const portal = panel && ReactDOM && ReactDOM.createPortal ? ReactDOM.createPortal(panel, global.document.body) : panel;
    return React.createElement("span", {
      className: "lbt-glossary-anchor", ref: anchorRef,
      onPointerEnter: startHover, onPointerLeave: endHover, onPointerDown,
      onPointerUp, onPointerCancel: onPointerUp,
      onContextMenu: (event) => { if (event.pointerType === "touch") event.preventDefault(); setOpen(true); },
      onKeyDown: (event) => { if (event.key === "Escape") setOpen(false); }
    },
      React.createElement("button", {
        type: "button", className: "lbt-glossary-term",
        "aria-label": "用語詳細：" + term, "aria-haspopup": "true",
        "aria-expanded": open, "aria-describedby": open ? panelId : undefined,
        title: "PCはホバー、スマホはタップ／長押しで詳細を表示",
        onFocus: () => setOpen(true), onClick
      }, props.children || term),
      portal
    );
  }

  function InlineGlossaryText(props) {
    const React = global.React;
    const pieces = tokenize(props.text, global.DB);
    return React.createElement(React.Fragment, null, pieces.map((piece, index) => piece.term
      ? React.createElement(TooltipTerm, { key: index + "-" + piece.term, term: piece.term, entries: piece.entries }, piece.text)
      : React.createElement(React.Fragment, { key: index }, piece.text)));
  }
  function render(text, scope) {
    if (text == null || text === "") return text;
    return global.React.createElement(InlineGlossaryText, { text: String(text), scope: scope || "" });
  }
  global.LBTInlineEffectGlossary = {
    buildGlossary, tokenize, render,
    refresh: (db) => { cachedDb = null; cachedGlossary = null; cachedPattern = null; cachedTerms = []; return buildGlossary(db || global.DB); }
  };
  global.LBT_GLOSSARY_TEXT = (text, scope) => global.LBTInlineEffectGlossary.render(text, scope);
})(window);
