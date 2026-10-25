/* ---------------------------------------------------------------------------
   accounts-ui.js  →  @layer v66-accounts の実装側
   キャラクター単位の保存領域（js/state.js の window.LBT_accounts）を、
   ゲームのキャラクター選択画面（SINNER SELECT）のように切替・管理するUI。

   設計根拠:
     - アカウント＝キャラクターなので、一覧は「キャラクター選択」のメタファー。
       現在どのアカウントで作業中かを色・バッジ・金枠で常に視覚化する
       （アカウント切替UXの原則: visually distinguishable + active の明示）。
     - 作成・名前変更は prompt ではなくカード内インラインフォーム。
       「入力のために文脈が消える」モーダル連鎖を避ける。
     - フォーカストラップ・Esc・aria-modal は codebase の UtilitySheet /
       CommandPalette 規約に合わせる。
     - 色・余白・radius は design-system.css のトークンのみ（ハードコードなし）。
   --------------------------------------------------------------------------- */
const h = React.createElement;
const ACCOUNTS_CHANGED_EVENT = "lbt:accounts-changed";
const ACCOUNTS_OPEN_EVENT = "lbt:open-accounts";
/* ゲートでアカウントを選んだ通知。App が受けて state を差し替える。 */
const ACCOUNTS_ENTERED_EVENT = "lbt:accounts-entered";
/* 未作成アカウントのアイコン保留に使う仮ID。実アカウントIDと衝突しない。 */
const PENDING_ACCOUNT_ID = "__pending";

/* 案内役の相対時刻。絶対時刻は title で補う。 */
function relativeUpdatedAt(timestamp) {
  const ts = Number(timestamp) || 0;
  if (!ts) return "不明";
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "たった今";
  if (minutes < 60) return `${minutes}分前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}時間前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}日前`;
  const date = new Date(ts);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}
function accountMonogram(name) {
  const text = String(name || "").trim();
  return text ? Array.from(text)[0] : "?";
}
/* アイコン設定の導線を共通化する（ゲート・切替オーバーレイで共有）。
   1. ファイルを選ぶ（この時点では圧縮しない）
   2. 円形マスクのエディタで構図を決める
   3. 決定後にだけ切り抜き・圧縮して保存する
   accountId に PENDING_ACCOUNT_ID を渡すと保留扱い（未作成アカウント用）。 */
function useAccountIconEditor(onStored) {
  const [editing, setEditing] = React.useState(null);
  const startPick = (accountId) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/webp";
    input.style.display = "none";
    input.onchange = () => {
      const file = input.files?.[0];
      input.remove();
      if (!file) return;
      const sourceUrl = window.LBT_iconCrop?.loadIconSource?.(file, (message) => toast(message, "assertive"));
      if (sourceUrl) setEditing({ accountId, sourceUrl });
    };
    document.body.appendChild(input);
    input.click();
  };
  const clearIcon = (accountId) => {
    if (window.LBT_accounts?.removeIcon?.(accountId)) {
      announceAccountsChanged();
      toast("アイコンを外しました");
    } else {
      toast("アイコンを外せませんでした（保存領域が使用できません）", "assertive");
    }
  };
  const applyCrop = async (result) => {
    try {
      const saved = await saveCroppedIcon(editing.accountId, editing.sourceUrl, result);
      if (saved.rejected) { toast("アイコンを保存できませんでした（制限を超えた可能性があります）", "assertive"); return; }
      if (saved.pending) {
        onStored?.({ pending: true, data: saved.data, accountId: editing.accountId });
      } else {
        toast(saved.bytes > 0 ? `アイコンを設定しました（${Math.ceil(saved.bytes / 1024)}KB）` : "アイコンを設定しました");
        onStored?.({ accountId: editing.accountId });
      }
      try { URL.revokeObjectURL(editing.sourceUrl); } catch (_) {}
      setEditing(null);
    } catch (error) {
      toast(error?.message || "アイコンを設定できませんでした", "assertive");
    }
  };
  const cancelCrop = () => {
    if (editing?.sourceUrl) {
      try { URL.revokeObjectURL(editing.sourceUrl); } catch (_) {}
    }
    setEditing(null);
  };
  const editor = editing ? h(IconCropEditor, {
    open: true,
    sourceUrl: editing.sourceUrl,
    onCancel: cancelCrop,
    onApply: applyCrop
  }) : null;
  return { startPick, clearIcon, editor };
}

/* アイコン画像が設定されていれば画像、無ければ頭文字モノグラム。
   どちらも装飾なので読み上げはせず、隣のカード名が情報を担う。 */
