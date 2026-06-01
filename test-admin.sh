#!/bin/bash
# ============================================
# TESTES ADMIN — Bolão Copa 2026
# ============================================
# COMO USAR:
#   1. Primeiro, defina o token:
#      TOKEN="seu_jwt_aqui"
#
#   2. Depois execute os testes:
#      source test-admin.sh
# ============================================

API="https://shyvzreadwnvgovgrqek.supabase.co/functions/v1"

if [ -z "$TOKEN" ]; then
  echo "❌ ERRO: Defina o TOKEN primeiro!"
  echo "   Exemplo: TOKEN=\"eyJ...\" bash test-admin.sh"
  exit 1
fi

echo "╔══════════════════════════════════════════════╗"
echo "║  TESTES ADMIN — Bolão Copa 2026              ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

echo "─── OPERAÇÃO 1: Listar Participantes ───"
curl -s -X POST "${API}/admin-operations" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"operacao": "listar_participantes"}' | python3 -m json.tool
echo ""

echo "─── OPERAÇÃO 2: Salvar Resultado (Jogo 1: Brasil 2×1 Marrocos) ───"
curl -s -X POST "${API}/admin-operations" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "operacao": "salvar_resultado",
    "jogo_id": 1,
    "gols_casa": 2,
    "gols_fora": 1
  }' | python3 -m json.tool
echo ""

echo "─── OPERAÇÃO 3: Liberar Jogo 2 (Brasil × Haiti) ───"
curl -s -X POST "${API}/admin-operations" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "operacao": "liberar_jogo",
    "jogo_id": 2,
    "liberado": true
  }' | python3 -m json.tool
echo ""

echo "─── OPERAÇÃO 4: Bloquear Jogo 2 ───"
curl -s -X POST "${API}/admin-operations" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "operacao": "liberar_jogo",
    "jogo_id": 2,
    "liberado": false
  }' | python3 -m json.tool
echo ""

echo "─── OPERAÇÃO 5: Verificar resultado salvo (via ranking) ───"
curl -s "${API}/ranking?limit=1&include_data=true" | python3 -m json.tool
echo ""
