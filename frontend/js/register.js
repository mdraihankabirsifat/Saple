import { apiRequest } from './api.js';

const registerForm = document.querySelector('#register-form');
const nameInput = document.querySelector('#register-name');
const emailInput = document.querySelector('#register-email');
const passwordInput = document.querySelector('#register-password');
const confirmPasswordInput = document.querySelector('#register-confirm-password');
const employmentFields = document.querySelector('#employment-fields');
const statusMessage = document.querySelector('#register-status');
const submitButton = registerForm.querySelector('[type="submit"]');

function setFieldError(input, errorId, message) {
  input.setAttribute('aria-invalid', message ? 'true' : 'false');
  document.querySelector(`#${errorId}`).textContent = message;
}

function updateEmploymentFields() {
  const isEmployee = registerForm.elements.accountType.value === 'EMPLOYEE';
  employmentFields.hidden = !isEmployee;
  employmentFields.disabled = !isEmployee;

  if (!isEmployee) {
    registerForm.querySelectorAll('[name="employmentStatus"]').forEach((input) => { input.checked = false; });
    document.querySelector('#employment-status-error').textContent = '';
  }
}

function validateRegistration() {
  let valid = true;
  const fullName = nameInput.value.trim();
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  if (fullName.length < 2) {
    setFieldError(nameInput, 'register-name-error', 'Enter your full name using at least 2 characters.');
    valid = false;
  } else {
    setFieldError(nameInput, 'register-name-error', '');
  }

  if (!email) {
    setFieldError(emailInput, 'register-email-error', 'Enter your email address.');
    valid = false;
  } else if (!emailInput.validity.valid) {
    setFieldError(emailInput, 'register-email-error', 'Enter a valid email address.');
    valid = false;
  } else {
    setFieldError(emailInput, 'register-email-error', '');
  }

  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    setFieldError(passwordInput, 'register-password-error', 'Use at least 8 characters, including a letter and a number.');
    valid = false;
  } else {
    setFieldError(passwordInput, 'register-password-error', '');
  }

  if (!confirmPasswordInput.value) {
    setFieldError(confirmPasswordInput, 'register-confirm-error', 'Confirm your password.');
    valid = false;
  } else if (confirmPasswordInput.value !== password) {
    setFieldError(confirmPasswordInput, 'register-confirm-error', 'Passwords do not match.');
    valid = false;
  } else {
    setFieldError(confirmPasswordInput, 'register-confirm-error', '');
  }

  if (registerForm.elements.accountType.value === 'EMPLOYEE' && !registerForm.elements.employmentStatus.value) {
    document.querySelector('#employment-status-error').textContent = 'Choose current or former employee.';
    valid = false;
  } else {
    document.querySelector('#employment-status-error').textContent = '';
  }

  return valid;
}

document.querySelectorAll('.password-toggle').forEach((button) => {
  button.addEventListener('click', () => {
    const input = document.querySelector(`#${button.getAttribute('aria-controls')}`);
    const showing = input.type === 'text';
    input.type = showing ? 'password' : 'text';
    button.textContent = showing ? 'Show' : 'Hide';
    button.setAttribute('aria-label', `${showing ? 'Show' : 'Hide'} password`);
  });
});

registerForm.querySelectorAll('[name="accountType"]').forEach((input) => input.addEventListener('change', updateEmploymentFields));
registerForm.querySelectorAll('input').forEach((input) => input.addEventListener('input', () => { statusMessage.hidden = true; }));

registerForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  statusMessage.hidden = true;

  if (!validateRegistration()) {
    registerForm.querySelector('[aria-invalid="true"]')?.focus();
    return;
  }

  const userType = registerForm.elements.accountType.value;
  submitButton.disabled = true;
  submitButton.textContent = 'Creating account...';

  try {
    await apiRequest('/api/auth/register', {
      method: 'POST',
      body: {
        fullName: nameInput.value.trim(),
        email: emailInput.value.trim(),
        password: passwordInput.value,
        userType,
        ...(userType === 'EMPLOYEE'
          ? { employmentStatus: registerForm.elements.employmentStatus.value }
          : {})
      }
    });

    window.location.assign('login.html?registered=1');
  } catch (error) {
    statusMessage.textContent = error.message;
    statusMessage.className = 'state-message form-status error';
    statusMessage.hidden = false;
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = 'Create account';
  }
});

updateEmploymentFields();
