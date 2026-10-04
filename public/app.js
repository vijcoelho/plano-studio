const $ = id => document.getElementById(id);
// Tema: escolha salva vence; sem escolha, segue o sistema.
const themeRoot = document.documentElement, darkQuery = matchMedia('(prefers-color-scheme: dark)');
function setTheme(theme) { themeRoot.dataset.theme = theme; document.querySelector('meta[name=theme-color]').content = theme === 'dark' ? '#1f1e1d' : '#faf9f5'; $('theme-toggle').setAttribute('aria-pressed', String(theme === 'dark')); }
try { setTheme(localStorage.getItem('theme') || (darkQuery.matches ? 'dark' : 'light')); } catch { setTheme(darkQuery.matches ? 'dark' : 'light'); }
$('theme-toggle').onclick = () => { const next = themeRoot.dataset.theme === 'dark' ? 'light' : 'dark'; setTheme(next); try { localStorage.setItem('theme', next); } catch {} };
const escape = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const state = { token: '', caps: {}, config: {}, projects: [], current: null, result: null, pending: false };
const intro = $('chat-history').innerHTML;
let noticeTimer, pollTimer, publishResult, lastChat = '';
function notice(message, error = false) {
  // Popover vai para a camada de topo: o aviso aparece por cima de qualquer modal aberto.
  const n = $('notice'); n.textContent = message; n.classList.toggle('error', error); n.hidden = false;
  try { n.hidePopover(); n.showPopover(); } catch {}
  clearTimeout(noticeTimer); noticeTimer = setTimeout(() => { n.hidden = true; try { n.hidePopover(); } catch {} }, error ? 15000 : 6000);
}
async function api(url, data, raw = false) {
  const options = data === undefined ? {} : { method: 'POST', headers: { 'content-type': raw ? 'video/mp4' : 'application/json', 'x-studio-token': state.token, ...(raw ? { 'x-file-name': encodeURIComponent(data.name) } : {}) }, body: raw ? data : JSON.stringify(data) };
  const res = await fetch(url, options);
  const body = await res.json(); if (!res.ok) throw new Error(body.error || 'A operação falhou.'); return body;
}
async function perform(button, task) {
  if (button?.disabled) return;
  if (button) button.disabled = true;
  try { await task(); } catch (e) { notice(e.message || 'Não foi possível conectar ao servidor local.', true); }
  finally { if (button) button.disabled = false; renderControls(); }
}
const route = (action, projectId = state.current?.id) => '/api/projects/' + projectId + (action ? '/' + action : '');
const time = s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0');
function library() {
  const query = $('project-search').value.toLocaleLowerCase('pt-BR');
  $('project-count').textContent = state.projects.length;
  const projects = state.projects.filter(p => p.name.toLocaleLowerCase('pt-BR').includes(query));
  $('project-list').innerHTML = projects.length ? projects.map(p => '<button class="project-item ' + (p.id === state.current?.id ? 'active' : '') + '" data-project="' + p.id + '"><span><strong>' + escape(p.name) + '</strong><small>' + (p.source ? time(p.source.duration) : 'Criação do zero') + ' · ' + p.results.length + ' resultado(s)</small></span></button>').join('') : '<p class="muted">' + (query ? 'Nenhum projeto encontrado.' : 'Crie seu primeiro projeto. Os arquivos ficarão aqui.') + '</p>';
}
function renderControls() {
  const p = state.current, busy = state.pending || p?.job?.status === 'running';
  $('chat-send').disabled = busy || !providerReady();
  $('narration-option').hidden = p?.plan?.kind !== 'create'; $('narration-enabled').disabled = busy || !state.caps.voice; $('narration-option').title = state.caps.voice ? 'Gera a voz de cada cena com ElevenLabs' : 'Salve a chave ElevenLabs em Ajustes → Chaves de API';
  $('render').disabled = busy || !p?.plan || (p.plan.kind === 'cuts' && (!state.caps.ffmpeg || ($('captions-enabled').checked && !p.transcript.length))) || (p.plan.kind === 'create' && !state.caps.hyperframes);
  $('transcript-open').disabled = busy || !p?.source;
  $('transcribe').disabled = busy || !p?.source?.audio || !state.caps.hyperframes || !state.caps.transcription;
  $('transcribe').title = state.caps.transcription ? 'Transcrever com Whisper local; o modelo small (466 MB) será baixado na primeira vez se necessário.' : 'Whisper local não instalado. Importe um SRT ou configure a ferramenta em Conexões e ajustes.';
  $('manual-toggle').disabled = busy || !p?.source;
  $('file-input').disabled = busy || !!p?.source;
  $('upload-hero').disabled = busy || !state.caps.ffprobe;
  $('view-original').disabled = !p?.source;
  $('view-result').disabled = !p?.results.length;
  $('save-automatic').disabled = !p || busy;
  for (const input of document.querySelectorAll('#plan input,#plan button')) input.disabled = busy;
}
function viewer(result = state.result) {
  const p = state.current, player = $('player');
  const selected = p?.results.find(r => r.id === result);
  let url = selected ? route('results/' + selected.id) : p?.source ? route('original') : '';
  $('viewer-empty').hidden = !!url; player.hidden = !url;
  if (url && player.getAttribute('src') !== url) { player.src = url; player.load(); }
  if (!url && player.hasAttribute('src')) { player.removeAttribute('src'); player.load(); }
  $('view-original').classList.toggle('active', !selected); $('view-result').classList.toggle('active', !!selected);
  $('media-info').textContent = selected ? selected.width + ' × ' + selected.height + ' · ' + time(selected.duration) + (selected.captions ? ' · legendado' : '') : p?.source ? p.source.width + ' × ' + p.source.height + ' · ' + time(p.source.duration) : 'Nenhum vídeo selecionado';
}
function drawPlan() {
  const plan = state.current?.plan;
  $('plan-empty').hidden = !!plan; $('plan').hidden = !plan;
  if (!plan) return;
  $('plan').innerHTML = '<p class="plan-summary">' + escape(plan.message) + '</p>' + (plan.kind === 'cuts' ? plan.cuts.map((c, i) => '<div class="plan-cut" data-index="' + i + '"><label>Início (s)<input data-field="start" type="number" step="0.1" min="0" value="' + c.start + '"></label><label>Fim (s)<input data-field="end" type="number" step="0.1" min="0.5" value="' + c.end + '"></label><label>Título<input data-field="title" maxlength="100" value="' + escape(c.title) + '"></label><p>' + escape(c.rationale) + '</p></div>').join('') + '<button id="save-plan" class="secondary plan-save">Salvar ajustes dos cortes</button>' : plan.scenes.map((s, i) => '<div class="plan-scene"><span class="n">' + String(i + 1).padStart(2, '0') + '</span><strong>' + escape(s.title) + '</strong><p>' + escape(s.text) + '</p><small>' + s.duration + ' s</small></div>').join(''));
  $('render-help').textContent = plan.kind === 'create' ? 'Composição tipográfica 720 × 1280, sem voz.' : state.current.transcript.length ? 'MP4 vertical com legendas reais.' : 'Sem SRT: importe legendas ou desative a gravação.';
  for (const input of document.querySelectorAll('.presets select,#captions-enabled')) input.disabled = plan.kind === 'create';
}
function results() {
  const p = state.current; $('result-count').textContent = p?.results.length || 0;
  $('results').innerHTML = p?.results.length ? p.results.slice().reverse().map(r => '<article class="result"><button class="result-thumb" data-preview="' + r.id + '" aria-label="Assistir ' + escape(r.title) + '"><video src="' + route('results/' + r.id) + '#t=0.8" preload="metadata" muted playsinline tabindex="-1" aria-hidden="true"></video><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg></button><div><h3>' + escape(r.title) + '</h3><p>' + time(r.duration) + ' · ' + r.width + ' × ' + r.height + ' · ' + (r.captions ? 'Legendas gravadas' : r.kind === 'creation' ? 'Composição HyperFrames' : 'Sem legendas') + '</p>' + (r.publication ? '<p>Instagram: ' + escape(({ published: 'publicado', unknown: 'envio incerto; confira sua conta antes de reenviar', staging: 'enviando', processing: 'processando', creating: 'criando container', publishing: 'publicando', 'failed-before-create': 'falhou antes de criar publicação' })[r.publication.status] || r.publication.status) + '</p>' : '') + '<div class="result-actions"><a href="' + route('results/' + r.id) + '?download=1" download>Exportar MP4</a>' + (r.sidecar ? '<a href="' + route('results/' + r.id + '/captions') + '" download>Baixar SRT</a>' : '') + '<button class="quiet" data-publish="' + r.id + '" ' + (r.publication && r.publication.status !== 'failed-before-create' ? 'disabled' : '') + '>Publicar no Instagram</button></div></div></article>').join('') : '<div class="results-empty"><p>Vídeos finalizados aparecem aqui.</p></div>';
}
function chat() {
  const p = state.current, signature = JSON.stringify([p?.id, p?.chat, p?.job?.status, p?.job?.label]);
  if (signature === lastChat) return;
  const history = $('chat-history'), nearBottom = history.scrollHeight - history.scrollTop - history.clientHeight < 90;
  const changing = !lastChat; lastChat = signature;
  history.innerHTML = p?.chat.length ? p.chat.map(c => '<div class="message ' + escape(c.role) + '"><div class="message-label">' + (c.role === 'user' ? 'Você' : 'Claude' + (c.skills?.length ? ' · skills: ' + escape(c.skills.join(', ')) : '')) + '</div><div class="message-body">' + escape(c.text) + '</div></div>').join('') : intro;
  if (p?.job?.status === 'running' && p.job.label.includes('Claude')) history.insertAdjacentHTML('beforeend', '<p class="chat-busy">' + (state.config.skills !== false && state.caps.skills?.length ? 'Claude está consultando suas skills…' : 'Claude está pensando…') + '</p>');
  if (nearBottom || changing) history.scrollTop = history.scrollHeight;
}
function render(full = false) {
  const p = state.current;
  $('project-name').textContent = p?.name || 'O que vamos criar hoje?';
  $('project-meta').textContent = p ? (p.source ? 'Vídeo importado · original preservado' : 'Criação do zero') : 'Uma ideia vira um vídeo';
  $('rename-project').hidden = !p;
  $('upload-label').textContent = p?.source ? p.source.name : 'Arraste um MP4';
  $('upload-help').textContent = p?.source ? 'Original preservado · outro vídeo pede outro projeto' : 'ou clique para escolher · até 500 MB';
  $('transcript-info').textContent = p?.transcript.length ? p.transcript.length + ' blocos de legenda disponíveis' : p?.source && !state.caps.transcription ? 'Whisper ausente · importe um SRT' : 'Falas dão contexto ao Claude';
  $('chat-info').textContent = p?.frames.length ? p.frames.length + ' frames · ' + p.transcript.length + ' falas' : 'Importe um vídeo ou descreva uma ideia';
  $('frames-section').hidden = !p?.frames.length;
  $('frames').innerHTML = p?.frames.map(f => '<button class="frame-button" data-seek="' + f.at + '" aria-label="Ir para ' + time(f.at) + '"><img src="' + route('frames/' + f.filename) + '" alt="Frame do vídeo em ' + time(f.at) + '"><small>' + time(f.at) + '</small></button>').join('') || '';
  const job = p?.job; $('job-status').hidden = !job;
  if (job) { $('job-status').className = 'job-status ' + (job.status === 'error' ? 'error' : job.status === 'done' ? 'done' : ''); $('job-text').textContent = job.status === 'error' ? job.error : job.status === 'cancelled' ? 'Operação cancelada.' : job.label; $('cancel-job').hidden = job.status !== 'running'; $('job-status').querySelector('.spinner').hidden = job.status !== 'running'; }
  if (full) drawPlan();
  library(); viewer(); chat(); results(); renderControls(); poll();
}
function poll() {
  clearTimeout(pollTimer);
  if (state.current?.job?.status !== 'running') return;
  const target = state.current.id;
  pollTimer = setTimeout(async () => {
    try { const fresh = await api(route('', target)); if (state.current?.id !== target) return; const changed = JSON.stringify(fresh.plan) !== JSON.stringify(state.current.plan);
      // Render novo: mostra o resultado no player assim que fica pronto.
      if (fresh.results.length > state.current.results.length) { state.result = fresh.results.at(-1).id; notice(fresh.results.length - state.current.results.length > 1 ? 'Vídeos prontos. Exibindo o último.' : 'Vídeo pronto. Já está no player.'); }
      if (fresh.job?.status === 'error' && state.current.job?.status === 'running') notice(fresh.job.error, true);
      state.current = fresh; state.projects = state.projects.map(p => p.id === target ? fresh : p); render(changed); }
    catch (e) { notice('Conexão local interrompida. Recarregue após reiniciar o servidor.', true); }
  }, 1800);
}
async function refresh(target = state.current?.id, full = true) {
  state.projects = await api('/api/projects');
  if (state.current?.id === target) state.current = state.projects.find(p => p.id === target) || null;
  render(full);
}
async function selectProject(projectId) {
  state.current = await api(route('', projectId)); state.result = null; lastChat = ''; $('manual-panel').hidden = true;
  $('library').classList.remove('open'); $('library-toggle').setAttribute('aria-expanded', 'false'); render(true);
}
async function ensureProject(name = 'Minha próxima história') {
  if (!state.current) { state.current = await api('/api/projects', { name }); state.projects.unshift(state.current); state.result = null; render(true); }
  return state.current.id;
}
function editedPlan() {
  const plan = structuredClone(state.current.plan);
  if (plan?.kind === 'cuts') document.querySelectorAll('.plan-cut').forEach(el => {
    const cut = plan.cuts[Number(el.dataset.index)];
    el.querySelectorAll('input').forEach(input => { cut[input.dataset.field] = input.dataset.field === 'title' ? input.value : Number(input.value); });
  });
  return plan;
}
async function upload(file) {
  if (!file) return;
  if (!/\.mp4$/i.test(file.name) || file.size > 500 * 1024 * 1024) throw new Error('Escolha um MP4 de até 500 MB.');
  state.pending = true; renderControls();
  try {
    if (state.current?.source) { state.current = null; state.result = null; }
    const target = await ensureProject(file.name.replace(/\.mp4$/i, '').slice(0, 100));
    $('upload-label').textContent = 'Enviando e validando o MP4…';
    await api(route('upload', target), file, true); await refresh(target); notice('MP4 importado. O original está preservado.');
  } finally { state.pending = false; $('file-input').value = ''; render(); }
}
// Provedor pronto = tem login ou chave. Usado no chat, no badge de cada provedor e no botão de conectar.
const PROVIDER = {
  'claude-cli': { name: 'Claude Code', ready: c => c.claude && c.claudeLoggedIn, need: 'Conecte sua conta Claude' },
  'claude-api': { name: 'Claude API', ready: c => c.keys?.ANTHROPIC_API_KEY?.set, need: 'Falta a chave Anthropic' },
  'codex-cli': { name: 'Codex', ready: c => c.codex && (c.codexLoggedIn || c.keys?.OPENAI_API_KEY?.set), need: 'Conecte o ChatGPT ou salve a chave OpenAI' },
  'openai-api': { name: 'OpenAI', ready: c => c.keys?.OPENAI_API_KEY?.set, need: 'Falta a chave OpenAI' },
  openrouter: { name: 'OpenRouter', ready: c => c.keys?.OPENROUTER_API_KEY?.set, need: 'Falta a chave OpenRouter' }
};
const providerReady = () => !!PROVIDER[state.config.provider]?.ready(state.caps);
const modelLabel = () => { const c = state.config, m = c.provider.startsWith('claude') ? c.models.claude : c.provider === 'openrouter' ? c.models.openrouter : c.models.openai; return ({ 'claude-opus-5-5': 'Opus 5.5', 'claude-sonnet-5-5': 'Sonnet 5.5', 'claude-haiku-4-5': 'Haiku 4.5', 'claude-fable-5-1': 'Fable 5.1' })[m] || m; };
const EFFORT_LABEL = { low: 'esforço baixo', medium: 'esforço médio', high: 'esforço alto', xhigh: 'esforço muito alto', max: 'esforço máximo' };
const KEYS = [
  ['ANTHROPIC_API_KEY', 'Anthropic (Claude por API)', 'Para usar Claude cobrado por uso, sem login de assinatura.', 'https://console.anthropic.com/settings/keys', 'sk-ant-…'],
  ['OPENAI_API_KEY', 'OpenAI (GPT e Codex)', 'Para OpenAI por API; também autentica o Codex CLI se você não conectar o ChatGPT.', 'https://platform.openai.com/api-keys', 'sk-…'],
  ['OPENROUTER_API_KEY', 'OpenRouter', 'Uma chave só para Claude, GPT, Gemini e centenas de outros modelos.', 'https://openrouter.ai/keys', 'sk-or-…'],
  ['ELEVENLABS_API_KEY', 'ElevenLabs (voz)', 'Gera a narração dos vídeos criados do zero. Precisa da permissão Text to Speech.', 'https://elevenlabs.io/app/settings/api-keys', 'sk_…'],
  ['COMPOSIO_API_KEY', 'Composio (Instagram)', 'Publica Reels na sua conta Instagram profissional.', 'https://platform.composio.dev', 'ak_…']
];
function tab(name) {
  for (const b of document.querySelectorAll('[data-tab]')) b.setAttribute('aria-selected', String(b.dataset.tab === name));
  for (const p of document.querySelectorAll('[data-panel]')) p.hidden = p.dataset.panel !== name;
  $('settings-footer').hidden = !['ai', 'voice', 'instagram'].includes(name);
  try { localStorage.setItem('settings-tab', name); } catch {}
}
function settingsData() {
  const c = state.config, k = state.caps.keys || {};
  for (const r of document.querySelectorAll('[name=provider]')) r.checked = r.value === c.provider;
  for (const em of document.querySelectorAll('[data-ready]')) { const ok = PROVIDER[em.dataset.ready].ready(state.caps); em.textContent = ok ? 'Pronto' : 'Configurar'; em.classList.toggle('ok', ok); }
  $('model-claude').value = c.models.claude; $('model-openai').value = c.models.openai; $('model-openrouter').value = c.models.openrouter; $('effort').value = c.effort;
  $('voice-id').value = c.voiceId; $('voice-model').value = c.voiceModel;
  $('settings-claude-login').hidden = !state.caps.claude; $('settings-claude-login').textContent = state.caps.claudeLoggedIn ? 'Conta Claude conectada ✓ (reconectar)' : 'Conectar conta Claude';
  $('settings-codex-login').hidden = !state.caps.codex; $('settings-codex-login').textContent = state.caps.codexLoggedIn ? 'ChatGPT conectado ✓ (reconectar)' : 'Conectar conta ChatGPT (Codex)';
  $('auth-config').value = c.authConfigId; $('connected-account').value = c.connectedAccountId; $('ig-user').value = c.igUserId; $('composio-user').value = c.userId; $('skills-enabled').checked = c.skills !== false;
  $('skills-hint').textContent = state.caps.skills?.length ? 'Disponíveis: ' + state.caps.skills.join(', ') + '. A IA só lê as skills; o estúdio renderiza.' : 'Nenhuma skill de vídeo encontrada em ~/.claude/skills.';
  $('keys').innerHTML = KEYS.map(([key, name, why, url, placeholder]) => { const s = k[key] || {}; return '<div class="key"><div class="key-head"><strong>' + name + '</strong><span class="key-status ' + (s.set ? 'ok' : '') + '">' + (s.source === 'env' ? 'Definida no ambiente' : s.set ? 'Salva ' + escape(s.hint) : 'Não configurada') + '</span></div><p>' + why + ' <a href="' + url + '" target="_blank" rel="noopener noreferrer">Onde pegar a chave ↗</a></p><div class="key-row"><input type="password" data-key="' + key + '" placeholder="' + (s.set ? 'Cole uma nova para trocar' : placeholder) + '" autocomplete="off" spellcheck="false" aria-label="Chave ' + name + '"' + (s.source === 'env' ? ' disabled' : '') + '>' + (s.source === 'saved' ? '<button type="button" class="ghost" data-forget="' + key + '">Remover</button>' : '') + '</div></div>'; }).join('');
  const labels = [['FFmpeg', state.caps.ffmpeg], ['FFprobe', state.caps.ffprobe], ['Claude Code', state.caps.claude && state.caps.claudeLoggedIn], ['Codex', state.caps.codex && state.caps.codexLoggedIn], ['Skills de vídeo', state.caps.skills?.length > 0], ['HyperFrames', state.caps.hyperframes], ['Whisper local', state.caps.transcription], ['Modelo Whisper baixado', state.caps.transcriptionModelReady], ['Voz ElevenLabs', state.caps.voice], ['Chave Composio', state.caps.composio]];
  $('capabilities').innerHTML = labels.map(([label, ok]) => '<div class="capability"><span>' + label + '</span><span class="' + (ok ? 'ok' : '') + '">' + (ok ? 'Disponível' : 'Pendente') + '</span></div>').join('');
  $('composio-hint').textContent = state.caps.composio ? 'Chave disponível. Salve o auth config, conecte e verifique antes de publicar.' : 'Falta COMPOSIO_API_KEY: salve a chave Composio em Chaves de API para publicar.';
  $('connect-instagram').disabled = !state.caps.composio; $('check-instagram').disabled = !state.caps.composio;
  $('auto-publish').checked = !!state.current?.autoPublish; $('auto-caption').value = state.current?.autoCaption || '';
}
function settingsUI(name) {
  settingsData();
  let saved; try { saved = localStorage.getItem('settings-tab'); } catch {}
  tab(typeof name === 'string' ? name : saved || 'start');
  if (!$('settings-dialog').open) $('settings-dialog').showModal();
}
for (const b of document.querySelectorAll('[data-tab]')) b.onclick = () => tab(b.dataset.tab);
$('settings-dialog').addEventListener('click', e => {
  const example = e.target.closest('[data-example]');
  if (example) { $('settings-dialog').close(); $('chat-input').value = example.dataset.example; $('chat-input').focus(); $('chat-form').scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  const forget = e.target.closest('[data-forget]');
  if (forget) perform(forget, async () => { const r = await api('/api/secrets', { [forget.dataset.forget]: '' }); state.caps = r.capabilities; settingsData(); status(); notice('Chave removida.'); });
});
$('secrets-form').onsubmit = e => {
  e.preventDefault();
  const data = Object.fromEntries([...document.querySelectorAll('[data-key]')].filter(i => i.value.trim()).map(i => [i.dataset.key, i.value.trim()]));
  if (!Object.keys(data).length) return notice('Cole ao menos uma chave para salvar.', true);
  perform(e.submitter, async () => { const r = await api('/api/secrets', data); state.caps = r.capabilities; settingsData(); status(); renderControls(); notice('Chaves salvas neste computador.'); });
};
$('settings-open').onclick = () => settingsUI(); $('dependencies-open').onclick = () => settingsUI('tools'); $('help-open').onclick = () => settingsUI('start');
$('settings-claude-login').onclick = () => $('claude-connect').onclick();
$('settings-codex-login').onclick = () => perform($('settings-codex-login'), async () => {
  $('codex-code').textContent = '····-·····'; $('codex-link').hidden = true; $('codex-done').disabled = true; $('codex-dialog').showModal();
  const r = await api('/api/codex/login', {}); $('codex-code').textContent = r.code; $('codex-link').href = r.url; $('codex-link').hidden = false; $('codex-done').disabled = false;
});
$('codex-form').onsubmit = e => { e.preventDefault(); perform(e.submitter, async () => { const r = await api('/api/codex/code', {}); state.caps = r.capabilities; $('codex-dialog').close(); settingsData(); status(); renderControls(); notice('ChatGPT conectado ao Codex.'); }); };
document.addEventListener('click', event => {
  const b = event.target.closest('button'); if (!b) return;
  if (b.hasAttribute('data-close')) b.closest('dialog').close();
  if (b.dataset.project) perform(b, () => selectProject(b.dataset.project));
  if (b.dataset.prompt) { $('chat-input').value = b.dataset.prompt; $('chat-input').focus(); }
  if (b.dataset.preview) { state.result = b.dataset.preview; viewer(); $('viewer').scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  if (b.dataset.seek) { state.result = null; viewer(); $('player').currentTime = Number(b.dataset.seek); }
  if (b.dataset.publish) {
    publishResult = b.dataset.publish; $('publish-title').textContent = state.current.results.find(r => r.id === publishResult).title;
    $('publish-caption').value = ''; $('publish-confirm').checked = false; $('publish-dialog').showModal();
  }
  if (b.id === 'save-plan') perform(b, async () => {
    const plan = editedPlan(), target = state.current.id;
    await api(route('plan', target), plan); await refresh(target); notice('Plano atualizado.');
  });
});
$('project-search').addEventListener('input', library);
$('library-toggle').onclick = () => { const open = $('library').classList.toggle('open'); $('library-toggle').setAttribute('aria-expanded', String(open)); };
$('new-project').onclick = () => { $('new-name').value = ''; $('new-dialog').showModal(); };
$('new-form').onsubmit = event => { event.preventDefault(); perform(event.submitter, async () => { state.current = await api('/api/projects', { name: $('new-name').value }); state.projects.unshift(state.current); state.result = null; lastChat = ''; $('new-dialog').close(); render(true); }); };
$('rename-project').onclick = () => { $('rename-name').value = state.current.name; $('rename-dialog').showModal(); };
$('rename-form').onsubmit = e => { e.preventDefault(); perform(e.submitter, async () => { await api(route('rename'), { name: $('rename-name').value }); $('rename-dialog').close(); await refresh(); }); };
$('upload-hero').onclick = () => $('file-input').click();
$('file-input').onchange = () => perform(null, () => upload($('file-input').files[0]));
for (const type of ['dragenter', 'dragover']) $('dropzone').addEventListener(type, e => { e.preventDefault(); $('dropzone').classList.add('dragging'); });
for (const type of ['dragleave', 'drop']) $('dropzone').addEventListener(type, e => { e.preventDefault(); $('dropzone').classList.remove('dragging'); });
$('dropzone').addEventListener('drop', e => { if (state.pending || state.current?.job?.status === 'running') return; perform(null, () => upload(e.dataTransfer.files[0])); });
$('create-hero').onclick = () => { $('chat-input').value = 'Crie um vídeo tipográfico vertical sobre '; $('chat-input').focus(); $('chat-form').scrollIntoView({ block: 'center', behavior: 'smooth' }); };
$('view-original').onclick = () => { state.result = null; viewer(); };
$('view-result').onclick = () => { state.result = state.current.results.at(-1).id; viewer(); };
$('transcript-open').onclick = () => { $('srt-text').value = ''; $('srt-file').value = ''; $('transcript-dialog').showModal(); };
$('srt-file').onchange = () => perform(null, async () => { const f = $('srt-file').files[0]; if (!f) return; if (f.size > 500000) throw new Error('SRT maior que 500 KB.'); $('srt-text').value = await f.text(); });
$('transcript-form').onsubmit = e => { e.preventDefault(); perform(e.submitter, async () => { await api(route('transcript'), { srt: $('srt-text').value }); $('transcript-dialog').close(); await refresh(); notice('Legendas salvas. Claude agora tem contexto das falas.'); }); };
$('transcribe').onclick = () => perform($('transcribe'), async () => { await api(route('transcribe'), {}); await refresh(); });
$('manual-toggle').onclick = () => { $('manual-panel').hidden = !$('manual-panel').hidden; $('cut-end').value = Math.min(30, state.current.source.duration); };
$('manual-form').onsubmit = e => { e.preventDefault(); perform(e.submitter, async () => { await api(route('plan'), { kind: 'cuts', message: 'Trecho selecionado por você. Revise o enquadramento e as legendas antes de renderizar.', cuts: [{ start: Number($('cut-start').value), end: Number($('cut-end').value), title: $('cut-title').value, rationale: 'Seleção manual.' }] }); $('manual-panel').hidden = true; await refresh(); }); };
$('chat-form').onsubmit = e => {
  e.preventDefault(); const prompt = $('chat-input').value.trim(); if (!prompt) return;
  perform($('chat-send'), async () => { const target = await ensureProject(); await api(route('chat', target), { prompt }); $('chat-input').value = ''; await refresh(target); });
};
$('captions-enabled').onchange = renderControls;
$('render').onclick = () => perform($('render'), async () => {
  const target = state.current.id;
  await api(route('plan', target), editedPlan());
  await api(route('render', target), { framing: $('framing').value, captionStyle: $('caption-style').value, width: Number($('resolution').value), captions: $('captions-enabled').checked, narration: $('narration-enabled').checked && !$('narration-option').hidden });
  await refresh(target);
});
$('cancel-job').onclick = () => perform($('cancel-job'), async () => { await api(route('cancel'), {}); notice('Cancelamento solicitado.'); });
$('settings-form').onsubmit = e => { e.preventDefault(); perform(e.submitter, async () => { state.config = await api('/api/settings', { provider: document.querySelector('[name=provider]:checked')?.value || 'claude-cli', models: { claude: $('model-claude').value.trim(), openai: $('model-openai').value.trim(), openrouter: $('model-openrouter').value.trim() }, effort: $('effort').value, skills: $('skills-enabled').checked, voiceId: $('voice-id').value.trim(), voiceModel: $('voice-model').value, authConfigId: $('auth-config').value, connectedAccountId: $('connected-account').value, igUserId: $('ig-user').value, userId: $('composio-user').value }); settingsData(); status(); renderControls(); notice('Ajustes salvos.'); }); };
$('connect-instagram').onclick = () => perform($('connect-instagram'), async () => { const result = await api('/api/instagram/connect', {}); $('connect-link').href = result.url; $('connect-link').hidden = false; $('instagram-status').textContent = 'Abra o link para autorizar. Depois clique em Verificar conexão.'; const fresh = await api('/api/bootstrap'); state.config = fresh.settings; $('connected-account').value = state.config.connectedAccountId; });
$('check-instagram').onclick = () => perform($('check-instagram'), async () => { const s = await api('/api/instagram/status', {}); $('instagram-status').textContent = s.active ? 'Instagram conectado e ativo.' : 'Conexão: ' + (s.status || 'pendente') + '. Conclua a autorização no Composio.'; });
$('save-automatic').onclick = () => perform($('save-automatic'), async () => { await api(route('automatic'), { enabled: $('auto-publish').checked, caption: $('auto-caption').value }); await refresh(); notice(state.current.autoPublish ? 'Publicação automática ativada para novos renders deste projeto.' : 'Publicação automática desativada.'); });
$('publish-form').onsubmit = e => { e.preventDefault(); perform(e.submitter, async () => { await api(route('publish'), { resultId: publishResult, caption: $('publish-caption').value, confirm: $('publish-confirm').checked }); $('publish-dialog').close(); await refresh(); }); };
$('claude-connect').onclick = () => {
  if (state.config.provider !== 'claude-cli' && $('claude-connect').textContent === 'Configurar a IA') return settingsUI(state.config.provider === 'codex-cli' ? 'ai' : 'keys'); $('login-code').value = ''; $('login-code').disabled = true; $('login-submit').disabled = true; $('login-link').hidden = true; $('login-dialog').showModal(); };
$('login-start').onclick = () => {
  // Abre a aba já no clique (sem bloqueio de pop-up) e a aponta para o link quando o servidor responde.
  const tab = window.open('', '_blank');
  perform($('login-start'), async () => {
    try { const { url } = await api('/api/claude/login', {}); $('login-link').href = url; $('login-link').hidden = false; if (tab) tab.location = url; }
    catch (e) { tab?.close(); throw e; }
    $('login-code').disabled = false; $('login-submit').disabled = false; $('login-code').focus();
  });
};
$('login-form').onsubmit = e => { e.preventDefault(); perform(e.submitter, async () => { const r = await api('/api/claude/code', { code: $('login-code').value }); state.caps = r.capabilities; status(); renderControls(); $('login-dialog').close(); notice('Claude conectado. Pode conversar.'); }); };
function status() {
  const c = state.config, info = PROVIDER[c.provider], ready = providerReady();
  $('ai-name').textContent = info.name;
  $('claude-status').textContent = ready ? modelLabel() + ' · ' + EFFORT_LABEL[c.effort] + (c.provider === 'claude-cli' && c.skills !== false && state.caps.skills?.length ? ' · ' + state.caps.skills.length + ' skills' : '') : info.need;
  $('claude-connect').hidden = ready;
  $('claude-connect').textContent = c.provider === 'claude-cli' && state.caps.claude ? 'Conectar minha conta Claude' : 'Configurar a IA';
  $('claude-dot').classList.toggle('ready', ready);
}
(async () => {
  try {
    const data = await api('/api/bootstrap'); state.token = data.token; state.caps = data.capabilities; state.config = data.settings; state.projects = data.projects;
    status();
    if (state.projects.length) state.current = state.projects[0]; render(true);
    // Primeira visita: abre o guia com exemplos (uma vez por navegador).
    let welcomed = true; try { welcomed = !!localStorage.getItem('welcomed'); localStorage.setItem('welcomed', '1'); } catch {}
    if (!welcomed) settingsUI('start');
    if (!state.caps.ffmpeg || !state.caps.ffprobe) notice('FFmpeg/FFprobe ausentes. Confira as ferramentas locais em Ajustes.', true);
  } catch { $('project-list').innerHTML = '<p class="muted">Não foi possível carregar a biblioteca. Recarregue após iniciar o servidor.</p>'; notice('O servidor local não respondeu. Reinicie o estúdio e recarregue a página.', true); }
})();
