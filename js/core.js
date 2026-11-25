// Núcleo do app: modelo de dados, categorização, faturas, projeção e importação.
// Módulo puro (sem DOM) — testável em Node.

export const uid = (p = 'id') => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
export const nowIso = () => new Date().toISOString();

// ---------- datas ----------
export const pad = n => String(n).padStart(2, '0');
export const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseYmd = s => { const [y, m, d] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
export const monthKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
export const addMonths = (key, n) => { const [y, m] = key.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return monthKey(d); };
export const daysInMonth = key => { const [y, m] = key.split('-').map(Number); return new Date(y, m, 0).getDate(); };
export const monthDiff = (a, b) => { const [ya, ma] = a.split('-').map(Number); const [yb, mb] = b.split('-').map(Number); return (yb - ya) * 12 + (mb - ma); };
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const monthLabel = (key, long = false) => {
  const [y, m] = key.split('-').map(Number);
  const LONG = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  return long ? `${LONG[m - 1]} de ${y}` : `${MESES[m - 1]}/${String(y).slice(2)}`;
};

// ---------- dinheiro ----------
const fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
export const brl = v => fmtBRL.format(Math.round((v || 0) * 100) / 100);
export const round2 = v => Math.round(v * 100) / 100;
export function parseMoney(s) {
  if (typeof s === 'number') return s;
  let t = String(s || '').trim().replace(/[R$\s]/g, '');
  let neg = false;
  if (/^\(.*\)$/.test(t)) { neg = true; t = t.slice(1, -1); }
  if (t.endsWith('-')) { neg = true; t = t.slice(0, -1); }
  if (t.includes(',') && t.includes('.')) {
    t = t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  } else if (t.includes(',')) t = t.replace(',', '.');
  const v = parseFloat(t);
  return isNaN(v) ? NaN : (neg ? -Math.abs(v) : v);
}

// ---------- texto ----------
export const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
  .replace(/\s+/g, ' ').trim();
// Parte "estável" da descrição, usada para criar regras: remove datas, números de parcela e códigos.
export function descKey(s) {
  return norm(s)
    .replace(/\b(PARC(ELA)?\.?\s*)?\d{1,2}\s*\/\s*\d{1,2}\b/g, ' ')
    .replace(/\b\d{2}\/\d{2}(\/\d{2,4})?\b/g, ' ')
    .replace(/\b\d{3,}\b/g, ' ')
    .replace(/[*#_\-]+/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

// ---------- categorias ----------
export const DEFAULT_CATEGORIES = [
  ['Mercado', 'despesa', '#00b894'],
  ['Restaurantes e delivery', 'despesa', '#f47230'],
  ['Moradia', 'despesa', '#6a4ce2', true],
  ['Contas da casa', 'despesa', '#257de0', true],
  ['Transporte', 'despesa', '#f2a600'],
  ['Carro', 'despesa', '#8a6d3b'],
  ['Saúde', 'despesa', '#ec4647'],
  ['Educação', 'despesa', '#2370cd', true],
  ['Lazer', 'despesa', '#ee7fac'],
  ['Assinaturas', 'despesa', '#9887ef', true],
  ['Compras', 'despesa', '#e76624'],
  ['Vestuário', 'despesa', '#e24d8b'],
  ['Casa e manutenção', 'despesa', '#519ced'],
  ['Pets', 'despesa', '#d28e05'],
  ['Presentes e doações', 'despesa', '#00a888'],
  ['Impostos e taxas', 'despesa', '#666666'],
  ['Seguros', 'despesa', '#1757ac', true],
  ['Empréstimos e juros', 'despesa', '#dc3c3d', true],
  ['Outros gastos', 'despesa', '#9c9c9c'],
  ['Salário', 'receita', '#008a17'],
  ['Renda freelancer', 'receita', '#0aac23'],
  ['Outras receitas', 'receita', '#00b894'],
  ['Pagamento de fatura', 'neutra', '#9c9c9c'],
  ['Transferências', 'neutra', '#9c9c9c'],
  ['Investimentos', 'neutra', '#9c9c9c'],
].map(([name, group, color, fixed]) => ({ id: name, name, group, color, fixed: !!fixed, budget: 0 }));

// Mapeamento das categorias da Pluggy (em inglês) + palavras da descrição.
const MAP = [
  [/credit card payment|pagamento de fatura|pgto fatura|pag fatura|fatura cart/i, 'Pagamento de fatura'],
  [/investment|aplicac|resgate|cdb|tesouro|poupanca/i, 'Investimentos'],
  [/salary|salario|folha|proventos|vencimento/i, 'Salário'],
  [/supermarket|grocer|mercado|atacad|hortifruti|acougue|padaria/i, 'Mercado'],
  [/eating out|restaurant|food delivery|ifood|rappi|lanchonete|pizzaria|bar e /i, 'Restaurantes e delivery'],
  [/gas station|fuel|posto|combust|shell|ipiranga|petrobras/i, 'Transporte'],
  [/taxi|ride.?hail|uber|99app|99 tecnologia|public transport|onibus|metro|parking|estacionamento|toll|pedagio|sem parar|conectcar/i, 'Transporte'],
  [/vehicle|automotive|car insurance|ipva|licenciamento|oficina|auto ?pecas|detran/i, 'Carro'],
  [/rent|aluguel|condominio|housing|mortgage|financiamento imob/i, 'Moradia'],
  [/electric|energia|copel|water|sanepar|saneamento|internet|telecom|mobile|telephone|celular|vivo|claro|tim\b|gas bill|utilities/i, 'Contas da casa'],
  [/pharmac|drogar|farmac|health|hospital|clinic|dentist|laborat|medic|unimed|plano de saude|gym|fitness|academia/i, 'Saúde'],
  [/education|school|escola|faculdade|curso|university|books|livraria/i, 'Educação'],
  [/streaming|netflix|spotify|disney|hbo|prime video|youtube|apple\.com|google one|icloud|subscription|assinatura/i, 'Assinaturas'],
  [/entertainment|leisure|cinema|show|ingresso|travel|viagem|hotel|airline|aereo|turismo|lottery|loteria/i, 'Lazer'],
  [/clothing|vestuario|roupa|calcados|renner|riachuelo|c&a|zara|shoes/i, 'Vestuário'],
  [/pet|veterin|petz|cobasi/i, 'Pets'],
  [/home improvement|construc|leroy|madeireira|material de constr|furniture|moveis/i, 'Casa e manutenção'],
  [/tax|imposto|iof|darf|bank fee|tarifa|anuidade|juros|interest/i, 'Impostos e taxas'],
  [/insurance|seguro/i, 'Seguros'],
  [/loan|emprestimo|financiamento/i, 'Empréstimos e juros'],
  [/donation|doacao|gift|presente/i, 'Presentes e doações'],
  [/shopping|online shopping|electronics|magazine luiza|amazon|mercado ?livre|shopee|americanas|casas bahia|aliexpress/i, 'Compras'],
  [/transfer|pix|ted\b|doc\b|same person/i, 'Transferências'],
];

export function guessCategory(pluggyCategory, description, isIncome) {
  const pc = String(pluggyCategory || '');
  const d = norm(description);
  for (const [re, cat] of MAP) if (re.test(pc)) return fixIncome(cat, isIncome);
  for (const [re, cat] of MAP) if (re.test(d)) return fixIncome(cat, isIncome);
  return isIncome ? 'Outras receitas' : 'Outros gastos';
}
function fixIncome(cat, isIncome) {
  if (cat === 'Transferências' || cat === 'Pagamento de fatura' || cat === 'Investimentos') return cat;
  if (isIncome && cat !== 'Salário') return 'Outras receitas';
  if (!isIncome && cat === 'Salário') return 'Outros gastos';
  return cat;
}

// Regras do usuário têm prioridade. pattern = trecho normalizado contido na descrição.
export function applyRules(tx, rules) {
  const d = norm(tx.description);
  const r = (rules || []).filter(r => !r.deleted && r.pattern && d.includes(norm(r.pattern)))
    .sort((a, b) => b.pattern.length - a.pattern.length)[0];
  return r ? r.category : null;
}
export function categorize(tx, rules) {
  if (tx.categoryLocked) return tx.category;
  return applyRules(tx, rules) || guessCategory(tx.pluggyCategory, tx.description, tx.amount > 0);
}

// ---------- estado ----------
export function emptyState() {
  return {
    version: 1,
    updatedAt: nowIso(),
    accounts: [], items: [], transactions: [], rules: [], recurring: [],
    categories: DEFAULT_CATEGORIES.map(c => ({ ...c, updatedAt: nowIso() })),
    paidBills: {},
    settings: { projectionMonths: 12, variableLookback: 3, variableManual: null, minBalanceAlert: 0, updatedAt: nowIso() },
  };
}
export const live = arr => (arr || []).filter(x => !x.deleted);
export const catById = (state, id) => state.categories.find(c => c.id === id);
export const catGroup = (state, id) => (catById(state, id) || {}).group || 'despesa';

// Converte transação da Pluggy para o formato do app.
export function fromPluggyTx(t, account, rules) {
  const isCredit = (t.type || '').toUpperCase() === 'CREDIT';
  const amount = round2(isCredit ? Math.abs(t.amount) : -Math.abs(t.amount));
  const md = t.creditCardMetadata || {};
  const tx = {
    id: `plg_${t.id}`,
    pluggyId: t.id,
    accountId: account.id,
    date: String(t.date).slice(0, 10),
    description: (t.merchant && t.merchant.name) ? `${t.description}` : (t.description || t.descriptionRaw || ''),
    merchant: t.merchant ? (t.merchant.businessName || t.merchant.name) : undefined,
    amount,
    pluggyCategory: t.category || '',
    billId: md.billId || null,
    installment: md.totalInstallments > 1 ? {
      n: md.installmentNumber || 1, total: md.totalInstallments,
      totalAmount: md.totalAmount || null, purchaseDate: md.purchaseDate ? String(md.purchaseDate).slice(0, 10) : null,
    } : null,
    source: 'pluggy',
    updatedAt: nowIso(),
  };
  tx.category = categorize(tx, rules);
  return tx;
}

export function fromPluggyAccount(a, itemId, existing) {
  const isCard = a.type === 'CREDIT';
  const cd = a.creditData || {};
  const closeDay = cd.balanceCloseDate ? parseYmd(cd.balanceCloseDate).getDate() : existing?.closeDay;
  const dueDay = cd.balanceDueDate ? parseYmd(cd.balanceDueDate).getDate() : existing?.dueDay;
  return {
    ...(existing || {}),
    id: existing?.id || `acc_${a.id}`,
    pluggyId: a.id,
    itemId,
    source: 'pluggy',
    name: existing?.customName ? existing.name : [a.marketingName || a.name, a.number ? `•${String(a.number).slice(-4)}` : ''].filter(Boolean).join(' '),
    kind: isCard ? 'credit' : (a.subtype === 'SAVINGS_ACCOUNT' ? 'savings' : 'checking'),
    balance: round2(isCard ? -Math.abs(a.balance || 0) : (a.balance || 0)),
    balanceAt: nowIso(),
    creditLimit: cd.creditLimit ?? existing?.creditLimit ?? null,
    available: cd.availableCreditLimit ?? null,
    closeDay: closeDay || existing?.closeDay || 1,
    dueDay: dueDay || existing?.dueDay || 10,
    includeInBalance: existing ? existing.includeInBalance !== false : !isCard,
    updatedAt: nowIso(),
  };
}

// Insere/atualiza transações preservando categoria escolhida pelo usuário e notas.
export function upsertTransactions(state, incoming) {
  const byId = new Map(state.transactions.map(t => [t.id, t]));
  let added = 0;
  for (const t of incoming) {
    const old = byId.get(t.id);
    if (old) {
      if (old.deleted) continue;
      Object.assign(old, { ...t, category: old.categoryLocked ? old.category : t.category,
        categoryLocked: old.categoryLocked, note: old.note, updatedAt: nowIso() });
    } else { state.transactions.push(t); byId.set(t.id, t); added++; }
  }
  return added;
}

// Saldo da conta: Pluggy informa; contas manuais = saldo inicial + lançamentos.
export function accountBalance(state, acc) {
  if (acc.source === 'pluggy') return acc.balance || 0;
  const sum = live(state.transactions).filter(t => t.accountId === acc.id).reduce((s, t) => s + t.amount, 0);
  return round2((acc.initialBalance || 0) + sum);
}

// ---------- cartões / faturas ----------
// Mês de vencimento (YYYY-MM) da fatura que recebe uma compra feita em `date`.
export function billMonthFor(date, closeDay, dueDay) {
  const d = typeof date === 'string' ? parseYmd(date) : date;
  let closeMonth = monthKey(d);
  if (d.getDate() >= closeDay) closeMonth = addMonths(closeMonth, 1);
  return dueDay > closeDay ? closeMonth : addMonths(closeMonth, 1);
}

function seriesKey(t) {
  const i = t.installment;
  return [t.accountId, descKey(t.description), i.total, Math.round(Math.abs(t.amount))].join('|');
}

// Faturas de um cartão por mês de vencimento, incluindo parcelas futuras projetadas.
export function cardBills(state, card, billsById = {}) {
  // o pagamento da fatura aparece como crédito no cartão — não entra na soma (estornos entram)
  const txs = live(state.transactions).filter(t => t.accountId === card.id && t.category !== 'Pagamento de fatura');
  const bills = {};
  const add = (month, value, item) => {
    const b = bills[month] || (bills[month] = { month, total: 0, items: [], projected: 0 });
    b.total = round2(b.total + value);
    if (item.projected) b.projected = round2(b.projected + value);
    b.items.push(item);
  };
  const series = new Map();
  for (const t of txs) {
    let m;
    const known = t.billId && billsById[t.billId];
    if (known) m = String(known.dueDate).slice(0, 7);
    else {
      m = billMonthFor(t.date, card.closeDay, card.dueDay);
      const i = t.installment;
      if (i && i.n > 1 && i.purchaseDate && i.purchaseDate === t.date) m = addMonths(m, i.n - 1);
    }
    add(m, -t.amount, { ...t, billMonth: m });
    if (t.installment) {
      const k = seriesKey(t);
      const s = series.get(k);
      if (!s || t.installment.n > s.n) series.set(k, { n: t.installment.n, month: m, tx: t, seen: new Set([...(s?.seen || []), t.installment.n]) });
      else s.seen.add(t.installment.n);
    }
  }
  for (const s of series.values()) {
    const { tx } = s;
    for (let k = s.n + 1; k <= tx.installment.total; k++) {
      if (s.seen.has(k)) continue;
      const m = addMonths(s.month, k - s.n);
      add(m, -tx.amount, { id: `${tx.id}_p${k}`, description: tx.description, amount: tx.amount, category: tx.category,
        installment: { ...tx.installment, n: k }, projected: true, billMonth: m, date: null });
    }
  }
  return bills;
}

export function isBillPaid(state, card, month, today) {
  const key = `${card.id}|${month}`;
  if (key in (state.paidBills || {})) return !!state.paidBills[key];
  const cur = monthKey(today);
  if (month < cur) return true;
  if (month > cur) return false;
  return today.getDate() > (card.dueDay || 10);
}

// ---------- recorrências ----------
// Quantas vezes um dia da semana (0=dom) ocorre no mês, a partir do dia `fromDay` (exclusive).
export function weekdayCount(key, weekday, fromDay = 0) {
  const [y, m] = key.split('-').map(Number);
  let c = 0;
  for (let d = fromDay + 1; d <= daysInMonth(key); d++) if (new Date(y, m - 1, d).getDay() === weekday) c++;
  return c;
}

// Média semanal de uma categoria de receita nas últimas N semanas.
export function weeklyAverage(state, category, weeks, today) {
  const from = new Date(today); from.setDate(from.getDate() - weeks * 7);
  const f = ymd(from), t = ymd(today);
  const sum = live(state.transactions).filter(x => x.category === category && x.amount > 0 && x.date > f && x.date <= t)
    .reduce((s, x) => s + x.amount, 0);
  return round2(sum / weeks);
}

// Valor de uma recorrência num mês. Se `fromDay` (mês corrente), só o que falta acontecer.
export function recurringInMonth(state, r, key, today, fromDay = 0) {
  if (r.deleted) return 0;
  if (r.start && key < r.start.slice(0, 7)) return 0;
  if (r.end && key > r.end.slice(0, 7)) return 0;
  const sign = r.kind === 'receita' ? 1 : -1;
  if (r.mode === 'mensal') {
    const day = Math.min(r.day || 1, daysInMonth(key));
    return day > fromDay ? sign * Math.abs(r.amount) : 0;
  }
  if (r.mode === 'semanal') return sign * Math.abs(r.amount) * weekdayCount(key, r.weekday ?? 5, fromDay);
  if (r.mode === 'media-semanal') {
    const avg = weeklyAverage(state, r.category, r.avgWeeks || 8, today) || Math.abs(r.amount || 0);
    const days = daysInMonth(key) - fromDay;
    return sign * round2(avg * days / 7);
  }
  return 0;
}

// ---------- gastos variáveis ----------
// Média mensal (últimos N meses fechados) de gastos que não são fatura/transferência/investimento
// nem categoria fixa já coberta por uma recorrência.
export function variableEstimate(state, today, lookback) {
  const L = lookback || state.settings.variableLookback || 3;
  const cur = monthKey(today);
  const first = addMonths(cur, -L);
  const fixedCovered = new Set(live(state.recurring).filter(r => r.kind === 'despesa' && r.category)
    .map(r => r.category).filter(c => (catById(state, c) || {}).fixed));
  const accs = new Map(live(state.accounts).map(a => [a.id, a]));
  const perAccount = {};
  for (const t of live(state.transactions)) {
    if (t.amount >= 0) continue;
    const m = (t.installment && t.installment.purchaseDate ? t.installment.purchaseDate : t.date).slice(0, 7);
    if (m < first || m >= cur) continue;
    if (t.installment) continue; // parcelas já entram nas faturas
    if (catGroup(state, t.category) !== 'despesa') continue;
    if (fixedCovered.has(t.category)) continue;
    const a = accs.get(t.accountId); if (!a) continue;
    perAccount[a.id] = (perAccount[a.id] || 0) - t.amount;
  }
  const out = { conta: 0, cards: {} };
  for (const [id, v] of Object.entries(perAccount)) {
    const a = accs.get(id); const avg = round2(v / L);
    if (a.kind === 'credit') out.cards[id] = avg; else out.conta = round2(out.conta + avg);
  }
  if (state.settings.variableManual != null && state.settings.variableManual !== '') {
    out.conta = Number(state.settings.variableManual) || 0; out.cards = {}; out.manual = true;
  }
  return out;
}

// ---------- projeção ----------
export function projection(state, today = new Date(), monthsAhead) {
  const N = monthsAhead || state.settings.projectionMonths || 12;
  const cur = monthKey(today);
  const accounts = live(state.accounts);
  const cash = accounts.filter(a => a.kind !== 'credit' && a.includeInBalance !== false);
  const cards = accounts.filter(a => a.kind === 'credit');
  const startBalance = round2(cash.reduce((s, a) => s + accountBalance(state, a), 0));
  const variable = variableEstimate(state, today);
  const billsByCard = Object.fromEntries(cards.map(c => [c.id, cardBills(state, c, state.billsCache?.[c.id] || {})]));

  // gastos variáveis futuros no cartão viram fatura (respeitando fechamento)
  const extraCard = {}; // cardId -> month -> valor
  for (const c of cards) {
    const monthly = variable.cards[c.id] || 0; if (!monthly) continue;
    extraCard[c.id] = {};
    for (let i = 0; i <= N; i++) {
      const key = addMonths(cur, i); const dim = daysInMonth(key);
      const from = i === 0 ? today.getDate() : 0;
      for (let d = from + 1; d <= dim; d++) {
        const [y, m] = key.split('-').map(Number);
        const bm = billMonthFor(new Date(y, m - 1, d), c.closeDay, c.dueDay);
        extraCard[c.id][bm] = (extraCard[c.id][bm] || 0) + monthly / dim;
      }
    }
  }
  // recorrências pagas no cartão
  const recCard = {};
  for (const r of live(state.recurring).filter(r => r.kind === 'despesa' && r.payWith && r.payWith !== 'conta')) {
    const c = cards.find(c => c.id === r.payWith); if (!c) continue;
    for (let i = 0; i <= N; i++) {
      const key = addMonths(cur, i);
      const v = -recurringInMonth(state, r, key, today, i === 0 ? today.getDate() : 0);
      if (!v) continue;
      const [y, m] = key.split('-').map(Number);
      const day = r.mode === 'mensal' ? Math.min(r.day || 1, daysInMonth(key)) : 15;
      const bm = billMonthFor(new Date(y, m - 1, day), c.closeDay, c.dueDay);
      (recCard[c.id] ||= {})[bm] = ((recCard[c.id] ||= {})[bm] || 0) + v;
    }
  }

  const months = [];
  let bal = startBalance;
  for (let i = 0; i < N; i++) {
    const key = addMonths(cur, i);
    const fromDay = i === 0 ? today.getDate() : 0;
    const frac = (daysInMonth(key) - fromDay) / daysInMonth(key);
    const row = { month: key, start: round2(bal), incomes: [], fixed: [], bills: [], variable: 0 };
    for (const r of live(state.recurring)) {
      if (r.kind === 'despesa' && r.payWith && r.payWith !== 'conta') continue;
      const v = recurringInMonth(state, r, key, today, fromDay);
      if (!v) continue;
      (v > 0 ? row.incomes : row.fixed).push({ name: r.name, value: round2(Math.abs(v)) });
    }
    for (const c of cards) {
      const b = billsByCard[c.id][key];
      if (isBillPaid(state, c, key, today)) continue;
      const known = b ? b.total : 0;
      const proj = b ? b.projected : 0;
      const extra = round2((extraCard[c.id]?.[key] || 0) + (recCard[c.id]?.[key] || 0));
      const total = round2(known + extra);
      if (total > 0.005) row.bills.push({ cardId: c.id, name: c.name, value: total, known: round2(known - proj), installments: proj, estimated: extra });
    }
    row.variable = round2(variable.conta * frac);
    row.incomeTotal = round2(row.incomes.reduce((s, x) => s + x.value, 0));
    row.fixedTotal = round2(row.fixed.reduce((s, x) => s + x.value, 0));
    row.billsTotal = round2(row.bills.reduce((s, x) => s + x.value, 0));
    bal = round2(bal + row.incomeTotal - row.fixedTotal - row.billsTotal - row.variable);
    row.end = bal;
    months.push(row);
  }
  return { startBalance, variable, months };
}

// ---------- resumo do mês ----------
export function monthSummary(state, key) {
  const txs = live(state.transactions).filter(t => t.date.slice(0, 7) === key);
  const byCat = {};
  let income = 0, expense = 0;
  for (const t of txs) {
    const g = catGroup(state, t.category);
    if (g === 'neutra') continue;
    if (g === 'receita' && t.amount > 0) income += t.amount;
    else if (g === 'despesa') { expense += -t.amount; byCat[t.category] = (byCat[t.category] || 0) - t.amount; }
    else if (t.amount > 0) income += t.amount;
  }
  return { income: round2(income), expense: round2(expense), byCat };
}

// ---------- importação ----------
export function parseOFX(text, accountId, rules) {
  const out = [];
  const blocks = text.split(/<STMTTRN>/i).slice(1);
  const tag = (b, n) => { const m = b.match(new RegExp(`<${n}>([^<\\r\\n]*)`, 'i')); return m ? m[1].trim() : ''; };
  for (const b of blocks) {
    const dt = tag(b, 'DTPOSTED');
    const amount = parseMoney(tag(b, 'TRNAMT'));
    if (!dt || isNaN(amount)) continue;
    const date = `${dt.slice(0, 4)}-${dt.slice(4, 6)}-${dt.slice(6, 8)}`;
    const description = [tag(b, 'NAME'), tag(b, 'MEMO')].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' — ');
    const fit = tag(b, 'FITID') || `${date}_${amount}_${description}`;
    const tx = { id: `ofx_${accountId}_${hash(fit + date + amount)}`, accountId, date, description, amount: round2(amount), source: 'ofx', updatedAt: nowIso() };
    tx.category = categorize(tx, rules);
    out.push(tx);
  }
  return out;
}

export function parseCSV(text, accountId, rules) {
  const lines = text.replace(/\r/g, '').split('\n').filter(l => l.trim());
  if (!lines.length) return [];
  const sep = (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length ? ';' : ',';
  const split = l => { const r = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === sep && !q) { r.push(cur); cur = ''; } else cur += ch; } r.push(cur); return r.map(s => s.trim()); };
  let header = -1, cols = {};
  for (let i = 0; i < Math.min(lines.length, 15); i++) {
    const h = split(lines[i]).map(norm);
    const di = h.findIndex(x => /^DATA/.test(x)), vi = h.findIndex(x => /VALOR|QUANTIA|MONTANTE|AMOUNT/.test(x));
    const de = h.findIndex(x => /DESCRI|HISTORICO|LANCAMENTO|ESTABELECIMENTO|TITULO|MEMO/.test(x));
    if (di >= 0 && vi >= 0) { header = i; cols = { di, vi, de: de >= 0 ? de : h.findIndex((_, k) => k !== di && k !== vi) }; break; }
  }
  if (header < 0) { header = -1; cols = { di: 0, de: 1, vi: 2 }; }
  const out = [];
  for (const l of lines.slice(header + 1)) {
    const c = split(l);
    const date = toYmd(c[cols.di]); const amount = parseMoney(c[cols.vi]);
    if (!date || isNaN(amount)) continue;
    const description = (c[cols.de] || '').replace(/^"|"$/g, '');
    const tx = { id: `csv_${accountId}_${hash(date + amount + description)}`, accountId, date, description, amount: round2(amount), source: 'csv', updatedAt: nowIso() };
    tx.category = categorize(tx, rules);
    out.push(tx);
  }
  return out;
}
function toYmd(s) {
  s = String(s || '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/); if (m) { const y = m[3].length === 2 ? `20${m[3]}` : m[3]; return `${y}-${pad(m[2])}-${pad(m[1])}`; }
  return null;
}
export function hash(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }

// ---------- sincronização entre aparelhos (merge) ----------
// Une dois estados: para cada item por id, vence o de updatedAt mais recente.
export function mergeStates(a, b) {
  if (!a) return b; if (!b) return a;
  const out = { ...a };
  for (const k of ['accounts', 'items', 'transactions', 'rules', 'recurring', 'categories']) {
    const map = new Map();
    for (const x of [...(a[k] || []), ...(b[k] || [])]) {
      const o = map.get(x.id);
      if (!o || (x.updatedAt || '') > (o.updatedAt || '')) map.set(x.id, x);
    }
    out[k] = [...map.values()];
  }
  out.paidBills = { ...(b.paidBills || {}), ...(a.paidBills || {}) };
  out.settings = (a.settings?.updatedAt || '') >= (b.settings?.updatedAt || '') ? a.settings : b.settings;
  out.billsCache = { ...(b.billsCache || {}), ...(a.billsCache || {}) };
  out.updatedAt = nowIso();
  return out;
}
