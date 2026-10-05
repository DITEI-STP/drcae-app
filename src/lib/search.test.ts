import { describe, expect, it } from 'vitest';
import { matchesSearch, normalizeSearch, searchTokens } from './search';

describe('pesquisa abrangente', () => {
  it('ignora acentos, caixa, pontuação e espaços repetidos', () => {
    expect(normalizeSearch('  Café—São   TOMÉ  ')).toBe('cafe sao tome');
  });

  it('encontra palavras em qualquer ordem', () => {
    expect(matchesSearch('silva joao', ['João da Silva Comércio'])).toBe(true);
    expect(matchesSearch('joao silva', ['João da Silva Comércio'])).toBe(true);
  });

  it('combina termos que estão em campos diferentes', () => {
    expect(matchesSearch('nova 5123', ['Empresa Nova', '512 345 678'])).toBe(true);
  });

  it('aceita identificadores com ou sem separadores', () => {
    expect(matchesSearch('alv202477', ['ALV-2024/77'])).toBe(true);
  });

  it('exige todos os termos e elimina repetições da consulta', () => {
    expect(matchesSearch('cafe norte', ['Café Central', 'Sul'])).toBe(false);
    expect(searchTokens('café cafe CAFÉ')).toEqual(['cafe']);
  });
});
