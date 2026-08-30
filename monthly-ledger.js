import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const supabase=createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
const $=id=>document.getElementById(id);
const brl=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v||0));
const dateBR=v=>new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'America/Sao_Paulo'}).format(new Date(v));
const timeBR=v=>new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit',timeZone:'America/Sao_Paulo'}).format(new Date(v));
const monthNow=()=>new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',timeZone:'America/Sao_Paulo'}).format(new Date()).slice(0,7);
let activeFilter='all';
let currentRows=[];

function esc(s=''){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function bounds(ym){
  const [y,m]=ym.split('-').map(Number),last=new Date(y,m,0).getDate(),mm=String(m).padStart(2,'0');
  return{start:`${y}-${mm}-01T00:00:00-03:00`,end:`${y}-${mm}-${String(last).padStart(2,'0')}T23:59:59-03:00`};
}
async function user(){const{data}=await supabase.auth.getSession();return data?.session?.user||null}

function addCss(){
 if($('monthlyLedgerCss'))return;
 const s=document.createElement('style');s.id='monthlyLedgerCss';s.textContent=`
 #section-history>.panel{display:none!important}.ledger-shell{display:grid;gap:14px}.ledger-toolbar{display:flex;align-items:center;justify-content:space-between;gap:14px;background:#fff;border:1px solid #e2e8f0;border-radius:17px;padding:16px 18px;box-shadow:0 10px 30px rgba(18,37,68,.055)}.ledger-toolbar-left{display:flex;align-items:center;gap:13px}.ledger-toolbar h3{font-size:18px;margin:3px 0 0}.ledger-toolbar .ey{font-size:9px;font-weight:800;letter-spacing:.14em;color:#8492a6}.ledger-month{height:42px;border:1px solid #dce4ee;border-radius:11px;padding:0 12px;font:600 13px Manrope,Arial;background:#fff;color:#152238}.ledger-actions{display:flex;gap:8px;flex-wrap:wrap}.ledger-btn{border:0;border-radius:11px;padding:11px 15px;font:800 12px Manrope,Arial;cursor:pointer}.ledger-btn.sale{background:#0768e8;color:#fff}.ledger-btn.in{background:#eaf8f1;color:#08794c}.ledger-btn.out{background:#fff0f0;color:#c33e3e}.ledger-summary{display:grid;grid-template-columns:repeat(3,1fr);background:#0d192d;border-radius:17px;overflow:hidden;color:#fff}.ledger-summary>div{padding:17px 20px;border-right:1px solid rgba(255,255,255,.1)}.ledger-summary>div:last-child{border-right:0}.ledger-summary span{display:block;color:#8fa0b6;font-size:9px;font-weight:800;letter-spacing:.04em}.ledger-summary strong{display:block;font-size:24px;margin:6px 0 2px}.ledger-summary small{color:#8292a8;font-size:9px}.ledger-summary .in strong{color:#59d7a1}.ledger-summary .out strong{color:#ff7a7a}.ledger-summary .neg strong{color:#ff7474}.ledger-summary .pos strong{color:#dbea19}.ledger-card{background:#fff;border:1px solid #e2e8f0;border-radius:17px;box-shadow:0 10px 30px rgba(18,37,68,.055);overflow:hidden}.ledger-card-head{padding:15px 18px;border-bottom:1px solid #edf1f5;display:flex;align-items:center;justify-content:space-between;gap:14px}.ledger-filters{display:flex;gap:6px;flex-wrap:wrap}.ledger-filter{border:1px solid #e1e7ef;background:#fff;color:#66758a;border-radius:999px;padding:7px 11px;font:700 10px Manrope,Arial;cursor:pointer}.ledger-filter.active{background:#14233b;border-color:#14233b;color:#fff}.ledger-count{font-size:10px;color:#8b97a8}.ledger-list{display:grid}.ledger-row{display:grid;grid-template-columns:110px 120px minmax(180px,1.5fr) minmax(140px,1fr) 135px 56px;align-items:center;gap:14px;padding:14px 18px;border-bottom:1px solid #edf1f5}.ledger-row:last-child{border-bottom:0}.ledger-date strong,.ledger-main strong{display:block;font-size:11px;color:#172236}.ledger-date small,.ledger-main small,.ledger-cat{font-size:9px;color:#8b97a8}.ledger-kind{display:inline-flex;align-items:center;justify-content:center;padding:6px 9px;border-radius:999px;font-size:9px;font-weight:800;width:max-content}.ledger-kind.sale{background:#eaf2ff;color:#075fce}.ledger-kind.in{background:#eaf8f1;color:#08794c}.ledger-kind.out{background:#fff0f0;color:#c43e3e}.ledger-value{text-align:right;font-size:13px;font-weight:800}.ledger-value.in{color:#078452}.ledger-value.out{color:#cb4040}.ledger-delete{border:0;background:#f4f6f9;color:#8996a8;border-radius:8px;width:32px;height:32px;cursor:pointer;font-size:14px}.ledger-empty{padding:32px;text-align:center;color:#8b97a8;font-size:11px}.ledger-modal-backdrop{position:fixed;inset:0;background:rgba(8,18,34,.52);display:grid;place-items:center;z-index:9999;padding:20px}.ledger-modal{width:min(520px,100%);background:#fff;border-radius:18px;box-shadow:0 30px 80px rgba(0,0,0,.25);overflow:hidden}.ledger-modal-head{padding:18px 20px 13px;border-bottom:1px solid #edf1f5;display:flex;align-items:flex-start;justify-content:space-between}.ledger-modal-head h3{margin:4px 0 0;font-size:19px}.ledger-modal-head span{font-size:9px;font-weight:800;letter-spacing:.13em;color:#8492a6}.ledger-close{border:0;background:#f3f5f8;border-radius:9px;width:32px;height:32px;cursor:pointer}.ledger-form{padding:18px 20px 20px;display:grid;gap:12px}.ledger-form label{display:grid;gap:5px;font-size:10px;font-weight:700;color:#536278}.ledger-form input,.ledger-form select{height:42px;border:1px solid #dbe3ed;border-radius:10px;padding:0 11px;font:600 12px Manrope,Arial;color:#172236;background:#fff}.ledger-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.ledger-submit{height:44px;border:0;border-radius:11px;font:800 12px Manrope,Arial;cursor:pointer;background:#0b67e5;color:#fff;margin-top:3px}.ledger-tip{font-size:9px;line-height:1.45;color:#8895a8;background:#f6f8fb;border-radius:10px;padding:9px 11px}
 @media(max-width:900px){.ledger-row{grid-template-columns:90px 100px 1fr 125px 46px}.ledger-cat{display:none}.ledger-toolbar{align-items:flex-start;flex-direction:column}.ledger-actions{width:100%}.ledger-actions .ledger-btn{flex:1}.ledger-summary{grid-template-columns:1fr 1fr 1fr}}
 @media(max-width:650px){.ledger-shell{gap:10px}.ledger-toolbar{padding:14px}.ledger-toolbar-left{width:100%;justify-content:space-between}.ledger-month{max-width:155px}.ledger-actions{display:grid;grid-template-columns:1fr 1fr 1fr}.ledger-btn{padding:10px 7px;font-size:10px}.ledger-summary{grid-template-columns:1fr}.ledger-summary>div{border-right:0;border-bottom:1px solid rgba(255,255,255,.1);padding:13px 15px}.ledger-summary strong{font-size:20px}.ledger-card-head{display:block}.ledger-count{display:block;margin-top:8px}.ledger-list{padding:7px}.ledger-row{grid-template-columns:1fr auto;gap:7px 10px;border:1px solid #edf1f5;border-radius:12px;margin-bottom:7px;padding:12px}.ledger-date{grid-column:1}.ledger-kind{grid-column:2;grid-row:1}.ledger-main{grid-column:1/-1}.ledger-cat{display:block;grid-column:1}.ledger-value{grid-column:2;grid-row:3;text-align:right}.ledger-delete{grid-column:2;grid-row:2;justify-self:end}.ledger-form-grid{grid-template-columns:1fr}.ledger-modal-backdrop{align-items:end;padding:0}.ledger-modal{border-radius:18px 18px 0 0}}
 `;document.head.appendChild(s);
}

function ensureUi(){
 addCss();const sec=$('section-history');if(!sec)return null;
 const nav=document.querySelector('.nav-item[data-section="history"]');if(nav)nav.textContent='Lançamentos';
 let root=$('monthlyLedger');if(root)return root;
 root=document.createElement('div');root.id='monthlyLedger';root.className='ledger-shell';root.innerHTML=`
  <div class="ledger-toolbar">
   <div class="ledger-toolbar-left"><div><div class="ey">FINANCEIRO</div><h3>Lançamentos do mês</h3></div><input id="ledgerMonth" class="ledger-month" type="month" value="${monthNow()}"></div>
   <div class="ledger-actions"><button id="ledgerSaleBtn" class="ledger-btn sale">+ Venda</button><button id="ledgerInBtn" class="ledger-btn in">+ Entrada</button><button id="ledgerOutBtn" class="ledger-btn out">+ Saída</button></div>
  </div>
  <div class="ledger-summary"><div class="in"><span>ENTRADAS</span><strong id="ledgerInTotal">R$ 0,00</strong><small>vendas + entradas manuais</small></div><div class="out"><span>SAÍDAS</span><strong id="ledgerOutTotal">R$ 0,00</strong><small>despesas, insumos e investimentos pagos</small></div><div id="ledgerBalanceCard"><span>SALDO DO MÊS</span><strong id="ledgerBalance">R$ 0,00</strong><small>entradas menos saídas</small></div></div>
  <div class="ledger-card"><div class="ledger-card-head"><div class="ledger-filters"><button class="ledger-filter active" data-filter="all">Todos</button><button class="ledger-filter" data-filter="sale">Vendas</button><button class="ledger-filter" data-filter="in">Entradas</button><button class="ledger-filter" data-filter="out">Saídas</button></div><span id="ledgerCount" class="ledger-count"></span></div><div id="ledgerList" class="ledger-list"></div></div>`;
 sec.prepend(root);
 $('ledgerMonth').onchange=refresh;
 root.querySelectorAll('.ledger-filter').forEach(b=>b.onclick=()=>{activeFilter=b.dataset.filter;root.querySelectorAll('.ledger-filter').forEach(x=>x.classList.toggle('active',x===b));renderRows()});
 $('ledgerSaleBtn').onclick=()=>document.querySelector('.nav-item[data-section="sale"]')?.click();
 $('ledgerInBtn').onclick=()=>openMovement('entrada');
 $('ledgerOutBtn').onclick=()=>openMovement('saida');
 return root;
}

function categoryOptions(type){
 if(type==='entrada')return[
  ['Recebimento complementar','operational'],['Sinal / entrada de cliente','operational'],['Aporte dos sócios','other'],['Reembolso','other'],['Outra entrada','other']
 ];
 return[
  ['Papel / matéria-prima','stock'],['Tinta / insumo','stock'],['Vinil / adesivo','stock'],['Laminação / acabamento','stock'],['Energia','operational'],['Internet / telefone','operational'],['Contador / administrativo','operational'],['Imposto / taxa','operational'],['Frete / entrega','operational'],['Manutenção','operational'],['Parcela de máquina','investment'],['Investimento / equipamento','investment'],['Retirada','other'],['Outra saída','other']
 ];
}
function openMovement(type){
 document.querySelector('.ledger-modal-backdrop')?.remove();
 const isIn=type==='entrada',today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());
 const back=document.createElement('div');back.className='ledger-modal-backdrop';back.innerHTML=`<div class="ledger-modal"><div class="ledger-modal-head"><div><span>${isIn?'NOVA ENTRADA':'NOVA SAÍDA'}</span><h3>${isIn?'Registrar dinheiro que entrou':'Registrar dinheiro que saiu'}</h3></div><button class="ledger-close">×</button></div><form class="ledger-form" id="ledgerMovementForm"><div class="ledger-form-grid"><label>Data<input id="lmDate" type="date" value="${today}" required></label><label>Valor (R$)<input id="lmAmount" type="number" min="0.01" step="0.01" required placeholder="0,00"></label></div><label>Categoria<select id="lmCategory">${categoryOptions(type).map(([n,nature])=>`<option value="${esc(n)}" data-nature="${nature}">${esc(n)}</option>`).join('')}</select></label><label>Descrição<input id="lmDescription" required placeholder="Ex.: 2 resmas de papel A3"></label><div class="ledger-tip">${isIn?'Use entrada manual para valores que não já estejam contabilizados como venda, evitando duplicar o caixa.':'A saída entra imediatamente no caixa e nos gráficos do mês selecionado.'}</div><button class="ledger-submit" type="submit">${isIn?'Registrar entrada':'Registrar saída'}</button></form></div>`;
 document.body.appendChild(back);back.querySelector('.ledger-close').onclick=()=>back.remove();back.onclick=e=>{if(e.target===back)back.remove()};
 $('ledgerMovementForm').onsubmit=async e=>{e.preventDefault();const u=await user();if(!u)return;const sel=$('lmCategory'),nature=sel.options[sel.selectedIndex]?.dataset.nature||'other';const date=$('lmDate').value;const payload={user_id:u.id,type,nature,category:sel.value,description:$('lmDescription').value.trim(),amount:Number($('lmAmount').value||0),created_at:`${date}T12:00:00-03:00`};const{error}=await supabase.from('cash_movements').insert(payload);if(error){alert('Não foi possível salvar o lançamento: '+error.message);return}back.remove();const selectedMonth=date.slice(0,7);$('ledgerMonth').value=selectedMonth;await refresh();document.dispatchEvent(new CustomEvent('ledger:changed'))};
}

