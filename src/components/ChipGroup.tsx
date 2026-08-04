import React, { useMemo, useState } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { cn } from '../lib/utils';
import PickerSheet, { type PickerOption } from './PickerSheet';

// Quantos chips ficam inline antes de a lista passar a ser acedida pela folha.
// Oito cabem em duas linhas na largura de um telemóvel sem empurrar o resto do
// formulário para fora do ecrã.
const DEFAULT_MAX_INLINE = 8;

interface Props {
  label?: string;
  options: PickerOption[];
  value: string | null;
  onChange: (value: string) => void;
  /** Título da folha aberta pelo «Ver todos». Por omissão usa `label`. */
  sheetTitle?: string;
  maxInline?: number;
  /**
   * `wrap` para campos de formulário; `scroll` para uma única linha com
   * deslocamento horizontal, quando o controlo vive num cabeçalho apertado.
   */
  layout?: 'wrap' | 'scroll';
  searchPlaceholder?: string;
  emptyLabel?: string;
  className?: string;
}

/**
 * Escolha de uma opção entre poucas, com tudo à vista e um toque por escolha.
 *
 * Substitui o `<select>` nativo, que num tablet abre um selector do sistema por
 * cima do formulário e esconde as hipóteses até se lhe tocar — dois gestos para
 * ler o que existe, e nenhuma pista visual do que já foi preenchido.
 *
 * As listas que alimentam estes campos (`tdocument`, `unit`, ramos) são
 * configuradas pela DRCAE em runtime e não têm tamanho garantido. Quando
 * crescem, os primeiros `maxInline` continuam inline e o resto fica atrás de um
 * chip «Ver todos», que abre o `PickerSheet` com pesquisa. A opção escolhida é
 * promovida para a fila visível mesmo que esteja fora dos primeiros: o agente
 * tem de conseguir ler o que preencheu sem abrir nada.
 */
export default function ChipGroup({
  label,
  options,
  value,
  onChange,
  sheetTitle,
  maxInline = DEFAULT_MAX_INLINE,
  layout = 'wrap',
  searchPlaceholder,
  emptyLabel = 'Sem opções sincronizadas.',
  className,
}: Props) {
  const [sheetOpen, setSheetOpen] = useState(false);

  const visible = useMemo(() => {
    if (options.length <= maxInline) return options;

    const head = options.slice(0, maxInline);
    const selected = value === null ? undefined : options.find((o) => o.value === value);
    if (!selected || head.some((o) => o.value === selected.value)) return head;

    return [selected, ...head.slice(0, maxInline - 1)];
  }, [options, value, maxInline]);

  const hasOverflow = options.length > visible.length;

  return (
    <div className={cn('space-y-2', className)}>
      {label && (
        <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest pl-1 block">
          {label}
        </label>
      )}

      {options.length === 0 ? (
        <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 pl-1">
          {emptyLabel}
        </p>
      ) : (
        <div
          className={cn(
            'flex gap-2',
            layout === 'wrap'
              ? 'flex-wrap'
              : // `-mx-1 px-1` dá folga para o anel de foco do primeiro e do
                // último chip não ser cortado pelo overflow.
                'overflow-x-auto flex-nowrap -mx-1 px-1 pb-1',
          )}
        >
          {visible.map((option) => {
            const selected = option.value === value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => onChange(option.value)}
                aria-pressed={selected}
                className={cn(
                  'min-h-[44px] px-4 rounded-full text-[11px] font-bold border transition-colors shrink-0',
                  selected
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-blue-400',
                )}
              >
                {option.label}
              </button>
            );
          })}

          {hasOverflow && (
            <button
              type="button"
              onClick={() => setSheetOpen(true)}
              className="min-h-[44px] px-4 rounded-full text-[11px] font-bold border border-dashed border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 flex items-center gap-1.5 transition-colors hover:border-blue-400 shrink-0"
            >
              <MoreHorizontal className="w-3.5 h-3.5" />
              Ver todos ({options.length})
            </button>
          )}
        </div>
      )}

      <PickerSheet
        open={sheetOpen}
        title={sheetTitle ?? label ?? 'Escolher'}
        options={options}
        value={value}
        onSelect={onChange}
        onClose={() => setSheetOpen(false)}
        searchPlaceholder={searchPlaceholder}
      />
    </div>
  );
}
