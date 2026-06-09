-- Configuracao dos jogos no Supabase
-- Executar no SQL Editor do Dashboard se precisar recriar
INSERT INTO jogos_config (jogo_id, pais_fora, flag_fora, data, local) VALUES
(1, 'Marrocos', 'ma', '13/06/2026 22:00', 'Nova York/Nova Jersey'),
(2, 'Haiti', 'ht', '20/06/2026 00:30', 'Filadélfia'),
(3, 'Escócia', 'gb-sct', '24/06/2026 22:00', 'Miami'),
(4, 'Portugal', 'pt', '29/06/2026 17:00', 'São Paulo'),
(5, 'Holanda', 'nl', '04/07/2026 21:00', 'Dallas'),
(6, 'A definir', '', '09/07/2026 20:00', 'A definir'),
(7, 'A definir', '', '14/07/2026 19:00', 'A definir'),
(8, 'A definir', '', '19/07/2026 19:00', 'A definir')
ON CONFLICT (jogo_id) DO UPDATE SET
  pais_fora = EXCLUDED.pais_fora,
  flag_fora = EXCLUDED.flag_fora,
  data = EXCLUDED.data,
  local = EXCLUDED.local,
  updated_at = NOW();
