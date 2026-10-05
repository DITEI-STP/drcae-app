/**
 * Forma canónica usada pelas pesquisas locais do app.
 *
 * NFKD cobre os caracteres acentuados e as formas de compatibilidade; a
 * pontuação vira espaço para que NIF, alvará e telefone possam ser escritos
 * com ou sem separadores.
 */
export function normalizeSearch(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('pt')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function searchTokens(query: string): string[] {
  return [...new Set(normalizeSearch(query).split(' ').filter(Boolean))];
}

/**
 * Todos os termos têm de existir, mas podem aparecer em campos e ordens
 * diferentes. A forma compacta torna os separadores opcionais.
 */
export function matchesSearch(
  query: string,
  fields: ReadonlyArray<unknown>,
): boolean {
  const tokens = searchTokens(query);
  if (tokens.length === 0) return true;

  const searchable = normalizeSearch(
    fields
      .filter((value): value is string | number =>
        typeof value === 'string' || typeof value === 'number')
      .join(' '),
  );
  const compact = searchable.replace(/\s/g, '');

  return tokens.every(
    (token) => searchable.includes(token) || compact.includes(token),
  );
}
