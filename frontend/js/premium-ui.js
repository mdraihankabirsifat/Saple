import { el } from './ui.js';

// Small shared Premium pieces. What they show always comes from the server:
// a badge only exists when the API sent one, and a locked interview never
// carries its full questions text to the browser in the first place.

// The public member badge. The API never includes an expiry date.
export function premiumBadge(badge, className = '') {
  if (!badge?.premium) return null;
  const label = badge.label === 'Premium trial' ? 'Premium trial' : 'Premium';
  return el('span', {
    className: `premium-badge${className ? ` ${className}` : ''}`,
    text: label,
    attrs: { title: badge.label || 'Premium Saple member' }
  });
}

// One or two lines of an interview's questions, fading out, with the lock.
export function lockedQuestions(preview) {
  return el('div', { className: 'questions-locked' }, [
    preview ? el('p', { className: 'questions-preview', text: preview }) : null,
    el('p', { className: 'questions-lock' }, [
      el('span', { className: 'lock-icon', attrs: { 'aria-hidden': 'true' } }),
      el('a', { text: 'Unlock full interview questions with Premium', attrs: { href: 'premium.html' } })
    ])
  ]);
}

// A Premium vacancy shown to someone without access: what it is, not its details.
export function premiumJobNote() {
  return el('p', { className: 'job-locked-note' }, [
    el('span', { className: 'lock-icon', attrs: { 'aria-hidden': 'true' } }),
    el('span', { text: 'This is a Premium opportunity. Full details and applying are open to Premium members.' }),
    el('a', { text: 'See Premium', attrs: { href: 'premium.html' } })
  ]);
}
