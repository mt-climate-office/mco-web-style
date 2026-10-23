#!/usr/bin/env node
/* Unit tests for the verify harness's retry (tools/verify/lib.mjs
   scenario(), 0.16.2). Zero dependencies: node:test + node:assert, with fake
   scenarios standing in for page visits, so no browser is needed. lib.mjs
   loads Playwright only in start(), which these tests never call.

     node tools/check-verify.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { retryCount, scenario } from './verify/lib.mjs';

/** A scenario whose checks fail on the attempts listed in `failOn`. */
function fake(failOn, detail = 'console: Failed to load resource: HTTP/2 Error: NO_ERROR') {
  const calls = [];
  const fn = async (rec, attempt) => {
    calls.push(attempt);
    rec('[webkit · default · dark · 1440] axe: 0 serious/critical', true);
    const bad = failOn.includes(calls.length);
    rec('[webkit · default · dark · 1440] console, page errors, CSP clean', !bad, bad ? `${detail} (attempt ${calls.length})` : '');
  };
  return { fn, calls };
}

/** Capture what scenario() prints and reports. */
function sink() {
  const lines = [], reported = [];
  return { lines, reported, log: (l) => lines.push(l), report: (label, ok, detail) => reported.push({ label, ok, detail }) };
}

const LABEL = '[webkit · default · dark · 1440]';

test('a scenario that fails once and passes on the retry passes, and says so', async () => {
  const { fn, calls } = fake([1]);
  const s = sink();
  const r = await scenario(LABEL, fn, { retries: 1, log: s.log, report: s.report });
  assert.deepEqual(calls, [0, 1], 'ran twice');
  assert.equal(r.ok, true);
  assert.equal(r.retried, true);
  assert.equal(s.lines.length, 1);
  assert.match(s.lines[0], /^↻ retried \[webkit · default · dark · 1440\], passed \(first attempt: .*console, page errors, CSP clean — console: Failed to load resource: HTTP\/2 Error: NO_ERROR \(attempt 1\)\)$/);
  // Only the retry's results count, and they all passed.
  assert.equal(s.reported.length, 2);
  assert.ok(s.reported.every((x) => x.ok));
});

test('a scenario that fails twice fails, reports the retry, and names the first failure', async () => {
  const { fn, calls } = fake([1, 2]);
  const s = sink();
  const r = await scenario(LABEL, fn, { retries: 1, log: s.log, report: s.report });
  assert.deepEqual(calls, [0, 1], 'exactly one retry, no more');
  assert.equal(r.ok, false);
  assert.equal(r.retried, true);
  assert.match(s.lines[0], /^↻ retried .*, failed again \(first attempt: .*\(attempt 1\)\)$/);
  const failed = s.reported.filter((x) => !x.ok);
  assert.equal(failed.length, 1);
  assert.match(failed[0].detail, /\(attempt 2\)$/, "the retry's result is what is reported");
  assert.match(r.first[0].detail, /\(attempt 1\)$/, 'the first failure is kept');
});

test('a passing scenario runs once and prints no retry line', async () => {
  const { fn, calls } = fake([]);
  const s = sink();
  const r = await scenario(LABEL, fn, { retries: 1, log: s.log, report: s.report });
  assert.deepEqual(calls, [0]);
  assert.equal(r.ok, true);
  assert.equal(r.retried, false);
  assert.deepEqual(s.lines, []);
  assert.equal(s.reported.length, 2);
});

test('retries: 0 disables the retry', async () => {
  const { fn, calls } = fake([1]);
  const s = sink();
  const r = await scenario(LABEL, fn, { retries: 0, log: s.log, report: s.report });
  assert.deepEqual(calls, [0]);
  assert.equal(r.ok, false);
  assert.deepEqual(s.lines, []);
  assert.equal(s.reported.filter((x) => !x.ok).length, 1);
});

test('a throw is a failed check, and is retried like one', async () => {
  let n = 0;
  const s = sink();
  const r = await scenario(LABEL, async (rec) => {
    n++;
    if (n === 1) throw new Error('page.goto: Timeout 45000ms exceeded.\nCall log: …');
    rec(`${LABEL} render evidence`, true);
  }, { retries: 1, log: s.log, report: s.report });
  assert.equal(n, 2);
  assert.equal(r.ok, true);
  assert.match(s.lines[0], /first attempt: \[webkit · default · dark · 1440\] ran to the end — page\.goto: Timeout 45000ms exceeded\.\)$/);
});

test('a scenario that throws twice fails with the second error', async () => {
  let n = 0;
  const s = sink();
  const r = await scenario(LABEL, async () => { n++; throw new Error(`boom ${n}`); }, { retries: 1, log: s.log, report: s.report });
  assert.equal(r.ok, false);
  assert.deepEqual(s.reported, [{ label: `${LABEL} ran to the end`, ok: false, detail: 'boom 2' }]);
  assert.match(s.lines[0], /failed again \(first attempt: .* — boom 1\)$/);
});

test('VERIFY_RETRIES: default 1, 0 disables, anything else is an error', () => {
  assert.equal(retryCount({}), 1);
  assert.equal(retryCount({ VERIFY_RETRIES: '' }), 1);
  assert.equal(retryCount({ VERIFY_RETRIES: '1' }), 1);
  assert.equal(retryCount({ VERIFY_RETRIES: '0' }), 0);
  assert.throws(() => retryCount({ VERIFY_RETRIES: '2' }), /must be 0 or 1/);
  assert.throws(() => retryCount({ VERIFY_RETRIES: 'yes' }), /must be 0 or 1/);
});
