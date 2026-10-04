// Provedores por HTTP sem SDK: OpenAI (Responses API), OpenRouter (chat completions compatível) e ElevenLabs (voz).
import { fail, secret, validatePlan } from './store.mjs';
import { planRequest, PLAN_SCHEMA } from './engine.mjs';

// Bases sobrescrevíveis só para o smoke apontar a um servidor mock local.
const BASE = { openai: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1', openrouter: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1', elevenlabs: process.env.ELEVENLABS_BASE_URL || 'https://api.elevenlabs.io/v1' };
const bounded = (signal, ms) => signal ? AbortSignal.any([signal, AbortSignal.timeout(ms)]) : AbortSignal.timeout(ms);
const EFFORT = { low: 'low', medium: 'medium', high: 'high', xhigh: 'high', max: 'high' };
async function post(url, key, body, signal, label) {
  let response;
  try { response = await fetch(url, { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify(body), signal: bounded(signal, 360000), redirect: 'error' }); }
  catch (e) { if (signal?.aborted) throw e; fail(`Sem conexão com ${label}. Confira a internet e tente de novo.`, 502); }
  if (response.status === 401 || response.status === 403) fail(`Chave ${label} recusada. Confira em Ajustes → Chaves de API.`, 502);
  if (response.status === 429) fail(`Limite de uso de ${label} atingido. Aguarde e tente de novo.`, 502);
  if (!response.ok) fail(`${label} respondeu HTTP ${response.status}. Confira o modelo escolhido e os créditos da conta.`, 502);
  return response.json();
}
export function parsePlanText(value, label) {
  try { return JSON.parse(value); } catch { fail(`${label} não retornou um plano válido. Tente novamente.`, 502); }
}
export async function planWithOpenAI(p, prompt, config, signal) {
  const router = config.provider === 'openrouter', label = router ? 'OpenRouter' : 'OpenAI';
  const key = secret(router ? 'OPENROUTER_API_KEY' : 'OPENAI_API_KEY');
  if (!key) fail(`Configure a chave ${label} em Ajustes → Chaves de API.`, 503);
  const { text, images } = await planRequest(p, prompt);
  if (router) {
    const data = await post(BASE.openrouter + '/chat/completions', key, {
      model: config.models.openrouter, reasoning: { effort: EFFORT[config.effort] },
      response_format: { type: 'json_schema', json_schema: { name: 'plano', strict: true, schema: PLAN_SCHEMA } },
      messages: [{ role: 'user', content: [{ type: 'text', text }, ...images.map(i => ({ type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + i.base64 } }))] }]
    }, signal, label);
    return { ...validatePlan(parsePlanText(data.choices?.[0]?.message?.content, label), p), skillsUsed: [] };
  }
  const data = await post(BASE.openai + '/responses', key, {
    model: config.models.openai, reasoning: { effort: EFFORT[config.effort] },
    text: { format: { type: 'json_schema', name: 'plano', strict: true, schema: PLAN_SCHEMA } },
    input: [{ role: 'user', content: [{ type: 'input_text', text }, ...images.map(i => ({ type: 'input_image', image_url: 'data:image/jpeg;base64,' + i.base64 }))] }]
  }, signal, label);
  const output = data.output_text ?? data.output?.flatMap(o => o.content || []).find(c => c.type === 'output_text')?.text;
  return { ...validatePlan(parsePlanText(output, label), p), skillsUsed: [] };
}
// Texto → MP3. O modelo multilingual fala PT-BR; a voz padrão pode ser trocada pelo ID de qualquer voz da conta.
export async function speak(textToSay, config, signal) {
  const key = secret('ELEVENLABS_API_KEY'); if (!key) fail('Configure a chave ElevenLabs em Ajustes → Chaves de API para narrar.', 503);
  let response;
  try {
    response = await fetch(`${BASE.elevenlabs}/text-to-speech/${encodeURIComponent(config.voiceId)}?output_format=mp3_44100_128`, { method: 'POST', headers: { 'xi-api-key': key, 'content-type': 'application/json', accept: 'audio/mpeg' }, body: JSON.stringify({ text: textToSay, model_id: config.voiceModel }), signal: bounded(signal, 120000), redirect: 'error' });
  } catch (e) { if (signal?.aborted) throw e; fail('Sem conexão com ElevenLabs. Confira a internet.', 502); }
  if (response.status === 401 || response.status === 403) fail('Chave ElevenLabs recusada ou sem permissão de texto para fala.', 502);
  if (response.status === 404 || response.status === 422) fail('Voz ou modelo ElevenLabs inválido. Confira o ID da voz em Ajustes.', 502);
  if (!response.ok) fail(`ElevenLabs respondeu HTTP ${response.status}. Confira créditos da conta.`, 502);
  return Buffer.from(await response.arrayBuffer());
}
