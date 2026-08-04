import { useLiveQuery } from 'dexie-react-hooks';
import { Layers } from 'lucide-react';
import { db, type Anexo, type Infracao } from '../../db/db';

/**
 * Fiscalização apresentada pelo que o agente encontrou, e não por domínio.
 *
 * Só aparece quando há constatações — ou seja, na modalidade iterativa. Uma
 * fiscalização do formulário por passos, e todo o histórico anterior à SPEC-10,
 * continua a ser lida pelas secções por domínio que já existem.
 *
 * É neste ecrã que a diferença entre as duas modalidades se vê pela primeira
 * vez fora do terreno: sem ele, quem avalia o piloto no gabinete lê duas actas
 * indistinguíveis.
 */
export default function ConstatacoesSection({ visitaId }: { visitaId: string }) {
  const grupos =
    useLiveQuery(
      async () => {
        const constatacoes = (
          await db.constatacoes.where('visitaId').equals(visitaId).toArray()
        ).sort((a, b) => a.ordem - b.ordem);
        if (constatacoes.length === 0) return [];

        const [infracoes, anexos] = await Promise.all([
          db.infracoes.where('visitaId').equals(visitaId).toArray(),
          db.anexos.where('visitaId').equals(visitaId).toArray(),
        ]);

        return constatacoes.map((c) => ({
          constatacao: c,
          infracoes: infracoes.filter((i: Infracao) => i.constatacaoId === c.id),
          provas: anexos.filter((a: Anexo) => a.constatacaoId === c.id).length,
        }));
      },
      [visitaId],
      [],
    ) ?? [];

  if (grupos.length === 0) return null;

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2 text-sm">
          <Layers className="w-4 h-4 text-indigo-500" />
          Constatações
        </h3>
        <span className="bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 text-[10px] font-bold px-2 py-0.5 rounded-full">
          {grupos.length}
        </span>
      </div>

      <div className="space-y-3">
        {grupos.map(({ constatacao, infracoes, provas }) => (
          <div
            key={constatacao.id}
            className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 space-y-2 border border-slate-100 dark:border-slate-700"
          >
            <p className="text-xs font-bold text-slate-800 dark:text-slate-100">
              {constatacao.ordem}. {constatacao.descricao?.trim() || 'Sem descrição'}
            </p>

            {infracoes.length > 0 && (
              <ul className="space-y-1">
                {infracoes.map((i: Infracao) => (
                  <li
                    key={i.id}
                    className="text-[11px] font-semibold text-red-800 dark:text-red-300 bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded-md"
                  >
                    {i.type}
                  </li>
                ))}
              </ul>
            )}

            {provas > 0 && (
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                {provas === 1 ? '1 prova' : `${provas} provas`}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
