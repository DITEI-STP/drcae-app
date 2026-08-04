import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/db';
import { setActiveKey } from './crypto';
import {
  readRepresentantesDaFirma,
  rememberRepresentante,
  syncRepresentantes,
} from './representantesCache';

/**
 * Estas funções correm contra a base **real**, e não contra um duplo.
 *
 * As duas estiveram partidas em produção porque chamavam métodos que o
 * envolvente de cifra não imita (`clear`, `filter`, `first`) e envolviam tudo
 * em `catch` mudo: falhavam sempre, em silêncio, e o campo do representante
 * ficava vazio no terreno sem nenhum rasto. Um teste com a tabela simulada
 * teria passado à mesma — é a API do envolvente que tem de ser exercitada.
 */

const FIRMA = 'firma-1';

beforeEach(async () => {
  // A tabela é cifrada: sem chave activa, toda a escrita lança «Base de dados
  // bloqueada» — que é o estado real de um dispositivo por desbloquear, e não
  // aquilo que estas funções têm de suportar.
  setActiveKey({ type: 'fallback', hash: new Uint8Array(32) });
  await db.table('representantes').clear();
});

describe('rememberRepresentante', () => {
  it('memoriza o representante do acto para a fiscalização seguinte', async () => {
    await rememberRepresentante(FIRMA, {
      name: 'Ana Costa',
      docType: 'bi',
      docNumber: '123456',
      role: 'Gerente',
    });

    const lista = await readRepresentantesDaFirma(FIRMA);
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ name: 'Ana Costa', docNumber: '123456' });
  });

  it('não duplica quem já está registado com o mesmo documento', async () => {
    await rememberRepresentante(FIRMA, { name: 'Ana Costa', docType: 'bi', docNumber: '123456' });
    await rememberRepresentante(FIRMA, { name: 'Ana C. Costa', docType: 'bi', docNumber: '123456' });

    const lista = await readRepresentantesDaFirma(FIRMA);
    expect(lista).toHaveLength(1);
    // O nome mais recente prevalece; a desduplicação é pelo documento.
    expect(lista[0].name).toBe('Ana C. Costa');
  });

  it('trata como pessoas distintas dois nomes iguais com documentos diferentes', async () => {
    await rememberRepresentante(FIRMA, { name: 'João Silva', docType: 'bi', docNumber: '111' });
    await rememberRepresentante(FIRMA, { name: 'João Silva', docType: 'bi', docNumber: '222' });
    expect(await readRepresentantesDaFirma(FIRMA)).toHaveLength(2);
  });

  it('ignora registos sem nome ou sem documento', async () => {
    await rememberRepresentante(FIRMA, { name: '  ', docType: 'bi', docNumber: '123' });
    await rememberRepresentante(FIRMA, { name: 'Sem doc', docType: 'bi', docNumber: '  ' });
    expect(await readRepresentantesDaFirma(FIRMA)).toHaveLength(0);
  });

  it('não mistura representantes de operadores diferentes', async () => {
    await rememberRepresentante(FIRMA, { name: 'Ana', docType: 'bi', docNumber: '1' });
    await rememberRepresentante('firma-2', { name: 'Bruno', docType: 'bi', docNumber: '2' });

    expect(await readRepresentantesDaFirma(FIRMA)).toHaveLength(1);
    expect(await readRepresentantesDaFirma('firma-2')).toHaveLength(1);
  });
});

describe('syncRepresentantes', () => {
  it('grava o que veio do pull', async () => {
    await syncRepresentantes([
      { id: 'r1', firmaId: FIRMA, name: 'Ana', docType: 'bi', docNumber: '1', synced: true },
      { id: 'r2', firmaId: FIRMA, name: 'Bruno', docType: 'nif', docNumber: '2', synced: true },
    ]);
    expect(await readRepresentantesDaFirma(FIRMA)).toHaveLength(2);
  });

  it('uma lista vazia não apaga o que já existe', async () => {
    // Mesma razão dos grants e dos agentes: um vazio é quase sempre falha de
    // resolução, e os chips são a única defesa contra escrever o nome à mão.
    await rememberRepresentante(FIRMA, { name: 'Ana', docType: 'bi', docNumber: '1' });
    await syncRepresentantes([]);
    await syncRepresentantes(null);
    expect(await readRepresentantesDaFirma(FIRMA)).toHaveLength(1);
  });
});
