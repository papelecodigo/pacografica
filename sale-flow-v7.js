import { jsPDF } from 'https://esm.sh/jspdf@2.5.2';
import {supabase,db} from './erp-db.js';

const $=id=>document.getElementById(id);
const $$=sel=>[...document.querySelectorAll(sel)];
const brl=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v||0));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const localDate=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());
const META='[[PACO_V7]]';
let saleUiState='idle';
let finishWrapped=false;
let lastEnhancedSale=null;
let graphTimer=null;
let graphMode='current';
let graphMonth=null;

function injectCss(){
  if(document.querySelector('link[data-sale-flow-v7]'))return;
  const l=document.createElement('link');l.rel='stylesheet';l.href='./sale-flow-v7.css?build=20260901-1052';l.dataset.saleFlowV7='1';document.head.appendChild(l);
}
function toast(msg,error=false){const e=$('toast');if(!e)return;e.textContent=msg;e.className=`toast show${error?' error':''}`;clearTimeout(window.__saleV7Toast);window.__saleV7Toast=setTimeout(()=>e.className='toast',3400)}
function numberFromMoney(text){return Number(String(text||'').replace(/[^\d,-]/g,'').replace(/\./g,'').replace(',','.'))||0}
function getTotal(){return numberFromMoney($('saleTotal')?.textContent)}
function currentUser(){return supabase.auth.getSession().then(x=>x.data.session?.user||null)}
function normalizedPhone(v){return String(v||'').replace(/\D/g,'')}
function parseMeta(note=''){
  const s=String(note||''),i=s.indexOf(META);if(i<0)return{note:s.trim()};
  try{return{...JSON.parse(s.slice(i+META.length)),note:s.slice(0,i).trim()}}catch{return{note:s.trim()}}
}
function encodedNote(meta){const note=$('saleNote')?.value.trim()||'';return`${note}${note?'\n':''}${META}${JSON.stringify(meta)}`}
async function companySettings(){const user=await currentUser();if(!user)return{};const{data}=await supabase.from('company_settings').select('*').eq('user_id',user.id).maybeSingle();return data||{}}
function companyAddress(s){return[s.address,s.city&&s.state?`${s.city}/${s.state}`:s.city||s.state,s.zip_code&&`CEP ${s.zip_code}`].filter(Boolean).join(' · ')||'Endereço da gráfica ainda não configurado.'}

function cleanupSaleDuplicates(){
  const section=$('section-sale');if(!section)return;
  const logistics=section.querySelectorAll('[data-sale-v7-logistics],#saleLogisticsPanel');
  logistics.forEach((el,i)=>{if(i>0||!el.dataset.saleV7Logistics)el.remove()});
  section.querySelectorAll('[data-sale-v7-entry],#saleEntryBlock').forEach((el,i)=>{if(i>0||!el.dataset.saleV7Entry)el.remove()});
  const items=$('saleItems')?.closest('.panel');items?.querySelector('.section-title b')?.replaceChildren(document.createTextNode('03'));
}
function dateOffset(days){const d=new Date();d.setDate(d.getDate()+days);return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(d)}

