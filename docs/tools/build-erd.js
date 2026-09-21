#!/usr/bin/env node
// Builds the Saple ERD from the active PostgreSQL schema.
//
//   node docs/tools/build-erd.js
//
// It parses database/postgres/01_final_schema_postgres.sql, so the diagram can
// never describe tables, keys or relationships the database does not have.
// Outputs:
//   docs/ERD.html  - a self-contained SVG diagram (print it to get ERD.pdf)
//   docs/ERD.md    - a Mermaid erDiagram that GitHub renders natively
//
// ERD.pdf at the repository root is produced from docs/ERD.html by printing it
// with a browser; see the "Regenerating" section in docs/ERD.md.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const SCHEMA = path.join(ROOT, 'database', 'postgres', '01_final_schema_postgres.sql');

// ---------------------------------------------------------------------------
// 1. Parse the schema
// ---------------------------------------------------------------------------

function parseSchema(sql) {
  const tables = new Map();

  for (const match of sql.matchAll(/^CREATE TABLE (\w+) \(\n([\s\S]*?)\n\);/gm)) {
    const [, name, body] = match;
    const columns = [];
    const primaryKey = [];
    const uniqueKeys = [];
    const foreignKeys = [];

    const lines = body.split('\n');
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const column = line.match(/^ {4}(\w+)\s+([A-Z]+(?:\(\d+(?:,\d+)?\))?)(.*)$/);
      if (column && column[1] !== 'CONSTRAINT') {
        columns.push({
          name: column[1],
          type: column[2],
          nullable: !/NOT NULL/.test(column[3])
        });
        continue;
      }

      const pk = line.match(/CONSTRAINT \w+ PRIMARY KEY \(([^)]+)\)/);
      if (pk) primaryKey.push(...pk[1].split(',').map((part) => part.trim()));

      const uk = line.match(/CONSTRAINT \w+ UNIQUE \(([^)]+)\)/);
      if (uk) uniqueKeys.push(uk[1].split(',').map((part) => part.trim()));

      const fk = line.match(/CONSTRAINT (\w+) FOREIGN KEY \((\w+)\)/);
      if (fk) {
        const reference = `${line} ${lines[index + 1] || ''}`.match(
          /REFERENCES (\w+) \((\w+)\)(?:\s+ON DELETE (CASCADE|RESTRICT|SET NULL))?/
        );
        foreignKeys.push({
          name: fk[1],
          column: fk[2],
          references: reference[1],
          referencedColumn: reference[2],
          onDelete: reference[3] || 'NO ACTION'
        });
      }
    }

    // A primary-key column is NOT NULL even when the column line omits it,
    // as the subtype tables do (their PK is declared as a separate constraint).
    for (const column of columns) {
      if (primaryKey.includes(column.name)) column.nullable = false;
    }

    tables.set(name, { name, columns, primaryKey, uniqueKeys, foreignKeys });
  }

  // Partial unique indexes are real uniqueness rules too.
  for (const match of sql.matchAll(/CREATE UNIQUE INDEX (\w+)\s+ON (\w+) \(([^)]+)\)\s+WHERE ([^;]+);/g)) {
    const table = tables.get(match[2]);
    if (table) {
      table.partialUnique = {
        name: match[1],
        columns: match[3].split(',').map((part) => part.trim()),
        where: match[4].replace(/\s+/g, ' ').trim()
      };
    }
  }

  const views = [];
  for (const match of sql.matchAll(/CREATE OR REPLACE VIEW (\w+) AS([\s\S]*?);/g)) {
    const sources = [...match[2].matchAll(/(?:FROM|JOIN) (\w+)/g)].map((item) => item[1]);
    views.push({ name: match[1], sources: [...new Set(sources)] });
  }

  return { tables, views };
}

// ---------------------------------------------------------------------------
// 2. Relationship semantics
// ---------------------------------------------------------------------------

