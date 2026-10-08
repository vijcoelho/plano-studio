# Armadilhas (cada uma já custou uma rodada)

| Sintoma | Causa | Como evitar |
|---|---|---|
| Nada anima e os SVGs gerados por script não aparecem | Erro de JS na cena: o timeline nunca é registrado. `check` mostra `composition script error` | Rode `npx hyperframes check` logo depois do primeiro HTML. Nos helpers de traço a geometria vem antes e o jitter `j` por último (`boiled` injeta o rng antes do `j`) |
| `invalid_parent_traversal_in_asset_path` | `url("../assets/…")` numa sub-composição | Caminhos sempre relativos à raiz: `assets/…`, mesmo dentro de `compositions/` |
| Frame 0 mostra estado errado (lint `gsap_timeline_set_initial_hide`) | `tl.set(..., 0)` para estado inicial | Escreva o estado inicial no markup/atributo (ex.: `S.mascot(P,{happy:true})`) ou use `fromTo` |
| `overlapping_gsap_tweens` em tweens encostados | Um tween termina exatamente quando o próximo começa no mesmo alvo e propriedade | Use `keyframes` num único tween (como o `walk`/`hop` fazem) ou deixe uma folga de ~0.05s |
| Zoom grande fica pixelado/borrado | `will-change: transform` congela a rasterização na escala inicial | Não use `will-change` em wrappers de câmera que escalam mais de ~3× |
| Estilo da cena vazando / sumindo | `<style>` fora do `<template>` da sub-composição | Tudo (style, markup, script) dentro do `<template>`. A raiz é estilizada por `#root` |
| Ids colidindo entre cenas | Ids iguais em cenas diferentes (o CSS é global no documento montado) | Prefixo por cena (`p-`, `g-`, `e-`) em todo id e classe |
| Aviso `connector_orphan` numa linha ainda não desenhada | Heurística vê o path com `dashoffset: 1` como visível | Esconda o grupo (`opacity: 0`) até o momento do desenho |
| Aviso `escaped_container` / `container_overflow` no zoom | É o próprio zoom de câmera | `data-layout-allow-overflow` no wrapper de câmera |
| `Not inlining … exceeds the 2 MB inline limit` | Textura PNG grande | Converta para JPG (`ffmpeg -q:v 4`) |
| Música/voz do HeyGen falha ("heygen CLI not found") | Sem login no HeyGen | Use `tools/gen-music.mjs` (offline). SFX locais em `assets/sfx/` |
| `r is not a function` | Chamou `S.line/rect/ellipse` direto com `j` antes do rng | Direto: `S.line(x1,y1,x2,y2, S.rng(seed), j)`. Via `boiled`: `[S.line,[x1,y1,x2,y2,j]]` |
| Olho/alvo sai do centro no zoom | Offset calculado errado | Wrappers aninhados: externo `scale`, interno `x: -(alvoX-960), y: -(alvoY-540)`. Some ao alvo os deslocamentos que ele tiver naquele instante (ex.: olhos movidos +10px) |
| Texto do `writeOn` corta acento ou itálico | Clip-path justo demais | Já usa `inset(-30% … -8%)`. Mantenha palavras como `inline-block` com margem |
| `snapshot` falha com "Device or resource busy" no Windows | Pasta `snapshots/` travada por outro processo | Use `-o .hyperframes/snapN` com uma pasta nova a cada rodada |
