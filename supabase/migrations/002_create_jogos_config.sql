-- Tabela para configuração editável dos jogos (adversário, data, local)
CREATE TABLE IF NOT EXISTS jogos_config (
  jogo_id INTEGER PRIMARY KEY,
  pais_fora TEXT NOT NULL DEFAULT 'A definir',
  flag_fora TEXT NOT NULL DEFAULT '',
  data TEXT NOT NULL DEFAULT '',
  local TEXT NOT NULL DEFAULT 'A definir',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Política de segurança: qualquer um pode ler, só admin autenticado pode escrever
ALTER TABLE jogos_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "jogos_config_select_policy" ON jogos_config
  FOR SELECT USING (true);

CREATE POLICY "jogos_config_insert_policy" ON jogos_config
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "jogos_config_update_policy" ON jogos_config
  FOR UPDATE USING (auth.role() = 'authenticated');
