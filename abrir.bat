@echo off
rem Abre o Marginalia em http://localhost:5173 (feche a janela "Marginalia - servidor" para parar)
cd /d "%~dp0"
start "Marginalia - servidor" /min python -m http.server 5173
timeout /t 1 /nobreak >nul
start "" http://localhost:5173
