import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { jsPDF } from 'https://esm.sh/jspdf@2.5.2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const $ = id => document.getElementById(id);
const brl = v => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v||0));
const paymentNames={pix:'Pix',dinheiro:'Dinheiro',debito:'Débito',credito:'Crédito',outro:'Outro'};
const companyDefaults={
  trade_name:'Papel e Código',
  legal_name:'49.815.267 Jhonatan Pereira de Sousa',
  cnpj:'49.815.267/0001-26',
  state_registration:'004562273.00-90',
  address:'Rua Parapanema, 117 - Casa - Senhora de Fátima',
  city:'Betim',
  state:'MG',
  zip_code:'32672-284',
  phone:'(31) 98325-6250',
  whatsapp:'(31) 98325-6250',
  email:'papelecodigo@gmail.com',
  instagram:'@graficapaco',
  pix_key:'CNPJ 49.815.267/0001-26',
  receipt_footer:'Obrigado pela preferência. Onde sua marca acontece.'
};
let lastSale=null, logoCache=null, editSale=null;

function localDate(){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date())}
function localTimeParts(date=new Date()){
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).formatToParts(date).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
  return `${parts.hour}:${parts.minute}:${parts.second}`;
}
function timestampFor(date,time=localTimeParts()){return `${date}T${time}-03:00`}
function dateOnly(iso){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date(iso))}
function timeOnly(iso){return localTimeParts(new Date(iso))}
function datePt(iso){return new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(iso))}
function receiptNo(s){return `REC-${new Date(s.created_at).getFullYear()}-${String(s.id).slice(0,8).toUpperCase()}`}
function waNum(p=''){let d=String(p).replace(/\D/g,'');if(!d)return'';return d.startsWith('55')?d:'55'+d}
function openWhatsapp(phone,text=''){const n=waNum(phone);if(!n)return;window.open(`https://wa.me/${n}${text?'?text='+encodeURIComponent(text):''}`,'_blank','noopener')}
function toast(msg,error=false){const e=$('toast');if(!e)return; e.textContent=msg;e.className='toast show'+(error?' error':'');setTimeout(()=>e.className='toast',3200)}

function injectStyles(){
  if($('saleDateReceiptStyles'))return;
  const st=document.createElement('style');st.id='saleDateReceiptStyles';st.textContent=`
  #section-sale .form-grid.three.sale-grid-with-date{grid-template-columns:160px minmax(180px,1fr) minmax(210px,1fr) 165px}
  .sale-date-field input{font-weight:700}
  .edit-date-sale{color:#475467}
  #saleDateEditDialog .modal-card{max-width:390px}
  @media(max-width:1100px){#section-sale .form-grid.three.sale-grid-with-date{grid-template-columns:1fr 1fr}}
  @media(max-width:650px){#section-sale .form-grid.three.sale-grid-with-date{grid-template-columns:1fr}.sale-date-field{order:-1}}
  `;document.head.appendChild(st);
}

function injectSaleDate(){
  if($('saleDate'))return;
  const grid=document.querySelector('#section-sale .form-grid.three');
  if(!grid)return;
  grid.classList.add('sale-grid-with-date');
  const label=document.createElement('label');label.className='sale-date-field';label.innerHTML='Data da venda<input id="saleDate" type="date">';
  grid.appendChild(label);$('saleDate').value=localDate();
}

function ensureDateDialog(){
  if($('saleDateEditDialog'))return;
  const d=document.createElement('dialog');d.id='saleDateEditDialog';d.innerHTML=`<form id="saleDateEditForm" class="modal-card">
    <button type="button" class="modal-x" id="closeSaleDateEdit">×</button>
    <p class="eyebrow">DATA DA VENDA</p><h3>Alterar data</h3>
    <p class="muted">A venda será movida para a data escolhida e os gráficos serão recalculados.</p>
    <label>Nova data<input id="saleDateEditInput" type="date" required></label>
    <button class="btn btn-primary" type="submit">Salvar nova data</button>
  </form>`;document.body.appendChild(d);
  $('closeSaleDateEdit').onclick=()=>d.close();
  $('saleDateEditForm').onsubmit=async e=>{e.preventDefault();if(!editSale)return;const day=$('saleDateEditInput').value;if(!day)return;const created_at=timestampFor(day,timeOnly(editSale.created_at));const{error}=await supabase.from('sales').update({created_at}).eq('id',editSale.id);if(error)return toast('Não foi possível alterar a data.',true);d.close();toast('Data da venda alterada.');setTimeout(()=>location.reload(),650)};
}

