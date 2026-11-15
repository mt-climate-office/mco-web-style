#!/usr/bin/env node
/* Unit tests for the replay server (tools/replay/server.mjs): the app's own
   files, replay from a recording, byte ranges cut from a whole body, and a
   request the recording lacks. node:test, no browser. Needs openssl.

     node tools/check-replay.mjs */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { keyOf, startServer } from './replay/server.mjs';

const dir = mkdtempSync(join(tmpdir(), 'check-replay-'));
const app = join(dir, 'app');
const recDir = join(dir, 'rec');
mkdirSync(app);
mkdirSync(join(recDir, 'bodies'), { recursive: true });
writeFileSync(join(app, 'index.html'), '<p>hi</p>');
const body = Buffer.from('0123456789');
const sha = createHash('sha256').update(body).digest('hex');
writeFileSync(join(recDir, 'bodies', sha), body);
const rec = { dir: recDir, data: { time: 0, entries: {
  [keyOf('GET', 'http://data.test/a.bin')]: { status: 200, headers: { 'content-type': 'application/octet-stream' }, body: sha, size: 10 },
} } };
const server = await startServer({ root: app, rec, mode: 'replay', port: 0 });
const { port } = new URL(server.origin);

/** A request through the server as a proxy (absolute URL) or as the host. */
function get(path, headers = {}) {
  return new Promise((ok, fail) => {
    request({ host: '127.0.0.1', port, path, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => ok({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString() }));
    }).on('error', fail).end();
  });
}

test('serves the app directory', async () => {
  const r = await get('/');
  assert.equal(r.status, 200);
  assert.equal(r.text, '<p>hi</p>');
});

test('replays a recorded response', async () => {
  const r = await get('http://data.test/a.bin');
  assert.equal(r.status, 200);
  assert.equal(r.text, '0123456789');
});

test('cuts a byte range from a body recorded whole', async () => {
  const r = await get('http://data.test/a.bin', { range: 'bytes=2-4' });
  assert.equal(r.status, 206);
  assert.equal(r.text, '234');
  assert.equal(r.headers['content-range'], 'bytes 2-4/10');
  assert.equal((await get('http://data.test/a.bin', { range: 'bytes=-3' })).text, '789');
});

test('a request the recording lacks fails and is logged', async () => {
  const r = await get('http://data.test/missing');
  assert.equal(r.status, 599);
  assert.deepEqual(server.state.misses, ['GET http://data.test/missing']);
});

test('keys separate ranges and bodies', () => {
  assert.notEqual(keyOf('GET', 'u', { range: 'bytes=0-1' }), keyOf('GET', 'u'));
  assert.notEqual(keyOf('POST', 'u', {}, Buffer.from('a')), keyOf('POST', 'u', {}, Buffer.from('b')));
});

test.after(async () => {
  await server.close();
  rmSync(dir, { recursive: true, force: true });
});
