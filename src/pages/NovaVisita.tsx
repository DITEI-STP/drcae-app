import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { db, generateId, Visita, Infracao, Anexo } from '../db/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, MapPin, Camera, Image as ImageIcon, X, Check, Map, CheckCircle, Search, Plus, Users, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '../lib/utils';

export default function NovaVisita() {
  const navigate = useNavigate();
  const locationState = useLocation().state as { firmaId?: string } | null;
  const firmas = useLiveQuery(() => db.firmas.toArray());

  const isEquipeDefinida = localStorage.getItem('drcae_equipe_definida') === 'true';

  if (!isEquipeDefinida) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 bg-slate-50 min-h-screen font-sans">
         <div className="bg-white rounded-3xl border border-slate-200 shadow-xl max-w-md w-full overflow-hidden p-8 space-y-6 text-center">
            <div className="w-16 h-16 bg-amber-50 border border-amber-200 text-amber-600 rounded-2xl flex items-center justify-center mx-auto shadow-sm animate-bounce">
               <AlertTriangle className="w-8 h-8 animate-pulse" />
            </div>
            <div className="space-y-2">
               <h3 className="text-xl font-extrabold text-slate-900 tracking-tight">Definição de Equipa Obrigatória</h3>
               <p className="text-xs text-slate-500 leading-relaxed font-semibold">
                  De acordo com os protocolos jurídicos da <b>DRCAE</b>, é estritamente obrigatório definir e validar a composição da equipa de agentes destacados para o serviço diário, pelo menos uma vez, antes de proceder ao registo de nova fiscalização ou cadastro de operador económico.
               </p>
            </div>
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-start gap-3">
               <div className="w-6 h-6 bg-amber-100 rounded-full flex items-center justify-center shrink-0 text-amber-700 font-bold text-xs font-mono">!</div>
               <p className="text-[11px] text-slate-600 font-semibold text-left leading-normal">
                  Esta medida de conformidade garante que as contraordenações e atas emitidas possuam força jurídica probatória inequívoca.
               </p>
            </div>
            <button
               onClick={() => navigate('/equipe')}
               className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-100 uppercase tracking-widest transition-colors flex items-center justify-center gap-2"
            >
               <Users className="w-4 h-4 text-white" />
               Configurar Equipa Técnica
            </button>
         </div>
      </div>
    );
  }
  
  const [step, setStep] = useState(1);
  const [firmaId, setFirmaId] = useState(locationState?.firmaId || '');
  const [representante, setRepresentante] = useState('');
  const [atividadeEconomica, setAtividadeEconomica] = useState('');
  
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [time, setTime] = useState(format(new Date(), 'HH:mm'));
  const [technicians, setTechnicians] = useState<string[]>(() => {
    const saved = localStorage.getItem('drcae_equipe');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return ['Agente Carvalho', 'Agente Silva'];
      }
    }
    return ['Agente Carvalho', 'Agente Silva'];
  });
  const [newTechName, setNewTechName] = useState('');
  const [location, setLocation] = useState<{lat: number, lng: number} | null>(null);

  const [infracoes, setInfracoes] = useState<{type: string, severity: string}[]>([]);
  
  const [recomendacoes, setRecomendacoes] = useState<string[]>([]);
  const [customRecommendation, setCustomRecommendation] = useState('');
  const [searchInfracao, setSearchInfracao] = useState('');
  
  const [notes, setNotes] = useState('');
  const [anexos, setAnexos] = useState<{file: File, url: string}[]>([]);
  const [selectedPreview, setSelectedPreview] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState('');

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        err => console.error(err),
        { enableHighAccuracy: true, timeout: 5000 }
      );
    }
  }, []);

  useEffect(() => {
    if (firmaId && firmas) {
      const f = firmas.find(x => x.id === firmaId);
      if (f && f.representant) setRepresentante(f.representant);
      if (f && f.atividades && f.atividades.length > 0) {
        setAtividadeEconomica(f.atividades[0].atividade);
      }
    }
  }, [firmaId, firmas]);

  const handleNext = () => setStep(s => Math.min(6, s + 1));
  const handlePrev = () => setStep(s => Math.max(1, s - 1));

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files).map((file: any) => ({
         file,
         url: URL.createObjectURL(file)
      }));
      setAnexos(prev => [...prev, ...newFiles]);
    }
  };

  const removeAnexo = (index: number) => {
    setAnexos(prev => {
      const copy = [...prev];
      URL.revokeObjectURL(copy[index].url);
      copy.splice(index, 1);
      return copy;
    });
  };

  const handleSubmit = async () => {
    const visitaId = generateId();
    
    let status = 'Regularizado';
    if (infracoes.length > 0) {
      const hasCritical = infracoes.some(i => i.severity === 'Crítica' || i.severity === 'Alta');
      status = hasCritical ? 'Infrações' : 'Inconformes';
    }

    let autoCaptured = false;
    const targetFirma = firmas?.find(f => f.id === firmaId);
    if (targetFirma && location) {
      const hasFirmaCoords = !!targetFirma.geolocation;
      const targetAtivIdx = (targetFirma.atividades || []).findIndex(a => a.atividade === atividadeEconomica);
      const hasAtivCoords = targetAtivIdx > -1 && !!targetFirma.atividades?.[targetAtivIdx].geolocation;

      if (!hasFirmaCoords || !hasAtivCoords) {
        autoCaptured = true;
        const updatedAtividades = (targetFirma.atividades || []).map((ativ, idx) => {
          if (idx === targetAtivIdx || ativ.atividade === atividadeEconomica) {
            return {
              ...ativ,
              geolocation: ativ.geolocation || { lat: location.lat, lng: location.lng }
            };
          }
          return ativ;
        });

        const updatedFirma = {
          ...targetFirma,
          geolocation: targetFirma.geolocation || { lat: location.lat, lng: location.lng },
          atividades: updatedAtividades,
          synced: false
        };

        await db.firmas.put(updatedFirma);
        await db.syncQueue.add({
          entity: 'firma',
          action: 'update',
          entityId: targetFirma.id!,
          payload: updatedFirma,
          timestamp: Date.now()
        });
      }
    }

    const visita: Visita = {
      id: visitaId,
      firmaId,
      date,
      time,
      technicians,
      status,
      atividadeEconomica,
      geolocation: location,
      synced: false,
      recomendacoes: recomendacoes,
      createdAt: Date.now(),
      locationAutoCaptured: autoCaptured
    };

    const infs: Infracao[] = infracoes.map(i => ({
      id: generateId(),
      visitaId,
      type: i.type,
      severity: i.severity,
      synced: false
    }));

    // Save Visita
    await db.visitas.add(visita);
    await db.syncQueue.add({ entity: 'visita', action: 'create', entityId: visitaId, payload: visita, timestamp: Date.now() });

    // Save Infrações
    for (const inf of infs) {
      await db.infracoes.add(inf);
      await db.syncQueue.add({ entity: 'infracao', action: 'create', entityId: inf.id!, payload: inf, timestamp: Date.now() });
    }

    // Save Anexos (Convert to base64 for dexie)
    for (const anx of anexos) {
      const reader = new FileReader();
      const p = new Promise<void>((resolve) => {
        reader.onloadend = async () => {
          const anexo: Anexo = {
            id: generateId(),
            visitaId,
            fileName: anx.file.name,
            fileType: anx.file.type,
            data: reader.result as string,
            notes,
            synced: false
          };
          await db.anexos.add(anexo);
          await db.syncQueue.add({ entity: 'anexo', action: 'create', entityId: anexo.id!, payload: anexo, timestamp: Date.now() });
          resolve();
        };
      });
      reader.readAsDataURL(anx.file);
      await p;
    }

    navigate(`/visitas/${visitaId}`, { replace: true });
  };

  const predefinedInfracoes = [
    { 
      type: 'Decomposição / Falta de Higiene Alimentar',
      legalInstrument: 'Decreto-Lei nº 41/2014, Artigo 8º',
      details: 'Falta de higienização ou desinfestação regular das superfícies, equipamentos e utensílios de preparação alimentar.',
      severity: 'Crítica'
    },
    { 
      type: 'Ausência de Licença / Alvará de Exercício',
      legalInstrument: 'Lei das Atividades Económicas, Artigo 22º',
      details: 'Exercício de atividade comercial ou industrial sem a competente licença municipal ou alvará de funcionamento.',
      severity: 'Alta'
    },
    { 
      type: 'Falta de Afixação de Preços para utentes',
      legalInstrument: 'Decreto-Lei nº 22/2016, Artigo 5º',
      details: 'Não disponibilização ou não afixação de preços visíveis aos consumidores nos artigos expostos para venda.',
      severity: 'Baixa'
    },
    { 
      type: 'Bens Alimentares com Prazo Expirado',
      legalInstrument: 'Regulamento da Qualidade Alimentar, Artigo 14º',
      details: 'Detetar ou manter expostos ao público produtos alimentares cujo prazo de consumo ou validade se encontra ultrapassado.',
      severity: 'Crítica'
    },
    { 
      type: 'Obstrução de Atividade Fiscalizadora',
      legalInstrument: 'Código de Fiscalização Económica, Artigo 45º',
      details: 'Recusa no fornecimento de acesso físico às instalações ou não apresentação imediata da documentação fiscal exigível.',
      severity: 'Alta'
    },
    { 
      type: 'Ausência de Livro de Reclamações Físico',
      legalInstrument: 'Regulamento de Proteção ao Consumidor, Artigo 3º',
      details: 'Inexistência ou indisponibilidade de livro de reclamações físico oficial homologado no estabelecimento.',
      severity: 'Baixa'
    }
  ];

  const predefinedRecomendacoes = [
    "Proceder com a desinfestação imediata das zonas de armazenamento e de cozinha no prazo de 48 horas.",
    "Afixar a tabela oficial de preços num local perfeitamente visível para os utentes/clientes.",
    "Regularizar a situação do licenciamento/alvará de exercício junto dos serviços da Câmara Municipal.",
    "Disponibilizar o livro de reclamações homologado e instruir os funcionários para a sua disponibilização obrigatória.",
    "Substituir e retirar de circulação ou de exposição todos os bens alimentares fora da validade.",
    "Garantir o uso obrigatório de vestuário de proteção individual adequado (toucas, aventais, calçado adequado).",
    "Adaptar os sistemas de refrigeração para garantir a conservação de alimentos perecíveis nas temperaturas adequadas."
  ];

  const toggleInfracao = (type: string, severity: string) => {
    setInfracoes(prev => {
      const exists = prev.find(i => i.type === type);
      if (exists) return prev.filter(i => i.type !== type);
      return [...prev, { type, severity }];
    });
  };

  return (
    <div className="flex flex-col h-full bg-[#F5F7FA] relative">
      {/* Header */}
      <div className="px-4 py-4 border-b border-slate-200 shrink-0 sticky top-0 bg-white z-10 flex items-center justify-between">
         <div className="flex items-center">
            <button onClick={() => navigate(-1)} className="mr-3 text-slate-500 hover:text-slate-900">
               <ArrowLeft className="w-5 h-5" />
            </button>
            <h2 className="font-bold text-slate-900 tracking-tight">Nova Visita</h2>
         </div>
         <div className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded-md">
            PASSO {step}/6
         </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-slate-200 h-1">
         <div className="bg-blue-600 h-1 transition-all duration-300" style={{ width: `${(step/6)*100}%` }}></div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 pb-24 custom-scrollbar">
        {/* STEP 1 */}
        {step === 1 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col h-full min-h-[400px]">
             <div className="space-y-3 shrink-0">
               <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center justify-between">
                 Operador Económico / Firma
               </label>
               <div className="relative">
                 <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                 <input 
                   type="text"
                   placeholder="Procurar firma por nome..."
                   className="w-full pl-9 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 text-sm font-medium text-slate-800"
                   value={search}
                   onChange={e => setSearch(e.target.value)}
                 />
               </div>
               
               <div className="flex items-center justify-between mt-2">
                 <p className="text-xs text-slate-500 font-medium">
                   {firmas?.filter(f => f.name.toLowerCase().includes(search.toLowerCase())).length || 0} firmas
                 </p>
                 <button 
                   onClick={() => navigate('/firmas/nova', { state: { returnTo: '/visitas/nova' } })}
                   className="text-xs font-bold text-blue-600 flex items-center gap-1 hover:text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg"
                 >
                   <Plus className="w-3.5 h-3.5" />
                   NOVA FIRMA
                 </button>
               </div>
             </div>

             <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar mt-2">
                 {firmas?.filter(f => f.name.toLowerCase().includes(search.toLowerCase())).map(f => (
                   <div 
                     key={f.id} 
                     onClick={() => setFirmaId(f.id!)}
                     className={cn(
                       "p-4 rounded-xl border cursor-pointer transition-all flex items-start gap-3",
                       firmaId === f.id ? "bg-blue-50 border-blue-200 shadow-sm" : "bg-slate-50 border-slate-200 hover:bg-slate-100"
                     )}
                   >
                     <div className={cn("w-5 h-5 rounded-full border flex flex-col items-center justify-center shrink-0 mt-0.5", firmaId === f.id ? "bg-blue-600 border-blue-600 text-white" : "bg-white border-slate-300")}>
                        {firmaId === f.id && <Check className="w-3 h-3" />}
                     </div>
                     <div>
                       <p className={cn("font-bold text-sm leading-tight", firmaId === f.id ? "text-blue-900" : "text-slate-800")}>{f.name}</p>
                       <p className={cn("text-[10px] uppercase font-bold tracking-widest mt-1", firmaId === f.id ? "text-blue-600" : "text-slate-400")}>NIF: {f.nif}</p>
                     </div>
                   </div>
                 ))}
             </div>

             <div className="space-y-4 shrink-0 pt-4 border-t border-slate-100">
               <div className="space-y-2">
                 <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Representante no Local</label>
                 <input 
                   type="text" 
                   value={representante}
                   onChange={e => setRepresentante(e.target.value)}
                   placeholder="Nome do representante..."
                   className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 text-sm font-medium text-slate-800"
                 />
               </div>
               
               {firmaId && (
                 <div className="space-y-2">
                   <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Atividade Económica em Vistoria</label>
                   {(() => {
                      const f = firmas?.find(x => x.id === firmaId);
                      if (f && f.atividades && f.atividades.length > 0) {
                        return (
                          <div className="space-y-2">
                             {f.atividades.map((ativ, i) => (
                                <div 
                                   key={i}
                                   onClick={() => setAtividadeEconomica(ativ.atividade)}
                                   className={cn("p-4 border rounded-xl cursor-pointer transition-colors relative", atividadeEconomica === ativ.atividade ? "bg-blue-50 border-blue-200 shadow-sm" : "bg-white border-slate-200 hover:bg-slate-50")}
                                >
                                   <div className="flex items-start gap-3">
                                      <div className={cn("w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-0.5", atividadeEconomica === ativ.atividade ? "bg-blue-600 border-blue-600" : "bg-white border-slate-300")}>
                                         {atividadeEconomica === ativ.atividade && <div className="w-2 h-2 bg-white rounded-full" />}
                                      </div>
                                      <div>
                                         <p className={cn("font-bold text-sm", atividadeEconomica === ativ.atividade ? "text-blue-900" : "text-slate-800")}>{ativ.atividade}</p>
                                         <p className="text-xs text-slate-500 mt-1">{ativ.ramo} • {ativ.local}</p>
                                      </div>
                                   </div>
                                </div>
                             ))}
                          </div>
                        );
                      }
                      return (
                        <input 
                          type="text" 
                          value={atividadeEconomica}
                          onChange={e => setAtividadeEconomica(e.target.value)}
                          placeholder="Ex: Comercialização de bebidas"
                          className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 text-sm font-medium text-slate-800"
                        />
                      );
                   })()}
                 </div>
               )}
             </div>
          </div>
        )}

                  {/* STEP 2 */}
        {step === 2 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
             
             {/* Data e Hora */}
             <div className="space-y-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div className="flex items-center gap-2 mb-2 border-b border-slate-100 pb-3">
                   <CheckCircle className="w-5 h-5 text-indigo-600" />
                   <h3 className="font-bold text-base text-slate-800">1. Agendamento & Registo</h3>
                </div>
                <div className="grid grid-cols-2 gap-4">
                   <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Data da Vistoria</label>
                      <input 
                         type="date" 
                         value={date}
                         onChange={e => setDate(e.target.value)}
                         className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white text-sm font-semibold text-slate-800"
                      />
                   </div>
                   <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Hora da Entrada</label>
                      <input 
                         type="time" 
                         value={time}
                         onChange={e => setTime(e.target.value)}
                         className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white text-sm font-semibold text-slate-800"
                      />
                   </div>
                </div>

                {location && (
                   <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col items-center justify-center border-dashed gap-1">
                      <MapPin className="w-5 h-5 text-indigo-500" />
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Coordenadas de Ingressos do Agente</p>
                      <p className="text-xs text-slate-600 font-mono font-bold">Lat: {location.lat.toFixed(5)} | Lng: {location.lng.toFixed(5)}</p>
                   </div>
                )}
             </div>

             {/* Equipa de Fiscalização */}
             <div className="space-y-6 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <div className="space-y-1">
                   <div className="flex items-center gap-2 mb-1">
                      <Users className="w-5 h-5 text-indigo-600" />
                      <h3 className="font-bold text-base text-slate-800">2. Confirmar Equipa de Fiscalização</h3>
                   </div>
                   <p className="text-xs text-slate-500 font-medium font-sans">
                      Confirme os agentes escalados para esta ação. É obrigatória a presença de pelo menos 1 fiscal.
                   </p>
                </div>

                <div className="space-y-2.5">
                   {technicians.map((tech, idx) => (
                      <div key={tech} className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                         <div className="flex items-center gap-2.5">
                            <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[10px] font-bold">
                               {idx + 1}
                            </div>
                            <span className="text-sm font-bold text-slate-700">{tech}</span>
                         </div>
                         <button
                            type="button"
                            onClick={() => setTechnicians(prev => prev.filter(t => t !== tech))}
                            className="p-1.5 text-[10px] text-red-500 hover:bg-red-50 hover:text-red-700 font-bold rounded-lg transition-colors border border-transparent hover:border-red-100"
                         >
                            Remover
                         </button>
                      </div>
                   ))}

                   {technicians.length === 0 && (
                      <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-center text-xs text-red-700 font-semibold">
                         Atenção: Deve definir pelo menos um agente fiscalizador para prosseguir!
                      </div>
                   )}
                </div>

                {/* Add member on the fly */}
                <div className="pt-4 border-t border-slate-100 space-y-2">
                   <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block pl-1">Adicionar Co-Fiscalizador</label>
                   <div className="flex gap-2">
                      <input
                         type="text"
                         placeholder="Nome do agente para escala..."
                         value={newTechName}
                         onChange={e => setNewTechName(e.target.value)}
                         onKeyDown={e => {
                            if (e.key === 'Enter') {
                               e.preventDefault();
                               const name = newTechName.trim();
                               if (name && !technicians.includes(name)) {
                                  setTechnicians(prev => [...prev, name]);
                                  setNewTechName('');
                               }
                            }
                         }}
                         className="flex-1 p-3 text-xs bg-slate-50 border border-slate-200 focus:outline-hidden focus:bg-white focus:ring-2 focus:ring-indigo-500 text-slate-800 font-semibold rounded-xl"
                      />
                      <button
                         type="button"
                         onClick={() => {
                            const name = newTechName.trim();
                            if (name && !technicians.includes(name)) {
                               setTechnicians(prev => [...prev, name]);
                               setNewTechName('');
                            }
                         }}
                         className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
                      >
                        Adicionar
                      </button>
                   </div>
                   <p className="text-[10px] text-slate-400 font-medium pl-1">As alterações aplicam-se apenas para este registo.</p>
                </div>
             </div>
          </div>
        )}

        {/* STEP 3 */}
        {step === 3 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
             
             {/* Search box for infractions */}
             <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm shrink-0">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2 pl-1">Pesquisar Catálogo de Infrações</label>
                <div className="relative">
                   <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                   <input 
                      type="text"
                      placeholder="Procurar por legislação, infração ou artigo de lei..."
                      value={searchInfracao}
                      onChange={e => setSearchInfracao(e.target.value)}
                      className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500 text-xs font-medium text-slate-800"
                   />
                </div>
             </div>

             <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 pl-1">
                Catálogo de Infrações ({predefinedInfracoes.filter(inf => 
                  inf.type.toLowerCase().includes(searchInfracao.toLowerCase()) || 
                  inf.legalInstrument?.toLowerCase().includes(searchInfracao.toLowerCase()) || 
                  inf.details?.toLowerCase().includes(searchInfracao.toLowerCase())
                ).length} encontradas)
             </p>

             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {predefinedInfracoes
                   .filter(inf => 
                      inf.type.toLowerCase().includes(searchInfracao.toLowerCase()) || 
                      inf.legalInstrument?.toLowerCase().includes(searchInfracao.toLowerCase()) || 
                      inf.details?.toLowerCase().includes(searchInfracao.toLowerCase())
                   )
                   .map(inf => {
                      const isSelected = infracoes.some(i => i.type === inf.type);
                      return (
                         <div 
                            key={inf.type}
                            onClick={() => toggleInfracao(inf.type, inf.severity)}
                            className={cn(
                               "p-4 rounded-2xl border flex flex-col cursor-pointer transition-all gap-2 relative overflow-hidden",
                               isSelected 
                                 ? "bg-red-50/50 border-red-400 ring-2 ring-red-500/20 shadow-md" 
                                 : "bg-white border-slate-200 hover:bg-slate-50 hover:border-slate-300"
                            )}
                         >
                            <div className="flex items-start justify-between gap-2">
                               <div className="flex items-start gap-2.5">
                                  <div className={cn(
                                     "w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5",
                                     isSelected ? "bg-red-600 text-white" : "border border-slate-300 bg-slate-50"
                                  )}>
                                     {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                                  </div>
                                  <span className={cn("text-xs font-bold leading-tight", isSelected ? "text-red-950 font-black" : "text-slate-800")}>
                                     {inf.type}
                                  </span>
                               </div>
                               <span className={cn(
                                  "text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded leading-none shrink-0",
                                  inf.severity === 'Baixa' ? "bg-amber-100 text-amber-800" :
                                  inf.severity === 'Alta' ? "bg-orange-100 text-orange-850" : "bg-red-600 text-white"
                               )}>
                                  {inf.severity}
                               </span>
                            </div>

                            {/* Legal frame */}
                            <div className="px-2.5 py-1 bg-slate-100/80 rounded-md border border-slate-200/50 flex items-center gap-1.5 text-[9px] font-bold text-slate-500 leading-none">
                               <span className="text-slate-400">📖 Enquadramento:</span>
                               <span className="text-slate-700 font-mono">{inf.legalInstrument}</span>
                            </div>

                            {/* Details text */}
                            <p className="text-[11px] leading-relaxed text-slate-500 font-medium pl-1">
                               {inf.details}
                            </p>
                         </div>
                      )
                   })}
             </div>
          </div>
        )}

        {/* STEP 4 */}
        {step === 4 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
             
             <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-1">
                <h3 className="font-bold text-base text-slate-800">Recomendações do Agente</h3>
                <p className="text-xs text-slate-500 font-medium font-sans">
                   Selecione as recomendações pedagógicas de asseio ou conformidade legal pré-cadastradas para aplicar neste operador, ou adicione itens à medida das necessidades do local.
                </p>
             </div>

             {/* Pre-registered recommendations array as cards */}
             <div className="space-y-2.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block pl-1">Recomendações Pré-Definidas</label>
                <div className="grid grid-cols-1 gap-2.5">
                   {predefinedRecomendacoes.map(rec => {
                      const isSelected = recomendacoes.includes(rec);
                      return (
                         <div
                            key={rec}
                            onClick={() => {
                               if (isSelected) {
                                  setRecomendacoes(prev => prev.filter(r => r !== rec));
                               } else {
                                  setRecomendacoes(prev => [...prev, rec]);
                                }
                            }}
                            className={cn(
                               "p-4 rounded-xl border flex items-start gap-3 cursor-pointer transition-colors",
                               isSelected 
                                 ? "bg-indigo-50 border-indigo-400 shadow-sm" 
                                 : "bg-white border-slate-200 hover:bg-slate-50"
                            )}
                         >
                            <div className={cn(
                               "w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-0.5",
                               isSelected ? "bg-indigo-600 border-indigo-600 text-white" : "bg-white border-slate-300"
                            )}>
                               {isSelected && <Check className="w-3 h-3 text-white font-bold" />}
                            </div>
                            <p className={cn("text-xs leading-relaxed font-semibold", isSelected ? "text-indigo-900 font-bold" : "text-slate-700")}>
                               {rec}
                            </p>
                         </div>
                      );
                   })}
                </div>
             </div>

             {/* Custom Recommendation */}
             <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-3">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block pl-1">Adicionar Recomendação Customizada/Personalizada</label>
                <div className="flex gap-2">
                   <input
                      type="text"
                      placeholder="Ex: Reforçar o lacre das caixas de expedição no local de carga..."
                      value={customRecommendation}
                      onChange={e => setCustomRecommendation(e.target.value)}
                      onKeyDown={e => {
                         if (e.key === 'Enter') {
                            e.preventDefault();
                            const val = customRecommendation.trim();
                            if (val) {
                               if (!recomendacoes.includes(val)) {
                                  setRecomendacoes(prev => [...prev, val]);
                               }
                               setCustomRecommendation('');
                            }
                         }
                      }}
                      className="flex-1 p-3.5 text-xs bg-slate-50 border border-slate-200 focus:bg-white focus:ring-2 focus:ring-indigo-500 text-slate-800 font-semibold rounded-xl"
                   />
                   <button
                      type="button"
                      onClick={() => {
                         const val = customRecommendation.trim();
                         if (val) {
                            if (!recomendacoes.includes(val)) {
                               setRecomendacoes(prev => [...prev, val]);
                            }
                            setCustomRecommendation('');
                         }
                      }}
                      className="px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
                   >
                      Adicionar
                   </button>
                </div>
             </div>

             {/* Selected display */}
             {recomendacoes.length > 0 && (
                <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100 space-y-2">
                   <p className="text-[10px] font-bold text-indigo-700 uppercase tracking-widest">Recomendações a Emitir ({recomendacoes.length})</p>
                   <ul className="space-y-1.5">
                      {recomendacoes.map((rec, i) => (
                         <li key={i} className="text-xs font-semibold text-indigo-950 flex justify-between items-start gap-2 bg-white/60 p-2.5 rounded-lg border border-indigo-100">
                            <span className="flex-1 leading-normal">• {rec}</span>
                            <button
                               type="button"
                               onClick={() => setRecomendacoes(prev => prev.filter(r => r !== rec))}
                               className="text-[10px] text-red-500 hover:text-red-700 font-bold px-1"
                            >
                               Remover
                            </button>
                         </li>
                      ))}
                   </ul>
                </div>
             )}

          </div>
        )}

        {/* STEP 5 */}
        {step === 5 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
             <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Captura de Provas</p>
             
             <div className="grid grid-cols-2 gap-4">
               <button onClick={() => cameraInputRef.current?.click()} className="flex flex-col items-center justify-center gap-3 p-6 bg-slate-50 border border-slate-200 border-dashed rounded-2xl hover:bg-slate-100 transition-colors text-blue-600">
                  <Camera className="w-8 h-8" />
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Tirar Foto</span>
               </button>
               
               <button onClick={() => fileInputRef.current?.click()} className="flex flex-col items-center justify-center gap-3 p-6 bg-slate-50 border border-slate-200 border-dashed rounded-2xl hover:bg-slate-100 transition-colors text-blue-600">
                  <ImageIcon className="w-8 h-8" />
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Galeria</span>
               </button>
             </div>

             <input type="file" accept="image/*" capture="environment" className="hidden" ref={cameraInputRef} onChange={handleFileChange} />
             <input type="file" accept="image/*,video/*,.pdf" multiple className="hidden" ref={fileInputRef} onChange={handleFileChange} />

             {anexos.length > 0 && (
                <div className="grid grid-cols-3 gap-3 mt-4">
                   {anexos.map((anx, i) => (
                      <div key={i} className="relative aspect-square rounded-xl overflow-hidden border border-slate-200 bg-slate-100 shadow-sm">
                         {anx.file.type.startsWith('image/') ? (
                            <img src={anx.url} alt="anexo" className="w-full h-full object-cover" />
                         ) : (
                            <div className="flex h-full items-center justify-center bg-slate-50 text-[10px] font-bold text-slate-500 uppercase">{anx.file.name.split('.').pop()}</div>
                         )}
                         <button onClick={() => removeAnexo(i)} className="absolute top-2 right-2 bg-slate-900/60 backdrop-blur-sm text-white rounded-full p-1 hover:bg-slate-900/80 transition-colors">
                            <X className="w-3.5 h-3.5" />
                         </button>
                      </div>
                   ))}
                </div>
             )}

             <div className="space-y-2 mt-8 border-t border-slate-100 pt-6">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Observações Detalhadas</label>
                <textarea 
                  rows={4}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Descreva a situação encontrada no local..."
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 text-sm font-medium text-slate-800"
                />
             </div>
          </div>
        )}

        {/* STEP 6 */}
        {step === 6 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300 pb-12">
             <div className="bg-gradient-to-r from-emerald-50 to-teal-50 text-emerald-800 p-6 rounded-2xl border border-emerald-200 flex flex-col items-center text-center shadow-xs">
                <CheckCircle className="w-12 h-12 mb-2 text-emerald-600 animate-pulse" />
                <h3 className="font-extrabold text-lg text-slate-800">Revisão e Auto-Certificação</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-sm font-semibold leading-relaxed">
                   Verifique com rigor todas as evidências e declarações recolhidas antes de submeter a ata de fiscalização.
                </p>
             </div>

             {/* Informações Gerais & Operador */}
             <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-3xs font-sans">
                <div className="border-b border-slate-100 pb-2">
                   <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-left">Identidade do Operador</h4>
                   <h3 className="text-base font-black text-slate-800 mt-0.5 text-left text-wrap leading-tight">
                      {firmas?.find(f => f.id === firmaId)?.name || 'N/A'}
                   </h3>
                   <p className="text-xs text-slate-500 font-medium text-left mt-1">
                      Atividade Principal em Vistoria: <span className="font-bold text-slate-700">{atividadeEconomica || 'N/A'}</span>
                   </p>
                </div>

                <div className="grid grid-cols-2 gap-4 text-xs font-sans text-left">
                   <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Data e Hora do Registo</p>
                      <p className="font-bold text-slate-700 mt-0.5">{date} às {time}</p>
                   </div>
                   {representante && (
                      <div>
                         <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-wrap">Declarou perante</p>
                         <p className="font-bold text-slate-700 mt-0.5">{representante}</p>
                      </div>
                   )}
                </div>
             </div>

             {/* Equipa Destacada */}
             <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3 shadow-3xs font-sans text-left">
                <h4 className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest flex items-center gap-1">
                   <Users className="w-3.5 h-3.5 animate-pulse" />
                   Técnicos de Serviço Diário ({technicians.length})
                </h4>
                <div className="flex flex-wrap gap-2 pt-1">
                   {technicians.map((tech, idx) => (
                      <span key={idx} className="text-xs font-semibold px-2.5 py-1.5 bg-indigo-50 text-indigo-900 border border-indigo-100 rounded-xl flex items-center gap-1">
                         <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full" />
                         {tech}
                      </span>
                   ))}
                </div>
             </div>

             {/* Georreferenciação da Atividade (Mapa) */}
             <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3 shadow-3xs font-sans text-left">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                   <Map className="w-3.5 h-3.5 text-blue-600" />
                   Georreferenciação Localizada (Ata de Visita)
                </h4>
                {location ? (
                   <div className="space-y-3">
                      <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-[11px] font-mono text-slate-600 flex justify-between items-center">
                         <span>Lat: {location.lat.toFixed(6)}</span>
                         <span>Lng: {location.lng.toFixed(6)}</span>
                      </div>
                      <div className="rounded-xl border border-slate-200 overflow-hidden h-[200px] w-full bg-slate-100 relative">
                         <iframe
                            title="Mapa Coleta Ponto"
                            width="100%"
                            height="100%"
                            className="border-0"
                            src={`https://maps.google.com/maps?q=${location.lat},${location.lng}&t=&z=16&ie=UTF8&iwloc=&output=embed`}
                            allowFullScreen
                            loading="lazy"
                            referrerPolicy="no-referrer"
                         ></iframe>
                      </div>
                      {(() => {
                         const selectedFirma = firmas?.find(f => f.id === firmaId);
                         const isMissingCoordinates = selectedFirma && (!selectedFirma.geolocation || !(selectedFirma.atividades?.find(a => a.atividade === atividadeEconomica)?.geolocation));
                         if (isMissingCoordinates) {
                            return (
                               <div className="mt-3 p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-xs font-semibold leading-relaxed flex items-start gap-2.5 shadow-3xs">
                                  <MapPin className="w-4 h-4 text-amber-600 shrink-0 mt-0.5 animate-bounce" />
                                  <div>
                                     <p className="font-extrabold text-amber-950 uppercase tracking-wide text-[9px] mb-0.5">Captura de Ponto do Operador Ativa</p>
                                     <p className="text-slate-600 leading-normal">
                                        Este operador não tem coordenadas registadas. Ao finalizar, as coordenadas atuais <span className="font-bold text-slate-800">({location.lat.toFixed(5)}, {location.lng.toFixed(5)})</span> serão guardadas automaticamente como o ponto oficial de <b>{selectedFirma.name}</b>.
                                     </p>
                                  </div>
                               </div>
                            );
                         }
                         return null;
                      })()}
                   </div>
                ) : (
                   <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 text-center text-xs space-y-2">
                      <p className="text-amber-800 font-bold">Sem Sinal GPS Ativo</p>
                      <p className="text-amber-700 font-medium leading-relaxed">As coordenadas da visita não puderam ser obtidas automaticamente. Certifique-se de que o browser tem ativa a permissão de localização.</p>
                      <button 
                         type="button"
                         onClick={() => {
                            if (navigator.geolocation) {
                              navigator.geolocation.getCurrentPosition(
                                pos => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                                err => alert('Não foi possível obter a sua localização. Ative o GPS.'),
                                { enableHighAccuracy: true, timeout: 5000 }
                              );
                            }
                         }}
                         className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-[10px] rounded-lg tracking-wider uppercase"
                      >
                         Tentar Capturar GPS
                      </button>
                   </div>
                )}
             </div>

             {/* Infrações Registadas */}
             <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-3xs font-sans text-left">
                <div className="flex justify-between items-center border-b border-slate-100 pb-2">
                   <h4 className="text-[10px] font-bold text-red-600 uppercase tracking-widest flex items-center gap-1">
                      <AlertTriangle className="w-4 h-4" />
                      Não Conformidades detetadas ({infracoes.length})
                   </h4>
                </div>
                {infracoes.length === 0 ? (
                   <div className="p-3 bg-emerald-50/50 border border-emerald-100 rounded-xl text-center text-xs font-semibold text-emerald-800">
                      ✅ Nenhuma infração detetada nesta verificação.
                   </div>
                ) : (
                   <div className="space-y-3">
                      {infracoes.map((inf, i) => (
                         <div key={i} className="p-3 bg-red-50/30 border border-red-100 rounded-xl space-y-1">
                            <div className="flex justify-between items-start gap-2">
                               <p className="font-extrabold text-xs text-slate-800 leading-normal">{inf.type}</p>
                               <span className={cn(
                                  "text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider shrink-0 leading-none",
                                  inf.severity === 'Crítica' ? "bg-red-600 text-white animate-pulse" :
                                  inf.severity === 'Alta' ? "bg-orange-100 text-orange-950" : "bg-amber-100 text-amber-950"
                               )}>{inf.severity}</span>
                            </div>
                         </div>
                      ))}
                   </div>
                )}
             </div>

             {/* Recomendações Emitidas */}
             <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3 shadow-3xs font-sans text-left">
                <h4 className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest flex items-center gap-1">
                   ✦ Recomendações Aplicadas ao Operador ({recomendacoes.length})
                </h4>
                {recomendacoes.length === 0 ? (
                   <p className="text-xs text-slate-400 font-medium pl-1">Nenhuma recomendação preventiva emitida nesta vistoria.</p>
                ) : (
                   <ul className="space-y-2">
                      {recomendacoes.map((rec, i) => (
                         <li key={i} className="text-xs font-semibold text-slate-700 flex gap-2 items-start leading-relaxed bg-slate-50/70 p-3 rounded-xl border border-slate-100 text-left">
                            <span className="text-indigo-600 font-black">•</span>
                            <span className="flex-1">{rec}</span>
                         </li>
                      ))}
                   </ul>
                )}
             </div>

             {/* Provas em Miniaturas e Pré-Visualização */}
             <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3 shadow-3xs font-sans text-left">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                   Evidências Anexadas ({anexos.length})
                </h4>
                {anexos.length === 0 ? (
                   <p className="text-xs text-slate-400 font-medium pl-1">Sem fotografias ou ficheiros anexados.</p>
                ) : (
                   <div className="grid grid-cols-4 gap-2.5">
                      {anexos.map((anx, i) => (
                         <div 
                            key={i} 
                            onClick={() => {
                               if (anx.file.type.startsWith('image/')) {
                                  setSelectedPreview(anx.url);
                               } else {
                                  alert(`Ficheiro de tipo ${anx.file.type || 'desconhecido'}: ${anx.file.name}`);
                               }
                            }}
                            className="relative aspect-square rounded-xl overflow-hidden border border-slate-200 bg-slate-50 cursor-pointer hover:border-indigo-400 hover:scale-105 transition-all shadow-3xs group"
                         >
                            {anx.file.type.startsWith('image/') ? (
                               <>
                                  <img referrerPolicy="no-referrer" src={anx.url} alt="anexo" className="w-full h-full object-cover" />
                                  <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-[9px] text-white font-bold uppercase transition-opacity">Ver</div>
                               </>
                            ) : (
                               <div className="flex flex-col h-full items-center justify-center p-1 bg-slate-50 text-[10px] font-black text-slate-500 uppercase leading-normal">
                                  <span className="text-indigo-500 font-mono">{anx.file.name.split('.').pop()}</span>
                                  <span className="text-[8px] tracking-tight font-sans text-slate-400 mt-1 truncate max-w-full">{anx.file.name}</span>
                                </div>
                            )}
                         </div>
                      ))}
                   </div>
                )}
             </div>

             {/* Observações */}
             {notes && (
                <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-2 shadow-3xs font-sans text-left">
                   <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Observações Gerais</h4>
                   <p className="text-xs text-slate-700 font-medium leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-100 whitespace-pre-wrap">{notes}</p>
                </div>
             )}

             {/* PREVIEW MODAL */}
             {selectedPreview && (
                <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-250">
                   <div className="bg-white rounded-3xl border border-slate-200 max-w-2xl w-full overflow-hidden shadow-2xl relative p-3 animate-in zoom-in-95 duration-250 flex flex-col">
                      <div className="flex justify-between items-center px-4 py-2 bg-slate-50 rounded-2xl border border-slate-100 mb-2">
                         <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Evidência Fotográfica</span>
                         <button 
                            onClick={() => setSelectedPreview(null)}
                            className="p-1.5 px-3 bg-red-50 hover:bg-red-100 text-red-600 font-bold rounded-full text-xs transition-colors"
                         >
                            Fechar
                         </button>
                      </div>
                      <div className="flex justify-center items-center bg-slate-950 rounded-2xl overflow-hidden aspect-video relative max-h-[60vh]">
                         <img referrerPolicy="no-referrer" src={selectedPreview} alt="Preview" className="max-h-full max-w-full object-contain" />
                      </div>
                   </div>
                </div>
             )}
          </div>
        )}

      </div>

      {/* Floating Bottom Bar Navigation */}
      <div className="bg-white border-t border-slate-200 p-4 flex gap-4 shrink-0 mt-auto relative z-10 font-sans">
         {step > 1 && (
            <button 
               onClick={handlePrev}
               className="px-6 py-3.5 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
            >
               Anterior
            </button>
         )}
         {step < 6 ? (
            <button 
               onClick={handleNext}
               disabled={
                  (step === 1 && (!firmaId || !atividadeEconomica)) || 
                  (step === 2 && technicians.length === 0)
               }
               className="flex-1 px-6 py-3.5 rounded-xl text-sm font-bold text-white bg-indigo-600 disabled:opacity-50 disabled:bg-slate-400 hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200/50"
            >
               Próximo Passo
            </button>
         ) : (
            <button 
               onClick={handleSubmit}
               className="flex-1 px-6 py-3.5 rounded-xl text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 transition-colors shadow-lg shadow-slate-900/20"
            >
               Finalizar Registo
            </button>
         )}
      </div>
    </div>
  );
}
