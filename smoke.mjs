import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import http from 'node:http';
import { discover, run, probe } from './engine.mjs';

const artifacts = path.resolve('test-artifacts', 'smoke-' + randomUUID());
await fs.mkdir(artifacts, { recursive: true });
const port = 4328, origin = 'http://127.0.0.1:' + port;
const ai = process.env.SMOKE_AI || (process.env.SMOKE_CLAUDE === '1' ? 'claude-cli' : '');
const mockCalls = [];
const mockPlan = { kind: 'create', message: 'Plano do mock.', cuts: [], palette: 'slate', scenes: [{ title: 'Voz do mock.', text: 'Cena com narração.', narration: 'Olá, esta é a primeira cena.', duration: 3 }, { title: 'Segunda cena', text: 'Fim.', narration: '', duration: 2 }] };
let mockMp3;
const mock = http.createServer((req, res) => {
  let body = ''; req.on('data', c => { body += c; }); req.on('end', () => {
    mockCalls.push({ url: req.url, auth: req.headers.authorization || req.headers['xi-api-key'], body: body ? JSON.parse(body) : null });
    if (req.url === '/openai/responses') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(mockPlan) }] }] })); }
    if (req.url === '/openrouter/chat/completions') { res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ ...mockPlan, palette: 'clay' }) } }] })); }
    if (req.url.startsWith('/elevenlabs/text-to-speech/')) { res.setHeader('content-type', 'audio/mpeg'); return res.end(mockMp3); }
    res.statusCode = 404; res.end();
  });
});
await new Promise(r => mock.listen(0, '127.0.0.1', r));
const mockBase = 'http://127.0.0.1:' + mock.address().port;
const child = spawn(process.execPath, ['server.mjs'], { cwd: process.cwd(), shell: false, windowsHide: true, env: { ...process.env, PORT: String(port), STUDIO_DATA: path.join(artifacts, 'data'), OPENAI_BASE_URL: mockBase + '/openai', OPENROUTER_BASE_URL: mockBase + '/openrouter', ELEVENLABS_BASE_URL: mockBase + '/elevenlabs', OPENAI_API_KEY: '', OPENROUTER_API_KEY: '', ELEVENLABS_API_KEY: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
let log = ''; child.stdout.on('data', c => { log += c; }); child.stderr.on('data', c => { log += c; });
const report = { artifacts, checks: [], projects: [], commands: [], limitations: [] };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
let token;
async function request(route, data, headers = {}) {
  const response = await fetch(origin + route, { ...(data !== undefined ? { method: 'POST', body: data instanceof Buffer ? data : JSON.stringify(data) } : {}), headers: { ...(data !== undefined ? { origin, 'x-studio-token': token, 'content-type': data instanceof Buffer ? 'video/mp4' : 'application/json' } : {}), ...headers } });
  return { response, body: response.headers.get('content-type')?.includes('json') ? await response.json() : await response.arrayBuffer() };
}
async function ok(route, data, headers) {
  const r = await request(route, data, headers); assert(r.response.ok, JSON.stringify(r.body)); return r.body;
}
async function wait(projectId, max = 120000) {
  const start = Date.now();
  for (;;) {
    const p = await ok('/api/projects/' + projectId);
    if (p.job?.status !== 'running') { assert.equal(p.job.status, 'done', JSON.stringify(p.job)); return p; }
    if (Date.now() - start > max) throw new Error('Job timeout: ' + p.job.label);
    await sleep(1000);
  }
}
try {
  for (let i = 0; i < 50; i++) { try { const b = await ok('/api/bootstrap'); token = b.token; report.capabilities = b.capabilities; break; } catch { await sleep(200); } }
  assert(token, log);
  const home = await request('/'); assert.equal(home.response.status, 200);
  const csrf = await request('/api/projects', { name: 'bloqueado' }, { origin: 'https://evil.example' }); assert.equal(csrf.response.status, 403);
  const missingToken = await request('/api/projects', { name: 'bloqueado' }, { 'x-studio-token': '' }); assert.equal(missingToken.response.status, 403);
  const badHost = await new Promise((resolve, reject) => { const req = http.get(origin + '/api/bootstrap', { headers: { host: 'evil.example:4328' } }, res => { res.resume(); resolve(res.statusCode); }); req.on('error', reject); });
  assert.equal(badHost, 403);
  assert.equal((await request('/api/projects/not-a-uuid')).response.status, 400);
  assert.equal((await request('/data/settings.json')).response.status, 404);
  report.checks.push('HTTP 200, origem/Host/CSRF/ID inválidos bloqueados, data não servido');
  const b = await discover(), source = path.join(artifacts, 'fixture.mp4');
  const args = ['-v', 'error', '-nostdin', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', source];
  if (process.env.SMOKE_VIDEO) { await fs.copyFile(path.resolve(process.env.SMOKE_VIDEO), source); report.fixture = { type: 'MP4 externo real', source: path.resolve(process.env.SMOKE_VIDEO) }; }
  else { await run(b.ffmpeg, args); report.commands.push({ cmd: 'ffmpeg: lavfi testsrc2+sine -> fixture.mp4 (4s)', exitCode: 0 }); report.fixture = { type: 'Barras de teste e sinal de áudio gerados localmente' }; }
  const fixture = await fs.readFile(source);
  let p = await ok('/api/projects', { name: 'Teste técnico de MP4' }); report.projects.push(p.id);
  const base = '/api/projects/' + p.id;
  const invalid = await request(base + '/upload', Buffer.from('xxxxxxxxxxxxxxxxxxxxxxxx'), { 'x-file-name': 'invalid.mp4' });
  assert.equal(invalid.response.status, 422);
  await ok(base + '/upload', fixture, { 'x-file-name': 'fixture.mp4' }); p = await wait(p.id);
  assert.equal(p.frames.length, 5);
  const original = await fs.readFile(path.join(artifacts, 'data', 'projects', p.id, 'original.mp4'));
  assert.equal(createHash('sha256').update(original).digest('hex'), createHash('sha256').update(fixture).digest('hex'));
  assert.equal((await request(base + '/upload', fixture, { 'x-file-name': 'fixture.mp4' })).response.status, 409);
  const ranged = await request(base + '/original', undefined, { range: 'bytes=0-31' }); assert.equal(ranged.response.status, 206); assert.equal(ranged.body.byteLength, 32);
  assert.equal((await request(base + '/original', undefined, { range: 'bytes=999999999-' })).response.status, 416);
  report.checks.push('MP4 válido importado, 5 frames, original byte a byte preservado, overwrite bloqueado, range 206/416');
  const srt = '1\n00:00:00,000 --> 00:00:02,000\nTeste técnico de legenda.\n\n2\n00:00:02,000 --> 00:00:04,000\nNão é uma transcrição de fala.';
  await ok(base + '/transcript', { srt });
  assert.equal((await request(base + '/plan', { kind: 'cuts', message: 'inválido', cuts: [{ start: -1, end: 2, title: 'A' }] })).response.status, 400);
  await ok(base + '/plan', { kind: 'cuts', message: 'Verificação de corte vertical legendado.', cuts: [{ start: 0.5, end: 3.5, title: 'Corte técnico', rationale: 'Teste, sem conteúdo de usuário.' }] });
  await ok(base + '/render', { framing: 'fill', captionStyle: 'impact', captions: true, width: 720 }); p = await wait(p.id);
  assert.equal(p.results.length, 1); assert.equal(p.results[0].captions, true);
  const output = path.join(artifacts, 'data', 'projects', p.id, 'results', p.results[0].id, 'output.mp4');
  const info = await probe(output); assert.equal(info.width, 720); assert.equal(info.height, 1280); assert(Math.abs(info.duration - 3) < 0.1);
  await run(b.ffmpeg, ['-v', 'error', '-nostdin', '-y', '-ss', '1', '-i', output, '-frames:v', '1', path.join(artifacts, 'cut-frame.png')]);
  assert((await fs.stat(path.join(artifacts, 'cut-frame.png'))).size > 100);
  report.checks.push('Corte H.264/AAC 720x1280, 3s, legendas gravadas, SRT sidecar, frame decodificado');
  assert.equal((await request('/api/instagram/connect', {})).response.status, 400);
  assert.equal((await request(base + '/publish', { resultId: p.results[0].id, caption: '', confirm: false })).response.status, 400);
  report.checks.push('Publicação sem confirmação bloqueada; nenhuma postagem executada');
  if (ai) {
    const current = (await ok('/api/bootstrap')).settings;
    await ok('/api/settings', { ...current, provider: ai });
    report.checks.push('Provedor real escolhido: ' + ai);
    await ok(base + '/chat', { prompt: 'Responda como reply, sem cortes e sem criar cenas: descreva brevemente o que vê nos 5 frames e informe que as legendas são de teste, sem transcrição de fala real. Você não recebeu o áudio.' });
    p = await wait(p.id, 260000); assert(p.chat.some(c => c.role === 'assistant'));
    report.checks.push(ai + ' real: resposta estruturada com frames e legendas do teste');
    await ok(base + '/chat', { prompt: 'Proponha exatamente um corte vertical deste vídeo técnico, de 0.5 a 3.5 segundos. Retorne kind cuts. Não invente falas; explique que são padrões de teste.' });
    p = await wait(p.id, 260000); assert.equal(p.plan.kind, 'cuts'); assert.equal(p.plan.cuts.length, 1);
    report.checks.push(ai + ' real: plano de corte recebido e validado contra duração do original');
  }
  const creation = await ok('/api/projects', { name: 'Teste de criação HyperFrames' }); report.projects.push(creation.id);
  const creationBase = '/api/projects/' + creation.id;
  if (ai) {
    await ok(creationBase + '/chat', { prompt: 'Crie uma composição tipográfica vertical de teste, kind create, com exatamente UMA cena de exatamente 3 segundos. Título: Uma ideia em movimento. Texto: Teste local de composição HTML. Paleta ivory. Sem voz nem mídia gerada.' });
    const planned = await wait(creation.id, 260000); assert.equal(planned.plan.kind, 'create'); assert.equal(planned.plan.scenes.length, 1); assert.equal(planned.plan.scenes[0].duration, 3);
    report.checks.push(ai + ' real: plano de criação de cena HyperFrames recebido e validado');
  } else await ok(creationBase + '/plan', { kind: 'create', message: 'Composição técnica, sem voz.', palette: 'ivory', scenes: [{ title: 'Uma ideia em movimento.', text: 'Teste local de composição HTML.', duration: 3 }, { title: 'Pronto para o próximo plano.', text: 'Segunda cena: montagem e continuidade verificadas.', duration: 3 }] });
  await ok(creationBase + '/render', { framing: 'fill', captionStyle: 'clean', captions: false, width: 720 });
  const rendered = await wait(creation.id, 300000); assert.equal(rendered.results.length, 1);
  const creationFile = path.join(artifacts, 'data', 'projects', creation.id, 'results', rendered.results[0].id, 'output.mp4');
  const expectedDuration = rendered.plan.scenes.reduce((total, scene) => total + scene.duration, 0);
  const createdInfo = await probe(creationFile); assert.equal(createdInfo.width, 720); assert.equal(createdInfo.height, 1280); assert(Math.abs(createdInfo.duration - expectedDuration) < 0.1);
  await run(b.ffmpeg, ['-v', 'error', '-nostdin', '-y', '-ss', '1', '-i', creationFile, '-frames:v', '1', path.join(artifacts, 'creation-frame.png')]);
  await run(b.ffmpeg, ['-v', 'error', '-nostdin', '-y', '-ss', String(expectedDuration - 1), '-i', creationFile, '-frames:v', '1', path.join(artifacts, 'creation-last-frame.png')]);
  report.checks.push('HyperFrames check+render: MP4 real 720x1280, ' + expectedDuration + 's, ' + rendered.plan.scenes.length + ' cena(s), sem voz, frames decodificados');
  const voiceFile = path.join(artifacts, 'voice.mp3');
  await run(b.ffmpeg, ['-v', 'error', '-nostdin', '-y', '-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=44100', '-t', '1.5', '-c:a', 'libmp3lame', voiceFile]);
  mockMp3 = await fs.readFile(voiceFile);
  const current = (await ok('/api/bootstrap')).settings;
  await ok('/api/secrets', { OPENAI_API_KEY: 'sk-mock-openai-0001', OPENROUTER_API_KEY: 'sk-or-mock-0002', ELEVENLABS_API_KEY: 'sk_mock_eleven_0003' });
  const keys = (await ok('/api/bootstrap')).capabilities.keys;
  assert(keys.OPENAI_API_KEY.set && !JSON.stringify(keys).includes('mock-openai'), 'Chave não pode voltar para a UI.');
  const voiced = await ok('/api/projects', { name: 'Teste de provedores e voz' }); report.projects.push(voiced.id);
  const vbase = '/api/projects/' + voiced.id;
  await ok('/api/settings', { ...current, provider: 'openai-api', effort: 'high' });
  await ok(vbase + '/chat', { prompt: 'Crie duas cenas com narração.' }); let vp = await wait(voiced.id);
  const openaiCall = mockCalls.find(c => c.url === '/openai/responses');
  assert.equal(openaiCall.auth, 'Bearer sk-mock-openai-0001'); assert.equal(openaiCall.body.model, 'gpt-6.1-sol'); assert.equal(openaiCall.body.reasoning.effort, 'high');
  assert.equal(openaiCall.body.text.format.type, 'json_schema'); assert.equal(openaiCall.body.text.format.strict, true);
  assert.equal(vp.plan.kind, 'create'); assert.equal(vp.plan.scenes[0].narration, 'Olá, esta é a primeira cena.');
  await ok('/api/settings', { ...current, provider: 'openrouter' });
  await ok(vbase + '/chat', { prompt: 'Mesma coisa pelo OpenRouter.' }); vp = await wait(voiced.id);
  const routerCall = mockCalls.find(c => c.url === '/openrouter/chat/completions');
  assert.equal(routerCall.auth, 'Bearer sk-or-mock-0002'); assert.equal(routerCall.body.model, 'anthropic/claude-opus-5.5'); assert.equal(routerCall.body.reasoning.effort, 'medium');
  assert.equal(routerCall.body.response_format.json_schema.strict, true); assert.equal(vp.plan.palette, 'clay');
  report.checks.push('OpenAI e OpenRouter (mock local): chave, modelo, esforço e JSON Schema estrito corretos; plano validado');
  await ok(vbase + '/render', { framing: 'fill', captionStyle: 'clean', captions: false, width: 720, narration: true }); vp = await wait(voiced.id, 300000);
  const ttsCalls = mockCalls.filter(c => c.url.startsWith('/elevenlabs/'));
  assert.equal(ttsCalls.length, 2, 'Uma fala por cena (sem narração usa título e texto).'); assert.equal(ttsCalls[0].auth, 'sk_mock_eleven_0003');
  assert.equal(ttsCalls[0].body.text, 'Olá, esta é a primeira cena.'); assert.equal(ttsCalls[1].body.text, 'Segunda cena. Fim.');
  assert.equal(ttsCalls[0].body.model_id, 'eleven_multilingual_v2');
  const voicedInfo = await probe(path.join(artifacts, 'data', 'projects', voiced.id, 'results', vp.results[0].id, 'output.mp4'));
  assert.equal(voicedInfo.audio, true); assert(Math.abs(voicedInfo.duration - 5) < 0.15, 'Duração ' + voicedInfo.duration); assert.equal(vp.results[0].narrated, true);
  report.checks.push('Narração ElevenLabs (mock): 2 falas geradas, mixadas no tempo das cenas, MP4 5 s com áudio');
  await ok('/api/settings', current);
  report.commands.push({ cmd: 'node smoke.mjs', exitCode: 0 });
  report.limitations.push(process.env.SMOKE_VIDEO ? 'MP4 externo real usado só no teste; legendas técnicas importadas, sem alegar transcrição de fala.' : 'Fixture MP4 de teste gerada por FFmpeg, com sinal de áudio e legendas técnicas; não é mídia de cliente nem transcrição real.', 'Instagram não publicado; credenciais ausentes. ASR depende de Whisper/modelo local.');
  await fs.writeFile(path.join(artifacts, 'report.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (e) {
  report.error = e.message;
  await fs.writeFile(path.join(artifacts, 'report.json'), JSON.stringify(report, null, 2));
  console.error('Smoke falhou:', e.message, '\nEvidência:', artifacts); process.exitCode = 1;
} finally {
  child.kill(); mock.close(); await fs.writeFile(path.join(artifacts, 'server.log'), log);
}
