// Desbloqueio da base local sem passar por um novo login.
//
// A chave de cifra vive em memória e é reidratada do `sessionStorage`. No
// `drcae-webview` esse armazenamento morre quando o Android mata o processo,
// e há caminhos que a anulam com um formulário aberto (`auth-expired`,
// `device-blocked`). Quando isso acontece, qualquer escrita em Dexie lança
// «Base de dados bloqueada.» — e o agente perdia o trabalho em curso.
//
// Este módulo dá a via de recuperação: pedir a palavra-passe, repor a chave e
// **retomar** a operação interrompida. É a mesma verificação do login offline
// (assinatura local + canário da cache), extraída para não existir em duas
// cópias.
import * as crypto from './crypto';
import { db } from '../db/db';
import { getDeviceId } from './api';
import { addAppLog } from './appLogs';

export interface UnlockResult {
  ok: boolean;
  error?: string;
}

/** A base está desbloqueada e aceita escritas? */
export function isDatabaseUnlocked(): boolean {
  return crypto.getActiveKey() !== null;
}

/** NIF do agente com sessão neste dispositivo. */
export function getSessionNif(): string | null {
  return localStorage.getItem('drcae_officer_nif');
}

/**
 * Repõe a chave de cifra a partir da palavra-passe do agente, sem rede.
 *
 * Verifica a assinatura local antes de derivar (para distinguir «palavra-passe
 * errada» de «cache corrompida») e confirma o canário depois, para garantir
 * que a chave derivada decifra mesmo os dados guardados.
 */
export async function unlockWithPassword(
  nif: string,
  password: string,
): Promise<UnlockResult> {
  const stored = localStorage.getItem(`drcae_local_cred_${nif}`);
  if (!stored) {
    return {
      ok: false,
      error: 'Sem credenciais offline para este agente. Ligue-se à rede e inicie sessão.',
    };
  }

  let sigHex: string;
  let saltHex: string;
  try {
    ({ sigHex, saltHex } = JSON.parse(stored) as {
      sigHex: string;
      saltHex: string;
    });
  } catch {
    return { ok: false, error: 'Credenciais locais ilegíveis. Inicie sessão com rede.' };
  }

  try {
    const testSig = await crypto.deriveLocalSignature(nif, password, getDeviceId());
    if (testSig !== sigHex) {
      return { ok: false, error: 'Palavra-passe incorrecta.' };
    }

    crypto.setActiveKey(await crypto.deriveKey(nif, password, saltHex));

    if (!(await db.verifyOfflineKey())) {
      crypto.setActiveKey(null);
      return {
        ok: false,
        error: 'Cache local corrompida. Ligue-se à rede e inicie sessão novamente.',
      };
    }

    addAppLog('info', 'unlock', 'Base local desbloqueada por reautenticação');
    return { ok: true };
  } catch (err) {
    crypto.setActiveKey(null);
    addAppLog('error', 'unlock', 'Falha ao desbloquear a base local', err);
    return { ok: false, error: 'Não foi possível desbloquear a base local.' };
  }
}

/** A mensagem que `EncryptedTable` lança quando a chave não está activa. */
export const DB_LOCKED_MESSAGE = 'Base de dados bloqueada.';

export function isDatabaseLockedError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err ?? '');
  return message.includes(DB_LOCKED_MESSAGE);
}
