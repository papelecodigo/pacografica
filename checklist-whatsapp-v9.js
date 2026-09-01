const $=id=>document.getElementById(id);
const $$=s=>[...document.querySelectorAll(s)];
const BRIDGE='http://127.0.0.1:3031';
let pollTimer=null;

function addCss(){if(document.querySelector('link[data-check-wa-v9]'))return;const l=document.createElement('link');l.rel='stylesheet';l.href='./checklist-whatsapp-v9.css?build=20260901-1120';l.dataset.checkWaV9='1';document.head.appendChild(l)}
function safe(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function digits(v=''){return String(v).replace(/\D/g,'')}
function money(text=''){return Number(String(text).replace(/[^\d,-]/g,'').replace(/\./g,'').replace(',','.'))||0}
function dedupe(){const groups=['[data-sale-v8-logistics]','[data-sale-v8-entry]'];for(const sel of groups){const rows=$$(sel);rows.slice(1).forEach(x=>x.remove())}const item=$('saleItems')?.closest('.panel');item?.querySelector('.section-title b')?.replaceChildren(document.createTextNode('03'))}

function checklistState(){
 const customer=Boolean($('saleCustomer')?.value.trim());
 const phone=digits($('salePhone')?.value).length>=10;
 const item=money($('saleTotal')?.textContent)>0;
 const due=Boolean($('saleDueDate')?.value);
 const pay=Boolean($('salePayment')?.value)&&Boolean($('salePaymentCondition')?.value);
 return[
  {key:'customer',label:'Cliente identificado',done:customer,target:'saleCustomer'},
  {key:'phone',label:'WhatsApp confirmado',done:phone,target:'salePhone'},
  {key:'item',label:'Produto e valor lançados',done:item,target:'saleItems'},
  {key:'due',label:'Prazo e recebimento definidos',done:due,target:'saleDueDate'},
  {key:'pay',label:'Pagamento definido',done:pay,target:'salePayment'}
 ];
}
function mountChecklist(){const checkout=document.querySelector('#section-sale .checkout-card');if(!checkout||$('saleChecklist'))return;checkout.insertAdjacentHTML('beforeend',`<div id="saleChecklist" class="sale-checklist"><div class="sale-checklist-head"><strong>Checklist da venda</strong><span id="saleChecklistCount" class="sale-checklist-count">0/5</span></div><div id="saleChecklistList" class="sale-checklist-list"></div><div class="sale-check-progress"><i id="saleChecklistBar"></i></div></div>`);renderChecklist()}
function renderChecklist(){if(!$('saleChecklistList'))return;const state=checklistState(),done=state.filter(x=>x.done).length;$('saleChecklistCount').textContent=`${done}/${state.length}`;$('saleChecklistBar').style.width=`${done/state.length*100}%`;$('saleChecklistList').innerHTML=state.map(x=>`<button type="button" class="sale-check-item ${x.done?'done':''}" data-check-target="${x.target}"><span class="check-dot">${x.done?'✓':''}</span><span>${x.label}</span></button>`).join('');$$('[data-check-target]').forEach(b=>b.onclick=()=>{const el=$(b.dataset.checkTarget);el?.scrollIntoView({behavior:'smooth',block:'center'});el?.focus?.()})}

function mountWhatsappButton(){const first=document.querySelector('#section-sale .stack .panel');if(!first||$('waImportBtn'))return;const title=first.querySelector('.section-title');if(!title)return;const b=document.createElement('button');b.type='button';b.id='waImportBtn';b.className='btn ghost wa-import-btn';b.textContent='WhatsApp';b.onclick=openWhatsapp;title.appendChild(b)}
function mountDialog(){if($('waLocalDialog'))return;document.body.insertAdjacentHTML('beforeend',`<dialog id="waLocalDialog" class="wa-dialog"><div class="wa-box"><div class="wa-head"><div><p class="eyebrow">WHATSAPP LOCAL</p><h3>Importar cliente</h3><p>Conecta pelo QR no computador da gráfica e traz nome/telefone para a venda.</p></div><button type="button" id="waClose" class="icon-btn">×</button></div><div id="waStatus" class="wa-status"><span class="wa-status-dot"></span><div><b id="waStatusTitle">Verificando conector...</b><small id="waStatusText"></small></div></div><div id="waOffline" class="wa-offline wa-hidden"><h4>Conector local desligado</h4><p>Abra o arquivo <b>whatsapp-local/iniciar-whatsapp.bat</b> no computador da gráfica. Na primeira vez ele instala o necessário e gera o QR.</p><button type="button" id="waRetry" class="btn primary">Tentar novamente</button></div><div id="waQrArea" class="wa-qr-wrap wa-hidden"><img id="waQrImage" alt="QR Code do WhatsApp"><small>WhatsApp → Aparelhos conectados → Conectar aparelho</small></div><div id="waChatsArea" class="wa-hidden"><div class="wa-tools"><input id="waSearch" placeholder="Buscar conversa por nome ou número"><button type="button" id="waReload" class="btn ghost">Atualizar</button></div><div id="waChatList" class="wa-chat-list"></div></div><p class="wa-privacy">A sessão e as conversas ficam no próprio computador. O site recebe apenas os dados que você escolher importar.</p></div></dialog>`);$('waClose').onclick=()=>closeWhatsapp();$('waRetry').onclick=()=>refreshWhatsapp();$('waReload').onclick=()=>loadChats();$('waSearch').oninput=()=>filterChats();$('waLocalDialog').addEventListener('close',()=>stopPoll())}
async function localFetch(path){const opts={cache:'no-store'};try{opts.targetAddressSpace='local'}catch{}const r=await fetch(BRIDGE+path,opts);if(!r.ok)throw new Error('bridge');return r.json()}
function setStatus(state,title,text=''){const el=$('waStatus');el.className=`wa-status ${state||''}`;$('waStatusTitle').textContent=title;$('waStatusText').textContent=text}
function showOnly(id){for(const x of ['waOffline','waQrArea','waChatsArea'])$(x)?.classList.toggle('wa-hidden',x!==id)}
async function refreshWhatsapp(){try{const s=await localFetch('/status');if(s.state==='ready'){setStatus('ready','WhatsApp conectado',s.account||'Pronto para importar clientes.');showOnly('waChatsArea');await loadChats();stopPoll()}else if(s.state==='qr'){setStatus('qr','Escaneie o QR Code','Aguardando conexão do WhatsApp.');showOnly('waQrArea');const q=await localFetch('/qr');if(q.dataUrl)$('waQrImage').src=q.dataUrl;startPoll()}else{setStatus('',s.state==='starting'?'Iniciando WhatsApp...':'Aguardando WhatsApp',s.message||'');showOnly('waQrArea');startPoll()}}catch{setStatus('','Conector local não encontrado','Inicie o conector neste computador.');showOnly('waOffline');stopPoll()}}
function startPoll(){if(pollTimer)return;pollTimer=setInterval(refreshWhatsapp,2200)}function stopPoll(){clearInterval(pollTimer);pollTimer=null}
async function loadChats(){try{const d=await localFetch('/chats?limit=40');window.__pacoWaChats=d.chats||[];renderChats(window.__pacoWaChats)}catch{setStatus('','Não foi possível ler as conversas','Verifique se o WhatsApp continua conectado.')}}
function renderChats(rows){const list=$('waChatList');if(!list)return;list.innerHTML=rows.length?rows.map((c,i)=>`<div class="wa-chat" data-wa-row="${i}"><div><b>${safe(c.name||c.phone||'Contato')}</b><small>${safe(c.phone||'')}</small><p>${safe(c.lastMessage||'Sem mensagem recente')}</p></div><button type="button" class="btn primary" data-wa-use="${i}">Usar cliente</button></div>`).join(''):`<div class="wa-offline"><p>Nenhuma conversa individual recente encontrada.</p></div>`;$$('[data-wa-use]').forEach(b=>b.onclick=()=>useChat(rows[Number(b.dataset.waUse)]))}
function filterChats(){const q=($('waSearch')?.value||'').trim().toLowerCase(),rows=window.__pacoWaChats||[];renderChats(!q?rows:rows.filter(c=>`${c.name||''} ${c.phone||''} ${c.lastMessage||''}`.toLowerCase().includes(q)))}
function useChat(c){if($('saleCustomer'))$('saleCustomer').value=c.name||c.phone||'';if($('salePhone'))$('salePhone').value=c.phone||'';const note=$('saleNote');if(note&&c.lastMessage){const current=note.value.trim();note.value=current||`Última mensagem do WhatsApp: ${c.lastMessage}`}$('saleCustomer')?.dispatchEvent(new Event('input',{bubbles:true}));$('salePhone')?.dispatchEvent(new Event('input',{bubbles:true}));renderChecklist();closeWhatsapp()}
function openWhatsapp(){mountDialog();$('waLocalDialog').showModal();refreshWhatsapp()}
function closeWhatsapp(){stopPoll();$('waLocalDialog')?.close()}

function mount(){addCss();dedupe();mountChecklist();mountWhatsappButton();mountDialog();renderChecklist()}
function setup(){let ticks=0;const timer=setInterval(()=>{mount();ticks++;if(ticks>40)clearInterval(timer)},250);document.addEventListener('input',e=>{if(e.target.closest('#section-sale'))setTimeout(()=>{dedupe();renderChecklist()},0)});document.addEventListener('change',e=>{if(e.target.closest('#section-sale'))setTimeout(()=>{dedupe();renderChecklist()},0)})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup);else setup();
