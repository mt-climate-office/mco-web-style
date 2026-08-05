#!/usr/bin/env node
/* Axe accessibility audit of the demo page in all three themes AND at two
   viewport widths. Fails on any serious/critical violation. The demo exercises
   every kit component, so axe coverage here approximates kit coverage.

   The narrow pass is not optional: the responsive ladder sheds labels (1400),
   collapses the brand (750) and collapses search (460), and each shed can strip
   an accessible name. A desktop-only audit is blind to all of it — that is
   exactly how the .control-label display:none bug reached production in
   mesonet-photos (fixed in v0.5.1).

   Requires (installed ephemerally — NOT kit dependencies; see .gitignore):
     npm init -y && npm i --no-save playwright @axe-core/playwright
     npx playwright install --with-deps chromium
   Then: node tools/a11y-audit.mjs */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.mjs': 'text/javascript', '.json': 'application/json',
  '.geojson': 'application/geo+json', '.png': 'image/png', '.svg': 'image/svg+xml',
};

const server = createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(root, path));
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const browser = await chromium.launch();
const themes = ['dark', 'light', 'high-contrast'];
const pages = ['/demo/', '/exemplar/'];
// Wide: everything shown. Narrow: past every shed in the ladder (labels, brand,
// search) — where a display:none'd label silently costs an input its name.
const viewports = [
  { name: 'wide', width: 1440, height: 900 },
  { name: 'narrow', width: 390, height: 800 },
];
let failed = false;

for (const path of pages) {
  for (const theme of themes) {
    for (const vp of viewports) {
      // @axe-core/playwright requires pages created from an explicit context.
      const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await context.newPage();
      await page.goto(`http://127.0.0.1:${port}${path}?theme=${theme}`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500); // let fonts/controls settle; map isn't awaited
      const results = await new AxeBuilder({ page }).analyze();
      const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      const label = `${path} ${theme} ${vp.name}(${vp.width}px)`;
      if (bad.length) {
        failed = true;
        console.error(`\n[${label}] ${bad.length} serious/critical violation(s):`);
        for (const v of bad) {
          console.error(`  ${v.id} (${v.impact}): ${v.help}`);
          for (const n of v.nodes.slice(0, 5)) console.error(`    → ${n.target.join(' ')}`);
        }
      } else {
        console.log(`[${label}] OK — 0 serious/critical (${results.violations.length} minor advisories)`);
      }
      await context.close();
    }
  }
}

await browser.close();
server.close();
process.exit(failed ? 1 : 0);
