const express = require('express');
const { getDb } = require('../config/database');
const { requireAuth, requireProfile } = require('../middleware/auth');
const { audit } = require('../utils/auditLog');

const router = express.Router();

// ==========================================
// POST /api/corrections — Solicitar ajuste de ponto
// ==========================================
router.post('/', requireAuth, (req, res) => {
  const {
    record_id, employee_id, tipo,
    timestamp_original, timestamp_novo,
    tipo_original, tipo_novo, motivo
  } = req.body;

  if (!employee_id || !tipo || !motivo) {
    return res.status(400).json({ error: 'employee_id, tipo e motivo são obrigatórios' });
  }

  const db = getDb();

  // Funcionário só pode pedir correção do próprio ponto
  const targetEmpId = employee_id;
  if (req.user.perfil === 'funcionario' && req.user.id !== targetEmpId) {
    return res.status(403).json({ error: 'Você só pode solicitar ajustes do próprio ponto' });
  }

  const result = db.prepare(`
    INSERT INTO time_corrections (
      record_id, employee_id, tipo, timestamp_original, timestamp_novo,
      tipo_original, tipo_novo, motivo, solicitante_id, status
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendente')
  `).run(
    record_id || null, targetEmpId, tipo,
    timestamp_original || null, timestamp_novo || null,
    tipo_original || null, tipo_novo || null,
    motivo, req.user.id
  );

  const corr = db.prepare('SELECT * FROM time_corrections WHERE rowid = ?').get(result.lastInsertRowid);
  audit('time_corrections', corr.id, 'INSERT', null, corr, req.user.id, req.ip);

  res.status(201).json({ message: 'Solicitação de ajuste enviada', correction: corr });
});

// ==========================================
// GET /api/corrections — Listar solicitações
// ==========================================
router.get('/', requireAuth, (req, res) => {
  const { status, employee_id } = req.query;
  const db = getDb();

  let query = `
    SELECT tc.*,
      e.nome as funcionario_nome, e.cpf as funcionario_cpf,
      s.nome as solicitante_nome, a.nome as aprovador_nome,
      tr.tipo as registro_tipo, tr.data as registro_data, tr.hora as registro_hora
    FROM time_corrections tc
    JOIN employees e ON e.id = tc.employee_id
    LEFT JOIN employees s ON s.id = tc.solicitante_id
    LEFT JOIN employees a ON a.id = tc.aprovador_id
    LEFT JOIN time_records tr ON tr.id = tc.record_id
    WHERE 1=1
  `;
  const params = [];

  // Funcionário vê apenas as próprias
  if (req.user.perfil === 'funcionario') {
    query += ' AND tc.employee_id = ?'; params.push(req.user.id);
  } else if (employee_id) {
    query += ' AND tc.employee_id = ?'; params.push(employee_id);
  }

  if (status) { query += ' AND tc.status = ?'; params.push(status); }

  query += ' ORDER BY tc.criado_em DESC';

  const corrections = db.prepare(query).all(...params);
  res.json(corrections);
});

// ==========================================
// PATCH /api/corrections/:id/approve — Aprovar/Rejeitar
// ==========================================
router.patch('/:id/approve', requireAuth, requireProfile('super_admin', 'rh_gestor', 'lider_equipe'), (req, res) => {
  const { status, observacao } = req.body;

  if (!['aprovado', 'rejeitado'].includes(status)) {
    return res.status(400).json({ error: 'Status deve ser "aprovado" ou "rejeitado"' });
  }

  const db = getDb();
  const corr = db.prepare(`
    SELECT * FROM time_corrections WHERE id = ? AND status = 'pendente'
  `).get(req.params.id);

  if (!corr) return res.status(404).json({ error: 'Solicitação não encontrada ou já processada' });

  const updatedAt = new Date().toISOString();

  db.prepare(`
    UPDATE time_corrections SET
      status = ?, aprovador_id = ?, observacao_aprovador = ?,
      aprovado_em = ?, sincronizado = 0
    WHERE id = ?
  `).run(status, req.user.id, observacao || null, updatedAt, req.params.id);

  // Se aprovado, aplicar a correção no registro de ponto
  if (status === 'aprovado') {
    if (corr.tipo === 'inclusao' && corr.timestamp_novo) {
      const ts = new Date(corr.timestamp_novo);
      db.prepare(`
        INSERT INTO time_records (employee_id, tipo, timestamp, data, hora, metodo, observacao, ajustado)
        VALUES (?, ?, ?, ?, ?, 'correcao', ?, 1)
      `).run(
        corr.employee_id, corr.tipo_novo || 'entrada',
        corr.timestamp_novo,
        ts.toISOString().split('T')[0],
        ts.toTimeString().substring(0, 5),
        `Correção aprovada: ${corr.motivo}`,
      );
    } else if (corr.tipo === 'alteracao' && corr.record_id && corr.timestamp_novo) {
      const ts = new Date(corr.timestamp_novo);
      db.prepare(`
        UPDATE time_records SET
          timestamp = ?, hora = ?, tipo = ?,
          metodo = 'correcao', ajustado = 1, sincronizado = 0,
          observacao = ?
        WHERE id = ?
      `).run(
        corr.timestamp_novo,
        ts.toTimeString().substring(0, 5),
        corr.tipo_novo || corr.tipo_original,
        `Correção aprovada por ${req.user.nome}: ${corr.motivo}`,
        corr.record_id
      );
    } else if (corr.tipo === 'exclusao' && corr.record_id) {
      db.prepare(`
        UPDATE time_records SET ajustado = 1, sincronizado = 0,
          observacao = ?
        WHERE id = ?
      `).run(`Excluído por correção aprovada: ${corr.motivo}`, corr.record_id);
    }
  }

  audit('time_corrections', req.params.id, 'UPDATE',
    { status: 'pendente' }, { status }, req.user.id, req.ip);

  res.json({ message: `Solicitação ${status} com sucesso` });
});

module.exports = router;
