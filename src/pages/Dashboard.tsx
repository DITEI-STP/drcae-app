import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { 
  Briefcase, 
  ClipboardList, 
  AlertTriangle, 
  Users, 
  Calendar, 
  Wifi, 
  WifiOff, 
  Activity, 
  ArrowRight, 
  ShieldAlert,
  Plus,
  DownloadCloud
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '../lib/utils';
import { WEBVIEW_APK_DOWNLOAD_URL } from '../lib/webviewApk';

// Helper determinístico para iniciais e gradientes de firmas
const getAvatarData = (name: string, nif: string) => {
  const cleanName = (name || 'Firma').trim();
  const initials = cleanName
    .split(/\s+/)
    .filter(w => w)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('');

  const seed = nif || name || 'Firma';
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }

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

// Helper determinístico para iniciais e gradientes dos membros da equipa
const getMemberAvatar = (name: string) => {
  const cleanName = (name || 'Técnico').trim();
  const initials = cleanName
    .split(/\s+/)
    .filter(w => w)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('');

  let hash = 0;
  for (let i = 0; i < cleanName.length; i++) {
    hash = cleanName.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  const gradients = [
    'from-blue-500 to-indigo-600',
    'from-purple-500 to-pink-500',
    'from-teal-500 to-emerald-600',
    'from-orange-500 to-amber-600',
    'from-violet-500 to-purple-600'
  ];
  const gradientIndex = Math.abs(hash) % gradients.length;
  return { initials: initials || 'T', gradient: gradients[gradientIndex] };
};

export default function Dashboard() {
  const [isOnline, setIsOnline] = React.useState(navigator.onLine);
  const [equipe, setEquipe] = React.useState<string[]>([]);

  React.useEffect(() => {
    const up = () => setIsOnline(true);
    const down = () => setIsOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);

  React.useEffect(() => {
    const saved = localStorage.getItem('drcae_equipe');
    if (saved) {
      try {
        setEquipe(JSON.parse(saved));
      } catch (e) {
        setEquipe([]);
      }
    }
  }, []);

  // Live query unificada com estatísticas, pendentes de sync, atividades recentes e firmas novas
  const stats = useLiveQuery(async () => {
    const firmasCount = await db.firmas.count();
    const visitasCount = await db.visitas.count();
    const infracoesCount = await db.infracoes.count();

    const allVisitas = await db.visitas.toArray();
    const pendingVisitas = allVisitas.filter(v => !v.synced).length;

    // Ordena visitas por data e hora decrescente
    const sortedVisitas = allVisitas.sort((a, b) => {
      const dateTimeA = new Date(`${a.date}T${a.time || '00:00:00'}`).getTime();
      const dateTimeB = new Date(`${b.date}T${b.time || '00:00:00'}`).getTime();
      return dateTimeB - dateTimeA;
    });

    // Mapeia o nome dos operadores
    const recentVisitasRaw = sortedVisitas.slice(0, 3);
    const recentVisitas = await Promise.all(
      recentVisitasRaw.map(async (v) => {
        const f = await db.firmas.get(v.firmaId);
        return {
          ...v,
          firmaName: f?.name || 'Firma Desconhecida'
        };
      })
    );

    // Obtém firmas recentes
    const allFirmas = await db.firmas.toArray();
    const recentFirmas = allFirmas
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .slice(0, 3);

    return {
      firmas: firmasCount,
      visitas: visitasCount,
      infracoes: infracoesCount,
      pendingVisitas,
      recentVisitas,
      recentFirmas
    };
  }, [], { firmas: 0, visitas: 0, infracoes: 0, pendingVisitas: 0, recentVisitas: [], recentFirmas: [] });

  const isDirectBrowser = React.useMemo(() => {
    return !window.navigator.userAgent.includes('DrcaeWebview');
  }, []);

  const hasDefined = localStorage.getItem('drcae_equipe_definida') === 'true';

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'Bom dia';
    if (hour >= 12 && hour < 18) return 'Boa tarde';
    return 'Boa noite';
  };

  const getFormattedDate = () => {
    const options: Intl.DateTimeFormatOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    return new Date().toLocaleDateString('pt-PT', options);
  };

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-5 bg-[#F8FAFC] dark:bg-slate-950 pb-24">
      
      {/* Browser Access Warning / APK Download Banner */}
      {isDirectBrowser && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-slate-900/50 dark:to-indigo-950/20 p-4 rounded-3xl border border-blue-100 dark:border-indigo-900/30 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 text-slate-700 dark:text-slate-350">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0 mt-0.5 shadow-3xs">
              <DownloadCloud className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-slate-900 dark:text-slate-100 text-xs sm:text-sm">Aceder através da App Oficial</h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold leading-relaxed mt-0.5">
                Está a aceder via navegador. Para uma melhor experiência, suporte offline resiliente e integração nativa, instale a nossa aplicação móvel.
              </p>
            </div>
          </div>
          <a
            href={WEBVIEW_APK_DOWNLOAD_URL}
            download
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-bold rounded-xl text-xs shadow-md transition-all shrink-0 cursor-pointer w-full sm:w-auto justify-center"
          >
            <span>Descarregar APK</span>
          </a>
        </div>
      )}

      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 p-6 rounded-3xl shadow-xl text-white relative overflow-hidden shrink-0 border border-indigo-900/40">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-indigo-500/10 via-transparent to-transparent pointer-events-none" />
        <div className="relative flex justify-between items-start">
          <div className="space-y-1.5">
            <span className="text-[9px] font-extrabold uppercase tracking-widest text-indigo-400 bg-indigo-950/80 px-2.5 py-1 rounded-full border border-indigo-900/60 inline-block">
              Portal do Agente
            </span>
            <h2 className="text-xl font-black tracking-tight">{getGreeting()}, Agente!</h2>
            <p className="text-slate-400 text-[11px] font-semibold capitalize flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-indigo-400" />
              {getFormattedDate()}
            </p>
          </div>
          
          <div className={cn(
            "flex items-center gap-1.5 px-3 py-1 rounded-full text-[9px] font-extrabold uppercase tracking-wider border",
            isOnline 
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" 
              : "bg-orange-500/10 border-orange-500/30 text-orange-400"
          )}>
            {isOnline ? (
              <>
                <Wifi className="w-3 h-3 text-emerald-400 animate-pulse" />
                <span>Online</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3 h-3 text-orange-400" />
                <span>Offline</span>
              </>
            )}
          </div>
        </div>

        {/* Alerta de Registros Pendentes de Sync */}
        {stats.pendingVisitas > 0 && (
          <div className="mt-5 p-3.5 bg-orange-500/15 border border-orange-500/25 rounded-2xl flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-orange-300 font-semibold">
              <AlertTriangle className="w-4 h-4 text-orange-400 shrink-0 animate-bounce" />
              <span>Tem {stats.pendingVisitas} {stats.pendingVisitas === 1 ? 'fiscalização pendente' : 'fiscalizações pendentes'} de sincronização.</span>
            </div>
            <Link to="/visitas" className="px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white font-extrabold rounded-lg text-[9px] uppercase tracking-wider transition-colors shadow-xs shrink-0">
              Sincronizar
            </Link>
          </div>
        )}
      </div>

      {/* Grid de Estatísticas */}
      <div className="grid grid-cols-2 gap-4">
        {/* Operadores */}
        <Link to="/firmas" className="bg-white dark:bg-slate-900 p-4.5 rounded-2xl shadow-xs border border-slate-200/80 dark:border-slate-800 hover:-translate-y-1 hover:shadow-md hover:border-blue-300 dark:hover:border-blue-900/40 transition-all duration-300 flex flex-col justify-between group">
          <div className="flex justify-between items-start w-full">
            <div className="w-9 h-9 bg-blue-50 dark:bg-blue-950/20 rounded-xl flex items-center justify-center text-blue-600 dark:text-blue-400 group-hover:scale-105 transition-transform">
              <Briefcase className="w-4.5 h-4.5" />
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors" />
          </div>
          <div className="mt-3">
            <p className="text-2xl font-black text-slate-900 dark:text-slate-100 leading-tight">{stats.firmas}</p>
            <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block mt-0.5">Operadores</p>
          </div>
        </Link>

        {/* Fiscalizações */}
        <Link to="/visitas" className="bg-white dark:bg-slate-900 p-4.5 rounded-2xl shadow-xs border border-slate-200/80 dark:border-slate-800 hover:-translate-y-1 hover:shadow-md hover:border-emerald-300 dark:hover:border-emerald-900/40 transition-all duration-300 flex flex-col justify-between group">
          <div className="flex justify-between items-start w-full">
            <div className="w-9 h-9 bg-emerald-50 dark:bg-emerald-950/20 rounded-xl flex items-center justify-center text-emerald-600 dark:text-emerald-450 group-hover:scale-105 transition-transform">
              <ClipboardList className="w-4.5 h-4.5" />
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-emerald-500 dark:group-hover:text-emerald-400 transition-colors" />
          </div>
          <div className="mt-3">
            <p className="text-2xl font-black text-slate-900 dark:text-slate-100 leading-tight">{stats.visitas}</p>
            <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block mt-0.5">Fiscalizações</p>
          </div>
        </Link>

        {/* Infrações */}
        <div className="bg-white dark:bg-slate-900 p-4.5 rounded-2xl shadow-xs border border-slate-200/80 dark:border-slate-800 flex flex-col justify-between">
          <div className="w-9 h-9 bg-red-50 dark:bg-red-950/20 rounded-xl flex items-center justify-center text-red-550 dark:text-red-400">
            <ShieldAlert className="w-4.5 h-4.5" />
          </div>
          <div className="mt-3">
            <p className="text-2xl font-black text-slate-900 dark:text-slate-100 leading-tight">{stats.infracoes}</p>
            <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block mt-0.5">Infrações</p>
          </div>
        </div>

        {/* Equipa */}
        <Link to="/equipe" className="bg-white dark:bg-slate-900 p-4.5 rounded-2xl shadow-xs border border-slate-200/80 dark:border-slate-800 hover:-translate-y-1 hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-900/40 transition-all duration-300 flex flex-col justify-between group">
          <div className="flex justify-between items-start w-full">
            <div className="w-9 h-9 bg-indigo-50 dark:bg-indigo-950/20 rounded-xl flex items-center justify-center text-indigo-650 dark:text-indigo-400 group-hover:scale-105 transition-transform">
              <Users className="w-4.5 h-4.5" />
            </div>
            <ArrowRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-indigo-500 dark:group-hover:text-indigo-400 transition-colors" />
          </div>
          <div className="mt-3">
            <p className="text-2xl font-black text-slate-900 dark:text-slate-100 leading-tight">{equipe.length}</p>
            <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest block mt-0.5">Equipa Ativa</p>
          </div>
        </Link>
      </div>

      {/* Fiscalizações Recentes (Timeline) */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl shadow-xs border border-slate-200/80 dark:border-slate-800 space-y-4">
         <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2">
               <Activity className="w-4.5 h-4.5 text-emerald-500" />
               <h3 className="font-bold text-xs text-slate-800 dark:text-slate-200 uppercase tracking-wider">Atividades Recentes</h3>
            </div>
            <Link to="/visitas" className="text-[11px] font-extrabold text-indigo-600 dark:text-indigo-450 hover:underline">Ver Todas</Link>
         </div>

         {stats.recentVisitas.length === 0 ? (
            <p className="text-xs text-slate-400 dark:text-slate-500 py-2">Nenhuma fiscalização recente registada.</p>
         ) : (
            <div className="space-y-4">
               {stats.recentVisitas.map((v, i) => {
                  let statusBg = 'bg-emerald-500';
                  let statusText = 'Regularizado';
                  if (v.status === 'Infrações') {
                     statusBg = 'bg-red-500';
                     statusText = 'Infrações';
                  } else if (v.status === 'Inconformes') {
                     statusBg = 'bg-amber-500';
                     statusText = 'Inconformes';
                  }

                  return (
                     <Link key={v.id} to={`/visitas/${v.id}`} className="flex gap-3 group block">
                        <div className="flex flex-col items-center">
                           <div className={cn("w-2 h-2 rounded-full shrink-0 mt-1.5 ring-4 ring-offset-2 ring-offset-white dark:ring-offset-slate-900", 
                              v.status === 'Infrações' ? 'ring-red-100 dark:ring-red-950/40 bg-red-500' :
                              v.status === 'Inconformes' ? 'ring-amber-100 dark:ring-amber-950/40 bg-amber-500' :
                              'ring-emerald-100 dark:ring-emerald-950/40 bg-emerald-500'
                           )} />
                           {i < stats.recentVisitas.length - 1 && <div className="w-0.5 flex-1 bg-slate-100 dark:bg-slate-800/80 my-1" />}
                        </div>
                        <div className="flex-1 min-w-0">
                           <h4 className="font-bold text-slate-800 dark:text-slate-100 text-xs group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors truncate">{v.firmaName}</h4>
                           <div className="flex items-center gap-2 mt-1">
                              <span className="text-[9px] text-slate-400 dark:text-slate-500 font-semibold">{v.date} · {v.time}</span>
                              <span className={cn(
                                 "text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md",
                                 v.status === 'Infrações' 
                                   ? "bg-red-50 text-red-750 dark:bg-red-950/20 dark:text-red-400"
                                   : v.status === 'Inconformes'
                                   ? "bg-amber-50 text-amber-700 dark:bg-amber-950/20 dark:text-amber-400"
                                   : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400"
                              )}>
                                 {statusText}
                              </span>
                           </div>
                        </div>
                     </Link>
                  );
               })}
            </div>
         )}
      </div>

      {/* Operadores Recentes */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl shadow-xs border border-slate-200/80 dark:border-slate-800 space-y-4">
         <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2">
               <Briefcase className="w-4.5 h-4.5 text-indigo-650 dark:text-indigo-400" />
               <h3 className="font-bold text-xs text-slate-800 dark:text-slate-200 uppercase tracking-wider">Últimos Operadores</h3>
            </div>
            <Link to="/firmas" className="text-[11px] font-extrabold text-indigo-600 dark:text-indigo-455 hover:underline">Ver Todos</Link>
         </div>

         {stats.recentFirmas.length === 0 ? (
            <p className="text-xs text-slate-400 dark:text-slate-500 py-2">Nenhum operador registado ainda.</p>
         ) : (
            <div className="grid grid-cols-3 gap-3">
               {stats.recentFirmas.map((f) => {
                  const avatar = getAvatarData(f.name, f.nif);
                  return (
                     <Link key={f.id} to={`/firmas/${f.id}`} className="bg-slate-50 dark:bg-slate-950/30 border border-slate-200/60 dark:border-slate-850 p-3 rounded-xl flex flex-col items-center text-center gap-1.5 hover:shadow-2xs hover:border-slate-300 dark:hover:border-slate-750 transition-all">
                        <div className={cn(
                           "w-9 h-9 rounded-full flex items-center justify-center text-white font-black text-[10px] shadow-sm bg-gradient-to-br",
                           avatar.gradient
                        )}>
                           {avatar.initials}
                        </div>
                        <p className="font-bold text-[10px] text-slate-800 dark:text-slate-200 line-clamp-1 w-full leading-tight">{f.name}</p>
                        <span className="text-[8px] tracking-wide font-extrabold uppercase bg-slate-200/60 dark:bg-slate-850 text-slate-500 dark:text-slate-405 px-1.5 py-0.5 rounded-md mt-0.5 shrink-0 truncate max-w-[80px]">
                           {f.district}
                        </span>
                     </Link>
                  );
               })}
            </div>
         )}
      </div>

      {/* Seccao de Equipa Diaria */}
      <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl shadow-xs border border-slate-200/80 dark:border-slate-800 text-left space-y-3">
         <div className="flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-2.5">
            <div className="flex items-center gap-2">
               <Users className="w-4.5 h-4.5 text-indigo-650 dark:text-indigo-400" />
               <h3 className="font-bold text-xs text-slate-800 dark:text-slate-200 uppercase tracking-wider">Equipa Escalada</h3>
            </div>
            <Link to="/equipe" className="text-[11px] font-extrabold text-indigo-600 dark:text-indigo-455 hover:underline">Ver Escala</Link>
         </div>
         <div className="flex flex-wrap gap-2 pt-1">
            {equipe.length === 0 ? (
               <p className="text-xs text-slate-400 dark:text-slate-500">Nenhum técnico escalado para hoje.</p>
            ) : (
               equipe.map((m, i) => {
                  const memberGeo = getMemberAvatar(m);
                  return (
                     <span key={i} className="text-xs font-semibold px-2.5 py-1.5 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 rounded-full flex items-center gap-1.5 shadow-3xs">
                        <div className={cn("w-5 h-5 rounded-full flex items-center justify-center text-white text-[8px] font-black bg-gradient-to-br", memberGeo.gradient)}>
                           {memberGeo.initials}
                        </div>
                        {m}
                     </span>
                  );
               })
            )}
         </div>
         <p className="text-[10px] text-slate-450 dark:text-slate-500 leading-normal font-semibold flex items-center gap-1 pt-1.5 border-t border-slate-50 dark:border-slate-850">
            {!hasDefined ? (
               <span className="text-amber-600 font-bold">⚠️ É necessário configurar e definir a equipa antes de iniciar fiscalizações!</span>
            ) : (
               <span>✦ O trabalho registado hoje será devidamente certificado juridicamente com base nesta equipa ativa.</span>
            )}
         </p>
      </div>
      
      {/* Ações Rápidas */}
      <div className="pt-2">
        <div className="grid grid-cols-2 gap-3">
          <Link to="/visitas/nova" className="flex items-center justify-center gap-2 p-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-lg shadow-blue-500/15 hover:shadow-blue-500/25 transition-all hover:scale-[1.02] active:scale-95 text-center">
            <span className="font-bold uppercase text-[10px] tracking-widest">Nova Fiscalização</span>
            <Plus className="w-4 h-4 shrink-0" />
          </Link>
          <Link to="/equipe" className="flex items-center justify-center gap-2 p-3.5 bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-750 text-white rounded-xl shadow-md transition-all hover:scale-[1.02] active:scale-95 text-center">
            <span className="font-bold uppercase text-[10px] tracking-widest">Escalar Equipa</span>
            <Users className="w-4 h-4 text-indigo-400 shrink-0" />
          </Link>
        </div>
      </div>

    </div>
  );
}
