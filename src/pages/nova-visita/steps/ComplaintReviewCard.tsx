import { ClipboardCheck, Paperclip } from 'lucide-react';
import type { ComplaintVerification, DenunciaCampo } from '../../../db/db';

const OUTCOME = {
  confirmed: 'Factos confirmados',
  'not-confirmed': 'Factos não confirmados',
  inconclusive: 'Resultado inconclusivo',
};

export default function ComplaintReviewCard({ complaint, verification, evidenceCount }: {
  complaint?: DenunciaCampo;
  verification: ComplaintVerification | null;
  evidenceCount: number;
}) {
  if (!complaint) return null;
  return (
    <section className="rounded-2xl border border-blue-200 bg-blue-50/60 p-5 text-left dark:border-blue-500/20 dark:bg-blue-500/5">
      <h4 className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-blue-700 dark:text-blue-300"><ClipboardCheck className="h-4 w-4" />Averiguação da denúncia {complaint.code}</h4>
      <p className="mt-3 text-sm font-black text-slate-900 dark:text-white">{verification ? OUTCOME[verification.outcome] : 'Sem resultado'}</p>
      <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-slate-600 dark:text-slate-300">{verification?.note || 'Sem fundamentação.'}</p>
      <p className="mt-3 flex items-center gap-1.5 text-xs font-bold text-slate-500 dark:text-slate-400"><Paperclip className="h-3.5 w-3.5" />{evidenceCount} prova(s) recolhida(s) nesta fiscalização</p>
    </section>
  );
}
