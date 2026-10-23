import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";
import assert from "node:assert/strict";
import test from "node:test";

/* ---------------------------------------------------------------------------
   アカウント（=キャラクター単位の保存領域）分割の安全性を固定する。

   この機能の最優先仕様は「現行セーブデータを絶対に失さないこと」。
   したがってこのテストは機能の利便性より前に、以下を機械的に保証する:
     1. 初回移行は旧 lbt_v46_state をバックアップへ複製してから新形式を作る
     2. 旧キーは移行後も削除されず、内容も変わらない
     3. 移行は冪等（再実行でアカウントが増えない）
     4. 壊れた旧JSON・壊れたアカウントJSONも上書き前に別キーへ退避される
     5. CRUD（作成・切替・名前変更・削除）は最低1件を保証する
--------------------------------------------------------------------------- */

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stateSource = readFileSync(new URL("../js/state.js", import.meta.url), "utf8");
const sectionsSource = readFileSync(new URL("../js/OtherSections.js", import.meta.url), "utf8");

function createStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => { map.set(String(key), String(value)); },
    removeItem: (key) => { map.delete(String(key)); },
    clear: () => map.clear(),
    key: (index) => Array.from(map.keys())[index] ?? null,
    get length() { return map.size; },
    keys: () => Array.from(map.keys()),
    raw: map
  };
}

function loadAccounts(storage, overrides = {}) {
  const win = { localStorage: storage };
  if (Object.hasOwn(overrides, "crypto")) win.crypto = overrides.crypto;
  const context = {
    window: win, console, setTimeout, clearTimeout, Blob, URL,
    Date: overrides.Date || Date,
    Math: overrides.Math || Math
  };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(stateSource, context);
  return context.window.LBT_accounts;
}

const LEGACY_KEY = "lbt_v46_state";
const ACCOUNT_PREFIX = "lbt_account_";
const ACTIVE_KEY = "lbt_account_active";
const INDEX_KEY = "lbt_accounts_index";
const BACKUP_PREFIX = `${LEGACY_KEY}.backup.`;

function legacyStateJson() {
  return JSON.stringify({
    schemaVersion: 5,
    charName: "浮き輪のイセン",
    plName: "しゃけ",
    hp: "100",
    roster: { personas: [{ uid: "p1", no: 1, mode: "n" }], egos: [] },
    favorites: ["n:1"]
  });
}


test("アカウントIDが既存ID／孤立保存キーと衝突しても既存データを上書きしない", () => {
  const fixedNow = 1700000000000;
  class FixedDate extends Date { static now() { return fixedNow; } }
  const repeatedCrypto = {
    getRandomValues(bytes) { bytes.fill(7); return bytes; }
  };
  const suffix = "07".repeat(16);
  const collidingId = `acc-${fixedNow.toString(36)}-${suffix}-0`;

  /* 索引に登録済みのアカウントとの衝突 */
  const indexedStorage = createStorage({
    [INDEX_KEY]: JSON.stringify({ version: 1, accounts: [{ id: collidingId, name: "既存", purpose: "" }] }),
    [ACCOUNT_PREFIX + collidingId]: JSON.stringify({ schemaVersion: 5, charName: "既存キャラクター" })
  });
  const indexedAccounts = loadAccounts(indexedStorage, { Date: FixedDate, crypto: repeatedCrypto });
  const created = indexedAccounts.create("新規", "監査テスト");
  assert.ok(created, "再試行で別IDを確保する");
  assert.notEqual(created.id, collidingId);
  assert.equal(JSON.parse(indexedStorage.getItem(ACCOUNT_PREFIX + collidingId)).charName, "既存キャラクター");
  assert.equal(indexedAccounts.list().accounts.length, 2);

  /* 索引にない孤立キーでも、保存先が存在するIDを再利用しない */
  const orphanStorage = createStorage({
    [ACCOUNT_PREFIX + collidingId]: JSON.stringify({ schemaVersion: 5, charName: "孤立データ" })
  });
  const orphanAccounts = loadAccounts(orphanStorage, { Date: FixedDate, crypto: repeatedCrypto });
  const orphanCreate = orphanAccounts.create("新規アカウント", "");
  assert.ok(orphanCreate);
  assert.notEqual(orphanCreate.id, collidingId);
  assert.equal(JSON.parse(orphanStorage.getItem(ACCOUNT_PREFIX + collidingId)).charName, "孤立データ");
});

test("破損したアカウント索引に同じIDが複数あっても一つの保存領域として扱う", () => {
  const duplicateId = "acc-duplicate-key";
  const storage = createStorage({
    [INDEX_KEY]: JSON.stringify({ version: 1, accounts: [
      { id: duplicateId, name: "先行アカウント", purpose: "保存領域A" },
      { id: duplicateId, name: "重複表示", purpose: "別保存領域に見える" }
    ] }),
    [ACCOUNT_PREFIX + duplicateId]: JSON.stringify({ schemaVersion: 5, charName: "唯一の保存領域" })
  });
  const accounts = loadAccounts(storage);
  const listed = accounts.list().accounts;
  assert.equal(listed.length, 1);
  assert.equal(listed[0].name, "先行アカウント");
  assert.equal(accounts.loadActive().charName, "唯一の保存領域");
});

