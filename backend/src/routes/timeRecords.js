const express = require('express');
const { getDb } = require('../config/database');
const { requireAuth, terminalAuth } = require('../middleware/auth');
const { audit } = require('../utils/auditLog');
const { detectPunchType, calcDayTotals } = require('../utils/worktime');
const syncService = require('../services/syncService');

const router = express.Router();

// ==========================================
// POST /api/time-records/punch
// Registra batida de ponto (terminal ou admin)
// ==========================================
router.post('/punch', terminalAuth, (req, res) => {
  const {
    employee_id, tipo, metodo, confianca,
    latitude, longitude, dispositivo, observacao, timestamp
  } = req.body;

  if (!employee_id || !metodo) {
    return res.status(400).json({ error: 'employee_id e metodo são obrigatórios' });
  }

  const db = getDb();

  // Verificar funcionário ativo
  const emp = db.prepare('SELECT id, nome, ativo FROM employees WHERE id = ? AND ativo = 1').get(employee_id);
  if (!emp) return res.status(404).json({ error: 'Funcionário não encontrado ou inativo' });

  const now = timestamp ? new Date(timestamp) : new Date();
  const data = now.toISOString().split('T')[0];
  const hora = now.toTimeString().split(' ')[0].substring(0, 5);

  // Registros do dia atual
  const todayRecords = db.prepare(`
    SELECT tipo, hora FROM time_records
    WHERE employee_id = ? AND data = ?
    ORDER BY hora ASC
  `).all(employee_id, data);

  // Jornada prevista do dia
  const schedule = db.prepare(`
    SELECT * FROM work_schedules
    WHERE employee_id = ? AND data = ?
  `).get(employee_id, data);

  // Detectar tipo automaticamente se não fornecido
  const tipoDetectado = tipo || detectPunchType(todayRecords, schedule);

  // Verificar batida duplicada (mesma tipo nos últimos 5 minutos)
  const dupCheck = db.prepare(`
    SELECT id FROM time_records
    WHERE employee_id = ? AND data = ? AND tipo = ?
    AND abs(strftime('%s', hora) - strftime('%s', ?)) < 300
  `).get(employee_id, data, tipoDetectado, hora);

  if (dupCheck) {
    return res.status(409).json({
      error: 'Registro duplicado detectado',
      message: `Já existe uma batida de "${tipoDetectado}" registrada nos últimos 5 minutos`,
    });
  }

  const result = db.prepare(`
    INSERT INTO time_records (
      employee_id, tipo, timestamp, data, hora, metodo,
      confianca, ip_origem, dispositivo, latitude, longitude, observacao
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    employee_id, tipoDetectado,
    now.toISOString(), data, hora, metodo,
    confianca || null, req.ip,
    dispositivo || 'terminal', latitude || null, longitude || null,
    observacao || null
  );

  const record = db.prepare('SELECT * FROM time_records WHERE rowid = ?').get(result.lastInsertRowid);

  audit('time_records', record.id, 'INSERT', null, record,
    req.user?.id || 'terminal', req.ip);

  // Agendar sincronização Supabase em background
  syncService.queueSync('time_records', record.id, 'INSERT', record);

  res.status(201).json({
    message: `Ponto registrado: ${tipoDetectado}`,
    record: {
      id: record.id,
      tipo: record.tipo,
      hora: record.hora,
      data: record.data,
      metodo: record.metodo,
      funcionario: emp.nome,
    },
  });
});

// ==========================================
// POST /api/time-records/verify-pin
// Valida PIN e retorna dados do funcionário
// ==========================================
router.post('/verify-pin', terminalAuth, (req, res) => {
  const { pin } = req.body;
  if (!pin) return res.status(400).json({ error: 'PIN obrigatório' });

  const bcrypt = require('bcryptjs');
  const db = getDb();

  const employees = db.prepare(`
    SELECT id, nome, cargo, pin_hash FROM employees WHERE ativo = 1 AND pin_hash IS NOT NULL
  `).all();

  const matched = employees.find(emp => bcrypt.compareSync(String(pin), emp.pin_hash));

  if (!matched) {
    return res.status(401).json({ error: 'PIN inválido' });
  }

  res.json({ employee: { id: matched.id, nome: matched.nome, cargo: matched.cargo } });
});

// ==========================================
// GET /api/time-records
// Listar registros (admin)
// ==========================================
router.get('/', requireAuth, (req, res) => {
  const { employee_id, data_inicio, data_fim, tipo, page = 1, limit = 50 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const db = getDb();
  let query = `
    SELECT tr.*, e.nome as funcionario_nome, e.cargo
    FROM time_records tr
    JOIN employees e ON e.id = tr.employee_id
    WHERE 1=1
  `;
  const params = [];

  if (employee_id) { query += ' AND tr.employee_id = ?'; params.push(employee_id); }
  if (data_inicio) { query += ' AND tr.data >= ?'; params.push(data_inicio); }
  if (data_fim) { query += ' AND tr.data <= ?'; params.push(data_fim); }
  if (tipo) { query += ' AND tr.tipo = ?'; params.push(tipo); }

  const total = db.prepare(`SELECT COUNT(*) as cnt FROM (${query})`).get(...params).cnt;

  query += ` ORDER BY tr.data DESC, tr.hora ASC LIMIT ? OFFSET ?`;
  params.push(parseInt(limit), offset);

  const records = db.prepare(query).all(...params);

  res.json({ records, total, page: parseInt(page), pages: Math.ceil(total / limit) });
});

// ==========================================
// GET /api/time-records/today-status
// Status de presença hoje (dashboard)
// ==========================================
router.get('/today-status', requireAuth, (req, res) => {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];

  const status = db.prepare(`
    SELECT
      e.id, e.nome, e.cargo,
      ws.entrada_prevista, ws.saida_prevista, ws.tipo_dia,
      MAX(CASE WHEN tr.tipo = 'entrada' THEN tr.hora END) as entrada,
      MAX(CASE WHEN tr.tipo = 'saida_almoco' THEN tr.hora END) as saida_almoco,
      MAX(CASE WHEN tr.tipo = 'retorno_almoco' THEN tr.hora END) as retorno_almoco,
      MAX(CASE WHEN tr.tipo = 'saida' THEN tr.hora END) as saida,
      COUNT(tr.id) as total_batidas
    FROM employees e
    LEFT JOIN work_schedules ws ON ws.employee_id = e.id AND ws.data = ?
    LEFT JOIN time_records tr ON tr.employee_id = e.id AND tr.data = ?
    WHERE e.ativo = 1
    GROUP BY e.id
    ORDER BY e.nome
  `).all(today, today);

  res.json(status);
});

// ==========================================
// GET /api/time-records/employee/:id/period
// Espelho de ponto por funcionário e período
// ==========================================
router.get('/employee/:id/period', requireAuth, (req, res) => {
  const { data_inicio, data_fim } = req.query;

  if (!data_inicio || !data_fim) {
    return res.status(400).json({ error: 'data_inicio e data_fim são obrigatórios' });
  }

  const db = getDb();
  const emp = db.prepare(`
    SELECT id, nome, cpf, cargo, jornada_padrao FROM employees WHERE id = ?
  `).get(req.params.id);

  if (!emp) return res.status(404).json({ error: 'Funcionário não encontrado' });

  const records = db.prepare(`
    SELECT tipo, timestamp, data, hora, metodo, confianca, ajustado, observacao
    FROM time_records
    WHERE employee_id = ? AND data BETWEEN ? AND ?
    ORDER BY data ASC, hora ASC
  `).all(req.params.id, data_inicio, data_fim);

  // Agrupar por dia
  const byDay = {};
  for (const r of records) {
    if (!byDay[r.data]) byDay[r.data] = [];
    byDay[r.data].push(r);
  }

  // Calcular totais por dia
  const days = Object.keys(byDay).sort().map(data => {
    const dayRecords = byDay[data];
    const schedule = db.prepare(`
      SELECT * FROM work_schedules WHERE employee_id = ? AND data = ?
    `).get(req.params.id, data);

    const holiday = db.prepare(`
      SELECT nome FROM holidays WHERE data = ?
    `).get(data);

    const totals = calcDayTotals(dayRecords, schedule);

    return { data, registros: dayRecords, schedule, holiday, totals };
  });

  res.json({ employee: emp, period: { inicio: data_inicio, fim: data_fim }, days });
});

// ==========================================
// DELETE /api/time-records/:id (soft — marca ajustado)
// ==========================================
router.delete('/:id', requireAuth, requireProfile('super_admin', 'rh_gestor'), (req, res) => {
  const db = getDb();
  const record = db.prepare('SELECT * FROM time_records WHERE id = ?').get(req.params.id);
  if (!record) return res.status(404).json({ error: 'Registro não encontrado' });

  db.prepare(`
    UPDATE time_records SET ajustado = 1, observacao = ?, sincronizado = 0
    WHERE id = ?
  `).run(`Excluído por ${req.user.nome} em ${new Date().toLocaleString('pt-BR')}`, req.params.id);

  audit('time_records', req.params.id, 'DELETE', record, null, req.user.id, req.ip);
  res.json({ message: 'Registro marcado como excluído' });
});

module.exports = router;
