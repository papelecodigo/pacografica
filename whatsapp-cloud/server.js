const express = require('express');
const cors = require('cors');
const multer = require('multer');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');

const PORT = Number(process.env.PORT || 3031);
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OWNER_USER_ID = process.env.PACO_OWNER_USER_ID;
const AUTH_PATH = process.env.WA_AUTH_PATH || '/var/data/whatsapp-auth';
const CHROME_PATH = process.env.CHROME_PATH || '/usr/bin/chromium';
const APP_ORIGINS = String(process.env.APP_ORIGINS || 'https://papelecodigo.github.io')
  .split(',').map(x => x.trim()).filter(Boolean);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !OWNER_USER_ID) {
  console.error('Faltam SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY ou PACO_OWNER_USER_ID.');
  process.exit(1);
}

fs.mkdirSync(AUTH_PATH, { recursive: true });

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false }
});

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }
});

app.use(cors({
  origin(origin, cb) {
    if (!origin || APP_ORIGINS.includes('*') || APP_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error('Origem não autorizada'));
  },
  credentials: false
}));
app.use(express.json({ limit: '2mb' }));

let waState = 'starting';
let waMessage = 'Inicializando WhatsApp Web...';
let qrRaw = null;
let account = null;
let lastError = null;
let waReady = false;

const client = new Client({
  authStrategy: new LocalAuth({ clientId: 'papel-e-codigo-cloud', dataPath: AUTH_PATH }),
  puppeteer: {
    headless: true,
    executablePath: CHROME_PATH,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--no-zygote'
    ]
  }
});

const digits = v => String(v || '').replace(/\D/g, '');
const safeName = v => String(v || 'arquivo').replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 120);
const nowIso = () => new Date().toISOString();

async function requireUser(req, res, next) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return res.status(401).json({ error: 'Sessão ausente.' });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return res.status(401).json({ error: 'Sessão inválida.' });
  if (data.user.id !== OWNER_USER_ID) return res.status(403).json({ error: 'Usuário sem acesso ao WhatsApp da empresa.' });
  req.authUser = data.user;
  next();
}

async function findCustomer(phone) {
  const d = digits(phone);
  if (!d) return null;
  const { data } = await supabase.from('customers')
    .select('*')
    .eq('user_id', OWNER_USER_ID)
    .eq('phone_digits', d)
    .limit(1)
    .maybeSingle();
  return data || null;
}

async function ensureCustomer(name, phone) {
  const d = digits(phone);
  let customer = await findCustomer(d);
  if (customer) {
    if (name && (!customer.name || customer.name === customer.phone || customer.name === customer.whatsapp)) {
      const { data } = await supabase.from('customers')
        .update({ name, phone: d, whatsapp: d, source: customer.source || 'WhatsApp', updated_at: nowIso() })
        .eq('id', customer.id).select().single();
      customer = data || customer;
    }
    return customer;
  }
  const { data, error } = await supabase.from('customers').insert({
    user_id: OWNER_USER_ID,
    name: name || d || 'Contato WhatsApp',
    phone: d,
    whatsapp: d,
    phone_digits: d,
    source: 'WhatsApp',
    active: true
  }).select().single();
  if (error) throw error;
  return data;
}

async function createLeadIfNeeded(name, phone) {
  const d = digits(phone);
  const { data: existing } = await supabase.from('leads')
    .select('*')
    .eq('user_id', OWNER_USER_ID)
    .neq('stage', 'entregue')
    .order('updated_at', { ascending: false })
    .limit(50);
  const found = (existing || []).find(x => digits(x.customer_phone) === d);
  if (found) return found;
  const { data, error } = await supabase.from('leads').insert({
    user_id: OWNER_USER_ID,
    customer_name: name || d || 'Contato WhatsApp',
    customer_phone: d,
    service_interest: 'Contato pelo WhatsApp',
    estimated_value: 0,
    seller_name: null,
    note: 'Solicitação criada automaticamente a partir de uma nova conversa no WhatsApp.',
    stage: 'novo'
  }).select().single();
  if (error) throw error;
  return data;
}