test("破損したアカウント索引から、個別キーに残っている複数の保存を復元する", () => {
  const firstId = "acc-recovery-first";
  const secondId = "acc-recovery-active";
  const corruptIndex = "{broken-json";
  const storage = createStorage({
    [INDEX_KEY]: corruptIndex,
    [ACCOUNT_PREFIX + firstId]: JSON.stringify({ schemaVersion: 5, charName: "復旧キャラクターA" }),
    [ACCOUNT_PREFIX + secondId]: JSON.stringify({ schemaVersion: 5, charName: "復旧キャラクターB" }),
    [ACTIVE_KEY]: secondId
  });
  const accounts = loadAccounts(storage);

  const listed = accounts.list();
  assert.equal(listed.accounts.length, 2, "index破損でアカウント本体を空扱いしない");
  assert.equal(Array.from(listed.accounts, (entry) => entry.id).sort().join("|"), [firstId, secondId].sort().join("|"));
  assert.equal(listed.activeId, secondId, "有効なアクティブIDを維持する");
  assert.equal(accounts.loadActive().charName, "復旧キャラクターB");
  assert.ok(storage.keys().some((key) => key.startsWith(INDEX_KEY + ".corrupt.")), "破損した索引の原文を退避する");
  const repaired = JSON.parse(storage.getItem(INDEX_KEY));
  assert.equal(repaired.accounts.length, 2, "復元した索引を再保存する");
});

test("空または不正な形の索引も、保存済みアカウントがあれば初回状態と誤認しない", () => {
  for (const brokenShape of [
    JSON.stringify({ version: 1, accounts: "not-an-array" }),
    JSON.stringify({ version: 1, accounts: [] })
  ]) {
    const firstId = "acc-recovery-shape-first";
    const secondId = "acc-recovery-shape-second";
    const storage = createStorage({
      [INDEX_KEY]: brokenShape,
      [ACCOUNT_PREFIX + firstId]: JSON.stringify({ schemaVersion: 5, charName: "形状復旧A" }),
      [ACCOUNT_PREFIX + secondId]: JSON.stringify({ schemaVersion: 5, charName: "形状復旧B" })
    });
    const accounts = loadAccounts(storage);
    const listed = accounts.list();
    assert.equal(listed.accounts.length, 2, "indexの形だけが壊れていても本体を復元する");
    assert.equal(accounts.loadActive().charName, "形状復旧A", "選択先がない場合は復旧一覧の先頭を開く");
    assert.equal(JSON.parse(storage.getItem(INDEX_KEY)).accounts.length, 2);
  }
});


test("索引配列の項目がすべて不正でも、保存本体からアカウントを復元する", () => {
  const id = "acc-invalid-index-entries";
  const rawIndex = JSON.stringify({ version: 1, accounts: [null, {}, { id: "" }] });
  const storage = createStorage({
    [INDEX_KEY]: rawIndex,
    [ACCOUNT_PREFIX + id]: JSON.stringify({ schemaVersion: 5, charName: "復元対象" }),
    [ACTIVE_KEY]: id
  });
  const accounts = loadAccounts(storage);
  const listed = accounts.list();

  assert.equal(listed.accounts.length, 1);
  assert.equal(listed.accounts[0].id, id);
  assert.equal(accounts.loadActive().charName, "復元対象");
  assert.equal(JSON.parse(storage.getItem(INDEX_KEY)).accounts.length, 1, "索引を安全に再構築する");
  assert.ok(storage.keys().some((key) => key.startsWith(INDEX_KEY + ".corrupt.")), "元の索引を退避する");
});


test("索引の一部だけ不正でも、索引に無い保存本体を含めて復元する", () => {
  const listedId = "acc-partial-index-listed";
  const hiddenId = "acc-partial-index-unlisted";
  const rawIndex = JSON.stringify({ version: 1, accounts: [
    { id: listedId, name: "索引にあるキャラクター", purpose: "" },
    null
  ] });
  const storage = createStorage({
    [INDEX_KEY]: rawIndex,
    [ACCOUNT_PREFIX + listedId]: JSON.stringify({ schemaVersion: 5, charName: "保存A" }),
    [ACCOUNT_PREFIX + hiddenId]: JSON.stringify({ schemaVersion: 5, charName: "保存B" }),
    [ACTIVE_KEY]: hiddenId
  });
  const accounts = loadAccounts(storage);
  const listed = accounts.list();

  assert.equal(listed.accounts.length, 2, "一部正常な索引だけで復旧完了と判断しない");
  assert.ok(listed.accounts.some((entry) => entry.id === listedId));
  assert.ok(listed.accounts.some((entry) => entry.id === hiddenId), "索引から欠落していた保存本体も戻す");
  assert.equal(listed.activeId, hiddenId, "現アカウントを優先して復元する");
  assert.equal(accounts.loadActive().charName, "保存B");
  assert.equal(JSON.parse(storage.getItem(INDEX_KEY)).accounts.length, 2, "索引も再構築する");
  assert.ok(storage.keys().some((key) => key.startsWith(INDEX_KEY + ".corrupt.")), "元の不正索引は保全する");
});

