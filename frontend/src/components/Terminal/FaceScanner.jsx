import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Camera, Scan, AlertCircle } from 'lucide-react';
import {
  loadModels, detectFace, detectFaceLite, matchFace, detectBlink,
} from '../../services/faceRecognition';
import { useAppStore } from '../../stores/appStore';

/**
 * FaceScanner — câmera ativa com reconhecimento facial em tempo real.
 *
 * Estratégia de performance:
 *  - Detecção throttled em ~3 FPS (300ms entre frames). Inferência TF.js
 *    é pesada; rodar a 60 FPS trava o navegador.
 *  - Fase liveness usa detectFaceLite (sem descritor 128D) — ~3x mais rápida.
 *  - Fase scanning usa detectFace completo apenas quando precisa.
 *
 * Props:
 *  onMatch(employee, confidence) — rosto reconhecido com alta confiança
 *  onLowConfidence(employee, confidence) — rosto parcialmente reconhecido
 *  onFail() — não reconheceu, redirecionar para PIN
 *  onError(msg) — erro de câmera/modelo
 */
export default function FaceScanner({ onMatch, onLowConfidence, onFail, onError }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const timerRef = useRef(null);
  const streamRef = useRef(null);
  const blinkCountRef = useRef(0);
  const blinkingRef = useRef(false);
  const startTimeRef = useRef(Date.now());
  const phaseStartRef = useRef(Date.now());
  const runningRef = useRef(false);

  const [status, setStatus] = useState('loading'); // loading | liveness | scanning | found | notfound
  const [livenessMsg, setLivenessMsg] = useState('Pisque os olhos para verificar que é você');
  const [modelsReady, setModelsReady] = useState(false);
  const [faceBox, setFaceBox] = useState(null);

  const { facialDescriptors, config } = useAppStore();

  const minConfidence = parseFloat(config.reconhecimento_facial_min_confianca || '60') / 100;
  const autoConfidence = parseFloat(config.reconhecimento_facial_auto_confianca || '85') / 100;

  // Intervalo entre detecções (ms). 300ms = ~3 FPS, suficiente e não trava.
  const DETECTION_INTERVAL = 300;
  // Timeout total da fase de scanning (ms)
  const SCANNING_TIMEOUT_MS = 15000;
  // Timeout da fase de liveness (ms)
  const LIVENESS_TIMEOUT_MS = 6000;
  // Piscadas necessárias (1 já é suficiente para anti-spoof básico)
  const REQUIRED_BLINKS = 1;

  // ==========================================
  // INICIALIZAR CÂMERA
  // ==========================================
  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        // Carregar modelos face-api.js
        await loadModels();
        if (!mounted) return;
        setModelsReady(true);

        // Abrir câmera (preferir câmera frontal do tablet)
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: 'user',
            width: { ideal: 640 },
            height: { ideal: 480 },
            frameRate: { ideal: 30 },
          },
          audio: false,
        });

        if (!mounted) { stream.getTracks().forEach(t => t.stop()); return; }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
          setStatus('liveness');
          startTimeRef.current = Date.now();
        }
      } catch (err) {
        console.error('Erro câmera/modelos:', err);
        if (mounted) {
          if (err.name === 'NotAllowedError') {
            onError?.('Permissão de câmera negada. Use o PIN.');
          } else {
            onError?.('Câmera não disponível. Use o PIN.');
          }
        }
      }
    }

    init();

    return () => {
      mounted = false;
      stopScanning();
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  // ==========================================
  // LOOP DE DETECÇÃO (throttled)
  // ==========================================
  useEffect(() => {
    if (status === 'liveness' || status === 'scanning') {
      phaseStartRef.current = Date.now();
      startDetectionLoop();
    }
    return () => stopScanning();
  }, [status, facialDescriptors]);

  function stopScanning() {
    runningRef.current = false;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  const startDetectionLoop = useCallback(() => {
    stopScanning();
    runningRef.current = true;

    async function tick() {
      if (!runningRef.current) return;

      // Aguardar vídeo pronto
      if (!videoRef.current || videoRef.current.readyState < 2) {
        timerRef.current = setTimeout(tick, 100);
        return;
      }

      const tStart = performance.now();

      try {
        // Liveness usa versão LITE (sem descritor 128D) — ~3x mais rápida
        const result = status === 'liveness'
          ? await detectFaceLite(videoRef.current)
          : await detectFace(videoRef.current);

        if (result) {
          const { box, landmarks } = result;
          drawFaceBox(box);
          setFaceBox(box);

          // ---- FASE 1: LIVENESS CHECK ----
          if (status === 'liveness') {
            const isBlink = detectBlink(landmarks);

            if (isBlink && !blinkingRef.current) {
              blinkingRef.current = true;
              blinkCountRef.current += 1;
              setLivenessMsg(`Piscada detectada! (${blinkCountRef.current}/${REQUIRED_BLINKS})`);
            } else if (!isBlink) {
              blinkingRef.current = false;
            }

            const elapsed = Date.now() - phaseStartRef.current;
            if (blinkCountRef.current >= REQUIRED_BLINKS || elapsed > LIVENESS_TIMEOUT_MS) {
              setStatus('scanning');
              return;
            }
          }

          // ---- FASE 2: RECONHECIMENTO FACIAL ----
          if (status === 'scanning') {
            if (facialDescriptors.length === 0) {
              setStatus('notfound');
              setTimeout(() => onFail?.(), 1500);
              return;
            }

            const match = matchFace(result.descriptor, facialDescriptors, 0.6);

            if (match && match.confidence >= minConfidence) {
              setStatus('found');
              stopScanning();

              if (match.confidence >= autoConfidence) {
                onMatch?.(match.employee, match.confidence);
              } else {
                onLowConfidence?.(match.employee, match.confidence);
              }
              return;
            }

            const elapsed = Date.now() - phaseStartRef.current;
            if (elapsed > SCANNING_TIMEOUT_MS) {
              setStatus('notfound');
              stopScanning();
              setTimeout(() => onFail?.(), 1500);
              return;
            }
          }
        } else {
          setFaceBox(null);
          clearCanvas();
        }
      } catch (err) {
        console.error('Erro detecção:', err);
      }

      // Throttle: aguardar pelo menos DETECTION_INTERVAL entre detecções,
      // descontando o tempo que a inferência levou
      const elapsed = performance.now() - tStart;
      const wait = Math.max(0, DETECTION_INTERVAL - elapsed);
      if (runningRef.current) {
        timerRef.current = setTimeout(tick, wait);
      }
    }

    tick();
  }, [status, facialDescriptors, minConfidence, autoConfidence, onMatch, onLowConfidence, onFail]);

  // ==========================================
  // CANVAS — desenhar bounding box
  // ==========================================
  function drawFaceBox(box) {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const color = status === 'found' ? '#22c55e' : status === 'notfound' ? '#ef4444' : '#818cf8';
    const lineWidth = 3;

    // Cantos do retângulo (estilo scanner)
    const { x, y, width: w, height: h } = box;
    const cornerLen = Math.min(w, h) * 0.15;

    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;

    // Canto superior esquerdo
    ctx.beginPath(); ctx.moveTo(x, y + cornerLen); ctx.lineTo(x, y); ctx.lineTo(x + cornerLen, y); ctx.stroke();
    // Canto superior direito
    ctx.beginPath(); ctx.moveTo(x + w - cornerLen, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + cornerLen); ctx.stroke();
    // Canto inferior esquerdo
    ctx.beginPath(); ctx.moveTo(x, y + h - cornerLen); ctx.lineTo(x, y + h); ctx.lineTo(x + cornerLen, y + h); ctx.stroke();
    // Canto inferior direito
    ctx.beginPath(); ctx.moveTo(x + w - cornerLen, y + h); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w, y + h - cornerLen); ctx.stroke();
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
  }

  // ==========================================
  // RENDER
  // ==========================================
  const statusMessages = {
    loading: 'Iniciando câmera...',
    liveness: livenessMsg,
    scanning: 'Identificando funcionário...',
    found: 'Funcionário identificado!',
    notfound: 'Não reconhecido — redirecionando para PIN...',
  };

  const statusColors = {
    loading: 'text-gray-400',
    liveness: 'text-indigo-300',
    scanning: 'text-blue-300',
    found: 'text-green-400',
    notfound: 'text-red-400',
  };

  return (
    <div className="relative flex flex-col items-center gap-3">
      {/* Área da câmera — limitada para não empurrar conteúdo abaixo da tela */}
      <div className="relative w-full max-w-sm mx-auto rounded-3xl overflow-hidden shadow-2xl"
           style={{ aspectRatio: '4/3', background: '#0a0a1e', maxHeight: '45vh' }}>

        {/* Vídeo */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover"
          style={{ transform: 'scaleX(-1)' }} /* Espelho para parecer natural */
        />

        {/* Canvas overlay (bounding boxes) */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          style={{ transform: 'scaleX(-1)' }}
        />

        {/* Overlay de instruções (fase liveness) */}
        {status === 'liveness' && (
          <div className="absolute inset-0 pointer-events-none">
            {/* Guia oval do rosto */}
            <div className="face-overlay border-4 border-indigo-400/60 border-dashed"
                 style={{ boxShadow: '0 0 30px rgba(79, 70, 229, 0.3) inset' }} />
            {/* Linha de scan animada */}
            <div className="absolute inset-0 overflow-hidden face-overlay">
              <div className="scan-line" />
            </div>
          </div>
        )}

        {/* Estado: câmera carregando */}
        {status === 'loading' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-dark-900/80">
            <Camera className="w-16 h-16 text-indigo-400 animate-pulse" />
            <p className="text-white/70 mt-3">Iniciando câmera...</p>
          </div>
        )}

        {/* Estado: encontrado */}
        {status === 'found' && (
          <div className="absolute inset-0 flex items-center justify-center bg-green-900/30">
            <div className="success-icon text-center">
              <div className="w-24 h-24 rounded-full bg-green-500/20 border-4 border-green-400 flex items-center justify-center mx-auto">
                <svg className="w-12 h-12 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>
          </div>
        )}

        {/* Estado: não reconhecido */}
        {status === 'notfound' && (
          <div className="absolute inset-0 flex items-center justify-center bg-red-900/30">
            <div className="text-center">
              <AlertCircle className="w-20 h-20 text-red-400 mx-auto" />
              <p className="text-red-300 mt-2 font-medium">Redirecionar para PIN</p>
            </div>
          </div>
        )}

        {/* Badge "AO VIVO" */}
        {(status === 'liveness' || status === 'scanning') && (
          <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-black/50 rounded-full px-3 py-1">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-white text-xs font-medium">AO VIVO</span>
          </div>
        )}
      </div>

      {/* Mensagem de status */}
      <div className="flex items-center gap-2 text-center">
        {status === 'scanning' && (
          <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
        )}
        <p className={`text-lg font-medium ${statusColors[status]}`}>
          {statusMessages[status]}
        </p>
      </div>

      {/* Instrução de piscada (fase liveness) */}
      {status === 'liveness' && (
        <div className="flex gap-2">
          {Array.from({ length: REQUIRED_BLINKS }, (_, i) => i + 1).map(i => (
            <div key={i} className={`w-10 h-10 rounded-full border-2 flex items-center justify-center text-sm font-bold transition-all
              ${blinkCountRef.current >= i ? 'bg-green-500 border-green-400 text-white' : 'border-white/30 text-white/40'}`}>
              {i}
            </div>
          ))}
        </div>
      )}

      {/* Botão fallback PIN */}
      <button
        onClick={() => { stopScanning(); onFail?.(); }}
        className="text-white/50 hover:text-white/80 text-sm underline transition-colors mt-2"
      >
        Usar PIN em vez de rosto
      </button>
    </div>
  );
}
