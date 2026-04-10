import React, { useEffect } from 'react';
import { CheckCircle, Clock, LogIn, LogOut, Coffee, Utensils } from 'lucide-react';

const TIPO_CONFIG = {
  entrada: {
    label: 'Entrada registrada!',
    sublabel: 'Boa jornada!',
    icon: LogIn,
    color: 'green',
    bg: 'bg-green-600',
  },
  saida_almoco: {
    label: 'Saída para almoço!',
    sublabel: 'Bom almoço!',
    icon: Utensils,
    color: 'orange',
    bg: 'bg-orange-600',
  },
  retorno_almoco: {
    label: 'Retorno do almoço!',
    sublabel: 'Boa tarde!',
    icon: Coffee,
    color: 'blue',
    bg: 'bg-blue-600',
  },
  saida: {
    label: 'Saída registrada!',
    sublabel: 'Até amanhã!',
    icon: LogOut,
    color: 'purple',
    bg: 'bg-purple-600',
  },
  extra: {
    label: 'Ponto extra registrado!',
    sublabel: '',
    icon: Clock,
    color: 'yellow',
    bg: 'bg-yellow-600',
  },
};

/**
 * SuccessScreen — exibida por 4s após um registro bem-sucedido.
 */
export default function SuccessScreen({ punch, onComplete }) {
  useEffect(() => {
    const timer = setTimeout(() => onComplete?.(), 4000);
    return () => clearTimeout(timer);
  }, [onComplete]);

  const config = TIPO_CONFIG[punch?.tipo] || TIPO_CONFIG.entrada;
  const Icon = config.icon;

  return (
    <div className="flex flex-col items-center justify-center gap-8 h-full animate-fade-in text-center px-8">
      {/* Ícone animado */}
      <div className={`w-40 h-40 rounded-full ${config.bg}/20 border-4 border-${config.color}-400
                       flex items-center justify-center success-icon`}>
        <Icon className={`w-20 h-20 text-${config.color}-400`} />
      </div>

      {/* Nome */}
      <div>
        <h1 className="text-5xl font-black text-white mb-2">{punch?.funcionario}</h1>
        <p className={`text-3xl font-bold text-${config.color}-400`}>{config.label}</p>
        {config.sublabel && (
          <p className="text-white/60 text-xl mt-2">{config.sublabel}</p>
        )}
      </div>

      {/* Horário e método */}
      <div className="glass rounded-2xl px-8 py-4">
        <p className="text-4xl font-mono font-bold text-white">{punch?.hora}</p>
        <p className="text-white/50 text-sm mt-1">
          {punch?.metodo === 'facial' ? '🤖 Reconhecimento Facial' : '🔢 PIN'}
        </p>
      </div>

      {/* Contador regressivo */}
      <CountdownBar duration={4000} />
    </div>
  );
}

function CountdownBar({ duration }) {
  const [width, setWidth] = React.useState(100);

  useEffect(() => {
    const start = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - start;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
      setWidth(remaining);
      if (remaining === 0) clearInterval(interval);
    }, 50);
    return () => clearInterval(interval);
  }, [duration]);

  return (
    <div className="w-48 h-1 bg-white/10 rounded-full overflow-hidden">
      <div
        className="h-full bg-white/40 rounded-full transition-all"
        style={{ width: `${width}%`, transition: 'width 50ms linear' }}
      />
    </div>
  );
}
