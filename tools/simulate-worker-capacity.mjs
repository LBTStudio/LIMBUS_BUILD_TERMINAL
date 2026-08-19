const DAILY_LIMIT = 100000;
const SAFE_BUDGET = 80000;

function estimate({ users, sharesPerUser, averageHumanClicksPerShare, customImageRate, viewerFallbackRate, cardFetchesPerShare = 1 }) {
  const shares = users * sharesPerUser;
  const cardHtml = shares * cardFetchesPerShare;
  const cardImages = cardHtml * customImageRate;
  const humanClicks = shares * averageHumanClicksPerShare;
  const viewerFallbacks = humanClicks * viewerFallbackRate;
  const requests = cardHtml + cardImages + humanClicks + viewerFallbacks;
  return { shares, cardHtml, cardImages, humanClicks, viewerFallbacks, requests, limitUse: requests / DAILY_LIMIT, safeUse: requests / SAFE_BUDGET };
}

function maxAllToAllUsers({ sharesPerUser, customImageRate, viewerFallbackRate, cardFetchesPerShare = 1, budget }) {
  let users = 0;
  for (;;) {
    const next = users + 1;
    const result = estimate({ users: next, sharesPerUser, averageHumanClicksPerShare: next, customImageRate, viewerFallbackRate, cardFetchesPerShare });
    if (result.requests > budget) return users;
    users = next;
  }
}

const scenarios = [
  { name: "100人・各1共有・各共有10人閲覧・Discord投稿1回・画像30%", users: 100, sharesPerUser: 1, averageHumanClicksPerShare: 10, cardFetchesPerShare: 1, customImageRate: 0.3, viewerFallbackRate: 0.01 },
  { name: "200人・各1共有・各共有20人閲覧・Discord投稿1回・画像100%", users: 200, sharesPerUser: 1, averageHumanClicksPerShare: 20, cardFetchesPerShare: 1, customImageRate: 1, viewerFallbackRate: 0.01 },
  { name: "200人・各1共有・全員が全共有を閲覧・Discord投稿1回・画像100%", users: 200, sharesPerUser: 1, averageHumanClicksPerShare: 200, cardFetchesPerShare: 1, customImageRate: 1, viewerFallbackRate: 0.01 },
  { name: "200人・各5共有・各共有20人閲覧・Discord投稿1回・画像100%", users: 200, sharesPerUser: 5, averageHumanClicksPerShare: 20, cardFetchesPerShare: 1, customImageRate: 1, viewerFallbackRate: 0.01 },
  { name: "200人・各5共有・全員が全共有を閲覧・Discord投稿1回・画像100%", users: 200, sharesPerUser: 5, averageHumanClicksPerShare: 200, cardFetchesPerShare: 1, customImageRate: 1, viewerFallbackRate: 0.01 },
  { name: "200人・各1共有・各共有20人閲覧・Discord再投稿/再プレビュー5回・画像100%", users: 200, sharesPerUser: 1, averageHumanClicksPerShare: 20, cardFetchesPerShare: 5, customImageRate: 1, viewerFallbackRate: 0.01 }
].map((input) => ({ ...input, ...estimate(input) }));

const limits = [
  { label: "1共有/人・全員閲覧・画像100%・Discord投稿1回・実上限", sharesPerUser: 1, cardFetchesPerShare: 1, customImageRate: 1, viewerFallbackRate: 0.01, budget: DAILY_LIMIT },
  { label: "1共有/人・全員閲覧・画像100%・Discord投稿1回・安全運用", sharesPerUser: 1, cardFetchesPerShare: 1, customImageRate: 1, viewerFallbackRate: 0.01, budget: SAFE_BUDGET },
  { label: "5共有/人・全員閲覧・画像100%・Discord投稿1回・実上限", sharesPerUser: 5, cardFetchesPerShare: 1, customImageRate: 1, viewerFallbackRate: 0.01, budget: DAILY_LIMIT },
  { label: "5共有/人・全員閲覧・画像100%・Discord投稿1回・安全運用", sharesPerUser: 5, cardFetchesPerShare: 1, customImageRate: 1, viewerFallbackRate: 0.01, budget: SAFE_BUDGET }
].map((input) => ({ ...input, users: maxAllToAllUsers(input) }));

console.log(JSON.stringify({ dailyLimit: DAILY_LIMIT, safeBudget: SAFE_BUDGET, scenarios, limits }, null, 2));
