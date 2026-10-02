#!/usr/bin/env node
//
// Official company logo import.
//
//   node backend/scripts/import-company-logos.js --dry-run     (review first)
//   node backend/scripts/import-company-logos.js               (after approval)
//   options: --company <id>   only one company
//            --limit <n>      at most n companies
//
// For every company without a working logo it visits the company's own
// website (the stored `website` field is the identity anchor), finds the most
// trustworthy logo the site itself publishes, checks the bytes are a real
// image, normalises it to a WebP inside 512x512 without stretching, cropping
// or recolouring, uploads a copy to the Company_logos bucket at the existing
// path convention (companies/<id>/logo) and points that company's logo_path at
// it. Companies that already have a working logo are skipped; nothing is ever
// deleted. When no reliable logo is found the initials fallback stays.
//
// A dry run reads only: it never uploads, updates a row or deletes anything.
// Both modes write the audit table database/company_logo_sources.md. The
// script runs from a trusted machine with backend/.env; no secret is printed.

const fs = require('node:fs');
const path = require('node:path');
const discovery = require('./lib/logo-discovery');

const STATUS = Object.freeze({
  ALREADY_PRESENT: 'ALREADY PRESENT',
  FOUND: 'FOUND',
  NO_RELIABLE_LOGO: 'NO RELIABLE LOGO',
  AMBIGUOUS: 'AMBIGUOUS',
  DOWNLOAD_FAILED: 'DOWNLOAD FAILED',
  UPLOAD_FAILED: 'UPLOAD FAILED'
});

const PAGE_LIMIT_BYTES = 6 * 1024 * 1024;
const IMAGE_LIMIT_BYTES = 3 * 1024 * 1024;
const TIMEOUT_MS = 12000;
const USER_AGENT = 'SapleLogoImporter/1.0 (+https://github.com/mdraihankabirsifat/Saple)';
const REPORT_PATH = path.resolve(__dirname, '../../database/company_logo_sources.md');

function logoPathFor(companyId) {
  // The same object key the representative upload already uses.
  return `companies/${companyId}/logo`;
}

async function fetchLimited(fetchImpl, url, { accept, limit }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, Accept: accept }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const declared = Number(response.headers.get('content-length') || 0);
    if (declared > limit) throw new Error('Too large');
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > limit) throw new Error('Too large');
    return { buffer, finalUrl: response.url || url, contentType: response.headers.get('content-type') || '' };
  } finally {
    clearTimeout(timer);
  }
}

