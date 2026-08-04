import { describe, expect, it } from 'vitest';
import {
  formatPenaltyRange,
  isSeriousSeverity,
  normalizeCatalogEntry,
  UNKNOWN_SEVERITY,
} from './infractionCatalog';

describe('normalizeCatalogEntry', () => {
  it('lê o catálogo enriquecido', () => {
    expect(
      normalizeCatalogEntry({
        name: 'Falta de afixação de preços',
        severity: 'Infração Leve',
        severityCode: 'light',
        severityLevel: 1,
        legalInstrument: 'DL 22/2016, Art. 5º',
        penaltyMin: 1000,
        penaltyMax: 5000,
      }),
    ).toMatchObject({
      type: 'Falta de afixação de preços',
      severity: 'Infração Leve',
      severityLevel: 1,
      penaltyMin: 1000,
    });
  });

  it('não inventa gravidade no formato antigo', () => {
    // O formato antigo é `{id, name, code}`. O app atribuía «Baixa» a todas as
    // infracções; agora fica explicitamente desconhecida.
    const entry = normalizeCatalogEntry({ id: 709, name: 'Fraude', code: '' });
    expect(entry?.severity).toBe(UNKNOWN_SEVERITY);
    expect(entry?.severityLevel).toBeNull();
  });

  it('descarta entradas sem nome', () => {
    expect(normalizeCatalogEntry({ id: 1 })).toBeNull();
  });
});

describe('isSeriousSeverity', () => {
  it('classifica pelo nível, não pelo rótulo', () => {
    expect(isSeriousSeverity({ severityLevel: 3 })).toBe(true);
    expect(isSeriousSeverity({ severityLevel: 2 })).toBe(true);
    expect(isSeriousSeverity({ severityLevel: 1 })).toBe(false);
  });

  it('uma gravidade nova acima de Grave conta como grave', () => {
    expect(isSeriousSeverity({ severityLevel: 4 })).toBe(true);
  });

  it('aceita os rótulos da escala antiga em registos históricos', () => {
    expect(isSeriousSeverity({ severity: 'Crítica' })).toBe(true);
    expect(isSeriousSeverity({ severity: 'Alta' })).toBe(true);
    expect(isSeriousSeverity({ severity: 'Baixa' })).toBe(false);
  });

  it('sem nível nem rótulo conhecido não agrava', () => {
    expect(isSeriousSeverity({})).toBe(false);
  });
});

describe('formatPenaltyRange', () => {
  it('devolve null quando não há moldura definida', () => {
    // 36 das 37 infracções semeadas estão assim — null ou zero.
    expect(formatPenaltyRange(null, null)).toBeNull();
    expect(formatPenaltyRange(0, 0)).toBeNull();
  });

  it('formata intervalo, mínimo ou máximo', () => {
    expect(formatPenaltyRange(1000, 5000)).toContain('—');
    expect(formatPenaltyRange(1000, null)).toContain('a partir de');
    expect(formatPenaltyRange(null, 5000)).toContain('até');
  });
});
