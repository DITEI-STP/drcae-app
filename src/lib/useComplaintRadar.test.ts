import {describe, expect, it} from 'vitest';
import {isNewReleasedComplaint} from './useComplaintRadar';

describe('isNewReleasedComplaint', () => {
  const now = Date.parse('2026-08-13T12:00:00Z');

  it('destaca uma denúncia libertada nas últimas 72 horas', () => {
    expect(isNewReleasedComplaint('2026-08-10T12:00:01Z', now)).toBe(true);
  });

  it('não destaca depois da janela nem uma data inválida', () => {
    expect(isNewReleasedComplaint('2026-08-10T11:59:59Z', now)).toBe(false);
    expect(isNewReleasedComplaint('inválida', now)).toBe(false);
  });
});
