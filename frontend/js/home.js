import { fetchApi } from './api.js';
import {
  el, renderSkeletons, animateCount, prefersReducedMotion,
  formatSalaryRange, formatDate, humanizeEnum
} from './ui.js';
import { createCompanyLogo } from './company-logo.js';
import { mountHeroSearch } from './global-search.js';

// ---------------------------------------------------------------------------
// Live snapshot. Counters animate only after real numbers arrive; nothing is
// invented, and an unavailable endpoint leaves an honest fallback behind.
// ---------------------------------------------------------------------------

async function loadSnapshot() {
  const note = document.querySelector('#snapshot-note');
  const values = [...document.querySelectorAll('[data-count]')];

  try {
    const counts = await fetchApi('/api/stats/overview');
    for (const node of values) {
      animateCount(node, counts[node.dataset.count]);
    }
    note.textContent = 'Live counts from approved public records in this deployment.';
  } catch (error) {
    for (const node of values) node.textContent = '—';
    note.textContent = 'Live counts are unavailable right now. The rest of the site still works.';
  }
}

// ---------------------------------------------------------------------------
// Discovery rails. Every card is built from a public endpoint that already
// exists; an empty or failed endpoint leaves an honest message, never
// invented content.
// ---------------------------------------------------------------------------

const RAIL_LIMIT = 10;

function railCard({ href, kicker, title, meta, foot = [], extra = null, logo = null }) {
  const link = el('a', { className: 'rail-card-link', attrs: { href } }, [
    el('h4', { className: 'rail-card-title', text: title })
  ]);
  return el('article', { className: 'rail-card' }, [
    logo,
    kicker ? el('span', { className: 'rail-card-kicker', text: kicker }) : null,
    link,
    meta ? el('p', { className: 'rail-card-meta', text: meta }) : null,
    extra,
    foot.length ? el('div', { className: 'rail-card-foot' }, foot) : null
  ]);
}

function ratingMeter(rating) {
  const value = Math.max(0, Math.min(5, Number(rating) || 0));
  const fill = el('span', { className: 'rating-meter-fill' });
  // A custom property through the CSSOM, not an inline style attribute.
  fill.style.setProperty('--value', String(value));
  return el('span', {
    className: 'rating-meter',
    attrs: { 'aria-label': `Rated ${value.toFixed(1)} out of 5` }
  }, [
    el('span', { className: 'rating-meter-track', attrs: { 'aria-hidden': 'true' } }, [fill]),
    el('span', { text: value.toFixed(1), attrs: { 'aria-hidden': 'true' } })
  ]);
}

function railEmpty(container, message) {
  container.removeAttribute('aria-busy');
  container.replaceChildren(el('p', { className: 'discover-empty', text: message }));
}

async function loadFeaturedCompanies() {
  const container = document.querySelector('#featured-companies');
  renderSkeletons(container, 4, 'card');

  try {
    const companies = await fetchApi('/api/companies');
    container.removeAttribute('aria-busy');
    const featured = Array.isArray(companies) ? companies.slice(0, RAIL_LIMIT) : [];
    if (!featured.length) {
      railEmpty(container, 'No companies have been added to this deployment yet.');
      return;
    }

    container.replaceChildren(...featured.map((company) => {
      const reviews = Number(company.reviewCount) || 0;
      return railCard({
        href: `company-details.html?id=${encodeURIComponent(company.companyId)}`,
        logo: createCompanyLogo(company.companyName, null, document, company.logoUrl),
        kicker: company.industry,
        title: company.companyName,
        meta: [company.headquartersCity, company.country].filter(Boolean).join(', '),
        foot: reviews > 0 && company.averageRating !== null && company.averageRating !== undefined
          ? [ratingMeter(company.averageRating), el('span', { className: 'rail-card-meta', text: `${reviews} review${reviews === 1 ? '' : 's'}` })]
          : [el('span', { className: 'rail-card-meta', text: 'No approved reviews yet' })]
      });
    }));
    updateRailControls('featured-companies');
    mountRailAutoplay(container);
  } catch (error) {
    railEmpty(container, 'The company directory could not be loaded right now.');
  }
}

