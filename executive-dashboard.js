import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import Chart from 'https://esm.sh/chart.js@4.4.7/auto';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const supabase=createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
const $=id=>document.getElementById(id);
const brl=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:2}).format(Number(v||0));
const pct=v=>`${Number(v||0).toFixed(1).replace('.',',')}%`;
let goalChart=null,cashChart=null,recoveryChart=null;

function bounds(){
  const now=new Date();
  const year=Number(new Intl.DateTimeFormat('en',{timeZone:'America/Sao_Paulo',year:'numeric'}).format(now));
  const month=Number(new Intl.DateTimeFormat('en',{timeZone:'America/Sao_Paulo',month:'numeric'}).format(now));
  const day=Number(new Intl.DateTimeFormat('en',{timeZone:'America/Sao_Paulo',day:'numeric'}).format(now));
  const last=new Date(year,month,0).getDate(),mm=String(month).padStart(2,'0');
  return{year,month,day,last,start:`${year}-${mm}-01T00:00:00-03:00`,end:`${year}-${mm}-${String(last).padStart(2,'0')}T23:59:59-03:00`};
}
function businessDay(year,month,day){return new Date(year,month-1,day).getDay()!==0}
function dayKey(v){return Number(new Intl.DateTimeFormat('en',{timeZone:'America/Sao_Paulo',day:'numeric'}).format(new Date(v)))}
async function currentUser(){const{data}=await supabase.auth.getSession();return data?.session?.user||null}

function css(){
 if($('executiveDashboardCss'))return;
 const s=document.createElement('style');s.id='executiveDashboardCss';s.textContent=`
 #section-dashboard.exec-mode>.kpi-grid,#section-dashboard.exec-mode>.projection-band,#section-dashboard.exec-mode>.dashboard-grid,#section-dashboard.exec-mode>.finance-insights,#section-dashboard.exec-mode>.cash-visuals{display:none!important}
 .exec-dashboard{display:grid;gap:16px}.exec-hero{display:grid;grid-template-columns:minmax(0,1.75fr) minmax(300px,.75fr);gap:16px}
 .exec-card{background:#fff;border:1px solid #e3e9f1;border-radius:18px;box-shadow:0 10px 32px rgba(18,37,68,.065);overflow:hidden}.exec-pad{padding:20px 22px}
 .exec-eyebrow{font-size:9px;letter-spacing:.14em;font-weight:800;color:#8090a7}.exec-title{font-size:20px;margin:5px 0 3px;color:#101b2e}.exec-sub{margin:0;color:#7a879a;font-size:10px;line-height:1.45}
 .exec-goal-head{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-bottom:12px}.exec-goal-value strong{display:block;font-size:32px;letter-spacing:-.035em;color:#101b2e}.exec-goal-value span{font-size:10px;color:#7e8a9d}.exec-status{padding:7px 10px;border-radius:999px;font-size:10px;font-weight:800;white-space:nowrap}.exec-status.good{background:#eaf8f1;color:#08784b}.exec-status.warn{background:#fff6de;color:#9a6800}.exec-status.bad{background:#fff0f0;color:#bd3434}
 .exec-progress{height:9px;background:#edf1f6;border-radius:99px;overflow:hidden;margin:12px 0 4px}.exec-progress i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#0965e8,#29a0ff);transition:width .5s ease}.exec-progress-line{display:flex;justify-content:space-between;font-size:9px;color:#8b96a7}
 .exec-chart{height:285px;margin-top:8px}.exec-side{display:grid;gap:10px}.exec-side-main{background:#0d192d;color:#fff;border-radius:18px;padding:20px}.exec-side-main .exec-eyebrow{color:#8ea0b8}.exec-side-main strong{display:block;font-size:31px;margin:8px 0 4px;letter-spacing:-.035em}.exec-side-main p{font-size:10px;color:#9eacc0;margin:0;line-height:1.45}
 .exec-metric{border:1px solid #e4e9f0;border-radius:14px;padding:14px 15px;background:#fff}.exec-metric span{display:block;font-size:9px;font-weight:700;color:#7c899c}.exec-metric strong{display:block;font-size:19px;margin:5px 0 2px;color:#172236}.exec-metric small{font-size:9px;color:#98a2b1;line-height:1.35}.exec-metric.danger strong{color:#d44343}.exec-metric.good strong{color:#0a9360}
 .exec-bottom{display:grid;grid-template-columns:1fr 1fr;gap:16px}.exec-mini-head{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;padding:18px 20px 0}.exec-mini-head h3{font-size:16px;margin:4px 0 2px}.exec-mini-chart{height:220px;padding:8px 12px 14px}.exec-chip{font-size:9px;font-weight:800;padding:6px 9px;border-radius:999px;background:#f1f5fa;color:#607086;white-space:nowrap}.exec-chip.red{background:#fff0f0;color:#c93e3e}.exec-chip.green{background:#ebf8f1;color:#087b4e}
 .exec-legend{display:flex;gap:14px;flex-wrap:wrap;margin-top:4px}.exec-legend span{font-size:9px;color:#7f8b9d;display:flex;align-items:center;gap:5px}.exec-dot{width:8px;height:8px;border-radius:50%;display:inline-block}.d-blue{background:#0965e8}.d-dark{background:#16233a}.d-gray{background:#b9c3d0}.d-red{background:#d74646}.d-green{background:#0c9d64}
 @media(max-width:1050px){.exec-hero{grid-template-columns:1fr}.exec-side{grid-template-columns:repeat(3,1fr)}.exec-side-main{grid-column:1/-1}.exec-bottom{grid-template-columns:1fr}}
 @media(max-width:650px){.exec-dashboard{gap:12px}.exec-pad{padding:16px}.exec-goal-head{align-items:flex-start}.exec-goal-value strong{font-size:27px}.exec-chart{height:250px}.exec-side{grid-template-columns:1fr 1fr}.exec-side-main{grid-column:1/-1}.exec-metric{padding:12px}.exec-bottom{gap:12px}.exec-mini-chart{height:210px}.exec-card{border-radius:15px}}
 `;document.head.appendChild(s);
}

