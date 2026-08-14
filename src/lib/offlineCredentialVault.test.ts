import { beforeEach, describe, expect, it } from 'vitest';
import {
  enrollOfflineCredential,
  getOfflineCredential,
  invalidateOfflineCredentials,
  restoreOfflineOfficerSnapshot,
  storeOfflineOfficerSnapshot,
  unlockOfflineCredential,
} from './offlineCredentialVault';

describe('cofre de credenciais offline multiagente', () => {
  beforeEach(() => localStorage.clear());

  it('permite que dois agentes abram a mesma chave de dados com as suas senhas', async () => {
    const vaultKey = 'ab'.repeat(32);

    await enrollOfflineCredential('1001', 'senha-a', 'tablet-1', vaultKey, 'versao-a');
    await enrollOfflineCredential('1002', 'senha-b', 'tablet-1', vaultKey, 'versao-b');

    await expect(unlockOfflineCredential('1001', 'senha-a', 'tablet-1')).resolves.toBe(vaultKey);
    await expect(unlockOfflineCredential('1002', 'senha-b', 'tablet-1')).resolves.toBe(vaultKey);
    await expect(unlockOfflineCredential('1002', 'senha-errada', 'tablet-1')).resolves.toBeNull();
  }, 15_000);

  it('remove apenas a credencial que o servidor declarou desactualizada', async () => {
    const vaultKey = 'cd'.repeat(32);
    await enrollOfflineCredential('1001', 'senha-a', 'tablet-1', vaultKey, 'versao-a');
    await enrollOfflineCredential('1002', 'senha-b', 'tablet-1', vaultKey, 'versao-b');

    invalidateOfflineCredentials([{ nif: '1001', valid: false }, { nif: '1002', valid: true }]);

    expect(getOfflineCredential('1001')).toBeNull();
    expect(getOfflineCredential('1002')?.credentialVersion).toBe('versao-b');
  }, 15_000);

  it('repõe a identidade do agente que voltou a entrar offline', () => {
    storeOfflineOfficerSnapshot('1001', { uid: 'ana', name: 'Ana Fiscal' });
    storeOfflineOfficerSnapshot('1002', { uid: 'bento', name: 'Bento Fiscal' });

    expect(restoreOfflineOfficerSnapshot('1001')).toBe(true);
    expect(JSON.parse(localStorage.getItem('drcae_officer_info') || '{}').uid).toBe('ana');
  });
});
