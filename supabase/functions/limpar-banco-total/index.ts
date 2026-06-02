import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.6'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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
    const auth = req.headers.get('Authorization')
    if (!auth || !auth.startsWith('Bearer '))
      return res(401, { error: 'Token não fornecido' })

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Verifica JWT usando Supabase Auth (mesmo método do admin-operations)
    const token = auth.slice(7)
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user)
      return res(401, { error: 'Token inválido ou expirado' })

    console.log(`Admin ${user.email} iniciando limpeza total...`)

    // 1. Vencedores/Cupons
    await supabase.from('vencedores_desconto').delete().neq('id', 0)
    // 2. Resultados (PK = jogo_id)
    await supabase.from('resultados').delete().neq('jogo_id', 0)
    // 3. Jogos liberados (PK = jogo_id)
    await supabase.from('jogos_liberados').delete().neq('jogo_id', 0)
    // 4. Participantes (palpites vão junto via CASCADE)
    await supabase.from('participantes').delete().neq('id', 0)

    return res(200, {
      success: true,
      message: '✅ Banco de dados limpo completamente!',
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error('Erro geral:', err)
    return res(500, { error: 'Erro interno: ' + String(err) })
  }
})
