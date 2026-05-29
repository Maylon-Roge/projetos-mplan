// GET /health — Health check da aplicação

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { successResponse } from '../_shared/response.ts'
import { handleCORS, checkRateLimit, handleError } from '../_shared/middleware.ts'

serve(async (req: Request) => {
  try {
    const cors = handleCORS(req)
    if (cors) return cors

    // Rate limit permissivo
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const { allowed } = await checkRateLimit(ip, 'health')

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Testar conexão com banco e medir latência
    const start = Date.now()
    let dbConnected = false
    let latencyMs = 0

    try {
      const { error } = await supabase.from('participantes').select('id', { count: 'exact', head: true }).limit(1)
      latencyMs = Date.now() - start
      dbConnected = !error
    } catch {
      latencyMs = Date.now() - start
      dbConnected = false
    }

    const status = dbConnected
      ? (latencyMs < 2000 ? 'ok' : 'degraded')
      : 'down'

    return successResponse({
      status,
      timestamp: new Date().toISOString(),
      database: {
        connected: dbConnected,
        latency_ms: latencyMs,
      },
      version: '1.0.0',
    })
  } catch (error) {
    return handleError(error, 'health')
  }
})
