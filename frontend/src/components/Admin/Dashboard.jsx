import React, { useEffect, useState } from 'react';
import { Users, Clock, UserCheck, UserX, AlertTriangle, RefreshCw } from 'lucide-react';
import { reportAPI, timeRecordAPI } from '../../services/api';
import { useClock } from '../../hooks/useClock';
import { clsx } from 'clsx';

export default function Dashboard() {
  const { timeStr, dateStr } = useClock();
  const [dashboard, setDashboard] = useState(null);
  const [todayStatus, setTodayStatus] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
    const interval = setInterval(load, 60_000); // Atualizar a cada minuto
    return () => clearInterval(interval);
  }, []);

  async function load() {
    try {
      const [dashRes, statusRes] = await Promise.all([
        reportAPI.dashboard(),
        timeRecordAPI.todayStatus(),
      ]);
      setDashboard(dashRes.data);
      setTodayStatus(statusRes.data);
    } catch (err) {
      console.error('Erro ao carregar dashboard:', err);
    } finally {
      setLoading(false);
    }
  }

  const getStatusLabel = (emp) => {
    if (emp.saida) return { label: 'Saiu', color: 'text-gray-400', dot: 'bg-gray-500' };
    if (emp.retorno_almoco) return { label: 'Presente', color: 'text-green-400', dot: 'bg-green-500' };
    if (emp.saida_almoco) return { label: 'Almoço', color: 'text-orange-400', dot: 'bg-orange-500' };
    if (emp.entrada) return { label: 'Presente', color: 'text-green-400', dot: 'bg-green-400 animate-pulse' };
    return { label: 'Ausente', color: 'text-red-400', dot: 'bg-red-500' };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Relógio */}
      <div className="text-center">
        <p className="text-4xl font-mono font-black text-white">{timeStr}</p>
        <p className="text-white/50 capitalize">{dateStr}</p>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={Users}
          label="Total Ativos"
          value={dashboard?.totalAtivos ?? '--'}
          color="indigo"
        />
        <StatCard
          icon={UserCheck}
          label="Em Jornada"
          value={dashboard?.emJornada ?? '--'}
          color="green"
        />
        <StatCard
          icon={UserX}
          label="Ausentes"
          value={dashboard?.ausentes ?? '--'}
          color="red"
        />
        <StatCard
          icon={AlertTriangle}
          label="Ajustes Pendentes"
          value={dashboard?.correcoesPendentes ?? '--'}
          color="orange"
        />
      </div>

      {/* Tabela de presença de hoje */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">Presença de Hoje</h2>
          <button onClick={load} className="text-white/40 hover:text-white/70 transition-colors">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-white/40 text-left border-b border-white/10">
                <th className="pb-2 font-medium">Funcionário</th>
                <th className="pb-2 font-medium">Entrada</th>
                <th className="pb-2 font-medium hidden md:table-cell">Almoço</th>
                <th className="pb-2 font-medium">Saída</th>
                <th className="pb-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {todayStatus.map(emp => {
                const status = getStatusLabel(emp);
                return (
                  <tr key={emp.id} className="hover:bg-white/5 transition-colors">
                    <td className="py-3">
                      <div>
                        <p className="text-white font-medium">{emp.nome}</p>
                        <p className="text-white/40 text-xs">{emp.cargo}</p>
                      </div>
                    </td>
                    <td className="py-3 font-mono text-white/80">{emp.entrada || '--'}</td>
                    <td className="py-3 font-mono text-white/80 hidden md:table-cell">
                      {emp.saida_almoco ? `${emp.saida_almoco} → ${emp.retorno_almoco || '...'}` : '--'}
                    </td>
                    <td className="py-3 font-mono text-white/80">{emp.saida || '--'}</td>
                    <td className="py-3">
                      <span className={`flex items-center gap-2 ${status.color}`}>
                        <span className={`status-dot ${status.dot}`} />
                        {status.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {todayStatus.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-white/30">
                    Nenhum registro hoje
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }) {
  const colorMap = {
    indigo: 'text-indigo-400 bg-indigo-600/10 border-indigo-500/20',
    green:  'text-green-400 bg-green-600/10 border-green-500/20',
    red:    'text-red-400 bg-red-600/10 border-red-500/20',
    orange: 'text-orange-400 bg-orange-600/10 border-orange-500/20',
  };

  return (
    <div className={`card border ${colorMap[color]}`}>
      <Icon className={`w-6 h-6 mb-2 ${colorMap[color].split(' ')[0]}`} />
      <p className="text-3xl font-black text-white">{value}</p>
      <p className="text-white/50 text-xs mt-1">{label}</p>
    </div>
  );
}
