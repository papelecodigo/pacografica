import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { jsPDF } from 'https://esm.sh/jspdf@2.5.2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const configured = SUPABASE_URL.startsWith('https://') && !SUPABASE_ANON_KEY.includes('COLE_AQUI');
const supabase = configured ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;
const $ = (id) => document.getElementById(id);
const brl = (v) => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v||0));
const localDate = () => new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());
const timeFmt = (iso) => new Intl.DateTimeFormat('pt-BR',{hour:'2-digit',minute:'2-digit',timeZone:'America/Sao_Paulo'}).format(new Date(iso));
const dateShort = (iso) => new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(iso));
const dateFmt = (date) => new Intl.DateTimeFormat('pt-BR',{dateStyle:'full',timeZone:'America/Sao_Paulo'}).format(date);
const paymentNames = {pix:'Pix',dinheiro:'Dinheiro',debito:'Débito',credito:'Crédito',outro:'Outro'};
const state = { user:null, sales:[], movements:[], historySales:[], lastSale:null };

function toast(msg,error=false){
  const el=$('toast');
  el.textContent=msg;
  el.className='toast show'+(error?' error':'');
  clearTimeout(window.__toast);
  window.__toast=setTimeout(()=>el.className='toast',3200);
}

function showApp(on){
  $('loginView').classList.toggle('hidden',on);
  $('appView').classList.toggle('hidden',!on);
}

function nav(section){
  document.querySelectorAll('.section').forEach(x=>x.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(x=>x.classList.toggle('active',x.dataset.section===section));
  $('section-'+section).classList.add('active');
  const titles={dashboard:'Visão geral',sale:'Nova venda',cash:'Movimentações',history:'Histórico'};
  $('pageTitle').textContent=titles[section];
  if(section==='history') loadHistory();
  if(section==='sale') setTimeout(()=>document.querySelector('.item-desc')?.focus(),50);
}

document.querySelectorAll('.nav-item').forEach(b=>b.onclick=()=>nav(b.dataset.section));
document.querySelectorAll('[data-go]').forEach(b=>b.onclick=()=>nav(b.dataset.go));
$('newSaleTopBtn').onclick=()=>nav('sale');

$('todayLabel').textContent=dateFmt(new Date()).toUpperCase();
$('historyDate').value=localDate();
if(!configured)$('configWarning').classList.remove('hidden');

$('loginForm').addEventListener('submit',async(e)=>{
  e.preventDefault();
  if(!supabase)return toast('Configure o Supabase no arquivo config.js.',true);
  const {data,error}=await supabase.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});
  if(error)return toast('E-mail ou senha inválidos.',true);
  state.user=data.user;
  showApp(true);
  await refreshAll();
});

$('logoutBtn').onclick=async()=>{
  if(supabase)await supabase.auth.signOut();
  state.user=null;
  showApp(false);
};

async function restore(){
  if(!supabase)return;
  const {data}=await supabase.auth.getSession();
  if(data.session){
    state.user=data.session.user;
    showApp(true);
    await refreshAll();
  }
}

async function refreshAll(){
  await Promise.all([loadTodaySales(),loadMovements()]);
  renderDashboard();
  renderMovements();
}

function dayBounds(date=localDate()){
  return {start:date+'T00:00:00-03:00',end:date+'T23:59:59-03:00'};
}

async function loadTodaySales(){
  const {start,end}=dayBounds();
  const {data,error}=await supabase.from('sales').select('*,sale_items(*)').eq('user_id',state.user.id).gte('created_at',start).lte('created_at',end).order('created_at',{ascending:false});
  if(error)return toast('Erro ao carregar vendas.',true);
  state.sales=data||[];
}

async function loadMovements(){
  const {start,end}=dayBounds();
  const {data,error}=await supabase.from('cash_movements').select('*').eq('user_id',state.user.id).gte('created_at',start).lte('created_at',end).order('created_at',{ascending:false});
  if(error)return toast('Erro ao carregar movimentações.',true);
  state.movements=data||[];
}

