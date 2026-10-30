const ItemCodex = ({ state, dispatch }) => {
  const h = React.createElement;
  const officialItems = Array.isArray(window.DB?.items) ? window.DB.items : [];
  const specialItems = Array.isArray(window.DB?.specialItems) ? window.DB.specialItems : [];
  const customItems = Array.isArray(state.customItems) ? state.customItems : [];
  const items = React.useMemo(() => [...officialItems, ...specialItems, ...customItems], [officialItems, specialItems, customItems]);
  const inventory = Array.isArray(state.inventory) ? state.inventory : [];
  const ledgerBalance = window.LBT_computeLedgerBalance?.(state.results || [], state.entries || []) || { lp: 0, shards: 0 };
  const resourceQuantity = (item) => item?.ledgerResource === "shards" ? Math.max(0, Number(ledgerBalance.shards) || 0) : null;
  const [query, setQuery] = React.useState("");
  const [category, setCategory] = React.useState("all");
  const [ownedOnly, setOwnedOnly] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState(items[0]?.id || "");
  React.useEffect(() => {
    if (!items.some((item) => item.id === selectedId)) setSelectedId(items[0]?.id || "");
  }, [items, selectedId]);
  const searchTargetId = state.ui?.itemSearchTarget?.id || "";
  React.useEffect(() => {
    if (!searchTargetId || !items.some((item) => item.id === searchTargetId)) return;
    setQuery("");
    setCategory("all");
    setOwnedOnly(false);
    setSelectedId(searchTargetId);
    dispatch({ type: "SET_UI", ui: { itemSearchTarget: null } });
  }, [searchTargetId, items, dispatch]);
  const categories = React.useMemo(() => ["all", ...Array.from(new Set(items.map((item) => item.category).filter(Boolean)))], [items]);
  const byId = React.useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const entryById = React.useMemo(() => new Map(inventory.map((entry) => [entry.itemId, entry])), [inventory]);
  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (category !== "all" && item.category !== category) return false;
      if (ownedOnly && !entryById.has(item.id) && !(item.ledgerResource && resourceQuantity(item) > 0)) return false;
      if (!q) return true;
      const haystack = `${item.name} ${(item.searchAliases || []).join(" ")} ${item.category} ${(item.tags || []).join(" ")} ${item.effect}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [items, query, category, ownedOnly, entryById, ledgerBalance]);
  const selected = byId.get(selectedId) || visible[0] || items[0] || null;
  const selectedEntry = selected ? entryById.get(selected.id) : null;
  const selectedMaxOwned = selected ? (window.LBT_getItemMaxOwned?.(state, selected.id) || 99) : 99;
  const selectedHasCap = selectedMaxOwned < 99;
  const currentResultId = window.LBT_latestResultId?.(state) || "";
  const currentResult = (state.results || []).find((result) => result.id === currentResultId) || null;
  const selectedAddCost = selected
    ? (window.LBT_resolveAcquireCost?.("item", "purchase", { id: selected.id, name: selected.name, customItems }) || { lp: 0, shards: 0 })
    : { lp: 0, shards: 0 };
  const selectedAddNeedsCharge = !!selected?.specialResource || !selectedEntry;
  const selectedAffordable = !selectedAddNeedsCharge
    || !(Number(selectedAddCost.lp) > 0 || Number(selectedAddCost.shards) > 0)
    || window.LBT_purchaseAffordability?.(state, selectedAddCost)?.ok !== false;
  const selectedUnderCap = !selected || selected.ledgerResource === "shards"
    ? true
    : !selectedEntry || (Number(selectedEntry.quantity) || 0) < selectedMaxOwned;
  const [quantityDraft, setQuantityDraft] = React.useState("");
  const [consumeQuantityDraft, setConsumeQuantityDraft] = React.useState("1");
  const consumeQuantity = Number(consumeQuantityDraft);
  const canAddSelected = Boolean(selected)
    && selectedUnderCap
    && selectedAffordable
    && (selected?.ledgerResource !== "shards" || Number(ledgerBalance.lp) >= 2 && !!currentResultId);
  const canConsumeOne = Boolean(selectedEntry && currentResultId && (Number(selectedEntry.quantity) || 0) >= 1);
  const canConsumeSelected = Boolean(
    selectedEntry
    && currentResultId
    && /^\d+$/.test(consumeQuantityDraft)
    && Number.isSafeInteger(consumeQuantity)
    && consumeQuantity > 0
    && consumeQuantity <= (Number(selectedEntry.quantity) || 1)
  );
  React.useEffect(() => {
    setQuantityDraft(selectedEntry ? String(selectedEntry.quantity) : "");
  }, [selectedEntry?.uid, selectedEntry?.quantity]);
  React.useEffect(() => {
    setConsumeQuantityDraft("1");
  }, [selectedEntry?.uid, selectedEntry?.quantity]);
  const selectItem = (id) => setSelectedId(id);
  const addCustomItem = () => {
    const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    dispatch({ type: "ADD_CUSTOM_ITEM", item: { id, name: "新規オリジナルアイテム", category: "その他", tags: [], effect: "", palette: "", price: "", maxOwned: null } });
    setSelectedId(id);
    toast("オリジナルアイテムを追加しました。詳細から内容を編集できます");
  };
  const patchCustomItem = (patch) => selected?.custom && dispatch({ type: "PATCH_CUSTOM_ITEM", id: selected.id, patch });
  const removeCustomItem = () => {
    if (!selected?.custom) return;
    dispatch({ type: "REMOVE_CUSTOM_ITEM", id: selected.id });
    toast(`「${selected.name}」をオリジナルアイテム一覧から削除`);
  };
  const addItem = () => {
    if (!selected) return;
    if (!canAddSelected) {
      if (selected?.ledgerResource === "shards") {
        toast("自我の欠片は1個2LPです。LP残高が不足しています", "assertive");
      } else if (selectedAffordable === false) {
        const affordability = window.LBT_purchaseAffordability?.(state, selectedAddCost);
        toast(affordability?.reason || `「${selected.name}」の購入に必要な残高が不足しています`, "assertive");
      } else {
        toast(`「${selected.name}」は所持上限（×${selectedMaxOwned}）です`, "assertive");
      }
      return;
    }
    /* ADD_ITEM は価格付き特殊資源も含め、購入可否・通帳記録・在庫反映を一括処理する。
       ADD_ITEM_INVENTORY へ分岐すると硝子の破片などを価格なしで追加できてしまう。 */
    dispatch({ type: "ADD_ITEM", itemId: selected.id });
    const charged = selectedAddNeedsCharge && (Number(selectedAddCost.lp) > 0 || Number(selectedAddCost.shards) > 0);
    toast(charged
      ? `「${selected.name}」を購入しました（${selectedAddCost.label || "価格確認済み"}）`
      : selectedEntry ? `「${selected.name}」の所持数を追加` : `「${selected.name}」を所持品へ追加`);
  };
  const patchEntry = (patch) => selectedEntry && dispatch({ type: "PATCH_ITEM", uid: selectedEntry.uid, patch });
  const commitQuantity = () => {
    if (!selectedEntry) return;
    const quantity = Math.min(selectedMaxOwned, Math.max(1, Number.parseInt(quantityDraft, 10) || 1));
    patchEntry({ quantity });
    setQuantityDraft(String(quantity));
  };
  const removeItem = () => {
    if (!selectedEntry || !selected) return;
    const confirmed = window.confirm(
      `「${selected.name}」の所持登録を削除します。実際に使用した場合は「消費する」を使ってください。削除では消費履歴は作られず、所持品に紐づいた取得明細がある場合はそれも取り消されます。続行しますか？`
    );
    if (!confirmed) return;
    dispatch({ type: "REMOVE_ITEM", uid: selectedEntry.uid });
    toast(`「${selected.name}」の所持登録を削除しました`);
  };
  const applyConsumption = (quantity) => {
    if (!selected || !selectedEntry || !currentResultId
      || !Number.isSafeInteger(quantity) || quantity < 1
      || quantity > (Number(selectedEntry.quantity) || 0)) {
      toast("消費数を所持数以内で指定し、記録先リザルトを確認してください", "assertive");
      return;
    }
    const operationId = `item-use-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    dispatch({
      type: "CONSUME_ITEM",
      itemId: selected.id,
      quantity,
      reason: "consumption",
      operationId,
      resultId: currentResultId
    });
    toast(`「${selected.name}」×${quantity} を使用し、「${currentResult?.name || "最新リザルト"}」へ記録しました`);
  };
  const consumeItem = () => {
    if (!canConsumeSelected) {
      toast("消費数を所持数以内で指定してください", "assertive");
      return;
    }
    applyConsumption(consumeQuantity);
  };
  const consumeOne = () => {
    if (!canConsumeOne) {
      toast("消費を記録するリザルトがありません", "assertive");
      return;
    }
    applyConsumption(1);
  };
  const categoryLabel = (value) => value === "all" ? "全て" : value;
  return h("div", { className: "item-codex" },
    h("div", { className: "item-codex-intro" },
      h("div", null, h("div", { className: "item-codex-kicker" }, "ITEMS"), h("b", null, "アイテムを選択"), h("span", null, "導入済みのアイテムだけをMEMOとPALETTEへ反映します。")),
      h(Button, { size: "sm", variant: "secondary", icon: "plus", onClick: addCustomItem, title: "公式DBとは別にオリジナルアイテムを追加" }, "オリジナル追加"),
      h("div", { className: "item-codex-count" }, `${inventory.length} 種 / ${inventory.reduce((sum, entry) => sum + (Number(entry.quantity) || 0), 0)} 個 所持`)
    ),
    h("div", { className: "item-codex-toolbar" },
      h("label", { className: "item-search" }, h(Icon, { name: "search", size: 14 }), h("input", { value: query, onChange: (event) => setQuery(event.target.value), placeholder: "名前・効果・タグで検索..." })),
      h("div", { className: "item-filter-row" }, categories.map((value) => h("button", { key: value, type: "button", className: `item-filter${category === value ? " is-active" : ""}`, onClick: () => setCategory(value) }, categoryLabel(value), h("small", null, value === "all" ? items.length : items.filter((item) => item.category === value).length))),
      h("button", { type: "button", className: `item-filter item-owned-filter${ownedOnly ? " is-active" : ""}`, onClick: () => setOwnedOnly((current) => !current) }, h(Icon, { name: "item", size: 13 }), "導入済み"))
    ),
    h("div", { className: "item-codex-workspace" },
      h("div", { className: "item-list", role: "group", "aria-label": "アイテム一覧" }, visible.length ? visible.map((item) => {
        const entry = entryById.get(item.id);
        const itemMaxOwned = window.LBT_getItemMaxOwned?.(state, item.id) || 99;
        const itemHasCap = itemMaxOwned < 99;
        /* role="listitem" は button には許されない（aria-allowed-role の違反）。
           ARIA のリストパターンどおり、li 役の要素の外側に button を置く。
           これにより「35 個のボタン」として読め、選択状態も aria-selected で伝わる。 */
        /* role="listitem" は button に許されない（aria-allowed-role）。さらに
   aria-selected も listitem では許されない（同 aria-allowed-attr）。
   button の選択状態は aria-pressed で表現するのが ARIA の定石なので、
   listitem はラッパー（段落相当）に戻し、button 側に aria-pressed を置く。 */
        return h("div", { key: item.id, className: "item-listitem" },
          h("button", { type: "button", "aria-pressed": selected?.id === item.id, className: `item-row${selected?.id === item.id ? " is-selected" : ""}`, onClick: () => selectItem(item.id) },
            h("span", { className: "item-row-mark" }, h(Icon, { name: "item", size: 14 })),
            h("span", { className: "item-row-copy" }, h("b", null, item.name || "名称未設定", item.custom && h("em", { className: "item-custom-badge" }, "ORIGINAL")), h("small", null, `${item.category}　${(item.tags || []).join(" / ")}`)),
            entry
              ? h("span", { className: "item-quantity-badge" }, itemHasCap ? `×${entry.quantity} / ${itemMaxOwned}` : `×${entry.quantity}`)
              : item.ledgerResource
                ? h("span", { className: "item-quantity-badge" }, `×${resourceQuantity(item)}`)
                : null
          )
        );
      }) : h("div", { className: "item-empty" }, "該当するアイテムはありません。")),
      selected && h("section", { className: "item-detail", "aria-label": `${selected.name}の詳細` },
        h("div", { className: "item-detail-top" }, h("div", { className: "item-detail-index" }, selected.specialResource ? "SPECIAL RESOURCE" : selected.custom ? "ORIGINAL ITEM" : `ITEM / ${String(items.indexOf(selected) + 1).padStart(3, "0")}`), h("h3", null, selected.name || "名称未設定"), h("div", { className: "item-tag-row" }, h("span", null, selected.category), (selected.tags || []).map((tag) => h("span", { key: tag }, tag)), selectedHasCap && h("span", { className: "item-max-owned", title: "このアイテムの最大所持数" }, `上限 ×${selectedMaxOwned}`), h("span", { className: "item-price" }, selected.price))),
        selected.custom ? h("div", { className: "item-custom-editor" },
          h("label", null, "名称", h("input", { value: selected.name, onChange: (event) => patchCustomItem({ name: event.target.value }) })),
          h("label", null, "区分", h("select", { value: selected.category, onChange: (event) => patchCustomItem({ category: event.target.value }) }, h("option", { value: "その他" }, "その他"), h("option", { value: "回復" }, "回復"), h("option", { value: "強化" }, "強化"))),
          h("label", null, "タグ（空白またはカンマ区切り）", h("input", { value: (selected.tags || []).join(" / "), onChange: (event) => patchCustomItem({ tags: event.target.value.split(/[\s,\/]+/).filter(Boolean) }) })),
          h("label", null, "価格・備考", h("input", { value: selected.price || "", onChange: (event) => patchCustomItem({ price: event.target.value }) })),
          h("label", null, "最大所持数（空欄: 上限なし）", h("input", { type: "number", min: 1, max: 99, step: 1, inputMode: "numeric", value: selected.maxOwned || "", onChange: (event) => patchCustomItem({ maxOwned: event.target.value }) })),
          h("label", null, "効果（MEMO）", h("textarea", { value: selected.effect || "", onChange: (event) => patchCustomItem({ effect: event.target.value }) })),
          h("label", null, "チャットパレット文", h("textarea", { value: selected.palette || "", onChange: (event) => patchCustomItem({ palette: event.target.value }) })),
          h(Button, { size: "sm", variant: "ghost", icon: "trash", onClick: removeCustomItem, title: "オリジナルアイテムと所持品登録を削除" }, "オリジナルを削除")
        ) : h(React.Fragment, null,
          h("div", { className: "item-effect-block" }, h("span", { className: "t-label" }, "効果"), h("p", null, window.LBT_GLOSSARY_TEXT ? window.LBT_GLOSSARY_TEXT(selected.effect, "アイテム効果:" + selected.name, selected) : selected.effect)),
          h("div", { className: "item-effect-block item-palette-preview" }, h("span", { className: "t-label" }, "チャットパレットへ反映"), h("pre", null, `◆ ${selected.name}\n${selected.palette || selected.effect}`))
        ),
        selectedEntry ? h("div", { className: "item-owned-controls" },
          h("div", { className: "item-quantity-control" }, h("span", { className: "t-label" }, selectedHasCap ? `所持数の修正 / 上限×${selectedMaxOwned}` : "所持数の修正"), h("input", { className: "item-quantity-input", type: "number", min: 1, max: selectedMaxOwned, step: 1, inputMode: "numeric", value: quantityDraft, onChange: (event) => setQuantityDraft(event.target.value), onBlur: commitQuantity, onKeyDown: (event) => { if (event.key === "Enter") event.currentTarget.blur(); }, "aria-label": "所持数を直接修正", title: "実際に使用した場合は「1個使用」または「消費する」を押してください。" }), h("button", { type: "button", disabled: !canConsumeOne, onClick: consumeOne, "aria-label": "1個使用して消費記録を残す", title: currentResult ? `1個を消費し「${currentResult.name}」へ記録` : "消費記録にはリザルトが必要です" }, h(Icon, { name: "minus", size: 13 }))),
          h("label", { className: "item-output-toggle" }, h("input", { type: "checkbox", checked: selectedEntry.memo !== false, onChange: (event) => patchEntry({ memo: event.target.checked }) }), h("span", null, "MEMOに表示")),
          h("label", { className: "item-output-toggle" }, h("input", { type: "checkbox", checked: selectedEntry.palette !== false, onChange: (event) => patchEntry({ palette: event.target.checked }) }), h("span", null, "PALETTEへ反映")),
          h("div", { className: "item-consume-controls" },
            h("span", { className: "item-consume-target", role: "status" }, currentResult ? `消費記録先: ${currentResult.name}` : "リザルト未登録のため消費できません"),
            h("label", null, "消費する数",
              h("input", {
                type: "number", min: 1, max: Number(selectedEntry.quantity) || 1, step: 1,
                inputMode: "numeric", value: consumeQuantityDraft,
                onChange: (event) => setConsumeQuantityDraft(event.target.value),
                "aria-label": "消費する数量"
              })),
            h(Button, {
              size: "sm", variant: "danger", icon: "check",
              disabled: !canConsumeSelected, onClick: consumeItem,
              title: "指定数を所持品から減らし、直近リザルトの消耗記録に追加"
            }, "消費する")),
          h("div", { className: "item-detail-actions" }, h(Button, { size: "sm", variant: "secondary", icon: "plus", disabled: !canAddSelected, onClick: addItem, title: canAddSelected ? (selectedAddNeedsCharge ? `購入価格: ${selectedAddCost.label || "無料"}` : "所持数を追加") : `残高不足または最大所持数（×${selectedMaxOwned}）に到達` }, canAddSelected ? (selectedAddNeedsCharge && (Number(selectedAddCost.lp) > 0 || Number(selectedAddCost.shards) > 0) ? "購入して追加" : "数量を追加") : "追加できません"), h(Button, { size: "sm", variant: "danger", icon: "trash", onClick: removeItem, title: "このアイテムを所持リストから削除" }, "所持品から削除"))
        ) : h(Button, { size: "md", variant: "primary", icon: "plus", className: "item-add-button", disabled: !canAddSelected, onClick: addItem, title: selected?.ledgerResource === "shards" ? (canAddSelected ? "2LPで自我の欠片を1個購入" : "LP残高が2LP未満です") : canAddSelected ? "アイテム一覧へ導入" : `最大所持数（×${selectedMaxOwned}）に到達` }, selected?.ledgerResource === "shards" ? (canAddSelected ? "1個購入（2LP）" : "LP不足（2LP必要）") : canAddSelected ? "アイテム一覧へ導入" : "上限に到達")
      )
    )
  );
};
window.ItemCodex = ItemCodex;
