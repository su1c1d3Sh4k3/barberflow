# ADDENDUM AO PRD — Billing & Integração Asaas

> Este documento complementa o `PRD_BarberFlow_ClaudeCode.md`. Anexar na seção 4 (banco) e adicionar tela 3.14.

---

## 1. MODELO DE COBRANÇA

**Modelo B2B puro:** o SaaS cobra os donos das barbearias. Pagamentos clientes→barbearia NÃO passam pelo Asaas do SaaS (barbearia usa sua própria chave Pix/link configurada em Definições).

### 1.1 Planos e preços

| Plano | Ciclo | Essencial (sem IA) | IA (com IA) |
|---|---|---|---|
| **Mensal** | 1 mês | R$ 99,90 | R$ 149,90 |
| **Recorrência mensal** (assinatura automática) | 1 mês | R$ 79,90 | R$ 129,90 |
| **Semestral** | 6 meses | R$ 69,90/mês (à vista ou cartão c/ juros) | R$ 129,90/mês |
| **Anual** | 12 meses | R$ 59,90/mês (à vista ou cartão c/ juros) | R$ 119,90/mês |

**Regras:**
- Cartão de crédito SEMPRE cobra juros (parcelamento).
- Pix/Boleto: à vista no total do período (semestral/anual) OU recorrência mensal automática.
- Plano IA cobra adicional variável por tokens consumidos no mês (fechamento no ciclo de pagamento, cobrado na fatura seguinte). Tabela de preço de tokens a definir.

### 1.2 Trial
- **7 dias de acesso total liberado** após cadastro, sem cartão obrigatório.
- No dia 8, sistema trava acesso às rotas do app (middleware retorna para `/conta/planos`). Apenas telas `/login`, `/conta/planos` e `/conta/faturamento` continuam acessíveis.
- Banner de countdown visível em todas as telas durante o trial ("Seu trial termina em X dias").
- Após assinatura ativa, trial convertido em `subscriptions.status = 'active'`.

### 1.3 Fluxos de cobrança
- **Mensal avulso (99,90/149,90):** gera 1 cobrança única via `POST /v3/payments`, status vira `active` apenas após `PAYMENT_RECEIVED`.
- **Recorrência mensal (79,90/129,90):** cria `POST /v3/subscriptions` com `cycle: MONTHLY`.
- **Semestral/Anual à vista:** 1 cobrança única com valor total (ex: 6×69,90 = 419,40); ao ser paga, `current_period_end` = hoje + 6 meses.
- **Semestral/Anual parcelado no cartão:** `POST /v3/payments` com `installmentCount` + `totalValue` + juros aplicados pelo Asaas.
- **Add-on de tokens (plano IA):** ao fim de cada ciclo, gerar cobrança complementar via `POST /v3/payments` com o consumo daquele ciclo.

---

## 2. TABELAS ADICIONAIS (anexar à seção 4 do PRD)

