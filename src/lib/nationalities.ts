// Nacionalidades (`asset` sob `parent.code = 'nationality'`), sincronizadas com
// os restantes assets e por isso disponíveis offline.

import { readAssetGroup, type AssetOption } from './assetGroup';

/**
 * Nacionalidades fixadas à cabeça da lista, por frequência real no terreno.
 *
 * A ordem do catálogo não é gerida com este cuidado, pelo que confiar nela
 * deixaria «Santomense» — a esmagadora maioria dos registos — fora dos chips
 * visíveis e escondida atrás de «Ver todos».
 */
const PINNED = [
  'Santomense',
  'Angolana',
  'Cabo-verdiana',
  'Portuguesa',
  'Brasileira',
  'Galega',
  'Chinesa',
];

/**
 * Nacionalidades para escolha, com as fixadas à cabeça e o resto do catálogo
 * por ordem alfabética atrás.
 *
 * Sem o grupo sincronizado devolve lista vazia: a nacionalidade passou a ser
 * gravada por `id` de asset, pelo que uma lista fabricada localmente só
 * produziria escolhas sem correspondência na base de dados. A opção «Outra»
 * que a lista fixa tinha desapareceu — com o catálogo acessível pela pesquisa,
 * um valor genérico só serve para perder informação disponível.
 */
export function readNationalities(): AssetOption[] {
  const catalog = readAssetGroup('nationality');
  if (catalog.length === 0) return [];

  const pinned = PINNED.map((name) =>
    catalog.find((a) => a.name.trim().toLowerCase() === name.toLowerCase()),
  ).filter((a): a is AssetOption => Boolean(a));

  const pinnedIds = new Set(pinned.map((a) => a.id));
  const rest = catalog
    .filter((a) => !pinnedIds.has(a.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt'));

  return [...pinned, ...rest];
}
