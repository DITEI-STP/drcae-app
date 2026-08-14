import { Flame, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useComplaintRadar } from '../lib/useComplaintRadar';

export default function ReleasedComplaintsAlert() {
  const { newCount } = useComplaintRadar();
  if (newCount === 0) return null;

  return (
    <Link
      to="/denuncias"
      className="flex items-center gap-3 rounded-2xl border border-orange-200 bg-gradient-to-r from-orange-50 to-amber-50 p-4 text-orange-950 shadow-sm dark:border-orange-500/20 dark:from-orange-500/10 dark:to-amber-500/5 dark:text-orange-100"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-500 text-white shadow-lg shadow-orange-500/20">
        <Flame className="h-5 w-5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-black uppercase tracking-wider">
          {newCount} {newCount === 1 ? 'nova denúncia' : 'novas denúncias'}
        </span>
        <span className="mt-0.5 block text-[11px] font-medium opacity-75">
          Libertada pela triagem e pronta para averiguação.
        </span>
      </span>
      <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
    </Link>
  );
}
