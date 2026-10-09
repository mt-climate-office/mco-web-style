#!/usr/bin/env node
/* ============================================================================
   mco-web-style · tools/verify/axe-matrix.mjs — axe × themes × widths
   Every scenario in all three themes at 1440 (desktop) and 390 (touch phone).
   Fails on any serious/critical axe violation, any console error / page
   error / CSP violation, and — at 390, where (hover: none) applies — any
   pointer target under 40px (44px for close buttons). Lifted from
   mesonet-dashboard's scripts/verify/axe.mjs.

     node tools/verify/axe-matrix.mjs --root ../mesonet-status
     node tools/verify/axe-matrix.mjs --config verify.config.mjs

   verify.config.mjs (keep it in the app repo, untracked or committed):
     export default {
       root: '.', page: 'index.html',              // page relative to root
       storage: { 'mco-status-seen-intro': '1' },  // seeded before load
       scenarios: [
         { name: 'default', query: '' , ready: () => document.querySelectorAll('#sr-twin tbody tr').length > 10 },
         { name: 'station', query: '?station=acebozem', ready: '.mco-sheet[data-state="peek"]' },
       ],
       // Tolerated small targets, as a selector — say why in a comment.
       exemptTargets: '',
       // Problems to tolerate (substring match), e.g. a by-design 404 from an
       // API that isn't reachable from the verify machine. Say why.
       allowProblems: [],
     };
   `ready` is a FUNCTION run in the page (never a string: a meta CSP without
   'unsafe-eval' rejects Playwright's string predicates) or a CSS selector.
   The theme comes from ?theme=, appended to each scenario's query.
   ========================================================================== */
import { THEMES, VIEWPORTS, args, browsers, check, config, finish, load, open, smallTargets, start } from './lib.mjs';

const a = args();
const cfg = await config(a.config);
const root = a.root || cfg.root || '.';
const page = a.page || cfg.page || 'index.html';
const scenarios = cfg.scenarios || [{ name: 'default', query: '', ready: () => document.readyState === 'complete' }];
const themes = a.themes ? String(a.themes).split(',') : THEMES;
const allow = cfg.allowProblems || [];
const settleMs = cfg.settleMs ?? 2000;

const { AxeBuilder } = await load('@axe-core/playwright');
for (const engine of browsers(a)) {
  const env = await start({ root, page, engine });
  console.log(`axe-matrix (${engine}): ${env.base}${page.split('/').pop()} — ${scenarios.length} scenario(s) × ${themes.length} theme(s) × ${VIEWPORTS.length} width(s)`);

  for (const sc of scenarios) {
    for (const theme of themes) {
      for (const vp of VIEWPORTS) {
        const q = (sc.query || '');
        const query = q + (q.includes('?') ? '&' : '?') + 'theme=' + theme;
        const label = `[${engine} · ${sc.name} · ${theme} · ${vp.name}]`;
        let session;
        try {
          session = await open(env, query, { viewport: vp, storage: cfg.storage || {}, ready: sc.ready, settleMs });
        } catch (e) {
          check(`${label} render evidence`, false, String(e.message || e).split('\n')[0]);
          continue;
        }
        const { page: p, problems, close } = session;
        const results = await new AxeBuilder({ page: p }).analyze();
        const bad = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
        check(`${label} axe: 0 serious/critical`, bad.length === 0,
          bad.map((v) => `${v.id}(${v.nodes.length}): ${v.nodes[0]?.target.join(' ')}`).join(' | '));
        const probs = (await problems()).filter((x) => !allow.some((s) => x.includes(s)));
        check(`${label} console, page errors, CSP clean`, probs.length === 0, probs.slice(0, 3).join(' | '));
        if (vp.touch) {
          const small = await smallTargets(p, cfg.exemptTargets || '');
          check(`${label} touch targets ≥ 40px (44px close)`, small.length === 0, `${small.length}: ${small.slice(0, 12).join(' | ')}`);
        }
        await close();
      }
    }
  }
  await env.close();
}
finish('axe-matrix');