async function injectSaleFields(){
  const section=$('section-sale');if(!section)return false;
  if(saleUiState==='injecting')return false;
  if($('[data-sale-v7-logistics]')&&$('[data-sale-v7-entry]')){saleUiState='ready';cleanupSaleDuplicates();return true}
  saleUiState='injecting';
  try{
    cleanupSaleDuplicates();
    const stack=section.querySelector('.stack'),first=stack?.querySelector('.panel'),itemPanel=$('saleItems')?.closest('.panel');
    if(!stack||!first||!itemPanel){saleUiState='idle';return false}
    const settings=await companySettings();
    if(!document.body.contains(section)){saleUiState='idle';return false}
    first.querySelector('.section-title p')?.replaceChildren(document.createTextNode('Cliente, responsável e contato.'));
    const note=$('saleNote');if(note)note.placeholder='Acabamento, arte, detalhes e observações...';
    itemPanel.insertAdjacentHTML('beforebegin',`
      <article class="panel sale-logistics-panel" data-sale-v7-logistics="1">
        <div class="section-title"><b>02</b><div><h3>Prazo, entrega e pagamento</h3><p>Preencha só o necessário. Os detalhes aparecem conforme a escolha.</p></div></div>
        <div class="sale-deadline-row">
          <label class="sale-date-field">Prazo<input id="saleDueDate" type="date" value="${dateOffset(2)}"></label>
          <div class="sale-date-shortcuts" aria-label="Atalhos de prazo">
            <button type="button" data-days="1">Amanhã</button><button type="button" data-days="2">+2 dias</button><button type="button" data-days="3">+3 dias</button><button type="button" data-days="7">+7 dias</button>
          </div>
          <label class="sale-time-field">Horário<input id="saleDueTime" type="time" value="17:00"></label>
        </div>
        <div class="sale-choice-grid">
          <div class="sale-choice"><span>Como o cliente recebe?</span><div class="segmented"><button type="button" class="active" data-fulfillment="pickup">Retirada</button><button type="button" data-fulfillment="delivery">Entrega</button></div><input id="saleFulfillment" type="hidden" value="pickup"></div>
          <label>Condição de pagamento<select id="salePaymentCondition"><option value="entrada_retirada">Entrada + saldo na retirada</option><option value="avista">À vista</option><option value="retirada">Pagar tudo na retirada</option><option value="entrada_entrega">Entrada + saldo na entrega</option><option value="entrega">Pagar tudo na entrega</option></select></label>
        </div>
        <div id="salePickupInfo" class="sale-pickup-info"><span>LOCAL DE RETIRADA</span><b>${esc(settings.trade_name||'Papel e Código')}</b><small>${esc(companyAddress(settings))}</small></div>
        <div id="saleDeliveryFields" class="sale-delivery-fields hidden">
          <div class="sale-delivery-title"><b>Endereço de entrega</b><small>Só aparece quando “Entrega” está selecionado.</small></div>
          <div class="form-grid three"><label>Endereço<input id="saleDeliveryAddress" placeholder="Rua / Avenida"></label><label>Número<input id="saleDeliveryNumber"></label><label>Complemento<input id="saleDeliveryComplement"></label></div>
          <div class="form-grid four"><label>Bairro<input id="saleDeliveryDistrict"></label><label>Cidade<input id="saleDeliveryCity"></label><label>UF<input id="saleDeliveryState" maxlength="2"></label><label>CEP<input id="saleDeliveryZip"></label></div>
          <label class="delivery-fee">Taxa de entrega<input id="saleDeliveryFee" type="number" min="0" step="0.01" value="0"></label>
        </div>
      </article>`);
    itemPanel.querySelector('.section-title b')?.replaceChildren(document.createTextNode('03'));
    itemPanel.querySelector('.section-title p')?.replaceChildren(document.createTextNode('O que será produzido.'));
    const paymentLabel=$('salePayment')?.closest('label');
    if(paymentLabel){paymentLabel.insertAdjacentHTML('afterend',`<div class="sale-entry-block" data-sale-v7-entry="1"><label id="saleEntryLabel">Entrada<input id="saleEntry" type="number" min="0" step="0.01" value="0"></label><div class="sale-balance-preview"><span id="saleBalanceTitle">Saldo restante</span><strong id="saleRemaining">R$ 0,00</strong><small id="saleBalanceHint">Saldo na retirada</small></div></div>`)}
    section.querySelectorAll('[data-days]').forEach(b=>b.onclick=()=>{$('saleDueDate').value=dateOffset(Number(b.dataset.days));b.parentElement.querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b))});
    section.querySelectorAll('[data-fulfillment]').forEach(b=>b.onclick=()=>{section.querySelectorAll('[data-fulfillment]').forEach(x=>x.classList.toggle('active',x===b));$('saleFulfillment').value=b.dataset.fulfillment;syncFulfillment()});
    $('salePaymentCondition').onchange=syncPayment;$('saleEntry').oninput=syncPayment;
    section.addEventListener('input',saleInputSync,{passive:true});
    syncFulfillment();syncPayment();saleUiState='ready';return true;
  }catch(e){console.error('Venda V7 UI',e);saleUiState='idle';return false}
}
function saleInputSync(e){if(e.target.closest('.sale-item')||['saleDiscount','saleDeliveryFee'].includes(e.target.id))setTimeout(syncPayment,0)}
function syncFulfillment(){
  const delivery=$('saleFulfillment')?.value==='delivery';
  $('saleDeliveryFields')?.classList.toggle('hidden',!delivery);$('salePickupInfo')?.classList.toggle('hidden',delivery);
  const cond=$('salePaymentCondition');if(!cond)return;
  if(delivery&&['entrada_retirada','retirada'].includes(cond.value))cond.value=cond.value==='retirada'?'entrega':'entrada_entrega';
  if(!delivery&&['entrada_entrega','entrega'].includes(cond.value))cond.value=cond.value==='entrega'?'retirada':'entrada_retirada';
  syncPayment();
}
function syncPayment(){
  const entry=$('saleEntry');if(!entry)return;
  const total=getTotal()+Number($('saleDeliveryFee')?.value||0),cond=$('salePaymentCondition')?.value||'entrada_retirada';
  const needsEntry=cond.startsWith('entrada_');
  const block=$('[data-sale-v7-entry]');block?.classList.toggle('entry-not-needed',!needsEntry);
  let value=Number(entry.value||0);
  if(cond==='avista'){value=total;entry.value=total.toFixed(2);entry.readOnly=true}
  else if(['retirada','entrega'].includes(cond)){value=0;entry.value='0';entry.readOnly=true}
  else{entry.readOnly=false;value=Math.min(total,Math.max(0,value));if(Number(entry.value)!==value)entry.value=value.toFixed(2)}
  const remaining=Math.max(0,total-value);$('saleRemaining').textContent=brl(remaining);
  const hints={avista:'Pagamento à vista',entrada_retirada:'Saldo na retirada',entrada_entrega:'Saldo na entrega',retirada:'Pagamento integral na retirada',entrega:'Pagamento integral na entrega'};
  $('saleBalanceHint').textContent=hints[cond]||'';
  if($('saleEntryLabel'))$('saleEntryLabel').classList.toggle('hidden-field',!needsEntry&&cond!=='avista');
}
function snapshotMeta(){
  const total=getTotal(),fee=Number($('saleDeliveryFee')?.value||0),grandTotal=total+fee,cond=$('salePaymentCondition')?.value||'entrada_retirada',fulfillment=$('saleFulfillment')?.value||'pickup';
  const entry=cond==='avista'?grandTotal:['retirada','entrega'].includes(cond)?0:Number($('saleEntry')?.value||0);
  return{version:7,due_date:$('saleDueDate')?.value||null,due_time:$('saleDueTime')?.value||null,fulfillment,payment_condition:cond,entry_amount:Math.min(grandTotal,Math.max(0,entry)),remaining_amount:Math.max(0,grandTotal-entry),delivery_fee:fee,delivery:fulfillment==='delivery'?{address:$('saleDeliveryAddress')?.value.trim()||'',number:$('saleDeliveryNumber')?.value.trim()||'',complement:$('saleDeliveryComplement')?.value.trim()||'',district:$('saleDeliveryDistrict')?.value.trim()||'',city:$('saleDeliveryCity')?.value.trim()||'',state:$('saleDeliveryState')?.value.trim().toUpperCase()||'',zip:$('saleDeliveryZip')?.value.trim()||''}:null}
}
function validateSaleExtra(){if(!$('saleDueDate')?.value){$('saleDueDate')?.focus();toast('Escolha a data prevista para o material.',true);return false}if($('saleFulfillment')?.value==='delivery'&&!$('saleDeliveryAddress')?.value.trim()){$('saleDeliveryAddress')?.focus();toast('Informe o endereço de entrega.',true);return false}return true}
function resetExtraSale(){if($('saleDueDate'))$('saleDueDate').value=dateOffset(2);if($('saleDueTime'))$('saleDueTime').value='17:00';if($('saleEntry')){$('saleEntry').value='0';$('saleEntry').readOnly=false}if($('saleDeliveryFee'))$('saleDeliveryFee').value='0';['saleDeliveryAddress','saleDeliveryNumber','saleDeliveryComplement','saleDeliveryDistrict','saleDeliveryCity','saleDeliveryState','saleDeliveryZip'].forEach(id=>{if($(id))$(id).value=''});syncPayment()}

