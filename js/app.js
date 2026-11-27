import * as C from './core.js';
import * as Drive from './drive.js';
import * as Pluggy from './pluggy.js';
import { demoState } from './demo.js';
import { CONFIG } from './config.js';

const { brl, live, monthKey, monthLabel, addMonths, round2 } = C;
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => new Date();
const fmtDate = s => { const d = C.parseYmd(s); return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }); };
const fmtDay = s => { const t = C.parseYmd(s).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }); return t.charAt(0).toUpperCase() + t.slice(1); };
const money = (v, signed = false) => `<span class="num ${v < 0 ? 'neg' : (signed && v > 0 ? 'pos' : '')}">${signed && v > 0 ? '+' : ''}${brl(v)}</span>`;

// ---------------- estado ----------------
let state;
try { state = JSON.parse(localStorage.getItem('fin-state')) || C.emptyState(); } catch { state = C.emptyState(); }
const ui = { tab: location.hash.slice(1) || 'inicio', month: monthKey(today()), account: '', category: '', q: '', projOpen: null, cardOpen: {} };

let pushTimer = null;
function save(push = true) {
  state.updatedAt = C.nowIso();
  localStorage.setItem('fin-state', JSON.stringify(state));
  if (push && !state.demo && Drive.isSignedIn()) { clearTimeout(pushTimer); pushTimer = setTimeout(() => syncDrive(), 1500); }
}
const touch = o => { o.updatedAt = C.nowIso(); return o; };

function setSync(kind, text) {
  $('#sync').innerHTML = `<span class="dot ${kind}"></span><span>${esc(text)}</span>`;
}

// ---------------- Google Drive ----------------
let syncing = false;
async function syncDrive(interactive = false) {
  if (state.demo || !Drive.driveConfigured()) return;
  if (syncing) return; syncing = true;
  try {
    setSync('busy', 'Sincronizando…');
    if (!Drive.isSignedIn()) await Drive.signIn(interactive);
    const f = await Drive.findFile();
    if (!f) { syncing = false; setSync('', 'Sem arquivo no Drive'); return askDriveFile(); }
    const remote = await Drive.download(f.id).catch(() => null);
    if (remote && remote.version) state = C.mergeStates(state, remote);
    localStorage.setItem('fin-state', JSON.stringify(state));
    await Drive.update(f.id, state);
    localStorage.setItem('lastDriveSync', C.nowIso());
    setSync('ok', `Drive · ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`);
    render();
  } catch (e) {
    setSync('err', 'Drive: erro');
    toast(e.message);
  } finally { syncing = false; }
}

function askDriveFile() {
  modal(`<h2>Arquivo de dados no Google Drive</h2>
    <p class="muted">Não encontrei o arquivo <b>financas-familia.json</b> nesta conta Google.</p>
    <p class="small">Se sua esposa (ou você) já criou o arquivo em outra conta, peça para compartilhá-lo como <b>Editor</b> e cole o link aqui:</p>
    <div class="row"><input type="text" id="fileLink" placeholder="https://drive.google.com/file/d/…" style="flex:1"><button class="btn" data-act="useFile">Usar</button></div>
    <p class="small mt">Ou, se é a primeira vez:</p>
    <button class="btn primary" data-act="createFile">Criar arquivo novo no meu Drive</button>`);
}

// ---------------- UI utilitária ----------------
function toast(msg, action, fn, ms = 6000) {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const t = document.createElement('div'); t.className = 'toast';
  t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button>${esc(action)}</button>` : ''}`;
  if (action) t.querySelector('button').onclick = () => { t.remove(); fn(); };
  document.body.appendChild(t); setTimeout(() => t.remove(), ms);
}
function modal(html) {
  closeModal();
  const bg = document.createElement('div'); bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal">${html}</div>`;
  bg.addEventListener('click', e => { if (e.target === bg) closeModal(); });
  bg.addEventListener('click', onClick); bg.addEventListener('change', onChange);
  document.body.appendChild(bg);
  return bg;
}
const closeModal = () => document.querySelectorAll('.modal-bg').forEach(m => m.remove());

const ICONS = {
  inicio: 'M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  lancamentos: 'M4 6h16M4 12h16M4 18h10',
  cartoes: 'M3 6h18v12H3zM3 10h18M7 15h4',
  projecao: 'M3 20h18M5 16l4-5 4 3 6-8',
  planejar: 'M8 3v3M16 3v3M4 8h16v12H4zM8 13h3M8 17h6',
  ajustes: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM4 12h2M18 12h2M12 4v2M12 18v2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4',
};
const TABS = [['inicio', 'Início'], ['lancamentos', 'Lançamentos'], ['cartoes', 'Cartões'], ['projecao', 'Projeção'], ['planejar', 'Planejar'], ['ajustes', 'Ajustes']];
function renderTabs() {
  $('#tabs').innerHTML = TABS.map(([id, label]) => `<button data-tab="${id}" class="${ui.tab === id ? 'on' : ''}">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="${ICONS[id]}"/></svg>${label}</button>`).join('');
}

