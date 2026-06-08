// POST /enviar-mensagem-chatguru — Envia mensagens WhatsApp via ChatGuru API
// Usa dialog_execute com template aprovado pela Meta
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, authorization',
}

// Credenciais ChatGuru (APENAS env vars — sem fallback hardcoded por segurança)
const CHATGURU_API = Deno.env.get('CHATGURU_API') || 'https://app3.zap.guru/api/v1'
const CHATGURU_KEY = Deno.env.get('CHATGURU_KEY') || ''
const CHATGURU_ACCOUNT_ID = Deno.env.get('CHATGURU_ACCOUNT_ID') || ''
const CHATGURU_PHONE_ID = Deno.env.get('CHATGURU_PHONE_ID') || ''
const DIALOGO_BOAS_VINDAS = Deno.env.get('DIALOGO_BOAS_VINDAS') || ''

if (!CHATGURU_KEY || !CHATGURU_ACCOUNT_ID || !CHATGURU_PHONE_ID || !DIALOGO_BOAS_VINDAS) {
  console.error('❌ CHATGURU_KEY, CHATGURU_ACCOUNT_ID, CHATGURU_PHONE_ID ou DIALOGO_BOAS_VINDAS nao configurados')
}

// Normaliza telefone brasileiro: ChatGuru remove 9 extra de celular
// Ex: 5591982422765 → 559182422765
function normalizarTelefone(tel: string): string {
  const n = tel.replace(/\D/g, '')
  let num = n.startsWith('55') ? n : `55${n}`
  // Se tem 13 dígitos e o 5º dígito (após DDD) é 9, remove o 9
  // Padrão BR: 55 + DDD(2) + 9 + número(8) = 13 dígitos
  if (num.length === 13 && num[4] === '9') {
    num = num.slice(0, 4) + num.slice(5) // remove o 9
  }
  return num
}

serve(async (req) => {
  if (req.method === 'OPTIONS')
    return new Response(null, { status: 204, headers: corsHeaders })
  if (req.method !== 'POST')
    return new Response(JSON.stringify({ error: 'Método não permitido' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  try {
    const { telefone, tipo_mensagem, dados } = await req.json()
    if (!telefone || !tipo_mensagem)
      return new Response(JSON.stringify({ error: 'telefone e tipo_mensagem obrigatórios' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const chat_number = normalizarTelefone(telefone)
    console.log(`📨 [ChatGuru] ${tipo_mensagem} → ${telefone} (norm: ${chat_number})`)

    // PASSO 1: Atualizar contexto com as variáveis do template
    const ctxParams = new URLSearchParams()
    ctxParams.append('action', 'chat_update_context')
    ctxParams.append('key', CHATGURU_KEY)
    ctxParams.append('account_id', CHATGURU_ACCOUNT_ID)
    ctxParams.append('phone_id', CHATGURU_PHONE_ID)
    ctxParams.append('chat_number', chat_number)

    if (dados) {
      if (dados.gols_casa !== undefined) ctxParams.append('var__1', String(dados.gols_casa))
      if (dados.gols_fora !== undefined) ctxParams.append('var__2', String(dados.gols_fora))
      if (dados.adversario) ctxParams.append('var__3', dados.adversario)
      if (dados.nome) ctxParams.append('var__4', dados.nome)
      if (dados.cupom) ctxParams.append('var__5', dados.cupom)
    }

    console.log(`📤 Atualizando contexto para ${chat_number}...`)
    const ctxRes = await fetch(CHATGURU_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: ctxParams
    })
    const ctxData = await ctxRes.json()
    console.log(`📬 Contexto:`, JSON.stringify(ctxData))

    if (ctxData.result === 'error') {
      return new Response(JSON.stringify({
        success: false,
        error: ctxData.description || 'Erro ao atualizar contexto',
        step: 'chat_update_context'
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // PASSO 2: Executar diálogo com template
    const dialogParams = new URLSearchParams()
    dialogParams.append('action', 'dialog_execute')
    dialogParams.append('dialog_id', DIALOGO_BOAS_VINDAS)
    dialogParams.append('key', CHATGURU_KEY)
    dialogParams.append('account_id', CHATGURU_ACCOUNT_ID)
    dialogParams.append('phone_id', CHATGURU_PHONE_ID)
    dialogParams.append('chat_number', chat_number)

    console.log(`📤 Executando diálogo ${DIALOGO_BOAS_VINDAS} para ${chat_number}...`)
    const res = await fetch(CHATGURU_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: dialogParams
    })
    const data = await res.json()
    console.log(`📬 Resposta:`, JSON.stringify(data))

    if (data.result === 'error') {
      return new Response(JSON.stringify({
        success: false,
        error: data.description || 'Erro ao executar diálogo',
        code: data.code
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({
      success: true,
      dialog_execution: data.dialog_execution_return,
      tipo_mensagem,
      telefone: chat_number
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e) {
    console.error('❌', e.message)
    return new Response(JSON.stringify({ success: false, error: e.message }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
