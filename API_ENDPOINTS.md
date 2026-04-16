# BarberFlow — API Interna (Edge Functions Supabase)

> API consumida pelo bot de WhatsApp (uazapi → Edge Function roteadora) e pela IA (n8n).
> Base URL: `https://<project>.supabase.co/functions/v1/api`
> Auth: header `Authorization: Bearer <SERVICE_ROLE_KEY>` + header `x-tenant-id: <uuid>`
> Todas as respostas: `{ success: bool, data: any, error?: string }`
> Todos os horários em ISO 8601 com timezone `America/Sao_Paulo`.

---

## 1. ENDPOINTS DE LEITURA

### 1.1 Categorias e Serviços

#### `GET /categories`
Lista todas as categorias ativas da barbearia.
**Response:** `[{ id, name, description, color, services_count }]`

#### `GET /categories/:id`
Detalhes de uma categoria.

#### `GET /services`
Lista todos os serviços ativos.
**Query opcional:** `?professional_id=uuid` (filtra apenas serviços que o profissional atende)
**Response:** `[{ id, name, description, duration_min, price, promo_active, final_price, category: {id, name} }]`

#### `GET /services/:id`
Detalhes de um serviço.

#### `GET /services/by-category/:categoryId`
Lista serviços de uma categoria específica.

#### `GET /services/by-professional/:professionalId`
Lista serviços que um profissional específico atende.

---

### 1.2 Profissionais

#### `GET /professionals`
Lista todos os profissionais ativos.
**Query opcional:** `?service_id=uuid` (filtra os que atendem o serviço)
**Response:** `[{ id, name, avatar_url, bio, rating, services_count }]`

#### `GET /professionals/:id`
Detalhes do profissional incluindo escala, intervalos e serviços atendidos.

#### `GET /professionals/by-service/:serviceId`
Lista profissionais que atendem um serviço específico.

---

### 1.3 Disponibilidade (CORE — algoritmo de slots)

> **Regra de cálculo de slots:**
> 1. Buscar `professional_schedules` do dia (horário de trabalho + intervalo)
> 2. Buscar `appointments` confirmados/pendentes do profissional naquele dia
> 3. Buscar `professional_blocks` (folgas/férias) que cruzam a data
> 4. Buscar `business_hours` da unidade + `holidays`
> 5. Gerar grade de slots de **10 em 10 minutos** dentro do expediente
> 6. Para cada slot candidato, validar se `slot + service.duration_min` cabe sem sobrepor:
>    - Intervalos do profissional
>    - Outros agendamentos
>    - Bloqueios
>    - Fim do expediente
> 7. Retornar apenas slots cujo `[start, start+duration]` está 100% livre
> 8. Aplicar buffer opcional pós-serviço (configurável por serviço)

#### `GET /availability/today/by-service`
**Query obrigatória:** `service_id`, `professional_id` (opcional — se omitido, retorna por profissional)
Retorna slots disponíveis HOJE.

#### `GET /availability/today/by-professional`
**Query obrigatória:** `professional_id`, `service_id` (OBRIGATÓRIO para calcular duração)
Retorna slots disponíveis HOJE para o profissional considerando o serviço escolhido.
**Response:**
```json
{
  "date": "2026-04-11",
  "professional": { "id": "...", "name": "..." },
  "service": { "id": "...", "name": "...", "duration_min": 30 },
  "slots": [
    { "start": "2026-04-11T08:00:00-03:00", "end": "2026-04-11T08:30:00-03:00" },
    { "start": "2026-04-11T08:10:00-03:00", "end": "2026-04-11T08:40:00-03:00" }
  ]
}
```

#### `GET /availability/by-professional`
**Query obrigatória:** `professional_id`, `service_id`, `date_from`, `date_to` (max 30 dias)
Retorna slots por dia no intervalo informado.

#### `GET /availability/by-service`
**Query obrigatória:** `service_id`, `date_from`, `date_to`
Retorna slots agrupados por profissional.
**Response:**
```json
{
  "service": {...},
  "by_professional": [
    { "professional": {...}, "days": [{ "date": "...", "slots": [...] }] }
  ]
}
```

#### `GET /availability/next-available` ⭐ extra
**Query:** `service_id`, `professional_id?`
Retorna o **próximo horário livre mais cedo possível** (útil pro cliente que diz "qualquer hora").

#### `GET /availability/check-slot` ⭐ extra
**Query:** `professional_id`, `service_id`, `start_at`
Valida em tempo real se um slot específico ainda está disponível antes de criar o agendamento (evita race condition entre listagem e criação).

