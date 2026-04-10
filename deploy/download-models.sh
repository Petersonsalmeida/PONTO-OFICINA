#!/bin/bash
# Baixa os modelos da face-api.js para /public/models
# Execute este script dentro do diretório frontend/

MODELS_DIR="public/models"
BASE_URL="https://github.com/justadudewhohacks/face-api.js/raw/master/weights"

mkdir -p "$MODELS_DIR"

echo "📦 Baixando modelos face-api.js..."

FILES=(
  "tiny_face_detector_model-weights_manifest.json"
  "tiny_face_detector_model-shard1"
  "face_landmark_68_model-weights_manifest.json"
  "face_landmark_68_model-shard1"
  "face_recognition_model-weights_manifest.json"
  "face_recognition_model-shard1"
  "face_recognition_model-shard2"
  "face_expression_model-weights_manifest.json"
  "face_expression_model-shard1"
)

for FILE in "${FILES[@]}"; do
  echo "  Baixando: $FILE"
  curl -sSL "$BASE_URL/$FILE" -o "$MODELS_DIR/$FILE"
done

echo "✅ Modelos baixados em $MODELS_DIR/"
echo "   Total: $(du -sh $MODELS_DIR | cut -f1)"
