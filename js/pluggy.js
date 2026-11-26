// Integração Open Finance via Pluggy (Meu Pluggy), através do Worker.
import { CONFIG } from './config.js';
import { fromPluggyAccount, fromPluggyTx, upsertTransactions, ymd, nowIso } from './core.js';

const workerUrl = () => (localStorage.getItem('workerUrl') || CONFIG.WORKER_URL || '').replace(/\/+$/, '');
const appKey = () => localStorage.getItem('appKey') || '';
export const pluggyConfigured = () => !!workerUrl() && !!appKey();

async function api(path, init = {}) {
  if (!pluggyConfigured()) throw new Error('Configure o endereço do Worker e a chave do app em Ajustes');
  // cache: 'no-store' — sem isso o navegador pode guardar respostas de erro (ex.: 410) e repeti-las
  const r = await fetch(`${workerUrl()}${path}`, {
    cache: 'no-store',
    ...init, headers: { 'Content-Type': 'application/json', 'X-App-Key': appKey(), ...(init.headers || {}) },
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Erro ${r.status}`);
  return data;
}

export const ping = () => api('/ping');

function loadConnect() {
  if (window.PluggyConnect) return Promise.resolve();
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.pluggy.ai/pluggy-connect/latest/pluggy-connect.js';
    s.onload = res; s.onerror = () => rej(new Error('Não foi possível carregar o Pluggy Connect'));
    document.head.appendChild(s);
  });
}

// Abre o widget da Pluggy. Para conectar via Meu Pluggy, escolha o conector "MeuPluggy".
export async function openConnect(itemId) {
  await loadConnect();
  const { accessToken } = await api('/connect-token', { method: 'POST', body: JSON.stringify(itemId ? { itemId } : {}) });
  return new Promise((resolve, reject) => {
    const w = new PluggyConnect({
      connectToken: accessToken,
      ...(itemId ? { updateItem: itemId } : {}),
      language: 'pt',
      connectorIds: [200], // 200 = MeuPluggy (único conector usado neste app)
      onSuccess: ({ item }) => resolve(item),
      onError: e => reject(new Error(e.message || 'Falha na conexão')),
      onClose: () => resolve(null),
    });
    w.init();
  });
}

export const getItem = id => api(`/items/${id}`);
export const refreshItem = id => api(`/items/${id}/refresh`, { method: 'POST' });

// Sincroniza uma conexão: contas, transações (desde a última sincronização) e faturas.
export async function syncItem(state, item, onProgress = () => {}) {
  const info = await getItem(item.id).catch(() => null);
  if (info) { item.status = info.status; item.connectorName = info.connector?.name || item.connectorName; }
  const accounts = await api(`/accounts?itemId=${encodeURIComponent(item.id)}`);
  let added = 0;
  for (const a of accounts) {
    const existing = state.accounts.find(x => x.pluggyId === a.id);
    let acc = fromPluggyAccount(a, item.id, existing);
    if (existing) acc = Object.assign(existing, acc); else state.accounts.push(acc);
    onProgress(`Baixando ${acc.name}…`);
    const from = new Date();
    if (acc.lastSync) { from.setTime(Date.parse(acc.lastSync)); from.setDate(from.getDate() - 15); }
    else from.setFullYear(from.getFullYear() - 1);
    const txs = await api(`/transactions?accountId=${a.id}&from=${ymd(from)}`);
    added += upsertTransactions(state, txs.map(t => fromPluggyTx(t, acc, state.rules)));
    if (acc.kind === 'credit') {
      const bills = await api(`/bills?accountId=${a.id}`).catch(() => []);
      state.billsCache = state.billsCache || {};
      state.billsCache[acc.id] = Object.fromEntries(bills.map(b => [b.id, { dueDate: b.dueDate, totalAmount: b.totalAmount }]));
    }
    acc.lastSync = nowIso();
  }
  item.lastSync = nowIso(); item.updatedAt = nowIso();
  return added;
}
