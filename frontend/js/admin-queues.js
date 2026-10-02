import { apiRequest } from './api.js';
import { action, badge, confirmAction, date, dialog, facts, node, pagination, section, table } from './admin-control-ui.js';

function detailsOf(item, excluded = []) {
  return facts(Object.entries(item || {}).filter(([key, value]) => !excluded.includes(key) && value !== null && typeof value !== 'object')
    .map(([key, value]) => [key.replace(/([A-Z])/g, ' $1'), value]));
}

export function mountSubmissions(host, onChange) {
  let page = 1;
  const ui = section(host, 'Submissions', 'Review salary, workplace review and interview contributions.', [
    { name: 'search', label: 'Search', placeholder: 'ID, company or role' },
    { name: 'type', label: 'Type', options: [['','All types'],['SALARY','Salary'],['REVIEW','Review'],['INTERVIEW','Interview']] },
    { name: 'status', label: 'Status', options: [['PENDING','Pending'],['ALL','All'],['APPROVED','Approved'],['FLAGGED','Flagged'],['REJECTED','Rejected']] },
    { name: 'sort', label: 'Sort', options: [['oldest','Oldest'],['newest','Newest'],['company','Company'],['type','Type']] }
  ], load);
  async function view(item, invoking = document.activeElement) {
    try {
      const [detail, history, screening] = await Promise.all([
        apiRequest(`/api/admin/submissions/${item.submissionId}`, { auth: true }),
        apiRequest(`/api/admin/submissions/${item.submissionId}/moderation-history`, { auth: true }),
        apiRequest(`/api/admin/submissions/${item.submissionId}/screening`, { auth: true })
      ]);
      const body = node('div');
      body.append(facts([['Company', detail.companyName], ['Type', detail.submissionType],
        ['Status', detail.submissionStatus], ['Verification', detail.verificationStatus],
        ['Submitter', `${detail.submitter?.fullName || 'Unknown'} · ${detail.submitter?.email || ''}`],
        ['Submitted', date(detail.submittedAt)], ['Reports', item.reportCount]]));
      for (const kind of ['salary','review','interview']) if (detail[kind]) {
        body.append(node('h3', `${kind[0].toUpperCase()}${kind.slice(1)} details`), detailsOf(detail[kind]));
      }
      if (screening) body.append(node('h3', 'ML screening'), detailsOf(screening));
      body.append(node('h3', 'Moderation history'));
      for (const event of history) body.append(node('p', `${date(event.actionAt)} · ${event.actionType} · ${event.moderatorName}${event.actionNote ? ` · ${event.actionNote}` : ''}`));
      if (!history.length) body.append(node('p', 'No prior decisions.'));
      const choices = { PENDING: ['APPROVED','REJECTED','FLAGGED'], APPROVED: ['REJECTED','FLAGGED'], FLAGGED: ['REJECTED'] }[detail.submissionStatus] || [];
      const actions = node('div', '', 'admin-detail-actions');
      for (const status of choices) actions.append(action(status === 'APPROVED' ? 'Approve' : status === 'REJECTED' ? 'Reject' : 'Flag', () => {
        modal.close();
        confirmAction({ title: `${status} submission #${item.submissionId}?`, message: 'This records a final moderation action.',
          confirmLabel: status, invoking, danger: status !== 'APPROVED', onConfirm: async (reason) => {
            await apiRequest(`/api/admin/submissions/${item.submissionId}/status`, { method: 'PATCH', auth: true,
              body: { status, note: reason } }); await load(page); await onChange();
          } });
      }, status === 'APPROVED' ? 'primary' : 'danger'));
      body.append(actions);
      const modal = dialog(`Submission #${item.submissionId}`, body, invoking);
    } catch (error) { ui.status.textContent = error.message; ui.status.classList.add('error'); }
  }
  async function load(nextPage = 1) {
    page = nextPage; ui.status.textContent = 'Loading submissions…';
    try {
      const params = new URLSearchParams({ ...ui.read(), page: String(page), pageSize: '20' });
      const result = await apiRequest(`/api/admin/submissions?${params}`, { auth: true });
      ui.status.textContent = `${result.total} matching submissions`;
      table(ui.list, [['ID', (item) => item.submissionId], ['Company', (item) => item.companyName],
        ['Type', (item) => item.submissionType], ['Role', (item) => item.roleName],
        ['Verification', (item) => badge(item.verificationStatus)], ['Status', (item) => badge(item.submissionStatus)],
        ['Submitter', (item) => item.submitterName], ['Submitted', (item) => date(item.submittedAt)],
        ['Reports', (item) => item.reportCount]], result.items, (item) => view(item));
      pagination(ui.pager, page, 20, result.total, load);
    } catch (error) { ui.status.textContent = error.message; ui.status.classList.add('error'); }
  }
  return { load, view };
}

