import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Search, ShieldCheck, UserRoundCheck } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import Avatar from '../components/Avatar';
import { db } from '../db/db';
import { useAppGrants } from '../lib/grants';

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function Directory() {
  const [query, setQuery] = useState('');
  const users = useLiveQuery(() => db.utilizadores.orderBy('role').toArray(), []) ?? [];
  const filtered = useMemo(() => {
    const term = normalize(query.trim());
    if (!term) return users;
    return users.filter((user) => normalize(`${user.name} ${user.role}`).includes(term));
  }, [query, users]);

  return (
    <main className="mx-auto max-w-5xl space-y-5 p-4 pb-24 sm:p-6">
      <header className="rounded-2xl bg-gradient-to-br from-slate-900 to-indigo-950 p-5 text-white shadow-lg">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-white/10"><ShieldCheck /></span>
          <div>
            <h1 className="text-xl font-black">Diretório interno</h1>
            <p className="text-xs text-indigo-100">Utilizadores ativos disponíveis mesmo sem ligação.</p>
          </div>
        </div>
      </header>

      <label className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <Search className="h-4 w-4 text-slate-400" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Pesquisar por nome ou função"
          className="min-w-0 flex-1 bg-transparent text-sm outline-none dark:text-white"
        />
      </label>

      {users.length === 0 ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center dark:border-amber-900/50 dark:bg-amber-950/20">
          <UserRoundCheck className="mx-auto h-8 w-8 text-amber-600" />
          <p className="mt-3 text-sm font-bold text-amber-900 dark:text-amber-200">Diretório ainda não sincronizado</p>
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">Ligue o dispositivo e execute uma sincronização.</p>
        </section>
      ) : (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((user) => (
            <article key={user.uid} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <Avatar
                nome={user.name}
                ownerUid={user.avatarOwnerUid}
                avatarVersion={user.avatarVersion}
                className="h-12 w-12 shrink-0 text-sm"
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-slate-900 dark:text-white">{user.name}</p>
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">{user.role}</p>
                {user.isOfficer && <span className="mt-1 inline-block rounded-full bg-indigo-50 px-2 py-0.5 text-[9px] font-black uppercase text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">Agente</span>}
              </div>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}

export default function Utilizadores() {
  const grants = useAppGrants();
  if (!grants.includes('app:page:users')) return <Navigate to="/" replace />;
  return <Directory />;
}
