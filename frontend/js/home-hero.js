import { apiRequest } from './api.js';
import { el, formatRelativeTime, humanizeEnum } from './ui.js';

// The homepage hero's live layer: a few translucent cards drawn from real
// Saple data, and a faint rising line of cumulative approved insights.
//
// Everything here is optional. Nothing shows until its data has arrived, a
// failure leaves the hero exactly as it was, and reduced-motion visitors get
// the same cards and graph without drifting, drawing or rotation.

const ROTATE_EVERY_MS = 10000;
const SWAP_FADE_MS = 450;
const SVG_NS = 'http://www.w3.org/2000/svg';

const layer = document.querySelector('[data-hero-intel]');
const cardHost = document.querySelector('[data-hero-cards]');
const graph = document.querySelector('[data-hero-graph]');
const compactHost = document.querySelector('[data-hero-compact]');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

// ---- Formatting ------------------------------------------------------------------

function compactAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '';
  if (amount >= 1000000) return `${(amount / 1000000).toFixed(amount % 1000000 ? 1 : 0)}m`;
  if (amount >= 1000) return `${(amount / 1000).toFixed(amount % 1000 ? 1 : 0)}k`;
  return String(Math.round(amount));
}

// Each range keeps its own currency and pay period; nothing is converted.
function salaryRange(min, max, currency, period) {
  const prefix = currency === 'BDT' ? '৳' : `${currency} `;
  const per = { MONTHLY: 'month', YEARLY: 'year', HOURLY: 'hour', WEEKLY: 'week' }[period] || humanizeEnum(period).toLowerCase();
  const low = min !== null && min !== undefined ? `${prefix}${compactAmount(min)} – ` : '';
  return `${low}${prefix}${compactAmount(max)} / ${per}`;
}

function shorten(text, maximum = 90) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length > maximum ? `${clean.slice(0, maximum - 1).replace(/[\s,.;:-]+$/, '')}…` : clean;
}

// ---- Card data -------------------------------------------------------------------

// Turns one recommendation response into plain card descriptions. Labels only
// say "for you" when the server actually ranked the items for this account.
function buildCards(data) {
  const personal = data.personalized === true;
  const nearLabel = data.locationContext?.label ? `Opportunities near ${data.locationContext.label}` : null;

  const jobs = (data.jobs || []).map((job) => ({
    kind: 'job',
    label: personal ? 'Jobs for you' : 'Trending job',
    title: job.title,
    lines: [job.companyName, [job.location, humanizeEnum(job.workMode)].filter(Boolean).join(' · ')],
    tag: job.accessLevel === 'PREMIUM' ? 'Premium' : null,
    href: `job-details.html?id=${encodeURIComponent(job.jobId)}`
  }));
  const highPaying = (data.highPayingJobs || []).filter((job) => job.salary).map((job) => ({
    kind: 'salary',
    label: nearLabel || (personal ? 'High-paying opportunity' : 'Salary spotlight'),
    title: job.title,
    lines: [salaryRange(job.salary.min, job.salary.max, job.salary.currency, job.salary.period), job.companyName],
    href: `job-details.html?id=${encodeURIComponent(job.jobId)}`
  }));
  const interviews = (data.interviews || []).map((item) => ({
    kind: 'interview',
    label: personal ? 'Interview insight' : 'Recent interview',
    title: item.roleName,
    // Free visitors only ever receive the preview; Premium gets full text.
    lines: [
      item.companyName,
      item.questionsLocked ? `“${item.questionsPreview || ''}”` : `“${shorten(item.questionsSummary)}”`,
      item.approvedAt ? formatRelativeTime(item.approvedAt) : null
    ].filter(Boolean),
    tag: item.questionsLocked ? 'Preview' : null,
    href: `interviews.html?companyId=${encodeURIComponent(item.companyId)}&roleId=${encodeURIComponent(item.roleId)}`
  }));
  const companies = (data.companies || []).map((company) => ({
    kind: 'company',
    label: 'Top reviewed',
    title: company.companyName,
    lines: [`★ ${company.averageRating.toFixed(1)} · ${company.reviewCount} review${company.reviewCount === 1 ? '' : 's'}`, company.industry],
    href: `company-details.html?id=${encodeURIComponent(company.companyId)}`
  }));
  const salaries = (data.salaryInsights || []).map((insight) => ({
    kind: 'insight',
    label: 'Salary insight',
    title: insight.roleName,
    lines: [
      salaryRange(insight.minimum, insight.maximum, insight.currency, insight.payPeriod),
      `${insight.contributions} contribution${insight.contributions === 1 ? '' : 's'}`
    ],
    href: `salaries.html?roleId=${encodeURIComponent(insight.roleId)}`
  }));

  // Interleave the kinds so the visible set is always varied.
  const groups = [jobs, interviews, highPaying.length ? highPaying : salaries, companies, salaries];
  const pool = [];
  for (let index = 0; pool.length < 16 && groups.some((group) => index < group.length); index += 1) {
    for (const group of groups) {
      if (group[index] && !pool.includes(group[index])) pool.push(group[index]);
    }
  }
  return pool.filter((card) => card.title);
}

