import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Chart from 'https://esm.sh/chart.js@4.4.7/auto';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const supabase=createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
const $=id=>document.getElementById(id);
const brl=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v||0));
const pct=v=>`${Number(v||0).toFixed(1).replace('.',',')}%`;
let safetyChart=null;

function monthBounds(){
  const now=new Date();
  const year=Number(new Intl.DateTimeFormat('en',{timeZone:'America/Sao_Paulo',year:'numeric'}).format(now));
  const month=Number(new Intl.DateTimeFormat('en',{timeZone:'America/Sao_Paulo',month:'numeric'}).format(now));
  const last=new Date(year,month,0).getDate();
  const mm=String(month).padStart(2,'0');
  return{year,month,start:`${year}-${mm}-01T00:00:00-03:00`,end:`${year}-${mm}-${String(last).padStart(2,'0')}T23:59:59-03:00`};
}
function businessDays(){
  const{year,month}=monthBounds(),last=new Date(year,month,0).getDate(),today=new Date();let total=0,elapsed=0;
  for(let d=1;d<=last;d++){const dt=new Date(year,month-1,d);if(dt.getDay()!==0){total++;if(dt<=today)elapsed++;}}
  return{total,elapsed:Math.max(1,elapsed)};
}
function projection(revenue){const{total,elapsed}=businessDays();return revenue/elapsed*total;}
async function user(){const{data}=await supabase.auth.getSession();return data?.session?.user||null;}

function installStyles(){
  if($('financeInsightsStyle'))return;
  const s=document.createElement('style');s.id='financeInsightsStyle';s.textContent=`
  .finance-insights{margin-top:16px;display:grid;gap:16px}.money-story{background:#fff;border:1px solid #e3e9f1;border-radius:16px;overflow:hidden;box-shadow:0 10px 30px rgba(18,37,68,.07)}
  .money-story-head{padding:18px 20px 12px}.money-story-head span{font-size:9px;letter-spacing:.13em;font-weight:800;color:#8b98aa}.money-story-head h3{margin:5px 0 4px;font-size:17px}.money-story-head p{margin:0;color:#738096;font-size:11px}
  .money-flow{display:grid;grid-template-columns:repeat(6,1fr);border-top:1px solid #e7ecf3}.money-step{padding:16px 17px;border-right:1px solid #e7ecf3}.money-step:last-child{border-right:0}.money-step span{display:block;font-size:10px;color:#718096;font-weight:700}.money-step strong{display:block;font-size:18px;margin:7px 0 3px}.money-step small{font-size:9px;color:#9aa5b4;line-height:1.35}.money-step.good strong{color:#0b9a61}.money-step.bad strong{color:#d74747}
  .health-grid{display:grid;grid-template-columns:1.2fr .8fr;gap:16px}.health-panel{background:#fff;border:1px solid #e3e9f1;border-radius:16px;padding:20px;box-shadow:0 10px 30px rgba(18,37,68,.07)}.health-panel h3{margin:3px 0 4px;font-size:17px}.health-panel>p{margin:0 0 14px;color:#738096;font-size:11px}.health-chart{height:250px}
  .safety-cards{display:grid;gap:9px}.safety-card{padding:13px 14px;border:1px solid #e7ecf3;border-radius:12px;background:#fafcff}.safety-card span{display:block;color:#738096;font-size:10px}.safety-card strong{display:block;font-size:19px;margin:5px 0 2px}.safety-card small{font-size:9px;color:#97a2b2;line-height:1.35}.safety-card.good{border-color:#ccebdc;background:#f5fcf8}.safety-card.good strong{color:#0b9a61}.safety-card.warn{border-color:#f0dfad;background:#fffaf0}.safety-card.warn strong{color:#b77900}.safety-card.bad{border-color:#f2caca;background:#fff7f7}.safety-card.bad strong{color:#c53b3b}
  .target-track{height:8px;background:#edf1f5;border-radius:99px;overflow:hidden;margin-top:8px}.target-track i{display:block;height:100%;background:#0864e8;border-radius:99px}
  .investment-summary{display:grid;grid-template-columns:repeat(3,1fr);gap:0;margin-bottom:16px;background:#0d192d;color:#fff;border-radius:16px;overflow:hidden}.investment-summary>div{padding:18px 20px;border-right:1px solid rgba(255,255,255,.1)}.investment-summary>div:last-child{border-right:0}.investment-summary span{display:block;color:#91a3b8;font-size:10px;font-weight:700}.investment-summary strong{display:block;font-size:22px;margin:6px 0 3px}.investment-summary small{color:#8193a8;font-size:9px}.investment-summary .debt strong{color:#dbea19}
  .finance-helper{margin:0 0 12px;padding:12px 14px;border:1px solid #dfe7f1;border-radius:11px;background:#f7f9fc;color:#69778c;font-size:10px;line-height:1.55}.finance-helper b{color:#172033}.finance-helper strong{color:#4d596d}
  .insight-pill{display:inline-flex;align-items:center;padding:4px 8px;border-radius:99px;background:#edf4ff;color:#0864e8;font-size:9px;font-weight:800;margin-top:7px}
  @media(max-width:1200px){.money-flow{grid-template-columns:repeat(3,1fr)}.money-step:nth-child(3){border-right:0}.health-grid{grid-template-columns:1fr}}
  @media(max-width:650px){.money-flow{grid-template-columns:1fr 1fr}.money-step:nth-child(3){border-right:1px solid #e7ecf3}.health-panel{padding:15px}.investment-summary{grid-template-columns:1fr}.investment-summary>div{border-right:0;border-bottom:1px solid rgba(255,255,255,.1)}.health-chart{height:220px}}
  `;document.head.appendChild(s);
}

