/**
 * O que falta para um auto de apreensão poder avançar.
 *
 * Devolve **motivos legíveis**, e não um booleano: o passo bloqueava com o
 * botão apenas desactivado, e no terreno isso é indistinguível de uma avaria.
 * O agente marcava «apreender sem infracção», preenchia o item, e ficava
 * preso sem nada no ecrã a dizer o que faltava.
 *
 * Cada motivo traz um **código** porque na modalidade iterativa o que falta já
 * não se resolve todo no mesmo sítio: a quantidade preenche-se no formulário do
 * produto, o destino e o fiel depositário na tarefa própria. Mostrar num ecrã
 * um motivo que só se resolve no outro é pior do que não o mostrar.
 */

/** Custódia por definir enquanto o agente não decide o destino (SPEC-10 §5). */
export type CustodiaItem = 'drcae' | 'trustee' | null;

export interface ItemApreensaoValidavel {
  designation: string;
  quantity: string;
  assetSupply?: number | null;
  assetUnit?: number | null;
  custody: CustodiaItem;
  note?: string;
}

export interface ApreensaoValidavel {
  activa: boolean;
  semInfracao: boolean;
  justificacao: string;
  itens: ItemApreensaoValidavel[];
  trustee: {
    kind: 'operator' | 'person';
    name: string;
    docType: string;
    docNumber: string;
  };
}

/**
 * Onde o motivo se resolve — ver `MotivoApreensao`.
 *
 * Os `item-*` são um por **campo**: dizer «há item sem designação ou sem
 * quantidade» obrigava o agente a descobrir qual dos dois lhe faltava, em qual
 * produto. Cada campo tem a sua frase, e cada frase nomeia o que falta.
 */
export type CodigoMotivoApreensao =
  | 'justificacao'
  | 'item-produto'
  | 'item-quantidade'
  | 'item-unidade'
  | 'destino'
  | 'depositario';

export interface MotivoApreensao {
  codigo: CodigoMotivoApreensao;
  texto: string;
}

/**
 * Linha acrescentada e nunca preenchida.
 *
 * Não bloqueia: é o resultado de tocar em «Adicionar item» a mais, e a
 * submissão já a descarta. Bloquear por causa dela obrigaria o agente a
 * procurar um botão de remover que ele nem sabe que precisa de usar.
 */
export function itemVazio(item: ItemApreensaoValidavel): boolean {
  return (
    !item.designation.trim() &&
    !item.quantity.trim() &&
    item.assetSupply == null &&
    !item.note?.trim()
  );
}

/** Parte começada e ainda sem produto — só tem quantidade, unidade ou nota. */
export function faltaProduto(item: ItemApreensaoValidavel): boolean {
  return !itemVazio(item) && !item.designation.trim();
}

/** Produto escolhido e quantidade por dizer. */
export function faltaQuantidade(item: ItemApreensaoValidavel): boolean {
  return !itemVazio(item) && !!item.designation.trim() && !(Number(item.quantity) > 0);
}

/**
 * Quantidade escrita sem unidade.
 *
 * «10» não é uma quantidade apreendida: são dez sacos ou dez quilos, e é a
 * unidade que permite reconciliar o que foi recolhido com o que ficou em
 * depósito. Só se exige depois de haver quantidade — antes disso, o campo ainda
 * não faz pergunta nenhuma.
 */
export function faltaUnidade(item: ItemApreensaoValidavel): boolean {
  return !itemVazio(item) && Number(item.quantity) > 0 && item.assetUnit == null;
}

/** Linha começada mas sem o que a torna um item apreendido. */
export function itemIncompleto(item: ItemApreensaoValidavel): boolean {
  return faltaProduto(item) || faltaQuantidade(item) || faltaUnidade(item);
}

/** Uma lista curta como se lê em voz alta: «Arroz», «Óleo» e «Açúcar». */
function listarNomes(nomes: string[]): string {
  const citados = nomes.slice(0, 3).map((nome) => `«${nome}»`);
  const restantes = nomes.length - citados.length;
  if (restantes > 0) citados.push(restantes === 1 ? 'mais 1' : `mais ${restantes}`);
  if (citados.length === 1) return citados[0];
  return `${citados.slice(0, -1).join(', ')} e ${citados[citados.length - 1]}`;
}

