const express = require('express');
const cors = require('cors');
const QRCode = require('qrcode');
const { exec } = require('child_process');
const { Client, LocalAuth } = require('whatsapp-web.js');

const HOST = '127.0.0.1';
const PORT = 3031;
const LOCAL_ORIGIN = `http://${HOST}:${PORT}`;
const LOCAL_ERP_PATH = '/sistema/';
const REMOTE_ERP = 'https://papelecodigo.github.io/pacografica/';
const ALLOWED_ORIGINS = new Set([
  'https://papelecodigo.github.io',
  LOCAL_ORIGIN,
  'http://localhost:3031'
]);

let state = 'starting';
let message = 'Inicializando WhatsApp Web...';
let qrRaw = null;
let account = null;
let lastError = null;
let openedLocalERP = false;

const app = express();
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  res.setHeader('Cache-Control', 'no-store');
  const origin = req.headers.origin;
  if (origin && !ALLOWED_ORIGINS.has(origin)) return res.status(403).json({ error: 'Origem não autorizada' });
  next();
});
app.use(cors({
  origin(origin, callback) {
    if (!origin || ALLOWED_ORIGINS.has(origin)) return callback(null, true);
    return callback(new Error('Origem não autorizada'));
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json());

const client = new Client({
  authStrategy: new LocalAuth({ clientId: 'papel-e-codigo' }),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  }
});

function openBrowser(url) {
  if (openedLocalERP) return;
  openedLocalERP = true;
  try {
    if (process.platform === 'win32') exec(`start "" "${url}"`, { windowsHide: true });
    else if (process.platform === 'darwin') exec(`open "${url}"`);
    else exec(`xdg-open "${url}"`);
  } catch (error) {
    console.warn('[ERP local] Não foi possível abrir o navegador automaticamente:', error.message);
  }
}

async function proxyERP(req, res) {
  try {
    const relative = req.path.replace(/^\/sistema\/?/, '');
    const target = new URL(relative || '', REMOTE_ERP);
    const queryIndex = req.originalUrl.indexOf('?');
    if (queryIndex >= 0) target.search = req.originalUrl.slice(queryIndex);

    const response = await fetch(target, {
      redirect: 'follow',
      headers: { 'User-Agent': 'PapelECodigo-ERP-Local/1.1' }
    });

    res.status(response.status);
    const contentType = response.headers.get('content-type');
    if (contentType) res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.setHeader('X-Papel-Codigo-Local', '1');

    const body = Buffer.from(await response.arrayBuffer());
    res.send(body);
  } catch (error) {
    console.error('[ERP local] Falha ao carregar arquivo:', error);
    res.status(502).type('html').send(`<!doctype html><meta charset="utf-8"><title>Sistema local</title><style>body{font:16px system-ui;padding:40px;color:#132238}main{max-width:620px;margin:auto}button{padding:12px 18px}</style><main><h1>Não foi possível carregar o sistema</h1><p>Verifique sua internet e mantenha o conector aberto.</p><button onclick="location.reload()">Tentar novamente</button></main>`);
  }
}

client.on('qr', qr => {
  qrRaw = qr;
  state = 'qr';
  message = 'Escaneie o QR Code no WhatsApp.';
  console.log('[WhatsApp] QR gerado. O sistema local mostrará o código para escanear.');
});
client.on('authenticated', () => {
  state = 'starting';
  message = 'Autenticado. Carregando conversas...';
  console.log('[WhatsApp] Autenticado.');
});
client.on('ready', async () => {
  state = 'ready';
  qrRaw = null;
  message = 'WhatsApp conectado.';
  try {
    const info = client.info;
    account = info?.pushname || info?.wid?.user || 'WhatsApp conectado';
  } catch {
    account = 'WhatsApp conectado';
  }
  console.log('[WhatsApp] Pronto.');
});
client.on('auth_failure', err => {
  state = 'error';
  lastError = String(err || 'Falha de autenticação');
  message = 'Falha na autenticação. Reinicie o conector.';
  console.error('[WhatsApp] Falha de autenticação:', err);
});
client.on('disconnected', reason => {
  state = 'disconnected';
  message = `WhatsApp desconectado: ${reason || 'sessão encerrada'}`;
  account = null;
  qrRaw = null;
  console.warn('[WhatsApp] Desconectado:', reason);
});

app.get('/', (_req, res) => {
  res.type('html').send(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Papel e Código · WhatsApp local</title><style>body{font:16px system-ui;background:#07182d;color:#fff;margin:0;padding:40px}main{max-width:680px;margin:auto;background:#10243e;padding:28px;border-radius:18px}b{color:#dff01f}.ok{color:#56d39a}a{display:inline-block;background:#1677ff;color:white;text-decoration:none;padding:12px 18px;border-radius:10px;font-weight:700}</style><main><h1>Papel e Código</h1><h2>Conector local do WhatsApp</h2><p>Estado atual: <b>${state}</b></p><p>${message}</p><p class="ok">Mantenha esta janela do conector aberta enquanto estiver usando o sistema.</p><a href="${LOCAL_ERP_PATH}">Abrir sistema local</a></main></html>`);
});

app.get(['/sistema', '/sistema/'], proxyERP);
app.get('/sistema/*asset', proxyERP);

app.get('/status', (_req, res) => res.json({ state, message, account, error: lastError, localERP: `${LOCAL_ORIGIN}${LOCAL_ERP_PATH}`, version: '1.1.0' }));
app.get('/qr', async (_req, res) => {
  if (!qrRaw) return res.json({ state, dataUrl: null });
  try {
    const dataUrl = await QRCode.toDataURL(qrRaw, { width: 320, margin: 1 });
    res.json({ state, dataUrl });
  } catch (error) {
    res.status(500).json({ error: 'Não foi possível gerar o QR Code.' });
  }
});
app.get('/chats', async (req, res) => {
  if (state !== 'ready') return res.status(409).json({ error: 'WhatsApp ainda não está pronto.' });
  const limit = Math.min(80, Math.max(1, Number(req.query.limit || 40)));
  try {
    const chats = await client.getChats();
    const rows = [];
    for (const chat of chats) {
      if (rows.length >= limit) break;
      if (chat.isGroup) continue;
      try {
        const contact = await chat.getContact();
        const number = contact?.number || String(chat.id?._serialized || '').split('@')[0] || '';
        const name = contact?.pushname || contact?.name || contact?.shortName || chat.name || number;
        rows.push({
          id: chat.id?._serialized || '',
          name,
          phone: number,
          unreadCount: chat.unreadCount || 0,
          timestamp: chat.timestamp || 0,
          lastMessage: chat.lastMessage?.body || ''
        });
      } catch (error) {
        console.warn('[WhatsApp] Contato ignorado:', error.message);
      }
    }
    rows.sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0));
    res.json({ chats: rows });
  } catch (error) {
    console.error('[WhatsApp] Erro ao listar conversas:', error);
    res.status(500).json({ error: 'Não foi possível carregar as conversas.' });
  }
});
app.post('/logout', async (_req, res) => {
  try {
    await client.logout();
    state = 'disconnected';
    account = null;
    qrRaw = null;
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Falha ao desconectar.' });
  }
});

app.listen(PORT, HOST, () => {
  console.log(`\nPapel e Código · WhatsApp local v1.1.0`);
  console.log(`Conector: ${LOCAL_ORIGIN}`);
  console.log(`Sistema local: ${LOCAL_ORIGIN}${LOCAL_ERP_PATH}`);
  console.log('Mantenha esta janela aberta durante o uso.\n');
  setTimeout(() => openBrowser(`${LOCAL_ORIGIN}${LOCAL_ERP_PATH}`), 1200);
  client.initialize().catch(error => {
    state = 'error';
    lastError = String(error);
    message = 'Erro ao iniciar o WhatsApp Web.';
    console.error('[WhatsApp] Erro ao iniciar:', error);
  });
});
