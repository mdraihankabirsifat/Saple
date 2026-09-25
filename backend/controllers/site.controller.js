const securityConfig = require('../config/security');
// robots.txt, sitemap.xml, the X-Robots-Tag header and the page tests all read
// the same classification, so they cannot disagree about what is public.
const { PUBLIC_PAGES, DISALLOWED_PATHS } = require('../config/pages');

// The site's own origin, taken from the request that asked for the file, so
// robots.txt and sitemap.xml are correct on localhost and on any new domain
// without the owner editing a hard-coded host.
function requestOrigin(request) {
  const host = request.get('host');
  const protocol = securityConfig.isHttpsRequest(request) ? 'https' : 'http';
  try {
    const url = new URL(`${protocol}://${host}`);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    return url.origin;
  } catch (error) {
    return null;
  }
}

function getRobots(request, response) {
  const origin = requestOrigin(request);
  const lines = [
    '# Saple - an independent BUET CSE academic project for company and career insights.',
    'User-agent: *',
    ...DISALLOWED_PATHS.map((path) => `Disallow: ${path}`),
    'Allow: /',
    ''
  ];

  if (origin) lines.push(`Sitemap: ${origin}/sitemap.xml`, '');

  response.type('text/plain; charset=utf-8');
  return response.status(200).send(lines.join('\n'));
}

function getSitemap(request, response) {
  const origin = requestOrigin(request);
  if (!origin) return response.status(404).type('text/plain').send('Not found');

  const entries = PUBLIC_PAGES.map((page) => [
    '  <url>',
    `    <loc>${origin}${page.path}</loc>`,
    `    <changefreq>${page.changefreq}</changefreq>`,
    `    <priority>${page.priority}</priority>`,
    '  </url>'
  ].join('\n')).join('\n');

  response.type('application/xml; charset=utf-8');
  return response.status(200).send([
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    entries,
    '</urlset>',
    ''
  ].join('\n'));
}

// A security contact is only published when the owner has configured one.
// Saple never invents an address or publishes a private one by default.
function getSecurityTxt(request, response) {
  const origin = requestOrigin(request);
  const configuredContact = process.env.SECURITY_CONTACT?.trim();
  const lines = [
    '# Saple - an independent BUET CSE academic project.',
    '# Saple is not affiliated with, endorsed by, or an official service of any listed company.'
  ];

  if (configuredContact && /^(mailto:|https:)/.test(configuredContact) && configuredContact.length <= 200) {
    lines.push(`Contact: ${configuredContact}`);
  } else {
    lines.push(
      '# No security contact has been configured for this deployment yet.',
      '# The owner sets the SECURITY_CONTACT environment variable to a',
      '# mailto: or https: address, and this file then publishes it.',
      '# Until then, report issues through the repository linked on the About page.'
    );
  }

  lines.push('Preferred-Languages: en', `Expires: ${expiryTimestamp()}`);
  if (origin) lines.push(`Policy: ${origin}/security.html`);
  lines.push('');

  response.type('text/plain; charset=utf-8');
  return response.status(200).send(lines.join('\n'));
}

// security.txt requires an expiry; one year ahead, recomputed on each request.
function expiryTimestamp() {
  const expiry = new Date();
  expiry.setUTCFullYear(expiry.getUTCFullYear() + 1);
  expiry.setUTCMilliseconds(0);
  return expiry.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

module.exports = {
  PUBLIC_PAGES,
  DISALLOWED_PATHS,
  requestOrigin,
  getRobots,
  getSitemap,
  getSecurityTxt
};
