// Leitura dos grupos de `asset` sincronizados em `drcae_assets`.
//
// Todos os grupos (distritos, nacionalidades, unidades, tipos de documento,
// ramos, constituição, entidade emissora) vinham a ser lidos com a mesma
// dezena de linhas copiada em cada ficheiro, e — pior — as escolhas eram
// guardadas apenas pelo **nome**. Renomear um asset na área administrativa
// desligava silenciosamente os registos seguintes, porque o backend resolvia a
// ligação por comparação de texto.
//
// Aqui o `id` viaja sempre ao lado do nome, para o registo apontar à entrada
// real da base de dados e sobreviver a uma renomeação.

export interface AssetOption {
  id: number;
  code: string;
  name: string;
  /** Configuração posta pela DRCAE em runtime (ex.: `abbr`, `level`, `category`). */
  meta?: Record<string, unknown> | null;
}

interface CachedAsset {
  id: number;
  name: string;
  code: string;
  parent_id: number | null;
  meta?: Record<string, unknown> | null;
}

function readCache(): CachedAsset[] {
  try {
    const raw = JSON.parse(localStorage.getItem('drcae_assets') || '[]');
    return Array.isArray(raw) ? (raw as CachedAsset[]) : [];
  } catch {
    return [];
  }
}

/**
 * Filhos de um grupo raiz, identificado pelo `code` da raiz.
 *
 * Devolve lista vazia quando o grupo não está sincronizado — cabe a quem
 * chama decidir o fallback, porque o que é razoável mostrar sem catálogo
 * depende do campo.
 */
export function readAssetGroup(groupCode: string): AssetOption[] {
  const assets = readCache();
  const root = assets.find((a) => a.parent_id === null && a.code === groupCode);
  if (!root) return [];
  return assets
    .filter((a) => a.parent_id === root.id && a.name)
    .map((a) => ({ id: a.id, code: a.code || '', name: a.name, meta: a.meta ?? null }));
}

/**
 * Resolve um nome dentro de **um** grupo.
 *
 * O âmbito importa: procurar o nome em todo o catálogo, como o backend fazia,
 * casa com o primeiro asset homónimo de qualquer grupo. Usado para recuperar o
 * `id` de valores herdados, gravados antes de os ids passarem a acompanhar a
 * escolha.
 */
export function findAssetInGroup(groupCode: string, name: string | undefined | null): AssetOption | undefined {
  if (!name) return undefined;
  const needle = name.trim().toLowerCase();
  return readAssetGroup(groupCode).find((a) => a.name.trim().toLowerCase() === needle);
}

/** Converte para o formato do `ChipGroup`/`PickerSheet`, com o id como valor. */
export function toPickerOptions(options: AssetOption[]): { value: string; label: string }[] {
  return options.map((a) => ({ value: String(a.id), label: a.name }));
}
