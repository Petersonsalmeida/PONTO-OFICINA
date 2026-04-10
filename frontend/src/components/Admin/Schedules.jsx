import React, { useState, useEffect } from 'react';
import { Calendar, Plus, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import { employeeAPI } from '../../services/api';
import api from '../../services/api';

export default function Schedules() {
  const [employees, setEmployees] = useState([]);
  const [selectedEmp, setSelectedEmp] = useState('');
  const [mes, setMes] = useState(() => new Date().toISOString().slice(0, 7));
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    employeeAPI.list({ ativo: 1 }).then(r => setEmployees(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedEmp) loadSchedules();
  }, [selectedEmp, mes]);

  async function loadSchedules() {
    setLoading(true);
    const [ano, mesNum] = mes.split('-').map(Number);
    const inicio = `${mes}-01`;
    const fim = `${mes}-${new Date(ano, mesNum, 0).getDate().toString().padStart(2, '0')}`;
    try {
      const { data } = await api.get('/schedules', {
        params: { employee_id: selectedEmp, data_inicio: inicio, data_fim: fim },
      });
      setSchedules(data);
    } catch {
      toast.error('Erro ao carregar escalas');
    } finally {
      setLoading(false);
    }
  }

  async function generateBulk() {
    if (!selectedEmp) return toast.error('Selecione um funcionário');
    setGenerating(true);
    try {
      const { data } = await api.post('/schedules/bulk', { employee_id: selectedEmp, mes });
      toast.success(`${data.dias_criados} dias gerados para ${mes}`);
      loadSchedules();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao gerar escalas');
    } finally {
      setGenerating(false);
    }
  }

  const prevMes = () => {
    const [y, m] = mes.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    setMes(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const nextMes = () => {
    const [y, m] = mes.split('-').map(Number);
    const d = new Date(y, m, 1);
    setMes(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const tipoDiaStyle = {
    normal:      'bg-green-900/30 text-green-300',
    folga:       'bg-gray-700/50 text-gray-400',
    feriado:     'bg-yellow-900/30 text-yellow-300',
    ferias:      'bg-blue-900/30 text-blue-300',
    afastamento: 'bg-red-900/30 text-red-300',
  };

  const byDate = {};
  for (const s of schedules) byDate[s.data] = s;

  const [ano, mesNum] = mes.split('-').map(Number);
  const diasNoMes = new Date(ano, mesNum, 0).getDate();
  const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  return (
    <div className="space-y-5">
      {/* Controles */}
      <div className="flex flex-wrap gap-3 items-center">
        <select
          value={selectedEmp}
          onChange={e => setSelectedEmp(e.target.value)}
          className="bg-white/10 border border-white/20 rounded-xl px-4 py-2.5 text-white text-sm
                     focus:outline-none focus:border-indigo-400 flex-1 min-w-48"
        >
          <option value="" className="bg-gray-900">Selecione um funcionário</option>
          {employees.map(e => (
            <option key={e.id} value={e.id} className="bg-gray-900">{e.nome}</option>
          ))}
        </select>

        <div className="flex items-center gap-2">
          <button onClick={prevMes}
                  className="p-2 text-white/50 hover:text-white hover:bg-white/10 rounded-xl transition-all">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <span className="text-white font-semibold text-sm w-24 text-center">
            {new Date(ano, mesNum - 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
          </span>
          <button onClick={nextMes}
                  className="p-2 text-white/50 hover:text-white hover:bg-white/10 rounded-xl transition-all">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        <button
          onClick={generateBulk}
          disabled={!selectedEmp || generating}
          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500
                     text-white rounded-xl text-sm font-medium transition-all disabled:opacity-40"
        >
          {generating
            ? <RefreshCw className="w-4 h-4 animate-spin" />
            : <Plus className="w-4 h-4" />}
          Gerar mês
        </button>
      </div>

      {/* Calendário */}
      {!selectedEmp && (
        <div className="card text-center py-12 text-white/30">
          <Calendar className="w-10 h-10 mx-auto mb-2 opacity-40" />
          Selecione um funcionário para ver a escala
        </div>
      )}

      {selectedEmp && (
        <div className="card overflow-hidden p-0">
          {loading && (
            <div className="text-center py-12 text-white/30">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
              Carregando...
            </div>
          )}

          {!loading && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-white/40 text-left border-b border-white/10 text-xs uppercase">
                    <th className="px-4 py-3">Dia</th>
                    <th className="px-4 py-3">Semana</th>
                    <th className="px-4 py-3">Tipo</th>
                    <th className="px-4 py-3 hidden md:table-cell">Entrada</th>
                    <th className="px-4 py-3 hidden md:table-cell">Almoço</th>
                    <th className="px-4 py-3 hidden md:table-cell">Saída</th>
                    <th className="px-4 py-3 hidden lg:table-cell">Obs.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {Array.from({ length: diasNoMes }, (_, i) => {
                    const dia = i + 1;
                    const dateStr = `${ano}-${String(mesNum).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
                    const dow = new Date(dateStr + 'T12:00:00').getDay();
                    const sched = byDate[dateStr];

                    return (
                      <tr key={dateStr}
                          className={`hover:bg-white/5 transition-colors ${dow === 0 ? 'opacity-50' : ''}`}>
                        <td className="px-4 py-2.5 font-mono text-white/80 font-medium">{String(dia).padStart(2, '0')}</td>
                        <td className="px-4 py-2.5 text-white/50">{diasSemana[dow]}</td>
                        <td className="px-4 py-2.5">
                          {sched ? (
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${tipoDiaStyle[sched.tipo_dia] || ''}`}>
                              {sched.tipo_dia}
                            </span>
                          ) : (
                            <span className="text-white/20 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-white/60 hidden md:table-cell">
                          {sched?.entrada_prevista || '—'}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-white/60 text-xs hidden md:table-cell">
                          {sched?.saida_almoco_prevista
                            ? `${sched.saida_almoco_prevista} → ${sched.retorno_almoco_previsto || '?'}`
                            : '—'}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-white/60 hidden md:table-cell">
                          {sched?.saida_prevista || '—'}
                        </td>
                        <td className="px-4 py-2.5 text-white/30 text-xs hidden lg:table-cell">
                          {sched?.observacao || ''}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
