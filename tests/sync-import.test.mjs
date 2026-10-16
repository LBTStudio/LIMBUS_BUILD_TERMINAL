import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

/* ---------------------------------------------------------------------------
   同期化・解析は、所持の獲得とは別の費用記録として計上する。

   実データでは操作行80本のうち76本（95%）が CT 進行で、CT 以外に
   対象が取れたのは3行だった。それでも機構は動く必要があるので、
   名前で指定した操作が uid 解決まで通して立つことを固定する。
   --------------------------------------------------------------------------- */

const db = JSON.parse(readFileSync(new URL("../data/db.json", import.meta.url), "utf8"));

function load(files) {
  const w = { DB: db, console, URL, TextEncoder, TextDecoder, setTimeout, clearTimeout, module: { exports: {} } };
  const c = { window: w, console, URL, TextEncoder, TextDecoder, setTimeout, clearTimeout, module: { exports: {} } };
  c.globalThis = c;
  vm.createContext(c);
  for (const f of files) {
    vm.runInContext(readFileSync(new URL("../" + f, import.meta.url), "utf8"), c, { filename: f });
  }
  return c.window;
}

/* --- 対象の抽出 ------------------------------------------------------- */

test("操作的目标は名前として取り出される（以前は常に未定だった）", () => {
  const w = load(["js/ledger-provenance.js"]);
  const found = w.LBT_annotateOperations(["欠片50を消費して同期化「θ剣契殺手A」"], db);
  assert.equal(found.length, 1);
  assert.equal(found[0].hasTarget, true, "対象がある");
  assert.equal(found[0].target, "剣契殺手A", "θ は記号なので落とす");
  assert.equal(found[0].operation, "sync");
});

test("CTの進行は対象を求めない（費用も操作も出ない）", () => {
  const w = load(["js/ledger-provenance.js"]);
  for (const line of [
    "同期化剣契人格を使用したのでCTここから",
    "同期化魔弾CT解除。",
    "ピークォド同期を使用したのでCT3ここから。"
  ]) {
    const [op] = w.LBT_annotateOperations([line], db);
    assert.equal(op.hasTarget, false, line + " は対象を持たない");
  }
});

test("括弧書きが操作語より前にあるときは対象ではない", () => {
  const w = load(["js/ledger-provenance.js"]);
  const [op] = w.LBT_annotateOperations([
    'アイテム「硝子の破片」を購入したのでLP-20、使用して同期化剣契人格CT解除'
  ], db);
  assert.equal(op.hasTarget, false, "括弧は物資名なので同期の対象ではない");
});

test("操作語の前に出る名前で対象を取り出せる", () => {
  const w = load(["js/ledger-provenance.js"]);
  const [op] = w.LBT_annotateOperations(["鬼門同期"], db);
  assert.equal(op.hasTarget, true);
  assert.equal(op.target, "鬼門");
});

test("解析は E.G.O の解析として読む", () => {
  const w = load(["js/ledger-provenance.js"]);
  const [op] = w.LBT_annotateOperations(["欠片20を消費して解析「提灯」"], db);
  assert.equal(op.operation, "analyze");
  assert.equal(op.target, "提灯");
});

/* --- uid 解決（APPLY_IMPORT_BATCH） ------------------------------------ */

function loadReducer() {
  const w = {
    DB: {
      support_passives: db.support_passives,
      death_passives: db.death_passives,
      spirits: db.spirits,
      normal_personas: db.normal_personas,
      tokui_personas: db.tokui_personas,
      egos: db.egos
    },
    LBT_PDF_KEYWORD_ORDER: []
  };
  const c = { window: w, console, module: { exports: {} } };
  c.globalThis = c;
  vm.createContext(c);
  for (const f of ["js/ledger-provenance.js", "js/roster-resolver.js", "js/state.js"]) {
    vm.runInContext(readFileSync(new URL("../" + f, import.meta.url), "utf8"), c, { filename: f });
  }
  return c.window;
}

const PERSONA = db.normal_personas[0];
const w2 = loadReducer();

test("名前で同期化を指定すると uid を解決して同期と費用が立つ", () => {
  const before = {
    roster: { personas: [], egos: [], supports: [], spirits: [] },
    results: [{ id: "res-1", name: "第一夜", income: { lp: "500", shards: "0" } }],
    entries: [], inventory: []
  };
  const next = w2.appReducer(before, {
    type: "APPLY_IMPORT_BATCH",
    actions: [
      { type: "ADD_ROSTER", mode: "n", no: PERSONA.no, source: "given" },
      { type: "APPLY_PERSONA_SYNC", personaName: PERSONA.name, syncMax: false, synced: true }
    ]
  });
  assert.equal(next.roster.personas.length, 1, "人格は入る");
  assert.equal(next.roster.personas[0].synced, true, "同期が立っている（段階は不明でもよい）");
  const sync = next.entries.find((e) => e.kind === "personaSync" || e.kind === "personaSyncMax");
  assert.ok(sync, "同期の明細が立つ");
  assert.ok(Number(sync.cost.shards) > 0, "自己の欠片で支払う");
  assert.equal(sync.name.includes(PERSONA.name), true, "明細に名前が残る");
});

test("名前で引けない同期化は黙って捨てられる（他的人格へ当てない）", () => {
  const before = {
    roster: { personas: [], egos: [], supports: [], spirits: [] },
    results: [{ id: "res-1", name: "第一夜", income: { lp: "500", shards: "0" } }],
    entries: [], inventory: []
  };
  const next = w2.appReducer(before, {
    type: "APPLY_IMPORT_BATCH",
    actions: [
      { type: "ADD_ROSTER", mode: "n", no: PERSONA.no, source: "given" },
      { type: "APPLY_PERSONA_SYNC", personaName: "まったく無い名前", syncMax: false }
    ]
  });
  assert.equal(next.entries.filter((e) => e.kind === "personaSync").length, 0, "同期の明細は出ない");
});

test("同期化は1回しか課帳されない（重ねても二重に引かない）", () => {
  const before = {
    roster: { personas: [], egos: [], supports: [], spirits: [] },
    results: [{ id: "res-1", name: "第一夜", income: { lp: "500", shards: "0" } }],
    entries: [], inventory: []
  };
  const next = w2.appReducer(before, {
    type: "APPLY_IMPORT_BATCH",
    actions: [
      { type: "ADD_ROSTER", mode: "n", no: PERSONA.no, source: "given" },
      { type: "APPLY_PERSONA_SYNC", personaName: PERSONA.name, syncMax: false, synced: true },
      { type: "APPLY_PERSONA_SYNC", personaName: PERSONA.name, syncMax: false, synced: true }
    ]
  });
  assert.equal(next.entries.filter((e) => e.kind === "personaSync").length, 1, "1件だけ");
});