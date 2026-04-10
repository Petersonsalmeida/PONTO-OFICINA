import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, Clock, AlertCircle,
  Settings, LogOut, Menu, X, ChevronRight, CalendarDays,
} from 'lucide-react';
import { useAppStore } from '../stores/appStore';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import Dashboard from '../components/Admin/Dashboard';
import EmployeeList from '../components/Admin/EmployeeList';
import TimeRecords from '../components/Admin/TimeRecords';
import Corrections from '../components/Admin/Corrections';
import ConfigPanel from '../components/Admin/ConfigPanel';
import Schedules from '../components/Admin/Schedules';

const MENU_ITEMS = [
  { id: 'dashboard',   icon: LayoutDashboard, label: 'Dashboard',    perfis: ['super_admin','rh_gestor','lider_equipe'] },
  { id: 'employees',   icon: Users,           label: 'Funcionários', perfis: ['super_admin','rh_gestor'] },
  { id: 'schedules',   icon: CalendarDays,    label: 'Escalas',      perfis: ['super_admin','rh_gestor','lider_equipe'] },
  { id: 'records',     icon: Clock,           label: 'Registros',    perfis: ['super_admin','rh_gestor','lider_equipe'] },
  { id: 'corrections', icon: AlertCircle,     label: 'Ajustes',      perfis: ['super_admin','rh_gestor','lider_equipe'] },
  { id: 'config',      icon: Settings,        label: 'Configurações',perfis: ['super_admin'] },
];

export default function Admin() {
  const navigate = useNavigate();
  const { usuario, logout } = useAppStore();
  const isOnline = useOnlineStatus();

  const [activeSection, setActiveSection] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!usuario) navigate('/admin/login');
  }, [usuario, navigate]);

  if (!usuario) return null;

  const availableItems = MENU_ITEMS.filter(item => item.perfis.includes(usuario.perfil));

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const renderContent = () => {
    switch (activeSection) {
      case 'dashboard':   return <Dashboard />;
      case 'employees':   return <EmployeeList />;
      case 'schedules':   return <Schedules />;
      case 'records':     return <TimeRecords />;
      case 'corrections': return <Corrections />;
      case 'config':      return <ConfigPanel />;
      default: return <Dashboard />;
    }
  };

  const currentItem = availableItems.find(i => i.id === activeSection);

  return (
    <div className="fixed inset-0 flex overflow-hidden"
         style={{ background: 'linear-gradient(135deg, #0f0f2e 0%, #1a0a3a 100%)' }}>

      {/* ===== SIDEBAR ===== */}
      <>
        {/* Overlay mobile */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-20 bg-black/60 md:hidden"
               onClick={() => setSidebarOpen(false)} />
        )}

        <aside className={`fixed md:relative z-30 flex flex-col h-full
                           bg-dark-800/80 backdrop-blur-xl border-r border-white/5
                           transition-all duration-300 flex-shrink-0
                           ${sidebarOpen ? 'w-64 translate-x-0' : 'w-64 -translate-x-full md:translate-x-0'}`}>

          {/* Logo */}
          <div className="p-5 border-b border-white/5 flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center">
                <Clock className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="text-white font-bold text-sm leading-tight">Ponto Eletrônico</p>
                <p className="text-indigo-400 text-xs leading-tight">Aliança</p>
              </div>
            </div>
          </div>

          {/* Menu */}
          <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
            {availableItems.map(item => {
              const Icon = item.icon;
              const active = activeSection === item.id;
              return (
                <button key={item.id}
                        onClick={() => { setActiveSection(item.id); setSidebarOpen(false); }}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium
                                    transition-all duration-150 group
                                    ${active
                                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/40'
                                      : 'text-white/50 hover:text-white hover:bg-white/5'}`}>
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  {item.label}
                  {active && <ChevronRight className="w-4 h-4 ml-auto" />}
                </button>
              );
            })}
          </nav>

          {/* Usuário + logout */}
          <div className="p-4 border-t border-white/5 flex-shrink-0">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-9 h-9 rounded-full bg-indigo-600/30 border border-indigo-500/30
                              flex items-center justify-center flex-shrink-0">
                <span className="text-indigo-300 font-bold text-sm">
                  {usuario.nome?.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="min-w-0">
                <p className="text-white text-sm font-medium truncate">{usuario.nome}</p>
                <p className="text-white/40 text-xs capitalize">{usuario.perfil?.replace('_', ' ')}</p>
              </div>
            </div>
            <button onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-xl
                               text-red-400/70 hover:text-red-400 hover:bg-red-900/20
                               transition-all text-sm">
              <LogOut className="w-4 h-4" />
              Sair
            </button>
          </div>
        </aside>
      </>

      {/* ===== CONTEÚDO PRINCIPAL ===== */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header mobile */}
        <header className="flex items-center justify-between px-5 py-3 border-b border-white/5 flex-shrink-0">
          <button onClick={() => setSidebarOpen(true)}
                  className="p-2 text-white/40 hover:text-white rounded-xl hover:bg-white/5 md:hidden">
            <Menu className="w-5 h-5" />
          </button>

          <h1 className="text-white font-bold">{currentItem?.label || 'Admin'}</h1>

          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-400' : 'bg-orange-400 animate-pulse'}`} />
            <button onClick={() => navigate('/')}
                    className="text-white/40 hover:text-white/70 text-xs transition-colors hidden md:block">
              ← Terminal
            </button>
          </div>
        </header>

        {/* Conteúdo com scroll */}
        <main className="flex-1 overflow-y-auto p-5">
          {renderContent()}
        </main>
      </div>
    </div>
  );
}
