import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { jsPDF } from 'https://esm.sh/jspdf@2.5.2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const $ = id => document.getElementById(id);
const brl = v => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v||0));
const paymentNames={pix:'Pix',dinheiro:'Dinheiro',debito:'Débito',credito:'Crédito',outro:'Outro'};
const CREATE_VALUE='__quick_create_service__';
const quickServices=new Map();
let targetSelect=null;
let lastSale=null;
let originalAddItem=null;

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

function today(){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date())}
function clock(){const p=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).formatToParts(new Date()).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));return `${p.hour}:${p.minute}:${p.second}`}
function stamp(day){return `${day}T${clock()}-03:00`}
function receiptNo(s){return `REC-${new Date(s.created_at).getFullYear()}-${String(s.id).slice(0,8).toUpperCase()}`}
function toast(msg,error=false){const el=$('toast');if(!el)return;el.textContent=msg;el.className='toast show'+(error?' error':'');clearTimeout(window.__liteToast);window.__liteToast=setTimeout(()=>el.className='toast',3000)}
function waNum(p=''){let d=String(p).replace(/\D/g,'');return d?(d.startsWith('55')?d:'55'+d):''}
function openWA(phone,text=''){const n=waNum(phone);if(!n)return toast('Informe o WhatsApp.',true);window.open(`https://wa.me/${n}${text?'?text='+encodeURIComponent(text):''}`,'_blank','noopener')}

function installStyle(){
  if($('saleLiteStyle'))return;
  const st=document.createElement('style');st.id='saleLiteStyle';st.textContent=`
    #section-sale .sale-grid-lite{grid-template-columns:160px minmax(180px,1fr) minmax(210px,1fr) 165px}
    .sale-date-field input{font-weight:700;background:#fff}
    @media(max-width:1100px){#section-sale .sale-grid-lite{grid-template-columns:1fr 1fr}}
    @media(max-width:650px){#section-sale .sale-grid-lite{grid-template-columns:1fr}.sale-date-field{order:-1}}
  `;document.head.appendChild(st);
}

function ensureDate(){
  let input=$('saleDate');
  if(input){if(!input.value)input.value=today();return input}
  const grid=document.querySelector('#section-sale .form-grid.three');if(!grid)return null;
  grid.classList.add('sale-grid-lite');
  const label=document.createElement('label');label.className='sale-date-field';label.innerHTML='Data da venda<input id="saleDate" type="date">';grid.appendChild(label);
  input=$('saleDate');input.value=today();return input;
}

function calc(){
  let subtotal=0;
  document.querySelectorAll('.sale-item').forEach(row=>subtotal+=Number(row.querySelector('.item-price')?.value||0));
  const discount=Math.min(Number($('saleDiscount')?.value||0),subtotal),total=Math.max(0,subtotal-discount);
  if($('saleSubtotal'))$('saleSubtotal').textContent=brl(subtotal);
  if($('saleTotal'))$('saleTotal').textContent=brl(total);
  return{subtotal,discount,total};
}

function ensureQuickOption(select){
  for(const s of quickServices.values()){
    if(!select.querySelector(`option[value="${CSS.escape(s.id)}"]`)){const o=document.createElement('option');o.value=s.id;o.textContent=s.name;select.appendChild(o)}
  }
  if(!select.querySelector(`option[value="${CREATE_VALUE}"]`)){const o=document.createElement('option');o.value=CREATE_VALUE;o.textContent='＋ Cadastrar novo serviço';select.appendChild(o)}
}

function patchRow(row){
  if(row.dataset.litePatched==='1')return;
  row.dataset.litePatched='1';
  const price=row.querySelector('.item-price'),qty=row.querySelector('.item-qty'),select=row.querySelector('.item-service'),remove=row.querySelector('.remove-item');
  if(price){
    const label=price.closest('label');if(label){for(const node of label.childNodes){if(node.nodeType===Node.TEXT_NODE&&node.nodeValue.trim()){node.nodeValue='Valor total';break}}}
    price.placeholder='Valor total';price.title='Valor total do serviço/lote';price.oninput=calc;
  }
  if(qty)qty.oninput=calc;
  if(remove)remove.onclick=()=>{row.remove();calc()};
  if(select){
    ensureQuickOption(select);
    const old=select.onchange;
    select.onchange=()=>{
      if(select.value===CREATE_VALUE){openQuickCreate(select);return}
      const q=quickServices.get(select.value);
      if(q){applyQuickService(select,q);return}
      if(typeof old==='function')old.call(select);
      setTimeout(calc,0);
    };
  }
}
function patchRows(){document.querySelectorAll('.sale-item').forEach(patchRow);calc()}