async function latestSale(){const user=await currentUser();if(!user)return null;const{data,error}=await supabase.from('sales').select('*,sale_items(*)').eq('user_id',user.id).order('created_at',{ascending:false}).limit(1).maybeSingle();if(error)throw error;return data}
async function ensureCustomer(sale,meta){
  if(!sale.customer_name)return null;const user=await currentUser();if(!user)return null;db.setUser(user);await db.detectERP();
  const customers=await db.list('customers'),phone=normalizedPhone(sale.customer_phone),name=String(sale.customer_name).trim();
  let c=customers.find(x=>String(x.name||'').trim().toLowerCase()===name.toLowerCase()||(phone&&[x.phone,x.whatsapp].map(normalizedPhone).includes(phone)));
  const d=meta.delivery||{},payload={name,whatsapp:sale.customer_phone||null,seller_name:sale.seller_name||null,source:'Venda rápida',active:true,address:d.address?[d.address,d.number,d.complement].filter(Boolean).join(', '):c?.address||null,city:d.city||c?.city||null,state:d.state||c?.state||null,zip_code:d.zip||c?.zip_code||null};
  if(!c)c=await db.insert('customers',payload);else{const patch={};for(const[k,v]of Object.entries(payload))if(v&&!c[k])patch[k]=v;if(Object.keys(patch).length)c=await db.update('customers',c.id,patch)}return c;
}
async function ensureLead(sale,meta){
  if(!sale.customer_name)return;const user=await currentUser();if(!user)return;const marker=`[VENDA:${sale.id}]`;
  const{data:existing}=await supabase.from('leads').select('id').eq('user_id',user.id).ilike('note',`%${marker}%`).limit(1);if(existing?.length)return;
  const interest=(sale.sale_items||[]).map(i=>i.description).filter(Boolean).slice(0,3).join(' + ')||'Venda rápida';
  await supabase.from('leads').insert({user_id:user.id,customer_name:sale.customer_name,customer_phone:sale.customer_phone||null,service_interest:interest,estimated_value:Number(sale.total||0)+Number(meta.delivery_fee||0),seller_name:sale.seller_name||null,stage:'aprovado',note:[marker,'Criado automaticamente ao concluir a venda.',meta.note].filter(Boolean).join('\n')});
}
async function ensureFinance(sale,customer,meta){
  const user=await currentUser();if(!user)return;db.setUser(user);await db.detectERP();
  const grand=Number(sale.total||0)+Number(meta.delivery_fee||0),entry=Math.min(grand,Number(meta.entry_amount||0)),remaining=Math.max(0,grand-entry),key=`Venda ${String(sale.id).slice(0,8).toUpperCase()}`;
  const recs=await db.list('receivables');if(!recs.some(r=>String(r.description||'').includes(key)))await db.insert('receivables',{customer_id:customer?.id||null,description:`${key} · ${sale.customer_name||'Balcão'}`,due_date:meta.due_date||localDate(),amount:grand,received_amount:entry,status:remaining<=0?'paid':entry>0?'partial':'pending',payment_method:sale.payment_method||null});
  if(entry>0){const{data:exists}=await supabase.from('cash_movements').select('id').eq('user_id',user.id).eq('description',`${key} · entrada`).limit(1);if(!exists?.length)await supabase.from('cash_movements').insert({user_id:user.id,type:'entrada',amount:entry,category:'Venda',description:`${key} · entrada`,nature:'operational'})}
}
async function postProcessSale(meta){
  try{const sale=await latestSale();if(!sale)return;lastEnhancedSale={...sale,_meta:{...meta,note:parseMeta(sale.note).note}};const doneKey=`paco_v7_sale_${sale.id}`;
    if(localStorage.getItem(doneKey)!=='1'){const customer=await ensureCustomer(sale,lastEnhancedSale._meta);await ensureLead(sale,lastEnhancedSale._meta);await ensureFinance(sale,customer,lastEnhancedSale._meta);localStorage.setItem(doneKey,'1')}
    if($('receiptTitle'))$('receiptTitle').textContent=`Venda registrada · ${meta.remaining_amount>0?`saldo ${brl(meta.remaining_amount)}`:'paga'}`;
    const text=$('receiptDialog')?.querySelector('.receipt-success p');if(text)text.textContent=meta.remaining_amount>0?`Entrada ${brl(meta.entry_amount)} · restante ${brl(meta.remaining_amount)}.`:'Pagamento registrado integralmente.';
    setTimeout(()=>{renderFinanceGraph();resetExtraSale()},150)
  }catch(e){console.error('Pós-venda V7',e);toast('Venda salva, mas houve falha ao sincronizar CRM/financeiro.',true)}
}
function wrapFinish(){
  const btn=$('finishSaleBtn');if(!btn||btn.dataset.saleV7==='1'||typeof btn.onclick!=='function')return false;
  const original=btn.onclick;btn.dataset.saleV7='1';btn.onclick=async function(e){if(!validateSaleExtra())return;syncPayment();const meta=snapshotMeta(),note=$('saleNote');if(note)note.value=encodedNote(meta);await original.call(this,e);if($('receiptDialog')?.open)await postProcessSale(meta)};finishWrapped=true;return true;
}

