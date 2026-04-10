/**
 * Utilitários de cálculo de jornada, horas extras e adicional noturno.
 * Referência: CLT Art. 58-74 e Portaria MTE 671/2021.
 */

const NOTURNO_INICIO = 22 * 60; // 22:00 em minutos
const NOTURNO_FIM = 5 * 60;     // 05:00 em minutos

/**
 * Converte "HH:MM" para minutos totais do dia
 */
function timeToMinutes(timeStr) {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Converte minutos para string "HH:MM"
 */
function minutesToTime(minutes) {
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60).toString().padStart(2, '0');
  const m = (abs % 60).toString().padStart(2, '0');
  return `${minutes < 0 ? '-' : ''}${h}:${m}`;
}

/**
 * Calcula minutos noturnos em um intervalo.
 * CLT Art. 73: hora noturna = 52min30s (fator 1.142857)
 */
function calcNocturnalMinutes(startMin, endMin) {
  let noturno = 0;

  // Segmentos noturnos: 22:00-00:00 e 00:00-05:00
  const segments = [
    [NOTURNO_INICIO, 24 * 60],
    [0, NOTURNO_FIM],
  ];

  for (const [segStart, segEnd] of segments) {
    const overlapStart = Math.max(startMin, segStart);
    const overlapEnd = Math.min(endMin, segEnd);
    if (overlapEnd > overlapStart) {
      noturno += overlapEnd - overlapStart;
    }
  }

  return noturno;
}

/**
 * Calcula totais de um dia com base nos 4 registros de ponto.
 * Retorna: { trabalhado, pausa, horas_extras, horas_noturnas, tipo_he }
 */
function calcDayTotals(records, schedule) {
  // records: array de { tipo, hora } ordenados por hora
  const byType = {};
  for (const r of records) {
    byType[r.tipo] = r.hora;
  }

  const entrada = byType['entrada'];
  const saidaAlmoco = byType['saida_almoco'];
  const retornoAlmoco = byType['retorno_almoco'];
  const saida = byType['saida'];

  if (!entrada || !saida) {
    return { trabalhado: 0, pausa: 0, horas_extras: 0, horas_noturnas: 0 };
  }

  const entradaMin = timeToMinutes(entrada);
  const saidaMin = timeToMinutes(saida);

  // Pausa do almoço
  let pausaMin = 0;
  if (saidaAlmoco && retornoAlmoco) {
    pausaMin = timeToMinutes(retornoAlmoco) - timeToMinutes(saidaAlmoco);
    if (pausaMin < 0) pausaMin = 0;
  }

  // Horas trabalhadas brutas
  let trabalhadoMin = saidaMin - entradaMin - pausaMin;
  if (trabalhadoMin < 0) trabalhadoMin += 24 * 60; // virada de meia-noite

  // Jornada prevista
  const jornadaPrevistaMin = schedule
    ? timeToMinutes(schedule.saida_prevista) - timeToMinutes(schedule.entrada_prevista)
      - (schedule.saida_almoco_prevista && schedule.retorno_almoco_previsto
        ? timeToMinutes(schedule.retorno_almoco_previsto) - timeToMinutes(schedule.saida_almoco_prevista)
        : 60)
    : 480; // 8h padrão

  // Horas extras (acima da jornada prevista + tolerância de 5min)
  const toleranciaMin = parseInt(process.env.TOLERANCIA_SAIDA || '5');
  const extrasMin = Math.max(0, trabalhadoMin - jornadaPrevistaMin - toleranciaMin);

  // Horas noturnas
  const noturnasMin = calcNocturnalMinutes(entradaMin, saidaMin) - calcNocturnalMinutes(entradaMin, entradaMin + pausaMin);

  return {
    trabalhado: trabalhadoMin,
    pausa: pausaMin,
    horas_extras: extrasMin,
    horas_noturnas: noturnasMin,
  };
}

/**
 * Detecta tipo de batida com base no horário atual e registros do dia
 */
function detectPunchType(existingRecords, schedule) {
  const types = existingRecords.map(r => r.tipo);

  if (!types.includes('entrada')) return 'entrada';
  if (!types.includes('saida_almoco') && schedule) {
    const saidaAlmocoPrev = schedule.saida_almoco_prevista;
    if (saidaAlmocoPrev) return 'saida_almoco';
  }
  if (types.includes('saida_almoco') && !types.includes('retorno_almoco')) return 'retorno_almoco';
  if (!types.includes('saida')) return 'saida';

  return 'extra';
}

module.exports = {
  timeToMinutes,
  minutesToTime,
  calcNocturnalMinutes,
  calcDayTotals,
  detectPunchType,
};
