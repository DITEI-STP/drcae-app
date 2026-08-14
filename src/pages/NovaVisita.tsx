import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useGeoLocation } from '../lib/geo';
import { AlertTriangle, ArrowLeft, Users } from 'lucide-react';
import type { MapProvider } from '../components/map/MapLayerSwitcher';

import { db, generateId, Visita, Infracao, Anexo, RecomendacaoHistorica, AtividadeEconomica, type ComplaintVerification, type Custody, type Representante, type Tecnico } from '../db/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { format } from 'date-fns';
import { confirmDialog, toast } from '../lib/notifications';
import { generateOfflineCode } from '../lib/offlineCode';
import {
  isSeriousSeverity,
  readInfractionCatalog,
  type InfractionCatalogItem,
} from '../lib/infractionCatalog';
import { triggerFullSyncIfReachable } from '../lib/sync';
import { probeServerReachability } from '../lib/serverReachability';
import {
  readOperatorSupplyCache,
  readSupplyCatalog,
  writeOperatorSupplyCache,
  type SupplyBookStatus,
  type SupplyProduct,
} from '../lib/supplyCache';
import { isDatabaseLockedError, isDatabaseUnlocked } from '../lib/unlock';
import { addAppLog } from '../lib/appLogs';
import UnlockDialog from '../components/UnlockDialog';
import { ensureLoggedOfficer, loggedOfficerFromStorage } from '../lib/inspectionTeam';
import {
  NovaVisitaProvider,
  type ItemApreensaoForm,
  type NovaVisitaFormContext,
  type PendingAnexo,
  type TrusteeForm,
} from './nova-visita/context';
import StepOperador from './nova-visita/steps/StepOperador';
import StepEquipa from './nova-visita/steps/StepEquipa';
import StepDenuncia from './nova-visita/steps/StepDenuncia';
import StepInfracoes from './nova-visita/steps/StepInfracoes';
import StepApreensao from './nova-visita/steps/StepApreensao';
import StepProvas from './nova-visita/steps/StepProvas';
import StepCestaBasica from './nova-visita/steps/StepCestaBasica';
import StepRecomendacoes from './nova-visita/steps/StepRecomendacoes';
import StepRevisao from './nova-visita/steps/StepRevisao';
import {
  EMPTY_REPRESENTANTE,
  isRepresentanteComplete,
  normalizeRepresentante,
  hasCatalogTecnico,
  normalizeTecnicos,
  tecnicoNames,
} from '../lib/inspectionModel';
import { rememberRepresentante } from '../lib/representantesCache';
import {
  contarPendentesPorResponder,
  contarPendentesRespondidas,
  normalizarRecomendacoes,
  textosDeRecomendacoes,
  type RecomendacaoEmitida,
} from '../lib/recomendacoes';
import { clearReturnAnchor, setReturnAnchor } from '../lib/returnAnchor';
import { useEnterKeyNavigation } from '../hooks/useEnterKeyNavigation';
import { useBackIntent } from '../hooks/useBackIntent';
import { semRascunhos } from '../lib/visitaDraft';
import type { EvidenciaSeleccionada } from '../components/EvidenciaPreview';
import { deriveCoverageGaps, isCoverageAcknowledged } from '../lib/coverage';
import { obterPosterVideo } from '../lib/videoPoster';
import { itemVazio, motivosApreensaoIncompleta } from '../lib/apreensaoValidacao';
import { pendenciasDaTela } from '../lib/pendenciasDaTela';
import { produtosVerificados } from '../lib/priceOwnership';
import ModalidadeSelector from './nova-visita/ModalidadeSelector';
import TelaIterativa, { type Folha } from './nova-visita/iterativa/TelaIterativa';
import { purgarConstatacoesVazias } from './nova-visita/iterativa/useDraftSession';
import { useVisitaDraft } from './nova-visita/useVisitaDraft';
import {
  modalidadeDoRascunho,
  passoDoRascunho,
  type DraftPayload,
} from '../lib/visitaDraftState';
import {
  canUseIterativeMode,
  type ModalidadeFiscalizacao,
} from '../lib/inspectionModality';
import {inspectionStepOrder} from '../lib/inspectionSteps';
import {complaintVerificationGaps, selectComplaintForInspection} from '../lib/complaintInspection';

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

export const RAMOS = getCachedRamos();

/**
 * Ordem dos passos por modalidade.
 *
 * Vive fora do componente porque o restauro do rascunho precisa dela **antes**
 * de a modalidade chegar ao estado: lê-la do render corrente resolvia sempre
 * pela modalidade errada e o agente voltava ao primeiro passo em silêncio.
 */
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

