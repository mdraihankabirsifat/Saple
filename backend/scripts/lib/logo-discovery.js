// Official company logo discovery, as pure helpers the importer and its tests
// share. Nothing here touches the network, the database or storage.
//
// The company's stored website is the identity anchor. Candidates come only
// from that site's own home page, in this confidence order:
//   1. schema.org JSON-LD Organization.logo
//   2. an image in the site header or brand link whose name says "logo"
//   3. an OpenGraph image, only when its address itself says "logo"
//   4. apple-touch-icon
//   5. a PNG/SVG site icon (a favicon-only fallback)
// Hero banners, product or office photos, article thumbnails and arbitrary
// social images are never chosen. A wrong logo is worse than initials.

const ORGANIZATION_TYPES = new Set([
  'organization', 'corporation', 'localbusiness', 'company', 'ngo', 'educationalorganization',
  'governmentorganization', 'bank', 'bankorcreditunion', 'financialservice', 'airline', 'newsmediaorganization'
]);

// Common two-part public suffixes, so example.com.bd is compared as one site.
const SECOND_LEVEL_SUFFIXES = new Set([
  'com.bd', 'org.bd', 'net.bd', 'edu.bd', 'gov.bd', 'ac.bd', 'co.uk', 'org.uk', 'ac.uk', 'co.in', 'co.jp', 'co.kr',
  'com.au', 'com.sg', 'com.my', 'co.za', 'com.br', 'com.cn'
]);

// Images that say "logo" but are someone else's: social networks, app
// stores, payment brands, partners, clients, customers, awards and badges.
const NOT_OUR_LOGO = /(twitter|facebook|linkedin|instagram|youtube|whatsapp|tiktok|pinterest|telegram|google-?play|app-?store|play-?store|visa|mastercard|amex|paypal|payment|partner|client|customer|award|certif|badge|sponsor|iso-?\d|member)/i;

function decodeEntities(value) {
  return String(value || '')
    .replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').trim();
}

// The site a host belongs to: the last two labels, or three for known
// country second-level suffixes.
function registrableDomain(host) {
  const labels = String(host || '').toLowerCase().replace(/\.$/, '').split('.').filter(Boolean);
  if (labels.length <= 2) return labels.join('.');
  const lastTwo = labels.slice(-2).join('.');
  return SECOND_LEVEL_SUFFIXES.has(lastTwo) ? labels.slice(-3).join('.') : lastTwo;
}

function sameSite(hostA, hostB) {
  return Boolean(hostA && hostB) && registrableDomain(hostA) === registrableDomain(hostB);
}

// The website field as an https URL, or null when it is not a usable site.
function normalizeWebsite(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const raw = value.trim();
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    if (!/\./.test(url.hostname) || /^(localhost|\d+\.\d+\.\d+\.\d+)$/.test(url.hostname)) return null;
    // Reserved names (RFC 2606) belong to the fictional demo companies.
    if (/\.(example|invalid|test|localhost)$/i.test(url.hostname)) return null;
    url.protocol = 'https:';
    url.hash = '';
    return url.href;
  } catch {
    return null;
  }
}