function totals(){
  const salesTotal=state.sales.reduce((s,x)=>s+Number(x.total),0);
  const income=state.movements.filter(x=>x.type==='entrada').reduce((s,x)=>s+Number(x.amount),0);
  const expense=state.movements.filter(x=>x.type==='saida').reduce((s,x)=>s+Number(x.amount),0);
  return{salesTotal,income,expense,balance:salesTotal+income-expense};
}

function renderDashboard(){
  const t=totals();
  $('metricSales').textContent=brl(t.salesTotal);
  $('metricSalesCount').textContent=`${state.sales.length} ${state.sales.length===1?'venda':'vendas'}`;
  $('metricIncome').textContent=brl(t.income);
  $('metricExpense').textContent=brl(t.expense);
  $('metricBalance').textContent=brl(t.balance);

  const sums={};
  state.sales.forEach(s=>sums[s.payment_method]=(sums[s.payment_method]||0)+Number(s.total));
  const max=Math.max(1,...Object.values(sums));
  $('paymentSummary').innerHTML=Object.keys(paymentNames).map(k=>`<div class="payment-row"><span>${paymentNames[k]}</span><div class="payment-bar"><div class="payment-fill" style="width:${((sums[k]||0)/max)*100}%"></div></div><strong>${brl(sums[k]||0)}</strong></div>`).join('');

  $('recentSales').className=state.sales.length?'':'empty-state';
  $('recentSales').innerHTML=state.sales.length
    ?state.sales.slice(0,6).map(s=>`<div class="recent-row"><div><strong>${escapeHtml(s.customer_name||'Venda balcão')}</strong><small>${timeFmt(s.created_at)} · ${escapeHtml(s.seller_name||'Sem responsável')} · ${paymentNames[s.payment_method]||s.payment_method}</small></div><strong>${brl(s.total)}</strong></div>`).join('')
    :'Nenhuma venda registrada hoje.';
}

let itemId=0;
function addItem(){
  itemId++;
  const row=document.createElement('div');
  row.className='sale-item';
  row.dataset.id=itemId;
  row.innerHTML=`<label>Descrição<input class="item-desc" placeholder="Ex.: Cartão de visita" required></label><label>Quantidade<input class="item-qty" type="number" min="1" step="1" value="1"></label><label>Valor unitário<input class="item-price" type="number" min="0" step="0.01" value="0"></label><button class="icon-btn" title="Remover item" aria-label="Remover item">×</button>`;
  row.querySelectorAll('input').forEach(i=>i.addEventListener('input',calcSale));
  row.querySelector('.icon-btn').onclick=()=>{row.remove();calcSale()};
  $('saleItems').appendChild(row);
  calcSale();
}

$('addItemBtn').onclick=()=>{addItem();document.querySelector('.sale-item:last-child .item-desc')?.focus()};
$('saleDiscount').addEventListener('input',calcSale);

function calcSale(){
  let sub=0;
  document.querySelectorAll('.sale-item').forEach(r=>sub+=Number(r.querySelector('.item-qty').value||0)*Number(r.querySelector('.item-price').value||0));
  const discount=Math.min(Math.max(0,Number($('saleDiscount').value||0)),sub);
  const total=Math.max(0,sub-discount);
  $('saleSubtotal').textContent=brl(sub);
  $('saleTotal').textContent=brl(total);
  return{sub,discount,total};
}
addItem();

$('salePhone').addEventListener('input',e=>{
  e.target.value=formatPhone(e.target.value);
});

$('saleWhatsappBtn').onclick=()=>openWhatsApp($('salePhone').value);

function formatPhone(value=''){
  const d=value.replace(/\D/g,'').slice(0,11);
  if(d.length<=2)return d;
  if(d.length<=6)return `(${d.slice(0,2)}) ${d.slice(2)}`;
  if(d.length<=10)return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
}

