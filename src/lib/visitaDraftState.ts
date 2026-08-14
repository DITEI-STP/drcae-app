import type {
  RecomendacaoHistorica,
  Representante,
  Tecnico,
  ComplaintVerification,
} from '../db/db';
import type {
  InfracaoSelecionada,
  ItemApreensaoForm,
  PrecoPorProduto,
  TrusteeForm,
} from '../pages/nova-visita/context';
import type { ModalidadeFiscalizacao } from './inspectionModality';
import type { RecomendacaoEmitida } from './recomendacoes';

/**
 * Formato do rascunho de fiscalização (SPEC-09 R9.5).
 *
 * O que aqui não estiver, não é recuperado. Foi essa a origem da falha que o
 * terreno reportou como «às vezes não recupera»: o rascunho gravava o operador,
 * a equipa, as infracções e as recomendações, mas não os itens apreendidos, os
 * preços, o fiel depositário nem as respostas às recomendações anteriores — e
 * quem tinha acabado de levantar um auto reabria sem ele.
 *
 * Só entra aqui o que é serializável em JSON. As provas viajam à parte, em
 * `db.draftAttachments`, porque um `File` não sobrevive a `JSON.stringify` e a
 * alternativa — base64 no `localStorage` — não cabia na quota.
 */

export const DRAFT_STATE_KEY = 'drcae_nova_visita_draft';

/**
 * Sobe quando o formato muda.
 *
 * 1 → sem `stepKey`; 2 → com `stepKey`; 3 → com o estado de apreensão, preços,
 * cobertura e respostas às recomendações anteriores, e com as provas fora do
 * `localStorage`. 4 acrescenta a ligação e a conclusão de averiguação da denúncia.
 */
export const DRAFT_VERSION = 4;

export interface DraftPayload {
  modalidade: ModalidadeFiscalizacao | null;
  visitaId: string | null;
  stepKey: string;
  firmaId: string;
  representante: Representante;
  atividadeEconomica: string;
  date: string;
  time: string;
  technicians: Tecnico[];
  infracoes: InfracaoSelecionada[];
  recomendacoes: RecomendacaoEmitida[];
  recomendacoesHistoricas: RecomendacaoHistorica[];
  notes: string;
  apreensaoActiva: boolean;
  apreensaoSemInfracao: boolean;
  apreensaoJustificacao: string;
  apreensaoItens: ItemApreensaoForm[];
  trustee: TrusteeForm;
  produtosPrices: PrecoPorProduto;
  coberturaReconhecida: string[];
  complaintUid?: string;
  complaintVerification?: ComplaintVerification | null;
}

export interface DraftState extends Partial<DraftPayload> {
  draftVersion: number;
  savedAt: number;
}

export function serializeDraft(payload: DraftPayload, agora = Date.now()): string {
  const estado: DraftState = { draftVersion: DRAFT_VERSION, savedAt: agora, ...payload };
  return JSON.stringify(estado);
}

/**
 * Lê o rascunho gravado, ou `null` quando não há nada de que se possa confiar.
 *
 * A versão era escrita e nunca lida. Formatos **anteriores** continuam a ser
 * aceites e restaurados pelo que trouxerem — os campos em falta simplesmente
 * não são aplicados, e descartar por isso apagaria trabalho de campo por uma
 * mudança de formato. O que se rejeita é o formato **posterior**, que acontece
 * quando um dispositivo é revertido para um bundle mais antigo: aí os campos
 * têm significados que este código não conhece, e aplicá-los às cegas é pior
 * do que começar de novo.
 */
export function parseDraft(raw: string | null): DraftState | null {
  if (!raw) return null;

  let bruto: unknown;
  try {
    bruto = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) return null;

  const draft = bruto as Partial<DraftState>;
  const versao = typeof draft.draftVersion === 'number' ? draft.draftVersion : 1;
  if (versao > DRAFT_VERSION) return null;

  return { ...draft, draftVersion: versao, savedAt: draft.savedAt ?? 0 } as DraftState;
}

/**
 * Modalidade com que o rascunho reabre.
 *
 * Resolvida antes do passo, e não a partir do render corrente: a ordem dos
 * passos depende dela, e um rascunho da tela iterativa lido contra a ordem do
 * stepper caía sempre no primeiro passo — que era o sintoma.
 *
 * @param podeIterativa se o agente continua no piloto. Um rascunho iterativo de
 *   quem perdeu o grant reabre no stepper, em vez de num ecrã que já não pode ver.
 */
export function modalidadeDoRascunho(
  draft: Pick<DraftState, 'modalidade'>,
  podeIterativa: boolean,
): ModalidadeFiscalizacao {
  return draft.modalidade === 'iterativa' && podeIterativa ? 'iterativa' : 'stepper';
}

/**
 * Número do passo em que o rascunho reabre, 1-indexado.
 *
 * O rascunho persiste `stepKey` e não o índice: um rascunho gravado antes de a
 * ordem dos passos ter mudado reabre no primeiro passo em vez de num passo
 * errado.
 */
export function passoDoRascunho(
  draft: Pick<DraftState, 'stepKey'>,
  ordem: readonly string[],
): number {
  const indice = draft.stepKey ? ordem.indexOf(draft.stepKey) : -1;
  return indice >= 0 ? indice + 1 : 1;
}

/** Descreve o rascunho pendente para o agente decidir com contexto. */
export function describeDraft(
  draft: Pick<DraftState, 'savedAt' | 'stepKey'>,
  rotuloDoPasso: (stepKey: string) => string | undefined,
  formatarData: (data: Date) => string,
): string {
  const partes: string[] = [];
  if (draft.savedAt) partes.push(`Ficou a ${formatarData(new Date(draft.savedAt))}`);
  const rotulo = draft.stepKey ? rotuloDoPasso(draft.stepKey) : undefined;
  if (rotulo) partes.push(`no passo «${rotulo}»`);
  const onde = partes.length > 0 ? `${partes.join(' ')}.\n\n` : '';
  return `${onde}Recuperar o que ficou por terminar, ou começar uma fiscalização nova? Começar nova apaga o rascunho.`;
}
