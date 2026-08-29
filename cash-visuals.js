import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Chart from 'https://esm.sh/chart.js@4.4.7/auto';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const supabase=createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
const $=id=>document.getElementById(id);
const brl=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v||0));
const pct=v=>`${Number(v||0).toFixed(1).replace('.',',')}%`;
let monthlyChart=null,recoveryChart=null;

function monthBounds(){
  const now=new Date();
  const year=Number(new Intl.DateTimeFormat('en',{timeZone:'America/Sao_Paulo',year:'numeric'}).format(now));
  const month=Number(new Intl.DateTimeFormat('en',{timeZone:'America/Sao_Paulo',month:'numeric'}).format(now));
  const last=new Date(year,month,0).getDate(),mm=String(month).padStart(2,'0');
  return{year,month,last,start:`${year}-${mm}-01T00:00:00-03:00`,end:`${year}-${mm}-${String(last).padStart(2,'0')}T23:59:59-03:00`};
}
function dayKey(value){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date(value));}
function dayLabel(value){return new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit',timeZone:'America/Sao_Paulo'}).format(new Date(value));}
async function currentUser(){const{data}=await supabase.auth.getSession();return data?.session?.user||null;}

function styles(){
  if($('cashVisualStyles'))return;
  const s=document.createElement('style');s.id='cashVisualStyles';s.textContent=`
    .cash-visuals{margin-top:16px;display:grid;gap:16px}.cash-summary{display:grid;grid-template-columns:repeat(4,1fr);background:#0d192d;border-radius:18px;overflow:hidden;color:#fff;box-shadow:0 16px 38px rgba(12,26,48,.14)}.cash-summary>div{padding:19px 20px;border-right:1px solid rgba(255,255,255,.1);position:relative}.cash-summary>div:last-child{border-right:0}.cash-summary span{display:block;color:#91a3b8;font-size:10px;font-weight:800;letter-spacing:.035em}.cash-summary strong{display:block;font-size:23px;margin:7px 0 3px;letter-spacing:-.025em}.cash-summary small{color:#8393a8;font-size:9px;line-height:1.45}.cash-summary .negative strong{color:#ff7373}.cash-summary .positive strong{color:#54d39a}.cash-summary .accent strong{color:#dbea19}
    .capital-progress{height:5px;background:rgba(255,255,255,.1);border-radius:99px;overflow:hidden;margin-top:10px}.capital-progress i{display:block;height:100%;width:0;background:#dbea19;border-radius:99px;transition:width .8s cubic-bezier(.2,.8,.2,1)}.capital-progress-label{display:block!important;margin-top:5px!important;color:#aab7c8!important;font-size:8px!important;font-style:normal;font-weight:700!important}
    .cash-chart-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.cash-panel{background:#fff;border:1px solid #e3e9f1;border-radius:18px;padding:20px;box-shadow:0 12px 32px rgba(18,37,68,.075);overflow:hidden}.cash-panel-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:8px}.cash-panel .eyebrow{font-size:9px;letter-spacing:.13em;font-weight:800;color:#8b98aa;margin:0 0 4px}.cash-panel h3{margin:0;font-size:19px;letter-spacing:-.02em}.cash-panel p{margin:5px 0 0;color:#738096;font-size:10px;line-height:1.45;max-width:560px}.cash-chart-box{height:305px;position:relative}.chart-legend-note{display:flex;gap:14px;flex-wrap:wrap;margin-top:8px;color:#7d8999;font-size:9px}.chart-legend-note b{color:#1a2739}.legend-dot{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:5px;vertical-align:1px}.legend-in{background:#0864e8}.legend-out{background:#d14343}.legend-balance{background:#0d192d}
    .recovery-note{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:99px;font-size:9px;font-weight:800;background:#fff2f2;color:#b83a3a;white-space:nowrap}.recovery-note::before{content:'';width:7px;height:7px;border-radius:50%;background:#d14343;box-shadow:0 0 0 4px rgba(209,67,67,.09)}.recovery-note.ok{background:#eefaf4;color:#168557}.recovery-note.ok::before{background:#169c64;box-shadow:0 0 0 4px rgba(22,156,100,.09)}
    .chart-callout{position:absolute;right:10px;top:8px;padding:7px 9px;border-radius:10px;background:rgba(255,255,255,.92);border:1px solid #e6ebf2;box-shadow:0 8px 20px rgba(18,37,68,.08);z-index:2;pointer-events:none}.chart-callout span{display:block;font-size:8px;color:#8b98aa;font-weight:800}.chart-callout strong{display:block;font-size:13px;color:#172033;margin-top:2px}.chart-callout.negative strong{color:#c83d3d}.chart-callout.positive strong{color:#138b5a}.old-financial-charts-hidden{display:none!important}
    @media(max-width:1050px){.cash-summary{grid-template-columns:1fr 1fr}.cash-summary>div:nth-child(2){border-right:0}.cash-chart-grid{grid-template-columns:1fr}}
    @media(max-width:650px){.cash-summary{grid-template-columns:1fr}.cash-summary>div{border-right:0;border-bottom:1px solid rgba(255,255,255,.1)}.cash-panel{padding:15px}.cash-chart-box{height:260px}.cash-panel-head{display:block}.recovery-note{margin-top:10px}.chart-callout{right:4px;top:4px}}
  `;document.head.appendChild(s);
}

function ensureLayout(){
  const dash=$('section-dashboard');if(!dash)return null;
  let wrap=$('cashVisuals');
  if(!wrap){
    wrap=document.createElement('div');wrap.id='cashVisuals';wrap.className='cash-visuals';wrap.innerHTML=`
      <section class="cash-summary">
        <div><span>ENTRADAS DO MÊS</span><strong id="cashMonthIn">R$ 0,00</strong><small>vendas + outras entradas registradas</small></div>
        <div><span>SAÍDAS DO MÊS</span><strong id="cashMonthOut">R$ 0,00</strong><small>despesas, estoque e parcelas realmente pagas</small></div>
        <div class="accent"><span>CAPITAL INVESTIDO</span><strong id="capitalInvested">R$ 0,00</strong><small>valor total das máquinas cadastradas</small></div>
        <div id="recoverySummaryCard"><span>POSIÇÃO DO INVESTIMENTO</span><strong id="capitalPosition">R$ 0,00</strong><small id="capitalPositionText">quanto ainda falta recuperar com o lucro</small><div class="capital-progress"><i id="capitalProgressBar"></i></div><em id="capitalProgressLabel" class="capital-progress-label">0% recuperado</em></div>
      </section>
      <div class="cash-chart-grid">
        <article class="cash-panel"><div class="cash-panel-head"><div><p class="eyebrow">FLUXO REAL DO MÊS</p><h3>Entradas, saídas e saldo acumulado</h3><p>As barras mostram movimentações do dia. A linha mostra como o caixa do mês vai evoluindo conforme o dinheiro entra e sai.</p></div></div><div class="cash-chart-box"><div id="monthlyCashCallout" class="chart-callout"><span>SALDO ACUMULADO</span><strong>R$ 0,00</strong></div><canvas id="monthlyCashChart"></canvas></div><div class="chart-legend-note"><span><i class="legend-dot legend-in"></i><b>Entrada</b></span><span><i class="legend-dot legend-out"></i><b>Saída</b></span><span><i class="legend-dot legend-balance"></i><b>Saldo acumulado</b></span></div></article>
        <article class="cash-panel"><div class="cash-panel-head"><div><p class="eyebrow">RECUPERAÇÃO DO CAPITAL</p><h3>Quando o investimento se paga?</h3><p>A linha começa abaixo de zero pelo capital investido. Cada lucro aproxima a empresa da linha zero; acima dela, o investimento já foi recuperado.</p></div><span id="recoveryStatus" class="recovery-note">Em recuperação</span></div><div class="cash-chart-box"><div id="recoveryCallout" class="chart-callout negative"><span>POSIÇÃO ATUAL</span><strong>R$ 0,00</strong></div><canvas id="investmentRecoveryChart"></canvas></div></article>
      </div>`;
    const projection=dash.querySelector('.projection-band');
    if(projection)projection.insertAdjacentElement('afterend',wrap);else dash.prepend(wrap);
  }
  const oldCharts=[...dash.querySelectorAll('.dashboard-grid .chart-panel')];oldCharts.forEach(x=>x.classList.add('old-financial-charts-hidden'));
  return wrap;
}

async function loadData(){
  const u=await currentUser();if(!u)return null;const b=monthBounds();
  const [monthSalesR,monthMovesR,allSalesR,allMovesR,investR,settingsR]=await Promise.all([
    supabase.from('sales').select('created_at,total').eq('user_id',u.id).gte('created_at',b.start).lte('created_at',b.end).order('created_at'),
    supabase.from('cash_movements').select('created_at,type,nature,amount').eq('user_id',u.id).gte('created_at',b.start).lte('created_at',b.end).order('created_at'),
    supabase.from('sales').select('created_at,total,sale_items(unit_cost,quantity)').eq('user_id',u.id).order('created_at'),
    supabase.from('cash_movements').select('created_at,type,nature,amount').eq('user_id',u.id).order('created_at'),
    supabase.from('investments').select('total_value,purchase_date,created_at').eq('user_id',u.id),
    supabase.from('company_settings').select('tax_rate').eq('user_id',u.id).maybeSingle()
  ]);
  return{b,monthSales:monthSalesR.data||[],monthMoves:monthMovesR.data||[],allSales:allSalesR.data||[],allMoves:allMovesR.data||[],investments:investR.data||[],taxRate:Number(settingsR.data?.tax_rate||0)};
}

function buildMonthly(data){
  const days=Array.from({length:data.b.last},(_,i)=>i+1),ins=Array(data.b.last).fill(0),outs=Array(data.b.last).fill(0);
  data.monthSales.forEach(s=>{const d=Number(dayKey(s.created_at).slice(-2));ins[d-1]+=Number(s.total||0)});
  data.monthMoves.forEach(m=>{const d=Number(dayKey(m.created_at).slice(-2)),v=Number(m.amount||0);if(m.type==='entrada')ins[d-1]+=v;else outs[d-1]+=v});
  const labels=days.map(d=>String(d).padStart(2,'0'));
  let balance=0;const cumulative=days.map((_,i)=>{balance+=ins[i]-outs[i];return balance});
  return{labels,ins,outs,cumulative,totalIn:ins.reduce((a,b)=>a+b,0),totalOut:outs.reduce((a,b)=>a+b,0),endingBalance:balance};
}

function buildRecovery(data){
  const invested=data.investments.reduce((a,i)=>a+Number(i.total_value||0),0);
  const investmentDates=data.investments.map(i=>new Date(i.purchase_date||i.created_at)).filter(d=>!Number.isNaN(d.getTime()));
  const saleDates=data.allSales.map(s=>new Date(s.created_at));
  const moveDates=data.allMoves.map(m=>new Date(m.created_at));
  const allDates=[...investmentDates,...saleDates,...moveDates].filter(d=>!Number.isNaN(d.getTime()));
  const startDate=allDates.length?new Date(Math.min(...allDates.map(d=>d.getTime()))):new Date();
  const events=[];const tax=data.taxRate/100;
  data.allSales.forEach(s=>{const direct=(s.sale_items||[]).reduce((a,i)=>a+Number(i.unit_cost||0)*Number(i.quantity||0),0);const contribution=Number(s.total||0)-direct-(Number(s.total||0)*tax);events.push({date:new Date(s.created_at),value:contribution});});
  data.allMoves.forEach(m=>{if(m.type!=='saida')return;const nature=m.nature||'operational';if(nature==='investment'||nature==='stock')return;events.push({date:new Date(m.created_at),value:-Number(m.amount||0)});});
  events.sort((a,b)=>a.date-b.date);
  let balance=-invested;const byDay=new Map();byDay.set(dayKey(startDate),balance);
  events.forEach(e=>{balance+=e.value;byDay.set(dayKey(e.date),balance)});if(!events.length)byDay.set(dayKey(new Date()),balance);
  const labels=[...byDay.keys()].sort(),values=labels.map(k=>byDay.get(k)),operatingRecovered=balance+invested;
  const recoveredPct=invested>0?Math.max(0,operatingRecovered/invested*100):0;
  return{invested,balance,operatingRecovered,recoveredPct,labels:labels.map(k=>dayLabel(k+'T12:00:00-03:00')),values};
}

function moneyTick(v){const n=Number(v);if(Math.abs(n)>=1000)return`R$ ${(n/1000).toLocaleString('pt-BR',{maximumFractionDigits:1})} mil`;return`R$ ${n.toLocaleString('pt-BR')}`;}

function drawMonthly(m){
  const c=$('monthlyCashChart');if(!c)return;if(monthlyChart)monthlyChart.destroy();
  monthlyChart=new Chart(c,{type:'bar',data:{labels:m.labels,datasets:[
    {type:'bar',label:'Entradas',data:m.ins,backgroundColor:'rgba(0,95,222,.78)',hoverBackgroundColor:'rgba(0,95,222,.95)',borderRadius:6,borderSkipped:false,barPercentage:.72,categoryPercentage:.8,order:2},
    {type:'bar',label:'Saídas',data:m.outs,backgroundColor:'rgba(209,67,67,.72)',hoverBackgroundColor:'rgba(209,67,67,.92)',borderRadius:6,borderSkipped:false,barPercentage:.72,categoryPercentage:.8,order:2},
    {type:'line',label:'Saldo acumulado',data:m.cumulative,borderWidth:3,tension:.34,fill:{target:'origin',above:'rgba(13,25,45,.055)',below:'rgba(209,67,67,.075)'},pointRadius:ctx=>ctx.dataIndex===m.cumulative.length-1?5:0,pointHoverRadius:6,pointBackgroundColor:ctx=>ctx.parsed.y<0?'#d14343':'#0d192d',segment:{borderColor:ctx=>(ctx.p0.parsed.y<0||ctx.p1.parsed.y<0)?'#d14343':'#0d192d'},order:1}
  ]},options:{responsive:true,maintainAspectRatio:false,animation:{duration:900,easing:'easeOutQuart'},interaction:{mode:'index',intersect:false},plugins:{legend:{display:false},tooltip:{backgroundColor:'#0d192d',padding:11,cornerRadius:10,callbacks:{label:ctx=>`${ctx.dataset.label}: ${brl(ctx.raw)}`}}},scales:{x:{grid:{display:false},ticks:{maxTicksLimit:12,color:'#7f8b9b'}},y:{grid:{color:ctx=>ctx.tick.value===0?'#bdc6d1':'#edf1f5'},ticks:{callback:moneyTick,color:'#7f8b9b'}}}}});
}

function drawRecovery(r){
  const c=$('investmentRecoveryChart');if(!c)return;if(recoveryChart)recoveryChart.destroy();
  recoveryChart=new Chart(c,{type:'line',data:{labels:r.labels,datasets:[
    {label:'Posição do investimento',data:r.values,borderWidth:3.5,tension:.36,fill:{target:'origin',above:'rgba(22,156,100,.12)',below:'rgba(209,67,67,.13)'},pointRadius:ctx=>ctx.dataIndex===r.values.length-1?6:2,pointHoverRadius:7,pointBorderWidth:2,pointBorderColor:'#fff',segment:{borderColor:ctx=>(ctx.p0.parsed.y<0||ctx.p1.parsed.y<0)?'#d14343':'#169c64'},pointBackgroundColor:ctx=>ctx.parsed.y<0?'#d14343':'#169c64'},
    {label:'Capital recuperado',data:r.values.map(()=>0),borderColor:'#7f8b9b',borderWidth:1.5,borderDash:[7,6],pointRadius:0,fill:false}
  ]},options:{responsive:true,maintainAspectRatio:false,animation:{duration:1100,easing:'easeOutQuart'},interaction:{mode:'index',intersect:false},plugins:{legend:{display:false},tooltip:{backgroundColor:'#0d192d',padding:11,cornerRadius:10,callbacks:{label:ctx=>ctx.datasetIndex===0?`Posição: ${brl(ctx.raw)}`:'Linha zero: capital recuperado'}}},scales:{x:{grid:{display:false},ticks:{color:'#7f8b9b'}},y:{grid:{color:ctx=>ctx.tick.value===0?'#8d98a7':'#edf1f5',lineWidth:ctx=>ctx.tick.value===0?1.5:1},ticks:{callback:moneyTick,color:'#7f8b9b'}}}}});
}

async function refresh(){
  styles();ensureLayout();const data=await loadData();if(!data)return;const month=buildMonthly(data),recovery=buildRecovery(data);
  if($('cashMonthIn'))$('cashMonthIn').textContent=brl(month.totalIn);if($('cashMonthOut'))$('cashMonthOut').textContent=brl(month.totalOut);if($('capitalInvested'))$('capitalInvested').textContent=brl(recovery.invested);if($('capitalPosition'))$('capitalPosition').textContent=brl(recovery.balance);
  const card=$('recoverySummaryCard'),status=$('recoveryStatus');if(card){card.classList.toggle('negative',recovery.balance<0);card.classList.toggle('positive',recovery.balance>=0)}
  if($('capitalPositionText'))$('capitalPositionText').textContent=recovery.balance<0?`ainda faltam ${brl(Math.abs(recovery.balance))} para recuperar o capital`:`capital recuperado; há ${brl(recovery.balance)} acima do investimento inicial`;
  const progress=Math.max(0,Math.min(100,recovery.recoveredPct));if($('capitalProgressBar'))$('capitalProgressBar').style.width=`${progress}%`;if($('capitalProgressLabel'))$('capitalProgressLabel').textContent=`${pct(recovery.recoveredPct)} recuperado`;
  if(status){status.textContent=recovery.balance<0?'Em recuperação':'Investimento recuperado';status.classList.toggle('ok',recovery.balance>=0)}
  const mc=$('monthlyCashCallout');if(mc){mc.querySelector('strong').textContent=brl(month.endingBalance);mc.classList.toggle('negative',month.endingBalance<0);mc.classList.toggle('positive',month.endingBalance>=0)}
  const rc=$('recoveryCallout');if(rc){rc.querySelector('strong').textContent=brl(recovery.balance);rc.classList.toggle('negative',recovery.balance<0);rc.classList.toggle('positive',recovery.balance>=0)}
  drawMonthly(month);drawRecovery(recovery);
}

function schedule(){setTimeout(refresh,350);setTimeout(refresh,1300)}
document.addEventListener('click',e=>{const nav=e.target.closest?.('.nav-item');if(nav?.dataset.section==='dashboard')schedule()});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule()});
styles();ensureLayout();schedule();
