import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import {
  ArrowLeft, ArrowRight, User, Calendar, MapPin, AlertTriangle,
  FileText, Image as ImageIcon, PenLine, Lock, LockKeyhole, X, Check,
  Save, CheckCircle, Plus, ChevronDown, Scale, ShieldAlert, ShoppingCart,
  History, XCircle, Clock
} from 'lucide-react';
import { cn } from '../lib/utils';
import { toast, customAlert } from '../lib/notifications';
import { triggerFullSyncIfReachable } from '../lib/sync';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { RecomendacaoHistorica, ProdutoPreco } from '../db/db';
import { computeRecidivism, recidivismLabel } from '../lib/recidivism';

// Leaflet icon fix
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});

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

function formatMoney(value?: number | string | null) {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  return n.toLocaleString('pt-ST', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' STN';
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function MiniMap({ lat, lng }: { lat: number; lng: number }) {
  return (
    <div className="h-44 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm mb-3">
      <MapContainer center={[lat, lng]} zoom={16} scrollWheelZoom={false} className="h-full w-full" style={{ zIndex: 0 }}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <Marker position={[lat, lng]} />
      </MapContainer>
    </div>
  );
}

const SEV_CONFIG: Record<string, { label: string; badge: string; dot: string; panelBg: string; panelBorder: string }> = {
  'Crítica': {
    label: 'Crítica',
    badge: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    dot: 'bg-red-500',
    panelBg: 'bg-red-50 dark:bg-red-950/20',
    panelBorder: 'border-red-100 dark:border-red-900/30',
  },
  'Alta': {
    label: 'Alta',
    badge: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
    dot: 'bg-orange-500',
    panelBg: 'bg-orange-50 dark:bg-orange-950/20',
    panelBorder: 'border-orange-100 dark:border-orange-900/30',
  },
  'Baixa': {
    label: 'Baixa',
    badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    dot: 'bg-amber-500',
    panelBg: 'bg-amber-50 dark:bg-amber-950/20',
    panelBorder: 'border-amber-100 dark:border-amber-900/30',
  },
};

function InfractionCard({ type, severity, minimum_penalty, maximum_penalty, recurrence }: {
  type: string;
  severity: string;
  minimum_penalty?: number | null;
  maximum_penalty?: number | null;
  recurrence?: number;
}) {
  const [open, setOpen] = useState(false);
  const sev = SEV_CONFIG[severity] ?? {
    label: severity || '—',
    badge: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
    dot: 'bg-slate-400',
    panelBg: 'bg-slate-50 dark:bg-slate-800/30',
    panelBorder: 'border-slate-100 dark:border-slate-800',
  };
  const hasPenalty = minimum_penalty != null || maximum_penalty != null;
  const recBadge = recurrence ? recidivismLabel(recurrence) : null;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-slate-50/60 dark:hover:bg-white/[0.02] transition-colors cursor-pointer"
      >
        <span className={cn('h-2 w-2 rounded-full shrink-0', sev.dot)} />
        <span className="flex-1 text-sm font-medium text-slate-800 dark:text-slate-200 leading-snug">{type}</span>
        <div className="flex items-center gap-2 shrink-0">
          <span className={cn('rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase', sev.badge)}>
            {sev.label}
          </span>
          {recBadge && (
            <span className={cn('rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase', recBadge.className)}>
              {recBadge.label}
            </span>
          )}
          {hasPenalty && (
            <ChevronDown size={13} className={cn('text-slate-400 transition-transform duration-200', open && 'rotate-180')} />
          )}
        </div>
      </button>

      {open && hasPenalty && (
        <div className={cn('border-t px-4 py-3 grid grid-cols-2 gap-3', sev.panelBg, sev.panelBorder)}>
          {minimum_penalty != null && (
            <div className="bg-white dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-white/10 p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Scale size={11} className="text-slate-400" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Pena Mínima</span>
              </div>
              <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{formatMoney(minimum_penalty)}</span>
            </div>
          )}
          {maximum_penalty != null && (
            <div className="bg-white dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-white/10 p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Scale size={11} className="text-slate-400" />
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Pena Máxima</span>
              </div>
              <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{formatMoney(maximum_penalty)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type Conformidade = 'conforme' | 'nao_conforme' | null;

// Modo automático (operador com livro em vigor): compara o preço informado
// com o preço de referência do livro. Modo manual (sem livro): usa a
// classificação que o agente já escolheu em NovaVisita.tsx STEP 6.
function resolveConformidade(
  reported: string | undefined,
  book: number | null | undefined,
  manualEval: 'conforme' | 'nao_conforme' | null | undefined,
): Conformidade {
  if (manualEval) return manualEval;
  if (!reported) return null;
  const reportedNum = parseFloat(reported);
  if (Number.isNaN(reportedNum) || book == null) return null;
  return reportedNum <= book ? 'conforme' : 'nao_conforme';
}

function ConformidadeBadge({ conformidade }: { conformidade: Conformidade }) {
  if (conformidade === 'conforme') {
    return (
      <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">
        <Check className="w-2.5 h-2.5" /> Conforme
      </span>
    );
  }
  if (conformidade === 'nao_conforme') {
    return (
      <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
        <XCircle className="w-2.5 h-2.5" /> Não Conforme
      </span>
    );
  }
  return null;
}

function ProdutosSection({ produtos }: { produtos: ProdutoPreco[] }) {
  if (!produtos.length) return null;

  const formatPreco = (reported?: string | null, book?: number | null) => {
    if (reported && reported !== '') return { value: reported, isBook: false };
    if (book != null) return { value: formatMoney(book), isBook: true };
    return null;
  };

  return (
    <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 mt-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2 text-sm">
          <ShoppingCart className="w-4 h-4 text-blue-500" />
          Cesta Básica — Preços Verificados
        </h3>
        <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-[10px] font-bold px-2 py-0.5 rounded-full">{produtos.length}</span>
      </div>

      <div className="space-y-2">
        {produtos.map((p, i) => {
          const grossInfo = formatPreco(p.gross, p.grossPrice);
          const retailInfo = formatPreco(p.retail, p.retailPrice);
          const grossConformidade = resolveConformidade(p.gross, p.grossPrice, p.grossEval);
          const retailConformidade = resolveConformidade(p.retail, p.retailPrice, p.retailEval);
          return (
            <div key={i} className="flex items-center justify-between gap-2 border-b border-slate-50 dark:border-slate-800 pb-2 last:border-0 last:pb-0">
              <span className="text-sm font-medium text-slate-800 dark:text-slate-200 flex-1 leading-tight">{p.name}</span>
              <div className="flex items-center gap-3 shrink-0">
                {grossInfo && (
                  <div className="text-right space-y-1">
                    <p className="text-[9px] text-slate-400 font-bold uppercase">Grosso</p>
                    <p className={cn('text-xs font-bold font-mono', grossInfo.isBook ? 'text-slate-400' : 'text-slate-700 dark:text-slate-300')}>{grossInfo.value}</p>
                    <ConformidadeBadge conformidade={grossConformidade} />
                  </div>
                )}
                {retailInfo && (
                  <div className="text-right space-y-1">
                    <p className="text-[9px] text-slate-400 font-bold uppercase">Retalho</p>
                    <p className={cn('text-xs font-bold font-mono', retailInfo.isBook ? 'text-slate-400' : 'text-slate-700 dark:text-slate-300')}>{retailInfo.value}</p>
                    <ConformidadeBadge conformidade={retailConformidade} />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function HistoricoSection({ items }: { items: RecomendacaoHistorica[] }) {
  if (!items.length) return null;
  return (
    <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 mt-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2 text-sm">
          <History className="w-4 h-4 text-violet-500" />
          Recomendações Históricas
        </h3>
        <span className="bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 text-[10px] font-bold px-2 py-0.5 rounded-full">{items.length}</span>
      </div>
      <div className="space-y-3">
        {items.map((rec, i) => (
          <div key={i} className="flex gap-3 items-start">
            <div className={cn(
              'h-7 w-7 rounded-full flex items-center justify-center text-white shrink-0 mt-0.5',
              rec.atendida === true ? 'bg-emerald-500' : rec.atendida === false ? 'bg-red-500' : 'bg-slate-400 dark:bg-slate-600'
            )}>
              {rec.atendida === true ? <Check size={12} /> : rec.atendida === false ? <XCircle size={12} /> : <Clock size={12} />}
            </div>
            <div className="flex-1 bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 border border-slate-100 dark:border-slate-700/50">
              <p className="text-sm font-medium text-slate-800 dark:text-slate-200 leading-snug">{rec.text}</p>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                {rec.dataOrigem && (
                  <span className="text-[10px] font-mono text-slate-400">{rec.dataOrigem}</span>
                )}
                {rec.equipaOrigem?.length > 0 && (
                  <span className="text-[10px] text-slate-400">• {rec.equipaOrigem.join(', ')}</span>
                )}
                <span className={cn(
                  'ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full',
                  rec.atendida === true ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                  : rec.atendida === false ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                  : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                )}>
                  {rec.atendida === true ? 'Atendida' : rec.atendida === false ? 'Não atendida' : 'Pendente'}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function VisitaDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const visita = useLiveQuery(() => db.visitas.get(id!), [id]);
  const firma = useLiveQuery(() => visita ? db.firmas.get(visita.firmaId) : undefined, [visita]);
  const infracoes = useLiveQuery(() => db.infracoes.where('visitaId').equals(id!).toArray(), [id]);
  const anexos = useLiveQuery(() => db.anexos.where('visitaId').equals(id!).toArray(), [id]);

  // Histórico de infrações da firma, usado para classificar cada infração
  // desta visita em incidente / reincidente / multi-reincidente.
  const recidivismByInfracaoId = useLiveQuery(async () => {
    if (!visita?.firmaId) return new Map<string, number>();
    const firmaVisitas = await db.visitas.where('firmaId').equals(visita.firmaId).toArray();
    const sortKeyByVisitaId = new Map(
      firmaVisitas.map(v => [v.id!, v.createdAt ?? Date.parse(`${v.date}T${v.time || '00:00'}`) ?? 0])
    );
    const visitaIds = firmaVisitas.map(v => v.id!).filter(Boolean);
    if (!visitaIds.length) return new Map<string, number>();
    const firmaInfracoes = await db.infracoes.where('visitaId').anyOf(visitaIds).toArray();
    return computeRecidivism(firmaInfracoes, sortKeyByVisitaId);
  }, [visita?.firmaId]);

  const [showEditModal, setShowEditModal] = useState(false);
  const [editNotes, setEditNotes] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [editAtividade, setEditAtividade] = useState('');
  const [editTechnicians, setEditTechnicians] = useState('');
  const [localAttachmentUrls, setLocalAttachmentUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!id) return;

    let active = true;
    const objectUrls: string[] = [];

    db.attachments
      .where('visitaId')
      .equals(id)
      .toArray()
      .then((attachments) => {
        if (!active) return;
        const nextUrls: Record<string, string> = {};
        for (const attachment of attachments) {
          const url = URL.createObjectURL(attachment.data);
          objectUrls.push(url);
          nextUrls[attachment.id] = url;
        }
        setLocalAttachmentUrls(nextUrls);
      })
      .catch((err) => {
        console.warn('[drcae] Falha ao carregar anexos locais:', err);
        if (active) setLocalAttachmentUrls({});
      });

    return () => {
      active = false;
      for (const url of objectUrls) URL.revokeObjectURL(url);
    };
  }, [id, anexos?.length]);

  const canEdit = () => {
    if (!visita) return false;
    if (!visita.synced) return true;
    if (visita.createdAt) {
      return (Date.now() - visita.createdAt) < 60 * 60 * 1000;
    }
    return false;
  };

  const getRemainingEditMinutes = () => {
    if (!visita) return 0;
    if (!visita.synced) return 60;
    if (!visita.createdAt) return 0;
    return Math.max(0, Math.ceil(((60 * 60 * 1000) - (Date.now() - visita.createdAt)) / 60000));
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
      const updatedTechs = editTechnicians.split(',').map(t => t.trim()).filter(Boolean);
      const updatedVisita = {
        ...visita,
        notes: editNotes,
        status: editStatus as any,
        atividadeEconomica: editAtividade,
        technicians: updatedTechs,
        synced: false,
      };
      await db.visitas.put(updatedVisita);
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

  const produtos = visita.produtos ?? [];
  const recomendacoesHistoricas = visita.recomendacoesHistoricas ?? [];

  return (
    <div className="flex flex-col h-full bg-[#F5F7FA] dark:bg-slate-950 pb-safe">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 px-4 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0 sticky top-0 z-10 flex items-center justify-between">
        <div className="flex items-center">
          <button onClick={() => navigate(-1)} className="mr-3 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 cursor-pointer">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="font-bold text-slate-900 dark:text-slate-100 tracking-tight">Detalhes da Visita</h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleOpenEdit}
            className={cn(
              "p-2 rounded-lg border transition-all flex items-center justify-center cursor-pointer",
              canEdit()
                ? "bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-900/30 hover:bg-blue-100"
                : "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600 border-slate-200 dark:border-slate-800"
            )}
            title={canEdit() ? "Retificar Dados" : "Edição Bloqueada"}
          >
            {canEdit() ? <PenLine className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
          </button>
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
          <div className="bg-emerald-50 dark:bg-emerald-950/10 border border-emerald-200 dark:border-emerald-900/30 rounded-xl p-3.5 flex items-start gap-2.5 shadow-sm">
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
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex flex-col gap-0.5 mb-1">
                {visita.officialCode ? (
                  <p className="text-[11px] font-black text-blue-600 dark:text-blue-400 font-mono tracking-wider">
                    {visita.officialCode}
                  </p>
                ) : null}
                <p className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                  {visita.offlineCode || `#${visita.id?.slice(0, 8).toUpperCase()}`}
                </p>
              </div>
              <button onClick={() => navigate(`/firmas/${visita.firmaId}`)} className="text-left group cursor-pointer">
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 leading-tight group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors flex items-center gap-1">
                  {firma?.name || 'Firma Desconhecida'}
                  <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                </h2>
              </button>
            </div>
          </div>

          {/* GPS mini-map */}
          {visita.geolocation && (
            <div className="mb-4">
              <MiniMap lat={visita.geolocation.lat} lng={visita.geolocation.lng} />
              <div className="flex items-center gap-2 text-xs font-mono text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 px-3 py-2 rounded-lg border border-slate-100 dark:border-slate-800">
                <MapPin className="w-3 h-3 text-emerald-500 shrink-0" />
                {visita.geolocation.lat.toFixed(6)}, {visita.geolocation.lng.toFixed(6)}
              </div>
            </div>
          )}

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
                      <div className={cn('w-10 h-10 rounded-full flex items-center justify-center text-white text-xs font-black shadow-sm bg-gradient-to-br', gradient)}>
                        {initials}
                      </div>
                      <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-400 text-center leading-tight max-w-[56px] truncate">{t.split(' ')[0]}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Infrações */}
        <div>
          <div className="flex items-center justify-between mb-3 px-1">
            <h3 className="font-bold text-[10px] uppercase tracking-widest text-slate-400 dark:text-slate-500 flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
              Infrações Constatadas
            </h3>
            <span className={cn(
              "text-xs font-bold px-2 py-0.5 rounded-full",
              infracoes && infracoes.length > 0
                ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400"
                : "bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
            )}>{infracoes?.length || 0}</span>
          </div>

          {infracoes && infracoes.length > 0 ? (
            <div className="space-y-2">
              {infracoes.map(inf => (
                <React.Fragment key={inf.id}>
                  <InfractionCard
                    type={inf.type}
                    severity={inf.severity}
                    minimum_penalty={inf.minimum_penalty}
                    maximum_penalty={inf.maximum_penalty}
                    recurrence={inf.id ? recidivismByInfracaoId?.get(inf.id) : undefined}
                  />
                </React.Fragment>
              ))}
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 text-sm text-slate-500 dark:text-slate-400 text-center">
              Nenhuma infração registada.
            </div>
          )}
        </div>

        {/* Recomendações actuais */}
        {visita.recomendacoes && visita.recomendacoes.length > 0 && (
          <div className="bg-blue-50/50 dark:bg-blue-950/15 p-5 rounded-2xl shadow-sm border border-blue-200 dark:border-blue-900/30 font-sans">
            <div className="flex items-center justify-between mb-4 border-b border-blue-100 dark:border-blue-900/20 pb-3">
              <h3 className="font-bold text-blue-950 dark:text-blue-400 flex items-center gap-2 text-sm">
                <CheckCircle className="w-4 h-4 text-blue-600" />
                Recomendações desta Visita
              </h3>
              <span className="bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-400 text-[10px] font-bold px-2 py-0.5 rounded-full">{visita.recomendacoes.length}</span>
            </div>
            <ul className="space-y-2.5">
              {visita.recomendacoes.map((rec, i) => (
                <li key={i} className="flex gap-2.5 items-start text-sm text-slate-700">
                  <span className="w-2 h-2 rounded-full bg-blue-500 mt-1.5 shrink-0" />
                  <span className="font-medium text-slate-800 dark:text-slate-200 leading-relaxed">{rec}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Recomendações Históricas */}
        <HistoricoSection items={recomendacoesHistoricas} />

        {/* Cesta Básica */}
        <ProdutosSection produtos={produtos} />

        {/* Notas e Anexos */}
        <div>
          <div className="flex items-center justify-between mb-3 px-1">
            <h3 className="font-bold text-[10px] uppercase tracking-widest text-slate-400 dark:text-slate-500 flex items-center gap-2">
              <FileText className="w-3.5 h-3.5 text-blue-500" />
              Notas e Anexos
            </h3>
            <span className="bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold px-2 py-0.5 rounded-full">{anexos?.length || 0}</span>
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
                const imgSrc = (anx.data && anx.data !== '')
                  ? anx.data as string
                  : (anx.id ? localAttachmentUrls[anx.id] : null) || (anx as any).url || null;
                const isImage = anx.fileType.startsWith('image/');
                const isVideo = anx.fileType.startsWith('video/');
                return (
                  <div key={anx.id} className="bg-white dark:bg-slate-900 p-2 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    {isImage && imgSrc ? (
                      <img src={imgSrc} alt={anx.fileName} className="w-full aspect-square object-cover rounded-lg" />
                    ) : isVideo && imgSrc ? (
                      <video src={imgSrc} controls className="w-full aspect-square object-cover rounded-lg bg-black" />
                    ) : (
                      <div className="w-full aspect-square bg-blue-50 dark:bg-blue-950/20 rounded-lg flex flex-col items-center justify-center text-blue-500 gap-2 border border-dashed border-blue-200 dark:border-blue-900/30">
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

      {/* Sticky Bottom Bar */}
      <div className="border-t border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md p-4 sticky bottom-0 z-10 shrink-0 shadow-lg flex items-center justify-between gap-4">
        <div className="flex flex-col text-left min-w-0">
          <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block font-mono">Operador Económico</span>
          <span className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate max-w-[200px] md:max-w-xs leading-normal">{firma?.name || 'Carregando...'}</span>
        </div>
        <button
          onClick={() => navigate('/visitas/nova', { state: { firmaId: visita.firmaId } })}
          className="flex-1 max-w-xs md:max-w-sm py-3 bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 hover:from-blue-700 hover:via-indigo-700 hover:to-violet-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all shadow-md dark:shadow-none cursor-pointer uppercase tracking-wider"
        >
          <Plus className="w-4 h-4" />
          Nova Fiscalização
        </button>
      </div>

      {/* Edit Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90vh] border border-slate-200 dark:border-slate-800">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0 bg-slate-50 dark:bg-slate-800/40">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-slate-100 text-base">Retificar Fiscalização</h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Correção de auditoria pós-vistoria</p>
              </div>
              <button onClick={() => setShowEditModal(false)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 transition-all cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-5 overflow-y-auto custom-scrollbar flex-1">
              {/* Status Selection */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block font-mono">Resultado da Vistoria</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { val: 'Regularizado', label: 'Regularizado', desc: 'Sem infrações', color: 'border-emerald-200 text-emerald-800 bg-emerald-50/30 dark:border-emerald-900/30 dark:text-emerald-400 dark:bg-emerald-950/10', activeColor: 'ring-2 ring-emerald-500 bg-emerald-50 border-emerald-500 dark:bg-emerald-950/30 dark:border-emerald-600' },
                    { val: 'Recomendações', label: 'Recomendações', desc: 'Sem infrações, com recomendações', color: 'border-sky-200 text-sky-800 bg-sky-50/30 dark:border-sky-900/30 dark:text-sky-400 dark:bg-sky-950/10', activeColor: 'ring-2 ring-sky-500 bg-sky-50 border-sky-500 dark:bg-sky-950/30 dark:border-sky-600' },
                    { val: 'Inconformes', label: 'Inconformes', desc: 'Anomalias leves', color: 'border-amber-200 text-amber-800 bg-amber-50/30 dark:border-amber-900/30 dark:text-amber-400 dark:bg-amber-950/10', activeColor: 'ring-2 ring-amber-500 bg-amber-50 border-amber-500 dark:bg-amber-950/30 dark:border-amber-600' },
                    { val: 'Infrações', label: 'Infrações', desc: 'Falta gravíssima', color: 'border-red-200 text-red-800 bg-red-50/30 dark:border-red-900/30 dark:text-red-400 dark:bg-red-950/10', activeColor: 'ring-2 ring-red-500 bg-red-50 border-red-500 font-bold dark:bg-red-950/30 dark:border-red-600' }
                  ].map(opt => {
                    const isSel = editStatus === opt.val;
                    return (
                      <button
                        key={opt.val}
                        type="button"
                        onClick={() => setEditStatus(opt.val)}
                        className={cn(
                          "p-2.5 rounded-xl border text-left transition-all flex flex-col justify-between h-20 shadow-sm cursor-pointer",
                          opt.color,
                          isSel ? opt.activeColor : 'hover:bg-slate-50 dark:hover:bg-slate-800 border-slate-200 dark:border-slate-800'
                        )}
                      >
                        <span className="text-xs font-bold leading-none">{opt.label}</span>
                        <span className="text-[9px] text-slate-500 dark:text-slate-400 leading-tight block mt-1">{opt.desc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Atividade */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block font-mono">Atividade Económica Associada</label>
                {firma?.atividades && firma.atividades.length > 0 ? (
                  <div className="space-y-2 max-h-40 overflow-y-auto p-1 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-800/30">
                    {firma.atividades.map(ativ => {
                      const title = `${ativ.atividade} (${ativ.ramo})`;
                      const isSel = editAtividade === title;
                      return (
                        <button
                          key={ativ.id}
                          type="button"
                          onClick={() => setEditAtividade(title)}
                          className={cn(
                            "w-full p-2.5 rounded-lg border text-left text-xs transition-all flex justify-between items-center bg-white dark:bg-slate-900 cursor-pointer",
                            isSel
                              ? 'border-indigo-600 dark:border-indigo-400 ring-1 ring-indigo-500 font-semibold text-indigo-900 dark:text-indigo-300 bg-indigo-50/20 dark:bg-indigo-950/20'
                              : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700'
                          )}
                        >
                          <div className="pr-2 truncate">
                            <p className="font-bold truncate">{ativ.atividade}</p>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">{ativ.ramo} - {ativ.local}</p>
                          </div>
                          {isSel && <Check className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 dark:text-slate-400 italic">Nenhuma atividade estruturada disponível.</p>
                )}
                <div className="space-y-1.5 mt-2">
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 font-bold block">Ou especifique outra atividade manualmente:</span>
                  <input
                    type="text"
                    value={editAtividade}
                    onChange={e => setEditAtividade(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 placeholder-slate-400"
                    placeholder="Atividade / Setor de fiscalização..."
                  />
                </div>
              </div>

              {/* Técnicos */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block font-mono">Agentes / Oficiais (separados por vírgula)</label>
                <input
                  type="text"
                  value={editTechnicians}
                  onChange={e => setEditTechnicians(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 placeholder-slate-400"
                  placeholder="Ex: Agente Carvalho, Inspetor Lima"
                />
              </div>

              {/* Notas */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block font-mono">Notas de Observação</label>
                <textarea
                  rows={3}
                  value={editNotes}
                  onChange={e => setEditNotes(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 placeholder-slate-400 custom-scrollbar resize-none"
                  placeholder="Adicione observações para auditoria subsequente..."
                />
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex items-center justify-end gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                className="px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-bold text-slate-600 dark:text-slate-300 transition-colors cursor-pointer"
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
