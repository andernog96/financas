# Finanças da Família

App web (PWA, instala no celular) para controlar conta corrente, faturas de cartão e despesas da família, com:

- **Open Finance** via **Meu Pluggy** (gratuito, até 5 conexões por titular): saldos, extrato, cartões, faturas e parcelas.
- **Categorização automática**: usa a categoria da Pluggy e palavras da descrição. Quando você corrige uma categoria, o app oferece criar uma regra ("POSTO AVENIDA → Transporte") e aplica aos lançamentos parecidos.
- **Faturas**: fatura aberta, próximas faturas e **parcelas futuras** já comprometidas em cada cartão.
- **Projeção de saldo** de 6 a 24 meses: salário mensal, **renda semanal variável pela média real** das últimas semanas, contas fixas, faturas (lançadas + parcelas + estimativa de novas compras) e gastos do dia a dia (média dos últimos meses).
- **Dados no Google Drive**, num arquivo JSON compartilhado entre vocês dois. Funciona offline e sincroniza quando volta a conexão.
- Importação de **OFX/CSV** para bancos que você não quiser (ou não conseguir) conectar.

```
web/      → o app (vai para o GitHub Pages)
worker/   → proxy da Pluggy (vai para a Cloudflare, grátis)
test/     → testes da lógica (node test/core.test.mjs)
```

Para ver o app antes de configurar qualquer coisa: abra `web/index.html` por um servidor local (`cd web && python -m http.server`) e clique em **Ver com dados de exemplo**.

---

## Por que tem um "Worker"?

A Pluggy exige `CLIENT_ID` e `CLIENT_SECRET`. Se essas chaves ficassem no site do GitHub Pages, qualquer pessoa poderia lê-las. O Worker da Cloudflare guarda as chaves e só responde a quem envia a **chave do app** (`APP_KEY`), que você digita uma vez em cada aparelho.

---

## Configuração passo a passo (≈ 40 min, uma vez só)

### 1. Meu Pluggy — conectar os bancos

1. Crie a conta em **https://meu.pluggy.ai** (você e sua esposa, cada um com o próprio CPF).
2. Clique para conectar, escolha o banco e autorize pelo app do banco (Open Finance). Repita para cada banco/cartão (até 5 conexões por pessoa).

### 2. Pluggy Developers — gerar as chaves

1. Crie a conta em **https://dashboard.pluggy.ai**. O período de teste dura 15 dias, mas a leitura dos dados do Meu Pluggy continua funcionando depois.
2. Na sua aplicação, em **Customizar / Conectores**, habilite o conector **MeuPluggy**.
3. Crie uma **Development Application** e anote o `client_id` e o `client_secret`.

### 3. Cloudflare Worker (gratuito)

1. Crie a conta em https://dash.cloudflare.com → **Workers & Pages → Create → Worker**.
2. Cole o conteúdo de `worker/worker.js` e clique em **Deploy**.
3. Em **Settings → Variables and Secrets**, adicione:

| Nome | Tipo | Valor |
|---|---|---|
| `PLUGGY_CLIENT_ID` | Secret | client_id da Pluggy |
| `PLUGGY_CLIENT_SECRET` | Secret | client_secret da Pluggy |
| `APP_KEY` | Secret | uma senha longa inventada por você (ex.: 30 caracteres aleatórios) |
| `ALLOWED_ORIGIN` | Text | `https://SEU-USUARIO.github.io` |

4. Anote o endereço do Worker, algo como `https://financas-familia-api.SEU-USUARIO.workers.dev`.

> Se preferir a linha de comando: `cd worker && npx wrangler deploy`, e depois `npx wrangler secret put PLUGGY_CLIENT_ID` (repita para cada segredo).

### 4. Google Cloud — login para salvar no Drive

1. Acesse https://console.cloud.google.com, crie um projeto (ex.: "Financas Familia").
2. **APIs e serviços → Biblioteca** → ative a **Google Drive API**.
3. **Tela de consentimento OAuth** → tipo **Externo**, status **Em teste** → em **Usuários de teste**, adicione o seu e-mail e o da sua esposa.
4. **Credenciais → Criar credenciais → ID do cliente OAuth → Aplicativo da Web**.
   - Origens JavaScript autorizadas: `https://SEU-USUARIO.github.io` (e `http://localhost:8000` se quiser testar localmente).
5. Copie o **ID do cliente** (termina em `.apps.googleusercontent.com`).