async function load(){
 const u=await user();if(!u)return null;const ym=$('ledgerMonth')?.value||monthNow(),b=bounds(ym);
 const [salesR,movesR]=await Promise.all([
  supabase.from('sales').select('id,created_at,total,customer_name,seller_name,payment_method,note').eq('user_id',u.id).gte('created_at',b.start).lte('created_at',b.end).order('created_at',{ascending:false}),
  supabase.from('cash_movements').select('id,created_at,type,nature,category,description,amount').eq('user_id',u.id).gte('created_at',b.start).lte('created_at',b.end).order('created_at',{ascending:false})
 ]);
 if(salesR.error)throw salesR.error;if(movesR.error)throw movesR.error;
 const sales=(salesR.data||[]).map(s=>({id:s.id,kind:'sale',date:s.created_at,title:s.customer_name?`Venda • ${s.customer_name}`:'Venda balcão',sub:[s.seller_name,s.payment_method].filter(Boolean).join(' • ')||'Venda',category:'Venda',amount:Number(s.total||0),raw:s}));
 const moves=(movesR.data||[]).map(m=>({id:m.id,kind:m.type==='entrada'?'in':'out',date:m.created_at,title:m.description||m.category||'Movimentação',sub:m.nature==='investment'?'Investimento':m.nature==='stock'?'Insumo / estoque':m.nature==='operational'?'Operacional':'Outro',category:m.category||'Sem categoria',amount:Number(m.amount||0),raw:m}));
 currentRows=[...sales,...moves].sort((a,b)=>new Date(b.date)-new Date(a.date));return currentRows;
}
function renderRows(){
 const list=$('ledgerList');if(!list)return;const rows=activeFilter==='all'?currentRows:currentRows.filter(r=>r.kind===activeFilter);$('ledgerCount').textContent=`${rows.length} lançamento${rows.length===1?'':'s'}`;
 if(!rows.length){list.innerHTML='<div class="ledger-empty">Nenhum lançamento neste filtro.</div>';return}
 list.innerHTML=rows.map(r=>`<div class="ledger-row"><div class="ledger-date"><strong>${dateBR(r.date)}</strong><small>${timeBR(r.date)}</small></div><span class="ledger-kind ${r.kind}">${r.kind==='sale'?'VENDA':r.kind==='in'?'ENTRADA':'SAÍDA'}</span><div class="ledger-main"><strong>${esc(r.title)}</strong><small>${esc(r.sub||'')}</small></div><div class="ledger-cat">${esc(r.category)}</div><div class="ledger-value ${r.kind==='out'?'out':'in'}">${r.kind==='out'?'-':'+'}${brl(r.amount)}</div>${r.kind==='sale'?'<span></span>':`<button class="ledger-delete" data-id="${r.id}" title="Excluir lançamento">×</button>`}</div>`).join('');
 list.querySelectorAll('.ledger-delete').forEach(b=>b.onclick=async()=>{if(!confirm('Excluir este lançamento financeiro?'))return;const{error}=await supabase.from('cash_movements').delete().eq('id',b.dataset.id);if(error)return alert('Não foi possível excluir: '+error.message);await refresh();document.dispatchEvent(new CustomEvent('ledger:changed'))});
}
function renderTotals(){const sales=currentRows.filter(r=>r.kind==='sale').reduce((a,r)=>a+r.amount,0),manualIn=currentRows.filter(r=>r.kind==='in').reduce((a,r)=>a+r.amount,0),out=currentRows.filter(r=>r.kind==='out').reduce((a,r)=>a+r.amount,0),input=sales+manualIn,balance=input-out;$('ledgerInTotal').textContent=brl(input);$('ledgerOutTotal').textContent=brl(out);$('ledgerBalance').textContent=brl(balance);const c=$('ledgerBalanceCard');c.classList.toggle('neg',balance<0);c.classList.toggle('pos',balance>=0)}
async function refresh(){ensureUi();try{await load();renderTotals();renderRows()}catch(e){console.error('ledger',e);$('ledgerList').innerHTML='<div class="ledger-empty">Não foi possível carregar os lançamentos.</div>'}}

function activate(){ensureUi();const page=$('pageTitle');if(page)page.textContent='Lançamentos';setTimeout(refresh,80)}
document.addEventListener('click',e=>{const n=e.target.closest?.('.nav-item[data-section="history"]');if(n)activate()});
document.addEventListener('ledger:changed',()=>setTimeout(refresh,50));
ensureUi();if($('section-history')?.classList.contains('active'))activate();