async function sessionUser(){const{data}=await supabase.auth.getSession();return data?.session?.user||null}
async function ensureCompanyDefaults(){
  const user=await sessionUser();if(!user)return;
  const{data,error}=await supabase.from('company_settings').select('*').eq('user_id',user.id).maybeSingle();if(error)return;
  const patch={user_id:user.id};let changed=!data;
  for(const[k,v]of Object.entries(companyDefaults)){if(!data?.[k]){patch[k]=v;changed=true}}
  if(changed)await supabase.from('company_settings').upsert({...data,...patch,updated_at:new Date().toISOString()});
}
async function getSettings(){const user=await sessionUser();if(!user)return companyDefaults;const{data}=await supabase.from('company_settings').select('*').eq('user_id',user.id).maybeSingle();return {...companyDefaults,...(data||{})}}

async function getServiceCosts(rows){const ids=[...new Set(rows.map(r=>r.service_id).filter(Boolean))];if(!ids.length)return new Map();const{data}=await supabase.from('services').select('id,direct_cost').in('id',ids);return new Map((data||[]).map(s=>[s.id,Number(s.direct_cost||0)]))}

async function finishSaleWithDate(ev){
  ev.preventDefault();ev.stopImmediatePropagation();
  const btn=$('finishSaleBtn');if(btn.dataset.saving==='1')return;
  const user=await sessionUser();if(!user)return toast('Sua sessão expirou. Entre novamente.',true);
  const seller=$('saleSeller').value;if(!seller)return toast('Selecione o responsável.',true);
  const raw=[...document.querySelectorAll('.sale-item')].map(r=>({row:r,service_id:r.querySelector('.item-service')?.value||null,description:r.querySelector('.item-desc')?.value.trim()||'',quantity:Number(r.querySelector('.item-qty')?.value||0),unit_price:Number(r.querySelector('.item-price')?.value||0)})).filter(x=>x.description&&x.quantity>0);
  if(!raw.length)return toast('Adicione pelo menos um item.',true);
  const subtotal=raw.reduce((a,i)=>a+i.quantity*i.unit_price,0),discount=Math.min(Number($('saleDiscount').value||0),subtotal),total=Math.max(0,subtotal-discount);if(total<=0)return toast('Venda sem valor.',true);
  const costs=await getServiceCosts(raw);const day=$('saleDate')?.value||localDate();
  const payload={user_id:user.id,seller_name:seller,customer_name:$('saleCustomer').value.trim()||null,customer_phone:$('salePhone').value.trim()||null,note:$('saleNote').value.trim()||null,subtotal,discount,total,payment_method:$('salePayment').value,created_at:timestampFor(day)};
  btn.dataset.saving='1';btn.disabled=true;btn.textContent='Salvando...';
  const{data:sale,error}=await supabase.from('sales').insert(payload).select().single();
  if(error){btn.dataset.saving='';btn.disabled=false;btn.textContent='Finalizar venda';return toast('Erro ao registrar venda.',true)}
  const items=raw.map(i=>({sale_id:sale.id,service_id:i.service_id||null,description:i.description,quantity:i.quantity,unit_price:i.unit_price,unit_cost:costs.get(i.service_id)||0,total:i.quantity*i.unit_price}));
  const{error:itemError}=await supabase.from('sale_items').insert(items);btn.dataset.saving='';btn.disabled=false;btn.textContent='Finalizar venda';
  if(itemError)return toast('Venda salva, mas houve erro nos itens.',true);
  lastSale={...sale,sale_items:items};
  $('doneSaleTitle').textContent=sale.customer_name?`Venda de ${sale.customer_name} concluída.`:'Venda concluída.';$('doneSaleTotal').textContent=brl(sale.total);
  $('saleSeller').value='';$('saleCustomer').value='';$('salePhone').value='';$('saleNote').value='';$('saleDiscount').value=0;$('salePayment').value='pix';if($('saleDate'))$('saleDate').value=localDate();$('saleItems').innerHTML='';$('addItemBtn').click();
  $('saleDoneDialog').showModal();
}

async function logoData(){if(logoCache)return logoCache;try{const r=await fetch('./assets/brand-mark.png'),b=await r.blob();logoCache=await new Promise(res=>{const fr=new FileReader();fr.onload=()=>res(fr.result);fr.readAsDataURL(b)});return logoCache}catch{return null}}
function txt(doc,text,x,y,opts={}){doc.text(String(text||''),x,y,opts)}

