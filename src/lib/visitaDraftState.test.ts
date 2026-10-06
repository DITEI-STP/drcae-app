import { describe, expect, it } from 'vitest';
import {
  DRAFT_VERSION,
  describeDraft,
  parseDraft,
  passoDoRascunho,
  serializeDraft,
  type DraftPayload,
} from './visitaDraftState';

const payload: DraftPayload = {
  modalidade: 'iterativa',
  visitaId: 'v1',
  stepKey: 'tela',
  firmaId: 'f1',
  representante: { name: 'Ana', docType: '', docNumber: '', role: '' } as DraftPayload['representante'],
  atividadeEconomica: 'Comércio',
  date: '2026-08-03',
  time: '10:00',
  technicians: [],
  infracoes: [],
  recomendacoes: [],
  recomendacoesHistoricas: [],
  notes: '',
  apreensaoActiva: true,
  apreensaoSemInfracao: false,
  apreensaoJustificacao: '',
  apreensaoItens: [
    {
      constatacaoId: 'c1',
      assetSupply: 7,
      designation: 'Arroz',
      quantity: '10',
      assetUnit: 2,
      custody: 'trustee',
      note: '',
    },
  ],
  trustee: {
    kind: 'operator',
    name: '',
    docType: '',
    docNumber: '',
    role: '',
    contact: '',
  },
  produtosPrices: { 7: { gross: '', retail: '120', constatacaoId: 'c1' } },
  coberturaReconhecida: ['provas'],
};

const ORDEM_ITERATIVA = ['operador', 'equipa', 'tela', 'revisao'] as const;

describe('serializeDraft / parseDraft', () => {
  it('faz a viagem de ida e volta com o estado que antes se perdia', () => {
    // Apreensão, preços, depositário e cobertura eram exactamente o que o
    // rascunho não gravava — o auto levantado desaparecia ao recuperar.
    const lido = parseDraft(serializeDraft(payload, 1_700_000_000_000));
    expect(lido?.apreensaoItens).toEqual(payload.apreensaoItens);
    expect(lido?.produtosPrices).toEqual(payload.produtosPrices);
    expect(lido?.trustee).toEqual(payload.trustee);
    expect(lido?.coberturaReconhecida).toEqual(['provas']);
    expect(lido?.apreensaoActiva).toBe(true);
    expect(lido?.savedAt).toBe(1_700_000_000_000);
    expect(lido?.draftVersion).toBe(DRAFT_VERSION);
  });

  it('devolve nulo sem rascunho e com JSON inválido', () => {
    expect(parseDraft(null)).toBeNull();
    expect(parseDraft('')).toBeNull();
    expect(parseDraft('{nao é json')).toBeNull();
  });

  it('rejeita o que não é um objecto', () => {
    expect(parseDraft('[]')).toBeNull();
    expect(parseDraft('"texto"')).toBeNull();
    expect(parseDraft('null')).toBeNull();
  });

  it('aceita formatos anteriores e restaura o que trouxerem', () => {
    // Descartar um rascunho da versão 2 apagaria trabalho de campo por uma
    // mudança de formato: os campos novos apenas não existem.
    const antigo = JSON.stringify({ draftVersion: 2, savedAt: 1, stepKey: 'equipa', firmaId: 'f1' });
    expect(parseDraft(antigo)?.firmaId).toBe('f1');
  });

  it('assume a versão 1 quando o campo não existe', () => {
    expect(parseDraft(JSON.stringify({ firmaId: 'f1' }))?.draftVersion).toBe(1);
  });

  it('rejeita formato posterior — o bundle revertido não sabe lê-lo', () => {
    const futuro = JSON.stringify({ draftVersion: DRAFT_VERSION + 1, firmaId: 'f1' });
    expect(parseDraft(futuro)).toBeNull();
  });
});

describe('passoDoRascunho', () => {
  it('reabre no passo gravado', () => {
    expect(passoDoRascunho({ stepKey: 'tela' }, ORDEM_ITERATIVA)).toBe(3);
  });

  it.each(['infracoes', 'apreensao', 'provas', 'cestaBasica', 'recomendacoes'])(
    'retoma o antigo passo %s na tela iterativa',
    (stepKey) => {
      expect(passoDoRascunho({ stepKey }, ORDEM_ITERATIVA)).toBe(3);
    },
  );

  it('reabre no primeiro passo quando a chave já não existe na ordem', () => {
    expect(passoDoRascunho({ stepKey: 'removido' }, ORDEM_ITERATIVA)).toBe(1);
    expect(passoDoRascunho({}, ORDEM_ITERATIVA)).toBe(1);
  });
});

describe('describeDraft', () => {
  const formatar = () => '03/08 às 10:30';

  it('diz quando ficou e em que passo', () => {
    const texto = describeDraft({ savedAt: 1, stepKey: 'tela' }, () => 'Constatações', formatar);
    expect(texto).toContain('03/08 às 10:30');
    expect(texto).toContain('«Constatações»');
  });

  it('omite o que não sabe, sem deixar pontuação solta', () => {
    const texto = describeDraft({ savedAt: 0 }, () => undefined, formatar);
    expect(texto.startsWith('Recuperar')).toBe(true);
  });
});
