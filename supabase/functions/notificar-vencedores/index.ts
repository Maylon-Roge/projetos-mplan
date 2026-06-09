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

    // Enfileira notificacao de vencedor (na fila, processado assincronamente)
    async function enfileirarVencedor(vencedor: any, cupom: string, adversario: string) {
      try {
        await supabase.from('mensagens_queue').insert({
          telefone: (vencedor.telefone || '').replace(/\D/g, ''),
          tipo_mensagem: 'vencedor',
          dados: {
            nome: vencedor.nome || 'Vencedor',
            gols_casa: resultado.gols_casa,
            gols_fora: resultado.gols_fora,
            adversario: adversario || 'Adversário',
            cupom: cupom || ''
          }
        })
        console.log(`✅ ${vencedor.nome} enfileirado`)
      } catch (e) {
        console.warn(`⚠️ Erro ao enfileirar ${vencedor.nome}:`, e.message)
      }
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
          enfileirarVencedor(v, cupomExistente, adversario).catch(e => console.warn(`WhatsApp ${v.nome}:`, e.message))
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
        enfileirarVencedor(v, cupom, adversario).catch(e => console.warn(`WhatsApp ${v.nome}:`, e.message))
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
