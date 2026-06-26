import React, { useState, useEffect } from 'react';
import { db } from '../db/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { MapPin, Navigation, ArrowLeft, Clock, Compass, Activity, LayoutList, LayoutGrid, WifiOff, Crosshair } from 'lucide-react';
import { cn } from '../lib/utils';
import { useNavigate, useLocation } from 'react-router-dom';
import { type GeoCoords, useGeoLocation } from '../lib/geo';
import { buildRoutePlan, type RoutePlan, calculateDistanceKm, calculateBearing } from '../lib/routing';
import { prefetchOfflineMapTiles } from '../lib/mapOffline';
import { MapContainer, TileLayer, Popup, CircleMarker, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { DistrictLayer } from '../components/map/DistrictLayer';
import { MapLayerSwitcher, MAP_TILE_LAYERS, MAP_ATTRIBUTIONS, type MapProvider } from '../components/map/MapLayerSwitcher';

const DISTRICT_COORDS: Record<string, { lat: number; lng: number }> = {
  'Água Grande': { lat: 0.336, lng: 6.730 },
  'Mé-Zóchi': { lat: 0.270, lng: 6.650 },
  'Cantagalo': { lat: 0.220, lng: 6.700 },
  'Lobata': { lat: 0.355, lng: 6.645 },
  'Lembá': { lat: 0.360, lng: 6.480 },
  'Caué': { lat: 0.140, lng: 6.640 },
  'RAP': { lat: 1.630, lng: 7.400 }
};

function RouteViewport({ points }: { points: GeoCoords[] }) {
  const map = useMap();

  useEffect(() => {
    if (!points.length) return;
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 16);
      return;
    }
    map.fitBounds(points.map((point) => [point.lat, point.lng]), { padding: [32, 32], maxZoom: 17 });
  }, [map, points]);

  return null;
}

const getFirmaCoordinates = (firma: any) => {
  if (firma.geolocation) {
    return { lat: firma.geolocation.lat, lng: firma.geolocation.lng };
  }
  if (firma.atividades && firma.atividades.length > 0) {
    const activeAtiv = firma.atividades.find((a: any) => !!a.geolocation);
    if (activeAtiv && activeAtiv.geolocation) {
      return { lat: activeAtiv.geolocation.lat, lng: activeAtiv.geolocation.lng };
    }
  }
  return null;
};

const getDistance = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  return calculateDistanceKm({ lat: lat1, lng: lng1 }, { lat: lat2, lng: lng2 });
};

