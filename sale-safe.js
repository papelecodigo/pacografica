import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { jsPDF } from 'https://esm.sh/jspdf@2.5.2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const supabase=createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
const $=id=>document.getElementById(id);
const brl=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v||0));
const paymentNames={pix:'Pix',dinheiro:'Dinheiro',debito:'Débito',credito:'Crédito',outro:'Outro'};
const defaults={
  trade_name:'Papel e Código',
  legal_name:'49.815.267 Jhonatan Pereira de Sousa',
  cnpj:'49.815.267/0001-26',
  state_registration:'004562273.00-90',
  address:'Rua Parapanema, 117 - Casa - Senhora de Fátima',
  city:'Betim',state:'MG',zip_code:'32672-284',
  phone:'(31) 98325-6250',whatsapp:'(31) 98325-6250',
  email:'papelecodigo@gmail.com',instagram:'@graficapaco',
  pix_key:'CNPJ 49.815.267/0001-26',
  receipt_footer:'Obrigado pela preferência. Onde sua marca acontece.'
};
let lastSale=null,logoCache=null,editSale=null;

const localDate=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());
function localTime(date=new Date()){const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).formatToParts(date).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));return `${p.hour}:${p.minute}:${p.second}`}
const stamp=(day,time=localTime())=>`${day}T${time}-03:00`;
const dateOnly=iso=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date(iso));
const datePt=iso=>new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(iso));
const receiptNo=s=>`REC-${new Date(s.created_at).getFullYear()}-${String(s.id).slice(0,8).toUpperCase()}`;
function toast(msg,error=false){const el=$('toast');if(!el)return;el.textContent=msg;el.className='toast show'+(error?' error':'');clearTimeout(window.__safeToast);window.__safeToast=setTimeout(()=>el.className='toast',3000)}
function waNum(p=''){let d=String(p).replace(/\D/g,'');return d?(d.startsWith('55')?d:'55'+d):''}
function openWA(phone,text=''){const n=waNum(phone);if(!n)return toast('Informe o WhatsApp.',true);window.open(`https://wa.me/${n}${text?'?text='+encodeURIComponent(text):''}`,'_blank','noopener')}

function ensureDate(){
  let input=$('saleDate');
  if(input){if(!input.value)input.value=localDate();return input}
  const grid=document.querySelector('#section-sale .form-grid.three');
  if(!grid)return null;
  grid.classList.add('sale-grid-safe-date');
  const label=document.createElement('label');
  label.className='sale-date-field';
  label.innerHTML='Data da venda<input id="saleDate" type="date">';
  grid.appendChild(label);
  input=$('saleDate');input.value=localDate();
  if(!$('saleSafeStyles')){const st=document.createElement('style');st.id='saleSafeStyles';st.textContent=`
    #section-sale .sale-grid-safe-date{grid-template-columns:160px minmax(180px,1fr) minmax(210px,1fr) 165px}
    .sale-date-field input{font-weight:700;background:#fff}
    @media(max-width:1100px){#section-sale .sale-grid-safe-date{grid-template-columns:1fr 1fr}}
    @media(max-width:650px){#section-sale .sale-grid-safe-date{grid-template-columns:1fr}.sale-date-field{order:-1}}
  `;document.head.appendChild(st)}
  return input;
}

function enhanceRow(row){
  const price=row.querySelector('.item-price');if(!price)return;
  const label=price.closest('label');
  if(label&&!label.dataset.lineTotal){
    for(const node of label.childNodes){if(node.nodeType===Node.TEXT_NODE&&node.nodeValue.trim()){node.nodeValue='Valor total';break}}
    label.dataset.lineTotal='1';
  }
  price.placeholder='Valor total';price.title='Valor total deste serviço/lote';
}
function enhanceRows(){document.querySelectorAll('.sale-item').forEach(enhanceRow)}
function calcTotals(){
  let subtotal=0;document.querySelectorAll('.sale-item').forEach(r=>subtotal+=Number(r.querySelector('.item-price')?.value||0));
  const discount=Math.min(Number($('saleDiscount')?.value||0),subtotal),total=Math.max(0,subtotal-discount);
  if($('saleSubtotal'))$('saleSubtotal').textContent=brl(subtotal);
  if($('saleTotal'))$('saleTotal').textContent=brl(total);
  return{subtotal,discount,total};
}

document.addEventListener('input',e=>{if(e.target.matches?.('.item-price,.item-qty,#saleDiscount'))setTimeout(calcTotals,0)});
document.addEventListener('change',e=>{if(e.target.matches?.('.item-service,.item-qty'))setTimeout(()=>{enhanceRows();calcTotals()},0)});

