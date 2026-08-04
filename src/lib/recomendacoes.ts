/**
 * Recomendações emitidas na fiscalização (SPEC-10).
 *
 * Cada recomendação guarda a constatação de onde foi emitida, pelo mesmo
 * princípio das infracções, provas, apreensões e preços — «agrupa, não
 * contém». No stepper não há constatação em aberto e a referência fica a nulo,
 * exactamente como nos outros registos.
 *
 * O que é gravado na visita e enviado no push continua a ser `string[]`: o
 * formato lido pelo backend, pelo admin e por `firmaRisk` não muda, e é por
 * isso que agrupar por constatação não obriga a migrar nada no terreno.
 */
export interface RecomendacaoEmitida {
  texto: string;
  /** Constatação de onde foi emitida. Nulo no stepper. */
  constatacaoId?: string | null;
}

function textoDe(item: unknown): string {
  if (typeof item === 'string') return item.trim();
  if (item && typeof item === 'object' && typeof (item as RecomendacaoEmitida).texto === 'string') {
    return (item as RecomendacaoEmitida).texto.trim();
  }
  return '';
}

function constatacaoDe(item: unknown): string | null {
  if (item && typeof item === 'object') {
    return (item as RecomendacaoEmitida).constatacaoId ?? null;
  }
  return null;
}

/**
 * Lê a lista venha ela de onde vier: um rascunho gravado antes desta mudança
 * traz textos soltos, e nesse caso a constatação fica a nulo em vez de o
 * rascunho ser descartado — quem tem uma fiscalização a meio no terreno não
 * pode perdê-la por causa de uma mudança de formato.
 */
export function normalizarRecomendacoes(valor: unknown): RecomendacaoEmitida[] {
  if (!Array.isArray(valor)) return [];
  const vistos = new Set<string>();
  const saida: RecomendacaoEmitida[] = [];
  for (const item of valor) {
    const texto = textoDe(item);
    if (!texto || vistos.has(texto)) continue;
    vistos.add(texto);
    saida.push({ texto, constatacaoId: constatacaoDe(item) });
  }
  return saida;
}

/** Formato gravado na visita e enviado no push. */
export function textosDeRecomendacoes(recomendacoes: RecomendacaoEmitida[]): string[] {
  return recomendacoes.map((r) => r.texto);
}

export function temRecomendacao(recomendacoes: RecomendacaoEmitida[], texto: string): boolean {
  const limpo = texto.trim();
  return recomendacoes.some((r) => r.texto === limpo);
}

/**
 * Uma recomendação é única pelo texto em toda a fiscalização: voltar a
 * escolhê-la retira-a, em vez de a repetir noutra constatação. Emitir duas
 * vezes «Reforçar a higiene do balcão» seria escrever a mesma linha duas vezes
 * na acta entregue ao operador.
 */
export function alternarRecomendacao(
  recomendacoes: RecomendacaoEmitida[],
  texto: string,
  constatacaoId: string | null = null,
): RecomendacaoEmitida[] {
  const limpo = texto.trim();
  if (!limpo) return recomendacoes;
  if (temRecomendacao(recomendacoes, limpo)) {
    return recomendacoes.filter((r) => r.texto !== limpo);
  }
  return [...recomendacoes, { texto: limpo, constatacaoId }];
}

/** Texto livre: acrescenta se faltar, mas nunca retira o que já lá está. */
export function adicionarRecomendacao(
  recomendacoes: RecomendacaoEmitida[],
  texto: string,
  constatacaoId: string | null = null,
): RecomendacaoEmitida[] {
  const limpo = texto.trim();
  if (!limpo || temRecomendacao(recomendacoes, limpo)) return recomendacoes;
  return [...recomendacoes, { texto: limpo, constatacaoId }];
}

export function removerRecomendacao(
  recomendacoes: RecomendacaoEmitida[],
  texto: string,
): RecomendacaoEmitida[] {
  const limpo = texto.trim();
  return recomendacoes.filter((r) => r.texto !== limpo);
}

/** Quantas foram emitidas a partir de uma constatação — o número do badge. */
export function contarRecomendacoes(
  recomendacoes: RecomendacaoEmitida[],
  constatacaoId: string | undefined | null,
): number {
  if (!constatacaoId) return 0;
  return recomendacoes.filter((r) => r.constatacaoId === constatacaoId).length;
}

/**
 * Resposta do agente a uma recomendação deixada numa visita anterior.
 *
 * `undefined` e `null` significam a mesma coisa — por responder. São dois
 * valores porque o formulário limpa a escolha para `null` ao desmarcar, e o
 * registo que nunca foi tocado chega sem o campo.
 */
export interface RespostaHistorica {
  atendida?: boolean | null;
}

export function contarPendentesRespondidas(historicas: RespostaHistorica[]): number {
  return historicas.filter((r) => r.atendida !== undefined && r.atendida !== null).length;
}

/**
 * Quantas recomendações anteriores ficaram por responder.
 *
 * A conta era feita à mão em quatro sítios — a tela, o guard de saída da tela,
 * a cobertura da revisão e a submissão. Quatro cópias da mesma expressão são
 * quatro sítios onde a próxima mudança de formato tem de ser lembrada.
 *
 * @param totalPendentes recomendações agrupadas que o operador tem em aberto.
 */
export function contarPendentesPorResponder(
  totalPendentes: number,
  historicas: RespostaHistorica[],
): number {
  return Math.max(0, totalPendentes - contarPendentesRespondidas(historicas));
}
