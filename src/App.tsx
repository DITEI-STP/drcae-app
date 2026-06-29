/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState, useRef } from 'react';
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
import Central from './pages/Central';
import Equipe from './pages/Equipe';
import PendentesPage from './pages/PendentesPage';
import SetupPage from './pages/SetupPage';
import { db } from './db/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { Settings, RefreshCw, HardDrive, LogOut, ShieldCheck, DownloadCloud, UploadCloud, Cpu, Layers, Disc, Camera, QrCode, AlertCircle, Smartphone, Maximize, Minimize, ArrowUpCircle, ArrowDownCircle, CheckCircle2, XCircle, Clock, Wifi, WifiOff, Activity, Zap, Sun, Moon, Laptop } from 'lucide-react';
import * as api from './lib/api';
import * as crypto from './lib/crypto';
import { triggerFullSync } from './lib/sync';
import { useSyncState } from './lib/syncState';
export { useSyncState };
import NotificationContainer from './components/NotificationContainer';
import { toast, customAlert } from './lib/notifications';
import { useTheme } from './hooks/useTheme';
import { cn } from './lib/utils';
import PairingScreen from './screens/PairingScreen';
import {
  checkSessionValid,
  getPairingCredentials,
  clearPairingCredentials,
} from './lib/pairing';
import { WEBVIEW_APK_DOWNLOAD_URL } from './lib/webviewApk';

const APP_LOGO_SRC = '/app/img/logo.png';
const APP_LOGO_LOGIN_SRC = '/app/img/logo_login.png';