function paymentConditionName(v){return({avista:'À vista',entrada_retirada:'Entrada + saldo na retirada',entrada_entrega:'Entrada + saldo na entrega',retirada:'Pagamento na retirada',entrega:'Pagamento na entrega'})[v]||v||'Não informado'}
function fulfillmentName(v){return v==='delivery'?'Entrega':'Retirada na gráfica'}
function deliveryAddress(meta,settings){if(meta.fulfillment!=='delivery')return companyAddress(settings);const d=meta.delivery||{};return[[d.address,d.number].filter(Boolean).join(', '),d.complement,d.district,[d.city,d.state].filter(Boolean).join('/'),d.zip&&`CEP ${d.zip}`].filter(Boolean).join(' · ')||'Endereço de entrega não informado'}
function addText(doc,text,x,y,max=178,opts={}){const lines=doc.splitTextToSize(String(text||''),max);doc.text(lines,x,y,opts);return y+lines.length*5}
async function buildEnhancedReceipt(sale){
  const meta={...parseMeta(sale.note)},settings=await companySettings(),doc=new jsPDF({unit:'mm',format:'a4'}),grand=Number(sale.total||0)+Number(meta.delivery_fee||0),entry=meta.entry_amount??(meta.payment_condition==='avista'?grand:0),remaining=Math.max(0,meta.remaining_amount??grand-entry);
  doc.setFillColor(8,23,43);doc.rect(0,0,210,38,'F');doc.setTextColor(255,255,255);doc.setFont('helvetica','bold');doc.setFontSize(17);doc.text(settings.trade_name||'Papel e Código',16,15);doc.setFontSize(8);doc.setFont('helvetica','normal');
  const head=[settings.legal_name,settings.cnpj&&`CNPJ ${settings.cnpj}`,settings.state_registration&&`IE ${settings.state_registration}`].filter(Boolean).join(' · ');if(head)doc.text(head,16,22);doc.setTextColor(223,240,31);doc.setFont('helvetica','bold');doc.text('RECIBO / COMPROVANTE DE PEDIDO',16,30);doc.setTextColor(22,34,50);let y=49;
  doc.setFontSize(9);doc.setFont('helvetica','bold');doc.text(`Venda ${String(sale.id).slice(0,8).toUpperCase()}`,16,y);doc.setFont('helvetica','normal');doc.text(new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(sale.created_at)),194,y,{align:'right'});y+=9;doc.line(16,y,194,y);y+=8;
  doc.setFont('helvetica','bold');doc.text('CLIENTE',16,y);y+=6;doc.setFont('helvetica','normal');y=addText(doc,`Nome: ${sale.customer_name||'Venda balcão'}`,16,y);if(sale.customer_phone)y=addText(doc,`WhatsApp: ${sale.customer_phone}`,16,y);y=addText(doc,`Responsável: ${sale.seller_name||'—'}`,16,y);y+=3;
  doc.setFont('helvetica','bold');doc.text('ITENS',16,y);y+=7;doc.setFillColor(246,248,251);doc.rect(16,y-5,178,8,'F');doc.text('Descrição',18,y);doc.text('Qtd.',128,y);doc.text('Unit.',151,y);doc.text('Total',192,y,{align:'right'});y+=8;doc.setFont('helvetica','normal');
  for(const i of sale.sale_items||[]){const lines=doc.splitTextToSize(String(i.description||'Item'),95);doc.text(lines,18,y);doc.text(String(i.quantity),130,y);doc.text(brl(i.unit_price),151,y);doc.text(brl(i.total),192,y,{align:'right'});y+=Math.max(7,lines.length*5);if(y>245){doc.addPage();y=24}}
  y+=4;doc.line(110,y,194,y);y+=7;doc.text(`Subtotal: ${brl(sale.subtotal)}`,194,y,{align:'right'});y+=6;if(Number(sale.discount||0)>0){doc.text(`Desconto: -${brl(sale.discount)}`,194,y,{align:'right'});y+=6}if(Number(meta.delivery_fee||0)>0){doc.text(`Entrega: ${brl(meta.delivery_fee)}`,194,y,{align:'right'});y+=6}doc.setFont('helvetica','bold');doc.setFontSize(12);doc.text(`TOTAL: ${brl(grand)}`,194,y,{align:'right'});y+=12;
  doc.setFontSize(9);doc.text('PRAZO E RECEBIMENTO',16,y);y+=6;doc.setFont('helvetica','normal');doc.text(`Previsão: ${meta.due_date?new Date(`${meta.due_date}T12:00:00`).toLocaleDateString('pt-BR'):'—'}${meta.due_time?` às ${meta.due_time}`:''}`,16,y);y+=6;doc.text(`Forma: ${fulfillmentName(meta.fulfillment)}`,16,y);y+=6;y=addText(doc,`${meta.fulfillment==='delivery'?'Endereço de entrega':'Local de retirada'}: ${deliveryAddress(meta,settings)}`,16,y);y+=3;
  doc.setFont('helvetica','bold');doc.text('PAGAMENTO',16,y);y+=6;doc.setFont('helvetica','normal');doc.text(`Forma: ${({pix:'Pix',dinheiro:'Dinheiro',debito:'Débito',credito:'Crédito',outro:'Outro'})[sale.payment_method]||sale.payment_method||'—'}`,16,y);y+=6;doc.text(`Condição: ${paymentConditionName(meta.payment_condition)}`,16,y);y+=6;doc.text(`Entrada recebida: ${brl(entry)}`,16,y);y+=6;doc.setFont('helvetica','bold');doc.text(`Saldo restante: ${brl(remaining)}`,16,y);y+=9;doc.setFont('helvetica','normal');if(remaining>0){doc.text(`Saldo de ${brl(remaining)} a pagar ${meta.fulfillment==='delivery'?'na entrega':'na retirada'} do material.`,16,y);y+=7}
  if(meta.note){doc.setFont('helvetica','bold');doc.text('OBSERVAÇÕES',16,y);y+=6;doc.setFont('helvetica','normal');y=addText(doc,meta.note,16,y)}y+=8;doc.line(16,y,194,y);y+=7;doc.setFontSize(8);
  for(const line of [companyAddress(settings),settings.whatsapp&&`WhatsApp ${settings.whatsapp}`,settings.phone&&`Tel. ${settings.phone}`,settings.email,settings.instagram,settings.website,settings.pix_key&&`PIX: ${settings.pix_key}`].filter(Boolean))y=addText(doc,line,16,y,178);
  if(settings.receipt_footer){y+=2;doc.setFont('helvetica','bold');addText(doc,settings.receipt_footer,16,y,178)}return doc;
}
async function getSaleForReceipt(){if(lastEnhancedSale)return lastEnhancedSale;const sale=await latestSale();if(!sale)return null;lastEnhancedSale=sale;return sale}
function interceptReceipt(){
  const pdf=$('receiptPdfBtn'),wa=$('receiptWhatsappBtn');
  if(pdf&&!pdf.dataset.v7){pdf.dataset.v7='1';pdf.addEventListener('click',async e=>{e.preventDefault();e.stopImmediatePropagation();const sale=await getSaleForReceipt();if(!sale)return;const doc=await buildEnhancedReceipt(sale);doc.save(`REC-${String(sale.id).slice(0,8).toUpperCase()}.pdf`)},true)}
  if(wa&&!wa.dataset.v7){wa.dataset.v7='1';wa.addEventListener('click',async e=>{e.preventDefault();e.stopImmediatePropagation();const sale=await getSaleForReceipt();if(!sale)return;const meta=parseMeta(sale.note),grand=Number(sale.total||0)+Number(meta.delivery_fee||0),remaining=Math.max(0,Number(meta.remaining_amount||0)),date=meta.due_date?new Date(`${meta.due_date}T12:00:00`).toLocaleDateString('pt-BR'):'a combinar',text=`Olá, ${sale.customer_name||'cliente'}! Seu pedido na Papel e Código foi registrado.\n\nTotal: ${brl(grand)}\nEntrada: ${brl(meta.entry_amount||0)}\nSaldo: ${brl(remaining)}\nPrevisão: ${date}${meta.due_time?` às ${meta.due_time}`:''}\n${fulfillmentName(meta.fulfillment)}.${remaining?`\nSaldo restante a pagar ${meta.fulfillment==='delivery'?'na entrega':'na retirada'}.`:''}`;let d=normalizedPhone(sale.customer_phone);if(!d)return toast('WhatsApp não informado.',true);if(!d.startsWith('55'))d='55'+d;window.open(`https://wa.me/${d}?text=${encodeURIComponent(text)}`,'_blank','noopener')},true)}
}

