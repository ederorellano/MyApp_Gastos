'use strict';
/* ===== Estado ===== */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const store = {
  get(k, d) { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* sin storage */ } },
};
const today = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const state = {
  month: today().slice(0, 7),
  categories: [],
  editingId: null,
  filter: { type: '', category_id: '', q: '' },
  currency: store.get('currency', 'ARS'),
};

/* ===== Utilidades ===== */
let fmt;
function setCurrency(c) {
  state.currency = c;
  store.set('currency', c);
  fmt = new Intl.NumberFormat('es-AR', { style: 'currency', currency: c, maximumFractionDigits: 2 });
  const sym = fmt.formatToParts(0).find(p => p.type === 'currency');
  $('#currencySymbol').textContent = sym ? sym.value : '$';
}
const money = n => fmt.format(n || 0);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const monthName = (m, opts = { month: 'long', year: 'numeric' }) => {
  const [y, mo] = m.split('-').map(Number);
  return cap(new Date(y, mo - 1, 1).toLocaleDateString('es-AR', opts));
};
const shiftMonth = (m, d) => {
  const [y, mo] = m.split('-').map(Number);
  const x = new Date(y, mo - 1 + d, 1);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`;
};
const dayLabel = iso => {
  if (iso === today()) return 'Hoy';
  const y = new Date(); y.setDate(y.getDate() - 1);
  if (iso === new Date(y.getTime() - y.getTimezoneOffset() * 60000).toISOString().slice(0, 10)) return 'Ayer';
  const [a, b, c] = iso.split('-').map(Number);
  return cap(new Date(a, b - 1, c).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'short' }));
};

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: opts.body ? { 'Content-Type': 'application/json' } : undefined,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Error de conexión');
  return data;
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

/* ===== Render ===== */
function txItem(t) {
  const sign = t.type === 'ingreso' ? '+' : '−';
  const color = t.color || '#94a3b8';
  return `<li class="tx" data-id="${t.id}" tabindex="0">
    <span class="ic" style="background:${esc(color)}22">${esc(t.icon || '❔')}</span>
    <span class="info">
      <div class="title">${esc(t.description || t.category || 'Sin descripción')}</div>
      <div class="meta">${esc(t.category || 'Sin categoría')}</div>
    </span>
    <span class="amt ${t.type}">${sign} ${money(t.amount)}</span>
  </li>`;
}
const emptyMsg = (txt = 'Todavía no hay movimientos este mes') =>
  `<li class="empty"><span class="big">🪙</span>${txt}<br><small>Toca <b>＋</b> para registrar uno</small></li>`;

function renderDonut(items, total) {
  const svg = $('#donut');
  let html = `<circle cx="21" cy="21" r="15.915" fill="none" stroke="var(--surface-2)" stroke-width="5"></circle>`;
  let offset = 0;
  for (const it of items) {
    const pct = (it.total / total) * 100;
    html += `<circle cx="21" cy="21" r="15.915" fill="none" stroke="${esc(it.color)}" stroke-width="5"
      stroke-dasharray="${pct} ${100 - pct}" stroke-dashoffset="${-offset}"><title>${esc(it.category)}: ${money(it.total)}</title></circle>`;
    offset += pct;
  }
  svg.innerHTML = html;
  $('#donutTotal').textContent = money(total);
  $('#catLegend').innerHTML = items.length
    ? items.map(it => `<li><span class="sw" style="background:${esc(it.color)}"></span><span>${esc(it.icon)} ${esc(it.category)}</span>
        <span class="pct">${Math.round((it.total / total) * 100)}%</span><span class="amt">${money(it.total)}</span></li>`).join('')
    : '<li class="empty" style="display:block">Sin egresos este mes 🎉</li>';
}

function renderBars(trend) {
  const max = Math.max(1, ...trend.flatMap(t => [t.ingresos, t.egresos]));
  $('#bars').innerHTML = trend.map(t => `
    <div class="bar-group ${t.month === state.month ? 'current' : ''}" title="${monthName(t.month)}\nIngresos: ${money(t.ingresos)}\nEgresos: ${money(t.egresos)}">
      <div class="bar-pair">
        <div class="bar inc" style="height:${(t.ingresos / max) * 100}%"></div>
        <div class="bar exp" style="height:${(t.egresos / max) * 100}%"></div>
      </div>
      <span class="bar-label">${monthName(t.month, { month: 'short' }).replace('.', '')}</span>
    </div>`).join('');
}

async function loadSummary() {
  const [s, recent] = await Promise.all([
    api(`/api/summary?month=${state.month}`),
    api(`/api/transactions?month=${state.month}`),
  ]);
  $('#balance').textContent = money(s.balance);
  $('#accumulated').textContent = money(s.accumulated);
  $('#ingresos').textContent = money(s.ingresos);
  $('#egresos').textContent = money(s.egresos);
  const exp = s.byCategory.filter(c => c.type === 'egreso');
  renderDonut(exp, s.egresos);
  renderBars(s.trend);
  $('#recentList').innerHTML = recent.length ? recent.slice(0, 6).map(txItem).join('') : emptyMsg();
}

async function loadList() {
  const p = new URLSearchParams({ month: state.month });
  for (const [k, v] of Object.entries(state.filter)) if (v) p.set(k, v);
  $('#exportBtn').href = `/api/export.csv?${p}`;
  const rows = await api(`/api/transactions?${p}`);
  if (!rows.length) {
    const filtered = state.filter.type || state.filter.category_id || state.filter.q;
    $('#txList').innerHTML = emptyMsg(filtered ? 'No hay resultados con esos filtros' : undefined);
    return;
  }
  const byDay = new Map();
  for (const r of rows) (byDay.get(r.date) || byDay.set(r.date, []).get(r.date)).push(r);
  let html = '';
  for (const [day, items] of byDay) {
    const net = items.reduce((a, t) => a + (t.type === 'ingreso' ? t.amount : -t.amount), 0);
    html += `<li class="day"><span>${dayLabel(day)}</span><span>${net >= 0 ? '+' : '−'} ${money(Math.abs(net))}</span></li>`;
    html += items.map(txItem).join('');
  }
  $('#txList').innerHTML = html;
}

async function loadCategories() {
  state.categories = await api('/api/categories');
  const li = c => `<li><span class="ic" style="background:${esc(c.color)}22">${esc(c.icon)}</span><span>${esc(c.name)}</span>
    <button data-del-cat="${c.id}" aria-label="Eliminar ${esc(c.name)}" title="Eliminar">🗑</button></li>`;
  $('#catsEgreso').innerHTML = state.categories.filter(c => c.type === 'egreso').map(li).join('');
  $('#catsIngreso').innerHTML = state.categories.filter(c => c.type === 'ingreso').map(li).join('');
  const sel = $('#catFilter');
  const cur = sel.value;
  sel.innerHTML = '<option value="">Todas las categorías</option>' +
    ['egreso', 'ingreso'].map(t => `<optgroup label="${t === 'egreso' ? 'Egresos' : 'Ingresos'}">` +
      state.categories.filter(c => c.type === t).map(c => `<option value="${c.id}">${esc(c.icon)} ${esc(c.name)}</option>`).join('') + '</optgroup>').join('');
  sel.value = state.categories.some(c => String(c.id) === cur) ? cur : '';
}

async function refresh() {
  $('#monthLabel').textContent = monthName(state.month);
  try {
    await Promise.all([loadSummary(), loadList()]);
  } catch (e) { toast('⚠️ ' + e.message); }
}

/* ===== Formulario de movimiento ===== */
const dlg = $('#txDialog');
const form = $('#txForm');

function renderChips(selectedId) {
  const type = form.type.value;
  const cats = state.categories.filter(c => c.type === type);
  $('#catChips').innerHTML = cats.map(c =>
    `<button type="button" class="chip ${c.id === selectedId ? 'active' : ''}" data-cat="${c.id}" style="--c:${esc(c.color)}">${esc(c.icon)} ${esc(c.name)}</button>`
  ).join('') || '<small class="field-label">No hay categorías para este tipo</small>';
}
const selectedCat = () => { const a = $('#catChips .chip.active'); return a ? Number(a.dataset.cat) : null; };

function openForm(tx) {
  state.editingId = tx?.id ?? null;
  form.reset();
  $('#formError').textContent = '';
  $('#txTitle').textContent = tx ? 'Editar movimiento' : 'Nuevo movimiento';
  $('#deleteTx').classList.toggle('hidden', !tx);
  form.type.value = tx?.type || store.get('lastType', 'egreso');
  form.amount.value = tx?.amount ?? '';
  form.date.value = tx?.date || (state.month === today().slice(0, 7) ? today() : `${state.month}-01`);
  form.description.value = tx?.description || '';
  renderChips(tx?.category_id ?? null);
  dlg.showModal();
  setTimeout(() => form.amount.focus(), 50);
}

form.addEventListener('change', e => { if (e.target.name === 'type') renderChips(null); });
$('#catChips').addEventListener('click', e => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  const wasActive = chip.classList.contains('active');
  $$('#catChips .chip').forEach(c => c.classList.remove('active'));
  if (!wasActive) chip.classList.add('active');
});

form.addEventListener('submit', async e => {
  e.preventDefault();
  const body = {
    type: form.type.value,
    amount: Number(form.amount.value),
    date: form.date.value,
    description: form.description.value,
    category_id: selectedCat(),
  };
  try {
    if (state.editingId) await api(`/api/transactions/${state.editingId}`, { method: 'PUT', body });
    else await api('/api/transactions', { method: 'POST', body });
    store.set('lastType', body.type);
    dlg.close();
    toast(state.editingId ? '✏️ Movimiento actualizado' : '✅ Movimiento guardado');
    if (body.date.slice(0, 7) !== state.month) state.month = body.date.slice(0, 7);
    refresh();
  } catch (err) { $('#formError').textContent = err.message; }
});

$('#deleteTx').addEventListener('click', async () => {
  if (!state.editingId || !confirm('¿Eliminar este movimiento?')) return;
  try {
    await api(`/api/transactions/${state.editingId}`, { method: 'DELETE' });
    dlg.close();
    toast('🗑 Movimiento eliminado');
    refresh();
  } catch (err) { $('#formError').textContent = err.message; }
});
$('#closeDialog').addEventListener('click', () => dlg.close());
dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });
$('#fab').addEventListener('click', () => openForm());

async function editById(id) {
  const rows = await api(`/api/transactions?month=${state.month}`);
  const tx = rows.find(r => r.id === id);
  if (tx) openForm(tx);
}
for (const list of ['#recentList', '#txList']) {
  $(list).addEventListener('click', e => { const li = e.target.closest('.tx'); if (li) editById(Number(li.dataset.id)); });
  $(list).addEventListener('keydown', e => { const li = e.target.closest('.tx'); if (li && e.key === 'Enter') editById(Number(li.dataset.id)); });
}

/* ===== Navegación ===== */
function showTab(name) {
  $$('.tab').forEach(t => { const on = t.dataset.tab === name; t.classList.toggle('active', on); t.setAttribute('aria-selected', on); });
  $$('.panel').forEach(p => p.classList.toggle('hidden', p.id !== `tab-${name}`));
  store.set('tab', name);
}
$$('.tab').forEach(t => t.addEventListener('click', () => showTab(t.dataset.tab)));
$$('[data-goto]').forEach(b => b.addEventListener('click', () => showTab(b.dataset.goto)));
$('#prevMonth').addEventListener('click', () => { state.month = shiftMonth(state.month, -1); refresh(); });
$('#nextMonth').addEventListener('click', () => { state.month = shiftMonth(state.month, 1); refresh(); });

/* ===== Filtros ===== */
let searchTimer;
$('#search').addEventListener('input', e => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => { state.filter.q = e.target.value.trim(); loadList().catch(err => toast(err.message)); }, 250);
});
$('#typeFilter').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  $$('#typeFilter button').forEach(x => x.classList.toggle('active', x === b));
  state.filter.type = b.dataset.type;
  loadList().catch(err => toast(err.message));
});
$('#catFilter').addEventListener('change', e => { state.filter.category_id = e.target.value; loadList().catch(err => toast(err.message)); });

/* ===== Categorías ===== */
$('#catForm').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target;
  try {
    await api('/api/categories', { method: 'POST', body: { name: f.name.value, type: f.type.value, icon: f.icon.value, color: f.color.value } });
    f.name.value = '';
    toast('🏷️ Categoría creada');
    await loadCategories();
  } catch (err) { toast('⚠️ ' + err.message); }
});
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-del-cat]');
  if (!b) return;
  if (!confirm('¿Eliminar la categoría? Los movimientos quedarán "Sin categoría".')) return;
  try {
    await api(`/api/categories/${b.dataset.delCat}`, { method: 'DELETE' });
    toast('Categoría eliminada');
    await loadCategories();
    refresh();
  } catch (err) { toast('⚠️ ' + err.message); }
});

/* ===== Tema y moneda ===== */
function applyTheme(t) { document.documentElement.dataset.theme = t; store.set('theme', t); }
applyTheme(store.get('theme', matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
$('#themeBtn').addEventListener('click', () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
$('#currency').value = state.currency;
$('#currency').addEventListener('change', e => { setCurrency(e.target.value); refresh(); });
setCurrency(state.currency);

/* ===== Atajos ===== */
document.addEventListener('keydown', e => {
  if (dlg.open || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
  if (e.key === 'n' || e.key === '+') { e.preventDefault(); openForm(); }
  if (e.key === 'ArrowLeft') $('#prevMonth').click();
  if (e.key === 'ArrowRight') $('#nextMonth').click();
});

/* ===== Inicio ===== */
showTab(store.get('tab', 'resumen'));
loadCategories().then(refresh).catch(e => toast('⚠️ ' + e.message));
