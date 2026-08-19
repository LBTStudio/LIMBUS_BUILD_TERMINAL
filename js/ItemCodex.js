const ItemCodex = ({ state, dispatch }) => {
  const h = React.createElement;
  const officialItems = Array.isArray(window.DB?.items) ? window.DB.items : [];
  const customItems = Array.isArray(state.customItems) ? state.customItems : [];
  const items = React.useMemo(() => [...officialItems, ...customItems], [officialItems, customItems]);
  const inventory = Array.isArray(state.inventory) ? state.inventory : [];
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
      if (ownedOnly && !entryById.has(item.id)) return false;
      if (!q) return true;
      const haystack = `${item.name} ${item.category} ${(item.tags || []).join(" ")} ${item.effect}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [items, query, category, ownedOnly, entryById]);
  const selected = byId.get(selectedId) || visible[0] || items[0] || null;
  const selectedEntry = selected ? entryById.get(selected.id) : null;
  const selectedMaxOwned = selected ? (window.LBT_getItemMaxOwned?.(state, selected.id) || 99) : 99;
  const selectedHasCap = selectedMaxOwned < 99;
  const canAddSelected = !selectedEntry || (Number(selectedEntry.quantity) || 1) < selectedMaxOwned;
  const [quantityDraft, setQuantityDraft] = React.useState("");
  React.useEffect(() => {
    setQuantityDraft(selectedEntry ? String(selectedEntry.quantity) : "");
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
    dispatch({ type: "ADD_ITEM", itemId: selected.id });
    toast(canAddSelected ? (selectedEntry ? `「${selected.name}」の数量を追加` : `「${selected.name}」をアイテム一覧へ導入`) : `「${selected.name}」は所持上限（×${selectedMaxOwned}）です`);
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
    dispatch({ type: "REMOVE_ITEM", uid: selectedEntry.uid });
    toast(`「${selected.name}」をアイテム一覧から削除`);
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
      h("div", { className: "item-list", role: "list", "aria-label": "アイテム一覧" }, visible.length ? visible.map((item) => {
        const entry = entryById.get(item.id);
        const itemMaxOwned = window.LBT_getItemMaxOwned?.(state, item.id) || 99;
        const itemHasCap = itemMaxOwned < 99;
        return h("button", { key: item.id, type: "button", role: "listitem", className: `item-row${selected?.id === item.id ? " is-selected" : ""}`, onClick: () => selectItem(item.id) },
          h("span", { className: "item-row-mark" }, h(Icon, { name: "item", size: 14 })),
          h("span", { className: "item-row-copy" }, h("b", null, item.name || "名称未設定", item.custom && h("em", { className: "item-custom-badge" }, "ORIGINAL")), h("small", null, `${item.category}　${(item.tags || []).join(" / ")}`)),
          entry && h("span", { className: "item-quantity-badge" }, itemHasCap ? `×${entry.quantity} / ${itemMaxOwned}` : `×${entry.quantity}`)
        );
      }) : h("div", { className: "item-empty" }, "該当するアイテムはありません。")),
      selected && h("section", { className: "item-detail", "aria-label": `${selected.name}の詳細` },
        h("div", { className: "item-detail-top" }, h("div", { className: "item-detail-index" }, selected.custom ? "ORIGINAL ITEM" : `ITEM / ${String(items.indexOf(selected) + 1).padStart(3, "0")}`), h("h3", null, selected.name || "名称未設定"), h("div", { className: "item-tag-row" }, h("span", null, selected.category), (selected.tags || []).map((tag) => h("span", { key: tag }, tag)), selectedHasCap && h("span", { className: "item-max-owned", title: "このアイテムの最大所持数" }, `上限 ×${selectedMaxOwned}`), h("span", { className: "item-price" }, selected.price))),
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
          h("div", { className: "item-effect-block" }, h("span", { className: "t-label" }, "効果"), h("p", null, selected.effect)),
          h("div", { className: "item-effect-block item-palette-preview" }, h("span", { className: "t-label" }, "チャットパレットへ反映"), h("pre", null, `◆ ${selected.name}\n${selected.palette || selected.effect}`))
        ),
        selectedEntry ? h("div", { className: "item-owned-controls" },
          h("div", { className: "item-quantity-control" }, h("span", { className: "t-label" }, selectedHasCap ? `所持数 / 上限×${selectedMaxOwned}` : "所持数"), h("button", { type: "button", onClick: () => patchEntry({ quantity: Math.max(1, (Number(selectedEntry.quantity) || 1) - 1) }), "aria-label": "所持数を減らす" }, h(Icon, { name: "minus", size: 13 })), h("input", { className: "item-quantity-input", type: "number", min: 1, max: selectedMaxOwned, step: 1, inputMode: "numeric", value: quantityDraft, onChange: (event) => setQuantityDraft(event.target.value), onBlur: commitQuantity, onKeyDown: (event) => { if (event.key === "Enter") event.currentTarget.blur(); }, "aria-label": "所持数を入力" }), h("button", { type: "button", disabled: !canAddSelected, onClick: () => patchEntry({ quantity: Math.min(selectedMaxOwned, (Number(selectedEntry.quantity) || 1) + 1) }), "aria-label": "所持数を増やす" }, h(Icon, { name: "plus", size: 13 }))),
          h("label", { className: "item-output-toggle" }, h("input", { type: "checkbox", checked: selectedEntry.memo !== false, onChange: (event) => patchEntry({ memo: event.target.checked }) }), h("span", null, "MEMOに表示")),
          h("label", { className: "item-output-toggle" }, h("input", { type: "checkbox", checked: selectedEntry.palette !== false, onChange: (event) => patchEntry({ palette: event.target.checked }) }), h("span", null, "PALETTEへ反映")),
          h("div", { className: "item-detail-actions" }, h(Button, { size: "sm", variant: "secondary", icon: "plus", disabled: !canAddSelected, onClick: addItem, title: canAddSelected ? "所持数を1増やす" : `最大所持数（×${selectedMaxOwned}）に到達` }, canAddSelected ? "数量を追加" : "上限に到達"), h(Button, { size: "sm", variant: "ghost", icon: "trash", onClick: removeItem, title: "このアイテムを所持リストから削除" }, "所持品から削除"))
        ) : h(Button, { size: "md", variant: "primary", icon: "plus", className: "item-add-button", disabled: !canAddSelected, onClick: addItem, title: canAddSelected ? "アイテム一覧へ導入" : `最大所持数（×${selectedMaxOwned}）に到達` }, canAddSelected ? "アイテム一覧へ導入" : "上限に到達")
      )
    )
  );
};
window.ItemCodex = ItemCodex;
