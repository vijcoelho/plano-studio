#!/usr/bin/env node
// Cria um projeto HyperFrames no estilo "vídeo desenhado" a partir do template da skill.
//   node novo-projeto.mjs <pasta-destino>
// 1) `hyperframes init` (se a pasta ainda não existe) → package.json, hyperframes.json, CLAUDE.md
// 2) copia o template por cima: index.html, compositions/, assets/ (sketch.js, texturas, fontes, sfx), tools/gen-music.mjs
import { cpSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, resolve, basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const dest = process.argv[2];
if (!dest) {
  console.error("uso: node novo-projeto.mjs <pasta-destino>");
  process.exit(1);
}
const target = resolve(dest);
const template = join(dirname(fileURLToPath(import.meta.url)), "..", "template");

if (!existsSync(target)) {
  // one command string: on Windows npx is a .cmd and needs a shell
  const r = spawnSync(`npx --yes hyperframes init "${basename(target)}" --non-interactive --example=blank --skill=general-video`,
    { cwd: dirname(target), stdio: "inherit", shell: true });
  if (r.status !== 0) {
    console.error("hyperframes init falhou — veja o erro acima.");
    process.exit(r.status ?? 1);
  }
} else if (!existsSync(join(target, "hyperframes.json"))) {
  console.error(`${target} existe mas não é um projeto HyperFrames (sem hyperframes.json). Use uma pasta nova.`);
  process.exit(1);
}

cpSync(template, target, { recursive: true, force: true });
console.log(`\nprojeto pronto em ${target}
próximos passos:
  1. edite as cenas em compositions/ (paper → graph → ending são o exemplo "Sinapse")
  2. ajuste a trilha em tools/gen-music.mjs e rode: node tools/gen-music.mjs  (gera assets/bgm.mp3)
  3. npx hyperframes check  →  snapshot  →  render --fps 60 --quality delivery`);