function fillCard(node, card) {
  node.href = card.href;
  node.dataset.kind = card.kind;
  node.replaceChildren(
    el('span', { className: 'intel-card-label' }, [card.label, card.tag ? el('span', { className: 'intel-card-tag', text: card.tag }) : null]),
    el('span', { className: 'intel-card-title', text: card.title }),
    ...card.lines.filter(Boolean).map((line) => el('span', { className: 'intel-card-line', text: line }))
  );
}

// ---- Cards: render and rotate -------------------------------------------------

let rotationTimer = 0;

// The next card in the pool that is not on screen, preferring one whose title
// is not showing either, so one role never fills several cards at once.
function nextCard(pool, start, visible) {
  const titles = new Set(visible.map((card) => card.title));
  let fallback = null;
  for (let step = 0; step < pool.length; step += 1) {
    const index = (start + step) % pool.length;
    const card = pool[index];
    if (visible.includes(card)) continue;
    if (!titles.has(card.title)) return { card, index };
    fallback ||= { card, index };
  }
  return fallback;
}

function renderCards(pool) {
  if (!cardHost || !pool.length) return false;
  const inSlot = [];
  let cursor = 0;
  while (inSlot.length < Math.min(4, pool.length)) {
    const pick = nextCard(pool, cursor, inSlot);
    if (!pick) break;
    inSlot.push(pick.card);
    cursor = pick.index + 1;
  }
  const nodes = inSlot.map((card, index) => {
    const node = el('a', { className: `intel-card intel-card-${index + 1}` });
    fillCard(node, card);
    return node;
  });
  cardHost.replaceChildren(...nodes);

  if (compactHost) {
    const compact = el('a', { className: 'intel-card intel-card-compact' });
    fillCard(compact, inSlot[0]);
    compactHost.replaceChildren(compact);
    compactHost.hidden = false;
  }

  // One card changes every few seconds, using only the data already fetched.
  if (pool.length > nodes.length && !reduceMotion.matches) {
    let nextSlot = 0;
    rotationTimer = window.setInterval(() => {
      if (document.hidden || layer.matches(':hover, :focus-within')) return;
      const pick = nextCard(pool, cursor, inSlot);
      if (!pick) return;
      const slot = nextSlot;
      cursor = pick.index + 1;
      inSlot[slot] = pick.card;
      nodes[slot].classList.add('is-swapping');
      window.setTimeout(() => {
        fillCard(nodes[slot], pick.card);
        nodes[slot].classList.remove('is-swapping');
      }, SWAP_FADE_MS);
      nextSlot = (nextSlot + 1) % nodes.length;
    }, ROTATE_EVERY_MS);
  }
  return true;
}

reduceMotion.addEventListener?.('change', () => {
  if (reduceMotion.matches) window.clearInterval(rotationTimer);
});

// ---- Graph: cumulative approved insights ---------------------------------------

function svg(name, attributes = {}) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
}

// Plots the real series exactly: x is time, y is the cumulative count scaled
// between the smallest and largest value. It rises because the metric can
// only grow, not because anything was adjusted.
function renderGraph(points) {
  if (!graph || points.length < 2) return false;
  const width = 600;
  const height = 260;
  const pad = 18;
  const values = points.map((point) => point.cumulativeApprovedInsights);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = high - low || 1;
  const coords = values.map((value, index) => [
    pad + (index / (values.length - 1)) * (width - pad * 2),
    height - pad - ((value - low) / span) * (height - pad * 2)
  ]);
  const line = coords.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const area = `${line} L${coords.at(-1)[0].toFixed(1)} ${height} L${coords[0][0].toFixed(1)} ${height} Z`;

  const grid = svg('g', { class: 'hero-graph-grid' });
  for (const y of [0.25, 0.5, 0.75]) grid.append(svg('line', { x1: 0, x2: width, y1: height * y, y2: height * y }));
  const path = svg('path', { class: 'hero-graph-line', d: line });
  const dots = svg('g', { class: 'hero-graph-points' });
  coords.forEach(([x, y], index) => {
    if (index % 3 === 2 || index === coords.length - 1) {
      const dot = svg('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: index === coords.length - 1 ? 4 : 2.6 });
      dot.style.setProperty('--dot-delay', `${1.2 + index * 0.08}s`);
      dots.append(dot);
    }
  });
  graph.replaceChildren(grid, svg('path', { class: 'hero-graph-area', d: area }), path, dots);

  // Line-drawing: the dash length is the path's own length.
  const length = Math.ceil(path.getTotalLength?.() || 1200);
  path.style.setProperty('--line-length', String(length));
  graph.hidden = false;
  requestAnimationFrame(() => graph.classList.add('is-drawn'));
  return true;
}

// ---- Start -----------------------------------------------------------------------

async function start() {
  if (!layer) return;
  const [recommendations, activity] = await Promise.allSettled([
    apiRequest('/api/home/recommendations', { auth: 'optional' }),
    apiRequest('/api/stats/activity')
  ]);
  const hasCards = recommendations.status === 'fulfilled' && renderCards(buildCards(recommendations.value));
  const hasGraph = activity.status === 'fulfilled' && renderGraph(activity.value.points || []);
  if (!hasCards && !hasGraph) return;
  layer.hidden = false;
  document.querySelector('.home-hero')?.classList.add('has-intel');
  requestAnimationFrame(() => layer.classList.add('is-ready'));
}

start().catch(() => { /* The hero stays exactly as designed without this layer. */ });

export { buildCards, salaryRange, compactAmount };
