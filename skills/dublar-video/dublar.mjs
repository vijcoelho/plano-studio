// Dubla vídeos HyperFrames já renderizados: uma fala por cena, posicionada no
// instante da cena, mais desenho de som nas transições e nos acentos da
// animação. Não toca nos MP4 silenciosos.
//
//   node tools/dublar.mjs                        todos, voz do dublagem.json
//   node tools/dublar.mjs 03 07                  só alguns (prefixo do slug)
//   node tools/dublar.mjs --voz=chris 01         outra voz
//   node tools/dublar.mjs --voz=X --saida=samples 01
//   node tools/dublar.mjs --sem-som 01           só voz, sem SFX
//   node tools/dublar.mjs --som-db=+6 01         SFX 6 dB mais alto
//   node tools/dublar.mjs --listar-vozes         vozes da conta ElevenLabs
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';

if (existsSync('.env')) process.loadEnvFile('.env');

// ---------------------------------------------------------------- motores ---

// O endpoint gratuito do Edge só serve três vozes pt-BR e soa sintético. Serve
// de rascunho; `beats` dá rate/pitch por cena porque é o único controle que ele
// aceita. O ElevenLabs já varia entonação sozinho e não precisa disso.
const HUMANO = [
  { rate: '-6%', pitch: '-2Hz' },
  { rate: '-2%' },
  { rate: '+2%' },
  { rate: '-8%', pitch: '-3Hz' },
];

const VOZES = {
  antonio: { motor: 'edge', voice: 'pt-BR-AntonioNeural' },
  'antonio-humano': { motor: 'edge', voice: 'pt-BR-AntonioNeural', beats: HUMANO },
  francisca: { motor: 'edge', voice: 'pt-BR-FranciscaNeural' },
  thalita: { motor: 'edge', voice: 'pt-BR-ThalitaMultilingualNeural' },
};

const EL_BASE = 'https://api.elevenlabs.io/v1';
const elChave = () => {
  const k = process.env.ELEVENLABS_API_KEY;
  if (!k) throw new Error('falta ELEVENLABS_API_KEY (põe no .env do projeto de vídeo)');
  return k;
};

async function elVozes() {
  const r = await fetch(`${EL_BASE}/voices`, { headers: { 'xi-api-key': elChave() } });
  if (!r.ok) throw new Error(`ElevenLabs /voices ${r.status}: ${await r.text()}`);
  return (await r.json()).voices;
}

