import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  escolherTraseiraPrincipal,
  lerEscolhaMemorizada,
  memorizarEscolha,
  restricoesTraseira,
  traseirasCandidatas,
} from './cameraChoice';

function dispositivo(deviceId: string, label: string): MediaDeviceInfo {
  return { deviceId, label, kind: 'videoinput', groupId: '' } as MediaDeviceInfo;
}

function track(torch: boolean): MediaStreamTrack {
  return { getCapabilities: () => ({ torch }) } as unknown as MediaStreamTrack;
}

beforeEach(() => localStorage.clear());

describe('restricoesTraseira', () => {
  it('exige a traseira em vez de a sugerir', () => {
    // `ideal` deixava o motor escolher entre as duas traseiras do tablet e ele
    // escolhia a auxiliar.
    expect(restricoesTraseira()).toMatchObject({ facingMode: { exact: 'environment' } });
  });

  it('usa o deviceId memorizado quando existe, sem facingMode', () => {
    const r = restricoesTraseira('cam-0');
    expect(r).toMatchObject({ deviceId: { exact: 'cam-0' } });
    expect(r).not.toHaveProperty('facingMode');
  });
});

describe('traseirasCandidatas', () => {
  it('filtra pelas traseiras quando os rótulos estão disponíveis', () => {
    const lista = [
      dispositivo('0', 'camera2 0, facing back'),
      dispositivo('1', 'camera2 1, facing front'),
      dispositivo('2', 'camera2 2, facing back'),
    ];
    expect(traseirasCandidatas(lista).map((d) => d.deviceId)).toEqual(['0', '2']);
  });

  it('devolve todas quando os rótulos vêm anónimos', () => {
    // Antes de haver permissão concedida, `enumerateDevices` não preenche
    // `label` — filtrar por texto deixaria a lista vazia.
    const lista = [dispositivo('0', ''), dispositivo('1', '')];
    expect(traseirasCandidatas(lista)).toHaveLength(2);
  });

  it('ignora entradas que não são de vídeo', () => {
    const lista = [
      dispositivo('0', 'facing back'),
      { deviceId: 'mic', label: 'mic', kind: 'audioinput', groupId: '' } as MediaDeviceInfo,
    ];
    expect(traseirasCandidatas(lista)).toHaveLength(1);
  });
});

describe('escolherTraseiraPrincipal', () => {
  const traseiras = [dispositivo('0', 'facing back'), dispositivo('2', 'facing back')];

  it('escolhe a que anuncia torch, mesmo não sendo a primeira', () => {
    const abrir = vi.fn(async (id: string) => track(id === '2'));
    return escolherTraseiraPrincipal(traseiras, abrir).then((escolhida) => {
      expect(escolhida).toBe('2');
    });
  });

  it('pára de sondar assim que encontra torch', async () => {
    const abrir = vi.fn(async () => track(true));
    await escolherTraseiraPrincipal(traseiras, abrir);
    expect(abrir).toHaveBeenCalledTimes(1);
  });

  it('fica pela primeira que abriu quando nenhuma anuncia torch', async () => {
    const abrir = vi.fn(async () => track(false));
    expect(await escolherTraseiraPrincipal(traseiras, abrir)).toBe('0');
  });

  it('salta a candidata que não abre', async () => {
    const abrir = vi.fn(async (id: string) => {
      if (id === '0') throw new Error('em uso');
      return track(false);
    });
    expect(await escolherTraseiraPrincipal(traseiras, abrir)).toBe('2');
  });

  it('devolve null quando nenhuma abre', async () => {
    const abrir = vi.fn(async () => {
      throw new Error('sem permissão');
    });
    expect(await escolherTraseiraPrincipal(traseiras, abrir)).toBeNull();
  });
});

describe('memória da escolha', () => {
  it('guarda e lê', () => {
    expect(lerEscolhaMemorizada()).toBeNull();
    memorizarEscolha('cam-0');
    expect(lerEscolhaMemorizada()).toBe('cam-0');
  });
});
