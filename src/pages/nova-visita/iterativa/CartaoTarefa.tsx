import { ChevronRight, type LucideIcon } from 'lucide-react';
import { cn } from '../../../lib/utils';

interface Props {
  icone: LucideIcon;
  titulo: string;
  feitos: number;
  total: number;
  onAbrir: () => void;
}

/**
 * Tarefa da tela iterativa (SPEC-10 §6.3).
 *
 * A tela tem duas coisas, e apenas duas: constatações que o agente cria, e
 * tarefas que ele tem de fechar. As tarefas são o que nasce com a fiscalização
 * e não com o que ele encontrou — a lista de preços do livro em vigor e as
 * recomendações deixadas na visita anterior.
 *
 * O progresso está sempre à vista porque é ele que substitui a cobertura que o
 * formulário por passos garantia por tédio: uma lista fechada por percorrer tem
 * de se ver de relance, sem abrir nada.
 */
export default function CartaoTarefa({ icone: Icone, titulo, feitos, total, onAbrir }: Props) {
  const completa = total > 0 && feitos >= total;

  return (
    <button
      type="button"
      onClick={onAbrir}
      className={cn(
        'w-full text-left p-4 rounded-2xl border flex items-center gap-3 transition-colors',
        completa
          ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'
          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800',
      )}
    >
      <span
        className={cn(
          'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
          completa
            ? 'bg-emerald-600 text-white'
            : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400',
        )}
      >
        <Icone className="w-5 h-5" />
      </span>

      <span className="flex-1 min-w-0">
        <span className="block text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
          {titulo}
        </span>
        <span
          className={cn(
            'block text-[10px] font-bold uppercase tracking-widest mt-0.5',
            completa
              ? 'text-emerald-700 dark:text-emerald-400'
              : 'text-amber-600 dark:text-amber-400',
          )}
        >
          {feitos}/{total} {completa ? 'concluído' : 'por fazer'}
        </span>
      </span>

      <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
    </button>
  );
}
