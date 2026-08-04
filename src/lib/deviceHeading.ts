import { useEffect, useState } from 'react';

// Converte um rumo em [0, 360) numa série contínua, somando sempre o menor
// arco entre a leitura anterior e a nova.
//
// Um rumo bruto salta de 359 para 1 ao passar o norte. Quem o use para animar
// uma rotação — via transição CSS ou qualquer interpolação — vê esse salto
// como uma viagem de 358° no sentido contrário: o radar dava meia volta para
// trás sempre que o agente apontava o aparelho a norte, e nunca chegava a
// assentar no norte. Somando deltas em ]-180, 180] o valor devolvido cresce ou
// decresce monotonamente ao longo de uma rotação real, e a interpolação passa
// a seguir o caminho curto, que é o único que corresponde ao movimento da mão.
//
// O acumulado não é reduzido a [0, 360): reduzi-lo reintroduziria exactamente
// a descontinuidade que este hook existe para eliminar. Cresce sem limite, o
// que é irrelevante — um dia inteiro de rotação contínua fica na ordem das
// dezenas de milhar de graus, muito longe da precisão de um double.
export function useUnwrappedHeading(heading: number | null): number | null {
  const [unwrapped, setUnwrapped] = useState<number | null>(null);

  useEffect(() => {
    if (heading === null) return;
    setUnwrapped((previous) => {
      if (previous === null) return heading;
      const delta = ((((heading - previous) % 360) + 540) % 360) - 180;
      return previous + delta;
    });
  }, [heading]);

  return unwrapped;
}

const HEADING_KEY = 'drcae_device_heading';
const HEADING_EVENT = 'drcae-heading-update';

// Rumo da bússola do aparelho, em graus a partir do norte (0 = norte, 90 =
// este). Usado pelo radar de operadores para manter o norte apontado ao norte
// real enquanto o tablet roda nas mãos.
//
// Duas fontes, por ordem de preferência:
//
//  1. Injecção do shell nativo (drcae-webview lê TYPE_ROTATION_VECTOR e
//     injecta), que é o cenário real de utilização em kiosque. O sensor nativo
//     já vem suavizado e compensado da rotação do ecrã.
//  2. DeviceOrientationEvent, para quem abra o app num browser. O suporte em
//     Android varia entre fabricantes, daí ser recurso e não caminho primário.
//
// Sem nenhuma das duas devolve null, e o radar fica fixo a norte — que é o
// comportamento correcto quando não se sabe para onde o aparelho aponta.
export function useDeviceHeading(): number | null {
  const [heading, setHeading] = useState<number | null>(() => {
    const stored = localStorage.getItem(HEADING_KEY);
    const parsed = stored === null ? NaN : Number(stored);
    return Number.isFinite(parsed) ? parsed : null;
  });

  useEffect(() => {
    let nativeSeen = false;

    const onNative = (event: Event) => {
      const value = Number((event as CustomEvent).detail?.heading);
      if (!Number.isFinite(value)) return;
      nativeSeen = true;
      setHeading(value);
    };

    const onOrientation = (event: DeviceOrientationEvent) => {
      // O shell nativo tem precedência: se já chegou por lá, ignorar o evento
      // do browser evita as duas fontes a competir com valores ligeiramente
      // diferentes, o que faria o radar tremer.
      if (nativeSeen) return;

      // webkitCompassHeading (Safari) já é o rumo a partir do norte; `alpha` é
      // a rotação em torno do eixo Z, medida no sentido contrário.
      const webkitHeading = (event as unknown as { webkitCompassHeading?: number })
        .webkitCompassHeading;
      if (Number.isFinite(webkitHeading)) {
        setHeading(webkitHeading as number);
        return;
      }
      if (event.absolute && typeof event.alpha === 'number') {
        setHeading((360 - event.alpha) % 360);
      }
    };

    window.addEventListener(HEADING_EVENT, onNative);
    window.addEventListener('deviceorientationabsolute', onOrientation as EventListener);
    window.addEventListener('deviceorientation', onOrientation as EventListener);

    return () => {
      window.removeEventListener(HEADING_EVENT, onNative);
      window.removeEventListener('deviceorientationabsolute', onOrientation as EventListener);
      window.removeEventListener('deviceorientation', onOrientation as EventListener);
    };
  }, []);

  return heading;
}
