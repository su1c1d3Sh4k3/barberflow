# PRD — BarberFlow SaaS

> Documento técnico para desenvolvimento via Claude Code.
> **Stack:** Next.js 14 (App Router) + TypeScript + Tailwind + shadcn/ui + Supabase (Auth, Postgres, Edge Functions, Realtime, Storage) + uazapi (WhatsApp) + n8n (IA) + Asaas (pagamentos BR).

---

## 1. VISÃO GERAL

SaaS web para barbearias gerenciarem agendamentos, clientes, profissionais e comunicação 100% via WhatsApp. Cliente final NUNCA acessa o painel — toda interação acontece no zap via uazapi.

**Dois planos:**
- **Essencial:** fluxo determinístico por botões (menu interativo do WhatsApp), roteado por Edge Functions.
- **IA:** conversação natural via n8n + LLM, com handoff humano.

**Multi-tenant:** cada barbearia = 1 tenant isolado via RLS do Supabase.

---

## 2. DESIGN SYSTEM (resumo)

- **Estilo:** minimalista, arredondado, clean, intuitivo. Inspiração: Linear + Notion + Trinks.
- **Paleta:** navy `#0F172A` (texto/sidebar), amber `#F59E0B` (accent), off-white `#FAFAF9` (bg), white `#FFFFFF` (cards), muted `#64748B`, borders `#E2E8F0`. Semânticas: success `#10B981`, warning `#F59E0B`, error `#EF4444`.
- **Radius:** cards 20px, buttons 14px, inputs 12px, pills 9999px.
- **Tipografia:** Inter, headings 600-700, body 400-500, line-height 1.6.
- **Ícones:** Lucide 20px stroke 1.5.
- **Layout base:** sidebar 240px (collapsible 72px) + topbar 64px + main max-w-[1440px].
- **Idioma:** pt-BR.

---

## 3. TELAS — DETALHAMENTO E FUNÇÕES

### 3.1 Login (`/login`)
**Layout:** split 60/40. Esquerda: form centralizado max 400px com logo, h1 "Bem-vindo de volta 👋", inputs email/senha (com toggle eye), link "Esqueci minha senha", botão primário "Entrar" full-width, divider "ou", botão Google outline. Direita: gradiente amber com ilustração de cadeira de barbeiro e card flutuante de depoimento.

**Funções:**
- Autenticação via **Supabase Auth** (email/senha + OAuth Google).
- Proteção anti-bot com Cloudflare Turnstile.
- Rate limiting: 5 tentativas/15min por IP.
- Redirect para `/dashboard` no sucesso; `/onboarding` se primeira vez.
- Validação client-side com Zod + react-hook-form.

---

### 3.2 Cadastro (`/signup`)
**Layout:** mesmo split. Form com: Nome completo, Nome da barbearia, Telefone (máscara BR), Email, CNPJ (opcional, tooltip "Opcional para MEI"), Senha (com strength meter), Confirmar senha. Checkbox LGPD. Botão "Criar minha conta grátis". "14 dias grátis, sem cartão".

**Funções:**
- Validação CNPJ (algoritmo + opcional ReceitaWS).
- Verificação de telefone via OTP WhatsApp (uazapi) — opcional no MVP.
- Cria registros em cascata: `users` → `tenants` → `subscriptions` (trial 14d) → `companies` (unidade default).
- Envia email de boas-vindas (Supabase Auth email templates).
- Redirect para `/onboarding`.

---

### 3.3 Onboarding (`/onboarding`) — **NOVO**
**Layout:** wizard 4 passos com progress bar amber. Cada passo é card centralizado max-w-[640px].

**Passos:**
1. Dados da empresa (endereço, horário de funcionamento)
2. Primeiro profissional
3. Primeiros serviços (com categoria)
4. Conectar WhatsApp (QR code)

**Funções:** marca `onboarding_completed=true` no final; redireciona para dashboard.

---

