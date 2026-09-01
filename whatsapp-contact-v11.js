import { supabase } from './erp-db.js';

const $=id=>document.getElementById(id);
const $$=s=>[...document.querySelectorAll(s)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let apiBase='';
const cache=new Map();
const loading=new Set();

function addCss(){
  if(document.querySelector('link[data-wa-contact-v11]'))return;
  const l=document.createElement('link');l.rel='stylesheet';l.href='./whatsapp-contact-v11.css?build=20260901-1405';l.dataset.waContactV11='1';document.head.appendChild(l);
}
async function getSession(){const {data}=await supabase.auth.getSession();return data.session||null}
async function getApiBase(){
  const session=await getSession();if(!session)return'';
  if(apiBase)return apiBase;
  const {data}=await supabase.from('company_settings').select('whatsapp_api_url').eq('user_id',session.user.id).maybeSingle();
  apiBase=String(data?.whatsapp_api_url||localStorage.getItem('paco_whatsapp_api')||'').replace(/\/$/,'');
  return apiBase;
}
async function api(path){
  const session=await getSession();if(!session)throw new Error('Sessão ausente');
  const base=await getApiBase();if(!base)throw new Error('Servidor do WhatsApp não configurado');
  const r=await fetch(base+path,{headers:{Authorization:`Bearer ${session.access_token}`}});
  const body=await r.json().catch(()=>({}));if(!r.ok)throw new Error(body.error||'Falha ao identificar contato');return body;
}
function formatPhone(value){
  let d=String(value||'').replace(/\D/g,'');
  if(d.startsWith('55')&&d.length>=12)d=d.slice(2);
  if(d.length===11)return`(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
  if(d.length===10)return`(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return value||'';
}
function initial(name){return String(name||'?').trim().slice(0,1).toUpperCase()||'?'}
function avatarHtml(name,url){return url?`<img src="${esc(url)}" alt="${esc(name||'Contato')}" referrerpolicy="no-referrer">`:`<span>${esc(initial(name))}</span>`}
function onlyDigits(v){return String(v||'').replace(/\D/g,'')}
function isProvisional(data){
  if(!data)return true;
  const name=String(data.name||data.customer_name||'').trim();
  const phone=onlyDigits(data.phone);
  const nameDigits=onlyDigits(name);
  const nameLooksId=Boolean(name)&&nameDigits===name.replace(/\D/g,'')&&nameDigits.length>=13;
  const phoneLooksId=phone.length>=13&&!phone.startsWith('55');
  return !name||nameLooksId||phoneLooksId;
}

async function identity(threadId){
  const cached=cache.get(threadId);
  if(cached){
    const ttl=cached.provisional?4000:5*60*1000;
    if(Date.now()-cached.at<ttl)return cached.data;
    cache.delete(threadId);
  }
  if(loading.has(threadId))return cached?.data||null;
  loading.add(threadId);
  try{
    const d=await api(`/api/threads/${threadId}/identity`);
    const value={...(d.thread||{}),...(d.identity||{}),profilePicUrl:d.identity?.profilePicUrl||null};
    cache.set(threadId,{data:value,at:Date.now(),provisional:isProvisional(value)});
    return value;
  }catch(e){console.warn('[WhatsApp contato]',e.message);return cached?.data||null}
  finally{loading.delete(threadId)}
}
function ensurePhoneLine(button){
  const box=button.querySelector(':scope > div:nth-child(2)');if(!box)return null;
  let line=box.querySelector('.wa-contact-phone-v11');
  if(!line){line=document.createElement('span');line.className='wa-contact-phone-v11';const p=box.querySelector('p');if(p)p.insertAdjacentElement('beforebegin',line);else box.appendChild(line)}
  return line;
}
function applyToButton(button,data){
  if(!button||!data)return;
  const name=data.name||data.customer_name||data.phone||'Contato';
  const phone=formatPhone(data.phone||'');
  const av=button.querySelector('.wa-thread-avatar');if(av){av.classList.add('wa-thread-photo-v11');av.innerHTML=avatarHtml(name,data.profilePicUrl)}
  const strong=button.querySelector('strong');if(strong)strong.textContent=name;
  const line=ensurePhoneLine(button);if(line)line.textContent=phone;
}
function applyActive(threadId,data){
  if(!data)return;
  const active=document.querySelector(`.wa-thread[data-thread="${CSS.escape(threadId)}"].active`);if(!active)return;
  const name=data.name||data.customer_name||data.phone||'Contato';
  const phone=formatPhone(data.phone||'');
  if($('waChatName'))$('waChatName').textContent=name;
  if($('waChatPhone'))$('waChatPhone').textContent=phone;
  if($('waInfoName'))$('waInfoName').textContent=name;
  const head=$('waChatName')?.parentElement;
  if(head){
    let av=head.querySelector('.wa-chat-photo-v11');
    if(!av){av=document.createElement('div');av.className='wa-chat-photo-v11';head.prepend(av)}
    av.innerHTML=avatarHtml(name,data.profilePicUrl);
    head.classList.add('wa-chat-person-v11');
  }
  const info=$('waInfoName')?.parentElement;
  if(info){
    let av=info.querySelector('.wa-info-photo-v11');
    if(!av){av=document.createElement('div');av.className='wa-info-photo-v11';$('waInfoName').insertAdjacentElement('beforebegin',av)}
    av.innerHTML=avatarHtml(name,data.profilePicUrl);
  }
}
async function enrichButton(button){
  const id=button?.dataset?.thread;if(!id)return;
  const data=await identity(id);if(!data)return;
  applyToButton(button,data);applyActive(id,data);
}
function scan(){
  $$('.wa-thread[data-thread]').slice(0,40).forEach(enrichButton);
}
function bindClicks(){
  document.addEventListener('click',e=>{
    const b=e.target.closest?.('.wa-thread[data-thread]');if(!b)return;
    const id=b.dataset.thread;
    setTimeout(async()=>{const entry=cache.get(id);const data=entry?.data||await identity(id);applyActive(id,data)},80);
  },true);
}
function observe(){
  const mo=new MutationObserver(()=>scan());
  mo.observe(document.body,{childList:true,subtree:true});
  setInterval(()=>{if($('section-inbox')?.classList.contains('active'))scan()},5000);
}

addCss();bindClicks();observe();
window.addEventListener('paco:whatsapp-refresh',()=>{cache.clear();scan()});
setTimeout(scan,800);