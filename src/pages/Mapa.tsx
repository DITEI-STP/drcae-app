import React, { useState, useEffect } from 'react';
import { db } from '../db/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { MapPin, Navigation, ArrowLeft, Clock, Compass, Activity, Check, Map, WifiOff } from 'lucide-react';
import { cn } from '../lib/utils';
import { useNavigate, useLocation } from 'react-router-dom';

const DISTRICT_COORDS: Record<string, { lat: number; lng: number }> = {
  'Água Grande': { lat: 0.336, lng: 6.730 },
  'Mé-Zóchi': { lat: 0.270, lng: 6.650 },
  'Cantagalo': { lat: 0.220, lng: 6.700 },
  'Lobata': { lat: 0.355, lng: 6.645 },
  'Lembá': { lat: 0.360, lng: 6.480 },
  'Caué': { lat: 0.140, lng: 6.640 },
  'RAP': { lat: 1.630, lng: 7.400 }
};

export default function Mapa() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as { selectedFirmaId?: string; selectedAtividadeId?: string } | null;

  const firmas = useLiveQuery(() => db.firmas.toArray());
  const [selectedFirmaId, setSelectedFirmaId] = useState<string | null>(state?.selectedFirmaId || null);
  const [selectedAtividadeId, setSelectedAtividadeId] = useState<string | null>(state?.selectedAtividadeId || null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [navProgress, setNavProgress] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const up = () => setIsOnline(true);
    const down = () => setIsOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);

  const selectedFirma = firmas?.find(f => f.id === selectedFirmaId);

  // Calculate distance from center (Água Grande approximate capital center for demonstration)
  const getFirmaLocationInfo = (firma: typeof selectedFirma, activeAtividadeId: string | null) => {
    if (!firma) return { lat: 0.336, lng: 6.730, distance: 0, time: 0, steps: [] };

    let lat = DISTRICT_COORDS[firma.district]?.lat || 0.336;
    let lng = DISTRICT_COORDS[firma.district]?.lng || 6.730;

    let targetTitle = "operador económico";

    const targetAtiv = activeAtividadeId ? (firma.atividades || []).find(a => a.id === activeAtividadeId) : null;

    if (targetAtiv && targetAtiv.geolocation) {
       lat = targetAtiv.geolocation.lat;
       lng = targetAtiv.geolocation.lng;
       targetTitle = `atividade específica: "${targetAtiv.atividade || 'Atividade'}"`;
    } else if (firma.geolocation) {
       lat = firma.geolocation.lat;
       lng = firma.geolocation.lng;
    } else if (firma.atividades && firma.atividades.length > 0 && firma.atividades[0].geolocation) {
       lat = firma.atividades[0].geolocation.lat;
       lng = firma.atividades[0].geolocation.lng;
    }

    // Rough distance calculation from Água Grande capital (0.336, 6.730)
    const baseLat = 0.336;
    const baseLng = 6.730;
    const rad = Math.PI / 180;
    const dLat = (lat - baseLat) * rad;
    const dLng = (lng - baseLng) * rad;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(baseLat * rad) * Math.cos(lat * rad) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distanceKm = Math.round((6371 * c) * 10) / 10 || 1.2;

    const travelTimeMin = Math.round(distanceKm * 2.5) || 5;

    const steps = [
      { text: "Partida da sede regional em Água Grande", dist: "0 m" },
      { text: `Siga em direção à via expressa principal p/ distrito ${firma.district}`, dist: "450 m" },
      { text: `Siga em direção a ${firma.address || firma.name}`, dist: `${(distanceKm * 0.7).toFixed(1)} km` },
      { text: `Chegada ao ponto calibrado da ${targetTitle}`, dist: "Destino" }
    ];

    return { lat, lng, distance: distanceKm, time: travelTimeMin, steps };
  };

  const locInfo = getFirmaLocationInfo(selectedFirma, selectedAtividadeId);

  // Generate interactive Google Map Iframe Source
  const getMapIframeSrc = () => {
    if (!selectedFirma) return "";
    let q = "";

    const targetAtiv = selectedAtividadeId ? (selectedFirma.atividades || []).find(a => a.id === selectedAtividadeId) : null;

    if (targetAtiv && targetAtiv.geolocation) {
       q = `${targetAtiv.geolocation.lat},${targetAtiv.geolocation.lng}`;
    } else if (selectedFirma.geolocation) {
       q = `${selectedFirma.geolocation.lat},${selectedFirma.geolocation.lng}`;
    } else if (selectedFirma.atividades && selectedFirma.atividades.length > 0 && selectedFirma.atividades[0].geolocation) {
       const g = selectedFirma.atividades[0].geolocation;
       q = `${g.lat},${g.lng}`;
    } else {
       q = encodeURIComponent(`${selectedFirma.name}, ${selectedFirma.district}, São Tomé e Príncipe`);
    }
    return `https://maps.google.com/maps?q=${q}&t=&z=16&ie=UTF8&iwloc=&output=embed`;
  };

  const startNavSimulada = () => {
    setIsNavigating(true);
    setNavProgress(0);
    const interval = setInterval(() => {
      setNavProgress(p => {
        if (p >= 100) {
          clearInterval(interval);
          setIsNavigating(false);
          return 100;
        }
        return p + 10;
      });
    }, 400);
  };

  return (
    <div className="flex flex-col h-full bg-[#F5F7FA]">
      <div className="px-4 py-4 border-b border-slate-200 shrink-0 sticky top-0 bg-white z-10 flex items-center justify-between shadow-sm">
         <div className="flex items-center gap-3">
            {selectedFirmaId && (
               <button onClick={() => { setSelectedFirmaId(null); setIsNavigating(false); }} className="text-slate-500 hover:text-slate-900">
                  <ArrowLeft className="w-5 h-5" />
               </button>
            )}
            <h2 className="font-bold text-slate-900 tracking-tight">
               {selectedFirma ? "Visualizador de Rota" : "Mapa e Rotas"}
            </h2>
         </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar">
         {!selectedFirma ? (
            <div className="space-y-6">
              {/* Search Input Box */}
              <div className="relative mb-4">
                 <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
                    <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                       <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                 </span>
                 <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Pesquisar por designação, NIF, distrito ou morada..."
                    className="w-full pl-10 pr-10 py-3 bg-white text-sm text-slate-800 rounded-xl border border-slate-200 focus:outline-hidden shadow-xs"
                 />
                 {searchQuery && (
                    <button
                       onClick={() => setSearchQuery('')}
                       className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 text-xs font-bold font-mono"
                    >
                       Limpar
                    </button>
                 )}
              </div>

              <div className="bg-blue-50 text-blue-800 p-4 rounded-xl border border-blue-200 flex items-center gap-3">
                <Navigation className="w-5 h-5 text-blue-600 shrink-0" />
                <p className="text-sm font-medium">Selecione um operador económico abaixo para ver a sua geolocalização e traçar a rota diretamente na aplicação.</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 {(() => {
                    const filtered = firmas?.filter(f => {
                       if (!searchQuery.trim()) return true;
                       const q = searchQuery.toLowerCase();
                       return f.name.toLowerCase().includes(q) ||
                              (f.nif && f.nif.toLowerCase().includes(q)) ||
                              f.district.toLowerCase().includes(q) ||
                              (f.address && f.address.toLowerCase().includes(q));
                    }) || [];
                    if (filtered.length === 0) {
                       return (
                          <div className="col-span-full bg-white p-8 rounded-2xl border border-slate-200 text-center space-y-2 w-full">
                             <MapPin className="w-8 h-8 text-slate-300 mx-auto" />
                             <p className="text-sm font-bold text-slate-600">Nenhum operador económico encontrado</p>
                             <p className="text-xs text-slate-400">Tente cadastrar um novo operador ou limpe o termo de busca.</p>
                          </div>
                       );
                    }
                    return filtered.map(firma => {
                       const hasSomeGps = !!firma.geolocation || (firma.atividades?.some(a => !!a.geolocation));
                       return (
                          <div 
                            key={firma.id} 
                            onClick={() => setSelectedFirmaId(firma.id!)}
                            className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between cursor-pointer hover:border-blue-300 hover:shadow-md transition-all group"
                          >
                             <div className="flex items-center gap-4 min-w-0">
                                <div className={cn(
                                   "w-12 h-12 rounded-xl flex items-center justify-center shrink-0",
                                   hasSomeGps ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-400"
                                )}>
                                   <MapPin className="w-6 h-6" />
                                </div>
                                <div className="flex-1 min-w-0">
                                   <h3 className="font-bold text-slate-900 truncate group-hover:text-blue-600">{firma.name}</h3>
                                   <p className="text-xs text-slate-500 truncate">{firma.address || `${firma.district}, São Tomé`}</p>
                                   <span className={cn(
                                      "text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full mt-1 inline-block",
                                      hasSomeGps ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-500"
                                   )}>
                                      {hasSomeGps ? "📍 Coordenadas Gravadas" : "NIF: " + (firma.nif || "Formal")}
                                   </span>
                                </div>
                             </div>
                             <button className="w-10 h-10 bg-blue-50 group-hover:bg-blue-600 group-hover:text-white text-blue-600 rounded-full flex items-center justify-center transition-all shrink-0">
                                <Navigation className="w-4 h-4" />
                             </button>
                          </div>
                       );
                    });
                 })()}
              </div>
            </div>
         ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
               {/* Map View */}
               <div className="lg:col-span-2 space-y-4">
                  <div className="bg-white p-2 rounded-2xl border border-slate-200 shadow-sm overflow-hidden h-[320px] md:h-[480px]">
                     {isOnline ? (
                       <iframe
                          title={`Mapa - ${selectedFirma.name}`}
                          width="100%"
                          height="100%"
                          className="border-0 rounded-xl"
                          src={getMapIframeSrc()}
                          allowFullScreen
                          loading="lazy"
                          referrerPolicy="no-referrer"
                       />
                     ) : (
                       <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
                         <WifiOff className="w-10 h-10 text-slate-300" />
                         <p className="font-bold text-slate-600 text-sm">Mapa indisponível offline</p>
                         <p className="text-xs text-slate-400">O mapa interativo requer ligação à internet.</p>
                         {locInfo.lat !== 0 && (
                           <p className="text-xs font-mono bg-slate-100 px-3 py-1.5 rounded-lg text-slate-600">
                             {locInfo.lat.toFixed(6)}, {locInfo.lng.toFixed(6)}
                           </p>
                         )}
                       </div>
                     )}
                  </div>
               </div>

               {/* Route Detail Panels */}
               <div className="space-y-4 flex flex-col">
                  <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
                     <div>
                        <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded bg-blue-100 text-blue-800">Operador</span>
                        <h3 className="text-lg font-bold text-slate-900 mt-1">{selectedFirma.name}</h3>
                        <p className="text-xs text-slate-500 mt-0.5">{selectedFirma.address || selectedFirma.district}</p>

                        {/* Active Operations Bar */}
                        <div className="flex gap-2.5 mt-3 pt-3 border-t border-slate-100">
                           <button
                              onClick={() => navigate(`/firmas/${selectedFirma.id}`)}
                              className="flex-1 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg text-[10px] uppercase tracking-wider text-center border border-slate-200 transition-colors"
                           >
                              Ver Detalhes
                           </button>
                           <button
                              onClick={() => navigate('/visitas/nova', { state: { firmaId: selectedFirma.id } })}
                              className="flex-1 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg text-[10px] uppercase tracking-wider text-center transition-colors shadow-xs"
                           >
                              Fiscalizar
                           </button>
                        </div>

                        {/* Atividades Mapeadas list */}
                        {selectedFirma.atividades && selectedFirma.atividades.filter(a => a.geolocation).length > 0 && (
                           <div className="border-t border-slate-100 pt-3 mt-3 text-left">
                              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Atividades Mapeadas ({selectedFirma.atividades.filter(a => a.geolocation).length})</span>
                              <div className="space-y-1.5 mt-2 max-h-[140px] overflow-y-auto custom-scrollbar">
                                 {/* Ponto principal */}
                                 <button
                                    type="button"
                                    onClick={() => {
                                       setSelectedAtividadeId(null);
                                       setIsNavigating(false);
                                       setNavProgress(0);
                                    }}
                                    className={cn(
                                       "w-full text-left p-2 rounded-lg text-[11px] font-semibold flex items-center justify-between border transition-all",
                                       selectedAtividadeId === null 
                                         ? "bg-slate-900 text-white border-slate-950 font-black shadow-3xs"
                                         : "bg-slate-50 hover:bg-slate-100 border-slate-200/60 text-slate-700"
                                    )}
                                 >
                                    <div className="flex items-center gap-1.5 truncate">
                                       <MapPin className="w-3.5 h-3.5 shrink-0 text-indigo-500" />
                                       <span className="truncate">Sede Princ. (Firma)</span>
                                    </div>
                                    <span className="text-[8px] tracking-wide font-extrabold uppercase bg-indigo-100 text-indigo-800 px-1 py-0.5 rounded shrink-0">Sede</span>
                                 </button>

                                 {/* Individual activities */}
                                 {selectedFirma.atividades.filter(a => a.geolocation).map((ativ) => (
                                    <button
                                       key={ativ.id}
                                       type="button"
                                       onClick={() => {
                                          setSelectedAtividadeId(ativ.id || null);
                                          setIsNavigating(false);
                                          setNavProgress(0);
                                       }}
                                       className={cn(
                                          "w-full text-left p-2 rounded-lg text-[11px] font-semibold flex items-center justify-between border transition-all",
                                          selectedAtividadeId === ativ.id 
                                            ? "bg-slate-900 text-white border-slate-950 font-black shadow-3xs"
                                            : "bg-slate-50 hover:bg-slate-100 border-slate-200/60 text-slate-700"
                                       )}
                                    >
                                       <div className="flex items-center gap-1.5 truncate text-left">
                                          <Activity className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
                                          <span className="truncate">{ativ.atividade || 'Atividade específica'}</span>
                                       </div>
                                       <span className="text-[8px] tracking-wide font-extrabold uppercase bg-emerald-100 text-emerald-800 px-1 py-0.5 rounded shrink-0">Ativ</span>
                                    </button>
                                 ))}
                              </div>
                           </div>
                        )}
                     </div>

                     <div className="grid grid-cols-2 gap-3 border-t border-b border-slate-100 py-3">
                        <div className="flex items-center gap-2">
                           <Compass className="w-5 h-5 text-indigo-600 shrink-0" />
                           <div>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Distância</p>
                              <p className="font-bold text-slate-800 text-sm">{locInfo.distance} km</p>
                           </div>
                        </div>
                        <div className="flex items-center gap-2">
                           <Clock className="w-5 h-5 text-indigo-600 shrink-0" />
                           <div>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tempo Est.</p>
                              <p className="font-bold text-slate-800 text-sm">{locInfo.time} mins</p>
                           </div>
                        </div>
                     </div>

                     <div className="space-y-3">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Instruções de Navegação</p>
                        <div className="space-y-4 font-medium text-xs text-slate-700 max-h-[160px] overflow-y-auto custom-scrollbar pr-1">
                           {locInfo.steps.map((step, idx) => (
                              <div key={idx} className="flex gap-3">
                                 <div className="flex flex-col items-center">
                                    <div className="w-5 h-5 rounded-full bg-slate-100 text-[10px] font-bold flex items-center justify-center text-slate-500 border border-slate-200 shrink-0">
                                       {idx + 1}
                                    </div>
                                    {idx < locInfo.steps.length - 1 && <div className="w-0.5 h-6 bg-slate-200 mt-1" />}
                                 </div>
                                 <div className="flex-1 min-w-0">
                                    <p className="text-slate-800">{step.text}</p>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">{step.dist}</p>
                                 </div>
                              </div>
                           ))}
                        </div>
                     </div>

                     {isNavigating ? (
                        <div className="space-y-2 pt-2">
                           <div className="flex justify-between text-xs text-slate-500 font-bold">
                              <span>Simulação de Rota...</span>
                              <span>{navProgress}%</span>
                           </div>
                           <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                              <div className="h-full bg-blue-600 rounded-full transition-all duration-300" style={{ width: `${navProgress}%` }} />
                           </div>
                        </div>
                     ) : (
                        <div className="pt-2">
                           {navProgress === 100 ? (
                              <div className="bg-emerald-50 text-emerald-800 p-3 rounded-xl border border-emerald-200 text-xs font-bold text-center flex items-center justify-center gap-2">
                                 <Check className="w-4 h-4 stroke-[3]" /> Chegou ao destino de fiscalização!
                              </div>
                           ) : (
                              <button 
                                onClick={startNavSimulada}
                                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs uppercase tracking-wide flex items-center justify-center gap-2 transition-colors shadow-lg shadow-blue-100"
                              >
                                 <Navigation className="w-3.5 h-3.5" />
                                 Iniciar Navegação Simulada
                              </button>
                           )}
                        </div>
                     )}
                  </div>
               </div>
            </div>
         )}
      </div>
    </div>
  );
}
