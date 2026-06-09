// POST /cadastrar — Cadastro de participante com palpites
// REGRA: cada CPF/CNPJ pode palpitar UMA VEZ por jogo (rodada)
//   - Mesmo CPF em jogo NOVO → MERGE (adiciona novos palpites)
//   - Mesmo CPF no MESMO jogo → REJEITA (já palpitou nesta rodada)
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RATE_LIMIT = { max: 10, windowMinutes: 60, name: 'cadastrar' }

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}

// Enfileira WhatsApp de boas-vindas (na fila, nao bloqueia)
async function enfileirarWhatsapp(body: any) {
  try {
    const pp = Array.isArray(body.palpites) ? body.palpites[0] : null
    if (!pp) return
    const getJogoId = (p: any) => p.jogo_id ?? p.jogoId
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const { data: cfg } = await supabase.from('jogos_config').select('pais_fora').eq('jogo_id', getJogoId(pp)).maybeSingle()
    await supabase.from('mensagens_queue').insert({
      telefone: body.telefone?.replace(/\D/g, '') || '',
      tipo_mensagem: 'boas_vindas',
      dados: {
        nome: body.nome?.trim() || 'Participante',
        gols_casa: pp.casa ?? pp.gols_casa ?? 0,
        gols_fora: pp.fora ?? pp.gols_fora ?? 0,
        adversario: cfg?.pais_fora || 'Time'
      }
    })
    console.log('✅ Boas-vindas enfileirada')
  } catch (e) {
    console.warn('⚠️ Erro ao enfileirar:', e.message)
  }
}

function validarCPF(cpf: string): boolean {
  const d = cpf.replace(/\D/g, '')
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false
  let s = 0; for (let i = 0; i < 9; i++) s += parseInt(d[i]) * (10 - i)
  let r = (s * 10) % 11; if (r === 10) r = 0
  if (r !== parseInt(d[9])) return false
  s = 0; for (let i = 0; i < 10; i++) s += parseInt(d[i]) * (11 - i)
  r = (s * 10) % 11; if (r === 10) r = 0
  if (r !== parseInt(d[10])) return false
  return true
}

