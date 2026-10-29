(function (global) {
  "use strict";

  const validMode = (mode) => mode === "n" || mode === "t";
  const identityKey = (mode, no) => String(mode) + ":" + String(no);
  const normalizedName = (value) => String(value || "").normalize("NFKC")
    .replace(/[\s\u3000・･]/g, "").toLocaleLowerCase("ja-JP");
  const text = (value) => String(value == null ? "" : value).trim();

  function normalizeIdentity(value) {
    if (!value || typeof value !== "object") return null;
    const mode = validMode(value.mode) ? value.mode : "";
    const no = text(value.no).slice(0, 64);
    if (!mode || !no || !/^[A-Za-z0-9_-]+$/.test(no)) return null;
    return { mode: mode, no: no, name: text(value.name).slice(0, 160) };
  }

  function catalogList(db, mode) {
    const rows = mode === "t" ? db.tokui_personas : db.normal_personas;
    return Array.isArray(rows) ? rows : [];
  }

  function catalogIdentityByName(db, name) {
    const key = normalizedName(name);
    if (!key) return null;
    const matches = [];
    ["n", "t"].forEach(function (mode) {
      catalogList(db, mode).forEach(function (row) {
        if (normalizedName(row && row.name) !== key || row.no == null) return;
        matches.push({ mode: mode, no: String(row.no), name: text(row.name) });
      });
    });
    const unique = new Map(matches.map(function (row) {
      return [identityKey(row.mode, row.no), row];
    }));
    return unique.size === 1 ? Array.from(unique.values())[0] : null;
  }

  function catalogName(db, mode, no) {
    const hit = catalogList(db, mode).find(function (row) {
      return row && String(row.no) === String(no);
    });
    return text(hit && hit.name);
  }

  function auditPersonaInventory(state) {
    const source = state && typeof state === "object" ? state : {};
    const db = global.DB && typeof global.DB === "object" ? global.DB : {};
    const roster = source.roster && Array.isArray(source.roster.personas) ? source.roster.personas : [];
    const results = Array.isArray(source.results) ? source.results : [];
    const batches = Array.isArray(source.draws) ? source.draws : [];
    const actual = new Map();
    const expected = new Map();
    const appliedDrawBatchIds = new Set(Array.isArray(source.appliedDrawBatchIds) ? source.appliedDrawBatchIds.filter((key) => typeof key === "string") : []);
    let unresolvedEvidence = 0;
    let unresolvedDraws = 0;

    roster.forEach(function (row) {
      if (!row || typeof row !== "object") return;
      const mode = row.mode === "t" ? "t" : "n";
      const no = text(row.no);
      if (!no || !/^[A-Za-z0-9_-]+$/.test(no)) return;
      const key = identityKey(mode, no);
      const name = catalogName(db, mode, no) || text(row.displayName || row.name) || (mode.toUpperCase() + " No." + no);
      if (!actual.has(key)) actual.set(key, { mode: mode, no: no, name: name });
    });

    function addExpected(identityValue, sourceLabel) {
      const identity = normalizeIdentity(identityValue);
      if (!identity) {
        unresolvedEvidence += 1;
        return;
      }
      const key = identityKey(identity.mode, identity.no);
      const name = catalogName(db, identity.mode, identity.no) || identity.name || (identity.mode.toUpperCase() + " No." + identity.no);
      if (!expected.has(key)) expected.set(key, {
        mode: identity.mode, no: identity.no, name: name, sources: []
      });
      const row = expected.get(key);
      if (name && !row.name) row.name = name;
      if (sourceLabel && row.sources.indexOf(sourceLabel) < 0) row.sources.push(sourceLabel);
    }

    const initialResult = results.find(function (result) {
      return result && (result.id === "res-initial" || result.name === "初期作成");
    }) || null;
    const initial = initialResult && initialResult.initialPersona && typeof initialResult.initialPersona === "object"
      ? initialResult.initialPersona : { method: "unknown", mode: "", no: "", name: "" };
    const initialMethod = ["selected", "random"].indexOf(initial.method) >= 0 ? initial.method : "unknown";
    const initialIdentity = normalizeIdentity(initial);
    const initialConfigured = initialMethod !== "unknown" && !!initialIdentity;
    const initialNeedsPersona = initialMethod !== "unknown" && !initialIdentity;
    if (initialIdentity) addExpected(initialIdentity, "初期作成");

    results.forEach(function (result) {
      if (!result || !Array.isArray(result.personaAcquisitions)) return;
      const resultLabel = text(result.name) || "名称未設定のリザルト";
      result.personaAcquisitions.forEach(function (entry) {
        addExpected(entry, resultLabel + (entry && entry.source ? "（" + text(entry.source) + "）" : ""));
      });
    });

    batches.forEach(function (batch) {
      if (!batch || !Array.isArray(batch.records)) return;
      const batchKey = text(batch.batchHash || batch.commit || "");
      /* draws is an immutable proof ledger. Undo preserves proofs even if acquisition effects were rolled back. */
      if (!batchKey || !appliedDrawBatchIds.has(batchKey)) {
        unresolvedDraws += 1;
        return;
      }
      batch.records.forEach(function (record) {
        if (!record || record.duplicate === true) return;
        const item = record.item && typeof record.item === "object" ? record.item : {};
        const kind = String(record.kind || item.kind || "");
        let identity = null;
        if ((kind === "persona" || kind === "specialPersona") && item.no != null) {
          const mode = kind === "specialPersona" || item.mode === "t" ? "t" : "n";
          identity = { mode: mode, no: String(item.no), name: text(item.name) };
        } else if (kind === "themePack" || item.kind === "themePack") {
          identity = catalogIdentityByName(db, item.name);
          if (!identity) unresolvedDraws += 1;
        }
        if (!identity) return;
        const packName = text(record.pack || item.pack || batch.pack || "");
        addExpected(identity, "抽出記録" + (packName ? "（" + packName + "）" : ""));
      });
    });

    const missing = Array.from(expected.entries())
      .filter(function (entry) { return !actual.has(entry[0]); })
      .map(function (entry) { return entry[1]; });
    const unrecorded = Array.from(actual.entries())
      .filter(function (entry) { return !expected.has(entry[0]); })
      .map(function (entry) { return entry[1]; });
    const matched = Array.from(expected.entries())
      .filter(function (entry) { return actual.has(entry[0]); })
      .map(function (entry) { return entry[1]; });

    return {
      initialConfigured: initialConfigured,
      initialNeedsPersona: initialNeedsPersona,
      initialMethod: initialMethod,
      initialPersona: initialIdentity
        ? Object.assign({}, initialIdentity, { name: catalogName(db, initialIdentity.mode, initialIdentity.no) || initialIdentity.name })
        : null,
      actualCount: actual.size,
      expectedCount: expected.size,
      matchedCount: matched.length,
      missing: missing,
      unrecorded: unrecorded,
      matched: matched,
      unresolvedEvidence: unresolvedEvidence,
      unresolvedDraws: unresolvedDraws,
      hasEvidenceGap: !initialConfigured || unresolvedEvidence > 0 || unresolvedDraws > 0 || unrecorded.length > 0
    };
  }

  global.LBT_auditPersonaInventory = auditPersonaInventory;
})(window);
