import {supabase,db} from './erp-db.js';

const $=id=>document.getElementById(id);
const $$=sel=>[...document.querySelectorAll(sel)];
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const brl=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v||0));
const localDate=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());
const dateBR=v=>v?new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(String(v).length===10?`${v}T12:00:00-03:00`:v)):'—';
const timeBR=v=>v?new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit',timeZone:'America/Sao_Paulo'}).format(new Date(v)):'—';

let didOpenToday=false;
let focusRenderTimer=null;
let focusObserver=null;

function injectCss(){
  if(document.querySelector('link[data-focus-v6]'))return;
  const l=document.createElement('link');
  l.rel='stylesheet';l.href='./focus-v6.css?build=20260831-1635';l.dataset.focusV6='1';
  document.head.appendChild(l);
}

function hiddenNav(section){return document.querySelector(`.nav-item[data-section="${section}"]`)}
function go(section){
  $('moduleDrawer')?.classList.remove('open');
  if(section==='today'){
    const today=hiddenNav('today');
    if(today){today.click();return}
  }
  hiddenNav(section)?.click();
  setTimeout(syncSimpleNav,30);
}

function createSimpleNav(){
  if($('simpleNav'))return;
  const top=document.querySelector('.sidebar-top');
  const oldNav=top?.querySelector('.nav');
  if(!top||!oldNav)return;
  document.body.classList.add('focus-v6');
  const nav=document.createElement('nav');
  nav.id='simpleNav';nav.className='simple-nav';
  nav.innerHTML=`
    <button data-simple-section="today"><span>◷</span><b>Hoje</b></button>
    <button data-simple-section="sale"><span>＋</span><b>Vendas</b></button>
    <button data-simple-section="production"><span>◆</span><b>Produção</b></button>
    <button data-simple-section="finance"><span>R$</span><b>Financeiro</b></button>
    <button id="moreModulesBtn"><span>•••</span><b>Mais</b></button>`;
  oldNav.insertAdjacentElement('beforebegin',nav);
  nav.querySelectorAll('[data-simple-section]').forEach(b=>b.onclick=()=>go(b.dataset.simpleSection));
  $('moreModulesBtn').onclick=e=>{e.stopPropagation();$('moduleDrawer')?.classList.toggle('open')};
}

function createModuleDrawer(){
  if($('moduleDrawer'))return;
  document.body.insertAdjacentHTML('beforeend',`
    <aside id="moduleDrawer" class="module-drawer" aria-label="Mais módulos">
      <div class="module-drawer-head"><div><b>Mais</b><small>Abra só quando precisar.</small></div><button id="closeModuleDrawer">×</button></div>
      <div class="module-group"><span>COMERCIAL</span>
        <button data-more-go="customers"><i>◎</i><b>Clientes</b></button>
        <button data-more-go="quotes"><i>▤</i><b>Orçamentos</b></button>
        <button data-more-go="funnel"><i>◇</i><b>CRM / Funil</b></button>
      </div>
      <div class="module-group"><span>OPERAÇÃO</span>
        <button data-more-go="orders"><i>▣</i><b>Pedidos</b></button>
        <button data-more-go="tasks"><i>✓</i><b>Tarefas</b></button>
        <button data-more-go="catalog"><i>▦</i><b>Catálogo</b></button>
        <button data-more-go="stock"><i>▥</i><b>Estoque</b></button>
        <button data-more-go="suppliers"><i>◉</i><b>Fornecedores</b></button>
      </div>
      <div class="module-group"><span>GESTÃO</span>
        <button data-more-go="dashboard"><i>◫</i><b>Indicadores</b></button>
        <button data-more-go="investments"><i>↗</i><b>Investimentos</b></button>
        <button data-more-go="ledger"><i>≡</i><b>Lançamentos</b></button>
        <button data-more-go="automations"><i>⚙</i><b>Automações</b></button>
        <button data-more-go="settings"><i>☷</i><b>Configurações</b></button>
      </div>
    </aside>`);
  $('closeModuleDrawer').onclick=()=>$('moduleDrawer').classList.remove('open');
  $$('[data-more-go]').forEach(b=>b.onclick=()=>go(b.dataset.moreGo));
  document.addEventListener('click',e=>{if(!e.target.closest('#moduleDrawer')&&!e.target.closest('#moreModulesBtn'))$('moduleDrawer')?.classList.remove('open')});
}

