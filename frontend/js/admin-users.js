import { apiRequest } from './api.js';
import { action, badge, confirmAction, date, dialog, facts, node, pagination, section, table } from './admin-control-ui.js';

export function mountUsers(host, onChange, openSubscription) {
  let page = 1;
  const ui = section(host, 'Users', 'Manage account status and representative access.', [
    { name: 'search', label: 'Search', placeholder: 'Name, email or user ID' },
    { name: 'role', label: 'Role', options: [['','All roles'],['USER','User'],['ADMIN','Admin'],['COMPANY_REPRESENTATIVE','Representative']] },
    { name: 'status', label: 'Status', options: [['','All statuses'],['ACTIVE','Active'],['SUSPENDED','Suspended'],['DEACTIVATED','Deactivated']] },
    { name: 'premium', label: 'Access', options: [['','All access'],['PREMIUM','Premium'],['TRIAL','Trial'],['FREE','Free']] },
    { name: 'sort', label: 'Sort', options: [['newest','Newest'],['oldest','Oldest'],['name','Name']] }
  ], load);

  async function view(item, invoking = document.activeElement) {
    try {
      const user = await apiRequest(`/api/admin/users/${item.userId}`, { auth: true });
      const body = node('div');
      body.append(node('h3', 'Account'), facts([
        ['ID', user.userId], ['Name', user.fullName], ['Email', user.email], ['Role', user.accountRole],
        ['Status', user.accountStatus], ['Joined', date(user.createdAt)]
      ]));
      body.append(node('h3', 'Profile'), facts([['Headline', user.headline], ['About', user.bio], ['Avatar', user.avatarPath ? 'Uploaded' : 'None']]));
      if (user.avatarUrl) {
        const avatar = node('img', '', 'admin-user-avatar'); avatar.src = user.avatarUrl;
        avatar.alt = `${user.fullName}'s profile picture`; body.append(avatar);
      }
      body.append(node('h3', 'Trust and activity'), facts([
        ['Verified scopes', user.verifiedScopes], ['Representative companies', user.representativeCompanies],
        ['Salaries', user.salaryCount], ['Reviews', user.reviewCount], ['Interviews', user.interviewCount],
        ['Applications', user.applicationCount], ['Reports', user.reportCount]
      ]));
      const assignments = node('div'); assignments.append(node('h3', 'Representative assignments'));
      for (const assignment of user.assignments) {
        const line = node('div', '', 'admin-detail-line');
        line.append(node('span', `${assignment.companyName} · ${assignment.status} · ${date(assignment.createdAt)}`));
        const available = assignment.status === 'PENDING' ? ['APPROVE','REJECT'] : assignment.status === 'ACTIVE' ? ['REVOKE'] : [];
        for (const choice of available) line.append(action(choice, () => {
          modal.close();
          confirmAction({ title: `${choice} representative scope`, message: `${assignment.companyName} for ${user.fullName}.`,
            confirmLabel: choice, invoking,
            onConfirm: async (reason) => {
              await apiRequest(`/api/admin/representative-assignments/${assignment.assignmentId}/decision`,
                { method: 'PATCH', auth: true, body: { action: choice, note: reason } });
              await load(page); await onChange();
            } });
        }, choice === 'REVOKE' ? 'danger' : 'secondary'));
        assignments.append(line);
      }
      if (!user.assignments.length) assignments.append(node('p', 'No representative assignments.'));
      body.append(assignments);
      const verifications = node('div'); verifications.append(node('h3', 'Verification status'));
      for (const record of user.verifications) verifications.append(node('p', `${record.companyName}: ${record.status} · ${date(record.requestedAt)}`));
      if (!user.verifications.length) verifications.append(node('p', 'No verification requests.'));
      body.append(verifications);
      const contributions = node('div'); contributions.append(node('h3', 'Recent contributions'));
      for (const record of user.contributions) contributions.append(node('p',
        `#${record.submissionId} · ${record.type} · ${record.companyName} · ${record.status} · ${date(record.submittedAt)}`));
      if (!user.contributions.length) contributions.append(node('p', 'No contributions.'));
      body.append(contributions);
      const activePeriod = user.accessPeriods.find((period) => !period.revokedAt &&
        new Date(period.startsAt) <= new Date() && new Date(period.endsAt) > new Date());
      body.append(node('h3', 'Premium'), facts([['Source', activePeriod?.source || (user.trialActive ? 'TRIAL' : 'Free')],
        ['Plan', activePeriod?.planCode], ['Starts', activePeriod ? date(activePeriod.startsAt) : null],
        ['Ends', activePeriod ? date(activePeriod.endsAt) : date(user.trialEndsAt)],
        ['Trial used', user.trialUsed ? 'Yes' : 'No'], ['Access periods', user.accessPeriods.length]]));
      const actions = node('div', '', 'admin-detail-actions');
      actions.append(action('Manage subscription', () => { modal.close(); openSubscription(user.userId); }));
      const choices = user.accountStatus === 'ACTIVE' ? [['SUSPENDED','Suspend'],['DEACTIVATED','Deactivate']]
        : [['ACTIVE','Reactivate']];
      for (const [status, label] of choices) actions.append(action(label, () => {
        modal.close();
        confirmAction({ title: `${label} ${user.fullName}?`, message: status === 'ACTIVE'
          ? 'Restore account access and invalidate old sessions.' : 'This immediately blocks login and current sessions.',
        confirmLabel: label, invoking, danger: status !== 'ACTIVE',
        confirmText: user.accountRole === 'ADMIN' ? user.email : null, onConfirm: async (reason) => {
          await apiRequest(`/api/admin/users/${user.userId}/status`, { method: 'PATCH', auth: true,
            body: { status, reason, confirmEmail: user.accountRole === 'ADMIN' ? user.email : undefined } });
          await load(page); await onChange();
        } });
      }, status === 'ACTIVE' ? 'primary' : 'danger'));
      body.append(actions);
      const modal = dialog(`User #${user.userId}`, body, invoking);
    } catch (error) { ui.status.textContent = error.message; ui.status.classList.add('error'); }
  }

  async function load(nextPage = 1) {
    page = nextPage; ui.status.textContent = 'Loading users…';
    try {
      const params = new URLSearchParams({ ...ui.read(), page: String(page), pageSize: '20' });
      const result = await apiRequest(`/api/admin/users?${params}`, { auth: true });
      ui.status.textContent = `${result.total} matching users`;
      table(ui.list, [['ID', (user) => user.userId], ['Name', (user) => user.fullName],
        ['Email', (user) => user.email], ['Role', (user) => badge(user.accountRole)],
        ['Status', (user) => badge(user.accountStatus)], ['Verified', (user) => user.verifiedScopes],
        ['Representative', (user) => user.representativeCompanies || '—'],
        ['Premium', (user) => user.premiumSource || (user.trialActive ? 'Trial' : 'Free')],
        ['Joined', (user) => date(user.createdAt)]], result.items, (user) => view(user));
      pagination(ui.pager, page, 20, result.total, load);
    } catch (error) { ui.status.textContent = error.message; ui.status.classList.add('error'); }
  }
  return { load };
}
