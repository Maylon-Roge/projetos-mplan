// GET /health — Health check da aplicação
// Função autocontida

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RATE_LIMIT = { max: 300, windowMinutes: 60, name: 'health' }

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

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'

    // Rate limit leve
    const windowStart = new Date(Date.now() - RATE_LIMIT.windowMinutes * 60 * 1000).toISOString()
    const { count } = await supabase
      .from('rate_limits').select('*', { count: 'exact', head: true })
      .eq('ip', ip).eq('endpoint', RATE_LIMIT.name).gte('created_at', windowStart)

    if (count !== null && count >= RATE_LIMIT.max) {
      return new Response(JSON.stringify({ success: false, error: 'Muitas requisições' }), {
        status: 429, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      })
    }
    await supabase.from('rate_limits').insert({ ip, endpoint: RATE_LIMIT.name }).select().catch(() => {})

    // Testar banco
    const start = Date.now()
    let dbConnected = false
    let latencyMs = 0
    try {
      const { error } = await supabase.from('participantes').select('id', { count: 'exact', head: true }).limit(1)
      latencyMs = Date.now() - start
      dbConnected = !error
    } catch {
      latencyMs = Date.now() - start
    }

    const status = dbConnected ? (latencyMs < 2000 ? 'ok' : 'degraded') : 'down'

    return new Response(JSON.stringify({
      success: true,
      data: {
        status,
        timestamp: new Date().toISOString(),
        database: { connected: dbConnected, latency_ms: latencyMs },
        version: '1.0.0',
      }
    }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders() } })
  } catch (error) {
    console.error('health error:', error)
    return new Response(JSON.stringify({ success: false, error: 'Erro interno' }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    })
  }
})
