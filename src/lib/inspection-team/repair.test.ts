import { beforeEach, describe, expect, it, vi } from 'vitest';
import { pushSync } from '../api';
import { repairInspectionTeams } from './repair';

vi.mock('../api', () => ({ pushSync: vi.fn() }));
beforeEach(() => vi.resetAllMocks());

describe('re-sincronização da equipa', () => {
  it('só reenvia os IDs indicados pelo servidor, sem visitas recebidas nem dados de outras entidades', async () => {
    vi.mocked(pushSync).mockResolvedValue({ acceptedInspectionTeams: ['own-visit'], errors: [] });
    await repairInspectionTeams(['own-visit', 'own-visit']);
    expect(pushSync).toHaveBeenCalledExactlyOnceWith({ inspectionTeams: ['own-visit'] });
  });

  it('envia todo o histórico por lotes, mesmo fora do perfil ou cache local', async () => {
    const ids = Array.from({ length: 205 }, (_, i) => `visit-${i}`);
    vi.mocked(pushSync).mockImplementation(async ({ inspectionTeams }) => ({ acceptedInspectionTeams: inspectionTeams }));
    await repairInspectionTeams(ids);
    expect(vi.mocked(pushSync).mock.calls.map(([payload]) => payload.inspectionTeams.length)).toEqual([100, 100, 5]);
  });

  it('não confirma uma reparação recusada ou interrompida por falta de rede', async () => {
    vi.mocked(pushSync).mockResolvedValue({ acceptedInspectionTeams: [] });
    await expect(repairInspectionTeams(['own-visit'])).rejects.toThrow('Não foi possível');
    vi.mocked(pushSync).mockRejectedValue(new Error('offline'));
    await expect(repairInspectionTeams(['own-visit'])).rejects.toThrow('offline');
  });

  it('é compatível com servidores antigos e não repete trabalho já confirmado', async () => {
    await repairInspectionTeams(undefined);
    await repairInspectionTeams([]);
    expect(pushSync).not.toHaveBeenCalled();
  });
});
