---
name: dublar-video
description: >
  Põe narração em vídeos HyperFrames já renderizados, uma fala por cena, sem
  tocar nos MP4 silenciosos. Lê a grade de cenas direto das composições, gera a
  voz (ElevenLabs ou Edge TTS), apara o silêncio, posiciona cada fala no instante
  da cena e mixa. Use quando o usuário pedir "dublar", "põe voz", "narração",
  "áudio nos vídeos", "locução", ou /dublar-video.
---

# /dublar-video — Narração em lote de vídeos

Pega um projeto de vídeo HyperFrames renderizado → entrega os mesmos vídeos com
voz, sincronizados cena a cena, prontos pra postar.

Regra que não se quebra: **`renders/` continua silencioso.** A dublagem sempre
sai em `renders-dublados/`. Se a narração não ficar boa, o lote mudo ainda está lá.

## Como rodar

A skill é global (`~/.claude/skills/dublar-video/`) e o script roda **de dentro
do projeto de vídeo**, sem copiar nada. Todo caminho é relativo ao diretório
atual:

```powershell
cd caminho/do/projeto-de-video
node ~/.claude/skills/dublar-video/dublar.mjs
```

Não vendorize uma cópia em `tools/` — vira duas fontes e a do projeto envelhece.
O que o projeto guarda é o `dublagem.json` (roteiro, cues, voz); o script é
ferramenta.

### O que o projeto de vídeo precisa ter

| Caminho | Para quê | Obrigatório |
|---|---|---|
| `renders/<slug>.mp4` | os vídeos mudos de entrada | sim (troque com `--entrada=`) |
| `dublagem.json` | roteiro falado, cues, presets de voz | sim |
| `compositions/videos/<slug>.html` | de onde a grade de cenas é lida | não, se declarar `beats` |
| `.env` | `ELEVENLABS_API_KEY` | sim, pro motor ElevenLabs |

O script cria `assets/voice/`, `assets/sfx/` e `renders-dublados/` sozinho.

**Funciona fora do HyperFrames?** Sim. Só a leitura automática da grade depende
das composições HyperFrames; para qualquer outra pasta de MP4 basta declarar os
beats à mão:

```json
{ "entrada": "exports", "beats": { "*": [[0.35, 3.15], [4.25, 4.25]] } }
```

## Dependências

- `ffmpeg` e `ffprobe` no PATH
- Node 20+ (usa `process.loadEnvFile`)
- `ELEVENLABS_API_KEY` no `.env` do projeto de vídeo (motor recomendado)
- `node-edge-tts` via npm — só se for usar o motor Edge (gratuito, rascunho).
  Instale **no projeto de vídeo**: o `import` resolve a partir do diretório atual
- Tom de voz: `_memoria/preferencias.md` — LER antes de escrever as falas

---

## O que sempre dá errado (leia antes de debugar sincronia)

Estes dois são a causa de quase toda dublagem "fora de sincronia". O script já
resolve os dois; o registro fica aqui pra ninguém reintroduzir.

**1. Uma fala longa sobre um vídeo de várias cenas.** A voz termina antes do
vídeo e as frases não começam junto das trocas visuais. É uma fala **por cena**,
posicionada no instante da cena. Nunca uma narração contínua.

**2. O TTS devolve silêncio nas pontas do MP3.** O Edge chega a ~1s. Mesmo
posicionada no instante certo, a fala entra atrasada. O script apara
(`silenceremove` nas duas pontas) antes de posicionar. No lote 2, aparar o
silêncio fez 8 das 40 falas deixarem de estourar o orçamento da cena — sem
acelerar nem reescrever nada.

---

## Fluxo

### 1. Ler a grade de cenas

O script deriva sozinho de `compositions/videos/<slug>.html`: pega os clips com
`data-start`/`data-duration` que **não** cobrem o vídeo inteiro (descarta ground
e topline), ordena por início. Cada clip vira uma cena, cada cena leva uma fala.

Se a composição não existir (só o MP4), declare a grade em `dublagem.json`:

```json
{ "beats": { "*": [[0.35, 3.15], [4.25, 4.25], [9.25, 4.25], [14.25, 3.5]] } }
```

Cada par é `[instante em que a voz entra, quanto tempo a fala pode durar]`.

A folga é deliberada: a fala entra 0,35 s depois do começo do vídeo (deixa o
gancho aparecer primeiro), 0,25 s depois das cenas seguintes, e termina 0,5 s
antes do próximo corte — 0,25 s na última cena, que só precisa acabar antes do
vídeo.

### 2. Escrever as falas

