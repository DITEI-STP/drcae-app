import React from 'react';
import { useNovaVisitaForm } from '../context';
import { MapPin, Users } from 'lucide-react';
import { hasCatalogTecnico } from '../../../lib/inspectionModel';
import { loggedOfficerFromStorage } from '../../../lib/inspectionTeam';

/**
 * Data, hora e agentes de serviço. Os agentes vêm do catálogo cadastrado no
 * `drcae-admin` — não há forma de escrever um nome à mão.
 *
 * O estado vive no componente-pai e chega por contexto — ver `../context.ts`.
 */
export default function StepEquipa() {
  const loggedOfficer = loggedOfficerFromStorage();
  const {
    anexos,
    location,
    saveDraft,
    setTechnicians,
    technicians,
    navigate,
  } = useNovaVisitaForm();

  // O formulário não tem autosave: sair daqui sem gravar perdia a fiscalização
  // inteira, não apenas o passo. Gravado o rascunho, o `returnTo` traz o agente
  // de volta ao ponto onde parou — e mesmo que o `state` se perca num
  // recarregamento, o rascunho é restaurado ao reabrir `/visitas/nova`.
  const irParaEquipa = async () => {
    await saveDraft(anexos);
    navigate('/equipe', { state: { returnTo: '/visitas/nova' } });
  };

  return (
  <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
     
     {/* Equipa de Fiscalização */}
     <div className="space-y-6 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="space-y-1">
           <div className="flex items-center gap-2 mb-1">
              <Users className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <h3 className="font-bold text-base text-slate-800 dark:text-slate-100">Confirmar Equipa de Fiscalização</h3>
           </div>
           <p className="text-xs text-slate-500 dark:text-slate-400 font-medium font-sans">
              Confirme os agentes escalados para esta ação. É obrigatória a presença de pelo menos 1 fiscal.
           </p>
        </div>

        <div className="space-y-2.5">
           {technicians.map((tech, idx) => (
              <div key={tech} className="flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl">
                 <div className="flex items-center gap-2.5">
                    <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-400 flex items-center justify-center text-[10px] font-bold">
                       {idx + 1}
                    </div>
                    <div>
                       <span className="text-sm font-bold text-slate-700 dark:text-slate-200 block">{tech.name}</span>
                       {!tech.uid && (
                         <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold">Registo antigo — sem identificador</span>
                       )}
                    </div>
                 </div>
                 {tech.uid === loggedOfficer?.uid ? (
                   <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                     Agente autenticado · obrigatório
                   </span>
                 ) : (
                   <button
                      type="button"
                      onClick={() => setTechnicians(prev => prev.filter(t => t.uid !== tech.uid))}
                      className="p-1.5 text-[10px] text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-700 dark:hover:text-red-400 font-bold rounded-lg transition-colors border border-transparent hover:border-red-100 dark:hover:border-red-900/50"
                   >
                      Remover
                   </button>
                 )}
              </div>
           ))}

           {!hasCatalogTecnico(technicians) && (
              <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40 rounded-xl text-center text-xs text-red-700 dark:text-red-400 font-semibold">
                 {technicians.length === 0
                   ? 'Atenção: Deve definir pelo menos um agente fiscalizador para prosseguir!'
                   : 'A equipa só tem agentes de registos antigos, sem identificador. Seleccione pelo menos um agente do catálogo no ecrã de Equipa.'}
              </div>
           )}
        </div>

        {/* O campo de texto livre «Adicionar Co-Fiscalizador» foi
            removido: um agente escrito à mão não tem identificador e
            não é rastreável. A equipa compõe-se no ecrã de Equipa, a
            partir do catálogo cadastrado no drcae-admin. */}
        <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
           <button
              type="button"
              onClick={() => void irParaEquipa()}
              className="w-full py-3 text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/30 rounded-xl hover:bg-indigo-100 dark:hover:bg-indigo-950/50 transition-colors"
           >
              Alterar composição da equipa
           </button>
           <p className="text-[10px] text-slate-400 font-medium pl-1 mt-2 text-center">
              Os agentes são cadastrados na área administrativa e descarregados para este dispositivo.
           </p>
        </div>
     </div>

     {location && (
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col items-center justify-center gap-1.5 text-center">
           <MapPin className="w-5 h-5 text-indigo-500 dark:text-indigo-400 animate-bounce" />
           <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Coordenadas de Ingressos do Agente</p>
           <p className="text-xs text-slate-700 dark:text-slate-200 font-mono font-bold">Lat: {location.lat.toFixed(5)} | Lng: {location.lng.toFixed(5)}</p>
        </div>
     )}
  </div>
  );
}
