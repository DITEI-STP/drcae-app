import { Check, History, X } from 'lucide-react';
import { useNovaVisitaForm } from '../context';
import { cn } from '../../../lib/utils';

/**
 * Recomendações deixadas em fiscalizações anteriores a este operador, e a
 * resposta do agente a cada uma.
 *
 * Extraído de `StepInfracoes` (SPEC-10): a modalidade iterativa apresenta-o
 * como tarefa própria da tela, com progresso à vista, enquanto o formulário por
 * passos continua a mostrá-lo antes do catálogo de infracções — o agente tem de
 * saber se o que foi recomendado antes foi acatado ANTES de decidir se há
 * infracção, e é esse input que a determina.
 *
 * Responder não é cosmética: `lib/firmaRisk.ts` lê estas respostas para
 * calcular o risco do operador. Sem elas, o modelo degrada-se em silêncio.
 */
export default function RecomendacoesAnteriores() {
  const {
    groupedHistoricoRecomendacoes,
    recomendacoesHistoricas,
    setRecomendacoesHistoricas,
  } = useNovaVisitaForm();

  if (groupedHistoricoRecomendacoes.length === 0) return null;

  return (
   <div className="space-y-3">
     <div className="flex items-center gap-2">
       <History className="w-4 h-4 text-indigo-500" />
       <label className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">
         Recomendações Anteriores neste Operador ({groupedHistoricoRecomendacoes.length})
       </label>
     </div>
     <div className="space-y-3">
       {groupedHistoricoRecomendacoes.map(group => {
         const entries = group.origins.map(o =>
           recomendacoesHistoricas.find(r => r.visitaOrigemId === o.visitaId && r.text === group.text)
         );
         const allAcatada = entries.length > 0 && entries.every(e => e?.atendida === true);
         const allNaoAcatada = entries.length > 0 && entries.every(e => e?.atendida === false);

         const applyToAllOrigins = (atendida: boolean) => {
           setRecomendacoesHistoricas(prev => {
             let next = [...prev];
             for (const origin of group.origins) {
               const idx = next.findIndex(r => r.visitaOrigemId === origin.visitaId && r.text === group.text);
               if (idx >= 0) {
                 const current = next[idx];
                 next[idx] = { ...current, atendida: current.atendida === atendida ? null : atendida };
               } else {
                 next.push({ text: group.text, visitaOrigemId: origin.visitaId, dataOrigem: origin.date, equipaOrigem: origin.technicians, atendida });
               }
             }
             return next;
           });
         };

         const mostRecent = group.origins[group.origins.length - 1];

         return (
           <div key={group.text} className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-2">
             <p className="text-xs font-medium text-slate-700 dark:text-slate-200 leading-snug">{group.text}</p>
             <div className="flex items-center justify-between">
               <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-medium">
                 <span className="font-mono">{mostRecent.date}</span>
                 <span>·</span>
                 <span>{mostRecent.technicians.slice(0, 2).join(', ')}{mostRecent.technicians.length > 2 ? ` +${mostRecent.technicians.length - 2}` : ''}</span>
                 {group.origins.length > 1 && (
                   <span className="ml-1 px-1.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-bold">
                     ×{group.origins.length}
                   </span>
                 )}
               </div>
               <div className="flex items-center gap-1">
                 <button
                   type="button"
                   onClick={() => applyToAllOrigins(true)}
                   className={cn(
                     'flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg border transition-colors',
                     allAcatada
                       ? 'bg-emerald-100 dark:bg-emerald-900/30 border-emerald-300 text-emerald-800 dark:text-emerald-300'
                       : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-500 hover:border-emerald-300 hover:text-emerald-700'
                   )}
                 >
                   <Check className="w-3 h-3" />
                   Acatada
                 </button>
                 <button
                   type="button"
                   onClick={() => applyToAllOrigins(false)}
                   className={cn(
                     'flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg border transition-colors',
                     allNaoAcatada
                       ? 'bg-red-100 dark:bg-red-900/30 border-red-300 text-red-800 dark:text-red-300'
                       : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-500 hover:border-red-300 hover:text-red-700'
                   )}
                 >
                   <X className="w-3 h-3" />
                   Não Acatada
                 </button>
               </div>
             </div>
           </div>
         );
       })}
     </div>
   </div>
  );
}
