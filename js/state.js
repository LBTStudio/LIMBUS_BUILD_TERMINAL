(() => {
  const STORAGE_KEY = "lbt_v46_state";
  const HISTORY_LIMIT = 60;
  const INIT_STATE = {
    // Base identity
    charName: "",
    plName: "",
    imgUrls: "",
    color: "#c8a84b",
    // Equipped persona reference
    personaMode: null,
    // 'n' | 't' | null
    personaNo: null,
    // number
    personaSrc: null,
    // snapshot of imported persona (immutable ref)
    // v48: 同期化(=手動編集)モード。true にすると装備人格を保ったまま
    // ステータス/パッシブ/スキル/固有バフをすべて自由編集可能扱いにする。
    syncedManual: false,
    // Stats (may diverge from persona template if edited)
    hp: "",
    san: "",
    speed: "",
    bullets: "",
    resS: "\u666E\u901A",
    resP: "\u666E\u901A",
    resB: "\u666E\u901A",
    // Spirit
    spirit: "",
    spiritMorale: "",
    spiritConfuse: "",
    spiritAlways: "",
    // Passives
    pas: { name: "", cond: "", always: "", effect: "", quick: "" },
    pas2Enabled: false,
    pas2: { name: "", cond: "", effect: "" },
    // Unique buffs (custom keyword-like statuses on this persona)
    uniqueBuffs: [],
    // {id, name, type, initial, max, desc, place:'status'|'params'|'none'}
    // Skills 0..4 (or more)
    skills: [],
    // {id, rank, type, sin, aoe('広域'|'広域乱射'|''), aoeCount, name, effect, dice:[{roll,effect,dPlus,dCnt}], quick}
    // Equipped EGO slots
    egoSlots: {
      ZAYIN: null,
      TETH: null,
      HE: null,
      WAW: null,
      ALEPH: null
      // each null | {no, name, kakusei|shinshoku, ...}
    },
    // Support passives (max 3 with special enh)
    supports: [],
    // {id, name, cond, effect, lp}
    // Roster: owned personas & egos with supplement flags
    roster: {
      personas: [],
      // {uid, no, mode, syncRank:'0'|'00'|'000'|null, syncMax:bool, lcb:bool, equipped:bool, notes}
      egos: []
      // {uid, no, rank, analyzed:bool, analyzeMax:bool, notes}
    },
    // Enhancements
    enhancements: [],
    // {id, group, name, effect, shards, category}
    // Custom statuses & default statuses
    customStatuses: [],
    // {id, label, initial, max, place:'status'|'params'}
    defaultStatuses: null,
    // if null, use factory defaults
    // Formulas
    formulas: [],
    // {id, name, expr}
    builtinFormulasOverride: {},
    // v50: 組込式の上書き。{ MT: 'expr', DM: 'expr' } または {MT: null} = 非表示
    autoFml: true,
    moraleLine: "12",
    // Extra commands (memo)
    extraCmd: "",
    // Favorites & history (persistent across sessions)
    favorites: [],
    // ['n:1', 't:5'] etc
    historyRecent: [],
    // same format, LRU 20
    // UI state (not part of undo)
    ui: {
      currentSection: "persona",
      previewTab: "memo",
      previewOpen: true,
      codexMode: "n",
      // 'n'|'t'|'roster'|'fav'|'history'
      filterSins: [],
      filterKws: [],
      filterAffs: [],
      // affiliations
      filterResS: "",
      filterResP: "",
      filterResB: "",
      searchQuery: "",
      sortBy: "no",
      // 'no' | 'hp' | 'san' | 'speed'
      hoveredPersona: null,
      // v48: PERSONA CODEX グリッドの展開状態。装備済み時のデフォルトは false（=畳む）
      codexExpanded: false,
      // v48: EGO 詳細を上部に引き上げる際の対象スロット
      egoDetailSlot: null,
      // 'ZAYIN'|'TETH'|'HE'|'WAW'|'ALEPH'|null
      egoRankFilter: "",
      // クリックで自動セットされるランクフィルタ
      // v52 (G): EGO カードリストの展開状態。undefined=装備有無で自動判定 / true/false=固定
      egoListExpanded: void 0,
      // v48: LivePreview 折り畳みセクション state
      previewCollapsed: {}
      // {sectionKey: true/false}
    }
  };
  function appReducer(state, action) {
    switch (action.type) {
      case "SET_FIELD":
        return { ...state, [action.field]: action.value };
      case "SET_UI":
        return { ...state, ui: { ...state.ui, ...action.ui } };
      case "PATCH":
        return { ...state, ...action.patch };
      case "PATCH_PAS":
        return { ...state, pas: { ...state.pas, ...action.patch } };
      case "PATCH_PAS2":
        return { ...state, pas2: { ...state.pas2, ...action.patch } };
      case "PATCH_SPIRIT":
        return { ...state, ...action.patch };
      case "RESET":
        return {
          ...INIT_STATE,
          favorites: state.favorites,
          historyRecent: state.historyRecent,
          ui: state.ui
        };
      case "HYDRATE":
        return {
          ...INIT_STATE,
          ...action.state,
          ui: { ...INIT_STATE.ui, ...action.state.ui || {} }
        };
      /* ---- Persona equipment ---- */
      case "EQUIP_PERSONA": {
        const { mode, no, src } = action;
        const kw = (src.keywords || []).filter((k) => !["\u7206\u767A", "\u6DF7\u4E71"].includes(k));
        const skills = (src.skills || []).map((sk, i) => ({
          id: `sk-${Date.now()}-${i}`,
          rank: sk.rank || `\u30B9\u30AD\u30EB${i}`,
          type: sk.type || "",
          sin: sk.sin || "",
          aoe: sk.aoe || "",
          aoeCount: sk.aoeCount || "",
          name: sk.name || "",
          effect: sk.effect || "",
          dice: (sk.dice || []).map((d) => ({ roll: d.roll || "", effect: d.effect || "" })),
          quick: ""
        }));
        const ubs = (src.unique_buffs || []).map((b, i) => ({
          id: `ub-${Date.now()}-${i}`,
          name: b.name || "",
          type: b.type || "\u30D0\u30D5",
          initial: b.initial !== void 0 ? b.initial : 0,
          max: b.max || 20,
          desc: b.desc || "",
          place: b.place || "status"
        }));
        const uniqKey = `${mode}:${no}`;
        let personas = state.roster.personas.slice();
        personas = personas.map((p) => ({ ...p, equipped: false }));
        const existing = personas.findIndex((p) => `${p.mode}:${p.no}` === uniqKey);
        if (existing >= 0) {
          personas[existing] = { ...personas[existing], equipped: true };
        } else {
          personas.push({
            uid: `pr-${Date.now()}`,
            no,
            mode,
            syncRank: null,
            syncMax: false,
            lcb: false,
            equipped: true,
            notes: ""
          });
        }
        const hist = [uniqKey, ...state.historyRecent.filter((k) => k !== uniqKey)].slice(0, 20);
        return {
          ...state,
          personaMode: mode,
          personaNo: no,
          personaSrc: src,
          syncedManual: false,
          // v48: 装備切替時は同期化モードをリセット
          hp: String(src.hp || ""),
          san: String(src.san || ""),
          speed: src.speed || "",
          bullets: src.bullets || "\xD7",
          resS: src.res_slash || "\u666E\u901A",
          resP: src.res_pierce || "\u666E\u901A",
          resB: src.res_blunt || "\u666E\u901A",
          pas: {
            name: src.passive_name || "",
            cond: src.passive_cond || "",
            always: src.passive_always || "",
            effect: src.passive_effect || "",
            quick: ""
          },
          uniqueBuffs: ubs,
          skills,
          charName: state.charName || src.name || "",
          roster: { ...state.roster, personas },
          historyRecent: hist
        };
      }
      case "UNEQUIP_PERSONA":
        return {
          ...state,
          personaMode: null,
          personaNo: null,
          personaSrc: null,
          syncedManual: false,
          roster: { ...state.roster, personas: state.roster.personas.map((p) => ({ ...p, equipped: false })) }
        };
      /* v48: 同期化＝手動編集モードのトグル */
      case "SET_SYNCED_MANUAL":
        return { ...state, syncedManual: !!action.value };
      /* v49: 同期化時、装備中人格の名前/No/モードを書き換え（personaSrcも更新） */
      case "PATCH_PERSONA_META": {
        const patch = action.patch || {};
        const nextSrc = state.personaSrc ? { ...state.personaSrc, ...patch.src || {} } : state.personaSrc;
        return {
          ...state,
          personaSrc: nextSrc,
          ...patch.personaMode !== void 0 ? { personaMode: patch.personaMode } : {},
          ...patch.personaNo !== void 0 ? { personaNo: patch.personaNo } : {}
        };
      }
      /* ---- Favorites ---- */
      case "TOGGLE_FAV": {
        const k = `${action.mode}:${action.no}`;
        const has = state.favorites.includes(k);
        return { ...state, favorites: has ? state.favorites.filter((x) => x !== k) : [...state.favorites, k] };
      }
      /* ---- Roster ---- */
      case "ADD_ROSTER": {
        const { mode, no } = action;
        const uniqKey = `${mode}:${no}`;
        if (state.roster.personas.some((p) => `${p.mode}:${p.no}` === uniqKey)) return state;
        return { ...state, roster: { ...state.roster, personas: [
          ...state.roster.personas,
          { uid: `pr-${Date.now()}`, no, mode, syncRank: null, syncMax: false, lcb: false, equipped: false, notes: "" }
        ] } };
      }
      case "REMOVE_ROSTER": {
        return { ...state, roster: {
          ...state.roster,
          personas: state.roster.personas.filter((p) => p.uid !== action.uid)
        } };
      }
      case "PATCH_ROSTER": {
        return { ...state, roster: {
          ...state.roster,
          personas: state.roster.personas.map((p) => p.uid === action.uid ? { ...p, ...action.patch } : p)
        } };
      }
      /* ---- Skills ---- */
      case "PATCH_SKILL":
        return { ...state, skills: state.skills.map((s) => s.id === action.id ? { ...s, ...action.patch } : s) };
      case "ADD_SKILL":
        return { ...state, skills: [...state.skills, {
          id: `sk-${Date.now()}`,
          rank: `\u30B9\u30AD\u30EB${state.skills.length}`,
          type: "\u6253\u6483",
          sin: "",
          aoe: "",
          aoeCount: "",
          name: "",
          effect: "",
          dice: [{ roll: "", effect: "" }],
          quick: ""
        }] };
      case "REMOVE_SKILL":
        return { ...state, skills: state.skills.filter((s) => s.id !== action.id) };
      case "ADD_DICE":
        return { ...state, skills: state.skills.map((s) => s.id === action.skillId ? { ...s, dice: [...s.dice, { roll: "", effect: "" }] } : s) };
      case "REMOVE_DICE":
        return { ...state, skills: state.skills.map((s) => s.id === action.skillId ? { ...s, dice: s.dice.filter((_, i) => i !== action.diceIdx) } : s) };
      case "PATCH_DICE":
        return { ...state, skills: state.skills.map((s) => s.id === action.skillId ? { ...s, dice: s.dice.map((d, i) => i === action.diceIdx ? { ...d, ...action.patch } : d) } : s) };
      /* ---- EGO ---- */
      case "SET_EGO_SLOT": {
        const nextEgoSlots = { ...state.egoSlots, [action.rank]: action.value };
        const nextUi = action.value ? { ...state.ui, egoListExpanded: false, egoDetailSlot: null } : state.ui;
        return { ...state, egoSlots: nextEgoSlots, ui: nextUi };
      }
      /* ---- Support ---- */
      case "ADD_SUPPORT":
        if (state.supports.some((s) => s.name === action.spp.name)) return state;
        return { ...state, supports: [...state.supports, { id: `spp-${Date.now()}`, ...action.spp }] };
      case "REMOVE_SUPPORT":
        return { ...state, supports: state.supports.filter((s) => s.id !== action.id) };
      /* ---- Unique buffs ---- */
      case "ADD_UB":
        return { ...state, uniqueBuffs: [...state.uniqueBuffs, {
          id: `ub-${Date.now()}`,
          name: "",
          type: "\u56FA\u6709\u30D0\u30D5",
          max: 20,
          desc: "",
          place: "status"
          // v49+: 'status'=ST側 / 'params'=ラベル側 (v45互換)
        }] };
      case "PATCH_UB":
        return { ...state, uniqueBuffs: state.uniqueBuffs.map((b) => b.id === action.id ? { ...b, ...action.patch } : b) };
      case "REMOVE_UB":
        return { ...state, uniqueBuffs: state.uniqueBuffs.filter((b) => b.id !== action.id) };
      /* ---- Reorder generic list (move item up/down) ---- */
      case "REORDER_LIST": {
        const list = state[action.field];
        if (!Array.isArray(list)) return state;
        const i = list.findIndex((x) => (x.id || x.name || x.label) === action.key);
        if (i < 0) return state;
        const dir = action.dir;
        const j = i + dir;
        if (j < 0 || j >= list.length) return state;
        const copy = list.slice();
        [copy[i], copy[j]] = [copy[j], copy[i]];
        return { ...state, [action.field]: copy };
      }
      case "REORDER_DEFAULT_STATUS": {
        const list = (state.defaultStatuses || []).slice();
        const i = action.from, j = action.to;
        if (i < 0 || j < 0 || i >= list.length || j >= list.length) return state;
        const [item] = list.splice(i, 1);
        list.splice(j, 0, item);
        return { ...state, defaultStatuses: list };
      }
      /* v50: 汎用 index-based 並び替え (D&D 用) */
      case "MOVE_LIST_INDEX": {
        const list = state[action.field];
        if (!Array.isArray(list)) return state;
        const { from, to } = action;
        if (from < 0 || from >= list.length || to < 0 || to >= list.length) return state;
        const copy = list.slice();
        const [item] = copy.splice(from, 1);
        copy.splice(to, 0, item);
        return { ...state, [action.field]: copy };
      }
      /* ---- Custom persona/skill for user-created data ---- */
      case "EQUIP_CUSTOM_PERSONA": {
        return {
          ...state,
          personaMode: "custom",
          personaNo: `custom-${Date.now()}`,
          personaSrc: {
            name: action.name || "\u30AB\u30B9\u30BF\u30E0\u4EBA\u683C",
            no: 999,
            hp: 100,
            san: 45,
            speed: "1d5",
            res_slash: "\u666E\u901A",
            res_pierce: "\u666E\u901A",
            res_blunt: "\u666E\u901A",
            bullets: "\xD7",
            passive_name: "",
            passive_cond: "",
            passive_effect: "",
            skills: [],
            unique_buffs: [],
            keywords: [],
            __custom: true
          },
          hp: "100",
          san: "45",
          speed: "1d5",
          bullets: "\xD7",
          resS: "\u666E\u901A",
          resP: "\u666E\u901A",
          resB: "\u666E\u901A",
          pas: { name: "", cond: "", always: "", effect: "", quick: "" },
          skills: [],
          uniqueBuffs: [],
          charName: state.charName || action.name || "\u30AB\u30B9\u30BF\u30E0PC"
        };
      }
      /* ---- Spirit shortcut ---- */
      case "APPLY_SPIRIT": {
        const sp = action.spirit;
        return {
          ...state,
          spirit: sp.name || "",
          spiritMorale: sp.morale_effect || "",
          spiritConfuse: sp.confuse_effect || "",
          spiritAlways: sp.always_effect || ""
        };
      }
      default:
        return state;
    }
  }
  function useAppState() {
    const [state, dispatch] = React.useReducer(appReducer, INIT_STATE, (init) => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const saved = JSON.parse(raw);
          return { ...init, ...saved, ui: { ...init.ui, ...saved.ui || {} } };
        }
      } catch (e) {
      }
      return init;
    });
    const historyRef = React.useRef({ past: [], future: [] });
    const skipHistoryRef = React.useRef(false);
    React.useEffect(() => {
      const t = setTimeout(() => {
        try {
          const { ui, ...rest } = state;
          localStorage.setItem(STORAGE_KEY, JSON.stringify({
            ...rest,
            ui: {
              previewTab: ui.previewTab,
              currentSection: ui.currentSection,
              codexMode: ui.codexMode,
              codexExpanded: ui.codexExpanded,
              previewCollapsed: ui.previewCollapsed || {}
            }
          }));
        } catch (e) {
        }
      }, 400);
      return () => clearTimeout(t);
    }, [state]);
    const wrappedDispatch = React.useCallback((action) => {
      if (action.type !== "SET_UI" && !skipHistoryRef.current) {
        historyRef.current.past.push(state);
        if (historyRef.current.past.length > HISTORY_LIMIT) historyRef.current.past.shift();
        historyRef.current.future = [];
      }
      skipHistoryRef.current = false;
      dispatch(action);
    }, [state]);
    const undo = React.useCallback(() => {
      if (!historyRef.current.past.length) return;
      const prev = historyRef.current.past.pop();
      historyRef.current.future.unshift(state);
      skipHistoryRef.current = true;
      dispatch({ type: "HYDRATE", state: prev });
    }, [state]);
    const redo = React.useCallback(() => {
      if (!historyRef.current.future.length) return;
      const next = historyRef.current.future.shift();
      historyRef.current.past.push(state);
      skipHistoryRef.current = true;
      dispatch({ type: "HYDRATE", state: next });
    }, [state]);
    const canUndo = historyRef.current.past.length > 0;
    const canRedo = historyRef.current.future.length > 0;
    return [state, wrappedDispatch, { undo, redo, canUndo, canRedo }];
  }
  window.useAppState = useAppState;
  window.appReducer = appReducer;
  window.INIT_STATE = INIT_STATE;
})();
