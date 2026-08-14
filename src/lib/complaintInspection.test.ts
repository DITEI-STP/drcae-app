import { describe, expect, it } from 'vitest';
import type { DenunciaCampo } from '../db/db';
import { complaintVerificationGaps, selectComplaintForInspection } from './complaintInspection';

const complaint = (patch: Partial<DenunciaCampo>): DenunciaCampo => ({
  uid: 'c', code: 'D-1', priority: 'normal', category: 'Preço', description: 'Factos',
  createdAt: '2026-01-01', releasedAt: '2026-01-02', attachments: [], ...patch,
});

describe('selectComplaintForInspection', () => {
  it('selects the highest-priority pending complaint for the operator', () => {
    const selected = selectComplaintForInspection([
      complaint({ uid: 'low', operatorId: 'f1', priority: 'low' }),
      complaint({ uid: 'urgent', operatorId: 'f1', priority: 'urgent' }),
      complaint({ uid: 'other', operatorId: 'f2', priority: 'urgent' }),
    ], 'f1');
    expect(selected?.uid).toBe('urgent');
  });
});

describe('complaintVerificationGaps', () => {
  it('requires a finding, local evidence and a reasoned outcome', () => {
    expect(complaintVerificationGaps({ verification: null, findingCount: 0, evidenceCount: 0 })).toHaveLength(4);
    expect(complaintVerificationGaps({ verification: { outcome: 'confirmed', note: 'Factos confirmados por observação directa.' }, findingCount: 1, evidenceCount: 1 })).toEqual([]);
  });
});