async function user(){const{data}=await supabase.auth.getSession();return data?.session?.user||null}
async function settings(){const u=await user();if(!u)return defaults;const{data}=await supabase.from('company_settings').select('*').eq('user_id',u.id).maybeSingle();return{...defaults,...(data||{})}}
async function costs(ids){ids=[...new Set(ids.filter(Boolean))];if(!ids.length)return new Map();const{data}=await supabase.from('services').select('id,direct_cost').in('id',ids);return new Map((data||[]).map(s=>[s.id,Number(s.direct_cost||0)]))}

async function finish(e){
  e.preventDefault();e.stopImmediatePropagation();
  const btn=$('finishSaleBtn');if(!btn||btn.dataset.safeSaving==='1')return;
  const u=await user();if(!u)return toast('Sua sessão expirou.',true);
  const seller=$('saleSeller').value;if(!seller)return toast('Selecione o responsável.',true);
  const rows=[...document.querySelectorAll('.sale-item')].map(row=>({row,service_id:row.querySelector('.item-service')?.value||null,description:row.querySelector('.item-desc')?.value.trim()||'',quantity:Number(row.querySelector('.item-qty')?.value||0),line_total:Number(row.querySelector('.item-price')?.value||0)})).filter(x=>x.description&&x.quantity>0);
  if(!rows.length)return toast('Adicione pelo menos um item.',true);
  const c=calcTotals();if(c.total<=0)return toast('Informe o valor da venda.',true);
  const serviceCosts=await costs(rows.map(x=>x.service_id));
  const payload={user_id:u.id,seller_name:seller,customer_name:$('saleCustomer').value.trim()||null,customer_phone:$('salePhone').value.trim()||null,note:$('saleNote').value.trim()||null,subtotal:c.subtotal,discount:c.discount,total:c.total,payment_method:$('salePayment').value,created_at:stamp(ensureDate()?.value||localDate())};
  btn.dataset.safeSaving='1';btn.disabled=true;btn.textContent='Salvando...';
  const{data:sale,error}=await supabase.from('sales').insert(payload).select().single();
  if(error){btn.dataset.safeSaving='';btn.disabled=false;btn.textContent='Finalizar venda';return toast('Erro ao registrar venda.',true)}
  const items=rows.map(i=>{const q=Math.max(1,i.quantity),totalCost=Number(serviceCosts.get(i.service_id)||i.row.dataset.cost||0);return{sale_id:sale.id,service_id:i.service_id||null,description:i.description,quantity:i.quantity,unit_price:i.line_total/q,unit_cost:totalCost/q,total:i.line_total}});
  const{error:itemError}=await supabase.from('sale_items').insert(items);
  btn.dataset.safeSaving='';btn.disabled=false;btn.textContent='Finalizar venda';
  if(itemError)return toast('Venda salva, mas houve erro nos itens.',true);
  lastSale={...sale,sale_items:items};
  $('doneSaleTitle').textContent=sale.customer_name?`Venda de ${sale.customer_name} concluída.`:'Venda concluída.';$('doneSaleTotal').textContent=brl(sale.total);
  $('saleSeller').value='';$('saleCustomer').value='';$('salePhone').value='';$('saleNote').value='';$('saleDiscount').value=0;$('salePayment').value='pix';ensureDate().value=localDate();$('saleItems').innerHTML='';$('addItemBtn').click();setTimeout(()=>{enhanceRows();calcTotals()},0);
  $('saleDoneDialog').showModal();
}

