# Ponto Eletrônico — Centro Automotivo Aliança

Sistema completo de ponto eletrônico com reconhecimento facial, PWA e sincronização em nuvem.

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | React 18 + Vite + Tailwind CSS (PWA) |
| Backend | Node.js + Express |
| Banco local | SQLite (better-sqlite3) |
| Banco nuvem | Supabase (sync automático) |
| Reconhecimento facial | face-api.js + TensorFlow.js (offline) |
| WhatsApp | Evolution API (instância "oficina") |
| Automações | N8N |
| Deploy | VPS 187.77.248.208 + Nginx + PM2 |

---

## Início rápido (desenvolvimento)

### 1. Pré-requisitos
- Node.js >= 18
- npm >= 9

### 2. Instalar dependências
```bash
npm run install:all
```

### 3. Configurar variáveis de ambiente
```bash
cp backend/.env.example backend/.env
# Edite backend/.env com suas credenciais
```

### 4. Criar banco e dados iniciais
```bash
npm run migrate   # Cria tabelas + feriados
npm run seed      # Cria Super Admin (CPF: 000.000.000-00 / PIN: 1234)
```

### 5. Baixar modelos face-api.js
```bash
cd frontend
bash ../deploy/download-models.sh
```

### 6. Iniciar em desenvolvimento
```bash
npm run dev        # Backend (porta 3001) + Frontend (porta 5173) em paralelo
```

Acesse:
- **Terminal de Ponto**: http://localhost:5173/
- **Painel Admin**: http://localhost:5173/admin/login

---

## Credenciais padrão (primeiro acesso)

| Campo | Valor |
|---|---|
| CPF | `000.000.000-00` |
| PIN | `1234` |
| Perfil | Super Admin |

> ⚠️ **Altere o PIN imediatamente após o primeiro acesso!**

---

## Deploy no VPS

```bash
# Na máquina local:
scp -r . root@187.77.248.208:/tmp/ponto-oficina
ssh root@187.77.248.208 "cd /tmp/ponto-oficina && bash deploy/setup-vps.sh"
```

O script configura automaticamente: Nginx, PM2, banco de dados e build do frontend.

---

## Configurar Supabase (opcional — sync em nuvem)

1. Crie um projeto em [supabase.com](https://supabase.com)
2. Execute o SQL de criação das tabelas (mesmo schema do SQLite)
3. Preencha `SUPABASE_URL` e `SUPABASE_SERVICE_KEY` no `backend/.env`
4. O sistema sincroniza automaticamente a cada 30s

---

## Configurar WhatsApp (Evolution API)

1. Acesse http://187.77.248.208:8080
2. Escaneie o QR Code para conectar a instância "oficina"
3. Preencha `EVOLUTION_API_KEY` no `backend/.env`

---

## Arquitetura dos módulos

```
PONTO-OFICINA/
├── backend/
│   ├── src/
│   │   ├── routes/          # API REST
│   │   │   ├── auth.js          — Login, troca de PIN
│   │   │   ├── employees.js     — CRUD funcionários + template facial
│   │   │   ├── timeRecords.js   — Bater ponto, listar registros
│   │   │   ├── corrections.js   — Ajustes de ponto
│   │   │   ├── reports.js       — PDF, Excel, WhatsApp
│   │   │   ├── schedules.js     — Escalas de trabalho
│   │   │   └── config.js        — Configurações + feriados
│   │   ├── services/
│   │   │   ├── syncService.js   — Fila SQLite → Supabase
│   │   │   ├── whatsappService.js — Evolution API + alertas
│   │   │   ├── reportService.js — Geração PDF (jsPDF) e Excel
│   │   │   └── scheduleService.js — Cron jobs de alertas
│   │   ├── utils/
│   │   │   ├── worktime.js      — Cálculo de jornada, HE, HN
│   │   │   ├── auditLog.js      — Log imutável (Portaria 671/2021)
│   │   │   └── crypto.js        — AES-256 templates faciais (LGPD)
│   │   └── app.js
│   └── database/
│       ├── migrate.js       — Cria tabelas + feriados 2024-2026
│       └── seed.js          — Super Admin inicial
│
└── frontend/
    └── src/
        ├── pages/
        │   ├── Terminal.jsx     — Tela principal do tablet
        │   ├── Admin.jsx        — Painel administrativo
        │   └── AdminLogin.jsx   — Login do painel
        ├── components/
        │   ├── Terminal/
        │   │   ├── FaceScanner.jsx  — Câmera + face-api.js + liveness
        │   │   ├── PinInput.jsx     — Teclado PIN touch-friendly
        │   │   ├── ConfirmScreen.jsx — Confirmação identidade 60-85%
        │   │   └── SuccessScreen.jsx — Feedback pós-registro
        │   └── Admin/
        │       ├── Dashboard.jsx    — Presença em tempo real
        │       ├── EmployeeList.jsx — CRUD funcionários
        │       ├── EmployeeForm.jsx — Formulário funcionário
        │       ├── FaceCadastro.jsx — Cadastro template facial
        │       ├── TimeRecords.jsx  — Espelho de ponto + exportação
        │       ├── Corrections.jsx  — Ajustes pendentes
        │       ├── Schedules.jsx    — Calendário de escalas
        │       └── ConfigPanel.jsx  — Configurações + feriados
        └── services/
            ├── faceRecognition.js  — face-api.js wrapper + liveness
            └── api.js              — Axios + todos os endpoints
```

---

## Conformidade legal

- **Portaria MTE 671/2021**: Espelho de ponto com CNPJ, nome, CPF, cargo, registros diários, totais, assinatura e QR Code de autenticidade
- **CLT Art. 58-74**: Cálculo de HE 50%/100%, adicional noturno 22h-05h, DSR, tolerância de 5 minutos
- **LGPD**: Templates faciais criptografados com AES-256; dados biométricos nunca trafegam em texto claro
- **Auditoria imutável**: Toda alteração registrada em `audit_log` com timestamp, usuário e IP
- **Retenção**: Registros mantidos por 5 anos (configurável)

---

## Fluxo do reconhecimento facial

```
Câmera ativa → Liveness check (2 piscadas)
    ↓
Detectar rosto (face-api.js TinyFaceDetector)
    ↓
Comparar com descritores cadastrados (euclideanDistance)
    ↓
Confiança ≥ 85% → Registro automático
Confiança 60-85% → Tela de confirmação
Confiança < 60%  → Fallback para PIN
```

---

## Alertas via N8N + WhatsApp

| Trigger | Condição | Destinatário |
|---|---|---|
| Atraso | 15 min após horário previsto sem entrada | Funcionário + Gestor |
| Jornada aberta | Entrada há >10h sem saída | Funcionário + Gestor |
| HE não autorizada | Saída 30min+ além do horário | Gestor |
| Falta | Fim do dia sem nenhuma batida | Gestor |
| Espelho de ponto | Fim do mês ou sob demanda | Funcionário (para assinar) |
