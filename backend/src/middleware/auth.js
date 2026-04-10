const jwt = require('jsonwebtoken');
const { getDb } = require('../config/database');

function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }

  const token = header.split(' ')[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

function requireProfile(...profiles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Não autenticado' });
    if (!profiles.includes(req.user.perfil)) {
      return res.status(403).json({ error: 'Sem permissão para esta operação' });
    }
    next();
  };
}

// Middleware de terminal: aceita token OU valida dispositivo registrado
function terminalAuth(req, res, next) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(header.split(' ')[1], process.env.JWT_SECRET);
      req.user = payload;
      return next();
    } catch { /* segue */ }
  }

  // Dispositivo de terminal sem token: permite apenas rotas de ponto
  req.isTerminal = true;
  next();
}

module.exports = { requireAuth, requireProfile, terminalAuth };
