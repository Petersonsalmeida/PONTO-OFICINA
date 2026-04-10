require('dotenv').config();
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.SQLITE_PATH || './database/ponto.db';

// Garantir que o diretório existe
const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

const db = new Database(DB_PATH);

console.log('🗄️  Executando migrations do banco SQLite...');

// Habilitar WAL mode para melhor concorrência
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const migrate = db.transaction(() => {
  // ==========================================
  // TABELA: employees (funcionários)
  // ==========================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS employees (
      id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      nome        TEXT NOT NULL,
      cpf         TEXT NOT NULL UNIQUE,
      cargo       TEXT NOT NULL,
      departamento TEXT,
      jornada_padrao TEXT NOT NULL DEFAULT '08:00-12:00,13:00-17:00',
      escala      TEXT NOT NULL DEFAULT 'fixo',
      turno       TEXT NOT NULL DEFAULT 'dia',
      carga_horaria_semanal INTEGER NOT NULL DEFAULT 44,
      template_facial TEXT,
      pin_hash    TEXT,
      foto_url    TEXT,
      telefone    TEXT,
      email       TEXT,
      data_admissao TEXT,
      ativo       INTEGER NOT NULL DEFAULT 1,
      perfil      TEXT NOT NULL DEFAULT 'funcionario',
      criado_em   TEXT NOT NULL DEFAULT (datetime('now')),
      atualizado_em TEXT NOT NULL DEFAULT (datetime('now')),
      sincronizado INTEGER NOT NULL DEFAULT 0
    );
  `);

  // ==========================================
  // TABELA: time_records (registros de ponto)
  // ==========================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS time_records (
      id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      employee_id  TEXT NOT NULL,
      tipo         TEXT NOT NULL CHECK(tipo IN ('entrada','saida_almoco','retorno_almoco','saida','extra')),
      timestamp    TEXT NOT NULL DEFAULT (datetime('now')),
      data         TEXT NOT NULL DEFAULT (date('now')),
      hora         TEXT NOT NULL DEFAULT (time('now')),
      metodo       TEXT NOT NULL CHECK(metodo IN ('facial','pin','manual','correcao')),
      confianca    REAL,
      ip_origem    TEXT,
      dispositivo  TEXT,
      latitude     REAL,
      longitude    REAL,
      observacao   TEXT,
      ajustado     INTEGER NOT NULL DEFAULT 0,
      sincronizado INTEGER NOT NULL DEFAULT 0,
      criado_em    TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (employee_id) REFERENCES employees(id)
    );
  `);

  // ==========================================
  // TABELA: work_schedules (escalas/jornadas)
  // ==========================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS work_schedules (
      id                TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      employee_id       TEXT NOT NULL,
      data              TEXT NOT NULL,
      dia_semana        INTEGER,
      entrada_prevista  TEXT,
      saida_almoco_prevista TEXT,
      retorno_almoco_previsto TEXT,
      saida_prevista    TEXT,
      tipo_dia          TEXT NOT NULL DEFAULT 'normal' CHECK(tipo_dia IN ('normal','folga','feriado','ferias','afastamento')),
      observacao        TEXT,
      criado_em         TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (employee_id) REFERENCES employees(id),
      UNIQUE(employee_id, data)
    );
  `);

  // ==========================================
  // TABELA: time_corrections (correções/ajustes)
  // ==========================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS time_corrections (
      id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      record_id     TEXT,
      employee_id   TEXT NOT NULL,
      tipo          TEXT NOT NULL CHECK(tipo IN ('inclusao','exclusao','alteracao')),
      timestamp_original TEXT,
      timestamp_novo TEXT,
      tipo_original TEXT,
      tipo_novo     TEXT,
      motivo        TEXT NOT NULL,
      solicitante_id TEXT,
      aprovador_id  TEXT,
      status        TEXT NOT NULL DEFAULT 'pendente' CHECK(status IN ('pendente','aprovado','rejeitado')),
      aprovado_em   TEXT,
      observacao_aprovador TEXT,
      criado_em     TEXT NOT NULL DEFAULT (datetime('now')),
      sincronizado  INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (record_id) REFERENCES time_records(id),
      FOREIGN KEY (employee_id) REFERENCES employees(id)
    );
  `);

  // ==========================================
  // TABELA: hour_bank (banco de horas)
  // ==========================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS hour_bank (
      id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      employee_id     TEXT NOT NULL,
      mes             TEXT NOT NULL,
      horas_normais   INTEGER NOT NULL DEFAULT 0,
      horas_extras_50 INTEGER NOT NULL DEFAULT 0,
      horas_extras_100 INTEGER NOT NULL DEFAULT 0,
      horas_noturnas  INTEGER NOT NULL DEFAULT 0,
      horas_falta     INTEGER NOT NULL DEFAULT 0,
      dsr             INTEGER NOT NULL DEFAULT 0,
      saldo_minutos   INTEGER NOT NULL DEFAULT 0,
      saldo_acumulado INTEGER NOT NULL DEFAULT 0,
      fechado         INTEGER NOT NULL DEFAULT 0,
      criado_em       TEXT NOT NULL DEFAULT (datetime('now')),
      atualizado_em   TEXT NOT NULL DEFAULT (datetime('now')),
      sincronizado    INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (employee_id) REFERENCES employees(id),
      UNIQUE(employee_id, mes)
    );
  `);

  // ==========================================
  // TABELA: holidays (feriados)
  // ==========================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS holidays (
      id        TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      data      TEXT NOT NULL UNIQUE,
      nome      TEXT NOT NULL,
      tipo      TEXT NOT NULL CHECK(tipo IN ('nacional','estadual_rs','municipal_poa')),
      criado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // ==========================================
  // TABELA: audit_log (log de auditoria imutável)
  // ==========================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      tabela      TEXT NOT NULL,
      registro_id TEXT NOT NULL,
      acao        TEXT NOT NULL CHECK(acao IN ('INSERT','UPDATE','DELETE')),
      dados_antes TEXT,
      dados_depois TEXT,
      usuario_id  TEXT,
      ip_origem   TEXT,
      timestamp   TEXT NOT NULL DEFAULT (datetime('now')),
      sincronizado INTEGER NOT NULL DEFAULT 0
    );
  `);

  // ==========================================
  // TABELA: company_config (configurações)
  // ==========================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS company_config (
      chave TEXT PRIMARY KEY,
      valor TEXT NOT NULL,
      descricao TEXT,
      atualizado_em TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // ==========================================
  // TABELA: sync_queue (fila de sincronização)
  // ==========================================
  db.exec(`
    CREATE TABLE IF NOT EXISTS sync_queue (
      id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      tabela      TEXT NOT NULL,
      registro_id TEXT NOT NULL,
      operacao    TEXT NOT NULL CHECK(operacao IN ('INSERT','UPDATE','DELETE')),
      dados       TEXT NOT NULL,
      tentativas  INTEGER NOT NULL DEFAULT 0,
      ultimo_erro TEXT,
      criado_em   TEXT NOT NULL DEFAULT (datetime('now')),
      processado  INTEGER NOT NULL DEFAULT 0
    );
  `);

  // ==========================================
  // ÍNDICES para performance
  // ==========================================
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_time_records_employee_data
      ON time_records(employee_id, data);
    CREATE INDEX IF NOT EXISTS idx_time_records_sincronizado
      ON time_records(sincronizado);
    CREATE INDEX IF NOT EXISTS idx_time_records_timestamp
      ON time_records(timestamp);
    CREATE INDEX IF NOT EXISTS idx_work_schedules_employee_data
      ON work_schedules(employee_id, data);
    CREATE INDEX IF NOT EXISTS idx_hour_bank_employee_mes
      ON hour_bank(employee_id, mes);
    CREATE INDEX IF NOT EXISTS idx_audit_log_tabela
      ON audit_log(tabela, registro_id);
    CREATE INDEX IF NOT EXISTS idx_sync_queue_processado
      ON sync_queue(processado, tentativas);
  `);

  // ==========================================
  // CONFIGURAÇÕES padrão da empresa
  // ==========================================
  const configStmt = db.prepare(`
    INSERT OR IGNORE INTO company_config (chave, valor, descricao) VALUES (?, ?, ?)
  `);

  const configs = [
    ['empresa_nome', 'Centro Automotivo Aliança', 'Nome da empresa'],
    ['empresa_cnpj', '00.000.000/0001-00', 'CNPJ da empresa'],
    ['empresa_endereco', 'Porto Alegre, RS', 'Endereço da empresa'],
    ['empresa_telefone', '(51) 99999-9999', 'Telefone da empresa'],
    ['tolerancia_entrada_min', '5', 'Tolerância de atraso na entrada (minutos)'],
    ['tolerancia_saida_min', '5', 'Tolerância de saída antecipada (minutos)'],
    ['alerta_atraso_min', '15', 'Alertar atraso após X minutos do horário previsto'],
    ['alerta_jornada_aberta_h', '10', 'Alertar jornada aberta após X horas'],
    ['reconhecimento_facial_min_confianca', '60', 'Confiança mínima para reconhecimento facial (%)'],
    ['reconhecimento_facial_auto_confianca', '85', 'Confiança para registro automático (%)'],
    ['adicional_noturno_inicio', '22:00', 'Início do adicional noturno'],
    ['adicional_noturno_fim', '05:00', 'Fim do adicional noturno'],
    ['percentual_he_50', '50', 'Percentual hora extra 50%'],
    ['percentual_he_100', '100', 'Percentual hora extra 100% (feriados/DSR)'],
    ['percentual_noturno', '20', 'Percentual adicional noturno'],
    ['intervalo_almoco_min', '60', 'Tempo mínimo de almoço (minutos)'],
    ['jornada_maxima_h', '10', 'Jornada máxima sem alertar (horas)'],
    ['version', '1.0.0', 'Versão do sistema'],
  ];

  for (const [chave, valor, descricao] of configs) {
    configStmt.run(chave, valor, descricao);
  }

  console.log('✅ Tabelas criadas com sucesso');
});

migrate();

// ==========================================
// FERIADOS 2024-2026 (RS + Porto Alegre)
// ==========================================
const insertHoliday = db.prepare(`
  INSERT OR IGNORE INTO holidays (data, nome, tipo) VALUES (?, ?, ?)
