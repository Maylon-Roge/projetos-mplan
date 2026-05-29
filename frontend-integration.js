// ============================================
// FRONT-END INTEGRATION — Bolão Copa 2026
// Substitui as chamadas diretas ao Supabase REST API
// por chamadas às Edge Functions
// ============================================

const API_BASE = 'https://shyvzreadwnvgovgrqek.supabase.co/functions/v1'

// Extrai JWT do sessionStorage (salvo pelo admin login)
function getAdminToken() {
  return sessionStorage.getItem('bolao_admin_token')
}

// ============================================
// CADASTRO
// ============================================

async function cadastrarParticipante(dados) {
  const res = await fetch(API_BASE + '/cadastrar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(dados),
  })

  const json = await res.json()

  if (!res.ok) {
    if (res.status === 429) {
      const retryAfter = res.headers.get('Retry-After') || '60'
      throw new Error('Muitas tentativas. Aguarde ' + retryAfter + ' segundos.')
    }
    if (res.status === 409) {
      throw new Error('Este CPF/CNPJ já está cadastrado!')
    }
    throw new Error(json.error || 'Erro ao cadastrar')
  }

  return json.data
}

// ============================================
// CONSULTA
// ============================================

async function consultarParticipante(documento) {
  const doc = documento.replace(/\D/g, '')
  const res = await fetch(API_BASE + '/consulta?documento=' + doc)

  const json = await res.json()

  if (!res.ok) {
    if (res.status === 404) {
      throw new Error('Documento não encontrado. Você já se cadastrou?')
    }
    if (res.status === 429) {
      throw new Error('Muitas consultas. Aguarde um momento.')
    }
    throw new Error(json.error || 'Erro ao consultar')
  }

  return json.data
}

// ============================================
// RANKING
// ============================================

async function getRanking(limit, offset) {
  limit = limit || 100
  offset = offset || 0
  const res = await fetch(API_BASE + '/ranking?limit=' + limit + '&offset=' + offset)

  const json = await res.json()

  if (!res.ok) {
    throw new Error(json.error || 'Erro ao carregar ranking')
  }

  return json.data
}

// ============================================
// ADMIN — OPERAÇÕES
// ============================================

async function adminOperacao(operacao, dados) {
  const token = getAdminToken()
  if (!token) {
    throw new Error('Sessão expirada. Faça login novamente.')
  }

  const res = await fetch(API_BASE + '/admin-operations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token,
    },
    body: JSON.stringify({ operacao: operacao, ...dados }),
  })

  const json = await res.json()

  if (!res.ok) {
    if (res.status === 401) {
      sessionStorage.removeItem('bolao_admin_token')
      throw new Error('Sessão expirada. Faça login novamente.')
    }
    throw new Error(json.error || 'Erro na operação')
  }

  return json.data
}

// ============================================
// HEALTH CHECK
// ============================================

async function healthCheck() {
  const res = await fetch(API_BASE + '/health')
  const json = await res.json()
  return json.data
}
