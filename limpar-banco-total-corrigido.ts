// ============================================
// SUPABASE EDGE FUNCTION: limpar-banco-total
// DELETA 100% dos dados do bolão
// ============================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.6'
import { verifyJWT } from '../_shared/jwt-helper.ts'

serve(async (req: Request): Promise<Response> => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }

  if (req.method === 'OPTIONS')
    return new Response(null, { status: 204, headers: corsHeaders })

  if (req.method !== 'POST')
    return new Response(JSON.stringify({ success: false, error: 'Método não permitido' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  try {
    // Auth check
    const auth = req.headers.get('Authorization')
    if (!auth || !auth.startsWith('Bearer '))
      return new Response(JSON.stringify({ code: 'UNAUTHORIZED_MISSING_TOKEN', message: 'Token não fornecido' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    const token = auth.slice(7)
    const payload = await verifyJWT(token)
    if (!payload || !payload.sub)
      return new Response(JSON.stringify({ code: 'UNAUTHORIZED_INVALID_TOKEN', message: 'Token inválido ou expirado' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    // Supabase client com service_role (bypass RLS)
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_KEY') || ''
    if (!supabaseUrl || !supabaseKey) {
      console.error('Env vars SUPABASE_URL ou SUPABASE_SERVICE_KEY não configuradas')
      return new Response(JSON.stringify({ success: false, error: 'Erro de configuração do servidor' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const supabase = createClient(supabaseUrl, supabaseKey)

    const deleted = {
      palpites: 0,
      resultados: 0,
      jogos_liberados: 0,
      participantes: 0,
    }

    // 1) Limpar palpites (JSONB dentro de participantes)
    const { error: errPalpites, count: cPalpites } = await supabase
      .from('participantes')
      .update({ palpites: [] })
      .neq('id', 0)
      .select('*', { count: 'exact', head: true })
    if (errPalpites) {
      console.error('Erro ao limpar palpites:', errPalpites.message)
    } else {
      deleted.palpites = cPalpites ?? 0
    }

    // 2) DELETE todos os resultados
    const { error: errResultados, count: cResultados } = await supabase
      .from('resultados')
      .delete()
      .neq('jogo_id', 0)
      .select('*', { count: 'exact', head: true })
    if (errResultados) {
      console.error('Erro resultados:', errResultados.message)
    } else {
      deleted.resultados = cResultados ?? 0
    }

    // 3) DELETE todos os jogos_liberados
    const { error: errLiberados, count: cLiberados } = await supabase
      .from('jogos_liberados')
      .delete()
      .neq('jogo_id', 0)
      .select('*', { count: 'exact', head: true })
    if (errLiberados) {
      console.error('Erro liberados:', errLiberados.message)
    } else {
      deleted.jogos_liberados = cLiberados ?? 0
    }

    // 4) DELETE todos os participantes
    const { error: errParticipantes, count: cParticipantes } = await supabase
      .from('participantes')
      .delete()
      .neq('id', 0)
      .select('*', { count: 'exact', head: true })
    if (errParticipantes) {
      console.error('Erro participantes:', errParticipantes.message)
    } else {
      deleted.participantes = cParticipantes ?? 0
    }

    return new Response(JSON.stringify({
      success: true,
      message: '✅ Banco de dados limpo completamente!',
      data: { deleted }
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  } catch (err) {
    console.error('Erro interno:', err)
    return new Response(JSON.stringify({
      success: false,
      error: err instanceof Error ? err.message : 'Erro interno do servidor'
    }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
