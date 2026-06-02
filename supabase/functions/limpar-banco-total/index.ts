import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.6'

async function verifyJWT(token: string) {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const payload = JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(atob(parts[1]), (c) => c.charCodeAt(0))
      )
    )
    if (payload.exp && payload.exp * 1000 < Date.now()) return null
    return payload
  } catch {
    return null
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function res(status: number, data: any) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return res(405, { error: 'Método não permitido' })
  }

  try {
    const auth = req.headers.get('Authorization')
    if (!auth || !auth.startsWith('Bearer ')) {
      return res(401, { error: 'Token não fornecido' })
    }

    const token = auth.slice(7)
    const payload = await verifyJWT(token)
    if (!payload || !payload.sub) {
      return res(401, { error: 'Token inválido' })
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

    if (!supabaseUrl || !supabaseKey) {
      return res(500, { error: 'Env vars não configuradas' })
    }

    const supabase = createClient(supabaseUrl, supabaseKey)

    console.log('Iniciando limpeza total do banco de dados...')

    // 1. Limpar vencedores_desconto (cupons)
    const { error: erro1 } = await supabase
      .from('vencedores_desconto')
      .delete()
      .neq('id', 0)

    if (erro1) {
      console.error('Erro ao limpar vencedores_desconto:', erro1)
      return res(500, { error: 'Erro ao limpar cupons: ' + erro1.message })
    }
    console.log('✅ Vencedores/Cupons limpados')

    // 2. Limpar resultados
    const { error: erro2 } = await supabase
      .from('resultados')
      .delete()
      .neq('id', 0)

    if (erro2) {
      console.error('Erro ao limpar resultados:', erro2)
      return res(500, { error: 'Erro ao limpar resultados: ' + erro2.message })
    }
    console.log('✅ Resultados limpos')

    // 3. Limpar jogos_liberados
    const { error: erro3 } = await supabase
      .from('jogos_liberados')
      .delete()
      .neq('id', 0)

    if (erro3) {
      console.error('Erro ao limpar jogos_liberados:', erro3)
      return res(500, { error: 'Erro ao limpar status dos jogos: ' + erro3.message })
    }
    console.log('✅ Status dos jogos limpado')

    // 4. Limpar participantes (vai limpar palpites também via CASCADE)
    const { error: erro4 } = await supabase
      .from('participantes')
      .delete()
      .neq('id', 0)

    if (erro4) {
      console.error('Erro ao limpar participantes:', erro4)
      return res(500, { error: 'Erro ao limpar participantes: ' + erro4.message })
    }
    console.log('✅ Participantes e palpites limpados')

    console.log('✅ BANCO DE DADOS TOTALMENTE LIMPO!')

    return res(200, {
      success: true,
      message: 'Banco de dados limpo completamente! ✅\n\n✅ Vencedores/Cupons\n✅ Resultados\n✅ Jogos liberados\n✅ Participantes\n✅ Palpites',
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error('Erro geral:', err)
    return res(500, { error: 'Erro interno: ' + String(err) })
  }
})
