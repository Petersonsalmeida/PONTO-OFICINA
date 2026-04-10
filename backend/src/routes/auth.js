const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb } = require('../config/database');
const { requireAuth } = require('../middleware/auth');
const { audit } = require('../utils/auditLog');

const router = express.Router();

/**
 * POST /api/auth/login
 * Login via PIN (painel admin)
 */
router.post('/login', (req, res) => {
  const { cpf, pin } = req.body;

  if (!cpf || !pin) {
    return res.status(400).json({ error: 'CPF e PIN são obrigatórios' });
  }

  const db = getDb();
  const employee = db.prepare(`
    SELECT id, nome, cpf, cargo, perfil, pin_hash, ativo
    FROM employees
    WHERE cpf = ? AND ativo = 1
  `).get(cpf.replace(/\D/g, '').replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4'));

  // Tentar com CPF sem formatação também
  const employeeRaw = employee || db.prepare(`
    SELECT id, nome, cpf, cargo, perfil, pin_hash, ativo
    FROM employees
    WHERE replace(replace(replace(cpf, '.', ''), '-', ''), '/', '') = ? AND ativo = 1
  `).get(cpf.replace(/\D/g, ''));

  const emp = employee || employeeRaw;

  if (!emp || !emp.pin_hash) {
    return res.status(401).json({ error: 'Credenciais inválidas' });
  }

  const valid = bcrypt.compareSync(pin, emp.pin_hash);
  if (!valid) {
    audit('employees', emp.id, 'UPDATE', null, { acao: 'login_falhou' }, null, req.ip);
    return res.status(401).json({ error: 'Credenciais inválidas' });
  }

  // Somente perfis administrativos podem acessar o painel
  const adminProfiles = ['super_admin', 'rh_gestor', 'lider_equipe'];
  if (!adminProfiles.includes(emp.perfil)) {
    return res.status(403).json({ error: 'Sem permissão para acessar o painel administrativo' });
  }

  const token = jwt.sign(
    { id: emp.id, nome: emp.nome, cpf: emp.cpf, perfil: emp.perfil },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );

  audit('employees', emp.id, 'UPDATE', null, { acao: 'login_sucesso' }, emp.id, req.ip);

  res.json({
    token,
    usuario: { id: emp.id, nome: emp.nome, cpf: emp.cpf, cargo: emp.cargo, perfil: emp.perfil },
  });
});

/**
 * POST /api/auth/change-pin
 * Alterar PIN
 */
router.post('/change-pin', requireAuth, (req, res) => {
  const { pin_atual, pin_novo } = req.body;

  if (!pin_atual || !pin_novo) {
    return res.status(400).json({ error: 'PIN atual e novo são obrigatórios' });
  }
  if (pin_novo.length < 4 || pin_novo.length > 6) {
    return res.status(400).json({ error: 'PIN deve ter entre 4 e 6 dígitos' });
  }
  if (!/^\d+$/.test(pin_novo)) {
    return res.status(400).json({ error: 'PIN deve conter apenas números' });
  }

  const db = getDb();
  const emp = db.prepare('SELECT pin_hash FROM employees WHERE id = ?').get(req.user.id);

  if (!emp || !bcrypt.compareSync(pin_atual, emp.pin_hash)) {
    return res.status(401).json({ error: 'PIN atual incorreto' });
  }

  const newHash = bcrypt.hashSync(pin_novo, 12);
  db.prepare('UPDATE employees SET pin_hash = ?, atualizado_em = datetime(\'now\') WHERE id = ?')
    .run(newHash, req.user.id);

  audit('employees', req.user.id, 'UPDATE', null, { acao: 'pin_alterado' }, req.user.id, req.ip);

  res.json({ message: 'PIN alterado com sucesso' });
});

/**
 * GET /api/auth/me
 */
router.get('/me', requireAuth, (req, res) => {
  const db = getDb();
  const emp = db.prepare(`
    SELECT id, nome, cpf, cargo, perfil, foto_url, ativo
    FROM employees WHERE id = ?
  `).get(req.user.id);

  if (!emp) return res.status(404).json({ error: 'Usuário não encontrado' });
  res.json(emp);
});

module.exports = router;
