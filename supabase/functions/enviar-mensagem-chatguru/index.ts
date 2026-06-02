// POST /enviar-mensagem-chatguru — Envia mensagens WhatsApp via ChatGuru API
// Tipos: boas_vindas (após cadastro) | acerto (após resultado)
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, authorization',
}

// Credenciais ChatGuru (ideal: mover para env vars futuramente)
const CHATGURU_API = Deno.env.get('CHATGURU_API') || 'https://app3.zap.guru/api/v1'
const CHATGURU_API_KEY = Deno.env.get('CHATGURU_API_KEY') || 'MG93D9YGMWZCS4IS6051RSGOPFV9VU5KJHS5JM6F19S4Y1RKRGKK4YAA31LL125QRH'
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
    let mensagem = ''
    if (tipo_mensagem === 'boas_vindas') {
      const { nome, palpites } = dados
      let txt = ''
      if (Array.isArray(palpites)) {
        palpites.forEach((p: any) => {
          txt += `\n⚽ Jogo ${p.jogo_id || '?'}: ${p.gols_casa || '?'}x${p.gols_fora || '?'}`
        })
      }
      mensagem = `🏆 Olá ${nome}!%0ABem-vindo ao *Bolão Copa 2026* da Planeta Energia!%0A%0A📊 Seus palpites:${txt}%0A%0A🍀 Boa sorte!%0A%0A#BolãoCopa2026`
    } else if (tipo_mensagem === 'acerto') {
      const { nome, placar, palpite, cupom, desconto } = dados
      mensagem = `🎉 *PARABÉNS ${nome}!*%0A%0AVocê acertou o palpite! 🎯%0A%0A📊 Resultado: ${placar}%0A🎲 Seu palpite: ${palpite}%0A%0A💝 *PRÊMIO: ${desconto || 20}% DE DESCONTO!*%0A%0A🎁 Cupom: *${cupom}*%0AValidade: 30 dias%0A%0A🛍️ Aproveite na Planeta Energia!%0A%0A#BolãoCopa2026`
    }

    if (!mensagem)
      return new Response(JSON.stringify({ error: 'Tipo de mensagem inválido' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    // Normalizar telefone
    const tel = telefone.replace(/\D/g, '')
    const to = tel.startsWith('55') ? `+${tel}` : `+55${tel}`

    // Enviar via API ChatGuru
    const payload = new URLSearchParams()
    payload.append('api_key', CHATGURU_API_KEY)
    payload.append('account_id', CHATGURU_ACCOUNT_ID)
    payload.append('phone_id', CHATGURU_PHONE_ID)
    payload.append('to', to)
    payload.append('message', mensagem)
    payload.append('type', 'text')

    console.log(`📤 Enviando para ${to}...`)
    const res = await fetch(`${CHATGURU_API}/message/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: payload
    })
    const data = await res.json()
    console.log(`📬 Resposta:`, JSON.stringify(data))

    if (!res.ok)
      return new Response(JSON.stringify({ error: data.message || `HTTP ${res.status}` }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    return new Response(JSON.stringify({ success: true, tipo_mensagem, telefone: to }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e) {
    console.error('❌', e.message)
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
