/* ============================================================================
   mco-web-style · tools/replay/server.mjs
   One local server on 127.0.0.1 that is both the app's static host and the
   browser's HTTP proxy. Requests for the app's own origin are files from the
   app directory. Every other request (https via CONNECT, answered with a
   throwaway self-signed certificate the browser is told to accept) is either
   fetched live and saved (record) or answered from the recording (replay).

   A proxy, not page.route()/routeFromHAR(): in Playwright WebKit any route()
   breaks MapLibre's blob: workers (tools/verify/README.md), so the map would
   draw nothing.
   ========================================================================== */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createServer as createTlsServer } from 'node:https';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { MIME } from '../verify/lib.mjs';

// Headers that describe one connection or one encoding, not the resource.
// alt-svc would invite the browser to reach the real host over QUIC.
const DROP = new Set(['connection', 'keep-alive', 'transfer-encoding', 'content-encoding', 'content-length',
  'alt-svc', 'strict-transport-security', 'set-cookie', 'proxy-connection', 'upgrade', 'date', 'age']);

/** The key a response is saved under: method, URL, byte range, body hash. */
export function keyOf(method, url, headers = {}, body = null) {
  let k = `${method} ${url}`;
  if (headers.range) k += ` range=${headers.range}`;
  if (body && body.length) k += ` body=${createHash('sha256').update(body).digest('hex').slice(0, 16)}`;
  return k;
}

/** Open (or start) a recording directory: recording.json plus bodies/. */
export function openRecording(dir, { create = false } = {}) {
  const file = join(dir, 'recording.json');
  if (!existsSync(file)) {
    if (!create) throw new Error(`no recording at ${dir} (run record first)`);
    mkdirSync(join(dir, 'bodies'), { recursive: true });
    return { dir, data: { time: Date.now(), entries: {} } };
  }
  return { dir, data: JSON.parse(readFileSync(file, 'utf8')) };
}

export function saveRecording(rec) {
  writeFileSync(join(rec.dir, 'recording.json'), JSON.stringify(rec.data, null, 1));
}

/** Serve a byte range of `body` when the request asks for one. */
function sendBody(req, res, status, headers, body) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (m && status === 200) {
    const size = body.length;
    const start = m[1] === '' ? Math.max(0, size - Number(m[2])) : Number(m[1]);
    const end = m[1] === '' || m[2] === '' ? size - 1 : Math.min(Number(m[2]), size - 1);
    if (start > end || start >= size) {
      res.writeHead(416, { 'content-range': `bytes */${size}` }).end();
      return;
    }
    res.writeHead(206, { ...headers, 'content-range': `bytes ${start}-${end}/${size}`, 'accept-ranges': 'bytes', 'content-length': end - start + 1 });
    res.end(req.method === 'HEAD' ? undefined : body.subarray(start, end + 1));
    return;
  }
  res.writeHead(status, { ...headers, 'content-length': body.length });
  res.end(req.method === 'HEAD' ? undefined : body);
}

function readBody(req) {
  return new Promise((ok) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => ok(Buffer.concat(chunks)));
  });
}

