import type React from 'react';
import { Check, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import SpeechInputButton from '../../../components/SpeechInputButton';
import PaletaAccoes, { type AccaoConstatacao } from './PaletaAccoes';
import type { Constatacao } from '../../../db/db';

interface Props {
  constatacao: Constatacao;
  /** O que dizer quando não há descrição — ver lib/constatacaoResumo.ts. */
  resumo: string;
  totais: Partial<Record<AccaoConstatacao, number>>;
  onAccao: (accao: AccaoConstatacao) => void;
  onDescrever: (texto: string) => void;
  onFechar: () => void;
  onReabrir: () => void;
  onDescartar: () => void;
}

const ROTULO_RESUMO: Record<AccaoConstatacao, string> = {
  foto: 'prova',
  infraccao: 'infracção',
  produtos: 'produto',
  recomendacao: 'recomendação',
};

function resumir(totais: Props['totais']): string {
  const partes = (Object.entries(totais) as [AccaoConstatacao, number][])
    .filter(([, n]) => n > 0)
    .map(([chave, n]) => `${n} ${ROTULO_RESUMO[chave]}${n > 1 ? 's' : ''}`);
  return partes.length > 0 ? partes.join(' · ') : 'sem registos';
}

/**
 * Cartão de constatação (SPEC-10 §6.2).
 *
 * Em aberto ocupa espaço e mostra a paleta; fechado encolhe para uma linha.
 * Essa diferença é o que impede a tela de crescer sem fim numa fiscalização
 * longa, e é também o sinal visual de que existe **uma** constatação a receber
 * o que o agente fizer a seguir.
 *
 * Não há botão de concluir. Cada acção confirmada na folha já ficou registada,
 * pelo que «Concluir constatação» não guardava nada — só encolhia o cartão, e
 * ler «concluir» num ecrã de campo faz supor que o que está por cima ainda não
 * estava seguro. Encolher passou a ser o que é: um chevron no cabeçalho. Passar
 * à constatação seguinte é «Nova constatação», que fecha esta pelo caminho.
 */
const CartaoConstatacao: React.FC<Props> = ({
  constatacao,
  resumo,
  totais,
  onAccao,
  onDescrever,
  onFechar,
  onReabrir,
  onDescartar,
}) => {
  const aberta = !constatacao.closedAt;

  if (!aberta) {
    return (
      <button
        type="button"
        onClick={onReabrir}
        className="w-full text-left p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-start gap-3"
      >
        <span className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center shrink-0 mt-0.5">
          <Check className="w-3.5 h-3.5" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-xs font-bold text-slate-800 dark:text-slate-100">
            Constatação {constatacao.ordem}
          </span>
          <span className="block text-xs font-medium text-slate-600 dark:text-slate-400 mt-0.5 line-clamp-2">
            {resumo}
          </span>
          <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
            {resumir(totais)}
          </span>
        </span>
        <ChevronDown className="w-4 h-4 text-slate-400 shrink-0 mt-1" />
      </button>
    );
  }

  return (
    <div className="rounded-2xl border-2 border-indigo-400 dark:border-indigo-500 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
      <div className="px-4 pt-4 pb-3 flex items-center justify-between">
        <div>
          <p className="text-xs font-bold text-slate-900 dark:text-white">
            Constatação {constatacao.ordem}
          </p>
          <p className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest mt-0.5">
            em curso · {resumir(totais)}
          </p>
        </div>
        <div className="flex items-center">
          <button
            type="button"
            onClick={onDescartar}
            aria-label="Descartar constatação"
            className="p-2 text-slate-400 hover:text-red-500 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          {/* Encolher, não concluir: o cartão já está guardado, e o que este
              gesto muda é só quanto espaço ocupa na tela. */}
          <button
            type="button"
            onClick={onFechar}
            aria-label="Encolher constatação"
            className="p-2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="px-4 pb-3 flex gap-2">
        <SpeechInputButton
          onTranscript={(t) =>
            onDescrever(constatacao.descricao ? `${constatacao.descricao} ${t}` : t)
          }
        />
        <input
          type="text"
          value={constatacao.descricao ?? ''}
          onChange={(e) => onDescrever(e.target.value)}
          placeholder="O que encontrou aqui?"
          className="flex-1 p-3 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:bg-white dark:focus:bg-slate-700 focus:ring-2 focus:ring-indigo-500 text-slate-800 dark:text-slate-100 font-semibold rounded-xl"
        />
      </div>

      <div className="px-4 pb-4">
        <PaletaAccoes onAccao={onAccao} totais={totais} />
      </div>
    </div>
  );
};

export default CartaoConstatacao;
