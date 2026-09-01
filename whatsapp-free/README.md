# WhatsApp Online Free — Papel e Código

Arquitetura gratuita para manter o WhatsApp integrado ao ERP enquanto o computador da gráfica estiver ligado.

## Como funciona

- `server.js`: backend local do WhatsApp Web e integração com Supabase.
- `cloudflared.exe`: cria um túnel HTTPS público gratuito (`trycloudflare.com`).
- `launcher.js`: inicia servidor + túnel, detecta Chrome/Edge e atualiza `company_settings.whatsapp_api_url` automaticamente no Supabase.
- `config.local.json`: fica somente no computador e guarda a Project URL + Secret Key do Supabase.
- `session/`: guarda a sessão do WhatsApp localmente para evitar novo QR a cada reinício.

## Instalação

Execute `iniciar-whatsapp-free.bat`.

Na primeira vez, informe:

1. Project URL do Supabase usado pelo ERP.
2. Secret Key em Supabase > Settings > API Keys > Secret keys.

A Secret Key não deve ser compartilhada e não é enviada ao GitHub.

Depois disso, o conector:

1. instala/atualiza os arquivos;
2. inicia o servidor em `127.0.0.1:3031`;
3. abre um túnel HTTPS gratuito;
4. grava automaticamente a URL pública no Supabase;
5. abre o ERP;
6. mostra o QR na área `Atendimentos` quando necessário.

## Disponibilidade

O ERP e o Supabase continuam online mesmo se o computador desligar. Somente a integração do WhatsApp fica offline enquanto o computador da gráfica estiver desligado ou sem internet.

## Segurança

As APIs públicas do conector exigem o JWT do usuário autenticado do ERP. O túnel não libera acesso aos dados sem autenticação. A Secret Key fica apenas no computador da gráfica.
