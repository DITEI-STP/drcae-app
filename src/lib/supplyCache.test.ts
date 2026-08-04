import { describe, expect, it } from 'vitest';
import { normalizeSupplyCacheValue } from './supplyCache';

const products = [
  { id: 906, name: 'Sal', grossPrice: 40, retailPrice: 55 },
];

describe('normalizeSupplyCacheValue', () => {
  it('lê o formato corrente', () => {
    const entry = normalizeSupplyCacheValue({
      bookStatus: 'active',
      products,
      cachedAt: 1700000000000,
      source: 'sync',
    });
    expect(entry).toMatchObject({ bookStatus: 'active', cachedAt: 1700000000000 });
    expect(entry?.products).toHaveLength(1);
  });

  it('tolera o formato legado — array cru, sem bookStatus', () => {
    // Dispositivos que sincronizaram antes da correcção têm a cache neste
    // formato; actualizar o bundle não pode fazê-los perder os dados.
    const entry = normalizeSupplyCacheValue(products);
    expect(entry).toMatchObject({ bookStatus: 'active', cachedAt: 0 });
    expect(entry?.products).toEqual(products);
  });

  it('trata ausência de bookStatus como sem livro', () => {
    expect(normalizeSupplyCacheValue({ products })?.bookStatus).toBe('none');
  });

  it('devolve null para valores inutilizáveis', () => {
    expect(normalizeSupplyCacheValue(undefined)).toBeNull();
    expect(normalizeSupplyCacheValue(null)).toBeNull();
    expect(normalizeSupplyCacheValue([])).toBeNull();
    expect(normalizeSupplyCacheValue({ bookStatus: 'active' })).toBeNull();
    expect(normalizeSupplyCacheValue('lixo')).toBeNull();
  });

  it('preserva uma entrada de operador sem livro e sem produtos', () => {
    const entry = normalizeSupplyCacheValue({ bookStatus: 'none', products: [] });
    expect(entry).toMatchObject({ bookStatus: 'none' });
    expect(entry?.products).toEqual([]);
  });
});
