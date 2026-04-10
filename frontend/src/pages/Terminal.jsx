import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Wifi, WifiOff, Settings, Clock } from 'lucide-react';
import toast from 'react-hot-toast';

import FaceScanner from '../components/Terminal/FaceScanner';
import PinInput from '../components/Terminal/PinInput';
import ConfirmScreen from '../components/Terminal/ConfirmScreen';
import SuccessScreen from '../components/Terminal/SuccessScreen';
import { useClock } from '../hooks/useClock';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { useAppStore } from '../stores/appStore';
import { timeRecordAPI, employeeAPI } from '../services/api';

// Fases do terminal
const PHASE = {
  IDLE: 'idle',
  SCANNING: 'scanning',
  PIN: 'pin',
  CONFIRMING: 'confirming',
  SUCCESS: 'success',
  ERROR: 'error',
};

export default function Terminal() {
  const navigate = useNavigate();
  const { timeStr, dateStr } = useClock();
  const isOnline = useOnlineStatus();
  const { facialDescriptors, setFacialDescriptors, config } = useAppStore();

  const [phase, setPhase] = useState(PHASE.IDLE);
  const [identifiedEmployee, setIdentifiedEmployee] = useState(null);
  const [pendingEmployee, setPendingEmployee] = useState(null); // Para confirm screen
  const [lastPunch, setLastPunch] = useState(null);
  const [adminTaps, setAdminTaps] = useState(0); // Toque secreto para acessar admin

  // ==========================================
  // CARREGAR DESCRITORES FACIAIS AO MONTAR
  // ==========================================
  useEffect(() => {
    loadFacialDescriptors();

    // Iniciar câmera automaticamente após 2s no idle
    const timer = setTimeout(() => {
      if (phase === PHASE.IDLE) setPhase(PHASE.SCANNING);
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  async function loadFacialDescriptors() {
    try {
      const { data } = await employeeAPI.getFacialDescriptors();
      setFacialDescriptors(data);
      console.log(`${data.length} descritores faciais carregados`);
    } catch (err) {
      console.warn('Não foi possível carregar descritores:', err.message);
      // Funcionar offline com descritores do cache do store
    }
  }

  // ==========================================
  // TOQUE SECRETO PARA ADMIN (5 toques no logo)
  // ==========================================
  const handleLogoTap = useCallback(() => {
    const newCount = adminTaps + 1;
    setAdminTaps(newCount);
    if (newCount >= 5) {
      setAdminTaps(0);
      navigate('/admin/login');
    }
  }, [adminTaps, navigate]);

  // ==========================================
  // RECONHECIMENTO FACIAL — callbacks
  // ==========================================
  const handleFaceMatch = useCallback(async (employee, confidence) => {
    setIdentifiedEmployee(employee);
    await registerPunch(employee, 'facial', confidence);
  }, []);

  const handleFaceLowConfidence = useCallback((employee, confidence) => {
    setPendingEmployee({ ...employee, confidence });
    setPhase(PHASE.CONFIRMING);
  }, []);

  const handleFaceFail = useCallback(() => {
    setPhase(PHASE.PIN);
  }, []);

  const handleCameraError = useCallback((msg) => {
    toast.error(msg || 'Erro na câmera');
    setPhase(PHASE.PIN);
  }, []);

  // ==========================================
  // PIN — callbacks
  // ==========================================
  const handlePinSuccess = useCallback(async (employee) => {
    setIdentifiedEmployee(employee);
    await registerPunch(employee, 'pin', 1.0);
  }, []);

  // ==========================================
  // TELA DE CONFIRMAÇÃO — callbacks
  // ==========================================
  const handleConfirm = useCallback(async () => {
    if (!pendingEmployee) return;
    await registerPunch(pendingEmployee, 'facial', pendingEmployee.confidence);
    setPendingEmployee(null);
  }, [pendingEmployee]);

  const handleDeny = useCallback(() => {
    setPendingEmployee(null);
    setPhase(PHASE.PIN);
  }, []);

  // ==========================================
  // REGISTRAR PONTO
  // ==========================================
  async function registerPunch(employee, metodo, confianca) {
    try {
      const { data } = await timeRecordAPI.punch({
        employee_id: employee.id,
        metodo,
        confianca,
        dispositivo: 'tablet-terminal',
      });

      setLastPunch({
        ...data.record,
        funcionario: data.record.funcionario || employee.nome,
        metodo,
      });
      setPhase(PHASE.SUCCESS);
    } catch (err) {
      const msg = err.response?.data?.message || err.response?.data?.error || 'Erro ao registrar ponto';

      if (err.response?.status === 409) {
        // Registro duplicado
        toast.error(msg, { duration: 5000 });
        setLastPunch({
          tipo: 'entrada',
          hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          funcionario: employee.nome,
          metodo,
        });
        setPhase(PHASE.SUCCESS);
      } else {
        toast.error(msg);
        setPhase(PHASE.IDLE);
        setTimeout(() => setPhase(PHASE.SCANNING), 2000);
      }
    }
  }

  // ==========================================
  // RETORNAR AO IDLE APÓS SUCESSO
  // ==========================================
  const handleSuccessComplete = useCallback(() => {
    setPhase(PHASE.IDLE);
    setIdentifiedEmployee(null);
    setLastPunch(null);
    // Reiniciar câmera automaticamente
    setTimeout(() => setPhase(PHASE.SCANNING), 500);
  }, []);

  // ==========================================
  // RENDER
  // ==========================================
  return (
    <div className="fixed inset-0 bg-dark-900 flex flex-col overflow-hidden"
         style={{ background: 'linear-gradient(135deg, #0f0f2e 0%, #1a0a3a 100%)' }}>

      {/* ===== HEADER ===== */}
      <header className="flex items-center justify-between px-6 py-4 flex-shrink-0">
        {/* Logo + Nome empresa (toque secreto → admin) */}
        <button onClick={handleLogoTap} className="flex items-center gap-3 select-none">
          <div className="w-12 h-12 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-900/50">
            <Clock className="w-6 h-6 text-white" />
          </div>
          <div className="text-left">
            <p className="text-white font-bold text-base leading-tight">Centro Automotivo</p>
            <p className="text-indigo-300 font-bold text-base leading-tight">Aliança</p>
          </div>
        </button>

        {/* Status de conexão */}
        <div className="flex items-center gap-2">
          {isOnline
            ? <Wifi className="w-5 h-5 text-green-400" />
            : <WifiOff className="w-5 h-5 text-orange-400" />}
          <span className={`text-sm font-medium ${isOnline ? 'text-green-400' : 'text-orange-400'}`}>
            {isOnline ? 'Online' : 'Offline'}
          </span>
        </div>
      </header>

      {/* ===== RELÓGIO CENTRAL ===== */}
      {phase !== PHASE.SUCCESS && (
        <div className="text-center py-4 flex-shrink-0">
          <p className="text-7xl font-mono font-black text-white tracking-wider">{timeStr}</p>
          <p className="text-white/50 text-base mt-1 capitalize">{dateStr}</p>
        </div>
      )}

      {/* ===== CONTEÚDO PRINCIPAL ===== */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 overflow-hidden pb-6">

        {/* ---- IDLE ---- */}
        {phase === PHASE.IDLE && (
          <div className="text-center animate-fade-in">
            <div className="w-32 h-32 rounded-full bg-indigo-600/10 border-2 border-indigo-500/30
                            flex items-center justify-center mx-auto mb-6 pulse-ring">
              <div className="w-20 h-20 rounded-full bg-indigo-600/20 flex items-center justify-center">
                <svg className="w-10 h-10 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
              </div>
            </div>
            <p className="text-3xl font-bold text-white mb-2">Aproxime-se da câmera</p>
            <p className="text-white/50 text-lg">para registrar seu ponto</p>

            <button
              onClick={() => setPhase(PHASE.SCANNING)}
              className="mt-8 btn-terminal btn-primary max-w-xs mx-auto"
            >
              Iniciar Câmera
            </button>
            <button
              onClick={() => setPhase(PHASE.PIN)}
              className="mt-3 text-white/40 hover:text-white/70 text-sm block mx-auto transition-colors"
            >
              Ou use o PIN
            </button>
          </div>
        )}

        {/* ---- ESCANEANDO ---- */}
        {phase === PHASE.SCANNING && (
          <div className="w-full max-w-lg animate-fade-in">
            <FaceScanner
              onMatch={handleFaceMatch}
              onLowConfidence={handleFaceLowConfidence}
              onFail={handleFaceFail}
              onError={handleCameraError}
            />
          </div>
        )}

        {/* ---- PIN ---- */}
        {phase === PHASE.PIN && (
          <div className="w-full animate-slide-up">
            <PinInput
              onSuccess={handlePinSuccess}
              onCancel={() => setPhase(PHASE.SCANNING)}
            />
          </div>
        )}

        {/* ---- CONFIRMAÇÃO FACIAL ---- */}
        {phase === PHASE.CONFIRMING && pendingEmployee && (
          <div className="w-full max-w-sm animate-slide-up">
            <ConfirmScreen
              employee={pendingEmployee}
              confidence={pendingEmployee.confidence}
              onConfirm={handleConfirm}
              onDeny={handleDeny}
            />
          </div>
        )}

        {/* ---- SUCESSO ---- */}
        {phase === PHASE.SUCCESS && lastPunch && (
          <SuccessScreen punch={lastPunch} onComplete={handleSuccessComplete} />
        )}
      </main>

      {/* ===== RODAPÉ ===== */}
      <footer className="text-center py-3 flex-shrink-0">
        <p className="text-white/20 text-xs">
          Sistema de Ponto Eletrônico • Portaria MTE 671/2021
        </p>
      </footer>
    </div>
  );
}
