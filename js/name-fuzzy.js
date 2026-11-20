/* 表記ゆれを吸収して候補を出す一致器。

   完全一致しか待たない取り込みは、貼り付けた文字列が1文字でも違えば
   「不明」で止まり、利用者は自分で名前 меря直すしかない。
   ここでは「その文字が含まれているか」で候補を上位から並べ、
   利用者が選べば確定できるようにする。

   判定は次の順。上のほど自信が高い。
     1. 完全一致
     2. 空白・全角空白を落として完全一致
     3. 前方一致（正規化後）
     4. 部分一致（正規化後、出現位置が後ろほど弱い）
     5. 並びが前後だけ違う（部分列一致）
     6. 共通文字の重なり（袋）

   どれにも当たらないものは返さない。当てのない候補を混ぜない。 */
(function () {
  "use strict";

  /* 全角英数字を半角へ。貼り付けは IME を介すのでここが崩れることが多い。 */
  function toHalfWidth(text) {
    return String(text || "").replace(/[Ａ-Ｚａ-ｚ０-９]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)
    );
  }

  /* 比較用の正規形。空白（半角・全角）と中黒・丸点を落とす。 */
  function normalize(text) {
    return toHalfWidth(text)
      .replace(/[\s　]+/g, "")
      .replace(/[・･・]/g, "")
      .replace(/[.．･･]/g, "")
      .toLowerCase();
  }

  /* 部分列一致（並び違いを拾う）。長い文字列を投げても線形時間で済む。 */
  function isSubsequence(needle, hay) {
    let i = 0;
    for (let k = 0; k < hay.length && i < needle.length; k++) {
      if (hay[k] === needle[i]) i++;
    }
    return i === needle.length;
  }

  function score(query, name) {
    const q = normalize(query);
    const n = normalize(name);
    if (!q || !n) return 0;
    if (q === n) return 1000;

    const at = n.indexOf(q);
    if (at === 0) return 600 - Math.min(n.length, 60);
    if (at > 0) {
      /* 出現位置が後ろほど弱い。同じ距離なら短い名前を表す。 */
      return 420 - at - Math.min(n.length, 60) / 4;
    }

    if (isSubsequence(q, n)) return 200 - Math.min(n.length, 80) / 2;

    /* 袋：共通文字の重なり。順序も部分列も当たらないときの最後の手段。 */
    const bag = new Set(n);
    let shared = 0;
    for (const ch of new Set(q)) if (bag.has(ch)) shared++;
    if (shared >= Math.min(3, Math.ceil(q.length / 2))) return 90 + shared;

    return 0;
  }

  /* 候補を上位から並べる。同じ得点は短い名前、辞書順で安定させる。 */
  function candidates(query, pool, limit) {
    const max = Number(limit) > 0 ? Number(limit) : 6;
    const seen = new Set();
    const out = [];
    for (const raw of pool || []) {
      const name = typeof raw === "string" ? raw : raw && raw.name;
      if (!name) continue;
      const key = normalize(name);
      if (!key || seen.has(key)) continue;
      const value = score(query, name);
      if (value <= 0) continue;
      seen.add(key);
      out.push({ name, score: value, data: typeof raw === "string" ? null : raw, kind: raw && raw.__kind ? raw.__kind : null });
    }
    out.sort((a, b) => b.score - a.score || a.name.length - b.name.length || a.name.localeCompare(b.name, "ja"));
    return out.slice(0, max);
  }

  /* 人格・E.G.O・精神・サポート・パッシブをひとまとめにして候補を出す。
     種別は表示用のラベルに使うので、DB のどの一覧に属するかで決まる。 */
  function candidatesAcross(db, query, limit) {
    const sources = [
      [(db?.normal_personas || []), "persona"],
      [(db?.tokui_personas || []), "persona"],
      [(db?.egos || []), "ego"],
      [(db?.spirits || []), "spirit"],
      [(db?.support_passives || []), "support"],
      [(db?.death_passives || []), "support"]
    ];
    const pool = [];
    for (const [list, kind] of sources) {
      for (const record of list) {
        if (!record || !record.name) continue;
        pool.push({ name: record.name, __kind: kind, record });
      }
    }
    return candidates(query, pool, limit);
  }

  window.LBT_normalizeName = normalize;
  window.LBT_scoreNameMatch = score;
  window.LBT_fuzzyNameCandidates = candidates;
  window.LBT_fuzzyNameCandidatesAcross = candidatesAcross;
})();