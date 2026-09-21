// Saple draws company marks locally.
//
// Earlier versions fetched a logo image from a third-party service using a
// domain taken from the database. That let database content decide which
// external host the browser contacted, which is exactly the kind of untrusted
// outbound request a safe site should not make, and it was one of the things
// the Google Web Risk remediation had to remove. Nothing here contacts the
// network: the mark is generated from the company name alone.

const DOMAIN_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

// Twelve fixed hues from the Saple palette. The company name picks one
// deterministically, so a company keeps the same mark on every page.
const MARK_HUES = Object.freeze([158, 172, 196, 210, 228, 262, 286, 320, 12, 28, 44, 96]);

// Kept because company profile pages still display a website link. It
// validates and normalises a domain for display; it never builds a request.
export function normalizeCompanyDomain(website) {
  if (typeof website !== 'string') return null;

  const candidate = website.trim();
  if (!candidate || candidate.length > 2048 || /[\u0000-\u001f\u007f\s]/u.test(candidate)) {
    return null;
  }

  const hasWebScheme = /^https?:\/\//i.test(candidate);
  if (!hasWebScheme && /^[a-z][a-z\d+.-]*:/i.test(candidate)) return null;

  try {
    const parsed = new URL(hasWebScheme ? candidate : `https://${candidate}`);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
      return null;
    }

    const hostname = parsed.hostname
      .toLowerCase()
      .replace(/\.$/u, '')
      .replace(/^www\./u, '');
    const labels = hostname.split('.');
    const topLevelDomain = labels.at(-1) || '';

    if (
      hostname.length > 253
      || hostname.includes(':')
      || labels.length < 2
      || topLevelDomain.length < 2
      || /^\d+$/u.test(topLevelDomain)
      || !labels.every((label) => DOMAIN_LABEL.test(label))
    ) {
      return null;
    }

    return hostname;
  } catch (error) {
    return null;
  }
}

export function getCompanyInitials(companyName) {
  const words = typeof companyName === 'string'
    ? companyName.trim().match(/[\p{L}\p{N}]+/gu) || []
    : [];

  if (words.length === 0) return 'S';
  if (words.length === 1) return Array.from(words[0]).slice(0, 2).join('').toUpperCase();

  return `${Array.from(words[0])[0]}${Array.from(words.at(-1))[0]}`.toUpperCase();
}

// A small, stable string hash. It only has to spread names across twelve hues.
export function getCompanyMarkHue(companyName) {
  const text = typeof companyName === 'string' ? companyName.trim().toLowerCase() : '';
  let hash = 0;
  for (const character of text) {
    hash = (hash * 31 + character.codePointAt(0)) % 100000007;
  }
  return MARK_HUES[hash % MARK_HUES.length];
}

// Returns a container holding generated initials. There is no <img>, no src,
// no remote host and no fallback chain to get stuck in.
export function createCompanyLogo(companyName, _website, documentRef = globalThis.document) {
  const accessibleName = typeof companyName === 'string' && companyName.trim()
    ? companyName.trim()
    : 'Company';
  const container = documentRef.createElement('div');
  const mark = documentRef.createElement('span');

  container.className = 'company-logo';
  mark.className = 'company-logo-fallback';
  mark.textContent = getCompanyInitials(accessibleName);
  mark.setAttribute('role', 'img');
  mark.setAttribute('aria-label', `${accessibleName} company initials`);
  // A data attribute, not an inline style, so the strict CSP needs no
  // style-src exception. The stylesheet turns the hue into a colour.
  container.dataset.markHue = String(getCompanyMarkHue(accessibleName));
  mark.dataset.markHue = container.dataset.markHue;
  container.append(mark);

  return container;
}