// Columns that record *who acted* reference users. Drawn as tags rather than
// lines, which would otherwise turn users into an unreadable hub.
const ACTOR_COLUMNS = new Set([
  'reviewed_by', 'approved_by', 'revoked_by', 'resolved_by', 'moderator_user_id',
  'actor_user_id', 'created_by', 'created_by_user_id'
]);

function relationships(tables) {
  const result = [];
  for (const table of tables.values()) {
    for (const fk of table.foreignKeys) {
      const column = table.columns.find((item) => item.name === fk.column);
      const isPk = table.primaryKey.length === 1 && table.primaryKey[0] === fk.column;
      const isUnique = table.uniqueKeys.some((key) => key.length === 1 && key[0] === fk.column);
      result.push({
        child: table.name,
        column: fk.column,
        parent: fk.references,
        onDelete: fk.onDelete,
        optional: column?.nullable === true,
        // A PK/FK or FK/UK column allows at most one child per parent.
        oneToOne: isPk || isUnique,
        actor: ACTOR_COLUMNS.has(fk.column) && fk.references === 'users'
      });
    }
  }
  return result;
}

function keyFlags(table, columnName) {
  const flags = [];
  if (table.primaryKey.includes(columnName)) flags.push('PK');
  if (table.foreignKeys.some((fk) => fk.column === columnName)) flags.push('FK');
  if (table.uniqueKeys.some((key) => key.includes(columnName))) flags.push('UK');
  if (table.partialUnique?.columns.includes(columnName)) flags.push('UK*');
  return flags;
}

// ---------------------------------------------------------------------------
// 3. Layout: domain columns, stacked top to bottom
// ---------------------------------------------------------------------------

const DOMAINS = [
  { title: 'Accounts', tone: 'account', tables: ['users', 'employees', 'password_reset_tokens', 'notifications'] },
  { title: 'Verification and representatives', tone: 'trust', tables: ['employment_verifications', 'company_representatives', 'representative_assignment_actions'] },
  { title: 'Company reference', tone: 'reference', tables: ['companies', 'job_roles', 'benefits', 'company_benefits'] },
  { title: 'Contributions', tone: 'content', tables: ['submissions', 'salary_submissions', 'company_reviews', 'interview_experiences'] },
  { title: 'Moderation and announcements', tone: 'audit', tables: ['reports', 'moderation_actions', 'announcements'] },
  { title: 'Jobs and applications', tone: 'jobs', tables: ['job_postings', 'job_applications', 'job_application_status_history'] }
];

const BOX_WIDTH = 330;
const COLUMN_GAP = 120;
const HEADER = 38;
const ROW = 19;
const STACK_GAP = 46;
const TOP = 190;
const LEFT = 50;

function layout(tables) {
  const positions = new Map();
  let bottom = 0;

  DOMAINS.forEach((domain, columnIndex) => {
    let y = TOP;
    const x = LEFT + columnIndex * (BOX_WIDTH + COLUMN_GAP);
    for (const name of domain.tables) {
      const table = tables.get(name);
      if (!table) throw new Error(`Layout names a table the schema does not have: ${name}`);
      const height = HEADER + table.columns.length * ROW + 10;
      positions.set(name, { x, y, width: BOX_WIDTH, height, tone: domain.tone });
      y += height + STACK_GAP;
    }
    bottom = Math.max(bottom, y);
  });

  const placed = new Set(DOMAINS.flatMap((domain) => domain.tables));
  const missing = [...tables.keys()].filter((name) => !placed.has(name));
  if (missing.length) throw new Error(`Tables missing from the layout: ${missing.join(', ')}`);

  return { positions, bottom, width: LEFT * 2 + DOMAINS.length * BOX_WIDTH + (DOMAINS.length - 1) * COLUMN_GAP };
}

// ---------------------------------------------------------------------------
// 4. SVG rendering
// ---------------------------------------------------------------------------

const escape = (value) => String(value)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function rowY(position, table, columnName) {
  const index = table.columns.findIndex((column) => column.name === columnName);
  return position.y + HEADER + index * ROW + ROW / 2 + 4;
}

