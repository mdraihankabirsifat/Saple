// A small, dependency-free PDF writer for generated resumes.
//
// It uses the two standard PDF fonts every reader has (Helvetica and
// Helvetica-Bold) with WinAnsi encoding, so there is nothing to embed, no file
// system access and nothing that would not run on Cloudflare Workers. Text is
// written as text, wrapped and paginated here. Characters outside WinAnsi
// (for example Bengali script) cannot be drawn by the standard fonts; they are
// transliterated where possible and otherwise replaced with "?".

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 54;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

// Helvetica advance widths (1/1000 em) for codes 32-126, from the standard AFM.
const HELVETICA = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584
];

const WIN_ANSI_SPECIALS = new Map([
  ['€', 0x80], ['‚', 0x82], ['„', 0x84], ['…', 0x85], ['‘', 0x91], ['’', 0x92],
  ['“', 0x93], ['”', 0x94], ['•', 0x95], ['–', 0x96], ['—', 0x97], ['™', 0x99]
]);

const COLORS = {
  ink: [0.09, 0.13, 0.11],
  heading: [0.12, 0.42, 0.31],
  muted: [0.36, 0.41, 0.38],
  rule: [0.8, 0.79, 0.72]
};

// String -> WinAnsi byte codes. Taka is written as "Tk", accented letters
// keep their Latin-1 form, anything else is reduced to plain letters or "?".
function toWinAnsi(text) {
  const codes = [];
  for (const char of String(text).replace(/৳/g, 'Tk')) {
    const code = char.codePointAt(0);
    if (code >= 32 && code <= 126) codes.push(code);
    else if (code >= 0xa0 && code <= 0xff) codes.push(code);
    else if (WIN_ANSI_SPECIALS.has(char)) codes.push(WIN_ANSI_SPECIALS.get(char));
    else if (char === '\t' || char === '\n') codes.push(32);
    else {
      const plain = char.normalize('NFKD').replace(/[̀-ͯ]/g, '');
      if (/^[\x20-\x7e]+$/.test(plain)) for (const part of plain) codes.push(part.charCodeAt(0));
      else codes.push(63);
    }
  }
  return codes;
}

function width(codes, size, bold) {
  const units = codes.reduce((sum, code) => sum + (code >= 32 && code <= 126 ? HELVETICA[code - 32] : 556), 0);
  return (units / 1000) * size * (bold ? 1.07 : 1);
}

