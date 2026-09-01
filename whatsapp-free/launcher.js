const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { createClient } = require('@supabase/supabase-js');

const ROOT = __dirname;
const CONFIG_PATH = path.join(ROOT, 'config.local.json');
const SERVER_PATH = path.join(ROOT, 'server.js');
const TUNNEL_EXE = path.join(ROOT, 'cloudflared.exe');
const SESSION_PATH = path.join(ROOT, 'session');
const LOCAL_URL = 'http://127.0.0.1:3031';
const ERP_URL = 'https://papelecodigo.github.io/pacografica/';
const DEFAULT_SUPABASE_URL = 'https://vvdrhzupgwveajmhssll.supabase.co';

function fail(message) {
  console.error('\n[ERRO]', message);
  process.exit(1);
}

if (!fs.existsSync(CONFIG_PATH)) fail('Configuração ausente. Execute o instalador novamente.');
if (!fs.existsSync(SERVER_PATH)) fail('server.js ausente. Execute o instalador novamente.');
if (!fs.existsSync(TUNNEL_EXE)) fail('cloudflared.exe ausente. Execute o instalador novamente.');

let config;
try {
  config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8').replace(/^\uFEFF/, ''));
} catch {
  fail('Não foi possível ler config.local.json. Exclua o arquivo e execute o instalador novamente.');
}

