import React from 'react';
import { useNovaVisitaForm } from '../context';
import { Check, ChevronRight, History, Search, X } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { catalogRecidivismBadge } from '../../../lib/recidivism';
import { severityClasses } from '../../../lib/infractionCatalog';
import InfractionDetailDrawer from '../../../components/InfractionDetailDrawer';
import RecomendacoesAnteriores from './RecomendacoesAnteriores';

/**
 * Catálogo de infracções e recomendações anteriores deste operador.
 *
 * O histórico vem primeiro de propósito: o agente tem de saber se o que foi
 * recomendado antes foi acatado ANTES de decidir se há infracção.
 *
 * O estado vive no componente-pai e chega por contexto — ver `../context.ts`.
 */
export default function StepInfracoes() {
  const {
    date,
    firmaId,
    handleOpenHistoricInspection,
    modalidade,
    infracaoCountByType,
    infracoes,
    predefinedInfracoes,
    removeInfracao,
    searchInfracao,
    selectedInfraction,
    setSearchInfracao,
    setSelectedInfraction,
    technicians,
    toggleInfracao,
  } = useNovaVisitaForm();

  return (
  <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
     {/* Na modalidade iterativa as recomendações anteriores são tarefa própria
         da tela, com progresso à vista — mostrá-las também aqui daria duas
         listas da mesma coisa e duas formas de responder. No formulário por
         passos continuam aqui: são o input que determina a infracção
         (SPEC-01 R1.2). */}
     {modalidade !== 'iterativa' && <RecomendacoesAnteriores />}


     <div className="bg-white p-4 rounded-xl border border-slate-200 dark:bg-slate-900 dark:border-slate-700 shadow-sm shrink-0">
        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2 pl-1">Pesquisar Catálogo de Infrações</label>
        <div className="relative">
           <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
           <input
              type="text"
              placeholder="Procurar por tipo ou legislação..."
              value={searchInfracao}
              onChange={e => setSearchInfracao(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500 text-xs font-medium text-slate-800 dark:text-slate-100"
           />
        </div>
     </div>

     {infracoes.length > 0 && (
       <div className="flex flex-wrap gap-1.5 px-1">
         <span className="text-[10px] font-bold text-red-600 uppercase tracking-wider self-center mr-1">Selecionadas:</span>
         {infracoes.map(i => (
           <span key={i.type} className="flex items-center gap-1 text-[10px] font-bold bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300 px-2 py-1 rounded-full">
             {i.type.length > 25 ? i.type.substring(0, 25) + '…' : i.type}
             <button onClick={() => removeInfracao(i.type)} className="ml-0.5 hover:text-red-600"><X className="w-3 h-3" /></button>
           </span>
         ))}
       </div>
     )}

     <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">
       Catálogo ({predefinedInfracoes.filter(inf => inf.type.toLowerCase().includes(searchInfracao.toLowerCase()) || inf.legalInstrument?.toLowerCase().includes(searchInfracao.toLowerCase())).length} encontradas)
     </p>

     <div className="space-y-2">
       {predefinedInfracoes
         .filter(inf => inf.type.toLowerCase().includes(searchInfracao.toLowerCase()) || inf.legalInstrument?.toLowerCase().includes(searchInfracao.toLowerCase()))
         .map(inf => {
           const isSelected = infracoes.some(i => i.type === inf.type);
           const severityColor = severityClasses(inf.severityLevel);
           // Em repouso reflecte as ocorrências anteriores deste
           // operador; seleccionada, agrava um nível. Zero anteriores e
           // não seleccionada = sem distintivo (era «Incidente» em
           // todas as infracções do catálogo, o que o tornava inútil).
           const recidivism = catalogRecidivismBadge(
             infracaoCountByType.get(inf.type) || 0,
             isSelected,
           );
           return (
             <div
               key={inf.type}
               className={cn(
                 'flex items-center gap-3 p-3 rounded-xl border transition-all',
                 isSelected
                   ? 'bg-red-50 dark:bg-red-950/30 border-red-300 dark:border-red-700'
                   : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
               )}
             >
               <button
                 onClick={() => toggleInfracao(inf)}
                 className={cn(
                   'w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors',
                   isSelected ? 'bg-red-600 border-red-600' : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600'
                 )}
               >
                 {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
               </button>
               <span
                 className={cn('flex-1 text-xs font-semibold leading-tight cursor-pointer', isSelected ? 'text-red-900 dark:text-red-200' : 'text-slate-800 dark:text-slate-100')}
                 onClick={() => toggleInfracao(inf)}
               >
                 {inf.type}
               </span>
               <span className={cn('text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0', severityColor)}>
                 {inf.severity}
               </span>
               {recidivism && (
                 <span className={cn('text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0 transition-colors duration-200', recidivism.className)}>
                   {recidivism.label}
                 </span>
               )}
               <button
                 onClick={() => setSelectedInfraction(inf)}
                 className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 shrink-0"
                 title="Ver detalhes"
               >
                 <ChevronRight className="w-4 h-4" />
               </button>
             </div>
           );
         })}
     </div>

     {/* O bloco «Penas Aplicáveis (por Infração)» foi removido: não
         compete ao agente no terreno fixar o valor da coima — é decisão
         de um processo posterior. A moldura legal aplicável continua
         visível, em leitura, no detalhe da infracção. */}

     <InfractionDetailDrawer
       infraction={selectedInfraction}
       firmaId={firmaId}
       onOpenInspection={handleOpenHistoricInspection}
       onClose={() => setSelectedInfraction(null)}
     />
  </div>
  );
}
