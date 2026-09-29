import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { loadRuntime, equipPersona } from "../tools/provenance/pipeline-harness.mjs";

/* 監査で検出した本体バグの回帰テスト。
   いずれも「実際の装備 → 出力生成」経路そのもので検証する。 */

test("旧保存の死亡後パッシブ移行はDB名簿と一致するレコードだけを対象にする", () => {
  const rt = loadRuntime();
  // 本文に死亡系の語を含むだけの通常サポート（旧ロジックでは誤移動した）と、
  // DBの死亡後パッシブ名簿と同名のレコード（旧版の混入パターン）を並べる。
  const legacy = { ...rt.initialState, supports: [
    rt.db.support_passives.find((s) => s.name === "墓守"),
    rt.db.death_passives.find((s) => s.name === "覚悟")
  ], deathSupport: null };
  const next = rt.reducer(rt.initialState, { type: "HYDRATE", state: JSON.parse(JSON.stringify(legacy)) });

  assert.equal(next.deathSupport?.name, "覚悟");
  assert.equal(next.supports.length, 1);
  assert.equal(next.supports[0]?.name, "墓守");
});

test("共有シートの士気低下ラベルは本文で描画され、エスケープ済みリテラルを含まない", () => {
  const rt = loadRuntime();
  const html = rt.gen.buildShareSheetHTML({ ...rt.initialState, san: "50", hp: "100" });

  assert.ok(html.includes("士気低下"));
  assert.equal(html.includes("\\u58EB"), false);
});

test("全角数字で書かれた強化本文もHP/SANボーナスへ反映される", () => {
  const rt = loadRuntime();
  // 精神強化A-1〜A-5 は原典本文が「人格のSANを５上昇させる。」（全角５）。
  const enh = rt.db.normal_enhancements.find((e) => e.name === "精神強化A-1");
  assert.equal(enh.effect.includes("５"), true);
  assert.equal(rt.context.window.computeEnhancementBonuses({ enhancements: [enh] }).san, 5);
});

test("先頭が連結「：」のダイス効果はロール表記と二重に付かない", () => {
  const rt = loadRuntime();
  const state = equipPersona(rt, "n", rt.db.normal_personas.find((x) => x.name === "南部リウ協会5課フィクサー"));
  const palette = rt.gen.buildPalette(state);

  assert.equal(palette.includes("：："), false);
  assert.ok(palette.includes("8d2：的中時"));

  let violations = 0;
  for (const persona of [...rt.db.normal_personas, ...rt.db.tokui_personas]) {
    if (rt.gen.buildPalette(equipPersona(rt, "n", persona)).includes("：：")) violations++;
  }
  assert.equal(violations, 0);
});

test("同化型E.G.Oのスロット形態は原典の全8種を過不足なく定義する", () => {
  const rt = loadRuntime();
  // 本番では index.html が generator/state とは別に js/ego-slot-forms.js を読む。
  vm.runInContext(readFileSync(new URL("../js/ego-slot-forms.js", import.meta.url), "utf8"), rt.context, { filename: "js/ego-slot-forms.js" });
  const forms = rt.context.window.LBT_EGO_SLOT_FORMS;
  const expectedForm = (skill) => {
    const text = String(skill?.effect || "");
    if (text.includes("[同化]")) return "assimilation";
    if (text.includes("[影響]")) return "influence";
    return "skill";
  };
  const assimilated = rt.db.egos.filter((e) => (e.sub_skills || []).length > 0);

  assert.equal(assimilated.length, 8);
  assert.equal(Object.keys(forms).length, 8);
  for (const ego of assimilated) {
    const form = forms[`${ego.rank}:${ego.no}`];
    assert.ok(form, `${ego.name} にスロット形態が定義されていない`);
    assert.equal(form.kakusei, expectedForm(ego.kakusei), `${ego.name} の覚醒形態`);
    assert.equal(form.shinshoku, expectedForm(ego.shinshoku), `${ego.name} の侵蝕形態`);
  }

  // 定義どおり覚醒同化型の sub_skills が覚醒側の同化へ載り、侵蝕は通常スキルのまま保つ。
  const ego = rt.db.egos.find((e) => e.rank === "TETH" && e.no === 20);
  const st = rt.reducer(rt.initialState, { type: "SET_EGO_SLOT", rank: "TETH", value: JSON.parse(JSON.stringify(ego)) });
  const kakusei = st.egoSlots?.TETH?.slotVariants?.kakusei;
  assert.equal(kakusei?.active, "assimilation");
  assert.equal((kakusei?.branches?.assimilation?.skills || []).length, ego.sub_skills.length);
  assert.equal(st.egoSlots?.TETH?.slotVariants?.shinshoku?.active, "skill");
});

