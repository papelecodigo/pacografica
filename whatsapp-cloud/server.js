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
const APP_ORIGINS = String(process.env.APP_ORIGINS || 'https://papelecodigo.github.io').split(',').map(x => x.trim()).filter(Boolean);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !OWNER_USER_ID) {
  console.error('Faltam SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY ou PACO_OWNER_USER_ID.');
  process.exit(1);
}

fs.mkdirSync(AUTH_PATH, { recursive: true });
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
app.use(cors({ origin(origin, cb) { if (!origin || APP_ORIGINS.includes('*') || APP_ORIGINS.includes(origin)) return cb(null, true); cb(new Error('Origem não autorizada')); } }));
app.use(express.json({ limit: '2mb' }));

let waState = 'starting', waMessage = 'Inicializando WhatsApp Web...', qrRaw = null, account = null, lastError = null, waReady = false;
const client = new Client({
  authStrategy: new LocalAuth({ clientId: 'papel-e-codigo-cloud', dataPath: AUTH_PATH }),
  puppeteer: { headless: true, executablePath: CHROME_PATH, args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu','--no-first-run','--no-zygote'] }
});
const digits = v => String(v || '').replace(/\D/g, '');
const safeName = v => String(v || 'arquivo').replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 120);
const nowIso = () => new Date().toISOString();
const profilePicCache = new Map();

async function actorFromToken(token) {
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) return null;
  const user = data.user;
  if (user.id === OWNER_USER_ID) return { user, role: 'owner', displayName: user.user_metadata?.name || user.email || 'Administrador' };
  const { data: member } = await supabase.from('team_members').select('*').eq('owner_user_id', OWNER_USER_ID).eq('member_user_id', user.id).eq('active', true).maybeSingle();
  if (!member) return null;
  return { user, role: member.role || 'attendant', displayName: member.display_name || user.email || 'Equipe', member };
}
async function requireUser(req, res, next) {
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return res.status(401).json({ error: 'Sessão ausente.' });
  const actor = await actorFromToken(token);
  if (!actor) return res.status(403).json({ error: 'Usuário sem acesso à empresa.' });
  req.actor = actor; req.authUser = actor.user; next();
}
function requireOwner(req, res, next) { if (req.actor?.user?.id !== OWNER_USER_ID) return res.status(403).json({ error: 'Somente o administrador pode alterar a equipe.' }); next(); }

