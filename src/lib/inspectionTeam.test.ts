import { describe, expect, it } from 'vitest';
import { ensureLoggedOfficer, selectableOfficers } from './inspectionTeam';

const logged = { uid: 'agente-logado', name: 'Ana Fiscal', number: '17' };
const colleague = { uid: 'colega', name: 'Bento Fiscal', number: '22' };

describe('equipa da fiscalização', () => {
  it('inclui sempre o agente autenticado, mesmo quando a equipa guardada está vazia', () => {
    expect(ensureLoggedOfficer([], logged)).toEqual([logged]);
  });

  it('não apresenta o agente autenticado entre as opções e preserva colegas', () => {
    expect(selectableOfficers([logged, colleague], logged)).toEqual([colleague]);
    expect(ensureLoggedOfficer([colleague], logged)).toEqual([logged, colleague]);
  });
});
