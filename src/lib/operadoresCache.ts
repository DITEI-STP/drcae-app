import { useEffect, useState } from 'react';
import { db, onDatabaseWrite, type Firma, type Visita, type Infracao } from '../db/db';
import { semRascunhos } from './visitaDraft';

// Cache em memória dos operadores e do histórico já desencriptados.
//
// Existe por causa do custo da cifra em repouso: cada leitura desencripta
// registo a registo (AES-GCM, ver db.ts), e o parque tem ~1760 operadores. Sem
// cache, cada entrada no ecrã inicial pagava milhares de operações de
// criptografia no thread principal — o que se sentia como a navegação a
// travar. Duas vistas a lerem as mesmas tabelas duplicavam o custo.
//
// Não enfraquece a cifra em repouso: estes dados já passavam por memória a
// cada leitura. O que muda é ficarem lá enquanto a sessão durar.
//
// A invalidação é por escrita, e não por tempo: mais simples de raciocinar e
// sem janela em que se mostrem dados velhos.

export interface OperadoresSnapshot {
  firmas: Firma[];
  visitas: Visita[];
  infracoes: Infracao[];
}

const EMPTY: OperadoresSnapshot = { firmas: [], visitas: [], infracoes: [] };

let cache: OperadoresSnapshot | null = null;
let inFlight: Promise<OperadoresSnapshot> | null = null;
const listeners = new Set<(snapshot: OperadoresSnapshot) => void>();

async function readAll(): Promise<OperadoresSnapshot> {
  const [firmas, visitas, infracoes] = await Promise.all([
    db.firmas.toArray(),
    db.visitas.toArray().then(semRascunhos),
    db.infracoes.toArray(),
  ]);
  return { firmas, visitas, infracoes };
}

// Chamadas concorrentes partilham a mesma leitura: sem isto, o Dashboard e o
// radar a montarem juntos disparariam duas travessias completas antes de a
// primeira terminar — exactamente a duplicação que se quer evitar.
export async function loadOperadores(force = false): Promise<OperadoresSnapshot> {
  if (!force && cache) return cache;
  if (!inFlight) {
    inFlight = readAll()
      .then((snapshot) => {
        cache = snapshot;
        listeners.forEach((listener) => listener(snapshot));
        return snapshot;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

// Invalidação automática: qualquer escrita nas tabelas encriptadas notifica
// daqui (ver onDatabaseWrite em db.ts). Fica num único ponto em vez de espalhada
// por cada local que grava, para que nenhuma escrita futura se possa esquecer.
//
// Só recarrega se já houver quem esteja a consumir; caso contrário deixa a
// cache vazia para o próximo consumidor a preencher.
onDatabaseWrite(() => {
  cache = null;
  if (listeners.size > 0) void loadOperadores(true);
});

// Snapshot partilhado. `loading` distingue "ainda não carregou" de "carregou e
// está vazio" — sem isso, o radar mostraria "nenhum operador mapeado" durante o
// primeiro carregamento, o que seria falso.
export function useOperadores(): { data: OperadoresSnapshot; loading: boolean } {
  const [data, setData] = useState<OperadoresSnapshot>(() => cache ?? EMPTY);
  const [loading, setLoading] = useState(() => cache === null);

  useEffect(() => {
    let active = true;

    const listener = (snapshot: OperadoresSnapshot) => {
      if (!active) return;
      setData(snapshot);
      setLoading(false);
    };
    listeners.add(listener);

    if (cache) {
      setData(cache);
      setLoading(false);
    } else {
      // Diferido para depois da pintura: o ecrã aparece de imediato com o que é
      // barato (as contagens usam count(), que não desencripta nada) e o resto
      // chega sem prender a interface.
      const handle = window.setTimeout(() => {
        void loadOperadores();
      }, 0);
      return () => {
        active = false;
        listeners.delete(listener);
        window.clearTimeout(handle);
      };
    }

    return () => {
      active = false;
      listeners.delete(listener);
    };
  }, []);

  return { data, loading };
}
