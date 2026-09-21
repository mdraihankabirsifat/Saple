// Run before stylesheets so navigation between pages preserves the chosen theme.
(() => {
  const key = 'saple.theme';
  function apply(value) {
    const theme = value === 'dark' ? 'dark' : 'light';
    document.documentElement.dataset.theme = theme;
    document.querySelector('[data-theme-toggle]')?.setAttribute('aria-pressed', String(theme === 'dark'));
  }
  try { apply(localStorage.getItem(key)); } catch { apply('light'); }
  // Starting navigation mode, before first paint. nav.js then measures whether
  // the full desktop row really fits and adjusts this class.
  if (window.matchMedia?.('(max-width: 1050px)')?.matches) document.documentElement.classList.add('nav-compact');
  window.SapleTheme = {
    toggle() {
      const theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      apply(theme);
      try { localStorage.setItem(key, theme); } catch { /* Theme still works without storage. */ }
    }
  };
  window.addEventListener('storage', (event) => {
    if (event.key === key || event.key === null) apply(event.newValue);
  });
})();
