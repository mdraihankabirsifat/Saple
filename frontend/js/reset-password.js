import { apiRequest } from './api.js';

const form = document.querySelector('#reset-password-form');
const passwordInput = document.querySelector('#reset-password');
const confirmationInput = document.querySelector('#reset-password-confirmation');
const passwordError = document.querySelector('#reset-password-error');
const confirmationError = document.querySelector('#reset-confirmation-error');
const statusMessage = document.querySelector('#reset-password-status');
const submitButton = form.querySelector('[type="submit"]');
let resetToken = new URLSearchParams(window.location.search).get('token') || '';
let isSubmitting = false;

if (window.location.search) window.history.replaceState(null, '', 'reset-password.html');

function setFieldError(input, element, message) {
  input.setAttribute('aria-invalid', message ? 'true' : 'false');
  element.textContent = message;
}

function showStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.className = 'state-message form-status';
  statusMessage.classList.toggle('error', isError);
  statusMessage.hidden = false;
}

function validateForm() {
  let valid = true;
  const password = passwordInput.value;

  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    setFieldError(passwordInput, passwordError, 'Use at least 8 characters with a letter and a number.');
    valid = false;
  } else {
    setFieldError(passwordInput, passwordError, '');
  }

  if (!confirmationInput.value) {
    setFieldError(confirmationInput, confirmationError, 'Confirm your new password.');
    valid = false;
  } else if (confirmationInput.value !== password) {
    setFieldError(confirmationInput, confirmationError, 'Passwords do not match.');
    valid = false;
  } else {
    setFieldError(confirmationInput, confirmationError, '');
  }

  return valid;
}

document.querySelectorAll('.password-toggle').forEach((button) => {
  button.addEventListener('click', () => {
    const input = document.querySelector(`#${button.getAttribute('aria-controls')}`);
    const isVisible = input.type === 'text';
    input.type = isVisible ? 'password' : 'text';
    button.textContent = isVisible ? 'Show' : 'Hide';
    button.setAttribute('aria-label', `${isVisible ? 'Show' : 'Hide'} ${input === passwordInput ? 'new' : 'confirmed'} password`);
  });
});

[passwordInput, confirmationInput].forEach((input) => {
  input.addEventListener('input', () => {
    setFieldError(input, input === passwordInput ? passwordError : confirmationError, '');
    statusMessage.hidden = true;
  });
});

if (!resetToken) {
  showStatus('This password-reset link is invalid. Request a new link from the Forgot Password page.', true);
  submitButton.disabled = true;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (isSubmitting || !resetToken) return;
  statusMessage.hidden = true;

  if (!validateForm()) {
    form.querySelector('[aria-invalid="true"]')?.focus();
    return;
  }

  isSubmitting = true;
  submitButton.disabled = true;
  submitButton.textContent = 'Resetting password...';

  try {
    await apiRequest('/api/auth/reset-password', {
      method: 'POST',
      body: {
        token: resetToken,
        newPassword: passwordInput.value,
        confirmPassword: confirmationInput.value
      }
    });
    resetToken = '';
    form.reset();
    showStatus('Password reset successfully. You can now sign in.');
  } catch (error) {
    showStatus(error.message, true);
    submitButton.disabled = false;
  } finally {
    isSubmitting = false;
    submitButton.textContent = 'Reset password';
  }
});
