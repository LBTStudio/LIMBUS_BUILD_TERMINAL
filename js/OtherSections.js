const SIN_LIST = ["\u61A4\u6012", "\u8272\u6B32", "\u6020\u60F0", "\u66B4\u98DF", "\u6182\u9B31", "\u50B2\u6162", "\u5AC9\u59AC"];
/* SUPPORT_DEATH_RE は state.js で宣言済み（クラシックスクリプト共通グローバル）。重複宣言は読み込みエラーになるため除去。 */
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
const getEgoResourceNames = (ego) => new Set(parseEgoResources(ego?.resources).map((entry) => entry.sin).filter((sin) => EGO_RESOURCE_NAMES.includes(sin)));
const egoMatchesResourceFilters = (ego, requiredResources = [], excludedResources = []) => {
  const resources = getEgoResourceNames(ego);
  return requiredResources.every((sin) => resources.has(sin)) && !excludedResources.some((sin) => resources.has(sin));
};
window.LBT_egoMatchesResourceFilters = egoMatchesResourceFilters;
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
  const [imgBroken, setImgBroken] = React.useState(false);
  const SHARE_IMAGE_TARGET_BYTES = window.LBT_shareLink?.SHARE_IMAGE_TARGET_BYTES || 32 * 1024;
  const shareImageBytes = window.LBT_shareLink?.shareImageBytes || ((value) => {
    const match = /^data:image\/(webp|jpeg);base64,([A-Za-z0-9+/]+=*)$/i.exec(String(value || ""));
    if (!match) return 0;
    const padding = match[2].endsWith("==") ? 2 : match[2].endsWith("=") ? 1 : 0;
    return Math.max(0, Math.floor(match[2].length * 3 / 4) - padding);
  });
  const currentShareImageBytes = shareImageBytes(state.shareImageData);
  const currentShareImageOk = !state.shareImageData || currentShareImageBytes > 0 && currentShareImageBytes <= SHARE_IMAGE_TARGET_BYTES;
  /* 共有画像・アカウントアイコンは core.js の同じ圧縮実装を共有する。
     二重実装だと片方だけが改善され、「アイコンは軽いが共有画像は重い」
     というズレが生じる。ここでは OGP 用の設定（1200x630・32KB）で呼ぶ。 */
  const compressShareImage = (file) => window.LBT_core.compressImageToDataUrl(file, {
    label: "共有画像",
    targetBytes: SHARE_IMAGE_TARGET_BYTES,
    aspect: 630 / 1200
  });
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
  /* 差し替えたら読み込み状態は戻す（前の画像の失敗状態を引き継がない）。 */
  React.useEffect(() => { setImgBroken(false); }, [imgList[imgTab]]);
  const activeImg = imgList[imgTab] || "";
  const [editOpen, setEditOpen] = React.useState(false);
  return /* @__PURE__ */ React.createElement("div", { className: "pc-sheet" },
    /* 立ち絵が主役。左の主役枠と右の識別・駒設定でシートを構成する。 */
    /* @__PURE__ */ React.createElement("figure", { className: "pc-portrait" },
      /* @__PURE__ */ React.createElement("div", { className: "pc-portrait-frame" },
        activeImg && !imgBroken && /* @__PURE__ */ React.createElement("img", {
          className: "pc-portrait-img",
          src: activeImg,
          alt: `立ち絵${imgList.length > 1 ? `（${imgTab + 1}枚目 / 全${imgList.length}枚）` : ""}`,
          onError: () => setImgBroken(true)
        }),
(!activeImg || imgBroken) && /* @__PURE__ */ React.createElement("div", { className: "pc-portrait-empty" },
      /* @__PURE__ */ React.createElement("span", { className: "pc-portrait-empty-mark" }, "◈"),
      /* @__PURE__ */ React.createElement("span", { className: "pc-portrait-empty-text" }, imgBroken ? "画像を読み込めませんでした" : "立ち絵なし"),
      /* @__PURE__ */ React.createElement("span", { className: "pc-portrait-empty-hint" }, imgBroken
        ? "URLが正しいか確認してください（https:// で始まる文字列）"
        : "下の「立ち絵URL / 共有画像を編集」から設定できます")
      ),
        imgList.length > 1 && /* @__PURE__ */ React.createElement("span", { className: "pc-portrait-badge" }, `${imgTab + 1} / ${imgList.length}`)
      ),
      /* @__PURE__ */ React.createElement("figcaption", { className: "pc-portrait-caption" },
        /* @__PURE__ */ React.createElement("span", { className: "pc-portrait-caption-label" }, "PORTRAIT / 立ち絵"),
        imgList.length > 1 && /* @__PURE__ */ React.createElement("span", { className: "pc-portrait-caption-note" }, `${imgList.length} 枚`)
      )
    ),
    /* @__PURE__ */ React.createElement("div", { className: "pc-identity" },
      /* @__PURE__ */ React.createElement("div", { className: "pc-id-head" },
        /* @__PURE__ */ React.createElement("span", { className: "pc-id-eyebrow" }, "CHARACTER NAME"),
        /* @__PURE__ */ React.createElement("input", {
          className: "pc-name-input",
          value: state.charName,
          placeholder: "例：ユサ",
          onChange: (e) => setF("charName", e.target.value),
          "aria-label": "キャラクター名"
        })
      ),
      /* @__PURE__ */ React.createElement("div", { className: "pc-id-sub" },
        /* @__PURE__ */ React.createElement("span", { className: "pc-id-eyebrow" }, "PLAYER"),
        /* @__PURE__ */ React.createElement("input", {
          className: "pc-pl-input",
          value: state.plName,
          placeholder: "PL名",
          onChange: (e) => setF("plName", e.target.value),
          "aria-label": "プレイヤー名"
        })
      ),
      /* 駒の設定はシートの能力値タイルと同じ見出しで並べる。 */
      /* @__PURE__ */ React.createElement("div", { className: "pc-stats" },
        /* @__PURE__ */ React.createElement("div", { className: "pc-stat" },
          /* @__PURE__ */ React.createElement("span", { className: "pc-stat-label" }, "INITIATIVE"),
          /* @__PURE__ */ React.createElement("span", { className: "pc-stat-jp" }, "駒の行動順"),
          /* @__PURE__ */ React.createElement("input", {
            className: "pc-stat-input",
            type: "number",
            step: "1",
            inputMode: "numeric",
            value: state.initiative ?? 0,
            onChange: (e) => setF("initiative", e.target.value),
            title: "CCFOLIAの駒のイニシアチブ（数値が大きいほど先に行動）",
            "aria-label": "駒の行動順"
          })
        ),
        /* @__PURE__ */ React.createElement("div", { className: "pc-stat" },
          /* @__PURE__ */ React.createElement("span", { className: "pc-stat-label" }, "COLOR"),
          /* @__PURE__ */ React.createElement("span", { className: "pc-stat-jp" }, "駒の色"),
          /* @__PURE__ */ React.createElement("div", { className: "pc-color" },
            /* @__PURE__ */ React.createElement("span", { className: "pc-color-swatch", style: { background: state.color } }),
            /* @__PURE__ */ React.createElement("input", {
              className: "pc-color-picker",
              type: "color",
              value: state.color,
              onChange: (e) => setF("color", e.target.value),
              title: "駒の色を選ぶ",
              "aria-label": "駒の色"
            }),
            /* @__PURE__ */ React.createElement("input", {
              className: "pc-stat-input pc-color-hex",
              value: state.color,
              onChange: (e) => setF("color", e.target.value),
              title: "駒の色を16進数で直接指定",
              "aria-label": "駒の色（16進数）"
            })
          )
        )
      )
    ),
    /* 立ち絵の差し替えは頻度が低いので、既定は閉じてカードだけを見せる。 */
    /* @__PURE__ */ React.createElement("details", { className: "pc-edit", open: editOpen || undefined, onToggle: (event) => setEditOpen(event.currentTarget.open) },
      /* @__PURE__ */ React.createElement("summary", { className: "pc-edit-summary" },
        /* @__PURE__ */ React.createElement("span", { className: "pc-edit-caret" }, "▶"),
        "立ち絵URL / 共有画像を編集"
      ),
      /* @__PURE__ */ React.createElement("div", { className: "pc-edit-body stack-3" },
        /* @__PURE__ */ React.createElement(Field, {
          label: "IMAGE URL / 立ち絵URL（複数行可、1行目=基本、以降=差分）",
          hint: "CCFOLIA でキャラクターシートを作り、立ち絵をアップロードしたら、その画像の URL をここに貼り付けてください（https:// で始まる文字列）。複数ある場合は1行に1枚、次の行が差分として扱われます。"
        }, /* @__PURE__ */ React.createElement("textarea", { className: "textarea", rows: 4, placeholder: "https://...", value: state.imgUrls, onChange: (e) => setF("imgUrls", e.target.value), style: { whiteSpace: "pre", overflowX: "auto", overflowWrap: "normal", wordBreak: "keep-all", fontFamily: "var(--f-mono)" } })),
        imgList.length > 1 && /* @__PURE__ */ React.createElement("div", { className: "pc-edit-tabs" }, imgList.map((url, i) => /* @__PURE__ */ React.createElement("button", { key: i, type: "button", className: `pc-thumb${imgTab === i ? " is-on" : ""}`, onClick: () => setImgTab(i), title: `${i + 1}枚目の立ち絵を表示`, "aria-pressed": imgTab === i }, /* @__PURE__ */ React.createElement("img", { src: url, alt: `立ち絵${i + 1}`, loading: "lazy" }), /* @__PURE__ */ React.createElement("span", { className: "pc-thumb-idx" }, String(i + 1))))),
        /* @__PURE__ */ React.createElement(Field, { label: "SHARE IMAGE / 共有シート画像", hint: "共有HTMLへ同梱する公開画像です。縦長の立ち絵は左右余白を抑えて上半身を自動フォーカスし、最大1200×630・32KB以下へ圧縮します" },
          /* @__PURE__ */ React.createElement("div", { className: "stack-2" },
            /* @__PURE__ */ React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } },
              /* @__PURE__ */ React.createElement("label", { className: "btn btn-sm", style: { cursor: shareImageBusy ? "wait" : "pointer", opacity: shareImageBusy ? .7 : 1 } }, shareImageBusy ? "画像を最適化中…" : "画像を選択", /* @__PURE__ */ React.createElement("input", { type: "file", accept: "image/png,image/jpeg,image/webp", disabled: shareImageBusy, onChange: onShareImageSelected, style: { display: "none" } })),
              state.shareImageData && /* @__PURE__ */ React.createElement("button", { type: "button", className: "btn btn-sm btn-ghost", onClick: () => { setF("shareImageData", ""); setF("shareImageBlockedReason", ""); setShareImageError(""); }, title: "共有画像を削除" }, "共有画像を削除")
            ),
            state.shareImageData && /* @__PURE__ */ React.createElement("div", { className: "base-img-preview share-image-preview" }, /* @__PURE__ */ React.createElement("div", { className: "base-img-preview-label" }, "SHARE PREVIEW / 共有シート画像"), /* @__PURE__ */ React.createElement("img", { src: state.shareImageData, alt: "共有シート画像プレビュー", className: "base-img-preview-img" }), /* @__PURE__ */ React.createElement("div", { className: currentShareImageOk ? "base-auto-note" : "base-img-preview-err", style: { marginTop: 8, display: "block" } }, currentShareImageOk ? `圧縮見込み: ${Math.ceil(currentShareImageBytes / 1024)}KB / 32KB — 共有リンクを発行できます` : `圧縮見込み: ${Math.ceil(currentShareImageBytes / 1024)}KB / 32KB — 上限超過のため共有リンクは発行しません。再アップロードしてください`)),
            shareImageError && /* @__PURE__ */ React.createElement("div", { className: "base-img-preview-err", style: { display: "block" } }, shareImageError)
          )
        )
      )
    )
  );
};
const PassiveCard = ({ title, pas, sin, scope }) => /* @__PURE__ */ React.createElement("div", { className: "deck-card deck-focus", "data-sin": sin || "", style: { padding: "var(--s-4)" } }, /* @__PURE__ */ React.createElement("div", { className: "deck-card-head", style: { marginBottom: "var(--s-3)" } }, /* @__PURE__ */ React.createElement(
  "span",
  {
    className: "deck-rank",
    style: { background: "var(--gold-tint)", color: "var(--gold)", border: "1px solid var(--gold-line)", padding: "4px 10px", fontFamily: "var(--f-display)", fontWeight: 600, fontSize: "var(--fs-12)", borderRadius: "var(--r-sm)", letterSpacing: "0.08em" }
  },
  title
), pas.cond && /* @__PURE__ */ React.createElement("span", { className: "cond-chips-lg", style: { marginLeft: 8 } }, /* @__PURE__ */ React.createElement(CondChips, { cond: pas.cond }))), /* @__PURE__ */ React.createElement("div", { className: "deck-name", style: { fontFamily: "var(--f-display)", fontWeight: 700, fontSize: "var(--fs-18)", color: "var(--tx)", marginBottom: "var(--s-3)", lineHeight: 1.2 } }, pas.name), /* @__PURE__ */ React.createElement("div", { className: "stack-3" }, pas.always && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--f-display)", fontSize: "var(--fs-9)", letterSpacing: "0.18em", color: "var(--gold)", textTransform: "uppercase", marginBottom: 4 } }, "ALWAYS / \u5E38\u6642\u52B9\u679C"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-12)", color: "var(--tx-2)", lineHeight: 1.7, padding: "8px 12px", background: "var(--gold-tint)", border: "1px solid var(--gold-line)", borderLeft: "3px solid var(--gold)", borderRadius: "var(--r-sm)", whiteSpace: "pre-wrap" } }, window.LBT_GLOSSARY_TEXT ? window.LBT_GLOSSARY_TEXT(pas.always, scope || "人格パッシブ") : pas.always)), pas.effect && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--f-display)", fontSize: "var(--fs-9)", letterSpacing: "0.18em", color: "var(--gold)", textTransform: "uppercase", marginBottom: 4 } }, "EFFECT / \u52B9\u679C"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-12)", color: "var(--tx-2)", lineHeight: 1.7, padding: "8px 12px", background: "var(--surface-inset)", border: "1px solid var(--line-dim)", borderLeft: "3px solid var(--gold)", borderRadius: "var(--r-sm)", whiteSpace: "pre-wrap" } }, window.LBT_GLOSSARY_TEXT ? window.LBT_GLOSSARY_TEXT(pas.effect, scope || "人格パッシブ") : pas.effect)), pas.quick && /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--f-mono)", fontSize: "var(--fs-11)", color: "var(--tx-dim)", padding: "4px 8px", background: "var(--surface-2)", borderRadius: "var(--r-sm)" } }, /* @__PURE__ */ React.createElement("span", { style: { color: "var(--gold)" } }, "QUICK"), " ", pas.quick)));
const PassiveSection = ({ state, dispatch }) => {
  const h = React.createElement;
  const editable = canEditPersonaState(state);
  const extras = Array.isArray(state.extraPassives) ? state.extraPassives : [];
  const patchPas = (patch) => dispatch({ type: "PATCH_PAS", patch });
  const patchExtra = (index, patch) => dispatch({ type: "PATCH_EXTRA_PASSIVE", index, patch });
  const addPassive = () => {
    if (!editable) {
      toast("パッシブの追加は編集モード時のみ可能です");
      return;
    }
    dispatch({ type: "ADD_EXTRA_PASSIVE" });
  };
  const removePassive = (index) => dispatch({ type: "REMOVE_EXTRA_PASSIVE", index });
  // null=未選択（既定表示）／true=編集欄／false=閲覧カード。
  const [forceEdit, setForceEdit] = React.useState(null);
  const src = state.personaSrc;
  const passiveGlossaryScope = src?.name ? "人格パッシブ:" + src.name : "人格パッシブ";
  const isAutoFromDB = !!src && !editable && !forceEdit && state.pas.name === (src.passive_name || "") && !!state.pas.name;
  const primarySin = src ? window.getPrimarySin ? window.getPrimarySin(src) : null : null;
  // 同期編集（手動編集）中は編集欄を既定表示にし、閲覧専用の人格だけカードを既定にする。
  // 利用者が明示的に切り替えた場合は、その選択（forceEdit）を常に優先する。
  const hasAnyPassive = !!state.pas?.name || extras.some((pas) => pas && pas.name);
  const isPassiveReadView = hasAnyPassive && (forceEdit === null ? !editable : forceEdit === false);

  const renderEditor = (pas, { key, title, onPatch, onRemove }) => h(Card, { key, className: onRemove ? "mt-3" : undefined },
    h("div", { className: "card-header", style: { justifyContent: "space-between" } },
      h("span", { className: "t-label" }, title),
      onRemove ? h(Button, { variant: "ghost", size: "sm", onClick: onRemove, disabled: !editable, icon: "x" }, "このパッシブを削除") : null),
    h("div", { className: "card-body stack-3" },
      h("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--s-3)" } },
        h(Field, { label: "パッシブ名" }, h("input", { className: "input", placeholder: "例：掬り出し", value: pas.name || "", disabled: !editable, onChange: (e) => onPatch({ name: e.target.value }) })),
        h(Field, { label: "発動条件" }, h("input", { className: "input", placeholder: "例：色欲x2 共鳴", value: pas.cond || "", disabled: !editable, onChange: (e) => onPatch({ cond: e.target.value }) }))),
      h(Field, { label: "常時効果（任意）" }, h("textarea", { className: "textarea", rows: 2, placeholder: "常時発動する効果", value: pas.always || "", disabled: !editable, onChange: (e) => onPatch({ always: e.target.value }) })),
      h(Field, { label: "効果" }, h("textarea", { className: "textarea", rows: 3, placeholder: "例：マッチ勝利時、対象が出血状態なら…", value: pas.effect || "", disabled: !editable, onChange: (e) => onPatch({ effect: e.target.value }) })),
      h(Field, { label: "クイックパレット（:コマンド）", hint: "例：:出血+1 :出血-1（人格DBから自動抽出可）" }, h("input", { className: "input", placeholder: ":出血+1 :出血-1", value: pas.quick || "", disabled: !editable, onChange: (e) => onPatch({ quick: e.target.value }) }))));

  if (isPassiveReadView) return h("div", { className: "stack-6 passive-read-workspace" },
    h("div", { className: "passive-read-toolbar" },
      h("div", { className: "passive-read-copy" },
        h("span", { className: "section-title-num", style: { fontSize: "var(--fs-18)" } }, "A"),
        h("div", null,
          h("div", { className: "passive-read-title" }, "PERSONA PASSIVE / 人格パッシブ"),
          h("div", { className: "passive-read-note" }, "内容はカードで確認し、変更が必要なときだけ編集を開きます。"))),
      editable ? h(Button, { variant: "ghost", size: "sm", icon: "edit", onClick: () => setForceEdit(true) }, "この枠を編集") : null),
    h(PassiveCard, { title: "PERSONA PASSIVE / 人格パッシブ", pas: state.pas, sin: primarySin, scope: passiveGlossaryScope }),
    extras.map((pas, index) => (pas && pas.name
      ? h(PassiveCard, { key: pas.id || index, title: `PASSIVE ${index + 2} / 追加パッシブ`, pas, sin: primarySin, scope: passiveGlossaryScope })
      : null)),
    editable ? h("div", { className: "passive-read-add" }, h(Button, { variant: "ghost", icon: "plus", onClick: () => { addPassive(); setForceEdit(true); }, title: "追加パッシブを追加（上限なし）" }, "追加パッシブを追加")) : null);

  return h("div", { className: "stack-6" },
    h("div", null,
      h("div", { style: { display: "flex", alignItems: "baseline", gap: "var(--s-3)", marginBottom: "var(--s-3)", paddingBottom: "var(--s-2)", borderBottom: "1px solid var(--line-dim)" } },
        h("span", { className: "section-title-num", style: { fontSize: "var(--fs-18)" } }, "A"),
        h("span", { style: { fontFamily: "var(--f-display)", fontWeight: 700, fontSize: "var(--fs-16)", letterSpacing: "0.06em", color: "var(--tx)" } }, "PERSONA PASSIVE / 人格パッシブ"),
        h("div", { style: { flex: 1 } }),
        editable && isAutoFromDB ? h(Button, { variant: "ghost", size: "sm", icon: "edit", onClick: () => setForceEdit(true) }, "手動編集") : null,
        state.pas?.name ? h(Button, { variant: "ghost", size: "sm", icon: "eye", onClick: () => setForceEdit(false) }, "カード表示に戻す") : null),
      isAutoFromDB
        ? h(PassiveCard, { title: "PERSONA PASSIVE / 人格パッシブ", pas: state.pas, sin: primarySin, scope: passiveGlossaryScope })
        : renderEditor(state.pas, { key: "primary", title: "PERSONA PASSIVE / 人格パッシブ", onPatch: patchPas }),
      extras.map((pas, index) => renderEditor(pas, {
        key: pas.id || `extra-${index}`,
        title: `PASSIVE ${index + 2} / 追加パッシブ`,
        onPatch: (patch) => patchExtra(index, patch),
        onRemove: () => removePassive(index)
      })),
      h("div", { style: { marginTop: "var(--s-3)" } },
        h(Button, { variant: "ghost", icon: "plus", onClick: addPassive, title: editable ? "追加パッシブを追加（上限なし）" : "編集モード時のみ追加可能" }, "追加パッシブを追加"))));
};
/* 手動で選べる固有バフの種別。DB実測（バフ/デバフ/中立バフ/固有バフ/固有弾丸/その他）と
   草案取込が解釈する語（中立デバフ/特別処理）の和集合。 */
const UB_TYPE_OPTIONS = ["バフ", "デバフ", "中立バフ", "中立デバフ", "固有バフ", "固有弾丸", "その他", "特別処理"];
const ubCountValue = (value) => {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const UniqueBuffsBlock = ({ state, dispatch }) => {
  const editable = canEditPersonaState(state);
  const h = React.createElement;
  return h("div", { className: "unique-block" },
    h("div", { className: "unique-header" },
      h("div", { className: "unique-header-icon" }, "\u25C6"),
      h("div", { className: "unique-header-text" },
        h("div", { className: "unique-header-title" }, "UNIQUE STATUS / \u56fa\u6709\u30d0\u30d5\u30fb\u30b9\u30c6\u30fc\u30bf\u30b9"),
        h("div", { className: "unique-header-sub" }, "人格DB\u304b\u3089 ", h("b", { style: { color: "var(--gold)" } }, "\u81ea\u52d5\u62bd\u51fa\u3055\u308c\u305f\u56fa\u6709\u30d0\u30d5"), "\u306f\u88c5\u5099\u6642\u306b\u3053\u3053\u3078\u73fe\u308c\u307e\u3059\u3002\u624b\u52d5\u3067\u3082\u8ffd\u52a0/\u7de8\u96c6/\u524a\u9664\u53ef\u80fd\u3002")
      ),
      h(Button, { variant: "primary", size: "sm", icon: "plus", disabled: !editable, title: editable ? "\u624b\u52d5\u8ffd\u52a0" : "\u7de8\u96c6\u30e2\u30fc\u30c9\u6642\u306e\u307f\u8ffd\u52a0\u53ef\u80fd", onClick: () => editable && dispatch({ type: "ADD_UB" }) }, "\u624b\u52d5\u8ffd\u52a0")
    ),
    state.uniqueBuffs.length === 0
      ? h("div", { className: "unique-empty" },
          h("div", { style: { fontSize: "var(--fs-24)", color: "var(--tx-mute)", marginBottom: 6 } }, "\u2014"),
          h("div", { style: { fontFamily: "var(--f-display)", fontSize: "var(--fs-12)", color: "var(--tx-dim)", letterSpacing: "0.06em", marginBottom: 4 } }, state.personaSrc ? `\u300E${state.personaSrc.name}\u300F\u306b\u306fDB\u767b\u9332\u306e\u56fa\u6709\u30d0\u30d5\u304c\u3042\u308a\u307e\u305b\u3093` : "人格未装備 \u2014 \u4e0a\u306e\u4e00\u89a7\u304b\u3089\u88c5\u5099\u3057\u3066\u304f\u3060\u3055\u3044"),
          h("div", { style: { fontSize: "var(--fs-11)", color: "var(--tx-mute)", lineHeight: 1.6 } }, "\u56fa\u6709\u30d0\u30d5\u306f\u88c5\u5099\u6642\u306b\u3053\u3053\u3078\u73fe\u308c\u307e\u3059\u3002\u624b\u52d5\u3067\u3082\u8ffd\u52a0/\u7de8\u96c6/\u524a\u9664\u53ef\u80fd\u3002")
        )
      : h("div", { className: "ubc-grid" }, state.uniqueBuffs.map((b, i) =>
          h("article", { key: b.id, className: "ubc-card", "data-type": b.type || "" },
            editable
              /* 同期編集（手動編集）中はカードをそのまま入力欄にする。
                 追加した固有バフをその場で書けないと「手動追加」が意味を持たない。 */
              ? h("div", { className: "ubc-edit" },
                  h("label", { className: "ubc-field" }, h("span", null, "名称"),
                    h("input", { className: "input", value: b.name || "", placeholder: "例：呼吸", onChange: (e) => dispatch({ type: "PATCH_UB", id: b.id, patch: { name: e.target.value } }) })),
                  h("div", { className: "ubc-edit-row" },
                    h("label", { className: "ubc-field" }, h("span", null, "種別"),
                      h("select", { className: "input", value: b.type || "バフ", onChange: (e) => dispatch({ type: "PATCH_UB", id: b.id, patch: { type: e.target.value } }) },
                        (UB_TYPE_OPTIONS.includes(b.type) || !b.type ? UB_TYPE_OPTIONS : [...UB_TYPE_OPTIONS, b.type]).map((type) => h("option", { key: type, value: type }, type)))),
                    h("label", { className: "ubc-field" }, h("span", null, "出力先"),
                      h("select", { className: "input", value: b.place || "status", onChange: (e) => dispatch({ type: "PATCH_UB", id: b.id, patch: { place: e.target.value } }) },
                        h("option", { value: "status" }, "ステータス側"),
                        h("option", { value: "params" }, "パラメータ側"),
                        h("option", { value: "none" }, "登録先なし")))),
                  h("div", { className: "ubc-edit-row" },
                    h("label", { className: "ubc-field" }, h("span", null, "初期値"),
                      h("input", { className: "input", type: "number", min: "0", value: String(b.initial ?? 0), onChange: (e) => dispatch({ type: "PATCH_UB", id: b.id, patch: { initial: ubCountValue(e.target.value) } }) })),
                    h("label", { className: "ubc-field" }, h("span", null, "最大値"),
                      h("input", { className: "input", type: "number", min: "0", value: String(b.max ?? 0), onChange: (e) => dispatch({ type: "PATCH_UB", id: b.id, patch: { max: ubCountValue(e.target.value) } }) }))),
                  h("label", { className: "ubc-check" },
                    h("input", { type: "checkbox", checked: b.noST === true, onChange: (e) => dispatch({ type: "PATCH_UB", id: b.id, patch: { noST: e.target.checked } }) }),
                    "ST・ラベルへ出さない（対象に付与など）"),
                  h("label", { className: "ubc-field" }, h("span", null, "説明"),
                    h("textarea", { className: "textarea", rows: 3, value: b.desc || "", onChange: (e) => dispatch({ type: "PATCH_UB", id: b.id, patch: { desc: e.target.value } }) })))
              : h(React.Fragment, null,
                  h("div", { className: "ubc-card-top" },
                    h("div", { className: "ubc-name", title: b.name || "" }, b.name || "\u672a\u547d\u540d"),
                    b.type && h("span", { className: "ubc-type", "data-type": b.type, "data-kind": b.type }, b.type),
                    b.place && b.place !== "none" && h("span", { className: "ubc-place" }, b.place === "params" ? "\u30d1\u30e9\u30e1\u30fc\u30bf\u5074" : "\u30b9\u30c6\u30fc\u30bf\u30b9\u5074")
                  ),
                  h("div", { className: "ubc-count" }, "\u521d\u671f ", h("b", null, String(b.initial ?? 0)), " / \u6700\u5927 ", String(b.max || 0)),
                  b.desc && h("div", { className: "ubc-desc", title: b.desc }, b.desc)),
            editable && h("div", { className: "ubc-tools" },
              h("button", { className: "reorder-btn", onClick: () => dispatch({ type: "REORDER_LIST", field: "uniqueBuffs", key: b.id, dir: -1 }), disabled: i === 0, title: "\u4e0a\u3078" }, h(Icon, { name: "arrowU", size: 10 })),
              h("button", { className: "reorder-btn", onClick: () => dispatch({ type: "REORDER_LIST", field: "uniqueBuffs", key: b.id, dir: 1 }), disabled: i === state.uniqueBuffs.length - 1, title: "\u4e0b\u3078" }, h(Icon, { name: "arrowD", size: 10 })),
              h("button", { className: "btn btn-sm lbt-del", onClick: () => dispatch({ type: "REMOVE_UB", id: b.id }), title: "\u3053\u306e\u56fa\u6709\u30d0\u30d5\u3092\u524a\u9664" }, h(Icon, { name: "trash", size: 12 }), " \u524a\u9664")
            )
          )
        ))
  );
};

const SOURCE_OPTIONS = [["all", "全て"], ["core", "ルールブック"], ["supplement", "アンロックド・シンク"], ["pack1", "特定抽出パック"]];
const catalogSource = (entry) => entry?.source || "core";
const SourceFilterRow = ({ h, kind, value, onChange }) => h(
  "div",
  { className: "codex-filter-row source-filter-row", "aria-label": `${kind}の出典フィルタ` },
  h("span", { className: "filter-label" }, "出典"),
  ...SOURCE_OPTIONS.map(([key, text]) => h("button", { key, type: "button", className: `chip${value === key ? " is-active" : ""}`, "aria-pressed": value === key, onClick: () => onChange(key) }, text))
);
/* 出典（core/supplement/pack1）を持つのはサポートパッシブと精神だけ。
   持たないカタログにこの行を出すと、押しても何も変わらない操作子になる。 */
const SOURCE_KINDS = { support: "サポート", spirit: "精神" };
const useSourceFilterControl = (kind, value, onChange, enabled = true) => {
  React.useEffect(() => {
    if (!enabled) return void 0;
    const anchor = document.querySelector(".focus .codex-filters");
    if (!anchor) return void 0;
    const host = document.createElement("div");
    host.className = "codex-filter-row source-filter-row";
    host.setAttribute("aria-label", `${kind}の出典フィルタ`);
    host.innerHTML = `<span class="filter-label">出典</span>`;
    SOURCE_OPTIONS.forEach(([key, text]) => {
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
  }, [kind, value, onChange, enabled]);
};
const SupportSection = ({ state, dispatch, ownedOnly = false }) => {
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
  const [selectedSlotType, setSelectedSlotType] = React.useState(null);
  const [supportEquipHint, setSupportEquipHint] = React.useState(null);
  const supportEquipHintSequence = React.useRef(0);
  React.useEffect(() => {
    if (!supportEquipHint) return undefined;
    const sequence = supportEquipHint.sequence;
    const timer = window.setTimeout(() => {
      setSupportEquipHint((current) => current?.sequence === sequence ? null : current);
    }, 1900);
    return () => window.clearTimeout(timer);
  }, [supportEquipHint?.sequence]);
  // マウス／タップ座標を基準にし、画面端ではポップを内側へ逃がす。
  // キーボード操作時はカードの矩形を使って案内を表示する。
  const showSupportEquipHint = (event, message, tone = "hint") => {
    const rect = event?.currentTarget?.getBoundingClientRect?.();
    const viewportWidth = Math.max(240, window.innerWidth || document.documentElement.clientWidth || 360);
    const viewportHeight = Math.max(320, window.innerHeight || document.documentElement.clientHeight || 640);
    const hasPointerPoint = Number.isFinite(event?.clientX) && Number.isFinite(event?.clientY)
      && (event.clientX !== 0 || event.clientY !== 0);
    const x = hasPointerPoint ? event.clientX : rect ? rect.left + Math.min(rect.width / 2, 120) : viewportWidth / 2;
    const y = hasPointerPoint ? event.clientY : rect ? rect.top + Math.min(rect.height / 2, 32) : viewportHeight / 2;
    const maxLeft = Math.max(12, viewportWidth - 252);
    const left = Math.max(12, Math.min(Math.round(x - 120), maxLeft));
    const placement = y > viewportHeight * 0.62 ? "above" : "below";
    const top = Math.max(12, Math.min(Math.round(y), viewportHeight - 12));
    setSupportEquipHint({ sequence: ++supportEquipHintSequence.current, message, tone, left, top, placement });
  };
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
  /* build 側のサポートタブは既定で所持済みだけを出す。ロックではなく
     フィルタで解除でき、解除時は全件から選べる（未所持はここで購入できる）。 */
  const [gateOpen, setGateOpen] = React.useState(false);
  const gated = ownedOnly && !gateOpen;
  const ownedSupports = React.useMemo(
    () => (state.roster?.supports || []).map((entry) => ({ ...entry, slot: entry.slot || "normal" })),
    [state.roster?.supports]
  );
  /* ここを catalogSource と名付けると、上の関数（entry → 出典）が
     配列で影を落とし、applyFilters 内の catalogSource(s) が
     「関数ではない」という型エラーになる。出典チップを選ぶたびタブごと落ちる。
     データの名前と関数の名前を分けておく。 */
  const supportCatalog = gated ? ownedSupports.filter((entry) => entry.slot !== "death") : DB.support_passives;
  const deathCatalogSource = gated ? ownedSupports.filter((entry) => entry.slot === "death") : DB.death_passives;
  const filtered = React.useMemo(() => applyFilters(supportCatalog), [query, sinFilter, lpFilter, sourceFilter, supportCatalog]);
  // 死亡後専用スロットの候補は専用DB (death_passives) を単独ソースとする。
  // 通常DBを正規表現で推測分類すると誤検出・取りこぼしが起きるため混在させない。
  const deathFiltered = React.useMemo(() => applyFilters(deathCatalogSource), [query, sinFilter, lpFilter, sourceFilter, deathCatalogSource]);
  const standardFiltered = filtered;
  const visibleStandard = catalogMode !== "death" ? standardFiltered : [];
  const visibleDeath = catalogMode !== "standard" ? deathFiltered : [];
  const visibleCount = catalogMode === "death" ? deathFiltered.length : catalogMode === "all" ? standardFiltered.length + deathFiltered.length : standardFiltered.length;
  const visibleTotal = catalogMode === "death" ? (deathCatalogSource || []).length : catalogMode === "all" ? (supportCatalog || []).length + (deathCatalogSource || []).length : (supportCatalog || []).length;
  const equipped = Array.isArray(state.supports) ? state.supports : [];
  const deathSupport = state.deathSupport || null;
  const maxSupports = activeEnhancements.some((e) => e.name === "サポートスロット追加") ? 3 : 2;
  const isEquipped = (name) => equipped.some((s) => s.name === name) || deathSupport?.name === name;
  const selectedIsDeath = selectedSlotType === null
    ? !!(selected && (DB.death_passives || []).some((s) => s.name === selected.name && (s.cond || "") === (selected.cond || "")))
    : selectedSlotType === "death";
  const patchSupport = (id, patch) => dispatch({ type: "PATCH_SUPPORT", id, patch });
  const patchDeathSupport = (patch) => dispatch({ type: "PATCH_DEATH_SUPPORT", patch });
  const tryEquip = (s, slotType = "standard", options = {}) => {
    const silent = !!options.silent;
    if (!s) return { ok: false, message: "サポートを選んでね" };
    if (isEquipped(s.name)) return { ok: false, message: "すでに装備中だよ！" };
    if (slotType === "death") {
      if (!hasDeathSlot) {
        if (!silent) toast("死亡後専用スロットが未開放です");
        return { ok: false, message: "死亡後専用枠は未開放だよ" };
      }
      dispatch({ type: "SET_DEATH_SUPPORT", spp: s });
      if (!silent) toast(`『${s.name}』を死亡後専用スロットへ装備`);
      return { ok: true, message: "死亡後枠に装備できた！" };
    }
    if (equipped.length >= maxSupports) {
      if (!silent) toast(`スロット上限（${maxSupports}枠）です`);
      return { ok: false, message: `スロットがいっぱい（${maxSupports}枠）だよ` };
    }
    dispatch({ type: "ADD_SUPPORT", spp: s });
    if (!silent) toast(`『${s.name}』を装備`);
    return { ok: true, message: "装備できた！" };
  };
  const handleSupportItemClick = (s, slotType, event) => {
    const isSameSelected = selectedSlotType === slotType
      && selected?.name === s.name
      && (selected?.cond || "") === (s.cond || "");
    if (isSameSelected) {
      const result = tryEquip(s, slotType, { silent: true });
      showSupportEquipHint(event, result.message, result.ok ? "success" : "hint");
      return;
    }
    setSelected(s);
    setSelectedSlotType(slotType);
    let message = "もう一度クリック／タップで装備！";
    if (isEquipped(s.name)) message = "すでに装備中だよ！";
    else if (slotType === "death" && !hasDeathSlot) message = "死亡後専用枠は未開放だよ";
    else if (slotType !== "death" && equipped.length >= maxSupports) message = `スロットがいっぱい（${maxSupports}枠）だよ`;
    showSupportEquipHint(event, message, message === "もう一度クリック／タップで装備！" ? "hint" : "status");
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
      const isSel = selectedSlotType === slotType && selected?.name === s.name && (selected?.cond || "") === (s.cond || "");
      const eq = isEquipped(s.name);
      return h(
        "div",
        {
          key: `${slotType}:${s.name}`,
          className: `spirit-item${isSel ? " is-active" : ""}${eq ? " is-equipped" : ""}`,
          role: "button",
          tabIndex: 0,
          title: "1回押して詳細を確認、もう一度押すと装備",
          onClick: (event) => handleSupportItemClick(s, slotType, event),
          onKeyDown: (event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              handleSupportItemClick(s, slotType, event);
            }
          }
        },
        h(
          "div",
          { className: "spirit-item-head" },
          h("div", { className: "spirit-item-name" }, s.name),
          // 原典の死亡後パッシブはLPを持たない。値のない「LP」が浮くのを防ぐ。
          s.lp ? h("span", { className: "spirit-item-price" }, "LP ", s.lp) : null,
          slotType === "death" ? h("span", { style: { fontSize: "var(--fs-9)", color: "var(--warn)", letterSpacing: "0.12em", fontFamily: "var(--f-display)" } }, "死亡後専用") : null,
          eq ? h("span", { style: { marginLeft: "auto", fontSize: "var(--fs-9)", color: "var(--gold)", fontFamily: "var(--f-display)", letterSpacing: "0.16em" } }, "★ 装備中") : null
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
          h("button", { className: "reorder-btn", onClick: () => dispatch({ type: "REORDER_LIST", field: "supports", key: spp.id, dir: -1 }), disabled: i === 0, title: "左へ" }, h("span", { style: { fontSize: "var(--fs-10)" } }, "‹")),
          h("button", { className: "reorder-btn", onClick: () => dispatch({ type: "REORDER_LIST", field: "supports", key: spp.id, dir: 1 }), disabled: i >= equipped.length - 1, title: "右へ" }, h("span", { style: { fontSize: "var(--fs-10)" } }, "›"))
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
        h("div", { style: { fontSize: "var(--fs-11)", color: "var(--tx-2)", lineHeight: 1.4, marginTop: 4, whiteSpace: "pre-wrap" } }, window.LBT_GLOSSARY_TEXT ? window.LBT_GLOSSARY_TEXT(spp.effect, "サポートパッシブ:" + spp.name) : spp.effect),
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
            deathSupport.lp ? h("span", null, "LP ", deathSupport.lp) : null,
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
          ownedOnly && h("div", { className: "codex-filter-row owned-gate-row" },
            h("span", { className: "filter-label" }, "表示範囲"),
            h("div", { className: "chips-group" },
              h("button", { type: "button", className: `chip${!gateOpen ? " is-active" : ""}`, "aria-pressed": !gateOpen, onClick: () => setGateOpen(false) }, "所持のみ"),
              h("button", { type: "button", className: `chip${gateOpen ? " is-active" : ""}`, "aria-pressed": gateOpen, onClick: () => setGateOpen(true), title: "未所持のサポートも一覧へ出し、その場で購入できます" }, "未所持も表示（全体から選ぶ）"))),
          h("div", { className: "codex-filter-row" }, h("div", { className: "codex-search" }, h(Icon, { name: "search", size: 14 }), h("input", { type: "text", "aria-label": "サポートパッシブ名・条件・効果で検索", placeholder: "サポートパッシブ名・条件・効果で検索...", value: query, onChange: (e) => setQuery(e.target.value) })), h("div", { className: "codex-count" }, h("strong", null, visibleCount), " / ", visibleTotal)),
          h("div", { className: "segmented support-catalog-mode", role: "tablist", "aria-label": "サポート候補の種類" },
            h("button", { className: catalogMode === "standard" ? "is-active" : "", onClick: () => setCatalogMode("standard"), role: "tab", "aria-selected": catalogMode === "standard" }, "通常"),
            h("button", { className: catalogMode === "death" ? "is-active" : "", onClick: () => setCatalogMode("death"), role: "tab", "aria-selected": catalogMode === "death" }, "死亡後専用"),
            h("button", { className: catalogMode === "all" ? "is-active" : "", onClick: () => setCatalogMode("all"), role: "tab", "aria-selected": catalogMode === "all" }, "すべて")
          ),
          h("div", { className: "codex-filter-row", style: { gap: 8 } }, h("select", { className: "select", "aria-label": "大罪で絞り込む", value: sinFilter, onChange: (e) => setSinFilter(e.target.value), style: { flex: "0 1 220px" } }, h("option", { value: "" }, "全大罪"), ...SIN_LIST.map((s) => h("option", { key: s, value: s }, s))), h("select", { className: "select", "aria-label": "LP帯で絞り込む", value: lpFilter, onChange: (e) => setLpFilter(e.target.value), style: { flex: "0 1 220px" } }, h("option", { value: "" }, "全LP帯"), h("option", { value: "lt20" }, "LP 20未満"), h("option", { value: "20-49" }, "LP 20-49"), h("option", { value: "50-99" }, "LP 50-99"), h("option", { value: "gte100" }, "LP 100以上"))),
          h(SourceFilterRow, { h, kind: "サポートパッシブ", value: sourceFilter, onChange: setSourceFilter }),
          visibleStandard.length || catalogMode === "standard" || catalogMode === "all" ? h(React.Fragment, null, h("div", { className: "t-label", style: { marginBottom: 6 } }, catalogMode === "all" ? "通常スロット用" : "通常スロット用"), renderList(visibleStandard, "standard")) : null,
          (visibleDeath.length || catalogMode === "death" || catalogMode === "all") ? h(React.Fragment, null, h("div", { className: "t-label", style: { marginTop: visibleStandard.length ? "var(--s-3)" : 0, marginBottom: 6, color: "var(--warn)" } }, "死亡後専用スロット候補", !hasDeathSlot ? "（未開放：閲覧のみ）" : ""), renderList(visibleDeath, "death")) : null
        ),
        selected ? h("div", { className: "codex-detail" }, h("div", { className: "detail-head", style: { "--sin-primary": selectedIsDeath ? "var(--warn)" : "var(--gold)" } }, h("div", { className: "detail-eyebrow" }, selected.lp ? h("span", { className: "detail-num" }, "LP ", selected.lp) : null, h("span", { className: "detail-type" }, selectedIsDeath ? "DEATH SUPPORT PASSIVE / 死亡後専用" : "SUPPORT PASSIVE / サポートパッシブ")), h("div", { className: "detail-name" }, selected.name), h("div", { className: "cond-chips-lg", style: { marginTop: "var(--s-2)", display: "flex", alignItems: "center", gap: 6 } }, h("span", { style: { fontSize: "var(--fs-10)", color: "var(--tx-mute)", fontFamily: "var(--f-display)", letterSpacing: "0.12em" } }, "発動条件"), h(CondChips, { cond: selected.cond }))), h("div", { className: "detail-body" }, h("div", null, h("div", { className: "detail-section-title" }, "効果"), h("div", { className: "detail-passive" }, h("div", { className: "detail-passive-effect", style: { whiteSpace: "pre-wrap" } }, window.LBT_GLOSSARY_TEXT ? window.LBT_GLOSSARY_TEXT(selected.effect, (selectedIsDeath ? "死亡後サポートパッシブ:" : "サポートパッシブ:") + selected.name) : selected.effect))), h("div", { className: "detail-actions" }, selectedIsDeath ? (deathSupport?.name === selected.name ? h(Button, { variant: "ghost", size: "sm", onClick: () => dispatch({ type: "SET_DEATH_SUPPORT", spp: null }), icon: "x" }, "死亡後スロットから外す") : h(Button, { variant: "primary", onClick: () => tryEquip(selected, "death"), icon: "check", disabled: !hasDeathSlot }, "死亡後スロットへ装備")) : (isEquipped(selected.name) ? h("div", { style: { fontSize: "var(--fs-10)", color: "var(--gold)", textAlign: "center", fontFamily: "var(--f-display)", letterSpacing: "0.16em", textTransform: "uppercase" } }, "★ 装備中") : h(Button, { variant: "primary", onClick: () => tryEquip(selected, "standard"), icon: "check" }, "通常スロットへ装備"))))) : h("div", { className: "codex-detail" }, h("div", { className: "detail-empty" }, h("div", { className: "detail-empty-icon" }, "◇"), h("div", { className: "t-label" }, "サポートパッシブを選択"), h("div", { style: { fontSize: "var(--fs-11)", color: "var(--tx-mute)", marginTop: 8 } }, hasDeathSlot ? "通常スロット用と死亡後専用候補を分けて表示しています。" : "一覧から選択すると詳細が表示されます。", h("br", null), "選択中のカードをもう一度クリック／タップするか、詳細の装備ボタンを押してください。")))
      )
    ),
    supportEquipHint ? h("div", {
      key: supportEquipHint.sequence,
      className: "support-equip-pop",
      role: "status",
      "aria-live": "polite",
      "data-placement": supportEquipHint.placement,
      "data-tone": supportEquipHint.tone,
      style: {
        left: `${supportEquipHint.left}px`,
        top: `${supportEquipHint.top}px`,
        "--support-pop-offset": supportEquipHint.placement === "above" ? "calc(-100% - 12px)" : "12px"
      }
    },
      h("span", { className: "support-equip-pop__sparkle", "aria-hidden": "true" }, "✦"),
      h("span", null, supportEquipHint.message)
    ) : null
  );
};
const EGO_RANKS = ["ZAYIN", "TETH", "HE", "WAW", "ALEPH"];
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
    // 覚醒・侵蝕の派生スキルは根のスキルにぶら下がる。編集モデルを往復しても失わない。
    derived: Array.isArray(skill.derived) ? skill.derived : [],
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

  return React.createElement(Card, { title, sub: "選択中の解析対象", compact: true, className: "ego-editor-detail" },
    React.createElement("div", { className: "stack-3 ego-skill-editor" },
      React.createElement("div", { className: "ego-editor-toolbar" },
        React.createElement("span", { className: "t-label" }, "EGO SKILL / 解析対象"),
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
// 継続ラウンドは編集中の未完成値（"2"）も保持する。本文側の数字や改行から
// ラウンド数を誤検出しないよう、[影響] ヘッダーだけを解析する。
const getInfluenceRounds = (effect) => {
  const match = String(effect || "").match(/^\s*\[\s*影響\s*\](?:[ \t]+(\d*R?))?[ \t]*(?=[:：]|$)/);
  return match?.[1] || "";
};
// ヘッダーだけを剥がし、本文の先頭・末尾の空白、Enter による改行を一切 trim しない。
const stripInfluenceHeader = (effect) => String(effect || "").replace(/^\s*\[\s*影響\s*\](?:[ \t]+\d*R?)?[ \t]*[:：]?/, "");
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
      influence: (() => {
        const influence = model.branches?.influence || {};
        return {
          ...ensureSkillShape({ ...influence, kind: "影響" }),
          rounds: String(influence.rounds ?? getInfluenceRounds(influence.effect))
        };
      })()
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
  const derivedSkills = Array.isArray(branch.derived) ? branch.derived : [];
  const patchDerived = (index, patch) => updateModel((next) => {
    const list = next.branches[variant].derived || [];
    next.branches[variant].derived = list.map((skill, i) => i === index ? { ...skill, ...patch, kind: "スキル" } : skill);
  });
  const patchDerivedDice = (index, diceIdx, patch) => updateModel((next) => {
    const list = next.branches[variant].derived || [];
    next.branches[variant].derived = list.map((skill, i) => i === index
      ? { ...skill, dice: (skill.dice || []).map((die, di) => di === diceIdx ? { ...die, ...patch } : die) }
      : skill);
  });
  const addDerivedDice = (index) => updateModel((next) => {
    const list = next.branches[variant].derived || [];
    next.branches[variant].derived = list.map((skill, i) => i === index
      ? { ...skill, dice: [...(skill.dice || []), { roll: "", dval: "", d: "", plus: false, dPlus: false, dCnt: false, effect: "" }] }
      : skill);
  });
  const removeDerivedDice = (index, diceIdx) => updateModel((next) => {
    const list = next.branches[variant].derived || [];
    next.branches[variant].derived = list.map((skill, i) => i === index
      ? { ...skill, dice: (skill.dice || []).filter((_, di) => di !== diceIdx) }
      : skill);
  });
  const addDerived = () => updateModel((next) => {
    const branchNext = next.branches[variant];
    const list = branchNext.derived || [];
    const { derived, ...baseSkill } = branchNext;
    const rankBase = String(baseSkill.rank || "").replace(/-\d+$/, "") || (label === "覚醒" ? "覚醒" : "侵蝕");
    const used = list.map((skill) => Number(String(skill.rank || "").match(/-(\d+)$/)?.[1]) || 1);
    const index = Math.max(1, ...used) + 1;
    list.push({
      ...JSON.parse(JSON.stringify(baseSkill)),
      id: `${slotKey}-derived-${Date.now()}`,
      rank: `${rankBase}-${index}`,
      kind: "スキル",
      originSlot: slotKey
    });
    branchNext.derived = list;
  });
  const removeDerived = (index) => updateModel((next) => {
    next.branches[variant].derived = (next.branches[variant].derived || []).filter((_, i) => i !== index);
  });
  const renderStandard = () => React.createElement(React.Fragment, null,
    React.createElement(EgoSkillEditor, {
      title: `${label}スキル`,
      kind: EGO_VARIANT_KIND[variant],
      skill: branch,
      onPatch: patchSkill,
      onAddDice: addDice,
      onPatchDice: patchDice,
      onRemoveDice: removeDice,
      hideKindSelect: true
    }),
    React.createElement("section", { className: "ego-derived-block", "data-slot": slotKey, "aria-label": `${label}の派生スキル（任意数）` },
      React.createElement("div", { className: "ego-derived-head" },
        React.createElement("div", null,
          React.createElement("div", { className: "t-label" }, "DERIVED SKILLS / 派生スキル"),
          React.createElement("div", { className: "ego-derived-note" }, `この${label}に属する派生スキルを任意数追加できます。親のランクを引き継ぎ、連番で採番します。`)
        ),
        React.createElement(Button, { size: "sm", variant: "ghost", icon: "plus", onClick: addDerived, title: `${label}の派生スキルを複製して追加` }, "派生を追加")
      ),
      derivedSkills.length === 0
        ? React.createElement("div", { className: "ego-derived-empty" }, "派生はまだありません。必要なときだけ追加してください。")
        : React.createElement("div", { className: "ego-derived-list" },
            derivedSkills.map((skill, index) => React.createElement("article", { key: skill.id || `${slotKey}-derived-${index}`, className: "ego-derived-item" },
              React.createElement("div", { className: "ego-derived-item-head" },
                React.createElement("span", { className: "ego-assim-card-index" }, skill.rank || `${label}-${index + 2}`),
                React.createElement("span", { className: "ego-derived-item-copy" }, skill.name || "派生スキル"),
                React.createElement(Button, { variant: "ghost", size: "sm", icon: "trash", onClick: () => removeDerived(index), title: `${skill.rank || "派生"}を削除` }, "削除")
              ),
              React.createElement(EgoSkillEditor, {
                title: `${label}派生${index + 2}`,
                kind: "スキル",
                skill,
                hideKindSelect: true,
                onPatch: (patch) => patchDerived(index, patch),
                onAddDice: () => addDerivedDice(index),
                onPatchDice: (diceIdx, patch) => patchDerivedDice(index, diceIdx, patch),
                onRemoveDice: (diceIdx) => removeDerivedDice(index, diceIdx)
              })
            ))
          )
    )
  );
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
      return React.createElement("article", { key: current.id || `${slotKey}-direct-${index}`, className: "ego-assim-direct-card", "data-sin": current.sin || "", "aria-label": `同化 ${rank} ${current.name || "名称未設定"}の解析` },
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
        "[同化]は、元のHP・SAN・耐性・戦術0・パッシブを引き継いだ上で、以下の戦術スキル群を使用します。各スキルカードをその場で解析でき、使用時などの効果はダイスより先に入力します。"
      ),
      subSkills.length === 0
        ? React.createElement("div", { className: "empty ego-assim-empty" },
            "この形態には同化スキルが登録されていません。手動で作成する場合のみ、下のボタンから1件目を作成してください。",
            React.createElement(Button, { size: "sm", icon: "plus", onClick: addSub, style: { marginTop: 8 } }, "同化スキルを作成")
          )
        : React.createElement("div", { className: "ego-assim-direct-list", "aria-label": "同化スキルの解析" },
            subSkills.map(renderDirectSkillCard)
          ),
      subSkills.length > 0 && React.createElement(Button, { size: "sm", icon: "plus", className: "ego-assim-direct-add", onClick: addSub }, "同化スキルを追加")
    );
  };

  const renderInfluence = () => {
    const rounds = String(branch.rounds ?? getInfluenceRounds(branch.effect));
    return React.createElement(Card, { title: `${label}E.G.Oスキル [影響]`, sub: "R進行効果（攻撃属性・罪悪・ダイスは使用しない）", compact: true, className: "ego-editor-detail ego-influence-editor" },
      React.createElement("div", { className: "stack-3" },
        React.createElement("div", { className: "ego-influence-note" }, "影響はこのスロットを置き換えるラウンド進行効果です。属性・罪悪・広域・ダイスを入力しません。"),
        React.createElement(Field, { label: "継続ラウンド（任意）", hint: "2 または 2R の形式で入力します。ラウンド効果の本文とは別に保持されます。" }, React.createElement("input", { className: "input", value: rounds, onChange: (e) => patchSkill({ rounds: e.target.value, effect: makeInfluenceEffect(e.target.value, branch.effect) }), placeholder: "例：2R", inputMode: "text", "aria-label": "影響の継続ラウンド" })),
        React.createElement(Field, { label: "ラウンド効果", hint: "改行・スペースを保持します。Enter で改行し、Space も通常どおり入力できます。" }, React.createElement(AutoTextarea, { className: "textarea", minRows: 4, value: stripInfluenceHeader(branch.effect), onChange: (e) => patchSkill({ effect: makeInfluenceEffect(rounds, e.target.value) }), placeholder: "例：1R：… 2R：… 3R：…", "aria-label": "影響のラウンド効果" })),
        React.createElement("div", { className: "ego-influence-preview", style: { whiteSpace: "pre-wrap" } }, window.formatEffectLines ? window.formatEffectLines(branch.effect) : branch.effect)
      )
    );
  };
  return React.createElement("section", { className: "ego-slot-variant", "aria-label": `${label}E.G.Oスキルの形態編集` },
    React.createElement("div", { className: "ego-slot-variant-head" },
      React.createElement("div", null, React.createElement("div", { className: "ego-panel-kicker" }, label === "覚醒" ? "01 / AWAKENING" : "02 / CORROSION"), React.createElement("div", { className: "ego-panel-title" }, `${label}E.G.Oスキル`)),
      React.createElement("span", { className: "ego-active-help" }, variant === "assimilation" ? "各スキルカードをこの場で解析します。効果はダイスより先に入力します" : model.selectedByUser ? "選択した形態を解析中。ほかの形態の下書きは保持されます" : "原データの形態を表示中。選ぶと解析する形態を切り替えます")
    ),
    React.createElement("div", { className: "ego-variant-choice", role: "group", "aria-label": `${label}E.G.Oスキルの形態` }, EGO_VARIANT_OPTIONS.map((option) => React.createElement("button", { key: option.key, type: "button", className: `ego-variant-option${variant === option.key ? " is-active" : ""}`, onClick: () => setVariant(option.key), "aria-pressed": variant === option.key }, React.createElement("b", null, option.label), React.createElement("span", null, option.help)))),
    React.createElement("div", { className: "ego-variant-status" }, `現在の形態: ${EGO_VARIANT_LABEL[variant]}`),
    variant === "assimilation" ? renderAssimilation() : variant === "influence" ? renderInfluence() : renderStandard()
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
  return h(Card, { title: `${rank} E.G.O`, sub: "解析", compact: true, className: "ego-variant-workbench" },
    h("div", { className: "stack-4 ego-editor" },
      h("div", { className: "ego-overview-panel" },
        h("div", { className: "ego-overview-copy" },
          h("div", { className: "ego-overview-eyebrow" }, "E.G.O ANALYSIS / 解析"),
          h("div", { className: "ego-overview-name" }, slot.name || "名称未設定"),
          h("div", { className: "ego-overview-meta" }, `${slot.rank || rank} · ${formSummary}`)
        ),
        h("div", { className: "ego-overview-state" }, h("span", { className: "ego-live-dot" }), "変更は即時反映")
      ),
      h("section", { className: "stack-3", "aria-label": "E.G.O基本情報" },
        h(Field, { label: "E.G.O名" }, h("input", { className: "input", "aria-label": "E.G.O名", value: slot.name || "", onChange: (event) => setSlot({ name: event.target.value }) })),
        h(Field, { label: "消費資源", hint: "例：憤怒x3 色欲x2" }, h("input", { className: "input", "aria-label": "消費資源", value: slot.resources || "", onChange: (event) => setSlot({ resources: event.target.value }) })),
        h("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 12 } },
          h(Field, { label: "SAN消費" }, h("input", { className: "input", "aria-label": "SAN消費", type: "number", min: 0, value: slot.san_cost ?? 0, onChange: (event) => setSlot({ san_cost: Math.max(0, Number(event.target.value)) }) })),
          h(Field, { label: "必要欠片" }, h("input", { className: "input", "aria-label": "必要欠片", type: "number", min: 0, value: slot.shards ?? 0, onChange: (event) => setSlot({ shards: Math.max(0, Number(event.target.value)) }) }))),
        h(Field, { label: "固有効果" }, h(AutoTextarea, { className: "textarea", "aria-label": "固有効果", minRows: 2, value: slot.unique_buff || "", onChange: (event) => setSlot({ unique_buff: event.target.value }) }))
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
        h(Button, { variant: "ghost", size: "sm", icon: "edit", onClick: () => dispatch({ type: "RESET_EGO_SLOT_TO_DB", rank }) }, "既定データを再読込")
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
  const fmt = (t, scope) => window.LBT_GLOSSARY_TEXT ? window.LBT_GLOSSARY_TEXT(t, (scope || "E.G.O効果") + ":" + ego.name) : (window.formatEffectLines ? window.formatEffectLines(t) : t || "");
  const Skill = ({ label, skill, badge }) => {
    if (!skill || !skill.dice?.length && !skill.effect) return null;
    return /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "detail-section-title", style: { display: "flex", alignItems: "center", gap: 6 } }, label, " ", badge && /* @__PURE__ */ React.createElement("span", { className: "badge", style: { marginLeft: "auto", color: label.includes("\u4FB5\u8755") ? "var(--err)" : "var(--ok)" } }, badge)), /* @__PURE__ */ React.createElement("div", { className: "detail-passive", style: { borderLeftColor: label.includes("\u4FB5\u8755") ? "var(--err)" : "var(--gold)" } }, (skill.attr || skill.sin) && /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-10)", fontFamily: "var(--f-mono)", color: "var(--tx-dim)", marginBottom: 4 } }, skill.attr && /* @__PURE__ */ React.createElement("span", null, skill.attr), skill.attr && skill.sin && "：", skill.sin && /* @__PURE__ */ React.createElement("span", { style: { color: `var(--sin-${skill.sin}, var(--tx-dim))` } }, skill.sin), skill.aoe && /* @__PURE__ */ React.createElement("span", { style: { marginLeft: 6, padding: "1px 5px", background: "var(--gold-tint)", border: "1px solid var(--gold-line)", borderRadius: 2, color: "var(--gold)" } }, skill.aoe)), skill.effect && /* @__PURE__ */ React.createElement("div", { className: "detail-passive-effect", style: { marginBottom: 6, color: "var(--tx-2)", whiteSpace: "pre-wrap" } }, fmt(skill.effect)), skill.dice?.length > 0 && /* @__PURE__ */ React.createElement("div", { className: "stack-1", style: { marginTop: 4 } }, skill.dice.map((d, i) => /* @__PURE__ */ React.createElement("div", { key: i, style: { display: "flex", gap: 8, fontSize: "var(--fs-11)", padding: "4px 6px", background: "var(--surface-2)", borderRadius: 2 } }, /* @__PURE__ */ React.createElement("span", { style: { fontFamily: "var(--f-mono)", color: "var(--gold-hi)", minWidth: 60, fontWeight: 600 } }, d.roll), d.effect ? /* @__PURE__ */ React.createElement("span", { style: { color: "var(--tx-dim)" } }, "：") : null, /* @__PURE__ */ React.createElement("span", { style: { color: "var(--tx-2)", lineHeight: 1.4, whiteSpace: "pre-wrap" } }, d.effect ? fmt(d.effect) : "\u2014"))))));
  };
  const isAssim = (ego.sub_skills || []).length > 0;
  return /* @__PURE__ */ React.createElement("div", { className: "codex-detail", style: { "--sin-primary": `var(--rank-${ego.rank})` } }, /* @__PURE__ */ React.createElement("div", { className: "detail-head" }, /* @__PURE__ */ React.createElement("div", { className: "detail-eyebrow" }, /* @__PURE__ */ React.createElement("span", { className: "detail-num" }, "No.", String(ego.no).padStart(3, "0")), /* @__PURE__ */ React.createElement("span", { className: "badge", "data-rank": ego.rank, style: { fontSize: "var(--fs-9)" } }, ego.rank)), /* @__PURE__ */ React.createElement("div", { className: "detail-name" }, ego.name), /* @__PURE__ */ React.createElement("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--s-2)" } }, /* @__PURE__ */ React.createElement("div", { style: { padding: "6px 8px", background: "var(--surface-inset)", border: "1px solid var(--line-dim)", borderRadius: "var(--r)" } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--f-display)", fontSize: "var(--fs-9)", letterSpacing: "0.14em", color: "var(--tx-mute)", textTransform: "uppercase" } }, "\u6D88\u8CBBSAN"), /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--f-mono)", fontSize: "var(--fs-15)", color: "var(--tx)" } }, ego.san_cost)), /* @__PURE__ */ React.createElement("div", { style: { padding: "6px 8px", background: "var(--surface-inset)", border: "1px solid var(--line-dim)", borderRadius: "var(--r)" } }, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--f-display)", fontSize: "var(--fs-9)", letterSpacing: "0.14em", color: "var(--tx-mute)", textTransform: "uppercase" } }, "\u81EA\u6211\u306E\u6B20\u7247"), /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--f-mono)", fontSize: "var(--fs-15)", color: "var(--tx)" } }, ego.shards))), /* @__PURE__ */ React.createElement("div", { style: { marginTop: "var(--s-2)", fontSize: "var(--fs-11)", color: "var(--tx-dim)", fontFamily: "var(--f-mono)" } }, "\u8CC7\u6E90: ", /* @__PURE__ */ React.createElement("span", { style: { color: "var(--tx-2)" } }, ego.resources))), /* @__PURE__ */ React.createElement("div", { className: "detail-body" }, ego.passive_name && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "detail-section-title" }, "\u30D1\u30C3\u30B7\u30D6"), /* @__PURE__ */ React.createElement("div", { className: "detail-passive" }, /* @__PURE__ */ React.createElement("div", { className: "detail-passive-name" }, ego.passive_name), ego.passive_cond && /* @__PURE__ */ React.createElement("div", { className: "detail-passive-cond cond-chips-lg", style: { display: "flex", alignItems: "center", gap: 6 } }, /* @__PURE__ */ React.createElement("span", { style: { fontSize: "var(--fs-10)", color: "var(--tx-mute)" } }, "\u767A\u52D5\u6761\u4EF6"), /* @__PURE__ */ React.createElement(CondChips, { cond: ego.passive_cond })), /* @__PURE__ */ React.createElement("div", { className: "detail-passive-effect", style: { whiteSpace: "pre-wrap" } }, fmt(ego.passive_effect)))), /* @__PURE__ */ React.createElement(Skill, { label: "\u899A\u9192\u30B9\u30AD\u30EB / KAKUSEI", skill: ego.kakusei, badge: "\u899A\u9192" }), isAssim ? /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "detail-section-title", style: { display: "flex", alignItems: "center", gap: 6 } }, /* @__PURE__ */ React.createElement("span", null, "\u4FB5\u8755\u30B9\u30AD\u30EB / SHINSHOKU"), /* @__PURE__ */ React.createElement("span", { className: "ego-doka-badge", style: { marginLeft: "auto" }, title: "\u3053\u306EEGO\u306F\u540C\u5316\u578B" }, "\u25C6 \u540C\u5316")), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-10)", color: "var(--tx-mute)", lineHeight: 1.5, marginTop: -2, marginBottom: 8, fontStyle: "italic", fontFamily: "var(--f-mono)" } }, "\u540C\u5316\u578BEGO\uFF1A\u4FB5\u8755\u30B9\u30AD\u30EB\u305D\u306E\u3082\u306E\u304C\u4E0B\u8A18\u306E\u540C\u5316\u30B9\u30AD\u30EB\u7FA4\u3068\u3057\u3066\u767A\u52D5\u3057\u307E\u3059\u3002"), /* @__PURE__ */ React.createElement("div", { className: "assim-tactical-grid" }, ego.sub_skills.map((s, i) => /* @__PURE__ */ React.createElement("div", { key: i, className: "assim-tactical-card", "data-sin": s.sin || "" }, /* @__PURE__ */ React.createElement("div", { className: "assim-tactical-head" }, /* @__PURE__ */ React.createElement("span", { className: "assim-tactical-idx" }, "S", s.no ?? i + 1), /* @__PURE__ */ React.createElement("span", { className: "assim-tactical-name" }, s.name || "(\u540D\u79F0\u672A\u8A2D\u5B9A)"), s.attr && /* @__PURE__ */ React.createElement("span", { className: "assim-tactical-attr" }, s.attr), s.sin && /* @__PURE__ */ React.createElement("span", { className: "sin-tag", "data-sin": s.sin, style: { fontFamily: "var(--f-display)", fontSize: "var(--fs-10)", padding: "2px 8px", borderRadius: "var(--r-sm)", letterSpacing: "0.06em", fontWeight: 600 } }, s.sin), s.aoe && /* @__PURE__ */ React.createElement("span", { className: "assim-tactical-aoe" }, s.aoe)), s.effect && /* @__PURE__ */ React.createElement("div", { className: "assim-tactical-eff", style: { whiteSpace: "pre-wrap" } }, fmt(s.effect)), (s.dice || []).length > 0 && /* @__PURE__ */ React.createElement("div", { className: "ro-dice-list", style: { marginTop: 6 } }, s.dice.map((d, j) => /* @__PURE__ */ React.createElement("div", { key: j, className: "ro-dice-row" }, /* @__PURE__ */ React.createElement("span", { className: "ro-dice-idx" }, j + 1), /* @__PURE__ */ React.createElement("span", { className: "ro-dice-roll" }, d.roll || "-"), /* @__PURE__ */ React.createElement("span", { className: "ro-dice-eff", style: { whiteSpace: "pre-wrap" } }, d.effect ? fmt(d.effect) : /* @__PURE__ */ React.createElement("span", { style: { color: "var(--tx-mute)", fontStyle: "italic" } }, "\u52B9\u679C\u306A\u3057"))))))))) : /* @__PURE__ */ React.createElement(Skill, { label: "\u4FB5\u8755\u30B9\u30AD\u30EB / SHINSHOKU", skill: ego.shinshoku, badge: "\u4FB5\u8755" }), ego.unique_buff && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "detail-section-title" }, "\u56FA\u6709\u30D0\u30D5"), /* @__PURE__ */ React.createElement("div", { style: { padding: "8px 10px", background: "var(--surface-inset)", borderRadius: "var(--r)", border: "1px solid var(--line-dim)", fontSize: "var(--fs-11)", color: "var(--tx-2)", lineHeight: 1.5 } }, window.LBT_GLOSSARY_TEXT ? window.LBT_GLOSSARY_TEXT(ego.unique_buff, "E.G.O固有効果:" + ego.name) : ego.unique_buff))), /* @__PURE__ */ React.createElement("div", { className: "detail-actions" }, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-10)", color: "var(--tx-dim)", letterSpacing: "0.12em", textTransform: "uppercase", fontFamily: "var(--f-display)", marginBottom: 4 } }, equipTo === ego.rank ? `\u2192 ${ego.rank} \u30B9\u30ED\u30C3\u30C8\u3078\u88C5\u5099` : `\u2192 ${ego.rank} \u30B9\u30ED\u30C3\u30C8\u3078\u88C5\u5099`), currentSlot ? /* @__PURE__ */ React.createElement(React.Fragment, null, /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-10)", color: "var(--gold)", textAlign: "center", fontFamily: "var(--f-display)", letterSpacing: "0.16em", textTransform: "uppercase" } }, "\u2605 \u73FE\u5728 ", currentSlot, " \u306B\u88C5\u5099\u4E2D"), /* @__PURE__ */ React.createElement(Button, { variant: "ghost", size: "sm", onClick: onUnequip, icon: "x" }, "\u88C5\u5099\u89E3\u9664")) : /* @__PURE__ */ React.createElement(Button, { variant: "primary", onClick: onEquip, icon: "check" }, ego.rank, " \u30B9\u30ED\u30C3\u30C8\u3078\u88C5\u5099"), onToggleOwned ? /* @__PURE__ */ React.createElement(Button, { variant: isOwned ? "ghost" : "ghost", size: "sm", icon: isOwned ? "check" : "plus", onClick: onToggleOwned, title: isOwned ? "\u6240\u6301\u30EA\u30B9\u30C8\u304B\u3089\u5916\u3059" : "\u88C5\u5099\u305B\u305A\u306B\u6240\u6301\u30EA\u30B9\u30C8\u3078\u8FFD\u52A0\u3059\u308B" }, isOwned ? "\u6240\u6301\u6E08\u307F" : "\u6240\u6301\u306B\u8FFD\u52A0") : null));
};
const EgoQuickDetail = ({ ego, currentSlot, isOwned, onEquip, onUnequip, onToggleOwned, onPreviewEquip, onOpenFullDetail, onClose, state, acquireHow, onAcquireHowChange, onAcquire }) => {
  const h = React.createElement;
  if (!ego) return null;
  const formatPreview = (text, limit = 150) => {
    // 改行は原典の段落区切りそのもの。1行へ押し込むと「1R 1R：…」のように
    // 表記が重複して読めるため、改行を保持したまま先頭から切り詰める。
    const normalized = String(text || "").trim();
    return normalized.length > limit ? `${normalized.slice(0, limit)}…` : normalized;
  };
  const skillSummary = (label, skill, tone) => {
    if (!skill || (!skill.effect && !(skill.dice || []).length)) return null;
    // ロール一覧は効果本文を持たないダイスだけのフォールバック。
    // 先頭2件へ切り詰めると実際のダイス数と不一致になり（12d1/12d1 なのに
    // 本文は3ダイス分など）、効果本文行と突き合わせたときに破綻して見える。
    const bareRolls = (skill.dice || []).filter((die) => die.roll && !die.effect).map((die) => die.roll);
    return h("div", { className: "ego-quick-skill", "data-tone": tone },
      h("div", { className: "ego-quick-skill-head" },
        h("span", null, label),
        h("span", null, [skill.attr, skill.sin].filter(Boolean).join("：") || "—")
      ),
      bareRolls.length ? h("div", { className: "ego-quick-rolls" }, bareRolls.join(" / ")) : null,
      skill.effect ? h("p", { style: { whiteSpace: "pre-wrap" } }, window.LBT_GLOSSARY_TEXT ? window.LBT_GLOSSARY_TEXT(formatPreview(skill.effect, 92), "E.G.O簡易詳細:" + ego.name) : formatPreview(skill.effect, 92)) : null,
      (skill.dice || []).some((die) => die.effect) ? h("div", { className: "ego-quick-dice-effects" },
        (skill.dice || []).filter((die) => die.effect).map((die, index) => h("div", { key: `effect-${index}`, className: "ego-quick-dice-effect" },
          h("span", { className: "ego-quick-dice-roll" }, die.roll || "効果"),
          h("span", { className: "ego-quick-dice-colon" }, die.effect ? "：" : ""),
          h("span", { style: { whiteSpace: "pre-wrap" } }, window.LBT_GLOSSARY_TEXT ? window.LBT_GLOSSARY_TEXT(formatPreview(die.effect, 120), "E.G.O簡易ダイス:" + ego.name) : formatPreview(die.effect, 120))
        ))
      ) : null
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
      ego.passive_effect ? h("p", { style: { whiteSpace: "pre-wrap" } }, formatPreview(ego.passive_effect)) : null
    ) : null,
    h("div", { className: "ego-quick-skills" },
      skillSummary("覚醒", ego.kakusei, "awake"),
      (ego.kakusei?.derived || []).map((skill, index) => skillSummary(`覚醒${index + 2}`, skill, "awake")),
      skillSummary("侵蝕", ego.shinshoku, "corrode"),
      (ego.shinshoku?.derived || []).map((skill, index) => skillSummary(`侵蝕${index + 2}`, skill, "corrode"))
    ),
    /* 未所持E.G.Oの主操作は指定購入にする。装備は所持登録に波及しないので、
       装備ボタンが主だと指定購入を跨いで「帳に何も無いまま所持だけ増える」状態が生まれる。
       効果だけ確かめる用途は試着装備が担う。 */
    h("div", { className: "ego-quick-actions" },
      currentSlot ? h("div", { className: "ego-quick-equipped" }, "★ 現在 ", currentSlot, " に装備中") : null,
      currentSlot
        ? h(Button, { variant: "ghost", size: "sm", onClick: onUnequip, icon: "x" }, "装備解除")
        : isOwned
          ? h(Button, { variant: "primary", size: "sm", onClick: onEquip, icon: "check" }, ego.rank, " スロットへ装備")
          : null,
      currentSlot ? h(Button, { variant: "ghost", size: "sm", onClick: onOpenFullDetail, icon: "edit", title: "効果全文の確認と解析を開く" }, "詳細・解析") : null,
      onAcquire && acquireHow && onAcquireHowChange && !isOwned ? h(AcquireBar, { state, kind: "ego", name: ego.name, no: ego.no, rank: ego.rank, how: acquireHow, setHow: onAcquireHowChange, onAcquire }) : null,
      onPreviewEquip ? h(Button, { variant: isOwned ? "ghost" : "primary", size: "sm", onClick: onPreviewEquip, icon: "eye", title: "購入も所持登録もしない試着装備です。効果だけ確かめられます" }, "試着装備") : null,
      onToggleOwned ? h(Button, { variant: "ghost", size: "sm", onClick: onToggleOwned, icon: isOwned ? "check" : "x", title: isOwned ? "所持リストから外す" : "購入せずに所持リストへ追加する" }, isOwned ? "所持済み" : "購入せず所持に追加") : null
    )
  );
};
// 基本ルールPDFの掲載順は js/core.js が window.LBT_PDF_KEYWORD_ORDER として定義する。
// フォールバック配列を持たず、core.js の定義を直接使う。
const EGO_PDF_KEYWORD_ORDER = window.LBT_PDF_KEYWORD_ORDER || [];
// E.G.O本文に現れる「回復」は状態名ではなく検索専用の語として、PDF掲載項目の後ろに置く。
// 候補表示時には下のsome判定で実データに一致する語だけを残す。
const EGO_KEYWORD_ORDER = [...new Set([...EGO_PDF_KEYWORD_ORDER, "回復"])];
// EGOキーワード検索のヘイスタック構築は1回1〜2KBの文字列連結を行う。
// 検索のキーストローク毎に全EGO分（最大115件）が再構築されないよう、
// WeakMapでEGOレコードごとにキャッシュする。DB更新時は新レコードで自動的に
// 新しいキャッシュが作られる。
const egoHaystackCache = new WeakMap();
const getEgoKeywordHaystack = (ego) => {
  const cached = egoHaystackCache.get(ego);
  if (cached?.keyword !== undefined) return cached.keyword;
  const skillText = (skill) => [
  skill?.name, skill?.attr, skill?.sin, skill?.aoe, skill?.effect,
  ...(skill?.dice || []).flatMap((die) => [die.roll, die.effect])
  ];
  const keyword = [
  ego?.name, ego?.resources, ego?.passive_name, ego?.passive_cond, ego?.passive_effect, ego?.unique_buff, ...(ego?.keywords || []),
  ...skillText(ego?.kakusei),
  ...skillText(ego?.shinshoku),
  ...(ego?.sub_skills || []).flatMap((skill) => skillText(skill))
  ].filter(Boolean).join(" ").toLowerCase();
  egoHaystackCache.set(ego, { ...(cached || {}), keyword });
  return keyword;
};
const egoEffectCache = new WeakMap();
const getEgoEffectHaystack = (ego) => {
  const cached = egoEffectCache.get(ego);
  if (cached?.effect !== undefined) return cached.effect;
  const skillEffects = (skill) => [
  skill?.effect,
  ...(skill?.dice || []).map((die) => die?.effect)
  ];
  const effect = [
  ego?.passive_effect,
  ego?.unique_buff,
    ...skillEffects(ego?.kakusei),
    ...skillEffects(ego?.shinshoku),
    ...(ego?.sub_skills || []).flatMap((skill) => skillEffects(skill))
  ].filter(Boolean).join(" ").toLowerCase();
  egoEffectCache.set(ego, { effect });
  return effect;
};
const egoMatchesKeyword = (ego, keyword) => keyword === "回復"
  ? getEgoEffectHaystack(ego).includes(keyword)
  : (Array.isArray(ego?.keywords) && ego.keywords.includes(keyword)) || getEgoEffectHaystack(ego).includes(keyword);
window.LBT_egoMatchesKeyword = egoMatchesKeyword;
const useEgoResourceFilterControls = (requiredResources, excludedResources, onToggleRequired, onToggleExcluded) => {
  React.useEffect(() => {
    const anchor = document.querySelector(".ego-catalog-filters");
    if (!anchor) return void 0;
    const legacyRow = [...anchor.querySelectorAll(":scope > .codex-filter-row")].find((row) => row.querySelector(".filter-label")?.textContent.trim() === "大罪");
    const previousLegacyDisplay = legacyRow?.style.display;
    if (legacyRow) legacyRow.style.display = "none";
    const host = document.createElement("div");
    host.className = "ego-resource-filter-controls";
    const appendRow = (label, note, values, onToggle, isExclude) => {
      const row = document.createElement("div");
      row.className = `codex-filter-row ego-resource-filter-row${isExclude ? " is-exclude" : ""}`;
      row.setAttribute("aria-label", `${label}フィルター`);
      const title = document.createElement("span");
      title.className = "filter-label";
      title.textContent = label;
      const hint = document.createElement("span");
      hint.className = "ego-resource-filter-note";
      hint.textContent = note;
      const chips = document.createElement("div");
      chips.className = "chips-group";
      EGO_RESOURCE_NAMES.forEach((sin) => {
        const active = values.includes(sin);
        const button = document.createElement("button");
        button.type = "button";
        button.className = `chip ego-resource-filter-chip${active ? " is-active" : ""}`;
        button.dataset.sin = sin;
        button.setAttribute("aria-pressed", String(active));
        button.textContent = sin;
        button.onclick = () => onToggle(sin);
        chips.appendChild(button);
      });
      row.append(title, hint, chips);
      host.appendChild(row);
    };
    appendRow("必要資源", "すべて含む", requiredResources, onToggleRequired, false);
    appendRow("除外資源", "一つでも含むと除外", excludedResources, onToggleExcluded, true);
    if (legacyRow) legacyRow.after(host);
    else anchor.appendChild(host);
    return () => {
      host.remove();
      if (legacyRow) legacyRow.style.display = previousLegacyDisplay || "";
    };
  }, [requiredResources, excludedResources, onToggleRequired, onToggleExcluded]);
};
const EgoSection = ({ state, dispatch, ownedOnly: ownedOnlyProp = false }) => {
  const h = React.createElement;
  const [creating, setCreating] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [newRank, setNewRank] = React.useState("ZAYIN");
  const catalogEgos = React.useMemo(() => [...(DB.egos || []), ...(state.roster?.egos || []).filter((entry) => entry.build?.__custom).map((entry) => entry.build)], [state.roster?.egos]);
  const createEgo = (event) => {
    event.preventDefault();
    if (!newName.trim()) return;
    const current = state.egoSlots[newRank];
    if (current && !window.confirm(`『${current.name}』をライブラリに保存して、${newRank}枠へ新規E.G.Oを装備しますか？`)) return;
    dispatch({ type: "CREATE_CUSTOM_EGO", rank: newRank, name: newName, replaceConfirmed: !!current });
    setSelected(null);
    setCreating(false);
    setNewName("");
    toast("オリジナルE.G.Oを作成しました。編集内容は所持ライブラリにも保存されます。");
  };
  const [selected, setSelected] = React.useState(null);
  const [query, setQuery] = React.useState("");
  const rankFilter = state.ui.egoRankFilter || "";
  // 旧「大罪」単一選択行は、既存の描画構造を保ったまま複数資源UIへ置き換えて非表示にしている。
  // この状態は旧行の互換参照だけに残し、実際の抽出はrequiredResources/excludedResourcesで行う。
  const [sinFilter, setSinFilter] = React.useState("");
  const [requiredResources, setRequiredResources] = React.useState([]);
  const [excludedResources, setExcludedResources] = React.useState([]);
  const [keywordFilter, setKeywordFilter] = React.useState("");
  // V01/V25: EGO は解析モード（egoManual）で編集可能にする。人格の同期化とは独立。
  // 解析モードは、装備中詳細を開いた状態で「解析を開始」を選んだ場合だけ有効にする。
  // 保存値や別スロットから残った編集フラグだけでは編集面を表示しない。
  const editable = !!state.egoManual && !!state.ui.egoDetailSlot && !!state.egoSlots[state.ui.egoDetailSlot];
  const detailSlot = state.ui.egoDetailSlot;
  const setDetailSlot = (v) => dispatch({ type: "SET_UI", ui: { egoDetailSlot: v } });
  const getEgoAnalysisInfo = (rank, slot) => {
    const owned = (state.roster?.egos || []).find((entry) => entry.rank === rank && String(entry.no) === String(slot?.no));
    const alreadyAnalyzed = !!owned && (owned.analyzed === true || owned.analyzeMax === true);
    return {
      alreadyAnalyzed,
      cost: alreadyAnalyzed || !slot ? null : window.LBT_operationCost?.("analyze", { rank, no: slot.no }, window.DB) || null,
      balance: window.LBT_computeLedgerBalance?.(state.results, state.entries) || null
    };
  };
  const analysisInfo = detailSlot && state.egoSlots[detailSlot]
    ? getEgoAnalysisInfo(detailSlot, state.egoSlots[detailSlot])
    : null;
  const toggleEgoManual = () => {
    if (state.egoManual) {
      const slot = detailSlot ? state.egoSlots[detailSlot] : null;
      const info = slot ? getEgoAnalysisInfo(detailSlot, slot) : null;
      const short = !!(info && !info.alreadyAnalyzed && info.cost && info.balance
        && Number(info.balance.shards) < Number(info.cost.shards));
      dispatch({ type: "SAVE_EGO_BUILD", rank: detailSlot });
      dispatch({ type: "SET_EGO_MANUAL", value: false });
      toast(short
        ? `解析内容は保存しましたが、自我の欠片が不足しているため解析済み扱い・費用記録は付きません（必要 ${info.cost.shards} / 手持ち ${info.balance.shards}）。所持残高を整えて再度確定してください。`
        : "解析内容を保持したまま解析モードを終了しました", short ? "assertive" : void 0);
      return;
    }
    const slot = detailSlot ? state.egoSlots[detailSlot] : null;
    if (!slot) return;
    const info = getEgoAnalysisInfo(detailSlot, slot);
    if (info.cost && info.balance && Number(info.balance.shards) < Number(info.cost.shards)) {
      toast(`自我の欠片が足りません（必要 ${info.cost.shards} / 手持ち ${info.balance.shards}）`, "assertive");
      return;
    }
    dispatch({ type: "SET_EGO_MANUAL", value: true });
    toast("解析：E.G.Oの効果・ダイスをその場で確認・修正できます");
  };
  const hasAnyEgo = Object.values(state.egoSlots || {}).some(Boolean);
  // 一覧は既定で展開。以前は「EGO を持っていれば畳む」= !hasAnyEgo にして
  // いたが、装備済みだと E.G.O 一覧が最初から隠れた状態になり、
  // リロードのたびに何かが閉じた状態から始まっていた。
  // 全件を見る・絞り込みフィルタを開いたときだけ縮む想定は変わらない。
  const listExpanded = state.ui.egoListExpanded !== void 0 ? state.ui.egoListExpanded : true;
  const setListExpanded = (v) => dispatch({ type: "SET_UI", ui: { egoListExpanded: v } });
/* build 側の E.G.O 一覧は「未所持（購入できる）を含む全部」を既定にする。
   所持だけを出すゲートを別に持つと、ゲートと所持フィルタが同じことを
   二重に制御して片方を消してももう片方が残るという競合が起きていた。
   ここは一意：ownedOnly = 所持のみを出すか、だけ。 */
const [ownedOnly, setOwnedOnly] = React.useState(false);
  // P0: 初期表示は検索・最近使用・所持を優先し、全件一覧と詳細フィルタは利用者が明示して開く。
  const [browseAll, setBrowseAll] = React.useState(false);
  /* 取得方法。E.G.O は抽出と指定購入で core ルールの欠片数が変わる。 */
  const [acquireHow, setAcquireHow] = React.useState("purchase");
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
  const updateResourceFilter = (sin, mode) => {
    clearEgoListSelection();
    setBrowseAll(true);
    if (mode === "required") {
      setRequiredResources((values) => values.includes(sin) ? values.filter((value) => value !== sin) : [...values, sin]);
      setExcludedResources((values) => values.filter((value) => value !== sin));
      return;
    }
    setExcludedResources((values) => values.includes(sin) ? values.filter((value) => value !== sin) : [...values, sin]);
    setRequiredResources((values) => values.filter((value) => value !== sin));
  };
  const updateSinFilter = (sin) => {
    clearEgoListSelection();
    setBrowseAll(true);
    setSinFilter(sin);
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
  useEgoResourceFilterControls(requiredResources, excludedResources, (sin) => updateResourceFilter(sin, "required"), (sin) => updateResourceFilter(sin, "excluded"));
  const searchTarget = state.ui?.egoSearchTarget;
  const searchTargetKey = searchTarget ? `${searchTarget.rank}:${searchTarget.no}` : "";
  React.useEffect(() => {
    if (!searchTargetKey) return;
    const target = catalogEgos.find((ego) => `${ego.rank}:${ego.no}` === searchTargetKey);
    if (!target) return;
    setQuery("");
    setRequiredResources([]);
    setExcludedResources([]);
    setKeywordFilter("");
    setOwnedOnly(false);
    setBrowseAll(ownedOnlyProp);
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
  const egoKeywordOptions = React.useMemo(() => EGO_KEYWORD_ORDER.map((keyword) => String(keyword || "").trim()).filter(Boolean).filter((keyword) => catalogEgos.some((ego) => egoMatchesKeyword(ego, keyword))), [catalogEgos]);
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalogEgos.filter((e) => {
      if (ownedOnly && !ownedKeys.has(`${e.rank}:${e.no}`)) return false;
      if (rankFilter && e.rank !== rankFilter) return false;
      if (!egoMatchesResourceFilters(e, requiredResources, excludedResources)) return false;
      const hay = getEgoKeywordHaystack(e);
      if (keywordFilter && !egoMatchesKeyword(e, keywordFilter)) return false;
      if (q && !hay.includes(q)) return false;
      return true;
    });
  }, [query, rankFilter, requiredResources, excludedResources, keywordFilter, ownedOnly, ownedKeys, catalogEgos]);
  const quickEgos = React.useMemo(() => {
    const source = catalogEgos;
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
  }, [state.ui?.egoRecent, ownedKeys, catalogEgos]);
  const isExploringAll = ownedOnly || browseAll || !!query.trim() || !!rankFilter || requiredResources.length > 0 || excludedResources.length > 0 || !!keywordFilter || ownedOnly;
  const visibleEgos = isExploringAll ? filtered : quickEgos;
  const equip = () => {
    if (!selected) return;
    recordRecentEgo(selected);
    dispatch({ type: "SET_EGO_SLOT", rank: selected.rank, value: selected });
    toast(`${selected.rank}: 『${selected.name}』を装備`);
  };
  /* 試着装備。購入も所持登録もせず、スロットだけ差し替える。
     「この E.G.O を買う価値があるか」を効果だけ見て判断したい時に使う。 */
  const previewEquip = () => {
    if (!selected) return;
    dispatch({ type: "SET_EGO_SLOT", rank: selected.rank, value: selected, preview: true });
    toast(`${selected.rank}: 『${selected.name}』を試着しました（所持には入りません）`, "assertive");
  };
  const unequip = () => {
    if (!selected) return;
    const slot = Object.entries(state.egoSlots || {}).find(([_, v]) => v && v.name === selected.name && String(v.no ?? "") === String(selected.no ?? ""))?.[0];
    if (slot) dispatch({ type: "SET_EGO_SLOT", rank: slot, value: null });
  };
  const clearSlot = (rk) => dispatch({ type: "SET_EGO_SLOT", rank: rk, value: null });
  const currentSlot = selected ? Object.entries(state.egoSlots || {}).find(([_, v]) => v && v.name === selected.name && String(v.no ?? "") === String(selected.no ?? ""))?.[0] : null;
  const slotCards = EGO_RANKS.map((rk) => {
    const e = state.egoSlots[rk];
    const isDetailActive = detailSlot === rk;
    const isSlotSelected = !!e && String(selected?.no ?? "") === String(e.no ?? "") && selected?.name === e.name;
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
              // 選択直後は右列の簡易カードだけを開く。全文確認・解析は明示操作で開くため、
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
      ) : (rankFilter === rk ? h("div", { style: { marginTop: 4, padding: "2px 6px", fontSize: "var(--fs-9)", fontFamily: "var(--f-display)", letterSpacing: "0.14em", color: "var(--gold)", background: "var(--gold-tint)", border: "1px solid var(--gold-line)", borderRadius: 2, alignSelf: "flex-start" } }, "▼ 下で絞り込み中") : null)
    );
  });
  const egoGrid = h("div", { className: "codex-grid", style: { gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))" } }, ...(visibleEgos.map((e) => {
    const isEquipped = Object.values(state.egoSlots || {}).some((v) => v && String(v.no ?? "") === String(e.no ?? "") && v.name === e.name);
    return h(
      "div",
      {
        key: `${e.rank}-${e.no}`,
        className: `p-card${String(selected?.no ?? "") === String(e.no ?? "") && selected?.name === e.name ? " is-active" : ""}${isEquipped ? " is-equipped" : ""}`,
        style: { "--sin-primary": `var(--rank-${e.rank})`, minHeight: 120 },
        onClick: () => setSelected(e),
        onDoubleClick: () => { setSelected(e); recordRecentEgo(e); dispatch({ type: "SET_EGO_SLOT", rank: e.rank, value: e }); toast(`${e.rank}: 『${e.name}』を装備`); }
      },
      h("div", { className: "p-card-head ego-card-head" },
        h("span", { className: "p-num" }, "No.", String(e.no).padStart(3, "0")),
        h("div", { className: "ego-card-marks" },
          h("span", { className: "badge", "data-rank": e.rank, style: { fontSize: "var(--fs-9)" } }, e.rank),
          (e.sub_skills || []).length > 0 ? h("span", { className: "ego-doka-badge", title: "同化スキル対応EGO" }, "◆ 同化") : null
        )
      ),
      h("div", { className: "p-name" }, e.name),
      h(EgoResourceChips, { resources: e.resources, className: "is-catalog" }),
      h("div", { className: "p-kw-row", style: { marginTop: "auto" } }, h("span", { className: "p-kw" }, "SAN ", e.san_cost), h("span", { className: "p-kw" }, "欠片 ", e.shards)),
      /* 装備はカード本体のボタン/タップで行う（ダブルクリックに依存しない）。 */
      !isEquipped && h("button", {
        type: "button",
        className: "btn btn-sm p-card-quick-equip",
        onClick: (event) => {
          event.stopPropagation();
          recordRecentEgo(e);
          dispatch({ type: "SET_EGO_SLOT", rank: e.rank, value: e });
          toast(`${e.rank}: 『${e.name}』を装備`);
        },
        title: "詳細を開かずにこのE.G.Oを装備する"
      }, "装備"),
      isEquipped && h("span", { className: "p-card-equipped-mark" }, "装備中")
    );
  })));
  return h(
    "div",
    { className: `stack-4 ego-section${selected ? " has-selection" : " is-catalog-only"}` },
    h("div", null, h(Button, { icon: "plus", variant: "primary", onClick: () => setCreating(!creating), "aria-expanded": creating }, "E.G.Oを新規作成")),
    creating && h("form", { className: "card card-body stack-3", onSubmit: createEgo, "aria-label": "E.G.O新規作成" },
      h("p", null, "DBを変更せず、空のオリジナルE.G.Oを作成します。作成後に覚醒・侵蝕・費用・固有を解析できます。"),
      h(Field, { label: "新規E.G.O名" }, h("input", { className: "input", "aria-label": "新規E.G.O名", required: true, autoFocus: true, value: newName, onChange: (event) => setNewName(event.target.value) })),
      h(Field, { label: "作成ランク" }, h("select", { className: "select", "aria-label": "作成ランク", value: newRank, onChange: (event) => setNewRank(event.target.value) }, ...EGO_RANKS.map((rank) => h("option", { key: rank, value: rank }, rank)))),
      state.egoSlots[newRank] && h("p", { role: "status" }, "このランクは装備済みです。作成時に確認し、現在の編集内容はライブラリへ保存します。"),
      h("div", { style: { display: "flex", gap: 8 } }, h("button", { className: "btn btn-primary", type: "submit", disabled: !newName.trim() }, "作成して解析"), h("button", { className: "btn btn-ghost", type: "button", onClick: () => setCreating(false) }, "キャンセル"))),
    h("div", null,
      h("div", { className: "t-label", style: { marginBottom: "var(--s-2)", display: "flex", alignItems: "center", gap: 8 } }, h("span", null, "装備中のE.G.O"), h("span", { style: { fontSize: "var(--fs-9)", color: "var(--tx-mute)", fontWeight: 400, letterSpacing: "0.08em" } }, "装備済スロット：クリックで詳細を開く　未装備スロット：クリックで一覧展開"), h("div", { style: { flex: 1 } }), hasAnyEgo ? h(Button, { size: "sm", icon: listExpanded ? "chevronU" : "chevronD", onClick: () => { setListExpanded(!listExpanded); if (listExpanded) setRankFilter(""); }, title: listExpanded ? "一覧を折り畳む" : "別のE.G.Oを選ぶ" }, listExpanded ? "一覧を畳む" : "別のE.G.Oを選ぶ") : null),
      h("div", { className: "ego-slots" }, ...slotCards),
    /* 所持フィルタはここ一つだけ。以前は「表示範囲」ゲートが別にあり、
       ゲートを解除しても別フラグが残るため片方だけ効くことがあった。 */
    h("div", { className: "codex-filter-row owned-gate-row" },
    h("span", { className: "filter-label" }, "所持"),
    h("button", {
    type: "button",
    className: `chip${!ownedOnly ? " is-active" : ""}`,
    "aria-pressed": !ownedOnly,
    onClick: () => updateOwnedOnly(false)
    }, "全部"),
    h("button", {
    type: "button",
    className: `chip${ownedOnly ? " is-active" : ""}`,
    "aria-pressed": ownedOnly,
    onClick: () => updateOwnedOnly(true)
    }, "所持のみ")
    ),
      detailSlot && state.egoSlots[detailSlot] ? h("div", { className: "equipped-detail-wrap" }, h("div", { style: { display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", background: "var(--surface-2)", borderBottom: "1px solid var(--line-dim)" } }, h("span", { className: "badge", "data-rank": detailSlot }, detailSlot), h("span", { style: { fontFamily: "var(--f-display)", fontWeight: 600, color: "var(--tx)" } }, state.egoManual ? "装備中E.G.O / 解析" : "装備中E.G.O / 詳細"), h("div", { style: { flex: 1 } }),
      h("button", { type: "button", className: "ego-analysis-toggle btn btn-sm " + (state.egoManual ? "btn-primary" : "btn-secondary"), "aria-pressed": state.egoManual, onClick: toggleEgoManual, title: state.egoManual ? "解析を終了（内容は保持）" : "解析を開始" }, h(Icon, { name: state.egoManual ? "check" : "edit", size: 12 }), state.egoManual ? " 解析を終了" : " 解析を開始"),
      h("button", { className: "btn btn-sm btn-ghost", onClick: () => { dispatch({ type: "SET_EGO_MANUAL", value: false }); setDetailSlot(null); }, title: "閉じる" }, h(Icon, { name: "x", size: 12 }), " 閉じる")),       analysisInfo && h("div", { className: `ego-analysis-cost-note${analysisInfo.cost && analysisInfo.balance && Number(analysisInfo.balance.shards) < Number(analysisInfo.cost.shards) ? " is-short" : ""}`, role: "note" },
        analysisInfo.alreadyAnalyzed
          ? "解析済み：編集内容は自動保存され、再編集では追加費用は発生しません。"
          : analysisInfo.cost
            ? `初回解析の確定時に自我の欠片 ${analysisInfo.cost.shards} 個を消費します${analysisInfo.balance ? `。現在残高 ${analysisInfo.balance.shards} 個` : ""}。残高不足の場合、編集内容は保存されますが解析済み扱い・費用記録は付きません。`
            : "このE.G.Oの解析費用を取得できませんでした。編集内容の保存後、費用記録を確認してください。"),
h("div", { className: "equipped-detail-inner" }, editable ? null : h(EgoDetail, { ego: state.egoSlots[detailSlot], equipTo: detailSlot, currentSlot: detailSlot, onEquip: () => {}, onUnequip: () => { clearSlot(detailSlot); setDetailSlot(null); }, dispatch }), editable ? h(EquippedEgoEditor, { rank: detailSlot, ego: state.egoSlots[detailSlot], dispatch }) : null)) : null,
      hasAnyEgo && !listExpanded ? h("div", { className: "codex-collapsed-hint" }, h("span", { style: { color: "var(--tx-mute)", fontSize: "var(--fs-11)", letterSpacing: "0.14em", fontFamily: "var(--f-display)" } }, "◇ E.G.O 一覧は折り畳み中"), h("span", { style: { marginLeft: 12, fontSize: "var(--fs-10)", color: "var(--tx-dim)" } }, "未装備スロットをクリックすると、そのランクだけ絞り込んで展開されます。"), h("button", { className: "btn btn-sm", style: { marginLeft: "auto" }, onClick: () => { setListExpanded(true); setRankFilter(""); } }, "一覧を展開")) : null
    ),
    (!hasAnyEgo || listExpanded) ? h("div", { className: "codex" }, h("div", { className: "codex-main" }, h("div", { className: `codex-filters ego-catalog-filters${filtersOpen ? " is-filter-open" : ""}` }, h("div", { className: "codex-filter-row" }, h("div", { className: "codex-search" }, h(Icon, { name: "search", size: 14 }), h("input", { type: "text", "aria-label": "E.G.O名・効果・キーワード・資源で検索", placeholder: "E.G.O名・効果・キーワード・資源で検索...", value: query, onChange: (e) => updateQuery(e.target.value) })), h("div", { className: "codex-count" }, h("strong", null, visibleEgos.length), isExploringAll ? " / " : " 件の候補", isExploringAll ? catalogEgos.length : ""), h("button", { className: "btn btn-sm ego-filter-toggle", onClick: () => setFiltersOpen(!filtersOpen), "aria-expanded": filtersOpen, title: "ランク・大罪・キーワード・所持の絞り込みを開く" }, filtersOpen ? "絞り込みを閉じる" : "絞り込み"), !isExploringAll ? h("button", { className: "btn btn-sm ego-browse-all", onClick: () => setBrowseAll(true), title: "全E.G.Oを一覧から探す" }, "全件を見る") : null, rankFilter ? h("button", { className: "btn btn-sm", onClick: () => setRankFilter(""), style: { color: "var(--gold)", borderColor: "var(--gold-line)" } }, rankFilter, " 絞り込み中 ×") : null), h("div", { className: "codex-filter-row" }, h("span", { className: "filter-label" }, "ランク"), h("div", { className: "chips-group" }, ...EGO_RANKS.map((r) => h("button", { key: r, className: "chip", onClick: () => setRankFilter(rankFilter === r ? "" : r), style: { background: rankFilter === r ? `color-mix(in oklab, var(--rank-${r}) 25%, var(--surface-2))` : void 0, borderColor: rankFilter === r ? `var(--rank-${r})` : void 0, color: rankFilter === r ? "var(--tx)" : void 0 } }, h("span", { style: { width: 6, height: 6, borderRadius: 999, background: `var(--rank-${r})`, marginRight: 4, display: "inline-block" } }), r)))), h("div", { className: "codex-filter-row" }, h("span", { className: "filter-label" }, "大罪"), h("div", { className: "chips-group" }, ...SIN_LIST.map((s) => h(Chip, { key: s, sin: s, active: sinFilter === s, onClick: () => updateSinFilter(sinFilter === s ? "" : s) }, s)))), h("div", { className: "codex-filter-row" }, h("span", { className: "filter-label" }, "キーワード"), h("div", { className: "chips-group" }, ...egoKeywordOptions.map((keyword) => h(Chip, { key: keyword, size: "sm", active: keywordFilter === keyword, onClick: () => updateKeywordFilter(keywordFilter === keyword ? "" : keyword) }, keyword)))), h("div", { className: "codex-filter-row" }, h("span", { className: "filter-label" }, "所持"), h("div", { className: "chips-group" }, h(Chip, { size: "sm", active: ownedOnly, onClick: () => updateOwnedOnly(!ownedOnly) }, "所持しているもののみ", ownedOnly ? ` (${ownedKeys.size})` : ""))), !isExploringAll && visibleEgos.length === 0 ? h("div", { className: "ego-discovery-empty" }, h("strong", null, "最近使用・所持中のE.G.Oはありません"), h("span", null, "名称で検索するか、「全件を見る」から探してください。")) : egoGrid)), h(DetailDialog, { open: !!selected, onClose: () => setSelected(null), label: "E.G.O 詳細" }, h(EgoQuickDetail, { ego: selected, currentSlot, state, acquireHow, onAcquireHowChange: setAcquireHow, onAcquire: () => { dispatch({ type: "ADD_ROSTER_EGO", rank: selected.rank, no: selected.no, purchase: true }); toast(`「${selected.name}」を所持に購入しました`, "assertive"); }, onEquip: equip, onUnequip: unequip,
      isOwned: !!(selected && ownedKeys.has(`${selected.rank}:${selected.no}`)),
    onPreviewEquip: previewEquip,
      onToggleOwned: () => {
        if (!selected) return;
        const entry = (state.roster?.egos || []).find((x) => x.rank === selected.rank && String(x.no ?? "") === String(selected.no ?? ""));
        if (entry) {
          if (entry.build?.__custom && currentSlot) { toast("装備中の自作E.G.Oは削除できません。先に装備を外してください。", "assertive"); return; }
          if (entry.build?.__custom && !confirm(`『${selected.name}』の自作E.G.O定義を削除しますか？元のDBには存在しないため、保存ファイルがなければ復元できません。`)) return;
          dispatch({ type: "REMOVE_ROSTER_EGO", uid: entry.uid, deleteCustomConfirmed: true });
          if (entry.build?.__custom) setSelected(null);
          toast(`『${selected.name}』を所持リストから外しました`);
        }
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
      } }))) : null
  );
};
const SpiritSection = ({ state, dispatch, ownedOnly = false }) => {
  const hasExplicitSpiritPrice = window.LBT_hasExplicitSpiritPrice || ((definition) => {
    if (!definition || !definition.name) return false;
    const price = definition.price;
    const numeric = (typeof price === "number" && Number.isFinite(price))
      || (typeof price === "string" && price.trim() !== "" && Number.isFinite(Number(price)));
    return numeric && Number(price) >= 0;
  });
  const isExplicitlyFreeSpirit = window.LBT_isExplicitlyFreeSpirit
    || ((definition) => hasExplicitSpiritPrice(definition) && Number(definition.price) === 0);
  const [selected, setSelected] = React.useState(null);
  const [query, setQuery] = React.useState("");
  const [sourceFilter, setSourceFilter] = React.useState("all");
  /* build 側の精神タブは既定で所持済みだけを出す。ロックではなく
     フィルタで解除でき、解除時は全件から選べる（未所持はここで購入できる）。 */
  const [gateOpen, setGateOpen] = React.useState(false);
  const gated = ownedOnly && !gateOpen;
  const spiritSource = React.useMemo(() => {
    if (!gated) return DB.spirits;
    const owned = (state.roster?.spirits || []).map((e) => e.name);
    return DB.spirits.filter((sp) => owned.includes(sp.name));
  }, [gated, state.roster?.spirits]);
  /* ゲート解除時は全件から選べるので、所持済みかどうかを明示して導線を分ける。 */
  const ownedSpiritNames = new Set((state.roster?.spirits || []).map((e) => e.name));

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return spiritSource.filter((s) => {
      if (sourceFilter !== "all" && catalogSource(s) !== sourceFilter) return false;
      return !q || `${s.name} ${s.morale_effect || ""} ${s.confuse_effect || ""} ${s.always_effect || ""}`.toLowerCase().includes(q);
    });
  }, [spiritSource, query, sourceFilter]);
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
    ), dbSpirit.price > 0 && /* @__PURE__ */ React.createElement("span", { style: { marginLeft: 8, fontFamily: "var(--f-mono)", fontSize: "var(--fs-10)", color: "var(--gold)", padding: "3px 8px", background: "var(--surface-inset)", border: "1px solid var(--line-dim)", borderRadius: "var(--r-sm)" } }, "\u6B20\u7247 ", dbSpirit.price), /* @__PURE__ */ React.createElement("div", { style: { flex: 1 } }), /* @__PURE__ */ React.createElement(Button, { variant: "ghost", size: "sm", icon: "edit", onClick: () => setForceEditSpirit(true) }, "\u624B\u52D5\u7DE8\u96C6"), /* @__PURE__ */ React.createElement(Button, { variant: "ghost", size: "sm", icon: "x", onClick: () => {
      setF("spirit", "");
      setF("spiritMorale", "");
      setF("spiritConfuse", "");
      setF("spiritAlways", "");
      setForceEditSpirit(false);
      toast("\u7CBE\u795E\u3092\u89E3\u9664");
    } }, "\u89E3\u9664")), /* @__PURE__ */ React.createElement("div", { className: "deck-name", style: { fontFamily: "var(--f-display)", fontWeight: 700, fontSize: "var(--fs-18)", color: "var(--tx)", marginBottom: "var(--s-3)", lineHeight: 1.2 } }, state.spirit), /* @__PURE__ */ React.createElement("div", { className: "stack-3" }, state.spiritAlways && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--f-display)", fontSize: "var(--fs-9)", letterSpacing: "0.18em", color: "var(--gold)", textTransform: "uppercase", marginBottom: 4 } }, "ALWAYS / \u5E38\u6642\u767A\u52D5"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-12)", color: "var(--tx-2)", lineHeight: 1.7, padding: "8px 12px", background: "var(--gold-tint)", border: "1px solid var(--gold-line)", borderLeft: "3px solid var(--gold)", borderRadius: "var(--r-sm)", whiteSpace: "pre-wrap" } }, state.spiritAlways)), state.spiritMorale && state.spiritMorale !== "\u306A\u3057" && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--f-display)", fontSize: "var(--fs-9)", letterSpacing: "0.18em", color: "var(--warn)", textTransform: "uppercase", marginBottom: 4 } }, "MORALE / \u58EB\u6C17\u4F4E\u4E0B\u52B9\u679C"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-12)", color: "var(--tx-2)", lineHeight: 1.7, padding: "8px 12px", background: "color-mix(in oklab, var(--warn) 8%, var(--surface-inset))", border: "1px solid color-mix(in oklab, var(--warn) 30%, var(--line-dim))", borderLeft: "3px solid var(--warn)", borderRadius: "var(--r-sm)", whiteSpace: "pre-wrap" } }, state.spiritMorale)), state.spiritConfuse && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { style: { fontFamily: "var(--f-display)", fontSize: "var(--fs-9)", letterSpacing: "0.18em", color: "var(--err)", textTransform: "uppercase", marginBottom: 4 } }, "CONFUSE / \u6DF7\u4E71\u52B9\u679C"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-12)", color: "var(--tx-2)", lineHeight: 1.7, padding: "8px 12px", background: "color-mix(in oklab, var(--err) 8%, var(--surface-inset))", border: "1px solid color-mix(in oklab, var(--err) 30%, var(--line-dim))", borderLeft: "3px solid var(--err)", borderRadius: "var(--r-sm)", whiteSpace: "pre-wrap" } }, state.spiritConfuse))))
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
  )), !isCurrentSpirit && /* @__PURE__ */ React.createElement("div", { style: { display: "flex", justifyContent: "flex-end" } }, /* @__PURE__ */ React.createElement(Button, { variant: "ghost", size: "sm", icon: "plus", onClick: addManualSpirit }, "\u624B\u52D5\u3067\u7CBE\u795E\u3092\u8FFD\u52A0")), /* @__PURE__ */ React.createElement("div", { className: "codex" }, /* @__PURE__ */ React.createElement("div", { className: "codex-main" }, /* @__PURE__ */ React.createElement("div", { className: "codex-filters" }, ownedOnly && /* @__PURE__ */ React.createElement("div", { className: "codex-filter-row owned-gate-row" }, /* @__PURE__ */ React.createElement("span", { className: "filter-label" }, "表示範囲"), /* @__PURE__ */ React.createElement("div", { className: "chips-group" }, /* @__PURE__ */ React.createElement("button", { type: "button", className: `chip${!gateOpen ? " is-active" : ""}`, "aria-pressed": !gateOpen, onClick: () => setGateOpen(false) }, "所持のみ"), /* @__PURE__ */ React.createElement("button", { type: "button", className: `chip${gateOpen ? " is-active" : ""}`, "aria-pressed": gateOpen, onClick: () => setGateOpen(true), title: "未所持の精神も一覧へ出し、その場で購入できます" }, "未所持も表示（全体から選ぶ）"))), /* @__PURE__ */ React.createElement("div", { className: "codex-filter-row" }, /* @__PURE__ */ React.createElement("div", { className: "codex-search" }, /* @__PURE__ */ React.createElement(Icon, { name: "search", size: 14 }), /* @__PURE__ */ React.createElement("input", { type: "text", "aria-label": "精神名・効果で検索", placeholder: "\u7CBE\u795E\u540D\u30FB\u52B9\u679C\u3067\u691C\u7D22...", value: query, onChange: (e) => setQuery(e.target.value) })), /* @__PURE__ */ React.createElement("div", { className: "codex-count" }, /* @__PURE__ */ React.createElement("strong", null, filtered.length), " / ", DB.spirits.length))), /* @__PURE__ */ React.createElement("div", { className: "spirit-list" }, filtered.map((sp) => {
    const isSelected = selected?.name === sp.name;
    const isEquipped = state.spirit === sp.name;
    const isOwned = ownedSpiritNames.has(sp.name);
    const spiritBody = /* @__PURE__ */ React.createElement(
      "div",
      {
        key: sp.name,
        className: `spirit-item${isSelected ? " is-active" : ""}${isEquipped ? " is-equipped" : ""}`,
        onClick: () => setSelected(sp),
        onDoubleClick: () => applySpirit(sp)
      },
      /* @__PURE__ */ React.createElement("div", { className: "spirit-item-head" }, /* @__PURE__ */ React.createElement("div", { className: "spirit-item-name" }, sp.name), /* @__PURE__ */ React.createElement("span", { className: "spirit-item-price" }, isExplicitlyFreeSpirit(sp) ? "\u521D\u671F\u9078\u629E\u53EF" : hasExplicitSpiritPrice(sp) && Number(sp.price) > 0 ? `\u6B20\u7247 ${sp.price}` : "\u4FA1\u683C\u4E0D\u660E"), isEquipped && /* @__PURE__ */ React.createElement("span", { style: { marginLeft: "auto", fontSize: "var(--fs-9)", color: "var(--gold)", fontFamily: "var(--f-display)", letterSpacing: "0.16em" } }, "\u2605 \u88C5\u5099\u4E2D")),
      sp.always_effect && /* @__PURE__ */ React.createElement("div", { className: "spirit-item-line" }, /* @__PURE__ */ React.createElement("span", { className: "spirit-item-tag", "data-tag": "always" }, "\u5E38\u6642"), /* @__PURE__ */ React.createElement("span", null, sp.always_effect)),
      sp.morale_effect && sp.morale_effect !== "\u306A\u3057" && /* @__PURE__ */ React.createElement("div", { className: "spirit-item-line" }, /* @__PURE__ */ React.createElement("span", { className: "spirit-item-tag", "data-tag": "morale" }, "\u58EB\u6C17"), /* @__PURE__ */ React.createElement("span", null, sp.morale_effect)),
      /* @__PURE__ */ React.createElement("div", { className: "spirit-item-line" }, /* @__PURE__ */ React.createElement("span", { className: "spirit-item-tag", "data-tag": "confuse" }, "\u6DF7\u4E71"), /* @__PURE__ */ React.createElement("span", null, sp.confuse_effect)),
      /* 購入・装備はカード本体のボタン/タップで行う（ダブルクリックに依存しない）。 */
      /* @__PURE__ */ React.createElement("div", { className: "spirit-item-actions" },
        !isOwned && h(Button, {
          size: "sm",
          variant: "primary",
          onClick: (event) => {
            event.stopPropagation();
            dispatch({ type: "ADD_ROSTER_SPIRIT", spirit: sp });
            toast(`『${sp.name}』を所持に購入しました`, "assertive");
          },
          title: "詳細を開かずにこの精神を購入して所持にする"
        }, "購入"),
        isOwned && !isEquipped && h(Button, {
          size: "sm",
          onClick: (event) => {
            event.stopPropagation();
            applySpirit(sp);
          },
          title: "詳細を開かずにこの精神を装備する"
        }, "装備"),
        isEquipped && h("span", { className: "spirit-item-equipped" }, "装備中")
      )
    );
    /* ここを返さないと map が undefined を並べ、列表は空のままになる。
       件数（counter）は別に出るので、一見すると「あるのに出ない」状態になる。 */
    return spiritBody;
  }))), selected ? /* @__PURE__ */ React.createElement("div", { className: "codex-detail" }, /* @__PURE__ */ React.createElement("div", { className: "detail-head", style: { "--sin-primary": "var(--gold)" } }, /* @__PURE__ */ React.createElement("div", { className: "detail-eyebrow" }, /* @__PURE__ */ React.createElement("span", { className: "detail-num" }, isExplicitlyFreeSpirit(selected) ? "\u521D\u671F\u9078\u629E\u53EF" : hasExplicitSpiritPrice(selected) && Number(selected.price) > 0 ? `\u6B20\u7247 ${selected.price}` : "\u4FA1\u683C\u4E0D\u660E"), /* @__PURE__ */ React.createElement("span", { className: "detail-type" }, "SPIRIT / \u7CBE\u795E")), /* @__PURE__ */ React.createElement("div", { className: "detail-name" }, selected.name)), /* @__PURE__ */ React.createElement("div", { className: "detail-body" }, selected.always_effect && /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "detail-section-title" }, "\u5E38\u6642\u52B9\u679C"), /* @__PURE__ */ React.createElement("div", { className: "detail-passive" }, /* @__PURE__ */ React.createElement("div", { className: "detail-passive-effect" }, selected.always_effect))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "detail-section-title" }, "\u58EB\u6C17\u4F4E\u4E0B\u52B9\u679C"), /* @__PURE__ */ React.createElement("div", { className: "detail-passive", style: { borderLeftColor: "var(--warn)" } }, /* @__PURE__ */ React.createElement("div", { className: "detail-passive-effect" }, selected.morale_effect || "\u306A\u3057"))), /* @__PURE__ */ React.createElement("div", null, /* @__PURE__ */ React.createElement("div", { className: "detail-section-title" }, "\u6DF7\u4E71\u52B9\u679C"), /* @__PURE__ */ React.createElement("div", { className: "detail-passive", style: { borderLeftColor: "var(--err)" } }, /* @__PURE__ */ React.createElement("div", { className: "detail-passive-effect" }, selected.confuse_effect)))), /* @__PURE__ */ React.createElement("div", { className: "detail-actions" }, state.spirit === selected.name ? /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-10)", color: "var(--gold)", textAlign: "center", fontFamily: "var(--f-display)", letterSpacing: "0.2em", textTransform: "uppercase" } }, "\u2605 \u73FE\u5728\u88C5\u5099\u4E2D") : /* @__PURE__ */ React.createElement(Button, { variant: "primary", onClick: () => applySpirit(selected), icon: "check" }, "\u3053\u306E\u7CBE\u795E\u3092\u88C5\u5099"))) : /* @__PURE__ */ React.createElement("div", { className: "codex-detail" }, /* @__PURE__ */ React.createElement("div", { className: "detail-empty" }, /* @__PURE__ */ React.createElement("div", { className: "detail-empty-icon" }, "\u{1F701}"), /* @__PURE__ */ React.createElement("div", { className: "t-label" }, "\u5DE6\u306E\u30AB\u30FC\u30C9\u3092\u9078\u629E"), /* @__PURE__ */ React.createElement("div", { style: { fontSize: "var(--fs-11)", color: "var(--tx-mute)", marginTop: 8 } }, "\u7CBE\u795E\u3092\u9078\u629E\u3059\u308B\u3068\u8A73\u7D30\u304C\u8868\u793A\u3055\u308C\u307E\u3059\u3002", /* @__PURE__ */ React.createElement("br", null), "\u30C0\u30D6\u30EB\u30AF\u30EA\u30C3\u30AF\u3067\u88C5\u5099\u3002")))));
  /* 精神の初期枠。アイテムと同じ操作だが、精神は装備するものであって
     買うものではないため、取り込んでも支出は発生しない。 */
  const [spiritInitialPickOpen, setSpiritInitialPickOpen] = React.useState(false);
  const freeSpiritNames = new Set(DB.spirits.filter(isExplicitlyFreeSpirit).map((sp) => sp.name));
  const initialSpiritNames = (Array.isArray(state.initialSpirits) ? state.initialSpirits : [])
    .filter((name) => freeSpiritNames.has(name));
  /* 無料の精神は初めから所持している（保存経路でフラグが落ちても
     判定が壊れないよう、所持の有無ではなく DB の価格で数える）。 */
  const spiritInitialSeeded = (state.roster?.spirits || []).filter((entry) => {
    const def = DB.spirits.find((s) => s.name === entry.name);
    return def && isExplicitlyFreeSpirit(def);
  }).length;
  const toggleInitialSpirit = (name) => dispatch({
    type: "SET_INITIAL_SPIRITS",
    names: initialSpiritNames.includes(name)
      ? initialSpiritNames.filter((value) => value !== name)
      : [...initialSpiritNames, name]
  });
  const spiritInitialFrame = h("div", { className: "stack-2" },
    h("div", { className: "owned-library-bar" },
    h("span", { className: "t-label" }, "INITIAL FRAME / 初期枠"),
    h("span", { className: "ledger-note" },
    `初期枠 ${initialSpiritNames.length}件 / 取り込み済み ${spiritInitialSeeded}件。精神は装備するもので購入ではありません`)
    ),
    h("div", { className: "codex-add-row" },
    h(Button, { size: "sm", variant: "ghost", onClick: () => setSpiritInitialPickOpen((open) => !open) }, spiritInitialPickOpen ? "選ぶのを閉じる" : "選ぶ"),
    h(Button, { size: "sm", variant: "primary", icon: "check", disabled: !initialSpiritNames.length, onClick: () => dispatch({ type: "APPLY_INITIAL_SPIRITS" }) }, "初期枠から取り込む")
    ),
    spiritInitialPickOpen && h("div", { className: "stack-1" }, DB.spirits.map((sp) => {
      const knownPrice = hasExplicitSpiritPrice(sp);
      const price = Number(sp.price);
      return h("label", { key: sp.name, className: "initial-pick-row" },
        h("input", {
          type: "checkbox",
          checked: initialSpiritNames.includes(sp.name),
          disabled: !isExplicitlyFreeSpirit(sp),
          title: isExplicitlyFreeSpirit(sp) ? undefined : knownPrice ? "有料の精神はショップから取得してください" : "価格が不明なため初期枠に追加できません",
          onChange: () => { if (isExplicitlyFreeSpirit(sp)) toggleInitialSpirit(sp.name); }
        }),
        h("span", null, sp.name),
        isExplicitlyFreeSpirit(sp)
          ? h("span", { className: "badge inv-origin is-initial" }, "初期選択可")
          : knownPrice && price > 0
            ? h("span", { className: "ledger-note" }, `${sp.price} 欠片`)
            : h("span", { className: "ledger-note" }, "価格不明")
      );
    }))
  );
  return /* @__PURE__ */ React.createElement("div", { className: "stack-4" }, spiritBody, spiritInitialFrame);
};
const EnhancementSection = ({ state, dispatch }) => {
  const h = React.createElement;
  const isUnsyncedOnly = window.LBT_isUnsyncedOnlyEnhancement || ((entry) => entry?.category === "persona");
  const isUnavailableDuringSync = (entry) => !!state.syncedManual && isUnsyncedOnly(entry);
  const activeEnhancements = window.LBT_getActiveEnhancements?.(state) || (state.enhancements || []).filter((entry) => !isUnavailableDuringSync(entry));
  const addEnh = (entry) => {
    if (isUnavailableDuringSync(entry)) {
      toast("未同期専用の強化は、同期化して編集した人格には追加できません", "assertive");
      return;
    }
    if ((state.enhancements || []).some((current) => current.name === entry.name)) {
      toast("既に追加済み");
      return;
    }
    /* 強化は購入。SET_FIELD で所持だけ増やすと、DB 価格と明細が
       通帳から抜け落ちる。追加・削除とも購入 reducer を通す。 */
    const afford = window.LBT_purchaseAffordability?.(state, { lp: 0, shards: Number(entry.shards) || 0 });
    if (afford && !afford.ok) {
      toast(afford.reason, "assertive");
      return;
    }
    dispatch({ type: "ADD_ENHANCEMENT", group: String(entry.group || ""), name: entry.name, effect: entry.effect || "", category: entry.category || "" });
    toast(`『${entry.name}』を追加`);
  };
  const removeEnh = (id) => dispatch({ type: "REMOVE_ENHANCEMENT", id });
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

/* 人格・スキル・パッシブ・強化・サポート・E.G.O・精神 を1画面にまとめるタブ定義。
   id は旧セクションIDのままにして、保存済み currentSection（skill 等）を
   移行なしで受ける。App.js の palette/レールのメタと同期させる。
   人格/サポート/E.G.O/精神 の4タブは roster（＝所持済み）だけを出す。 */
const BUILD_TABS = [
  { id: "persona", label: "人格", num: "01", title: "OWNED PERSONAS / 所持人格", subtitle: "所持の人格を装備", icon: "persona", owned: true },
  { id: "skill", label: "スキル", num: "02", title: "TACTICAL SKILLS", subtitle: "戦術スキル 0〜4 の編集", icon: "skill", owned: false },
  { id: "passive", label: "パッシブ", num: "03", title: "PASSIVE / 人格パッシブ", subtitle: "人格パッシブと固有効果", icon: "passive", owned: false },
  { id: "enh", label: "強化", num: "04", title: "ENHANCEMENTS", subtitle: "身体強化・特殊強化", icon: "enh", owned: false },
  { id: "support", label: "サポート", num: "05", title: "SUPPORT PASSIVES", subtitle: "所持サポートを装備枠へ", icon: "support", owned: true },
  { id: "ego", label: "E.G.O", num: "06", title: "E.G.O EQUIPMENT", subtitle: "所持E.G.Oをランク枠へ", icon: "ego", owned: true },
  { id: "spirit", label: "精神", num: "07", title: "SPIRIT", subtitle: "所持精神から1体選んで適用", icon: "spirit", owned: true },
  /* アイテムだけは人格を跨いで共有する。人格を替えても所持は消えず、
   「持っていく個数」と「MEMO/PALETTE へ出すか」だけをここで決める。
   タブ ID は rail の「アイテム」詳細画面（items）と衝突しないよう別にする。 */
  { id: "items-build", label: "アイテム", num: "08", title: "OWNED ITEMS / 所持アイテム", subtitle: "持っていく個数と出力先を選ぶ", icon: "item", owned: false }
];
if (typeof window !== "undefined") window.LBT_BUILD_TABS = BUILD_TABS;

/* 取得（所持化）の共通部品。

   urso 導出の軸は「取得.kind」。DB に価格のある種別（サポート/死亡後/アイテム/
   精神/強化）は DB 価格、価格が無いの人格・E.G.O は抽出/購入の core ルールで
   金額を出す。どちらでも明細は appendLedgerEntry が直近リザルトへ倒す（無ければ未分類）。 */
const ACQUIRE_KINDS = [
  /* 入手方法は抽出/購入の2種類（core:336）。 */
  { id: "persona", label: "人格", supports: true },
  { id: "ego", label: "E.G.O", supports: true },
  { id: "support", label: "サポート", supports: false },
  { id: "deathSupport", label: "死亡後", supports: false },
  { id: "spirit", label: "精神", supports: false },
  { id: "item", label: "アイテム", supports: false }
];

/* 価格ラベルは「数値 + 単位」をスペース区切りにした1書式（LP 7 / 欠片 50 / 無料）。
   コスト枠はこの書式の最長値で幅を固定するので、ここを通さない表記が
   混ざるとカードごとに列が乱れる。 */
function formatAcquireCost(lp, shards) {
  const parts = [];
  if (Number(lp) > 0) parts.push(`LP ${Number(lp)}`);
  if (Number(shards) > 0) parts.push(`欠片 ${Number(shards)}`);
  return parts.join(" ") || "無料";
}

function resolveAcquireCost(kind, how, context) {
  const db = window.LBT_provenance?.priceOf;
  /* E.G.O購入は各E.G.O番号横の欠片数を消費する（core:7536）。
     ここが人格と共通の入口なので、E.G.O購入も同じ関数から出す。 */
  /* 入手方法は2種類だけ（core:336/7532）。加えて卓配布の無料抽出チケット（local）を別枠で扱う。
     30LPはキャラ作成時の支給額であって人格の価格ではないので、ここでは扱わない。 */
  if (kind === "persona" || kind === "ego") {
    const provenance = how === "purchase" ? "purchase" : how === "ticket" ? "gachaTicket" : "gachaPaid";
    /* 価格は「E.G.O番号の横》记载値core:7536 なので、番号と危険度ランクで引く。
       番号が無いと該当行が見つからず 無料 に落ちる。ショップのカードは
       key が "RANK:no" 形式（例 "ZAYIN:1"）なので、そこから復元する。 */
    let ctx = context || {};
    if (kind === "ego" && ctx.no == null && ctx.id) {
      const pair = String(ctx.id).match(/^(.+):(\d+)$/);
      if (pair) ctx = { ...ctx, rank: pair[1], no: pair[2] };
    }
    const rule = window.LBT_acquireCost?.(kind, provenance, ctx);
    if (!rule || !(rule.lp || rule.shards)) return { lp: 0, shards: 0, label: "無料", source: rule?.source || "" };
    return { ...rule, label: formatAcquireCost(rule.lp, rule.shards) };
  }
  /* アイテム価格は公式・特殊資源・ユーザー定義を ID で解決し、state.js と同じ
     共通パーサーで表示する。LPと欠片の複合価格も表示と購入判定を一致させる。 */
  if (kind === "item") {
    const customItems = Array.isArray(context?.customItems) ? context.customItems : [];
    const definitions = [
      ...(window.DB?.items || []),
      ...(window.DB?.specialItems || []),
      ...customItems
    ];
    const hit = definitions.find((item) => (context?.id ? item?.id === context.id : item?.name === context?.name));
    const parsed = window.LBT_parsePriceText ? window.LBT_parsePriceText(hit?.price) : { lp: 0, shards: 0 };
    const lp = Number.isSafeInteger(parsed?.lp) && parsed.lp > 0 ? parsed.lp : 0;
    const shards = Number.isSafeInteger(parsed?.shards) && parsed.shards > 0 ? parsed.shards : 0;
    return { lp, shards, label: formatAcquireCost(lp, shards) };
  }
  const price = db ? db(context.name, kind, window.DB) : null;
  if (!price) return { lp: 0, shards: 0, label: "無料" };
  return { ...price, label: formatAcquireCost(price.lp, price.shards) };
}
/* PersonaCodex はこの関数を読む。露出しないと undefined のまま
   else 節の「無料」に落ち、全人格が無償で入手できてしまう。 */
if (typeof window !== "undefined") window.LBT_resolveAcquireCost = resolveAcquireCost;

const AcquireBar = ({ state, kind, name, no, rank, how, setHow, onAcquire, disabled, disabledReason }) => {
  const h = React.createElement;
  const spec = ACQUIRE_KINDS.find((k) => k.id === kind) || ACQUIRE_KINDS[0];
  /* state は呼び出し側（PersonaDetail の埋め込み表示など）によって無いことがある。
     ここで1段で吸収して、描画の主画面を白紙にしない。 */
  const ownsOne = (state?.roster?.personas || []).length > 0;
  /* E.G.O購入は番号とランクで DB を引く（core:7536）。名前だけだと一意に決まらない。 */
  const cost = resolveAcquireCost(kind, how, { name, no, rank, ownsPersona: ownsOne });
  return h("div", { className: "acquire-bar" },
    /* 抽出/購入の切替は幅を固定する。切り替えのたびに購入ボタンが横にずれると
       押し損なうので、方法欄には常に同じ横幅を持たせる。 */
    h("div", { className: "acquire-how" },
      spec.supports
        ? h("div", { className: "segmented", role: "radiogroup", "aria-label": `${spec.label}の取得方法` },
          /* 2択 + 卓配布の無料抽出チケット（local）。ルールブックは抽出/購入の2種類。 */
          [["purchase", "指定購入"], ["gacha", "ランダム"], ["ticket", "配布チケット"]].map(([value, label]) => h("button", { key: value, type: "button", role: "radio", "aria-checked": how === value, className: how === value ? "is-active" : "", onClick: () => setHow(value) }, label)))
        : h("span", { className: "acquire-how-placeholder", "aria-hidden": "true" })),
    h("span", { className: "acquire-cost" }, cost.label || "無料"),
    h(Button, { size: "sm", variant: "primary", icon: "plus", disabled, onClick: onAcquire, title: disabledReason || undefined },
      how === "gacha" ? "抽出する" : how === "ticket" ? "チケットを使う" : "購入")
  );
};

/* ビルドのアイテムタブ。アイテムだけは人格を跨いで共有し、
   「持っていく個数」と「MEMO/PALETTE へ出すか」だけここで決める。
   数量・出力切替は ItemCodex と同じ PATCH_ITEM / REMOVE_ITEM を通す。 */
const BuildItemsPanel = ({ state, dispatch }) => {
  const h = React.createElement;
  const inventory = Array.isArray(state.inventory) ? state.inventory : [];
  const catalog = React.useMemo(() => [
    ...(window.DB?.items || []),
    ...(window.DB?.specialItems || []).filter((item) => !item.ledgerResource),
    ...(Array.isArray(state.customItems) ? state.customItems : [])
  ], [state.customItems]);
  const metaOf = (itemId) => catalog.find((item) => item.id === itemId) || {};
  const nameOf = (itemId) => metaOf(itemId).name || String(itemId || "");
  const totalQty = inventory.reduce((sum, entry) => sum + (Number(entry.quantity) || 0), 0);
  const memoCount = inventory.filter((entry) => entry.memo !== false).length;
  const paletteCount = inventory.filter((entry) => entry.palette !== false).length;
  const maxOwnedOf = (itemId) => window.LBT_getItemMaxOwned?.(state, itemId) || 99;
  const rows = [...inventory].sort((a, b) => nameOf(a.itemId).localeCompare(nameOf(b.itemId), "ja"));
  const [pickerOpen, setPickerOpen] = React.useState(false);

  const patch = (uid, patchBody) => dispatch({ type: "PATCH_ITEM", uid, patch: patchBody });
  const addItem = (item) => {
    const owned = inventory.find((entry) => entry.itemId === item.id);
    const maxOwned = maxOwnedOf(item.id);
    if (owned && (Number(owned.quantity) || 0) >= maxOwned) {
      toast(`「${item.name}」は所持上限（×${maxOwned}）です`);
      return;
    }
    const ledgerLinked = item.ledgerResource === "shards";
    dispatch(item.specialResource && !ledgerLinked
      ? { type: "ADD_ITEM_INVENTORY", itemId: item.id }
      : { type: "ADD_ITEM", itemId: item.id });
    toast(ledgerLinked
      ? `「${item.name}」を1個購入し、通帳へ記録`
      : item.specialResource
        ? (owned ? `「${item.name}」の所持数を追加` : `「${item.name}」を特殊資源欄へ追加`)
        : (owned ? `「${item.name}」の数量を追加` : `「${item.name}」を所持アイテムに追加`));
  };

  return h("div", { className: "build-items" },
    h(Card, null,
      h("div", { className: "card-header owned-library-bar" },
        h("span", { className: "t-label" }, "卓へ持ち込むアイテム"),
        h("span", { className: "ledger-note" }, `${inventory.length}種 / ${totalQty}個　MEMO ${memoCount} / PALETTE ${paletteCount}`),
        h(Button, { size: "sm", variant: pickerOpen ? "secondary" : "ghost", icon: "plus", onClick: () => setPickerOpen((v) => !v) }, pickerOpen ? "選択を閉じる" : "卓へ持ち込み"),
        h(Button, { size: "sm", variant: "ghost", onClick: () => dispatch({ type: "SET_UI", ui: { currentSection: "items-build" } }) }, "所持アイテム欄を開く")
      ),
      pickerOpen && h("div", { className: "card-body stack-2" },
        h("div", { className: "inv-pick" }, [...new Set(catalog.map((item) => String(item?.category || "その他")))].map((category) => h("div", { key: category, className: "inv-pick-group" },
          h("span", { className: "t-label" }, category),
          h("div", { className: "inv-pick-list" }, catalog.filter((item) => String(item?.category || "その他") === category).map((item) => {
            const owned = inventory.find((entry) => entry.itemId === item.id);
            const maxOwned = maxOwnedOf(item.id);
            const atCap = owned && (Number(owned.quantity) || 0) >= maxOwned;
            return h("button", { key: item.id, type: "button", className: "inv-pick-item inv-pick-button", disabled: atCap, onClick: () => addItem(item) },
              h("span", null, item.name),
              owned ? h("small", { className: "inv-pick-qty" }, `×${owned.quantity}${maxOwned < 99 ? ` / ${maxOwned}` : ""}`) : null
            );
          }))
        )))
      ),
      h("div", { className: "card-body stack-2" },
        rows.length === 0
          ? h("div", { className: "empty" }, "まだアイテムを持っていません。ショップで購入するか「卓へ持ち込み」で選びます。")
          : h("div", { className: "stack-2" }, rows.map((entry) => {
            const maxOwned = maxOwnedOf(entry.itemId);
            const hasCap = maxOwned < 99;
            return h("div", { key: entry.uid, className: "build-item-row" },
              h("div", { className: "inv-row" },
                h("span", { className: "inv-name" }, nameOf(entry.itemId)),
                h("span", { className: "inv-meta" }, String(metaOf(entry.itemId).category || "その他")),
                h("span", { className: "inv-price" }, String(metaOf(entry.itemId).price || "")),
                h("span", { className: "inv-qty" }, `×${entry.quantity}`),
                entry.origin === "initial"
                  ? h("span", { className: "badge inv-origin is-initial" }, "初期枠")
                  : metaOf(entry.itemId).specialResource
                    ? h("span", { className: "badge inv-origin" }, "資源")
                    : h("span", { className: "badge inv-origin" }, "購入")
              ),
              h("div", { className: "build-item-controls" },
                h("div", { className: "build-item-qty" },
                  h("span", { className: "t-label" }, hasCap ? `卓へ持っていく個数 / 上限×${maxOwned}` : "卓へ持っていく個数"),
                  h("button", { type: "button", onClick: () => patch(entry.uid, { quantity: Math.max(1, (Number(entry.quantity) || 1) - 1) }), "aria-label": `${nameOf(entry.itemId)}の所持数を減らす` }, h(Icon, { name: "minus", size: 13 })),
                  h("input", { type: "number", min: 1, max: maxOwned, step: 1, inputMode: "numeric", value: entry.quantity, onChange: (event) => patch(entry.uid, { quantity: event.target.value }), "aria-label": `${nameOf(entry.itemId)}の所持数を入力` }),
                  h("button", { type: "button", disabled: (Number(entry.quantity) || 1) >= maxOwned, onClick: () => patch(entry.uid, { quantity: Math.min(maxOwned, (Number(entry.quantity) || 1) + 1) }), "aria-label": `${nameOf(entry.itemId)}の所持数を増やす` }, h(Icon, { name: "plus", size: 13 }))
                ),
                h("label", { className: "item-output-toggle" }, h("input", { type: "checkbox", checked: entry.memo !== false, onChange: (event) => patch(entry.uid, { memo: event.target.checked }) }), h("span", null, "MEMOに表示")),
                h("label", { className: "item-output-toggle" }, h("input", { type: "checkbox", checked: entry.palette !== false, onChange: (event) => patch(entry.uid, { palette: event.target.checked }) }), h("span", null, "PALETTEへ反映")),
                h(Button, { size: "sm", variant: "danger", icon: "trash", onClick: () => { dispatch({ type: "REMOVE_ITEM", uid: entry.uid }); toast(`「${nameOf(entry.itemId)}」を所持から外しました`); } }, "卓から外す")
              )
            );
          }))
      )
    )
  );
};

/* ショップ。所持の唯一の取得口。
   既定は「未所持のみ」。カード1枚で所持化＝購入でき、金額は自動計算して
   直近リザルトへ記録する（リザルト未登録なら未分類＝待機項目）。 */
/* 抽選結果の1行表示。種別の記号はここで閉じる。 */
/* 抽出手数は利用者が数字で直接入れる（1〜99）。 */
const hitLabel = (hit) => (hit.type === "ego"
  ? `E.G.O ${hit.rank} No.${hit.no}`
  : hit.type === "themePack"
    ? `特定抽出パック【${hit.pack}】 No.${hit.no}`
    : `${hit.mode === "t" ? "特異人格" : "人格"} No.${hit.no}`);

/* ショップ「ガチャ」タブ。抽出全般を1つの場所にまとめる。
   core P19-20（人格）/ P203（特異人格）/ P242（E.G.O）/ 特定抽出パック P.7-18。
   ルートごとに「通貨で払うか、対応するチケットを使うか」を選ぶ。
   どちらの経路でも所得は直近のリザルトに帰属する（明細を立てる）。 */
const GachaTicketsPanel = ({ state, dispatch }) => {
  const h = React.createElement;
  const stateRef = React.useRef(state);
  stateRef.current = state;
  const G = window.LBT_gachaDraw;
  const [route, setRoute] = React.useState("persona");
  const [pay, setPay] = React.useState("paid");
  const [ticketPreference, setTicketPreference] = React.useState("specific");
  const [packName, setPackName] = React.useState("");
  const [last, setLast] = React.useState(null);
  const [times, setTimes] = React.useState(1);
  const ROUTES = G?.ROUTES || [];
  const packs = G?.themePacks?.() || [];
  const activePack = packName || packs[0]?.name || "";
  const specificTicketKind = G?.ticketKindFor ? G.ticketKindFor(route) : "persona";
  const ticketPack = route === "pack" ? activePack : null;
  const ticketBalanceAll = window.LBT_computeTicketBalance
    ? window.LBT_computeTicketBalance(state.results || [], state.entries || [])
    : { persona: 0, ego: 0, choice: 0, pack: {} };
  const specificTicketHeld = route === "pack"
    ? (Number(ticketBalanceAll.pack?.[ticketPack]) || 0)
    : (Number(ticketBalanceAll[specificTicketKind]) || 0);
  const choiceTicketHeld = route === "pack" ? 0 : (Number(ticketBalanceAll.choice) || 0);
  const ticketKind = route === "pack"
    ? "pack"
    : (ticketPreference === "choice" && choiceTicketHeld > 0) || (specificTicketHeld <= 0 && choiceTicketHeld > 0)
      ? "choice"
      : specificTicketKind;
  const held = ticketKind === "pack"
    ? (Number(ticketBalanceAll.pack?.[ticketPack]) || 0)
    : (Number(ticketBalanceAll[ticketKind]) || 0);
  const poolSize = route === "pack"
    ? (G?.buildPackPool?.(activePack, state).length || 0)
    : (G?.buildPool?.(route, state)?.length || 0);
  const cost = pay === "ticket" ? { lp: 0, shards: 0, label: "無料" } : (G?.paidCost?.(route, state, activePack) || {});
  const labels = window.LBT_TICKET_KIND_LABEL || {};

  /* 通貨で払うとき、回数ぶんの合計残高でできるかを判定する。
     1回分だけを見ると「3回押したけど2回目で余额が尽きる」を防げない。
     合計は抽出手順そのものと同じ式で出す（engine の逐次計算）。
     ここで式を別にすると、見える金額と実際に引く金額がずれる。 */
  const ownsAnyPersona = ((state.roster || {}).personas || []).length > 0;
  const perDraw = pay === "ticket" ? { lp: 0, shards: 0 } : (G?.paidCost?.(route, state, activePack) || { lp: 0, shards: 0 });
  /* 人格抽出の1回目は未所持なら無料（core:338）。2回目以降は同額。 */
  /* UI表示用の合計額もエンジンの逐次価格関数へ寄せる。
     未所持の人格抽出は1回目だけ無料、同じバッチの2回目以降は有料。 */
  const totalCost = pay === "ticket"
    ? { lp: 0, shards: 0 }
    : (G?.estimateTotalCost?.(route, state, activePack, times)
      || { lp: (Number(perDraw.lp) || 0) * times, shards: (Number(perDraw.shards) || 0) * times });
  const balance = window.LBT_computeLedgerBalance?.(state.results || [], state.entries || []);
  const costParts = [];
  if (totalCost.lp) costParts.push(`LP ${totalCost.lp}`);
  if (totalCost.shards) costParts.push(`欠片 ${totalCost.shards}`);
  const totalCostLabel = costParts.length ? costParts.join(" / ") : "無料";
  const ticketShort = pay === "ticket" && held < times;
  const shortfall = pay === "paid" && balance
    ? (G?.paymentShortfall?.(balance, totalCost) || {
        lpShort: totalCost.lp > 0 && Number(balance.lp) < totalCost.lp,
        shardsShort: totalCost.shards > 0 && Number(balance.shards) < totalCost.shards,
        insufficient: (totalCost.lp > 0 && Number(balance.lp) < totalCost.lp)
          || (totalCost.shards > 0 && Number(balance.shards) < totalCost.shards)
      })
    : { lpShort: false, shardsShort: false, insufficient: false };
  const currencyShort = pay === "paid" && !!balance && shortfall.insufficient;
  const blockedReason = poolSize <= 0
    ? "抽選できる対象がありません"
    : pay === "ticket"
      ? (held <= 0 ? "対応するチケットを持っていません" : ticketShort ? `チケットが足りません（必要 ${times}枚 / 所持 ${held}枚）` : "")
      : currencyShort
        ? `残高が不足しています（${shortfall.lpShort ? `LP ${balance.lp} / 必要 ${totalCost.lp}` : ""}${shortfall.lpShort && shortfall.shardsShort ? " / " : ""}${shortfall.shardsShort ? `欠片 ${balance.shards} / 必要 ${totalCost.shards}` : ""}）`
        : "";

  /* --- 抽選は「確認 → 確定」の2段構え ---------------------------------
     1段目で結果を決める。種は暗号学的乱数から作り、状態（所持・対象一覧・
     アカウント）には一切依存させない。よって確認ダイアログを操作している
     間にセーブデータが変わっても、対象が変わっても、出目は変わらない。
     2段目でそれを適用する。__noHistory を付けてUndo/Redoの履歴に載せない。 */

  /* 出目の種は暗号学的乱数からのみ作る。弱い種にフォールバックすると、
     抽選結果の予測困難性を保証できないため、利用できない環境では抽選を開始しない。 */
  const drawSeed = () => {
    const buf = new Uint32Array(4);
    const c = typeof window !== "undefined" ? (window.crypto || window.msCrypto) : null;
    if (!c || typeof c.getRandomValues !== "function") return null;
    try {
      c.getRandomValues(buf);
    } catch (_) {
      return null;
    }
    return Array.from(buf).map((n) => n.toString(16).padStart(8, "0")).join("");
  };

  /* 対象一覧を「その場で」確定する。プール搭建時に
     所持状態を読むので、呼び出した時点の顔がそのまま結果になる。 */
  const drawWithSeed = (seed) =>
    G?.drawN(route, state, { pay, pack: activePack, ticketKind, times, seed });

  const [pending, setPending] = React.useState(null);

  const requestDraw = () => {
    if (blockedReason) { toast(blockedReason); return; }
    /* ここで一度だけ出目を決める。以後は何をしても変わらない。 */
    const seed = drawSeed();
    if (!seed) {
      toast("暗号学的に安全な乱数源を利用できないため、抽選を開始できません。HTTPSまたはlocalhostで開き、ページを再読み込みしてください。");
      return;
    }
    const out = drawWithSeed(seed);
    if (!out || !out.hits || !out.hits.length) {
      const why = out?.reason === "no-ticket" ? "対応するチケットを持っていません" : "抽選できる対象がありません";
      toast(why);
      return;
    }
    setPending({ seed, out, request: { route, pay, pack: activePack, ticketKind, times } });
  };

  /* やめるのは「まだ何も記録していない」状態だけ（出目を見てから選び直す、
     というのは別の抜け道）。文言でそう伝える：
     利用者が「引いた結果を取り消した」と誤解しないこと。 */
  const cancelDraw = () => {
    if (committingRef.current) return; /* 確定処理中は取り消せない（記録が宙に浮く） */
    setPending(null);
    toast("まだ引いていません。記録は残していません。");
  };

  /* 確定処理はビーコン取得と署名で非同期になる。連打で二重に記録しない
     よう施錠する。 */
  const committingRef = React.useRef(false);

  /* 直近の drand ラウンドを外部錨として取る。取れなければ null を返し、
     未検証のまま記録する（記録しないより正直に残す方がよい）。確定操作の
     手触りを壊さないよう 2 秒で見切る。 */
  const fetchBeaconForDraw = async () => {
    if (!G?.fetchBeacon || !G?.beaconRoundAt) return null;
    try {
      const round = G.beaconRoundAt(Math.floor(Date.now() / 1000));
      const beacon = await Promise.race([
        G.fetchBeacon({ round }),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 2000))
      ]);
      return beacon || null;
    } catch (e) {
      return null;
    }
  };

  const commitDraw = () => {
    if (!pending || committingRef.current) return;
    committingRef.current = true;
    commitDrawAsync()
      .catch((error) => {
        console.error("gacha: 確定処理に失敗", error);
        toast("確定処理で問題が起きました。画面を再読み込みして記録を確認してください。");
      })
      .finally(() => { committingRef.current = false; });
  };

  const commitDrawAsync = async () => {
    if (!pending) return;
    const { seed, out } = pending;
    const request = pending.request || { route, pay, pack: activePack, ticketKind, times };
    const hits = out.hits;
    /* 結果をハッシュ鎖で封緘し、抽出リストへ積む。
       所持への反映もこの action の中で行うので、画面が数えた顔ではなく
       「封緘された顔」が入る。2つに分けると片方だけ後から狂う。

       __sealed は必須。Undoで巻き戻した時の復元は wrappedDispatch が
       この action を打ち直して行う。seal を付けないと、確定済みの抽出が
       Ctrl+Z 1回で丸ごと消え、支払いも戻って「引いたのに引いた形跡が
       ない」状態になる。証明できない記録は、記録しないのと同じ。 */
    /* 外部錨（drand）と署名は封緘の前後で一度だけ載せる。錨を後から足すと
       署名対象が変わり、署名が「足す前の顔」を指して食い違う。 */
    const beacon = await fetchBeaconForDraw();
    let batch = G?.sealBatch ? G.sealBatch(out, { beacon }) : null;
    if (batch && window.LBT_gachaIdentity) {
      try {
        const identity = await window.LBT_gachaIdentity.ensureIdentity();
        batch = await window.LBT_gachaIdentity.signBatch(batch, identity);
      } catch (e) {
        /* 署名できない環境（WebCrypto なし等）でも封緘までは残す。 */
      }
    }
    if (!batch) {
      // 所持・残高を変えたのに抽選証明だけが欠落する状態は受け入れない。
      // アセット不整合や検証器不在なら確定を中止し、利用者に再読込を促す。
      setPending(null);
      toast("抽選証明を作成できなかったため、今回は確定していません。所持・残高は変更していません。ページを再読み込みしてもう一度お試しください。");
      return;
    }
    const ticketSpend = out.paidBy === "ticket"
      ? { kind: out.ticketKind, pack: out.ticketPack, count: hits.length }
      : null;
    const paidCost = ticketSpend ? null : {
      lp: Number(out.cost.lp) || 0,
      shards: Number(out.cost.shards) || 0
    };
    /* 確定直前の状態から最新リザルトを一度だけ解決する。
       省略時の暗黙フォールバックに任せると、抽出記録と取得オブジェクトの帰属が
       別経路になり、片方だけ未分類になる回帰を起こしやすい。
       リザルトが無い場合は null（未分類）を明示する。 */
    const currentState = stateRef.current || state;
    const resultId = window.LBT_latestResultId?.(currentState) || null;
    const drawLogEntry = {
      id: out.commit || `draw-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      at: new Date().toISOString(),
      route: request.route,
      times: request.times,
      pay: out.paidBy,
      cost: { lp: out.cost.lp || 0, shards: out.cost.shards || 0 },
      hits: hits.map((hit) => ({ name: hit.name, type: hit.type, no: hit.no, rank: hit.rank, mode: hit.mode, pack: hit.pack, branch: hit.branch })),
      commit: out.commit || null,
      resultId
    };

    /* 取得オブジェクトの明細・チケット消費・抽選ログで同じ帰属先を使う。 */
    const transaction = { type: "APPLY_DRAW_BATCH", batch, ticketSpend, cost: paidCost, resultId };
    const validation = window.LBT_validateDrawBatchApplication?.(currentState, transaction);
    if (!validation?.ok) {
      setPending(null);
      if (validation?.reason === "insufficient-tickets") {
        toast("確定前にチケット残数が変わったため、抽選を取り消しました。残数を確認してもう一度引いてください。");
      } else if (validation?.reason === "insufficient-currency") {
        toast("確定前にLP／欠片の残高が変わったため、抽選を取り消しました。残高を確認してもう一度引いてください。");
      } else if (validation?.reason === "duplicate-batch") {
        toast("この抽選記録は既に登録されています。重複登録を防ぐため確定を取り消しました。");
      } else {
        toast("抽選の確定前検証に失敗しました。状態を確認してもう一度お試しください。");
      }
      return;
    }
    dispatch(transaction);
    dispatch({ type: "ADD_DRAW_RECORD", __sealed: true, batch, entry: drawLogEntry });
    setLast({ hits, paidBy: out.paidBy, cost: out.cost, commit: out.commit || null, drawn: hits.length, requested: out.requested || hits.length, stopped: out.stopped || "complete" });
    setPending(null);
    const branched = hits.filter((x) => x.branch === "special").length;
    const note = branched ? `（うち特異人格チャンス ${branched}）` : "";
    const short = stopNote(out);
    toast(`${hits.length}枚を抽出しました${note}（${out.paidBy === "ticket" ? ticketLabel(out.ticketKind || ticketKind, out.ticketPack || ticketPack) : out.cost.label}）${short ? ` ${short}` : ""}`);
  };

  /* 途中で止まったときだけ、その理由と残りを書く。
     足りなかったのに「引けた分だけ」としか言わないと、
     残った回数がどこへ消えたのか利用者に分からない。 */
  const stopNote = (out) => {
    const requested = Number(out.requested) || 0;
    const drawn = Number(out.drawn ?? out.hits?.length) || 0;
    if (!requested || drawn >= requested) return "";
    const left = requested - drawn;
    if (out.stopped === "insufficientLP") return `残りの${left}回はLPが足りず引けませんでした。`;
    if (out.stopped === "insufficientShards") return `残りの${left}回は自我の欠片が足りず引けませんでした。`;
    if (out.stopped === "insufficientTickets") return `残りの${left}回はチケットが足りませんでした。`;
    if (out.stopped === "poolExhausted") return `残りの${left}回は未所持がなくなったら止まりました。`;
    return `残りの${left}回は引けませんでした。`;
  };

  const ticketLabel = (kind, pack) => (window.LBT_ticketLabel ? window.LBT_ticketLabel(kind, pack) : (labels[kind] || "チケット"));
  /* Ticket stock, derived from result income minus entries. Tickets arrive as table rewards. */
  const ticketBalance = window.LBT_computeTicketBalance
    ? window.LBT_computeTicketBalance(state.results || [], state.entries || [])
    : { persona: 0, ego: 0, choice: 0, pack: {} };
  const heldTickets = [
    ...["persona", "ego", "choice"]
      .filter((kind) => Number(ticketBalance[kind]) > 0)
      .map((kind) => ({ kind, pack: null, count: Number(ticketBalance[kind]) })),
    ...Object.entries(ticketBalance.pack || {})
      .filter(([, n]) => Number(n) > 0)
      .map(([pack, count]) => ({ kind: "pack", pack, count: Number(count) }))
  ].map((t) => ({ ...t, label: ticketLabel(t.kind, t.pack) }));

  return h("div", { className: "gacha-tickets-panel stack-3" },
    h("p", { className: "ledger-note" },
      "抽出全般。ルートごとに通貨で払うか抽出チケットを使うかを選べます。所得は直近のリザルトに帰属します。"),
    heldTickets.length > 0 && h("div", { className: "gacha-held-tickets" },
      h("span", { className: "t-label" }, "所持の抽出チケット"),
      heldTickets.map((t) => h("span", { key: `${t.kind}:${t.pack || ""}`, className: "gacha-held-ticket" },
        `${t.label} ×${Number(t.count) || 0}`))),
    h("div", { className: "segmented", role: "radiogroup", "aria-label": "抽出の方法" },
      ROUTES.map((r) => h("button", {
        key: r.id, type: "button", role: "radio", "aria-checked": route === r.id,
        className: route === r.id ? "is-active" : "", disabled: !!pending,
        onClick: () => { setRoute(r.id); setLast(null); }
      }, r.label))),
    /* 出所（core:346-349 など）は利用者には無意味なので出さない。
       規則番号はコードと provenance に残せば足りる。
       画面で意味を持つのは「対象が何件か」だけ。 */
    h("div", { className: "ledger-note" }, `候補 ${poolSize} 件`),
    route === "pack" && h("label", { className: "ledger-note" },
      h("span", null, "パック　"),
      h("select", {
        className: "select", value: activePack, "aria-label": "特定抽出パック", disabled: !!pending,
        onChange: (e) => { setPackName(e.target.value); setLast(null); }
      }, packs.map((p) => h("option", { key: p.name, value: p.name }, `${p.name}（1d${p.die}・LP ${p.lp}）`)))),
    h("div", { className: "segmented", role: "radiogroup", "aria-label": "支払い方法" },
      [["paid", "通貨で払う"], ["ticket", `${ticketLabel(ticketKind, ticketPack)} ×${held}`]].map(([v, label]) => h("button", {
        key: v, type: "button", role: "radio", "aria-checked": pay === v,
        className: pay === v ? "is-active" : "", disabled: !!pending,
        onClick: () => { setPay(v); setLast(null); }
      }, label))),
    pay === "ticket" && route !== "pack" && choiceTicketHeld > 0 && specificTicketHeld > 0 &&
      h("div", { className: "segmented", role: "radiogroup", "aria-label": "使用する抽出チケット" },
        h("button", {
          type: "button", role: "radio", "aria-checked": ticketKind === specificTicketKind,
          className: ticketKind === specificTicketKind ? "is-active" : "", disabled: !!pending,
          onClick: () => { setTicketPreference("specific"); setLast(null); }
        }, `${ticketLabel(specificTicketKind, null)} ×${specificTicketHeld}`),
        h("button", {
          type: "button", role: "radio", "aria-checked": ticketKind === "choice",
          className: ticketKind === "choice" ? "is-active" : "", disabled: !!pending,
          onClick: () => { setTicketPreference("choice"); setLast(null); }
        }, `${ticketLabel("choice", null)} ×${choiceTicketHeld}`)),
    /* 回数は抽選ボタンと同じ行に置く。数は自分で入れる。
       ±1/＋1/＋5 を置く意味が薄かった（任意の数字が直接入れられるため）。 */
    h("div", { className: "gacha-draw-row" },
      h("label", { className: "gacha-times-field" },
        h("span", { className: "ledger-note" }, "回数"),
        h("input", {
          className: "input ledger-input gacha-times-input",
          type: "number",
          min: 1,
          max: 99,
          step: 1,
          inputMode: "numeric",
          value: String(times),
          "aria-label": "抽出手数", disabled: !!pending,
          onChange: (e) => { setTimes(Math.min(99, Math.max(1, Number.parseInt(e.target.value, 10) || 1))); setLast(null); }
        })),
      h("span", { className: "ledger-note" }, pay === "ticket"
        ? `${ticketLabel(ticketKind, ticketPack)} ×${held}（1回あたり1枚）`
        : totalCostLabel),
      h(Button, {
        size: "sm", variant: "primary", onClick: requestDraw, disabled: !!blockedReason || !!pending, title: blockedReason || undefined
      }, times > 1 ? `${times}回抽選` : "抽選する")),
    h("p", { className: "ledger-note" },
      "抽選結果はこの瞬間に決まります。確定後は取り消せません。"),
    blockedReason && h("p", { className: "ledger-note", role: "status" }, blockedReason),
    /* 確認。申込時点で出目は固定し、確認中は抽出条件をロックする。
       条件を変えたい場合は、出目を見せないまま pending を破棄してから変更する。
       出目を先に見せてから「取り消す」を置くと、見る → 嫌だ → 引いたことに
       しない、という抜け道ができる。出目が出るのは確定のあとだけ。
       「まだ引かない」は何も起きていない状態をやめる操作なので、損得がない。 */
    pending && h("div", { className: "gacha-confirm", role: "group", "aria-label": "抽選の確認" },
      h("span", { className: "t-label" }, `この内容で ${pending.out.hits.length} 件を記録します`),
      h("div", { className: "gacha-confirm-cost ledger-note" },
        pending.out.paidBy === "ticket"
          ? `${ticketLabel(pending.out.ticketKind || ticketKind, pending.out.ticketPack || ticketPack)} を ${pending.out.hits.length} 枚使います`
          : `支払い ${pending.out.cost?.label || "無料"}`),
      /* 途中で止まる場合は、確定前に理由を書く。トーストは消えるので、
         「引けなかった分」はここに書いて残す。 */
      (() => { const note = stopNote(pending.out); return note ? h("div", { className: "gacha-confirm-cost ledger-note" }, note) : null; })(),
      h("p", { className: "ledger-note" },
        "確認中は抽出方法・パック・支払い方法・回数を固定しています。変更する場合は「まだ引かない」で戻ってください。結果は「確定する」を押した後に表示されます。"),
      h("div", { className: "shop-toolbar-main" },
        h(Button, { size: "sm", variant: "secondary", onClick: cancelDraw }, "まだ引かない"),
        h(Button, { size: "sm", variant: "primary", onClick: commitDraw }, "確定する"))),

    last && h("div", { className: `gacha-ticket-result${last.hits.some((x) => x.branch === "special") ? " is-branch" : ""}` },
      last.hits.some((x) => x.branch === "special") && h("span", { className: "gacha-branch-badge" }, "特異人格チャンス"),
      h("span", { className: "t-label" }, `抽選結果（${last.hits.length}件）`),
      h("div", { className: "gacha-result-list" },
        last.hits.map((hit, i) => h("div", { key: `${hitLabel(hit)}-${i}`, className: "gacha-result-row" },
          h("strong", null, hit.name),
          h("span", { className: "ledger-note" }, `${hitLabel(hit)}${hit.branch === "special" ? "（特異人格チャンス）" : ""}`)))),
      h("span", { className: "ledger-note" }, `${last.paidBy === "ticket" ? "チケット使用" : last.cost?.label || "無料"}`),
      stopNote(last) ? h("span", { className: "ledger-note" }, stopNote(last)) : null,
      h("p", { className: "ledger-note" }, "この記録は「記録 > 抽出リスト」にハッシュ鎖つきで残ります。Undo（元に戻す）でも消えません。")
    ));
  };
const ShopSection = ({ state, dispatch }) => {
  const h = React.createElement;
  const hasExplicitSpiritPrice = window.LBT_hasExplicitSpiritPrice || ((definition) => {
    if (!definition || !definition.name) return false;
    const price = definition.price;
    const numeric = (typeof price === "number" && Number.isFinite(price))
      || (typeof price === "string" && price.trim() !== "" && Number.isFinite(Number(price)));
    return numeric && Number(price) >= 0;
  });
  const isExplicitlyFreeSpirit = window.LBT_isExplicitlyFreeSpirit
    || ((definition) => hasExplicitSpiritPrice(definition) && Number(definition.price) === 0);
  const tab = state.ui?.shopTab || "support";
  const setTab = (id) => dispatch({ type: "SET_UI", ui: { shopTab: id } });
  const [unownedOnly, setUnownedOnly] = React.useState(true);
  const [how, setHow] = React.useState("purchase");
  /* 検索窓はビルド側と同じ構成（検索 → 件数 → 種別フィルタ）を共有する。 */
  const [query, setQuery] = React.useState("");
  const [rankFilter, setRankFilter] = React.useState("");
  /* E.G.O の資源絞り込み。ビルド側と同じ語彙・同じ判定を使う。 */
  const [requiredResources, setRequiredResources] = React.useState([]);
  const [excludedResources, setExcludedResources] = React.useState([]);
  const [keywordFilter, setKeywordFilter] = React.useState("");
  const [categoryFilter, setCategoryFilter] = React.useState("all");
  const [sinFilter, setSinFilter] = React.useState("");
  const [sourceFilter, setSourceFilter] = React.useState("all");
  /* ショップは1タブ最大300枚超のカードになる。初期は48枚だけ組み、
     末尾付近までスクロールしたら48枚ずつ足す（切替と検索入力のJSを枚数ぶん軽くする）。 */
  const [visibleCount, setVisibleCount] = React.useState(48);
  const lastGrowHeightRef = React.useRef(0);

  const inventory = Array.isArray(state.inventory) ? state.inventory : [];
  const ownedSupportNames = React.useMemo(() => new Set((state.roster?.supports || []).map((s) => s.name)), [state.roster?.supports]);
  const ownedPersonaKeys = React.useMemo(() => new Set((state.roster?.personas || []).map((p) => `${p.mode}:${p.no}`)), [state.roster?.personas]);
  const ownedEgoKeys = React.useMemo(() => new Set((state.roster?.egos || []).map((e) => `${e.rank}:${e.no}`)), [state.roster?.egos]);
  const ownedItemIds = React.useMemo(() => new Set(inventory.map((entry) => entry.itemId)), [inventory]);
  const ownedSpiritNames = React.useMemo(() => new Set((state.roster?.spirits || []).map((s) => s.name)), [state.roster?.spirits]);
  const catalogItems = React.useMemo(() => [
    ...(window.DB?.items || []),
    /* 通帳連動の自我の欠片だけでなく、硝子の破片などの特殊資源もショップに表示する。 */
    ...(window.DB?.specialItems || []),
    ...(Array.isArray(state.customItems) ? state.customItems : [])
  ], [state.customItems]);
  const hasConfiguredPrice = (item) => {
    const cost = window.LBT_parsePriceText?.(item?.price) || { lp: 0, shards: 0 };
    return Number(cost.lp) > 0 || Number(cost.shards) > 0;
  };
  /* 価格付きアイテムは消耗品として繰り返し購入できる。通帳連動資源は在庫ではなく残高を使う。 */
  const canRepurchaseItem = (item) => item?.ledgerResource !== "shards" && hasConfiguredPrice(item);
  const itemCategories = React.useMemo(() => [...new Set(catalogItems.map((item) => String(item?.category || "その他")))], [catalogItems]);

  const maxOwnedOf = (itemId) => window.LBT_getItemMaxOwned?.(state, itemId) || 99;
  const atCap = (item) => {
    const owned = inventory.find((entry) => entry.itemId === item.id);
    return owned && (Number(owned.quantity) || 0) >= maxOwnedOf(item.id);
  };
  const q = query.trim().toLowerCase();
  const hit = (text) => !q || String(text || "").toLowerCase().includes(q);

/* ショップのカード本文を、ビルド側と同じ行構造で組む。
   ビルドは「条件」「効果」のラベルで役割を示し、条件は色付きチップで区別する。
   ここでは同じ構造をそのまま使う（別の表現にすると、同じ情報でも読み方が割れる）。 */
const shopCardLines = (kind, entry) => {
  if (!entry) return [];
  const line = (tag, body, tone) => h("div", { className: "spirit-item-line" },
    h("span", { className: "spirit-item-tag", "data-tag": tone || "morale" }, tag),
    h("span", null, body));
  if (kind === "persona") {
    return [
      entry.hp != null || entry.san != null ? line("HP / SAN", `${entry.hp ?? "—"} / ${entry.san ?? "—"}`, "always") : null,
      entry.speed ? line("速度", entry.speed, "morale") : null,
      entry.passive_name ? line("パッシブ", entry.passive_name, "always") : null,
      (entry.keywords || []).length ? line("特徴", entry.keywords.slice(0, 5).join(" / "), "always") : null
    ].filter(Boolean);
  }
  if (kind === "support" || kind === "deathSupport") {
    return [
      entry.cond ? line("条件", h(CondChips, { cond: entry.cond }), "always") : null,
      entry.effect ? line("効果", entry.effect, kind === "deathSupport" ? "confuse" : "morale") : null
    ].filter(Boolean);
  }
  if (kind === "spirit") {
    return [
      entry.always_effect ? line("効果", entry.always_effect, "always") : null,
      entry.morale_effect && entry.morale_effect !== "なし" ? line("士気", entry.morale_effect, "morale") : null,
      entry.confuse_effect && entry.confuse_effect !== "なし" ? line("混乱", entry.confuse_effect, "confuse") : null
    ].filter(Boolean);
  }
  if (kind === "ego") {
    return [
      entry.passive_name ? line("パッシブ", entry.passive_name, "always") : null,
      entry.passive_effect ? line("効果", entry.passive_effect, "morale") : null
    ].filter(Boolean);
  }
  return entry.effect ? [line("効果", entry.effect, "always")] : [];
};

/* 全カテゴリ共通のカード構造。識別 → 条件 → 操作 の3層で走査速度を揃える。
   所有は識別行に載せる（種別バッジと同じ階層＝跨界しない属性）。 */
const card = (key, name, badge, kind, onAcquire, disabled, reason, lines, owned, headExtra, body, costText, topRow, actionLabel) => {
  /* アイテムは同名の公式・自作が共存できるので、価格は名前ではなく
     key（= item.id）で引く。state.js priceItemById と同じ参照。 */
  const price = resolveAcquireCost(kind, "purchase", { name, id: key, customItems: state.customItems, ownsPersona: (state.roster?.personas || []).length > 0 });
  /* 残高が足りなければ購入しない。ただし黙って無効化するのではなく、
     押した瞬間に理由を伝える（購入の可否は利用者が判断する）。 */
  const afford = window.LBT_purchaseAffordability
    ? window.LBT_purchaseAffordability(state, price)
    : { ok: true, reason: "" };
  const capped = Boolean(disabled);
  const blocked = !capped && !owned && !afford.ok;
  const blockReason = afford.reason || "";
  return h("div", {
    key,
    className: "shop-card spirit-item",
    "data-owned": owned ? "1" : null,
    "data-blocked": blocked || capped ? "1" : null
  },
    /* 識別情報は名前とは別の行に置く（ビルドの .p-card-head と同じ）。
       同一行に並べると名前の幅が蝕まれる。 */
    topRow ? h("div", { className: "p-card-head shop-card-top" }, topRow) : null,
    h("div", { className: "spirit-item-head shop-card-head" },
      h("div", { className: "spirit-item-name shop-card-name" }, name),
      h("span", { className: "spirit-item-price shop-card-cost" }, costText || price.label),
      ...(headExtra || []),
      owned ? h("span", { className: "shop-card-flag is-owned" }, "所持") : null,
      badge ? h("span", { className: "shop-card-flag" }, badge) : null),
    ...(body || lines || []),
    h("div", { className: "spirit-item-actions shop-card-actions" },
      owned
        ? h("span", { className: "spirit-item-equipped" }, "所持済み")
        : h(Button, {
          size: "sm",
          variant: "primary",
          icon: "plus",
          disabled: capped,
          onClick: blocked ? () => toast(blockReason, "assertive") : onAcquire,
          title: capped ? (reason || "購入できません") : blocked ? blockReason : (reason || "このカードから購入して所持にする")
        }, actionLabel || "購入")));
};


  /* 指定購入は通常人格のみ。特異人格はルール上、抽出のみなので商品一覧に混ぜない。 */
  const personas = (DB.normal_personas || []).filter((persona) =>
    (!unownedOnly || !ownedPersonaKeys.has(`n:${persona.no}`))
    && hit(`${persona.name} ${persona.no} ${persona.affiliation || persona.aff || ""} ${(persona.keywords || []).join(" ")} ${(persona.skills || []).map((skill) => `${skill.name || ""} ${skill.effect || ""}`).join(" ")} ${persona.passive_name || ""} ${persona.passive_effect || ""}`));
  const supports = [
    ...(DB.support_passives || []).map((s) => ({ ...s, slot: "normal", kind: "support" })),
    ...(DB.death_passives || []).map((s) => ({ ...s, slot: "death", kind: "deathSupport" }))
  ].filter((entry) => (!unownedOnly || !ownedSupportNames.has(entry.name))
    && (sinFilter ? (entry.cond || "").includes(sinFilter) : true)
    && (sourceFilter === "all" || catalogSource(entry) === sourceFilter)
    && hit(`${entry.name} ${entry.cond || ""} ${entry.effect || ""}`));

  const egos = (DB.egos || []).filter((ego) => (!unownedOnly || !ownedEgoKeys.has(`${ego.rank}:${ego.no}`))
    && (!rankFilter || ego.rank === rankFilter)
    && window.LBT_egoMatchesResourceFilters(ego, requiredResources, excludedResources)
    && (!keywordFilter || window.LBT_egoMatchesKeyword(ego, keywordFilter))
    && hit(`${ego.name} ${ego.rank} ${ego.passive_name || ""} ${ego.passive_effect || ""}`));
  /* キーワードの語彙はビルド側と同じ順序・同じ並びで出す。
     語彙×EGO全件の照合で重く、カタログは静的（カスタムアイテムは ego に影響しない）なので初回だけ計算する。 */
  const egoKeywordOptions = React.useMemo(() => EGO_KEYWORD_ORDER
    .map((keyword) => String(keyword || "").trim())
    .filter(Boolean)
    .filter((keyword) => (DB.egos || []).some((ego) => window.LBT_egoMatchesKeyword(ego, keyword))), []);

  const spirits = (DB.spirits || []).filter((sp) => (!unownedOnly || !ownedSpiritNames.has(sp.name))
    && (sourceFilter === "all" || catalogSource(sp) === sourceFilter)
    && hit(`${sp.name} ${sp.morale_effect || ""} ${sp.confuse_effect || ""}`));

  /* 商品カタログは所持状態で絞らない。消耗品は購入後も商品一覧に残り、在庫0でも再購入できる。 */
  const items = catalogItems.filter((item) =>
    (categoryFilter === "all" || String(item?.category || "その他") === categoryFilter)
    && hit(`${item.name} ${(item.searchAliases || []).join(" ")} ${item.category || ""} ${(item.tags || []).join(" ")} ${item.effect || ""}`));

  /* カードはタブを開いたときだけ組む。全タブ分を毎描画で作ると
     300枚超×4タブの要素ツリーになり、切替・検索入力のたびにJSが数百msかかる。 */
  const lists = {
    persona: () => personas.map((persona) => {
      const cost = resolveAcquireCost("persona", "purchase", {
        name: persona.name,
        ownsPersona: (state.roster?.personas || []).length > 0
      });
      const owned = ownedPersonaKeys.has(`n:${persona.no}`);
      return card(`n:${persona.no}`, persona.name, "通常人格", "persona", () => {
        const afford = window.LBT_purchaseAffordability?.(state, cost) || { ok: true, reason: "" };
        if (!afford.ok) {
          toast(afford.reason || "購入に必要な残高が不足しています", "assertive");
          return;
        }
        dispatch({
          type: "ADD_ROSTER",
          mode: "n",
          no: persona.no,
          purchase: true,
          cost: { lp: cost.lp || 0, shards: cost.shards || 0 }
        });
        toast(`「${persona.name}」を指定購入しました（${cost.label}）`, "assertive");
      }, false, null, shopCardLines("persona", persona), owned, null, null, cost.label,
      [h("span", { className: "shop-card-num" }, "No.", String(persona.no).padStart(3, "0"))],
      "指定購入");
    }),
    support: () => supports.map((entry) => card(`${entry.slot}:${entry.name}`, entry.name, entry.slot === "death" ? "死亡後専用" : null, entry.kind,
      () => { dispatch({ type: "ADD_ROSTER_SUPPORT", spp: entry }); toast(`「${entry.name}」を所持に購入しました`, "assertive"); },
      false, null, shopCardLines(entry.kind, entry), ownedSupportNames.has(entry.name))),
    ego: () => egos.map((ego) => card(`${ego.rank}:${ego.no}`, ego.name, null, "ego",
      () => { dispatch({ type: "ADD_ROSTER_EGO", rank: ego.rank, no: ego.no, purchase: true }); toast(`「${ego.name}」を所持に購入しました`, "assertive"); },
      false, null, null, ownedEgoKeys.has(`${ego.rank}:${ego.no}`),
      null,
      [
        h(EgoResourceChips, { resources: ego.resources, className: "is-catalog" }),
        h("div", { className: "p-kw-row shop-card-kw-row" },
          h("span", { className: "p-kw" }, "SAN ", ego.san_cost))
      ], null,
      [
        h("span", { className: "shop-card-num" }, "No.", String(ego.no).padStart(3, "0")),
        h("span", { className: "badge", "data-rank": ego.rank }, ego.rank),
        (ego.sub_skills || []).length > 0 ? h("span", { className: "ego-doka-badge", title: "同化スキル対応EGO" }, "◆ 同化") : null
      ].filter(Boolean))),
    spirit: () => spirits.map((sp) => card(sp.name, sp.name,
      !hasExplicitSpiritPrice(sp) ? "価格不明" : Number(sp.price) > 0 ? null : "初期選択可", "spirit",
      () => {
        if (!hasExplicitSpiritPrice(sp)) {
          toast("価格が不明なため追加できません", "assertive");
          return;
        }
        dispatch({ type: "ADD_ROSTER_SPIRIT", spirit: sp });
        toast(`「${sp.name}」を所持に購入しました`, "assertive");
      },
      false, null, shopCardLines("spirit", sp), ownedSpiritNames.has(sp.name),
      null, null,
      /* 精神の費用はビルドと同じ規則で表す。価格 0 は費用ではなく
         ルール情報なので、価格枠ではなく head のフラグ（所持バッジの隣）へ出す。 */
      hasExplicitSpiritPrice(sp) ? formatAcquireCost(0, sp.price) : "価格不明")),
    item: () => items.map((item) => {
      /* 価格設定のない商品は所持欄への登録、価格付き商品は購入として扱う。 */
      const registerOnly = !hasConfiguredPrice(item) && item?.ledgerResource !== "shards";
      const repeatPurchase = canRepurchaseItem(item);
      const ownedEntry = inventory.find((entry) => entry.itemId === item.id);
      const acquire = () => {
        if (registerOnly) {
          dispatch({ type: "ADD_ITEM_INVENTORY", itemId: item.id });
          toast(`「${item.name}」を所持欄へ追加しました（価格未設定）`, "assertive");
          return;
        }
        dispatch({ type: "ADD_ITEM", itemId: item.id, purchase: true });
        toast(item?.ledgerResource === "shards"
          ? "自我の欠片を1個購入しました（2LP）"
          : `「${item.name}」を購入しました（${resolveAcquireCost("item", "purchase", { id: item.id, name: item.name, customItems: state.customItems }).label}）`, "assertive");
      };
      const ownedBadge = repeatPurchase && ownedEntry
        ? [h("span", { className: "shop-card-flag is-owned", title: "所持数。購入すると1個増えます" }, `所持 ×${Number(ownedEntry.quantity) || 1}`)]
        : null;
      return card(item.id, item.name, item.category || "その他", "item",
        acquire, atCap(item), "所持上限に達しています", shopCardLines("item", item),
        ownedItemIds.has(item.id) && !repeatPurchase,
        ownedBadge, null, registerOnly ? "価格未設定" : undefined, null,
        registerOnly ? "所持欄へ追加" : "購入");
    })
  };
  const totals = {
    persona: (DB.normal_personas || []).length,
    support: (DB.support_passives || []).length + (DB.death_passives || []).length,
    ego: (DB.egos || []).length,
    spirit: (DB.spirits || []).length,
    item: catalogItems.length
  };
  const list = lists[tab] ? lists[tab]() : [];
  const shownList = list.slice(0, visibleCount);
  /* 絞り込みが変わったら表示枚数を初期値に戻す（前のリストの表示枚数を持ち越さない）。 */
  React.useEffect(() => { setVisibleCount(48); }, [tab, unownedOnly, query, rankFilter, categoryFilter, sinFilter, sourceFilter, keywordFilter, requiredResources, excludedResources]);
  React.useEffect(() => {
    /* IntersectionObserver は content-visibility の推定高さとスクロールアンカリングで
       判定が不安定になるため、スクロール位置と実測高さで末尾到達を判定する。
       高さの読み取りは強制レイアウトを伴うので、1フレーム1回にまとめる。 */
    const scroller = document.querySelector("main.focus");
    let scheduled = false;
    let cancelled = false;
    const measure = () => {
      scheduled = false;
      if (cancelled) return;
      const scrollable = scroller && scroller.scrollHeight > scroller.clientHeight + 1;
      const nearBottom = scrollable
        ? scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 1200
        : window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 1200;
      if (!nearBottom) return;
      /* 同じ高さのまま複数のスクロールイベントが来ても、追記は1回までにする。 */
      const span = scrollable ? scroller.scrollHeight : document.documentElement.scrollHeight;
      if (span === lastGrowHeightRef.current) return;
      lastGrowHeightRef.current = span;
      setVisibleCount((count) => Math.min(count + 48, list.length));
    };
    const grow = () => { if (!scheduled) { scheduled = true; requestAnimationFrame(measure); } };
    grow();
    const onScroll = { passive: true };
    if (scroller) scroller.addEventListener("scroll", grow, onScroll);
    window.addEventListener("scroll", grow, onScroll);
    window.addEventListener("resize", grow);
    return () => {
      cancelled = true;
      if (scroller) scroller.removeEventListener("scroll", grow, onScroll);
      window.removeEventListener("scroll", grow, onScroll);
      window.removeEventListener("resize", grow);
    };
  }, [shownList.length, list.length]);
  const total = totals[tab] || 0;
  const emptyMessage = { persona: "条件に合う未所持の通常人格はありません。", support: "条件に合う未所持のサポートはありません。", ego: "条件に合う未所持のE.G.Oはありません。", spirit: "条件に合う未所持の精神はありません。", item: "条件に合う未所持のアイテムはありません。" }[tab];

  /* 検索窓はビルド側と同じ並び：検索 → 件数 → 種別フィルタ。 */
  const filterRows = tab === "ego" ? h("div", { className: "codex-filter-row" },
      h("span", { className: "filter-label" }, "ランク"),
      h("div", { className: "chips-group" }, EGO_RANKS.map((rank) => h("button", {
        key: rank, type: "button", className: `chip${rankFilter === rank ? " is-active" : ""}`, "aria-pressed": rankFilter === rank,
        style: rankFilter === rank ? { background: `color-mix(in oklab, var(--rank-${rank}) 25%, var(--surface-2))`, borderColor: `var(--rank-${rank})`, color: "var(--tx)" } : void 0,
        onClick: () => setRankFilter(rankFilter === rank ? "" : rank)
      }, rank))),
      /* 資源で絞り込む。ビルド側と同じ判定（window.LBT_egoMatchesResourceFilters）を使う。 */
      h("div", { className: "codex-filter-row" },
        h("span", { className: "filter-label" }, "必要資源"),
        h("div", { className: "chips-group" },
          h("button", {
            type: "button", className: `chip${requiredResources.length === 0 ? " is-active" : ""}`, "aria-pressed": requiredResources.length === 0,
            onClick: () => setRequiredResources([])
          }, "すべて"),
          SIN_LIST.map((sin) => h("button", {
            key: `need-${sin}`, type: "button",
            className: `chip ego-filter-chip${requiredResources.includes(sin) ? " is-active" : ""}`,
            "aria-pressed": requiredResources.includes(sin),
            "data-sin": sin,
            style: { borderColor: `var(--sin-${sin})` },
            onClick: () => {
              setRequiredResources((prev) => prev.includes(sin) ? prev.filter((v) => v !== sin) : [...prev, sin]);
              setExcludedResources((prev) => prev.filter((v) => v !== sin));
            }
          }, sin)))),
      h("div", { className: "codex-filter-row" },
        h("span", { className: "filter-label" }, "除外資源"),
        h("small", { className: "filter-note" }, "一つでも含むと除外"),
        h("div", { className: "chips-group" },
          h("button", {
            type: "button", className: `chip${excludedResources.length === 0 ? " is-active" : ""}`, "aria-pressed": excludedResources.length === 0,
            onClick: () => setExcludedResources([])
          }, "すべて"),
          SIN_LIST.map((sin) => h("button", {
            key: `no-${sin}`, type: "button",
            className: `chip ego-filter-chip${excludedResources.includes(sin) ? " is-active" : ""}`,
            "aria-pressed": excludedResources.includes(sin),
            "data-sin": sin,
            style: { borderColor: `var(--sin-${sin})` },
            onClick: () => {
              setExcludedResources((prev) => prev.includes(sin) ? prev.filter((v) => v !== sin) : [...prev, sin]);
              setRequiredResources((prev) => prev.filter((v) => v !== sin));
            }
          }, sin)))),
      /* キーワード。ビルド側と同じ語彙と判定を使う。 */
      h("div", { className: "codex-filter-row" },
        h("span", { className: "filter-label" }, "キーワード"),
        h("div", { className: "chips-group" }, egoKeywordOptions.map((keyword) => h("button", {
          key: keyword, type: "button", className: `chip${keywordFilter === keyword ? " is-active" : ""}`, "aria-pressed": keywordFilter === keyword,
          onClick: () => setKeywordFilter(keywordFilter === keyword ? "" : keyword)
        }, keyword))))
      )
    : tab === "item" ? h("div", { className: "codex-filter-row" },
        h("span", { className: "filter-label" }, "カテゴリ"),
        h("div", { className: "chips-group" }, ["all", ...itemCategories].map((category) => h("button", {
          key: category, type: "button", className: `chip${categoryFilter === category ? " is-active" : ""}`, "aria-pressed": categoryFilter === category,
          onClick: () => setCategoryFilter(category)
        }, category === "all" ? "全て" : category))))
    : tab === "support" ? h("div", { className: "codex-filter-row" },
        h("span", { className: "filter-label" }, "発動条件"),
        h("div", { className: "chips-group" }, ["", ...SIN_LIST].map((sin) => h("button", {
          key: sin || "all", type: "button", className: `chip${sinFilter === sin ? " is-active" : ""}`, "aria-pressed": sinFilter === sin,
          onClick: () => setSinFilter(sin)
        }, sin || "すべて"))))
    : null;
  useSourceFilterControl(SOURCE_KINDS[tab] || "", sourceFilter, setSourceFilter, !!SOURCE_KINDS[tab]);

  const searchLabel = { persona: "人格名・No.・スキル・パッシブで検索", support: "サポート名・条件・効果で検索", ego: "E.G.O名・効果・ランクで検索", spirit: "精神名・効果で検索", item: "アイテム名・効果・タグ・カテゴリで検索" }[tab];

  /* 一覧のスクロールコンテナ（main.focus）を先頭に戻す。
     カテゴリを切り替えたときに前カテゴリの中段が見えたままだと、
     別のリストの可能性と誤読される。 */
  const scrollWorkspaceToTop = () => {
    const scroller = document.querySelector("main.focus") || document.querySelector("main");
    if (scroller && typeof scroller.scrollTop === "number") scroller.scrollTo({ top: 0, behavior: "auto" });
  };

  return h("div", { className: "shop-workspace" },
    h(SectionTitle, { title: "SHOP / ショップ", subtitle: "人格・サポート・E.G.O・精神・アイテムを購入" }),
    /* カテゴリタブだけを独立要素にして追従させる。filter パネルの内側に置くと
       sticky は親の範囲を出られないため、親を抜けた瞬間にタブも消える。
       追従する面（ラッパー）は全幅にして、下を流れる内容を隠す。
       タブを切り替えたら先頭へ戻す（スクロール位置は前カテゴリのもので
       另一位的天空に持ち越すと、「同じ列表の続き」に見えるため）。 */
    h("div", { className: "shop-tabs-sticky" },
      h("div", { className: "segmented shop-tabs", role: "tablist", "aria-label": "ショップの種別" },
        [["persona", "人格"], ["support", "サポート"], ["ego", "E.G.O"], ["spirit", "精神"], ["item", "アイテム"], ["gacha", "ガチャ"]].map(([value, label]) => h("button", {
          key: value, type: "button", role: "tab", "aria-selected": tab === value, className: tab === value ? "is-active" : "",
          onClick: () => { setTab(value); scrollWorkspaceToTop(); }
        }, label))
      )
    ),
    /* ガチャは商品を並べた画面ではなく、抽選権利の操作画面。
       検索/カテゴリ/ソートは全部意味が無いので、このタブだけ専用パネルに分ける。 */
    tab === "gacha" ? h(GachaTicketsPanel, { state, dispatch }) :
    h("div", { className: `shop-filters codex-filters${tab === "ego" ? " ego-catalog-filters" : ""}` },
      tab === "persona" ? h("p", {
        className: "ledger-note shop-persona-catalog-note",
        role: "note",
        style: { gridColumn: "1 / -1", margin: "0 0 8px", width: "100%" }
      }, "通常人格を選んで指定購入できます。未所持の最初の人格と、2体目以降では価格が異なるため、表示価格を確認して購入してください。特異人格はルール上、抽出のみです。") :
      tab === "item" ? h("p", {
        className: "ledger-note shop-item-catalog-note",
        role: "note",
        style: { gridColumn: "1 / -1", margin: "0 0 8px", width: "100%" }
      }, "購入済みでも商品は一覧に残ります。価格付きの消耗品は所持上限まで繰り返し購入でき、購入のたびに所持数と支出履歴が増え、使用時に所持数が減ります。") : null,
      h("div", { className: "shop-toolbar-main" },
        h("div", { className: "codex-search" }, h(Icon, { name: "search", size: 14 }),
          h("input", { type: "text", "aria-label": searchLabel, placeholder: `${searchLabel}...`, value: query, onChange: (event) => setQuery(event.target.value) })),
        h("div", { className: "codex-count" }, h("strong", null, list.length), " / ", total),
tab !== "item" ? h(Button, {
          size: "sm",
          variant: "ghost",
          "aria-pressed": unownedOnly,
          onClick: () => setUnownedOnly((v) => !v),
          title: unownedOnly ? "所持済みの商品も含めて表示する" : "未所持の商品だけ表示する"
        }, unownedOnly ? "所持も表示" : "未所持のみ") : null
      ),
      filterRows
    ),
    list.length === 0 ? h("div", { className: "empty" }, emptyMessage) : h("div", { className: "shop-grid", "data-tab": tab },
      shownList)
  );
};
const BuildWorkspace = ({ state, dispatch }) => {
  const h = React.createElement;
  const current = state.ui?.currentSection || "persona";
  const active = BUILD_TABS.find((tab) => tab.id === current) || BUILD_TABS[0];
  const setTab = (id) => dispatch({ type: "SET_UI", ui: { currentSection: id } });
  /* 各タブの中身は既存コンポーネントをそのまま使う。owned は roster（＝所持済み）
     で絞るかどうか。所持を持たないもの（スキル/パッシブ/強化）は絞り込まない。 */
  const owned = !!active.owned;
  const Component = active.id === "persona"
    ? window.PersonaCodex
    : active.id === "skill"
      ? window.SkillDeck
      : active.id === "passive"
        ? PassiveSection
        : active.id === "support"
          ? SupportSection
          : active.id === "ego"
            ? EgoSection
            : active.id === "spirit"
              ? SpiritSection
              : active.id === "items-build"
                ? BuildItemsPanel
                : EnhancementSection;
  /* 所持ゲートを、roster を唯一の基準とするタブ（人格/サポート/E.G.O/精神）へ渡す。 */
  const panelProps = ["persona", "support", "ego", "spirit"].includes(active.id) ? { ownedOnly: owned } : {};
  /* 一度表示したタブはツリーを保持し、切替は hidden のみにする（再マウントと画像再デコードを毎回払わない）。 */
  const visitedRef = React.useRef([]);
  const paneCacheRef = React.useRef({});
  if (!visitedRef.current.includes(active.id)) visitedRef.current = visitedRef.current.concat(active.id);
  if (!paneCacheRef.current[active.id] || paneCacheRef.current[active.id].state !== state) {
    paneCacheRef.current[active.id] = {
      state,
      element: Component ? h(Component, { state, dispatch, ...panelProps }) : null
    };
  }
  const panes = BUILD_TABS.map((tab) => {
    const cache = paneCacheRef.current[tab.id];
    return h("div", {
      key: tab.id,
      className: "build-tabpane",
      id: "bpanel-" + tab.id,
      role: "tabpanel",
      "aria-labelledby": "btab-" + tab.id,
      hidden: tab.id !== active.id
    }, visitedRef.current.includes(tab.id) && cache ? cache.element : null);
  });
  return h("div", { className: "build-workspace" },
    h(SectionTitle, { num: active.num, title: active.title, subtitle: active.subtitle }),
    h("div", { className: "build-tabs" },
      h("div", { className: "segmented", role: "tablist", "aria-label": "ビルドセクション" },
        BUILD_TABS.map((tab) => h("button", {
          key: tab.id,
          type: "button",
          role: "tab",
          "aria-selected": active.id === tab.id,
          className: active.id === tab.id ? "is-active" : "",
          onClick: () => setTab(tab.id),
          id: "btab-" + tab.id,
          "aria-controls": "bpanel-" + tab.id
        }, tab.label))
      )
    ),
    h("div", { className: "build-tabpanel" }, panes)
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
/* 並び順のうち人格タブにしかないもの。所持ライブラリは人格/E.G.O で
   sortBy を共有するため、these を引きglyph带到 E.G.O タブだと
   「何もしないのにソート済みに見える」うえ、<select> に該当 option が
   無くなって空欄になる。同時フィルタ（D架）と同じ扱いにする。 */
const ROSTER_PERSONA_ONLY_SORTS = new Set(["sync"]);
const reconcileRosterSortWithTab = (sortBy, libraryTab) =>
  (libraryTab !== "personas" && ROSTER_PERSONA_ONLY_SORTS.has(sortBy) ? "added" : sortBy);
if (typeof window !== "undefined") window.LBT_reconcileRosterSortWithTab = reconcileRosterSortWithTab;
  /* 駒整形（BaseInfoWorkspace）は PersonaCodex.js にある。
     組み立て設定の定義はここなので、外から使えるように公開する。 */
  if (typeof window !== "undefined") window.LBT_BuildParamsPanel = (props) => h(BuildParamsPanel, props);
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
const resolveRosterPersonaSource = (entry, fallback, state) => {
  const isEquipped = Boolean(state?.personaSrc)
    && String(state.personaMode) === String(entry?.mode)
    && String(state.personaNo) === String(entry?.no);
  if (isEquipped && typeof window.LBT_buildEquippedDetailPersona === "function") {
    return window.LBT_buildEquippedDetailPersona(state);
  }
  const build = entry?.build;
  if (!build) {
    const source = fallback || entry?.src || null;
    if (!source) return null;
    const resolveName = window.LBT_resolvePersonaDisplayName;
    const name = typeof resolveName === "function" ? resolveName(entry, source.name) : (entry?.displayName || source.name);
    return { ...source, name };
  }
  const savedSource = build.personaSrc && typeof build.personaSrc === "object" ? build.personaSrc : {};
  const source = { ...(fallback || {}), ...savedSource };
  return {
    ...source,
    name: typeof window.LBT_resolvePersonaDisplayName === "function"
      ? window.LBT_resolvePersonaDisplayName(entry, source.name)
      : (entry?.displayName || source.name),
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
    unique_buffs: Array.isArray(build.uniqueBuffs) ? build.uniqueBuffs : source.unique_buffs,
    extra_passives: Array.isArray(build.extraPassives) ? build.extraPassives : (source.extra_passives || [])
  };
};
const resolveRosterEgoSource = (entry, definitions = (DB.egos || [])) => {
  const dbEntry = (Array.isArray(definitions) ? definitions : [])
    .find((item) => item?.rank === entry?.rank && String(item?.no ?? "") === String(entry?.no ?? ""));
  return dbEntry || entry?.build || null;
};
window.LBT_rosterLibrary = { isRosterPersonaSynced, rosterPersonaMatchesSyncFilters, sortRosterLibraryItems, resolveRosterPersonaSource, resolveRosterEgoSource };
function getRosterLibraryTypePresentation(type) {
  switch (type) {
    case "personas":
      return { detailTitle: "PERSONA DETAIL / 簡易詳細", equipLabel: "この人格を装備する", savedLabel: "保存済みビルドを復元して装備します" };
    case "egos":
      return { detailTitle: "E.G.O DETAIL / 簡易詳細", equipLabel: "このE.G.Oを装備する", savedLabel: "保存済み解析を復元して装備します" };
    case "supports":
      return { detailTitle: "SUPPORT PASSIVE DETAIL / サポートパッシブ", equipLabel: "このサポートパッシブを装備する", savedLabel: null };
    case "spirits":
      return { detailTitle: "SPIRIT DETAIL / 精神", equipLabel: "この精神を装備する", savedLabel: null };
    default:
      return null;
  }
}

function getRosterLibraryEquipAction(item) {
  if (!item || !item.entry || !item.entry.uid) return null;
  switch (item.type) {
    case "personas":
      return { type: "EQUIP_PERSONA", mode: item.entry.mode, no: item.entry.no, src: item.src };
    case "egos":
      return { type: "SET_EGO_SLOT", rank: item.entry.rank, value: item.src };
    case "supports":
      return { type: "SET_ROSTER_SUPPORT_EQUIPPED", uid: item.entry.uid, equipped: true };
    case "spirits":
      return { type: "SET_ROSTER_SPIRIT_EQUIPPED", uid: item.entry.uid, equipped: true };
    default:
      return null;
  }
}

function getRosterLibraryEquipBlockReason(item, state, activeEnhancements) {
  if (!item || item.type !== "supports") return null;
  const enhancements = Array.isArray(activeEnhancements) ? activeEnhancements : [];
  if (item.entry && item.entry.slot === "death") {
    return enhancements.some((entry) => entry && entry.name === "死亡後パッシブ追加")
      ? null
      : "死亡後専用スロットが未開放です";
  }
  const maxSupports = enhancements.some((entry) => String((entry && entry.name) || "").includes("サポートスロット追加")) ? 3 : 2;
  const equippedSupports = Array.isArray(state && state.supports) ? state.supports : [];
  return equippedSupports.length >= maxSupports ? "スロット上限（" + maxSupports + "枠）です" : null;
}

const RosterSection = ({ state, dispatch }) => {
  const h = React.createElement;
  /* タブは topbar の残高チップからも開くため state.ui に置く。local state だと外から遷移できない。 */
  /* 記録はリザルト確認が最頻の用途なので初期タブも並びもリザルトを先頭にする。 */
  const libraryTab = state.ui?.libraryTab || "ledger";
  const setLibraryTab = (value) => dispatch({ type: "SET_UI", ui: { libraryTab: value } });
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
    if (entry.mode === "custom") return resolveRosterPersonaSource(entry, entry.src || entry.build?.personaSrc || null, state);
    const db = entry.mode === "n" ? (DB.normal_personas || []) : (DB.tokui_personas || []);
    return resolveRosterPersonaSource(entry, db.find((item) => String(item.no) === String(entry.no)) || null, state);
  };
  const findEgo = (entry) => resolveRosterEgoSource(entry, DB.egos || []);
  /* サポートと精神も並びます。以前は人格/E.G.O の二分岐しか無く、
     サポパ/精神タブが E.G.O の内容を出し続けていた。 */
  const rawItems = libraryTab === "personas" ? (roster.personas || []).map((entry, addedIndex) => {
    const src = findPersona(entry);
    const baseName = src?.name || entry.displayName || "名称未設定";
    const name = entry.syncMax && !/\s*\[MAX\]\s*$/i.test(baseName) ? `${baseName} [MAX]` : baseName;
    return { entry, src, id: entry.uid, type: "personas", name, equipped: `${entry.mode}:${entry.no}` === currentPersonaKey, saved: !!entry.build, synced: isRosterPersonaSynced(entry), addedIndex, meta: entry.mode === "n" ? "通常人格" : entry.mode === "t" ? "特異人格" : "創作人格" };
  }).filter((item) => item.src) : libraryTab === "egos" ? (roster.egos || []).map((entry, addedIndex) => {
    const src = findEgo(entry);
    return { entry, src, id: entry.uid, type: "egos", name: entry.build?.name || src?.name || "名称未設定", equipped: currentEgoKeys.has(`${entry.rank}:${entry.no}`), saved: !!entry.build, addedIndex, meta: `${entry.rank} · No.${String(entry.no || "").padStart(3, "0")}` };
  }).filter((item) => item.src) : libraryTab === "supports" ? (roster.supports || []).map((entry, addedIndex) => ({
    entry, src: entry, id: "spp-" + (entry.uid || entry.name), type: "supports", name: entry.name,
    equipped: entry.equipped === true
      || (state.supports || []).some((support) => support && support.name === entry.name)
      || (state.deathSupport && state.deathSupport.name === entry.name),
    saved: false, addedIndex, meta: "サポートパッシブ"
  })) : libraryTab === "spirits" ? (roster.spirits || []).map((entry, addedIndex) => ({
    entry, src: entry, id: "spi-" + (entry.uid || entry.name), type: "spirits", name: entry.name,
    equipped: entry.equipped === true || state.spirit === entry.name, saved: false, addedIndex, meta: "精神"
  })) : [];
  const items = sortRosterLibraryItems(rawItems.filter((item) => (
    (filter === "all"
      || filter === "custom" && item.type === "personas" && item.entry.mode === "custom"
      || filter === "saved" && item.saved)
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
    const target = rawItems.filter((item) => selected.has(item.id) && !item.equipped && item.entry?.uid);
    if (!target.length) { toast("削除できる項目を選択してください"); return; }
    const names = target.slice(0, 3).map((item) => item.name).join("、");
    const suffix = target.length > 3 ? `、ほか${target.length - 3}件` : "";
    const kindLabel = libraryTab === "personas" ? "人格" : libraryTab === "egos" ? "E.G.O" : libraryTab === "supports" ? "サポパ" : "精神";
    if (!confirm(`${kindLabel} ${target.length}件を所持ライブラリから削除しますか？\n${names}${suffix}\n装備中の項目は削除されません。`)) return;
    /* 所持レコードは uid で識別する（表示用の id は名前から作った合成キー）。
       一括削除でも単体削除と同じく、対応する購入明細まで外す。 */
    const uids = target.map((item) => item.entry.uid);
    const refKind = {
      personas: "rosterPersona", egos: "rosterEgo",
      supports: "rosterSupport", spirits: "rosterSpirit"
    }[libraryTab];
    const uidSet = new Set(uids);
    const removedEntries = (state.entries || []).filter((entry) => entry.ref?.kind === refKind && uidSet.has(entry.ref.uid));
    if (libraryTab === "supports") dispatch({ type: "REMOVE_ROSTER_SUPPORT_BATCH", uids });
    else if (libraryTab === "spirits") dispatch({ type: "REMOVE_ROSTER_SPIRIT_BATCH", uids });
    else dispatch({ type: libraryTab === "personas" ? "REMOVE_ROSTER_BATCH" : "REMOVE_ROSTER_EGO_BATCH", uids, deleteCustomConfirmed: true });
    setUndo({ kind: libraryTab, items: target.map((item) => item.entry), entries: removedEntries, expires: Date.now() + 10000 });
    clearSelection();
    setDetailId(null);
    toast(`${target.length}件をライブラリから削除しました。下の「元に戻す」で復元できます`);
  };
  const restore = () => {
    if (!undo) return;
    dispatch({ type: "RESTORE_ROSTER_BATCH", kind: undo.kind, items: undo.items, entries: undo.entries || [] });
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
    const action = getRosterLibraryEquipAction(item);
    if (!action) {
      toast("この種類の項目は装備できません");
      return;
    }
    if (item.type === "supports") {
      const activeEnhancements = window.LBT_getActiveEnhancements?.(state) || (state.enhancements || []);
      const blockReason = getRosterLibraryEquipBlockReason(item, state, activeEnhancements);
      if (blockReason) {
        toast(blockReason);
        return;
      }
    }
    dispatch(action);
    switch (item.type) {
      case "personas":
        toast("『" + item.name + "』を装備");
        break;
      case "egos":
        toast(item.entry.rank + ": 『" + item.name + "』を装備");
        break;
      case "supports":
        toast(item.entry.slot === "death"
          ? "『" + item.name + "』を死亡後専用スロットへ装備"
          : "『" + item.name + "』をサポートスロットへ装備");
        break;
      case "spirits":
        toast("『" + item.name + "』を精神として装備");
        break;
      default:
        break;
    }
  };
    /* 既存アカウント向け。同期/解析のフラグは立ってるのに明細が無い状態を
       一括で遡及記録する。二重計上は reducer 側で uid+kind で弾く。 */
    const backfillable = React.useMemo(() => {
      const seen = new Set((state.entries || []).map((e) => `${e.kind}:${e.ref?.uid}`));
      let n = 0;
      for (const e of state.roster.personas || []) {
        const hasSync = Boolean(e.syncRank) || e.syncMax === true;
        if (hasSync && !seen.has(`${e.syncMax === true ? "personaSyncMax" : "personaSync"}:${e.uid}`)) n++;
      }
      for (const e of state.roster.egos || []) {
        const hasAnalyze = e.analyzed === true || e.analyzeMax === true;
        if (hasAnalyze && !seen.has(`${e.analyzeMax === true ? "egoAnalyzeMax" : "egoAnalyze"}:${e.uid}`)) n++;
      }
      return n;
    }, [state.roster.personas, state.roster.egos, state.entries]);

    /* 同期化・同期MAXは自我の欠片を支払う（supplement P7/P23）。
     ただのフラグで済ませると欠片が帳から消えるので、必ず明細として残す。 */
  const syncCost = (uid, syncMax) => {
    /* no はグループ間で重複する（no=30 は通常人格にも特異人格にもある）。
       mode を見ずに通常人格だけを探すと、特異人格の同期費用が
       別の同じ no の通常人格の数値で計算される。 */
    const entry = (state.roster?.personas || []).find((x) => x.uid === uid);
    if (!entry) return null;
    const persona = (entry.mode === "t"
      ? window.DB?.tokui_personas || []
      : window.DB?.normal_personas || []).find((p) => String(p.no) === String(entry.no));
    return window.LBT_operationCost?.(syncMax ? "syncMax" : "sync", { ...persona }, window.DB) || null;
  };
  const applySyncMax = (item, on) => {
    const c = syncCost(item.entry.uid, on);
    if (!on && !item.entry.syncMax) {
      /* 解除なら費用は発生しない。 */
      dispatch({ type: "APPLY_PERSONA_SYNC", uid: item.entry.uid, syncMax: false });
      toast("同期MAXを解除しました");
      return;
    }
    if (on && c) {
      const bal = window.LBT_computeLedgerBalance?.(state.results, state.entries);
      if (bal && Number(bal.shards) < Number(c.shards)) {
        toast(`自我の欠片が足りません（必要 ${c.shards} / 手持ち ${bal.shards}）`);
        return;
      }
    }
    dispatch({ type: "APPLY_PERSONA_SYNC", uid: item.entry.uid, syncMax: on });
    if (on && c) {
      toast(`${item.name} を同期MAXにしました（自我の欠片 ${c.shards}個）`);
    } else if (!on) {
      toast("同期MAXを解除しました（使用済みの欠片は戻りません）");
    }
  };
  /* 同期ランク（人格ランク 0/00/000）。解除（なし，回到未同期）なら費用は掛からない。 */
  const applySyncRank = (item, value) => {
    const wasSynced = Boolean(item.entry.syncRank) || item.entry.syncMax === true;
    const willBeSynced = Boolean(value) || item.entry.syncMax === true;
    const cost = !wasSynced && willBeSynced ? syncCost(item.entry.uid, false) : null;
    if (cost) {
      const bal = window.LBT_computeLedgerBalance?.(state.results, state.entries);
      if (bal && Number(bal.shards) < Number(cost.shards)) {
        toast(`自我の欠片が足りません（必要 ${cost.shards} / 手持ち ${bal.shards}）`, "assertive");
        return;
      }
    }
    dispatch({ type: "APPLY_PERSONA_SYNC", uid: item.entry.uid, syncRank: value });
    if (!willBeSynced && wasSynced) toast(`『${item.name}』の同期を解除しました`);
    else if (value) toast(`『${item.name}』を同期${value}にしました（自我の欠片 ${cost?.shards ?? 50}個）`);
  };
  const renderDetail = (item) => {
    const src = item.src || {};
    const presentation = getRosterLibraryTypePresentation(item.type) || {
      detailTitle: "RECORD DETAIL / 簡易詳細",
      equipLabel: "装備する",
      savedLabel: null
    };
    /* 同期/同期MAXの操作は装備状態に依存しない。canEditPersonaState は
       「DB人格の HP/SAN を手編集できるか」の話で、保守処理とは無関係。
       これを条件にしていたせいで、DB 人格の同期MAXは設定も解除もできなかった。 */
    const canModifySyncMax = item.type === "personas";
    const syncCosts = item.type === "personas" ? {
      rank: syncCost(item.entry.uid, false),
      max: syncCost(item.entry.uid, true)
    } : null;
    const summarizeEgoSkill = (skill) => {
      if (!skill) return "未設定";
      const type = [skill.attr, skill.sin].filter(Boolean).join("・");
      const dice = (skill.dice || []).map((die) => die.roll).filter(Boolean).join(" / ");
      return [type, dice].filter(Boolean).join(" / ") || "登録済み";
    };
    const spiritDetail = item.type === "spirits"
      ? (DB.spirits || []).find((entry) => entry.name === item.name) || {}
      : {};
    const summary = item.type === "personas"
      ? [
          "HP " + (src.hp ?? "?") + " / SAN " + (src.san ?? "?") + " / 速度 " + (src.speed || "?"),
          src.passive_name ? "パッシブ：" + src.passive_name + (src.passive_cond ? "（" + src.passive_cond + "）" : "") : "パッシブ情報なし",
          (src.skills || []).length ? "スキル：" + (src.skills || []).map((skill) => skill.name).filter(Boolean).slice(0, 4).join(" / ") : "スキル情報なし"
        ]
      : item.type === "egos"
        ? [
            "ランク " + item.entry.rank + " / SAN " + (src.san_cost ?? src.cost ?? "未設定") + " / 資源 " + (src.resources || src.sin_cost || "未設定"),
            src.passive_name ? "パッシブ：" + src.passive_name + (src.passive_cond ? "（" + src.passive_cond + "）" : "") : "パッシブ情報なし",
            "覚醒：" + summarizeEgoSkill(src.kakusei || src.awakening) + "　侵蝕：" + summarizeEgoSkill(src.shinshoku || src.corrosion)
          ]
        : item.type === "supports"
          ? [
              "スロット：" + (src.slot === "death" ? "死亡後専用" : "通常"),
              "条件：" + (src.cond || "未設定"),
              "効果：" + (src.effect || "未設定"),
              "LP：" + (src.lp || "なし")
            ]
          : item.type === "spirits"
            ? [
                "士気効果：" + (spiritDetail.morale_effect || "未設定"),
                "混乱効果：" + (spiritDetail.confuse_effect || "未設定"),
                "常時効果：" + (spiritDetail.always_effect || "未設定")
              ]
            : [];
    return h("div", { className: "roster-detail", role: "region", "aria-label": `${item.name}の詳細` },
      h("div", { className: "roster-detail-head" }, h("div", null, h("span", { className: "t-label" }, presentation.detailTitle), h("div", { className: "roster-detail-title" }, item.name)), h("button", { className: "btn btn--quiet btn-icon", onClick: () => setDetailId(null), title: "詳細を閉じる", "aria-label": "詳細を閉じる" }, h(Icon, { name: "x", size: 15 }))),
      h("div", { className: "roster-detail-lines" }, summary.map((line, index) => h("div", { key: index }, line))),
      item.type === "personas" && canModifySyncMax && h("div", { className: "roster-sync-ops" },
        h("div", { className: "roster-sync-ops-head" },
          h("span", { className: "t-label" }, "同期設定"),
          h("span", { className: "roster-sync-source", title: "新リンバスTRPG サプリメント P7 / P23" }, "SUPPLEMENT P7 / P23")),
        h("p", { className: "roster-sync-cost-note" }, `初回設定時：同期ランク ${syncCosts?.rank?.shards ?? 50}個 / MAX ${syncCosts?.max?.shards ?? 50}個 · 解除時も返還なし`),
        h("div", { className: "roster-sync-rank-row" },
          h("span", { className: "ledger-note" }, "人格ランク"),
          h("div", { className: "segmented", role: "radiogroup", "aria-label": "同期人格ランク" },
            [[null, "なし"], ["0", "0"], ["00", "00"], ["000", "000"]].map(([value, text]) => h("button", {
              key: String(value), type: "button", role: "radio",
              "aria-checked": (item.entry.syncRank || null) === value,
              className: (item.entry.syncRank || null) === value ? "is-active" : "",
              onClick: () => applySyncRank(item, value)
            }, text)))),
        h("label", { className: `sync-max-detail-toggle${item.entry.syncMax ? " is-on" : ""}`, title: "同期MAXを設定・解除（自我の欠片50個／supplement P7・P23）" },
          h("input", { type: "checkbox", checked: item.entry.syncMax === true, onChange: (event) => applySyncMax(item, event.target.checked) }),
          h("span", { className: "sync-max-detail-label" }, item.entry.syncMax ? "同期MAXを解除する" : "同期MAXとして設定"),
          h("span", { className: "sync-max-detail-note" }, "名称・共有に反映"))),
      h("div", { className: "roster-detail-actions" },
        item.equipped ? h("span", { className: "badge", style: { color: "var(--gold)", borderColor: "var(--gold-line)" } }, "現在装備中") : h(Button, { size: "md", variant: "primary", icon: "check", className: "roster-detail-equip", onClick: () => equipItem(item) }, presentation.equipLabel),
        item.saved && presentation.savedLabel && h("span", { className: "roster-detail-saved" }, presentation.savedLabel)
      )
    );
  };
  const renderItem = (item) => h(React.Fragment, { key: item.id },
    h("div", { className: `roster-item roster-item-selectable${item.equipped ? " is-equipped" : ""}${detailId === item.id ? " is-active" : ""}`, style: { display: "flex", gap: "var(--s-3)", alignItems: "center" } },
      manageMode && h("input", { type: "checkbox", checked: selected.has(item.id), disabled: item.equipped, onClick: (event) => event.stopPropagation(), onChange: () => toggleSelection(item.id), "aria-label": item.equipped ? `${item.name}は装備中のため削除対象外にできません` : `${item.name}を削除対象に選択`, title: item.equipped ? "装備中の項目はライブラリから削除できません" : "削除対象に選択", style: { width: 22, height: 22, accentColor: "var(--gold)", flex: "none" } }),
      h("div", { className: "roster-item-info", role: manageMode ? undefined : "button", tabIndex: manageMode ? -1 : 0, "aria-expanded": manageMode ? undefined : detailId === item.id, onClick: () => openDetail(item), onKeyDown: (event) => { if (!manageMode && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); openDetail(item); } }, title: manageMode ? "削除対象を選択" : item.equipped ? `${item.name}の詳細を${detailId === item.id ? "閉じる" : "開く"}` : `${item.name}${detailId === item.id ? "を装備する" : "の詳細を開く"}`, style: { minWidth: 0, flex: 1, cursor: manageMode ? "default" : "pointer", outlineOffset: 2 } },
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
  const libraryTabLabel = (tab) => (tab === "personas" ? "人格" : tab === "egos" ? "E.G.O" : tab === "supports" ? "サポパ" : tab === "spirits" ? "精神" : "リザルト");
if (typeof window !== "undefined") window.LBT_libraryTabLabel = libraryTabLabel;
  const label = libraryTabLabel(libraryTab);
  /* ヘッダ（タブ帯）は全タブで描画する。ここで早戻りするとタブごと消えて
     他タブへ移る手段が無くなるため、出し分けるのは中身だけにする。 */
  const onLibrary = !["ledger", "inventory"].includes(libraryTab);
  return h("div", { className: "stack-3" },
    h(Card, { className: "record-tabbar" + (onLibrary ? "" : " is-bodyless") },
      h("div", { className: "card-header owned-library-bar", style: { alignItems: "center", flexWrap: "wrap", gap: "var(--s-2)" } }, h("span", { className: "t-label" }, "CHARACTER RECORD / 記録"),       h("div", { className: "segmented", role: "tablist", "aria-label": "記録セクションの種別", style: { marginLeft: "auto" } },
        h("button", { type: "button", role: "tab", "aria-selected": libraryTab === "ledger", className: libraryTab === "ledger" ? "is-active" : "", onClick: () => setLibraryTab("ledger") }, "リザルト"),
        h("button", { type: "button", role: "tab", "aria-selected": libraryTab === "personas", className: libraryTab === "personas" ? "is-active" : "", onClick: () => { setSortBy((prev) => reconcileRosterSortWithTab(prev, "personas")); setLibraryTab("personas"); } }, "人格"),
        h("button", { type: "button", role: "tab", "aria-selected": libraryTab === "egos", className: libraryTab === "egos" ? "is-active" : "", onClick: () => { setSortBy((prev) => reconcileRosterSortWithTab(prev, "egos")); setLibraryTab("egos"); } }, "E.G.O"),
        h("button", { type: "button", role: "tab", "aria-selected": libraryTab === "supports", className: libraryTab === "supports" ? "is-active" : "", onClick: () => setLibraryTab("supports") }, "サポパ"),
        h("button", { type: "button", role: "tab", "aria-selected": libraryTab === "spirits", className: libraryTab === "spirits" ? "is-active" : "", onClick: () => setLibraryTab("spirits") }, "精神"),
        h("button", { type: "button", role: "tab", "aria-selected": libraryTab === "inventory", className: libraryTab === "inventory" ? "is-active" : "", onClick: () => setLibraryTab("inventory") }, "アイテム")
      )),
      onLibrary && h("div", { className: "card-body stack-3" },
        h("div", { className: "roster-library-intro" }, `所持${label}を押すと簡易詳細が開きます。詳細から内容を確認して装備するか、「即時装備」で直ちに装備できます。削除は「管理する」から対象を選ぶため、非装備を一括削除しません。`),
        h("div", { className: "roster-controls" },
          h("div", { className: "segmented", role: "tablist", "aria-label": "所持状態フィルタ" }, [["all", "すべて"], ["custom", "カスタム人格"], ["saved", "保存済み"]].map(([key, text]) => h("button", { key, type: "button", role: "tab", "aria-selected": filter === key, className: filter === key ? "is-active" : "", onClick: () => setFilter(key) }, text))),
          libraryTab === "personas" && h("div", { className: "segmented", role: "tablist", "aria-label": "同期状態フィルタ" }, [["all", "すべて"], ["synced", "同期済み"], ["unsynced", "未同期"]].map(([key, text]) => h("button", { key, type: "button", role: "tab", "aria-selected": syncFilter === key, className: syncFilter === key ? "is-active" : "", onClick: () => setSyncFilter(key) }, text))),
          libraryTab === "personas" && h("div", { className: "segmented", role: "tablist", "aria-label": "同期・MAXフィルタ" }, [["all", "同期・MAXすべて"], ["0", "同期0"], ["00", "同期00"], ["000", "同期000"], ["max", "同期MAX"]].map(([key, text]) => h("button", { key, type: "button", role: "tab", "aria-selected": syncRankFilter === key, className: syncRankFilter === key ? "is-active" : "", onClick: () => setSyncRankFilter(key) }, text))),
          /* 既存アカウントは同期/解析がただのフラグで残ってる。ここで明細を遡って作る。 */
          backfillable > 0 && h(Button, {
            size: "sm", variant: "secondary", icon: "download",
            title: "同期・解析の自我の欠片を、直近のリザルトへ明細として記録します（supplement P7/P23）",
            onClick: () => { dispatch({ type: "BACKFILL_SYNC_ENTRIES" }); toast(`同期・解析の明細を ${backfillable} 件記録しました`); }
          }, `同期・解析の明細を遡って記録（${backfillable}件）`),
          h("label", { className: "roster-sort-control", title: "所持一覧の並び順" }, h("span", { className: "t-label" }, "並び順"), h("select", { className: "select", value: sortBy, onChange: (event) => setSortBy(event.target.value) }, h("option", { value: "added" }, "追加順"), h("option", { value: "name" }, "名前順"), h("option", { value: "number" }, libraryTab === "personas" ? "No.順" : "ランク・No.順"), libraryTab === "personas" && h("option", { value: "sync" }, "同期順"))),
          h("div", { style: { flex: 1 } }),
          manageMode ? h(React.Fragment, null, h(Button, { size: "sm", variant: "ghost", onClick: selectedIds.length === selectableItems.length && selectableItems.length ? clearSelection : selectAll }, selectedIds.length === selectableItems.length && selectableItems.length ? "選択を解除" : "全て選択"), h(Button, { size: "sm", variant: "ghost", onClick: exitManage }, "管理を終了")) : h(Button, { size: "sm", variant: "secondary", icon: "edit", onClick: () => setManageMode(true) }, "管理する")
        ),
        manageMode && h("div", { className: "roster-manage-bar" }, h("span", { style: { color: "var(--warn)" } }, "選択削除"), h("span", null, `${selectedIds.length}件を選択中。装備中の項目は保護されます。`), h("div", { style: { flex: 1 } }), h(Button, { size: "md", variant: "danger", icon: "trash", disabled: !selectedIds.length, onClick: removeSelected }, `${selectedIds.length}件を削除`)),
        /* 空状態の導線はタブごとに書く。2択にすると E.G.O の文言が
           サポパ・精神にもそのまま出てしまう（実際に出ていた）。 */
        (() => {
          const how = libraryTab === "personas" ? "人格を装備"
            : libraryTab === "egos" ? "E.G.Oを所持に追加または装備"
            : libraryTab === "supports" ? "サポートを装備"
            : libraryTab === "spirits" ? "精神を所持に追加"
            : "「アイテム」で追加";
          return items.length === 0
            ? h("div", { className: "empty", style: { padding: "var(--s-5)" } }, filter === "all" ? `所持${label}はまだありません。${how}するとここへ保存されます。` : "この条件に一致する所持項目はありません。")
            : h("div", { className: "stack-2" }, items.map(renderItem));
        })(),
        undo && h("div", { className: "roster-undo-bar" }, h("span", null, `${undo.items.length}件を削除しました。`), h(Button, { size: "sm", variant: "ghost", icon: "undo", onClick: restore }, "元に戻す"))
      )
    ),
    !onLibrary && libraryTab === "ledger" && h(LedgerPanel, { state, dispatch }),
    !onLibrary && libraryTab === "inventory" && h(InventoryPanel, { state, dispatch })
  );
};
/* 所持アイテムの総覧。

   所持には「初期枠から受け取った」ものと「買った」ものがある。買った分は
   ADD_ITEM のときに支出明細が立つので、由来を見せないと記録が読み解けない。
   初期枠の定義は所持ではなく受け取り方の集合で、取り込みは明細を起こさない。 */
const InventoryPanel = ({ state, dispatch }) => {
  const [pickOpen, setPickOpen] = React.useState(false);
  const inventory = Array.isArray(state.inventory) ? state.inventory : [];
  const initialItems = Array.isArray(state.initialItems) ? state.initialItems : [];
  const catalog = [
    ...(window.DB?.items || []),
    ...(window.DB?.specialItems || []).filter((item) => !item.ledgerResource),
    ...(Array.isArray(state.customItems) ? state.customItems : [])
  ];
  const metaOf = (itemId) => catalog.find((item) => item.id === itemId) || {};
  const nameOf = (itemId) => metaOf(itemId).name || String(itemId || "");

  const toggleInitial = (itemId) => {
    const next = initialItems.includes(itemId)
      ? initialItems.filter((id) => id !== itemId)
      : [...initialItems, itemId];
    dispatch({ type: "SET_INITIAL_ITEMS", ids: next });
  };

  const categories = [...new Set(catalog.map((item) => String(item?.category || "その他")))];
  const rows = [...inventory].sort((a, b) => nameOf(a.itemId).localeCompare(nameOf(b.itemId), "ja"));
  const seeded = inventory.filter((entry) => entry.origin === "initial").length;
  const originBadge = (entry) => entry.origin === "initial"
    ? h("span", { className: "badge inv-origin is-initial" }, "初期枠")
    : metaOf(entry.itemId).specialResource
      ? h("span", { className: "badge inv-origin" }, "資源")
      : h("span", { className: "badge inv-origin" }, "購入");

  return h("div", { className: "stack-3" },
    h(Card, null,
      h("div", { className: "card-header owned-library-bar" },
        h("span", { className: "t-label" }, "INITIAL FRAME / 初期枠"),
        h("span", { className: "ledger-note" }, "最初から持っているもの。取り込んでも支出は立ちません")
      ),
      h("div", { className: "card-body stack-2" },
        h("div", { className: "inv-toolbar" },
          h("span", { className: "inv-count" }, `初期枠 ${initialItems.length}件 / 取り込み済み ${seeded}件`),
          h("div", { style: { flex: 1 } }),
          h(Button, { size: "sm", variant: "ghost", onClick: () => setPickOpen((open) => !open) }, pickOpen ? "選ぶのを閉じる" : "初期枠を選ぶ"),
          h(Button, { size: "sm", variant: "primary", icon: "check", disabled: !initialItems.length, onClick: () => dispatch({ type: "APPLY_INITIAL_ITEMS" }) }, "初期枠を取り込む")
        ),
        pickOpen && h("div", { className: "inv-pick" }, categories.map((category) => h("div", { key: category, className: "inv-pick-group" },
          h("span", { className: "t-label" }, category),
          h("div", { className: "inv-pick-list" }, catalog.filter((item) => String(item?.category || "その他") === category).map((item) => h("label", { key: item.id, className: "inv-pick-item" },
            h("input", { type: "checkbox", checked: initialItems.includes(item.id), onChange: () => toggleInitial(item.id) }),
            h("span", null, item.name)
          )))
        )))
      )
    ),
    h(Card, null,
      h("div", { className: "card-header owned-library-bar" },
        h("span", { className: "t-label" }, "ITEM INVENTORY / 所持アイテム"),
        h("span", { className: "ledger-note" }, `${inventory.length}件`)
      ),
      rows.length === 0
        ? h("div", { className: "card-body" }, h("div", { className: "empty" }, "所持アイテムはまだありません。「アイテム」で追加するか、初期枠を取り込むとここへ出ます。"))
        : h("div", { className: "card-body stack-2" }, rows.map((entry) => h("div", { key: entry.uid, className: "inv-row" },
            h("span", { className: "inv-name" }, nameOf(entry.itemId)),
            h("span", { className: "inv-meta" }, String(metaOf(entry.itemId).category || "その他")),
            h("span", { className: "inv-price" }, String(metaOf(entry.itemId).price || "")),
            h("span", { className: "inv-qty" }, `×${entry.quantity}`),
            originBadge(entry)
          )))
    )
  );
};

/* --- 抽出リスト（ガチャの記録）-----------------------------------------
   抽選の結果はバッチ単位で封緘される。1つのバッチに錨は1つだけ、
   結果はハッシュ鎖で連結されている。1件でも編集・削除・並べ替えを
   されれば鎖が切れる。

   この面が表示する「検証済み / 検証に失敗」は飾りではなく、
   実際の verifyBatch の戻り値。飾りにすると、書き換えられた記録に
   「検証済み」と嘘をつくことになる。 */
const DRAW_KIND_LABEL = {
  persona: "人格抽出",
  specialPersona: "特異人格",
  ego: "E.G.O抽出",
  themePack: "特定抽出パック"
};

/* 指紋は先頭と末尾だけ。全文は長すぎて、画面では誰も照合しない。 */
const fingerprint = (hash) => {
  const s = String(hash || "");
  if (s.length <= 16) return s || "—";
  return `${s.slice(0, 8)}…${s.slice(-8)}`;
};

/* 名前から DB の人格へ引く。パックの項目は pack 内の通し番号しか
   持ってないので、所持との突き合わせもここを通す。
   所持は {mode, no} で持つ（名前は持たない）のでキーも mode:no にする。 */
function personaRefByName(name) {
  const hit = String(name || "").trim();
  if (!hit) return null;
  const normal = (window.DB?.normal_personas || []).find((p) => p.name === hit);
  if (normal) return { no: Number(normal.no), mode: "n", key: `n:${Number(normal.no)}` };
  const special = (window.DB?.tokui_personas || []).find((p) => p.name === hit);
  if (special) return { no: Number(special.no), mode: "t", key: `t:${Number(special.no)}` };
  return null;
}

/* テーマパックの項目は、DB に人格データがあるものと無いものが混ざっている。
   無ければ所持には入らない。黙っておくと「払ったのに届いたものがない」
   ように見えるので、理由まで書く。

   判定は「今この瞬間の所持」ではなく記録自身（duplicate / item.kind）で行う。
   所持で判定すると、この抽出で入れたばかりの分まで「所持にある」と出て嘘になる。 */
const safeDrawRecord = (record) =>
  record && typeof record === "object" && !Array.isArray(record) ? record : {};

const drawRecordNote = (record) => {
  const safe = safeDrawRecord(record);
  if (safe.duplicate) return `重複・欠片 ${safe.grantedShards || 0}`;
  const isPack = safe.kind === "themePack" || safe.item?.kind === "themePack";
  if (!isPack) return "";
  /* duplicate が立っていない = 引いた時点で持っていなかった = 所持へ入った。 */
  return personaRefByName(safe.item?.name) ? "所持へ追加" : "記録のみ（DBに人格データ無し）";
};

const drawRecordLine = (record) => {
  const safe = safeDrawRecord(record);
  const item = safe.item && typeof safe.item === "object" && !Array.isArray(safe.item) ? safe.item : {};
  const no = item.no == null ? "" : ` No.${item.no}`;
  const label = safe.kind === "ego" ? `${item.rank || ""}${no}` : `${item.name || ""}${no}`;
  const cost = safe.cost && typeof safe.cost === "object" && !Array.isArray(safe.cost) ? safe.cost : {};
  const paid = cost.lp ? `LP ${cost.lp}` : cost.shards ? `欠片 ${cost.shards}` : "無料";
  return { label: label.trim() || "（名前なし）", paid, note: drawRecordNote(safe) };
};

const DrawLedgerPanel = ({ state }) => {
  const h = React.createElement;
  const G = window.LBT_gachaDraw;
  const batches = React.useMemo(() => (Array.isArray(state.draws) ? state.draws : []), [state.draws]);
  const [openHash, setOpenHash] = React.useState(null);
  const P = window.LBT_gachaProof;
  const I = window.LBT_gachaIdentity;
  const [proofBusy, setProofBusy] = React.useState(null);
  const [proofNote, setProofNote] = React.useState(null);
  const [verifyReport, setVerifyReport] = React.useState(null);

  /* 画像は「見た目」と「埋め込みデータ」の両方を同じ記録から作る。片方だけ
     書き換えた画像（レタッチ等）は、検証時の突き合わせで必ず食い違う。 */
  const buildProofBlob = async (batch) => {
    const chain = G && typeof G.verifyBatch === "function" ? G.verifyBatch(batch) : null;
    const assessment = I && typeof I.assessBatch === "function"
      ? await I.assessBatch(batch, { gacha: window.LBT_gacha, timeoutMs: 4000 })
      : { state: "unverified", reasons: ["署名モジュールが読み込まれていません"] };
    const canvas = document.createElement("canvas");
    P.drawProofCard(canvas, {
      batch,
      assessment,
      chain,
      generatedAt: Date.now(),
      url: location.href.split("?")[0].split("#")[0]
    });
    const blob = await P.canvasToBlob(canvas);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return new Blob([P.embedProof(bytes, P.buildPayload(batch))], { type: "image/png" });
  };

  const saveProof = (batch, blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = P.fileName(batch);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  const makeProof = async (batch, mode) => {
    const key = batch.batchHash || "batch";
    if (!P || proofBusy) return;
    setProofBusy(key);
    setProofNote(null);
    try {
      const blob = await buildProofBlob(batch);
      if (mode === "copy") {
        if (!navigator.clipboard || typeof ClipboardItem === "undefined") {
          setProofNote("このブラウザは画像のコピーに未対応です。保存をご利用ください。");
        } else {
          await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
          setProofNote("証明画像をクリップボードへコピーしました。");
        }
      } else if (mode === "share") {
        const file = new File([blob], P.fileName(batch), { type: "image/png" });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: "抽出証明", text: "LIMBUS BUILD TERMINAL の抽出証明画像です。" });
          setProofNote("共有しました。");
        } else {
          saveProof(batch, blob);
          setProofNote("この端末は直接共有に未対応のため、画像を保存しました。");
        }
      } else {
        saveProof(batch, blob);
        setProofNote("証明画像を保存しました。画像を送るだけで、相手は同じアプリで照合できます。");
      }
    } catch (e) {
      /* 共有ダイアログを閉じただけの AbortError は失敗ではない。 */
      if (!e || e.name !== "AbortError") setProofNote(`証明画像を作れませんでした: ${e.message}`);
    } finally {
      setProofBusy(null);
    }
  };

  const verifyProofFile = async (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file || !P) return;
    setVerifyReport({ state: "checking" });
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const report = await P.verifyPng(bytes, { identity: I, gacha: window.LBT_gacha, timeoutMs: 4000 });
      setVerifyReport(Object.assign({}, report, { fileName: file.name }));
    } catch (e) {
      setVerifyReport({ state: "unverified", reasons: [`画像を読めませんでした: ${e.message}`], batch: null });
    }
  };

  /* 検証は描画のたびに走らせる（記録が動いたときだけ再計算される）。
     合格と書くのに、合格を確かめていない理由がない。 */
  const checked = React.useMemo(() => batches.map((batch) => {
    const v = G && typeof G.verifyBatch === "function" ? G.verifyBatch(batch) : { ok: false, reasons: ["検証器が読み込まれていません"] };
    return { batch, ok: v.ok === true, reasons: v.reasons || [] };
  }), [batches, G]);

  const broken = checked.filter((c) => !c.ok).length;
  const lp = checked.reduce((n, c) => n + sumRecords(c.batch, "lp"), 0);
  const shards = checked.reduce((n, c) => n + sumRecords(c.batch, "shards"), 0);

  return h(Card, { className: "draw-ledger" },
    h("div", { className: "card-header owned-library-bar" },
      h("span", { className: "t-label" }, "抽出リスト"),
      /* 件数は常に書く（0件も0件）。無いことを隠すと、
         「まだ抽っていない」と「記録が消えた」が同じに見える。 */
      h("span", { className: "ledger-note" },
        batches.length === 0
          ? "0件"
          : `${checked.length}件・${checked.length - broken}件のハッシュ鎖が正常`),
      /* 受け取った証明画像を照合する入口。検証はこの端末で完結する
         （相手の環境やサーバーに依存しない）。 */
      h("label", { className: "btn btn-sm", style: { cursor: "pointer" } },
        "証明画像を検証",
        h("input", { type: "file", accept: "image/png", onChange: verifyProofFile, style: { display: "none" } }))),
    h("div", { className: "card-body stack-2" },
      /* 空の理由と次にできることを書く。「まだ無い」だけでは、
         どこで抽するのか分からない。 */
      /* 受け取った証明画像の照合結果。埋め込みデータの一覧を出し、
         画像の見た目と目で突き合わせられるようにする。 */
      verifyReport
        ? h("div", { className: "draw-batch-body", role: "status" },
          h("p", { className: "ledger-note" },
            verifyReport.state === "checking"
              ? "証明画像を照合しています…"
              : `証明画像の検証: ${(P.STATE_LABELS[verifyReport.state]) || verifyReport.state}${verifyReport.fileName ? `（${verifyReport.fileName}）` : ""}`),
          verifyReport.reasons && verifyReport.reasons.length
            ? h("ul", { className: "ledger-warn-list" }, verifyReport.reasons.map((r, i) => h("li", { key: i }, r)))
            : null,
          verifyReport.batch
            ? h("div", null,
              h("p", { className: "ledger-note" },
                `埋め込みデータ: ${(verifyReport.batch.records || []).length}件 / 指紋 ${fingerprint(verifyReport.batch.batchHash)} / 署名者 ${verifyReport.batch.signer && verifyReport.batch.signer.keyId ? verifyReport.batch.signer.keyId : "なし"}`),
              h("p", { className: "ledger-note" },
                "次の一覧は画像に埋め込まれた記録です。画像の表示と一致するか目で照合してください。"),
              h("div", { className: "draw-record-list" },
                (verifyReport.batch.records || []).map((record, i) => {
                  const line = drawRecordLine(record);
                  return h("div", { key: `${record?.hash || i}`, className: "draw-record" },
                    h("span", { className: "draw-record-label" }, line.label),
                    h("span", { className: "draw-record-cost" }, line.paid),
                    line.note ? h("span", { className: "draw-record-note" }, line.note) : null);
                })))
            : null,
          h(Button, { variant: "ghost", size: "sm", onClick: () => setVerifyReport(null) }, "閉じる"))
        : null,
      proofNote
        ? h("p", { className: "ledger-note", role: "status" }, proofNote)
        : null,
      batches.length === 0
        ? h("p", { className: "ledger-empty-note" },
          "まだ抽していません。ショップ > ガチャで抽選すると、結果がハッシュ鎖つきの記録としてここへ残ります。")
        : null,
      /* 合計は「全部が検証できているとき」だけ書く。1件でも改ざんが
         見つかっているのに「支出の証明」と書くと、壊れた記録を
         信用しているように見える。 */
      batches.length > 0 && broken === 0
        ? h("p", { className: "ledger-note" },
          `ハッシュ鎖の整合性は確認済みです（署名・外部ビーコンは未検証）。合計は記録値です。真正性の完全検証は「証明画像を検証」で確認してください。合計 LP ${lp.toLocaleString("ja-JP")} / 欠片 ${shards.toLocaleString("ja-JP")}。`)
        : null,
      broken > 0
        ? h("div", { className: "draw-ledger-broken", role: "alert" },
          h("p", { className: "ledger-note" },
            `${broken}件が検証に失敗しました。保存データを書き換えたか、途中で編集された可能性があります。この記録は「何が引けたか」を証明できません。所持と通帳は抽出した時点のままなので、追記は必要ありません。`))
        : null,
      checked.map(({ batch, ok, reasons }, index) => {
        const records = Array.isArray(batch.records) ? batch.records : [];
        const open = openHash === batch.batchHash;
        const lpSum = sumRecords(batch, "lp");
        const shardSum = sumRecords(batch, "shards");
        return h("div", { key: `${batch.batchHash || "no-hash"}-${index}`, className: `draw-batch${ok ? "" : " is-broken"}` },
          h("button", {
            type: "button",
            className: "draw-batch-head",
            "aria-expanded": open,
            onClick: () => setOpenHash(open ? null : batch.batchHash)
          },
          h("span", { className: "draw-batch-kind" }, DRAW_KIND_LABEL[batch.kind] || batch.kind || "抽出"),
          h("span", { className: "draw-batch-count" }, `${records.length}件`),
          h("span", { className: "draw-batch-cost" },
            [lpSum ? `LP ${lpSum}` : null, shardSum ? `欠片 ${shardSum}` : null].filter(Boolean).join(" / ") || "無料"),
          /* 検証状態は実際の状態なので、色と文字の両方で示す
             （色だけで伝えない）。 */
          h("span", { className: `draw-batch-state${ok ? "" : " is-broken"}` }, ok ? "ハッシュ鎖OK" : "鎖不整合"),
          h("span", { className: "draw-batch-fp" }, fingerprint(batch.batchHash))),
          open && h("div", { className: "draw-batch-body" },
            !ok && h("ul", { className: "ledger-warn-list" },
              reasons.map((r, i) => h("li", { key: i }, r))),
            h("div", { className: "draw-record-list" },
              records.map((record, i) => {
                const line = drawRecordLine(record);
                return h("div", { key: `${record?.hash || i}`, className: "draw-record" },
                  h("span", { className: "draw-record-label" }, line.label),
                  h("span", { className: "draw-record-cost" }, line.paid),
                  line.note ? h("span", { className: "draw-record-note" }, line.note) : null);
              })),
            h("p", { className: "ledger-note" },
              `錨 ${fingerprint(batch.commit)} / 種 ${fingerprint(batch.serverSeed)} / ルール表 ${fingerprint(batch.rulesetHash)}`),
            h("div", { className: "draw-proof-actions" },
              h(Button, { variant: "ghost", size: "sm", disabled: !P || proofBusy === (batch.batchHash || "batch"), onClick: () => makeProof(batch, "save") },
                proofBusy === (batch.batchHash || "batch") ? "作成中…" : "証明画像を保存"),
              h(Button, { variant: "ghost", size: "sm", disabled: !P || proofBusy === (batch.batchHash || "batch"), onClick: () => makeProof(batch, "copy") }, "画像をコピー"),
              h(Button, { variant: "ghost", size: "sm", disabled: !P || proofBusy === (batch.batchHash || "batch"), onClick: () => makeProof(batch, "share") }, "共有"),
              h("span", { className: "ledger-note" }, "結果と検証要素（署名・錨）を1枚にまとめます")))
        );
      }))
  );
};

/* バッチの支出合計。1件ずつ足す（総額を別に持つと、
   抽出の並びが壊れても気がつかない）。 */
function sumRecords(batch, field) {
  const records = Array.isArray(batch?.records) ? batch.records : [];
  return records.reduce((n, r) => n + (Number(r?.cost?.[field]) || 0), 0);
}

const LedgerPanel = ({ state, dispatch }) => {
  /* 通帳。所持したものがどのリザルトで手に入ったかと、LP・欠片の残高を
     「今いくら残っているか」から確認するためのパネル。

     設計の主意:
       - 残高は自動。手入力ではなく収入（リザルト）と支出（明細）から導く
       - 帰属は後から変えられる。購入した瞬間にリザルトを選ばせない
       - ドラッグ&ドロップが主、キーボードからの代替（選択して移動）も用意する
  */
  const [dragId, setDragId] = React.useState(null);
  const [overId, setOverId] = React.useState(null);
  const [movingEntryId, setMovingEntryId] = React.useState(null);
  const [newResult, setNewResult] = React.useState({ name: "", date: "", lp: "", shards: "", tickets: { persona: 0, ego: 0, choice: 0, pack: {} } });
  /* 選択中のパックはフォーム側が持つ。TicketInputs 内で持つと、親が組み立てる
     income に選んだパック名が入らない（内部 state だから）。 */
  const [newResultPack, setNewResultPack] = React.useState("");
  /* 既存カードで「記録 / 修正」を押した対象。カード上へ直接並べるのは
     17パックの項目が毎回開くことになるため、記録は専用画面で行う。 */
  const [ticketPanel, setTicketPanel] = React.useState(null);
  const [ticketDraft, setTicketDraft] = React.useState(null);
  const [ticketPackPick, setTicketPackPick] = React.useState("");
  /* 手動の支出・消耗。DBに価格が無いもの、戦闘で消えたものを記録する。 */
  const [newEntry, setNewEntry] = React.useState({ name: "", kind: "expense", lp: "", shards: "" });
  /* 所持人格リストの一括取込用の状態。 */
  const [heldPaste, setHeldPaste] = React.useState("");
  const [heldScan, setHeldScan] = React.useState({ found: [], unknown: [], unknownCount: 0 });
  /* 取り込みは整備作業なので、既定では閉じておく。 */
  /* 所持人格リストのパネル。記録フォームの「取り込む」から開く。
     単独フラグで、開閉はここで行う。 */
  const [heldOpen, setHeldOpen] = React.useState(false);
  const [importMenuOpen, setImportMenuOpen] = React.useState(false);
  /* 判定できなかった文字列 -> 利用者が選んだ正しい名前。検出時に先に差し込む。 */
  const [heldResolved, setHeldResolved] = React.useState({});
  const [heldPicking, setHeldPicking] = React.useState(null);
  /* 候補に出すときの種別名。利用者がどれを選んでいるか分かるようにする。 */
  const HELD_KIND_LABEL = { persona: "人格", ego: "E.G.O", spirit: "精神", support: "サポート" };
/* 編集画面がincome を作り直すとき、抽出チケットを落とさないようにする。 */
const normalizeResultIncome = (income) => (income && typeof income === "object" ? income : {});
const FUZZY_KIND_LABEL = HELD_KIND_LABEL;
  /* リザルト単位の操作メニューは撤去した。硝子窓の取り込みは全体操作である。
     共有URLのシナリオ群を一括で読むため、リザルト単位では成立しない。
     記録の訂正はカード右上の「編集」から行う。 */
  /* 抽出チケットは卓で報酬として受け取るので、リザルトの収入に種別別に積む。
     どのリザルトを対象にして記録するかを選んでから種別と枚数を決める。 */
  const packs = window.LBT_gachaDraw?.themePacks?.() || [];
  const ticketLabel = (kind, pack) => (window.LBT_ticketLabel ? window.LBT_ticketLabel(kind, pack) : (window.LBT_TICKET_KIND_LABEL?.[kind] || "抽出チケット"));
  /* このリザルトの収入に入っている抽出チケット（消費前の受領数）。 */
  const resultTicketChips = (result) => {
    const inc = result.income?.tickets || {};
    const rows = ["persona", "ego", "choice"]
      .filter((kind) => Number(inc[kind]) > 0)
      .map((kind) => ({ key: kind, kind, pack: null, count: Number(inc[kind]) }));
    for (const [pack, count] of Object.entries(inc.pack || {})) {
      if (Number(count) > 0) rows.push({ key: `pack:${pack}`, kind: "pack", pack, count: Number(count) });
    }
    return rows.map((r) => ({ ...r, label: ticketLabel(r.kind, r.pack) }));
  };
  /* 種別ごとの入力欄。harvest は現在値、書き換えは onChange に委ねる。
     記録フォームでは newResult に蓄え、既存カードではその場で差分だけ送る。 */
  const TicketInputs = ({ current, onChange, idPrefix, packPick, setPackPick }) => {
    const pickPack = packPick || packs[0]?.name || "";
    return h("div", { className: "ledger-ticket-inputs" },
      h("span", { className: "t-label" }, "抽出チケット（卓の報酬）"),
      h("div", { className: "ledger-ticket-grid" },
        ["persona", "ego", "choice"].map((kind) => h("label", { key: kind, className: "ledger-ticket-field" },
          h("span", null, ticketLabel(kind)),
          h("input", {
            className: "ledger-input ledger-input--num",
            id: `${idPrefix}-${kind}`,
            type: "number", min: "0", inputMode: "numeric",
            value: String(Number(current?.[kind]) || 0),
            "aria-label": `${ticketLabel(kind)} の枚数`,
            onChange: (e) => onChange({ ...current, [kind]: Number(e.target.value) || 0 })
          }))),
        packs.length > 0 && h("label", { className: "ledger-ticket-field" },
          h("span", null, "特定抽出パック"),
          h("select", {
            className: "select",
            value: pickPack,
            "aria-label": "特定抽出パックの選択",
            onChange: (e) => setPackPick(e.target.value)
          }, packs.map((p) => h("option", { key: p.name, value: p.name }, p.name)))),
        packs.length > 0 && h("label", { className: "ledger-ticket-field" },
          h("span", null, ticketLabel("pack", pickPack)),
          h("input", {
            className: "ledger-input ledger-input--num",
            id: `${idPrefix}-pack`,
            type: "number", min: "0", inputMode: "numeric",
            value: String(Number(current?.pack?.[pickPack]) || 0),
            "aria-label": `${ticketLabel("pack", pickPack)} の枚数`,
            onChange: (e) => onChange({ ...current, pack: { ...current?.pack, [pickPack]: Number(e.target.value) || 0 } })
          }))));
  };
  /* 硝子窓からの取り込み（入力方向）。出力方向は撤去した。 */
  const [importPanel, setImportPanel] = React.useState(false);
  const [importNote, setImportNote] = React.useState(null);
  /* 手打ちの記録をテキストで流し込む画面。硝子窓 版と同じく、
     貼っただけでは確定せず、作れる内容を確認してから入れる。 */
  const [textPanel, setTextPanel] = React.useState(false);
  const [textDraft, setTextDraft] = React.useState("");
  const [textExcluded, setTextExcluded] = React.useState(() => new Set());
  /* 結果ログ内の人格候補。候補選択と除外は貼り付け中だけ保持する。 */
  const [textIdentityExcluded, setTextIdentityExcluded] = React.useState(() => new Set());
  const [textIdentityResolved, setTextIdentityResolved] = React.useState({});
  /* 種別が不明なチケットは自動推測しない。プレビューでユーザーが選んだ分類だけを取込案へ反映する。 */
  const [textTicketResolved, setTextTicketResolved] = React.useState({});
  /* 残高差分・費用配分の警告は、原文を確認した利用者が警告単位で閉じられる。
     入力が変わったら必ず解除して、古い確認状態が新しい内容へ流用されないようにする。 */
  const [dismissedTextWarnings, setDismissedTextWarnings] = React.useState(() => new Set());

  /* 取り込み（硝子窓）はリザルト個別ではなくアカウント全体の操作として
   アカウント選択画面で行う。ここでは扱わない。 */
  const [editing, setEditing] = React.useState(null);

  const [resultQuery, setResultQuery] = React.useState("");
  const [resultSort, setResultSort] = React.useState("newest");
  const [resultPage, setResultPage] = React.useState(0);

  /* 取り込み画面は一つだけ表示する。切り替え時に他のパネルと旧結果通知を閉じる。 */
  const switchResultTool = (mode) => {
    setImportMenuOpen(false);
    setImportPanel(mode === "glass");
    setTextPanel(mode === "text");
    setHeldOpen(mode === "held");
    setImportNote(null);
    setTicketPanel(null);
    setTicketDraft(null);
    setDismissedTextWarnings(new Set());
  };
  /* 取り込みパネルは記録一覧の末尾に追加されるため、切替後に視界外のまま残りやすい。
     パネルへスクロールし、入力にすぐ移れるよう最初の欄にフォーカスする。 */
  const activeResultTool = importPanel ? "glass" : textPanel ? "text" : heldOpen ? "held" : null;
  React.useEffect(() => {
    if (!activeResultTool) return;
    const raf = requestAnimationFrame(() => {
      let panel = null;
      if (activeResultTool === "glass") panel = document.getElementById("ledger-glass-import-panel");
      else if (activeResultTool === "text") panel = document.getElementById("ledger-text-import-panel");
      else panel = document.querySelector(".ledger-gara-wrap .ledger-held-paste")?.closest(".ledger-gara-wrap") || null;
      if (!panel) return;
      const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
      panel.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
      const firstField = panel.querySelector("textarea, input:not([type='hidden']), select, [role='combobox']");
      firstField?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(raf);
  }, [activeResultTool]);
  const openHeld = () => switchResultTool("held");
  const closeHeld = () => setHeldOpen(false);

  const openResultEditor = (result) => {
    setImportMenuOpen(false);
    setImportPanel(false);
    setTextPanel(false);
    setHeldOpen(false);
    setImportNote(null);
    const currentTickets = result.income && result.income.tickets || {};
    setTicketPackPick(Object.keys(currentTickets.pack || {})[0] || packs[0]?.name || "");
    setTicketPanel(result.id);
    setTicketDraft({
      id: result.id,
      name: String(result.name || ""),
      date: String(result.date || ""),
      lp: String(result.income?.lp ?? 0),
      shards: String(result.income?.shards ?? 0),
      tickets: {
        persona: String(Number(currentTickets.persona) || 0),
        ego: String(Number(currentTickets.ego) || 0),
        choice: String(Number(currentTickets.choice) || 0),
        pack: { ...(currentTickets.pack || {}) }
      }
    });
  };
  const cancelResultEditor = () => { setTicketPanel(null); setTicketDraft(null); };
  const updateResultDraftField = (field, value) => {
    setTicketDraft((draft) => draft ? { ...draft, [field]: value } : draft);
  };
  const updateResultDraftTicket = (kind, value) => {
    setTicketDraft((draft) => draft ? { ...draft, tickets: { ...draft.tickets, [kind]: value } } : draft);
  };
  const updateResultDraftPack = (pack, value) => {
    setTicketDraft((draft) => draft ? {
      ...draft, tickets: { ...draft.tickets, pack: { ...(draft.tickets.pack || {}), [pack]: value } }
    } : draft);
  };
  const saveResultEditor = (result) => {
    const draft = ticketDraft;
    if (!draft || draft.id !== result.id) return;
    const nonNegativeInteger = (value) => Math.max(0, Math.floor(Number(value) || 0));
    const nextPack = Object.fromEntries(
      Object.entries(draft.tickets?.pack || {})
        .map(([name, count]) => [name, nonNegativeInteger(count)])
        .filter(([, count]) => count > 0)
    );
    const nextTickets = {
      persona: nonNegativeInteger(draft.tickets?.persona),
      ego: nonNegativeInteger(draft.tickets?.ego),
      choice: nonNegativeInteger(draft.tickets?.choice),
      pack: nextPack
    };
    const name = String(draft.name || "").trim() || result.name;
    dispatch({
      type: "UPDATE_RESULT",
      id: result.id,
      name,
      date: String(draft.date || "").slice(0, 10),
      income: {
        ...normalizeResultIncome(result.income),
        lp: Math.max(0, Number(draft.lp) || 0),
        shards: Math.max(0, Number(draft.shards) || 0),
        tickets: nextTickets
      }
    });
    toast("「" + name + "」のリザルトを更新しました");
    cancelResultEditor();
  };

  const results = Array.isArray(state.results) ? state.results : [];
  const RESULTS_PAGE_SIZE = 24;
  const searchNeedle = String(resultQuery || "").trim().toLocaleLowerCase("ja-JP");
  const matchingResults = results.filter((result) => {
    if (!searchNeedle) return true;
    const searchable = [result.name, result.date, result.income?.lp, result.income?.shards]
      .map((value) => String(value ?? "")).join(" ").toLocaleLowerCase("ja-JP");
    return searchable.includes(searchNeedle);
  });
  const sortedResults = [...matchingResults].sort((a, b) => {
    if (resultSort === "name") return String(a.name || "").localeCompare(String(b.name || ""), "ja");
    const stamp = (result) => {
      const parsed = Date.parse(String(result.date || "") + "T00:00:00Z");
      return Number.isFinite(parsed) ? parsed : (Number(result.createdAt) || 0);
    };
    const difference = stamp(a) - stamp(b);
    if (difference) return resultSort === "oldest" ? difference : -difference;
    const createdDifference = (Number(a.createdAt) || 0) - (Number(b.createdAt) || 0);
    return resultSort === "oldest" ? createdDifference : -createdDifference;
  });
  const resultPageCount = Math.max(1, Math.ceil(sortedResults.length / RESULTS_PAGE_SIZE));
  const safeResultPage = Math.min(resultPage, resultPageCount - 1);
  const pageResults = sortedResults.slice(
    safeResultPage * RESULTS_PAGE_SIZE,
    (safeResultPage + 1) * RESULTS_PAGE_SIZE
  );
  const entries = Array.isArray(state.entries) ? state.entries : [];
  const balance = window.LBT_computeLedgerBalance
    ? window.LBT_computeLedgerBalance(results, entries)
    : { lp: 0, shards: 0, unclassified: 0 };

/* 残額は全明細から求める。削除は Undo/Redo が効くので、
/* 取り消し用の操作槽は置かない。 */
  const unclassified = entries.filter((e) => !e.resultId);
  const movingEntry = movingEntryId ? entries.find((entry) => entry.id === movingEntryId) || null : null;

  /* リザルトごとの明細と支出合計。導出なので保存しない。 */
  const byResult = (id) => entries.filter((e) => e.resultId === id);
  const sumOf = (list) => list.reduce(
    (acc, e) => ({ lp: acc.lp + (Number(e?.cost?.lp) || 0), shards: acc.shards + (Number(e?.cost?.shards) || 0) }),
    { lp: 0, shards: 0 }
  );

  /* 種別 ID を表示名へ。未知の ID はそのまま出す（壊れた表示にしない）。 */
  const kindLabel = (id) => {
    const hit = (window.LBT_LEDGER_ENTRY_KINDS || []).find((k) => k.id === id);
    return hit ? hit.label : id || "その他";
  };
  /* 帰属の移動。ドラッグ中のIDは state と dataTransfer の両方に持たせる。
     state だけだと、ドラッグ中に再レンダーが入ったときに古い値を参照して
     drop が無音で失敗する。dataTransfer はドラッグ操作そのものが持つ値なので、
     その操作の中では常に正しい。 */
  const LEDGER_DRAG_MIME = "application/x-lbt-ledger-entry";
  const moveEntry = (id, resultId) => {
    if (!id) return;
    const existing = (Array.isArray(state.entries) ? state.entries : []).find((entry) => entry.id === id);
    const nextResultId = resultId || null;
    if (!existing || (existing.resultId || null) !== nextResultId) {
      dispatch({ type: "SET_ENTRY_RESULT", id, resultId: nextResultId });
      toast(nextResultId ? "明細をリザルトへ移動しました" : "明細を未分類へ戻しました");
    }
    setDragId(null);
    setOverId(null);
    setMovingEntryId(null);
  };
  /* ドラッグが難しいタッチ環境／キーボード向け。明細を選んでから移動先カードを押す。 */
  const startMoveEntry = (entry) => {
    setDragId(null);
    setOverId(null);
    setMovingEntryId((current) => current === entry.id ? null : entry.id);
  };
  const cancelMoveEntry = () => setMovingEntryId(null);
  /* 行のドラッグ属性。未分類とリザルトで同じものを使う。 */
const dragProps = (entry) => ({
  draggable: true,
  onDragStart: (e) => {
    setMovingEntryId(null);
    setDragId(entry.id);
    try { e.dataTransfer?.setData(LEDGER_DRAG_MIME, entry.id); } catch (_) { /* 旧Browserは無視 */ }
    try { e.dataTransfer && (e.dataTransfer.effectAllowed = "move"); } catch (_) {}
  },
  onDragEnd: () => { setDragId(null); setOverId(null); setMovingEntryId(null); }
});
const readDragId = (event) => {
    try {
      return event?.dataTransfer?.getData(LEDGER_DRAG_MIME) || dragId;
    } catch (_) {
      return dragId;
    }
  };

  const addResult = () => {
    const name = String(newResult.name || "").trim();
    if (!name) return;
    dispatch({
      type: "ADD_RESULT",
      name,
      date: newResult.date || "",
        income: {
          lp: Number(newResult.lp) || 0,
          shards: Number(newResult.shards) || 0,
          tickets: newResult.tickets || { persona: 0, ego: 0, choice: 0, pack: {} }
        },
      });
      setNewResult({ name: "", date: "", lp: "", shards: "", tickets: { persona: 0, ego: 0, choice: 0, pack: {} } });
      setResultPage(0);
  };

/* 硝子窓の読み込み結果をアカウント全体へ入れる。
   人格・E.G.O・サポート・パッシブ・精神・アイテムが manifest 経由で並ぶ。
   1件のリザルトへ押し込まない（持ち主のない所持と帰属のない支出が残るため）。
   APPLY_IMPORT_BATCH が ADD_RESULT と ADD_ENTRY の紐付けを解決し、Undo 1 回で戻る。 */
const applyGarasumadoImport = (applied) => {
  const actions = applied?.actions || applied?.rosterActions || [];
  if (!actions.length) { toast("取り込むものが選ばれていません"); return; }
  const detail = { actions, skipped: Array.isArray(applied.skipped) ? [...applied.skipped] : [] };
  window.dispatchEvent(new CustomEvent("lbt:apply-import", { detail }));
  const accepted = Array.isArray(detail.actions) ? detail.actions : [];
  const skipped = Array.isArray(detail.skipped) ? detail.skipped : [];
  const byType = {};
  for (const action of accepted) byType[action.type] = (byType[action.type] || 0) + 1;
  setImportNote({
    summary: Object.entries(byType).map(([key, count]) => (IMPORT_TYPE_LABEL[key] || key) + " " + count + "件").join("・"),
    skipped: skipped.slice(0, 12),
    skippedCount: skipped.length
  });
};
const IMPORT_TYPE_LABEL = {
    ADD_GARASUMADO_PERSONA: "硝子窓人格", ADD_ROSTER: "人格", ADD_ROSTER_EGO: "E.G.O", ADD_ROSTER_SUPPORT: "パッシブ",
    ADD_ROSTER_SPIRIT: "精神", ADD_ITEM_INVENTORY: "アイテム",
    ADD_RESULT: "リザルト", ADD_ENTRY: "明細"
  };

/* テキスト流し込みの解析結果。入力が変わるたびに読み直す。 */
const parsedText = React.useMemo(() => {
    if (!textPanel || !textDraft.trim()) return null;
    const api = window.LBT_textImport;
    return api ? api.parseText(textDraft) : null;
  }, [textPanel, textDraft]);
/* 貼り付けた文字列から、明細の名前を DB へ引く。取れれば名称を DB 名のまま使う
   （表記ゆれで明細が二重に増えないように）。索引の組み立ては 1 回だけ。 */
const spendNameIndex = React.useMemo(() => {
    if (!textPanel) return null;
    const db = (typeof window !== "undefined" && window.DB) || null;
    return db && window.LBT_buildNameIndex ? (window.LBT_buildNameIndex(db, {}) || null) : null;
  }, [textPanel]);
const resolveSpendName = React.useCallback((name) => {
    if (!spendNameIndex || typeof window.LBT_resolveCandidates !== "function") return null;
    try { return window.LBT_resolveCandidates(spendNameIndex, name)?.[0] || null; } catch (_) { return null; }
  }, [spendNameIndex]);
/* テキスト記録にある取得品は、アイテム名・別名の完全一致だけで所持へ入れる。
   部分一致で似た別アイテムを増やすことは避ける。 */
const resolveTextItem = React.useCallback((name) => {
    const keyOf = (value) => String(value || "").normalize("NFKC").replace(/[\s・･]/g, "").toLocaleLowerCase("ja");
    const key = keyOf(name);
    if (!key) return null;
    const catalog = [
      ...(window.DB?.items || []),
      ...(window.DB?.specialItems || []).filter((item) => !item?.ledgerResource),
      ...(Array.isArray(state.customItems) ? state.customItems : [])
    ];
    const hits = catalog.filter((item) => {
      if (!item?.id || !item?.name || item.ledgerResource) return false;
      return keyOf(item.name) === key
        || keyOf(item.id) === key
        || (Array.isArray(item.searchAliases) && item.searchAliases.some((alias) => keyOf(alias) === key));
    });
    const unique = [...new Map(hits.map((item) => [String(item.id), item])).values()];
    if (unique.length !== 1) return null;
    const hit = unique[0];
    return { itemId: String(hit.id), itemName: String(hit.name), ledgerResource: hit.ledgerResource || null };
  }, [state.customItems]);
/* 備考に書かれた「アイテム名×N 使用/消費」も正規カタログに完全一致した場合だけ拾う。 */
const resolveTextItemUse = React.useCallback((rawLine) => {
    const source = String(rawLine || "").normalize("NFKC").toLocaleLowerCase("ja");
    const operationPositions = ["使用", "消費"].map((word) => source.indexOf(word)).filter((n) => n >= 0);
    if (!operationPositions.length) return null;
    const operationAt = Math.min(...operationPositions);
    const catalog = [
      ...(window.DB?.items || []),
      ...(window.DB?.specialItems || []).filter((item) => !item?.ledgerResource),
      ...(Array.isArray(state.customItems) ? state.customItems : [])
    ].filter((item) => item?.id && item?.name && !item.ledgerResource);
    const matches = [];
    for (const item of catalog) {
      const terms = [item.name, ...(Array.isArray(item.searchAliases) ? item.searchAliases : [])]
        .filter(Boolean).map((term) => String(term).normalize("NFKC").toLocaleLowerCase("ja"));
      for (const term of terms) {
        const at = source.indexOf(term);
        if (at >= 0 && at < operationAt) matches.push({ item, term, at });
      }
    }
    if (!matches.length) return null;
    matches.sort((a, b) => b.term.length - a.term.length);
    const longest = matches[0].term.length;
    const winners = [...new Map(matches.filter((m) => m.term.length === longest).map((m) => [String(m.item.id), m])).values()];
    if (winners.length !== 1) return null;
    const match = winners[0];
    const suffix = source.slice(match.at + match.term.length, operationAt);
    const countMatch = suffix.match(/[x×]\s*(\d[\d,]*)|(?:^|\s)(\d[\d,]*)\s*(?:個|つ)/i);
    const quantity = countMatch ? Number((countMatch[1] || countMatch[2]).replace(/,/g, "")) : 1;
    if (!Number.isSafeInteger(quantity) || quantity <= 0) return null;
    return { itemId: String(match.item.id), itemName: String(match.item.name), quantity, reason: "consumption" };
  }, [state.customItems]);
const textPlan = React.useMemo(() => {
    const api = window.LBT_textImport;
    if (!api || !parsedText) return null;
    const ownedPersonas = new Set((state.roster?.personas || []).map((p) => `${p.mode}:${p.no}`));
    const ownedEgos = new Set((state.roster?.egos || []).map((e) => `${e.rank}:${e.no}`));
    const ownedSupports = new Set((state.roster?.supports || []).map((s) => String(s.name || "")));
    const ownedSpirits = new Set((state.roster?.spirits || []).map((s) => String(s.name || "")));
    const suggestPersona = (line) => {
      try {
        return (window.LBT_fuzzyNameCandidatesAcross?.(window.DB, line, 6) || [])
          .filter((candidate) => candidate?.kind === "persona");
      } catch (_) { return []; }
    };
    return api.plan(parsedText, {
      resolve: resolveSpendName,
      excluded: textExcluded,
      excludedIdentities: textIdentityExcluded,
      identityResolved: textIdentityResolved,
      ticketResolved: textTicketResolved,
      ownedPersonas,
      ownedEgos,
      ownedSupports,
      ownedSpirits,
      ownedItems: new Map((state.inventory || []).map((item) => [String(item.itemId || ""), Number(item.quantity) || 0])),
      resolveItem: resolveTextItem,
      resolveItemUse: resolveTextItemUse,
      suggestPersona
    });
  }, [parsedText, textExcluded, textIdentityExcluded, textIdentityResolved, textTicketResolved, resolveSpendName, resolveTextItem, resolveTextItemUse,
    state.roster?.personas, state.roster?.egos, state.roster?.supports, state.roster?.spirits, state.inventory]);

const textWarningKey = (warning) => [
  warning?.recordTitle || "",
  warning?.kind || "warning",
  warning?.text || warning?.name || warning?.key || "",
  warning?.reason || ""
].join("::");
const isReviewableTextWarning = (warning) => [
  "balance-mismatch", "balance-mismatch-pack", "balance-ambiguous",
  "expense-allocation-review", "expense-total-mismatch"
].includes(warning?.kind);
const visibleTextWarnings = (textPlan?.skipped || []).filter((warning) =>
  !isReviewableTextWarning(warning) || !dismissedTextWarnings.has(textWarningKey(warning))
);

const textTicketResolutionKey = (recordIndex, ticket) =>
  window.LBT_textImport?.ticketResolutionKey?.(recordIndex, ticket)
  || `${recordIndex}:${String(ticket?.sourceLine || "").trim()}::${String(ticket?.raw || "").trim()}`;
const textTicketLabel = (ticket) => {
  if (ticket?.kind === "persona") return "人格抽出チケット";
  if (ticket?.kind === "ego") return "E.G.O抽出チケット";
  if (ticket?.kind === "choice") return "選択抽出チケット";
  if (ticket?.kind === "pack") return ticket.pack ? `テーマパック権「${ticket.pack}」` : "テーマパック権（パック未特定）";
  return "種別未確定チケット";
};
const textTicketSummary = (tickets, recordIndex) => (tickets || [])
  .map((ticket) => {
    const override = textTicketResolved[textTicketResolutionKey(recordIndex, ticket)];
    return `${textTicketLabel(override?.kind ? { ...ticket, ...override } : ticket)} ×${ticket.count}`;
  }).join("・");
const textUnknownTicketsForRecord = (record, recordIndex) => {
  const seen = new Set();
  const out = [];
  for (const ticket of [...(record?.tickets || []), ...(record?.ticketUses || [])]) {
    if (ticket?.kind && !(ticket.kind === "pack" && !String(ticket.pack || "").trim())) continue;
    const key = textTicketResolutionKey(recordIndex, ticket);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ticket, key });
  }
  return out;
};

/* テキストの取り込み。硝子窓 版と同じ取り込み口を使うので、
   APPLY_IMPORT_BATCH の紐付けと Undo 1 回がそのまま効く。 */
const applyTextImport = () => {
  if (!textPlan || !textPlan.actions.length) { toast("取り込めるものがありません"); return; }
  const detail = {
    actions: textPlan.actions,
    skipped: (Array.isArray(textPlan.skipped) ? textPlan.skipped : [])
      .filter((warning) => !isReviewableTextWarning(warning) || !dismissedTextWarnings.has(textWarningKey(warning)))
  };
  window.dispatchEvent(new CustomEvent("lbt:apply-import", { detail }));
  const accepted = Array.isArray(detail.actions) ? detail.actions : [];
  const skipped = Array.isArray(detail.skipped) ? detail.skipped : [];
  const results = accepted.filter((action) => action.type === "ADD_RESULT").length;
  const entries = accepted.filter((action) => action.type === "ADD_ENTRY").length;
  const items = accepted.filter((action) => action.type === "ADD_ITEM_INVENTORY").length;
  const personas = accepted.filter((action) => action.type === "ADD_ROSTER").length;
  const egos = accepted.filter((action) => action.type === "ADD_ROSTER_EGO").length;
  const supports = accepted.filter((action) => action.type === "ADD_ROSTER_SUPPORT").length;
  const spirits = accepted.filter((action) => action.type === "ADD_ROSTER_SPIRIT").length;
  setImportNote({
    summary: IMPORT_TYPE_LABEL.ADD_RESULT + " " + results + "件・" + IMPORT_TYPE_LABEL.ADD_ENTRY + " " + entries + "件"
      + (personas ? "・人格 " + personas + "件" : "")
      + (egos ? "・E.G.O " + egos + "件" : "")
      + (supports ? "・サポートパッシブ " + supports + "件" : "")
      + (spirits ? "・精神 " + spirits + "件" : "")
      + (items ? "・アイテム " + items + "件" : ""),
    skipped: skipped.slice(0, 12),
    skippedCount: skipped.length
  });
  setTextPanel(false);
  setTextDraft("");
  setTextExcluded(new Set());
  setTextIdentityExcluded(new Set());
  setTextIdentityResolved({});
  setTextTicketResolved({});
  setDismissedTextWarnings(new Set());
};

/* 手動支出・消耗の記録。帰属は未分類で入れる（後からドラッグで振る）。 */
const addEntry = () => {
  const name = String(newEntry.name || "").trim();
  if (!name) return;
  dispatch({
    type: "ADD_ENTRY",
    kind: newEntry.kind,
    name,
    cost: { lp: Number(newEntry.lp) || 0, shards: Number(newEntry.shards) || 0 },
    resultId: null
  });
  setNewEntry({ name: "", kind: newEntry.kind, lp: "", shards: "" });
};

/* 所持人格リストの一括取込。ゲーム内外のリストを貼り付けても、
   DB の名前と照合して「所持している人格」だけを拾う。
   1行1件でも、空白・カンマ区切りでも読め、表記ゆれ（全角/半角・空白）は
   吸収する。検出できたものは取り込み前に一覧で提示し、
   何を足すかをユーザーに見せた上で実行する（黙って所持を増やさない）。 */
const PERSONA_NAME_KEY = (name) => String(name || "").replace(/[\s\u3000]+/g, "").toLowerCase();
const PERSONA_BOUNDARY = /[\u3001,\uFF0C\/\uFF0F|]/;

/* 名前が1文字違えば完全一致は当たらない。候補が0になると利用者が選べないので、
   1文字でも一致する名前を出し、一致した文字数順に並べる。
   一致数だけだと「部」だけの名前が上に来るので、連続一致の長さを優先する。 */
const OVERLAP_MIN_CHARS = 2;
const OVERLAP_MIN_RATIO = 0.25;
const OVERLAP_LIMIT = 10;
const overlapCandidates = (index, raw) => {
  const text = PERSONA_NAME_KEY(raw);
  if (!text || text.length < 2) return [];
  const chars = [...new Set(text.replace(/\s+/g, ""))];
  if (chars.length < OVERLAP_MIN_CHARS) return [];
  const scored = [];
  const seen = new Set();
  for (const [key, rec] of index) {
    const packed = key.replace(/\s+/g, "");
    if (packed.length < 2) continue;
    let hit = 0;
    for (const c of chars) if (packed.includes(c)) hit += 1;
    if (hit === 0) continue;
    const ratio = hit / chars.length;
    /* 1文字しか一致しないのは偶然なので出さない。 */
    if (hit < OVERLAP_MIN_CHARS && ratio < OVERLAP_MIN_RATIO) continue;
    if (seen.has(rec.name)) continue;
    let bestRun = 0;
    let run = 0;
    for (const c of chars) {
      if (packed.includes(c)) { run += 1; if (run > bestRun) bestRun = run; }
      else run = 0;
    }
    seen.add(rec.name);
    scored.push({ rec, hit, bestRun, ratio, score: hit + bestRun * 2 + ratio * 2 });
  }
  scored.sort((a, b) => (b.score - a.score) || b.hit - a.hit || String(a.rec.name).length - String(b.rec.name).length);
  return scored.slice(0, OVERLAP_LIMIT).map((s) => ({
    name: s.rec.name,
    kind: s.rec.kind,
    no: s.rec.no,
    rank: s.rec.rank,
    mode: s.rec.mode,
    slot: s.rec.slot,
    overlap: s.hit,
    ratio: Math.round(s.ratio * 100)
  }));
};

const scanHeldPersonas = (text, resolved) => {
  const tokui = window.DB?.tokui_personas || [];
  const index = new Map();
  /* 所持に入れられるものは全部ここで引く。精神も E.G.O もパッシブも
     貼り付けた人が Candida と同じ扱いにする（種別だけが違う）。 */
  const sources = [
    [window.DB?.normal_personas || [], "persona"],
    [tokui, "persona"],
    [window.DB?.egos || [], "ego"],
    [window.DB?.spirits || [], "spirit"],
    [window.DB?.support_passives || [], "support"],
    [window.DB?.death_passives || [], "support"]
  ];
  for (const [list, kind] of sources) {
    for (const p of list) {
      if (!p || !p.name) continue;
      const key = PERSONA_NAME_KEY(p.name);
      if (!key || index.has(key)) continue;
      index.set(key, kind === "persona"
        ? { no: p.no, name: p.name, mode: list === tokui ? "t" : "n", kind }
        : { no: p.no, name: p.name, rank: p.rank, kind, slot: kind === "support" && /死/.test(p.name) ? "death" : "normal" });
    }
  }
  const owned = {
    persona: new Set((state.roster?.personas || []).map((p) => `${p.mode}:${p.no}`)),
    ego: new Set((state.roster?.egos || []).map((e) => `${e.rank}:${e.no}`)),
    spirit: new Set((state.roster?.spirits || []).map((s) => s.name)),
    support: new Set((state.roster?.supports || []).map((s) => s.name))
  };
  const keyOf = (rec) => (rec.kind === "persona" ? `${rec.mode}:${rec.no}`
    : rec.kind === "ego" ? `${rec.rank}:${rec.no}`
    : rec.name);
  const found = [];
  const seen = new Set();
  const unknown = [];
  const hit = (label) => {
    const rec = index.get(PERSONA_NAME_KEY(label));
    if (!rec) return false;
    const uniq = keyOf(rec);
    if (!seen.has(uniq)) { seen.add(uniq); found.push({ ...rec, owned: owned[rec.kind]?.has(uniq) }); }
    return true;
  };
  /* 行全体 -> 境界の左右 の順で試して、最初に一致した位置でだけ分割する。
     そうしないと「N社E.G.O:軽蔑、畏敬」が2つに割れて両方とも取りこぼす。 */
  const consume = (chunk, depth) => {
    const rest = String(chunk || "").trim();
    if (!rest || depth > 64) return;
    /* 利用者が候補から選んだものは、貼り付けた文字列より先に確定させる。 */
    if ((resolved || {})[rest] && hit(resolved[rest])) return;
    if (hit(rest)) return;
    const bounds = [];
    for (let i = 0; i < rest.length; i++) if (PERSONA_BOUNDARY.test(rest[i])) bounds.push(i);
    for (const at of bounds) {
      const head = rest.slice(0, at);
      if (head && index.has(PERSONA_NAME_KEY(head))) {
        hit(head);
        consume(rest.slice(at + 1), depth + 1);
        return;
      }
    }
    /* 空白は名前に含まれる（双鉤海賊団 組員B）ので主経路にしない。
       他の切り方が全て外れた後の救済としてだけ試す。 */
    {
      const spaces = [];
      for (let i = 0; i < rest.length; i++) if (/[\s\u3000]/.test(rest[i])) spaces.push(i);
      for (const at of spaces) {
        const head = rest.slice(0, at);
        if (head && index.has(PERSONA_NAME_KEY(head))) {
          hit(head);
          consume(rest.slice(at + 1), depth + 1);
          return;
        }
      }
    }
    /* どの切り方でも1件にならない。先頭の区切りで切って残りを回す。 */
    const first = bounds[0];
    const left = first === undefined ? rest : rest.slice(0, first);
    /* 「候補が1つも無い」は異常なので、ここで底线を引く。
       上記の index は完全一致のみ。名前が1文字違えば candidate は空になり、
       利用者が選べなくなる。そこで 1 文字でも一致する名前を出し、
       一致した文字数順に並べる（Hubi 側で選ぶ）。 */
    unknown.push({ text: left, candidates: overlapCandidates(index, left) });
    if (first !== undefined) consume(rest.slice(first + 1), depth + 1);
  };

  for (const line of String(text || "").split(/[\n\r]+/)) consume(line, 0);
  return { found, unknown: unknown.slice(0, 20), unknownCount: unknown.length };
};

const importHeldPersonas = () => {
    const targets = heldScan.found.filter((p) => !p.owned);
    if (!targets.length) return;
    /* 種別ごとに所持追加の入口へ渡す。テキストから拾った既存の所持は
       購入ではないので、購入フラグを明示して明細を立てない。 */
    for (const p of targets) {
      if (p.kind === "ego") dispatch({ type: "ADD_ROSTER_EGO", no: p.no, rank: p.rank });
      else if (p.kind === "spirit") dispatch({ type: "ADD_ROSTER_SPIRIT", spirit: { name: p.name }, purchase: false });
      else if (p.kind === "support") dispatch({ type: "ADD_ROSTER_SUPPORT", spp: { name: p.name }, purchase: false });
      else dispatch({ type: "ADD_ROSTER", mode: p.mode, no: p.no });
    }
    /* 種別ごとに数えてから1文で伝える。名前を出す（DB番号は
       利用者が照合できない）。種別が混ざるので内訳は省略せず種別を出す。 */
    const byKind = targets.reduce((acc, p) => {
      acc[p.kind] = (acc[p.kind] || 0) + 1;
      return acc;
    }, {});
    const mix = Object.entries(byKind).map(([kind, n]) => `${HELD_KIND_LABEL[kind] || kind} ${n}件`).join("・");
    const head = targets.slice(0, 2).map((p) => `${HELD_KIND_LABEL[p.kind] || p.kind}「${p.name}」`).join("、");
    toast(`${head}${targets.length > 2 ? ` ほか${targets.length - 2}件` : ""} を所持に追加しました（${mix}）`);
    setHeldScan({ found: [], unknown: [], unknownCount: 0 });
    setHeldResolved({});
  };

  const dropTargetProps = (id) => ({
    onDragOver: (e) => {
      e.preventDefault();
      setOverId(id);
    },
    onDragLeave: () => { if (overId === id) setOverId(null); },
    onDrop: (e) => {
      e.preventDefault();
      const entryId = readDragId(e);
      if (id === "__queue") { moveEntry(entryId, null); return; }
      moveEntry(entryId, id);
    }
  });

  /* 残高の数字。色は通貨の種別（LP=金 / 欠片=青）で分ける。
     3桁区切りは topbar の残高チップと同じ ja-JP 書式に揃える。 */
  const bigNum = (value, tone) => {
    const n = Number(value);
    const text = Number.isFinite(n) ? n.toLocaleString("ja-JP") : String(value);
    return h("b", { className: `ledger-chip-num is-${tone}` }, text);
  };
  /* 集計行の小さな数字。ラベルは集計行にしか出さない。3桁区切りは bigNum と同じ。 */
  const stat = (value) => {
    const n = Number(value);
    return h("b", { className: "ledger-stat" }, Number.isFinite(n) ? n.toLocaleString("ja-JP") : String(value));
  };

  /* --- 描画 ------------------------------------------------------------- */
  return h("div", { className: "stack-3" },
    /* 残高。自動なので手入力できないことを明記する。 */
    h(Card, null,
      h("div", { className: "card-header owned-library-bar" },
        h("span", { className: "t-label" }, "RESULT / リザルト"),
        h("span", { className: "ledger-note" }, "リザルトの収入 − 明細の支出で自動計算します")
      ),
      h("div", { className: "card-body" },
        h("div", { className: "ledger-balance" },
          h("span", { className: "ledger-chip" }, bigNum(balance.lp, "lp"), h("span", { className: "ledger-chip-label" }, "LP")),
          h("span", { className: "ledger-chip" }, bigNum(balance.shards, "shard"), h("span", { className: "ledger-chip-label" }, "欠片")),
          /* stat() は要素を返すので文字列補間に埋めると "[object Object]" になる。 */
          h("span", { className: "ledger-balance-sub" },
            "収入 ", stat(balance.incomeLp), " LP / ", stat(balance.incomeShards), " 欠片",
            " ・ 支出 ", stat(balance.spentLp), " LP / ", stat(balance.spentShards), " 欠片",
          )
        )
      )
    ),

    /* リザルトの追加。
       取り込みは3つとも低頻度なので、1つの「取り込む」ボタンに畳む。
       開くと3つ並ぶ。 pessoaリストはさらに個別に畳む（三段構造は要らない）。 */
    h(Card, null,
      h("div", { className: "card-header" },
        h("span", { className: "t-label" }, "リザルトを記録"),
        /* 取り込みの入口。3つを畳んで隠す。
           heldOpen は既存の人格リスト自身の開閉なので使わない。 */
        h(Button, {
          size: "sm",
          variant: "secondary",
          icon: "download",
          className: "ledger-import-toggle",
          "aria-expanded": importMenuOpen,
          onClick: () => setImportMenuOpen((v) => !v)
        }, "取り込む")
      ),
      importMenuOpen && h("div", { className: "ledger-import-menu" },
        /* 硝子窓の取り込みはリザルト個別ではなく全体操作。共有URLから
           シナリオをまとめて読み取り、複数リザルトをまとめて作ります。 */
        h(Button, { size: "sm", variant: "quiet", icon: "download", onClick: () => switchResultTool("glass") }, "硝子窓から一括取り込む"),
        /* 手打ちの記録を読み込む。同じリザルトカードから入れられるように隣に置く。 */
        h(Button, { size: "sm", variant: "quiet", icon: "copy", onClick: () => switchResultTool("text") }, "テキスト流し込み"),
        /* 所持人格リストの一括取込。 */
        h(Button, { size: "sm", variant: "quiet", icon: "grid", onClick: () => { setImportMenuOpen(false); openHeld(); } }, "所持人格リストを取り込む")
      ),
      h("div", { className: "card-body" },
        h("div", { className: "ledger-add-row" },
          h("input", {
            className: "ledger-input",
            placeholder: "例：第12回 ゲーパ",
            value: newResult.name,
            "aria-label": "リザルトの名称",
            onChange: (e) => setNewResult((p) => ({ ...p, name: e.target.value }))
          }),
          h("input", {
            type: "date",
            className: "ledger-input ledger-input--date",
            value: newResult.date,
            "aria-label": "プレイした日付",
            onChange: (e) => setNewResult((p) => ({ ...p, date: e.target.value }))
          }),
          h("input", {
            className: "ledger-input ledger-input--num",
            placeholder: "獲得LP",
            inputMode: "numeric",
            value: newResult.lp,
            "aria-label": "獲得LP",
            onChange: (e) => setNewResult((p) => ({ ...p, lp: e.target.value }))
          }),
          h("input", {
            className: "ledger-input ledger-input--num",
            placeholder: "獲得欠片",
            inputMode: "numeric",
            value: newResult.shards,
            "aria-label": "獲得欠片",
            onChange: (e) => setNewResult((p) => ({ ...p, shards: e.target.value }))
          }),
          h(Button, { size: "sm", variant: "primary", icon: "check", onClick: addResult, disabled: !String(newResult.name || "").trim() }, "記録する")
        ),
        /* 抽出チケットも収入と同じ場所で受け取る。GPTの追加工程なしで、
           LP・欠片と同時にこのリザルトへ入る。 */
        h(TicketInputs, {
          idPrefix: "new-result",
          current: newResult.tickets,
          packPick: newResultPack,
          setPackPick: setNewResultPack,
          onChange: (tickets) => setNewResult((p) => ({ ...p, tickets }))
        }),
)
    ),

    importPanel && h("div", { className: "ledger-gara-wrap" },
    h("div", { className: "card-header owned-library-bar" },
    h("span", { className: "t-label" }, "硝子窓から一括取り込む"),
    h("span", { className: "ledger-note" }, "共有URLからシナリオをまとめて読み取り、リザルトを複数一括で作ります。1件ごとではなく全体へ反映します"),
    h(Button, { size: "sm", variant: "ghost", icon: "x", onClick: () => setImportPanel(false) }, "閉じる")
    ),
    typeof window.GarasumadoImportPanel === "function"
    ? h(window.GarasumadoImportPanel, {
      onClose: () => setImportPanel(false),
      /* 取込済み共有IDを判定して、同じ人格を再取り込み候補に出さない。 */
      existingPersonas: state.roster?.personas || [],
      /* 確定結果は画面に出るので、ここでは閉じない（閉じるのは確定結果の「閉じる」）。 */
      onApply: (applied) => applyGarasumadoImport(applied)
    })
    : h("p", { className: "ledger-note" }, "取り込み画面が読み込まれていません。ページを再読み込みしてください。")
    ),

    /* テキスト流し込み。貼り付けた直後に「何ことになるか」を見せる。
       読めなかった行は黙って落とさず、理由ごと一覧に出す。
       決定できない金額は既定で入れず、外す判断は利用者に返す。 */
    textPanel && h("div", { className: "ledger-gara-wrap" },
      h("div", { className: "card-header owned-library-bar" },
        h("span", { className: "t-label" }, "テキスト流し込み"),
        h("span", { className: "ledger-note" }, "【シナリオ名】と 報酬｜購入｜追加購入｜ の行を貼り付けると、リザルトと支出の提案になります。入れる前に内容を確認できます"),
        h(Button, { size: "sm", variant: "ghost", icon: "x", onClick: () => setTextPanel(false) }, "閉じる")
      ),
      h("div", { className: "card-body stack-2" },
        h("label", { className: "ledger-ticket-field" },
          h("span", null, "記録のテキスト"),
          h("textarea", {
            className: "ledger-textarea",
            "aria-label": "記録のテキスト",
            rows: 8,
            placeholder: "【シナリオA】(作：作者名)\n報酬｜LP:150/自我の欠片:70/人格抽出チケットx1\n購入｜人格抽出x2(100LP)/EGO購入-TETH[鬼退治](75欠片)\n追加購入｜壊し砕く打撃(150LP)",
            value: textDraft,
            onChange: (e) => {
              setTextDraft(e.target.value);
              setTextExcluded(new Set());
              setTextIdentityExcluded(new Set());
              setTextIdentityResolved({});
              setTextTicketResolved({});
              setDismissedTextWarnings(new Set());
            }
          })
        ),
        parsedText && parsedText.records.map((rec, ri) => h("div", { key: `rec-${ri}`, className: "stack-2" },
          h("span", { className: "t-label" },
            `${rec.title || "無題"}${rec.author ? `（作：${rec.author}）` : ""} — ${rec.date ? `日時 ${rec.date}` : "日時未記載"} — 収入 LP ${rec.income.lp} / 欠片 ${rec.income.shards}`
            + (rec.tickets.length ? ` / チケット獲得 ${textTicketSummary(rec.tickets, ri)}` : "")
            + (rec.ticketUses?.length ? ` / チケット消費 ${textTicketSummary(rec.ticketUses, ri)}` : "")),
          textUnknownTicketsForRecord(rec, ri).length > 0 && h("div", { className: "ledger-held-result", role: "group", "aria-label": "未確定チケットの分類" },
            h("p", { className: "ledger-note" }, "チケット種別が原文だけでは確定できません。下で分類を選ぶまで、該当する収入・消費は残高へ反映しません。"),
            h("div", { className: "stack-2" }, textUnknownTicketsForRecord(rec, ri).map(({ ticket, key }) => h("div", { key, className: "ledger-unknown-row" },
              h("span", { className: "ledger-note" }, `${ticket.raw || ticket.sourceLine || "抽出チケット"} ×${ticket.count}`),
              h("select", {
                className: "select",
                value: textTicketResolved[key]?.kind || "",
                "aria-label": `チケット種別の手動指定：${ticket.raw || "抽出チケット"}`,
                onChange: (event) => setTextTicketResolved((previous) => {
                  const next = { ...previous };
                  const kind = event.target.value;
                  if (!kind) delete next[key];
                  else next[key] = { kind, ...(kind === "pack" ? { pack: previous[key]?.pack || "" } : {}) };
                  return next;
                })
              },
                h("option", { value: "" }, "未確定のまま"),
                h("option", { value: "persona" }, "人格抽出チケット"),
                h("option", { value: "ego" }, "E.G.O抽出チケット"),
                h("option", { value: "choice" }, "選択抽出チケット"),
                h("option", { value: "pack" }, "テーマパック権")
              ),
              textTicketResolved[key]?.kind === "pack" && h("input", {
                className: "input",
                value: textTicketResolved[key]?.pack || "",
                placeholder: "パック名を入力",
                "aria-label": `テーマパック権の名前：${ticket.raw || "抽出チケット"}`,
                onChange: (event) => setTextTicketResolved((previous) => ({
                  ...previous, [key]: { kind: "pack", pack: event.target.value }
                }))
              })
            )))
          ),
          rec.deltas.length > 0 && h("span", { className: "ledger-note" },
            `増減の注記 ${rec.deltas.map((d) => `${d.currency === "lp" ? "LP" : "欠片"} ${d.value > 0 ? "+" : ""}${d.value}`).join(" / ")} は残高差なので収入には入れていません`),
          rec.consumedItems?.length > 0 && h("span", { className: "ledger-note" },
            "過去の消費履歴：" + rec.consumedItems.map((item) => `${item.itemName} ×${item.quantity}（${item.detail}）`).join(" / ")),
          rec.itemGains?.length > 0 && h("span", { className: "ledger-note" },
            "アイテム報酬（取り込み時に所持アイテムへ追加）：" + rec.itemGains.map((item) => `${item.itemName} ×${item.quantity}`).join(" / ")),
          rec.raw?.length > 0 && h("details", { className: "ledger-import-notes" },
            h("summary", null, `元ログの注記 ${rec.raw.length}行（同期CT・報酬名などを保存）`),
            h("p", { className: "ledger-note" }, rec.raw.join("\n"))),
          textPlan?.identities?.some((candidate) => candidate.recordIndex === ri) && h("div", { className: "ledger-held-result", role: "group", "aria-label": "履歴内の人格候補" },
            h("p", { className: "ledger-note" }, "履歴内の人格候補（取り込むものにチェック。曖昧な略称は候補を選んでください）"),
            h("div", { className: "stack-2" }, textPlan.identities.filter((candidate) => candidate.recordIndex === ri).map((candidate) => {
              const checked = Boolean(candidate.name) && !candidate.owned && !candidate.duplicate && !textIdentityExcluded.has(candidate.key);
              return h("div", { key: candidate.key, className: "ledger-unknown-row" },
                candidate.name
                  ? h("label", { className: "chip is-sm" },
                      h("input", {
                        type: "checkbox",
                        checked,
                        disabled: candidate.owned || candidate.duplicate,
                        onChange: (e) => setTextIdentityExcluded((previous) => {
                          const next = new Set(previous);
                          if (e.target.checked) next.delete(candidate.key); else next.add(candidate.key);
                          return next;
                        })
                      }),
                      h("span", null, candidate.name),
                      h("span", { className: "ledger-note" }, candidate.owned ? "（所持済み）" : candidate.duplicate ? "（同じ取込内で重複）" : `（DB照合：${candidate.confidence}）`),
                      h("span", { className: "ledger-note" }, ` 原文：${candidate.source}`)
                    )
                  : h("div", { className: "stack-2" },
                      h("span", { className: "ledger-note" }, `未確定：${candidate.source}`),
                      candidate.options?.length
                        ? h("div", { className: "chips-group" }, candidate.options.map((option) => h("button", {
                            key: option.name,
                            type: "button",
                            className: "chip chip-candidate",
                            onClick: () => {
                              setTextIdentityResolved((previous) => ({ ...previous, [candidate.key]: option.name }));
                              setTextIdentityExcluded((previous) => { const next = new Set(previous); next.delete(candidate.key); return next; });
                            }
                          }, h("span", { className: "chip-candidate-kind" }, "人格"), option.name)))
                        : h("span", { className: "ledger-note" }, "DB一致なし。自動追加はしません。")
                    )
              );
            })
            )
          ),
          rec.spends.map((spend, si) => h("label", { key: `sp-${ri}-${si}`, className: "chip is-sm" },
            h("input", {
              type: "checkbox",
              checked: !spend.needsDecision && !textExcluded.has(`${ri}:${si}`),
              disabled: Boolean(spend.needsDecision),
              onChange: (e) => setTextExcluded((prev) => {
                const next = new Set(prev);
                const exclusionKey = `${ri}:${si}`;
                if (e.target.checked) next.delete(exclusionKey); else next.add(exclusionKey);
                return next;
              })
            }),
            h("span", null, `${spend.name} ${spend.cost.lp ? `${spend.cost.lp}LP ` : ""}${spend.cost.shards ? `${spend.cost.shards}欠片` : ""}`.trim()),
            spend.needsDecision && h("span", { className: "ledger-note" }, `（${spend.reason}）`)
          ))
        )),
        visibleTextWarnings.length > 0 && h("div", { className: "ledger-held-result", role: "status" },
          h("p", { className: "ledger-note" }, `未確認の警告が ${visibleTextWarnings.length} 件あります。原文を確認してください。内容を確認して問題がなければ、各警告の「確認済みとして閉じる」で表示を消せます。`),
          h("ul", { className: "ledger-warn-list" }, visibleTextWarnings.map((s) => h("li", { key: textWarningKey(s) },
            s.recordTitle && h("p", { className: "t-label" }, `対象リザルト：${s.recordTitle}`),
            h("div", null, `${s.text || s.name || s.key || "（行を特定できません）"}：${s.reason || "不明"}`),
            s.guidance && h("p", { className: "ledger-note" }, `確認方法：${s.guidance}`),
            isReviewableTextWarning(s) && h(Button, {
              size: "sm", variant: "quiet",
              "aria-label": `確認済みとして警告を閉じる：${s.text || s.name || s.key || "対象の行"}`,
              onClick: () => setDismissedTextWarnings((previous) => new Set([...previous, textWarningKey(s)]))
            }, "確認済みとして閉じる")
          )))
        ),
        h(Button, {
          size: "sm", variant: "primary", icon: "check",
          disabled: !textPlan || !textPlan.actions.length,
          onClick: applyTextImport
        }, "取り込む")
      )
    ),

    importNote && h(Card, { className: "ledger-export-card" },
    h("div", { className: "card-header owned-library-bar" },
    h("span", { className: "t-label" }, "取り込み結果"),
    h("span", { className: "ledger-note" }, importNote.summary)
    ),
    h("div", { className: "card-body stack-2" },
    importNote.skippedCount > 0 && h("div", { className: "ledger-held-result", role: "status" },
    h("p", { className: "ledger-note" }, `入れなかったものが ${importNote.skippedCount} 件あります：`),
    /* 取り込み口が2つある（硝子窓は {key,name}、テキスト流しは {text}）。
       形の違う行を同じ枠に出すので、取りこぼさない順に全部見る。
       どれも無ければ「行を特定できない」と書く。空欄は読者を嘘に導く。 */
    h("ul", { className: "ledger-warn-list" }, importNote.skipped.map((s, i) => h("li", { key: i },
      `${s.text || s.name || s.key || "（行を特定できません）"}：${s.reason || s.kind || "不明"}`)))
    ),
    h(Button, { size: "sm", variant: "ghost", onClick: () => setImportNote(null) }, "閉じる")
    )
    ),

    /* 手動の支出・消耗。DBに価格が無いものと、戦闘で消えたものをここで記録する。 */
    h(Card, null,
      h("div", { className: "card-header owned-library-bar" },
        h("span", { className: "t-label" }, "支出・消耗を記録"),
        h("span", { className: "ledger-note" }, "所持や強化から自動で入る分はここで打ちません")
      ),
      h("div", { className: "card-body stack-2" },
        h("div", { className: "ledger-add-row" },
          h("input", {
            className: "ledger-input ledger-input--wide",
            placeholder: "例：自作のトークン、使った包帯",
            value: newEntry.name,
            "aria-label": "明細の名称",
            onChange: (e) => setNewEntry((p) => ({ ...p, name: e.target.value }))
          }),
          h("select", {
            className: "ledger-input ledger-input--kind",
            value: newEntry.kind,
            "aria-label": "明細の種別",
            onChange: (e) => setNewEntry((p) => ({ ...p, kind: e.target.value }))
          }, (window.LBT_LEDGER_ENTRY_KINDS || [
            { id: "expense", label: "手動支出" },
            { id: "consumption", label: "消耗" }
          ]).map((k) => h("option", { key: k.id, value: k.id }, k.label))),
          h("input", {
            className: "ledger-input ledger-input--num",
            placeholder: "LP",
            inputMode: "numeric",
            value: newEntry.lp,
            "aria-label": "消費LP",
            onChange: (e) => setNewEntry((p) => ({ ...p, lp: e.target.value }))
          }),
          h("input", {
            className: "ledger-input ledger-input--num",
            placeholder: "欠片",
            inputMode: "numeric",
            value: newEntry.shards,
            "aria-label": "消費欠片",
            onChange: (e) => setNewEntry((p) => ({ ...p, shards: e.target.value }))
          }),
          h(Button, { size: "sm", variant: "primary", icon: "check", onClick: addEntry, disabled: !String(newEntry.name || "").trim() }, "記録")
        )
      )
    ),

    /* 所持人格リストの一括取込。貼り付けたテキストから DB 上の人格名を拾い、
       何を足すかを確認してから所持へ加える。
       入口は記録フォームの「取り込む」に畳んで隠した。 */
    heldOpen && h(Card, { className: "ledger-gara-wrap" },
      h("div", { className: "card-header owned-library-bar" },
        h("span", { className: "t-label" }, "所持人格リストを取り込む"),
        h(Button, {
          size: "sm",
          variant: "quiet",
          icon: "x",
          onClick: closeHeld
        }, "閉じる")
      ),
      h("div", { className: "card-body stack-2" },
        h("textarea", {
          className: "ledger-input ledger-held-paste",
          rows: 4,
          placeholder: "例：黒雲会組員\n剣契殺手A",
          "aria-label": "所持人格リスト",
          value: heldPaste,
          onChange: (e) => setHeldPaste(e.target.value)
        }),
        heldScan.found.length > 0 && h("p", { className: "ledger-note" },
        `検出 ${heldScan.found.length} 件。内容を確認して「保存する」を押してください。`),
        h("div", { className: "ledger-add-row" },
          h(Button, {
            size: "sm",
            variant: "ghost",
            icon: "search",
            onClick: () => setHeldScan(scanHeldPersonas(heldPaste, heldResolved)),
            disabled: !heldPaste.trim()
          }, "検出する"),
          heldScan.found.length > 0 && h(Button, {
            size: "sm",
            variant: "primary",
            icon: "check",
            onClick: importHeldPersonas,
            disabled: !heldScan.found.some((p) => !p.owned)
          }, `${heldScan.found.filter((p) => !p.owned).length}件を保存する`),
          heldScan.found.length > 0 && h(Button, {
            size: "sm",
            variant: "ghost",
            onClick: () => setHeldScan({ found: [], unknown: [], unknownCount: 0 })
          }, "クリア")
        ),
        heldScan.found.length > 0 && h("div", { className: "ledger-held-result", role: "status" },
          h("p", { className: "ledger-note" },
            `検出 ${heldScan.found.length} 件（所持済み ${heldScan.found.filter((p) => p.owned).length} 件・未所持 ${heldScan.found.filter((p) => !p.owned).length} 件）`),
          h("div", { className: "chips-group" }, heldScan.found.map((p) => h("span", {
            key: `${p.kind}:${p.kind === "ego" ? p.rank + ":" + p.no : p.kind === "persona" ? p.mode + ":" + p.no : p.name}`,
            className: `chip chip-held${p.owned ? " is-owned" : ""}`,
            title: `${HELD_KIND_LABEL[p.kind]}${p.kind === "ego" ? ` ${p.rank} No.${p.no}` : p.kind === "persona" ? ` ${p.mode.toUpperCase()} No.${p.no}` : ""}`
          }, h("span", { className: "chip-candidate-kind" }, HELD_KIND_LABEL[p.kind]), p.name)))
        ),
heldScan.unknownCount > 0 && h("div", { className: "ledger-held-unknown", role: "group", "aria-label": "判定できなかった名前" },
        h("p", { className: "ledger-note" },
        `${heldScan.unknownCount} 件が見つかりませんでした。近い候補から選べば取り込めます。`),
        h("div", { className: "ledger-held-unknown-list" }, heldScan.unknown.map((entry) => {
        const label = typeof entry === "string" ? entry : entry.text;
        /* 文字一致の候補を先に並べる。候補が0にならないことが最優先。 */
        const options = [
          ...(typeof entry === "object" && entry.candidates ? entry.candidates : []),
          ...(window.LBT_fuzzyNameCandidatesAcross?.(window.DB, label, 6) || [])
        ].filter((o, i, arr) => arr.findIndex((x) => x.name === o.name) === i);
        const open = heldPicking === label;
        return h("div", { key: label, className: `ledger-unknown-row${open ? " is-open" : ""}` },
        h("button", {
        type: "button",
        className: "ledger-unknown-label",
        "aria-expanded": open,
        onClick: () => setHeldPicking(open ? null : label)
        },
        h("span", { className: "ledger-unknown-text" }, label),
        h("span", { className: "ledger-unknown-count" }, `候補 ${options.length}`)),
        open && options.length > 0 && h("div", { className: "ledger-unknown-candidates" },
        h("div", { className: "chips-group" }, options.map((opt) => h("button", {
        key: opt.name,
        type: "button",
        className: "chip chip-candidate",
        title: `一致度 ${Math.round(opt.score)}`,
        onClick: () => {
        setHeldResolved((r) => ({ ...r, [label]: opt.name }));
        setHeldPicking(null);
        }
        },
        opt.kind ? h("span", { className: "chip-candidate-kind" }, FUZZY_KIND_LABEL[opt.kind]) : null,
        opt.name
        ))),
        h("div", { className: "ledger-add-row" },
        h(Button, {
        size: "xs",
        variant: "ghost",
        onClick: () => {
        setHeldResolved((r) => {
        const next = { ...r };
        delete next[label];
        return next;
        });
        setHeldPicking(null);
        }
        }, "未確定に戻す"),
        h(Button, {
        size: "xs",
        variant: "ghost",
        onClick: () => {
        setHeldPaste(heldPaste.split(/[\n\r]+/).filter((l) => l.trim() !== label).join("\n"));
        setHeldPicking(null);
        }
        }, "この行を消す")
        )
        ),
        open && options.length === 0 && h("p", { className: "ledger-note" },
        "近い候補がありません。貼り付けた文字列を確認してください。")
);
        }))
        ),
      )
    ),

    /* 未分類。ここが帰属待ちのキュー。空でも受け皿として残す。 */
    h("div", {
      className: `ledger-card-wrap${overId === "__queue" ? " is-over" : ""}`,
      ...dropTargetProps("__queue")
    },
    h(Card, { className: "ledger-queue" },
      h("div", { className: "card-header owned-library-bar" },
        h("span", { className: "t-label" }, "未分類"),
        h("span", { className: "ledger-note" }, "ドラッグ、または「移動」から選択して帰属できます"),
        movingEntry && h("button", {
          type: "button", className: "ledger-queue-move-target",
          disabled: !movingEntry.resultId,
          title: !movingEntry.resultId ? "この明細はすでに未分類です" : "選択中の明細を未分類へ戻す",
          onClick: () => moveEntry(movingEntry.id, null)
        }, !movingEntry.resultId ? "未分類（現在地）" : "未分類へ移動")
      ),
      h("div", { className: "card-body stack-2" },
        unclassified.length === 0
          ? h("p", { className: "ledger-empty-note" }, "未分類は空です。リザルトから明細をここへドラッグすると戻せます。")
          : null,
        unclassified.map((entry) => h("div", {
          key: entry.id,
          className: "ledger-row",
          ...dragProps(entry)
        },
          h("span", { className: "ledger-row-name" }, entry.name),
          h("span", { className: "ledger-row-kind" }, kindLabel(entry.kind)),
          h("span", { className: "ledger-row-cost" }, entry.cost?.lp ? `${entry.cost.lp}LP` : entry.cost?.shards ? `${entry.cost.shards}SHARD` : "—"),
          h("button", {
            type: "button", className: "ledger-row-move-action",
            "aria-pressed": movingEntryId === entry.id,
            "aria-label": `${entry.name} の移動先を選択`,
            title: "ドラッグできない場合は、移動先カードを選べます",
            onClick: () => startMoveEntry(entry)
          }, movingEntryId === entry.id ? "選択中" : "移動"),
          h("button", {
            type: "button",
            className: "ledger-row-trash",
            title: "削除する（Ctrl+Z で取り消せます）",
            "aria-label": `${entry.name} を削除する`,
            onClick: () => { if (movingEntryId === entry.id) setMovingEntryId(null); dispatch({ type: "PURGE_ENTRY", id: entry.id }); }
          }, "削除")
        ))
      )
    )
    ),

    /* 抽出リスト。ガチャの結果をハッシュ鎖つきで残す場所。
       通帳（明細）と並べて置くのは、同じ支出の証明に属するから。
       ただしここでは計算しない。鎖は読み手側で再計算して確かめる。 */
    h(DrawLedgerPanel, { state }),

    /* リザルトカード。ドラッグ先とクリック移動先を同じカードへ統一。 */
    movingEntry && h("div", { className: "ledger-move-mode", role: "status" },
      h("span", null, `「${movingEntry.name}」の移動先を選択中です。対象カードの「ここへ移動」を押してください。`),
      h(Button, { size: "sm", variant: "ghost", onClick: cancelMoveEntry }, "移動をやめる")
    ),
    h("div", { className: "ledger-results-toolbar" },
      h("span", { className: "ledger-results-count" },
        "リザルト " + sortedResults.length + " / " + results.length + " 件"),
      h("input", {
        type: "search", className: "ledger-results-search",
        placeholder: "名称・日付・LP・欠片を検索", "aria-label": "リザルトを検索",
        value: resultQuery, disabled: ticketPanel !== null,
        onChange: (event) => { setResultQuery(event.target.value); setResultPage(0); }
      }),
      h("select", {
        className: "ledger-results-sort", "aria-label": "リザルトの並び順",
        value: resultSort, disabled: ticketPanel !== null,
        onChange: (event) => { setResultSort(event.target.value); setResultPage(0); }
      },
        h("option", { value: "newest" }, "新しい順"),
        h("option", { value: "oldest" }, "古い順"),
        h("option", { value: "name" }, "名称順")
      )
    ),
    h("div", { className: "ledger-cards" },
      results.length === 0 && h(Card, null,
        h("div", { className: "empty", style: { padding: "var(--s-4)" } },
          "まだリザルトがありません。上で獲得LPと欠片を記録すると、所持したものの帰属先になります。")
      ),
      results.length > 0 && sortedResults.length === 0 && h(Card, null,
        h("div", { className: "empty", style: { padding: "var(--s-4)" } },
          "検索に一致するリザルトがありません。検索条件を変更してください。")
      ),
      pageResults.map((result) => {
        const rows = byResult(result.id);
        const spent = sumOf(rows);
        const consumedItems = Array.isArray(result.consumedItems) ? result.consumedItems : [];
        const ticketChips = resultTicketChips(result);
        const ticketCount = ticketChips.reduce((total, ticket) => total + (Number(ticket.count) || 0), 0);
        const isEditing = ticketPanel === result.id && ticketDraft?.id === result.id;
        /* ドロップ先は Card の外側の div に置く。Card は children / className / frame
           しか受け取らないため、drag イベントを直接渡しても無視される。 */
        return h("div", {
          key: result.id,
          className: `ledger-card-wrap${overId === result.id ? " is-over" : ""}${ticketPanel === result.id && ticketDraft?.id === result.id ? " is-editing" : ""}`,
          ...dropTargetProps(result.id)
        },
h(Card, { className: "ledger-card" },
    h("div", { className: `card-header owned-library-bar${isEditing ? " is-editing" : ""}` },
      isEditing
        ? h("div", { className: "ledger-card-edit-head-fields" },
            h("label", { className: "ledger-card-edit-head-field" },
              h("span", null, "名称"),
              h("input", {
                type: "text", className: "ledger-input ledger-card-edit-title",
                "aria-label": "リザルトの名称", value: ticketDraft.name,
                onChange: (event) => updateResultDraftField("name", event.target.value)
              })
            ),
            h("label", { className: "ledger-card-edit-head-field" },
              h("span", null, "日付"),
              h("input", {
                type: "date", className: "ledger-input ledger-card-edit-date",
                "aria-label": "プレイした日付", value: ticketDraft.date,
                onChange: (event) => updateResultDraftField("date", event.target.value)
              })
            ),
            (dragId || movingEntryId) && h("span", { className: `ledger-drop-hint${overId === result.id ? " is-over" : ""}`, "aria-live": "polite" }, movingEntryId ? (overId === result.id ? "ここへ移動" : "移動先") : (overId === result.id ? "ここへドロップ" : "ドロップ先"))
          )
        : h("div", { className: "ledger-card-heading" },
            h("span", { className: "ledger-card-title" }, result.name),
            h("span", { className: "ledger-card-date" }, result.date || "—"),
            (dragId || movingEntryId) && h("span", { className: `ledger-drop-hint${overId === result.id ? " is-over" : ""}`, "aria-live": "polite" }, movingEntryId ? (overId === result.id ? "ここへ移動" : "移動先") : (overId === result.id ? "ここへドロップ" : "ドロップ先"))
          ),
      h("div", { className: "ledger-card-actions" },
        isEditing
          ? [
              h("button", {
                key: "save", type: "button", className: "ledger-card-edit-save",
                title: "変更を保存", "aria-label": `${result.name} の変更を保存`,
                onClick: (event) => { event.preventDefault(); event.stopPropagation(); saveResultEditor(result); }
              }, "保存"),
              h("button", {
                key: "cancel", type: "button", className: "ledger-card-edit-cancel",
                title: "変更を破棄", "aria-label": `${result.name} の編集をキャンセル`,
                onClick: (event) => { event.preventDefault(); event.stopPropagation(); cancelResultEditor(); }
              }, "取消")
            ]
          : movingEntry
            ? h("button", {
                type: "button", className: "ledger-card-move-target",
                disabled: movingEntry.resultId === result.id,
                title: movingEntry.resultId === result.id ? "この明細はすでにこのリザルトにあります" : "選択中の明細をこのリザルトへ移動",
                "aria-label": `${movingEntry.name} を「${result.name}」へ移動`,
                onClick: () => moveEntry(movingEntry.id, result.id)
              }, movingEntry.resultId === result.id ? "ここが現在地" : "ここへ移動")
            : h("button", {
                type: "button",
                className: "ledger-card-edit-btn",
                title: "このリザルトの登録情報（LP・欠片・抽出チケット）を編集します",
                "aria-label": `${result.name} の登録情報を編集`,
                "aria-expanded": false,
                "aria-pressed": false,
                disabled: ticketPanel !== null && !isEditing,
                onClick: (event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  openResultEditor(result);
                }
              }, "編集")
      )
    ),
            h("div", { className: "card-body ledger-card-body" },
              isEditing && h("div", { className: "ledger-card-edit-inline", "aria-label": "リザルトをカード内で編集" },
                h("div", { className: "ledger-card-edit-income" },
                  h("label", { className: "ledger-card-edit-field" },
                    h("span", null, "獲得LP"),
                    h("input", {
                      className: "ledger-input ledger-input--num", type: "number", min: "0", step: "1", inputMode: "numeric",
                      "aria-label": "獲得LP", value: ticketDraft.lp,
                      onChange: (event) => updateResultDraftField("lp", event.target.value)
                    })
                  ),
                  h("label", { className: "ledger-card-edit-field" },
                    h("span", null, "獲得欠片"),
                    h("input", {
                      className: "ledger-input ledger-input--num", type: "number", min: "0", step: "1", inputMode: "numeric",
                      "aria-label": "獲得欠片", value: ticketDraft.shards,
                      onChange: (event) => updateResultDraftField("shards", event.target.value)
                    })
                  )
                ),
                h("div", { className: "ledger-card-edit-tickets" },
                  h("span", { className: "t-label" }, "抽出チケット"),
                  h("div", { className: "ledger-card-edit-ticket-grid" },
                    ["persona", "ego", "choice"].map((kind) => h("label", { key: kind, className: "ledger-ticket-field" },
                      h("span", null, ticketLabel(kind)),
                      h("input", {
                        className: "ledger-input ledger-input--num", type: "number", min: "0", step: "1", inputMode: "numeric",
                        "aria-label": ticketLabel(kind) + " の枚数",
                        value: String(Number(ticketDraft.tickets?.[kind]) || 0),
                        onChange: (event) => updateResultDraftTicket(kind, event.target.value)
                      })
                    )),
                    packs.length > 0 && h("label", { className: "ledger-ticket-field" },
                      h("span", null, "対象パック"),
                      h("select", {
                        className: "select", "aria-label": "特定抽出パックの選択",
                        value: ticketPackPick || packs[0]?.name || "",
                        onChange: (event) => setTicketPackPick(event.target.value)
                      }, packs.map((pack) => h("option", { key: pack.name, value: pack.name }, pack.name))
                      )
                    ),
                    packs.length > 0 && h("label", { className: "ledger-ticket-field" },
                      h("span", null, ticketLabel("pack", ticketPackPick || packs[0]?.name || "")),
                      h("input", {
                        className: "ledger-input ledger-input--num", type: "number", min: "0", step: "1", inputMode: "numeric",
                        "aria-label": ticketLabel("pack", ticketPackPick || packs[0]?.name || "") + " の枚数",
                        value: String(Number(ticketDraft.tickets?.pack?.[ticketPackPick || packs[0]?.name || ""]) || 0),
                        onChange: (event) => updateResultDraftPack(ticketPackPick || packs[0]?.name || "", event.target.value)
                      })
                    )
                  )
                )
              ),
              !isEditing && h("div", { className: "ledger-card-income" },
                h("span", { className: "ledger-pair" },
                  bigNum(result.income?.lp || 0, "lp"),
                  h("span", { className: "ledger-pair-label" }, "LP")
                ),
                h("span", { className: "ledger-pair" },
                  bigNum(result.income?.shards || 0, "shard"),
                  h("span", { className: "ledger-pair-label" }, "欠片")
                ),
                h("span", { className: "ledger-card-spent" },
                  "支出 LP " + spent.lp.toLocaleString("ja-JP") + " / 欠片 " + spent.shards.toLocaleString("ja-JP"))
              ),
              !isEditing && h("details", { className: "ledger-result-details" },
                h("summary", { className: "ledger-result-summary" },
                  "明細 " + rows.length + "件 · 消耗品 " + consumedItems.length + "種 · チケット " + ticketCount + "枚"
                ),
                h("div", { className: "ledger-result-detail-content stack-2" },
                  h("div", { className: "ledger-detail-group" },
                    h("span", { className: "t-label" }, "抽出チケット"),
                    ticketChips.length > 0
                      ? ticketChips.map((ticket) => h("span", { key: ticket.key, className: "gacha-held-ticket" }, ticket.label + " ×" + ticket.count))
                      : h("span", { className: "ledger-note" }, "未記録")
                  ),
                  consumedItems.length > 0 && h("div", { className: "ledger-detail-group ledger-card-consumed" },
                    h("span", { className: "t-label" }, "消耗したアイテム"),
                    consumedItems.map((item, index) => {
                      const reasonLabel = item.reason === "consumption" ? "消費" : String(item.reason || "消費");
                      return h("span", {
                        key: item.id || String(item.itemId) + "-" + String(item.consumedAt) + "-" + index,
                        className: "gacha-held-ticket",
                        title: reasonLabel
                      },
                        String(item.itemName || item.name || item.itemId) + " ×" + String(item.quantity || 1)
                          + " · " + reasonLabel
                          + (item.detail ? "（" + String(item.detail).slice(0, 72) + "）" : "")
                      );
                    })
                  ),
                  rows.length === 0
                    ? h("p", { className: "ledger-empty-note" }, "支出明細はありません。未分類の明細をここへ移動できます。")
                    : h("div", { className: "ledger-result-object-list" }, rows.map((entry) => {
                        const owner = entry.ref?.kind === "rosterPersona"
                          ? (state.roster?.personas || []).find((persona) => String(persona.uid) === String(entry.ref.uid))
                          : null;
                        const catalogSpecial = window.DB?.special_enhancements || [];
                        const specialEnhancements = Array.isArray(owner?.build?.enhancements)
                          ? owner.build.enhancements.filter((enhancement) => {
                              const name = String(enhancement?.name || "").trim();
                              return name && catalogSpecial.some((candidate) => candidate?.name === name);
                            })
                          : [];
                        const storedQuantity = Number(entry.quantity);
                        const quantity = Number.isSafeInteger(storedQuantity) && storedQuantity > 0 ? storedQuantity : 1;
                        return h("div", { key: entry.id, className: "ledger-result-object-group" },
                          h("div", { className: "ledger-row is-owned ledger-result-object-row", ...dragProps(entry) },
                            h("span", { className: "ledger-result-object-marker", "aria-hidden": true }, "−"),
                            h("span", { className: "ledger-row-name ledger-result-object-name" }, entry.name),
                            h("span", { className: "ledger-row-kind" }, kindLabel(entry.kind)),
                            h("span", { className: "ledger-result-object-quantity", "aria-label": "数量 " + quantity }, "×" + quantity),
                            h("span", { className: "ledger-row-cost" },
                              entry.cost?.lp ? entry.cost.lp + "LP" : entry.cost?.shards ? entry.cost.shards + "欠片" : "—"),
                            h("details", { className: "ledger-result-object-actions" },
                              h("summary", { "aria-label": entry.name + " の操作", title: "この明細の操作" }, "操作"),
                              h("div", { className: "ledger-result-object-action-menu" },
                                h("button", {
                                  type: "button", className: "ledger-row-move-action",
                                  "aria-pressed": movingEntryId === entry.id,
                                  "aria-label": entry.name + " の移動先を選択",
                                  title: "ドラッグできない場合は、移動先カードを選べます",
                                  onClick: () => startMoveEntry(entry)
                                }, movingEntryId === entry.id ? "選択中" : "移動"),
                                h("button", {
                                  type: "button", className: "ledger-row-release",
                                  title: "帰属を外して未分類へ戻す", "aria-label": entry.name + " の帰属を外す",
                                  onClick: () => moveEntry(entry.id, null)
                                }, "解除"),
                                h("button", {
                                  type: "button", className: "ledger-row-trash",
                                  title: "削除する（Ctrl+Z で取り消せます）", "aria-label": entry.name + " を削除する",
                                  onClick: () => { if (movingEntryId === entry.id) setMovingEntryId(null); dispatch({ type: "PURGE_ENTRY", id: entry.id }); }
                                }, "削除")
                              )
                            )
                          ),
                          specialEnhancements.length > 0 && h("div", { className: "ledger-object-enhancements" },
                            specialEnhancements.map((enhancement, index) => {
                              const name = String(enhancement.name || "").trim();
                              const catalogEntry = catalogSpecial.find((candidate) => candidate?.name === name);
                              const effect = String(enhancement.effect || catalogEntry?.effect || "").trim();
                              return h("div", {
                                key: entry.id + ":" + name + ":" + index,
                                className: "ledger-object-enhancement"
                              },
                                h("span", { className: "ledger-object-enhancement-label" }, "特殊強化：" + name),
                                effect && h("details", {
                                  className: "ledger-object-enhancement-details",
                                  onToggle: (event) => {
                                    const details = event.currentTarget;
                                    if (!details.open) return;
                                    /* 展開文が固定フッターに隠れないよう、開いたら効果文を表示域へ入れる。 */
                                    requestAnimationFrame(() => details.querySelector("p")?.scrollIntoView({
                                      block: "center",
                                      behavior: "auto"
                                    }));
                                  }
                                },
                                  h("summary", null, "効果を表示"),
                                  h("p", null, effect)
                                )
                              );
                            })
                          )
                        );
                      }))
                )
              )
            )
          )
        )
      })
    ),
    sortedResults.length > 0 && h("nav", {
      className: "ledger-results-pagination", "aria-label": "リザルト一覧のページ"
    },
      h("span", { className: "ledger-results-page-label" },
        (safeResultPage * RESULTS_PAGE_SIZE + 1) + "–"
          + Math.min(sortedResults.length, (safeResultPage + 1) * RESULTS_PAGE_SIZE)
          + " / " + sortedResults.length + "件"
      ),
      h("div", { className: "ledger-results-page-actions" },
        h(Button, {
          size: "sm", variant: "quiet",
          disabled: safeResultPage === 0 || ticketPanel !== null,
          onClick: () => setResultPage(Math.max(0, safeResultPage - 1))
        }, "前へ"),
        h("span", { className: "ledger-results-page-number" }, (safeResultPage + 1) + " / " + resultPageCount),
        h(Button, {
          size: "sm", variant: "quiet",
          disabled: safeResultPage >= resultPageCount - 1 || ticketPanel !== null,
          onClick: () => setResultPage(Math.min(resultPageCount - 1, safeResultPage + 1))
        }, "次へ")
      )
    )
  );
};

const DEFAULT_FMLs = [
  { name: "MT", expr: "{\u30D1\u30EF\u30FC}-{\u865A\u5F31}+{\u5171\u9CF4}+{\u30B9\u30AD\u30EB\u5A01\u529B}+{\u30DE\u30C3\u30C1\u5A01\u529B\u5897\u52A0}-{\u30DE\u30C3\u30C1\u5A01\u529B\u4F4E\u4E0B}", builtin: true },
  { name: "DM", expr: "{\u30D1\u30EF\u30FC}-{\u865A\u5F31}+{\u5171\u9CF4}+{\u30B9\u30AD\u30EB\u5A01\u529B}+{\u30C0\u30E1\u30FC\u30B8\u91CF\u5897\u52A0}-{\u30C0\u30E1\u30FC\u30B8\u91CF\u6E1B\u5C11}", builtin: true },
  /* 守備威力は「進むべき守備」を得たときだけ足す前提なので、既定には入れない。
     generator.js の DEF_FMLS と同じ内容に保つこと（ここが設定画面の表示値）。 */
  { name: "DT", expr: "{\u5171\u9CF4}+{\u5FCD\u8010}-{\u6B66\u88C5\u89E3\u9664}+{\u30B9\u30AD\u30EB\u5A01\u529B}", builtin: true },
  { name: "QB", expr: "{\u30AF\u30A4\u30C3\u30AF}-{\u675F\u7E1B}", builtin: true }
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
    /* 既定ステータスの名称は各行の input が独立したコントロールで、可視ラベルは
       行の他の場所でしか示されないため、aria-label で明示的に名付ける。 */
    h("div", { className: "status-order-name" }, isDefault ? h("input", { className: "input", "aria-label": `${item.label}のステータス名`, value: status.label, disabled: linked, title: linked ? "HP/SANは人格と連動します" : "ステータス名", onChange: (event) => onPatchDefault(item.defaultIndex, { label: event.target.value }) }) : h("span", null, item.label)),
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
    // ただし noST（対象へ付与する目印）は自分が保持する値ではないため、出力順の一覧にも並べない。
    (state.uniqueBuffs || []).forEach((b) => { if ((b.place || "status") === "status" && b.noST !== true) push(b.name, "固有", { uniqueId: b.id, uniqueBuff: b, initial: b.initial ?? 0, max: b.max ?? 99 }); });
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
    /* 士気低下ラインはSAN最大値の25%（基本ルールPDF 39頁）から自動計算される派生値である。
       未入力なら算出値を表示し、根拠が分かるようにする。数値を入れた場合だけ手動指定になる。 */
    const moraleAuto = window.LBT_gen?.computeMoraleLine?.({ moraleLine: "" }, Number.parseInt(state.san, 10) || 0) ?? "";
    const moraleManual = String(state.moraleLine ?? "").trim();
    const list = [{
      id: "morale-line", type: "morale", label: "士気低下ライン",
      value: moraleManual === "" ? moraleAuto : moraleManual,
      manual: moraleManual, auto: moraleAuto,
      source: moraleManual === "" ? "SAN最大値の25%から自動" : "手動指定"
    }];
    const { atkModLabel, hasVigor, hasDefMod } = window.LBT_gen?.detectMTMods?.(state) || {};
    /* 自動付与されるラベルは「同じ名前の実ラベルより優先度が低い」。
       同じものが二重に並ぶと CCFOLIA 側で参照先が曖昧になり、
       利用者もどちらを直せばよいか分からなくなる。 */
    const declaredLabels = new Set([
      ...(state.uniqueBuffs || []).filter((buff) => (buff.place || "status") === "params" && buff.noST !== true).map((buff) => String(buff.name || "").trim()),
      ...(state.customStatuses || []).filter((item) => (item.place || "status") === "params").map((item) => String(item.label || "").trim()),
      ...(window.LBT_collectSkillDiceVars?.(state) || []).filter((item) => item.place === "params").map((item) => String(item.label || "").trim()),
      ...(state.skillFormulas || []).map((entry) => String(entry.name || "").trim()),
      ...(state.labels || []).map((entry) => String(entry.name ?? entry.label ?? "").trim())
    ].filter(Boolean));
    const derived = (id, label, source) => {
      if (declaredLabels.has(label)) return;
      list.push({ id, type: "derived", label, value: 1, source });
    };
    if (atkModLabel) derived("support-atk-mod", atkModLabel, "サポートから自動");
    if (hasVigor) derived("enh-vigor", "闘志", "強化から自動");
    if (hasDefMod) derived("enh-defense", "守備威力", "強化から自動");
    // 対象へ付与する目印（noST）は自分の参照値ではないため、ラベル一覧にも出さない。
    (state.uniqueBuffs || []).filter((buff) => (buff.place || "status") === "params" && buff.noST !== true).forEach((buff, index) => list.push({ id: `unique-${buff.id || index}`, type: "unique", label: buff.name || "名称未設定", value: buff.initial ?? "", source: "人格固有" }));
    (state.customStatuses || []).filter((item) => (item.place || "status") === "params").forEach((item) => list.push({ id: item.id, type: "custom", label: item.label || "", value: item.initial ?? 0, source: "カスタム", item }));
    (window.LBT_collectSkillDiceVars?.(state) || []).filter((item) => item.place === "params").forEach((item, index) => list.push({ id: `skill-${item.label || index}-${index}`, type: "skill", label: item.label || "名称未設定", value: "", source: "スキル変数" }));
    return list;
  }, [state.moraleLine, state.san, state.enhancements, state.uniqueBuffs, state.customStatuses, state.egoSlots, state.skills, state.personaSrc, state.supports]);
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
      /* 未入力＝自動計算なので、入力欄は空のままにして算出値をプレースホルダで示す。
         数値を消せば自動計算へ戻せる。 */
      return h("div", { key: entry.id, className: "label-param-row label-param-row--editable label-param-row--system" },
        h("div", { className: "label-param-read" }, h("strong", null, entry.label), h("small", null, `常に出力・自動 ${entry.auto}`)),
        h("label", { className: "label-param-field label-param-field--value" }, h("span", null, "値"), h("input", { className: "input", type: "number", value: entry.manual, placeholder: String(entry.auto ?? ""), title: "空欄ならSAN最大値の25%から自動計算します", onChange: (event) => onPatchMorale(event.target.value) })),
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
/* 駒整形の組み立て設定。ステータス一覧とラベル一覧はここが唯一の場所。
   設定側に同じ面を残すと、どちらで直したかを选民が追えなくなる。 */
const BuildParamsPanel = ({ state, dispatch }) => {
  const h = React.createElement;
  const setF = (field, value) => dispatch({ type: "SET_FIELD", field, value });
  const addCs = (place = "status") => setF("customStatuses", [...(state.customStatuses || []), { id: `cs-${Date.now()}`, label: "", initial: 0, max: 99, place }]);
  const patchCs = (id, patch) => setF("customStatuses", (state.customStatuses || []).map((c) => c.id === id ? { ...c, ...patch } : c));
  const rmCs = (id) => setF("customStatuses", (state.customStatuses || []).filter((c) => c.id !== id));
  const patchUb = (id, patch) => dispatch({ type: "PATCH_UB", id, patch });
  const dst = state.defaultStatuses || FACTORY_DEFAULT_STATUS;
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
    // noST は「対象に付与する目印で自分は保持しない」というDB宣言。自分のステータス一覧には出さない。
    (state.uniqueBuffs || []).filter((buff) => (buff.place || "status") === "status" && buff.type !== "中立バフ" && buff.noST !== true).forEach((buff) => add(buff.name, "人格固有", buff.initial ?? 0, buff.max ?? 99));
    (state.customStatuses || []).filter((status) => (status.place || "status") === "status").forEach((status) => add(status.label, "カスタム", status.initial ?? 0, status.max ?? 99));
    (window.LBT_collectSkillDiceVars?.(state) || []).filter((variable) => (variable.place || "status") === "status").forEach((variable) => add(variable.label, "スキル変数", variable.initial ?? 0, variable.max ?? 99));
    return list;
  }, [dst, state.hp, state.san, state.personaSrc, state.uniqueBuffs, state.customStatuses, state.egoSlots, state.skills, state.supports, state.enhancements]);
  const setDst = (list) => setF("defaultStatuses", list);
  /* 名前の変更にともに出力順（ui.statusOrder）も一緒に直す。
     直すのを忘れると、並び替えだけが反映されない行が残る。 */
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
    if (confirm("デフォルトステータスを出荷時（16項目）に戻しますか？")) setDst(FACTORY_DEFAULT_STATUS);
  };

  /* Custom-row renderers live HERE, not in SettingsSection: they are referenced
     by this function's JSX below, so they must be in scope before the return. */
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

  return h(React.Fragment, null,
    h("div", { className: "build-params-head" },
    h("span", { className: "t-label" }, "組み立て / BUILD PARAMETERS"),
    h("span", { className: "ledger-note" }, "出力順と既定値を決める場所")
    ),
          h("section", { className: "settings-major settings-major--static", "data-settings-category": "statuses" },
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
            h("div", { className: "settings-major-body stack-3" },
              h(LabelParamsPanel, { state, onAddCustom: addCs, onPatchCustom: patchCs, onRemoveCustom: rmCs, onPatchMorale: (value) => setF("moraleLine", value) }),
              h("details", { className: "settings-disclosure" }, h("summary", null, "出力しないカスタム項目"), h("div", { className: "settings-disclosure-body stack-2" },
                h("p", { className: "settings-section-note" }, "ここにある項目はメモ用で、CCFOLIA JSONのstatusにもparamsにも出力されません。"),
                h("div", { className: "settings-local-actions" }, h(Button, { size: "sm", variant: "ghost", icon: "plus", onClick: () => addCs("none") }, "項目を追加")),
                (state.customStatuses || []).filter((item) => (item.place || "status") === "none").length ? h("div", { className: "settings-hidden-custom-list" }, (state.customStatuses || []).filter((item) => (item.place || "status") === "none").map(hiddenCustomRow)) : h("div", { className: "empty", style: { padding: "var(--s-3)" } }, "出力しない項目はありません")
              ))
            )
          ),
  );
};

const SettingsSection = ({ state, dispatch }) => {
  const setF = (field, value) => dispatch({ type: "SET_FIELD", field, value });
  const addFml = () => setF("formulas", [...state.formulas, { id: `fml-${Date.now()}`, name: "", expr: "" }]);
  const patchFml = (id, patch) => setF("formulas", state.formulas.map((f) => f.id === id ? { ...f, ...patch } : f));
  const rmFml = (id) => setF("formulas", state.formulas.filter((f) => f.id !== id));
  const bov = state.builtinFormulasOverride || {};
  const setBov = (name, val) => setF("builtinFormulasOverride", { ...bov, [name]: val });
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
  const patchCs = (id, patch) => setF("customStatuses", state.customStatuses.map((c) => c.id === id ? { ...c, ...patch } : c));
  const rmCs = (id) => setF("customStatuses", state.customStatuses.filter((c) => c.id !== id));
  const dst = state.defaultStatuses || FACTORY_DEFAULT_STATUS;
  const setDst = (list) => setF("defaultStatuses", list);
  const h = React.createElement;
  const builtinRow = (formula) => {
    const overridden = typeof bov[formula.name] === "string";
    const hidden = bov[formula.name] === null;
    const value = overridden ? bov[formula.name] : formula.expr;
    return h("div", { key: formula.name, style: { display: "grid", gridTemplateColumns: "54px minmax(0, 1fr) auto", gap: "var(--s-2)", alignItems: "center", opacity: hidden ? .55 : 1 } },
      h("span", { className: "badge", style: { color: "var(--gold)", borderColor: "var(--gold-line)", fontFamily: "var(--f-mono)" } }, formula.name),
      hidden ? h("span", { style: { color: "var(--tx-mute)", fontSize: "var(--fs-11)" } }, "出力から非表示") : h("input", { className: "input", "aria-label": `${formula.name}の式`, value, onChange: (e) => setBov(formula.name, e.target.value), title: `${formula.name}の式` }),
      hidden ? h(Button, { size: "sm", variant: "ghost", icon: "undo", onClick: () => restoreBuiltin(formula.name) }, "復元") : h(Button, { size: "sm", variant: "ghost", icon: "trash", onClick: () => removeBuiltin(formula.name) }, "非表示")
    );
  };
  /* アカウントの切替・作成・編集・削除は js/accounts-ui.js の
     AccountSwitcher（SINNER SELECT オーバーレイ）に集約する。
     設定からはイベントを1つ投げるだけ。 */
  const openAccountSwitcher = () => window.dispatchEvent(new CustomEvent("lbt:open-accounts"));
  const sectionSummary = (name, hint, count) => h("summary", null, h("span", { className: "settings-major-name" }, name), h("span", { className: "settings-major-hint" }, hint), count !== undefined ? h("span", { className: "settings-major-count" }, count) : null);
  return h("div", { className: "stack-4 settings-linear" },
    h(Card, { className: "settings-linear-card" },
      h("div", { className: "card-header" }, h("div", null, h("span", { className: "t-label" }, "BUILD PARAMETERS / 設定"), h("div", { className: "settings-header-copy" }, "ステータスは一覧でその場で編集・並べ替えできます。代入式と危険な操作は必要なときだけ開きます。"))),
      h("div", { className: "card-body settings-linear-stack" },
        (state.selfStatusCandidates || []).length ? h("section", { className: "self-status-candidate-panel stack-2", "aria-label": "自己管理ステータスの検出候補" },
          h("div", { className: "settings-subhead" }, h("span", null, "自己管理ステータスの検出候補"), h("span", null, `${state.selfStatusCandidates.length}件・確認待ち`)),
          h("div", { className: "settings-section-note" }, "共通辞書にない文面候補です。DB指定と「得る／自分に付与」の根拠がある主要状態は自動で統合されます。ここでは根拠を確認し、追加する名称だけを選んでください。"),
          state.selfStatusCandidates.map((candidate) => h("div", { key: candidate.id, className: "self-status-candidate-row" },
            h("div", { className: "self-status-candidate-main" }, h("strong", null, candidate.label), h("span", null, `${candidate.source}${candidate.skillName ? ` / ${candidate.skillName}` : ""}`), h("small", null, candidate.evidence)),
            h("div", { className: "self-status-candidate-actions" }, h(Button, { size: "sm", variant: "secondary", icon: "check", onClick: () => dispatch({ type: "CONFIRM_SELF_STATUS_CANDIDATE", id: candidate.id }) }, "ステータスへ追加"), h(Button, { size: "sm", variant: "ghost", icon: "x", onClick: () => dispatch({ type: "DISMISS_SELF_STATUS_CANDIDATE", id: candidate.id }) }, "今回は追加しない"))
          ))
        ) : null,
h("details", { className: "settings-major", "data-settings-category": "share" },
          sectionSummary("同期情報の表示", "共有HTML・各種出力の人格情報表示"),
          h("div", { className: "settings-major-body stack-2" },
            h("label", { className: "settings-check-row" }, h("input", { type: "checkbox", checked: state.shareOptions?.showSyncRank !== false, onChange: (event) => setF("shareOptions", { ...(state.shareOptions || {}), showSyncRank: event.target.checked }) }), "同期ランクを共有HTMLへ表示"),
            h("label", { className: "settings-check-row" }, h("input", { type: "checkbox", checked: state.shareOptions?.showSyncRankInOutput === true, onChange: (event) => setF("shareOptions", { ...(state.shareOptions || {}), showSyncRankInOutput: event.target.checked }) }), "同期ランクをMEMO・PALETTEへ表示"),
            h("p", { className: "settings-section-note" }, "同期MAXは同期ランクとは別状態です。設定されている場合は、共有HTML・MEMOの人格名に[MAX]を常に付記します。"),
            h("p", { className: "settings-section-note" }, "効果段落の▶︎は設定ではなく、PALETTEのプレビューツールバー（全展開・全折畳の隣）で切り替えます。本文と段落は変わりません。")
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
h("input", { className: "input", "aria-label": `${formula.name || "無題"}の変数名`, value: formula.name, placeholder: "変数名", onChange: (event) => patchFml(formula.id, { name: event.target.value }) }),
        h("input", { className: "input", "aria-label": `${formula.name || "無題"}の式`, value: formula.expr, placeholder: "式", onChange: (event) => patchFml(formula.id, { expr: event.target.value }) }),
                h("button", { className: "btn-ghost btn-icon", onClick: () => rmFml(formula.id), title: "削除" }, h(Icon, { name: "trash", size: 12 }))
              ))) : h("div", { className: "empty", style: { padding: "var(--s-3)" } }, "カスタム代入式はありません")
            )),
            h("details", { className: "settings-disclosure" }, h("summary", null, "出力補助"), h("div", { className: "settings-disclosure-body stack-2" },
              h("label", { className: "settings-check-row" }, h("input", { type: "checkbox", checked: state.autoFml !== false, onChange: (event) => setF("autoFml", event.target.checked) }), "効果テキストから代入式へ自動反映"),
              h(Field, { label: "士気低下ライン", hint: "空欄ならSAN最大値の25%（基本ルール39頁）から自動計算します" }, h("input", { id: "lbt-morale-line", className: "input", type: "number", value: state.moraleLine, placeholder: String(window.LBT_gen?.computeMoraleLine?.({ moraleLine: "" }, Number.parseInt(state.san, 10) || 0) ?? ""), onChange: (event) => setF("moraleLine", event.target.value) })),
              /* AutoTextarea はコンポーネントなので Field の htmlFor 対象にならない。
                 aria-label を明示して命名する。 */
              h(Field, { label: "追記コマンド", labelFor: "lbt-extra-cmd" }, h(AutoTextarea, { id: "lbt-extra-cmd", className: "textarea", minRows: 2, value: state.extraCmd, placeholder: "自由記述（出力末尾に追加）", onChange: (event) => setF("extraCmd", event.target.value) }))
            ))
          )
        ),
        h("details", { className: "settings-major", "data-settings-category": "accounts", open: true },
          sectionSummary("アカウント / キャラクター", "キャラクター・用途ごとの保存領域を切替"),
          h("div", { className: "settings-major-body stack-3" },
            h(AccountSummary, null),
            h("p", { className: "settings-section-note" }, "保存領域はアカウントごとに独立しています。切替・作成・削除はオーバーレイで行い、他のアカウントは書き換わりません。初回のみ、それまでの保存データが1つ目のアカウントへ自動で取り込まれ、元データは端末内にバックアップとして残ります。"),
            h("div", { className: "settings-local-actions" }, h(Button, { size: "sm", variant: "secondary", icon: "grid", onClick: openAccountSwitcher }, "アカウントを切替・管理"))
          )
        ),
        h("details", { className: "settings-major settings-major--danger", "data-settings-category": "danger" },
          sectionSummary("危険な操作", "作業状態・保存データの削除"),
          h("div", { className: "settings-major-body settings-local-actions is-danger" },
            h(Button, { size: "md", variant: "danger", icon: "trash", onClick: () => { if (confirm("全ての入力をクリアしますか？（所持・お気に入り・履歴は保持）")) { dispatch({ type: "RESET" }); toast("入力をクリアしました"); } } }, "作業状態をクリア"),
            h(Button, { size: "md", variant: "danger", icon: "trash", onClick: () => { if (confirm("このアカウントの保存済みデータを完全に削除しますか？（他アカウントと旧バックアップには影響しません）")) { if (window.LBT_accounts?.resetActive?.()) location.reload(); else toast("保存データを削除できませんでした"); } } }, "このアカウントを完全削除")
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
  BuildWorkspace,
  ShopSection,
  AcquireBar,
  RosterSection,
  SettingsSection,
  UniqueBuffsBlock
  // v52 (F): PersonaCodex 末尾で使う
});
