/**
 * Cobertura da fiscalização — o que ficou por registar (SPEC-10 §7).
 *
 * O formulário por passos garante cobertura por tédio: obriga o agente a passar
 * por todos os domínios, nem que seja para não escrever nada. A tela iterativa
 * não obriga a nada, e um agente com pressa regista duas constatações e conclui.
 * Sem substituto, a modalidade nova pareceria mais rápida por ter registado
 * menos — e a comparação entre as duas ficaria envenenada.
 *
 * O substituto é este: listar o que ficou vazio e exigir que o agente o afirme.
 * Nada fica proibido; fica reconhecido, e o reconhecimento é gravado.
 *
 * **Só é lacuna o vazio que é notável.** A ausência de apreensão é o caso
 * normal — a esmagadora maioria das fiscalizações não apreende nada. Pedir
 * confirmação disso ensinaria o agente a tocar em tudo sem ler, e destruiria o
 * valor das confirmações que interessam.
 */

export interface CoverageInput {
  infracoes: number;
  provas: number;
  /** Produtos do livro em vigor. Zero quando o operador não tem livro. */
  produtosTotal: number;
  produtosVerificados: number;
  recomendacoesPendentes: number;
  recomendacoesPendentesRespondidas: number;
}

export interface CoverageGap {
  key: string;
  label: string;
}

/**
 * Lacunas a reconhecer antes de concluir.
 *
 * A ordem é a do impacto: uma fiscalização sem infracções é a afirmação mais
 * forte que o agente faz, e é a primeira que ele deve ler.
 */
export function deriveCoverageGaps(input: CoverageInput): CoverageGap[] {
  const gaps: CoverageGap[] = [];

  if (input.infracoes === 0) {
    gaps.push({ key: 'infracoes', label: 'Nenhuma infracção registada' });
  }

  if (input.provas === 0) {
    gaps.push({ key: 'provas', label: 'Nenhuma prova recolhida' });
  }

  // Sem livro em vigor não há lista fechada por percorrer: a verificação de
  // preços não se aplica, e não é lacuna nenhuma.
  if (input.produtosTotal > 0 && input.produtosVerificados < input.produtosTotal) {
    gaps.push({
      key: 'precos',
      label: `Preços por verificar (${input.produtosVerificados} de ${input.produtosTotal})`,
    });
  }

  const porResponder =
    input.recomendacoesPendentes - input.recomendacoesPendentesRespondidas;
  if (input.recomendacoesPendentes > 0 && porResponder > 0) {
    gaps.push({
      key: 'recomendacoes-pendentes',
      label:
        porResponder === 1
          ? '1 recomendação anterior sem resposta'
          : `${porResponder} recomendações anteriores sem resposta`,
    });
  }

  return gaps;
}

/**
 * Se o agente já reconheceu tudo o que ficou por registar.
 *
 * Reconhecimentos de lacunas que entretanto deixaram de existir são ignorados:
 * o agente pode confirmar «sem infracções», voltar atrás e registar uma, e o
 * botão de concluir não pode ficar desbloqueado por uma confirmação obsoleta.
 */
export function isCoverageAcknowledged(
  gaps: CoverageGap[],
  acknowledged: readonly string[],
): boolean {
  return gaps.every((gap) => acknowledged.includes(gap.key));
}
