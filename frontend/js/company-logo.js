const HUNTER_LOGO_BASE_URL = 'https://logos.hunter.io/';
const DOMAIN_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

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

export function getCompanyLogoUrl(website) {
  const domain = normalizeCompanyDomain(website);
  return domain ? `${HUNTER_LOGO_BASE_URL}${encodeURIComponent(domain)}` : null;
}

export function getCompanyInitials(companyName) {
  const words = typeof companyName === 'string'
    ? companyName.trim().match(/[\p{L}\p{N}]+/gu) || []
    : [];

  if (words.length === 0) return 'S';
  if (words.length === 1) return Array.from(words[0]).slice(0, 2).join('').toUpperCase();

  return `${Array.from(words[0])[0]}${Array.from(words.at(-1))[0]}`.toUpperCase();
}

export function createCompanyLogo(companyName, website, documentRef = globalThis.document) {
  const accessibleName = typeof companyName === 'string' && companyName.trim()
    ? companyName.trim()
    : 'Company';
  const container = documentRef.createElement('div');
  const fallback = documentRef.createElement('span');
  const logoUrl = getCompanyLogoUrl(website);

  container.className = 'company-logo';
  fallback.className = 'company-logo-fallback';
  fallback.textContent = getCompanyInitials(accessibleName);
  fallback.setAttribute('role', 'img');
  fallback.setAttribute('aria-label', `${accessibleName} company initials`);
  container.append(fallback);

  if (!logoUrl) return container;

  const image = documentRef.createElement('img');
  let settled = false;

  image.className = 'company-logo-image';
  image.alt = `${accessibleName} company logo`;
  image.loading = 'lazy';
  image.decoding = 'async';
  image.referrerPolicy = 'no-referrer';
  image.hidden = true;

  image.addEventListener('load', () => {
    if (settled) return;
    settled = true;
    image.hidden = false;
    fallback.hidden = true;
  }, { once: true });

  image.addEventListener('error', () => {
    if (settled) return;
    settled = true;
    image.removeAttribute('src');
    image.hidden = true;
    fallback.hidden = false;
  }, { once: true });

  image.src = logoUrl;
  container.prepend(image);
  return container;
}
