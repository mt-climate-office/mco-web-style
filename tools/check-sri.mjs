#!/usr/bin/env node
/* SRI-freshness gate (CI; run locally at release).
   Recomputes the sha384 of every published css/js file and asserts the hash
   appears in each document that embeds SRI hashes (README table, head
   snippet, CDN demo). A stale hash means someone edited a published file
   without re-running tools/sri.sh — the exact drift SRI exists to catch.
   Zero dependencies. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const FILES = [
  'theme/mco-theme.css',
  'core/mco-core.js',
  'map/mco-map.js',
  'map/cog-protocol.js',
];
const DOCS = ['README.md', 'snippets/head.html', 'demo/cdn.html'];

const errors = [];
for (const file of FILES) {
  const digest = createHash('sha384').update(readFileSync(join(root, file))).digest('base64');
  const sri = `sha384-${digest}`;
  for (const doc of DOCS) {
    const text = readFileSync(join(root, doc), 'utf8');
    if (!text.includes(sri)) {
      errors.push(`${doc} lacks the current hash for ${file} (${sri})`);
    }
  }
}

if (errors.length) {
  console.error(`check-sri: ${errors.length} stale/missing hash(es)\n  - ` + errors.join('\n  - ') +
    '\n  Re-run tools/sri.sh and update README.md, snippets/head.html, demo/cdn.html.');
  process.exit(1);
}
console.log(`check-sri: OK (${FILES.length} files × ${DOCS.length} documents)`);
