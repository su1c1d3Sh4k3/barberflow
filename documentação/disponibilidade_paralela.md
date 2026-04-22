# Disponibilidade Paralela (Grupo)

**`GET /api/availability/parallel`**

Busca horários onde **2 ou mais serviços podem ser realizados simultaneamente** por profissionais diferentes. Ideal para grupos (ex: casal que quer cabelo + barba ao mesmo tempo, ou nail + cabelo em paralelo).

Headers obrigatórios:
```
Authorization: Bearer {{SERVICE_ROLE_KEY}}
x-tenant-id: {{TENANT_ID}}
```

---

## Como funciona

1. Para cada serviço, busca todos os profissionais habilitados para realizá-lo
2. Para cada par (profissional × serviço), consulta os slots disponíveis na data
3. Encontra horários onde **todos os serviços têm ao menos um profissional livre**
4. Usa backtracking para garantir que **nenhum profissional seja atribuído a dois serviços no mesmo horário**
5. Retorna a lista de horários com a atribuição (quem faz o quê)

---

## Query Parameters

| Parâmetro | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `service_ids` | string | Sim | UUIDs separados por vírgula (mínimo 2) |
| `date` | YYYY-MM-DD | Sim | Data desejada |
| `period` | string | Não | `manha` (antes das 12h) ou `tarde` (a partir das 12h) |

---

## Retorno — sucesso

```json
{
  "success": true,
  "data": {
    "slots_simultaneos": [
      {
        "horario": "16:30",
        "atribuicoes": [
          { "servico": "Cabelo", "servico_id": "uuid-cabelo", "profissional": "Carlos", "profissional_id": "uuid-carlos" },
          { "servico": "Barba",  "servico_id": "uuid-barba",  "profissional": "Marcos", "profissional_id": "uuid-marcos" }
        ]
      },
      {
        "horario": "17:00",
        "atribuicoes": [...]
      }
    ],
    "total": 2,
    "data": "2026-04-23",
    "periodo": "tarde",
    "servicos": [
      { "id": "uuid-cabelo", "nome": "Cabelo", "duracao_min": 30 },
      { "id": "uuid-barba",  "nome": "Barba",  "duracao_min": 20 }
    ]
  }
}
```

## Retorno — sem horários disponíveis

```json
{
  "success": true,
  "data": {
    "slots_simultaneos": [],
    "total": 0,
    "data": "2026-04-23",
    "periodo": "todos",
    "servicos": [...],
    "aviso": "Nenhum horário simultâneo disponível em 2026-04-23. Tente outro dia ou período."
  }
}
```

---

## Erros claros retornados

| Situação | HTTP | Mensagem |
|---|---|---|
| `service_ids` ausente | 400 | `Parâmetro obrigatório ausente: service_ids` |
| Menos de 2 serviços | 400 | `É necessário informar pelo menos 2 service_ids diferentes` |
| `date` ausente | 400 | `Parâmetro obrigatório ausente: date` |
| Formato de data errado | 400 | `Formato de date inválido: "...". Use YYYY-MM-DD` |
| `period` inválido | 400 | `Valor de period inválido: "...". Use "manha" ou "tarde"` |
| Serviço não encontrado | 404 | `Serviço não encontrado: {id}` |
| Serviço inativo | 400 | `Serviço inativo: "{nome}"` |
| Serviço sem duração | 400 | `Serviço "{nome}" sem duração configurada` |
| Nenhum profissional no serviço | 400 | `Nenhum profissional cadastrado para o serviço "{nome}"` |

---

## Curl — exemplo com 2 serviços

```bash
curl -X GET "https://clinvia-barber.d69qzb.easypanel.host/api/availability/parallel?service_ids=uuid-cabelo,uuid-barba&date=2026-04-23" \
  -H "Authorization: Bearer {{SERVICE_ROLE_KEY}}" \
  -H "x-tenant-id: {{TENANT_ID}}"
```

## Curl — 3 serviços, apenas tarde

```bash
curl -X GET "https://clinvia-barber.d69qzb.easypanel.host/api/availability/parallel?service_ids=uuid-cabelo,uuid-barba,uuid-manicure&date=2026-04-23&period=tarde" \
  -H "Authorization: Bearer {{SERVICE_ROLE_KEY}}" \
  -H "x-tenant-id: {{TENANT_ID}}"
```

---

## Observações

- O sistema **nunca atribui o mesmo profissional a dois serviços simultâneos**, mesmo que ele realize ambos
- Cada serviço precisa ter ao menos **1 profissional habilitado** vinculado a ele no painel
- Os slots respeitam duração de cada serviço individualmente — não há encavalamento
- O endpoint pode fazer múltiplas chamadas ao banco (1 por par profissional×serviço), portanto em barbearias com muitos profissionais pode levar ~1-2 segundos
