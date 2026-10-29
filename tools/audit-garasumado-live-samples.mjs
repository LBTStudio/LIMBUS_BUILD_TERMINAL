#!/usr/bin/env node
/**
 * Read-only live regression audit for the 98 shared URLs gathered on 2026-10-27.
 *
 * Do not persist document bodies or print memo text: shared records can contain
 * user-written notes and names. The committed baseline contains inventory
 * metadata only; parser checks run against current Firestore documents.
 */
import { readFileSync, appendFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import vm from "node:vm";
import { auditRuleBasedOpening, RULE_INITIAL_RESOURCES } from "./rule-based-opening-audit.mjs";

const root = process.cwd();
const baseline = JSON.parse(readFileSync(resolve(root, "tests/fixtures/garasumado-share-url-baseline.json"), "utf8"));
const importSource = readFileSync(resolve(root, "js/garasumado-roster-import.js"), "utf8");
const key = importSource.match(/const PUBLIC_API_KEY\s*=\s*["']([^"']+)["']/)?.[1];
if (!key) throw new Error("公開Firestore読み取りキーをソースから検出できません。");

const parserContext = {
  window: { __lbtAuditIncomeEvents: [], __lbtAuditIncomePairEvents: [], __lbtAuditSpendEvents: [], __lbtAuditCurrentMemoLine: 0 },
  console,
  URL,
  TextEncoder,
  TextDecoder,
  setTimeout,
  clearTimeout,
  module: { exports: {} }
};
parserContext.globalThis = parserContext;
vm.createContext(parserContext);
let parserSource = readFileSync(resolve(root, "js/garasumado-memo-parse.js"), "utf8");
/* Instrument the in-memory copy only; emit route, currency, amount and one-based
   memo line, never raw notes or names. Production parser and Firestore stay untouched. */
function traceIncomeRoute(source, anchor, replacement, label) {
  if (!source.includes(anchor)) throw new Error("parser trace anchor missing: " + label);
  return source.replace(anchor, replacement);
}
parserSource = traceIncomeRoute(parserSource,
  "      tokens.push({\n        cur: m[1] ? currencyOfPair(m[1]) : null,\n        num: m[1] ? null : chainSum(m[2]),\n        gap: text.slice(lastEnd, m.index)\n      });",
  "      tokens.push({\n        index: m.index,\n        cur: m[1] ? currencyOfPair(m[1]) : null,\n        num: m[1] ? null : chainSum(m[2]),\n        gap: text.slice(lastEnd, m.index)\n      });",
  "trace token offsets");
parserSource = traceIncomeRoute(parserSource,
  "      if (owner) out.push({ amount: tk.num, currency: owner });\n    }\n    return out;\n  }",
  "      if (owner) out.push({ amount: tk.num, currency: owner });\n    }\n    if (Array.isArray(global.__lbtAuditIncomePairEvents) && Number(global.__lbtAuditCurrentMemoLine) > 0) {\n      global.__lbtAuditIncomePairEvents.push({\n        lineIndex: Number(global.__lbtAuditCurrentMemoLine),\n        inputLength: String(line || \"\").length,\n        cleanedLength: text.length,\n        tokenShape: tokens.map((token) => ({\n          index: token.index, kind: token.cur ? \"currency\" : \"number\",\n          currency: token.cur, amount: token.num, gapLength: token.gap.length,\n          gapHasLetters: /[A-Za-zぁ-んァ-ヶ一-龠]/.test(token.gap),\n          gapHasBalanceCue: /現在|現座|残高|残り|所持|保有/.test(token.gap),\n          gapHasActionCue: /報酬|収入|消費|支出|支払|購入|買っ|獲得|入手|取得|抽出|ガチャ|チケ|チケット/.test(token.gap)\n        })),\n        pairs: out.map((pair) => ({ currency: pair.currency, amount: pair.amount }))\n      });\n    }\n    return out;\n  }",
  "trace normalized token pairs");
parserSource = traceIncomeRoute(parserSource,
  '    var spends = [];',
  '    var spends = new Proxy([], { get(target, property) { if (property === "push") return (...rows) => { rows.forEach((row) => global.__lbtAuditSpendEvents.push({ lineIndex: Number(global.__lbtAuditCurrentMemoLine) || 0, lp: Number(row && row.lp) || 0, shards: Number(row && row.shards) || 0, reason: String(row && row.reason || "unknown"), rawLength: String(row && row.raw || "").length, hasRaw: typeof (row && row.raw) === "string" })); return Array.prototype.push.apply(target, rows); }; return Reflect.get(target, property); } });',
  "trace spend records");
parserSource = traceIncomeRoute(parserSource,
  '  function parseMemo(memo) {',
  '  function parseMemo(memo) {\n    global.__lbtAuditCurrentMemoLine = 0;',
  "reset trace line");
parserSource = traceIncomeRoute(parserSource,
  '      var sourceLine = String(lines[i]).trim();',
  '      global.__lbtAuditCurrentMemoLine = i + 1;\n      var sourceLine = String(lines[i]).trim();',
  "set trace line");
parserSource = traceIncomeRoute(parserSource,
  '    addSafeAmount(income, "lp", slashPair.lp, memo, reasons, "LP収入の合計");\n    addSafeAmount(income, "shards", slashPair.shards, memo, reasons, "欠片収入の合計");',
  '    global.__lbtAuditIncomeEvents.push({ lineIndex: 0, currency: "lp", amount: slashPair.lp, route: "slash-pair-total" });\n    global.__lbtAuditIncomeEvents.push({ lineIndex: 0, currency: "shards", amount: slashPair.shards, route: "slash-pair-total" });\n    addSafeAmount(income, "lp", slashPair.lp, memo, reasons, "LP収入の合計");\n    addSafeAmount(income, "shards", slashPair.shards, memo, reasons, "欠片収入の合計");',
  "trace slash pair");
parserSource = traceIncomeRoute(parserSource,
  '        else addSafeAmount(income, "shards", duplicateCompensation.amount, line, reasons, "重複補償の欠片収入");',
  '        else {\n          global.__lbtAuditIncomeEvents.push({ lineIndex: global.__lbtAuditCurrentMemoLine, currency: "shards", amount: duplicateCompensation.amount, route: "duplicate-shard-compensation" });\n          addSafeAmount(income, "shards", duplicateCompensation.amount, line, reasons, "重複補償の欠片収入");\n        }',
  "trace duplicate compensation");
parserSource = traceIncomeRoute(parserSource,
  '            addSafeAmount(income, conversionPair.currency, conversionPair.amount, sourceLine, reasons, "通貨変換の収入");',
  '            global.__lbtAuditIncomeEvents.push({ lineIndex: global.__lbtAuditCurrentMemoLine, currency: conversionPair.currency, amount: conversionPair.amount, route: "conversion-income" });\n            addSafeAmount(income, conversionPair.currency, conversionPair.amount, sourceLine, reasons, "通貨変換の収入");',
  "trace conversion");
parserSource = traceIncomeRoute(parserSource,
  '            if (pairs[pi].amount > 0) addSafeAmount(income, pairs[pi].currency, pairs[pi].amount, line, reasons, "通貨収入合計");',
  '            if (pairs[pi].amount > 0) {\n              global.__lbtAuditIncomeEvents.push({ lineIndex: global.__lbtAuditCurrentMemoLine, currency: pairs[pi].currency, amount: pairs[pi].amount, route: "currency-pair-income" });\n              addSafeAmount(income, pairs[pi].currency, pairs[pi].amount, line, reasons, "通貨収入合計");\n            }',
  "trace currency-pair income");
vm.runInContext(parserSource, parserContext, { filename: "js/garasumado-memo-parse.js (audit-only instrumentation)" });
const MEMO = parserContext.window.LBT_garaMemo || parserContext.module.exports;
if (typeof MEMO?.parseMemo !== "function") throw new Error("収支メモパーサーを初期化できません。");

const DOC_ROOT = "https://firestore.googleapis.com/v1/projects/lbt-garasumado/databases/(default)/documents";
const CANDIDATE_AMOUNT = /(?:LP|ＬＰ)\s*[：:]?\s*[+＋\-−]?\s*[0-9０-９]+(?:[,，][0-9０-９]{3})*(?![0-9０-９])|[0-9０-９][0-9０-９,，]*\s*(?:LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ)|(?:欠片|欠け片|かけら|欠けら|カケラ)\s*[：:]?\s*[+＋\-−]?\s*[0-9０-９]+(?![0-9０-９])/i;
/* 旧監査の候補総数と比較するため、従来の語句条件も別に保持する。 */
const LEGACY_CANDIDATE_AMOUNT = /(?:LP|ＬＰ)\s*[：:]?\s*[+＋\-−]?\s*[0-9０-９]|[0-9０-９][0-9０-９,，]*\s*(?:LP|ＬＰ|欠片|かけら|欠けら|カケラ)|(?:欠片|かけら|欠けら|カケラ)\s*[：:]?\s*[+＋\-−]?\s*[0-9０-９]/i;
const LEGACY_CANDIDATE_ACTION = /報酬|収入|消費|支出|支払|購入|買った|抽出|ガチャ|チケット|チケ|獲得|入手|取得/;
/* 名詞だけでは操作語に数えない。チケットは枚数・動詞を確認して別判定する。 */
const CANDIDATE_ACTION = /報酬|収入|消費|支出|支払|購入|買っ|獲得|入手|取得|付与|支給|補填|受領|被り|重複|変換|換算/;
const CANDIDATE_DRAW_ACTION = /(?:抽出|ガチャ)(?:結果|を回|を引|で獲得|で入手|で取得|を実行|を実施|を行|した|する|済)|(?:ガチャ|抽出)[：:]?\s*(?:獲得|入手|取得|購入|消費|使用)/;
const CANDIDATE_TICKET_MARKER = /(?:チケット|チケ|抽出🎫)/i;
const CANDIDATE_TICKET_COUNT = /(?:チケット|チケ|抽出🎫)\s*(?:[x×ｘ＊*]\s*[0-9０-９]+|[0-9０-９]+\s*(?:枚|個|回))|(?:[x×ｘ＊*]\s*[0-9０-９]+|[0-9０-９]+\s*(?:枚|個|回))\s*(?:人格|E\.?G\.?O|エゴ|選択|抽出|ガチャ)?チケ(?:ット)?/i;
const CANDIDATE_TICKET_ACTION = /(?:獲得|入手|取得|付与|支給|消費|使用|購入|買っ|支払|支出|報酬|収入|受領|補填|抽出(?:した|する|結果|後|済|を行う|を実施)|ガチャ(?:結果|で獲得|を回|を引)|消費済)/i;
const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));

function unwrapFirestore(value) {
  if (value === null || typeof value !== "object") return value;
  if (Object.hasOwn(value, "stringValue")) return value.stringValue;
  if (Object.hasOwn(value, "integerValue")) return Number(value.integerValue);
  if (Object.hasOwn(value, "doubleValue")) return Number(value.doubleValue);
  if (Object.hasOwn(value, "booleanValue")) return Boolean(value.booleanValue);
  if (Object.hasOwn(value, "nullValue")) return null;
  if (Object.hasOwn(value, "timestampValue")) return value.timestampValue;
  if (value.arrayValue) return (value.arrayValue.values || []).map(unwrapFirestore);
  if (value.mapValue) {
    return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([field, nested]) => [field, unwrapFirestore(nested)]));
  }
  return Object.fromEntries(Object.entries(value).map(([field, nested]) => [field, unwrapFirestore(nested)]));
}

async function requestDocument(collection, id) {
  const url = DOC_ROOT + "/" + collection + "/" + encodeURIComponent(id) + "?key=" + encodeURIComponent(key);
  let lastStatus = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(12000)
      });
      lastStatus = response.status;
      if (response.ok) {
        const body = await response.json();
        return { ok: true, collection, updateTime: body.updateTime || "", doc: unwrapFirestore(body.fields || {}) };
      }
      if (response.status !== 429 && response.status < 500) break;
    } catch {
      lastStatus = 0;
    }
    if (attempt < 2) await delay(300 * (attempt + 1));
  }
  return { ok: false, status: lastStatus };
}

async function fetchSample(id) {
  const attempts = [];
  for (const collection of ["characters", "personas"]) {
    const result = await requestDocument(collection, id);
    if (result.ok) return { ...result, id, attempts };
    attempts.push({ collection, status: result.status });
  }
  return { ok: false, id, attempts, status: attempts.some((a) => a.status === 403) ? 403 : attempts.at(-1)?.status || 0 };
}

async function mapLimit(items, limit, callback) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await callback(items[index], index);
    }
  }));
  return results;
}

function isRelated(auditRows, lineNumber) {
  return (auditRows || []).some((entry) => entry && (
    entry.lineIndex === lineNumber ||
    entry.relatedLineIndex === lineNumber ||
    (Array.isArray(entry.relatedLines) && entry.relatedLines.some((row) => row.lineIndex === lineNumber))
  ));
}

function stripBalanceAnchors(line) {
  return String(line || "")
    .replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .replace(/\u2212/g, "-")
    .replace(/\u3000/g, " ")
    .replace(/現在\s*(?:所持|残高|保有)?\s*[：:]?\s*(?:LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ)?\s*[：:]?\s*-?\d+(?:\s*[+＋]\s*\d+)*(?:\s*(?:LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ))?(?:\s*[→⇒]\s*-?\d+(?:\s*(?:LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ))?)?/gi, " ")
    .replace(/残り\s*(?:所持|残高|保有)?\s*[：:]?\s*(?:LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ)?\s*[：:]?\s*-?\d+(?:\s*[+＋]\s*\d+)*(?:\s*(?:LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ))?(?:\s*[→⇒]\s*-?\d+(?:\s*(?:LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ))?)?/gi, " ");
}
function isLegacyFinancialCandidateLine(line) {
  if (/^\s*[▶►▷]/.test(String(line || ""))) return false;
  const withoutBalances = stripBalanceAnchors(line);
  return LEGACY_CANDIDATE_AMOUNT.test(withoutBalances) && LEGACY_CANDIDATE_ACTION.test(withoutBalances);
}

function isFinancialCandidateLine(line) {
  if (/^\s*[▶►▷]/.test(String(line || ""))) return false;
  const withoutBalances = stripBalanceAnchors(line);
  if (!CANDIDATE_AMOUNT.test(withoutBalances)) return false;
  const hasCountedTicketOperation = CANDIDATE_TICKET_MARKER.test(withoutBalances) &&
    (CANDIDATE_TICKET_COUNT.test(withoutBalances) || CANDIDATE_TICKET_ACTION.test(withoutBalances));
  return CANDIDATE_ACTION.test(withoutBalances) ||
    CANDIDATE_DRAW_ACTION.test(withoutBalances) ||
    hasCountedTicketOperation;
}

/* 金額の近くにチケットという語があるだけの価格・説明ラベルを、取引候補から
   明示的に分離する。監査対象から黙って消すのではなく、別カウンターに残す。 */
function isNonTransactionalTicketLabel(line) {
  const withoutBalances = stripBalanceAnchors(line);
  return LEGACY_CANDIDATE_AMOUNT.test(withoutBalances) &&
    CANDIDATE_TICKET_MARKER.test(withoutBalances) &&
    !CANDIDATE_TICKET_COUNT.test(withoutBalances) &&
    !CANDIDATE_TICKET_ACTION.test(withoutBalances) &&
    !CANDIDATE_ACTION.test(withoutBalances) &&
    !CANDIDATE_DRAW_ACTION.test(withoutBalances);
}

function isNonTransactionalDrawLabel(line) {
  const withoutBalances = stripBalanceAnchors(line);
  return LEGACY_CANDIDATE_AMOUNT.test(withoutBalances) &&
    /抽出|ガチャ/.test(withoutBalances) &&
    !CANDIDATE_TICKET_COUNT.test(withoutBalances) &&
    !(CANDIDATE_TICKET_MARKER.test(withoutBalances) && CANDIDATE_TICKET_ACTION.test(withoutBalances)) &&
    !CANDIDATE_ACTION.test(withoutBalances) &&
    !CANDIDATE_DRAW_ACTION.test(withoutBalances);
}

