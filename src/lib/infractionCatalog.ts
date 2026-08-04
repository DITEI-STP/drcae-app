// Catálogo de infracções sincronizado do backend (`getAssets().infractions`,
// guardado em `localStorage.drcae_infractions` pelo arranque do App).
//
// Fonte de verdade única da **gravidade**. Até aqui o app fabricava
// `severity: 'Baixa'` para todas as infracções do catálogo e mantinha uma
// escala própria (Baixa/Média/Alta/Crítica) que não existia em lado nenhum do
// lado do servidor. A escala real é o grupo de assets `gravity`, que a DRCAE
// edita sem deploy: «Infração Leve» (1), «Infração Grave» (2), «Infração Muito
// Grave» (3) — e pode crescer.

export interface InfractionCatalogItem {
  type: string;
  /** Rótulo da gravidade, tal como configurado no admin. */
  severity: string;
  /** Slug estável: `light` | `serious` | `veryserious` | … */
  severityCode: string | null;
  /** 1..n. É por aqui que se deriva o estado, nunca pelo rótulo. */
  severityLevel: number | null;
  legalInstrument: string;
  details: string;
  penaltyMin: number | null;
  penaltyMax: number | null;
}

/** Rótulo usado quando a infracção não tem gravidade configurada. */
export const UNKNOWN_SEVERITY = 'Sem gravidade';

/**
 * Nível a partir do qual a fiscalização é classificada como «Infrações» (e não
 * «Inconformes»). Corresponde a «Infração Grave» na configuração actual.
 */
export const SERIOUS_LEVEL = 2;

interface RawCatalogEntry {
  id?: number;
  name?: string;
  code?: string;
  severity?: string | null;
  severityCode?: string | null;
  severityLevel?: number | null;
  legalInstrument?: string | null;
  penaltyMin?: number | null;
  penaltyMax?: number | null;
}

/**
 * Normaliza uma entrada do catálogo. Tolera o formato antigo — `{id, name,
 * code}` — de dispositivos que ainda não sincronizaram contra o backend novo;
 * nesse caso a gravidade fica desconhecida em vez de ser inventada.
 *
 * Função pura, testada.
 */
export function normalizeCatalogEntry(
  raw: RawCatalogEntry,
): InfractionCatalogItem | null {
  if (!raw?.name) return null;
  return {
    type: raw.name,
    severity: raw.severity || UNKNOWN_SEVERITY,
    severityCode: raw.severityCode ?? null,
    severityLevel:
      typeof raw.severityLevel === 'number' ? raw.severityLevel : null,
    legalInstrument: raw.legalInstrument || '',
    details: '',
    penaltyMin: typeof raw.penaltyMin === 'number' ? raw.penaltyMin : null,
    penaltyMax: typeof raw.penaltyMax === 'number' ? raw.penaltyMax : null,
  };
}

export function readInfractionCatalog(): InfractionCatalogItem[] {
  try {
    const raw = JSON.parse(
      localStorage.getItem('drcae_infractions') || '[]',
    ) as RawCatalogEntry[];
    if (!Array.isArray(raw)) return [];
    return raw
      .map(normalizeCatalogEntry)
      .filter((item): item is InfractionCatalogItem => item !== null);
  } catch {
    return [];
  }
}

/**
 * Estado da fiscalização em função das infracções levantadas. Deriva do
 * **nível** e não do rótulo, para uma gravidade nova acrescentada pela DRCAE
 * entrar na classificação sem alteração de código.
 *
 * Fiscalizações antigas guardaram rótulos da escala anterior
 * (Crítica/Alta/Média/Baixa); esses continuam a contar como graves, para o
 * histórico não mudar de classificação retroactivamente.
 */
const LEGACY_SERIOUS_LABELS = new Set(['Crítica', 'Alta']);

export function isSeriousSeverity(item: {
  severity?: string;
  severityLevel?: number | null;
}): boolean {
  if (typeof item.severityLevel === 'number') {
    return item.severityLevel >= SERIOUS_LEVEL;
  }
  return LEGACY_SERIOUS_LABELS.has(item.severity ?? '');
}

/** Classes de cor por nível de gravidade, com degradação para desconhecido. */
export function severityClasses(level: number | null | undefined): string {
  switch (level) {
    case 3:
      return 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300';
    case 2:
      return 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300';
    case 1:
      return 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300';
    default:
      return 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400';
  }
}

/** Moldura legal formatada, ou `null` quando o catálogo não a tem definida. */
export function formatPenaltyRange(
  min: number | null,
  max: number | null,
): string | null {
  const has = (v: number | null): v is number => typeof v === 'number' && v > 0;
  if (!has(min) && !has(max)) return null;
  const fmt = (v: number) => `${v.toLocaleString('pt-PT')} STN`;
  if (has(min) && has(max)) return `${fmt(min)} — ${fmt(max)}`;
  return has(min) ? `a partir de ${fmt(min)}` : `até ${fmt(max as number)}`;
}