---

### 1.4 Contatos e Histórico

#### `GET /contacts/by-phone/:phone`
Busca contato pelo telefone (E.164). Retorna 404 se não existir.

#### `POST /contacts` ⭐ extra
Cria/atualiza contato (upsert por telefone). Body: `{ name, phone, birthday? }`

#### `GET /contacts/:id/appointments`
Histórico completo de agendamentos do cliente.
**Query:** `?status=confirmado|concluido|cancelado&limit=10`

#### `GET /appointments/by-client/:phone`
Atalho: busca contato pelo telefone e retorna agendamentos futuros + últimos 5 passados.
**Response:**
```json
{
  "contact": {...},
  "upcoming": [...],
  "past": [...]
}
```

---

## 2. ENDPOINTS DE ESCRITA

### 2.1 Agendamentos

#### `POST /appointments`
Cria agendamento. Faz validação dupla de slot antes de inserir (SELECT FOR UPDATE na transação).
**Body:**
```json
{
  "contact_phone": "+5531999999999",
  "contact_name": "João Silva",
  "professional_id": "uuid",
  "service_ids": ["uuid"],
  "start_at": "2026-04-11T14:00:00-03:00",
  "notes": "string?",
  "coupon_code": "string?",
  "created_via": "whatsapp|ia|painel"
}
```
**Lógica:**
1. Upsert contato
2. Lock transacional + revalidar disponibilidade
3. Calcular `end_at = start_at + sum(service.duration_min)`
4. Validar cupom (se enviado)
5. Calcular `total_price` com desconto
6. Insert em `appointments` + `appointment_services`
7. Atualizar `contacts.last_appointment_at` e `status='agendado'`
8. Disparar webhook interno (notificar painel via Realtime)
9. Retornar agendamento criado

**Erros possíveis:**
- `409 SLOT_UNAVAILABLE` — alguém pegou o horário
- `400 OUTSIDE_BUSINESS_HOURS`
- `400 PROFESSIONAL_NOT_OFFERS_SERVICE`
- `400 INVALID_COUPON`

#### `PATCH /appointments/:id`
Atualiza agendamento (reagendar, mudar profissional/serviço/horário).
**Body:** quaisquer campos de `POST /appointments`. Se mudar `start_at` ou `service_ids`, revalida slot.
Quando reagenda, marca o anterior como `reagendado` e cria novo? **Não** — atualiza in-place e adiciona registro em `appointment_history` (ver §3).

#### `POST /appointments/:id/cancel`
Cancela agendamento.
**Body:** `{ reason?: string, canceled_by: "client|professional|admin|system" }`
Atualiza `status='cancelado'`, registra histórico, envia webhook.

#### `POST /appointments/:id/confirm` ⭐ extra
Cliente confirma presença (responde "1" no WhatsApp). `status='confirmado'`.

#### `POST /appointments/:id/complete` ⭐ extra
Marca como concluído (após atendimento). Calcula comissão, atualiza LTV do contato.

#### `POST /appointments/:id/no-show` ⭐ extra
Marca como falta. Pode acionar regra de cobrança/bloqueio futuro.

#### `POST /appointments/:id/reschedule` ⭐ extra
Atalho com semântica clara. Body: `{ new_start_at }`. Internamente igual ao PATCH mas registra motivo "reschedule".

#### `GET /appointments/:id`
Detalhes completos do agendamento.

---

### 2.2 Lista de espera ⭐ extra

#### `POST /waitlist`
Adiciona cliente à fila quando não há slot disponível.
**Body:** `{ contact_phone, service_id, professional_id?, desired_date }`

#### `GET /waitlist/notify-available` (cron)
Roda periodicamente: para cada item da waitlist, checa se abriu slot e dispara mensagem WhatsApp.

---

### 2.3 Cupons ⭐ extra

#### `POST /coupons/validate`
**Body:** `{ code, contact_phone, service_ids }`
Valida existência, expiração, vínculo com cliente, retorna desconto aplicável.

#### `POST /coupons/generate`
Gera instância de cupom para um cliente: `{base_name}_{últimos 4 dígitos do tel}`.

---

### 2.4 Mensagens / Conversa ⭐ extra

#### `POST /messages/log`
Registra mensagem trocada (in/out) na tabela `messages`.

#### `GET /contacts/:id/messages`
Histórico de conversa paginado.

---

