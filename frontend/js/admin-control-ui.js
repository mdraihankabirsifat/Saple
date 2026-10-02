export function node(tag, text = '', className = '') {
  const element = document.createElement(tag);
  if (text !== null && text !== undefined) element.textContent = String(text);
  if (className) element.className = className;
  return element;
}
export function date(value) { return value ? new Date(value).toLocaleDateString() : '—'; }
export function badge(value) { return node('span', value || '—', `admin-status-badge admin-status-${String(value || '').toLowerCase().replace(/[^a-z]/g, '')}`); }
export function facts(entries) {
  const list = node('dl', '', 'admin-detail-grid');
  for (const [name, value] of entries) {
    const pair = node('div'); pair.append(node('dt', name), node('dd', value ?? '—')); list.append(pair);
  }
  return list;
}
export function action(label, callback, kind = 'secondary') {
  const button = node('button', label, `button button-${kind} button-small`);
  button.type = 'button'; button.addEventListener('click', callback); return button;
}
export function table(host, columns, items, onView) {
  host.replaceChildren();
  if (!items.length) { host.append(node('p', 'No matching records.', 'empty-state')); return; }
  const wrap = node('div', '', 'admin-table-wrap');
  const element = node('table', '', 'admin-table');
  const head = node('thead'); const header = node('tr');
  for (const [label] of columns) header.append(node('th', label));
  header.append(node('th', 'Action')); head.append(header); element.append(head);
  const body = node('tbody');
  for (const item of items) {
    const row = node('tr');
    for (const [, value] of columns) {
      const cell = node('td'); const content = value(item);
      cell.append(content instanceof Node ? content : document.createTextNode(String(content ?? '—'))); row.append(cell);
    }
    const cell = node('td'); cell.append(action('View', () => onView(item))); row.append(cell);
    body.append(row);
  }
  element.append(body); wrap.append(element); host.append(wrap);
}
export function pagination(host, page, pageSize, total, load) {
  host.replaceChildren();
  const max = Math.max(1, Math.ceil(total / pageSize));
  const previous = action('Previous', () => load(page - 1)); previous.disabled = page <= 1;
  const next = action('Next', () => load(page + 1)); next.disabled = page >= max;
  host.append(previous, node('span', `Page ${page} of ${max} · ${total} records`), next);
}
export function dialog(title, content, invoking = document.activeElement) {
  const modal = node('dialog', '', 'admin-detail-dialog');
  const heading = node('h2', title); heading.id = 'admin-dialog-title'; modal.setAttribute('aria-labelledby', heading.id);
  const close = action('Close', () => modal.close()); close.classList.add('admin-dialog-close');
  modal.append(heading, close, content);
  document.body.append(modal);
  modal.addEventListener('close', () => { modal.remove(); invoking?.focus?.(); }, { once: true });
  modal.showModal(); close.focus(); return modal;
}
export function confirmAction({ title, message, confirmLabel, onConfirm, invoking, danger = true, confirmText = null }) {
  const content = node('div'); content.append(node('p', message));
  const label = node('label', 'Reason (required)'); const input = node('textarea'); input.maxLength = 1000; input.required = true;
  label.append(input); content.append(label);
  let confirmation;
  if (confirmText) {
    const typed = node('label', `Type ${confirmText} to confirm`);
    confirmation = node('input'); confirmation.type = 'text'; confirmation.autocomplete = 'off';
    typed.append(confirmation); content.append(typed);
  }
  const feedback = node('p', '', 'state-message'); feedback.setAttribute('role', 'status'); content.append(feedback);
  const controls = node('div', '', 'dialog-actions');
  const modal = dialog(title, content, invoking);
  const cancel = action('Cancel', () => modal.close());
  const confirm = action(confirmLabel, async () => {
    if (!input.value.trim()) { input.setCustomValidity('A reason is required.'); input.reportValidity(); return; }
    if (confirmation && confirmation.value.trim() !== confirmText) {
      confirmation.setCustomValidity('Type the exact account email to continue.'); confirmation.reportValidity(); return;
    }
    confirmation?.setCustomValidity('');
    input.setCustomValidity(''); confirm.disabled = true;
    try { await onConfirm(input.value.trim()); modal.close(); }
    catch (error) { feedback.textContent = error.message; feedback.classList.add('error'); confirm.disabled = false; }
  }, danger ? 'danger' : 'primary');
  controls.append(cancel, confirm); content.append(controls); input.focus();
}
export function toolbar(panel, fields, load) {
  const bar = node('form', '', 'admin-section-toolbar');
  for (const field of fields) {
    const label = node('label', field.label); const input = field.options ? node('select') : node('input');
    input.name = field.name; input.setAttribute('aria-label', field.label);
    if (!field.options) { input.type = 'search'; input.maxLength = 100; input.placeholder = field.placeholder || field.label; }
    else for (const [value, name] of field.options) { const option = node('option', name); option.value = value; input.append(option); }
    label.append(input); bar.append(label);
  }
  bar.append(action('Refresh', () => load(1)));
  bar.addEventListener('submit', (event) => { event.preventDefault(); load(1); });
  bar.addEventListener('change', () => load(1));
  panel.append(bar); return () => Object.fromEntries(new FormData(bar).entries());
}
export function section(host, heading, description, fields, load) {
  const panel = node('section', '', 'admin-section');
  panel.append(node('h2', heading), node('p', description));
  const read = toolbar(panel, fields, load);
  const status = node('p', '', 'state-message'); status.setAttribute('role', 'status');
  const list = node('div'); const pager = node('div', '', 'admin-pagination');
  panel.append(status, list, pager); host.append(panel);
  return { panel, read, status, list, pager };
}
