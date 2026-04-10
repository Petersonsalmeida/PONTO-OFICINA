#!/bin/bash
# Script de deploy no VPS (187.77.248.208)
# Executa como root ou com sudo

set -e

echo "🚀 Configurando sistema de ponto eletrônico..."

# ---- Node.js ----
if ! command -v node &>/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
echo "✅ Node.js $(node -v)"

# ---- PM2 (process manager) ----
if ! command -v pm2 &>/dev/null; then
  npm install -g pm2
fi

# ---- Nginx ----
if ! command -v nginx &>/dev/null; then
  sudo apt-get install -y nginx
fi

# ---- Diretórios ----
sudo mkdir -p /var/www/ponto-oficina
sudo chown -R $USER:$USER /var/www/ponto-oficina

# ---- Copiar projeto ----
cp -r . /var/www/ponto-oficina/
cd /var/www/ponto-oficina

# ---- Instalar dependências ----
npm run install:all

# ---- Migrations e seed ----
npm run migrate
npm run seed

# ---- Build do frontend ----
npm run build

# ---- Nginx config ----
sudo tee /etc/nginx/sites-available/ponto-oficina <<'EOF'
server {
    listen 80;
    server_name 187.77.248.208;

    # Frontend (PWA)
    root /var/www/ponto-oficina/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # API Backend
    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }

    # Service Worker (não cachear)
    location /sw.js {
        add_header Cache-Control "no-cache";
    }

    # Modelos face-api (cache longo)
    location /models {
        add_header Cache-Control "public, max-age=2592000";
    }

    # Uploads
    location /uploads {
        proxy_pass http://localhost:3001/uploads;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/ponto-oficina /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# ---- PM2 para o backend ----
cd /var/www/ponto-oficina/backend
pm2 start src/app.js --name "ponto-backend" --time \
  --env production \
  -- \
  NODE_ENV=production

pm2 save
pm2 startup

echo ""
echo "✅ Sistema implantado com sucesso!"
echo "   Frontend: http://187.77.248.208/"
echo "   API:      http://187.77.248.208/api/"
echo ""
echo "⚠️  IMPORTANTE:"
echo "   1. Edite /var/www/ponto-oficina/backend/.env com suas credenciais reais"
echo "   2. Faça o download dos modelos face-api.js e coloque em frontend/dist/models/"
echo "   3. Altere o PIN do admin (000.000.000-00 / PIN: 1234) no primeiro acesso"
echo ""