function renameKpis(){
  const map=[
    ['kpiRevenue','Faturamento','quanto a gráfica vendeu no mês'],
    ['kpiGrossProfit','Lucro da produção','vendas menos custo dos serviços'],
    ['kpiOperatingProfit','Lucro da operação','depois de despesas e impostos'],
    ['kpiCashFlow','Caixa do mês','o que realmente entrou menos tudo que saiu'],
    ['kpiTicket','Ticket médio','valor médio de cada venda'],
    ['kpiTarget','Meta do mês','objetivo de faturamento']
  ];
  map.forEach(([id,title,desc])=>{const el=$(id);if(!el)return;const card=el.closest('.kpi');const span=card?.querySelector('span'),small=card?.querySelector('small');if(span)span.textContent=title;if(small&&id!=='kpiRevenue'&&id!=='kpiGrossProfit'&&id!=='kpiTarget')small.textContent=desc;});
}

function ensureStockOption(){
  const nature=$('movementNature');if(!nature)return;
  if(!nature.querySelector('option[value="stock"]')){const o=document.createElement('option');o.value='stock';o.textContent='Insumo / estoque';nature.insertBefore(o,nature.querySelector('option[value="investment"]')||null);}
  const names={operational:'Despesa operacional',investment:'Investimento / máquina',other:'Outro'};[...nature.options].forEach(o=>{if(names[o.value])o.textContent=names[o.value]});
  const form=$('movementForm');if(form&&!form.querySelector('.finance-helper')){const d=document.createElement('div');d.className='finance-helper';d.innerHTML='<b>Onde lançar cada coisa?</b><br><strong>Papel, tinta, vinil, laminação:</strong> Insumo / estoque.<br><strong>Energia, internet, contador:</strong> Despesa operacional.<br><strong>Parcela de impressora/máquina:</strong> Investimento / máquina.';form.prepend(d);}
  const cost=$('serviceCost');if(cost&&!cost.parentElement.querySelector('.insight-pill')){const s=document.createElement('span');s.className='insight-pill';s.textContent='Custo consumido nesse serviço';cost.after(s);}
}

