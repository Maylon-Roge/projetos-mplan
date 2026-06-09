import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.6'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RATE_LIMIT = { max: 5, windowMinutes: 60, name: 'login' }

function res(status: number, data: any) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS')
    return new Response(null, { status: 204, headers: corsHeaders })

  if (req.method !== 'POST')
    return res(405, { error: 'Método não permitido' })

  try {
    // Rate limit por IP
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    try {
      const ws = new Date(Date.now() - RATE_LIMIT.windowMinutes * 60 * 1000).toISOString()
      const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
      const { count } = await supabase
        .from('rate_limits').select('*', { count: 'exact', head: true })
        .eq('ip', ip).eq('endpoint', RATE_LIMIT.name).gte('created_at', ws)
      if (count !== null && count >= RATE_LIMIT.max)
        return res(429, { success: false, error: 'Muitas tentativas. Aguarde 1 hora.' })
      await supabase.from('rate_limits').insert({ ip, endpoint: RATE_LIMIT.name })
    } catch (e) { console.error('rate limit error:', e) }

    const { email, password } = await req.json()

    if (!email || !password)
      return res(400, { success: false, error: 'Email e senha obrigatórios' })

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

    const { data, error } = await sb.auth.signInWithPassword({ email, password })

    // Mensagem genérica para prevenir enumeração de usuários
    if (error || !data.session?.access_token)
      return res(401, { success: false, error: 'Email ou senha inválidos' })

    return res(200, {
      success: true,
      token: data.session.access_token,
    })
  } catch (err) {
    console.error('login error:', err)
    return res(500, { success: false, error: 'Erro interno' })
  }
})
