import { useCallback, useEffect, useRef, useState } from 'react';
import type { Firma } from '../db/db';
import type { NifDecision } from '../lib/registerFirma';

export function useNifCollision() {
  const [matches, setMatches] = useState<Firma[] | null>(null);
  const resolver = useRef<((decision: NifDecision) => void) | null>(null);
  const choose = useCallback((candidates: Firma[]) => new Promise<NifDecision>(resolve => {
    resolver.current = resolve;
    setMatches(candidates);
  }), []);
  const resolve = useCallback((decision: NifDecision) => {
    resolver.current?.(decision); resolver.current = null; setMatches(null);
  }, []);
  useEffect(() => () => { resolver.current?.(null); }, []);
  return { matches, choose, resolve };
}
