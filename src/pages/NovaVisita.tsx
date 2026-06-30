import React, { useState, useRef, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useGeoLocation, isWebviewMode } from '../lib/geo';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { DistrictLayer } from '../components/map/DistrictLayer';
import { MapLayerSwitcher, MAP_TILE_LAYERS, MAP_ATTRIBUTIONS, type MapProvider } from '../components/map/MapLayerSwitcher';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});
import { db, generateId, Visita, Infracao, Anexo, RecomendacaoHistorica, AtividadeEconomica } from '../db/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, MapPin, Camera, Video, FolderOpen, X, Check, Map, CheckCircle, Search, Plus, Users, AlertTriangle, ChevronDown, ChevronRight, History } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '../lib/utils';
import { toast } from '../lib/notifications';
import { generateOfflineCode } from '../lib/offlineCode';
import InfractionDetailDrawer from '../components/InfractionDetailDrawer';
import CameraCapture from '../components/CameraCapture';
import SpeechInputButton from '../components/SpeechInputButton';
import { triggerFullSyncIfReachable } from '../lib/sync';

type FirmaDistanceMeta = {
  distanceKm: number | null;
  hasCoordinates: boolean;
};

const getCachedRamos = (): string[] => {
  try {
    const cached = localStorage.getItem('drcae_branches');
    if (cached) {
      const parsed = JSON.parse(cached) as { name: string }[];
      if (parsed.length > 0) {
        return parsed.map(b => b.name);
      }
    }
  } catch (e) {
    console.error('[drcae] Falha ao ler ramos de atividade do cache:', e);
  }
  return ['Restauração', 'Comércio Misto', 'Alojamento', 'Prestação de Serviço', 'Indústria', 'Outro'];
};

const RAMOS = getCachedRamos();

const DRAFT_STATE_KEY = 'drcae_nova_visita_draft';
const MAX_DRAFT_FILES_BYTES = 8 * 1024 * 1024; // 8 MB
const ATTACHMENT_READ_TIMEOUT_MS = 120_000;

type PendingAnexo = {
  localId: string;
  file: File;
  url: string;
  data?: string;
  readError?: string;
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const timeoutId = window.setTimeout(() => {
      reader.abort();
      reject(new Error(`Tempo esgotado ao ler ${file.name}.`));
    }, ATTACHMENT_READ_TIMEOUT_MS);
    reader.onload = () => {
      window.clearTimeout(timeoutId);
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error(`Conteúdo inválido em ${file.name}.`));
      }
    };
    reader.onerror = () => {
      window.clearTimeout(timeoutId);
      reject(reader.error || new Error(`Erro ao ler ${file.name}.`));
    };
    reader.onabort = () => {
      window.clearTimeout(timeoutId);
      reject(new Error(`Leitura abortada para ${file.name}.`));
    };
    reader.readAsDataURL(file);
  });
}

