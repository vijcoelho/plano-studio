# Plano Studio — estúdio de vídeo com IA

Importa um MP4, deixa a IA achar os melhores cortes verticais, grava legendas e exporta MP4/SRT para Reels, TikTok e Shorts. Também cria vídeos tipográficos do zero (HyperFrames), com narração opcional via ElevenLabs. Roda no seu PC; tudo fica em pastas e JSON locais.

**IA padrão: Claude Opus 5.5 com esforço médio** (pelo Claude Code). Na tela de Ajustes dá para trocar para Claude por API, Codex CLI (conta ChatGPT), OpenAI por API ou OpenRouter.

## Instalar e abrir (Windows, Docker)

1. Instale o [Docker Desktop](https://www.docker.com/products/docker-desktop/) e abra-o uma vez.
2. Baixe **PlanoStudio-windows.zip** em [Releases](../../releases/latest) e extraia numa pasta.
3. Dê dois cliques em **Plano Studio.bat**. Na primeira vez ele monta a imagem (5–15 min, precisa de internet). Depois abre em segundos, como janela de app, em http://127.0.0.1:4317.
4. O guia abre sozinho na primeira visita. No painel da IA, clique **Conectar minha conta Claude**, autorize na página que abrir e cole o código. É só uma vez.
5. Para desligar: **Parar Plano Studio.bat**. Projetos, logins, chaves e o modelo do Whisper ficam em volumes Docker e sobrevivem a reinícios e atualizações.

Mac/Linux: `docker compose up -d --build` e abra http://127.0.0.1:4317.

A imagem traz FFmpeg, HyperFrames + Chrome headless, Claude Code CLI, Codex CLI, whisper.cpp e as skills de vídeo da pasta `skills/`. O modelo Whisper small (~466 MB) baixa na primeira transcrição.

## Claude de vídeo (skills prontas)

Além da tela do estúdio, dá para pedir vídeos direto ao Claude Code, com todas as skills de vídeo já instaladas no container (nada para instalar no Windows além do Docker).

1. Abra o **Plano Studio.bat** uma vez (liga o Docker e monta a imagem).
2. Dê dois cliques em **Claude de Video.bat**. Abre um terminal com o Claude Code dentro do container.
3. Na primeira vez, se o Claude pedir login, siga o link (ou conecte a conta antes em Ajustes → IA que edita; o login é o mesmo).
4. Peça em português, por exemplo:
   - “faz um vídeo desenhado de 30 s explicando o que é o Plano Studio”
   - “cria um vídeo de lançamento do site https://… com 20 s”
   - “transforma esse texto num explainer sem rosto: …”
   - “põe narração no vídeo da pasta lancamento”
5. Os projetos e MP4 ficam na pasta **videos** ao lado do .bat. Para usar um arquivo seu (MP4, música, logo), coloque nessa pasta e cite o nome no pedido. Ao sair do Claude (`/exit`), a pasta abre sozinha.

| Skill | Para quê |
|---|---|
| `hyperframes`, `hyperframes-core`, `-animation`, `-creative`, `-keyframes`, `-audio`, `-cli`, `-registry`, `-studio` | Base HyperFrames: composição em HTML, animação, direção visual, áudio, render |
| `general-video` | Vídeo sob medida quando nenhum fluxo pronto serve |
| `motion-studio`, `motion-graphics`, `motion-design` | Motion design em código com loop de crítica até ficar bom |
| `video-desenhado` | Estilo “desenhado à mão” em papel, 20–45 s |
| `video-demo` | Demo/promo curta estilo X, pixel art e som sintetizado |
| `product-launch-video` | Vídeo de lançamento a partir de URL, roteiro ou briefing |
| `faceless-explainer` | Explainer sem rosto a partir de texto ou tema |
| `music-to-video` | Vídeo no ritmo de uma música |
| `pr-to-video` | Vídeo explicando um pull request do GitHub |
| `slideshow` | Apresentação navegável em HTML (deck com modo apresentador), não MP4 |
| `talking-head-recut`, `embedded-captions` | Cartões gráficos e legendas em vídeo de pessoa falando |
| `dublar-video` | Narração por cena em vídeo já renderizado (voz grátis) |
| `media-use` | Música, efeitos, imagens e ícones para os projetos |
| `remotion-to-hyperframes` | Converter projeto Remotion para HyperFrames |

Algumas partes de `media-use` (voz/música por Gemini) precisam de chave própria; sem ela, a skill usa as alternativas locais. Vídeos longos e criativos gastam bastante do plano Claude.

## Ajustes (botão Ajustes ou Guia)

| Aba | O que faz |
|---|---|
| Começar | Passo a passo e exemplos prontos (“1 hora vira 5 Reels”, “teaser de 15 s”, “vídeo do zero com voz”…). Um clique joga o pedido no chat. |
| IA que edita | Escolhe o provedor, o modelo de cada um e o esforço de raciocínio (baixo → máximo). Botões para conectar a conta Claude e a conta ChatGPT (Codex) sem terminal. |
| Chaves de API | Anthropic, OpenAI, OpenRouter, ElevenLabs e Composio, cada uma com explicação e link de onde pegar. Ficam em `data/secrets.json` (0600) no servidor local e nunca voltam para a tela. Variáveis de ambiente com o mesmo nome têm prioridade. |
| Voz | ID da voz e modelo ElevenLabs (multilingual v2 por padrão, fala PT-BR). |
| Instagram | Conexão Composio para publicar Reels (sempre com confirmação). |
| Ferramentas | Diagnóstico do que está disponível. |

| Provedor | Autenticação | Modelo padrão |
|---|---|---|
| Claude Code (CLI) | Conta Claude Pro/Max (login pela tela) | `claude-opus-5-5`, lê as skills de vídeo instaladas |
| Claude por API | `ANTHROPIC_API_KEY` | `claude-opus-5-5`, com fallback de recusa no servidor |
| Codex CLI | Conta ChatGPT (login por código) ou `OPENAI_API_KEY` | `gpt-6.1-sol` |
| OpenAI por API | `OPENAI_API_KEY` | `gpt-6.1-sol` |
| OpenRouter | `OPENROUTER_API_KEY` | `anthropic/claude-opus-5.5` |

Todos recebem o mesmo pedido (texto + 5 frames do vídeo + falas) e devolvem um plano em JSON Schema estrito. A IA só planeja: o servidor valida o plano e gera os comandos FFmpeg/HTML HyperFrames por templates próprios. Claude Code roda só com as ferramentas Skill/Read (ou nenhuma), sem MCP, hooks nem sessão salva; Codex roda em sandbox somente leitura, sem config do usuário. Cada pedido tem limite de tempo (6 min) e, no Claude Code, de US$ 2.

## Fluxo

1. **Importe um MP4** (até 500 MB, 3 h, 8K). O original nunca é alterado; 5 frames vão para a IA.
2. **Dê as falas**: *Transcrever* (Whisper local, PT) ou importe um SRT.
3. **Peça no chat**: cortes (até 8 trechos de 0,5–180 s) ou uma criação (até 6 cenas). Revise início/fim/título; também dá para selecionar o trecho à mão.
4. **Renderize**: 9:16 corte central ou quadro inteiro, legenda clássica ou destaque, 720p/1080p; criações podem ter **Narração ElevenLabs** (uma fala por cena, mixada no tempo certo).
5. **Exporte** MP4 + SRT ou publique no Instagram.

## Sem Docker

Node 22+, FFmpeg/FFprobe no PATH e, opcionalmente, Claude Code/Codex instalados e logados:

~~~powershell
npm ci
npm start
~~~

Abra **http://127.0.0.1:4317** (literalmente; outros Hosts são recusados). Whisper: whisper-cli no PATH ou `HYPERFRAMES_WHISPER_PATH`. `PORT` e `STUDIO_DATA` mudam porta e pasta de dados. Não rode dois servidores sobre a mesma pasta.

## Dados

~~~text
data/
  settings.json         # provedor, modelos, esforço, voz, IDs Composio
  secrets.json          # chaves salvas pela tela (0600)
  projects/<uuid>/
    project.json        # fonte, frames, falas, chat, plano, resultados, job
    original.mp4
    frames/frame-0.jpg ... frame-4.jpg
    results/<uuid>/output.mp4, captions.srt, composition/
~~~

JSON é gravado com arquivo temporário, fsync e rename (com nova tentativa quando o Windows segura o arquivo por instantes); mutações por projeto são serializadas. Se o servidor cair no meio de um job, ele aparece como erro ao reiniciar.

## Segurança

Servidor só em loopback (no Docker, porta publicada só em 127.0.0.1), Host/Origin restritos, token de sessão nas mutações, CSP, sem CORS. IDs são UUIDs; paths recusam travessia e links. Subprocessos com `shell: false`, limites de tempo e cancelamento; FFmpeg com whitelist file/pipe. Chaves nunca vão para a UI, logs ou processos de mídia. O contexto do pedido (frames, falas, texto) sai do computador para o provedor de IA escolhido. Use em PC de confiança; não exponha a porta na internet.

Instagram: toolkit Composio fixado em `20260915_00`; publicação pede confirmação explícita; após timeout o estado fica “incerto” e o reenvio é bloqueado para não duplicar posts.

## Testes

~~~powershell
npm run check         # unidade: paths, JSON atômico/concorrente, planos, SRT, ajustes e chaves
npm run check:upload  # corrida de upload, hard link sem overwrite, cancelamento
npm run smoke         # servidor real: upload, frames, corte legendado, HyperFrames, OpenAI/OpenRouter/ElevenLabs (mock local) com narração
npm run ui            # navegador headless: guia, ajustes, upload→SRT→corte→render, mobile
$env:SMOKE_AI='claude-cli'; npm run smoke   # também chama a IA real (claude-cli, codex-cli, claude-api, openai-api ou openrouter)
~~~

No Docker: `docker exec plano-studio npm run check` (e `check:upload`, `smoke`, `ui`).

Stack: Node nativo (http/fs/streams/child_process), HTML/CSS/JS sem framework, hyperframes 0.8.97, gsap 3.14.2 e @anthropic-ai/sdk. Fontes Source Serif 4 + DM Sans (OFL), servidas localmente.