test("壊れた索引の退避に失敗した場合は、復旧書き込みでも原文を上書きしない", () => {
  const id = "acc-index-backup-failure";
  const rawIndex = "{broken-index";
  const storage = createStorage({
    [INDEX_KEY]: rawIndex,
    [ACCOUNT_PREFIX + id]: JSON.stringify({ schemaVersion: 5, charName: "保存本体は残る" }),
    [ACTIVE_KEY]: id
  });
  const normalSetItem = storage.setItem.bind(storage);
  storage.setItem = (key, value) => {
    if (key.startsWith(INDEX_KEY + ".corrupt.")) throw new Error("quota exceeded");
    return normalSetItem(key, value);
  };

  const accounts = loadAccounts(storage);
  assert.equal(accounts.list().accounts.length, 1, "本体はメモリ上で引き続き復旧可能");
  assert.equal(storage.getItem(INDEX_KEY), rawIndex, "退避できない索引は上書きしない");
  assert.equal(storage.keys().some((key) => key.startsWith(INDEX_KEY + ".corrupt.")), false);
  assert.equal(accounts.create("上書き禁止", ""), null, "新規作成経路からも壊れた索引を上書きしない");
  assert.equal(storage.getItem(INDEX_KEY), rawIndex);
  assert.equal(storage.getItem(ACCOUNT_PREFIX + id), JSON.stringify({ schemaVersion: 5, charName: "保存本体は残る" }));
});

test("索引キー自体が消えても残存する保存本体からアカウントを復元する", () => {
  const activeId = "acc-index-key-missing";
  const storage = createStorage({
    [ACCOUNT_PREFIX + activeId]: JSON.stringify({ schemaVersion: 5, charName: "索引なしのキャラクター" }),
    [ACTIVE_KEY]: activeId
  });
  const accounts = loadAccounts(storage);

  const listed = accounts.list();
  assert.equal(listed.accounts.length, 1, "索引不在を初回訪問と誤認しない");
  assert.equal(listed.accounts[0].id, activeId);
  assert.equal(listed.activeId, activeId);
  assert.equal(accounts.loadActive().charName, "索引なしのキャラクター");
  assert.equal(JSON.parse(storage.getItem(INDEX_KEY)).accounts.length, 1, "索引を再構築して保存する");
});

test("初回移行は旧データをバックアップへ複製し、旧キーを変更・削除しない", () => {
  const legacy = legacyStateJson();
  const storage = createStorage({ [LEGACY_KEY]: legacy });
  const accounts = loadAccounts(storage);

  const before = storage.getItem(LEGACY_KEY);
  const { accounts: list, activeId } = accounts.list();

  assert.equal(list.length, 1, "旧データから1アカウントが作られる");
  assert.equal(list[0].name, "浮き輪のイセン", "アカウント名はキャラクター名から採られる");
  assert.equal(storage.getItem(LEGACY_KEY), before, "旧キーの内容が変わらない");
  assert.ok(storage.keys().includes(LEGACY_KEY), "旧キーが削除されていない");
  const backups = storage.keys().filter((key) => key.startsWith(BACKUP_PREFIX));
  assert.equal(backups.length, 1, "タイムスタンプ付きバックアップが1件できる");
  assert.equal(storage.getItem(backups[0]), legacy, "バックアップが旧キーのバイト列そのもの");
  assert.equal(storage.getItem(ACTIVE_KEY), activeId, "作成アカウントがアクティブになる");
  assert.equal(storage.getItem(ACCOUNT_PREFIX + activeId), legacy, "アカウント本体に旧データがそのまま入る");
});

test("移行は冪等: 再実行してもアカウントもバックアップも増えない", () => {
  const storage = createStorage({ [LEGACY_KEY]: legacyStateJson() });
  const accounts = loadAccounts(storage);
  const first = accounts.list();
  const second = accounts.list();

  assert.equal(first.activeId, second.activeId);
  assert.equal(second.accounts.length, 1);
  assert.equal(storage.keys().filter((key) => key.startsWith(BACKUP_PREFIX)).length, 1);
});

test("アクセス時のゲートは保存領域が使えるときだけ出す", () => {
  const storage = createStorage();
  const accounts = loadAccounts(storage);
  assert.equal(accounts.storageAvailable(), true, "localStorage が使えればゲートを出す");

  const denied = new Proxy({}, { get() { throw new Error("denied"); } });
  const blocked = loadAccounts(denied);
  assert.equal(blocked.storageAvailable(), false, "使えない端末では素通し（入口を塞がない）");
});