function AccountMark({ icon, name, className }) {
  if (icon) {
    return h("span", { className: `acct-mark ${className || ""}`.trim(), "aria-hidden": "true" },
      h("img", { className: "acct-mark-img", src: icon, alt: "", width: 44, height: 44 })
    );
  }
  return h("span", { className: `acct-mark ${className || ""}`.trim(), "aria-hidden": "true" }, accountMonogram(name));
}
function readAccountInfo() {
  const list = window.LBT_accounts?.list?.() || { accounts: [], activeId: null };
  const icons = window.LBT_accounts?.icons?.() || {};
  return { accounts: list.accounts || [], activeId: list.activeId || null, icons };
}
function announceAccountsChanged() {
  window.dispatchEvent(new CustomEvent(ACCOUNTS_CHANGED_EVENT));
}
/* アイコン画像の保存。エディタで決めた構図を、指定サイズへ切り抜いて
   圧縮した dataURI を保存する。PENDING_ACCOUNT_ID は未作成アカウント用の
   保留（索引に存在しないため、作成後に適用する）。 */
async function saveCroppedIcon(accountId, sourceUrl, transform) {
  const result = await window.LBT_iconCrop?.cropToIconDataUrl?.(sourceUrl, transform);
  if (!result?.data) throw new Error("画像を圧縮できませんでした");
  if (accountId === PENDING_ACCOUNT_ID) return { pending: true, data: result.data, bytes: result.bytes || 0 };
  if (!window.LBT_accounts?.setIcon?.(accountId, result.data)) {
    return { rejected: true };
  }
  announceAccountsChanged();
  return { bytes: result.bytes || 0 };
}
function prefersReducedMotion() {
  return !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
}