function ensureQuickDialog(){
  if($('quickServiceDialog'))return;
  const d=document.createElement('dialog');d.id='quickServiceDialog';d.innerHTML=`<form id="quickServiceForm" class="modal-card">
    <button type="button" class="modal-x" id="closeQuickServiceBtn">×</button>
    <p class="eyebrow">CADASTRO RÁPIDO</p><h3>Novo serviço</h3>
    <p class="muted">Cadastre sem sair da venda. O serviço já entra neste item.</p>
    <label>Nome do serviço<input id="quickServiceName" required></label>
    <label>Categoria<input id="quickServiceCategory"></label>
    <div class="form-grid two"><label>Preço de venda<input id="quickServicePrice" type="number" min="0" step="0.01" required></label><label>Custo direto<input id="quickServiceCost" type="number" min="0" step="0.01" required></label></div>
    <div class="modal-actions"><button type="button" class="btn btn-ghost" id="cancelQuickServiceBtn">Cancelar</button><button type="submit" class="btn btn-primary" id="saveQuickServiceBtn">Criar e usar</button></div>
  </form>`;document.body.appendChild(d);
  const close=()=>{d.close();targetSelect=null};$('closeQuickServiceBtn').onclick=close;$('cancelQuickServiceBtn').onclick=close;
  $('quickServiceForm').onsubmit=async e=>{
    e.preventDefault();const{data:sess}=await supabase.auth.getSession();const user=sess?.session?.user;if(!user)return toast('Sua sessão expirou.',true);
    const payload={user_id:user.id,name:$('quickServiceName').value.trim(),category:$('quickServiceCategory').value.trim()||null,sale_price:Number($('quickServicePrice').value||0),direct_cost:Number($('quickServiceCost').value||0),active:true,updated_at:new Date().toISOString()};
    const btn=$('saveQuickServiceBtn');btn.disabled=true;const{data,error}=await supabase.from('services').insert(payload).select().single();btn.disabled=false;if(error)return toast('Não foi possível cadastrar o serviço.',true);
    quickServices.set(data.id,data);applyQuickService(targetSelect,data);d.close();$('quickServiceForm').reset();targetSelect=null;
    document.querySelectorAll('.item-service').forEach(ensureQuickOption);
  };
}
function openQuickCreate(select){ensureQuickDialog();targetSelect=select;select.value='';$('quickServiceForm').reset();$('quickServiceDialog').showModal();setTimeout(()=>$('quickServiceName')?.focus(),30)}
function applyQuickService(select,s){if(!select||!s)return;ensureQuickOption(select);select.value=s.id;const row=select.closest('.sale-item');row.dataset.cost=String(s.direct_cost||0);const desc=row.querySelector('.item-desc'),price=row.querySelector('.item-price');if(desc)desc.value=s.name;if(price)price.value=Number(s.sale_price||0).toFixed(2);calc()}

