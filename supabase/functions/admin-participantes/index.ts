// GET /admin-participantes — Lista completa de participantes (admin apenas)
// Requer JWT do Supabase Auth. Função autocontida.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

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

    // Verificar JWT
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ success: false, error: 'Token necessário' }), {
        status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return new Response(JSON.stringify({ success: false, error: 'Token inválido' }), {
        status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      })
    }

    // Parâmetros opcionais
    const url = new URL(req.url)
    const search = url.searchParams.get('search')?.toLowerCase().trim() || ''
    const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '200') || 200, 1), 1000)
    const offset = Math.max(parseInt(url.searchParams.get('offset') || '0') || 0, 0)

    // Buscar participantes
    let query = supabase
      .from('participantes')
      .select('*', { count: 'exact' })
      .order('id', { ascending: true })
      .range(offset, offset + limit - 1)

    if (search) {
      query = query.or(`nome.ilike.%${search}%,documento.ilike.%${search}%`)
    }

    const { data: participantes, error, count } = await query

    if (error) {
      console.error('admin-participantes error:', error)
      return new Response(JSON.stringify({ success: false, error: 'Erro ao buscar' }), {
        status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      })
    }

    return new Response(JSON.stringify({
      success: true,
      data: {
        total: count || 0,
        participantes: (participantes || []).map(p => ({
          id: p.id,
          nome: p.nome,
          documento: p.documento,
          tipo_documento: p.tipo_documento,
          empresa: p.empresa,
          telefone: p.telefone,
          qtd_palpites: (p.palpites || []).length,
          created_at: p.created_at,
        }))
      }
    }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders() } })
  } catch (error) {
    console.error('admin-participantes error:', error)
    return new Response(JSON.stringify({ success: false, error: 'Erro interno' }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    })
  }
})