> O app pede o escopo de acesso ao Drive para conseguir abrir o arquivo que um compartilha com o outro. Como o projeto fica "Em teste" e só vocês dois são usuários, o Google não exige verificação. O Google vai mostrar um aviso de "app não verificado"; é só clicar em **Continuar**.

### 5. Publicar no GitHub Pages

1. Edite `web/js/config.js`:
   ```js
   GOOGLE_CLIENT_ID: 'xxxx.apps.googleusercontent.com',
   WORKER_URL: 'https://financas-familia-api.SEU-USUARIO.workers.dev',
   ```
2. Crie um repositório (pode ser **privado** se você tiver o GitHub Pro; em conta gratuita o Pages exige repositório público. Isso não é problema, porque **nenhum dado nem segredo fica no código**).
3. Envie o conteúdo da pasta `web/` para a raiz do repositório.
4. Em **Settings → Pages**, escolha a branch `main` / pasta `/ (root)`.
5. Acesse `https://SEU-USUARIO.github.io/NOME-DO-REPO/`.

### 6. Primeiro uso

1. **Ajustes → Entrar com Google** → **Criar arquivo novo no meu Drive**.
2. No Google Drive, compartilhe o arquivo `financas-familia.json` com sua esposa como **Editor**.
3. **Ajustes → Open Finance**: cole o endereço do Worker e a `APP_KEY` → **Testar conexão**.
4. **Conectar banco / cartão** → escolha **MeuPluggy** → autorize. Repita uma vez por banco conectado no Meu Pluggy. A primeira sincronização baixa os últimos 12 meses.
5. Em **Contas e cartões**, confira os dias de **fechamento/vencimento** dos cartões e desmarque "entra no saldo" para contas que não devem compor o caixa (ex.: poupança de reserva).
6. **Planejar**:
   - *Entrada → Todo mês*: seu salário (dia do crédito).
   - *Entrada → Semanal variável (média real)*: renda da sua esposa, categoria **Renda freelancer**. Para a média funcionar, os PIX que ela recebe precisam estar nessa categoria; corrija um e aceite **Criar regra**.
   - *Contas fixas*: aluguel/financiamento, escola, luz, água, internet, plano de saúde… Se a conta é paga no cartão, escolha o cartão em "Pago com".
7. No celular: abra o endereço no Chrome/Safari → **Adicionar à tela inicial**.

No aparelho da sua esposa: ela abre o mesmo endereço, entra com a conta Google dela (o app encontra o arquivo compartilhado) e digita a mesma `APP_KEY`.

---

## Rotina sugerida (5 min por semana)

1. Abrir o app → **Ajustes → Sincronizar tudo** (o Meu Pluggy atualiza os bancos 1×/dia).
2. **Início → Revisar** lançamentos sem categoria. Cada correção vira regra, e com o tempo quase nada precisa de ajuste.
3. Olhar a **Projeção**: os meses em vermelho estão abaixo do saldo mínimo definido.

## Como a projeção é calculada

| Linha | Origem |
|---|---|
| Saldo inicial | soma das contas marcadas "entra no saldo" |
| Entradas | recorrências de receita; a "semanal variável" usa a média das últimas N semanas da categoria × dias do mês ÷ 7 |
| Contas fixas | recorrências de despesa pagas na conta |
| Faturas | compras já lançadas + parcelas futuras + recorrências no cartão + média de compras novas no cartão (respeitando a data de fechamento) |
| Dia a dia | média mensal (últimos 1–6 meses) dos gastos na conta, sem faturas, transferências, investimentos e as categorias fixas já cadastradas como recorrência. Pode ser substituída por um valor manual |

No mês corrente só entra o que ainda **falta acontecer** (ex.: salário do dia 5 já recebido não é somado de novo). A fatura do mês é considerada paga depois do vencimento; dá para marcar manualmente em **Cartões**.

## Limitações conhecidas

- **Meu Pluggy** é gratuito e sem SLA. Se uma conexão cair, use **Reconectar** em Ajustes ou renove o consentimento no meu.pluggy.ai (o consentimento do Open Finance vence em até 12 meses).
- Algumas instituições informam parcelas de forma diferente. Se uma parcela futura aparecer duplicada ou faltando, ajuste em **Lançamentos** ou marque a fatura.
- O token do Google dura 1 hora; quando expira, o app pede para **Entrar no Drive** de novo (um clique).
- Entradas que não estão cadastradas em Planejar não entram na projeção. É de propósito, para a previsão ser conservadora.

## Desenvolvimento

```bash
node test/core.test.mjs          # testes da lógica (faturas, parcelas, projeção, importação)
cd web && python -m http.server  # servir localmente em http://localhost:8000
```
