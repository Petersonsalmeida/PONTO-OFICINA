import React, { useState, useEffect } from 'react';
import { Plus, Search, Edit2, UserX, UserCheck, Camera } from 'lucide-react';
import toast from 'react-hot-toast';
import { employeeAPI } from '../../services/api';
import EmployeeForm from './EmployeeForm';
import FaceCadastro from './FaceCadastro';

export default function EmployeeList() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState(null);
  const [faceCadastroFor, setFaceCadastroFor] = useState(null);

  useEffect(() => { load(); }, []);

  async function load() {
    try {
      const { data } = await employeeAPI.list({ ativo: 1 });
      setEmployees(data);
    } catch (err) {
      toast.error('Erro ao carregar funcionários');
    } finally {
      setLoading(false);
    }
  }

  const filtered = employees.filter(e =>
    e.nome.toLowerCase().includes(search.toLowerCase()) ||
    e.cpf.includes(search) ||
    e.cargo.toLowerCase().includes(search.toLowerCase())
  );

  async function toggleAtivo(emp) {
    try {
      await employeeAPI.update(emp.id, { ativo: emp.ativo ? 0 : 1 });
      toast.success(emp.ativo ? 'Funcionário desativado' : 'Funcionário reativado');
      load();
    } catch (err) {
      toast.error('Erro ao atualizar funcionário');
    }
  }

  const perfilLabel = {
    super_admin: 'Super Admin',
    rh_gestor: 'RH/Gestor',
    lider_equipe: 'Líder',
    funcionario: 'Funcionário',
  };

  const escalaBadge = {
    fixo: 'bg-blue-600/20 text-blue-300',
    '12x36': 'bg-purple-600/20 text-purple-300',
    '6x1': 'bg-orange-600/20 text-orange-300',
    alternado: 'bg-teal-600/20 text-teal-300',
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
          <input
            type="text"
            placeholder="Buscar por nome, CPF ou cargo..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-white/10 border border-white/20 rounded-xl pl-10 pr-4 py-2.5
                       text-white placeholder-white/30 focus:outline-none focus:border-indigo-400 text-sm"
          />
        </div>
        <button
          onClick={() => { setEditingEmployee(null); setShowForm(true); }}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white
                     px-4 py-2.5 rounded-xl text-sm font-medium transition-colors flex-shrink-0"
        >
          <Plus className="w-4 h-4" />
          Novo Funcionário
        </button>
      </div>

      {/* Tabela */}
      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-white/40 text-left border-b border-white/10 text-xs uppercase tracking-wider">
                <th className="px-5 py-3 font-medium">Funcionário</th>
                <th className="px-5 py-3 font-medium hidden md:table-cell">CPF</th>
                <th className="px-5 py-3 font-medium">Escala</th>
                <th className="px-5 py-3 font-medium hidden lg:table-cell">Perfil</th>
                <th className="px-5 py-3 font-medium">Facial</th>
                <th className="px-5 py-3 font-medium text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {loading && (
                <tr><td colSpan={6} className="py-12 text-center text-white/30">Carregando...</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={6} className="py-12 text-center text-white/30">Nenhum funcionário encontrado</td></tr>
              )}
              {filtered.map(emp => (
                <tr key={emp.id} className="hover:bg-white/5 transition-colors group">
                  <td className="px-5 py-4">
                    <p className="font-medium text-white">{emp.nome}</p>
                    <p className="text-white/40 text-xs">{emp.cargo}</p>
                  </td>
                  <td className="px-5 py-4 text-white/60 font-mono hidden md:table-cell">{emp.cpf}</td>
                  <td className="px-5 py-4">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${escalaBadge[emp.escala] || 'bg-white/10 text-white/60'}`}>
                      {emp.escala}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-white/60 hidden lg:table-cell">
                    {perfilLabel[emp.perfil] || emp.perfil}
                  </td>
                  <td className="px-5 py-4">
                    <button
                      onClick={() => setFaceCadastroFor(emp)}
                      className="flex items-center gap-1.5 text-xs text-indigo-300 hover:text-indigo-200 transition-colors"
                      title="Cadastrar rosto"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      {/* Indicador se tem template */}
                      <span className={`w-2 h-2 rounded-full ${emp.template_facial ? 'bg-green-400' : 'bg-red-400'}`} />
                    </button>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => { setEditingEmployee(emp); setShowForm(true); }}
                        className="p-1.5 text-white/40 hover:text-white rounded-lg hover:bg-white/10 transition-all"
                        title="Editar"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => toggleAtivo(emp)}
                        className={`p-1.5 rounded-lg transition-all ${emp.ativo
                          ? 'text-red-400/60 hover:text-red-400 hover:bg-red-900/20'
                          : 'text-green-400/60 hover:text-green-400 hover:bg-green-900/20'}`}
                        title={emp.ativo ? 'Desativar' : 'Reativar'}
                      >
                        {emp.ativo ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Formulário */}
      {showForm && (
        <EmployeeForm
          employee={editingEmployee}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); load(); }}
        />
      )}

      {/* Modal Cadastro Facial */}
      {faceCadastroFor && (
        <FaceCadastro
          employee={faceCadastroFor}
          onClose={() => setFaceCadastroFor(null)}
          onSaved={() => { setFaceCadastroFor(null); load(); }}
        />
      )}
    </div>
  );
}
