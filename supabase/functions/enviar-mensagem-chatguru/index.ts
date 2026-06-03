// POST /enviar-mensagem-chatguru — Envia mensagens WhatsApp via ChatGuru API
// Usa dialog_execute com template aprovado pela Meta
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, authorization',
}

// Credenciais ChatGuru (via env vars ou fallback)
const CHATGURU_API = Deno.env.get('CHATGURU_API') || 'https://app3.zap.guru/api/v1'
const CHATGURU_KEY = Deno.env.get('CHATGURU_KEY') || 'BTZP3ONB5WTZ9N12W8GHBOFHK0ZTIURPGA5CDIH7FAZFV1460KA00TUHHBDCZUM0'
const CHATGURU_ACCOUNT_ID = Deno.env.get('CHATGURU_ACCOUNT_ID') || '5e5ab0be696c6b7582b7a1af'
const CHATGURU_PHONE_ID = Deno.env.get('CHATGURU_PHONE_ID') || '688b55d066c21a08583dae29'
const DIALOGO_BOAS_VINDAS = Deno.env.get('DIALOGO_BOAS_VINDAS') || '6a1efaa4776f0ae2486325a4'

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

    // Executa diálogo com template aprovado (inicia conversa mesmo para contatos novos)
    const params = new URLSearchParams()
    params.append('action', 'dialog_execute')
    params.append('dialog_id', DIALOGO_BOAS_VINDAS)
    params.append('key', CHATGURU_KEY)
    params.append('account_id', CHATGURU_ACCOUNT_ID)
    params.append('phone_id', CHATGURU_PHONE_ID)
    params.append('chat_number', chat_number)

    console.log(`📤 Executando diálogo ${DIALOGO_BOAS_VINDAS} para ${chat_number}...`)
    const res = await fetch(CHATGURU_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params
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