### 3.4 Dashboard (`/dashboard`)
**Layout:** greeting + date. Filtro período (pill segmented: Hoje / 7d / 30d / Personalizado).
- **Row 1:** 4 KPI cards (Contatos, Agendamentos, Conversão, Faturamento previsto) com ícone, valor, trend %.
- **Row 2:** 5 pill cards de status (Confirmados, Concluídos, Cancelados, Reagendados, Follow-up).
- **Row 3:** bar chart "Agendamentos por dia da semana" (60%) + card status WhatsApp (40%).
- **Row 4:** "Faturamento por profissional" (horizontal bars) + "Próximos agendamentos" (lista 5 itens).

**Funções:**
- Queries agregadas via Supabase RPC (views materializadas para performance).
- Filtros de período afetam todos os cards simultaneamente (state global via Zustand ou URL params).
- Real-time: Supabase Realtime para atualizar status WhatsApp e próximos agendamentos.
- Exportar CSV/PDF dos relatórios.

---

### 3.5 Agenda (`/agenda`) — **CORE**
**Layout:** topbar com date navigator (< Hoje >), view toggle (Dia/Semana/Mês/Lista), filtros (profissional, serviço), botão "+ Novo agendamento".

**Day view (padrão):**
- Grid com **profissionais em COLUNAS** (estilo Trinks).
- Coluna esquerda sticky: slots de 30min (configurável) 08:00-20:00.
- Header sticky por profissional: avatar + nome + indicador de disponibilidade.
- Cards de agendamento com radius 12px, background pastel por categoria, borda esquerda 4px colorida por status.
- Slots vazios: dashed hover amber com "+".
- Intervalos: diagonal striped "Intervalo".
- Linha horizontal amber do horário atual.

**Drawer direito (320px):** ao clicar em card — foto cliente, serviço, horário, valor, status dropdown, notas, botões Confirmar/Reagendar/Cancelar/Concluir/Enviar mensagem WhatsApp.

**Funções:**
- Drag-and-drop para reagendar (dnd-kit).
- Criar agendamento: modal com autocomplete de contato (ou criar novo), serviços (multi-select), profissional, data/hora, valor auto-calculado.
- Bloqueio de slots (folgas, feriados).
- Lista de espera quando slot ocupado.
- Conflito detection (profissional já tem agendamento).
- Sincronização real-time entre dispositivos.

---

### 3.6 Contatos (`/contatos`)
**Layout:** search bar grande, filtros pills (Todos/Respondidos/Pendentes/Follow-up/Agendados/Bloqueados), botão "+ Novo contato". Tabela: checkbox, avatar+nome, telefone, status pill, último agendamento, última mensagem, switch IA on/off, menu ações.

**Drawer lateral ao clicar:** avatar, dados editáveis, aniversário, tags, histórico de conversas, histórico de agendamentos (timeline), LTV, notas.

**Funções:**
- Busca full-text (Postgres `tsvector`).
- Paginação infinita.
- Importação CSV.
- Merge de duplicados.
- Bulk actions (bloquear, adicionar tag, enviar mensagem).
- Switch IA: atualiza `contacts.ia_enabled` — quando off, webhook uazapi ignora mensagens desse contato.

---

### 3.7 Empresa (`/empresa`)
**Layout:** tabs (Dados gerais / Unidades / Horários / Marca). Seletor de unidade no topo se multi-unit.

**Funções:**
- CRUD de unidades (`companies`).
- Horário de funcionamento por dia da semana com múltiplos intervalos.
- Feriados (calendário nacional automático + customizados).
- Upload de logo e galeria (Supabase Storage bucket `company-assets`).
- Geocoding do endereço (Google Maps API).

---

### 3.8 Profissionais (`/profissionais`)
**Layout:** grid de cards 3-4 por linha. Card: avatar 96px, nome, rating, badge serviços, comissão %, botão "Ver detalhes". "+ Adicionar" como card dashed.

**Modal criar/editar:** avatar upload, nome, telefone, email, bio, serviços (multi-select chips), comissão (slider %), dias trabalhados (7 toggle pills Dom-Sáb), horário trabalho, intervalo, meta mensal.

