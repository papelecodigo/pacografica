import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

if(!document.querySelector('link[data-mobile-css]')){
  const mobileCss=document.createElement('link');
  mobileCss.rel='stylesheet';
  mobileCss.href='./mobile.css';
  mobileCss.dataset.mobileCss='true';
  document.head.appendChild(mobileCss);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const CREATE_VALUE = '__quick_create_service__';
const quickServices = new Map();
let targetSelect = null;

function todaySaoPaulo(){
  return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo'}).format(new Date());
}

function ensureSaleDateField(){
  if(document.getElementById('saleDate')) return;
  const grid=document.querySelector('#section-sale .form-grid.three');
  if(!grid) return;
  grid.classList.add('sale-grid-with-date');
  const label=document.createElement('label');
  label.className='sale-date-field';
  label.innerHTML='Data da venda<input id="saleDate" type="date">';
  grid.appendChild(label);
  document.getElementById('saleDate').value=todaySaoPaulo();

  if(!document.getElementById('saleDateQuickStyle')){
    const style=document.createElement('style');
    style.id='saleDateQuickStyle';
    style.textContent=`
      #section-sale .sale-grid-with-date{grid-template-columns:160px minmax(180px,1fr) minmax(210px,1fr) 165px}
      #section-sale .sale-date-field input{font-weight:700;background:#fff}
      @media(max-width:1100px){#section-sale .sale-grid-with-date{grid-template-columns:1fr 1fr}}
      @media(max-width:650px){#section-sale .sale-grid-with-date{grid-template-columns:1fr}.sale-date-field{order:-1}}
    `;
    document.head.appendChild(style);
  }
}

function ensureDialog(){
  if(document.getElementById('quickServiceDialog')) return;
  const dialog = document.createElement('dialog');
  dialog.id = 'quickServiceDialog';
  dialog.innerHTML = `
    <form id="quickServiceForm" class="modal-card">
      <button type="button" class="modal-x" id="closeQuickServiceBtn">×</button>
      <p class="eyebrow">CADASTRO RÁPIDO</p>
      <h3>Novo serviço</h3>
      <p class="muted">Cadastre sem sair da venda. O serviço já será aplicado neste item.</p>
      <label>Nome do serviço<input id="quickServiceName" required placeholder="Ex.: Adesivo A3"></label>
      <label>Categoria<input id="quickServiceCategory" placeholder="Adesivos, cartões, embalagens..."></label>
      <div class="form-grid two">
        <label>Preço de venda<input id="quickServicePrice" type="number" min="0" step="0.01" required></label>
        <label>Custo direto<input id="quickServiceCost" type="number" min="0" step="0.01" required></label>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn btn-ghost" id="cancelQuickServiceBtn">Cancelar</button>
        <button type="submit" class="btn btn-primary" id="saveQuickServiceBtn">Criar e usar</button>
      </div>
    </form>`;
  document.body.appendChild(dialog);

  const close = ()=>{ dialog.close(); targetSelect = null; };
  document.getElementById('closeQuickServiceBtn').onclick = close;
  document.getElementById('cancelQuickServiceBtn').onclick = close;

  document.getElementById('quickServiceForm').addEventListener('submit', async (e)=>{
    e.preventDefault();
    const saveBtn = document.getElementById('saveQuickServiceBtn');
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData?.session?.user;
    if(!user){ alert('Sua sessão expirou. Entre novamente no sistema.'); return; }

    const payload = {
      user_id: user.id,
      name: document.getElementById('quickServiceName').value.trim(),
      category: document.getElementById('quickServiceCategory').value.trim() || null,
      sale_price: Number(document.getElementById('quickServicePrice').value || 0),
      direct_cost: Number(document.getElementById('quickServiceCost').value || 0),
      active: true,
      updated_at: new Date().toISOString()
    };

    if(!payload.name){ return; }
    saveBtn.disabled = true;
    saveBtn.textContent = 'Salvando...';
    const { data, error } = await supabase.from('services').insert(payload).select().single();
    saveBtn.disabled = false;
    saveBtn.textContent = 'Criar e usar';

    if(error){
      console.error(error);
      alert('Não foi possível cadastrar o serviço.');
      return;
    }

    quickServices.set(data.id, data);
    applyCreatedService(targetSelect, data);
    dialog.close();
    document.getElementById('quickServiceForm').reset();
    targetSelect = null;
    ensureOptions();
  });
}

function addQuickCreatedOptions(select){
  for(const service of quickServices.values()){
    if(!select.querySelector(`option[value="${CSS.escape(service.id)}"]`)){
      const op = document.createElement('option');
      op.value = service.id;
      op.textContent = service.name;
      const createOp = select.querySelector(`option[value="${CREATE_VALUE}"]`);
      select.insertBefore(op, createOp || null);
    }
  }
}

function ensureOptions(){
  document.querySelectorAll('.item-service').forEach(select=>{
    addQuickCreatedOptions(select);
    if(!select.querySelector(`option[value="${CREATE_VALUE}"]`)){
      const op = document.createElement('option');
      op.value = CREATE_VALUE;
      op.textContent = '＋ Cadastrar novo serviço';
      select.appendChild(op);
    }
  });
}

function applyCreatedService(select, service){
  if(!select || !service) return;
  if(!select.querySelector(`option[value="${CSS.escape(service.id)}"]`)){
    const op = document.createElement('option');
    op.value = service.id;
    op.textContent = service.name;
    const createOp = select.querySelector(`option[value="${CREATE_VALUE}"]`);
    select.insertBefore(op, createOp || null);
  }
  select.value = service.id;
  const row = select.closest('.sale-item');
  if(!row) return;
  row.dataset.cost = String(service.direct_cost || 0);
  const desc = row.querySelector('.item-desc');
  const price = row.querySelector('.item-price');
  if(desc) desc.value = service.name;
  if(price){
    price.value = Number(service.sale_price || 0).toFixed(2);
    price.dispatchEvent(new Event('input', { bubbles:true }));
  }
}

function openQuickCreate(select){
  ensureDialog();
  targetSelect = select;
  select.value = '';
  const dialog = document.getElementById('quickServiceDialog');
  document.getElementById('quickServiceForm').reset();
  dialog.showModal();
  setTimeout(()=>document.getElementById('quickServiceName')?.focus(), 50);
}

document.addEventListener('change', (event)=>{
  const select = event.target.closest?.('.item-service');
  if(!select) return;

  if(select.value === CREATE_VALUE){
    event.preventDefault();
    event.stopImmediatePropagation();
    openQuickCreate(select);
    return;
  }

  const quick = quickServices.get(select.value);
  if(quick){
    event.preventDefault();
    event.stopImmediatePropagation();
    applyCreatedService(select, quick);
  }
}, true);

const observer = new MutationObserver(()=>{
  ensureOptions();
  ensureSaleDateField();
});
observer.observe(document.documentElement, { childList:true, subtree:true });

ensureDialog();
ensureOptions();
ensureSaleDateField();
import('./sale-experience.js?build=20260828-2018').catch(err=>console.error('Falha ao carregar experiência de venda',err));
