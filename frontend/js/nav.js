const navigationToggle = document.querySelector('[data-nav-toggle]');
const navigationMenu = document.querySelector('[data-nav-menu]');
const contributionMenu = document.querySelector('.contribute-menu');

function closeNavigation() {
  if (!navigationToggle || !navigationMenu) {
    return;
  }

  navigationToggle.setAttribute('aria-expanded', 'false');
  navigationMenu.classList.remove('is-open');
}

if (navigationToggle && navigationMenu) {
  navigationToggle.addEventListener('click', () => {
    const shouldOpen = navigationToggle.getAttribute('aria-expanded') !== 'true';
    navigationToggle.setAttribute('aria-expanded', String(shouldOpen));
    navigationMenu.classList.toggle('is-open', shouldOpen);
  });

  navigationMenu.addEventListener('click', (event) => {
    if (event.target.closest('a') && window.matchMedia('(max-width: 900px)').matches) {
      closeNavigation();
    }
  });

  window.addEventListener('resize', () => {
    if (!window.matchMedia('(max-width: 900px)').matches) {
      closeNavigation();
    }
  });
}

document.addEventListener('click', (event) => {
  if (contributionMenu?.open && !contributionMenu.contains(event.target)) {
    contributionMenu.open = false;
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') {
    return;
  }

  closeNavigation();

  if (contributionMenu?.open) {
    contributionMenu.open = false;
    contributionMenu.querySelector('summary')?.focus();
  }
});
