import { useEffect, useState } from 'react';
import * as api from './api';
import { getDeviceIdentity, storeDeviceIdentity, type DeviceIdentity } from './pairing';

/**
 * Identidade do dispositivo (alias + código) para apresentação.
 *
 * Há três origens possíveis, por ordem de disponibilidade:
 *   1. credenciais de emparelhamento locais — só existem quando o
 *      emparelhamento foi feito na própria web app (acesso por browser);
 *   2. `drcae_device_identity` — escrito pelo shell nativo antes de a página
 *      carregar e pelo handshake do webview;
 *   3. o servidor (`auth/device-status`), pelo `device_id` — rede de segurança
 *      para quando nenhuma das anteriores existe (por exemplo, um APK antigo a
 *      abrir um bundle novo).
 *
 * Estar no ecrã de login implica dispositivo emparelhado, pelo que a ausência
 * de identidade é sempre um problema de propagação — nunca um estado normal.
 */
export function useDeviceIdentity(): DeviceIdentity | null {
  const [identity, setIdentity] = useState<DeviceIdentity | null>(getDeviceIdentity);

  useEffect(() => {
    let cancelled = false;

    const apply = (next: DeviceIdentity | null) => {
      if (cancelled || !next || (!next.device_code && !next.alias)) return;
      storeDeviceIdentity(next);
      setIdentity(next);
    };

    const onNativeIdentity = (event: Event) => {
      apply((event as CustomEvent<DeviceIdentity>).detail);
    };

    const resolveFromServer = async () => {
      const current = getDeviceIdentity();
      if (current?.device_code || current?.alias) return;
      try {
        const status = await api.checkDeviceStatus();
        apply({ device_code: status.device_code ?? null, alias: status.alias ?? null });
      } catch {
        // Sem rede: fica pelo que houver localmente e tenta de novo ao ligar.
      }
    };

    window.addEventListener('drcae-device-identity', onNativeIdentity);
    window.addEventListener('online', resolveFromServer);
    void resolveFromServer();

    return () => {
      cancelled = true;
      window.removeEventListener('drcae-device-identity', onNativeIdentity);
      window.removeEventListener('online', resolveFromServer);
    };
  }, []);

  return identity;
}