function layout(){
 const sec=$('section-dashboard');if(!sec)return null;sec.classList.add('exec-mode');
 let root=$('execDashboard');if(root)return root;
 root=document.createElement('div');root.id='execDashboard';root.className='exec-dashboard';root.innerHTML=`
 <div class="exec-hero">
   <article class="exec-card exec-pad">
    <div class="exec-goal-head"><div><div class="exec-eyebrow">META E PROJEÇÃO</div><h3 class="exec-title">Como o mês está caminhando?</h3><p class="exec-sub" id="execGoalNarrative">Carregando leitura do mês...</p></div><span id="execPaceStatus" class="exec-status">—</span></div>
    <div class="exec-goal-value"><strong id="execRevenue">R$ 0,00</strong><span id="execGoalText">de R$ 0,00 de meta</span></div>
    <div class="exec-progress"><i id="execGoalBar" style="width:0%"></i></div><div class="exec-progress-line"><span id="execGoalPct">0%</span><span id="execGoalMissing">faltam R$ 0,00</span></div>
    <div class="exec-chart"><canvas id="execGoalChart"></canvas></div>
    <div class="exec-legend"><span><i class="exec-dot d-blue"></i>Realizado</span><span><i class="exec-dot d-gray"></i>Ritmo da meta</span><span><i class="exec-dot d-dark"></i>Projeção provável</span></div>
   </article>
   <aside class="exec-side">
    <div class="exec-side-main"><div class="exec-eyebrow">SE MANTIVER O RITMO</div><strong id="execProjection">R$ 0,00</strong><p id="execProjectionText">projeção de fechamento do mês</p></div>
    <div class="exec-metric" id="execNeedCard"><span>Para bater a meta</span><strong id="execNeedDay">R$ 0,00/dia</strong><small id="execNeedText">nos dias úteis restantes</small></div>
    <div class="exec-metric"><span>Lucro da operação</span><strong id="execOperating">R$ 0,00</strong><small>resultado após custos, imposto e despesas operacionais</small></div>
    <div class="exec-metric" id="execCapitalCard"><span>Capital a recuperar</span><strong id="execCapitalRemaining">R$ 0,00</strong><small id="execCapitalText">investimentos ainda não recuperados</small></div>
   </aside>
 </div>
 <div class="exec-bottom">
   <article class="exec-card"><div class="exec-mini-head"><div><div class="exec-eyebrow">CAIXA REAL</div><h3>Entradas, saídas e saldo</h3><p class="exec-sub">O que realmente entrou e saiu durante o mês.</p></div><span id="execCashChip" class="exec-chip">R$ 0,00</span></div><div class="exec-mini-chart"><canvas id="execCashChart"></canvas></div></article>
   <article class="exec-card"><div class="exec-mini-head"><div><div class="exec-eyebrow">INVESTIMENTO</div><h3>Recuperação do capital</h3><p class="exec-sub">A linha cruza o zero quando o lucro acumulado recuperar o investimento.</p></div><span id="execRecoveryChip" class="exec-chip red">Em recuperação</span></div><div class="exec-mini-chart"><canvas id="execRecoveryChart"></canvas></div></article>
 </div>`;
 sec.prepend(root);return root;
}

