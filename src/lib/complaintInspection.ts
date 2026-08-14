import type { ComplaintVerification, DenunciaCampo } from '../db/db';

const PRIORITY = { urgent: 4, high: 3, normal: 2, low: 1 } as const;

export function selectComplaintForInspection(
  complaints: DenunciaCampo[],
  operatorId: string,
): DenunciaCampo | null {
  return complaints
    .filter((item) => item.operatorId === operatorId && !item.fieldOutcome)
    .sort((a, b) => PRIORITY[b.priority] - PRIORITY[a.priority]
      || b.releasedAt.localeCompare(a.releasedAt))[0] ?? null;
}

export function complaintVerificationGaps(input: {
  verification: ComplaintVerification | null;
  findingCount: number;
  evidenceCount: number;
}): string[] {
  const gaps: string[] = [];
  if (input.findingCount < 1) gaps.push('Abra pelo menos uma constatação.');
  if (input.evidenceCount < 1) gaps.push('Junte pelo menos uma prova recolhida no local.');
  if (!input.verification) gaps.push('Classifique o resultado da averiguação.');
  if ((input.verification?.note.trim().length ?? 0) < 20) gaps.push('Fundamente a conclusão com pelo menos 20 caracteres.');
  return gaps;
}
