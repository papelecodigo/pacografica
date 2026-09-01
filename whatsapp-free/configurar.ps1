$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$configPath = Join-Path $root 'config.local.json'
$defaultUrl = 'https://vvdrhzupgwveajmhssll.supabase.co'

Write-Host ''
Write-Host '============================================================' -ForegroundColor Cyan
Write-Host ' PAPEL E CÓDIGO - CONFIGURAÇÃO DO WHATSAPP ONLINE FREE' -ForegroundColor Cyan
Write-Host '============================================================' -ForegroundColor Cyan
Write-Host ''
Write-Host 'Você vai informar os dados do MESMO Supabase usado pelo ERP.'
Write-Host 'A Secret Key fica somente neste computador.' -ForegroundColor Yellow
Write-Host 'Nunca envie essa chave por WhatsApp, e-mail ou chat.' -ForegroundColor Yellow
Write-Host ''

$url = Read-Host "Project URL do Supabase [Enter = $defaultUrl]"
if ([string]::IsNullOrWhiteSpace($url)) { $url = $defaultUrl }
$url = $url.Trim().TrimEnd('/')

Write-Host ''
Write-Host 'No Supabase: Settings > API Keys > Secret keys' -ForegroundColor Green
Write-Host 'Copie a Secret Key (sb_secret_...) e cole abaixo.' -ForegroundColor Green
$secure = Read-Host 'Secret Key (o texto ficará oculto)' -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $secret = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
} finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
}

if ([string]::IsNullOrWhiteSpace($secret)) { throw 'Secret Key não informada.' }

$config = [ordered]@{
  supabaseUrl = $url
  supabaseSecret = $secret
}
$json = $config | ConvertTo-Json
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($configPath, $json, $utf8NoBom)

Write-Host ''
Write-Host 'Configuração salva com sucesso.' -ForegroundColor Green
Write-Host "Arquivo local: $configPath"
Write-Host ''