export function formatDistanceLabel(distanceKm: number | null): string | null {
  if (distanceKm == null) return null;
  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)} m`;
  }
  return `${distanceKm.toFixed(distanceKm < 10 ? 1 : 0)} km`;
}

export default function NovaVisita() {
  const navigate = useNavigate();
  const locationState = useLocation().state as { firmaId?: string; complaintUid?:string } | null;
  const firmas = useLiveQuery(() => db.firmas.toArray());

  const [equipeNaoDefinida] = useState(() => localStorage.getItem('drcae_equipe_definida') !== 'true');

  const [step, setStep] = useState(1);
  // Modalidade de trabalho (SPEC-10). `null` = ainda por escolher; quem não tem
  // o grant do piloto nunca vê o ecrã de escolha e entra directo no stepper.
  const [modalidade, setModalidade] = useState<ModalidadeFiscalizacao | null>(
    () => (canUseIterativeMode() ? null : 'stepper'),
  );
  const [visitaId, setVisitaId] = useState<string | null>(null);
  const [constatacaoActivaId, setConstatacaoActivaId] = useState<string | null>(null);
  // Folha aberta sobre a tela iterativa. Vive aqui, e não dentro dela, porque o
  // guard de saída da tela — que pergunta pelas recomendações anteriores por
  // responder — corre neste componente e tem de a poder abrir.
  const [folhaIterativa, setFolhaIterativa] = useState<Folha>(null);
  /** Lista do que falta para sair da tela — ver `AlertaPendencias`. */
  const [alertaPendencias, setAlertaPendencias] = useState(false);
  // Instante de abertura do formulário, para a medição da SPEC-10 §9. Em `ref`
  // porque não pinta nada e não pode reiniciar a cada render.
  const sessaoAbertaEm = useRef(Date.now());
  const [coberturaReconhecida, setCoberturaReconhecida] = useState<string[]>([]);
  const [firmaId, setFirmaId] = useState(locationState?.firmaId || '');
  const [complaintUid, setComplaintUid] = useState(locationState?.complaintUid || '');
  const [complaintVerification, setComplaintVerification] = useState<ComplaintVerification|null>(null);
  const complaint = useLiveQuery(
    () => complaintUid ? db.denuncias.get(complaintUid) : undefined,
    [complaintUid],
  );
  const suggestedComplaint = useLiveQuery(async () => {
    if (!firmaId) return null;
    return selectComplaintForInspection(await db.denuncias.toArray(), firmaId);
  }, [firmaId]);
  useEffect(() => {
    if (locationState?.complaintUid || suggestedComplaint === undefined) return;
    setComplaintUid(suggestedComplaint?.uid ?? '');
  }, [locationState?.complaintUid, suggestedComplaint]);
  const [representante, setRepresentante] = useState<Representante>({ ...EMPTY_REPRESENTANTE });
  const [atividadeEconomica, setAtividadeEconomica] = useState('');
  const [visibleFirmsCount, setVisibleFirmsCount] = useState(15);
  
  const [showAddAtividade, setShowAddAtividade] = useState(false);
  const [newAtivRamo, setNewAtivRamo] = useState('');
  const [newAtivAtividade, setNewAtivAtividade] = useState('');
  const [newAtivLocal, setNewAtivLocal] = useState('');
  const [isSavingAtividade, setIsSavingAtividade] = useState(false);
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [time, setTime] = useState(format(new Date(), 'HH:mm'));
  const loggedOfficer = useMemo(() => loggedOfficerFromStorage(), []);
  const [technicians, setTechniciansState] = useState<Tecnico[]>(() => {
    const saved = localStorage.getItem('drcae_equipe');
    if (saved) {
      try {
        // Tolera a equipa gravada como array de nomes (antes da SPEC-07).
        return ensureLoggedOfficer(normalizeTecnicos(JSON.parse(saved)), loggedOfficer);
      } catch {
        return ensureLoggedOfficer([], loggedOfficer);
      }
    }
    return ensureLoggedOfficer([], loggedOfficer);
  });
  const setTechnicians: React.Dispatch<React.SetStateAction<Tecnico[]>> = useCallback(
    (update) => setTechniciansState((current) => ensureLoggedOfficer(
      typeof update === 'function' ? update(current) : update,
      loggedOfficer,
    )),
    [loggedOfficer],
  );
  const { location, refresh: refreshGeo } = useGeoLocation();
  const [mapProvider, setMapProvider] = useState<MapProvider>('osm');

  // `minimum_penalty`/`maximum_penalty` são o instantâneo da moldura legal do
  // catálogo à data do acto — informativos, nunca introduzidos pelo agente.
  const [infracoes, setInfracoes] = useState<{
    type: string;
    severity: string;
    severityLevel: number | null;
    minimum_penalty: number | null;
    maximum_penalty: number | null;
  }[]>([]);
  const [selectedInfraction, setSelectedInfraction] = useState<{type: string, severity: string, legalInstrument?: string, details?: string} | null>(null);

  const [recomendacoes, setRecomendacoes] = useState<RecomendacaoEmitida[]>([]);
  const [recomendacoesHistoricas, setRecomendacoesHistoricas] = useState<RecomendacaoHistorica[]>([]);
  const [historicoVisitas, setHistoricoVisitas] = useState<{id: string, date: string, technicians: string[], recomendacoes: string[]}[]>([]);
  const [infracaoCountByType, setInfracaoCountByType] = useState<Map<string, number>>(new Map());
  const [customRecommendation, setCustomRecommendation] = useState('');
  const [searchInfracao, setSearchInfracao] = useState('');
  const [showCamera, setShowCamera] = useState(false);
  const [cameraMode, setCameraMode] = useState<'photo' | 'video'>('photo');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Produtos de Cesta Básica
  const [supplyProducts, setSupplyProducts] = useState<SupplyProduct[]>([]);
  const [supplyStatus, setSupplyStatus] = useState<'idle'|'loading'|'active'|'none'>('idle');
  /** Momento em que as referências de preço vieram do servidor. */
  const [supplyCachedAt, setSupplyCachedAt] = useState<number | null>(null);
  const [needsUnlock, setNeedsUnlock] = useState(false);
  /**
   * Declaração explícita de que houve apreensão — o interruptor do formulário
   * por passos, onde é a única forma de a declarar.
   *
   * Na modalidade iterativa não existe: lá a apreensão declara-se apreendendo,
   * e `apreensaoActiva` é derivado dos itens (ver a seguir).
   */
  const [apreensaoDeclarada, setApreensaoDeclarada] = useState(false);
  const [apreensaoSemInfracao, setApreensaoSemInfracao] = useState(false);
  const [apreensaoJustificacao, setApreensaoJustificacao] = useState('');
  const [apreensaoItens, setApreensaoItens] = useState<ItemApreensaoForm[]>([]);
  // A guarda fica com o próprio operador económico na esmagadora maioria dos
  // autos da DRCAE: é esse o estado inicial, e o agente só mexe na excepção.
  const [trustee, setTrustee] = useState<TrusteeForm>({
    kind: 'operator', name: '', docType: '', docNumber: '', role: '', contact: '',
  });
  const [produtosPrices, setProdutosPrices] = useState<Record<number, {gross: string, retail: string, grossEval?: 'conforme' | 'nao_conforme', retailEval?: 'conforme' | 'nao_conforme'}>>({});

  const [notes, setNotes] = useState('');
  const [anexos, setAnexos] = useState<PendingAnexo[]>([]);
  const [selectedPreview, setSelectedPreview] = useState<EvidenciaSeleccionada | null>(null);
  const complaintFindingCount = useLiveQuery(async () => {
    if (!complaintUid) return 0;
    if (modalidade !== 'iterativa') return complaintVerification ? 1 : 0;
    if (!visitaId) return 0;
    return db.constatacoes.where('visitaId').equals(visitaId).count();
  }, [complaintUid, modalidade, visitaId, complaintVerification]) ?? 0;

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

  const groupedHistoricoRecomendacoes = useMemo(() => {
    const byText = new Map<string, { text: string; origins: { visitaId: string; date: string; technicians: string[] }[] }>();
    for (const v of historicoVisitas) {
      for (const rec of v.recomendacoes) {
        const origin = { visitaId: v.id, date: v.date, technicians: v.technicians };
        const entry = byText.get(rec);
        if (entry) entry.origins.push(origin);
        else byText.set(rec, { text: rec, origins: [origin] });
      }
    }
    return Array.from(byText.values());
  }, [historicoVisitas]);

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
    setRepresentante({ ...EMPTY_REPRESENTANTE });
    setShowAddAtividade(false);
  }, [firmaId]);

  useEffect(() => {
    if (firmaId && firmas) {
      const f = firmas.find(x => x.id === firmaId);
      if (f) {
        // NUNCA pré-preencher o representante a partir da ficha da firma: o
        // agente avançava sem olhar e a acta declarava como presente quem podia
        // não ter estado no local. É acto explícito, sempre.
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
  // Tenta cache local primeiro quando offline; guarda no cache quando online.
  // 'active'  = operador tem livro de cálculo em vigor (comparação automática)
  // 'none'    = sem livro — supplyProducts ainda pode vir preenchido com a
  //             lista completa de produtos para preenchimento manual
  useEffect(() => {
    if (!firmaId || !firmas) { setSupplyProducts([]); setSupplyStatus('none'); return; }
    const firma = firmas.find(f => f.id === firmaId);
    if (!firma) { setSupplyStatus('none'); return; }

    // Cadeia de resolução explícita: cache do operador → catálogo global em
    // cache → rede. A cache vem primeiro de propósito — dentro do
    // `drcae-webview` o `navigator.onLine` reporta `true` sem haver servidor
    // alcançável, pelo que «rede primeiro» deixava a etapa vazia no terreno.
    // A rede continua a correr, mas em segundo plano, para actualizar os
    // valores sem bloquear o agente.
    let cancelled = false;

    const applyEntry = (entry: { bookStatus: string; products: SupplyProduct[] }) => {
      setSupplyProducts(entry.products);
      setSupplyStatus(
        entry.bookStatus === 'active' && entry.products.length > 0 ? 'active' : 'none',
      );
    };

    (async () => {
      let served = false;

      const cached = await readOperatorSupplyCache(firma.id!);
      if (cancelled) return;
      if (cached && cached.products.length > 0) {
        applyEntry(cached);
        setSupplyCachedAt(cached.cachedAt || null);
        served = true;
      } else {
        // Sem livro em cache — o catálogo global é o modo manual.
        const catalog = await readSupplyCatalog();
        if (cancelled) return;
        if (catalog && catalog.products.length > 0) {
          applyEntry({ bookStatus: 'none', products: catalog.products });
          setSupplyCachedAt(catalog.cachedAt || null);
          served = true;
        }
      }

      if (!served) setSupplyStatus('loading');

      // Actualização a partir do servidor — só quando ele responde de facto.
      if (!(await probeServerReachability())) {
        if (!cancelled && !served) setSupplyStatus('none');
        return;
      }

      try {
        const api = await import('../lib/api');
        const res = await api.getOperatorSupply(firma.id!);
        if (cancelled) return;
        applyEntry({ bookStatus: res.bookStatus, products: res.products || [] });
        setSupplyCachedAt(Date.now());
        if (res.products?.length > 0) {
          await writeOperatorSupplyCache(firma.id!, {
            bookStatus: res.bookStatus as SupplyBookStatus,
            products: res.products,
            source: 'online',
          });
        }
      } catch {
        if (!cancelled && !served) setSupplyStatus('none');
      }
    })();

    return () => { cancelled = true; };
  }, [firmaId, firmas]);

  // Carregar recomendações históricas e contagem de infrações por tipo quando firma é selecionada
  useEffect(() => {
    if (!firmaId) {
      setHistoricoVisitas([]);
      setInfracaoCountByType(new Map());
      return;
    }
    (async () => {
      const prev = semRascunhos(await db.visitas.where('firmaId').equals(firmaId).toArray());

      const withRecs = prev.filter(v => v.recomendacoes && v.recomendacoes.length > 0);
      setHistoricoVisitas(withRecs.map(v => ({
        id: v.id!,
        date: v.date,
        technicians: tecnicoNames(v.technicians),
        recomendacoes: v.recomendacoes || [],
      })));

      const counts = new Map<string, number>();
      for (const v of prev) {
        if (!v.id) continue;
        const infs = await db.infracoes.where('visitaId').equals(v.id).toArray();
        for (const inf of infs) {
          counts.set(inf.type, (counts.get(inf.type) || 0) + 1);
        }
      }
      setInfracaoCountByType(counts);
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
               onClick={() => navigate('/equipe', { state: { returnTo: '/visitas/nova' } })}
               className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white font-bold text-xs rounded-xl shadow-lg shadow-indigo-100 dark:shadow-none uppercase tracking-widest transition-colors flex items-center justify-center gap-2"
            >
               <Users className="w-4 h-4 text-white" />
               Configurar Equipa Técnica
            </button>
         </div>
      </div>
    );
  }

  // Ordem dos passos como dado, não como literais espalhados pelo JSX. Foi a
  // reordenação da SPEC-01 que tornou isto necessário: com números à mão,
  // reordenar a UI e esquecer uma validação é uma classe de bug inteira.
  //
  // Recomendações passou a penúltimo: redigir uma recomendação antes de
  // levantar infracções e de verificar preços é redigi-la antes de conhecer os
  // factos que a fundamentam.
  //
  // A modalidade iterativa (SPEC-10) colapsa os cinco passos temáticos numa só
  // tela: o agente regista cada constatação à medida que a encontra, em vez de
  // percorrer os domínios por ordem fixa. Os passos que sobrevivem são os que
  // são genuinamente sequenciais — não se regista nada sem saber de quem é o
  // espaço, e não se fecha sem rever.
  const STEP_ORDER = inspectionStepOrder(modalidade, !!complaintUid);
  const TOTAL_STEPS = STEP_ORDER.length;
  const stepKey = STEP_ORDER[step - 1] ?? STEP_ORDER[0];
  const handleNext = () => setStep(s => Math.min(TOTAL_STEPS, s + 1));
  const handlePrev = () => setStep(s => Math.max(1, s - 1));

  /**
   * Houve apreensão nesta fiscalização.
   *
   * Na tela iterativa é **derivado**: o agente liga o interruptor de um produto
   * e isso é a declaração — perguntar a seguir se houve apreensão seria pedir-
   * lhe que confirmasse o que acabou de fazer. Derivar em vez de escrever
   * também evita o estado dessincronizado de ficar «activa» depois de o último
   * item ser apagado, com a validação a correr sobre um auto que já não existe.
   *
   * No formulário por passos continua a ser o interruptor: lá não há produto
   * onde a declaração se possa pendurar.
   */
  const apreensaoActiva =
    modalidade === 'iterativa'
      ? apreensaoItens.some((item) => !itemVazio(item))
      : apreensaoDeclarada;

  // Extraída de dentro do `disabled` do botão: passou a haver dois caminhos
  // para avançar — o botão do rodapé e a tecla de acção do teclado — e duas
  // cópias da mesma condição divergiriam à primeira alteração.
  const motivosApreensao = motivosApreensaoIncompleta({
    activa: apreensaoActiva,
    semInfracao: apreensaoSemInfracao,
    justificacao: apreensaoJustificacao,
    itens: apreensaoItens,
    trustee,
  });
  const complaintGaps = complaintVerificationGaps({
    verification: complaintVerification,
    findingCount: complaintFindingCount,
    evidenceCount: anexos.length,
  });

  const canAdvanceStep = !(
    (stepKey === 'operador' && (!firmaId || !atividadeEconomica || !isRepresentanteComplete(representante))) ||
    (stepKey === 'equipa' && !hasCatalogTecnico(technicians)) ||
    (stepKey === 'denuncia' && complaintGaps.length > 0) ||
    // Os motivos vivem em `lib/apreensaoValidacao.ts`, porque o ecrã também
    // precisa deles para os mostrar: bloquear sem dizer o que falta é
    // indistinguível de uma avaria para quem está no terreno.
    //
    // Na tela iterativa é aqui que a tarefa do destino se torna obrigatória —
    // é o único ponto por onde a fiscalização passa para ser concluída, e o
    // agente ainda está no local para poder decidir.
    (stepKey === 'apreensao' && motivosApreensao.length > 0)
  );

  /**
   * O que separa o agente do passo seguinte, na tela iterativa.
   *
   * Aqui o botão não bloqueia: bloquear sem dizer o que falta é indistinguível
   * de uma avaria para quem está no terreno. O toque é aceite, e o que responde
   * é a lista — com o atalho para o ecrã onde cada coisa se corrige
   * (`lib/pendenciasDaTela.ts`).
   */
  const pendenciasDaFase = pendenciasDaTela({
    motivos: motivosApreensao,
    apreensaoItens,
    // O mesmo par que o cartão de tarefa mostra na tela: duas contagens
    // diferentes da mesma coisa dariam um alerta a discordar do cartão que
    // está por baixo dele.
    produtosTotal: supplyProducts.length,
    produtosVerificados: produtosVerificados(produtosPrices).length,
    recomendacoesPorResponder: contarPendentesPorResponder(
      groupedHistoricoRecomendacoes.length,
      recomendacoesHistoricas,
    ),
  });

  // A tela iterativa escreve no Dexie à medida (SPEC-10 §8), pelo que a visita
  // tem de existir em rascunho antes de o agente lá chegar. Nasce ao sair do
  // passo da equipa — o momento em que já se sabe de quem é o espaço e quem lá
  // está — e é a partir daí que nada mais se perde.
  const garantirRascunho = async (): Promise<string | null> => {
    if (modalidade !== 'iterativa' || visitaId) return visitaId;
    const id = generateId();
    await db.visitas.add({
      id,
      firmaId,
      representante,
      date,
      time,
      technicians,
      status: 'Regularizado',
      atividadeEconomica,
      geolocation: location,
      draftState: 'draft',
      modalidade: 'iterativa',
      complaintUid: complaintUid || null,
      complaintVerification,
      synced: false,
      createdAt: Date.now(),
    });
    setVisitaId(id);
    return id;
  };

  const avancar = async () => {
    if (STEP_ORDER[step] === 'tela') await garantirRascunho();

    // Sair da tela com o auto por fechar, ou com recomendações anteriores por
    // responder, é sair do local sem ter feito o que só ali se pode fazer. A
    // revisão ainda volta a exigi-lo, mas aí o agente já não pode ir ver — e a
    // resposta fácil, nessa altura, é a que despacha.
    if (stepKey === 'tela' && pendenciasDaFase.length > 0) {
      setAlertaPendencias(true);
      return;
    }

    handleNext();
  };

  // Concluir exige que o agente tenha afirmado o que ficou por registar
  // (SPEC-10 §7). Nada é proibido — é preciso é ser dito.
  const coberturaPorReconhecer = !isCoverageAcknowledged(
    deriveCoverageGaps({
      infracoes: infracoes.length,
      provas: anexos.length,
      produtosTotal: supplyProducts.length,
      produtosVerificados: supplyProducts.filter(
        (p) => produtosPrices[p.id]?.gross || produtosPrices[p.id]?.retail,
      ).length,
      recomendacoesPendentes: groupedHistoricoRecomendacoes.length,
      recomendacoesPendentesRespondidas: contarPendentesRespondidas(recomendacoesHistoricas),
    }),
    coberturaReconhecida,
  );

  const isLastStep = step === TOTAL_STEPS;
  const formRef = useEnterKeyNavigation({
    onAdvance: () => (isLastStep ? void handleSubmit() : void avancar()),
    canAdvance: isLastStep ? !isSubmitting : canAdvanceStep,
    lastFieldHint: isLastStep ? 'go' : 'done',
  });

  // Botão «voltar» do Android — ordem de precedência dada pela ordem de
  // registo: o último handler activo ganha (ver useBackIntent).
  useBackIntent(() => setSelectedPreview(null), !!selectedPreview);
  useBackIntent(() => setShowCamera(false), showCamera);
  useBackIntent(() => setSelectedInfraction(null), !!selectedInfraction);
  useBackIntent(() => {
    if (step > 1) { handlePrev(); return; }
    // No primeiro passo já não há passo para onde recuar: confirmar a saída,
    // deixando claro que o preenchimento não se perde.
    void (async () => {
      const sair = await confirmDialog({
        title: 'Sair do registo de fiscalização?',
        message: 'O rascunho fica guardado e poderá retomá-lo quando voltar a iniciar uma fiscalização.',
        confirmLabel: 'Sair',
        cancelLabel: 'Continuar aqui',
      });
      if (sair) navigate('/');
    })();
  }, !showCamera && !selectedInfraction && !selectedPreview, true);

  /**
   * Abre uma fiscalização anterior a partir do histórico da infracção.
   *
   * Grava o rascunho **antes** de navegar e deixa uma âncora de retorno, para o
   * agente voltar ao registo em curso por um botão explícito — depender do
   * gesto de voltar seria frágil, e sair do formulário sem gravar perderia o
   * trabalho de campo.
   */
  const handleOpenHistoricInspection = async (visitaId: string) => {
    setSelectedInfraction(null);
    await saveDraft(anexos);
    setReturnAnchor('/visitas/nova', 'Voltar ao registo em curso');
    navigate(`/visitas/${visitaId}`);
  };

  // ── Rascunho ──────────────────────────────────────────────────────────────
  // Gravação, recuperação e provas vivem em `nova-visita/useVisitaDraft.ts`.
  // O que fica aqui é o que só o formulário sabe: que estado gravar, e como o
  // repor.
  const draftPayload: DraftPayload = {
    modalidade, visitaId, stepKey, firmaId, representante, atividadeEconomica,
    date, time, technicians, infracoes, recomendacoes, recomendacoesHistoricas,
    notes, apreensaoActiva, apreensaoSemInfracao, apreensaoJustificacao,
    apreensaoItens, trustee, produtosPrices, coberturaReconhecida,
    complaintUid, complaintVerification,
  };

  const { draftChecked, saveDraft, clearDraft } = useVisitaDraft({
    payload: draftPayload,
    anexos,
    isSubmitting,
    aoRecuperar: (draft, provas) => {
      // A modalidade é reposta antes do passo: a ordem dos passos depende dela,
      // e um rascunho da tela iterativa restaurado contra a ordem do stepper
      // caía sempre no primeiro passo.
      const modalidadeLida = modalidadeDoRascunho(draft, canUseIterativeMode());
      const complaintUidLido = typeof draft.complaintUid === 'string' ? draft.complaintUid : '';
      setModalidade(modalidadeLida);
      setComplaintUid(complaintUidLido);
      setComplaintVerification(draft.complaintVerification??null);
      setStep(passoDoRascunho(draft, inspectionStepOrder(modalidadeLida, !!complaintUidLido)));

      if (typeof draft.visitaId === 'string') setVisitaId(draft.visitaId);
      if (draft.firmaId) setFirmaId(draft.firmaId);
      if (draft.representante) setRepresentante(normalizeRepresentante(draft.representante));
      if (draft.atividadeEconomica) setAtividadeEconomica(draft.atividadeEconomica);
      if (draft.date) setDate(draft.date);
      if (draft.time) setTime(draft.time);
      if (Array.isArray(draft.technicians)) setTechnicians(normalizeTecnicos(draft.technicians));
      if (Array.isArray(draft.infracoes)) setInfracoes(draft.infracoes);
      if (Array.isArray(draft.recomendacoes)) {
        setRecomendacoes(normalizarRecomendacoes(draft.recomendacoes));
      }
      if (Array.isArray(draft.recomendacoesHistoricas)) {
        setRecomendacoesHistoricas(draft.recomendacoesHistoricas);
      }
      if (draft.notes) setNotes(draft.notes);

      // Apreensão, preços e cobertura: o que o rascunho não gravava, e por isso
      // desaparecia. Um auto levantado no terreno reabria vazio.
      if (typeof draft.apreensaoActiva === 'boolean') setApreensaoDeclarada(draft.apreensaoActiva);
      if (typeof draft.apreensaoSemInfracao === 'boolean') {
        setApreensaoSemInfracao(draft.apreensaoSemInfracao);
      }
      if (draft.apreensaoJustificacao) setApreensaoJustificacao(draft.apreensaoJustificacao);
      if (Array.isArray(draft.apreensaoItens)) setApreensaoItens(draft.apreensaoItens);
      if (draft.trustee) setTrustee(draft.trustee);
      if (draft.produtosPrices) setProdutosPrices(draft.produtosPrices);
      if (Array.isArray(draft.coberturaReconhecida)) {
        setCoberturaReconhecida(draft.coberturaReconhecida);
      }

      if (provas.length > 0) setAnexos(provas);
    },
  });


  const queueAnexos = (files: File[]) => {
    const pending = files.map((file) => ({
      localId: generateId(),
      file,
      url: URL.createObjectURL(file),
      constatacaoId: constatacaoActivaId,
    }));
    setAnexos(prev => [...prev, ...pending]);
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
      const anexoId = generateId();
      const anexo: Anexo = {
        id: anexoId,
        visitaId,
        fileName: anx.file.name,
        fileType: anx.file.type || 'application/octet-stream',
        data: '',
        notes: notesValue,
        synced: false
      };
      try {
        await db.anexos.add(anexo);
        // O fotograma é extraído aqui, uma vez, com o ficheiro ainda em
        // memória. Fica gravado ao lado dele para a miniatura sobreviver a
        // fechar a aplicação e funcionar sem rede — e para o push o poder
        // enviar em vez de o servidor ter de o calcular.
        const poster = anx.file.type.startsWith('video/')
          ? await obterPosterVideo(anx.url).catch(() => null)
          : null;

        await db.attachments.put({
          id: anexoId,
          visitaId,
          data: anx.file,
          poster: poster ? await (await fetch(poster)).blob() : undefined,
          synced: false,
        });
        await db.syncQueue.add({ entity: 'anexo', action: 'create', entityId: anexo.id!, payload: anexo, timestamp: Date.now() });
      } catch (err) {
        await db.anexos.bulkDelete([anexoId]).catch(() => {});
        await db.attachments.delete(anexoId).catch(() => {});
        throw err;
      }
    }
  };

  const handleSubmit = async () => {
    if (isSubmitting) return;

    // A submissão escreve a visita, cada infracção e cada anexo. Se a chave de
    // cifra tiver caído, a primeira escrita lança e o trabalho de campo — que
    // é irrepetível — perdia-se com um toast genérico. Pedir a palavra-passe e
    // retomar mantém o rascunho intacto.
    if (!isDatabaseUnlocked()) {
      setNeedsUnlock(true);
      return;
    }

    // Guarda de última linha, antes de qualquer escrita: um auto sem destino
    // não é um auto, e escrever metade da fiscalização para abortar a seguir
    // deixava-a por concluir. Na tela iterativa o botão de avançar já bloqueia
    // — isto apanha o caminho que lá não passe.
    if (motivosApreensao.length > 0) {
      toast.error(motivosApreensao[0].texto);
      return;
    }

    setIsSubmitting(true);
    let novaVisitaId: string | null = null;
    let offlineCode: string | null = null;
    let anexosToPersist: PendingAnexo[] = [];
    let notesToPersist = '';
    try {
    // Na modalidade iterativa a fiscalização já existe em rascunho desde o fim
    // do passo da equipa, com constatações e provas penduradas nela: concluir é
    // fechá-la, não criar outra.
    novaVisitaId = visitaId ?? generateId();
    offlineCode = await generateOfflineCode();
    anexosToPersist = [...anexos];
    notesToPersist = notes;
    const currentRegistrationDate = format(new Date(), 'yyyy-MM-dd');
    const currentRegistrationTime = format(new Date(), 'HH:mm'); // HH:mm — sem segundos para compatibilidade com o backend
    
    // Prioridade: Infrações > Inconformes > Recomendações > Regularizado
    // (mesma taxonomia usada no admin — ver inspectionStatus.ts).
    let status = 'Regularizado';
    if (infracoes.length > 0) {
      const hasSerious = infracoes.some(isSeriousSeverity);
      status = hasSerious ? 'Infrações' : 'Inconformes';
    } else if (recomendacoes.length > 0) {
      status = 'Recomendações';
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

    // Cartões abertos por engano e nunca preenchidos saem aqui, antes de a
    // cobertura ser contada e de o push os apanhar. Ao sair da tela não serve:
    // o agente pode submeter sem lá voltar, e a limpeza tem de correr no único
    // ponto por onde tudo passa.
    if (modalidade === 'iterativa') {
      await purgarConstatacoesVazias(novaVisitaId, {
        anexos,
        infracoes,
        apreensaoItens,
        recomendacoes,
        produtosPrices,
      });
    }

    const visita: Visita = {
      id: novaVisitaId,
      offlineCode,
      firmaId,
      representante,
      date: currentRegistrationDate,
      time: currentRegistrationTime,
      technicians,
      status,
      atividadeEconomica,
      geolocation: location,
      synced: false,
      notes,
      recomendacoes: textosDeRecomendacoes(recomendacoes),
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
          grossEval: produtosPrices[p.id]?.grossEval ?? null,
          retailEval: produtosPrices[p.id]?.retailEval ?? null,
          visitaId: novaVisitaId,
        })).filter(Boolean) as any[] || undefined,
      createdAt: Date.now(),
      locationAutoCaptured: autoCaptured,
      // O rascunho deixa de o ser exactamente aqui: é esta transição que o
      // torna visível nas listagens e elegível para o push.
      draftState: 'submitted',
      modalidade,
      complaintUid: complaintUid || null,
      complaintVerification,
      sessao: {
        abertaEm: new Date(sessaoAbertaEm.current).toISOString(),
        concluidaEm: new Date().toISOString(),
        duracaoSegundos: Math.round((Date.now() - sessaoAbertaEm.current) / 1000),
      },
      cobertura: {
        constatacoes: await db.constatacoes.where('visitaId').equals(novaVisitaId).count(),
        infracoes: infracoes.length,
        provas: anexos.length,
        produtosVerificados: supplyProducts.filter(
          (p) => produtosPrices[p.id]?.gross || produtosPrices[p.id]?.retail,
        ).length,
        apreensoes: apreensaoActiva ? 1 : 0,
        recomendacoes: recomendacoes.length,
        recomendacoesPendentesRespondidas: contarPendentesRespondidas(recomendacoesHistoricas),
        dominiosVazios: coberturaReconhecida,
      },
    };

    const infs: Infracao[] = infracoes.map(i => ({
      id: generateId(),
      visitaId: novaVisitaId,
      type: i.type,
      severity: i.severity,
      minimum_penalty: i.minimum_penalty,
      maximum_penalty: i.maximum_penalty,
      synced: false
    }));

    // `put` e não `add`: na modalidade iterativa a linha já existe em rascunho.
    await db.visitas.put(visita);
    await db.syncQueue.add({ entity: 'visita', action: 'create', entityId: novaVisitaId, payload: visita, timestamp: Date.now() });

    // Save Infrações
    for (const inf of infs) {
      await db.infracoes.add(inf);
      await db.syncQueue.add({ entity: 'infracao', action: 'create', entityId: inf.id!, payload: inf, timestamp: Date.now() });
    }

    if (anexosToPersist.length > 0) {
      await persistAnexosLocal(novaVisitaId, anexosToPersist, notesToPersist);
    }

    // Auto de apreensão, quando houve. `settlementStatus` é derivado no
    // servidor a partir dos itens e das recolhas — o valor local é provisório e
    // serve apenas para a listagem enquanto o push não acontece.
    // `custody` já não é nulo aqui: sem destino, a guarda acima não deixou
    // chegar a submissão. O predicado é o que o diz ao compilador.
    const itensValidos = apreensaoItens.filter(
      (it): it is typeof it & { custody: Custody } =>
        !!it.designation.trim() && Number(it.quantity) > 0 && it.custody != null,
    );
    if (apreensaoActiva && itensValidos.length > 0) {
      const apreensaoId = generateId();
      const temDeposito = itensValidos.some((it) => it.custody === 'trustee');
      await db.apreensoes.add({
        id: apreensaoId,
        visitaId,
        firmaId,
        seizedAt: new Date().toISOString(),
        custody: temDeposito
          ? (itensValidos.every((it) => it.custody === 'trustee') ? 'trustee' : 'mixed')
          : 'drcae',
        settlementStatus: temDeposito ? 'pending' : 'not-applicable',
        trusteeKind: trustee.kind,
        // Com a guarda na própria firma, quem assina é o representante já
        // identificado no acto — não se reescreve o que já foi registado.
        trusteeName:
          (trustee.kind === 'operator'
            ? representante.name
            : trustee.name
          ).trim() || undefined,
        trusteeDocType:
          (trustee.kind === 'operator'
            ? representante.docType
            : trustee.docType
          ).trim() || undefined,
        trusteeDocNumber:
          (trustee.kind === 'operator'
            ? representante.docNumber
            : trustee.docNumber
          ).trim() || undefined,
        trusteeRole:
          (trustee.kind === 'operator'
            ? representante.role || ''
            : trustee.role
          ).trim() || undefined,
        trusteeContact: trustee.kind === 'person'
          ? trustee.contact.trim() || undefined
          : undefined,
        note: apreensaoSemInfracao ? apreensaoJustificacao.trim() : undefined,
        geolocation: location,
        synced: false,
        createdAt: Date.now(),
      });

      for (const it of itensValidos) {
        await db.apreensaoItens.add({
          id: generateId(),
          apreensaoId,
          assetSupply: it.assetSupply,
          designation: it.designation.trim(),
          quantity: Number(it.quantity),
          assetUnit: it.assetUnit,
          custody: it.custody,
          // Item recolhido pela DRCAE sai no acto: nasce liquidado.
          collectedQuantity: it.custody === 'drcae' ? Number(it.quantity) : 0,
          note: it.note?.trim() || undefined,
          synced: false,
        });
      }
    }

    // O representante registado passa a ficar disponível como chip na
    // fiscalização seguinte, mesmo antes de sincronizar. É assim que a lista se
    // alimenta; o servidor confirma-o no push, desduplicando por documento.
    await rememberRepresentante(firmaId, representante);

    // Aguardado: as provas do rascunho vivem agora no Dexie, e navegar sem
    // esperar deixava-as para a fiscalização seguinte recuperar.
    await clearDraft();
    clearReturnAnchor();
    toast.success(`Fiscalização ${offlineCode} guardada localmente.`);
    navigate(`/visitas/${novaVisitaId}`, { replace: true });
    triggerFullSyncIfReachable().catch((err) => {
      console.warn('[drcae] Sync imediato após fiscalização falhou; registo ficará pendente.', err);
    });
    } catch (err) {
      console.error('[drcae] Erro ao guardar fiscalização local:', err);
      addAppLog('error', 'nova-visita', 'Falha ao guardar fiscalização local', err);
      // O rascunho não é limpo neste caminho — o agente pode desbloquear e
      // repetir sem reintroduzir nada.
      if (isDatabaseLockedError(err)) {
        setNeedsUnlock(true);
      } else {
        toast.error('Erro ao guardar localmente. Verifique os dados e tente novamente.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Só usado enquanto o catálogo não tiver sido sincronizado. A gravidade segue
  // a escala do grupo `gravity` (nível 1..3), a mesma do catálogo real.
  const FALLBACK_INFRACOES: InfractionCatalogItem[] = [
    {
      type: 'Decomposição / Falta de Higiene Alimentar',
      legalInstrument: 'Decreto-Lei nº 41/2014, Artigo 8º',
      details: 'Falta de higienização ou desinfestação regular das superfícies, equipamentos e utensílios de preparação alimentar.',
      severity: 'Infração Muito Grave', severityCode: 'veryserious', severityLevel: 3,
      penaltyMin: null, penaltyMax: null,
    },
    {
      type: 'Ausência de Licença / Alvará de Exercício',
      legalInstrument: 'Lei das Atividades Económicas, Artigo 22º',
      details: 'Exercício de atividade comercial ou industrial sem a competente licença municipal ou alvará de funcionamento.',
      severity: 'Infração Grave', severityCode: 'serious', severityLevel: 2,
      penaltyMin: null, penaltyMax: null,
    },
    {
      type: 'Falta de Afixação de Preços para utentes',
      legalInstrument: 'Decreto-Lei nº 22/2016, Artigo 5º',
      details: 'Não disponibilização ou não afixação de preços visíveis aos consumidores nos artigos expostos para venda.',
      severity: 'Infração Leve', severityCode: 'light', severityLevel: 1,
      penaltyMin: null, penaltyMax: null,
    },
    {
      type: 'Bens Alimentares com Prazo Expirado',
      legalInstrument: 'Regulamento da Qualidade Alimentar, Artigo 14º',
      details: 'Detetar ou manter expostos ao público produtos alimentares cujo prazo de consumo ou validade se encontra ultrapassado.',
      severity: 'Infração Muito Grave', severityCode: 'veryserious', severityLevel: 3,
      penaltyMin: null, penaltyMax: null,
    },
    {
      type: 'Obstrução de Atividade Fiscalizadora',
      legalInstrument: 'Código de Fiscalização Económica, Artigo 45º',
      details: 'Recusa no fornecimento de acesso físico às instalações ou não apresentação imediata da documentação fiscal exigível.',
      severity: 'Infração Grave', severityCode: 'serious', severityLevel: 2,
      penaltyMin: null, penaltyMax: null,
    },
    {
      type: 'Ausência de Livro de Reclamações Físico',
      legalInstrument: 'Regulamento de Proteção ao Consumidor, Artigo 3º',
      details: 'Inexistência ou indisponibilidade de livro de reclamações físico oficial homologado no estabelecimento.',
      severity: 'Infração Leve', severityCode: 'light', severityLevel: 1,
      penaltyMin: null, penaltyMax: null,
    }
  ];

  // Infrações dinâmicas: vêm do catálogo sincronizado, já com a gravidade
  // real, o instrumento jurídico e a moldura legal (ver lib/infractionCatalog).
  const predefinedInfracoes = useMemo(() => {
    const catalog = readInfractionCatalog();
    return catalog.length > 0 ? catalog : FALLBACK_INFRACOES;
  }, []);

  const predefinedRecomendacoes = [
    "Proceder com a desinfestação imediata das zonas de armazenamento e de cozinha no prazo de 48 horas.",
    "Afixar a tabela oficial de preços num local perfeitamente visível para os utentes/clientes.",
    "Regularizar a situação do licenciamento/alvará de exercício junto dos serviços da Câmara Municipal.",
    "Disponibilizar o livro de reclamações homologado e instruir os funcionários para a sua disponibilização obrigatória.",
    "Substituir e retirar de circulação ou de exposição todos os bens alimentares fora da validade.",
    "Garantir o uso obrigatório de vestuário de proteção individual adequado (toucas, aventais, calçado adequado).",
    "Adaptar os sistemas de refrigeração para garantir a conservação de alimentos perecíveis nas temperaturas adequadas."
  ];

  /**
   * Selecciona/desselecciona uma infracção do catálogo.
   *
   * A moldura legal (mín./máx.) é copiada do catálogo no momento do acto — não
   * é o agente que a define. Guardar o instantâneo, em vez de a ler sempre do
   * catálogo, preserva a moldura vigente à data da fiscalização mesmo que a
   * DRCAE a altere depois.
   */
  const removeInfracao = (type: string) => {
    setInfracoes(prev => prev.filter(i => i.type !== type));
  };

  const toggleInfracao = (item: InfractionCatalogItem) => {
    setInfracoes(prev => {
      const exists = prev.find(i => i.type === item.type);
      if (exists) return prev.filter(i => i.type !== item.type);
      return [...prev, {
        constatacaoId: constatacaoActivaId,
        type: item.type,
        severity: item.severity,
        severityLevel: item.severityLevel,
        minimum_penalty: item.penaltyMin,
        maximum_penalty: item.penaltyMax,
      }];
    });
  };

  // Estado do formulário, entregue aos passos por contexto. Fica memoizado
  // para os passos não voltarem a renderizar por identidade do objecto.
  const formContext: NovaVisitaFormContext = useMemo(() => ({
    firmas, filteredFirmas, firmaId, setFirmaId, search, handleSearchChange, handleFirmsScroll,
    representante, setRepresentante, atividadeEconomica, setAtividadeEconomica,
    showAddAtividade, setShowAddAtividade, newAtivRamo, setNewAtivRamo,
    newAtivAtividade, setNewAtivAtividade, newAtivLocal, setNewAtivLocal,
    isSavingAtividade, handleSaveNewAtividade,
    date, setDate, time, setTime, technicians, setTechnicians,
    predefinedInfracoes, infracoes, setInfracoes, toggleInfracao, removeInfracao,
    searchInfracao, setSearchInfracao, infracaoCountByType,
    selectedInfraction, setSelectedInfraction, handleOpenHistoricInspection,
    predefinedRecomendacoes, recomendacoes, setRecomendacoes,
    customRecommendation, setCustomRecommendation,
    recomendacoesHistoricas, setRecomendacoesHistoricas,
    groupedHistoricoRecomendacoes, historicoVisitas,
    anexos, setAnexos, queueAnexos, removeAnexo, handleFileChange, fileInputRef,
    showCamera, setShowCamera, cameraMode, setCameraMode,
    selectedPreview, setSelectedPreview, notes, setNotes,
    supplyProducts, supplyStatus, supplyCachedAt, produtosPrices, setProdutosPrices,
    location, refreshGeo: refreshGeo as () => void, mapProvider, setMapProvider,
    atividadesDaFirma: firmas?.find((f) => f.id === firmaId)?.atividades ?? [],
    isSubmitting,
    motivosApreensao,
    modalidade, visitaId, constatacaoActivaId, setConstatacaoActivaId,
    coberturaReconhecida, setCoberturaReconhecida,
    navigate, saveDraft, setSearch, visibleFirmsCount, setVisibleFirmsCount,
    apreensaoActiva, setApreensaoActiva: setApreensaoDeclarada, apreensaoSemInfracao, setApreensaoSemInfracao,
    apreensaoJustificacao, setApreensaoJustificacao, apreensaoItens, setApreensaoItens,
    trustee, setTrustee,
  }), [
    firmas, filteredFirmas, firmaId, search, representante, atividadeEconomica,
    showAddAtividade, newAtivRamo, newAtivAtividade, newAtivLocal, isSavingAtividade,
    date, time, technicians, predefinedInfracoes, infracoes, searchInfracao,
    infracaoCountByType, selectedInfraction, recomendacoes, customRecommendation,
    recomendacoesHistoricas, groupedHistoricoRecomendacoes, historicoVisitas,
    anexos, showCamera, cameraMode, selectedPreview, notes,
    supplyProducts, supplyStatus, supplyCachedAt, produtosPrices,
    location, mapProvider, isSubmitting, visibleFirmsCount,
    apreensaoActiva, apreensaoSemInfracao, apreensaoJustificacao, apreensaoItens, trustee,
    modalidade, visitaId, constatacaoActivaId, coberturaReconhecida,
    motivosApreensao,
  ]);

  // A escolha de modalidade só aparece depois de resolvida a pergunta do
  // rascunho: as duas ao mesmo tempo punham o agente a decidir a modalidade de
  // uma fiscalização que talvez fosse recuperar — e a recuperação decide-a por
  // ele, a partir do que estava gravado.
  if (!draftChecked) {
    return <div className="h-full bg-[#F5F7FA] dark:bg-slate-950" />;
  }

  if (!modalidade) {
    return (
      <ModalidadeSelector
        onEscolher={setModalidade}
        onVoltar={() => navigate(-1)}
      />
    );
  }

  return (
    <NovaVisitaProvider value={formContext}>
    <div ref={formRef} className="flex flex-col h-full bg-[#F5F7FA] dark:bg-slate-950 text-slate-800 dark:text-slate-100 relative">
      {/* A faixa de «rascunho restaurado» foi substituída pela pergunta
          explícita à entrada — era discreta ao ponto de passar despercebida. */}
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
        {stepKey === 'operador'     && <StepOperador />}
        {stepKey === 'equipa'       && <StepEquipa />}
        {stepKey === 'denuncia' && (
          <StepDenuncia
            complaint={complaint}
            verification={complaintVerification}
            onChange={setComplaintVerification}
            evidenceCount={anexos.length}
            findingCount={complaintFindingCount}
            gaps={complaintGaps}
          />
        )}
        {stepKey === 'tela'         && (
          <TelaIterativa
            folha={folhaIterativa}
            onFolha={setFolhaIterativa}
            pendencias={pendenciasDaFase}
            alerta={alertaPendencias}
            onFecharAlerta={() => setAlertaPendencias(false)}
            onContinuar={() => {
              setAlertaPendencias(false);
              handleNext();
            }}
          />
        )}
        {stepKey === 'infracoes'    && <StepInfracoes />}
        {stepKey === 'apreensao'    && <StepApreensao />}
        {stepKey === 'provas'       && <StepProvas />}
        {stepKey === 'cestaBasica'  && <StepCestaBasica />}
        {stepKey === 'recomendacoes'&& <StepRecomendacoes />}
        {stepKey === 'revisao'      && <StepRevisao complaint={complaint} verification={complaintVerification} />}
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
               onClick={() => void avancar()}
               disabled={!canAdvanceStep}
               className="flex-1 px-6 py-3.5 rounded-xl text-sm font-bold text-white bg-indigo-600 disabled:opacity-50 disabled:bg-slate-400 dark:disabled:bg-slate-800 hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200/50 dark:shadow-none"
            >
               Próximo Passo
            </button>
         ) : (
            <button
               onClick={handleSubmit}
               disabled={isSubmitting || coberturaPorReconhecer}
               className="flex-1 px-6 py-3.5 rounded-xl text-sm font-bold text-white bg-slate-900 dark:bg-slate-950 hover:bg-slate-800 dark:hover:bg-slate-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg shadow-slate-900/20 dark:shadow-none"
            >
               {isSubmitting ? 'A guardar...' : 'Finalizar Registo'}
            </button>
         )}
      </div>

      {needsUnlock && (
        <UnlockDialog
          reason="A base local ficou bloqueada. Introduza a palavra-passe para concluir o registo — a fiscalização preenchida mantém-se."
          onUnlocked={() => {
            setNeedsUnlock(false);
            void handleSubmit();
          }}
          onCancel={() => setNeedsUnlock(false)}
        />
      )}
    </div>
    </NovaVisitaProvider>
  );
}
