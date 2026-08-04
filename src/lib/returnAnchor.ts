// Âncora de retorno a um registo em curso.
//
// Quando o agente abre, a partir do detalhe de uma infracção, uma fiscalização
// anterior daquele operador, sai do formulário de nova fiscalização. Tem de
// haver um caminho explícito de volta — e um só.
//
// **Uma âncora, nunca uma pilha** (R9.6): se o agente saltar de uma
// fiscalização para outra e para outra, o retorno é sempre ao formulário, não
// a um encadeado de detalhes que ele teria de desfazer um a um.
const RETURN_ANCHOR_KEY = 'drcae_return_anchor';

export interface ReturnAnchor {
  /** Rota a repor, ex.: `/visitas/nova`. */
  path: string;
  /** Rótulo do botão de retorno. */
  label: string;
  at: number;
}

export function setReturnAnchor(path: string, label: string): void {
  try {
    const anchor: ReturnAnchor = { path, label, at: Date.now() };
    sessionStorage.setItem(RETURN_ANCHOR_KEY, JSON.stringify(anchor));
    window.dispatchEvent(new CustomEvent('drcae:return-anchor-changed'));
  } catch {
    /* best-effort */
  }
}

export function getReturnAnchor(): ReturnAnchor | null {
  try {
    const raw = sessionStorage.getItem(RETURN_ANCHOR_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ReturnAnchor;
    return typeof parsed?.path === 'string' ? parsed : null;
  } catch {
    return null;
  }
}

export function clearReturnAnchor(): void {
  try {
    sessionStorage.removeItem(RETURN_ANCHOR_KEY);
    window.dispatchEvent(new CustomEvent('drcae:return-anchor-changed'));
  } catch {
    /* best-effort */
  }
}
