import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { ArrowLeft, MapPin, Phone, Mail, User, ShieldAlert, Compass, Check, Crosshair, AlertTriangle, Map as MapIcon } from 'lucide-react';
import { cn } from '../lib/utils';
import { toast, customAlert } from '../lib/notifications';

export default function FirmaDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [showPontoModal, setShowPontoModal] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState<string>('firma'); // 'firma' or activity id
  const [isCapturing, setIsCapturing] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const firma = useLiveQuery(() => db.firmas.get(id!), [id]);
  const visitas = useLiveQuery(() => db.visitas.where('firmaId').equals(id!).toArray(), [id]);

  const canEditFirma = () => {
    if (!firma) return false;
    if (!firma.synced) return true;
    if (firma.createdAt) {
      const oneHourMs = 60 * 60 * 1000;
      return (Date.now() - firma.createdAt) < oneHourMs;
    }
    return false;
  };
  const infracoes = useLiveQuery(async () => {
    if (!visitas) return [];
    let allInfracoes: any[] = [];
    for (const v of visitas) {
      const infs = await db.infracoes.where('visitaId').equals(v.id!).toArray();
      allInfracoes.push(...infs.map(i => ({...i, date: v.date})));
    }
    return allInfracoes.sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [visitas]);

  const recomendacoesAberto = useLiveQuery(async () => {
    if (!visitas || visitas.length === 0) return [];
    
    // Sort visits by date/time ascending to trace chronologically
    const sortedVisitas = [...visitas].sort((a, b) => {
      const dateA = new Date(`${a.date}T${a.time || '00:00'}`).getTime();
      const dateB = new Date(`${b.date}T${b.time || '00:00'}`).getTime();
      return dateA - dateB;
    });

    // Map to track the status of each recommendation: key is "visitaId-text"
    const recMap = new Map<string, {
      text: string;
      visitaOrigemId: string;
      dataOrigem: string;
      equipaOrigem: string[];
      atendida: boolean;
    }>();

    for (const v of sortedVisitas) {
      // 1. Process new recommendations issued in this visit
      if (v.recomendacoes) {
        for (const rec of v.recomendacoes) {
          const key = `${v.id}-${rec}`;
          recMap.set(key, {
            text: rec,
            visitaOrigemId: v.id!,
            dataOrigem: v.date,
            equipaOrigem: v.technicians || [],
            atendida: false
          });
        }
      }

      // 2. Process evaluations of past recommendations in this visit
      if (v.recomendacoesHistoricas) {
        for (const rh of v.recomendacoesHistoricas) {
          const key = `${rh.visitaOrigemId}-${rh.text}`;
          if (recMap.has(key)) {
            const current = recMap.get(key)!;
            if (rh.atendida !== undefined && rh.atendida !== null) {
              recMap.set(key, {
                ...current,
                atendida: rh.atendida
              });
            }
          }
        }
      }
    }

    // Filter to only return the ones that are NOT resolved (atendida === false)
    const recs: {
      text: string;
      visitaOrigemId: string;
      dataOrigem: string;
      equipaOrigem: string[];
      atendida: boolean;
    }[] = [];

    recMap.forEach((val) => {
      recs.push(val);
    });

    return recs
      .filter(r => !r.atendida)
      .sort((a, b) => new Date(b.dataOrigem).getTime() - new Date(a.dataOrigem).getTime());
  }, [visitas]);

  const handleCapturePonto = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocalização não é suportada por este dispositivo.');
      return;
    }
    setIsCapturing(true);
    setSuccessMsg('');
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        if (!firma) return;

        if (selectedTarget === 'firma') {
          await db.firmas.update(firma.id!, {
            geolocation: { lat: latitude, lng: longitude },
            synced: false
          });
        } else {
          const updatedAtividades = (firma.atividades || []).map(ativ => {
            if (ativ.id === selectedTarget) {
              return { ...ativ, geolocation: { lat: latitude, lng: longitude } };
            }
            return ativ;
          });
          await db.firmas.update(firma.id!, {
            atividades: updatedAtividades,
            synced: false
          });
        }

        setIsCapturing(false);
        setSuccessMsg('Coordenadas de GPS gravadas com sucesso!');
        setTimeout(() => {
          setShowPontoModal(false);
          setSuccessMsg('');
        }, 1500);
      },
      (error) => {
        setIsCapturing(false);
        toast.error('Erro ao capturar as coordenadas de GPS. Por favor, conceda permissão de localização.');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  let nivelRecorrencia = 'Limpo';
  let badgeColor = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400';
  if (visitas && infracoes) {
    const visitasComInfracao = visitas.filter(v => v.status === 'Infrações').length;
    if (visitasComInfracao === 1) {
      nivelRecorrencia = 'Com Infrações';
      badgeColor = 'bg-amber-100 text-amber-800 dark:bg-amber-950/30 dark:text-amber-400';
    } else if (visitasComInfracao === 2) {
      nivelRecorrencia = 'Reincidente';
      badgeColor = 'bg-orange-100 text-orange-800 dark:bg-orange-950/30 dark:text-orange-400';
    } else if (visitasComInfracao > 2) {
      nivelRecorrencia = 'Multi Reincidente';
      badgeColor = 'bg-red-100 text-red-800 dark:bg-red-950/30 dark:text-red-400';
    }
  }

  if (!firma) return <div className="p-4 text-center mt-10 dark:text-slate-400">Carregando...</div>;

  return (
    <div className="flex flex-col h-full bg-[#F5F7FA] dark:bg-slate-950 relative">
      <div className="bg-white dark:bg-slate-900 px-4 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0 sticky top-0 z-10 hidden md:block">
         <button onClick={() => navigate(-1)} className="flex items-center text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 font-medium tracking-wide">
            <ArrowLeft className="w-5 h-5 mr-2" /> Voltar
         </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6 pb-20 custom-scrollbar">
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 relative overflow-hidden">
          {firma.geolocation && (
             <div className="absolute top-4 right-4 bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-400 text-[10px] font-bold px-2 py-1 rounded-full flex items-center gap-1 border border-blue-100 dark:border-blue-900/30">
                <Compass className="w-3 h-3 animate-spin duration-3000" />
                <span>GPS Ativo</span>
             </div>
          )}
          <div className="w-16 h-16 bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-450 rounded-2xl flex items-center justify-center font-bold text-2xl mb-4 border border-blue-100 dark:border-blue-900/30 shadow-sm">
            {(firma.name || '?').substring(0, 2).toUpperCase()}
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 leading-tight">{firma.name}</h2>
          <div className="mt-2 flex items-center justify-between">
             <span className={cn("text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded", badgeColor)}>
                {nivelRecorrencia}
             </span>
          </div>
          <div className="flex items-center justify-between mt-4 grid grid-cols-2 gap-y-4 gap-x-2 text-sm">
            <div>
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">NIF</p>
              <p className="font-medium text-slate-800 dark:text-slate-200">{firma.nif || 'Informal'}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Tipo</p>
              <p className="font-medium text-slate-800 dark:text-slate-200">{firma.type}</p>
            </div>
            <div className="col-span-2">
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Distrito</p>
              <p className="font-medium text-slate-800 dark:text-slate-200">{firma.district}</p>
            </div>
            {firma.geolocation && (
              <div className="col-span-2 bg-slate-50 dark:bg-slate-800/20 p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-400 font-mono flex items-center gap-2">
                 <MapPin className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                 <span>Firma: {firma.geolocation.lat.toFixed(6)}, {firma.geolocation.lng.toFixed(6)}</span>
              </div>
            )}
          </div>
          
          <div className="grid grid-cols-2 gap-3 mt-6">
             <button 
                onClick={() => navigate('/visitas/nova', { state: { firmaId: firma.id } })}
                className="py-3 bg-blue-600 text-white rounded-xl text-xs font-bold shadow-lg shadow-blue-200 dark:shadow-none hover:bg-blue-700 transition-colors uppercase tracking-wide flex items-center justify-center gap-2 cursor-pointer"
             >
                <ShieldAlert className="w-4 h-4" />
                Fiscalizar
             </button>
             <button 
                onClick={() => {
                   if (!canEditFirma()) {
                      customAlert.warning('Operação Bloqueada', 'Esta firma foi registada e sincronizada com o servidor há mais de 1 hora. A alteração de dados de geolocalização está permanentemente bloqueada.');
                      return;
                   }
                   setSelectedTarget('firma');
                   setShowPontoModal(true);
                }}
                className={cn(
                   "py-3 rounded-xl text-xs font-bold border transition-all uppercase tracking-wide flex items-center justify-center gap-2 cursor-pointer",
                   canEditFirma() 
                     ? "bg-indigo-50 dark:bg-indigo-950/20 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/30 border-indigo-100 dark:border-indigo-900/30 shadow-sm"
                     : "bg-slate-100 dark:bg-slate-850 text-slate-400 dark:text-slate-600 border-slate-200 dark:border-slate-800 cursor-not-allowed opacity-75"
                )}
                title={canEditFirma() ? "Atualizar ponto de GPS" : "Edição bloqueada"}
              >
                <Crosshair className="w-4 h-4" />
                Atualizar Ponto
             </button>

             <button
                onClick={() => navigate('/mapa', { state: { selectedFirmaId: firma.id } })}
                className="col-span-2 py-3 bg-slate-900 dark:bg-slate-800 text-white hover:bg-slate-800 dark:hover:bg-slate-700 rounded-xl text-xs font-bold shadow-lg shadow-slate-900/10 dark:shadow-none transition-colors uppercase tracking-wide flex items-center justify-center gap-2 cursor-pointer"
             >
                <MapIcon className="w-4 h-4 text-emerald-400" />
                Visualizar no Mapa Geral
             </button>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 space-y-4">
          <h3 className="font-bold text-slate-900 dark:text-slate-100 mb-2">Detalhes de Contacto</h3>
          
          <div className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-350">
            <div className="w-8 h-8 rounded-full bg-slate-50 dark:bg-slate-800 flex items-center justify-center shrink-0"><MapPin className="w-4 h-4 text-slate-500 dark:text-slate-400"/></div>
            <span>{firma.address || 'Não especificado'}</span>
          </div>
          
          <div className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-350">
            <div className="w-8 h-8 rounded-full bg-slate-50 dark:bg-slate-800 flex items-center justify-center shrink-0"><Phone className="w-4 h-4 text-slate-500 dark:text-slate-400"/></div>
            <span>{firma.contact || 'S/ Contato'}</span>
          </div>

          <div className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-350">
            <div className="w-8 h-8 rounded-full bg-slate-50 dark:bg-slate-800 flex items-center justify-center shrink-0"><Mail className="w-4 h-4 text-slate-500 dark:text-slate-400"/></div>
            <span className="truncate">{firma.email || 'S/ Email'}</span>
          </div>

          <div className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-350">
            <div className="w-8 h-8 rounded-full bg-slate-50 dark:bg-slate-800 flex items-center justify-center shrink-0"><User className="w-4 h-4 text-slate-500 dark:text-slate-400"/></div>
            <div>
               <p className="font-medium text-slate-900 dark:text-slate-100">{firma.representant || 'N/A'}</p>
               <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-0.5">{firma.representantCargo || 'Representante'} ({firma.representantNacionalidade || 'Não informada'})</p>
            </div>
          </div>
        </div>

        {firma.atividades && firma.atividades.length > 0 && (
           <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                 <h3 className="font-bold text-slate-900 dark:text-slate-100">Atividades Económicas Detalhadas</h3>
                 <span className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-350 text-xs font-bold px-2 py-0.5 rounded-full">{firma.atividades.length}</span>
              </div>
              <div className="space-y-4 mt-3">
                {firma.atividades.map((ativ, i) => (
                   <div key={ativ.id || i} className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850/30 space-y-3">
                      <div className="flex justify-between items-start">
                         <div>
                            <p className="font-bold text-slate-900 dark:text-slate-100 text-sm leading-tight">{ativ.atividade || 'Atividade geral'}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1"><span className="font-bold text-slate-600 dark:text-slate-350 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded mr-1">Ramo</span> {ativ.ramo}</p>
                         </div>
                         <span className="text-[10px] font-bold uppercase py-0.5 px-2 bg-blue-50 dark:bg-blue-950/20 text-blue-700 dark:text-blue-400 border border-blue-100 dark:border-blue-900/30 rounded">Atividade #{i + 1}</span>
                      </div>
                      <div className="text-xs text-slate-600 dark:text-slate-350 bg-white dark:bg-slate-900 p-2.5 rounded-lg border border-slate-100 dark:border-slate-800 space-y-1">
                         <span className="font-semibold block text-slate-400 dark:text-slate-500 text-[9px] uppercase tracking-wider">Local Específico</span>
                         <p className="font-medium text-slate-700 dark:text-slate-300">{ativ.local || 'Não detalhado'}</p>
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t border-slate-100/70 dark:border-slate-800">
                         {ativ.geolocation ? (
                            <button 
                               onClick={() => navigate('/mapa', { state: { selectedFirmaId: firma.id, selectedAtividadeId: ativ.id } })}
                               className="text-[10px] text-emerald-700 dark:text-emerald-400 hover:text-emerald-950 dark:hover:text-emerald-300 font-mono flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-950/20 hover:bg-emerald-100 dark:hover:bg-emerald-950/40 px-2.5 py-1 rounded-md border border-emerald-200 dark:border-emerald-900/30 transition-colors shadow-3xs cursor-pointer"
                               title="Ver rota e localização desta atividade no mapa geral"
                            >
                               <MapIcon className="w-3.5 h-3.5 text-emerald-600 animate-pulse" />
                               <span>{ativ.geolocation.lat.toFixed(5)}, {ativ.geolocation.lng.toFixed(5)}</span>
                            </button>
                         ) : (
                            <div className="text-[10px] text-slate-400 dark:text-slate-500 font-medium flex items-center gap-1 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
                               <MapPin className="w-3 h-3 text-slate-300" />
                               <span>Sem ponto GPS específico</span>
                            </div>
                         )}
                         <button 
                            onClick={() => {
                               if (!canEditFirma()) {
                                  customAlert.warning('Operação Bloqueada', 'Esta firma foi registada e sincronizada com o servidor há mais de 1 hora. A alteração de dados de geolocalização está permanentemente bloqueada.');
                                  return;
                               }
                               setSelectedTarget(ativ.id || 'firma');
                               setShowPontoModal(true);
                            }}
                            className={cn(
                               "text-[11px] font-bold py-1 px-2 rounded transition-colors flex items-center gap-1 cursor-pointer",
                               canEditFirma()
                                 ? "text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/30"
                                 : "text-slate-400 dark:text-slate-600 cursor-not-allowed opacity-60"
                            )}
                            title={canEditFirma() ? "Editar geolocalização desta atividade" : "Edição bloqueada"}
                         >
                            <Crosshair className="w-3 h-3" />
                            {ativ.geolocation ? 'Alterar GPS' : 'Marcar GPS'}
                         </button>
                      </div>
                   </div>
                ))}
              </div>
           </div>
        )}

        {infracoes && infracoes.length > 0 && (
           <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl shadow-sm border border-red-200 dark:border-red-900/40 space-y-4 bg-red-50/30 dark:bg-red-950/10 font-sans">
              <div className="flex items-center justify-between border-b border-red-100 dark:border-red-900/30 pb-2">
                 <h3 className="font-bold text-red-900 dark:text-red-400">Infrações de Vistorias ({infracoes.length})</h3>
                 <ShieldAlert className="w-5 h-5 text-red-500" />
              </div>
              <ul className="space-y-3 mt-3">
                {infracoes.map((inf, i) => (
                   <li key={i} className="text-sm border-b border-red-100 dark:border-red-900/20 pb-2 last:border-0 last:pb-0">
                      <div className="flex justify-between items-start">
                         <p className="font-bold text-slate-800 dark:text-slate-205 flex-1 pr-2 leading-tight">{inf.type}</p>
                         <span className={cn(
                            "text-[10px] uppercase font-bold px-2 py-1 rounded shrink-0 leading-none",
                            inf.severity === 'Baixa' ? "bg-amber-100 text-amber-800 dark:bg-amber-950/30 dark:text-amber-450" :
                            inf.severity === 'Alta' ? "bg-orange-100 text-orange-800 dark:bg-orange-950/30 dark:text-orange-455" : "bg-red-600 text-white dark:bg-red-700"
                         )}>{inf.severity}</span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Data: {inf.date}</p>
                   </li>
                ))}
              </ul>
           </div>
        )}

        {recomendacoesAberto && recomendacoesAberto.length > 0 && (
           <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl shadow-sm border border-amber-200 dark:border-amber-900/40 bg-amber-50/20 dark:bg-amber-950/10 font-sans space-y-4">
              <div className="flex items-center justify-between border-b border-amber-100 dark:border-amber-900/30 pb-2">
                 <h3 className="font-bold text-amber-900 dark:text-amber-400 flex items-center gap-1.5">
                    <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 animate-pulse" />
                    Recomendações em Aberto ({recomendacoesAberto.length})
                 </h3>
              </div>
              <ul className="space-y-3 mt-3">
                {recomendacoesAberto.map((rec, i) => (
                   <li key={i} className="text-xs bg-white dark:bg-slate-900 p-3 rounded-xl border border-amber-100/70 dark:border-amber-900/30 text-slate-700 dark:text-slate-300 leading-relaxed shadow-3xs flex gap-2">
                      <span className="text-amber-500 font-extrabold">•</span>
                      <div className="flex-1">
                         <p className="font-semibold text-slate-800 dark:text-slate-205">{rec.text}</p>
                         <p className="text-[10px] text-slate-400 dark:text-slate-550 mt-1 font-mono">
                            Emitida em: {rec.dataOrigem} por {rec.equipaOrigem.join(', ')}
                         </p>
                      </div>
                   </li>
                ))}
              </ul>
           </div>
        )}

        <div>
           <div className="flex items-center justify-between mb-4 px-1">
              <h3 className="font-bold text-slate-900 dark:text-slate-100">Histórico de Visitas</h3>
              <span className="bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-350 text-xs font-bold px-2 py-0.5 rounded-full">{visitas?.length || 0}</span>
           </div>
           
           <div className="space-y-3">
              {visitas?.length === 0 ? (
                 <div className="text-center py-6 text-slate-500 dark:text-slate-400 text-sm bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                    Nenhuma visita registada.
                 </div>
              ) : (
                 visitas?.map(v => (
                    <div key={v.id} onClick={() => navigate(`/visitas/${v.id}`)} className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-850/50">
                       <div>
                          <p className="font-bold text-slate-800 dark:text-slate-200 text-sm">{v.date} às {v.time}</p>
                          <div className="flex items-center gap-1 mt-1 text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
                             <ShieldAlert className="w-3.5 h-3.5" />
                             <span>{v.technicians.length} técnico(s)</span>
                          </div>
                       </div>
                       <span className={cn(
                          "text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-md",
                          v.status === 'Inconformes' ? "bg-amber-100 text-amber-800 dark:bg-amber-950/30 dark:text-amber-450" :
                          v.status === 'Infrações' ? "bg-red-100 text-red-800 dark:bg-red-950/30 dark:text-red-450" :
                          "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-450"
                       )}>
                          {v.status}
                       </span>
                    </div>
                 ))
              )}
           </div>
        </div>

      </div>

      {/* Modern, Bottom-Sheet Style Choice Modal for updating point */}
      {showPontoModal && (
         <div className="fixed inset-0 bg-slate-950/60 z-50 flex flex-col justify-end">
            <div className="bg-white dark:bg-slate-900 rounded-t-3xl border-t border-slate-200 dark:border-slate-800 p-6 space-y-6 animate-in slide-in-from-bottom duration-300">
               <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div>
                     <h3 className="font-bold text-slate-900 dark:text-slate-105 text-base">Atualização de Ponto Geográfico</h3>
                     <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Selecione onde deseja vincular a coordenada GPS actual.</p>
                  </div>
                  <button 
                     onClick={() => setShowPontoModal(false)}
                     className="p-1 px-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 rounded-full text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 font-bold text-sm cursor-pointer"
                  >
                     Fechar
                  </button>
               </div>

               {successMsg ? (
                  <div className="py-8 text-center space-y-2">
                     <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto text-lg">
                        <Check className="w-6 h-6 stroke-[3]" />
                     </div>
                     <p className="font-bold text-slate-800 dark:text-slate-200 text-sm">{successMsg}</p>
                  </div>
               ) : (
                  <>
                     <div className="space-y-2 max-h-[40vh] overflow-y-auto custom-scrollbar">
                        <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest pl-1 block mb-2">Destino do Ponto</label>
                        
                        {/* Option: General Firm */}
                        <div 
                           onClick={() => setSelectedTarget('firma')}
                           className={cn(
                              "p-4 border rounded-xl cursor-pointer transition-all flex items-start gap-3",
                              selectedTarget === 'firma' ? "bg-blue-50 dark:bg-blue-950/20 border-blue-500 dark:border-blue-700 shadow-sm" : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-850/50"
                           )}
                        >
                           <div className={cn("w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-0.5", selectedTarget === 'firma' ? "bg-blue-600 border-blue-600" : "border-slate-300")}>
                              {selectedTarget === 'firma' && <div className="w-2 h-2 bg-white rounded-full" />}
                           </div>
                           <div className="flex-1 min-w-0">
                              <p className={cn("font-bold text-sm", selectedTarget === 'firma' ? "text-blue-900 dark:text-blue-300" : "text-slate-800 dark:text-slate-200")}>Firma (Geral)</p>
                              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Registrar position na sede de {firma.name}</p>
                              {firma.geolocation && <p className="text-[10px] font-mono text-blue-600 dark:text-blue-400 mt-1">Atual: {firma.geolocation.lat.toFixed(5)}, {firma.geolocation.lng.toFixed(5)}</p>}
                           </div>
                        </div>

                        {/* Options: Activities */}
                        {firma.atividades && firma.atividades.map((ativ, i) => (
                           <div 
                              key={ativ.id || i}
                              onClick={() => setSelectedTarget(ativ.id || 'firma')}
                              className={cn(
                                 "p-4 border rounded-xl cursor-pointer transition-all flex items-start gap-3",
                                 selectedTarget === ativ.id ? "bg-blue-50 dark:bg-blue-950/20 border-blue-500 dark:border-blue-700 shadow-sm" : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-850/50"
                              )}
                           >
                              <div className={cn("w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-0.5", selectedTarget === ativ.id ? "bg-blue-600 border-blue-600" : "border-slate-300")}>
                                 {selectedTarget === ativ.id && <div className="w-2 h-2 bg-white rounded-full" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                 <p className={cn("font-bold text-sm", selectedTarget === ativ.id ? "text-blue-900 dark:text-blue-300" : "text-slate-800 dark:text-slate-200")}>{ativ.atividade || `Atividade #${i + 1}`}</p>
                                 <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{ativ.ramo} • {ativ.local}</p>
                                 {ativ.geolocation && <p className="text-[10px] font-mono text-indigo-600 dark:text-indigo-400 mt-1">Atual: {ativ.geolocation.lat.toFixed(5)}, {ativ.geolocation.lng.toFixed(5)}</p>}
                              </div>
                           </div>
                        ))}
                     </div>

                     <button 
                        onClick={handleCapturePonto}
                        disabled={isCapturing}
                        className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-100 dark:shadow-none text-sm tracking-wide uppercase transition-colors flex items-center justify-center gap-2 cursor-pointer"
                     >
                        <Compass className={cn("w-4 h-4", isCapturing && "animate-spin")} />
                        {isCapturing ? 'Obtendo Sinal de Satélite...' : 'Capturar Coordenadas Actuais'}
                     </button>
                  </>
               )}
            </div>
         </div>
      )}
    </div>
  );
}