function phoneForWhatsApp(phone=''){
  let d=String(phone).replace(/\D/g,'');
  if(!d)return '';
  if(d.startsWith('55')&&d.length>=12)return d;
  return '55'+d;
}

function whatsappMessage(sale){
  const customer=sale.customer_name||'cliente';
  return `Olá, ${customer}! Aqui é da Papel e Código. Segue o recibo referente à sua compra de ${brl(sale.total)}. Obrigado pela preferência!`;
}

function openWhatsApp(phone,sale=null){
  const number=phoneForWhatsApp(phone);
  if(!number)return toast('Adicione o WhatsApp do cliente primeiro.',true);
  const text=sale?`?text=${encodeURIComponent(whatsappMessage(sale))}`:'';
  window.open(`https://wa.me/${number}${text}`,'_blank','noopener');
}

function schemaError(error){
  const text=(error?.message||'').toLowerCase();
  return text.includes('seller_name')||text.includes('customer_phone')||text.includes('cash_session_id');
}

$('finishSaleBtn').onclick=async()=>{
  const seller=$('saleSeller').value;
  if(!seller)return toast('Selecione o responsável pela venda.',true);

  const items=[...document.querySelectorAll('.sale-item')].map(r=>({
    description:r.querySelector('.item-desc').value.trim(),
    quantity:Number(r.querySelector('.item-qty').value||0),
    unit_price:Number(r.querySelector('.item-price').value||0)
  })).filter(x=>x.description&&x.quantity>0);

  if(!items.length)return toast('Adicione pelo menos um item.',true);
  const c=calcSale();
  if(c.total<=0)return toast('O total da venda deve ser maior que zero.',true);

  const payload={
    user_id:state.user.id,
    seller_name:seller,
    customer_name:$('saleCustomer').value.trim()||null,
    customer_phone:$('salePhone').value.trim()||null,
    note:$('saleNote').value.trim()||null,
    subtotal:c.sub,
    discount:c.discount,
    total:c.total,
    payment_method:$('salePayment').value
  };

  $('finishSaleBtn').disabled=true;
  $('finishSaleBtn').textContent='Registrando...';
  const {data:sale,error}=await supabase.from('sales').insert(payload).select().single();
  if(error){
    $('finishSaleBtn').disabled=false;
    $('finishSaleBtn').textContent='Finalizar venda';
    if(schemaError(error))return toast('Falta aplicar a atualização do banco no Supabase.',true);
    return toast('Erro ao registrar a venda.',true);
  }

  const rows=items.map(i=>({...i,sale_id:sale.id,total:i.quantity*i.unit_price}));
  const {error:itemErr}=await supabase.from('sale_items').insert(rows);
  $('finishSaleBtn').disabled=false;
  $('finishSaleBtn').textContent='Finalizar venda';
  if(itemErr)return toast('Venda criada, mas houve erro ao salvar os itens.',true);

  state.lastSale={...sale,sale_items:rows};
  $('doneSaleTitle').textContent=sale.customer_name?`Venda de ${sale.customer_name} concluída.`:'Venda concluída.';
  $('doneSaleTotal').textContent=brl(sale.total);

  resetSaleForm();
  await refreshAll();
  $('saleDoneDialog').showModal();
};

function resetSaleForm(){
  $('saleSeller').value='';
  $('saleCustomer').value='';
  $('salePhone').value='';
  $('saleNote').value='';
  $('saleDiscount').value='0';
  $('salePayment').value='pix';
  $('saleItems').innerHTML='';
  addItem();
}

// Movimentações
const movementRadios=[...document.querySelectorAll('input[name="movement-kind"]')];
movementRadios.forEach(r=>r.addEventListener('change',()=>{$('movementType').value=r.value}));

