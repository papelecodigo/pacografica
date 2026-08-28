import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const $ = id => document.getElementById(id);
const brl = v => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v||0));
const localDate = () => new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());

function monthBounds(){
  const now = new Date();
  const year = Number(new Intl.DateTimeFormat('en',{timeZone:'America/Sao_Paulo',year:'numeric'}).format(now));
  const month = Number(new Intl.DateTimeFormat('en',{timeZone:'America/Sao_Paulo',month:'numeric'}).format(now));
  const last = new Date(year,month,0).getDate();
  const mm = String(month).padStart(2,'0');
  return {
    start:`${year}-${mm}-01T00:00:00-03:00`,
    end:`${year}-${mm}-${String(last).padStart(2,'0')}T23:59:59-03:00`
  };
}

function installStyles(){
  if($('financeV4Styles')) return;
  const style=document.createElement('style');
  style.id='financeV4Styles';
  style.textContent=`
    .finance-v4-bridge{display:grid;grid-template-columns:repeat(4,1fr);gap:0;margin-top:16px;background:#fff;border:1px solid #e3e9f1;border-radius:16px;overflow:hidden;box-shadow:0 10px 30px rgba(18,37,68,.07)}
    .finance-v4-card{padding:18px 20px;border-right:1px solid #e3e9f1;min-width:0}.finance-v4-card:last-child{border-right:0}.finance-v4-card span{display:block;color:#69778c;font-size:11px;font-weight:700}.finance-v4-card strong{display:block;font-size:21px;margin:9px 0 4px;white-space:nowrap}.finance-v4-card small{display:block;color:#9aa5b4;font-size:10px;line-height:1.4}
    .finance-v4-help{display:grid;gap:6px;padding:12px;border-radius:10px;background:#f6f8fb;border:1px solid #e3e9f1;font-size:10px;color:#738096}.finance-v4-help b{font-size:11px;color:#172033}.finance-v4-help strong{color:#4d596d}
    .finance-v4-note{display:block;margin-top:10px;color:#738096;font-size:10px;line-height:1.45}.finance-v4-pay{margin-left:6px;background:#edf4ff!important;color:#0864e8!important;border-color:#d8e7fb!important}
    .finance-v4-costhelp{display:block;margin-top:5px;color:#8a97a8;font-size:9px;font-weight:500;line-height:1.35}
    @media(max-width:1200px){.finance-v4-bridge{grid-template-columns:repeat(2,1fr)}}
    @media(max-width:650px){.finance-v4-bridge{grid-template-columns:1fr 1fr}.finance-v4-card{padding:14px}.finance-v4-card strong{font-size:17px}}
  `;
  document.head.appendChild(style);
}

function ensureFinanceUI(){
  installStyles();
  const nature=$('movementNature');
  if(nature && !nature.querySelector('option[value="stock"]')){
    const option=document.createElement('option');
    option.value='stock';
    option.textContent='Insumo / estoque';
    const investment=nature.querySelector('option[value="investment"]');
    nature.insertBefore(option,investment||null);
    const labels={operational:'Despesa operacional',investment:'Investimento / máquina',other:'Outro'};
    [...nature.options].forEach(o=>{ if(labels[o.value]) o.textContent=labels[o.value]; });
  }

  if(nature && !document.querySelector('.finance-v4-help')){
    const help=document.createElement('div');
    help.className='finance-v4-help';
    help.innerHTML='<b>Como classificar?</b><span><strong>Insumo / estoque:</strong> papel, tinta, vinil, laminação e materiais comprados.</span><span><strong>Operacional:</strong> energia, internet, contador e despesas do mês.</span><span><strong>Investimento:</strong> parcelas de máquinas e equipamentos.</span>';
    nature.closest('label')?.after(help);
  }

  const serviceCost=$('serviceCost');
  if(serviceCost && !serviceCost.parentElement.querySelector('.finance-v4-costhelp')){
    const help=document.createElement('small');
    help.className='finance-v4-costhelp';
    help.textContent='Use aqui o custo consumido neste serviço: papel, tinta, acabamento, terceirização etc.';
    serviceCost.after(help);
  }

  const projection=document.querySelector('.projection-band');
  if(projection && !document.querySelector('.finance-v4-bridge')){
    const bridge=document.createElement('div');
    bridge.className='finance-v4-bridge';
    bridge.innerHTML=`
      <div class="finance-v4-card"><span>Custo direto consumido</span><strong id="v4DirectCost">R$ 0,00</strong><small>material efetivamente usado nas vendas</small></div>
      <div class="finance-v4-card"><span>Compras de insumos</span><strong id="v4StockOut">R$ 0,00</strong><small>papel, tinta e estoque comprados no mês</small></div>
      <div class="finance-v4-card"><span>Despesas operacionais</span><strong id="v4OperatingOut">R$ 0,00</strong><small>energia, internet, contador etc.</small></div>
      <div class="finance-v4-card"><span>Investimentos pagos</span><strong id="v4InvestmentOut">R$ 0,00</strong><small>parcelas de máquinas efetivamente pagas</small></div>`;
    projection.after(bridge);
  }
}

async function sessionUser(){
  const {data}=await supabase.auth.getSession();
  return data?.session?.user||null;
}

