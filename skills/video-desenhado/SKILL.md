---
name: video-desenhado
description: Cria vídeos curtos (20–45s) no estilo "desenhado à mão" — papel creme texturizado, traço de caneta que ferve (line boil), um mascote laranja hachurado estilo Claude Code que anda, pula e reage, cenas noturnas com linhas brilhantes, frase final escrita à mão e trilha de caixinha de música gerada no próprio projeto. Use esta skill sempre que o usuário pedir um vídeo "desenhado", "rabiscado", "hand-drawn", "estilo sketch/doodle", "com o mascote do Claude", "igual àquele vídeo feito com Opus", um vídeo-conceito curto com personagem para produto/feature/marca, ou quiser reaproveitar o estilo do vídeo "Sinapse" em outro projeto — mesmo que ele não diga "HyperFrames". Constrói sobre o HyperFrames (renderiza HTML → MP4).
---

# Vídeo desenhado

Um kit para fazer curtas animados com cara de desenho à mão, no HyperFrames. Nasceu do vídeo "Com o Sinapse, seu Claude não perde a memória" e traz:

- `template/assets/sketch.js`: traço de caneta com seed, mascote, nuvem de pensamento e helpers de personagem (`walk`, `hop`, `surprise`, `pop`, `spring`, `writeOn`, `boil`).
- `template/`: um projeto completo de 3 cenas (papel → rede noturna → final) para servir de ponto de partida, com texturas, fontes, SFX e o gerador de trilha `tools/gen-music.mjs`.
- `scripts/novo-projeto.mjs`: cria um projeto novo com tudo isso.

O HyperFrames continua sendo o motor. Para o contrato de composição, carregue `/hyperframes-core` antes de escrever HTML de cena. Esta skill substitui a entrevista longa do `/hyperframes`: o estilo, o formato e o fluxo já estão decididos aqui.

## 1. Entender a história (poucas perguntas)

Pergunte só o que mudaria o vídeo, numa rodada:

1. **Qual a história?** Problema → descoberta → resolução, com o mascote como protagonista. Se o usuário der só o tema, proponha o arco em 3–5 batidas e siga.
2. **Frase final** (a mensagem que fica na tela).
3. **Idioma** do texto na tela (padrão: o idioma da conversa).

Assuma o resto e diga o que assumiu: 16:9 1920×1080, ~30s, 60fps, trilha gerada, sem narração. Grave um `BRIEF.md` na raiz do projeto (frontmatter `workflow: general-video`, `flow: automation`, `storyboard: no`, `message`, `language`, `length`) para o HyperFrames reconhecer o projeto.

Por que tão pouco: o valor desse estilo está na execução (timing, física, traço). Perguntas sobre paleta ou fonte já têm resposta boa no kit.

## 2. Criar o projeto

```bash
node ~/.claude/skills/video-desenhado/scripts/novo-projeto.mjs <pasta-do-projeto>
```

O comando roda `hyperframes init` e copia o template. O projeto já passa no `npx hyperframes check` e renderiza o exemplo Sinapse, o que prova que o ambiente funciona antes de você mexer em qualquer coisa.

## 3. Planejar as cenas

Uma sub-composição por cena em `compositions/`, montadas em `index.html` com `data-start`/`data-duration`. Os três arquétipos do template cobrem a maioria das histórias:

| Arquivo | Arquétipo | Reaproveite para |
|---|---|---|
| `paper.html` | Papel: mascote entra andando, balão com ideias, reação (confuso → surpreso), zoom para dentro do olho | apresentar o problema; "antes" |
| `graph.html` | Noite: rede/constelação se desenha a partir do centro, pulsos viajam nas linhas, legenda escrita à mão, íris abre de volta pro papel | a descoberta; como o produto funciona |
| `ending.html` | Papel: mascote feliz pula, balão com o resultado, frase final escrita à mão com a palavra-chave sublinhada | resolução + mensagem |

Para uma história nova, mantenha a estrutura e troque o conteúdo: os cards do balão, os nós e rótulos da rede, a frase. Crie uma cena nova (copiando uma existente) só quando a história pedir uma batida que nenhum arquétipo cobre. Registre o plano em `STORYBOARD.md`, com uma linha por cena contendo tempo e intenção.

Ritmo que funcionou: cena de problema com ~13s, descoberta com ~10s, final com ~8s. Deixe 2–3s de respiro no final, com a frase parada na tela.

## 4. Animar com o kit

Leia `references/animacao.md` antes de mexer em movimento: ele tem a API dos helpers e os princípios por trás (caminhada sem pé deslizando, squash & stretch, antecipação, molas). O resumo:

- **Personagem:** `S.walk` para entrar em cena, `S.hop` para comemorar, `S.surprise` para o "!" e `S.pop`/`S.spring` para qualquer coisa que surja. Evite `back.out`: a mola (`spring`) dá a mesma energia com física crível.
- **Traço vivo:** `S.boil(tl, P, t0, t1)` na duração da cena. Todo contorno feito com `S.boiled(...)` ferve junto.
- **Desenhar linhas:** `pathLength="1" stroke-dasharray="1" stroke-dashoffset="1"` → tween `strokeDashoffset: 0`.
- **Texto:** `S.writeOn(tl, palavras, t)` para frases manuscritas (Caveat) e Shantell Sans para rótulos.
- **Câmera:** zoom em alvo fora do centro usa dois wrappers (externo escala, interno translada `-offset`), como em `paper.html`.

## 5. Trilha e som

`tools/gen-music.mjs` gera uma caixinha de música determinística com seções que seguem a história. Edite a lista de notas por seção para casar com os tempos das suas cenas. Os passos do mascote já saem sincronizados, porque o script lê o mesmo `walkPlan` do `sketch.js`, então mantenha os parâmetros do `walk` iguais nos dois arquivos. Rode `node tools/gen-music.mjs` e ele gera `assets/bgm.mp3`.

Os SFX ficam em `assets/sfx/` (whoosh, pop, chime, sparkle), cada um como `<audio id=… data-start=…>` em `index.html` no tempo global do evento, com volume entre 0.3 e 0.45. Se o usuário tiver conta HeyGen logada, `npx hyperframes media-use resolve --type bgm` também é uma opção para a trilha.

## 6. Verificar e renderizar

1. `npx hyperframes check`, que precisa passar. Os avisos de overflow nos wrappers de câmera são esperados; marque-os com `data-layout-allow-overflow`.
2. Snapshots nos momentos-chave e uma folha de contato, para olhar tudo de uma vez só:
   ```bash
   npx hyperframes snapshot -o .hyperframes/snap --at 1,4.5,8,11,15,19,24,28 --no-end --describe false
   ```
   Monte o mosaico com ffmpeg (`tile=3x3`) e inspecione: pose, legibilidade, se a nuvem e os rótulos não se atropelam.
3. Render: `npx hyperframes render --fps 60 --quality delivery -o ../<nome>.mp4`. Com 60fps a caminhada e as molas ficam visivelmente mais fluidas. O boil continua a 8fps de propósito, como no desenho tradicional.

Antes de escrever ou debugar, leia `references/armadilhas.md`: são os erros que já custaram tempo neste estilo.

## Referências

- `references/animacao.md`: API do `sketch.js` e princípios de animação aplicados. Leia antes de animar.
- `references/estilo.md`: paleta, fontes, texturas, composição de quadro. Leia ao criar uma cena nova ou mudar a identidade (cor do mascote, marca).
- `references/armadilhas.md`: bugs conhecidos e como evitar. Leia antes de escrever HTML de cena e sempre que algo não aparecer ou não animar.
