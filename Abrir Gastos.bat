@echo off
title Mis Gastos
cd /d "%~dp0"

rem Si Node no esta en el PATH, usa la ruta de instalacion por defecto
where node >/dev/null 2>/dev/null || set "PATH=%PATH%;C:\Program Files\nodejs"
where node >/dev/null 2>/dev/null || (
  echo No se encontro Node.js. Instalalo desde https://nodejs.org
  pause
  exit /b 1
)

rem Instala las librerias solo la primera vez
if not exist node_modules (
  echo Instalando librerias por primera vez...
  call npm install
)

rem Abre el navegador cuando el servidor ya esta listo
start "" /min cmd /c "timeout /t 2 /nobreak >/dev/null & start http://localhost:3000"

node --disable-warning=ExperimentalWarning src/server.js
pause
