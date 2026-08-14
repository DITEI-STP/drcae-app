import type {ModalidadeFiscalizacao} from './inspectionModality';

export function inspectionStepOrder(
  modalidade:ModalidadeFiscalizacao|null,
  hasComplaint = false,
):readonly string[] {
  const base = modalidade === 'iterativa'
    ? ['operador', 'equipa', 'tela', 'revisao']
    : ['operador', 'equipa', 'infracoes', 'apreensao', 'provas', 'cestaBasica', 'recomendacoes', 'revisao'];
  return hasComplaint ? [...base.slice(0, -1), 'denuncia', 'revisao'] : base;
}
