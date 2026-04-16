# PRD — Bot WhatsApp + Página Pública de Agendamento

> Complemento ao PRD principal. Cobre fluxo conversacional via uazapi e widget público.

---

## 1. SETUP AUTOMÁTICO DO WEBHOOK

Quando uma instância WhatsApp é conectada com sucesso (status `connected` retornado pela uazapi), a Edge Function `whatsapp-connect` deve **automaticamente**:

1. Chamar `POST /webhook` da uazapi com payload:
   ```json
   {
     "url": "https://<project>.supabase.co/functions/v1/whatsapp-webhook",
     "events": ["messages","messages_update","connection","qrcode"],
     "addUrlEvents": true,
     "addUrlTypesMessages": true,
     "excludeMessages": ["fromMe"]
   }
   ```
2. Salvar o `instance_id` e `phone_number` em `whatsapp_sessions`
3. Definir `webhook_configured_at = now()`
4. Disparar mensagem de teste interna para validar
5. Em caso de falha, marcar `webhook_status='failed'` e exibir alerta no painel

A Edge Function `whatsapp-webhook` valida assinatura HMAC, faz upsert de mensagem em `messages`, e roteia para o **state machine** do bot.

---

## 2. STATE MACHINE DO BOT (plano Essencial)

Cada conversa tem um estado persistido em nova tabela `conversation_states`:

```sql
conversation_states (
  id uuid PK,
  tenant_id uuid FK,
  contact_id uuid FK,
  current_state text,
  context jsonb,  -- { unit_id, category_id, service_id, professional_id, date, slot, ... }
  last_interaction_at timestamptz,
  expires_at timestamptz,  -- 30min de inatividade reseta para inicial
  created_at timestamptz,
  UNIQUE(tenant_id, contact_id)
)
```

### Estados possíveis
`IDLE` → `AWAITING_NAME` → `MAIN_MENU` → `SELECTING_UNIT` → `SELECTING_CATEGORY` → `SELECTING_SERVICE` → `AWAITING_DATE` → `SELECTING_PROFESSIONAL` → `SELECTING_SLOT` → `CONFIRMING_BOOKING` → `AWAITING_PAYMENT` → `COMPLETED`

Estados paralelos: `MANAGING_BOOKING` → `CHOOSING_ACTION` (cancelar/reagendar/novo) → `AWAITING_CANCEL_REASON` / `AWAITING_NEW_DATE`

---

## 3. FLUXO DETALHADO

### 3.1 Mensagem inicial
Ao receber qualquer mensagem de um número:

1. Busca contato por telefone (`get /contacts/by-phone`)
2. **Se NÃO existe:**
   - Envia: "Olá! 👋 Bem-vindo à *{nome da barbearia}*. Para começar, qual é o seu nome completo?"
   - Estado → `AWAITING_NAME`
   - Próxima mensagem do cliente é salva como nome, contato é criado com tag `cadastrado`, fluxo segue para passo 3
3. **Se existe:** segue direto para passo 3 chamando pelo `primeiro_nome`

### 3.2 Verificação de agendamento ativo
Chama `GET /appointments/by-client/:phone`:
- **Se houver upcoming:** envia mensagem com resumo do agendamento + 4 botões: `Cancelar` / `Reagendar` / `Novo agendamento` / `Voltar ao menu`
- **Se NÃO houver:** envia mensagem de boas-vindas customizada (campo `settings.welcome_message`) + link da página pública + botões com categorias

### 3.3 Mensagem de boas-vindas (cliente cadastrado, sem agendamento)
```
Oi {primeiro_nome}! 👋
Como posso te ajudar hoje?

Você também pode agendar pelo nosso link: {link_publico}
```
+ botões com categorias (`/categories`).

### 3.4 Seleção de unidade (apenas se >1 unidade)
Se `companies.count > 1`, ANTES das categorias enviar:
```
Em qual unidade você quer ser atendido?
```
Botões com `nome` e `endereço resumido` de cada unidade. Salva `context.unit_id`.

