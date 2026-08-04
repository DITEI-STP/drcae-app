import { describe, expect, it } from 'vitest';
import { abreviaturaDocumento, nomeDocumento } from './documentType';

describe('abreviaturaDocumento', () => {
  it('prefere a abreviatura declarada pela DRCAE', () => {
    expect(
      abreviaturaDocumento({ code: 'passport', name: 'Passaporte', meta: { abbr: 'pass' } }),
    ).toBe('PASS');
  });

  it('cai no code quando a DRCAE ainda não preencheu', () => {
    // Estado de hoje: BI e NIF já saem certos sem ninguém fazer nada.
    expect(abreviaturaDocumento({ code: 'bi', name: 'Bilhete de Identidade' })).toBe('BI');
    expect(abreviaturaDocumento({ code: 'nif', name: 'NIF', meta: {} })).toBe('NIF');
  });

  it('trunca para caber ao lado do número do documento', () => {
    expect(abreviaturaDocumento({ code: 'residence', name: 'Cartão de Residência' }))
      .toHaveLength(6);
  });

  it('ignora abreviatura vazia ou só com espaços', () => {
    expect(abreviaturaDocumento({ code: 'bi', name: 'BI', meta: { abbr: '   ' } })).toBe('BI');
  });

  it('ignora abreviatura que não é texto', () => {
    expect(abreviaturaDocumento({ code: 'bi', name: 'BI', meta: { abbr: 7 } })).toBe('BI');
  });

  it('recorre ao nome quando não há code nem abbr', () => {
    // Um tipo criado à mão sem código não pode ficar sem rótulo no chip.
    expect(abreviaturaDocumento({ code: '', name: 'Outro documento' })).toBe('OUTRO ');
  });

  it('nunca devolve vazio', () => {
    expect(abreviaturaDocumento({ code: '', name: '' })).toBe('?');
  });
});

describe('nomeDocumento', () => {
  it('devolve o nome por extenso', () => {
    expect(nomeDocumento({ code: 'bi', name: 'Bilhete de Identidade' }))
      .toBe('Bilhete de Identidade');
  });

  it('cai na abreviatura sem nome', () => {
    expect(nomeDocumento({ code: 'bi', name: '' })).toBe('BI');
  });
});
