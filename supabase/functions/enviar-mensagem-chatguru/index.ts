// POST /enviar-mensagem-chatguru — Envia mensagens WhatsApp via ChatGuru API
// Documentacao: action=message_send, text, key, account_id, phone_id, chat_number
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, authorization',
}

const CHATGURU_API = Deno.env.get('CHATGURU_API') || 'https://app3.zap.guru/api/v1'
const CHATGURU_KEY = Deno.env.get('CHATGURU_KEY') || 'MG93D9YGMWZCS4IS6051RSGOPFV9VU5KJHS5JM6F19S4Y1RKRGKK4YAA31LL125QRH'
const CHATGURU_ACCOUNT_ID = Deno.env.get('CHATGURU_ACCOUNT_ID') || '5e5ab0be696c6b7582b7a1af'
const CHATGURU_PHONE_ID = Deno.env.get('CHATGURU_PHONE_ID') || '688b55d066c21a08583dae29'

serve(async (req) => {
  if (req.method === 'OPTIONS')
    return new Response(null, { status: 204, headers: corsHeaders })
  if (req.method !== 'POST')
    return new Response(JSON.stringify({ error: 'Método não permitido' }), { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  try {
    const { telefone, tipo_mensagem, dados } = await req.json()
    if (!telefone || !tipo_mensagem)
      return new Response(JSON.stringify({ error: 'telefone e tipo_mensagem obrigatórios' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    console.log(`📨 [ChatGuru] ${tipo_mensagem} → ${telefone}`)

    // Montar mensagem
    let texto = ''
    if (tipo_mensagem === 'boas_vindas') {
      const { nome, palpites } = dados
      let txt = ''
      if (Array.isArray(palpites)) {
        palpites.forEach((p: any) => {
          txt += `\n⚽ Jogo ${p.jogo_id || '?'}: ${p.gols_casa || '?'}x${p.gols_fora || '?'}`
        })
      }
      texto = `🏆 Olá ${nome}!\nBem-vindo ao *Bolão Copa 2026* da Planeta Energia!\n\n📊 Seus palpites:${txt}\n\n🍀 Boa sorte!\n\n#BolãoCopa2026`
    } else if (tipo_mensagem === 'acerto') {
      const { nome, placar, palpite, cupom, desconto } = dados
      texto = `🎉 *PARABÉNS ${nome}!*\n\nVocê acertou o palpite! 🎯\n\n📊 Resultado: ${placar}\n🎲 Seu palpite: ${palpite}\n\n💝 *PRÊMIO: ${desconto || 20}% DE DESCONTO!*\n\n🎁 Cupom: *${cupom}*\nValidade: 30 dias\n\n🛍️ Aproveite na Planeta Energia!\n\n#BolãoCopa2026`
    }

    if (!texto)
      return new Response(JSON.stringify({ error: 'Tipo de mensagem inválido' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    // Normalizar telefone
    const tel = telefone.replace(/\D/g, '')
    const chat_number = tel.startsWith('55') ? tel : `55${tel}`

    // Enviar via API ChatGuru (form-urlencoded conforme documentação)
    const params = new URLSearchParams()
    params.append('action', 'message_send')
    params.append('text', texto)
    params.append('key', CHATGURU_KEY)
    params.append('account_id', CHATGURU_ACCOUNT_ID)
    params.append('phone_id', CHATGURU_PHONE_ID)
    params.append('chat_number', chat_number)

    console.log(`📤 Enviando para ${chat_number}...`)
    const res = await fetch(CHATGURU_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params
    })
    const data = await res.json()
    console.log(`📬 Resposta:`, JSON.stringify(data))

    if (!res.ok || data.result === 'error') {
      const msg = data.description || `HTTP ${res.status}`
      // Se nao autorizado, informa que precisa habilitar modulo de API
      if (data.description?.includes('não autorizado')) {
        return new Response(JSON.stringify({
          success: false,
          error: 'API ChatGuru não autorizada. Habilite o módulo de API em Configurações > Módulos.',
          code: 'API_UNAUTHORIZED'
        }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      return new Response(JSON.stringify({ success: false, error: msg }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    return new Response(JSON.stringify({ success: true, tipo_mensagem, telefone: chat_number }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e) {
    console.error('❌', e.message)
    return new Response(JSON.stringify({ success: false, error: e.message }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
