/* Public, privacy-minimal total page-view counter for LBT.
   Counts page loads, not unique people. No cookies, localStorage IDs, or IP logs are written to D1. */
(() => {
  "use strict";
  const ENDPOINT = "https://lbt-recovery.lbtstudio-share.workers.dev/api/stats/view";
  if (!/^https?:$/.test(location.protocol) || document.getElementById("lbt-access-counter")) return;

  /* role="status" は aside には許可されない（axe aria-allowed-role）ため div にする。 */
  const badge = document.createElement("div");
  badge.id = "lbt-access-counter";
  badge.setAttribute("role", "status");
  badge.setAttribute("aria-live", "polite");
  badge.setAttribute("aria-label", "LIMBUS BUILD TERMINALの総ページ閲覧数");
  Object.assign(badge.style, {
    position: "fixed", right: "10px", bottom: "10px", zIndex: "900",
    maxWidth: "calc(100vw - 20px)", padding: "5px 9px",
    border: "1px solid rgba(212,175,95,.45)", borderRadius: "999px",
    background: "rgba(15,12,9,.88)", color: "#d8c18b",
    boxShadow: "0 2px 10px rgba(0,0,0,.25)", fontSize: "10px",
    lineHeight: "1.35", letterSpacing: ".04em", fontFamily: "system-ui, sans-serif",
    pointerEvents: "none", opacity: ".88", backdropFilter: "blur(4px)"
  });
  badge.textContent = "総アクセス：集計中";
  document.body.appendChild(badge);

  const page = /\/view(?:\/|$)/.test(location.pathname) ? "view"
    : /share\.html$/.test(location.pathname) ? "share" : "app";
  fetch(ENDPOINT + "?path=" + encodeURIComponent(page), {
    method: "GET", mode: "cors", credentials: "omit", cache: "no-store"
  }).then((response) => {
    if (!response.ok) throw new Error("counter unavailable");
    return response.json();
  }).then((data) => {
    if (!data || data.ok !== true || !Number.isSafeInteger(Number(data.totalViews))) {
      throw new Error("counter response invalid");
    }
    badge.textContent = "総アクセス：" + Number(data.totalViews).toLocaleString("ja-JP");
    badge.title = "累計ページ閲覧数（ユニーク利用者数ではありません）";
  }).catch(() => {
    badge.textContent = "総アクセス：集計停止中";
    badge.title = "カウンターサービスへ接続できません。アプリ本体の保存機能とは独立しています。";
  });
})();
