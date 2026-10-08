# Animação: princípios + API do `sketch.js`

`sketch.js` é carregado no `<head>` do `index.html` e expõe `window.Sketch`. Cada cena usa um prefixo curto `P` (`"p"`, `"g"`, `"e"`…) para que os ids e classes gerados não colidam entre cenas.

```js
const S = window.Sketch, P = "p";
const root = document.querySelector('[data-composition-id="paper"]');
const style = document.createElement("style");
style.textContent = S.INK_CSS(P) + S.CLOUD_CSS(P);   // estilo do traço (e da nuvem)
root.appendChild(style);
root.querySelector("#p-clawd-inner").innerHTML = S.mascot(P);
const tl = gsap.timeline({ paused: true });
S.boil(tl, P, 0, DURACAO_DA_CENA);
// ... tweens ...
window.__timelines["paper"] = tl;
```

## Por que cada princípio importa

O olho perdoa desenho simples, mas não perdoa física errada. Um mascote que é só um retângulo parece vivo quando o movimento dele tem peso.

- **Pés que não deslizam.** Na caminhada, a perna apoiada no chão tem que recuar (em relação ao corpo) exatamente na velocidade com que o corpo avança. Se não, o personagem "patina". O `walk` faz a conta: o corpo anda `s` px por passo em ritmo linear e a perna apoiada recua `s` no mesmo intervalo.
- **Poses de contato e passagem.** O corpo desce no contato e sobe na passagem (a perna livre cruza a de apoio no ponto mais alto do arco). Sem esse sobe-e-desce, parece flutuar.
- **Antecipação.** Antes de um movimento grande vem um pequeno contrário: agachar antes de pular, encolher antes do susto. É isso que avisa o espectador do que vem.
- **Squash & stretch.** Estica na velocidade, amassa no impacto. O volume visual se conserva: quando o `scaleY` cai, o `scaleX` sobe.
- **Follow-through.** Quando o corpo para, as partes soltas continuam um pouco: o personagem inclina pra trás e volta com mola, e os braços assentam depois do corpo.
- **Molas em vez de `back.out`.** O `back.out` é uma curva desenhada, e a mola é física. `damping` 1 assenta sem passar do ponto; 0.6–0.7 dá o "boing" brincalhão desse estilo; abaixo de 0.5 vira desenho de borracha.
- **Line boil a 8fps.** O traço redesenhado 8×/s (desenho "em três") é o que faz parecer feito à mão. O movimento em si roda a 60fps. Não sincronize os dois: o contraste entre traço tremido e movimento liso é justamente o charme.
- **Variedade.** Não repita o mesmo ease, a mesma duração ou a mesma direção em tudo. Entradas usam curvas `.out`, saídas `.in`, e saídas são mais rápidas que entradas.

## API

### Traço
| Função | O que faz |
|---|---|
| `S.line(x1,y1,x2,y2, r, j)` / `S.rect(x,y,w,h, r, j)` / `S.ellipse(cx,cy,rx,ry, r, j)` | Retorna o `d` de um path tremido. `r = S.rng(seed)`, `j` = tremor em px |
| `S.boiled(P, [[S.rect,[x,y,w,h,j]], …], seed)` | Markup de 3 variantes × 2 passadas de caneta. Coloque dentro de `<g class="${P}-ink">` |
| `S.boil(tl, P, t0, t1, fps=8)` | Alterna as 3 variantes ao longo do tempo |
| `S.INK_CSS(P)` | CSS do traço (tinta #2a1d17, 4.4px + passada fina a 55%) |

### Mascote
`S.mascot(P, { color, shade, happy })` retorna um SVG de 400×300. Corpo 60..340 × 34..202, pés em y≈266. Partes animáveis: `#P-legsA`, `#P-legsB`, `#P-upper` (corpo, braços e olhos), `#P-armL`, `#P-armR` (girar com `svgOrigin: S.SHOULDER.L/R`), `#P-eyes` (mover x/y para "olhar", `scaleY` para piscar), `#P-happy` (olhos ^^), `#P-reflect` (reflexo dourado no olho direito, para o zoom). Envolva-o em dois divs: `#P-clawd` (posição/x) > `#P-clawd-inner` (inclinação/squash, `transform-origin: 50% 90%`).

### Movimento
| Função | Uso |
|---|---|
| `S.spring({response, damping})` → `{duration, ease}` | Mola exata (seek-safe). Use o `duration` que ela devolve |
| `S.pop(tl, sel, t, {response, damping, origin, svgOrigin})` | Entrada com mola (scale 0→1, opacity) |
| `S.walk(tl, P, {sel, inner, t0, x0, dist, stride, stepDur, lift})` | Caminhada completa. Retorna quando assentou. Para `dist` 1000 e `stepDur` 0.19 → ~3.9s |
| `S.walkPlan({t0, dist, stride, stepDur})` | Só o cronograma dos passos (usado pelo gerador de trilha para os passinhos) |
| `S.hop(tl, sel, t, altura)` | Pulo com antecipação/squash/stretch. Duração ~1s. Espace pulos seguidos pelo retorno |
| `S.surprise(tl, sel, t)` | Susto: encolhe, estica pra cima, volta com mola |
| `S.cloud(P, puffs, seed)` + `S.popCloud(tl, P, puffs, t)` | Nuvem de pensamento `[[cx,cy,r],…]`. Infla puff a puff. Inclua `S.CLOUD_CSS(P)` |
| `S.writeOn(tl, elementos, t, cps=16)` | Revela cada palavra da esquerda pra direita na velocidade da caneta. Retorna o tempo final. Palavras precisam ser `inline-block` |

## Receitas que funcionaram

- **Zoom para dentro do olho** (transição papel → noite): o wrapper externo escala 1→60 (`expo.in`, 1.6s), o interno translada `-(alvo - centro)` (`power2.inOut`, 1.1s), um overlay na cor da próxima cena sobe nos últimos 0.4s e o `#P-reflect` aparece no olho antes do mergulho. Não use `will-change` nesses wrappers (ver armadilhas).
- **Íris de volta ao papel:** um div com a textura do papel e `clip-path: circle(0%→75%)`, `power2.in`, 0.8s, enquanto a câmera empurra para o centro.
- **Rede que acende:** raios desenhados do centro para cada nó com um pulso (círculo com glow) fazendo o mesmo trajeto no mesmo tempo. O nó entra com `pop` no fim do raio e o rótulo aparece logo depois. Depois fecha o anel entre os nós, vem uma onda (anel escalando de 0.2 para 9) e pulsos aleatórios com seed.
- **Memórias se desfazendo:** o card pisca (opacity yoyo), depois `blur(12px)` + sobe + gira + some, com `power2.in`.
