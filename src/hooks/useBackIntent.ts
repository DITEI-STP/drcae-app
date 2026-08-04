import { useEffect, useRef } from 'react';

/**
 * Intenção de «voltar», vinda do botão físico/gestual do Android (evento
 * `drcae-native-back`, injectado pelo `drcae-webview`) ou do `popstate` do
 * browser.
 *
 * ## Porquê uma pilha
 *
 * Numa SPA, os passos de um stepper não são entradas de histórico: premir
 * «voltar» a meio de uma fiscalização não recuava um passo, saía do formulário
 * inteiro. O shell nativo passou a **consumir sempre** o evento e a delegar a
 * decisão aqui.
 *
 * Os handlers são empilhados por ordem de montagem e só o **último** recebe o
 * evento. É isso que faz um modal aberto sobre o formulário fechar-se primeiro,
 * sem qualquer lógica condicional espalhada pelos ecrãs: o modal monta depois,
 * fica no topo, e ao desmontar devolve o controlo ao formulário.
 *
 * Um ecrã que não registe handler nenhum não faz nada — que é o comportamento
 * pretendido fora dos formulários e dos modais.
 */
type BackIntentHandler = () => void;

const handlerStack: BackIntentHandler[] = [];

function dispatchBackIntent(): boolean {
  const handler = handlerStack[handlerStack.length - 1];
  if (!handler) return false;
  handler();
  return true;
}

let listenersBound = false;

function ensureListeners(): void {
  if (listenersBound) return;
  listenersBound = true;
  window.addEventListener('drcae-native-back', () => {
    dispatchBackIntent();
  });
  window.addEventListener('popstate', () => {
    // Só consome quando alguém declarou interesse. Sem handlers, a navegação
    // do browser segue o seu curso normal.
    if (dispatchBackIntent()) {
      // Repõe a entrada sentinela consumida pelo `popstate`, para o próximo
      // «voltar» voltar a cair aqui em vez de sair da rota.
      window.history.pushState({ drcaeBackSentinel: true }, '');
    }
  });
}

/**
 * Regista um handler de «voltar» enquanto `enabled` for verdadeiro.
 *
 * `withHistorySentinel` injecta uma entrada de histórico enquanto o handler
 * estiver activo, para que o botão do browser/PWA se comporte como o nativo.
 *
 * Reservado aos formulários com passos e aos modais que se sobrepõem a um
 * formulário (`PickerSheet`). Sem sentinela, o `popstate` chega **depois** de a
 * navegação já ter ocorrido: o handler fecha o modal, mas a rota recuou no
 * mesmo gesto e o formulário fica para trás meio preenchido. Fora destes casos
 * não acrescentar sentinelas — sentinelas a mais são a via rápida para um
 * histórico preso.
 */
export function useBackIntent(
  handler: BackIntentHandler,
  enabled = true,
  withHistorySentinel = false,
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!enabled) return;
    ensureListeners();

    const entry: BackIntentHandler = () => handlerRef.current();
    handlerStack.push(entry);

    if (withHistorySentinel) {
      window.history.pushState({ drcaeBackSentinel: true }, '');
    }

    return () => {
      const index = handlerStack.lastIndexOf(entry);
      if (index >= 0) handlerStack.splice(index, 1);
    };
  }, [enabled, withHistorySentinel]);
}