// The site's own name for itself, used to make sure the website really is
// this company before trusting anything it serves.
function identityMatches(companyName, finalUrl, html) {
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '';
  const siteName = (html.match(/property\s*=\s*["']og:site_name["'][^>]*content\s*=\s*["']([^"']+)/i) || [])[1] || '';
  const host = discovery.registrableDomain(new URL(finalUrl).hostname).replace(/[^a-z0-9]/g, '');
  const haystack = `${host} ${title} ${siteName}`.toLowerCase().replace(/[^a-z0-9 ]/g, '');
  const tokens = String(companyName).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
    .filter((token) => token.length >= 3 && !['ltd', 'limited', 'group', 'the', 'and', 'bangladesh', 'company'].includes(token));
  return tokens.length === 0 || tokens.some((token) => haystack.includes(token) || host.includes(token));
}

async function normalizeImage(sharp, buffer, kind) {
  const input = sharp(buffer, kind === 'svg' ? { density: 300 } : {});
  const meta = await input.metadata();
  const width = meta.width || 0;
  const height = meta.height || 0;
  if (kind !== 'svg') {
    if (Math.min(width, height) < 32) throw new Error('Image is too small to be a usable logo');
    if (Math.max(width, height) > 4000) throw new Error('Image is too large to be a logo');
  }
  if (width && height && Math.max(width / height, height / width) > 10) throw new Error('Unusual proportions for a logo');
  // Fit inside 512x512 without enlarging, stretching or cropping. SVG is
  // rasterised here, so no SVG markup is ever stored or served.
  return input
    .resize({ width: 512, height: 512, fit: 'inside', withoutEnlargement: kind !== 'svg' })
    .webp({ quality: 90, alphaQuality: 100, effort: 4 })
    .toBuffer();
}

// Decide and, unless this is a dry run, import one company's logo.
async function processCompany(company, deps) {
  const result = {
    companyId: company.companyId,
    companyName: company.companyName,
    website: company.website || '',
    status: STATUS.NO_RELIABLE_LOGO,
    method: '',
    sourceUrl: '',
    faviconOnly: false,
    note: ''
  };

  if (company.logoPath) {
    if (await deps.logoIsValid(company.logoPath)) return { ...result, status: STATUS.ALREADY_PRESENT };
    result.note = 'Stored logo is missing or broken; looking for a replacement';
  }

  const site = discovery.normalizeWebsite(company.website);
  if (!site) return { ...result, note: 'No usable official website' };

  let page;
  try {
    page = await fetchLimited(deps.fetch, site, { accept: 'text/html,application/xhtml+xml', limit: PAGE_LIMIT_BYTES });
  } catch (error) {
    return { ...result, status: STATUS.DOWNLOAD_FAILED, note: `Website could not be read (${error.message})` };
  }
  if (!/html/i.test(page.contentType)) return { ...result, note: 'Website did not return a page' };
  if (!discovery.sameSite(new URL(page.finalUrl).hostname, new URL(site).hostname)) {
    return { ...result, status: STATUS.AMBIGUOUS, note: `Website redirects to another domain (${new URL(page.finalUrl).hostname})` };
  }
  const html = page.buffer.toString('utf8');
  if (!identityMatches(company.companyName, page.finalUrl, html)) {
    return { ...result, status: STATUS.AMBIGUOUS, note: 'The website does not clearly identify as this company' };
  }

  const candidates = discovery.extractCandidates(html, page.finalUrl, company.companyName).slice(0, 8);
  if (!candidates.length) return { ...result, note: 'The website publishes no identifiable logo' };

  let downloadFailures = 0;
  for (const candidate of candidates) {
    // A favicon alone is not reliable company branding for the live directory.
    // Keep it visible in the dry-run report, but never import it as a logo.
    if (!deps.dryRun && candidate.faviconOnly) continue;
    let image;
    try {
      image = await fetchLimited(deps.fetch, candidate.url, { accept: 'image/png,image/jpeg,image/webp,image/svg+xml', limit: IMAGE_LIMIT_BYTES });
    } catch {
      downloadFailures += 1;
      continue;
    }
    // The bytes decide what this is; an HTML page with an image name is not one.
    const kind = discovery.sniffImage(image.buffer);
    if (!kind) continue;
    let normalized;
    try {
      normalized = await normalizeImage(deps.sharp, image.buffer, kind);
    } catch {
      continue;
    }
    const found = {
      ...result,
      status: STATUS.FOUND,
      method: candidate.method,
      sourceUrl: candidate.url,
      faviconOnly: candidate.faviconOnly,
      note: [result.note, candidate.officialHost ? '' : 'Asset hosted off the official domain but referenced by it',
        candidate.faviconOnly ? 'Favicon-only fallback' : ''].filter(Boolean).join('; '),
      bytes: normalized.length
    };
    if (deps.dryRun) return found;

    const objectPath = logoPathFor(company.companyId);
    try {
      await deps.upload(objectPath, normalized);
    } catch {
      return { ...found, status: STATUS.UPLOAD_FAILED, note: 'Upload to storage failed' };
    }
    const updated = await deps.updateLogoPath(company.companyId, objectPath, company.logoPath || null);
    if (!updated) return { ...found, status: STATUS.ALREADY_PRESENT, note: 'A logo was set meanwhile; it was kept' };
    return found;
  }
  return downloadFailures === candidates.length
    ? { ...result, status: STATUS.DOWNLOAD_FAILED, note: 'Every logo candidate failed to download' }
    : { ...result, note: 'No candidate was a valid logo image' };
}

function writeReport(results, { dryRun }) {
  const escape = (value) => String(value || '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
  const lines = [
    '# Company logo sources',
    '',
    dryRun
      ? '_Dry run: nothing was uploaded and no company row was changed._'
      : '_Import run: FOUND rows were uploaded to the Company_logos bucket at `companies/<id>/logo`._',
    '',
    'The live site always serves the stored copy in Supabase Storage. The source address below is kept only to audit',
    'where each logo came from. Generated by `backend/scripts/import-company-logos.js`.',
    '',
    '| Company | Official website | Discovered logo source | Discovery method | Result |',
    '|---|---|---|---|---|',
    ...results.map((row) => `| ${escape(row.companyName)} | ${escape(row.website)} | ${escape(row.sourceUrl) || '—'} | ${escape(row.method) || '—'} | ${escape(row.status)}${row.note ? ` (${escape(row.note)})` : ''} |`)
  ];
  fs.writeFileSync(REPORT_PATH, `${lines.join('\n')}\n`);
}

function summarize(results) {
  const count = (predicate) => results.filter(predicate).length;
  return {
    totalCompanies: results.length,
    alreadyHadLogo: count((row) => row.status === STATUS.ALREADY_PRESENT),
    confidentCandidate: count((row) => row.status === STATUS.FOUND && !row.faviconOnly),
    faviconOnlyFallback: count((row) => row.status === STATUS.FOUND && row.faviconOnly),
    ambiguous: count((row) => row.status === STATUS.AMBIGUOUS),
    noReliableCandidate: count((row) => row.status === STATUS.NO_RELIABLE_LOGO),
    failed: count((row) => row.status === STATUS.DOWNLOAD_FAILED || row.status === STATUS.UPLOAD_FAILED)
  };
}

async function mapLimit(items, limit, work) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await work(items[index]);
    }
  }));
  return results;
}

