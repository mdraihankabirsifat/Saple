import { apiRequest } from './api.js';
import { setSession } from './auth.js';

const loginForm = document.querySelector('#login-form');
const emailInput = document.querySelector('#login-email');
const passwordInput = document.querySelector('#login-password');
const statusMessage = document.querySelector('#login-status');
const submitButton = loginForm.querySelector('[type="submit"]');

function setFieldError(input, message) {
  const errorElement = document.querySelector(`#${input.getAttribute('aria-describedby')}`);
  input.setAttribute('aria-invalid', message ? 'true' : 'false');
  if (errorElement) errorElement.textContent = message;
}

function showStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.className = 'state-message form-status';
  statusMessage.classList.toggle('error', isError);
  statusMessage.hidden = false;
}

function validateLogin() {
  let valid = true;
  const email = emailInput.value.trim();

  if (!email) {
    setFieldError(emailInput, 'Enter your email address.');
    valid = false;
  } else if (!emailInput.validity.valid) {
    setFieldError(emailInput, 'Enter a valid email address.');
    valid = false;
  } else {
    setFieldError(emailInput, '');
  }

  if (!passwordInput.value) {
    setFieldError(passwordInput, 'Enter your password.');
    valid = false;
  } else {
    setFieldError(passwordInput, '');
  }

  return valid;
}

function getReturnPath() {
  const returnTo = new URLSearchParams(window.location.search).get('returnTo');
  return returnTo && /^[a-z0-9-]+\.html(?:\?[^#]*)?(?:#.*)?$/i.test(returnTo)
    ? returnTo
    : 'index.html';
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

[emailInput, passwordInput].forEach((input) => {
  input.addEventListener('input', () => {
    setFieldError(input, '');
    statusMessage.hidden = true;
  });
});

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  statusMessage.hidden = true;

  if (!validateLogin()) {
    loginForm.querySelector('[aria-invalid="true"]')?.focus();
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = 'Signing in...';

  try {
    const result = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: {
        email: emailInput.value.trim(),
        password: passwordInput.value
      }
    });

    setSession(result.token, result.user);
    window.location.assign(getReturnPath());
  } catch (error) {
    showStatus(error.message, true);
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = 'Sign in';
  }
});

if (new URLSearchParams(window.location.search).get('registered') === '1') {
  showStatus('Account created successfully. Sign in to continue.');
}
