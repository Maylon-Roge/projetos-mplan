// Helpers de resposta HTTP unificada para Edge Functions

export function successResponse<T>(data: T, statusCode = 200): Response {
  return new Response(
    JSON.stringify({ success: true, data }),
    {
      status: statusCode,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    }
  );
}

export function errorResponse(
  message: string,
  statusCode = 400,
  code?: string
): Response {
  return new Response(
    JSON.stringify({
      success: false,
      error: message,
      ...(code ? { code } : {}),
    }),
    {
      status: statusCode,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    }
  );
}

// Erros comuns
export const Errors = {
  badRequest: (msg = 'Dados inválidos') => errorResponse(msg, 400),
  unauthorized: (msg = 'Não autorizado') => errorResponse(msg, 401),
  forbidden: (msg = 'Acesso negado') => errorResponse(msg, 403),
  notFound: (msg = 'Não encontrado') => errorResponse(msg, 404),
  conflict: (msg = 'Conflito') => errorResponse(msg, 409),
  rateLimit: (retryAfter = 3600) =>
    new Response(
      JSON.stringify({ success: false, error: 'Muitas requisições. Tente novamente mais tarde.' }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(retryAfter),
          'Access-Control-Allow-Origin': '*',
        },
      }
    ),
  serverError: (msg = 'Erro interno do servidor') => errorResponse(msg, 500),
};