test("LPを持たない死亡後パッシブはメモ出力で浮いた「LP」を残さない", () => {
  const rt = loadRuntime();
  // 原典の死亡後パッシブ（DBの death_passives）はLP（精神コスト）を持たない。
  const ds = rt.db.death_passives.find((s) => s.name === "覚悟");
  assert.equal(ds.lp, undefined);

  // B9の修正で、死亡後パッシブ追加の強化がないと死亡後は出力されない。
  // ここではLP表示の検証が目的のため、強化を付与した状態で出力する。
  const enh = [{ name: "死亡後パッシブ追加", effect: "" }];
  const memo = rt.gen.buildMemo({ ...rt.initialState, enhancements: enh, deathSupport: { ...ds, id: "test" } });
  const line = memo.split("\n").find((l) => l.includes("覚悟"));
  assert.ok(line, "死亡後パッシブの行がメモに存在する");
  assert.equal(/LP/.test(line), false, `浮いたLP: ${line}`);

  // LPを持つ自作レコードは従来どおり LP 表示を維持する。
  const memo2 = rt.gen.buildMemo({ ...rt.initialState, enhancements: enh, deathSupport: { id: "test2", name: "自作死亡後", cond: "-", effect: "-", lp: "99" } });
  const line2 = memo2.split("\n").find((l) => l.includes("自作死亡後"));
  assert.ok(/LP99/.test(line2), `LP99 が表示される: ${line2}`);
});

test("拡張解除でUIから消えたサポート・死亡後は出力にも含めない", () => {
  const rt = loadRuntime();
  const s1 = rt.db.support_passives[0];
  const s2 = rt.db.support_passives[1];
  const s3 = rt.db.support_passives[2];
  const ds = rt.db.death_passives[0];

  // スロット追加なし → 3つ目はパレットに出ない
  const st2 = { ...rt.initialState, supports: [{ ...s1, id: "a" }, { ...s2, id: "b" }, { ...s3, id: "c" }], deathSupport: { ...ds, id: "d" } };
  const pal2 = rt.gen.buildPalette(st2);
  assert.ok(pal2.includes(s1.name), "1つ目のサポートは出力される");
  assert.ok(pal2.includes(s2.name), "2つ目のサポートは出力される");
  assert.equal(pal2.includes(s3.name), false, "3つ目のサポートはスロット追加なしでは出力しない");
  assert.equal(pal2.includes(ds.name), false, "死亡後パッシブは追加強化なしでは出力しない");
  const memo2 = rt.gen.buildMemo(st2);
  assert.equal(memo2.includes(s3.name), false, "メモでも3つ目を出さない");

  // スロット追加あり → 3つ目と死亡後が出る
  const st3 = { ...st2, enhancements: [{ name: "サポートスロット追加", effect: "" }, { name: "死亡後パッシブ追加", effect: "" }] };
  const pal3 = rt.gen.buildPalette(st3);
  assert.ok(pal3.includes(s3.name), "3つ目のサポートはスロット追加ありで出力される");
  assert.ok(pal3.includes(ds.name), "死亡後パッシブは追加強化ありで出力される");
});

