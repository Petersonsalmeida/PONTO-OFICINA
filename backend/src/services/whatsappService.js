/**
 * Serviço de notificações WhatsApp via Evolution API.
 * Integra com N8N para automações complexas.
 */
const axios = require('axios');
const { logger } = require('../middleware/logger');
const reportService = require('./reportService');
const { getDb } = require('../config/database');

const EVOLUTION_URL = process.env.EVOLUTION_API_URL || 'http://187.77.248.208:8080';
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY || '';
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE || 'oficina';
const N8N_WEBHOOK = process.env.N8N_WEBHOOK_PONTO || '';

const api = axios.create({
  baseURL: EVOLUTION_URL,
  headers: { apikey: EVOLUTION_KEY },
  timeout: 15_000,
});

/**
 * Formata número de telefone para WhatsApp (E.164 sem +)
 */
function formatPhone(phone) {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11) return `55${digits}`;
  if (digits.length === 13 && digits.startsWith('55')) return digits;
  return null;
}

/**
 * Envia mensagem de texto simples
 */
async function sendText(phone, message) {
  const number = formatPhone(phone);
  if (!number) throw new Error(`Telefone inválido: ${phone}`);

  try {
    const res = await api.post(`/message/sendText/${EVOLUTION_INSTANCE}`, {
      number,
      text: message,
    });
    logger.info(`WhatsApp enviado para ${number}`);
    return res.data;
  } catch (err) {
    logger.error(`Erro ao enviar WhatsApp para ${number}: ${err.message}`);
    throw err;
  }
}

/**
 * Envia documento (PDF)
 */
async function sendDocument(phone, base64, filename, caption) {
  const number = formatPhone(phone);
  if (!number) throw new Error(`Telefone inválido: ${phone}`);

  const res = await api.post(`/message/sendMedia/${EVOLUTION_INSTANCE}`, {
    number,
    mediatype: 'document',
    media: base64,
    fileName: filename,
    caption: caption || '',
  });
  return res.data;
}

/**
 * Envia espelho de ponto via WhatsApp
 */
async function sendTimesheet(employeeId, dataInicio, dataFim) {
  const db = getDb();
  const emp = db.prepare('SELECT nome, telefone FROM employees WHERE id = ?').get(employeeId);

  if (!emp) throw new Error('Funcionário não encontrado');
  if (!emp.telefone) throw new Error('Funcionário sem telefone cadastrado');

  const pdfBuffer = await reportService.generatePDF(employeeId, dataInicio, dataFim);
  const base64 = pdfBuffer.toString('base64');
  const filename = `espelho_ponto_${dataInicio}_${dataFim}.pdf`;
  const caption = `Olá ${emp.nome}! Segue seu espelho de ponto referente ao período ${dataInicio} a ${dataFim}.\n\nPor favor, verifique e responda confirmando as informações ou sinalizando qualquer divergência.\n\n_Centro Automotivo Aliança_`;

  await sendDocument(emp.telefone, base64, filename, caption);

  return { funcionario: emp.nome, telefone: emp.telefone, arquivo: filename };
}

/**
 * Envia alerta via N8N webhook (para automações complexas)
 */
async function sendAlert(tipo, dados) {
  if (!N8N_WEBHOOK) {
    logger.warn('N8N webhook não configurado — alerta ignorado');
    return;
  }

  try {
    await axios.post(N8N_WEBHOOK, { tipo, ...dados, timestamp: new Date().toISOString() });
    logger.info(`Alerta N8N enviado: ${tipo}`);
  } catch (err) {
    logger.error(`Erro ao enviar alerta N8N: ${err.message}`);
  }
}

/**
 * Alerta de atraso (funcionário não bateu ponto após X minutos do horário)
 */
async function alertAtraso(employee, horarioPrevisto) {
  const db = getDb();
  const config = db.prepare('SELECT valor FROM company_config WHERE chave = ?').get('empresa_nome');
  const empresa = config?.valor || 'Centro Automotivo Aliança';

  const msg = `⚠️ *Alerta de Atraso*\n\n` +
    `Funcionário: *${employee.nome}*\n` +
    `Cargo: ${employee.cargo}\n` +
    `Horário previsto: ${horarioPrevisto}\n` +
    `Data: ${new Date().toLocaleDateString('pt-BR')}\n\n` +
    `O funcionário ainda não registrou a entrada.\n\n` +
    `_${empresa}_`;

  await sendAlert('atraso', { funcionario: employee.nome, horarioPrevisto });

  // Tentar envio direto se tiver telefone
  if (employee.telefone) {
    try { await sendText(employee.telefone, msg); } catch { /* ignora */ }
  }
}

/**
 * Alerta de jornada aberta (saída não registrada)
 */
async function alertJornadaAberta(employee, horasAberto) {
  const msg = `⚠️ *Jornada Aberta*\n\n` +
    `Funcionário: *${employee.nome}*\n` +
    `A jornada está aberta há ${horasAberto}h sem registro de saída.\n` +
    `Data: ${new Date().toLocaleDateString('pt-BR')}\n\n` +
    `Por favor, verifique e registre a saída.\n\n` +
    `_Centro Automotivo Aliança_`;

  await sendAlert('jornada_aberta', { funcionario: employee.nome, horasAberto });
  if (employee.telefone) {
    try { await sendText(employee.telefone, msg); } catch { /* ignora */ }
  }
}

module.exports = {
  sendText, sendDocument, sendTimesheet,
  sendAlert, alertAtraso, alertJornadaAberta,
};
