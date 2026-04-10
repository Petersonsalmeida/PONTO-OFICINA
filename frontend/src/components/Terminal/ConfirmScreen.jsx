import React from 'react';
import { User, CheckCircle, XCircle } from 'lucide-react';

/**
 * ConfirmScreen — mostrada quando confiança facial está entre 60-85%.
 * Pede ao funcionário para confirmar ou negar a identidade.
 */
export default function ConfirmScreen({ employee, confidence, onConfirm, onDeny }) {
  const confidencePercent = Math.round(confidence * 100);

  return (
    <div className="flex flex-col items-center gap-8 animate-slide-up">
      {/* Avatar */}
      <div className="w-28 h-28 rounded-full bg-indigo-600/30 border-4 border-indigo-400/50
                      flex items-center justify-center pulse-ring">
        <User className="w-14 h-14 text-indigo-300" />
      </div>

      {/* Info */}
      <div className="text-center">
        <p className="text-white/60 text-lg mb-1">Você é este funcionário?</p>
        <h2 className="text-4xl font-bold text-white mb-2">{employee.nome}</h2>
        <p className="text-white/50">{employee.cargo}</p>

        {/* Barra de confiança */}
        <div className="mt-4 w-48 mx-auto">
          <div className="flex justify-between text-xs text-white/40 mb-1">
            <span>Confiança</span>
            <span>{confidencePercent}%</span>
          </div>
          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${confidencePercent}%`,
                background: confidencePercent > 75
                  ? '#22c55e'
                  : confidencePercent > 60
                  ? '#f97316'
                  : '#ef4444',
              }}
            />
          </div>
        </div>
      </div>

      {/* Botões */}
      <div className="flex gap-4 w-full max-w-sm">
        <button
          onClick={onDeny}
          className="flex-1 btn-terminal btn-danger text-lg py-6 gap-2"
        >
          <XCircle className="w-7 h-7" />
          Não sou eu
        </button>
        <button
          onClick={onConfirm}
          className="flex-1 btn-terminal btn-success text-lg py-6 gap-2"
        >
          <CheckCircle className="w-7 h-7" />
          Sou eu!
        </button>
      </div>
    </div>
  );
}
