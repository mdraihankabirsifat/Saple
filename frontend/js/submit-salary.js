import { apiRequest, fetchApi } from './api.js';
import { requireContributionAccess } from './contribution-access.js';

const salaryForm = document.querySelector('#salary-form');
const companySelect = document.querySelector('#salary-company');
const companyLoadStatus = document.querySelector('#company-load-status');
const roleSelect = document.querySelector('#salary-role');
const roleLoadStatus = document.querySelector('#role-load-status');
const baseSalaryInput = document.querySelector('#base-salary');
const additionalCompensationInput = document.querySelector('#additional-compensation');
const currencyInput = document.querySelector('#salary-currency');
const payPeriodSelect = document.querySelector('#pay-period');
const experienceInput = document.querySelector('#years-experience');
const salaryYearInput = document.querySelector('#salary-year');
const employmentTypeSelect = document.querySelector('#employment-type');
const workModeSelect = document.querySelector('#work-mode');
const anonymousInput = document.querySelector('#anonymous-display');
const formStatus = document.querySelector('#salary-form-status');
const submitButton = salaryForm.querySelector('[type="submit"]');

const currentYear = new Date().getFullYear();
salaryYearInput.value = String(Math.min(Math.max(currentYear, 2000), 2100));

function setFieldError(input, errorId, message) {
  input.setAttribute('aria-invalid', message ? 'true' : 'false');
  document.querySelector(`#${errorId}`).textContent = message;
}

function showFormStatus(message, type = '') {
  formStatus.replaceChildren();
  formStatus.className = 'state-message form-status';
  if (type) formStatus.classList.add(type);
  formStatus.append(document.createTextNode(message));
  formStatus.hidden = false;
}

function showSignInRequired(message = 'Please sign in before submitting salary information.') {
  showFormStatus(message, 'error');
  const signInLink = document.createElement('a');
  signInLink.href = 'login.html?returnTo=submit-salary.html';
  signInLink.textContent = 'Sign in to continue';
  signInLink.className = 'state-action-link';
  formStatus.append(document.createElement('br'), signInLink);
}

async function loadCompanies(companies) {
  companySelect.disabled = true;
  companyLoadStatus.textContent = 'Loading from the Saple API...';
  companyLoadStatus.classList.remove('error');

  try {
    const placeholder = new Option('Select a company', '');
    companySelect.replaceChildren(placeholder);

    if (!Array.isArray(companies) || companies.length === 0) {
      companyLoadStatus.textContent = 'No companies are available yet.';
      return;
    }

    companies.forEach((company) => {
      if (company.companyId !== null && company.companyId !== undefined && company.companyName) {
        companySelect.append(new Option(company.companyName, String(company.companyId)));
      }
    });

    companySelect.disabled = false;
    companyLoadStatus.textContent = 'Companies loaded from the live directory.';
  } catch (error) {
    companySelect.replaceChildren(new Option('Company list unavailable', ''));
    companyLoadStatus.textContent = error.message;
    companyLoadStatus.classList.add('error');
  }
}

async function loadJobRoles() {
  roleSelect.disabled = true;
  roleLoadStatus.textContent = 'Loading job roles...';
  roleLoadStatus.classList.remove('error');

  try {
    const roles = await fetchApi('/api/job-roles');
    roleSelect.replaceChildren(new Option('Select a job role', ''));

    if (!Array.isArray(roles) || roles.length === 0) {
      roleLoadStatus.textContent = 'No job roles are available yet.';
      return;
    }

    roles.forEach((role) => {
      if (role.roleId !== null && role.roleId !== undefined && role.roleName) {
        roleSelect.append(new Option(role.roleName, String(role.roleId)));
      }
    });

    roleSelect.disabled = false;
    roleLoadStatus.textContent = 'Job roles loaded from the Saple API.';
  } catch (error) {
    roleSelect.replaceChildren(new Option('Job roles unavailable', ''));
    roleLoadStatus.textContent = error.message;
    roleLoadStatus.classList.add('error');
  }
}

