import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { Search, MapPin, Building, Plus } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

export default function FirmasList() {
  const [search, setSearch] = useState('');
  const navigate = useNavigate();
  
  const firmas = useLiveQuery(
    async () => {
      let list = await db.firmas.toArray();
      if (search) {
        list = list.filter(f => f.name.toLowerCase().includes(search.toLowerCase()) || f.nif.includes(search));
      }
      
      const enriched = await Promise.all(list.map(async (firma) => {
        const visitas = await db.visitas.where('firmaId').equals(firma.id!).toArray();
        const numVisitas = visitas.length;
        const numVisitasComInfracoes = visitas.filter(v => v.status === 'Infrações' || v.status === 'Inconformes').length;
        
        const visitasIds = visitas.map(v => v.id!);
        let numInfracoes = 0;
        for (const vid of visitasIds) {
          const infs = await db.infracoes.where('visitaId').equals(vid).toArray();
          numInfracoes += infs.length;
        }

        return {
          ...firma,
          numVisitas,
          numVisitasComInfracoes,
          numInfracoes
        };
      }));

      return enriched;
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
             placeholder="Procurar por NIF ou Nome..." 
             className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
             value={search}
             onChange={(e) => setSearch(e.target.value)}
           />
         </div>
      </div>

      <div className="flex-1 overflow-y-auto space-y-3 pb-8 custom-scrollbar">
        {firmas?.length === 0 ? (
          <div className="text-center py-10 text-slate-500">
            <Building className="w-12 h-12 mx-auto text-slate-300 mb-3" />
            <p className="font-medium">Nenhuma firma encontrada</p>
            <p className="text-sm">Os dados podem não ter sido sincronizados.</p>
          </div>
        ) : (
          firmas?.map(firma => (
            <Link key={firma.id} to={`/firmas/${firma.id}`} className="block bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-bold text-sm text-slate-800 leading-tight">{firma.name}</h3>
                  <p className="text-xs text-slate-500 mt-1 font-mono">NIF: {firma.nif}</p>
                </div>
                {firma.numVisitas! > 0 && (
                   <span className="px-2 py-1 bg-blue-50 text-blue-700 text-[10px] rounded uppercase font-bold shrink-0">
                      {firma.numVisitas} VISITAS
                   </span>
                )}
              </div>
              
              <div className="mt-3 flex items-center justify-between">
                 <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-medium">
                   <MapPin className="w-3 h-3" />
                   <span className="truncate max-w-[150px] uppercase">{firma.address || firma.district}</span>
                 </div>
                 
                 {(firma.numInfracoes! > 0 || firma.numVisitasComInfracoes! > 0) && (
                    <div className="flex items-center gap-2">
                       {firma.numVisitasComInfracoes! > 0 && (
                          <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500 border border-slate-200 bg-slate-50 px-1.5 py-0.5 rounded">
                             <span className="text-red-500">{firma.numVisitasComInfracoes}</span> Vc/Infr.
                          </div>
                       )}
                       {firma.numInfracoes! > 0 && (
                          <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500 border border-slate-200 bg-slate-50 px-1.5 py-0.5 rounded">
                             <span className="text-red-500">{firma.numInfracoes}</span> Infr. Totais
                          </div>
                       )}
                    </div>
                 )}
              </div>
            </Link>
          ))
        )}
      </div>

      <button 
        onClick={() => navigate('/firmas/nova')}
        className="fixed md:absolute bottom-20 md:bottom-6 right-6 w-14 h-14 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full flex items-center justify-center shadow-xl shadow-indigo-600/35 transition-all hover:scale-105 active:scale-95 z-30 group animate-bounce"
        title="Registar Nova Firma"
        id="fab-nova-firma"
      >
        <Plus className="w-6 h-6 transition-transform group-hover:rotate-90 duration-200" />
      </button>
    </div>
  );
}
