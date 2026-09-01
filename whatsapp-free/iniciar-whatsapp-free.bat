@echo off
setlocal EnableExtensions
chcp 65001 >nul
color 0A
set "ROOT=%USERPROFILE%\PapelECodigoWhatsAppFree"
set "RAW=https://raw.githubusercontent.com/papelecodigo/pacografica/main"

if not exist "%ROOT%" mkdir "%ROOT%"
cd /d "%ROOT%"

echo ============================================================
echo  PAPEL E CODIGO - WHATSAPP ONLINE FREE
echo ============================================================
echo.
echo Este conector usa seu computador + Cloudflare Tunnel gratuito.
echo Mantenha este computador ligado para o WhatsApp ficar online.
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nao encontrado. Tentando instalar automaticamente...
  where winget >nul 2>nul
  if errorlevel 1 (
    echo.
    echo ERRO: Node.js nao esta instalado e o winget nao foi encontrado.
    echo Instale Node.js LTS e execute este arquivo novamente.
    pause
    exit /b 1
  )
  winget install --id OpenJS.NodeJS.LTS --exact --accept-source-agreements --accept-package-agreements
  set "PATH=%ProgramFiles%\nodejs;%PATH%"
)

where node >nul 2>nul
if errorlevel 1 (
  echo ERRO: Node.js ainda nao foi encontrado. Reinicie o Windows e tente novamente.
  pause
  exit /b 1
)

echo Atualizando arquivos do conector...
curl.exe -L --fail --silent --show-error "%RAW%/whatsapp-free/package.json" -o package.json || goto :download_error
curl.exe -L --fail --silent --show-error "%RAW%/whatsapp-free/launcher.js" -o launcher.js || goto :download_error
curl.exe -L --fail --silent --show-error "%RAW%/whatsapp-free/configurar.ps1" -o configurar.ps1 || goto :download_error
curl.exe -L --fail --silent --show-error "%RAW%/whatsapp-cloud/server.js" -o server.js || goto :download_error

if not exist cloudflared.exe (
  echo Baixando Cloudflare Tunnel...
  curl.exe -L --fail --show-error "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" -o cloudflared.exe || goto :download_error
)

if not exist config.local.json (
  echo.
  echo PRIMEIRA CONFIGURACAO
  echo O sistema vai pedir a Project URL e a Secret Key do Supabase.
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%ROOT%\configurar.ps1"
  if errorlevel 1 (
    echo Configuracao cancelada ou invalida.
    pause
    exit /b 1
  )
)

if not exist node_modules (
  echo.
  echo Instalando componentes. Isso acontece somente na primeira vez...
  set "PUPPETEER_SKIP_DOWNLOAD=true"
  call npm install --omit=dev
  if errorlevel 1 (
    echo.
    echo ERRO ao instalar componentes.
    pause
    exit /b 1
  )
)

echo.
echo Iniciando servidor, WhatsApp e tunel HTTPS...
echo Nao feche esta janela enquanto quiser o WhatsApp online.
echo.
node launcher.js

echo.
echo O conector foi encerrado.
pause
exit /b 0

:download_error
echo.
echo ERRO ao baixar os arquivos do conector. Verifique sua internet e tente novamente.
pause
exit /b 1