```sql
-- Substitui a tabela subscriptions anterior
DROP TABLE IF EXISTS subscriptions;

plans (
  id text PK,  -- 'essencial_monthly', 'ia_monthly', 'essencial_recurrent', 'ia_recurrent',
               -- 'essencial_semiannual', 'ia_semiannual', 'essencial_annual', 'ia_annual'
  name text,
  tier text CHECK (tier IN ('essencial','ia')),
  billing_type text CHECK (billing_type IN ('one_time','recurrent','semiannual','annual')),
  price_monthly numeric(10,2),  -- valor mensal equivalente (79.90, 129.90...)
  total_value numeric(10,2),     -- valor cobrado à vista (ex: semestral = 6 * price_monthly)
  cycle_months int,              -- 1, 6, 12
  has_ia bool,
  active bool DEFAULT true
)

subscriptions (
  id uuid PK,
  tenant_id uuid FK UNIQUE,
  plan_id text FK,
  status text CHECK (status IN (
    'trial','active','past_due','canceled','expired','pending_payment'
  )),
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  next_charge_at timestamptz,
  asaas_customer_id text,
  asaas_subscription_id text,  -- para cycle recorrente
  payment_method text CHECK (payment_method IN ('PIX','BOLETO','CREDIT_CARD')),
  auto_renew bool DEFAULT true,
  canceled_at timestamptz,
  cancellation_reason text,
  created_at timestamptz,
  updated_at timestamptz
)

invoices (
  id uuid PK,
  tenant_id uuid FK,
  subscription_id uuid FK,
  asaas_payment_id text UNIQUE,
  type text CHECK (type IN ('subscription','tokens_addon','upgrade')),
  description text,
  value numeric(10,2),
  net_value numeric(10,2),
  status text CHECK (status IN (
    'PENDING','CONFIRMED','RECEIVED','OVERDUE','REFUNDED','DELETED','FAILED'
  )),
  billing_type text CHECK (billing_type IN ('PIX','BOLETO','CREDIT_CARD')),
  installment_count int,
  due_date date,
  paid_at timestamptz,
  invoice_url text,   -- URL do Asaas
  bank_slip_url text,
  pix_qr_code text,
  pix_copy_paste text,
  period_start date,
  period_end date,
  created_at timestamptz
)

token_usage_ledger (  -- consumo de IA por período de cobrança
  id uuid PK,
  tenant_id uuid FK,
  subscription_id uuid FK,
  period_start date,
  period_end date,
  tokens_input bigint DEFAULT 0,
  tokens_output bigint DEFAULT 0,
  estimated_cost numeric(10,2) DEFAULT 0,
  billed bool DEFAULT false,
  invoice_id uuid FK NULL,
  updated_at timestamptz
)

asaas_webhook_events (  -- idempotência
  id text PK,  -- evt_xxx do Asaas
  event text,
  payload jsonb,
  processed bool DEFAULT false,
  processed_at timestamptz,
  received_at timestamptz DEFAULT now()
)
```

**Seed inicial da tabela `plans`:**
```sql
INSERT INTO plans VALUES
('essencial_monthly','Essencial Mensal','essencial','one_time',99.90,99.90,1,false,true),
('ia_monthly','IA Mensal','ia','one_time',149.90,149.90,1,true,true),
('essencial_recurrent','Essencial Recorrente','essencial','recurrent',79.90,79.90,1,false,true),
('ia_recurrent','IA Recorrente','ia','recurrent',129.90,129.90,1,true,true),
('essencial_semiannual','Essencial Semestral','essencial','semiannual',69.90,419.40,6,false,true),
('ia_semiannual','IA Semestral','ia','semiannual',129.90,779.40,6,true,true),
('essencial_annual','Essencial Anual','essencial','annual',59.90,718.80,12,false,true),
('ia_annual','IA Anual','ia','annual',119.90,1438.80,12,true,true);
```

---

## 3. INTEGRAÇÃO ASAAS — ESTRUTURA

**Base URLs:**
- Sandbox: `https://api-sandbox.asaas.com/v3`
- Produção: `https://api.asaas.com/v3`
- Header auth: `access_token: <API_KEY>` (env var `ASAAS_API_KEY`)
- Header webhook: `asaas-access-token: <WEBHOOK_TOKEN>` (env `ASAAS_WEBHOOK_TOKEN`)

**Estrutura de código:**
```
/lib/asaas
  client.ts          // fetch wrapper com auth
  customers.ts       // createCustomer, updateCustomer
  payments.ts        // createPayment (one-time, installments)
  subscriptions.ts   // createSubscription, updateSubscription, cancelSubscription
  types.ts           // tipos TS dos payloads Asaas
/supabase/functions/asaas-webhook/index.ts
```

