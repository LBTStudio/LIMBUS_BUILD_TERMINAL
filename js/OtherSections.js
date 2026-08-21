const SIN_LIST = ["\u61A4\u6012", "\u8272\u6B32", "\u6020\u60F0", "\u66B4\u98DF", "\u6182\u9B31", "\u50B2\u6162", "\u5AC9\u59AC"];
/* SUPPORT_DEATH_RE は state.js で宣言済み（クラシックスクリプト共通グローバル）。重複宣言は読み込みエラーになるため除去。 */
function isDeathSupportPassive(s) {
  const txt = `${s?.name || ""} ${s?.cond || ""} ${s?.effect || ""}`;
  return SUPPORT_DEATH_RE.test(txt);
}
function canEditPersonaState(state) {
  const src = state.personaSrc || {};
  const isCustom = state.personaMode === "custom" || src.__custom;
  const isSavedCustom = !!(isCustom && src.__saved);
  return !!(state.syncedManual || isCustom && !isSavedCustom);
}
const EGO_RESOURCE_NAMES = ["憤怒", "色欲", "怠惰", "暴食", "憂鬱", "傲慢", "嫉妬"];
const EGO_RESOURCE_RE = new RegExp(`(${EGO_RESOURCE_NAMES.join("|")})\\s*[x×]\\s*(\\d+)`, "g");
const parseEgoResources = (resources) => {
  const raw = String(resources || "").trim();
  const matches = [...raw.matchAll(EGO_RESOURCE_RE)].map((match) => ({ sin: match[1], count: match[2] }));
  return matches.length ? matches : raw ? [{ sin: "特殊", count: raw }] : [];
};
const EgoResourceChips = ({ resources, className = "" }) => {
  const entries = parseEgoResources(resources);
  if (!entries.length) return null;
  return React.createElement("div", { className: `ego-resource-chips ${className}`.trim(), "aria-label": `消費資源: ${resources}` }, ...entries.map((entry, index) => React.createElement("span", { key: `${entry.sin}-${entry.count}-${index}`, className: "ego-resource-chip", "data-sin": entry.sin }, React.createElement("span", { className: "ego-resource-chip-name" }, entry.sin), React.createElement("b", { className: "ego-resource-chip-count" }, entry.sin === "特殊" ? entry.count : `×${entry.count}`))));
};
const BaseSection = ({ state, dispatch }) => {
  const setF = (field, value) => dispatch({ type: "SET_FIELD", field, value });
  const imgList = (state.imgUrls || "").split("\n").map((s) => s.trim()).filter(Boolean);
  const [imgTab, setImgTab] = React.useState(0);
  const [shareImageBusy, setShareImageBusy] = React.useState(false);
  const [shareImageError, setShareImageError] = React.useState("");
  const SHARE_IMAGE_TARGET_BYTES = window.LBT_shareLink?.SHARE_IMAGE_TARGET_BYTES || 32 * 1024;
  const shareImageBytes = window.LBT_shareLink?.shareImageBytes || ((value) => {
    const match = /^data:image\/(webp|jpeg);base64,([A-Za-z0-9+/]+=*)$/i.exec(String(value || ""));
    if (!match) return 0;
    const padding = match[2].endsWith("==") ? 2 : match[2].endsWith("=") ? 1 : 0;
    return Math.max(0, Math.floor(match[2].length * 3 / 4) - padding);
  });
  const currentShareImageBytes = shareImageBytes(state.shareImageData);
  const currentShareImageOk = !state.shareImageData || currentShareImageBytes > 0 && currentShareImageBytes <= SHARE_IMAGE_TARGET_BYTES;
  const readFileAsDataURL = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("画像データを読み込めませんでした"));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(file);
  });
  const canvasBlob = (canvas, mime, quality) => new Promise((resolve) => canvas.toBlob(resolve, mime, quality));
  const compressShareImage = async (file) => {
    if (!file || !/^image\/(png|jpeg|webp)$/i.test(file.type)) throw new Error("PNG・JPEG・WebP画像を選択してください");
    if (file.size > 15 * 1024 * 1024) throw new Error("画像は15MB以下にしてください");
    const sourceUrl = URL.createObjectURL(file);
    try {
      const source = await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("画像を展開できませんでした"));
        image.src = sourceUrl;
      });
      const sizes = [1200, 1080, 960, 840, 720, 640, 560];
      const qualities = [0.86, 0.82, 0.78, 0.74, 0.70, 0.66, 0.62, 0.58];
      for (const width of sizes) {
        const height = Math.round(width * 630 / 1200);
        const sourceRatio = source.naturalWidth / source.naturalHeight;
        const targetRatio = width / height;
        // 縦長の立ち絵はcontainだと左右の余白が大きくなり主題が小さく見える。
        // OGPでは上半身・顔が読めることを優先してcoverへ切り替え、上寄りへ自動フォーカスする。
        const portraitFocus = sourceRatio < targetRatio * 0.82;
        const scale = portraitFocus
          ? Math.max(width / source.naturalWidth, height / source.naturalHeight)
          : Math.min(width / source.naturalWidth, height / source.naturalHeight);
        const drawWidth = Math.round(source.naturalWidth * scale);
        const drawHeight = Math.round(source.naturalHeight * scale);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d", { alpha: false });
        context.fillStyle = "#0e0b09";
        context.fillRect(0, 0, width, height);
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        const drawX = Math.round((width - drawWidth) / 2);
        const drawY = portraitFocus
          ? Math.round(height * 0.36 - drawHeight * 0.18)
          : Math.round((height - drawHeight) / 2);
        context.drawImage(source, drawX, drawY, drawWidth, drawHeight);
        for (const quality of qualities) {
          let blob = await canvasBlob(canvas, "image/webp", quality);
          if (!blob || !/^image\/webp$/i.test(blob.type)) blob = await canvasBlob(canvas, "image/jpeg", quality);
          if (blob && blob.size <= SHARE_IMAGE_TARGET_BYTES) {
            return { data: await readFileAsDataURL(blob), bytes: blob.size, width, height, mime: blob.type };
          }
        }
      }
      throw new Error("画像の圧縮見込みが規定量（32KB）へ収まりませんでした。共有リンクは発行できません。別の画像を再アップロードしてください");
    } finally {
      URL.revokeObjectURL(sourceUrl);
    }
  };
  const onShareImageSelected = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setShareImageBusy(true);
    setShareImageError("");
    try {
      const result = await compressShareImage(file);
      setF("shareImageData", result.data);
      setF("shareImageBlockedReason", "");
      toast(`共有画像を ${result.width}×${result.height} / ${Math.ceil(result.bytes / 1024)}KB に最適化しました。共有リンクを発行できます`);
    } catch (error) {
      const message = error?.message || "共有画像を設定できませんでした";
      setF("shareImageData", "");
      setF("shareImageBlockedReason", message);
      setShareImageError(message);
      toast(message);
    } finally {
      setShareImageBusy(false);
    }
  };
  React.useEffect(() => {
    if (imgTab >= imgList.length) setImgTab(0);
  }, [imgList.length, imgTab]);
  const activeImg = imgList[imgTab] || "";
  return /* @__PURE__ */ React.createElement("div", { className: "base-info-grid" },
    /* @__PURE__ */ React.createElement("div", { className: "stack-3 base-info-identity" },
      /* @__PURE__ */ React.createElement(Field, { label: "CHARACTER NAME / キャラクター名" }, /* @__PURE__ */ React.createElement("input", { className: "input", placeholder: "例：黒雲会組員 - 昇", value: state.charName, onChange: (e) => setF("charName", e.target.value) })),
      /* @__PURE__ */ React.createElement(Field, { label: "PLAYER NAME" }, /* @__PURE__ */ React.createElement("input", { className: "input", placeholder: "PL名", value: state.plName, onChange: (e) => setF("plName", e.target.value) })),
      /* @__PURE__ */ React.createElement(Field, { label: "INITIATIVE / 駒の行動順", hint: "数値が大きいほどCCFOLIA上で先に行動します" }, /* @__PURE__ */ React.createElement("input", { className: "input", type: "number", step: "1", inputMode: "numeric", placeholder: "0", value: state.initiative ?? 0, onChange: (e) => setF("initiative", e.target.value), title: "CCFOLIAの駒のイニシアチブ" })),
      /* @__PURE__ */ React.createElement(Field, { label: "COLOR / 駒の色" }, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", gap: 8, alignItems: "center" } }, /* @__PURE__ */ React.createElement("input", { type: "color", value: state.color, onChange: (e) => setF("color", e.target.value), style: { width: 44, height: 36, padding: 2, background: "var(--surface-inset)", border: "1px solid var(--line)", borderRadius: "var(--r)", cursor: "pointer" } }), /* @__PURE__ */ React.createElement("input", { className: "input", value: state.color, onChange: (e) => setF("color", e.target.value), style: { flex: 1, fontFamily: "var(--f-mono)" } }))),
    ),
    /* @__PURE__ */ React.createElement("div", { className: "stack-3 base-info-image" },
      /* @__PURE__ */ React.createElement(Field, { label: "IMAGE URL / 立ち絵URL（複数行可、1行目=基本、以降=差分）" }, /* @__PURE__ */ React.createElement("textarea", { className: "textarea", rows: 4, placeholder: "https://...", value: state.imgUrls, onChange: (e) => setF("imgUrls", e.target.value), style: { whiteSpace: "pre", overflowX: "auto", overflowWrap: "normal", wordBreak: "keep-all", fontFamily: "var(--f-mono)" } })),
      /* @__PURE__ */ React.createElement(Field, { label: "SHARE IMAGE / 共有シート画像", hint: "共有HTMLへ同梱する公開画像です。縦長の立ち絵は左右余白を抑えて上半身を自動フォーカスし、最大1200×630・32KB以下へ圧縮します" },
        /* @__PURE__ */ React.createElement("div", { className: "stack-2" },
          /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } },
            /* @__PURE__ */ React.createElement("label", { className: "btn btn-sm", style: { cursor: shareImageBusy ? "wait" : "pointer", opacity: shareImageBusy ? .7 : 1 } }, shareImageBusy ? "画像を最適化中…" : "画像を選択", /* @__PURE__ */ React.createElement("input", { type: "file", accept: "image/png,image/jpeg,image/webp", disabled: shareImageBusy, onChange: onShareImageSelected, style: { display: "none" } })),
            state.shareImageData && /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-sm btn-ghost", onClick: () => { setF("shareImageData", ""); setF("shareImageBlockedReason", ""); setShareImageError(""); }, title: "共有画像を削除" }, "共有画像を削除")
          ),
          state.shareImageData && /* @__PURE__ */ React.createElement("div", { className: "base-img-preview share-image-preview" }, /* @__PURE__ */ React.createElement("div", { className: "base-img-preview-label" }, "SHARE PREVIEW / 共有シート画像"), /* @__PURE__ */ React.createElement("img", { src: state.shareImageData, alt: "共有シート画像プレビュー", className: "base-img-preview-img" }), /* @__PURE__ */ React.createElement("div", { className: currentShareImageOk ? "base-auto-note" : "base-img-preview-err", style: { marginTop: 8, display: "block" } }, currentShareImageOk ? `圧縮見込み: ${Math.ceil(currentShareImageBytes / 1024)}KB / 32KB — 共有リンクを発行できます` : `圧縮見込み: ${Math.ceil(currentShareImageBytes / 1024)}KB / 32KB — 上限超過のため共有リンクは発行しません。再アップロードしてください`)),
          shareImageError && /* @__PURE__ */ React.createElement("div", { className: "base-img-preview-err", style: { display: "block" } }, shareImageError)
        )
      ),
      activeImg && /* @__PURE__ */ React.createElement("div", { className: "base-img-preview" },
        imgList.length > 1 && /* @__PURE__ */ React.createElement("div", { className: "base-img-tabs" }, imgList.map((_, i) => /* @__PURE__ */ React.createElement("button", { key: i, type: "button", className: `btn btn-sm${imgTab === i ? "" : " btn-ghost"}`, onClick: () => setImgTab(i), title: `${i + 1}枚目の立ち絵を表示` }, `画像${i + 1}`))),
        /* @__PURE__ */ React.createElement("div", { className: "base-img-preview-label" }, `PREVIEW / 立ち絵プレビュー（${imgTab + 1}枚目）`),
        /* @__PURE__ */ React.createElement("img", { src: activeImg, alt: "立ち絵プレビュー", className: "base-img-preview-img", onError: (e) => { e.currentTarget.style.display = "none"; e.currentTarget.parentElement.classList.add("is-error"); }, onLoad: (e) => { e.currentTarget.style.display = ""; e.currentTarget.parentElement.classList.remove("is-error"); } }),
        /* @__PURE__ */ React.createElement("div", { className: "base-img-preview-err" }, "画像を読み込めませんでした（URLを確認してください）")
      )
    ),
    /* @__PURE__ */ React.createElement("div", { className: "base-auto-note base-info-note" }, "HP/SAN/速度/弾丸/耐性は装備中人格パネルで一元管理します（同期化で手動編集）。共有シート画像は共有データへ同梱され、共有リンクを知る人へ公開されます。")
  );
};
const PassiveCard = ({ title, pas, sin }) => /* @__PURE__ */ React.createElement("div", { className: "deck-card deck-focus", "data-sin": sin || "", style: { padding: "var(--s-4)" } }, /* @__PURE__ */ React.createElement("div", { className: "deck-card-head", style: { marginBottom: "var(--s-3)" } }, /* @__PURE__ */ React.createElement(
  "span",
  {
    className: "deck-rank",
    style: { background: "var(--gold-tint)", color: "var(--gold)", border: "1px solid var(--gold-line)", padding: "4px 10px", fontFamily: "var(--f-display)", fontWeight: 600, fontSize: "var(--fs-12)", borderRadius: "var(--r-sm)", letterSpacing: "0.08em" }
  },
  title
), pas.cond && /* @__PURE__ */ React.createElement("span", { className: "cond-chips-lg", style: { marginLeft: 8 } }, /* @__PURE__ */ React.createElement(CondChips, { cond: pas.cond }))), /* @__PURE__ */ React.createElement("div", { className: "deck-name", style: { fontFamily: "var(--f-display)", fontWeight: 700, fontSize: "var(--fs-18)", color: "var(--tx)", marginBottom: "var(--s-3)", lineHeight: 1.2 } }, pas.name), /* @__PURE__ */ React.createElement("div", { className: "stack-3" }, pas.always && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--f-display)", fontSize: 9, letterSpacing: "0.18em", color: "var(--gold)", textTransform: "uppercase", marginBottom: 4 } }, "ALWAYS / \u5E38\u6642\u52B9\u679C"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-12)", color: "var(--tx-2)", lineHeight: 1.7, padding: "8px 12px", background: "var(--gold-tint)", border: "1px solid var(--gold-line)", borderLeft: "3px solid var(--gold)", borderRadius: "var(--r-sm)", whiteSpace: "pre-wrap" } }, pas.always)), pas.effect && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--f-display)", fontSize: 9, letterSpacing: "0.18em", color: "var(--gold)", textTransform: "uppercase", marginBottom: 4 } }, "EFFECT / \u52B9\u679C"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-12)", color: "var(--tx-2)", lineHeight: 1.7, padding: "8px 12px", background: "var(--surface-inset)", border: "1px solid var(--line-dim)", borderLeft: "3px solid var(--gold)", borderRadius: "var(--r-sm)", whiteSpace: "pre-wrap" } }, pas.effect)), pas.quick && /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--f-mono)", fontSize: "var(--fs-11)", color: "var(--tx-dim)", padding: "4px 8px", background: "var(--surface-2)", borderRadius: "var(--r-sm)" } }, /* @__PURE__ */ React.createElement("span", { style: { color: "var(--gold)" } }, "QUICK"), " ", pas.quick)));
const PassiveSection = ({ state, dispatch }) => {
  const patchPas = (patch) => dispatch({ type: "PATCH_PAS", patch });
  const patchPas2 = (patch) => dispatch({ type: "PATCH_PAS2", patch });
  const togglePas2 = () => {
    if (!editable) {
      toast("パッシブ2の追加・削除は編集モード時のみ可能です");
      return;
    }
    dispatch({ type: "SET_FIELD", field: "pas2Enabled", value: !state.pas2Enabled });
  };
  const [forceEdit, setForceEdit] = React.useState(false);
  const src = state.personaSrc;
  const editable = canEditPersonaState(state);
  const isAutoFromDB = !!src && !editable && !forceEdit && state.pas.name === (src.passive_name || "") && !!state.pas.name;
  const primarySin = src ? window.getPrimarySin ? window.getPrimarySin(src) : null : null;
  const h = React.createElement;
  const isPassiveReadView = !!state.pas?.name && !forceEdit;
  if (isPassiveReadView) return h("div", { className: "stack-6 passive-read-workspace" },
    h("div", { className: "passive-read-toolbar" },
      h("div", { className: "passive-read-copy" },
        h("span", { className: "section-title-num", style: { fontSize: "var(--fs-18)" } }, "A"),
        h("div", null,
          h("div", { className: "passive-read-title" }, "PERSONA PASSIVE / 人格パッシブ"),
          h("div", { className: "passive-read-note" }, "内容はカードで確認し、変更が必要なときだけ編集を開きます。")
        )
      ),
      editable ? h(Button, { variant: "ghost", size: "sm", icon: "edit", onClick: () => setForceEdit(true) }, "この枠を編集") : null
    ),
    h(PassiveCard, { title: "PERSONA PASSIVE / 人格パッシブ", pas: state.pas, sin: primarySin }),
    state.pas2Enabled && state.pas2?.name ? h(PassiveCard, { title: "PASSIVE 2 / 追加パッシブ", pas: state.pas2, sin: primarySin }) : null,
    !state.pas2Enabled && editable ? h("div", { className: "passive-read-add" }, h(Button, { variant: "ghost", icon: "plus", onClick: togglePas2, title: "パッシブ2を追加" }, "パッシブ2を追加")) : null
  );
  return /* @__PURE__ */ React.createElement("div", { className: "stack-6" }, /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "baseline", gap: "var(--s-3)", marginBottom: "var(--s-3)", paddingBottom: "var(--s-2)", borderBottom: "1px solid var(--line-dim)" } }, /* @__PURE__ */ React.createElement("span", { className: "section-title-num", style: { fontSize: "var(--fs-18)" } }, "A"), /* @__PURE__ */ React.createElement("span", { style: { fontFamily: "var(--f-display)", fontWeight: 700, fontSize: "var(--fs-16)", letterSpacing: "0.06em", color: "var(--tx)" } }, "PERSONA PASSIVE / \u4EBA\u683C\u30D1\u30C3\u30B7\u30D6"), /* @__PURE__ */ React.createElement("div", { style: { flex: 1 } }), editable && isAutoFromDB && /* @__PURE__ */ React.createElement(Button, { variant: "ghost", size: "sm", icon: "edit", onClick: () => setForceEdit(true) }, "手動編集"), forceEdit && /* @__PURE__ */ React.createElement(Button, { variant: "ghost", size: "sm", icon: "eye", onClick: () => setForceEdit(false) }, "\u30AB\u30FC\u30C9\u8868\u793A\u306B\u623B\u3059")), isAutoFromDB ? /* @__PURE__ */ React.createElement(PassiveCard, { title: "PERSONA PASSIVE / \u4EBA\u683C\u30D1\u30C3\u30B7\u30D6", pas: state.pas, sin: primarySin }) : /* @__PURE__ */ React.createElement(Card, null, /* @__PURE__ */ React.createElement("div", { className: "card-body stack-3" }, /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--s-3)" } }, /* @__PURE__ */ React.createElement(Field, { label: "\u30D1\u30C3\u30B7\u30D6\u540D" }, /* @__PURE__ */ React.createElement("input", { className: "input", placeholder: "\u4F8B\uFF1A\u6289\u308A\u51FA\u3057", value: state.pas.name, disabled: !editable, onChange: (e) => patchPas({ name: e.target.value }) })), /* @__PURE__ */ React.createElement(Field, { label: "\u767A\u52D5\u6761\u4EF6" }, /* @__PURE__ */ React.createElement("input", { className: "input", placeholder: "\u4F8B\uFF1A\u8272\u6B32x2 \u5171\u9CF4", value: state.pas.cond, disabled: !editable, onChange: (e) => patchPas({ cond: e.target.value }) }))), /* @__PURE__ */ React.createElement(Field, { label: "\u5E38\u6642\u52B9\u679C\uFF08\u4EFB\u610F\uFF09" }, /* @__PURE__ */ React.createElement("textarea", { className: "textarea", rows: 2, placeholder: "\u5E38\u6642\u767A\u52D5\u3059\u308B\u52B9\u679C", value: state.pas.always, disabled: !editable, onChange: (e) => patchPas({ always: e.target.value }) })), /* @__PURE__ */ React.createElement(Field, { label: "\u52B9\u679C" }, /* @__PURE__ */ React.createElement("textarea", { className: "textarea", rows: 3, placeholder: "\u4F8B\uFF1A\u30DE\u30C3\u30C1\u52DD\u5229\u6642\u3001\u5BFE\u8C61\u304C\u51FA\u8840\u72B6\u614B\u306A\u3089\u2026", value: state.pas.effect, disabled: !editable, onChange: (e) => patchPas({ effect: e.target.value }) })), /* @__PURE__ */ React.createElement(Field, { label: "\u30AF\u30A4\u30C3\u30AF\u30D1\u30EC\u30C3\u30C8\uFF08:\u30B3\u30DE\u30F3\u30C9\uFF09", hint: "\u4F8B\uFF1A:\u51FA\u8840+1 :\u51FA\u8840-1\uFF08\u4EBA\u683CDB\u304B\u3089\u81EA\u52D5\u62BD\u51FA\u53EF\uFF09" }, /* @__PURE__ */ React.createElement("input", { className: "input", placeholder: ":\u51FA\u8840+1 :\u51FA\u8840-1", value: state.pas.quick, disabled: !editable, onChange: (e) => patchPas({ quick: e.target.value }) })))), state.pas2Enabled ? /* @__PURE__ */ React.createElement(Card, { className: "mt-3", style: { marginTop: "var(--s-3)" } }, /* @__PURE__ */ React.createElement("div", { className: "card-header", style: { justifyContent: "space-between" } }, /* @__PURE__ */ React.createElement("span", { className: "t-label" }, "PASSIVE 2\uFF08\u4EFB\u610F\uFF09"), /* @__PURE__ */ React.createElement(Button, { variant: "ghost", size: "sm", onClick: togglePas2, disabled: !editable, icon: "x" }, "\u30D1\u30C3\u30B7\u30D62\u3092\u524A\u9664")), /* @__PURE__ */ React.createElement("div", { className: "card-body stack-3" }, /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--s-3)" } }, /* @__PURE__ */ React.createElement(Field, { label: "\u30D1\u30C3\u30B7\u30D6\u540D2" }, /* @__PURE__ */ React.createElement("input", { className: "input", value: state.pas2.name, disabled: !editable, onChange: (e) => patchPas2({ name: e.target.value }) })), /* @__PURE__ */ React.createElement(Field, { label: "\u767A\u52D5\u6761\u4EF62" }, /* @__PURE__ */ React.createElement("input", { className: "input", value: state.pas2.cond, disabled: !editable, onChange: (e) => patchPas2({ cond: e.target.value }) }))), /* @__PURE__ */ React.createElement(Field, { label: "\u52B9\u679C2" }, /* @__PURE__ */ React.createElement("textarea", { className: "textarea", rows: 2, value: state.pas2.effect, disabled: !editable, onChange: (e) => patchPas2({ effect: e.target.value }) })))) : /* @__PURE__ */ React.createElement("div", { style: { marginTop: "var(--s-3)" } }, /* @__PURE__ */ React.createElement(Button, { variant: "ghost", icon: "plus", onClick: togglePas2, disabled: !editable, title: editable ? "パッシブ2を追加" : "編集モード時のみ追加可能" }, "\u30D1\u30C3\u30B7\u30D62\u3092\u8FFD\u52A0"))));
};
const UNIQUE_BUFF_PLACES = [
  { value: "status", label: "ST\u5074\uFF08\u6570\u5024\u7BA1\u7406\uFF09" },
  { value: "params", label: "\u30E9\u30D9\u30EB\u5074\uFF08params\uFF09" },
  { value: "none", label: "\u51FA\u529B\u3057\u306A\u3044" }
];
const UNIQUE_BUFF_TYPES = ["\u30D0\u30D5", "\u30C7\u30D0\u30D5", "\u4E2D\u7ACB\u30D0\u30D5", "\u4E2D\u7ACB\u30C7\u30D0\u30D5", "\u305D\u306E\u4ED6"];
const UniqueBuffsBlock = ({ state, dispatch }) => {
  const editable = canEditPersonaState(state);
  return /* @__PURE__ */ React.createElement("div", { className: "unique-block" }, /* @__PURE__ */ React.createElement("div", { className: "unique-header" }, /* @__PURE__ */ React.createElement("div", { className: "unique-header-icon" }, "\u25C6"), /* @__PURE__ */ React.createElement("div", { className: "unique-header-text" }, /* @__PURE__ */ React.createElement("div", { className: "unique-header-title" }, "UNIQUE STATUS / \u56FA\u6709\u30D0\u30D5\u30FB\u30B9\u30C6\u30FC\u30BF\u30B9"), /* @__PURE__ */ React.createElement("div", { className: "unique-header-sub" }, "\u4EBA\u683CDB\u304B\u3089 ", /* @__PURE__ */ React.createElement("b", { style: { color: "var(--gold)" } }, "\u81EA\u52D5\u62BD\u51FA\u3055\u308C\u305F\u56FA\u6709\u30D0\u30D5"), "\u306F\u88C5\u5099\u6642\u306B\u3053\u3053\u3078\u73FE\u308C\u307E\u3059\u3002 \u624B\u52D5\u3067\u3082\u8FFD\u52A0/\u7DE8\u96C6/\u524A\u9664\u53EF\u80FD\u3002")), /* @__PURE__ */ React.createElement(Button, { variant: "primary", size: "sm", icon: "plus", disabled: !editable, title: editable ? "手動追加" : "編集モード時のみ追加可能", onClick: () => editable && dispatch({ type: "ADD_UB" }) }, "\u624B\u52D5\u8FFD\u52A0")), state.uniqueBuffs.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "unique-empty" }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: 24, color: "var(--tx-mute)", marginBottom: 6 } }, "\u2014"), /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--f-display)", fontSize: "var(--fs-12)", color: "var(--tx-dim)", letterSpacing: "0.06em", marginBottom: 4 } }, state.personaSrc ? `\u300E${state.personaSrc.name}\u300F\u306B\u306FDB\u767B\u9332\u306E\u56FA\u6709\u30D0\u30D5\u304C\u3042\u308A\u307E\u305B\u3093` : "\u4EBA\u683C\u672A\u88C5\u5099 \u2014 \u4E0A\u306E\u4E00\u89A7\u304B\u3089\u88C5\u5099\u3057\u3066\u304F\u3060\u3055\u3044"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-11)", color: "var(--tx-mute)", lineHeight: 1.6 } }, "\u56FA\u6709\u30D0\u30D5\u304C\u767B\u9332\u3055\u308C\u3066\u3044\u308B\u4EBA\u683C\u3092\u88C5\u5099\u3059\u308B\u3068", /* @__PURE__ */ React.createElement("b", { style: { color: "var(--gold)" } }, "\u81EA\u52D5\u3067\u8FFD\u52A0"), "\u3055\u308C\u307E\u3059\u3002", /* @__PURE__ */ React.createElement("br", null), "\u81EA\u4F5C\u30AB\u30A6\u30F3\u30BF\u3084\u540C\u671F\u5316\u5F8C\u306E\u6D3E\u751F\u30B9\u30C6\u30FC\u30BF\u30B9\u3092\u8A18\u9332\u3057\u305F\u3044\u5834\u5408\u306F\u300C\u624B\u52D5\u8FFD\u52A0\u300D\u304B\u3089\u3002"), state.personaSrc && (state.personaSrc.unique_buffs || []).length > 0 && /* @__PURE__ */ React.createElement("div", { style: { marginTop: 12, padding: "8px 12px", background: "color-mix(in oklab, var(--warn) 10%, var(--surface-inset))", border: "1px solid color-mix(in oklab, var(--warn) 30%, var(--line))", borderRadius: "var(--r)", fontSize: "var(--fs-11)", color: "var(--warn)", lineHeight: 1.5 } }, "\u26A0 \u88C5\u5099\u4E2D\u306E\u4EBA\u683C\u306B\u306F ", /* @__PURE__ */ React.createElement("b", null, state.personaSrc.unique_buffs.length, "\u4EF6"), " \u306E\u56FA\u6709\u30D0\u30D5\u304CDB\u5B9A\u7FA9\u3055\u308C\u3066\u3044\u307E\u3059\u304C\u3001\u73FE\u5728\u306E\u30EA\u30B9\u30C8\u306B\u306F\u53CD\u6620\u3055\u308C\u3066\u3044\u307E\u305B\u3093\u3002", /* @__PURE__ */ React.createElement("br", null), /* @__PURE__ */ React.createElement(
    "button",
    {
      onClick: () => {
        const ubs = state.personaSrc.unique_buffs.map((b, i) => ({
          id: `ub-${Date.now()}-${i}`,
          name: b.name || "",
          type: b.type || "\u56FA\u6709\u30D0\u30D5",
          max: b.max || 20,
          desc: b.desc || "",
          place: b.place || "status"
        }));
        dispatch({ type: "SET_FIELD", field: "uniqueBuffs", value: ubs });
        toast("\u56FA\u6709\u30D0\u30D5\u3092\u518D\u8AAD\u8FBC");
      },
      style: { marginTop: 6, padding: "4px 10px", background: "var(--warn)", color: "#1a1400", border: "none", borderRadius: "var(--r-sm)", cursor: "pointer", fontFamily: "var(--f-display)", fontSize: "var(--fs-10)", letterSpacing: "0.14em", fontWeight: 700 }
    },
    "\u56FA\u6709\u30D0\u30D5\u3092\u518D\u8AAD\u8FBC"
  ))) : /* @__PURE__ */ React.createElement("div", { className: "stack-2" }, state.uniqueBuffs.map((b, i) => /* @__PURE__ */ React.createElement("div", { key: b.id, className: "unique-item" }, /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "auto 2fr 1fr 70px 70px 130px auto", gap: "var(--s-2)", alignItems: "end" } }, /* @__PURE__ */ React.createElement("div", { className: "reorder-btns", style: { alignSelf: "center" } }, /* @__PURE__ */ React.createElement("button", { className: "reorder-btn", onClick: () => editable && dispatch({ type: "REORDER_LIST", field: "uniqueBuffs", key: b.id, dir: -1 }), disabled: !editable || i === 0, title: "\u4E0A\u3078" }, /* @__PURE__ */ React.createElement(Icon, { name: "arrowU", size: 10 })), /* @__PURE__ */ React.createElement("button", { className: "reorder-btn", onClick: () => editable && dispatch({ type: "REORDER_LIST", field: "uniqueBuffs", key: b.id, dir: 1 }), disabled: !editable || i === state.uniqueBuffs.length - 1, title: "\u4E0B\u3078" }, /* @__PURE__ */ React.createElement(Icon, { name: "arrowD", size: 10 }))), /* @__PURE__ */ React.createElement(Field, { label: "\u540D\u524D" }, /* @__PURE__ */ React.createElement("input", { className: "input", value: b.name, disabled: !editable, onChange: (e) => dispatch({ type: "PATCH_UB", id: b.id, patch: { name: e.target.value } }) })), /* @__PURE__ */ React.createElement(Field, { label: "\u7A2E\u5225" }, /* @__PURE__ */ React.createElement("select", { className: "select", value: b.type, disabled: !editable, onChange: (e) => dispatch({ type: "PATCH_UB", id: b.id, patch: { type: e.target.value } }) }, [.../* @__PURE__ */ new Set([b.type, ...UNIQUE_BUFF_TYPES])].filter(Boolean).map((t) => /* @__PURE__ */ React.createElement("option", { key: t, value: t }, t)))), /* @__PURE__ */ React.createElement(Field, { label: "\u521D\u671F\u5024" }, /* @__PURE__ */ React.createElement("input", { type: "number", className: "input", value: b.initial ?? 0, disabled: !editable, onChange: (e) => dispatch({ type: "PATCH_UB", id: b.id, patch: { initial: parseInt(e.target.value) || 0 } }) })), /* @__PURE__ */ React.createElement(Field, { label: "\u6700\u5927\u5024" }, /* @__PURE__ */ React.createElement("input", { type: "number", className: "input", value: b.max, onChange: (e) => dispatch({ type: "PATCH_UB", id: b.id, patch: { max: parseInt(e.target.value) || 0 } }) })), /* @__PURE__ */ React.createElement(Field, { label: "\u5E30\u5C5E" }, /* @__PURE__ */ React.createElement("select", { className: "select", value: b.place || "status", disabled: !editable, onChange: (e) => dispatch({ type: "PATCH_UB", id: b.id, patch: { place: e.target.value } }), title: "ST\u5074=JSON\u306Estatus\u3078 / \u30E9\u30D9\u30EB\u5074=JSON\u306Eparams(label)\u3078 / \u51FA\u529B\u3057\u306A\u3044=JSON\u306B\u542B\u3081\u306A\u3044\uFF08memo\u30FB\u30D1\u30EC\u30C3\u30C8\u306F\u9664\u304F\uFF09" }, UNIQUE_BUFF_PLACES.map((o) => /* @__PURE__ */ React.createElement("option", { key: o.value, value: o.value }, o.label)))), /* @__PURE__ */ React.createElement("button", { className: "btn btn-sm lbt-del", disabled: !editable, onClick: () => editable && dispatch({ type: "REMOVE_UB", id: b.id }), title: "\u3053\u306E\u56FA\u6709\u30D0\u30D5\u3092\u524A\u9664" }, /* @__PURE__ */ React.createElement(Icon, { name: "trash", size: 12 }), " \u524A\u9664")), /* @__PURE__ */ React.createElement(Field, { label: "\u52B9\u679C\u30E1\u30E2\uFF08\u4EFB\u610F\uFF09" }, /* @__PURE__ */ React.createElement("textarea", { className: "textarea", rows: 2, value: b.desc || "", disabled: !editable, onChange: (e) => dispatch({ type: "PATCH_UB", id: b.id, patch: { desc: e.target.value } }) }))))));
};
const catalogSource = (entry) => entry?.source === "supplement" ? "supplement" : "rulebook";
const SourceFilterRow = ({ h, kind, value, onChange }) => h(
  "div",
  { className: "codex-filter-row source-filter-row", "aria-label": `${kind}の出典フィルタ` },
  h("span", { className: "filter-label" }, "出典"),
  ...[["all", "全て"], ["rulebook", "ルールブック"], ["supplement", "サプリメント"]].map(([key, text]) => h("button", { key, type: "button", className: `chip${value === key ? " is-active" : ""}`, "aria-pressed": value === key, onClick: () => onChange(key) }, text))
);
const useSourceFilterControl = (kind, value, onChange) => {
  React.useEffect(() => {
    const anchor = document.querySelector(".focus .codex-filters");
    if (!anchor) return void 0;
    const host = document.createElement("div");
    host.className = "codex-filter-row source-filter-row";
    host.setAttribute("aria-label", `${kind}の出典フィルタ`);
    host.innerHTML = `<span class="filter-label">出典</span>`;
    [["all", "全て"], ["rulebook", "ルールブック"], ["supplement", "サプリメント"]].forEach(([key, text]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `chip${value === key ? " is-active" : ""}`;
      button.setAttribute("aria-pressed", String(value === key));
      button.textContent = text;
      button.onclick = () => onChange(key);
      host.appendChild(button);
    });
    anchor.after(host);
    return () => host.remove();
  }, [kind, value, onChange]);
};
const SupportSection = ({ state, dispatch }) => {
  const h = React.createElement;
  const editable = canEditPersonaState(state);
  // 人格の同期化はサポートパッシブを自動編集対象にしない。
  // 編集したいスロットだけユーザーが明示的に選択する。
  const [editingSupportIds, setEditingSupportIds] = React.useState([]);
  const isSupportEditing = (id) => editable && editingSupportIds.includes(id);
  const toggleSupportEditing = (id) => setEditingSupportIds((ids) => ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  const [query, setQuery] = React.useState("");
  const [sinFilter, setSinFilter] = React.useState("");
  const [lpFilter, setLpFilter] = React.useState("");
  const [sourceFilter, setSourceFilter] = React.useState("all");
  const [catalogMode, setCatalogMode] = React.useState("standard");
  const [selected, setSelected] = React.useState(null);
  const activeEnhancements = window.LBT_getActiveEnhancements?.(state) || (state.enhancements || []);
  const hasDeathSlot = activeEnhancements.some((e) => e.name === "死亡後パッシブ追加");
  const applyFilters = (list) => {
    const q = query.trim().toLowerCase();
    return (list || []).filter((s) => {
      if (sinFilter && !(s.cond || "").includes(sinFilter)) return false;
      if (sourceFilter !== "all" && catalogSource(s) !== sourceFilter) return false;
      if (lpFilter) {
        const lp = Number(s.lp) || 0;
        if (lpFilter === "lt20" && !(lp < 20)) return false;
        if (lpFilter === "20-49" && !(lp >= 20 && lp < 50)) return false;
        if (lpFilter === "50-99" && !(lp >= 50 && lp < 100)) return false;
        if (lpFilter === "gte100" && !(lp >= 100)) return false;
      }
      if (q) {
        const hay = `${s.name || ""} ${s.cond || ""} ${s.effect || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  };
  const filtered = React.useMemo(() => applyFilters(DB.support_passives), [query, sinFilter, lpFilter, sourceFilter]);
  // 死亡後専用スロットの候補は専用DB (death_passives) を単独ソースとする。
  // 通常DBを正規表現で推測分類すると誤検出・取りこぼしが起きるため混在させない。
  const deathFiltered = React.useMemo(() => applyFilters(DB.death_passives), [query, sinFilter, lpFilter, sourceFilter]);
  const standardFiltered = filtered;
  const visibleStandard = catalogMode !== "death" ? standardFiltered : [];
  const visibleDeath = catalogMode !== "standard" ? deathFiltered : [];
  const visibleCount = catalogMode === "death" ? deathFiltered.length : catalogMode === "all" ? standardFiltered.length + deathFiltered.length : standardFiltered.length;
  const visibleTotal = catalogMode === "death" ? (DB.death_passives || []).length : catalogMode === "all" ? (DB.support_passives || []).length + (DB.death_passives || []).length : (DB.support_passives || []).length;
  const equipped = Array.isArray(state.supports) ? state.supports : [];
  const deathSupport = state.deathSupport || null;
  const maxSupports = activeEnhancements.some((e) => e.name === "サポートスロット追加") ? 3 : 2;
  const isEquipped = (name) => equipped.some((s) => s.name === name) || deathSupport?.name === name;
  const selectedIsDeath = !!(selected && (DB.death_passives || []).some((s) => s.name === selected.name && (s.cond || "") === (selected.cond || "")));
  const patchSupport = (id, patch) => dispatch({ type: "PATCH_SUPPORT", id, patch });
  const patchDeathSupport = (patch) => dispatch({ type: "PATCH_DEATH_SUPPORT", patch });
  const tryEquip = (s, slotType = "standard") => {
    if (!s || isEquipped(s.name)) return;
    if (slotType === "death") {
      if (!hasDeathSlot) {
        toast("死亡後専用スロットが未開放です");
        return;
      }
      dispatch({ type: "SET_DEATH_SUPPORT", spp: s });
      toast(`『${s.name}』を死亡後専用スロットへ装備`);
      return;
    }
    if (equipped.length >= maxSupports) {
      toast(`スロット上限（${maxSupports}枠）です`);
      return;
    }
    dispatch({ type: "ADD_SUPPORT", spp: s });
    toast(`『${s.name}』を装備`);
  };
  const addCustomSupport = () => {
    if (!editable) {
      toast("手動追加は編集モード時のみ可能です");
      return;
    }
    if (equipped.length >= maxSupports) {
      toast(`スロット上限（${maxSupports}枠）です`);
      return;
    }
    dispatch({ type: "ADD_SUPPORT", spp: { name: "", cond: "", effect: "", lp: "" } });
    toast("手動サポートを追加");
  };
  const addCustomDeathSupport = () => {
    if (!editable) {
      toast("手動追加は編集モード時のみ可能です");
      return;
    }
    if (!hasDeathSlot) {
      toast("死亡後専用スロットが未開放です");
      return;
    }
    dispatch({ type: "SET_DEATH_SUPPORT", spp: { name: "", cond: "", effect: "", lp: "" } });
    toast("死亡後専用サポートを追加");
  };
  const renderList = (items, slotType) => h(
    "div",
    { className: "spirit-list" },
    ...items.map((s) => {
      const isSel = selected?.name === s.name;
      const eq = isEquipped(s.name);
      return h(
        "div",
        {
          key: `${slotType}:${s.name}`,
          className: `spirit-item${isSel ? " is-active" : ""}${eq ? " is-equipped" : ""}`,
          onClick: () => setSelected(s),
          onDoubleClick: () => tryEquip(s, slotType)
        },
        h(
          "div",
          { className: "spirit-item-head" },
          h("div", { className: "spirit-item-name" }, s.name),
          h("span", { className: "spirit-item-price" }, "LP ", s.lp),
          slotType === "death" ? h("span", { style: { fontSize: 9, color: "var(--warn)", letterSpacing: "0.12em", fontFamily: "var(--f-display)" } }, "死亡後専用") : null,
          eq ? h("span", { style: { marginLeft: "auto", fontSize: 9, color: "var(--gold)", fontFamily: "var(--f-display)", letterSpacing: "0.16em" } }, "★ 装備中") : null
        ),
        h("div", { className: "spirit-item-line" }, h("span", { className: "spirit-item-tag", "data-tag": "always" }, "条件"), h("span", null, h(CondChips, { cond: s.cond }))),
        h("div", { className: "spirit-item-line" }, h("span", { className: "spirit-item-tag", "data-tag": slotType === "death" ? "confuse" : "morale" }, "効果"), h("span", null, s.effect))
      );
    }),
    items.length === 0 ? h("div", { style: { padding: "var(--s-4)", textAlign: "center", color: "var(--tx-mute)", fontSize: "var(--fs-11)" } }, slotType === "death" ? "死亡後専用候補はありません" : "条件に一致するサポートパッシブがありません") : null
  );
  const renderSupportSlot = (spp, i) => h(
    "div",
    { key: i, className: `spp-slot${spp ? " is-filled" : ""}` },
    spp ? h(
      React.Fragment,
      null,
      h("button", { className: "rm", onClick: () => dispatch({ type: "REMOVE_SUPPORT", id: spp.id }), title: "外す" }, h(Icon, { name: "x", size: 12 })),
      h(
        "div",
        { style: { display: "flex", alignItems: "center", gap: 6 } },
        h("div", { className: "spp-slot-idx" }, "スロット ", i + 1),
        h("div", { style: { flex: 1 } }),
        h(
          "div",
          { className: "reorder-btns", style: { flexDirection: "row", gap: 2 } },
          h("button", { className: "reorder-btn", onClick: () => dispatch({ type: "REORDER_LIST", field: "supports", key: spp.id, dir: -1 }), disabled: i === 0, title: "左へ" }, h("span", { style: { fontSize: 10 } }, "‹")),
          h("button", { className: "reorder-btn", onClick: () => dispatch({ type: "REORDER_LIST", field: "supports", key: spp.id, dir: 1 }), disabled: i >= equipped.length - 1, title: "右へ" }, h("span", { style: { fontSize: 10 } }, "›"))
        )
      ),
      isSupportEditing(spp.id) ? h(React.Fragment, null,
        h("div", { className: "manual-edit-row" },
          h("span", { className: "manual-edit-badge" }, "手動編集中"),
          h(Button, { variant: "ghost", size: "sm", icon: "eye", onClick: () => toggleSupportEditing(spp.id) }, "表示へ戻す")
        ),
        h("input", { className: "input", placeholder: "サポート名", value: spp.name || "", onChange: (e) => patchSupport(spp.id, { name: e.target.value }) }),
        h("input", { className: "input", placeholder: "発動条件", value: spp.cond || "", onChange: (e) => patchSupport(spp.id, { cond: e.target.value }) }),
        h("textarea", { className: "textarea", rows: 3, placeholder: "効果", value: spp.effect || "", onChange: (e) => patchSupport(spp.id, { effect: e.target.value }) }),
        h("input", { className: "input", placeholder: "LP", value: spp.lp || "", onChange: (e) => patchSupport(spp.id, { lp: e.target.value }) })
      ) : h(React.Fragment, null,
        h("div", { style: { fontFamily: "var(--f-display)", fontWeight: 600, fontSize: "var(--fs-13)", color: "var(--tx)" } }, spp.name),
        h("div", { style: { fontSize: "var(--fs-11)" } }, h(CondChips, { cond: spp.cond })),
        h("div", { style: { fontSize: "var(--fs-11)", color: "var(--tx-2)", lineHeight: 1.4, marginTop: 4, whiteSpace: "pre-wrap" } }, spp.effect),
        h("div", { style: { marginTop: "auto", paddingTop: 4, display: "flex", alignItems: "center", gap: 8, fontSize: "var(--fs-10)", color: "var(--gold)" } },
          h("span", null, "LP ", spp.lp),
          editable && h(Button, { variant: "ghost", size: "sm", icon: "edit", onClick: () => toggleSupportEditing(spp.id) }, "この枠を編集")
        )
      )
    ) : h(React.Fragment, null,
      h("div", { className: "spp-slot-idx" }, "スロット ", i + 1),
      h("div", { style: { color: "var(--tx-mute)", fontStyle: "italic", fontSize: "var(--fs-12)" } }, "下の一覧から装備")
    )
  );
  const renderDeathSlot = () => h(
    "div",
    { style: { marginTop: "var(--s-3)" } },
    h(
      "div",
      { className: "t-label", style: { marginBottom: "var(--s-2)", color: "var(--warn)", display: "flex", alignItems: "center", gap: 8 } },
      "死亡後専用サポートパッシブ",
      h("div", { style: { flex: 1 } }),
      h(Button, { variant: "ghost", size: "sm", icon: "plus", disabled: !editable, onClick: addCustomDeathSupport, title: editable ? "死亡後専用サポートを手動追加" : "編集モード時のみ追加可能" }, "手動追加")
    ),
    h(
      "div",
      { className: `spp-slot${deathSupport ? " is-filled" : ""}`, style: { minHeight: 120 } },
      deathSupport ? h(React.Fragment, null,
        h("button", { className: "rm", onClick: () => dispatch({ type: "SET_DEATH_SUPPORT", spp: null }), title: "外す" }, h(Icon, { name: "x", size: 12 })),
        h("div", { className: "spp-slot-idx", style: { color: "var(--warn)" } }, "死亡後スロット"),
        isSupportEditing(deathSupport.id) ? h(React.Fragment, null,
          h("div", { className: "manual-edit-row" },
            h("span", { className: "manual-edit-badge is-warn" }, "手動編集中"),
            h(Button, { variant: "ghost", size: "sm", icon: "eye", onClick: () => toggleSupportEditing(deathSupport.id) }, "表示へ戻す")
          ),
          h("input", { className: "input", placeholder: "死亡後専用サポート名", value: deathSupport.name || "", onChange: (e) => patchDeathSupport({ name: e.target.value }) }),
          h("input", { className: "input", placeholder: "発動条件", value: deathSupport.cond || "", onChange: (e) => patchDeathSupport({ cond: e.target.value }) }),
          h("textarea", { className: "textarea", rows: 3, placeholder: "効果", value: deathSupport.effect || "", onChange: (e) => patchDeathSupport({ effect: e.target.value }) }),
          h("input", { className: "input", placeholder: "LP", value: deathSupport.lp || "", onChange: (e) => patchDeathSupport({ lp: e.target.value }) })
        ) : h(React.Fragment, null,
          h("div", { style: { fontFamily: "var(--f-display)", fontWeight: 600, fontSize: "var(--fs-13)", color: "var(--tx)" } }, deathSupport.name),
          h("div", { style: { fontSize: "var(--fs-11)" } }, h(CondChips, { cond: deathSupport.cond })),
          h("div", { style: { fontSize: "var(--fs-11)", color: "var(--tx-2)", lineHeight: 1.4, marginTop: 4, whiteSpace: "pre-wrap" } }, deathSupport.effect),
          h("div", { style: { marginTop: "auto", paddingTop: 4, display: "flex", alignItems: "center", gap: 8, fontSize: "var(--fs-10)", color: "var(--gold)" } },
            h("span", null, "LP ", deathSupport.lp),
            editable && h(Button, { variant: "ghost", size: "sm", icon: "edit", onClick: () => toggleSupportEditing(deathSupport.id) }, "この枠を編集")
          )
        )
      ) : h(React.Fragment, null,
        h("div", { className: "spp-slot-idx", style: { color: "var(--warn)" } }, "死亡後スロット"),
        h("div", { style: { color: "var(--tx-mute)", fontStyle: "italic", fontSize: "var(--fs-12)" } }, "下の死亡後専用一覧から選択")
      )
    )
  );
  return h(
    "div",
    { className: "stack-4" },
    h(
      "div",
      null,
      h(
        "div",
        { className: "t-label", style: { marginBottom: "var(--s-2)", display: "flex", alignItems: "center", gap: 8 } },
        "装備中サポートパッシブ (", equipped.length, "/", maxSupports, ") — 左右矢印で順序変更",
        h("div", { style: { flex: 1 } }),
        h(Button, { variant: "ghost", size: "sm", icon: "plus", disabled: !editable || equipped.length >= maxSupports, onClick: addCustomSupport, title: editable ? "手動サポートを追加" : "編集モード時のみ追加可能" }, "手動追加")
      ),
      h("div", { className: "spp-slots", style: { gridTemplateColumns: `repeat(${maxSupports}, 1fr)` } }, ...Array.from({ length: maxSupports }, (_, i) => renderSupportSlot(equipped[i], i))),
      hasDeathSlot ? renderDeathSlot() : null
    ),
    h(
      "div",
      { className: "codex" },
      h(
        "div",
        { className: "codex-main" },
        h(
          "div",
          { className: "codex-filters" },
          h("div", { className: "codex-filter-row" }, h("div", { className: "codex-search" }, h(Icon, { name: "search", size: 14 }), h("input", { type: "text", placeholder: "サポートパッシブ名・条件・効果で検索...", value: query, onChange: (e) => setQuery(e.target.value) })), h("div", { className: "codex-count" }, h("strong", null, visibleCount), " / ", visibleTotal)),
          h("div", { className: "segmented support-catalog-mode", role: "tablist", "aria-label": "サポート候補の種類" },
            h("button", { className: catalogMode === "standard" ? "is-active" : "", onClick: () => setCatalogMode("standard"), role: "tab", "aria-selected": catalogMode === "standard" }, "通常"),
            h("button", { className: catalogMode === "death" ? "is-active" : "", onClick: () => setCatalogMode("death"), role: "tab", "aria-selected": catalogMode === "death" }, "死亡後専用"),
            h("button", { className: catalogMode === "all" ? "is-active" : "", onClick: () => setCatalogMode("all"), role: "tab", "aria-selected": catalogMode === "all" }, "すべて")
          ),
          h("div", { className: "codex-filter-row", style: { gap: 8 } }, h("select", { className: "select", value: sinFilter, onChange: (e) => setSinFilter(e.target.value), style: { flex: 1, minWidth: 0 } }, h("option", { value: "" }, "全大罪"), ...SIN_LIST.map((s) => h("option", { key: s, value: s }, s))), h("select", { className: "select", value: lpFilter, onChange: (e) => setLpFilter(e.target.value), style: { flex: 1, minWidth: 0 } }, h("option", { value: "" }, "全LP帯"), h("option", { value: "lt20" }, "LP 20未満"), h("option", { value: "20-49" }, "LP 20-49"), h("option", { value: "50-99" }, "LP 50-99"), h("option", { value: "gte100" }, "LP 100以上"))),
          h(SourceFilterRow, { h, kind: "サポートパッシブ", value: sourceFilter, onChange: setSourceFilter }),
          visibleStandard.length || catalogMode === "standard" || catalogMode === "all" ? h(React.Fragment, null, h("div", { className: "t-label", style: { marginBottom: 6 } }, catalogMode === "all" ? "通常スロット用" : "通常スロット用"), renderList(visibleStandard, "standard")) : null,
          (visibleDeath.length || catalogMode === "death" || catalogMode === "all") ? h(React.Fragment, null, h("div", { className: "t-label", style: { marginTop: visibleStandard.length ? "var(--s-3)" : 0, marginBottom: 6, color: "var(--warn)" } }, "死亡後専用スロット候補", !hasDeathSlot ? "（未開放：閲覧のみ）" : ""), renderList(visibleDeath, "death")) : null
        ),
        selected ? h("div", { className: "codex-detail" }, h("div", { className: "detail-head", style: { "--sin-primary": selectedIsDeath ? "var(--warn)" : "var(--gold)" } }, h("div", { className: "detail-eyebrow" }, h("span", { className: "detail-num" }, "LP ", selected.lp), h("span", { className: "detail-type" }, selectedIsDeath ? "DEATH SUPPORT PASSIVE / 死亡後専用" : "SUPPORT PASSIVE / サポートパッシブ")), h("div", { className: "detail-name" }, selected.name), h("div", { className: "cond-chips-lg", style: { marginTop: "var(--s-2)", display: "flex", alignItems: "center", gap: 6 } }, h("span", { style: { fontSize: "var(--fs-10)", color: "var(--tx-mute)", fontFamily: "var(--f-display)", letterSpacing: "0.12em" } }, "発動条件"), h(CondChips, { cond: selected.cond }))), h("div", { className: "detail-body" }, h("div", null, h("div", { className: "detail-section-title" }, "効果"), h("div", { className: "detail-passive" }, h("div", { className: "detail-passive-effect", style: { whiteSpace: "pre-wrap" } }, selected.effect))), h("div", { className: "detail-actions" }, selectedIsDeath ? (deathSupport?.name === selected.name ? h(Button, { variant: "ghost", size: "sm", onClick: () => dispatch({ type: "SET_DEATH_SUPPORT", spp: null }), icon: "x" }, "死亡後スロットから外す") : h(Button, { variant: "primary", onClick: () => tryEquip(selected, "death"), icon: "check", disabled: !hasDeathSlot }, "死亡後スロットへ装備")) : (isEquipped(selected.name) ? h("div", { style: { fontSize: "var(--fs-10)", color: "var(--gold)", textAlign: "center", fontFamily: "var(--f-display)", letterSpacing: "0.16em", textTransform: "uppercase" } }, "★ 装備中") : h(Button, { variant: "primary", onClick: () => tryEquip(selected, "standard"), icon: "check" }, "通常スロットへ装備"))))) : h("div", { className: "codex-detail" }, h("div", { className: "detail-empty" }, h("div", { className: "detail-empty-icon" }, "◇"), h("div", { className: "t-label" }, "サポートパッシブを選択"), h("div", { style: { fontSize: "var(--fs-11)", color: "var(--tx-mute)", marginTop: 8 } }, hasDeathSlot ? "通常スロット用と死亡後専用候補を分けて表示しています。" : "一覧から選択すると詳細が表示されます。", h("br", null), "ダブルクリックで装備。")))
      )
    )
  );
};
const EGO_RANKS = ["ZAYIN", "TETH", "HE", "WAW", "ALEPH"];
function cloneEgoForManualEdit(ego) {
  return JSON.parse(JSON.stringify(ego || {}));
}
function normalizeEgoDice(d) {
  const dval = d?.dval ?? d?.d ?? "";
  return {
    roll: d?.roll || "",
    dval,
    // 旧形式を読むための互換値。新規編集は dval / dPlus / dCnt を正準にする。
    d: d?.d ?? dval,
    plus: !!(d?.plus ?? d?.dPlus),
    dPlus: !!(d?.dPlus ?? d?.plus),
    dCnt: !!d?.dCnt,
    effect: d?.effect || ""
  };
}
function cloneEgoDiceList(skill) {
  const raw = Array.isArray(skill?.dice) && skill.dice.length ? skill.dice
    : Array.isArray(skill?.dices) && skill.dices.length ? skill.dices : [];
  return raw.map(normalizeEgoDice);
}
function ensureSkillShape(sk) {
  const skill = sk || {};
  return {
    // Rendering must never create a new random key. Random IDs here remount
    // controlled inputs on every keystroke and make mobile editing fragile.
    id: skill.id || "",
    name: skill.name || "",
    rank: skill.rank || "",
    type: skill.type || "打撃",
    attr: skill.attr || "",
    sin: skill.sin || "",
    aoe: skill.aoe || "",
    aoeCount: skill.aoeCount || "",
    cost: skill.cost || "",
    cond: skill.cond || "",
    effect: skill.effect || "",
    quick: skill.quick || "",
    notes: skill.notes || "",
    kind: skill.kind || "スキル",
    dPlus: !!skill.dPlus,
    dCnt: !!skill.dCnt,
    dPlusLabel: skill.dPlusLabel || "",
    dCntLabel: skill.dCntLabel || "",
    dVarPlace: skill.dVarPlace || "status",
    dice: cloneEgoDiceList(skill)
  };
}
const EGO_SKILL_KINDS = ["スキル", "同化", "影響"];
const EgoSkillEditor = ({ title, kind, skill, onPatch, onAddDice, onPatchDice, onRemoveDice, onRemove, subSkills = [], onAddSubSkill, onPatchSubSkill, onRemoveSubSkill, hideKindSelect = false }) => {
  const sk = ensureSkillShape({ ...skill, kind: skill?.kind || kind });
  const rankNum = String(sk.rank || title || "EGO").replace(/[^0-9-]/g, "") || "EGO";
  const [activeSubIdx, setActiveSubIdx] = React.useState(0);

  const renderStandardFields = () => React.createElement(React.Fragment, null,
    React.createElement(Grid, { cols: 2 },
      React.createElement(Field, { label: "名称" }, React.createElement("input", { className: "input", value: sk.name, onChange: (e) => onPatch({ name: e.target.value }), placeholder: "E.G.Oスキル名" })),
      React.createElement(Field, { label: "ランク／表示名" }, React.createElement("input", { className: "input", value: sk.rank, onChange: (e) => onPatch({ rank: e.target.value }), placeholder: title })),
      React.createElement(Field, { label: "属性" }, React.createElement("select", { className: "select", value: sk.type, onChange: (e) => onPatch({ type: e.target.value }) },
        SKILL_TYPES.map((t) => React.createElement("option", { key: t, value: t }, t)))),
      React.createElement(Field, { label: "罪悪" }, React.createElement("select", { className: "select", value: sk.sin, onChange: (e) => onPatch({ sin: e.target.value }) },
        React.createElement("option", { value: "" }, "-"), SKILL_SINS.map((t) => React.createElement("option", { key: t, value: t }, t)))),
      React.createElement(Field, { label: "攻撃レベル／補足" }, React.createElement("input", { className: "input", value: sk.attr, onChange: (e) => onPatch({ attr: e.target.value }), placeholder: "例：10d2 の補足" })),
      React.createElement(Field, { label: "広域" }, React.createElement("div", { className: "ego-aoe-field" },
        React.createElement("select", { className: "select", value: sk.aoe, onChange: (e) => onPatch({ aoe: e.target.value }) },
          React.createElement("option", { value: "" }, "単体"), SKILL_AOES.map((t) => React.createElement("option", { key: t, value: t }, t))),
        React.createElement("input", { className: "input", value: sk.aoeCount, onChange: (e) => onPatch({ aoeCount: e.target.value }), placeholder: "人数" }))),
      React.createElement(Field, { label: "コスト" }, React.createElement("input", { className: "input", value: sk.cost, onChange: (e) => onPatch({ cost: e.target.value }), placeholder: "SAN／資源" }))
    ),
    React.createElement(Field, { label: "発動条件" }, React.createElement(AutoTextarea, { className: "textarea", minRows: 2, value: sk.cond, onChange: (e) => onPatch({ cond: e.target.value }), placeholder: "例：自分がクイック状態" })),
    React.createElement(Field, { label: "効果" }, React.createElement(AutoTextarea, { className: "textarea", minRows: 4, value: sk.effect, onChange: (e) => onPatch({ effect: e.target.value }), placeholder: "使用時／マッチ勝利時などの効果" })),
    React.createElement(Field, { label: "クイックコマンド（任意）" }, React.createElement("input", { className: "input", value: sk.quick, onChange: (e) => onPatch({ quick: e.target.value }), placeholder: ":バリア+1 :クイック+1", style: { fontFamily: "var(--f-mono)" } })),
    React.createElement(SkillVariancePanel, { skill: sk, onPatch }),
    React.createElement("div", { className: "stack-2" },
      React.createElement("label", { className: "field-label" }, "ダイス（何個でも追加可能）"),
      React.createElement("div", { className: "deck-dice" },
        (sk.dice || []).map((d, i) => React.createElement(DiceRow, { key: d.id || `${rankNum}-dice-${i}`, dice: d, idx: i, skillRankNum: rankNum, onPatch: (patch) => onPatchDice(i, patch), onRemove: () => onRemoveDice(i) })),
        React.createElement("button", { className: "deck-add-dice", onClick: onAddDice, type: "button" }, "+ ダイスを追加")
      )
    )
  );

  const renderAssimilationManager = () => {
    const activeSub = ensureSkillShape(subSkills[activeSubIdx] || {});
    return React.createElement("div", { className: "ego-assim-manager" },
      React.createElement("div", { className: "ego-assim-tabs" },
        subSkills.map((s, i) => React.createElement("button", { key: i, className: `ego-assim-tab${i === activeSubIdx ? " is-active" : ""}`, onClick: () => setActiveSubIdx(i) }, `S${i + 1}: ${s.name || "(未設定)"}`)),
        React.createElement("button", { className: "ego-assim-tab-add", onClick: onAddSubSkill }, "+ 追加")
      ),
      activeSub && React.createElement("div", { className: "ego-assim-sub-editor stack-3", style: { padding: "var(--s-3)", background: "var(--surface-inset)", borderRadius: "var(--r)" } },
        React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
          React.createElement("span", { className: "t-label" }, `SUB SKILL S${activeSubIdx + 1} 編集`),
          React.createElement(Button, { variant: "ghost", size: "xs", icon: "trash", onClick: () => { onRemoveSubSkill(activeSubIdx); setActiveSubIdx(Math.max(0, activeSubIdx - 1)); } }, "このサブスキルを削除")
        ),
        React.createElement(Grid, { cols: 2 },
          React.createElement(Field, { label: "名称" }, React.createElement("input", { className: "input", value: activeSub.name, onChange: (e) => onPatchSubSkill(activeSubIdx, { name: e.target.value }), placeholder: "サブスキル名" })),
          React.createElement(Field, { label: "属性" }, React.createElement("select", { className: "select", value: activeSub.type, onChange: (e) => onPatchSubSkill(activeSubIdx, { type: e.target.value }) },
            SKILL_TYPES.map((t) => React.createElement("option", { key: t, value: t }, t)))),
          React.createElement(Field, { label: "罪悪" }, React.createElement("select", { className: "select", value: activeSub.sin, onChange: (e) => onPatchSubSkill(activeSubIdx, { sin: e.target.value }) },
            React.createElement("option", { value: "" }, "-"), SKILL_SINS.map((t) => React.createElement("option", { key: t, value: t }, t)))),
          React.createElement(Field, { label: "広域" }, React.createElement("select", { className: "select", value: activeSub.aoe, onChange: (e) => onPatchSubSkill(activeSubIdx, { aoe: e.target.value }) },
            React.createElement("option", { value: "" }, "単体"), SKILL_AOES.map((t) => React.createElement("option", { key: t, value: t }, t))))
        ),
        React.createElement(Field, { label: "効果" }, React.createElement(AutoTextarea, { className: "textarea", minRows: 2, value: activeSub.effect, onChange: (e) => onPatchSubSkill(activeSubIdx, { effect: e.target.value }), placeholder: "サブスキルの効果" })),
        React.createElement("div", { className: "stack-1" },
          React.createElement("label", { className: "field-label" }, "ダイス"),
          (activeSub.dice || []).map((d, i) => React.createElement(DiceRow, { key: `sub-${activeSubIdx}-dice-${i}`, dice: d, idx: i, skillRankNum: `S${activeSubIdx + 1}`, onPatch: (patch) => {
            const nextDice = activeSub.dice.map((old, j) => j === i ? { ...old, ...patch } : old);
            onPatchSubSkill(activeSubIdx, { dice: nextDice });
          }, onRemove: () => {
            const nextDice = activeSub.dice.filter((_, j) => j !== i);
            onPatchSubSkill(activeSubIdx, { dice: nextDice });
          } })),
          React.createElement("button", { className: "deck-add-dice", onClick: () => onPatchSubSkill(activeSubIdx, { dice: [...(activeSub.dice || []), { roll: "", dval: "", d: "", plus: false, dPlus: false, dCnt: false, effect: "" }] }) }, "+ ダイスを追加")
        )
      )
    );
  };

  return React.createElement(Card, { title, sub: "選択中の詳細編集", compact: true, className: "ego-editor-detail" },
    React.createElement("div", { className: "stack-3 ego-skill-editor" },
      React.createElement("div", { className: "ego-editor-toolbar" },
        React.createElement("span", { className: "t-label" }, "EGO SKILL / 編集対象"),
        !hideKindSelect && React.createElement("select", { className: "select ego-kind-select", value: sk.kind, onChange: (e) => onPatch({ kind: e.target.value }), title: "スキルの区分", "aria-label": "スキルの区分" },
          EGO_SKILL_KINDS.map((k) => React.createElement("option", { key: k, value: k }, k))),
        onRemove && React.createElement(Button, { variant: "ghost", size: "sm", icon: "trash", onClick: onRemove }, "削除")
      ),
      sk.kind === "同化" ? renderAssimilationManager() : renderStandardFields()
    )
  );
};
const EGO_VARIANT_OPTIONS = [
  { key: "skill", label: "通常", help: "通常の覚醒／侵蝕E.G.Oスキル" },
  { key: "assimilation", label: "同化", help: "[同化]：新しい戦術スキル群を使う" },
  { key: "influence", label: "影響", help: "[影響]：行動不能になりR進行効果を発動" }
];
const EGO_VARIANT_LABEL = { skill: "通常", assimilation: "同化", influence: "影響" };
const EGO_VARIANT_KIND = { skill: "スキル", assimilation: "同化", influence: "影響" };
const getInfluenceRounds = (effect) => (String(effect || "").match(/\[\s*影響\s*\]\s*(\d+R)?/) || [])[1] || "";
const stripInfluenceHeader = (effect) => String(effect || "").replace(/^\s*\[\s*影響\s*\]\s*(\d+R)?\s*[:：]?\s*/, "").trim();
const makeInfluenceEffect = (rounds, effect) => {
  const label = `[影響]${rounds ? ` ${rounds}` : ""}`;
  const body = stripInfluenceHeader(effect);
  return body ? `${label}：${body}` : label;
};
const getEgoVariantModel = (slot, slotKey) => {
  const normalized = window.LBT_normalizeEgoSlotVariants ? window.LBT_normalizeEgoSlotVariants(slot || {}) : (slot || {});
  const model = normalized.slotVariants?.[slotKey] || { active: "skill", branches: { skill: normalized[slotKey] || {}, assimilation: { skills: [] }, influence: {} } };
  return {
    active: model.active || "skill",
    selectedByUser: model.selectedByUser === true,
    branches: {
      skill: ensureSkillShape({ ...(model.branches?.skill || {}), kind: "スキル" }),
      assimilation: { skills: (model.branches?.assimilation?.skills || []).map((s, i) => ensureSkillShape({ ...s, id: s.id || `${slotKey}-assim-${i}`, kind: "同化", originSlot: slotKey })) },
      influence: ensureSkillShape({ ...(model.branches?.influence || {}), kind: "影響" })
    }
  };
};
const EgoSlotVariantEditor = ({ slotKey, label, model, onCommit }) => {
  const variant = model.active;
  const branch = model.branches[variant];
  const updateModel = (recipe) => {
    const next = JSON.parse(JSON.stringify(model));
    recipe(next);
    // 編集後は元データからの再取り込みを止め、選択中の分岐と入力内容を維持する。
    next.selectedByUser = true;
    onCommit(next);
  };
  const setVariant = (nextVariant) => updateModel((next) => { next.active = nextVariant; next.selectedByUser = true; });
  const patchSkill = (patch) => updateModel((next) => { next.branches[variant] = { ...next.branches[variant], ...patch, kind: EGO_VARIANT_KIND[variant] }; });
  const patchDice = (diceIdx, patch) => updateModel((next) => {
    const list = next.branches[variant].dice || [];
    next.branches[variant].dice = list.map((d, i) => i === diceIdx ? { ...d, ...patch } : d);
  });
  const addDice = () => updateModel((next) => {
    const list = next.branches[variant].dice || [];
    next.branches[variant].dice = [...list, { roll: "", dval: "", d: "", plus: false, dPlus: false, dCnt: false, effect: "" }];
  });
  const removeDice = (diceIdx) => updateModel((next) => {
    const list = next.branches[variant].dice || [];
    next.branches[variant].dice = list.filter((_, i) => i !== diceIdx);
  });
  const subSkills = branch.skills || [];
  const renderStandard = (kindLabel) => React.createElement(EgoSkillEditor, {
    title: `${label}スキル`,
    kind: EGO_VARIANT_KIND[variant],
    skill: branch,
    onPatch: patchSkill,
    onAddDice: addDice,
    onPatchDice: patchDice,
    onRemoveDice: removeDice,
    hideKindSelect: true
  });
  const renderAssimilation = () => {
    const patchSub = (subIdx, patch) => updateModel((next) => {
      const list = next.branches.assimilation.skills || [];
      next.branches.assimilation.skills = list.map((skill, i) => i === subIdx ? { ...skill, ...patch, kind: "同化", originSlot: slotKey } : skill);
    });
    const addSub = () => updateModel((next) => {
      const list = next.branches.assimilation.skills || [];
      next.branches.assimilation.skills = [...list, { id: `${slotKey}-assim-${Date.now()}`, name: "", rank: `S${list.length + 1}`, attr: "", type: "斬撃", sin: "", aoe: "", effect: "", dice: [], kind: "同化", originSlot: slotKey }];
    });
    const removeSub = (subIdx) => updateModel((next) => {
      const list = next.branches.assimilation.skills || [];
      next.branches.assimilation.skills = list.filter((_, i) => i !== subIdx);
    });
    const patchDiceSub = (subIdx, diceIdx, patch) => {
      const skill = ensureSkillShape(subSkills[subIdx] || { kind: "同化" });
      patchSub(subIdx, { dice: (skill.dice || []).map((die, i) => i === diceIdx ? { ...die, ...patch } : die) });
    };
    const removeDiceSub = (subIdx, diceIdx) => {
      const skill = ensureSkillShape(subSkills[subIdx] || { kind: "同化" });
      patchSub(subIdx, { dice: (skill.dice || []).filter((_, i) => i !== diceIdx) });
    };
    const addDiceSub = (subIdx) => {
      const skill = ensureSkillShape(subSkills[subIdx] || { kind: "同化" });
      patchSub(subIdx, { dice: [...(skill.dice || []), { roll: "", dval: "", d: "", plus: false, dPlus: false, dCnt: false, effect: "" }] });
    };
    const renderDirectSkillCard = (skill, index) => {
      const current = ensureSkillShape(skill || { kind: "同化" });
      const rank = current.rank || `S${index + 1}`;
      return React.createElement("article", { key: current.id || `${slotKey}-direct-${index}`, className: "ego-assim-direct-card", "data-sin": current.sin || "", "aria-label": `同化 ${rank} ${current.name || "名称未設定"}の直接編集` },
        React.createElement("div", { className: "ego-assim-direct-card-head" },
          React.createElement("span", { className: "ego-assim-card-index" }, rank),
          React.createElement("span", { className: "ego-assim-card-copy" }, "同化スキル"),
          React.createElement("span", { className: "ego-assim-card-origin" }, `${label}由来`),
          React.createElement(Button, { variant: "ghost", size: "sm", icon: "trash", className: "ego-assim-direct-delete", onClick: () => removeSub(index), title: `${rank}を削除` }, "削除")
        ),
        React.createElement(Grid, { cols: 2, className: "ego-assim-direct-name-grid" },
          React.createElement(Field, { label: "名称" },
            React.createElement("input", { className: "input", value: current.name || "", onChange: (e) => patchSub(index, { name: e.target.value }), placeholder: "例：暴力性" })),
          React.createElement(Field, { label: "S番号／表示名" },
            React.createElement("input", { className: "input", value: current.rank || "", onChange: (e) => patchSub(index, { rank: e.target.value }), placeholder: `S${index + 1}` }))
        ),
        React.createElement(Grid, { cols: 3, className: "ego-assim-direct-meta-grid" },
          React.createElement(Field, { label: "属性" },
            React.createElement("select", { className: "select", value: current.type || "", onChange: (e) => patchSub(index, { type: e.target.value }) },
              React.createElement("option", { value: "" }, "未設定"),
              SKILL_TYPES.map((type) => React.createElement("option", { key: type, value: type }, type)))),
          React.createElement(Field, { label: "罪悪" },
            React.createElement("select", { className: "select", value: current.sin || "", onChange: (e) => patchSub(index, { sin: e.target.value }) },
              React.createElement("option", { value: "" }, "未設定"),
              SKILL_SINS.map((sin) => React.createElement("option", { key: sin, value: sin }, sin)))),
          React.createElement(Field, { label: "広域" },
            React.createElement("select", { className: "select", value: current.aoe || "", onChange: (e) => patchSub(index, { aoe: e.target.value }) },
              React.createElement("option", { value: "" }, "単体"),
              SKILL_AOES.map((aoe) => React.createElement("option", { key: aoe, value: aoe }, aoe))))
        ),
        React.createElement(Field, { label: "使用時などの効果（ダイスより先）", className: "ego-assim-direct-effect" },
          React.createElement(AutoTextarea, { className: "textarea", minRows: 3, value: current.effect || "", onChange: (e) => patchSub(index, { effect: e.target.value }), placeholder: "使用時／マッチ勝利時などの効果" })),
        React.createElement("div", { className: "ego-assim-direct-dice stack-2" },
          React.createElement("label", { className: "field-label" }, "ダイス（何個でも追加可能）"),
          React.createElement("div", { className: "deck-dice" },
            (current.dice || []).map((die, diceIdx) => React.createElement(DiceRow, {
              key: die.id || `assim-${index}-dice-${diceIdx}`,
              dice: die,
              idx: diceIdx,
              skillRankNum: rank,
              onPatch: (patch) => patchDiceSub(index, diceIdx, patch),
              onRemove: () => removeDiceSub(index, diceIdx)
            })),
            React.createElement("button", { className: "deck-add-dice", type: "button", onClick: () => addDiceSub(index) }, "+ ダイスを追加")
          )
        )
      );
    };

    return React.createElement("div", { className: "ego-assim-manager ego-assim-direct-manager", "data-ego-variant": "assimilation" },
      React.createElement("div", { className: "ego-assim-explainer" },
        "[同化]は、元のHP・SAN・耐性・戦術0・パッシブを引き継いだ上で、以下の戦術スキル群を使用します。各スキルカードをその場で編集でき、使用時などの効果はダイスより先に入力します。"
      ),
      subSkills.length === 0
        ? React.createElement("div", { className: "empty ego-assim-empty" },
            "この形態には同化スキルが登録されていません。手動で作成する場合のみ、下のボタンから1件目を作成してください。",
            React.createElement(Button, { size: "sm", icon: "plus", onClick: addSub, style: { marginTop: 8 } }, "同化スキルを作成")
          )
        : React.createElement("div", { className: "ego-assim-direct-list", "aria-label": "同化スキルの直接編集" },
            subSkills.map(renderDirectSkillCard)
          ),
      subSkills.length > 0 && React.createElement(Button, { size: "sm", icon: "plus", className: "ego-assim-direct-add", onClick: addSub }, "同化スキルを追加")
    );
  };

  const renderInfluence = () => {
    const rounds = getInfluenceRounds(branch.effect);
    return React.createElement(Card, { title: `${label}E.G.Oスキル [影響]`, sub: "R進行効果（攻撃属性・罪悪・ダイスは使用しない）", compact: true, className: "ego-editor-detail ego-influence-editor" },
      React.createElement("div", { className: "stack-3" },
        React.createElement("div", { className: "ego-influence-note" }, "影響はこのスロットを置き換えるラウンド進行効果です。属性・罪悪・広域・ダイスを入力しません。"),
        React.createElement(Field, { label: "継続ラウンド（任意）" }, React.createElement("input", { className: "input", value: rounds, onChange: (e) => patchSkill({ effect: makeInfluenceEffect(e.target.value.trim(), branch.effect) }), placeholder: "例：2R", inputMode: "text" })),
        React.createElement(Field, { label: "ラウンド効果" }, React.createElement(AutoTextarea, { className: "textarea", minRows: 4, value: stripInfluenceHeader(branch.effect), onChange: (e) => patchSkill({ effect: makeInfluenceEffect(rounds, e.target.value) }), placeholder: "例：1R：… 2R：… 3R：…" })),
        React.createElement("div", { className: "ego-influence-preview", style: { whiteSpace: "pre-wrap" } }, window.formatEffectLines ? window.formatEffectLines(branch.effect) : branch.effect)
      )
    );
  };
  return React.createElement("section", { className: "ego-slot-variant", "aria-label": `${label}E.G.Oスキルの形態編集` },
    React.createElement("div", { className: "ego-slot-variant-head" },
      React.createElement("div", null, React.createElement("div", { className: "ego-panel-kicker" }, label === "覚醒" ? "01 / AWAKENING" : "02 / CORROSION"), React.createElement("div", { className: "ego-panel-title" }, `${label}E.G.Oスキル`)),
      React.createElement("span", { className: "ego-active-help" }, variant === "assimilation" ? "各スキルカードをこの場で直接編集します。効果はダイスより先に入力します" : model.selectedByUser ? "選択した形態を編集中。ほかの形態の下書きは保持されます" : "原データの形態を表示中。選ぶと編集形態を切り替えます")
    ),
    React.createElement("div", { className: "ego-variant-choice", role: "group", "aria-label": `${label}E.G.Oスキルの形態` }, EGO_VARIANT_OPTIONS.map((option) => React.createElement("button", { key: option.key, type: "button", className: `ego-variant-option${variant === option.key ? " is-active" : ""}`, onClick: () => setVariant(option.key), "aria-pressed": variant === option.key }, React.createElement("b", null, option.label), React.createElement("span", null, option.help)))),
    React.createElement("div", { className: "ego-variant-status" }, `現在の形態: ${EGO_VARIANT_LABEL[variant]}`),
    variant === "assimilation" ? renderAssimilation() : variant === "influence" ? renderInfluence() : renderStandard(EGO_VARIANT_LABEL[variant])
  );
};
const EgoSkillSummary = ({ entry, active, onSelect }) => {
  const sk = ensureSkillShape(entry.skill);
  const diceCount = sk.dice?.length || 0;
  const labels = [sk.kind || entry.kind, (sk.kind || entry.kind) === "同化" ? sk.attr : sk.type, sk.sin].filter(Boolean);
  const summary = sk.effect || sk.cond || "未入力のスキル";
  const branchSummary = entry.branchSummary || "";
  return React.createElement("button", { type: "button", className: `ego-skill-summary${active ? " is-active" : ""}`, onClick: onSelect, "aria-pressed": active, "aria-label": `${entry.label}を編集` },
    React.createElement("span", { className: "ego-skill-summary-index" }, entry.index),
    React.createElement("span", { className: "ego-skill-summary-main" }, React.createElement("span", { className: "ego-skill-summary-title" }, sk.name || entry.label), React.createElement("span", { className: "ego-skill-summary-meta" }, labels.map((item, i) => React.createElement("span", { key: `${item}-${i}`, className: `ego-meta-chip${item === sk.sin ? " is-sin" : ""}` }, item)), React.createElement("span", { className: "ego-meta-chip is-dice" }, `${diceCount}ダイス`)), React.createElement("span", { className: "ego-skill-summary-effect" }, summary), branchSummary && React.createElement("span", { className: "ego-skill-summary-branches" }, branchSummary)), React.createElement("span", { className: "ego-skill-summary-arrow", "aria-hidden": true }, active ? "編集中" : "›")
  );
};
const EgoReadOnlySkill = ({ skill, label, className = "" }) => {
  const h = React.createElement;
  const sk = ensureSkillShape(skill);
  const fmt = (value) => window.formatEffectLines ? window.formatEffectLines(value) : value || "";
  const dice = sk.dice || [];
  return h("div", { className: `ego-connected-read ${className}` },
    h("div", { className: "ego-connected-read-head" },
      h("span", { className: "ego-connected-read-label" }, label),
      sk.attr || sk.type ? h("span", { className: "ego-meta-chip" }, sk.attr || sk.type) : null,
      sk.sin ? h("span", { className: "ego-meta-chip is-sin" }, sk.sin) : null,
      sk.aoe ? h("span", { className: "ego-meta-chip" }, sk.aoe) : null
    ),
    sk.name ? h("div", { className: "ego-connected-read-name" }, sk.name) : null,
    dice.length ? h("div", { className: "ego-connected-rolls", "aria-label": `${label}のダイス` }, dice.map((die, index) => h("div", { key: `${label}-roll-${index}`, className: "ego-connected-roll" },
      h("span", { className: "ego-connected-roll-index" }, index + 1),
      h("strong", null, die.roll || "—"),
      die.effect ? h("span", null, fmt(die.effect)) : h("span", { className: "ego-connected-empty" }, "効果なし")
    ))) : h("div", { className: "ego-connected-empty" }, "ダイスなし"),
    sk.effect ? h("div", { className: "ego-connected-effect" }, fmt(sk.effect)) : null
  );
};
const EquippedEgoEditor = ({ rank, ego, dispatch }) => {
  const h = React.createElement;
  const slot = ego || {};
  const models = { kakusei: getEgoVariantModel(slot, "kakusei"), shinshoku: getEgoVariantModel(slot, "shinshoku") };
  const setSlot = (patch) => dispatch({ type: "PATCH_EGO_SLOT", rank, patch });
  const commitModel = (slotKey, model) => {
    const nextVariants = JSON.parse(JSON.stringify(slot.slotVariants || {}));
    nextVariants[slotKey] = model;
    setSlot({ slotVariants: nextVariants });
  };
  const activeForm = (model) => EGO_VARIANT_LABEL[model.active] || "通常";
  const formSummary = [
    `覚醒：${activeForm(models.kakusei)}`,
    `侵蝕：${activeForm(models.shinshoku)}`
  ].join(" · ");
  return h(Card, { title: `${rank} E.G.O`, sub: "解析・手動編集", compact: true, className: "ego-variant-workbench" },
    h("div", { className: "stack-4 ego-editor" },
      h("div", { className: "ego-overview-panel" },
        h("div", { className: "ego-overview-copy" },
          h("div", { className: "ego-overview-eyebrow" }, "E.G.O EDITOR / 直接編集"),
          h("div", { className: "ego-overview-name" }, slot.name || "名称未設定"),
          h("div", { className: "ego-overview-meta" }, `${slot.rank || rank} · ${formSummary}`)
        ),
        h("div", { className: "ego-overview-state" }, h("span", { className: "ego-live-dot" }), "変更は即時反映")
      ),
      h("section", { className: "ego-connected-passive" },
        h("div", { className: "ego-panel-heading" }, h("div", null, h("div", { className: "ego-panel-kicker" }, "PASSIVE"), h("div", { className: "ego-panel-title" }, "E.G.Oパッシブ"))),
        h("div", { className: "ego-passive-grid" },
          h(Field, { label: "パッシブ名" }, h("input", { className: "input", value: slot.passive_name || "", onChange: (event) => setSlot({ passive_name: event.target.value }) })),
          h(Field, { label: "発動条件" }, h("input", { className: "input", value: slot.passive_cond || "", onChange: (event) => setSlot({ passive_cond: event.target.value }) })),
          h(Field, { label: "効果" }, h(AutoTextarea, { className: "textarea", minRows: 2, value: slot.passive_effect || "", onChange: (event) => setSlot({ passive_effect: event.target.value }) }))
        )
      ),
      h("div", { className: "ego-variant-stack" },
        h(EgoSlotVariantEditor, { slotKey: "kakusei", label: "覚醒", model: models.kakusei, onCommit: (model) => commitModel("kakusei", model) }),
        h(EgoSlotVariantEditor, { slotKey: "shinshoku", label: "侵蝕", model: models.shinshoku, onCommit: (model) => commitModel("shinshoku", model) })
      ),
      h("div", { className: "ego-editor-footer" },
        h("span", null, "覚醒・侵蝕それぞれで、通常・同化・影響の扱いを選べます。選択した形態に必要な入力欄だけを表示します。"),
        h(Button, { variant: "ghost", size: "sm", icon: "edit", onClick: () => dispatch({ type: "SET_EGO_SLOT", rank, value: cloneEgoForManualEdit(slot) }) }, "既定データを再読込")
      )
    )
  );
};
const EgoDetail = ({ ego, equipTo, currentSlot, onEquip, onUnequip, isOwned, onToggleOwned, dispatch }) => {
  const isManual = !!(ego && ego.__manual);
  const [open, setOpen] = React.useState(!isManual);
  React.useEffect(() => {
    if (isManual) setOpen(false);
  }, [isManual]);
  if (!ego) return /* @__PURE__ */ React.createElement("div", { className: "codex-detail" }, /* @__PURE__ */ React.createElement("div", { className: "detail-empty" }, /* @__PURE__ */ React.createElement("div", { className: "detail-empty-icon" }, "\u25C8"), /* @__PURE__ */ React.createElement("div", { className: "t-label" }, "\u5DE6\u306EEGO\u3092\u9078\u629E"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-11)", color: "var(--tx-mute)", marginTop: 8 } }, "EGO\u3092\u9078\u629E\u3059\u308B\u3068\u8A73\u7D30\u304C\u8868\u793A\u3055\u308C\u307E\u3059\u3002", /* @__PURE__ */ React.createElement("br", null), "\u30C0\u30D6\u30EB\u30AF\u30EA\u30C3\u30AF\u3067\u88C5\u5099\u3002")));
  const fmt = (t) => window.formatEffectLines ? window.formatEffectLines(t) : t || "";
  const Skill = ({ label, skill, badge }) => {
    if (!skill || !skill.dice?.length && !skill.effect) return null;
    return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "detail-section-title", style: { display: "flex", alignItems: "center", gap: 6 } }, label, " ", badge && /* @__PURE__ */ React.createElement("span", { className: "badge", style: { marginLeft: "auto", color: label.includes("\u4FB5\u8755") ? "var(--err)" : "var(--ok)" } }, badge)), /* @__PURE__ */ React.createElement("div", { className: "detail-passive", style: { borderLeftColor: label.includes("\u4FB5\u8755") ? "var(--err)" : "var(--gold)" } }, (skill.attr || skill.sin) && /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-10)", fontFamily: "var(--f-mono)", color: "var(--tx-dim)", marginBottom: 4 } }, skill.attr && /* @__PURE__ */ React.createElement("span", null, skill.attr), skill.attr && skill.sin && " \xB7 ", skill.sin && /* @__PURE__ */ React.createElement("span", { style: { color: `var(--sin-${skill.sin}, var(--tx-dim))` } }, skill.sin), skill.aoe && /* @__PURE__ */ React.createElement("span", { style: { marginLeft: 6, padding: "1px 5px", background: "var(--gold-tint)", border: "1px solid var(--gold-line)", borderRadius: 2, color: "var(--gold)" } }, skill.aoe)), skill.effect && /* @__PURE__ */ React.createElement("div", { className: "detail-passive-effect", style: { marginBottom: 6, color: "var(--tx-2)", whiteSpace: "pre-wrap" } }, fmt(skill.effect)), skill.dice?.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "stack-1", style: { marginTop: 4 } }, skill.dice.map((d, i) => /* @__PURE__ */ React.createElement("div", { key: i, style: { display: "flex", gap: 8, fontSize: "var(--fs-11)", padding: "4px 6px", background: "var(--surface-2)", borderRadius: 2 } }, /* @__PURE__ */ React.createElement("span", { style: { fontFamily: "var(--f-mono)", color: "var(--gold-hi)", minWidth: 60, fontWeight: 600 } }, d.roll), /* @__PURE__ */ React.createElement("span", { style: { color: "var(--tx-2)", lineHeight: 1.4, whiteSpace: "pre-wrap" } }, d.effect ? fmt(d.effect) : "\u2014"))))));
  };
  const isAssim = (ego.sub_skills || []).length > 0;
  return /* @__PURE__ */ React.createElement("div", { className: "codex-detail", style: { "--sin-primary": `var(--rank-${ego.rank})` } }, /* @__PURE__ */ React.createElement("div", { className: "detail-head" }, /* @__PURE__ */ React.createElement("div", { className: "detail-eyebrow" }, /* @__PURE__ */ React.createElement("span", { className: "detail-num" }, "No.", String(ego.no).padStart(3, "0")), /* @__PURE__ */ React.createElement("span", { className: "badge", "data-rank": ego.rank, style: { fontSize: 9 } }, ego.rank)), /* @__PURE__ */ React.createElement("div", { className: "detail-name" }, ego.name), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--s-2)" } }, /* @__PURE__ */ React.createElement("div", { style: { padding: "6px 8px", background: "var(--surface-inset)", border: "1px solid var(--line-dim)", borderRadius: "var(--r)" } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--f-display)", fontSize: 9, letterSpacing: "0.14em", color: "var(--tx-mute)", textTransform: "uppercase" } }, "\u6D88\u8CBBSAN"), /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--f-mono)", fontSize: "var(--fs-15)", color: "var(--tx)" } }, ego.san_cost)), /* @__PURE__ */ React.createElement("div", { style: { padding: "6px 8px", background: "var(--surface-inset)", border: "1px solid var(--line-dim)", borderRadius: "var(--r)" } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--f-display)", fontSize: 9, letterSpacing: "0.14em", color: "var(--tx-mute)", textTransform: "uppercase" } }, "\u81EA\u6211\u306E\u6B20\u7247"), /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--f-mono)", fontSize: "var(--fs-15)", color: "var(--tx)" } }, ego.shards))), /* @__PURE__ */ React.createElement("div", { style: { marginTop: "var(--s-2)", fontSize: "var(--fs-11)", color: "var(--tx-dim)", fontFamily: "var(--f-mono)" } }, "\u8CC7\u6E90: ", /* @__PURE__ */ React.createElement("span", { style: { color: "var(--tx-2)" } }, ego.resources))), /* @__PURE__ */ React.createElement("div", { className: "detail-body" }, ego.passive_name && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "detail-section-title" }, "\u30D1\u30C3\u30B7\u30D6"), /* @__PURE__ */ React.createElement("div", { className: "detail-passive" }, /* @__PURE__ */ React.createElement("div", { className: "detail-passive-name" }, ego.passive_name), ego.passive_cond && /* @__PURE__ */ React.createElement("div", { className: "detail-passive-cond cond-chips-lg", style: { display: "flex", alignItems: "center", gap: 6 } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: "var(--fs-10)", color: "var(--tx-mute)" } }, "\u767A\u52D5\u6761\u4EF6"), /* @__PURE__ */ React.createElement(CondChips, { cond: ego.passive_cond })), /* @__PURE__ */ React.createElement("div", { className: "detail-passive-effect", style: { whiteSpace: "pre-wrap" } }, fmt(ego.passive_effect)))), /* @__PURE__ */ React.createElement(Skill, { label: "\u899A\u9192\u30B9\u30AD\u30EB / KAKUSEI", skill: ego.kakusei, badge: "\u899A\u9192" }), isAssim ? /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "detail-section-title", style: { display: "flex", alignItems: "center", gap: 6 } }, /* @__PURE__ */ React.createElement("span", null, "\u4FB5\u8755\u30B9\u30AD\u30EB / SHINSHOKU"), /* @__PURE__ */ React.createElement("span", { className: "ego-doka-badge", style: { marginLeft: "auto" }, title: "\u3053\u306EEGO\u306F\u540C\u5316\u578B" }, "\u25C6 \u540C\u5316")), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-10)", color: "var(--tx-mute)", lineHeight: 1.5, marginTop: -2, marginBottom: 8, fontStyle: "italic", fontFamily: "var(--f-mono)" } }, "\u540C\u5316\u578BEGO\uFF1A\u4FB5\u8755\u30B9\u30AD\u30EB\u305D\u306E\u3082\u306E\u304C\u4E0B\u8A18\u306E\u540C\u5316\u30B9\u30AD\u30EB\u7FA4\u3068\u3057\u3066\u767A\u52D5\u3057\u307E\u3059\u3002"), /* @__PURE__ */ React.createElement("div", { className: "assim-tactical-grid" }, ego.sub_skills.map((s, i) => /* @__PURE__ */ React.createElement("div", { key: i, className: "assim-tactical-card", "data-sin": s.sin || "" }, /* @__PURE__ */ React.createElement("div", { className: "assim-tactical-head" }, /* @__PURE__ */ React.createElement("span", { className: "assim-tactical-idx" }, "S", s.no ?? i + 1), /* @__PURE__ */ React.createElement("span", { className: "assim-tactical-name" }, s.name || "(\u540D\u79F0\u672A\u8A2D\u5B9A)"), s.attr && /* @__PURE__ */ React.createElement("span", { className: "assim-tactical-attr" }, s.attr), s.sin && /* @__PURE__ */ React.createElement("span", { className: "sin-tag", "data-sin": s.sin, style: { fontFamily: "var(--f-display)", fontSize: "var(--fs-10)", padding: "2px 8px", borderRadius: "var(--r-sm)", letterSpacing: "0.06em", fontWeight: 600 } }, s.sin), s.aoe && /* @__PURE__ */ React.createElement("span", { className: "assim-tactical-aoe" }, s.aoe)), s.effect && /* @__PURE__ */ React.createElement("div", { className: "assim-tactical-eff", style: { whiteSpace: "pre-wrap" } }, fmt(s.effect)), (s.dice || []).length > 0 && /* @__PURE__ */ React.createElement("div", { className: "ro-dice-list", style: { marginTop: 6 } }, s.dice.map((d, j) => /* @__PURE__ */ React.createElement("div", { key: j, className: "ro-dice-row" }, /* @__PURE__ */ React.createElement("span", { className: "ro-dice-idx" }, j + 1), /* @__PURE__ */ React.createElement("span", { className: "ro-dice-roll" }, d.roll || "-"), /* @__PURE__ */ React.createElement("span", { className: "ro-dice-eff", style: { whiteSpace: "pre-wrap" } }, d.effect ? fmt(d.effect) : /* @__PURE__ */ React.createElement("span", { style: { color: "var(--tx-mute)", fontStyle: "italic" } }, "\u52B9\u679C\u306A\u3057"))))))))) : /* @__PURE__ */ React.createElement(Skill, { label: "\u4FB5\u8755\u30B9\u30AD\u30EB / SHINSHOKU", skill: ego.shinshoku, badge: "\u4FB5\u8755" }), ego.unique_buff && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "detail-section-title" }, "\u56FA\u6709\u30D0\u30D5"), /* @__PURE__ */ React.createElement("div", { style: { padding: "8px 10px", background: "var(--surface-inset)", borderRadius: "var(--r)", border: "1px solid var(--line-dim)", fontSize: "var(--fs-11)", color: "var(--tx-2)", lineHeight: 1.5 } }, ego.unique_buff))), /* @__PURE__ */ React.createElement("div", { className: "detail-actions" }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-10)", color: "var(--tx-dim)", letterSpacing: "0.12em", textTransform: "uppercase", fontFamily: "var(--f-display)", marginBottom: 4 } }, equipTo === ego.rank ? `\u2192 ${ego.rank} \u30B9\u30ED\u30C3\u30C8\u3078\u88C5\u5099` : `\u2192 ${ego.rank} \u30B9\u30ED\u30C3\u30C8\u3078\u88C5\u5099`), currentSlot ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-10)", color: "var(--gold)", textAlign: "center", fontFamily: "var(--f-display)", letterSpacing: "0.16em", textTransform: "uppercase" } }, "\u2605 \u73FE\u5728 ", currentSlot, " \u306B\u88C5\u5099\u4E2D"), /* @__PURE__ */ React.createElement(Button, { variant: "ghost", size: "sm", onClick: onUnequip, icon: "x" }, "\u88C5\u5099\u89E3\u9664")) : /* @__PURE__ */ React.createElement(Button, { variant: "primary", onClick: onEquip, icon: "check" }, ego.rank, " \u30B9\u30ED\u30C3\u30C8\u3078\u88C5\u5099"), onToggleOwned ? /* @__PURE__ */ React.createElement(Button, { variant: isOwned ? "ghost" : "ghost", size: "sm", icon: isOwned ? "check" : "plus", onClick: onToggleOwned, title: isOwned ? "\u6240\u6301\u30EA\u30B9\u30C8\u304B\u3089\u5916\u3059" : "\u88C5\u5099\u305B\u305A\u306B\u6240\u6301\u30EA\u30B9\u30C8\u3078\u8FFD\u52A0\u3059\u308B" }, isOwned ? "\u6240\u6301\u6E08\u307F" : "\u6240\u6301\u306B\u8FFD\u52A0") : null));
};
const EgoQuickDetail = ({ ego, currentSlot, isOwned, onEquip, onUnequip, onToggleOwned, onOpenFullDetail, onClose }) => {
  const h = React.createElement;
  if (!ego) return null;
  const formatPreview = (text, limit = 150) => {
    const normalized = String(text || "").replace(/\s+/g, " ").trim();
    return normalized.length > limit ? `${normalized.slice(0, limit)}…` : normalized;
  };
  const skillSummary = (label, skill, tone) => {
    if (!skill || (!skill.effect && !(skill.dice || []).length)) return null;
    const rolls = (skill.dice || []).map((die) => die.roll).filter(Boolean).slice(0, 2);
    return h("div", { className: "ego-quick-skill", "data-tone": tone },
      h("div", { className: "ego-quick-skill-head" },
        h("span", null, label),
        h("span", null, [skill.attr, skill.sin].filter(Boolean).join(" · ") || "—")
      ),
      rolls.length ? h("div", { className: "ego-quick-rolls" }, rolls.join(" / ")) : null,
      skill.effect ? h("p", null, formatPreview(skill.effect, 92)) : null
    );
  };
  return h("aside", { className: "ego-quick-detail", style: { "--sin-primary": `var(--rank-${ego.rank})` }, "aria-label": `選択中E.G.O ${ego.name}` },
    h("div", { className: "ego-quick-head" },
      h("div", null,
        h("div", { className: "ego-quick-eyebrow" }, "選択中 E.G.O / 簡易詳細"),
        h("div", { className: "ego-quick-title-row" },
          h("span", { className: "badge", "data-rank": ego.rank }, ego.rank),
          h("span", { className: "ego-quick-name" }, ego.name)
        )
      ),
      h("button", { className: "btn-ghost btn-icon ego-quick-close", onClick: onClose, title: "選択を閉じる", "aria-label": "選択を閉じる" }, h(Icon, { name: "x", size: 13 }))
    ),
    h("div", { className: "ego-quick-meta" },
      h("div", null, h("span", null, "消費SAN"), h("strong", null, ego.san_cost)),
      h("div", null, h("span", null, "自我の欠片"), h("strong", null, ego.shards)),
      (ego.sub_skills || []).length ? h("div", { className: "ego-quick-assim" }, "◆ 同化") : null
    ),
    h("div", { className: "ego-quick-resources" },
      h("span", null, "必要資源"),
      h(EgoResourceChips, { resources: ego.resources, className: "is-quick-detail" })
    ),
    ego.passive_name || ego.passive_effect ? h("div", { className: "ego-quick-passive" },
      h("span", null, "パッシブ"),
      ego.passive_name ? h("strong", null, ego.passive_name) : null,
      ego.passive_effect ? h("p", null, formatPreview(ego.passive_effect)) : null
    ) : null,
    h("div", { className: "ego-quick-skills" },
      skillSummary("覚醒", ego.kakusei, "awake"),
      skillSummary("侵蝕", ego.shinshoku, "corrode")
    ),
    h("div", { className: "ego-quick-actions" },
      currentSlot ? h("div", { className: "ego-quick-equipped" }, "★ 現在 ", currentSlot, " に装備中") : null,
      currentSlot ? h(Button, { variant: "ghost", size: "sm", onClick: onUnequip, icon: "x" }, "装備解除") : h(Button, { variant: "primary", size: "sm", onClick: onEquip, icon: "check" }, ego.rank, " スロットへ装備"),
      currentSlot ? h(Button, { variant: "ghost", size: "sm", onClick: onOpenFullDetail, icon: "edit", title: "効果全文の確認と直接編集を開く" }, "詳細・直接編集") : null,
      onToggleOwned ? h(Button, { variant: "ghost", size: "sm", onClick: onToggleOwned, icon: isOwned ? "check" : "plus", title: isOwned ? "所持リストから外す" : "装備せずに所持リストへ追加する" }, isOwned ? "所持済み" : "所持に追加") : null
    )
  );
};
// E.G.O本文に現れる「回復」は、状態名としてではなくE.G.O検索専用の語として扱う。
// 候補表示時には下のsome判定で実データに一致する語だけを残す。
const EGO_KEYWORD_ORDER = [...new Set([...(window.LBT_PDF_KEYWORD_ORDER || []), "回復"])];
const getEgoKeywordHaystack = (ego) => {
  const skillText = (skill) => [
    skill?.name, skill?.attr, skill?.sin, skill?.aoe, skill?.effect,
    ...(skill?.dice || []).flatMap((die) => [die.roll, die.effect])
  ];
  return [
    ego?.name, ego?.resources, ego?.passive_name, ego?.passive_cond, ego?.passive_effect, ego?.unique_buff, ...(ego?.keywords || []),
    ...skillText(ego?.kakusei),
    ...skillText(ego?.shinshoku),
    ...(ego?.sub_skills || []).flatMap((skill) => skillText(skill))
  ].filter(Boolean).join(" ").toLowerCase();
};
const getEgoEffectHaystack = (ego) => {
  const skillEffects = (skill) => [
    skill?.effect,
    ...(skill?.dice || []).map((die) => die?.effect)
  ];
  return [
    ego?.passive_effect,
    ego?.unique_buff,
    ...skillEffects(ego?.kakusei),
    ...skillEffects(ego?.shinshoku),
    ...(ego?.sub_skills || []).flatMap((skill) => skillEffects(skill))
  ].filter(Boolean).join(" ").toLowerCase();
};
const egoMatchesKeyword = (ego, keyword) => keyword === "回復"
  ? getEgoEffectHaystack(ego).includes(keyword)
  : (Array.isArray(ego?.keywords) && ego.keywords.includes(keyword)) || getEgoEffectHaystack(ego).includes(keyword);
window.LBT_egoMatchesKeyword = egoMatchesKeyword;
const EgoSection = ({ state, dispatch }) => {
  const h = React.createElement;
  const [selected, setSelected] = React.useState(null);
  const [query, setQuery] = React.useState("");
  const rankFilter = state.ui.egoRankFilter || "";
  const [sinFilter, setSinFilter] = React.useState("");
  const [keywordFilter, setKeywordFilter] = React.useState("");
  // V01/V25: EGO は解析モード（egoManual）で編集可能にする。人格の同期化とは独立。
  // 直接編集は、装備中詳細を開いた状態で「直接編集を開始」を選んだ場合だけ有効にする。
  // 保存値や別スロットから残った編集フラグだけでは編集面を表示しない。
  const editable = !!state.egoManual && !!state.ui.egoDetailSlot && !!state.egoSlots[state.ui.egoDetailSlot];
  const detailSlot = state.ui.egoDetailSlot;
  const setDetailSlot = (v) => dispatch({ type: "SET_UI", ui: { egoDetailSlot: v } });
  const hasAnyEgo = Object.values(state.egoSlots || {}).some(Boolean);
  const listExpanded = state.ui.egoListExpanded !== void 0 ? state.ui.egoListExpanded : !hasAnyEgo;
  const setListExpanded = (v) => dispatch({ type: "SET_UI", ui: { egoListExpanded: v } });
  // V24: 「所持のみ」フィルタ（roster.egos に登録済みのものだけを表示）
  const [ownedOnly, setOwnedOnly] = React.useState(false);
  // P0: 初期表示は検索・最近使用・所持を優先し、全件一覧と詳細フィルタは利用者が明示して開く。
  const [browseAll, setBrowseAll] = React.useState(false);
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  // フィルタは「新しい一覧を見る」操作。旧詳細や解析面を残すと一覧と対象がずれるため、
  // カテゴリ・検索・大罪・所持条件の変更前に選択を必ず解除する。
  const clearEgoListSelection = () => {
    setSelected(null);
    setDetailSlot(null);
    if (state.egoManual) dispatch({ type: "SET_EGO_MANUAL", value: false });
  };
  const setRankFilter = (v) => {
    clearEgoListSelection();
    setBrowseAll(true);
    dispatch({ type: "SET_UI", ui: { egoRankFilter: v } });
  };
  const updateQuery = (v) => {
    clearEgoListSelection();
    setBrowseAll(true);
    setQuery(v);
  };
  const updateSinFilter = (v) => {
    clearEgoListSelection();
    setBrowseAll(true);
    setSinFilter(v);
  };
  const updateKeywordFilter = (v) => {
    clearEgoListSelection();
    setBrowseAll(true);
    setKeywordFilter(v);
  };
  const updateOwnedOnly = (v) => {
    clearEgoListSelection();
    setBrowseAll(true);
    setOwnedOnly(v);
  };
  const searchTarget = state.ui?.egoSearchTarget;
  const searchTargetKey = searchTarget ? `${searchTarget.rank}:${searchTarget.no}` : "";
  React.useEffect(() => {
    if (!searchTargetKey) return;
    const target = (DB.egos || []).find((ego) => `${ego.rank}:${ego.no}` === searchTargetKey);
    if (!target) return;
    setQuery("");
    setSinFilter("");
    setKeywordFilter("");
    setOwnedOnly(false);
    setBrowseAll(true);
    setFiltersOpen(false);
    setListExpanded(true);
    setSelected(target);
    setDetailSlot(null);
    dispatch({ type: "SET_UI", ui: { egoRankFilter: "", egoSearchTarget: null } });
  }, [searchTargetKey, dispatch]);
  const ownedKeys = React.useMemo(() => new Set((state.roster?.egos || []).map((e) => `${e.rank}:${e.no}`)), [state.roster?.egos]);
  const recordRecentEgo = (ego) => {
    if (!ego) return;
    const key = `${ego.rank}:${ego.no}`;
    const previous = Array.isArray(state.ui?.egoRecent) ? state.ui.egoRecent : [];
    dispatch({ type: "SET_UI", ui: { egoRecent: [key, ...previous.filter((item) => item !== key)].slice(0, 6) } });
  };
  const egoKeywordOptions = React.useMemo(() => EGO_KEYWORD_ORDER.map((keyword) => String(keyword || "").trim()).filter(Boolean).filter((keyword) => (DB.egos || []).some((ego) => egoMatchesKeyword(ego, keyword))), []);
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return (DB.egos || []).filter((e) => {
      if (ownedOnly && !ownedKeys.has(`${e.rank}:${e.no}`)) return false;
      if (rankFilter && e.rank !== rankFilter) return false;
      if (sinFilter && !(e.resources || "").includes(sinFilter)) return false;
      const hay = getEgoKeywordHaystack(e);
      if (keywordFilter && !egoMatchesKeyword(e, keywordFilter)) return false;
      if (q && !hay.includes(q)) return false;
      return true;
    });
  }, [query, rankFilter, sinFilter, keywordFilter, ownedOnly, ownedKeys]);
  const quickEgos = React.useMemo(() => {
    const source = DB.egos || [];
    const byKey = new Map(source.map((ego) => [`${ego.rank}:${ego.no}`, ego]));
    const recentKeys = Array.isArray(state.ui?.egoRecent) ? state.ui.egoRecent : [];
    const recent = recentKeys.map((key) => byKey.get(key)).filter(Boolean);
    const owned = source.filter((ego) => ownedKeys.has(`${ego.rank}:${ego.no}`));
    const seen = new Set();
    return [...recent, ...owned].filter((ego) => {
      const key = `${ego.rank}:${ego.no}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 12);
  }, [state.ui?.egoRecent, ownedKeys]);
  const isExploringAll = browseAll || !!query.trim() || !!rankFilter || !!sinFilter || !!keywordFilter || ownedOnly;
  const visibleEgos = isExploringAll ? filtered : quickEgos;
  const equip = () => {
    if (!selected) return;
    recordRecentEgo(selected);
    dispatch({ type: "SET_EGO_SLOT", rank: selected.rank, value: selected });
    toast(`${selected.rank}: 『${selected.name}』を装備`);
  };
  const unequip = () => {
    if (!selected) return;
    const slot = Object.entries(state.egoSlots || {}).find(([_, v]) => v && v.name === selected.name && v.no === selected.no)?.[0];
    if (slot) dispatch({ type: "SET_EGO_SLOT", rank: slot, value: null });
  };
  const clearSlot = (rk) => dispatch({ type: "SET_EGO_SLOT", rank: rk, value: null });
  const currentSlot = selected ? Object.entries(state.egoSlots || {}).find(([_, v]) => v && v.name === selected.name && v.no === selected.no)?.[0] : null;
  const slotCards = EGO_RANKS.map((rk) => {
    const e = state.egoSlots[rk];
    const isDetailActive = detailSlot === rk;
    const isSlotSelected = !!e && selected?.no === e.no && selected?.name === e.name;
    return h(
      "div",
      {
        key: rk,
        className: `ego-slot${isDetailActive ? " is-detail-active" : ""}${isSlotSelected ? " is-selected" : ""}`,
        "data-rank": rk,
        onClick: () => {
          if (e) {
            if (isSlotSelected) {
              setSelected(null);
              setDetailSlot(null);
              dispatch({ type: "SET_EGO_MANUAL", value: false });
            } else {
              // 選択直後は右列の簡易カードだけを開く。全文確認・直接編集は明示操作で開くため、
              // 一覧直下へ巨大な詳細を自動挿入しない。
              setSelected(e);
              dispatch({ type: "SET_EGO_MANUAL", value: false });
              setDetailSlot(null);
              setListExpanded(true);
            }
          } else {
            setRankFilter(rankFilter === rk && listExpanded ? "" : rk);
            setBrowseAll(true);
            setFiltersOpen(true);
            setListExpanded(true);
            setDetailSlot(null);
          }
        },
        title: e ? (isSlotSelected ? "クリックで選択中E.G.Oを閉じる" : "クリックで右側に簡易詳細を表示") : `クリックで ${rk} ランクのカード一覧を展開`
      },
      h("div", { className: "ego-slot-rank" }, rk),
      h("div", { className: `ego-slot-name${!e ? " ego-slot-empty" : ""}` }, e ? e.name : "（未装備）"),
      e ? h(React.Fragment, null,
        h(EgoResourceChips, { resources: e.resources, className: "is-slot" }),
        h("div", { className: "ego-slot-meta" },
          h("span", { className: "ego-slot-flag" }, "SAN", e.san_cost),
          h("span", { className: "ego-slot-flag" }, "欠片", e.shards),
          (e.sub_skills || []).length > 0 ? h("span", { className: "ego-slot-flag", style: { background: "var(--gold-tint)", color: "var(--gold)", borderColor: "var(--gold-line)" } }, "◆同化") : null
        ),
        h("button", { className: "btn-ghost btn-icon", onClick: (ev) => { ev.stopPropagation(); clearSlot(rk); setDetailSlot(null); }, style: { position: "absolute", top: 4, right: 4, width: 20, height: 20 }, title: "外す" }, h(Icon, { name: "x", size: 10 }))
      ) : (rankFilter === rk ? h("div", { style: { marginTop: 4, padding: "2px 6px", fontSize: 9, fontFamily: "var(--f-display)", letterSpacing: "0.14em", color: "var(--gold)", background: "var(--gold-tint)", border: "1px solid var(--gold-line)", borderRadius: 2, alignSelf: "flex-start" } }, "▼ 下で絞り込み中") : null)
    );
  });
  const egoGrid = h("div", { className: "codex-grid", style: { gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" } }, ...(visibleEgos.map((e) => {
    const isEquipped = Object.values(state.egoSlots || {}).some((v) => v && v.no === e.no && v.name === e.name);
    return h(
      "div",
      {
        key: `${e.rank}-${e.no}`,
        className: `p-card${selected?.no === e.no && selected?.name === e.name ? " is-active" : ""}${isEquipped ? " is-equipped" : ""}`,
        style: { "--sin-primary": `var(--rank-${e.rank})`, minHeight: 120 },
        onClick: () => setSelected(e),
        onDoubleClick: () => { setSelected(e); recordRecentEgo(e); dispatch({ type: "SET_EGO_SLOT", rank: e.rank, value: e }); toast(`${e.rank}: 『${e.name}』を装備`); }
      },
      h("div", { className: "p-card-head" }, h("span", { className: "p-num" }, "No.", String(e.no).padStart(3, "0")), h("span", { className: "badge", "data-rank": e.rank, style: { fontSize: 9 } }, e.rank), (e.sub_skills || []).length > 0 ? h("span", { className: "ego-doka-badge", title: "同化スキル対応EGO" }, "◆ 同化") : null),
      h("div", { className: "p-name" }, e.name),
      h(EgoResourceChips, { resources: e.resources, className: "is-catalog" }),
      h("div", { className: "p-kw-row", style: { marginTop: "auto" } }, h("span", { className: "p-kw" }, "SAN ", e.san_cost), h("span", { className: "p-kw" }, "欠片 ", e.shards))
    );
  })));
  return h(
    "div",
    { className: `stack-4 ego-section${selected ? " has-selection" : " is-catalog-only"}` },
    h("div", null,
      h("div", { className: "t-label", style: { marginBottom: "var(--s-2)", display: "flex", alignItems: "center", gap: 8 } }, h("span", null, "装備中のE.G.O"), h("span", { style: { fontSize: 9, color: "var(--tx-mute)", fontWeight: 400, letterSpacing: "0.08em" } }, "装備済スロット：クリックで詳細を開く　未装備スロット：クリックで一覧展開"), h("div", { style: { flex: 1 } }), hasAnyEgo ? h(Button, { size: "sm", icon: listExpanded ? "chevronU" : "chevronD", onClick: () => { setListExpanded(!listExpanded); if (listExpanded) setRankFilter(""); }, title: listExpanded ? "一覧を折り畳む" : "別のE.G.Oを選ぶ" }, listExpanded ? "一覧を畳む" : "別のE.G.Oを選ぶ") : null),
      h("div", { className: "ego-slots" }, ...slotCards),
      detailSlot && state.egoSlots[detailSlot] ? h("div", { className: "equipped-detail-wrap" }, h("div", { style: { display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", background: "var(--surface-2)", borderBottom: "1px solid var(--line-dim)" } }, h("span", { className: "badge", "data-rank": detailSlot }, detailSlot), h("span", { style: { fontFamily: "var(--f-display)", fontWeight: 600, color: "var(--tx)" } }, state.egoManual ? "装備中E.G.O / 直接編集" : "装備中E.G.O / 詳細"), h("div", { style: { flex: 1 } }),
      h("button", { className: "btn btn-sm " + (state.egoManual ? "btn-primary" : "btn-ghost"), onClick: () => {
        if (state.egoManual) {
          dispatch({ type: "SAVE_EGO_BUILD", rank: detailSlot });
          dispatch({ type: "SET_EGO_MANUAL", value: false });
          toast("解析内容を保持したまま解析モードを終了しました");
        } else {
          dispatch({ type: "SET_EGO_MANUAL", value: true });
          toast("直接編集：E.G.Oの効果・ダイスをその場で編集できます");
        }
      }, title: state.egoManual ? "直接編集を終了（内容は保持）" : "直接編集を開始" }, h(Icon, { name: state.egoManual ? "check" : "edit", size: 12 }), state.egoManual ? " 編集を終了" : " 直接編集を開始"),
      h("button", { className: "btn btn-sm btn-ghost", onClick: () => { dispatch({ type: "SET_EGO_MANUAL", value: false }); setDetailSlot(null); }, title: "閉じる" }, h(Icon, { name: "x", size: 12 }), " 閉じる")), h("div", { className: "equipped-detail-inner" }, editable ? null : h(EgoDetail, { ego: state.egoSlots[detailSlot], equipTo: detailSlot, currentSlot: detailSlot, onEquip: () => {}, onUnequip: () => { clearSlot(detailSlot); setDetailSlot(null); }, dispatch }), editable ? h(EquippedEgoEditor, { rank: detailSlot, ego: state.egoSlots[detailSlot], dispatch }) : null)) : null,
      hasAnyEgo && !listExpanded ? h("div", { className: "codex-collapsed-hint" }, h("span", { style: { color: "var(--tx-mute)", fontSize: "var(--fs-11)", letterSpacing: "0.14em", fontFamily: "var(--f-display)" } }, "◇ E.G.O 一覧は折り畳み中"), h("span", { style: { marginLeft: 12, fontSize: "var(--fs-10)", color: "var(--tx-dim)" } }, "未装備スロットをクリックすると、そのランクだけ絞り込んで展開されます。"), h("button", { className: "btn btn-sm", style: { marginLeft: "auto" }, onClick: () => { setListExpanded(true); setRankFilter(""); } }, "一覧を展開")) : null
    ),
    (!hasAnyEgo || listExpanded) ? h("div", { className: "codex" }, h("div", { className: "codex-main" }, h("div", { className: `codex-filters ego-catalog-filters${filtersOpen ? " is-filter-open" : ""}` }, h("div", { className: "codex-filter-row" }, h("div", { className: "codex-search" }, h(Icon, { name: "search", size: 14 }), h("input", { type: "text", placeholder: "E.G.O名・効果・キーワード・資源で検索...", value: query, onChange: (e) => updateQuery(e.target.value) })), h("div", { className: "codex-count" }, h("strong", null, visibleEgos.length), isExploringAll ? " / " : " 件の候補", isExploringAll ? (DB.egos || []).length : ""), h("button", { className: "btn btn-sm ego-filter-toggle", onClick: () => setFiltersOpen(!filtersOpen), "aria-expanded": filtersOpen, title: "ランク・大罪・キーワード・所持の絞り込みを開く" }, filtersOpen ? "絞り込みを閉じる" : "絞り込み"), !isExploringAll ? h("button", { className: "btn btn-sm ego-browse-all", onClick: () => setBrowseAll(true), title: "全E.G.Oを一覧から探す" }, "全件を見る") : null, rankFilter ? h("button", { className: "btn btn-sm", onClick: () => setRankFilter(""), style: { color: "var(--gold)", borderColor: "var(--gold-line)" } }, rankFilter, " 絞り込み中 ×") : null), h("div", { className: "codex-filter-row" }, h("span", { className: "filter-label" }, "ランク"), h("div", { className: "chips-group" }, ...EGO_RANKS.map((r) => h("button", { key: r, className: "chip", onClick: () => setRankFilter(rankFilter === r ? "" : r), style: { background: rankFilter === r ? `color-mix(in oklab, var(--rank-${r}) 25%, var(--surface-2))` : void 0, borderColor: rankFilter === r ? `var(--rank-${r})` : void 0, color: rankFilter === r ? "var(--tx)" : void 0 } }, h("span", { style: { width: 6, height: 6, borderRadius: 999, background: `var(--rank-${r})`, marginRight: 4, display: "inline-block" } }), r)))), h("div", { className: "codex-filter-row" }, h("span", { className: "filter-label" }, "大罪"), h("div", { className: "chips-group" }, ...SIN_LIST.map((s) => h(Chip, { key: s, sin: s, active: sinFilter === s, onClick: () => updateSinFilter(sinFilter === s ? "" : s) }, s)))), h("div", { className: "codex-filter-row" }, h("span", { className: "filter-label" }, "キーワード"), h("div", { className: "chips-group" }, ...egoKeywordOptions.map((keyword) => h(Chip, { key: keyword, size: "sm", active: keywordFilter === keyword, onClick: () => updateKeywordFilter(keywordFilter === keyword ? "" : keyword) }, keyword)))), h("div", { className: "codex-filter-row" }, h("span", { className: "filter-label" }, "所持"), h("div", { className: "chips-group" }, h(Chip, { size: "sm", active: ownedOnly, onClick: () => updateOwnedOnly(!ownedOnly) }, "所持しているもののみ", ownedOnly ? ` (${ownedKeys.size})` : ""))), !isExploringAll && visibleEgos.length === 0 ? h("div", { className: "ego-discovery-empty" }, h("strong", null, "最近使用・所持中のE.G.Oはありません"), h("span", null, "名称で検索するか、「全件を見る」から探してください。")) : egoGrid)), h(EgoQuickDetail, { ego: selected, currentSlot, onEquip: equip, onUnequip: unequip,
      isOwned: !!(selected && ownedKeys.has(`${selected.rank}:${selected.no}`)),
      onToggleOwned: () => {
        if (!selected) return;
        const entry = (state.roster?.egos || []).find((x) => x.rank === selected.rank && x.no === selected.no);
        if (entry) { dispatch({ type: "REMOVE_ROSTER_EGO", uid: entry.uid }); toast(`『${selected.name}』を所持リストから外しました`); }
        else { dispatch({ type: "ADD_ROSTER_EGO", rank: selected.rank, no: selected.no }); toast(`『${selected.name}』を所持リストに追加しました`); }
      }, onOpenFullDetail: () => {
        if (!currentSlot) return;
        dispatch({ type: "SET_EGO_MANUAL", value: false });
        setDetailSlot(currentSlot);
        setListExpanded(false);
      }, onClose: () => {
        setSelected(null);
        setDetailSlot(null);
        dispatch({ type: "SET_EGO_MANUAL", value: false });
      } })) : null
  );
};
const SpiritSection = ({ state, dispatch }) => {
  const [selected, setSelected] = React.useState(null);
  const [query, setQuery] = React.useState("");
  const [sourceFilter, setSourceFilter] = React.useState("all");
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return DB.spirits.filter((s) => {
      if (sourceFilter !== "all" && catalogSource(s) !== sourceFilter) return false;
      return !q || `${s.name} ${s.morale_effect || ""} ${s.confuse_effect || ""} ${s.always_effect || ""}`.toLowerCase().includes(q);
    });
  }, [query, sourceFilter]);
  useSourceFilterControl("精神", sourceFilter, setSourceFilter);
  const applySpirit = (sp) => {
    dispatch({ type: "APPLY_SPIRIT", spirit: sp });
    toast(`\u7CBE\u795E\u300E${sp.name}\u300F\u3092\u9069\u7528`);
  };
  const setF = (field, value) => dispatch({ type: "SET_FIELD", field, value });
  const isCurrentSpirit = state.spirit;
  const dbSpirit = DB.spirits.find((sp) => sp.name === state.spirit);
  const isAutoSpirit = !!dbSpirit && state.spiritMorale === (dbSpirit.morale_effect || "") && state.spiritConfuse === (dbSpirit.confuse_effect || "") && state.spiritAlways === (dbSpirit.always_effect || "");
  const [forceEditSpirit, setForceEditSpirit] = React.useState(false);
  const showAsCard = isCurrentSpirit && isAutoSpirit && !forceEditSpirit;
  const addManualSpirit = () => {
    const name = prompt("\u624B\u52D5\u8FFD\u52A0\u3059\u308B\u7CBE\u795E\u306E\u540D\u524D\u3092\u5165\u529B\u3057\u3066\u304F\u3060\u3055\u3044:", "");
    if (!name) return;
    setF("spirit", name.trim());
    setF("spiritMorale", "");
    setF("spiritConfuse", "");
    setF("spiritAlways", "");
    setForceEditSpirit(true);
    toast(`\u7CBE\u795E\u300E${name.trim()}\u300F\u3092\u624B\u52D5\u8FFD\u52A0`);
  };
  return /* @__PURE__ */ React.createElement("div", { className: "stack-4" }, isCurrentSpirit && (showAsCard ? (
    /* v50 (N5): スキルカード風表示（DB由来・自動入力時） */
    /* @__PURE__ */ React.createElement("div", { className: "deck-card deck-focus", style: { padding: "var(--s-4)" } }, /* @__PURE__ */ React.createElement("div", { className: "deck-card-head", style: { marginBottom: "var(--s-3)" } }, /* @__PURE__ */ React.createElement(
      "span",
      {
        className: "deck-rank",
        style: { background: "var(--gold-tint)", color: "var(--gold)", border: "1px solid var(--gold-line)", padding: "4px 10px", fontFamily: "var(--f-display)", fontWeight: 600, fontSize: "var(--fs-12)", borderRadius: "var(--r-sm)", letterSpacing: "0.08em" }
      },
      "SPIRIT / \u7CBE\u795E"
    ), dbSpirit.price > 0 && /* @__PURE__ */ React.createElement("span", { style: { marginLeft: 8, fontFamily: "var(--f-mono)", fontSize: "var(--fs-10)", color: "var(--gold)", padding: "3px 8px", background: "var(--surface-inset)", border: "1px solid var(--line-dim)", borderRadius: "var(--r-sm)" } }, "LP ", dbSpirit.price), /* @__PURE__ */ React.createElement("div", { style: { flex: 1 } }), /* @__PURE__ */ React.createElement(Button, { variant: "ghost", size: "sm", icon: "edit", onClick: () => setForceEditSpirit(true) }, "\u624B\u52D5\u7DE8\u96C6"), /* @__PURE__ */ React.createElement(Button, { variant: "ghost", size: "sm", icon: "x", onClick: () => {
      setF("spirit", "");
      setF("spiritMorale", "");
      setF("spiritConfuse", "");
      setF("spiritAlways", "");
      setForceEditSpirit(false);
      toast("\u7CBE\u795E\u3092\u89E3\u9664");
    } }, "\u89E3\u9664")), /* @__PURE__ */ React.createElement("div", { className: "deck-name", style: { fontFamily: "var(--f-display)", fontWeight: 700, fontSize: "var(--fs-18)", color: "var(--tx)", marginBottom: "var(--s-3)", lineHeight: 1.2 } }, state.spirit), /* @__PURE__ */ React.createElement("div", { className: "stack-3" }, state.spiritAlways && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--f-display)", fontSize: 9, letterSpacing: "0.18em", color: "var(--gold)", textTransform: "uppercase", marginBottom: 4 } }, "ALWAYS / \u5E38\u6642\u767A\u52D5"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-12)", color: "var(--tx-2)", lineHeight: 1.7, padding: "8px 12px", background: "var(--gold-tint)", border: "1px solid var(--gold-line)", borderLeft: "3px solid var(--gold)", borderRadius: "var(--r-sm)", whiteSpace: "pre-wrap" } }, state.spiritAlways)), state.spiritMorale && state.spiritMorale !== "\u306A\u3057" && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--f-display)", fontSize: 9, letterSpacing: "0.18em", color: "var(--warn)", textTransform: "uppercase", marginBottom: 4 } }, "MORALE / \u58EB\u6C17\u4F4E\u4E0B\u52B9\u679C"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-12)", color: "var(--tx-2)", lineHeight: 1.7, padding: "8px 12px", background: "color-mix(in oklab, var(--warn) 8%, var(--surface-inset))", border: "1px solid color-mix(in oklab, var(--warn) 30%, var(--line-dim))", borderLeft: "3px solid var(--warn)", borderRadius: "var(--r-sm)", whiteSpace: "pre-wrap" } }, state.spiritMorale)), state.spiritConfuse && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--f-display)", fontSize: 9, letterSpacing: "0.18em", color: "var(--err)", textTransform: "uppercase", marginBottom: 4 } }, "CONFUSE / \u6DF7\u4E71\u52B9\u679C"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-12)", color: "var(--tx-2)", lineHeight: 1.7, padding: "8px 12px", background: "color-mix(in oklab, var(--err) 8%, var(--surface-inset))", border: "1px solid color-mix(in oklab, var(--err) 30%, var(--line-dim))", borderLeft: "3px solid var(--err)", borderRadius: "var(--r-sm)", whiteSpace: "pre-wrap" } }, state.spiritConfuse))))
  ) : (
    /* 従来のフォーム表示（手動入力/編集時） */
    /* @__PURE__ */ React.createElement(Card, null, /* @__PURE__ */ React.createElement("div", { className: "card-header", style: { background: "var(--gold-tint)" } }, /* @__PURE__ */ React.createElement("span", { className: "t-label", style: { color: "var(--gold)" } }, "\u73FE\u5728\u88C5\u5099\u4E2D\u306E\u7CBE\u795E"), /* @__PURE__ */ React.createElement("span", { style: { fontFamily: "var(--f-display)", fontSize: "var(--fs-15)", fontWeight: 600, color: "var(--tx)", marginLeft: "var(--s-2)" } }, state.spirit), /* @__PURE__ */ React.createElement("div", { className: "grow" }), isAutoSpirit && forceEditSpirit && /* @__PURE__ */ React.createElement(Button, { variant: "ghost", size: "sm", icon: "eye", onClick: () => setForceEditSpirit(false) }, "\u30AB\u30FC\u30C9\u8868\u793A\u306B\u623B\u3059"), /* @__PURE__ */ React.createElement(Button, { variant: "ghost", size: "sm", icon: "x", onClick: () => {
      setF("spirit", "");
      setF("spiritMorale", "");
      setF("spiritConfuse", "");
      setF("spiritAlways", "");
      setForceEditSpirit(false);
      toast("\u7CBE\u795E\u3092\u89E3\u9664");
    } }, "\u89E3\u9664")), /* @__PURE__ */ React.createElement("div", { className: "card-body stack-3" }, /* @__PURE__ */ React.createElement(Field, { label: "\u7CBE\u795E\u540D" }, /* @__PURE__ */ React.createElement("input", { className: "input", value: state.spirit, onChange: (e) => setF("spirit", e.target.value) })), /* @__PURE__ */ React.createElement(Field, { label: "\u58EB\u6C17\u4F4E\u4E0B\u52B9\u679C" }, /* @__PURE__ */ React.createElement("textarea", { className: "textarea", rows: 2, value: state.spiritMorale, onChange: (e) => setF("spiritMorale", e.target.value) })), /* @__PURE__ */ React.createElement(Field, { label: "\u6DF7\u4E71\u52B9\u679C" }, /* @__PURE__ */ React.createElement("textarea", { className: "textarea", rows: 2, value: state.spiritConfuse, onChange: (e) => setF("spiritConfuse", e.target.value) })), /* @__PURE__ */ React.createElement(Field, { label: "\u5E38\u6642\u767A\u52D5\uFF08\u4EFB\u610F\uFF09" }, /* @__PURE__ */ React.createElement("input", { className: "input", value: state.spiritAlways, onChange: (e) => setF("spiritAlways", e.target.value) }))))
  )), !isCurrentSpirit && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "flex-end" } }, /* @__PURE__ */ React.createElement(Button, { variant: "ghost", size: "sm", icon: "plus", onClick: addManualSpirit }, "\u624B\u52D5\u3067\u7CBE\u795E\u3092\u8FFD\u52A0")), /* @__PURE__ */ React.createElement("div", { className: "codex" }, /* @__PURE__ */ React.createElement("div", { className: "codex-main" }, /* @__PURE__ */ React.createElement("div", { className: "codex-filters" }, /* @__PURE__ */ React.createElement("div", { className: "codex-filter-row" }, /* @__PURE__ */ React.createElement("div", { className: "codex-search" }, /* @__PURE__ */ React.createElement(Icon, { name: "search", size: 14 }), /* @__PURE__ */ React.createElement("input", { type: "text", placeholder: "\u7CBE\u795E\u540D\u30FB\u52B9\u679C\u3067\u691C\u7D22...", value: query, onChange: (e) => setQuery(e.target.value) })), /* @__PURE__ */ React.createElement("div", { className: "codex-count" }, /* @__PURE__ */ React.createElement("strong", null, filtered.length), " / ", DB.spirits.length))), /* @__PURE__ */ React.createElement("div", { className: "spirit-list" }, filtered.map((sp) => {
    const isSelected = selected?.name === sp.name;
    const isEquipped = state.spirit === sp.name;
    return /* @__PURE__ */ React.createElement(
      "div",
      {
        key: sp.name,
        className: `spirit-item${isSelected ? " is-active" : ""}${isEquipped ? " is-equipped" : ""}`,
        onClick: () => setSelected(sp),
        onDoubleClick: () => applySpirit(sp)
      },
      /* @__PURE__ */ React.createElement("div", { className: "spirit-item-head" }, /* @__PURE__ */ React.createElement("div", { className: "spirit-item-name" }, sp.name), /* @__PURE__ */ React.createElement("span", { className: "spirit-item-price" }, sp.price > 0 ? `LP ${sp.price}` : "\u521D\u671F\u9078\u629E\u53EF"), isEquipped && /* @__PURE__ */ React.createElement("span", { style: { marginLeft: "auto", fontSize: 9, color: "var(--gold)", fontFamily: "var(--f-display)", letterSpacing: "0.16em" } }, "\u2605 \u88C5\u5099\u4E2D")),
      sp.always_effect && /* @__PURE__ */ React.createElement("div", { className: "spirit-item-line" }, /* @__PURE__ */ React.createElement("span", { className: "spirit-item-tag", "data-tag": "always" }, "\u5E38\u6642"), /* @__PURE__ */ React.createElement("span", null, sp.always_effect)),
      sp.morale_effect && sp.morale_effect !== "\u306A\u3057" && /* @__PURE__ */ React.createElement("div", { className: "spirit-item-line" }, /* @__PURE__ */ React.createElement("span", { className: "spirit-item-tag", "data-tag": "morale" }, "\u58EB\u6C17"), /* @__PURE__ */ React.createElement("span", null, sp.morale_effect)),
      /* @__PURE__ */ React.createElement("div", { className: "spirit-item-line" }, /* @__PURE__ */ React.createElement("span", { className: "spirit-item-tag", "data-tag": "confuse" }, "\u6DF7\u4E71"), /* @__PURE__ */ React.createElement("span", null, sp.confuse_effect))
    );
  }))), selected ? /* @__PURE__ */ React.createElement("div", { className: "codex-detail" }, /* @__PURE__ */ React.createElement("div", { className: "detail-head", style: { "--sin-primary": "var(--gold)" } }, /* @__PURE__ */ React.createElement("div", { className: "detail-eyebrow" }, /* @__PURE__ */ React.createElement("span", { className: "detail-num" }, selected.price > 0 ? `LP ${selected.price}` : "\u521D\u671F\u9078\u629E\u53EF"), /* @__PURE__ */ React.createElement("span", { className: "detail-type" }, "SPIRIT / \u7CBE\u795E")), /* @__PURE__ */ React.createElement("div", { className: "detail-name" }, selected.name)), /* @__PURE__ */ React.createElement("div", { className: "detail-body" }, selected.always_effect && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "detail-section-title" }, "\u5E38\u6642\u52B9\u679C"), /* @__PURE__ */ React.createElement("div", { className: "detail-passive" }, /* @__PURE__ */ React.createElement("div", { className: "detail-passive-effect" }, selected.always_effect))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "detail-section-title" }, "\u58EB\u6C17\u4F4E\u4E0B\u52B9\u679C"), /* @__PURE__ */ React.createElement("div", { className: "detail-passive", style: { borderLeftColor: "var(--warn)" } }, /* @__PURE__ */ React.createElement("div", { className: "detail-passive-effect" }, selected.morale_effect || "\u306A\u3057"))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "detail-section-title" }, "\u6DF7\u4E71\u52B9\u679C"), /* @__PURE__ */ React.createElement("div", { className: "detail-passive", style: { borderLeftColor: "var(--err)" } }, /* @__PURE__ */ React.createElement("div", { className: "detail-passive-effect" }, selected.confuse_effect)))), /* @__PURE__ */ React.createElement("div", { className: "detail-actions" }, state.spirit === selected.name ? /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-10)", color: "var(--gold)", textAlign: "center", fontFamily: "var(--f-display)", letterSpacing: "0.2em", textTransform: "uppercase" } }, "\u2605 \u73FE\u5728\u88C5\u5099\u4E2D") : /* @__PURE__ */ React.createElement(Button, { variant: "primary", onClick: () => applySpirit(selected), icon: "check" }, "\u3053\u306E\u7CBE\u795E\u3092\u88C5\u5099"))) : /* @__PURE__ */ React.createElement("div", { className: "codex-detail" }, /* @__PURE__ */ React.createElement("div", { className: "detail-empty" }, /* @__PURE__ */ React.createElement("div", { className: "detail-empty-icon" }, "\u{1F701}"), /* @__PURE__ */ React.createElement("div", { className: "t-label" }, "\u5DE6\u306E\u30AB\u30FC\u30C9\u3092\u9078\u629E"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-11)", color: "var(--tx-mute)", marginTop: 8 } }, "\u7CBE\u795E\u3092\u9078\u629E\u3059\u308B\u3068\u8A73\u7D30\u304C\u8868\u793A\u3055\u308C\u307E\u3059\u3002", /* @__PURE__ */ React.createElement("br", null), "\u30C0\u30D6\u30EB\u30AF\u30EA\u30C3\u30AF\u3067\u88C5\u5099\u3002")))));
};
const LegacyEnhancementSection = ({ state, dispatch }) => {
  const setEnh = (list) => dispatch({ type: "SET_FIELD", field: "enhancements", value: list });
  const addEnh = (e) => {
    if (state.enhancements.some((x) => x.name === e.name)) {
      toast("\u65E2\u306B\u8FFD\u52A0\u6E08\u307F");
      return;
    }
    setEnh([...state.enhancements, { ...e, id: `enh-${Date.now()}` }]);
    toast(`\u300E${e.name}\u300F\u3092\u8FFD\u52A0`);
  };
  const removeEnh = (id) => setEnh(state.enhancements.filter((e) => e.id !== id));
  const [category, setCategory] = React.useState("special");
  const sourceRows = category === "special" ? (DB.special_enhancements || []) : DB.normal_enhancements.filter((e) => e.category === category);
  const bodyRows = sourceRows.filter((entry) => String(entry?.name || "").startsWith("肉体強化"));
  const mindRows = sourceRows.filter((entry) => String(entry?.name || "").startsWith("精神強化"));
  const otherRows = sourceRows.filter((entry) => !bodyRows.includes(entry) && !mindRows.includes(entry));
  // 2列グリッドは行単位に流れるため、肉体・精神を交互に並べると、
  // PCでは肉体強化が左列、精神強化が右列へまとまって表示される。
  const pairedSpecialRows = Array.from({ length: Math.max(bodyRows.length, mindRows.length) }, (_, index) => [bodyRows[index], mindRows[index]].filter(Boolean)).flat();
  const catList = bodyRows.length || mindRows.length ? [...pairedSpecialRows, ...otherRows] : sourceRows;
  const cats = [
    { v: "special", l: "\u7279\u6B8A\u5F37\u5316" },
    { v: "persona", l: "\u901A\u5E38\u4EBA\u683C" },
    { v: "prisoner", l: "LCB\u4EBA\u683C" },
    { v: "sync", l: "\u540C\u671F\u5316\u4EBA\u683C" }
  ];
  return /* @__PURE__ */ React.createElement("div", { className: "stack-4" }, /* @__PURE__ */ React.createElement(Card, null, /* @__PURE__ */ React.createElement("div", { className: "card-header" }, /* @__PURE__ */ React.createElement("span", { className: "t-label" }, "\u5F37\u5316DB"), /* @__PURE__ */ React.createElement("div", { className: "grow" }), /* @__PURE__ */ React.createElement("div", { className: "segmented", role: "tablist", "aria-label": "強化カテゴリ" }, cats.map((c) => /* @__PURE__ */ React.createElement("button", { key: c.v, type: "button", role: "tab", "aria-selected": category === c.v, className: category === c.v ? "is-active" : "", onClick: () => setCategory(c.v) }, c.l)))), /* @__PURE__ */ React.createElement("div", { style: { padding: "var(--s-2)", maxHeight: 320, overflowY: "auto" } }, /* @__PURE__ */ React.createElement("div", { className: "spp-list", style: { maxHeight: "none", padding: 0, background: "transparent", border: "none" } }, catList.map((e) => /* @__PURE__ */ React.createElement("div", { key: e.name, className: "spp-item", onClick: () => addEnh(e) }, /* @__PURE__ */ React.createElement("div", { className: "spp-item-name" }, e.name, " ", /* @__PURE__ */ React.createElement("span", { style: { fontSize: "var(--fs-10)", color: "var(--gold)", fontWeight: 400 } }, "\u6B20\u7247", e.shards)), /* @__PURE__ */ React.createElement("div", { className: "spp-item-eff" }, e.effect)))))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "t-label", style: { marginBottom: "var(--s-2)" } }, "\u53D6\u5F97\u6E08\u307F (", state.enhancements.length, ")"), state.enhancements.length === 0 ? /* @__PURE__ */ React.createElement("div", { className: "empty" }, "\u5F37\u5316\u306F\u3042\u308A\u307E\u305B\u3093") : /* @__PURE__ */ React.createElement("div", { className: "stack-2" }, state.enhancements.map((e) => /* @__PURE__ */ React.createElement("div", { key: e.id, className: "list-item" }, /* @__PURE__ */ React.createElement("div", { className: "list-item-head" }, /* @__PURE__ */ React.createElement("span", { className: "list-item-title" }, e.name), /* @__PURE__ */ React.createElement("span", { className: "badge" }, "\u6B20\u7247", e.shards), /* @__PURE__ */ React.createElement("button", { className: "btn-ghost btn-icon", onClick: () => removeEnh(e.id) }, /* @__PURE__ */ React.createElement(Icon, { name: "trash", size: 12 }))), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-12)", color: "var(--tx-2)" } }, e.effect))))));
};
const EnhancementSection = ({ state, dispatch }) => {
  const h = React.createElement;
  const setEnh = (list) => dispatch({ type: "SET_FIELD", field: "enhancements", value: list });
  const isUnsyncedOnly = window.LBT_isUnsyncedOnlyEnhancement || ((entry) => entry?.category === "persona");
  const isUnavailableDuringSync = (entry) => !!state.syncedManual && isUnsyncedOnly(entry);
  const activeEnhancements = window.LBT_getActiveEnhancements?.(state) || (state.enhancements || []).filter((entry) => !isUnavailableDuringSync(entry));
  const addEnh = (entry) => {
    if (isUnavailableDuringSync(entry)) {
      toast("未同期専用の強化は、同期化して編集した人格には追加できません");
      return;
    }
    if ((state.enhancements || []).some((current) => current.name === entry.name)) {
      toast("既に追加済み");
      return;
    }
    setEnh([...(state.enhancements || []), { ...entry, id: `enh-${Date.now()}` }]);
    toast(`『${entry.name}』を追加`);
  };
  const removeEnh = (id) => setEnh((state.enhancements || []).filter((entry) => entry.id !== id));
  const [category, setCategory] = React.useState("special");
  React.useEffect(() => {
    if (state.syncedManual && category === "persona") setCategory("sync");
  }, [state.syncedManual, category]);
  const sourceRows = (category === "special" ? (DB.special_enhancements || []) : (DB.normal_enhancements || []).filter((entry) => entry.category === category)).filter((entry) => !isUnavailableDuringSync(entry));
  const bodyRows = sourceRows.filter((entry) => String(entry?.name || "").startsWith("肉体強化"));
  const mindRows = sourceRows.filter((entry) => String(entry?.name || "").startsWith("精神強化"));
  const otherRows = sourceRows.filter((entry) => !bodyRows.includes(entry) && !mindRows.includes(entry));
  const pairedSpecialRows = Array.from({ length: Math.max(bodyRows.length, mindRows.length) }, (_, index) => [bodyRows[index], mindRows[index]].filter(Boolean)).flat();
  const catalogRows = bodyRows.length || mindRows.length ? [...pairedSpecialRows, ...otherRows] : sourceRows;
  const categories = [
    { value: "special", label: "特殊強化", common: true },
    { value: "persona", label: "通常人格" },
    { value: "prisoner", label: "LCB人格", common: true },
    { value: "sync", label: "同期化人格", common: true }
  ];
  return h("div", { className: "stack-4" },
    h(Card, null,
      h("div", { className: "card-header" },
        h("span", { className: "t-label" }, "強化DB"),
        h("div", { className: "grow" }),
        h("div", { className: "segmented", role: "tablist", "aria-label": "強化カテゴリ" }, categories.map((entry) => {
          const disabled = !!state.syncedManual && !entry.common;
          return h("button", { key: entry.value, type: "button", role: "tab", "aria-selected": category === entry.value, className: category === entry.value ? "is-active" : "", disabled, title: disabled ? "未同期専用：同期化して編集した人格には使えません" : "", onClick: () => setCategory(entry.value) }, entry.label);
        }))
      ),
      state.syncedManual && h("div", { className: "settings-section-note", style: { padding: "0 var(--s-3)" } }, "同期化中：通常人格用の未同期専用強化は選択・出力されません。囚人人格用・特殊強化・同期化人格用強化は通常どおり利用できます。"),
      h("div", { style: { padding: "var(--s-2)", maxHeight: 320, overflowY: "auto" } },
        h("div", { className: "spp-list", style: { maxHeight: "none", padding: 0, background: "transparent", border: "none" } }, catalogRows.map((entry) => h("div", { key: entry.name, className: "spp-item", onClick: () => addEnh(entry) },
          h("div", { className: "spp-item-name" }, entry.name, " ", h("span", { style: { fontSize: "var(--fs-10)", color: "var(--gold)", fontWeight: 400 } }, "欠片", entry.shards)),
          h("div", { className: "spp-item-eff" }, entry.effect)
        )))
      )
    ),
    h("div", null,
      h("div", { className: "t-label", style: { marginBottom: "var(--s-2)" } }, `取得済み (${activeEnhancements.length}/${(state.enhancements || []).length})`),
      !(state.enhancements || []).length ? h("div", { className: "empty" }, "強化はありません") : h("div", { className: "stack-2" }, (state.enhancements || []).map((entry) => {
        const inactive = isUnavailableDuringSync(entry);
        return h("div", { key: entry.id, className: "list-item", style: inactive ? { opacity: .55 } : void 0 },
          h("div", { className: "list-item-head" },
            h("span", { className: "list-item-title" }, entry.name),
            h("span", { className: "badge" }, inactive ? "同期中は対象外" : `欠片${entry.shards || ""}`),
            h("button", { className: "btn-ghost btn-icon", onClick: () => removeEnh(entry.id), title: "強化を削除" }, h(Icon, { name: "trash", size: 12 }))
          ),
          h("div", { style: { fontSize: "var(--fs-12)", color: "var(--tx-2)" } }, entry.effect)
        );
      }))
    )
  );
};
const SYNC_RANKS = [null, "0", "00", "000"];
const isRosterPersonaSynced = (entry) => Boolean(entry?.syncMax || entry?.syncRank === "0" || entry?.syncRank === "00" || entry?.syncRank === "000");
const rosterPersonaMatchesSyncFilters = (entry, syncFilter = "all", syncRankFilter = "all") => {
  const synced = isRosterPersonaSynced(entry);
  const matchesState = syncFilter === "all" || syncFilter === "synced" && synced || syncFilter === "unsynced" && !synced;
  const matchesRank = syncRankFilter === "all" || syncRankFilter === "max" && entry?.syncMax === true || entry?.syncRank === syncRankFilter;
  return matchesState && matchesRank;
};
const ROSTER_EGO_RANK_ORDER = ["ZAYIN", "TETH", "HE", "WAW", "ALEPH"];
const sortRosterLibraryItems = (items, sortBy, libraryTab) => {
  const collator = new Intl.Collator("ja", { numeric: true, sensitivity: "base" });
  const byName = (a, b) => collator.compare(a.name, b.name) || a.addedIndex - b.addedIndex;
  const rows = [...items];
  if (sortBy === "name") return rows.sort(byName);
  if (sortBy === "number") return rows.sort((a, b) => {
    if (libraryTab === "egos") {
      const rankDiff = ROSTER_EGO_RANK_ORDER.indexOf(a.entry.rank) - ROSTER_EGO_RANK_ORDER.indexOf(b.entry.rank);
      if (rankDiff) return rankDiff;
    } else if (a.entry.mode !== b.entry.mode) {
      return String(a.entry.mode).localeCompare(String(b.entry.mode));
    }
    return Number(a.entry.no) - Number(b.entry.no) || byName(a, b);
  });
  if (sortBy === "sync" && libraryTab === "personas") return rows.sort((a, b) => {
    if (a.synced !== b.synced) return a.synced ? -1 : 1;
    const rankDiff = SYNC_RANKS.indexOf(b.entry.syncRank || null) - SYNC_RANKS.indexOf(a.entry.syncRank || null);
    return rankDiff || byName(a, b);
  });
  return rows;
};
const resolveRosterPersonaSource = (entry, fallback) => {
  const build = entry?.build;
  if (!build) return fallback;
  const savedSource = build.personaSrc && typeof build.personaSrc === "object" ? build.personaSrc : {};
  const source = { ...(fallback || {}), ...savedSource };
  return {
    ...source,
    hp: build.hp ?? source.hp,
    san: build.san ?? source.san,
    speed: build.speed ?? source.speed,
    bullets: build.bullets ?? source.bullets,
    res_slash: build.resS ?? source.res_slash,
    res_pierce: build.resP ?? source.res_pierce,
    res_blunt: build.resB ?? source.res_blunt,
    passive_name: build.pas?.name ?? source.passive_name,
    passive_cond: build.pas?.cond ?? source.passive_cond,
    passive_always: build.pas?.always ?? source.passive_always,
    passive_effect: build.pas?.effect ?? source.passive_effect,
    skills: Array.isArray(build.skills) ? build.skills : source.skills,
    unique_buffs: Array.isArray(build.uniqueBuffs) ? build.uniqueBuffs : source.unique_buffs
  };
};
window.LBT_rosterLibrary = { isRosterPersonaSynced, rosterPersonaMatchesSyncFilters, sortRosterLibraryItems, resolveRosterPersonaSource };
const RosterSection = ({ state, dispatch }) => {
  const h = React.createElement;
  const [libraryTab, setLibraryTab] = React.useState("personas");
  const [manageMode, setManageMode] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState([]);
  const [filter, setFilter] = React.useState("all");
  const [syncFilter, setSyncFilter] = React.useState("all");
  const [syncRankFilter, setSyncRankFilter] = React.useState("all");
  const [sortBy, setSortBy] = React.useState("added");
  const [undo, setUndo] = React.useState(null);
  const [detailId, setDetailId] = React.useState(null);
  const roster = state.roster || { personas: [], egos: [] };
  const clearSelection = () => setSelectedIds([]);
  const currentPersonaKey = `${state.personaMode}:${state.personaNo}`;
  const currentEgoKeys = new Set(Object.entries(state.egoSlots || {}).filter(([, value]) => value).map(([rank, value]) => `${rank}:${value.no}`));
  const findPersona = (entry) => {
    if (entry.mode === "custom") return resolveRosterPersonaSource(entry, entry.src || null);
    const db = entry.mode === "n" ? (DB.normal_personas || []) : (DB.tokui_personas || []);
    return resolveRosterPersonaSource(entry, db.find((item) => item.no === entry.no) || null);
  };
  const findEgo = (entry) => (DB.egos || []).find((item) => item.rank === entry.rank && item.no === entry.no) || entry.build || null;
  const rawItems = libraryTab === "personas" ? (roster.personas || []).map((entry, addedIndex) => {
    const src = findPersona(entry);
    const baseName = entry.displayName || src?.name || "名称未設定";
    const name = entry.syncMax && !/\s*\[MAX\]\s*$/i.test(baseName) ? `${baseName} [MAX]` : baseName;
    return { entry, src, id: entry.uid, type: "personas", name, equipped: `${entry.mode}:${entry.no}` === currentPersonaKey, saved: !!entry.build, synced: isRosterPersonaSynced(entry), addedIndex, meta: entry.mode === "n" ? "通常人格" : entry.mode === "t" ? "特異人格" : "創作人格" };
  }).filter((item) => item.src) : (roster.egos || []).map((entry, addedIndex) => {
    const src = findEgo(entry);
    return { entry, src, id: entry.uid, type: "egos", name: entry.build?.name || src?.name || "名称未設定", equipped: currentEgoKeys.has(`${entry.rank}:${entry.no}`), saved: !!entry.build, addedIndex, meta: `${entry.rank} · No.${String(entry.no || "").padStart(3, "0")}` };
  }).filter((item) => item.src);
  const items = sortRosterLibraryItems(rawItems.filter((item) => (
    (filter === "all" || filter === "equipped" && item.equipped || filter === "saved" && item.saved)
    && (libraryTab !== "personas" || rosterPersonaMatchesSyncFilters(item.entry, syncFilter, syncRankFilter))
  )), sortBy, libraryTab);
  const selected = new Set(selectedIds);
  const selectableItems = items.filter((item) => !item.equipped);
  const toggleSelection = (id) => setSelectedIds((ids) => ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]);
  const selectAll = () => setSelectedIds(selectableItems.map((item) => item.id));
  const exitManage = () => { setManageMode(false); clearSelection(); };
  const openDetail = (item) => {
    if (manageMode) return;
    // 1回目は確認、同じ非装備行への2回目は確定として扱う。
    // 詳細を読んだ利用者が、別ボタンを探さずに目的を達成できる高速経路にする。
    if (detailId === item.id && !item.equipped) {
      equipItem(item);
      return;
    }
    setDetailId((current) => current === item.id ? null : item.id);
  };
  const removeSelected = () => {
    const target = rawItems.filter((item) => selected.has(item.id) && !item.equipped);
    if (!target.length) { toast("削除できる項目を選択してください"); return; }
    const names = target.slice(0, 3).map((item) => item.name).join("、");
    const suffix = target.length > 3 ? `、ほか${target.length - 3}件` : "";
    if (!confirm(`${libraryTab === "personas" ? "人格" : "E.G.O"} ${target.length}件を所持ライブラリから削除しますか？\n${names}${suffix}\n装備中の項目は削除されません。`)) return;
    dispatch({ type: libraryTab === "personas" ? "REMOVE_ROSTER_BATCH" : "REMOVE_ROSTER_EGO_BATCH", uids: target.map((item) => item.id) });
    setUndo({ kind: libraryTab, items: target.map((item) => item.entry), expires: Date.now() + 10000 });
    clearSelection();
    setDetailId(null);
    toast(`${target.length}件をライブラリから削除しました。下の「元に戻す」で復元できます`);
  };
  const restore = () => {
    if (!undo) return;
    dispatch({ type: "RESTORE_ROSTER_BATCH", kind: undo.kind, items: undo.items });
    toast(`${undo.items.length}件をライブラリへ復元しました`);
    setUndo(null);
  };
  React.useEffect(() => {
    clearSelection();
    setManageMode(false);
    setDetailId(null);
  }, [libraryTab, filter, syncFilter, syncRankFilter, sortBy]);
  React.useEffect(() => {
    if (!undo) return undefined;
    const timer = window.setTimeout(() => setUndo(null), Math.max(0, undo.expires - Date.now()));
    return () => window.clearTimeout(timer);
  }, [undo]);
  const equipItem = (item) => {
    if (item.type === "personas") {
      const entry = item.entry;
      dispatch({ type: "EQUIP_PERSONA", mode: entry.mode, no: entry.no, src: item.src });
      toast(`『${item.name}』を装備`);
    } else {
      dispatch({ type: "SET_EGO_SLOT", rank: item.entry.rank, value: item.src });
      toast(`${item.entry.rank}: 『${item.name}』を装備`);
    }
  };
  const renderDetail = (item) => {
    const src = item.src || {};
    const canModifySyncMax = item.type === "personas" && item.equipped && canEditPersonaState(state);
    const summarizeEgoSkill = (skill) => {
      if (!skill) return "未設定";
      const type = [skill.attr, skill.sin].filter(Boolean).join("・");
      const dice = (skill.dice || []).map((die) => die.roll).filter(Boolean).join(" / ");
      return [type, dice].filter(Boolean).join(" / ") || "登録済み";
    };
    const summary = item.type === "personas"
      ? [
          `HP ${src.hp ?? "?"} / SAN ${src.san ?? "?"} / 速度 ${src.speed || "?"}`,
          src.passive_name ? `パッシブ：${src.passive_name}${src.passive_cond ? `（${src.passive_cond}）` : ""}` : "パッシブ情報なし",
          (src.skills || []).length ? `スキル：${(src.skills || []).map((skill) => skill.name).filter(Boolean).slice(0, 4).join(" / ")}` : "スキル情報なし"
        ]
      : [
          `ランク ${item.entry.rank} / SAN ${src.san_cost ?? src.cost ?? "未設定"} / 資源 ${src.resources || src.sin_cost || "未設定"}`,
          src.passive_name ? `パッシブ：${src.passive_name}${src.passive_cond ? `（${src.passive_cond}）` : ""}` : "パッシブ情報なし",
          `覚醒：${summarizeEgoSkill(src.kakusei || src.awakening)}　侵蝕：${summarizeEgoSkill(src.shinshoku || src.corrosion)}`
        ];
    return h("div", { className: "roster-detail", role: "region", "aria-label": `${item.name}の詳細` },
      h("div", { className: "roster-detail-head" }, h("div", null, h("span", { className: "t-label" }, item.type === "personas" ? "PERSONA DETAIL / 簡易詳細" : "E.G.O DETAIL / 簡易詳細"), h("div", { className: "roster-detail-title" }, item.name)), h("button", { className: "btn btn--quiet btn-icon", onClick: () => setDetailId(null), title: "詳細を閉じる", "aria-label": "詳細を閉じる" }, h(Icon, { name: "x", size: 15 }))),
      h("div", { className: "roster-detail-lines" }, summary.map((line, index) => h("div", { key: index }, line))),
      item.type === "personas" && canModifySyncMax && h("label", { className: `sync-max-detail-toggle${item.entry.syncMax ? " is-on" : ""}`, onClick: (event) => event.stopPropagation(), title: "同期MAXを設定・解除" }, h("input", { type: "checkbox", checked: item.entry.syncMax === true, onChange: (event) => dispatch({ type: "PATCH_ROSTER", uid: item.entry.uid, patch: { syncMax: event.target.checked } }) }), h("span", { className: "sync-max-detail-label" }, "同期MAXとして設定"), h("span", { className: "sync-max-detail-note" }, "同期ランクとは別・名称と共有に反映")),
      h("div", { className: "roster-detail-actions" },
        item.equipped ? h("span", { className: "badge", style: { color: "var(--gold)", borderColor: "var(--gold-line)" } }, "現在装備中") : h(Button, { size: "md", variant: "primary", icon: "check", className: "roster-detail-equip", onClick: () => equipItem(item) }, item.type === "personas" ? "この人格を装備する" : "このE.G.Oを装備する"),
        item.saved && h("span", { className: "roster-detail-saved" }, item.type === "personas" ? "保存済みビルドを復元して装備します" : "保存済み解析を復元して装備します")
      )
    );
  };
  const renderItem = (item) => h(React.Fragment, { key: item.id },
    h("div", { className: `roster-item roster-item-selectable${item.equipped ? " is-equipped" : ""}${detailId === item.id ? " is-active" : ""}`, role: manageMode ? undefined : "button", tabIndex: manageMode ? -1 : 0, "aria-expanded": manageMode ? undefined : detailId === item.id, onClick: () => openDetail(item), onKeyDown: (event) => { if (!manageMode && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); openDetail(item); } }, title: manageMode ? "削除対象を選択" : item.equipped ? `${item.name}の詳細を${detailId === item.id ? "閉じる" : "開く"}` : `${item.name}${detailId === item.id ? "を装備する" : "の詳細を開く"}`, style: { display: "flex", gap: "var(--s-3)", alignItems: "center" } },
      manageMode && h("input", { type: "checkbox", checked: selected.has(item.id), disabled: item.equipped, onClick: (event) => event.stopPropagation(), onChange: () => toggleSelection(item.id), title: item.equipped ? "装備中の項目はライブラリから削除できません" : "削除対象に選択", style: { width: 22, height: 22, accentColor: "var(--gold)", flex: "none" } }),
      h("div", { className: "roster-item-info", style: { minWidth: 0, flex: 1 } },
        h("div", { className: "roster-item-name" }, item.name, item.equipped && h("span", { style: { marginLeft: 8, fontSize: "var(--fs-10)", color: "var(--gold)", fontFamily: "var(--f-display)", letterSpacing: "0.12em" } }, "装備中")),
        h("div", { className: "roster-item-meta" }, h("span", null, item.meta), item.saved && h("span", { style: { color: "var(--ok)" } }, libraryTab === "personas" ? "保存済みビルド" : "保存済み解析"), libraryTab === "personas" && item.entry.syncRank && h("span", { style: { color: "var(--gold)" } }, `同期${item.entry.syncRank}`), libraryTab === "personas" && item.entry.syncMax && h("span", { style: { color: "var(--gold)" } }, "同期MAX")),
        !manageMode && h("div", { className: "roster-item-open-hint" }, item.equipped ? (detailId === item.id ? "押して詳細を閉じる" : "押して詳細を見る") : (detailId === item.id ? "もう一度押すと装備" : "押して詳細を見る"))
      ),
      !manageMode && h("div", { className: "roster-item-actions" },
        !item.equipped && h(Button, { size: "sm", variant: "primary", icon: "check", onClick: (event) => { event.stopPropagation(); equipItem(item); }, title: "確認せず直ちに装備する" }, "即時装備"),
        item.equipped && h("span", { className: "badge", style: { color: "var(--gold)", borderColor: "var(--gold-line)" } }, "使用中")
      )
    ),
    detailId === item.id && !manageMode && renderDetail(item)
  );
  const label = libraryTab === "personas" ? "人格" : "E.G.O";
  return h("div", { className: "stack-3" },
    h(Card, null,
      h("div", { className: "card-header", style: { alignItems: "center", flexWrap: "wrap", gap: "var(--s-2)" } }, h("span", { className: "t-label" }, "OWNED LIBRARY / 所持ライブラリ"), h("div", { className: "segmented", role: "tablist", "aria-label": "所持ライブラリ種別", style: { marginLeft: "auto" } },
        h("button", { type: "button", role: "tab", "aria-selected": libraryTab === "personas", className: libraryTab === "personas" ? "is-active" : "", onClick: () => setLibraryTab("personas") }, "人格"),
        h("button", { type: "button", role: "tab", "aria-selected": libraryTab === "egos", className: libraryTab === "egos" ? "is-active" : "", onClick: () => setLibraryTab("egos") }, "E.G.O")
      )),
      h("div", { className: "card-body stack-3" },
        h("div", { className: "roster-library-intro" }, `所持${label}を押すと簡易詳細が開きます。詳細から内容を確認して装備するか、「即時装備」で直ちに装備できます。削除は「管理する」から対象を選ぶため、非装備を一括削除しません。`),
        h("div", { className: "roster-controls" },
          h("div", { className: "segmented", role: "tablist", "aria-label": "所持状態フィルタ" }, [["all", "すべて"], ["equipped", "装備中"], ["saved", "保存済み"]].map(([key, text]) => h("button", { key, type: "button", role: "tab", "aria-selected": filter === key, className: filter === key ? "is-active" : "", onClick: () => setFilter(key) }, text))),
          libraryTab === "personas" && h("div", { className: "segmented", role: "tablist", "aria-label": "同期状態フィルタ" }, [["all", "すべて"], ["synced", "同期済み"], ["unsynced", "未同期"]].map(([key, text]) => h("button", { key, type: "button", role: "tab", "aria-selected": syncFilter === key, className: syncFilter === key ? "is-active" : "", onClick: () => setSyncFilter(key) }, text))),
          libraryTab === "personas" && h("div", { className: "segmented", role: "tablist", "aria-label": "同期・MAXフィルタ" }, [["all", "同期・MAXすべて"], ["0", "同期0"], ["00", "同期00"], ["000", "同期000"], ["max", "同期MAX"]].map(([key, text]) => h("button", { key, type: "button", role: "tab", "aria-selected": syncRankFilter === key, className: syncRankFilter === key ? "is-active" : "", onClick: () => setSyncRankFilter(key) }, text))),
          h("label", { className: "roster-sort-control", title: "所持一覧の並び順" }, h("span", { className: "t-label" }, "並び順"), h("select", { className: "select", value: sortBy, onChange: (event) => setSortBy(event.target.value) }, h("option", { value: "added" }, "追加順"), h("option", { value: "name" }, "名前順"), h("option", { value: "number" }, libraryTab === "personas" ? "No.順" : "ランク・No.順"), libraryTab === "personas" && h("option", { value: "sync" }, "同期順"))),
          h("div", { style: { flex: 1 } }),
          manageMode ? h(React.Fragment, null, h(Button, { size: "sm", variant: "ghost", onClick: selectedIds.length === selectableItems.length && selectableItems.length ? clearSelection : selectAll }, selectedIds.length === selectableItems.length && selectableItems.length ? "選択を解除" : "全て選択"), h(Button, { size: "sm", variant: "ghost", onClick: exitManage }, "管理を終了")) : h(Button, { size: "sm", variant: "ghost", icon: "edit", onClick: () => setManageMode(true) }, "管理する")
        ),
        manageMode && h("div", { className: "roster-manage-bar" }, h("span", { style: { color: "var(--warn)" } }, "選択削除"), h("span", null, `${selectedIds.length}件を選択中。装備中の項目は保護されます。`), h("div", { style: { flex: 1 } }), h(Button, { size: "md", variant: "danger", icon: "trash", disabled: !selectedIds.length, onClick: removeSelected }, `${selectedIds.length}件を削除`)),
        items.length === 0 ? h("div", { className: "empty", style: { padding: "var(--s-5)" } }, filter === "all" ? `所持${label}はまだありません。${libraryTab === "personas" ? "人格を装備" : "E.G.Oを所持に追加または装備"}するとここへ保存されます。` : "この条件に一致する所持項目はありません。") : h("div", { className: "stack-2" }, items.map(renderItem)),
        undo && h("div", { className: "roster-undo-bar" }, h("span", null, `${undo.items.length}件を削除しました。`), h(Button, { size: "sm", variant: "ghost", icon: "undo", onClick: restore }, "元に戻す"))
      )
    )
  );
};
const DEFAULT_FMLs = [
  { name: "MT", expr: "{\u30D1\u30EF\u30FC}-{\u865A\u5F31}+{\u5171\u9CF4}+{\u30B9\u30AD\u30EB\u5A01\u529B}+{\u30DE\u30C3\u30C1\u5A01\u529B\u5897\u52A0}-{\u30DE\u30C3\u30C1\u5A01\u529B\u4F4E\u4E0B}", builtin: true },
  { name: "DM", expr: "{\u30D1\u30EF\u30FC}-{\u865A\u5F31}+{\u5171\u9CF4}+{\u30B9\u30AD\u30EB\u5A01\u529B}+{\u30C0\u30E1\u30FC\u30B8\u91CF\u5897\u52A0}-{\u30C0\u30E1\u30FC\u30B8\u91CF\u6E1B\u5C11}", builtin: true },
  { name: "DT", expr: "{\u5171\u9CF4}+{\u5FCD\u8010}-{\u6B66\u88C5\u89E3\u9664}+{\u30B9\u30AD\u30EB\u5A01\u529B}+{\u5B88\u5099\u5A01\u529B}", builtin: true },
  { name: "QB", expr: "{\u675F\u7E1B}+{\u30AF\u30A4\u30C3\u30AF}", builtin: true }
];
const FACTORY_DEFAULT_STATUS = [
  { label: "HP", initial: 100, max: 100 },
  { label: "SAN", initial: 45, max: 45 },
  { label: "\u5171\u9CF4", initial: 0, max: 5 },
  { label: "\u30D1\u30EF\u30FC", initial: 0, max: 10 },
  { label: "\u865A\u5F31", initial: 0, max: 10 },
  { label: "\u30B9\u30AD\u30EB\u5A01\u529B", initial: 0, max: 10 },
  { label: "\u30DE\u30C3\u30C1\u5A01\u529B\u5897\u52A0", initial: 0, max: 10 },
  { label: "\u30DE\u30C3\u30C1\u5A01\u529B\u4F4E\u4E0B", initial: 0, max: 10 },
  { label: "\u30C0\u30E1\u30FC\u30B8\u91CF\u5897\u52A0", initial: 0, max: 10 },
  { label: "\u30C0\u30E1\u30FC\u30B8\u91CF\u6E1B\u5C11", initial: 0, max: 10 },
  { label: "\u9EBB\u75FA", initial: 0, max: 10 },
  { label: "\u5FCD\u8010", initial: 0, max: 10 },
  { label: "\u6B66\u88C5\u89E3\u9664", initial: 0, max: 10 },
  { label: "\u30AF\u30A4\u30C3\u30AF", initial: 0, max: 10 },
  { label: "\u675F\u7E1B", initial: 0, max: 10 }
];

