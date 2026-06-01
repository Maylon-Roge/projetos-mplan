// POST /cadastrar — Cadastro/atualização de participante com palpites
// REGRA: cada CPF/CNPJ pode palpitar em MÚLTIPLAS RODADAS
//   - Mesmo CPF na mesma rodada → MERGE (atualiza palpites, mantém resultados antigos)
//   - Mesmo CPF em rodada diferente → MERGE (adiciona novos palpites, mantém antigos)
//   - NUNCA rejeita CPF duplicado — sempre faz merge dos palpites
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
    else if (body.tipo_documento === 'cpf' && doc.length !== 11) errors.push('CPF deve ter 11 dígitos')
    else if (body.tipo_documento === 'cnpj' && doc.length !== 14) errors.push('CNPJ deve ter 14 dígitos')
    else if (!['cpf', 'cnpj'].includes(body.tipo_documento || '')) errors.push('tipo_documento deve ser "cpf" ou "cnpj"')

    if (body.tipo_documento === 'cnpj' && (!body.empresa || !body.empresa.trim())) errors.push('Empresa é obrigatória para CNPJ')
    if (!body.telefone || body.telefone.replace(/\D/g, '').length < 10) errors.push('Telefone inválido (mínimo 10 dígitos)')

    if (!body.palpites || !Array.isArray(body.palpites) || body.palpites.length === 0) {
      errors.push('Palpites são obrigatórios')
    }

    if (errors.length > 0) {
      return new Response(
        JSON.stringify({ success: false, error: errors.join('; ') }),
        { status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() } }
      )
    }

    // Verificar se o CPF já existe — se sim, MERGE dos palpites
    const { data: existing } = await supabase
      .from('participantes')
      .select('id, palpites, pontos, acertos_exatos')
      .eq('documento', doc)
      .maybeSingle()

    if (existing) {
      // MERGE: mantém palpites antigos + adiciona novos (sem duplicar jogos)
      const palpitesAntigos = existing.palpites || []
      const palpitesNovos = body.palpites || []
      const jogosExistentes = new Set(palpitesAntigos.map(p => p.jogoId))

      // Só adiciona palpites para jogos que o participante AINDA NÃO palpitou
      for (const novo of palpitesNovos) {
        if (!jogosExistentes.has(novo.jogoId)) {
          palpitesAntigos.push(novo)
          jogosExistentes.add(novo.jogoId)
        }
      }

      const { error: updateError } = await supabase
        .from('participantes')
        .update({
          nome: body.nome.trim(),
          tipo_documento: body.tipo_documento,
          empresa: body.empresa?.trim() || '',
          telefone: body.telefone.trim(),
          palpites: palpitesAntigos,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)

      if (updateError) {
        console.error('Update error:', updateError)
        return new Response(
          JSON.stringify({ success: false, error: 'Erro ao atualizar cadastro' }),
          { status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders() } }
        )
      }

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
        // Concorrência: outro request inseriu no mesmo instante — trata como merge
        const { data: retryExisting } = await supabase
          .from('participantes')
          .select('id, palpites')
          .eq('documento', doc)
          .single()

        if (retryExisting) {
          const merged = [...(retryExisting.palpites || [])]
          const existingIds = new Set(merged.map(p => p.jogoId))
          for (const p of (body.palpites || [])) {
            if (!existingIds.has(p.jogoId)) {
              merged.push(p)
              existingIds.add(p.jogoId)
            }
          }
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
