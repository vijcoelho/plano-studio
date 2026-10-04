import assert from 'node:assert/strict';
import http from 'node:http';
import { promises as fs, createReadStream, createWriteStream } from 'node:fs';
import path from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createHash, randomUUID, randomBytes, timingSafeEqual } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

const artifacts = path.resolve('test-artifacts', 'upload-regression-' + randomUUID());
process.env.STUDIO_DATA = path.join(artifacts, 'data');
const store = await import('./store.mjs'), engine = await import('./engine.mjs');
await fs.mkdir(artifacts, { recursive: true });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const stats = new Map(), gates = [], safeGates = new Map(), probeGates = new Map(), frameGates = new Map(), dirGates = new Map();
function counts(pid) { if (!stats.has(pid)) stats.set(pid, { writes: 0, probes: 0, commits: 0, commitAttempts: 0 }); return stats.get(pid); }
function gate(map, pid) {
  let release, entered;
  const g = { wait: new Promise(r => { release = r; }), entered: new Promise(r => { entered = r; }), release, enter: entered };
  map.set(pid, g); gates.push(g); return g;
}
async function hold(map, pid) { const g = map.get(pid); if (g) { map.delete(pid); g.enter(); await g.wait; } }
async function bounded(promise) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Timeout da regressão')), 10000); })]); }
  finally { clearTimeout(timer); }
}
const socket = http.createServer();
await new Promise(r => socket.listen(0, '127.0.0.1', r));
const port = socket.address().port; await new Promise(r => socket.close(r));
const origin = `http://127.0.0.1:${port}`;
// Execute the complete current handler, replacing only timing/observation boundaries.
// No media, persistence, streams, HTTP or codec is mocked; no production test hooks.
const deps = {
  ...store, ...engine, http, path, createReadStream, Transform, pipeline, randomUUID, randomBytes, timingSafeEqual,
  process: { env: { PORT: String(port) }, on() {} }, capabilities: async () => ({}),
  connect() { throw new Error('Não permitido neste teste'); }, connectionStatus() { throw new Error('Não permitido neste teste'); }, publish() { throw new Error('Não permitido neste teste'); },
  fs: new Proxy(fs, { get(target, key) {
    if (key === 'link' || key === 'rename') return async (from, to) => {
      const original = path.basename(to) === 'original.mp4', c = original && counts(path.basename(path.dirname(to)));
      if (c) c.commitAttempts++;
      await target[key](from, to); if (c) c.commits++;
    };
    return target[key];
  } }),
  createWriteStream(file, options) { if (file.endsWith('.upload')) counts(path.basename(path.dirname(file))).writes++; return createWriteStream(file, options); },
  async safe(base, ...parts) { const file = await store.safe(base, ...parts); if (file.endsWith('.upload')) await hold(safeGates, path.basename(base)); return file; },
  async projectDir(pid) { const dir = await store.projectDir(pid); await hold(dirGates, pid); return dir; },
  async probe(file, signal) { const pid = path.basename(path.dirname(file)); counts(pid).probes++; const info = await engine.probe(file, signal); await hold(probeGates, pid); return info; },
  async extractFrames(p, signal) { await hold(frameGates, p.id); signal.throwIfAborted(); return engine.extractFrames(p, signal); }
};
const sourceFile = path.resolve(process.argv[2] || 'server.mjs');
const source = (await fs.readFile(sourceFile, 'utf8')).replace(/^import .*;\r?\n/gm, '');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const { server, locks } = await new AsyncFunction(...Object.keys(deps), source + '\nreturn {server, locks};')(...Object.values(deps));
await bounded(new Promise((resolve, reject) => { if (server.listening) resolve(); else { server.once('listening', resolve); server.once('error', reject); } }));
let token;
async function request(route, data, name) {
  const binary = Buffer.isBuffer(data);
  const response = await fetch(origin + route, { signal: AbortSignal.timeout(10000), ...(data !== undefined ? { method: 'POST', body: binary ? data : JSON.stringify(data), headers: { origin, 'x-studio-token': token, 'content-type': binary ? 'video/mp4' : 'application/json', ...(name ? { 'x-file-name': name } : {}) } } : {}) });
  return { status: response.status, body: await response.json() };
}
async function ok(route, data) { const r = await request(route, data); assert(r.status < 300, JSON.stringify(r)); return r.body; }
async function project(name) { return ok('/api/projects', { name }); }
const base = p => '/api/projects/' + p.id;
async function terminal(p, status = 'done') {
  return bounded((async () => { for (;;) { const current = await ok(base(p)); if (current.job && current.job.status !== 'running' && !locks.has(p.id)) { assert.equal(current.job.status, status, JSON.stringify(current.job)); return current; } await sleep(25); } })());
}
async function clean(p) { await bounded((async () => { while (locks.has(p.id)) await sleep(25); })()); assert(!(await fs.readdir(await store.projectDir(p.id))).some(f => f.endsWith('.upload'))); }
const report = { sourceFile, artifacts, checks: [], commands: [], hashes: {}, concurrency: null };
const pending = [];
try {
  token = (await ok('/api/bootstrap')).token;
  const { ffmpeg } = await engine.discover();
  const aFile = path.join(artifacts, 'a.mp4'), bFile = path.join(artifacts, 'b.mp4');
  for (const [file, color, size, duration] of [[aFile, 'red', '320x240', '2'], [bFile, 'blue', '480x270', '3']]) {
    await engine.run(ffmpeg, ['-v', 'error', '-nostdin', '-y', '-f', 'lavfi', '-i', `color=c=${color}:s=${size}:r=25`, '-t', duration, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', file]);
    report.commands.push({ cmd: `ffmpeg: ${color} ${size} ${duration}s -> ${path.basename(file)}`, exitCode: 0 });
  }
  const a = await fs.readFile(aFile), b = await fs.readFile(bFile), aInfo = await engine.probe(aFile);
  report.hashes = { a: hash(a), b: hash(b) }; assert.notEqual(hash(a), hash(b));
  const p = await project('Concorrência real A/B'), route = base(p), uploadGate = gate(safeGates, p.id), frameGate = gate(frameGates, p.id);
  const first = request(route + '/upload', a, 'a.mp4'); pending.push(first); await bounded(uploadGate.entered);
  const owner = locks.get(p.id);
  const second = await request(route + '/upload', b, 'b.mp4');
  report.rejectedWhilePaused = { status: second.status, counts: { ...counts(p.id) }, originalSha256: await fs.readFile(path.join(await store.projectDir(p.id), 'original.mp4')).then(hash, e => { if (e.code === 'ENOENT') return null; throw e; }) };
  assert.equal(second.status, 409, 'Segundo upload deve ser recusado antes de probe/commit, mesmo com o primeiro pausado no safe');
  assert(owner, 'Reserva deve existir antes de safe'); assert.equal(locks.get(p.id), owner, 'Perdedor não remove a reserva');
  assert.deepEqual(counts(p.id), { writes: 0, probes: 0, commits: 0, commitAttempts: 0 });
  await assert.rejects(fs.stat(path.join(await store.projectDir(p.id), 'original.mp4')), { code: 'ENOENT' });
  uploadGate.release(); const accepted = await first; assert.equal(accepted.status, 202); await bounded(frameGate.entered);
  assert.equal(locks.get(p.id), owner, 'Transferência ao job deve manter a mesma reserva');
  const original = path.join(await store.projectDir(p.id), 'original.mp4'); assert.equal(hash(await fs.readFile(original)), hash(a));
  assert.equal((await request(route + '/upload', b, 'b.mp4')).status, 409); assert.equal(locks.get(p.id), owner);
  assert.deepEqual(counts(p.id), { writes: 1, probes: 1, commits: 1, commitAttempts: 1 });
  frameGate.release(); const current = await terminal(p); await clean(p);
  assert.deepEqual(current.source, { ...aInfo, name: 'a.mp4', size: a.length }); assert.equal(current.frames.length, 5);
  const frameHashes = [];
  for (const [i, frame] of current.frames.entries()) {
    assert.equal(frame.at, Math.min(aInfo.duration - .1, aInfo.duration * (i + .5) / 5));
    const expected = path.join(artifacts, `expected-${i}.jpg`);
    await engine.run(ffmpeg, ['-v', 'error', '-nostdin', '-y', '-protocol_whitelist', 'file,pipe', '-ss', String(frame.at), '-i', aFile, '-frames:v', '1', '-vf', 'scale=640:-2', expected]);
    const actualHash = hash(await fs.readFile(path.join(path.dirname(original), 'frames', frame.filename)));
    assert.equal(actualHash, hash(await fs.readFile(expected))); frameHashes.push(actualHash);
  }
  report.concurrency = { projectId: p.id, statuses: [accepted.status, second.status], counts: counts(p.id), originalSha256: hash(await fs.readFile(original)), source: current.source, frameHashes };
  report.checks.push('Dois uploads concorrentes: 202/409; uma escrita/probe/commit; reserva própria contínua; hash, metadados e cinco frames coerentes com A');

  // Cached source may predate a completed upload: re-read under the new reservation.
  const stale = await project('Snapshot antigo'), staleGate = gate(dirGates, stale.id);
  const staleRequest = request(base(stale) + '/upload', b, 'b.mp4'); pending.push(staleRequest); await bounded(staleGate.entered);
  assert.equal((await request(base(stale) + '/upload', a, 'a.mp4')).status, 202); await terminal(stale);
  staleGate.release(); assert.equal((await staleRequest).status, 409); assert.equal(counts(stale.id).writes, 1); await clean(stale);
  report.checks.push('Source revalidado sob reserva mesmo quando snapshot inicial era anterior ao upload concluído');

  const cancelled = await project('Cancel antes do commit'), cancelGate = gate(probeGates, cancelled.id);
  const cancelledUpload = request(base(cancelled) + '/upload', a, 'a.mp4'); pending.push(cancelledUpload); await bounded(cancelGate.entered);
  const cancelOwner = locks.get(cancelled.id); assert.equal((await ok(base(cancelled) + '/cancel', {})).cancelling, true); assert(cancelOwner.signal.aborted);
  assert.equal((await request(base(cancelled) + '/upload', b, 'b.mp4')).status, 409); assert.equal(locks.get(cancelled.id), cancelOwner);
  cancelGate.release(); assert.equal((await cancelledUpload).status, 500); await clean(cancelled);
  assert.equal(counts(cancelled.id).commits, 0); assert.equal((await ok(base(cancelled))).source, null);
  await assert.rejects(fs.stat(path.join(await store.projectDir(cancelled.id), 'original.mp4')), { code: 'ENOENT' });
  assert.equal((await request(base(cancelled) + '/upload', b, 'b.mp4')).status, 202); await terminal(cancelled); await clean(cancelled);
  assert.equal(hash(await fs.readFile(path.join(await store.projectDir(cancelled.id), 'original.mp4'))), hash(b));
  report.checks.push('Cancel antes do commit mantém reserva até cleanup, não grava original e permite retry real');

  const jobCancel = await project('Cancel frames'), jobGate = gate(frameGates, jobCancel.id);
  assert.equal((await request(base(jobCancel) + '/upload', a, 'a.mp4')).status, 202); await bounded(jobGate.entered);
  assert.equal((await ok(base(jobCancel) + '/cancel', {})).cancelling, true); assert(locks.get(jobCancel.id).signal.aborted);
  jobGate.release(); await terminal(jobCancel, 'cancelled'); await clean(jobCancel);
  assert.equal(hash(await fs.readFile(path.join(await store.projectDir(jobCancel.id), 'original.mp4'))), hash(a));
  assert.equal((await request(base(jobCancel) + '/rename', { name: 'Reserva liberada' })).status, 200);
  assert.equal((await request(base(jobCancel) + '/upload', b, 'b.mp4')).status, 409);
  report.checks.push('Cancel no job inicial libera reserva própria e preserva original');

  const invalid = await project('Falha probe'); const invalidMp4 = Buffer.alloc(24); invalidMp4.write('ftyp', 4);
  assert.equal((await request(base(invalid) + '/upload', invalidMp4, 'invalid.mp4')).status, 422); await clean(invalid); assert.equal(counts(invalid.id).commits, 0);
  assert.equal((await request(base(invalid) + '/upload', a, 'a.mp4')).status, 202); await terminal(invalid); await clean(invalid);
  report.checks.push('Falha real FFprobe limpa temporário/reserva e permite retry');

  const existing = await project('Destino já existe'), existingFile = path.join(await store.projectDir(existing.id), 'original.mp4');
  await fs.writeFile(existingFile, a, { flag: 'wx' });
  assert.equal((await request(base(existing) + '/upload', b, 'b.mp4')).status, 409); await clean(existing);
  assert.equal(hash(await fs.readFile(existingFile)), hash(a)); assert.equal(counts(existing.id).commits, 0); assert.equal((await ok(base(existing))).source, null);
  report.checks.push('Commit exclusivo EEXIST: original pré-existente intacto, sem exists+rename');
  report.status = 'PASS';
} catch (e) { report.status = 'FAIL'; report.error = e.message; process.exitCode = 1; }
finally {
  for (const c of locks.values()) c.abort(); for (const g of gates) g.release();
  await Promise.allSettled(pending);
  for (let i = 0; locks.size && i < 200; i++) await sleep(25);
  server.closeAllConnections(); await new Promise(r => server.close(r));
  await fs.writeFile(path.join(artifacts, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