## 3. TABELA NOVA SUGERIDA

```sql
appointment_history (
  id uuid PK,
  appointment_id uuid FK,
  action text CHECK (action IN ('created','rescheduled','canceled','confirmed','completed','no_show','updated')),
  previous_state jsonb,
  new_state jsonb,
  reason text,
  performed_by text,  -- 'client'|'professional'|'admin'|'system'|'ia'
  created_at timestamptz DEFAULT now()
)
```

Auditoria completa de mudanças, essencial para suporte ao cliente final via WhatsApp.

---

## 4. FUNÇÃO POSTGRES — `get_available_slots`

Centraliza o algoritmo de cálculo. Chamada por todos os endpoints de availability.

```sql
CREATE OR REPLACE FUNCTION get_available_slots(
  p_tenant_id uuid,
  p_professional_id uuid,
  p_service_id uuid,
  p_date date
) RETURNS TABLE(slot_start timestamptz, slot_end timestamptz)
LANGUAGE plpgsql
AS $$
DECLARE
  v_duration int;
  v_buffer int := 0;
  v_step int := 10;  -- 10 minutos
BEGIN
  SELECT duration_min INTO v_duration FROM services WHERE id = p_service_id;

  RETURN QUERY
  WITH schedule AS (
    SELECT start_time, end_time, break_start, break_end
    FROM professional_schedules
    WHERE professional_id = p_professional_id
      AND weekday = EXTRACT(DOW FROM p_date)
  ),
  candidate_slots AS (
    SELECT generate_series(
      (p_date + (SELECT start_time FROM schedule))::timestamptz,
      (p_date + (SELECT end_time FROM schedule))::timestamptz - (v_duration || ' minutes')::interval,
      (v_step || ' minutes')::interval
    ) AS slot_start
  ),
  busy AS (
    SELECT start_at, end_at FROM appointments
    WHERE professional_id = p_professional_id
      AND tenant_id = p_tenant_id
      AND status IN ('pendente','confirmado')
      AND start_at::date = p_date
    UNION ALL
    SELECT start_at, end_at FROM professional_blocks
    WHERE professional_id = p_professional_id
      AND start_at::date <= p_date AND end_at::date >= p_date
    UNION ALL
    SELECT (p_date + break_start)::timestamptz, (p_date + break_end)::timestamptz
    FROM schedule WHERE break_start IS NOT NULL
  )
  SELECT cs.slot_start, cs.slot_start + (v_duration || ' minutes')::interval AS slot_end
  FROM candidate_slots cs
  WHERE NOT EXISTS (
    SELECT 1 FROM busy b
    WHERE tstzrange(cs.slot_start, cs.slot_start + (v_duration || ' minutes')::interval, '[)')
       && tstzrange(b.start_at, b.end_at, '[)')
  )
  AND cs.slot_start > now();
END;
$$;
```

**Índice necessário:** `CREATE INDEX ON appointments USING gist (tstzrange(start_at, end_at) gist_tstzrange_ops);`

---

## 5. PROTEÇÃO ANTI-RACE CONDITION

Ao criar agendamento, usar transação com lock:
```sql
BEGIN;
SELECT 1 FROM appointments
WHERE professional_id = $1
  AND tstzrange(start_at, end_at, '[)') && tstzrange($2, $3, '[)')
  AND status IN ('pendente','confirmado')
FOR UPDATE;
-- se retornou linha, rollback com 409
INSERT INTO appointments (...) VALUES (...);
COMMIT;
```

---

## 6. EXTRAS QUE RECOMENDO ADICIONAR

| Endpoint | Por que |
|---|---|
| `GET /business-hours/today` | Bot responder "estamos abertos?" |
| `GET /company/info` | Endereço, telefone, mapa para enviar no WhatsApp |
| `POST /feedback` | Avaliação pós-atendimento |
| `GET /appointments/upcoming` | Lembretes automáticos (cron) |
| `POST /contacts/:id/birthday-message` | Trigger manual |
| `GET /coupons/by-contact/:phone` | Cliente perguntar quais cupons tem |
| `GET /promotions/active` | Listar serviços em promoção |

---

## 7. RATE LIMIT E SEGURANÇA

- Rate limit por `tenant_id`: 300 req/min
- Validação Zod em todos os bodies
- RLS bypass via service role (Edge Functions já rodam server-side)
- Logs estruturados de todas as escritas em `audit_logs`
- Webhook signing entre uazapi → Edge Function (HMAC)
