/**
 * Utilitários de formatação para a UI
 */

export function formatDate(dateStr) {
  if (!dateStr) return '--';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

export function formatDateTime(isoStr) {
  if (!isoStr) return '--';
  return new Date(isoStr).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function formatCpf(cpf) {
  if (!cpf) return '';
  const d = cpf.replace(/\D/g, '');
  return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
}

export function formatMinutes(minutes) {
  if (minutes === null || minutes === undefined) return '--';
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60).toString().padStart(2, '0');
  const m = (abs % 60).toString().padStart(2, '0');
  return `${minutes < 0 ? '-' : ''}${h}:${m}`;
}

export const TIPO_PONTO = {
  entrada: 'Entrada',
  saida_almoco: 'Saída Almoço',
  retorno_almoco: 'Retorno Almoço',
  saida: 'Saída',
  extra: 'Extra',
};

export const METODO_PONTO = {
  facial: '🤖 Facial',
  pin: '🔢 PIN',
  manual: '✍️ Manual',
  correcao: '✏️ Correção',
};
