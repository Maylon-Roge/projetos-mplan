// POST /processar-fila-mensagens — Processa fila de WhatsApp
// Lê mensagens pendentes da tabela mensagens_queue e envia via ChatGuru
// Processa até 3 mensagens por execução, com delay de 3s entre cada
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CHATGURU_API = Deno.env.get('CHATGURU_API') || 'https://app3.zap.guru/api/v1'
const CHATGURU_KEY = Deno.env.get('CHATGURU_API_KEY') || Deno.env.get('CHATGURU_KEY') || ''
const CHATGURU_ACCOUNT_ID = Deno.env.get('CHATGURU_ACCOUNT_ID') || ''
const CHATGURU_PHONE_ID = Deno.env.get('CHATGURU_PHONE_ID') || ''
const DIALOGO_BOAS_VINDAS = Deno.env.get('DIALOGO_BOAS_VINDAS') || ''
const DIALOGO_VENCEDOR = Deno.env.get('DIALOGO_VENCEDOR') || ''

function res(s: number, d: any) {
  return new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

function normalizarTel(tel: string): string {
  const n = tel.replace(/\D/g, '')
  let num = n.startsWith('55') ? n : `55${n}`
  if (num.length === 13 && num[4] === '9') num = num.slice(0, 4) + num.slice(5)
  return num
}

const wrap0 = (v: number) => v === 0 ? '\u200B0' : String(v)

async function enviarChatGuru(chatNumber: string, nome: string, text: string, vars: Record<string, string>, dialogId: string): Promise<string | null> {
  try {
    // chat_add
    const addP = new URLSearchParams()
    addP.append('action', 'chat_add')
    addP.append('name', nome)
    addP.append('text', text)
    addP.append('key', CHATGURU_KEY)
    addP.append('account_id', CHATGURU_ACCOUNT_ID)
    addP.append('phone_id', CHATGURU_PHONE_ID)
    addP.append('chat_number', chatNumber)
    const addR = await fetch(CHATGURU_API, { method: 'POST', body: addP })
    const addD = await addR.json()
    if (addD.result === 'error') return `chat_add: ${addD.description}`

    if (addD.chat_add_id && addD.chat_add_status === 'pending') {
      for (let i = 0; i < 5; i++) {
        await new Promise(r => setTimeout(r, 2000))
        const sp = new URLSearchParams()
        sp.append('action', 'chat_add_status')
        sp.append('chat_add_id', addD.chat_add_id)
        sp.append('key', CHATGURU_KEY)
        sp.append('account_id', CHATGURU_ACCOUNT_ID)
        sp.append('phone_id', CHATGURU_PHONE_ID)
        sp.append('chat_number', chatNumber)
        const sr = await fetch(CHATGURU_API, { method: 'POST', body: sp })
        const sd = await sr.json()
        if (sd.chat_add_status === 'done') break
      }
    }

    // Contexto
    const ctx = new URLSearchParams()
    ctx.append('action', 'chat_update_context')
    ctx.append('key', CHATGURU_KEY)
    ctx.append('account_id', CHATGURU_ACCOUNT_ID)
    ctx.append('phone_id', CHATGURU_PHONE_ID)
    ctx.append('chat_number', chatNumber)
    for (const [key, value] of Object.entries(vars)) {
      ctx.append(key, value)
    }
    await fetch(CHATGURU_API, { method: 'POST', body: ctx })

    // Dialogo
    const d = new URLSearchParams()
    d.append('action', 'dialog_execute')
    d.append('dialog_id', dialogId)
    d.append('key', CHATGURU_KEY)
    d.append('account_id', CHATGURU_ACCOUNT_ID)
    d.append('phone_id', CHATGURU_PHONE_ID)
    d.append('chat_number', chatNumber)
    const dR = await fetch(CHATGURU_API, { method: 'POST', body: d })
    const dD = await dR.json()
    if (dD.result === 'error') return `dialogo: ${dD.description}`

    return null
  } catch (e: any) {
    return e.message || 'Erro desconhecido'
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })
  if (req.method !== 'POST') return res(405, { error: 'Método não permitido' })

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    let processadas = 0
    let erros = 0

    for (let i = 0; i < 3; i++) {
      const { data: msgs } = await supabase
        .from('mensagens_queue')
        .select('*')
        .eq('status', 'pendente')
        .order('created_at', { ascending: true })
        .limit(1)

      if (!msgs || msgs.length === 0) break

      const msg = msgs[0]

      await supabase
        .from('mensagens_queue')
        .update({ status: 'enviando', updated_at: new Date().toISOString() })
        .eq('id', msg.id)

      console.log(`📨 Processando #${msg.id}: ${msg.tipo_mensagem}`)

      const c = msg.dados?.gols_casa ?? 0
      const f = msg.dados?.gols_fora ?? 0
      const adv = msg.dados?.adversario || 'Time'
      const nome = msg.dados?.nome || 'Participante'

      const vars: Record<string, string> = {
        'var__1': wrap0(c), 'var_1': wrap0(c), '1': wrap0(c),
        'var__2': wrap0(f), 'var_2': wrap0(f), '2': wrap0(f),
        'var__3': adv, 'var_3': adv, '3': adv,
      }
      if (msg.tipo_mensagem === 'boas_vindas') {
        vars['var__4'] = nome; vars['var_4'] = nome; vars['4'] = nome
      }

      const dialogId = msg.tipo_mensagem === 'vencedor' ? DIALOGO_VENCEDOR : DIALOGO_BOAS_VINDAS
      const text = msg.tipo_mensagem === 'vencedor' ? '🎉 Você acertou!' : '🏆 Bolão Planeta Energia'
      const chatNumber = normalizarTel(msg.telefone || '')

      let erro: string | null = null
      if (!chatNumber) {
        erro = 'Telefone inválido'
      } else {
        erro = await enviarChatGuru(chatNumber, nome, text, vars, dialogId)
      }

      if (erro) {
        const novasTentativas = (msg.tentativas || 0) + 1
        console.warn(`❌ #${msg.id} falhou (${novasTentativas}/${msg.max_tentativas}): ${erro}`)
        if (novasTentativas >= msg.max_tentativas) {
          await supabase.from('mensagens_queue').update({
            status: 'falhou', erro, tentativas: novasTentativas, updated_at: new Date().toISOString()
          }).eq('id', msg.id)
          erros++
        } else {
          await supabase.from('mensagens_queue').update({
            status: 'pendente', erro, tentativas: novasTentativas, updated_at: new Date().toISOString()
          }).eq('id', msg.id)
        }
      } else {
        console.log(`✅ #${msg.id} enviada`)
        await supabase.from('mensagens_queue').update({
          status: 'enviada', erro: null, updated_at: new Date().toISOString()
        }).eq('id', msg.id)
        processadas++
      }

      if (i < 2) await new Promise(r => setTimeout(r, 3000))
    }

    return res(200, {
      success: true,
      processadas, erros,
      fila_vazia: processadas === 0 && erros === 0,
      timestamp: new Date().toISOString()
    })
  } catch (e: any) {
    console.error('processar-fila error:', e)
    return res(500, { success: false, error: 'Erro interno' })
  }
})