async function findCustomer(phone) {
  const d = digits(phone); if (!d) return null;
  const { data } = await supabase.from('customers').select('*').eq('user_id', OWNER_USER_ID).eq('phone_digits', d).limit(1).maybeSingle();
  return data || null;
}
async function ensureCustomer(name, phone, preferredCustomerId = null) {
  const d = digits(phone);
  let customer = d ? await findCustomer(d) : null;
  if (!customer && preferredCustomerId) {
    const { data } = await supabase.from('customers').select('*').eq('id', preferredCustomerId).eq('user_id', OWNER_USER_ID).maybeSingle();
    customer = data || null;
  }
  if (customer) {
    const patch = {};
    if (name && customer.name !== name) patch.name = name;
    if (d && digits(customer.phone) !== d) patch.phone = d;
    if (d && digits(customer.whatsapp) !== d) patch.whatsapp = d;
    if (d && customer.phone_digits !== d) patch.phone_digits = d;
    if (!customer.source) patch.source = 'WhatsApp';
    if (Object.keys(patch).length) {
      const { data } = await supabase.from('customers').update({ ...patch, updated_at: nowIso() }).eq('id', customer.id).select().single();
      customer = data || { ...customer, ...patch };
    }
    return customer;
  }
  const { data, error } = await supabase.from('customers').insert({ user_id: OWNER_USER_ID, name: name || d || 'Contato WhatsApp', phone: d, whatsapp: d, phone_digits: d, source: 'WhatsApp', active: true }).select().single();
  if (error) throw error; return data;
}
async function findOpenLeadByPhone(phone) {
  const d = digits(phone); if (!d) return null;
  const { data } = await supabase.from('leads').select('*').eq('user_id', OWNER_USER_ID).neq('stage', 'entregue').order('updated_at', { ascending: false }).limit(200);
  return (data || []).find(x => digits(x.customer_phone) === d) || null;
}
async function ensureLead(name, phone, preferredLeadId = null) {
  const d = digits(phone);
  let lead = d ? await findOpenLeadByPhone(d) : null;
  if (!lead && preferredLeadId) {
    const { data } = await supabase.from('leads').select('*').eq('id', preferredLeadId).eq('user_id', OWNER_USER_ID).maybeSingle();
    lead = data || null;
  }
  if (lead) {
    const patch = {};
    if (name && lead.customer_name !== name) patch.customer_name = name;
    if (d && digits(lead.customer_phone) !== d) patch.customer_phone = d;
    if (Object.keys(patch).length) {
      const { data } = await supabase.from('leads').update({ ...patch, updated_at: nowIso() }).eq('id', lead.id).select().single();
      lead = data || { ...lead, ...patch };
    }
    return lead;
  }
  const { data, error } = await supabase.from('leads').insert({ user_id: OWNER_USER_ID, customer_name: name || d || 'Contato WhatsApp', customer_phone: d, service_interest: 'Contato pelo WhatsApp', estimated_value: 0, seller_name: null, note: 'Solicitação criada automaticamente a partir de uma nova conversa no WhatsApp.', stage: 'novo' }).select().single();
  if (error) throw error; return data;
}
async function ensureThread(chatId, name, phone) {
  let { data: thread } = await supabase.from('whatsapp_threads').select('*').eq('user_id', OWNER_USER_ID).eq('whatsapp_chat_id', chatId).maybeSingle();
  const customer = await ensureCustomer(name, phone, thread?.customer_id || null);
  const lead = await ensureLead(name, phone, thread?.lead_id || null);
  if (thread) {
    const patch = {};
    if (customer?.id && thread.customer_id !== customer.id) patch.customer_id = customer.id;
    if (lead?.id && thread.lead_id !== lead.id) patch.lead_id = lead.id;
    if (name && thread.customer_name !== name) patch.customer_name = name;
    if (digits(phone) && thread.phone !== digits(phone)) patch.phone = digits(phone);
    if (thread.status === 'closed') patch.status = 'open';
    if (Object.keys(patch).length) { const { data } = await supabase.from('whatsapp_threads').update({ ...patch, updated_at: nowIso() }).eq('id', thread.id).select().single(); thread = data || { ...thread, ...patch }; }
    return thread;
  }
  const { data, error } = await supabase.from('whatsapp_threads').insert({ user_id: OWNER_USER_ID, whatsapp_chat_id: chatId, customer_id: customer?.id || null, lead_id: lead?.id || null, customer_name: customer?.name || name || phone, phone: digits(phone), status: 'open', unread_count: 0, last_message_at: nowIso() }).select().single();
  if (error) throw error; return data;
}
async function uploadMedia(threadId, buffer, mimeType, filename) {
  const objectPath = `${OWNER_USER_ID}/${threadId}/${Date.now()}-${safeName(filename || 'arquivo')}`;
  const { error } = await supabase.storage.from('whatsapp-media').upload(objectPath, buffer, { contentType: mimeType || 'application/octet-stream', upsert: false });
  if (error) throw error; return objectPath;
}
async function signedMedia(pathValue) { if (!pathValue) return null; const { data, error } = await supabase.storage.from('whatsapp-media').createSignedUrl(pathValue, 3600); return error ? null : data?.signedUrl || null; }
async function existsMessage(messageId) { if (!messageId) return null; const { data } = await supabase.from('whatsapp_messages').select('id').eq('user_id', OWNER_USER_ID).eq('whatsapp_message_id', messageId).maybeSingle(); return data || null; }
async function mediaPayload(msg, threadId) {
  let mediaPath = null, mediaName = null, mimeType = null, fileSize = null;
  if (msg?.hasMedia) try { const media = await msg.downloadMedia(); if (media?.data) { const buffer = Buffer.from(media.data, 'base64'); mimeType = media.mimetype || 'application/octet-stream'; mediaName = media.filename || `whatsapp-${Date.now()}`; fileSize = buffer.length; mediaPath = await uploadMedia(threadId, buffer, mimeType, mediaName); } } catch (error) { console.error('[Mídia WhatsApp]', error); }
  return { mediaPath, mediaName, mimeType, fileSize };
}

