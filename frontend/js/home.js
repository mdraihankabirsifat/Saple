import { fetchApi } from './api.js';
import {
  el, renderSkeletons, animateCount, prefersReducedMotion,
  formatSalaryRange, formatDate, humanizeEnum
} from './ui.js';
import { createCompanyLogo } from './company-logo.js';

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
        logo: createCompanyLogo(company.companyName, null),
        kicker: company.industry,
        title: company.companyName,
        meta: [company.headquartersCity, company.country].filter(Boolean).join(', '),
        foot: reviews > 0 && company.averageRating !== null && company.averageRating !== undefined
          ? [ratingMeter(company.averageRating), el('span', { className: 'rail-card-meta', text: `${reviews} review${reviews === 1 ? '' : 's'}` })]
          : [el('span', { className: 'rail-card-meta', text: 'No approved reviews yet' })]
      });
    }));
    updateRailControls('featured-companies');
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
  } catch (error) {
    railEmpty(container, 'Reviews could not be loaded right now.');
  }
}

// Previous/next buttons scroll one viewport of cards; they disable at either
// end, and the right-edge fade disappears once the last card is in view.
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

function mountRails() {
  for (const rail of document.querySelectorAll('.rail[id]')) {
    rail.addEventListener('scroll', () => updateRailControls(rail.id), { passive: true });
    updateRailControls(rail.id);
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
    for (const rail of document.querySelectorAll('.rail[id]')) updateRailControls(rail.id);
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

// ---------------------------------------------------------------------------
// Hero visual
//
// A local SVG of a growing sapling in two depth layers. The parallax is a small translation
// driven by pointer position and written as a CSS custom property, so no
// inline style attribute is needed and the strict CSP is satisfied. It runs
// only when the figure is on screen, the tab is visible, and the visitor has
// not asked for reduced motion.
// ---------------------------------------------------------------------------

function mountHeroVisual() {
  const figure = document.querySelector('[data-hero-visual]');
  if (!figure) return;

  // The static first frame is the SVG itself; animation is purely additive.
  if (prefersReducedMotion()) {
    figure.dataset.motion = 'static';
    return;
  }

  figure.dataset.motion = 'ready';

  const layers = [...figure.querySelectorAll('.scene-layer')];
  let visible = true;
  let frame = null;
  let targetX = 0;
  let targetY = 0;
  let currentX = 0;
  let currentY = 0;

  function apply() {
    frame = null;
    currentX += (targetX - currentX) * 0.12;
    currentY += (targetY - currentY) * 0.12;

    for (const layer of layers) {
      const depth = Number(layer.dataset.depth) || 0;
      layer.style.setProperty('--shift-x', `${(currentX * depth * 14).toFixed(2)}px`);
      layer.style.setProperty('--shift-y', `${(currentY * depth * 10).toFixed(2)}px`);
    }

    if (visible && (Math.abs(targetX - currentX) > 0.001 || Math.abs(targetY - currentY) > 0.001)) {
      frame = requestAnimationFrame(apply);
    }
  }

  function schedule() {
    if (!visible || frame !== null) return;
    frame = requestAnimationFrame(apply);
  }

  function stop() {
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
  }

  figure.addEventListener('pointermove', (event) => {
    // Coarse pointers are touch: dragging a finger across a decoration is not
    // something to chase, and it would fight with scrolling.
    if (event.pointerType !== 'mouse') return;
    const bounds = figure.getBoundingClientRect();
    targetX = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    targetY = ((event.clientY - bounds.top) / bounds.height) * 2 - 1;
    schedule();
  });

  figure.addEventListener('pointerleave', () => {
    targetX = 0;
    targetY = 0;
    schedule();
  });

  document.addEventListener('visibilitychange', () => {
    visible = document.visibilityState === 'visible';
    if (visible) schedule();
    else stop();
  });

  if (typeof IntersectionObserver !== 'undefined') {
    new IntersectionObserver((entries) => {
      visible = entries.some((entry) => entry.isIntersecting)
        && document.visibilityState === 'visible';
      if (visible) schedule();
      else stop();
    }, { threshold: 0.05 }).observe(figure);
  }
}

// Sections fade in once, and only when motion is welcome.
function mountSectionReveal() {
  if (prefersReducedMotion() || typeof IntersectionObserver === 'undefined') return;

  const sections = document.querySelectorAll('main .section');
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.dataset.revealed = 'true';
      observer.unobserve(entry.target);
    }
  }, { rootMargin: '0px 0px -10% 0px' });

  for (const section of sections) {
    section.dataset.reveal = 'pending';
    observer.observe(section);
  }
}

mountHeroVisual();
mountSectionReveal();
loadSnapshot();
mountRails();
loadFeaturedCompanies();
loadLatestJobs();
loadSalarySpotlight();
loadRecentReviews();
loadPopularRoles();
mountGuideInvite();
