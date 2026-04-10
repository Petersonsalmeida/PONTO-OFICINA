import axios from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15_000,
  headers: { 'Content-Type': 'application/json' },
});

// Injetar token automaticamente
api.interceptors.request.use((config) => {
  const stored = localStorage.getItem('ponto-store');
  if (stored) {
    try {
      const { state } = JSON.parse(stored);
      if (state?.token) {
        config.headers.Authorization = `Bearer ${state.token}`;
      }
    } catch { /* ignora */ }
  }
  return config;
});

// Tratar 401 global
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('ponto-store');
      window.location.href = '/admin/login';
    }
    return Promise.reject(err);
  }
);

// ==========================================
// Auth
// ==========================================
export const authAPI = {
  login: (cpf, pin) => api.post('/auth/login', { cpf, pin }),
  changePin: (pin_atual, pin_novo) => api.post('/auth/change-pin', { pin_atual, pin_novo }),
  me: () => api.get('/auth/me'),
};

// ==========================================
// Employees
// ==========================================
export const employeeAPI = {
  list: (params) => api.get('/employees', { params }),
  get: (id) => api.get(`/employees/${id}`),
  create: (data) => api.post('/employees', data),
  update: (id, data) => api.put(`/employees/${id}`, data),
  remove: (id) => api.delete(`/employees/${id}`),
  saveFacialTemplate: (id, descriptor) =>
    api.post(`/employees/${id}/facial-template`, { descriptor }),
  getFacialDescriptors: () => api.get('/employees/all/facial-descriptors'),
};

// ==========================================
// Time Records (Ponto)
// ==========================================
export const timeRecordAPI = {
  punch: (data) => api.post('/time-records/punch', data),
  verifyPin: (pin) => api.post('/time-records/verify-pin', { pin }),
  list: (params) => api.get('/time-records', { params }),
  todayStatus: () => api.get('/time-records/today-status'),
  employeePeriod: (id, params) => api.get(`/time-records/employee/${id}/period`, { params }),
};

// ==========================================
// Corrections (Ajustes)
// ==========================================
export const correctionAPI = {
  create: (data) => api.post('/corrections', data),
  list: (params) => api.get('/corrections', { params }),
  approve: (id, status, observacao) => api.patch(`/corrections/${id}/approve`, { status, observacao }),
};

// ==========================================
// Reports
// ==========================================
export const reportAPI = {
  pdf: (employeeId, params) =>
    api.get(`/reports/pdf/${employeeId}`, { params, responseType: 'blob' }),
  excel: (employeeId, params) =>
    api.get(`/reports/excel/${employeeId}`, { params, responseType: 'blob' }),
  sendWhatsapp: (employeeId, data) => api.post(`/reports/send-whatsapp/${employeeId}`, data),
  hourBank: (employeeId, params) => api.get(`/reports/hour-bank/${employeeId}`, { params }),
  dashboard: () => api.get('/reports/dashboard'),
};

// ==========================================
// Schedules (Escalas)
// ==========================================
export const scheduleAPI = {
  list: (params) => api.get('/schedules', { params }),
  save: (data) => api.post('/schedules', data),
  generateBulk: (employee_id, mes) => api.post('/schedules/bulk', { employee_id, mes }),
  remove: (employeeId, data) => api.delete(`/schedules/${employeeId}/${data}`),
};

// ==========================================
// Config
// ==========================================
export const configAPI = {
  get: () => api.get('/config'),
  update: (data) => api.put('/config', data),
  holidays: (params) => api.get('/config/holidays', { params }),
  addHoliday: (data) => api.post('/config/holidays', data),
};

export default api;
