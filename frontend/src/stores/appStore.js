import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Store global da aplicação usando Zustand.
 * Estado do terminal, auth e configurações.
 */
export const useAppStore = create(
  persist(
    (set, get) => ({
      // ==========================================
      // AUTH (painel admin)
      // ==========================================
      token: null,
      usuario: null,
      setAuth: (token, usuario) => set({ token, usuario }),
      logout: () => set({ token: null, usuario: null }),

      // ==========================================
      // TERMINAL DE PONTO
      // ==========================================
      terminalMode: 'idle', // idle | scanning | pin | confirming | success | error
      setTerminalMode: (mode) => set({ terminalMode: mode }),

      lastPunch: null,
      setLastPunch: (punch) => set({ lastPunch: punch }),

      // Funcionário identificado (reconhecimento facial ou PIN)
      identifiedEmployee: null,
      setIdentifiedEmployee: (emp) => set({ identifiedEmployee: emp }),

      // ==========================================
      // CONFIGURAÇÕES
      // ==========================================
      config: {
        empresa_nome: 'Centro Automotivo Aliança',
        empresa_cnpj: '',
        tolerancia_entrada_min: '5',
        tolerancia_saida_min: '5',
        reconhecimento_facial_min_confianca: '60',
        reconhecimento_facial_auto_confianca: '85',
      },
      setConfig: (config) => set({ config }),

      // ==========================================
      // STATUS DE CONEXÃO
      // ==========================================
      isOnline: navigator.onLine,
      setOnline: (status) => set({ isOnline: status }),

      // ==========================================
      // DESCRITORES FACIAIS (cache local)
      // ==========================================
      facialDescriptors: [],
      setFacialDescriptors: (descriptors) => set({ facialDescriptors: descriptors }),

      // ==========================================
      // HELPERS
      // ==========================================
      isAdmin: () => {
        const user = get().usuario;
        return user && ['super_admin', 'rh_gestor', 'lider_equipe'].includes(user.perfil);
      },
    }),
    {
      name: 'ponto-store',
      partialize: (state) => ({
        token: state.token,
        usuario: state.usuario,
        config: state.config,
      }),
    }
  )
);
