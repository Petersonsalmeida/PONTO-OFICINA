/**
 * Serviço de agendamento: verifica atrasos, jornadas abertas, faltas.
 * Roda via node-cron a cada minuto.
 */
const cron = require('node-cron');
const { getDb } = require('../config/database');
const whatsappService = require('./whatsappService');
const { logger } = require('../middleware/logger');

// Controle para não enviar alertas duplicados no mesmo dia
const alertsSent = new Set();

/**
 * Verifica funcionários em atraso (não bateram ponto X minutos após horário previsto)
 */
async function checkAtrasos() {
  const db = getDb();
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const horaAtual = now.toTimeString().substring(0, 5);

  const config = db.prepare("SELECT valor FROM company_config WHERE chave = 'alerta_atraso_min'").get();
  const tolerancia = parseInt(config?.valor || '15');

  const schedules = db.prepare(`
    SELECT ws.*, e.nome, e.cargo, e.telefone, e.id as employee_id
    FROM work_schedules ws
    JOIN employees e ON e.id = ws.employee_id
    WHERE ws.data = ? AND ws.tipo_dia = 'normal'
  `).all(today);

  for (const schedule of schedules) {
    if (!schedule.entrada_prevista) continue;

    const [hP, mP] = schedule.entrada_prevista.split(':').map(Number);
    const prevMin = hP * 60 + mP + tolerancia;
    const nowMin = now.getHours() * 60 + now.getMinutes();

    if (nowMin < prevMin) continue; // Ainda não passou do horário de alerta

    const alertKey = `atraso_${schedule.employee_id}_${today}`;
    if (alertsSent.has(alertKey)) continue;

    // Verificar se já bateu ponto
    const batida = db.prepare(`
      SELECT id FROM time_records
      WHERE employee_id = ? AND data = ? AND tipo = 'entrada'
    `).get(schedule.employee_id, today);

    if (!batida) {
      alertsSent.add(alertKey);
      try {
        await whatsappService.alertAtraso(
          { id: schedule.employee_id, nome: schedule.nome, cargo: schedule.cargo, telefone: schedule.telefone },
          schedule.entrada_prevista
        );
        logger.info(`Alerta atraso enviado: ${schedule.nome}`);
      } catch (err) {
        logger.error(`Erro alerta atraso ${schedule.nome}: ${err.message}`);
      }
    }
  }
}

/**
 * Verifica jornadas abertas (entrada sem saída por mais de N horas)
 */
async function checkJornadaAberta() {
  const db = getDb();
  const now = new Date();
  const today = now.toISOString().split('T')[0];

  const config = db.prepare("SELECT valor FROM company_config WHERE chave = 'alerta_jornada_aberta_h'").get();
  const maxHoras = parseInt(config?.valor || '10');

  const entradas = db.prepare(`
    SELECT tr.employee_id, tr.hora, e.nome, e.cargo, e.telefone
    FROM time_records tr
    JOIN employees e ON e.id = tr.employee_id
    WHERE tr.data = ? AND tr.tipo = 'entrada'
  `).all(today);

  for (const entrada of entradas) {
    // Verificar se tem saída
    const saida = db.prepare(`
      SELECT id FROM time_records
      WHERE employee_id = ? AND data = ? AND tipo = 'saida'
    `).get(entrada.employee_id, today);

    if (saida) continue;

    const [hE, mE] = entrada.hora.split(':').map(Number);
    const entradaMin = hE * 60 + mE;
    const agora = now.getHours() * 60 + now.getMinutes();
    const horasAberto = Math.floor((agora - entradaMin) / 60);

    if (horasAberto < maxHoras) continue;

    const alertKey = `jornada_aberta_${entrada.employee_id}_${today}`;
    if (alertsSent.has(alertKey)) continue;

    alertsSent.add(alertKey);
    try {
      await whatsappService.alertJornadaAberta(entrada, horasAberto);
      logger.info(`Alerta jornada aberta: ${entrada.nome} (${horasAberto}h)`);
    } catch (err) {
      logger.error(`Erro alerta jornada aberta ${entrada.nome}: ${err.message}`);
    }
  }
}

/**
 * Verifica esquecimento de ponto.
 * Para cada batida prevista (saida_almoco, retorno_almoco, saida), se o
 * horário previsto já passou + tolerância e o funcionário ainda não registrou,
 * dispara um lembrete via WhatsApp.
 *
 * Diferente de checkAtrasos (que olha só entrada) e checkJornadaAberta (que
 * olha só horas absolutas), este checa cada etapa da jornada vs schedule do dia.
 */
