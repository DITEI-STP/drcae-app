/**
 * Nome legível de cada passo do formulário de nova fiscalização.
 *
 * Vive fora do componente porque o diálogo de recuperação do rascunho precisa
 * dele para dizer ao agente onde ficou — e esse diálogo corre antes de o
 * formulário sequer decidir a modalidade.
 */
export const STEP_LABELS: Record<string, string> = {
  operador: 'Operador',
  equipa: 'Equipa',
  denuncia: 'Averiguação da denúncia',
  tela: 'Constatações',
  infracoes: 'Infrações',
  apreensao: 'Apreensão',
  provas: 'Provas',
  cestaBasica: 'Cesta básica',
  recomendacoes: 'Recomendações',
  revisao: 'Revisão',
};
