import React, { useEffect, useState } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { Home, Briefcase, ClipboardList, Settings, WifiOff, RefreshCw, Map as MapIcon, Users } from 'lucide-react';
import { cn } from '../lib/utils';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';

const navItems = [
  { to: '/', icon: Home, label: 'Início' },
  { to: '/firmas', icon: Briefcase, label: 'Firmas' },
  { to: '/visitas', icon: ClipboardList, label: 'Visitas' },
  { to: '/equipe', icon: Users, label: 'Equipe' },
  { to: '/mapa', icon: MapIcon, label: 'Mapa' },
  { to: '/settings', icon: Settings, label: 'Sistema' },
];

export default function Layout() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const location = useLocation();

  const syncQueueCount = useLiveQuery(() => db.syncQueue.count(), []) || 0;

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

  useEffect(() => {
    if (isOnline && syncQueueCount > 0) {
      syncData();
    }
  }, [isOnline, syncQueueCount]);

  const syncData = async () => {
    setIsSyncing(true);
    try {
      // Simulate network sync delay
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // In a real app, you would send db.syncQueue items to the backend here
      // For now, we just clear the queue
      await db.syncQueue.clear();
      
      // Mark local records as synced
      await db.firmas.where('synced').equals(0).modify({ synced: true });
      await db.visitas.where('synced').equals(0).modify({ synced: true });
      
    } catch (error) {
      console.error('Failed to sync', error);
    } finally {
      setIsSyncing(false);
    }
  };

  const getPageTitle = () => {
    if (location.pathname === '/') return 'Dashboard';
    if (location.pathname.startsWith('/firmas')) return 'Firmas';
    if (location.pathname.startsWith('/visitas')) return 'Fiscalizações';
    if (location.pathname.startsWith('/equipe')) return 'Equipa Diária';
    if (location.pathname === '/settings') return 'Sistema';
    return 'DRCAE Mobile';
  };

  return (
    <div className="flex flex-col h-screen bg-[#F5F7FA] text-slate-800 overflow-hidden font-sans">
      {/* Header */}
      <header className="h-16 bg-[#1A1C1E] text-white px-4 md:px-6 py-3 flex items-center justify-between shadow-md z-10 shrink-0 safe-top">
        <div className="flex items-center gap-3 md:gap-4">
          <div className="w-8 h-8 bg-emerald-500 rounded flex items-center justify-center font-bold text-white uppercase cursor-pointer">
            F
          </div>
          <h1 className="text-lg font-semibold tracking-tight uppercase truncate max-w-[150px] md:max-w-none">
            Fiscalis <span className="text-slate-400 font-normal block md:inline text-xs md:text-lg leading-none mt-0.5 md:mt-0">Field v2.4</span>
          </h1>
        </div>
        <div className="flex items-center gap-3 md:gap-6">
          {!isOnline && (
            <div className="flex items-center gap-1.5 md:gap-2 px-2 md:px-3 py-1 bg-red-900/40 border border-red-500/50 rounded-full text-xs text-red-400 font-medium">
              <WifiOff className="w-3.5 h-3.5 md:w-3 md:h-3" />
              <span className="hidden md:inline">Offline</span>
            </div>
          )}
          {isOnline && syncQueueCount > 0 && (
            <div className="flex items-center gap-1.5 md:gap-2 px-2 md:px-3 py-1 bg-emerald-900/40 border border-emerald-500/50 rounded-full text-xs text-emerald-400 font-medium cursor-pointer hover:bg-emerald-800/60" onClick={syncData}>
              <RefreshCw className={cn("w-3.5 h-3.5 md:w-3 md:h-3", isSyncing && "animate-spin")} />
              <span>{syncQueueCount} <span className="hidden md:inline">pendentes</span></span>
            </div>
          )}
          {isOnline && syncQueueCount === 0 && (
            <div className="hidden md:flex items-center gap-2 px-3 py-1 bg-emerald-900/40 border border-emerald-500/50 rounded-full text-xs text-emerald-400 font-medium">
              <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
              Sincronização Ativa
            </div>
          )}
          <div className="hidden md:flex items-center gap-3 border-l border-slate-700 pl-6">
            <div className="text-right">
              <p className="text-xs font-bold leading-none">Agente Carvalho</p>
              <p className="text-[10px] text-slate-400 leading-none mt-1">Inspeção - Sul</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-slate-700"></div>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Vertical Sidebar Navigation (Tablet & Desktop) */}
        <nav className="hidden md:flex flex-col w-20 bg-white border-r border-slate-200 items-center py-6 gap-6 z-20 shrink-0">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => cn(
                "flex flex-col items-center justify-center p-3 rounded-xl transition-colors",
                isActive ? "bg-blue-50 text-blue-600 font-bold" : "text-slate-500 hover:text-slate-800 hover:bg-slate-50"
              )}
            >
              <item.icon className="w-6 h-6 mb-1" />
              <span className="text-[10px] uppercase tracking-wide">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Main Content Area */}
        <main className="flex flex-col flex-1 overflow-hidden pb-[calc(env(safe-area-inset-bottom)+70px)] md:pb-0">
          <div className="flex flex-col flex-1 max-w-screen-md mx-auto w-full h-full">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Bottom Navigation (Mobile Only) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 pb-safe z-20 shrink-0">
        <div className="flex justify-around max-w-screen-md mx-auto">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => cn(
                "flex flex-col items-center py-3 px-4 w-full transition-colors",
                isActive ? "text-blue-600 font-bold" : "text-slate-500 hover:text-slate-800"
              )}
            >
              <item.icon className={cn("w-6 h-6 mb-1")} />
              <span className="text-[10px] uppercase tracking-wide">{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
