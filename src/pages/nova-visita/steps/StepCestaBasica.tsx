import React from 'react';
import { useNovaVisitaForm } from '../context';
import { cn } from '../../../lib/utils';
import { format } from 'date-fns';
import { aplicarPreco } from '../../../lib/priceOwnership';

/**
 * Preços praticados face ao livro de cálculo em vigor, ou classificação manual
 * quando o operador não tem livro.
 *
 * O estado vive no componente-pai e chega por contexto — ver `../context.ts`.
 */
export default function StepCestaBasica() {
  const {
    produtosPrices,
    setProdutosPrices,
    supplyCachedAt,
    supplyProducts,
    supplyStatus,
  } = useNovaVisitaForm();

  return (
  <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
    <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-1">
      <h3 className="font-bold text-base text-slate-800 dark:text-slate-100">Produtos de Cesta Básica</h3>
      <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
        {supplyStatus === 'none' && supplyProducts.length > 0
          ? 'Este operador não tem livro de cálculo em vigor. Registe os preços comercializados e classifique manualmente a conformidade.'
          : 'Registe os preços praticados pelo operador e compare com o livro de cálculo em vigor.'}
      </p>
      {/* Idade dos dados: o agente tem de saber contra que referências
          está a comparar antes de levantar uma infracção de preço. */}
      {supplyProducts.length > 0 && (
        <p className="text-[11px] text-slate-400 dark:text-slate-500 font-medium pt-1">
          {supplyCachedAt
            ? `Referências de ${format(new Date(supplyCachedAt), 'dd/MM/yyyy HH:mm')}`
            : 'Referências de data desconhecida — sincronize para actualizar.'}
        </p>
      )}
    </div>

    {supplyStatus === 'loading' && (
      <div className="flex items-center justify-center py-12 text-slate-400 gap-2">
        <div className="w-5 h-5 border-2 border-slate-300 border-t-blue-500 rounded-full animate-spin" />
        <span className="text-xs font-medium">A carregar livro de cálculo...</span>
      </div>
    )}

    {supplyStatus === 'none' && supplyProducts.length === 0 && (
      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-5 text-center space-y-2">
        <p className="text-sm font-bold text-amber-800 dark:text-amber-300">Sem produtos de cesta básica disponíveis</p>
        <p className="text-xs text-amber-700 dark:text-amber-400">O catálogo de produtos ainda não foi descarregado para este dispositivo. Sincronize em Sistema → Centro de Sincronização; pode avançar para o próximo passo.</p>
      </div>
    )}

    {supplyStatus === 'none' && supplyProducts.length > 0 && supplyProducts.map(produto => {
      const prices = produtosPrices[produto.id] || { gross: '', retail: '' };
      const setEval = (field: 'grossEval' | 'retailEval', value: 'conforme' | 'nao_conforme') => {
        setProdutosPrices(prev =>
          aplicarPreco(
            prev,
            produto.id,
            { [field]: prev[produto.id]?.[field] === value ? undefined : value },
            null,
          ),
        );
      };
      const EvalToggle = ({ field }: { field: 'grossEval' | 'retailEval' }) => (
        <div className="flex gap-1.5 mt-1.5">
          <button
            type="button"
            onClick={() => setEval(field, 'conforme')}
            className={cn(
              'flex-1 text-[9px] font-bold uppercase tracking-wide py-1 rounded-lg border transition-colors',
              prices[field] === 'conforme'
                ? 'bg-emerald-500 border-emerald-500 text-white'
                : 'border-slate-200 dark:border-slate-700 text-slate-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20'
            )}
          >
            Conforme
          </button>
          <button
            type="button"
            onClick={() => setEval(field, 'nao_conforme')}
            className={cn(
              'flex-1 text-[9px] font-bold uppercase tracking-wide py-1 rounded-lg border transition-colors',
              prices[field] === 'nao_conforme'
                ? 'bg-red-500 border-red-500 text-white'
                : 'border-slate-200 dark:border-slate-700 text-slate-400 hover:bg-red-50 dark:hover:bg-red-900/20'
            )}
          >
            Não Conforme
          </button>
        </div>
      );
      return (
        <div key={produto.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 space-y-3">
          <p className="font-bold text-sm text-slate-800 dark:text-slate-100">{produto.name}</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Preço Grosso (STN)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={prices.gross}
                onChange={e => setProdutosPrices(prev => aplicarPreco(prev, produto.id, { gross: e.target.value }, null))}
                className="w-full p-2.5 text-xs border rounded-xl font-mono bg-slate-50 dark:bg-slate-800 dark:text-slate-100 border-slate-200 dark:border-slate-700"
              />
              {prices.gross && <EvalToggle field="grossEval" />}
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Preço Retalho (STN)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="0.00"
                value={prices.retail}
                onChange={e => setProdutosPrices(prev => aplicarPreco(prev, produto.id, { retail: e.target.value }, null))}
                className="w-full p-2.5 text-xs border rounded-xl font-mono bg-slate-50 dark:bg-slate-800 dark:text-slate-100 border-slate-200 dark:border-slate-700"
              />
              {prices.retail && <EvalToggle field="retailEval" />}
            </div>
          </div>
        </div>
      );
    })}

    {supplyStatus === 'active' && supplyProducts.map(produto => {
      const prices = produtosPrices[produto.id] || { gross: '', retail: '' };
      const grossNum = prices.gross ? parseFloat(prices.gross) : null;
      const retailNum = prices.retail ? parseFloat(prices.retail) : null;
      const grossConform = grossNum != null && produto.grossPrice != null ? grossNum <= produto.grossPrice : null;
      const retailConform = retailNum != null && produto.retailPrice != null ? retailNum <= produto.retailPrice : null;
      return (
        <div key={produto.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 space-y-3">
          <div>
            <p className="font-bold text-sm text-slate-800 dark:text-slate-100">{produto.name}</p>
            {produto.description && (
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{produto.description}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Preço Grosso (STN)</label>
              {produto.grossPrice != null && (
                <p className="text-[10px] text-slate-400">Livro: <span className="font-mono font-bold">{produto.grossPrice.toFixed(2)}</span></p>
              )}
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={prices.gross}
                  onChange={e => setProdutosPrices(prev => aplicarPreco(prev, produto.id, { gross: e.target.value }, null))}
                  className={cn(
                    'w-full p-2.5 text-xs border rounded-xl font-mono bg-slate-50 dark:bg-slate-800 dark:text-slate-100',
                    grossConform === true ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20' :
                    grossConform === false ? 'border-red-400 bg-red-50 dark:bg-red-900/20' :
                    'border-slate-200 dark:border-slate-700'
                  )}
                />
                {grossConform === true && <span className="absolute right-2 top-2 text-emerald-600 text-[10px] font-bold">✓</span>}
                {grossConform === false && <span className="absolute right-2 top-2 text-red-600 text-[10px] font-bold">✗</span>}
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Preço Retalho (STN)</label>
              {produto.retailPrice != null && (
                <p className="text-[10px] text-slate-400">Livro: <span className="font-mono font-bold">{produto.retailPrice.toFixed(2)}</span></p>
              )}
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={prices.retail}
                  onChange={e => setProdutosPrices(prev => aplicarPreco(prev, produto.id, { retail: e.target.value }, null))}
                  className={cn(
                    'w-full p-2.5 text-xs border rounded-xl font-mono bg-slate-50 dark:bg-slate-800 dark:text-slate-100',
                    retailConform === true ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20' :
                    retailConform === false ? 'border-red-400 bg-red-50 dark:bg-red-900/20' :
                    'border-slate-200 dark:border-slate-700'
                  )}
                />
                {retailConform === true && <span className="absolute right-2 top-2 text-emerald-600 text-[10px] font-bold">✓</span>}
                {retailConform === false && <span className="absolute right-2 top-2 text-red-600 text-[10px] font-bold">✗</span>}
              </div>
            </div>
          </div>
        </div>
      );
    })}
  </div>
  );
}
