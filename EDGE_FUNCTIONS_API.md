# Edge Functions API — Bolão Copa 2026

> Documentação das Edge Functions do Supabase para o Bolão Virtual da Copa do Mundo 2026
> Projeto: Planeta Energia
> Base URL: `https://shyvzreadwnvgovgrqek.supabase.co/functions/v1`

---

## health

**Descrição:** Verifica o status da aplicação e conectividade com o banco de dados

**URL:** `https://shyvzreadwnvgovgrqek.supabase.co/functions/v1/health`

**HTTP Method:** `GET`

**Rate Limit:** 300 requisições/hora por IP

**Parâmetros:** Nenhum

**Exemplo de Request:**
```bash
curl -s https://shyvzreadwnvgovgrqek.supabase.co/functions/v1/health
```

**Exemplo de Response (200):**
```json
{
  "success": true,
  "data": {
    "status": "ok",
    "timestamp": "2026-06-01T13:13:42.962Z",
    "database": {
      "connected": true,
      "latency_ms": 47
    },
    "version": "1.0.0"
  }
}
```

**Possíveis valores de `status`:**
| Valor | Significado |
|---|---|
| `ok` | Banco conectado, latência < 2s |
| `degraded` | Banco conectado, latência >= 2s |
| `down` | Banco desconectado |

---

## cadastrar

**Descrição:** Cadastra um novo participante com seus palpites

**URL:** `https://shyvzreadwnvgovgrqek.supabase.co/functions/v1/cadastrar`

**HTTP Method:** `POST`

**Rate Limit:** 10 cadastros/hora por IP

**Content-Type:** `application/json`

**Parâmetros (Body JSON):**

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `nome` | string | Sim | Nome completo (mín. 3, máx. 255 caracteres) |
| `documento` | string | Sim | CPF (11 dígitos) ou CNPJ (14 dígitos) |
| `tipo_documento` | string | Sim | `"cpf"` ou `"cnpj"` |
| `empresa` | string | Se CNPJ | Nome da empresa |
| `telefone` | string | Sim | Telefone com DDD (mín. 10 dígitos) |
| `palpites` | array | Sim | Array de palpites (ver abaixo) |

**Formato de cada palpite:**
```json
{
  "jogoId": 1,
  "casa": 2,
  "fora": 1
}
```

**Exemplo de Request:**
```bash
curl -s -X POST https://shyvzreadwnvgovgrqek.supabase.co/functions/v1/cadastrar \
  -H "Content-Type: application/json" \
  -d '{
    "nome": "João Silva",
    "documento": "01275788203",
    "tipo_documento": "cpf",
    "empresa": "",
    "telefone": "11987654321",
    "palpites": [
      { "jogoId": 1, "casa": 2, "fora": 1 }
    ]
  }'
```

**Exemplo de Response (201 - Sucesso):**
```json
{
  "success": true,
  "data": {
    "id": 26,
    "nome": "João Silva"
  }
}
```

**Exemplos de Response (Erros):**

`400` — Dados inválidos:
```json
{
  "success": false,
  "error": "Nome deve ter no mínimo 3 caracteres; CPF deve ter 11 dígitos"
}
```

`409` — Documento duplicado:
```json
{
  "success": false,
  "error": "Este CPF/CNPJ já está cadastrado"
}
```

`429` — Rate limit excedido:
```json
{
  "success": false,
  "error": "Muitas tentativas. Aguarde 1 hora."
}
```

---

## consulta

**Descrição:** Consulta dados de um participante pelo CPF/CNPJ. Retorna dados mascarados por segurança.

**URL:** `https://shyvzreadwnvgovgrqek.supabase.co/functions/v1/consulta`

**HTTP Method:** `GET`

**Rate Limit:** 100 consultas/hora por IP

**Parâmetros (Query String):**

| Parâmetro | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `documento` | string | Sim | CPF (11 dígitos) ou CNPJ (14 dígitos) |

**Exemplo de Request:**
```bash
curl -s "https://shyvzreadwnvgovgrqek.supabase.co/functions/v1/consulta?documento=01275788203"
```

**Exemplo de Response (200):**
```json
{
  "success": true,
  "data": {
    "nome": "maylon Roge",
    "documento": "*.757.882-03",
    "documento_raw": "01275788203",
    "tipo_documento": "cpf",
    "empresa": "",
    "telefone": "",
    "created_at": "2026-05-28T19:12:53.123Z",
    "palpites": [
      { "jogoId": 1, "casa": 2, "fora": 1 }
    ],
    "pontos": 0,
    "acertos_exatos": 0
  }
}
```

**Exemplo de Response (404):**
```json
{
  "success": false,
  "error": "Documento não encontrado"
}
```

