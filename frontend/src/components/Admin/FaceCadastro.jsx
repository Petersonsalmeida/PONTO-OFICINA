import React, { useRef, useState, useEffect } from 'react';
import { X, Camera, CheckCircle, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { loadModels, captureMultipleDescriptors } from '../../services/faceRecognition';
import { employeeAPI } from '../../services/api';

/**
 * FaceCadastro — modal para cadastrar template facial do funcionário.
 * Captura 5 frames de ângulos diferentes e gera descritor médio.
 */
export default function FaceCadastro({ employee, onClose, onSaved }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const [step, setStep] = useState('init'); // init | capturing | done | error
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('Iniciando câmera...');
  const [saving, setSaving] = useState(false);
  const [descriptor, setDescriptor] = useState(null);

  useEffect(() => {
    startCamera();
    return () => streamRef.current?.getTracks().forEach(t => t.stop());
  }, []);

  async function startCamera() {
    try {
      await loadModels();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setStep('ready');
      setMessage('Câmera pronta! Posicione seu rosto e clique em "Iniciar Cadastro".');
    } catch (err) {
      setStep('error');
      setMessage('Câmera não disponível: ' + err.message);
    }
  }

  async function handleCapture() {
    if (!videoRef.current) return;
    setStep('capturing');
    setMessage('Mantenha o rosto na câmera. Vire levemente a cabeça nas capturas...');

    try {
      const result = await captureMultipleDescriptors(
        videoRef.current,
        5,
        (i, total) => {
          setProgress(Math.round((i / total) * 100));
          const msgs = [
            'Olhe diretamente para a câmera...',
            'Vire levemente para a esquerda...',
            'Vire levemente para a direita...',
            'Incline a cabeça para cima...',
            'Incline a cabeça para baixo...',
          ];
          setMessage(msgs[i] || 'Capturando...');
        }
      );

      setDescriptor(result.descriptor);
      setStep('done');
      setMessage(`${result.samplesCount} capturas realizadas com sucesso!`);
      setProgress(100);
    } catch (err) {
      setStep('error');
      setMessage('Erro nas capturas: ' + err.message);
      toast.error('Posicione o rosto melhor na câmera e tente novamente');
    }
  }

  async function handleSave() {
    if (!descriptor) return;
    setSaving(true);
    try {
      await employeeAPI.saveFacialTemplate(employee.id, Array.from(descriptor));
      toast.success(`Template facial de ${employee.nome} salvo!`);
      onSaved?.();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erro ao salvar template');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-md glass rounded-3xl p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-lg font-bold text-white">Cadastro Facial</h2>
            <p className="text-white/50 text-sm">{employee.nome}</p>
          </div>
          <button onClick={onClose} className="p-2 text-white/40 hover:text-white rounded-xl hover:bg-white/10">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Câmera */}
        <div className="relative rounded-2xl overflow-hidden bg-dark-900 mb-5"
             style={{ aspectRatio: '4/3' }}>
          <video ref={videoRef} autoPlay playsInline muted
                 className="w-full h-full object-cover"
                 style={{ transform: 'scaleX(-1)' }} />

          {/* Guia oval */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="face-overlay border-4 border-dashed border-indigo-400/50" />
          </div>

          {/* Progress overlay */}
          {step === 'capturing' && (
            <div className="absolute bottom-0 left-0 right-0 bg-black/60 p-3">
              <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                     style={{ width: `${progress}%` }} />
              </div>
              <p className="text-white/70 text-xs mt-1 text-center">{progress}%</p>
            </div>
          )}

          {/* Ícone de sucesso */}
          {step === 'done' && (
            <div className="absolute inset-0 flex items-center justify-center bg-green-900/40">
              <CheckCircle className="w-20 h-20 text-green-400 success-icon" />
            </div>
          )}
        </div>

        {/* Mensagem */}
        <p className={`text-sm text-center mb-5 ${
          step === 'error' ? 'text-red-400' :
          step === 'done' ? 'text-green-400' :
          'text-white/60'
        }`}>
          {message}
        </p>

        {/* Instruções */}
        {step === 'ready' && (
          <ul className="text-xs text-white/40 space-y-1 mb-5">
            <li>• Boa iluminação no rosto</li>
            <li>• Remova óculos escuros e chapéu</li>
            <li>• Serão tiradas 5 fotos em ângulos diferentes</li>
            <li>• Siga as instruções na tela durante a captura</li>
          </ul>
        )}

        {/* Botões */}
        <div className="flex gap-3">
          <button onClick={onClose}
                  className="flex-1 py-3 rounded-xl border border-white/20 text-white/60
                             hover:bg-white/5 transition-all text-sm">
            Cancelar
          </button>

          {step === 'ready' && (
            <button onClick={handleCapture}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl
                               bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-all">
              <Camera className="w-4 h-4" />
              Iniciar Cadastro
            </button>
          )}

          {step === 'done' && (
            <button onClick={handleSave} disabled={saving}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl
                               bg-green-600 hover:bg-green-500 text-white text-sm font-medium
                               transition-all disabled:opacity-40">
              {saving
                ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                : <><CheckCircle className="w-4 h-4" /> Salvar Template</>}
            </button>
          )}

          {step === 'error' && (
            <button onClick={startCamera}
                    className="flex-1 py-3 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-sm font-medium transition-all">
              Tentar novamente
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