/**
 * Uma frase por campo em falta, com os produtos nomeados.
 *
 * Dizia-se «Há item sem designação ou sem quantidade», que descreve a regra e
 * não o problema: o agente ficava a saber que existia uma linha por acabar, sem
 * saber qual, nem o que lhe faltava — e com dez produtos registados, tinha de os
 * abrir um a um. Cada campo passa a ter o seu motivo, com o seu próprio atalho.
 */
export function motivosDosItens(itens: ItemApreensaoValidavel[]): MotivoApreensao[] {
  const motivos: MotivoApreensao[] = [];

  const semProduto = itens.filter(faltaProduto).length;
  if (semProduto > 0) {
    motivos.push({
      codigo: 'item-produto',
      texto:
        semProduto === 1
          ? 'Há uma parte apreendida sem produto identificado.'
          : `Há ${semProduto} partes apreendidas sem produto identificado.`,
    });
  }

  const semQuantidade = itens.filter(faltaQuantidade).map((it) => it.designation.trim());
  if (semQuantidade.length > 0) {
    motivos.push({
      codigo: 'item-quantidade',
      texto:
        semQuantidade.length === 1
          ? `Falta a quantidade apreendida de ${listarNomes(semQuantidade)}.`
          : `Faltam as quantidades apreendidas de ${listarNomes(semQuantidade)}.`,
    });
  }

  const semUnidade = itens.filter(faltaUnidade).map((it) => it.designation.trim() || 'produto sem nome');
  if (semUnidade.length > 0) {
    motivos.push({
      codigo: 'item-unidade',
      texto:
        semUnidade.length === 1
          ? `Falta a unidade de medida de ${listarNomes(semUnidade)}.`
          : `Faltam as unidades de medida de ${listarNomes(semUnidade)}.`,
    });
  }

  return motivos;
}

export function motivosApreensaoIncompleta(apreensao: ApreensaoValidavel): MotivoApreensao[] {
  if (!apreensao.activa) return [];

  const motivos: MotivoApreensao[] = [];
  const usaveis = apreensao.itens.filter((it) => !itemVazio(it));

  if (apreensao.semInfracao && !apreensao.justificacao.trim()) {
    motivos.push({
      codigo: 'justificacao',
      texto: 'Justifique a apreensão sem infracção associada.',
    });
  }

  motivos.push(...motivosDosItens(apreensao.itens));

  // O que se leva e o que se deixa à guarda tem consequências diferentes — só o
  // depósito gera obrigação de recolha. Um item sem destino não é um auto.
  if (usaveis.some((it) => it.custody == null)) {
    motivos.push({
      codigo: 'destino',
      texto: 'Defina o destino de cada produto apreendido: recolhido ou fiel depositário.',
    });
  }

  // Com a guarda à responsabilidade da própria firma não há nada a preencher:
  // o responsável é o operador que o auto já identifica. Só o depositário
  // terceiro precisa de identificação — sem ela não há a quem exigir a
  // devolução. Mesma regra que `validateTrustee` corre no servidor.
  const temDeposito = usaveis.some((it) => it.custody === 'trustee');
  if (temDeposito && apreensao.trustee.kind === 'person') {
    const { name, docType, docNumber } = apreensao.trustee;
    if (!name.trim() || !docType.trim() || !docNumber.trim()) {
      motivos.push({
        codigo: 'depositario',
        texto: 'Identifique o fiel depositário: nome, tipo e número de documento.',
      });
    }
  }

  return motivos;
}

/** Motivos que se resolvem no ecrã em causa — os outros ficam para lá. */
export function motivosDe(
  motivos: MotivoApreensao[],
  codigos: readonly CodigoMotivoApreensao[],
): MotivoApreensao[] {
  return motivos.filter((motivo) => codigos.includes(motivo.codigo));
}