function ensureDashboard(){
  const dash=$('section-dashboard');if(!dash)return;
  if(!dash.querySelector('.finance-insights')){
    const wrap=document.createElement('div');wrap.className='finance-insights';wrap.innerHTML=`
      <section class="money-story">
        <div class="money-story-head"><span>LEITURA RÁPIDA</span><h3>Para onde foi o dinheiro?</h3><p>Separei lucro da operação e dinheiro em caixa para não misturar máquinas com produção.</p></div>
        <div class="money-flow">
          <div class="money-step"><span>1. Vendeu</span><strong id="insRevenue">R$ 0,00</strong><small>faturamento do mês</small></div>
          <div class="money-step"><span>2. Produziu</span><strong id="insDirect">R$ 0,00</strong><small>papel, tinta e materiais consumidos</small></div>
          <div class="money-step"><span>3. Operação</span><strong id="insOperatingCost">R$ 0,00</strong><small>despesas + impostos</small></div>
          <div class="money-step"><span>4. Lucrou</span><strong id="insOperatingProfit">R$ 0,00</strong><small>lucro da atividade da gráfica</small></div>
          <div class="money-step"><span>5. Comprou / investiu</span><strong id="insCashOut">R$ 0,00</strong><small>estoque + parcelas + outras saídas</small></div>
          <div class="money-step"><span>6. Sobrou em caixa</span><strong id="insCash">R$ 0,00</strong><small>entrada real menos todas as saídas</small></div>
        </div>
      </section>
      <div class="health-grid">
        <section class="health-panel"><span class="eyebrow">PROJEÇÃO E SEGURANÇA</span><h3>Até onde o mês está seguro?</h3><p>Compara o que já faturou, o mínimo estimado para cobrir a operação e a projeção de fechamento.</p><div class="health-chart"><canvas id="safetyChart"></canvas></div></section>
        <section class="health-panel"><span class="eyebrow">INDICADORES</span><h3>Leitura sem contabilidade complicada</h3><p>Os números abaixo ajudam a saber se a operação está confortável ou apertada.</p><div class="safety-cards">
          <div class="safety-card" id="contributionCard"><span>Margem de contribuição</span><strong id="insContribution">—</strong><small>o que sobra da venda após custo direto e imposto para pagar despesas e gerar lucro</small></div>
          <div class="safety-card" id="safetyCard"><span>Margem de segurança projetada</span><strong id="insSafety">—</strong><small id="insSafetyText">Cadastre despesas operacionais para calcular.</small></div>
          <div class="safety-card"><span>Folga projetada</span><strong id="insProjectedRoom">—</strong><small>quanto a projeção fica acima do ponto de equilíbrio</small></div>
          <div class="safety-card"><span>Meta projetada</span><strong id="insTargetPct">—</strong><small id="insTargetText">Defina uma meta em Configurações.</small><div class="target-track"><i id="insTargetBar" style="width:0%"></i></div></div>
          <div class="safety-card warn"><span>Compromissos com máquinas</span><strong id="insDebt">R$ 0,00</strong><small>saldo que ainda falta pagar dos equipamentos; não é uma saída toda de uma vez</small></div>
        </div></section>
      </div>`;
    dash.appendChild(wrap);
  }
}

function ensureInvestmentSummary(){
  const sec=$('section-investments');if(!sec||sec.querySelector('.investment-summary'))return;
  const sum=document.createElement('div');sum.className='investment-summary';sum.innerHTML='<div><span>Investimento contratado</span><strong id="invContracted">R$ 0,00</strong><small>valor total das máquinas cadastradas</small></div><div><span>Já pago</span><strong id="invPaid">R$ 0,00</strong><small>parcelas já quitadas</small></div><div class="debt"><span>Ainda falta pagar</span><strong id="invDebt">R$ 0,00</strong><small>compromisso futuro; não sai todo do caixa hoje</small></div>';
  sec.prepend(sum);
}

async function metrics(){
  const u=await user();if(!u)return null;const b=monthBounds();
  const [{data:sales},{data:movements},{data:settings},{data:investments}]=await Promise.all([
    supabase.from('sales').select('total,sale_items(unit_cost,quantity)').eq('user_id',u.id).gte('created_at',b.start).lte('created_at',b.end),
    supabase.from('cash_movements').select('type,nature,amount').eq('user_id',u.id).gte('created_at',b.start).lte('created_at',b.end),
    supabase.from('company_settings').select('monthly_revenue_target,tax_rate').eq('user_id',u.id).maybeSingle(),
    supabase.from('investments').select('total_value,installment_value,total_installments,paid_installments').eq('user_id',u.id)
  ]);
  const revenue=(sales||[]).reduce((a,s)=>a+Number(s.total||0),0);
  const direct=(sales||[]).reduce((a,s)=>a+(s.sale_items||[]).reduce((b,i)=>b+Number(i.unit_cost||0)*Number(i.quantity||0),0),0);
  const rate=Number(settings?.tax_rate||0),tax=revenue*rate/100,list=movements||[];
  const op=list.filter(m=>m.type==='saida'&&(m.nature||'operational')==='operational').reduce((a,m)=>a+Number(m.amount||0),0);
  const stock=list.filter(m=>m.type==='saida'&&m.nature==='stock').reduce((a,m)=>a+Number(m.amount||0),0);
  const investOut=list.filter(m=>m.type==='saida'&&m.nature==='investment').reduce((a,m)=>a+Number(m.amount||0),0);
  const other=list.filter(m=>m.type==='saida'&&m.nature==='other').reduce((a,m)=>a+Number(m.amount||0),0);
  const extraIn=list.filter(m=>m.type==='entrada').reduce((a,m)=>a+Number(m.amount||0),0);
  const gross=revenue-direct,operating=gross-tax-op,cash=revenue+extraIn-op-stock-investOut-other;
  const contributionValue=revenue-direct-tax,contributionRate=revenue>0?contributionValue/revenue:0;
  const breakEven=op>0&&contributionRate>0?op/contributionRate:null;
  const projected=projection(revenue),safety=breakEven!==null&&projected>0?(projected-breakEven)/projected*100:null,room=breakEven!==null?projected-breakEven:null;
  const target=Number(settings?.monthly_revenue_target||0),targetPct=target>0?projected/target*100:null;
  let contracted=0,paid=0,debt=0;(investments||[]).forEach(i=>{const total=Number(i.total_value||0),inst=Number(i.installment_value||0),nPaid=Number(i.paid_installments||0);const p=Math.min(total,inst*nPaid);contracted+=total;paid+=p;debt+=Math.max(0,total-p);});
  return{revenue,direct,tax,op,stock,investOut,other,extraIn,gross,operating,cash,contributionRate,breakEven,projected,safety,room,target,targetPct,contracted,paid,debt};
}

