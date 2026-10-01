// "Popular": the default order of Saple's public lists.
//
// Popularity comes only from real activity already in the data on screen:
// how many approved contributions exist, how recent they are, and how many
// open vacancies a company has. There are no view counts, likes or random
// numbers, and a rating is never treated as popularity: a company rated 5.0
// from one review is not more popular than one rated 4.4 from sixty. Ties are
// broken by recency and then by id, never by name, and the order is the same
// on every load. The browser sorts the complete result set before paging it.

const DAY_MS = 86400000;

function ageInDays(value, now) {
  const time = Date.parse(value);
  return Number.isFinite(time) ? Math.max(0, (now - time) / DAY_MS) : 3650;
}

function newestFirst(a, b) {
  return (Date.parse(b) || 0) - (Date.parse(a) || 0);
}

// An explicit search is answered by relevance first: an exact name, then a
// name that starts with the words, then a name that contains them, then a
// match found only in another field (industry, city, country).
export function searchRelevance(name, search) {
  const query = String(search || '').trim().toLowerCase();
  if (!query) return 0;
  const text = String(name || '').toLowerCase();
  if (text === query) return 3;
  if (text.startsWith(query)) return 2;
  if (text.includes(query)) return 1;
  return 0;
}

// Companies: every approved contribution counts once, those from the last 90
// days count three more times, and each open vacancy counts twice.
export function companyPopularity(company) {
  const total = Number(company.reviewCount || 0) + Number(company.communitySalaryCount || 0)
    + Number(company.interviewCount || 0);
  return total + 3 * Number(company.recentActivityCount || 0) + 2 * Number(company.openJobCount || 0);
}

export function comparePopularCompanies(search = '') {
  return (a, b) => searchRelevance(b.companyName, search) - searchRelevance(a.companyName, search)
    || companyPopularity(b) - companyPopularity(a)
    || newestFirst(a.latestActivityAt, b.latestActivityAt)
    || Number(a.companyId) - Number(b.companyId);
}

// Salary groups: more community contributions first, then more verified
// ones, then the most recently approved, then a stable id order.
export function comparePopularSalaries(a, b) {
  return Number(b.communityContributionCount || 0) - Number(a.communityContributionCount || 0)
    || Number(b.verifiedContributionCount || 0) - Number(a.verifiedContributionCount || 0)
    || newestFirst(a.latestApprovedAt, b.latestApprovedAt)
    || Number(a.companyId) - Number(b.companyId)
    || Number(a.roleId) - Number(b.roleId)
    || String(a.currency).localeCompare(String(b.currency))
    || String(a.payPeriod).localeCompare(String(b.payPeriod));
}

// Reviews and interviews have no likes or views, so an item is popular when
// its group (a company, or a company and role) is active: each item in the
// group counts once and each from the last 90 days twice more. The item's own
// recency adds up to 10 points, fading over months, so new experiences surface
// and old ones do not stay on top forever. Verification only breaks ties.
export function sortByPopularity(items, groupKey, now = Date.now()) {
  const totals = new Map();
  const recent = new Map();
  for (const item of items) {
    const key = groupKey(item);
    totals.set(key, (totals.get(key) || 0) + 1);
    if (ageInDays(item.approvedAt, now) <= 90) recent.set(key, (recent.get(key) || 0) + 1);
  }
  const score = (item) => {
    const key = groupKey(item);
    return (totals.get(key) || 0) + 2 * (recent.get(key) || 0) + 10 / (1 + ageInDays(item.approvedAt, now) / 30);
  };
  return items
    .map((item) => ({ item, score: score(item) }))
    .sort((a, b) => b.score - a.score
      || Number(b.item.verificationStatus === 'VERIFIED') - Number(a.item.verificationStatus === 'VERIFIED')
      || newestFirst(a.item.approvedAt, b.item.approvedAt)
      || Number(b.item.submissionId) - Number(a.item.submissionId))
    .map(({ item }) => item);
}