export default function Mapa() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as { selectedFirmaId?: string; selectedAtividadeId?: string } | null;

  const firmas = useLiveQuery(() => db.firmas.toArray());
  const [selectedFirmaId, setSelectedFirmaId] = useState<string | null>(state?.selectedFirmaId || null);
  const [selectedAtividadeId, setSelectedAtividadeId] = useState<string | null>(state?.selectedAtividadeId || null);
  const [isNavigating, setIsNavigating] = useState(false);
  const [routePlan, setRoutePlan] = useState<RoutePlan | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [offlineTilesCached, setOfflineTilesCached] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  
  // Novos estados para filtragem e paginação
  const [gpsFilter, setGpsFilter] = useState<'all' | 'mapped' | 'unmapped'>('all');
  const [visibleCount, setVisibleCount] = useState(15);
  const [mapProvider, setMapProvider] = useState<MapProvider>('osm');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(() =>
    (localStorage.getItem('drcae_view_mapa') as 'list' | 'grid') || 'list'
  );

  const toggleView = (mode: 'list' | 'grid') => {
    setViewMode(mode);
    localStorage.setItem('drcae_view_mapa', mode);
  };
  
  // Hook de Geolocalização Atual
  const { location: currentLoc, refresh: refreshGeo } = useGeoLocation();

  useEffect(() => {
    const up = () => setIsOnline(true);
    const down = () => setIsOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);

  const selectedFirma = firmas?.find(f => f.id === selectedFirmaId);

  // Contagem dinâmica das abas com base nos dados reais
  const counts = React.useMemo(() => {
    if (!firmas) return { all: 0, mapped: 0, unmapped: 0 };
    let mapped = 0;
    let unmapped = 0;
    firmas.forEach(f => {
      const hasGps = !!f.geolocation || (f.atividades?.some(a => !!a.geolocation) || false);
      if (hasGps) mapped++;
      else unmapped++;
    });
    return { all: firmas.length, mapped, unmapped };
  }, [firmas]);

  // Lógica de filtragem e ORDENAÇÃO por proximidade e presença de GPS
  const filteredFirmas = React.useMemo(() => {
    if (!firmas) return [];
    
    const baseLat = currentLoc?.lat ?? 0.336;
    const baseLng = currentLoc?.lng ?? 6.730;

    // Mapear firmas com dados de GPS e distância calculada
    const mappedWithDistance = firmas.map(f => {
      const coords = getFirmaCoordinates(f);
      let distance = Infinity;
      if (coords) {
        distance = getDistance(baseLat, baseLng, coords.lat, coords.lng);
      }
      return {
        firma: f,
        hasGps: !!coords,
        distance
      };
    });

    // Filtrar firmas
    const filtered = mappedWithDistance.filter(item => {
      const hasSomeGps = item.hasGps;
      if (gpsFilter === 'mapped' && !hasSomeGps) return false;
      if (gpsFilter === 'unmapped' && hasSomeGps) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const f = item.firma;
      return f.name.toLowerCase().includes(q) ||
             (f.nif && f.nif.toLowerCase().includes(q)) ||
             f.district.toLowerCase().includes(q) ||
             (f.address && f.address.toLowerCase().includes(q));
    });

    // Ordenação: 
    // 1. Firmas com GPS primeiro
    // 2. Entre firmas com GPS, as mais próximas da posição atual (ou capital) primeiro
    // 3. Em caso de empate, ordem alfabética
    filtered.sort((a, b) => {
      if (a.hasGps !== b.hasGps) {
        return a.hasGps ? -1 : 1;
      }
      if (a.hasGps && b.hasGps) {
        return a.distance - b.distance;
      }
      return (a.firma.name || '').localeCompare(b.firma.name || '');
    });

    return filtered.map(item => item.firma);
  }, [firmas, gpsFilter, searchQuery, currentLoc]);

  const totalFilteredCount = filteredFirmas.length;
  
  // Lógica de paginação
  const paginatedFirmas = React.useMemo(() => {
    return filteredFirmas.slice(0, visibleCount);
  }, [filteredFirmas, visibleCount]);

  // Handlers para mudança de filtro e pesquisa que restauram a paginação inicial
  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    setVisibleCount(15);
  };

  const handleFilterChange = (filter: 'all' | 'mapped' | 'unmapped') => {
    setGpsFilter(filter);
    setVisibleCount(15);
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    if (target.scrollHeight - target.scrollTop <= target.clientHeight + 100) {
      if (totalFilteredCount && visibleCount < totalFilteredCount) {
        setVisibleCount(prev => prev + 15);
      }
    }
  };

  const getFirmaLocationInfo = (firma: typeof selectedFirma, activeAtividadeId: string | null) => {
    if (!firma) return { lat: 0.336, lng: 6.730, distance: 0, time: 0, targetTitle: '', hasExactPoint: false };

    let lat = DISTRICT_COORDS[firma.district]?.lat || 0.336;
    let lng = DISTRICT_COORDS[firma.district]?.lng || 6.730;
    let hasExactPoint = false;
    let targetTitle = 'operador económico';

    const targetAtiv = activeAtividadeId ? (firma.atividades || []).find(a => a.id === activeAtividadeId) : null;

    if (targetAtiv && targetAtiv.geolocation) {
       lat = targetAtiv.geolocation.lat;
       lng = targetAtiv.geolocation.lng;
       targetTitle = `atividade específica: "${targetAtiv.atividade || 'Atividade'}"`;
       hasExactPoint = true;
    } else if (firma.geolocation) {
       lat = firma.geolocation.lat;
       lng = firma.geolocation.lng;
       hasExactPoint = true;
    } else if (firma.atividades && firma.atividades.length > 0 && firma.atividades[0].geolocation) {
       lat = firma.atividades[0].geolocation.lat;
       lng = firma.atividades[0].geolocation.lng;
       hasExactPoint = true;
    }

    const baseLat = currentLoc?.lat ?? 0.336;
    const baseLng = currentLoc?.lng ?? 6.730;
    const distanceKm = Math.round(calculateDistanceKm({ lat: baseLat, lng: baseLng }, { lat, lng }) * 10) / 10;

    return {
      lat,
      lng,
      distance: distanceKm,
      time: Math.max(2, Math.round(distanceKm * 3)),
      targetTitle,
      hasExactPoint,
    };
  };

  const locInfo = getFirmaLocationInfo(selectedFirma, selectedAtividadeId);
  const targetCoords: GeoCoords | null = selectedFirma ? { lat: locInfo.lat, lng: locInfo.lng } : null;
  const displayDistance = routePlan ? Math.round(routePlan.distanceKm * 10) / 10 : locInfo.distance;
  const displayTime = routePlan ? routePlan.durationMin : locInfo.time;
  const headingToTarget = currentLoc && targetCoords ? Math.round(calculateBearing(currentLoc, targetCoords)) : null;

  useEffect(() => {
    if (!selectedFirma || !currentLoc || !targetCoords || !locInfo.hasExactPoint) {
      setRoutePlan(null);
      return;
    }

    let cancelled = false;
    setRouteLoading(true);
    setRouteError(null);
    buildRoutePlan(currentLoc, targetCoords)
      .then((plan) => {
        if (!cancelled) setRoutePlan(plan);
      })
      .catch(() => {
        if (!cancelled) setRouteError('Não foi possível calcular rota neste momento.');
      })
      .finally(() => {
        if (!cancelled) setRouteLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    selectedFirma?.id,
    selectedAtividadeId,
    currentLoc?.lat,
    currentLoc?.lng,
    targetCoords?.lat,
    targetCoords?.lng,
    locInfo.hasExactPoint,
  ]);

  useEffect(() => {
    if (!firmas?.length || !isOnline) return;
    const geoPoints: GeoCoords[] = [];
    if (currentLoc) geoPoints.push(currentLoc);
    for (const firma of firmas) {
      if (firma.geolocation) geoPoints.push(firma.geolocation);
      for (const atividade of firma.atividades || []) {
        if (atividade.geolocation) geoPoints.push(atividade.geolocation);
      }
    }
    prefetchOfflineMapTiles(geoPoints)
      .then(({ cached }) => {
        if (cached) setOfflineTilesCached(prev => prev + cached);
      })
      .catch(() => {});
  }, [firmas, currentLoc?.lat, currentLoc?.lng, isOnline]);

  const routePoints = routePlan?.coordinates?.length
    ? routePlan.coordinates
    : currentLoc && targetCoords
      ? [currentLoc, targetCoords]
      : targetCoords
        ? [targetCoords]
        : [];
  const routeStatus = routePlan?.source === 'online'
    ? 'Rota viária online'
    : routePlan?.source === 'cached'
      ? 'Rota guardada offline'
      : routePlan?.source === 'direct'
        ? 'Direção offline por GPS'
        : routeLoading
          ? 'A calcular rota'
          : 'GPS aguardando rota';
  const navigationSteps = routePlan?.steps?.length
    ? routePlan.steps
    : [
        { text: currentLoc ? 'Partida da localização atual do agente' : 'Aguardando localização atual do agente', dist: '0 m' },
        {
          text: locInfo.hasExactPoint
            ? `Siga em direção ao ponto georreferenciado de ${locInfo.targetTitle}`
            : `Use ${selectedFirma?.district || 'o distrito'} como referência até marcar GPS exato`,
          dist: targetCoords && currentLoc ? `${displayDistance.toFixed(displayDistance < 10 ? 1 : 0)} km` : 'GPS',
        },
        { text: 'Confirme chegada quando estiver no operador económico', dist: 'Destino' },
      ];

  return (
    <div className="flex flex-col h-full bg-[#F5F7FA] dark:bg-slate-950">
      <div className="px-4 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0 sticky top-0 bg-white dark:bg-slate-900 z-10 flex items-center justify-between shadow-sm">
         <div className="flex items-center gap-3">
            {selectedFirmaId && (
               <button onClick={() => { setSelectedFirmaId(null); setIsNavigating(false); }} className="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100">
                  <ArrowLeft className="w-5 h-5" />
               </button>
            )}
            <h2 className="font-bold text-slate-900 dark:text-slate-100 tracking-tight">
               {selectedFirma ? "Visualizador de Rota" : "Mapa e Rotas"}
            </h2>
         </div>
      </div>

      <div 
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 md:p-6 custom-scrollbar"
      >
         {!selectedFirma ? (
            <div className="space-y-6">
               {/* Search Input and View Toggle Row */}
               <div className="flex gap-2 shrink-0 items-center mb-4">
                  <div className="relative flex-1">
                     <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
                        <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                     </span>
                     <input
                        type="text"
                        value={searchQuery}
                        onChange={e => handleSearchChange(e.target.value)}
                        placeholder="Pesquisar por designação, NIF, distrito ou morada..."
                        className="w-full pl-10 pr-10 py-3 bg-white dark:bg-slate-900 text-sm text-slate-800 dark:text-slate-100 rounded-xl border border-slate-200 dark:border-slate-800 focus:outline-hidden shadow-xs placeholder-slate-400"
                     />
                     {searchQuery && (
                        <button
                           onClick={() => handleSearchChange('')}
                           className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs font-bold font-mono"
                        >
                           Limpar
                        </button>
                     )}
                  </div>
                  
                  {/* View Mode Toggle Buttons */}
                  <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1 shrink-0 border border-slate-200/30">
                    <button
                      onClick={() => toggleView('list')}
                      className={cn(
                        'p-2 rounded-lg transition-colors cursor-pointer',
                        viewMode === 'list'
                          ? 'bg-white dark:bg-slate-700 text-blue-600 shadow-sm'
                          : 'text-slate-400 hover:text-slate-655 dark:hover:text-slate-200'
                      )}
                      title="Vista Lista"
                    >
                      <LayoutList className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => toggleView('grid')}
                      className={cn(
                        'p-2 rounded-lg transition-colors cursor-pointer',
                        viewMode === 'grid'
                          ? 'bg-white dark:bg-slate-700 text-blue-600 shadow-sm'
                          : 'text-slate-400 hover:text-slate-655 dark:hover:text-slate-200'
                      )}
                      title="Vista Cards"
                    >
                      <LayoutGrid className="w-4 h-4" />
                    </button>
                  </div>
               </div>

               <div className="bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-400 p-4 rounded-xl border border-blue-200 dark:border-blue-900/30 flex items-center gap-3">
                 <Navigation className="w-5 h-5 text-blue-600 dark:text-blue-500 shrink-0" />
                 <p className="text-sm font-medium">Selecione um operador económico abaixo para ver a sua geolocalização e traçar a rota diretamente na aplicação.</p>
               </div>

               {/* GPS Status Tabs */}
               <div className="flex bg-slate-100 dark:bg-slate-800 rounded-xl p-1 gap-1 text-xs font-bold w-full select-none shrink-0 border border-slate-200/40">
                 <button
                   onClick={() => handleFilterChange('all')}
                   className={cn(
                     'flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg transition-all cursor-pointer',
                     gpsFilter === 'all'
                       ? 'bg-white dark:bg-slate-700 text-blue-650 dark:text-blue-400 shadow-sm'
                       : 'text-slate-500 dark:text-slate-400 hover:text-slate-750 dark:hover:text-slate-200'
                   )}
                 >
                   <span>Todos</span>
                   <span className={cn(
                     'px-1.5 py-0.5 rounded-md text-[10px] font-extrabold transition-colors',
                     gpsFilter === 'all'
                       ? 'bg-blue-600 text-white dark:bg-blue-500'
                       : 'bg-slate-200/60 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400'
                   )}>
                     {counts.all}
                   </span>
                 </button>

                 <button
                   onClick={() => handleFilterChange('mapped')}
                   className={cn(
                     'flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg transition-all cursor-pointer',
                     gpsFilter === 'mapped'
                       ? 'bg-white dark:bg-slate-700 text-emerald-650 dark:text-emerald-450 shadow-sm'
                       : 'text-slate-500 dark:text-slate-400 hover:text-slate-750 dark:hover:text-slate-200'
                   )}
                 >
                   <span>Mapeados</span>
                   <span className={cn(
                     'px-1.5 py-0.5 rounded-md text-[10px] font-extrabold transition-colors',
                     gpsFilter === 'mapped'
                       ? 'bg-emerald-500 text-white dark:bg-emerald-500'
                       : 'bg-slate-200/60 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400'
                   )}>
                     {counts.mapped}
                   </span>
                 </button>

                 <button
                   onClick={() => handleFilterChange('unmapped')}
                   className={cn(
                     'flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg transition-all cursor-pointer',
                     gpsFilter === 'unmapped'
                       ? 'bg-white dark:bg-slate-700 text-slate-650 dark:text-slate-400 shadow-sm'
                       : 'text-slate-500 dark:text-slate-400 hover:text-slate-750 dark:hover:text-slate-200'
                   )}
                 >
                   <span>Sem GPS</span>
                   <span className={cn(
                     'px-1.5 py-0.5 rounded-md text-[10px] font-extrabold transition-colors',
                     gpsFilter === 'unmapped'
                       ? 'bg-slate-500 text-white dark:bg-slate-600'
                       : 'bg-slate-200/60 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400'
                   )}>
                     {counts.unmapped}
                   </span>
                 </button>
               </div>

               <div className={cn(
                  viewMode === 'grid' ? "grid grid-cols-2 md:grid-cols-3 gap-3" : "space-y-3"
               )}>
                  {paginatedFirmas.length === 0 ? (
                     <div className="col-span-full bg-white dark:bg-slate-900 p-8 rounded-2xl border border-slate-200 dark:border-slate-800 text-center space-y-2 w-full">
                        <MapPin className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
                        <p className="text-sm font-bold text-slate-600 dark:text-slate-300">Nenhum operador económico encontrado</p>
                        <p className="text-xs text-slate-400 dark:text-slate-500">Tente cadastrar um novo operador ou limpe os filtros.</p>
                     </div>
                  ) : (
                     paginatedFirmas.map(firma => {
                        const hasSomeGps = !!firma.geolocation || (firma.atividades?.some(a => !!a.geolocation));
                        
                        if (viewMode === 'grid') {
                           return (
                              <div 
                                 key={firma.id} 
                                 onClick={() => setSelectedFirmaId(firma.id!)}
                                 className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between cursor-pointer hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-md transition-all group gap-3.5 min-h-[160px]"
                               >
                                  <div className="flex justify-between items-start w-full gap-2">
                                     <div className={cn(
                                        "w-10 h-10 rounded-full flex items-center justify-center shrink-0 shadow-xs",
                                        hasSomeGps ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400" : "bg-slate-100 dark:bg-slate-800 text-slate-400"
                                     )}>
                                        <MapPin className="w-5 h-5" />
                                     </div>
                                     <button className="w-8 h-8 bg-blue-50 dark:bg-blue-900/30 group-hover:bg-blue-600 group-hover:text-white text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center transition-all shrink-0">
                                        <Navigation className="w-3.5 h-3.5" />
                                     </button>
                                  </div>
                                  <div className="min-w-0 text-left">
                                     <h3 className="font-bold text-slate-900 dark:text-slate-100 leading-tight truncate group-hover:text-blue-600 dark:group-hover:text-blue-400">{firma.name}</h3>
                                     <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">{firma.address || `${firma.district}, São Tomé`}</p>
                                  </div>
                                  <span className={cn(
                                     "text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full self-start inline-block",
                                     hasSomeGps ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-400" : "bg-slate-100 dark:bg-slate-800 text-slate-500"
                                  )}>
                                     {hasSomeGps ? "📍 Coordenadas" : "NIF: " + (firma.nif || "Formal")}
                                  </span>
                               </div>
                           );
                        }

                        // viewMode === 'list'
                        return (
                           <div 
                             key={firma.id} 
                             onClick={() => setSelectedFirmaId(firma.id!)}
                             className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between cursor-pointer hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-md transition-all group"
                           >
                              <div className="flex items-center gap-4 min-w-0">
                                 <div className={cn(
                                    "w-12 h-12 rounded-full flex items-center justify-center shrink-0 shadow-xs",
                                    hasSomeGps ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400" : "bg-slate-100 dark:bg-slate-800 text-slate-400"
                                 )}>
                                    <MapPin className="w-6 h-6" />
                                 </div>
                                 <div className="flex-1 min-w-0 text-left">
                                    <h3 className="font-bold text-slate-900 dark:text-slate-100 truncate group-hover:text-blue-600 dark:group-hover:text-blue-400">{firma.name}</h3>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{firma.address || `${firma.district}, São Tomé`}</p>
                                    <span className={cn(
                                       "text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full mt-1 inline-block",
                                       hasSomeGps ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-400" : "bg-slate-100 dark:bg-slate-800 text-slate-500"
                                    )}>
                                       {hasSomeGps ? "📍 Coordenadas Gravadas" : "NIF: " + (firma.nif || "Formal")}
                                    </span>
                                 </div>
                              </div>
                              <button className="w-10 h-10 bg-blue-50 dark:bg-blue-900/30 group-hover:bg-blue-600 group-hover:text-white text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center transition-all shrink-0">
                                 <Navigation className="w-4 h-4" />
                              </button>
                           </div>
                        );
                     })
                  )}

                  {/* Progressive loading loader / feedback */}
                  {totalFilteredCount > visibleCount && (
                     <div className="col-span-full py-4 text-center text-xs text-slate-400 dark:text-slate-500 font-semibold uppercase tracking-wider animate-pulse">
                        Rolar para ver mais operadores...
                     </div>
                  )}
               </div>
            </div>
         ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
               {/* Map View */}
               <div className="lg:col-span-2 space-y-4">
                  <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden h-[320px] md:h-[480px] relative">
                     <MapContainer
                        center={locInfo.lat !== 0 ? [locInfo.lat, locInfo.lng] : [0.336, 6.730]}
                        zoom={locInfo.lat !== 0 ? 16 : 10}
                        scrollWheelZoom={true}
                        className="h-full w-full"
                     >
                        {mapProvider !== 'simple' && (
                           <TileLayer
                              attribution={MAP_ATTRIBUTIONS[mapProvider]}
                              url={MAP_TILE_LAYERS[mapProvider as Exclude<MapProvider, 'simple'>]}
                           />
                        )}
                        <DistrictLayer fillOpacity={mapProvider === 'simple' ? 0.5 : 0.07} />
                        <RouteViewport points={routePoints} />
                        {routePlan?.coordinates?.length ? (
                           <Polyline
                              positions={routePlan.coordinates.map((point) => [point.lat, point.lng])}
                              pathOptions={{
                                 color: routePlan.source === 'direct' ? '#0f766e' : '#2563eb',
                                 weight: 5,
                                 opacity: 0.86,
                                 dashArray: routePlan.source === 'direct' ? '8 8' : undefined,
                              }}
                           />
                        ) : currentLoc && targetCoords ? (
                           <Polyline
                              positions={[[currentLoc.lat, currentLoc.lng], [targetCoords.lat, targetCoords.lng]]}
                              pathOptions={{ color: '#0f766e', weight: 4, opacity: 0.72, dashArray: '8 8' }}
                           />
                        ) : null}
                        {currentLoc && (
                           <CircleMarker
                              center={[currentLoc.lat, currentLoc.lng]}
                              radius={9}
                              pathOptions={{ color: '#1d4ed8', fillColor: '#3b82f6', fillOpacity: 0.85, weight: 3 }}
                           >
                              <Popup>
                                 <div className="text-xs font-sans">
                                    <p className="font-bold">Localização atual</p>
                                    <p className="text-slate-500">
                                       {currentLoc.accuracy ? `Precisão ${Math.round(currentLoc.accuracy)} m` : 'GPS ativo'}
                                    </p>
                                 </div>
                              </Popup>
                           </CircleMarker>
                        )}
                        {targetCoords && (
                           <CircleMarker
                              center={[targetCoords.lat, targetCoords.lng]}
                              radius={10}
                              pathOptions={{ color: '#064e3b', fillColor: locInfo.hasExactPoint ? '#10b981' : '#f59e0b', fillOpacity: 0.9, weight: 3 }}
                           >
                              <Popup>
                                 <div className="text-xs font-sans">
                                    <p className="font-bold">{selectedFirma.name}</p>
                                    <p className="text-slate-500">
                                       {locInfo.hasExactPoint ? selectedFirma.district : 'Referência por distrito'}
                                    </p>
                                 </div>
                              </Popup>
                           </CircleMarker>
                        )}
                     </MapContainer>
                     <MapLayerSwitcher value={mapProvider} onChange={setMapProvider} />
                     <div className="absolute left-2 bottom-2 z-[999] rounded-lg bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-[10px] font-bold text-slate-600 dark:text-slate-300 shadow-sm">
                        {routeStatus}
                     </div>
                  </div>
               </div>

               {/* Route Detail Panels */}
               <div className="space-y-4 flex flex-col">
                  <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
                     <div>
                        <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400">Operador</span>
                        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-1">{selectedFirma.name}</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{selectedFirma.address || selectedFirma.district}</p>

                        {/* Active Operations Bar */}
                        <div className="flex gap-2.5 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                           <button
                              onClick={() => navigate(`/firmas/${selectedFirma.id}`)}
                              className="flex-1 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-lg text-[10px] uppercase tracking-wider text-center border border-slate-200 dark:border-slate-700 transition-colors"
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
                           <div className="border-t border-slate-100 dark:border-slate-800 pt-3 mt-3 text-left">
                              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Atividades Mapeadas ({selectedFirma.atividades.filter(a => a.geolocation).length})</span>
                              <div className="space-y-1.5 mt-2 max-h-[140px] overflow-y-auto custom-scrollbar">
                                 {/* Ponto principal */}
                                 <button
                                    type="button"
                                    onClick={() => {
                                       setSelectedAtividadeId(null);
                                       setIsNavigating(false);
                                    }}
                                    className={cn(
                                       "w-full text-left p-2 rounded-lg text-[11px] font-semibold flex items-center justify-between border transition-all",
                                       selectedAtividadeId === null 
                                         ? "bg-slate-900 text-white border-slate-950 font-black shadow-3xs"
                                         : "bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 border-slate-200/60 dark:border-slate-700 text-slate-700 dark:text-slate-300"
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
                                       }}
                                       className={cn(
                                          "w-full text-left p-2 rounded-lg text-[11px] font-semibold flex items-center justify-between border transition-all",
                                          selectedAtividadeId === ativ.id 
                                            ? "bg-slate-900 text-white border-slate-950 font-black shadow-3xs"
                                            : "bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 border-slate-200/60 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                                       )}
                                    >
                                       <div className="flex items-center gap-1.5 truncate text-left">
                                          <Activity className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
                                          <span className="truncate">{ativ.atividade || 'Atividade específica'}</span>
                                       </div>
                                       <span className="text-[8px] tracking-wide font-extrabold uppercase bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-400 px-1 py-0.5 rounded shrink-0">Ativ</span>
                                    </button>
                                 ))}
                              </div>
                           </div>
                        )}
                     </div>

                     <div className="grid grid-cols-2 gap-3 border-t border-b border-slate-100 dark:border-slate-800 py-3">
                        <div className="flex items-center gap-2">
                           <Compass className="w-5 h-5 text-indigo-600 shrink-0" />
                           <div>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Distância</p>
                              <p className="font-bold text-slate-800 dark:text-slate-100 text-sm">{displayDistance.toFixed(displayDistance < 10 ? 1 : 0)} km</p>
                           </div>
                        </div>
                        <div className="flex items-center gap-2">
                           <Clock className="w-5 h-5 text-indigo-600 shrink-0" />
                           <div>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tempo Est.</p>
                              <p className="font-bold text-slate-800 dark:text-slate-100 text-sm">{displayTime} mins</p>
                           </div>
                        </div>
                     </div>

                     <div className="grid grid-cols-2 gap-2">
                        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2">
                           <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">GPS</p>
                           <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                              {currentLoc?.accuracy ? `${Math.round(currentLoc.accuracy)} m` : currentLoc ? 'Ativo' : 'Aguardando'}
                           </p>
                        </div>
                        <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2">
                           <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Rumo</p>
                           <p className="text-xs font-bold text-slate-700 dark:text-slate-200">
                              {headingToTarget != null ? `${headingToTarget}°` : routeStatus}
                           </p>
                        </div>
                     </div>

                     {(!isOnline || routePlan?.source !== 'online') && (
                        <div className="rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 flex gap-2 text-amber-800 dark:text-amber-300">
                           <WifiOff className="w-4 h-4 shrink-0 mt-0.5" />
                           <p className="text-xs font-semibold">
                              {routePlan?.source === 'cached'
                                ? 'Usando rota guardada no dispositivo.'
                                : 'Sem rota viária online: a orientação usa GPS real até ao ponto.'}
                           </p>
                        </div>
                     )}

                     {offlineTilesCached > 0 && (
                        <div className="rounded-lg border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                           {offlineTilesCached} partes de mapa guardadas para uso offline.
                        </div>
                     )}

                     <div className="space-y-3">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Instruções de Navegação</p>
                        <div className="space-y-4 font-medium text-xs text-slate-700 dark:text-slate-300 max-h-[160px] overflow-y-auto custom-scrollbar pr-1">
                           {navigationSteps.map((step, idx) => (
                              <div key={idx} className="flex gap-3">
                                 <div className="flex flex-col items-center">
                                    <div className="w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-800 text-[10px] font-bold flex items-center justify-center text-slate-500 border border-slate-200 dark:border-slate-700 shrink-0">
                                       {idx + 1}
                                    </div>
                                    {idx < navigationSteps.length - 1 && <div className="w-0.5 h-6 bg-slate-200 dark:bg-slate-700 mt-1" />}
                                 </div>
                                 <div className="flex-1 min-w-0">
                                    <p className="text-slate-800 dark:text-slate-200">{step.text}</p>
                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">{step.dist}</p>
                                 </div>
                              </div>
                           ))}
                        </div>
                     </div>

                     {isNavigating ? (
                        <div className="space-y-2 pt-2">
                           <div className="rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/60 px-3 py-2 text-xs font-semibold text-blue-800 dark:text-blue-300 flex gap-2">
                              <Crosshair className="w-4 h-4 shrink-0" />
                              <span>Navegação real ativa: a rota será recalculada conforme o GPS atualizar.</span>
                           </div>
                           <button
                              onClick={() => setIsNavigating(false)}
                              className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs uppercase tracking-wide flex items-center justify-center gap-2 transition-colors"
                           >
                              Parar Navegação
                           </button>
                        </div>
                     ) : (
                        <div className="pt-2">
                           <button
                             onClick={() => {
                               refreshGeo();
                               setIsNavigating(true);
                             }}
                             disabled={!currentLoc || !targetCoords || !locInfo.hasExactPoint}
                             className={cn(
                               "w-full py-3 font-bold rounded-xl text-xs uppercase tracking-wide flex items-center justify-center gap-2 transition-colors shadow-lg",
                               currentLoc && targetCoords && locInfo.hasExactPoint
                                 ? "bg-blue-600 hover:bg-blue-700 text-white shadow-blue-100"
                                 : "bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 cursor-not-allowed shadow-none"
                             )}
                           >
                              <Navigation className="w-3.5 h-3.5" />
                              {routeLoading ? 'A Calcular Rota...' : 'Iniciar Navegação Real'}
                           </button>
                           {routeError && <p className="text-[11px] text-red-600 dark:text-red-400 font-semibold mt-2">{routeError}</p>}
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
