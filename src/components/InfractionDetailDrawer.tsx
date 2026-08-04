import React, { useEffect, useState } from 'react';
import { X, AlertTriangle, BookOpen, History, TrendingUp, Scale } from 'lucide-react';
import { db } from '../db/db';
import { cn } from '../lib/utils';
import { recidivismLabel } from '../lib/recidivism';
import { formatPenaltyRange, severityClasses } from '../lib/infractionCatalog';
import { tecnicoNames } from '../lib/inspectionModel';
import { semRascunhos } from '../lib/visitaDraft';

interface InfractionItem {
  type: string;
  severity: string;
  severityLevel?: number | null;
  legalInstrument?: string;
  details?: string;
  penaltyMin?: number | null;
  penaltyMax?: number | null;
}

interface InfractionDetailDrawerProps {
  /**
   * Abrir uma fiscalização do histórico. Quem passa isto é responsável por
   * gravar o registo em curso antes de navegar — ver `useReturnAnchor`.
   */
  onOpenInspection?: (visitaId: string) => void;
  infraction: InfractionItem | null;
  /**
   * Operador em vistoria. O histórico é **deste** operador — a consulta era
   * global a todos os operadores, o que tornava o nível apresentado aqui
   * diferente do da listagem, para a mesma infracção e no mesmo ecrã.
   */
  firmaId?: string | null;
  onClose: () => void;
}

interface OccurrenceEntry {
  visitaId: string;
  date: string;
  time: string;
  code: string;
  team: string;
}

export default function InfractionDetailDrawer({ infraction, firmaId, onOpenInspection, onClose }: InfractionDetailDrawerProps) {
  const [occurrences, setOccurrences] = useState<OccurrenceEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!infraction) return;
    setLoading(true);
    (async () => {
      // Sem operador seleccionado não há histórico a apresentar: um histórico
      // global não diz nada sobre a reincidência deste operador.
      if (!firmaId) {
        setOccurrences([]);
        return;
      }

      const visitas = semRascunhos(await db.visitas.where('firmaId').equals(firmaId).toArray());
      const byId = new Map(visitas.map((v) => [v.id!, v]));
      const matches = await db.infracoes
        .filter((i) => i.type === infraction.type && byId.has(i.visitaId))
        .toArray();

      const entries: OccurrenceEntry[] = matches
        .map((m) => {
          const visita = byId.get(m.visitaId);
          return {
            visitaId: m.visitaId,
            date: visita?.date || '—',
            time: visita?.time || '',
            code: visita?.officialCode || visita?.offlineCode || '—',
            team: tecnicoNames(visita?.technicians).join(', '),
          };
        })
        .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));

      setOccurrences(entries);
    })().finally(() => setLoading(false));
  }, [infraction?.type, firmaId]);

  if (!infraction) return null;

  // Mesma função e mesmo âmbito (operador) da listagem do formulário. Havia
  // aqui uma segunda escala — Sem Registo / Baixo / Médio / Alto — global a
  // todos os operadores: duas escalas para o mesmo conceito no mesmo ecrã.
  const badge = recidivismLabel(occurrences.length);
  const penaltyRange = formatPenaltyRange(
    infraction.penaltyMin ?? null,
    infraction.penaltyMax ?? null,
  );

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed inset-x-0 bottom-0 z-50 max-h-[80vh] bg-white dark:bg-slate-900 rounded-t-3xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-300">
        {/* Handle */}
        <div className="shrink-0 flex justify-center pt-3 pb-1">
          <div className="w-10 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700" />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex-1 pr-4">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider', severityClasses(infraction.severityLevel))}>
                {infraction.severity}
              </span>
            </div>
            <h3 className="font-bold text-base text-slate-800 dark:text-slate-100 leading-tight">{infraction.type}</h3>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg transition-colors shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Conteúdo */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Incidência neste operador */}
          <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-slate-500 dark:text-slate-400" />
              <span className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">Incidência neste Operador</span>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              {badge ? (
                <span className={cn('text-sm font-bold px-3 py-1.5 rounded-xl', badge.className)}>
                  {badge.label}
                </span>
              ) : (
                <span className="text-sm font-bold px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400">
                  Sem registo
                </span>
              )}
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {occurrences.length === 0
                  ? 'Nunca aplicada a este operador'
                  : `${occurrences.length} fiscalização${occurrences.length !== 1 ? 'ões' : ''} anterior${occurrences.length !== 1 ? 'es' : ''}`}
              </span>
            </div>
          </div>

          {/* Moldura legal — leitura. O agente conhece-a; não a define. */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Scale className="w-4 h-4 text-slate-500 dark:text-slate-400" />
              <span className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">Coima Aplicável</span>
            </div>
            <p className={cn(
              'text-sm rounded-xl px-4 py-3 font-medium',
              penaltyRange
                ? 'text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800'
                : 'text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-800 italic'
            )}>
              {penaltyRange ?? 'Moldura não definida no catálogo.'}
            </p>
          </div>

          {/* Enquadramento Legal */}
          {infraction.legalInstrument && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <BookOpen className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">Instrumento Jurídico</span>
              </div>
              <p className="text-sm text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 rounded-xl px-4 py-3 font-medium">
                {infraction.legalInstrument}
              </p>
            </div>
          )}

          {/* Descrição */}
          {infraction.details && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">Descrição</span>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{infraction.details}</p>
            </div>
          )}

          {/* Fiscalizações anteriores deste operador */}
          {!loading && occurrences.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <History className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">Fiscalizações Anteriores</span>
              </div>
              <div className="space-y-2">
                {occurrences.map((o) => (
                  <button
                    key={o.visitaId}
                    type="button"
                    disabled={!onOpenInspection}
                    onClick={() => onOpenInspection?.(o.visitaId)}
                    className={cn(
                      'w-full text-left px-3 py-2.5 bg-slate-50 dark:bg-slate-800 rounded-xl transition-colors',
                      onOpenInspection && 'hover:bg-slate-100 dark:hover:bg-slate-750 cursor-pointer'
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-bold text-slate-700 dark:text-slate-300">{o.code}</span>
                      <span className="text-[11px] text-slate-400 shrink-0">
                        {o.date}{o.time ? ` · ${o.time}` : ''}
                      </span>
                    </div>
                    {o.team && (
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 truncate">{o.team}</p>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