`);

const holidays = [
  // Nacionais 2024
  ['2024-01-01', 'Confraternização Universal', 'nacional'],
  ['2024-02-12', 'Carnaval', 'nacional'],
  ['2024-02-13', 'Carnaval', 'nacional'],
  ['2024-03-29', 'Sexta-feira Santa', 'nacional'],
  ['2024-04-21', 'Tiradentes', 'nacional'],
  ['2024-05-01', 'Dia do Trabalho', 'nacional'],
  ['2024-05-30', 'Corpus Christi', 'nacional'],
  ['2024-09-07', 'Independência do Brasil', 'nacional'],
  ['2024-10-12', 'Nossa Sra. Aparecida', 'nacional'],
  ['2024-11-02', 'Finados', 'nacional'],
  ['2024-11-15', 'Proclamação da República', 'nacional'],
  ['2024-11-20', 'Consciência Negra', 'nacional'],
  ['2024-12-25', 'Natal', 'nacional'],
  // Estaduais RS 2024
  ['2024-09-20', 'Revolução Farroupilha', 'estadual_rs'],
  // Municipais POA 2024
  ['2024-03-01', 'Fundação de Porto Alegre', 'municipal_poa'],
  ['2024-11-02', 'Finados (Municipal)', 'municipal_poa'],

  // Nacionais 2025
  ['2025-01-01', 'Confraternização Universal', 'nacional'],
  ['2025-03-03', 'Carnaval', 'nacional'],
  ['2025-03-04', 'Carnaval', 'nacional'],
  ['2025-04-18', 'Sexta-feira Santa', 'nacional'],
  ['2025-04-21', 'Tiradentes', 'nacional'],
  ['2025-05-01', 'Dia do Trabalho', 'nacional'],
  ['2025-06-19', 'Corpus Christi', 'nacional'],
  ['2025-09-07', 'Independência do Brasil', 'nacional'],
  ['2025-10-12', 'Nossa Sra. Aparecida', 'nacional'],
  ['2025-11-02', 'Finados', 'nacional'],
  ['2025-11-15', 'Proclamação da República', 'nacional'],
  ['2025-11-20', 'Consciência Negra', 'nacional'],
  ['2025-12-25', 'Natal', 'nacional'],
  // Estaduais RS 2025
  ['2025-09-20', 'Revolução Farroupilha', 'estadual_rs'],
  // Municipais POA 2025
  ['2025-03-26', 'Fundação de Porto Alegre', 'municipal_poa'],

  // Nacionais 2026
  ['2026-01-01', 'Confraternização Universal', 'nacional'],
  ['2026-02-16', 'Carnaval', 'nacional'],
  ['2026-02-17', 'Carnaval', 'nacional'],
  ['2026-04-03', 'Sexta-feira Santa', 'nacional'],
  ['2026-04-21', 'Tiradentes', 'nacional'],
  ['2026-05-01', 'Dia do Trabalho', 'nacional'],
  ['2026-06-04', 'Corpus Christi', 'nacional'],
  ['2026-09-07', 'Independência do Brasil', 'nacional'],
  ['2026-10-12', 'Nossa Sra. Aparecida', 'nacional'],
  ['2026-11-02', 'Finados', 'nacional'],
  ['2026-11-15', 'Proclamação da República', 'nacional'],
  ['2026-11-20', 'Consciência Negra', 'nacional'],
  ['2026-12-25', 'Natal', 'nacional'],
  // Estaduais RS 2026
  ['2026-09-20', 'Revolução Farroupilha', 'estadual_rs'],
];

const insertHolidays = db.transaction(() => {
  for (const [data, nome, tipo] of holidays) {
    insertHoliday.run(data, nome, tipo);
  }
  console.log(`✅ ${holidays.length} feriados cadastrados`);
});

insertHolidays();

db.close();
console.log('✅ Migration concluída com sucesso!');
