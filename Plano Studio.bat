@echo off
chcp 65001 >nul
title Plano Studio
cd /d "%~dp0"

where docker >nul 2>nul || (
  echo Docker Desktop nao encontrado. Instale em https://www.docker.com/products/docker-desktop/ e abra este arquivo de novo.
  start "" https://www.docker.com/products/docker-desktop/
  pause & exit /b 1
)

docker info >nul 2>nul || (
  echo Iniciando o Docker Desktop...
  if exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" start "" "%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
  for /l %%i in (1,1,90) do (
    docker info >nul 2>nul && goto docker_ok
    timeout /t 2 /nobreak >nul
  )
  echo O Docker nao respondeu. Abra o Docker Desktop manualmente e tente de novo.
  pause & exit /b 1
)
:docker_ok

echo Preparando o Plano Studio (a primeira vez demora alguns minutos)...
docker compose up -d --build || (echo Falha ao iniciar o container. & pause & exit /b 1)

echo Aguardando o servidor...
for /l %%i in (1,1,60) do (
  curl -s -o nul http://127.0.0.1:4317/ && goto up
  timeout /t 1 /nobreak >nul
)
echo O servidor nao respondeu. Logs:
docker compose logs --tail 40
pause & exit /b 1
:up

set URL=http://127.0.0.1:4317
if exist "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" (
  start "" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" --app=%URL%
) else if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" (
  start "" "%ProgramFiles%\Google\Chrome\Application\chrome.exe" --app=%URL%
) else start "" %URL%

echo.
echo Plano Studio rodando em %URL%
echo Para desligar: execute "Parar Plano Studio.bat".
timeout /t 8 >nul
