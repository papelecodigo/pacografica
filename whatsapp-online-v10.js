import { supabase } from './erp-db.js';

const $=id=>document.getElementById(id);
const $$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateTime=v=>v?new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(v)):'';

let apiBase='';
let threads=[];
let activeThread=null;
let messages=[];
let statusTimer=null;
let realtimeChannel=null;
let mediaRecorder=null;
let recordStream=null;
let recordChunks=[];
let recordedBlob=null;

function addCss(){
  if(document.querySelector('link[data-wa-online-v10]'))return;
  const l=document.createElement('link');l.rel='stylesheet';l.href='./whatsapp-online-v10.css?build=20260901-1210';l.dataset.waOnlineV10='1';document.head.appendChild(l);
}

function createSection(){
  if($('section-inbox'))return;
  const main=document.querySelector('.main');
  const header=main?.querySelector('.topbar');
  if(!main||!header)return;
  header.insertAdjacentHTML('afterend',`<section id="section-inbox" class="section wa-inbox-section">
    <div class="wa-inbox-shell">
      <aside class="wa-thread-pane">
        <div class="wa-inbox-title"><div><span>ATENDIMENTO</span><h3>WhatsApp</h3></div><button id="waOnlineRefresh" type="button" class="small-btn">Atualizar</button></div>
        <div id="waOnlineStatus" class="wa-online-status">Conectando...</div>
        <input id="waThreadSearch" class="wa-search" placeholder="Buscar cliente ou número">
        <div id="waThreadList" class="wa-thread-list"></div>
      </aside>
      <main class="wa-chat-pane">
        <div id="waEmptyChat" class="wa-chat-empty"><strong>Escolha uma conversa</strong><span>As mensagens novas aparecem aqui em tempo real.</span></div>
        <div id="waActiveChat" class="wa-active-chat wa-hidden">
          <header class="wa-chat-head">
            <div><strong id="waChatName">Cliente</strong><span id="waChatPhone"></span></div>
            <div class="wa-chat-actions"><button id="waOpenCRM" type="button">CRM</button><button id="waStartSale" type="button">Nova venda</button></div>
          </header>
          <div id="waMessages" class="wa-messages"></div>
          <div id="waAttachmentPreview" class="wa-attachment-preview wa-hidden"></div>
          <form id="waComposer" class="wa-composer">
            <label class="wa-attach" title="Anexar foto, PDF ou áudio">＋<input id="waFile" type="file" accept="image/*,application/pdf,audio/*,video/mp4"></label>
            <textarea id="waText" rows="1" placeholder="Digite uma mensagem"></textarea>
            <button id="waRecord" type="button" class="wa-record" title="Gravar áudio">Áudio</button>
            <button id="waSend" type="submit" class="wa-send">Enviar</button>
          </form>
        </div>
      </main>
      <aside id="waInfoPane" class="wa-info-pane">
        <div id="waSetupPanel" class="wa-setup-panel wa-hidden">
          <span>CONFIGURAÇÃO</span><h3>Servidor do WhatsApp</h3>
          <p>Depois do deploy online, cole aqui o endereço HTTPS do servidor.</p>
          <input id="waApiInput" placeholder="https://seu-servidor.onrender.com">
          <button id="waSaveApi" type="button">Salvar servidor</button>
        </div>
        <div id="waQrPanel" class="wa-qr-panel wa-hidden"><span>CONECTAR</span><h3>WhatsApp da gráfica</h3><p id="waQrText">Aguardando QR Code...</p><img id="waOnlineQr" alt="QR Code do WhatsApp"></div>
        <div id="waThreadInfo" class="wa-thread-info wa-hidden">
          <span>SOLICITAÇÃO</span><h3 id="waInfoName">Cliente</h3>
          <label>Responsável<select id="waAssigned"><option value="">Não atribuído</option><option>IGOR</option><option>JHONATAN</option><option>BEATRIZ</option></select></label>
          <label>Situação<select id="waThreadStatus"><option value="open">Em atendimento</option><option value="waiting">Aguardando cliente</option><option value="closed">Encerrado</option></select></label>
          <button id="waMarkRead" type="button" class="wa-info-button">Marcar como lido</button>
        </div>
      </aside>
    </div>
  </section>`);
  bindUi();
}