// Child end: how many children one parent may have (0..1 or 0..*).
// Parent end: how many parents one child row has (exactly 1, or 0..1 when the
// foreign key is nullable).
function relationshipPath(relation, d) {
  const childMarker = relation.oneToOne ? 'child-zero-one' : 'child-zero-many';
  const parentMarker = relation.optional ? 'parent-zero-one' : 'parent-one';
  const restrict = relation.onDelete === 'RESTRICT' ? ' rel-restrict' : '';
  return `<path class="rel${restrict}" d="${d}" marker-start="url(#${childMarker})" marker-end="url(#${parentMarker})"><title>${escape(`${relation.child}.${relation.column} → ${relation.parent} (ON DELETE ${relation.onDelete})`)}</title></path>`;
}

function renderRelationship(relation, tables, positions) {
  const child = positions.get(relation.child);
  const parent = positions.get(relation.parent);
  const startY = rowY(child, tables.get(relation.child), relation.column);
  const endY = parent.y + HEADER / 2;

  if (child.x === parent.x) {
    // Same column: loop out past the left edge.
    const bend = child.x - 44;
    return relationshipPath(relation, `M ${child.x} ${startY} C ${bend} ${startY}, ${bend} ${endY}, ${parent.x} ${endY}`);
  }

  const childIsLeft = child.x < parent.x;
  const startX = childIsLeft ? child.x + child.width : child.x;
  const endX = childIsLeft ? parent.x : parent.x + parent.width;
  const dx = Math.max(60, Math.abs(endX - startX) * 0.45);
  const c1 = childIsLeft ? startX + dx : startX - dx;
  const c2 = childIsLeft ? endX - dx : endX + dx;
  return relationshipPath(relation, `M ${startX} ${startY} C ${c1} ${startY}, ${c2} ${endY}, ${endX} ${endY}`);
}

function renderTable(table, position, relationsByColumn) {
  const parts = [];
  parts.push(`<g class="entity entity-${position.tone}" id="entity-${table.name}">`);
  parts.push(`<rect class="box" x="${position.x}" y="${position.y}" width="${position.width}" height="${position.height}" rx="10"/>`);
  parts.push(`<rect class="head" x="${position.x}" y="${position.y}" width="${position.width}" height="${HEADER}" rx="10"/>`);
  parts.push(`<rect class="head" x="${position.x}" y="${position.y + HEADER - 12}" width="${position.width}" height="12"/>`);
  // Long names are condensed to the box width rather than running past it.
  const label = table.name.toUpperCase();
  const fit = label.length > 26 ? ` textLength="${position.width - 28}" lengthAdjust="spacingAndGlyphs"` : '';
  parts.push(`<text class="entity-name" x="${position.x + 14}" y="${position.y + 25}"${fit}>${escape(label)}</text>`);

  table.columns.forEach((column, index) => {
    const y = position.y + HEADER + index * ROW + 16;
    const flags = keyFlags(table, column.name);
    const relation = relationsByColumn.get(`${table.name}.${column.name}`);
    const actorTag = relation?.actor ? ' → users' : '';
    const nameClass = flags.includes('PK') ? 'col col-pk' : 'col';
    parts.push(`<text class="flag" x="${position.x + 12}" y="${y}">${escape(flags.join(' '))}</text>`);
    parts.push(`<text class="${nameClass}" x="${position.x + 68}" y="${y}">${escape(column.name)}${column.nullable ? '' : ' *'}</text>`);
    parts.push(`<text class="type" x="${position.x + position.width - 12}" y="${y}" text-anchor="end">${escape(column.type)}${escape(actorTag)}</text>`);
  });

  parts.push('</g>');
  return parts.join('\n');
}