$('movementForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const amount=Number($('movementAmount').value);
  if(!(amount>0))return toast('Informe um valor válido.',true);

  const {error}=await supabase.from('cash_movements').insert({
    user_id:state.user.id,
    type:$('movementType').value,
    description:$('movementDescription').value.trim(),
    amount
  });

  if(error){
    if(schemaError(error))return toast('Falta aplicar a atualização do banco no Supabase.',true);
    return toast('Erro ao registrar movimentação.',true);
  }

  e.target.reset();
  $('kindIncome').checked=true;
  $('movementType').value='entrada';
  toast('Movimentação registrada.');
  await refreshAll();
});

function renderMovements(){
  $('movementList').className=state.movements.length?'':'empty-state';
  $('movementList').innerHTML=state.movements.length
    ?state.movements.map(m=>`<div class="movement-row"><div><strong>${escapeHtml(m.description)}</strong><small>${timeFmt(m.created_at)} · ${m.type}</small></div><strong class="${m.type==='entrada'?'money-in':'money-out'}">${m.type==='entrada'?'+':'−'} ${brl(m.amount)}</strong></div>`).join('')
    :'Nenhuma movimentação registrada.';
}

// Histórico
$('historyDate').addEventListener('change',loadHistory);
async function loadHistory(){
  if(!supabase||!state.user)return;
  const d=$('historyDate').value||localDate();
  const {start,end}=dayBounds(d);
  const {data,error}=await supabase.from('sales').select('*,sale_items(*)').eq('user_id',state.user.id).gte('created_at',start).lte('created_at',end).order('created_at',{ascending:false});
  if(error)return toast('Erro ao carregar histórico.',true);
  state.historySales=data||[];
  renderHistory();
}

function renderHistory(){
  const body=$('historyBody');
  if(!state.historySales.length){
    body.innerHTML='<tr><td colspan="6" class="empty-state">Nenhuma venda nesta data.</td></tr>';
    return;
  }

  body.innerHTML=state.historySales.map((s,i)=>`<tr>
    <td>${timeFmt(s.created_at)}</td>
    <td><strong>${escapeHtml(s.customer_name||'Venda balcão')}</strong>${s.customer_phone?`<br><small>${escapeHtml(s.customer_phone)}</small>`:''}</td>
    <td>${escapeHtml(s.seller_name||'—')}</td>
    <td>${paymentNames[s.payment_method]||s.payment_method}</td>
    <td><strong>${brl(s.total)}</strong></td>
    <td class="actions-col"><div class="table-actions">
      <button class="table-action receipt-action" data-index="${i}" title="Gerar recibo PDF"><svg viewBox="0 0 24 24"><path d="M7 3h8l4 4v14H7zM15 3v5h5M10 13h6M10 17h6"/></svg>PDF</button>
      ${s.customer_phone?`<button class="table-action whatsapp whatsapp-action" data-index="${i}" title="Abrir WhatsApp"><svg viewBox="0 0 24 24"><path d="M20 11.5a8 8 0 0 1-11.8 7L4 20l1.5-4.1A8 8 0 1 1 20 11.5Z"/></svg>WhatsApp</button>`:''}
    </div></td>
  </tr>`).join('');

  body.querySelectorAll('.receipt-action').forEach(btn=>btn.onclick=()=>downloadReceipt(state.historySales[Number(btn.dataset.index)]));
  body.querySelectorAll('.whatsapp-action').forEach(btn=>{
    btn.onclick=()=>{const sale=state.historySales[Number(btn.dataset.index)];openWhatsApp(sale.customer_phone,sale)};
  });
}

// Recibos PDF
let logoDataUrlCache=null;
async function logoDataUrl(){
  if(logoDataUrlCache)return logoDataUrlCache;
  try{
    const response=await fetch('./assets/brand-mark.png');
    const blob=await response.blob();
    logoDataUrlCache=await new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=()=>resolve(reader.result);
      reader.onerror=reject;
      reader.readAsDataURL(blob);
    });
    return logoDataUrlCache;
  }catch{return null}
}