/* V05: 全ステータス（デフォルト+固有+カスタム）の表示順を横断して並べ替えるパネル */
const StatusOrderRow = ({ item, i, total, dnd, onMove, onPatchDefault, onPatchUnique, onRemoveDefault }) => {
  const h = React.createElement;
  const isDefault = item.src === "デフォルト" && Number.isInteger(item.defaultIndex);
  const isUnique = item.src === "固有" && !!item.uniqueId;
  const status = item.defaultStatus;
  const editableStatus = isDefault ? status : isUnique ? item.uniqueBuff : null;
  const linked = isDefault && (status.label === "HP" || status.label === "SAN");
  const linkedValue = linked ? (status.label === "HP" ? item.initial : item.initial) : null;
  const sourceName = linked ? "人格連動" : item.src;
    const srcColor = linked ? "var(--gold)" : item.src === "デフォルト" ? "var(--tx-mute)" : item.src === "固有" || item.src === "DB指定" ? "var(--gold)" : item.src === "自己付与" ? "#4fa3a5" : "#b06ab3";
  const rowProps = Object.assign({}, dnd.rowProps(i), { className: `${dnd.rowProps(i).className} status-order-row` });
  const valueFields = editableStatus
    ? h("div", { className: "status-order-edit-values" },
        linked
          ? h("span", { className: "status-order-linked-value", title: "HP/SANは人格と連動します" }, `現在値 ${linkedValue}`)
          : [
              h("label", { key: "initial", className: "status-order-number" }, h("span", null, "初"), h("input", { className: "input", type: "number", value: editableStatus.initial ?? 0, title: isUnique ? `${item.label}の初期値（人格固有）` : "初期値", onChange: (event) => isDefault ? onPatchDefault(item.defaultIndex, { initial: parseInt(event.target.value) || 0, initialManual: true }) : onPatchUnique(item.uniqueId, { initial: parseInt(event.target.value) || 0 }) })),
              h("label", { key: "max", className: "status-order-number" }, h("span", null, "上"), h("input", { className: "input", type: "number", value: editableStatus.max ?? 99, title: isUnique ? `${item.label}の上限（人格固有）` : "最大値", onChange: (event) => isDefault ? onPatchDefault(item.defaultIndex, { max: parseInt(event.target.value) || 0 }) : onPatchUnique(item.uniqueId, { max: parseInt(event.target.value) || 0 }) }))
            ]
      )
    : h("span", { className: "status-order-read-values" }, `初 ${item.initial ?? 0} / 上限 ${item.max ?? 99}`);
  return h("div", rowProps,
    h("span", Object.assign({}, dnd.handleProps(i), { className: "dnd-handle status-order-handle", title: "ドラッグして並べ替え", "aria-label": `${item.label}をドラッグして並べ替え` }), "⋮⋮"),
    h("span", { className: "status-order-index" }, String(i + 1).padStart(2, "0")),
    h("div", { className: "status-order-name" }, isDefault ? h("input", { className: "input", value: status.label, disabled: linked, title: linked ? "HP/SANは人格と連動します" : "ステータス名", onChange: (event) => onPatchDefault(item.defaultIndex, { label: event.target.value }) }) : h("span", null, item.label)),
    h("span", { className: "status-order-source", style: { color: srcColor } }, sourceName),
    valueFields,
    h("div", { className: "reorder-btns" },
      h("button", { className: "reorder-btn", disabled: i === 0, onClick: () => onMove(i, -1), title: "上へ", "aria-label": `${item.label}を上へ移動` }, h(Icon, { name: "arrowU", size: 12 })),
      h("button", { className: "reorder-btn", disabled: i === total - 1, onClick: () => onMove(i, 1), title: "下へ", "aria-label": `${item.label}を下へ移動` }, h(Icon, { name: "arrowD", size: 12 }))
    ),
    isDefault ? h("button", { className: "btn-ghost btn-icon", disabled: linked, title: linked ? "人格と連動する項目は削除できません" : "削除", onClick: () => onRemoveDefault(item.defaultIndex) }, h(Icon, { name: "trash", size: 12 })) : h("span", { className: "status-order-row-spacer", "aria-hidden": "true" })
  );
};

