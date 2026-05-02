/**
 * Serviço de reconhecimento facial com face-api.js.
 * 100% offline — roda no browser via TensorFlow.js.
 *
 * Modelos necessários em /public/models/:
 *  - tiny_face_detector
 *  - face_landmark_68
 *  - face_recognition
 */
import * as faceapi from 'face-api.js';

const MODELS_PATH = '/models';

let modelsLoaded = false;
let loadingPromise = null;

const detectorOptions = new faceapi.TinyFaceDetectorOptions({
  inputSize: 320,
  scoreThreshold: 0.5,
});

/**
 * Carrega os modelos da face-api.js (lazy, uma vez).
 * Modelo de expressões removido — não é necessário para o fluxo de ponto.
 */
export async function loadModels() {
  if (modelsLoaded) return;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    console.log('[face] Carregando modelos...');
    const t0 = performance.now();
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODELS_PATH),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODELS_PATH),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODELS_PATH),
    ]);
    modelsLoaded = true;
    console.log(`[face] Modelos carregados em ${Math.round(performance.now() - t0)}ms`);
  })();

  return loadingPromise;
}

/**
 * Detecção LITE — só detector + landmarks. Usada na fase de liveness
 * (detecção de piscada). É bem mais rápida que a versão completa.
 */
export async function detectFaceLite(input) {
  await loadModels();
  const result = await faceapi
    .detectSingleFace(input, detectorOptions)
    .withFaceLandmarks();
  if (!result) return null;
  return {
    landmarks: result.landmarks,
    box: result.detection.box,
    detection: result.detection,
  };
}

/**
 * Detecção FULL — detector + landmarks + descritor 128D.
 * Usada na fase de reconhecimento (mais pesada).
 */
export async function detectFace(input) {
  await loadModels();
  const result = await faceapi
    .detectSingleFace(input, detectorOptions)
    .withFaceLandmarks()
    .withFaceDescriptor();
  if (!result) return null;
  return {
    descriptor: result.descriptor,
    detection: result.detection,
    landmarks: result.landmarks,
    box: result.detection.box,
  };
}

/**
 * Compara um descritor com a lista de funcionários cadastrados.
 *
 * Cada funcionário pode ter:
 *  - 1 descritor (formato legado): Float32Array ou array 1D de 128 floats
 *  - N descritores (novo formato): array de arrays — pega o melhor match
 *
 * @param {Float32Array} queryDescriptor
 * @param {Array<{id, nome, descriptor: Array}>} registered
 * @param {number} threshold - distância máxima (face-api.js padrão: 0.6)
 */
export function matchFace(queryDescriptor, registered, threshold = 0.6) {
  if (!registered || registered.length === 0) return null;

  let bestMatch = null;
  let bestDistance = Infinity;

  for (const item of registered) {
    const { id, nome, descriptor } = item;
    if (!descriptor || !descriptor.length) continue;

    // Detecta se é multi-descritor (array de arrays) ou descritor único
    const isMulti = Array.isArray(descriptor[0]) || ArrayBuffer.isView(descriptor[0]);
    const variants = isMulti ? descriptor : [descriptor];

    for (const variant of variants) {
      const d = variant instanceof Float32Array ? variant : new Float32Array(variant);
      const distance = faceapi.euclideanDistance(queryDescriptor, d);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestMatch = { id, nome };
      }
    }
  }

  if (bestDistance > threshold) return null;

  // Escala natural alinhada com face-api.js:
  //   distance 0.0 → 100%   (rosto idêntico)
  //   distance 0.3 → 70%    (match excelente)
  //   distance 0.4 → 60%    (match bom)
  //   distance 0.5 → 50%    (match razoável)
  //   distance 0.6 → 40%    (limite)
  const confidence = Math.max(0, 1 - bestDistance);

  return {
    employee: bestMatch,
    distance: bestDistance,
    confidence,
    confidencePercent: Math.round(confidence * 100),
  };
}

// ==========================================
// LIVENESS DETECTION (Anti-spoofing)
// ==========================================

/**
 * Detecta piscada de olhos pela proporção EAR (Eye Aspect Ratio).
 */
export function detectBlink(landmarks) {
  if (!landmarks) return false;
  const positions = landmarks.positions;
  const leftEyeEAR = eyeAspectRatio(positions.slice(36, 42));
  const rightEyeEAR = eyeAspectRatio(positions.slice(42, 48));
  const avgEAR = (leftEyeEAR + rightEyeEAR) / 2;
  return avgEAR < 0.2;
}

function eyeAspectRatio(eyePoints) {
  if (!eyePoints || eyePoints.length < 6) return 0.3;
  const A = dist(eyePoints[1], eyePoints[5]);
  const B = dist(eyePoints[2], eyePoints[4]);
  const C = dist(eyePoints[0], eyePoints[3]);
  return (A + B) / (2.0 * C);
}

function dist(p1, p2) {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
}

/**
 * Extrai múltiplos descritores de um vídeo (para cadastro).
 * Salva a LISTA de descritores em vez da média — descritores faciais
 * 128D não são linearmente combináveis e a média degrada o reconhecimento.
 */
export async function captureMultipleDescriptors(videoElement, count = 7, onProgress) {
  const descriptors = [];
  const interval = 700;

  for (let i = 0; i < count; i++) {
    if (onProgress) onProgress(i, count);
    await new Promise(r => setTimeout(r, interval));
    const result = await detectFace(videoElement);
    if (result) descriptors.push(Array.from(result.descriptor));
  }

  if (descriptors.length < 3) {
    throw new Error(
      `Apenas ${descriptors.length} captura(s) válida(s). ` +
      `Verifique iluminação e posicionamento do rosto.`
    );
  }

  return { descriptors, samplesCount: descriptors.length };
}

export { modelsLoaded };
