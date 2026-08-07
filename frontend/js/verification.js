import { apiRequest, fetchApi } from './api.js';
import { getCurrentUser, isAuthenticated } from './auth.js';

const form = document.querySelector('#verification-form');
const company = document.querySelector('#verification-company');
const employmentStatus = document.querySelector('#verification-employment-status');
const currentEvidence = document.querySelector('#current-evidence');
const formerEvidence = document.querySelector('#former-evidence');
const companyEmail = document.querySelector('#verification-company-email');
const proofType = document.querySelector('#verification-proof-type');
const proofReference = document.querySelector('#verification-proof-reference');
const status = document.querySelector('#verification-status');
const submitButton = form.querySelector('[type="submit"]');

function show(message, type = '') { status.textContent = message; status.className = 'state-message form-status'; if (type) status.classList.add(type); status.hidden = false; }
function updateEvidence() {
  const current = employmentStatus.value === 'CURRENT'; const former = employmentStatus.value === 'FORMER';
  currentEvidence.hidden = !current; formerEvidence.hidden = !former;
  companyEmail.required = current; proofType.required = former; proofReference.required = former;
}
employmentStatus.addEventListener('change', updateEvidence);
form.addEventListener('submit', async (event) => {
  event.preventDefault(); status.hidden = true;
  if (!form.checkValidity()) { form.reportValidity(); return; }
  const current = employmentStatus.value === 'CURRENT';
  const body = {
    employmentStatus: employmentStatus.value,
    verificationMethod: current ? 'COMPANY_EMAIL_OTP' : 'DOCUMENT',
    ...(current ? { companyEmail: companyEmail.value } : { proofType: proofType.value, proofReference: proofReference.value })
  };
  submitButton.disabled = true;
  try {
    await apiRequest(`/api/companies/${company.value}/verifications`, { method: 'POST', auth: true, body });
    show('Verification request submitted for admin review.', 'success');
  } catch (error) { show(error.message, 'error'); }
  finally { submitButton.disabled = false; }
});

(async () => {
  if (!isAuthenticated()) { window.location.replace('login.html?returnTo=employee-verification.html'); return; }
  try {
    const user = await getCurrentUser();
    if (user.userType !== 'EMPLOYEE') { show('An employee account is required to request verification.', 'error'); form.hidden = true; return; }
    employmentStatus.value = user.employmentStatus || ''; updateEvidence();
    const companies = await fetchApi('/api/companies');
    company.replaceChildren(new Option('Select a company', ''));
    companies.forEach((item) => company.append(new Option(item.companyName, item.companyId)));
    company.disabled = false;
  } catch (error) { show(error.message, 'error'); }
})();