export function mountVerifications(host, onChange) {
  let page = 1;
  const ui = section(host, 'Verification', 'Review employee evidence in the administrator workspace.', [
    { name: 'search', label: 'Search', placeholder: 'ID, user or company' },
    { name: 'status', label: 'Status', options: [['PENDING','Pending'],['ALL','All'],['VERIFIED','Verified'],['REJECTED','Rejected'],['EXPIRED','Expired']] }
  ], load);
  async function view(item, invoking = document.activeElement) {
    try {
      const detail = await apiRequest(`/api/admin/verifications/${item.verificationId}`, { auth: true });
      const body = node('div'); body.append(detailsOf(detail));
      if (detail.verificationStatus === 'PENDING') {
        const actions = node('div', '', 'admin-detail-actions');
        for (const status of ['VERIFIED','REJECTED']) actions.append(action(status === 'VERIFIED' ? 'Verify' : 'Reject', () => {
          modal.close(); confirmAction({ title: `${status} verification #${item.verificationId}?`,
            message: `${detail.employeeName} · ${detail.companyName}`, confirmLabel: status, invoking,
            danger: status === 'REJECTED', onConfirm: async (reason) => {
              await apiRequest(`/api/admin/verifications/${item.verificationId}/status`, { method: 'PATCH', auth: true,
                body: { status, rejectionReason: status === 'REJECTED' ? reason : undefined } });
              await load(page); await onChange();
            } });
        }, status === 'VERIFIED' ? 'primary' : 'danger'));
        body.append(actions);
      }
      const modal = dialog(`Verification #${item.verificationId}`, body, invoking);
    } catch (error) { ui.status.textContent = error.message; ui.status.classList.add('error'); }
  }
  async function load(nextPage = 1) {
    page = nextPage; ui.status.textContent = 'Loading verifications…';
    try {
      const params = new URLSearchParams({ ...ui.read(), page: String(page), pageSize: '20' });
      const result = await apiRequest(`/api/admin/verifications/table?${params}`, { auth: true });
      ui.status.textContent = `${result.total} matching verifications`;
      table(ui.list, [['ID', (item) => item.verificationId], ['User', (item) => item.employeeName],
        ['Company', (item) => item.companyName], ['Role', (item) => item.roleName],
        ['Status', (item) => badge(item.verificationStatus)], ['Submitted', (item) => date(item.requestedAt)],
        ['Reviewer', (item) => item.reviewedBy]], result.items, (item) => view(item));
      pagination(ui.pager, page, 20, result.total, load);
    } catch (error) { ui.status.textContent = error.message; ui.status.classList.add('error'); }
  }
  return { load };
}

export function mountReports(host, onChange, inspectSubmission) {
  let page = 1;
  const ui = section(host, 'Reports', 'Inspect reported content and record the resolution.', [
    { name: 'search', label: 'Search', placeholder: 'ID, company or reporter' },
    { name: 'status', label: 'Status', options: [['','All statuses'],['OPEN','Open'],['REVIEWING','Reviewing'],['RESOLVED','Resolved'],['DISMISSED','Dismissed']] }
  ], load);
  async function view(item, invoking = document.activeElement) {
    try {
      const detail = await apiRequest(`/api/admin/reports/${item.reportId}`, { auth: true });
      const body = node('div'); body.append(detailsOf(detail));
      const actions = node('div', '', 'admin-detail-actions');
      actions.append(action('Inspect submission', async () => { modal.close(); await inspectSubmission(item.submissionId); }));
      if (['OPEN','REVIEWING'].includes(detail.reportStatus)) for (const status of ['RESOLVED','DISMISSED']) {
        actions.append(action(status === 'RESOLVED' ? 'Resolve' : 'Dismiss', () => {
          modal.close(); confirmAction({ title: `${status} report #${item.reportId}?`, message: 'Record why this report is closed.',
            confirmLabel: status, invoking, danger: status === 'DISMISSED', onConfirm: async (reason) => {
              await apiRequest(`/api/admin/reports/${item.reportId}/status`, { method: 'PATCH', auth: true,
                body: { status, resolutionNote: reason } }); await load(page); await onChange();
            } });
        }, status === 'RESOLVED' ? 'primary' : 'secondary'));
      }
      body.append(actions);
      const modal = dialog(`Report #${item.reportId}`, body, invoking);
    } catch (error) { ui.status.textContent = error.message; ui.status.classList.add('error'); }
  }
  async function load(nextPage = 1) {
    page = nextPage; ui.status.textContent = 'Loading reports…';
    try {
      const params = new URLSearchParams({ ...ui.read(), page: String(page), pageSize: '20' });
      const result = await apiRequest(`/api/admin/reports/table?${params}`, { auth: true });
      ui.status.textContent = `${result.total} matching reports`;
      table(ui.list, [['ID', (item) => item.reportId], ['Submission', (item) => item.submissionId],
        ['Company', (item) => item.companyName], ['Type', (item) => item.submissionType],
        ['Reason', (item) => item.reasonCategory], ['Reporter', (item) => item.reporterName],
        ['Status', (item) => badge(item.reportStatus)], ['Created', (item) => date(item.reportedAt)]],
      result.items, (item) => view(item));
      pagination(ui.pager, page, 20, result.total, load);
    } catch (error) { ui.status.textContent = error.message; ui.status.classList.add('error'); }
  }
  return { load };
}
