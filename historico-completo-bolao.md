# Histórico Completo do Projeto — Bolão Copa 2026

## 1. O Que é o Projeto

Sistema de bolão virtual para a Copa do Mundo 2026, promovido pela **Planeta Energia** (distribuidora de materiais elétricos). Os participantes cadastram CPF/CNPJ e fazem palpites nos 8 jogos do Brasil na Copa. Há premiação em vale-compras para os 3 primeiros colocados.

## 2. Tecnologias Utilizadas

| Componente | Escolha |
|---|---|
| **Front-end** | HTML + CSS + JavaScript puro (3 páginas) |
| **Hospedagem** | GitHub Pages (maylon-roge.github.io/projetos-mplan/) |
| **Back-end / Banco** | Supabase (PostgreSQL) |
| **Autenticação Admin** | Supabase Auth (email + senha) |

## 3. As 3 Páginas HTML

### Página Principal (bolao-copa-visual-v2.html)
- Landing page com identidade visual da Planeta Energia
- Topo: top bar amarela + header azul com logo
- Seções: Como Funciona, Premiações, Jogos do Brasil, Ranking, Regulamento
- Formulário de cadastro com CPF/CNPJ + palpites (inputs de placar)
- Apenas o 1º jogo (Brasil x Marrocos) fica disponível inicialmente
- Os demais são liberados pelo admin progressivamente

### Página Admin (bolao-copa-admin.html)
- Login via email + senha (Supabase Auth)
- Abas: Gerenciar Jogos, Participantes, Apuração, Finalizar
- Admin registra resultados dos jogos (gols_casa x gols_fora)
- Admin libera/bloqueia jogos para palpites
- Apuração calcula pontuação (5pts placar exato, 3pts vencedor)
- Relatório final para impressão/PDF

### Página Consulta (bolao-copa-consulta.html)
- Busca por CPF/CNPJ
- Retorna os palpites do participante com acertos/erros
- Mostra resumo: total de jogos, acertos, pontos

## 4. Histórico de Evolução

### Fase 1 — Criação Inicial
- Sistema 100% client-side com localStorage
- Validação de CPF apenas por quantidade de dígitos (11 ou 14)
- Layout esportivo genérico

### Fase 2 — Redesign Visual Planeta Energia
- Cores: azul #003a70, amarelo #fbd70e
- Fontes: Montserrat + Inter
- Logo oficial da Planeta Energia
- Top bar amarela com informações de contato
- Responsivo para celular, tablet e desktop
- Bandeiras via flagcdn.com (CDN)

### Fase 3 — Correções de Dados
- Função `getPalpiteGols()` para compatibilidade entre formatos de palpite (casa/fora, gols_brasil/gols_adversario, etc)
- Removidas todas as referências a "Master Plan"
- Adicionado endereço da loja nos rodapés: Av. Senador Lemos, 2247 — Telégrafo, Belém-PA

### Fase 4 — Migração para Supabase
- Tabela `participantes`: id, nome, documento (UNIQUE), tipo_documento, empresa, telefone, palpites (JSONB), pontos, acertos_exatos, created_at
- Tabela `resultados`: jogo_id (PK), gols_casa, gols_fora, updated_at
- Tabela `jogos_liberados`: jogo_id (PK), liberado (boolean)
- Dados iniciais: 8 jogos do Brasil, apenas jogo 1 liberado
- RLS Policies configuradas (INSERT/SELECT público, UPDATE/INSERT só autenticado)
- Admin login via Supabase Auth (JWT em sessionStorage)
- Funções helper: supabaseGet, supabaseInsert, supabasePatch, supabaseAuth

### Fase 5 — Validação de CPF/CNPJ (Dupla Camada)
- **Trigger no PostgreSQL:** valida dígitos verificadores antes de INSERT
- **Front-end:** funções validarCPF() e validarCNPJ() com feedback instantâneo
- Rejeita sequências repetidas (111.111.111-11, 222.222.222-22)

## 5. Situação Atual — O Problema de Segurança

