// GET /consulta?documento=XXX — Consulta de participante por CPF/CNPJ
// Função autocontida (sem dependências externas)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RATE_LIMIT = { max: 100, windowMinutes: 60, name: 'consulta' }

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
      return new Response(JSON.stringify({ success: false, error: 'Muitas consultas. Aguarde.' }), {
        status: 429, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      })
    }
    await supabase.from('rate_limits').insert({ ip, endpoint: RATE_LIMIT.name }).select().catch(() => {})

    // Extrair documento
    const url = new URL(req.url)
    const documentoRaw = url.searchParams.get('documento')
    if (!documentoRaw) {
      return new Response(JSON.stringify({ success: false, error: 'Parâmetro "documento" é obrigatório' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      })
    }

    const documento = documentoRaw.replace(/\D/g, '')
    if (documento.length !== 11 && documento.length !== 14) {
      return new Response(JSON.stringify({ success: false, error: 'Documento inválido' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      })
    }

    // Buscar participante
    const { data: p, error } = await supabase
      .from('participantes').select('*').eq('documento', documento).single()

    if (error || !p) {
      return new Response(JSON.stringify({ success: false, error: 'Documento não encontrado' }), {
        status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      })
    }

    // Mascarar documento
    let docMask = p.documento
    if (p.tipo_documento === 'cpf') {
      docMask = p.documento.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '***.$2.$3-**')
    } else {
      docMask = p.documento.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '**$2.$3/****-$5')
    }

    return new Response(JSON.stringify({
      success: true,
      data: {
        nome: p.nome,
        documento: docMask,
        palpites: p.palpites || [],
        pontos: p.pontos || 0,
        acertos_exatos: p.acertos_exatos || 0,
      }
    }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders() } })
  } catch (error) {
    console.error('consulta error:', error)
    return new Response(JSON.stringify({ success: false, error: 'Erro interno' }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    })
  }
})
