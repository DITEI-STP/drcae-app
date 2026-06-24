/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useRef } from 'react';
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
import { db } from './db/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { Settings, RefreshCw, HardDrive, LogOut, ShieldCheck, DownloadCloud, UploadCloud, Cpu, Layers, Disc, Camera, QrCode, AlertCircle, Smartphone, Maximize, Minimize, ArrowUpCircle, ArrowDownCircle, CheckCircle2, XCircle, Clock, Wifi, WifiOff, Activity, Zap } from 'lucide-react';
import * as api from './lib/api';
import * as crypto from './lib/crypto';
import { triggerFullSync } from './lib/sync';
import { type SyncSnapshot, getSyncSnapshot, subscribeSyncState } from './lib/syncState';

// Hook que subscreve ao estado global de sync sem polling
function useSyncState(): SyncSnapshot {
  const [state, setState] = useState<SyncSnapshot>(getSyncSnapshot);
  useEffect(() => {
    // Sincronizar imediatamente (pode ter mudado entre renders)
    setState(getSyncSnapshot());
    return subscribeSyncState(setState);
  }, []);
  return state;
}
import NotificationContainer from './components/NotificationContainer';
import { toast, customAlert } from './lib/notifications';

function SettingsPage({ onLogout }: { onLogout: () => void }) {
  const [selectedProfile] = useState<'economy' | 'standard' | 'maximum'>(() => {
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
    const firmas = await db.firmas.toArray();
    const visitas = await db.visitas.toArray();
    const infracoes = await db.infracoes.toArray();
    const anexos = await db.anexos.toArray();
    const queue = await db.syncQueue.toArray();

    const totalFirmas = firmas.length;
    const unsyncedFirmasList = firmas.filter(f => !f.synced);
    const unsyncedFirmas = unsyncedFirmasList.length;
    const syncedFirmas = totalFirmas - unsyncedFirmas;

    const totalVisitas = visitas.length;
    const unsyncedVisitasList = visitas.filter(v => !v.synced);
    const unsyncedVisitas = unsyncedVisitasList.length;
    const syncedVisitas = totalVisitas - unsyncedVisitas;

    const totalInfracoes = infracoes.length;
    const unsyncedInfracoesList = infracoes.filter(i => !i.synced);
    const unsyncedInfracoes = unsyncedInfracoesList.length;
    const syncedInfracoes = totalInfracoes - unsyncedInfracoes;

    const totalAnexos = anexos.length;
    const unsyncedAnexosList = anexos.filter(a => !a.synced);
    const unsyncedAnexos = unsyncedAnexosList.length;
    const syncedAnexos = totalAnexos - unsyncedAnexos;

    // Bytes totais em cache
    const payloadString = JSON.stringify({ firmas, visitas, infracoes, anexos, queue });
    const bytes = new Blob([payloadString]).size;

    // Bytes apenas dos registos não sincronizados (estimativa de payload de upload)
    const unsyncedPayload = JSON.stringify({
      firmas: unsyncedFirmasList,
      visitas: unsyncedVisitasList,
      infracoes: unsyncedInfracoesList,
      anexos: unsyncedAnexosList,
    });
    const unsyncedBytes = new Blob([unsyncedPayload]).size;

    // Última sync do metadata
    const metaLastSync = await db.table('metadata').get('last_sync_at');
    const lastSyncAt: string | null = metaLastSync?.value || null;

    return {
      totalFirmas, unsyncedFirmas, syncedFirmas,
      totalVisitas, unsyncedVisitas, syncedVisitas,
      totalInfracoes, unsyncedInfracoes, syncedInfracoes,
      totalAnexos, unsyncedAnexos, syncedAnexos,
      queueLength: queue.length,
      bytes,
      unsyncedBytes,
      lastSyncAt,
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
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="bg-slate-50/50 p-4 border-b border-slate-200 flex items-center gap-2">
          <Layers className="w-5 h-5 text-indigo-600" />
          <h3 className="font-bold text-slate-800 text-sm">Perfil de Sincronização</h3>
          <span className="ml-auto text-[10px] font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full uppercase tracking-wider">Atribuído pelo Admin</span>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-xs text-slate-500 leading-relaxed font-semibold">
            O perfil de sincronização é configurado centralmente pelo administrador do sistema e aplicado automaticamente a este dispositivo.
          </p>

          {/* Perfil activo - read-only */}
          <div className={`p-4 rounded-xl border-2 flex items-center gap-4 ${
            selectedProfile === 'economy'
              ? 'border-amber-400 bg-amber-50/40'
              : selectedProfile === 'maximum'
              ? 'border-emerald-500 bg-emerald-50/40'
              : 'border-indigo-500 bg-indigo-50/40'
          }`}>
            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
              selectedProfile === 'economy' ? 'bg-amber-100' : selectedProfile === 'maximum' ? 'bg-emerald-100' : 'bg-indigo-100'
            }`}>
              <Layers className={`w-5 h-5 ${
                selectedProfile === 'economy' ? 'text-amber-600' : selectedProfile === 'maximum' ? 'text-emerald-600' : 'text-indigo-600'
              }`} />
            </div>
            <div className="flex-1">
              <p className={`font-bold text-sm ${
                selectedProfile === 'economy' ? 'text-amber-800' : selectedProfile === 'maximum' ? 'text-emerald-800' : 'text-indigo-800'
              }`}>
                {selectedProfile === 'economy' ? 'Mínimo / Económico' : selectedProfile === 'maximum' ? 'Offline Total / Máximo' : 'Padrão / Recomendado'}
              </p>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                {selectedProfile === 'economy'
                  ? 'Poupança de dados — histórico de 15 dias'
                  : selectedProfile === 'maximum'
                  ? 'Histórico completo — acesso offline total'
                  : 'Equilíbrio recomendado — histórico de 60 dias'}
              </p>
            </div>
            <span className={`text-xs font-black px-2.5 py-1 rounded-full ${
              selectedProfile === 'economy' ? 'bg-amber-100 text-amber-700' : selectedProfile === 'maximum' ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-100 text-indigo-700'
            }`}>
              {selectedProfile === 'economy' ? '~35%' : selectedProfile === 'maximum' ? '100%' : '~70%'}
            </span>
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



      {/* ═══════════════════════════════════════════════════════════════
           PAINEL DE SINCRONIZAÇÃO — estado em tempo real + acções
          ═══════════════════════════════════════════════════════════════ */}
      {(() => {
        const isSyncing = syncState.phase === 'pushing' || syncState.phase === 'pulling';
        const unsyncedTotal = (stats?.unsyncedFirmas ?? 0) + (stats?.unsyncedVisitas ?? 0) +
          (stats?.unsyncedInfracoes ?? 0) + (stats?.unsyncedAnexos ?? 0);
        const unsyncedBytes = stats?.unsyncedBytes ?? 0;

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
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            {/* Cabeçalho do painel */}
            <div className="bg-gradient-to-r from-slate-800 to-slate-700 p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center">
                  <Activity className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-sm">Centro de Sincronização</h3>
                  <p className="text-[10px] text-slate-400 font-medium mt-0.5">Monitor de dados offline ↔ servidor</p>
                </div>
              </div>
              <button
                onClick={handleManualSync}
                disabled={isSyncing || isManualSyncing}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all shadow-md ${
                  isSyncing || isManualSyncing
                    ? 'bg-slate-600 text-slate-400 cursor-not-allowed'
                    : 'bg-emerald-500 hover:bg-emerald-400 text-white active:scale-95'
                }`}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${(isSyncing || isManualSyncing) ? 'animate-spin' : ''}`} />
                {isSyncing || isManualSyncing ? 'A sincronizar...' : 'Sincronizar Agora'}
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Estado geral */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${statusDot}`} />
                  <span className="text-sm font-semibold text-slate-700">{phaseLabel}</span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-medium">
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
                  <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-100">
                    <div className="flex items-center justify-between mb-2.5">
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
                        <ArrowUpCircle className="w-4 h-4 text-blue-500" />
                        Upload para servidor
                      </div>
                      <span className="text-[11px] font-bold text-blue-600">
                        {syncState.phase === 'pushing'
                          ? syncState.pushTotal > 0 ? `${syncState.pushDone} / ${syncState.pushTotal}` : 'A preparar...'
                          : `${syncState.pushDone} enviados`}
                      </span>
                    </div>
                    <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          syncState.phase === 'pushing' ? 'bg-blue-500' : 'bg-emerald-500'
                        }`}
                        style={{ width: `${syncState.phase === 'pushing' ? pushProgress : 100}%` }}
                      />
                    </div>
                    {syncState.phase === 'pushing' && syncState.pushTotal === 0 && (
                      <div className="mt-1.5 w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-400 rounded-full w-1/3 animate-pulse" />
                      </div>
                    )}
                  </div>

                  {/* Download */}
                  <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-100">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
                        <ArrowDownCircle className="w-4 h-4 text-indigo-500" />
                        Download do servidor
                      </div>
                      <span className="text-[11px] font-bold text-slate-500">
                        {syncState.phase === 'pulling' ? `${syncState.pullCount} recebidos` : 'A aguardar...'}
                      </span>
                    </div>
                    <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                      {syncState.phase === 'pulling'
                        ? <div className="h-full bg-indigo-400 rounded-full w-2/3 animate-pulse" />
                        : <div className="h-full bg-slate-300 rounded-full w-0" />
                      }
                    </div>
                  </div>
                </div>
              )}

              {/* ── Por sincronizar (Upload pendente) — só quando idle e há dados ── */}
              {!isSyncing && unsyncedTotal > 0 && (
                <div className="bg-orange-50 rounded-xl p-4 border border-orange-100">
                  <div className="flex items-center gap-2 mb-3">
                    <ArrowUpCircle className="w-4 h-4 text-orange-500" />
                    <span className="text-xs font-bold text-orange-700">Por enviar ao servidor</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                    {[
                      { label: 'Operadores', count: stats?.unsyncedFirmas ?? 0, color: 'bg-indigo-100 text-indigo-700' },
                      { label: 'Fiscalizações', count: stats?.unsyncedVisitas ?? 0, color: 'bg-blue-100 text-blue-700' },
                      { label: 'Infrações', count: stats?.unsyncedInfracoes ?? 0, color: 'bg-orange-100 text-orange-700' },
                      { label: 'Anexos', count: stats?.unsyncedAnexos ?? 0, color: 'bg-purple-100 text-purple-700' },
                    ].map(({ label, count, color }) => (
                      <div key={label} className={`rounded-lg px-2.5 py-2 text-center ${color}`}>
                        <span className="text-base font-black block">{count}</span>
                        <span className="text-[9px] font-bold uppercase tracking-wide opacity-80">{label}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-500 border-t border-orange-200/60 pt-2.5">
                    <div className="flex items-center gap-1.5">
                      <HardDrive className="w-3.5 h-3.5 text-orange-400" />
                      <span>Tamanho estimado: <strong className="text-slate-700">{formatBytes(unsyncedBytes)}</strong></span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-orange-400" />
                      <span>ETA: <strong className="text-slate-700">{estimateEta(unsyncedBytes, unsyncedTotal)}</strong></span>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Tudo sincronizado (sem pendentes, idle) ── */}
              {!isSyncing && unsyncedTotal === 0 && syncState.phase !== 'error' && syncState.phase !== 'needs-auth' && (
                <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100 flex items-center gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-emerald-800">Dados actualizados</p>
                    <p className="text-xs text-emerald-600 font-medium">Todos os registos locais foram enviados ao servidor.</p>
                  </div>
                </div>
              )}

              {/* ── Erro de auth ── */}
              {syncState.phase === 'needs-auth' && (
                <div className="bg-amber-50 rounded-xl p-4 border border-amber-200 flex items-center gap-3">
                  <WifiOff className="w-5 h-5 text-amber-500 shrink-0" />
                  <div>
                    <p className="text-sm font-bold text-amber-800">Sessão expirada</p>
                    <p className="text-xs text-amber-700 font-medium">Os dados locais estão seguros. Re-autentique-se para retomar a sincronização.</p>
                  </div>
                </div>
              )}

              {/* ── Erro de rede/servidor ── */}
              {syncState.phase === 'error' && syncState.errors.length > 0 && (
                <div className="bg-red-50 rounded-xl p-3.5 border border-red-200 flex items-start gap-3">
                  <XCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-red-700 mb-1">Erro na sincronização</p>
                    <p className="text-[11px] text-red-600 font-medium leading-relaxed">{syncState.errors[0]}</p>
                  </div>
                </div>
              )}

              {/* ── Resultado da última sync completa ── */}
              {(syncState.lastPushDone !== undefined || syncState.lastPullCount !== undefined) && (
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <div className="bg-slate-50 px-3.5 py-2 border-b border-slate-200">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Última sincronização completa</span>
                  </div>
                  <div className="grid grid-cols-3 divide-x divide-slate-100">
                    <div className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1 mb-1">
                        <ArrowUpCircle className="w-3.5 h-3.5 text-blue-500" />
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Enviados</span>
                      </div>
                      <span className="text-lg font-black text-slate-800">{syncState.lastPushDone ?? 0}</span>
                    </div>
                    <div className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1 mb-1">
                        <ArrowDownCircle className="w-3.5 h-3.5 text-indigo-500" />
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Recebidos</span>
                      </div>
                      <span className="text-lg font-black text-slate-800">{syncState.lastPullCount ?? 0}</span>
                    </div>
                    <div className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1 mb-1">
                        {(syncState.lastPushErrors ?? 0) > 0
                          ? <XCircle className="w-3.5 h-3.5 text-red-500" />
                          : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          {(syncState.lastPushErrors ?? 0) > 0 ? 'Erros' : 'Duração'}
                        </span>
                      </div>
                      <span className={`text-lg font-black ${(syncState.lastPushErrors ?? 0) > 0 ? 'text-red-600' : 'text-slate-800'}`}>
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

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
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
                       A limpeza de cache elimina os dados locais já submetidos. Introduza a sua palavra-passe para prosseguir.
                     </p>
                   </div>

                   <form onSubmit={handleClearPinSubmit} className="space-y-4">
                     <div className="space-y-1">
                       <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block pl-1">Palavra-passe do Inspetor</label>
                       <input
                         type="password"
                         placeholder="Digite a palavra-passe"
                         value={pinInput}
                         onChange={e => {
                           setPinInput(e.target.value);
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
                         disabled={pinInput.length === 0}
                         className="flex-1 py-3 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:bg-slate-400 rounded-xl transition-colors shadow-sm"
                       >
                         Confirmar
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
                  <p className="text-xs text-gray-500">
                    {(() => {
                      try {
                        const info = JSON.parse(localStorage.getItem('drcae_officer_info') || 'null');
                        return info?.name ?? 'Agente';
                      } catch { return 'Agente'; }
                    })()}
                  </p>
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

    try {
      const isOnline = navigator.onLine;

      // 1. Obter salt — online: pedir ao servidor e cachear; offline: usar cache
      let salt: string;
      if (isOnline) {
        try {
          const saltRes = await api.getSalt();
          salt = saltRes.salt;
          localStorage.setItem('drcae_cached_salt', salt);
        } catch {
          // Rede caiu mesmo com onLine=true — usar cache se disponível
          const cached = localStorage.getItem('drcae_cached_salt');
          if (!cached) {
            setError('Sem ligação ao servidor e sem cache offline. Conecte-se à rede na primeira utilização.');
            return;
          }
          salt = cached;
        }
      } else {
        const cached = localStorage.getItem('drcae_cached_salt');
        if (!cached) {
          setError('Sem internet e sem cache de acesso offline. Conecte-se à rede na primeira utilização.');
          return;
        }
        salt = cached;
      }

      // 2. Derivar chave local (sempre local, nunca vai à rede)
      const derivedKey = await crypto.deriveKey(nif, password, salt);
      crypto.setActiveKey(derivedKey);

      if (isOnline) {
        try {
          // 3. Login online
          await api.login(nif, password);
          // 4. Gravar canary encriptado para autenticação offline futura
          await db.setupOfflineCanary();
          localStorage.setItem('drcae_officer_nif', nif);
          onLogin();
        } catch (onlineErr: any) {
          const msg = onlineErr.message || '';
          const isNetworkErr = /fetch|network|failed to fetch|networkerror/i.test(msg);
          if (isNetworkErr) {
            // Rede caiu no meio do login — tentar offline com canary
            const ok = await db.verifyOfflineKey();
            if (ok) {
              localStorage.setItem('drcae_officer_nif', nif);
              onLogin();
            } else {
              setError('Sem ligação e sem credenciais offline gravadas. Ligue-se à rede e tente novamente.');
              crypto.setActiveKey(null);
            }
          } else {
            setError(msg || 'Credenciais inválidas.');
            crypto.setActiveKey(null);
          }
        }
      } else {
        // Modo 100% offline — verificar canary encriptado local
        const ok = await db.verifyOfflineKey();
        if (ok) {
          localStorage.setItem('drcae_officer_nif', nif);
          onLogin();
        } else {
          setError('Palavra-passe incorreta ou sem cache offline ativa para este agente.');
          crypto.setActiveKey(null);
        }
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
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center shadow-lg shadow-blue-600/30">
            <ShieldCheck className="w-8 h-8 text-white" />
          </div>
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
              required
              value={nif}
              onChange={(e) => setNif(e.target.value)}
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

function AwaitingApprovalScreen({ onLogout }: { onLogout: () => void }) {
  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white dark:bg-slate-800 rounded-3xl shadow-2xl p-8 text-center space-y-6">
        <div className="w-16 h-16 bg-amber-100 dark:bg-amber-900/30 rounded-2xl flex items-center justify-center mx-auto">
          <ShieldCheck className="w-8 h-8 text-amber-600 dark:text-amber-400" />
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

// Ecrã de acesso bloqueado — acesso directo sem sessão webview
function WebviewRequired({ onDevConnect }: { onDevConnect?: (sig: string) => void }) {
  const isDevMode = (import.meta as any).env?.VITE_WEBVIEW_DEV_MODE === 'true';
  const [sig, setSig] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState('');

  const handleDevConnect = async () => {
    if (!sig.trim()) return;
    setLoading(true);
    setError('');
    try {
      // Simula o fluxo do webview: launch → handshake → cookie __wvs
      const launchRes = await fetch('/api/app/auth/webview-launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Webview-Signature': sig.trim() },
        credentials: 'include',
      });
      if (!launchRes.ok) throw new Error(`Erro ${launchRes.status} — assinatura inválida ou dispositivo não aprovado.`);
      const { launch_token } = await launchRes.json();

      const handshakeRes = await fetch('/api/app/auth/webview-handshake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ launch_token }),
        credentials: 'include',
      });
      if (!handshakeRes.ok) throw new Error(`Erro ${handshakeRes.status} — handshake falhou.`);

      onDevConnect?.(sig.trim());
    } catch (err: any) {
      setError(err.message || 'Falha ao conectar.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0f172a]">
      <div className="text-center px-8 py-12 max-w-sm w-full">
        <Smartphone className="w-14 h-14 text-slate-600 mx-auto mb-4" />
        <h1 className="text-2xl font-black text-white tracking-widest mb-2">DRCAE</h1>

        {isDevMode ? (
          <div className="mt-6 space-y-4 text-left">
            <div className="bg-amber-900/30 border border-amber-700/40 rounded-xl px-4 py-3">
              <p className="text-amber-400 text-xs font-bold uppercase tracking-wider mb-1">Modo Desenvolvimento</p>
              <p className="text-amber-300/80 text-xs">Cole a <code className="font-mono bg-amber-900/40 px-1 rounded">webview_signature</code> do dispositivo para aceder sem a app nativa.</p>
            </div>

            <textarea
              className="w-full bg-slate-800 border border-slate-600 rounded-xl p-3 text-slate-200 text-xs font-mono resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              rows={4}
              placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
              value={sig}
              onChange={e => { setSig(e.target.value); setError(''); }}
            />

            {error && <p className="text-red-400 text-xs">{error}</p>}

            <button
              onClick={handleDevConnect}
              disabled={loading || !sig.trim()}
              className="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition-colors"
            >
              {loading ? 'A conectar...' : 'Conectar com Assinatura'}
            </button>
          </div>
        ) : (
          <>
            <p className="text-slate-400 text-sm leading-relaxed mt-4">
              Esta aplicação só está disponível através da app <strong className="text-slate-300">DRCAE</strong> instalada no dispositivo.
            </p>
            <p className="text-slate-600 text-xs mt-4">Acesso directo via browser não é permitido.</p>
          </>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [devicePending, setDevicePending] = useState(false);
  // null = a verificar; true = sessão válida; false = sem sessão webview
  const [webviewReady, setWebviewReady] = useState<boolean | null>(null);
  const [authToast, setAuthToast] = useState<string | null>(null);

  // Handshake webview e restauração de sessão
  useEffect(() => {
    async function initSession() {
      // 1. Restaurar chave criptográfica se houver no sessionStorage
      const savedKeyHex = sessionStorage.getItem('drcae_session_key');
      if (savedKeyHex) {
        try {
          await crypto.restoreSessionKey(savedKeyHex);
          setIsAuthenticated(true);
        } catch (err) {
          console.error('[drcae] Falha ao restaurar chave criptográfica:', err);
          sessionStorage.removeItem('drcae_session_key');
        }
      }

      // 2. Handshake webview — troca o ?wvt= pelo cookie __wvs
      const params = new URLSearchParams(window.location.search);
      const wvt = params.get('wvt');
      if (wvt) {
        try {
          await fetch('/api/app/auth/webview-handshake', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ launch_token: wvt }),
            credentials: 'include',
          });
          // Remove ?wvt= da URL sem recarregar
          params.delete('wvt');
          const newSearch = params.toString();
          window.history.replaceState({}, '', window.location.pathname + (newSearch ? '?' + newSearch : ''));
          setWebviewReady(true);
        } catch {
          setWebviewReady(false);
        }
      } else {
        // Sem ?wvt= — pode ter cookie __wvs válido (re-entradas após handshake já feito)
        // O NGINX valida; se chegou aqui, o cookie já é válido
        setWebviewReady(true);
      }
    }
    initSession();
  }, []);

  // Escutar expiração de token
  useEffect(() => {
    const handleAuthExpired = () => {
      setIsAuthenticated(false);
      crypto.setActiveKey(null);
      customAlert.warning('Sessão Expirada', 'A sua sessão expirou. Por favor, inicie sessão novamente.');
    };
    window.addEventListener('auth-expired', handleAuthExpired);
    return () => window.removeEventListener('auth-expired', handleAuthExpired);
  }, []);

  // Escutar dispositivo pendente de aprovação
  useEffect(() => {
    const handler = () => setDevicePending(true);
    window.addEventListener('device-pending-approval', handler);
    return () => window.removeEventListener('device-pending-approval', handler);
  }, []);

  // Sync automático quando volta a ficar online
  useEffect(() => {
    const handleOnline = async () => {
      if (isAuthenticated) {
        console.log('Online detectado! Iniciando sync automático...');
        try {
          await triggerFullSync();
          console.log('Sync automático concluído com sucesso!');
        } catch (err) {
          console.error('Falha ao rodar sync automático:', err);
        }
      }
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [isAuthenticated]);

  const handleLogin = async () => {
    setIsAuthenticated(true);
    if (navigator.onLine) {
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

  const handleLogout = () => {
    api.logout().catch(() => {});
    crypto.setActiveKey(null);
    setIsAuthenticated(false);
    setDevicePending(false);
  };

  if (webviewReady === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0f172a]">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
          <span className="text-xs text-slate-500 font-semibold uppercase tracking-wider">A iniciar sessão...</span>
        </div>
      </div>
    );
  }

  if (!webviewReady) {
    return <WebviewRequired onDevConnect={() => setWebviewReady(true)} />;
  }

  if (!isAuthenticated) {
    return <LoginPage onLogin={handleLogin} />;
  }

  if (devicePending) {
    return <AwaitingApprovalScreen onLogout={handleLogout} />;
  }

  return (
    <BrowserRouter basename="/app">
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

          <Route path="settings" element={<SettingsPage onLogout={handleLogout} />} />
          
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
