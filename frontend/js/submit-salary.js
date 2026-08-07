import { fetchApi } from './api.js';

const salaryForm = document.querySelector('#salary-form');
const companySelect = document.querySelector('#salary-company');
const companyLoadStatus = document.querySelector('#company-load-status');
const roleInput = document.querySelector('#salary-role');
const baseSalaryInput = document.querySelector('#base-salary');
const additionalCompensationInput = document.querySelector('#additional-compensation');
const currencyInput = document.querySelector('#salary-currency');
const payPeriodSelect = document.querySelector('#pay-period');
const experienceInput = document.querySelector('#years-experience');
const salaryYearInput = document.querySelector('#salary-year');
const employmentTypeSelect = document.querySelector('#employment-type');
const workModeSelect = document.querySelector('#work-mode');
const formStatus = document.querySelector('#salary-form-status');

const currentYear = new Date().getFullYear();
salaryYearInput.value = String(Math.min(Math.max(currentYear, 2000), 2100));

function setFieldError(input, errorId, message) {
  input.setAttribute('aria-invalid', message ? 'true' : 'false');
  document.querySelector(`#${errorId}`).textContent = message;
}

async function loadCompanies() {
  companySelect.disabled = true;
  companyLoadStatus.textContent = 'Loading from the Saple API...';
  companyLoadStatus.classList.remove('error');

  try {
    const companies = await fetchApi('/api/companies');
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Select a company';
    companySelect.replaceChildren(placeholder);

    if (!Array.isArray(companies) || companies.length === 0) {
      companyLoadStatus.textContent = 'No companies are available yet.';
      companySelect.disabled = true;
      return;
    }

    companies.forEach((company) => {
      if (company.companyId === null || company.companyId === undefined || !company.companyName) return;
      const option = document.createElement('option');
      option.value = String(company.companyId);
      option.textContent = company.companyName;
      companySelect.append(option);
    });

    companySelect.disabled = false;
    companyLoadStatus.textContent = 'Companies loaded from the live directory.';
  } catch (error) {
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = 'Company list unavailable';
    companySelect.replaceChildren(placeholder);
    companySelect.disabled = true;
    companyLoadStatus.textContent = error.message;
    companyLoadStatus.classList.add('error');
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

  if (roleInput.value.trim().length < 2) {
    setFieldError(roleInput, 'salary-role-error', 'Enter a job role using at least 2 characters.');
    valid = false;
  } else {
    setFieldError(roleInput, 'salary-role-error', '');
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

salaryForm.addEventListener('submit', (event) => {
  event.preventDefault();
  formStatus.hidden = true;

  if (!validateForm()) {
    salaryForm.querySelector('[aria-invalid="true"]')?.focus();
    return;
  }

  formStatus.textContent = 'Salary submission backend will be connected in the next implementation step.';
  formStatus.className = 'state-message form-status';
  formStatus.hidden = false;
});

loadCompanies();