function validateForm() {
  let valid = true;

  if (!companySelect.value) {
    setFieldError(companySelect, 'salary-company-error', 'Select a company from the live directory.');
    valid = false;
  } else {
    setFieldError(companySelect, 'salary-company-error', '');
  }

  if (!roleSelect.value) {
    setFieldError(roleSelect, 'salary-role-error', 'Select a job role.');
    valid = false;
  } else {
    setFieldError(roleSelect, 'salary-role-error', '');
  }

  if (!baseSalaryInput.value || !baseSalaryInput.validity.valid || Number(baseSalaryInput.value) <= 0) {
    setFieldError(baseSalaryInput, 'base-salary-error', 'Enter a base salary greater than zero.');
    valid = false;
  } else {
    setFieldError(baseSalaryInput, 'base-salary-error', '');
  }

  if (additionalCompensationInput.value && (!additionalCompensationInput.validity.valid || Number(additionalCompensationInput.value) < 0)) {
    setFieldError(additionalCompensationInput, 'additional-compensation-error', 'Additional compensation cannot be negative.');
    valid = false;
  } else {
    setFieldError(additionalCompensationInput, 'additional-compensation-error', '');
  }

  if (!/^[A-Z]{3}$/.test(currencyInput.value.trim())) {
    setFieldError(currencyInput, 'salary-currency-error', 'Enter a three-letter uppercase currency code.');
    valid = false;
  } else {
    setFieldError(currencyInput, 'salary-currency-error', '');
  }

  if (!payPeriodSelect.value) {
    setFieldError(payPeriodSelect, 'pay-period-error', 'Select a pay period.');
    valid = false;
  } else {
    setFieldError(payPeriodSelect, 'pay-period-error', '');
  }

  if (experienceInput.value === '' || !experienceInput.validity.valid) {
    setFieldError(experienceInput, 'years-experience-error', 'Enter experience between 0 and 60 years.');
    valid = false;
  } else {
    setFieldError(experienceInput, 'years-experience-error', '');
  }

  if (!salaryYearInput.value || !salaryYearInput.validity.valid) {
    setFieldError(salaryYearInput, 'salary-year-error', 'Enter a salary year between 2000 and 2100.');
    valid = false;
  } else {
    setFieldError(salaryYearInput, 'salary-year-error', '');
  }

  if (!employmentTypeSelect.value) {
    setFieldError(employmentTypeSelect, 'employment-type-error', 'Select an employment type.');
    valid = false;
  } else {
    setFieldError(employmentTypeSelect, 'employment-type-error', '');
  }

  if (!workModeSelect.value) {
    setFieldError(workModeSelect, 'work-mode-error', 'Select a work mode.');
    valid = false;
  } else {
    setFieldError(workModeSelect, 'work-mode-error', '');
  }

  return valid;
}

currencyInput.addEventListener('input', () => {
  currencyInput.value = currencyInput.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
});

salaryForm.querySelectorAll('input, select').forEach((field) => {
  field.addEventListener('input', () => { formStatus.hidden = true; });
  field.addEventListener('change', () => { formStatus.hidden = true; });
});

salaryForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  formStatus.hidden = true;

  if (!validateForm()) {
    salaryForm.querySelector('[aria-invalid="true"]:not(:disabled)')?.focus();
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = 'Submitting...';

  try {
    await apiRequest(`/api/companies/${encodeURIComponent(companySelect.value)}/salaries`, {
      method: 'POST',
      auth: true,
      body: {
        roleId: Number(roleSelect.value),
        baseSalary: Number(baseSalaryInput.value),
        additionalCompensation: additionalCompensationInput.value === ''
          ? null
          : Number(additionalCompensationInput.value),
        currency: currencyInput.value.trim(),
        payPeriod: payPeriodSelect.value,
        yearsOfExperience: Number(experienceInput.value),
        employmentType: employmentTypeSelect.value,
        workMode: workModeSelect.value,
        salaryYear: Number(salaryYearInput.value),
        isAnonymous: anonymousInput.checked
      }
    });

    showFormStatus('Salary submitted for review.', 'success');
  } catch (error) {
    if (error.status === 401) {
      showSignInRequired('Your session is missing or expired. Please sign in again.');
    } else if (error.status === 403) {
      showFormStatus('Employee verification is required for the selected company.', 'error');
    } else {
      showFormStatus(error.message, 'error');
    }
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = 'Submit salary for review';
  }
});

(async () => {
  const access = await requireContributionAccess('submit-salary.html');
  if (!access) return;
  await Promise.all([loadCompanies(access.verifiedCompanies), loadJobRoles()]);
})();
