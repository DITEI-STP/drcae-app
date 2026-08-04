import { Check } from 'lucide-react';
import { useNovaVisitaForm } from '../context';
import { deriveCoverageGaps } from '../../../lib/coverage';
import { produtosVerificados } from '../../../lib/priceOwnership';
import { cn } from '../../../lib/utils';

/**
 * Certificação do que ficou por registar (SPEC-10 §7).
 *
 * O formulário por passos garante cobertura por tédio: obriga o agente a passar
 * por todos os domínios, nem que seja para não escrever nada. A tela iterativa
 * não obriga a nada — e sem substituto pareceria mais rápida por ter registado
 * menos, envenenando a comparação entre as duas modalidades.
 *
 * O substituto é **uma** declaração, e não uma lista de confirmações técnicas:
 * o que ficou vazio é enumerado numa frase e o agente certifica-o de uma vez.
 * Ocupa quatro linhas em vez de meio ecrã, e diz algo com sentido — o que N
 * caixas «Confirmo» nunca disseram.
 *
 * O que fica gravado é o mesmo: `cobertura.dominiosVazios` deriva das lacunas,
 * não dos toques.
 */
export default function ReconhecimentoCobertura() {
  const {
    infracoes,
    anexos,
    supplyProducts,
    produtosPrices,
    groupedHistoricoRecomendacoes,
    recomendacoesHistoricas,
    coberturaReconhecida,
    setCoberturaReconhecida,
  } = useNovaVisitaForm();

  const gaps = deriveCoverageGaps({
    infracoes: infracoes.length,
    provas: anexos.length,
    produtosTotal: supplyProducts.length,
    produtosVerificados: produtosVerificados(produtosPrices).length,
    recomendacoesPendentes: groupedHistoricoRecomendacoes.length,
    recomendacoesPendentesRespondidas: recomendacoesHistoricas.filter(
      (r) => r.atendida !== undefined && r.atendida !== null,
    ).length,
  });

  if (gaps.length === 0) return null;

  const certificado = gaps.every((g) => coberturaReconhecida.includes(g.key));

  // Tudo ou nada: a declaração é sobre o conjunto, e guardar meia certificação
  // deixaria o botão de concluir bloqueado sem o agente perceber o que falta.
  const alternar = () => setCoberturaReconhecida(certificado ? [] : gaps.map((g) => g.key));

  return (
    <div className="w-full text-left space-y-2">
      <p className="text-xs font-medium text-slate-600 dark:text-slate-300 leading-relaxed">
        Ficou sem registo:{' '}
        <span className="font-bold text-slate-800 dark:text-slate-100">
          {gaps.map((g) => g.label.toLowerCase()).join('; ')}.
        </span>
      </p>

      <button
        type="button"
        onClick={alternar}
        className={cn(
          'w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-colors',
          certificado
            ? 'bg-white dark:bg-slate-800 border-emerald-400 dark:border-emerald-600'
            : 'bg-white/60 dark:bg-slate-900/40 border-amber-300 dark:border-amber-800',
        )}
      >
        <span
          className={cn(
            'w-5 h-5 rounded-md border flex items-center justify-center shrink-0 mt-0.5',
            certificado
              ? 'bg-emerald-600 border-emerald-600 text-white'
              : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600',
          )}
        >
          {certificado && <Check className="w-3 h-3" />}
        </span>
        <span className="flex-1 text-xs font-semibold text-slate-700 dark:text-slate-200 leading-relaxed">
          Certifico que revi o registo e que os pontos acima ficaram sem ocorrência.
        </span>
      </button>
    </div>
  );
}