async function phoneIdFor(contactId) {
  const raw = String(contactId || '').trim();
  if (!raw) return '';
  if (raw.endsWith('@c.us')) return raw;
  try {
    const rows = await client.getContactLidAndPhone([raw]);
    const pn = rows?.find(row => row?.pn)?.pn;
    if (pn) return pn;
  } catch (error) {
    console.warn('[WhatsApp LID] não foi possível mapear', raw, error?.message || error);
  }
  return raw;
}
async function profilePicFor(...contactIds) {
  const ids = contactIds.map(x => String(x || '')).filter(Boolean);
  for (const id of ids) {
    const cached = profilePicCache.get(id);
    if (cached && Date.now() - cached.at < 10 * 60 * 1000) return cached.url;
    try {
      const url = await client.getProfilePicUrl(id);
      profilePicCache.set(id, { url: url || null, at: Date.now() });
      if (url) return url;
    } catch {}
  }
  return null;
}
async function contactForMessage(msg, chatId) {
  const rawChatId = String(chatId || msg?.from || msg?.to || '');
  let chat = null, contact = null;
  try { chat = msg?.getChat ? await msg.getChat() : await client.getChatById(rawChatId); } catch {}
  try { contact = msg?.getContact ? await msg.getContact() : (chat?.getContact ? await chat.getContact() : null); } catch {}

  const rawContactId = contact?.id?._serialized || rawChatId;
  let pnId = await phoneIdFor(rawContactId);
  if ((!pnId || pnId.endsWith('@lid')) && rawChatId !== rawContactId) pnId = await phoneIdFor(rawChatId);

  let phoneContact = null;
  if (pnId && pnId !== rawContactId) {
    try { phoneContact = await client.getContactById(pnId); } catch {}
  }

  const phone = digits(phoneContact?.number || (pnId && pnId.split('@')[0]) || contact?.number || rawChatId.split('@')[0]);
  const rawFallback = digits(rawChatId.split('@')[0]);
  const candidateNames = [
    contact?.name,
    contact?.pushname,
    contact?.shortName,
    phoneContact?.name,
    phoneContact?.pushname,
    phoneContact?.shortName,
    chat?.name,
    msg?._data?.notifyName,
    msg?._data?.pushName
  ].map(x => String(x || '').trim()).filter(Boolean);
  const name = candidateNames.find(n => digits(n) !== n && n !== rawFallback && n !== phone) || candidateNames[0] || phone || 'Contato WhatsApp';
  const profilePicUrl = await profilePicFor(rawContactId, pnId, rawChatId);
  return { name, phone, profilePicUrl, rawContactId, phoneContactId: pnId || null };
}
async function refreshThreadIdentity(thread) {
  if (!thread) return { thread: null, identity: null };
  const identity = await contactForMessage(null, thread.whatsapp_chat_id);
  const repaired = await ensureThread(thread.whatsapp_chat_id, identity.name, identity.phone);
  return { thread: repaired, identity };
}