async function ensureThread(chatId, name, phone) {
  const { data: current } = await supabase.from('whatsapp_threads')
    .select('*').eq('user_id', OWNER_USER_ID).eq('whatsapp_chat_id', chatId).maybeSingle();
  if (current) return current;

  const customer = await ensureCustomer(name, phone);
  const lead = await createLeadIfNeeded(name, phone);
  const { data, error } = await supabase.from('whatsapp_threads').insert({
    user_id: OWNER_USER_ID,
    whatsapp_chat_id: chatId,
    customer_id: customer?.id || null,
    lead_id: lead?.id || null,
    customer_name: customer?.name || name || phone,
    phone: digits(phone),
    status: 'open',
    unread_count: 0,
    last_message_at: nowIso()
  }).select().single();
  if (error) throw error;
  return data;
}

async function uploadMedia(threadId, buffer, mimeType, filename) {
  const ext = path.extname(filename || '') || '';
  const objectPath = `${OWNER_USER_ID}/${threadId}/${Date.now()}-${safeName(filename || `arquivo${ext}`)}`;
  const { error } = await supabase.storage.from('whatsapp-media').upload(objectPath, buffer, {
    contentType: mimeType || 'application/octet-stream',
    upsert: false
  });
  if (error) throw error;
  return objectPath;
}

async function signedMedia(pathValue) {
  if (!pathValue) return null;
  const { data, error } = await supabase.storage.from('whatsapp-media').createSignedUrl(pathValue, 3600);
  return error ? null : data?.signedUrl || null;
}

async function storeInbound(msg) {
  if (!msg || msg.fromMe || msg.isStatus) return;
  if (String(msg.from || '').endsWith('@g.us') || String(msg.from || '').endsWith('@broadcast')) return;

  const messageId = msg.id?._serialized || null;
  if (messageId) {
    const { data: exists } = await supabase.from('whatsapp_messages')
      .select('id').eq('user_id', OWNER_USER_ID).eq('whatsapp_message_id', messageId).maybeSingle();
    if (exists) return;
  }

  const contact = await msg.getContact();
  const phone = digits(contact?.number || String(msg.from).split('@')[0]);
  const name = contact?.pushname || contact?.name || contact?.shortName || phone || 'Contato WhatsApp';
  const thread = await ensureThread(msg.from, name, phone);

  let mediaPath = null;
  let mediaName = null;
  let mimeType = null;
  let fileSize = null;
  let messageType = msg.type || 'text';

  if (msg.hasMedia) {
    try {
      const media = await msg.downloadMedia();
      if (media?.data) {
        const buffer = Buffer.from(media.data, 'base64');
        mimeType = media.mimetype || 'application/octet-stream';
        mediaName = media.filename || `whatsapp-${Date.now()}`;
        fileSize = buffer.length;
        mediaPath = await uploadMedia(thread.id, buffer, mimeType, mediaName);
      }
    } catch (error) {
      console.error('[Mídia recebida]', error);
    }
  }

  const body = msg.body || (msg.hasMedia ? 'Anexo recebido' : '');
  const createdAt = msg.timestamp ? new Date(msg.timestamp * 1000).toISOString() : nowIso();
  const { error } = await supabase.from('whatsapp_messages').insert({
    user_id: OWNER_USER_ID,
    thread_id: thread.id,
    whatsapp_message_id: messageId,
    direction: 'in',
    sender_name: name,
    sender_phone: phone,
    body,
    message_type: messageType,
    media_path: mediaPath,
    media_name: mediaName,
    mime_type: mimeType,
    file_size: fileSize,
    created_at: createdAt
  });
  if (error) throw error;

  await supabase.from('whatsapp_threads').update({
    customer_name: name,
    phone,
    status: 'open',
    unread_count: Number(thread.unread_count || 0) + 1,
    last_message: body || mediaName || 'Anexo',
    last_message_type: messageType,
    last_message_at: createdAt,
    updated_at: nowIso()
  }).eq('id', thread.id);
}