**Funções:**
- CRUD profissionais.
- Relação N:N com services via `professional_services`.
- Escala de trabalho via `professional_schedules`.
- Convite para profissional ter login próprio (role `professional`, vê apenas própria agenda).

---

### 3.9 Serviços (`/servicos`)
**Layout:** two-panel. Esquerda (30%): lista de categorias, seleção com borda amber. Direita (70%): cards dos serviços da categoria.

**Funções:**
- CRUD categorias e serviços.
- Toggle promoção com % desconto (campos `promo_active`, `promo_discount`).
- Suporte futuro a combos (serviços compostos).

---

### 3.10 Definições (`/definicoes`)
**Tabs verticais:** Follow-up | Aniversário | Cupons | Boas-vindas | Pagamento.

**Follow-up:** até 3 cards com toggle, delay, textarea com variable picker (`$nome`, `$primeiro_nome`, `$barbearia`), preview bubble WhatsApp.

**Aniversário:** toggle, textarea com `$cupom`, horário de envio, preview.

**Cupons:** tabela + modal criar (nome base, duração, %). Auto-formato: `{NOME}_{últimos 4 do telefone}`.

**Boas-vindas:** textarea + preview.

**Pagamento:** Pix key, payment link, QR preview.

**Funções:**
- Cron job (Supabase scheduled Edge Function) para disparar follow-ups e aniversários.
- Renderização de variáveis antes do envio via uazapi.
- Validação de cupom na hora do agendamento.

---

### 3.11 Definições da IA (`/definicoes/ia`) — **plano IA only**
**Layout:** badge "Plano IA ✨". Rows:
1. Mini dashboard (tokens consumidos, custo estimado, último pagamento).
2. Master toggle IA.
3. Config: tom (4 pills), observações, base de conhecimento (upload).
4. Modo teste: toggle + chips de números.
5. Handoff: toggle + keywords.

**Funções:**
- Gate por plano (middleware verifica `subscription.plan = 'ia'`).
- Sincronização com n8n via webhook de config.
- Tokens consumidos vêm do n8n via webhook periódico → tabela `ia_usage`.
- Limite mensal com corte automático se exceder.

---

### 3.12 Conexão WhatsApp (`/whatsapp`)
**Layout:** card central. Desconectado: QR 256x256, passos numerados, botão "Atualizar QR". Conectado: dot verde pulsante, número, device, botão "Desconectar", logs table.

**Funções:**
- Integração uazapi: `POST /instance/init`, `GET /instance/status`.
- Polling de status a cada 5s quando aguardando QR.
- Webhook uazapi → Edge Function `/webhooks/whatsapp` para processar mensagens.
- Tabela `whatsapp_sessions` + `whatsapp_logs`.

---

### 3.13 Minha Conta / Faturamento (`/conta`) — **NOVO**
**Layout:** tabs (Perfil / Plano / Faturamento / Equipe).

**Funções:** editar dados do usuário, trocar plano, histórico de pagamentos, convidar membros da equipe, cancelar assinatura.

---

## 4. MODELAGEM DO BANCO DE DADOS (Supabase/Postgres)

Todas as tabelas tenant-scoped têm `tenant_id` + RLS habilitado.