async function storeInbound(msg) {
  if (!msg || msg.fromMe || msg.isStatus) return; const chatId = String(msg.from || ''); if (chatId.endsWith('@g.us') || chatId.endsWith('@broadcast')) return;
  const messageId = msg.id?._serialized || null; if (await existsMessage(messageId)) return;
  const { name, phone } = await contactForMessage(msg, chatId), thread = await ensureThread(chatId, name, phone), media = await mediaPayload(msg, thread.id);
  const body = msg.body || (msg.hasMedia ? 'Anexo recebido' : ''), createdAt = msg.timestamp ? new Date(msg.timestamp * 1000).toISOString() : nowIso();
  const { error } = await supabase.from('whatsapp_messages').insert({ user_id: OWNER_USER_ID, thread_id: thread.id, whatsapp_message_id: messageId, direction: 'in', sender_name: name, sender_phone: phone, body, message_type: msg.type || 'text', media_path: media.mediaPath, media_name: media.mediaName, mime_type: media.mimeType, file_size: media.fileSize, created_at: createdAt });
  if (error) throw error;
  await supabase.from('whatsapp_threads').update({ customer_name: name, phone, status: 'open', unread_count: Number(thread.unread_count || 0) + 1, last_message: body || media.mediaName || 'Anexo', last_message_type: msg.type || 'text', last_message_at: createdAt, updated_at: nowIso() }).eq('id', thread.id);
}
async function storeDeviceOutbound(msg) {
  if (!msg?.fromMe || msg.isStatus) return; const chatId = String(msg.to || ''); if (!chatId || chatId.endsWith('@g.us') || chatId.endsWith('@broadcast')) return;
  const messageId = msg.id?._serialized || null; if (await existsMessage(messageId)) return;
  const { name, phone } = await contactForMessage(msg, chatId), thread = await ensureThread(chatId, name, phone), media = await mediaPayload(msg, thread.id);
  const body = msg.body || (msg.hasMedia ? 'Anexo enviado' : ''), createdAt = msg.timestamp ? new Date(msg.timestamp * 1000).toISOString() : nowIso();
  const { error } = await supabase.from('whatsapp_messages').insert({ user_id: OWNER_USER_ID, thread_id: thread.id, whatsapp_message_id: messageId, direction: 'out', sender_name: account?.name || 'Papel e Código', sender_phone: account?.phone || null, body, message_type: msg.type || 'text', media_path: media.mediaPath, media_name: media.mediaName, mime_type: media.mimeType, file_size: media.fileSize, sent_by_name: 'WhatsApp / celular', created_at: createdAt });
  if (error) throw error;
  await supabase.from('whatsapp_threads').update({ last_message: body || media.mediaName || 'Anexo enviado', last_message_type: msg.type || 'text', last_message_at: createdAt, updated_at: nowIso() }).eq('id', thread.id);
}
async function saveOutbound(thread, waMessageObj, actor, payload = {}) {
  const createdAt = nowIso();
  const row = { user_id: OWNER_USER_ID, thread_id: thread.id, whatsapp_message_id: waMessageObj?.id?._serialized || null, direction: 'out', sender_name: account?.name || 'Papel e Código', sender_phone: account?.phone || null, body: payload.body || '', message_type: payload.messageType || 'text', media_path: payload.mediaPath || null, media_name: payload.mediaName || null, mime_type: payload.mimeType || null, file_size: payload.fileSize || null, sent_by_auth_user: actor?.user?.id || null, sent_by_name: actor?.displayName || actor?.user?.email || 'Equipe', created_at: createdAt };
  const { error } = await supabase.from('whatsapp_messages').upsert(row, { onConflict: 'user_id,whatsapp_message_id' }); if (error) throw error;
  await supabase.from('whatsapp_threads').update({ last_message: payload.body || payload.mediaName || 'Anexo enviado', last_message_type: payload.messageType || 'text', last_message_at: createdAt, updated_at: nowIso() }).eq('id', thread.id);
}

client.on('qr', qr => { qrRaw = qr; waState = 'qr'; waMessage = 'Escaneie o QR Code para conectar o WhatsApp da gráfica.'; lastError = null; console.log('[WhatsApp] QR gerado.'); });
client.on('authenticated', () => { waState = 'starting'; waMessage = 'Autenticado. Carregando conversas...'; console.log('[WhatsApp] Autenticado.'); });
client.on('ready', () => { waReady = true; waState = 'ready'; qrRaw = null; const info = client.info; account = { name: info?.pushname || 'WhatsApp da gráfica', phone: info?.wid?.user || null }; waMessage = 'WhatsApp conectado e recebendo mensagens.'; console.log('[WhatsApp] Pronto:', account.phone || ''); });
client.on('auth_failure', error => { waReady = false; waState = 'error'; lastError = String(error || 'Falha de autenticação'); waMessage = 'Falha ao autenticar o WhatsApp.'; console.error('[WhatsApp] auth_failure', error); });
client.on('disconnected', reason => { waReady = false; waState = 'disconnected'; account = null; waMessage = `WhatsApp desconectado: ${reason || 'sessão encerrada'}`; console.warn('[WhatsApp] Desconectado:', reason); });
client.on('message', msg => storeInbound(msg).catch(error => console.error('[Mensagem recebida]', error)));
client.on('message_create', msg => { if (msg.fromMe) storeDeviceOutbound(msg).catch(error => console.error('[Mensagem do aparelho]', error)); });

