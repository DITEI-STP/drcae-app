import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { Search, Plus, Calendar, ShieldAlert, ClipboardList, LayoutList, LayoutGrid } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { cn } from '../lib/utils';

export default function VisitasList() {
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(() =>
    (localStorage.getItem('drcae_view_visitas') as 'list' | 'grid') || 'list'
  );
  const navigate = useNavigate();

  const visitas = useLiveQuery(
    async () => {
      let vArr = await db.visitas.toArray();
      const comFirma = await Promise.all(vArr.map(async (v) => {
        const firma = await db.firmas.get(v.firmaId);
        return { ...v, firmaName: firma?.name || 'Firma Desconhecida' };
      }));
      comFirma.sort((a, b) =>
        new Date(`${b.date}T${b.time}`).getTime() - new Date(`${a.date}T${a.time}`).getTime()
      );
      if (search) {
        return comFirma.filter(v =>
          v.firmaName.toLowerCase().includes(search.toLowerCase()) || v.id?.includes(search)
        );
      }
      return comFirma;
    },
    [search]
  );

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
        <div className="hidden md:flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1 shrink-0">
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
            <Link
              key={v.id}
              to={`/visitas/${v.id}`}
              className="block bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md dark:hover:bg-slate-800 transition-all"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 pr-3">
                  <p className="text-[10px] text-slate-400 font-mono mb-1">#{v.id?.substring(0, 8).toUpperCase()}</p>
                  <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm leading-tight line-clamp-2">{v.firmaName}</h3>
                </div>
                <span className={cn('text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-md shrink-0', statusColors(v.status))}>
                  {v.status}
                </span>
              </div>
              <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  {v.date}
                </div>
                <div className="flex items-center gap-1.5 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded bg-slate-50 dark:bg-slate-800">
                  <ShieldAlert className="w-3.5 h-3.5 text-slate-400" />
                  {v.technicians.length} Téc.
                </div>
              </div>
            </Link>
          ))
        ) : (
          visitas?.map(v => (
            <Link
              key={v.id}
              to={`/visitas/${v.id}`}
              className="flex flex-col bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md dark:hover:bg-slate-800 transition-all gap-2"
            >
              <span className={cn('text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-md self-start', statusColors(v.status))}>
                {v.status}
              </span>
              <div>
                <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm leading-tight line-clamp-3">{v.firmaName}</h3>
                <p className="text-[10px] text-slate-400 font-mono mt-1">#{v.id?.substring(0, 8).toUpperCase()}</p>
              </div>
              <div className="flex items-center justify-between mt-auto pt-2 border-t border-slate-100 dark:border-slate-800 text-[10px] font-bold text-slate-500 dark:text-slate-400">
                <div className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {v.date}
                </div>
                <span>{v.technicians.length} téc.</span>
              </div>
            </Link>
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
