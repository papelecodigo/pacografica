import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

if(!document.querySelector('link[data-mobile-css]')){
  const mobileCss=document.createElement('link');
  mobileCss.rel='stylesheet';
  mobileCss.href='./mobile.css';
  mobileCss.dataset.mobileCss='true';
  document.head.appendChild(mobileCss);
}

const supabase=createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
const CREATE_VALUE='__quick_create_service__';
const quickServices=new Map();
let targetSelect=null;

function ensureDialog(){
  if(document.getElementById('quickServiceDialog'))return;
  const dialog=document.createElement('dialog');
  dialog.id='quickServiceDialog';
  dialog.innerHTML=`<form id="quickServiceForm" class="modal-card">
    <button type="button" class="modal-x" id="closeQuickServiceBtn">×</button>
    <p class="eyebrow">CADASTRO RÁPIDO</p><h3>Novo serviço</h3>
    <p class="muted">Cadastre sem sair da venda. O serviço já será aplicado neste item.</p>
    <label>Nome do serviço<input id="quickServiceName" required placeholder="Ex.: Adesivo A3"></label>
    <label>Categoria<input id="quickServiceCategory" placeholder="Adesivos, cartões, embalagens..."></label>
    <div class="form-grid two"><label>Preço de venda<input id="quickServicePrice" type="number" min="0" step="0.01" required></label><label>Custo direto<input id="quickServiceCost" type="number" min="0" step="0.01" required></label></div>
    <div class="modal-actions"><button type="button" class="btn btn-ghost" id="cancelQuickServiceBtn">Cancelar</button><button type="submit" class="btn btn-primary" id="saveQuickServiceBtn">Criar e usar</button></div>
  </form>`;
  document.body.appendChild(dialog);
  const close=()=>{dialog.close();targetSelect=null};
  document.getElementById('closeQuickServiceBtn').onclick=close;
  document.getElementById('cancelQuickServiceBtn').onclick=close;
  document.getElementById('quickServiceForm').addEventListener('submit',async e=>{
    e.preventDefault();const btn=document.getElementById('saveQuickServiceBtn');
    const{data:sessionData}=await supabase.auth.getSession();const user=sessionData?.session?.user;if(!user)return alert('Sua sessão expirou. Entre novamente.');
    const payload={user_id:user.id,name:document.getElementById('quickServiceName').value.trim(),category:document.getElementById('quickServiceCategory').value.trim()||null,sale_price:Number(document.getElementById('quickServicePrice').value||0),direct_cost:Number(document.getElementById('quickServiceCost').value||0),active:true,updated_at:new Date().toISOString()};
    if(!payload.name)return;btn.disabled=true;btn.textContent='Salvando...';const{data,error}=await supabase.from('services').insert(payload).select().single();btn.disabled=false;btn.textContent='Criar e usar';if(error)return alert('Não foi possível cadastrar o serviço.');
    quickServices.set(data.id,data);applyCreatedService(targetSelect,data);dialog.close();document.getElementById('quickServiceForm').reset();targetSelect=null;ensureOptions();
  });
}

function addQuickOptions(select){
  for(const service of quickServices.values())if(!select.querySelector(`option[value="${CSS.escape(service.id)}"]`)){const op=document.createElement('option');op.value=service.id;op.textContent=service.name;const createOp=select.querySelector(`option[value="${CREATE_VALUE}"]`);select.insertBefore(op,createOp||null)}
}
function ensureOptions(){
  document.querySelectorAll('.item-service').forEach(select=>{addQuickOptions(select);if(!select.querySelector(`option[value="${CREATE_VALUE}"]`)){const op=document.createElement('option');op.value=CREATE_VALUE;op.textContent='＋ Cadastrar novo serviço';select.appendChild(op)}})
}
function applyCreatedService(select,service){
  if(!select||!service)return;if(!select.querySelector(`option[value="${CSS.escape(service.id)}"]`)){const op=document.createElement('option');op.value=service.id;op.textContent=service.name;select.appendChild(op)}select.value=service.id;const row=select.closest('.sale-item');if(!row)return;row.dataset.cost=String(service.direct_cost||0);const desc=row.querySelector('.item-desc'),price=row.querySelector('.item-price');if(desc)desc.value=service.name;if(price){price.value=Number(service.sale_price||0).toFixed(2);price.dispatchEvent(new Event('input',{bubbles:true}))}
}
function openCreate(select){ensureDialog();targetSelect=select;select.value='';document.getElementById('quickServiceForm').reset();document.getElementById('quickServiceDialog').showModal();setTimeout(()=>document.getElementById('quickServiceName')?.focus(),50)}

document.addEventListener('change',event=>{const select=event.target.closest?.('.item-service');if(!select)return;if(select.value===CREATE_VALUE){event.preventDefault();event.stopImmediatePropagation();openCreate(select);return}const quick=quickServices.get(select.value);if(quick){event.preventDefault();event.stopImmediatePropagation();applyCreatedService(select,quick)}},true);

ensureDialog();ensureOptions();
const saleItems=document.getElementById('saleItems');if(saleItems)new MutationObserver(ensureOptions).observe(saleItems,{childList:true});
import('./sale-safe.js?build=20260828-2024').catch(err=>console.error('Falha ao carregar fluxo de venda',err));