### 3.5 Categoria → Serviço
Cliente clica categoria → estado `SELECTING_SERVICE` → envia lista (`/send/menu` tipo lista) com serviços, mostrando nome + preço + duração:
```
✂️ Corte Masculino — R$ 45 (30min)
🧔 Barba — R$ 30 (20min)
```

### 3.6 Data — Parser de linguagem natural ⭐
Cliente clica serviço → envia: "Para qual data você quer agendar?" + botões rápidos: `Hoje` / `Amanhã` / `Esta semana` / `Outra data`.

Se cliente digitar texto livre, passa por **parser de datas pt-BR** (Edge Function `parse-date`) que reconhece:

| Input | Output |
|---|---|
| "hoje", "agora" | data atual |
| "amanhã", "amanha" | data+1 |
| "depois de amanhã" | data+2 |
| "dia 26", "26" | dia 26 do mês corrente (ou próximo se já passou) |
| "26/04", "26/4", "26-04" | data específica |
| "26 de abril", "vinte e seis de abril" | data específica |
| "segunda", "seg", "segunda-feira" | próxima segunda |
| "quarta que vem", "próxima quarta" | quarta da semana seguinte |
| "sexta agora", "essa sexta" | sexta da semana atual |
| "fim de semana" | retorna sábado e domingo |
| "semana que vem" | retorna lista de dias |
| "daqui 3 dias", "em 3 dias" | data+3 |

Implementação: usar `chrono-node` (já tem locale pt-BR) + regras customizadas. Se parser falhar, responder: "Não consegui entender a data 😅 Pode mandar no formato dia/mês? Ex: 26/04"

Validação após parse: data não pode ser passada nem além de 60 dias.

### 3.7 Profissional
Após data válida, chama `GET /availability/by-service` com `date_from=date_to=parsed_date`:
- **Se >1 profissional disponível:** envia botões com nomes + foto + ⭐ "Sem preferência" como primeira opção
- **Se 1 profissional:** pula direto para horários
- **Se 0 disponíveis:** "Nenhum profissional disponível neste dia. Quer escolher outra data?" + botão `Ver próximos dias` (chama `next-available`)

### 3.8 Horários
- "Sem preferência" → mescla slots de todos os profissionais, ordenados por horário, deduplicados, e ao escolher o sistema atribui o profissional disponível (escolhe o de menor agenda do dia para balancear)
- Profissional específico → mostra apenas slots dele
- Limita a ~10 botões por mensagem; se houver mais, oferece "Ver mais horários"

Cada botão mostra `HH:MM` (e nome do profissional entre parênteses se "sem preferência").

### 3.9 Confirmação
Mensagem de resumo:
```
📋 *Resumo do agendamento*

Serviço: Corte Masculino
Profissional: João
Data: Quarta, 16/04
Horário: 14:00
Valor: R$ 45,00

Confirma o agendamento?
```
Botões: `✅ Confirmar` / `❌ Cancelar` / `✏️ Editar`.

Ao confirmar → `POST /appointments` com `created_via='whatsapp'`. Em caso de `409 SLOT_UNAVAILABLE`, recuar para `SELECTING_SLOT` e refazer.

### 3.10 Pagamento
Se `settings.pix_key` ou `settings.payment_link` configurado:
```
Agendamento confirmado! ✅
Para garantir seu horário, faça o pagamento:

Pix: {pix_key}
ou pague pelo link: {payment_link}
```
Se nenhum configurado, apenas confirmação.

### 3.11 Gerenciar agendamento existente
- **Cancelar:** "Por que você quer cancelar?" (texto livre) → `POST /appointments/:id/cancel`
- **Reagendar:** "Para qual nova data?" → mesmo parser de datas → fluxo de profissional/horário → `PATCH /appointments/:id`

---

## 4. PARSER DE INTENTS (botões e texto livre)

Mesmo sendo plano Essencial, precisa interpretar fallback de texto:
- Detecta `oi`, `bom dia`, `olá`, `menu`, `começar` → reset para `IDLE`
- Detecta `cancelar`, `desmarcar` em qualquer estado → vai para `MANAGING_BOOKING`
- Detecta números de cupom → valida e aplica
- Comando especial `sair` ou `parar` → desativa `ia_enabled` por 24h
- Após 30min de inatividade, próxima mensagem reseta o estado

