import React from 'react';
import { Plus, Trash2, PackageOpen, AlertTriangle, ChevronDown } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { useNovaVisitaForm } from '../context';
import { unitOptions } from '../../../lib/units';
import ChipGroup from '../../../components/ChipGroup';
import PickerSheet from '../../../components/PickerSheet';
import DepositarioDoAuto from '../DepositarioDoAuto';
import MotivosPendentes from '../MotivosPendentes';

/**
 * Apreensão de produtos no acto da fiscalização.
 *
 * O destino é escolhido **por item**: uma mesma apreensão pode levar parte dos
 * produtos e deixar outra parte à guarda de um fiel depositário. É essa
 * distinção que determina se fica ou não uma obrigação por cumprir.
 *
 * O estado vive no componente-pai e chega por contexto — ver `../context.ts`.
 *
 * Serve **apenas o formulário por passos**. A modalidade iterativa passou a ter
 * um formulário próprio, onde o produto é um só objecto com preço e partes
 * apreendidas (`iterativa/ProdutosDaConstatacao.tsx`), e o destino de cada
 * parte é tarefa à parte. Os dois coexistem enquanto o piloto
 * comparar as duas formas de trabalhar — ver SPEC-10 §11.1.
 */
export default function StepApreensao() {
  const {
    infracoes,
    apreensaoActiva, setApreensaoActiva,
    apreensaoSemInfracao, setApreensaoSemInfracao,
    apreensaoJustificacao, setApreensaoJustificacao,
    apreensaoItens, setApreensaoItens,
    motivosApreensao,
    supplyProducts,
  } = useNovaVisitaForm();

  // Uma só folha para todos os itens, endereçada pelo índice do item em edição:
  // uma folha por item montaria dezenas de modais só para um estar aberto.
  const [produtoSheetIndex, setProdutoSheetIndex] = React.useState<number | null>(null);

  const unidades = React.useMemo(() => unitOptions(), []);
  const produtoOptions = React.useMemo(
    () => supplyProducts.map((p) => ({ value: String(p.id), label: p.name })),
    [supplyProducts],
  );

  const temInfracao = infracoes.length > 0;
  const podeApreender = temInfracao || apreensaoSemInfracao;
  const totalRecolhido = apreensaoItens.filter((i) => i.custody === 'drcae').length;

  const addItem = () => {
    setApreensaoItens((prev) => [
      ...prev,
      // Sem constatação: no formulário por passos não há agrupamento.
      { constatacaoId: null, designation: '', quantity: '', assetSupply: null, assetUnit: null, custody: 'drcae', note: '' },
    ]);
  };

  const updateItem = (index: number, patch: Partial<(typeof apreensaoItens)[number]>) => {
    setApreensaoItens((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  };

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
        <h3 className="font-bold text-base text-slate-800 dark:text-slate-100">Apreensão de Produtos</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
          Registe os produtos apreendidos e o destino de cada um. Os que ficarem
          à guarda de um fiel depositário geram uma obrigação de recolha
          posterior.
        </p>

        {/* O interruptor é a única forma de declarar apreensão neste
            formulário: o passo aparece a todos, sempre, e sem ele não se
            distinguiria «não houve» de «ainda não preenchi». */}
        <label className="flex items-center gap-3 pt-1 cursor-pointer">
          <input
            type="checkbox"
            checked={apreensaoActiva}
            onChange={(e) => setApreensaoActiva(e.target.checked)}
            className="w-4 h-4"
          />
          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
            Houve apreensão nesta fiscalização
          </span>
        </label>
      </div>

      {apreensaoActiva && !temInfracao && (
        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-300 dark:border-amber-900/40 rounded-2xl p-4 space-y-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed font-medium">
              Não há infracção levantada nesta fiscalização. Apreender sem
              infracção associada é possível, mas exige justificação — é ela que
              fundamenta o acto.
            </p>
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={apreensaoSemInfracao}
              onChange={(e) => setApreensaoSemInfracao(e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-xs font-bold text-amber-900 dark:text-amber-200">
              Apreender sem infracção associada
            </span>
          </label>
          {apreensaoSemInfracao && (
            <textarea
              value={apreensaoJustificacao}
              onChange={(e) => setApreensaoJustificacao(e.target.value)}
              rows={3}
              placeholder="Fundamento da apreensão…"
              className="w-full p-3 text-xs bg-white dark:bg-slate-800 border border-amber-200 dark:border-amber-900/40 rounded-xl outline-none focus:ring-2 focus:ring-amber-500 text-slate-800 dark:text-slate-100"
            />
          )}
        </div>
      )}

      {apreensaoActiva && podeApreender && (
        <>
          <div className="space-y-3">
            {apreensaoItens.map((item, index) => (
              <div key={index} className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Item {index + 1}</span>
                  <button
                    type="button"
                    onClick={() => setApreensaoItens((prev) => prev.filter((_, i) => i !== index))}
                    className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* O catálogo é agora o caminho normal e o texto livre a
                    excepção: antes o item nascia «não catalogado» com a caixa
                    de texto à vista, pelo que se escrevia à mão o que já
                    estava catalogado. O escape de texto livre continua a
                    existir, mas dentro da pesquisa da folha. */}
                <button
                  type="button"
                  onClick={() => setProdutoSheetIndex(index)}
                  className="w-full min-h-[44px] p-3 flex items-center justify-between gap-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-left font-semibold text-slate-800 dark:text-slate-100"
                >
                  <span className={cn('min-w-0 truncate', !item.designation && 'text-slate-400')}>
                    {item.designation || 'Escolher produto…'}
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    {item.designation && !item.assetSupply && (
                      <span className="text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400">
                        Não catalogado
                      </span>
                    )}
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  </span>
                </button>

                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="0.01"
                  value={item.quantity}
                  onChange={(e) => updateItem(index, { quantity: e.target.value })}
                  placeholder="Quantidade"
                  className="w-full p-3 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-slate-800 dark:text-slate-100 font-mono"
                />

                {/* A unidade deixou de partilhar a linha com a quantidade: os
                    chips precisam da largura toda para não quebrarem a cada
                    duas entradas. */}
                <ChipGroup
                  label="Unidade"
                  options={unidades}
                  value={item.assetUnit == null ? null : String(item.assetUnit)}
                  onChange={(unit) => updateItem(index, { assetUnit: Number(unit) })}
                  sheetTitle="Unidade de medida"
                  emptyLabel="Unidades de medida por sincronizar."
                />

                {/* Destino por item: é o que decide se fica obrigação pendente. */}
                <div className="grid grid-cols-2 gap-2">
                  {(['drcae', 'trustee'] as const).map((custody) => (
                    <button
                      key={custody}
                      type="button"
                      onClick={() => updateItem(index, { custody })}
                      className={cn(
                        'py-2.5 rounded-xl text-xs font-bold border transition-colors',
                        item.custody === custody
                          ? custody === 'drcae'
                            ? 'bg-blue-600 border-blue-600 text-white'
                            : 'bg-amber-500 border-amber-500 text-white'
                          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300',
                      )}
                    >
                      {custody === 'drcae' ? 'Recolhido pela DRCAE' : 'Fiel depositário'}
                    </button>
                  ))}
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={addItem}
              className="w-full py-3 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-500 dark:text-slate-400 hover:border-blue-400 hover:text-blue-600 transition-colors flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" /> Acrescentar produto
            </button>
          </div>

          <DepositarioDoAuto />

          {apreensaoItens.length > 0 && (
            <div className="bg-slate-50 dark:bg-slate-800/40 rounded-2xl p-4 flex items-center gap-3">
              <PackageOpen className="w-5 h-5 text-slate-500 shrink-0" />
              <p className="text-xs text-slate-600 dark:text-slate-300 font-medium">
                {apreensaoItens.length} {apreensaoItens.length === 1 ? 'item' : 'itens'} ·{' '}
                {totalRecolhido} recolhido(s) pela DRCAE ·{' '}
                {apreensaoItens.length - totalRecolhido} em fiel depósito
              </p>
            </div>
          )}
        </>
      )}

      <MotivosPendentes motivos={motivosApreensao} />

      <PickerSheet
        open={produtoSheetIndex !== null}
        title="Produto"
        options={produtoOptions}
        value={
          produtoSheetIndex === null || apreensaoItens[produtoSheetIndex]?.assetSupply == null
            ? null
            : String(apreensaoItens[produtoSheetIndex].assetSupply)
        }
        onSelect={(id) => {
          if (produtoSheetIndex === null) return;
          const produto = supplyProducts.find((p) => String(p.id) === id);
          updateItem(produtoSheetIndex, {
            assetSupply: Number(id),
            designation: produto?.name ?? '',
          });
        }}
        onClose={() => setProdutoSheetIndex(null)}
        searchPlaceholder="Pesquisar no catálogo…"
        emptyLabel="Catálogo de produtos por sincronizar."
        freeText={{
          prompt: 'Produto fora do catálogo',
          label: (query) => `Usar «${query}» como produto não catalogado`,
          onCreate: (query) => {
            if (produtoSheetIndex === null) return;
            // `assetSupply` a null é o que marca o item como não catalogado —
            // é essa distinção que o backend usa, não a designação.
            updateItem(produtoSheetIndex, { assetSupply: null, designation: query });
          },
        }}
      />
    </div>
  );
}
