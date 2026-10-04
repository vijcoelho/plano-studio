import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export const ROOT = path.resolve(process.env.STUDIO_DATA || 'data');
export const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
export function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
export function id(value) { if (typeof value !== 'string' || !UUID.test(value)) fail('ID inválido.'); return value; }
export function text(value, max = 4000, required = true) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim()) || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value)) fail('Texto inválido ou muito longo.');
  return value.trim();
}
export async function safe(base, ...parts) {
  const target = path.resolve(base, ...parts);
  const relative = path.relative(base, target);
  if (relative.startsWith('..') || path.isAbsolute(relative)) fail('Caminho fora do projeto.');
  const parsed = path.parse(target);
  let current = parsed.root;
  for (const part of target.slice(parsed.root.length).split(path.sep)) {
    current = path.join(current, part);
    try { if ((await fs.lstat(current)).isSymbolicLink()) fail('Links simbólicos não são permitidos.'); }
    catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  return target;
}
export async function initStore() { await safe(ROOT); await fs.mkdir(path.join(ROOT, 'projects'), { recursive: true }); await loadSecrets(); }
export async function projectDir(value) { return safe(ROOT, 'projects', id(value)); }
const writes = new Map();
export async function atomic(file, value) {
  // ponytail: fila por arquivo em um processo; usar lock de arquivo se houver vários servidores.
  const prior = writes.get(file) || Promise.resolve();
  const next = prior.catch(() => {}).then(async () => {
    await safe(ROOT, path.relative(ROOT, file));
    const tmp = `${file}.${randomUUID()}.tmp`;
    let handle;
    try {
      handle = await fs.open(tmp, 'wx', 0o600);
      await handle.writeFile(JSON.stringify(value, null, 2)); await handle.sync(); await handle.close(); handle = null;
      // Windows: antivírus/indexador ou leitor concorrente segura o destino por instantes (EPERM/EBUSY/EACCES).
      for (let i = 0; ; i++) {
        try { await fs.rename(tmp, file); break; }
        catch (e) { if (i >= 25 || !['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) throw e; await new Promise(r => setTimeout(r, Math.min(100, 10 * (i + 1)))); }
      }
    } finally { await handle?.close(); await fs.rm(tmp, { force: true }); }
  });
  writes.set(file, next);
  try { await next; } finally { if (writes.get(file) === next) writes.delete(file); }
}
export async function readProject(value) {
  try { return JSON.parse(await fs.readFile(await safe(await projectDir(value), 'project.json'), 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') fail('Projeto não encontrado.', 404); throw e; }
}
const mutations = new Map();
export async function updateProject(value, change) {
  id(value);
  const previous = mutations.get(value) || Promise.resolve();
  const next = previous.catch(() => {}).then(async () => {
    const p = await readProject(value); await change(p); p.updatedAt = new Date().toISOString();
    await atomic(await safe(await projectDir(value), 'project.json'), p); return p;
  });
  mutations.set(value, next);
  try { return await next; } finally { if (mutations.get(value) === next) mutations.delete(value); }
}
export async function createProject(name) {
  const p = { id: randomUUID(), name: text(name, 100), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), source: null, frames: [], transcript: [], chat: [], plan: null, results: [], job: null, autoPublish: false };
  const dir = await projectDir(p.id); await fs.mkdir(dir, { recursive: true });
  await atomic(path.join(dir, 'project.json'), p); return p;
}
export async function listProjects() {
  const files = await fs.readdir(await safe(ROOT, 'projects'));
  const projects = [];
  for (const name of files.filter(x => UUID.test(x))) {
    const p = await readProject(name); projects.push(p);
  }
  return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
// IA que planeja: Claude (CLI do Claude Code ou API), Codex (CLI ou API OpenAI) ou OpenRouter. Padrão: Opus 5.5, esforço médio.
export const PROVIDERS = ['claude-cli', 'claude-api', 'codex-cli', 'openai-api', 'openrouter'];
export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
export const DEFAULT_MODELS = { claude: 'claude-opus-5-5', openai: 'gpt-6.1-sol', openrouter: 'anthropic/claude-opus-5.5' };
const DEFAULTS = { provider: 'claude-cli', models: DEFAULT_MODELS, effort: 'medium', skills: true, voiceId: 'JBFqnCBsd6RMkjVDRZzb', voiceModel: 'eleven_multilingual_v2', authConfigId: '', connectedAccountId: '', igUserId: '', userId: 'local-studio' };
export async function settings() {
  let saved = {};
  try { saved = JSON.parse(await fs.readFile(await safe(ROOT, 'settings.json'), 'utf8')); }
  catch (e) { if (e.code !== 'ENOENT') throw e; }
  // Ajustes antigos guardavam só o alias do Claude (sonnet/opus/haiku); viram o padrão novo.
  const { model, ...rest } = saved;
  return { ...DEFAULTS, ...rest, models: { ...DEFAULT_MODELS, ...(saved.models || {}) } };
}
export function validateSettings(s) {
  if (!s || typeof s !== 'object') fail('Configuração inválida.');
  const out = {};
  for (const key of ['authConfigId', 'connectedAccountId', 'igUserId', 'userId', 'voiceId', 'voiceModel']) {
    out[key] = text(s[key] ?? '', 120, false);
    if (out[key] && !/^[\w.-]+$/.test(out[key])) fail('Identificador de configuração inválido.');
  }
  if (!out.userId) out.userId = DEFAULTS.userId;
  if (!out.voiceId) out.voiceId = DEFAULTS.voiceId;
  if (!out.voiceModel) out.voiceModel = DEFAULTS.voiceModel;
  out.skills = s.skills !== false;
  if (out.igUserId && !/^\d{1,30}$/.test(out.igUserId)) fail('ID Instagram deve ser numérico.');
  out.provider = PROVIDERS.includes(s.provider) ? s.provider : fail('Provedor de IA inválido.');
  out.effort = EFFORTS.includes(s.effort) ? s.effort : fail('Nível de esforço inválido.');
  out.models = {};
  for (const [key, fallback] of Object.entries(DEFAULT_MODELS)) {
    const value = text(s.models?.[key] ?? '', 120, false) || fallback;
    if (!/^[\w.:/~-]+$/.test(value)) fail('Nome de modelo inválido.');
    out.models[key] = value;
  }
  return out;
}
// Chaves de API: o ambiente vence; as salvas pela tela ficam em secrets.json (0600) e nunca voltam para a UI.
export const SECRET_KEYS = ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'OPENROUTER_API_KEY', 'ELEVENLABS_API_KEY', 'COMPOSIO_API_KEY'];
const secrets = {};
export const secret = key => process.env[key] || secrets[key] || '';
export async function loadSecrets() {
  try { Object.assign(secrets, JSON.parse(await fs.readFile(await safe(ROOT, 'secrets.json'), 'utf8'))); }
  catch (e) { if (e.code !== 'ENOENT') throw e; }
}
export function secretStatus() {
  return Object.fromEntries(SECRET_KEYS.map(key => [key, process.env[key] ? { set: true, source: 'env' } : secrets[key] ? { set: true, source: 'saved', hint: '…' + secrets[key].slice(-4) } : { set: false }]));
}
export async function saveSecrets(input) {
  if (!input || typeof input !== 'object') fail('Chaves inválidas.');
  const next = { ...secrets };
  for (const [key, value] of Object.entries(input)) {
    if (!SECRET_KEYS.includes(key) || typeof value !== 'string') fail('Chave desconhecida.');
    const clean = value.trim();
    if (clean && !/^[\x21-\x7e]{8,400}$/.test(clean)) fail('Chave inválida: cole sem espaços ou quebras de linha.');
    if (clean) next[key] = clean; else delete next[key];
  }
  await atomic(await safe(ROOT, 'secrets.json'), next);
  for (const key of SECRET_KEYS) delete secrets[key];
  Object.assign(secrets, next);
  return secretStatus();
}
export function validatePlan(plan, p) {
  if (!plan || !['cuts', 'create', 'reply'].includes(plan.kind)) fail('Plano inválido.');
  const result = { kind: plan.kind, message: text(plan.message, 6000) };
  if (plan.kind === 'cuts') {
    if (!p.source || !Array.isArray(plan.cuts) || plan.cuts.length < 1 || plan.cuts.length > 8) fail('Selecione de 1 a 8 cortes de um vídeo importado.');
    result.cuts = plan.cuts.map(c => {
      if (!Number.isFinite(c.start) || !Number.isFinite(c.end) || c.start < 0 || c.end > p.source.duration + 0.05 || c.end - c.start < 0.5 || c.end - c.start > 180) fail('Corte fora da duração do vídeo (máximo 180 s).');
      return { start: c.start, end: c.end, title: text(c.title, 100), rationale: text(c.rationale || 'Corte selecionado manualmente.', 500) };
    });
  }
  if (plan.kind === 'create') {
    if (!Array.isArray(plan.scenes) || plan.scenes.length < 1 || plan.scenes.length > 6) fail('Criação precisa de 1 a 6 cenas.');
    result.scenes = plan.scenes.map(s => {
      if (!Number.isFinite(s.duration) || s.duration < 2 || s.duration > 15) fail('Cada cena deve ter de 2 a 15 segundos.');
      return { title: text(s.title, 90), text: text(s.text, 220, false), narration: text(s.narration ?? '', 400, false), duration: s.duration };
    });
    result.palette = ['ivory', 'slate', 'clay'].includes(plan.palette) ? plan.palette : 'ivory';
  }
  return result;
}
export function parseSrt(input, duration) {
  text(input, 500000);
  const cues = [];
  const blocks = input.replace(/^\uFEFF/, '').replace(/\r/g, '').trim().split(/\n\s*\n/);
  const stamp = s => { const m = /^(\d{2,3}):(\d{2}):(\d{2})[,.](\d{3})$/.exec(s); if (!m || +m[2] > 59 || +m[3] > 59) fail('Tempo SRT inválido.'); return +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000; };
  for (const block of blocks) {
    const lines = block.split('\n'); if (/^\d+$/.test(lines[0])) lines.shift();
    const times = lines.shift()?.split(/\s+-->\s+/); if (times?.length !== 2) fail('SRT inválido. Use blocos com início --> fim.');
    const start = stamp(times[0]), end = stamp(times[1]);
    if (end <= start || end > duration + 0.1 || (cues.length && start < cues.at(-1).end)) fail('Legendas fora do vídeo ou sobrepostas.');
    const content = text(lines.join(' ').replace(/<[^>]*>/g, ''), 240).replace(/[{}\\]/g, '');
    cues.push({ start, end, text: content });
    if (cues.length > 10000) fail('Legendas demais.');
  }
  return cues;
}
export function srtFor(cues, start, end) {
  const stamp = n => { const ms = Math.round(Math.max(0, n) * 1000); return `${String(Math.floor(ms / 3600000)).padStart(2, '0')}:${String(Math.floor(ms / 60000) % 60).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`; };
  // Falas longas viram blocos curtos (~32 caracteres), com tempo proporcional ao texto; legenda vertical legível.
  const out = [];
  for (const c of cues.filter(c => c.end > start && c.start < end)) {
    const chunks = []; for (const w of c.text.replace(/[{}\\<>]/g, '').split(/\s+/).filter(Boolean)) { if (chunks.length && (chunks.at(-1) + ' ' + w).length <= 32) chunks[chunks.length - 1] += ' ' + w; else chunks.push(w); }
    const total = chunks.join('').length; let t = c.start;
    for (const chunk of chunks) { const next = t + (c.end - c.start) * chunk.length / total; if (next > start && t < end) out.push([Math.max(t, start), Math.min(next, end), chunk]); t = next; }
  }
  return out.map(([a, b, s], i) => `${i + 1}\n${stamp(a - start)} --> ${stamp(b - start)}\n${s}\n`).join('\n');
}
