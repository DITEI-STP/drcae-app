import { expect, it } from 'vitest';
import { preservePending } from './pulled-records.util';
it('keeps every unacknowledged local field and its unsent state', () => {
  const local = { notes: 'Offline proof', synced: false };
  expect(preservePending({ notes: 'Old server note', synced: true }, local)).toBe(local);
});
it('accepts the canonical migration only after acknowledgement', () => {
  const remote = { firmaId: 'canonical', synced: true };
  expect(preservePending(remote, { firmaId: 'old', synced: true })).toBe(remote);
  expect(preservePending(remote, undefined)).toBe(remote);
});
