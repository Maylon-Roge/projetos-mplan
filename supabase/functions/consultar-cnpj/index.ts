import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método não permitido' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  try {
    const { cnpj } = await req.json()

    if (!cnpj || cnpj.length < 14) {
      return new Response(JSON.stringify({ error: 'CNPJ inválido' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log(`🔍 Consultando CNPJ: ${cnpj}`)

    // Chama ReceitaWS do backend (SEM problema de CORS)
    const res = await fetch(`https://www.receitaws.com.br/api/v2/cnpj/${cnpj}`, {
      signal: AbortSignal.timeout(5000),
    })

    const dados = await res.json()

    console.log(`✅ Resposta: ${dados.status}`)

    return new Response(JSON.stringify(dados), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('❌ Erro:', error.message)

    return new Response(
      JSON.stringify({ error: 'Erro ao consultar CNPJ', details: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})
