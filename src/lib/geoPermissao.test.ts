import { describe, expect, it } from 'vitest';
import { decidirEdicaoDePonto, temPontoDefinido } from './geoPermissao';

describe('temPontoDefinido', () => {
  it('aceita uma coordenada utilizável', () => {
    expect(temPontoDefinido({ lat: 0.336, lng: 6.73 })).toBe(true);
  });

  it('recusa a ausência de ponto', () => {
    expect(temPontoDefinido(null)).toBe(false);
    expect(temPontoDefinido(undefined)).toBe(false);
    expect(temPontoDefinido({})).toBe(false);
  });

  it('recusa (0, 0)', () => {
    // O GPS devolve zeros antes de fixar. Tratá-los como coordenada válida
    // deixava a firma marcada no meio do Golfo da Guiné, sem forma de corrigir.
    expect(temPontoDefinido({ lat: 0, lng: 0 })).toBe(false);
  });

  it('recusa valores impossíveis', () => {
    expect(temPontoDefinido({ lat: 120, lng: 6 })).toBe(false);
    expect(temPontoDefinido({ lat: Number.NaN, lng: 6 })).toBe(false);
  });
});

describe('decidirEdicaoDePonto', () => {
  it('deixa marcar quando não há ponto, mesmo sem permissão', () => {
    // Registo em falta não é correcção de facto: qualquer agente o completa.
    const decisao = decidirEdicaoDePonto(null, false);
    expect(decisao).toEqual({ permitido: true, accao: 'marcar' });
  });

  it('deixa marcar quando o ponto é (0, 0)', () => {
    expect(decidirEdicaoDePonto({ lat: 0, lng: 0 }, false).permitido).toBe(true);
  });

  it('exige permissão para alterar um ponto já definido', () => {
    const decisao = decidirEdicaoDePonto({ lat: 0.336, lng: 6.73 }, false);
    expect(decisao.permitido).toBe(false);
    expect(decisao.accao).toBe('alterar');
    // Nunca «bloqueado» sem porquê: a mensagem diz o que falta e a quem pedir.
    expect(decisao.motivo).toMatch(/permissão/);
  });

  it('deixa alterar com permissão', () => {
    expect(decidirEdicaoDePonto({ lat: 0.336, lng: 6.73 }, true)).toEqual({
      permitido: true,
      accao: 'alterar',
    });
  });
});
