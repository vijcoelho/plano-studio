import { createReadStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import { fail, settings, updateProject, projectDir, safe, secret } from './store.mjs';

const BASE = 'https://backend.composio.dev/api/v3';
const VERSION = '20260915_00';
const bounded = (signal, ms) => signal ? AbortSignal.any([signal, AbortSignal.timeout(ms)]) : AbortSignal.timeout(ms);
async function api(route, body, signal) {
  if (!secret('COMPOSIO_API_KEY')) fail('Configure a chave Composio em Ajustes → Chaves de API. Nenhuma publicação foi feita.', 503);
  const response = await fetch(BASE + route, { method: body ? 'POST' : 'GET', headers: { 'x-api-key': secret('COMPOSIO_API_KEY'), 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: bounded(signal, 45000), redirect: 'error' });
  if (!response.ok) fail(`Composio respondeu HTTP ${response.status}. Verifique chave, permissões e conexão no painel Composio.`, 502);
  const data = await response.json();
  if (data.successful === false || data.error) fail('Composio não confirmou a operação. Confira a conexão e as permissões no painel.', 502);
  return data;
}
export async function connect() {
  const s = await settings(); if (!s.authConfigId) fail('Informe o auth config de Instagram criado no painel Composio.');
  const result = await api('/connected_accounts/link', { auth_config_id: s.authConfigId, user_id: s.userId });
  const u = new URL(result.redirect_url);
  if (u.protocol !== 'https:' || !(u.hostname === 'composio.dev' || u.hostname.endsWith('.composio.dev'))) fail('Composio retornou uma URL de conexão inesperada.', 502);
  const accountId = result.connected_account_id || result.id;
  if (!/^[\w.-]{1,120}$/.test(accountId || '')) fail('Composio não retornou um ID de conexão.', 502);
  const { atomic, ROOT } = await import('./store.mjs');
  await atomic(await safe(ROOT, 'settings.json'), { ...s, connectedAccountId: accountId });
  return { url: u.href };
}
export async function connectionStatus() {
  const s = await settings(); if (!s.connectedAccountId) return { status: 'NOT_CONNECTED' };
  const account = await api(`/connected_accounts/${encodeURIComponent(s.connectedAccountId)}`);
  return { status: account.status, toolkit: account.toolkit?.slug || account.appName || '', active: account.status === 'ACTIVE' };
}
async function execute(slug, args, s, signal) {
  return (await api(`/tools/execute/${slug}`, { connected_account_id: s.connectedAccountId, user_id: s.userId, version: VERSION, arguments: args }, signal)).data;
}
function uploadedUrl(value) {
  const u = new URL(value);
  if (u.protocol !== 'https:' || u.username || u.password || !(u.hostname.endsWith('.amazonaws.com') || u.hostname.endsWith('.composio.dev'))) fail('Destino de upload Composio inesperado.', 502);
  return u.href;
}
export async function publish(p, resultId, caption, signal, progress) {
  const r = p.results.find(x => x.id === resultId); if (!r) fail('Resultado não encontrado.', 404);
  if (r.publication && r.publication.status !== 'failed-before-create') fail('Este resultado já foi publicado ou tem envio pendente. Confira o Instagram antes de reenviar.', 409);
  const s = await settings();
  if (!s.igUserId || !s.connectedAccountId) fail('Informe a conta conectada Composio e o ID da conta profissional Instagram.');
  const state = await connectionStatus(); if (!state.active) fail('A conexão Instagram não está ativa.', 409);
  // Valida a capacidade antes de transferir a mídia; não usa ferramentas antigas URL-only.
  const schema = await api('/tools/INSTAGRAM_POST_IG_USER_MEDIA');
  const parameters = schema.input_parameters || schema.inputParameters;
  if (!parameters?.properties?.video_file) fail('A versão do toolkit não aceita vídeo local. Atualize a integração Composio antes de publicar.', 503);
  const file = await safe(await projectDir(p.id), 'results', resultId, 'output.mp4');
  const hash = createHash('md5'); for await (const chunk of createReadStream(file)) hash.update(chunk);
  await progress('Enviando vídeo ao Composio');
  await updateProject(p.id, x => { x.results.find(a => a.id === resultId).publication = { status: 'staging', caption, at: new Date().toISOString() }; });
  let created = false;
  try {
    const upload = await api('/files/upload/request', { toolkit_slug: 'instagram', tool_slug: 'INSTAGRAM_POST_IG_USER_MEDIA', filename: 'output.mp4', mimetype: 'video/mp4', md5: hash.digest('hex') }, signal);
    const url = upload.new_presigned_url || upload.newPresignedUrl;
    if (url) {
      const put = await fetch(uploadedUrl(url), { method: 'PUT', body: createReadStream(file), duplex: 'half', headers: { 'content-type': 'video/mp4', 'content-length': String((await fs.stat(file)).size) }, signal: bounded(signal, 180000), redirect: 'error' });
      if (!put.ok) fail(`Falha no upload da mídia: HTTP ${put.status}.`, 502);
    } else if (upload.type !== 'existing') fail('Composio não retornou destino de upload.', 502);
    if (!upload.key) fail('Composio não retornou referência da mídia.', 502);
    await updateProject(p.id, x => { x.results.find(a => a.id === resultId).publication.status = 'creating'; });
    created = true; // Um timeout daqui em diante é ambíguo: nunca repetir publicação automaticamente.
    const container = await execute('INSTAGRAM_POST_IG_USER_MEDIA', { ig_user_id: s.igUserId, media_type: 'REELS', video_file: { name: 'output.mp4', mimetype: 'video/mp4', s3key: upload.key }, caption, share_to_feed: true }, s, signal);
    const containerId = container?.id || container?.data?.id;
    if (!/^[\d]+$/.test(String(containerId || ''))) fail('Instagram não retornou o ID do container.', 502);
    await updateProject(p.id, x => { Object.assign(x.results.find(a => a.id === resultId).publication, { status: 'processing', containerId }); });
    await progress('Instagram está processando o Reel');
    let ready = false;
    for (let i = 0; i < 24; i++) {
      signal?.throwIfAborted();
      const status = await execute('INSTAGRAM_GET_IG_MEDIA', { ig_media_id: String(containerId), fields: 'status_code' }, s, signal);
      const code = status?.status_code || status?.data?.status_code;
      if (code === 'FINISHED') { ready = true; break; }
      if (['ERROR', 'EXPIRED'].includes(code)) fail('Instagram não conseguiu processar o Reel.', 502);
      await new Promise((resolve, reject) => {
        const done = () => { signal?.removeEventListener('abort', abort); resolve(); };
        const timer = setTimeout(done, 5000);
        function abort() { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(new Error('Publicação interrompida; confira a conta Instagram.')); }
        signal?.addEventListener('abort', abort, { once: true });
      });
    }
    if (!ready) fail('Processamento Instagram ainda pendente. Confira a conta antes de reenviar.', 502);
    await updateProject(p.id, x => { x.results.find(a => a.id === resultId).publication.status = 'publishing'; });
    const published = await execute('INSTAGRAM_POST_IG_USER_MEDIA_PUBLISH', { ig_user_id: s.igUserId, creation_id: String(containerId) }, s, signal);
    const mediaId = published?.id || published?.data?.id;
    if (!mediaId) fail('Instagram não confirmou publicação. Confira a conta antes de reenviar.', 502);
    await updateProject(p.id, x => { Object.assign(x.results.find(a => a.id === resultId).publication, { status: 'published', mediaId: String(mediaId) }); });
  } catch (e) {
    await updateProject(p.id, x => { x.results.find(a => a.id === resultId).publication.status = created ? 'unknown' : 'failed-before-create'; });
    throw e;
  }
}
