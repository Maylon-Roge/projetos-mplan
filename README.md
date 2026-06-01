# Bolão Copa do Mundo 2026 — Planeta Energia

Sistema de bolão virtual para a Copa do Mundo 2026, promovido pela **Planeta Energia**.

## 📋 Funcionalidades

- **Cadastro de participantes** com palpites nos jogos do Brasil
- **Consulta** de palpites por CPF/CNPJ
- **Ranking** ao vivo com pontuação
- **Painel admin** para gerenciar resultados, liberar jogos e apuração
- **Proteção** contra duplicatas, rate limiting e dados sensíveis mascarados

## 🏗️ Arquitetura

```
[Frontend HTML/CSS/JS] → [Supabase Edge Functions] → [Supabase PostgreSQL]
                                  ↕
                        [Variáveis de Ambiente]
                        SUPABASE_URL
                        SUPABASE_SERVICE_ROLE_KEY
```

As 3 páginas HTML chamam exclusivamente as Edge Functions — a chave anônima do Supabase **não fica exposta** no frontend público.

## ⚙️ Pré-requisitos

- Projeto no [Supabase](https://supabase.com)
- As seguintes tabelas no banco:
  - `participantes`
  - `resultados`
  - `jogos_liberados`
  - `rate_limits`
  - `audit_logs`

## 🚀 Edge Functions

5 funções implantadas no Supabase:

| Função | Método | Descrição |
|---|---|---|
| `health` | GET | Health check + teste de conexão com banco |
| `cadastrar` | POST | Cadastro de participante com palpites |
| `consulta` | GET | Consulta por CPF/CNPJ |
| `ranking` | GET | Ranking com pontuação (+ dados públicos opcionais) |
| `admin-operations` | POST | Operações administrativas (autenticado via JWT) |

Documentação completa da API: [`EDGE_FUNCTIONS_API.md`](EDGE_FUNCTIONS_API.md)

## 🔐 Variáveis de Ambiente

Configuradas nas Secrets das Edge Functions no Dashboard do Supabase:

| Variável | Valor | Origem |
|---|---|---|
| `SUPABASE_URL` | `https://shyvzreadwnvgovgrqek.supabase.co` | Injetada automaticamente |
| `SUPABASE_SERVICE_ROLE_KEY` | `sb_secret_***` | Configurar manualmente |

## 📄 Páginas Frontend

| Arquivo | Descrição | Chave Anônima |
|---|---|---|
| `bolao-copa-visual-v2.html` | Página pública — cadastro + ranking | ❌ Removida |
| `bolao-copa-consulta.html` | Consulta de palpites por CPF/CNPJ | ❌ Removida |
| `bolao-copa-admin.html` | Painel administrativo | ⚠️ Apenas no login (necessário) |

## 🧪 Testes Rápidos

```bash
# Health check
curl -s https://shyvzreadwnvgovgrqek.supabase.co/functions/v1/health

# Ranking
curl -s "https://shyvzreadwnvgovgrqek.supabase.co/functions/v1/ranking?limit=5"

# Cadastrar (substitua o CPF)
curl -s -X POST https://shyvzreadwnvgovgrqek.supabase.co/functions/v1/cadastrar \
  -H "Content-Type: application/json" \
  -d '{"nome":"Teste","documento":"CPF_VALIDO","tipo_documento":"cpf","empresa":"","telefone":"11987654321","palpites":[{"jogoId":1,"casa":2,"fora":1}]}'

# Consultar
curl -s "https://shyvzreadwnvgovgrqek.supabase.co/functions/v1/consulta?documento=01275788203"
```

## 📁 Estrutura do Projeto

```
/opt/data/projetos-mplan/
├── bolao-copa-visual-v2.html      # Página pública principal
├── bolao-copa-admin.html          # Painel admin
├── bolao-copa-consulta.html       # Consulta pública
├── EDGE_FUNCTIONS_API.md          # Documentação da API
├── README.md                      # Este arquivo
├── tests.sh                       # Script de testes curl
├── supabase/
│   ├── functions/
│   │   ├── health/index.ts
│   │   ├── cadastrar/index.ts
│   │   ├── consulta/index.ts
│   │   ├── ranking/index.ts
│   │   └── admin-operations/index.ts
│   └── migrations/                # Scripts SQL do banco
└── supabase-cpf-validation.sql    # Trigger de validação de CPF
```

## 🛡️ Segurança

- **Rate limiting** por IP em todas as funções
- **Documento mascarado** na consulta pública
- **CPF/CNPJ validados** matematicamente (trigger no banco)
- **Duplicatas bloqueadas** antes da inserção
- **Admin JWT** obrigatório para operações administrativas
- **Logs de auditoria** em todas as operações admin
- **Nenhuma chave exposta** no frontend público

## 👨‍💻 Manutenção

### Redeploy de uma Edge Function
1. Dashboard do Supabase > Edge Functions
2. Clique na função > Editar código
3. Cole o novo código > Deploy

### Adicionar/alterar variáveis de ambiente
1. Dashboard > Edge Functions > Settings (ou Project Settings)
2. Seção Environment Variables
3. Adicione ou edite a variável
4. Faça redeploy das funções afetadas
