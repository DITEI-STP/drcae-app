import { db, type UtilizadorInterno } from '../db/db';

export async function syncUtilizadoresCatalog(
  users: UtilizadorInterno[] | undefined | null,
  state: 'complete' | 'unavailable' = 'unavailable',
): Promise<void> {
  if (!Array.isArray(users) || state !== 'complete') return;
  await db.transaction('rw', db.utilizadores, async () => {
    await db.utilizadores.clear();
    if (users.length > 0) await db.utilizadores.bulkPut(users);
  });
  window.dispatchEvent(new CustomEvent('drcae:utilizadores-updated'));
}