function base64ToFile(data: string, name: string, type: string): File {
  const arr = data.split(',');
  const bstr = atob(arr[1]);
  const u8arr = new Uint8Array(bstr.length);
  for (let i = 0; i < bstr.length; i++) u8arr[i] = bstr.charCodeAt(i);
  return new File([new Blob([u8arr], { type })], name, { type });
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function calculateDistanceKm(
  origin: { lat: number; lng: number },
  target: { lat: number; lng: number },
): number {
  const earthRadiusKm = 6371;
  const dLat = toRadians(target.lat - origin.lat);
  const dLng = toRadians(target.lng - origin.lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(origin.lat)) *
      Math.cos(toRadians(target.lat)) *
      Math.sin(dLng / 2) ** 2;

  return earthRadiusKm * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function getFirmaReferencePoint(firma: { geolocation?: { lat: number; lng: number } | null; atividades?: AtividadeEconomica[] }) {
  if (firma.geolocation?.lat != null && firma.geolocation?.lng != null) {
    return firma.geolocation;
  }

  return firma.atividades?.find((atividade) => atividade.geolocation?.lat != null && atividade.geolocation?.lng != null)?.geolocation || null;
}

function formatDistanceLabel(distanceKm: number | null): string | null {
  if (distanceKm == null) return null;
  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)} m`;
  }
  return `${distanceKm.toFixed(distanceKm < 10 ? 1 : 0)} km`;
}

export default function NovaVisita() {
  const navigate = useNavigate();
  const locationState = useLocation().state as { firmaId?: string } | null;
  const firmas = useLiveQuery(() => db.firmas.toArray());

  const [equipeNaoDefinida] = useState(() => localStorage.getItem('drcae_equipe_definida') !== 'true');

  const [step, setStep] = useState(1);
  const [firmaId, setFirmaId] = useState(locationState?.firmaId || '');
  const [representante, setRepresentante] = useState('');
  const [atividadeEconomica, setAtividadeEconomica] = useState('');
  const [visibleFirmsCount, setVisibleFirmsCount] = useState(15);
  
  const [showAddAtividade, setShowAddAtividade] = useState(false);
  const [newAtivRamo, setNewAtivRamo] = useState('');
  const [newAtivAtividade, setNewAtivAtividade] = useState('');
  const [newAtivLocal, setNewAtivLocal] = useState('');
  const [isSavingAtividade, setIsSavingAtividade] = useState(false);
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [time, setTime] = useState(format(new Date(), 'HH:mm'));
  const [technicians, setTechnicians] = useState<string[]>(() => {
    const saved = localStorage.getItem('drcae_equipe');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return [];
      }
    }
    return [];
  });
  const [newTechName, setNewTechName] = useState('');
  const { location, refresh: refreshGeo } = useGeoLocation();
  const [mapProvider, setMapProvider] = useState<MapProvider>('osm');

  const [infracoes, setInfracoes] = useState<{type: string, severity: string, minimum_penalty?: string, maximum_penalty?: string}[]>([]);
  const [selectedInfraction, setSelectedInfraction] = useState<{type: string, severity: string, legalInstrument?: string, details?: string} | null>(null);

  const [recomendacoes, setRecomendacoes] = useState<string[]>([]);
  const [recomendacoesHistoricas, setRecomendacoesHistoricas] = useState<RecomendacaoHistorica[]>([]);
  const [historicoVisitas, setHistoricoVisitas] = useState<{id: string, date: string, technicians: string[], recomendacoes: string[]}[]>([]);
  const [customRecommendation, setCustomRecommendation] = useState('');
  const [searchInfracao, setSearchInfracao] = useState('');
  const [showCamera, setShowCamera] = useState(false);
  const [cameraMode, setCameraMode] = useState<'photo' | 'video'>('photo');
  const [showDraftBanner, setShowDraftBanner] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Produtos de Cesta Básica
  const [supplyProducts, setSupplyProducts] = useState<{id: number, name: string, grossPrice: number | null, retailPrice: number | null}[]>([]);
  const [supplyStatus, setSupplyStatus] = useState<'idle'|'loading'|'active'|'none'>('idle');
  const [produtosPrices, setProdutosPrices] = useState<Record<number, {gross: string, retail: string}>>({});

  const [notes, setNotes] = useState('');
  const [anexos, setAnexos] = useState<PendingAnexo[]>([]);
  const [selectedPreview, setSelectedPreview] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [search, setSearch] = useState('');

  const filteredFirmas = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    return (firmas || [])
      .filter((firma) =>
        !normalizedSearch ||
        (firma.name || '').toLowerCase().includes(normalizedSearch) ||
        (firma.nif || '').includes(normalizedSearch),
      )
      .map((firma) => {
        const point = location ? getFirmaReferencePoint(firma) : null;
        const distanceKm = point && location
          ? calculateDistanceKm(location, point)
          : null;

        return {
          firma,
          distanceKm,
          hasCoordinates: distanceKm != null,
        };
      })
      .sort((left, right) => {
        if (left.hasCoordinates && right.hasCoordinates) {
          return (left.distanceKm ?? Number.POSITIVE_INFINITY) - (right.distanceKm ?? Number.POSITIVE_INFINITY);
        }
        if (left.hasCoordinates) return -1;
        if (right.hasCoordinates) return 1;
        return (left.firma.name || '').localeCompare(right.firma.name || '', 'pt');
      });
  }, [firmas, location, search]);

  const handleSearchChange = (val: string) => {
    setSearch(val);
    setVisibleFirmsCount(15);
  };

  const handleFirmsScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    if (target.scrollHeight - target.scrollTop <= target.clientHeight + 60) {
      if (visibleFirmsCount < filteredFirmas.length) {
        setVisibleFirmsCount(prev => prev + 15);
      }
    }
  };

  // Reset selected activity and representative when operator selection changes
  useEffect(() => {
    setAtividadeEconomica('');
    setRepresentante('');
    setShowAddAtividade(false);
  }, [firmaId]);

  useEffect(() => {
    if (firmaId && firmas) {
      const f = firmas.find(x => x.id === firmaId);
      if (f) {
        if (f.representant) setRepresentante(prev => prev || f.representant);
        if (f.atividades && f.atividades.length > 0) {
          setAtividadeEconomica(prev => prev || f.atividades[0].atividade);
        }
      }
    }
  }, [firmaId, firmas]);

  const handleSaveNewAtividade = async () => {
    if (!newAtivRamo || !newAtivAtividade.trim() || !newAtivLocal.trim()) return;
    const currentFirma = firmas?.find(x => x.id === firmaId);
    if (!currentFirma) return;

    const newAtiv: AtividadeEconomica = {
      ramo: newAtivRamo,
      atividade: newAtivAtividade.trim(),
      local: newAtivLocal.trim(),
      geolocation: location || null
    };

    const updatedAtividades = [...(currentFirma.atividades || []), newAtiv];
    const updatedFirma = {
      ...currentFirma,
      atividades: updatedAtividades,
      synced: false
    };

    setIsSavingAtividade(true);
    try {
      await db.firmas.put(updatedFirma);
      await db.syncQueue.add({
        entity: 'firma',
        action: 'update',
        entityId: currentFirma.id!,
        payload: updatedFirma,
        timestamp: Date.now()
      });

      // Automatically select the new activity
      setAtividadeEconomica(newAtiv.atividade);

      // Reset form states
      setNewAtivRamo('');
      setNewAtivAtividade('');
      setNewAtivLocal('');
      setShowAddAtividade(false);
    } catch (err) {
      console.error('[drcae] Erro ao guardar nova atividade:', err);
    } finally {
      setIsSavingAtividade(false);
    }
  };

  // Carregar produtos de cesta básica quando firma é selecionada
  // Tenta cache local primeiro quando offline; guarda no cache quando online
  useEffect(() => {
    if (!firmaId || !firmas) { setSupplyProducts([]); setSupplyStatus('none'); return; }
    const firma = firmas.find(f => f.id === firmaId);
    if (!firma) { setSupplyStatus('none'); return; }

    const tryCache = async (): Promise<boolean> => {
      try {
        const cached = await db.table('metadata').get(`supply_${firma.id!}`);
        if (cached?.value && Array.isArray(cached.value) && cached.value.length > 0) {
          setSupplyProducts(cached.value);
          setSupplyStatus('active');
          return true;
        }
      } catch { /* sem cache */ }
      return false;
    };

    if (!navigator.onLine) {
      // Offline — usar apenas cache local
      tryCache().then(found => { if (!found) setSupplyStatus('none'); });
      return;
    }

    setSupplyStatus('loading');
    import('../lib/api').then(api => {
      api.getOperatorSupply(firma.id!).then(res => {
        if (res.bookStatus === 'active' && res.products.length > 0) {
          setSupplyProducts(res.products);
          setSupplyStatus('active');
          // Guardar no cache para uso offline
          db.table('metadata').put({
            key: `supply_${firma.id!}`,
            value: res.products,
          }).catch(() => {});
        } else {
          setSupplyStatus('none');
        }
      }).catch(async () => {
        // Falha de rede — tentar cache local
        const found = await tryCache();
        if (!found) setSupplyStatus('none');
      });
    });
  }, [firmaId, firmas]);

  // Carregar recomendações históricas quando firma é selecionada
  useEffect(() => {
    if (!firmaId) { setHistoricoVisitas([]); return; }
    (async () => {
      const prev = await db.visitas.where('firmaId').equals(firmaId).toArray();
      const withRecs = prev.filter(v => v.recomendacoes && v.recomendacoes.length > 0);
      setHistoricoVisitas(withRecs.map(v => ({
        id: v.id!,
        date: v.date,
        technicians: v.technicians,
        recomendacoes: v.recomendacoes || [],
      })));
    })();
  }, [firmaId]);

  if (equipeNaoDefinida) {
    return (
      <div className="flex-1 flex items-center justify-center p-6 bg-slate-50 dark:bg-slate-950 min-h-screen font-sans">
         <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xl max-w-md w-full overflow-hidden p-8 space-y-6 text-center">
            <div className="w-16 h-16 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400 rounded-2xl flex items-center justify-center mx-auto shadow-sm animate-bounce">
               <AlertTriangle className="w-8 h-8 animate-pulse" />
            </div>
            <div className="space-y-2">
               <h3 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">Definição de Equipa Obrigatória</h3>
               <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-semibold">
                  De acordo com os protocolos jurídicos da <b className="dark:text-slate-300">DRCAE</b>, é estritamente obrigatório definir e validar a composição da equipa de agentes destacados para o serviço diário, pelo menos uma vez, antes de proceder ao registo de nova fiscalização ou cadastro de operador económico.
               </p>
            </div>
            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 flex items-start gap-3">
               <div className="w-6 h-6 bg-amber-100 dark:bg-amber-900/40 rounded-full flex items-center justify-center shrink-0 text-amber-700 dark:text-amber-400 font-bold text-xs font-mono">!</div>
               <p className="text-[11px] text-slate-600 dark:text-slate-400 font-semibold text-left leading-normal">
                  Esta medida de conformidade garante que as contraordenações e atas emitidas possuam força jurídica probatória inequívoca.
               </p>
            </div>
            <button
               onClick={() => navigate('/equipe')}
               className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-100 dark:shadow-none uppercase tracking-widest transition-colors flex items-center justify-center gap-2"
            >
               <Users className="w-4 h-4 text-white" />
               Configurar Equipa Técnica
            </button>
         </div>
      </div>
    );
  }

  const TOTAL_STEPS = 7;
  const handleNext = () => setStep(s => Math.min(TOTAL_STEPS, s + 1));
  const handlePrev = () => setStep(s => Math.max(1, s - 1));

  // ── Draft persistence ─────────────────────────────────────────────────────
  const clearDraft = () => {
    localStorage.removeItem(DRAFT_STATE_KEY);
  };

  const saveDraft = async (currentAnexos: PendingAnexo[]) => {
    try {
      const state = { step, firmaId, representante, atividadeEconomica, date, time, technicians, infracoes, recomendacoes, notes };
      const fileEntries: Array<{ name: string; type: string; data: string }> = [];
      let totalBytes = JSON.stringify(state).length;

      for (const anx of currentAnexos) {
        if (totalBytes >= MAX_DRAFT_FILES_BYTES) break;
        try {
          const data = anx.data || await fileToBase64(anx.file);
          totalBytes += data.length;
          if (totalBytes <= MAX_DRAFT_FILES_BYTES) {
            fileEntries.push({ name: anx.file.name, type: anx.file.type, data });
          }
        } catch {}
      }

      localStorage.setItem(DRAFT_STATE_KEY, JSON.stringify({ ...state, anexos: fileEntries }));
    } catch {
      // Quota exceeded — salva apenas o estado de texto
      try {
        const state = { step, firmaId, representante, atividadeEconomica, date, time, technicians, infracoes, recomendacoes, notes, anexos: [] };
        localStorage.setItem(DRAFT_STATE_KEY, JSON.stringify(state));
      } catch {}
    }
  };

  // Restauro de draft no mount
  useEffect(() => {
    const raw = localStorage.getItem(DRAFT_STATE_KEY);
    if (!raw) return;
    try {
      const draft = JSON.parse(raw);
      if (draft.step) setStep(draft.step);
      if (draft.firmaId) setFirmaId(draft.firmaId);
      if (draft.representante) setRepresentante(draft.representante);
      if (draft.atividadeEconomica) setAtividadeEconomica(draft.atividadeEconomica);
      if (draft.date) setDate(draft.date);
      if (draft.time) setTime(draft.time);
      if (Array.isArray(draft.technicians)) setTechnicians(draft.technicians);
      if (Array.isArray(draft.infracoes)) setInfracoes(draft.infracoes);
      if (Array.isArray(draft.recomendacoes)) setRecomendacoes(draft.recomendacoes);
      if (draft.notes) setNotes(draft.notes);
      if (Array.isArray(draft.anexos) && draft.anexos.length > 0) {
        const restored = draft.anexos.map((entry: { name: string; type: string; data: string }) => {
          const file = base64ToFile(entry.data, entry.name, entry.type);
          return { localId: generateId(), file, url: URL.createObjectURL(file), data: entry.data };
        });
        setAnexos(restored);
      }
      setShowDraftBanner(true);
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const queueAnexos = (files: File[]) => {
    const pending = files.map((file) => ({
      localId: generateId(),
      file,
      url: URL.createObjectURL(file),
    }));
    setAnexos(prev => [...prev, ...pending]);

    for (const item of pending) {
      fileToBase64(item.file)
        .then(data => {
          setAnexos(prev => prev.map(anx => anx.localId === item.localId ? { ...anx, data, readError: undefined } : anx));
        })
        .catch(err => {
          console.error('[drcae] Falha ao preparar anexo local:', err);
          setAnexos(prev => prev.map(anx => anx.localId === item.localId ? { ...anx, readError: err?.message || 'Falha ao preparar anexo.' } : anx));
        });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      queueAnexos(Array.from(e.target.files));
      e.target.value = '';
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

  const persistAnexosLocal = async (visitaId: string, files: PendingAnexo[], notesValue: string) => {
    for (const anx of files) {
      const data = anx.data || await fileToBase64(anx.file);
      const anexo: Anexo = {
        id: generateId(),
        visitaId,
        fileName: anx.file.name,
        fileType: anx.file.type,
        data,
        notes: notesValue,
        synced: false
      };
      await db.anexos.add(anexo);
      await db.syncQueue.add({ entity: 'anexo', action: 'create', entityId: anexo.id!, payload: anexo, timestamp: Date.now() });
    }
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    let visitaId: string | null = null;
    let offlineCode: string | null = null;
    let anexosToPersist: PendingAnexo[] = [];
    let notesToPersist = '';
    try {
    visitaId = generateId();
    offlineCode = await generateOfflineCode();
    if (anexos.some(anx => !anx.data)) {
      toast.info('A preparar anexos para guardar localmente...');
    }
    anexosToPersist = await Promise.all(anexos.map(async (anx) => ({
      ...anx,
      data: anx.data || await fileToBase64(anx.file),
    })));
    notesToPersist = notes;
    const currentRegistrationDate = format(new Date(), 'yyyy-MM-dd');
    const currentRegistrationTime = format(new Date(), 'HH:mm'); // HH:mm — sem segundos para compatibilidade com o backend
    
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
      offlineCode,
      firmaId,
      date: currentRegistrationDate,
      time: currentRegistrationTime,
      technicians,
      status,
      atividadeEconomica,
      geolocation: location,
      synced: false,
      notes,
      recomendacoes: recomendacoes,
      recomendacoesHistoricas: recomendacoesHistoricas.filter(r => r.atendida !== undefined),
      produtos: supplyProducts
        .filter(p => produtosPrices[p.id]?.gross || produtosPrices[p.id]?.retail)
        .map(p => ({
          product_id: p.id,
          name: p.name,
          grossPrice: p.grossPrice,
          retailPrice: p.retailPrice,
          gross: produtosPrices[p.id]?.gross || '',
          retail: produtosPrices[p.id]?.retail || '',
          visitaId,
        })).filter(Boolean) as any[] || undefined,
      createdAt: Date.now(),
      locationAutoCaptured: autoCaptured
    };

    const infs: Infracao[] = infracoes.map(i => ({
      id: generateId(),
      visitaId,
      type: i.type,
      severity: i.severity,
      minimum_penalty: i.minimum_penalty ? parseFloat(i.minimum_penalty) : null,
      maximum_penalty: i.maximum_penalty ? parseFloat(i.maximum_penalty) : null,
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

    if (anexosToPersist.length > 0) {
      await persistAnexosLocal(visitaId, anexosToPersist, notesToPersist);
    }

    clearDraft();
    toast.success(`Fiscalização ${offlineCode} guardada localmente.`);
    navigate(`/visitas/${visitaId}`, { replace: true });
    triggerFullSyncIfReachable().catch((err) => {
      console.warn('[drcae] Sync imediato após fiscalização falhou; registo ficará pendente.', err);
    });
    } catch (err) {
      console.error('[drcae] Erro ao guardar fiscalização local:', err);
      toast.error('Erro ao guardar localmente. Verifique os dados e tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const FALLBACK_INFRACOES = [
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

  // Infrações dinâmicas: vêm dos assets cacheados do backend após sync
  const predefinedInfracoes = (() => {
    try {
      // Tentar primeiro a lista categorizada de infrações
      const cached = JSON.parse(localStorage.getItem('drcae_infractions') || '[]') as {id: number, name: string, code: string}[];
      if (cached.length > 0) {
        return cached.map(a => ({
          type: a.name,
          legalInstrument: a.code || '',
          details: '',
          severity: 'Baixa' as const,
        }));
      }
      // Fallback: tentar filtrar de todos os assets pelo parent de infrações
      const allAssets = JSON.parse(localStorage.getItem('drcae_assets') || '[]') as {id: number, name: string, code: string, parent_id: number | null}[];
      const infractionRoot = allAssets.find(a => a.parent_id === null && /infra/i.test(a.name));
      if (infractionRoot) {
        const children = allAssets.filter(a => a.parent_id === infractionRoot.id);
        if (children.length > 0) {
          return children.map(a => ({ type: a.name, legalInstrument: a.code || '', details: '', severity: 'Baixa' as const }));
        }
      }
    } catch { /* ignore */ }
    return FALLBACK_INFRACOES;
  })();

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

  const updateInfracaoPenalty = (type: string, field: 'minimum_penalty' | 'maximum_penalty', value: string) => {
    setInfracoes(prev => prev.map(i => i.type === type ? { ...i, [field]: value } : i));
  };

  return (
    <div className="flex flex-col h-full bg-[#F5F7FA] dark:bg-slate-950 text-slate-800 dark:text-slate-100 relative">
      {/* Banner de rascunho restaurado */}
      {showDraftBanner && (
        <div className="flex items-center justify-between gap-3 px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-xs font-medium shrink-0">
          <span>Rascunho anterior restaurado. Pode continuar onde ficou.</span>
          <button
            onClick={() => { setShowDraftBanner(false); clearDraft(); }}
            className="shrink-0 underline hover:no-underline"
          >
            Descartar
          </button>
        </div>
      )}
      {/* Header */}
      <div className="px-4 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0 sticky top-0 bg-white dark:bg-slate-900 z-10 flex items-center justify-between">
         <div className="flex items-center">
            <button onClick={() => navigate(-1)} className="mr-3 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors">
               <ArrowLeft className="w-5 h-5" />
            </button>
            <h2 className="font-bold text-slate-900 dark:text-white tracking-tight">Nova Visita</h2>
         </div>
         <div className="text-xs font-bold text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/30 px-2 py-1 rounded-md">
            PASSO {step}/{TOTAL_STEPS}
         </div>
      </div>
      <div className="w-full bg-slate-200 dark:bg-slate-800 h-1">
         <div className="bg-blue-600 h-1 transition-all duration-300" style={{ width: `${(step/TOTAL_STEPS)*100}%` }}></div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 pb-24 custom-scrollbar">
        {/* STEP 1 */}
        {step === 1 && (
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
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest pl-1">Representante no Local</label>
                    <input 
                      type="text" 
                      value={representante}
                      onChange={e => setRepresentante(e.target.value)}
                      placeholder="Nome do representante..."
                      className="w-full p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 text-sm font-semibold text-slate-800 dark:text-slate-100 transition-all outline-none"
                    />
                  </div>
                  
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
                        
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest pl-1">Ramo de Atividade</label>
                          <select
                            value={newAtivRamo}
                            onChange={e => setNewAtivRamo(e.target.value)}
                            className="w-full p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            {RAMOS.map(r => (
                              <option key={r} value={r}>{r}</option>
                            ))}
                          </select>
                        </div>

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
        )}

                  {/* STEP 2 */}
        {step === 2 && (
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
                            <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{tech}</span>
                         </div>
                         <button
                            type="button"
                            onClick={() => setTechnicians(prev => prev.filter(t => t !== tech))}
                            className="p-1.5 text-[10px] text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-700 dark:hover:text-red-400 font-bold rounded-lg transition-colors border border-transparent hover:border-red-100 dark:hover:border-red-900/50"
                         >
                            Remover
                         </button>
                      </div>
                   ))}

                   {technicians.length === 0 && (
                      <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40 rounded-xl text-center text-xs text-red-700 dark:text-red-400 font-semibold">
                         Atenção: Deve definir pelo menos um agente fiscalizador para prosseguir!
                      </div>
                   )}
                </div>

                {/* Add member on the fly */}
                <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
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
                         className="flex-1 p-3 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-hidden focus:bg-white dark:focus:bg-slate-700 focus:ring-2 focus:ring-indigo-500 text-slate-800 dark:text-slate-100 font-semibold rounded-xl"
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

             {location && (
                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col items-center justify-center gap-1.5 text-center">
                   <MapPin className="w-5 h-5 text-indigo-500 dark:text-indigo-400 animate-bounce" />
                   <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Coordenadas de Ingressos do Agente</p>
                   <p className="text-xs text-slate-700 dark:text-slate-200 font-mono font-bold">Lat: {location.lat.toFixed(5)} | Lng: {location.lng.toFixed(5)}</p>
                </div>
             )}
          </div>
        )}

        {/* STEP 4 (Infrações) */}
        {step === 4 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
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
                     <button onClick={() => toggleInfracao(i.type, i.severity)} className="ml-0.5 hover:text-red-600"><X className="w-3 h-3" /></button>
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
                   const severityColor =
                     inf.severity === 'Crítica' ? 'bg-red-600 text-white' :
                     inf.severity === 'Alta' ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300' :
                     'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300';
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
                         onClick={() => toggleInfracao(inf.type, inf.severity)}
                         className={cn(
                           'w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors',
                           isSelected ? 'bg-red-600 border-red-600' : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600'
                         )}
                       >
                         {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                       </button>
                       <span
                         className={cn('flex-1 text-xs font-semibold leading-tight cursor-pointer', isSelected ? 'text-red-900 dark:text-red-200' : 'text-slate-800 dark:text-slate-100')}
                         onClick={() => toggleInfracao(inf.type, inf.severity)}
                       >
                         {inf.type}
                       </span>
                       <span className={cn('text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0', severityColor)}>
                         {inf.severity}
                       </span>
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

             {/* Penas por infração seleccionada */}
             {infracoes.length > 0 && (
               <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 space-y-3">
                 <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Penas Aplicáveis (por Infração)</p>
                 {infracoes.map(inf => (
                   <div key={inf.type} className="space-y-1">
                     <p className="text-[10px] font-bold text-slate-700 dark:text-slate-300 truncate">{inf.type}</p>
                     <div className="grid grid-cols-2 gap-2">
                       <div>
                         <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Pena Mínima (STN)</label>
                         <input
                           type="number"
                           min="0"
                           step="0.01"
                           placeholder="0.00"
                           value={inf.minimum_penalty || ''}
                           onChange={e => updateInfracaoPenalty(inf.type, 'minimum_penalty', e.target.value)}
                           className="w-full p-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100 font-mono"
                         />
                       </div>
                       <div>
                         <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Pena Máxima (STN)</label>
                         <input
                           type="number"
                           min="0"
                           step="0.01"
                           placeholder="0.00"
                           value={inf.maximum_penalty || ''}
                           onChange={e => updateInfracaoPenalty(inf.type, 'maximum_penalty', e.target.value)}
                           className="w-full p-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100 font-mono"
                         />
                       </div>
                     </div>
                   </div>
                 ))}
               </div>
             )}

             <InfractionDetailDrawer
               infraction={selectedInfraction}
               onClose={() => setSelectedInfraction(null)}
             />
          </div>
        )}

        {/* STEP 3 (Recomendações) */}
        {step === 3 && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
             
             <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
                <h3 className="font-bold text-base text-slate-800 dark:text-slate-100">Recomendações do Agente</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium font-sans">
                   Selecione as recomendações pedagógicas de asseio ou conformidade legal pré-cadastradas para aplicar neste operador, ou adicione itens à medida das necessidades do local.
                </p>
             </div>

             {/* Recomendações Históricas do mesmo operador */}
             {historicoVisitas.length > 0 && (
               <div className="space-y-3">
                 <div className="flex items-center gap-2">
                   <History className="w-4 h-4 text-indigo-500" />
                   <label className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">
                     Recomendações Anteriores neste Operador ({historicoVisitas.reduce((s, v) => s + v.recomendacoes.length, 0)})
                   </label>
                 </div>
                 <div className="space-y-3">
                   {historicoVisitas.map(v => v.recomendacoes.map((rec, ri) => {
                     const existingEntry = recomendacoesHistoricas.find(
                       r => r.visitaOrigemId === v.id && r.text === rec
                     );
                     return (
                       <div key={`${v.id}-${ri}`} className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3 space-y-2">
                         <p className="text-xs font-medium text-slate-700 dark:text-slate-200 leading-snug">{rec}</p>
                         <div className="flex items-center justify-between">
                           <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-medium">
                             <span className="font-mono">{v.date}</span>
                             <span>·</span>
                             <span>{v.technicians.slice(0, 2).join(', ')}{v.technicians.length > 2 ? ` +${v.technicians.length - 2}` : ''}</span>
                           </div>
                           <div className="flex items-center gap-1">
                             <button
                               type="button"
                               onClick={() => {
                                 setRecomendacoesHistoricas(prev => {
                                   const existing = prev.find(r => r.visitaOrigemId === v.id && r.text === rec);
                                   if (existing) {
                                     return prev.map(r => r.visitaOrigemId === v.id && r.text === rec
                                       ? { ...r, atendida: r.atendida === true ? null : true }
                                       : r
                                     );
                                   }
                                   return [...prev, { text: rec, visitaOrigemId: v.id, dataOrigem: v.date, equipaOrigem: v.technicians, atendida: true }];
                                 });
                               }}
                               className={cn(
                                 'flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg border transition-colors',
                                 existingEntry?.atendida === true
                                   ? 'bg-emerald-100 dark:bg-emerald-900/30 border-emerald-300 text-emerald-800 dark:text-emerald-300'
                                   : 'bg-white dark:bg-slate-700 border-slate-200 dark:border-slate-600 text-slate-500 hover:border-emerald-300 hover:text-emerald-700'
                               )}
                             >
                               <Check className="w-3 h-3" />
                               Acatada
                             </button>
                             <button
                               type="button"
                               onClick={() => {
                                 setRecomendacoesHistoricas(prev => {
                                   const existing = prev.find(r => r.visitaOrigemId === v.id && r.text === rec);
                                   if (existing) {
                                     return prev.map(r => r.visitaOrigemId === v.id && r.text === rec
                                       ? { ...r, atendida: r.atendida === false ? null : false }
                                       : r
                                     );
                                   }
                                   return [...prev, { text: rec, visitaOrigemId: v.id, dataOrigem: v.date, equipaOrigem: v.technicians, atendida: false }];
                                 });
                               }}
                               className={cn(
                                 'flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg border transition-colors',
                                 existingEntry?.atendida === false
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
                   }))}
                 </div>
               </div>
             )}

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
                                 ? "bg-indigo-50 dark:bg-indigo-900/30 border-indigo-400 dark:border-indigo-500 shadow-sm" 
                                 : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                            )}
                         >
                            <div className={cn(
                               "w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-0.5",
                               isSelected ? "bg-indigo-600 border-indigo-600 text-white" : "bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600"
                            )}>
                               {isSelected && <Check className="w-3 h-3 text-white font-bold" />}
                            </div>
                            <p className={cn("text-xs leading-relaxed font-semibold", isSelected ? "text-indigo-900 dark:text-indigo-200 font-bold" : "text-slate-700 dark:text-slate-300")}>
                               {rec}
                            </p>
                         </div>
                      );
                   })}
                </div>
             </div>

             {/* Custom Recommendation */}
             <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block pl-1">Adicionar Recomendação Customizada/Personalizada</label>
                <div className="flex gap-2">
                   <SpeechInputButton onTranscript={t => setCustomRecommendation(prev => prev ? `${prev} ${t}` : t)} />
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
                      className="flex-1 p-3.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:bg-white dark:focus:bg-slate-700 focus:ring-2 focus:ring-indigo-500 text-slate-800 dark:text-slate-100 font-semibold rounded-xl"
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
                      className="px-5 py-3 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
                   >
                      Adicionar
                   </button>
                </div>
             </div>

             {/* Selected display */}
             {recomendacoes.length > 0 && (
                <div className="bg-indigo-50/50 dark:bg-indigo-900/20 p-4 rounded-xl border border-indigo-100 dark:border-indigo-900/50 space-y-2">
                   <p className="text-[10px] font-bold text-indigo-700 dark:text-indigo-400 uppercase tracking-widest">Recomendações a Emitir ({recomendacoes.length})</p>
                   <ul className="space-y-1.5">
                      {recomendacoes.map((rec, i) => (
                         <li key={i} className="text-xs font-semibold text-indigo-950 dark:text-indigo-200 flex justify-between items-start gap-2 bg-white/60 dark:bg-slate-800/60 p-2.5 rounded-lg border border-indigo-100 dark:border-indigo-800/50">
                            <span className="flex-1 leading-normal">• {rec}</span>
                            <button
                               type="button"
                               onClick={() => setRecomendacoes(prev => prev.filter(r => r !== rec))}
                               className="text-[10px] text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 font-bold px-1"
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
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
             <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Captura de Provas</p>

             {showCamera && (
               <div className="w-full max-w-sm mx-auto rounded-2xl overflow-hidden shadow-xl">
                 <CameraCapture
                   mode={cameraMode}
                   onCapture={(file) => {
                     queueAnexos([file]);
                   }}
                   onClose={() => setShowCamera(false)}
                 />
               </div>
             )}

             <div className="grid grid-cols-3 gap-3">
               <button
                 onClick={() => {
                   setCameraMode('photo');
                   setShowCamera(true);
                 }}
                 className="flex flex-col items-center justify-center gap-2 p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 border-dashed rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-blue-600"
               >
                  <Camera className="w-7 h-7" />
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Foto</span>
               </button>

               <button
                 onClick={() => {
                   setCameraMode('video');
                   setShowCamera(true);
                 }}
                 className="flex flex-col items-center justify-center gap-2 p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 border-dashed rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-red-500"
               >
                  <Video className="w-7 h-7" />
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Vídeo</span>
               </button>

               <button
                 onClick={async () => {
                   await saveDraft(anexos);
                   fileInputRef.current?.click();
                 }}
                 className="flex flex-col items-center justify-center gap-2 p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 border-dashed rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-emerald-600"
               >
                  <FolderOpen className="w-7 h-7" />
                  <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Galeria</span>
               </button>
             </div>

             <input type="file" accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp,.txt,.csv" multiple className="hidden" ref={fileInputRef} onChange={handleFileChange} />

             {anexos.length > 0 && (
                <div className="grid grid-cols-3 gap-3 mt-4">
                   {anexos.map((anx, i) => (
                      <div key={anx.localId} className="relative aspect-square rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 shadow-sm">
                         {anx.file.type.startsWith('image/') ? (
                            <img src={anx.url} alt="anexo" className="w-full h-full object-cover" />
                         ) : (
                            <div className="flex h-full items-center justify-center bg-slate-50 dark:bg-slate-800 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">{anx.file.name.split('.').pop()}</div>
                         )}
                         <button onClick={() => removeAnexo(i)} className="absolute top-2 right-2 bg-slate-900/60 backdrop-blur-sm text-white rounded-full p-1 hover:bg-slate-900/80 transition-colors">
                            <X className="w-3.5 h-3.5" />
                         </button>
                         {!anx.data && !anx.readError && (
                           <div className="absolute inset-x-0 bottom-0 bg-slate-950/70 text-white text-[8px] font-bold text-center py-1 uppercase tracking-wider">
                             A preparar
                           </div>
                         )}
                         {anx.readError && (
                           <div className="absolute inset-x-0 bottom-0 bg-red-700/85 text-white text-[8px] font-bold text-center py-1 uppercase tracking-wider">
                             Erro no anexo
                           </div>
                         )}
                      </div>
                   ))}
                </div>
             )}

             <div className="space-y-2 mt-8 border-t border-slate-100 dark:border-slate-800 pt-6">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Observações Detalhadas</label>
                  <SpeechInputButton onTranscript={t => setNotes(prev => prev ? `${prev} ${t}` : t)} />
                </div>
                <textarea
                  rows={4}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Descreva a situação encontrada no local..."
                  className="w-full p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:bg-white dark:focus:bg-slate-700 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 text-sm font-medium text-slate-800 dark:text-slate-100"
                />
             </div>
          </div>
        )}

        {/* STEP 6 — Produtos de Cesta Básica */}
        {step === 6 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-1">
              <h3 className="font-bold text-base text-slate-800 dark:text-slate-100">Produtos de Cesta Básica</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                Registe os preços praticados pelo operador e compare com o livro de cálculo em vigor.
              </p>
            </div>

            {supplyStatus === 'loading' && (
              <div className="flex items-center justify-center py-12 text-slate-400 gap-2">
                <div className="w-5 h-5 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin" />
                <span className="text-xs font-medium">A carregar livro de cálculo...</span>
              </div>
            )}

            {supplyStatus === 'none' && (
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-5 text-center space-y-2">
                <p className="text-sm font-bold text-amber-800 dark:text-amber-300">Sem livro de cálculo disponível</p>
                <p className="text-xs text-amber-700 dark:text-amber-400">Este operador não possui livro de cálculo de preço aprovado ou a ligação está indisponível. Pode avançar para o próximo passo.</p>
              </div>
            )}

            {supplyStatus === 'active' && supplyProducts.map(produto => {
              const prices = produtosPrices[produto.id] || { gross: '', retail: '' };
              const grossNum = prices.gross ? parseFloat(prices.gross) : null;
              const retailNum = prices.retail ? parseFloat(prices.retail) : null;
              const grossConform = grossNum != null && produto.grossPrice != null ? grossNum <= produto.grossPrice : null;
              const retailConform = retailNum != null && produto.retailPrice != null ? retailNum <= produto.retailPrice : null;
              return (
                <div key={produto.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 space-y-3">
                  <p className="font-bold text-sm text-slate-800 dark:text-slate-100">{produto.name}</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Preço Grosso (STN)</label>
                      {produto.grossPrice != null && (
                        <p className="text-[10px] text-slate-400">Livro: <span className="font-mono font-bold">{produto.grossPrice.toFixed(2)}</span></p>
                      )}
                      <div className="relative">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          value={prices.gross}
                          onChange={e => setProdutosPrices(prev => ({ ...prev, [produto.id]: { ...prev[produto.id], gross: e.target.value, retail: prev[produto.id]?.retail || '' } }))}
                          className={cn(
                            'w-full p-2.5 text-xs border rounded-xl font-mono bg-slate-50 dark:bg-slate-800 dark:text-slate-100',
                            grossConform === true ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20' :
                            grossConform === false ? 'border-red-400 bg-red-50 dark:bg-red-900/20' :
                            'border-slate-200 dark:border-slate-700'
                          )}
                        />
                        {grossConform === true && <span className="absolute right-2 top-2 text-emerald-600 text-[10px] font-bold">✓</span>}
                        {grossConform === false && <span className="absolute right-2 top-2 text-red-600 text-[10px] font-bold">✗</span>}
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Preço Retalho (STN)</label>
                      {produto.retailPrice != null && (
                        <p className="text-[10px] text-slate-400">Livro: <span className="font-mono font-bold">{produto.retailPrice.toFixed(2)}</span></p>
                      )}
                      <div className="relative">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="0.00"
                          value={prices.retail}
                          onChange={e => setProdutosPrices(prev => ({ ...prev, [produto.id]: { ...prev[produto.id], retail: e.target.value, gross: prev[produto.id]?.gross || '' } }))}
                          className={cn(
                            'w-full p-2.5 text-xs border rounded-xl font-mono bg-slate-50 dark:bg-slate-800 dark:text-slate-100',
                            retailConform === true ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20' :
                            retailConform === false ? 'border-red-400 bg-red-50 dark:bg-red-900/20' :
                            'border-slate-200 dark:border-slate-700'
                          )}
                        />
                        {retailConform === true && <span className="absolute right-2 top-2 text-emerald-600 text-[10px] font-bold">✓</span>}
                        {retailConform === false && <span className="absolute right-2 top-2 text-red-600 text-[10px] font-bold">✗</span>}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* STEP 7 — Revisão e Auto-Certificação */}
        {step === 7 && (
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
                   {representante && (
                      <div>
                         <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-wrap">Declarou perante</p>
                         <p className="font-bold text-slate-700 dark:text-slate-200 mt-0.5">{representante}</p>
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
                         {tech}
                      </span>
                   ))}
                </div>
             </div>

             {/* Georreferenciação da Atividade (Mapa) */}
             <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3 shadow-3xs font-sans text-left">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1">
                   <Map className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
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

             {/* Recomendações Emitidas */}
             <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3 shadow-3xs font-sans text-left">
                <h4 className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest flex items-center gap-1">
                   ✦ Recomendações Aplicadas ao Operador ({recomendacoes.length})
                </h4>
                {recomendacoes.length === 0 ? (
                   <p className="text-xs text-slate-400 font-medium pl-1">Nenhuma recomendação preventiva emitida nesta vistoria.</p>
                ) : (
                   <ul className="space-y-2">
                      {recomendacoes.map((rec, i) => (
                         <li key={i} className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex gap-2 items-start leading-relaxed bg-slate-50/70 dark:bg-slate-800/70 p-3 rounded-xl border border-slate-100 dark:border-slate-700 text-left">
                            <span className="text-indigo-600 dark:text-indigo-400 font-black">•</span>
                            <span className="flex-1">{rec}</span>
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
                               if (anx.file.type.startsWith('image/')) {
                                  setSelectedPreview(anx.url);
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

             {/* PREVIEW MODAL */}
             {selectedPreview && (
                <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-250">
                   <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 max-w-2xl w-full overflow-hidden shadow-2xl relative p-3 animate-in zoom-in-95 duration-250 flex flex-col">
                      <div className="flex justify-between items-center px-4 py-2 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 mb-2">
                         <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Evidência Fotográfica</span>
                         <button 
                            onClick={() => setSelectedPreview(null)}
                            className="p-1.5 px-3 bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 font-bold rounded-full text-xs transition-colors"
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
      <div className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 p-4 flex gap-4 shrink-0 mt-auto relative z-10 font-sans">
         {step > 1 && (
            <button 
               onClick={handlePrev}
               className="px-6 py-3.5 rounded-xl text-sm font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-750 transition-colors"
            >
               Anterior
            </button>
         )}
         {step < TOTAL_STEPS ? (
            <button
               onClick={handleNext}
               disabled={
                  (step === 1 && (!firmaId || !atividadeEconomica)) ||
                  (step === 2 && technicians.length === 0)
               }
               className="flex-1 px-6 py-3.5 rounded-xl text-sm font-bold text-white bg-indigo-600 disabled:opacity-50 disabled:bg-slate-400 dark:disabled:bg-slate-800 hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200/50 dark:shadow-none"
            >
               Próximo Passo
            </button>
         ) : (
            <button
               onClick={handleSubmit}
               disabled={isSubmitting}
               className="flex-1 px-6 py-3.5 rounded-xl text-sm font-bold text-white bg-slate-900 dark:bg-slate-950 hover:bg-slate-800 dark:hover:bg-slate-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg shadow-slate-900/20 dark:shadow-none"
            >
               {isSubmitting ? 'A guardar...' : 'Finalizar Registo'}
            </button>
         )}
      </div>
    </div>
  );
}