function monthKeyOffset(offset=0){const d=new Date();d.setDate(1);d.setMonth(d.getMonth()+offset);return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`}
function monthLabel(key){const[y,m]=key.split('-').map(Number);return new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'}).format(new Date(y,m-1,1)).replace(/^./,c=>c.toUpperCase())}
function monthRange(key){const[y,m1]=key.split('-').map(Number),m=m1-1,days=new Date(y,m+1,0).getDate(),pad=n=>String(n).padStart(2,'0');return{key,y,m,days,start:`${y}-${pad(m+1)}-01T00:00:00-03:00`,end:`${y}-${pad(m+1)}-${pad(days)}T23:59:59-03:00`}}
function previousMonthKey(key){const[y,m]=key.split('-').map(Number),d=new Date(y,m-1,1);d.setMonth(d.getMonth()-1);return`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`}
function cumulativeSeries(rows,days){const daily=Array(days).fill(0);for(const r of rows){const day=new Date(r.created_at).getDate()-1;if(day>=0&&day<days)daily[day]+=r.type==='entrada'?Number(r.amount||0):-Number(r.amount||0)}let sum=0;return daily.map(v=>sum+=v)}
function pathFor(values,w,h,min,max){if(!values.length)return'';const span=max-min||1,step=w/Math.max(1,values.length-1);return values.map((v,i)=>`${i?'L':'M'} ${(i*step).toFixed(1)} ${(h-(v-min)/span*h).toFixed(1)}`).join(' ')}
async function fetchMonthRows(user,key){const r=monthRange(key);const{data,error}=await supabase.from('cash_movements').select('type,amount,created_at').eq('user_id',user.id).gte('created_at',r.start).lte('created_at',r.end).order('created_at');if(error)throw error;return{range:r,rows:data||[]}}
async function graphData(key=monthKeyOffset(0),project=false){
  const user=await currentUser();if(!user)return null;const prevKey=previousMonthKey(key);const[a,b]=await Promise.all([fetchMonthRows(user,key),fetchMonthRows(user,prevKey)]),current=cumulativeSeries(a.rows,a.range.days),previous=cumulativeSeries(b.rows,b.range.days);
  const isCurrent=key===monthKeyOffset(0),today=isCurrent?Math.min(new Date().getDate(),a.range.days):a.range.days,actual=current.slice(0,today),close=actual.at(-1)||0,avg=close/Math.max(1,today),projection=project&&isCurrent?Array.from({length:a.range.days},(_,i)=>i<today?actual[i]:close+avg*(i-today+1)):[];
  return{key,range:a.range,prevKey,actual,previous,projection,currentClose:close,previousClose:previous.at(-1)||0,projectedClose:projection.at(-1)||close}
}
function historyOptions(){return Array.from({length:12},(_,i)=>{const key=monthKeyOffset(-(i+1));return`<option value="${key}">${monthLabel(key)}</option>`}).join('')}
function injectFinanceGraph(){
  const section=$('section-today');if(!section||$('todayFinanceGraph'))return;
  graphMonth=graphMonth||monthKeyOffset(-1);
  section.insertAdjacentHTML('afterbegin',`<article id="todayFinanceGraph" class="today-finance-graph"><div class="finance-graph-head"><div><span>FINANCEIRO</span><h3>Caixa e projeção</h3></div><div class="finance-graph-tabs"><button class="active" data-graph-mode="current">Este mês</button><button data-graph-mode="history">Meses anteriores</button><select id="financeHistoryMonth" class="hidden">${historyOptions()}</select></div><div class="finance-graph-kpis"><div><small id="fgLabelCurrent">Caixa do mês</small><b id="fgCurrent">R$ 0</b></div><div><small id="fgLabelProjection">Projeção</small><b id="fgProjection">R$ 0</b></div><div><small id="fgLabelPrevious">Mês anterior</small><b id="fgPrevious">R$ 0</b></div></div></div><div class="finance-graph-canvas"><svg id="fgSvg" viewBox="0 0 1000 320" preserveAspectRatio="none" aria-label="Gráfico financeiro"></svg></div><div class="finance-graph-legend"><span class="real" id="fgLegendReal">Caixa real</span><span class="projection" id="fgLegendProjection">Projeção do mês</span><span class="previous" id="fgLegendPrevious">Mês anterior</span></div></article>`);
  $$('[data-graph-mode]').forEach(b=>b.onclick=()=>{graphMode=b.dataset.graphMode;$$('[data-graph-mode]').forEach(x=>x.classList.toggle('active',x===b));$('financeHistoryMonth').classList.toggle('hidden',graphMode!=='history');renderFinanceGraph()});
  $('financeHistoryMonth').value=graphMonth;$('financeHistoryMonth').onchange=e=>{graphMonth=e.target.value;renderFinanceGraph()};
}
async function renderFinanceGraph(){
  injectFinanceGraph();if(!$('todayFinanceGraph'))return;
  try{
    const history=graphMode==='history',key=history?(graphMonth||monthKeyOffset(-1)):monthKeyOffset(0),d=await graphData(key,!history);if(!d)return;
    $('fgCurrent').textContent=brl(d.currentClose);$('fgPrevious').textContent=brl(d.previousClose);
    if(history){const variation=d.previousClose?((d.currentClose-d.previousClose)/Math.abs(d.previousClose))*100:0;$('fgProjection').textContent=`${variation>=0?'+':''}${variation.toFixed(1).replace('.',',')}%`;$('fgLabelCurrent').textContent=monthLabel(d.key);$('fgLabelProjection').textContent='Variação';$('fgLabelPrevious').textContent=monthLabel(d.prevKey);$('fgLegendReal').textContent=monthLabel(d.key);$('fgLegendPrevious').textContent=monthLabel(d.prevKey);$('fgLegendProjection').classList.add('hidden')}
    else{$('fgProjection').textContent=brl(d.projectedClose);$('fgLabelCurrent').textContent='Caixa do mês';$('fgLabelProjection').textContent='Projeção';$('fgLabelPrevious').textContent='Mês anterior';$('fgLegendReal').textContent='Caixa real';$('fgLegendPrevious').textContent='Mês anterior';$('fgLegendProjection').classList.remove('hidden')}
    const all=[...d.actual,...d.previous,...d.projection,0].filter(Number.isFinite),min=Math.min(...all),max=Math.max(...all),w=1000,h=250,padTop=25,plotH=h-padTop,pActual=pathFor(d.actual,w,plotH,min,max),pPrev=pathFor(d.previous,w,plotH,min,max),pProj=d.projection.length?pathFor(d.projection,w,plotH,min,max):'',zeroY=(plotH-(0-min)/(max-min||1)*plotH).toFixed(1),mid=Math.ceil(d.range.days/2),last=d.range.days;
    $('fgSvg').innerHTML=`<g transform="translate(0 ${padTop})"><line x1="0" y1="${zeroY}" x2="1000" y2="${zeroY}" class="fg-zero"/><path d="${pPrev}" class="fg-line fg-prev"/>${pProj?`<path d="${pProj}" class="fg-line fg-proj"/>`:''}<path d="${pActual}" class="fg-line fg-real"/></g><g class="fg-days"><text x="0" y="305">1</text><text x="500" y="305" text-anchor="middle">${mid}</text><text x="1000" y="305" text-anchor="end">${last}</text></g>`;
  }catch(e){console.warn('Gráfico financeiro V7',e)}
}

function setup(){
  injectCss();cleanupSaleDuplicates();
  const timer=setInterval(async()=>{await injectSaleFields();interceptReceipt();if(!finishWrapped)wrapFinish();injectFinanceGraph();if($('todayFinanceGraph')){renderFinanceGraph();if(!graphTimer)graphTimer=setInterval(()=>{if(document.visibilityState==='visible')renderFinanceGraph()},60000)}if(saleUiState==='ready'&&finishWrapped&&$('todayFinanceGraph'))clearInterval(timer)},120);
  setTimeout(()=>clearInterval(timer),15000);
  let obsBusy=false;const obs=new MutationObserver(()=>{if(obsBusy)return;obsBusy=true;queueMicrotask(async()=>{try{cleanupSaleDuplicates();await injectSaleFields();if(!finishWrapped)wrapFinish();interceptReceipt();injectFinanceGraph()}finally{obsBusy=false}})});obs.observe(document.body,{subtree:true,childList:true});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup);else setup();
