-- ============================================
-- CORREÇÃO DAS POLÍTICAS RLS
-- ============================================

-- Remove as políticas antigas
DROP POLICY IF EXISTS "select_own" ON participantes;
DROP POLICY IF EXISTS "insert_anyone" ON participantes;
DROP POLICY IF EXISTS "select_anyone" ON resultados;
DROP POLICY IF EXISTS "admin_only" ON resultados;
DROP POLICY IF EXISTS "admin_only_update" ON resultados;
DROP POLICY IF EXISTS "select_anyone_liberados" ON jogos_liberados;
DROP POLICY IF EXISTS "admin_only_liberados" ON jogos_liberados;
DROP POLICY IF EXISTS "admin_only_update_liberados" ON jogos_liberados;

-- ============================================
-- PARTICIPANTES
-- ============================================

-- Qualquer um pode inserir (cadastro)
CREATE POLICY "insert_anyone" ON participantes
  FOR INSERT WITH CHECK (true);

-- Qualquer um pode ler (ranking + consulta)
CREATE POLICY "select_anyone" ON participantes
  FOR SELECT USING (true);

-- Ninguém pode atualizar ou excluir (só pelo service_role)
-- (por padrão, sem policy = bloqueado)

-- ============================================
-- RESULTADOS
-- ============================================

-- Qualquer um pode ler
CREATE POLICY "select_anyone" ON resultados
  FOR SELECT USING (true);

-- Só usuário autenticado (admin) pode inserir
CREATE POLICY "insert_admin" ON resultados
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Só admin pode atualizar
CREATE POLICY "update_admin" ON resultados
  FOR UPDATE USING (auth.role() = 'authenticated');

-- ============================================
-- JOGOS LIBERADOS
-- ============================================

-- Qualquer um pode ler
CREATE POLICY "select_anyone" ON jogos_liberados
  FOR SELECT USING (true);

-- Só admin pode inserir
CREATE POLICY "insert_admin" ON jogos_liberados
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Só admin pode atualizar
CREATE POLICY "update_admin" ON jogos_liberados
  FOR UPDATE USING (auth.role() = 'authenticated');
