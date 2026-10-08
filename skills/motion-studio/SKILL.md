---
name: motion-studio
description: Motion design feito em código com loop de crítica. O filme é uma função pura do tempo (window.seek(t)), renderizado quadro a quadro com Playwright + ffmpeg, com molas em forma fechada, grade de batida, som sintetizado, e a IA olhando os próprios quadros (contact sheet + notas 1-10) até tudo ficar 8+. Use para showreel, vídeo de lançamento, anúncio animado, morph de UI, ou quando um vídeo saiu "mid"/genérico. Em projeto HyperFrames/Remotion, use só as regras de visual, molas e o loop de crítica.
---

# Motion studio

Fonte: curso do @0xMovez (2026-10), resumido. O prompt é 10% do vídeo; 90% é o pipeline.

## 0. Antes de tudo
- Esforço: **xhigh** para filme novo, medium para ajustes e re-render. Avise o usuário do custo.
- Já existe projeto HyperFrames (`hyperframes.json`) ou Remotion? Fique nele: aplique as seções 2, 4 e 5. Não troque de engine.
- Projeto novo sem engine: copie `starter/` (desta pasta) para o projeto e rode `npm i -D playwright`.
  No Plano Studio (Docker) o Chromium do sistema fica em `/usr/bin/chromium`.

## 1. Entradas (pergunte o que faltar, uma vez)
Produto + URL, duração, formatos (9:16 / 1:1 / 16:9), cores e fontes, uma **referência**
(frame, vídeo ou pasta de imagens), música (arquivo ou "sintetizar").

Sem referência a IA cai no padrão genérico. Com referência:
1. `ffmpeg -i ref.mp4 -vf fps=2 refs/frames/%03d.png` e olhe os frames.
2. Escreva `docs/style_guide.md`: paleta (hex), tipo (família, peso, tracking), duração dos planos,
   transições, câmera, textura, como o texto entra e sai. **Pegue a gramática, nunca o conteúdo.**

Produto real: capture telas, logo e cores do site com Playwright em `./assets`. Nunca invente UI.

## 2. Regras de visual (sempre)
- Proibido: título centralizado em gradiente, tudo entrando com fade, rótulos nos cantos, bordas de quadro,
  glow em UI, explosão genérica de partículas, easing "bouncy" em UI.
- Uma fonte display + uma de UI. Uma cor de destaque.
- Algo novo na tela a cada 2-4 s. Gancho nos primeiros 2 s.
- Texto legível com 360 px de largura (contraste WCAG AA 3:1 no mínimo).
- Morph de UI: um só container que nunca corta; muda tamanho/raio/cor de estado em estado, um cursor
  dispara cada mudança, o texto entra depois do morph começar e sai antes do próximo. Último quadro = primeiro (loop).

## 3. Plano antes de código
`docs/shotlist.md` na grade de batida: cada plano com tempo, câmera, texto, SFX. Mostre ao usuário e espere OK.
Filme longo: `docs/ANIMATION_GUIDE.md` primeiro (estilo comum), depois um capítulo por subagente.

## 4. Engine (starter/)
- `index.html`: defina `window.ready` (fontes + imagens), o render espera por ele. Um canvas, `window.seek(t)` pinta o quadro t. **Sem** CSS transitions, setTimeout,
  requestAnimationFrame no render, estado entre quadros, Math.random (use `rng(seed)`).
- `lib/motion.js`: `spring(t,k,d)` (forma fechada), `track(t, keys)` (um valor com vários alvos = soma de
  uma mola por mudança, nunca reinicie a mola), `indicator` (borda da frente mais rígida = estica),
  `swapAlpha`, `loopT`. Presets em `SPRINGS`: snappy (UI), base (cards, câmera), heavy (tipo grande, logo), playful (mascote).
- Som: `python beats.py musica.wav > beats.json` (precisa `pip install librosa numpy soundfile`).
  Mudanças de estado em `beats`, momentos grandes em `downbeats`, SFX em `hits`.
  Sem música: `node sfx.mjs cues.json out/sfx.wav` (click, pop, thump, whoosh sintetizados).
- Render: `node render.mjs --fps 60 --dur 15 --sub 4` (sub = subquadros misturados = motion blur).
  Rascunho rápido: `--fps 30 --sub 1`.
- Vários formatos: cenas escritas contra uma função de layout (W, H), não pixels fixos. Re-enquadre, não corte.

## 5. Loop de crítica (obrigatório antes de mostrar qualquer coisa)
Rode `bash check.sh out/silent.mp4` (gera contact.png, phone.png, strip.png). Para conferir um ajuste sem re-render: `node stills.mjs 24.5 29.9` (só esses instantes). Vídeo longo (>20 s): faça uma contact sheet por metade (`-t 20` / `-ss 20`), senão cada quadro vira miniatura ilegível. Abra as imagens e olhe de verdade.
Seja um diretor duro, não um autor orgulhoso. Nota 1-10 em: gancho nos 2 s · legível no celular ·
qualidade do movimento (molas, sem quadro morto) · variedade · composição · fidelidade à marca · sync do som.
Procure: texto sobreposto em trocas, coisa deslizando linear, rótulo no canto, centralizado em gradiente,
texto borrado ao escalar, batida sem nada acontecendo, tranco na emenda do loop.
Liste os 3 piores problemas com timestamp em `docs/review_log.md`, corrija, re-renderize só o trecho.
**Mínimo 3 rodadas. Só faça o render final quando todas as notas forem 8+.**

## 6. Entrega
`out/final.mp4` (som mixado a -14 LUFS, comando em check.sh), `out/contact.png`, `out/poster.png`, loop check.
Diga em uma linha o que melhoraria na próxima.

## Prompts úteis
- Testar o setup (não testa ideia): "make a dynamic 15-second motion graphics video that shows what an
  incredible motion designer you are, like it's your showreel for a résumé. go all out."
- Marca: produto + URL + "use real screenshots, logo, assets" + "must have music" + beats de 2-4 s:
  gancho em 5 palavras → UI se monta → 3 features com cursor → 1 número → logo + CTA.
