@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Papel e Codigo - WhatsApp Local

echo ==============================================
echo   PAPEL E CODIGO - WHATSAPP LOCAL
echo ==============================================
echo.
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js nao foi encontrado neste computador.
  echo Instale Node.js 18 ou superior e execute este arquivo novamente.
  echo https://nodejs.org/
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Primeira execucao: instalando o conector...
  echo Isso pode levar alguns minutos.
  call npm install
  if errorlevel 1 (
    echo.
    echo Falha na instalacao. Verifique a internet e tente novamente.
    pause
    exit /b 1
  )
)

echo.
echo Iniciando WhatsApp local...
echo Mantenha esta janela aberta enquanto usar o ERP.
echo.
node server.js

echo.
echo O conector foi encerrado.
pause
