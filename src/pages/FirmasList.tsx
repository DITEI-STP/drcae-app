import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { Search, MapPin, Building, Plus, LayoutList, LayoutGrid, RefreshCw, ShieldAlert, ShieldCheck, AlertCircle, HelpCircle, X, SlidersHorizontal, Activity } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { cn } from '../lib/utils';

const getAvatarData = (name: string, nif: string) => {
  const cleanName = (name || 'Firma').trim();
  const initials = cleanName
    .split(/\s+/)
    .filter(w => w)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('');

  // Gerar hash simples do NIF ou do nome
  const seed = nif || name || 'Firma';
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }

  // Gradientes premium com alta legibilidade para texto branco
  const gradients = [
    'from-indigo-500 to-purple-650 dark:from-indigo-600 dark:to-purple-750',
    'from-rose-500 to-pink-650 dark:from-rose-650 dark:to-pink-750',
    'from-blue-500 to-teal-600 dark:from-blue-600 dark:to-teal-700',
    'from-emerald-500 to-teal-650 dark:from-emerald-600 dark:to-teal-750',
    'from-amber-500 to-orange-600 dark:from-amber-600 dark:to-orange-700',
    'from-fuchsia-500 to-purple-600 dark:from-fuchsia-600 dark:to-purple-750',
    'from-violet-500 to-indigo-650 dark:from-violet-600 dark:to-indigo-750'
  ];

  const gradientIndex = Math.abs(hash) % gradients.length;
  return { initials: initials || 'F', gradient: gradients[gradientIndex] };
};

const getRiskStyles = (risk: 'critical' | 'medium' | 'normal' | 'none') => {
  switch (risk) {
    case 'critical':
      return {
        border: 'border-l-4 border-l-red-500 dark:border-l-red-600',
        hoverShadow: 'hover:shadow-lg hover:shadow-red-500/10 dark:hover:shadow-red-950/20'
      };
    case 'medium':
      return {
        border: 'border-l-4 border-l-amber-500 dark:border-l-amber-600',
        hoverShadow: 'hover:shadow-lg hover:shadow-amber-500/10 dark:hover:shadow-amber-950/20'
      };
    case 'normal':
      return {
        border: 'border-l-4 border-l-emerald-500 dark:border-l-emerald-600',
        hoverShadow: 'hover:shadow-lg hover:shadow-emerald-500/10 dark:hover:shadow-emerald-950/20'
      };
    default:
      return {
        border: 'border-l-4 border-l-slate-300 dark:border-l-slate-700',
        hoverShadow: 'hover:shadow-lg hover:shadow-slate-500/5 dark:hover:shadow-slate-900/15'
      };
  }
};


