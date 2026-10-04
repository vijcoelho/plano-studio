import http from 'node:http';
import { createReadStream, createWriteStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { randomUUID, randomBytes, timingSafeEqual } from 'node:crypto';
import { ROOT, initStore, safe, fail, id, text, createProject, readProject, listProjects, updateProject, projectDir, settings, validateSettings, atomic, validatePlan, parseSrt, saveSecrets } from './store.mjs';
import { APP, capabilities, probe, extractFrames, planWithAI, transcribe, renderCuts, renderCreation, renderOptions, startLogin, finishLogin } from './engine.mjs';
import { connect, connectionStatus, publish } from './composio.mjs';

const PORT = Number(process.env.PORT || 4317);
if (!Number.isInteger(PORT) || PORT < 1024 || PORT > 65535) throw new Error('PORT inválida.');
const ORIGIN = `http://127.0.0.1:${PORT}`, TOKEN = randomBytes(32).toString('hex');
const MAX_UPLOAD = 500 * 1024 * 1024;
const locks = new Map();
let activeJobs = 0;
function json(res, status, data) { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }); res.end(JSON.stringify(data)); }
async function body(req) {
  if (req.headers['content-type']?.split(';')[0] !== 'application/json') fail('Use application/json.', 415);
  let size = 0, chunks = [];
  for await (const chunk of req) { size += chunk.length; if (size > 1024 * 1024) fail('Requisição muito grande.', 413); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString()); } catch { fail('JSON inválido.'); }
}
function guard(req) {
  if (req.headers.host !== `127.0.0.1:${PORT}`) fail('Host não autorizado. Abra o endereço 127.0.0.1.', 403);
  if (req.headers.origin && req.headers.origin !== ORIGIN) fail('Origem não autorizada.', 403);
  if (req.headers['sec-fetch-site'] === 'cross-site') fail('Requisição externa bloqueada.', 403);
  if (!['GET', 'HEAD'].includes(req.method)) {
    const token = Buffer.from(req.headers['x-studio-token'] || '');
    if (req.headers.origin !== ORIGIN || token.length !== TOKEN.length || !timingSafeEqual(token, Buffer.from(TOKEN))) fail('Sessão inválida. Recarregue o estúdio.', 403);
  }
}
async function job(projectId, label, fn, reservation) {
  if (reservation ? locks.get(projectId) !== reservation : locks.has(projectId)) fail('Este projeto já tem uma operação em andamento.', 409);
  if (activeJobs >= 2) fail('Duas operações já estão em andamento. Aguarde terminar.', 429);
  const controller = reservation || new AbortController(), jobId = randomUUID(); locks.set(projectId, controller); activeJobs++;
  try { await updateProject(projectId, p => { p.job = { id: jobId, label, status: 'running', startedAt: new Date().toISOString(), error: null }; }); }
  catch (e) { if (locks.get(projectId) === controller) locks.delete(projectId); activeJobs--; throw e; }
  const progress = label => updateProject(projectId, p => { p.job.label = label; });
  void (async () => {
    try {
      await fn(controller.signal, progress);
      await updateProject(projectId, p => { p.job.status = 'done'; p.job.label = 'Concluído'; p.job.finishedAt = new Date().toISOString(); });
    } catch (e) {
      const message = e.message?.startsWith('Dependência encerrou') ? 'A ferramenta local falhou. Confira dependências e o README; nenhuma conclusão foi simulada.' : (e.message || 'A operação falhou.');
      await updateProject(projectId, p => { p.job.status = controller.signal.aborted ? 'cancelled' : 'error'; p.job.error = message; p.job.finishedAt = new Date().toISOString(); });
    } finally { if (locks.get(projectId) === controller) locks.delete(projectId); activeJobs--; }
  })().catch(() => { console.error('Falha ao persistir estado de uma operação. Verifique permissões e espaço em disco.'); });
  return { jobId };
}
async function media(req, res, file, type, download = false) {
  const stat = await fs.stat(file); if (!stat.isFile()) fail('Arquivo não encontrado.', 404);
  let start = 0, end = stat.size - 1, status = 200;
  if (req.headers.range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if (!m || (!m[1] && !m[2])) { res.writeHead(416, { 'content-range': `bytes */${stat.size}` }); return res.end(); }
    start = m[1] ? Number(m[1]) : Math.max(0, stat.size - Number(m[2]));
    end = m[1] && m[2] ? Math.min(Number(m[2]), end) : end;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= stat.size) { res.writeHead(416, { 'content-range': `bytes */${stat.size}` }); return res.end(); }
    status = 206;
  }
  res.writeHead(status, { 'content-type': type, 'content-length': end - start + 1, 'accept-ranges': 'bytes', ...(status === 206 ? { 'content-range': `bytes ${start}-${end}/${stat.size}` } : {}), ...(download ? { 'content-disposition': `attachment; filename="${path.basename(file)}"` } : {}) });
  if (req.method === 'HEAD') return res.end();
  const stream = createReadStream(file, { start, end }); stream.on('error', () => res.destroy()); res.on('close', () => stream.destroy()); stream.pipe(res);
}
await initStore();
for (const p of await listProjects()) if (p.job?.status === 'running') await updateProject(p.id, x => { x.job.status = 'error'; x.job.error = 'O servidor foi interrompido. Revise resultados salvos antes de repetir.'; for (const r of x.results) if (r.publication && !['published', 'failed-before-create'].includes(r.publication.status)) r.publication.status = 'unknown'; });
const server = http.createServer(async (req, res) => {
  res.setHeader('x-content-type-options', 'nosniff'); res.setHeader('referrer-policy', 'no-referrer');
  res.setHeader('content-security-policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self'; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'self'");
  try {
    guard(req); const u = new URL(req.url, ORIGIN), parts = u.pathname.split('/').filter(Boolean);
    if (req.method === 'GET' && u.pathname === '/api/bootstrap') return json(res, 200, { token: TOKEN, capabilities: await capabilities(), settings: await settings(), projects: await listProjects() });
    if (req.method === 'GET' && u.pathname === '/api/projects') return json(res, 200, await listProjects());
    if (req.method === 'POST' && u.pathname === '/api/projects') { const data = await body(req); return json(res, 201, await createProject(data.name)); }
    if (u.pathname === '/api/settings' && req.method === 'POST') { const s = validateSettings(await body(req)); await atomic(await safe(ROOT, 'settings.json'), s); return json(res, 200, s); }
    const login = /^\/api\/(claude|codex)\/(login|code)$/.exec(u.pathname);
    if (req.method === 'POST' && login) { const data = await body(req); if (login[2] === 'login') return json(res, 200, await startLogin(login[1])); await finishLogin(data.code, login[1]); return json(res, 200, { capabilities: await capabilities() }); }
    if (req.method === 'POST' && u.pathname === '/api/secrets') { await saveSecrets(await body(req)); return json(res, 200, { capabilities: await capabilities() }); }
    if (req.method === 'POST' && u.pathname === '/api/instagram/connect') { await body(req); return json(res, 200, await connect()); }
    if (req.method === 'POST' && u.pathname === '/api/instagram/status') { await body(req); return json(res, 200, await connectionStatus()); }
    if (parts[0] === 'api' && parts[1] === 'projects' && parts[2]) {
      const projectId = id(parts[2]), p = await readProject(projectId), action = parts[3], dir = await projectDir(projectId);
      if (req.method === 'GET' && !action) return json(res, 200, p);
      if (req.method === 'GET' || req.method === 'HEAD') {
        if (action === 'original' && p.source) return media(req, res, await safe(dir, 'original.mp4'), 'video/mp4');
        if (action === 'frames' && /^frame-[0-4]\.jpg$/.test(parts[4]) && p.frames.some(f => f.filename === parts[4])) return media(req, res, await safe(dir, 'frames', parts[4]), 'image/jpeg');
        if (action === 'results') {
          const resultId = id(parts[4]), result = p.results.find(r => r.id === resultId); if (!result) fail('Resultado não encontrado.', 404);
          if (parts[5] === 'captions' && result.sidecar) return media(req, res, await safe(dir, 'results', resultId, 'captions.srt'), 'text/plain; charset=utf-8', true);
          if (!parts[5]) return media(req, res, await safe(dir, 'results', resultId, 'output.mp4'), 'video/mp4', u.searchParams.has('download'));
        }
      }
      if (req.method === 'POST') {
        if (action === 'cancel') { await body(req); locks.get(projectId)?.abort(); return json(res, 200, { cancelling: locks.has(projectId) }); }
        if (locks.has(projectId)) fail('Aguarde a operação do projeto terminar.', 409);
        if (action === 'upload') {
          const controller = new AbortController(); locks.set(projectId, controller);
          let tmp, transferred = false;
          try {
            if ((await readProject(projectId)).source) fail('O original já existe. Crie outro projeto para importar outro vídeo.', 409);
            if (req.headers['content-type'] !== 'video/mp4') fail('Envie um arquivo MP4.', 415);
            const size = Number(req.headers['content-length']); if (!Number.isSafeInteger(size) || size < 24 || size > MAX_UPLOAD) fail('MP4 deve ter até 500 MB.', 413);
            const name = text(decodeURIComponent(req.headers['x-file-name'] || 'video.mp4'), 180); if (!/\.mp4$/i.test(name)) fail('Extensão MP4 obrigatória.');
            tmp = await safe(dir, `${randomUUID()}.upload`);
            let bytes = 0;
            const limit = new Transform({ transform(chunk, encoding, callback) { bytes += chunk.length; callback(bytes > MAX_UPLOAD ? new Error('Upload excedeu 500 MB.') : null, chunk); } });
            await pipeline(req, limit, createWriteStream(tmp, { flags: 'wx', mode: 0o600 }), { signal: controller.signal });
            if (bytes !== size) fail('Upload incompleto.');
            const handle = await fs.open(tmp, 'r'); const header = Buffer.alloc(12); await handle.read(header, 0, 12, 0); await handle.close();
            if (header.toString('ascii', 4, 8) !== 'ftyp') fail('Assinatura MP4 inválida.', 422);
            const source = { ...(await probe(tmp, controller.signal)), name, size };
            const original = await safe(dir, 'original.mp4'); controller.signal.throwIfAborted();
            // Hard link creates the original atomically without replacing an existing file.
            try { await fs.link(tmp, original); }
            catch (e) { if (e.code === 'EEXIST') fail('O original já existe e foi preservado. Crie outro projeto.', 409); throw e; }
            await updateProject(projectId, x => { x.source = source; });
            const current = await readProject(projectId);
            const result = await job(projectId, 'Extraindo frames do vídeo', signal => extractFrames(current, signal), controller);
            transferred = true;
            return json(res, 202, { project: current, ...result });
          } finally {
            try { if (tmp) await fs.rm(tmp, { force: true }); }
            finally { if (!transferred && locks.get(projectId) === controller) locks.delete(projectId); }
          }
        }
        const data = await body(req);
        if (action === 'rename') return json(res, 200, await updateProject(projectId, x => { x.name = text(data.name, 100); }));
        if (action === 'transcript') {
          if (!p.source) fail('Importe um vídeo primeiro.'); const cues = parseSrt(data.srt, p.source.duration);
          return json(res, 200, await updateProject(projectId, x => { x.transcript = cues; }));
        }
        if (action === 'transcribe') {
          if (!p.source?.audio) fail('Sem áudio para transcrever. Importe um SRT.');
          return json(res, 202, await job(projectId, 'Transcrevendo áudio localmente', signal => transcribe(p, signal)));
        }
        if (action === 'chat') {
          const prompt = text(data.prompt, 4000);
          return json(res, 202, await job(projectId, 'Claude está analisando o contexto', async signal => {
            const current = await updateProject(projectId, x => { if (x.chat.length >= 1000) fail('Histórico atingiu 1000 mensagens. Crie um projeto novo.'); x.chat.push({ id: randomUUID(), role: 'user', text: prompt, at: new Date().toISOString() }); });
            const plan = await planWithAI(current, prompt, signal);
            await updateProject(projectId, x => { const { skillsUsed, ...clean } = plan; x.chat.push({ id: randomUUID(), role: 'assistant', text: plan.message, skills: skillsUsed, at: new Date().toISOString() }); if (plan.kind !== 'reply') x.plan = clean; });
          }));
        }
        if (action === 'plan') { const plan = validatePlan(data, p); return json(res, 200, await updateProject(projectId, x => { x.plan = plan; })); }
        if (action === 'automatic') {
          if (typeof data.enabled !== 'boolean') fail('Opção automática inválida.');
          if (data.enabled && (!secret('COMPOSIO_API_KEY') || !(await settings()).connectedAccountId || !(await settings()).igUserId)) fail('Conecte e configure o Instagram antes de ativar publicação automática.');
          const caption = text(data.caption ?? '', 2200, false);
          return json(res, 200, await updateProject(projectId, x => { x.autoPublish = data.enabled; x.autoCaption = caption; }));
        }
        if (action === 'render') {
          if (!p.plan) fail('Crie um plano primeiro.'); const options = renderOptions(data);
          if (p.plan.kind === 'cuts' && options.captions && !p.transcript.length) fail('Importe SRT ou transcreva para renderizar legendas.');
          return json(res, 202, await job(projectId, 'Preparando render', async (signal, progress) => {
            if (p.plan.kind === 'cuts') await renderCuts(p, options, signal, progress); else await renderCreation(p, signal, progress, options);
            if (p.autoPublish) { const now = await readProject(projectId); for (const r of now.results.filter(r => !p.results.some(old => old.id === r.id))) await publish(await readProject(projectId), r.id, p.autoCaption || '', signal, progress); }
          }));
        }
        if (action === 'publish') {
          if (data.confirm !== true) fail('Confirme explicitamente a publicação.'); const resultId = id(data.resultId), caption = text(data.caption || '', 2200, false);
          return json(res, 202, await job(projectId, 'Preparando publicação Instagram', (signal, progress) => publish(p, resultId, caption, signal, progress)));
        }
      }
      fail('Rota não encontrada.', 404);
    }
    if (['GET', 'HEAD'].includes(req.method) && ['/', '/app.js', '/style.css', '/fonts/sans.woff2', '/fonts/serif.woff2'].includes(u.pathname)) {
      const name = u.pathname === '/' ? 'index.html' : u.pathname.slice(1), file = path.join(APP, 'public', name);
      return media(req, res, file, name.endsWith('.html') ? 'text/html; charset=utf-8' : name.endsWith('.js') ? 'text/javascript; charset=utf-8' : name.endsWith('.woff2') ? 'font/woff2' : 'text/css; charset=utf-8');
    }
    fail('Rota não encontrada.', 404);
  } catch (e) {
    if (res.headersSent || res.destroyed) return;
    json(res, e.status || (e.code === 'ENOENT' ? 404 : 500), { error: e.status ? e.message : 'A operação falhou. Verifique arquivos, dependências e permissões locais.' });
  }
});
server.requestTimeout = 10 * 60 * 1000; server.headersTimeout = 15000;
// BIND=0.0.0.0 só dentro do Docker; a porta é publicada apenas em 127.0.0.1 do host.
server.listen(PORT, process.env.BIND || '127.0.0.1', () => console.log(`Plano Studio: ${ORIGIN}`));
server.on('error', e => { console.error(`Servidor não iniciou: ${e.code}.`); process.exitCode = 1; });
for (const event of ['SIGINT', 'SIGTERM']) process.on(event, () => { for (const c of locks.values()) c.abort(); server.close(); });
