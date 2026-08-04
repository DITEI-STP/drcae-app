import { AlertTriangle, Camera, Lightbulb, Package, type LucideIcon } from 'lucide-react';
import { cn } from '../../../lib/utils';

export type AccaoConstatacao = 'foto' | 'infraccao' | 'produtos' | 'recomendacao';

interface Props {
  onAccao: (accao: AccaoConstatacao) => void;
  /** Contagem por acção, para o agente ver o que já pendurou sem abrir nada. */
  totais: Partial<Record<AccaoConstatacao, number>>;
}

/**
 * «Produtos» é um botão só, e não «Preço» + «Apreensão».
 *
 * Eram dois formulários sobre o mesmo catálogo: o agente que encontrava um
 * produto acima do tecto e o apreendia escolhia-o duas vezes, com o mesmo nome,
 * em dois sítios. Quatro alvos de toque em vez de cinco também é matéria de
 * campo — isto é usado de pé, com uma mão, ao sol.
 */
const ACCOES: { chave: AccaoConstatacao; rotulo: string; icone: LucideIcon }[] = [
  { chave: 'foto', rotulo: 'Prova', icone: Camera },
  { chave: 'infraccao', rotulo: 'Infracção', icone: AlertTriangle },
  { chave: 'produtos', rotulo: 'Produtos', icone: Package },
  { chave: 'recomendacao', rotulo: 'Recomendação', icone: Lightbulb },
];

/**
 * Paleta de acções da constatação em aberto (SPEC-10 §6.2).
 *
 * Vive **dentro** do cartão, e não no rodapé da tela, de propósito: é a posição
 * do botão que determina o agrupamento. O agente toca «Prova» porque quer
 * fotografar, e a foto cai na constatação em que ele está — nunca lhe é pedido
 * que decida a que constatação pertence o que acabou de fazer.
 *
 * Alvos de toque grandes e rótulo sempre visível: isto é usado de pé, com uma
 * mão, ao sol, por vezes com o representante do operador a olhar.
 */
export default function PaletaAccoes({ onAccao, totais }: Props) {
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {ACCOES.map(({ chave, rotulo, icone: Icone }) => {
        const total = totais[chave] ?? 0;
        return (
          <button
            key={chave}
            type="button"
            onClick={() => onAccao(chave)}
            className={cn(
              'relative flex flex-col items-center gap-1.5 py-3 px-1 rounded-xl border transition-colors',
              total > 0
                ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-300 dark:border-indigo-700'
                : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-750',
            )}
          >
            {total > 0 && (
              <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-indigo-600 text-white text-[9px] font-bold flex items-center justify-center">
                {total}
              </span>
            )}
            <Icone
              className={cn(
                'w-5 h-5',
                total > 0
                  ? 'text-indigo-600 dark:text-indigo-400'
                  : 'text-slate-500 dark:text-slate-400',
              )}
            />
            <span className="text-[9px] font-bold text-slate-600 dark:text-slate-300 leading-tight text-center">
              {rotulo}
            </span>
          </button>
        );
      })}
    </div>
  );
}
