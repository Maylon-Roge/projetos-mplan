// ============================================
// SUPABASE EDGE FUNCTION: limpar-dados
// Limpa TODOS os resultados e jogos_liberados
// Mantém os participantes no banco
// ============================================
// Para usar: cole este código no Supabase Dashboard
// em: Edge Functions > limpar-dados > Código
// ============================================

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.6'

// --- JWT Verification (inline, no external deps) ---
async function verifyJWT(token) {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null

    // Decode payload (2nd part)
    const payload = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(atob(parts[1]), (c) => c.charCodeAt(0))
      )
    )

    // Check expiration
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      return null
    }

    return payload
  } catch {
    return null
  }
}

serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type',
  }

  // CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ success: false, error: 'Método não permitido' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  try {
    // --- Auth ---
    const auth = req.headers.get('Authorization')
    if (!auth || !auth.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({
          code: 'UNAUTHORIZED_MISSING_TOKEN',
          message: 'Token de autenticação não fornecido',
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const token = auth.slice(7)
    const payload = await verifyJWT(token)
    if (!payload || !payload.sub) {
      return new Response(
        JSON.stringify({
          code: 'UNAUTHORIZED_INVALID_TOKEN',
          message: 'Token inválido ou expirado',
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // --- DB Client (service_role = bypass RLS) ---
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_KEY') ?? ''
    )

    const results = {
      resultados_limpos: 0,
      jogos_liberados_zerados: 0,
    }

    // 1) Clear resultados
    const { error: err1, count: c1 } = await supabase
      .from('resultados')
      .update({ gols_casa: null, gols_fora: null })
      .neq('jogo_id', 0)
      .select('*', { count: 'exact', head: true })

    if (err1) {
      console.error('Erro resultados:', err1)
      return new Response(
        JSON.stringify({ success: false, error: 'Erro ao limpar resultados: ' + err1.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    results.resultados_limpos = c1 ?? 0

    // 2) Clear jogos_liberados
    const { error: err2, count: c2 } = await supabase
      .from('jogos_liberados')
      .update({ liberado: false })
      .neq('jogo_id', 0)
      .select('*', { count: 'exact', head: true })

    if (err2) {
      console.error('Erro liberados:', err2)
      return new Response(
        JSON.stringify({ success: false, error: 'Erro ao liberar jogos: ' + err2.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    results.jogos_liberados_zerados = c2 ?? 0

    return new Response(
      JSON.stringify({
        success: true,
        message: '✅ Todos os dados foram limpos com sucesso!',
        data: results,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('Erro interno:', err)
    return new Response(
      JSON.stringify({ success: false, error: 'Erro interno do servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
