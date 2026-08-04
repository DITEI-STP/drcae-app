import { Package, Tag } from 'lucide-react';
import { useNovaVisitaForm } from '../context';
import { cn } from '../../../lib/utils';
import { produtosVerificados } from '../../../lib/priceOwnership';

/**
 * Apreensão e preços no ecrã de revisão.
 *
 * Faltavam os dois: o agente confirmava e submetia uma fiscalização sem nunca
 * ver o auto de apreensão que acabara de lavrar nem os preços que registara.
 * Um auto com força probatória não pode ser assinado às cegas.
 */
export default function RevisaoApreensaoPrecos() {
  const {
    apreensaoActiva,
    apreensaoItens,
    apreensaoSemInfracao,
    apreensaoJustificacao,
    trustee,
    produtosPrices,
    supplyProducts,
    firmas,
    firmaId,
  } = useNovaVisitaForm();

  const firmaName = firmas?.find((f) => f.id === firmaId)?.name;

  const itens = apreensaoItens.filter((it) => it.designation.trim() && Number(it.quantity) > 0);
  const verificados = produtosVerificados(produtosPrices);
  const temDeposito = itens.some((it) => it.custody === 'trustee');

  return (
    <>
      {apreensaoActiva && itens.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3 shadow-3xs font-sans text-left">
          <h4 className="text-[10px] font-bold text-red-500 uppercase tracking-widest flex items-center gap-1">
            <Package className="w-3.5 h-3.5" />
            Auto de Apreensão ({itens.length} {itens.length === 1 ? 'item' : 'itens'})
          </h4>

          <ul className="space-y-1.5">
            {itens.map((it, i) => (
              <li
                key={i}
                className="text-xs font-semibold text-slate-700 dark:text-slate-200 flex justify-between gap-2 bg-slate-50 dark:bg-slate-800 p-2.5 rounded-lg"
              >
                <span className="flex-1 min-w-0 truncate">{it.designation}</span>
                <span className="shrink-0 font-mono">{it.quantity}</span>
                <span
                  className={cn(
                    'shrink-0 text-[10px] font-bold uppercase tracking-widest',
                    // Sem destino não há auto: a revisão não o pode mostrar como
                    // recolhido só porque essa era a antiga omissão.
                    it.custody == null ? 'text-amber-600' : 'text-slate-400',
                  )}
                >
                  {it.custody == null
                    ? 'destino por definir'
                    : it.custody === 'trustee'
                      ? 'depósito'
                      : 'recolhido'}
                </span>
              </li>
            ))}
          </ul>

          {/* A revisão mostra quem fica com a guarda, não quem assina: é a
              responsabilidade que o agente tem de confirmar antes de submeter. */}
          {temDeposito && (
            <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
              Fiel depositário:{' '}
              <span className="font-bold">
                {trustee.kind === 'operator'
                  ? firmaName || 'O próprio operador económico'
                  : trustee.name || '— por identificar —'}
              </span>
              {trustee.kind === 'person' && trustee.docNumber && (
                <span className="text-slate-400"> · {trustee.docNumber}</span>
              )}
            </p>
          )}

          {apreensaoSemInfracao && apreensaoJustificacao.trim() && (
            <p className="text-xs font-medium text-amber-700 dark:text-amber-400 leading-relaxed">
              Apreensão sem infracção levantada: {apreensaoJustificacao.trim()}
            </p>
          )}
        </div>
      )}

      {verificados.length > 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3 shadow-3xs font-sans text-left">
          <h4 className="text-[10px] font-bold text-blue-500 uppercase tracking-widest flex items-center gap-1">
            <Tag className="w-3.5 h-3.5" />
            Preços verificados ({verificados.length} de {supplyProducts.length})
          </h4>
          <ul className="space-y-1.5">
            {verificados.map((id) => {
              const produto = supplyProducts.find((p) => p.id === id);
              const preco = produtosPrices[id];
              return (
                <li
                  key={id}
                  className="text-xs font-semibold text-slate-700 dark:text-slate-200 flex justify-between gap-2 bg-slate-50 dark:bg-slate-800 p-2.5 rounded-lg"
                >
                  <span className="flex-1 min-w-0 truncate">{produto?.name ?? `Produto ${id}`}</span>
                  {preco?.gross && <span className="shrink-0 font-mono">gr. {preco.gross}</span>}
                  {preco?.retail && <span className="shrink-0 font-mono">ret. {preco.retail}</span>}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
}
