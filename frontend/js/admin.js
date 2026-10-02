import { apiRequest } from './api.js';
import { getCurrentUser, isAuthenticated } from './auth.js';
import { mountUsers } from './admin-users.js';
import { mountSubscriptions } from './admin-subscriptions.js';
import { mountSubmissions, mountVerifications, mountReports } from './admin-queues.js';
import { loadPremiumAdmin } from './admin-premium.js';

const dashboard = document.querySelector('#admin-dashboard');
const tabs = document.querySelector('#admin-primary-tabs');
const summary = document.querySelector('#admin-summary-strip');
const validSections = ['users', 'submissions', 'verification', 'reports', 'subscriptions'];
let activeSection = null;
const loaded = new Set();
const modules = {};

async function loadSummary() {
  try {
    const counts = await apiRequest('/api/admin/summary', { auth: true });
    summary.textContent = `Users ${counts.users} | Pending ${counts.submissions} | Verifications ${counts.verifications} | Reports ${counts.reports} | Premium ${counts.premium}`;
  } catch (error) { summary.textContent = 'Platform counts are temporarily unavailable.'; }
}

async function loadMlHealth() {
  const status = document.querySelector('#ml-health-status');
  const values = document.querySelector('#ml-health-values');
  try {
    const health = await apiRequest('/api/admin/ml/health', { auth: true });
    if (health.available === false) { status.textContent = 'ML migration is unavailable; manual moderation remains active.'; return; }
    status.textContent = health.shadowMode ? 'Shadow mode: human review controls publication.' : 'Model output is subject to human review.';
    values.hidden = false; values.replaceChildren();
    for (const [label, value] of [['Active models', health.activeModels], ['Provisional live', health.provisionalItems],
      ['Held', health.heldItems], ['Unavailable', health.unavailableCount],
      ['Overturn rate', health.manualOverturnRate === null ? 'Insufficient data' : `${(health.manualOverturnRate * 100).toFixed(1)}%`]]) {
      const key = document.createElement('dt'); key.textContent = label;
      const data = document.createElement('dd'); data.textContent = String(value);
      values.append(key, data);
    }
  } catch (error) { status.textContent = 'Moderation health is temporarily unavailable.'; }
}

document.querySelector('#refresh-ml-health')?.addEventListener('click', loadMlHealth);

function selectSection(name, { updateUrl = true, focus = false } = {}) {
  const chosen = validSections.includes(name) ? name : 'users';
  for (const section of validSections) {
    const tab = tabs.querySelector(`[data-section="${section}"]`);
    const panel = document.querySelector(`#admin-panel-${section}`);
    const selected = section === chosen;
    tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1;
    panel.hidden = !selected;
    if (selected && focus) tab.focus();
  }
  activeSection = chosen;
  if (!loaded.has(chosen)) {
    loaded.add(chosen); modules[chosen]?.load();
    if (chosen === 'submissions') loadMlHealth();
  }
  if (updateUrl) {
    const url = new URL(window.location.href); url.searchParams.set('section', chosen);
    history.pushState({ section: chosen }, '', url);
  }
}

function bindTabs() {
  tabs.addEventListener('click', (event) => {
    const tab = event.target.closest('[data-section]');
    if (tab && tab.dataset.section !== activeSection) selectSection(tab.dataset.section);
  });
  tabs.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); const index = validSections.indexOf(activeSection);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? validSections.length - 1
      : (index + (event.key === 'ArrowRight' ? 1 : -1) + validSections.length) % validSections.length;
    selectSection(validSections[next], { focus: true });
  });
  window.addEventListener('popstate', () => selectSection(new URL(window.location.href).searchParams.get('section'), { updateUrl: false }));
}

async function start() {
  if (!isAuthenticated()) { window.location.replace('login.html?returnTo=admin.html'); return; }
  try {
    const user = await getCurrentUser();
    document.querySelector('#admin-loading').hidden = true;
    if (user?.accountRole !== 'ADMIN') { document.querySelector('#admin-access-denied').hidden = false; return; }
    dashboard.hidden = false;
    const refresh = () => loadSummary();
    const usersHost = document.querySelector('#admin-panel-users');
    modules.subscriptions = mountSubscriptions(document.querySelector('#admin-panel-subscriptions'), refresh);
    modules.users = mountUsers(usersHost, refresh, async (userId) => {
      selectSection('subscriptions'); await modules.subscriptions.view(userId);
    });
    modules.submissions = mountSubmissions(document.querySelector('#admin-panel-submissions'), refresh);
    modules.verification = mountVerifications(document.querySelector('#admin-panel-verification'), refresh);
    modules.reports = mountReports(document.querySelector('#admin-panel-reports'), refresh, async (submissionId) => {
      selectSection('submissions'); await modules.submissions.view({ submissionId });
    });
    document.querySelector('#admin-promo-tools').addEventListener('toggle', (event) => {
      if (event.currentTarget.open) loadPremiumAdmin(document.querySelector('#panel-premium'));
    });
    const secondary = dashboard.querySelector('details.admin-secondary:last-child');
    usersHost.append(secondary);
    bindTabs();
    selectSection(new URL(window.location.href).searchParams.get('section'), { updateUrl: false });
    await loadSummary();
  } catch (error) {
    if (error.status === 401) { window.location.replace('login.html?returnTo=admin.html'); return; }
    const loading = document.querySelector('#admin-loading'); loading.textContent = error.message; loading.classList.add('error');
  }
}
start();