/* 現在のアカウントを1件ぶん表示する小さな部品。topbar chip と設定エントリで共有。 */
const AccountChip = () => {
  const [info, setInfo] = React.useState(readAccountInfo);
  React.useEffect(() => {
    const onChange = () => setInfo(readAccountInfo());
    window.addEventListener(ACCOUNTS_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(ACCOUNTS_CHANGED_EVENT, onChange);
  }, []);
  const active = info.accounts.find((entry) => entry.id === info.activeId);
  const label = active?.name || "アカウント";
  const activeIcon = info.icons?.[info.activeId] || "";
  return h("button", {
    type: "button",
    className: "acct-chip",
    onClick: () => window.dispatchEvent(new CustomEvent(ACCOUNTS_OPEN_EVENT)),
    "aria-haspopup": "dialog",
    title: `アカウント: ${label}（${info.accounts.length}件）— 切替・管理を開く`
  },
    activeIcon
      ? h("span", { className: "acct-chip-mark", "aria-hidden": "true" }, h("img", { className: "acct-chip-img", src: activeIcon, alt: "" }))
      : h("span", { className: "acct-chip-mark", "aria-hidden": "true" }, accountMonogram(label)),
    h("span", { className: "acct-chip-name" }, label),
    h("span", { className: "acct-chip-count", "aria-hidden": "true" }, String(info.accounts.length)),
    h("span", { className: "acct-chip-arrow", "aria-hidden": "true" }, "▾")
  );
};

/* LP・欠片・抽出チケットの残高。どの画面でも見えるように topbar に常設する。
   .topbar-actions の中に入れると ≤640px と横向きで display:none に
   なるため、.topbar の直接子として置く。 */
const BalanceChip = ({ state, onClick }) => {
  const results = Array.isArray(state.results) ? state.results : [];
  const entries = Array.isArray(state.entries) ? state.entries : [];
  const balance = window.LBT_computeLedgerBalance
    ? window.LBT_computeLedgerBalance(results, entries)
    : { lp: 0, shards: 0 };
  /* チケットは種別・パック別で何枚あるかが違うため、総数で出す。
     内訳は title に載せる。 */
  const tickets = window.LBT_computeTicketBalance
    ? window.LBT_computeTicketBalance(results, entries)
    : { persona: 0, ego: 0, choice: 0, pack: {} };
  const num = (value) => Number(value || 0).toLocaleString("ja-JP");
  const ticketTotal = ["persona", "ego", "choice"].reduce((n, k) => n + (Number(tickets[k]) || 0), 0)
    + Object.values(tickets.pack || {}).reduce((n, v) => n + (Number(v) || 0), 0);
  const ticketBreakdown = [
    `人格 ${num(tickets.persona)}`, `E.G.O ${num(tickets.ego)}`, `選択 ${num(tickets.choice)}`,
    ...Object.entries(tickets.pack || {}).map(([name, n]) => `${name} ${num(n)}`)
  ].join(" / ");
  const ticketTitle = ticketTotal > 0 ? `、抽出チケット ${num(ticketTotal)}枚（${ticketBreakdown}）` : "";
  /* 視覚にも 0 枚を出しているため、aria からも落とさない。
     内訳は 1 枚以上あるときだけ添える（0 個の項目を列挙しても情報にならない）。 */
  const ticketAria = ticketTotal > 0 ? `、抽出チケット ${num(ticketTotal)}枚` : "、抽出チケット 0枚";
  return h("button", {
    type: "button",
    className: "topbar-balance",
    onClick,
    title: `残高 — LP ${num(balance.lp)} / 欠片 ${num(balance.shards)}${ticketTitle}。リザルトを開く`,
    "aria-label": `残高 LP ${num(balance.lp)}、欠片 ${num(balance.shards)}${ticketAria}。リザルトを開く`
  },
    h("span", { className: "topbar-balance-item" },
      h("span", { className: "topbar-balance-num" }, num(balance.lp)),
      h("span", { className: "topbar-balance-unit" }, "LP")),
    h("span", { className: "topbar-balance-sep", "aria-hidden": "true" }, "/"),
    h("span", { className: "topbar-balance-item" },
      h("span", { className: "topbar-balance-num" }, num(balance.shards)),
      h("span", { className: "topbar-balance-unit" }, "欠片")),
    /* 0 枚でも枠は残す。「持っていない」と「0 枚」は別だから。 */
    h("span", { className: "topbar-balance-sep", "aria-hidden": "true" }, "/"),
    h("span", { className: "topbar-balance-item" },
      h("span", { className: "topbar-balance-num" }, num(ticketTotal)),
      h("span", { className: "topbar-balance-unit" }, "枚"))
  );
};

/* 設定セクション用の現在アカウント要約 + 切替への導線。 */
const AccountSummary = () => {
  const [info, setInfo] = React.useState(readAccountInfo);
  React.useEffect(() => {
    const onChange = () => setInfo(readAccountInfo());
    window.addEventListener(ACCOUNTS_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(ACCOUNTS_CHANGED_EVENT, onChange);
  }, []);
  const active = info.accounts.find((entry) => entry.id === info.activeId);
  const unavailable = !info.accounts.length;
  return h("div", { className: "acct-summary" },
    h("div", { className: "acct-summary-main" },
      h(AccountMark, { icon: info.icons?.[info.activeId], name: active?.name, className: "acct-summary-mark" }),
      h("div", { className: "acct-summary-text" },
        h("strong", null, unavailable ? "アカウントを読み込めませんでした" : active?.name),
        h("span", null, unavailable
          ? "端末内への保存が有効なブラウザで開いてください。"
          : [active?.purpose ? `用途: ${active.purpose}` : "用途タグなし", `最終更新 ${relativeUpdatedAt(active?.updatedAt)}`, `${info.accounts.length}件の保存領域`].join("・"))
      )
    )
  );
};

/* 取り込みは 1 手で適用する。ADD_RESULT と ADD_ENTRY の紐付けは
   reducer（APPLY_IMPORT_BATCH）が解決するので、UNDO 1 回で全部戻る。
   状態の所在は App なので、ここはイベントを投げるだけ。 */
function applyGarasumadoImport(result) {
  const actions = (result && (result.actions || result.rosterActions)) || [];
  if (!actions.length) { toast("取り込むものが選ばれていません"); return; }
  window.dispatchEvent(new CustomEvent("lbt:apply-import", {
    detail: { actions, skipped: (result && result.skipped) || [] }
  }));
}

const AccountCard = ({ entry, index, active, editing, draft, setDraft, icon, onSelect, onEdit, onRemove, onSave, onCancel, onPickIcon, onClearIcon, canRemove, onImport }) => {
  const onDraftKeyDown = (save) => (event) => {
    if (event.key === "Enter") { event.preventDefault(); save(); }
    if (event.key === "Escape") { event.preventDefault(); onCancel(); }
  };
  /* 硝子窓からの取り込み。URL を貼って内容を読み込み、何を入れるかを選ぶ面。
     編集中だけ出す。保存パネルを開く前に「取り込むもの」を決める流れ。 */
  const [importOpen, setImportOpen] = React.useState(false);
  React.useEffect(() => { if (!editing) setImportOpen(false); }, [editing]);

  if (editing) {
    return h("div", { className: `acct-card acct-card--form${importOpen ? " acct-card--import-open" : ""}`, style: { "--i": index } },
      h("span", { className: "acct-form-kicker" }, "編集中"),
      h("label", { className: "acct-field" }, h("span", null, "アカウント名"), h("input", {
        className: "input", value: draft.name, autoFocus: true, maxLength: 40,
        onChange: (event) => setDraft({ ...draft, name: event.target.value }),
        onKeyDown: onDraftKeyDown(onSave)
      })),
      h("label", { className: "acct-field" }, h("span", null, "用途タグ"), h("input", {
        className: "input", value: draft.purpose, maxLength: 40, placeholder: "本番 / 検証 / 配布",
        onChange: (event) => setDraft({ ...draft, purpose: event.target.value }),
        onKeyDown: onDraftKeyDown(onSave)
      })),
      h("div", { className: "acct-icon-row" },
        h("span", { className: "acct-icon-row-label" }, "アイコン"),
        h(AccountMark, { icon, name: draft.name || entry.name }),
        h("div", { className: "acct-icon-row-actions" },
          h("button", { type: "button", className: "acct-upload-btn", onClick: onPickIcon }, "画像を選択"),
          icon ? h("button", { type: "button", className: "acct-upload-btn is-clear", onClick: onClearIcon, title: "アイコンを外して頭文字に戻す" }, "解除") : null,
        ),
        h("p", { className: "acct-icon-row-note" }, "PNG・JPEG・WebPを自動で圧縮して端末内に保存します（最大24KB・正方形に中央切り抜き）。")
      ),
      h("section", { className: "acct-gara-row", "aria-label": "硝子窓の共有URL取り込み" },
        h("div", { className: "acct-gara-copy" },
          h("span", { className: "acct-gara-title" }, "硝子窓の共有データ"),
          h("p", { className: "acct-gara-note" }, "共有URLから所持品や購入履歴などを読み込み、反映前に内容を確認できます。")
        ),
        h("button", {
          type: "button",
          className: `acct-import-toggle${importOpen ? " is-open" : ""}`,
          "aria-expanded": importOpen,
          "aria-controls": `acct-import-panel-${entry.id}`,
          onClick: () => setImportOpen((v) => !v)
        },
          h(Icon, { name: "link", size: 16 }),
          h("span", null, importOpen ? "取り込みを閉じる" : "共有URLから取り込む"),
          h(Icon, { name: importOpen ? "chevron-up" : "chevron-down", size: 14 })
        )
      ),
      importOpen ? h("div", { className: "acct-gara-body", id: `acct-import-panel-${entry.id}`, role: "region", "aria-label": "共有URLの取り込み" },
        h(window.GarasumadoImportPanel, {
          onClose: () => setImportOpen(false),
          onApply: (result) => {
            onImport?.(result);
            setImportOpen(false);
          }
        })
      ) : null,
      h("div", { className: "acct-form-actions" },
        h(Button, { size: "sm", variant: "primary", icon: "check", onClick: onSave }, "保存"),
        h(Button, { size: "sm", variant: "ghost", onClick: onCancel }, "キャンセル")
      )
    );
  }
  const cardLabel = `アカウント「${entry.name}」へ切替（${entry.purpose ? `用途 ${entry.purpose}・` : ""}最終更新 ${relativeUpdatedAt(entry.updatedAt)}）`;
  return h("div", { className: `acct-card${active ? " is-active" : ""}`, style: { "--i": index } },
    active ? null : h("button", { type: "button", className: "acct-card-hit", onClick: onSelect, "aria-label": cardLabel, title: `${entry.name} を開く` }),
    h("div", { className: "acct-card-body" },
      h(AccountMark, { icon, name: entry.name }),
      h("span", { className: "acct-name" }, entry.name),
      entry.purpose ? h("span", { className: "acct-purpose" }, entry.purpose) : null,
      h("span", { className: "acct-meta" }, `最終更新 ${relativeUpdatedAt(entry.updatedAt)}`)
    ),
    active ? h("span", { className: "acct-badge" }, h(Icon, { name: "check", size: 10 }), "使用中") : null,
    h("div", { className: "acct-card-actions" },
      h("button", { type: "button", className: "acct-icon-btn acct-edit-btn", onClick: onEdit, title: "名前と用途を編集", "aria-label": `${entry.name} の名前と用途を編集` }, h(Icon, { name: "edit", size: 12 }), h("span", null, "編集")),
      canRemove ? h("button", { type: "button", className: "acct-icon-btn is-danger", onClick: onRemove, title: "このアカウントを削除", "aria-label": `${entry.name} を削除` }, h(Icon, { name: "trash", size: 12 })) : null
    )
  );
};

const AccountSwitcher = ({ open, onClose, initialEditId }) => {
  const panelRef = React.useRef(null);

  const [info, setInfo] = React.useState(readAccountInfo);
  const [editingId, setEditingId] = React.useState(null);
  const [creating, setCreating] = React.useState(false);
  const [draft, setDraft] = React.useState({ name: "", purpose: "" });

  const [pendingIcon, setPendingIcon] = React.useState("");
  const [closing, setClosing] = React.useState(false);
  const closeTimer = React.useRef(null);

  React.useEffect(() => {
    if (!open) { setEditingId(null); setCreating(false); setClosing(false); }
    const onChange = () => setInfo(readAccountInfo());
    window.addEventListener(ACCOUNTS_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(ACCOUNTS_CHANGED_EVENT, onChange);
  }, [open]);

  /* 起動時ゲートの「編集」から来た場合は、一覧を挟まず対象アカウントの編集フォームを直接開く。 */
  React.useEffect(() => {
    if (!open || !initialEditId) return;
    const entry = readAccountInfo().accounts.find((account) => account.id === initialEditId);
    if (!entry) return;
    setCreating(false);
    setEditingId(entry.id);
    setDraft({ name: entry.name, purpose: entry.purpose || "" });
    setPendingIcon("");
  }, [open, initialEditId]);

  const requestClose = React.useCallback(() => {
    if (prefersReducedMotion()) { onClose(); return; }
    setClosing(true);
    closeTimer.current = window.setTimeout(() => { setClosing(false); onClose(); }, 140);
  }, [onClose]);
  React.useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  /* フォーカストラップ + Esc。UtilitySheet と同じ規約。 */
  React.useEffect(() => {
    if (!open) return;
    const focusables = () => Array.from(panelRef.current?.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select, textarea') || []).filter((node) => node.getClientRects().length > 0);
    const frame = requestAnimationFrame(() => focusables()[0]?.focus());
    const onKeyDown = (event) => {
      if (event.key === "Escape") { event.preventDefault(); requestClose(); return; }
      if (event.key !== "Tab") return;
      const items = focusables();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => { cancelAnimationFrame(frame); window.removeEventListener("keydown", onKeyDown); };
  }, [open, requestClose]);

  /* アイコンは「選ぶ → 円形エディタで構図を決める → 決定後に圧縮して保存」。
     Hook は早期 return より前に置く。後ろに置くと開閉で Hook 数が変わり、
     React が "Rendered more hooks than during the previous render" (#310) で
     落ちて topbar ごと消える。cancelForm は通常の関数なので参照は遅延してよい。 */
  const iconEditor = useAccountIconEditor((stored) => {
    if (stored.pending) setPendingIcon(stored.data);
    else cancelFormRef.current?.();
  });
  const cancelFormRef = React.useRef(null);

  if (!open) return null;

  const total = info.accounts.length;
  const startEdit = (entry) => { setCreating(false); setEditingId(entry.id); setDraft({ name: entry.name, purpose: entry.purpose || "" }); };
  const cancelForm = () => { setEditingId(null); setCreating(false); setDraft({ name: "", purpose: "" }); setPendingIcon(""); };
  cancelFormRef.current = cancelForm;
  const requiredName = () => {
    if (!draft.name.trim()) { toast("アカウント名を入力してください", "assertive"); return false; }
    return true;
  };
  const saveEdit = () => {
    if (!requiredName()) return;
    const updated = window.LBT_accounts?.update?.(editingId, { name: draft.name.trim(), purpose: draft.purpose.trim() });
    if (!updated) {
      toast("アカウントを更新できませんでした（保存領域が使用できません）", "assertive");
      return;
    }
    cancelForm();
    announceAccountsChanged();
    toast("アカウントを更新しました");
  };
  const saveCreate = () => {
    if (!requiredName()) return;
    const created = window.LBT_accounts?.create?.(draft.name.trim(), draft.purpose.trim());
    if (!created) { toast("アカウントを作成できませんでした（保存領域が使用できません）", "assertive"); return; }
    const iconSaved = !pendingIcon || window.LBT_accounts?.setIcon?.(created.id, pendingIcon) === true;
    cancelForm();
    announceAccountsChanged();
    if (!iconSaved) {
      toast("アカウントは作成されましたが、アイコンを保存できませんでした。後から設定できます。", "assertive");
      return;
    }
    if (window.LBT_accounts?.switch?.(created.id)) location.reload();
    else toast("アカウントは作成されましたが、切替に失敗しました。一覧から選択してください。", "assertive");
  };
  const doSelect = (id) => {
    if (window.LBT_accounts?.switch?.(id)) location.reload();
    else toast("アカウントを切替できませんでした", "assertive");
  };
  const doRemove = (entry) => {
    if (!confirm(`アカウント「${entry.name}」を削除しますか？\nこの保存領域は復元できません。他のアカウントと旧データのバックアップには影響しません。`)) return;
    if (window.LBT_accounts?.delete?.(entry.id)) { announceAccountsChanged(); location.reload(); }
    else if (info.accounts.length <= 1) toast("最後のアカウントは削除できません", "assertive");
    else toast("アカウントを削除できませんでした（保存領域が使用できない可能性があります）", "assertive");
  };

  return h("div", {
    className: `acct-overlay${closing ? " is-closing" : ""}`,
    onClick: (event) => { if (event.target === event.currentTarget) requestClose(); }
  },
    h("section", { ref: panelRef, className: "acct-panel", role: "dialog", "aria-modal": "true", "aria-labelledby": "acct-panel-title" },
      h("header", { className: "acct-panel-head" },
        h("div", null,
          h("div", { className: "acct-kicker", id: "acct-panel-title" }, "◈ SINNER SELECT"),
          h("p", { className: "acct-lead" }, "キャラクターごとに保存領域が分かれています。選ぶと作業状態・所持データ・お気に入りが入れ替わります。")
        ),
        h("button", { type: "button", className: "acct-close", onClick: requestClose, title: "閉じる (Esc)", "aria-label": "アカウント切替を閉じる" }, h(Icon, { name: "x", size: 16 }))
      ),
      total === 0 ? h("div", { className: "acct-empty" }, "端末内への保存が有効なブラウザで開いてください。") : null,
      total > 0 ? h("div", { className: "acct-grid" },
        info.accounts.map((entry, index) => h(AccountCard, {
          key: entry.id,
          entry,
          index,
          active: entry.id === info.activeId,
          editing: editingId === entry.id,
          draft,
          setDraft,
          icon: info.icons?.[entry.id] || "",
          onSelect: () => doSelect(entry.id),
          onEdit: () => startEdit(entry),
          onRemove: () => doRemove(entry),
          onSave: saveEdit,
          onCancel: cancelForm,
          onPickIcon: () => iconEditor.startPick(entry.id),
          onClearIcon: () => iconEditor.clearIcon(entry.id),
          canRemove: total > 1,
          onImport: (result) => applyGarasumadoImport(result)
        })),
        creating ? h("div", { className: "acct-card acct-card--form", style: { "--i": total } },
          h("span", { className: "acct-form-kicker" }, "新規アカウント"),
          h("label", { className: "acct-field" }, h("span", null, "アカウント名"), h("input", {
            className: "input", value: draft.name, autoFocus: true, maxLength: 40,
            onChange: (event) => setDraft({ ...draft, name: event.target.value }),
            onKeyDown: (event) => { if (event.key === "Enter") { event.preventDefault(); saveCreate(); } if (event.key === "Escape") { event.preventDefault(); cancelForm(); } }
          })),
          h("label", { className: "acct-field" }, h("span", null, "用途タグ"), h("input", {
            className: "input", value: draft.purpose, maxLength: 40, placeholder: "本番 / 検証 / 配布",
            onChange: (event) => setDraft({ ...draft, purpose: event.target.value }),
            onKeyDown: (event) => { if (event.key === "Enter") { event.preventDefault(); saveCreate(); } if (event.key === "Escape") { event.preventDefault(); cancelForm(); } }
          })),
          h("div", { className: "acct-icon-row" },
            h("span", { className: "acct-icon-row-label" }, "アイコン"),
            h(AccountMark, { icon: pendingIcon, name: draft.name }),
            h("div", { className: "acct-icon-row-actions" },
              h("button", { type: "button", className: "acct-upload-btn", onClick: () => iconEditor.startPick(PENDING_ACCOUNT_ID) }, "画像を選択"),
              pendingIcon ? h("button", { type: "button", className: "acct-upload-btn is-clear", onClick: () => setPendingIcon("") }, "解除") : null
            ),
            h("p", { className: "acct-icon-row-note" }, "画像を選んで枠に収める部分を決めます。決定後、256px・最大24KBへ圧縮して端末内に保存します。")
          ),
          h("div", { className: "acct-form-actions" },
            h(Button, { size: "sm", variant: "primary", icon: "plus", onClick: saveCreate }, "作成して切替"),
            h(Button, { size: "sm", variant: "ghost", onClick: cancelForm }, "キャンセル")
          )
        ) : null,
        !creating ? h("button", {
          type: "button",
          className: "acct-card acct-card--add",
          style: { "--i": total },
          onClick: () => { setEditingId(null); setCreating(true); setDraft({ name: "", purpose: "" }); }
        },
          h("span", { className: "acct-add-plus", "aria-hidden": "true" }, "+"),
          h("span", null, "新しいアカウント")
        ) : null
      ) : null,
      h(window.LBTCloudBackupPanel || "div", { compact: true }),
      h("footer", { className: "acct-panel-foot" },
        h("span", null, total > 0 ? `${total}件のアカウント・この端末内に保存` : "保存領域なし"),
        h("span", { className: "acct-foot-note" }, "切替・作成で他のアカウントは書き換わりません。初回移行時の旧データはバックアップとして残ります。")
      ),
      iconEditor.editor
    )
  );
};
Object.assign(window, { AccountSwitcher, AccountChip, AccountSummary, BalanceChip, ACCOUNTS_CHANGED_EVENT, ACCOUNTS_OPEN_EVENT });

/* ---------------------------------------------------------------------------
   AccountGate — アクセス時のアカウント選択ゲート。

   ページを開いたら最初にこの画面を出し、アカウントを選んでから本体へ入る。
   本体（編集中のビルド）は「どのアカウントのデータか」が決まるまで描画しない。
   これにより、前回の作業状態が別アカウントの画面へ一瞬でも漏れない。

   対象:
     - 選択済みアカウントが無い（初回アクセス・全削除後）
     - アカウントが2件以上ある場合の毎回確認
     1件のみの場合は選ぶ余地が無いので自動で抜ける（gate 不要）。
--------------------------------------------------------------------------- */
const AccountGate = () => {

  const [info, setInfo] = React.useState(readAccountInfo);
  const [creating, setCreating] = React.useState(false);
  const [draft, setDraft] = React.useState({ name: "", purpose: "" });
  const [pendingIcon, setPendingIcon] = React.useState("");


  React.useEffect(() => {
    const onChange = () => setInfo(readAccountInfo());
    window.addEventListener(ACCOUNTS_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(ACCOUNTS_CHANGED_EVENT, onChange);
  }, []);

  /* 選んだアカウントで開く。ページ再読込はしない（常時ゲートと競合して
     「選んでもう一度ゲート」のループになる）。App へ通知し、state を
     そのアカウントの保存領域で差し替えてもらう。 */
  const choose = (id) => {
    if (!window.LBT_accounts?.switch?.(id)) { toast("アカウントを読み出せませんでした", "assertive"); return; }
    window.dispatchEvent(new CustomEvent(ACCOUNTS_ENTERED_EVENT, { detail: { id } }));
  };
  /* アイコンは「選ぶ → 円形エディタで構図を決める → 決定後に圧縮して保存」。 */
  const iconEditor = useAccountIconEditor((stored) => {
    if (stored.pending) setPendingIcon(stored.data);
  });
  const create = () => {
    if (!draft.name.trim()) { toast("アカウント名を入力してください", "assertive"); return; }
    const created = window.LBT_accounts?.create?.(draft.name.trim(), draft.purpose.trim());
    if (!created) { toast("アカウントを作成できませんでした（保存領域が使用できません）", "assertive"); return; }
    if (pendingIcon) window.LBT_accounts?.setIcon?.(created.id, pendingIcon);
    if (!window.LBT_accounts?.switch?.(created.id)) { toast("アカウントを作成しました。一覧から選び直してください", "assertive"); return; }
    window.dispatchEvent(new CustomEvent(ACCOUNTS_ENTERED_EVENT, { detail: { id: created.id } }));
  };

  const accounts = info.accounts;
  /* ゲート表示中は本体が出ないので、この画面自身が main ランドマクトになる。
     内側の panel は role=dialog を保ち、ランドマクトとモーダルを両立する。 */
  return h("main", { className: "acct-gate" },
    h("div", { className: "acct-gate-panel", role: "dialog", "aria-modal": "true", "aria-labelledby": "acct-gate-title" },
      h("header", { className: "acct-panel-head" },
        h("div", null,
          h("h1", { className: "acct-kicker", id: "acct-gate-title" }, "◈ SINNER SELECT"),
          h("p", { className: "acct-lead" }, "作業するキャラクター（アカウント）を選んでください。保存領域はキャラクターごとに分かれ、いつでも切替えられます。")
        )
      ),
      accounts.length === 0 ? h("div", { className: "acct-empty" }, "まずキャラクターを作成してください。") : null,
      h("div", { className: "acct-grid" },
        accounts.map((entry, index) => h("div", { key: entry.id, className: `acct-card acct-card--gate${entry.id === info.activeId ? " is-active" : ""}`, style: { "--i": index } },
          h("button", {
            type: "button",
            className: "acct-gate-edit-btn",
            onClick: (event) => {
              event.stopPropagation();
              window.dispatchEvent(new CustomEvent(ACCOUNTS_OPEN_EVENT, { detail: { editId: entry.id } }));
            },
            "aria-haspopup": "dialog",
            "aria-label": `${entry.name} のアカウント設定を編集`,
            title: "アカウント設定を編集"
          }, h("span", { "aria-hidden": "true" }, "✎"), h("span", null, "編集")),
          h("button", { type: "button", className: "acct-card-hit", onClick: () => choose(entry.id), "aria-label": `${entry.name} で作業を始める（${entry.purpose ? `用途 ${entry.purpose}・` : ""}最終更新 ${relativeUpdatedAt(entry.updatedAt)}）` }),
          h("div", { className: "acct-card-body" },
            h(AccountMark, { icon: info.icons?.[entry.id], name: entry.name }),
            h("span", { className: "acct-name" }, entry.name),
            entry.purpose ? h("span", { className: "acct-purpose" }, entry.purpose) : null,
            h("span", { className: "acct-meta" }, `最終更新 ${relativeUpdatedAt(entry.updatedAt)}`)
          ),
          h("span", { className: "acct-gate-cta" }, "このキャラで開く")
        )),
        creating ? h("div", { className: "acct-card acct-card--form", style: { "--i": accounts.length } },
          h("span", { className: "acct-form-kicker" }, "新しいキャラクター"),
          h("label", { className: "acct-field" }, h("span", null, "アカウント名"), h("input", {
            className: "input", value: draft.name, autoFocus: true, maxLength: 40, placeholder: "キャラクター名など",
            onChange: (event) => setDraft({ ...draft, name: event.target.value }),
            onKeyDown: (event) => { if (event.key === "Enter") { event.preventDefault(); create(); } }
          })),
          h("label", { className: "acct-field" }, h("span", null, "用途タグ"), h("input", {
            className: "input", value: draft.purpose, maxLength: 40, placeholder: "本番 / 検証 / 配布",
            onChange: (event) => setDraft({ ...draft, purpose: event.target.value }),
            onKeyDown: (event) => { if (event.key === "Enter") { event.preventDefault(); create(); } }
          })),
          h("div", { className: "acct-icon-row" },
            h("span", { className: "acct-icon-row-label" }, "アイコン"),
            h(AccountMark, { icon: pendingIcon, name: draft.name }),
            h("div", { className: "acct-icon-row-actions" },
              h("button", { type: "button", className: "acct-upload-btn", onClick: () => iconEditor.startPick(PENDING_ACCOUNT_ID) }, "画像を選択"),
              pendingIcon ? h("button", { type: "button", className: "acct-upload-btn is-clear", onClick: () => setPendingIcon("") }, "解除") : null
            ),
            h("p", { className: "acct-icon-row-note" }, "画像を選んで枠に収める部分を決めます。決定後、256px・最大24KBへ圧縮して端末内に保存します。")
          ),
          h("div", { className: "acct-form-actions" },
            h(Button, { size: "sm", variant: "primary", icon: "check", onClick: create }, "作成して開く"),
            h(Button, { size: "sm", variant: "ghost", onClick: () => { setCreating(false); setPendingIcon(""); } }, "キャンセル")
          )
        ) : null,
        !creating ? h("button", {
          type: "button",
          className: "acct-card acct-card--add",
          style: { "--i": accounts.length },
          onClick: () => { setCreating(true); setDraft({ name: "", purpose: "" }); setPendingIcon(""); }
        },
          h("span", { className: "acct-add-plus", "aria-hidden": "true" }, "+"),
          h("span", null, "新しいキャラクター")
        ) : null
      ),
      h(window.LBTCloudBackupPanel || "div", { compact: true }),
      h("footer", { className: "acct-panel-foot" },
        h("span", null, accounts.length > 0 ? `${accounts.length}件のアカウント・この端末内に保存` : "保存領域なし"),
        h("span", { className: "acct-foot-note" }, "ローカル保存はこの端末のブラウザに残ります。オンライン保全を設定した場合は、明示したデータをクラウドにも保存します。初回のみ、旧保存データを1つ目のアカウントへ取り込みます。")
      ),
      iconEditor.editor
    )
  );
};
Object.assign(window, { AccountGate });
