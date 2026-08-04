import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronRight, Package } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { db, type ApreensaoItem } from '../../db/db';
import { resumoDepositario } from '../../lib/depositario';

const ESTADO_LIQUIDACAO: Record<string, { rotulo: string; classe: string }> = {
  'not-applicable': { rotulo: 'Sem depósito', classe: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300' },
  pending: { rotulo: 'Por recolher', classe: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' },
  partial: { rotulo: 'Recolha parcial', classe: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' },
  settled: { rotulo: 'Liquidado', classe: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300' },
  released: { rotulo: 'Devolvido', classe: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300' },
  breached: { rotulo: 'Quebra de depósito', classe: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' },
};

/**
 * Autos de apreensão lavrados numa fiscalização.
 *
 * Faltava por inteiro no detalhe: a apreensão entrou na SPEC-03 e nunca chegou
 * a este ecrã. O agente registava o auto no terreno e depois não o encontrava
 * em lado nenhum a partir da fiscalização que lhe deu origem.
 */
export default function ApreensoesSection({ visitaId }: { visitaId: string }) {
  const navigate = useNavigate();
  const autos =
    useLiveQuery(
      async () => {
        const lista = await db.apreensoes.where('visitaId').equals(visitaId).toArray();
        return Promise.all(
          lista.map(async (auto) => ({
            auto,
            itens: await db.apreensaoItens.where('apreensaoId').equals(auto.id!).toArray(),
          })),
        );
      },
      [visitaId],
      [],
    ) ?? [];

  if (autos.length === 0) return null;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2 text-sm">
          <Package className="w-4 h-4 text-red-500" />
          Apreensões
        </h3>
        <span className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 text-[10px] font-bold px-2 py-0.5 rounded-full">
          {autos.length}
        </span>
      </div>

      {autos.map(({ auto, itens }) => {
        const estado = ESTADO_LIQUIDACAO[auto.settlementStatus] ?? ESTADO_LIQUIDACAO['not-applicable'];
        return (
          <div key={auto.id} className="space-y-2 border-t border-slate-100 dark:border-slate-800 pt-3 first:border-t-0 first:pt-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold font-mono text-slate-700 dark:text-slate-200">
                {auto.officialCode || auto.offlineCode || 'sem código'}
              </span>
              <div className="flex shrink-0 items-center gap-1.5">
                <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${estado.classe}`}>
                  {estado.rotulo}
                </span>
                <button
                  type="button"
                  onClick={() => navigate(`/apreensoes/${auto.id}`)}
                  title="Ver detalhes da apreensão"
                  aria-label={`Ver detalhes do auto ${auto.officialCode || auto.offlineCode || 'de apreensão'}`}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:bg-blue-950/40 dark:hover:text-blue-300"
                >
                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>

            <ul className="space-y-1.5">
              {itens.map((item: ApreensaoItem) => (
                <li
                  key={item.id}
                  className="text-xs font-semibold text-slate-700 dark:text-slate-200 flex justify-between gap-2 bg-slate-50 dark:bg-slate-800 p-2.5 rounded-lg"
                >
                  <span className="flex-1 min-w-0 truncate">{item.designation}</span>
                  <span className="shrink-0 font-mono">{item.quantity}</span>
                  <span className="shrink-0 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    {item.custody === 'trustee' ? 'depósito' : 'recolhido'}
                  </span>
                </li>
              ))}
            </ul>

            {auto.settlementStatus !== 'not-applicable' && (
              <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                {resumoDepositario(auto)}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
