import { useEffect, type ReactNode } from 'react';
import { useBackIntent } from '../../../hooks/useBackIntent';
import { confirmDialog } from '../../../lib/notifications';

interface Props {
  titulo: string;
  aberta: boolean;
  /** Aplica o que foi editado e fecha. */
  onConfirmar: () => void;
  /** Descarta o que foi editado e fecha. Também usado pelo X, pelo fundo e
   *  pelo botão «voltar» do Android — fechar sem confirmar é reverter. */
  onReverter: () => void;
  /** Houve alterações desde a abertura: é o que sair vai deitar fora, e por
   *  isso é o que decide se se pergunta. */
  alterada: boolean;
  /** A folha abriu já com conteúdo — o agente está a mexer em algo que tinha
   *  dado por feito, e não a preencher de raiz. Só isso justifica prometer
   *  «Reverter»; num levantamento novo não há estado anterior para onde voltar. */
  editaExistente: boolean;
  children: ReactNode;
}

/**
 * Folha inferior que hospeda uma acção da constatação (SPEC-10 §6.2).
 *
 * As superfícies que ela mostra — selector de infracções, câmara, formulário de
 * item apreendido, tabela de preços — são as que já existem no formulário por
 * passos. A modalidade iterativa reembala-as; não as reescreve. Um bug
 * corrigido numa delas corrige-se nas duas modalidades, que é a única forma de
 * a comparação entre ambas continuar a ser sobre a **forma de trabalhar** e não
 * sobre qual das duas tem a versão mais recente do mesmo ecrã.
 *
 * Regista sentinela de histórico: sem ela, o «voltar» do Android fecharia a
 * folha **e** recuaria a rota no mesmo gesto, deixando para trás a fiscalização
 * a meio (ver RULE.md §6.2).
 */
export default function FolhaAccao({
  titulo,
  aberta,
  onConfirmar,
  onReverter,
  alterada,
  editaExistente,
  children,
}: Props) {
  // A folha fecha-se **apenas** por «Confirmar» ou «Reverter». Não há X nem
  // toque fora: eram duas saídas com o mesmo aspecto de «sair» e o significado
  // silencioso de «descartar», e no terreno fechavam por engano um levantamento
  // já preenchido. Com duas acções nomeadas, sair passa a ser uma escolha.
  //
  // O botão «voltar» do Android continua ligado: o shell nativo consome-o
  // sempre, e deixá-lo sem tratamento aqui faria o `Layout` navegar para o
  // início — perder-se-ia o formulário inteiro em vez da folha (RULE.md §6.2).
  //
  // Rótulo e diálogo respondem a perguntas diferentes, e por isso não andam
  // juntos.
  //
  // O **rótulo** diz de onde o agente vem: «Reverter» só quando ele abriu algo
  // que já estava feito e lhe mexeu — aí há de facto um estado anterior para
  // onde voltar. Num levantamento novo não há, e chamar-lhe «Reverter» faz
  // parecer que existe qualquer coisa a desfazer antes de haver.
  //
  // O **diálogo** responde ao que se perde. Oito itens de apreensão acabados de
  // registar desaparecem tão bem por «Cancelar» como por «Reverter», e um toque
  // enganado no botão cinzento não pode levá-los sem aviso. Quem apenas
  // espreitou — a queixa que originou isto — continua a sair em silêncio.
  const reverte = alterada && editaExistente;
  const sair = async () => {
    if (!alterada) {
      onReverter();
      return;
    }
    const descartar = await confirmDialog({
      title: reverte ? 'Descartar alterações' : 'Descartar o que registou',
      message: reverte
        ? 'O que alterou nesta folha volta ao estado anterior.'
        : 'O que registou nesta folha não fica guardado.',
      confirmLabel: 'Descartar',
      cancelLabel: 'Continuar a editar',
    });
    if (descartar) onReverter();
  };

  useBackIntent(() => void sair(), aberta, true);

  useEffect(() => {
    if (!aberta) return;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = anterior;
    };
  }, [aberta]);

  if (!aberta) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <div className="absolute inset-0 bg-slate-900/50 dark:bg-black/60" aria-hidden />
      <div className="relative bg-[#F5F7FA] dark:bg-slate-950 rounded-t-3xl max-h-[88vh] flex flex-col shadow-2xl animate-in slide-in-from-bottom duration-200">
        <div className="px-4 py-4 flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-t-3xl shrink-0">
          <h3 className="font-bold text-sm text-slate-900 dark:text-white tracking-tight">
            {titulo}
          </h3>
        </div>
        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">{children}</div>

        <div className="shrink-0 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex gap-3">
          <button
            type="button"
            onClick={() => void sair()}
            className="px-6 py-3.5 rounded-xl text-sm font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 transition-colors"
          >
            {reverte ? 'Reverter' : 'Cancelar'}
          </button>
          <button
            type="button"
            onClick={onConfirmar}
            className="flex-1 px-6 py-3.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200/50 dark:shadow-none"
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  );
}
