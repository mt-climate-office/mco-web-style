#!/usr/bin/env node
/* Self-test for tools/conformance.mjs's Help checks, on a fixture page
   (tools/fixtures/help/index.html). Zero dependencies; run by CI.
   The fixture has an HTML comment that mentions "<details>" just before a
   78-word <details>. The comment must not start the match: it once read 90
   words here, and 133 for mco-snowpack-explorer's 78-word block. */
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