async function finishSale(){
  const btn=$('finishSaleBtn');if(!btn||btn.dataset.liteSaving==='1')return;
  const{data:sess}=await supabase.auth.getSession();const user=sess?.session?.user;if(!user)return toast('Sua sessão expirou.',true);
  const seller=$('saleSeller').value;if(!seller)return toast('Selecione o responsável.',true);
  const rows=[...document.querySelectorAll('.sale-item')].map(row=>({row,service_id:row.querySelector('.item-service')?.value||null,description:row.querySelector('.item-desc')?.value.trim()||'',quantity:Number(row.querySelector('.item-qty')?.value||0),line_total:Number(row.querySelector('.item-price')?.value||0)})).filter(x=>x.description&&x.quantity>0);
  if(!rows.length)return toast('Adicione pelo menos um item.',true);
  const c=calc();if(c.total<=0)return toast('Informe o valor da venda.',true);
  const payload={user_id:user.id,seller_name:seller,customer_name:$('saleCustomer').value.trim()||null,customer_phone:$('salePhone').value.trim()||null,note:$('saleNote').value.trim()||null,subtotal:c.subtotal,discount:c.discount,total:c.total,payment_method:$('salePayment').value,created_at:stamp(ensureDate()?.value||today())};
  btn.dataset.liteSaving='1';btn.disabled=true;btn.textContent='Salvando...';
  const{data:sale,error}=await supabase.from('sales').insert(payload).select().single();
  if(error){btn.dataset.liteSaving='';btn.disabled=false;btn.textContent='Finalizar venda';return toast('Erro ao registrar venda.',true)}
  const items=rows.map(i=>{const q=Math.max(1,i.quantity),totalCost=Number(i.row.dataset.cost||0);return{sale_id:sale.id,service_id:(i.service_id&&i.service_id!==CREATE_VALUE)?i.service_id:null,description:i.description,quantity:i.quantity,unit_price:i.line_total/q,unit_cost:totalCost/q,total:i.line_total}});
  const{error:itemError}=await supabase.from('sale_items').insert(items);
  btn.dataset.liteSaving='';btn.disabled=false;btn.textContent='Finalizar venda';if(itemError)return toast('Venda salva, mas houve erro nos itens.',true);
  lastSale={...sale,sale_items:items};
  $('doneSaleTitle').textContent=sale.customer_name?`Venda de ${sale.customer_name} concluída.`:'Venda concluída.';$('doneSaleTotal').textContent=brl(sale.total);
  $('saleSeller').value='';$('saleCustomer').value='';$('salePhone').value='';$('saleNote').value='';$('saleDiscount').value=0;$('salePayment').value='pix';ensureDate().value=today();$('saleItems').innerHTML='';
  if(originalAddItem)originalAddItem.call($('addItemBtn'));setTimeout(patchRows,0);
  $('saleDoneDialog').showModal();
}

async function getSettings(){const{data:sess}=await supabase.auth.getSession();const u=sess?.session?.user;if(!u)return defaults;const{data}=await supabase.from('company_settings').select('*').eq('user_id',u.id).maybeSingle();return{...defaults,...(data||{})}}
async function logoData(){try{const r=await fetch('./assets/brand-mark.png'),b=await r.blob();return await new Promise(res=>{const fr=new FileReader();fr.onload=()=>res(fr.result);fr.readAsDataURL(b)})}catch{return null}}
async function receiptDoc(s){
  const set=await getSettings(),logo=await logoData(),doc=new jsPDF({unit:'mm',format:'a4'}),navy=[9,20,38],blue=[0,95,222],lime=[219,232,33],muted=[100,110,125];
  doc.setFillColor(...navy);doc.rect(0,0,210,40,'F');doc.setFillColor(...lime);doc.rect(0,37,210,3,'F');if(logo)doc.addImage(logo,'PNG',15,8,22,22);
  doc.setTextColor(255,255,255);doc.setFont('helvetica','bold');doc.setFontSize(17);doc.text(set.trade_name||'Papel e Código',43,17);doc.setFontSize(8);doc.setTextColor(...lime);doc.text('ONDE SUA MARCA ACONTECE.',43,24);doc.setTextColor(255,255,255);doc.text('RECIBO COMERCIAL',194,14,{align:'right'});doc.setFontSize(10);doc.text(receiptNo(s),194,21,{align:'right'});doc.setFontSize(8);doc.setFont('helvetica','normal');doc.text(new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(s.created_at)),194,28,{align:'right'});
  let y=50;doc.setTextColor(25,34,49);doc.setFont('helvetica','bold');doc.setFontSize(9);doc.text('DADOS DA EMPRESA',15,y);y+=7;doc.setFont('helvetica','normal');doc.setFontSize(8.2);doc.setTextColor(...muted);
  [set.legal_name,`CNPJ ${set.cnpj||defaults.cnpj}${set.state_registration?'  •  IE '+set.state_registration:''}`,set.address,`${set.city||''}${set.state?' / '+set.state:''}${set.zip_code?'  •  CEP '+set.zip_code:''}`,`${set.phone||defaults.phone}  •  ${set.email||defaults.email}  •  ${set.instagram||defaults.instagram}`].filter(Boolean).forEach(t=>{doc.text(String(t),15,y);y+=4.7});
  y+=6;doc.setTextColor(25,34,49);doc.setFont('helvetica','bold');doc.setFontSize(9);doc.text('CLIENTE',15,y);doc.setFont('helvetica','normal');doc.text(s.customer_name||'Venda balcão',42,y);if(s.customer_phone)doc.text(s.customer_phone,195,y,{align:'right'});y+=7;doc.setFont('helvetica','bold');doc.text('RESPONSÁVEL',15,y);doc.setFont('helvetica','normal');doc.text(s.seller_name||'—',42,y);y+=11;
  doc.setFillColor(...blue);doc.rect(15,y-5,180,9,'F');doc.setTextColor(255,255,255);doc.setFont('helvetica','bold');doc.setFontSize(7.5);doc.text('DESCRIÇÃO',19,y);doc.text('QTD.',132,y,{align:'right'});doc.text('UNIT.',159,y,{align:'right'});doc.text('TOTAL',191,y,{align:'right'});y+=9;doc.setTextColor(35,45,60);doc.setFont('helvetica','normal');doc.setFontSize(8.2);
  for(const i of s.sale_items||[]){doc.text(String(i.description).slice(0,60),19,y);doc.text(String(i.quantity),132,y,{align:'right'});doc.text(brl(i.unit_price),159,y,{align:'right'});doc.setFont('helvetica','bold');doc.text(brl(i.total),191,y,{align:'right'});doc.setFont('helvetica','normal');y+=8}
  y+=4;doc.setTextColor(...muted);doc.text('Subtotal',140,y);doc.setTextColor(25,34,49);doc.text(brl(s.subtotal),194,y,{align:'right'});y+=7;if(Number(s.discount||0)>0){doc.setTextColor(...muted);doc.text('Desconto',140,y);doc.setTextColor(25,34,49);doc.text('− '+brl(s.discount),194,y,{align:'right'});y+=7}doc.setFont('helvetica','bold');doc.setFontSize(12);doc.text('VALOR DA VENDA',122,y);doc.setTextColor(...blue);doc.setFontSize(15);doc.text(brl(s.total),194,y,{align:'right'});y+=12;
  if(s.note){doc.setFontSize(8);doc.setFont('helvetica','normal');doc.setTextColor(55,65,80);doc.text(doc.splitTextToSize(`Observação: ${s.note}`,175),15,y);y+=12}
  const pix=(set.pix_key||defaults.pix_key).toLowerCase()==='cnpj'?`CNPJ ${set.cnpj||defaults.cnpj}`:(set.pix_key||defaults.pix_key);doc.setFillColor(247,250,205);doc.rect(15,y,180,14,'F');doc.setTextColor(80,87,20);doc.setFontSize(8);doc.setFont('helvetica','bold');doc.text('PIX',20,y+8);doc.setFont('helvetica','normal');doc.text(String(pix),34,y+8);doc.text(`WhatsApp ${set.whatsapp||defaults.whatsapp}`,191,y+8,{align:'right'});doc.setTextColor(...muted);doc.setFontSize(7.2);doc.text(set.receipt_footer||defaults.receipt_footer,15,283);return doc;
}

