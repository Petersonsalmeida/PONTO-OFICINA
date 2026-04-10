/**
 * Serviço de geração de relatórios PDF e Excel.
 * PDF: Portaria MTE 671/2021 (espelho de ponto).
 * Excel: 3 abas (registros brutos, resumo, banco de horas).
 */
const { jsPDF } = require('jspdf');
require('jspdf-autotable');
const ExcelJS = require('exceljs');
const QRCode = require('qrcode');
const { getDb } = require('../config/database');
const { calcDayTotals, minutesToTime } = require('../utils/worktime');

// ==========================================
// GERAÇÃO DE PDF — Espelho de Ponto
// ==========================================
async function generatePDF(employeeId, dataInicio, dataFim) {
  const db = getDb();

  const emp = db.prepare(`
    SELECT id, nome, cpf, cargo, data_admissao FROM employees WHERE id = ?
  `).get(employeeId);
  if (!emp) throw new Error('Funcionário não encontrado');

  const config = {};
  db.prepare('SELECT chave, valor FROM company_config').all().forEach(r => {
    config[r.chave] = r.valor;
  });

  const records = db.prepare(`
    SELECT tipo, timestamp, data, hora, metodo, confianca, ajustado
    FROM time_records
    WHERE employee_id = ? AND data BETWEEN ? AND ? AND ajustado = 0
    ORDER BY data ASC, hora ASC
  `).all(employeeId, dataInicio, dataFim);

  // Agrupar por dia
  const byDay = {};
  for (const r of records) {
    if (!byDay[r.data]) byDay[r.data] = [];
    byDay[r.data].push(r);
  }

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();

  // ---- Cabeçalho ----
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('ESPELHO DE PONTO ELETRÔNICO', pageW / 2, 18, { align: 'center' });

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Empresa: ${config.empresa_nome || 'Centro Automotivo Aliança'}`, 14, 28);
  doc.text(`CNPJ: ${config.empresa_cnpj || '--'}`, 14, 34);
  doc.text(`Endereço: ${config.empresa_endereco || 'Porto Alegre, RS'}`, 14, 40);

  doc.line(14, 44, pageW - 14, 44);

  doc.text(`Funcionário: ${emp.nome}`, 14, 50);
  doc.text(`CPF: ${emp.cpf}`, 14, 56);
  doc.text(`Cargo: ${emp.cargo}`, 14, 62);
  doc.text(`Período: ${formatDateBR(dataInicio)} a ${formatDateBR(dataFim)}`, 14, 68);
  doc.text(`Data de admissão: ${emp.data_admissao ? formatDateBR(emp.data_admissao) : '--'}`, 120, 50);
  doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 120, 56);

  doc.line(14, 72, pageW - 14, 72);

  // ---- Tabela de registros ----
  const tableRows = [];
  let totalTrabalhado = 0;
  let totalExtras = 0;
  let totalNoturnas = 0;
  let diasFalta = 0;

  // Iterar por todos os dias do período
  const start = new Date(dataInicio + 'T00:00:00');
  const end = new Date(dataFim + 'T00:00:00');

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];
    const dayRecords = byDay[dateStr] || [];

    const holiday = db.prepare('SELECT nome FROM holidays WHERE data = ?').get(dateStr);
    const schedule = db.prepare('SELECT * FROM work_schedules WHERE employee_id = ? AND data = ?').get(employeeId, dateStr);

    const dow = d.getDay(); // 0=Dom, 6=Sab
    const isDayOff = dow === 0 || (schedule && schedule.tipo_dia === 'folga');
    const isFeriado = !!holiday;

    const byType = {};
    for (const r of dayRecords) byType[r.tipo] = r.hora;

    if (dayRecords.length === 0 && !isDayOff && !isFeriado) {
      diasFalta++;
    }

    const totals = dayRecords.length > 0 ? calcDayTotals(dayRecords, schedule) : null;
    if (totals) {
      totalTrabalhado += totals.trabalhado;
      totalExtras += totals.horas_extras;
      totalNoturnas += totals.horas_noturnas;
    }

    tableRows.push([
      formatDateBRShort(dateStr),
      getDiaSemana(dow),
      byType['entrada'] || (isFeriado ? `Feriado: ${holiday.nome}` : isDayOff ? 'Folga' : dayRecords.length === 0 ? 'FALTA' : '--'),
      byType['saida_almoco'] || '--',
      byType['retorno_almoco'] || '--',
      byType['saida'] || '--',
      totals ? minutesToTime(totals.trabalhado) : '--',
      totals ? minutesToTime(totals.horas_extras) : '--',
    ]);
  }

  doc.autoTable({
    startY: 76,
    head: [['Data', 'Dia', 'Entrada', 'Saída Alm.', 'Retorno Alm.', 'Saída', 'Total', 'H.Extra']],
    body: tableRows,
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: [30, 30, 80], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 245, 255] },
    columnStyles: {
      0: { cellWidth: 20 }, 1: { cellWidth: 18 }, 6: { cellWidth: 18 }, 7: { cellWidth: 18 },
    },
    margin: { left: 14, right: 14 },
  });

  const finalY = doc.lastAutoTable.finalY + 8;

  // ---- Totais ----
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('TOTAIS DO PERÍODO', 14, finalY);
  doc.setFont('helvetica', 'normal');
  doc.text(`Total trabalhado: ${minutesToTime(totalTrabalhado)}`, 14, finalY + 6);
  doc.text(`Horas extras: ${minutesToTime(totalExtras)}`, 60, finalY + 6);
  doc.text(`Horas noturnas: ${minutesToTime(totalNoturnas)}`, 110, finalY + 6);
  doc.text(`Dias de falta: ${diasFalta}`, 160, finalY + 6);

  // ---- Assinaturas ----
  const sigY = finalY + 20;
  doc.line(14, sigY, 85, sigY);
  doc.line(110, sigY, pageW - 14, sigY);
  doc.setFontSize(8);
  doc.text(`${emp.nome}`, 49, sigY + 4, { align: 'center' });
  doc.text('Funcionário', 49, sigY + 8, { align: 'center' });
  doc.text('Responsável pela empresa', (110 + pageW - 14) / 2, sigY + 4, { align: 'center' });
  doc.text('Cargo', (110 + pageW - 14) / 2, sigY + 8, { align: 'center' });

  // ---- QR Code de autenticidade ----
  const qrData = `PONTO|${emp.cpf}|${dataInicio}|${dataFim}|${Date.now()}`;
  try {
    const qrDataUrl = await QRCode.toDataURL(qrData, { width: 60, margin: 0 });
    doc.addImage(qrDataUrl, 'PNG', pageW - 30, sigY - 15, 20, 20);
    doc.setFontSize(6);
    doc.text('Autenticidade', pageW - 20, sigY + 7, { align: 'center' });
  } catch { /* QR opcional */ }

  // ---- Rodapé ----
  doc.setFontSize(7);
  doc.setFont('helvetica', 'italic');
  doc.text(
    'Documento gerado conforme Portaria MTE 671/2021 — Sistema de Ponto Eletrônico Centro Automotivo Aliança',
    pageW / 2, doc.internal.pageSize.getHeight() - 8, { align: 'center' }
  );

  return Buffer.from(doc.output('arraybuffer'));
}

// ==========================================
// GERAÇÃO DE EXCEL — 3 abas
// ==========================================
async function generateExcel(employeeId, dataInicio, dataFim) {
  const db = getDb();

  const emp = db.prepare('SELECT * FROM employees WHERE id = ?').get(employeeId);
  if (!emp) throw new Error('Funcionário não encontrado');

  const records = db.prepare(`
    SELECT tipo, timestamp, data, hora, metodo, confianca, ajustado, observacao
    FROM time_records
    WHERE employee_id = ? AND data BETWEEN ? AND ?
    ORDER BY data ASC, hora ASC
  `).all(employeeId, dataInicio, dataFim);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Sistema Ponto - Centro Automotivo Aliança';
  wb.created = new Date();

  // ---- Aba 1: Registros Brutos ----
  const ws1 = wb.addWorksheet('Registros Brutos');
  ws1.columns = [
    { header: 'Data', key: 'data', width: 14 },
    { header: 'Dia Semana', key: 'dia', width: 14 },
    { header: 'Tipo', key: 'tipo', width: 18 },
    { header: 'Hora', key: 'hora', width: 10 },
    { header: 'Método', key: 'metodo', width: 12 },
    { header: 'Confiança %', key: 'confianca', width: 13 },
    { header: 'Ajustado', key: 'ajustado', width: 10 },
    { header: 'Observação', key: 'observacao', width: 30 },
  ];

  const diasSemana = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  for (const r of records) {
    const dow = new Date(r.data + 'T12:00:00').getDay();
    ws1.addRow({
      data: r.data, dia: diasSemana[dow], tipo: r.tipo,
      hora: r.hora, metodo: r.metodo,
      confianca: r.confianca ? (r.confianca * 100).toFixed(1) : '--',
      ajustado: r.ajustado ? 'Sim' : 'Não', observacao: r.observacao || '',
    });
  }

  styleHeader(ws1);

  // ---- Aba 2: Resumo Consolidado ----
  const ws2 = wb.addWorksheet('Resumo Consolidado');
  ws2.columns = [
    { header: 'Data', key: 'data', width: 14 },
    { header: 'Dia Semana', key: 'dia', width: 14 },
    { header: 'Entrada', key: 'entrada', width: 10 },
    { header: 'Saída Almoço', key: 'saida_almoco', width: 14 },
    { header: 'Retorno Alm.', key: 'retorno_almoco', width: 14 },
    { header: 'Saída', key: 'saida', width: 10 },
    { header: 'Total Trabalhado', key: 'trabalhado', width: 17 },
    { header: 'H. Extras', key: 'extras', width: 12 },
    { header: 'H. Noturnas', key: 'noturnas', width: 14 },
    { header: 'Observação', key: 'obs', width: 20 },
  ];

  const byDay = {};
  for (const r of records) {
    if (!byDay[r.data]) byDay[r.data] = [];
    byDay[r.data].push(r);
  }

  const start = new Date(dataInicio + 'T00:00:00');
  const end = new Date(dataFim + 'T00:00:00');

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];
    const dayRecords = byDay[dateStr] || [];
    const dow = d.getDay();
    const schedule = db.prepare('SELECT * FROM work_schedules WHERE employee_id = ? AND data = ?').get(employeeId, dateStr);
    const holiday = db.prepare('SELECT nome FROM holidays WHERE data = ?').get(dateStr);

    const byType = {};
    for (const r of dayRecords) byType[r.tipo] = r.hora;

    const totals = dayRecords.length > 0 ? calcDayTotals(dayRecords, schedule) : null;
    let obs = '';
    if (holiday) obs = `Feriado: ${holiday.nome}`;
    else if (dow === 0) obs = 'Domingo';
    else if (dayRecords.length === 0) obs = 'FALTA';

    ws2.addRow({
      data: dateStr, dia: diasSemana[dow],
      entrada: byType['entrada'] || '--',
      saida_almoco: byType['saida_almoco'] || '--',
      retorno_almoco: byType['retorno_almoco'] || '--',
      saida: byType['saida'] || '--',
      trabalhado: totals ? minutesToTime(totals.trabalhado) : '--',
      extras: totals ? minutesToTime(totals.horas_extras) : '--',
      noturnas: totals ? minutesToTime(totals.horas_noturnas) : '--',
      obs,
    });
  }

  styleHeader(ws2);

  // ---- Aba 3: Banco de Horas ----
  const ws3 = wb.addWorksheet('Banco de Horas');
  const mes = dataInicio.substring(0, 7);
  const hb = db.prepare('SELECT * FROM hour_bank WHERE employee_id = ? AND mes = ?').get(employeeId, mes);

  ws3.addRow(['BANCO DE HORAS']);
  ws3.addRow(['Funcionário:', emp.nome]);
  ws3.addRow(['CPF:', emp.cpf]);
  ws3.addRow(['Período:', `${dataInicio} a ${dataFim}`]);
  ws3.addRow([]);
  ws3.addRow(['Horas Normais', hb ? minutesToTime(hb.horas_normais) : '--']);
  ws3.addRow(['Horas Extras 50%', hb ? minutesToTime(hb.horas_extras_50) : '--']);
  ws3.addRow(['Horas Extras 100%', hb ? minutesToTime(hb.horas_extras_100) : '--']);
  ws3.addRow(['Horas Noturnas', hb ? minutesToTime(hb.horas_noturnas) : '--']);
  ws3.addRow(['Horas de Falta', hb ? minutesToTime(hb.horas_falta) : '--']);
  ws3.addRow(['DSR Descontado', hb ? minutesToTime(hb.dsr) : '--']);
  ws3.addRow(['Saldo do Mês', hb ? minutesToTime(hb.saldo_minutos) : '--']);
  ws3.addRow(['Saldo Acumulado', hb ? minutesToTime(hb.saldo_acumulado) : '--']);

  ws3.getColumn(1).width = 20;
  ws3.getColumn(2).width = 16;

  return await wb.xlsx.writeBuffer();
}

// ==========================================
// DASHBOARD DATA
// ==========================================
async function getDashboardData() {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];

  const presentes = db.prepare(`
    SELECT COUNT(DISTINCT employee_id) as cnt FROM time_records
    WHERE data = ? AND tipo = 'entrada'
  `).get(today).cnt;

  const comSaida = db.prepare(`
    SELECT COUNT(DISTINCT employee_id) as cnt FROM time_records
    WHERE data = ? AND tipo = 'saida'
  `).get(today).cnt;

  const totalAtivos = db.prepare(`
    SELECT COUNT(*) as cnt FROM employees WHERE ativo = 1 AND perfil = 'funcionario'
  `).get().cnt;

  const correcoesPendentes = db.prepare(`
    SELECT COUNT(*) as cnt FROM time_corrections WHERE status = 'pendente'
  `).get().cnt;

  return {
    hoje: today,
    presentes,
    emJornada: presentes - comSaida,
    ausentes: totalAtivos - presentes,
    totalAtivos,
    correcoesPendentes,
  };
}

// ==========================================
// BANCO DE HORAS
// ==========================================
async function getHourBank(employeeId, mes) {
  const db = getDb();
  const hb = db.prepare('SELECT * FROM hour_bank WHERE employee_id = ? AND mes = ?').get(employeeId, mes || new Date().toISOString().substring(0, 7));
  return hb || { employee_id: employeeId, mes, saldo_minutos: 0, saldo_acumulado: 0 };
}

// ---- Helpers ----
function formatDateBR(dateStr) {
  if (!dateStr) return '--';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function formatDateBRShort(dateStr) {
  const [, m, d] = dateStr.split('-');
  return `${d}/${m}`;
}

function getDiaSemana(dow) {
  return ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][dow];
}

function styleHeader(ws) {
  const headerRow = ws.getRow(1);
  headerRow.eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E1E50' } };
    cell.alignment = { horizontal: 'center' };
  });
  headerRow.height = 18;
}

module.exports = { generatePDF, generateExcel, getDashboardData, getHourBank };