const StatusOrderPanel = ({ state, dispatch, embedded = false, onPatchDefault = () => {}, onPatchUnique = () => {}, onRemoveDefault = () => {}, onAddDefault = () => {}, onResetDefaults = () => {} }) => {
  const h = React.createElement;
  const collectAll = React.useMemo(() => {
    const out = [];
    const seen = new Set();
    const push = (label, src, meta = {}) => {
      const lb = String(label || "").trim();
      if (!lb || seen.has(lb)) return;
      seen.add(lb);
      out.push({ label: lb, src, ...meta });
    };
    (state.defaultStatuses || FACTORY_DEFAULT_STATUS).forEach((f, defaultIndex) => {
      const linked = f.label === "HP" || f.label === "SAN";
      const initial = linked ? (f.label === "HP" ? state.hp || state.personaSrc?.hp || "?" : state.san || state.personaSrc?.san || "?") : f.initial;
      push(f.label, "デフォルト", { defaultIndex, defaultStatus: f, initial, max: linked ? initial : f.max });
    });
    // DB指定または「得る／自分に付与」の根拠がある状態だけを、人格に紐付く項目として追加する。
    (window.LBT_getStateSelfManagedStatusEntries?.(state) || []).forEach((entry) => push(entry.label, entry.kind === "declared" ? "DB指定" : "自己付与", { initial: entry.initial ?? 0, max: entry.max ?? 99 }));
    // 種別がバフ・デバフ・中立バフのいずれでも、人格DBに固有として定義された値は
    // 既定や自己付与ではなく、唯一の所有元である「固有」として表示・編集する。
    (state.uniqueBuffs || []).forEach((b) => { if ((b.place || "status") === "status") push(b.name, "固有", { uniqueId: b.id, uniqueBuff: b, initial: b.initial ?? 0, max: b.max ?? 99 }); });
    (state.customStatuses || []).forEach((c) => { if ((c.place || "status") === "status") push(c.label, "カスタム", { initial: c.initial ?? 0, max: c.max ?? 99 }); });
    // スキル側でd値・d数を可変にした場合、ST出力を選んだ変数は設定一覧にも加える。
    // JSON出力と同じ収集関数を使い、名称の省略時も S◯d値／S◯-◯d数 と一致させる。
    (window.LBT_collectSkillDiceVars?.(state) || []).forEach((variable) => {
      if ((variable.place || "status") === "status") push(variable.label, "スキル変数", { initial: variable.initial ?? 0, max: variable.max ?? 99 });
    });
    return out;
  }, [state.defaultStatuses, state.uniqueBuffs, state.customStatuses, state.egoSlots, state.skills, state.personaSrc, state.supports, state.enhancements]);

  const userOrder = state.ui.statusOrder || null;
  const ordered = React.useMemo(() => {
    if (!Array.isArray(userOrder) || !userOrder.length) return collectAll;
    const rank = new Map(userOrder.map((lb, i) => [lb, i]));
    return collectAll.slice().sort((a, b) => (rank.has(a.label) ? rank.get(a.label) : 1e9) - (rank.has(b.label) ? rank.get(b.label) : 1e9));
  }, [collectAll, userOrder]);

  const saveOrder = (labels) => dispatch({ type: "SET_UI", ui: { statusOrder: labels } });
  const reorderTo = (from, to) => {
    const labels = ordered.map((x) => x.label);
    const moved = labels.splice(from, 1)[0];
    labels.splice(to, 0, moved);
    saveOrder(labels);
  };
  const dnd = useDragReorder({ onReorder: reorderTo });
  const onMove = (i, dir) => { const j = i + dir; if (j >= 0 && j < ordered.length) reorderTo(i, j); };

  const header = h("div", { className: "settings-status-workspace-head" },
    h("div", null, h("span", { className: "t-label" }, "ステータス一覧・編集・出力順"), h("div", { className: "settings-section-note" }, "既定と人格固有の初期値・上限はこの一覧で直接変更できます。スキルのd値・d数変数はST出力を選んだ場合にここへ表示され、行の順番が出力順になります。")),
    h("div", { className: "settings-status-workspace-actions" },
      h(Button, { size: "sm", icon: "plus", onClick: () => onAddDefault() }, "既定を追加"),
      h(Button, { size: "sm", variant: "ghost", icon: "undo", onClick: () => onResetDefaults() }, "既定に戻す"),
      userOrder ? h(Button, { size: "sm", variant: "ghost", icon: "x", onClick: () => { saveOrder(null); toast("ステータス順を既定に戻しました"); } }, "順序を戻す") : null
    )
  );
  const desc = h("div", { className: "status-order-instruction" },
    h("strong", null, "掴んだままホイールでスクロールできます。"),
    h("span", null, " 行を移動先までスクロールして離すと確定します。▲▼ボタンはドラッグを使わない代替操作です。")
  );
  const body = ordered.length === 0
    ? h("div", { className: "empty", style: { padding: "var(--s-3)" } }, "ステータス項目がありません")
    : h("div", { ...dnd.scrollContainerProps, className: "status-order-scroll stack-1" },
        ordered.map((item, i) => h(StatusOrderRow, { key: item.label, item, i, total: ordered.length, dnd, onMove, onPatchDefault, onPatchUnique, onRemoveDefault }))
      );
  return embedded ? h("section", { className: "stack-2 settings-order-embedded" }, header, desc, body) : h(Card, null, header, h("div", { className: "card-body" }, desc, body));
};

