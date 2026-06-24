import React, { useCallback, useEffect, useState, useRef } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Home, Briefcase, ClipboardList, Settings, WifiOff, RefreshCw, Map as MapIcon, Users, Sun, Moon, Laptop, LogOut, Maximize, Minimize } from 'lucide-react';
import { cn } from '../lib/utils';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { triggerFullSync } from '../lib/sync';
import { useAppRealtime } from '../lib/realtime';
import PwaBanners from './PwaBanners';
import { useTheme } from '../hooks/useTheme';
import { toast } from '../lib/notifications';

const navItems = [
  { to: '/', icon: Home, label: 'Início' },
  { to: '/firmas', icon: Briefcase, label: 'Firmas' },
  { to: '/visitas', icon: ClipboardList, label: 'Visitas' },
  { to: '/equipe', icon: Users, label: 'Equipe' },
  { to: '/mapa', icon: MapIcon, label: 'Mapa' },
  { to: '/settings', icon: Settings, label: 'Sistema' },
];

interface LayoutProps {
  onLogout: () => void;
}

function getInitials(name: string): string {
  return name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();
}

export default function Layout({ onLogout }: LayoutProps) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncErrorMsg, setSyncErrorMsg] = useState<string | null>(null);
  const [syncNeedsAuth, setSyncNeedsAuth] = useState(false);
  const [showAvatarMenu, setShowAvatarMenu] = useState(false);
  const { theme, setTheme } = useTheme();
  const avatarRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const [showFullscreenBtn, setShowFullscreenBtn] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const officerInfo = (() => {
    try { return JSON.parse(localStorage.getItem('drcae_officer_info') || 'null'); } catch { return null; }
  })();
  const officerName: string = officerInfo?.name ?? 'Agente';
  const officerInitials = getInitials(officerName);

  // Contagem real de itens não sincronizados (não o audit log syncQueue)
  const unsyncedCount = useLiveQuery(async () => {
    const [f, v, i, a] = await Promise.all([
      db.firmas.filter(x => !x.synced).count(),
      db.visitas.filter(x => !x.synced).count(),
      db.infracoes.filter(x => !x.synced).count(),
      db.anexos.filter(x => !x.synced).count(),
    ]);
    return f + v + i + a;
  }, []) || 0;

  const navigate = useNavigate();

  const syncRunningRef = useRef(false);

  const syncData = useCallback(async () => {
    if (syncRunningRef.current) return;
    syncRunningRef.current = true;
    setIsSyncing(true);
    setSyncErrorMsg(null);
    setSyncNeedsAuth(false);
    try {
      const result = await triggerFullSync();
      if (result.needsAuth) {
        setSyncNeedsAuth(true);
      } else if (result.errors && result.errors.length > 0) {
        // Erros de rejeição pelo servidor (ex: operador não encontrado, data inválida)
        console.error('[drcae] Erros de sincronização do servidor:', result.errors);
        setSyncErrorMsg(`${result.errors.length} registo(s) rejeitado(s) pelo servidor. Verifique a consola para detalhes.`);
      }
    } catch (err) {
      setSyncErrorMsg('Falha ao sincronizar. Será tentado novamente quando a ligação for restaurada.');
      console.error('[drcae] Falha ao sincronizar:', err);
    } finally {
      setIsSyncing(false);
      syncRunningRef.current = false;
    }
  }, []);

  useAppRealtime({
    enabled: isOnline,
    officerUid: officerInfo?.uid ?? null,
    onSyncRequested: syncData,
  });

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // ── Sync ao ficar online ──────────────────────────────────────────────
  // Dispara apenas quando a transição online→offline→online ocorre.
  // NÃO depende de unsyncedCount — evita o loop de re-renders.
  useEffect(() => {
    if (isOnline) {
      syncData();
    }
  }, [isOnline, syncData]);

  // ── Sync periódico — fallback se Centrifugo falhar ────────────────────
  // Intervalo de 15 minutos. Não corre se já há sync em curso.
  useEffect(() => {
    if (!isOnline) return;
    const FIFTEEN_MIN = 15 * 60 * 1000;
    const id = setInterval(() => {
      syncData();
    }, FIFTEEN_MIN);
    return () => clearInterval(id);
  }, [isOnline, syncData]);

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (avatarRef.current && !avatarRef.current.contains(e.target as Node)) {
        setShowAvatarMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

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

  const cycleTheme = () => {
    if (theme === 'auto') {
      setTheme('light');
      toast.info('Tema definido para Claro');
    } else if (theme === 'light') {
      setTheme('dark');
      toast.info('Tema definido para Escuro');
    } else {
      setTheme('auto');
      toast.info('Tema definido para Automático');
    }
  };

  return (
    <div className="flex flex-col h-screen bg-[#F5F7FA] dark:bg-slate-950 text-slate-800 dark:text-slate-100 overflow-hidden font-sans">
      <PwaBanners />
      {syncNeedsAuth && (
        <div className="flex items-center justify-between gap-3 px-4 py-2 bg-amber-600 text-white text-xs font-medium shrink-0">
          <span>Dados guardados localmente. Sessão inativa — inicie sessão para sincronizar.</span>
          <button
            onClick={() => { setSyncNeedsAuth(false); onLogout(); }}
            className="px-2 py-0.5 rounded bg-amber-800/60 hover:bg-amber-800 transition-colors shrink-0 whitespace-nowrap"
          >
            Re-autenticar
          </button>
        </div>
      )}
      {syncErrorMsg && (
        <div className="flex items-center justify-between gap-3 px-4 py-2 bg-red-700 text-white text-xs font-medium shrink-0">
          <span>{syncErrorMsg}</span>
          <button
            onClick={() => setSyncErrorMsg(null)}
            className="p-1 rounded-full hover:bg-red-600 transition-colors shrink-0"
            aria-label="Fechar"
          >
            ✕
          </button>
        </div>
      )}
      {/* Header */}
      <header className="h-16 bg-[#1A1C1E] text-white px-4 md:px-6 py-3 flex items-center justify-between shadow-md z-10 shrink-0 safe-top">
        <div className="flex items-center gap-3 md:gap-4">
          <div className="w-8 h-8 bg-emerald-500 rounded flex items-center justify-center font-bold text-white uppercase">
            F
          </div>
          <h1 className="text-lg font-semibold tracking-tight uppercase truncate max-w-[150px] md:max-w-none">
            Fiscalis <span className="text-slate-400 font-normal block md:inline text-xs md:text-lg leading-none mt-0.5 md:mt-0">Field</span>
          </h1>
        </div>

        <div className="flex items-center gap-2 md:gap-4">
          {!isOnline && (
            <div className="flex items-center gap-1.5 px-2 md:px-3 py-1 bg-red-900/40 border border-red-500/50 rounded-full text-xs text-red-400 font-medium">
              <WifiOff className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Offline</span>
            </div>
          )}
          {isOnline && unsyncedCount > 0 && (
            <button
              onClick={() => navigate('/pendentes')}
              className="flex items-center gap-1.5 px-2 md:px-3 py-1 bg-amber-900/40 border border-amber-500/50 rounded-full text-xs text-amber-400 font-medium hover:bg-amber-800/60 transition-colors"
            >
              <RefreshCw className={cn('w-3.5 h-3.5', isSyncing && 'animate-spin')} />
              <span>{unsyncedCount} <span className="hidden md:inline">pendentes</span></span>
            </button>
          )}
          {isOnline && unsyncedCount === 0 && (
            <div className="hidden md:flex items-center gap-2 px-3 py-1 bg-emerald-900/40 border border-emerald-500/50 rounded-full text-xs text-emerald-400 font-medium">
              <div className="w-2 h-2 rounded-full bg-emerald-500" />
              Sincronização Ativa
            </div>
          )}

          {/* Fullscreen toggle */}
          {showFullscreenBtn && (
            <button
              onClick={toggleFullscreen}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
              title={isFullscreen ? 'Sair do Ecrã Inteiro' : 'Ecrã Inteiro'}
            >
              {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            </button>
          )}

          {/* Dark mode toggle */}
          <button
            onClick={cycleTheme}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
            title={
              theme === 'auto'
                ? 'Tema: Automático (clique para Claro)'
                : theme === 'light'
                ? 'Tema: Claro (clique para Escuro)'
                : 'Tema: Escuro (clique para Automático)'
            }
          >
            {theme === 'auto' ? (
              <Laptop className="w-4 h-4" />
            ) : theme === 'light' ? (
              <Sun className="w-4 h-4" />
            ) : (
              <Moon className="w-4 h-4" />
            )}
          </button>

          {/* Avatar mobile (initials) — clique → logout directo */}
          <button
            className="md:hidden w-8 h-8 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center"
            onClick={onLogout}
            title="Terminar Sessão"
          >
            {officerInitials}
          </button>

          {/* Avatar desktop com dropdown */}
          <div className="hidden md:flex items-center gap-3 border-l border-slate-700 pl-4 relative" ref={avatarRef}>
            <div className="text-right">
              <p className="text-xs font-bold leading-none">{officerName}</p>
              <p className="text-[10px] text-slate-400 leading-none mt-1">Oficial de Fiscalização</p>
            </div>
            <button
              onClick={() => setShowAvatarMenu(v => !v)}
              className="w-10 h-10 rounded-full bg-indigo-600 text-white text-sm font-bold flex items-center justify-center hover:bg-indigo-500 transition-colors"
              title="Opções de conta"
            >
              {officerInitials}
            </button>

            {showAvatarMenu && (
              <div className="absolute right-0 top-14 w-52 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700">
                  <p className="text-xs font-bold text-slate-800 dark:text-slate-100">{officerName}</p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">Oficial de Fiscalização</p>
                </div>
                <button
                  onClick={() => { setShowAvatarMenu(false); onLogout(); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  Terminar Sessão
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar (Tablet & Desktop) */}
        <nav className="hidden md:flex flex-col w-20 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 items-center py-6 gap-6 z-20 shrink-0">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => cn(
                'flex flex-col items-center justify-center p-3 rounded-xl transition-colors',
                isActive
                  ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-bold'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-800'
              )}
            >
              <item.icon className="w-6 h-6 mb-1" />
              <span className="text-[10px] uppercase tracking-wide">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Main Content */}
        <main className="flex flex-col flex-1 overflow-hidden pb-[calc(env(safe-area-inset-bottom)+70px)] md:pb-0">
          <div className="flex flex-col flex-1 max-w-screen-md mx-auto w-full h-full">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Bottom Navigation (Mobile) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 pb-safe z-20 shrink-0">
        <div className="flex justify-around max-w-screen-md mx-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) => cn(
                'flex flex-col items-center py-3 px-3 w-full transition-colors',
                isActive
                  ? 'text-blue-600 dark:text-blue-400 font-bold'
                  : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100'
              )}
            >
              <item.icon className="w-6 h-6 mb-1" />
              <span className="text-[10px] uppercase tracking-wide">{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