function cardState(el,value){if(!el)return;el.classList.remove('good','warn','bad');if(value===null)return;if(value>=20)el.classList.add('good');else if(value>=0)el.classList.add('warn');else el.classList.add('bad');}
function renderChart(m){const canvas=$('safetyChart');if(!canvas)return;if(safetyChart)safetyChart.destroy();const labels=[],data=[];if(m.breakEven!==null){labels.push('Ponto de equilíbrio');data.push(m.breakEven);}labels.push('Faturamento atual','Projeção provável');data.push(m.revenue,m.projected);safetyChart=new Chart(canvas,{type:'bar',data:{labels,datasets:[{data,borderRadius:8}]},options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>brl(c.raw)}}},scales:{x:{beginAtZero:true,ticks:{callback:v=>'R$ '+Number(v).toLocaleString('pt-BR')},grid:{color:'#edf1f5'}},y:{grid:{display:false}}}}});}
async function refresh(){
  installStyles();renameKpis();ensureStockOption();ensureDashboard();ensureInvestmentSummary();const m=await metrics();if(!m)return;
  const set=(id,v)=>{if($(id))$(id).textContent=v};set('insRevenue',brl(m.revenue));set('insDirect',brl(m.direct));set('insOperatingCost',brl(m.op+m.tax));set('insOperatingProfit',brl(m.operating));set('insCashOut',brl(m.stock+m.investOut+m.other));set('insCash',brl(m.cash));
  const opEl=$('insOperatingProfit')?.closest('.money-step'),cashEl=$('insCash')?.closest('.money-step');if(opEl){opEl.classList.toggle('good',m.operating>=0);opEl.classList.toggle('bad',m.operating<0)}if(cashEl){cashEl.classList.toggle('good',m.cash>=0);cashEl.classList.toggle('bad',m.cash<0)}
  set('insContribution',m.revenue?pct(m.contributionRate*100):'—');set('insSafety',m.safety===null?'—':pct(m.safety));set('insProjectedRoom',m.room===null?'—':brl(m.room));set('insTargetPct',m.targetPct===null?'—':pct(m.targetPct));set('insDebt',brl(m.debt));
  set('invContracted',brl(m.contracted));set('invPaid',brl(m.paid));set('invDebt',brl(m.debt));
  const sCard=$('safetyCard');cardState(sCard,m.safety);if($('insSafetyText'))$('insSafetyText').textContent=m.safety===null?'Cadastre despesas operacionais para estimar o ponto de equilíbrio.':m.safety<0?'A projeção ainda está abaixo do ponto de equilíbrio.':m.safety<20?'Existe pouca folga acima do ponto de equilíbrio.':'A projeção está com boa folga acima do ponto de equilíbrio.';
  const cCard=$('contributionCard');cardState(cCard,m.contributionRate*100);
  if($('insTargetText'))$('insTargetText').textContent=m.target?`Projeção ${brl(m.projected)} para meta de ${brl(m.target)}.`:'Defina uma meta em Configurações.';if($('insTargetBar'))$('insTargetBar').style.width=`${Math.max(0,Math.min(100,m.targetPct||0))}%`;
  if($('kpiCashFlow'))$('kpiCashFlow').textContent=brl(m.cash);renderChart(m);
}

function schedule(){setTimeout(refresh,350);setTimeout(refresh,1300);}
document.addEventListener('click',e=>{const nav=e.target.closest?.('.nav-item');if(nav&&['dashboard','finance','investments'].includes(nav.dataset.section))schedule();});
$('movementForm')?.addEventListener('submit',()=>setTimeout(refresh,1000));$('investmentForm')?.addEventListener('submit',()=>setTimeout(refresh,1000));
installStyles();renameKpis();ensureStockOption();ensureDashboard();ensureInvestmentSummary();schedule();
