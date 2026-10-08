# Estilo visual

## Paleta
| Papel | Cor | Uso |
|---|---|---|
| Papel | `#efe9dc` + `assets/paper.png` | Fundo das cenas claras. O PNG traz grão e manchas |
| Papel do balão | `#fbf7ee` | Preenchimento da nuvem |
| Tinta | `#2a1d17` | Todo contorno e texto sobre o papel |
| Laranja do mascote | `#d97757`, hachura `#8e3a1e` | Corpo. Troque por `S.mascot(P,{color,shade})` para outra marca |
| Laranja escuro | `#b4532f` | Texto de destaque no papel (contraste AA), "!", sublinhado |
| Noite | `#0f1233`, glow `#2b2a78` | Fundo das cenas escuras, gradiente radial (evita banding) + `assets/grain.jpg` em `mix-blend-mode: overlay` a ~0.32 |
| Linhas de energia | `#b3a4ff` / `#8f7ff0` com `drop-shadow` lilás | Arestas da rede |
| Dourado | `#ffc861` (+ glow `#ffd27a`) | Nós, faíscas, "ideias" |
| Creme sobre noite | `#f6efdf` | Texto na cena escura |

Para outra marca, mude a cor do mascote e o destaque. Mantenha papel, tinta e noite: são eles que fazem o estilo.

## Fontes (em `assets/fonts/`, registradas no `<head>` do `index.html`)
- **Caveat 700**: frases manuscritas (legendas, frase final, "?" e "!"). Tamanho 96–130px. Anime com `writeOn`.
- **Shantell Sans** (variável, eixos `INFM` informal e `BNCE` bounce): rótulos, cards, nomes. 28–30px, `font-weight: 700`, `font-variation-settings: "INFM" 50–70`. É uma fonte de marcador feita para animação e fica legível em tamanho pequeno.
- Evite Space Mono e fontes de UI neste estilo: quebram a ilusão de desenho. Se o conteúdo for código de verdade, use Shantell em peso 700 mesmo.

## Texturas
- `paper.png` (1920×1080): gerado com ffmpeg (ruído de luma + manchas borradas em soft-light). Usado como `background: url("assets/paper.png") center / cover`.
- `grain.jpg`: ruído cinza para as cenas escuras. Mantenha abaixo de 2MB, senão o HyperFrames não embute o arquivo no bundle.
- Vinheta: `radial-gradient(ellipse at 50% 55%, transparente 55%, rgba(80,60,40,.16) 100%)` sobre o papel.

## Composição
- O mascote tem ~400px de largura no quadro, com o chão (linha tremida) em y≈760 na cena de entrada.
- O balão fica acima e à direita da cabeça, com 2 bolinhas de "rabo" saindo da cabeça.
- Na cena final, mascote e balão ficam no terço superior e a frase em 2 linhas centralizadas embaixo, cada linha num `div` próprio (títulos curtos podem quebrar manualmente).
- Na rede noturna, o centro é o mascote em miniatura (`S.mascot` com `scale(.32)`), com 6–8 nós em volta e rótulos do lado de fora (acima ou abaixo). Deixe a legenda manuscrita num canto sem nós.
- Tamanho mínimo de texto na tela: 28px. Todo texto passa no check de contraste do HyperFrames.