test("別タブの旧セーブ移行が割り込んでも、両方の作成済み保存本体を索引に残す", () => {
  const storage = createStorage({ [LEGACY_KEY]: legacyStateJson() });
  const tabA = loadAccounts(storage);
  const tabB = loadAccounts(storage);
  let interleave = true;
  let migratedByTabB = null;
  const originalSetItem = storage.setItem.bind(storage);

  storage.setItem = (key, value) => {
    /* tab A がバックアップを書いた後、自分の本体を書く直前に tab B の初回移行を走らせる。
       B は先に索引を書き、A が古い空索引で上書きする状況を再現する。 */
    if (interleave && key.startsWith(ACCOUNT_PREFIX) && !key.includes(".corrupt.")) {
      interleave = false;
      migratedByTabB = tabB.list();
    }
    return originalSetItem(key, value);
  };

  const migratedByTabA = tabA.list();
  assert.ok(migratedByTabB);
  assert.equal(migratedByTabB.accounts.length, 1);
  assert.equal(migratedByTabA.accounts.length, 2, "後から終わったタブが先行移行の索引を消さない");
  const ids = new Set(migratedByTabA.accounts.map((entry) => entry.id));
  assert.ok(ids.has(migratedByTabB.activeId), "先に移行したアカウントを保持");
  assert.notEqual(migratedByTabA.activeId, migratedByTabB.activeId, "両タブは異なる保存本体を作った");
  for (const id of ids) {
    assert.ok(storage.getItem(ACCOUNT_PREFIX + id), "索引の各IDに保存本体がある");
  }
});

test("旧セーブを持つ人はゲートでアカウント1を選び、その保存領域が読める", () => {
  const legacy = legacyStateJson();
  const storage = createStorage({ [LEGACY_KEY]: legacy });
  const accounts = loadAccounts(storage);

  const { accounts: list } = accounts.list();
  assert.equal(list.length, 1, "1件だけ作られる（ゲートにこの1件が出る）");
  assert.equal(list[0].name, "浮き輪のイセン", "名前はキャラクター名から採られる");
  /* 利用者がゲートでこれを選ぶと、そのアカウントの保存領域が読める。 */
  assert.equal(accounts.switch(list[0].id), true);
  assert.equal(accounts.loadActive().charName, "浮き輪のイセン", "ビルドデータが読める");
  assert.equal(accounts.loadActive().hp, "100");
  assert.equal(storage.getItem(LEGACY_KEY), legacy, "旧キーは無傷");
});

test("旧データが無い初回訪問は0件のまま（ゲートで作成させる）", () => {
  const storage = createStorage();
  const accounts = loadAccounts(storage);
  const { accounts: list, activeId } = accounts.list();

  assert.equal(list.length, 0, "初回は自動採番しない");
  assert.equal(activeId, null);
  assert.equal(storage.getItem(INDEX_KEY), null, "索引も書かない");
  assert.equal(storage.keys().filter((key) => key.startsWith(BACKUP_PREFIX)).length, 0);
  assert.equal(accounts.loadActive(), null);
  assert.equal(accounts.saveActive({ charName: "x" }), false, "アカウントが無ければ保存できない");
});

test("壊れた旧JSONでも失わない: 退避して既定から始める", () => {
  const corrupt = "{charName: 壊れたJSON";
  const storage = createStorage({ [LEGACY_KEY]: corrupt });
  const accounts = loadAccounts(storage);
  const { accounts: list, activeId } = accounts.list();

  assert.equal(list.length, 1, "壊れていてもアカウントは作られる");
  assert.equal(storage.getItem(LEGACY_KEY), corrupt, "壊れた旧キーもそのまま残る");
  const backups = storage.keys().filter((key) => key.startsWith(BACKUP_PREFIX));
  assert.equal(backups.length, 1);
  assert.equal(storage.getItem(backups[0]), corrupt, "壊れた本文もバックアップへ残る");
  assert.equal(accounts.loadActive().schemaVersion, 5, "アカウントは既定状態から始まる");
  assert.ok(activeId);
});

test("壊れたアカウントJSONは上書き前に .corrupt. キーへ退避される", () => {
  const storage = createStorage({ [LEGACY_KEY]: legacyStateJson() });
  const accounts = loadAccounts(storage);
  const { activeId } = accounts.list();
  const corrupt = "not-json-at-all";
  storage.setItem(ACCOUNT_PREFIX + activeId, corrupt);

  const loaded = accounts.loadActive();
  assert.equal(loaded, null, "壊れたアカウントは読み込み失敗として扱う");
  const preserved = storage.keys().filter((key) => key.startsWith(`${ACCOUNT_PREFIX}${activeId}.corrupt.`));
  assert.equal(preserved.length, 1, "壊れた本文が退避されている");
  assert.equal(storage.getItem(preserved[0]), corrupt);

  assert.equal(accounts.saveActive({ charName: "復旧後" }), true, "退避後は上書きできる");
  assert.equal(accounts.loadActive().charName, "復旧後");
  assert.equal(storage.getItem(LEGACY_KEY), legacyStateJson(), "旧キーは最後まで無傷");
});


