import { getPairingCredentials } from './pairing';
import { db } from '../db/db';

/**
 * Gera o código local (chassi) da fiscalização antes do sync com o servidor.
 * Formato: FYYDDDSSSSSRRCC  (15 chars)
 *   F       — letra "F" de Fiscalização
 *   YY      — 2 últimos dígitos do ano corrente
 *   DDD     — código base-36 do dispositivo (3 chars, uppercase)
 *   SSSSS   — sequência anual por dispositivo, 5 dígitos (00001-99999)
 *   RR      — 2 caracteres aleatórios alfanuméricos (A-Z0-9)
 *   CC      — 2 dígitos de verificação (soma dos char-codes dos 13 primeiros chars mod 100)
 *
 * Após sincronização o servidor atribui o código oficial FN-YYSSSSSS.
 */

const ALPHANUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function randomAlphanum(): string {
  return ALPHANUM[Math.floor(Math.random() * ALPHANUM.length)];
}

function computeChecksum(data: string): string {
  const sum = Array.from(data).reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return String(sum % 100).padStart(2, '0');
}

export async function generateOfflineCode(): Promise<string> {
  const creds = getPairingCredentials();
  // device_code já tem 3 chars após padronização; fallback a "XXX" em caso de ausência
  const ddd = (creds?.device_code ?? 'XXX').slice(0, 3).toUpperCase().padStart(3, '0');

  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const year = now.getFullYear();

  const seqKey = `offline_annual_seq_${year}`;
  const meta = await db.table('metadata').get(seqKey);
  const seq = ((meta?.value as number) || 0) + 1;
  await db.table('metadata').put({ key: seqKey, value: seq });

  const sssss = String(seq).padStart(5, '0');
  const rr = randomAlphanum() + randomAlphanum();
  const base = `F${yy}${ddd}${sssss}${rr}`;
  const cc = computeChecksum(base);

  return `${base}${cc}`;
}
