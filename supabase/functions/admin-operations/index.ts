// POST /admin-operations — Operações administrativas unificadas
// Requer JWT do Supabase Auth.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RATE_LIMIT = { max: 1000, windowMinutes: 60, name: 'admin' }

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
      .from('rate_limits').select('*', { count: 'exact', head: true })
      .eq('ip', ip).eq('endpoint', RATE_LIMIT.name).gte('created_at', windowStart)

    if (count !== null && count >= RATE_LIMIT.max) {
      return new Response(JSON.stringify({ success: false, error: 'Muitas requisições' }), {
        status: 429, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      })
    }
    await supabase.from('rate_limits').insert({ ip, endpoint: RATE_LIMIT.name }).select()

    // Verificar JWT
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ success: false, error: 'Token de acesso necessário' }), {
        status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return new Response(JSON.stringify({ success: false, error: 'Token inválido ou expirado' }), {
        status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      })
    }

    const adminEmail = user.email || 'unknown'

    if (!(req.headers.get('content-type') || '').includes('application/json')) {
      return new Response(JSON.stringify({ success: false, error: 'Content-Type deve ser application/json' }), {
        status: 415, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      })
    }

    const body = await req.json()
    if (!body.operacao) {
      return new Response(JSON.stringify({ success: false, error: 'Campo "operacao" obrigatório' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      })
    }

    // OPERAÇÃO: LISTAR PARTICIPANTES
    if (body.operacao === 'listar_participantes') {
      const { data: participantes, error: listError } = await supabase
        .from('participantes').select('*').order('created_at', { ascending: false })

      if (listError) {
        console.error('Erro ao listar participantes:', listError)
        return new Response(JSON.stringify({ success: false, error: 'Erro ao listar participantes' }), {
          status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
        })
      }

      await supabase.from('audit_logs').insert({
        admin_email: adminEmail, operacao: 'listar_participantes', status: 'sucesso',
      }).select())

      return new Response(JSON.stringify({
        success: true, data: { participantes: participantes || [] }
      }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders() } })
    }

    // OPERAÇÃO: SALVAR RESULTADO
    if (body.operacao === 'salvar_resultado') {
      if (!body.jogo_id) {
        return new Response(JSON.stringify({ success: false, error: '"jogo_id" obrigatório' }), {
          status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
        })
      }
      if (body.gols_casa === undefined || body.gols_fora === undefined) {
        return new Response(JSON.stringify({ success: false, error: '"gols_casa" e "gols_fora" obrigatórios' }), {
          status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
        })
      }

      const { data: oldData } = await supabase
        .from('resultados').select('*').eq('jogo_id', body.jogo_id).single()

      const { error: upsertError } = await supabase
        .from('resultados').upsert({
          jogo_id: body.jogo_id,
          gols_casa: body.gols_casa,
          gols_fora: body.gols_fora,
          updated_at: new Date().toISOString(),
        })

      if (upsertError) {
        console.error('Erro ao salvar resultado:', upsertError)
        return new Response(JSON.stringify({ success: false, error: 'Erro ao salvar resultado' }), {
          status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
        })
      }

      await supabase.from('audit_logs').insert({
        admin_email: adminEmail, operacao: 'salvar_resultado', jogo_id: body.jogo_id,
        dados_antigos: oldData ? { gols_casa: oldData.gols_casa, gols_fora: oldData.gols_fora } : null,
        dados_novos: { gols_casa: body.gols_casa, gols_fora: body.gols_fora }, status: 'sucesso',
      }).select())

      return new Response(JSON.stringify({
        success: true, data: { jogo_id: body.jogo_id, gols_casa: body.gols_casa, gols_fora: body.gols_fora }
      }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders() } })
    }

    // OPERAÇÃO: LIBERAR JOGO
    if (body.operacao === 'liberar_jogo') {
      if (body.liberado === undefined) {
        return new Response(JSON.stringify({ success: false, error: '"liberado" é obrigatório' }), {
          status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
        })
      }

      const { data: oldData } = await supabase
        .from('jogos_liberados').select('*').eq('jogo_id', body.jogo_id).single()

      const { error: upsertError } = await supabase
        .from('jogos_liberados').upsert({ jogo_id: body.jogo_id, liberado: body.liberado })

      if (upsertError) {
        console.error('Erro ao liberar jogo:', upsertError)
        return new Response(JSON.stringify({ success: false, error: 'Erro ao liberar jogo' }), {
          status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
        })
      }

      await supabase.from('audit_logs').insert({
        admin_email: adminEmail, operacao: 'liberar_jogo', jogo_id: body.jogo_id,
        dados_antigos: oldData ? { liberado: oldData.liberado } : null,
        dados_novos: { liberado: body.liberado }, status: 'sucesso',
      }).select())

      return new Response(JSON.stringify({
        success: true, data: { jogo_id: body.jogo_id, liberado: body.liberado }
      }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders() } })
    }

    return new Response(JSON.stringify({ success: false, error: 'Operação inválida. Use "listar_participantes", "salvar_resultado" ou "liberar_jogo"' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    })
  } catch (error) {
    console.error('admin-operations error:', error)
    return new Response(JSON.stringify({ success: false, error: 'Erro interno' }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    })
  }
})