function currentSection(){return $$('.section').find(s=>s.classList.contains('active'))?.id?.replace('section-','')||''}
function syncSimpleNav(){
  const s=currentSection();
  let group='more';
  if(s==='today')group='today';
  else if(['sale','customers','quotes','funnel'].includes(s))group='sale';
  else if(['production','orders','tasks'].includes(s))group='production';
  else if(['finance','investments','ledger'].includes(s))group='finance';
  $$('#simpleNav button').forEach(b=>b.classList.toggle('active',b.dataset.simpleSection===group||(group==='more'&&b.id==='moreModulesBtn')));
}

function createFocusCard(){
  const section=$('section-today');
  if(!section||$('focusNowCard'))return;
  section.insertAdjacentHTML('afterbegin',`
    <article id="focusNowCard" class="focus-now-card loading">
      <div class="focus-now-kicker"><span class="focus-dot"></span> FOCO AGORA</div>
      <div class="focus-now-body">
        <div class="focus-now-copy"><small id="focusNowType">Organizando o dia...</small><h3 id="focusNowTitle">Carregando sua próxima ação</h3><p id="focusNowMeta">Só o que merece atenção primeiro.</p></div>
        <div id="focusNowActions" class="focus-now-actions"></div>
      </div>
    </article>`);
  const quick=$('.today-focus');
  if(quick){
    quick.querySelector('.eyebrow')?.replaceChildren(document.createTextNode('ANOTAÇÃO RÁPIDA'));
    const h=quick.querySelector('h3');if(h)h.textContent='Anote e continue';
    const p=quick.querySelector(':scope > p');if(p)p.textContent='Digite uma tarefa sem sair do seu fluxo.';
  }
}

async function getData(){
  const {data}=await supabase.auth.getSession();
  const user=data.session?.user;if(!user)return null;
  db.setUser(user);await db.detectERP();
  const names=['tasks','orders','quotes','receivables'];
  const [tasks,orders,quotes,receivables]=await Promise.all(names.map(n=>db.list(n)));
  return{tasks,orders,quotes,receivables};
}

function priorityWeight(p){return({critical:35,high:25,normal:10,low:0})[p]??10}
function chooseFocus(data){
  const today=localDate(),now=Date.now(),items=[];
  for(const t of data.tasks.filter(x=>!['done','cancelled'].includes(x.status))){
    const due=t.due_at?new Date(t.due_at).getTime():null;
    const dueDay=t.due_at?String(t.due_at).slice(0,10):'';
    if(due&&due<now)items.push({kind:'task',score:125+priorityWeight(t.priority),row:t,label:'Tarefa atrasada'});
    else if(dueDay===today)items.push({kind:'task',score:95+priorityWeight(t.priority),row:t,label:'Tarefa de hoje'});
  }
  for(const o of data.orders.filter(x=>!['ready','delivered','cancelled'].includes(x.status))){
    if(o.promised_date&&o.promised_date<today)items.push({kind:'order',score:140+Number(o.priority||0)/10,row:o,label:'Pedido atrasado'});
    else if(o.promised_date===today)items.push({kind:'order',score:115+Number(o.priority||0)/10,row:o,label:'Pedido com prazo hoje'});
  }
  for(const r of data.receivables.filter(x=>!['paid','cancelled'].includes(x.status))){
    if(r.due_date&&r.due_date<today)items.push({kind:'finance',score:105,row:r,label:'Recebimento vencido'});
    else if(r.due_date===today)items.push({kind:'finance',score:82,row:r,label:'Recebimento de hoje'});
  }
  for(const q of data.quotes.filter(x=>['sent','waiting','negotiation'].includes(x.status))){
    const stamp=new Date(q.updated_at||q.sent_at||q.created_at||0).getTime();
    const days=stamp?Math.floor((now-stamp)/86400000):0;
    if(days>=2)items.push({kind:'quote',score:70+Math.min(days,20),row:q,label:'Cliente aguardando retorno',days});
  }
  items.sort((a,b)=>b.score-a.score);
  return items[0]||null;
}

