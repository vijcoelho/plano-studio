@echo off
cd /d "%~dp0"
docker compose stop
echo Plano Studio parado. Seus projetos continuam salvos no Docker.
timeout /t 4 >nul
