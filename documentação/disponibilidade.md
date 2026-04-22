# Disponibilidade / Slots

Headers obrigatórios em todos os endpoints:
```
Authorization: Bearer {{SERVICE_ROLE_KEY}}
x-tenant-id: {{TENANT_ID}}
```

> **Para uso pela IA:** use `/api/availability/ia` (retorna `HH:MM`, valida erros detalhados, suporta filtro manhã/tarde).
> **Para uso interno do app/frontend:** use `/api/availability` (retorna ISO timestamps `slot_start`/`slot_end`).

---

## 1. Disponibilidade para a IA ⭐

**`GET /api/availability/ia`**

Endpoint otimizado para consumo pela IA via n8n. Retorna lista simplificada de horários no formato `HH:MM` (fuso BRT). Valida se o profissional e o serviço existem com mensagens de erro claras. Suporta filtro por período (manhã/tarde).

### Query Parameters

| Parâmetro | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `professional_id` | UUID | Sim | ID do profissional |
| `service_id` | UUID | Sim | ID do serviço |
| `date` | YYYY-MM-DD | Sim | Data desejada (ex: `2026-04-23`) |
| `period` | string | Não | `manha` (antes das 12h) ou `tarde` (a partir das 12h) |

### Retorno — sucesso com horários

```json
{
  "success": true,
  "data": {
    "horarios": ["09:00", "09:10", "09:20", "13:00", "13:10"],
    "total": 5,
    "periodo": "todos",
    "data": "2026-04-23",
    "profissional": "Carlos",
    "servico": "Corte Degradê"
  }
}
```

### Retorno — sem horários disponíveis

```json
{
  "success": true,
  "data": {
    "horarios": [],
    "total": 0,
    "periodo": "todos",
    "data": "2026-04-23",
    "profissional": "Carlos",
    "servico": "Corte Degradê",
    "aviso": "Nenhum horário disponível para 2026-04-23. A agenda pode estar lotada ou todos os slots já passaram."
  }
}
```

### Erros claros retornados

| Situação | HTTP | Mensagem |
|---|---|---|
| `professional_id` ausente | 400 | `Parâmetro obrigatório ausente: professional_id` |
| `service_id` ausente | 400 | `Parâmetro obrigatório ausente: service_id` |
| `date` ausente | 400 | `Parâmetro obrigatório ausente: date` |
| Formato de data errado | 400 | `Formato de date inválido: "...". Use YYYY-MM-DD` |
| `period` inválido | 400 | `Valor de period inválido: "...". Use "manha" ou "tarde"` |
| Profissional não encontrado | 404 | `Profissional não encontrado: {id}` |
| Profissional inativo | 400 | `Profissional inativo: "{nome}"` |
| Serviço não encontrado | 404 | `Serviço não encontrado: {id}. Use GET /api/services...` |
| Serviço inativo | 400 | `Serviço inativo: "{nome}"` |
| Serviço sem duração | 400 | `Serviço "{nome}" sem duração configurada` |

### Curl — todos os horários

```bash
curl -X GET "https://clinvia-barber.d69qzb.easypanel.host/api/availability/ia?professional_id=uuid-prof&service_id=uuid-serv&date=2026-04-23" \
  -H "Authorization: Bearer {{SERVICE_ROLE_KEY}}" \
  -H "x-tenant-id: {{TENANT_ID}}"
```

### Curl — apenas manhã

```bash
curl -X GET "https://clinvia-barber.d69qzb.easypanel.host/api/availability/ia?professional_id=uuid-prof&service_id=uuid-serv&date=2026-04-23&period=manha" \
  -H "Authorization: Bearer {{SERVICE_ROLE_KEY}}" \
  -H "x-tenant-id: {{TENANT_ID}}"
```

### Curl — apenas tarde

```bash
curl -X GET "https://clinvia-barber.d69qzb.easypanel.host/api/availability/ia?professional_id=uuid-prof&service_id=uuid-serv&date=2026-04-23&period=tarde" \
  -H "Authorization: Bearer {{SERVICE_ROLE_KEY}}" \
  -H "x-tenant-id: {{TENANT_ID}}"
```

---

## 2. Buscar Slots Disponíveis (uso interno)

**`GET /api/availability`**

Retorna slots em formato ISO `slot_start`/`slot_end`. Usado pelo frontend e chatbot. Preferir `/api/availability/ia` para a IA.

### Query Parameters

| Parâmetro | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `professional_id` | UUID | Sim | ID do profissional |
| `service_id` | UUID | Sim | ID do serviço |
| `date` | YYYY-MM-DD | Sim* | Data desejada |
| `date_from` | YYYY-MM-DD | Sim* | Alternativa ao `date` |

### Retorno

```json
{
  "success": true,
  "data": [
    { "slot_start": "2026-04-23T12:00:00+00:00", "slot_end": "2026-04-23T12:30:00+00:00" }
  ]
}
```

### Curl

```bash
curl -X GET "https://clinvia-barber.d69qzb.easypanel.host/api/availability?professional_id=uuid-prof&service_id=uuid-serv&date=2026-04-23" \
  -H "Authorization: Bearer {{SERVICE_ROLE_KEY}}" \
  -H "x-tenant-id: {{TENANT_ID}}"
```

---

## 3. Verificar Slot Específico

**`GET /api/availability/check-slot`**

Verifica se um horário específico está disponível.

### Query Parameters

| Parâmetro | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `professional_id` | UUID | Sim | ID do profissional |
| `service_id` | UUID | Sim | ID do serviço |
| `date_time` | ISO 8601 | Sim | Data/hora exata (ex: `2026-04-23T10:00:00Z`) |

### Retorno

```json
{
  "success": true,
  "data": { "available": true, "conflicts_count": 0 }
}
```

### Curl

```bash
curl -X GET "https://clinvia-barber.d69qzb.easypanel.host/api/availability/check-slot?professional_id=uuid-prof&service_id=uuid-serv&date_time=2026-04-23T10:00:00Z" \
  -H "Authorization: Bearer {{SERVICE_ROLE_KEY}}" \
  -H "x-tenant-id: {{TENANT_ID}}"
```

---

## 4. Próximo Horário Disponível

**`GET /api/availability/next-available`**

Busca o primeiro horário disponível nos próximos 7 dias.

### Query Parameters

| Parâmetro | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `professional_id` | UUID | Sim | ID do profissional |
| `service_id` | UUID | Sim | ID do serviço |

### Retorno

```json
{
  "success": true,
  "data": {
    "next_available": { "slot_start": "2026-04-23T12:00:00+00:00", "slot_end": "2026-04-23T12:30:00+00:00" }
  }
}
```

### Curl

```bash
curl -X GET "https://clinvia-barber.d69qzb.easypanel.host/api/availability/next-available?professional_id=uuid-prof&service_id=uuid-serv" \
  -H "Authorization: Bearer {{SERVICE_ROLE_KEY}}" \
  -H "x-tenant-id: {{TENANT_ID}}"
```

---

## 5. Disponibilidade de Hoje

**`GET /api/availability/today`**

Retorna slots disponíveis para hoje. Se omitir `professional_id`, retorna por todos os profissionais ativos.

### Query Parameters

| Parâmetro | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `service_id` | UUID | Sim | ID do serviço |
| `professional_id` | UUID | Não | ID do profissional (opcional) |

### Curl

```bash
curl -X GET "https://clinvia-barber.d69qzb.easypanel.host/api/availability/today?service_id=uuid-serv" \
  -H "Authorization: Bearer {{SERVICE_ROLE_KEY}}" \
  -H "x-tenant-id: {{TENANT_ID}}"
```
