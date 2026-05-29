// GET /ranking — Ranking público de participantes
// Retorna apenas nome e pontuação (SEM dados sensíveis)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { successResponse, errorResponse } from '../_shared/response.ts'
import { handleCORS, checkRateLimit, handleError } from '../_shared/middleware.ts'

serve(async (req: Request) => {
  try {
    // CORS preflight
    const cors = handleCORS(req)
    if (cors) return cors

    // Rate limit
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const { allowed, retryAfter } = await checkRateLimit(ip, 'ranking')
    if (!allowed) {
      return errorResponse(
        `Muitas requisições. Tente novamente em ${retryAfter} segundos.`,
        429
      )
    }

    if (req.method !== 'GET') {
      return errorResponse('Método não permitido', 405)
    }

    // Parâmetros opcionais
    const url = new URL(req.url)
    const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '100') || 100, 1), 1000)
    const offset = Math.max(parseInt(url.searchParams.get('offset') || '0') || 0, 0)

    // Buscar ranking
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Total de participantes
    const { count: total } = await supabase
      .from('participantes')
      .select('*', { count: 'exact', head: true })

    // Ranking ordenado por pontos DESC, acertos_exatos DESC, id ASC
    const { data: participantes, error } = await supabase
      .from('participantes')
      .select('nome, palpites, pontos, acertos_exatos')
      .order('pontos', { ascending: false, nullsFirst: false })
      .order('acertos_exatos', { ascending: false, nullsFirst: false })
      .order('id', { ascending: true })
      .range(offset, offset + limit - 1)

    if (error) {
      console.error('Ranking query error:', error)
      return errorResponse('Erro ao carregar ranking', 500)
    }

    // Montar ranking (sem dados sensíveis)
    const ranking = (participantes || []).map((p, i) => ({
      posicao: offset + i + 1,
      nome: p.nome,
      pontos: p.pontos || 0,
      acertos_exatos: p.acertos_exatos || 0,
    }))

    return successResponse({
      ranking,
      total_participantes: total || 0,
      timestamp: new Date().toISOString(),
    })
  } catch (error) {
    return handleError(error, 'ranking')
  }
})
