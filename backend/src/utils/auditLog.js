const { getDb } = require('../config/database');

/**
 * Registra entrada no log de auditoria imutável.
 * Portaria MTE 671/2021 exige rastreabilidade total de alterações.
 */
function audit(tabela, registroId, acao, dadosAntes, dadosDepois, usuarioId, ipOrigem) {
  try {
    const db = getDb();
    db.prepare(`
      INSERT INTO audit_log (tabela, registro_id, acao, dados_antes, dados_depois, usuario_id, ip_origem)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      tabela,
      registroId,
      acao,
      dadosAntes ? JSON.stringify(dadosAntes) : null,
      dadosDepois ? JSON.stringify(dadosDepois) : null,
      usuarioId || null,
      ipOrigem || null
    );
  } catch (err) {
    // Log de auditoria nunca deve quebrar a operação principal
    console.error('Erro ao registrar auditoria:', err.message);
  }
}

module.exports = { audit };
