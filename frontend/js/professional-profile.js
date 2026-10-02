import { apiRequest } from './api.js';
import { el } from './ui.js';

let mounted = false;

function byId(id) { return document.getElementById(id); }
function notice(id, message, error = false) {
  const node = byId(id);
  node.textContent = message;
  node.className = `state-message form-status${error ? ' error' : ' success'}`;
  node.hidden = false;
}
function dateRange(item, currentField) {
  return `${item.startDate || 'Unknown'} – ${item[currentField] ? 'Present' : item.endDate || 'Unknown'}`;
}

const sections = {
  experience: {
    idField: 'experienceId', currentField: 'currentlyWorking', endpoint: '/api/me/experience',
    fields: { organization: 'experience-organization', jobTitle: 'experience-title',
      employmentType: 'experience-type', location: 'experience-location', startDate: 'experience-start',
      endDate: 'experience-end', description: 'experience-description' },
    heading: (item) => `${item.jobTitle} · ${item.organization}`,
    detail: (item) => [item.employmentType, item.location, dateRange(item, 'currentlyWorking')].filter(Boolean).join(' · ')
  },
  education: {
    idField: 'educationId', currentField: 'currentlyStudying', endpoint: '/api/me/education',
    fields: { institution: 'education-institution', degree: 'education-degree',
      fieldOfStudy: 'education-field', startDate: 'education-start', endDate: 'education-end',
      description: 'education-description' },
    heading: (item) => `${item.degree} · ${item.institution}`,
    detail: (item) => `${item.fieldOfStudy} · ${dateRange(item, 'currentlyStudying')}`
  }
};

let current = { education: [], experience: [], skills: [] };

function resetForm(kind) {
  const form = byId(`profile-${kind}-form`);
  form.reset();
  delete form.dataset.recordId;
  byId(`profile-${kind}-form-title`).textContent = `Add ${kind}`;
  byId(`${kind}-cancel`).hidden = true;
  toggleEnd(kind);
  form.hidden = true;
}
function toggleEnd(kind) {
  const checked = byId(`${kind}-current`).checked;
  const end = byId(`${kind}-end`);
  end.disabled = checked;
  end.required = !checked;
  if (checked) end.value = '';
}
function editItem(kind, item) {
  const config = sections[kind];
  const form = byId(`profile-${kind}-form`);
  form.hidden = false;
  form.dataset.recordId = item[config.idField];
  for (const [key, inputId] of Object.entries(config.fields)) byId(inputId).value = item[key] || '';
  byId(`${kind}-current`).checked = item[config.currentField];
  toggleEnd(kind);
  byId(`profile-${kind}-form-title`).textContent = `Edit ${kind}`;
  byId(`${kind}-cancel`).hidden = false;
  form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  byId(Object.values(config.fields)[0]).focus();
}

function renderSection(kind) {
  const config = sections[kind];
  const list = byId(`profile-${kind}-list`);
  list.replaceChildren();
  if (!current[kind].length) {
    list.append(el('li', { className: 'professional-empty', text: `No ${kind} added yet.` }));
    return;
  }
  for (const item of current[kind]) {
    const edit = el('button', { className: 'button button-secondary button-small', text: 'Edit', attrs: { type: 'button' } });
    edit.addEventListener('click', () => editItem(kind, item));
    const remove = el('button', { className: 'button button-secondary button-small', text: 'Delete', attrs: { type: 'button' } });
    remove.addEventListener('click', async () => {
      if (!window.confirm(`Delete this ${kind} record?`)) return;
      remove.disabled = true;
      try {
        const result = await apiRequest(`${config.endpoint}/${item[config.idField]}`, { method: 'DELETE', auth: true });
        if (byId(`profile-${kind}-form`).dataset.recordId === String(item[config.idField])) resetForm(kind);
        await reload();
        notice(`${kind}-status`, result?.result?.pendingReview ? 'Delete request is waiting for moderator review.' : `${kind[0].toUpperCase()}${kind.slice(1)} removed.`);
      } catch (error) { notice(`${kind}-status`, error.message, true); }
      finally { remove.disabled = false; }
    });
    list.append(el('li', { className: 'professional-item' }, [
      el('div', {}, [el('h3', { text: config.heading(item) }),
        el('p', { className: 'professional-meta', text: config.detail(item) }),
        item.description ? el('p', { text: item.description }) : null]),
      el('div', { className: 'professional-actions' }, [edit, remove])
    ]));
  }
}

function renderSkills() {
  const list = byId('profile-skills-list');
  list.replaceChildren();
  if (!current.skills.length) {
    list.append(el('li', { className: 'professional-empty', text: 'No skills added yet.' }));
    return;
  }
  for (const skill of current.skills) {
    const remove = el('button', { text: '×', attrs: { type: 'button', 'aria-label': `Remove ${skill.name}` } });
    remove.addEventListener('click', async () => {
      remove.disabled = true;
      try {
        await apiRequest(`/api/me/skills/${skill.skillId}`, { method: 'DELETE', auth: true });
        await reload();
        notice('profile-skills-status', 'Skill removed.');
      } catch (error) { notice('profile-skills-status', error.message, true); }
      finally { remove.disabled = false; }
    });
    list.append(el('li', { className: 'professional-skill' }, [el('span', { text: skill.name }), remove]));
  }
}

async function reload() {
  current = await apiRequest('/api/me/professional-profile', { auth: true });
  renderSection('experience');
  renderSection('education');
  renderSkills();
}

function mountSection(kind) {
  const config = sections[kind];
  const form = byId(`profile-${kind}-form`);
  byId(`${kind}-current`).addEventListener('change', () => toggleEnd(kind));
  byId(`${kind}-cancel`).addEventListener('click', () => resetForm(kind));
  document.querySelector(`[data-professional-add="${kind}"]`)?.addEventListener('click', () => {
    resetForm(kind); form.hidden = false; byId(Object.values(config.fields)[0]).focus();
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.checkValidity()) { form.reportValidity(); return; }
    const value = Object.fromEntries(Object.entries(config.fields).map(([key, id]) => [key, byId(id).value]));
    value[config.currentField] = byId(`${kind}-current`).checked;
    if (value[config.currentField]) value.endDate = null;
    const id = form.dataset.recordId;
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      const result = await apiRequest(id ? `${config.endpoint}/${id}` : config.endpoint,
        { method: id ? 'PATCH' : 'POST', auth: true, body: value });
      resetForm(kind);
      await reload();
      notice(`${kind}-status`, result?.education?.pendingReview || result?.experience?.pendingReview
        ? 'Profile change is waiting for moderator review.' : `${kind[0].toUpperCase()}${kind.slice(1)} saved.`);
    } catch (error) { notice(`${kind}-status`, error.message, true); }
    finally { button.disabled = false; }
  });
}

export async function mountProfessionalProfile() {
  if (mounted) return;
  mounted = true;
  mountSection('education');
  mountSection('experience');
  const form = byId('profile-skills-form');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.checkValidity()) { form.reportValidity(); return; }
    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    try {
      const result = await apiRequest('/api/me/skills', { method: 'POST', auth: true,
        body: { name: byId('profile-skill-name').value } });
      form.reset();
      await reload();
      notice('profile-skills-status', result?.skill?.pendingReview ? 'Skill change is waiting for moderator review.' : 'Skill added.');
    } catch (error) { notice('profile-skills-status', error.message, true); }
    finally { button.disabled = false; }
  });
  try { await reload(); }
  catch (error) {
    for (const kind of ['education', 'experience']) notice(`${kind}-status`, error.message, true);
    notice('profile-skills-status', error.message, true);
  }
}
