import React from 'react';
import { useNovaVisitaForm } from '../context';
import '../leafletIcons';
import { Map as MapIcon } from 'lucide-react';
import { AlertTriangle, CheckCircle, MapPin, Users } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { toast } from '../../../lib/notifications';
import { isWebviewMode } from '../../../lib/geo';
import { DistrictLayer } from '../../../components/map/DistrictLayer';
import { MAP_ATTRIBUTIONS, MAP_TILE_LAYERS, MapLayerSwitcher } from '../../../components/map/MapLayerSwitcher';
import type { MapProvider } from '../../../components/map/MapLayerSwitcher';
import { MapContainer, Marker, TileLayer } from 'react-leaflet';
import ReconhecimentoCobertura from './ReconhecimentoCobertura';
import EvidenciaPreview, { isVideo } from '../../../components/EvidenciaPreview';
import VideoThumb from '../../../components/VideoThumb';
import RevisaoApreensaoPrecos from './RevisaoApreensaoPrecos';
import ComplaintReviewCard from './ComplaintReviewCard';
import type { ComplaintVerification, DenunciaCampo } from '../../../db/db';

/**
 * Revisão final e auto-certificação, antes de lavrar a acta.
 *
 * O estado vive no componente-pai e chega por contexto — ver `../context.ts`.
 */
