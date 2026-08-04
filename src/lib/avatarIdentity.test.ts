import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Agente, Tecnico } from '../db/db';
import {
  indexAgentAvatars,
  refreshStoredOfficerAvatar,
} from './avatarIdentity';

const syncedAgent: Agente = {
  uid: 'officer-1',
  name: 'Ana Lima',
  avatarOwnerUid: 'avatar-current',
  avatarUid: 'avatar-current',
  avatarVersion: 'version-current',
  avatarDownloadUrl: '/api/app/avatars/avatar-current/version-current',
  photoUrl: '/api/storage/current.png',
  photoVersion: 'photo-current',
};

describe('identidade de avatar no drcae-app', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('reconcilia o snapshot do login com o avatar recebido no pull', () => {
    localStorage.setItem('drcae_officer_info', JSON.stringify({
      uid: 'officer-1',
      name: 'Ana Lima',
      avatarOwnerUid: 'avatar-stale',
      avatarUid: 'avatar-stale',
      avatarVersion: 'version-stale',
      avatarDownloadUrl: '/api/app/avatars/avatar-stale/version-stale',
    }));
    const listener = vi.fn();
    window.addEventListener('drcae:officer-info-updated', listener);

    expect(refreshStoredOfficerAvatar([syncedAgent])).toBe(true);

    expect(JSON.parse(localStorage.getItem('drcae_officer_info') || '{}')).toMatchObject({
      uid: 'officer-1',
      avatarOwnerUid: 'avatar-current',
      avatarUid: 'avatar-current',
      avatarVersion: 'version-current',
    });
    expect(listener).toHaveBeenCalledOnce();
    window.removeEventListener('drcae:officer-info-updated', listener);
  });

  it('indexa a fotografia da equipa por UID sem adivinhar pelo nome', () => {
    const index = indexAgentAvatars([syncedAgent]);
    const current: Tecnico = { uid: 'officer-1', name: 'Ana Lima' };
    const legacy: Tecnico = { uid: '', name: 'Ana Lima' };

    expect(index.get(current.uid)).toMatchObject({
      avatarOwnerUid: 'avatar-current',
      avatarVersion: 'version-current',
    });
    expect(index.get(legacy.uid)).toBeUndefined();
  });
});
