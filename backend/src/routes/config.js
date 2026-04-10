const express = require('express');
const { getDb } = require('../config/database');
const { requireAuth, requireProfile } = require('../middleware/auth');

const router = express.Router();

// GET /api/config — Retorna todas as configurações
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT chave, valor, descricao FROM company_config').all();
  const config = {};
  for (const r of rows) config[r.chave] = { valor: r.valor, descricao: r.descricao };
  res.json(config);
});

// PUT /api/config — Atualiza configurações
router.put('/', requireAuth, requireProfile('super_admin'), (req, res) => {
  const db = getDb();
  const updates = req.body;

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO company_config (chave, valor, atualizado_em)
    VALUES (?, ?, datetime('now'))
  `);

  const update = db.transaction(() => {
    for (const [chave, valor] of Object.entries(updates)) {
      stmt.run(chave, String(valor));
    }
  });

  update();
  res.json({ message: 'Configurações atualizadas' });
});

// GET /api/config/holidays — Feriados
router.get('/holidays', requireAuth, (req, res) => {
  const { ano } = req.query;
  const db = getDb();

  let query = 'SELECT * FROM holidays';
  const params = [];
  if (ano) { query += " WHERE strftime('%Y', data) = ?"; params.push(ano); }
  query += ' ORDER BY data ASC';

  res.json(db.prepare(query).all(...params));
});

// POST /api/config/holidays — Adicionar feriado
router.post('/holidays', requireAuth, requireProfile('super_admin', 'rh_gestor'), (req, res) => {
  const { data, nome, tipo } = req.body;
  if (!data || !nome || !tipo) {
    return res.status(400).json({ error: 'data, nome e tipo são obrigatórios' });
  }

  const db = getDb();
  try {
    db.prepare('INSERT INTO holidays (data, nome, tipo) VALUES (?, ?, ?)').run(data, nome, tipo);
    res.status(201).json({ message: 'Feriado adicionado' });
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Feriado já cadastrado para esta data' });
    }
    throw e;
  }
});

module.exports = router;
