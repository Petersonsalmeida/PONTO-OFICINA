-- ============================================================
-- PONTO ELETRÔNICO — Centro Automotivo Aliança
-- Execute este script no SQL Editor do Supabase
--
-- Usa schema isolado "ponto" para não conflitar com outros
-- sistemas (ex: controle de estoque) no mesmo projeto.
-- ============================================================

-- 1. Criar schema isolado
CREATE SCHEMA IF NOT EXISTS ponto;

-- Permitir que o service_role acesse o schema
GRANT ALL ON SCHEMA ponto TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA ponto TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA ponto GRANT ALL ON TABLES TO service_role;

-- ============================================================
-- TABELAS
-- ============================================================

CREATE TABLE IF NOT EXISTS ponto.employees (
  id                    TEXT PRIMARY KEY,
  nome                  TEXT NOT NULL,
  cpf                   TEXT NOT NULL UNIQUE,
  cargo                 TEXT NOT NULL,
  departamento          TEXT,
  jornada_padrao        TEXT NOT NULL DEFAULT '08:00-12:00,13:00-17:00',
  escala                TEXT NOT NULL DEFAULT 'fixo',
  turno                 TEXT NOT NULL DEFAULT 'dia',
  carga_horaria_semanal INTEGER NOT NULL DEFAULT 44,
  template_facial       TEXT,   -- AES-256 criptografado (LGPD)
  pin_hash              TEXT,
  foto_url              TEXT,
  telefone              TEXT,
  email                 TEXT,
  data_admissao         TEXT,
  ativo                 INTEGER NOT NULL DEFAULT 1,
  perfil                TEXT NOT NULL DEFAULT 'funcionario',
  criado_em             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sincronizado          INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS ponto.time_records (
  id           TEXT PRIMARY KEY,
  employee_id  TEXT NOT NULL REFERENCES ponto.employees(id),
  tipo         TEXT NOT NULL CHECK(tipo IN ('entrada','saida_almoco','retorno_almoco','saida','extra')),
  timestamp    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  data         TEXT NOT NULL,
  hora         TEXT NOT NULL,
  metodo       TEXT NOT NULL CHECK(metodo IN ('facial','pin','manual','correcao')),
  confianca    REAL,
  ip_origem    TEXT,
  dispositivo  TEXT,
  latitude     REAL,
  longitude    REAL,
  observacao   TEXT,
  ajustado     INTEGER NOT NULL DEFAULT 0,
  sincronizado INTEGER NOT NULL DEFAULT 1,
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ponto.work_schedules (
  id                       TEXT PRIMARY KEY,
  employee_id              TEXT NOT NULL REFERENCES ponto.employees(id),
  data                     TEXT NOT NULL,
  dia_semana               INTEGER,
  entrada_prevista         TEXT,
  saida_almoco_prevista    TEXT,
  retorno_almoco_previsto  TEXT,
  saida_prevista           TEXT,
  tipo_dia                 TEXT NOT NULL DEFAULT 'normal',
  observacao               TEXT,
  criado_em                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(employee_id, data)
);

CREATE TABLE IF NOT EXISTS ponto.time_corrections (
  id                   TEXT PRIMARY KEY,
  record_id            TEXT REFERENCES ponto.time_records(id),
  employee_id          TEXT NOT NULL REFERENCES ponto.employees(id),
  tipo                 TEXT NOT NULL,
  timestamp_original   TIMESTAMPTZ,
  timestamp_novo       TIMESTAMPTZ,
  tipo_original        TEXT,
  tipo_novo            TEXT,
  motivo               TEXT NOT NULL,
  solicitante_id       TEXT,
  aprovador_id         TEXT,
  status               TEXT NOT NULL DEFAULT 'pendente',
  aprovado_em          TIMESTAMPTZ,
  observacao_aprovador TEXT,
  criado_em            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sincronizado         INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS ponto.hour_bank (
  id                TEXT PRIMARY KEY,
  employee_id       TEXT NOT NULL REFERENCES ponto.employees(id),
  mes               TEXT NOT NULL,
  horas_normais     INTEGER NOT NULL DEFAULT 0,
  horas_extras_50   INTEGER NOT NULL DEFAULT 0,
  horas_extras_100  INTEGER NOT NULL DEFAULT 0,
  horas_noturnas    INTEGER NOT NULL DEFAULT 0,
  horas_falta       INTEGER NOT NULL DEFAULT 0,
  dsr               INTEGER NOT NULL DEFAULT 0,
  saldo_minutos     INTEGER NOT NULL DEFAULT 0,
  saldo_acumulado   INTEGER NOT NULL DEFAULT 0,
  fechado           INTEGER NOT NULL DEFAULT 0,
  criado_em         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sincronizado      INTEGER NOT NULL DEFAULT 1,
  UNIQUE(employee_id, mes)
);

CREATE TABLE IF NOT EXISTS ponto.holidays (
  id        TEXT PRIMARY KEY,
  data      TEXT NOT NULL UNIQUE,
  nome      TEXT NOT NULL,
  tipo      TEXT NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ponto.audit_log (
  id           TEXT PRIMARY KEY,
  tabela       TEXT NOT NULL,
  registro_id  TEXT NOT NULL,
  acao         TEXT NOT NULL,
  dados_antes  JSONB,
  dados_depois JSONB,
  usuario_id   TEXT,
  ip_origem    TEXT,
  timestamp    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sincronizado INTEGER NOT NULL DEFAULT 1
);

-- ============================================================
-- ÍNDICES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_tr_employee_data ON ponto.time_records(employee_id, data);
CREATE INDEX IF NOT EXISTS idx_tr_timestamp     ON ponto.time_records(timestamp);
CREATE INDEX IF NOT EXISTS idx_ws_employee_data ON ponto.work_schedules(employee_id, data);
CREATE INDEX IF NOT EXISTS idx_hb_employee_mes  ON ponto.hour_bank(employee_id, mes);
CREATE INDEX IF NOT EXISTS idx_al_tabela        ON ponto.audit_log(tabela, registro_id);

-- ============================================================
-- ROW LEVEL SECURITY (opcional, mas recomendado)
-- O service_role ignora RLS automaticamente.
-- Se quiser expor via anon_key, configure policies aqui.
-- ============================================================
ALTER TABLE ponto.employees       ENABLE ROW LEVEL SECURITY;
ALTER TABLE ponto.time_records    ENABLE ROW LEVEL SECURITY;
ALTER TABLE ponto.time_corrections ENABLE ROW LEVEL SECURITY;
ALTER TABLE ponto.hour_bank       ENABLE ROW LEVEL SECURITY;
ALTER TABLE ponto.audit_log       ENABLE ROW LEVEL SECURITY;

-- Apenas service_role (backend) pode ler/escrever
CREATE POLICY "service_role_only" ON ponto.employees       FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_only" ON ponto.time_records    FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_only" ON ponto.time_corrections FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_only" ON ponto.hour_bank       FOR ALL TO service_role USING (true);
CREATE POLICY "service_role_only" ON ponto.audit_log       FOR ALL TO service_role USING (true);

-- Holidays pode ser lida por qualquer authenticated
ALTER TABLE ponto.holidays ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_holidays" ON ponto.holidays FOR SELECT TO authenticated USING (true);
CREATE POLICY "write_holidays" ON ponto.holidays FOR ALL TO service_role USING (true);

-- ============================================================
-- VERIFICAÇÃO FINAL
-- ============================================================
SELECT
  table_schema,
  table_name,
  (SELECT COUNT(*) FROM information_schema.columns c
   WHERE c.table_schema = t.table_schema AND c.table_name = t.table_name) AS colunas
FROM information_schema.tables t
WHERE table_schema = 'ponto'
ORDER BY table_name;
