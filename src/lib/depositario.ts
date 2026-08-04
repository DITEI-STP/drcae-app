import type { Apreensao } from '../db/db';

/**
 * Como se descreve o fiel depositário de um auto.
 *
 * Existe porque a mesma coluna significa duas coisas conforme o `trusteeKind`,
 * e três ecrãs a liam como se significasse sempre a mesma: com a guarda à
 * responsabilidade da firma, `trusteeName` é **quem assinou** o auto em nome
 * dela, não o custodiante. Mostrá-lo como «Fiel depositário: Maria Costa»
 * atribuía a uma empregada a responsabilidade que é do operador económico.
 *
 * Autos anteriores à distinção não têm `trusteeKind` e são lidos como
 * `'operator'` — é o mesmo que a migração escreveu na base de dados, e era
 * essa a prática que produziu esses registos.
 */
export interface DescricaoDepositario {
  /** Quem responde pela guarda. */
  custodiante: string;
  /** Quem assinou por ele, quando é pessoa distinta do custodiante. */
  assinante: string | null;
  terceiro: boolean;
}

export function descreveDepositario(
  apreensao: Pick<
    Apreensao,
    'trusteeKind' | 'trusteeName' | 'firmaName'
  >,
): DescricaoDepositario {
  const terceiro = apreensao.trusteeKind === 'person';
  const nome = apreensao.trusteeName?.trim() || '';

  if (terceiro) {
    return {
      custodiante: nome || 'Depositário não identificado',
      assinante: null,
      terceiro: true,
    };
  }

  return {
    custodiante: apreensao.firmaName?.trim() || 'Operador económico',
    assinante: nome || null,
    terceiro: false,
  };
}

/** Uma linha só, para listagens onde não há espaço para duas. */
export function resumoDepositario(
  apreensao: Parameters<typeof descreveDepositario>[0],
): string {
  const { custodiante, assinante, terceiro } = descreveDepositario(apreensao);
  if (terceiro) return `Fiel depositário: ${custodiante} (terceiro)`;
  return assinante
    ? `Fiel depositário: ${custodiante} · assinou ${assinante}`
    : `Fiel depositário: ${custodiante}`;
}
