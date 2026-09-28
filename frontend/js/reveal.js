// Subtle motion shared by every page, loaded once by nav.js.
//
// Content on the first screen of static HTML animates in with pure CSS (the
// entrance rules in premium.css), so nothing ever waits on this script to
// become visible. This module handles the rest:
//
// - Sections and cards below the first screen fade up once, the first time
//   they scroll into view (IntersectionObserver), and are then left alone.
// - Blocks rendered later from the API (cards, profile and company sections)
//   fade up as they appear, or on scroll if they arrive below the fold.
//
// Only opacity and transform change, so nothing shifts the layout. With
// prefers-reduced-motion nothing is hidden or animated at all.

const CANDIDATES = 'section, article, .card, .company-card, .job-card, .rail-card';
// Controls and overlays that must never start hidden.
const EXCLUDED = '.browse-sidebar, .filter-drawer, dialog, [role="dialog"], .guide-panel, .nav-menu, [class*="skeleton"]';
const STAGGER_MS = 60;
const MAX_STAGGER = 5;

function reducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

function belowFold(element) {
  const rect = element.getBoundingClientRect();
  return rect.height > 0 && rect.top > window.innerHeight;
}

// Once an element is revealed its classes go, so its own hover transitions
// and transforms work exactly as before.
function settle(element) {
  element.classList.remove('reveal', 'is-revealed', 'reveal-enter');
  element.style.removeProperty('--reveal-delay');
}

// Transition and animation events bubble from children, so only the element's
// own event counts. The timeout covers an element hidden before it finishes.
function settleAfter(element, eventName) {
  const done = (event) => {
    if (event && event.target !== element) return;
    element.removeEventListener(eventName, done);
    clearTimeout(timer);
    settle(element);
  };
  const timer = setTimeout(done, 1500);
  element.addEventListener(eventName, done);
}

export function mountReveal(root = document.querySelector('main')) {
  if (!root || reducedMotion() || typeof IntersectionObserver === 'undefined') return;

  const seen = new WeakSet();
  const observer = new IntersectionObserver((entries) => {
    let order = 0;
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const element = entry.target;
      observer.unobserve(element);
      element.style.setProperty('--reveal-delay', `${Math.min(order++, MAX_STAGGER) * STAGGER_MS}ms`);
      element.classList.add('is-revealed');
      settleAfter(element, 'transitionend');
    }
  }, { rootMargin: '0px 0px -8% 0px' });

  // Nested blocks inside something still waiting to reveal would only animate twice.
  const eligible = (element) => !seen.has(element) && !element.matches(EXCLUDED)
    && !element.closest(EXCLUDED) && !element.parentElement?.closest('.reveal:not(.is-revealed)');

  function candidatesIn(node) {
    const found = node.matches(CANDIDATES) ? [node] : [];
    found.push(...node.querySelectorAll(CANDIDATES));
    // Keep only the outermost candidate of each nested group.
    return found.filter((element) => !found.some((other) => other !== element && other.contains(element)));
  }

  function hideUntilVisible(element) {
    seen.add(element);
    element.classList.add('reveal');
    observer.observe(element);
  }

  // First screen: static content stays as it is; everything below it waits.
  for (const element of candidatesIn(root)) {
    if (!eligible(element)) continue;
    seen.add(element);
    if (belowFold(element)) hideUntilVisible(element);
  }

  // Content added after load. The callback runs before the next paint, so an
  // inserted block is never seen at full opacity first.
  new MutationObserver((records) => {
    let order = 0;
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        for (const element of candidatesIn(node)) {
          if (!eligible(element)) continue;
          if (belowFold(element)) { hideUntilVisible(element); continue; }
          seen.add(element);
          element.style.setProperty('--reveal-delay', `${Math.min(order++, MAX_STAGGER) * STAGGER_MS}ms`);
          element.classList.add('reveal-enter');
          settleAfter(element, 'animationend');
        }
      }
    }
  }).observe(root, { childList: true, subtree: true });
}
