import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  ArrowLeft, RefreshCw, CheckCircle2, Clock, Briefcase, ClipboardList,
  AlertTriangle, Paperclip, ChevronDown, ChevronUp, WifiOff, Zap,
} from 'lucide-react';
import { db } from '../db/db';
import { triggerFullSync } from '../lib/sync';
import { useSyncState } from '../lib/syncState';
import type { Firma, Visita, Infracao, Anexo } from '../db/db';

// ── helpers ──────────────────────────────────────────────────────────────────

function formatDate(dateStr: string | undefined, ts: number | undefined): string {
  if (dateStr) {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' });
    }
  }
  if (ts) {
    return new Date(ts).toLocaleDateString('pt-PT', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  return '—';
}

function statusColor(status: string | undefined) {
  if (status === 'Regularizado') return 'bg-emerald-100 text-emerald-700';
  if (status === 'Inconformes') return 'bg-amber-100 text-amber-700';
  return 'bg-red-100 text-red-700'; // Infrações
}

function severityColor(severity: string | undefined) {
  if (severity === 'Crítica') return 'bg-red-100 text-red-700';
  if (severity === 'Alta') return 'bg-orange-100 text-orange-700';
  return 'bg-amber-100 text-amber-700';
}

// ── sub-componentes ───────────────────────────────────────────────────────────

function SectionHeader({
  icon: Icon,
  label,
  count,
  color,
  open,
  onToggle,
}: {
  icon: React.ElementType;
  label: string;
  count: number;
  color: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-50 transition-colors"
    >
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
        <Icon className="w-4.5 h-4.5" />
      </div>
      <div className="flex-1">
        <span className="font-bold text-slate-800 text-sm">{label}</span>
      </div>
      <span className={`text-xs font-black px-2.5 py-1 rounded-full ${count > 0 ? 'bg-orange-100 text-orange-700' : 'bg-emerald-100 text-emerald-700'}`}>
        {count > 0 ? `${count} pendente${count !== 1 ? 's' : ''}` : '✓ Tudo enviado'}
      </span>
      {count > 0 && (open
        ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
        : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
      )}
    </button>
  );
}

// ── página principal ─────────────────────────────────────────────────────────

export default function PendentesPage() {
  const navigate = useNavigate();
  const syncState = useSyncState();
  const isSyncing = syncState.phase === 'pushing' || syncState.phase === 'pulling';

  const [isSyncing2, setIsSyncing2] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    visitas: true,
    firmas: true,
    infracoes: false,
    anexos: false,
  });

  const pendentes = useLiveQuery(async () => {
    const [firmas, visitas, infracoes, anexos] = await Promise.all([
      db.firmas.filter(x => !x.synced).toArray(),
      db.visitas.filter(x => !x.synced).toArray(),
      db.infracoes.filter(x => !x.synced).toArray(),
      db.anexos.filter(x => !x.synced).toArray(),
    ]);
    return { firmas, visitas, infracoes, anexos };
  }, []);

  const total = (pendentes?.firmas.length ?? 0)
    + (pendentes?.visitas.length ?? 0)
    + (pendentes?.infracoes.length ?? 0)
    + (pendentes?.anexos.length ?? 0);

  const handleSync = async () => {
    if (isSyncing || isSyncing2) return;
    setIsSyncing2(true);
    try { await triggerFullSync(); } catch { /* erros emitidos para syncState */ }
    finally { setIsSyncing2(false); }
  };

  const toggle = (key: string) =>
    setOpenSections(s => ({ ...s, [key]: !s[key] }));

  const isActive = isSyncing || isSyncing2;

  return (
    <div className="flex flex-col h-full bg-[#F5F7FA] dark:bg-slate-950 text-slate-800 dark:text-slate-100">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-3 flex items-center gap-3 shrink-0">
        <button
          onClick={() => navigate(-1)}
          className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-slate-600 dark:text-slate-300" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="font-bold text-slate-900 dark:text-slate-100 text-base truncate">
            Registos Pendentes
          </h1>
          <p className="text-xs text-slate-500 font-medium">
            {total === 0 ? 'Tudo sincronizado' : `${total} registo${total !== 1 ? 's' : ''} por enviar`}
          </p>
        </div>
        <button
          onClick={handleSync}
          disabled={isActive || total === 0}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
            isActive || total === 0
              ? 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500 cursor-not-allowed'
              : 'bg-emerald-500 hover:bg-emerald-400 text-white active:scale-95 shadow-sm'
          }`}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isActive ? 'animate-spin' : ''}`} />
          {isActive ? 'A sincronizar...' : 'Sincronizar'}
        </button>
      </div>

      {/* Progresso de sync em tempo real */}
      {isActive && (
        <div className="bg-blue-600 text-white px-4 py-2.5 flex items-center gap-3 text-xs font-semibold shrink-0">
          <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
          <span className="flex-1">
            {syncState.phase === 'pushing'
              ? `A enviar dados${syncState.pushTotal > 0 ? ` (${syncState.pushDone}/${syncState.pushTotal})` : '...'}`
              : 'A receber actualizações do servidor...'}
          </span>
        </div>
      )}

      {/* Erro de auth */}
      {syncState.phase === 'needs-auth' && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 px-4 py-3 flex items-center gap-3 shrink-0">
          <WifiOff className="w-4 h-4 text-amber-500 shrink-0" />
          <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">
            Sessão expirada — re-autentique-se para retomar a sincronização
          </p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {/* Estado vazio */}
        {total === 0 && pendentes !== undefined && (
          <div className="flex flex-col items-center justify-center h-full gap-4 px-8 py-16 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-emerald-500" />
            </div>
            <div>
              <h2 className="font-bold text-slate-800 dark:text-slate-100 text-lg mb-1">Tudo sincronizado</h2>
              <p className="text-sm text-slate-500 font-medium leading-relaxed">
                Não há registos locais por enviar ao servidor. Os dados estão actualizados.
              </p>
            </div>
            <button
              onClick={() => navigate(-1)}
              className="mt-2 px-5 py-2.5 rounded-xl text-sm font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 transition-colors"
            >
              Voltar
            </button>
          </div>
        )}

        {/* Lista de pendentes */}
        {(total > 0 || pendentes === undefined) && (
          <div className="p-4 space-y-3 max-w-2xl mx-auto w-full">

            {/* ── Fiscalizações ── */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              <SectionHeader
                icon={ClipboardList}
                label="Fiscalizações"
                count={pendentes?.visitas.length ?? 0}
                color="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
                open={openSections.visitas}
                onToggle={() => toggle('visitas')}
              />
              {openSections.visitas && (pendentes?.visitas ?? []).length > 0 && (
                <div className="divide-y divide-slate-100 dark:divide-slate-800 border-t border-slate-100 dark:border-slate-800">
                  {(pendentes!.visitas as Visita[]).map(v => (
                    <button
                      key={v.id}
                      onClick={() => navigate(`/visitas/${v.id}`)}
                      className="w-full flex items-start gap-3 px-4 py-3.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                    >
                      <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0 mt-0.5">
                        <ClipboardList className="w-4 h-4 text-blue-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-black text-slate-500 font-mono">
                            {v.offlineCode ?? v.id?.slice(0, 8).toUpperCase()}
                          </span>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${statusColor(v.status)}`}>
                            {v.status}
                          </span>
                        </div>
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 mt-0.5 truncate">
                          {v.firmaName ?? `Firma ${v.firmaId?.slice(0, 8)}`}
                        </p>
                        <div className="flex items-center gap-1.5 mt-1 text-[11px] text-slate-400 font-medium">
                          <Clock className="w-3 h-3" />
                          {formatDate(v.date, v.createdAt)}
                        </div>
                      </div>
                      <ChevronDown className="w-4 h-4 text-slate-300 mt-1 shrink-0 -rotate-90" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* ── Operadores / Firmas ── */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              <SectionHeader
                icon={Briefcase}
                label="Operadores"
                count={pendentes?.firmas.length ?? 0}
                color="bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400"
                open={openSections.firmas}
                onToggle={() => toggle('firmas')}
              />
              {openSections.firmas && (pendentes?.firmas ?? []).length > 0 && (
                <div className="divide-y divide-slate-100 dark:divide-slate-800 border-t border-slate-100 dark:border-slate-800">
                  {(pendentes!.firmas as Firma[]).map(f => (
                    <button
                      key={f.id}
                      onClick={() => navigate(`/firmas/${f.id}`)}
                      className="w-full flex items-start gap-3 px-4 py-3.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                    >
                      <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center shrink-0 mt-0.5">
                        <Briefcase className="w-4 h-4 text-indigo-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{f.name}</p>
                        <p className="text-[11px] text-slate-400 font-medium mt-0.5">NIF: {f.nif} · {f.district}</p>
                        <div className="flex items-center gap-1.5 mt-1 text-[11px] text-slate-400 font-medium">
                          <Clock className="w-3 h-3" />
                          {formatDate(undefined, f.createdAt)}
                        </div>
                      </div>
                      <ChevronDown className="w-4 h-4 text-slate-300 mt-1 shrink-0 -rotate-90" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* ── Infrações ── */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              <SectionHeader
                icon={AlertTriangle}
                label="Infrações"
                count={pendentes?.infracoes.length ?? 0}
                color="bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                open={openSections.infracoes}
                onToggle={() => toggle('infracoes')}
              />
              {openSections.infracoes && (pendentes?.infracoes ?? []).length > 0 && (
                <div className="divide-y divide-slate-100 dark:divide-slate-800 border-t border-slate-100 dark:border-slate-800">
                  {(pendentes!.infracoes as Infracao[]).map(inf => (
                    <div key={inf.id} className="flex items-start gap-3 px-4 py-3.5">
                      <div className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0 mt-0.5">
                        <AlertTriangle className="w-4 h-4 text-red-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{inf.type}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${severityColor(inf.severity)}`}>
                            {inf.severity}
                          </span>
                          <span className="text-[11px] text-slate-400 font-medium">
                            Fiscalização {inf.visitaId?.slice(0, 8).toUpperCase()}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Anexos / Imagens ── */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              <SectionHeader
                icon={Paperclip}
                label="Anexos / Imagens"
                count={pendentes?.anexos.length ?? 0}
                color="bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400"
                open={openSections.anexos}
                onToggle={() => toggle('anexos')}
              />
              {openSections.anexos && (pendentes?.anexos ?? []).length > 0 && (
                <div className="divide-y divide-slate-100 dark:divide-slate-800 border-t border-slate-100 dark:border-slate-800">
                  {(pendentes!.anexos as Anexo[]).map(a => (
                    <div key={a.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center shrink-0">
                        <Paperclip className="w-4 h-4 text-purple-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{a.fileName}</p>
                        <p className="text-[11px] text-slate-400 font-medium">{a.fileType}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Nota informativa */}
            <div className="flex items-start gap-2.5 bg-slate-100 dark:bg-slate-800 rounded-xl p-3.5">
              <Zap className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
                A sincronização automática acontece em segundo plano quando há ligação à internet.
                Pode forçar uma sincronização imediata com o botão acima.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
