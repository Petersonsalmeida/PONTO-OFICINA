import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Terminal from './pages/Terminal';
import Admin from './pages/Admin';
import AdminLogin from './pages/AdminLogin';
import { useAppStore } from './stores/appStore';

function ProtectedAdmin({ children }) {
  const usuario = useAppStore(s => s.usuario);
  if (!usuario) return <Navigate to="/admin/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      {/* Terminal de Ponto (tela principal do tablet) */}
      <Route path="/" element={<Terminal />} />

      {/* Painel Administrativo */}
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin" element={
        <ProtectedAdmin>
          <Admin />
        </ProtectedAdmin>
      } />
      <Route path="/admin/*" element={
        <ProtectedAdmin>
          <Admin />
        </ProtectedAdmin>
      } />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