/** A self-signed certificate made for this run (the browser ignores who it names). */
function makeCert() {
  const dir = mkdtempSync(join(tmpdir(), 'mco-replay-'));
  try {
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=mco-replay',
      '-keyout', join(dir, 'k.pem'), '-out', join(dir, 'c.pem')], { stdio: 'ignore' });
    return { key: readFileSync(join(dir, 'k.pem')), cert: readFileSync(join(dir, 'c.pem')) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Start the server. `mode` is 'record' (fetch live, save the first response
 * per key; a key seen before is answered from the recording) or 'replay'
 * (recording only; anything else is a 599 and a logged miss). `root` is the
 * app directory. Returns { origin, state, setRoot, quiet, close }; state.misses
 * lists replay requests the recording did not have.
 */
export async function startServer({ root, rec, mode, port }) {
  const state = { root: resolve(root), inflight: 0, lastChange: Date.now(), log: [], misses: [], failures: [] };
  const busy = (d) => { state.inflight += d; state.lastChange = Date.now(); };
  let origin = `http://127.0.0.1:${port}`;

  async function serveFile(req, res, path) {
    let p = decodeURIComponent(path);
    if (p.endsWith('/')) p += 'index.html';
    const f = normalize(join(state.root, p));
    if (!f.startsWith(state.root)) { res.writeHead(403).end(); return; }
    let body;
    try { if ((await stat(f)).isFile()) body = await readFile(f); } catch {}
    if (!body) { res.writeHead(404).end(); return; }
    sendBody(req, res, 200, { 'content-type': MIME[extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }, body);
  }

  async function serveRemote(req, res, url) {
    const body = ['GET', 'HEAD'].includes(req.method) ? null : await readBody(req);
    const key = keyOf(req.method, url, req.headers, body);
    // A range of a body recorded whole is cut from it, so a reader that asks
    // for different ranges in a different engine still replays.
    const whole = req.headers.range ? rec.data.entries[keyOf(req.method, url)] : null;
    let entry = rec.data.entries[key] || (whole && whole.status === 200 ? whole : null);
    if (!entry && mode === 'record') entry = await fetchLive(req, url, key, body);
    if (!entry) {
      state.misses.push(key);
      res.writeHead(599, { 'content-type': 'text/plain' }).end('not in the recording');
      return;
    }
    const data = readFileSync(join(rec.dir, 'bodies', entry.body));
    const headers = { ...entry.headers };
    // CORS answers name the origin they were recorded for; keep them true here.
    if (headers['access-control-allow-origin'] && headers['access-control-allow-origin'] !== '*') {
      headers['access-control-allow-origin'] = req.headers.origin || origin;
    }
    if (entry.status === 206 || !req.headers.range) {
      res.writeHead(entry.status, { ...headers, 'content-length': data.length });
      res.end(req.method === 'HEAD' ? undefined : data);
    } else sendBody(req, res, entry.status, headers, data);
  }

  async function fetchLive(req, url, key, body) {
    const headers = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (!DROP.has(k) && !k.startsWith('proxy-') && !['host', 'if-none-match', 'if-modified-since', 'accept-encoding'].includes(k)) headers[k] = v;
    }
    let r;
    try {
      r = await fetch(url, { method: req.method, headers, body: body && body.length ? body : undefined, redirect: 'manual' });
    } catch (e) {
      state.failures.push(`${key}: ${e.cause?.code || e.message}`);
      return null;
    }
    const data = Buffer.from(await r.arrayBuffer());
    const sha = createHash('sha256').update(data).digest('hex');
    writeFileSync(join(rec.dir, 'bodies', sha), data);
    const kept = {};
    r.headers.forEach((v, k) => { if (!DROP.has(k)) kept[k] = v; });
    const entry = { status: r.status, headers: kept, body: sha, size: data.length };
    rec.data.entries[key] = entry;
    return entry;
  }

  async function handle(req, res, url) {
    busy(1);
    res.on('close', () => busy(-1));
    state.log.push(`${req.method} ${url}`);
    try {
      const u = new URL(url);
      if (u.origin === origin) await serveFile(req, res, u.pathname);
      else await serveRemote(req, res, url);
    } catch (e) {
      state.failures.push(`${url}: ${e.message}`);
      if (!res.headersSent) res.writeHead(500).end();
    }
  }

  const tls = createTlsServer({ ...makeCert(), ALPNProtocols: ['http/1.1'] },
    (req, res) => handle(req, res, `https://${req.headers.host}${req.url}`));
  const server = createServer((req, res) => handle(req, res, req.url.startsWith('/') ? origin + req.url : req.url));
  server.on('connect', (req, socket, head) => {
    socket.on('error', () => {});
    socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    if (head && head.length) socket.unshift(head);
    tls.emit('connection', socket);
  });
  tls.on('tlsClientError', () => {});
  await new Promise((ok, fail) => { server.once('error', fail); server.listen(port, '127.0.0.1', ok); });
  origin = `http://127.0.0.1:${server.address().port}`;

  return {
    origin,
    state,
    setRoot(dir) { state.root = resolve(dir); },
    /** True once nothing has been in flight for `ms`. */
    quiet(ms) { return state.inflight === 0 && Date.now() - state.lastChange > ms; },
    async close() {
      server.closeAllConnections?.();
      tls.closeAllConnections?.();
      await new Promise((ok) => server.close(ok));
      await new Promise((ok) => tls.close(ok));
    },
  };
}