test("破損セーブの退避に失敗したら原本を上書きせず保存を拒否する", () => {
  const storage = createStorage({ [LEGACY_KEY]: legacyStateJson() });
  const accounts = loadAccounts(storage);
  const { activeId } = accounts.list();
  const key = ACCOUNT_PREFIX + activeId;
  const corrupt = "{壊れた保存データ";
  storage.setItem(key, corrupt);

  const normalSetItem = storage.setItem.bind(storage);
  storage.setItem = (target, value) => {
    if (target.startsWith(key + ".corrupt.")) throw new Error("quota exceeded");
    return normalSetItem(target, value);
  };

  assert.equal(accounts.saveActive({ charName: "復旧内容" }, activeId), false, "原本退避に失敗したため保存は拒否");
  assert.equal(storage.getItem(key), corrupt, "唯一の破損原本を上書きしない");
  assert.equal(storage.keys().some((target) => target.startsWith(key + ".corrupt.")), false, "失敗を成功扱いしない");
});


test("別タブでアカウント作成が割り込んでも、先に作成された索引項目を落とさない", () => {
  const storage = createStorage();
  const tabA = loadAccounts(storage);
  const existing = tabA.create("既存", "");
  assert.ok(existing);
  const tabB = loadAccounts(storage);

  let interleave = true;
  let createdByTabB = null;
  const originalSetItem = storage.setItem.bind(storage);
  storage.setItem = (key, value) => {
    originalSetItem(key, value);
    if (interleave && key.startsWith(ACCOUNT_PREFIX) && !key.includes(".corrupt.")) {
      interleave = false;
      createdByTabB = tabB.create("先に索引へ入るタブB", "");
    }
  };

  const createdByTabA = tabA.create("後から索引を書くタブA", "");
  assert.ok(createdByTabB && createdByTabA);
  const listed = tabA.list().accounts;
  assert.equal(listed.length, 3, "既存アカウントと両タブの新規アカウントを保持");
  assert.ok(listed.some((entry) => entry.id === createdByTabA.id));
  assert.ok(listed.some((entry) => entry.id === createdByTabB.id));
  assert.equal(JSON.parse(storage.getItem(ACCOUNT_PREFIX + createdByTabB.id)).schemaVersion, 5, "先に作った保存本体も残る");
});

test("アカウント名の更新中に別タブが作成された項目を索引から落とさない", () => {
  const storage = createStorage();
  const tabA = loadAccounts(storage);
  const target = tabA.create("変更対象", "");
  assert.ok(target);
  const tabB = loadAccounts(storage);

  let injected = false;
  let createdByTabB = null;
  const patch = {
    get name() {
      if (!injected) {
        injected = true;
        /* A が古い索引を読んだ後、索引を書き戻す前に B の作成を完了させる。 */
        createdByTabB = tabB.create("変更中に作成", "別タブ");
      }
      return "変更後の名前";
    },
    purpose: "変更テスト"
  };

  assert.equal(tabA.update(target.id, patch), true);
  assert.ok(createdByTabB);
  const listed = tabA.list().accounts;
  assert.equal(listed.length, 2, "更新側が古い索引を書き戻して B を落とさない");
  assert.equal(listed.find((entry) => entry.id === target.id).name, "変更後の名前");
  assert.ok(listed.some((entry) => entry.id === createdByTabB.id));
  assert.ok(storage.getItem(ACCOUNT_PREFIX + createdByTabB.id), "B の保存本体も残る");
});

test("作成・切替・名前変更・削除: 最低1件を保証し旧キーに触れない", () => {
  const storage = createStorage({ [LEGACY_KEY]: legacyStateJson() });
  const accounts = loadAccounts(storage);
  const first = accounts.list();

  const created = accounts.create("検証用2", "検証");
  assert.ok(created, "2つ目のアカウントが作れる");
  assert.equal(accounts.list().accounts.length, 2);

  assert.equal(accounts.switch(created.id), true);
  assert.equal(storage.getItem(ACTIVE_KEY), created.id);
  assert.equal(accounts.loadActive().schemaVersion, 5, "新規アカウントは空から始まる");

  assert.equal(accounts.update(created.id, { name: "配布用2", purpose: "配布" }), true);
  const renamed = accounts.list().accounts.find((entry) => entry.id === created.id);
  assert.equal(renamed.name, "配布用2");
  assert.equal(renamed.purpose, "配布");

  assert.equal(accounts.delete(created.id), true, "2つ目は削除できる");
  assert.equal(accounts.list().accounts.length, 1);
  assert.equal(storage.getItem(ACTIVE_KEY), first.activeId, "削除後は残った側へ戻る");
  assert.equal(storage.getItem(ACCOUNT_PREFIX + created.id), null, "削除アカウントの保存領域は除去");

  assert.equal(accounts.delete(first.activeId), false, "最後の1件は削除できない");
  assert.equal(accounts.list().accounts.length, 1);
  assert.equal(storage.getItem(LEGACY_KEY), legacyStateJson(), "どの操作でも旧キーは無傷");
});

