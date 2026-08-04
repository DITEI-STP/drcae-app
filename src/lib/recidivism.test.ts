import { describe, expect, it } from 'vitest';
import { catalogRecidivismBadge, recidivismLabel } from './recidivism';

describe('recidivismLabel', () => {
  it('não devolve distintivo para zero ocorrências', () => {
    // Era aqui que estava o defeito: `0` caía no ramo genérico e devolvia
    // «Incidente», pelo que todas as infracções do catálogo — a esmagadora
    // maioria nunca aplicada àquele operador — exibiam o mesmo distintivo.
    expect(recidivismLabel(0)).toBeNull();
    expect(recidivismLabel(-1)).toBeNull();
  });

  it('escala de 1 a n', () => {
    expect(recidivismLabel(1)?.label).toBe('Incidência');
    expect(recidivismLabel(2)?.label).toBe('Reincidência');
    expect(recidivismLabel(3)?.label).toBe('Multirreincidência (3x)');
    expect(recidivismLabel(7)?.label).toBe('Multirreincidência (7x)');
  });
});

describe('catalogRecidivismBadge', () => {
  it.each([
    [0, false, null],
    [0, true, 'Incidência'],
    [1, false, 'Incidência'],
    [1, true, 'Reincidência'],
    [2, false, 'Reincidência'],
    [2, true, 'Multirreincidência (3x)'],
    [3, false, 'Multirreincidência (3x)'],
    [3, true, 'Multirreincidência (4x)'],
  ])(
    'com %i anteriores e seleccionada=%s → %s',
    (previous, isSelected, expected) => {
      const badge = catalogRecidivismBadge(previous as number, isSelected as boolean);
      expect(badge?.label ?? null).toBe(expected);
    },
  );
});