async function receiptDoc(sale){
  const doc=new jsPDF({unit:'mm',format:'a4'});
  const pageW=210;
  const margin=18;
  const right=pageW-margin;
  const logo=await logoDataUrl();

  doc.setFillColor(11,18,32);
  doc.rect(0,0,pageW,34,'F');
  if(logo)doc.addImage(logo,'PNG',18,8,18,18);
  doc.setTextColor(255,255,255);
  doc.setFont('helvetica','bold');
  doc.setFontSize(15);
  doc.text('PAPEL E CÓDIGO',42,15);
  doc.setFont('helvetica','normal');
  doc.setFontSize(8.5);
  doc.setTextColor(219,232,33);
  doc.text('RECIBO DE VENDA',42,21);
  doc.setTextColor(190,198,211);
  doc.text('Onde sua marca acontece.',42,26);

  let y=47;
  doc.setTextColor(24,32,51);
  doc.setFont('helvetica','bold');
  doc.setFontSize(18);
  doc.text('Recibo',margin,y);
  doc.setFontSize(9);
  doc.setFont('helvetica','normal');
  doc.setTextColor(108,118,135);
  doc.text(`#${String(sale.id||'').slice(0,8).toUpperCase()}`,right,y,{align:'right'});
  y+=10;

  const info=[
    ['Data',dateShort(sale.created_at||new Date().toISOString())],
    ['Cliente',sale.customer_name||'Venda balcão'],
    ['Contato',sale.customer_phone||'—'],
    ['Responsável',sale.seller_name||'—'],
    ['Pagamento',paymentNames[sale.payment_method]||sale.payment_method||'—']
  ];

  doc.setFillColor(248,249,251);
  doc.roundedRect(margin,y,right-margin,31,2,2,'F');
  info.forEach((row,i)=>{
    const col=i%2, line=Math.floor(i/2);
    const x=margin+6+(col*83), yy=y+7+(line*9);
    doc.setFontSize(7);
    doc.setTextColor(145,153,166);
    doc.setFont('helvetica','bold');
    doc.text(row[0].toUpperCase(),x,yy);
    doc.setFontSize(9);
    doc.setTextColor(40,49,67);
    doc.setFont('helvetica','normal');
    doc.text(String(row[1]).slice(0,35),x,yy+4);
  });
  y+=42;

  doc.setFont('helvetica','bold');
  doc.setFontSize(8);
  doc.setTextColor(118,127,141);
  doc.text('ITEM',margin,y);
  doc.text('QTD.',132,y,{align:'right'});
  doc.text('VALOR UN.',158,y,{align:'right'});
  doc.text('TOTAL',right,y,{align:'right'});
  y+=4;
  doc.setDrawColor(226,230,236);
  doc.line(margin,y,right,y);
  y+=7;

  const items=sale.sale_items||[];
  items.forEach(item=>{
    if(y>245){doc.addPage();y=20}
    doc.setFont('helvetica','normal');
    doc.setFontSize(9);
    doc.setTextColor(37,47,65);
    const lines=doc.splitTextToSize(item.description||'Item',96);
    doc.text(lines,margin,y);
    doc.text(String(Number(item.quantity||0)),132,y,{align:'right'});
    doc.text(brl(item.unit_price).replace('R$ ','R$ '),158,y,{align:'right'});
    doc.setFont('helvetica','bold');
    doc.text(brl(item.total).replace('R$ ','R$ '),right,y,{align:'right'});
    y+=Math.max(9,lines.length*5+3);
    doc.setDrawColor(239,241,244);
    doc.line(margin,y-3,right,y-3);
  });

  y+=5;
  const totals=[['Subtotal',sale.subtotal],['Desconto',-Number(sale.discount||0)]];
  totals.forEach(([label,value])=>{
    doc.setFont('helvetica','normal');
    doc.setFontSize(9);
    doc.setTextColor(108,118,135);
    doc.text(label,145,y);
    doc.setTextColor(39,49,67);
    const display=label==='Desconto'&&Number(sale.discount)>0?`- ${brl(Math.abs(value)).replace('R$ ','R$ ')}`:brl(value).replace('R$ ','R$ ');
    doc.text(display,right,y,{align:'right'});
    y+=7;
  });

  doc.setDrawColor(0,95,222);
  doc.setLineWidth(.7);
  doc.line(142,y,right,y);
  y+=9;
  doc.setFont('helvetica','bold');
  doc.setFontSize(11);
  doc.setTextColor(18,27,43);
  doc.text('TOTAL',145,y);
  doc.setFontSize(14);
  doc.text(brl(sale.total).replace('R$ ','R$ '),right,y,{align:'right'});
  y+=13;

  if(sale.note){
    doc.setFillColor(247,250,205);
    const noteLines=doc.splitTextToSize(String(sale.note),right-margin-12);
    const h=12+noteLines.length*4;
    doc.roundedRect(margin,y,right-margin,h,2,2,'F');
    doc.setFontSize(7);
    doc.setFont('helvetica','bold');
    doc.setTextColor(115,122,37);
    doc.text('OBSERVAÇÃO',margin+6,y+6);
    doc.setFontSize(8.5);
    doc.setFont('helvetica','normal');
    doc.setTextColor(66,72,38);
    doc.text(noteLines,margin+6,y+11);
    y+=h+8;
  }

  doc.setFont('helvetica','normal');
  doc.setFontSize(7.5);
  doc.setTextColor(154,161,171);
  doc.text('Documento gerado pelo Caixa Papel e Código.',margin,285);
  doc.text('Obrigado pela preferência.',right,285,{align:'right'});
  return doc;
}