async function loadLatestJobs() {
  const container = document.querySelector('#featured-jobs');
  renderSkeletons(container, 4, 'card');

  try {
    const data = await fetchApi(`/api/jobs?pageSize=${RAIL_LIMIT}`);
    container.removeAttribute('aria-busy');
    if (!data.items.length) {
      railEmpty(container, 'No vacancies are open right now. Company representatives publish them here.');
      return;
    }

    container.replaceChildren(...data.items.map((job) => railCard({
      href: `job-details.html?id=${encodeURIComponent(job.jobId)}`,
      kicker: job.companyName,
      title: job.title,
      meta: `${job.location} · ${humanizeEnum(job.workMode)} · ${humanizeEnum(job.employmentType)}`,
      foot: [
        el('span', { className: 'insight-chip', text: formatSalaryRange(job) }),
        el('span', { className: 'rail-card-meta', text: `Apply by ${formatDate(job.applicationDeadline)}` })
      ]
    })));
    updateRailControls('featured-jobs');
    mountRailAutoplay(container);
  } catch (error) {
    railEmpty(container, 'Open jobs could not be loaded right now.');
  }
}

// Salary ranges are only comparable in the same currency and pay period, so
// the spotlight uses the most common combination and scales every bar to the
// widest range in that set.
async function loadSalarySpotlight() {
  const container = document.querySelector('#salary-spotlight');
  renderSkeletons(container, 4, 'card');

  try {
    const insights = await fetchApi('/api/salaries');
    container.removeAttribute('aria-busy');
    const usable = (Array.isArray(insights) ? insights : [])
      .filter((item) => Number(item.communityContributionCount) > 0
        && item.communityMinimumSalary !== null && item.communityMaximumSalary !== null);

    if (!usable.length) {
      railEmpty(container, 'Approved salary ranges appear here once contributions are moderated.');
      return;
    }

    const groups = new Map();
    for (const item of usable) {
      const key = `${item.currency}|${item.payPeriod}`;
      groups.set(key, [...(groups.get(key) || []), item]);
    }
    const [key, group] = [...groups.entries()].sort((a, b) => b[1].length - a[1].length)[0];
    const [currency, payPeriod] = key.split('|');
    const chosen = group
      .sort((a, b) => Number(b.communityContributionCount) - Number(a.communityContributionCount))
      .slice(0, RAIL_LIMIT);

    const floor = Math.min(...chosen.map((item) => Number(item.communityMinimumSalary)));
    const ceiling = Math.max(...chosen.map((item) => Number(item.communityMaximumSalary)));
    const span = Math.max(ceiling - floor, 1);
    const percent = (value) => `${(((Number(value) - floor) / span) * 100).toFixed(2)}%`;
    const money = (value) => Number(value).toLocaleString(undefined, { maximumFractionDigits: 0 });
    const period = String(payPeriod).toLowerCase();

    container.replaceChildren(...chosen.map((item) => {
      const bar = el('span', { className: 'salary-range-viz-bar' });
      bar.style.setProperty('--from', percent(item.communityMinimumSalary));
      bar.style.setProperty('--span', `${(((Number(item.communityMaximumSalary) - Number(item.communityMinimumSalary)) / span) * 100).toFixed(2)}%`);
      const mark = el('span', { className: 'salary-range-viz-mark' });
      mark.style.setProperty('--mark', percent(item.communityAverageSalary));

      const count = Number(item.communityContributionCount);
      return railCard({
        href: `company-details.html?id=${encodeURIComponent(item.companyId)}`,
        kicker: item.companyName,
        title: item.roleName,
        meta: `${currency} per ${period === 'monthly' ? 'month' : period === 'yearly' ? 'year' : period}`,
        extra: el('div', {
          attrs: {
            role: 'img',
            'aria-label': `Community range ${currency} ${money(item.communityMinimumSalary)} to ${money(item.communityMaximumSalary)}, average ${money(item.communityAverageSalary)}`
          }
        }, [
          el('div', { className: 'salary-range-viz' }, [bar, mark]),
          el('div', { className: 'salary-range-labels', attrs: { 'aria-hidden': 'true' } }, [
            el('span', { text: money(item.communityMinimumSalary) }),
            el('span', { text: `avg ${money(item.communityAverageSalary)}` }),
            el('span', { text: money(item.communityMaximumSalary) })
          ])
        ]),
        foot: [el('span', { className: 'rail-card-meta', text: `${count} approved contribution${count === 1 ? '' : 's'}` })]
      });
    }));
    updateRailControls('salary-spotlight');
    mountRailAutoplay(container);
  } catch (error) {
    railEmpty(container, 'Salary insights could not be loaded right now.');
  }
}