function describeCandidateLine(line, coverage) {
  const textLine = String(line || "");
  const amountMatch = CANDIDATE_AMOUNT.exec(textLine);
  const amountTokens = [...textLine.matchAll(/(?:[+＋\-−]?\s*\d[\d,，]*\s*(?:LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ)|(?:LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ)\s*[：:]?\s*[+＋\-−]?\s*\d[\d,，]*)/gi)]
    .slice(0, 8)
    .map((match) => ({
      index: match.index,
      currency: /LP|ＬＰ/i.test(match[0]) ? "lp" : "shards",
      digitWidth: (match[0].match(/[0-9０-９]/g) || []).length
    }));
  /* 「破片」は duplicateShardCompensationOf が通貨欠片として認識する別表記だが、
     現行の generic candidate/line coverage regex では通貨候補に入っていない。 */
  const alternateShardAmounts = [...textLine.matchAll(/(?:自我の)?破片\s*[：:]?\s*[+＋\-−]?\s*\d[\d,，]*|[+＋\-−]?\s*\d[\d,，]*\s*(?:自我の)?破片/gi)]
    .slice(0, 8)
    .map((match) => ({
      index: match.index,
      digitWidth: (match[0].match(/[0-9０-９]/g) || []).length
    }));
  const duplicateParenthetical = [...textLine.matchAll(/[（(]([^）)]*)[）)]/g)]
    .filter((match) => /ダブ|被り|かぶり|重複/.test(match[1]));
  const duplicateShardAmounts = duplicateParenthetical.flatMap((note) =>
    [...note[1].matchAll(/(?:自我の)?(?:破片|欠片|欠け片|かけら|欠けら|カケラ)\s*[+＋]?\s*\d[\d,，]*|\d[\d,，]*\s*(?:自我の)?(?:破片|欠片|欠け片|かけら|欠けら|カケラ)/g)]
      .map((match) => ({ digitWidth: (match[0].match(/[0-9０-９]/g) || []).length }))
  );
  const markers = [
    { type: "amount", re: /(?:LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ)\s*[：:]?\s*[+＋\-−]?\s*\d[\d,，]*|[+＋\-−]?\s*\d[\d,，]*\s*(?:LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ)/gi },
    { type: "alternate-shard-amount", re: /(?:自我の)?破片\s*[：:]?\s*[+＋\-−]?\s*\d[\d,，]*|[+＋\-−]?\s*\d[\d,，]*\s*(?:自我の)?破片/gi },
    { type: "reward-cue", re: /報酬|収入/g },
    { type: "spend-cue", re: /消費|支出|支払|購入|買っ/g },
    { type: "acquisition-cue", re: /獲得|入手|取得|付与|支給|補填|受領|被り|重複/g },
    { type: "draw-cue", re: /(?:抽出|ガチャ)(?:結果|を回|を引|で獲得|で入手|で取得|を実行|を実施|を行|した|する|済)/g },
    { type: "ticket-label", re: /チケット|チケ|抽出🎫/g },
    { type: "balance-cue", re: /現在|残高|所持|残り|保有|→|⇒/g },
    { type: "conversion-cue", re: /変換|換算/g }
  ];
  const tokenShape = [];
  for (const marker of markers) {
    for (const match of textLine.matchAll(marker.re)) {
      tokenShape.push({ index: match.index, type: marker.type });
    }
  }
  tokenShape.sort((a, b) => a.index - b.index);
  const withoutBalances = stripBalanceAnchors(textLine);
  const legacyCueKinds = [];
  if (/報酬|収入/.test(withoutBalances)) legacyCueKinds.push("reward-term");
  if (/消費|支出|支払|購入|買った/.test(withoutBalances)) legacyCueKinds.push("spend-term");
  if (/獲得|入手|取得/.test(withoutBalances)) legacyCueKinds.push("acquisition-term");
  if (/抽出|ガチャ/.test(withoutBalances)) legacyCueKinds.push("draw-term");
  if (/チケット|チケ/.test(withoutBalances)) legacyCueKinds.push("ticket-term");
  const actionKinds = [];
  if (/報酬|収入/.test(textLine)) actionKinds.push("reward");
  if (/消費|支出|支払|購入|買っ/.test(textLine)) actionKinds.push("spend");
  if (/獲得|入手|取得|付与|支給|補填|受領|被り|重複/.test(textLine)) actionKinds.push("acquisition");
  if (CANDIDATE_DRAW_ACTION.test(textLine)) actionKinds.push("draw-operation");
  if (CANDIDATE_TICKET_MARKER.test(textLine)) actionKinds.push("ticket-label");
  if (/現在|残高|所持|残り|保有|→|⇒/.test(textLine)) actionKinds.push("balance-transition");
  if (/変換|換算/.test(textLine)) actionKinds.push("conversion");
  const ticket = MEMO.ticketOf(textLine, { mode: coverage?.section || "income", previousLine: "" });
  const currencyKinds = (value) => value
    ? Object.entries(value).filter(([, amount]) => Number(amount) !== 0).map(([currency]) => currency)
    : [];
  const cleanedLine = stripBalanceAnchors(textLine);
  const classificationFlags = {
    legacyAmount: LEGACY_CANDIDATE_AMOUNT.test(cleanedLine),
    strictAmount: CANDIDATE_AMOUNT.test(cleanedLine),
    transactionAction: CANDIDATE_ACTION.test(cleanedLine),
    drawOperation: CANDIDATE_DRAW_ACTION.test(cleanedLine),
    ticketMarker: CANDIDATE_TICKET_MARKER.test(cleanedLine),
    ticketCount: CANDIDATE_TICKET_COUNT.test(cleanedLine),
    ticketAction: CANDIDATE_TICKET_ACTION.test(cleanedLine),
    hasArrow: /[→⇒]/.test(cleanedLine)
  };
  return {
    lineLength: textLine.length,
    amountTokenCount: amountTokens.length,
    amountTokenShape: amountTokens,
    alternateShardAmountCount: alternateShardAmounts.length,
    alternateShardAmountShape: alternateShardAmounts,
    hasDuplicateCue: /ダブ|被り|かぶり|重複/.test(textLine),
    duplicateParentheticalCount: duplicateParenthetical.length,
    duplicateShardCompensationAmountCount: duplicateShardAmounts.length,
    duplicateShardCompensationAmountWidths: duplicateShardAmounts.map((row) => row.digitWidth),
    candidateMatchLength: amountMatch?.[0]?.length || 0,
    candidateMatchDigitWidth: amountMatch ? (amountMatch[0].match(/[0-9０-９]/g) || []).length : 0,
    numericTokenWidths: [...textLine.matchAll(/[0-9０-９]+/g)].map((match) => match[0].length).slice(0, 8),
    tokenShape,
    legacyCueKinds,
    classificationFlags,
    ticketClassified: Boolean(ticket),
    ticketReviewReasonPresent: Boolean(ticket?.reason),
    actionKinds,
    startsWithEffectMarker: /^\s*[▶►▷]/.test(textLine),
    hasBalanceCue: /現在|残高|所持|残り|保有|→|⇒/.test(textLine),
    section: coverage?.section || null,
    status: coverage?.status || null,
    expectedCurrencyKinds: currencyKinds(coverage?.expected),
    detectedCurrencyKinds: currencyKinds(coverage?.detected),
    parserReasonCount: Number(coverage?.parserReasonCount) || 0,
    sourceFinding: Boolean(coverage?.sourceFinding)
  };
}

function numericShape(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map(numericShape).filter((entry) => entry !== undefined);
  if (!value || typeof value !== "object") return undefined;
  const out = {};
  for (const [key, nested] of Object.entries(value)) {
    const safe = numericShape(nested);
    if (safe !== undefined) out[key] = safe;
  }
  return out;
}

function categorizeParserReason(reason) {
  const text = String(reason?.reason || "");
  if (/残高から逆算|残高表記しかない|現在の残高/.test(text)) return "balance-only-no-spend-amount";
  if (/テーマパック|パックチケット|パック抽出/.test(text)) return "theme-pack-or-ticket-ambiguity";
  if (/チケット|抽出券|抽出チケ/.test(text)) return "ticket-amount-or-classification";
  if (/通貨変換|変換方向|換算/.test(text)) return "currency-conversion-ambiguity";
  if (/E\\.?G\\.?O|価格|価格欄/.test(text)) return "item-price-missing-or-mismatch";
  if (/支出金額|購入額|消費金額|通貨額|支出表記|金額を読み取れない/.test(text)) return "spend-amount-or-format-unreadable";
  if (/安全整数|桁区切り|範囲外|負の安全整数/.test(text)) return "numeric-format-or-range";
  if (/不一致|一致しない|矛盾|計算結果|計算式/.test(text)) return "arithmetic-or-amount-mismatch";
  return "other-review";
}

/* Detect explicit expense-like lines independently from parser coverage. This is a
   conservative completeness signal, not proof that every cue is a real transaction.
   Keep all memo text private: return only line counts/statuses, never raw lines/names. */
function auditExplicitSpendCues(lines, spendTrace, reasons, coverages, audits) {
  const reviewStatuses = new Set([
    "mismatch", "direction-review", "reviewed-by-parser-reason", "candidate-review",
    "unresolved", "balance-transition-review", "current-balance-review"
  ]);
  const candidates = [];
  for (let i = 0; i < (lines || []).length; i++) {
    const original = String(lines[i] || "").trim();
    if (!original || /^\s*[▶►▷]/.test(original)) continue;
    let normalized = stripBalanceAnchors(original)
      .normalize("NFKC")
      .replace(/[−–—]/g, "-")
      /* 硝子の破片アイテムの「消費／獲得」は所持通貨の支出語ではない。
         アイテム名・数量に続く動詞を除いてから通貨動詞の近接を測る。 */
      .replace(/(?:硝子|ガラス|硝酸)の(?:破片|欠片|欠け片|かけら|欠けら|カケラ)\s*(?:[+＋-]\s*\d+|[x×ｘ]\s*\d+|\d+\s*(?:個|つ))?\s*(?:を\s*)?(?:消費|使用|獲得|入手|取得|付与)(?:して|し)?/gi, " ")
      .replace(/(?:消費|使用|獲得|入手|取得|付与)(?:して|し)?\s*[：:]?\s*(?:硝子|ガラス|硝酸)の(?:破片|欠片|欠け片|かけら|欠けら|カケラ)\s*(?:[+＋-]\s*\d+|[x×ｘ]\s*\d+|\d+\s*(?:個|つ))?/gi, " ")
      .replace(/(?:硝子|ガラス|硝酸)の(?:破片|欠片|欠け片|かけら|欠けら|カケラ)\s*(?:[+＋-]\s*\d+|[x×ｘ]\s*\d+|\d+\s*(?:個|つ))?/gi, " ");
    const hasCurrencyAmount =
      /(?:LP|ＬＰ|(?:自我の)?(?:破片|欠片|欠け片|かけら|欠けら|カケラ|けっか))\s*[:：]?\s*[+＋-]?\s*\d[\d,]*|[+＋-]?\s*\d[\d,]*\s*(?:LP|ＬＰ|(?:自我の)?(?:破片|欠片|欠け片|かけら|欠けら|カケラ|けっか))/i.test(normalized);
    if (!hasCurrencyAmount) continue;
    /* 支出動詞が同じ行のどこかにあるだけでは不十分。額との近接と間の語句を
       見て、報酬額＋チケット消費のような混在行を「通貨支出」と誤分類しない。 */
    const currencyAmountPattern = /(?:LP|ＬＰ|(?:自我の)?(?:破片|欠片|欠け片|かけら|欠けら|カケラ|けっか))\s*[:：]?\s*[+＋-]?\s*\d[\d,]*|[+＋-]?\s*\d[\d,]*\s*(?:LP|ＬＰ|(?:自我の)?(?:破片|欠片|欠け片|かけら|欠けら|カケラ|けっか))/gi;
    const currencyAmountMatches = [...normalized.matchAll(currencyAmountPattern)];
    const spendVerbs = [...normalized.matchAll(/消費|支払|支払い|支出|購入(?!できる|可能|条件)|買った|買っ|使った|使用|使い/g)];
    const usageMatches = [...normalized.matchAll(/使用|使い/g)];
    const actionNearCurrency = (action) => currencyAmountMatches.some((amount) => {
      const amountEnd = amount.index + amount[0].length;
      const distance = action.index >= amountEnd
        ? action.index - amountEnd
        : amount.index >= action.index + action[0].length
          ? amount.index - (action.index + action[0].length)
          : 0;
      if (distance > 12) return false;
      const gapStart = Math.min(amountEnd, action.index + action[0].length);
      const gapEnd = Math.max(amount.index, action.index);
      const gap = normalized.slice(gapStart, gapEnd);
      return !/(?:チケット|チケ|同期|CT\s*\d|スキル|人格|E\.?G\.?O|エゴ|抽出|ガチャ)/i.test(gap);
    });
    const hasUsageCue = usageMatches.length > 0;
    const usageNearCurrency = usageMatches.some(actionNearCurrency);
    const hasExplicitSpendAction = spendVerbs.some(actionNearCurrency);
    const hasNegativeCurrency = /(?:LP|ＬＰ|(?:自我の)?(?:破片|欠片|欠け片|かけら|欠けら|カケラ|けっか))\s*[-]\s*\d|[-]\s*\d[\d,]*\s*(?:LP|ＬＰ|(?:自我の)?(?:破片|欠片|欠け片|かけら|欠けら|カケラ|けっか))/i.test(normalized)
      && !/(?:現在|現座|残高|残り|所持|保有)/.test(normalized);
    const looksLikeArithmeticExpression = hasNegativeCurrency && !hasExplicitSpendAction &&
      (currencyAmountMatches.length >= 2 || /[（(][^）)]*[）)]/.test(normalized) || /[＝=＋+*/]/.test(normalized));
    if (!hasExplicitSpendAction && !hasNegativeCurrency) continue;
    const lineIndex = i + 1;
    const sameLineSpends = (spendTrace || []).filter((event) =>
      Number(event.lineIndex) === lineIndex &&
      ((Number(event.lp) || 0) !== 0 || (Number(event.shards) || 0) !== 0)
    );
    const coverage = (coverages || []).find((entry) => entry && Number(entry.lineIndex) === lineIndex);
    const hasParserReason = (reasons || []).some((entry) => String(entry?.line || "").trim() === original);
    const hasRelatedAudit = isRelated(audits || [], lineIndex);
    let isolatedSpendRows = 0;
    let isolatedReasonCount = 0;
    if (sameLineSpends.length === 0) {
      /* Test this candidate in isolation to separate unsupported syntax from history-context
         suppression. Restore instrumentation arrays immediately so this diagnostic does not
         contaminate the main memo trace or alter its totals. */
      const eventArrays = [
        parserContext.window.__lbtAuditIncomeEvents,
        parserContext.window.__lbtAuditIncomePairEvents,
        parserContext.window.__lbtAuditSpendEvents
      ];
      const previousLengths = eventArrays.map((events) => events.length);
      const isolated = MEMO.parseMemo(original);
      isolatedSpendRows = (isolated.spends || []).filter((row) =>
        (Number(row?.lp) || 0) !== 0 || (Number(row?.shards) || 0) !== 0
      ).length;
      isolatedReasonCount = (isolated.reasons || []).length;
      eventArrays.forEach((events, index) => { events.length = previousLengths[index]; });
    }
    candidates.push({
      lineIndex,
      hasExplicitSpendAction,
      hasUsageCue,
      usageNearCurrency,
      hasNegativeCurrency,
      looksLikeArithmeticExpression,
      spendRecords: sameLineSpends.length,
      hasSpendRecord: sameLineSpends.length > 0,
      isolatedSpendRows,
      isolatedReasonCount,
      isolatedParseWouldSpend: isolatedSpendRows > 0,
      hasParserReason,
      hasRelatedAudit,
      status: String(coverage?.status || "no-coverage"),
      needsReview: reviewStatuses.has(String(coverage?.status || "")) || hasParserReason || hasRelatedAudit || looksLikeArithmeticExpression,
      lineShape: describeCandidateLine(original, coverage)
    });
  }
  const missing = candidates.filter((row) => !row.hasSpendRecord);
  const summarizeBy = (rows, getKey) => rows.reduce((counts, row) => {
    const key = getKey(row);
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
  return {
    candidateRows: candidates.length,
    explicitSpendActionRows: candidates.filter((row) => row.hasExplicitSpendAction).length,
    usageCueRows: candidates.filter((row) => row.hasUsageCue).length,
    usageNearCurrencyRows: candidates.filter((row) => row.usageNearCurrency).length,
    negativeCurrencyRows: candidates.filter((row) => row.hasNegativeCurrency).length,
    rowsWithSpendRecord: candidates.filter((row) => row.hasSpendRecord).length,
    missingRowsThatParseAsSpendInIsolation: missing.filter((row) => row.isolatedParseWouldSpend).length,
    missingRowsThatDoNotParseAsSpendInIsolation: missing.filter((row) => !row.isolatedParseWouldSpend).length,
    rowsWithoutSpendRecord: missing.length,
    rowsWithoutSpendRecordWithReason: missing.filter((row) => row.hasParserReason || row.hasRelatedAudit || row.needsReview).length,
    rowsWithoutSpendRecordUnexplained: missing.filter((row) => !row.needsReview).length,
    negativeCurrencyRowsWithoutSpendRecord: missing.filter((row) => row.hasNegativeCurrency).length,
    ambiguousArithmeticRowsWithoutSpendRecord: missing.filter((row) => row.looksLikeArithmeticExpression).length,
    missingRowsByStatus: summarizeBy(missing, (row) => row.status),
    missingRows: missing
  };
}

function auditMemo(id, historyIndex, memo) {
  parserContext.window.__lbtAuditIncomeEvents.length = 0;
  parserContext.window.__lbtAuditIncomePairEvents.length = 0;
  parserContext.window.__lbtAuditSpendEvents.length = 0;
  const parsed = MEMO.parseMemo(memo);
  const spendTrace = parserContext.window.__lbtAuditSpendEvents.map((event) => ({
    lineIndex: Number(event.lineIndex) || 0,
    lp: Number(event.lp) || 0,
    shards: Number(event.shards) || 0,
    reason: String(event.reason || "unknown"),
    rawLength: Number(event.rawLength) || 0,
    hasRaw: Boolean(event.hasRaw)
  }));
  const incomePairTrace = parserContext.window.__lbtAuditIncomePairEvents.map((event) => ({
    lineIndex: Number(event.lineIndex) || 0,
    inputLength: Number(event.inputLength) || 0,
    cleanedLength: Number(event.cleanedLength) || 0,
    tokenShape: Array.isArray(event.tokenShape) ? event.tokenShape : [],
    pairs: Array.isArray(event.pairs) ? event.pairs : []
  }));
  const incomeTrace = parserContext.window.__lbtAuditIncomeEvents.map((event) => ({
    lineIndex: Number(event.lineIndex) || 0,
    currency: event.currency === "lp" ? "lp" : "shards",
    amount: Number(event.amount) || 0,
    route: String(event.route || "unknown")
  }));
  const lines = String(memo || "").split(/\r?\n/);
  const coverages = Array.isArray(parsed.financialCoverage) ? parsed.financialCoverage : [];
  const reasons = Array.isArray(parsed.reasons) ? parsed.reasons : [];
  const audits = Array.isArray(parsed.sourceAudits) ? parsed.sourceAudits : [];
  const issues = [];
  let candidates = 0;
  let covered = 0;

  let legacyCandidates = 0;
  let legacyTransactionCandidates = 0;
  let nonTransactionalTicketLabels = 0;
  let nonTransactionalDrawLabels = 0;
  let unclassifiedLegacyCues = 0;
  const unclassifiedLegacyCueExamples = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Effect descriptions beginning with ▶/►/▷ are intentionally excluded by
    // the parser's auditLineCoverage and must not be counted as ledger transactions.
    if (!line.trim()) continue;
    const legacyCandidate = isLegacyFinancialCandidateLine(line);
    if (legacyCandidate) legacyCandidates++;
    if (!isFinancialCandidateLine(line)) {
      if (legacyCandidate && isNonTransactionalTicketLabel(line)) nonTransactionalTicketLabels++;
      else if (legacyCandidate && isNonTransactionalDrawLabel(line)) nonTransactionalDrawLabels++;
      else if (legacyCandidate) {
        unclassifiedLegacyCues++;
        if (unclassifiedLegacyCueExamples.length < 10) {
          unclassifiedLegacyCueExamples.push({
            id, historyIndex, lineIndex: i + 1,
            details: describeCandidateLine(line, null)
          });
        }
      }
      continue;
    }
    candidates++;
    if (legacyCandidate) legacyTransactionCandidates++;
    const lineNumber = i + 1;
    const coverage = coverages.find((entry) => entry && entry.lineIndex === lineNumber);
    const relatedAudit = isRelated(audits, lineNumber);
    const relatedReason = reasons.some((entry) => String(entry.line || "").trim() === line.trim());

    if (!coverage) {
      issues.push({ id, historyIndex, lineIndex: lineNumber, code: "missing-line-coverage", details: describeCandidateLine(line, null) });
      continue;
    }
    covered++;
    if (coverage.status === "unresolved") {
      issues.push({ id, historyIndex, lineIndex: lineNumber, code: "unresolved-line", details: describeCandidateLine(line, coverage) });
    } else if (["mismatch", "direction-review"].includes(coverage.status) && !relatedAudit && !relatedReason) {
      issues.push({ id, historyIndex, lineIndex: lineNumber, code: "unexplained-mismatch", status: coverage.status, details: describeCandidateLine(line, coverage) });
    } else if (coverage.status === "reviewed-by-parser-reason" && !relatedAudit && !relatedReason) {
      issues.push({ id, historyIndex, lineIndex: lineNumber, code: "unshown-parser-reason", details: describeCandidateLine(line, coverage) });
    }
  }

  const hasFinancialCandidate = lines.some((line) => isFinancialCandidateLine(line));
  const hasAmount = hasFinancialCandidate;
  const hasAction = hasFinancialCandidate;
  if (hasAmount && hasAction) {
    const recognized =
      (Number(parsed.income?.lp) || 0) !== 0 ||
      (Number(parsed.income?.shards) || 0) !== 0 ||
      (parsed.spends || []).length > 0 ||
      Object.values(parsed.tickets || {}).some((value) => (Number(value) || 0) > 0) ||
      Object.keys(parsed.pack || {}).length > 0 ||
      (parsed.wins || []).length > 0 ||
      reasons.length > 0 ||
      (parsed.ticketSpends || []).length > 0 ||
      (parsed.sourceAudits || []).some((entry) => entry && entry.severity !== "info");
    if (!recognized) issues.push({ id, historyIndex, lineIndex: null, code: "silent-unparsed-history" });
  }

  const incomeLp = Number(parsed.income?.lp) || 0;
  const incomeShards = Number(parsed.income?.shards) || 0;
  const spentLp = (parsed.spends || []).reduce((sum, row) => sum + Math.abs(Number(row?.lp) || 0), 0);
  const spentShards = (parsed.spends || []).reduce((sum, row) => sum + Math.abs(Number(row?.shards) || 0), 0);
  const reviewStatuses = new Set(["mismatch", "direction-review", "reviewed-by-parser-reason", "candidate-review", "unresolved", "balance-transition-review"]);
  const financial = {
    incomeLp, incomeShards, spentLp, spentShards,
    netLp: incomeLp - spentLp,
    netShards: incomeShards - spentShards,
    reasonCount: reasons.length,
    reviewRows: coverages.filter((entry) => reviewStatuses.has(String(entry?.status || ""))).length
  };
  /* Reviewの診断は本文や理由文を出さず、行位置・section・status・数値方向だけを記録する。 */
  const reviewDetails = coverages
    .filter((entry) => reviewStatuses.has(String(entry?.status || "")))
    .map((entry) => {
      const line = String(entry?.line || "");
      const related = audits.filter((audit) => isRelated([audit], entry.lineIndex));
      return {
        lineIndex: Number(entry.lineIndex) || null,
        section: String(entry.section || ""),
        status: String(entry.status || ""),
        expected: numericShape(entry.expected) ?? null,
        detected: numericShape(entry.detected) ?? null,
        expectedFlows: numericShape(entry.expectedFlows) ?? null,
        detectedFlows: numericShape(entry.detectedFlows) ?? null,
        parserReasonCount: Number(entry.parserReasonCount) || 0,
        sourceFinding: Boolean(entry.sourceFinding),
        hasParserReason: reasons.some((reason) => String(reason.line || "").trim() === line.trim()),
        lineShape: describeCandidateLine(line, entry),
        incomeEvents: incomeTrace.filter((event) => event.lineIndex === Number(entry.lineIndex) && event.lineIndex > 0),
        incomePairEvents: incomePairTrace.filter((event) => event.lineIndex === Number(entry.lineIndex) && event.lineIndex > 0),
        spendEvents: spendTrace.filter((event) => event.lineIndex === Number(entry.lineIndex) && event.lineIndex > 0),
        auditCodes: related.map((audit) => ({
          code: String(audit.code || ""),
          severity: String(audit.severity || "")
        }))
      };
    });

  const spendSignatures = (parsed.spends || []).map(spendSignature).filter(Boolean);
  const reasonCategories = {};
  for (const reason of reasons) {
    const category = categorizeParserReason(reason);
    reasonCategories[category] = (reasonCategories[category] || 0) + 1;
  }

  const explicitSpendCueAudit = auditExplicitSpendCues(lines, spendTrace, reasons, coverages, audits);
  return { historyIndex, candidates, covered, legacyCandidates, legacyTransactionCandidates, nonTransactionalTicketLabels, nonTransactionalDrawLabels, unclassifiedLegacyCues, unclassifiedLegacyCueExamples, issues, financial, incomeTrace, incomePairTrace, spendTrace, reviewDetails, spendSignatures, reasonCategories, explicitSpendCueAudit, coverageStatuses: coverages.reduce((counts, entry) => {
    const status = String(entry?.status || "missing-status");
    counts[status] = (counts[status] || 0) + 1;
    return counts;
  }, {}), currencyDiscrepancies: (parsed.currencyDiscrepancies || []).length };
}