function SettingsPage({ onLogout }: { onLogout: () => void }) {
  const { theme, setTheme } = useTheme();
  const [selectedProfile, setSelectedProfile] = useState<'economy' | 'standard' | 'maximum'>(() => {
    return (localStorage.getItem('drcae_server_sync_profile') as 'economy' | 'standard' | 'maximum') || 'standard';
  });
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const syncState = useSyncState();
  const [isManualSyncing, setIsManualSyncing] = useState(false);
  const [elapsedSecs, setElapsedSecs] = useState(0);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stats = useLiveQuery(async () => {
    const [
      totalFirmas, unsyncedFirmas,
      totalVisitas, unsyncedVisitas,
      totalInfracoes, unsyncedInfracoes,
      totalAnexos, unsyncedAnexos
    ] = await Promise.all([
      db.firmas.count(),
      db.firmas.filter(x => !x.synced).count(),
      db.visitas.count(),
      db.visitas.filter(x => !x.synced).count(),
      db.infracoes.count(),
      db.infracoes.filter(x => !x.synced).count(),
      db.anexos.count(),
      db.anexos.filter(x => !x.synced).count(),
    ]);

    const metaLastSync = await db.metadata.get('last_sync_at');
    const lastSyncAt: string | null = metaLastSync?.value || null;

    return {
      totalFirmas, unsyncedFirmas, syncedFirmas: totalFirmas - unsyncedFirmas,
      totalVisitas, unsyncedVisitas, syncedVisitas: totalVisitas - unsyncedVisitas,
      totalInfracoes, unsyncedInfracoes, syncedInfracoes: totalInfracoes - unsyncedInfracoes,
      totalAnexos, unsyncedAnexos, syncedAnexos: totalAnexos - unsyncedAnexos,
      queueLength: 0,
      lastSyncAt,
    };
  }, []);

  const [bytesState, setBytesState] = useState<{ bytes: number; unsyncedBytes: number }>({
    bytes: 0, unsyncedBytes: 0,
  });
  const bytesDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const updateProfile = (profile?: string | null) => {
      if (profile === 'economy' || profile === 'standard' || profile === 'maximum') {
        setSelectedProfile(profile);
      }
    };

    const handleProfileUpdate = (event: Event) => {
      updateProfile((event as CustomEvent<{ profile?: string }>).detail?.profile);
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === 'drcae_server_sync_profile') {
        updateProfile(event.newValue);
      }
    };

    window.addEventListener('drcae:sync-profile-updated', handleProfileUpdate);
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener('drcae:sync-profile-updated', handleProfileUpdate);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  useEffect(() => {
    if (bytesDebounceRef.current) clearTimeout(bytesDebounceRef.current);
    bytesDebounceRef.current = setTimeout(async () => {
      const [firmas, visitas, infracoes, anexos, queue] = await Promise.all([
        db.firmas.toArray(), db.visitas.toArray(), db.infracoes.toArray(),
        db.anexos.toArray(), db.syncQueue.toArray(),
      ]);
      const bytes = new Blob([JSON.stringify({ firmas, visitas, infracoes, anexos, queue })]).size;
      const unsyncedFirmasList   = firmas.filter(f => !f.synced);
      const unsyncedVisitasList  = visitas.filter(v => !v.synced);
      const unsyncedInfracoesList = infracoes.filter(i => !i.synced);
      const unsyncedAnexosList   = anexos.filter(a => !a.synced);
      const unsyncedBytes = new Blob([JSON.stringify({
        firmas: unsyncedFirmasList, visitas: unsyncedVisitasList,
        infracoes: unsyncedInfracoesList, anexos: unsyncedAnexosList,
      })]).size;
      setBytesState({ bytes, unsyncedBytes });
    }, 5000);
    return () => { if (bytesDebounceRef.current) clearTimeout(bytesDebounceRef.current); };
  }, [stats]);

  const formatBytes = (bytes: number) => {
    if (bytes === undefined || bytes === null || bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleClearPinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nif = localStorage.getItem('drcae_officer_nif') || '';
    try {
      setPinError('A validar...');
      const saltRes = await api.getSalt();
      const testKey = await crypto.deriveKey(nif, pinInput, saltRes.salt);
      
      const prevKey = crypto.getActiveKey();
      crypto.setActiveKey(testKey);
      const isCorrect = await db.verifyOfflineKey();
      crypto.setActiveKey(prevKey);

      if (isCorrect) {
        setPinError('');
        setShowPinModal(false);
        setPinInput('');
        await actuallyClearData();
      } else {
        setPinError('Palavra-passe de confirmação incorreta!');
      }
    } catch (err) {
      setPinError('Erro ao validar palavra-passe.');
    }
  };

  const clearData = async () => {
    if (!stats) return;
    const { syncedFirmas, syncedVisitas, syncedInfracoes, syncedAnexos } = stats;
    const totalToClear = syncedFirmas + syncedVisitas + syncedInfracoes + syncedAnexos;

    if (totalToClear === 0) {
      customAlert.info('Limpeza de Cache', 'Não existem dados sincronizados em cache para limpar. Todos os seus dados locais são novos/não submetidos e foram preservados com segurança.');
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

      toast.success('A cache de dados sincronizados foi limpa com sucesso. Os dados offline não submetidos foram preservados!');
    } catch (e) {
      console.error(e);
      toast.error('Ocorreu um erro ao limpar o cache.');
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

  // ── Sync helpers ──────────────────────────────────────────────
  const formatLastSync = (isoStr: string | null | undefined): string => {
    if (!isoStr) return 'Nunca sincronizado';
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return 'Data desconhecida';
    const now = Date.now();
    const diff = now - d.getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    const timeStr = d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
    if (mins < 1) return 'há poucos segundos';
    if (mins < 60) return `há ${mins} min`;
    if (days === 0) return `hoje às ${timeStr}`;
    if (days === 1) return `ontem às ${timeStr}`;
    return `há ${days} dias`;
  };

  const estimateEta = (bytes: number, items: number): string => {
    if (items === 0) return '—';
    const secs = Math.max(1, Math.ceil(bytes / (30 * 1024)));
    if (secs < 60) return `~${secs}s`;
    return `~${Math.ceil(secs / 60)} min`;
  };

  const formatDurationMs = (ms: number | undefined): string => {
    if (!ms) return '';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const handleManualSync = async () => {
    if (isManualSyncing) return;
    setIsManualSyncing(true);
    setElapsedSecs(0);
    elapsedRef.current = setInterval(() => setElapsedSecs(s => s + 1), 1000);
    try {
      await triggerFullSync();
    } catch (_) {
      // erro já emitido para syncState
    } finally {
      if (elapsedRef.current) clearInterval(elapsedRef.current);
      elapsedRef.current = null;
      setIsManualSyncing(false);
    }
  };
  // ── fim Sync helpers ───────────────────────────────────────────

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
          toast.success('Pacote de atualização carregado com sucesso!');
        } catch (error) {
          toast.error('Erro ao importar dados. Verifique se o ficheiro é válido.');
        }
      };
      reader.readAsText(file);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6 max-w-4xl mx-auto w-full">

      {/* CARD DE PERFIL DE SINCRONIZAÇÃO (atribuído pelo admin) */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="bg-slate-50/50 dark:bg-slate-800/40 p-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
          <Layers className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm">Perfil de Sincronização</h3>
          <span className="ml-auto text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-2 py-0.5 rounded-full uppercase tracking-wider">Atribuído pelo Admin</span>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-semibold">
            O perfil de sincronização é configurado centralmente pelo administrador do sistema e aplicado automaticamente a este dispositivo.
          </p>

          {/* Perfil activo - read-only */}
          <div className={cn(
            'p-4 rounded-xl border-2 flex items-center gap-4',
            selectedProfile === 'economy'
              ? 'border-amber-400 bg-amber-50/40 dark:border-amber-500/80 dark:bg-amber-950/10'
              : selectedProfile === 'maximum'
              ? 'border-emerald-500 bg-emerald-50/40 dark:border-emerald-600/80 dark:bg-emerald-950/10'
              : 'border-indigo-500 bg-indigo-50/40 dark:border-indigo-650/80 dark:bg-indigo-950/10'
          )}>
            <div className={cn(
              'w-10 h-10 rounded-full flex items-center justify-center shrink-0',
              selectedProfile === 'economy' ? 'bg-amber-100 dark:bg-amber-950/40' : selectedProfile === 'maximum' ? 'bg-emerald-100 dark:bg-emerald-950/40' : 'bg-indigo-100 dark:bg-indigo-950/40'
            )}>
              <Layers className={cn(
                'w-5 h-5',
                selectedProfile === 'economy' ? 'text-amber-600 dark:text-amber-450' : selectedProfile === 'maximum' ? 'text-emerald-600 dark:text-emerald-450' : 'text-indigo-600 dark:text-indigo-455'
              )} />
            </div>
            <div className="flex-1">
              <p className={cn(
                'font-bold text-sm',
                selectedProfile === 'economy' ? 'text-amber-800 dark:text-amber-300' : selectedProfile === 'maximum' ? 'text-emerald-800 dark:text-emerald-300' : 'text-indigo-800 dark:text-indigo-300'
              )}>
                {selectedProfile === 'economy' ? 'Mínimo / Económico' : selectedProfile === 'maximum' ? 'Offline Total / Máximo' : 'Padrão / Recomendado'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                {selectedProfile === 'economy'
                  ? 'Poupança de dados — histórico de 15 dias'
                  : selectedProfile === 'maximum'
                  ? 'Histórico completo — acesso offline total'
                  : 'Equilíbrio recomendado — histórico de 60 dias'}
              </p>
            </div>
            <span className={cn(
              'text-xs font-black px-2.5 py-1 rounded-full',
              selectedProfile === 'economy' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : selectedProfile === 'maximum' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400'
            )}>
              {selectedProfile === 'economy' ? '~35%' : selectedProfile === 'maximum' ? '100%' : '~70%'}
            </span>
          </div>

          {/* Gráfico do nível de dados cacheado */}
          <div className="bg-slate-50 dark:bg-slate-800/20 p-4 rounded-xl border border-slate-100 dark:border-slate-800 space-y-3 font-sans">
            <div className="flex justify-between items-center text-xs">
              <span className="font-bold text-slate-700 dark:text-slate-350">Nível do Volume de Cache Ativo:</span>
              <span className="font-black text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/30 px-2 py-0.5 rounded-md">
                {selectedProfile === 'economy' ? '35% (Compacto)' : selectedProfile === 'standard' ? '70% (Recomendado)' : '100% (Total Histórico)'}
              </span>
            </div>
            {/* Barra de Progresso */}
            <div className="w-full bg-slate-200/70 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden">
              <div 
                className={cn(
                  'h-full transition-all duration-500 rounded-full',
                  selectedProfile === 'economy' ? 'bg-amber-500 w-[35%]' : selectedProfile === 'standard' ? 'bg-indigo-600 w-[70%]' : 'bg-emerald-600 w-full'
                )}
              />
            </div>

            {/* Configurações aplicadas reflexivas */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 text-[11px] text-slate-600 dark:text-slate-400 font-semibold border-t border-slate-200/50 dark:border-slate-800">
              <div className="space-y-1">
                <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">Lista de Operadores</span>
                <p className="text-indigo-950 dark:text-indigo-200 font-bold bg-white dark:bg-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-100 dark:border-slate-800 shadow-3xs">
                  • 100% Completa (Sempre total)
                </p>
              </div>
              <div className="space-y-1">
                <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">Condições de Operadores</span>
                <p className="text-slate-800 dark:text-slate-250 bg-white dark:bg-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-100 dark:border-slate-800">
                  • {selectedProfile === 'economy' ? 'Apenas ativos / com alertas' : selectedProfile === 'standard' ? 'Ativos, registados nos últimos 2 anos' : 'Todas as entidades registadas'}
                </p>
              </div>
              <div className="space-y-1">
                <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block">Histórico de Visitas Retidas</span>
                <p className="text-slate-800 dark:text-slate-250 bg-white dark:bg-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-100 dark:border-slate-800">
                  • {selectedProfile === 'economy' ? 'Até 15 dias atrás' : selectedProfile === 'standard' ? 'Até 60 dias atrás' : 'Histórico Completo'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* CARD DE APARÊNCIA / TEMA */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="bg-slate-50/50 dark:bg-slate-800/40 p-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
          <Sun className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm">Aparência</h3>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-semibold">
            Escolha o tema visual da aplicação. A opção automática adapta-se às configurações do seu dispositivo.
          </p>

          <div className="grid grid-cols-3 gap-3">
            {[
              { id: 'auto' as const, label: 'Auto', icon: Laptop, desc: 'Sistema' },
              { id: 'light' as const, label: 'Claro', icon: Sun, desc: 'Light Mode' },
              { id: 'dark' as const, label: 'Escuro', icon: Moon, desc: 'Dark Mode' },
            ].map(({ id, label, icon: Icon, desc }) => {
              const active = theme === id;
              return (
                <button
                  key={id}
                  onClick={() => {
                    setTheme(id);
                    toast.info(`Tema alterado para ${label}`);
                  }}
                  className={cn(
                    'flex flex-col items-center justify-center p-3 rounded-xl border-2 transition-all cursor-pointer text-center',
                    active
                      ? 'border-indigo-600 bg-indigo-50/40 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400'
                      : 'border-slate-200 dark:border-slate-800 bg-transparent text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-slate-700 dark:hover:text-slate-350'
                  )}
                >
                  <Icon className="w-5 h-5 mb-1.5" />
                  <span className="text-xs font-bold block">{label}</span>
                  <span className="text-[10px] opacity-70 mt-0.5">{desc}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      
      {/* storage details card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="bg-slate-50/50 dark:bg-slate-800/40 p-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
          <Disc className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm">Estado do Armazenamento e Cache</h3>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center p-4 bg-slate-50 dark:bg-slate-800/20 rounded-xl border border-slate-100 dark:border-slate-800 gap-4">
            <div>
              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-0.5">Ocupação em Disco (Estimativa de Dados)</span>
              <span className="text-2xl font-black text-slate-900 dark:text-white">{bytesState.bytes === 0 ? 'A calcular...' : formatBytes(bytesState.bytes)}</span>
            </div>
            <div className="flex gap-4">
              <div className="text-center bg-emerald-50 dark:bg-emerald-950/20 px-3 py-2 rounded-xl border border-emerald-100 dark:border-emerald-900/30 min-w-[100px]">
                <span className="text-[9px] font-bold text-emerald-800 dark:text-emerald-450 uppercase tracking-wider block">Sincronizados (Cache)</span>
                <span className="text-base font-extrabold text-emerald-950 dark:text-emerald-200">
                  {stats ? (stats.syncedFirmas + stats.syncedVisitas + stats.syncedInfracoes + stats.syncedAnexos) : 0}
                </span>
              </div>
              <div className="text-center bg-orange-50 dark:bg-orange-950/20 px-3 py-2 rounded-xl border border-orange-100 dark:border-orange-900/30 min-w-[100px]">
                <span className="text-[9px] font-bold text-orange-800 dark:text-orange-455 uppercase tracking-wider block">Novos (Por Submeter)</span>
                <span className="text-base font-extrabold text-orange-950 dark:text-orange-200">
                  {stats ? (stats.unsyncedFirmas + stats.unsyncedVisitas + stats.unsyncedInfracoes + stats.unsyncedAnexos) : 0}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
              <div>
                <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-1">Operadores</span>
                <span className="text-lg font-black text-slate-800 dark:text-slate-200">{stats?.totalFirmas || 0}</span>
              </div>
              <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-450 font-bold border-t border-slate-100 dark:border-slate-800 mt-2 pt-1.5">
                <span className="text-emerald-600 dark:text-emerald-500">Sinc: {stats?.syncedFirmas || 0}</span>
                <span className="text-orange-600 dark:text-orange-500">Novos: {stats?.unsyncedFirmas || 0}</span>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
              <div>
                <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-1">Fiscalizações</span>
                <span className="text-lg font-black text-slate-800 dark:text-slate-200">{stats?.totalVisitas || 0}</span>
              </div>
              <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-450 font-bold border-t border-slate-100 dark:border-slate-800 mt-2 pt-1.5">
                <span className="text-emerald-600 dark:text-emerald-500">Sinc: {stats?.syncedVisitas || 0}</span>
                <span className="text-orange-600 dark:text-orange-500">Novas: {stats?.unsyncedVisitas || 0}</span>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
              <div>
                <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-1">Infrações</span>
                <span className="text-lg font-black text-slate-800 dark:text-slate-200">{stats?.totalInfracoes || 0}</span>
              </div>
              <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-450 font-bold border-t border-slate-100 dark:border-slate-800 mt-2 pt-1.5">
                <span className="text-emerald-600 dark:text-emerald-500">Sinc: {stats?.syncedInfracoes || 0}</span>
                <span className="text-orange-600 dark:text-orange-500">Novas: {stats?.unsyncedInfracoes || 0}</span>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
              <div>
                <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block mb-1">Anexos / Imagens</span>
                <span className="text-lg font-black text-slate-800 dark:text-slate-200">{stats?.totalAnexos || 0}</span>
              </div>
              <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-450 font-bold border-t border-slate-100 dark:border-slate-800 mt-2 pt-1.5">
                <span className="text-emerald-600 dark:text-emerald-500">Sinc: {stats?.syncedAnexos || 0}</span>
                <span className="text-orange-600 dark:text-orange-500">Novas: {stats?.unsyncedAnexos || 0}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════
           PAINEL DE SINCRONIZAÇÃO — estado em tempo real + acções
          ═══════════════════════════════════════════════════════════════ */}
      {(() => {
        const isSyncing = syncState.phase === 'pushing' || syncState.phase === 'pulling';
        const unsyncedTotal = (stats?.unsyncedFirmas ?? 0) + (stats?.unsyncedVisitas ?? 0) +
          (stats?.unsyncedInfracoes ?? 0) + (stats?.unsyncedAnexos ?? 0);
        const unsyncedBytes = bytesState.unsyncedBytes;

        const phaseLabel =
          syncState.phase === 'pushing' ? 'A enviar dados para o servidor...' :
          syncState.phase === 'pulling' ? 'A receber actualizações...' :
          syncState.phase === 'done'    ? 'Sincronização concluída' :
          syncState.phase === 'error'   ? 'Falha na sincronização' :
          syncState.phase === 'needs-auth' ? 'Sessão inactiva — re-autenticar para sync' :
          unsyncedTotal > 0 ? `${unsyncedTotal} registo(s) por sincronizar` : 'Tudo sincronizado';

        const statusDot =
          syncState.phase === 'done'    ? 'bg-emerald-500' :
          syncState.phase === 'error'   ? 'bg-red-500' :
          syncState.phase === 'needs-auth' ? 'bg-amber-400' :
          isSyncing ? 'bg-blue-500 animate-pulse' :
          unsyncedTotal > 0 ? 'bg-orange-400' : 'bg-emerald-500';

        const pushProgress = syncState.pushTotal > 0
          ? Math.round((syncState.pushDone / syncState.pushTotal) * 100)
          : (syncState.phase === 'pushing' ? 0 : 100);

        return (
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
            {/* Cabeçalho do painel */}
            <div className="bg-gradient-to-r from-slate-800 to-slate-700 dark:from-slate-900 dark:to-slate-850 p-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center">
                  <Activity className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm">Centro de Sincronização</h3>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium mt-0.5">Monitor de dados offline ↔ servidor</p>
                </div>
              </div>
              <button
                onClick={handleManualSync}
                disabled={isSyncing || isManualSyncing}
                className={cn(
                  'flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer',
                  isSyncing || isManualSyncing
                    ? 'bg-slate-600 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
                    : 'bg-emerald-500 hover:bg-emerald-400 text-white active:scale-95'
                )}
              >
                <RefreshCw className={cn('w-3.5 h-3.5', (isSyncing || isManualSyncing) && 'animate-spin')} />
                {isSyncing || isManualSyncing ? 'A sincronizar...' : 'Sincronizar Agora'}
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Estado geral */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', statusDot)} />
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{phaseLabel}</span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500 font-medium">
                  <Clock className="w-3.5 h-3.5" />
                  {isSyncing && isManualSyncing
                    ? `${elapsedSecs}s`
                    : formatLastSync(stats?.lastSyncAt ?? syncState.lastSyncAt)}
                </div>
              </div>

              {/* ── Progresso em tempo real (só durante sync) ── */}
              {isSyncing && (
                <div className="space-y-3">
                  {/* Upload */}
                  <div className="bg-slate-50 dark:bg-slate-800/30 rounded-xl p-3.5 border border-slate-100 dark:border-slate-800">
                    <div className="flex items-center justify-between mb-2.5">
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-400">
                        <ArrowUpCircle className="w-4 h-4 text-blue-500" />
                        Upload para servidor
                      </div>
                      <span className="text-[11px] font-bold text-blue-600 dark:text-blue-400">
                        {syncState.phase === 'pushing'
                          ? syncState.pushTotal > 0 ? `${syncState.pushDone} / ${syncState.pushTotal}` : 'A preparar...'
                          : `${syncState.pushDone} enviados`}
                      </span>
                    </div>
                    <div className="w-full bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all duration-500',
                          syncState.phase === 'pushing' ? 'bg-blue-500' : 'bg-emerald-500'
                        )}
                        style={{ width: `${syncState.phase === 'pushing' ? pushProgress : 100}%` }}
                      />
                    </div>
                    {syncState.phase === 'pushing' && syncState.pushTotal === 0 && (
                      <div className="mt-1.5 w-full bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-400 rounded-full w-1/3 animate-pulse" />
                      </div>
                    )}
                  </div>

                  {/* Download */}
                  <div className="bg-slate-50 dark:bg-slate-800/30 rounded-xl p-3.5 border border-slate-100 dark:border-slate-800">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-400">
                        <ArrowDownCircle className="w-4 h-4 text-indigo-500" />
                        Download do servidor
                      </div>
                      <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                        {syncState.phase === 'pulling' ? `${syncState.pullCount} recebidos` : 'A aguardar...'}
                      </span>
                    </div>
                    <div className="w-full bg-slate-200 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      {syncState.phase === 'pulling'
                        ? <div className="h-full bg-indigo-400 rounded-full w-2/3 animate-pulse" />
                        : <div className="h-full bg-slate-300 dark:bg-slate-800 rounded-full w-0" />
                      }
                    </div>
                  </div>
                </div>
              )}

              {/* ── Por sincronizar (Upload pendente) — só quando idle e há dados ── */}
              {!isSyncing && unsyncedTotal > 0 && (
                <div className="bg-orange-50 dark:bg-orange-950/20 rounded-xl p-4 border border-orange-100 dark:border-orange-900/30">
                  <div className="flex items-center gap-2 mb-3">
                    <ArrowUpCircle className="w-4 h-4 text-orange-500" />
                    <span className="text-xs font-bold text-orange-700 dark:text-orange-400">Por enviar ao servidor</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                    {[
                      { label: 'Operadores', count: stats?.unsyncedFirmas ?? 0, color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/30 dark:text-indigo-400' },
                      { label: 'Fiscalizações', count: stats?.unsyncedVisitas ?? 0, color: 'bg-blue-100 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400' },
                      { label: 'Infrações', count: stats?.unsyncedInfracoes ?? 0, color: 'bg-orange-100 text-orange-700 dark:bg-orange-950/30 dark:text-orange-400' },
                      { label: 'Anexos', count: stats?.unsyncedAnexos ?? 0, color: 'bg-purple-100 text-purple-700 dark:bg-purple-950/30 dark:text-purple-400' },
                    ].map(({ label, count, color }) => (
                      <div key={label} className={cn('rounded-lg px-2.5 py-2 text-center', color)}>
                        <span className="text-base font-black block">{count}</span>
                        <span className="text-[9px] font-bold uppercase tracking-wide opacity-80">{label}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 border-t border-orange-200/60 dark:border-orange-900/40 pt-2.5">
                    <div className="flex items-center gap-1.5">
                      <HardDrive className="w-3.5 h-3.5 text-orange-400" />
                      <span>Tamanho estimado: <strong className="text-slate-700 dark:text-slate-300">{formatBytes(unsyncedBytes)}</strong></span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-orange-400" />
                      <span>ETA: <strong className="text-slate-700 dark:text-slate-300">{estimateEta(unsyncedBytes, unsyncedTotal)}</strong></span>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Tudo sincronizado (sem pendentes, idle) ── */}
              {!isSyncing && unsyncedTotal === 0 && syncState.phase !== 'error' && syncState.phase !== 'needs-auth' && (
                <div className="bg-emerald-50 dark:bg-emerald-950/20 rounded-xl p-4 border border-emerald-100 dark:border-emerald-900/30 flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-emerald-800 dark:text-emerald-400">Dados actualizados</p>
                    <p className="text-xs text-emerald-600 dark:text-emerald-500 font-medium">Todos os registos locais foram enviados ao servidor.</p>
                  </div>
                </div>
              )}

              {/* ── Erro de auth ── */}
              {syncState.phase === 'needs-auth' && (
                <div className="bg-amber-50 dark:bg-amber-950/20 rounded-xl p-4 border border-amber-200 dark:border-amber-900/30 flex items-center gap-3">
                  <WifiOff className="w-5 h-5 text-amber-500 shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-amber-800 dark:text-amber-400">Sessão expirada</p>
                    <p className="text-xs text-amber-700 dark:text-amber-550 font-medium">Os dados locais estão seguros. Re-autentique-se para retomar a sincronização.</p>
                  </div>
                </div>
              )}

              {/* ── Erro de rede/servidor ── */}
              {syncState.phase === 'error' && syncState.errors.length > 0 && (
                <div className="bg-red-50 dark:bg-red-950/20 rounded-xl p-3.5 border border-red-200 dark:border-red-900/30 flex items-start gap-3">
                  <XCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-red-700 dark:text-red-400 mb-1">Erro na sincronização</p>
                    <p className="text-[11px] text-red-600 dark:text-red-500 font-medium leading-relaxed">{syncState.errors[0]}</p>
                  </div>
                </div>
              )}

              {/* ── Resultado da última sync completa ── */}
              {(syncState.lastPushDone !== undefined || syncState.lastPullCount !== undefined) && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                  <div className="bg-slate-50 dark:bg-slate-800/40 px-3.5 py-2 border-b border-slate-200 dark:border-slate-800">
                    <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Última sincronização completa</span>
                  </div>
                  <div className="grid grid-cols-3 divide-x divide-slate-100 dark:divide-slate-850">
                    <div className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1 mb-1">
                        <ArrowUpCircle className="w-3.5 h-3.5 text-blue-500" />
                        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Enviados</span>
                      </div>
                      <span className="text-lg font-black text-slate-800 dark:text-slate-200">{syncState.lastPushDone ?? 0}</span>
                    </div>
                    <div className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1 mb-1">
                        <ArrowDownCircle className="w-3.5 h-3.5 text-indigo-500" />
                        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Recebidos</span>
                      </div>
                      <span className="text-lg font-black text-slate-800 dark:text-slate-200">{syncState.lastPullCount ?? 0}</span>
                    </div>
                    <div className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1 mb-1">
                        {(syncState.lastPushErrors ?? 0) > 0
                          ? <XCircle className="w-3.5 h-3.5 text-red-500" />
                          : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                          {(syncState.lastPushErrors ?? 0) > 0 ? 'Erros' : 'Duração'}
                        </span>
                      </div>
                      <span className={cn('text-lg font-black', (syncState.lastPushErrors ?? 0) > 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-800 dark:text-slate-200')}>
                        {(syncState.lastPushErrors ?? 0) > 0 ? syncState.lastPushErrors : formatDurationMs(syncState.lastDurationMs)}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        );
      })()}

      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
         <div className="p-4 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3 text-gray-700 dark:text-slate-350">
               <div className="w-10 h-10 bg-blue-100 dark:bg-blue-950/40 rounded-full flex items-center justify-center text-blue-600 dark:text-blue-400">
                  <Smartphone className="w-5 h-5" />
               </div>
               <div>
                  <h3 className="font-bold text-gray-900 dark:text-slate-100">Instalar Aplicação Móvel</h3>
                  <p className="text-xs text-gray-500 dark:text-slate-400">Descarregar ficheiro APK para instalação/atualização do dispositivo</p>
               </div>
            </div>
            <a 
              href={WEBVIEW_APK_DOWNLOAD_URL}
              download 
              className="text-sm font-bold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-950/30 px-3 py-1.5 rounded-lg border border-blue-200 dark:border-blue-800 cursor-pointer flex items-center gap-1.5"
            >
              <DownloadCloud className="w-4 h-4" /> Descarregar
            </a>
         </div>

         <div className="p-4 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3 text-gray-700 dark:text-slate-350">
               <div className="w-10 h-10 bg-indigo-100 dark:bg-indigo-950/40 rounded-full flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                  <DownloadCloud className="w-5 h-5" />
               </div>
               <div>
                  <h3 className="font-bold text-gray-900 dark:text-slate-100">Exportar Alterações</h3>
                  <p className="text-xs text-gray-500 dark:text-slate-400">Gerar ficheiro de backup (PEN)</p>
               </div>
            </div>
            <button onClick={exportData} className="text-sm font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 px-3 py-1.5 rounded-lg border border-indigo-200 dark:border-indigo-800 cursor-pointer">
               Exportar
            </button>
         </div>

         <div className="p-4 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3 text-gray-700 dark:text-slate-350">
               <div className="w-10 h-10 bg-teal-100 dark:bg-teal-950/40 rounded-full flex items-center justify-center text-teal-600 dark:text-teal-400">
                  <UploadCloud className="w-5 h-5" />
               </div>
               <div>
                  <h3 className="font-bold text-gray-900 dark:text-slate-100">Carregar Atualizações</h3>
                  <p className="text-xs text-gray-500 dark:text-slate-400">Importar ficheiro offline (.pen, .json)</p>
               </div>
            </div>
            <label className="text-sm font-bold text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-950/30 px-3 py-1.5 rounded-lg border border-teal-200 dark:border-teal-800 cursor-pointer">
               Carregar
               <input type="file" accept=".pen,.json" onChange={importData} className="hidden" />
            </label>
         </div>

         <div className="p-4 border-b border-gray-100 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3 text-gray-700 dark:text-slate-350">
               <div className="w-10 h-10 bg-orange-100 dark:bg-orange-950/40 rounded-full flex items-center justify-center text-orange-600 dark:text-orange-400">
                  <HardDrive className="w-5 h-5" />
               </div>
               <div>
                  <h3 className="font-bold text-gray-900 dark:text-slate-100">Limpar Cache</h3>
                  <p className="text-xs text-gray-400 dark:text-slate-500">Remove apenas registos já submetidos salvos no servidor</p>
               </div>
            </div>
             {/* PIN CONFIRMATION MODAL FOR CLEAR CACHE */}
             {showPinModal && (
               <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 font-sans animate-in fade-in duration-200">
                 <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-sm w-full overflow-hidden p-6 space-y-4 animate-in zoom-in-95 duration-200">
                   <div className="flex flex-col items-center text-center space-y-2">
                     <div className="w-12 h-12 bg-red-100 dark:bg-red-950/30 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center mb-1">
                       <ShieldCheck className="w-6 h-6" />
                     </div>
                     <h3 className="font-bold text-lg text-slate-900 dark:text-slate-100">Confirmação de Segurança</h3>
                     <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed font-semibold">
                       A limpeza de cache elimina os dados locais já submetidos. Introduza a sua palavra-passe para prosseguir.
                     </p>
                   </div>

                   <form onSubmit={handleClearPinSubmit} className="space-y-4">
                     <div className="space-y-1">
                       <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block pl-1">Palavra-passe do Inspetor</label>
                       <input
                         type="password"
                         placeholder="Digite a palavra-passe"
                         value={pinInput}
                         onChange={e => {
                           setPinInput(e.target.value);
                           setPinError('');
                         }}
                         className="w-full text-center tracking-widest text-lg font-black bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:bg-white dark:focus:bg-slate-900 focus:ring-2 focus:ring-indigo-500 rounded-xl p-3 text-slate-800 dark:text-slate-100"
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
                         className="flex-1 py-3 text-xs font-bold text-slate-600 dark:text-slate-350 bg-slate-100 dark:bg-slate-850 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                       >
                         Cancelar
                       </button>
                       <button
                         type="submit"
                         disabled={pinInput.length === 0}
                         className="flex-1 py-3 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:bg-slate-400 dark:disabled:bg-slate-800 rounded-xl transition-colors shadow-sm cursor-pointer"
                       >
                         Confirmar
                       </button>
                     </div>
                   </form>
                 </div>
               </div>
             )}

            <button onClick={clearData} className="text-sm font-bold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900/40 shadow-sm transition-colors cursor-pointer">
               Limpar Cache
            </button>
         </div>

         <div className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3 text-gray-700 dark:text-slate-350">
               <div className="w-10 h-10 bg-gray-100 dark:bg-slate-800 rounded-full flex items-center justify-center text-gray-600 dark:text-slate-400">
                  <LogOut className="w-5 h-5" />
               </div>
               <div>
                  <h3 className="font-bold text-gray-900 dark:text-slate-100">Sessão</h3>
                  <p className="text-xs text-gray-500 dark:text-slate-400">
                    {(() => {
                      try {
                        const info = JSON.parse(localStorage.getItem('drcae_officer_info') || 'null');
                        return info?.name ?? 'Agente';
                      } catch { return 'Agente'; }
                    })()}
                  </p>
               </div>
            </div>
            <button onClick={onLogout} className="text-sm font-bold text-gray-600 dark:text-slate-400 hover:bg-gray-50 dark:hover:bg-slate-800 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-slate-700 cursor-pointer">
               Sair
            </button>
         </div>
      </div>
    </div>
  );
}

function isSetupPath() {
  const path = window.location.pathname.replace(/\/+$/, '');
  return path === '/setup' || path === '/app/setup';
}

function LoginPage({ onLogin }: { onLogin: () => void }) {
  const [nif, setNif] = useState(() => localStorage.getItem('drcae_officer_nif') || '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showFullscreenBtn, setShowFullscreenBtn] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const hasFullscreenSupport = typeof document.documentElement.requestFullscreen === 'function';
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                         window.matchMedia('(display-mode: minimal-ui)').matches ||
                         (window.navigator as any).standalone;
    const isWebview = window.navigator.userAgent.includes('DrcaeWebview');

    setShowFullscreenBtn(hasFullscreenSupport && !isStandalone && !isWebview);

    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch (err) {
      console.error('[drcae] Erro ao alternar ecrã inteiro:', err);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Verificação offline: assinatura local independente do servidor
    const doOfflineLogin = async () => {
      const stored = localStorage.getItem(`drcae_local_cred_${nif}`);
      if (!stored) {
        setError('Sem credenciais offline para este agente. Conecte-se à rede e inicie sessão uma primeira vez.');
        return;
      }
      const { sigHex: storedSig, saltHex } = JSON.parse(stored) as { sigHex: string; saltHex: string };

      const testSig = await crypto.deriveLocalSignature(nif, password, api.getDeviceId());
      if (testSig !== storedSig) {
        setError('Palavra-passe incorreta.');
        return;
      }

      // Credenciais confirmadas — re-derivar chave AES e verificar canary
      const derivedKey = await crypto.deriveKey(nif, password, saltHex);
      crypto.setActiveKey(derivedKey);

      const ok = await db.verifyOfflineKey();
      if (!ok) {
        setError('Cache offline corrompida. Conecte-se à rede e inicie sessão novamente.');
        crypto.setActiveKey(null);
        return;
      }

      localStorage.setItem('drcae_officer_nif', nif);
      onLogin();
    };

    try {
      const isOnline = navigator.onLine;

      if (isOnline) {
        // ── CAMINHO ONLINE ────────────────────────────────────────────────
        // 1. Obter salt do servidor
        let salt: string;
        try {
          const saltRes = await api.getSalt();
          salt = saltRes.salt;
          localStorage.setItem('drcae_cached_salt', salt);
        } catch {
          // getSalt falhou com rede — tratar como offline
          await doOfflineLogin();
          return;
        }

        // 2. Derivar chave AES localmente
        const derivedKey = await crypto.deriveKey(nif, password, salt);
        crypto.setActiveKey(derivedKey);

        // 3. Autenticar no servidor
        try {
          await api.login(nif, password);
        } catch (err: any) {
          const isNetErr = /fetch|network|failed to fetch|networkerror/i.test(err?.message || '');
          if (isNetErr) {
            // Rede caiu a meio do login — usar caminho offline
            await doOfflineLogin();
            return;
          }
          setError(err?.message || 'Credenciais inválidas.');
          crypto.setActiveKey(null);
          return;
        }

        // 4. Sucesso online: actualizar canary e assinatura local
        await db.setupOfflineCanary();
        const sigHex = await crypto.deriveLocalSignature(nif, password, api.getDeviceId());
        localStorage.setItem(`drcae_local_cred_${nif}`, JSON.stringify({ sigHex, saltHex: salt }));
        localStorage.setItem('drcae_officer_nif', nif);
        onLogin();

      } else {
        // ── CAMINHO OFFLINE ───────────────────────────────────────────────
        await doOfflineLogin();
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao processar autenticação.');
      crypto.setActiveKey(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-[#F5F7FA] p-4 relative">
      {showFullscreenBtn && (
        <button
          onClick={toggleFullscreen}
          className="absolute top-4 right-4 p-2 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-500 hover:text-slate-800 transition-colors shadow-sm cursor-pointer z-50"
          title={isFullscreen ? 'Sair do Ecrã Inteiro' : 'Ecrã Inteiro'}
        >
          {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
        </button>
      )}
      <div className="w-full max-w-sm bg-white p-8 rounded-3xl shadow-xl shadow-blue-900/5 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex justify-center mb-6">
          <img src={APP_LOGO_LOGIN_SRC} alt="DRCAE" className="h-20 w-auto max-w-[220px] object-contain" />
        </div>
        <h1 className="text-2xl font-black text-center text-slate-900 mb-2">Entrar</h1>
        <p className="text-sm text-center text-slate-500 mb-6 font-medium">
          {navigator.onLine ? 'Conectado à Internet' : 'Modo Offline - Acesso Criptografado'}
        </p>
        
        {error && (
          <div className="p-3 mb-4 bg-red-50 border border-red-200 text-red-600 text-xs font-semibold rounded-xl text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">NIF do Agente</label>
            <input 
              type="text" 
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="username"
              required
              value={nif}
              onChange={(e) => setNif(e.target.value.replace(/\D/g, ''))}
              className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 text-sm font-medium transition-all"
              placeholder="Ex: 123456789"
              disabled={loading}
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
              disabled={loading}
            />
          </div>
          <button 
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-blue-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 transition-colors uppercase tracking-wide mt-4 disabled:opacity-50"
          >
            {loading ? 'A processar...' : 'Iniciar Sessão'}
          </button>
        </form>
      </div>
    </div>
  );
}

// Exibido quando login retorna 403 (dispositivo aguarda aprovação pós-login)
function AwaitingApprovalScreen({ onLogout }: { onLogout: () => void }) {
  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white dark:bg-slate-800 rounded-3xl shadow-2xl p-8 text-center space-y-6">
        <div className="w-20 h-20 bg-white rounded-2xl flex items-center justify-center mx-auto border border-slate-200 shadow-sm">
          <img src={APP_LOGO_SRC} alt="DRCAE" className="w-16 h-16 object-contain" />
        </div>
        <div>
          <h2 className="text-xl font-extrabold text-slate-900 dark:text-slate-100">Dispositivo Pendente</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
            Este dispositivo aguarda aprovação pelo administrador no painel de <strong>Gestão de Sincronização Móvel</strong>. Contacte o seu supervisor.
          </p>
        </div>
        <button
          onClick={onLogout}
          className="w-full py-3 rounded-xl bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-sm hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
        >
          Terminar Sessão
        </button>
      </div>
    </div>
  );
}

// Exibido após emparelhamento directo (browser), enquanto o admin não aprova
function WaitingApprovalScreen({
  onApproved,
  onRepair,
}: {
  onApproved: () => void;
  onRepair: () => void;
}) {
  const creds = getPairingCredentials();
  const deviceCode = creds?.device_code ?? '—';

  useEffect(() => {
    // Verificação imediata + polling periódico
    let cancelled = false;

    async function check() {
      try {
        const status = await api.checkDeviceStatus();
        if (status.paired && !cancelled) {
          onApproved();
        }
      } catch {
        // falha de rede — tentar novamente no próximo ciclo
      }
    }

    check(); // verificar imediatamente ao montar
    const poll = setInterval(check, 10_000);
    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, [onApproved]);

  return (
    <div className="min-h-screen bg-[#0f172a] flex items-center justify-center p-6">
      <div className="max-w-sm w-full text-center space-y-6">
        <div className="w-20 h-20 bg-white rounded-2xl flex items-center justify-center mx-auto border border-blue-100">
          <img src={APP_LOGO_SRC} alt="DRCAE" className="w-16 h-16 object-contain" />
        </div>

        <div>
          <h2 className="text-xl font-extrabold text-white">Aguardando Aprovação</h2>
          <p className="text-slate-400 text-sm mt-2 leading-relaxed">
            O dispositivo foi registado com sucesso. O administrador precisa de o aprovar no painel de{' '}
            <strong className="text-slate-300">Sincronização Móvel</strong>.
          </p>
        </div>

        <div className="bg-slate-800/60 rounded-2xl px-6 py-4 space-y-1">
          <p className="text-slate-500 text-xs uppercase tracking-wider font-semibold">Código do Dispositivo</p>
          <p className="text-white text-2xl font-black font-mono tracking-widest">{deviceCode}</p>
        </div>

        <div className="flex items-center gap-2 justify-center text-slate-500 text-xs">
          <RefreshCw className="w-3 h-3 animate-spin" />
          A verificar aprovação…
        </div>

        <button
          onClick={onRepair}
          className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 text-sm font-semibold transition-colors"
        >
          Emparelhar novamente
        </button>
      </div>
    </div>
  );
}

type SessionState = 'checking' | 'valid' | 'needs_pairing' | 'waiting_approval' | 'launching' | 'offline_login';

function isNativeWebview() {
  return /DrcaeWebview\//i.test(navigator.userAgent);
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [devicePending, setDevicePending] = useState(false);
  const [sessionState, setSessionState] = useState<SessionState>('checking');

  // Inicialização de sessão
  useEffect(() => {
    async function initSession() {
      let restoredSessionKey = false;

      // 1. Restaurar chave criptográfica se houver no sessionStorage
      const savedKeyHex = sessionStorage.getItem('drcae_session_key');
      if (savedKeyHex) {
        try {
          await crypto.restoreSessionKey(savedKeyHex);
          if (!api.getJwtToken()) {
            const refreshed = await api.refreshSilent();
            if (!refreshed && !isNativeWebview()) {
              sessionStorage.removeItem('drcae_session_key');
            }
          }
          setIsAuthenticated(true);
          restoredSessionKey = true;
        } catch (err) {
          console.error('[drcae] Falha ao restaurar chave criptográfica:', err);
          sessionStorage.removeItem('drcae_session_key');
        }
      }

      // 2. Handshake webview — troca o ?wvt= pelo cookie __wvs (fluxo app nativa)
      const params = new URLSearchParams(window.location.search);
      const wvt = params.get('wvt');
      if (wvt) {
        try {
          const handshake = await api.performHandshake(wvt);
          if (handshake.device_id) {
            api.setDeviceId(handshake.device_id);
          }
          params.delete('wvt');
          const newSearch = params.toString();
          window.history.replaceState({}, '', window.location.pathname + (newSearch ? '?' + newSearch : ''));
          setSessionState('valid');
        } catch {
          // token inválido — tratar como sem sessão
          setSessionState('needs_pairing');
        }
        return;
      }

      // 3. Verificar se já existe uma sessão __wvs activa
      const sessionOk = await checkSessionValid();
      if (sessionOk) {
        setSessionState('valid');
        return;
      }

      // 4. No shell nativo offline não haverá ?wvt= nem cookie __wvs novo.
      //    Se a chave local ainda existe, abrir a app; caso contrário pedir login offline.
      if (isNativeWebview()) {
        setSessionState(restoredSessionKey ? 'valid' : 'offline_login');
        return;
      }

      // 5. Sem sessão — verificar credenciais de emparelhamento guardadas
      const creds = getPairingCredentials();
      if (creds) {
        try {
          const status = await api.checkDeviceStatus();
          if (status.paired) {
            setSessionState('launching');
          } else {
            setSessionState('waiting_approval');
          }
        } catch {
          setSessionState('waiting_approval');
        }
        return;
      }

      // 6. Nenhuma credencial — emparelhamento necessário
      setSessionState('needs_pairing');
    }

    initSession();
  }, []);

  // Quando aprovado, fazer launch + handshake para obter __wvs
  useEffect(() => {
    if (sessionState !== 'launching') return;
    const creds = getPairingCredentials();
    if (!creds) {
      setSessionState('needs_pairing');
      return;
    }

    (async () => {
      const { launch_token } = await api.requestLaunchToken(creds.webview_signature);
      const handshake = await api.performHandshake(launch_token);
      if (handshake.device_id) {
        api.setDeviceId(handshake.device_id);
      }
      setSessionState('valid');
    })().catch(() => {
      clearPairingCredentials();
      setSessionState('needs_pairing');
    });
  }, [sessionState]);

  // Escutar expiração de token
  useEffect(() => {
    const handleAuthExpired = () => {
      setIsAuthenticated(false);
      crypto.setActiveKey(null);
      if (isNativeWebview() && !navigator.onLine) {
        setSessionState('offline_login');
        return;
      }
      customAlert.warning('Sessão Expirada', 'A sua sessão expirou. Por favor, inicie sessão novamente.');
    };
    window.addEventListener('auth-expired', handleAuthExpired);
    return () => window.removeEventListener('auth-expired', handleAuthExpired);
  }, []);

  // Escutar dispositivo pendente de aprovação (login retornou 403)
  useEffect(() => {
    const handler = () => setDevicePending(true);
    window.addEventListener('device-pending-approval', handler);
    return () => window.removeEventListener('device-pending-approval', handler);
  }, []);

  useEffect(() => {
    const handleDeviceBlocked = () => {
      api.setJwtToken(null);
      crypto.setActiveKey(null);
      setDevicePending(false);
      setIsAuthenticated(false);
      setSessionState('waiting_approval');
      customAlert.warning('Dispositivo bloqueado', 'Este dispositivo foi bloqueado pelo administrador e não pode continuar a operar.');
    };

    window.addEventListener('device-blocked', handleDeviceBlocked);
    return () => window.removeEventListener('device-blocked', handleDeviceBlocked);
  }, []);

  const handleLogin = async () => {
    setIsAuthenticated(true);
    setSessionState('valid');
    if (navigator.onLine && api.getJwtToken()) {
      try {
        const assetsData = await api.getAssets();
        localStorage.setItem('drcae_officers_list', JSON.stringify(assetsData.officers || []));
        localStorage.setItem('drcae_assets', JSON.stringify(assetsData.assets || []));
        localStorage.setItem('drcae_infractions', JSON.stringify(assetsData.infractions || []));
        localStorage.setItem('drcae_branches', JSON.stringify(assetsData.branches || []));
      } catch (err) {
        console.warn('[drcae] Falha ao obter dados de referência; a usar cache anterior.', err);
      }
      try {
        await triggerFullSync();
      } catch (err) {
        console.warn('[drcae] Sync inicial falhou; dados locais mantidos.', err);
      }
    }
  };

  // Sincronizar equipa no arranque se online e autenticado
  useEffect(() => {
    if (isAuthenticated && navigator.onLine && api.getJwtToken()) {
      const savedTeam = localStorage.getItem('drcae_equipe');
      if (savedTeam) {
        try {
          const parsedTeam = JSON.parse(savedTeam).join(', ');
          api.updateDeviceTeam(parsedTeam).catch(() => {});
        } catch {}
      }
    }
  }, [isAuthenticated]);

  const handleLogout = () => {
    api.logout().catch(() => {});
    crypto.setActiveKey(null);
    setIsAuthenticated(false);
    setDevicePending(false);
  };

  const handleRepair = useCallback(() => {
    clearPairingCredentials();
    setSessionState('needs_pairing');
  }, []);

  const handleApproved = useCallback(() => {
    setSessionState('launching');
  }, []);

  if (isSetupPath()) {
    return <SetupPage />;
  }

  // Estados de sessão antes do login
  if (sessionState === 'checking' || sessionState === 'launching') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0f172a]">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
          <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">A iniciar sessão...</span>
        </div>
      </div>
    );
  }

  if (sessionState === 'needs_pairing') {
    return (
      <PairingScreen
        onRegistered={(autoApproved) =>
          setSessionState(autoApproved ? 'launching' : 'waiting_approval')
        }
      />
    );
  }

  if (sessionState === 'offline_login') {
    return <LoginPage onLogin={handleLogin} />;
  }

  if (sessionState === 'waiting_approval') {
    return <WaitingApprovalScreen onApproved={handleApproved} onRepair={handleRepair} />;
  }

  // sessionState === 'valid'
  if (!isAuthenticated) {
    return <LoginPage onLogin={handleLogin} />;
  }

  if (devicePending) {
    return <AwaitingApprovalScreen onLogout={handleLogout} />;
  }

  const appBasename = (window.location.pathname === "/app" || window.location.pathname.startsWith("/app/")) ? "/app" : "/";
  return (
    <BrowserRouter basename={appBasename}>
      <NotificationContainer />
      <Routes>
        <Route path="/" element={<Layout onLogout={handleLogout} />}>
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

          <Route path="central" element={<Central />} />

          <Route path="pendentes" element={<PendentesPage />} />

          <Route path="settings" element={<SettingsPage onLogout={handleLogout} />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