async function loadRecentReviews() {
  const container = document.querySelector('#recent-reviews');
  renderSkeletons(container, 4, 'card');

  try {
    // The endpoint already returns approved reviews only, newest approval first.
    const reviews = await fetchApi('/api/reviews');
    container.removeAttribute('aria-busy');
    const recent = (Array.isArray(reviews) ? reviews : []).slice(0, RAIL_LIMIT);
    if (!recent.length) {
      railEmpty(container, 'Approved reviews appear here after moderation.');
      return;
    }

    container.replaceChildren(...recent.map((review) => railCard({
      href: `company-details.html?id=${encodeURIComponent(review.companyId)}#reviews`,
      kicker: review.companyName,
      title: review.reviewTitle,
      meta: review.roleName || 'Role not specified',
      foot: [
        ratingMeter(review.overallRating),
        review.verificationStatus === 'VERIFIED'
          ? el('span', { className: 'insight-chip', text: 'Verified employee' })
          : el('span', { className: 'rail-card-meta', text: 'Community review' })
      ]
    })));
    updateRailControls('recent-reviews');
    mountRailAutoplay(container);
  } catch (error) {
    railEmpty(container, 'Reviews could not be loaded right now.');
  }
}

const railLoopStates = new WeakMap();

function prepareRailLoop(rail) {
  if (!rail || prefersReducedMotion() || rail.dataset.autoLoopReady === 'true') return;
  const cards = [...rail.children].filter((child) => !child.hidden && child.classList.contains('rail-card'));
  if (cards.length < 2 || rail.scrollWidth <= rail.clientWidth + 2) return;

  const fragment = document.createDocumentFragment();
  for (const card of cards) {
    const clone = card.cloneNode(true);
    clone.dataset.railClone = 'true';
    clone.setAttribute('aria-hidden', 'true');
    clone.removeAttribute('id');
    clone.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'));
    clone.querySelectorAll('a, button, input, select, textarea, summary, [tabindex]').forEach((node) => {
      node.setAttribute('tabindex', '-1');
    });
    fragment.append(clone);
  }
  rail.append(fragment);
  rail.dataset.autoLoopReady = 'true';
  rail.dataset.autoLoop = 'true';

  const state = railLoopStates.get(rail);
  if (state) state.loopWidth = rail.querySelector('[data-rail-clone]').offsetLeft - cards[0].offsetLeft;
}

