import { describe, expect, it } from 'vitest';
import { deriveCoverageGaps, isCoverageAcknowledged, type CoverageInput } from './coverage';

const completa: CoverageInput = {
  infracoes: 2,
  provas: 5,
  produtosTotal: 12,
  produtosVerificados: 12,
  recomendacoesPendentes: 3,
  recomendacoesPendentesRespondidas: 3,
};

describe('deriveCoverageGaps', () => {
  it('não aponta lacuna numa fiscalização completa', () => {
    expect(deriveCoverageGaps(completa)).toEqual([]);
  });

  it('aponta a ausência de infracções em primeiro lugar', () => {
    // É a afirmação mais forte que o agente faz, e a primeira que deve ler.
    const gaps = deriveCoverageGaps({ ...completa, infracoes: 0, provas: 0 });
    expect(gaps.map((g) => g.key)).toEqual(['infracoes', 'provas']);
  });

  it('não trata a ausência de apreensão como lacuna', () => {
    // A esmagadora maioria das fiscalizações não apreende nada. Pedir
    // confirmação disso ensinaria o agente a tocar em tudo sem ler.
    expect(deriveCoverageGaps(completa).map((g) => g.key)).not.toContain('apreensoes');
  });

  it('só aponta preços quando existe livro em vigor por percorrer', () => {
    expect(
      deriveCoverageGaps({ ...completa, produtosTotal: 0, produtosVerificados: 0 })
        .map((g) => g.key),
    ).not.toContain('precos');

    const gaps = deriveCoverageGaps({ ...completa, produtosVerificados: 4 });
    expect(gaps.find((g) => g.key === 'precos')?.label).toBe('Preços por verificar (4 de 12)');
  });

  it('conta as recomendações anteriores por responder, não as pendentes', () => {
    const gaps = deriveCoverageGaps({
      ...completa,
      recomendacoesPendentes: 3,
      recomendacoesPendentesRespondidas: 2,
    });
    expect(gaps.find((g) => g.key === 'recomendacoes-pendentes')?.label)
      .toBe('1 recomendação anterior sem resposta');
  });

  it('não aponta recomendações anteriores quando não há passivo', () => {
    expect(
      deriveCoverageGaps({
        ...completa,
        recomendacoesPendentes: 0,
        recomendacoesPendentesRespondidas: 0,
      }).map((g) => g.key),
    ).not.toContain('recomendacoes-pendentes');
  });
});

describe('isCoverageAcknowledged', () => {
  it('exige reconhecimento de todas as lacunas', () => {
    const gaps = deriveCoverageGaps({ ...completa, infracoes: 0, provas: 0 });
    expect(isCoverageAcknowledged(gaps, ['infracoes'])).toBe(false);
    expect(isCoverageAcknowledged(gaps, ['infracoes', 'provas'])).toBe(true);
  });

  it('ignora reconhecimentos obsoletos', () => {
    // O agente confirma «sem infracções», volta atrás e regista uma. O botão de
    // concluir não pode ficar desbloqueado por uma confirmação que já não
    // corresponde ao que está no formulário.
    const gaps = deriveCoverageGaps({ ...completa, provas: 0 });
    expect(isCoverageAcknowledged(gaps, ['infracoes'])).toBe(false);
    expect(isCoverageAcknowledged(gaps, ['infracoes', 'provas'])).toBe(true);
  });

  it('conclui sem reconhecimentos quando não há lacunas', () => {
    expect(isCoverageAcknowledged([], [])).toBe(true);
  });
});
