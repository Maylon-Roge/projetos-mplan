# Resumo Técnico — Segurança do Bolão Copa 2026

## Contexto
Sistema de bolão virtual para a Copa do Mundo 2026, com 3 páginas HTML estáticas hospedadas no GitHub Pages. Atualmente o front-end se conecta **diretamente ao Supabase** usando uma chave anônima exposta no código.

## O Problema de Segurança
A chave `sb_publishable_...` (pública) está visível no HTML de todas as páginas. Qualquer pessoa com F12 consegue:
- Ver a chave anônima
- Fazer consultas diretas à API do Supabase
- Listar todos os participantes (nomes, CPFs, telefones)

O que protege hoje:
- **RLS (Row Level Security):** apenas INSERT e SELECT são permitidos com a chave anônima
- **Trigger de CPF:** valida dígitos verificadores antes de salvar

O que NÃO protege:
- Qualquer um pode ler a tabela inteira de participantes via console do navegador
- Não há rate limiting (alguém pode fazer milhares de requisições)
- A chave anônima não pode ser trocada sem atualizar o HTML

## Solução Proposta: Supabase Edge Functions

Criar uma camada de API entre o navegador e o banco de dados, usando o próprio recurso serverless do Supabase (Edge Functions em Deno/TypeScript).

### Arquitetura Atual vs Proposta

**ATUAL:**
```
[Navegador] 
  └── HTML com chave anônima exposta
        └── fetch() direto para Supabase REST API
              └── Banco (protegido apenas por RLS)
```

**PROPOSTA:**
```
[Navegador]
  └── HTML sem chave alguma
        └── fetch() para Edge Functions (URLs públicas)
              └── Funções validam, filtram e logam
                    └── Chamam banco com chave secreta (service_role)
                          └── Banco
```

### Vantagens
1. **Chave secreta nunca sai do servidor** — não tem como capturar
2. **Controle total dos dados** — cada endpoint retorna exatamente o que precisa
3. **Rate limiting** — possível de implementar por IP
4. **Logs e auditoria** — cada requisição pode ser registrada
5. **Nenhuma dependência extra** — tudo dentro do Supabase, sem servidor externo

### Desvantagens
1. **Precisa instalar Supabase CLI** para fazer deploy das functions
2. **Código em Deno/TypeScript** (runtime diferente de Node.js)
3. **Tempo de implementação:** ~3-4 horas
4. **Limite gratuito:** 500 mil requisições/mês (para este volume é suficiente)

## Endpoints Propostos (7 functions)

### Públicos (sem autenticação)

| Endpoint | Método | Função | Dados que retorna |
|---|---|---|---|
| `/functions/v1/cadastrar` | POST | Cadastrar novo participante | Apenas sucesso/erro |
| `/functions/v1/consulta?cpf=X` | GET | Buscar dados de 1 CPF específico | Dados do participante + resultados dos jogos |
| `/functions/v1/ranking` | GET | Ranking público | Lista de {nome, qtd_palpites} — **sem CPF/telefone** |

### Administrativos (requerem JWT)

| Endpoint | Método | Função |
|---|---|---|
| `/functions/v1/admin-login` | POST | Autenticar admin (email + senha) |
| `/functions/v1/admin-resultados` | POST | Salvar resultado de um jogo |
| `/functions/v1/admin-liberar` | POST | Liberar/bloquear jogo para palpites |
| `/functions/v1/admin-participantes` | GET | Listar todos os participantes (admin) |

## O que muda no Front-end

Cada página HTML precisa trocar as chamadas diretas ao Supabase por chamadas às Edge Functions:

**Antes (código atual):**
```javascript
await supabaseInsert('participantes', dados)
// Chave anônima no código: sb_publishable_...
```

**Depois:**
```javascript
await fetch('https://projeto.supabase.co/functions/v1/cadastrar', {
  method: 'POST',
  body: JSON.stringify(dados)
})
// Nenhuma chave no código
```

## E o RLS?

Com as Edge Functions, o RLS perde importância porque:
- A chave anônima some do front-end
- As functions usam `service_role` (bypassa RLS)
- O RLS vira segurança extra (defense-in-depth), não a principal

É possível até desativar SELECT público na tabela `participantes` depois da migração.

## Passos para Implementar

1. Instalar Supabase CLI (`npm install -g supabase`)
2. Vincular ao projeto (`supabase link --project-ref shyvz...`)
3. Criar 7 arquivos TypeScript (um para cada endpoint)
4. Fazer deploy (`supabase functions deploy`)
5. Atualizar as 3 páginas HTML para chamar as functions
6. Remover a chave anônima do HTML
7. Testar fluxo completo
8. (Opcional) Ajustar RLS para bloquear SELECT direto

Tempo estimado: **3 a 4 horas**

## Links Úteis
- Supabase Dashboard: https://supabase.com/dashboard/project/shyvzreadwnvgovgrqek
- Projeto GitHub Pages: https://maylon-roge.github.io/projetos-mplan/
- Admin: https://maylon-roge.github.io/projetos-mplan/bolao-copa-admin.html
- Documentação Edge Functions: https://supabase.com/docs/guides/functions