```sql
-- ============ CORE ============
tenants (
  id uuid PK,
  name text,
  cnpj text,
  plan text CHECK (plan IN ('trial','essencial','ia')),
  trial_ends_at timestamptz,
  created_at timestamptz
)

users (
  id uuid PK REFERENCES auth.users,
  tenant_id uuid FK,
  name text,
  email text UNIQUE,
  phone text,
  role text CHECK (role IN ('owner','admin','professional','receptionist')),
  onboarding_completed bool DEFAULT false,
  created_at timestamptz
)

subscriptions (
  id uuid PK,
  tenant_id uuid FK,
  plan text,
  status text CHECK (status IN ('trial','active','past_due','canceled')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  asaas_subscription_id text
)

-- ============ EMPRESA ============
companies (
  id uuid PK,
  tenant_id uuid FK,
  name text,
  description text,
  phone text,
  email text,
  address jsonb,  -- {cep, rua, numero, bairro, cidade, estado, lat, lng}
  logo_url text,
  is_default bool,
  created_at timestamptz
)

business_hours (
  id uuid PK,
  company_id uuid FK,
  weekday int CHECK (weekday BETWEEN 0 AND 6),
  open_time time,
  close_time time,
  break_start time,
  break_end time,
  closed bool DEFAULT false
)

holidays (
  id uuid PK,
  company_id uuid FK,
  date date,
  name text
)

-- ============ PROFISSIONAIS & SERVIÇOS ============
professionals (
  id uuid PK,
  tenant_id uuid FK,
  company_id uuid FK,
  user_id uuid FK NULL,  -- se tiver login
  name text,
  phone text,
  email text,
  bio text,
  avatar_url text,
  commission_pct numeric(5,2),
  monthly_goal numeric(10,2),
  active bool DEFAULT true
)

professional_schedules (
  id uuid PK,
  professional_id uuid FK,
  weekday int,
  start_time time,
  end_time time,
  break_start time,
  break_end time
)

professional_blocks (  -- folgas, férias
  id uuid PK,
  professional_id uuid FK,
  start_at timestamptz,
  end_at timestamptz,
  reason text
)

service_categories (
  id uuid PK,
  tenant_id uuid FK,
  name text,
  description text,
  color text
)

services (
  id uuid PK,
  tenant_id uuid FK,
  category_id uuid FK,
  name text,
  description text,
  duration_min int,
  price numeric(10,2),
  promo_active bool DEFAULT false,
  promo_discount_pct numeric(5,2),
  active bool DEFAULT true
)

professional_services (  -- N:N
  professional_id uuid FK,
  service_id uuid FK,
  PRIMARY KEY (professional_id, service_id)
)

-- ============ CLIENTES & AGENDAMENTOS ============
contacts (
  id uuid PK,
  tenant_id uuid FK,
  name text,
  phone text,  -- E.164
  avatar_url text,
  birthday date,
  status text CHECK (status IN ('respondido','pendente','follow_up','agendado','bloqueado')),
  ia_enabled bool DEFAULT true,
  tags text[],
  notes text,
  last_message_at timestamptz,
  last_appointment_at timestamptz,
  ltv numeric(10,2) DEFAULT 0,
  source text,
  created_at timestamptz,
  UNIQUE(tenant_id, phone)
)

appointments (
  id uuid PK,
  tenant_id uuid FK,
  company_id uuid FK,
  contact_id uuid FK,
  professional_id uuid FK,
  start_at timestamptz,
  end_at timestamptz,
  status text CHECK (status IN ('pendente','confirmado','concluido','cancelado','reagendado','no_show')),
  total_price numeric(10,2),
  notes text,
  coupon_id uuid FK NULL,
  created_via text CHECK (created_via IN ('whatsapp','painel','ia')),
  created_at timestamptz
)

appointment_services (  -- N:N (agendamento pode ter múltiplos serviços)
  appointment_id uuid FK,
  service_id uuid FK,
  price_at_time numeric(10,2),
  PRIMARY KEY (appointment_id, service_id)
)

waitlist (
  id uuid PK,
  tenant_id uuid FK,
  contact_id uuid FK,
  service_id uuid FK,
  professional_id uuid FK NULL,
  desired_date date,
  notified bool DEFAULT false
)

-- ============ COMUNICAÇÃO ============
whatsapp_sessions (
  id uuid PK,
  tenant_id uuid FK,
  instance_id text,  -- uazapi
  phone_number text,
  status text CHECK (status IN ('connected','disconnected','qr_pending')),
  last_seen_at timestamptz
)

messages (
  id uuid PK,
  tenant_id uuid FK,
  contact_id uuid FK,
  direction text CHECK (direction IN ('in','out')),
  content text,
  media_url text,
  media_type text,
  sent_by text CHECK (sent_by IN ('system','ia','human')),
  status text,
  created_at timestamptz
)

-- ============ CONFIGURAÇÕES ============
settings (
  tenant_id uuid PK FK,
  welcome_message text,
  birthday_message text,
  birthday_send_time time,
  birthday_enabled bool DEFAULT false,
  pix_key text,
  payment_link text
)

followups (
  id uuid PK,
  tenant_id uuid FK,
  order_num int CHECK (order_num BETWEEN 1 AND 3),
  delay_hours int,
  message text,
  enabled bool DEFAULT true
)

coupons (
  id uuid PK,
  tenant_id uuid FK,
  base_name text,
  discount_pct numeric(5,2),
  duration_days int,
  created_at timestamptz
)

coupon_instances (  -- gerado por cliente: NOME_1025
  id uuid PK,
  coupon_id uuid FK,
  contact_id uuid FK,
  code text UNIQUE,
  used bool DEFAULT false,
  used_at timestamptz,
  expires_at timestamptz
)

-- ============ IA ============
ia_settings (
  tenant_id uuid PK FK,
  enabled bool DEFAULT false,
  tone text CHECK (tone IN ('formal','humorado','educado','simpatico')),
  instructions text,
  knowledge_base_url text,
  test_mode bool DEFAULT false,
  test_numbers text[],
  handoff_keywords text[]
)

ia_usage (
  id uuid PK,
  tenant_id uuid FK,
  period_start date,
  tokens_input int,
  tokens_output int,
  cost_brl numeric(10,2),
  updated_at timestamptz
)

-- ============ AUDITORIA ============
audit_logs (
  id uuid PK,
  tenant_id uuid FK,
  user_id uuid FK,
  action text,
  entity text,
  entity_id uuid,
  metadata jsonb,
  created_at timestamptz
)
```

