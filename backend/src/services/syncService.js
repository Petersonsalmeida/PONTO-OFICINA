/**
 * Serviço de sincronização SQLite → Supabase.
 * Usa fila local para garantir entrega mesmo sem internet.
 */
const { getDb } = require('../config/database');
const { getSupabase } = require('../config/supabase');
const { logger } = require('../middleware/logger');

// Mapa de tabelas SQLite → tabelas Supabase
const TABLE_MAP = {
  employees: 'employees',
  time_records: 'time_records',
  time_corrections: 'time_corrections',
  hour_bank: 'hour_bank',
  audit_log: 'audit_log',
};

/**
 * Adiciona operação na fila de sync
 */
function queueSync(tabela, registroId, operacao, dados) {
  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO sync_queue (tabela, registro_id, operacao, dados)
      VALUES (?, ?, ?, ?)
    `).run(tabela, registroId, operacao, JSON.stringify(dados));
  } catch (err) {
    logger.error(`Erro ao enfileirar sync: ${err.message}`);
  }
}

/**
 * Processa fila de sincronização (chamado pelo cron job)
 */
async function processSyncQueue() {
  const supabase = getSupabase();
  if (!supabase) return; // Supabase não configurado

  const db = getDb();
  const pending = db.prepare(`
    SELECT * FROM sync_queue
    WHERE processado = 0 AND tentativas < 5
    ORDER BY criado_em ASC
    LIMIT 50
  `).all();

  if (pending.length === 0) return;

  logger.info(`Sincronizando ${pending.length} registros com Supabase...`);

  for (const item of pending) {
    try {
      const dados = JSON.parse(item.dados);
      const supabaseTable = TABLE_MAP[item.tabela] || item.tabela;

      let error;
      if (item.operacao === 'INSERT' || item.operacao === 'UPDATE') {
        ({ error } = await supabase
          .from(supabaseTable)
          .upsert(dados, { onConflict: 'id' }));
      } else if (item.operacao === 'DELETE') {
        ({ error } = await supabase
          .from(supabaseTable)
          .delete()
          .eq('id', item.registro_id));
      }

      if (error) throw new Error(error.message);

      // Marcar como processado
      db.prepare(`
        UPDATE sync_queue SET processado = 1 WHERE id = ?
      `).run(item.id);

      // Marcar registro local como sincronizado
      try {
        db.prepare(`UPDATE ${item.tabela} SET sincronizado = 1 WHERE id = ?`).run(item.registro_id);
      } catch { /* tabela pode não ter coluna sincronizado */ }

    } catch (err) {
      logger.error(`Erro ao sincronizar ${item.tabela}/${item.registro_id}: ${err.message}`);
      db.prepare(`
        UPDATE sync_queue SET tentativas = tentativas + 1, ultimo_erro = ? WHERE id = ?
      `).run(err.message, item.id);
    }
  }
}

/**
 * Inicia sync periódico (chamado no startup)
 */
function startSyncScheduler() {
  const supabase = getSupabase();
  if (!supabase) {
    logger.warn('Supabase não configurado. Sync desativado — operando em modo local.');
    return;
  }

  // Processar imediatamente e depois a cada 30 segundos
  processSyncQueue();
  setInterval(processSyncQueue, 30_000);
  logger.info('Sincronização Supabase ativada (intervalo: 30s)');
}

module.exports = { queueSync, processSyncQueue, startSyncScheduler };
