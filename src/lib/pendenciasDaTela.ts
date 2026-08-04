import {
  faltaProduto,
  faltaQuantidade,
  faltaUnidade,
  itemVazio,
  type CodigoMotivoApreensao,
  type MotivoApreensao,
} from './apreensaoValidacao';
import type { ItemApreensaoValidavel } from './apreensaoValidacao';

/**
 * O que separa o agente do passo seguinte, e onde se resolve (SPEC-10 §7).
 *
 * O botão «Próximo Passo» deixou de nascer cinzento na tela iterativa: um botão
 * desactivado não diz o que falta, e no terreno é indistinguível de uma avaria.
 * Passa a abrir esta lista — cada linha com o que falta e o atalho para o ecrã
 * onde isso se corrige.
 *
 * O encaminhamento é a parte que pode errar em silêncio: os motivos são
 * calculados sobre a fiscalização inteira, mas a folha de Produtos mostra
 * apenas a constatação em aberto. Um atalho que abra a folha errada leva o
 * agente a uma lista onde o problema não está, e a conclusão dele é que o
 * alerta mente. Por isso a escolha da constatação dona vive aqui, pura e
 * testada, e não no JSX.
 */

/** Folhas da tela que um atalho pode abrir — espelha `iterativa/TelaIterativa.tsx`. */
export type AlvoPendencia =
  | 'produtos'
  | 'tarefa-apreensao'
  | 'tarefa-precos'
  | 'tarefa-recomendacoes';

export interface Pendencia {
  codigo: string;
  texto: string;
  /** `bloqueio` impede o avanço; `aviso` só pede uma olhada antes de sair. */
  tom: 'bloqueio' | 'aviso';
  /** Rótulo do atalho — o verbo do que ele vai lá fazer. */
  accao: string;
  alvo: AlvoPendencia;
  /**
   * Constatação a abrir antes da folha, quando o alvo é `produtos`. `null`
   * quando a folha é da fiscalização inteira ou quando não há dona conhecida
   * (item que perdeu o agrupamento ao descartar-se um cartão).
   */
  constatacaoId: string | null;
}

/** Item de apreensão como a tela o conhece: validável e com dona. */
export interface ItemComConstatacao extends ItemApreensaoValidavel {
  constatacaoId?: string | null;
}

export interface EntradaPendencias {
  motivos: MotivoApreensao[];
  apreensaoItens: ItemComConstatacao[];
  /** Produtos do livro em vigor. Zero quando o operador não tem livro. */
  produtosTotal: number;
  produtosVerificados: number;
  /** Recomendações da visita anterior ainda sem resposta. */
  recomendacoesPorResponder: number;
}

const ACCAO_POR_MOTIVO: Record<string, { accao: string; alvo: AlvoPendencia }> = {
  justificacao: { accao: 'Fundamentar', alvo: 'produtos' },
  'item-produto': { accao: 'Identificar produto', alvo: 'produtos' },
  'item-quantidade': { accao: 'Preencher quantidade', alvo: 'produtos' },
  'item-unidade': { accao: 'Escolher unidade', alvo: 'produtos' },
  destino: { accao: 'Definir destino', alvo: 'tarefa-apreensao' },
  depositario: { accao: 'Identificar', alvo: 'tarefa-apreensao' },
};

/** Quem tem o campo em falta, por código de motivo. */
const DONO_DO_MOTIVO: Partial<
  Record<CodigoMotivoApreensao, (item: ItemApreensaoValidavel) => boolean>
> = {
  'item-produto': faltaProduto,
  'item-quantidade': faltaQuantidade,
  'item-unidade': faltaUnidade,
};

/**
 * A constatação onde o motivo se corrige.
 *
 * Cada `item-*` leva à primeira parte a que falte **esse** campo — é lá que
 * está o que o alerta acabou de dizer. `justificacao` leva à primeira com
 * apreensão, porque o bloco do fundamento vive no fundo da folha de Produtos e
 * vale para o auto inteiro.
 */
export function constatacaoDoMotivo(
  codigo: string,
  itens: ItemComConstatacao[],
): string | null {
  const emFalta = DONO_DO_MOTIVO[codigo as CodigoMotivoApreensao];
  const dono = emFalta
    ? itens.find((it) => emFalta(it))
    : itens.find((it) => !itemVazio(it));
  return dono?.constatacaoId ?? null;
}

export function pendenciasDaTela({
  motivos,
  apreensaoItens,
  produtosTotal,
  produtosVerificados,
  recomendacoesPorResponder,
}: EntradaPendencias): Pendencia[] {
  const pendencias: Pendencia[] = motivos.flatMap((motivo) => {
    const destino = ACCAO_POR_MOTIVO[motivo.codigo];
    if (!destino) return [];
    return [
      {
        codigo: motivo.codigo,
        texto: motivo.texto,
        tom: 'bloqueio' as const,
        accao: destino.accao,
        alvo: destino.alvo,
        constatacaoId:
          destino.alvo === 'produtos'
            ? constatacaoDoMotivo(motivo.codigo, apreensaoItens)
            : null,
      },
    ];
  });

  // Só é lacuna com livro em vigor: sem livro não há lista fechada por
  // percorrer, e a verificação de preços não se aplica. Avisa e não impede —
  // percorrer o livro inteiro nem sempre cabe na visita, e a revisão final
  // volta a exigir que a falta seja afirmada.
  const precosPorVerificar = produtosTotal - produtosVerificados;
  if (produtosTotal > 0 && precosPorVerificar > 0) {
    pendencias.push({
      codigo: 'precos',
      texto:
        precosPorVerificar === 1
          ? 'Falta verificar 1 preço do livro em vigor deste operador.'
          : `Faltam verificar ${precosPorVerificar} preços do livro em vigor deste operador.`,
      tom: 'aviso',
      accao: 'Verificar',
      alvo: 'tarefa-precos',
      constatacaoId: null,
    });
  }

  // Depois dos impedimentos, e com outro tom: responder às recomendações
  // anteriores é dever de revisão, não requisito legal do auto — o agente pode
  // decidir não responder, e a revisão final regista essa lacuna.
  if (recomendacoesPorResponder > 0) {
    pendencias.push({
      codigo: 'recomendacoes',
      texto:
        recomendacoesPorResponder === 1
          ? 'Ficou 1 recomendação da visita anterior sem resposta. Enquanto está no local ainda pode verificar se foi atendida.'
          : `Ficaram ${recomendacoesPorResponder} recomendações da visita anterior sem resposta. Enquanto está no local ainda pode verificar se foram atendidas.`,
      tom: 'aviso',
      accao: 'Rever',
      alvo: 'tarefa-recomendacoes',
      constatacaoId: null,
    });
  }

  return pendencias;
}

/** Só se avança com todos os impedimentos levantados. */
export function impedeAvancar(pendencias: Pendencia[]): boolean {
  return pendencias.some((p) => p.tom === 'bloqueio');
}
