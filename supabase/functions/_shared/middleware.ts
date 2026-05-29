// Middleware compartilhado para Edge Functions
// Inclui: rate limiting, auth, CORS, error handling

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { errorResponse, Errors } from './response.ts'
import type { ApiResponse } from './types.ts'

// ============================================
// SUPABASE CLIENT (service_role)
// ============================================

function getSupabaseClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
}

// ============================================
// CORS MIDDLEWARE
// ============================================

const ALLOWED_ORIGINS = [
  'https://maylon-roge.github.io',
  /^http:\/\/localhost:\d+$/,
]

export function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = origin && ALLOWED_ORIGINS.some(o =>
    typeof o === 'string' ? o === origin : o.test(origin)
  )
  return {
    'Access-Control-Allow-Origin': allowed ? origin! : 'https://maylon-roge.github.io',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  }
}

export function handleCORS(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        ...corsHeaders(req.headers.get('origin')),
        'Access-Control-Allow-Origin': '*',
      },
    })
  }
  return null
}

// ============================================
// RATE LIMIT MIDDLEWARE
// ============================================

interface RateLimitConfig {
  maxRequests: number   // máx requisições
  windowMinutes: number // janela em minutos
}

const RATE_LIMITS: Record<string, RateLimitConfig> = {
  'cadastrar':    { maxRequests: 10, windowMinutes: 60 },   // 10/hora
  'consulta':     { maxRequests: 100, windowMinutes: 60 },  // 100/hora
  'ranking':      { maxRequests: 50, windowMinutes: 60 },   // 50/hora
  'health':       { maxRequests: 300, windowMinutes: 60 },  // 300/hora
  'admin':        { maxRequests: 1000, windowMinutes: 60 }, // 1000/hora
}

export async function checkRateLimit(
  ip: string,
  endpoint: string
): Promise<{ allowed: boolean; retryAfter?: number }> {
  // Determina o nome do rate limit baseado no endpoint
  const rateKey = Object.keys(RATE_LIMITS).find(k => endpoint.includes(k)) || 'health'
  const config = RATE_LIMITS[rateKey]

  const supabase = getSupabaseClient()

  // Conta requisições na janela de tempo
  const windowStart = new Date(Date.now() - config.windowMinutes * 60 * 1000).toISOString()

  const { count, error } = await supabase
    .from('rate_limits')
    .select('*', { count: 'exact', head: true })
    .eq('ip', ip)
    .eq('endpoint', rateKey)
    .gte('created_at', windowStart)

  if (error) {
    console.error('Rate limit check error:', error)
    return { allowed: true } // Em caso de erro, permite (fail open leve)
  }

  if (count !== null && count >= config.maxRequests) {
    // Calcula quando o rate limit reseta
    const oldestAllowed = new Date(Date.now() - config.windowMinutes * 60 * 1000)
    const retryAfter = Math.ceil(
      (oldestAllowed.getTime() + config.windowMinutes * 60 * 1000 - Date.now()) / 1000
    )
    return { allowed: false, retryAfter: Math.max(retryAfter, 1) }
  }

  // Registra a requisição
  await supabase
    .from('rate_limits')
    .insert({ ip, endpoint: rateKey })
    .select()
    .then(() => {})
    .catch(e => console.error('Rate limit insert error:', e))

  return { allowed: true }
}

// ============================================
// ADMIN AUTH MIDDLEWARE
// ============================================

export async function verifyAdminToken(
  req: Request
): Promise<{ user: { email: string } | null; error?: Response }> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { user: null, error: Errors.unauthorized('Token de acesso necessário') }
  }

  const token = authHeader.replace('Bearer ', '')
  const supabase = getSupabaseClient()

  const { data: { user }, error } = await supabase.auth.getUser(token)

  if (error || !user) {
    return { user: null, error: Errors.unauthorized('Token inválido ou expirado') }
  }

  return { user: { email: user.email || 'unknown' } }
}

// ============================================
// ERROR HANDLING MIDDLEWARE
// ============================================

export function handleError(error: unknown, context?: string): Response {
  const message = error instanceof Error ? error.message : 'Erro interno do servidor'
  console.error(`[${context || 'unknown'}]`, error)
  return Errors.serverError()
}
