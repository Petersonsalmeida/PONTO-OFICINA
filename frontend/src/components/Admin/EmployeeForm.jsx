import React, { useState } from 'react';
import { X, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { employeeAPI } from '../../services/api';

const ESCALAS = ['fixo', '12x36', '6x1', 'alternado'];
const TURNOS  = ['dia', 'tarde', 'noite', 'revezamento'];
const PERFIS  = ['funcionario', 'lider_equipe', 'rh_gestor', 'super_admin'];

export default function EmployeeForm({ employee, onClose, onSaved }) {
  const isEditing = !!employee;

  const [form, setForm] = useState({
    nome: employee?.nome || '',
    cpf: employee?.cpf || '',
    cargo: employee?.cargo || '',
    departamento: employee?.departamento || '',
    jornada_padrao: employee?.jornada_padrao || '08:00-12:00,13:00-17:00',
    escala: employee?.escala || 'fixo',
    turno: employee?.turno || 'dia',
    carga_horaria_semanal: employee?.carga_horaria_semanal || 44,
    telefone: employee?.telefone || '',
    email: employee?.email || '',
    data_admissao: employee?.data_admissao || '',
    perfil: employee?.perfil || 'funcionario',
    pin: '',
  });
  const [loading, setLoading] = useState(false);

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));

  const formatCpf = (v) => {
    const d = v.replace(/\D/g, '').slice(0, 11);
    return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
            .replace(/(\d{3})(\d{3})(\d{3})/, '$1.$2.$3')
            .replace(/(\d{3})(\d{3})/, '$1.$2')
            .replace(/(\d{3})/, '$1');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.nome || !form.cpf || !form.cargo) {
      return toast.error('Nome, CPF e cargo são obrigatórios');
    }

    setLoading(true);
    try {
      const payload = { ...form };
      if (!payload.pin) delete payload.pin;

      if (isEditing) {
        await employeeAPI.update(employee.id, payload);
        toast.success('Funcionário atualizado!');
      } else {
        await employeeAPI.create(payload);
        toast.success('Funcionário cadastrado!');
      }
      onSaved?.();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao salvar funcionário');
    } finally {
      setLoading(false);
    }
  };

  const inputCls = `w-full bg-white/10 border border-white/20 rounded-xl px-4 py-2.5
    text-white placeholder-white/30 focus:outline-none focus:border-indigo-400
    focus:bg-white/15 transition-all text-sm`;

  const labelCls = 'text-white/60 text-xs block mb-1';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="w-full max-w-2xl glass rounded-3xl p-6 overflow-y-auto max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-white">
            {isEditing ? `Editar: ${employee.nome}` : 'Novo Funcionário'}
          </h2>
          <button onClick={onClose} className="p-2 text-white/40 hover:text-white rounded-xl hover:bg-white/10">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Linha 1: Nome + CPF */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Nome completo *</label>
              <input className={inputCls} value={form.nome} onChange={set('nome')} placeholder="João da Silva" required />
            </div>
            <div>
              <label className={labelCls}>CPF *</label>
              <input className={inputCls} value={form.cpf}
                onChange={e => setForm(f => ({ ...f, cpf: formatCpf(e.target.value) }))}
                placeholder="000.000.000-00" required disabled={isEditing} />
            </div>
          </div>

          {/* Linha 2: Cargo + Departamento */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Cargo *</label>
              <input className={inputCls} value={form.cargo} onChange={set('cargo')} placeholder="Mecânico" required />
            </div>
            <div>
              <label className={labelCls}>Departamento</label>
              <input className={inputCls} value={form.departamento} onChange={set('departamento')} placeholder="Oficina" />
            </div>
          </div>

          {/* Linha 3: Escala + Turno + Carga horária */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>Escala</label>
              <select className={inputCls} value={form.escala} onChange={set('escala')}>
                {ESCALAS.map(s => <option key={s} value={s} className="bg-gray-900">{s}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Turno</label>
              <select className={inputCls} value={form.turno} onChange={set('turno')}>
                {TURNOS.map(t => <option key={t} value={t} className="bg-gray-900">{t}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Horas/semana</label>
              <input className={inputCls} type="number" min={20} max={48}
                value={form.carga_horaria_semanal}
                onChange={e => setForm(f => ({ ...f, carga_horaria_semanal: parseInt(e.target.value) }))} />
            </div>
          </div>

          {/* Jornada padrão */}
          <div>
            <label className={labelCls}>Jornada padrão (ex: 08:00-12:00,13:00-17:00)</label>
            <input className={inputCls} value={form.jornada_padrao} onChange={set('jornada_padrao')}
              placeholder="08:00-12:00,13:00-17:00" />
          </div>

          {/* Linha 4: Telefone + Email */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Telefone (WhatsApp)</label>
              <input className={inputCls} value={form.telefone} onChange={set('telefone')} placeholder="(51) 99999-9999" />
            </div>
            <div>
              <label className={labelCls}>E-mail</label>
              <input className={inputCls} type="email" value={form.email} onChange={set('email')} placeholder="joao@email.com" />
            </div>
          </div>

          {/* Linha 5: Admissão + Perfil */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Data de admissão</label>
              <input className={inputCls} type="date" value={form.data_admissao} onChange={set('data_admissao')} />
            </div>
            <div>
              <label className={labelCls}>Perfil de acesso</label>
              <select className={inputCls} value={form.perfil} onChange={set('perfil')}>
                {PERFIS.map(p => <option key={p} value={p} className="bg-gray-900">{p}</option>)}
              </select>
            </div>
          </div>

          {/* PIN */}
          <div>
            <label className={labelCls}>
              {isEditing ? 'Novo PIN (deixe em branco para não alterar)' : 'PIN de acesso (4-6 dígitos) *'}
            </label>
            <input className={inputCls} type="password" value={form.pin} onChange={set('pin')}
              placeholder="••••••" maxLength={6} inputMode="numeric"
              required={!isEditing} />
          </div>

          {/* Botões */}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
                    className="flex-1 py-3 rounded-xl border border-white/20 text-white/60
                               hover:bg-white/5 transition-all text-sm font-medium">
              Cancelar
            </button>
            <button type="submit" disabled={loading}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl
                               bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm
                               transition-all disabled:opacity-40">
              {loading
                ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <><Save className="w-4 h-4" /> Salvar</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
