const express = require('express');
const { requireAuth } = require('../middleware/auth');
const reportService = require('../services/reportService');
const whatsappService = require('../services/whatsappService');

const router = express.Router();

// ==========================================
// GET /api/reports/pdf/:employeeId
// Gera espelho de ponto PDF — Portaria MTE 671/2021
// ==========================================
router.get('/pdf/:employeeId', requireAuth, async (req, res) => {
  const { data_inicio, data_fim } = req.query;

  if (!data_inicio || !data_fim) {
    return res.status(400).json({ error: 'data_inicio e data_fim são obrigatórios' });
  }

  try {
    const pdf = await reportService.generatePDF(req.params.employeeId, data_inicio, data_fim);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition',
      `attachment; filename="espelho_ponto_${req.params.employeeId}_${data_inicio}_${data_fim}.pdf"`);
    res.send(pdf);
  } catch (err) {
    console.error('Erro ao gerar PDF:', err);
    res.status(500).json({ error: 'Erro ao gerar relatório PDF', detail: err.message });
  }
});

// ==========================================
// GET /api/reports/excel/:employeeId
// Gera planilha Excel com 3 abas
// ==========================================
router.get('/excel/:employeeId', requireAuth, async (req, res) => {
  const { data_inicio, data_fim } = req.query;

  if (!data_inicio || !data_fim) {
    return res.status(400).json({ error: 'data_inicio e data_fim são obrigatórios' });
  }

  try {
    const buffer = await reportService.generateExcel(req.params.employeeId, data_inicio, data_fim);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition',
      `attachment; filename="ponto_${req.params.employeeId}_${data_inicio}_${data_fim}.xlsx"`);
    res.send(buffer);
  } catch (err) {
    console.error('Erro ao gerar Excel:', err);
    res.status(500).json({ error: 'Erro ao gerar planilha', detail: err.message });
  }
});

// ==========================================
// POST /api/reports/send-whatsapp/:employeeId
// Envia espelho de ponto via WhatsApp
// ==========================================
router.post('/send-whatsapp/:employeeId', requireAuth, async (req, res) => {
  const { data_inicio, data_fim } = req.body;

  if (!data_inicio || !data_fim) {
    return res.status(400).json({ error: 'data_inicio e data_fim são obrigatórios' });
  }

  try {
    const result = await whatsappService.sendTimesheet(req.params.employeeId, data_inicio, data_fim);
    res.json({ message: 'Espelho de ponto enviado via WhatsApp', ...result });
  } catch (err) {
    console.error('Erro ao enviar WhatsApp:', err);
    res.status(500).json({ error: 'Erro ao enviar mensagem', detail: err.message });
  }
});

// ==========================================
// GET /api/reports/hour-bank/:employeeId
// Banco de horas consolidado
// ==========================================
router.get('/hour-bank/:employeeId', requireAuth, async (req, res) => {
  const { mes } = req.query; // formato: YYYY-MM

  try {
    const data = await reportService.getHourBank(req.params.employeeId, mes);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// GET /api/reports/dashboard
// Resumo para o dashboard
// ==========================================
router.get('/dashboard', requireAuth, async (req, res) => {
  try {
    const data = await reportService.getDashboardData();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