async function receiptDoc(s){
  const set=await getSettings(),logo=await logoData(),doc=new jsPDF({unit:'mm',format:'a4'});const blue=[0,95,222],navy=[9,20,38],lime=[219,232,33],muted=[102,112,128];
  doc.setFillColor(...navy);doc.rect(0,0,210,42,'F');doc.setFillColor(...lime);doc.rect(0,39,210,3,'F');
  if(logo)doc.addImage(logo,'PNG',15,9,22,22);
  doc.setTextColor(255,255,255);doc.setFont('helvetica','bold');doc.setFontSize(18);txt(doc,set.trade_name||'Papel e Código',43,17);doc.setFontSize(8);doc.setTextColor(...lime);txt(doc,'ONDE SUA MARCA ACONTECE.',43,24);
  doc.setTextColor(255,255,255);doc.setFontSize(8);doc.setFont('helvetica','normal');txt(doc,'RECIBO COMERCIAL',194,14,{align:'right'});doc.setFont('helvetica','bold');doc.setFontSize(10);txt(doc,receiptNo(s),194,21,{align:'right'});doc.setFont('helvetica','normal');doc.setFontSize(8);txt(doc,datePt(s.created_at),194,28,{align:'right'});

  let y=52;doc.setTextColor(20,30,45);doc.setFont('helvetica','bold');doc.setFontSize(9);txt(doc,'DADOS DA EMPRESA',15,y);y+=7;doc.setFont('helvetica','normal');doc.setFontSize(8.3);doc.setTextColor(...muted);
  const companyLines=[set.legal_name,`CNPJ ${set.cnpj||companyDefaults.cnpj}${set.state_registration?'  •  IE '+set.state_registration:''}`,`${set.address||''}`,`${set.city||''}${set.state?' / '+set.state:''}${set.zip_code?'  •  CEP '+set.zip_code:''}`,`${set.phone||companyDefaults.phone}  •  ${set.email||companyDefaults.email}  •  ${set.instagram||companyDefaults.instagram}`].filter(Boolean);
  companyLines.forEach(l=>{txt(doc,l,15,y);y+=4.8});
  y+=4;doc.setDrawColor(226,230,236);doc.line(15,y,195,y);y+=10;

  doc.setFillColor(246,248,251);doc.roundedRect(15,y,180,27,3,3,'F');doc.setTextColor(...muted);doc.setFontSize(7.5);doc.setFont('helvetica','bold');txt(doc,'CLIENTE',20,y+7);txt(doc,'RESPONSÁVEL',105,y+7);doc.setFont('helvetica','normal');doc.setFontSize(10);doc.setTextColor(25,34,49);txt(doc,s.customer_name||'Venda balcão',20,y+14);txt(doc,s.seller_name||'—',105,y+14);doc.setFontSize(8);doc.setTextColor(...muted);if(s.customer_phone)txt(doc,s.customer_phone,20,y+21);txt(doc,`Pagamento: ${paymentNames[s.payment_method]||s.payment_method||'—'}`,105,y+21);y+=38;

  doc.setTextColor(20,30,45);doc.setFont('helvetica','bold');doc.setFontSize(9);txt(doc,'ITENS DA VENDA',15,y);y+=7;
  doc.setFillColor(...blue);doc.roundedRect(15,y,180,9,2,2,'F');doc.setTextColor(255,255,255);doc.setFontSize(7.5);txt(doc,'DESCRIÇÃO',19,y+6);txt(doc,'QTD.',132,y+6,{align:'right'});txt(doc,'UNIT.',159,y+6,{align:'right'});txt(doc,'TOTAL',191,y+6,{align:'right'});y+=13;
  doc.setFont('helvetica','normal');doc.setTextColor(35,45,60);doc.setFontSize(8.4);
  for(const i of (s.sale_items||[])){
    if(y>235){doc.addPage();y=22}
    const desc=doc.splitTextToSize(String(i.description||''),102);txt(doc,desc,19,y);txt(doc,String(i.quantity),132,y,{align:'right'});txt(doc,brl(i.unit_price),159,y,{align:'right'});doc.setFont('helvetica','bold');txt(doc,brl(i.total),191,y,{align:'right'});doc.setFont('helvetica','normal');y+=Math.max(8,desc.length*4.2+3);doc.setDrawColor(239,241,245);doc.line(19,y-3,191,y-3);
  }
  y+=4;doc.setDrawColor(215,220,228);doc.line(115,y,195,y);y+=7;doc.setFontSize(8.5);doc.setTextColor(...muted);txt(doc,'Subtotal',140,y);doc.setTextColor(25,34,49);txt(doc,brl(s.subtotal),194,y,{align:'right'});y+=6;if(Number(s.discount||0)>0){doc.setTextColor(...muted);txt(doc,'Desconto',140,y);doc.setTextColor(25,34,49);txt(doc,'− '+brl(s.discount),194,y,{align:'right'});y+=7}
  doc.setFont('helvetica','bold');doc.setTextColor(...navy);doc.setFontSize(12);txt(doc,'VALOR DA VENDA',123,y);doc.setTextColor(...blue);doc.setFontSize(15);txt(doc,brl(s.total),194,y,{align:'right'});y+=12;

  if(s.note){doc.setFillColor(250,251,252);doc.roundedRect(15,y,180,18,2,2,'F');doc.setTextColor(...muted);doc.setFont('helvetica','bold');doc.setFontSize(7.2);txt(doc,'OBSERVAÇÃO',20,y+6);doc.setFont('helvetica','normal');doc.setTextColor(35,45,60);doc.setFontSize(8);txt(doc,doc.splitTextToSize(String(s.note),145),45,y+6);y+=25}
  const pix=(set.pix_key||companyDefaults.pix_key).toLowerCase()==='cnpj'?`CNPJ ${set.cnpj||companyDefaults.cnpj}`:(set.pix_key||companyDefaults.pix_key);doc.setFillColor(247,250,205);doc.roundedRect(15,y,180,15,2,2,'F');doc.setTextColor(80,87,20);doc.setFont('helvetica','bold');doc.setFontSize(8);txt(doc,'PIX',20,y+6);doc.setFont('helvetica','normal');txt(doc,pix,34,y+6);txt(doc,`WhatsApp ${set.whatsapp||companyDefaults.whatsapp}`,191,y+6,{align:'right'});y+=22;

  doc.setDrawColor(230,233,238);doc.line(15,277,195,277);doc.setFontSize(7.2);doc.setTextColor(...muted);doc.setFont('helvetica','normal');txt(doc,set.receipt_footer||companyDefaults.receipt_footer,15,283);txt(doc,'Recibo comercial. Este documento não substitui nota fiscal quando esta for exigível.',195,288,{align:'right'});
  return doc;
}
async function downloadReceipt(s){const d=await receiptDoc(s);d.save(`${receiptNo(s)}.pdf`)}
async function getHistorySales(){const day=$('historyDate')?.value||localDate();const{data}=await supabase.from('sales').select('*,sale_items(*)').gte('created_at',`${day}T00:00:00-03:00`).lte('created_at',`${day}T23:59:59-03:00`).order('created_at',{ascending:false});return data||[]}

