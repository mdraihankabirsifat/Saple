import { fetchApi } from './api.js';
import {
  el, renderSkeletons, animateCount, prefersReducedMotion,
  formatSalaryRange, humanizeEnum
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
// Featured companies and latest jobs
// ---------------------------------------------------------------------------

function companyCard(company) {
  return el('a', {
    className: 'featured-company',
    attrs: { href: `company-details.html?id=${encodeURIComponent(company.companyId)}` }
  }, [
    createCompanyLogo(company.companyName, null),
    el('span', { className: 'featured-company-body' }, [
      el('strong', { className: 'featured-company-name', text: company.companyName }),
      el('span', {
        className: 'featured-company-meta',
        text: `${company.industry} · ${company.headquartersCity}`
      })
    ])
  ]);
}

function jobCard(job) {
  return el('a', {
    className: 'featured-job',
    attrs: { href: `job-details.html?id=${encodeURIComponent(job.jobId)}` }
  }, [
    el('strong', { className: 'featured-job-title', text: job.title }),
    el('span', { className: 'featured-job-company', text: job.companyName }),
    el('span', {
      className: 'featured-job-meta',
      text: `${job.location} · ${humanizeEnum(job.workMode)}`
    }),
    el('span', { className: 'featured-job-salary', text: formatSalaryRange(job) })
  ]);
}

function emptyNote(container, message) {
  container.replaceChildren(el('p', { className: 'discover-empty', text: message }));
}

async function loadFeaturedCompanies() {
  const container = document.querySelector('#featured-companies');
  renderSkeletons(container, 3, 'row');

  try {
    const companies = await fetchApi('/api/companies');
    container.removeAttribute('aria-busy');
    const featured = Array.isArray(companies) ? companies.slice(0, 4) : [];

    if (!featured.length) {
      emptyNote(container, 'No companies have been added to this deployment yet.');
      return;
    }
    container.replaceChildren(...featured.map(companyCard));
  } catch (error) {
    emptyNote(container, 'The company directory could not be loaded right now.');
  }
}

async function loadLatestJobs() {
  const container = document.querySelector('#featured-jobs');
  renderSkeletons(container, 3, 'row');

  try {
    const data = await fetchApi('/api/jobs?pageSize=3');
    container.removeAttribute('aria-busy');

    if (!data.items.length) {
      emptyNote(container, 'No vacancies are open right now. Company representatives publish them here.');
      return;
    }
    container.replaceChildren(...data.items.map(jobCard));
  } catch (error) {
    emptyNote(container, 'Open jobs could not be loaded right now.');
  }
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
loadFeaturedCompanies();
loadLatestJobs();
loadPopularRoles();