function mountRailAutoplay(rail) {
  if (!rail || prefersReducedMotion()) return;
  let state = railLoopStates.get(rail);
  if (!state) {
    state = {
      rail,
      loopWidth: 0,
      hovered: false,
      focused: false,
      pointerActive: false,
      pauseUntil: 0,
      running: false,
      lastTime: performance.now()
    };
    railLoopStates.set(rail, state);

    const section = rail.closest('.rail-section');
    section.addEventListener('mouseenter', () => { state.hovered = true; });
    section.addEventListener('mouseleave', () => { state.hovered = false; });
    section.addEventListener('focusin', () => { state.focused = true; });
    section.addEventListener('focusout', (event) => {
      if (!section.contains(event.relatedTarget)) state.focused = false;
    });
    section.addEventListener('pointerdown', () => { state.pointerActive = true; }, { passive: true });
    window.addEventListener('pointerup', () => { if (state.pointerActive) { state.pointerActive = false; state.pauseUntil = performance.now() + 1800; } }, { passive: true });
    window.addEventListener('pointercancel', () => { state.pointerActive = false; state.pauseUntil = performance.now() + 1800; }, { passive: true });
    rail.addEventListener('wheel', () => { state.pauseUntil = performance.now() + 1800; }, { passive: true });
    rail.addEventListener('keydown', () => { state.pauseUntil = performance.now() + 1800; });
  }

  prepareRailLoop(rail);
  if (state.running) return;
  state.running = true;
  const tick = (now) => {
    const elapsed = Math.min(now - state.lastTime, 100);
    state.lastTime = now;
    if (!prefersReducedMotion() && !document.hidden && !state.hovered && !state.focused && !state.pointerActive
      && now >= state.pauseUntil && state.loopWidth > 0) {
      // Increasing scrollLeft moves the cards from right to left. The cloned
      // group begins at exactly loopWidth, so the wrap has no visible jump.
      rail.scrollLeft += Math.max(20, state.loopWidth / 35) * (elapsed / 1000);
      if (rail.scrollLeft >= state.loopWidth) rail.scrollLeft -= state.loopWidth;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// Previous/next buttons scroll one viewport of cards; they remain available
// while autoplay pauses for hover, focus and direct touch or wheel input.
function updateRailControls(railId) {
  const rail = document.getElementById(railId);
  if (!rail) return;
  const atStart = rail.scrollLeft <= 4;
  const atEnd = rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 4;
  rail.classList.toggle('is-at-end', atEnd);
  const previous = document.querySelector(`[data-rail-prev="${railId}"]`);
  const next = document.querySelector(`[data-rail-next="${railId}"]`);
  if (previous) previous.disabled = atStart;
  if (next) next.disabled = atEnd;
}

function refreshRailLoop(rail) {
  const clone = rail.querySelector('[data-rail-clone]');
  if (!clone) {
    if (!prefersReducedMotion()) mountRailAutoplay(rail);
    return;
  }

  const firstCard = rail.querySelector('.rail-card');
  const loopWidth = clone.offsetLeft - firstCard.offsetLeft;
  const state = railLoopStates.get(rail);
  if (prefersReducedMotion() || loopWidth <= rail.clientWidth + 2) {
    rail.querySelectorAll('[data-rail-clone]').forEach((card) => card.remove());
    delete rail.dataset.autoLoopReady;
    delete rail.dataset.autoLoop;
    if (state) state.loopWidth = 0;
    rail.scrollLeft = 0;
  } else if (state) {
    state.loopWidth = loopWidth;
  }
}

function mountRails() {
  for (const rail of document.querySelectorAll('.rail[id]')) {
    rail.addEventListener('scroll', () => updateRailControls(rail.id), { passive: true });
    updateRailControls(rail.id);
    mountRailAutoplay(rail);
  }

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-rail-prev], [data-rail-next]');
    if (!button) return;
    const railId = button.dataset.railPrev || button.dataset.railNext;
    const rail = document.getElementById(railId);
    if (!rail) return;
    const direction = button.dataset.railPrev ? -1 : 1;
    rail.scrollBy({
      left: direction * rail.clientWidth * 0.9,
      behavior: prefersReducedMotion() ? 'auto' : 'smooth'
    });
  });

  window.addEventListener('resize', () => {
    for (const rail of document.querySelectorAll('.rail[id]')) {
      refreshRailLoop(rail);
      updateRailControls(rail.id);
    }
  });

  window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener?.('change', () => {
    for (const rail of document.querySelectorAll('.rail[id]')) refreshRailLoop(rail);
  });
}

// The invitation's button opens the real guide, and only appears once the
// guide has actually mounted: if its status endpoint is unavailable there is
// no launcher, and the button stays hidden rather than doing nothing.
function mountGuideInvite() {
  const button = document.querySelector('[data-open-guide]');
  if (!button) return;

  const reveal = () => {
    const launcher = document.querySelector('.guide-launcher');
    if (!launcher) return false;
    button.hidden = false;
    button.addEventListener('click', () => launcher.click());
    return true;
  };

  if (reveal()) return;
  const observer = new MutationObserver(() => {
    if (reveal()) observer.disconnect();
  });
  observer.observe(document.body, { childList: true });
  window.setTimeout(() => observer.disconnect(), 15000);
}

async function loadPopularRoles() {
  const container = document.querySelector('#popular-roles');

  try {
    const options = await fetchApi('/api/jobs/filter-options');
    const roles = (options.roles || []).slice(0, 8);

    if (!roles.length) {
      container.replaceChildren(el('li', {
        className: 'discover-empty',
        text: 'Role categories appear here once vacancies are published.'
      }));
      return;
    }

    container.replaceChildren(...roles.map((role) => el('li', {}, [
      el('a', {
        className: 'role-chip',
        text: role.roleName,
        attrs: { href: `jobs.html?roleId=${encodeURIComponent(role.roleId)}` }
      })
    ])));
  } catch (error) {
    container.replaceChildren(el('li', {
      className: 'discover-empty',
      text: 'Role categories are unavailable right now.'
    }));
  }
}

// Sections reveal on scroll through the shared js/reveal.js, loaded by nav.js.
mountHeroSearch(document.querySelector('.hero-search'));
loadSnapshot();
mountRails();
loadFeaturedCompanies();
loadLatestJobs();
loadSalarySpotlight();
loadRecentReviews();
loadPopularRoles();
mountGuideInvite();
