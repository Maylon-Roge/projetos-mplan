// POST /admin-operations — Operações administrativas unificadas
// Requer JWT do Supabase Auth.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const RATE_LIMIT = { max: 1000, windowMinutes: 60, name: 'admin' }

// Mapeamento de jogo_id → rodada
const RODADA_POR_JOGO: Record<number, string> = {
  1: '1ª Rodada',
  2: '2ª Rodada',
  3: '3ª Rodada',
  4: '2ª Fase (32 avos)',
  5: 'Oitavas de Final',
  6: 'Quartas de Final',
  7: 'Semifinal',
  8: 'Final',
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}

// Gera cupom único para vencedor
function gerarCupom(jogoId: number, participanteId: number): string {
  const random = Math.random().toString(36).substring(2, 8).toUpperCase()
  return `BOLAO-J${jogoId}-${random}`
}

// Processa vencedores após salvar resultado
async function processarVencedores(
  supabase: any,
  jogoId: number,
  golsCasa: number,
  golsFora: number,
): Promise<any[]> {
  try {
    const rodada = RODADA_POR_JOGO[jogoId] || `Jogo ${jogoId}`
    const placarReal = `${golsCasa}x${golsFora}`

    // 1. Busca todos os participantes com palpites
    const { data: participantes, error: err } = await supabase
      .from('participantes')
      .select('id, nome, palpites')
      .not('palpites', 'is', null)

    if (err) throw err
    if (!participantes || participantes.length === 0) return []

    const vencedores: any[] = []

    // 2. Varre cada participante
    for (const p of participantes) {
      if (!Array.isArray(p.palpites)) continue

      // 3. Procura palpite deste jogo (suporta jogo_id e jogoId)
      const palpite = p.palpites.find((pp: any) => (pp.jogo_id ?? pp.jogoId) === jogoId)
      if (!palpite) continue

      // 4. Verifica se acertou placar exato (suporta gols_casa/casa e gols_fora/fora)
      const gc = palpite.gols_casa ?? palpite.casa
      const gf = palpite.gols_fora ?? palpite.fora
      if (gc !== golsCasa || gf !== golsFora) continue

      // 5. ACERTOU! Gera cupom
      const cupomCodigo = gerarCupom(jogoId, p.id)
      const dataValidade = new Date()
      dataValidade.setDate(dataValidade.getDate() + 30)

      // 6. Salva na tabela vencedores_desconto
      const { error: insertErr } = await supabase
        .from('vencedores_desconto')
        .insert({
          participante_id: p.id,
          jogo_id: jogoId,
          rodada: rodada,
          placar_realizado: placarReal,
          desconto_percentual: 20,
          cupom_codigo: cupomCodigo,
          data_validade: dataValidade.toISOString(),
          utilizado: false,
        })

      if (!insertErr) {
        vencedores.push({
          participante_id: p.id,
          nome: p.nome,
          cupom: cupomCodigo,
          desconto: '20%',
        })
      }
    }

    return vencedores
  } catch (err) {
    console.error('❌ processarVencedores ERRO:', err)
    return []
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() })
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ success: false, error: 'Método não permitido' }), {
      status: 405, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    })
  }

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'

    const windowStart = new Date(Date.now() - RATE_LIMIT.windowMinutes * 60 * 1000).toISOString()
    const { count } = await supabase
      .from('rate_limits').select('*', { count: 'exact', head: true })
      .eq('ip', ip).eq('endpoint', RATE_LIMIT.name).gte('created_at', windowStart)

    if (count !== null && count >= RATE_LIMIT.max) {
      return new Response(JSON.stringify({ success: false, error: 'Muitas requisições' }), {
        status: 429, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      })
    }
    await supabase.from('rate_limits').insert({ ip, endpoint: RATE_LIMIT.name }).select()

    // Verificar JWT
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ success: false, error: 'Token de acesso necessário' }), {
        status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      })
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return new Response(JSON.stringify({ success: false, error: 'Token inválido ou expirado' }), {
        status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      })
    }

    const adminEmail = user.email || 'unknown'

    if (!(req.headers.get('content-type') || '').includes('application/json')) {
      return new Response(JSON.stringify({ success: false, error: 'Content-Type deve ser application/json' }), {
        status: 415, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      })
    }

    const body = await req.json()
    if (!body.operacao) {
      return new Response(JSON.stringify({ success: false, error: 'Campo "operacao" obrigatório' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      })
    }

    // OPERAÇÃO: LISTAR PARTICIPANTES
    if (body.operacao === 'listar_participantes') {
      const { data: participantes, error: listError } = await supabase
        .from('participantes').select('*').order('created_at', { ascending: false })

      if (listError) {
        console.error('Erro ao listar participantes:', listError)
        return new Response(JSON.stringify({ success: false, error: 'Erro ao listar participantes' }), {
          status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
        })
      }

      await supabase.from('audit_logs').insert({
        admin_email: adminEmail, operacao: 'listar_participantes', status: 'sucesso',
      })

      return new Response(JSON.stringify({
        success: true, data: { participantes: participantes || [] }
      }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders() } })
    }

    // OPERAÇÃO: SALVAR RESULTADO + PROCESSAR VENCEDORES
    if (body.operacao === 'salvar_resultado') {
      if (!body.jogo_id) {
        return new Response(JSON.stringify({ success: false, error: '"jogo_id" obrigatório' }), {
          status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
        })
      }
      if (body.gols_casa === undefined || body.gols_fora === undefined) {
        return new Response(JSON.stringify({ success: false, error: '"gols_casa" e "gols_fora" obrigatórios' }), {
          status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
        })
      }

      const { data: oldData } = await supabase
        .from('resultados').select('*').eq('jogo_id', body.jogo_id).single()

      const { error: upsertError } = await supabase
        .from('resultados').upsert({
          jogo_id: body.jogo_id,
          gols_casa: body.gols_casa,
          gols_fora: body.gols_fora,
          updated_at: new Date().toISOString(),
        })

      if (upsertError) {
        console.error('Erro ao salvar resultado:', upsertError)
        return new Response(JSON.stringify({ success: false, error: 'Erro ao salvar resultado' }), {
          status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
        })
      }

      await supabase.from('audit_logs').insert({
        admin_email: adminEmail, operacao: 'salvar_resultado', jogo_id: body.jogo_id,
        dados_antigos: oldData ? { gols_casa: oldData.gols_casa, gols_fora: oldData.gols_fora } : null,
        dados_novos: { gols_casa: body.gols_casa, gols_fora: body.gols_fora }, status: 'sucesso',
      })

      // Processa vencedores — quem acertou placar exato ganha 20% de desconto
      const vencedores = await processarVencedores(
        supabase, body.jogo_id, body.gols_casa, body.gols_fora,
      )

      const msgVencedores = vencedores.length > 0
        ? `${vencedores.length} vencedor${vencedores.length > 1 ? 'es' : ''} criado${vencedores.length > 1 ? 's' : ''}!`
        : 'Nenhum palpite acertou o placar exato.'

      return new Response(JSON.stringify({
        success: true,
        data: { jogo_id: body.jogo_id, gols_casa: body.gols_casa, gols_fora: body.gols_fora },
        vencedores: vencedores,
        mensagem: `Resultado salvo! ${msgVencedores}`,
      }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders() } })
    }

    // OPERAÇÃO: BUSCAR PARTICIPANTE
    if (body.operacao === 'buscar_participante') {
      const pid = body.participante_id || body.id
      if (!pid) {
        return new Response(JSON.stringify({ success: false, error: '"participante_id" obrigatório' }), {
          status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
        })
      }

      const { data: p, error: findErr } = await supabase
        .from('participantes')
        .select('id, nome, documento, tipo_documento, empresa, telefone, created_at, palpites')
        .eq('id', pid)
        .single()

      if (findErr || !p) {
        return new Response(JSON.stringify({ success: false, error: 'Participante não encontrado' }), {
          status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
        })
      }

      return new Response(JSON.stringify({
        success: true,
        data: { ...p, palpites_count: Array.isArray(p.palpites) ? p.palpites.length : 0 },
      }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders() } })
    }

    // OPERAÇÃO: LISTAR VENCEDORES
    if (body.operacao === 'listar_vencedores') {
      let query = supabase
        .from('vencedores_desconto')
        .select('*')
        .order('jogo_id', { ascending: true })

      if (body.jogo_id) {
        query = query.eq('jogo_id', body.jogo_id)
      }

      const { data: vencedores, error: listErr } = await query

      if (listErr) {
        console.error('Erro ao listar vencedores:', listErr)
        return new Response(JSON.stringify({ success: false, error: 'Erro ao listar vencedores' }), {
          status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
        })
      }

      // Buscar nomes dos participantes
      const participantesIds = [...new Set((vencedores || []).map(v => v.participante_id))]
      const { data: participantes } = await supabase
        .from('participantes')
        .select('id, nome')
        .in('id', participantesIds.length ? participantesIds : [0])

      const mapaNomes: Record<number, string> = {}
      if (participantes) {
        for (const p of participantes) {
          mapaNomes[p.id] = p.nome
        }
      }

      const dados = (vencedores || []).map(v => ({
        id: v.id,
        participante_nome: mapaNomes[v.participante_id] || `ID ${v.participante_id}`,
        jogo_id: v.jogo_id,
        rodada: v.rodada,
        placar_realizado: v.placar_realizado,
        cupom_codigo: v.cupom_codigo,
        desconto_percentual: v.desconto_percentual,
        utilizado: v.utilizado,
        data_criacao: v.data_criacao,
        data_validade: v.data_validade,
      }))

      return new Response(JSON.stringify({
        success: true, data: { vencedores: dados }
      }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders() } })
    }

    // OPERAÇÃO: SALVAR CONFIG DO JOGO
    if (body.operacao === 'salvar_jogo_config') {
      if (!body.jogo_id || !body.pais_fora || !body.data || !body.local) {
        return new Response(JSON.stringify({ success: false, error: '"jogo_id", "pais_fora", "data" e "local" obrigatórios' }), {
          status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
        })
      }
      const { error: upsertError } = await supabase
        .from('jogos_config').upsert({
          jogo_id: body.jogo_id,
          pais_fora: body.pais_fora,
          flag_fora: body.flag_fora || '',
          data: body.data,
          local: body.local,
          updated_at: new Date().toISOString(),
        })
      if (upsertError) {
        console.error('Erro ao salvar config do jogo:', upsertError)
        return new Response(JSON.stringify({ success: false, error: 'Erro ao salvar config do jogo' }), {
          status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
        })
      }
      return new Response(JSON.stringify({
        success: true, data: { jogo_id: body.jogo_id, pais_fora: body.pais_fora, data: body.data, local: body.local }
      }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders() } })
    }

    // OPERAÇÃO: LIBERAR JOGO
    if (body.operacao === 'liberar_jogo') {
      if (body.liberado === undefined) {
        return new Response(JSON.stringify({ success: false, error: '"liberado" é obrigatório' }), {
          status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
        })
      }

      const { data: oldData } = await supabase
        .from('jogos_liberados').select('*').eq('jogo_id', body.jogo_id).single()

      const { error: upsertError } = await supabase
        .from('jogos_liberados').upsert({ jogo_id: body.jogo_id, liberado: body.liberado })

      if (upsertError) {
        console.error('Erro ao liberar jogo:', upsertError)
        return new Response(JSON.stringify({ success: false, error: 'Erro ao liberar jogo' }), {
          status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
        })
      }

      await supabase.from('audit_logs').insert({
        admin_email: adminEmail, operacao: 'liberar_jogo', jogo_id: body.jogo_id,
        dados_antigos: oldData ? { liberado: oldData.liberado } : null,
        dados_novos: { liberado: body.liberado }, status: 'sucesso',
      })

      return new Response(JSON.stringify({
        success: true, data: { jogo_id: body.jogo_id, liberado: body.liberado }
      }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders() } })
    }

    return new Response(JSON.stringify({
      success: false,
      error: 'Operação inválida. Use "listar_participantes", "buscar_participante", "salvar_resultado", "listar_vencedores" ou "liberar_jogo"'
    }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    })
  } catch (error) {
    console.error('admin-operations error:', error)
    return new Response(JSON.stringify({ success: false, error: 'Erro interno' }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    })
  }
})
