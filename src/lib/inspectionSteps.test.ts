import {describe, expect, it} from 'vitest';
import {inspectionStepOrder} from './inspectionSteps';

describe('inspectionStepOrder', () => {
  it.each(['stepper', 'iterativa'] as const)(
    'insere a averiguação depois da constatação e das provas no modo %s',
    (mode) => {
      const steps = inspectionStepOrder(mode, true);
      expect(steps.at(-2)).toBe('denuncia');
      expect(steps.at(-1)).toBe('revisao');
      expect(steps.indexOf('denuncia')).toBeGreaterThan(steps.indexOf(mode === 'iterativa' ? 'tela' : 'provas'));
    },
  );

  it('não altera uma fiscalização sem denúncia', () => {
    expect(inspectionStepOrder('iterativa')).not.toContain('denuncia');
  });
});