app.get('/', (_req, res) => res.json({ service: 'Papel e Código · WhatsApp Cloud', ok: true, whatsapp: waState }));
app.get('/health', (_req, res) => res.json({ ok: true, whatsapp: waState, ready: waReady }));
app.get('/api/whatsapp/status', requireUser, async (_req, res) => { let qrDataUrl = null; if (qrRaw) try { qrDataUrl = await QRCode.toDataURL(qrRaw, { width: 320, margin: 1 }); } catch {} res.json({ state: waState, message: waMessage, account, error: lastError, qrDataUrl }); });
app.post('/api/whatsapp/logout', requireUser, requireOwner, async (_req, res) => { try { await client.logout(); waReady = false; waState = 'disconnected'; qrRaw = null; account = null; res.json({ ok: true }); } catch (error) { res.status(500).json({ error: error.message || 'Falha ao desconectar.' }); } });

app.get('/api/threads', requireUser, async (req, res) => { const status = req.query.status || 'open'; let q = supabase.from('whatsapp_threads').select('*').eq('user_id', OWNER_USER_ID).order('last_message_at', { ascending: false, nullsFirst: false }); if (status !== 'all') q = q.eq('status', status); const { data, error } = await q.limit(200); if (error) return res.status(500).json({ error: error.message }); res.json({ threads: data || [] }); });
app.get('/api/threads/:id/identity', requireUser, async (req, res) => {
  try {
    const { data: thread } = await supabase.from('whatsapp_threads').select('*').eq('id', req.params.id).eq('user_id', OWNER_USER_ID).maybeSingle();
    if (!thread) return res.status(404).json({ error: 'Atendimento não encontrado.' });
    if (!waReady) return res.json({ thread, identity: { name: thread.customer_name, phone: thread.phone, profilePicUrl: null } });
    const result = await refreshThreadIdentity(thread);
    res.json(result);
  } catch (error) { res.status(500).json({ error: error.message || 'Falha ao identificar contato.' }); }
});
app.get('/api/threads/:id/messages', requireUser, async (req, res) => { const { data: thread } = await supabase.from('whatsapp_threads').select('*').eq('id', req.params.id).eq('user_id', OWNER_USER_ID).maybeSingle(); if (!thread) return res.status(404).json({ error: 'Atendimento não encontrado.' }); const { data, error } = await supabase.from('whatsapp_messages').select('*').eq('thread_id', thread.id).eq('user_id', OWNER_USER_ID).order('created_at', { ascending: true }).limit(500); if (error) return res.status(500).json({ error: error.message }); const messages = await Promise.all((data || []).map(async row => ({ ...row, media_url: row.media_path ? await signedMedia(row.media_path) : null }))); res.json({ thread, messages }); });
app.post('/api/threads/:id/send', requireUser, upload.single('file'), async (req, res) => {
  if (!waReady) return res.status(409).json({ error: 'WhatsApp não está conectado.' });
  const { data: thread } = await supabase.from('whatsapp_threads').select('*').eq('id', req.params.id).eq('user_id', OWNER_USER_ID).maybeSingle(); if (!thread) return res.status(404).json({ error: 'Atendimento não encontrado.' });
  const text = String(req.body.text || '').trim(), asVoice = String(req.body.asVoice || '') === 'true', asDocument = String(req.body.asDocument || '') === 'true';
  let sent, mediaPath = null, mediaName = null, mimeType = null, fileSize = null, messageType = 'text';
  try {
    if (req.file) { mediaName = req.file.originalname || `arquivo-${Date.now()}`; mimeType = req.file.mimetype || 'application/octet-stream'; fileSize = req.file.size; mediaPath = await uploadMedia(thread.id, req.file.buffer, mimeType, mediaName); const media = new MessageMedia(mimeType, req.file.buffer.toString('base64'), mediaName); const isAudio = mimeType.startsWith('audio/'), isPdf = mimeType === 'application/pdf'; messageType = isAudio ? (asVoice ? 'ptt' : 'audio') : isPdf ? 'document' : mimeType.startsWith('image/') ? 'image' : 'document'; sent = await client.sendMessage(thread.whatsapp_chat_id, media, { caption: text || undefined, sendAudioAsVoice: isAudio && asVoice, sendMediaAsDocument: asDocument || isPdf }); }
    else { if (!text) return res.status(400).json({ error: 'Digite uma mensagem ou selecione um arquivo.' }); sent = await client.sendMessage(thread.whatsapp_chat_id, text); }
    await saveOutbound(thread, sent, req.actor, { body: text, messageType, mediaPath, mediaName, mimeType, fileSize }); res.json({ ok: true, whatsapp_message_id: sent?.id?._serialized || null });
  } catch (error) { console.error('[Enviar mensagem]', error); res.status(500).json({ error: error.message || 'Falha ao enviar mensagem.' }); }
});
app.post('/api/threads/:id/read', requireUser, async (req, res) => { const { error } = await supabase.from('whatsapp_threads').update({ unread_count: 0, updated_at: nowIso() }).eq('id', req.params.id).eq('user_id', OWNER_USER_ID); if (error) return res.status(500).json({ error: error.message }); res.json({ ok: true }); });
app.patch('/api/threads/:id', requireUser, async (req, res) => { const patch = { updated_at: nowIso() }; if (['open','waiting','closed'].includes(req.body.status)) patch.status = req.body.status; if (Object.prototype.hasOwnProperty.call(req.body, 'assigned_to')) patch.assigned_to = req.body.assigned_to || null; const { data, error } = await supabase.from('whatsapp_threads').update(patch).eq('id', req.params.id).eq('user_id', OWNER_USER_ID).select().single(); if (error) return res.status(500).json({ error: error.message }); res.json({ thread: data }); });

