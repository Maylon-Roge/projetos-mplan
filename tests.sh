#!/bin/bash
# ============================================
# TESTES CURL — Edge Functions Bolão Copa 2026
# ============================================

API_BASE="https://shyvzreadwnvgovgrqek.supabase.co/functions/v1"

echo "============================================"
echo "  TESTE 1: Health Check"
echo "============================================"
curl -s "${API_BASE}/health" | python3 -m json.tool 2>/dev/null
echo ""

echo "============================================"
echo "  TESTE 2: Cadastrar (CPF inválido)"
echo "============================================"
curl -s -X POST "${API_BASE}/cadastrar" \
  -H "Content-Type: application/json" \
  -d '{"nome":"Teste","documento":"11111111111","tipo_documento":"cpf","empresa":"","telefone":"11987654321","palpites":[{"jogoId":1,"casa":2,"fora":1}]}' | python3 -m json.tool 2>/dev/null
echo ""

echo "============================================"
echo "  TESTE 3: Cadastrar (válido)"
echo "============================================"
curl -s -X POST "${API_BASE}/cadastrar" \
  -H "Content-Type: application/json" \
  -d '{"nome":"João Silva","documento":"01275788203","tipo_documento":"cpf","empresa":"","telefone":"11987654321","palpites":[{"jogoId":1,"casa":2,"fora":1}]}' | python3 -m json.tool 2>/dev/null
echo ""

echo "============================================"
echo "  TESTE 4: Consultar"
echo "============================================"
curl -s "${API_BASE}/consulta?documento=01275788203" | python3 -m json.tool 2>/dev/null
echo ""

echo "============================================"
echo "  TESTE 5: Ranking"
echo "============================================"
curl -s "${API_BASE}/ranking?limit=10&offset=0" | python3 -m json.tool 2>/dev/null
echo ""
