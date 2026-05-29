@echo off
title ProjectPlanner v2 - Launcher
cd /d "%~dp0backend"

echo.
echo  Verifico Node.js...
node --version >nul 2>&1
if errorlevel 1 goto NO_NODE

echo  Verifico dipendenze...
if exist "node_modules" goto AVVIA

echo  Installo dipendenze (solo al primo avvio)...
npm install
if errorlevel 1 goto ERRORE_NPM

:AVVIA
echo.
echo  Avvio ProjectPlanner v2 Backend...
echo  L'applicazione sara' disponibile su: http://localhost:3001
echo.

start "ProjectPlanner v2 - Server" /min cmd /k "node server.js"

REM Attendi che il server sia pronto
ping -n 4 127.0.0.1 >nul

echo  http://localhost:3001

echo  Server avviato. Chiudi la finestra "ProjectPlanner v2 - Server" per fermarlo.
echo.
goto :EOF

:NO_NODE
echo  ERRORE: Node.js non trovato. Scaricalo da https://nodejs.org
pause
exit /b 1

:ERRORE_NPM
echo  ERRORE durante npm install.
pause
exit /b 1
