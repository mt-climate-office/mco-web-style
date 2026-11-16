#!/usr/bin/env node
/* Self-test for tools/conformance.mjs's Help checks, on a fixture page
   (tools/fixtures/help/index.html). Zero dependencies; run by CI.
   The fixture has an HTML comment that mentions "<details>" just before a
   78-word <details>. The comment must not start the match: it once read 90
   words here, and 133 for mco-snowpack-explorer's 78-word block.
   The URL group's one-Mesonet-origin checks: the help fixture uses the
   pattern (a canonical address and a comment naming the old form are
   allowed), tools/fixtures/origin-bad links the old forms.
   The advisory code-style checks (CODE-STYLE.md) on tools/fixtures/style-good
   and style-bad, and on the exemplar, which must pass them. */
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = execFileSync(process.execPath,
  [join(root, 'tools/conformance.mjs'), join(root, 'tools/fixtures/help'), '--readme', 'none'], { encoding: 'utf8' });
const line = (re) => out.split('\n').find((l) => re.test(l)) || '';

test('sections: a subset of the four, in order, passes', () => {
  assert.match(line(/only the four sections/), /^\s*✓/);
});
test('visible words: the summary counts; the details body and comments do not', () => {
  // "Fixture" 1 + "What this shows" 3 + 5 + summary 2 + "Data" 1 + 3 = 15
  assert.match(line(/always-visible words/), /^\s*✓.*\(15 words\)/);
});
test('a comment that mentions <details> leaves the details count at 78', () => {
  assert.match(line(/<details>, ≤ 80/), /^\s*✓.*\(1 × \[78\] words\)/);
});

const bad = execFileSync(process.execPath,
  [join(root, 'tools/conformance.mjs'), join(root, 'tools/fixtures/origin-bad'), '--readme', 'none'], { encoding: 'utf8' });
const badLine = (re) => bad.split('\n').find((l) => re.test(l)) || '';

test('origin: MESONET_ORIGIN declared, no old links; canonical and comments allowed', () => {
  assert.match(line(/one MESONET_ORIGIN constant/), /^\s*✓/);
  assert.match(line(/no mesonet\.climate\.umt\.edu\/dash/), /^\s*✓/);
});
test('origin: old /dash and /api links without the constant fail, naming them', () => {
  assert.match(badLine(/one MESONET_ORIGIN constant/), /^\s*✗/);
  assert.match(badLine(/no mesonet\.climate\.umt\.edu\/dash/), /^\s*✗.*mesonet\.climate\.umt\.edu\/dash\/next\/\?s=aceabsar.*mesonet\.climate\.umt\.edu\/api\/v2\/stations\//);
});

const run = (dir) => execFileSync(process.execPath,
  [join(root, 'tools/conformance.mjs'), join(root, dir), '--readme', 'none'], { encoding: 'utf8' });
const lineIn = (text, re) => text.split('\n').find((l) => re.test(l)) || '';
const good = run('tools/fixtures/style-good');
const poor = run('tools/fixtures/style-bad');

test('style: banners in order pass; a subsection banner is not a section', () => {
  assert.match(lineIn(good, /section banners/), /^\s*✓/);
});
test('style: an unknown section and a reordered one warn, naming them', () => {
  assert.match(lineIn(poor, /section banners/), /^\s*⚠.*not a section: Constants.*out of order: Map/);
});
test('style: strings, regex literals, WCAG criteria and § numbers are not history', () => {
  assert.match(lineIn(good, /no history in comments/), /^\s*✓/);
});
test('style: a version, a date and "no longer" in comments warn', () => {
  assert.match(lineIn(poor, /no history in comments/), /^\s*⚠ .*\(3: version: .*0\.21\.0.*date: .*2026-11-04.*"no longer"/);
});
test('style: app.css beside the page', () => {
  assert.match(lineIn(good, /app\.css beside the page/), /^\s*✓/);
  assert.match(lineIn(poor, /app\.css beside the page/), /^\s*⚠/);
});
test('style: advisory checks are left out of the score', () => {
  assert.match(lineIn(poor, /^code style:/), /^code style: 0\/4 \(advisory, not scored\)/);
  const scoreOf = (t) => lineIn(t, /^conformance:/).match(/(\d+)\/(\d+)/).slice(1).map(Number);
  // The same scored checks run on both pages; the style results move neither total.
  assert.equal(scoreOf(good)[1], scoreOf(poor)[1]);
});
test('style: keys in a STORAGE object are checked for the app prefix', () => {
  assert.match(lineIn(good, /storage keys app-prefixed/), /^\s*✓/);
  assert.match(lineIn(poor, /storage keys app-prefixed/), /^\s*✗.*seen-intro/);
});
test('style: a workflow calling app-check.yml at a release tag passes', () => {
  assert.match(lineIn(good, /app-check\.yml at a release tag/), /^\s*✓/);
});
test('style: a call at a branch warns, and a commented-out call does not count', () => {
  assert.match(lineIn(poor, /app-check\.yml at a release tag/), /^\s*⚠.*not a release tag: @main\)/);
});
test('style: the workflow check is left out where there is no repository', () => {
  assert.match(lineIn(run('exemplar'), /app-check\.yml at a release tag/), /^\s*– .*not a repository root/);
});
test('style: the exemplar passes every code-style check', () => {
  assert.match(lineIn(run('exemplar'), /^code style:/), /^code style: 3\/3/);
});
