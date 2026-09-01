const $=id=>document.getElementById(id);
const $$=s=>[...document.querySelectorAll(s)];
const digits=v=>String(v||'').replace(/\D/g,'');
const money=text=>Number(String(text||'').replace(/[^\d,-]/g,'').replace(/\./g,'').replace(',','.'))||0;

function dedupe(){
  for(const sel of ['[data-sale-v8-logistics]','[data-sale-v8-entry]']){
    const rows=$$(sel);rows.slice(1).forEach(x=>x.remove());
  }
  const item=$('saleItems')?.closest('.panel');
  item?.querySelector('.section-title b')?.replaceChildren(document.createTextNode('03'));
}

function state(){
  return [
    {label:'Cliente identificado',done:Boolean($('saleCustomer')?.value.trim()),target:'saleCustomer'},
    {label:'WhatsApp confirmado',done:digits($('salePhone')?.value).length>=10,target:'salePhone'},
    {label:'Produto e valor lançados',done:money($('saleTotal')?.textContent)>0,target:'saleItems'},
    {label:'Prazo e recebimento definidos',done:Boolean($('saleDueDate')?.value),target:'saleDueDate'},
    {label:'Pagamento definido',done:Boolean($('salePayment')?.value)&&Boolean($('salePaymentCondition')?.value),target:'salePayment'}
  ];
}

function mount(){
  dedupe();
  const checkout=document.querySelector('#section-sale .checkout-card');
  if(!checkout||$('saleChecklist'))return;
  checkout.insertAdjacentHTML('beforeend',`<div id="saleChecklist" class="sale-checklist"><div class="sale-checklist-head"><strong>Checklist da venda</strong><span id="saleChecklistCount" class="sale-checklist-count">0/5</span></div><div id="saleChecklistList" class="sale-checklist-list"></div><div class="sale-check-progress"><i id="saleChecklistBar"></i></div></div>`);
  render();
}

function render(){
  if(!$('saleChecklistList'))return;
  const rows=state(),done=rows.filter(x=>x.done).length;
  $('saleChecklistCount').textContent=`${done}/${rows.length}`;
  $('saleChecklistBar').style.width=`${done/rows.length*100}%`;
  $('saleChecklistList').innerHTML=rows.map(x=>`<button type="button" class="sale-check-item ${x.done?'done':''}" data-check-target="${x.target}"><span class="check-dot">${x.done?'✓':''}</span><span>${x.label}</span></button>`).join('');
  $$('[data-check-target]').forEach(b=>b.onclick=()=>{const el=$(b.dataset.checkTarget);el?.scrollIntoView({behavior:'smooth',block:'center'});el?.focus?.()});
}

function css(){
  if(document.querySelector('link[data-sale-check-v10]'))return;
  const l=document.createElement('link');l.rel='stylesheet';l.href='./sale-checklist-v10.css?build=20260901-1200';l.dataset.saleCheckV10='1';document.head.appendChild(l);
}

function setup(){
  css();
  const timer=setInterval(()=>{mount();render()},300);
  setTimeout(()=>clearInterval(timer),12000);
  document.addEventListener('input',e=>{if(e.target.closest('#section-sale'))setTimeout(()=>{dedupe();render()},0)});
  document.addEventListener('change',e=>{if(e.target.closest('#section-sale'))setTimeout(()=>{dedupe();render()},0)});
}

if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup);else setup();
