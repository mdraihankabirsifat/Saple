function getNextAccordionIndex(key, currentIndex, itemCount) {
  if (itemCount < 1) return currentIndex;
  if (key === 'Home') return 0;
  if (key === 'End') return itemCount - 1;
  if (key === 'ArrowDown') return (currentIndex + 1) % itemCount;
  if (key === 'ArrowUp') return (currentIndex - 1 + itemCount) % itemCount;
  return currentIndex;
}

function initializeFaqAccordion(root = document) {
  const buttons = Array.from(root.querySelectorAll('[data-faq-button]'));

  function setExpanded(button, expanded) {
    const panel = root.getElementById(button.getAttribute('aria-controls'));
    button.setAttribute('aria-expanded', String(expanded));
    if (panel) panel.hidden = !expanded;
  }

  function closeAll(exceptButton = null) {
    buttons.forEach((button) => {
      if (button !== exceptButton) setExpanded(button, false);
    });
  }

  buttons.forEach((button, index) => {
    button.addEventListener('click', () => {
      const shouldExpand = button.getAttribute('aria-expanded') !== 'true';
      closeAll(button);
      setExpanded(button, shouldExpand);
    });

    button.addEventListener('keydown', (event) => {
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        buttons[getNextAccordionIndex(event.key, index, buttons.length)].focus();
      }

      if (event.key === 'Escape' && button.getAttribute('aria-expanded') === 'true') {
        event.preventDefault();
        setExpanded(button, false);
      }
    });
  });
}

if (typeof document !== 'undefined') initializeFaqAccordion();

if (typeof module !== 'undefined') {
  module.exports = { getNextAccordionIndex, initializeFaqAccordion };
}
