const homeRepository = require('../repositories/home.repository');
const premiumService = require('./premium.service');

// Homepage hero recommendations.
//
// A signed-in member's headline, experience titles, skills, the roles of jobs
// they applied to and the companies they contributed about rank public items;
// none of those signals is returned. Nothing sensitive is used: no messages,
// verification evidence, passwords or personal attributes. Anonymous visitors
// get the same public items ranked by recency, and are never told the list is
// "for you".

const LIMITS = Object.freeze({ jobs: 4, highPaying: 3, interviews: 3, salary: 3, companies: 3 });

// Words that say nothing about a role and would match almost any job.
const STOP_WORDS = new Set([
  'and', 'the', 'for', 'with', 'from', 'into', 'at', 'of', 'in', 'on', 'to', 'a', 'an', 'my', 'our', 'your',
  'senior', 'junior', 'lead', 'head', 'intern', 'trainee', 'associate', 'assistant', 'executive', 'officer',
  'manager', 'specialist', 'member', 'staff', 'team', 'student', 'graduate', 'fresher', 'working', 'currently'
]);

// Lower-case search terms made of letters, digits and a few symbols only, so
// they can never act as SQL LIKE wildcards.
function termsFrom(texts, limit = 12) {
  const terms = [];
  for (const text of texts) {
    for (const word of String(text || '').toLowerCase().split(/[^a-z0-9+#.]+/)) {
      const clean = word.replace(/^[.]+|[.]+$/g, '');
      if (clean.length >= 3 && !STOP_WORDS.has(clean) && !terms.includes(clean)) terms.push(clean);
      if (terms.length >= limit) return terms;
    }
  }
  return terms;
}

// A career-location hint: the city of the most recent (or current) role in
// the member's own experience. It is never a physical location.
function locationFrom(experience) {
  for (const item of experience) {
    const city = String(item.location || '').split(',')[0].trim();
    if (/^[\p{L} .'-]{2,60}$/u.test(city) && !/^remote$/i.test(city)) {
      return { label: city.replace(/\s+/g, ' '), key: city.toLowerCase().replace(/[%_\\]/g, '') };
    }
  }
  return null;
}

function money(value) {
  return value === null || value === undefined ? null : Number(value);
}

function jobCard(row, { locked }) {
  const card = {
    jobId: Number(row.jobId),
    companyId: Number(row.companyId),
    companyName: row.companyName,
    title: row.title,
    location: row.location,
    workMode: row.workMode,
    employmentType: row.employmentType,
    publishedAt: row.publishedAt,
    accessLevel: row.accessLevel,
    locked
  };
  // A locked Premium teaser never carries its salary.
  if (!locked && row.salaryMax !== null && row.salaryMax !== undefined) {
    card.salary = {
      min: money(row.salaryMin), max: money(row.salaryMax), currency: row.salaryCurrency, period: row.salaryPeriod
    };
  }
  return card;
}

async function getRecommendations(user) {
  const userId = user?.userId || null;
  const viewerKey = userId ? `user:${userId}` : 'public';
  const isAdmin = user?.role === 'ADMIN';

  let signals = { headline: null, experience: [], skills: [], roleIds: [], industries: [], appliedJobIds: [] };
  let premium = false;
  if (userId) {
    [signals, premium] = await Promise.all([
      homeRepository.findProfileSignals(userId),
      premiumService.hasPremium(userId)
    ]);
  }
  const fullJobAccess = premium || isAdmin;
  const titleTerms = termsFrom([signals.headline, ...signals.experience.map((item) => item.jobTitle)]);
  const terms = termsFrom([...titleTerms, ...signals.skills], 16);
  const location = userId ? locationFrom(signals.experience) : null;
  const personalized = Boolean(userId) && (terms.length > 0 || signals.roleIds.length > 0 || signals.industries.length > 0);

  const [jobs, highPaying, interviews, companies, salaryInsights] = await Promise.all([
    homeRepository.findRankedJobs({
      viewerKey, terms, roleIds: signals.roleIds, industries: signals.industries,
      location: location?.key || null, excludeJobIds: signals.appliedJobIds, limit: LIMITS.jobs
    }),
    homeRepository.findHighPayingJobs({
      viewerKey, location: location?.key || null, excludeJobIds: signals.appliedJobIds,
      includePremium: fullJobAccess, limit: LIMITS.highPaying
    }),
    homeRepository.findInterviews({ viewerKey, terms, roleIds: signals.roleIds, limit: LIMITS.interviews }),
    homeRepository.findTopReviewedCompanies({ viewerKey, industries: signals.industries, limit: LIMITS.companies }),
    homeRepository.findSalaryInsights({ viewerKey, terms, roleIds: signals.roleIds, limit: LIMITS.salary })
  ]);

  // Interview questions follow the Premium gate: without Premium only a
  // preview exists in the response.
  const interviewItems = interviews.map((row) => ({
    submissionId: Number(row.submissionId),
    companyId: Number(row.companyId),
    companyName: row.companyName,
    roleId: Number(row.roleId),
    roleName: row.roleName,
    difficultyLevel: row.difficultyLevel,
    interviewMode: row.interviewMode,
    approvedAt: row.approvedAt,
    questionsSummary: row.questionsSummary
  }));
  const gatedInterviews = premium
    ? interviewItems.map((item) => ({ ...item, questionsLocked: false }))
    : await premiumService.gateInterviews(interviewItems, null);

  const nearby = highPaying.some((row) => row.nearby);
  return {
    personalized,
    generatedForDate: new Date().toISOString().slice(0, 10),
    jobs: jobs.map((row) => jobCard(row, { locked: row.accessLevel === 'PREMIUM' && !fullJobAccess })),
    highPayingJobs: highPaying.map((row) => jobCard(row, { locked: false })),
    interviews: gatedInterviews,
    companies: companies.map((row) => ({
      companyId: Number(row.companyId),
      companyName: row.companyName,
      industry: row.industry,
      averageRating: Number(row.averageRating),
      reviewCount: Number(row.reviewCount)
    })),
    salaryInsights: salaryInsights.map((row) => ({
      roleId: Number(row.roleId),
      roleName: row.roleName,
      currency: row.currency,
      payPeriod: row.payPeriod,
      minimum: money(row.minimum),
      maximum: money(row.maximum),
      contributions: Number(row.contributions)
    })),
    // Only a city label, and only when a high-paying job there was found.
    locationContext: nearby && location ? { label: location.label, source: 'career_profile' } : null
  };
}

// Cumulative approved insights per month. Leading months before the first
// approval are left out rather than drawn as a flat zero line.
async function getActivitySeries() {
  const rows = await homeRepository.findActivitySeries();
  const first = rows.findIndex((row) => row.cumulativeApprovedInsights > 0);
  return {
    metric: 'cumulativeApprovedInsights',
    points: first < 0 ? [] : rows.slice(first).map((row) => ({
      period: row.period,
      cumulativeApprovedInsights: Number(row.cumulativeApprovedInsights)
    }))
  };
}

module.exports = { LIMITS, termsFrom, locationFrom, getRecommendations, getActivitySeries };
