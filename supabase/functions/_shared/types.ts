// Tipos TypeScript compartilhados entre todas as Edge Functions
// Respeita o schema ATUAL do banco de dados

// ============================================
// FORMATO DOS DADOS (schema atual)
// ============================================

// Formato de palpite: array de objetos, como salvo no banco
export interface Palpite {
  jogoId: number;
  casa: number;  // gols do time da casa (ou Brasil)
  fora: number;  // gols do time visitante (ou adversário)
}

// Participante (tabela participantes)
export interface Participante {
  id: number;
  nome: string;
  documento: string;
  tipo_documento: 'cpf' | 'cnpj';
  empresa: string;
  telefone: string;
  palpites: Palpite[];  // JSONB no banco
  pontos: number | null;
  acertos_exatos: number | null;
  created_at: string;
}

// Resultado de jogo (tabela resultados)
export interface Resultado {
  jogo_id: number;
  gols_casa: number;
  gols_fora: number;
  updated_at: string;
}

// Jogo liberado (tabela jogos_liberados)
export interface JogoLiberado {
  jogo_id: number;
  liberado: boolean;
}

// ============================================
// FORMATO DAS REQUISIÇÕES
// ============================================

// Cadastro de participante
export interface CadastroRequest {
  nome: string;
  documento: string;
  tipo_documento: 'cpf' | 'cnpj';
  empresa: string;
  telefone: string;
  palpites: Palpite[];
}

// Consulta por documento
export interface ConsultaQuery {
  documento: string;
}

// Ranking
export interface RankingQuery {
  limit?: number;
  offset?: number;
}

// Operações administrativas
export interface AdminOperacaoRequest {
  operacao: 'salvar_resultado' | 'liberar_jogo';
  jogo_id: number;
  gols_casa?: number;
  gols_fora?: number;
  liberado?: boolean;
}

// ============================================
// FORMATO DAS RESPOSTAS
// ============================================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

export interface RankingEntry {
  posicao: number;
  nome: string;
  pontos: number;
  acertos_exatos: number;
}

export interface RankingData {
  ranking: RankingEntry[];
  total_participantes: number;
  timestamp: string;
}

export interface ConsultaData {
  nome: string;
  documento: string;  // mascarado
  palpites: Palpite[];
  pontos: number;
  acertos_exatos: number;
}

export interface AdminOperacaoData {
  jogo_id: number;
  gols_casa?: number;
  gols_fora?: number;
  liberado?: boolean;
}

export interface HealthData {
  status: 'ok' | 'degraded' | 'down';
  timestamp: string;
  database: {
    connected: boolean;
    latency_ms: number;
  };
  version: string;
}
