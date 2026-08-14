import {
  decryptRecord,
  deriveLocalSignature,
  deriveLocalWrappingKey,
  encryptRecord,
  restoreSessionKey,
} from './crypto';

const CREDENTIAL_PREFIX = 'drcae_local_cred_';
const OFFICER_PREFIX = 'drcae_officer_info_';
export const OFFLINE_VAULT_MARKER = 'drcae_offline_vault_v1';

export interface OfflineCredential {
  version: 2;
  nif: string;
  sigHex: string;
  credentialVersion: string;
  wrappedVaultKey: string;
}

export interface CredentialValidation {
  nif: string;
  valid: boolean;
}

const keyFor = (nif: string) => `${CREDENTIAL_PREFIX}${nif.trim()}`;

export function getOfflineCredential(nif: string): OfflineCredential | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(keyFor(nif)) || 'null');
    return parsed?.version === 2 && parsed.nif ? parsed as OfflineCredential : null;
  } catch {
    return null;
  }
}

export function listOfflineCredentialVersions(): Array<{
  nif: string;
  credential_version: string;
}> {
  const result: Array<{ nif: string; credential_version: string }> = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key?.startsWith(CREDENTIAL_PREFIX)) continue;
    const credential = getOfflineCredential(key.slice(CREDENTIAL_PREFIX.length));
    if (credential) {
      result.push({ nif: credential.nif, credential_version: credential.credentialVersion });
    }
  }
  return result;
}

export async function enrollOfflineCredential(
  nif: string,
  password: string,
  deviceId: string,
  vaultKeyHex: string,
  credentialVersion: string,
): Promise<void> {
  const normalizedNif = nif.trim();
  const wrappingKey = await deriveLocalWrappingKey(normalizedNif, password, deviceId);
  const wrappedVaultKey = await encryptRecord({ vaultKeyHex }, wrappingKey);
  const sigHex = await deriveLocalSignature(normalizedNif, password, deviceId);
  localStorage.setItem(keyFor(normalizedNif), JSON.stringify({
    version: 2,
    nif: normalizedNif,
    sigHex,
    credentialVersion,
    wrappedVaultKey,
  } satisfies OfflineCredential));
}

export async function unlockOfflineCredential(
  nif: string,
  password: string,
  deviceId: string,
): Promise<string | null> {
  const credential = getOfflineCredential(nif);
  if (!credential) return null;
  const sigHex = await deriveLocalSignature(credential.nif, password, deviceId);
  if (sigHex !== credential.sigHex) return null;
  try {
    const wrappingKey = await deriveLocalWrappingKey(credential.nif, password, deviceId);
    const payload = await decryptRecord(credential.wrappedVaultKey, wrappingKey);
    return typeof payload?.vaultKeyHex === 'string' ? payload.vaultKeyHex : null;
  } catch {
    return null;
  }
}

export async function activateOfflineVault(vaultKeyHex: string): Promise<void> {
  await restoreSessionKey(vaultKeyHex);
  sessionStorage.setItem('drcae_session_key', vaultKeyHex);
}

export function invalidateOfflineCredentials(results: CredentialValidation[]): string[] {
  const invalidated: string[] = [];
  for (const result of results) {
    if (result.valid) continue;
    localStorage.removeItem(keyFor(result.nif));
    invalidated.push(result.nif);
  }
  return invalidated;
}

export function storeOfflineOfficerSnapshot(nif: string, officer: unknown): void {
  localStorage.setItem(`${OFFICER_PREFIX}${nif.trim()}`, JSON.stringify(officer));
}

export function restoreOfflineOfficerSnapshot(nif: string): boolean {
  const snapshot = localStorage.getItem(`${OFFICER_PREFIX}${nif.trim()}`);
  if (!snapshot) return false;
  try {
    const officer = JSON.parse(snapshot);
    if (!officer?.uid || !officer?.name) return false;
    localStorage.setItem('drcae_officer_info', snapshot);
    return true;
  } catch {
    return false;
  }
}