function renderFocusItem(item){
  const card=$('focusNowCard');if(!card)return;
  card.classList.remove('loading','clear','urgent');
  const type=$('focusNowType'),title=$('focusNowTitle'),meta=$('focusNowMeta'),actions=$('focusNowActions');
  if(!item){
    card.classList.add('clear');
    type.textContent='Operação sob controle';title.textContent='Nada urgente pedindo sua atenção agora';meta.textContent='Você pode iniciar uma venda ou registrar a próxima tarefa.';
    actions.innerHTML='<button class="focus-secondary" data-focus-action="task">+ Tarefa</button><button class="focus-primary" data-focus-action="sale">Nova venda</button>';
    actions.querySelector('[data-focus-action="task"]').onclick=()=>document.dispatchEvent(new CustomEvent('paco:quick-task'));
    actions.querySelector('[data-focus-action="sale"]').onclick=()=>go('sale');
    return;
  }
  if(item.score>=120)card.classList.add('urgent');
  type.textContent=item.label;
  if(item.kind==='task'){
    const t=item.row;title.textContent=t.title||'Tarefa pendente';meta.textContent=[t.assignee?`Responsável: ${t.assignee}`:null,t.due_at?`${dateBR(t.due_at)} às ${timeBR(t.due_at)}`:null].filter(Boolean).join(' · ')||'Abra a tarefa para continuar.';
    actions.innerHTML=`<button class="focus-secondary" id="focusCompleteTask">Concluir</button><button class="focus-primary" id="focusOpenTarget">Abrir tarefas</button>`;
    $('focusCompleteTask').onclick=async()=>{await db.update('tasks',t.id,{status:'done',completed_at:new Date().toISOString()});await renderFocus();hiddenNav('tasks')?.click();setTimeout(()=>go('today'),50)};
    $('focusOpenTarget').onclick=()=>go('tasks');
  }else if(item.kind==='order'){
    const o=item.row;title.textContent=`${o.code||'Pedido'} precisa avançar`;meta.textContent=`Prazo ${dateBR(o.promised_date)}${o.total?` · ${brl(o.total)}`:''}`;
    actions.innerHTML='<button class="focus-primary" id="focusOpenTarget">Abrir produção</button>';$('focusOpenTarget').onclick=()=>go('production');
  }else if(item.kind==='quote'){
    const q=item.row;title.textContent=`Retomar ${q.code||'orçamento'}`;meta.textContent=`${item.days} dias sem avanço${q.total?` · ${brl(q.total)}`:''}`;
    actions.innerHTML='<button class="focus-primary" id="focusOpenTarget">Abrir orçamento</button>';$('focusOpenTarget').onclick=()=>go('quotes');
  }else{
    const r=item.row;title.textContent=r.description||'Recebimento pendente';meta.textContent=`Vencimento ${dateBR(r.due_date)} · ${brl(Math.max(0,Number(r.amount)-Number(r.received_amount||0)))}`;
    actions.innerHTML='<button class="focus-primary" id="focusOpenTarget">Abrir financeiro</button>';$('focusOpenTarget').onclick=()=>go('finance');
  }
}

async function renderFocus(){
  createFocusCard();
  try{const data=await getData();if(!data)return;renderFocusItem(chooseFocus(data));trimTodayNoise()}catch(e){console.warn('Foco V6:',e)}
}

function trimTodayNoise(){
  const section=$('section-today');if(!section)return;
  section.querySelectorAll('.today-number').forEach(card=>{const n=Number(card.querySelector('strong')?.textContent||0);card.classList.toggle('zero',n===0)});
  section.querySelectorAll('.today-panel').forEach(panel=>{const empty=!!panel.querySelector('.today-empty');panel.classList.toggle('quiet-empty',empty)});
}

function wireQuickTaskBridge(){
  document.addEventListener('paco:quick-task',()=>{
    const btn=$('newPrimaryBtn');
    btn?.click();
    setTimeout(()=>document.querySelector('[data-quick-action="task"]')?.click(),30);
  });
}

function openTodayDefault(){
  if(didOpenToday||!$('section-today')||$('appView')?.classList.contains('hidden'))return;
  didOpenToday=true;go('today');setTimeout(()=>renderFocus(),100);
}

function watchUi(){
  const main=document.querySelector('.main');if(!main||focusObserver)return;
  focusObserver=new MutationObserver(()=>{
    clearTimeout(focusRenderTimer);
    focusRenderTimer=setTimeout(()=>{createSimpleNav();createFocusCard();syncSimpleNav();trimTodayNoise();openTodayDefault()},90);
  });
  focusObserver.observe(main,{subtree:true,childList:true,attributes:true,attributeFilter:['class']});
}

function setup(){
  injectCss();createModuleDrawer();wireQuickTaskBridge();
  const timer=setInterval(()=>{
    if($('section-today')&&document.querySelector('.sidebar-top')){
      clearInterval(timer);createSimpleNav();createFocusCard();watchUi();openTodayDefault();renderFocus();
      setInterval(()=>{if(document.visibilityState==='visible')renderFocus()},60000);
    }
  },80);
  setTimeout(()=>clearInterval(timer),10000);
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup);else setup();
