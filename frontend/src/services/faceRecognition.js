/**
 * Serviço de reconhecimento facial com face-api.js.
 * 100% offline — roda no browser via TensorFlow.js.
 *
 * Modelos necessários em /public/models/:
 *  - tiny_face_detector
 *  - face_landmark_68
 *  - face_recognition
 *  - face_expression
 */
import * as faceapi from 'face-api.js';

const MODELS_PATH = '/models';

let modelsLoaded = false;
let loadingPromise = null;

/**
 * Carrega os modelos da face-api.js (lazy, uma vez)
 */
export async function loadModels() {
  if (modelsLoaded) return;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    console.log('Carregando modelos de reconhecimento facial...');
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODELS_PATH),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODELS_PATH),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODELS_PATH),
      faceapi.nets.faceExpressionNet.loadFromUri(MODELS_PATH),
    ]);
    modelsLoaded = true;
    console.log('Modelos carregados com sucesso');
  })();

  return loadingPromise;
}

/**
 * Detecta rosto no elemento de vídeo/imagem e retorna o descritor.
 * @param {HTMLVideoElement|HTMLImageElement} input
 * @returns {{ descriptor: Float32Array, detection: object } | null}
 */
export async function detectFace(input) {
  await loadModels();

  const options = new faceapi.TinyFaceDetectorOptions({
    inputSize: 416,
    scoreThreshold: 0.5,
  });

  const result = await faceapi
    .detectSingleFace(input, options)
    .withFaceLandmarks()
    .withFaceDescriptor()
    .withFaceExpressions();

  if (!result) return null;

  return {
    descriptor: result.descriptor,
    detection: result.detection,
    landmarks: result.landmarks,
    expressions: result.expressions,
    box: result.detection.box,
  };
}

/**
 * Compara um descritor com uma lista de descritores cadastrados.
 * @param {Float32Array} queryDescriptor - Descritor da pessoa a identificar
 * @param {Array<{id, nome, descriptor}>} registeredDescriptors
 * @param {number} threshold - Distância máxima para match (0.5 padrão)
 * @returns {{ employee: object, distance: number, confidence: number } | null}
 */
export function matchFace(queryDescriptor, registeredDescriptors, threshold = 0.5) {
  if (!registeredDescriptors || registeredDescriptors.length === 0) return null;

  let bestMatch = null;
  let bestDistance = Infinity;

  for (const { id, nome, descriptor } of registeredDescriptors) {
    // Converter array para Float32Array se necessário
    const d = descriptor instanceof Float32Array ? descriptor : new Float32Array(descriptor);
    const distance = faceapi.euclideanDistance(queryDescriptor, d);

    if (distance < bestDistance) {
      bestDistance = distance;
      bestMatch = { id, nome };
    }
  }

  if (bestDistance > threshold) return null;

  // Converter distância em confiança (0-1)
  // distância 0 = 100%, distância threshold = 0%
  const confidence = Math.max(0, 1 - (bestDistance / threshold));

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
 * Detecta piscada de olhos analisando a abertura dos olhos.
 * Usa a proporção Eye Aspect Ratio (EAR).
 */
export function detectBlink(landmarks) {
  if (!landmarks) return false;
  const positions = landmarks.positions;

  // Olho esquerdo: pontos 36-41, Olho direito: pontos 42-47
  const leftEyeEAR = eyeAspectRatio(positions.slice(36, 42));
  const rightEyeEAR = eyeAspectRatio(positions.slice(42, 48));
  const avgEAR = (leftEyeEAR + rightEyeEAR) / 2;

  return avgEAR < 0.2; // Olho fechado
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
 * Challenge de Liveness: verifica movimento de cabeça.
 * Retorna ângulo de rotação horizontal.
 */
export function detectHeadPose(landmarks) {
  if (!landmarks) return 0;
  const positions = landmarks.positions;

  // Usar ponta do nariz (30) e pontos da mandíbula para calcular rotação
  const noseTip = positions[30];
  const chinLeft = positions[3];
  const chinRight = positions[13];

  if (!noseTip || !chinLeft || !chinRight) return 0;

  const faceCenter = { x: (chinLeft.x + chinRight.x) / 2, y: (chinLeft.y + chinRight.y) / 2 };
  const angle = Math.atan2(noseTip.x - faceCenter.x, noseTip.y - faceCenter.y) * (180 / Math.PI);
  return angle;
}

/**
 * Extrai múltiplos descritores de um vídeo (para cadastro).
 * Captura N frames em intervalos para variar ângulos.
 */
export async function captureMultipleDescriptors(videoElement, count = 5, onProgress) {
  const descriptors = [];
  const interval = 800; // ms entre capturas

  for (let i = 0; i < count; i++) {
    if (onProgress) onProgress(i, count);

    // Aguardar intervalo para capturar frames diferentes
    await new Promise(r => setTimeout(r, interval));

    const result = await detectFace(videoElement);
    if (result) {
      descriptors.push(result.descriptor);
    }
  }

  if (descriptors.length === 0) {
    throw new Error('Nenhum rosto detectado nas capturas');
  }

  // Calcular descritor médio (mais estável)
  const avgDescriptor = averageDescriptors(descriptors);
  return { descriptor: avgDescriptor, samplesCount: descriptors.length };
}

/**
 * Calcula a média de múltiplos descritores (vetor 128D)
 */
function averageDescriptors(descriptors) {
  const size = 128;
  const avg = new Float32Array(size);

  for (const d of descriptors) {
    for (let i = 0; i < size; i++) {
      avg[i] += d[i];
    }
  }

  for (let i = 0; i < size; i++) {
    avg[i] /= descriptors.length;
  }

  return avg;
}

export { modelsLoaded };
