require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');

const { requestLogger, logger } = require('./middleware/logger');
const { startSyncScheduler } = require('./services/syncService');
const { startScheduler } = require('./services/scheduleService');

// Rotas
const authRoutes = require('./routes/auth');
const employeeRoutes = require('./routes/employees');
const timeRecordRoutes = require('./routes/timeRecords');
const correctionRoutes = require('./routes/corrections');
const reportRoutes = require('./routes/reports');
const configRoutes = require('./routes/config');
const scheduleRoutes = require('./routes/schedules');

const app = express();
const PORT = process.env.PORT || 3001;

// ==========================================
// MIDDLEWARES GLOBAIS
// ==========================================
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: false, // Permitir PWA
}));
app.use(compression());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(requestLogger);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 500,
  message: { error: 'Muitas requisições. Tente novamente em breve.' },
});
app.use('/api/', limiter);

// Rate limiting mais agressivo para autenticação
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Muitas tentativas de login. Aguarde 15 minutos.' },
});
app.use('/api/auth/login', authLimiter);

// Servir arquivos estáticos do frontend (uploads)
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// ==========================================
// ROTAS DA API
// ==========================================
app.use('/api/auth', authRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/time-records', timeRecordRoutes);
app.use('/api/corrections', correctionRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/config', configRoutes);
app.use('/api/schedules', scheduleRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    app: 'Ponto Oficina - Centro Automotivo Aliança',
  });
});

// ==========================================
// SERVIR FRONTEND (em produção)
// ==========================================
if (process.env.NODE_ENV === 'production') {
  const frontendDist = path.join(__dirname, '../../frontend/dist');
  app.use(express.static(frontendDist));
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// ==========================================
// TRATAMENTO DE ERROS
// ==========================================
app.use((err, req, res, next) => {
  logger.error(`${err.message}\n${err.stack}`);

  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'Arquivo muito grande (máx. 5MB)' });
  }

  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Erro interno do servidor'
      : err.message,
  });
});

// ==========================================
// INICIALIZAÇÃO
// ==========================================
app.listen(PORT, '0.0.0.0', () => {
  logger.info(`🚀 Servidor iniciado na porta ${PORT}`);
  logger.info(`📊 Ambiente: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`🗄️  Banco: ${process.env.SQLITE_PATH || './database/ponto.db'}`);

  // Iniciar serviços em background
  startSyncScheduler();
  startScheduler();
});

module.exports = app;
