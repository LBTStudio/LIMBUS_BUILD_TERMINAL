/* ブラウザー向けに書かれたLBTの本体コードを、Node上で実行するための足場。

   js/generator.js と js/state.js は `window` へ関数を公開する前提で書かれている。
   監査と回帰テストでは、実際の出力経路（人格の装備 → チャットパレット・メモ・JSON生成）
   をそのまま動かして検証したいので、最小限のブラウザー相当環境を用意して読み込む。

   使い方:
     import { loadRuntime, equipPersona, collectDbTexts } from "./pipeline-harness.mjs";
     const rt = loadRuntime();
     const state = equipPersona(rt, "t", persona);
     rt.gen.buildPalette(state); */
import { readFileSync } from "node:fs";
import vm from "node:vm";

const root = new URL("../../", import.meta.url);

/* Reactは人格の装備処理（state.js）が読み込み時に参照するだけで、
   出力生成そのものには関与しない。呼ばれても副作用のない最小の代替を渡す。 */
const REACT_STUB = {
  useState: () => [null, () => {}],
  useMemo: (factory) => factory(),
  useCallback: (fn) => fn,
  useRef: () => ({ current: null }),
  useEffect: () => {},
  useReducer: () => [null, () => {}],
  createElement: () => null,
  Fragment: "Fragment"
};

export function loadRuntime() {
  const context = {
    console, setTimeout, clearTimeout, Blob, URL, TextEncoder, TextDecoder,
    window: {}, document: void 0,
    React: REACT_STUB,
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} }
  };
  context.globalThis = context;
  context.self = context;
  vm.createContext(context);

  const db = JSON.parse(readFileSync(new URL("data/db.json", root), "utf8"));
  context.DB = db;
  context.window.DB = db;
  for (const file of ["js/generator.js", "js/state.js"]) {
    vm.runInContext(readFileSync(new URL(file, root), "utf8"), context, { filename: file });
  }
  return {
    context,
    db,
    gen: context.window.LBT_gen,
    reducer: context.window.appReducer,
    initialState: context.window.INIT_STATE,
    splitEffectLinesPlain: (text) => toHostValue(context.window.splitEffectLinesPlain(text)),
    formatEffectLines: context.window.formatEffectLines,
    timingMarkerWords: toHostValue(context.window.LBT_TIMING_MARKER_WORDS)
  };
}

/* vm のコンテキストは独自の Array・Object を持つため、そこで作られた配列は
   呼び出し側の `Array.prototype` を継承しない。
   値としては等しくても `assert.deepEqual` は「参照が等しくない」として失敗する。
   検証で扱いやすいよう、コンテキスト境界を越える値は呼び出し側の型へ作り直す。 */
function toHostValue(value) {
  if (value == null || typeof value !== "object") return value;
  if (typeof value.length === "number" && typeof value !== "function") {
    return Array.from(value, toHostValue);
  }
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toHostValue(item)]));
}

/* 実際のUIと同じ経路で人格を装備した状態を作る。
   出力生成の検証は、この state を各 build* 関数へ渡して行う。 */
export function equipPersona(runtime, mode, persona) {
  return runtime.reducer(runtime.initialState, {
    type: "EQUIP_PERSONA",
    mode,
    no: persona.no,
    src: JSON.parse(JSON.stringify(persona))
  });
}

/* DBに含まれる自由文を、出典つきの項目パスで列挙する。
   人格・E.G.O・サポートパッシブ・精神・強化・死亡時パッシブのすべてを対象にする。 */
export function collectDbTexts(db) {
  const rows = [];
  const push = (path, text) => {
    if (typeof text === "string" && text.trim()) rows.push({ path, text });
  };

  const walkPersona = (kind, persona) => {
    const base = `${kind}/${persona?.name}`;
    push(`${base}/passive_effect`, persona?.passive_effect);
    push(`${base}/passive_always`, persona?.passive_always);
    (persona?.unique_buffs || []).forEach((buff) => push(`${base}/固有バフ「${buff?.name || ""}」`, buff?.desc));
    (persona?.skills || []).forEach((skill) => {
      const head = `${base}/${skill?.rank || "スキル"}「${skill?.name || ""}」`;
      push(`${head}/効果`, skill?.effect);
      (skill?.dice || []).forEach((dice, i) => push(`${head}/ダイス${i + 1}`, dice?.effect));
    });
  };
  (db.normal_personas || []).forEach((p) => walkPersona("通常", p));
  (db.tokui_personas || []).forEach((p) => walkPersona("特異", p));

  (db.egos || []).forEach((ego) => {
    const base = `E.G.O/${ego?.name}`;
    push(`${base}/passive_effect`, ego?.passive_effect);
    push(`${base}/unique_buff`, ego?.unique_buff);
    ["kakusei", "shinshoku"].forEach((field) => {
      const skill = ego?.[field];
      if (!skill) return;
      push(`${base}/${field}/効果`, skill.effect);
      (skill.dice || []).forEach((dice, i) => push(`${base}/${field}/ダイス${i + 1}`, dice?.effect));
    });
    (ego?.sub_skills || []).forEach((skill, si) => {
      push(`${base}/同化${si + 1}「${skill?.name || ""}」/効果`, skill?.effect);
      (skill?.dice || []).forEach((dice, i) => push(`${base}/同化${si + 1}/ダイス${i + 1}`, dice?.effect));
    });
  });

  ["support_passives", "special_enhancements", "spirits", "normal_enhancements", "death_passives"].forEach((section) => {
    (db[section] || []).forEach((entry) => {
      Object.entries(entry || {}).forEach(([field, value]) => push(`${section}/${entry?.name}/${field}`, value));
    });
  });

  return rows;
}
