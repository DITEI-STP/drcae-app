import { cn } from '../../../lib/utils';
import type { PrecoPorProduto } from '../context';

type Avaliacao = 'conforme' | 'nao_conforme';

interface Props {
  preco: PrecoPorProduto[number] | undefined;
  /** Preço de referência do livro em vigor, quando o operador tem um. */
  precoDoLivro: number | null;
  /** O preço mostrado veio da check list da cesta básica, não desta constatação. */
  precoDeOutraOrigem: boolean;
  /** Sem livro em vigor a conformidade é classificada à mão. */
  semLivro: boolean;
  onPreco: (campo: 'gross' | 'retail', valor: string) => void;
  onAvaliar: (campo: 'grossEval' | 'retailEval', valor: Avaliacao) => void;
}

const CAMPOS = [
  { campo: 'gross', avaliacao: 'grossEval', rotulo: 'Grosso' },
  { campo: 'retail', avaliacao: 'retailEval', rotulo: 'Retalho' },
] as const;

/**
 * O preço que se leu na prateleira.
 *
 * Painel próprio dentro do cartão do produto: preço e apreensão respondem a
 * perguntas diferentes — quanto custa, e quanto se levou — e mostradas ao mesmo
 * tempo faziam o cartão parecer um formulário de dez campos para um produto que
 * o agente só queria cotar.
 */
export default function PrecoDoProduto({
  preco,
  precoDoLivro,
  precoDeOutraOrigem,
  semLivro,
  onPreco,
  onAvaliar,
}: Props) {
  return (
    <div className="space-y-2.5">
      <div className="grid grid-cols-2 gap-2">
        {CAMPOS.map(({ campo, avaliacao, rotulo }) => (
          <div key={campo} className="space-y-1.5">
            <label className="block space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">
                {rotulo} (STN)
              </span>
              <input
                type="number"
                inputMode="decimal"
                value={preco?.[campo] ?? ''}
                onChange={(e) => onPreco(campo, e.target.value)}
                placeholder="0"
                className="w-full p-3 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </label>

            {/* Sem livro em vigor não há referência: quem classifica é o agente,
                no mesmo sítio onde escreveu o valor. */}
            {semLivro && (
              <div className="flex gap-1">
                {(['conforme', 'nao_conforme'] as const).map((valor) => {
                  const activo = preco?.[avaliacao] === valor;
                  return (
                    <button
                      key={valor}
                      type="button"
                      onClick={() => onAvaliar(avaliacao, valor)}
                      className={cn(
                        'flex-1 min-h-[32px] rounded-lg border text-[10px] font-bold uppercase tracking-wider transition-colors',
                        activo
                          ? valor === 'conforme'
                            ? 'bg-emerald-600 border-emerald-600 text-white'
                            : 'bg-red-600 border-red-600 text-white'
                          : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500',
                      )}
                    >
                      {valor === 'conforme' ? 'Conf.' : 'Não conf.'}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      {precoDoLivro != null && (
        <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">
          Preço do livro em vigor: <span className="font-mono">{precoDoLivro}</span> STN
        </p>
      )}

      {precoDeOutraOrigem && (
        <p className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 leading-snug">
          Preço registado na cesta básica. Existe um valor por produto — alterá-lo aqui
          altera o mesmo.
        </p>
      )}
    </div>
  );
}