function historyInputSha256(history) {
  const parserInputs = (Array.isArray(history) ? history : []).map((row) => ({
    name: String(row?.name ?? ""),
    memo: String(row?.memo ?? "")
  }));
  return createHash("sha256").update(JSON.stringify(parserInputs)).digest("hex");
}

function countNonemptyMemos(history) {
  return history.filter((row) => String(row?.memo || "").trim()).length;
}

function parseStoredCurrencyAmount(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const normalized = String(value)
    .replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .replace(/[，,]/g, "")
    .trim();
  if (!/^\+?\d+$/.test(normalized)) return null;
  const amount = Number(normalized);
  return Number.isSafeInteger(amount) && amount >= 0 ? amount : null;
}

function parseHistoryTimestamp(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    const ms = Math.abs(value) < 1e12 ? value * 1000 : value;
    return Number.isFinite(new Date(ms).getTime()) ? new Date(ms).getTime() : null;
  }
  const raw = String(value).normalize("NFKC").trim();
  if (!raw) return null;
  let normalized = raw
    .replace(/(\d{4})年\s*(\d{1,2})月\s*(\d{1,2})日?/g, "$1-$2-$3")
    .replace(/\//g, "-");
  if (/^\d{8}$/.test(normalized)) normalized = normalized.slice(0,4)+"-"+normalized.slice(4,6)+"-"+normalized.slice(6,8);
  const time = Date.parse(normalized);
  return Number.isFinite(time) ? time : null;
}

/* Scenario event dates help assess array order, but cannot prove when the saved currency
   snapshot was last edited because the source has no per-field timestamp for currency. */
function auditHistoryChronology(history) {
  const fields = ["date", "createdAt", "at", "timestamp", "time", "updatedAt"];
  const fieldPresence = Object.fromEntries(fields.map((field) => [field, 0]));
  const fieldParsable = Object.fromEntries(fields.map((field) => [field, 0]));
  const rows = (Array.isArray(history) ? history : []).map((row, index) => {
    const source = row && typeof row === "object" ? row : {};
    for (const field of fields) {
      const value = source[field];
      if (value !== null && value !== undefined && String(value).trim() !== "") {
        fieldPresence[field] += 1;
        if (parseHistoryTimestamp(value) !== null) fieldParsable[field] += 1;
      }
    }
    for (const field of fields) {
      const time = parseHistoryTimestamp(source[field]);
      if (time !== null) return { index, time, field };
    }
    return { index, time: null, field: "" };
  });
  const valid = rows.filter((row) => row.time !== null);
  let ascendingBreaks = 0, descendingBreaks = 0, tiedPairs = 0, gapsBetweenComparableRows = 0;
  for (let i = 1; i < valid.length; i++) {
    const previous = valid[i - 1], current = valid[i];
    if (current.index - previous.index > 1) gapsBetweenComparableRows += 1;
    if (current.time < previous.time) ascendingBreaks += 1;
    else if (current.time > previous.time) descendingBreaks += 1;
    else tiedPairs += 1;
  }
  let arrayOrder = "insufficient";
  if (valid.length >= 2) {
    if (ascendingBreaks === 0 && descendingBreaks === 0) arrayOrder = "all-equal";
    else if (ascendingBreaks === 0) arrayOrder = "ascending-or-tied";
    else if (descendingBreaks === 0) arrayOrder = "descending-or-tied";
    else arrayOrder = "mixed";
  }
  const primaryFieldCounts = {};
  for (const row of valid) primaryFieldCounts[row.field] = (primaryFieldCounts[row.field] || 0) + 1;
  return {
    totalRows: rows.length, rowsWithParsableTime: valid.length, rowsWithoutParsableTime: rows.length - valid.length,
    fieldPresence, fieldParsable, primaryFieldCounts, comparablePairs: Math.max(0, valid.length - 1),
    ascendingBreaks, descendingBreaks, tiedPairs, gapsBetweenComparableRows, arrayOrder
  };
}

function storedCurrencyOf(doc) {
  const currency = doc?.currency && typeof doc.currency === "object" ? doc.currency : {};
  return {
    lp: parseStoredCurrencyAmount(currency.lp),
    shards: parseStoredCurrencyAmount(currency.fragment ?? currency.shards ?? currency.fragments)
  };
}

/* 自由メモはキャラ設定・秘密等も含む。ここでは既存取込器と同じ購入短文判定だけを行い、
   原文・アイテム名・秘密の内容はレポートへ一切出さない。 */