async function data(){
 const u=await currentUser();if(!u)return null;const b=bounds();
 const [salesR,movesR,settingsR,investR,allSalesR,allMovesR]=await Promise.all([
  supabase.from('sales').select('created_at,total,sale_items(unit_cost,quantity)').eq('user_id',u.id).gte('created_at',b.start).lte('created_at',b.end).order('created_at'),
  supabase.from('cash_movements').select('created_at,type,nature,amount').eq('user_id',u.id).gte('created_at',b.start).lte('created_at',b.end).order('created_at'),
  supabase.from('company_settings').select('monthly_revenue_target,tax_rate').eq('user_id',u.id).maybeSingle(),
  supabase.from('investments').select('total_value,purchase_date,created_at').eq('user_id',u.id),
  supabase.from('sales').select('created_at,total,sale_items(unit_cost,quantity)').eq('user_id',u.id).order('created_at'),
  supabase.from('cash_movements').select('created_at,type,nature,amount').eq('user_id',u.id).order('created_at')
 ]);
 return{b,sales:salesR.data||[],moves:movesR.data||[],settings:settingsR.data||{},investments:investR.data||[],allSales:allSalesR.data||[],allMoves:allMovesR.data||[]};
}

function metrics(d){
 const {b}=d,target=Number(d.settings.monthly_revenue_target||0),taxRate=Number(d.settings.tax_rate||0)/100;
 const revenue=d.sales.reduce((a,s)=>a+Number(s.total||0),0);
 const direct=d.sales.reduce((a,s)=>a+(s.sale_items||[]).reduce((z,i)=>z+Number(i.unit_cost||0)*Number(i.quantity||0),0),0);
 const opExpenses=d.moves.filter(m=>m.type==='saida'&&(m.nature||'operational')==='operational').reduce((a,m)=>a+Number(m.amount||0),0);
 const tax=revenue*taxRate,operating=revenue-direct-tax-opExpenses;
 let totalBiz=0,elapsedBiz=0;for(let day=1;day<=b.last;day++)if(businessDay(b.year,b.month,day)){totalBiz++;if(day<=b.day)elapsedBiz++}
 elapsedBiz=Math.max(1,elapsedBiz);const remainingBiz=Math.max(0,totalBiz-elapsedBiz),projection=revenue/elapsedBiz*totalBiz;
 const goalPct=target>0?revenue/target*100:0,expectedNow=target>0?target*(elapsedBiz/totalBiz):0,pace=expectedNow>0?revenue/expectedNow:0;
 const needPerDay=target>revenue&&remainingBiz>0?(target-revenue)/remainingBiz:0;
 const invested=d.investments.reduce((a,i)=>a+Number(i.total_value||0),0);
 const allContribution=d.allSales.reduce((a,s)=>{const cost=(s.sale_items||[]).reduce((z,i)=>z+Number(i.unit_cost||0)*Number(i.quantity||0),0);return a+Number(s.total||0)-cost-Number(s.total||0)*taxRate},0);
 const allOps=d.allMoves.filter(m=>m.type==='saida'&&!['investment','stock'].includes(m.nature||'operational')).reduce((a,m)=>a+Number(m.amount||0),0);
 const capitalPosition=-invested+allContribution-allOps,capitalRemaining=Math.max(0,-capitalPosition);
 return{target,revenue,direct,tax,opExpenses,operating,totalBiz,elapsedBiz,remainingBiz,projection,goalPct,expectedNow,pace,needPerDay,invested,capitalPosition,capitalRemaining};
}

