import { supabase } from './erp-db.js';
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const roleNames={admin:'Administrador',manager:'Gestor',attendant:'Atendimento',production:'Produção',finance:'Financeiro',viewer:'Somente leitura'};
let apiBase='',members=[];

async function context(){
  const {data}=await supabase.auth.getSession();const session=data.session;if(!session)return null;
  const {data:s}=await supabase.from('company_settings').select('whatsapp_api_url').eq('user_id',session.user.id).maybeSingle();
  apiBase=String(s?.whatsapp_api_url||localStorage.getItem('paco_whatsapp_api')||'').replace(/\/$/,'');
  return{session,isOwner:(session.user.workspace_role||'owner')==='owner'};
}
async function request(path,options={}){
  const c=await context();if(!c?.session)throw new Error('Faça login novamente.');if(!apiBase)throw new Error('Configure primeiro o servidor em Atendimentos.');
  const headers=new Headers(options.headers||{});headers.set('Authorization',`Bearer ${c.session.access_token}`);if(options.body&&!headers.has('Content-Type'))headers.set('Content-Type','application/json');
  const r=await fetch(apiBase+path,{...options,headers});const b=await r.json().catch(()=>({}));if(!r.ok)throw new Error(b.error||'Falha ao acessar a equipe.');return b;
}
function mount(){
  const section=$('section-settings');if(!section||$('teamPanel'))return;
  const target=section.querySelector('.settings-grid')||section;
  target.insertAdjacentHTML('beforeend',`<article id="teamPanel" class="panel team-panel"><div class="panel-head"><div><p class="eyebrow">EQUIPE</p><h3>Acesso ao sistema</h3><p class="team-sub">Cada pessoa entra com o próprio e-mail e trabalha na mesma Papel e Código.</p></div><span id="teamCount" class="pill">0 pessoas</span></div><div id="teamInvite" class="team-invite"><input id="teamName" placeholder="Nome"><input id="teamEmail" type="email" placeholder="E-mail"><select id="teamRole"><option value="attendant">Atendimento</option><option value="production">Produção</option><option value="finance">Financeiro</option><option value="manager">Gestor</option><option value="viewer">Somente leitura</option><option value="admin">Administrador</option></select><button id="teamInviteBtn" type="button" class="btn primary">Convidar</button></div><div id="teamMessage" class="team-message"></div><div id="teamList" class="team-list"></div></article>`);
  $('teamInviteBtn').onclick=invite;$('teamList').addEventListener('change',changeMember);load();
}
async function load(){
  if(!$('teamPanel'))return;try{const c=await context();$('teamInvite').classList.toggle('team-hidden',!c?.isOwner);if(!apiBase){$('teamMessage').textContent='Abra Atendimentos e configure o servidor online para gerenciar convites.';return}const d=await request('/api/team');members=d.members||[];render()}catch(e){$('teamMessage').textContent=e.message}}
function render(){
  $('teamCount').textContent=`${members.length} ${members.length===1?'pessoa':'pessoas'}`;$('teamMessage').textContent='';
  $('teamList').innerHTML=members.map(m=>`<div class="team-row"><div class="team-avatar">${esc((m.display_name||m.member_email||'?').slice(0,1).toUpperCase())}</div><div class="team-person"><b>${esc(m.display_name||m.member_email||'Integrante')}</b><span>${esc(m.member_email||'')}</span></div><select data-team-role="${m.id}">${Object.entries(roleNames).map(([k,v])=>`<option value="${k}" ${m.role===k?'selected':''}>${v}</option>`).join('')}</select><label class="team-active"><input type="checkbox" data-team-active="${m.id}" ${m.active!==false?'checked':''}> Ativo</label></div>`).join('')||'<div class="team-empty">Nenhum integrante convidado ainda.</div>';
}
async function invite(){
  const email=$('teamEmail').value.trim(),name=$('teamName').value.trim(),role=$('teamRole').value;if(!email)return;
  const b=$('teamInviteBtn');b.disabled=true;b.textContent='Enviando...';try{await request('/api/team/invite',{method:'POST',body:JSON.stringify({email,display_name:name,role})});$('teamEmail').value='';$('teamName').value='';await load();$('teamMessage').textContent='Convite enviado. A pessoa receberá um e-mail para criar o acesso.'}catch(e){$('teamMessage').textContent=e.message}finally{b.disabled=false;b.textContent='Convidar'}
}
async function changeMember(e){
  const id=e.target.dataset.teamRole||e.target.dataset.teamActive;if(!id)return;const payload=e.target.dataset.teamRole?{role:e.target.value}:{active:e.target.checked};try{await request(`/api/team/${id}`,{method:'PATCH',body:JSON.stringify(payload)});await load()}catch(err){$('teamMessage').textContent=err.message}
}
function css(){if(document.querySelector('link[data-team-v10]'))return;const l=document.createElement('link');l.rel='stylesheet';l.href='./team-online-v10.css?build=20260901-1230';l.dataset.teamV10='1';document.head.appendChild(l)}
function setup(){css();const timer=setInterval(()=>{mount();if($('teamPanel'))clearInterval(timer)},350);setTimeout(()=>clearInterval(timer),15000);document.addEventListener('click',e=>{if(e.target.closest('[data-more-go="settings"]'))setTimeout(load,250)})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup);else setup();
