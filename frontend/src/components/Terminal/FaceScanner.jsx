import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Camera, AlertCircle, CheckCircle, Scan } from 'lucide-react';
import { loadModels, detectFace } from '../../services/faceRecognition';
import { timeRecordAPI } from '../../services/api';
import { useAppStore } from '../../stores/appStore';

/**
 * FaceScanner — terminal de reconhecimento facial profissional.
 *
 * Arquitetura:
 *  - Browser: detecção do rosto + extração do descritor 128D (face-api.js)
 *  - Servidor: matching contra templates do banco (LGPD: templates nunca saem do servidor)
 *
 * Sem verificação de piscada — desnecessária em terminal presencial.
 * Faz até MAX_ATTEMPTS leituras e usa o melhor resultado.
 */

const MAX_ATTEMPTS = 5;     // Leituras antes de desistir
const DETECT_INTERVAL = 350; // ms entre detecções (≈3 FPS)

export default function FaceScanner({ onMatch, onLowConfidence, onFail, onError }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const timerRef = useRef(null);
  const streamRef = useRef(null);
  const runningRef = useRef(false);
  const attemptsRef = useRef(0);
  const bestMatchRef = useRef(null);
  const apiCallRef = useRef(false); // evita chamadas simultâneas

  const [status, setStatus] = useState('loading'); // loading | scanning | found | notfound
  const [attempt, setAttempt] = useState(0);
  const [bestScore, setBestScore] = useState(0);
  const [foundName, setFoundName] = useState('');
  const [faceVisible, setFaceVisible] = useState(false);

  const { config } = useAppStore();
  const minConfidence = parseFloat(config.reconhecimento_facial_min_confianca || '60') / 100;
  const autoConfidence = parseFloat(config.reconhecimento_facial_auto_confianca || '85') / 100;

  // ── CÂMERA + MODELOS ───────────────────────────────────────
  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        await loadModels();
        if (!mounted) return;

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });

        if (!mounted) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setStatus('scanning');
      } catch (err) {
        if (!mounted) return;
        onError?.(
          err.name === 'NotAllowedError'
            ? 'Câmera bloqueada. Use o PIN.'
            : 'Câmera indisponível. Use o PIN.'
        );
      }
    }

    init();
    return () => {
      mounted = false;
      stopLoop();
      streamRef.current?.getTracks().forEach(t => t.stop());
    };
  }, []);

  // ── LOOP ───────────────────────────────────────────────────
  useEffect(() => {
    if (status === 'scanning') {
      attemptsRef.current = 0;
      bestMatchRef.current = null;
      apiCallRef.current = false;
      startLoop();
    }
    return () => stopLoop();
  }, [status]);

  function stopLoop() {
    runningRef.current = false;
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  }

  const startLoop = useCallback(() => {
    stopLoop();
    runningRef.current = true;

    async function tick() {
      if (!runningRef.current) return;

      if (!videoRef.current || videoRef.current.readyState < 2) {
        timerRef.current = setTimeout(tick, 100);
        return;
      }

      const t0 = performance.now();

      try {
        const detected = await detectFace(videoRef.current);

        if (detected) {
          setFaceVisible(true);
          drawBox(detected.box);

          // Não empilhar chamadas à API
          if (!apiCallRef.current && attemptsRef.current < MAX_ATTEMPTS) {
            apiCallRef.current = true;
            const currentAttempt = attemptsRef.current + 1;
            attemptsRef.current = currentAttempt;
            setAttempt(currentAttempt);

            try {
              const { data } = await timeRecordAPI.recognizeFace(Array.from(detected.descriptor));
              const match = data.match;

              if (match && match.confidence > (bestMatchRef.current?.confidence ?? 0)) {
                bestMatchRef.current = match;
                setBestScore(match.confidencePercent);
              }

              // Resultado bom → confirmar imediatamente
              if (bestMatchRef.current && bestMatchRef.current.confidence >= minConfidence) {
                stopLoop();
                setFoundName(bestMatchRef.current.nome);
                setStatus('found');
                const m = bestMatchRef.current;
                setTimeout(() => {
                  if (m.confidence >= autoConfidence) {
                    onMatch?.(m, m.confidence);
                  } else {
                    onLowConfidence?.(m, m.confidence);
                  }
                }, 900);
                return;
              }
            } catch {
              // API timeout ou erro de rede — continua tentando
            } finally {
              apiCallRef.current = false;
            }

            // Tentativas esgotadas
            if (attemptsRef.current >= MAX_ATTEMPTS) {
              stopLoop();
              const m = bestMatchRef.current;
              // Match parcial (≥ 40%) → tela de confirmação
              if (m && m.confidence >= 0.4) {
                setFoundName(m.nome);
                setStatus('found');
                setTimeout(() => onLowConfidence?.(m, m.confidence), 900);
              } else {
                setStatus('notfound');
                setTimeout(() => onFail?.(), 1500);
              }
              return;
            }
          }
        } else {
          setFaceVisible(false);
          clearCanvas();
        }
      } catch {
        // Erro de detecção — continua
      }

      const elapsed = performance.now() - t0;
      if (runningRef.current) {
        timerRef.current = setTimeout(tick, Math.max(50, DETECT_INTERVAL - elapsed));
      }
    }

    tick();
  }, [minConfidence, autoConfidence, onMatch, onLowConfidence, onFail]);

  // ── CANVAS ─────────────────────────────────────────────────
  function drawBox(box) {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video || !box) return;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const { x, y, width: w, height: h } = box;
    const corner = Math.min(w, h) * 0.2;

    const isFound = status === 'found';
    const color = isFound ? '#22c55e' : '#6366f1';

    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;

    [
      [[x, y + corner], [x, y], [x + corner, y]],
      [[x + w - corner, y], [x + w, y], [x + w, y + corner]],
      [[x, y + h - corner], [x, y + h], [x + corner, y + h]],
      [[x + w - corner, y + h], [x + w, y + h], [x + w, y + h - corner]],
    ].forEach(pts => {
      ctx.beginPath();
      ctx.moveTo(...pts[0]);
      ctx.lineTo(...pts[1]);
      ctx.lineTo(...pts[2]);
      ctx.stroke();
    });
  }

  function clearCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
  }

  // ── RENDER ─────────────────────────────────────────────────
  const progress = Math.round((attempt / MAX_ATTEMPTS) * 100);

  return (
    <div className="flex flex-col items-center gap-3 w-full">

      {/* ── CÂMERA ── */}
      <div className="relative w-full max-w-sm mx-auto rounded-2xl overflow-hidden bg-black shadow-2xl"
           style={{ aspectRatio: '4/3', maxHeight: '44vh' }}>

        <video ref={videoRef} autoPlay playsInline muted
               className="w-full h-full object-cover"
               style={{ transform: 'scaleX(-1)' }} />

        <canvas ref={canvasRef}
                className="absolute inset-0 w-full h-full pointer-events-none"
                style={{ transform: 'scaleX(-1)' }} />

        {/* Loading */}
        {status === 'loading' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 gap-3">
            <Camera className="w-12 h-12 text-indigo-400 animate-pulse" />
            <p className="text-white/50 text-sm">Iniciando câmera...</p>
          </div>
        )}

        {/* Linha de scan animada (quando rosto detectado) */}
        {status === 'scanning' && faceVisible && attempt > 0 && (
          <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-2xl">
            <div className="scan-line-active" />
          </div>
        )}

        {/* Identificado */}
        {status === 'found' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-green-950/60 gap-2">
            <CheckCircle className="w-16 h-16 text-green-400 drop-shadow-lg" />
            <p className="text-green-300 font-semibold text-sm">{foundName}</p>
          </div>
        )}

        {/* Não reconhecido */}
        {status === 'notfound' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-950/60 gap-2">
            <AlertCircle className="w-14 h-14 text-red-400" />
            <p className="text-red-300 text-sm">Não reconhecido</p>
          </div>
        )}

        {/* Badge AO VIVO */}
        {status === 'scanning' && (
          <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm rounded-full px-2.5 py-1">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-white text-xs font-medium">AO VIVO</span>
          </div>
        )}

        {/* Barra de progresso (tentativas) */}
        {status === 'scanning' && attempt > 0 && (
          <div className="absolute bottom-0 inset-x-0 h-0.5 bg-white/10">
            <div className="h-full bg-indigo-500 transition-all duration-500 ease-out"
                 style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>

      {/* ── STATUS ── */}
      <div className="text-center min-h-[40px] flex flex-col items-center justify-center">
        {status === 'loading' && (
          <p className="text-white/40 text-sm">Carregando modelos...</p>
        )}
        {status === 'scanning' && !faceVisible && (
          <p className="text-indigo-300 font-medium">Aproxime seu rosto da câmera</p>
        )}
        {status === 'scanning' && faceVisible && attempt === 0 && (
          <div className="flex items-center gap-2 text-blue-300">
            <Scan className="w-4 h-4 animate-pulse" />
            <span className="font-medium">Analisando rosto...</span>
          </div>
        )}
        {status === 'scanning' && faceVisible && attempt > 0 && (
          <div className="flex flex-col items-center gap-0.5">
            <div className="flex items-center gap-2 text-blue-300">
              <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
              <span className="font-medium text-sm">Identificando... ({attempt}/{MAX_ATTEMPTS})</span>
            </div>
            {bestScore > 0 && (
              <p className="text-white/30 text-xs">Melhor resultado: {bestScore}%</p>
            )}
          </div>
        )}
        {status === 'found' && (
          <p className="text-green-400 font-bold">Identificado com sucesso!</p>
        )}
        {status === 'notfound' && (
          <p className="text-red-400 font-medium">Rosto não reconhecido — redirecionando para PIN...</p>
        )}
      </div>

      <button
        onClick={() => { stopLoop(); onFail?.(); }}
        className="text-white/30 hover:text-white/60 text-sm underline transition-colors"
      >
        Usar PIN em vez de rosto
      </button>

      <style>{`
        .scan-line-active {
          position: absolute;
          left: 0; right: 0;
          height: 2px;
          background: linear-gradient(90deg, transparent 0%, #6366f1 40%, #818cf8 50%, #6366f1 60%, transparent 100%);
          box-shadow: 0 0 8px #6366f1;
          animation: scanDown 1.8s ease-in-out infinite;
        }
        @keyframes scanDown {
          0%   { top: 5%; opacity: 0; }
          10%  { opacity: 1; }
          90%  { opacity: 1; }
          100% { top: 95%; opacity: 0; }
        }
      `}</style>
    </div>
  );
}