function installNav(){
  const nav=$('simpleNav');
  if(nav&&!$('waInboxNav')){
    const b=document.createElement('button');b.id='waInboxNav';b.type='button';b.innerHTML='<span>◉</span><b>Atendimentos</b>';b.onclick=openInbox;
    const today=nav.querySelector('[data-simple-section="today"]');today?.insertAdjacentElement('afterend',b);
  }
  const drawer=$('moduleDrawer');
  if(drawer&&!drawer.querySelector('[data-wa-inbox-drawer]')){
    const first=drawer.querySelector('.module-group');
    const b=document.createElement('button');b.type='button';b.dataset.waInboxDrawer='1';b.innerHTML='<i>◉</i><b>Atendimentos</b>';b.onclick=openInbox;first?.appendChild(b);
  }
}

async function getSession(){const {data}=await supabase.auth.getSession();return data.session||null}

async function loadApiBase(){
  const session=await getSession();if(!session)return'';
  const {data}=await supabase.from('company_settings').select('whatsapp_api_url').eq('user_id',session.user.id).maybeSingle();
  apiBase=String(data?.whatsapp_api_url||localStorage.getItem('paco_whatsapp_api')||'').replace(/\/$/,'');
  return apiBase;
}

async function api(path,options={}){
  const session=await getSession();if(!session)throw new Error('Faça login novamente.');
  if(!apiBase)throw new Error('Servidor do WhatsApp ainda não configurado.');
  const headers=new Headers(options.headers||{});headers.set('Authorization',`Bearer ${session.access_token}`);
  if(options.body&&!(options.body instanceof FormData)&&!headers.has('Content-Type'))headers.set('Content-Type','application/json');
  const r=await fetch(apiBase+path,{...options,headers});
  const body=await r.json().catch(()=>({}));if(!r.ok)throw new Error(body.error||'Falha no servidor do WhatsApp.');return body;
}

async function openInbox(){
  createSection();installNav();
  $$('.section').forEach(x=>x.classList.remove('active'));$('section-inbox').classList.add('active');
  if($('pageTitle'))$('pageTitle').textContent='Atendimentos';
  $$('#simpleNav button').forEach(x=>x.classList.remove('active'));$('waInboxNav')?.classList.add('active');
  await loadApiBase();renderSetup();
  if(apiBase){await refreshStatus();await loadThreads();subscribeRealtime()}
}

function renderSetup(){
  $('waSetupPanel')?.classList.toggle('wa-hidden',Boolean(apiBase));
  if($('waApiInput'))$('waApiInput').value=apiBase;
}

