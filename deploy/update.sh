#!/bin/bash
# =============================================================
# Atualização do sistema de ponto (sem reinstalar do zero)
# Uso: bash deploy/update.sh
# =============================================================

set -e

APP_DIR="/var/www/ponto-oficina"

echo "🔄 Atualizando sistema de ponto..."

cd "$APP_DIR"

# Baixar última versão
git pull origin main

# Atualizar dependências (caso package.json tenha mudado)
cd "$APP_DIR/backend"  && npm install --omit=dev
cd "$APP_DIR/frontend" && npm install

# Rodar migrations (seguro executar múltiplas vezes — usa IF NOT EXISTS)
cd "$APP_DIR/backend" && node database/migrate.js

# Rebuild do frontend
cd "$APP_DIR/frontend" && npm run build

# Reiniciar backend
pm2 reload ponto-backend --update-env

echo "✅ Sistema atualizado com sucesso!"
echo "   https://ponto.centroautomotivoalianca.com.br"
