/**
 * Seed: cria usuário Super Admin padrão para primeiro acesso
 */
require('dotenv').config();
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const DB_PATH = process.env.SQLITE_PATH || './database/ponto.db';
const db = new Database(DB_PATH);
db.pragma('foreign_keys = ON');

const adminPin = '1234';
const pinHash = bcrypt.hashSync(adminPin, 12);

const seed = db.transaction(() => {
  // Super Admin
  const existing = db.prepare('SELECT id FROM employees WHERE cpf = ?').get('000.000.000-00');

  if (!existing) {
    db.prepare(`
      INSERT INTO employees (
        id, nome, cpf, cargo, jornada_padrao, escala, turno,
        pin_hash, ativo, perfil, data_admissao
      ) VALUES (
        'admin-super-001', 'Administrador', '000.000.000-00',
        'Administrador do Sistema', '08:00-12:00,13:00-18:00',
        'fixo', 'dia', ?, 1, 'super_admin', date('now')
      )
    `).run(pinHash);

    console.log('✅ Super Admin criado');
    console.log('   CPF: 000.000.000-00');
    console.log('   PIN: 1234');
    console.log('   ⚠️  ALTERE O PIN NO PRIMEIRO ACESSO!');
  } else {
    console.log('ℹ️  Super Admin já existe, seed ignorado.');
  }
});

seed();
db.close();
console.log('✅ Seed concluído!');
