import { useCallback, useEffect, useRef } from 'react';

// Campos que a tecla de acção percorre. `textarea` fica deliberadamente de
// fora: aí Enter tem de continuar a escrever nova linha, e num campo de
// observações essa é a tecla mais usada.
const FIELD_SELECTOR = 'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"])';

function isReachable(el: HTMLElement): boolean {
  if (el.hasAttribute('disabled') || el.getAttribute('aria-hidden') === 'true') return false;
  if ((el as HTMLInputElement).readOnly) return false;
  // `offsetParent` a null cobre o que está escondido por `display:none` — os
  // passos que não estão a ser mostrados, tipicamente.
  return el.offsetParent !== null;
}

interface Options {
  /**
   * Acção do botão principal do rodapé — avançar de passo ou submeter. É
   * chamada quando a tecla é premida no último campo visível.
   */
  onAdvance: () => void;
  /**
   * Se o avanço está disponível. A falso, a tecla apenas fecha o teclado, para
   * o formulário e o botão desactivado ficarem à vista. O hook não valida nada
   * por si: quem sabe validar é o formulário, e uma segunda regra aqui teria de
   * ser mantida em paralelo.
   */
  canAdvance?: boolean;
  /** Rótulo da tecla no último campo: `done` a meio, `go` no passo final. */
  lastFieldHint?: 'done' | 'go' | 'send';
  enabled?: boolean;
}

/**
 * Faz a tecla de acção do teclado Android percorrer os campos e, no último,
 * disparar a acção do rodapé.
 *
 * Os formulários não são `<form>` — são `<div>` com um botão no rodapé — pelo
 * que não havia submit nativo nem sequer um rótulo correcto na tecla: o Android
 * mostrava a tecla genérica de nova linha, e Enter não fazia nada.
 *
 * A ordem é a do DOM, lida no momento em que a tecla é premida. Isso dispensa
 * uma lista de referências por ecrã — que teria de ser mantida a par de cada
 * campo acrescentado ou reordenado — e acompanha de graça os campos que só
 * aparecem em certos estados.
 *
 * Devolve a ref a pôr no contentor do formulário.
 */
export function useEnterKeyNavigation({
  onAdvance,
  canAdvance = true,
  lastFieldHint = 'done',
  enabled = true,
}: Options) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Guardadas em ref para o listener não ser reinstalado a cada tecla escrita:
  // `canAdvance` muda com o preenchimento.
  const advanceRef = useRef(onAdvance);
  advanceRef.current = onAdvance;
  const canAdvanceRef = useRef(canAdvance);
  canAdvanceRef.current = canAdvance;

  const visibleFields = useCallback((): HTMLInputElement[] => {
    const root = containerRef.current;
    if (!root) return [];
    const found = Array.from(root.querySelectorAll(FIELD_SELECTOR)) as HTMLInputElement[];
    return found.filter(isReachable);
  }, []);

  // Mantém o rótulo da tecla coerente com o que ela faz: `next` enquanto houver
  // campo a seguir, e a acção final no último. Sem isto o Android anuncia uma
  // coisa e acontece outra.
  useEffect(() => {
    if (!enabled) return;
    const fields = visibleFields();
    fields.forEach((field, index) => {
      field.enterKeyHint = index === fields.length - 1 ? lastFieldHint : 'next';
    });
  });

  useEffect(() => {
    const root = containerRef.current;
    if (!root || !enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter') return;
      const target = event.target as HTMLElement | null;
      if (!target || target.tagName !== 'INPUT') return;

      event.preventDefault();

      const fields = visibleFields();
      const index = fields.indexOf(target as HTMLInputElement);
      const next = index >= 0 ? fields[index + 1] : undefined;

      if (next) {
        next.focus();
        return;
      }

      if (canAdvanceRef.current) {
        advanceRef.current();
      } else {
        // Fecha o teclado em vez de não fazer nada: com o teclado aberto o
        // agente não vê o botão desactivado nem o que falta preencher.
        (target as HTMLInputElement).blur();
      }
    };

    root.addEventListener('keydown', onKeyDown);
    return () => root.removeEventListener('keydown', onKeyDown);
  }, [enabled, visibleFields]);

  return containerRef;
}
