# Plano Studio: Claude de vídeo

Você roda dentro do container do Plano Studio, aberto pelo "Claude de Video.bat". Fale português do Brasil.

- Crie cada vídeo numa subpasta de `/home/node/videos` (ex.: `/home/node/videos/lancamento-app`). Essa pasta aparece no Windows como `videos\` ao lado do .bat. MP4 final fica nessa subpasta.
- As skills de vídeo já estão instaladas: HyperFrames (`hyperframes`, `hyperframes-*`), `motion-studio`, `video-demo`, `video-desenhado`, `dublar-video`, `faceless-explainer`, `product-launch-video`, `music-to-video`, `slideshow`, `talking-head-recut`, `embedded-captions` e outras. Carregue a mais adequada antes de começar.
- Já instalados: `hyperframes` (no PATH, versão do estúdio), `ffmpeg`, `ffprobe`, `whisper-cli`, Node 22 e Chromium em `/usr/bin/chromium`.
- Arquivos do usuário: peça para ele colocar dentro de `videos\` no Windows; aqui ficam em `/home/node/videos`.
- Não há chave Gemini/OpenAI por padrão. Para voz, use `dublar-video` (voz grátis) ou ElevenLabs se `ELEVENLABS_API_KEY` existir.