---

## 5. PÁGINA PÚBLICA DE AGENDAMENTO

### 5.1 Rota e identificação
- URL: `https://barberflow.com.br/b/{slug}`
- Cada empresa tem `companies.public_slug` UNIQUE (gerado do nome, editável)
- Se tenant tem múltiplas unidades, slug é a nível tenant: `/b/{tenant_slug}` e o usuário escolhe unidade no wizard
- A rota é Server Component que busca dados públicos via service role (sem auth)

### 5.2 Tabela nova
```sql
ALTER TABLE companies ADD COLUMN public_slug text UNIQUE;
ALTER TABLE tenants ADD COLUMN public_slug text UNIQUE;

public_booking_sessions (  -- rastrear sessões para analytics
  id uuid PK,
  tenant_id uuid FK,
  contact_phone text,
  ip text,
  user_agent text,
  completed bool DEFAULT false,
  appointment_id uuid FK NULL,
  created_at timestamptz
)
```

### 5.3 Wizard — passos

**Passo 0 — Identificação**
Card centralizado com logo e nome da barbearia. Inputs: Nome completo, Telefone (máscara BR). Botão "Continuar". Texto LGPD pequeno. Ao continuar, cria/atualiza contato com tag `cadastrado-via-link`.

**Passo 1 — Unidade** (apenas se >1)
Cards com foto, nome, endereço, distância (se geoloc permitida), botão "Selecionar".

**Passo 2 — Categoria**
Grid de cards de categoria com ícone/cor, nome e contagem de serviços.

**Passo 3 — Serviço**
Lista de cards: nome, descrição, duração badge, preço grande. Permite múltiplos serviços (combo) — checkbox.

**Passo 4 — Data**
Calendário mensal inline, dias bloqueados em cinza, dias com disponibilidade em branco, dia selecionado em amber. Indicador de "poucos horários" em amarelo. Mostra 30 dias.

**Passo 5 — Profissional**
Cards com avatar, nome, rating, especialidades, badge "Sem preferência" como primeira opção.

**Passo 6 — Horário (slots visuais)**
Mostra a **agenda do profissional naquele dia** em formato de timeline visual: blocos cinza = ocupado, blocos verdes clicáveis = disponível, com horário visível. Layout horizontal scrollável de 08h às 20h. Bem mais visual que lista de botões.

**Passo 7 — Confirmação**
Resumo grande com tudo. Botão "Confirmar agendamento" amber gigante.

**Passo 8 — Sucesso**
Animação de check verde, "Agendamento confirmado!", resumo, botão "Adicionar à agenda do celular" (gera .ics), e a pergunta: **"Quer agendar outro serviço?"** com botões `Sim, novo agendamento` (volta ao passo 1 ou 2 mantendo identificação) / `Não, finalizar`.

### 5.4 Estado do wizard
- Persistir em `sessionStorage` para sobreviver a refresh
- Botão "voltar" em cada passo
- Progress bar amber no topo mostrando 8 passos
- Mobile-first, otimizado para celular (a maioria virá pelo WhatsApp clicando no link)

### 5.5 Funcionalidades extras
- **Compartilhamento:** botão "Compartilhar barbearia" (Web Share API)
- **Trust signals:** avaliações no rodapé, fotos da unidade, horário de funcionamento, mapa
- **Re-engajamento:** se sessão abandonada antes do passo 7, agendar mensagem WhatsApp 1h depois (se telefone validado): "Vi que você começou um agendamento, quer continuar?"
- **Anti-spam:** rate limit por IP (5 tentativas/15min), validação de telefone via OTP WhatsApp opcional

---

## 6. PROMPT STITCH — PÁGINA PÚBLICA

