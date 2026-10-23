import { db } from '../../db/db';
import { applyServerDeletions, type SyncDeletionDelta } from '../syncDeletions';

const key = 'deferred_firm_deletions';
export async function applyQueuedFirmDeletions(delta: SyncDeletionDelta | undefined): Promise<number> {
  const previous: unknown = (await db.metadata.get(key))?.value;
  const candidates: unknown[] = [
    ...(Array.isArray(previous) ? previous : []),
    ...(Array.isArray(delta?.firmas) ? delta.firmas : []),
  ];
  const ids = [...new Set(candidates.filter((id): id is string => typeof id === 'string' && !!id))];
  const deferred: string[] = [], ready: string[] = [];
  for (const id of ids) {
    const local = await db.firmas.get(id);
    (local && local.synced !== true ? deferred : ready).push(id);
  }
  // Store all candidates first so a partial deletion can be safely retried.
  await db.metadata.put({ key, value: ids });
  const count = await applyServerDeletions(db, { ...delta, firmas: ready });
  await db.metadata.put({ key, value: deferred });
  return count;
}
