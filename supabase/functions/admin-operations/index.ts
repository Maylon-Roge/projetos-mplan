// POST /admin-operations — Operações administrativas unificadas
// Requer JWT do Supabase Auth (Bearer token)

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { successResponse, errorResponse } from '../_shared/response.ts'
import { handleCORS, checkRateLimit, verifyAdminToken, handleError } from '../_shared/middleware.ts'
import type { AdminOperacaoRequest } from '../_shared/types.ts'

serve(async (req: Request) => {
  try {
    // CORS preflight
    const cors = handleCORS(req)
    if (cors) return cors

    // Rate limit por IP (admin é bem permissivo)
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const { allowed, retryAfter } = await checkRateLimit(ip, 'admin')
    if (!allowed) {
      return errorResponse(
        `Muitas requisições. Tente novamente em ${retryAfter} segundos.`,
        429
      )
    }

    if (req.method !== 'POST') {
      return errorResponse('Método não permitido', 405)
    }

    // Verificar autenticação JWT (via Supabase Auth)
    const { user, error: authError } = await verifyAdminToken(req)
    if (authError) return authError

    const contentType = req.headers.get('content-type') || ''
    if (!contentType.includes('application/json')) {
      return errorResponse('Content-Type deve ser application/json', 415)
    }

    const body: AdminOperacaoRequest = await req.json()

    if (!body.operacao || !body.jogo_id) {
      return errorResponse('Campos "operacao" e "jogo_id" são obrigatórios', 400)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // ============================================
    // OPERAÇÃO: SALVAR RESULTADO
    // ============================================
    if (body.operacao === 'salvar_resultado') {
      if (body.gols_casa === undefined || body.gols_fora === undefined) {
        return errorResponse('Campos "gols_casa" e "gols_fora" são obrigatórios', 400)
      }

      // Buscar dados antigos para auditoria
      const { data: oldData } = await supabase
        .from('resultados')
        .select('*')
        .eq('jogo_id', body.jogo_id)
        .single()

      // Upsert resultado
      const { error: upsertError } = await supabase
        .from('resultados')
        .upsert({
          jogo_id: body.jogo_id,
          gols_casa: body.gols_casa,
          gols_fora: body.gols_fora,
          updated_at: new Date().toISOString(),
        })

      if (upsertError) {
        console.error('Erro ao salvar resultado:', upsertError)
        return errorResponse('Erro ao salvar resultado', 500)
      }

      // Registrar auditoria
      await supabase
        .from('audit_logs')
        .insert({
          admin_email: user!.email,
          operacao: 'salvar_resultado',
          jogo_id: body.jogo_id,
          dados_antigos: oldData ? { gols_casa: oldData.gols_casa, gols_fora: oldData.gols_fora } : null,
          dados_novos: { gols_casa: body.gols_casa, gols_fora: body.gols_fora },
          status: 'sucesso',
        })
        .select()
        .then(() => {})
        .catch(e => console.error('Audit log error:', e))

      return successResponse({
        jogo_id: body.jogo_id,
        gols_casa: body.gols_casa,
        gols_fora: body.gols_fora,
      })
    }

    // ============================================
    // OPERAÇÃO: LIBERAR JOGO
    // ============================================
    if (body.operacao === 'liberar_jogo') {
      if (body.liberado === undefined) {
        return errorResponse('Campo "liberado" é obrigatório', 400)
      }

      // Buscar dados antigos para auditoria
      const { data: oldData } = await supabase
        .from('jogos_liberados')
        .select('*')
        .eq('jogo_id', body.jogo_id)
        .single()

      // Upsert liberação
      const { error: upsertError } = await supabase
        .from('jogos_liberados')
        .upsert({
          jogo_id: body.jogo_id,
          liberado: body.liberado,
        })

      if (upsertError) {
        console.error('Erro ao liberar jogo:', upsertError)
        return errorResponse('Erro ao liberar jogo', 500)
      }

      // Registrar auditoria
      await supabase
        .from('audit_logs')
        .insert({
          admin_email: user!.email,
          operacao: 'liberar_jogo',
          jogo_id: body.jogo_id,
          dados_antigos: oldData ? { liberado: oldData.liberado } : null,
          dados_novos: { liberado: body.liberado },
          status: 'sucesso',
        })
        .select()
        .then(() => {})
        .catch(e => console.error('Audit log error:', e))

      return successResponse({
        jogo_id: body.jogo_id,
        liberado: body.liberado,
      })
    }

    // Operação inválida
    return errorResponse(
      'Operação inválida. Use "salvar_resultado" ou "liberar_jogo"',
      400
    )
  } catch (error) {
    return handleError(error, 'admin-operations')
  }
})