async function checkEsquecimentoPonto() {
  const db = getDb();
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const nowMin = now.getHours() * 60 + now.getMinutes();

  // Feature flag — permite desativar via config
  const ativoCfg = db.prepare("SELECT valor FROM company_config WHERE chave = 'alerta_esquecimento_ativo'").get();
  if (ativoCfg && ativoCfg.valor === '0') return;

  const tolCfg = db.prepare("SELECT valor FROM company_config WHERE chave = 'alerta_esquecimento_min'").get();
  const tolerancia = parseInt(tolCfg?.valor || '15');

  const schedules = db.prepare(`
    SELECT ws.*, e.id as employee_id, e.nome, e.cargo, e.telefone
    FROM work_schedules ws
    JOIN employees e ON e.id = ws.employee_id
    WHERE ws.data = ? AND ws.tipo_dia = 'normal' AND e.ativo = 1
  `).all(today);

  // Apenas tipos com horário previsto na escala — entrada já é tratada por checkAtrasos
  const stages = [
    { tipo: 'saida_almoco',    campo: 'saida_almoco_prevista' },
    { tipo: 'retorno_almoco',  campo: 'retorno_almoco_previsto' },
    { tipo: 'saida',           campo: 'saida_prevista' },
  ];

  for (const schedule of schedules) {
    // Se nem entrou ainda, deixa o checkAtrasos cuidar
    const entrou = db.prepare(`
      SELECT id FROM time_records
      WHERE employee_id = ? AND data = ? AND tipo = 'entrada'
    `).get(schedule.employee_id, today);
    if (!entrou) continue;

    for (const stage of stages) {
      const horarioPrevisto = schedule[stage.campo];
      if (!horarioPrevisto) continue;

      const [h, m] = String(horarioPrevisto).split(':').map(Number);
      if (Number.isNaN(h) || Number.isNaN(m)) continue;

      const previstoMin = h * 60 + m;
      const minutosAtraso = nowMin - previstoMin;
      if (minutosAtraso < tolerancia) continue;

      // Não enviar lembretes de mais de 4h depois — provavelmente o
      // funcionário não vai mais bater (o checkJornadaAberta cuida desse caso)
      if (minutosAtraso > 240) continue;

      const alertKey = `esquec_${schedule.employee_id}_${stage.tipo}_${today}`;
      if (alertsSent.has(alertKey)) continue;

      // Verificar se já bateu
      const batida = db.prepare(`
        SELECT id FROM time_records
        WHERE employee_id = ? AND data = ? AND tipo = ?
      `).get(schedule.employee_id, today, stage.tipo);
      if (batida) continue;

      alertsSent.add(alertKey);
      try {
        await whatsappService.alertEsquecimento(
          { id: schedule.employee_id, nome: schedule.nome, cargo: schedule.cargo, telefone: schedule.telefone },
          stage.tipo,
          horarioPrevisto,
          minutosAtraso,
        );
        logger.info(`Alerta esquecimento enviado: ${schedule.nome} (${stage.tipo}, ${minutosAtraso}min)`);
      } catch (err) {
        logger.error(`Erro alerta esquecimento ${schedule.nome}: ${err.message}`);
      }
    }
  }
}

/**
 * Limpa cache de alertas à meia-noite
 */
function clearAlertCache() {
  alertsSent.clear();
  logger.info('Cache de alertas limpo (nova data)');
}

/**
 * Inicia todos os cron jobs de monitoramento
 */
function startScheduler() {
  // Verificar atrasos a cada 5 minutos
  cron.schedule('*/5 * * * *', () => {
    checkAtrasos().catch(err => logger.error(`Cron atraso: ${err.message}`));
  });

  // Verificar esquecimento de ponto a cada 5 minutos
  cron.schedule('*/5 * * * *', () => {
    checkEsquecimentoPonto().catch(err => logger.error(`Cron esquecimento: ${err.message}`));
  });

  // Verificar jornadas abertas a cada 30 minutos
  cron.schedule('*/30 * * * *', () => {
    checkJornadaAberta().catch(err => logger.error(`Cron jornada: ${err.message}`));
  });

  // Limpar cache à meia-noite
  cron.schedule('0 0 * * *', clearAlertCache);

  logger.info('Scheduler de alertas ativado');
}

module.exports = { startScheduler, checkAtrasos, checkJornadaAberta, checkEsquecimentoPonto };