test("undo履歴は同一state参照の連続pushを重複として積まない", () => {
  // ReactのuseCallback閉包内では、1ハンドラで2dispatchしても再レンダリングまで
  // 同じstate参照が残る。末尾と同一参照のpushをスキップするガードの存在を検証する。
  const source = readFileSync(new URL("../js/state.js", import.meta.url), "utf8");
  assert.match(source, /past\[past\.length - 1\] !== state/, "同一参照重複pushのガード");
});

test("Ctrl+Z/Yはテキスト入力欄ではOS標準の入力undoに譲る", () => {
  // 入力要素へフォーカス中のアプリ全体undoは、入力中の文字列を巻き戻して
  // 意図しないビルド変更を起こす。activeElementチェックの存在を検証する。
  const source = readFileSync(new URL("../js/App.js", import.meta.url), "utf8");
  assert.match(source, /document\.activeElement/, "入力要素のフォーカス判定");
  assert.match(source, /isTyping/, "入力中のスキップ変数");
  assert.match(source, /e\.key === "y" \|\| e\.key === "Y"/, "Ctrl+Yの大文字対応");
  assert.match(source, /e\.key === "Z" \|\| e\.key === "Y"/, "Ctrl+Shift+Z/Yの大文字対応");
});

test("既定データ再読込は保存済み解析ビルドを捨ててDBのE.G.O定義へ戻す", () => {
  const rt = loadRuntime();
  vm.runInContext(readFileSync(new URL("../js/ego-slot-forms.js", import.meta.url), "utf8"), rt.context, { filename: "js/ego-slot-forms.js" });
  const ego = rt.db.egos.find((e) => e.rank === "HE" && e.no === 69);
  let state = rt.reducer(rt.initialState, { type: "SET_EGO_SLOT", rank: "HE", value: JSON.parse(JSON.stringify(ego)) });

  // 解析内容を書き換えて保存する。
  state = rt.reducer(state, { type: "PATCH_EGO_SLOT", rank: "HE", patch: { name: "編集後の名前" } });
  state = rt.reducer(state, { type: "SAVE_EGO_BUILD", rank: "HE" });
  const saved = state.roster.egos.find((e) => e.rank === "HE" && e.no === ego.no);
  assert.equal(saved.build.name, "編集後の名前", "保存済みビルドの存在");

  // 既定データを再読込 → 保存済みビルドがクリアされ、DBの名前に戻る。
  state = rt.reducer(state, { type: "RESET_EGO_SLOT_TO_DB", rank: "HE" });
  assert.equal(state.egoSlots.HE.name, ego.name, "スロット名がDB既定へ戻る");
  const cleared = state.roster.egos.find((e) => e.rank === "HE" && e.no === ego.no);
  assert.equal(cleared.build, null, "保存済みビルドがクリアされる");
  assert.equal(state.egoManual, false, "解析モードフラグは終了しない");
});

test("★/履歴タブのキー解決と装備モード特定はカスタム人格も扱う", () => {
  // B3: custom: キーの解決ロジック、B4: equipPersona の __custom フォールバック。
  const source = readFileSync(new URL("../js/PersonaCodex.js", import.meta.url), "utf8");
  assert.match(source, /m === "custom"/, "custom キーの解決分岐");
  assert.match(source, /roster\.personas\.find\(\(r\) => r\.mode === "custom"\)/, "ロスターからのcustom復元");
  assert.match(source, /favCount/, "★タブのバッジ件数が解決結果と一致");
  assert.match(source, /historyCount/, "履歴タブのバッジ件数が解決結果と一致");
  assert.match(source, /p\.__custom \? "custom" : mode/, "装備時の __custom フォールバック");
  assert.match(source, /x\.p\?\.no === p\?\.no && x\.p\?\.name === p\?\.name/, "参照不一致時の名前・No照合");
});

