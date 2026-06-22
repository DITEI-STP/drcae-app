/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import FirmasList from './pages/FirmasList';
import FirmaDetail from './pages/FirmaDetail';
import NovaFirma from './pages/NovaFirma';
import VisitasList from './pages/VisitasList';
import NovaVisita from './pages/NovaVisita';
import VisitaDetail from './pages/VisitaDetail';
import Mapa from './pages/Mapa';
import Equipe from './pages/Equipe';
import { db, generateId } from './db/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { Settings, RefreshCw, HardDrive, LogOut, ShieldCheck, DownloadCloud, UploadCloud, Cpu, Layers, Disc } from 'lucide-react';

function SettingsPage({ onLogout }: { onLogout: () => void }) {
  const [selectedProfile, setSelectedProfile] = useState<'economy' | 'standard' | 'maximum'>('standard');
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');

  const [cacheOperatorCondition, setCacheOperatorCondition] = useState(() => {
     return localStorage.getItem('drcae_cache_operator_cond') || 'todos';
  });
  const [cacheTimeLimit, setCacheTimeLimit] = useState(() => {
     return localStorage.getItem('drcae_cache_time_limit') || '6_meses';
  });
  const [cacheSyncLevel, setCacheSyncLevel] = useState(() => {
     return parseInt(localStorage.getItem('drcae_cache_sync_level') || '85', 10);
  });

  const updateOperatorCondition = (val: string) => {
     setCacheOperatorCondition(val);
     localStorage.setItem('drcae_cache_operator_cond', val);
  };

  const updateTimeLimit = (val: string) => {
     setCacheTimeLimit(val);
     localStorage.setItem('drcae_cache_time_limit', val);
  };

  const updateSyncLevel = (val: number) => {
     setCacheSyncLevel(val);
     localStorage.setItem('drcae_cache_sync_level', val.toString());
  };

  const stats = useLiveQuery(async () => {
    const firmas = await db.firmas.toArray();
    const visitas = await db.visitas.toArray();
    const infracoes = await db.infracoes.toArray();
    const anexos = await db.anexos.toArray();
    const queue = await db.syncQueue.toArray();

    const totalFirmas = firmas.length;
    const unsyncedFirmas = firmas.filter(f => !f.synced).length;
    const syncedFirmas = totalFirmas - unsyncedFirmas;

    const totalVisitas = visitas.length;
    const unsyncedVisitas = visitas.filter(v => !v.synced).length;
    const syncedVisitas = totalVisitas - unsyncedVisitas;

    const totalInfracoes = infracoes.length;
    const unsyncedInfracoes = infracoes.filter(i => !i.synced).length;
    const syncedInfracoes = totalInfracoes - unsyncedInfracoes;

    const totalAnexos = anexos.length;
    const unsyncedAnexos = anexos.filter(a => !a.synced).length;
    const syncedAnexos = totalAnexos - unsyncedAnexos;

    // Calculate bytes of stored data as stringified JSON
    const payloadString = JSON.stringify({ firmas, visitas, infracoes, anexos, queue });
    const bytes = new Blob([payloadString]).size;

    return {
      totalFirmas,
      unsyncedFirmas,
      syncedFirmas,
      totalVisitas,
      unsyncedVisitas,
      syncedVisitas,
      totalInfracoes,
      unsyncedInfracoes,
      syncedInfracoes,
      totalAnexos,
      unsyncedAnexos,
      syncedAnexos,
      queueLength: queue.length,
      bytes
    };
  }, []);

  const formatBytes = (bytes: number) => {
    if (bytes === undefined || bytes === null || bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleClearPinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pinInput === '1234') {
      setPinError('');
      setShowPinModal(false);
      setPinInput('');
      await actuallyClearData();
    } else {
      setPinError('PIN de confirmação incorreto! Tente o código padrão: 1234');
    }
  };

  const clearData = async () => {
    if (!stats) return;
    const { syncedFirmas, syncedVisitas, syncedInfracoes, syncedAnexos } = stats;
    const totalToClear = syncedFirmas + syncedVisitas + syncedInfracoes + syncedAnexos;

    if (totalToClear === 0) {
      alert('Não existem dados sincronizados em cache para limpar. Todos os seus dados locais são novos/não submetidos e foram preservados com segurança.');
      return;
    }

    // Trigger Pinot Modal instead of standard prompt
    setShowPinModal(true);
    setPinInput('');
    setPinError('');
  };

  const actuallyClearData = async () => {
    if (!stats) return;
    const { syncedFirmas, syncedVisitas, syncedInfracoes, syncedAnexos } = stats;
    try {
      const syncedFirmList = await db.firmas.filter(f => f.synced === true).toArray();
      await db.firmas.bulkDelete(syncedFirmList.map(f => f.id!));

      const syncedVisList = await db.visitas.filter(v => v.synced === true).toArray();
      await db.visitas.bulkDelete(syncedVisList.map(v => v.id!));

      const syncedInfList = await db.infracoes.filter(i => i.synced === true).toArray();
      await db.infracoes.bulkDelete(syncedInfList.map(i => i.id!));

      const syncedAnxList = await db.anexos.filter(a => a.synced === true).toArray();
      await db.anexos.bulkDelete(syncedAnxList.map(a => a.id!));

      alert('A cache de dados sincronizados foi limpa com sucesso. Os dados offline não submetidos foram preservados!');
    } catch (e) {
      console.error(e);
      alert('Ocorreu um erro ao limpar o cache.');
    }
  };

  const exportData = async () => {
    const firmas = await db.firmas.toArray();
    const visitas = await db.visitas.toArray();
    const infracoes = await db.infracoes.toArray();
    const data = { firmas, visitas, infracoes };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `asae-backup-${new Date().toISOString().split('T')[0]}.pen`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importData = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const data = JSON.parse(event.target?.result as string);
          if (data.firmas) await db.firmas.bulkPut(data.firmas);
          if (data.visitas) await db.visitas.bulkPut(data.visitas);
          if (data.infracoes) await db.infracoes.bulkPut(data.infracoes);
          alert('Pacote de atualização carregado com sucesso!');
        } catch (error) {
          alert('Erro ao importar dados. Verifique se o ficheiro é válido.');
        }
      };
      reader.readAsText(file);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6 max-w-4xl mx-auto w-full">

      {/* CARD DE CONFIGURAÇÃO DE PERFIS DE CACHE */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-slate-50/50 p-4 border-b border-slate-200 flex items-center gap-2">
          <Layers className="w-5 h-5 text-indigo-600" />
          <h3 className="font-bold text-slate-800 text-sm">Configuração de Perfis de Cache & Sincronização</h3>
        </div>
        
        <div className="p-5 space-y-6">
          <p className="text-xs text-slate-500 leading-relaxed font-semibold">
            Defina o perfil de persistência offline para determinar as regras automáticas de retenção de dados e nível de detalhe local na sua cache.
          </p>

          {/* Perfis Selecionáveis */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {/* Economico */}
            <div 
              onClick={() => setSelectedProfile('economy')}
              className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                selectedProfile === 'economy' 
                  ? 'border-indigo-600 bg-indigo-50/40 shadow-xs ring-2 ring-indigo-500/20' 
                  : 'border-slate-200 bg-white hover:bg-slate-50'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-xs uppercase tracking-wider text-amber-700">Mínimo / Económico</span>
                  <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${selectedProfile === 'economy' ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-300'}`}>
                    {selectedProfile === 'economy' && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                  </div>
                </div>
                <p className="text-xs text-slate-600 font-semibold leading-relaxed">Focado na poupança de recursos de armazenamento e dados em rede.</p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400">Taxa de Cache</span>
                <span className="text-xs font-black text-amber-700">~35% (Leve)</span>
              </div>
            </div>

            {/* Standard */}
            <div 
              onClick={() => setSelectedProfile('standard')}
              className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                selectedProfile === 'standard' 
                  ? 'border-indigo-600 bg-indigo-50/40 shadow-xs ring-2 ring-indigo-500/20' 
                  : 'border-slate-200 bg-white hover:bg-slate-50'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-xs uppercase tracking-wider text-indigo-800">Padrão / Recomendado</span>
                  <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${selectedProfile === 'standard' ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-300'}`}>
                    {selectedProfile === 'standard' && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                  </div>
                </div>
                <p className="text-xs text-slate-600 font-semibold leading-relaxed">Equilíbrio recomendado para fiscalizações no terreno sem qualquer atrito.</p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400">Taxa de Cache</span>
                <span className="text-xs font-black text-indigo-800">~70% (Equilibrado)</span>
              </div>
            </div>

            {/* Maximum */}
            <div 
              onClick={() => setSelectedProfile('maximum')}
              className={`p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                selectedProfile === 'maximum' 
                  ? 'border-indigo-600 bg-indigo-50/40 shadow-xs ring-2 ring-indigo-500/20' 
                  : 'border-slate-200 bg-white hover:bg-slate-50'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold text-xs uppercase tracking-wider text-emerald-800">Offline Total / Máximo</span>
                  <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 ${selectedProfile === 'maximum' ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-300'}`}>
                    {selectedProfile === 'maximum' && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
                  </div>
                </div>
                <p className="text-xs text-slate-600 font-semibold leading-relaxed">Adequado para áreas remotas com impossibilidade de conexão temporária.</p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400">Taxa de Cache</span>
                <span className="text-xs font-black text-emerald-800">100% (Histórico Total)</span>
              </div>
            </div>
          </div>

          {/* Gráfico do nível de dados cacheado */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-3 font-sans">
            <div className="flex justify-between items-center text-xs">
              <span className="font-bold text-slate-700">Nível do Volume de Cache Ativo:</span>
              <span className="font-black text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-md">
                {selectedProfile === 'economy' ? '35% (Compacto)' : selectedProfile === 'standard' ? '70% (Recomendado)' : '100% (Total Histórico)'}
              </span>
            </div>
            {/* Barra de Progresso */}
            <div className="w-full bg-slate-200/70 h-2.5 rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all duration-500 rounded-full ${
                  selectedProfile === 'economy' ? 'bg-amber-500 w-[35%]' : selectedProfile === 'standard' ? 'bg-indigo-600 w-[70%]' : 'bg-emerald-600 w-full'
                }`}
              />
            </div>

            {/* Configurações aplicadas reflexivas */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-[11px] text-slate-600 font-semibold border-t border-slate-200/50">
              <div className="space-y-1">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Lista de Operadores</span>
                <p className="text-indigo-950 font-bold bg-white px-2.5 py-1.5 rounded-lg border border-slate-100 shadow-3xs">
                  • 100% Completa (Sempre total)
                </p>
              </div>
              <div className="space-y-1">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Condições de Operadores</span>
                <p className="text-slate-800 bg-white px-2.5 py-1.5 rounded-lg border border-slate-100">
                  • {selectedProfile === 'economy' ? 'Apenas ativos / com alertas' : selectedProfile === 'standard' ? 'Ativos, registados nos últimos 2 anos' : 'Todas as entidades registadas'}
                </p>
              </div>
              <div className="space-y-1">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Histórico de Visitas Retidas</span>
                <p className="text-slate-800 bg-white px-2.5 py-1.5 rounded-lg border border-slate-100">
                  • {selectedProfile === 'economy' ? 'Até 15 dias atrás' : selectedProfile === 'standard' ? 'Até 60 dias atrás' : 'Histórico Completo'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* storage details card */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-slate-50/50 p-4 border-b border-slate-200 flex items-center gap-2">
          <Disc className="w-5 h-5 text-indigo-600" />
          <h3 className="font-bold text-slate-800 text-sm">Estado do Armazenamento e Cache</h3>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center p-4 bg-slate-50 rounded-xl border border-slate-100 gap-4">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-0.5">Ocupação em Disco (Estimativa de Dados)</span>
              <span className="text-2xl font-black text-slate-900">{stats ? formatBytes(stats.bytes) : 'A calcular...'}</span>
            </div>
            <div className="flex gap-4">
              <div className="text-center bg-emerald-50 px-3 py-2 rounded-xl border border-emerald-100 min-w-[100px]">
                <span className="text-[9px] font-bold text-emerald-800 uppercase tracking-wider block">Sincronizados (Cache)</span>
                <span className="text-base font-extrabold text-emerald-950">
                  {stats ? (stats.syncedFirmas + stats.syncedVisitas + stats.syncedInfracoes + stats.syncedAnexos) : 0}
                </span>
              </div>
              <div className="text-center bg-orange-50 px-3 py-2 rounded-xl border border-orange-100 min-w-[100px]">
                <span className="text-[9px] font-bold text-orange-800 uppercase tracking-wider block">Novos (Por Submeter)</span>
                <span className="text-base font-extrabold text-orange-950">
                  {stats ? (stats.unsyncedFirmas + stats.unsyncedVisitas + stats.unsyncedInfracoes + stats.unsyncedAnexos) : 0}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 flex flex-col justify-between">
              <div>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Operadores</span>
                <span className="text-lg font-black text-slate-800">{stats?.totalFirmas || 0}</span>
              </div>
              <div className="flex justify-between text-[10px] text-slate-500 font-bold border-t border-slate-100 mt-2 pt-1.5">
                <span className="text-emerald-600">Sinc: {stats?.syncedFirmas || 0}</span>
                <span className="text-orange-600">Novos: {stats?.unsyncedFirmas || 0}</span>
              </div>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-slate-200 flex flex-col justify-between">
              <div>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Fiscalizações</span>
                <span className="text-lg font-black text-slate-800">{stats?.totalVisitas || 0}</span>
              </div>
              <div className="flex justify-between text-[10px] text-slate-500 font-bold border-t border-slate-100 mt-2 pt-1.5">
                <span className="text-emerald-600">Sinc: {stats?.syncedVisitas || 0}</span>
                <span className="text-orange-600">Novas: {stats?.unsyncedVisitas || 0}</span>
              </div>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-slate-200 flex flex-col justify-between">
              <div>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Infrações</span>
                <span className="text-lg font-black text-slate-800">{stats?.totalInfracoes || 0}</span>
              </div>
              <div className="flex justify-between text-[10px] text-slate-500 font-bold border-t border-slate-100 mt-2 pt-1.5">
                <span className="text-emerald-600">Sinc: {stats?.syncedInfracoes || 0}</span>
                <span className="text-orange-600">Novas: {stats?.unsyncedInfracoes || 0}</span>
              </div>
            </div>

            <div className="bg-white p-3.5 rounded-xl border border-slate-200 flex flex-col justify-between">
              <div>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Anexos / Imagens</span>
                <span className="text-lg font-black text-slate-800">{stats?.totalAnexos || 0}</span>
              </div>
              <div className="flex justify-between text-[10px] text-slate-500 font-bold border-t border-slate-100 mt-2 pt-1.5">
                <span className="text-emerald-600">Sinc: {stats?.syncedAnexos || 0}</span>
                <span className="text-orange-600">Novas: {stats?.unsyncedAnexos || 0}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* DRCAE ADVANCED CACHE DEPTH CONTROLS */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden font-sans space-y-4">
         <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <div className="flex items-center gap-3 text-slate-700">
               <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600">
                  <Layers className="w-5 h-5" />
               </div>
               <div>
                  <h3 className="font-bold text-slate-900 text-sm">Controle de Profundidade de Cache</h3>
                  <p className="text-xs text-slate-500">Defina regras de pré-carregamento e retenção de dados offline</p>
               </div>
            </div>
            <span className="text-[10px] font-mono font-black uppercase bg-indigo-100 text-indigo-800 px-2.5 py-1 rounded-md">Configuração Local</span>
         </div>

         <div className="p-5 space-y-5">
            {/* Sync level indicators */}
            <div className="space-y-2">
               <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-slate-600 uppercase tracking-widest text-[9px]">Cota de Sincronismo (Dados Armazenados vs. Total Geral)</span>
                  <span className="font-mono font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded text-xs">{cacheSyncLevel}% Sincronizado</span>
               </div>
               <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-600 rounded-full transition-all duration-300" style={{ width: `${cacheSyncLevel}%` }} />
               </div>
               <div className="flex items-center">
                  <input 
                     type="range" 
                     min="30" 
                     max="100" 
                     value={cacheSyncLevel} 
                     onChange={(e) => updateSyncLevel(parseInt(e.target.value, 10))}
                     className="w-full accent-indigo-600 h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer"
                  />
               </div>
               <p className="text-[10px] text-slate-400 font-medium leading-normal">
                  Arraste o slider para ajustar a cota de dados offline no dispositivo. Níveis superiores mantêm mais detalhes em memória para pesquisa offline rigorosa.
               </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-slate-100">
               {/* Operator conditions setting dropdown */}
               <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-0.5">Condição dos Operadores para Cachear Detalhes</label>
                  <select
                     value={cacheOperatorCondition}
                     onChange={(e) => updateOperatorCondition(e.target.value)}
                     className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs text-slate-700 focus:bg-white focus:ring-2 focus:ring-indigo-500 transition-all cursor-pointer"
                  >
                     <option value="todos">Todos os operadores cadastrados</option>
                     <option value="ativos">Apenas operadores com atividade ativa recente</option>
                     <option value="alto_risco">Apenas operadores com risco de infração elevado</option>
                     <option value="vistorias_pendentes">Apenas com vistorias preventivas pendentes</option>
                  </select>
                  <p className="text-[9px] text-slate-400 font-medium leading-tight">
                     Define quais metadados das firmas serão transferidos para o dispositivo para busca rápida em modo offline.
                  </p>
               </div>

               {/* Time frame setting selection */}
               <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-0.5">Janela Retrospectiva do Histórico em Cache</label>
                  <select
                     value={cacheTimeLimit}
                     onChange={(e) => updateTimeLimit(e.target.value)}
                     className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl font-bold text-xs text-slate-700 focus:bg-white focus:ring-2 focus:ring-indigo-500 transition-all cursor-pointer"
                  >
                     <option value="30_dias">Vistorias efetuadas nos últimos 30 dias</option>
                     <option value="6_meses">Vistorias efetuadas nos últimos 6 meses (Recomendado)</option>
                     <option value="1_ano">Vistorias efetuadas no último 1 ano</option>
                     <option value="todo">Sincronizar histórico completo (Sem limite temporal)</option>
                  </select>
                  <p className="text-[9px] text-slate-400 font-medium leading-tight">
                     Filtro temporal de ações retroativas descarregadas e mantidas em cache no telemóvel para consulta técnica rápida.
                  </p>
               </div>
            </div>
         </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
         <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-3 text-gray-700">
               <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600">
                  <RefreshCw className="w-5 h-5" />
               </div>
               <div>
                  <h3 className="font-bold text-gray-900">Sincronização</h3>
                  <p className="text-xs text-gray-500">Agendada em segundo plano</p>
               </div>
            </div>
            <span className="bg-green-100 text-green-700 text-xs font-bold px-2.5 py-1 rounded-md">Ativo</span>
         </div>
         
         <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-3 text-gray-700">
               <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600">
                  <DownloadCloud className="w-5 h-5" />
               </div>
               <div>
                  <h3 className="font-bold text-gray-900">Exportar Alterações</h3>
                  <p className="text-xs text-gray-500">Gerar ficheiro de backup (PEN)</p>
               </div>
            </div>
            <button onClick={exportData} className="text-sm font-bold text-indigo-600 hover:bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-200">
               Exportar
            </button>
         </div>

         <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-3 text-gray-700">
               <div className="w-10 h-10 bg-teal-100 rounded-full flex items-center justify-center text-teal-600">
                  <UploadCloud className="w-5 h-5" />
               </div>
               <div>
                  <h3 className="font-bold text-gray-900">Carregar Atualizações</h3>
                  <p className="text-xs text-gray-500">Importar ficheiro offline (.pen, .json)</p>
               </div>
            </div>
            <label className="text-sm font-bold text-teal-600 hover:bg-teal-50 px-3 py-1.5 rounded-lg border border-teal-200 cursor-pointer">
               Carregar
               <input type="file" accept=".pen,.json" onChange={importData} className="hidden" />
            </label>
         </div>

         <div className="p-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-3 text-gray-700">
               <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center text-orange-600">
                  <HardDrive className="w-5 h-5" />
               </div>
               <div>
                  <h3 className="font-bold text-gray-900">Limpar Cache</h3>
                  <p className="text-xs text-gray-400">Remove apenas registos já submetidos salvos no servidor</p>
               </div>
            </div>
             {/* PIN CONFIRMATION MODAL FOR CLEAR CACHE */}
             {showPinModal && (
               <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 font-sans animate-in fade-in duration-200">
                 <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-sm w-full overflow-hidden p-6 space-y-4 animate-in zoom-in-95 duration-200">
                   <div className="flex flex-col items-center text-center space-y-2">
                     <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mb-1">
                       <ShieldCheck className="w-6 h-6" />
                     </div>
                     <h3 className="font-bold text-lg text-slate-900">Confirmação de Segurança</h3>
                     <p className="text-xs text-slate-500 leading-relaxed font-semibold">
                       A limpeza de cache elimina os dados locais já submetidos. Introduza o seu **PIN de Inspetor** para prosseguir.
                     </p>
                   </div>

                   <form onSubmit={handleClearPinSubmit} className="space-y-4">
                     <div className="space-y-1">
                       <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block pl-1">Código PIN do Inspetor (Padrão: 1234)</label>
                       <input
                         type="password"
                         placeholder="••••"
                         maxLength={4}
                         value={pinInput}
                         onChange={e => {
                           setPinInput(e.target.value.replace(/\D/g, ''));
                           setPinError('');
                         }}
                         className="w-full text-center tracking-widest text-lg font-black bg-slate-50 border border-slate-200 focus:bg-white focus:ring-2 focus:ring-indigo-500 rounded-xl p-3 text-slate-800"
                         autoFocus
                       />
                       {pinError && (
                         <p className="text-[11px] font-semibold text-red-500 leading-tight pl-1 pt-1">
                           {pinError}
                         </p>
                       )}
                     </div>

                     <div className="flex gap-2 pt-2">
                       <button
                         type="button"
                         onClick={() => setShowPinModal(false)}
                         className="flex-1 py-3 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                       >
                         Cancelar
                       </button>
                       <button
                         type="submit"
                         disabled={pinInput.length < 4}
                         className="flex-1 py-3 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:bg-slate-400 rounded-xl transition-colors shadow-sm"
                       >
                         Confirmar PIN
                       </button>
                     </div>
                   </form>
                 </div>
               </div>
             )}

            <button onClick={clearData} className="text-sm font-bold text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg border border-red-200 shadow-sm transition-colors">
               Limpar Cache
            </button>
         </div>

         <div className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3 text-gray-700">
               <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center text-gray-600">
                  <LogOut className="w-5 h-5" />
               </div>
               <div>
                  <h3 className="font-bold text-gray-900">Sessão</h3>
                  <p className="text-xs text-gray-500">Agente Carvalho</p>
               </div>
            </div>
            <button onClick={onLogout} className="text-sm font-bold text-gray-600 hover:bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-200">
               Sair
            </button>
         </div>
      </div>
    </div>
  );
}

function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [nif, setNif] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (nif && password) {
      onLogin();
    }
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-[#F5F7FA] p-4">
      <div className="w-full max-w-sm bg-white p-8 rounded-3xl shadow-xl shadow-blue-900/5">
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-600/30">
            <ShieldCheck className="w-8 h-8 text-white" />
          </div>
        </div>
        <h1 className="text-2xl font-black text-center text-slate-900 mb-2">Entrar</h1>
        <p className="text-sm text-center text-slate-500 mb-8 font-medium">Faça login para aceder à plataforma.</p>
        
        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">NIF do Agente</label>
            <input 
              type="text" 
              required
              value={nif}
              onChange={(e) => setNif(e.target.value)}
              className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 text-sm font-medium transition-all"
              placeholder="Ex: 123456789"
            />
          </div>
          <div className="space-y-1.5 mb-6">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">Palavra-passe</label>
            <input 
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 text-sm font-medium transition-all"
              placeholder="••••••••"
            />
          </div>
          <button 
            type="submit"
            className="w-full py-3.5 bg-blue-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 transition-colors uppercase tracking-wide mt-4"
          >
            Iniciar Sessão
          </button>
        </form>
      </div>
    </div>
  );
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return localStorage.getItem('isAuthenticated') === 'true';
  });

  const handleLogin = () => {
    localStorage.setItem('isAuthenticated', 'true');
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    localStorage.removeItem('isAuthenticated');
    setIsAuthenticated(false);
  };

  useEffect(() => {
    const seedData = async () => {
      const count = await db.firmas.count();
      if (count === 0) {
        console.log("Seeding database...");
        
        const firma1Id = generateId();
        const firma2Id = generateId();
        const firma3Id = generateId();
        const firma4Id = generateId();

        await db.firmas.bulkAdd([
          { 
            id: firma1Id, 
            nif: '517562696', 
            name: '(CAFÉ PARK) CENTRO DE ANIMAÇÃO, LDA', 
            district: 'Água Grande', 
            address: 'Parque Popular', 
            contact: '2225822', 
            email: 'cafeparklda@gmail.com', 
            type: 'Importador', 
            representant: 'Miguel Oliveira', 
            representantCargo: 'Gerente',
            synced: true,
            constituicao: 'Sociedade por Quotas',
            emissoraLicenca: 'Câmara Municipal',
            numLicenca: '123/2019',
            numAlvara: '456/2019',
            atividades: [
              { id: generateId(), ramo: 'Restauração', atividade: 'Café', local: 'Parque Popular' }
            ]
          },
          { 
            id: firma2Id, 
            nif: '839210344', 
            name: 'SANTOS ENI 930', 
            district: 'Cantagalo', 
            address: 'Santana', 
            contact: '+239 987654321', 
            email: 'contato@santos.st', 
            type: 'Revendedor', 
            representant: 'João Santos', 
            synced: true,
            atividades: [
              { id: generateId(), ramo: 'Comércio Misto', atividade: 'Retalho', local: 'Santana' }
            ]
          },
          { 
            id: firma3Id, 
            nif: '109000001', 
            name: '2 P F, LIMITADA', 
            district: 'Água Grande', 
            address: 'Centro', 
            contact: '', 
            email: '', 
            type: 'Revendedor', 
            representant: 'Pedro Fernandes', 
            synced: true 
          },
          { 
            id: firma4Id, 
            nif: 'SEM NIF', 
            name: 'MERCADO MUNICIPAL BACA', 
            district: 'Mé-Zóchi', 
            address: 'Trindade', 
            contact: '', 
            email: '', 
            type: 'Informal', 
            representant: 'Maria Silva', 
            synced: true 
          }
        ]);

        const visita1Id = generateId();
        const visita2Id = generateId();
        const visita3Id = generateId();

        await db.visitas.bulkAdd([
          {
            id: visita1Id,
            firmaId: firma1Id,
            firmaName: '(CAFÉ PARK) CENTRO DE ANIMAÇÃO, LDA',
            date: '2023-10-12',
            time: '14:30',
            technicians: ['Agente Carvalho', 'Agente Silva'],
            status: 'Infrações',
            atividadeEconomica: 'Café',
            synced: true,
            notes: 'Encontradas várias irregularidades sanitárias na cozinha e armazenamento de produtos.',
            geolocation: { lat: 0.3392, lng: 6.7314 }
          },
          {
            id: visita2Id,
            firmaId: firma2Id,
            firmaName: 'SANTOS ENI 930',
            date: '2024-01-04',
            time: '10:15',
            technicians: ['Agente Carvalho'],
            status: 'Conforme',
            synced: true,
            notes: 'Estabelecimento em perfeitas condições de higiene. Licenciamento regularizado.'
          },
          {
            id: visita3Id,
            firmaId: firma1Id,
            firmaName: '(CAFÉ PARK) CENTRO DE ANIMAÇÃO, LDA',
            date: '2024-03-20',
            time: '09:00',
            technicians: ['Agente Martins'],
            status: 'Infrações',
            synced: true,
            notes: 'Reincidência em algumas infrações. Produtos fora de prazo.'
          }
        ]);

        await db.infracoes.bulkAdd([
          { id: generateId(), visitaId: visita1Id, type: 'Higiene e Segurança Alimentar', severity: 'Alta', synced: true },
          { id: generateId(), visitaId: visita1Id, type: 'Ausência de Tabela de Preços', severity: 'Baixa', synced: true },
          { id: generateId(), visitaId: visita3Id, type: 'Higiene e Segurança Alimentar', severity: 'Alta', synced: true },
          { id: generateId(), visitaId: visita3Id, type: 'Produtos Fora de Prazo', severity: 'Crítica', synced: true }
        ]);
      }
    };
    seedData();
  }, []);

  if (!isAuthenticated) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          
          <Route path="firmas">
            <Route index element={<FirmasList />} />
            <Route path="nova" element={<NovaFirma />} />
            <Route path=":id" element={<FirmaDetail />} />
          </Route>
          
          <Route path="visitas">
            <Route index element={<VisitasList />} />
            <Route path="nova" element={<NovaVisita />} />
            <Route path=":id" element={<VisitaDetail />} />
          </Route>

          <Route path="equipe" element={<Equipe />} />

          <Route path="mapa" element={<Mapa />} />

          <Route path="settings" element={<SettingsPage onLogout={handleLogout} />} />
          
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
