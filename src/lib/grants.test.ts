import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearStoredGrants,
  getStoredGrants,
  hasAnyAppGrant,
  mergeGrants,
  restoreGrantsFromSnapshot,
  setStoredGrants,
} from './grants';

const NIF = '123456789';

beforeEach(() => {
  localStorage.clear();
});

describe('mergeGrants', () => {
  const current = ['app:page:home', 'app:page:inspections'];

  it('aplica uma lista não vazia', () => {
    const result = mergeGrants(current, ['app:page:map'], 'complete');
    expect(result).toMatchObject({ grants: ['app:page:map'], applied: true });
  });

  it('ignora vazio sem qualificador — o defeito que apagava os menus', () => {
    const result = mergeGrants(current, [], undefined);
    expect(result.applied).toBe(false);
    expect(result.grants).toEqual(current);
  });

  it('ignora vazio com unavailable', () => {
    expect(mergeGrants(current, [], 'unavailable').applied).toBe(false);
  });

  it('ignora a resposta quando o campo grants nem vem', () => {
    const result = mergeGrants(current, undefined, 'complete');
    expect(result.applied).toBe(false);
    expect(result.grants).toEqual(current);
  });

  it('aplica vazio apenas com revoked explícito', () => {
    const result = mergeGrants(current, [], 'revoked');
    expect(result).toMatchObject({ grants: [], applied: true });
  });

  it('mantém a lista em cache mesmo quando unavailable traz chaves', () => {
    // `unavailable` significa que o servidor não resolveu a sessão: nada do
    // que vier com esse estado é fidedigno.
    const result = mergeGrants(current, ['app:page:map'], 'unavailable');
    expect(result.applied).toBe(false);
    expect(result.grants).toEqual(current);
  });

  it('aplica vazio sobre vazio sem se marcar como pendente', () => {
    expect(mergeGrants([], [], undefined)).toMatchObject({ applied: true, grants: [] });
  });
});

describe('snapshot por agente', () => {
  it('sobrevive ao logout e repõe-se no login offline', () => {
    localStorage.setItem('drcae_officer_nif', NIF);
    setStoredGrants(['app:page:home', 'app:page:settings'], 'complete');
    expect(getStoredGrants()).toHaveLength(2);

    // Logout offline: limpa a lista activa, preserva o snapshot.
    clearStoredGrants();
    expect(getStoredGrants()).toEqual([]);

    expect(restoreGrantsFromSnapshot(NIF)).toBe(true);
    expect(getStoredGrants()).toEqual(['app:page:home', 'app:page:settings']);
  });

  it('não herda o snapshot de outro agente no mesmo dispositivo', () => {
    localStorage.setItem('drcae_officer_nif', NIF);
    setStoredGrants(['app:page:home'], 'complete');
    clearStoredGrants();

    expect(restoreGrantsFromSnapshot('987654321')).toBe(false);
    expect(getStoredGrants()).toEqual([]);
  });

  it('não grava snapshot a partir de uma lista vazia', () => {
    localStorage.setItem('drcae_officer_nif', NIF);
    setStoredGrants([], 'revoked');
    expect(restoreGrantsFromSnapshot(NIF)).toBe(false);
  });
});

describe('hasAnyAppGrant', () => {
  it('uma exigência vazia não é um passe livre', () => {
    expect(hasAnyAppGrant([])).toBe(false);
  });

  it('confere contra a lista guardada', () => {
    localStorage.setItem('drcae_officer_nif', NIF);
    setStoredGrants(['app:page:home'], 'complete');
    expect(hasAnyAppGrant(['app:page:map', 'app:page:home'])).toBe(true);
    expect(hasAnyAppGrant(['app:page:map'])).toBe(false);
  });
});
