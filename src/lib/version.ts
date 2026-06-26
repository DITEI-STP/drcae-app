export const DRCAE_APP_VERSION = import.meta.env.VITE_DRCAE_APP_VERSION || '0.0.0-dev';

export function getDrcaeAppVersion() {
  return DRCAE_APP_VERSION;
}

