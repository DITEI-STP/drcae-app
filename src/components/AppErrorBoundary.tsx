import { Component, type ErrorInfo, type ReactNode } from 'react';
import { addAppLog } from '../lib/appLogs';
import { DRAFT_STATE_KEY } from '../lib/visitaDraftState';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Fronteira de erro da aplicação.
 *
 * Sem ela, uma excepção durante o render desmonta a árvore inteira e o agente
 * fica com **ecrã branco** — dentro do kiosque, sem browser, sem consola e sem
 * caminho de recuperação. Foi exactamente o que aconteceu quando um campo que
 * mudou de forma (a equipa, que passou de nomes a objectos) chegou a um
 * componente que ainda o tratava como texto.
 *
 * O princípio é o mesmo do fail-safe de navegação: o dispositivo nunca pode
 * ficar sem uma saída. Aqui a saída é ver o erro, recarregar, e — em último
 * recurso — limpar a cache local sem perder o que está por sincronizar.
 */
export default class AppErrorBoundary extends Component<Props, State> {
  // `@types/react` não está instalado neste projecto (não havia componentes de
  // classe), pelo que os membros herdados precisam de declaração explícita.
  declare props: Props;
  declare state: State;

  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Sobe no push seguinte: sem isto, um ecrã branco em campo chega como
    // «não faz nada» e sem forma de saber o quê.
    addAppLog('error', 'render', 'Erro de render apanhado pela fronteira', {
      message: error.message,
      stack: error.stack?.slice(0, 2000),
      componentStack: info.componentStack?.slice(0, 2000),
    });
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-[#F5F7FA] dark:bg-slate-950 p-6">
        <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl p-6 space-y-4">
          <div className="space-y-1">
            <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">
              A aplicação encontrou um erro
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Os dados guardados neste dispositivo estão seguros. O erro foi
              registado e será enviado na próxima sincronização.
            </p>
          </div>

          <pre className="text-[11px] font-mono bg-slate-50 dark:bg-slate-800 text-red-700 dark:text-red-400 rounded-xl p-3 overflow-auto max-h-40 whitespace-pre-wrap">
            {this.state.error.message}
          </pre>

          <div className="space-y-2">
            <button
              onClick={() => window.location.reload()}
              className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold transition-colors"
            >
              Recarregar aplicação
            </button>
            <button
              onClick={() => {
                // Recuperação de último recurso: descarta apenas os dados de
                // referência e o estado de sessão, nunca a base cifrada com
                // fiscalizações por sincronizar.
                //
                // As provas do rascunho ficam no Dexie e não são apagadas
                // aqui: sem o estado que as enquadra ninguém as vai
                // recuperar, e a abertura seguinte do formulário limpa-as ao
                // não encontrar rascunho. Apagar a base a partir de um ecrã
                // de erro é o risco que esta acção existe para não correr.
                try {
                  for (const key of ['drcae_equipe', 'drcae_officers_list', DRAFT_STATE_KEY]) {
                    localStorage.removeItem(key);
                  }
                } catch { /* best-effort */ }
                window.location.href = '/app/';
              }}
              className="w-full py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold transition-colors"
            >
              Limpar dados de sessão e recomeçar
            </button>
          </div>

          <p className="text-[10px] text-slate-400 dark:text-slate-500 text-center leading-relaxed">
            As fiscalizações por sincronizar não são apagadas por nenhuma
            destas acções.
          </p>
        </div>
      </div>
    );
  }
}