async function logoData(){if(logoCache)return logoCache;try{const r=await fetch('./assets/brand-mark.png'),b=await r.blob();logoCache=await new Promise(res=>{const fr=new FileReader();fr.onload=()=>res(fr.result);fr.readAsDataURL(b)});return logoCache}catch{return null}}
async function receiptDoc(s){
  const set=await settings(),logo=await logoData(),doc=new jsPDF({unit:'mm',format:'a4'}),navy=[9,20,38],blue=[0,95,222],lime=[219,232,33],muted=[100,110,125];
  doc.setFillColor(...navy);doc.rect(0,0,210,40,'F');doc.setFillColor(...lime);doc.rect(0,37,210,3,'F');if(logo)doc.addImage(logo,'PNG',15,8,22,22);
  doc.setTextColor(255,255,255);doc.setFont('helvetica','bold');doc.setFontSize(17);doc.text(set.trade_name||'Papel e Código',43,17);doc.setFontSize(8);doc.setTextColor(...lime);doc.text('ONDE SUA MARCA ACONTECE.',43,24);doc.setTextColor(255,255,255);doc.setFontSize(8);doc.text('RECIBO COMERCIAL',194,14,{align:'right'});doc.setFontSize(10);doc.text(receiptNo(s),194,21,{align:'right'});doc.setFontSize(8);doc.setFont('helvetica','normal');doc.text(datePt(s.created_at),194,28,{align:'right'});
  let y=50;doc.setTextColor(25,34,49);doc.setFont('helvetica','bold');doc.setFontSize(9);doc.text('DADOS DA EMPRESA',15,y);y+=7;doc.setFont('helvetica','normal');doc.setFontSize(8.2);doc.setTextColor(...muted);
  [set.legal_name,`CNPJ ${set.cnpj||defaults.cnpj}${set.state_registration?'  •  IE '+set.state_registration:''}`,set.address,`${set.city||''}${set.state?' / '+set.state:''}${set.zip_code?'  •  CEP '+set.zip_code:''}`,`${set.phone||defaults.phone}  •  ${set.email||defaults.email}  •  ${set.instagram||defaults.instagram}`].filter(Boolean).forEach(t=>{doc.text(String(t),15,y);y+=4.7});
  y+=4;doc.setDrawColor(225,230,238);doc.line(15,y,195,y);y+=9;doc.setFillColor(246,248,251);doc.roundedRect(15,y,180,26,3,3,'F');doc.setTextColor(...muted);doc.setFont('helvetica','bold');doc.setFontSize(7.5);doc.text('CLIENTE',20,y+7);doc.text('RESPONSÁVEL',105,y+7);doc.setTextColor(25,34,49);doc.setFontSize(10);doc.text(s.customer_name||'Venda balcão',20,y+14);doc.text(s.seller_name||'—',105,y+14);doc.setFont('helvetica','normal');doc.setFontSize(8);doc.setTextColor(...muted);if(s.customer_phone)doc.text(s.customer_phone,20,y+21);doc.text(`Pagamento: ${paymentNames[s.payment_method]||s.payment_method||'—'}`,105,y+21);y+=37;
  doc.setTextColor(25,34,49);doc.setFont('helvetica','bold');doc.setFontSize(9);doc.text('ITENS DA VENDA',15,y);y+=7;doc.setFillColor(...blue);doc.roundedRect(15,y,180,9,2,2,'F');doc.setTextColor(255,255,255);doc.setFontSize(7.5);doc.text('DESCRIÇÃO',19,y+6);doc.text('QTD.',132,y+6,{align:'right'});doc.text('UNIT.',159,y+6,{align:'right'});doc.text('TOTAL',191,y+6,{align:'right'});y+=13;doc.setFont('helvetica','normal');doc.setTextColor(35,45,60);doc.setFontSize(8.3);
  for(const i of(s.sale_items||[])){const desc=doc.splitTextToSize(String(i.description||''),100);doc.text(desc,19,y);doc.text(String(i.quantity),132,y,{align:'right'});doc.text(brl(i.unit_price),159,y,{align:'right'});doc.setFont('helvetica','bold');doc.text(brl(i.total),191,y,{align:'right'});doc.setFont('helvetica','normal');y+=Math.max(8,desc.length*4.2+3);doc.setDrawColor(238,241,245);doc.line(19,y-3,191,y-3)}
  y+=5;doc.setFontSize(8.5);doc.setTextColor(...muted);doc.text('Subtotal',140,y);doc.setTextColor(25,34,49);doc.text(brl(s.subtotal),194,y,{align:'right'});y+=7;if(Number(s.discount||0)>0){doc.setTextColor(...muted);doc.text('Desconto',140,y);doc.setTextColor(25,34,49);doc.text('− '+brl(s.discount),194,y,{align:'right'});y+=7}doc.setFont('helvetica','bold');doc.setFontSize(12);doc.setTextColor(...navy);doc.text('VALOR DA VENDA',122,y);doc.setTextColor(...blue);doc.setFontSize(15);doc.text(brl(s.total),194,y,{align:'right'});y+=12;
  if(s.note){doc.setFillColor(250,251,252);doc.roundedRect(15,y,180,18,2,2,'F');doc.setTextColor(...muted);doc.setFontSize(7.2);doc.setFont('helvetica','bold');doc.text('OBSERVAÇÃO',20,y+6);doc.setTextColor(35,45,60);doc.setFont('helvetica','normal');doc.setFontSize(8);doc.text(doc.splitTextToSize(String(s.note),145),45,y+6);y+=24}
  const pix=(set.pix_key||defaults.pix_key).toLowerCase()==='cnpj'?`CNPJ ${set.cnpj||defaults.cnpj}`:(set.pix_key||defaults.pix_key);doc.setFillColor(247,250,205);doc.roundedRect(15,y,180,15,2,2,'F');doc.setTextColor(80,87,20);doc.setFont('helvetica','bold');doc.setFontSize(8);doc.text('PIX',20,y+6);doc.setFont('helvetica','normal');doc.text(String(pix),34,y+6);doc.text(`WhatsApp ${set.whatsapp||defaults.whatsapp}`,191,y+6,{align:'right'});doc.setDrawColor(230,233,238);doc.line(15,277,195,277);doc.setFontSize(7.2);doc.setTextColor(...muted);doc.text(set.receipt_footer||defaults.receipt_footer,15,283);doc.text('Recibo comercial. Não substitui nota fiscal quando esta for exigível.',195,288,{align:'right'});return doc;
}
async function downloadReceipt(s){const d=await receiptDoc(s);d.save(`${receiptNo(s)}.pdf`)}

