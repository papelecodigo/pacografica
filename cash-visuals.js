import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Chart from 'https://esm.sh/chart.js@4.4.7/auto';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const supabase=createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
const $=id=>document.getElementById(id);
const brl=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v||0));
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
    .cash-visuals{margin-top:16px;display:grid;gap:16px}.cash-summary{display:grid;grid-template-columns:repeat(4,1fr);background:#0d192d;border-radius:16px;overflow:hidden;color:#fff}.cash-summary>div{padding:18px 20px;border-right:1px solid rgba(255,255,255,.1)}.cash-summary>div:last-child{border-right:0}.cash-summary span{display:block;color:#91a3b8;font-size:10px;font-weight:800;letter-spacing:.02em}.cash-summary strong{display:block;font-size:22px;margin:7px 0 3px}.cash-summary small{color:#8393a8;font-size:9px;line-height:1.4}.cash-summary .negative strong{color:#ff7373}.cash-summary .positive strong{color:#54d39a}.cash-summary .accent strong{color:#dbea19}
    .cash-chart-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.cash-panel{background:#fff;border:1px solid #e3e9f1;border-radius:16px;padding:20px;box-shadow:0 10px 30px rgba(18,37,68,.07)}.cash-panel-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:12px}.cash-panel .eyebrow{font-size:9px;letter-spacing:.13em;font-weight:800;color:#8b98aa;margin:0 0 4px}.cash-panel h3{margin:0;font-size:18px}.cash-panel p{margin:5px 0 0;color:#738096;font-size:10px;line-height:1.45;max-width:560px}.cash-chart-box{height:285px}.recovery-note{display:inline-flex;align-items:center;gap:6px;padding:5px 9px;border-radius:99px;font-size:9px;font-weight:800;background:#f4f7fb;color:#65758a}.recovery-note::before{content:'';width:7px;height:7px;border-radius:50%;background:#d14343}.recovery-note.ok::before{background:#169c64}.old-financial-charts-hidden{display:none!important}
    @media(max-width:1050px){.cash-summary{grid-template-columns:1fr 1fr}.cash-summary>div:nth-child(2){border-right:0}.cash-chart-grid{grid-template-columns:1fr}}
    @media(max-width:650px){.cash-summary{grid-template-columns:1fr}.cash-summary>div{border-right:0;border-bottom:1px solid rgba(255,255,255,.1)}.cash-panel{padding:15px}.cash-chart-box{height:245px}.cash-panel-head{display:block}.recovery-note{margin-top:10px}}
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
        <div id="recoverySummaryCard"><span>POSIÇÃO DO INVESTIMENTO</span><strong id="capitalPosition">R$ 0,00</strong><small id="capitalPositionText">quanto ainda falta recuperar com o lucro</small></div>
      </section>
      <div class="cash-chart-grid">
        <article class="cash-panel"><div class="cash-panel-head"><div><p class="eyebrow">FLUXO REAL DO MÊS</p><h3>Entradas x saídas</h3><p>Aqui entra apenas dinheiro que efetivamente entrou ou saiu. Compra parcelada aparece conforme as parcelas forem pagas.</p></div></div><div class="cash-chart-box"><canvas id="monthlyCashChart"></canvas></div></article>
        <article class="cash-panel"><div class="cash-panel-head"><div><p class="eyebrow">RECUPERAÇÃO DO CAPITAL</p><h3>Estamos recuperando o investimento?</h3><p>Começa negativo pelo valor das máquinas. O lucro gerado pela operação vai aproximando a empresa do zero até recuperar o capital investido.</p></div><span id="recoveryStatus" class="recovery-note">Em recuperação</span></div><div class="cash-chart-box"><canvas id="investmentRecoveryChart"></canvas></div></article>
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
  return{labels,ins,outs,totalIn:ins.reduce((a,b)=>a+b,0),totalOut:outs.reduce((a,b)=>a+b,0)};
}

function buildRecovery(data){
  const invested=data.investments.reduce((a,i)=>a+Number(i.total_value||0),0);
  const investmentDates=data.investments.map(i=>new Date(i.purchase_date||i.created_at)).filter(d=>!Number.isNaN(d.getTime()));
  const saleDates=data.allSales.map(s=>new Date(s.created_at));
  const moveDates=data.allMoves.map(m=>new Date(m.created_at));
  const allDates=[...investmentDates,...saleDates,...moveDates].filter(d=>!Number.isNaN(d.getTime()));
  const startDate=allDates.length?new Date(Math.min(...allDates.map(d=>d.getTime()))):new Date();
  const events=[];
  const tax=data.taxRate/100;
  data.allSales.forEach(s=>{
    const direct=(s.sale_items||[]).reduce((a,i)=>a+Number(i.unit_cost||0)*Number(i.quantity||0),0);
    const contribution=Number(s.total||0)-direct-(Number(s.total||0)*tax);
    events.push({date:new Date(s.created_at),value:contribution});
  });
  data.allMoves.forEach(m=>{
    if(m.type!=='saida')return;
    const nature=m.nature||'operational';
    if(nature==='investment'||nature==='stock')return;
    events.push({date:new Date(m.created_at),value:-Number(m.amount||0)});
  });
  events.sort((a,b)=>a.date-b.date);
  let balance=-invested;
  const byDay=new Map();
  byDay.set(dayKey(startDate),balance);
  events.forEach(e=>{balance+=e.value;byDay.set(dayKey(e.date),balance)});
  if(!events.length)byDay.set(dayKey(new Date()),balance);
  const labels=[...byDay.keys()].sort();
  const values=labels.map(k=>byDay.get(k));
  const operatingRecovered=balance+invested;
  return{invested,balance,operatingRecovered,labels:labels.map(k=>dayLabel(k+'T12:00:00-03:00')),values};
}

function drawMonthly(m){
  const c=$('monthlyCashChart');if(!c)return;if(monthlyChart)monthlyChart.destroy();
  monthlyChart=new Chart(c,{type:'bar',data:{labels:m.labels,datasets:[{label:'Entradas',data:m.ins,backgroundColor:'rgba(0,95,222,.78)',borderRadius:5},{label:'Saídas',data:m.outs,backgroundColor:'rgba(209,67,67,.76)',borderRadius:5}]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{position:'bottom'},tooltip:{callbacks:{label:ctx=>`${ctx.dataset.label}: ${brl(ctx.raw)}`}}},scales:{x:{grid:{display:false},ticks:{maxTicksLimit:12}},y:{beginAtZero:true,grid:{color:'#edf1f5'},ticks:{callback:v=>'R$ '+Number(v).toLocaleString('pt-BR')}}}}});
}

