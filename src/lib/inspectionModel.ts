// Normalização dos campos da fiscalização que mudaram de forma.
//
// O `representante` era uma string e a equipa era um array de nomes. Ambos
// passaram a ser estruturados — o primeiro por causa da força probatória da
// acta (SPEC-08), o segundo porque um agente sem identificador não é
// rastreável (SPEC-07). Fiscalizações gravadas antes disso continuam no
// dispositivo e têm de continuar a abrir e a sincronizar.
//
// Funções puras, testadas.
import type { Representante, Tecnico } from '../db/db';

/** Representante vazio — o campo nasce sempre assim, nunca pré-preenchido. */
export const EMPTY_REPRESENTANTE: Representante = {
  name: '',
  docType: '',
  docNumber: '',
};

/**
 * Lê o campo `representante` em qualquer das duas formas.
 *
 * O formato legado (string) fica com tipo e número por preencher — não são
 * inventados. Uma acta antiga continua a mostrar o nome que registou.
 */
export function normalizeRepresentante(
  value: Representante | string | null | undefined,
): Representante {
  if (typeof value === 'string') {
    return { name: value, docType: '', docNumber: '' };
  }
  if (!value || typeof value !== 'object') return { ...EMPTY_REPRESENTANTE };
  return {
    uid: value.uid,
    name: value.name ?? '',
    docType: value.docType ?? '',
    docNumber: value.docNumber ?? '',
    role: value.role,
  };
}

/** O representante está completo o suficiente para avançar do passo 1? */
export function isRepresentanteComplete(value: Representante): boolean {
  return (
    value.name.trim().length > 0 &&
    value.docType.trim().length > 0 &&
    value.docNumber.trim().length > 0
  );
}

/**
 * Lê `technicians` em qualquer das duas formas.
 *
 * Registos legados são arrays de nomes: ficam com `uid` vazio, marcando-os
 * como não reconciliáveis. Não se adivinha o agente a partir do nome — uma
 * reconciliação por nome é exactamente o erro que a SPEC-07 corrige.
 */
export function normalizeTecnicos(
  value: Tecnico[] | string[] | null | undefined,
): Tecnico[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry): Tecnico | null => {
      if (typeof entry === 'string') return { uid: '', name: entry };
      if (entry && typeof entry === 'object' && typeof entry.name === 'string') {
        return { uid: entry.uid ?? '', name: entry.name, number: entry.number };
      }
      return null;
    })
    .filter((t): t is Tecnico => t !== null && t.name.trim().length > 0);
}

/** Nomes da equipa, para apresentação e para o payload legado de sync. */
export function tecnicoNames(value: Tecnico[] | string[] | null | undefined): string[] {
  return normalizeTecnicos(value).map((t) => t.name);
}

/** Há pelo menos um agente do catálogo (com identificador)? */
export function hasCatalogTecnico(value: Tecnico[] | string[] | null | undefined): boolean {
  return normalizeTecnicos(value).some((t) => t.uid.length > 0);
}
