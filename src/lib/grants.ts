// Privilege enforcement for drcae-app — mirrors drcae-admin's
// src/utils/grants.ts, but scoped to the `app:page:*` / `app:transaction:*`
// resource families. The backend hands over the officer's current grant
// keys at login (auth/login) and on every sync pull (sync/pull), so the
// app can gate its own menus/actions the same way the admin SPA does.
import { useEffect, useState } from 'react';

const GRANTS_STORAGE_KEY = 'drcae_app_grants';
const GRANTS_UPDATED_EVENT = 'drcae:grants-updated';

export function setStoredGrants(grants: string[] | undefined | null): void {
  const list = Array.isArray(grants) ? grants : [];
  localStorage.setItem(GRANTS_STORAGE_KEY, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent(GRANTS_UPDATED_EVENT, { detail: { grants: list } }));
}

export function getStoredGrants(): string[] {
  try {
    const raw = localStorage.getItem(GRANTS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function clearStoredGrants(): void {
  localStorage.removeItem(GRANTS_STORAGE_KEY);
  window.dispatchEvent(new CustomEvent(GRANTS_UPDATED_EVENT, { detail: { grants: [] } }));
}

export function hasAppGrant(key: string): boolean {
  return getStoredGrants().includes(key);
}

export function hasAnyAppGrant(keys: string[]): boolean {
  if (keys.length === 0) return true;
  const grants = getStoredGrants();
  return keys.some((k) => grants.includes(k));
}

/** Reactive grants list — updates whenever login/sync refreshes them. */
export function useAppGrants(): string[] {
  const [grants, setGrants] = useState<string[]>(() => getStoredGrants());

  useEffect(() => {
    const onUpdate = (event: Event) => {
      const detail = (event as CustomEvent<{ grants: string[] }>).detail;
      setGrants(detail?.grants ?? getStoredGrants());
    };
    window.addEventListener(GRANTS_UPDATED_EVENT, onUpdate);
    return () => window.removeEventListener(GRANTS_UPDATED_EVENT, onUpdate);
  }, []);

  return grants;
}