function enhanceHistory(){
  const body=$('historyBody');if(!body)return;const rows=[...body.querySelectorAll('tr')];rows.forEach((tr,i)=>{const actions=tr.querySelector('.table-actions');if(!actions||actions.querySelector('.edit-date-sale'))return;const b=document.createElement('button');b.className='table-action edit-date-sale';b.textContent='Editar data';b.onclick=async e=>{e.preventDefault();e.stopPropagation();const sales=await getHistorySales();editSale=sales[i];if(!editSale)return;$('saleDateEditInput').value=dateOnly(editSale.created_at);$('saleDateEditDialog').showModal()};actions.insertBefore(b,actions.lastElementChild)});
}

function interceptReceiptButtons(){
  $('downloadReceiptBtn')?.addEventListener('click',async e=>{if(!lastSale)return;e.preventDefault();e.stopImmediatePropagation();await downloadReceipt(lastSale)},{capture:true});
  $('shareReceiptBtn')?.addEventListener('click',async e=>{if(!lastSale)return;e.preventDefault();e.stopImmediatePropagation();const d=await receiptDoc(lastSale),blob=d.output('blob'),file=new File([blob],`${receiptNo(lastSale)}.pdf`,{type:'application/pdf'});if(navigator.share&&navigator.canShare?.({files:[file]}))await navigator.share({files:[file],title:'Recibo Papel e Código'});else{d.save(file.name);toast('PDF baixado para envio.')}},{capture:true});
  $('whatsappReceiptBtn')?.addEventListener('click',e=>{if(!lastSale)return;e.preventDefault();e.stopImmediatePropagation();openWhatsapp(lastSale.customer_phone,`Olá, ${lastSale.customer_name||'cliente'}! Segue o recibo da sua compra na Papel e Código no valor de ${brl(lastSale.total)}.`)},{capture:true});
  $('closeDoneBtn')?.addEventListener('click',()=>{if(lastSale)setTimeout(()=>location.reload(),80)},{capture:true});
  document.addEventListener('click',async e=>{const btn=e.target.closest?.('.pdf-sale');if(!btn)return;e.preventDefault();e.stopImmediatePropagation();const sales=await getHistorySales(),s=sales[Number(btn.dataset.i)];if(s)await downloadReceipt(s)},true);
}

async function init(){injectStyles();injectSaleDate();ensureDateDialog();interceptReceiptButtons();$('finishSaleBtn')?.addEventListener('click',finishSaleWithDate,{capture:true});await ensureCompanyDefaults();const obs=new MutationObserver(enhanceHistory);if($('historyBody'))obs.observe($('historyBody'),{childList:true,subtree:true});enhanceHistory()}
init();
