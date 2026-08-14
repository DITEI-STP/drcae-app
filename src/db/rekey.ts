import type Dexie from 'dexie';
import { setActiveKey, type AppCryptoKey } from '../lib/crypto';

interface RekeyableTable {
  toArray(): Promise<unknown[]>;
  clear(): Promise<unknown>;
  bulkPut(records: unknown[]): Promise<unknown>;
}

export interface RekeyTarget {
  name: string;
  table: RekeyableTable;
}

/** Recifra atomicamente todas as tabelas sensíveis com a chave do dispositivo. */
export async function rekeyEncryptedTables(
  database: Dexie,
  targets: RekeyTarget[],
  oldKey: AppCryptoKey,
  newKey: AppCryptoKey,
): Promise<void> {
  try {
    await database.transaction(
      'rw',
      targets.map((target) => database.table(target.name)),
      async () => {
        setActiveKey(oldKey);
        const rows = await Promise.all(targets.map((target) => target.table.toArray()));
        setActiveKey(newKey);
        for (let index = 0; index < targets.length; index += 1) {
          await targets[index].table.clear();
          if (rows[index].length > 0) await targets[index].table.bulkPut(rows[index]);
        }
      },
    );
  } catch (error) {
    setActiveKey(oldKey);
    throw error;
  }
  setActiveKey(newKey);
}
