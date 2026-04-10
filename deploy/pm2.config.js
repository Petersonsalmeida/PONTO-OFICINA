module.exports = {
  apps: [{
    name: 'ponto-backend',
    script: './backend/src/app.js',
    cwd: '/var/www/ponto-oficina',
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '512M',
    env: { NODE_ENV: 'development' },
    env_production: { NODE_ENV: 'production' },
    log_date_format: 'DD/MM/YYYY HH:mm:ss',
    out_file: './backend/logs/pm2-out.log',
    error_file: './backend/logs/pm2-error.log',
  }],
};