function wireReceipt(){
  $('downloadReceiptBtn')?.addEventListener('click',async e=>{if(!lastSale)return;e.preventDefault();e.stopImmediatePropagation();await downloadReceipt(lastSale)},true);
  $('shareReceiptBtn')?.addEventListener('click',async e=>{if(!lastSale)return;e.preventDefault();e.stopImmediatePropagation();const d=await receiptDoc(lastSale),blob=d.output('blob'),file=new File([blob],`${receiptNo(lastSale)}.pdf`,{type:'application/pdf'});if(navigator.share&&navigator.canShare?.({files:[file]}))await navigator.share({files:[file],title:'Recibo Papel e Código'});else{d.save(file.name);toast('PDF baixado para envio.')}},true);
  $('whatsappReceiptBtn')?.addEventListener('click',e=>{if(!lastSale)return;e.preventDefault();e.stopImmediatePropagation();openWA(lastSale.customer_phone,`Olá, ${lastSale.customer_name||'cliente'}! Segue o recibo da sua compra na Papel e Código no valor de ${brl(lastSale.total)}.`)},true);
  $('closeDoneBtn')?.addEventListener('click',()=>{if(lastSale)setTimeout(()=>location.reload(),100)},true);
}

function ensureEditDialog(){if($('saleDateEditDialog'))return;const d=document.createElement('dialog');d.id='saleDateEditDialog';d.innerHTML=`<form id="saleDateEditForm" class="modal-card"><button type="button" class="modal-x" id="closeSaleDateEdit">×</button><p class="eyebrow">DATA DA VENDA</p><h3>Alterar data</h3><label>Nova data<input id="saleDateEditInput" type="date" required></label><button class="btn btn-primary" type="submit">Salvar nova data</button></form>`;document.body.appendChild(d);$('closeSaleDateEdit').onclick=()=>d.close();$('saleDateEditForm').onsubmit=async e=>{e.preventDefault();if(!editSale)return;const day=$('saleDateEditInput').value;const{error}=await supabase.from('sales').update({created_at:stamp(day,localTime(new Date(editSale.created_at)))}).eq('id',editSale.id);if(error)return toast('Erro ao alterar data.',true);d.close();toast('Data alterada.');setTimeout(()=>location.reload(),450)}}
async function historySales(){const day=$('historyDate')?.value||localDate();const{data}=await supabase.from('sales').select('*,sale_items(*)').gte('created_at',`${day}T00:00:00-03:00`).lte('created_at',`${day}T23:59:59-03:00`).order('created_at',{ascending:false});return data||[]}
function enhanceHistory(){const body=$('historyBody');if(!body)return;[...body.querySelectorAll('tr')].forEach((tr,i)=>{const actions=tr.querySelector('.table-actions');if(!actions||actions.querySelector('.edit-date-sale'))return;const b=document.createElement('button');b.className='table-action edit-date-sale';b.textContent='Editar data';b.onclick=async e=>{e.preventDefault();e.stopPropagation();const list=await historySales();editSale=list[i];if(!editSale)return;$('saleDateEditInput').value=dateOnly(editSale.created_at);$('saleDateEditDialog').showModal()};actions.insertBefore(b,actions.lastElementChild)})}

function init(){
  ensureDate();enhanceRows();calcTotals();ensureEditDialog();wireReceipt();
  $('finishSaleBtn')?.addEventListener('click',finish,true);
  const saleItems=$('saleItems');if(saleItems)new MutationObserver(()=>{enhanceRows();calcTotals()}).observe(saleItems,{childList:true});
  const history=$('historyBody');if(history)new MutationObserver(enhanceHistory).observe(history,{childList:true});enhanceHistory();
}
init();