export default function StepRevisao({ complaint, verification }: {
  complaint?: DenunciaCampo;
  verification: ComplaintVerification | null;
}) {
  const {
    anexos,
    atividadeEconomica,
    date,
    firmaId,
    firmas,
    infracoes,
    location,
    mapProvider,
    notes,
    recomendacoes,
    refreshGeo,
    representante,
    selectedPreview,
    setMapProvider,
    setSelectedPreview,
    technicians,
    time,
  } = useNovaVisitaForm();

  return (
  <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300 pb-12">
     <div className="bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/30 dark:to-teal-900/30 text-emerald-800 dark:text-emerald-300 p-6 rounded-2xl border border-emerald-200 dark:border-emerald-800 flex flex-col items-center text-center shadow-xs">
        <CheckCircle className="w-12 h-12 mb-2 text-emerald-600 dark:text-emerald-400 animate-pulse" />
        <h3 className="font-extrabold text-lg text-slate-800 dark:text-slate-100">Revisão e Auto-Certificação</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm font-semibold leading-relaxed">
           Verifique com rigor todas as evidências e declarações recolhidas antes de submeter a ata de fiscalização.
        </p>
     </div>

     {/* Informações Gerais & Operador */}
     <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4 shadow-3xs font-sans">
        <div className="border-b border-slate-100 dark:border-slate-800 pb-2">
           <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-left">Identidade do Operador</h4>
           <h3 className="text-base font-black text-slate-800 dark:text-slate-100 mt-0.5 text-left text-wrap leading-tight">
              {firmas?.find(f => f.id === firmaId)?.name || 'N/A'}
           </h3>
           <p className="text-xs text-slate-500 dark:text-slate-400 font-medium text-left mt-1">
              Atividade Principal em Vistoria: <span className="font-bold text-slate-700 dark:text-slate-200">{atividadeEconomica || 'N/A'}</span>
           </p>
        </div>

        <div className="grid grid-cols-2 gap-4 text-xs font-sans text-left">
           <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Data e Hora do Registo</p>
              <p className="font-bold text-slate-700 dark:text-slate-200 mt-0.5">{date} às {time}</p>
           </div>
           {representante.name && (
              <div>
                 <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-wrap">Declarou perante</p>
                 <p className="font-bold text-slate-700 dark:text-slate-200 mt-0.5">{representante.name}</p>
                 {representante.docNumber && (
                   <p className="text-[10px] text-slate-400 mt-0.5 font-mono uppercase">
                     {representante.docType} · {representante.docNumber}
                   </p>
                 )}
              </div>
           )}
        </div>
     </div>

     {/* Equipa Destacada */}
     <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3 shadow-3xs font-sans text-left">
        <h4 className="text-[10px] font-bold text-indigo-500 dark:text-indigo-400 uppercase tracking-widest flex items-center gap-1">
           <Users className="w-3.5 h-3.5 animate-pulse" />
           Técnicos de Serviço Diário ({technicians.length})
        </h4>
        <div className="flex flex-wrap gap-2 pt-1">
           {technicians.map((tech, idx) => (
              <span key={idx} className="text-xs font-semibold px-2.5 py-1.5 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-900 dark:text-indigo-200 border border-indigo-100 dark:border-indigo-800 rounded-xl flex items-center gap-1">
                 <div className="w-1.5 h-1.5 bg-indigo-500 dark:bg-indigo-400 rounded-full" />
                 {tech.name}
              </span>
           ))}
        </div>
     </div>

     {/* Georreferenciação da Atividade (Mapa) */}
     <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3 shadow-3xs font-sans text-left">
        <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
           <MapIcon className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
           Georreferenciação Localizada (Ata de Visita)
        </h4>
        {location ? (
           <div className="space-y-3">
              <div className="bg-slate-50 dark:bg-slate-800 p-2.5 rounded-xl border border-slate-100 dark:border-slate-700 text-[11px] font-mono text-slate-600 dark:text-slate-300 flex justify-between items-center">
                 <span>Lat: {location.lat.toFixed(6)}</span>
                 <span>Lng: {location.lng.toFixed(6)}</span>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden h-[200px] w-full relative">
                 <MapContainer
                    center={[location.lat, location.lng]}
                    zoom={16}
                    scrollWheelZoom={false}
                    className="h-full w-full"
                    zoomControl={false}
                 >
                    {mapProvider !== 'simple' && (
                       <TileLayer
                          attribution={MAP_ATTRIBUTIONS[mapProvider]}
                          url={MAP_TILE_LAYERS[mapProvider as Exclude<MapProvider, 'simple'>]}
                       />
                    )}
                    <DistrictLayer fillOpacity={mapProvider === 'simple' ? 0.5 : 0.07} />
                    <Marker position={[location.lat, location.lng]} />
                 </MapContainer>
                 <MapLayerSwitcher value={mapProvider} onChange={setMapProvider} />
              </div>
              {(() => {
                 const selectedFirma = firmas?.find(f => f.id === firmaId);
                 const isMissingCoordinates = selectedFirma && (!selectedFirma.geolocation || !(selectedFirma.atividades?.find(a => a.atividade === atividadeEconomica)?.geolocation));
                 if (isMissingCoordinates) {
                    return (
                       <div className="mt-3 p-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-100 rounded-xl text-xs font-semibold leading-relaxed flex items-start gap-2.5 shadow-3xs">
                          <MapPin className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5 animate-bounce" />
                          <div>
                             <p className="font-extrabold text-amber-950 dark:text-amber-300 uppercase tracking-wide text-[9px] mb-0.5">Captura de Ponto do Operador Ativa</p>
                             <p className="text-slate-600 dark:text-slate-300 leading-normal">
                                Este operador não tem coordenadas registadas. Ao finalizar, as coordenadas atuais <span className="font-bold text-slate-800 dark:text-slate-100">({location.lat.toFixed(5)}, {location.lng.toFixed(5)})</span> serão guardadas automaticamente como o ponto oficial de <b className="dark:text-slate-200">{selectedFirma.name}</b>.
                             </p>
                          </div>
                       </div>
                    );
                 }
                 return null;
              })()}
           </div>
        ) : (
           <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-900/40 text-center text-xs space-y-2">
              <p className="text-amber-800 dark:text-amber-400 font-bold">Sem Sinal GPS Ativo</p>
              <p className="text-amber-700 dark:text-amber-300 font-medium leading-relaxed">
                {isWebviewMode()
                  ? 'A aguardar dados de localização do dispositivo nativo. Certifique-se de que o GPS está ativo.'
                  : 'As coordenadas não puderam ser obtidas. Certifique-se de que o browser tem ativa a permissão de localização.'}
              </p>
              <button
                 type="button"
                 onClick={refreshGeo}
                 className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-[10px] rounded-lg tracking-wider uppercase"
              >
                 Tentar Capturar GPS
              </button>
           </div>
        )}
     </div>

     {/* Infrações Registadas */}
     <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4 shadow-3xs font-sans text-left">
        <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-2">
           <h4 className="text-[10px] font-bold text-red-600 dark:text-red-400 uppercase tracking-widest flex items-center gap-1">
              <AlertTriangle className="w-4 h-4" />
              Não Conformidades detetadas ({infracoes.length})
           </h4>
        </div>
        {infracoes.length === 0 ? (
           <div className="p-3 bg-emerald-50/50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-900/40 rounded-xl text-center text-xs font-semibold text-emerald-800 dark:text-emerald-400">
              ✅ Nenhuma infração detetada nesta verificação.
           </div>
        ) : (
           <div className="space-y-3">
              {infracoes.map((inf, i) => (
                 <div key={i} className="p-3 bg-red-50/30 dark:bg-red-900/20 border border-red-100 dark:border-red-900/30 rounded-xl space-y-1">
                    <div className="flex justify-between items-start gap-2">
                       <p className="font-extrabold text-xs text-slate-800 dark:text-slate-100 leading-normal">{inf.type}</p>
                       <span className={cn(
                          "text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider shrink-0 leading-none",
                          inf.severity === 'Crítica' ? "bg-red-600 text-white animate-pulse" :
                          inf.severity === 'Alta' ? "bg-orange-100 dark:bg-orange-900/40 text-orange-950 dark:text-orange-300" : "bg-amber-100 dark:bg-amber-900/40 text-amber-950 dark:text-amber-300"
                       )}>{inf.severity}</span>
                    </div>
                 </div>
              ))}
           </div>
        )}
     </div>

     <RevisaoApreensaoPrecos />

     <ComplaintReviewCard complaint={complaint} verification={verification} evidenceCount={anexos.length} />

     {/* Recomendações Emitidas */}
     <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3 shadow-3xs font-sans text-left">
        <h4 className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest flex items-center gap-1">
           ✦ Recomendações Aplicadas ao Operador ({recomendacoes.length})
        </h4>
        {recomendacoes.length === 0 ? (
           <p className="text-xs text-slate-400 font-medium pl-1">Nenhuma recomendação preventiva emitida nesta vistoria.</p>
        ) : (
           <ul className="space-y-2">
              {recomendacoes.map(({ texto }) => (
                 <li key={texto} className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex gap-2 items-start leading-relaxed bg-slate-50/70 dark:bg-slate-800/70 p-3 rounded-xl border border-slate-100 dark:border-slate-700 text-left">
                    <span className="text-indigo-600 dark:text-indigo-400 font-black">•</span>
                    <span className="flex-1">{texto}</span>
                 </li>
              ))}
           </ul>
        )}
     </div>

     {/* Provas em Miniaturas e Pré-Visualização */}
     <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3 shadow-3xs font-sans text-left">
        <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
           Evidências Anexadas ({anexos.length})
        </h4>
        {anexos.length === 0 ? (
           <p className="text-xs text-slate-400 font-medium pl-1">Sem fotografias ou ficheiros anexados.</p>
        ) : (
           <div className="grid grid-cols-4 gap-2.5">
              {anexos.map((anx) => (
                 <div 
                    key={anx.localId} 
                    onClick={() => {
                       // Imagem e vídeo abrem o visualizador; o resto — PDF,
                       // folha de cálculo — não é pré-visualizável na app.
                       if (anx.file.type.startsWith('image/') || isVideo(anx.file.type, anx.file.name)) {
                          setSelectedPreview({ url: anx.url, type: anx.file.type, name: anx.file.name });
                       } else {
                          toast.info(`Ficheiro de tipo ${anx.file.type || 'desconhecido'}: ${anx.file.name}`);
                       }
                    }}
                    className="relative aspect-square rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 cursor-pointer hover:border-indigo-400 dark:hover:border-indigo-500 hover:scale-105 transition-all shadow-3xs group"
                 >
                    {anx.file.type.startsWith('image/') ? (
                       <>
                          <img referrerPolicy="no-referrer" src={anx.url} alt="anexo" className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-slate-900/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-[9px] text-white font-bold uppercase transition-opacity">Ver</div>
                       </>
                    ) : isVideo(anx.file.type, anx.file.name) ? (
                       /* Primeiro fotograma como miniatura: a extensão sozinha
                          não deixava conferir, antes de fechar a acta, que o
                          vídeo tinha ficado utilizável. */
                       <VideoThumb url={anx.url} />
                    ) : (
                       <div className="flex flex-col h-full items-center justify-center p-1 bg-slate-50 dark:bg-slate-800 text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase leading-normal">
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
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-2 shadow-3xs font-sans text-left">
           <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Observações Gerais</h4>
           <p className="text-xs text-slate-700 dark:text-slate-200 font-medium leading-relaxed bg-slate-50 dark:bg-slate-800 p-3 rounded-xl border border-slate-100 dark:border-slate-700 whitespace-pre-wrap">{notes}</p>
        </div>
     )}

     {/* A certificação fecha a página, e não a abre: declarar o que ficou por
         registar antes de ter percorrido o que foi registado é assinar sem ler.
         Estando no fim, o agente só lá chega depois de passar por tudo. */}
     <div className="bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/30 dark:to-teal-900/30 border border-emerald-200 dark:border-emerald-800 rounded-2xl p-5 shadow-xs">
        <ReconhecimentoCobertura />
     </div>

     <EvidenciaPreview evidencia={selectedPreview} onFechar={() => setSelectedPreview(null)} />

  </div>
  );
}
