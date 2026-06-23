import React, { useEffect, useState } from 'react';
import { X, AlertTriangle, BookOpen, History, TrendingUp } from 'lucide-react';
import { db } from '../db/db';
import { cn } from '../lib/utils';

interface InfractionItem {
  type: string;
  severity: string;
  legalInstrument?: string;
  details?: string;
}

interface InfractionDetailDrawerProps {
  infraction: InfractionItem | null;
  onClose: () => void;
}

interface RecidivismEntry {
  date: string;
  firmaName: string;
}

function getRecidivismLevel(count: number): { label: string; color: string } {
  if (count === 0) return { label: 'Sem Registo', color: 'text-slate-500 bg-slate-100 dark:bg-slate-800' };
  if (count <= 2) return { label: 'Baixo', color: 'text-emerald-700 bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300' };
  if (count <= 5) return { label: 'Médio', color: 'text-amber-700 bg-amber-100 dark:bg-amber-900/30 dark:text-amber-300' };
  return { label: 'Alto', color: 'text-red-700 bg-red-100 dark:bg-red-900/30 dark:text-red-300' };
}

const severityColors: Record<string, string> = {
  Alta: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  Média: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  Baixa: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
};

export default function InfractionDetailDrawer({ infraction, onClose }: InfractionDetailDrawerProps) {
  const [recidivismCount, setRecidivismCount] = useState(0);
  const [history, setHistory] = useState<RecidivismEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!infraction) return;
    setLoading(true);
    (async () => {
      const matches = await db.infracoes.filter(i => i.type === infraction.type).toArray();
      setRecidivismCount(matches.length);
      const entries: RecidivismEntry[] = [];
      for (const m of matches.slice(-5).reverse()) {
        const visita = m.visitaId ? await db.visitas.get(m.visitaId) : null;
        const firma = visita?.firmaId ? await db.firmas.get(visita.firmaId) : null;
        entries.push({
          date: visita?.date || '—',
          firmaName: firma?.name || 'Firma desconhecida',
        });
      }
      setHistory(entries);
    })().finally(() => setLoading(false));
  }, [infraction?.type]);

  if (!infraction) return null;

  const level = getRecidivismLevel(recidivismCount);

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
              <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider', severityColors[infraction.severity] || 'bg-slate-100 text-slate-700')}>
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
          {/* Reincidência */}
          <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-slate-500 dark:text-slate-400" />
              <span className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">Nível de Reincidência</span>
            </div>
            <div className="flex items-center gap-3">
              <span className={cn('text-sm font-bold px-3 py-1.5 rounded-xl', level.color)}>
                {level.label}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {recidivismCount === 0
                  ? 'Primeira ocorrência registada'
                  : `${recidivismCount} ocorrência${recidivismCount !== 1 ? 's' : ''} registada${recidivismCount !== 1 ? 's' : ''} localmente`}
              </span>
            </div>
          </div>

          {/* Enquadramento Legal */}
          {infraction.legalInstrument && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <BookOpen className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">Enquadramento Legal</span>
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

          {/* Histórico */}
          {!loading && history.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <History className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                <span className="text-xs font-bold text-slate-600 dark:text-slate-300 uppercase tracking-wider">Últimas Ocorrências</span>
              </div>
              <div className="space-y-2">
                {history.map((h, i) => (
                  <div key={i} className="flex items-center justify-between text-xs px-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl">
                    <span className="font-medium text-slate-700 dark:text-slate-300 truncate max-w-[70%]">{h.firmaName}</span>
                    <span className="text-slate-400 font-mono shrink-0 ml-2">{h.date}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