async function refreshFinanceBridge(){
  ensureFinanceUI();
  const user=await sessionUser();
  if(!user || !$('v4DirectCost')) return;
  const b=monthBounds();
  const [{data:sales},{data:movements}]=await Promise.all([
    supabase.from('sales').select('total,sale_items(unit_cost,quantity)').eq('user_id',user.id).gte('created_at',b.start).lte('created_at',b.end),
    supabase.from('cash_movements').select('type,nature,amount').eq('user_id',user.id).gte('created_at',b.start).lte('created_at',b.end)
  ]);
  const revenue=(sales||[]).reduce((a,s)=>a+Number(s.total||0),0);
  const direct=(sales||[]).reduce((a,s)=>a+(s.sale_items||[]).reduce((b,i)=>b+Number(i.unit_cost||0)*Number(i.quantity||0),0),0);
  const list=movements||[];
  const operational=list.filter(m=>m.type==='saida'&&(m.nature||'operational')==='operational').reduce((a,m)=>a+Number(m.amount||0),0);
  const stock=list.filter(m=>m.type==='saida'&&m.nature==='stock').reduce((a,m)=>a+Number(m.amount||0),0);
  const investment=list.filter(m=>m.type==='saida'&&m.nature==='investment').reduce((a,m)=>a+Number(m.amount||0),0);
  const other=list.filter(m=>m.type==='saida'&&m.nature==='other').reduce((a,m)=>a+Number(m.amount||0),0);
  const extraIn=list.filter(m=>m.type==='entrada').reduce((a,m)=>a+Number(m.amount||0),0);
  $('v4DirectCost').textContent=brl(direct);
  $('v4StockOut').textContent=brl(stock);
  $('v4OperatingOut').textContent=brl(operational);
  $('v4InvestmentOut').textContent=brl(investment);
  if($('kpiCashFlow')) $('kpiCashFlow').textContent=brl(revenue+extraIn-operational-stock-investment-other);
  const cashSmall=$('kpiCashFlow')?.parentElement?.querySelector('small');
  if(cashSmall) cashSmall.textContent='após despesas, insumos e investimentos';
}

function enhanceInvestmentCards(){
  document.querySelectorAll('.investment-card').forEach(card=>{
    const edit=card.querySelector('.edit-investment');
    if(!edit || card.querySelector('.finance-v4-pay')) return;
    const id=edit.dataset.id;
    const btn=document.createElement('button');
    btn.type='button';
    btn.className='small-btn finance-v4-pay';
    btn.dataset.id=id;
    btn.textContent='Registrar parcela paga';
    edit.after(btn);
    const note=document.createElement('small');
    note.className='finance-v4-note';
    note.textContent='Cadastrar a máquina não reduz o caixa. O caixa só muda quando você registra uma parcela paga.';
    card.appendChild(note);
  });
}

async function payInstallment(id,button){
  const user=await sessionUser();
  if(!user) return alert('Sua sessão expirou. Entre novamente.');
  const {data:i,error}=await supabase.from('investments').select('*').eq('id',id).eq('user_id',user.id).single();
  if(error||!i) return alert('Não consegui localizar este investimento.');
  const total=Math.max(1,Number(i.total_installments||1));
  const paid=Number(i.paid_installments||0);
  if(paid>=total) return alert('Este investimento já está quitado.');
  const amount=Number(i.installment_value||0);
  if(amount<=0) return alert('Informe o valor da parcela no investimento.');
  const date=prompt('Data do pagamento da parcela (AAAA-MM-DD):',localDate());
  if(!date) return;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)) return alert('Use a data no formato AAAA-MM-DD. Ex.: 2026-08-28');
  if(!confirm(`Registrar parcela ${paid+1}/${total} de ${i.name} por ${brl(amount)}?`)) return;
  button.disabled=true;button.textContent='Registrando...';
  const {error:movError}=await supabase.from('cash_movements').insert({
    user_id:user.id,
    type:'saida',
    nature:'investment',
    category:'Parcela de equipamento',
    description:`Parcela ${paid+1}/${total} - ${i.name}`,
    amount,
    created_at:`${date}T12:00:00-03:00`
  });
  if(movError){button.disabled=false;button.textContent='Registrar parcela paga';return alert('Erro ao registrar a saída da parcela.');}
  const next=paid+1;
  const {error:invError}=await supabase.from('investments').update({paid_installments:next,active:next<total,updated_at:new Date().toISOString()}).eq('id',id).eq('user_id',user.id);
  if(invError) return alert('A saída foi registrada, mas o contador de parcelas não foi atualizado.');
  location.reload();
}

document.addEventListener('click',e=>{
  const pay=e.target.closest?.('.finance-v4-pay');
  if(pay){e.preventDefault();payInstallment(pay.dataset.id,pay);return;}
  const nav=e.target.closest?.('.nav-item');
  if(nav?.dataset.section==='investments') setTimeout(enhanceInvestmentCards,250);
  if(nav?.dataset.section==='dashboard') setTimeout(refreshFinanceBridge,250);
});

$('movementForm')?.addEventListener('submit',()=>setTimeout(refreshFinanceBridge,1200));

ensureFinanceUI();
setTimeout(()=>{ensureFinanceUI();enhanceInvestmentCards();refreshFinanceBridge();},500);
setTimeout(()=>{ensureFinanceUI();enhanceInvestmentCards();refreshFinanceBridge();},1600);
setTimeout(()=>{ensureFinanceUI();enhanceInvestmentCards();refreshFinanceBridge();},3200);
