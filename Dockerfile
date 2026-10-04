# Whisper.cpp compilado sem -march=native para rodar em qualquer x86-64/arm64.
FROM node:22-bookworm-slim AS whisper
RUN apt-get update && apt-get install -y --no-install-recommends git cmake build-essential ca-certificates
RUN git clone --depth 1 --branch v1.9.4 https://github.com/ggml-org/whisper.cpp /w \
 && cmake -S /w -B /w/build -DBUILD_SHARED_LIBS=OFF -DGGML_NATIVE=OFF -DWHISPER_BUILD_TESTS=OFF -DCMAKE_BUILD_TYPE=Release \
 && cmake --build /w/build -j --config Release --target whisper-cli

FROM node:22-bookworm-slim
# chromium traz as libs do chrome-headless-shell do HyperFrames; fonts-liberation cobre Arial nas legendas.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg chromium fonts-liberation fontconfig ca-certificates tini unzip git \
 && apt-get clean && npm install -g @anthropic-ai/claude-code @openai/codex && npm cache clean --force
COPY --from=whisper /w/build/bin/whisper-cli /usr/local/bin/whisper-cli
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY *.mjs ./
COPY public ./public
RUN mkdir -p /data /home/node/.claude-auth /home/node/.codex /home/node/.cache/hyperframes/whisper && chown -R node:node /data /home/node /app
USER node
# `hyperframes browser ensure` trava no spinner sem TTY; instala a mesma versão fixada pelo @puppeteer/browsers.
RUN node_modules/.bin/browsers install chrome-headless-shell@152.0.7977.30 --path /home/node/.cache/puppeteer > /dev/null \
 && (CI=1 timeout 300 node node_modules/hyperframes/dist/cli.js skills update talking-head-recut embedded-captions hyperframes-creative motion-graphics hyperframes-animation || echo "skills opcionais nao instaladas") \
 && ln -s /home/node/.claude/skills /home/node/.claude-auth/skills
ENV BIND=0.0.0.0 PORT=4317 STUDIO_DATA=/data CLAUDE_CONFIG_DIR=/home/node/.claude-auth STUDIO_BROWSER=/usr/bin/chromium HYPERFRAMES_TELEMETRY_DISABLED=1
VOLUME ["/data", "/home/node/.claude-auth", "/home/node/.codex", "/home/node/.cache/hyperframes/whisper"]
EXPOSE 4317
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:4317/').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
ENTRYPOINT ["tini", "--"]
CMD ["node", "server.mjs"]
