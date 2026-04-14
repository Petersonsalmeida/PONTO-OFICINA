#!/bin/bash
# =============================================================
# Deploy — Ponto Eletrônico - Centro Automotivo Aliança
# Subdomínio: ponto.centroautomotivoalianca.com.br
# Servidor:   187.77.248.208
#
# Uso: bash deploy/setup-vps.sh
# Requisito: Ubuntu 20.04+ com acesso root/sudo
# =============================================================

set -e

DOMAIN="ponto.centroautoalianca.com.br"
APP_DIR="/var/www/ponto-oficina"
EMAIL="ti@centroautoalianca.com.br"  # usado pelo Certbot para alertas SSL

echo "🚀 Iniciando deploy em $DOMAIN ..."

# ---- Dependências do sistema ----
sudo apt-get update -qq
sudo apt-get install -y git curl nginx certbot python3-certbot-nginx

# ---- Node.js 20 LTS ----
if ! command -v node &>/dev/null || [[ $(node -v | cut -d. -f1 | tr -d 'v') -lt 20 ]]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
echo "✅ Node.js $(node -v)"

# ---- PM2 (process manager) ----
if ! command -v pm2 &>/dev/null; then
  sudo npm install -g pm2
fi
echo "✅ PM2 $(pm2 -v)"

# ---- Diretórios ----
sudo mkdir -p "$APP_DIR"
sudo chown -R "$USER":"$USER" "$APP_DIR"

# ---- Clonar / atualizar repositório ----
if [ -d "$APP_DIR/.git" ]; then
  echo "🔄 Atualizando repositório..."
  cd "$APP_DIR"
  # Detecta a branch padrão automaticamente
  DEFAULT_BRANCH=$(git remote show origin | grep 'HEAD branch' | awk '{print $NF}')
  git pull origin "$DEFAULT_BRANCH"
else
  echo "📦 Clonando repositório..."
  git clone https://github.com/petersonsalmeida/ponto-oficina.git "$APP_DIR"
  cd "$APP_DIR"
fi

# ---- Instalar dependências ----
echo "📦 Instalando dependências do backend..."
cd "$APP_DIR/backend" && npm install --omit=dev

echo "📦 Instalando dependências do frontend..."
cd "$APP_DIR/frontend" && npm install

# ---- Configurar .env do backend (se ainda não existir) ----
if [ ! -f "$APP_DIR/backend/.env" ]; then
  cp "$APP_DIR/backend/.env.example" "$APP_DIR/backend/.env"
  echo ""
  echo "⚠️  ATENÇÃO: Arquivo .env criado a partir do exemplo."
  echo "   Edite $APP_DIR/backend/.env antes de continuar!"
  echo "   Pressione ENTER depois de editar o .env..."
  read -r
fi

# ---- Migrations e seed ----
cd "$APP_DIR/backend"
node database/migrate.js
node database/seed.js

# ---- Build do frontend ----
echo "🔨 Gerando build de produção do frontend..."
cd "$APP_DIR/frontend"
VITE_API_URL="https://$DOMAIN" npm run build

# ---- Nginx: config HTTP (necessário para o Certbot emitir o SSL) ----
sudo tee /etc/nginx/sites-available/ponto-oficina > /dev/null <<EOF
server {
    listen 80;
    server_name $DOMAIN;

    # Necessário para validação do Certbot (Let's Encrypt)
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    # Redireciona tudo para HTTPS (após SSL estar ativo)
    location / {
        return 301 https://\$host\$request_uri;
    }
}

server {
    listen 443 ssl;
    server_name $DOMAIN;

    # Certificados SSL (gerados pelo Certbot)
    ssl_certificate     /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    include             /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam         /etc/letsencrypt/ssl-dhparams.pem;

    # Segurança
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options SAMEORIGIN;
    add_header X-Content-Type-Options nosniff;

    # Frontend (PWA estático)
    root $APP_DIR/frontend/dist;
    index index.html;

    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # API Backend (proxy para Node.js)
    location /api/ {
        proxy_pass         http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host \$host;
        proxy_set_header   X-Real-IP \$remote_addr;
        proxy_set_header   X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        client_max_body_size 10m;
    }

    # Uploads (fotos, etc.)
    location /uploads/ {
        proxy_pass http://127.0.0.1:3001/uploads/;
    }

    # Service Worker — nunca cachear
    location = /sw.js {
        add_header Cache-Control "no-cache, no-store, must-revalidate";
    }

    # Modelos face-api — cache de 30 dias
    location /models/ {
        add_header Cache-Control "public, max-age=2592000, immutable";
        gzip_static on;
    }

    # Assets JS/CSS com hash — cache de 1 ano
    location ~* \.(js|css|woff2)$ {
        add_header Cache-Control "public, max-age=31536000, immutable";
    }
}
EOF

sudo mkdir -p /var/www/certbot
sudo ln -sf /etc/nginx/sites-available/ponto-oficina /etc/nginx/sites-enabled/ponto-oficina
sudo nginx -t && sudo systemctl reload nginx

# ---- SSL com Let's Encrypt (Certbot) ----
echo ""
echo "🔒 Emitindo certificado SSL para $DOMAIN ..."
echo "   (O DNS $DOMAIN já deve estar apontando para este servidor: 187.77.248.208)"
echo ""
sudo certbot --nginx \
  -d "$DOMAIN" \
  --non-interactive \
  --agree-tos \
  --email "$EMAIL" \
  --redirect

# Renovação automática (cron)
(crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet && systemctl reload nginx") | sort -u | crontab -

sudo systemctl reload nginx
echo "✅ SSL ativo — $DOMAIN servindo HTTPS"

# ---- PM2: iniciar / reiniciar o backend ----
cd "$APP_DIR/backend"

if pm2 list | grep -q "ponto-backend"; then
  pm2 reload ponto-backend --update-env
else
  pm2 start src/app.js \
    --name "ponto-backend" \
    --time \
    --max-memory-restart 512M \
    --env production
fi

pm2 save
sudo env PATH="$PATH:/usr/bin" pm2 startup systemd -u "$USER" --hp "$HOME" | tail -1 | sudo bash

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║   ✅  SISTEMA IMPLANTADO COM SUCESSO!                    ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║                                                          ║"
echo "║  Terminal de ponto:  https://ponto.centroautoalianca.com.br/       ║"
echo "║  Painel admin:       https://ponto.centroautoalianca.com.br/admin ║"
echo "║  API:                https://ponto.centroautoalianca.com.br/api/  ║"
echo "║                                                          ║"
echo "╠══════════════════════════════════════════════════════════╣"
echo "║  PRIMEIRO ACESSO:                                        ║"
echo "║  CPF:  000.000.000-00   PIN: 1234                        ║"
echo "║  ⚠️  Troque o PIN imediatamente após entrar!             ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
