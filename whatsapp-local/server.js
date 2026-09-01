const express = require('express');
const cors = require('cors');
const QRCode = require('qrcode');
const { Client, LocalAuth } = require('whatsapp-web.js');

const HOST = '127.0.0.1';
const PORT = 3031;
const ALLOWED_ORIGINS = new Set([
  'https://papelecodigo.github.io',
  'http://127.0.0.1:3031',
  'http://localhost:3031'
]);

let state = 'starting';
let message = 'Inicializando WhatsApp Web...';
let qrRaw = null;
let account = null;
let lastError = null;

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

client.on('qr', qr => {
  qrRaw = qr;
  state = 'qr';
  message = 'Escaneie o QR Code no WhatsApp.';
  console.log('[WhatsApp] QR gerado. Abra o ERP para escanear.');
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
  res.type('html').send(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Papel e Código · WhatsApp local</title><style>body{font:16px system-ui;background:#07182d;color:#fff;margin:0;padding:40px}main{max-width:680px;margin:auto;background:#10243e;padding:28px;border-radius:18px}b{color:#dff01f}.ok{color:#56d39a}</style><main><h1>Papel e Código</h1><h2>Conector local do WhatsApp</h2><p>Estado atual: <b>${state}</b></p><p>${message}</p><p class="ok">Pode deixar esta janela aberta enquanto estiver usando o ERP.</p><p>Volte para <b>papelecodigo.github.io/pacografica</b> e clique em WhatsApp dentro da Venda rápida.</p></main></html>`);
});
app.get('/status', (_req, res) => res.json({ state, message, account, error: lastError }));
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
  console.log(`\nPapel e Código · WhatsApp local`);
  console.log(`Conector: http://${HOST}:${PORT}`);
  console.log(`Mantenha esta janela aberta durante o uso.\n`);
  client.initialize().catch(error => {
    state = 'error';
    lastError = String(error);
    message = 'Erro ao iniciar o WhatsApp Web.';
    console.error('[WhatsApp] Erro ao iniciar:', error);
  });
});
