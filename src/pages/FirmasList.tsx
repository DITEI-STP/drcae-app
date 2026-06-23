import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { Search, MapPin, Building, Plus, LayoutList, LayoutGrid, RefreshCw } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { cn } from '../lib/utils';

export default function FirmasList() {
  const [search, setSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(20);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(() =>
    (localStorage.getItem('drcae_view_firmas') as 'list' | 'grid') || 'list'
  );
  const navigate = useNavigate();

  const handleSearchChange = (val: string) => {
    setSearch(val);
    setVisibleCount(20); // Reset length when search changes
  };

  const result = useLiveQuery(
    async () => {
      let list = await db.firmas.toArray();
      if (search) {
        const query = search.toLowerCase();
        list = list.filter(f =>
          (f.name || '').toLowerCase().includes(query) || (f.nif || '').includes(search)
        );
      }
      
      // Ordenação alfabética para estabilidade de paginação
      list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      
      const totalCount = list.length;
      const paginatedList = list.slice(0, visibleCount);

      const items = await Promise.all(paginatedList.map(async (firma) => {
        const visitas = await db.visitas.where('firmaId').equals(firma.id!).toArray();
        const numVisitas = visitas.length;
        const numVisitasComInfracoes = visitas.filter(
          v => v.status === 'Infrações' || v.status === 'Inconformes'
        ).length;
        let numInfracoes = 0;
        for (const v of visitas) {
          numInfracoes += await db.infracoes.where('visitaId').equals(v.id!).count();
        }
        return { ...firma, numVisitas, numVisitasComInfracoes, numInfracoes };
      }));

      return { items, totalCount };
    },
    [search, visibleCount]
  );

  const firmas = result?.items;
  const totalCount = result?.totalCount || 0;

  const toggleView = (mode: 'list' | 'grid') => {
    setViewMode(mode);
    localStorage.setItem('drcae_view_firmas', mode);
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    if (target.scrollHeight - target.scrollTop <= target.clientHeight + 100) {
      if (totalCount && visibleCount < totalCount) {
        setVisibleCount(prev => prev + 20);
      }
    }
  };

  return (
    <div className="p-4 flex flex-col h-full space-y-4">
      <div className="flex gap-2 shrink-0 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Procurar por NIF ou Nome..."
            className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
        </div>
        {/* Toggle lista/grid — apenas tablet+ */}
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

      <div
        onScroll={handleScroll}
        className={cn(
          'flex-1 overflow-y-auto pb-20 custom-scrollbar',
          viewMode === 'grid' ? 'grid grid-cols-2 md:grid-cols-3 gap-3 content-start' : 'space-y-3'
        )}
      >
        {firmas?.length === 0 ? (
          <div className="col-span-full text-center py-10 text-slate-500 dark:text-slate-400">
            <Building className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
            <p className="font-medium">Nenhuma firma encontrada</p>
            <p className="text-sm">Os dados podem não ter sido sincronizados.</p>
          </div>
        ) : viewMode === 'list' ? (
          firmas?.map(firma => (
            <Link
              key={firma.id}
              to={`/firmas/${firma.id}`}
              className="block bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md dark:hover:bg-slate-800 transition-all"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100 leading-tight">{firma.name}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono">NIF: {firma.nif}</p>
                </div>
                {firma.numVisitas! > 0 && (
                  <span className="px-2 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-[10px] rounded uppercase font-bold shrink-0">
                    {firma.numVisitas} VISITAS
                  </span>
                )}
              </div>
              <div className="mt-3 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                  <MapPin className="w-3 h-3" />
                  <span className="truncate max-w-[150px] uppercase">{firma.address || firma.district}</span>
                </div>
                {firma.numInfracoes! > 0 && (
                  <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                    <span className="text-red-500">{firma.numInfracoes}</span> Infr.
                  </div>
                )}
              </div>
            </Link>
          ))
        ) : (
          firmas?.map(firma => (
            <Link
              key={firma.id}
              to={`/firmas/${firma.id}`}
              className="block bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md dark:hover:bg-slate-800 transition-all flex flex-col gap-2"
            >
              <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
                <Building className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100 leading-tight line-clamp-2">{firma.name}</h3>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono mt-1">NIF: {firma.nif}</p>
              </div>
              <div className="flex items-center justify-between mt-auto pt-2 border-t border-slate-100 dark:border-slate-800">
                <span className="text-[10px] font-bold text-slate-400">{firma.numVisitas} visitas</span>
                {firma.numInfracoes! > 0 && (
                  <span className="text-[10px] font-bold text-red-500">{firma.numInfracoes} infr.</span>
                )}
              </div>
            </Link>
          ))
        )}

        {/* Loader de Carregamento Progressivo (Lazy Load) */}
        {firmas && visibleCount < totalCount && (
          <div className="col-span-full py-6 flex items-center justify-center gap-2 text-xs text-slate-400 dark:text-slate-500 font-semibold uppercase tracking-wider">
            <RefreshCw className="w-4 h-4 animate-spin text-indigo-600 dark:text-indigo-400" />
            A carregar mais firmas...
          </div>
        )}
      </div>

      <button
        onClick={() => navigate('/firmas/nova')}
        className="fixed bottom-24 md:bottom-8 right-6 w-14 h-14 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full flex items-center justify-center shadow-xl shadow-indigo-600/35 transition-all hover:scale-105 active:scale-95 z-30 group"
        title="Registar Nova Firma"
      >
        <Plus className="w-6 h-6 transition-transform group-hover:rotate-90 duration-200" />
      </button>
    </div>
  );
}