async function main(argv = process.argv.slice(2)) {
  require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });
  const dryRun = argv.includes('--dry-run');
  const option = (name) => { const index = argv.indexOf(name); return index >= 0 ? argv[index + 1] : null; };
  const onlyCompany = option('--company') ? Number(option('--company')) : null;
  const limit = option('--limit') ? Number(option('--limit')) : null;

  let sharp;
  try { sharp = require('sharp'); } catch {
    console.error('The image library "sharp" is not installed. Run: npm install --prefix backend');
    return 1;
  }
  const database = require('../config/database');
  const storage = require('../config/supabase-storage');
  await database.initializePool();

  try {
    const rows = (await database.query(`
      SELECT company_id AS "companyId", company_name AS "companyName", website, logo_path AS "logoPath"
      FROM companies
      WHERE ($1::bigint IS NULL OR company_id = $1)
      ORDER BY company_id
      LIMIT $2
    `, [onlyCompany, limit || null])).rows;

    const deps = {
      dryRun,
      sharp,
      fetch: (url, init) => fetch(url, init),
      logoIsValid: async (logoPath) => {
        const url = storage.publicUrl('logo', logoPath);
        if (!url) return true; // Storage not configured here: keep what is stored.
        try {
          const response = await fetch(url, { method: 'GET', headers: { 'User-Agent': USER_AGENT } });
          return response.ok && /^image\//i.test(response.headers.get('content-type') || '');
        } catch {
          return true;
        }
      },
      upload: (objectPath, buffer) => storage.upload('logo', objectPath, { buffer, mimetype: 'image/webp' }),
      // Only this company's row, and only if no other logo was set meanwhile.
      updateLogoPath: async (companyId, objectPath, expectedPath) => {
        const result = await database.withTransaction((client) => client.query(`
          UPDATE companies SET logo_path = $1, updated_at = CURRENT_TIMESTAMP
          WHERE company_id = $2 AND logo_path IS NOT DISTINCT FROM $3
        `, [objectPath, companyId, expectedPath]));
        return result.rowCount === 1;
      }
    };

    console.log(`${dryRun ? 'Dry run' : 'Import'}: checking ${rows.length} compan${rows.length === 1 ? 'y' : 'ies'}...`);
    const results = await mapLimit(rows, 6, async (company) => {
      try {
        return await processCompany(company, deps);
      } catch (error) {
        // One company's problem never stops the others.
        return { companyId: company.companyId, companyName: company.companyName, website: company.website || '',
          status: STATUS.DOWNLOAD_FAILED, method: '', sourceUrl: '', faviconOnly: false, note: 'Unexpected error' };
      }
    });
    writeReport(results, { dryRun });
    console.log(JSON.stringify(summarize(results), null, 2));
    console.log(`Audit table written to ${path.relative(process.cwd(), REPORT_PATH)}`);
    return 0;
  } finally {
    await database.closePool().catch(() => {});
  }
}

if (require.main === module) {
  main().then((code) => { process.exitCode = code; }).catch((error) => {
    console.error(`Logo import stopped: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { STATUS, main, processCompany, normalizeImage, identityMatches, logoPathFor, summarize, writeReport };