async function saveOutbound(thread, waMessageObj, authUser, payload = {}) {
  const createdAt = nowIso();
  const { error } = await supabase.from('whatsapp_messages').upsert({
    user_id: OWNER_USER_ID,
    thread_id: thread.id,
    whatsapp_message_id: waMessageObj?.id?._serialized || null,
    direction: 'out',
    sender_name: account?.name || 'Papel e Código',
    sender_phone: account?.phone || null,
    body: payload.body || '',
    message_type: payload.messageType || 'text',
    media_path: payload.mediaPath || null,
    media_name: payload.mediaName || null,
    mime_type: payload.mimeType || null,
    file_size: payload.fileSize || null,
    sent_by_auth_user: authUser?.id || null,
    sent_by_name: authUser?.email || 'Equipe',
    created_at: createdAt
  }, { onConflict: 'user_id,whatsapp_message_id' });
  if (error) throw error;

  await supabase.from('whatsapp_threads').update({
    last_message: payload.body || payload.mediaName || 'Anexo enviado',
    last_message_type: payload.messageType || 'text',
    last_message_at: createdAt,
    updated_at: nowIso()
  }).eq('id', thread.id);
}

client.on('qr', qr => {
  qrRaw = qr;
  waState = 'qr';
  waMessage = 'Escaneie o QR Code para conectar o WhatsApp da gráfica.';
  lastError = null;
  console.log('[WhatsApp] QR gerado.');
});

client.on('authenticated', () => {
  waState = 'starting';
  waMessage = 'Autenticado. Carregando conversas...';
  console.log('[WhatsApp] Autenticado.');
});

client.on('ready', () => {
  waReady = true;
  waState = 'ready';
  qrRaw = null;
  const info = client.info;
  account = {
    name: info?.pushname || 'WhatsApp da gráfica',
    phone: info?.wid?.user || null
  };
  waMessage = 'WhatsApp conectado e recebendo mensagens.';
  console.log('[WhatsApp] Pronto:', account.phone || '');
});

client.on('auth_failure', error => {
  waReady = false;
  waState = 'error';
  lastError = String(error || 'Falha de autenticação');
  waMessage = 'Falha ao autenticar o WhatsApp.';
  console.error('[WhatsApp] auth_failure', error);
});

client.on('disconnected', reason => {
  waReady = false;
  waState = 'disconnected';
  account = null;
  waMessage = `WhatsApp desconectado: ${reason || 'sessão encerrada'}`;
  console.warn('[WhatsApp] Desconectado:', reason);
});

client.on('message', msg => {
  storeInbound(msg).catch(error => console.error('[Mensagem recebida]', error));
});

app.get('/', (_req, res) => res.json({
  service: 'Papel e Código · WhatsApp Cloud',
  ok: true,
  whatsapp: waState
}));

app.get('/health', (_req, res) => res.json({ ok: true, whatsapp: waState, ready: waReady }));

app.get('/api/whatsapp/status', requireUser, async (_req, res) => {
  let qrDataUrl = null;
  if (qrRaw) {
    try { qrDataUrl = await QRCode.toDataURL(qrRaw, { width: 320, margin: 1 }); } catch {}
  }
  res.json({ state: waState, message: waMessage, account, error: lastError, qrDataUrl });
});

app.post('/api/whatsapp/logout', requireUser, async (_req, res) => {
  try {
    await client.logout();
    waReady = false;
    waState = 'disconnected';
    qrRaw = null;
    account = null;
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Falha ao desconectar.' });
  }
});

app.get('/api/threads', requireUser, async (req, res) => {
  const status = req.query.status || 'open';
  let q = supabase.from('whatsapp_threads').select('*').eq('user_id', OWNER_USER_ID)
    .order('last_message_at', { ascending: false, nullsFirst: false });
  if (status !== 'all') q = q.eq('status', status);
  const { data, error } = await q.limit(200);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ threads: data || [] });
});