function renderSvg({ tables, views }, rels, geometry) {
  const { positions, bottom, width } = geometry;
  const relationsByColumn = new Map(rels.map((relation) => [`${relation.child}.${relation.column}`, relation]));
  const drawn = rels.filter((relation) => !relation.actor);
  const viewsTop = bottom + 10;
  const viewsHeight = 70 + views.length * 26;
  const height = viewsTop + viewsHeight + 50;

  const domainLabels = DOMAINS.map((domain, index) => {
    const x = LEFT + index * (BOX_WIDTH + COLUMN_GAP);
    return `<text class="domain domain-${domain.tone}" x="${x}" y="${TOP - 18}">${escape(domain.title.toUpperCase())}</text>`;
  }).join('\n');

  const viewRows = views.map((view, index) => {
    const y = viewsTop + 62 + index * 26;
    return `<text class="view-name" x="${LEFT + 20}" y="${y}">${escape(view.name)}</text>`
      + `<text class="view-src" x="${LEFT + 330}" y="${y}">reads ${escape(view.sources.join(', '))}</text>`;
  }).join('\n');

  const tableCount = tables.size;
  const viewCount = views.length;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="erd-title erd-desc">
<title id="erd-title">Saple PostgreSQL entity-relationship diagram</title>
<desc id="erd-desc">${tableCount} tables and ${viewCount} views of the active Saple PostgreSQL schema, grouped by domain, with primary, foreign and unique keys and crow's-foot cardinalities.</desc>
<defs>
  <marker id="child-zero-many" viewBox="0 0 28 20" refX="1" refY="10" markerWidth="22" markerHeight="16" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path d="M 16 10 L 2 2 M 16 10 L 2 18 M 16 10 L 2 10" class="mk"/><circle cx="22" cy="10" r="4" class="mk-open"/></marker>
  <marker id="child-zero-one" viewBox="0 0 28 20" refX="1" refY="10" markerWidth="22" markerHeight="16" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path d="M 8 2 L 8 18" class="mk"/><circle cx="20" cy="10" r="4" class="mk-open"/></marker>
  <marker id="parent-one" viewBox="0 0 20 20" refX="19" refY="10" markerWidth="16" markerHeight="16" orient="auto" markerUnits="userSpaceOnUse"><path d="M 6 2 L 6 18 M 12 2 L 12 18" class="mk"/></marker>
  <marker id="parent-zero-one" viewBox="0 0 28 20" refX="27" refY="10" markerWidth="22" markerHeight="16" orient="auto" markerUnits="userSpaceOnUse"><circle cx="8" cy="10" r="4" class="mk-open"/><path d="M 20 2 L 20 18" class="mk"/></marker>
</defs>
<rect class="canvas" x="0" y="0" width="${width}" height="${height}"/>
<text class="title" x="${LEFT}" y="70">Saple — PostgreSQL entity-relationship diagram</text>
<text class="subtitle" x="${LEFT}" y="104">Active schema: database/postgres/01_final_schema_postgres.sql · ${tableCount} tables · ${viewCount} views · generated from the schema file by docs/tools/build-erd.js</text>
<text class="subtitle" x="${LEFT}" y="130">Saple is an independent BUET CSE academic project. The Oracle 19c milestone diagram is preserved in docs/archive/.</text>
<g class="legend">
  <text x="${width - 760}" y="62">PK primary key · FK foreign key · UK unique key · UK* partial unique (open scope only) · * NOT NULL</text>
  <text x="${width - 760}" y="86">Crow's foot = many · bars = exactly one · circle = optional · thick line = ON DELETE RESTRICT</text>
  <text x="${width - 760}" y="110">"→ users" marks actor columns (who approved, reviewed, resolved or acted); drawn as tags for readability.</text>
</g>
${domainLabels}
<g class="rels">
${drawn.map((relation) => renderRelationship(relation, tables, positions)).join('\n')}
</g>
${[...tables.values()].map((table) => renderTable(table, positions.get(table.name), relationsByColumn)).join('\n')}
<g class="views">
  <rect class="views-box" x="${LEFT}" y="${viewsTop}" width="${width - LEFT * 2}" height="${viewsHeight}" rx="12"/>
  <text class="views-title" x="${LEFT + 20}" y="${viewsTop + 32}">VIEWS — derived, never stored; public views expose no account identity or private evidence</text>
  ${viewRows}
</g>
</svg>`;
}

function renderHtml(svg) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Saple PostgreSQL ERD</title>
<!-- Generated by docs/tools/build-erd.js from the PostgreSQL schema. Do not edit by hand. -->
<style>
  @page { size: 40in 22in landscape; margin: 0.3in; }
  html, body { margin: 0; background: #f6f8f6; }
  svg { width: 100%; height: auto; display: block; font-family: "Segoe UI", Arial, sans-serif; }
  .canvas { fill: #f6f8f6; }
  .title { font-size: 40px; font-weight: 800; fill: #123c2d; }
  .subtitle { font-size: 17px; fill: #4d6158; }
  .legend text { font-size: 15px; fill: #34463d; }
  .domain { font-size: 14px; font-weight: 800; letter-spacing: 0.12em; }
  .box { fill: #ffffff; stroke: #b9c9c0; stroke-width: 1.5; }
  .head { stroke: none; }
  .entity-name { font-size: 16px; font-weight: 800; fill: #ffffff; letter-spacing: 0.02em; }
  .flag { font-size: 11px; font-weight: 800; fill: #8a6116; }
  .col { font-size: 13px; fill: #1d2924; }
  .col-pk { font-weight: 800; text-decoration: underline; }
  .type { font-size: 11.5px; fill: #6b7c73; font-family: Consolas, "Courier New", monospace; }
  .entity-account .head { fill: #1f6b4d; }   .domain-account { fill: #1f6b4d; }
  .entity-trust .head { fill: #6b4f9a; }     .domain-trust { fill: #6b4f9a; }
  .entity-reference .head { fill: #2f6d86; } .domain-reference { fill: #2f6d86; }
  .entity-content .head { fill: #8a5a1f; }   .domain-content { fill: #8a5a1f; }
  .entity-audit .head { fill: #8a3a3a; }     .domain-audit { fill: #8a3a3a; }
  .entity-jobs .head { fill: #235e6b; }      .domain-jobs { fill: #235e6b; }
  .rel { fill: none; stroke: #6d8479; stroke-width: 1.6; stroke-opacity: 0.8; }
  .rel-restrict { stroke: #4a5f55; stroke-width: 2.6; }
  .mk { fill: none; stroke: #4a5f55; stroke-width: 2; }
  .mk-open { fill: #ffffff; stroke: #4a5f55; stroke-width: 2; }
  .views-box { fill: #ffffff; stroke: #b9c9c0; stroke-width: 1.5; }
  .views-title { font-size: 15px; font-weight: 800; fill: #123c2d; letter-spacing: 0.04em; }
  .view-name { font-size: 15px; font-weight: 700; fill: #1f6b4d; font-family: Consolas, "Courier New", monospace; }
  .view-src { font-size: 14px; fill: #4d6158; }
</style>
</head>
<body>
${svg}
</body>
</html>
`;
}

