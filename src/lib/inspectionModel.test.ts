import { describe, expect, it } from 'vitest';
import {
  hasCatalogTecnico,
  isRepresentanteComplete,
  normalizeRepresentante,
  normalizeTecnicos,
  tecnicoNames,
} from './inspectionModel';

describe('normalizeRepresentante', () => {
  it('lê o formato estruturado', () => {
    expect(
      normalizeRepresentante({ name: 'Ana Costa', docType: 'bi', docNumber: '123456' }),
    ).toMatchObject({ name: 'Ana Costa', docType: 'bi', docNumber: '123456' });
  });

  it('lê o formato legado (string) sem inventar documento', () => {
    // Actas antigas guardaram só o nome. Fabricar um tipo ou número seria pior
    // do que assumir que não os há.
    expect(normalizeRepresentante('Ana Costa')).toEqual({
      name: 'Ana Costa',
      docType: '',
      docNumber: '',
    });
  });

  it('devolve vazio para ausente', () => {
    expect(normalizeRepresentante(null)).toEqual({ name: '', docType: '', docNumber: '' });
    expect(normalizeRepresentante(undefined).name).toBe('');
  });
});

describe('isRepresentanteComplete', () => {
  it('exige nome, tipo e número', () => {
    expect(isRepresentanteComplete({ name: 'Ana', docType: 'bi', docNumber: '1' })).toBe(true);
    expect(isRepresentanteComplete({ name: 'Ana', docType: 'bi', docNumber: '' })).toBe(false);
    expect(isRepresentanteComplete({ name: 'Ana', docType: '', docNumber: '1' })).toBe(false);
    expect(isRepresentanteComplete({ name: '  ', docType: 'bi', docNumber: '1' })).toBe(false);
  });
});

describe('normalizeTecnicos', () => {
  it('lê o formato estruturado', () => {
    expect(normalizeTecnicos([{ uid: 'u1', name: 'Ana', number: '007' }])).toEqual([
      { uid: 'u1', name: 'Ana', number: '007' },
    ]);
  });

  it('lê nomes legados com uid vazio — sem adivinhar o agente', () => {
    // Reconciliar por nome é exactamente o erro que a SPEC-07 corrige.
    expect(normalizeTecnicos(['Joao Silva'])).toEqual([{ uid: '', name: 'Joao Silva' }]);
  });

  it('descarta entradas inválidas', () => {
    expect(normalizeTecnicos(['', '   '] as string[])).toEqual([]);
    expect(normalizeTecnicos(null)).toEqual([]);
  });
});

describe('hasCatalogTecnico', () => {
  it('só conta agentes com identificador', () => {
    expect(hasCatalogTecnico(['Joao Silva'])).toBe(false);
    expect(hasCatalogTecnico([{ uid: 'u1', name: 'Ana' }])).toBe(true);
    expect(hasCatalogTecnico([{ uid: '', name: 'Joao' }, { uid: 'u1', name: 'Ana' }])).toBe(true);
    expect(hasCatalogTecnico([])).toBe(false);
  });
});

describe('tecnicoNames', () => {
  it('extrai nomes de ambos os formatos', () => {
    expect(tecnicoNames([{ uid: 'u1', name: 'Ana' }])).toEqual(['Ana']);
    expect(tecnicoNames(['Ana'])).toEqual(['Ana']);
  });
});
