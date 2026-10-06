export function inspectionStepOrder(hasComplaint = false): readonly string[] {
  const base = ['operador', 'equipa', 'tela', 'revisao'] as const;
  return hasComplaint ? [...base.slice(0, -1), 'denuncia', 'revisao'] : base;
}
