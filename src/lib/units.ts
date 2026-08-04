// Unidades de medida (`asset` sob `parent.code = 'unit'`), sincronizadas com
// os restantes assets.
//
// Lista fechada de propósito: com texto livre, «5 sacos» e «5 sacas» do mesmo
// produto seriam incomparáveis, e a reconciliação entre o que ficou em fiel
// depósito e o que foi recolhido — que é o cerne da SPEC-03 — deixaria de
// funcionar.

export interface UnidadeMedida {
  id: number;
  code: string;
  name: string;
}

/** Fallback usado enquanto o grupo `unit` não estiver sincronizado. */
const FALLBACK_UNITS: UnidadeMedida[] = [
  { id: 1301, code: 'un', name: 'Unidade' },
  { id: 1302, code: 'kg', name: 'Quilograma' },
  { id: 1304, code: 'l', name: 'Litro' },
  { id: 1306, code: 'cx', name: 'Caixa' },
  { id: 1307, code: 'sac', name: 'Saco' },
];

export function readSupplyCatalogUnits(): UnidadeMedida[] {
  try {
    const assets = JSON.parse(localStorage.getItem('drcae_assets') || '[]') as {
      id: number;
      name: string;
      code: string;
      parent_id: number | null;
    }[];
    const root = assets.find((a) => a.parent_id === null && a.code === 'unit');
    if (!root) return FALLBACK_UNITS;
    const children = assets
      .filter((a) => a.parent_id === root.id && a.code)
      .map((a) => ({ id: a.id, code: a.code, name: a.name }));
    return children.length > 0 ? children : FALLBACK_UNITS;
  } catch {
    return FALLBACK_UNITS;
  }
}

export function unitName(assetUnit: number | null | undefined): string {
  if (assetUnit == null) return '';
  return readSupplyCatalogUnits().find((u) => u.id === assetUnit)?.name ?? '';
}

/**
 * Símbolo da unidade — «kg», «un», «l».
 *
 * É o que se mostra nos formulários de apreensão: cabe na linha ao lado da
 * quantidade e é a forma como a unidade é escrita num auto. O nome por extenso
 * fica para a pesquisa e para as listagens, onde há espaço.
 */
export function unitCode(assetUnit: number | null | undefined): string {
  if (assetUnit == null) return '';
  return readSupplyCatalogUnits().find((u) => u.id === assetUnit)?.code ?? '';
}

/**
 * Opções de unidade para `ChipGroup`/`PickerSheet`: código no chip, nome como
 * pista na folha de pesquisa — quem ainda não decorou os símbolos procura por
 * «quilograma» e encontra «kg».
 */
export function unitOptions(): { value: string; label: string; hint: string }[] {
  return readSupplyCatalogUnits().map((u) => ({
    value: String(u.id),
    label: u.code,
    hint: u.name,
  }));
}
