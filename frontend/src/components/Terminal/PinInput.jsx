import React, { useState, useRef, useEffect } from 'react';
import { Delete, Lock } from 'lucide-react';
import toast from 'react-hot-toast';
import { timeRecordAPI } from '../../services/api';

/**
 * PinInput — teclado numérico touch-friendly para autenticação por PIN.
 * Suporta PIN de 4-6 dígitos.
 */
export default function PinInput({ onSuccess, onCancel }) {
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [shake, setShake] = useState(false);
  const maxLen = 6;

  // Botões do teclado numérico (layout calculadora)
  const keys = ['1','2','3','4','5','6','7','8','9','','0','<'];

  const handleKey = (key) => {
    if (loading) return;

    if (key === '<') {
      setPin(p => p.slice(0, -1));
      return;
    }
    if (key === '') return;

    const newPin = pin + key;
    setPin(newPin);

    // Auto-submit ao atingir 4-6 dígitos se o usuário não digitou mais
    if (newPin.length >= 4) {
      // Tentar verificar após breve pausa (permite digitar mais dígitos)
      // Se o usuário quiser 6 dígitos, continua digitando
    }
  };

  const handleSubmit = async () => {
    if (pin.length < 4) {
      toast.error('PIN deve ter pelo menos 4 dígitos');
      return;
    }

    setLoading(true);
    try {
      const { data } = await timeRecordAPI.verifyPin(pin);
      onSuccess?.(data.employee);
    } catch (err) {
      const msg = err.response?.data?.error || 'PIN inválido';
      toast.error(msg);
      setShake(true);
      setTimeout(() => { setShake(false); setPin(''); }, 600);
    } finally {
      setLoading(false);
    }
  };

  // Keydown para tablets com teclado físico
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key >= '0' && e.key <= '9') handleKey(e.key);
      else if (e.key === 'Backspace') handleKey('<');
      else if (e.key === 'Enter') handleSubmit();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pin, loading]);

  return (
    <div className="flex flex-col items-center gap-8 w-full max-w-xs mx-auto">
      {/* Header */}
      <div className="text-center">
        <div className="w-16 h-16 rounded-full bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center mx-auto mb-4">
          <Lock className="w-8 h-8 text-indigo-400" />
        </div>
        <h2 className="text-2xl font-bold text-white">Digite seu PIN</h2>
        <p className="text-white/50 text-sm mt-1">4 a 6 dígitos</p>
      </div>

      {/* Display do PIN */}
      <div className={`flex gap-3 ${shake ? 'animate-bounce' : ''}`}
           style={{ animation: shake ? 'shake 0.5s ease-in-out' : '' }}>
        {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
          <div key={i}
               className={`w-12 h-14 rounded-xl border-2 flex items-center justify-center transition-all duration-200
                 ${i < pin.length
                   ? 'border-indigo-400 bg-indigo-600/20'
                   : 'border-white/20 bg-white/5'}`}>
            {i < pin.length && (
              <div className="w-3 h-3 rounded-full bg-indigo-300" />
            )}
          </div>
        ))}
      </div>

      {/* Teclado numérico */}
      <div className="grid grid-cols-3 gap-3 w-full">
        {keys.map((key, idx) => (
          <button
            key={idx}
            onClick={() => key !== '' ? handleKey(key) : null}
            disabled={loading || (key !== '<' && key !== '' && pin.length >= maxLen)}
            className={`
              h-18 py-5 rounded-2xl text-2xl font-bold transition-all duration-150 select-none
              ${key === '' ? 'invisible' : ''}
              ${key === '<'
                ? 'bg-white/10 text-red-300 hover:bg-red-900/30 active:scale-95'
                : 'bg-white/10 text-white hover:bg-white/20 active:scale-90 active:bg-indigo-600/40'}
              ${loading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              disabled:opacity-40
            `}
          >
            {key === '<'
              ? <Delete className="w-6 h-6 mx-auto" />
              : key}
          </button>
        ))}
      </div>

      {/* Botão confirmar */}
      <button
        onClick={handleSubmit}
        disabled={pin.length < 4 || loading}
        className="btn-terminal btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
      >
        {loading ? (
          <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
        ) : 'Confirmar'}
      </button>

      {/* Voltar */}
      <button onClick={onCancel} className="text-white/40 hover:text-white/70 text-sm transition-colors">
        Voltar para câmera
      </button>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%       { transform: translateX(-8px); }
          40%       { transform: translateX(8px); }
          60%       { transform: translateX(-8px); }
          80%       { transform: translateX(8px); }
        }
      `}</style>
    </div>
  );
}
