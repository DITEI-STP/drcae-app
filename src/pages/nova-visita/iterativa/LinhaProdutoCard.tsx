import React, { useState } from 'react';
import { Package, Tag, Trash2 } from 'lucide-react';
import { cn } from '../../../lib/utils';
import PartesApreendidas from './PartesApreendidas';
import PrecoDoProduto from './PrecoDoProduto';
import {
  painelInicialDoProduto,
  type LinhaProduto,
  type PainelProduto,
} from '../../../lib/produtosDaConstatacao';
import { temValor } from '../../../lib/priceOwnership';
import type { ItemApreensaoForm, PrecoPorProduto } from '../context';

type Avaliacao = 'conforme' | 'nao_conforme';

interface Props {
  linha: LinhaProduto;
  preco: PrecoPorProduto[number] | undefined;
  /** Preço de referência do livro em vigor, quando o operador tem um. */
  precoDoLivro: number | null;
  /** O preço mostrado veio da check list da cesta básica, não desta constatação. */
  precoDeOutraOrigem: boolean;
  /** Sem livro em vigor a conformidade é classificada à mão. */
  semLivro: boolean;
  /** Partes apreendidas desta linha, na ordem em que aparecem em `apreensaoItens`. */
  partes: { index: number; item: ItemApreensaoForm }[];
  unitOptions: { value: string; label: string }[];
  onPreco: (campo: 'gross' | 'retail', valor: string) => void;
  onAvaliar: (campo: 'grossEval' | 'retailEval', valor: Avaliacao) => void;
  onAcrescentarParte: () => void;
  onEditarParte: (index: number, patch: Partial<ItemApreensaoForm>) => void;
  onRemoverParte: (index: number) => void;
  /** Desfaz a apreensão deste produto. */
  onRemoverApreensao: () => void;
  onRemover: () => void;
}

/**
 * Um produto dentro da constatação: o que se leu do preço, e o que se levou.
 *
 * Os dois vivem em painéis separados, um de cada vez. Mostrados ao mesmo tempo,
 * o cartão de um produto que o agente só queria cotar abria com dez campos —
 * quatro de preço, quantidade, unidade e o resto —, e a densidade fazia-o
 * hesitar em cada produto novo. Qual abre é derivado do que o produto já é
 * (`painelInicialDoProduto`), e não uma pergunta; o outro está a um toque, com
 * o seu estado à vista no próprio separador.
 *
 * O que se regista da apreensão é **quanto**; para onde foi é a tarefa
 * «Destino da apreensão» que pergunta.
 */
const LinhaProdutoCard: React.FC<Props> = ({
  linha,
  preco,
  precoDoLivro,
  precoDeOutraOrigem,
  semLivro,
  partes,
  unitOptions,
  onPreco,
  onAvaliar,
  onAcrescentarParte,
  onEditarParte,
  onRemoverParte,
  onRemoverApreensao,
  onRemover,
}) => {
  const temPreco = temValor(preco);
  const apreendido = partes.length > 0;

  const [painel, setPainel] = useState<PainelProduto>(() =>
    painelInicialDoProduto(linha, temPreco),
  );
  // O não catalogado não tem preço possível: sem separadores, o painel é um só.
  const activo: PainelProduto = linha.catalogado ? painel : 'apreensao';

  const separadores = [
    {
      valor: 'preco',
      rotulo: 'Preço',
      icone: Tag,
      // O estado do painel fechado tem de se ler sem o abrir — é o que evita
      // percorrer os produtos um a um para saber o que falta.
      marca: temPreco ? (preco?.retail?.trim() || preco?.gross?.trim()) : null,
    },
    {
      valor: 'apreensao',
      rotulo: 'Apreensão',
      icone: Package,
      marca: apreendido ? String(partes.length) : null,
    },
  ] as const;

  return (
    <div
      className={cn(
        'bg-white dark:bg-slate-900 rounded-2xl border transition-colors',
        apreendido
          ? 'border-blue-200 dark:border-blue-900'
          : 'border-slate-200 dark:border-slate-800',
      )}
    >
      <header className="flex items-start gap-2.5 p-4 pb-3">
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-bold text-slate-800 dark:text-slate-100 leading-snug">
            {linha.designation}
          </p>
          {!linha.catalogado && (
            <span className="inline-block text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400">
              Não catalogado
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onRemover}
          aria-label={`Remover ${linha.designation}`}
          className="p-1.5 -m-1 text-slate-300 dark:text-slate-600 hover:text-red-500 transition-colors shrink-0"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </header>

      <div className="px-4 pb-4 space-y-3">
        {linha.catalogado && (
          <div
            role="tablist"
            className="flex gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800"
          >
            {separadores.map(({ valor, rotulo, icone: Icone, marca }) => {
              const seleccionado = activo === valor;
              return (
                <button
                  key={valor}
                  type="button"
                  role="tab"
                  aria-selected={seleccionado}
                  onClick={() => setPainel(valor)}
                  className={cn(
                    'flex-1 min-h-[38px] px-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors',
                    seleccionado
                      ? 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 shadow-sm'
                      : 'text-slate-500 dark:text-slate-400',
                  )}
                >
                  <Icone className="w-3.5 h-3.5" />
                  {rotulo}
                  {marca && (
                    <span
                      className={cn(
                        'px-1.5 py-0.5 rounded-full text-[9px] font-bold font-mono',
                        valor === 'apreensao'
                          ? 'bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300'
                          : 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300',
                      )}
                    >
                      {marca}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {activo === 'preco' ? (
          <PrecoDoProduto
            preco={preco}
            precoDoLivro={precoDoLivro}
            precoDeOutraOrigem={precoDeOutraOrigem}
            semLivro={semLivro}
            onPreco={onPreco}
            onAvaliar={onAvaliar}
          />
        ) : (
          <>
            {!linha.catalogado && (
              <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 leading-snug">
                Produto fora do catálogo: pode ser apreendido, mas não cotado.
              </p>
            )}
            <PartesApreendidas
              partes={partes}
              unitOptions={unitOptions}
              onEditar={onEditarParte}
              onRemover={onRemoverParte}
              onAcrescentar={onAcrescentarParte}
              onDesactivar={onRemoverApreensao}
            />
          </>
        )}
      </div>
    </div>
  );
};

export default LinhaProdutoCard;
