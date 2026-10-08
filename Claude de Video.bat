@echo off
chcp 65001 >nul
title Claude de Video
cd /d "%~dp0"

where docker >nul 2>nul || (
  echo Docker Desktop nao encontrado. Abra primeiro o "Plano Studio.bat".
  pause & exit /b 1
)
docker info >nul 2>nul || (
  echo O Docker Desktop esta desligado. Abra primeiro o "Plano Studio.bat".
  pause & exit /b 1
)

if not exist videos mkdir videos
echo Preparando o container (a primeira vez demora alguns minutos)...
docker compose up -d --build || (echo Falha ao iniciar o container. & pause & exit /b 1)

echo.
echo Claude Code com as skills de video. Peca, por exemplo:
echo   "faz um video desenhado de 30s explicando o que e o Plano Studio"
echo Os videos ficam na pasta "videos" ao lado deste arquivo.
echo.
docker exec -it -w /home/node/videos plano-studio claude --model claude-opus-5-5
start "" "%~dp0videos"