function resolveUrl(value, base) {
  const text = decodeEntities(value);
  if (!text || /^(data|javascript|blob):/i.test(text)) return null;
  try {
    const url = new URL(text, base);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function attributes(tag) {
  const result = {};
  for (const match of tag.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
    result[match[1].toLowerCase()] = match[3] ?? match[4] ?? match[5] ?? '';
  }
  return result;
}

function jsonLdLogos(html, base) {
  const found = [];
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    const types = [].concat(node['@type'] || []).map((type) => String(type).toLowerCase());
    if (types.some((type) => ORGANIZATION_TYPES.has(type)) && node.logo) {
      const logo = typeof node.logo === 'string' ? node.logo : node.logo.url || node.logo.contentUrl || node.logo['@id'];
      const url = resolveUrl(logo, base);
      if (url) found.push(url);
    }
    if (node['@graph']) visit(node['@graph']);
    if (node.publisher) visit(node.publisher);
  };
  for (const match of html.matchAll(/<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { visit(JSON.parse(match[1].trim())); } catch { /* A malformed block is skipped. */ }
  }
  return found;
}

// Images in the page header, or inside the home/brand link, whose own name
// says "logo". Content images further down the page are not considered.
function headerLogos(html, base, companyName) {
  const headerHtml = (html.match(/<header[\s\S]*?<\/header>/i) || [''])[0];
  const brandLinks = [...html.matchAll(/<a\b[^>]*(?:class|id)\s*=\s*["'][^"']*(?:logo|brand)[^"']*["'][^>]*>[\s\S]*?<\/a>/gi)].map((m) => m[0]).join('\n');
  const scope = `${headerHtml}\n${brandLinks}`;
  const name = String(companyName || '').toLowerCase().split(/\s+/)[0];
  const found = [];
  for (const match of scope.matchAll(/<img\b[^>]*>/gi)) {
    const attrs = attributes(match[0]);
    const src = attrs.src || attrs['data-src'] || (attrs.srcset || '').split(/[\s,]+/)[0];
    const label = `${attrs.class || ''} ${attrs.id || ''} ${attrs.alt || ''} ${src || ''}`.toLowerCase();
    if (!/logo/.test(label) && !(name && (attrs.alt || '').toLowerCase().includes(name))) continue;
    if (NOT_OUR_LOGO.test(label)) continue;
    const url = resolveUrl(src, base);
    if (url) found.push(url);
  }
  return found;
}

function metaLogos(html, base) {
  const found = [];
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = attributes(match[0]);
    const key = (attrs.property || attrs.name || '').toLowerCase();
    if (!['og:image', 'og:logo', 'twitter:image'].includes(key)) continue;
    const url = resolveUrl(attrs.content, base);
    // A social image is a banner unless its own address says it is the logo.
    if (url && (key === 'og:logo' || /logo/i.test(new URL(url).pathname))) found.push(url);
  }
  return found;
}

function iconLinks(html, base) {
  const apple = [];
  const icons = [];
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const attrs = attributes(match[0]);
    const rel = (attrs.rel || '').toLowerCase();
    const url = resolveUrl(attrs.href, base);
    if (!url) continue;
    if (rel.includes('apple-touch-icon')) apple.push(url);
    else if (/(^|\s)icon(\s|$)/.test(rel) && /\.(png|svg|webp)(\?|$)/i.test(url)) {
      const size = Math.max(0, ...String(attrs.sizes || '').split(/\s+/).map((part) => Number(part.split('x')[0]) || 0));
      icons.push({ url, size });
    }
  }
  icons.sort((a, b) => b.size - a.size);
  return { apple, icons: icons.map((icon) => icon.url) };
}

// Every candidate in confidence order, each with how it was found and whether
// it is hosted on the official site. Duplicates are dropped.
function extractCandidates(html, pageUrl, companyName) {
  const { apple, icons } = iconLinks(html, pageUrl);
  const ordered = [
    ...jsonLdLogos(html, pageUrl).map((url) => ({ url, method: 'JSONLD_ORGANIZATION_LOGO' })),
    ...headerLogos(html, pageUrl, companyName).map((url) => ({ url, method: 'HEADER_LOGO' })),
    ...metaLogos(html, pageUrl).map((url) => ({ url, method: 'OPENGRAPH_LOGO' })),
    ...apple.map((url) => ({ url, method: 'APPLE_TOUCH_ICON' })),
    ...icons.map((url) => ({ url, method: 'SITE_ICON' }))
  ];
  const seen = new Set();
  const pageHost = new URL(pageUrl).hostname;
  return ordered.filter((candidate) => {
    if (seen.has(candidate.url)) return false;
    let assetPath = new URL(candidate.url).pathname;
    try { assetPath = decodeURIComponent(assetPath); } catch { /* Keep the raw path. */ }
    if (candidate.method !== 'SITE_ICON' && candidate.method !== 'APPLE_TOUCH_ICON' && NOT_OUR_LOGO.test(assetPath)) return false;
    seen.add(candidate.url);
    // Assets on another domain are accepted only because this official page
    // itself references them; the report flags them for review.
    candidate.officialHost = sameSite(new URL(candidate.url).hostname, pageHost);
    candidate.faviconOnly = candidate.method === 'SITE_ICON';
    return true;
  });
}

// What the bytes are, from their signature, never from the server's label.
function sniffImage(buffer) {
  if (!buffer || buffer.length < 12) return null;
  if (buffer[0] === 0x89 && buffer.toString('latin1', 1, 4) === 'PNG') return 'png';
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpeg';
  if (buffer.toString('latin1', 0, 4) === 'RIFF' && buffer.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  const head = buffer.toString('utf8', 0, Math.min(buffer.length, 1024)).replace(/^﻿/, '').trimStart().toLowerCase();
  if ((head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'))) && !head.includes('<html')) return 'svg';
  return null;
}

function slugify(name) {
  return String(name || '').normalize('NFKD').replace(/[^\w\s-]/g, '').trim().toLowerCase().replace(/[\s_-]+/g, '-').slice(0, 60) || 'company';
}

module.exports = {
  registrableDomain, sameSite, normalizeWebsite, resolveUrl, extractCandidates, sniffImage, slugify
};