```
Design a public booking page for a barbershop, accessed via URL /b/{slug}.
This is a CONSUMER-facing page (different from the SaaS admin), but should
share design DNA: rounded corners, amber #F59E0B accent, navy text, Inter font,
soft cards, friendly tone. In Brazilian Portuguese.

Mobile-first (90% of traffic comes from WhatsApp link). Clean, single-column,
generous whitespace, 24px page padding.

## Header (sticky)
Compact bar with barbershop logo, name, and "← Voltar" link. Below: progress
bar amber with 8 steps, current step highlighted with label "Passo 3 de 8: Escolha o serviço".

## Step 0 — Identification
Card with logo big centered, barbershop name h1, tagline "Agende seu horário em segundos". Two large rounded inputs (nome completo, telefone with BR mask). Big amber button "Continuar". Small LGPD text.

## Step 1 — Unit (if multi-unit)
Cards stacked, each with cover photo, name bold, address with map pin icon, distance badge if available, "Selecionar →" arrow.

## Step 2 — Category
Grid 2 columns of soft pastel cards, big icon/emoji centered, category name, "X serviços" small text.

## Step 3 — Service
List of cards: service name bold, description small muted, duration pill (⏱ 30min), price large amber on right. Checkbox to allow combo selection. Floating bottom bar shows "X serviços selecionados — R$ XX" + Continue button.

## Step 4 — Date
Inline month calendar, today highlighted, unavailable days gray, available white, low-availability amber dot, selected day amber filled circle. Month nav arrows. Below: "Datas mais próximas:" quick chips.

## Step 5 — Professional
Cards with circular avatar 80px, name, ⭐ rating, specialties chips. First card always "Sem preferência" with team icon, subtitle "Vamos te encaixar com qualquer profissional disponível".

## Step 6 — Time slots (VISUAL TIMELINE)
The differentiator. Show a horizontal scrollable timeline from 08:00 to 20:00. Time labels on top. Below, a single row representing the day, with colored blocks: gray = busy, green/amber outline = available (clickable). Blocks have rounded corners and the start time visible. Tapping a green block selects it (turns solid amber). Below timeline: traditional list of available times as backup chips.

## Step 7 — Confirmation
Big card with all details: service(s), professional, date formatted ("Quarta, 16 de abril"), time, total value. Edit pencil icons next to each field to jump back. Huge amber button "Confirmar agendamento".

## Step 8 — Success
Animated green check, "Agendamento confirmado! 🎉", recap card, two buttons: outline "Adicionar ao calendário" + amber "Agendar outro serviço". Below: WhatsApp number of the barbershop with click-to-chat.

## Footer (every step)
Barbershop info: address with mini map, phone, hours, social icons. "Powered by BarberFlow" tiny.

Make it feel premium, fast, frictionless. No login required ever.
```

---

## 7. EDGE FUNCTIONS NOVAS

| Função | Trigger | Responsabilidade |
|---|---|---|
| `whatsapp-webhook` | POST uazapi | Recebe mensagem, roteia state machine |
| `whatsapp-connect` | Tela conexão | Inicia instância + auto-config webhook |
| `parse-date` | Interno | NLU de datas pt-BR |
| `bot-state-machine` | Interno | Lógica dos estados |
| `send-buttons` | Interno | Wrapper para `/send/menu` da uazapi |
| `cleanup-stale-states` | Cron 10min | Reseta estados expirados |
| `public-booking-api` | Página pública | Endpoints sem auth |

---

## 8. CRITÉRIOS DE ACEITE

- ✅ Webhook auto-configurado após conexão WhatsApp
- ✅ Cliente novo é cadastrado e ganha tag automaticamente
- ✅ Bot reconhece "quarta que vem", "dia 26", "26/04" e variações
- ✅ Multi-unidade exibe seletor antes das categorias
- ✅ "Sem preferência" mescla slots de todos os profissionais
- ✅ Resumo sempre mostrado antes de criar agendamento
- ✅ Slug único por empresa, página pública carrega só dados daquela barbearia
- ✅ Wizard mobile responsivo, sessão persiste em refresh
- ✅ Após confirmar, oferece agendar mais um
- ✅ Race condition tratada (slot pode ser pego entre listagem e confirmação)
- ✅ Mensagens trocadas registradas em `messages` para auditoria