test("状態保存中に別タブが作成したアカウントを索引から落とさない", () => {
  const storage = createStorage();
  const tabA = loadAccounts(storage);
  const saveTarget = tabA.create("保存対象", "");
  assert.ok(saveTarget);
  const tabB = loadAccounts(storage);

  let interleave = true;
  let createdByTabB = null;
  const originalSetItem = storage.setItem.bind(storage);
  storage.setItem = (key, value) => {
    originalSetItem(key, value);
    if (interleave && key === ACCOUNT_PREFIX + saveTarget.id) {
      interleave = false;
      /* A が保存本体を書いた直後、索引更新の前に B がアカウント作成を完了する。 */
      createdByTabB = tabB.create("保存中に作成", "別タブ");
    }
  };

  assert.equal(tabA.saveActive({ charName: "保存後の状態" }, saveTarget.id), true);
  assert.ok(createdByTabB);
  const listed = tabA.list().accounts;
  assert.equal(listed.length, 2, "保存側が古い索引を戻して B を落とさない");
  assert.ok(listed.some((entry) => entry.id === saveTarget.id));
  assert.ok(listed.some((entry) => entry.id === createdByTabB.id));
  assert.equal(JSON.parse(storage.getItem(ACCOUNT_PREFIX + saveTarget.id)).charName, "保存後の状態");
  assert.ok(storage.getItem(ACCOUNT_PREFIX + createdByTabB.id), "B の保存本体も残る");
});

test("切替直後の旧画面保存は起動時束縛IDへ書き、新アカウントへ混入しない", () => {
  const storage = createStorage({ [LEGACY_KEY]: legacyStateJson() });
  const accounts = loadAccounts(storage);
  const first = accounts.list();
  const second = accounts.create("急いで作った2", "");
  accounts.switch(second.id);

  /* 切替後も旧画面の保存効果が発火した状況: 束縛ID（first）を渡して書く。 */
  assert.equal(accounts.saveActive({ charName: "旧画面の追い書き" }, first.activeId), true);
  assert.equal(JSON.parse(storage.getItem(ACCOUNT_PREFIX + second.id)).charName, undefined, "切替先へは書かれない");
  assert.equal(JSON.parse(storage.getItem(ACCOUNT_PREFIX + first.activeId)).charName, "旧画面の追い書き");

  /* 束縛IDを渡さない呼び出しは現在のアクティブ（second）へ書く。 */
  assert.equal(accounts.saveActive({ charName: "新画面の保存" }), true);
  assert.equal(JSON.parse(storage.getItem(ACCOUNT_PREFIX + second.id)).charName, "新画面の保存");
  assert.equal(storage.getItem(LEGACY_KEY), legacyStateJson());
});

test("削除済みアカウントIDへの保存は拒否し、キーを蘇生させない", () => {
  const storage = createStorage();
  const accounts = loadAccounts(storage);
  const first = accounts.create("現役", "");
  const second = accounts.create("消える予定", "");
  assert.equal(accounts.delete(second.id), true);

  assert.equal(accounts.saveActive({ charName: "蘇生" }, second.id), false, "索引に無いIDへは書けない");
  assert.equal(storage.getItem(ACCOUNT_PREFIX + second.id), null, "削除済みキーが復活しない");
  assert.equal(accounts.saveActive({ charName: "現役へは書ける" }, first.id), true);
});


test("アカウント本体の削除に失敗したら成功扱いせず、索引とアクティブ選択を戻す", () => {
  const storage = createStorage();
  const accounts = loadAccounts(storage);
  const first = accounts.create("残すキャラクター", "");
  const second = accounts.create("削除失敗テスト", "");
  assert.ok(first && second);
  assert.equal(accounts.switch(second.id), true);

  const storageKey = ACCOUNT_PREFIX + second.id;
  const originalSave = storage.getItem(storageKey);
  const normalRemoveItem = storage.removeItem.bind(storage);
  storage.removeItem = (key) => {
    if (key === storageKey) throw new Error("storage removal failed");
    return normalRemoveItem(key);
  };

  assert.equal(accounts.delete(second.id), false, "保存本体を消せなければ削除失敗を返す");
  assert.equal(storage.getItem(storageKey), originalSave, "保存本体はそのまま残る");
  assert.equal(accounts.list().accounts.length, 2, "索引にアカウントを戻す");
  assert.ok(accounts.list().accounts.some((entry) => entry.id === second.id));
  assert.equal(storage.getItem(ACTIVE_KEY), second.id, "削除が失敗したため元の選択を維持");
});


test("完全リセットは旧タブの遅延保存を無効化し、新しいタブの保存は許可する", () => {
  const storage = createStorage({ [LEGACY_KEY]: legacyStateJson() });
  const oldTab = loadAccounts(storage);
  const activeId = oldTab.getActiveId();
  assert.ok(activeId);
  assert.equal(oldTab.saveActive({ charName: "リセット前の状態" }, activeId), true);

  const resettingTab = loadAccounts(storage);
  assert.equal(resettingTab.getActiveId(), activeId);
  assert.equal(resettingTab.resetActive(), true);
  assert.equal(JSON.parse(storage.getItem(ACCOUNT_PREFIX + activeId)).charName, undefined, "リセット後の保存本体は空");
  assert.equal(oldTab.resetActive(), false, "古いタブから後続のリセットも実行できない");

  assert.equal(oldTab.saveActive({ charName: "古いタブからの遅延保存" }, activeId), false, "古い世代からは保存できない");
  assert.equal(JSON.parse(storage.getItem(ACCOUNT_PREFIX + activeId)).charName, undefined, "空状態が復活書き込みで上書きされない");

  const newTab = loadAccounts(storage);
  assert.equal(newTab.getActiveId(), activeId);
  assert.equal(newTab.saveActive({ charName: "リセット後の新しい状態" }, activeId), true, "新しい世代では保存できる");
  assert.equal(newTab.loadActive().charName, "リセット後の新しい状態");
});

