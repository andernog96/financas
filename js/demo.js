// Dados de exemplo para o "modo demonstração" e para testes.
import { emptyState, ymd, categorize, nowIso, round2 } from './core.js';

export function demoState(today = new Date()) {
  const s = emptyState();
  const t0 = nowIso();
  s.accounts = [
    { id: 'acc_cc', name: 'Conta corrente •1234', kind: 'checking', source: 'manual', initialBalance: 3200, includeInBalance: true, updatedAt: t0 },
    { id: 'acc_card1', name: 'Cartão Nubank', kind: 'credit', source: 'manual', closeDay: 3, dueDay: 10, creditLimit: 8000, includeInBalance: false, updatedAt: t0 },
    { id: 'acc_card2', name: 'Cartão Itaú', kind: 'credit', source: 'manual', closeDay: 20, dueDay: 28, creditLimit: 5000, includeInBalance: false, updatedAt: t0 },
  ];
  s.recurring = [
    { id: 'r1', name: 'Salário', kind: 'receita', mode: 'mensal', day: 5, amount: 9500, category: 'Salário', updatedAt: t0 },
    { id: 'r2', name: 'Renda da esposa (média semanal)', kind: 'receita', mode: 'media-semanal', avgWeeks: 8, amount: 900, category: 'Renda freelancer', updatedAt: t0 },
    { id: 'r3', name: 'Aluguel', kind: 'despesa', mode: 'mensal', day: 10, amount: 2300, category: 'Moradia', payWith: 'conta', updatedAt: t0 },
    { id: 'r4', name: 'Escola', kind: 'despesa', mode: 'mensal', day: 8, amount: 950, category: 'Educação', payWith: 'conta', updatedAt: t0 },
    { id: 'r5', name: 'Luz, água, internet', kind: 'despesa', mode: 'mensal', day: 15, amount: 520, category: 'Contas da casa', payWith: 'conta', updatedAt: t0 },
    { id: 'r6', name: 'Streaming', kind: 'despesa', mode: 'mensal', day: 12, amount: 89.9, category: 'Assinaturas', payWith: 'acc_card1', updatedAt: t0 },
  ];
  const tx = [];
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const add = (accountId, date, description, amount, extra = {}) => {
    const t = { id: `demo_${tx.length}`, accountId, date: ymd(date), description, amount: round2(amount), source: 'manual', updatedAt: t0, ...extra };
    t.category = categorize(t, s.rules); tx.push(t);
  };
  const merchants = [
    ['SUPERMERCADO CIDADE CANCAO', 180, 'acc_card1'], ['IFOOD *RESTAURANTE', 65, 'acc_card1'], ['POSTO IPIRANGA', 220, 'acc_card2'],
    ['UBER *TRIP', 28, 'acc_card1'], ['DROGARIA SAO PAULO', 75, 'acc_card2'], ['PADARIA PAO QUENTE', 22, 'acc_cc'],
    ['ATACADAO', 420, 'acc_cc'], ['RENNER LOJA', 190, 'acc_card2'], ['CINEMA CINEFLIX', 80, 'acc_card1'],
  ];
  for (let back = 120; back >= 1; back--) {
    const d = new Date(today); d.setDate(d.getDate() - back);
    for (let k = 0; k < 3; k++) if (rnd() < 0.6) { const [n, v, a] = merchants[Math.floor(rnd() * merchants.length)]; add(a, d, n, -(v * (0.6 + rnd() * 0.8))); }
    if (d.getDay() === 5) add('acc_cc', d, 'PIX RECEBIDO CLIENTE FREELA', 600 + rnd() * 700, { category: 'Renda freelancer', categoryLocked: true });
    if (d.getDate() === 5) add('acc_cc', d, 'SALARIO CONSTRUTORA', 9500, { category: 'Salário', categoryLocked: true });
    if (d.getDate() === 10) add('acc_cc', d, 'ALUGUEL APTO', -2300);
    if (d.getDate() === 8) add('acc_cc', d, 'ESCOLA MENSALIDADE', -950);
    if (d.getDate() === 15) add('acc_cc', d, 'COPEL ENERGIA', -320);
    if (d.getDate() === 3) add('acc_cc', d, 'PAGAMENTO FATURA NUBANK', -2400, { category: 'Pagamento de fatura', categoryLocked: true });
    if (d.getDate() === 27) add('acc_cc', d, 'PAGAMENTO FATURA ITAU', -1500, { category: 'Pagamento de fatura', categoryLocked: true });
    if (d.getDate() === 20) add('acc_cc', d, 'PIX ENVIADO DIARISTA', -600, { category: 'Casa e manutenção', categoryLocked: true });
  }
  // compras parceladas
  const p1 = new Date(today); p1.setMonth(p1.getMonth() - 2); p1.setDate(14);
  for (let n = 1; n <= 3; n++) add('acc_card1', p1, `MAGAZINE LUIZA GELADEIRA ${n}/10`, -389.9, { installment: { n, total: 10, totalAmount: 3899, purchaseDate: ymd(p1) } });
  const p2 = new Date(today); p2.setMonth(p2.getMonth() - 1); p2.setDate(25);
  for (let n = 1; n <= 2; n++) add('acc_card2', p2, `LEROY MERLIN ${n}/6`, -250, { installment: { n, total: 6, totalAmount: 1500, purchaseDate: ymd(p2) } });
  s.transactions = tx;
  // saldo atual da conta ≈ R$ 2.400
  const ccSum = tx.filter(t => t.accountId === 'acc_cc').reduce((a, t) => a + t.amount, 0);
  s.accounts[0].initialBalance = round2(2400 - ccSum);
  s.demo = true;
  return s;
}
