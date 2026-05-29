// POST /cadastrar — Cadastro de participante com palpites
// Mantém o schema atual: palpites como array [{jogoId, casa, fora}]

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { successResponse, errorResponse } from '../_shared/response.ts'
import { handleCORS, checkRateLimit, handleError } from '../_shared/middleware.ts'
import type { CadastroRequest, Palpite } from '../_shared/types.ts'

serve(async (req: Request) => {
  try {
    // CORS preflight
    const cors = handleCORS(req)
    if (cors) return cors

    // Rate limit por IP
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
    const { allowed, retryAfter } = await checkRateLimit(ip, 'cadastrar')
    if (!allowed) {
      return errorResponse(
        `Muitas requisições. Tente novamente em ${retryAfter} segundos.`,
        429
      )
    }

    // Validar Content-Type
    if (req.method !== 'POST') {
      return errorResponse('Método não permitido', 405)
    }

    const contentType = req.headers.get('content-type') || ''
    if (!contentType.includes('application/json')) {
      return errorResponse('Content-Type deve ser application/json', 415)
    }

    // Parsear body
    const body: CadastroRequest = await req.json()

    // Validações
    const errors: string[] = []

    if (!body.nome || body.nome.trim().length < 3) {
      errors.push('Nome deve ter no mínimo 3 caracteres')
    }
    if (body.nome && body.nome.length > 255) {
      errors.push('Nome deve ter no máximo 255 caracteres')
    }

    const doc = (body.documento || '').replace(/\D/g, '')
    if (!doc) {
      errors.push('Documento é obrigatório')
    } else if (body.tipo_documento === 'cpf' && doc.length !== 11) {
      errors.push('CPF deve ter 11 dígitos')
    } else if (body.tipo_documento === 'cnpj' && doc.length !== 14) {
      errors.push('CNPJ deve ter 14 dígitos')
    } else if (!['cpf', 'cnpj'].includes(body.tipo_documento || '')) {
      errors.push('tipo_documento deve ser "cpf" ou "cnpj"')
    }

    // Empresa obrigatória apenas para CNPJ
    if (body.tipo_documento === 'cnpj' && (!body.empresa || !body.empresa.trim())) {
      errors.push('Empresa é obrigatória para CNPJ')
    }

    if (!body.telefone || body.telefone.replace(/\D/g, '').length < 10) {
      errors.push('Telefone inválido (mínimo 10 dígitos)')
    }

    // Validar palpites (formato array [{jogoId, casa, fora}])
    if (!body.palpites || !Array.isArray(body.palpites) || body.palpites.length === 0) {
      errors.push('Palpites são obrigatórios')
    } else {
      for (const p of body.palpites) {
        if (!p.jogoId || typeof p.casa !== 'number' || typeof p.fora !== 'number') {
          errors.push('Cada palpite deve ter jogoId, casa e fora')
          break
        }
      }
    }

    if (errors.length > 0) {
      return errorResponse(errors.join('; '), 400)
    }

    // Inserir no banco
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data, error } = await supabase
      .from('participantes')
      .insert({
        nome: body.nome.trim(),
        documento: doc,
        tipo_documento: body.tipo_documento,
        empresa: body.empresa?.trim() || '',
        telefone: body.telefone.trim(),
        palpites: body.palpites,
      })
      .select('id, nome')
      .single()

    if (error) {
      // Erro de CPF duplicado (código 23505 do PostgreSQL)
      if (error.code === '23505') {
        return errorResponse('Este CPF/CNPJ já está cadastrado', 409)
      }
      // Erro do trigger de validação de CPF
      if (error.message?.includes('CPF inválido') || error.message?.includes('CNPJ inválido')) {
        return errorResponse(error.message, 400)
      }
      console.error('Insert error:', error)
      return errorResponse('Erro ao cadastrar. Tente novamente.', 500)
    }

    return successResponse({ id: data.id, nome: data.nome }, 201)
  } catch (error) {
    return handleError(error, 'cadastrar')
  }
})
