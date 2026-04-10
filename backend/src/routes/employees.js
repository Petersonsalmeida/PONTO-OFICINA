const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getDb } = require('../config/database');
const { requireAuth, requireProfile } = require('../middleware/auth');
const { audit } = require('../utils/auditLog');
const { encryptFacialTemplate, decryptFacialTemplate } = require('../utils/crypto');

const router = express.Router();

// Upload de fotos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../../uploads/employees');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${req.params.id || 'new'}-${Date.now()}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Apenas imagens são permitidas'));
    }
    cb(null, true);
  },
});

// ==========================================
// GET /api/employees — Listar funcionários
// ==========================================
router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const { ativo, search, perfil } = req.query;

  let query = `
    SELECT id, nome, cpf, cargo, departamento, jornada_padrao, escala, turno,
           carga_horaria_semanal, foto_url, telefone, email, data_admissao,
           ativo, perfil, criado_em, atualizado_em
    FROM employees
    WHERE 1=1
  `;
  const params = [];

  if (ativo !== undefined) { query += ' AND ativo = ?'; params.push(parseInt(ativo)); }
  if (perfil) { query += ' AND perfil = ?'; params.push(perfil); }
  if (search) {
    query += ' AND (nome LIKE ? OR cpf LIKE ? OR cargo LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }

  query += ' ORDER BY nome ASC';

  const employees = db.prepare(query).all(...params);
  res.json(employees);
});

// ==========================================
// GET /api/employees/:id
// ==========================================
router.get('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const emp = db.prepare(`
    SELECT id, nome, cpf, cargo, departamento, jornada_padrao, escala, turno,
           carga_horaria_semanal, foto_url, telefone, email, data_admissao,
           ativo, perfil, criado_em, atualizado_em
    FROM employees WHERE id = ?
  `).get(req.params.id);

  if (!emp) return res.status(404).json({ error: 'Funcionário não encontrado' });
  res.json(emp);
});

// ==========================================
// POST /api/employees — Criar funcionário
// ==========================================
router.post('/', requireAuth, requireProfile('super_admin', 'rh_gestor'), (req, res) => {
  const {
    nome, cpf, cargo, departamento, jornada_padrao, escala, turno,
    carga_horaria_semanal, telefone, email, data_admissao, perfil, pin
  } = req.body;

  if (!nome || !cpf || !cargo) {
    return res.status(400).json({ error: 'Nome, CPF e cargo são obrigatórios' });
  }

  const db = getDb();

  // Verificar CPF único
  const exists = db.prepare('SELECT id FROM employees WHERE cpf = ?').get(cpf);
  if (exists) return res.status(409).json({ error: 'CPF já cadastrado' });

  const pinHash = pin ? bcrypt.hashSync(String(pin), 12) : null;

  const result = db.prepare(`
    INSERT INTO employees (
      nome, cpf, cargo, departamento, jornada_padrao, escala, turno,
      carga_horaria_semanal, telefone, email, data_admissao, perfil, pin_hash
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    nome, cpf, cargo, departamento || null,
    jornada_padrao || '08:00-12:00,13:00-17:00',
    escala || 'fixo', turno || 'dia',
    carga_horaria_semanal || 44,
    telefone || null, email || null,
    data_admissao || null,
    perfil || 'funcionario',
    pinHash
  );

  const newEmp = db.prepare('SELECT * FROM employees WHERE rowid = ?').get(result.lastInsertRowid);
  audit('employees', newEmp.id, 'INSERT', null, { nome, cpf, cargo }, req.user.id, req.ip);

  res.status(201).json({
    message: 'Funcionário criado com sucesso',
    employee: { ...newEmp, template_facial: undefined, pin_hash: undefined },
  });
});

