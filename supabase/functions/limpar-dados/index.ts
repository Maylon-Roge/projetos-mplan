// ============================================
// Edge Function: limpar-dados
// Limpa TODOS os resultados e jogos_liberados
// Mantém os participantes no banco
// ============================================
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.6'
import { verifyJWT } from '../_shared/jwt-helper.ts'

interface ClearResponse {
  success: boolean
  message?: string
  error?: string
  data?: {
    resultados_limpos: number
    jogos_liberados_zerados: number
  }
}

serve(async (req: Request): Promise<Response> => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers })
  }

  // Only POST allowed
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ success: false, error: 'Método não permitido' }),
      { status: 405, headers }
    )
  }

  try {
    // Verify JWT (admin only)
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({
          code: 'UNAUTHORIZED_MISSING_TOKEN',
          message: 'Token de autenticação não fornecido'
        }),
        { status: 401, headers }
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const payload = await verifyJWT(token)

    if (!payload || !payload.sub) {
      return new Response(
        JSON.stringify({
          code: 'UNAUTHORIZED_INVALID_TOKEN',
          message: 'Token inválido ou expirado'
        }),
        { status: 401, headers }
      )
    }

    // Create Supabase client with service_role for admin operations
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_KEY') || ''
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Step 1: Clear all resultados (set scores to NULL)
    const { data: resultadosData, error: resultadosError } = await supabase
      .from('resultados')
      .update({ gols_casa: null, gols_fora: null })
      .neq('jogo_id', 0) // match all rows

    if (resultadosError) {
      console.error('Erro ao limpar resultados:', resultadosError)
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Erro ao limpar resultados: ' + resultadosError.message
        }),
        { status: 500, headers }
      )
    }

    // Step 2: Clear all jogos_liberados (set liberado = false)
    const { data: liberadosData, error: liberadosError } = await supabase
      .from('jogos_liberados')
      .update({ liberado: false })
      .neq('jogo_id', 0)

    if (liberadosError) {
      console.error('Erro ao limpar jogos_liberados:', liberadosError)
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Erro ao liberar jogos: ' + liberadosError.message
        }),
        { status: 500, headers }
      )
    }

    // Get counts of affected rows
    const { count: countResultados } = await supabase
      .from('resultados')
      .select('*', { count: 'exact', head: true })
      .is('gols_casa', null)

    const { count: countLiberados } = await supabase
      .from('jogos_liberados')
      .select('*', { count: 'exact', head: true })
      .eq('liberado', false)

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Todos os dados foram limpos com sucesso!',
        data: {
          resultados_limpos: countResultados || 0,
          jogos_liberados_zerados: countLiberados || 0
        }
      } as ClearResponse),
      { status: 200, headers }
    )

  } catch (err) {
    console.error('Erro interno:', err)
    return new Response(
      JSON.stringify({
        success: false,
        error: err instanceof Error ? err.message : 'Erro interno do servidor'
      }),
      { status: 500, headers }
    )
  }
})
