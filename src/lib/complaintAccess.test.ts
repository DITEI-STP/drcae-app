import {describe, expect, it} from 'vitest';
import {
  canReadReleasedComplaints,
  canVerifyReleasedComplaint,
} from './complaintAccess';

describe('acesso às denúncias libertadas', () => {
  const legacy = ['app:page:inspections', 'app:transaction:inspection:create'];

  it('mantém os agentes de fiscalização existentes operacionais', () => {
    expect(canReadReleasedComplaints(legacy)).toBe(true);
    expect(canVerifyReleasedComplaint(legacy)).toBe(true);
  });

  it('não basta poder consultar visitas', () => {
    expect(canReadReleasedComplaints(['app:page:inspections'])).toBe(false);
  });
});
