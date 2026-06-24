import { getDeviceId } from './api';
import { db } from '../db/db';

/**
 * Gera um código de fiscalização único e legível antes do sync com o servidor.
 * Formato: FIS-{PREFIX6}-{YYYYMMDD}-{SEQ3}
 *   PREFIX6  — 6 primeiros chars do sufixo do device_id (aleatório na instalação)
 *   YYYYMMDD — data local do registo
 *   SEQ3     — sequência diária por dispositivo (reinicia a cada dia, 001-999+)
 *
 * Unicidade: a combinação prefix (16^6 possibilidades) + data + seq garante
 * que colisões entre dispositivos distintos são astronomicamente improváveis.
 * O campo `identifier` no backend é @unique — uma colisão seria rejeitada e
 * reportada no response.errors[] do sync sem perder os dados locais.
 */
export async function generateOfflineCode(): Promise<string> {
  const deviceId = getDeviceId(); // ex: "dev_a3f2xy9k8p..."
  const rawSuffix = deviceId.startsWith('dev_') ? deviceId.slice(4) : deviceId;
  const prefix = rawSuffix.substring(0, 6).toUpperCase(); // "A3F2XY"

  const now = new Date();
  const dateStr =
    String(now.getFullYear()) +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0');

  const seqKey = `offline_seq_${dateStr}`;

  // Ler sequência actual do dia (armazenado em plaintext na tabela metadata raw)
  const meta = await db.table('metadata').get(seqKey);
  const seq = ((meta?.value as number) || 0) + 1;

  // Persistir nova sequência em plaintext (não contém dados sensíveis)
  await db.table('metadata').put({ key: seqKey, value: seq });

  return `FIS-${prefix}-${dateStr}-${String(seq).padStart(3, '0')}`;
}