**Endpoints usados:**
| Função | Método | Path |
|---|---|---|
| Criar cliente | POST | `/v3/customers` |
| Criar cobrança única | POST | `/v3/payments` |
| Criar parcelado cartão | POST | `/v3/payments` (com `installmentCount`) |
| Criar assinatura recorrente | POST | `/v3/subscriptions` |
| Atualizar assinatura | POST | `/v3/subscriptions/{id}` |
| Cancelar assinatura | DELETE | `/v3/subscriptions/{id}` |
| Listar cobranças da assinatura | GET | `/v3/subscriptions/{id}/payments` |
| Tokenizar cartão | POST | `/v3/creditCard/tokenize` |

**Webhook handler (Edge Function `/asaas-webhook`):**
1. Valida header `asaas-access-token`
2. Checa idempotência em `asaas_webhook_events` (ignora se já processado)
3. Roteia por `event`:
   - `PAYMENT_CONFIRMED` / `PAYMENT_RECEIVED` → ativa subscription, estende `current_period_end`, marca invoice
   - `PAYMENT_OVERDUE` → `status = 'past_due'`, envia notificação
   - `PAYMENT_REFUNDED` → `status = 'canceled'`
   - `PAYMENT_DELETED` → `status = 'canceled'`
4. Responde **200 em menos de 3s** (retry asaas pausa após 15 falhas)
5. Retorna 200 sempre que processado (mesmo em noop)

**Middleware de gate (`middleware.ts`):**
```ts
// Pseudo:
// 1. Busca subscription do tenant
// 2. Se status in ('trial') && trial_ends_at > now() → libera
// 3. Se status in ('active') && current_period_end > now() → libera
// 4. Senão → redirect /conta/planos (exceto rotas whitelisted)
```

**Env vars:**
```
ASAAS_API_KEY=
ASAAS_WEBHOOK_TOKEN=
ASAAS_ENV=sandbox|production
ASAAS_BASE_URL=
```

---

## 4. NOVA TELA — `/conta/planos` (Assinatura)

### Prompt para Stitch

