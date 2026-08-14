import { useLiveQuery } from 'dexie-react-hooks';
import { MapPin, Search, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import ComplaintIcon from '../components/ComplaintIcon';
import { db } from '../db/db';
import { isNewReleasedComplaint } from '../lib/useComplaintRadar';
import ComplaintPriority from '../components/ComplaintPriority';

const PRIORITY = { urgent: 4, high: 3, normal: 2, low: 1 } as const;

export default function Denuncias() {
  const complaints = useLiveQuery(() => db.denuncias.toArray(), []) ?? [];
  const [search, setSearch] = useState('');
  const rows = useMemo(() => complaints
    .filter((item) => {
      const query = search.trim().toLowerCase();
      return !query || `${item.code} ${item.category} ${item.targetName ?? ''}`.toLowerCase().includes(query);
    })
    .sort((a, b) => PRIORITY[b.priority] - PRIORITY[a.priority] || b.releasedAt.localeCompare(a.releasedAt)),
  [complaints, search]);

  return (
    <div className="w-full space-y-5 p-4 pb-28 md:p-6">
      <header>
        <p className="text-[10px] font-black uppercase tracking-[0.22em] text-blue-600 dark:text-blue-400">Trabalho de campo</p>
        <h1 className="mt-1 text-2xl font-black text-slate-900 dark:text-white">Denúncias</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Casos que a triagem libertou para averiguação.</p>
      </header>

      <label className="relative block">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Código, tipologia ou operador" className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-3 text-sm dark:border-slate-800 dark:bg-slate-900" />
      </label>

      {rows.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-200 p-10 text-center dark:border-slate-800">
          <ShieldCheck className="mx-auto h-8 w-8 text-emerald-500" />
          <p className="mt-3 text-sm font-bold text-slate-700 dark:text-slate-200">Nenhuma denúncia por averiguar</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {rows.map((item) => {
            const isNew = !item.fieldOutcome && isNewReleasedComplaint(item.releasedAt);
            return (
              <li key={item.uid}>
                <Link to={`/denuncias/${item.uid}`} className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition active:scale-[0.99] dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-start gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
                      <ComplaintIcon icon={item.categoryIcon} className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="font-mono text-xs font-black text-slate-500">{item.code}</span>
                        {isNew && <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[8px] font-black uppercase text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">Nova</span>}
                      </span>
                      <span className="mt-1 block text-sm font-black text-slate-900 dark:text-white">{item.category}</span>
                      <span className="mt-1 flex items-center gap-1 text-xs text-slate-500"><MapPin className="h-3.5 w-3.5" />{item.targetName ?? 'Local por identificar'}</span>
                    </span>
                    <ComplaintPriority priority={item.priority} />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
