import { useEffect } from 'react';
import { AlertTriangle, ChevronRight, Info } from 'lucide-react';
import { useBackIntent } from '../../hooks/useBackIntent';
import { cn } from '../../lib/utils';
import { impedeAvancar, type Pendencia } from '../../lib/pendenciasDaTela';

interface Props {
  pendencias: Pendencia[];
  aberto: boolean;
  onFechar: () => void;
  /** Abre o ecrã onde a pendência se resolve. */
  onResolver: (pendencia: Pendencia) => void;
  /** Avança mesmo assim — só existe quando nada impede. */
  onContinuar: () => void;
}

/**
 * O que falta para sair do levantamento, com o caminho para o resolver.
 *
 * Substitui o botão «Próximo Passo» desactivado. Um botão cinzento não diz o
 * que falta: no terreno lê-se como avaria, e o agente que não sabe o que o está
 * a impedir não tem por onde começar. Aqui o toque é sempre aceite, e o que
 * responde é a lista do que falta — cada linha com o atalho para o ecrã onde se
 * corrige, porque mandar procurar é a outra forma de não dizer.
 *
 * Duas camadas: o que **impede** avançar (o auto de apreensão, que sem destino
 * ou sem fundamento não é um auto) e o que **convém rever** antes de sair do
 * local. Só o segundo se pode dispensar — e é o mesmo que o diálogo das
 * recomendações anteriores já permitia, que este substitui em vez de duplicar.
 */
export default function AlertaPendencias({
  pendencias,
  aberto,
  onFechar,
  onResolver,
  onContinuar,
}: Props) {
  const bloqueia = impedeAvancar(pendencias);

  // Último handler montado ganha o «voltar» do Android (pilha LIFO): o alerta
  // fecha-se antes de o formulário recuar de passo. Com sentinela de histórico
  // porque se sobrepõe a um formulário — sem ela, o `popstate` do browser/PWA
  // fecharia o alerta **e** recuaria a rota no mesmo gesto (RULE.md §6.2).
  useBackIntent(onFechar, aberto, true);

  useEffect(() => {
    if (!aberto) return;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = anterior;
    };
  }, [aberto]);

  if (!aberto || pendencias.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Fechar não perde nada: o que está registado fica, e o alerta é só
          leitura do que falta. Por isso o fundo também fecha. */}
      <div
        className="absolute inset-0 bg-slate-900/50 dark:bg-black/60"
        onClick={onFechar}
        aria-hidden
      />

      <div className="relative w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-2xl animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[80vh]">
        <header className="p-5 pb-3 flex items-start gap-3">
          <span
            className={cn(
              'w-10 h-10 rounded-xl flex items-center justify-center shrink-0',
              bloqueia
                ? 'bg-red-100 dark:bg-red-500/15 text-red-600'
                : 'bg-amber-100 dark:bg-amber-500/15 text-amber-600',
            )}
          >
            {bloqueia ? <AlertTriangle className="w-5 h-5" /> : <Info className="w-5 h-5" />}
          </span>
          <div className="min-w-0 space-y-0.5">
            <h3 className="font-bold text-sm text-slate-900 dark:text-white tracking-tight">
              {bloqueia ? 'Falta para avançar' : 'Antes de sair do local'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
              {bloqueia
                ? 'Resolva o que está em falta — cada linha abre o ecrã onde se corrige.'
                : 'Nada impede o avanço; isto fica registado como ficar.'}
            </p>
          </div>
        </header>

        <div className="px-5 pb-2 space-y-2 overflow-y-auto custom-scrollbar">
          {pendencias.map((pendencia) => (
            <button
              key={pendencia.codigo}
              type="button"
              onClick={() => onResolver(pendencia)}
              className={cn(
                'w-full text-left p-3 rounded-xl border flex items-center gap-3 transition-colors',
                pendencia.tom === 'bloqueio'
                  ? 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900/40 hover:bg-red-100 dark:hover:bg-red-950/40'
                  : 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/40 hover:bg-amber-100 dark:hover:bg-amber-950/40',
              )}
            >
              <span className="flex-1 min-w-0 space-y-1">
                <span
                  className={cn(
                    'block text-xs font-semibold leading-snug',
                    pendencia.tom === 'bloqueio'
                      ? 'text-red-800 dark:text-red-300'
                      : 'text-amber-800 dark:text-amber-300',
                  )}
                >
                  {pendencia.texto}
                </span>
                <span
                  className={cn(
                    'block text-[10px] font-bold uppercase tracking-widest',
                    pendencia.tom === 'bloqueio'
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-amber-600 dark:text-amber-400',
                  )}
                >
                  {pendencia.accao}
                </span>
              </span>
              <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
            </button>
          ))}
        </div>

        <footer className="p-4 flex gap-3">
          <button
            type="button"
            onClick={onFechar}
            className="flex-1 px-4 py-3 rounded-xl text-sm font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 transition-colors"
          >
            Fechar
          </button>
          {/* Só quando nada impede: um «Continuar assim» cinzento por cima de um
              bloqueio seria o mesmo botão mudo que isto veio substituir. */}
          {!bloqueia && (
            <button
              type="button"
              onClick={onContinuar}
              className="flex-1 px-4 py-3 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors"
            >
              Continuar assim
            </button>
          )}
        </footer>
      </div>
    </div>
  );
}
