import React, { useState, useEffect } from 'react';
import { Users, Plus, Trash2, Calendar, Info, Check, ArrowRight, ShieldCheck, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '../lib/utils';
import { useNavigate } from 'react-router-dom';

export default function Equipe() {
  const navigate = useNavigate();
  const [members, setMembers] = useState<string[]>([]);
  const [newMemberName, setNewMemberName] = useState('');
  const [showSavedToast, setShowSavedToast] = useState(false);
  const [equipeDefinida, setEquipeDefinida] = useState(() => {
    return localStorage.getItem('drcae_equipe_definida') === 'true';
  });

  // Load equipe from localStorage or set defaults
  useEffect(() => {
    const saved = localStorage.getItem('drcae_equipe');
    if (saved) {
      try {
        setMembers(JSON.parse(saved));
      } catch (e) {
        setMembers(['Agente Carvalho', 'Agente Silva']);
      }
    } else {
      const defaults = ['Agente Carvalho', 'Agente Silva'];
      setMembers(defaults);
      localStorage.setItem('drcae_equipe', JSON.stringify(defaults));
    }
  }, []);

  const saveTeam = (updatedMembers: string[]) => {
    setMembers(updatedMembers);
    localStorage.setItem('drcae_equipe', JSON.stringify(updatedMembers));
    localStorage.setItem('drcae_equipe_definida', 'true');
    setEquipeDefinida(true);
    setShowSavedToast(true);
    setTimeout(() => setShowSavedToast(false), 2000);
  };

  const handleConfirmarEquipeDirecto = () => {
    localStorage.setItem('drcae_equipe_definida', 'true');
    setEquipeDefinida(true);
    setShowSavedToast(true);
    setTimeout(() => setShowSavedToast(false), 2000);
    alert('Composição da equipa e escala de trabalho diária confirmadas com sucesso! O registo de operadores e novas fiscalizações encontra-se agora perfeitamente DESBLOQUEADO e ativo na aplicação.');
  };

  const handleAddMember = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newMemberName.trim();
    if (!name) return;
    
    if (members.includes(name)) {
      alert('Este membro já está adicionado na equipa.');
      return;
    }
    
    const updated = [...members, name];
    saveTeam(updated);
    setNewMemberName('');
  };

  const handleRemoveMember = (nameToRemove: string) => {
    if (members.length <= 1) {
      alert('A equipa deve conter pelo menos um agente fiscalizador.');
      return;
    }
    const updated = members.filter(m => m !== nameToRemove);
    saveTeam(updated);
  };

  const todayFormatted = format(new Date(), "eeee, d 'de' MMMM 'de' yyyy", { locale: ptBR });

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6">
      {/* Header Info */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
        <div className="flex items-center gap-3 mb-3">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">Equipa Diária</h2>
            <p className="text-xs text-slate-500 font-medium">Configure a equipa de agentes de serviço para o dia de hoje.</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2 mt-4 px-3 py-2 bg-slate-50 text-slate-600 rounded-lg text-xs font-semibold">
          <Calendar className="w-4 h-4 text-indigo-500" />
          <span className="capitalize">{todayFormatted}</span>
        </div>
      </div>

      {/* Status callout banner */}
      {equipeDefinida ? (
         <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex gap-3 text-xs items-center animate-in fade-in duration-300">
            <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0 text-emerald-600">
               <ShieldCheck className="w-5 h-5" />
            </div>
            <div className="space-y-0.5 flex-1 text-left">
               <p className="font-bold text-emerald-950">Ambiente Validado e Habilitado</p>
               <p className="text-emerald-700 font-medium leading-tight">
                  A equipa diária está confirmada juridicamente. O registo de fiscalizações e cadastro de operadores está ativo.
               </p>
            </div>
            <span className="text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-full uppercase tracking-wider">Ativo</span>
         </div>
      ) : (
         <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 flex gap-3 text-xs items-center animate-pulse">
            <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center shrink-0 text-amber-700">
               <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="space-y-0.5 flex-1 text-left">
               <p className="font-bold text-amber-950">Definição Extraordinária Pendente</p>
               <p className="text-amber-800 font-medium leading-tight text-left">
                  Por norma jurídica da DRCAE, configure a equipa abaixo e clique em "Confirmar & Gravar" para desbloquear as funcionalidades de registo.
               </p>
            </div>
            <span className="text-[10px] font-bold bg-amber-100 text-amber-900 px-2.5 py-1 rounded-full uppercase tracking-wider">Bloqueado</span>
         </div>
      )}

      {/* Main configuration Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block font-mono">Agentes Escalados Hoje</span>
          <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 font-bold rounded-lg text-xs">{members.length} {members.length === 1 ? 'Agente' : 'Agentes'}</span>
        </div>

        {/* Members List */}
        <div className="p-4 space-y-2.5">
          {members.map((member, idx) => (
            <div 
              key={member}
              className="flex items-center justify-between p-3.5 bg-slate-50 hover:bg-slate-100/80 rounded-xl border border-slate-200 transition-all group scale-100"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-indigo-500 text-white flex items-center justify-center text-xs font-bold font-mono">
                  {idx + 1}
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800">{member}</p>
                  <p className="text-[10px] text-indigo-600 font-bold uppercase tracking-widest mt-0.5">Oficial de Fiscalização</p>
                </div>
              </div>
              
              <button
                type="button"
                onClick={() => handleRemoveMember(member)}
                className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                title="Sair da Equipa"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}

          {members.length === 0 && (
            <div className="text-center py-6 text-slate-400 text-xs">
              Nenhum agente escalado para hoje. Adicione um oficial abaixo.
            </div>
          )}
        </div>

        {/* Add new member form */}
        <div className="p-4 border-t border-slate-100 bg-slate-50/50">
          <form onSubmit={handleAddMember} className="space-y-3">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block pl-1">Adicionar Agente/Oficial</label>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Exemplo: Agente Silva, Inspetor Carvalho"
                value={newMemberName}
                onChange={e => setNewMemberName(e.target.value)}
                className="flex-1 p-3 text-xs bg-white border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 text-slate-800 font-semibold rounded-xl placeholder-slate-400"
              />
              <button
                type="submit"
                className="px-4 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-bold text-xs flex items-center gap-1.5 transition-all shadow-md shadow-indigo-100"
              >
                <Plus className="w-4 h-4" />
                Adicionar
              </button>
            </div>
          </form>
        </div>

        {/* Explicit confirmation button */}
        <div className="p-4 border-t border-slate-100 bg-indigo-50/20 flex justify-end">
           <button
              type="button"
              onClick={handleConfirmarEquipeDirecto}
              className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all shadow-md shadow-indigo-100 uppercase tracking-widest"
           >
              <ShieldCheck className="w-4 h-4 text-white" />
              Confirmar & Gravar Composição de Equipa
           </button>
        </div>
      </div>

      {/* Info Notice card */}
      <div className="bg-amber-50/60 border border-amber-200 rounded-2xl p-4 flex gap-3 text-xs">
        <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-bold text-amber-800">Sincronização & Processo</p>
          <p className="text-amber-700 font-medium leading-relaxed">
            Esta equipa configurada servirá de matriz para todas as fiscalizações do dia. No momento de registar cada visita, poderá validar de imediato e realizar qualquer retificação pontual necessária.
          </p>
        </div>
      </div>

      {/* Toast Notification */}
      {showSavedToast && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-4 py-2.5 rounded-full text-xs font-bold shadow-xl flex items-center gap-2 animate-in fade-in slide-in-from-bottom-4 duration-300 z-50">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>Equipa atualizada com sucesso!</span>
        </div>
      )}

      {/* Call to action: nova fiscalização */}
      <div className="pt-4 border-t border-slate-200">
         <button
            onClick={() => navigate('/visitas/nova')}
            className="w-full flex items-center justify-between p-4 bg-slate-900 text-white rounded-2xl hover:bg-slate-800 transition-all font-bold group shadow-xl shadow-slate-900/10"
         >
            <div className="flex items-center gap-3">
               <div className="p-2 bg-slate-800 text-emerald-400 rounded-lg group-hover:scale-110 transition-transform">
                  <ShieldCheck className="w-4 h-4" />
               </div>
               <div className="text-left">
                  <p className="text-xs font-bold leading-none uppercase tracking-wide">Iniciar Nova Fiscalização</p>
                  <p className="text-[10px] text-slate-400 font-medium mt-1">Carregar dados da equipa em vigor</p>
               </div>
            </div>
            <ArrowRight className="w-5 h-5 text-indigo-400 group-hover:translate-x-1 transition-transform" />
         </button>
      </div>
    </div>
  );
}
