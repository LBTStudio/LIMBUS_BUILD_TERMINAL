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
        // 保存先直読みが失敗した場合は、同じ共有IDを無状態Workerから復元する。
        // Worker側はRentry/Telegraphの予備保存先も順に参照するため、閲覧者は中間サイトへ移動しない。
        try {
          token = await window.LBT_shareLink.tokenFromOgpGateway(window.location);
        } catch (gatewayError) {
          // 一時的なネットワーク失敗だけは短時間待って、従来経路も一度だけ再試行する。
          await new Promise((resolve) => window.setTimeout(resolve, 800));
          token = await window.LBT_shareLink.tokenFromExternalSource(window.location);
        }
      }
    }
    if (!token) throw new Error("外部の共有データにLBTトークンがありません");
    const [state, db, items] = await Promise.all([
      window.LBT_shareLink.decodeToken(token),
      fetch("data/db.json?v=804ef5e6").then((response) => response.ok ? response.json() : {}).catch(() => ({})),
      fetch("data/items.json?v=b47b58ae").then((response) => response.ok ? response.json() : []).catch(() => [])
    ]);
    const sharedDB = { ...(db || {}), items: Array.isArray(items) ? items : [] };
    const hydrated = window.LBT_shareLink.hydratePersonaReference(state, sharedDB);
    // 旧バージョンで発行された共有リンクは、カスタム人格の参照化バグにより
    // 人格データが全て欠落している場合がある。白紙クラッシュではなく、
    // 受信者に状況が伝わるメッセージを表示してレンダリングを続行する。
    if (hydrated?.personaSrc?.name === "（旧バージョンの共有データ）") {
      show("共有データが不完全です", "この共有リンクは旧バージョンで作成されたため、人格データが欠落しています。\n作成者に共有リンクの再発行をお願いしてください。\n\n以下、復元できた情報のみ表示します。");
    }
    window.DB = sharedDB;
    // document.open() の後は #share-root が文書から外れるため、本体生成が
    // 失敗したときにエラー表示を書き込む先が消え、白紙ページになっていた。
    // 先に本文を生成してから文書を置き換える。
    const shareHTML = window.LBT_gen.buildShareSheetHTML(hydrated);
    document.open();
    document.write(shareHTML);
    document.close();
  } catch (error) {
    const reason = error?.message || "共有URLが壊れているか、対応していない形式です。";
    show("共有データを読み込めませんでした", `${reason}\n\n時間をおいて再読み込みしても解決しない場合は、作成者に共有リンクを再発行してもらってください。`);
  }
})();