app.get('/api/threads/:id/messages', requireUser, async (req, res) => {
  const { data: thread } = await supabase.from('whatsapp_threads').select('*')
    .eq('id', req.params.id).eq('user_id', OWNER_USER_ID).maybeSingle();
  if (!thread) return res.status(404).json({ error: 'Atendimento não encontrado.' });

  const { data, error } = await supabase.from('whatsapp_messages').select('*')
    .eq('thread_id', thread.id).eq('user_id', OWNER_USER_ID)
    .order('created_at', { ascending: true }).limit(500);
  if (error) return res.status(500).json({ error: error.message });

  const messages = await Promise.all((data || []).map(async row => ({
    ...row,
    media_url: row.media_path ? await signedMedia(row.media_path) : null
  })));
  res.json({ thread, messages });
});

app.post('/api/threads/:id/send', requireUser, upload.single('file'), async (req, res) => {
  if (!waReady) return res.status(409).json({ error: 'WhatsApp não está conectado.' });
  const { data: thread } = await supabase.from('whatsapp_threads').select('*')
    .eq('id', req.params.id).eq('user_id', OWNER_USER_ID).maybeSingle();
  if (!thread) return res.status(404).json({ error: 'Atendimento não encontrado.' });

  const text = String(req.body.text || '').trim();
  const asVoice = String(req.body.asVoice || '') === 'true';
  const asDocument = String(req.body.asDocument || '') === 'true';
  let sent;
  let mediaPath = null;
  let mediaName = null;
  let mimeType = null;
  let fileSize = null;
  let messageType = 'text';

  try {
    if (req.file) {
      mediaName = req.file.originalname || `arquivo-${Date.now()}`;
      mimeType = req.file.mimetype || 'application/octet-stream';
      fileSize = req.file.size;
      mediaPath = await uploadMedia(thread.id, req.file.buffer, mimeType, mediaName);
      const media = new MessageMedia(mimeType, req.file.buffer.toString('base64'), mediaName);
      const isAudio = mimeType.startsWith('audio/');
      const isPdf = mimeType === 'application/pdf';
      messageType = isAudio ? (asVoice ? 'ptt' : 'audio') : isPdf ? 'document' : mimeType.startsWith('image/') ? 'image' : 'document';
      sent = await client.sendMessage(thread.whatsapp_chat_id, media, {
        caption: text || undefined,
        sendAudioAsVoice: isAudio && asVoice,
        sendMediaAsDocument: asDocument || isPdf
      });
    } else {
      if (!text) return res.status(400).json({ error: 'Digite uma mensagem ou selecione um arquivo.' });
      sent = await client.sendMessage(thread.whatsapp_chat_id, text);
    }

    await saveOutbound(thread, sent, req.authUser, {
      body: text,
      messageType,
      mediaPath,
      mediaName,
      mimeType,
      fileSize
    });
    res.json({ ok: true, whatsapp_message_id: sent?.id?._serialized || null });
  } catch (error) {
    console.error('[Enviar mensagem]', error);
    res.status(500).json({ error: error.message || 'Falha ao enviar mensagem.' });
  }
});

app.post('/api/threads/:id/read', requireUser, async (req, res) => {
  const { error } = await supabase.from('whatsapp_threads').update({ unread_count: 0, updated_at: nowIso() })
    .eq('id', req.params.id).eq('user_id', OWNER_USER_ID);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

app.patch('/api/threads/:id', requireUser, async (req, res) => {
  const patch = {};
  if (['open', 'waiting', 'closed'].includes(req.body.status)) patch.status = req.body.status;
  if (Object.prototype.hasOwnProperty.call(req.body, 'assigned_to')) patch.assigned_to = req.body.assigned_to || null;
  patch.updated_at = nowIso();
  const { data, error } = await supabase.from('whatsapp_threads').update(patch)
    .eq('id', req.params.id).eq('user_id', OWNER_USER_ID).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ thread: data });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Papel e Código · WhatsApp Cloud na porta ${PORT}`);
  console.log(`Chrome: ${CHROME_PATH}`);
  console.log(`Auth: ${AUTH_PATH}`);
  client.initialize().catch(error => {
    waReady = false;
    waState = 'error';
    lastError = error?.stack || String(error);
    waMessage = 'Erro ao iniciar o WhatsApp Web.';
    console.error('[WhatsApp initialize]', error);
  });
});

process.on('SIGTERM', async () => {
  try { await client.destroy(); } catch {}
  process.exit(0);
});
