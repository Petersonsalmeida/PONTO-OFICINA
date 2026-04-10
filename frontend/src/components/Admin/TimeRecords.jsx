import React, { useState, useEffect } from 'react';
import { Search, Download, Send, Filter, ChevronDown } from 'lucide-react';
import toast from 'react-hot-toast';
import { timeRecordAPI, reportAPI, employeeAPI } from '../../services/api';

export default function TimeRecords() {
  const [records, setRecords] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    employee_id: '',
    data_inicio: new Date().toISOString().slice(0, 7) + '-01',
    data_fim: new Date().toISOString().slice(0, 10),
    tipo: '',
  });
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    employeeAPI.list({ ativo: 1 }).then(r => setEmployees(r.data)).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [filters, page]);

  async function load() {
    setLoading(true);
    try {
      const { data } = await timeRecordAPI.list({
        ...filters,
        page,
        limit: 50,
      });
      setRecords(data.records);
      setTotalPages(data.pages);
    } catch (err) {
      toast.error('Erro ao carregar registros');
    } finally {
      setLoading(false);
    }
  }

  async function downloadPDF() {
    if (!filters.employee_id) return toast.error('Selecione um funcionário');
    try {
      const { data } = await reportAPI.pdf(filters.employee_id, {
        data_inicio: filters.data_inicio,
        data_fim: filters.data_fim,
      });
      const url = URL.createObjectURL(new Blob([data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `espelho_ponto_${filters.data_inicio}_${filters.data_fim}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Erro ao gerar PDF');
    }
  }

  async function downloadExcel() {
    if (!filters.employee_id) return toast.error('Selecione um funcionário');
    try {
      const { data } = await reportAPI.excel(filters.employee_id, {
        data_inicio: filters.data_inicio,
        data_fim: filters.data_fim,
      });
      const url = URL.createObjectURL(new Blob([data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `ponto_${filters.data_inicio}_${filters.data_fim}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Erro ao gerar Excel');
    }
  }

  async function sendWhatsapp() {
    if (!filters.employee_id) return toast.error('Selecione um funcionário');
    try {
      await reportAPI.sendWhatsapp(filters.employee_id, {
        data_inicio: filters.data_inicio,
        data_fim: filters.data_fim,
      });
      toast.success('Espelho enviado via WhatsApp!');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao enviar WhatsApp');
    }
  }

  const setFilter = (field) => (e) => {
    setFilters(f => ({ ...f, [field]: e.target.value }));
    setPage(1);
  };

  const selectCls = `bg-white/10 border border-white/20 rounded-xl px-3 py-2.5 text-white
    text-sm focus:outline-none focus:border-indigo-400 transition-all`;

  const tipoLabel = {
    entrada: 'Entrada', saida_almoco: 'Saída Almoço',
    retorno_almoco: 'Retorno Almoço', saida: 'Saída', extra: 'Extra',
  };

  const tipoBadge = {
    entrada: 'text-green-400 bg-green-900/30',
    saida_almoco: 'text-orange-400 bg-orange-900/30',
    retorno_almoco: 'text-blue-400 bg-blue-900/30',
    saida: 'text-purple-400 bg-purple-900/30',
    extra: 'text-yellow-400 bg-yellow-900/30',
  };

  const metodoBadge = {
    facial: '🤖 Facial',
    pin: '🔢 PIN',
    manual: '✍️ Manual',
    correcao: '✏️ Correção',
  };

  return (
    <div className="space-y-5">
      {/* Filtros */}
      <div className="card space-y-4">
        <h3 className="text-white font-semibold text-sm flex items-center gap-2">
          <Filter className="w-4 h-4 text-indigo-400" /> Filtros
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <select className={selectCls} value={filters.employee_id} onChange={setFilter('employee_id')}>
            <option value="" className="bg-gray-900">Todos os funcionários</option>
            {employees.map(e => (
              <option key={e.id} value={e.id} className="bg-gray-900">{e.nome}</option>
            ))}
          </select>
          <input type="date" className={selectCls} value={filters.data_inicio} onChange={setFilter('data_inicio')} />
          <input type="date" className={selectCls} value={filters.data_fim} onChange={setFilter('data_fim')} />
          <select className={selectCls} value={filters.tipo} onChange={setFilter('tipo')}>
            <option value="" className="bg-gray-900">Todos os tipos</option>
            {Object.entries(tipoLabel).map(([k, v]) => (
              <option key={k} value={k} className="bg-gray-900">{v}</option>
            ))}
          </select>
        </div>

        {/* Botões de exportação */}
        <div className="flex gap-3 flex-wrap">
          <button onClick={downloadPDF}
                  className="flex items-center gap-2 px-4 py-2 bg-red-700/30 hover:bg-red-700/50
                             text-red-300 rounded-xl text-sm transition-colors">
            <Download className="w-4 h-4" /> PDF
          </button>
          <button onClick={downloadExcel}
                  className="flex items-center gap-2 px-4 py-2 bg-green-700/30 hover:bg-green-700/50
                             text-green-300 rounded-xl text-sm transition-colors">
            <Download className="w-4 h-4" /> Excel
          </button>
          <button onClick={sendWhatsapp}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-700/30 hover:bg-indigo-700/50
                             text-indigo-300 rounded-xl text-sm transition-colors">
            <Send className="w-4 h-4" /> Enviar WhatsApp
          </button>
        </div>
      </div>

      {/* Tabela */}
      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-white/40 text-left border-b border-white/10 text-xs uppercase">
                <th className="px-5 py-3 font-medium">Funcionário</th>
                <th className="px-5 py-3 font-medium">Data</th>
                <th className="px-5 py-3 font-medium">Hora</th>
                <th className="px-5 py-3 font-medium">Tipo</th>
                <th className="px-5 py-3 font-medium hidden md:table-cell">Método</th>
                <th className="px-5 py-3 font-medium hidden lg:table-cell">Confiança</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading && (
                <tr><td colSpan={6} className="py-12 text-center text-white/30">Carregando...</td></tr>
              )}
              {!loading && records.length === 0 && (
                <tr><td colSpan={6} className="py-12 text-center text-white/30">Nenhum registro encontrado</td></tr>
              )}
              {records.map(r => (
                <tr key={r.id} className="hover:bg-white/5 transition-colors">
                  <td className="px-5 py-3">
                    <p className="text-white font-medium">{r.funcionario_nome}</p>
                    <p className="text-white/40 text-xs">{r.cargo}</p>
                  </td>
                  <td className="px-5 py-3 text-white/70 font-mono">
                    {r.data.split('-').reverse().join('/')}
                  </td>
                  <td className="px-5 py-3 text-white font-mono font-bold">{r.hora}</td>
                  <td className="px-5 py-3">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${tipoBadge[r.tipo] || ''}`}>
                      {tipoLabel[r.tipo] || r.tipo}
                    </span>
                    {r.ajustado ? <span className="ml-1 text-xs text-orange-400">✏️</span> : null}
                  </td>
                  <td className="px-5 py-3 text-white/50 text-xs hidden md:table-cell">
                    {metodoBadge[r.metodo] || r.metodo}
                  </td>
                  <td className="px-5 py-3 hidden lg:table-cell">
                    {r.confianca
                      ? <span className={`text-xs font-mono ${r.confianca > 0.85 ? 'text-green-400' : 'text-orange-400'}`}>
                          {Math.round(r.confianca * 100)}%
                        </span>
                      : <span className="text-white/20">--</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Paginação */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 p-4 border-t border-white/5">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                    className="px-3 py-1.5 rounded-lg bg-white/10 text-white/60 text-sm disabled:opacity-30">
              Anterior
            </button>
            <span className="text-white/40 text-sm">{page} / {totalPages}</span>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                    className="px-3 py-1.5 rounded-lg bg-white/10 text-white/60 text-sm disabled:opacity-30">
              Próxima
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
