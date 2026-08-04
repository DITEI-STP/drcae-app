// Cache local dos livros de cálculo de preços e do catálogo de produtos de
// cesta básica.
//
// Fonte de verdade única do formato: quem escreve (`sync.ts`, e o caminho
// online do `NovaVisita`) e quem lê passam por aqui. Já houve um formato de
// escrita divergente do de leitura — o `pull` gravava o array cru de produtos
// e o leitor esperava `{ bookStatus, products }` —, o que fazia a cache ser
// descartada em silêncio e a etapa de cesta básica aparecer vazia no terreno.
//
// Guardado no `metadata` **em claro** (`db.table('metadata')`, não o
// `EncryptedTable`): são preços de referência públicos, e mantê-los fora da
// cifra permite lê-los antes de a base estar desbloqueada — o mesmo que o
// caminho online já fazia.
import { db } from '../db/db';

export const SUPPLY_CATALOG_KEY = 'supply_catalog';

export type SupplyBookStatus = 'active' | 'active_no_items' | 'none';

export interface SupplyProduct {
  id: number;
  name: string;
  description?: string | null;
  /** `'basic'` (cesta básica) | `'standard'` (produto padrão). */
  category?: string;
  grossPrice: number | null;
  retailPrice: number | null;
}

/** Entrada por operador, tal como fica gravada no `metadata`. */
export interface SupplyCacheEntry {
  bookStatus: SupplyBookStatus;
  products: SupplyProduct[];
  cachedAt: number;
  source: 'sync' | 'online';
}

/** Entrada por operador tal como chega no `pull`. */
export interface SupplyPullEntry {
  firmaId: string;
  bookStatus?: SupplyBookStatus;
  products?: SupplyProduct[];
}

export interface SupplyCatalogCache {
  products: SupplyProduct[];
  cachedAt: number;
  generatedAt: string | null;
}

function supplyKey(firmaId: string): string {
  return `supply_${firmaId}`;
}

/**
 * Normaliza o valor gravado no `metadata` para o formato corrente.
 *
 * Tolera o formato legado — array cru de produtos, sem `bookStatus` — em vez
 * de o descartar: um dispositivo que actualize o bundle não pode perder a
 * cache que já tem. Função pura, testada.
 */
export function normalizeSupplyCacheValue(
  value: unknown,
): SupplyCacheEntry | null {
  if (Array.isArray(value)) {
    if (value.length === 0) return null;
    return {
      // O formato legado só era gravado quando havia livro em vigor.
      bookStatus: 'active',
      products: value as SupplyProduct[],
      cachedAt: 0,
      source: 'sync',
    };
  }

  if (!value || typeof value !== 'object') return null;
  const record = value as Partial<SupplyCacheEntry>;
  if (!Array.isArray(record.products)) return null;

  return {
    bookStatus: record.bookStatus ?? 'none',
    products: record.products,
    cachedAt: typeof record.cachedAt === 'number' ? record.cachedAt : 0,
    source: record.source === 'online' ? 'online' : 'sync',
  };
}

export async function readOperatorSupplyCache(
  firmaId: string,
): Promise<SupplyCacheEntry | null> {
  try {
    const row = await db.table('metadata').get(supplyKey(firmaId));
    return normalizeSupplyCacheValue(row?.value);
  } catch {
    return null;
  }
}

export async function writeOperatorSupplyCache(
  firmaId: string,
  entry: Omit<SupplyCacheEntry, 'cachedAt'> & { cachedAt?: number },
): Promise<void> {
  try {
    await db.table('metadata').put({
      key: supplyKey(firmaId),
      value: { ...entry, cachedAt: entry.cachedAt ?? Date.now() },
    });
  } catch {
    /* cache é best-effort — nunca deve derrubar o formulário */
  }
}

export async function readSupplyCatalog(): Promise<SupplyCatalogCache | null> {
  try {
    const row = await db.table('metadata').get(SUPPLY_CATALOG_KEY);
    const value = row?.value;
    if (!value || !Array.isArray(value.products)) return null;
    return {
      products: value.products,
      cachedAt: typeof value.cachedAt === 'number' ? value.cachedAt : 0,
      generatedAt: value.generatedAt ?? null,
    };
  } catch {
    return null;
  }
}

export async function writeSupplyCatalog(
  products: SupplyProduct[],
  generatedAt: string | null,
): Promise<void> {
  try {
    await db.table('metadata').put({
      key: SUPPLY_CATALOG_KEY,
      value: { products, cachedAt: Date.now(), generatedAt },
    });
  } catch {
    /* best-effort */
  }
}

export interface SupplyDiagnostics {
  /** Operadores com livro de cálculo em cache. */
  operatorsWithBook: number;
  /** Produtos no catálogo global em cache. */
  catalogProducts: number;
  /** Última actualização do catálogo, ou `null` se nunca sincronizou. */
  catalogCachedAt: number | null;
}

/**
 * Contadores para o diagnóstico de sincronização do ecrã de Definições. Sem
 * isto, uma cache de cesta básica vazia volta a passar despercebida até
 * alguém dar por ela no terreno.
 */
export async function readSupplyDiagnostics(): Promise<SupplyDiagnostics> {
  const catalog = await readSupplyCatalog();
  let operatorsWithBook = 0;

  try {
    const rows = await db.table('metadata').toArray();
    for (const row of rows) {
      if (typeof row?.key !== 'string' || !row.key.startsWith('supply_')) {
        continue;
      }
      if (row.key === SUPPLY_CATALOG_KEY) continue;
      const entry = normalizeSupplyCacheValue(row.value);
      if (entry && entry.products.length > 0) operatorsWithBook += 1;
    }
  } catch {
    /* diagnóstico é best-effort */
  }

  return {
    operatorsWithBook,
    catalogProducts: catalog?.products.length ?? 0,
    catalogCachedAt: catalog?.cachedAt ?? null,
  };
}
