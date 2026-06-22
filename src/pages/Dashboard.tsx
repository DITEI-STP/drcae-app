import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { Briefcase, ClipboardList, AlertTriangle, CheckCircle, Users } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Dashboard() {
  const stats = useLiveQuery(async () => {
    const firmas = await db.firmas.count();
    const visitas = await db.visitas.count();
    const infracoes = await db.infracoes.count();
    return { firmas, visitas, infracoes };
  }, [], { firmas: 0, visitas: 0, infracoes: 0 });

  const [equipe, setEquipe] = React.useState<string[]>([]);

  React.useEffect(() => {
    const saved = localStorage.getItem('drcae_equipe');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setEquipe(parsed);
      } catch (e) {
        setEquipe(['Agente Carvalho', 'Agente Silva']);
      }
    } else {
      setEquipe(['Agente Carvalho', 'Agente Silva']); // default
    }
  }, []);

  const hasDefined = localStorage.getItem('drcae_equipe_definida') === 'true';

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6">
      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col items-center text-center">
        <div className="w-16 h-16 bg-slate-50 border border-dashed border-slate-300 text-slate-400 rounded-xl flex items-center justify-center mb-3">
          <ClipboardList className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-bold text-slate-800">Bom trabalho!</h2>
        <p className="text-slate-500 text-sm mt-1">Este é o seu resumo de atividades registadas localmente.</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Link to="/firmas" className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 hover:bg-slate-50 transition-colors">
          <Briefcase className="w-8 h-8 text-blue-600 mb-2" />
          <p className="text-2xl font-bold text-slate-900">{stats.firmas}</p>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block font-sans">Firmas</p>
        </Link>
        <Link to="/visitas" className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 hover:bg-slate-50 transition-colors">
          <ClipboardList className="w-8 h-8 text-emerald-500 mb-2" />
          <p className="text-2xl font-bold text-slate-900">{stats.visitas}</p>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block font-sans">Visitas</p>
        </Link>
        <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex items-center justify-between">
            <div className="font-sans">
              <p className="text-2xl font-bold text-red-500">{stats.infracoes}</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block leading-tight">Infrações</p>
            </div>
            <AlertTriangle className="w-8 h-8 text-red-400 shrink-0 ml-1" />
        </div>
        <Link to="/equipe" className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 hover:bg-slate-50 transition-colors flex items-center justify-between">
            <div className="font-sans">
              <p className="text-2xl font-bold text-indigo-600">{equipe.length}</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block leading-tight">Equipa Hoje</p>
            </div>
            <Users className="w-8 h-8 text-indigo-400 shrink-0 ml-1" />
        </Link>
      </div>

      {/* Seccao de Equipa Diaria Destacada */}
      <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 text-left font-sans space-y-3">
         <div className="flex justify-between items-center border-b border-slate-100 pb-2">
            <div className="flex items-center gap-2">
               <Users className="w-4.5 h-4.5 text-indigo-600" />
               <h3 className="font-bold text-xs text-slate-800 uppercase tracking-wider">Equipa Diária Destacada</h3>
            </div>
            <Link to="/equipe" className="text-[11px] font-bold text-indigo-600 hover:underline">Ver Escala</Link>
         </div>
         <div className="flex flex-wrap gap-2 pt-1">
            {equipe.length === 0 ? (
               <p className="text-xs text-slate-400">Nenhuma equipa configurada para hoje.</p>
            ) : (
               equipe.map((m, i) => (
                  <span key={i} className="text-xs font-semibold px-2.5 py-1.5 bg-indigo-50/70 border border-indigo-100 text-indigo-900 rounded-xl flex items-center gap-1 shadow-3xs">
                     <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full" />
                     {m}
                  </span>
               ))
            )}
         </div>
         <p className="text-[10px] text-slate-400 leading-normal font-semibold flex items-center gap-1 pt-1">
            {!hasDefined ? (
               <span className="text-amber-600 font-bold">⚠️ Tem de confirmar/definir a equipa nas configurações de equipa antes de iniciar registos!</span>
            ) : (
               <span>✦ Todo o trabalho registado hoje será certificado juridicamente com base nesta escala ativa.</span>
            )}
         </p>
      </div>
      
      <div className="mt-8 pt-4 border-t border-slate-200">
        <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Ações Rápidas</h3>
        <div className="space-y-3">
          <Link to="/visitas/nova" className="flex items-center justify-center gap-3 p-4 bg-blue-600 text-white rounded-xl shadow-lg shadow-blue-200 hover:bg-blue-700 transition-colors">
            <span className="font-bold uppercase text-xs">Nova Fiscalização</span>
            <ClipboardList className="w-4 h-4" />
          </Link>
          <Link to="/equipe" className="flex items-center justify-center gap-3 p-3.5 bg-slate-900 text-white rounded-xl shadow-md hover:bg-slate-800 transition-colors">
            <span className="font-bold uppercase text-xs">Escalar Equipa do Dia</span>
            <Users className="w-4 h-4 text-indigo-400" />
          </Link>
        </div>
      </div>
    </div>
  );
}
