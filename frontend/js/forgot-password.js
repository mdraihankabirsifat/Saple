import { apiRequest } from './api.js';

const form = document.querySelector('#forgot-password-form');
const emailInput = document.querySelector('#forgot-email');
const emailError = document.querySelector('#forgot-email-error');
const statusMessage = document.querySelector('#forgot-password-status');
const submitButton = form.querySelector('[type="submit"]');
let isSubmitting = false;

function setEmailError(message) {
  emailInput.setAttribute('aria-invalid', message ? 'true' : 'false');
  emailError.textContent = message;
}

function showStatus(message, isError = false) {
  statusMessage.textContent = message;
  statusMessage.className = 'state-message form-status';
  statusMessage.classList.toggle('error', isError);
  statusMessage.hidden = false;
}

emailInput.addEventListener('input', () => {
  setEmailError('');
  statusMessage.hidden = true;
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (isSubmitting) return;

  const email = emailInput.value.trim();
  if (!email || !emailInput.validity.valid) {
    setEmailError(email ? 'Enter a valid email address.' : 'Enter your email address.');
    emailInput.focus();
    return;
  }

  setEmailError('');
  statusMessage.hidden = true;
  isSubmitting = true;
  submitButton.disabled = true;
  submitButton.textContent = 'Sending reset link...';

  try {
    await apiRequest('/api/auth/forgot-password', { method: 'POST', body: { email } });
    showStatus('Password-reset email sent. Check your inbox and spam or junk folder.');
    form.reset();
  } catch (error) {
    showStatus(error.message, true);
  } finally {
    isSubmitting = false;
    submitButton.disabled = false;
    submitButton.textContent = 'Send reset link';
  }
});
