import React from 'react';
import { useNovaVisitaForm } from '../context';
import { Check, Plus, Search } from 'lucide-react';
import { cn } from '../../../lib/utils';
import RepresentanteField from '../../../components/RepresentanteField';
import ChipGroup from '../../../components/ChipGroup';
import { RAMOS, formatDistanceLabel } from '../../NovaVisita';

/**
 * Selecção do operador, actividade económica em vistoria e representante no local.
 *
 * O estado vive no componente-pai e chega por contexto — ver `../context.ts`.
 */
export default function StepOperador() {
  const {
    atividadeEconomica,
    filteredFirmas,
    firmaId,
    firmas,
    handleFirmsScroll,
    handleSaveNewAtividade,
    handleSearchChange,
    isSavingAtividade,
    newAtivAtividade,
    newAtivLocal,
    newAtivRamo,
    representante,
    search,
    setAtividadeEconomica,
    setFirmaId,
    setNewAtivAtividade,
    setNewAtivLocal,
    setNewAtivRamo,
    setRepresentante,
    setShowAddAtividade,
    showAddAtividade,
    navigate,
    setSearch,
    setVisibleFirmsCount,
    visibleFirmsCount,
  } = useNovaVisitaForm();

  // Dentro do componente, e não no escopo do módulo: `NovaVisita` importa este
  // ficheiro e este importa `RAMOS` de volta, pelo que ler `RAMOS` durante a
  // avaliação do módulo apanha-o na zona morta temporal. Aqui corre no render,
  // muito depois de o ciclo estar resolvido.
  const ramoOptions = React.useMemo(
    () => RAMOS.map((ramo) => ({ value: ramo, label: ramo })),
    [],
  );

  return (
  <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col h-full min-h-[400px]">
     
     {firmaId ? (
        // Compact Selected Operator Card (Only shows when firmaId is selected)
        <div className="p-4 bg-indigo-50/40 border border-indigo-200 dark:bg-indigo-950/20 dark:border-indigo-855 rounded-2xl flex items-center justify-between animate-in fade-in zoom-in-95 duration-250 shrink-0">
          <div className="min-w-0">
            <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest">Operador Selecionado</p>
            <p className="font-extrabold text-sm text-slate-800 dark:text-slate-200 truncate mt-1">
              {firmas?.find(f => f.id === firmaId)?.name || 'Carregando...'}
            </p>
            <p className="text-[10px] font-mono text-slate-400 dark:text-slate-500 mt-0.5">
              NIF: {firmas?.find(f => f.id === firmaId)?.nif || 'N/A'}
            </p>
          </div>
          <button 
            type="button" 
            onClick={() => {
              setFirmaId('');
              setAtividadeEconomica('');
            }}
            className="p-1.5 px-3 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-bold text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-700 rounded-xl transition-all"
          >
            Alterar
          </button>
        </div>
     ) : (
        // Search box and Operators list (Shown when no operator is selected)
        <>
           {/* Header of Step 1 / Search section */}
           <div className="space-y-3 shrink-0">
             <label className="text-[10px] font-bold text-slate-400 dark:text-slate-550 uppercase tracking-widest flex items-center justify-between">
               Operador Económico / Firma
             </label>
             <div className="relative">
               <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 w-4 h-4" />
               <input
                 type="text"
                 placeholder="Procurar firma por nome ou NIF..."
                 className="w-full pl-9 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:bg-white dark:focus:bg-slate-750 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 text-sm font-medium text-slate-800 dark:text-slate-100 transition-all outline-none"
                 value={search}
                 onChange={e => handleSearchChange(e.target.value)}
               />
             </div>

             <div className="flex items-center justify-between mt-2">
               <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                 {(() => {
                   const count = filteredFirmas.length;
                   return `${count} ${count === 1 ? 'operador' : 'operadores'}`;
                 })()}
               </p>
               <button
                 type="button"
                 onClick={() => navigate('/firmas/nova', { state: { returnTo: '/visitas/nova' } })}
                 className="text-xs font-bold text-blue-600 dark:text-blue-400 flex items-center gap-1 hover:text-blue-700 dark:hover:text-blue-300 bg-blue-50 dark:bg-blue-950/30 px-3 py-1.5 rounded-lg transition-colors"
               >
                 <Plus className="w-3.5 h-3.5" />
                 NOVO OPERADOR
               </button>
             </div>
           </div>

           {/* Operator List Container with Scroll Pagination */}
           <div 
             onScroll={handleFirmsScroll}
             className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar mt-2 border border-slate-100 dark:border-slate-800 rounded-xl p-2 bg-slate-50/50 dark:bg-slate-950/30"
           >
               {(() => {
                 if (filteredFirmas.length === 0) {
                   return (
                     <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400 font-medium space-y-2">
                       <p>Nenhum operador económico encontrado.</p>
                       {search && (
                         <button 
                           type="button"
                           onClick={() => {
                             setSearch('');
                             setVisibleFirmsCount(15);
                           }}
                           className="text-blue-600 dark:text-blue-400 font-bold hover:underline"
                         >
                           Limpar pesquisa
                         </button>
                       )}
                     </div>
                   );
                 }

                 return (
                   <>
                     {filteredFirmas.slice(0, visibleFirmsCount).map(({ firma: f, distanceKm, hasCoordinates }) => (
                       <div
                         key={f.id}
                         onClick={() => setFirmaId(f.id!)}
                         className={cn(
                           "p-4 rounded-xl border cursor-pointer transition-all duration-200 flex items-start gap-3 hover:scale-[1.005] hover:shadow-xs",
                           firmaId === f.id 
                             ? "bg-indigo-50/40 border-indigo-350 dark:bg-indigo-950/20 dark:border-indigo-850 shadow-xs" 
                             : "bg-white border-slate-200 hover:bg-slate-50/50 dark:bg-slate-900 dark:border-slate-800 dark:hover:bg-slate-850/50"
                         )}
                       >
                         <div className={cn(
                           "w-5 h-5 rounded-full border flex flex-col items-center justify-center shrink-0 mt-0.5 transition-colors", 
                           firmaId === f.id 
                             ? "bg-indigo-600 border-indigo-600 dark:bg-indigo-500 dark:border-indigo-500 text-white" 
                             : "bg-white border-slate-300 dark:bg-slate-800 dark:border-slate-700"
                         )}>
                            {firmaId === f.id && <Check className="w-3 h-3 stroke-[3]" />}
                         </div>
                         <div className="flex-1 min-w-0">
                           <p className={cn("font-bold text-sm leading-tight truncate", firmaId === f.id ? "text-indigo-900 dark:text-indigo-300" : "text-slate-800 dark:text-slate-200")}>
                             {f.name}
                           </p>
                           <div className="flex items-center justify-between gap-3 mt-1">
                             <p className={cn("text-[10px] uppercase font-bold tracking-widest font-mono", firmaId === f.id ? "text-indigo-600 dark:text-indigo-400" : "text-slate-400 dark:text-slate-500")}>
                               NIF: {f.nif}
                             </p>
                             <span className={cn(
                               "text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap",
                               hasCoordinates
                                 ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
                                 : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
                             )}>
                               {hasCoordinates ? `${formatDistanceLabel(distanceKm)} de si` : 'Sem GPS mapeado'}
                             </span>
                           </div>
                         </div>
                       </div>
                     ))}
                     {visibleFirmsCount < filteredFirmas.length && (
                       <div className="py-2 text-center text-[10px] text-slate-400 font-bold animate-pulse">
                         A carregar mais operadores...
                       </div>
                     )}
                   </>
                 );
               })()}
           </div>
        </>
     )}

     {/* Representative & Economic Activity - Only shown AFTER selecting a firma */}
      {firmaId && (
        <div className="space-y-4 shrink-0 pt-4 border-t border-slate-100 dark:border-slate-800 animate-in fade-in slide-in-from-bottom duration-300">
          <RepresentanteField
            firmaId={firmaId}
            value={representante}
            onChange={setRepresentante}
          />
          
          <div className="space-y-2">
            <div className="flex items-center justify-between pl-1">
              <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Atividade Económica em Vistoria</label>
              {!showAddAtividade && (
                <button
                  type="button"
                  onClick={() => {
                    setShowAddAtividade(true);
                    setNewAtivRamo(RAMOS[0]);
                  }}
                  className="text-[10px] font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> ADICIONAR ATIVIDADE
                </button>
              )}
            </div>
            {showAddAtividade ? (
              <div className="p-5 bg-slate-50 dark:bg-slate-950/30 border border-slate-200 dark:border-slate-800 rounded-xl space-y-4 animate-in fade-in zoom-in-95 duration-200 text-left">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-850 pb-2">
                  <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Nova Atividade Económica</span>
                  <button
                    type="button"
                    onClick={() => setShowAddAtividade(false)}
                    className="text-[10px] font-bold text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 cursor-pointer"
                  >
                    Cancelar
                  </button>
                </div>
                
                <ChipGroup
                  label="Ramo de Atividade"
                  options={ramoOptions}
                  value={newAtivRamo || null}
                  onChange={setNewAtivRamo}
                  sheetTitle="Ramo de Atividade"
                  searchPlaceholder="Pesquisar ramo…"
                  emptyLabel="Ramos de atividade por sincronizar."
                />

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest pl-1">Atividade Económica *</label>
                  <input
                    type="text"
                    placeholder="Ex: Venda de Sapatos"
                    value={newAtivAtividade}
                    onChange={e => setNewAtivAtividade(e.target.value)}
                    className="w-full p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest pl-1">Local Específico *</label>
                  <input
                    type="text"
                    placeholder="Ex: Loja 3 - Mercado Municipal"
                    value={newAtivLocal}
                    onChange={e => setNewAtivLocal(e.target.value)}
                    className="w-full p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <button
                  type="button"
                  disabled={isSavingAtividade || !newAtivRamo || !newAtivAtividade.trim() || !newAtivLocal.trim()}
                  onClick={handleSaveNewAtividade}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white rounded-lg text-xs font-bold transition-all disabled:opacity-50 disabled:bg-slate-400 dark:disabled:bg-slate-800 flex items-center justify-center gap-1.5 shadow-xs cursor-pointer font-sans"
                >
                  {isSavingAtividade ? 'A guardar...' : 'Guardar Atividade'}
                </button>
              </div>
            ) : (
              (() => {
                 const f = firmas?.find(x => x.id === firmaId);
                 if (f && f.atividades && f.atividades.length > 0) {
                   return (
                     <div className="grid grid-cols-1 gap-2">
                        {f.atividades.map((ativ, i) => (
                           <div 
                              key={i}
                              onClick={() => setAtividadeEconomica(ativ.atividade)}
                              className={cn(
                                "p-4 border rounded-xl cursor-pointer transition-all duration-200 relative", 
                                atividadeEconomica === ativ.atividade 
                                  ? "bg-blue-50/40 border-blue-300 dark:bg-blue-950/20 dark:border-blue-900 shadow-xs" 
                                  : "bg-white border-slate-200 hover:bg-slate-50/50 dark:bg-slate-900 dark:border-slate-800 dark:hover:bg-slate-850/50"
                              )}
                           >
                              <div className="flex items-start gap-3">
                                 <div className={cn(
                                   "w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-0.5 transition-colors", 
                                   atividadeEconomica === ativ.atividade 
                                     ? "bg-blue-600 border-blue-600 dark:bg-blue-500 dark:border-blue-500" 
                                     : "bg-white border-slate-300 dark:bg-slate-800 dark:border-slate-700"
                                 )}>
                                    {atividadeEconomica === ativ.atividade && <div className="w-2 h-2 bg-white rounded-full" />}
                                 </div>
                                 <div className="text-left">
                                    <p className={cn("font-bold text-sm", atividadeEconomica === ativ.atividade ? "text-blue-900 dark:text-blue-300" : "text-slate-800 dark:text-slate-200")}>{ativ.atividade}</p>
                                    <p className="text-xs text-slate-500 dark:text-slate-450 mt-1">{ativ.ramo} • {ativ.local}</p>
                                 </div>
                              </div>
                            </div>
                         ))}
                      </div>
                    );
                  }
                  return (
                    <div className="p-5 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-xl text-center text-xs text-amber-700 dark:text-amber-450 font-semibold space-y-3">
                       <p>Este operador económico não possui atividades registadas.</p>
                       <button 
                         type="button"
                         onClick={() => {
                           setShowAddAtividade(true);
                           setNewAtivRamo(RAMOS[0]);
                         }}
                         className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white rounded-lg font-bold shadow-xs transition-all text-xs cursor-pointer"
                       >
                         Criar Atividade no Local
                       </button>
                    </div>
                  );
               })()
             )}
           </div>
         </div>
       )}
  </div>
  );
}