```
Design a subscription/plans screen for BarberFlow SaaS, matching the exact
design system of the previous screens (minimalist, rounded, amber #F59E0B accent,
navy #0F172A text, Inter font, cards 20px radius, same sidebar + topbar layout
in Brazilian Portuguese).

## Screen: Planos e Assinatura (/conta/planos)

### Top section — trial banner (only if in trial)
Full-width card, soft amber gradient background, rounded 20px. Left: clock icon
+ bold "Seu trial termina em 5 dias". Right: primary button "Assinar agora".
Subtitle small: "Assine antes do fim para não perder seus dados".

### Section 1 — Billing cycle toggle
Centered segmented pill control with 4 options:
[ Mensal ] [ Recorrência Mensal 🔥 ] [ Semestral -20% ] [ Anual -33% ]
Selected option has amber background + white text; discount badges on
semestral/anual. Default selection: "Recorrência Mensal".

### Section 2 — Plan cards (2 cards side by side, max-w 1100px)

**Card 1 — Essencial**
- White card, soft border, rounded 24px, padding 40px
- Small pill label top "Essencial"
- Big price: "R$ 79,90" (changes per cycle) + small "/mês"
- Below price: strikethrough "R$ 99,90" when discounted
- Subtitle: "Cobrança recorrente mensal" (changes per cycle)
- If semestral/annual: small text "Total: R$ 419,40 à vista"
- Divider
- Feature list with check icons (amber):
  ✓ Agendamento ilimitado via WhatsApp
  ✓ Fluxo por botões interativos
  ✓ Dashboard e relatórios
  ✓ Follow-up automático
  ✓ Cupons e aniversários
  ✓ Multi-unidade
  ✓ Suporte via WhatsApp
- Outline button full-width "Escolher Essencial"

**Card 2 — IA (featured)**
- Slightly larger, amber gradient border (2px), subtle glow shadow
- Floating badge top-right "Mais popular ✨"
- Pill label top "IA" with sparkle icon
- Big price: "R$ 129,90" + "/mês"
- Strikethrough: "R$ 149,90" when applicable
- Subtitle + "+ consumo de tokens"
- Info tooltip icon next to tokens: "Você paga apenas pelo que consumir"
- Divider
- Feature list (check icons):
  ✓ Tudo do plano Essencial
  ✓ IA conversacional no WhatsApp
  ✓ Tom de voz personalizável
  ✓ Base de conhecimento customizada
  ✓ Modo teste com números específicos
  ✓ Handoff humano automático
  ✓ Dashboard de consumo de tokens
- Primary amber button full-width "Escolher IA"

### Section 3 — Payment method selector (after plan selection)
Card below plans. Radio cards side by side:
- Pix (icon, "Aprovação instantânea")
- Boleto (icon, "Vence em 3 dias")
- Cartão de crédito (icon, "Parcelamento com juros")

When "Cartão" selected: installment selector with dropdown showing values
with interest (ex: "6x de R$ 75,00 com juros" / "12x de R$ 68,00 com juros").

### Section 4 — Credit card form (only if cartão selected)
Rounded card with inputs: Número do cartão (with card flag detection),
Nome no cartão, Validade MM/AA, CVV, CPF do titular. Secure badge with lock
icon "Pagamento seguro processado pelo Asaas".

### Section 5 — Order summary (sticky right sidebar on desktop, 320px)
White card rounded 20px:
- "Resumo do pedido" heading
- Plan name + cycle
- Line items: Plano base, Desconto (if any), Juros (if credit card)
- Divider
- Total big bold
- Next charge date info
- Terms checkbox "Li e aceito os Termos de Uso"
- Primary button full-width "Confirmar assinatura"
- Small text "Cancele quando quiser"

### Section 6 — Current subscription (if user already subscribed)
Replace sections 2-5 with card showing:
- Current plan name + tier badge
- Status pill (Ativo/Vencido/Cancelado)
- Next charge date
- Payment method used
- Buttons: "Mudar de plano", "Atualizar pagamento", outline "Cancelar assinatura"
- Below: invoice history table with columns (Data, Descrição, Valor, Status pill, Ação download)

### Empty/error states
- Payment failed: red soft banner with retry button
- Processing: skeleton loader with amber pulse

Keep everything airy, rounded, friendly. Mobile: stack cards vertically,
summary becomes bottom sheet.
```

### Funções da tela
- Busca planos de `plans` e subscription atual via RPC
- Ao confirmar: chama Edge Function `create-subscription` que cria customer + payment/subscription no Asaas
- Mostra QR Pix / boleto / card form conforme método
- Polling a cada 5s no status do payment até confirmação (ou webhook atualiza via Realtime)
- Redirect para `/dashboard` após confirmação
- Botão cancelar abre modal de confirmação com motivo (grava em `cancellation_reason`)

---

## 5. AJUSTE NO MIDDLEWARE E ONBOARDING

- **Onboarding:** adicionar passo 5 "Escolher plano" (pula se preferir começar trial — libera 7 dias).
- **Middleware:** verifica subscription em todas as rotas do grupo `/(app)`. Rotas whitelisted: `/conta/planos`, `/conta/faturamento`, `/logout`.
- **Cron diário (Edge Function scheduled):** marca `status='expired'` onde `current_period_end < now() AND auto_renew=false`.
- **Cron mensal:** calcula token_usage_ledger do período e gera invoice de add-on para planos IA.

---

## 6. CRITÉRIOS DE ACEITE (billing)

- ✅ Trial de 7 dias funciona sem cartão
- ✅ Middleware bloqueia acesso após trial expirado
- ✅ Webhook idempotente (mesmo evento 2x não duplica)
- ✅ Webhook responde <3s sempre
- ✅ Juros do cartão refletem valor real Asaas
- ✅ Upgrade Essencial→IA prorratado
- ✅ Cancelamento mantém acesso até `current_period_end`
- ✅ Histórico de invoices baixável
- ✅ Teste e2e: signup → trial → assinar Pix → webhook → acesso liberado
