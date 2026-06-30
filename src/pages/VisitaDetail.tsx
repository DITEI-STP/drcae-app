import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { ArrowLeft, ArrowRight, User, Calendar, MapPin, AlertTriangle, FileText, Image as ImageIcon, PenLine, Lock, LockKeyhole, X, Check, Save, Info, CheckCircle, Plus } from 'lucide-react';
import { cn } from '../lib/utils';
import { toast, customAlert } from '../lib/notifications';
import { triggerFullSyncIfReachable } from '../lib/sync';

function getMemberAvatar(name: string): { initials: string; gradient: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const initials = parts.slice(0, 2).map(w => w[0].toUpperCase()).join('') || '?';
  const gradients = [
    'from-blue-500 to-indigo-600',
    'from-purple-500 to-pink-500',
    'from-teal-500 to-emerald-600',
    'from-orange-500 to-amber-600',
    'from-violet-500 to-purple-600',
    'from-rose-500 to-pink-600',
    'from-cyan-500 to-blue-600',
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return { initials, gradient: gradients[Math.abs(hash) % gradients.length] };
}

export default function VisitaDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const visita = useLiveQuery(() => db.visitas.get(id!), [id]);
  const firma = useLiveQuery(() => visita ? db.firmas.get(visita.firmaId) : undefined, [visita]);
  const infracoes = useLiveQuery(() => db.infracoes.where('visitaId').equals(id!).toArray(), [id]);
  const anexos = useLiveQuery(() => db.anexos.where('visitaId').equals(id!).toArray(), [id]);

  const [showEditModal, setShowEditModal] = useState(false);
  const [editNotes, setEditNotes] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [editAtividade, setEditAtividade] = useState('');
  const [editTechnicians, setEditTechnicians] = useState('');

  const canEdit = () => {
    if (!visita) return false;
    // If not synced, editing is always allowed
    if (!visita.synced) return true;

    // If synced, check if it was registered less than 1 hour ago (using createdAt)
    if (visita.createdAt) {
      const oneHourMs = 60 * 60 * 1000;
      return (Date.now() - visita.createdAt) < oneHourMs;
    }

    // Fallback: prefilled demo data is assumed older than 1 hour
    return false;
  };

  const getRemainingEditMinutes = () => {
    if (!visita) return 0;
    if (!visita.synced) return 60; // Unsynced can be edited indefinitely
    if (!visita.createdAt) return 0;
    const diffMs = Date.now() - visita.createdAt;
    const remainingMs = (60 * 60 * 1000) - diffMs;
    return Math.max(0, Math.ceil(remainingMs / (60 * 1000)));
  };

  const handleOpenEdit = () => {
    if (!visita) return;
    if (!canEdit()) {
      customAlert.warning('Operação Bloqueada', 'Esta fiscalização foi submetida para o servidor e encontra-se registada há mais de 1 hora. Por razões de auditoria legal e conformidade legal, a retificação de dados está permanentemente bloqueada.');
      return;
    }
    setEditNotes(visita.notes || '');
    setEditStatus(visita.status);
    setEditAtividade(visita.atividadeEconomica || '');
    setEditTechnicians(visita.technicians.join(', '));
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!visita) return;
    try {
      const updatedTechs = editTechnicians
        .split(',')
        .map(t => t.trim())
        .filter(Boolean);

      const updatedVisita = {
        ...visita,
        notes: editNotes,
        status: editStatus as any,
        atividadeEconomica: editAtividade,
        technicians: updatedTechs,
        synced: false // Reset synced status so it queues up for auto or manual sync
      };

      await db.visitas.put(updatedVisita);

      // Add operation to synchronization queue
      await db.syncQueue.add({
        entity: 'visita',
        action: 'update',
        entityId: visita.id!,
        payload: updatedVisita,
        timestamp: Date.now()
      });

      setShowEditModal(false);
      toast.success('Alterações guardadas com sucesso! O registo foi assinalado para ressincronização.');
      triggerFullSyncIfReachable().catch((err) => {
        console.warn('[drcae] Sync imediato após retificação falhou; registo ficará pendente.', err);
      });
    } catch (e) {
      console.error(e);
      toast.error('Erro ao atualizar a fiscalização.');
    }
  };

  if (!visita) return <div className="p-4 text-center mt-10 dark:text-slate-400">Carregando visita...</div>;

  return (
    <div className="flex flex-col h-full bg-[#F5F7FA] dark:bg-slate-950 pb-safe">
      <div className="bg-white dark:bg-slate-900 px-4 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0 sticky top-0 z-10 flex items-center justify-between">
         <div className="flex items-center">
            <button onClick={() => navigate(-1)} className="mr-3 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-105">
               <ArrowLeft className="w-5 h-5" />
            </button>
            <h2 className="font-bold text-slate-900 dark:text-slate-105 tracking-tight">Detalhes da Visita</h2>
         </div>
         <div className="flex items-center gap-2">
            <button
               onClick={handleOpenEdit}
               className={cn(
                  "p-2 rounded-lg border transition-all flex items-center justify-center cursor-pointer",
                  canEdit()
                    ? "bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-900/30 hover:bg-blue-100 hover:text-blue-700"
                    : "bg-slate-100 dark:bg-slate-850 text-slate-400 dark:text-slate-600 border-slate-200 dark:border-slate-800 cursor-not-allowed"
               )}
               title={canEdit() ? "Retificar Dados" : "Edição Bloqueada"}
            >
               {canEdit() ? <PenLine className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
            </button>
            {/* Badge de confirmação da fiscalização */}
            {(() => {
              if (visita.synced) {
                return visita.confirmationStatus === 'pendente'
                  ? <span className="text-[10px] uppercase font-bold px-2 py-1.5 rounded-md bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-400">Pendente</span>
                  : <span className="text-[10px] uppercase font-bold px-2 py-1.5 rounded-md bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-400">Confirmada</span>;
              }
              const age = Date.now() - (visita.createdAt || 0);
              return age > 60 * 60 * 1000
                ? <span className="text-[10px] uppercase font-bold px-2 py-1.5 rounded-md bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-400">Pendente</span>
                : <span className="text-[10px] uppercase font-bold px-2 py-1.5 rounded-md bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">Sincronizando…</span>;
            })()}
            <span className={cn(
               "text-[10px] uppercase font-bold px-2 py-1.5 rounded-md",
               visita.status === 'Inconformes' ? "bg-amber-100 dark:bg-amber-950/30 text-amber-800 dark:text-amber-400" :
               visita.status === 'Infrações' ? "bg-red-100 dark:bg-red-950/30 text-red-800 dark:text-red-400" : "bg-emerald-100 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-400"
            )}>
               {visita.status}
            </span>
         </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar pb-10">
         {/* Audit trail alert */}
         {canEdit() ? (
            <div className="bg-amber-50/70 dark:bg-amber-950/10 border border-amber-200 dark:border-amber-900/30 rounded-xl p-3 flex items-center gap-2.5">
               <LockKeyhole className="w-4 h-4 text-amber-600 shrink-0" />
               <div className="text-xs">
                  <p className="font-bold text-amber-800 dark:text-amber-400">Submetido para Edição</p>
                  <p className="text-amber-700 dark:text-amber-500 font-medium leading-normal mt-0.5">
                     {!visita.synced 
                       ? 'Registo local offline. Correção permitida.'
                       : `Sincronizado. Limite de segurança: restam cerca de ${getRemainingEditMinutes()} minutos de edição.`}
                  </p>
               </div>
            </div>
         ) : (
            <div className="bg-slate-50 dark:bg-slate-800/20 border border-slate-200 dark:border-slate-800 rounded-xl p-3 flex items-center gap-2.5 opacity-80">
               <Lock className="w-4 h-4 text-slate-400 shrink-0" />
               <div className="text-xs">
                  <p className="font-bold text-slate-600 dark:text-slate-400">Registo Trancado</p>
                  <p className="text-slate-500 dark:text-slate-500 font-medium leading-normal mt-0.5">Sincronizado há mais de 1 hora. Modificações ou retificações inviabilizadas por regras de integridade.</p>
               </div>
            </div>
         )}

          {visita.locationAutoCaptured && (
             <div className="bg-emerald-50 dark:bg-emerald-950/10 border border-emerald-200 dark:border-emerald-900/30 rounded-xl p-3.5 flex items-start gap-2.5 shadow-3xs mb-4">
                <MapPin className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5 animate-bounce" />
                <div className="text-xs">
                   <p className="font-bold text-emerald-900 dark:text-emerald-400">Coordenadas GPS de Operador Atribuídas</p>
                   <p className="text-emerald-700 dark:text-emerald-500 font-medium leading-normal mt-0.5">
                      Este operador não possuía geolocalização. O ponto GPS atual foi capturado automaticamente nesta vistoria e associado com sucesso a <b>{firma?.name || 'este operador'}</b>!
                   </p>
                </div>
             </div>
          )}

         {/* Resumo */}
         <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800">
            <div className="flex items-start justify-between">
               <div>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 font-mono mb-1 shrink-0">
                     {visita.offlineCode || `#${visita.id?.slice(0, 8).toUpperCase()}`}
                  </p>
                  <button onClick={() => navigate(`/firmas/${visita.firmaId}`)} className="text-left group mb-4 cursor-pointer">
                     <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 leading-tight group-hover:text-blue-600 dark:group-hover:text-blue-450 transition-colors flex items-center gap-1">
                        {firma?.name || 'Firma Desconhecida'}
                        <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                     </h2>
                  </button>
               </div>
            </div>
            
            <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
               <div className="flex items-center gap-3">
                  <Calendar className="w-4 h-4 text-slate-400" />
                  <span className="font-medium text-slate-800 dark:text-slate-200">{visita.date} às {visita.time}</span>
               </div>
               
               {visita.atividadeEconomica && (
                  <div className="flex items-center gap-3">
                     <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded leading-none shrink-0 border border-slate-200 dark:border-slate-700">Em Vistoria</span>
                     <span className="font-medium text-blue-700 dark:text-blue-400 leading-snug">{visita.atividadeEconomica}</span>
                  </div>
               )}

               <div className="flex items-start gap-3">
                  <User className="w-4 h-4 text-slate-400 mt-1 shrink-0" />
                  <div className="flex flex-wrap gap-3">
                     {visita.technicians.map(t => {
                        const { initials, gradient } = getMemberAvatar(t);
                        return (
                           <div key={t} className="flex flex-col items-center gap-1">
                              <div className={cn(
                                 'w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-black shadow-sm bg-gradient-to-br',
                                 gradient
                              )}>
                                 {initials}
                              </div>
                              <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-400 text-center leading-tight max-w-[56px] truncate">{t.split(' ')[0]}</span>
                           </div>
                        );
                     })}
                  </div>
               </div>
               {visita.geolocation && (
                  <div className="flex items-center gap-3 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 p-2 rounded-lg -mx-2">
                     <MapPin className="w-4 h-4 shrink-0" />
                     <span className="text-xs font-mono">{visita.geolocation.lat.toFixed(5)}, {visita.geolocation.lng.toFixed(5)}</span>
                  </div>
               )}
            </div>
         </div>

         {/* Infrações */}
         {infracoes && infracoes.length > 0 ? (
            <div className="bg-red-50/50 dark:bg-red-950/15 p-5 rounded-2xl shadow-sm border border-red-200 dark:border-red-900/40 mt-6">
              <div className="flex items-center justify-between mb-4 border-b border-red-100 dark:border-red-900/30 pb-3">
                 <h3 className="font-bold text-red-900 dark:text-red-400 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-red-500" />
                    Infrações Constatadas
                 </h3>
                 <span className="bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-400 text-xs font-bold px-2.5 py-1 rounded-md">{infracoes?.length}</span>
              </div>
              <div className="space-y-3">
                 {infracoes.map(inf => (
                    <div key={inf.id} className="flex justify-between items-start border-b border-red-100 dark:border-red-900/20 pb-2 last:border-0 last:pb-0">
                       <span className="font-bold text-slate-800 dark:text-slate-200 flex-1 pr-2 leading-tight text-sm">{inf.type}</span>
                       <span className={cn(
                          "text-[10px] shrink-0 uppercase font-bold px-2 py-1 rounded leading-none",
                          inf.severity === 'Baixa' ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" :
                          inf.severity === 'Alta' ? "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400" : "bg-red-600 text-white dark:bg-red-900/50 dark:text-red-300"
                       )}>
                          {inf.severity}
                       </span>
                    </div>
                 ))}
              </div>
            </div>
         ) : (
            <div className="mt-6">
             <div className="flex items-center justify-between mb-3 px-1">
                <h3 className="font-bold text-[10px] uppercase tracking-widest text-slate-400 dark:text-slate-500 flex items-center gap-2">
                   <AlertTriangle className="w-3.5 h-3.5 text-slate-400" />
                   Infrações Constatadas
                </h3>
                <span className="bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold px-2 py-0.5 rounded-full">0</span>
             </div>
             <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-sm text-slate-500 dark:text-slate-400 text-center">
                   Nenhuma infração registada.
             </div>
            </div>
         )}

         {/* Recomendações */}
         {visita.recomendacoes && visita.recomendacoes.length > 0 && (
            <div className="bg-blue-50/50 dark:bg-blue-950/15 p-5 rounded-2xl shadow-sm border border-blue-200 dark:border-blue-900/30 mt-6 font-sans">
               <div className="flex items-center justify-between mb-4 border-b border-blue-100 dark:border-blue-900/20 pb-3">
                  <h3 className="font-bold text-blue-950 dark:text-blue-400 flex items-center gap-2">
                     <CheckCircle className="w-5 h-5 text-blue-600" />
                     Recomendações Registadas
                  </h3>
                  <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400 text-xs font-bold px-2.5 py-1 rounded-md">{visita.recomendacoes.length}</span>
               </div>
               <ul className="space-y-2.5 list-none">
                  {visita.recomendacoes.map((rec, i) => (
                     <li key={i} className="flex gap-2.5 items-start text-sm text-slate-700">
                        <span className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                        <span className="font-medium text-slate-800 dark:text-slate-200 leading-relaxed">{rec}</span>
                     </li>
                  ))}
               </ul>
            </div>
         )}

         {/* Anexos */}
         <div>
            <div className="flex items-center justify-between mb-3 px-1 mt-6">
               <h3 className="font-bold text-[10px] uppercase tracking-widest text-slate-400 dark:text-slate-500 flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5 text-blue-500" />
                  Notas e Anexos
               </h3>
               <span className="bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-350 text-xs font-bold px-2 py-0.5 rounded-full">{anexos?.length || 0}</span>
            </div>

            {visita.notes && (
               <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 mb-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">Observações</p>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">{visita.notes}</p>
               </div>
            )}

            {anexos && anexos.length > 0 && (
               <div className="grid grid-cols-2 gap-3 mb-4">
                  {anexos.map(anx => {
                     // Prioriza dados locais (base64), fallback para URL do servidor
                     const imgSrc = (anx.data && anx.data !== '') ? anx.data as string : (anx as any).url || null;
                     const isImage = anx.fileType.startsWith('image/');
                     const isVideo = anx.fileType.startsWith('video/');
                     return (
                        <div key={anx.id} className="bg-white dark:bg-slate-900 p-2 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                           {isImage && imgSrc ? (
                              <img src={imgSrc} alt={anx.fileName} className="w-full aspect-square object-cover rounded-lg" />
                           ) : isVideo && imgSrc ? (
                              <video src={imgSrc} controls className="w-full aspect-square object-cover rounded-lg bg-black" />
                           ) : (
                              <div className="w-full aspect-square bg-blue-50 dark:bg-blue-950/20 rounded-lg flex flex-col items-center justify-center text-blue-500 dark:text-blue-450 gap-2 border border-dashed border-blue-200 dark:border-blue-900/30">
                                 <FileText className="w-8 h-8" />
                                 <span className="text-[10px] uppercase font-bold truncate max-w-full px-2">{anx.fileName.split('.').pop()}</span>
                              </div>
                           )}
                           <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-2 truncate font-mono px-1">{anx.fileName}</p>
                        </div>
                     );
                  })}
               </div>
            )}
          </div>
       </div>

       {/* Barra de Ação Flutuante no Rodapé (Sticky Bottom Bar) */}
       <div className="border-t border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md p-4 sticky bottom-0 z-10 shrink-0 shadow-lg flex items-center justify-between gap-4">
          <div className="flex flex-col text-left min-w-0">
             <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block font-mono">
                Operador Económico
             </span>
             <span className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate max-w-[200px] md:max-w-xs leading-normal">
                {firma?.name || 'Carregando...'}
             </span>
          </div>
          <button
             onClick={() => navigate('/visitas/nova', { state: { firmaId: visita.firmaId } })}
             className="flex-1 max-w-xs md:max-w-sm py-3 bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 hover:from-blue-700 hover:via-indigo-700 hover:to-violet-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all shadow-md dark:shadow-none cursor-pointer uppercase tracking-wider"
          >
             <Plus className="w-4 h-4" />
             Nova Fiscalização
          </button>
       </div>

      {showEditModal && (
         <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
            <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90vh] border border-slate-200 dark:border-slate-800">
               {/* Header */}
               <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0 bg-slate-50 dark:bg-slate-800/40">
                  <div>
                     <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base">Retificar Fiscalização</h3>
                     <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Correção de auditoria pós-vistoria</p>
                  </div>
                  <button onClick={() => setShowEditModal(false)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 transition-all cursor-pointer">
                     <X className="w-5 h-5" />
                  </button>
               </div>

               {/* Modal Scroll Body */}
               <div className="p-5 space-y-5 overflow-y-auto custom-scrollbar flex-1">
                  
                  {/* Status Selection Cards */}
                  <div className="space-y-2">
                     <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block font-mono">Resultado da Vistoria</label>
                     <div className="grid grid-cols-3 gap-2">
                        {[
                           { val: 'Regularizado', label: 'Regularizado', desc: 'Sem infrações', color: 'border-emerald-200 text-emerald-800 bg-emerald-50/30 dark:border-emerald-900/30 dark:text-emerald-450 dark:bg-emerald-950/10 font-medium', activeColor: 'ring-2 ring-emerald-500 bg-emerald-50 border-emerald-500 dark:bg-emerald-950/30 dark:border-emerald-600' },
                           { val: 'Inconformes', label: 'Inconformes', desc: 'Anomalias leves', color: 'border-amber-200 text-amber-800 bg-amber-50/30 dark:border-amber-900/30 dark:text-amber-450 dark:bg-amber-950/10 font-medium', activeColor: 'ring-2 ring-amber-500 bg-amber-50 border-amber-500 dark:bg-amber-950/30 dark:border-amber-600' },
                           { val: 'Infrações', label: 'Infrações', desc: 'Falta gravíssima', color: 'border-red-200 text-red-800 bg-red-50/30 dark:border-red-900/30 dark:text-red-400 dark:bg-red-950/10' , activeColor: 'ring-2 ring-red-500 bg-red-50 border-red-500 font-bold dark:bg-red-950/30 dark:border-red-600' }
                        ].map(opt => {
                           const isSel = editStatus === opt.val;
                           return (
                              <button
                                 key={opt.val}
                                 type="button"
                                 onClick={() => setEditStatus(opt.val)}
                                 className={cn(
                                    "p-2.5 rounded-xl border text-left transition-all flex flex-col justify-between h-20 shadow-xs cursor-pointer",
                                    opt.color,
                                    isSel ? opt.activeColor : 'hover:bg-slate-50 dark:hover:bg-slate-850 border-slate-200 dark:border-slate-800'
                                 )}
                              >
                                 <span className="text-xs font-bold leading-none">{opt.label}</span>
                                 <span className="text-[9px] text-slate-500 dark:text-slate-400 leading-tight block mt-1">{opt.desc}</span>
                              </button>
                           );
                        })}
                     </div>
                  </div>

                  {/* Economic Activities list cards */}
                  <div className="space-y-2">
                     <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block font-mono">Atividade Económica Associada</label>
                     {firma?.atividades && firma.atividades.length > 0 ? (
                        <div className="space-y-2 max-h-40 overflow-y-auto p-1 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-850/30">
                           {firma.atividades.map(ativ => {
                              const title = `${ativ.atividade} (${ativ.ramo})`;
                              const isSel = editAtividade === title;
                              return (
                                 <button
                                    key={ativ.id}
                                    type="button"
                                    onClick={() => setEditAtividade(title)}
                                    className={cn(
                                       "w-full p-2.5 rounded-lg border text-left text-xs transition-all shadow-xs flex justify-between items-center bg-white dark:bg-slate-900 cursor-pointer",
                                       isSel 
                                         ? 'border-indigo-600 dark:border-indigo-400 ring-1 ring-indigo-500 font-semibold text-indigo-900 dark:text-indigo-250 bg-indigo-50/20 dark:bg-indigo-950/20' 
                                         : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-750'
                                    )}
                                 >
                                    <div className="pr-2 truncate">
                                       <p className="font-bold truncate">{ativ.atividade}</p>
                                       <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">{ativ.ramo} - {ativ.local}</p>
                                    </div>
                                    {isSel && <Check className="w-4 h-4 text-indigo-600 dark:text-indigo-450 shrink-0" />}
                                 </button>
                              );
                           })}
                        </div>
                     ) : (
                        <p className="text-xs text-slate-500 dark:text-slate-400 italic">Nenhuma atividade estruturada disponível.</p>
                     )}

                     <div className="space-y-1.5 mt-2">
                        <span className="text-[10px] text-slate-400 dark:text-slate-550 font-bold block scale-90 origin-left">Ou especifique outra atividade manualmente:</span>
                        <input
                           type="text"
                           value={editAtividade}
                           onChange={e => setEditAtividade(e.target.value)}
                           className="w-full text-xs p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 focus:outline-hidden focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500"
                           placeholder="Atividade / Setor de fiscalização..."
                        />
                     </div>
                  </div>

                  {/* Technicians */}
                  <div className="space-y-1">
                     <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block font-mono">Agentes / Oficiais (separados por vírgula)</label>
                     <input
                        type="text"
                        value={editTechnicians}
                        onChange={e => setEditTechnicians(e.target.value)}
                        className="w-full text-xs p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 focus:outline-hidden focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500"
                        placeholder="Ex: Agente Carvalho, Inspetor Lima"
                     />
                  </div>

                  {/* Notes */}
                  <div className="space-y-1">
                     <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block font-mono">Notas de Observação</label>
                     <textarea
                        rows={3}
                        value={editNotes}
                        onChange={e => setEditNotes(e.target.value)}
                        className="w-full text-xs p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 focus:outline-hidden focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 custom-scrollbar resize-none"
                        placeholder="Adicione observações para auditoria subsequente..."
                     />
                  </div>
               </div>

               {/* Footer */}
               <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-center justify-end gap-2 shrink-0">
                  <button
                     type="button"
                     onClick={() => setShowEditModal(false)}
                     className="px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-350 transition-colors cursor-pointer"
                  >
                     Cancelar
                  </button>
                  <button
                     type="button"
                     onClick={handleSaveEdit}
                     className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-lg shadow-indigo-100 dark:shadow-none transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                     <Save className="w-4 h-4" />
                     Guardar Retificação
                  </button>
               </div>
            </div>
         </div>
      )}
    </div>
  );
}
