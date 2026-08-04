import { db, type AvatarFile } from '../db/db';
import * as api from './api';
import { addAppLog } from './appLogs';

export type AvatarManifestState = 'complete' | 'unavailable';

export interface AvatarManifestEntry {
  ownerUid: string;
  avatarUid: string;
  version: string;
  downloadUrl: string;
}

export interface CachedAvatarVersion {
  ownerUid: string;
  version: string;
}

export function planAvatarDownloads(
  cached: CachedAvatarVersion[],
  manifest: AvatarManifestEntry[],
  state: AvatarManifestState,
): { downloads: AvatarManifestEntry[]; removeOwnerUids: string[] } {
  if (state !== 'complete') return { downloads: [], removeOwnerUids: [] };
  const cachedByOwner = new Map(cached.map((item) => [item.ownerUid, item.version]));
  const manifestOwners = new Set(manifest.map((item) => item.ownerUid));
  return {
    downloads: manifest.filter(
      (item) => !!item.version && cachedByOwner.get(item.ownerUid) !== item.version,
    ),
    removeOwnerUids: cached
      .filter((item) => !manifestOwners.has(item.ownerUid))
      .map((item) => item.ownerUid),
  };
}

export function prioritizeAvatarDownloads(
  downloads: AvatarManifestEntry[],
  ownOwnerUid: string | undefined,
  teamOwnerUids: ReadonlySet<string>,
): { priority: AvatarManifestEntry[]; remaining: AvatarManifestEntry[] } {
  const priority: AvatarManifestEntry[] = [];
  const remaining: AvatarManifestEntry[] = [];
  for (const entry of downloads) {
    (entry.ownerUid === ownOwnerUid || teamOwnerUids.has(entry.ownerUid)
      ? priority
      : remaining
    ).push(entry);
  }
  priority.sort((left, right) =>
    left.ownerUid === ownOwnerUid ? -1 : right.ownerUid === ownOwnerUid ? 1 : 0,
  );
  return { priority, remaining };
}

export async function syncAvatarCache(
  manifest: AvatarManifestEntry[] | undefined | null,
  state: AvatarManifestState = 'unavailable',
): Promise<{ downloaded: number; pending: number }> {
  if (!Array.isArray(manifest) || state !== 'complete') {
    return { downloaded: 0, pending: 0 };
  }
  const cached = await db.avatarFiles.toArray();
  const plan = planAvatarDownloads(cached, manifest, state);
  const ownOwnerUid = (() => {
    try { return JSON.parse(localStorage.getItem('drcae_officer_info') || 'null')?.avatarOwnerUid; }
    catch { return undefined; }
  })();
  const teamOfficerUids = (() => {
    try {
      const rows = JSON.parse(localStorage.getItem('drcae_equipe') || '[]') as { uid?: string }[];
      return new Set(rows.map((row) => row.uid).filter(Boolean));
    } catch { return new Set<string>(); }
  })();
  const teamOwners = new Set(
    (await db.agentes.toArray())
      .filter((agent) => teamOfficerUids.has(agent.uid))
      .map((agent) => agent.avatarOwnerUid)
      .filter((uid): uid is string => !!uid),
  );
  const tiers = prioritizeAvatarDownloads(plan.downloads, ownOwnerUid, teamOwners);
  let downloaded = 0;

  async function download(entries: AvatarManifestEntry[]): Promise<void> {
    let cursor = 0;
    async function worker(): Promise<void> {
      while (cursor < entries.length) {
        const entry = entries[cursor++];
        try {
          const data = await api.downloadAvatar(entry.downloadUrl);
          const record: AvatarFile = {
            ownerUid: entry.ownerUid,
            avatarUid: entry.avatarUid,
            version: entry.version,
            data,
            mimetype: data.type || 'image/png',
            updatedAt: Date.now(),
          };
          await db.avatarFiles.put(record);
          downloaded += 1;
        } catch (error) {
          addAppLog('warn', 'avatar-sync', `Avatar ${entry.ownerUid} pendente`, error);
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(4, entries.length) }, worker));
  }

  await download(tiers.priority);
  await download(tiers.remaining);
  if (plan.removeOwnerUids.length > 0) {
    await db.avatarFiles.bulkDelete(plan.removeOwnerUids);
  }
  const pending = plan.downloads.length - downloaded;
  window.dispatchEvent(new CustomEvent('drcae:avatars-updated', { detail: { pending } }));
  return { downloaded, pending };
}

export async function persistLoginAvatar(input: {
  uid?: string;
  avatarOwnerUid?: string;
  avatarUid?: string;
  avatarVersion?: string;
  avatarDownloadUrl?: string;
} | null | undefined): Promise<boolean> {
  const ownerUid = input?.avatarOwnerUid || input?.uid;
  if (!ownerUid || !input?.avatarUid || !input.avatarVersion || !input.avatarDownloadUrl) {
    return false;
  }
  const existing = await db.avatarFiles.get(ownerUid);
  if (existing?.version === input.avatarVersion) return true;
  try {
    const data = await api.downloadAvatar(input.avatarDownloadUrl);
    await db.avatarFiles.put({
      ownerUid,
      avatarUid: input.avatarUid,
      version: input.avatarVersion,
      data,
      mimetype: data.type || 'image/png',
      updatedAt: Date.now(),
    });
    return true;
  } catch (error) {
    addAppLog('warn', 'avatar-login', 'Avatar do utilizador não foi descarregado', error);
    return false;
  }
}