function drawRecovery(r){
  const c=$('investmentRecoveryChart');if(!c)return;if(recoveryChart)recoveryChart.destroy();
  recoveryChart=new Chart(c,{type:'line',data:{labels:r.labels,datasets:[{label:'Capital a recuperar',data:r.values,borderWidth:3,pointRadius:3,pointHoverRadius:5,tension:.25,fill:false,segment:{borderColor:ctx=>{const a=ctx.p0.parsed.y,b=ctx.p1.parsed.y;return(a<0||b<0)?'#d14343':'#169c64'}},pointBackgroundColor:ctx=>ctx.parsed.y<0?'#d14343':'#169c64'},{label:'Zero',data:r.values.map(()=>0),borderColor:'#a8b2bf',borderWidth:1,borderDash:[6,6],pointRadius:0}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>ctx.datasetIndex===0?`Posição: ${brl(ctx.raw)}`:'Ponto de equilíbrio do investimento'}}},scales:{x:{grid:{display:false}},y:{grid:{color:ctx=>ctx.tick.value===0?'#9aa5b4':'#edf1f5'},ticks:{callback:v=>brl(v)}}}}});
}

async function refresh(){
  styles();ensureLayout();const data=await loadData();if(!data)return;const month=buildMonthly(data),recovery=buildRecovery(data);
  if($('cashMonthIn'))$('cashMonthIn').textContent=brl(month.totalIn);if($('cashMonthOut'))$('cashMonthOut').textContent=brl(month.totalOut);if($('capitalInvested'))$('capitalInvested').textContent=brl(recovery.invested);if($('capitalPosition'))$('capitalPosition').textContent=brl(recovery.balance);
  const card=$('recoverySummaryCard'),status=$('recoveryStatus');if(card){card.classList.toggle('negative',recovery.balance<0);card.classList.toggle('positive',recovery.balance>=0)}
  if($('capitalPositionText'))$('capitalPositionText').textContent=recovery.balance<0?`ainda faltam ${brl(Math.abs(recovery.balance))} para recuperar o capital`:`capital recuperado; há ${brl(recovery.balance)} acima do investimento inicial`;
  if(status){status.textContent=recovery.balance<0?'Em recuperação':'Investimento recuperado';status.classList.toggle('ok',recovery.balance>=0)}
  drawMonthly(month);drawRecovery(recovery);
}

function schedule(){setTimeout(refresh,350);setTimeout(refresh,1300)}
document.addEventListener('click',e=>{const nav=e.target.closest?.('.nav-item');if(nav?.dataset.section==='dashboard')schedule()});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)schedule()});
styles();ensureLayout();schedule();