**Índices essenciais:**
```sql
CREATE INDEX idx_appointments_tenant_date ON appointments(tenant_id, start_at);
CREATE INDEX idx_appointments_professional_date ON appointments(professional_id, start_at);
CREATE INDEX idx_contacts_tenant_phone ON contacts(tenant_id, phone);
CREATE INDEX idx_messages_contact_created ON messages(contact_id, created_at DESC);
```

**RLS (exemplo):**
```sql
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON appointments
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid);
```

---

## 5. ESTRUTURA DE PASTAS

```
/app
  /(auth)/login, signup
  /(app)/dashboard, agenda, contatos, empresa, profissionais, servicos, definicoes, whatsapp, conta
  /api/webhooks/whatsapp
  /api/webhooks/n8n
/components/ui (shadcn)
/components/features/{agenda,contacts,...}
/lib/supabase (client, server, middleware)
/lib/uazapi
/lib/validations (zod schemas)
/hooks
/types
/supabase/migrations
/supabase/functions (edge functions)
```

---

## 6. ORDEM DE IMPLEMENTAÇÃO SUGERIDA

1. Setup Next.js + Supabase + Tailwind + shadcn + design tokens
2. Auth (login/cadastro) + middleware + RLS
3. Onboarding + Empresa + Profissionais + Serviços
4. Agenda (CORE — maior esforço)
5. Contatos
6. Integração uazapi + tela WhatsApp + webhook de mensagens
7. Dashboard
8. Definições (follow-up, cupons, aniversário)
9. Plano IA + n8n
10. Faturamento (Asaas) + minha conta

---

## 7. CRITÉRIOS DE ACEITE POR FEATURE

- ✅ Todas as rotas autenticadas protegidas por middleware
- ✅ RLS testado em todas as tabelas tenant-scoped
- ✅ Formulários validados com Zod
- ✅ Estados loading/empty/error em todas as telas
- ✅ Responsivo mobile-first
- ✅ Acessibilidade AA (labels, contraste, keyboard nav)
- ✅ Testes E2E nas rotas críticas (login, criar agendamento)
- ✅ LGPD: checkbox consentimento + opt-out de disparos