function normalizedPurchaseKey(row) {
  return [
    String(row?.name || "").normalize("NFKC").toLocaleLowerCase("ja-JP").replace(/[\s\u3000"'「」『』【】《》・:：,，.。]/g, ""),
    Number(row?.lp) || 0,
    Number(row?.shards) || 0
  ].join("|");
}

function auditFreeNotePurchases(doc, history, memoApi) {
  const notes = doc?.freeNotes && typeof doc.freeNotes === "object" && !Array.isArray(doc.freeNotes)
    ? doc.freeNotes : {};
  const fields = ["secret", "history", "memo", "setting"];
  const noteLines = fields.flatMap((field) =>
    String(notes[field] || "").split(/\r?\n/).map((line, index) => ({
      field, lineIndex: index + 1, line: String(line || "").trim()
    })).filter((row) => row.line)
  );
  const detected = [];
  let candidateActionAmountLines = 0;
  let unrecognizedActionAmountLines = 0;
  const hasMoney = /(?:LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ|けっか)\s*[:：]?\s*[-−+＋]?\s*\d[\d,]*|[-−+＋]?\s*\d[\d,]*\s*(?:LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ|けっか)/i;
  const hasPurchaseAction = /購入|消費|支出|支払|買っ|交換|変換|換算/;
  for (const row of noteLines) {
    if (hasMoney.test(row.line) && hasPurchaseAction.test(row.line)) candidateActionAmountLines += 1;
    const purchase = memoApi?.purchaseRowOf?.(row.line);
    if (purchase && ((Number(purchase.lp) || 0) > 0 || (Number(purchase.shards) || 0) > 0)) {
      detected.push({
        field: row.field,
        lineIndex: row.lineIndex,
        lp: Number(purchase.lp) || 0,
        shards: Number(purchase.shards) || 0,
        key: normalizedPurchaseKey(purchase)
      });
    } else if (hasMoney.test(row.line) && hasPurchaseAction.test(row.line)) {
      unrecognizedActionAmountLines += 1;
    }
  }

  /* 同名・同価格の短文がリザルト本文にも存在する場合は「重複の可能性」とだけ扱う。
     同額・同名の購入を別日に複数回した可能性もあるため、自動的には差し引かない。 */
  const historyOccurrences = new Map();
  for (const historyRow of Array.isArray(history) ? history : []) {
    for (const line of String(historyRow?.memo || "").split(/\r?\n/)) {
      const purchase = memoApi?.purchaseRowOf?.(String(line || "").trim());
      if (!purchase || (!(Number(purchase.lp) || 0) && !(Number(purchase.shards) || 0))) continue;
      const key = normalizedPurchaseKey(purchase);
      historyOccurrences.set(key, (historyOccurrences.get(key) || 0) + 1);
    }
  }
  let possibleOverlapRows = 0;
  let possibleOverlapLp = 0;
  let possibleOverlapShards = 0;
  let lp = 0, shards = 0, nonOverlapLp = 0, nonOverlapShards = 0;
  for (const row of detected) {
    lp += row.lp; shards += row.shards;
    const occurrences = historyOccurrences.get(row.key) || 0;
    if (occurrences > 0) {
      historyOccurrences.set(row.key, occurrences - 1);
      possibleOverlapRows += 1;
      possibleOverlapLp += row.lp;
      possibleOverlapShards += row.shards;
    } else {
      nonOverlapLp += row.lp;
      nonOverlapShards += row.shards;
    }
  }
  return {
    fieldsWithContent: new Set(noteLines.map((row) => row.field)).size,
    nonemptyLines: noteLines.length,
    candidateActionAmountLines,
    recognizedPurchaseRows: detected.length,
    unrecognizedActionAmountLines,
    purchaseLp: lp,
    purchaseShards: shards,
    possibleOverlapRows,
    possibleOverlapLp,
    possibleOverlapShards,
    nonOverlapPurchaseLp: nonOverlapLp,
    nonOverlapPurchaseShards: nonOverlapShards
  };
}

function normalizeExpenseName(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/[「」『』\"'：:]/g, "")
    .replace(/\s+/g, "")
    .toLocaleLowerCase("ja-JP");
}

/* Signatures are used only for overlap analysis; raw names and free-note text are never emitted. */
function spendSignature(row) {
  const lp = Math.abs(Number(row?.lp) || 0);
  const shards = Math.abs(Number(row?.shards) || 0);
  if (!Number.isSafeInteger(lp) || !Number.isSafeInteger(shards)) return null;
  const normalizedName = normalizeExpenseName(row?.name);
  return {
    exact: createHash("sha256").update(normalizedName + "\\0" + lp + "\\0" + shards).digest("hex"),
    amount: lp + "/" + shards,
    lp,
    shards
  };
}

/* Mirror the importer's freeNotes rule: only rows accepted by purchaseRowOf() in the
   secret/history/memo/setting fields become an untimed purchase scenario. */
function auditFreeNotes(doc) {
  const notes = doc?.freeNotes && typeof doc.freeNotes === "object" ? doc.freeNotes : {};
  const fields = ["secret", "history", "memo", "setting"];
  const allLines = fields.flatMap((field) =>
    String(notes[field] || "").split(/\r?\n/).map((line) => String(line || "").trim()).filter(Boolean)
  );
  const expenseCues = allLines.filter((line) => /購入|消費|支出|支払|買っ/.test(line));
  const acceptedLines = allLines.filter((line) =>
    typeof MEMO.purchaseRowOf === "function" && Boolean(MEMO.purchaseRowOf(line))
  );
  const acceptedSet = new Set(acceptedLines);
  const unrecognizedCues = expenseCues.filter((line) => !acceptedSet.has(line));
  const parsed = MEMO.parseMemo(acceptedLines.join("\n"));
  const signatures = (parsed.spends || []).map(spendSignature).filter(Boolean)
    .filter((spend) => spend.lp > 0 || spend.shards > 0);
  let unrecognizedCueRowsWithGenericSpend = 0;
  let unrecognizedCueGenericSpendLp = 0;
  let unrecognizedCueGenericSpendShards = 0;
  let unrecognizedCueRowsWithCurrencyAmount = 0;
  let unrecognizedCueRowsWithParserReason = 0;
  const unrecognizedCueSpendSignatures = [];
  for (const line of unrecognizedCues) {
    if (/(?:LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ)\s*[：:]?\s*[+＋\-−]?\s*\d|[+＋\-−]?\s*\d[\d,，]*\s*(?:LP|ＬＰ|欠片|欠け片|かけら|欠けら|カケラ)/i.test(line)) {
      unrecognizedCueRowsWithCurrencyAmount++;
    }
    const one = MEMO.parseMemo(line);
    const spends = (one.spends || []).map(spendSignature).filter(Boolean);
    const actual = spends.filter((spend) => spend.lp > 0 || spend.shards > 0);
    if (actual.length) unrecognizedCueRowsWithGenericSpend++;
    unrecognizedCueSpendSignatures.push(...actual);
    unrecognizedCueGenericSpendLp += actual.reduce((sum, spend) => sum + spend.lp, 0);
    unrecognizedCueGenericSpendShards += actual.reduce((sum, spend) => sum + spend.shards, 0);
    if ((one.reasons || []).length > 0) unrecognizedCueRowsWithParserReason++;
  }
  return {
    lineCount: allLines.length,
    expenseCueRows: expenseCues.length,
    recognizedPurchaseLines: acceptedLines.length,
    parsedSpendRows: signatures.length,
    cueRowsWithoutPurchaseRow: Math.max(0, expenseCues.length - acceptedLines.length),
    unrecognizedCueRowsWithGenericSpend,
    unrecognizedCueGenericSpendLp,
    unrecognizedCueGenericSpendShards,
    unrecognizedCueRowsWithCurrencyAmount,
    unrecognizedCueRowsWithParserReason,
    unrecognizedCueSpendSignatures,
    acceptedRowsWithoutParsedSpend: Math.max(0, acceptedLines.length - signatures.length),
    spendLp: signatures.reduce((sum, spend) => sum + spend.lp, 0),
    spendShards: signatures.reduce((sum, spend) => sum + spend.shards, 0),
    spendSignatures: signatures
  };
}

function reconcileFreeNotesSpend(historySpendSignatures, freeNotesAudit, residualLp, residualShards) {
  const exactCounts = new Map();
  const amountCounts = new Map();
  for (const spend of historySpendSignatures || []) {
    exactCounts.set(spend.exact, (exactCounts.get(spend.exact) || 0) + 1);
    amountCounts.set(spend.amount, (amountCounts.get(spend.amount) || 0) + 1);
  }
  let exactDuplicateRows = 0;
  let possibleAmountOnlyDuplicateRows = 0;
  let uniqueSpendLpLower = 0;
  let uniqueSpendShardsLower = 0;
  let uniqueSpendLpUpper = 0;
  let uniqueSpendShardsUpper = 0;
  for (const spend of freeNotesAudit?.spendSignatures || []) {
    const exactCount = exactCounts.get(spend.exact) || 0;
    if (exactCount > 0) {
      exactCounts.set(spend.exact, exactCount - 1);
      const amountCount = amountCounts.get(spend.amount) || 0;
      if (amountCount > 0) amountCounts.set(spend.amount, amountCount - 1);
      exactDuplicateRows++;
      continue;
    }
    /* Names can differ between a free-note shorthand and a scenario memo. An amount-only
       match is ambiguous: calculate a lower and upper balance range instead of guessing. */
    const amountCount = amountCounts.get(spend.amount) || 0;
    if (amountCount > 0) {
      amountCounts.set(spend.amount, amountCount - 1);
      possibleAmountOnlyDuplicateRows++;
    } else {
      uniqueSpendLpLower += spend.lp;
      uniqueSpendShardsLower += spend.shards;
    }
    uniqueSpendLpUpper += spend.lp;
    uniqueSpendShardsUpper += spend.shards;
  }
  return {
    exactDuplicateRows,
    possibleAmountOnlyDuplicateRows,
    uniqueSpendLpLower,
    uniqueSpendShardsLower,
    uniqueSpendLpUpper,
    uniqueSpendShardsUpper,
    residualLpAfterFreeNotesLower: Number.isSafeInteger(residualLp) ? residualLp + uniqueSpendLpLower : null,
    residualShardsAfterFreeNotesLower: Number.isSafeInteger(residualShards) ? residualShards + uniqueSpendShardsLower : null,
    residualLpAfterFreeNotesUpper: Number.isSafeInteger(residualLp) ? residualLp + uniqueSpendLpUpper : null,
    residualShardsAfterFreeNotesUpper: Number.isSafeInteger(residualShards) ? residualShards + uniqueSpendShardsUpper : null
  };
}

function toMarkdownReport(report) {
  const summaryRows = [
    ["URL ID", report.inventory.urlCount],
    ["現時点で取得できた文書", report.inventory.fetched],
    ["以前は取得可能だったが今回取得不可", report.inventory.accessRegressions],
    ["取得不可のまま（以前から既知）", report.inventory.stillUnavailable],
    ["履歴行", report.source.historyRows],
    ["メモ付き履歴", report.source.memoRows],
    ["旧条件の金額＋語句候補（比較基準）", report.parser.legacyCandidateRows],
    ["実操作条件を満たす候補行", report.parser.candidateRows],
    ["旧候補のうち実操作条件も満たす行", report.parser.legacyTransactionCandidateRows],
    ["実操作を確認できないチケットラベル（別集計）", report.parser.nonTransactionalTicketLabelRows],
    ["実操作を確認できない抽出／ガチャラベル（別集計）", report.parser.nonTransactionalDrawLabelRows],
    ["旧候補のうち分類できなかった行", report.parser.unclassifiedLegacyCueRows],
    ["候補行の監査coverage", report.parser.coveredCandidateRows],
    ["現在残高セクションの人手確認候補", report.parser.currentBalanceReviewRows],
    ["監査coverage欠落・未解決等", report.parser.issues.length],
    ["通貨不一致／残高関連警告", report.parser.currencyDiscrepancies],
    ["残高ブリッジの対象文書（履歴メモ・通貨値あり）", report.balance.summary.eligibleDocuments],
    ["ルール上の初期資源（LP / 欠片）", report.balance.ruleBasedOpening.summary.ruleInitialLp + " / " + report.balance.ruleBasedOpening.summary.ruleInitialShards],
    ["残高アンカーが読めた文書（LP / 欠片）", report.balance.ruleBasedOpening.summary.lpWithAnchors + " / " + report.balance.ruleBasedOpening.summary.shardsWithAnchors],
    ["残高語句／矢印を含むメモ行", report.balance.balanceCuePatterns.cueLines],
    ["「現在／現座」を含むメモ行", report.balance.balanceCuePatterns.currentWordLines],
    ["矢印を含むメモ行", report.balance.balanceCuePatterns.arrowLines],
    ["残高語句がある文書 / 現在語がある文書", report.balance.balanceCuePatterns.documentsWithAnyBalanceCue + " / " + report.balance.balanceCuePatterns.documentsWithExplicitCurrentWord],
    ["推定開始残高が初期資源の範囲内（LP / 欠片）", report.balance.ruleBasedOpening.summary.lpOpeningWithinRuleRange + " / " + report.balance.ruleBasedOpening.summary.shardsOpeningWithinRuleRange],
    ["自由メモの認識済み購入行", report.balance.freeNotePurchase.summary.recognizedPurchaseRows],
    ["自由メモのLP / 欠片支出候補", report.balance.freeNotePurchase.summary.purchaseLp + " / " + report.balance.freeNotePurchase.summary.purchaseShards],
    ["リザルト履歴と重複する可能性のある自由メモ行", report.balance.freeNotePurchase.summary.possibleOverlapRows],
    ["自由メモの未認識購入語句行", report.balance.freeNotesSource.summary.expenseCueRowsNotRecognized],
    ["未認識行のうち通常パーサーが支出額を抽出できた行", report.balance.freeNotesSource.summary.unrecognizedCueRowsWithGenericSpend],
    ["未認識行から抽出されたLP / 欠片支出候補", report.balance.freeNotesSource.summary.unrecognizedCueGenericSpendLp + " / " + report.balance.freeNotesSource.summary.unrecognizedCueGenericSpendShards],
    ["自由メモと履歴の完全一致重複行", report.balance.freeNotesBridge.summary.rowsExactlyDuplicatedWithScenarioSpend],
    ["金額だけ一致する重複候補行", report.balance.freeNotesBridge.summary.rowsPotentiallyDuplicatedByAmountOnly],
    ["パーサー保留理由の分類数", Object.keys(report.parser.reasonCategories).length],
    ["自由メモの支出候補を追加して両通貨が初期範囲内になるデータ", report.balance.freeNotePurchase.summary.bothFitCountIfNonOverlapAdded],
    ["全アンカーで開始残高推定が一致（LP / 欠片）", report.balance.ruleBasedOpening.summary.lpOpeningStableAcrossAnchors + " / " + report.balance.ruleBasedOpening.summary.shardsOpeningStableAcrossAnchors],
    ["最新アンカーから保存残高を再現（LP / 欠片）", report.balance.ruleBasedOpening.summary.lpLatestAnchorMatchesCurrent + " / " + report.balance.ruleBasedOpening.summary.shardsLatestAnchorMatchesCurrent],
    ["明示的な初期作成ラベルあり", report.balance.ruleBasedOpening.summary.explicitInitialGrantRecorded],
    ["ラベルなしを含む初期30LP・欠片10の一致候補", report.balance.ruleBasedOpening.summary.exactInitialAmountCandidates + " 文書 / " + report.balance.ruleBasedOpening.summary.exactInitialAmountRows + " 行"],
    ["LPの残差が負（収支純額が所持LPを上回る）", report.balance.summary.lpResidualNegative],
    ["欠片の残差が負（収支純額が所持欠片を上回る）", report.balance.summary.shardResidualNegative],
    ["旧ベースラインとの履歴件数差", report.source.snapshotDrift.length],
    ["履歴入力指紋未登録", report.source.historyInputFingerprintMissingRows],
    ["履歴入力指紋の内容差", report.source.historyInputFingerprintDrift.length],
    ["日時を抽出できた履歴行", report.source.historyChronologySummary.rowsWithParsableTime + " / " + report.source.historyChronologySummary.rows],
    ["日時を抽出できた文書（全体 / 残高照合対象）", report.source.historyChronologySummary.documentsWithAnyParsableTime + " / " + report.source.historyChronologySummary.balanceEligibleWithParsableTime],
    ["配列順（昇順相当 / 降順相当 / 混在）", (report.source.historyChronologySummary.balanceEligibleOrderCounts["ascending-or-tied"] || 0) + " / " + (report.source.historyChronologySummary.balanceEligibleOrderCounts["descending-or-tied"] || 0) + " / " + (report.source.historyChronologySummary.balanceEligibleOrderCounts.mixed || 0)],
    ["通貨額＋支出語句／負額の支出候補行", report.parser.explicitSpendCueAuditSummary.candidateRows],
    ["支出候補内の「使用／使い」表記", report.parser.explicitSpendCueAuditSummary.usageCueRows],
    ["うち通貨額の近くに「使用／使い」がある", report.parser.explicitSpendCueAuditSummary.usageNearCurrencyRows],
    ["うち支出明細が同じ行にある", report.parser.explicitSpendCueAuditSummary.rowsWithSpendRecord],
    ["支出明細がない候補（理由・要確認あり／算術式候補を含む）", report.parser.explicitSpendCueAuditSummary.rowsWithoutSpendRecordWithReason],
    ["うち複数額・括弧・演算子を伴う負額候補", report.parser.explicitSpendCueAuditSummary.ambiguousArithmeticRowsWithoutSpendRecord],
    ["支出明細がないが単独解析なら支出になる行", report.parser.explicitSpendCueAuditSummary.missingRowsThatParseAsSpendInIsolation],
    ["単独解析でも支出にならない行", report.parser.explicitSpendCueAuditSummary.missingRowsThatDoNotParseAsSpendInIsolation],
    ["支出明細も理由もない候補", report.parser.explicitSpendCueAuditSummary.rowsWithoutSpendRecordUnexplained],
    ["負の通貨額なのに支出明細がない行", report.parser.explicitSpendCueAuditSummary.negativeCurrencyRowsWithoutSpendRecord],
    ["支出明細ゼロかつ負の残差がある文書", report.parser.explicitSpendCueAuditSummary.documentsWithNoParsedSpendAndNegativeResidual],
    ["要確認行のうち期待収支とパーサー検出値に数値差がある候補", report.parser.flowDifferenceSummary.rowsWithNumericDifference],
    ["数値差がある候補：mismatch / 理由確認済み", (report.parser.flowDifferenceSummary.byStatus.mismatch || 0) + " / " + (report.parser.flowDifferenceSummary.byStatus["reviewed-by-parser-reason"] || 0)],
    ["方向未確定のため数値比較から分けた候補行", report.parser.flowDifferenceSummary.unknownDirectionRows],
    ["方向未確定のLP / 欠片金額", report.parser.flowDifferenceSummary.unknownDirectionAmounts.lp + " / " + report.parser.flowDifferenceSummary.unknownDirectionAmounts.shards]
  ];
  const lines = [
    "# 硝子窓共有サンプル・ライブ再監査",
    "",
    "共有文書は読み取り専用で取得しました。原文のメモ・名前・本文はログや成果物に保存していません。",
    "",
    "| 指標 | 件数 |",
    "|---|---:|",
    ...summaryRows.map(([label, value]) => `| ${label} | ${value} |`),
    "",
    "## 所持通貨と履歴収支の橋渡し",
    "",
    "ここでいう残差は保存残高からメモ内の収入−明示支出を引いた値です。開始残高・履歴開始前の調整が不明なため、正の残差は開始残高や未記録収入で説明できる可能性があります。負の残差は、非負の開始残高だけでは説明できず、未記録支出・収入の過大計上・解析対象外の履歴を確認する必要があります。",
    "",
    "| URL ID | 履歴行 | メモ行 | 保存LP | 収支純額LP | 残差LP | 保存欠片 | 収支純額欠片 | 残差欠片 | 要確認行 |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
    ...report.balance.bridges
      .slice()
      .sort((a, b) => (Math.min(a.impliedOpeningLp, a.impliedOpeningShards) - Math.min(b.impliedOpeningLp, b.impliedOpeningShards)))
      .map((row) => "| " + row.id + " | " + row.historyRows + " | " + row.memoRows + " | " + row.currentLp + " | " + row.netLp + " | " + row.impliedOpeningLp + " | " + row.currentShards + " | " + row.netShards + " | " + row.impliedOpeningShards + " | " + row.reviewRows + " |"),
    "",
    "## ルールブック初期資源との残差分類",
    "",
    "ルールブック PDF p.14 は初期作成時に30 LP・自我の欠片10個を付与します（PDF抽出テキスト data/provenance/core.txt の PAGE 14）。単純な保存残高−純収支に加え、メモ中の現在／現座アンカーから各チェックポイントの開始残高を逆算しています。履歴配列順と逆順の両方を試し、アンカー間の推定が安定するか、初期資源0～30 LP／0～10欠片の範囲に入るか、最後のアンカーから保存残高を再現できるかを判定します。順序推定は強い手掛かりですが、メモ自体の誤記や未記録取引があれば推定も崩れるため、単独の証明とは扱いません。",
    "",
    "| URL ID | 履歴行 | 保存LP | 純収支LP | 推定開始LP | LP分類 | LPアンカー数 | アンカー推定LP | LP開始推定安定 | 最新値一致 | 保存欠片 | 純収支欠片 | 推定開始欠片 | 欠片分類 | 欠片アンカー数 | アンカー推定欠片 | 欠片開始推定安定 | 最新値一致 | 推定順序 | 要確認行 |",
    "|---|---:|---:|---:|---:|---|---:|---:|---:|---|---:|---:|---:|---|---:|---:|---:|---|---|---:|",
    ...report.balance.ruleBasedOpening.documents.map((row) =>
      "| " + row.id + " | " + row.historyRows + " | " + row.currentLp + " | " + row.netLp + " | " + row.impliedOpeningLp + " | " + row.lpClass + " | " + (row.lpPreferredAnchorAnalysis?.anchorCount ?? 0) + " | " + (row.lpPreferredAnchorAnalysis?.inferredOpening ?? "—") + " | " + Number(Boolean(row.lpPreferredAnchorAnalysis?.stableAcrossAnchors)) + " | " + (row.lpPreferredAnchorAnalysis?.latestAnchor?.matchesSavedCurrent ?? "—") + " | " + row.currentShards + " | " + row.netShards + " | " + row.impliedOpeningShards + " | " + row.shardsClass + " | " + (row.shardsPreferredAnchorAnalysis?.anchorCount ?? 0) + " | " + (row.shardsPreferredAnchorAnalysis?.inferredOpening ?? "—") + " | " + Number(Boolean(row.shardsPreferredAnchorAnalysis?.stableAcrossAnchors)) + " | " + (row.shardsPreferredAnchorAnalysis?.latestAnchor?.matchesSavedCurrent ?? "—") + " | " + row.preferredHistoryOrder + " | " + row.reviewRows + " |"
    ),
    "",
    "### 要確認行の数値診断（本文・名称は非出力）",
    "",
    "| URL ID | 履歴行 | メモ内行 | section | status | expected | detected | parser reason | source finding | audit codes |",
    "|---|---:|---:|---|---|---|---|---:|---|---|",
    ...report.balance.bridges.flatMap((row) => row.reviewDetails.map((detail) =>
      "| " + row.id + " | " + detail.historyRow + " | " + (detail.lineIndex ?? "—") + " | " + detail.section + " | " + detail.status + " | " + JSON.stringify(detail.expected) + " | " + JSON.stringify(detail.detected) + " | " + Number(detail.hasParserReason) + " | " + Number(detail.sourceFinding) + " | " + detail.auditCodes.map((audit) => audit.code + ":" + audit.severity).join(",") + " |"
    )),
    "",
    "## 自由メモの購入記述と残高差（本文・アイテム名は非出力）",
    "",
    "購入短文の判定はアプリ取込器と同じ purchaseRowOf を使用。リザルト履歴にも同名・同額の認識可能な購入短文がある場合は重複の可能性として印を付けますが、同じ購入を複数回した可能性もあるため自動的に除外しません。",
    "",
    "| URL ID | 認識購入行 | 未認識の金額＋購入語行 | LP支出候補 | 欠片支出候補 | 重複可能行 | 重複以外LP | 重複以外欠片 | 開始LP（重複以外候補を加算） | 開始欠片（重複以外候補を加算） | 両方範囲内 |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|",
    ...report.balance.freeNotePurchase.documents
      .filter((row) => row.recognizedPurchaseRows > 0 || row.unrecognizedActionAmountLines > 0)
      .map((row) => "| " + row.id + " | " + row.recognizedPurchaseRows + " | " + row.unrecognizedActionAmountLines + " | " + row.purchaseLp + " | " + row.purchaseShards + " | " + row.possibleOverlapRows + " | " + row.nonOverlapPurchaseLp + " | " + row.nonOverlapPurchaseShards + " | " + row.residualLpIfOnlyNonOverlapPurchasesAdded + " | " + row.residualShardsIfOnlyNonOverlapPurchasesAdded + " | " + Number(row.bothFitRuleRangeIfNonOverlapAdded) + " |"),
    "",
    "## 自由メモの未認識支出候補（原文・名称は非出力）",
    "",
    "購入行として認識されなかった自由メモのうち、通常の収支パーサーが支出候補を抽出した場合も追加で照合します。これは候補の分析であって、実支出と確定して残高へ反映するものではありません。名前・本文は出力せず、同名＋金額のSHA-256指紋と金額のみで重複候補を扱います。金額だけ一致する場合は別取引の可能性を残して範囲表示します。",
    "",
    "| URL ID | 履歴行 | 購入語句行 | 購入認識行 | 未認識の通常パーサー支出行 | 未認識LP候補 | 未認識欠片候補 | 履歴残差LP | LP残差範囲 | 履歴残差欠片 | 欠片残差範囲 | 完全重複 | 金額のみ重複候補 |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---|---:|---|---:|---:|",
    ...report.balance.freeNotesBridge.documents
      .filter((row) => row.expenseCueRows > 0 || row.parsedSpendRows > 0 || row.unrecognizedCueRowsWithGenericSpend > 0)
      .map((row) => "| " + row.id + " | " + row.historyRows + " | " + row.expenseCueRows + " | " + row.parsedSpendRows + " | " + row.unrecognizedCueRowsWithGenericSpend + " | " + row.unrecognizedCueGenericSpendLp + " | " + row.unrecognizedCueGenericSpendShards + " | " + row.residualLpBeforeFreeNotes + " | " + row.genericCueResidualLpLower + "…" + row.genericCueResidualLpUpper + " | " + row.residualShardsBeforeFreeNotes + " | " + row.genericCueResidualShardsLower + "…" + row.genericCueResidualShardsUpper + " | " + row.genericCueExactDuplicateRows + " | " + row.genericCuePossibleAmountOnlyDuplicateRows + " |"),
    "",
    "### パーサー保留理由の分類（本文・購入品名は非出力）",
    "",
    "| 理由分類 | 件数 |",
    "|---|---:|",
    ...Object.entries(report.parser.reasonCategories).sort(([a],[b]) => a.localeCompare(b)).map(([name, count]) => "| " + name + " | " + count + " |"),
    "",
    "## 支出らしい記述と実際の支出明細の対応（本文・名称は非出力）",
    "",
    "通貨額と支出動詞、または明示的な負の通貨額が同じ履歴行にある場合、その行から支出明細が生成されたかを独立に数えます。これは候補抽出であり、支出の事実認定ではありません。残高注記・変換・購入表記など曖昧な行は「理由／要確認あり」に分離し、原文は出力しません。",
    "",
    "| URL ID | 履歴行 | メモ行 | 支出候補 | 支出動詞あり | 負の通貨額 | 明細あり | 明細なし | 明細なし・理由/要確認あり | 明細なし・説明なし | 負額なのに明細なし |",
    "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
    ...report.parser.explicitSpendCueAuditDocuments
      .filter((row) => row.rowsWithoutSpendRecord > 0 || row.negativeCurrencyRowsWithoutSpendRecord > 0)
      .map((row) => "| " + row.id + " | " + row.historyRows + " | " + row.memoRows + " | " + row.candidateRows + " | " + row.explicitSpendActionRows + " | " + row.negativeCurrencyRows + " | " + row.rowsWithSpendRecord + " | " + row.rowsWithoutSpendRecord + " | " + row.rowsWithoutSpendRecordWithReason + " | " + row.rowsWithoutSpendRecordUnexplained + " | " + row.negativeCurrencyRowsWithoutSpendRecord + " |"),
    "",
    "### 支出明細がない候補行の形状（本文・名称・金額は非出力）",
    "",
    "この一覧は支出と断定したものではありません。原文に戻らずとも、数値トークンの数、通貨種別、記述内の操作語・残高語・チケット語、パーサーのcoverage状態を比較し、未解析の実支出か、アイテム数や状態注記などの誤候補かを切り分けるための構造情報です。具体的な数値・原文・アイテム名は出力しません。",
    "",
    "| URL ID | 履歴行 | メモ行 | 支出語句 | 負額 | 算術式候補 | coverage | 理由 | 監査関連 | 行長 | 金額候補数 | 通貨/桁幅 | 操作分類 | 残高語 | チケット分類 | 単独解析支出 | 単独支出行数 | 単独理由数 |",
    "|---|---:|---:|---|---|---|---|---|---|---:|---:|---|---|---|---|---|---:|---:|---|",
    ...report.parser.explicitSpendCueAuditDocuments.flatMap((document) =>
      document.missingRows.map((row) => "| " + document.id + " | " + row.historyRow + " | " + row.lineIndex + " | " + Number(row.hasExplicitSpendAction) + " | " + Number(row.hasNegativeCurrency) + " | " + Number(row.looksLikeArithmeticExpression) + " | " + row.status + " | " + Number(row.hasParserReason) + " | " + Number(row.hasRelatedAudit) + " | " + row.lineShape.lineLength + " | " + row.lineShape.amountTokenCount + " | " + row.lineShape.amountTokenShape.map((token) => token.currency + ":" + token.digitWidth).join(",") + " | " + row.lineShape.actionKinds.join("+") + " | " + Number(row.lineShape.hasBalanceCue) + " | " + Number(row.lineShape.ticketClassified) + " | " + Number(row.isolatedParseWouldSpend) + " | " + row.isolatedSpendRows + " | " + row.isolatedReasonCount + " |")
    ),
    "",
    "## 収支方向の期待値とパーサー検出値の差（推定・非確定）",
    "",
    "expectedFlows は語句・数値関係から作った監査側の推定値であり、取引の正解と確定した値ではありません。以下は原因候補の優先順位付け用です。自動補正には使用しません。",
    "",
    "| URL ID | 履歴番号 | 行 | status | expected - detected | 期待値 | 検出値 | 理由数 | source finding |",
    "|---|---:|---:|---|---|---|---|---:|---|",
    ...report.parser.flowDifferenceDetails.map((row) => "| " + row.id + " | " + (row.historyRow ?? "—") + " | " + (row.lineIndex ?? "—") + " | " + row.status + " | " + JSON.stringify(row.difference) + " | " + JSON.stringify(row.expectedFlows) + " | " + JSON.stringify(row.detectedFlows) + " | " + row.parserReasonCount + " | " + Number(row.sourceFinding) + " |"),
    "",
    "## 収支方向が未確定の通貨変換（数値差異とは分離）",
    "",
    "変換・換算行に金額があっても、増減符号が明記されていない場合は収入／支出のどちらかへ推定計上しません。以下は方向未確定の金額候補であり、既知方向の数値不一致とは別に集計しています。",
    "",
    "| URL ID | 履歴番号 | 行 | status | 未確定LP | 未確定欠片 | parser reason |",
    "|---|---:|---:|---|---:|---:|---:|",
    ...report.parser.flowUnknownDirectionDetails.map((row) => "| " + row.id + " | " + (row.historyRow ?? "—") + " | " + (row.lineIndex ?? "—") + " | " + row.status + " | " + row.unknownDirectionExpected.lp + " | " + row.unknownDirectionExpected.shards + " | " + row.parserReasonCount + " |"),
    "",
    "## 履歴配列と日時メタデータ（残高スナップショットの時刻ではない）",
    "",
    "scenarioHistory の日時候補だけを読み、実際の日付・時刻の値はレポートに出さずに配列順を分類します。時系列の配列順が推定できても、保存通貨残高にフィールド単位の更新時刻はないため、残高スナップショットの時点まで証明できるわけではありません。",
    "",
    "| URL ID | 履歴行 | 時刻あり | 時刻なし | 配列順 | 昇順違反 | 降順違反 | 同時刻ペア | date欄 | createdAt欄 | at欄 | timestamp欄 |",
    "|---|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|",
    ...report.source.historyChronologyDocuments.filter((row) => row.balanceEligible).map((row) =>
      "| " + row.id + " | " + row.historyRows + " | " + row.rowsWithParsableTime + " | " + row.rowsWithoutParsableTime + " | " + row.arrayOrder + " | " + row.ascendingBreaks + " | " + row.descendingBreaks + " | " + row.tiedPairs + " | " + (row.fieldPresence.date || 0) + " | " + (row.fieldPresence.createdAt || 0) + " | " + (row.fieldPresence.at || 0) + " | " + (row.fieldPresence.timestamp || 0) + " |"
    ),
    "",
    "## 残高を示す記述パターン（本文非出力）",
    "",
    "| パターン | 行数 |",
    "|---|---:|",
    ...Object.entries(report.balance.balanceCuePatterns.patternCounts).sort((a, b) => b[1] - a[1]).map(([pattern, amount]) => "| " + pattern + " | " + amount + " |"),
    "",
    "この表は語句の組み合わせ・通貨単位・数字の前後関係だけを集計し、メモ本文を出力しません。明示的な「現在／現座」が無く矢印だけの行は、残高アンカーと断定せず候補パターンとして別評価します。",
    "",
    "## 監査coverageの状態別件数",
    "",
    "| 状態 | 件数 |",
    "|---|---:|",
    ...Object.entries(report.parser.coverageStatuses).sort(([a],[b]) => a.localeCompare(b)).map(([name, count]) => `| ${name} | ${count} |`),
    "",
    "## ソーススナップショットの件数差",
    "",
    report.source.snapshotDrift.length
      ? "| ID | 旧履歴数 | 現行履歴数 | 旧メモ数 | 現行メモ数 |\n|---|---:|---:|---:|---:|\n" + report.source.snapshotDrift.map((r) => `| ${r.id} | ${r.expectedHistoryRows} | ${r.actualHistoryRows} | ${r.expectedMemoRows} | ${r.actualMemoRows} |`).join("\n")
      : "差分なし。",
    "",
    "## 履歴入力指紋の内容差（原文は非表示）",
    "",
    report.source.historyInputFingerprintDrift.length
      ? "| ID | 旧SHA-256 | 現行SHA-256 |\n|---|---|---|\n" + report.source.historyInputFingerprintDrift.map((r) => `| ${r.id} | ${r.expectedSha256} | ${r.actualSha256} |`).join("\\n")
      : "差分なし。",
    "",
    "## 監査上の問題（原文は非表示）",
    "",
    report.parser.issues.length
      ? "| ID | 履歴番号 | 行番号 | コード | 状態 |\n|---|---:|---:|---|---|\n" + report.parser.issues.slice(0, 100).map((r) => `| ${r.id} | ${r.historyIndex + 1} | ${r.lineIndex ?? "—"} | ${r.code} | ${r.status || "—"} |`).join("\n")
      : "未解決のcoverage問題は検出されませんでした。",
    "",
    "## 旧候補の未分類構造診断（原文・金額は非表示）",
    "",
    report.parser.unclassifiedLegacyCueExamples.length
      ? "| ID | 履歴番号 | 行番号 | 文字数 | 金額候補数 | 数字幅 | 検出cue |\n|---|---:|---:|---:|---:|---|---|\n" +
        report.parser.unclassifiedLegacyCueExamples.map((r) => `| ${r.id} | ${r.historyIndex + 1} | ${r.lineIndex} | ${r.details.lineLength} | ${r.details.amountTokenCount} | ${r.details.numericTokenWidths.join(",")} | ${r.details.actionKinds.join(",")} |`).join("\\n")
      : "未分類の旧候補はありません。",
    "",
    "`status` が既知の要確認理由にひも付くケースは、原文から断定できない取引として数値を推測せずに残します。"
  ];
  return lines.join("\n") + "\n";
}

const fetched = await mapLimit(baseline.documents, 5, async (entry) => {
  const result = await fetchSample(entry.id);
  if (!result.ok) return { baseline: entry, result };
  const history = Array.isArray(result.doc?.scenarioHistory) ? result.doc.scenarioHistory : [];
  const memoRows = countNonemptyMemos(history);
  const currentBalance = storedCurrencyOf(result.doc);
  const freeNotePurchaseAudit = auditFreeNotePurchases(result.doc, history, MEMO);
  const parsedRows = history.map((row, index) => {
    const memo = String(row?.memo || "");
    if (!memo.trim()) return null;
    return auditMemo(entry.id, index, memo);
  }).filter(Boolean);
  return {
    baseline: entry,
    result,
    actualHistoryRows: history.length,
    actualMemoRows: memoRows,
    currentBalance,
    freeNotePurchaseAudit,
    freeNotesAudit: auditFreeNotes(result.doc),
    historyChronologyAudit: auditHistoryChronology(history),
    ruleBasedOpeningAudit: auditRuleBasedOpening(history, currentBalance, MEMO),
    historyInputSha256: historyInputSha256(history),
    parsedRows
  };
});

const knownSuccessful = baseline.documents.filter((entry) => entry.previousFetchStatus === "OK");
const accessRegressions = fetched.filter((entry) => entry.baseline.previousFetchStatus === "OK" && !entry.result.ok);
const currentlyUnavailable = fetched.filter((entry) => !entry.result.ok);
const stillUnavailable = fetched.filter((entry) => entry.baseline.previousFetchStatus === "403" && !entry.result.ok).length;
const successful = fetched.filter((entry) => entry.result.ok);
const snapshotDrift = successful.filter((entry) => entry.baseline.previousFetchStatus === "OK" && (
  entry.actualHistoryRows !== entry.baseline.historyRows || entry.actualMemoRows !== entry.baseline.memoRows
)).map((entry) => ({
  id: entry.baseline.id,
  expectedHistoryRows: entry.baseline.historyRows,
  actualHistoryRows: entry.actualHistoryRows,
  expectedMemoRows: entry.baseline.memoRows,
  actualMemoRows: entry.actualMemoRows
}));
const historyInputFingerprintMissing = knownSuccessful.filter((entry) =>
  !/^[0-9a-f]{64}$/.test(String(entry.historyInputSha256 || ""))
);
const historyInputFingerprintDrift = successful.filter((entry) =>
  entry.baseline.previousFetchStatus === "OK" &&
  /^[0-9a-f]{64}$/.test(String(entry.baseline.historyInputSha256 || "")) &&
  entry.historyInputSha256 !== entry.baseline.historyInputSha256
).map((entry) => ({
  id: entry.baseline.id,
  expectedSha256: entry.baseline.historyInputSha256,
  actualSha256: entry.historyInputSha256
}));
const allParsedRows = successful.flatMap((entry) => entry.parsedRows || []);
const issueRows = allParsedRows.flatMap((entry) => entry.issues);
const coverageStatuses = {};
for (const row of allParsedRows) for (const [status, count] of Object.entries(row.coverageStatuses)) coverageStatuses[status] = (coverageStatuses[status] || 0) + count;
const parserReasonCategories = {};
for (const row of allParsedRows) for (const [name, count] of Object.entries(row.reasonCategories || {})) {
  parserReasonCategories[name] = (parserReasonCategories[name] || 0) + count;
}

/* 現在のcurrencyと履歴収支を橋渡しする。差額は「既知の開始残高」と同義ではなく、
   履歴開始前からの残高・未記録の調整・パーサーの見落としをまとめた残差として扱う。
   特に負の残差は、開始残高が非負である限り、履歴外の支出または収支の過大計上を要確認。 */
const balanceBridges = successful
  .filter((entry) => entry.actualMemoRows > 0 &&
    Number.isSafeInteger(entry.currentBalance?.lp) &&
    Number.isSafeInteger(entry.currentBalance?.shards))
  .map((entry) => {
    const totals = (entry.parsedRows || []).reduce((sum, row) => {
      const money = row.financial || {};
      for (const key of ["incomeLp", "incomeShards", "spentLp", "spentShards", "netLp", "netShards", "reviewRows", "reasonCount"]) {
        sum[key] += Number(money[key]) || 0;
      }
      return sum;
    }, { incomeLp: 0, incomeShards: 0, spentLp: 0, spentShards: 0, netLp: 0, netShards: 0, reviewRows: 0, reasonCount: 0 });
    return {
      id: entry.baseline.id,
      historyRows: entry.actualHistoryRows,
      memoRows: entry.actualMemoRows,
      currentLp: entry.currentBalance.lp,
      currentShards: entry.currentBalance.shards,
      ...totals,
      impliedOpeningLp: entry.currentBalance.lp - totals.netLp,
      impliedOpeningShards: entry.currentBalance.shards - totals.netShards,
      reviewDetails: (entry.parsedRows || []).flatMap((memo) =>
        (memo.reviewDetails || []).map((detail) => ({
          historyRow: (Number(memo.historyIndex) || 0) + 1,
          ...detail
        }))
      )
    };
  });

const FLOW_FIELDS = ["lpIncome", "lpSpend", "shardsIncome", "shardsSpend"];
const FLOW_UNKNOWN_FIELDS = ["lpUnknown", "shardsUnknown"];
const flowValue = (record, field) => {
  const value = Number(record && record[field]);
  return Number.isFinite(value) ? value : 0;
};
/* The expected side is a heuristic text-shape estimate, not a ground-truth ledger. These
   differences rank rows for manual review; they never authorize an automatic balance fix.
   An unknown conversion direction is kept separate instead of guessed from the income section. */
const flowDifferenceDetails = balanceBridges.flatMap((row) => (row.reviewDetails || [])
  .map((detail) => {
    const expected = detail.expectedFlows || {};
    const detected = detail.detectedFlows || {};
    const unknownCurrency = {
      lp: flowValue(expected, "lpUnknown") > 0,
      shards: flowValue(expected, "shardsUnknown") > 0
    };
    const difference = {};
    for (const field of FLOW_FIELDS) {
      const currency = field.startsWith("lp") ? "lp" : "shards";
      if (unknownCurrency[currency]) continue;
      const delta = flowValue(expected, field) - flowValue(detected, field);
      if (delta !== 0) difference[field] = delta;
    }
    return {
      id: row.id,
      historyRow: detail.historyRow,
      lineIndex: detail.lineIndex,
      status: detail.status,
      parserReasonCount: detail.parserReasonCount,
      sourceFinding: detail.sourceFinding,
      expectedFlows: expected,
      detectedFlows: detected,
      difference
    };
  })
  .filter((detail) => Object.keys(detail.difference).length > 0));
const flowUnknownDirectionDetails = balanceBridges.flatMap((row) => (row.reviewDetails || [])
  .map((detail) => {
    const expected = detail.expectedFlows || {};
    const unknown = {
      lp: flowValue(expected, "lpUnknown"),
      shards: flowValue(expected, "shardsUnknown")
    };
    return {
      id: row.id,
      historyRow: detail.historyRow,
      lineIndex: detail.lineIndex,
      status: detail.status,
      parserReasonCount: detail.parserReasonCount,
      unknownDirectionExpected: unknown
    };
  })
  .filter((detail) => detail.unknownDirectionExpected.lp > 0 || detail.unknownDirectionExpected.shards > 0));
const flowDifferenceSummary = {
  reviewRows: balanceBridges.reduce((sum, row) => sum + (row.reviewDetails || []).length, 0),
  rowsWithNumericDifference: flowDifferenceDetails.length,
  byStatus: flowDifferenceDetails.reduce((counts, row) => {
    counts[row.status] = (counts[row.status] || 0) + 1;
    return counts;
  }, {}),
  unknownDirectionRows: flowUnknownDirectionDetails.length,
  unknownDirectionRowsByStatus: flowUnknownDirectionDetails.reduce((counts, row) => {
    counts[row.status] = (counts[row.status] || 0) + 1;
    return counts;
  }, {}),
  unknownDirectionAmounts: {
    lp: flowUnknownDirectionDetails.reduce((sum, row) => sum + row.unknownDirectionExpected.lp, 0),
    shards: flowUnknownDirectionDetails.reduce((sum, row) => sum + row.unknownDirectionExpected.shards, 0)
  },
  byField: FLOW_FIELDS.reduce((out, field) => {
    const rows = flowDifferenceDetails.filter((row) => Object.hasOwn(row.difference, field));
    out[field] = {
      rows: rows.length,
      expectedTotal: flowDifferenceDetails.reduce((sum, row) => sum + flowValue(row.expectedFlows, field), 0),
      detectedTotal: flowDifferenceDetails.reduce((sum, row) => sum + flowValue(row.detectedFlows, field), 0),
      expectedMinusDetectedTotal: rows.reduce((sum, row) => sum + row.difference[field], 0)
    };
    return out;
  }, {})
};

const chronologyEligibleIds = new Set(balanceBridges.map((row) => row.id));
const historyChronologyDocuments = successful.map((entry) => ({
  id: entry.baseline.id, historyRows: entry.actualHistoryRows,
  balanceEligible: chronologyEligibleIds.has(entry.baseline.id),
  ...(entry.historyChronologyAudit || auditHistoryChronology([]))
}));
const historyChronologySummary = {
  documentsAnalyzed: historyChronologyDocuments.length,
  balanceEligibleDocuments: historyChronologyDocuments.filter((row) => row.balanceEligible).length,
  documentsWithAnyParsableTime: historyChronologyDocuments.filter((row) => row.rowsWithParsableTime > 0).length,
  documentsWithCompleteParsableTime: historyChronologyDocuments.filter((row) => row.historyRows > 0 && row.rowsWithParsableTime === row.historyRows).length,
  documentsWithNoParsableTime: historyChronologyDocuments.filter((row) => row.historyRows > 0 && row.rowsWithParsableTime === 0).length,
  orderCounts: historyChronologyDocuments.reduce((counts, row) => {
    counts[row.arrayOrder] = (counts[row.arrayOrder] || 0) + 1;
    return counts;
  }, {}),
  balanceEligibleOrderCounts: historyChronologyDocuments.filter((row) => row.balanceEligible).reduce((counts, row) => {
    counts[row.arrayOrder] = (counts[row.arrayOrder] || 0) + 1;
    return counts;
  }, {}),
  rows: historyChronologyDocuments.reduce((sum, row) => sum + row.historyRows, 0),
  rowsWithParsableTime: historyChronologyDocuments.reduce((sum, row) => sum + row.rowsWithParsableTime, 0),
  rowsWithoutParsableTime: historyChronologyDocuments.reduce((sum, row) => sum + row.rowsWithoutParsableTime, 0),
  fieldPresence: historyChronologyDocuments.reduce((totals, row) => {
    for (const [field, value] of Object.entries(row.fieldPresence || {})) totals[field] = (totals[field] || 0) + Number(value || 0);
    return totals;
  }, {}),
  fieldParsable: historyChronologyDocuments.reduce((totals, row) => {
    for (const [field, value] of Object.entries(row.fieldParsable || {})) totals[field] = (totals[field] || 0) + Number(value || 0);
    return totals;
  }, {}),
  balanceEligibleWithParsableTime: historyChronologyDocuments.filter((row) => row.balanceEligible && row.rowsWithParsableTime > 0).length,
  balanceEligibleWithNoParsableTime: historyChronologyDocuments.filter((row) => row.balanceEligible && row.historyRows > 0 && row.rowsWithParsableTime === 0).length
};

function openingOrderOf(row) {
  const preferred = row?.ruleAnalysis?.preferredHistoryOrder;
  if (preferred === "history-array-order") return "historyArrayOrder";
  if (preferred === "reverse-history-array") return "reverseHistoryArray";
  return null;
}
function openingAnalysisFor(row, currency) {
  const order = openingOrderOf(row);
  return order ? row?.ruleAnalysis?.[currency]?.openingAnchors?.[order] || null : null;
}
const ruleBasedOpeningAudits = balanceBridges.map((row) => {
  const audit = successful.find((entry) => entry.baseline.id === row.id)?.ruleBasedOpeningAudit || {};
  return {
    id: row.id,
    historyRows: row.historyRows,
    memoRows: row.memoRows,
    currentLp: row.currentLp,
    currentShards: row.currentShards,
    netLp: row.netLp,
    netShards: row.netShards,
    impliedOpeningLp: row.impliedOpeningLp,
    impliedOpeningShards: row.impliedOpeningShards,
    lpClass: audit.lpClass || "not-comparable",
    shardsClass: audit.shardsClass || "not-comparable",
    lpCompatible: Boolean(audit.lpCompatible),
    shardsCompatible: Boolean(audit.shardsCompatible),
    bothCompatible: Boolean(audit.bothCompatible),
    lpNegative: Boolean(audit.lpNegative),
    shardsNegative: Boolean(audit.shardsNegative),
    lpAboveCeiling: Boolean(audit.lpAboveCeiling),
    shardsAboveCeiling: Boolean(audit.shardsAboveCeiling),
    explicitInitialGrantRecorded: Boolean(audit.explicitInitialGrantRecorded),
    explicitInitialGrantRows: audit.explicitInitialGrantRows || [],
    exactInitialAmountRows: audit.exactInitialAmountRows || [],
    preferredHistoryOrder: audit.ruleAnalysis?.preferredHistoryOrder || "not-comparable",
    orderScores: audit.ruleAnalysis?.orderScores || null,
    lpRuleAnalysis: audit.ruleAnalysis?.lp || null,
    shardsRuleAnalysis: audit.ruleAnalysis?.shards || null,
    lpPreferredAnchorAnalysis: openingAnalysisFor(audit, "lp"),
    shardsPreferredAnchorAnalysis: openingAnalysisFor(audit, "shards"),
    reviewRows: row.reviewRows,
    reasonCount: row.reasonCount,
    parserReasons: audit.totals?.parserReasons ?? null,
    currencyDiscrepancies: audit.totals?.currencyDiscrepancies ?? null
  };
});
const count = (rows, predicate) => rows.filter(predicate).length;
const ruleBasedOpeningSummary = {
  ruleInitialLp: RULE_INITIAL_RESOURCES.lp,
  ruleInitialShards: RULE_INITIAL_RESOURCES.shards,
  eligibleDocuments: ruleBasedOpeningAudits.length,
  lpCompatibleAfterSetupSpend: count(ruleBasedOpeningAudits, (row) => row.lpCompatible),
  shardsCompatibleAfterSetupSpend: count(ruleBasedOpeningAudits, (row) => row.shardsCompatible),
  bothCompatibleAfterSetupSpend: count(ruleBasedOpeningAudits, (row) => row.bothCompatible),
  lpBelowZero: count(ruleBasedOpeningAudits, (row) => row.lpNegative),
  shardsBelowZero: count(ruleBasedOpeningAudits, (row) => row.shardsNegative),
  lpAboveInitialCeiling: count(ruleBasedOpeningAudits, (row) => row.lpAboveCeiling),
  shardsAboveInitialCeiling: count(ruleBasedOpeningAudits, (row) => row.shardsAboveCeiling),
  lpWithAnchors: count(ruleBasedOpeningAudits, (row) => Math.max(row.lpRuleAnalysis?.openingAnchors?.historyArrayOrder?.anchorCount || 0, row.lpRuleAnalysis?.openingAnchors?.reverseHistoryArray?.anchorCount || 0) > 0),
  shardsWithAnchors: count(ruleBasedOpeningAudits, (row) => Math.max(row.shardsRuleAnalysis?.openingAnchors?.historyArrayOrder?.anchorCount || 0, row.shardsRuleAnalysis?.openingAnchors?.reverseHistoryArray?.anchorCount || 0) > 0),
  lpOpeningWithinRuleRange: count(ruleBasedOpeningAudits, (row) => Boolean(row.lpPreferredAnchorAnalysis?.stableAcrossAnchors && row.lpPreferredAnchorAnalysis?.withinRuleInitialRange)),
  shardsOpeningWithinRuleRange: count(ruleBasedOpeningAudits, (row) => Boolean(row.shardsPreferredAnchorAnalysis?.stableAcrossAnchors && row.shardsPreferredAnchorAnalysis?.withinRuleInitialRange)),
  lpOpeningStableAcrossAnchors: count(ruleBasedOpeningAudits, (row) => Boolean(row.lpPreferredAnchorAnalysis?.stableAcrossAnchors)),
  shardsOpeningStableAcrossAnchors: count(ruleBasedOpeningAudits, (row) => Boolean(row.shardsPreferredAnchorAnalysis?.stableAcrossAnchors)),
  lpLatestAnchorMatchesCurrent: count(ruleBasedOpeningAudits, (row) => row.lpPreferredAnchorAnalysis?.latestAnchor?.matchesSavedCurrent === true),
  shardsLatestAnchorMatchesCurrent: count(ruleBasedOpeningAudits, (row) => row.shardsPreferredAnchorAnalysis?.latestAnchor?.matchesSavedCurrent === true),
  historyOrderForwardPreferred: count(ruleBasedOpeningAudits, (row) => row.preferredHistoryOrder === "history-array-order"),
  historyOrderReversePreferred: count(ruleBasedOpeningAudits, (row) => row.preferredHistoryOrder === "reverse-history-array"),
  historyOrderAmbiguous: count(ruleBasedOpeningAudits, (row) => row.preferredHistoryOrder === "ambiguous"),
  explicitInitialGrantRecorded: count(ruleBasedOpeningAudits, (row) => row.explicitInitialGrantRecorded),
  exactInitialAmountCandidates: count(ruleBasedOpeningAudits, (row) => row.exactInitialAmountRows.length > 0),
  exactInitialAmountRows: ruleBasedOpeningAudits.reduce((sum, row) => sum + row.exactInitialAmountRows.length, 0)
};
const balanceCueTotals = {
  memoRows: 0, cueLines: 0, currentWordLines: 0, otherBalanceWordLines: 0,
  arrowLines: 0, lpLines: 0, shardLines: 0, bothCurrencyLines: 0,
  numericBeforeCueLines: 0, numericAfterCueLines: 0, actionCueLines: 0,
  conversionCueLines: 0, patternCounts: {}
};
for (const entry of successful) {
  const cue = entry.ruleBasedOpeningAudit?.balanceCuePatterns || {};
  for (const key of ["memoRows", "cueLines", "currentWordLines", "otherBalanceWordLines", "arrowLines", "lpLines", "shardLines", "bothCurrencyLines", "numericBeforeCueLines", "numericAfterCueLines", "actionCueLines", "conversionCueLines"]) {
    balanceCueTotals[key] += Number(cue[key]) || 0;
  }
  for (const [key, value] of Object.entries(cue.patternCounts || {})) {
    balanceCueTotals.patternCounts[key] = (balanceCueTotals.patternCounts[key] || 0) + Number(value || 0);
  }
}
const balanceCueSummary = {
  ...balanceCueTotals,
  documentsWithAnyBalanceCue: successful.filter((entry) => (entry.ruleBasedOpeningAudit?.balanceCuePatterns?.cueLines || 0) > 0).length,
  documentsWithExplicitCurrentWord: successful.filter((entry) => (entry.ruleBasedOpeningAudit?.balanceCuePatterns?.currentWordLines || 0) > 0).length,
  documentsWithArrow: successful.filter((entry) => (entry.ruleBasedOpeningAudit?.balanceCuePatterns?.arrowLines || 0) > 0).length
};
const freeNotePurchaseAudits = balanceBridges.map((row) => {
  const entry = successful.find((candidate) => candidate.baseline.id === row.id);
  const note = entry?.freeNotePurchaseAudit || {};
  const lpResidualWithAll = row.impliedOpeningLp + (Number(note.purchaseLp) || 0);
  const shardsResidualWithAll = row.impliedOpeningShards + (Number(note.purchaseShards) || 0);
  const lpResidualWithNonOverlap = row.impliedOpeningLp + (Number(note.nonOverlapPurchaseLp) || 0);
  const shardsResidualWithNonOverlap = row.impliedOpeningShards + (Number(note.nonOverlapPurchaseShards) || 0);
  const inRange = (value, ceiling) => Number.isSafeInteger(value) && value >= 0 && value <= ceiling;
  return {
    id: row.id,
    historyRows: row.historyRows,
    currentLp: row.currentLp,
    currentShards: row.currentShards,
    historyNetLp: row.netLp,
    historyNetShards: row.netShards,
    impliedOpeningLp: row.impliedOpeningLp,
    impliedOpeningShards: row.impliedOpeningShards,
    ...note,
    residualLpIfAllNotePurchasesAdded: lpResidualWithAll,
    residualShardsIfAllNotePurchasesAdded: shardsResidualWithAll,
    residualLpIfOnlyNonOverlapPurchasesAdded: lpResidualWithNonOverlap,
    residualShardsIfOnlyNonOverlapPurchasesAdded: shardsResidualWithNonOverlap,
    lpFitsRuleRangeIfAllNotesAdded: inRange(lpResidualWithAll, RULE_INITIAL_RESOURCES.lp),
    shardsFitRuleRangeIfAllNotesAdded: inRange(shardsResidualWithAll, RULE_INITIAL_RESOURCES.shards),
    bothFitRuleRangeIfAllNotesAdded: inRange(lpResidualWithAll, RULE_INITIAL_RESOURCES.lp) && inRange(shardsResidualWithAll, RULE_INITIAL_RESOURCES.shards),
    lpFitsRuleRangeIfNonOverlapAdded: inRange(lpResidualWithNonOverlap, RULE_INITIAL_RESOURCES.lp),
    shardsFitRuleRangeIfNonOverlapAdded: inRange(shardsResidualWithNonOverlap, RULE_INITIAL_RESOURCES.shards),
    bothFitRuleRangeIfNonOverlapAdded: inRange(lpResidualWithNonOverlap, RULE_INITIAL_RESOURCES.lp) && inRange(shardsResidualWithNonOverlap, RULE_INITIAL_RESOURCES.shards)
  };
});
const freeNotePurchaseSummary = {
  eligibleDocuments: freeNotePurchaseAudits.length,
  documentsWithRecognizedPurchaseRows: count(freeNotePurchaseAudits, (row) => row.recognizedPurchaseRows > 0),
  recognizedPurchaseRows: freeNotePurchaseAudits.reduce((sum, row) => sum + row.recognizedPurchaseRows, 0),
  candidateActionAmountLines: freeNotePurchaseAudits.reduce((sum, row) => sum + row.candidateActionAmountLines, 0),
  unrecognizedActionAmountLines: freeNotePurchaseAudits.reduce((sum, row) => sum + row.unrecognizedActionAmountLines, 0),
  possibleOverlapRows: freeNotePurchaseAudits.reduce((sum, row) => sum + row.possibleOverlapRows, 0),
  purchaseLp: freeNotePurchaseAudits.reduce((sum, row) => sum + row.purchaseLp, 0),
  purchaseShards: freeNotePurchaseAudits.reduce((sum, row) => sum + row.purchaseShards, 0),
  nonOverlapPurchaseLp: freeNotePurchaseAudits.reduce((sum, row) => sum + row.nonOverlapPurchaseLp, 0),
  nonOverlapPurchaseShards: freeNotePurchaseAudits.reduce((sum, row) => sum + row.nonOverlapPurchaseShards, 0),
  lpFitCountIfAllNotesAdded: count(freeNotePurchaseAudits, (row) => row.lpFitsRuleRangeIfAllNotesAdded),
  shardsFitCountIfAllNotesAdded: count(freeNotePurchaseAudits, (row) => row.shardsFitRuleRangeIfAllNotesAdded),
  bothFitCountIfAllNotesAdded: count(freeNotePurchaseAudits, (row) => row.bothFitRuleRangeIfAllNotesAdded),
  lpFitCountIfNonOverlapAdded: count(freeNotePurchaseAudits, (row) => row.lpFitsRuleRangeIfNonOverlapAdded),
  shardsFitCountIfNonOverlapAdded: count(freeNotePurchaseAudits, (row) => row.shardsFitRuleRangeIfNonOverlapAdded),
  bothFitCountIfNonOverlapAdded: count(freeNotePurchaseAudits, (row) => row.bothFitRuleRangeIfNonOverlapAdded)
};
const freeNotesBridgeRows = balanceBridges.map((row) => {
  const entry = successful.find((candidate) => candidate.baseline.id === row.id);
  const freeNotesAudit = entry?.freeNotesAudit || {
    lineCount: 0, expenseCueRows: 0, recognizedPurchaseLines: 0, parsedSpendRows: 0,
    cueRowsWithoutPurchaseRow: 0, acceptedRowsWithoutParsedSpend: 0,
    unrecognizedCueRowsWithGenericSpend: 0, unrecognizedCueGenericSpendLp: 0, unrecognizedCueGenericSpendShards: 0,
    unrecognizedCueRowsWithCurrencyAmount: 0, unrecognizedCueRowsWithParserReason: 0,
    spendLp: 0, spendShards: 0, spendSignatures: []
  };
  const scenarioSpendSignatures = (entry?.parsedRows || []).flatMap((memo) => memo.spendSignatures || []);
  const unrecognizedCueReconciliation = reconcileFreeNotesSpend(
    scenarioSpendSignatures,
    { spendSignatures: freeNotesAudit.unrecognizedCueSpendSignatures || [] },
    row.impliedOpeningLp,
    row.impliedOpeningShards
  );
  return {
    id: row.id,
    historyRows: row.historyRows,
    currentLp: row.currentLp,
    currentShards: row.currentShards,
    residualLpBeforeFreeNotes: row.impliedOpeningLp,
    residualShardsBeforeFreeNotes: row.impliedOpeningShards,
    ...{
      lineCount: freeNotesAudit.lineCount,
      expenseCueRows: freeNotesAudit.expenseCueRows,
      recognizedPurchaseLines: freeNotesAudit.recognizedPurchaseLines,
      parsedSpendRows: freeNotesAudit.parsedSpendRows,
      cueRowsWithoutPurchaseRow: freeNotesAudit.cueRowsWithoutPurchaseRow,
      acceptedRowsWithoutParsedSpend: freeNotesAudit.acceptedRowsWithoutParsedSpend,
      unrecognizedCueRowsWithGenericSpend: freeNotesAudit.unrecognizedCueRowsWithGenericSpend,
      unrecognizedCueGenericSpendLp: freeNotesAudit.unrecognizedCueGenericSpendLp,
      unrecognizedCueGenericSpendShards: freeNotesAudit.unrecognizedCueGenericSpendShards,
      unrecognizedCueRowsWithCurrencyAmount: freeNotesAudit.unrecognizedCueRowsWithCurrencyAmount,
      unrecognizedCueRowsWithParserReason: freeNotesAudit.unrecognizedCueRowsWithParserReason,
      freeNotesSpendLp: freeNotesAudit.spendLp,
      freeNotesSpendShards: freeNotesAudit.spendShards
    },
    ...reconcileFreeNotesSpend(
      scenarioSpendSignatures,
      freeNotesAudit,
      row.impliedOpeningLp,
      row.impliedOpeningShards
    ),
    genericCueExactDuplicateRows: unrecognizedCueReconciliation.exactDuplicateRows,
    genericCuePossibleAmountOnlyDuplicateRows: unrecognizedCueReconciliation.possibleAmountOnlyDuplicateRows,
    genericCueCandidateLp: freeNotesAudit.unrecognizedCueGenericSpendLp,
    genericCueCandidateShards: freeNotesAudit.unrecognizedCueGenericSpendShards,
    genericCueResidualLpLower: unrecognizedCueReconciliation.residualLpAfterFreeNotesLower,
    genericCueResidualLpUpper: unrecognizedCueReconciliation.residualLpAfterFreeNotesUpper,
    genericCueResidualShardsLower: unrecognizedCueReconciliation.residualShardsAfterFreeNotesLower,
    genericCueResidualShardsUpper: unrecognizedCueReconciliation.residualShardsAfterFreeNotesUpper
  };
});
const freeNotesBridgeSummary = {
  eligibleDocuments: freeNotesBridgeRows.length,
  documentsWithAnyFreeNotes: freeNotesBridgeRows.filter((row) => row.lineCount > 0).length,
  documentsWithExpenseCues: freeNotesBridgeRows.filter((row) => row.expenseCueRows > 0).length,
  documentsWithRecognizedFreeNotesPurchases: freeNotesBridgeRows.filter((row) => row.parsedSpendRows > 0).length,
  recognizedFreeNotesPurchaseRows: freeNotesBridgeRows.reduce((sum, row) => sum + row.parsedSpendRows, 0),
  recognizedFreeNotesSpendLp: freeNotesBridgeRows.reduce((sum, row) => sum + row.freeNotesSpendLp, 0),
  recognizedFreeNotesSpendShards: freeNotesBridgeRows.reduce((sum, row) => sum + row.freeNotesSpendShards, 0),
  documentsWithExpenseCueRowsNotRecognizedAsPurchase: freeNotesBridgeRows.filter((row) => row.cueRowsWithoutPurchaseRow > 0).length,
  expenseCueRowsNotRecognizedAsPurchase: freeNotesBridgeRows.reduce((sum, row) => sum + row.cueRowsWithoutPurchaseRow, 0),
  unrecognizedCueRowsWithGenericSpend: freeNotesBridgeRows.reduce((sum, row) => sum + row.unrecognizedCueRowsWithGenericSpend, 0),
  unrecognizedCueGenericSpendLp: freeNotesBridgeRows.reduce((sum, row) => sum + row.unrecognizedCueGenericSpendLp, 0),
  unrecognizedCueGenericSpendShards: freeNotesBridgeRows.reduce((sum, row) => sum + row.unrecognizedCueGenericSpendShards, 0),
  unrecognizedCueRowsWithCurrencyAmount: freeNotesBridgeRows.reduce((sum, row) => sum + row.unrecognizedCueRowsWithCurrencyAmount, 0),
  unrecognizedCueRowsWithParserReason: freeNotesBridgeRows.reduce((sum, row) => sum + row.unrecognizedCueRowsWithParserReason, 0),
  rowsAcceptedAsPurchaseButNotParsedAsSpend: freeNotesBridgeRows.reduce((sum, row) => sum + row.acceptedRowsWithoutParsedSpend, 0),
  rowsExactlyDuplicatedWithScenarioSpend: freeNotesBridgeRows.reduce((sum, row) => sum + row.exactDuplicateRows, 0),
  rowsPotentiallyDuplicatedByAmountOnly: freeNotesBridgeRows.reduce((sum, row) => sum + row.possibleAmountOnlyDuplicateRows, 0),
  lpNegativeBefore: freeNotesBridgeRows.filter((row) => row.residualLpBeforeFreeNotes < 0).length,
  lpNegativeAfterPossibleUniqueFreeNotesLower: freeNotesBridgeRows.filter((row) => row.residualLpAfterFreeNotesLower < 0).length,
  lpNegativeAfterPossibleUniqueFreeNotesUpper: freeNotesBridgeRows.filter((row) => row.residualLpAfterFreeNotesUpper < 0).length,
  shardsNegativeBefore: freeNotesBridgeRows.filter((row) => row.residualShardsBeforeFreeNotes < 0).length,
  shardsNegativeAfterPossibleUniqueFreeNotesLower: freeNotesBridgeRows.filter((row) => row.residualShardsAfterFreeNotesLower < 0).length,
  shardsNegativeAfterPossibleUniqueFreeNotesUpper: freeNotesBridgeRows.filter((row) => row.residualShardsAfterFreeNotesUpper < 0).length,
  documentsWithGenericCueSpends: freeNotesBridgeRows.filter((row) => row.unrecognizedCueRowsWithGenericSpend > 0).length,
  genericCueSpendRows: freeNotesBridgeRows.reduce((sum, row) => sum + row.unrecognizedCueRowsWithGenericSpend, 0),
  genericCueSpendLp: freeNotesBridgeRows.reduce((sum, row) => sum + row.unrecognizedCueGenericSpendLp, 0),
  genericCueSpendShards: freeNotesBridgeRows.reduce((sum, row) => sum + row.unrecognizedCueGenericSpendShards, 0),
  lpNegativeAfterGenericCueLower: freeNotesBridgeRows.filter((row) => row.genericCueResidualLpLower < 0).length,
  lpNegativeAfterGenericCueUpper: freeNotesBridgeRows.filter((row) => row.genericCueResidualLpUpper < 0).length,
  shardsNegativeAfterGenericCueLower: freeNotesBridgeRows.filter((row) => row.genericCueResidualShardsLower < 0).length,
  shardsNegativeAfterGenericCueUpper: freeNotesBridgeRows.filter((row) => row.genericCueResidualShardsUpper < 0).length
};

const freeNotesSourceSummary = {
  documentsAnalyzed: successful.length,
  documentsWithAnyFreeNotes: successful.filter((entry) => (entry.freeNotesAudit?.lineCount || 0) > 0).length,
  documentsWithExpenseCues: successful.filter((entry) => (entry.freeNotesAudit?.expenseCueRows || 0) > 0).length,
  documentsWithRecognizedPurchases: successful.filter((entry) => (entry.freeNotesAudit?.parsedSpendRows || 0) > 0).length,
  recognizedPurchaseRows: successful.reduce((sum, entry) => sum + (entry.freeNotesAudit?.parsedSpendRows || 0), 0),
  recognizedSpendLp: successful.reduce((sum, entry) => sum + (entry.freeNotesAudit?.spendLp || 0), 0),
  recognizedSpendShards: successful.reduce((sum, entry) => sum + (entry.freeNotesAudit?.spendShards || 0), 0),
  documentsWithExpenseCuesNotRecognized: successful.filter((entry) => (entry.freeNotesAudit?.cueRowsWithoutPurchaseRow || 0) > 0).length,
  expenseCueRowsNotRecognized: successful.reduce((sum, entry) => sum + (entry.freeNotesAudit?.cueRowsWithoutPurchaseRow || 0), 0),
  unrecognizedCueRowsWithGenericSpend: successful.reduce((sum, entry) => sum + (entry.freeNotesAudit?.unrecognizedCueRowsWithGenericSpend || 0), 0),
  unrecognizedCueGenericSpendLp: successful.reduce((sum, entry) => sum + (entry.freeNotesAudit?.unrecognizedCueGenericSpendLp || 0), 0),
  unrecognizedCueGenericSpendShards: successful.reduce((sum, entry) => sum + (entry.freeNotesAudit?.unrecognizedCueGenericSpendShards || 0), 0),
  unrecognizedCueRowsWithCurrencyAmount: successful.reduce((sum, entry) => sum + (entry.freeNotesAudit?.unrecognizedCueRowsWithCurrencyAmount || 0), 0),
  unrecognizedCueRowsWithParserReason: successful.reduce((sum, entry) => sum + (entry.freeNotesAudit?.unrecognizedCueRowsWithParserReason || 0), 0),
  acceptedRowsWithoutParsedSpend: successful.reduce((sum, entry) => sum + (entry.freeNotesAudit?.acceptedRowsWithoutParsedSpend || 0), 0),
  documentsWithPurchasesButNoScenarioMemo: successful
    .filter((entry) => entry.actualMemoRows === 0 && (entry.freeNotesAudit?.parsedSpendRows || 0) > 0)
    .map((entry) => ({
      id: entry.baseline.id,
      historyRows: entry.actualHistoryRows,
      currentLp: entry.currentBalance?.lp ?? null,
      currentShards: entry.currentBalance?.shards ?? null,
      purchaseRows: entry.freeNotesAudit.parsedSpendRows,
      spendLp: entry.freeNotesAudit.spendLp,
      spendShards: entry.freeNotesAudit.spendShards
    }))
};
const balanceBridgeSummary = {
  eligibleDocuments: balanceBridges.length,
  excludedNoMemoOrUnreadableBalance: successful.length - balanceBridges.length,
  lpResidualNegative: balanceBridges.filter((row) => row.impliedOpeningLp < 0).length,
  lpResidualZero: balanceBridges.filter((row) => row.impliedOpeningLp === 0).length,
  lpResidualPositive: balanceBridges.filter((row) => row.impliedOpeningLp > 0).length,
  shardResidualNegative: balanceBridges.filter((row) => row.impliedOpeningShards < 0).length,
  shardResidualZero: balanceBridges.filter((row) => row.impliedOpeningShards === 0).length,
  shardResidualPositive: balanceBridges.filter((row) => row.impliedOpeningShards > 0).length,
  negativeLpIds: balanceBridges.filter((row) => row.impliedOpeningLp < 0).map((row) => row.id),
  negativeShardIds: balanceBridges.filter((row) => row.impliedOpeningShards < 0).map((row) => row.id)
};
const explicitSpendCueAuditDocuments = successful.map((entry) => {
  const rows = (entry.parsedRows || []).map((row) => row.explicitSpendCueAudit || {});
  const sum = (key) => rows.reduce((total, row) => total + (Number(row[key]) || 0), 0);
  const statuses = {};
  for (const row of rows) for (const [status, count] of Object.entries(row.missingRowsByStatus || {})) {
    statuses[status] = (statuses[status] || 0) + Number(count || 0);
  }
  return {
    id: entry.baseline.id,
    historyRows: entry.actualHistoryRows,
    memoRows: entry.actualMemoRows,
    candidateRows: sum("candidateRows"),
    explicitSpendActionRows: sum("explicitSpendActionRows"),
    usageCueRows: sum("usageCueRows"),
    usageNearCurrencyRows: sum("usageNearCurrencyRows"),
    negativeCurrencyRows: sum("negativeCurrencyRows"),
    rowsWithSpendRecord: sum("rowsWithSpendRecord"),
    rowsWithoutSpendRecord: sum("rowsWithoutSpendRecord"),
    rowsWithoutSpendRecordWithReason: sum("rowsWithoutSpendRecordWithReason"),
    rowsWithoutSpendRecordUnexplained: sum("rowsWithoutSpendRecordUnexplained"),
    negativeCurrencyRowsWithoutSpendRecord: sum("negativeCurrencyRowsWithoutSpendRecord"),
    ambiguousArithmeticRowsWithoutSpendRecord: sum("ambiguousArithmeticRowsWithoutSpendRecord"),
    missingRowsThatParseAsSpendInIsolation: sum("missingRowsThatParseAsSpendInIsolation"),
    missingRowsThatDoNotParseAsSpendInIsolation: sum("missingRowsThatDoNotParseAsSpendInIsolation"),
    missingRowsByStatus: statuses,
    missingRows: (entry.parsedRows || []).flatMap((memo) =>
      (memo.explicitSpendCueAudit?.missingRows || []).map((row) => ({
        historyRow: (Number(memo.historyIndex) || 0) + 1,
        ...row
      }))
    )
  };
});
const explicitSpendCueAuditSummary = {
  documentsAnalyzed: explicitSpendCueAuditDocuments.length,
  candidateRows: explicitSpendCueAuditDocuments.reduce((sum, row) => sum + row.candidateRows, 0),
  explicitSpendActionRows: explicitSpendCueAuditDocuments.reduce((sum, row) => sum + row.explicitSpendActionRows, 0),
  negativeCurrencyRows: explicitSpendCueAuditDocuments.reduce((sum, row) => sum + row.negativeCurrencyRows, 0),
  rowsWithSpendRecord: explicitSpendCueAuditDocuments.reduce((sum, row) => sum + row.rowsWithSpendRecord, 0),
  rowsWithoutSpendRecord: explicitSpendCueAuditDocuments.reduce((sum, row) => sum + row.rowsWithoutSpendRecord, 0),
  rowsWithoutSpendRecordWithReason: explicitSpendCueAuditDocuments.reduce((sum, row) => sum + row.rowsWithoutSpendRecordWithReason, 0),
  rowsWithoutSpendRecordUnexplained: explicitSpendCueAuditDocuments.reduce((sum, row) => sum + row.rowsWithoutSpendRecordUnexplained, 0),
  negativeCurrencyRowsWithoutSpendRecord: explicitSpendCueAuditDocuments.reduce((sum, row) => sum + row.negativeCurrencyRowsWithoutSpendRecord, 0),
  missingRowsByStatus: explicitSpendCueAuditDocuments.reduce((counts, row) => {
    for (const [status, count] of Object.entries(row.missingRowsByStatus || {})) counts[status] = (counts[status] || 0) + count;
    return counts;
  }, {}),
  documentsWithUnexplainedMissingSpend: explicitSpendCueAuditDocuments.filter((row) => row.rowsWithoutSpendRecordUnexplained > 0).length,
  documentsWithNegativeCurrencyWithoutSpend: explicitSpendCueAuditDocuments.filter((row) => row.negativeCurrencyRowsWithoutSpendRecord > 0).length,
  documentsWithNoParsedSpendAndNegativeResidual: explicitSpendCueAuditDocuments.filter((row) => {
    const bridge = balanceBridges.find((item) => item.id === row.id);
    return bridge && bridge.spentLp === 0 && bridge.spentShards === 0 &&
      (bridge.impliedOpeningLp < 0 || bridge.impliedOpeningShards < 0);
  }).length
};

const report = {
  inventory: {
    urlCount: baseline.documents.length,
    fetched: successful.length,
    accessRegressions: accessRegressions.length,
    stillUnavailable
  },
  source: {
    historyRows: successful.reduce((sum, entry) => sum + entry.actualHistoryRows, 0),
    memoRows: successful.reduce((sum, entry) => sum + entry.actualMemoRows, 0),
    /* Emit all live IDs and hashes only while bootstrapping missing baselines. */
    historyInputFingerprintMissingRows: historyInputFingerprintMissing.length,
    historyInputFingerprintDrift,
    historyInputFingerprints: historyInputFingerprintMissing.length
      ? successful.filter((entry) => entry.baseline.previousFetchStatus === "OK")
          .map((entry) => ({ id: entry.baseline.id, sha256: entry.historyInputSha256 }))
      : [],
    snapshotDrift,
    historyChronologySummary,
    historyChronologyDocuments
  },
  parser: {
    legacyCandidateRows: allParsedRows.reduce((sum, row) => sum + row.legacyCandidates, 0),
    legacyTransactionCandidateRows: allParsedRows.reduce((sum, row) => sum + row.legacyTransactionCandidates, 0),
    candidateRows: allParsedRows.reduce((sum, row) => sum + row.candidates, 0),
    coveredCandidateRows: allParsedRows.reduce((sum, row) => sum + row.covered, 0),
    nonTransactionalTicketLabelRows: allParsedRows.reduce((sum, row) => sum + row.nonTransactionalTicketLabels, 0),
    nonTransactionalDrawLabelRows: allParsedRows.reduce((sum, row) => sum + row.nonTransactionalDrawLabels, 0),
    unclassifiedLegacyCueRows: allParsedRows.reduce((sum, row) => sum + row.unclassifiedLegacyCues, 0),
    unclassifiedLegacyCueExamples: allParsedRows.flatMap((row) => row.unclassifiedLegacyCueExamples || []).slice(0, 20),
    currentBalanceReviewRows: coverageStatuses["current-balance-review"] || 0,
    currencyDiscrepancies: allParsedRows.reduce((sum, row) => sum + row.currencyDiscrepancies, 0),
    coverageStatuses,
    reasonCategories: parserReasonCategories,
    explicitSpendCueAuditSummary,
    explicitSpendCueAuditDocuments,
    flowDifferenceSummary,
    flowDifferenceDetails,
    flowUnknownDirectionDetails,
    issues: issueRows
  },
  balance: {
    interpretation: "ルールブック初期資源は30 LP / 自我の欠片10。シナリオ開始時点の推定残高は、開始前の人格・アイテム購入などにより低くなり得る。現在/現座の残高アンカーと、それ以前にパーサが認識した収支から開始残高を各チェックポイントごとに逆算し、値が安定するか・0～初期資源上限内か・最新アンカーから保存残高へ再現できるかを確認する。",
    summary: balanceBridgeSummary,
    bridges: balanceBridges,
    ruleBasedOpening: {
      summary: ruleBasedOpeningSummary,
      documents: ruleBasedOpeningAudits
    },
    balanceCuePatterns: balanceCueSummary,
    freeNotesBridge: {
      summary: freeNotesBridgeSummary,
      documents: freeNotesBridgeRows
    },
    freeNotesSource: {
      summary: freeNotesSourceSummary
    },
    freeNotePurchase: {
      interpretation: "自由メモの狭い購入短文だけを検出。リザルト履歴との一致は重複の可能性であって確定ではない。支出を足した場合の残差は説明力診断であり、データへ適用しない。",
      summary: freeNotePurchaseSummary,
      documents: freeNotePurchaseAudits
    }
  }
};

const markdown = toMarkdownReport(report);
console.log(markdown);
console.log(JSON.stringify({
  summary: {
    urls: report.inventory.urlCount,
    fetched: report.inventory.fetched,
    accessRegressions: report.inventory.accessRegressions,
    stillUnavailable: report.inventory.stillUnavailable,
    historyRows: report.source.historyRows,
    memoRows: report.source.memoRows,
    legacyCandidateRows: report.parser.legacyCandidateRows,
    legacyTransactionCandidateRows: report.parser.legacyTransactionCandidateRows,
    candidateRows: report.parser.candidateRows,
    coveredCandidateRows: report.parser.coveredCandidateRows,
    nonTransactionalTicketLabelRows: report.parser.nonTransactionalTicketLabelRows,
    nonTransactionalDrawLabelRows: report.parser.nonTransactionalDrawLabelRows,
    unclassifiedLegacyCueRows: report.parser.unclassifiedLegacyCueRows,
    currentBalanceReviewRows: report.parser.currentBalanceReviewRows,
    issueCount: report.parser.issues.length,
    currencyDiscrepancies: report.parser.currencyDiscrepancies,
    balanceBridgeDocuments: report.balance.summary.eligibleDocuments,
    ruleBasedOpeningDocuments: report.balance.ruleBasedOpening.summary.eligibleDocuments,
    ruleBasedLpCompatibleAfterSetupSpend: report.balance.ruleBasedOpening.summary.lpCompatibleAfterSetupSpend,
    ruleBasedShardCompatibleAfterSetupSpend: report.balance.ruleBasedOpening.summary.shardsCompatibleAfterSetupSpend,
    ruleBasedBothCompatibleAfterSetupSpend: report.balance.ruleBasedOpening.summary.bothCompatibleAfterSetupSpend,
    ruleBasedLpBelowZero: report.balance.ruleBasedOpening.summary.lpBelowZero,
    ruleBasedShardBelowZero: report.balance.ruleBasedOpening.summary.shardsBelowZero,
    ruleBasedLpAboveInitialCeiling: report.balance.ruleBasedOpening.summary.lpAboveInitialCeiling,
    ruleBasedShardAboveInitialCeiling: report.balance.ruleBasedOpening.summary.shardsAboveInitialCeiling,
    ruleBasedLpWithAnchors: report.balance.ruleBasedOpening.summary.lpWithAnchors,
    ruleBasedShardWithAnchors: report.balance.ruleBasedOpening.summary.shardsWithAnchors,
    ruleBasedLpOpeningStableAcrossAnchors: report.balance.ruleBasedOpening.summary.lpOpeningStableAcrossAnchors,
    ruleBasedShardOpeningStableAcrossAnchors: report.balance.ruleBasedOpening.summary.shardsOpeningStableAcrossAnchors,
    ruleBasedLpLatestAnchorMatchesCurrent: report.balance.ruleBasedOpening.summary.lpLatestAnchorMatchesCurrent,
    ruleBasedShardLatestAnchorMatchesCurrent: report.balance.ruleBasedOpening.summary.shardsLatestAnchorMatchesCurrent,
    preferredHistoryOrder: {
      forward: report.balance.ruleBasedOpening.summary.historyOrderForwardPreferred,
      reverse: report.balance.ruleBasedOpening.summary.historyOrderReversePreferred,
      ambiguous: report.balance.ruleBasedOpening.summary.historyOrderAmbiguous
    },
    explicitInitialGrantRecorded: report.balance.ruleBasedOpening.summary.explicitInitialGrantRecorded,
    exactInitialAmountCandidates: report.balance.ruleBasedOpening.summary.exactInitialAmountCandidates,
    exactInitialAmountRows: report.balance.ruleBasedOpening.summary.exactInitialAmountRows,
    negativeLpResidualDocuments: report.balance.summary.lpResidualNegative,
    negativeShardResidualDocuments: report.balance.summary.shardResidualNegative,
    snapshotDriftRows: report.source.snapshotDrift.length,
    historyInputFingerprintMissingRows: report.source.historyInputFingerprintMissingRows,
    historyInputFingerprintDriftRows: report.source.historyInputFingerprintDrift.length,
    historyRowsWithParsableTime: report.source.historyChronologySummary.rowsWithParsableTime,
    historyRowsWithoutParsableTime: report.source.historyChronologySummary.rowsWithoutParsableTime,
    historyArrayOrderCounts: report.source.historyChronologySummary.orderCounts,
    balanceEligibleHistoryArrayOrderCounts: report.source.historyChronologySummary.balanceEligibleOrderCounts,
    flowDifferenceRows: report.parser.flowDifferenceSummary.rowsWithNumericDifference,
    explicitSpendCueAuditSummary: report.parser.explicitSpendCueAuditSummary,
    explicitSpendCueAuditDocuments: report.parser.explicitSpendCueAuditDocuments,
    flowDifferenceRowsByStatus: report.parser.flowDifferenceSummary.byStatus,
    flowUnknownDirectionRows: report.parser.flowDifferenceSummary.unknownDirectionRows,
    flowUnknownDirectionRowsByStatus: report.parser.flowDifferenceSummary.unknownDirectionRowsByStatus,
    flowUnknownDirectionAmounts: report.parser.flowDifferenceSummary.unknownDirectionAmounts
  },
  snapshotDrift: report.source.snapshotDrift,
  historyInputFingerprintDrift: report.source.historyInputFingerprintDrift,
  historyInputFingerprints: report.source.historyInputFingerprints,
  issueCodes: report.parser.issues.reduce((counts, issue) => {
    counts[issue.code] = (counts[issue.code] || 0) + 1;
    return counts;
  }, {}),
  balanceBridgeSummary: report.balance.summary,
  balanceBridges: report.balance.bridges,
  ruleBasedOpeningSummary: report.balance.ruleBasedOpening.summary,
  ruleBasedOpeningDocuments: report.balance.ruleBasedOpening.documents,
  balanceCuePatterns: report.balance.balanceCuePatterns,
  freeNotePurchaseSummary: report.balance.freeNotePurchase.summary,
  freeNotePurchaseAudits: report.balance.freeNotePurchase.documents,
  parserReasonCategories: report.parser.reasonCategories,
  flowDifferenceSummary: report.parser.flowDifferenceSummary,
  flowDifferenceDetails: report.parser.flowDifferenceDetails,
  flowUnknownDirectionDetails: report.parser.flowUnknownDirectionDetails,
  historyChronologySummary: report.source.historyChronologySummary,
  historyChronologyDocuments: report.source.historyChronologyDocuments,
  freeNotesSourceSummary: report.balance.freeNotesSource.summary,
  freeNotesBridgeSummary: report.balance.freeNotesBridge.summary,
  freeNotesBridgeDocuments: report.balance.freeNotesBridge.documents,
  balanceCuePatternDocuments: successful.map((entry) => ({
    id: entry.baseline.id,
    historyRows: entry.actualHistoryRows,
    ...entry.ruleBasedOpeningAudit.balanceCuePatterns
  })),
  reviewDetailsCount: report.balance.bridges.reduce((sum, row) => sum + row.reviewDetails.length, 0),
  incomeTraceRouteCounts: successful.flatMap((entry) => (entry.parsedRows || []).flatMap((memo) => memo.incomeTrace || [])).reduce((counts, event) => {
    const key = event.route + ":" + event.currency;
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {}),
  reviewDetails: report.balance.bridges.flatMap((row) => row.reviewDetails.map((detail) => ({ id: row.id, ...detail }))),
  issues: report.parser.issues.slice(0, 100),
  unclassifiedLegacyCueExamples: report.parser.unclassifiedLegacyCueExamples
}, null, 2));

if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown);
if (successful.length < knownSuccessful.length || accessRegressions.length > 0 ||
    report.parser.issues.length > 0 || report.parser.unclassifiedLegacyCueRows > 0 ||
    report.source.historyInputFingerprintMissingRows > 0 ||
    report.source.historyInputFingerprintDrift.length > 0) {
  process.exitCode = 1;
}
