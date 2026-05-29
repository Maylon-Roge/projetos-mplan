-- ============================================
-- TABELAS DE SUPORTE PARA EDGE FUNCTIONS
-- ============================================

-- Rate limiting: controla requisições por IP e endpoint
CREATE TABLE IF NOT EXISTS rate_limits (
  id BIGSERIAL PRIMARY KEY,
  ip VARCHAR(45) NOT NULL,
  endpoint VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para consulta rápida de rate limit
CREATE INDEX IF NOT EXISTS idx_rate_limits_ip_endpoint
  ON rate_limits(ip, endpoint);

CREATE INDEX IF NOT EXISTS idx_rate_limits_created_at
  ON rate_limits(created_at);

-- Audit logs: registra operações administrativas
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  admin_email VARCHAR(255),
  operacao VARCHAR(100) NOT NULL,
  jogo_id INT,
  dados_antigos JSONB,
  dados_novos JSONB,
  status VARCHAR(20) NOT NULL DEFAULT 'sucesso'
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at
  ON audit_logs(created_at);

CREATE INDEX IF NOT EXISTS idx_audit_logs_admin
  ON audit_logs(admin_email);