// ==========================================
// PUT /api/employees/:id — Atualizar funcionário
// ==========================================
router.put('/:id', requireAuth, requireProfile('super_admin', 'rh_gestor'), (req, res) => {
  const db = getDb();
  const antes = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.id);
  if (!antes) return res.status(404).json({ error: 'Funcionário não encontrado' });

  const {
    nome, cargo, departamento, jornada_padrao, escala, turno,
    carga_horaria_semanal, telefone, email, data_admissao, perfil, ativo, pin
  } = req.body;

  const pinHash = pin ? bcrypt.hashSync(String(pin), 12) : antes.pin_hash;

  db.prepare(`
    UPDATE employees SET
      nome = ?, cargo = ?, departamento = ?, jornada_padrao = ?,
      escala = ?, turno = ?, carga_horaria_semanal = ?, telefone = ?,
      email = ?, data_admissao = ?, perfil = ?, ativo = ?, pin_hash = ?,
      atualizado_em = datetime('now'), sincronizado = 0
    WHERE id = ?
  `).run(
    nome || antes.nome, cargo || antes.cargo, departamento || antes.departamento,
    jornada_padrao || antes.jornada_padrao, escala || antes.escala,
    turno || antes.turno, carga_horaria_semanal || antes.carga_horaria_semanal,
    telefone || antes.telefone, email || antes.email,
    data_admissao || antes.data_admissao, perfil || antes.perfil,
    ativo !== undefined ? ativo : antes.ativo, pinHash, req.params.id
  );

  const depois = db.prepare('SELECT * FROM employees WHERE id = ?').get(req.params.id);
  audit('employees', req.params.id, 'UPDATE', antes, depois, req.user.id, req.ip);

  res.json({ message: 'Funcionário atualizado', employee: { ...depois, template_facial: undefined, pin_hash: undefined } });
});

// ==========================================
// POST /api/employees/:id/facial-template
// Salva template facial criptografado (LGPD)
// ==========================================
router.post('/:id/facial-template', requireAuth, requireProfile('super_admin', 'rh_gestor'), (req, res) => {
  const { descriptor } = req.body;

  if (!descriptor || !Array.isArray(descriptor)) {
    return res.status(400).json({ error: 'Descriptor facial inválido' });
  }

  const db = getDb();
  const emp = db.prepare('SELECT id, nome FROM employees WHERE id = ?').get(req.params.id);
  if (!emp) return res.status(404).json({ error: 'Funcionário não encontrado' });

  const encrypted = encryptFacialTemplate(descriptor);
  db.prepare(`
    UPDATE employees SET template_facial = ?, atualizado_em = datetime('now'), sincronizado = 0
    WHERE id = ?
  `).run(encrypted, req.params.id);

  audit('employees', req.params.id, 'UPDATE', null, { acao: 'template_facial_atualizado' }, req.user.id, req.ip);

  res.json({ message: 'Template facial salvo com sucesso' });
});

// ==========================================
// GET /api/employees/facial-descriptors
// Retorna todos os descritores para o reconhecimento offline
// ==========================================
router.get('/all/facial-descriptors', (req, res) => {
  const db = getDb();
  const employees = db.prepare(`
    SELECT id, nome, template_facial
    FROM employees
    WHERE ativo = 1 AND template_facial IS NOT NULL
  `).all();

  const descriptors = employees
    .map(emp => {
      const decrypted = decryptFacialTemplate(emp.template_facial);
      if (!decrypted) return null;
      return { id: emp.id, nome: emp.nome, descriptor: decrypted };
    })
    .filter(Boolean);

  res.json(descriptors);
});

// ==========================================
// DELETE /api/employees/:id (soft delete)
// ==========================================
router.delete('/:id', requireAuth, requireProfile('super_admin'), (req, res) => {
  const db = getDb();
  const emp = db.prepare('SELECT id, nome FROM employees WHERE id = ?').get(req.params.id);
  if (!emp) return res.status(404).json({ error: 'Funcionário não encontrado' });

  db.prepare(`
    UPDATE employees SET ativo = 0, atualizado_em = datetime('now') WHERE id = ?
  `).run(req.params.id);

  audit('employees', req.params.id, 'UPDATE', emp, { ativo: 0 }, req.user.id, req.ip);
  res.json({ message: 'Funcionário desativado' });
});

module.exports = router;