function wrap(text, size, bold, maxWidth) {
  const words = String(text || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (width(toWinAnsi(candidate), size, bold) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    // A single word wider than the line is split by characters.
    let rest = word;
    while (width(toWinAnsi(rest), size, bold) > maxWidth && rest.length > 1) {
      let cut = rest.length - 1;
      while (cut > 1 && width(toWinAnsi(rest.slice(0, cut)), size, bold) > maxWidth) cut -= 1;
      lines.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    current = rest;
  }
  if (current) lines.push(current);
  return lines;
}

function pdfString(codes) {
  let out = '(';
  for (const code of codes) {
    if (code === 0x28 || code === 0x29 || code === 0x5c) out += `\\${String.fromCharCode(code)}`;
    else if (code < 32 || code > 126) out += `\\${code.toString(8).padStart(3, '0')}`;
    else out += String.fromCharCode(code);
  }
  return `${out})`;
}

function color([r, g, b], operator) {
  return `${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} ${operator}`;
}

// Lays out blocks of text into pages of PDF drawing operations.
class Layout {
  constructor() {
    this.pages = [];
    this.newPage();
  }

  newPage() {
    this.ops = [];
    this.pages.push(this.ops);
    this.y = PAGE_HEIGHT - MARGIN;
  }

  space(points) {
    this.y -= points;
  }

  ensure(height) {
    if (this.y - height < MARGIN) this.newPage();
  }

  text(value, { size = 10, bold = false, tone = COLORS.ink, indent = 0, hanging = 0, prefix = '' } = {}) {
    const leading = size * 1.38;
    const available = CONTENT_WIDTH - indent - hanging;
    const lines = wrap(value, size, bold, available);
    lines.forEach((line, index) => {
      this.ensure(leading);
      this.y -= leading;
      const x = MARGIN + indent + (index === 0 ? 0 : hanging);
      const content = index === 0 ? `${prefix}${line}` : line;
      this.ops.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${color(tone, 'rg')} ${x.toFixed(2)} ${this.y.toFixed(2)} Td ${pdfString(toWinAnsi(content))} Tj ET`);
    });
  }

  rule() {
    this.ensure(10);
    this.y -= 6;
    this.ops.push(`${color(COLORS.rule, 'RG')} 0.7 w ${MARGIN} ${this.y.toFixed(2)} m ${PAGE_WIDTH - MARGIN} ${this.y.toFixed(2)} l S`);
    this.y -= 4;
  }
}

function sectionHeading(layout, title) {
  // Keep a heading together with the first lines of its section.
  layout.ensure(80);
  layout.space(10);
  layout.text(title.toUpperCase(), { size: 10.5, bold: true, tone: COLORS.heading });
  layout.rule();
}

function dateRange(item) {
  return [item.start, item.end].filter(Boolean).join(' - ');
}

function bullets(layout, items) {
  for (const item of items || []) layout.text(item, { size: 10, indent: 10, hanging: 10, prefix: '•  ' });
}

// The resume object has the same shape the generator returns.
function buildResumePdf(resume) {
  const layout = new Layout();
  if (resume.name) layout.text(resume.name, { size: 20, bold: true, tone: COLORS.ink });
  if (resume.headline) {
    layout.space(2);
    layout.text(resume.headline, { size: 11.5, tone: COLORS.muted });
  }
  if (resume.summary) {
    sectionHeading(layout, 'Summary');
    layout.text(resume.summary, { size: 10 });
  }
  if (resume.experience?.length) {
    sectionHeading(layout, 'Experience');
    resume.experience.forEach((item, index) => {
      if (index) layout.space(6);
      layout.ensure(40);
      layout.text([item.title, item.organization].filter(Boolean).join(' — '), { size: 11, bold: true });
      const meta = [item.location, dateRange(item)].filter(Boolean).join('  •  ');
      if (meta) layout.text(meta, { size: 9.5, tone: COLORS.muted });
      bullets(layout, item.highlights);
    });
  }
  if (resume.education?.length) {
    sectionHeading(layout, 'Education');
    resume.education.forEach((item, index) => {
      if (index) layout.space(6);
      layout.ensure(30);
      const heading = [item.degree, item.field].filter(Boolean).join(', ') || item.institution;
      layout.text(heading, { size: 11, bold: true });
      const meta = [item.degree || item.field ? item.institution : null, dateRange(item)].filter(Boolean).join('  •  ');
      if (meta) layout.text(meta, { size: 9.5, tone: COLORS.muted });
      if (item.details) layout.text(item.details, { size: 10 });
    });
  }
  if (resume.projects?.length) {
    sectionHeading(layout, 'Projects');
    resume.projects.forEach((item, index) => {
      if (index) layout.space(6);
      layout.ensure(30);
      layout.text(item.name, { size: 11, bold: true });
      if (item.description) layout.text(item.description, { size: 10 });
      bullets(layout, item.highlights);
    });
  }
  if (resume.skills?.length) {
    sectionHeading(layout, 'Skills');
    layout.text(resume.skills.join('  •  '), { size: 10 });
  }

  // Assemble the PDF: catalog, page tree, two standard fonts, then one page
  // and one content stream per page. Every byte is below 256, so string length
  // equals byte length and the cross-reference offsets are exact.
  const objects = [];
  const pageCount = layout.pages.length;
  const pageIds = layout.pages.map((_, index) => 5 + index * 2);
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageCount} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
  objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
  layout.pages.forEach((ops, index) => {
    const pageId = pageIds[index];
    const stream = ops.join('\n');
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] `
      + `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageId + 1} 0 R >>`;
    objects[pageId + 1] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });
  const infoId = objects.length;
  objects[infoId] = `<< /Title ${pdfString(toWinAnsi(resume.name ? `${resume.name} - Resume` : 'Resume'))} /Producer (Saple) >>`;

  let output = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
  const offsets = [];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = output.length;
    output += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xrefOffset = output.length;
  output += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1) output += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`;
  output += `trailer\n<< /Size ${objects.length} /Root 1 0 R /Info ${infoId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(output, 'latin1');
}

module.exports = { buildResumePdf, toWinAnsi, wrap };