test("resetActive は現アカウントだけ既定へ戻し、旧キーと他データはそのまま", () => {  const storage = createStorage({ [LEGACY_KEY]: legacyStateJson() });
  const accounts = loadAccounts(storage);
  const { activeId } = accounts.list();
  accounts.saveActive({ charName: "書き込んだ" });

  assert.equal(accounts.resetActive(), true);
  assert.equal(accounts.loadActive().charName, undefined, "現アカウントは既定へ戻る");
  assert.equal(storage.getItem(LEGACY_KEY), legacyStateJson());
  assert.ok(storage.keys().some((key) => key.startsWith(BACKUP_PREFIX)), "初回バックアップも残る");
  assert.ok(activeId);
});

/* ---- アイコン（ユーザーアップロード画像） ---- */

function iconDataUri(bytes = 512) {
  return "data:image/webp;base64," + "A".repeat(Math.ceil(bytes / 3) * 4);
}

test("アイコンは索引と別キーに保存され、往復できる", () => {
  const storage = createStorage();
  const accounts = loadAccounts(storage);
  const created = accounts.create("アイコン軍", "本番");
  const icon = iconDataUri(1024);

  assert.equal(accounts.setIcon(created.id, icon), true);
  const icons = accounts.icons();
  assert.equal(Object.keys(icons).length, 1, "icons() で読み出せる");
  assert.equal(icons[created.id], icon);
  assert.equal(storage.getItem("lbt_accounts_icons"), JSON.stringify({ [created.id]: icon }), "アイコン専用キーに保存");
  assert.equal(accounts.removeIcon(created.id), true);
  assert.equal(Object.keys(accounts.icons()).length, 0, "解除で空に戻る");
});

test("アイコンは圧縮済みdataURIのみ受け付け、上限超過と他形式を拒否する", () => {
  const storage = createStorage();
  const accounts = loadAccounts(storage);
  const created = accounts.create("検証", "");

  assert.equal(accounts.setIcon(created.id, "https://example.com/a.png"), false, "外部URLは拒否");
  assert.equal(accounts.setIcon(created.id, "data:image/png;base64,AAAA"), false, "PNG(dataURI)は拒否（非圧縮形式）");
  assert.equal(accounts.setIcon(created.id, iconDataUri(64 * 1024)), false, "24KB超過は拒否");
  assert.equal(accounts.setIcon(created.id, "not-a-data-uri"), false, "不正形式は拒否");
  assert.equal(accounts.setIcon("acc-ghost", iconDataUri(512)), false, "存在しないアカウントIDは拒否");
  assert.equal(Object.keys(accounts.icons()).length, 0, "一つも保存されていない");
});

test("壊れたアイコンブロブは丸ごと無視して描画を壊さない", () => {
  const storage = createStorage();
  const accounts = loadAccounts(storage);
  const created = accounts.create("壊れ試験", "");
  storage.setItem("lbt_accounts_icons", "{壊れたJSON");

  assert.equal(Object.keys(accounts.icons()).length, 0, "壊れていてもエラーにせず空扱い");
  assert.ok(storage.keys().some((key) => key.startsWith("lbt_accounts_icons.corrupt.")), "壊れた本文は退避される");

  /* 不正な値が混入していても、正しい値だけを拾う。 */
  storage.setItem("lbt_accounts_icons", JSON.stringify({ [created.id]: iconDataUri(512), bad: "https://x/y.png" }));
  assert.deepEqual(Object.keys(accounts.icons()), [created.id], "不正な値は間引く");
});

test("アカウント削除時にそのアイコンも解放される（孤立データを残さない）", () => {
  const storage = createStorage();
  const accounts = loadAccounts(storage);
  const first = accounts.create("本体", "");
  const second = accounts.create("消えるキャラ", "");
  accounts.setIcon(second.id, iconDataUri(1024));

  assert.equal(accounts.delete(second.id), true);
  const icons = accounts.icons();
  assert.equal(Object.hasOwn(icons, second.id), false, "削除アカウントのアイコンは残らない");
  assert.equal(storage.getItem(ACCOUNT_PREFIX + second.id), null, "保存領域も消える");
  assert.equal(accounts.saveActive({ charName: "退避後" }, first.id), true, "他アカウントの保存は続く");
});

