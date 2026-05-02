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
// GERAÇÃO DE PDF — Espelho de Ponto (Paisagem A4, 1 página)
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

  const byDay = {};
  for (const r of records) {
    if (!byDay[r.data]) byDay[r.data] = [];
    byDay[r.data].push(r);
  }

  // Paisagem A4: 297 × 210 mm
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();   // 297 mm
  const pageH = doc.internal.pageSize.getHeight();  // 210 mm
  const mX = 12;
  const usableW = pageW - mX * 2;                  // 273 mm

  // ── FAIXA DE CABEÇALHO ─────────────────────────────────────
  const HH = 23;
  doc.setFillColor(22, 36, 71);
  doc.rect(0, 0, pageW, HH, 'F');

  // Linha dourada
  doc.setDrawColor(201, 162, 83);
  doc.setLineWidth(0.6);
  doc.line(0, HH, pageW, HH);
  doc.setLineWidth(0.2);

  // Empresa — esquerda
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text((config.empresa_nome || 'Centro Automotivo Aliança').toUpperCase(), mX, 9);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.text(`CNPJ: ${config.empresa_cnpj || '--'}`, mX, 14);
  doc.text(config.empresa_endereco || 'Porto Alegre, RS', mX, 18.5);

  // Título — centro
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('ESPELHO DE PONTO ELETRÔNICO', pageW / 2, 10, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text('Portaria MTE nº 671/2021', pageW / 2, 16, { align: 'center' });

  // Data de geração — direita
  doc.setFontSize(6.5);
  doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, pageW - mX, 14, { align: 'right' });

  // ── FAIXA DO FUNCIONÁRIO ───────────────────────────────────
  const EB_Y = HH + 0.8;
  const EB_H = 11;
  doc.setFillColor(234, 238, 247);
  doc.rect(0, EB_Y, pageW, EB_H, 'F');
  doc.setDrawColor(180, 195, 220);
  doc.setLineWidth(0.3);
  doc.line(0, EB_Y + EB_H, pageW, EB_Y + EB_H);

  doc.setTextColor(22, 36, 71);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(emp.nome.toUpperCase(), mX, EB_Y + 5.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.text(`CPF: ${emp.cpf}`, mX, EB_Y + 9.5);
  doc.text(`Cargo: ${emp.cargo || '--'}`, mX + 92, EB_Y + 5.5);
  doc.text(`Admissão: ${emp.data_admissao ? formatDateBR(emp.data_admissao) : '--'}`, mX + 92, EB_Y + 9.5);
  doc.text(`Período: ${formatDateBR(dataInicio)} a ${formatDateBR(dataFim)}`, mX + 168, EB_Y + 5.5);

  // ── TABELA DE REGISTROS ────────────────────────────────────
  const tableRows = [];
  let totalTrabalhado = 0;
  let totalExtras = 0;
  let totalNoturnas = 0;
  let diasFalta = 0;

  const start = new Date(dataInicio + 'T00:00:00');
  const end = new Date(dataFim + 'T00:00:00');

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().split('T')[0];
    const dayRecords = byDay[dateStr] || [];

    const holiday = db.prepare('SELECT nome FROM holidays WHERE data = ?').get(dateStr);
    const schedule = db.prepare('SELECT * FROM work_schedules WHERE employee_id = ? AND data = ?').get(employeeId, dateStr);

    const dow = d.getDay();
    const isDayOff = dow === 0 || dow === 6 || (schedule && schedule.tipo_dia === 'folga');
    const isFeriado = !!holiday;

    const byType = {};
    for (const r of dayRecords) byType[r.tipo] = r.hora;

    let obs = '';
    if (isFeriado) obs = holiday.nome;
    else if (isDayOff) obs = 'Folga';
    else if (dayRecords.length === 0) { obs = 'FALTA'; diasFalta++; }

    const totals = dayRecords.length > 0 ? calcDayTotals(dayRecords, schedule) : null;
    if (totals) {
      totalTrabalhado += totals.trabalhado;
      totalExtras += totals.horas_extras;
      totalNoturnas += totals.horas_noturnas;
    }

    tableRows.push([
      formatDateBRShort(dateStr),
      getDiaSemana(dow),
      byType['entrada'] || '--',
      byType['saida_almoco'] || '--',
      byType['retorno_almoco'] || '--',
      byType['saida'] || '--',
      totals ? minutesToTime(totals.trabalhado) : '--',
      totals ? minutesToTime(totals.horas_extras) : '--',
      obs,
    ]);
  }

  const TABLE_Y = EB_Y + EB_H + 1.5;

  doc.autoTable({
    startY: TABLE_Y,
    head: [['Data', 'Dia', 'Entrada', 'Saída Alm.', 'Retorno Alm.', 'Saída', 'Trabalhado', 'H. Extra', 'Observação']],
    body: tableRows,
    styles: {
      fontSize: 6,
      cellPadding: { top: 0.8, bottom: 0.8, left: 1.5, right: 1.5 },
      lineColor: [205, 213, 230],
      lineWidth: 0.15,
      textColor: [30, 30, 30],
      valign: 'middle',
    },
    headStyles: {
      fillColor: [22, 36, 71],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 6.5,
      halign: 'center',
      cellPadding: { top: 1.2, bottom: 1.2, left: 1.5, right: 1.5 },
    },
    alternateRowStyles: { fillColor: [248, 250, 255] },
    columnStyles: {
      0: { cellWidth: 16, halign: 'center' },
      1: { cellWidth: 13, halign: 'center' },
      2: { cellWidth: 30, halign: 'center' },
      3: { cellWidth: 28, halign: 'center' },
      4: { cellWidth: 32, halign: 'center' },
      5: { cellWidth: 28, halign: 'center' },
      6: { cellWidth: 26, halign: 'center', fontStyle: 'bold' },
      7: { cellWidth: 24, halign: 'center' },
      8: { cellWidth: 'auto' },
    },
    margin: { left: mX, right: mX },
    tableWidth: usableW,
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      const val = String(data.cell.raw || '');
      if (val === 'FALTA') {
        data.cell.styles.textColor = [190, 30, 30];
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  const afterTableY = doc.lastAutoTable.finalY;

  // ── TOTAIS ────────────────────────────────────────────────
  const TOT_Y = afterTableY + 1.5;
  doc.setFillColor(22, 36, 71);
  doc.rect(mX, TOT_Y, usableW, 7, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text(
    `Total Trabalhado: ${minutesToTime(totalTrabalhado)}   |   Horas Extras: ${minutesToTime(totalExtras)}   |   Horas Noturnas: ${minutesToTime(totalNoturnas)}   |   Dias de Falta: ${diasFalta}`,
    pageW / 2, TOT_Y + 4.5, { align: 'center' }
  );

  // ── ASSINATURAS ───────────────────────────────────────────
  const SIG_Y = TOT_Y + 10;

  // Declaração
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(90, 90, 90);
  doc.text(
    'Declaro que os registros acima refletem fielmente minha jornada de trabalho no período indicado.',
    pageW / 2, SIG_Y, { align: 'center' }
  );

  // Local e data
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(50, 50, 50);
  const dataHoje = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
  const cidade = config.empresa_cidade || config.empresa_endereco || 'Porto Alegre, RS';
  doc.text(`${cidade}, ${dataHoje}`, pageW / 2, SIG_Y + 5, { align: 'center' });

  // Linhas de assinatura
  const SIG_LINE_Y = SIG_Y + 16;
  const SIG_W = 88;
  const L1_X = mX;
  const L2_X = pageW - mX - SIG_W;
  const L1_CX = L1_X + SIG_W / 2;
  const L2_CX = L2_X + SIG_W / 2;

  doc.setDrawColor(22, 36, 71);
  doc.setLineWidth(0.5);
  doc.line(L1_X, SIG_LINE_Y, L1_X + SIG_W, SIG_LINE_Y);
  doc.line(L2_X, SIG_LINE_Y, L2_X + SIG_W, SIG_LINE_Y);

  doc.setTextColor(22, 36, 71);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text(emp.nome, L1_CX, SIG_LINE_Y + 4.5, { align: 'center' });
  doc.text(config.empresa_nome || 'Centro Automotivo Aliança', L2_CX, SIG_LINE_Y + 4.5, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(60, 60, 60);
  doc.text(`CPF: ${emp.cpf}`, L1_CX, SIG_LINE_Y + 8.5, { align: 'center' });
  doc.text(`CNPJ: ${config.empresa_cnpj || '--'}`, L2_CX, SIG_LINE_Y + 8.5, { align: 'center' });
  doc.text(emp.cargo || 'Funcionário', L1_CX, SIG_LINE_Y + 12.5, { align: 'center' });
  doc.text('Empregador', L2_CX, SIG_LINE_Y + 12.5, { align: 'center' });

  // QR Code — centro, alinhado com a linha de assinatura (abaixo do texto local/data)
  const QR_SIZE = 18;
  const QR_X = pageW / 2 - QR_SIZE / 2;
  const QR_Y = SIG_LINE_Y - QR_SIZE / 2; // centralizado na linha de assinatura
  const qrData = `PONTO|${emp.cpf}|${dataInicio}|${dataFim}|${Date.now()}`;
  try {
    const qrDataUrl = await QRCode.toDataURL(qrData, { width: 80, margin: 0 });
    doc.addImage(qrDataUrl, 'PNG', QR_X, QR_Y, QR_SIZE, QR_SIZE);
    doc.setFontSize(5.5);
    doc.setTextColor(120, 120, 120);
    doc.text('Autenticidade', pageW / 2, QR_Y + QR_SIZE + 2, { align: 'center' });
  } catch { /* QR opcional */ }

  // ── RODAPÉ ────────────────────────────────────────────────
  doc.setFontSize(5.5);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(160, 160, 160);
  doc.text(
    'Documento gerado conforme Portaria MTE nº 671/2021 — Sistema de Ponto Eletrônico — Centro Automotivo Aliança',
    pageW / 2, pageH - 4, { align: 'center' }
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
    else if (dow === 0 || dow === 6) obs = 'Folga';
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