// ---------------------------------------------------------------------------
// 5. Mermaid source for GitHub
// ---------------------------------------------------------------------------

// Parent side: exactly one when the FK is NOT NULL, zero-or-one when nullable.
// Child side: a parent may have no children, so zero-or-one for PK/FK and
// FK/UK columns, zero-or-many otherwise.
function mermaidCardinality(relation) {
  const parentSide = relation.optional ? '|o' : '||';
  const childSide = relation.oneToOne ? 'o|' : 'o{';
  return `${parentSide}--${childSide}`;
}

function renderMarkdown({ tables, views }, rels) {
  const lines = [];
  lines.push('# Saple ERD (PostgreSQL)');
  lines.push('');
  lines.push('<!-- Generated by docs/tools/build-erd.js from database/postgres/01_final_schema_postgres.sql. Do not edit by hand. -->');
  lines.push('');
  lines.push(`The active schema has **${tables.size} tables and ${views.length} views**. This diagram is generated from the`);
  lines.push('schema file, so it always matches it. A printable version is [ERD.html](ERD.html) and');
  lines.push('`ERD.pdf` at the repository root. The Oracle 19c milestone diagram is kept in');
  lines.push('[archive/](archive/).');
  lines.push('');
  lines.push('Actor columns that only record *who acted* (`reviewed_by`, `approved_by`, `revoked_by`,');
  lines.push('`resolved_by`, `moderator_user_id`, `actor_user_id`, `created_by`, `created_by_user_id`)');
  lines.push('reference `users`; they are listed in each entity but omitted as relationship lines.');
  lines.push('');
  lines.push('```mermaid');
  lines.push('erDiagram');
  for (const relation of rels.filter((item) => !item.actor)) {
    lines.push(`    ${relation.parent.toUpperCase()} ${mermaidCardinality(relation)} ${relation.child.toUpperCase()} : "${relation.column}"`);
  }
  for (const table of tables.values()) {
    lines.push(`    ${table.name.toUpperCase()} {`);
    for (const column of table.columns) {
      const flags = keyFlags(table, column.name).map((flag) => flag.replace('*', '')).filter((flag, index, all) => all.indexOf(flag) === index);
      const type = column.type.replace(/\(.*\)/, '').toLowerCase();
      lines.push(`        ${type} ${column.name}${flags.length ? ` ${flags.join(',')}` : ''}`);
    }
    lines.push('    }');
  }
  lines.push('```');
  lines.push('');
  lines.push('## Relationships');
  lines.push('');
  lines.push('| Parent | Child column | Cardinality | On delete |');
  lines.push('|--------|--------------|-------------|-----------|');
  for (const relation of rels) {
    const cardinality = relation.oneToOne ? '1 : 0..1' : '1 : 0..*';
    lines.push(`| ${relation.parent} | ${relation.child}.${relation.column}${relation.actor ? ' (actor)' : ''} | ${cardinality}${relation.optional ? ' (optional)' : ''} | ${relation.onDelete} |`);
  }
  lines.push('');
  lines.push('## Partial unique rules');
  lines.push('');
  for (const table of tables.values()) {
    if (table.partialUnique) {
      lines.push(`- \`${table.name}\`: (${table.partialUnique.columns.join(', ')}) unique where ${table.partialUnique.where}`);
    }
  }
  lines.push('');
  lines.push('## Views');
  lines.push('');
  for (const view of views) lines.push(`- \`${view.name}\` — reads ${view.sources.map((source) => `\`${source}\``).join(', ')}`);
  lines.push('');
  lines.push('## Regenerating');
  lines.push('');
  lines.push('```');
  lines.push('node docs/tools/build-erd.js');
  lines.push('```');
  lines.push('');
  lines.push('Then print `docs/ERD.html` to `ERD.pdf` from any Chromium browser, or headlessly:');
  lines.push('');
  lines.push('```');
  lines.push('msedge --headless --disable-gpu --no-pdf-header-footer --print-to-pdf=ERD.pdf docs/ERD.html');
  lines.push('```');
  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------

function build() {
  const schema = parseSchema(fs.readFileSync(SCHEMA, 'utf8').replace(/\r\n/g, '\n'));
  const rels = relationships(schema.tables);
  const geometry = layout(schema.tables);

  fs.writeFileSync(path.join(ROOT, 'docs', 'ERD.html'), renderHtml(renderSvg(schema, rels, geometry)));
  fs.writeFileSync(path.join(ROOT, 'docs', 'ERD.md'), renderMarkdown(schema, rels));

  return { tables: schema.tables.size, views: schema.views.length, relationships: rels.length };
}

if (require.main === module) {
  const result = build();
  console.log(`ERD built: ${result.tables} tables, ${result.views} views, ${result.relationships} relationships.`);
}

module.exports = { parseSchema, relationships, keyFlags, build };
