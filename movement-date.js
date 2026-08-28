import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cfg = window.__PACO_SUPABASE;
if (!cfg?.url || !cfg?.key) {
  console.warn('PACO: configuração do Supabase indisponível para o módulo de datas.');
} else {
  const supabase = createClient(cfg.url, cfg.key);
  const $ = (id) => document.getElementById(id);
  const brl = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v || 0));
  const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  const monthBounds = () => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const pad = (n) => String(n).padStart(2, '0');
    const last = new Date(y, m + 1, 0).getDate();
    return {
      start: `${y}-${pad(m + 1)}-01T00:00:00-03:00`,
      end: `${y}-${pad(m + 1)}-${pad(last)}T23:59:59-03:00`
    };
  };
  const isoDate = (iso) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(iso));
  const displayDate = (iso) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(iso));
  const toTimestamp = (date) => `${date}T12:00:00-03:00`;
  let rendering = false;
  let refreshTimer = null;

  function notify(message, error = false) {
    const el = $('toast');
    if (!el) return;
    el.textContent = message;
    el.className = 'toast show' + (error ? ' error' : '');
    clearTimeout(window.__movementDateToast);
    window.__movementDateToast = setTimeout(() => { el.className = 'toast'; }, 3200);
  }

  function installStyles() {
    if ($('movementDateStyles')) return;
    const style = document.createElement('style');
    style.id = 'movementDateStyles';
    style.textContent = `
      .movement-date-field{position:relative}
      .movement-date-hint{display:block;margin-top:5px;color:#8b96a8;font-size:11px;font-weight:500}
      .movement-date-meta{display:inline-flex;align-items:center;gap:7px;margin-top:5px;color:#78859a;font-size:11px}
      .movement-date-meta button{border:0;background:transparent;color:#0566e8;font:inherit;font-weight:700;padding:0;cursor:pointer}
      .movement-date-meta button:hover{text-decoration:underline}
      .movement-date-row .movement-amount{display:flex;align-items:flex-end;justify-content:center;flex-direction:column;gap:7px}
      .movement-date-row .movement-amount>strong{white-space:nowrap}
      dialog.movement-date-dialog{border:0;border-radius:18px;padding:0;width:min(430px,calc(100vw - 32px));box-shadow:0 28px 80px rgba(5,17,38,.22)}
      dialog.movement-date-dialog::backdrop{background:rgba(7,18,36,.48);backdrop-filter:blur(2px)}
      .movement-date-dialog-card{padding:26px}
      .movement-date-dialog-card h3{margin:4px 0 8px;font-size:21px}
      .movement-date-dialog-card p{margin:0 0 20px;color:#778398;line-height:1.5}
      .movement-date-dialog-card label{display:grid;gap:8px;font-size:13px;font-weight:700}
      .movement-date-dialog-actions{display:flex;justify-content:flex-end;gap:9px;margin-top:22px}
      @media(max-width:700px){.movement-date-row .movement-amount{align-items:flex-start}.movement-date-dialog-actions{flex-direction:column-reverse}.movement-date-dialog-actions .btn{width:100%}}
    `;
    document.head.appendChild(style);
  }

  function installDateField() {
    const form = $('movementForm');
    if (!form || $('movementDate')) return;
    const amount = $('movementAmount')?.closest('label');
    if (!amount) return;
    const label = document.createElement('label');
    label.className = 'movement-date-field';
    label.innerHTML = `Data do lançamento<input id="movementDate" type="date" required><small class="movement-date-hint">Você pode lançar receitas e despesas em uma data anterior.</small>`;
    amount.parentNode.insertBefore(label, amount);
    $('movementDate').value = today();
  }

  function installDialog() {
    if ($('movementDateDialog')) return;
    const dialog = document.createElement('dialog');
    dialog.id = 'movementDateDialog';
    dialog.className = 'movement-date-dialog';
    dialog.innerHTML = `
      <form id="movementDateEditForm" class="movement-date-dialog-card">
        <input id="movementDateEditId" type="hidden">
        <span class="eyebrow">LANÇAMENTO FINANCEIRO</span>
        <h3>Alterar data</h3>
        <p id="movementDateEditDescription">Escolha a data correta deste lançamento.</p>
        <label>Data do lançamento<input id="movementDateEditValue" type="date" required></label>
        <div class="movement-date-dialog-actions">
          <button id="cancelMovementDateEdit" class="btn btn-ghost" type="button">Cancelar</button>
          <button class="btn btn-primary" type="submit">Salvar data</button>
        </div>
      </form>`;
    document.body.appendChild(dialog);
    $('cancelMovementDateEdit').onclick = () => dialog.close();
    dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
    $('movementDateEditForm').addEventListener('submit', saveEditedDate);
  }

  async function currentUser() {
    const { data } = await supabase.auth.getSession();
    return data.session?.user || null;
  }

  async function interceptMovementSubmit(e) {
    const form = $('movementForm');
    if (e.target !== form) return;
    e.preventDefault();
    e.stopImmediatePropagation();

    const user = await currentUser();
    if (!user) return notify('Sua sessão expirou. Entre novamente.', true);
    const date = $('movementDate')?.value || today();
    const amount = Number($('movementAmount')?.value || 0);
    const description = $('movementDescription')?.value.trim();
    if (!description || !(amount > 0)) return notify('Preencha a descrição e um valor válido.', true);

    const submit = form.querySelector('button[type="submit"]');
    if (submit) { submit.disabled = true; submit.textContent = 'Registrando...'; }

    const payload = {
      user_id: user.id,
      type: $('movementType').value,
      nature: $('movementNature').value,
      category: $('movementCategory').value.trim() || null,
      description,
      amount,
      created_at: toTimestamp(date)
    };

    const { error } = await supabase.from('cash_movements').insert(payload);
    if (submit) { submit.disabled = false; submit.textContent = 'Registrar'; }
    if (error) return notify('Erro ao registrar lançamento.', true);

    localStorage.setItem('paco-return-finance', '1');
    location.reload();
  }

  async function refreshMovementList() {
    const list = $('movementList');
    if (!list || rendering) return;
    const user = await currentUser();
    if (!user) return;
    const b = monthBounds();
    const { data, error } = await supabase
      .from('cash_movements')
      .select('*')
      .eq('user_id', user.id)
      .gte('created_at', b.start)
      .lte('created_at', b.end)
      .order('created_at', { ascending: false });
    if (error) return;

    rendering = true;
    list.innerHTML = (data || []).map((m) => `
      <div class="data-row movement-date-row">
        <div>
          <b>${escapeHtml(m.description)}</b>
          <small>${escapeHtml(m.category || 'Sem categoria')} · ${m.nature === 'investment' ? 'Investimento' : m.nature === 'other' ? 'Outro' : 'Operacional'}</small>
          <span class="movement-date-meta">Data: <strong>${displayDate(m.created_at)}</strong><button type="button" class="edit-movement-date" data-id="${m.id}" data-date="${isoDate(m.created_at)}" data-description="${escapeAttr(m.description)}">Editar data</button></span>
        </div>
        <div class="movement-amount"><strong class="${m.type === 'entrada' ? 'margin-good' : ''}">${m.type === 'entrada' ? '+' : '−'} ${brl(m.amount)}</strong></div>
      </div>`).join('') || '<div class="empty">Nenhum lançamento no mês.</div>';

    list.querySelectorAll('.edit-movement-date').forEach((btn) => {
      btn.onclick = () => openEditDialog(btn.dataset.id, btn.dataset.date, btn.dataset.description);
    });
    rendering = false;
  }

  function openEditDialog(id, date, description) {
    $('movementDateEditId').value = id;
    $('movementDateEditValue').value = date || today();
    $('movementDateEditDescription').textContent = description ? `Alterar a data de “${description}”.` : 'Escolha a data correta deste lançamento.';
    $('movementDateDialog').showModal();
  }

  async function saveEditedDate(e) {
    e.preventDefault();
    const id = $('movementDateEditId').value;
    const date = $('movementDateEditValue').value;
    if (!id || !date) return;
    const { error } = await supabase.from('cash_movements').update({ created_at: toTimestamp(date) }).eq('id', id);
    if (error) return notify('Não foi possível alterar a data.', true);
    $('movementDateDialog').close();
    notify('Data do lançamento atualizada.');
    setTimeout(() => {
      localStorage.setItem('paco-return-finance', '1');
      location.reload();
    }, 450);
  }

  function escapeHtml(s = '') {
    return String(s).replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
  }
  function escapeAttr(s = '') { return escapeHtml(s).replace(/`/g, '&#96;'); }

  function observeList() {
    const list = $('movementList');
    if (!list) return;
    const observer = new MutationObserver(() => {
      if (rendering) return;
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(refreshMovementList, 80);
    });
    observer.observe(list, { childList: true, subtree: true });
  }

  function returnToFinanceIfNeeded() {
    if (localStorage.getItem('paco-return-finance') !== '1') return;
    localStorage.removeItem('paco-return-finance');
    const attempt = () => {
      const appVisible = !$('appView')?.classList.contains('hidden');
      const button = document.querySelector('.nav-item[data-section="finance"]');
      if (appVisible && button) button.click();
      else setTimeout(attempt, 120);
    };
    setTimeout(attempt, 120);
  }

  function init() {
    installStyles();
    installDateField();
    installDialog();
    const form = $('movementForm');
    if (form) form.addEventListener('submit', interceptMovementSubmit, true);
    document.querySelector('.nav-item[data-section="finance"]')?.addEventListener('click', () => setTimeout(refreshMovementList, 100));
    observeList();
    supabase.auth.onAuthStateChange((_event, session) => { if (session) setTimeout(refreshMovementList, 180); });
    setTimeout(refreshMovementList, 350);
    returnToFinanceIfNeeded();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
}
