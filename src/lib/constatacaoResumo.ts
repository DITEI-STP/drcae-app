/**
 * Resumo de uma constatação sem descrição (SPEC-10 §8).
 *
 * Um cartão que diz «sem descrição» não ajuda ninguém a reconhecê-lo numa
 * fiscalização com oito constatações. O agente fotografa primeiro e escreve
 * depois — quando escreve —, pelo que a ausência de descrição é o caso normal e
 * não a excepção.
 *
 * A ordem é a do **peso do que foi registado**, não a da ordem de registo: a
 * infracção é o que determina o estado da fiscalização, e é por ela que o
 * agente procura. A contagem de provas é o último recurso, porque «3 provas»
 * distingue mal dois cartões, mas distingue melhor do que nada.
 */

export interface ResumoInput {
  descricao?: string | null;
  infracoes: string[];
  itensApreendidos: string[];
  produtos: string[];
  provas: number;
}

export function resumirConstatacao(input: ResumoInput): string {
  const descricao = input.descricao?.trim();
  if (descricao) return descricao;

  const [infracao] = input.infracoes;
  if (infracao) {
    const extra = input.infracoes.length - 1;
    return extra > 0 ? `${infracao} +${extra}` : infracao;
  }

  const [item] = input.itensApreendidos;
  if (item) {
    const extra = input.itensApreendidos.length - 1;
    return extra > 0 ? `Apreendido: ${item} +${extra}` : `Apreendido: ${item}`;
  }

  const [produto] = input.produtos;
  if (produto) {
    const extra = input.produtos.length - 1;
    return extra > 0 ? `Preço: ${produto} +${extra}` : `Preço: ${produto}`;
  }

  if (input.provas > 0) {
    return input.provas === 1 ? '1 prova' : `${input.provas} provas`;
  }

  return 'Sem registos';
}
