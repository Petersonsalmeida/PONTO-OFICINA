import React, { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Clock, AlertTriangle } from 'lucide-react';
import toast from 'react-hot-toast';
import { correctionAPI } from '../../services/api';

export default function Corrections() {
  const [corrections, setCorrections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pendente');
  const [processingId, setProcessingId] = useState(null);
  const [observacao, setObservacao] = useState('');
  const [confirmModal, setConfirmModal] = useState(null);

  useEffect(() => { load(); }, [filter]);

  async function load() {
    setLoading(true);
    try {
      const { data } = await correctionAPI.list({ status: filter });
      setCorrections(data);
    } catch {
      toast.error('Erro ao carregar solicitações');
    } finally {
      setLoading(false);
    }
  }

  async function handleApprove(id, status) {
    setProcessingId(id);
    try {
      await correctionAPI.approve(id, status, observacao);
      toast.success(status === 'aprovado' ? 'Ajuste aprovado!' : 'Ajuste rejeitado');
      setConfirmModal(null);
      setObservacao('');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao processar');
    } finally {
      setProcessingId(null);
    }
  }

  const tipoLabel = {
    inclusao: 'Inclusão', exclusao: 'Exclusão', alteracao: 'Alteração',
  };

  const statusConfig = {
    pendente: { icon: Clock, color: 'text-orange-400', bg: 'bg-orange-900/20', label: 'Pendente' },
    aprovado: { icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-900/20', label: 'Aprovado' },
    rejeitado: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-900/20', label: 'Rejeitado' },
  };

  return (
    <div className="space-y-5">
      {/* Filtro de status */}
      <div className="flex gap-2">
        {Object.entries(statusConfig).map(([key, cfg]) => {
          const Icon = cfg.icon;
          return (
            <button key={key} onClick={() => setFilter(key)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all
                      ${filter === key ? `${cfg.bg} ${cfg.color} border border-current/30` : 'bg-white/5 text-white/40 hover:bg-white/10'}`}>
              <Icon className="w-4 h-4" />
              {cfg.label}
            </button>
          );
        })}
      </div>

      {/* Lista de correções */}
      <div className="space-y-3">
        {loading && <div className="text-center py-12 text-white/30">Carregando...</div>}

        {!loading && corrections.length === 0 && (
          <div className="card text-center py-12 text-white/30">
            <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-50" />
            Nenhuma solicitação {filter}
          </div>
        )}

        {corrections.map(corr => {
          const status = statusConfig[corr.status];
          const StatusIcon = status.icon;

          return (
            <div key={corr.id} className="card">
              <div className="flex items-start justify-between gap-4">
                {/* Informações */}
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${status.bg} ${status.color} font-medium`}>
                      {tipoLabel[corr.tipo] || corr.tipo}
                    </span>
                    <StatusIcon className={`w-4 h-4 ${status.color}`} />
                  </div>

                  <p className="text-white font-semibold">{corr.funcionario_nome}</p>
                  <p className="text-white/40 text-xs mb-3">{corr.funcionario_cpf}</p>

                  {/* Detalhes da correção */}
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {corr.registro_data && (
                      <div>
                        <span className="text-white/40 text-xs">Registro original</span>
                        <p className="text-white">
                          {corr.registro_data?.split('-').reverse().join('/')} {corr.registro_hora}
                          {corr.registro_tipo && ` (${corr.registro_tipo})`}
                        </p>
                      </div>
                    )}
                    {corr.timestamp_novo && (
                      <div>
                        <span className="text-white/40 text-xs">Novo horário</span>
                        <p className="text-green-300">{new Date(corr.timestamp_novo).toLocaleString('pt-BR')}</p>
                      </div>
                    )}
                  </div>

                  <div className="mt-3 p-3 bg-white/5 rounded-xl">
                    <span className="text-white/40 text-xs">Motivo: </span>
                    <span className="text-white/80 text-sm">{corr.motivo}</span>
                  </div>

                  {corr.solicitante_nome && (
                    <p className="text-white/30 text-xs mt-2">
                      Solicitado por: {corr.solicitante_nome} •{' '}
                      {new Date(corr.criado_em).toLocaleString('pt-BR')}
                    </p>
                  )}

                  {corr.observacao_aprovador && (
                    <p className="text-white/50 text-xs mt-1 italic">
                      Obs: {corr.observacao_aprovador}
                    </p>
                  )}
                </div>

                {/* Ações (apenas pendente) */}
                {corr.status === 'pendente' && (
                  <div className="flex flex-col gap-2 flex-shrink-0">
                    <button onClick={() => setConfirmModal({ id: corr.id, status: 'aprovado' })}
                            className="flex items-center gap-1.5 px-3 py-2 bg-green-600/20 hover:bg-green-600/40
                                       text-green-400 rounded-xl text-xs font-medium transition-colors">
                      <CheckCircle className="w-4 h-4" /> Aprovar
                    </button>
                    <button onClick={() => setConfirmModal({ id: corr.id, status: 'rejeitado' })}
                            className="flex items-center gap-1.5 px-3 py-2 bg-red-600/20 hover:bg-red-600/40
                                       text-red-400 rounded-xl text-xs font-medium transition-colors">
                      <XCircle className="w-4 h-4" /> Rejeitar
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal de confirmação */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-sm glass rounded-3xl p-6">
            <h3 className={`text-lg font-bold mb-4 ${confirmModal.status === 'aprovado' ? 'text-green-400' : 'text-red-400'}`}>
              {confirmModal.status === 'aprovado' ? 'Aprovar' : 'Rejeitar'} solicitação?
            </h3>
            <div>
              <label className="text-white/60 text-sm block mb-1">Observação (opcional)</label>
              <textarea
                value={observacao}
                onChange={e => setObservacao(e.target.value)}
                rows={3}
                className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3
                           text-white text-sm focus:outline-none focus:border-indigo-400 resize-none"
                placeholder="Observação para o funcionário..."
              />
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={() => { setConfirmModal(null); setObservacao(''); }}
                      className="flex-1 py-2.5 rounded-xl border border-white/20 text-white/60 text-sm">
                Cancelar
              </button>
              <button onClick={() => handleApprove(confirmModal.id, confirmModal.status)}
                      disabled={processingId === confirmModal.id}
                      className={`flex-1 py-2.5 rounded-xl text-white text-sm font-medium transition-all
                        ${confirmModal.status === 'aprovado'
                          ? 'bg-green-600 hover:bg-green-500'
                          : 'bg-red-600 hover:bg-red-500'} disabled:opacity-40`}>
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