---

## ranking

**Descrição:** Retorna a classificação dos participantes ordenada por pontuação. Opcionalmente retorna também resultados de jogos e status de liberação.

**URL:** `https://shyvzreadwnvgovgrqek.supabase.co/functions/v1/ranking`

**HTTP Method:** `GET`

**Rate Limit:** 50 requisições/hora por IP

**Parâmetros (Query String):**

| Parâmetro | Tipo | Obrigatório | Padrão | Descrição |
|---|---|---|---|---|
| `limit` | integer | Não | 100 | Número de participantes (máx. 1000) |
| `offset` | integer | Não | 0 | Deslocamento para paginação |
| `include_data` | boolean | Não | false | Se `true`, retorna também `resultados` e `jogos_liberados` |

**Exemplo de Request (ranking simples):**
```bash
curl -s "https://shyvzreadwnvgovgrqek.supabase.co/functions/v1/ranking?limit=5&offset=0"
```

**Exemplo de Response (200):**
```json
{
  "success": true,
  "data": {
    "ranking": [
      {
        "posicao": 1,
        "nome": "Derik Marques",
        "pontos": 0,
        "acertos_exatos": 0
      },
      {
        "posicao": 2,
        "nome": "maylon Roge",
        "pontos": 0,
        "acertos_exatos": 0
      }
    ],
    "total_participantes": 5,
    "timestamp": "2026-06-01T13:16:10.152Z"
  }
}
```

**Exemplo com `include_data=true`:**
```bash
curl -s "https://shyvzreadwnvgovgrqek.supabase.co/functions/v1/ranking?limit=1&include_data=true"
```

**Response adicional (no campo `data`):**
```json
{
  "ranking": [...],
  "total_participantes": 5,
  "resultados": [
    {
      "jogo_id": 1,
      "gols_casa": 3,
      "gols_fora": 1
    }
  ],
  "jogos_liberados": [
    {
      "jogo_id": 1,
      "liberado": true
    }
  ],
  "timestamp": "..."
}
```

---

## admin-operations

**Descrição:** Operações administrativas unificadas. Requer autenticação via JWT do Supabase Auth.

**URL:** `https://shyvzreadwnvgovgrqek.supabase.co/functions/v1/admin-operations`

**HTTP Method:** `POST`

**Rate Limit:** 1000 requisições/hora por IP

**Autenticação:** Header `Authorization: Bearer <jwt_token>` (token do Supabase Auth)

**Content-Type:** `application/json`

**Parâmetros comuns (Body JSON):**

| Campo | Tipo | Obrigatório | Descrição |
|---|---|---|---|
| `operacao` | string | Sim | Uma das operações abaixo |

---

### Operação: `listar_participantes`

Retorna a lista completa de todos os participantes cadastrados.

**Body:**
```json
{
  "operacao": "listar_participantes"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "participantes": [
      {
        "id": 3,
        "nome": "Derik Marques",
        "documento": "01275788203",
        "tipo_documento": "cpf",
        "empresa": "",
        "telefone": "11987654321",
        "created_at": "2026-05-28T19:12:53.123Z",
        "palpites": [...],
        "pontos": 0,
        "acertos_exatos": 0
      }
    ]
  }
}
```

---

### Operação: `salvar_resultado`

Salva ou atualiza o resultado de um jogo.

**Body:**
```json
{
  "operacao": "salvar_resultado",
  "jogo_id": 1,
  "gols_casa": 3,
  "gols_fora": 1
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "jogo_id": 1,
    "gols_casa": 3,
    "gols_fora": 1
  }
}
```

---

### Operação: `liberar_jogo`

Libera ou bloqueia um jogo para receber palpites.

**Body:**
```json
{
  "operacao": "liberar_jogo",
  "jogo_id": 1,
  "liberado": true
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "jogo_id": 1,
    "liberado": true
  }
}
```

---

## Códigos de Status HTTP

| Código | Significado |
|---|---|
| `200` | Sucesso |
| `201` | Criado com sucesso (cadastrar) |
| `400` | Dados inválidos ou parâmetros ausentes |
| `401` | Token de autenticação ausente ou inválido (admin-operations) |
| `404` | Recurso não encontrado (consulta) |
| `409` | Conflito — documento duplicado (cadastrar) |
| `415` | Content-Type inválido (não é application/json) |
| `429` | Rate limit excedido |
| `500` | Erro interno do servidor |

## Formato Padrão de Resposta

**Sucesso:**
```json
{
  "success": true,
  "data": { ... }
}
```

**Erro:**
```json
{
  "success": false,
  "error": "Mensagem descritiva do erro"
}
```