app.get('/api/team', requireUser, async (_req, res) => { const { data, error } = await supabase.from('team_members').select('*').eq('owner_user_id', OWNER_USER_ID).order('created_at'); if (error) return res.status(500).json({ error: error.message }); res.json({ members: data || [] }); });
app.post('/api/team/invite', requireUser, requireOwner, async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase(), displayName = String(req.body.display_name || '').trim() || email;
  const allowedRoles = ['admin','manager','attendant','production','finance','viewer'], role = allowedRoles.includes(req.body.role) ? req.body.role : 'attendant';
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Informe um e-mail válido.' });
  try {
    let memberUser = null; const listed = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 }); memberUser = listed.data?.users?.find(u => String(u.email || '').toLowerCase() === email) || null;
    if (!memberUser) { const invited = await supabase.auth.admin.inviteUserByEmail(email, { data: { name: displayName, company: 'Papel e Código' } }); if (invited.error) throw invited.error; memberUser = invited.data?.user; }
    if (!memberUser?.id) throw new Error('Não foi possível criar o usuário da equipe.');
    const { data, error } = await supabase.from('team_members').upsert({ owner_user_id: OWNER_USER_ID, member_user_id: memberUser.id, member_email: email, display_name: displayName, role, active: true, updated_at: nowIso() }, { onConflict: 'owner_user_id,member_user_id' }).select().single(); if (error) throw error; res.json({ ok: true, member: data });
  } catch (error) { res.status(500).json({ error: error.message || 'Falha ao convidar integrante.' }); }
});
app.patch('/api/team/:id', requireUser, requireOwner, async (req, res) => { const allowedRoles = ['admin','manager','attendant','production','finance','viewer'], patch = { updated_at: nowIso() }; if (allowedRoles.includes(req.body.role)) patch.role = req.body.role; if (Object.prototype.hasOwnProperty.call(req.body, 'active')) patch.active = Boolean(req.body.active); if (Object.prototype.hasOwnProperty.call(req.body, 'display_name')) patch.display_name = String(req.body.display_name || '').trim() || null; const { data, error } = await supabase.from('team_members').update(patch).eq('id', req.params.id).eq('owner_user_id', OWNER_USER_ID).select().single(); if (error) return res.status(500).json({ error: error.message }); res.json({ member: data }); });

app.listen(PORT, '0.0.0.0', () => { console.log(`Papel e Código · WhatsApp Cloud na porta ${PORT}`); console.log(`Chrome: ${CHROME_PATH}`); console.log(`Auth persistente: ${AUTH_PATH}`); client.initialize().catch(error => { waReady = false; waState = 'error'; lastError = error?.stack || String(error); waMessage = 'Erro ao iniciar o WhatsApp Web.'; console.error('[WhatsApp initialize]', error); }); });
process.on('SIGTERM', async () => { try { await client.destroy(); } catch {} process.exit(0); });