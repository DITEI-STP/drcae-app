import { useMemo, useState } from 'react';
import { Check, Search, X } from 'lucide-react';
import { useNovaVisitaForm } from '../context';
import { cn, normalizeSearch } from '../../../lib/utils';
import SpeechInputButton from '../../../components/SpeechInputButton';
import {
  adicionarRecomendacao,
  alternarRecomendacao,
  removerRecomendacao,
  temRecomendacao,
} from '../../../lib/recomendacoes';

/**
 * Recomendações a emitir.
 *
 * Mesmo padrão do catálogo de infracções: pesquisa no topo, o que já foi
 * escolhido em chips logo abaixo, e a lista filtrada por baixo. A lista de
 * recomendações pré-definidas cresce com o uso, e percorrê-la inteira a cada
 * fiscalização — que era o que este passo obrigava a fazer — deixa de ser
 * viável muito antes de a lista parecer grande.
 *
 * A pesquisa é insensível a acentos: obrigar a escrever «higiéne» com acento
 * para encontrar a recomendação é obrigar a abrir o teclado de símbolos de pé,
 * com o representante do operador à espera.
 *
 * O texto livre continua a existir, como escape para o que o catálogo não
 * cobre — mas depois da pesquisa, não antes: é isso que faz do catálogo o
 * caminho normal.
 */
export default function StepRecomendacoes() {
  const {
    constatacaoActivaId,
    customRecommendation,
    predefinedRecomendacoes,
    recomendacoes,
    setCustomRecommendation,
    setRecomendacoes,
  } = useNovaVisitaForm();

  const [busca, setBusca] = useState('');

  const filtradas = useMemo(() => {
    const agulha = normalizeSearch(busca);
    if (!agulha) return predefinedRecomendacoes;
    return predefinedRecomendacoes.filter((r) => normalizeSearch(r).includes(agulha));
  }, [predefinedRecomendacoes, busca]);

  // A recomendação fica ligada à constatação de onde foi emitida — é a posição
  // do botão que a abriu que determina o agrupamento. No stepper não há
  // constatação em aberto e a referência fica a nulo.
  const alternar = (rec: string) =>
    setRecomendacoes((prev) => alternarRecomendacao(prev, rec, constatacaoActivaId));

  const adicionarCustom = () => {
    const val = customRecommendation.trim();
    if (!val) return;
    setRecomendacoes((prev) => adicionarRecomendacao(prev, val, constatacaoActivaId));
    setCustomRecommendation('');
  };

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm shrink-0">
        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-2 pl-1">
          Pesquisar Recomendações
        </label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Procurar por assunto..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:bg-white focus:ring-2 focus:ring-indigo-500 text-xs font-medium text-slate-800 dark:text-slate-100"
          />
        </div>
      </div>

      {recomendacoes.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-1">
          <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider self-center mr-1">
            A emitir:
          </span>
          {recomendacoes.map(({ texto }) => (
            <span
              key={texto}
              className="flex items-center gap-1 text-[10px] font-bold bg-indigo-100 dark:bg-indigo-900/30 text-indigo-800 dark:text-indigo-300 px-2 py-1 rounded-full"
            >
              {texto.length > 30 ? `${texto.substring(0, 30)}…` : texto}
              <button
                type="button"
                onClick={() => setRecomendacoes((prev) => removerRecomendacao(prev, texto))}
                className="ml-0.5 hover:text-indigo-600"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">
        Catálogo ({filtradas.length} {filtradas.length === 1 ? 'encontrada' : 'encontradas'})
      </p>

      <div className="space-y-2">
        {filtradas.map((rec) => {
          const seleccionada = temRecomendacao(recomendacoes, rec);
          return (
            <div
              key={rec}
              onClick={() => alternar(rec)}
              className={cn(
                'p-3 rounded-xl border flex items-start gap-3 cursor-pointer transition-colors',
                seleccionada
                  ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-400 dark:border-indigo-500 shadow-sm'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800',
              )}
            >
              <div
                className={cn(
                  'w-5 h-5 rounded-md border flex items-center justify-center shrink-0 mt-0.5',
                  seleccionada
                    ? 'bg-indigo-600 border-indigo-600 text-white'
                    : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600',
                )}
              >
                {seleccionada && <Check className="w-3.5 h-3.5" />}
              </div>
              <p
                className={cn(
                  'flex-1 text-xs leading-relaxed font-semibold',
                  seleccionada
                    ? 'text-indigo-900 dark:text-indigo-200'
                    : 'text-slate-700 dark:text-slate-300',
                )}
              >
                {rec}
              </p>
            </div>
          );
        })}

        {filtradas.length === 0 && (
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium text-center py-4">
            Nada no catálogo para «{busca.trim()}». Escreva abaixo para acrescentar.
          </p>
        )}
      </div>

      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-2.5">
        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block pl-1">
          Recomendação à medida do local
        </label>
        <div className="flex gap-2">
          <SpeechInputButton
            onTranscript={(t) => setCustomRecommendation((prev) => (prev ? `${prev} ${t}` : t))}
          />
          <input
            type="text"
            placeholder="Ex: Reforçar o lacre das caixas no local de carga..."
            value={customRecommendation}
            onChange={(e) => setCustomRecommendation(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                adicionarCustom();
              }
            }}
            className="flex-1 p-3.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:bg-white dark:focus:bg-slate-700 focus:ring-2 focus:ring-indigo-500 text-slate-800 dark:text-slate-100 font-semibold rounded-xl"
          />
          <button
            type="button"
            onClick={adicionarCustom}
            className="px-5 py-3 bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
          >
            Adicionar
          </button>
        </div>
      </div>
    </div>
  );
}
