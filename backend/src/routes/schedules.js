const express = require('express');
const { getDb } = require('../config/database');
const { requireAuth, requireProfile } = require('../middleware/auth');
const { audit } = require('../utils/auditLog');

const router = express.Router();

// ==========================================
// GET /api/schedules — Listar escalas por período
// ==========================================
router.get('/', requireAuth, (req, res) => {
  const { employee_id, data_inicio, data_fim } = req.query;
  const db = getDb();

  let query = `
    SELECT ws.*, e.nome as funcionario_nome
    FROM work_schedules ws
    JOIN employees e ON e.id = ws.employee_id
    WHERE 1=1
  `;
  const params = [];

  if (employee_id) { query += ' AND ws.employee_id = ?'; params.push(employee_id); }
  if (data_inicio) { query += ' AND ws.data >= ?'; params.push(data_inicio); }
  if (data_fim)    { query += ' AND ws.data <= ?'; params.push(data_fim); }

  query += ' ORDER BY ws.data ASC, e.nome ASC';

  res.json(db.prepare(query).all(...params));
});

// ==========================================
// POST /api/schedules — Criar/atualizar escala de um dia
// ==========================================
router.post('/', requireAuth, requireProfile('super_admin', 'rh_gestor', 'lider_equipe'), (req, res) => {
  const {
    employee_id, data, entrada_prevista, saida_almoco_prevista,
    retorno_almoco_previsto, saida_prevista, tipo_dia, observacao
  } = req.body;

  if (!employee_id || !data) {
    return res.status(400).json({ error: 'employee_id e data são obrigatórios' });
  }

  const db = getDb();
  const dow = new Date(data + 'T12:00:00').getDay(); // 0=Dom

  try {
    db.prepare(`
      INSERT INTO work_schedules (
        employee_id, data, dia_semana, entrada_prevista, saida_almoco_prevista,
        retorno_almoco_previsto, saida_prevista, tipo_dia, observacao
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(employee_id, data) DO UPDATE SET
        entrada_prevista = excluded.entrada_prevista,
        saida_almoco_prevista = excluded.saida_almoco_prevista,
        retorno_almoco_previsto = excluded.retorno_almoco_previsto,
        saida_prevista = excluded.saida_prevista,
        tipo_dia = excluded.tipo_dia,
        observacao = excluded.observacao
    `).run(
      employee_id, data, dow,
      entrada_prevista || null, saida_almoco_prevista || null,
      retorno_almoco_previsto || null, saida_prevista || null,
      tipo_dia || 'normal', observacao || null
    );

    audit('work_schedules', `${employee_id}_${data}`, 'INSERT', null,
      { employee_id, data, tipo_dia }, req.user.id, req.ip);

    res.status(201).json({ message: 'Escala salva' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// POST /api/schedules/bulk — Gerar escalas em massa
// Gera jornadas para um funcionário por um mês inteiro
// ==========================================
router.post('/bulk', requireAuth, requireProfile('super_admin', 'rh_gestor'), (req, res) => {
  const { employee_id, mes } = req.body; // mes = "YYYY-MM"

  if (!employee_id || !mes) {
    return res.status(400).json({ error: 'employee_id e mes (YYYY-MM) são obrigatórios' });
  }

  const db = getDb();
  const emp = db.prepare(`
    SELECT id, jornada_padrao, escala, carga_horaria_semanal
    FROM employees WHERE id = ?
  `).get(employee_id);

  if (!emp) return res.status(404).json({ error: 'Funcionário não encontrado' });

  // Parsear jornada padrão: "08:00-12:00,13:00-17:00"
  const parseJornada = (str) => {
    const parts = str.split(',');
    if (parts.length === 1) {
      const [entrada, saida] = parts[0].split('-');
      return { entrada, saida, saidaAlmoco: null, retornoAlmoco: null };
    }
    const [entrada, saidaAlmoco] = parts[0].split('-');
    const [retornoAlmoco, saida] = parts[1].split('-');
    return { entrada, saidaAlmoco, retornoAlmoco, saida };
  };

  const jornada = parseJornada(emp.jornada_padrao || '08:00-12:00,13:00-17:00');

  // Buscar feriados do mês
  const holidays = db.prepare(`
    SELECT data FROM holidays WHERE strftime('%Y-%m', data) = ?
  `).all(mes).map(h => h.data);

  const [ano, mesNum] = mes.split('-').map(Number);
  const diasNoMes = new Date(ano, mesNum, 0).getDate();

  const insert = db.prepare(`
    INSERT OR IGNORE INTO work_schedules (
      employee_id, data, dia_semana, entrada_prevista, saida_almoco_prevista,
      retorno_almoco_previsto, saida_prevista, tipo_dia
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let criados = 0;

  const bulk = db.transaction(() => {
    for (let dia = 1; dia <= diasNoMes; dia++) {
      const dateStr = `${ano}-${String(mesNum).padStart(2,'0')}-${String(dia).padStart(2,'0')}`;
      const dow = new Date(dateStr + 'T12:00:00').getDay();

      let tipoDia = 'normal';
      let entrada = jornada.entrada;
      let saida = jornada.saida;
      let saidaAlmoco = jornada.saidaAlmoco;
      let retornoAlmoco = jornada.retornoAlmoco;

      // Domingo = folga (escala fixo)
      if (dow === 0 && emp.escala === 'fixo') {
        tipoDia = 'folga'; entrada = null; saida = null;
        saidaAlmoco = null; retornoAlmoco = null;
      }
      // Sábado = folga (escala 5x2 / fixo 44h CLT)
      if (dow === 6 && emp.escala === 'fixo') {
        tipoDia = 'folga'; entrada = null; saida = null;
        saidaAlmoco = null; retornoAlmoco = null;
      }
      // Feriado
      if (holidays.includes(dateStr)) {
        tipoDia = 'feriado'; entrada = null; saida = null;
        saidaAlmoco = null; retornoAlmoco = null;
      }

      insert.run(
        employee_id, dateStr, dow,
        entrada, saidaAlmoco, retornoAlmoco, saida, tipoDia
      );
      criados++;
    }
  });

  bulk();

  res.json({
    message: `Escalas geradas para ${mes}`,
    dias_criados: criados,
    funcionario: emp.id,
  });
});

// ==========================================
// DELETE /api/schedules/:employeeId/:data
// ==========================================
router.delete('/:employeeId/:data', requireAuth, requireProfile('super_admin', 'rh_gestor'), (req, res) => {
  const db = getDb();
  db.prepare(`
    DELETE FROM work_schedules WHERE employee_id = ? AND data = ?
  `).run(req.params.employeeId, req.params.data);

  res.json({ message: 'Escala removida' });
});

module.exports = router;
