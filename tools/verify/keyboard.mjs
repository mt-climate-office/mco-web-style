#!/usr/bin/env node
/* ============================================================================
   mco-web-style · tools/verify/keyboard.mjs — generic keyboard probes
   What axe can't see. Generic probes run on any MCO page; app probes plug in
   through the config. Lifted from mesonet-dashboard's scripts/verify/
   keyboard.mjs (its app-specific probes stay there).

     node tools/verify/keyboard.mjs --root ../mesonet-status
     node tools/verify/keyboard.mjs --config verify.config.mjs

   Generic probes:
   1. The skip link is the first Tab stop, and activating it focuses #main.
   2. Every Tab stop (the first `tabStops`, default 40) shows a visible focus
      ring: an outline or a box-shadow (HOUSE-STYLE §5.4).
   3. The info dialog (config.dialogOpener, default .mco-btn-info) opens
      with Enter, holds focus, closes on Esc, and returns focus to its opener
      (§5.12).
   4. Each config.shortcuts entry works normally and does nothing under
      ?kbd=off (WCAG 2.1.4, §5.9). An entry is {key, effect}: effect() runs
      in the page after the key press and returns true when the shortcut
      took effect. Undo is the probe's job — each run is a fresh page.

   Config (same file as axe-matrix.mjs; extra keys):
     ready, query        — render evidence and query for the probe page
     dialogOpener: '.mco-btn-info',
     tabStops: 40,
     shortcuts: [{ key: '/', effect: () => document.activeElement?.type === 'search' }],
     probes: async ({ env, open, check, page }) => {},   // app-specific

   Each numbered block (and the probes function as a whole) is retried once
   on a fresh page if any of its checks fails, logged "↻ retried …"
   (0.16.2); VERIFY_RETRIES=0 turns that off.
   ========================================================================== */
import { args, browsers, config, finish, open, scenario, start } from './lib.mjs';