function normalizeSupabaseUrl(value) {
  let raw = String(value || '').trim().replace(/^["']+|["']+$/g, '').trim();
  if (!raw) return DEFAULT_SUPABASE_URL;
  try {
    const u = new URL(raw);
    if (/^[a-z0-9-]+\.supabase\.co$/i.test(u.hostname)) return `https://${u.hostname}`;
  } catch {}
  const dashboardRef = raw.match(/(?:dashboard\/project\/|project\/)([a-z0-9]{15,40})/i);
  if (dashboardRef) return `https://${dashboardRef[1]}.supabase.co`;
  const directRef = raw.match(/([a-z0-9]{15,40})\.supabase\.co/i);
  if (directRef) return `https://${directRef[1]}.supabase.co`;
  if (/^[a-z0-9]{15,40}$/i.test(raw)) return `https://${raw}.supabase.co`;
  console.warn('[Configuração] Project URL salva não foi reconhecida. Usando a URL do Supabase configurada no ERP.');
  return DEFAULT_SUPABASE_URL;
}

const SUPABASE_URL = normalizeSupabaseUrl(config.supabaseUrl);
const SUPABASE_SECRET = String(config.supabaseSecret || '').trim();
if (!SUPABASE_SECRET) fail('Secret Key do Supabase não informada.');
if (config.supabaseUrl !== SUPABASE_URL) {
  config.supabaseUrl = SUPABASE_URL;
  try { fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8'); } catch {}
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SECRET, {
  auth: { persistSession: false, autoRefreshToken: false }
});

function existing(paths) {
  return paths.find(p => p && fs.existsSync(p)) || null;
}

function detectBrowser() {
  const pf = process.env.PROGRAMFILES;
  const pfx86 = process.env['PROGRAMFILES(X86)'];
  const local = process.env.LOCALAPPDATA;
  return existing([
    pf && path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    pfx86 && path.join(pfx86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    local && path.join(local, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    pf && path.join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    pfx86 && path.join(pfx86, 'Microsoft', 'Edge', 'Application', 'msedge.exe')
  ]);
}

async function resolveOwner() {
  if (config.ownerUserId) return String(config.ownerUserId);
  const { data, error } = await supabase.from('company_settings').select('user_id,trade_name').limit(5);
  if (error) throw new Error(`Falha ao localizar a empresa no Supabase: ${error.message}`);
  const rows = data || [];
  if (rows.length === 1) return rows[0].user_id;
  if (rows.length === 0) throw new Error('Nenhuma empresa encontrada em company_settings.');
  throw new Error('Há mais de uma empresa em company_settings. Informe ownerUserId manualmente em config.local.json.');
}

async function savePublicUrl(ownerUserId, publicUrl) {
  const { error } = await supabase.from('company_settings')
    .update({ whatsapp_api_url: publicUrl, updated_at: new Date().toISOString() })
    .eq('user_id', ownerUserId);
  if (error) throw new Error(`Não foi possível salvar o endereço do WhatsApp no Supabase: ${error.message}`);
}

function openBrowser(url) {
  try {
    const p = spawn('cmd.exe', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' });
    p.unref();
  } catch {}
}

let stopping = false;
let serverProcess = null;
let tunnelProcess = null;
let currentPublicUrl = '';
let tunnelRestartTimer = null;

function stopAll() {
  stopping = true;
  if (tunnelRestartTimer) clearTimeout(tunnelRestartTimer);
  try { tunnelProcess?.kill(); } catch {}
  try { serverProcess?.kill(); } catch {}
}

process.on('SIGINT', () => { stopAll(); process.exit(0); });
process.on('SIGTERM', () => { stopAll(); process.exit(0); });
process.on('exit', stopAll);

async function main() {
  const ownerUserId = await resolveOwner();
  const browserPath = detectBrowser();
  if (!browserPath) throw new Error('Google Chrome ou Microsoft Edge não foi encontrado neste computador.');
  fs.mkdirSync(SESSION_PATH, { recursive: true });

  config.ownerUserId = ownerUserId;
  try { fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8'); } catch {}

  console.log('============================================================');
  console.log(' PAPEL E CÓDIGO · WHATSAPP ONLINE FREE');
  console.log('============================================================');
  console.log('Supabase:', SUPABASE_URL);
  console.log('Empresa:', ownerUserId);
  console.log('Navegador:', browserPath);
  console.log('Sessão:', SESSION_PATH);
  console.log('');

  serverProcess = spawn(process.execPath, [SERVER_PATH], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: '3031',
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY: SUPABASE_SECRET,
      PACO_OWNER_USER_ID: ownerUserId,
      APP_ORIGINS: 'https://papelecodigo.github.io',
      CHROME_PATH: browserPath,
      WA_AUTH_PATH: SESSION_PATH
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  serverProcess.stdout.on('data', d => process.stdout.write(String(d)));
  serverProcess.stderr.on('data', d => process.stderr.write(String(d)));
  serverProcess.on('exit', code => {
    if (!stopping) {
      console.error(`\n[Servidor] encerrado com código ${code}.`);
      try { tunnelProcess?.kill(); } catch {}
      process.exit(code || 1);
    }
  });

  const startTunnel = () => {
    if (stopping) return;
    console.log('[Cloudflare] criando túnel HTTPS gratuito...');
    tunnelProcess = spawn(TUNNEL_EXE, ['tunnel', '--url', LOCAL_URL, '--no-autoupdate'], {
      cwd: ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });

    let buffer = '';
    let published = false;
    const consume = async chunk => {
      const text = String(chunk);
      buffer += text;
      process.stdout.write(text);
      const match = buffer.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
      if (match && match[0] !== currentPublicUrl) {
        currentPublicUrl = match[0];
        try {
          await savePublicUrl(ownerUserId, currentPublicUrl);
          published = true;
          console.log('\n============================================================');
          console.log(' CONECTOR ONLINE');
          console.log(' Endereço:', currentPublicUrl);
          console.log(' ERP:', ERP_URL);
          console.log(' Mantenha esta janela aberta e o computador ligado.');
          console.log('============================================================\n');
          openBrowser(`${ERP_URL}?whatsapp=online`);
        } catch (error) {
          console.error('\n[Supabase]', error.message);
        }
      }
      if (buffer.length > 20000) buffer = buffer.slice(-10000);
    };

    tunnelProcess.stdout.on('data', consume);
    tunnelProcess.stderr.on('data', consume);
    tunnelProcess.on('exit', code => {
      if (stopping) return;
      console.warn(`[Cloudflare] túnel encerrado (${code}). Tentando reconectar em 5 segundos...`);
      tunnelRestartTimer = setTimeout(startTunnel, 5000);
    });

    setTimeout(() => {
      if (!stopping && !published && tunnelProcess && !tunnelProcess.killed) {
        console.log('[Cloudflare] aguardando geração do endereço público...');
      }
    }, 8000);
  };

  // O túnel sobe imediatamente. Ele pode aguardar o servidor local ficar pronto sozinho.
  startTunnel();
}

main().catch(error => fail(error.message || String(error)));
