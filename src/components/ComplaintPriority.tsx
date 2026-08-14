import { Flame } from 'lucide-react';
import type { DenunciaCampo } from '../db/db';

const STYLE: Record<DenunciaCampo['priority'], { label: string; className: string }> = {
  low: { label: 'Baixa', className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  normal: { label: 'Normal', className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-500/10 dark:text-yellow-300' },
  high: { label: 'Alta', className: 'bg-orange-100 text-orange-800 dark:bg-orange-500/10 dark:text-orange-300' },
  urgent: { label: 'Urgente', className: 'bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-300' },
};

export default function ComplaintPriority({ priority }: { priority: DenunciaCampo['priority'] }) {
  const style = STYLE[priority];
  return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[9px] font-black uppercase ${style.className}`}><Flame className="h-3 w-3" />{style.label}</span>;
}
