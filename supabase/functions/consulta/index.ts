// GET /consulta?documento=XXX — Consulta de participante por CPF/CNPJ
// Retorna dados com documento mascarado + pontuação

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
    const { allowed, retryAfter } = await checkRateLimit(ip, 'consulta')
    if (!allowed) {
      return errorResponse(
        `Muitas requisições. Tente novamente em ${retryAfter} segundos.`,
        429
      )
    }

    if (req.method !== 'GET') {
      return errorResponse('Método não permitido', 405)
    }

    // Extrair documento da query string
    const url = new URL(req.url)
    const documentoRaw = url.searchParams.get('documento')
    if (!documentoRaw) {
      return errorResponse('Parâmetro "documento" é obrigatório', 400)
    }

    const documento = documentoRaw.replace(/\D/g, '')
    if (documento.length !== 11 && documento.length !== 14) {
      return errorResponse('Documento inválido', 400)
    }

    // Buscar participante
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: participante, error } = await supabase
      .from('participantes')
      .select('*')
      .eq('documento', documento)
      .single()

    if (error || !participante) {
      return errorResponse('Documento não encontrado', 404)
    }

    // Mascarar documento
    let documentoMascarado: string
    if (participante.tipo_documento === 'cpf') {
      documentoMascarado = participante.documento.replace(
        /^(\d{3})(\d{3})(\d{3})(\d{2})$/,
        '***.$2.$3-**'
      )
    } else {
      documentoMascarado = participante.documento.replace(
        /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
        '**$2.$3/****-$5'
      )
    }

    return successResponse({
      nome: participante.nome,
      documento: documentoMascarado,
      palpites: participante.palpites || [],
      pontos: participante.pontos || 0,
      acertos_exatos: participante.acertos_exatos || 0,
    })
  } catch (error) {
    return handleError(error, 'consulta')
  }
})