const LabelParamsPanel = ({ state, onAddCustom, onPatchCustom, onRemoveCustom, onPatchMorale }) => {
  const h = React.createElement;
  const entries = React.useMemo(() => {
    const list = [{ id: "morale-line", type: "morale", label: "士気低下ライン", value: state.moraleLine, source: "設定" }];
    const { atkModLabel, hasVigor, hasDefMod } = window.LBT_gen?.detectMTMods?.(state) || {};
    if (atkModLabel) list.push({ id: "support-atk-mod", type: "derived", label: atkModLabel, value: 1, source: "サポートから自動" });
    if (hasVigor) list.push({ id: "enh-vigor", type: "derived", label: "闘志", value: 1, source: "強化から自動" });
    if (hasDefMod) list.push({ id: "enh-defense", type: "derived", label: "守備威力", value: 1, source: "強化から自動" });
    (state.uniqueBuffs || []).filter((buff) => (buff.place || "status") === "params").forEach((buff, index) => list.push({ id: `unique-${buff.id || index}`, type: "unique", label: buff.name || "名称未設定", value: "", source: "人格固有" }));
    (state.customStatuses || []).filter((item) => (item.place || "status") === "params").forEach((item) => list.push({ id: item.id, type: "custom", label: item.label || "", value: item.initial ?? 0, source: "カスタム", item }));
    (window.LBT_collectSkillDiceVars?.(state) || []).filter((item) => item.place === "params").forEach((item, index) => list.push({ id: `skill-${item.label || index}-${index}`, type: "skill", label: item.label || "名称未設定", value: "", source: "スキル変数" }));
    return list;
  }, [state.moraleLine, state.enhancements, state.uniqueBuffs, state.customStatuses, state.egoSlots, state.skills, state.personaSrc, state.supports]);
  const renderEntry = (entry) => {
    if (entry.type === "custom") {
      return h("div", { key: entry.id, className: "label-param-row label-param-row--editable" },
        h("label", { className: "label-param-field" }, h("span", null, "名前"), h("input", { className: "input", value: entry.item.label, placeholder: "ラベル名", onChange: (event) => onPatchCustom(entry.item.id, { label: event.target.value }) })),
        h("label", { className: "label-param-field label-param-field--value" }, h("span", null, "値"), h("input", { className: "input", type: "number", value: entry.item.initial ?? 0, onChange: (event) => onPatchCustom(entry.item.id, { initial: parseInt(event.target.value) || 0 }) })),
        h("label", { className: "label-param-field label-param-field--target" }, h("span", null, "出力先"), h("select", { className: "select", value: entry.item.place || "params", onChange: (event) => onPatchCustom(entry.item.id, { place: event.target.value }) }, h("option", { value: "params" }, "ラベル側"), h("option", { value: "status" }, "ST側へ移動"), h("option", { value: "none" }, "出力しない"))),
        h("span", { className: "label-param-source" }, entry.source),
        h("button", { className: "btn-ghost btn-icon", title: "このラベルを削除", onClick: () => onRemoveCustom(entry.item.id) }, h(Icon, { name: "trash", size: 12 }))
      );
    }
    if (entry.type === "morale") {
      return h("div", { key: entry.id, className: "label-param-row label-param-row--editable label-param-row--system" },
        h("div", { className: "label-param-read" }, h("strong", null, entry.label), h("small", null, "常に出力")),
        h("label", { className: "label-param-field label-param-field--value" }, h("span", null, "値"), h("input", { className: "input", type: "number", value: entry.value ?? 0, onChange: (event) => onPatchMorale(event.target.value) })),
        h("span", { className: "label-param-source" }, entry.source),
        h("span", { className: "label-param-row-spacer", "aria-hidden": "true" })
      );
    }
    const help = entry.type === "unique" ? "人格側の固有バフで管理します" : entry.type === "skill" ? "スキル編集で名称と出力先を変更します" : "選択中の強化から自動で出力します";
    return h("div", { key: entry.id, className: "label-param-row label-param-row--readonly" },
      h("div", { className: "label-param-read" }, h("strong", null, entry.label), h("small", null, help)),
      h("span", { className: "label-param-empty" }, entry.value === "" ? "値なし" : `値 ${entry.value}`),
      h("span", { className: "label-param-source" }, entry.source)
    );
  };
  return h("section", { className: "stack-2 settings-label-workspace" },
    h("div", { className: "settings-status-workspace-head" },
      h("div", null, h("span", { className: "t-label" }, "ラベル一覧・編集・params出力"), h("div", { className: "settings-section-note" }, "ラベル側は CCFOLIA JSON の params に出力され、式・チャットパレットから参照します。現在値を持つステータス項目とは別に扱います。")),
      h("div", { className: "settings-status-workspace-actions" }, h(Button, { size: "sm", icon: "plus", onClick: () => onAddCustom("params") }, "ラベルを追加"))
    ),
    h("div", { className: "label-param-list" }, entries.map(renderEntry))
  );
};