**O que funciona hoje:**
- ✅ Cadastro vai direto para o Supabase
- ✅ Admin autentica via Supabase Auth
- ✅ CPF/CNPJ validado no banco (trigger)
- ✅ Dados persistem corretamente

**O que NÃO está ideal:**
- ❌ A chave anônima do Supabase está visível no HTML (sb_publishable_...)
- ❌ Qualquer um com F12 pode ler a tabela de participantes via console
- ❌ Não há rate limiting (alguém pode fazer milhares de requisições)
- ❌ O front-end chama o banco diretamente, sem camada intermediária

## 6. A Solução Proposta — Edge Functions

Criar uma camada de API entre o navegador e o banco:

```
ANTES:  [Navegador] → chave exposta → [Supabase REST API] → [Banco]
DEPOIS: [Navegador] → sem chave → [Edge Functions] → [Banco (service_role)]
```

### Endpoints Propostos

**Públicos:**
- `POST /functions/v1/cadastrar` — Cadastrar participante
- `GET /functions/v1/consulta?cpf=X` — Consultar por CPF
- `GET /functions/v1/ranking` — Ranking público (sem CPF/telefone)

**Admin (requer JWT):**
- `POST /functions/v1/admin-login` — Login
- `POST /functions/v1/admin-resultados` — Salvar resultado
- `POST /functions/v1/admin-liberar` — Liberar/bloquear jogo
- `GET /functions/v1/admin-participantes` — Listar participantes

### Vantagens
- Chave secreta nunca sai do servidor
- Controle total sobre dados retornados
- Rate limiting por IP
- Logs de auditoria
- Tudo dentro do Supabase (sem servidor extra)

## 7. Discussão Atual — Plano Apresentado por Terceiro vs Minha Opinião

### O plano proposto (resumo):
- 14 execuções em 5 fases (~4 horas)
- Criar novo esquema de banco (tabelas novas, formato 1/X/2 para palpites)
- Autenticação JWT customizada (bcrypt + tokens próprios)
- Redis para rate limiting
- Testes unitários completos
- Infrastructure para 5.000 participantes

### Minha avaliação:

**Pontos positivos do plano:**
- Bem organizado em fases
- Boas práticas de segurança
- Logging e rate limiting corretos

**Problemas que identifiquei:**

1. **Ignora o que já existe** — o plano cria tabelas novas, mas já temos tabelas funcionando com dados reais. Refazer do zero quebra o sistema atual e perde dados.

2. **Muda o formato dos palpites** — o plano propõe `1/X/2` (vitória/empate/derrota), mas o sistema atual usa **placares exatos** (ex: 2x1). A pontuação atual (5pts placar exato, 3pts vencedor) só funciona com placares.

3. **Cria autenticação própria desnecessária** — o plano cria tabela admin_users com bcrypt + JWT customizado, mas **o Supabase Auth já faz isso**.

4. **Super-dimensionado** — Redis, materialized views, refresh tokens, exponential backoff com 3 retries... Para um bolão com dezenas/centenas de participantes, é complexidade desnecessária.

### Minha sugestão (plano enxuto):
- Manter o banco atual (tabelas e formato de dados)
- Criar apenas 4 Edge Functions (cadastrar, consulta, ranking, admin-operations)
- Rate limit via SQL (sem Redis)
- Manter Supabase Auth (sem auth customizada)
- Testes manuais com curl (sem suite automatizada)
- **Tempo estimado: ~1h45**

## 8. Links

- Bolão: https://maylon-roge.github.io/projetos-mplan/bolao-copa-visual-v2.html
- Admin: https://maylon-roge.github.io/projetos-mplan/bolao-copa-admin.html
- Consulta: https://maylon-roge.github.io/projetos-mplan/bolao-copa-consulta.html
- Supabase Dashboard: https://supabase.com/dashboard/project/shyvzreadwnvgovgrqek
- Repositório GitHub: https://github.com/Maylon-Roge/projetos-mplan
