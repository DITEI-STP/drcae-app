import type { Visita, Infracao } from '../db/db';

// Situação actual de um operador, derivada do histórico de visitas e infracções.
//
// Extraído de FirmasList, onde nasceu, por passar a ter um segundo consumidor
// (o radar de operadores próximos no Dashboard). Duplicar a classificação em
// dois sítios garantiria que divergiriam à primeira alteração das regras.
export type FirmaRisk = 'critical' | 'medium' | 'normal' | 'none';

export interface RiskPresentation {
  label: string;
  // Cor do ponto no radar. Hex directo em vez de classe Tailwind porque o SVG
  // do radar preenche `fill` por atributo.
  color: string;
  // Classes para o rótulo textual na lista.
  className: string;
}

export const RISK_PRESENTATION: Record<FirmaRisk, RiskPresentation> = {
  critical: {
    label: 'Com infrações',
    color: '#ef4444',
    className: 'text-red-600 dark:text-red-400',
  },
  medium: {
    label: 'Inconformidades',
    color: '#f59e0b',
    className: 'text-amber-600 dark:text-amber-400',
  },
  normal: {
    label: 'Regularizado',
    color: '#10b981',
    className: 'text-emerald-600 dark:text-emerald-400',
  },
  none: {
    label: 'Sem visitas',
    color: '#94a3b8',
    className: 'text-slate-500 dark:text-slate-400',
  },
};

export interface RecomendacaoEmAberto {
  text: string;
  visitaOrigemId: string;
  dataOrigem: string;
  equipaOrigem: string[];
}

// Recomendações emitidas em fiscalizações anteriores que continuam por resolver.
//
// O modelo tem duas metades e é preciso cruzá-las:
//   visita.recomendacoes           o que foi **emitido** nessa fiscalização
//   visita.recomendacoesHistoricas as **respostas**, dadas em fiscalizações
//                                  posteriores, ao que ficou de trás
//
// Percorre-se por ordem cronológica: cada recomendação emitida entra em aberto,
// e uma avaliação posterior marcada como atendida fecha-a. Fica em aberto tudo
// o que nunca foi atendido — quer nunca tenha sido avaliado, quer tenha sido
// avaliado como não atendido.
//
// A chave cruza a visita de origem com o texto, porque é assim que a resposta
// se liga à recomendação que lhe deu causa.
export function recomendacoesEmAberto(visitas: Visita[]): RecomendacaoEmAberto[] {
  const porResolver = new Map<string, RecomendacaoEmAberto & { atendida: boolean }>();

  const cronologicas = [...visitas].sort((a, b) => {
    const dataA = new Date(`${a.date}T${a.time || '00:00'}`).getTime();
    const dataB = new Date(`${b.date}T${b.time || '00:00'}`).getTime();
    return dataA - dataB;
  });

  for (const visita of cronologicas) {
    for (const texto of visita.recomendacoes ?? []) {
      porResolver.set(`${visita.id}-${texto}`, {
        text: texto,
        visitaOrigemId: visita.id!,
        dataOrigem: visita.date,
        equipaOrigem: visita.technicians || [],
        atendida: false,
      });
    }

    for (const resposta of visita.recomendacoesHistoricas ?? []) {
      const chave = `${resposta.visitaOrigemId}-${resposta.text}`;
      const actual = porResolver.get(chave);
      if (actual && resposta.atendida != null) {
        porResolver.set(chave, { ...actual, atendida: resposta.atendida });
      }
    }
  }

  return [...porResolver.values()]
    .filter((recomendacao) => !recomendacao.atendida)
    .sort((a, b) => new Date(b.dataOrigem).getTime() - new Date(a.dataOrigem).getTime());
}

// Alimenta a pulsação do ponto no radar (ver NearbyOperatorsRadar), que assinala
// "há aqui algo por averiguar" sem substituir a cor da situação — as duas
// informações são ortogonais e devem poder ser lidas em conjunto.
export function hasPendingRecommendations(visitas: Visita[]): boolean {
  return recomendacoesEmAberto(visitas).length > 0;
}

// Índice de infracções por visita, construído uma vez e reutilizado para todas
// as firmas — evitar isto tornaria a classificação O(firmas × infracções).
export function buildInfracoesCountByVisita(infracoes: Infracao[]): Map<string, number> {
  const counts = new Map<string, number>();
  infracoes.forEach((infracao) => {
    if (!infracao.visitaId) return;
    counts.set(infracao.visitaId, (counts.get(infracao.visitaId) || 0) + 1);
  });
  return counts;
}

export function groupVisitasByFirma(visitas: Visita[]): Map<string, Visita[]> {
  const grouped = new Map<string, Visita[]>();
  visitas.forEach((visita) => {
    const list = grouped.get(visita.firmaId) || [];
    list.push(visita);
    grouped.set(visita.firmaId, list);
  });
  return grouped;
}

// A ordem das condições é a hierarquia da gravidade: uma infracção sobrepõe-se
// a tudo o resto, mesmo que existam visitas posteriores regularizadas.
export function classifyFirmaRisk(
  visitas: Visita[],
  infracoesCountByVisita: Map<string, number>,
): { risk: FirmaRisk; numVisitas: number; numInfracoes: number } {
  let numInfracoes = 0;
  let hasInfracoes = false;
  let hasInconformes = false;
  let hasRegularizado = false;

  visitas.forEach((visita) => {
    numInfracoes += infracoesCountByVisita.get(visita.id!) || 0;
    if (visita.status === 'Infrações') hasInfracoes = true;
    else if (visita.status === 'Inconformes') hasInconformes = true;
    // 'Recomendações' não tem infrações nem inconformidades — conta como
    // "sem risco" tal como 'Regularizado' para efeitos de classificação.
    else if (visita.status === 'Regularizado' || visita.status === 'Recomendações') {
      hasRegularizado = true;
    }
  });

  let risk: FirmaRisk = 'none';
  if (hasInfracoes || numInfracoes > 0) risk = 'critical';
  else if (hasInconformes) risk = 'medium';
  else if (hasRegularizado) risk = 'normal';

  return { risk, numVisitas: visitas.length, numInfracoes };
}
