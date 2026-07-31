import { useEffect, useState } from 'react';

const MOTION_STATE_KEY = 'drcae_motion_state';
const MOTION_EVENT = 'drcae-motion-update';

// Além deste intervalo sem notícias do shell nativo, o estado deixa de ser
// afirmado. Cobre com folga a cadência das transições — que só ocorrem quando
// o movimento muda — e evita que a app continue a dizer "em movimento" depois
// de o serviço nativo ter parado ou o rastreamento ter sido desligado.
const STALE_MS = 20 * 60 * 1000;

export type MotionStateName = 'MOVING' | 'STATIONARY' | 'RESTING';

export type TravelMode = 'STILL' | 'ON_FOOT' | 'RUNNING' | 'CYCLING' | 'VEHICLE';

export interface MotionState {
  state: MotionStateName;
  travel_mode: TravelMode | null;
  dwell_start: number | null;
  received_at: number;
}

export interface MotionDisplay {
  moving: boolean;
  label: string;
  known: boolean;
  travelMode: TravelMode | null;
}

function parse(raw: string | null): MotionState | null {
  if (!raw) return null;
  try {
    // O shell nativo grava a string JSON já serializada (mesmo formato de
    // drcae_native_location), pelo que pode vir com uma camada extra.
    const once = JSON.parse(raw);
    const payload = typeof once === 'string' ? JSON.parse(once) : once;
    if (!payload?.state) return null;
    return {
      state: payload.state,
      travel_mode: payload.travel_mode ?? null,
      dwell_start: payload.dwell_start ?? null,
      received_at: payload.received_at ?? Date.now(),
    };
  } catch {
    return null;
  }
}

// Estado de deslocação do tablet, publicado pelo LocationTraceService nativo.
// Só existe dentro do drcae-webview — num browser normal devolve sempre null,
// e quem consome deve simplesmente não mostrar o indicador.
export function useMotionState(): MotionState | null {
  const [motion, setMotion] = useState<MotionState | null>(() =>
    parse(localStorage.getItem(MOTION_STATE_KEY)),
  );

  useEffect(() => {
    const handleUpdate = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (!detail?.state) return;
      setMotion({
        state: detail.state,
        travel_mode: detail.travel_mode ?? null,
        dwell_start: detail.dwell_start ?? null,
        received_at: Date.now(),
      });
    };

    window.addEventListener(MOTION_EVENT, handleUpdate);
    return () => window.removeEventListener(MOTION_EVENT, handleUpdate);
  }, []);

  return motion;
}

// Tradução dos três estados internos para o que o agente lê. STATIONARY e
// RESTING são ambos "parado" — a distinção entre uma paragem curta e uma
// permanência confirmada é operacional, não interessa a quem está no terreno.
// O repouso acrescenta há quanto tempo, que é informação concreta e útil para
// confirmar o tempo já passado num estabelecimento.
export function describeMotion(motion: MotionState | null, now = Date.now()): MotionDisplay {
  if (!motion || now - motion.received_at > STALE_MS) {
    return { moving: false, label: '', known: false, travelMode: null };
  }

  const travelMode = motion.travel_mode;

  if (motion.state === 'MOVING') {
    return { moving: true, label: 'Em movimento', known: true, travelMode };
  }

  if (motion.state === 'RESTING' && motion.dwell_start) {
    const minutes = Math.floor((now - motion.dwell_start) / 60000);
    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60);
      const rest = minutes % 60;
      return {
        moving: false,
        label: rest > 0 ? `Parado há ${hours}h${String(rest).padStart(2, '0')}` : `Parado há ${hours}h`,
        known: true,
        travelMode,
      };
    }
    if (minutes >= 1) {
      return { moving: false, label: `Parado há ${minutes} min`, known: true, travelMode };
    }
  }

  return { moving: false, label: 'Parado', known: true, travelMode };
}
