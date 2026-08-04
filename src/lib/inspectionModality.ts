import { hasAppGrant } from './grants';
import type { ModalidadeFiscalizacao } from '../db/db';

/**
 * Modalidade de trabalho da nova fiscalização (SPEC-10).
 *
 * Duas modalidades coexistem para poderem ser comparadas no terreno: o
 * formulário por passos, que é o que os agentes já usam, e a tela iterativa,
 * onde o agente regista o que encontra à medida que o encontra.
 *
 * A coexistência é temporária por decisão explícita — ver a data de fim na
 * SPEC-10 §11.1. Sem prazo, duas modalidades tornam-se duplicação permanente.
 */

export type { ModalidadeFiscalizacao };

/**
 * Recurso que habilita a modalidade iterativa. Declarado em
 * `resources.seed.json` e **validado no servidor** no push — esconder o modo na
 * UI não é protecção.
 */
export const ITERATIVE_INSPECTION_GRANT = 'app:transaction:inspection:iterative';

const PREFERENCE_KEY = 'drcae_modalidade_preferida';

/** Se o agente está no piloto e pode escolher a modalidade. */
export function canUseIterativeMode(): boolean {
  return hasAppGrant(ITERATIVE_INSPECTION_GRANT);
}

/**
 * Última modalidade escolhida, para pré-seleccionar o cartão no ecrã de escolha.
 *
 * Pré-seleccionar não é escolher: a pergunta continua a ser feita em todas as
 * fiscalizações, para a modalidade se manter uma decisão consciente durante o
 * piloto. O que isto evita é obrigar quem já decidiu a atravessar o mesmo ecrã
 * às cegas quatro vezes por dia.
 */
export function getPreferredModality(): ModalidadeFiscalizacao {
  try {
    return localStorage.getItem(PREFERENCE_KEY) === 'iterativa' ? 'iterativa' : 'stepper';
  } catch {
    return 'stepper';
  }
}

export function rememberPreferredModality(modalidade: ModalidadeFiscalizacao): void {
  try {
    localStorage.setItem(PREFERENCE_KEY, modalidade);
  } catch {
    // Preferência é conforto, não dados de campo: falhar aqui não interrompe nada.
  }
}
