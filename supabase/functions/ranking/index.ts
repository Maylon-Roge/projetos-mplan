// GET /ranking — Ranking público (sem dados sensíveis)
// Função autocontida

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RATE_LIMIT = { max: 50, windowMinutes: 60, name: 'ranking' }

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
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ success: false, error: 'Método não permitido' }), {
      status: 405, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    })
  }

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'

    // Rate limit
    const windowStart = new Date(Date.now() - RATE_LIMIT.windowMinutes * 60 * 1000).toISOString()
    const { count } = await supabase
      .from('rate_limits').select('*', { count: 'exact', head: true })
      .eq('ip', ip).eq('endpoint', RATE_LIMIT.name).gte('created_at', windowStart)

    if (count !== null && count >= RATE_LIMIT.max) {
      return new Response(JSON.stringify({ success: false, error: 'Muitas requisições. Aguarde.' }), {
        status: 429, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      })
    }
    await supabase.from('rate_limits').insert({ ip, endpoint: RATE_LIMIT.name }).select().catch(() => {})

    // Parâmetros
    const url = new URL(req.url)
    const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '100') || 100, 1), 1000)
    const offset = Math.max(parseInt(url.searchParams.get('offset') || '0') || 0, 0)

    // Total
    const { count: total } = await supabase.from('participantes').select('*', { count: 'exact', head: true })

    // Ranking ordenado
    const { data: participantes, error } = await supabase
      .from('participantes')
      .select('nome, palpites, pontos, acertos_exatos')
      .order('pontos', { ascending: false, nullsFirst: false })
      .order('acertos_exatos', { ascending: false, nullsFirst: false })
      .order('id', { ascending: true })
      .range(offset, offset + limit - 1)

    if (error) {
      console.error('Ranking error:', error)
      return new Response(JSON.stringify({ success: false, error: 'Erro ao carregar ranking' }), {
        status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      })
    }

    const ranking = (participantes || []).map((p, i) => ({
      posicao: offset + i + 1,
      nome: p.nome,
      pontos: p.pontos || 0,
      acertos_exatos: p.acertos_exatos || 0,
    }))

    return new Response(JSON.stringify({
      success: true,
      data: { ranking, total_participantes: total || 0, timestamp: new Date().toISOString() }
    }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders() } })
  } catch (error) {
    console.error('ranking error:', error)
    return new Response(JSON.stringify({ success: false, error: 'Erro interno' }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    })
  }
})
