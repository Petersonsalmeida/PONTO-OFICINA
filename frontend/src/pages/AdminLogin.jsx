import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, ChevronLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import { authAPI } from '../services/api';
import { useAppStore } from '../stores/appStore';

export default function AdminLogin() {
  const navigate = useNavigate();
  const setAuth = useAppStore(s => s.setAuth);

  const [cpf, setCpf] = useState('');
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);

  const formatCpf = (v) => {
    const d = v.replace(/\D/g, '').slice(0, 11);
    return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
            .replace(/(\d{3})(\d{3})(\d{3})/, '$1.$2.$3')
            .replace(/(\d{3})(\d{3})/, '$1.$2')
            .replace(/(\d{3})/, '$1');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!cpf || !pin) return toast.error('Preencha CPF e PIN');

    setLoading(true);
    try {
      const { data } = await authAPI.login(cpf, pin);
      setAuth(data.token, data.usuario);
      toast.success(`Bem-vindo, ${data.usuario.nome}!`);
      navigate('/admin');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Credenciais inválidas');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center p-6"
         style={{ background: 'linear-gradient(135deg, #0f0f2e, #1a0a3a)' }}>

      <div className="w-full max-w-sm glass rounded-3xl p-8">
        {/* Back to terminal */}
        <button onClick={() => navigate('/')}
                className="flex items-center gap-1 text-white/40 hover:text-white/70 text-sm mb-6 transition-colors">
          <ChevronLeft className="w-4 h-4" />
          Terminal de Ponto
        </button>

        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Lock className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Painel Administrativo</h1>
          <p className="text-white/50 text-sm mt-1">Centro Automotivo Aliança</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="text-white/60 text-sm block mb-1">CPF</label>
            <input
              type="text"
              value={cpf}
              onChange={e => setCpf(formatCpf(e.target.value))}
              placeholder="000.000.000-00"
              className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3
                         text-white placeholder-white/30 focus:outline-none focus:border-indigo-400
                         focus:bg-white/15 transition-all"
              inputMode="numeric"
            />
          </div>

          <div>
            <label className="text-white/60 text-sm block mb-1">PIN</label>
            <input
              type="password"
              value={pin}
              onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="••••••"
              className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3
                         text-white placeholder-white/30 focus:outline-none focus:border-indigo-400
                         focus:bg-white/15 transition-all"
              inputMode="numeric"
              maxLength={6}
            />
          </div>

          <button type="submit" disabled={loading}
                  className="btn-terminal btn-primary mt-2 disabled:opacity-40">
            {loading
              ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