const SettingsSection = ({ state, dispatch }) => {
  const setF = (field, value) => dispatch({ type: "SET_FIELD", field, value });
  const addFml = () => setF("formulas", [...state.formulas, { id: `fml-${Date.now()}`, name: "", expr: "" }]);
  const patchFml = (id, patch) => setF("formulas", state.formulas.map((f) => f.id === id ? { ...f, ...patch } : f));
  const rmFml = (id) => setF("formulas", state.formulas.filter((f) => f.id !== id));
  const bov = state.builtinFormulasOverride || {};
  const setBov = (name, val) => setF("builtinFormulasOverride", { ...bov, [name]: val });
  const [editingBuiltin, setEditingBuiltin] = React.useState(null);
  const [editDraft, setEditDraft] = React.useState("");
  const startEditBuiltin = (name, currentExpr) => {
    setEditingBuiltin(name);
    setEditDraft(currentExpr);
  };
  const commitEditBuiltin = () => {
    if (editingBuiltin) {
      setBov(editingBuiltin, editDraft);
      setEditingBuiltin(null);
      toast("\u7D44\u8FBC\u5F0F\u3092\u4E0A\u66F8\u304D");
    }
  };
  const cancelEditBuiltin = () => {
    setEditingBuiltin(null);
    setEditDraft("");
  };
  const removeBuiltin = (name) => {
    if (confirm(`\u7D44\u8FBC\u5F0F\u300C${name}\u300D\u3092\u975E\u8868\u793A\uFF08\u524A\u9664\uFF09\u3057\u307E\u3059\u304B\uFF1F\u30C1\u30E3\u30C3\u30C8\u30D1\u30EC\u30C3\u30C8\u306B\u51FA\u529B\u3055\u308C\u306A\u304F\u306A\u308A\u307E\u3059\u3002`)) {
      setBov(name, null);
      toast(`${name} \u3092\u524A\u9664`);
    }
  };
  const restoreBuiltin = (name) => {
    const next = { ...bov };
    delete next[name];
    setF("builtinFormulasOverride", next);
    toast(`${name} \u3092\u5FA9\u5143`);
  };
  const resetAllFormulas = () => {
    if (confirm("\u4EE3\u5165\u5F0F\u3092\u5168\u3066\u30EA\u30BB\u30C3\u30C8\u3057\u307E\u3059\u304B\uFF1F\n\u30FB\u7D44\u8FBC\u5F0F(MT/DM/DT/QB)\u3092\u521D\u671F\u72B6\u614B\u306B\u623B\u3059\n\u30FB\u30AB\u30B9\u30BF\u30E0\u4EE3\u5165\u5F0F\u3092\u3059\u3079\u3066\u524A\u9664\n\u3053\u306E\u64CD\u4F5C\u306F\u53D6\u308A\u6D88\u305B\u307E\u305B\u3093\u3002")) {
      setF("builtinFormulasOverride", {});
      setF("formulas", []);
      toast("\u4EE3\u5165\u5F0F\u3092\u30EA\u30BB\u30C3\u30C8");
    }
  };
  const addCs = (place = "status") => setF("customStatuses", [...state.customStatuses, { id: `cs-${Date.now()}`, label: "", initial: 0, max: 99, place }]);
  const patchCs = (id, patch) => setF("customStatuses", state.customStatuses.map((c) => c.id === id ? { ...c, ...patch } : c));
  const patchUb = (id, patch) => dispatch({ type: "PATCH_UB", id, patch });
  const rmCs = (id) => setF("customStatuses", state.customStatuses.filter((c) => c.id !== id));
  const dst = state.defaultStatuses || FACTORY_DEFAULT_STATUS;
  const setDst = (list) => setF("defaultStatuses", list);
  const patchDst = (i, patch) => {
    const current = dst[i];
    const nextLabel = typeof patch.label === "string" ? patch.label.trim() : current?.label;
    setDst(dst.map((s, j) => i === j ? { ...s, ...patch } : s));
    if (current?.label && nextLabel && nextLabel !== current.label && Array.isArray(state.ui.statusOrder)) {
      dispatch({ type: "SET_UI", ui: { statusOrder: state.ui.statusOrder.map((label) => label === current.label ? nextLabel : label) } });
    }
  };
  const rmDst = (i) => {
    const removed = dst[i]?.label;
    setDst(dst.filter((_, j) => j !== i));
    if (removed && Array.isArray(state.ui.statusOrder)) {
      dispatch({ type: "SET_UI", ui: { statusOrder: state.ui.statusOrder.filter((label) => label !== removed) } });
    }
  };
  const addDst = () => setDst([...dst, { label: "", initial: 0, max: 99 }]);
  const resetDst = () => {
    if (confirm("\u30C7\u30D5\u30A9\u30EB\u30C8\u30B9\u30C6\u30FC\u30BF\u30B9\u3092\u51FA\u8377\u6642\uFF0816\u9805\u76EE\uFF09\u306B\u623B\u3057\u307E\u3059\u304B\uFF1F")) setDst(FACTORY_DEFAULT_STATUS);
  };
  const h = React.createElement;
  const customStatusRow = (c) => h("div", { key: c.id, className: "settings-custom-status-row" },
    h("input", { className: "input", value: c.label, placeholder: "ステータス名", onChange: (event) => patchCs(c.id, { label: event.target.value }) }),
    h("label", { className: "status-order-number" }, h("span", null, "初"), h("input", { className: "input", type: "number", value: c.initial ?? 0, onChange: (event) => patchCs(c.id, { initial: parseInt(event.target.value) || 0 }) })),
    h("label", { className: "status-order-number" }, h("span", null, "上"), h("input", { className: "input", type: "number", value: c.max ?? 99, onChange: (event) => patchCs(c.id, { max: parseInt(event.target.value) || 0 }) })),
    h("label", { className: "settings-custom-target" }, h("span", null, "出力先"), h("select", { className: "select", value: c.place || "status", onChange: (event) => patchCs(c.id, { place: event.target.value }) }, h("option", { value: "status" }, "ST側"), h("option", { value: "params" }, "ラベル側へ移動"), h("option", { value: "none" }, "出力しない"))),
    h("button", { className: "btn-ghost btn-icon", title: "このステータスを削除", onClick: () => rmCs(c.id) }, h(Icon, { name: "trash", size: 12 }))
  );
  const hiddenCustomRow = (c) => h("div", { key: c.id, className: "settings-hidden-custom-row" },
    h("input", { className: "input", value: c.label, placeholder: "項目名", onChange: (event) => patchCs(c.id, { label: event.target.value }) }),
    h("span", null, "JSONへは出力しません"),
    h("select", { className: "select", value: c.place || "none", onChange: (event) => patchCs(c.id, { place: event.target.value }) }, h("option", { value: "none" }, "出力しない"), h("option", { value: "status" }, "ST側へ移動"), h("option", { value: "params" }, "ラベル側へ移動")),
    h("button", { className: "btn-ghost btn-icon", title: "この項目を削除", onClick: () => rmCs(c.id) }, h(Icon, { name: "trash", size: 12 }))
  );
  const builtinRow = (formula) => {
    const overridden = typeof bov[formula.name] === "string";
    const hidden = bov[formula.name] === null;
    const value = overridden ? bov[formula.name] : formula.expr;
    return h("div", { key: formula.name, style: { display: "grid", gridTemplateColumns: "54px minmax(0, 1fr) auto", gap: "var(--s-2)", alignItems: "center", opacity: hidden ? .55 : 1 } },
      h("span", { className: "badge", style: { color: "var(--gold)", borderColor: "var(--gold-line)", fontFamily: "var(--f-mono)" } }, formula.name),
      hidden ? h("span", { style: { color: "var(--tx-mute)", fontSize: "var(--fs-11)" } }, "出力から非表示") : h("input", { className: "input", value, onChange: (e) => setBov(formula.name, e.target.value), title: `${formula.name}の式` }),
      hidden ? h(Button, { size: "sm", variant: "ghost", icon: "undo", onClick: () => restoreBuiltin(formula.name) }, "復元") : h(Button, { size: "sm", variant: "ghost", icon: "trash", onClick: () => removeBuiltin(formula.name) }, "非表示")
    );
  };
  const effectiveStatuses = React.useMemo(() => {
    const list = [];
    const indexByLabel = new Map();
    const add = (raw, source, initial, max) => {
      const label = String(raw || "").trim();
      if (!label) return;
      if (indexByLabel.has(label)) {
        const current = list[indexByLabel.get(label)];
        current.source = current.source === source ? source : `${current.source}・${source}`;
        return;
      }
      indexByLabel.set(label, list.length);
      list.push({ label, source, initial, max });
    };
    dst.forEach((status) => {
      const linked = status.label === "HP" || status.label === "SAN";
      const initial = linked ? (status.label === "HP" ? state.hp || state.personaSrc?.hp || "?" : state.san || state.personaSrc?.san || "?") : status.initial;
      add(status.label, linked ? "人格連動" : "既定", initial, linked ? initial : status.max);
    });
    (window.LBT_getStateSelfManagedStatusEntries?.(state) || []).forEach((entry) => add(entry.label, entry.kind === "declared" ? "DB指定" : "自己付与", entry.initial ?? 0, entry.max ?? 99));
    (state.uniqueBuffs || []).filter((buff) => (buff.place || "status") === "status" && buff.type !== "中立バフ").forEach((buff) => add(buff.name, "人格固有", buff.initial ?? 0, buff.max ?? 99));
    (state.customStatuses || []).filter((status) => (status.place || "status") === "status").forEach((status) => add(status.label, "カスタム", status.initial ?? 0, status.max ?? 99));
    (window.LBT_collectSkillDiceVars?.(state) || []).filter((variable) => (variable.place || "status") === "status").forEach((variable) => add(variable.label, "スキル変数", variable.initial ?? 0, variable.max ?? 99));
    return list;
  }, [dst, state.hp, state.san, state.personaSrc, state.uniqueBuffs, state.customStatuses, state.egoSlots, state.skills, state.supports, state.enhancements]);
  const sectionSummary = (name, hint, count) => h("summary", null, h("span", { className: "settings-major-name" }, name), h("span", { className: "settings-major-hint" }, hint), count !== undefined ? h("span", { className: "settings-major-count" }, count) : null);
  return h("div", { className: "stack-4 settings-linear" },
    h(Card, { className: "settings-linear-card" },
      h("div", { className: "card-header" }, h("div", null, h("span", { className: "t-label" }, "BUILD PARAMETERS / 設定"), h("div", { className: "settings-header-copy" }, "ステータスは一覧で直接編集・並べ替えできます。代入式と危険な操作は必要なときだけ開きます。"))),
      h("div", { className: "card-body settings-linear-stack" },
        (state.selfStatusCandidates || []).length ? h("section", { className: "self-status-candidate-panel stack-2", "aria-label": "自己管理ステータスの検出候補" },
          h("div", { className: "settings-subhead" }, h("span", null, "自己管理ステータスの検出候補"), h("span", null, `${state.selfStatusCandidates.length}件・確認待ち`)),
          h("div", { className: "settings-section-note" }, "共通辞書にない文面候補です。DB指定と「得る／自分に付与」の根拠がある主要状態は自動で統合されます。ここでは根拠を確認し、追加する名称だけを選んでください。"),
          state.selfStatusCandidates.map((candidate) => h("div", { key: candidate.id, className: "self-status-candidate-row" },
            h("div", { className: "self-status-candidate-main" }, h("strong", null, candidate.label), h("span", null, `${candidate.source}${candidate.skillName ? ` / ${candidate.skillName}` : ""}`), h("small", null, candidate.evidence)),
            h("div", { className: "self-status-candidate-actions" }, h(Button, { size: "sm", variant: "secondary", icon: "check", onClick: () => dispatch({ type: "CONFIRM_SELF_STATUS_CANDIDATE", id: candidate.id }) }, "ステータスへ追加"), h(Button, { size: "sm", variant: "ghost", icon: "x", onClick: () => dispatch({ type: "DISMISS_SELF_STATUS_CANDIDATE", id: candidate.id }) }, "今回は追加しない"))
          ))
        ) : null,
        h("section", { className: "settings-major settings-major--static", "data-settings-category": "statuses" },
          h("div", { className: "settings-major-static-head" }, h("span", { className: "settings-major-name" }, "ステータス"), h("span", { className: "settings-major-hint" }, "一覧・既定編集・出力順をこのまま操作"), h("span", { className: "settings-major-count" }, `${effectiveStatuses.length}件`)),
          h("div", { className: "settings-major-body stack-3" },
            h(StatusOrderPanel, { state, dispatch, embedded: true, onPatchDefault: patchDst, onPatchUnique: patchUb, onRemoveDefault: rmDst, onAddDefault: addDst, onResetDefaults: resetDst }),
            h("details", { className: "settings-disclosure" }, h("summary", null, "カスタムST項目を編集"), h("div", { className: "settings-disclosure-body stack-2" },
              h("p", { className: "settings-section-note" }, "ST側は増減する数値です。ここで追加した項目は、上のステータス一覧とCCFOLIA JSONのstatusに反映されます。"),
              h("div", { className: "settings-local-actions" }, h(Button, { size: "sm", variant: "ghost", icon: "plus", onClick: () => addCs("status") }, "ST項目を追加")),
              (state.customStatuses || []).filter((item) => (item.place || "status") === "status").length ? h("div", { className: "settings-custom-status-list" }, (state.customStatuses || []).filter((item) => (item.place || "status") === "status").map(customStatusRow)) : h("div", { className: "empty", style: { padding: "var(--s-3)" } }, "カスタムST項目はありません")
            ))
          )
        ),
        h("section", { className: "settings-major settings-major--static", "data-settings-category": "labels" },
          h("div", { className: "settings-major-static-head" }, h("span", { className: "settings-major-name" }, "ラベル"), h("span", { className: "settings-major-hint" }, "params出力・式からの参照"), h("span", { className: "settings-major-count" }, `${1 + (state.customStatuses || []).filter((item) => (item.place || "status") === "params").length + (state.uniqueBuffs || []).filter((item) => (item.place || "status") === "params").length + (window.LBT_collectSkillDiceVars?.(state) || []).filter((item) => item.place === "params").length}件`)),
          h("div", { className: "settings-major-body stack-3" },
            h(LabelParamsPanel, { state, onAddCustom: addCs, onPatchCustom: patchCs, onRemoveCustom: rmCs, onPatchMorale: (value) => setF("moraleLine", value) }),
            h("details", { className: "settings-disclosure" }, h("summary", null, "出力しないカスタム項目"), h("div", { className: "settings-disclosure-body stack-2" },
              h("p", { className: "settings-section-note" }, "ここにある項目はメモ用で、CCFOLIA JSONのstatusにもparamsにも出力されません。"),
              h("div", { className: "settings-local-actions" }, h(Button, { size: "sm", variant: "ghost", icon: "plus", onClick: () => addCs("none") }, "項目を追加")),
              (state.customStatuses || []).filter((item) => (item.place || "status") === "none").length ? h("div", { className: "settings-hidden-custom-list" }, (state.customStatuses || []).filter((item) => (item.place || "status") === "none").map(hiddenCustomRow)) : h("div", { className: "empty", style: { padding: "var(--s-3)" } }, "出力しない項目はありません")
            ))
          )
        ),
        h("details", { className: "settings-major", "data-settings-category": "share" },
          sectionSummary("同期情報の表示", "共有HTML・各種出力の人格情報表示"),
          h("div", { className: "settings-major-body stack-2" },
            h("label", { className: "settings-check-row" }, h("input", { type: "checkbox", checked: state.shareOptions?.showSyncRank !== false, onChange: (event) => setF("shareOptions", { ...(state.shareOptions || {}), showSyncRank: event.target.checked }) }), "同期ランクを共有HTMLへ表示"),
            h("label", { className: "settings-check-row" }, h("input", { type: "checkbox", checked: state.shareOptions?.showSyncRankInOutput === true, onChange: (event) => setF("shareOptions", { ...(state.shareOptions || {}), showSyncRankInOutput: event.target.checked }) }), "同期ランクをMEMO・PALETTEへ表示"),
            h("p", { className: "settings-section-note" }, "同期MAXは同期ランクとは別状態です。設定されている場合は、共有HTML・MEMOの人格名に[MAX]を常に付記します。")
          )
        ),
        h("details", { className: "settings-major", "data-settings-category": "formulas" },
          sectionSummary("代入式", "組込式・カスタム式・出力補助", `${DEFAULT_FMLs.length + state.formulas.length}式`),
          h("div", { className: "settings-major-body stack-3" },
            h("p", { className: "settings-section-note" }, "式は一行ずつ確認できます。編集・非表示・追加は必要な小カテゴリだけを開いて行います。"),
            h("details", { className: "settings-disclosure" }, h("summary", null, "組込式（MT / DM / DT / QB）"), h("div", { className: "settings-disclosure-body stack-2" },
              h("div", { className: "settings-local-actions is-danger" }, h(Button, { size: "sm", variant: "danger", icon: "trash", onClick: resetAllFormulas }, "式を全リセット")),
              h("div", { className: "stack-2 settings-formula-list" }, DEFAULT_FMLs.map(builtinRow))
            )),
            h("details", { className: "settings-disclosure" }, h("summary", null, "カスタム代入式"), h("div", { className: "settings-disclosure-body stack-2" },
              h("div", { className: "settings-local-actions" }, h(Button, { size: "sm", icon: "plus", onClick: addFml }, "式を追加")),
              state.formulas.length ? h("div", { className: "stack-2" }, state.formulas.map((formula, i) => h("div", { key: formula.id, className: "settings-formula-row" },
                h("div", { className: "reorder-btns" },
                  h("button", { className: "reorder-btn", disabled: i === 0, onClick: () => dispatch({ type: "REORDER_LIST", field: "formulas", key: formula.id, dir: -1 }), title: "上へ" }, h(Icon, { name: "arrowU", size: 10 })),
                  h("button", { className: "reorder-btn", disabled: i === state.formulas.length - 1, onClick: () => dispatch({ type: "REORDER_LIST", field: "formulas", key: formula.id, dir: 1 }), title: "下へ" }, h(Icon, { name: "arrowD", size: 10 }))
                ),
                h("input", { className: "input", value: formula.name, placeholder: "変数名", onChange: (event) => patchFml(formula.id, { name: event.target.value }) }),
                h("input", { className: "input", value: formula.expr, placeholder: "式", onChange: (event) => patchFml(formula.id, { expr: event.target.value }) }),
                h("button", { className: "btn-ghost btn-icon", onClick: () => rmFml(formula.id), title: "削除" }, h(Icon, { name: "trash", size: 12 }))
              ))) : h("div", { className: "empty", style: { padding: "var(--s-3)" } }, "カスタム代入式はありません")
            )),
            h("details", { className: "settings-disclosure" }, h("summary", null, "出力補助"), h("div", { className: "settings-disclosure-body stack-2" },
              h("label", { className: "settings-check-row" }, h("input", { type: "checkbox", checked: state.autoFml !== false, onChange: (event) => setF("autoFml", event.target.checked) }), "効果テキストから代入式へ自動反映"),
              h(Field, { label: "士気低下ライン" }, h("input", { className: "input", type: "number", value: state.moraleLine, onChange: (event) => setF("moraleLine", event.target.value) })),
              h(Field, { label: "追記コマンド" }, h(AutoTextarea, { className: "textarea", minRows: 2, value: state.extraCmd, placeholder: "自由記述（出力末尾に追加）", onChange: (event) => setF("extraCmd", event.target.value) }))
            ))
          )
        ),
        h("details", { className: "settings-major settings-major--danger", "data-settings-category": "danger" },
          sectionSummary("危険な操作", "作業状態・保存データの削除"),
          h("div", { className: "settings-major-body settings-local-actions is-danger" },
            h(Button, { size: "md", variant: "danger", icon: "trash", onClick: () => { if (confirm("全ての入力をクリアしますか？（所持・お気に入り・履歴は保持）")) { dispatch({ type: "RESET" }); toast("入力をクリアしました"); } } }, "作業状態をクリア"),
            h(Button, { size: "md", variant: "danger", icon: "trash", onClick: () => { if (confirm("保存済みデータも完全に削除しますか？")) { localStorage.removeItem("lbt_v46_state"); location.reload(); } } }, "保存データを完全削除")
          )
        )
      )
    )
  );
};
Object.assign(window, {
  BaseSection,
  PassiveSection,
  SupportSection,
  EgoSection,
  SpiritSection,
  EnhancementSection,
  RosterSection,
  SettingsSection,
  UniqueBuffsBlock
  // v52 (F): PersonaCodex 末尾で使う
});
