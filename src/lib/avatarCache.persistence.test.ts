import 'fake-indexeddb/auto';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db/db';
import * as api from './api';
import { syncAvatarCache } from './avatarCache';

describe('bytes de avatar offline', () => {
  beforeEach(async () => {
    await db.open();
    await db.avatarFiles.clear();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    db.close();
  });

  it('guarda o Blob e conserva a versao anterior se a nova falhar', async () => {
    const download = vi.spyOn(api, 'downloadAvatar').mockResolvedValueOnce(
      new Blob(['png-v1'], { type: 'image/png' }),
    );
    const first = await syncAvatarCache([{
      ownerUid: 'owner-1', avatarUid: 'avatar-1', version: 'v1', downloadUrl: '/v1',
    }], 'complete');
    expect(first).toEqual({ downloaded: 1, pending: 0 });
    expect((await db.avatarFiles.get('owner-1'))?.version).toBe('v1');

    download.mockRejectedValueOnce(new Error('offline'));
    const second = await syncAvatarCache([{
      ownerUid: 'owner-1', avatarUid: 'avatar-1', version: 'v2', downloadUrl: '/v2',
    }], 'complete');
    expect(second).toEqual({ downloaded: 0, pending: 1 });
    expect((await db.avatarFiles.get('owner-1'))?.version).toBe('v1');
  });
});