const catOptions = (sel, group) => {
  const groups = [['despesa', 'Despesas'], ['receita', 'Receitas'], ['neutra', 'Não conta (transferências)']];
  return groups.filter(([g]) => !group || g === group).map(([g, l]) => `<optgroup label="${l}">${live(state.categories).filter(c => c.group === g)
    .map(c => `<option ${c.id === sel ? 'selected' : ''} value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</optgroup>`).join('');
};
const accName = id => (state.accounts.find(a => a.id === id) || {}).name || '—';
const catColor = id => (C.catById(state, id) || {}).color || '#9c9c9c';

// ---------------- render ----------------
function render() {
  renderTabs();
  const v = $('#view');
  const views = { inicio: viewHome, lancamentos: viewTx, cartoes: viewCards, projecao: viewProjection, planejar: viewPlan, ajustes: viewSettings };
  v.innerHTML = (state.demo ? `<div class="banner warn"><span><b>Modo demonstração</b> — dados fictícios.</span><span class="spacer"></span><button class="btn sm" data-act="exitDemo">Sair da demonstração</button></div>` : '')
    + (views[ui.tab] || viewHome)();
  if (ui.tab === 'inicio' || ui.tab === 'projecao') mountChart();
}

// ---- Início ----
function onboarding() {
  const hasAcc = live(state.accounts).length > 0;
  if (hasAcc) return '';
  return `<div class="card"><h2>Vamos começar</h2>
    <ol class="steps">
      <li>Em <b>Ajustes</b>, entre com sua conta Google para salvar os dados no Drive (compartilhado com sua esposa).</li>
      <li>Conecte os bancos e cartões pelo <b>Meu Pluggy</b> (Open Finance) — ou crie contas manuais e importe extratos OFX/CSV.</li>
      <li>Em <b>Planejar</b>, cadastre salário, a renda semanal variável e as contas fixas — é isso que alimenta a projeção.</li>
    </ol>
    <div class="row mt wrap"><button class="btn primary" data-tab="ajustes">Ir para Ajustes</button><button class="btn" data-act="demo">Ver com dados de exemplo</button></div></div>`;
}

function viewHome() {
  const t = today();
  const p = C.projection(state, t);
  const cur = p.months[0] || { end: p.startBalance };
  const minM = p.months.reduce((m, r) => (!m || r.end < m.end ? r : m), null);
  const sum = C.monthSummary(state, monthKey(t));
  const cats = Object.entries(sum.byCat).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxCat = Math.max(1, ...cats.map(c => Math.max(c[1], (C.catById(state, c[0]) || {}).budget || 0)));
  const cards = live(state.accounts).filter(a => a.kind === 'credit');
  const upcoming = [];
  for (const c of cards) {
    const bills = C.cardBills(state, c, state.billsCache?.[c.id] || {});
    for (const m of Object.keys(bills).sort()) if (!C.isBillPaid(state, c, m, t)) { upcoming.push({ c, m, b: bills[m] }); break; }
  }
  const uncategorized = live(state.transactions).filter(x => /^Outr(os gastos|as receitas)$/.test(x.category) && !x.categoryLocked && x.date >= C.ymd(new Date(t.getFullYear(), t.getMonth() - 1, 1))).length;
  return `${onboarding()}
  <div class="grid g3">
    <div class="card stat"><div class="label">Saldo em conta hoje</div><div class="value">${money(p.startBalance)}</div><div class="sub">${live(state.accounts).filter(a => a.kind !== 'credit' && a.includeInBalance !== false).length} conta(s)</div></div>
    <div class="card stat"><div class="label">Previsão para o fim de ${monthLabel(monthKey(t), true).split(' ')[0]}</div><div class="value">${money(cur.end)}</div><div class="sub">depois de faturas, contas fixas e gastos do dia a dia</div></div>
    <div class="card stat"><div class="label">Menor saldo nos próximos ${p.months.length} meses</div><div class="value">${money(minM ? minM.end : p.startBalance)}</div>
      <div class="sub">${minM ? `em ${monthLabel(minM.month, true)}` : ''} ${minM && minM.end < (state.settings.minBalanceAlert || 0) ? '<span class="chip neg">⚠ abaixo do mínimo</span>' : ''}</div></div>
  </div>
  <div class="grid g-main mt">
    <div class="card"><h2>Saldo previsto no fim de cada mês <span class="right"><button class="btn ghost sm" data-tab="projecao">Detalhar →</button></span></h2><div class="chart" id="chart"></div></div>
    <div class="card"><h2>Próximas faturas</h2>${upcoming.length ? `<div class="list">${upcoming.map(({ c, m, b }) => `
      <div class="li"><div class="main"><div class="title">${esc(c.name)}</div><div class="meta">vence ${String(c.dueDay).padStart(2, '0')}/${m.slice(5)}/${m.slice(0, 4)} ${b.projected ? `<span class="chip">${brl(b.projected)} em parcelas</span>` : ''}</div></div><div class="amt">${money(-b.total)}</div></div>`).join('')}</div>`
      : '<div class="empty small">Nenhum cartão cadastrado.</div>'}</div>
  </div>
  <div class="grid g2 mt">
    <div class="card"><h2>${monthLabel(monthKey(t), true)} até agora</h2>
      <div class="row between"><span class="muted">Entradas</span>${money(sum.income, true)}</div>
      <div class="row between mt-s"><span class="muted">Gastos</span>${money(-sum.expense)}</div>
      <div class="row between mt-s"><b>Resultado</b><b>${money(sum.income - sum.expense, true)}</b></div>
      ${uncategorized ? `<div class="banner mt"><span>${uncategorized} lançamento(s) recente(s) sem categoria definida.</span><button class="btn sm" data-act="reviewUncat">Revisar</button></div>` : ''}
    </div>
    <div class="card"><h2>Onde o dinheiro foi <span class="right tiny">| = orçamento</span></h2>${cats.length ? cats.map(([id, v]) => {
      const b = (C.catById(state, id) || {}).budget || 0;
      return `<div class="hbar" title="${esc(id)}: ${brl(v)}${b ? ` de ${brl(b)}` : ''}"><span class="name">${esc(id)}</span><div class="track"><div class="fill" style="width:${(v / maxCat) * 100}%;${b && v > b ? 'background:var(--critical)' : ''}"></div>${b ? `<div class="budget" style="left:${(b / maxCat) * 100}%"></div>` : ''}</div><span class="num small">${brl(v)}</span></div>`;
    }).join('') : '<div class="empty small">Sem gastos neste mês ainda.</div>'}</div>
  </div>`;
}

// ---- gráfico de projeção (SVG com tooltip) ----
function mountChart() {
  const el = $('#chart'); if (!el) return;
  const p = C.projection(state, today());
  const data = p.months;
  if (!data.length) { el.innerHTML = '<div class="empty small">Sem dados.</div>'; return; }
  const W = Math.max(320, Math.round(el.clientWidth || 720)), H = W < 500 ? 220 : 260, L = 54, R = 8, T = 12, B = 26;
  const vals = data.map(d => d.end);
  let lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
  const step = niceStep((hi - lo) / 4 || 1000);
  lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
  if (hi === lo) hi = lo + step;
  const y = v => T + (hi - v) / (hi - lo) * (H - T - B);
  const bw = (W - L - R) / data.length;
  const ticks = []; for (let v = lo; v <= hi + 1e-6; v += step) ticks.push(v);
  const short = v => Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : String(Math.round(v));
  const alertLine = state.settings.minBalanceAlert || 0;
  const bars = data.map((d, i) => {
    const x = L + i * bw + bw * 0.18, w = bw * 0.64, y0 = y(0), y1 = y(d.end);
    const top = Math.min(y0, y1), h = Math.max(1, Math.abs(y1 - y0)), r = Math.min(4, w / 2, h);
    const neg = d.end < 0;
    // cantos arredondados só na ponta do dado, base reta no zero
    const path = neg
      ? `M${x},${top} h${w} v${h - r} q0,${r} -${r},${r} h-${w - 2 * r} q-${r},0 -${r},-${r} z`
      : `M${x},${top + h} v-${h - r} q0,-${r} ${r},-${r} h${w - 2 * r} q${r},0 ${r},${r} v${h - r} z`;
    return `<path d="${path}" fill="${neg ? 'var(--critical)' : 'var(--series-1)'}"/>`;
  }).join('');
  const every = bw < 44 ? 2 : 1;
  const labels = data.map((d, i) => i % every ? '' : `<text x="${L + i * bw + bw / 2}" y="${H - 8}" text-anchor="middle">${monthLabel(d.month)}</text>`).join('');
  const hits = data.map((d, i) => `<rect data-i="${i}" x="${L + i * bw}" y="${T}" width="${bw}" height="${H - T - B}" fill="transparent"/>`).join('');
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Saldo previsto no fim de cada mês">
    <g class="grid">${ticks.map(v => `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/>`).join('')}</g>
    <g class="axis">${ticks.map(v => `<text x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${short(v)}</text>`).join('')}${labels}</g>
    ${bars}
    <line class="zero" x1="${L}" x2="${W - R}" y1="${y(0)}" y2="${y(0)}"/>
    ${alertLine > 0 && alertLine < hi ? `<line x1="${L}" x2="${W - R}" y1="${y(alertLine)}" y2="${y(alertLine)}" stroke="var(--warn)" stroke-dasharray="4 4"/>` : ''}
    <g class="hits">${hits}</g></svg><div class="tip"></div>
    <details class="mt-s small"><summary>Ver como tabela</summary><table class="tbl mt-s"><tr><th>Mês</th><th>Saldo no fim</th></tr>${data.map(d => `<tr><td>${monthLabel(d.month, true)}</td><td>${brl(d.end)}</td></tr>`).join('')}</table></details>`;
  const tip = el.querySelector('.tip'), svg = el.querySelector('svg');
  svg.querySelectorAll('.hits rect').forEach(r => {
    r.addEventListener('mouseenter', () => r.setAttribute('fill', 'rgba(127,127,127,.08)'));
    r.addEventListener('mouseleave', () => { r.setAttribute('fill', 'transparent'); tip.style.display = 'none'; });
    r.addEventListener('mousemove', ev => {
      const d = data[+r.dataset.i];
      tip.innerHTML = `<b>${monthLabel(d.month, true)}</b>
        <div class="r mt-s"><span class="muted">Saldo inicial</span><span class="num">${brl(d.start)}</span></div>
        <div class="r"><span class="muted">Entradas</span><span class="num pos">+${brl(d.incomeTotal)}</span></div>
        <div class="r"><span class="muted">Contas fixas</span><span class="num">−${brl(d.fixedTotal)}</span></div>
        <div class="r"><span class="muted">Faturas</span><span class="num">−${brl(d.billsTotal)}</span></div>
        <div class="r"><span class="muted">Dia a dia (estim.)</span><span class="num">−${brl(d.variable)}</span></div>
        <div class="r mt-s"><b>Saldo no fim</b><b class="num ${d.end < 0 ? 'neg' : ''}">${brl(d.end)}</b></div>`;
      tip.style.display = 'block';
      const box = el.getBoundingClientRect();
      let left = ev.clientX - box.left + 14; if (left + 210 > box.width) left = ev.clientX - box.left - 224;
      tip.style.left = `${Math.max(0, left)}px`; tip.style.top = `${Math.max(0, ev.clientY - box.top - 60)}px`;
    });
  });
}
function niceStep(raw) { const p = Math.pow(10, Math.floor(Math.log10(raw))); const f = raw / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p; }

// ---- Lançamentos ----
function viewTx() {
  const months = [...new Set(live(state.transactions).map(t => t.date.slice(0, 7)).concat(monthKey(today())))].sort().reverse();
  const q = C.norm(ui.q);
  const txs = live(state.transactions).filter(t => t.date.slice(0, 7) === ui.month
    && (!ui.account || t.accountId === ui.account)
    && (!ui.category || (ui.category === '__sem' ? /^Outr(os gastos|as receitas)$/.test(t.category) : t.category === ui.category))
    && (!q || C.norm(t.description).includes(q) || C.norm(t.note).includes(q)))
    .sort((a, b) => b.date.localeCompare(a.date) || (a.description > b.description ? 1 : -1));
  const total = txs.reduce((s, t) => s + (C.catGroup(state, t.category) === 'neutra' ? 0 : t.amount), 0);
  let lastDay = '';
  const rows = txs.map(t => {
    const head = t.date !== lastDay ? `<div class="day">${fmtDay(t.date)}</div>` : ''; lastDay = t.date;
    return `${head}<div class="li tx">
      <span class="sw" style="background:${catColor(t.category)}"></span>
      <div class="main"><div class="title">${esc(t.description)}</div>
        <div class="meta"><span>${esc(accName(t.accountId))}</span>${t.installment ? `<span class="chip">parcela ${t.installment.n}/${t.installment.total}</span>` : ''}${t.note ? `<span>· ${esc(t.note)}</span>` : ''}${t.source === 'manual' ? '<span class="chip">manual</span>' : ''}</div></div>
      <select class="cat" data-chg="txCat" data-id="${esc(t.id)}">${catOptions(t.category)}</select>
      <div class="amt">${money(t.amount, true)}</div>
      <button class="btn ghost sm" data-act="editTx" data-id="${esc(t.id)}" aria-label="Editar">✎</button></div>`;
  }).join('');
  return `<div class="card">
    <div class="row wrap">
      <select data-chg="uiMonth">${months.map(m => `<option value="${m}" ${m === ui.month ? 'selected' : ''}>${monthLabel(m, true)}</option>`).join('')}</select>
      <select data-chg="uiAccount"><option value="">Todas as contas</option>${live(state.accounts).map(a => `<option value="${a.id}" ${a.id === ui.account ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select>
      <select data-chg="uiCategory"><option value="">Todas as categorias</option><option value="__sem" ${ui.category === '__sem' ? 'selected' : ''}>Sem categoria definida</option>${catOptions(ui.category)}</select>
      <input type="text" placeholder="Buscar…" value="${esc(ui.q)}" data-chg="uiQ" style="flex:1;min-width:140px">
      <button class="btn primary" data-act="newTx">+ Lançamento</button>
    </div>
    <div class="row between mt"><span class="muted small">${txs.length} lançamento(s)</span><span class="small">Saldo do filtro: <b>${money(total, true)}</b></span></div>
    <div class="list mt-s">${rows || '<div class="empty">Nada por aqui neste mês.</div>'}</div></div>`;
}

function txForm(t) {
  const isNew = !t;
  t = t || { date: C.ymd(today()), amount: '', description: '', accountId: live(state.accounts)[0]?.id, category: 'Outros gastos' };
  const kind = t.amount > 0 ? 'receita' : 'despesa';
  modal(`<h2>${isNew ? 'Novo lançamento' : 'Editar lançamento'}</h2>
    <div class="form" id="txf" data-id="${esc(t.id || '')}">
      <label class="f">Tipo<select name="kind"><option value="despesa" ${kind === 'despesa' ? 'selected' : ''}>Despesa</option><option value="receita" ${kind === 'receita' ? 'selected' : ''}>Receita</option></select></label>
      <label class="f">Valor (R$)<input type="text" inputmode="decimal" name="amount" value="${t.amount !== '' ? String(Math.abs(t.amount)).replace('.', ',') : ''}" ${t.source === 'pluggy' ? 'disabled' : ''}></label>
      <label class="f">Data<input type="date" name="date" value="${t.date}" ${t.source === 'pluggy' ? 'disabled' : ''}></label>
      <label class="f" style="grid-column:1/-1">Descrição<input type="text" name="description" value="${esc(t.description)}" ${t.source === 'pluggy' ? 'disabled' : ''}></label>
      <label class="f">Conta / cartão<select name="accountId" ${t.source === 'pluggy' ? 'disabled' : ''}>${live(state.accounts).map(a => `<option value="${a.id}" ${a.id === t.accountId ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}</select></label>
      <label class="f">Categoria<select name="category">${catOptions(t.category)}</select></label>
      ${isNew ? `<label class="f">Parcelas (cartão)<input type="number" name="parcelas" min="1" max="48" value="1"></label>` : ''}
      <label class="f" style="grid-column:1/-1">Observação<input type="text" name="note" value="${esc(t.note || '')}"></label>
    </div>
    ${!live(state.accounts).length ? '<p class="chip warn mt">Crie uma conta em Ajustes antes.</p>' : ''}
    <div class="row mt"><button class="btn primary" data-act="saveTx">Salvar</button><button class="btn" data-act="closeModal">Cancelar</button><span class="spacer"></span>
      ${!isNew ? `<button class="btn danger" data-act="delTx" data-id="${esc(t.id)}">Excluir</button>` : ''}</div>`);
}

function saveTxForm() {
  const f = $('#txf'); const g = n => f.querySelector(`[name=${n}]`);
  const id = f.dataset.id;
  const old = id && state.transactions.find(t => t.id === id);
  const sign = g('kind').value === 'receita' ? 1 : -1;
  if (old && old.source === 'pluggy') {
    Object.assign(old, { category: g('category').value, categoryLocked: true, note: g('note').value }); touch(old);
  } else {
    const amount = C.parseMoney(g('amount').value);
    if (!amount || isNaN(amount)) return toast('Informe o valor');
    if (!g('accountId').value) return toast('Escolha a conta');
    const base = { accountId: g('accountId').value, description: g('description').value.trim() || '(sem descrição)', category: g('category').value, categoryLocked: true, note: g('note').value, source: old?.source || 'manual' };
    if (old) Object.assign(old, base, { date: g('date').value, amount: round2(sign * Math.abs(amount)) }), touch(old);
    else {
      const n = Math.max(1, parseInt(g('parcelas')?.value || '1', 10));
      const per = round2(Math.abs(amount) / n);
      for (let k = 1; k <= n; k++) {
        const t = { id: C.uid('tx'), ...base, date: g('date').value, amount: sign * per, updatedAt: C.nowIso() };
        if (n > 1) { t.installment = { n: k, total: n, totalAmount: Math.abs(amount), purchaseDate: g('date').value }; t.description = `${base.description} ${k}/${n}`; }
        state.transactions.push(t);
        if (n > 1) break; // as demais parcelas são projetadas automaticamente na fatura
      }
    }
  }
  closeModal(); save(); render();
}

// muda categoria e oferece criar regra
function changeTxCategory(id, cat) {
  const t = state.transactions.find(x => x.id === id); if (!t) return;
  t.category = cat; t.categoryLocked = true; touch(t); save(); render();
  const key = C.descKey(t.description);
  if (key.length < 3) return;
  const similar = live(state.transactions).filter(x => x.id !== id && !x.categoryLocked && C.norm(x.description).includes(key));
  toast(`Sempre usar “${cat}” para “${key}”?${similar.length ? ` (${similar.length} parecidos)` : ''}`, 'Criar regra', () => {
    state.rules.push({ id: C.uid('rule'), pattern: key, category: cat, updatedAt: C.nowIso() });
    for (const x of similar) { x.category = cat; touch(x); }
    save(); render(); toast('Regra criada');
  }, 9000);
}

// ---- Cartões ----
function viewCards() {
  const t = today();
  const cards = live(state.accounts).filter(a => a.kind === 'credit');
  if (!cards.length) return `<div class="card empty">Nenhum cartão. Conecte pelo Meu Pluggy ou crie um cartão manual em Ajustes.</div>`;
  return `<div class="grid g2">${cards.map(c => {
    const bills = C.cardBills(state, c, state.billsCache?.[c.id] || {});
    const months = Object.keys(bills).sort().filter(m => m >= addMonths(monthKey(t), -1));
    const openM = months.find(m => !C.isBillPaid(state, c, m, t));
    const future = Object.keys(bills).filter(m => m > monthKey(t)).reduce((s, m) => s + bills[m].projected, 0);
    const used = !c.creditLimit ? null : c.available != null ? c.creditLimit - c.available
      : round2(Object.keys(bills).filter(m => !C.isBillPaid(state, c, m, t)).reduce((s, m) => s + bills[m].total, 0));
    return `<div class="card"><h2>${esc(c.name)} <span class="right tiny">fecha dia ${c.closeDay} · vence dia ${c.dueDay}</span></h2>
      ${c.creditLimit ? `<div class="row between small"><span class="muted">Limite usado</span><span class="num">${brl(used)} de ${brl(c.creditLimit)}</span></div><div class="progress mt-s"><div style="width:${Math.min(100, used / c.creditLimit * 100)}%"></div></div>` : ''}
      <div class="row between mt"><span class="muted small">Parcelas já comprometidas nos próximos meses</span><b class="num">${brl(future)}</b></div>
      <div class="grid mt">${months.slice(0, 8).map(m => {
        const b = bills[m]; const paid = C.isBillPaid(state, c, m, t); const open = ui.cardOpen[c.id + m];
        return `<div class="bill ${paid ? 'paid' : ''}">
          <div class="row"><div class="main" style="flex:1"><b>${monthLabel(m, true)}</b> ${m === openM ? '<span class="chip warn">próxima a pagar</span>' : ''} ${paid ? '<span class="chip ok">paga</span>' : ''}
            <div class="tiny">${[b.items.filter(i => !i.projected).length ? `${b.items.filter(i => !i.projected).length} compra(s)` : '', b.projected ? `${brl(b.projected)} em parcelas futuras` : ''].filter(Boolean).join(' · ')}</div></div>
            <b class="num">${brl(b.total)}</b></div>
          <div class="row mt-s"><button class="btn ghost sm" data-act="toggleBill" data-k="${c.id + m}">${open ? 'Ocultar' : 'Ver itens'}</button><span class="spacer"></span>
            <button class="btn ghost sm" data-act="markPaid" data-card="${c.id}" data-m="${m}">${paid ? 'Marcar como não paga' : 'Marcar como paga'}</button></div>
          ${open ? `<div class="list small">${b.items.sort((a, z) => (a.date || '9') < (z.date || '9') ? -1 : 1).map(i => `<div class="li"><div class="main"><div class="title">${esc(i.description)}</div><div class="meta">${i.date ? fmtDate(i.date) : 'parcela futura'}${i.installment ? ` · ${i.installment.n}/${i.installment.total}` : ''} · ${esc(i.category || '')}</div></div><div class="amt">${money(-i.amount)}</div></div>`).join('')}</div>` : ''}
        </div>`;
      }).join('')}</div></div>`;
  }).join('')}</div>`;
}

// ---- Projeção ----
function viewProjection() {
  const p = C.projection(state, today());
  const v = p.variable;
  const varCards = Object.entries(v.cards).map(([id, x]) => `${esc(accName(id))}: ${brl(x)}`).join(' · ');
  const minAlert = state.settings.minBalanceAlert || 0;
  return `<div class="card"><h2>Saldo previsto no fim de cada mês</h2><div class="chart" id="chart"></div></div>
  <div class="card mt"><h2>Mês a mês <span class="right"><select data-chg="projMonths">${[6, 12, 18, 24].map(n => `<option ${n === (state.settings.projectionMonths || 12) ? 'selected' : ''} value="${n}">${n} meses</option>`).join('')}</select></span></h2>
    <div class="scroll-x"><table class="tbl">
      <tr><th>Mês</th><th>Saldo inicial</th><th>Entradas</th><th>Contas fixas</th><th>Faturas</th><th>Dia a dia</th><th>Saldo no fim</th></tr>
      ${p.months.map(r => `<tr class="click ${r.end < minAlert ? 'neg-row' : ''}" data-act="projRow" data-m="${r.month}">
        <td>${monthLabel(r.month, true)}${r.month === monthKey(today()) ? ' <span class="tiny">(restante)</span>' : ''}</td><td>${brl(r.start)}</td><td class="pos">+${brl(r.incomeTotal)}</td><td>−${brl(r.fixedTotal)}</td><td>−${brl(r.billsTotal)}</td><td>−${brl(r.variable)}</td><td><b class="${r.end < 0 ? 'neg' : ''}">${brl(r.end)}</b></td></tr>
        ${ui.projOpen === r.month ? `<tr class="detail"><td colspan="7"><div class="grid g3 small">
          <div><b>Entradas</b>${r.incomes.map(i => `<div class="row between"><span>${esc(i.name)}</span><span class="num">${brl(i.value)}</span></div>`).join('') || '<div class="muted">—</div>'}</div>
          <div><b>Contas fixas</b>${r.fixed.map(i => `<div class="row between"><span>${esc(i.name)}</span><span class="num">${brl(i.value)}</span></div>`).join('') || '<div class="muted">—</div>'}</div>
          <div><b>Faturas</b>${r.bills.map(i => `<div class="row between"><span>${esc(i.name)}</span><span class="num">${brl(i.value)}</span></div><div class="tiny">lançado ${brl(i.known)} · parcelas ${brl(i.installments)} · estimado ${brl(i.estimated)}</div>`).join('') || '<div class="muted">—</div>'}</div>
        </div></td></tr>` : ''}`).join('')}
    </table></div>
    <p class="tiny mt">Clique num mês para ver o detalhe. Linhas destacadas: saldo abaixo do mínimo definido.</p></div>
  <div class="card mt"><h2>Como a projeção é calculada</h2>
    <ul class="small steps">
      <li><b>Saldo inicial:</b> soma das contas marcadas “entra no saldo” (${brl(p.startBalance)}).</li>
      <li><b>Entradas e contas fixas:</b> o que está cadastrado em <a href="#planejar" data-tab="planejar">Planejar</a>. Renda “média semanal” usa a média real das últimas semanas.</li>
      <li><b>Faturas:</b> compras já lançadas + parcelas futuras + estimativa de novas compras no cartão${varCards ? ` (${varCards} por mês)` : ''}.</li>
      <li><b>Dia a dia:</b> média dos últimos ${state.settings.variableLookback || 3} meses de gastos na conta fora as fixas — <b>${brl(v.conta)}/mês</b>${v.manual ? ' (valor manual)' : ''}.</li>
    </ul>
    <div class="form mt">
      <label class="f">Média dos últimos<select data-chg="lookback">${[1, 2, 3, 6].map(n => `<option ${n === (state.settings.variableLookback || 3) ? 'selected' : ''} value="${n}">${n} mês(es)</option>`).join('')}</select></label>
      <label class="f">Dia a dia manual (R$/mês)<input type="text" inputmode="decimal" data-chg="varManual" placeholder="automático" value="${state.settings.variableManual ?? ''}"></label>
      <label class="f">Alerta de saldo mínimo (R$)<input type="text" inputmode="decimal" data-chg="minAlert" value="${state.settings.minBalanceAlert || ''}" placeholder="0"></label>
    </div></div>`;
}

// ---- Planejar: recorrências, categorias, regras ----
const MODE_LABEL = { mensal: 'todo mês', semanal: 'toda semana', 'media-semanal': 'média semanal real' };
const WD = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
function viewPlan() {
  const rec = live(state.recurring);
  const cards = live(state.accounts).filter(a => a.kind === 'credit');
  const recRow = r => `<div class="li"><span class="sw" style="background:${catColor(r.category)}"></span>
    <div class="main"><div class="title">${esc(r.name)}</div><div class="meta">${MODE_LABEL[r.mode]}${r.mode === 'mensal' ? ` · dia ${r.day}` : r.mode === 'semanal' ? ` · ${WD[r.weekday ?? 5]}` : ` · últimas ${r.avgWeeks || 8} semanas de “${esc(r.category)}”`}${r.payWith && r.payWith !== 'conta' ? ` · no ${esc(accName(r.payWith))}` : ''}${r.end ? ` · até ${r.end.slice(5, 7)}/${r.end.slice(0, 4)}` : ''}</div></div>
    <div class="amt">${r.mode === 'media-semanal' ? `<span class="num">${brl(C.weeklyAverage(state, r.category, r.avgWeeks || 8, today()) || r.amount)}/sem</span>` : money(r.kind === 'receita' ? r.amount : -r.amount, true)}</div>
    <button class="btn ghost sm" data-act="editRec" data-id="${r.id}">✎</button></div>`;
  return `<div class="grid g2">
    <div class="card"><h2>Entradas previstas <span class="right"><button class="btn sm" data-act="newRec" data-kind="receita">+ Entrada</button></span></h2>
      <div class="list">${rec.filter(r => r.kind === 'receita').map(recRow).join('') || '<div class="empty small">Cadastre seu salário e a renda da sua esposa (use “média semanal real” para renda variável).</div>'}</div></div>
    <div class="card"><h2>Contas fixas <span class="right"><button class="btn sm" data-act="newRec" data-kind="despesa">+ Conta fixa</button></span></h2>
      <div class="list">${rec.filter(r => r.kind === 'despesa').map(recRow).join('') || '<div class="empty small">Aluguel, escola, luz, internet, plano de saúde…</div>'}</div></div>
  </div>
  <div class="grid g2 mt">
    <div class="card"><h2>Categorias e orçamento mensal</h2><div class="list">${live(state.categories).filter(c => c.group === 'despesa').map(c => `
      <div class="li"><input type="color" value="${c.color}" data-chg="catColor" data-id="${esc(c.id)}" style="width:28px;height:28px;border:0;background:none;padding:0">
      <div class="main"><div class="title">${esc(c.name)}</div><label class="meta"><input type="checkbox" data-chg="catFixed" data-id="${esc(c.id)}" ${c.fixed ? 'checked' : ''}> conta fixa</label></div>
      <input type="text" inputmode="decimal" placeholder="orçamento" style="width:110px" data-chg="catBudget" data-id="${esc(c.id)}" value="${c.budget || ''}"></div>`).join('')}</div>
      <div class="row mt"><input type="text" id="newCat" placeholder="Nova categoria" style="flex:1"><select id="newCatG"><option value="despesa">Despesa</option><option value="receita">Receita</option></select><button class="btn" data-act="addCat">Adicionar</button></div></div>
    <div class="card"><h2>Regras de categorização</h2>
      <p class="small muted">Quando a descrição contém o texto, a categoria é aplicada automaticamente. Ao trocar a categoria de um lançamento, o app oferece criar a regra.</p>
      <div class="list">${live(state.rules).map(r => `<div class="li"><div class="main"><div class="title">“${esc(r.pattern)}”</div><div class="meta">→ ${esc(r.category)}</div></div><button class="btn ghost sm danger" data-act="delRule" data-id="${r.id}">Remover</button></div>`).join('') || '<div class="empty small">Nenhuma regra ainda.</div>'}</div>
      <div class="row mt wrap"><input type="text" id="rulePat" placeholder="Texto (ex.: POSTO AVENIDA)" style="flex:1;min-width:140px"><select id="ruleCat">${catOptions('Outros gastos')}</select><button class="btn" data-act="addRule">Adicionar</button></div>
      <button class="btn sm mt" data-act="reapplyRules">Reaplicar regras em todos os lançamentos</button></div>
  </div>`;
}

function recForm(r, kind) {
  const isNew = !r;
  r = r || { kind, mode: 'mensal', day: 5, weekday: 5, amount: '', name: '', category: kind === 'receita' ? 'Salário' : 'Moradia', payWith: 'conta', avgWeeks: 8 };
  const cards = live(state.accounts).filter(a => a.kind === 'credit');
  modal(`<h2>${r.kind === 'receita' ? 'Entrada prevista' : 'Conta fixa'}</h2>
    <div class="form" id="recf" data-id="${r.id || ''}" data-kind="${r.kind}">
      <label class="f" style="grid-column:1/-1">Nome<input type="text" name="name" value="${esc(r.name)}" placeholder="${r.kind === 'receita' ? 'Salário' : 'Aluguel'}"></label>
      <label class="f">Frequência<select name="mode" data-chg="recMode">
        <option value="mensal" ${r.mode === 'mensal' ? 'selected' : ''}>Todo mês</option>
        <option value="semanal" ${r.mode === 'semanal' ? 'selected' : ''}>Toda semana (valor fixo)</option>
        ${r.kind === 'receita' ? `<option value="media-semanal" ${r.mode === 'media-semanal' ? 'selected' : ''}>Semanal variável (média real)</option>` : ''}</select></label>
      <label class="f" data-show="mensal">Dia do mês<input type="number" min="1" max="31" name="day" value="${r.day || 5}"></label>
      <label class="f" data-show="semanal">Dia da semana<select name="weekday">${WD.map((w, i) => `<option value="${i}" ${(r.weekday ?? 5) === i ? 'selected' : ''}>${w}</option>`).join('')}</select></label>
      <label class="f" data-show="media-semanal">Média das últimas (semanas)<input type="number" min="2" max="26" name="avgWeeks" value="${r.avgWeeks || 8}"></label>
      <label class="f"><span data-lbl>${r.mode === 'media-semanal' ? 'Valor semanal se não houver histórico' : 'Valor (R$)'}</span><input type="text" inputmode="decimal" name="amount" value="${r.amount ? String(r.amount).replace('.', ',') : ''}"></label>
      <label class="f">Categoria<select name="category">${catOptions(r.category, r.kind)}</select></label>
      ${r.kind === 'despesa' ? `<label class="f">Pago com<select name="payWith"><option value="conta">Conta corrente</option>${cards.map(c => `<option value="${c.id}" ${r.payWith === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>` : ''}
      <label class="f">Termina em (opcional)<input type="month" name="end" value="${r.end ? r.end.slice(0, 7) : ''}"></label>
    </div>
    ${r.kind === 'receita' ? '<p class="tiny">Para renda que muda toda semana, use “Semanal variável”: o app calcula a média com os lançamentos reais dessa categoria (ex.: Renda freelancer).</p>' : ''}
    <div class="row mt"><button class="btn primary" data-act="saveRec">Salvar</button><button class="btn" data-act="closeModal">Cancelar</button><span class="spacer"></span>${!isNew ? `<button class="btn danger" data-act="delRec" data-id="${r.id}">Excluir</button>` : ''}</div>`);
  syncRecMode();
}
function syncRecMode() {
  const f = $('#recf'); if (!f) return;
  const mode = f.querySelector('[name=mode]').value;
  f.querySelectorAll('[data-show]').forEach(el => { el.style.display = el.dataset.show === mode ? '' : 'none'; });
  const cat = f.querySelector('[name=category]');
  if (mode === 'media-semanal' && cat.value === 'Salário') cat.value = 'Renda freelancer';
  f.querySelector('[data-lbl]').textContent = mode === 'media-semanal' ? 'Valor semanal se não houver histórico' : 'Valor (R$)';
}
function saveRecForm() {
  const f = $('#recf'); const g = n => f.querySelector(`[name=${n}]`);
  const id = f.dataset.id;
  const data = {
    kind: f.dataset.kind, name: g('name').value.trim() || (f.dataset.kind === 'receita' ? 'Entrada' : 'Conta fixa'),
    mode: g('mode').value, day: parseInt(g('day').value, 10) || 1, weekday: parseInt(g('weekday').value, 10),
    avgWeeks: parseInt(g('avgWeeks').value, 10) || 8, amount: Math.abs(C.parseMoney(g('amount').value) || 0),
    category: g('category').value, payWith: g('payWith') ? g('payWith').value : 'conta', end: g('end').value || null, updatedAt: C.nowIso(),
  };
  if (data.mode !== 'media-semanal' && !data.amount) return toast('Informe o valor');
  if (id) Object.assign(state.recurring.find(r => r.id === id), data);
  else state.recurring.push({ id: C.uid('rec'), start: monthKey(today()), ...data });
  closeModal(); save(); render();
}

// ---- Ajustes ----
function viewSettings() {
  const items = live(state.items);
  const accs = live(state.accounts);
  const lastDrive = localStorage.getItem('lastDriveSync');
  return `<div class="grid g2">
    <div class="card"><h2>Google Drive</h2>
      ${!Drive.driveConfigured() ? `<div class="banner warn"><span>Falta configurar o <b>GOOGLE_CLIENT_ID</b> em <code>js/config.js</code> (veja o README).</span></div>` : ''}
      <p class="small muted">Os dados ficam no arquivo <b>financas-familia.json</b> no seu Drive. Compartilhe esse arquivo com sua esposa como <b>Editor</b>; ela entra com a conta Google dela e o app encontra o mesmo arquivo.</p>
      <div class="row wrap">${Drive.isSignedIn()
        ? `<span class="chip ok">Conectado</span><button class="btn" data-act="syncDrive">Sincronizar agora</button><button class="btn ghost" data-act="signOut">Sair</button>`
        : `<button class="btn primary" data-act="signIn" ${Drive.driveConfigured() ? '' : 'disabled'}>Entrar com Google</button>`}
      </div>${lastDrive ? `<p class="tiny mt-s">Última sincronização: ${new Date(lastDrive).toLocaleString('pt-BR')}</p>` : ''}
      <details class="mt small"><summary>Usar outro arquivo (link compartilhado)</summary><div class="row mt-s"><input type="text" id="fileLink2" placeholder="Link do arquivo no Drive" style="flex:1"><button class="btn" data-act="useFile2">Usar</button></div></details>
    </div>
    <div class="card"><h2>Open Finance (Meu Pluggy)</h2>
      <div class="form">
        <label class="f">Endereço do Worker<input type="url" data-chg="workerUrl" value="${esc(localStorage.getItem('workerUrl') || CONFIG.WORKER_URL || '')}" placeholder="https://…workers.dev"></label>
        <label class="f">Chave do app (APP_KEY)<input type="password" data-chg="appKey" value="${esc(localStorage.getItem('appKey') || '')}" autocomplete="off"></label>
      </div>
      <div class="row mt wrap"><button class="btn" data-act="testWorker">Testar conexão</button><button class="btn primary" data-act="connectBank">Conectar banco / cartão</button><button class="btn" data-act="syncBanks" ${items.length ? '' : 'disabled'}>Sincronizar tudo</button></div>
      <p class="tiny mt-s">No widget, escolha <b>MeuPluggy</b> e autorize. Repita uma vez por banco conectado no Meu Pluggy.<br>O app <b>sincroniza sozinho</b> ao ser aberto (se a última atualização tiver mais de ${AUTO_SYNC_HOURS} h). O Meu Pluggy busca os dados nos bancos 1× por dia.</p>
      <div class="list mt">${items.map(i => `<div class="li"><div class="main"><div class="title">${esc(i.connectorName || i.label || i.id)}</div><div class="meta">${i.status ? `<span class="chip ${i.status === 'UPDATED' ? 'ok' : 'warn'}">${esc(i.status)}</span>` : ''}<span>${i.lastSync ? `sincronizado ${new Date(i.lastSync).toLocaleString('pt-BR')}` : 'nunca sincronizado'}</span></div></div>
        <button class="btn ghost sm" data-act="syncItem" data-id="${esc(i.id)}">Sincronizar</button><button class="btn ghost sm" data-act="reconnectItem" data-id="${esc(i.id)}">Reconectar</button><button class="btn ghost sm danger" data-act="delItem" data-id="${esc(i.id)}">Remover</button></div>`).join('')}</div>
      <details class="small mt"><summary>Adicionar conexão pelo ID (item já criado no painel da Pluggy)</summary><div class="row mt-s"><input type="text" id="itemId" placeholder="ID do item" style="flex:1"><button class="btn" data-act="addItemId">Adicionar</button></div></details>
    </div>
  </div>
  <div class="card mt"><h2>Contas e cartões <span class="right"><button class="btn sm" data-act="newAcc">+ Conta manual</button></span></h2>
    <div class="scroll-x"><table class="tbl"><tr><th>Nome</th><th>Tipo</th><th>Saldo</th><th>Entra no saldo</th><th>Fecha / vence</th><th></th></tr>
    ${accs.map(a => `<tr><td><input type="text" value="${esc(a.name)}" data-chg="accName" data-id="${a.id}" style="width:100%;min-width:160px"></td>
      <td>${{ checking: 'Conta corrente', savings: 'Poupança', cash: 'Dinheiro', credit: 'Cartão' }[a.kind]}${a.source === 'pluggy' ? ' <span class="chip">Open Finance</span>' : ''}</td>
      <td>${a.kind === 'credit' ? '—' : brl(C.accountBalance(state, a))}</td>
      <td>${a.kind === 'credit' ? '—' : `<input type="checkbox" data-chg="accInc" data-id="${a.id}" ${a.includeInBalance !== false ? 'checked' : ''}>`}</td>
      <td>${a.kind === 'credit' ? `<input type="number" min="1" max="31" style="width:60px" data-chg="accClose" data-id="${a.id}" value="${a.closeDay}"> / <input type="number" min="1" max="31" style="width:60px" data-chg="accDue" data-id="${a.id}" value="${a.dueDay}">` : '—'}</td>
      <td><button class="btn ghost sm" data-act="importFor" data-id="${a.id}">Importar OFX/CSV</button>${a.source !== 'pluggy' ? `<button class="btn ghost sm danger" data-act="delAcc" data-id="${a.id}">Excluir</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">Nenhuma conta ainda.</td></tr>'}
    </table></div><input type="file" id="importFile" accept=".ofx,.csv,.txt" hidden></div>
  <div class="card mt"><h2>Backup</h2><div class="row wrap"><button class="btn" data-act="exportJson">Baixar backup (JSON)</button><label class="btn">Restaurar backup<input type="file" id="restoreFile" accept=".json" hidden></label>${state.demo ? '' : '<button class="btn" data-act="demo">Ver demonstração</button>'}</div></div>`;
}

function accForm() {
  modal(`<h2>Nova conta manual</h2><div class="form" id="accf">
    <label class="f" style="grid-column:1/-1">Nome<input type="text" name="name" placeholder="Ex.: Conta Sicredi, Cartão Nubank"></label>
    <label class="f">Tipo<select name="kind"><option value="checking">Conta corrente</option><option value="savings">Poupança</option><option value="cash">Dinheiro</option><option value="credit">Cartão de crédito</option></select></label>
    <label class="f">Saldo atual (conta)<input type="text" inputmode="decimal" name="balance" placeholder="0,00"></label>
    <label class="f">Fechamento (cartão)<input type="number" name="closeDay" min="1" max="31" value="3"></label>
    <label class="f">Vencimento (cartão)<input type="number" name="dueDay" min="1" max="31" value="10"></label>
    <label class="f">Limite (cartão)<input type="text" inputmode="decimal" name="limit"></label></div>
    <div class="row mt"><button class="btn primary" data-act="saveAcc">Criar</button><button class="btn" data-act="closeModal">Cancelar</button></div>`);
}

// ---------------- eventos ----------------
let importTarget = null;
async function onClick(e) {
  const tabBtn = e.target.closest('[data-tab]');
  if (tabBtn) { e.preventDefault(); closeModal(); ui.tab = tabBtn.dataset.tab; location.hash = ui.tab; render(); window.scrollTo(0, 0); return; }
  const el = e.target.closest('[data-act]'); if (!el) return;
  const a = el.dataset.act, id = el.dataset.id;
  try {
    switch (a) {
      case 'closeModal': closeModal(); break;
      case 'demo': localStorage.setItem('fin-state-backup', JSON.stringify(state)); state = demoState(today()); save(false); ui.tab = 'inicio'; render(); break;
      case 'exitDemo': { const b = localStorage.getItem('fin-state-backup'); state = b ? JSON.parse(b) : C.emptyState(); localStorage.removeItem('fin-state-backup'); save(false); render(); break; }
      case 'newTx': txForm(); break;
      case 'editTx': txForm(state.transactions.find(t => t.id === id)); break;
      case 'saveTx': saveTxForm(); break;
      case 'delTx': { const t = state.transactions.find(t => t.id === id); t.deleted = true; touch(t); closeModal(); save(); render(); toast('Lançamento excluído', 'Desfazer', () => { t.deleted = false; touch(t); save(); render(); }); break; }
      case 'reviewUncat': ui.tab = 'lancamentos'; ui.category = '__sem'; location.hash = 'lancamentos'; render(); break;
      case 'toggleBill': ui.cardOpen[el.dataset.k] = !ui.cardOpen[el.dataset.k]; render(); break;
      case 'markPaid': { const c = state.accounts.find(x => x.id === el.dataset.card); const k = `${c.id}|${el.dataset.m}`; state.paidBills[k] = !C.isBillPaid(state, c, el.dataset.m, today()); save(); render(); break; }
      case 'projRow': ui.projOpen = ui.projOpen === el.dataset.m ? null : el.dataset.m; render(); break;
      case 'newRec': recForm(null, el.dataset.kind); break;
      case 'editRec': recForm(state.recurring.find(r => r.id === id)); break;
      case 'saveRec': saveRecForm(); break;
      case 'delRec': { const r = state.recurring.find(r => r.id === id); r.deleted = true; touch(r); closeModal(); save(); render(); break; }
      case 'addCat': { const n = $('#newCat').value.trim(); if (!n) break; if (state.categories.some(c => c.id === n)) { toast('Já existe'); break; }
        state.categories.push({ id: n, name: n, group: $('#newCatG').value, color: '#519ced', fixed: false, budget: 0, updatedAt: C.nowIso() }); save(); render(); break; }
      case 'addRule': { const p = $('#rulePat').value.trim(); if (!p) break; state.rules.push({ id: C.uid('rule'), pattern: C.norm(p), category: $('#ruleCat').value, updatedAt: C.nowIso() }); save(); render(); break; }
      case 'delRule': { const r = state.rules.find(r => r.id === id); r.deleted = true; touch(r); save(); render(); break; }
      case 'reapplyRules': { let n = 0; for (const t of live(state.transactions)) { if (t.categoryLocked) continue; const c = C.categorize(t, state.rules); if (c !== t.category) { t.category = c; touch(t); n++; } } save(); render(); toast(`${n} lançamento(s) recategorizado(s)`); break; }
      case 'signIn': await Drive.signIn(true); render(); await syncDrive(true); autoSync(); break;
      case 'signOut': Drive.signOut(); setSync('', 'Offline'); render(); break;
      case 'syncDrive': await syncDrive(true); break;
      case 'createFile': { closeModal(); const f = await Drive.create(state); toast('Arquivo criado no Drive. Compartilhe-o com sua esposa como Editor.'); setSync('ok', 'Drive'); break; }
      case 'useFile': Drive.useFileId($('#fileLink').value); closeModal(); await syncDrive(true); break;
      case 'useFile2': Drive.useFileId($('#fileLink2').value); await syncDrive(true); break;
      case 'testWorker': await Pluggy.ping(); toast('Worker respondeu — tudo certo'); break;
      case 'connectBank': case 'reconnectItem': {
        const item = await Pluggy.openConnect(a === 'reconnectItem' ? id : undefined);
        if (!item) break;
        let it = state.items.find(i => i.id === item.id);
        if (!it) { it = { id: item.id, connectorName: item.connector?.name, updatedAt: C.nowIso() }; state.items.push(it); }
        save(); await doSync([it]); break;
      }
      case 'addItemId': { const v = $('#itemId').value.trim(); if (!v) break; if (!state.items.some(i => i.id === v)) state.items.push({ id: v, updatedAt: C.nowIso() }); save(); await doSync([state.items.find(i => i.id === v)]); break; }
      case 'syncItem': await doSync([state.items.find(i => i.id === id)]); break;
      case 'syncBanks': await doSync(live(state.items)); break;
      case 'delItem': if (confirm('Remover esta conexão? Os lançamentos já baixados continuam no app.')) { const i = state.items.find(i => i.id === id); i.deleted = true; touch(i); save(); render(); } break;
      case 'newAcc': accForm(); break;
      case 'saveAcc': {
        const f = $('#accf'); const g = n => f.querySelector(`[name=${n}]`);
        const kind = g('kind').value;
        state.accounts.push({ id: C.uid('acc'), source: 'manual', name: g('name').value.trim() || 'Conta', kind,
          initialBalance: kind === 'credit' ? 0 : (C.parseMoney(g('balance').value) || 0), includeInBalance: kind !== 'credit',
          closeDay: +g('closeDay').value || 1, dueDay: +g('dueDay').value || 10, creditLimit: C.parseMoney(g('limit').value) || null, updatedAt: C.nowIso() });
        closeModal(); save(); render(); break;
      }
      case 'delAcc': if (confirm('Excluir esta conta e os lançamentos dela?')) { const acc = state.accounts.find(x => x.id === id); acc.deleted = true; touch(acc);
        state.transactions.filter(t => t.accountId === id).forEach(t => { t.deleted = true; touch(t); }); save(); render(); } break;
      case 'importFor': importTarget = id; $('#importFile').click(); break;
      case 'exportJson': { const b = new Blob([JSON.stringify(state, null, 1)], { type: 'application/json' }); const u = URL.createObjectURL(b);
        const l = document.createElement('a'); l.href = u; l.download = `financas-backup-${C.ymd(today())}.json`; l.click(); URL.revokeObjectURL(u); break; }
    }
  } catch (err) { console.error(err); toast(err.message || String(err)); }
}

let bankSyncing = false;
async function doSync(items, quiet = false) {
  if (bankSyncing) return;
  bankSyncing = true;
  setSync('busy', 'Baixando do banco…');
  let added = 0;
  try {
    for (const it of items.filter(Boolean)) added += await Pluggy.syncItem(state, it, msg => setSync('busy', msg));
    localStorage.setItem('lastBankSync', C.nowIso());
    save(); render();
    if (!quiet || added) toast(`Sincronizado: ${added} lançamento(s) novo(s)`);
    setSync('ok', `Bancos · ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`);
  } catch (e) { setSync('err', 'Erro na sincronização'); throw e; }
  finally { bankSyncing = false; }
}

// Sincronização automática: ao abrir o app e ao voltar para ele, se a última
// atualização dos bancos tiver mais de AUTO_SYNC_HOURS (o Meu Pluggy atualiza 1x/dia).
const AUTO_SYNC_HOURS = 3;
async function autoSync() {
  if (state.demo || !Pluggy.pluggyConfigured()) return;
  const items = live(state.items);
  if (!items.length) return;
  const last = Math.min(...items.map(i => Date.parse(i.lastSync || 0) || 0));
  if (Date.now() - last < AUTO_SYNC_HOURS * 3600e3) return;
  try { await doSync(items, true); } catch (e) { console.warn('auto-sync', e); }
}

function onChange(e) {
  const el = e.target;
  if (el.id === 'importFile') return importFile(el);
  if (el.id === 'restoreFile') return restoreFile(el);
  const k = el.dataset.chg; if (!k) return;
  const id = el.dataset.id;
  const acc = id && state.accounts.find(a => a.id === id);
  const cat = id && state.categories.find(c => c.id === id);
  const set = (o, patch) => { Object.assign(o, patch); touch(o); save(); };
  switch (k) {
    case 'uiMonth': ui.month = el.value; render(); break;
    case 'uiAccount': ui.account = el.value; render(); break;
    case 'uiCategory': ui.category = el.value; render(); break;
    case 'uiQ': ui.q = el.value; render(); break;
    case 'txCat': changeTxCategory(id, el.value); break;
    case 'recMode': syncRecMode(); break;
    case 'projMonths': set(state.settings, { projectionMonths: +el.value }); render(); break;
    case 'lookback': set(state.settings, { variableLookback: +el.value }); render(); break;
    case 'varManual': set(state.settings, { variableManual: el.value.trim() === '' ? null : C.parseMoney(el.value) }); render(); break;
    case 'minAlert': set(state.settings, { minBalanceAlert: C.parseMoney(el.value) || 0 }); render(); break;
    case 'catColor': set(cat, { color: el.value }); break;
    case 'catFixed': set(cat, { fixed: el.checked }); break;
    case 'catBudget': set(cat, { budget: C.parseMoney(el.value) || 0 }); break;
    case 'workerUrl': localStorage.setItem('workerUrl', el.value.trim()); break;
    case 'appKey': localStorage.setItem('appKey', el.value.trim()); break;
    case 'accName': set(acc, { name: el.value, customName: true }); break;
    case 'accInc': set(acc, { includeInBalance: el.checked }); render(); break;
    case 'accClose': set(acc, { closeDay: +el.value || 1 }); break;
    case 'accDue': set(acc, { dueDay: +el.value || 10 }); break;
  }
}

async function importFile(input) {
  const f = input.files[0]; input.value = ''; if (!f || !importTarget) return;
  const buf = await f.arrayBuffer();
  let text = new TextDecoder('utf-8').decode(buf);
  if (text.includes('�')) text = new TextDecoder('windows-1252').decode(buf);
  const txs = /<OFX>|<STMTTRN>/i.test(text) ? C.parseOFX(text, importTarget, state.rules) : C.parseCSV(text, importTarget, state.rules);
  if (!txs.length) return toast('Não encontrei lançamentos nesse arquivo');
  const added = C.upsertTransactions(state, txs);
  save(); render(); toast(`${added} lançamento(s) importado(s) (${txs.length - added} já existiam)`);
}
async function restoreFile(input) {
  const f = input.files[0]; input.value = ''; if (!f) return;
  const data = JSON.parse(await f.text());
  if (!data.version || !data.transactions) return toast('Arquivo de backup inválido');
  if (!confirm('Juntar o backup com os dados atuais?')) return;
  state = C.mergeStates(state, data); save(); render(); toast('Backup restaurado');
}

document.addEventListener('click', e => { if (!e.target.closest('.modal-bg')) onClick(e); });
document.addEventListener('change', e => { if (!e.target.closest('.modal-bg')) onChange(e); });
window.addEventListener('hashchange', () => { const t = location.hash.slice(1); if (t && t !== ui.tab) { ui.tab = t; render(); } });
window.addEventListener('resize', () => { clearTimeout(window._rz); window._rz = setTimeout(mountChart, 150); });

// ---------------- início ----------------
render();
setSync('', state.demo ? 'Demonstração' : (Drive.driveConfigured() ? 'Offline' : 'Só neste aparelho'));
(async () => {
  if (!state.demo && Drive.driveConfigured()) {
    // primeiro traz o que está no Drive (pode já ter sido sincronizado no outro celular)
    if (Drive.isSignedIn()) await syncDrive(false);
    else if (localStorage.getItem('driveConsent')) $('#sync').innerHTML = `<button class="btn sm" data-act="signIn">Entrar no Drive</button>`;
  }
  await autoSync();
})();
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') autoSync(); });
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