async function saveApi(){
  const url=String($('waApiInput')?.value||'').trim().replace(/\/$/,'');
  if(!/^https:\/\//i.test(url))return alert('Use o endereço HTTPS do servidor online.');
  const session=await getSession();if(!session)return;
  const {error}=await supabase.from('company_settings').update({whatsapp_api_url:url,updated_at:new Date().toISOString()}).eq('user_id',session.user.id);
  if(error)return alert('Não foi possível salvar o servidor. Execute a migração V10 no Supabase primeiro.');
  localStorage.setItem('paco_whatsapp_api',url);apiBase=url;renderSetup();await refreshStatus();await loadThreads();subscribeRealtime();
}

async function refreshStatus(){
  clearTimeout(statusTimer);
  try{
    const s=await api('/api/whatsapp/status');
    const el=$('waOnlineStatus');
    if(s.state==='ready'){
      el.innerHTML=`<i class="ready"></i><b>Online</b><span>${esc(s.account?.phone||'WhatsApp conectado')}</span>`;
      $('waQrPanel')?.classList.add('wa-hidden');
    }else if(s.state==='qr'){
      el.innerHTML='<i class="waiting"></i><b>Aguardando conexão</b>';
      $('waQrPanel')?.classList.remove('wa-hidden');$('waQrText').textContent=s.message||'Escaneie o QR Code.';
      if(s.qrDataUrl)$('waOnlineQr').src=s.qrDataUrl;
    }else{
      el.innerHTML=`<i class="waiting"></i><b>${esc(s.state||'Iniciando')}</b><span>${esc(s.message||'')}</span>`;
      $('waQrPanel')?.classList.toggle('wa-hidden',!s.qrDataUrl);
      if(s.qrDataUrl)$('waOnlineQr').src=s.qrDataUrl;
    }
  }catch(e){$('waOnlineStatus').innerHTML=`<i class="off"></i><b>Servidor indisponível</b><span>${esc(e.message)}</span>`}
  statusTimer=setTimeout(()=>{if($('section-inbox')?.classList.contains('active'))refreshStatus()},7000);
}

async function loadThreads(){
  try{const d=await api('/api/threads?status=all');threads=d.threads||[];renderThreads()}catch(e){$('waThreadList').innerHTML=`<div class="wa-list-empty">${esc(e.message)}</div>`}
}

function renderThreads(){
  const q=String($('waThreadSearch')?.value||'').toLowerCase();
  const rows=threads.filter(t=>!q||`${t.customer_name||''} ${t.phone||''} ${t.last_message||''}`.toLowerCase().includes(q));
  $('waThreadList').innerHTML=rows.map(t=>`<button type="button" class="wa-thread ${activeThread?.id===t.id?'active':''}" data-thread="${t.id}"><div class="wa-thread-avatar">${esc((t.customer_name||'?').slice(0,1).toUpperCase())}</div><div><strong>${esc(t.customer_name||t.phone||'Contato')}</strong><p>${esc(t.last_message||'Nova conversa')}</p><small>${esc(t.assigned_to||'Não atribuído')} · ${dateTime(t.last_message_at)}</small></div>${Number(t.unread_count||0)>0?`<b class="wa-unread">${t.unread_count}</b>`:''}</button>`).join('')||'<div class="wa-list-empty">Nenhum atendimento ainda.</div>';
  $$('[data-thread]').forEach(b=>b.onclick=()=>selectThread(b.dataset.thread));
}

async function selectThread(id){
  activeThread=threads.find(x=>x.id===id)||null;if(!activeThread)return;renderThreads();
  $('waEmptyChat').classList.add('wa-hidden');$('waActiveChat').classList.remove('wa-hidden');$('waThreadInfo').classList.remove('wa-hidden');
  $('waChatName').textContent=activeThread.customer_name||activeThread.phone||'Contato';$('waChatPhone').textContent=activeThread.phone||'';$('waInfoName').textContent=activeThread.customer_name||'Cliente';
  $('waAssigned').value=activeThread.assigned_to||'';$('waThreadStatus').value=activeThread.status||'open';
  await loadMessages();api(`/api/threads/${id}/read`,{method:'POST'}).catch(()=>{});activeThread.unread_count=0;renderThreads();
}

async function loadMessages(){
  if(!activeThread)return;
  try{const d=await api(`/api/threads/${activeThread.id}/messages`);messages=d.messages||[];renderMessages()}catch(e){$('waMessages').innerHTML=`<div class="wa-list-empty">${esc(e.message)}</div>`}
}

function messageContent(m){
  const body=m.body?`<div class="wa-message-text">${esc(m.body).replace(/\n/g,'<br>')}</div>`:'';
  if(!m.media_url)return body;
  const mime=String(m.mime_type||'');
  if(mime.startsWith('image/'))return `<a href="${esc(m.media_url)}" target="_blank" rel="noopener"><img class="wa-message-image" src="${esc(m.media_url)}" alt="Imagem enviada"></a>${body}`;
  if(mime.startsWith('audio/'))return `<audio controls src="${esc(m.media_url)}"></audio>${body}`;
  return `<a class="wa-file-card" href="${esc(m.media_url)}" target="_blank" rel="noopener"><b>${mime==='application/pdf'?'PDF':'Arquivo'}</b><span>${esc(m.media_name||'Abrir anexo')}</span></a>${body}`;
}

function renderMessages(){
  $('waMessages').innerHTML=messages.map(m=>`<div class="wa-message-row ${m.direction==='out'?'out':'in'}"><div class="wa-message-bubble">${messageContent(m)}<small>${m.direction==='out'&&m.sent_by_name?esc(m.sent_by_name)+' · ':''}${dateTime(m.created_at)}</small></div></div>`).join('');
  requestAnimationFrame(()=>$('waMessages').scrollTop=$('waMessages').scrollHeight);
}

async function sendMessage(e){
  e.preventDefault();if(!activeThread)return;
  const text=$('waText').value.trim(),file=$('waFile').files?.[0]||null,blob=recordedBlob;
  if(!text&&!file&&!blob)return;
  const fd=new FormData();if(text)fd.append('text',text);
  if(blob){fd.append('file',blob,'audio-whatsapp.webm');fd.append('asVoice','true')}else if(file){fd.append('file',file,file.name);if(file.type==='application/pdf')fd.append('asDocument','true')}
  $('waSend').disabled=true;
  try{await api(`/api/threads/${activeThread.id}/send`,{method:'POST',body:fd});$('waText').value='';$('waFile').value='';clearAttachment();await loadMessages();await loadThreads()}catch(err){alert(err.message)}finally{$('waSend').disabled=false}
}

function previewFile(){recordedBlob=null;const f=$('waFile').files?.[0];if(!f)return clearAttachment();$('waAttachmentPreview').classList.remove('wa-hidden');$('waAttachmentPreview').innerHTML=`<span>${esc(f.name)}</span><button type="button" id="waRemoveAttachment">×</button>`;$('waRemoveAttachment').onclick=()=>{$('waFile').value='';clearAttachment()}}
function clearAttachment(){recordedBlob=null;$('waAttachmentPreview')?.classList.add('wa-hidden');if($('waAttachmentPreview'))$('waAttachmentPreview').innerHTML='';$('waRecord')?.classList.remove('recording');if($('waRecord'))$('waRecord').textContent='Áudio'}

async function toggleRecording(){
  if(mediaRecorder?.state==='recording'){mediaRecorder.stop();return}
  if(!navigator.mediaDevices?.getUserMedia)return alert('Este navegador não permite gravar áudio.');
  try{
    recordStream=await navigator.mediaDevices.getUserMedia({audio:true});recordChunks=[];mediaRecorder=new MediaRecorder(recordStream);
    mediaRecorder.ondataavailable=e=>{if(e.data.size)recordChunks.push(e.data)};
    mediaRecorder.onstop=()=>{recordedBlob=new Blob(recordChunks,{type:mediaRecorder.mimeType||'audio/webm'});recordStream?.getTracks().forEach(t=>t.stop());$('waRecord').classList.remove('recording');$('waRecord').textContent='Áudio pronto';$('waAttachmentPreview').classList.remove('wa-hidden');$('waAttachmentPreview').innerHTML='<span>Mensagem de voz pronta</span><button type="button" id="waRemoveAttachment">×</button>';$('waRemoveAttachment').onclick=clearAttachment};
    mediaRecorder.start();$('waRecord').classList.add('recording');$('waRecord').textContent='Parar';
  }catch{alert('Permita o acesso ao microfone para gravar áudio.')}
}

async function updateThread(){
  if(!activeThread)return;try{const d=await api(`/api/threads/${activeThread.id}`,{method:'PATCH',body:JSON.stringify({assigned_to:$('waAssigned').value||null,status:$('waThreadStatus').value})});activeThread={...activeThread,...d.thread};await loadThreads()}catch(e){alert(e.message)}
}

function openCRM(){document.querySelector('.nav-item[data-section="funnel"]')?.click()}
function startSale(){
  if(!activeThread)return;document.querySelector('.nav-item[data-section="sale"]')?.click();
  setTimeout(()=>{if($('saleCustomer'))$('saleCustomer').value=activeThread.customer_name||'';if($('salePhone'))$('salePhone').value=activeThread.phone||'';$('saleCustomer')?.dispatchEvent(new Event('input',{bubbles:true}));$('salePhone')?.dispatchEvent(new Event('input',{bubbles:true}))},120);
}

function subscribeRealtime(){
  realtimeChannel?.unsubscribe();
  supabase.auth.getSession().then(({data})=>{
    const uid=data.session?.user?.id;if(!uid)return;
    realtimeChannel=supabase.channel(`paco-wa-${uid}`)
      .on('postgres_changes',{event:'*',schema:'public',table:'whatsapp_threads',filter:`user_id=eq.${uid}`},()=>loadThreads())
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'whatsapp_messages',filter:`user_id=eq.${uid}`},payload=>{loadThreads();if(activeThread&&payload.new.thread_id===activeThread.id)loadMessages()})
      .subscribe();
  });
}

function bindUi(){
  $('waOnlineRefresh').onclick=()=>{refreshStatus();loadThreads()};$('waThreadSearch').oninput=renderThreads;$('waSaveApi').onclick=saveApi;
  $('waComposer').onsubmit=sendMessage;$('waFile').onchange=previewFile;$('waRecord').onclick=toggleRecording;
  $('waAssigned').onchange=updateThread;$('waThreadStatus').onchange=updateThread;$('waMarkRead').onclick=()=>activeThread&&api(`/api/threads/${activeThread.id}/read`,{method:'POST'}).then(()=>{activeThread.unread_count=0;renderThreads()});
  $('waOpenCRM').onclick=openCRM;$('waStartSale').onclick=startSale;
}

function setup(){
  addCss();createSection();
  const timer=setInterval(()=>{installNav();if($('simpleNav')&&$('section-inbox'))clearInterval(timer)},200);setTimeout(()=>clearInterval(timer),15000);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&$('section-inbox')?.classList.contains('active')){loadThreads();refreshStatus()}});
}

window.PacoInbox={open:openInbox};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup);else setup();
