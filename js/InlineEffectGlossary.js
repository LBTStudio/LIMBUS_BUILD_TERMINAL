/* LIMBUS BUILD TERMINAL — inline reference glossary.
   PC: delayed hover / keyboard focus. Touch: tap or long-press.
   A tooltip may resolve only to the shared rule glossary or the currently displayed owner.
   Other personas' passives and definitions are never cross-referenced. */
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
    "爆発": { group: "特殊処理", source: "基本ルール p.314", text: "破裂爆発は破裂の数だけHPが減少し、振動爆発は振動の数だけSANが減少する。特殊処理一覧で処理を確認する。" },
    "混乱": { group: "状態", source: "基本ルール p.303／個別効果", text: "混乱に関する追加処理は各効果文に記載された発動条件・解除条件に従う。" },
    "指令": { group: "特殊用語", source: "基本ルール／データ内参照", text: "人格・E.G.Oの効果文に登場する特殊用語。具体的な数値や条件は、該当する参照元の効果文を併せて確認できる。" }
  };

  const RULEBOOK_TERMS = {
    "状態": ["用語", "基本ルール p.303", "バフ・デバフを1以上持つ場合、その名前の後ろに「状態」と付けて呼ぶ。"],
    "持ち越し": ["用語", "基本ルール p.303", "［1R］持続のバフ・デバフを指定の数だけ、次のRまで持続させる処理。"],
    "中立バフ": ["用語", "基本ルール p.303／311", "有利・不利両方の効果、それ自体に効果がないもの、特殊動作をするものをバフ・デバフと別枠で分類したもの。"],
    "E.G.O資源獲得量増加": ["バフ", "基本ルール p.304", "[1R] スキル使用時に獲得する大罪資源数が数値だけ増加する（最大5）。"],
    "大罪威力増加": ["バフ", "基本ルール p.304", "[1R] 該当する大罪のスキル威力が数値だけ増加する（最大10）。"],
    "大罪ダメージ量増加": ["バフ", "基本ルール p.304", "[1R] 該当する大罪スキルの全ダイスのダメージ量が数値だけ増加する（最大10）。"],
    "大罪保護": ["バフ", "基本ルール p.305", "[1R] 該当する大罪スキルのダイスから受けるダメージが数値だけ減少する（最大10）。"],
    "属性威力増加": ["バフ", "基本ルール p.305", "[1R] 該当する攻撃属性のスキル威力が数値だけ増加する（最大10）。"],
    "属性ダメージ量増加": ["バフ", "基本ルール p.305", "[1R] 該当する攻撃属性の全ダイスのダメージ量が数値だけ増加する（最大10）。"],
    "属性保護": ["バフ", "基本ルール p.305", "[1R] 該当する攻撃属性のダイスから受けるダメージが数値だけ減少する（最大10）。"],
    "デバフ保護": ["バフ", "基本ルール p.305", "[1R] 該当するデバフから受けるダメージが数値だけ減少する（最大10）。"],
    "d値強化": ["バフ", "基本ルール p.305", "[1R] スキルの全ダイスのd値が数値だけ増加する（最大10）。"],
    "呼吸-好餌": ["バフ", "基本ルール p.305", "呼吸に加え、クリティカル的中時に破裂1を付与し、対象の破裂が5以上ならHPを2回復。R終了時に1減少（最大99）。"],
    "呼吸-終止符": ["バフ", "基本ルール p.305", "呼吸の基本効果に加え、銃撃ダイスのダメージ量+1。銃撃ダイスで攻撃的中時に呼吸1を得る。R終了時に1減少（最大99）。"],
    "呼吸-パーティー": ["バフ", "基本ルール p.305", "呼吸の基本効果を持ち、クリティカル成功時に対象の沈潜を1回発動。R終了時に1減少（最大99）。"],
    "呼吸-銛捌き": ["バフ", "基本ルール p.305", "クリティカルダメージ+3。クリティカル成功時、対象が湖の存在ならスキル威力+1。獲物の印状態の敵とのマッチ勝利時、SANを8回復。R終了時に1減少（最大99）。"],
    "武装": ["バフ", "基本ルール p.306", "R開始時、武装の数2ごとに忍耐1を得る（最大10）。"],
    "あなたの盾": ["バフ", "基本ルール p.306", "守備スキル使用時、数値×3だけバリアを得る。ツヴァイ協会所属なら代わりに数値×5。R終了時に数値が半減（最大10）。"],
    "充電力場": ["バフ", "基本ルール p.306", "戦闘開始時、数値×3だけバリアを得る。W社所属なら代わりに数値×5。R終了時、数値だけ充電を得て消滅（最大10）。"],
    "時間貸与": ["バフ", "基本ルール p.306", "R終了時、数値−1だけ次のRにクイック・マッチ威力増加・脆弱を得る。数値が1なら代わりに束縛2。R開始時に1減少し、束縛がクイックより多い場合は混乱して消滅（最大3）。"],
    "狂信": ["バフ", "基本ルール p.306", "[1R] 数値2ごとにダメージ量+1。対象にN社の釘があれば、数値2ごとにスキル威力+1（最大10）。"],
    "共振": ["バフ", "基本ルール p.306", "対象に振動爆発を行う時、共振の数×対象の振動の数÷4だけ固定ダメージを与える。爆発を行ったR終了時に消滅（最大10）。"],
    "振動同化": ["バフ", "基本ルール p.306", "スキル使用時、対象の振動の数5ごとに3回まで振動2を得てマッチ威力+1（最大1）。"],
    "紅硬": ["バフ", "基本ルール p.306", "呼吸獲得量+1。出血・振動・恐慌付与量+1。破裂爆発で15以上のダメージを与えると、次のRに派閥別の属性威力増加を得る（最大1）。"],
    "知識鍛錬": ["バフ", "基本ルール p.306", "探求した知識2以上でR開始時にマッチ威力増加1。スキルを捨てる時、数値×3だけバリアを得る。被ダメージ時に1減少し、混乱時に消滅（最大6）。"],
    "自己共振回路基盤": ["バフ", "基本ルール p.306", "R開始時、自己共振回路100ごとに5回までダメージ量増加1を得る（最大1）。"],
    "大罪威力減少": ["デバフ", "基本ルール p.307", "[1R] 該当する大罪のスキル威力が数値だけ減少する（最大10）。"],
    "大罪ダメージ量減少": ["デバフ", "基本ルール p.308", "[1R] 該当する大罪スキルのダイスから受けるダメージが数値だけ減少する（最大10）。"],
    "大罪脆弱": ["デバフ", "基本ルール p.308", "[1R] 該当する大罪スキルの全ダイスのダメージ量が数値だけ増加する（最大10）。"],
    "属性威力減少": ["デバフ", "基本ルール p.308", "[1R] 該当する攻撃属性のスキル威力が数値だけ減少する（最大10）。"],
    "属性ダメージ量減少": ["デバフ", "基本ルール p.308", "[1R] 該当する攻撃属性の全ダイスのダメージ量が数値だけ減少する（最大10）。"],
    "属性脆弱": ["デバフ", "基本ルール p.308", "[1R] 該当する攻撃属性のダイスから受けるダメージが数値だけ増加する（最大10）。"],
    "デバフ脆弱": ["デバフ", "基本ルール p.308", "[1R] 該当するデバフから受けるダメージが数値だけ増加する（最大10）。"],
    "火傷-鬼火": ["デバフ", "基本ルール p.308", "数値10ごとに2回までマッチ威力+1。R終了時、数値だけHPダメージを受けて半減（最大99）。"],
    "火傷-炬火": ["デバフ", "基本ルール p.308", "数値15ごとに2回までマッチ威力−1。R終了時、数値だけHPダメージを受けて半減（最大99）。"],
    "沈潜-激情": ["デバフ", "基本ルール p.308", "数値10ごとに2回までマッチ威力−1。R終了時、数値だけSANダメージを受けて半減。SANが0または存在しないならHPダメージに置き換え（最大99）。"],
    "沈潜-悲劇": ["デバフ", "基本ルール p.308", "R開始時、数値10ごとに5回まで脆弱1。R終了時、数値だけSANダメージを受けて半減。SANが0または存在しないならHPダメージに置き換え（最大99）。"],
    "出血-裂傷": ["デバフ", "基本ルール p.308", "[1R] R開始時、数値10ごとに脆弱1。攻撃スキルのダイスロール時、数値だけHPダメージを受ける（最大99）。"],
    "出血-渇き": ["デバフ", "基本ルール p.308", "[1R] R開始時、数値÷3だけダメージを受ける。攻撃スキルのダイスロール時、数値だけHPダメージを受ける（最大99）。"],
    "出血-崩壊": ["デバフ", "基本ルール p.308", "[1R] マッチ敗北時と攻撃スキルのダイスロール時、数値だけHPダメージを受ける（最大99）。"],
    "恐慌-奇行": ["デバフ", "基本ルール p.309", "R開始時、SANが50%以下なら敵味方識別不可。攻撃スキルのダイスロール時、数値だけSANダメージを受ける（最大99）。"],
    "恐慌-落胆": ["デバフ", "基本ルール p.309", "R開始時、数値5ごとに5回まで脆弱1。攻撃スキルのダイスロール時、数値だけSANダメージを受ける（最大99）。"],
    "振動-分配": ["デバフ", "基本ルール p.309", "同じ所属の味方の数2ごとに2回までマッチ威力+1。振動爆発でSANダメージ。R終了時に1減少（最大99）。"],
    "振動-崩壊": ["デバフ", "基本ルール p.309", "R開始時、数値10ごとに脆弱1。振動爆発でSANダメージ。R終了時に1減少（最大99）。"],
    "振動-炸裂": ["デバフ", "基本ルール p.309", "R開始時、数値5ごとに混乱脆弱1。振動爆発でSANダメージ。R終了時に1減少（最大99）。"],
    "振動-反響": ["デバフ", "基本ルール p.309", "振動爆発を受けた時、数値の半分だけダメージを受ける。R終了時に1減少（最大99）。"],
    "振動-鎖": ["デバフ", "基本ルール p.309", "振動10ごとに3回までマッチ威力−1。振動爆発でSANダメージ。R終了時に1減少（最大99）。"],
    "振動-灼熱": ["デバフ", "基本ルール p.309", "振動爆発でSANダメージを受け、振動-灼熱と火傷の合計÷2だけ憤怒HPダメージ。R終了時に1減少（最大99）。"],
    "振動-永続": ["デバフ", "基本ルール p.309", "振動爆発でSANダメージ。1d100の出目が数値以下なら振動爆発をもう一度受ける。R終了時に1減少（最大99）。"],
    "振動-ネジ巻き": ["デバフ", "基本ルール p.309", "自分がスキルで付与する振動量+1。R終了時、次のRにクイック1。振動爆発でSANダメージ。R終了時に1減少（最大99）。"],
    "破裂-切除": ["デバフ", "基本ルール p.309", "数値10ごとに3回まで虚弱1。破裂爆発でHPダメージを受ける。R終了時に1減少（最大99）。"],
    "烙印": ["デバフ", "基本ルール p.309", "被ダメージ時、火傷の数÷5だけ固定HPダメージを受ける（最大1）。"],
    "N社の釘": ["デバフ", "基本ルール p.310", "R終了時、数値だけ次のRに出血を持ち越し、数値を半減（最大10）。"],
    "内臓崩壊": ["デバフ", "基本ルール p.310", "出血が攻撃スキル以外の全ダイスロールでも発動する。HPアンプルで除去できる（最大1）。"],
    "精神崩壊": ["デバフ", "基本ルール p.310", "恐慌が攻撃スキル以外の全ダイスロールでも発動する。鎮静剤で除去できる（最大1）。"],
    "時間猶予": ["中立バフ", "基本ルール p.310", "ダメージを受けず、代わりに受けるはずだったダメージ量だけ数値が増加。3R経過・再付与・数値999で怠惰ダメージとSANダメージを受けて消滅。"],
    "挑発値": ["中立バフ", "基本ルール p.311", "[1R] 敵が対象を選ぶ時、挑発値×5%の確率で自分が選ばれる（最大10）。"],
    "電圧": ["中立バフ", "基本ルール p.311", "特定スキルの能力が上昇する（最大10）。"],
    "血餐": ["蓄積要素", "基本ルール p.311", "この戦闘で全キャラクターが受けた出血ダメージの数だけ増加。数値は全キャラクターで共有。"],
    "自己共振回路": ["蓄積要素", "基本ルール p.311", "この戦闘で全キャラクターが獲得または消費した充電の数だけ増加。数値は全キャラクターで共有。"],
    "弾丸-魔弾": ["弾丸", "基本ルール p.312", "銃撃ダイスがあるスキルでマッチ勝利時、火傷3を付与。消費すると特定戦術の能力が向上。"],
    "弾丸-装甲弾": ["弾丸", "基本ルール p.312", "銃撃ダイスでマッチする時、対象のマッチ威力−1。消費すると特定戦術の能力が向上。"],
    "弾丸-氷結弾": ["弾丸", "基本ルール p.312", "銃撃ダイスで攻撃的中時、次のRに武装解除1。マッチ勝利時、次のRに麻痺1。消費すると特定戦術の能力が向上。"],
    "弾丸-火炎弾": ["弾丸", "基本ルール p.312", "銃撃ダイスで攻撃的中時、火傷2を付与。消費すると特定戦術の能力が向上。"],
    "弾丸-火縄": ["弾丸", "基本ルール p.312", "銃撃ダイスでマッチ勝利的中時、火傷を1〜7付与。消費すると特定戦術の能力が向上。"],
    "弾丸-灼熱推進弾": ["弾丸", "基本ルール p.312", "銃撃ダイスのダメージ量+2。速度6以上なら追加でダメージ量+3。消費すると特定戦術の能力が向上。"],
    "弾丸-虎標弾": ["弾丸", "基本ルール p.312", "銃撃ダイスのダメージ量+2。火傷・振動付与量+1。消費すると特定戦術の能力が向上。"],
    "弾丸-猛虎標弾": ["弾丸", "基本ルール p.312", "銃撃ダイスのダメージ量+3。火傷・振動付与量+2。対象より速度が速ければ振動爆発ダメージ+5。消費すると特定戦術の能力が向上。"]
  };
  OFFICIAL_TERMS["爆発"] = { group: "特殊処理", source: "基本ルール p.314", text: "破裂爆発は破裂の数だけHPが減少し、振動爆発は振動の数だけSANが減少する。特殊処理一覧で処理を確認する。" };
  OFFICIAL_TERMS["混乱"] = { group: "状態", source: "基本ルール p.303／個別効果", text: "混乱に関する追加処理は各効果文に記載された発動条件・解除条件に従う。" };
  delete OFFICIAL_TERMS["指令"];
  Object.entries(RULEBOOK_TERMS).forEach(([term, [group, source, text]]) => {
    OFFICIAL_TERMS[term] = { group, source, text };
  });

  const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
    const add = (term, entry) => {
      const key = cleanTerm(term);
      if (!key || key.length > 64 || (key.length === 1 && !OFFICIAL_TERMS[key])) return;
      if (!glossary.has(key)) glossary.set(key, []);
      const entries = glossary.get(key);
      const uniqueKey = [entry.category, entry.source, entry.description, entry.ownerType, entry.ownerName, entry.isRulebook].join("|");
      if (entries.some((item) => item._key === uniqueKey)) return;
      entries.push({ ...entry, term: key, _key: uniqueKey });
    };
    const addEntity = (term, category, source, description, priority = 80, context = {}) => {
      const value = String(description || "").trim();
      add(term, {
        category: category || "固有効果", source: source || "データベース",
        description: value || "この項目の説明本文はデータに登録されていません。",
        priority, reference: false, scopeCategory: context.scopeCategory || category || "固有効果",
        ownerType: context.ownerType || null, ownerName: context.ownerName || null
      });
    };
    const combine = (...values) => values.map((value) => String(value || "").trim()).filter(Boolean).join("\n");

    Object.entries(OFFICIAL_TERMS).forEach(([term, entry]) => {
      add(term, { category: entry.group, source: entry.source, description: entry.text, priority: 120, isRulebook: true });
    });

    const personas = [...(db && Array.isArray(db.normal_personas) ? db.normal_personas : []),
      ...(db && Array.isArray(db.tokui_personas) ? db.tokui_personas : [])];
    personas.forEach((persona) => {
      const identity = "人格：" + (persona.name || "名称未設定");
      const owner = { ownerType: "persona", ownerName: persona.name || "", scopeCategory: "人格パッシブ" };
      const passive = combine(persona.passive_cond && "発動条件：" + persona.passive_cond, persona.passive_always && "常時：" + persona.passive_always, persona.passive_effect);
      if (persona.passive_name) addEntity(persona.passive_name, "人格パッシブ", identity, passive, 90, owner);
      (persona.unique_buffs || []).forEach((buff) => {
        const description = combine(buff.desc, buff.type && "種別：" + buff.type, buff.initial != null && "初期値：" + buff.initial, buff.max != null && "最大値：" + buff.max);
        addEntity(buff.name, buff.type || "人格固有バフ", identity, description, 105, { ...owner, scopeCategory: "人格固有バフ" });
      });
      (persona.skills || []).forEach((skill, index) => {
        const source = identity + "／" + (skill.name || skill.rank || "スキル" + index);
      });
    });

    (db && Array.isArray(db.egos) ? db.egos : []).forEach((ego) => {
      const source = "E.G.O：" + (ego.rank ? "[" + ego.rank + "] " : "") + (ego.name || "名称未設定");
      const owner = { ownerType: "ego", ownerName: ego.name || "", scopeCategory: "E.G.Oパッシブ" };
      if (ego.passive_name) addEntity(ego.passive_name, "E.G.Oパッシブ", source, combine(ego.passive_cond && "発動条件：" + ego.passive_cond, ego.passive_effect), 95, owner);
      if (ego.unique_buff) {
        const uniqueText = String(ego.unique_buff);
        const names = [...uniqueText.matchAll(/\[([^\]\n]{2,64})\]/gu)]
          .map((match) => cleanTerm(match[1]))
          .filter((name) => name && !/^\d+R$/u.test(name));
        const mainName = names[0] || uniqueText.split(/\r?\n/u)[0].replace(/^(?:固有バフ|固有効果)\s*[:：]?/u, "").trim();
        if (mainName) addEntity(mainName, "E.G.O固有効果", source, uniqueText, 110, { ...owner, scopeCategory: "E.G.O固有効果" });
      }
      [ego.kakusei, ego.shinshoku, ...(ego.sub_skills || [])].filter(Boolean).forEach((skill, index) => {
        const label = skill.name || skill.kind || (index === 0 ? "覚醒スキル" : "派生スキル");
        const skillSource = source + "／" + label;
      });
    });

    // サポートパッシブは通常の効果文ホバー対象にしない。
    // ここへ登録すると、同期人格の同名・部分一致へサポート側の説明が混入する。
    glossary.forEach((entries) => entries.sort((a, b) => (Number(b.isRulebook) - Number(a.isRulebook)) || (b.priority || 0) - (a.priority || 0)));
    cachedDb = db;
    cachedGlossary = glossary;
    // Shared matching is driven only by the common rule glossary. Owner-specific
    // names are added per render so another persona can never steal a substring match.
    cachedTerms = Object.keys(OFFICIAL_TERMS).sort((a, b) => b.length - a.length || a.localeCompare(b, "ja"));
    cachedPattern = cachedTerms.length ? new RegExp(cachedTerms.map(escapeRegExp).join("|"), "gu") : null;
    return glossary;
  }

  function ownerTypeForScope(scopeCategory) {
    return scopeCategory.startsWith("E.G.O") ? "ego"
      : scopeCategory.startsWith("人格") || scopeCategory.startsWith("追加パッシブ") ? "persona"
      : scopeCategory.startsWith("アイテム") ? "item"
      : scopeCategory.startsWith("精神状態") ? "spirit"
      : scopeCategory.startsWith("通常強化") ? "enhancement"
      : scopeCategory.startsWith("特殊強化") ? "specialEnhancement"
      : null;
  }

  function buildOwnerGlossary(sourceRecord, scope) {
    const entries = new Map();
    if (!sourceRecord || typeof sourceRecord !== "object" || Array.isArray(sourceRecord)) return entries;

    const rawScope = String(scope || "");
    const splitAt = rawScope.indexOf(":");
    const scopeCategory = (splitAt < 0 ? rawScope : rawScope.slice(0, splitAt)).trim();
    const scopeOwner = splitAt < 0 ? "" : rawScope.slice(splitAt + 1).trim();
    const ownerType = ownerTypeForScope(scopeCategory);
    const ownerName = String(sourceRecord.name || scopeOwner || "").trim();
    if (!ownerName || !ownerType) return entries;

    const addLocal = (term, category, source, description, priority, itemScope) => {
      const key = cleanTerm(term);
      if (!key || key.length > 64 || (key.length === 1 && !OFFICIAL_TERMS[key])) return;
      if (!entries.has(key)) entries.set(key, []);
      entries.get(key).push({
        category: category || "固有効果",
        source: source || "現在表示中のデータ",
        description: String(description || "").trim() || "この項目の説明本文はデータに登録されていません。",
        priority: priority || 80,
        reference: false,
        ownerType,
        ownerName,
        scopeCategory: itemScope || category || scopeCategory,
        term: key
      });
    };
    const combine = (...values) => values.map((value) => String(value || "").trim()).filter(Boolean).join("\n");

    if (ownerType === "persona") {
      const identity = "人格：" + ownerName;
      const passive = combine(
        sourceRecord.passive_cond && "発動条件：" + sourceRecord.passive_cond,
        sourceRecord.passive_always && "常時：" + sourceRecord.passive_always,
        sourceRecord.passive_effect
      );
      if (sourceRecord.passive_name) addLocal(sourceRecord.passive_name, "人格パッシブ", identity, passive, 130, "人格パッシブ");
      (sourceRecord.unique_buffs || sourceRecord.uniqueBuffs || []).forEach((buff) => {
        if (!buff) return;
        const description = combine(
          buff.desc,
          buff.type && "種別：" + buff.type,
          buff.initial != null && "初期値：" + buff.initial,
          buff.max != null && "最大値：" + buff.max
        );
        addLocal(buff.name, buff.type || "人格固有バフ", identity, description, 135, "人格固有バフ");
      });
      const extras = [...(sourceRecord.extra_passives || []), ...(sourceRecord.extraPassives || [])];
      extras.forEach((passive) => {
        if (!passive) return;
        const description = combine(
          passive.cond && "発動条件：" + passive.cond,
          passive.always && "常時：" + passive.always,
          passive.effect
        );
        addLocal(passive.name, "追加パッシブ", identity, description, 125, "追加パッシブ");
      });
    } else if (ownerType === "ego") {
      const identity = "E.G.O：" + (sourceRecord.rank ? "[" + sourceRecord.rank + "] " : "") + ownerName;
      if (sourceRecord.passive_name) {
        addLocal(sourceRecord.passive_name, "E.G.Oパッシブ", identity,
          combine(sourceRecord.passive_cond && "発動条件：" + sourceRecord.passive_cond, sourceRecord.passive_effect), 130, "E.G.Oパッシブ");
      }
      if (sourceRecord.unique_buff) {
        const uniqueText = String(sourceRecord.unique_buff);
        const names = [...uniqueText.matchAll(/\[([^\]\n]{2,64})\]/gu)]
          .map((match) => cleanTerm(match[1]))
          .filter((name) => name && !/^\d+R$/u.test(name));
        const mainName = names[0] || uniqueText.split(/\r?\n/u)[0].replace(/^(?:固有バフ|固有効果)\s*[:：]?/u, "").trim();
        if (mainName) addLocal(mainName, "E.G.O固有効果", identity, uniqueText, 140, "E.G.O固有効果");
      }
    } else if (ownerType === "item") {
      addLocal(sourceRecord.name, "アイテム", "アイテム：" + ownerName, sourceRecord.effect, 100, "アイテム効果");
    } else if (ownerType === "spirit" || ownerType === "enhancement" || ownerType === "specialEnhancement") {
      addLocal(sourceRecord.name, scopeCategory, scopeCategory, sourceRecord.effect || sourceRecord.always_effect, 100, scopeCategory);
    }

    entries.forEach((rows) => rows.sort((a, b) => (b.priority || 0) - (a.priority || 0)));
    return entries;
  }

  function resolveEntries(term, glossary, scope) {
    const entries = (glossary.get(term) || []).slice();
    if (!entries.length) return [];
    // 共通用語辞典を最優先する。人格固有名詞と同名でも共通ルールの定義を使う。
    const rulebook = entries.find((entry) => entry.isRulebook);
    if (rulebook) return [rulebook];

    const rawScope = String(scope || "");
    const splitAt = rawScope.indexOf(":");
    const scopeCategory = (splitAt < 0 ? rawScope : rawScope.slice(0, splitAt)).trim();
    const ownerName = splitAt < 0 ? "" : rawScope.slice(splitAt + 1).trim();
    const ownerType = ownerTypeForScope(scopeCategory);
    const byPriority = (a, b) =>
      (Number(b.scopeCategory === scopeCategory) - Number(a.scopeCategory === scopeCategory))
      || (b.priority || 0) - (a.priority || 0);

    if (ownerName) {
      // 現在表示中の所有者に直接属する定義だけを許可する。
      // 他人格・他E.G.O・サポート枠へのフォールバックは行わない。
      const owned = entries.filter((entry) => !entry.reference
        && entry.ownerName === ownerName
        && (!ownerType || entry.ownerType === ownerType))
        .sort(byPriority);
      return owned.length ? [owned[0]] : [];
    }

    const common = entries.filter((entry) => !entry.reference && !entry.ownerName).sort(byPriority);
    return common.length ? [common[0]] : [];
  }

  function tokenize(text, db, scope, sourceRecord) {
    const input = String(text == null ? "" : text);
    if (!input) return [{ text: input, term: null, entries: [] }];

    const rawScope = String(scope || "");
    const splitAt = rawScope.indexOf(":");
    const scopeCategory = (splitAt < 0 ? rawScope : rawScope.slice(0, splitAt)).trim();
    const ownerName = splitAt < 0 ? "" : rawScope.slice(splitAt + 1).trim();

    // サポートパッシブと死亡後サポートパッシブはホバー対象にしない。
    if (scopeCategory.startsWith("サポートパッシブ") || scopeCategory.startsWith("死亡後サポートパッシブ")) {
      return [{ text: input, term: null, entries: [] }];
    }

    const glossary = buildGlossary(db || global.DB);
    const ownerGlossary = buildOwnerGlossary(sourceRecord, scope);
    const ownerType = ownerTypeForScope(scopeCategory);

    // Match only shared rule terms plus names belonging to the active owner.
    // This prevents a longer foreign passive name from consuming part of a shared term.
    const hasLiveOwnerRecord = !!sourceRecord && typeof sourceRecord === "object" && !Array.isArray(sourceRecord);
    const activeTerms = hasLiveOwnerRecord
      ? [...ownerGlossary.keys()]
      : [];
    if (ownerName && !hasLiveOwnerRecord) {
      glossary.forEach((rows, term) => {
        if (rows.some((entry) => !entry.reference
          && entry.ownerName === ownerName
          && (!ownerType || entry.ownerType === ownerType))) activeTerms.push(term);
      });
    }
    const terms = [...new Set([...cachedTerms, ...activeTerms, ...ownerGlossary.keys()])]
      .sort((a, b) => b.length - a.length || a.localeCompare(b, "ja"));
    if (!terms.length) return [{ text: input, term: null, entries: [] }];
    const pattern = new RegExp(terms.map(escapeRegExp).join("|"), "gu");

    const scopedGlossary = {
      get: (term) => {
        const commonAndDatabase = glossary.get(term) || [];
        const permittedGlobal = hasLiveOwnerRecord
          ? commonAndDatabase.filter((entry) => entry.isRulebook)
          : commonAndDatabase;
        return [...(ownerGlossary.get(term) || []), ...permittedGlobal];
      }
    };
    const parts = [];
    let lastIndex = 0;
    for (const match of input.matchAll(pattern)) {
      const term = match[0];
      const entries = resolveEntries(term, scopedGlossary, scope);
      if (!entries.length) continue;
      if (match.index > lastIndex) parts.push({ text: input.slice(lastIndex, match.index), term: null, entries: [] });
      parts.push({ text: term, term, entries });
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
    const lastPointerType = React.useRef(null);
    const lastPointerPosition = React.useRef(null);
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
      const estimatedHeight = Math.min(280, Math.max(150, global.innerHeight * 0.42));
      const pointer = lastPointerType.current === "mouse" ? lastPointerPosition.current : null;
      if (pointer) {
        // Keep desktop reference text close to where the user is looking.
        // Flip left/up near the viewport edges so the panel stays fully visible.
        const gap = 14;
        let left = pointer.x + gap;
        if (left + width > global.innerWidth - 12) left = pointer.x - width - gap;
        left = Math.max(12, Math.min(left, global.innerWidth - width - 12));
        let top = pointer.y + gap;
        if (top + estimatedHeight > global.innerHeight - 12) top = pointer.y - estimatedHeight - gap;
        top = Math.max(12, Math.min(top, global.innerHeight - estimatedHeight - 12));
        setPosition({ top, left, width });
        return;
      }
      // Keyboard and touch users retain the predictable anchor-based placement.
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
    /* A pending gesture must not outlive the term component. */
    React.useEffect(() => () => {
      clearTimer(hoverTimer);
      clearTimer(closeTimer);
      clearTimer(longPressTimer);
    }, []);
    const trackPointer = (event) => {
      if (event.pointerType !== "mouse") return;
      lastPointerType.current = "mouse";
      lastPointerPosition.current = { x: event.clientX, y: event.clientY };
    };
    const startHover = (event) => {
      if (event.pointerType !== "mouse") return;
      trackPointer(event);
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
      lastPointerType.current = event.pointerType || null;
      if (event.pointerType === "mouse") {
        lastPointerPosition.current = { x: event.clientX, y: event.clientY };
      } else {
        lastPointerPosition.current = null;
      }
      if (event.pointerType !== "touch") {
        /* A new non-touch gesture also clears stale touch-click suppression. */
        suppressClick.current = false;
        return;
      }
      clearTimer(longPressTimer);
      suppressClick.current = false;
      longPressTimer.current = global.setTimeout(() => {
        suppressClick.current = true;
        setOpen(true);
      }, 480);
    };
    const onPointerUp = () => clearTimer(longPressTimer);
    const onPointerCancel = () => {
      clearTimer(longPressTimer);
      suppressClick.current = false;
    };
    const onContextMenu = (event) => {
      event.preventDefault();
      /* Some mobile browsers dispatch contextmenu before the 480ms timer.
         Suppress its follow-up synthetic click, or the click toggles this open panel shut. */
      if (lastPointerType.current === "touch") suppressClick.current = true;
      setOpen(true);
    };
    const onClick = (event) => {
      if (suppressClick.current) {
        suppressClick.current = false;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      // Desktop hover may have opened the popover before the click lands.
      // Treat mouse clicks as "show details", not a toggle that immediately closes it.
      if (lastPointerType.current === "mouse") {
        setOpen(true);
        return;
      }
      setOpen((value) => !value);
    };
    const panel = open && position ? React.createElement("div", {
      id: panelId, ref: panelRef, className: "lbt-glossary-popover", role: "dialog", "aria-label": "用語詳細：" + term, "aria-modal": false,
      style: { position: "fixed", top: position.top, left: position.left, width: position.width },
      onPointerEnter: () => { clearTimer(closeTimer); },
      onPointerLeave: () => closeSoon(220),
      onKeyDown: (event) => { if (event.key === "Escape") setOpen(false); }
    },
      React.createElement("div", { className: "lbt-glossary-popover-head" },
        React.createElement("span", { className: "lbt-glossary-popover-kicker" }, "用語リファレンス"),
        React.createElement("strong", { className: "lbt-glossary-popover-title" }, term),
        React.createElement("button", { type: "button", className: "lbt-glossary-popover-close", "aria-label": "用語詳細を閉じる", onClick: () => setOpen(false) }, "×")
      ),
      React.createElement("div", { className: "lbt-glossary-popover-body" },
        entries.length
          ? entries.slice(0, 1).map((entry, index) => React.createElement("section", { key: entry._key || entry.source + index, className: "lbt-glossary-entry" },
              React.createElement("div", { className: "lbt-glossary-entry-meta" },
                React.createElement("b", null, entry.category || "用語"),
                entry.source ? React.createElement("span", null, entry.source) : null
              ),
              React.createElement("p", null, entry.description || "この項目の説明は未登録です。")
            ))
          : React.createElement("section", { className: "lbt-glossary-entry" },
              React.createElement("p", null, "この文脈に対応する説明は登録されていません。")
            )
      ),
      React.createElement("div", { className: "lbt-glossary-popover-foot" }, "PC：ホバー／クリック　スマホ：タップ／長押し　Escで閉じる")
    ) : null;
    const portal = panel && ReactDOM && ReactDOM.createPortal ? ReactDOM.createPortal(panel, global.document.body) : panel;
    return React.createElement("span", {
      className: "lbt-glossary-anchor", ref: anchorRef,
      onPointerEnter: startHover, onPointerMove: trackPointer, onPointerLeave: endHover, onPointerDown,
      onPointerUp, onPointerCancel,
      onContextMenu,
      onKeyDown: (event) => { if (event.key === "Escape") setOpen(false); }
    },
      React.createElement("button", {
        type: "button", className: "lbt-glossary-term",
        "aria-label": "用語詳細：" + term, "aria-haspopup": "true",
        "aria-expanded": open, "aria-describedby": open ? panelId : undefined,
        title: "PCはホバー、スマホはタップ／長押しで詳細を表示",
        onFocus: (event) => {
          if (event.currentTarget.matches(":focus-visible")) {
            lastPointerType.current = "keyboard";
            lastPointerPosition.current = null;
            setOpen(true);
          }
        }, onClick
      }, props.children || term),
      portal
    );
  }

  function InlineGlossaryText(props) {
    const React = global.React;
    const pieces = tokenize(props.text, global.DB, props.scope, props.sourceRecord);
    return React.createElement(React.Fragment, null, pieces.map((piece, index) => piece.term
      ? React.createElement(TooltipTerm, { key: index + "-" + piece.term, term: piece.term, entries: piece.entries }, piece.text)
      : React.createElement(React.Fragment, { key: index }, piece.text)));
  }
  function render(text, scope, sourceRecord) {
    if (text == null || text === "") return text;
    return global.React.createElement(InlineGlossaryText, {
      text: String(text), scope: scope || "",
      sourceRecord: sourceRecord && typeof sourceRecord === "object" ? sourceRecord : null
    });
  }
  global.LBTInlineEffectGlossary = {
    buildGlossary, tokenize, render,
    refresh: (db) => { cachedDb = null; cachedGlossary = null; cachedPattern = null; cachedTerms = []; return buildGlossary(db || global.DB); }
  };
  global.LBT_GLOSSARY_TEXT = (text, scope, sourceRecord) => global.LBTInlineEffectGlossary.render(text, scope, sourceRecord);
})(window);