function receiptFilename(sale){
  const customer=(sale.customer_name||'cliente').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9]+/g,'-').replace(/^-|-$/g,'').toLowerCase();
  return `recibo-${customer||'cliente'}-${localDate()}.pdf`;
}

async function downloadReceipt(sale){
  if(!sale)return;
  try{
    const doc=await receiptDoc(sale);
    doc.save(receiptFilename(sale));
    toast('Recibo em PDF gerado.');
  }catch(e){
    console.error(e);
    toast('Não foi possível gerar o recibo.',true);
  }
}

async function shareReceipt(sale){
  if(!sale)return;
  try{
    const doc=await receiptDoc(sale);
    const blob=doc.output('blob');
    const file=new File([blob],receiptFilename(sale),{type:'application/pdf'});
    if(navigator.share && navigator.canShare?.({files:[file]})){
      await navigator.share({title:'Recibo Papel e Código',text:whatsappMessage(sale),files:[file]});
      return;
    }
    doc.save(receiptFilename(sale));
    if(sale.customer_phone)openWhatsApp(sale.customer_phone,sale);
    toast(sale.customer_phone?'PDF baixado. Agora é só anexar no WhatsApp.':'PDF baixado para compartilhamento.');
  }catch(e){
    if(e?.name!=='AbortError'){
      console.error(e);
      toast('Não foi possível compartilhar o recibo.',true);
    }
  }
}

$('downloadReceiptBtn').onclick=()=>downloadReceipt(state.lastSale);
$('shareReceiptBtn').onclick=()=>shareReceipt(state.lastSale);
$('whatsappReceiptBtn').onclick=()=>state.lastSale&&openWhatsApp(state.lastSale.customer_phone,state.lastSale);
$('closeDoneBtn').onclick=()=>{$('saleDoneDialog').close();nav('dashboard')};
$('saleDoneDialog').addEventListener('close',()=>{if(document.querySelector('#section-sale.active'))nav('dashboard')});

function escapeHtml(s=''){
  return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
}

restore();
