import { describe, expect, it } from 'vitest';
import { findNifDuplicates, normalizeOperatorNif } from './nifDuplicates.util';
import type { Firma } from '../db/db';
const firms = [{ id: '1', nif: '517842494' }, { id: '2', nif: '' }] as Firma[];
describe('identificação por NIF', () => {
  it('normaliza separadores sem confundir o NIF vazio com uma firma existente', () => {
    expect(normalizeOperatorNif('517 842-494')).toBe('517842494');
    expect(findNifDuplicates(firms, '')).toEqual([]);
    expect(findNifDuplicates(firms, '517 842 494').map(f => f.id)).toEqual(['1']);
    expect(findNifDuplicates(firms, '517842494', '1')).toEqual([]);
  });
});