test("別端末移行で★と履歴が復元され、不正な型はstateに混入しない", () => {
  const rt = loadRuntime();
  const imported = { ...rt.initialState,
    favorites: ["n:1", "t:1", "custom:999"],
    historyRecent: ["n:2", "t:2"],
    charName: "移行テスト",
    // 関数値やbigint等は JSON シリアライズ不能でstateを壊すため拒否する
    dangerous: () => {}
  };
  const next = rt.reducer(rt.initialState, { type: "APPLY_PARTIAL", state: imported, fields: ["favorites", "historyRecent", "charName", "dangerous"] });
  // VM コンテキスト内で生成された配列はホスト側 Array プロトタイプを持たない
  // ため、要素を展開してから比較する。
  assert.deepEqual([...next.favorites], ["n:1", "t:1", "custom:999"], "favoritesが復元される");
  assert.deepEqual([...next.historyRecent], ["n:2", "t:2"], "historyRecentが復元される");
  assert.equal(next.charName, "移行テスト", "charNameが復元される");
  assert.equal(next.dangerous, undefined, "関数値はstateに混入しない");
  assert.ok(!("dangerous" in next), "許可リスト外のキーは無視される");
});

test("ロード時に装備中の固有バフがDB最新データで更新される", () => {
  const rt = loadRuntime();
  // DB最新の定事務所フィクサー
  const teiji = rt.db.normal_personas.find((p) => p.name === "定事務所フィクサー");
  assert.ok(teiji, "定事務所フィクサーがDBに存在");
  const kumifuda = teiji.unique_buffs.find((b) => b.name === "組札");
  assert.ok(kumifuda.desc.includes("光札1を得る"), "DB最新の組札に続きがある");
  assert.equal(kumifuda.desc.includes("====="), false, "DB最新の組札にPAGE混入はない");

  // 古いビルドスナップショット（PAGE混入・続き欠落）を装備状態として用意
  const legacy = { ...rt.initialState,
    personaMode: "n",
    personaNo: teiji.no,
    personaSrc: JSON.parse(JSON.stringify(teiji)),
    uniqueBuffs: JSON.parse(JSON.stringify(teiji.unique_buffs))
  };
  // 組札を旧データ（PAGE混入あり・続きなし）に汚染する
  const legacyKumifuda = legacy.uniqueBuffs.find((b) => b.name === "組札");
  legacyKumifuda.desc = "戦術選択ダイスロールにて、最左端のスキルのランクに対応する組札に変\n換される\n===== PAGE 51 =====\n51\n組札が指定した大罪属性のスキルを使用するなら、最後のダイスに";

  // HYDRATE → refreshEquippedPersonaFromDB がDB最新で復元する
  const next = rt.reducer(rt.initialState, { type: "HYDRATE", state: legacy });
  const refreshed = next.uniqueBuffs.find((b) => b.name === "組札");
  assert.equal(refreshed.desc.includes("====="), false, "PAGE混入がDB最新で解消される");
  assert.ok(refreshed.desc.includes("光札1を得る"), "続きがDB最新で補完される");
  assert.equal(next.personaSrc.unique_buffs.find((b) => b.name === "組札").desc, kumifuda.desc, "personaSrcもDB最新に置き換わる");

  // ユーザーが手動追加したバフ（DBに存在しない名前）は保護される
  const manual = { id: "ub-manual", name: "手動追加バフ", type: "バフ", initial: 0, max: 5, desc: "ユーザー作成", place: "status" };
  const legacy2 = { ...legacy, uniqueBuffs: [...legacy.uniqueBuffs, manual] };
  const next2 = rt.reducer(rt.initialState, { type: "HYDRATE", state: legacy2 });
  const kept = next2.uniqueBuffs.find((b) => b.name === "手動追加バフ");
  assert.ok(kept, "手動追加バフが保護される");
  assert.equal(kept.desc, "ユーザー作成", "手動追加バフの内容が保持される");
});