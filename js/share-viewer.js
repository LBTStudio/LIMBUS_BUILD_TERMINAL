/* GitHub Pagesの静的共有ページで、URL fragment内の共有スナップショットを表示する。 */
(function () {
  // share.htmlを既に開いている状態で共有URLへ移動すると、ブラウザは同一文書の
  // hash変更として扱いスクリプトを再実行しない。その場合も共有データを復元する。
  window.addEventListener("hashchange", () => {
    if (window.location.hash.startsWith("#lbt=")) window.location.reload();
  });
})();
(async function () {
  const root = document.getElementById("share-root");
  const show = (title, detail, preview = null) => {
    if (!root) return;
    root.innerHTML = "";
    const box = document.createElement("section");
    box.className = "share-viewer-notice";
    const h1 = document.createElement("h1");
    h1.textContent = title;
    const p = document.createElement("p");
    p.textContent = detail;
    box.append(h1, p);
    if (preview?.personaName) {
      document.title = `【人格】${preview.personaName}｜LBT`;
      const meta = document.createElement("div");
      meta.className = "share-viewer-meta";
      meta.textContent = `人格 ${preview.personaName}　HP ${preview.hp || "—"}　SAN ${preview.san || "—"}${preview.syncRank ? `　同期 ${preview.syncRank}` : ""}${preview.syncMax ? "　MAX" : ""}`;
      box.append(meta);
    }
    root.appendChild(box);
  };

  const directToken = window.LBT_shareLink?.tokenFromLocation(window.location);
  const externalSources = window.LBT_shareLink?.externalSourcesFromLocation(window.location) || [];
  const preview = window.LBT_shareLink?.previewFromLocation(window.location);
  if (!directToken && !externalSources.length) {
    show("共有データがありません", "LIMBUS BUILD TERMINALで発行した共有URLを、途中で省略せずに開いてください。");
    return;
  }
  if (!window.LBT_shareLink || !window.LBT_gen) {
    show("共有ビューアを起動できません", "必要なスクリプトを読み込めませんでした。ページを再読み込みしてください。");
    return;
  }

  try {
    if (preview?.personaName) show(`【人格】${preview.personaName}`, "共有シートを読み込み中です。", preview);
    let token = directToken;
    if (!token) {
      try {
        token = await window.LBT_shareLink.tokenFromExternalSource(window.location);
      } catch (firstError) {
        // Rentry等の公開保存先は、初回のCORS互換取得が一時的に失敗することがある。
        // 同じLBTページ内で短時間待って一度だけ再試行し、閲覧者に中間サイトを開かせない。
        await new Promise((resolve) => window.setTimeout(resolve, 800));
        token = await window.LBT_shareLink.tokenFromExternalSource(window.location);
      }
    }
    if (!token) throw new Error("外部の共有データにLBTトークンがありません");
    const [state, db, items] = await Promise.all([
      window.LBT_shareLink.decodeToken(token),
      fetch("data/db.json?v=64r74").then((response) => response.ok ? response.json() : {}).catch(() => ({})),
      fetch("data/items.json?v=64r73").then((response) => response.ok ? response.json() : []).catch(() => [])
    ]);
    const sharedDB = { ...(db || {}), items: Array.isArray(items) ? items : [] };
    const hydrated = window.LBT_shareLink.hydratePersonaReference(state, sharedDB);
    window.DB = sharedDB;
    document.open();
    document.write(window.LBT_gen.buildShareSheetHTML(hydrated));
    document.close();
  } catch (error) {
    show("共有データを読み込めませんでした", error?.message || "共有URLが壊れているか、対応していない形式です。");
  }
})();
