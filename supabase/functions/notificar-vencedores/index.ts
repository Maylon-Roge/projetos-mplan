// POST /notificar-vencedores — Busca vencedores, gera cupons e envia WhatsApp
// Auth: JWT admin (supabase.auth.getUser)
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, authorization',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

function res(s: number, d: any) {
  return new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })
  if (req.method !== 'POST') return res(405, { error: 'Método não permitido' })

  try {
    const auth = req.headers.get('Authorization')
    if (!auth || !auth.startsWith('Bearer ')) return res(401, { error: 'Token não fornecido' })

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const { data: { user }, error: authErr } = await supabase.auth.getUser(auth.slice(7))
    if (authErr || !user) return res(401, { error: 'Token inválido ou expirado' })

    const { jogo_id, resultado } = await req.json()
    if (!jogo_id || !resultado) return res(400, { error: 'jogo_id e resultado obrigatórios' })

    console.log(`🏆 Notificando vencedores do jogo ${jogo_id} (${resultado.gols_casa}x${resultado.gols_fora})`)

    // 1. Buscar participantes que acertaram
    const { data: participantes, error: pErr } = await supabase
      .from('participantes')
      .select('id, nome, documento, telefone, palpites')
      .not('palpites', 'is', null)

    if (pErr) return res(500, { error: 'Erro ao buscar participantes: ' + pErr.message })

    const vencedores = participantes.filter((p: any) => {
      const palpites = p.palpites || []
      return palpites.some((pp: any) => {
        const jid = pp.jogo_id || pp.jogoId
        const gc = pp.gols_casa ?? pp.casa
        const gf = pp.gols_fora ?? pp.fora
        return jid === jogo_id && gc === resultado.gols_casa && gf === resultado.gols_fora
      })
    })

    console.log(`📊 ${vencedores.length} vencedor(es) encontrado(s)`)

    if (vencedores.length === 0) return res(200, { success: true, vencedores_notificados: [], mensagem: 'Nenhum vencedor encontrado para este jogo' })

    // 2. Gerar cupons e enviar WhatsApp
    const CHATGURU_API = Deno.env.get('CHATGURU_API') || 'https://app3.zap.guru/api/v1'
    const CHATGURU_KEY = Deno.env.get('CHATGURU_API_KEY') || Deno.env.get('CHATGURU_KEY') || ''
    const CHATGURU_ACCOUNT_ID = Deno.env.get('CHATGURU_ACCOUNT_ID') || ''
    const CHATGURU_PHONE_ID = Deno.env.get('CHATGURU_PHONE_ID') || ''
    const DIALOGO_VENCEDOR = Deno.env.get('DIALOGO_VENCEDOR') || ''

    function normalizarTel(tel: string): string {
      const n = tel.replace(/\D/g, '')
      let num = n.startsWith('55') ? n : `55${n}`
      if (num.length === 13 && num[4] === '9') num = num.slice(0, 4) + num.slice(5)
      return num
    }

    async function enviarWhatsApp(vencedor: any, cupom: string, adversario: string) {
      const chat_number = normalizarTel(vencedor.telefone || '')
      if (!chat_number) { console.warn(`⚠️ ${vencedor.nome}: telefone inválido`); return }

      console.log(`📨 Enviando WhatsApp para ${vencedor.nome} (${chat_number})`)

      // PASSO 0: Criar chat
      const addP = new URLSearchParams()
      addP.append('action', 'chat_add')
      addP.append('name', vencedor.nome || 'Vencedor')
      addP.append('text', '🎉 Você acertou!')
      addP.append('key', CHATGURU_KEY)
      addP.append('account_id', CHATGURU_ACCOUNT_ID)
      addP.append('phone_id', CHATGURU_PHONE_ID)
      addP.append('chat_number', chat_number)
      const addR = await fetch(CHATGURU_API, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: addP })
      const addD = await addR.json()
      console.log(`📬 chat_add:`, JSON.stringify(addD))
      if (addD.result === 'error') { console.warn(`⚠️ chat_add falhou:`, addD.description); return }

      // Aguardar chat_add processar
      if (addD.chat_add_id && addD.chat_add_status === 'pending') {
        for (let i = 0; i < 5; i++) {
          await new Promise(r => setTimeout(r, 2000))
          const sp = new URLSearchParams()
          sp.append('action', 'chat_add_status')
          sp.append('chat_add_id', addD.chat_add_id)
          sp.append('key', CHATGURU_KEY)
          sp.append('account_id', CHATGURU_ACCOUNT_ID)
          sp.append('phone_id', CHATGURU_PHONE_ID)
          sp.append('chat_number', chat_number)
          const sr = await fetch(CHATGURU_API, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: sp })
          const sd = await sr.json()
          console.log(`  ⏳ Status[${i+1}]: ${sd.chat_add_status}`)
          if (sd.chat_add_status === 'done') break
        }
      }

      // PASSO 1: Contexto
      const ctx = new URLSearchParams()
      ctx.append('action', 'chat_update_context')
      ctx.append('key', CHATGURU_KEY)
      ctx.append('account_id', CHATGURU_ACCOUNT_ID)
      ctx.append('phone_id', CHATGURU_PHONE_ID)
      ctx.append('chat_number', chat_number)
      const wrap0 = (v: number) => v === 0 ? '​0' : String(v)
      ctx.append('var__1', wrap0(resultado.gols_casa))
      ctx.append('var_1', wrap0(resultado.gols_casa))
      ctx.append('1', wrap0(resultado.gols_casa))
      ctx.append('var__2', wrap0(resultado.gols_fora))
      ctx.append('var_2', wrap0(resultado.gols_fora))
      ctx.append('2', wrap0(resultado.gols_fora))
      ctx.append('var__3', adversario || 'Adversário')
      ctx.append('var_3', adversario || 'Adversário')
      ctx.append('3', adversario || 'Adversário')
      const ctxR = await fetch(CHATGURU_API, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: ctx })
      const ctxD = await ctxR.json()
      console.log(`📬 contexto:`, JSON.stringify(ctxD))
      if (ctxD.result === 'error') { console.warn(`⚠️ contexto falhou:`, ctxD.description) }

      // PASSO 2: Dialogo
      const d = new URLSearchParams()
      d.append('action', 'dialog_execute')
      d.append('dialog_id', DIALOGO_VENCEDOR)
      d.append('key', CHATGURU_KEY)
      d.append('account_id', CHATGURU_ACCOUNT_ID)
      d.append('phone_id', CHATGURU_PHONE_ID)
      d.append('chat_number', chat_number)
      const dR = await fetch(CHATGURU_API, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: d })
      const dD = await dR.json()
      console.log(`📬 dialogo:`, JSON.stringify(dD))
      if (dD.result === 'error') { console.warn(`⚠️ dialogo falhou:`, dD.description) }
    }

    const notificados: any[] = []
    const erros: any[] = []

    for (const v of vencedores) {
      try {
        // Verificar se já tem cupom para este jogo
        const { data: existing } = await supabase
          .from('vencedores_desconto')
          .select('id, cupom_codigo')
          .eq('participante_id', v.id)
          .eq('jogo_id', jogo_id)
          .maybeSingle()

        if (existing) {
          console.log(`📨 ${v.nome} já tem cupom, reenviando WhatsApp...`)
          const cupomExistente = existing.cupom_codigo || `BOLAO-BRASIL-20-${Date.now()}-${v.id}`
          const adversario = resultado.adversario || 'Adversário'
          enviarWhatsApp(v, cupomExistente, adversario).catch(e => console.warn(`WhatsApp ${v.nome}:`, e.message))
          notificados.push({ id: v.id, nome: v.nome, cupom: cupomExistente })
          continue
        }

        // Gerar cupom único
        const cupom = `BOLAO-BRASIL-20-${Date.now()}-${v.id}`
        const adversario = resultado.adversario || 'Adversário'
        const placarReal = `${resultado.gols_casa}x${resultado.gols_fora}`

        // Salvar na tabela
        const { error: iErr } = await supabase.from('vencedores_desconto').insert({
          participante_id: v.id,
          jogo_id,
          rodada: resultado.rodada || 1,
          placar_realizado: placarReal,
          cupom_codigo: cupom,
          desconto_percentual: 20,
          utilizado: false,
          data_criacao: new Date().toISOString(),
          data_validade: new Date(Date.now() + 30*24*60*60*1000).toISOString()
        })

        if (iErr) { erros.push({ nome: v.nome, erro: iErr.message }); continue }

        // Enviar WhatsApp (assíncrono, não bloqueia)
        enviarWhatsApp(v, cupom, adversario).catch(e => console.warn(`WhatsApp ${v.nome}:`, e.message))
        notificados.push({ id: v.id, nome: v.nome, cupom })
        console.log(`✅ ${v.nome} → ${cupom}`)
      } catch (e: any) {
        erros.push({ nome: v.nome, erro: e.message })
      }
    }

    return res(200, {
      success: true,
      vencedores_notificados: notificados,
      erros: erros,
      total: notificados.length,
      mensagem: `${notificados.length} vencedor(es) notificado(s) com sucesso!`
    })

  } catch (e: any) {
    console.error('❌', e.message)
    return res(500, { error: e.message })
  }
})
