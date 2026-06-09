# 🏆 BOLÃO COPA 2026 — RESUMO COMPLETO

**Data:** 02/06/2026
**Status:** ✅ MVP Completo | 95% testes aprovados | Zero bugs

---

## 📂 Arquivos

| Arquivo | Função |
|---------|--------|
| `bolao-copa-visual-v2.html` | Página pública (cadastro, palpites, regras) |
| `bolao-copa-backoffice-secret-2024.html` | Admin oculto |
| `bolao-copa-planeta.html` | Página antiga (Planeta Energia) |

## ⚡ Edge Functions (Supabase)

| Função | URL | Descrição |
|--------|-----|-----------|
| `/login` | `POST` | Login JWT com SERVICE_ROLE_KEY |
| `/cadastrar` | `POST` | CPF/CNPJ valida dígitos, merge por rodada |
| `/consulta` | `GET` | Consultar participante (CPF mascarado) |
| `/ranking` | `GET` | Ranking (não usado) |
| `/health` | `GET` | Monitoramento |
| `/admin-operations` | `POST` | 5 operações + cupons |
| `/limpar-banco-total` | `POST` | Limpa todas as tabelas |
| `/consultar-cnpj` | `POST` | Proxy ReceitaWS (bloqueada Cloudflare) |

## 🗄️ Tabelas (Supabase)

`participantes`, `resultados`, `jogos_liberados`, `vencedores_desconto`, `rate_limits`, `audit_logs`

## 🔒 Segurança

- Anon key removida do HTML
- Login via Edge Function (SERVICE_ROLE_KEY no backend)
- Admin renomeado para URL oculta
- Verify JWT = OFF nas funções públicas
- Links admin removidos da página pública

## 🎯 Sistema de Desconto

- 20% desconto por acertar placar EXATO
- Cupom único: `BOLAO-J{jogo}-{random}`
- Válido 30 dias, não acumulativo
- Múltiplos ganhadores por jogo
- Geração automática ao salvar resultado

## ✅ Correções aplicadas

1. Chave anon removida do HTML
2. `jogo_id` padronizado (vs `jogoId`) — mensagem de erro mostra ID correto
3. Validação CPF/CNPJ com dígitos verificadores (frontend + backend)
4. Admin renomeado para URL oculta
5. CNPJ: fallback para digitação manual (ReceitaWS bloqueada)

## 📊 Testes — 95%

- Segurança: ✅ 3/3
- Sistema Desconto: ✅ 7/7
- CNPJ Validation: ✅ 3/3
- Funcionalidades: ✅ 3/4
- Admin Operations: ✅ 3/3
- Cupons: ✅ 2/2

## 🔗 URLs

- Página pública: `https://maylon-roge.github.io/projetos-mplan/bolao-copa-visual-v2.html`
- Admin (oculto): `https://maylon-roge.github.io/projetos-mplan/bolao-copa-backoffice-secret-2024.html`
- Supabase Dashboard: `https://app.supabase.com/project/shyvzreadwnvgovgrqek`
- Repositório: `https://github.com/Maylon-Roge/projetos-mplan`
