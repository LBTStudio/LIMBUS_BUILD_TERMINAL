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