function goalSeries(d,m){
 const labels=[],actual=[],goal=[],proj=[];let cumulative=0;
 const byDay=Array(d.b.last+1).fill(0);d.sales.forEach(s=>byDay[dayKey(s.created_at)]+=Number(s.total||0));
 const dailyProjection=m.elapsedBiz?m.revenue/m.elapsedBiz:0;let projectedCum=0,bizCount=0;
 for(let day=1;day<=d.b.last;day++){
  labels.push(String(day).padStart(2,'0'));cumulative+=byDay[day];actual.push(day<=d.b.day?cumulative:null);
  if(businessDay(d.b.year,d.b.month,day))bizCount++;
  goal.push(m.target?m.target*(bizCount/m.totalBiz):0);
  if(day<=d.b.day)projectedCum=cumulative;else if(businessDay(d.b.year,d.b.month,day))projectedCum+=dailyProjection;
  proj.push(day<m.b?.day?null:(day>=d.b.day?projectedCum:null));
 }
 return{labels,actual,goal,proj};
}

function cashSeries(d){
 const labels=[],ins=[],outs=[],balance=[];let bal=0;
 const di=Array(d.b.last+1).fill(0),do_=Array(d.b.last+1).fill(0);
 d.sales.forEach(s=>di[dayKey(s.created_at)]+=Number(s.total||0));
 d.moves.forEach(x=>{const day=dayKey(x.created_at),v=Number(x.amount||0);if(x.type==='entrada')di[day]+=v;else do_[day]+=v});
 for(let day=1;day<=d.b.last;day++){labels.push(String(day).padStart(2,'0'));bal+=di[day]-do_[day];ins.push(di[day]);outs.push(do_[day]);balance.push(bal)}
 return{labels,ins,outs,balance,current:bal};
}

function recoverySeries(d,m){
 const events=[];const taxRate=Number(d.settings.tax_rate||0)/100;
 d.allSales.forEach(s=>{const cost=(s.sale_items||[]).reduce((z,i)=>z+Number(i.unit_cost||0)*Number(i.quantity||0),0);events.push({date:new Date(s.created_at),v:Number(s.total||0)-cost-Number(s.total||0)*taxRate})});
 d.allMoves.filter(x=>x.type==='saida'&&!['investment','stock'].includes(x.nature||'operational')).forEach(x=>events.push({date:new Date(x.created_at),v:-Number(x.amount||0)}));events.sort((a,b)=>a.date-b.date);
 let bal=-m.invested;const labels=['Início'],vals=[bal];events.forEach(e=>{bal+=e.v;labels.push(new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit'}).format(e.date));vals.push(bal)});return{labels,vals,current:bal};
}

function drawGoal(s){const c=$('execGoalChart');if(!c)return;if(goalChart)goalChart.destroy();goalChart=new Chart(c,{type:'line',data:{labels:s.labels,datasets:[{label:'Realizado',data:s.actual,borderColor:'#0965e8',backgroundColor:'rgba(9,101,232,.09)',fill:true,borderWidth:3,pointRadius:0,tension:.28,spanGaps:true},{label:'Ritmo da meta',data:s.goal,borderColor:'#b8c1ce',borderDash:[6,6],borderWidth:2,pointRadius:0,tension:.15},{label:'Projeção provável',data:s.proj,borderColor:'#17243a',borderWidth:2.5,pointRadius:0,borderDash:[3,3],tension:.28,spanGaps:true}]},options:{responsive:true,maintainAspectRatio:false,animation:{duration:650},interaction:{mode:'index',intersect:false},plugins:{legend:{display:false},tooltip:{callbacks:{label:x=>`${x.dataset.label}: ${brl(x.raw)}`}}},scales:{x:{grid:{display:false},ticks:{maxTicksLimit:11,color:'#91a0b4'}},y:{beginAtZero:true,grid:{color:'#edf1f5'},ticks:{color:'#91a0b4',callback:v=>Number(v)>=1000?`R$ ${(Number(v)/1000).toFixed(0)} mil`:`R$ ${v}`}}}}})}
function drawCash(s){const c=$('execCashChart');if(!c)return;if(cashChart)cashChart.destroy();cashChart=new Chart(c,{data:{labels:s.labels,datasets:[{type:'bar',label:'Entradas',data:s.ins,backgroundColor:'rgba(9,101,232,.75)',borderRadius:4},{type:'bar',label:'Saídas',data:s.outs,backgroundColor:'rgba(215,68,68,.72)',borderRadius:4},{type:'line',label:'Saldo',data:s.balance,borderColor:'#17243a',backgroundColor:'rgba(23,36,58,.06)',fill:true,borderWidth:2.5,pointRadius:0,tension:.28}]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{display:false},tooltip:{callbacks:{label:x=>`${x.dataset.label}: ${brl(x.raw)}`}}},scales:{x:{grid:{display:false},ticks:{maxTicksLimit:10}},y:{grid:{color:'#edf1f5'},ticks:{callback:v=>Number(v)>=1000?`R$ ${(v/1000).toFixed(0)}k`:`R$ ${v}`}}}}})}
function drawRecovery(s){const c=$('execRecoveryChart');if(!c)return;if(recoveryChart)recoveryChart.destroy();recoveryChart=new Chart(c,{type:'line',data:{labels:s.labels,datasets:[{label:'Posição',data:s.vals,borderWidth:3,pointRadius:(ctx)=>ctx.dataIndex===s.vals.length-1?5:0,pointBorderWidth:2,pointBorderColor:'#fff',tension:.3,fill:{target:{value:0},above:'rgba(12,157,100,.12)',below:'rgba(215,68,68,.12)'},segment:{borderColor:ctx=>(ctx.p0.parsed.y<0||ctx.p1.parsed.y<0)?'#d74444':'#0c9d64'}},{label:'Zero',data:s.vals.map(()=>0),borderColor:'#aab4c1',borderDash:[5,5],borderWidth:1,pointRadius:0}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:x=>x.datasetIndex===0?`Posição: ${brl(x.raw)}`:'Capital recuperado'}}},scales:{x:{grid:{display:false},ticks:{maxTicksLimit:7}},y:{grid:{color:'#edf1f5'},ticks:{callback:v=>Number(v)<=-1000||Number(v)>=1000?`R$ ${(v/1000).toFixed(1).replace('.',',')}k`:brl(v)}}}}})}