function wireReceipt(){
  $('downloadReceiptBtn').onclick=async()=>{if(lastSale)(await receiptDoc(lastSale)).save(`${receiptNo(lastSale)}.pdf`)};
  $('shareReceiptBtn').onclick=async()=>{if(!lastSale)return;const d=await receiptDoc(lastSale),blob=d.output('blob'),file=new File([blob],`${receiptNo(lastSale)}.pdf`,{type:'application/pdf'});if(navigator.share&&navigator.canShare?.({files:[file]}))await navigator.share({files:[file],title:'Recibo Papel e Código'});else{d.save(file.name);toast('PDF baixado para envio.')}};
  $('whatsappReceiptBtn').onclick=()=>lastSale&&openWA(lastSale.customer_phone,`Olá, ${lastSale.customer_name||'cliente'}! Segue o recibo da sua compra na Papel e Código no valor de ${brl(lastSale.total)}.`);
  $('closeDoneBtn').onclick=()=>{if($('saleDoneDialog').open)$('saleDoneDialog').close();location.reload()};
}

function init(){
  installStyle();ensureDate();ensureQuickDialog();patchRows();wireReceipt();
  const add=$('addItemBtn');if(add&&!add.dataset.liteWrapped){add.dataset.liteWrapped='1';originalAddItem=add.onclick;add.onclick=function(e){if(originalAddItem)originalAddItem.call(this,e);setTimeout(patchRows,0)}}
  if($('saleDiscount'))$('saleDiscount').oninput=calc;
  if($('finishSaleBtn'))$('finishSaleBtn').onclick=finishSale;
}

if(document.readyState==='complete')setTimeout(init,250);else window.addEventListener('load',()=>setTimeout(init,250),{once:true});