function validarCNPJ(cnpj: string): boolean {
  const d = cnpj.replace(/\D/g, '')
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false
  const p1 = [5,4,3,2,9,8,7,6,5,4,3,2]
  let s = 0; for (let i = 0; i < 12; i++) s += parseInt(d[i]) * p1[i]
  if ((s % 11 < 2 ? 0 : 11 - (s % 11)) !== parseInt(d[12])) return false
  const p2 = [6,5,4,3,2,9,8,7,6,5,4,3,2]
  s = 0; for (let i = 0; i < 13; i++) s += parseInt(d[i]) * p2[i]
  if ((s % 11 < 2 ? 0 : 11 - (s % 11)) !== parseInt(d[13])) return false
  return true
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ success: false, error: 'Método não permitido' }), {
      status: 405, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    })
  }

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'

    const windowStart = new Date(Date.now() - RATE_LIMIT.windowMinutes * 60 * 1000).toISOString()
    const { count } = await supabase
      .from('rate_limits')
      .select('*', { count: 'exact', head: true })
      .eq('ip', ip)
      .eq('endpoint', RATE_LIMIT.name)
      .gte('created_at', windowStart)

    if (count !== null && count >= RATE_LIMIT.max) {
      return new Response(
        JSON.stringify({ success: false, error: 'Muitas tentativas. Aguarde 1 hora.' }),
        { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '3600', ...corsHeaders() } }
      )
    }

    await supabase.from('rate_limits').insert({ ip, endpoint: RATE_LIMIT.name }).select()

    const contentType = req.headers.get('content-type') || ''
    if (!contentType.includes('application/json')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Content-Type deve ser application/json' }),
        { status: 415, headers: { 'Content-Type': 'application/json', ...corsHeaders() } }
      )
    }

    const body = await req.json()
    const errors = []

    if (!body.nome || body.nome.trim().length < 3) errors.push('Nome deve ter no mínimo 3 caracteres')
    if (body.nome && body.nome.length > 255) errors.push('Nome deve ter no máximo 255 caracteres')

    const doc = (body.documento || '').replace(/\D/g, '')
    if (!doc) errors.push('Documento é obrigatório')
    else if (body.tipo_documento === 'cpf') {
      if (doc.length !== 11) errors.push('CPF deve ter 11 dígitos')
      else if (!validarCPF(doc)) errors.push('CPF inválido')
    }
    else if (body.tipo_documento === 'cnpj') {
      if (doc.length !== 14) errors.push('CNPJ deve ter 14 dígitos')
      else if (!validarCNPJ(doc)) errors.push('CNPJ inválido')
    }
    else if (!['cpf', 'cnpj'].includes(body.tipo_documento || '')) errors.push('tipo_documento deve ser "cpf" ou "cnpj"')

    if (body.tipo_documento === 'cnpj' && (!body.empresa || !body.empresa.trim())) errors.push('Empresa é obrigatória para CNPJ')
    const telDigits = body.telefone.replace(/\D/g, '')
    if (!body.telefone || telDigits.length < 10) errors.push('Telefone inválido (mínimo 10 dígitos)')
    else if (telDigits.length > 15) errors.push('Telefone inválido (máximo 15 dígitos)')

    if (!body.palpites || !Array.isArray(body.palpites) || body.palpites.length === 0) {
      errors.push('Palpites são obrigatórios')
    }

    if (errors.length > 0) {
      return new Response(
        JSON.stringify({ success: false, error: errors.join('; ') }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() } }
      )
    }

    // Verificar se o CPF já existe
    const { data: existing } = await supabase
      .from('participantes')
      .select('id, palpites')
      .eq('documento', doc)
      .maybeSingle()

    if (existing) {
      const palpitesAntigos = existing.palpites || []
      const palpitesNovos = body.palpites || []

      // Extrair IDs dos jogos já palpitados (suporta jogo_id e jogoId)
      const getJogoId = (p: any) => p.jogo_id ?? p.jogoId
      const jogosAntigos = new Set(palpitesAntigos.map(getJogoId))
      const jogosNovos = palpitesNovos.map(getJogoId)

      // Verificar se algum jogo novo já foi palpitado antes (mesma rodada)
      const conflitos = jogosNovos.filter(id => jogosAntigos.has(id))
      if (conflitos.length > 0) {
        return new Response(
          JSON.stringify({
            success: false,
            error: `Você já palpitou no jogo ${conflitos.join(', ')} nesta rodada. Aguarde a próxima rodada para novos palpites.`
          }),
          { status: 409, headers: { 'Content-Type': 'application/json', ...corsHeaders() } }
        )
      }

      // Sem conflitos: MERGE — adiciona novos palpites aos antigos
      const palpitesMerge = [...palpitesAntigos, ...palpitesNovos]

      const { error: updateError } = await supabase
        .from('participantes')
        .update({
          nome: body.nome.trim(),
          tipo_documento: body.tipo_documento,
          empresa: body.empresa?.trim() || '',
          telefone: body.telefone.trim(),
          palpites: palpitesMerge,
        })
        .eq('id', existing.id)

      if (updateError) {
        console.error('Update error:', updateError)
        return new Response(
          JSON.stringify({ success: false, error: 'Erro ao atualizar cadastro' }),
          { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders() } }
        )
      }

      // Enfileirar WhatsApp (assíncrono, não bloqueia)
      enfileirarWhatsapp(body)

      return new Response(
        JSON.stringify({
          success: true,
          data: { id: existing.id, nome: body.nome.trim(), merge: true, palpites_adicionados: palpitesNovos.length }
        }),
        { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders() } }
      )
    }

    // CPF NOVO — inserir normalmente
    const { data, error } = await supabase
      .from('participantes')
      .insert({
        nome: body.nome.trim(),
        documento: doc,
        tipo_documento: body.tipo_documento,
        empresa: body.empresa?.trim() || '',
        telefone: body.telefone.trim(),
        palpites: body.palpites,
      })
      .select('id, nome')
      .single()

    if (error) {
      if (error.code === '23505') {
        // Concorrência: inserção simultânea — tenta merge
        const { data: retryExisting } = await supabase
          .from('participantes')
          .select('id, palpites')
          .eq('documento', doc)
          .single()

        if (retryExisting) {
          const merged = [...(retryExisting.palpites || [])]
          const getJogoId2 = (p: any) => p.jogo_id ?? p.jogoId
          const existingIds = new Set(merged.map(getJogoId2))
          const novos = (body.palpites || []).filter(p => !existingIds.has(getJogoId2(p)))

          if (novos.length === 0) {
            return new Response(
              JSON.stringify({ success: false, error: 'Você já palpitou neste jogo. Aguarde a próxima rodada.' }),
              { status: 409, headers: { 'Content-Type': 'application/json', ...corsHeaders() } }
            )
          }

          merged.push(...novos)
          await supabase.from('participantes').update({ palpites: merged }).eq('id', retryExisting.id)

          return new Response(
            JSON.stringify({ success: true, data: { id: retryExisting.id, nome: body.nome.trim(), merge: true } }),
            { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders() } }
          )
        }
      }
      if (error.message?.includes('CPF inválido') || error.message?.includes('CNPJ inválido')) {
        return new Response(
          JSON.stringify({ success: false, error: error.message }),
          { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() } }
        )
      }
      console.error('Insert error:', error)
      return new Response(
        JSON.stringify({ success: false, error: 'Erro ao cadastrar' }),
        { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders() } }
      )
    }

    // Disparar WhatsApp (assíncrono, não bloqueia)
    // Enfileirar WhatsApp (assíncrono, não bloqueia)
    enfileirarWhatsapp(body)

    return new Response(
      JSON.stringify({ success: true, data: { id: data.id, nome: data.nome, merge: false } }),
      { status: 201, headers: { 'Content-Type': 'application/json', ...corsHeaders() } }
    )
  } catch (error) {
    console.error('cadastrar error:', error)
    return new Response(
      JSON.stringify({ success: false, error: 'Erro interno do servidor' }),
      { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders() } }
    )
  }
})
