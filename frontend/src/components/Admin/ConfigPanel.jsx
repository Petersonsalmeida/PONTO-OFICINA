import React, { useState, useEffect } from 'react';
import { Save, Plus, Trash2, Bell } from 'lucide-react';
import toast from 'react-hot-toast';
import { configAPI } from '../../services/api';

export default function ConfigPanel() {
  const [config, setConfig] = useState({});
  const [holidays, setHolidays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newHoliday, setNewHoliday] = useState({ data: '', nome: '', tipo: 'nacional' });
  const [ano, setAno] = useState(new Date().getFullYear().toString());
  const [testing, setTesting] = useState(false);

  useEffect(() => { load(); }, [ano]);

  async function load() {
    setLoading(true);
    try {
      const [cfgRes, holRes] = await Promise.all([
        configAPI.get(),
        configAPI.holidays({ ano }),
      ]);
      setConfig(cfgRes.data);
      setHolidays(holRes.data);
    } catch {
      toast.error('Erro ao carregar configurações');
    } finally {
      setLoading(false);
    }
  }

  const updateVal = (chave, valor) =>
    setConfig(c => ({ ...c, [chave]: { ...c[chave], valor } }));

  async function save() {
    setSaving(true);
    try {
      const updates = Object.fromEntries(
        Object.entries(config).map(([k, v]) => [k, v.valor])
      );
      await configAPI.update(updates);
      toast.success('Configurações salvas!');
    } catch {
      toast.error('Erro ao salvar configurações');
    } finally {
      setSaving(false);
    }
  }

  async function testarLembretes() {
    setTesting(true);
    try {
      await configAPI.checkAlerts('todos');
      toast.success('Verificação disparada — lembretes serão enviados se houver pendências');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao executar verificação');
    } finally {
      setTesting(false);
    }
  }

  async function addHoliday() {
    if (!newHoliday.data || !newHoliday.nome) {
      return toast.error('Data e nome são obrigatórios');
    }
    try {
      await configAPI.addHoliday(newHoliday);
      toast.success('Feriado adicionado!');
      setNewHoliday({ data: '', nome: '', tipo: 'nacional' });
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao adicionar feriado');
    }
  }

  const inputCls = `w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2.5
    text-white text-sm focus:outline-none focus:border-indigo-400 transition-all`;

  const FIELDS = [
    { section: 'Empresa', fields: [
      { key: 'empresa_nome', label: 'Nome da empresa' },
      { key: 'empresa_cnpj', label: 'CNPJ' },
      { key: 'empresa_endereco', label: 'Endereço' },
      { key: 'empresa_telefone', label: 'Telefone' },
    ]},
    { section: 'Ponto', fields: [
      { key: 'tolerancia_entrada_min', label: 'Tolerância entrada (min)', type: 'number' },
      { key: 'tolerancia_saida_min', label: 'Tolerância saída (min)', type: 'number' },
      { key: 'alerta_atraso_min', label: 'Alertar atraso após (min)', type: 'number' },
      { key: 'alerta_jornada_aberta_h', label: 'Alertar jornada aberta após (h)', type: 'number' },
      { key: 'intervalo_almoco_min', label: 'Almoço mínimo (min)', type: 'number' },
      { key: 'jornada_maxima_h', label: 'Jornada máxima (h)', type: 'number' },
    ]},
    { section: 'Lembretes WhatsApp', fields: [
      { key: 'alerta_esquecimento_ativo', label: 'Lembretes de esquecimento ativos', type: 'select',
        options: [{ value: '1', label: 'Sim' }, { value: '0', label: 'Não' }] },
      { key: 'alerta_esquecimento_min', label: 'Avisar após (min do horário previsto)', type: 'number' },
    ]},
    { section: 'Reconhecimento Facial', fields: [
      { key: 'reconhecimento_facial_min_confianca', label: 'Confiança mínima (%)', type: 'number' },
      { key: 'reconhecimento_facial_auto_confianca', label: 'Confiança auto-registro (%)', type: 'number' },
    ]},
    { section: 'Cálculos (CLT)', fields: [
      { key: 'adicional_noturno_inicio', label: 'Início adicional noturno' },
      { key: 'adicional_noturno_fim', label: 'Fim adicional noturno' },
      { key: 'percentual_he_50', label: 'HE 50% (%)', type: 'number' },
      { key: 'percentual_he_100', label: 'HE 100% (%)', type: 'number' },
      { key: 'percentual_noturno', label: 'Adicional noturno (%)', type: 'number' },
    ]},
  ];

  if (loading) return <div className="text-center py-12 text-white/30">Carregando...</div>;

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Configurações */}
      {FIELDS.map(section => (
        <div key={section.section} className="card space-y-4">
          <div className="flex items-center justify-between border-b border-white/10 pb-2">
            <h3 className="text-white font-bold text-base">{section.section}</h3>
            {section.section === 'Lembretes WhatsApp' && (
              <button
                onClick={testarLembretes}
                disabled={testing}
                className="flex items-center gap-2 px-3 py-1.5 bg-amber-600/80 hover:bg-amber-500
                           text-white text-xs rounded-lg transition-all disabled:opacity-40"
                title="Dispara verificação imediata e envia lembretes pendentes via WhatsApp"
              >
                {testing
                  ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  : <Bell className="w-3 h-3" />}
                Testar agora
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            {section.fields.map(field => (
              <div key={field.key}>
                <label className="text-white/50 text-xs block mb-1">{field.label}</label>
                {field.type === 'select' ? (
                  <select
                    className={inputCls}
                    value={config[field.key]?.valor || ''}
                    onChange={e => updateVal(field.key, e.target.value)}
                  >
                    {field.options.map(opt => (
                      <option key={opt.value} value={opt.value} className="bg-gray-900">{opt.label}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    className={inputCls}
                    type={field.type || 'text'}
                    value={config[field.key]?.valor || ''}
                    onChange={e => updateVal(field.key, e.target.value)}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      <button onClick={save} disabled={saving}
              className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500
                         text-white rounded-xl font-medium transition-all disabled:opacity-40">
        {saving
          ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          : <><Save className="w-4 h-4" /> Salvar configurações</>}
      </button>

      {/* Feriados */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-white font-bold text-base">Feriados</h3>
          <select
            className="bg-white/10 border border-white/20 rounded-lg px-2 py-1 text-white text-sm focus:outline-none"
            value={ano} onChange={e => setAno(e.target.value)}
          >
            {['2024','2025','2026'].map(a => (
              <option key={a} value={a} className="bg-gray-900">{a}</option>
            ))}
          </select>
        </div>

        {/* Adicionar feriado */}
        <div className="grid grid-cols-3 gap-3">
          <input type="date" className={inputCls} value={newHoliday.data}
                 onChange={e => setNewHoliday(h => ({ ...h, data: e.target.value }))} />
          <input className={inputCls} placeholder="Nome do feriado" value={newHoliday.nome}
                 onChange={e => setNewHoliday(h => ({ ...h, nome: e.target.value }))} />
          <div className="flex gap-2">
            <select className={inputCls} value={newHoliday.tipo}
                    onChange={e => setNewHoliday(h => ({ ...h, tipo: e.target.value }))}>
              <option value="nacional" className="bg-gray-900">Nacional</option>
              <option value="estadual_rs" className="bg-gray-900">Estadual RS</option>
              <option value="municipal_poa" className="bg-gray-900">Municipal POA</option>
            </select>
            <button onClick={addHoliday}
                    className="px-3 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-all flex-shrink-0">
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Lista de feriados */}
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {holidays.map(h => (
            <div key={h.id} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-white/5">
              <div>
                <span className="text-white/80 text-sm">{h.data.split('-').reverse().join('/')}</span>
                <span className="text-white/50 text-sm ml-3">{h.nome}</span>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full ${
                h.tipo === 'nacional' ? 'bg-blue-900/30 text-blue-300' :
                h.tipo === 'estadual_rs' ? 'bg-purple-900/30 text-purple-300' :
                'bg-orange-900/30 text-orange-300'
              }`}>
                {h.tipo === 'nacional' ? 'Nacional' : h.tipo === 'estadual_rs' ? 'RS' : 'POA'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
