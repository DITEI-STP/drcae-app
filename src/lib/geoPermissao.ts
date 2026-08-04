/**
 * Quem pode marcar ou corrigir o ponto de GPS de uma firma ou actividade.
 *
 * A regra anterior era o tempo: editável enquanto a firma não estivesse
 * sincronizada ou tivesse menos de uma hora. Passada essa hora, o ponto ficava
 * **permanentemente** bloqueado — mesmo quando não existia ponto nenhum. Um
 * agente que chegasse a um estabelecimento sem coordenada não tinha como a
 * marcar, e o mapa continuava sem ele para sempre.
 *
 * A regra passa a ser a que se explica em voz alta:
 *
 * - **falta o ponto** → qualquer agente o pode marcar; é registo em falta, não
 *   correcção de facto;
 * - **já existe ponto** → só com permissão explícita, porque alterar uma
 *   coordenada já registada muda onde a fiscalização diz ter acontecido.
 *
 * O servidor aplica a mesma regra no push (ver `app-sync.service.ts`): esconder
 * o botão nunca foi protecção.
 */

/** Recurso que permite **alterar** um ponto já definido. Ver `resources.seed.json`. */
export const GEO_UPDATE_GRANT = 'app:transaction:operator:geo:update';

export interface PontoGeografico {
  lat?: number | null;
  lng?: number | null;
}

/**
 * Um ponto só conta como definido se for utilizável.
 *
 * `(0, 0)` é o Golfo da Guiné a cerca de 300 km de São Tomé: aparece quando o
 * GPS devolve zeros antes de fixar, e tratá-lo como coordenada válida deixava a
 * firma marcada no meio do mar sem forma de a corrigir.
 */
export function temPontoDefinido(ponto?: PontoGeografico | null): boolean {
  if (!ponto) return false;
  const lat = Number(ponto.lat);
  const lng = Number(ponto.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat === 0 && lng === 0) return false;
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

export interface DecisaoPonto {
  permitido: boolean;
  /** O que dizer ao agente quando não pode — nunca «bloqueado» sem porquê. */
  motivo?: string;
  /** Marcar de raiz ou corrigir o que já existe: muda o rótulo do botão. */
  accao: 'marcar' | 'alterar';
}

export function decidirEdicaoDePonto(
  ponto: PontoGeografico | null | undefined,
  temPermissao: boolean,
): DecisaoPonto {
  if (!temPontoDefinido(ponto)) {
    return { permitido: true, accao: 'marcar' };
  }
  if (temPermissao) return { permitido: true, accao: 'alterar' };
  return {
    permitido: false,
    accao: 'alterar',
    motivo:
      'Este ponto já está registado. Alterar a localização de uma firma já ' +
      'marcada exige permissão própria — peça à administração da DRCAE.',
  };
}