Uma frase curta por cena, descrevendo **a cena atual**. A fala não anuncia o
que vem, não repassa o que passou.

Calibre pelo `_memoria/preferencias.md`. Nunca prometa resultado nem invente
número de uso — se o projeto tiver `PRODUCT.md`, ele manda no vocabulário.

Grave em `dublagem.json` na raiz do projeto de vídeo:

```json
{
  "voz": "bruno",
  "saida": "renders-dublados",
  "lang": "pt-BR",
  "vozes": {
    "bruno": { "motor": "elevenlabs", "voice": "<voice_id>" }
  },
  "videos": {
    "01-followup-nao-sumiu": [
      "Seu follow-up sumiu?",
      "A planilha não chama você de volta.",
      "O OneProspector monta a fila com cada próximo passo.",
      "Um lead por vez, até a fila ficar limpa."
    ]
  }
}
```

### 3. Escolher a voz

Do diretório do projeto de vídeo:

```powershell
node ~/.claude/skills/dublar-video/dublar.mjs --listar-vozes        # vozes da conta ElevenLabs
```

**Sempre gere amostra antes do lote inteiro.** Uma peça, duas ou três vozes, em
`samples/`, e o usuário escolhe ouvindo:

```powershell
node ~/.claude/skills/dublar-video/dublar.mjs --voz=bruno --saida=samples 01
node ~/.claude/skills/dublar-video/dublar.mjs --voz=carla --saida=samples 01
```

Mande os arquivos pro usuário com `SendUserFile`. Não decida timbre sozinho.

Motores disponíveis:

| Motor | Vozes pt-BR | Custo | Quando |
|---|---|---|---|
| `elevenlabs` | depende do plano (ver abaixo) | chave | padrão |
| `edge` | só 3 (`antonio`, `francisca`, `thalita`) | grátis, sem chave | rascunho |

O Edge soa sintético e **não tem como melhorar** — só existem essas três vozes
no endpoint gratuito. Mexer em rate/pitch não conserta timbre. Se o usuário
reclamar da naturalidade do Edge, o caminho é trocar de motor, não afinar o
preset.

#### O que o plano free do ElevenLabs trava (verificado, set/2026)

Confira o plano antes de prometer qualquer coisa:

```powershell
# tier, créditos usados/limite, se clonagem está liberada
node ~/.claude/skills/dublar-video/dublar.mjs --listar-vozes    # e GET /v1/user/subscription
```

- **Vozes da biblioteca não funcionam via API no free.** Retorna
  `402 paid_plan_required`, mesmo nas marcadas `free_users_allowed` em
  `/v1/shared-voices` — essa flag vale pro painel web, não pra API. Ou seja:
  **as vozes brasileiras nativas estão fora do free via API.** Só dá pra usar as
  ~21 vozes prontas da conta, todas inglesas; com `language_code: "pt"` elas
  falam português, mas com sotaque. Sempre faça o usuário ouvir antes.
- **Clonagem instantânea não existe no free** (`can_use_instant_voice_cloning:
  false`). Clonar a voz do usuário exige plano pago.
- **10.000 créditos/mês**, 1 crédito por caractere. Um vídeo de 18 s com 4 falas
  dá ~150 caracteres, então um lote de 10 custa ~1.500. Cabe folgado — mas cada
  voz testada numa amostra custa o mesmo, então teste em **um** vídeo só.
- **Uso comercial no free costuma exigir atribuição.** Se o vídeo é peça de
  marketing, avise o usuário pra conferir os termos do plano dele. Não afirme
  que está liberado.

#### eleven_v3 vs eleven_multilingual_v2

`eleven_v3` é mais expressivo e aceita `language_code`. **Não aceita
`previous_text`/`next_text`** — retorna `400 unsupported_model`. O script já
manda o stitching só no v2.

Como as falas ficam separadas por segundos de silêncio e cenas diferentes, a
expressividade do v3 pesa mais que a continuidade de tom do stitching. Padrão:
v3, com queda automática pro v2 se a conta recusar.

### 4. Desenho de som

Sem som a animação fica seca. Dois tipos de cue, e a diferença importa:

**Transições saem sozinhas da grade.** O efeito `transicao` entra em
`início_da_cena − 0.45s`, que é quando a composição HyperFrames começa a
deslizar pra fora. Basta declarar o som `transicao` em `dublagem.json` — vale
pra todos os vídeos sem escrever cue nenhum.

**Acentos são manuais.** Só a timeline GSAP sabe quando o selo dá o pop ou os
itens entram escalonados. Leia o `<script>` de cada composição e pegue as
posições:

