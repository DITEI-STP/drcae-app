import { describe, expect, it } from 'vitest';
import { planAvatarDownloads, prioritizeAvatarDownloads } from './avatarCache';

describe('persistencia offline de avatares', () => {
  it('descarrega apenas versoes ausentes ou alteradas e remove entradas fora do manifesto completo', () => {
    const plan = planAvatarDownloads(
      [
        { ownerUid: 'u1', version: 'v1' },
        { ownerUid: 'u2', version: 'antiga' },
        { ownerUid: 'removido', version: 'v1' },
      ],
      [
        { ownerUid: 'u1', avatarUid: 'a1', version: 'v1', downloadUrl: '/avatars/u1/v1' },
        { ownerUid: 'u2', avatarUid: 'a2', version: 'v2', downloadUrl: '/avatars/u2/v2' },
        { ownerUid: 'u3', avatarUid: 'a3', version: 'v1', downloadUrl: '/avatars/u3/v1' },
      ],
      'complete',
    );

    expect(plan.downloads.map((item) => item.ownerUid)).toEqual(['u2', 'u3']);
    expect(plan.removeOwnerUids).toEqual(['removido']);
  });

  it('conserva a cache quando o manifesto esta indisponivel', () => {
    const plan = planAvatarDownloads(
      [{ ownerUid: 'u1', version: 'v1' }],
      [],
      'unavailable',
    );

    expect(plan.downloads).toEqual([]);
    expect(plan.removeOwnerUids).toEqual([]);
  });

  it('conclui o avatar proprio e os da equipa antes dos restantes', () => {
    const entries = ['outro', 'equipa', 'proprio'].map((ownerUid) => ({
      ownerUid,
      avatarUid: ownerUid,
      version: 'v1',
      downloadUrl: `/avatars/${ownerUid}/v1`,
    }));

    const tiers = prioritizeAvatarDownloads(
      entries,
      'proprio',
      new Set(['equipa']),
    );

    expect(tiers.priority.map((item) => item.ownerUid)).toEqual([
      'proprio',
      'equipa',
    ]);
    expect(tiers.remaining.map((item) => item.ownerUid)).toEqual(['outro']);
  });
});