test("完全削除は有効な保存値を .corrupt に複製せず、現アカウントの破損退避だけを消す", () => {
  const legacy = legacyStateJson();
  const storage = createStorage({ [LEGACY_KEY]: legacy });
  const accounts = loadAccounts(storage);
  const { activeId } = accounts.list();
  accounts.saveActive({ charName: "削除対象のキャラクター" });
  const key = ACCOUNT_PREFIX + activeId;
  storage.setItem(`${key}.corrupt.older`, JSON.stringify({ charName: "以前の破損退避" }));
  storage.setItem("lbt_account_other.corrupt.older", JSON.stringify({ charName: "別アカウントの退避" }));

  assert.equal(accounts.resetActive(), true);
  assert.equal(accounts.loadActive().charName, undefined, "現アカウントの保存状態をリセットする");
  assert.equal(storage.keys().some((k) => k.startsWith(`${key}.corrupt.`)), false, "現アカウントの破損退避は残さない");
  assert.equal(storage.getItem("lbt_account_other.corrupt.older"), JSON.stringify({ charName: "別アカウントの退避" }), "他アカウントの退避は保護");
  assert.equal(storage.getItem(LEGACY_KEY), legacy, "旧形式の原本は契約どおり保持");
});


test("破損退避の削除に失敗したら、現アカウントの保存本体はリセットしない", () => {
  const storage = createStorage({ [LEGACY_KEY]: legacyStateJson() });
  const accounts = loadAccounts(storage);
  const { activeId } = accounts.list();
  accounts.saveActive({ charName: "削除失敗時も保持する" });
  const key = ACCOUNT_PREFIX + activeId;
  const firstBackup = `${key}.corrupt.first`;
  const failingBackup = `${key}.corrupt.fail`;
  storage.setItem(firstBackup, "first recovery copy");
  storage.setItem(failingBackup, "second recovery copy");
  const normalRemoveItem = storage.removeItem.bind(storage);
  storage.removeItem = (candidate) => {
    if (candidate === failingBackup) throw new Error("remove failed");
    return normalRemoveItem(candidate);
  };

  assert.equal(accounts.resetActive(), false, "退避の掃除に失敗したら操作全体を失敗として返す");
  assert.equal(accounts.loadActive().charName, "削除失敗時も保持する", "本体データを空にしない");
  assert.equal(storage.getItem(firstBackup), "first recovery copy", "先に削除できた退避も戻す");
  assert.equal(storage.getItem(failingBackup), "second recovery copy", "削除失敗した退避は保持");
});

test("resetActive は保存領域だけ空にし、アカウント名・アイコンは保持する", () => {
  const storage = createStorage();
  const accounts = loadAccounts(storage);
  const created = accounts.create("初期キャラ", "");
  const icon = iconDataUri(768);
  accounts.setIcon(created.id, icon);
  accounts.saveActive({ charName: "消えるデータ" });

  assert.equal(accounts.resetActive(), true);
  assert.equal(accounts.loadActive().charName, void 0, "state は空");
  assert.equal(accounts.icons()[created.id], icon, "アイコンは保持");
  assert.equal(accounts.list().accounts[0].name, "初期キャラ", "アカウント自体も保持");
});

test("localStorage が使えない環境では安全に失敗し、何も書かない", () => {  /* プライベートモード等では localStorage プロパティへのアクセス自体が例外になる。 */
  const denied = new Proxy({}, { get() { throw new Error("denied"); } });
  const accounts = loadAccounts(denied);
  const listed = accounts.list();
  assert.equal(listed.accounts.length, 0);
  assert.equal(listed.activeId, null);
  assert.equal(accounts.saveActive({ a: 1 }), false);
  assert.equal(accounts.loadActive(), null);
});

/* ---- 静的保証: 旧キーを破壊する経路がコード上に存在しない ---- */

test("旧保存キーを削除するコード経路は存在しない", () => {
  assert.doesNotMatch(stateSource, /removeItem\(\s*STORAGE_KEY\s*\)/, "state.js が旧キーを削除しない");
  assert.doesNotMatch(sectionsSource, /removeItem\(/, "設定UI が localStorage を直接操作しない");
  assert.match(stateSource, /LEGACY_BACKUP_PREFIX = `\$\{STORAGE_KEY\}\.backup\.`/, "バックアップキーが旧キー由来と分かる形で定義されている");
  assert.match(sectionsSource, /window\.LBT_accounts\?\.resetActive\?\.\(\)/, "完全削除は現アカウントのみを対象とする");
});

test("useAppState は旧キーでなくアクティブアカウントを読み書きする", () => {
  assert.match(stateSource, /window\.LBT_accounts\?\.loadActive\?\.\(\)/);
  assert.match(stateSource, /window\.LBT_accounts\?\.saveActive\?\.\(\{/, "保存は saveActive 経由");
  assert.match(stateSource, /__LBT_BOOT_ACCOUNT_ID/, "保存は起動時のアカウントIDへ束縛される");
  assert.match(stateSource, /getActiveId: getActiveAccountId/);
  assert.doesNotMatch(stateSource, /localStorage\.getItem\(STORAGE_KEY\)/, "旧キーの直接読み込みが残っていない");
  assert.doesNotMatch(stateSource, /localStorage\.setItem\(STORAGE_KEY/, "旧キーの直接書き込みが残っていない");
});