async function elPedido(preset, modelo, texto, ctx) {
  // Stitching (dizer o que vem antes/depois) segura o tom entre cenas, mas o
  // eleven_v3 não aceita os dois juntos. Nas nossas cenas as falas ficam
  // separadas por segundos de silêncio, então a expressividade do v3 pesa mais
  // que a continuidade — o stitching fica só pro v2.
  const costura = modelo !== 'eleven_v3';
  const corpo = {
    text: texto,
    model_id: modelo,
    previous_text: costura ? ctx.anterior : undefined,
    next_text: costura ? ctx.proximo : undefined,
    apply_text_normalization: 'on',
    voice_settings: {
      stability: 0.45,        // mais baixo = mais expressivo e variado
      similarity_boost: 0.8,
      style: 0.15,
      use_speaker_boost: true,
      ...preset.settings,
    },
  };
  if (modelo !== 'eleven_multilingual_v2') corpo.language_code = 'pt';  // v2 não aceita
  return fetch(`${EL_BASE}/text-to-speech/${preset.voice}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': elChave(), 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });
}

async function falarElevenLabs(texto, preset, destino, ctx) {
  const modelo = preset.model || 'eleven_v3';
  let r = await elPedido(preset, modelo, texto, ctx);
  if (!r.ok && [400, 422].includes(r.status) && modelo === 'eleven_v3') {
    // v3 nem sempre está liberado na conta; multilingual_v2 é o piso seguro
    console.log('  (eleven_v3 recusou, caindo pra eleven_multilingual_v2)');
    r = await elPedido(preset, 'eleven_multilingual_v2', texto, ctx);
  }
  if (!r.ok) throw new Error(`ElevenLabs ${r.status}: ${await r.text()}`);
  writeFileSync(destino, Buffer.from(await r.arrayBuffer()));
}

async function falarEdge(texto, preset, destino, i) {
  const { EdgeTTS } = await import('node-edge-tts');
  const prosodia = preset.beats?.[i] ?? {};
  await new EdgeTTS({ voice: preset.voice, lang: cfg.lang || 'pt-BR', ...prosodia }).ttsPromise(texto, destino);
}

const falar = (texto, preset, destino, i, ctx) =>
  (preset.motor === 'elevenlabs' ? falarElevenLabs(texto, preset, destino, ctx) : falarEdge(texto, preset, destino, i));

// -------------------------------------------------------------------- som ---

// Efeito é gerado uma vez e reusado nos dez vídeos — por isso a biblioteca é
// por nome, não por vídeo. Gerar um por cena queimaria crédito à toa.
async function gerarSfx(prompt, segundos, destino) {
  const r = await fetch(`${EL_BASE}/sound-generation`, {
    method: 'POST',
    headers: { 'xi-api-key': elChave(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: prompt, duration_seconds: segundos, prompt_influence: 0.6 }),
  });
  if (!r.ok) throw new Error(`ElevenLabs sound-generation ${r.status}: ${await r.text()}`);
  writeFileSync(destino, Buffer.from(await r.arrayBuffer()));
}

// O SFX gerado vem com nível imprevisível. Normalizar o pico no cache deixa o
// ganho de cada cue (em dB) significar a mesma coisa entre um efeito e outro.
function normalizarPico(arquivo, alvoDb = -3) {
  // volumedetect reporta em stderr, não em stdout
  const { stderr } = spawnSync('ffmpeg', ['-i', arquivo, '-af', 'volumedetect', '-f', 'null', '-'], { encoding: 'utf8' });
  const pico = Number(stderr?.match(/max_volume:\s*(-?[\d.]+) dB/)?.[1]);
  if (!Number.isFinite(pico)) return;
  const tmp = `${arquivo}.tmp.mp3`;
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', arquivo, '-af', `volume=${(alvoDb - pico).toFixed(2)}dB`, tmp]);
  renameSync(tmp, arquivo);
}

// ------------------------------------------------------------------ grade ---

const ENTRADA = 0.35;     // atraso da 1a fala: deixa o gancho aparecer antes
const ENTRADA_MEIO = 0.25;
const CAUDA = 0.5;        // silêncio antes do próximo corte
const CAUDA_FIM = 0.25;   // no último beat o vídeo acaba, basta menos
const TEMPO_MAX = 1.12;   // acima disso soa apressado: encurtar a frase
const SAIDA_CENA = 0.45;  // as composições começam a sair de cena 0.45s antes do corte

const cfg = existsSync('dublagem.json') ? JSON.parse(readFileSync('dublagem.json', 'utf8')) : { videos: {} };
Object.assign(VOZES, cfg.vozes || {});   // presets do projeto (ex.: voz clonada)

const args = process.argv.slice(2);
const flag = (nome, padrao) => (args.find((a) => a.startsWith(`--${nome}=`)) || `=${padrao}`).split('=').pop();

if (args.includes('--listar-vozes')) {
  for (const v of await elVozes()) {
    console.log(v.voice_id, '|', v.name.padEnd(22), '|', v.labels?.language || v.labels?.accent || '', '|', v.labels?.description || '');
  }
  process.exit(0);
}

const nomeVoz = flag('voz', cfg.voz || 'antonio');
const pastaSaida = flag('saida', cfg.saida || 'renders-dublados');
const semSom = args.includes('--sem-som');
// pasta dos MP4 mudos de entrada — 'renders' e a convencao HyperFrames
const pastaEntrada = flag('entrada', cfg.entrada || 'renders');
const somDb = Number(flag('som-db', 0));   // desloca todos os SFX de uma vez, pra achar o nível no ouvido
const preset = VOZES[nomeVoz];
if (!preset) { console.error(`voz desconhecida: ${nomeVoz}\ndisponíveis: ${Object.keys(VOZES).join(', ')}`); process.exit(1); }

const dur = (f) => Number(execFileSync('ffprobe',
  ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', f], { encoding: 'utf8' }).trim());

// TTS costuma entregar silêncio nas pontas (o Edge chega a ~1s). Sem cortar, a
// fala entra atrasada em relação à cena mesmo posicionada no instante certo.
const CORTA_SILENCIO = 'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0:detection=peak';
const aparar = (entrada, saida) => execFileSync('ffmpeg',
  ['-v', 'error', '-y', '-i', entrada, '-af', `${CORTA_SILENCIO},areverse,${CORTA_SILENCIO},areverse`, saida]);

// A grade vem da composição, não de constante: lê os clips de conteúdo
// (os que não cobrem o vídeo inteiro) e ordena por início.
function cenas(slug) {
  const html = `compositions/videos/${slug}.html`;
  if (!existsSync(html)) return null;
  const src = readFileSync(html, 'utf8');
  const total = Number(src.match(/data-composition-id[^>]*data-duration="([\d.]+)"/)?.[1]);
  if (!total) throw new Error(`${html}: não achei a duração da composição`);
  return [...src.matchAll(/data-start="([\d.]+)"\s+data-duration="([\d.]+)"/g)]
    .map((m) => [Number(m[1]), Number(m[2])])
    .filter(([, d]) => d < total)                                    // descarta ground/topline
    .filter(([ini], i, a) => a.findIndex(([x]) => x === ini) === i)  // um clip por instante
    .sort((a, b) => a[0] - b[0]);
}

function grade(slug, nFalas) {
  const explicita = cfg.beats?.[slug] || cfg.beats?.['*'];
  if (explicita) return explicita;

  const clips = cenas(slug);
  if (!clips) throw new Error(`sem compositions/videos/${slug}.html — declare "beats" em dublagem.json`);
  if (clips.length !== nFalas) {
    throw new Error(`${slug}: ${clips.length} cenas na composição mas ${nFalas} falas no dublagem.json`);
  }
  return clips.map(([ini, d], i) => {
    const entrada = ini === 0 ? ENTRADA : ENTRADA_MEIO;
    const cauda = i === clips.length - 1 ? CAUDA_FIM : CAUDA;
    return [Number((ini + entrada).toFixed(3)), Number((d - entrada - cauda).toFixed(3))];
  });
}

// Transição em cada troca de cena sai de graça da grade: o whoosh entra quando
// a cena começa a deslizar pra fora. Acentos de animação (linha entrando,
// selo aparecendo) são manuais em cfg.cues, porque só a timeline sabe deles.
function cues(slug) {
  const manuais = (cfg.cues?.[slug] || []).map(([em, som]) => ({ em, som }));
  if (!cfg.sons?.transicao) return manuais;
  const clips = cenas(slug) || [];
  const trocas = clips.slice(1).map(([ini]) => ({ em: Number((ini - SAIDA_CENA).toFixed(3)), som: 'transicao' }));
  return [...trocas, ...manuais].sort((a, b) => a.em - b.em);
}

// ------------------------------------------------------------------- roda ---

const only = args.filter((a) => !a.startsWith('--'));
const sufixo = flag('sufixo', pastaSaida === (cfg.saida || 'renders-dublados') ? '' : `-${nomeVoz}`);
mkdirSync(`assets/voice/bruto/${nomeVoz}`, { recursive: true });
mkdirSync(`assets/voice/${nomeVoz}`, { recursive: true });
mkdirSync('assets/sfx', { recursive: true });
mkdirSync(pastaSaida, { recursive: true });

console.log(`voz: ${nomeVoz} (${preset.motor}/${preset.voice})${semSom ? '' : ' + som'}  ->  ${pastaSaida}/\n`);

// biblioteca de efeitos: gera o que faltar, uma vez só
if (!semSom) {
  for (const [nome, som] of Object.entries(cfg.sons || {})) {
    const arq = `assets/sfx/${nome}.mp3`;
    if (existsSync(arq)) continue;
    await gerarSfx(som.prompt, som.dur ?? 1.5, arq);
    normalizarPico(arq);
    console.log(`sfx ${nome}  ${dur(arq).toFixed(2)}s  (gerado)`);
  }
}

const avisos = [];
for (const [slug, falas] of Object.entries(cfg.videos)) {
  const n = slug.split('-')[0];
  if (only.length && !only.includes(n)) continue;
  if (!existsSync(`${pastaEntrada}/${slug}.mp4`)) { avisos.push(`${slug}: sem ${pastaEntrada}/${slug}.mp4`); continue; }

  const beats = grade(slug, falas.length);
  const pistas = [];   // { arquivo, em, filtro }

  for (let i = 0; i < falas.length; i++) {
    const bruto = `assets/voice/bruto/${nomeVoz}/${n}-b${i + 1}.mp3`;
    const mp3 = `assets/voice/${nomeVoz}/${n}-b${i + 1}.mp3`;
    // Cache: não refaz o TTS se o bruto já existe E a fala é a mesma.
    //
    // O `.txt` ao lado não é enfeite. O cache era só por nome de arquivo, e aí
    // editar uma frase em `dublagem.json` não refazia nada: o vídeo saía com a
    // narração ANTIGA e o log dizia que tinha gerado. Erro silencioso, do pior
    // tipo — só se descobre ouvindo.
    const marca = `${bruto}.txt`;
    const igual = existsSync(bruto) && existsSync(marca) && readFileSync(marca, 'utf8') === falas[i];
    if (!igual) {
      await falar(falas[i], preset, bruto, i, { anterior: falas[i - 1], proximo: falas[i + 1] });
      writeFileSync(marca, falas[i]);
    }
    aparar(bruto, mp3);

    const [inicio, orcamento] = beats[i];
    const d = dur(mp3);
    // encaixa a fala no beat sem alterar o tom; só acelera se passar do orçamento
    const tempo = Math.max(1, d / orcamento);
    if (tempo > TEMPO_MAX) avisos.push(`${n}-b${i + 1}: ${d.toFixed(2)}s em ${orcamento}s (tempo ${tempo.toFixed(3)}) — encurtar a frase`);
    pistas.push({
      arquivo: mp3,
      em: inicio,
      filtro: `loudnorm=I=-14:TP=-1.5:LRA=11${tempo > 1 ? `,atempo=${tempo.toFixed(4)}` : ''}`,
    });
    console.log(`${n}-b${i + 1}  ${d.toFixed(2)}s / ${orcamento}s  @${inicio}s  x${tempo.toFixed(3)}`);
  }

  if (!semSom) {
    for (const { em, som } of cues(slug)) {
      const arq = `assets/sfx/${som}.mp3`;
      if (!existsSync(arq)) { avisos.push(`${slug}: som "${som}" não existe em cfg.sons`); continue; }
      if (em < 0) continue;
      pistas.push({ arquivo: arq, em, filtro: `volume=${(cfg.sons[som].vol ?? -20) + somDb}dB` });
    }
    console.log(`  som: ${cues(slug).length} cues`);
  }

  const total = dur(`${pastaEntrada}/${slug}.mp4`);
  const filtros = pistas.map((p, i) => {
    const ms = Math.round(p.em * 1000);
    return `[${i + 1}:a]${p.filtro},adelay=${ms}|${ms}[p${i}]`;
  });
  const rotulos = pistas.map((_, i) => `[p${i}]`).join('');
  const saida = `${pastaSaida}/${slug}${sufixo}.mp4`;

  execFileSync('ffmpeg', ['-y', '-i', `${pastaEntrada}/${slug}.mp4`, ...pistas.flatMap((p) => ['-i', p.arquivo]),
    '-filter_complex', `${filtros.join(';')};${rotulos}amix=inputs=${pistas.length}:duration=longest:normalize=0,alimiter=limit=0.89,apad=pad_dur=${total}[a]`,
    '-map', '0:v:0', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2',
    '-t', String(total), '-movflags', '+faststart', saida], { stdio: ['ignore', 'ignore', 'pipe'] });
  console.log(`  -> ${saida}  ${dur(saida).toFixed(2)}s\n`);
}

if (avisos.length) console.log('AVISOS:\n' + avisos.join('\n'));
