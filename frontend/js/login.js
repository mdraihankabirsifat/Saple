const loginForm = document.querySelector('#login-form');
const emailInput = document.querySelector('#login-email');
const passwordInput = document.querySelector('#login-password');
const statusMessage = document.querySelector('#login-status');

function setFieldError(input, message) {
  const errorElement = document.querySelector(`#${input.getAttribute('aria-describedby')}`);
  input.setAttribute('aria-invalid', message ? 'true' : 'false');
  if (errorElement) errorElement.textContent = message;
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

loginForm.addEventListener('submit', (event) => {
  event.preventDefault();
  statusMessage.hidden = true;

  if (!validateLogin()) {
    loginForm.querySelector('[aria-invalid="true"]')?.focus();
    return;
  }

  statusMessage.textContent = 'Authentication backend is not connected yet.';
  statusMessage.className = 'state-message form-status';
  statusMessage.hidden = false;
});