export default function FirmasList() {
  const [search, setSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(20);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(() =>
    (localStorage.getItem('drcae_view_firmas') as 'list' | 'grid') || 'list'
  );
  const [groupDimension, setGroupDimension] = useState<'type' | 'district' | 'risk'>('risk');
  const [activeTab, setActiveTab] = useState<string>('all');
  const [showGroupModal, setShowGroupModal] = useState(false);
  const navigate = useNavigate();

  const handleSearchChange = (val: string) => {
    setSearch(val);
    setVisibleCount(20); // Reset length when search changes
  };

  const handleDimensionChange = (dimension: 'type' | 'district' | 'risk') => {
    setGroupDimension(dimension);
    setActiveTab('all');
    setVisibleCount(20);
  };

  const result = useLiveQuery(
    async () => {
      // 1. Obter todas as firmas, visitas e infrações
      const allFirmas = await db.firmas.toArray();
      const allVisitas = await db.visitas.toArray();
      const allInfracoes = await db.infracoes.toArray();

      // 2. Agrupar visitas por firmaId
      const visitasMap = new Map<string, typeof allVisitas>();
      allVisitas.forEach(v => {
        const arr = visitasMap.get(v.firmaId) || [];
        arr.push(v);
        visitasMap.set(v.firmaId, arr);
      });

      // 3. Contar infrações por visitaId
      const infracoesCountMap = new Map<string, number>();
      allInfracoes.forEach(inf => {
        if (inf.visitaId) {
          infracoesCountMap.set(inf.visitaId, (infracoesCountMap.get(inf.visitaId) || 0) + 1);
        }
      });

      // 4. Mapear cada firma com as suas estatísticas e classificação de risco
      const processedFirmas = allFirmas.map(firma => {
        const visitas = visitasMap.get(firma.id!) || [];
        const numVisitas = visitas.length;
        
        let numInfracoes = 0;
        let hasInfracoesVisitas = false;
        let hasInconformesVisitas = false;
        let hasRegularizadoVisitas = false;

        visitas.forEach(v => {
          numInfracoes += infracoesCountMap.get(v.id!) || 0;
          if (v.status === 'Infrações') hasInfracoesVisitas = true;
          else if (v.status === 'Inconformes') hasInconformesVisitas = true;
          else if (v.status === 'Regularizado') hasRegularizadoVisitas = true;
        });

        // Determinar nível de risco/importância
        let risk: 'critical' | 'medium' | 'normal' | 'none' = 'none';
        if (hasInfracoesVisitas || numInfracoes > 0) {
          risk = 'critical';
        } else if (hasInconformesVisitas) {
          risk = 'medium';
        } else if (hasRegularizadoVisitas) {
          risk = 'normal';
        }

        return {
          ...firma,
          numVisitas,
          numInfracoes,
          risk
        };
      });

      // 5. Computar contagens e opções para as abas com base na dimensão selecionada
      const counts: Record<string, number> = { all: processedFirmas.length };
      let tabs: { id: string; label: string; count: number }[] = [];

      if (groupDimension === 'type') {
        const typesSet = new Set<string>();
        processedFirmas.forEach(f => {
          if (f.type) typesSet.add(f.type);
        });
        const uniqueTypes = Array.from(typesSet).sort();

        uniqueTypes.forEach(t => { counts[t] = 0; });
        processedFirmas.forEach(f => {
          if (f.type && counts[f.type] !== undefined) {
            counts[f.type]++;
          }
        });

        tabs = uniqueTypes.map(t => ({
          id: t,
          label: t,
          count: counts[t] || 0
        }));
      } else if (groupDimension === 'district') {
        const districtsSet = new Set<string>();
        processedFirmas.forEach(f => {
          if (f.district) districtsSet.add(f.district);
        });
        const uniqueDistricts = Array.from(districtsSet).sort();

        uniqueDistricts.forEach(d => { counts[d] = 0; });
        processedFirmas.forEach(f => {
          if (f.district && counts[f.district] !== undefined) {
            counts[f.district]++;
          }
        });

        tabs = uniqueDistricts.map(d => ({
          id: d,
          label: d,
          count: counts[d] || 0
        }));
      } else if (groupDimension === 'risk') {
        counts['critical'] = 0;
        counts['medium'] = 0;
        counts['normal'] = 0;
        counts['none'] = 0;

        processedFirmas.forEach(f => {
          counts[f.risk]++;
        });

        tabs = [
          { id: 'critical', label: 'Crítico', count: counts['critical'] },
          { id: 'medium', label: 'Médio', count: counts['medium'] },
          { id: 'normal', label: 'Normal', count: counts['normal'] },
          { id: 'none', label: 'Sem Inspeção', count: counts['none'] }
        ];
      }

      // 6. Aplicar filtros: pesquisa e aba ativa
      let filtered = processedFirmas;

      if (search) {
        const query = search.toLowerCase();
        filtered = filtered.filter(f =>
          (f.name || '').toLowerCase().includes(query) || (f.nif || '').includes(search)
        );
      }

      if (activeTab !== 'all') {
        if (groupDimension === 'type') {
          filtered = filtered.filter(f => f.type === activeTab);
        } else if (groupDimension === 'district') {
          filtered = filtered.filter(f => f.district === activeTab);
        } else if (groupDimension === 'risk') {
          filtered = filtered.filter(f => f.risk === activeTab);
        }
      }

      filtered.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

      const totalCount = filtered.length;
      const paginatedList = filtered.slice(0, visibleCount);

      return {
        items: paginatedList,
        totalCount,
        tabs,
        allCounts: counts
      };
    },
    [search, visibleCount, groupDimension, activeTab]
  );

  const firmas = result?.items || [];
  const totalCount = result?.totalCount || 0;
  const tabs = result?.tabs || [];
  const allCounts = result?.allCounts || { all: 0 };

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
            placeholder="Procurar firma..."
            className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm text-slate-800 dark:text-slate-100 placeholder-slate-400"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
        </div>

        {/* Botão de Agrupamento que abre a Popup/Modal */}
        <button
          onClick={() => setShowGroupModal(true)}
          className="py-3 px-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-750 transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
        >
          <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400 dark:text-slate-505" />
          <span>Agrupado por: <span className="text-indigo-600 dark:text-indigo-400 capitalize">{groupDimension === 'type' ? 'Tipo' : groupDimension === 'district' ? 'Distrito' : 'Risco'}</span></span>
        </button>

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

      {/* Abas Horizontais Dinâmicas */}
      <div className="flex bg-slate-100 dark:bg-slate-800 rounded-xl p-1 shrink-0 gap-1 text-xs font-bold w-full select-none overflow-x-auto scrollbar-none">
        <button
          onClick={() => setActiveTab('all')}
          className={cn(
            'flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg transition-all cursor-pointer shrink-0 min-w-[70px]',
            activeTab === 'all'
              ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
          )}
        >
          <span>Todas</span>
          <span className={cn(
            'px-1.5 py-0.5 rounded-md text-[10px] font-extrabold transition-colors',
            activeTab === 'all'
              ? 'bg-indigo-650 text-white dark:bg-indigo-500 dark:text-white'
              : 'bg-slate-200/60 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400'
          )}>
            {allCounts.all}
          </span>
        </button>

        {tabs.map((tab) => {
          const isSelected = activeTab === tab.id;
          
          let activeTextColor = 'text-indigo-650 dark:text-indigo-400';
          let activeBadgeColor = 'bg-indigo-650 text-white dark:bg-indigo-500 dark:text-white';
          
          if (groupDimension === 'risk') {
            if (tab.id === 'critical') {
              activeTextColor = 'text-red-600 dark:text-red-400';
              activeBadgeColor = 'bg-red-600 text-white dark:bg-red-500 dark:text-white';
            } else if (tab.id === 'medium') {
              activeTextColor = 'text-amber-600 dark:text-amber-500';
              activeBadgeColor = 'bg-amber-500 text-white dark:bg-amber-500 dark:text-slate-900';
            } else if (tab.id === 'normal') {
              activeTextColor = 'text-emerald-600 dark:text-emerald-500';
              activeBadgeColor = 'bg-emerald-500 text-white dark:bg-emerald-500 dark:text-white';
            } else if (tab.id === 'none') {
              activeTextColor = 'text-slate-650 dark:text-slate-400';
              activeBadgeColor = 'bg-slate-500 text-white dark:bg-slate-600 dark:text-white';
            }
          }

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg transition-all cursor-pointer shrink-0 min-w-[75px]',
                isSelected
                  ? `bg-white dark:bg-slate-700 ${activeTextColor} shadow-sm`
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
              )}
            >
              <span className="capitalize">{tab.label}</span>
              <span className={cn(
                'px-1.5 py-0.5 rounded-md text-[10px] font-extrabold transition-colors',
                isSelected
                  ? activeBadgeColor
                  : 'bg-slate-200/60 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400'
              )}>
                {tab.count}
              </span>
            </button>
          );
        })}
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
            <p className="text-sm">Os dados podem não ter sido sincronizados ou não correspondem ao filtro.</p>
          </div>
        ) : viewMode === 'list' ? (
          firmas?.map(firma => {
            const avatar = getAvatarData(firma.name, firma.nif);
            const riskStyles = getRiskStyles(firma.risk);
            
            return (
              <Link
                key={firma.id}
                to={`/firmas/${firma.id}`}
                className={cn(
                  "block bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm transition-all duration-300",
                  riskStyles.border,
                  riskStyles.hoverShadow,
                  "hover:-translate-y-0.5"
                )}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3 flex-1 pr-3 min-w-0">
                    {/* Dynamic Avatar with deterministic gradient */}
                    <div className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center text-white font-black text-xs shrink-0 shadow-sm bg-gradient-to-br",
                      avatar.gradient
                    )}>
                      {avatar.initials}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100 leading-tight truncate">{firma.name}</h3>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 font-mono">NIF: {firma.nif}</p>
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    {/* Badge de dimensão ativa */}
                    {groupDimension === 'type' ? (
                      <span className={cn(
                        'px-2 py-0.5 text-[9px] rounded uppercase font-extrabold tracking-wider border',
                        firma.type === 'Importador'
                          ? 'bg-purple-50 border-purple-200 text-purple-700 dark:bg-purple-950/20 dark:border-purple-900/30 dark:text-purple-300'
                          : firma.type === 'Revendedor'
                          ? 'bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-950/20 dark:border-blue-900/30 dark:text-blue-300'
                          : 'bg-zinc-50 border-zinc-200 text-zinc-650 dark:bg-zinc-800/40 dark:border-zinc-700 dark:text-zinc-300'
                      )}>
                        {firma.type || 'Sem Tipo'}
                      </span>
                    ) : groupDimension === 'district' ? (
                      <span className="px-2 py-0.5 bg-teal-50 border border-teal-200 text-teal-700 dark:bg-teal-950/20 dark:border-teal-900/30 dark:text-teal-300 text-[9px] rounded uppercase font-extrabold tracking-wider">
                        {firma.district || 'Sem Distrito'}
                      </span>
                    ) : (
                      <span className={cn(
                        'px-2 py-0.5 text-[9px] rounded uppercase font-extrabold tracking-wider border flex items-center gap-1',
                        firma.risk === 'critical'
                          ? 'bg-red-50 border-red-200 text-red-700 dark:bg-red-950/20 dark:border-red-900/30 dark:text-red-300'
                          : firma.risk === 'medium'
                          ? 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/20 dark:border-amber-900/30 dark:text-amber-300'
                          : firma.risk === 'normal'
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-750 dark:bg-emerald-950/20 dark:border-emerald-900/30 dark:text-emerald-300'
                          : 'bg-slate-50 border-slate-200 text-slate-500 dark:bg-slate-800 dark:border-slate-700'
                      )}>
                        {firma.risk === 'critical' && <ShieldAlert className="w-2.5 h-2.5 text-red-550" />}
                        {firma.risk === 'medium' && <AlertCircle className="w-2.5 h-2.5 text-amber-550" />}
                        {firma.risk === 'normal' && <ShieldCheck className="w-2.5 h-2.5 text-emerald-550" />}
                        {firma.risk === 'none' && <HelpCircle className="w-2.5 h-2.5 text-slate-400" />}
                        {firma.risk === 'critical' ? 'Crítico' : firma.risk === 'medium' ? 'Médio' : firma.risk === 'normal' ? 'Normal' : 'Sem Insp.'}
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/60 flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="truncate max-w-[160px]">{firma.address || firma.district || 'Sem Endereço'}</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {/* Visits Pill Badge */}
                    <div className="flex items-center gap-1 text-[9px] font-extrabold text-slate-650 dark:text-slate-350 border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 px-2 py-0.5 rounded-full shrink-0">
                      <Activity className="w-3 h-3 text-slate-400" />
                      <span>{firma.numVisitas} {firma.numVisitas === 1 ? 'VISITA' : 'VISITAS'}</span>
                    </div>

                    {/* Infractions Pill Badge (only if > 0) */}
                    {firma.numInfracoes! > 0 && (
                      <div className="flex items-center gap-1 text-[9px] font-extrabold text-red-600 dark:text-red-400 border border-red-100 dark:border-red-950/30 bg-red-50/30 dark:bg-red-950/10 px-2 py-0.5 rounded-full shrink-0">
                        <ShieldAlert className="w-3 h-3 text-red-500" />
                        <span>{firma.numInfracoes} INFR.</span>
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            );
          })
        ) : (
          firmas?.map(firma => {
            const avatar = getAvatarData(firma.name, firma.nif);
            const riskStyles = getRiskStyles(firma.risk);

            return (
              <Link
                key={firma.id}
                to={`/firmas/${firma.id}`}
                className={cn(
                  "block bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm transition-all duration-300 flex flex-col gap-3.5",
                  riskStyles.border,
                  riskStyles.hoverShadow,
                  "hover:-translate-y-0.5"
                )}
              >
                <div className="flex justify-between items-start w-full gap-2">
                  {/* Dynamic Avatar with deterministic gradient */}
                  <div className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center text-white font-black text-xs shrink-0 shadow-xs bg-gradient-to-br",
                    avatar.gradient
                  )}>
                    {avatar.initials}
                  </div>
                  
                  {/* Badge de dimensão ativa */}
                  {groupDimension === 'type' ? (
                    <span className={cn(
                      'px-1.5 py-0.5 text-[8px] rounded uppercase font-black tracking-wider border shrink-0',
                      firma.type === 'Importador'
                        ? 'bg-purple-50 border-purple-200 text-purple-750 dark:bg-purple-950/20 dark:border-purple-900/30 dark:text-purple-300'
                        : firma.type === 'Revendedor'
                        ? 'bg-blue-50 border-blue-200 text-blue-750 dark:bg-blue-950/20 dark:border-blue-900/30 dark:text-blue-300'
                        : 'bg-zinc-50 border-zinc-200 text-zinc-600 dark:bg-zinc-800/40 dark:border-zinc-700 dark:text-zinc-300'
                    )}>
                      {firma.type || 'Sem Tipo'}
                    </span>
                  ) : groupDimension === 'district' ? (
                    <span className="px-1.5 py-0.5 bg-teal-50 border border-teal-200 text-teal-700 dark:bg-teal-950/20 dark:border-teal-900/30 dark:text-teal-300 text-[8px] rounded uppercase font-black tracking-wider shrink-0 truncate max-w-[80px]">
                      {firma.district || 'Sem Dist.'}
                    </span>
                  ) : (
                    <span className={cn(
                      'px-1.5 py-0.5 text-[8px] rounded uppercase font-black tracking-wider border flex items-center gap-0.5 shrink-0',
                      firma.risk === 'critical'
                        ? 'bg-red-50 border-red-200 text-red-750 dark:bg-red-950/20 dark:border-red-900/30 dark:text-red-300'
                        : firma.risk === 'medium'
                        ? 'bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/20 dark:border-amber-900/30 dark:text-amber-305'
                        : firma.risk === 'normal'
                        ? 'bg-emerald-50 border-emerald-250 text-emerald-750 dark:bg-emerald-950/20 dark:border-emerald-900/30 dark:text-emerald-300'
                        : 'bg-slate-50 border-slate-200 text-slate-500 dark:bg-slate-850 dark:border-slate-750'
                    )}>
                      {firma.risk === 'critical' && <ShieldAlert className="w-2.5 h-2.5 text-red-550" />}
                      {firma.risk === 'medium' && <AlertCircle className="w-2.5 h-2.5 text-amber-550" />}
                      {firma.risk === 'normal' && <ShieldCheck className="w-2.5 h-2.5 text-emerald-550" />}
                      {firma.risk === 'none' && <HelpCircle className="w-2.5 h-2.5 text-slate-400" />}
                      {firma.risk === 'critical' ? 'Crítico' : firma.risk === 'medium' ? 'Médio' : firma.risk === 'normal' ? 'Normal' : 'Sem Insp.'}
                    </span>
                  )}
                </div>

                <div>
                  <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100 leading-tight line-clamp-2 min-h-[2.5rem]">{firma.name}</h3>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 font-mono mt-1">NIF: {firma.nif}</p>
                </div>

                <div className="flex flex-wrap items-center justify-between mt-auto pt-2 border-t border-slate-100 dark:border-slate-800/60 gap-1.5">
                  <div className="flex items-center gap-1 text-[9px] font-extrabold text-slate-650 dark:text-slate-350 bg-slate-50/50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 px-2 py-0.5 rounded-full shrink-0">
                    <Activity className="w-2.5 h-2.5 text-slate-400" />
                    <span>{firma.numVisitas} VIS.</span>
                  </div>

                  {firma.numInfracoes! > 0 ? (
                    <div className="flex items-center gap-1 text-[9px] font-extrabold text-red-650 dark:text-red-400 bg-red-50/30 dark:bg-red-950/10 border border-red-100 dark:border-red-955/30 px-2 py-0.5 rounded-full shrink-0">
                      <ShieldAlert className="w-2.5 h-2.5 text-red-550" />
                      <span>{firma.numInfracoes} INFR.</span>
                    </div>
                  ) : (
                    <span className="text-[9px] font-bold text-slate-450 dark:text-slate-500 px-2 uppercase tracking-wide">Limpo</span>
                  )}
                </div>
              </Link>
            );
          })
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

      {/* Popover / Modal de Seleção de Agrupamento */}
      {showGroupModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-sm w-full p-5 border border-slate-200 dark:border-slate-805 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-extrabold text-xs text-slate-900 dark:text-slate-100 uppercase tracking-wider">Agrupar-se por...</h3>
              <button 
                onClick={() => setShowGroupModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="grid grid-cols-1 gap-2.5">
              {/* Opção Risco */}
              <button
                onClick={() => {
                  handleDimensionChange('risk');
                  setShowGroupModal(false);
                }}
                className={cn(
                  "flex items-start gap-3 p-3 rounded-xl border text-left transition-all cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-850",
                  groupDimension === 'risk'
                    ? "border-indigo-600 bg-indigo-50/30 dark:border-indigo-500 dark:bg-indigo-950/20"
                    : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                )}
              >
                <div className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                  groupDimension === 'risk' ? "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/50" : "bg-slate-100 text-slate-500 dark:bg-slate-800"
                )}>
                  <ShieldAlert className="w-4 h-4" />
                </div>
                <div>
                  <p className="font-bold text-xs text-slate-800 dark:text-slate-200">Nível de Risco (Risco)</p>
                  <p className="text-[9px] text-slate-450 dark:text-slate-400 mt-0.5 leading-normal">Agrupa as firmas de acordo com a gravidade das infrações e conformidades históricas.</p>
                </div>
              </button>

              {/* Opção Tipo */}
              <button
                onClick={() => {
                  handleDimensionChange('type');
                  setShowGroupModal(false);
                }}
                className={cn(
                  "flex items-start gap-3 p-3 rounded-xl border text-left transition-all cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-850",
                  groupDimension === 'type'
                    ? "border-indigo-600 bg-indigo-50/30 dark:border-indigo-500 dark:bg-indigo-950/20"
                    : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                )}
              >
                <div className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                  groupDimension === 'type' ? "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/50" : "bg-slate-100 text-slate-500 dark:bg-slate-800"
                )}>
                  <Building className="w-4 h-4" />
                </div>
                <div>
                  <p className="font-bold text-xs text-slate-800 dark:text-slate-200">Tipo de Atividade</p>
                  <p className="text-[9px] text-slate-450 dark:text-slate-400 mt-0.5 leading-normal">Separa os operadores entre Importador, Revendedor, Informal e outras categorias registadas.</p>
                </div>
              </button>

              {/* Opção Distrito */}
              <button
                onClick={() => {
                  handleDimensionChange('district');
                  setShowGroupModal(false);
                }}
                className={cn(
                  "flex items-start gap-3 p-3 rounded-xl border text-left transition-all cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-850",
                  groupDimension === 'district'
                    ? "border-indigo-600 bg-indigo-50/30 dark:border-indigo-500 dark:bg-indigo-950/20"
                    : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"
                )}
              >
                <div className={cn(
                  "w-8 h-8 rounded-lg flex items-center justify-center shrink-0",
                  groupDimension === 'district' ? "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/50" : "bg-slate-100 text-slate-500 dark:bg-slate-800"
                )}>
                  <MapPin className="w-4 h-4" />
                </div>
                <div>
                  <p className="font-bold text-xs text-slate-800 dark:text-slate-200">Localização por Distrito</p>
                  <p className="text-[9px] text-slate-450 dark:text-slate-400 mt-0.5 leading-normal">Mapeia firmas com base nas províncias e distritos administrativos oficiais de atuação.</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