```bash
grep -oP '\.(fromTo|to)\(\s*"[^"]+"[\s\S]*?,\s*[\d.]+\s*\)' compositions/videos/01-x.html
```

Mapeie pelo tipo de animação, não pelo nome do elemento:

| Animação na timeline | Som |
|---|---|
| item de lista entrando em sequência | `tick` |
| `ease: "back.out(...)"`, selo, badge, confirmação | `selo` |
| `scaleX` de régua, risco, varredura | `linha` |
| revelação da marca no fim | `marca` |

Catálogo e cues em `dublagem.json`:

```json
"sons": {
  "transicao": { "prompt": "short subtle whoosh transition, clean, dry, no music", "dur": 1.2, "vol": -9 },
  "tick":      { "prompt": "very short soft UI tick, dry, no reverb, no music",     "dur": 0.6, "vol": -13 }
},
"cues": {
  "01-followup-nao-sumiu": [[9.62, "tick"], [11.05, "selo"], [15.45, "marca"]]
}
```

Regras que economizam crédito e ouvido:

- **Um efeito é gerado uma vez e reusado nos dez.** A biblioteca é por nome, não
  por vídeo. Gerar um som por cena queima crédito à toa e deixa o lote
  inconsistente.
- Cada arquivo é normalizado no pico (−3 dBFS) ao entrar no cache, então `vol`
  em dB significa a mesma coisa entre efeitos diferentes.
- **Nunca dois cues a menos de 0,15 s** — vira flam e soa como defeito. Se a
  timeline tem 5 itens em 0,1 s de intervalo, use **um** som de varredura, não
  cinco ticks.
- De 7 a 9 acentos por vídeo de 18 s. Mais que isso vira ruído.
- Peça sempre `dry, no reverb, no music` no prompt: cauda de reverb atravessa o
  corte de cena.

Para calibrar nível sem reescrever a tabela, `--som-db=+6` desloca todos de uma
vez. Gere duas ou três intensidades numa peça e **mande o usuário ouvir no
celular** — é onde o vídeo vai tocar, e o que soa bom no fone some no alto-falante.

### 5. Gerar o lote

```powershell
node ~/.claude/skills/dublar-video/dublar.mjs            # todos
node ~/.claude/skills/dublar-video/dublar.mjs 03 07      # só alguns
```

O script cacheia o áudio bruto em `assets/voice/bruto/<voz>/`. Trocou uma frase?
Apague o bruto daquela cena pra ele refazer:

```powershell
Remove-Item assets/voice/bruto/bruno/03-b2.mp3
node ~/.claude/skills/dublar-video/dublar.mjs 03
```

### 6. Validar — sempre, nunca só no primeiro

```powershell
# streams e duração
ffprobe -v error -show_entries stream=codec_type,codec_name,width,height,channels,sample_rate -show_entries format=duration -of csv=p=0 renders-dublados/01-x.mp4

# onde a voz entra: tem que bater com os instantes da grade
ffmpeg -i renders-dublados/01-x.mp4 -af silencedetect=n=-45dB:d=0.4 -f null -
```

Correto: H.264 na resolução original (stream copiado, vídeo não recodificado),
AAC 48 kHz estéreo, duração igual à do mudo, entradas de voz nos instantes da
grade.

A primeira entrada (0,35 s) normalmente **não** aparece no `silencedetect` —
o silêncio inicial é curto demais pro limiar. Isso é esperado, não é falha.

Rode nos dez, não só no primeiro. Loudness integrado costuma dar −16 a −18 LUFS
com pico em −1,5 dBTP; o `loudnorm` é linear e para no teto de pico. O TikTok
normaliza na subida.

### 7. Fechar o lote

- `DUBLAGEM.md` no projeto: voz escolhida, grade, como regerar
- `LEGENDAS.md`: legenda + hashtags por vídeo e ordem de postagem
- `README.md`: apontar `renders-dublados/` como a versão de postar
- `.gitignore`: `node_modules/`, `assets/voice/bruto/`, `.env`

---

## Avisos do script

`AVISOS: NN-bK: 4.51s em 3.5s (tempo 1.289) — encurtar a frase`

A fala não cabe na cena. O script acelera até `1.12` sozinho; acima disso ele
avisa em vez de estragar a locução. **Encurte a frase** — não suba o limite. Se
várias avisarem no mesmo lote, o roteiro está denso demais pra grade, não é
problema de voz.

## Nunca

- Recodificar o vídeo (`-c:v copy`, sempre)
- Sobrescrever `renders/`
- Gerar o lote inteiro sem o usuário aprovar a voz numa amostra
- Commitar `.env` ou o áudio bruto