const a = args();
const cfg = await config(a.config);
const root = a.root || cfg.root || '.';
const page = a.page || cfg.page || 'index.html';
const ready = cfg.ready ?? (cfg.scenarios && cfg.scenarios[0] && cfg.scenarios[0].ready);
const baseQuery = cfg.query ?? (cfg.scenarios && cfg.scenarios[0] && cfg.scenarios[0].query) ?? '';
const opts = { storage: cfg.storage || {}, ready, settleMs: cfg.settleMs ?? 1500 };
for (const engine of browsers(a)) {
  // Safari's default Tab reaches only form controls; ⌥Tab walks every link
  // and button (the "Press Tab to highlight each item" setting). Probe the
  // WebKit route a keyboard user actually takes.
  const TAB = engine === 'webkit' ? 'Alt+Tab' : 'Tab';
  const env = await start({ root, page, engine });
  console.log(`keyboard (${engine}): ${env.base}${page.split('/').pop()}`);

  // A page that never shows its render evidence is a FAILED check, not a
  // crash: report it and skip that probe, as axe-matrix does (0.11.1).
  const tryOpen = async (rec, label, q, o = opts) => {
    try { return await open(env, q, o); } catch (e) {
      rec(`${label}: render evidence`, false, String(e.message || e).split('\n')[0]);
      return null;
    }
  };
  // Each probe block is one scenario: a failed check re-runs the block once
  // on a fresh page (lib.mjs scenario(), VERIFY_RETRIES; 0.16.2).
  const block = (name, fn) => scenario(`[${engine} · ${name}]`, fn);

  const focused = (p) => p.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    const cs = getComputedStyle(el);
    const outline = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0;
    const shadow = cs.boxShadow && cs.boxShadow !== 'none';
    const name = (el.getAttribute('aria-label') || el.textContent || el.id || '').trim().replace(/\s+/g, ' ').slice(0, 30);
    return {
      desc: `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${[...el.classList].slice(0, 2).map((c) => '.' + c).join('')} "${name}"`,
      ring: outline || shadow, skip: el.matches('.mco-skip-link'), id: el.id,
      // A native date/time input takes several Tabs (one per sub-field) on
      // the same element: that is staying put, not wrapping around (0.11.2).
      same: window.__verifyLast === el ? true : (window.__verifyLast = el, false),
      // Identity, not description: two controls may share a label.
      revisit: el.dataset.verifyStop === '1' ? true : (el.dataset.verifyStop = '1', false),
    };
  });

  /* 1 + 2. Skip link first; a focus ring on every Tab stop. */
  await block('skip link + focus rings', async (check) => {
    const s = await tryOpen(check, 'skip link + focus rings', baseQuery);
    if (!s) return;
    const { page: p, close } = s;
    try {
      // A first-visit modal may be open (seed its storage key to avoid it): close
      // it so Tab starts from the top of the document, not inside the dialog.
      await p.evaluate(() => {
        document.querySelectorAll('dialog[open]').forEach((d) => d.close());
        if (document.activeElement) document.activeElement.blur();
      });
      await p.keyboard.press(TAB);
      const first = await focused(p);
      check('skip link is the first Tab stop', !!first && first.skip, first ? first.desc : 'nothing focused');
      if (first && first.skip) {
        await p.keyboard.press('Enter');
        await p.waitForTimeout(150);
        const after = await focused(p);
        check('activating the skip link focuses #main', !!after && after.id === 'main', after ? after.desc : 'nothing focused');
      }
      // Ring audit from the top of the page.
      // Clear the visit marks the skip-link check left: WebKit restarts Tab from
      // the top after blur(), so the skip link would read as a wrap-around and
      // stop the audit at 0 stops (Chromium resumes after #main instead).
      await p.evaluate(() => {
        document.querySelectorAll('[data-verify-stop]').forEach((el) => delete el.dataset.verifyStop);
        window.scrollTo(0, 0);
        // Start the walk AT the skip link in every engine: after blur() Chromium
        // resumes from #main while WebKit restarts at the top, so the two would
        // audit different stretches of the page.
        const skip = document.querySelector('.mco-skip-link');
        if (skip) skip.focus(); else if (document.activeElement) document.activeElement.blur();
      });
      if (!(await p.evaluate(() => document.activeElement && document.activeElement.matches('.mco-skip-link')))) await p.keyboard.press(TAB);
      const seen = new Set();
      const missing = [];
      const max = cfg.tabStops || 40;
      for (let i = 0; i < max; i++) {
        const f = await focused(p);
        if (!f) break;
        if (f.same) { await p.keyboard.press(TAB); continue; }   // still inside one control
        if (f.revisit) break;                  // wrapped around
        seen.add(f.desc + ' @' + i);
        if (!f.ring) missing.push(f.desc);
        await p.keyboard.press(TAB);
      }
      check(`focus ring visible on every Tab stop (${seen.size} checked)`, missing.length === 0, missing.slice(0, 5).join(' | '));
    } finally { await close().catch(() => {}); }
  });

  /* 3. Dialog: open with Enter, focus inside, Esc closes, focus returns. */
  await block('dialog probe', async (check) => {
    const sel = cfg.dialogOpener || '.mco-btn-info';
    const s = await tryOpen(check, 'dialog probe', baseQuery);
    if (!s) return;
    const { page: p, close } = s;
    try {
      const opener = await p.$(sel);
      if (!opener) {
        console.log(`– dialog probe skipped: no ${sel} on the page`);
      } else {
        // A first-visit modal may already be open; close it first.
        await p.evaluate(() => document.querySelectorAll('dialog[open]').forEach((d) => d.close()));
        await opener.focus();
        await p.keyboard.press('Enter');
        await p.waitForTimeout(400);
        const st = await p.evaluate(() => {
          const d = document.querySelector('dialog[open]');
          return { open: !!d, inside: !!d && d.contains(document.activeElement), labelled: !!d && !!(d.getAttribute('aria-labelledby') || d.getAttribute('aria-label')) };
        });
        check(`${sel} opens a labelled <dialog> with focus inside`, st.open && st.inside && st.labelled, JSON.stringify(st));
        await p.keyboard.press('Escape');
        await p.waitForTimeout(400);
        const back = await p.evaluate((sel) => ({
          open: !!document.querySelector('dialog[open]'),
          onOpener: document.activeElement === document.querySelector(sel),
        }), sel);
        check('Esc closes the dialog and focus returns to its opener', !back.open && back.onOpener, JSON.stringify(back));
      }
    } finally { await close().catch(() => {}); }
  });

  /* 4. Single-key shortcuts and ?kbd=off. */
  for (const sc of cfg.shortcuts || []) {
    for (const off of [false, true]) {
      const q = baseQuery + (off ? (baseQuery.includes('?') ? '&' : '?') + 'kbd=off' : '');
      const name = `"${sc.key}" shortcut${off ? ' (?kbd=off)' : ''}`;
      await block(name, async (check) => {
        const s = await tryOpen(check, name, q);
        if (!s) return;
        const { page: p, close } = s;
        try {
          await p.evaluate(() => { document.activeElement && document.activeElement.blur(); });
          await p.keyboard.press(sc.key);
          await p.waitForTimeout(300);
          const took = await p.evaluate(sc.effect);
          check(off ? `"${sc.key}" does nothing under ?kbd=off` : `"${sc.key}" shortcut works`, off ? !took : !!took);
        } finally { await close().catch(() => {}); }
      });
    }
  }

  /* App-specific probes. */
  // The whole probes function is one block: on a failure it runs again from
  // the top, so a probe must open its own pages (it already must: each
  // run is a fresh page) and close them.
  if (cfg.probes) {
    await block('app probes', async (check) => {
      try { await cfg.probes({ env, open: (q, o) => open(env, q, { ...opts, ...o }), check }); }
      catch (e) { check('app probes ran to the end', false, String(e.message || e).split('\n')[0]); }
    });
  }

  await env.close();
}
finish('keyboard');
