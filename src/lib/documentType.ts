/**
 * Abreviatura do tipo de documento do representante.
 *
 * O ecrã de identificação é usado de pé, num tablet, com o representante do
 * operador à espera. «Bilhete de Identidade» ocupa uma linha inteira para dizer
 * o que «BI» diz num relance, e empurra o número do documento para outra linha.
 *
 * A abreviatura vem de `meta.abbr` do próprio `asset`, posta pela DRCAE na área
 * administrativa — como já acontece com `meta.level` da gravidade e
 * `meta.category` da cesta básica. Sem ela, cai-se no `code`, que já é curto e
 * legível (`BI`, `NIF`); o que nunca acontece é um tipo criado depois deste
 * código aparecer sem rótulo, ou com o nome inteiro a rebentar a linha.
 */

export interface TipoDocumento {
  code: string;
  name: string;
  meta?: Record<string, unknown> | null;
}

/** Limite acima do qual a abreviatura deixa de caber ao lado do número. */
const MAX_ABREVIATURA = 6;

export function abreviaturaDocumento(tipo: TipoDocumento): string {
  const declarada = tipo.meta?.abbr;
  if (typeof declarada === 'string' && declarada.trim()) {
    return declarada.trim().toUpperCase().slice(0, MAX_ABREVIATURA);
  }

  const code = tipo.code?.trim();
  if (code) return code.toUpperCase().slice(0, MAX_ABREVIATURA);

  // Sem `code` nem `abbr` resta o nome — melhor truncado do que ausente.
  return (tipo.name || '?').trim().toUpperCase().slice(0, MAX_ABREVIATURA);
}

/** Nome por extenso, para leitura e para o resumo da fiscalização. */
export function nomeDocumento(tipo: TipoDocumento): string {
  return tipo.name?.trim() || abreviaturaDocumento(tipo);
}
