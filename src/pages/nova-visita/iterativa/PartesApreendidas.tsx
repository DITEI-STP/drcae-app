import { PackageOpen, Plus, Trash2 } from 'lucide-react';
import ChipGroup from '../../../components/ChipGroup';
import type { ItemApreensaoForm } from '../context';

interface Props {
  /** Partes deste produto, na ordem em que aparecem em `apreensaoItens`. */
  partes: { index: number; item: ItemApreensaoForm }[];
  unitOptions: { value: string; label: string }[];
  onEditar: (index: number, patch: Partial<ItemApreensaoForm>) => void;
  onRemover: (index: number) => void;
  onAcrescentar: () => void;
  /** Desfaz a apreensão deste produto — apaga todas as partes. */
  onDesactivar: () => void;
}

/**
 * Quanto se apreendeu deste produto — e só isso.
 *
 * O destino de cada parte (recolhida pela DRCAE ou entregue a fiel depositário)
 * saiu daqui para a tarefa própria da tela: quem está a contar sacos numa
 * prateleira sabe a quantidade, e ainda não sabe o que a viatura leva. Com as
 * duas perguntas juntas, o destino era respondido por omissão.
 *
 * São várias partes porque «levar dez sacos e deixar quarenta à guarda» é o
 * caso que motiva o auto — o que se separa aqui em quantidades, a tarefa do
 * destino encaminha depois uma a uma.
 */
export default function PartesApreendidas({
  partes,
  unitOptions,
  onEditar,
  onRemover,
  onAcrescentar,
  onDesactivar,
}: Props) {
  // Painel aberto sem nada apreendido: apreender é o que ele existe para
  // oferecer, e um botão nomeado di-lo melhor do que um interruptor à espera.
  if (partes.length === 0) {
    return (
      <button
        type="button"
        onClick={onAcrescentar}
        className="w-full py-5 rounded-xl border-2 border-dashed border-blue-300 dark:border-blue-800 text-blue-700 dark:text-blue-300 flex flex-col items-center gap-1.5 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
      >
        <PackageOpen className="w-5 h-5" />
        <span className="text-xs font-bold uppercase tracking-widest">
          Apreender este produto
        </span>
        <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
          Quantidade e unidade; o destino define-se na tarefa própria.
        </span>
      </button>
    );
  }

  return (
    <div className="space-y-2.5">
      {partes.map(({ index, item }, ordem) => (
        <div key={index} className="space-y-2">
          {partes.length > 1 && (
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-blue-700/70 dark:text-blue-300/70 uppercase tracking-widest">
                Parte {ordem + 1}
              </span>
              <button
                type="button"
                onClick={() => onRemover(index)}
                aria-label={`Remover parte ${ordem + 1}`}
                className="p-1 text-slate-400 hover:text-red-600 rounded-lg transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div className="flex gap-2 items-start">
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={item.quantity}
              onChange={(e) => onEditar(index, { quantity: e.target.value })}
              placeholder="Quantidade"
              className="w-28 shrink-0 p-3 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-100 font-mono"
            />
            <div className="flex-1 min-w-0">
              <ChipGroup
                options={unitOptions}
                value={item.assetUnit == null ? null : String(item.assetUnit)}
                onChange={(unit) => onEditar(index, { assetUnit: Number(unit) })}
                sheetTitle="Unidade de medida"
                searchPlaceholder="Procurar unidade..."
                emptyLabel="Unidades de medida por sincronizar."
                maxInline={4}
              />
            </div>
          </div>
        </div>
      ))}

      <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 leading-snug">
        O destino de cada parte define-se na tarefa «Destino da apreensão».
      </p>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onAcrescentar}
          className="flex-1 py-2.5 rounded-xl border border-dashed border-blue-300 dark:border-blue-800 text-[10px] font-bold uppercase tracking-widest text-blue-700 dark:text-blue-300 flex items-center justify-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" />
          Outra parte
        </button>
        <button
          type="button"
          onClick={onDesactivar}
          className="px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 hover:text-red-600 hover:border-red-200 transition-colors"
        >
          Não apreender
        </button>
      </div>
    </div>
  );
}
