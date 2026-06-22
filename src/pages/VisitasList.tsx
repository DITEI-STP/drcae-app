import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { Search, Plus, Calendar, ShieldAlert } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { cn } from '../lib/utils';

export default function VisitasList() {
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  const visitas = useLiveQuery(
    async () => {
      let vArr = await db.visitas.toArray();
      // To display firma name, we need to join
      const comFirma = await Promise.all(vArr.map(async (v) => {
         const firma = await db.firmas.get(v.firmaId);
         return { ...v, firmaName: firma?.name || 'Firma Desconhecida' };
      }));

      comFirma.sort((a,b) => new Date(`${b.date}T${b.time}`).getTime() - new Date(`${a.date}T${a.time}`).getTime());

      if (search) {
        return comFirma.filter(v => v.firmaName.toLowerCase().includes(search.toLowerCase()) || v.id?.includes(search));
      }
      return comFirma;
    },
    [search]
  );

  return (
    <div className="p-4 flex flex-col h-full space-y-4 relative">
      <div className="flex gap-2 shrink-0">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5" />
          <input 
            type="text" 
            placeholder="Procurar visita..." 
            className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 pb-8 custom-scrollbar">
        {visitas?.length === 0 ? (
          <div className="text-center py-10 text-slate-500">
            <ClipboardList className="w-12 h-12 mx-auto text-slate-300 mb-3" />
            <p className="font-medium">Nenhuma visita registada</p>
          </div>
        ) : (
          visitas?.map(v => (
            <Link key={v.id} to={`/visitas/${v.id}`} className="block bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
               <div className="flex items-start justify-between">
                  <div className="flex-1 pr-3">
                     <p className="text-[10px] text-slate-400 font-mono mb-1">#{v.id?.substring(0,8).toUpperCase()}</p>
                     <h3 className="font-bold text-slate-800 text-sm leading-tight line-clamp-2">{v.firmaName}</h3>
                  </div>
                  <span className={cn(
                        "text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-md shrink-0",
                        v.status === 'Inconformes' ? "bg-amber-100 text-amber-800" :
                        v.status === 'Infrações' ? "bg-red-100 text-red-800" :
                        "bg-emerald-100 text-emerald-800"
                     )}>
                        {v.status}
                  </span>
               </div>
               <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                  <div className="flex items-center gap-1.5">
                     <Calendar className="w-3.5 h-3.5 text-slate-400" />
                     {v.date}
                  </div>
                  <div className="flex items-center gap-1.5 border border-slate-200 px-2 py-0.5 rounded bg-slate-50">
                     <ShieldAlert className="w-3.5 h-3.5 text-slate-400" />
                     {v.technicians.length} Téc.
                  </div>
               </div>
            </Link>
          ))
        )}
      </div>

      <button 
        onClick={() => navigate('/visitas/nova')}
        className="fixed md:absolute bottom-20 md:bottom-6 right-6 w-14 h-14 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full flex items-center justify-center shadow-xl shadow-indigo-600/35 transition-all hover:scale-105 active:scale-95 z-30 group animate-bounce"
        title="Registar Nova Fiscalização"
        id="fab-nova-visita"
      >
        <Plus className="w-6 h-6 transition-transform group-hover:rotate-90 duration-200" />
      </button>
    </div>
  );
}

// Ensure ClipboardList is imported inside component or file scope if used. Let me add import for it.
import { ClipboardList } from 'lucide-react';