async function refresh(){css();layout();const d=await data();if(!d)return;const m=metrics(d),g=goalSeries(d,m),cash=cashSeries(d),rec=recoverySeries(d,m);
 $('execRevenue').textContent=brl(m.revenue);$('execGoalText').textContent=`de ${brl(m.target)} de meta`;$('execGoalPct').textContent=pct(m.goalPct);$('execGoalMissing').textContent=m.target>m.revenue?`faltam ${brl(m.target-m.revenue)}`:'meta atingida';$('execGoalBar').style.width=`${Math.min(100,m.goalPct)}%`;
 const status=$('execPaceStatus');status.className='exec-status '+(m.pace>=1?'good':m.pace>=.8?'warn':'bad');status.textContent=m.pace>=1.05?'Acima do ritmo':m.pace>=.8?'Ritmo de atenção':'Abaixo do ritmo';
 $('execGoalNarrative').textContent=m.target?`Até hoje, o ritmo ideal seria ${brl(m.expectedNow)}. Vocês faturaram ${brl(m.revenue)}.`:'Defina a meta mensal em Configurações.';
 $('execProjection').textContent=brl(m.projection);$('execProjectionText').textContent=m.target?`${pct(m.target?m.projection/m.target*100:0)} da meta se o ritmo atual continuar`:'projeção provável de fechamento';
 $('execNeedDay').textContent=m.target&&m.target<=m.revenue?'Meta atingida':`${brl(m.needPerDay)}/dia`;$('execNeedText').textContent=m.remainingBiz?`em ${m.remainingBiz} dias úteis restantes`:'mês praticamente encerrado';
 $('execOperating').textContent=brl(m.operating);$('execCapitalRemaining').textContent=brl(m.capitalRemaining);$('execCapitalText').textContent=m.capitalRemaining?`${pct(m.invested?Math.max(0,Math.min(100,(1-m.capitalRemaining/m.invested)*100)):0)} do investimento recuperado`:'capital inicial recuperado';
 const cc=$('execCapitalCard');cc.classList.toggle('danger',m.capitalRemaining>0);cc.classList.toggle('good',m.capitalRemaining===0);
 $('execCashChip').textContent=brl(cash.current);$('execCashChip').className='exec-chip '+(cash.current<0?'red':'green');$('execRecoveryChip').textContent=rec.current<0?'Em recuperação':'Capital recuperado';$('execRecoveryChip').className='exec-chip '+(rec.current<0?'red':'green');
 drawGoal(g);drawCash(cash);drawRecovery(rec);
}

function hideLegacy(){const s=$('section-dashboard');if(s)s.classList.add('exec-mode')}
[0,400,1000,2200].forEach(t=>setTimeout(()=>{hideLegacy();refresh()},t));
document.addEventListener('click',e=>{const n=e.target.closest?.('.nav-item');if(n?.dataset.section==='dashboard')setTimeout(refresh,150)});
