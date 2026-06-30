import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { Search, Plus, Calendar, ShieldAlert, ClipboardList, LayoutList, LayoutGrid, Check, RefreshCw } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { cn } from '../lib/utils';

type VisitNumberSource = {
  id?: string;
  synced?: boolean;
  offlineCode?: string | null;
  officialCode?: string | null;
};

function getVisitNumber(visita: VisitNumberSource) {
  const fallback = visita.id ? `#${visita.id.slice(0, 8).toUpperCase()}` : '—';
  if (visita.synced && visita.officialCode) {
    return { label: 'Nº fiscalização', value: visita.officialCode };
  }
  return { label: 'Nº inicial', value: visita.offlineCode || fallback };
}

export default function VisitasList() {
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(() =>
    (localStorage.getItem('drcae_view_visitas') as 'list' | 'grid') || 'list'
  );
  const [syncFilter, setSyncFilter] = useState<'all' | 'pending' | 'synced'>('all');
  const navigate = useNavigate();

  const data = useLiveQuery(
    async () => {
      let vArr = await db.visitas.toArray();
      const comFirma = await Promise.all(vArr.map(async (v) => {
        const firma = await db.firmas.get(v.firmaId);
        return { ...v, firmaName: firma?.name || 'Firma Desconhecida' };
      }));
      comFirma.sort((a, b) => {
        const dateA = new Date(`${a.date}T${a.time || '00:00:00'}`).getTime();
        const dateB = new Date(`${b.date}T${b.time || '00:00:00'}`).getTime();
        return dateB - dateA;
      });

      const totalCount = comFirma.length;
      const pendingCount = comFirma.filter(v => !v.synced).length;
      const syncedCount = totalCount - pendingCount;

      let filtered = comFirma;
      if (search) {
        const normalizedSearch = search.toLowerCase();
        filtered = filtered.filter(v =>
          v.firmaName.toLowerCase().includes(normalizedSearch) ||
          v.id?.toLowerCase().includes(normalizedSearch) ||
          v.offlineCode?.toLowerCase().includes(normalizedSearch) ||
          v.officialCode?.toLowerCase().includes(normalizedSearch)
        );
      }

      if (syncFilter === 'pending') {
        filtered = filtered.filter(v => !v.synced);
      } else if (syncFilter === 'synced') {
        filtered = filtered.filter(v => v.synced);
      }

      return {
        list: filtered,
        counts: { total: totalCount, pending: pendingCount, synced: syncedCount }
      };
    },
    [search, syncFilter]
  );

  const visitas = data?.list || [];
  const counts = data?.counts || { total: 0, pending: 0, synced: 0 };

  const toggleView = (mode: 'list' | 'grid') => {
    setViewMode(mode);
    localStorage.setItem('drcae_view_visitas', mode);
  };

  const statusColors = (status: string) =>
    status === 'Inconformes'
      ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300'
      : status === 'Infrações'
      ? 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'
      : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300';

  return (
    <div className="p-4 flex flex-col h-full space-y-4">
      <div className="flex gap-2 shrink-0 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Procurar visita..."
            className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1 shrink-0">
          <button
            onClick={() => toggleView('list')}
            className={cn(
              'p-2 rounded-lg transition-colors',
              viewMode === 'list'
                ? 'bg-white dark:bg-slate-700 text-blue-600 shadow-sm'
                : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
            )}
            title="Vista Lista"
          >
            <LayoutList className="w-4 h-4" />
          </button>
          <button
            onClick={() => toggleView('grid')}
            className={cn(
              'p-2 rounded-lg transition-colors',
              viewMode === 'grid'
                ? 'bg-white dark:bg-slate-700 text-blue-600 shadow-sm'
                : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
            )}
            title="Vista Cards"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Sync Status Filter Tabs */}
      <div className="flex bg-slate-100 dark:bg-slate-800 rounded-xl p-1 shrink-0 gap-1 text-xs font-bold w-full select-none">
        <button
          onClick={() => setSyncFilter('all')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg transition-all cursor-pointer',
            syncFilter === 'all'
              ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
          )}
        >
          <span>Todas</span>
          <span className={cn(
            'px-1.5 py-0.5 rounded-md text-[10px] font-extrabold',
            syncFilter === 'all' ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-350' : 'bg-slate-200/60 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400'
          )}>
            {counts.total}
          </span>
        </button>
        <button
          onClick={() => setSyncFilter('pending')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg transition-all cursor-pointer',
            syncFilter === 'pending'
              ? 'bg-white dark:bg-slate-700 text-orange-600 dark:text-orange-400 shadow-sm'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
          )}
        >
          <span>Pendentes</span>
          <span className={cn(
            'px-1.5 py-0.5 rounded-md text-[10px] font-extrabold transition-colors',
            counts.pending > 0 
              ? 'bg-orange-100 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400 font-black' 
              : syncFilter === 'pending' 
              ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400' 
              : 'bg-slate-200/60 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400'
          )}>
            {counts.pending}
          </span>
        </button>
        <button
          onClick={() => setSyncFilter('synced')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg transition-all cursor-pointer',
            syncFilter === 'synced'
              ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-450 shadow-sm'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
          )}
        >
          <span>Sincronizadas</span>
          <span className={cn(
            'px-1.5 py-0.5 rounded-md text-[10px] font-extrabold',
            syncFilter === 'synced' ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-350' : 'bg-slate-200/60 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400'
          )}>
            {counts.synced}
          </span>
        </button>
      </div>

      <div className={cn(
        'flex-1 overflow-y-auto pb-20 custom-scrollbar',
        viewMode === 'grid' ? 'grid grid-cols-2 md:grid-cols-3 gap-3 content-start' : 'space-y-3'
      )}>
        {visitas?.length === 0 ? (
          <div className="col-span-full text-center py-10 text-slate-500 dark:text-slate-400">
            <ClipboardList className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
            <p className="font-medium">Nenhuma visita registada</p>
          </div>
        ) : viewMode === 'list' ? (
          visitas?.map(v => (
            (() => {
              const visitNumber = getVisitNumber(v);
              return (
                <Link
                  key={v.id}
                  to={`/visitas/${v.id}`}
                  className="block bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md dark:hover:bg-slate-800 transition-all"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 pr-3">
                      <div className="mb-1 flex flex-wrap items-center gap-1.5">
                        <span className="text-[9px] uppercase tracking-wider font-black text-slate-400 dark:text-slate-500">
                          {visitNumber.label}
                        </span>
                        <span className={cn(
                          'text-[10px] font-mono font-black px-2 py-0.5 rounded-md border',
                          v.synced && v.officialCode
                            ? 'bg-blue-50 border-blue-100 text-blue-700 dark:bg-blue-950/20 dark:border-blue-900/30 dark:text-blue-300'
                            : 'bg-slate-50 border-slate-200 text-slate-500 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400'
                        )}>
                          {visitNumber.value}
                        </span>
                      </div>
                      <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm leading-tight line-clamp-2">{v.firmaName}</h3>
                    </div>
                    <div className="flex flex-col items-end gap-1.5 shrink-0">
                      <span className={cn('text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-md', statusColors(v.status))}>
                        {v.status}
                      </span>
                      <span className={cn(
                        'text-[8px] uppercase tracking-wider font-extrabold px-1.5 py-0.5 rounded-md flex items-center gap-1 border',
                        v.synced
                          ? 'bg-slate-50 border-slate-200 text-slate-500 dark:bg-slate-800 dark:border-slate-700'
                          : 'bg-orange-50 border-orange-200 text-orange-700 dark:bg-orange-950/20 dark:border-orange-900/30'
                      )}>
                        {v.synced ? <Check className="w-2.5 h-2.5 text-emerald-500" /> : <RefreshCw className="w-2.5 h-2.5 text-orange-500" />}
                        {v.synced ? 'Sinc' : 'Pendente'}
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      {v.date}{v.time ? ` ${v.time}` : ''}
                    </div>
                    <div className="flex items-center gap-1.5 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded bg-slate-50 dark:bg-slate-800">
                      <ShieldAlert className="w-3.5 h-3.5 text-slate-400" />
                      {v.technicians.length} Téc.
                    </div>
                  </div>
                </Link>
              );
            })()
          ))
        ) : (
          visitas?.map(v => (
            (() => {
              const visitNumber = getVisitNumber(v);
              return (
                <Link
                  key={v.id}
                  to={`/visitas/${v.id}`}
                  className="flex flex-col bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md dark:hover:bg-slate-800 transition-all gap-2"
                >
                  <div className="flex justify-between items-center w-full gap-2">
                    <span className={cn('text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-md', statusColors(v.status))}>
                      {v.status}
                    </span>
                    <span
                      title={v.synced ? 'Sincronizada' : 'Pendente de sincronização'}
                      className={cn(
                        'p-1 rounded-md flex items-center justify-center border shrink-0',
                        v.synced
                          ? 'bg-slate-50 border-slate-200 text-slate-500 dark:bg-slate-800 dark:border-slate-700'
                          : 'bg-orange-50 border-orange-200 text-orange-700 dark:bg-orange-950/20 dark:border-orange-900/30'
                      )}
                    >
                      {v.synced ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <RefreshCw className="w-3.5 h-3.5 text-orange-500" />}
                    </span>
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm leading-tight line-clamp-3">{v.firmaName}</h3>
                    <div className="mt-2 inline-flex flex-col gap-0.5 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 dark:border-slate-700 dark:bg-slate-800">
                      <span className="text-[8px] uppercase tracking-wider font-black text-slate-400 dark:text-slate-500">
                        {visitNumber.label}
                      </span>
                      <span className={cn(
                        'text-[10px] font-mono font-black',
                        v.synced && v.officialCode ? 'text-blue-700 dark:text-blue-300' : 'text-slate-500 dark:text-slate-400'
                      )}>
                        {visitNumber.value}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-auto pt-2 border-t border-slate-100 dark:border-slate-800 text-[10px] font-bold text-slate-500 dark:text-slate-400">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {v.date}{v.time ? ` ${v.time}` : ''}
                    </div>
                    <span>{v.technicians.length} téc.</span>
                  </div>
                </Link>
              );
            })()
          ))
        )}
      </div>

      <button
        onClick={() => navigate('/visitas/nova')}
        className="fixed bottom-24 md:bottom-8 right-6 w-14 h-14 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full flex items-center justify-center shadow-xl shadow-indigo-600/35 transition-all hover:scale-105 active:scale-95 z-30 group"
        title="Registar Nova Fiscalização"
      >
        <Plus className="w-6 h-6 transition-transform group-hover:rotate-90 duration-200" />
      </button>
    </div>
  );
}
