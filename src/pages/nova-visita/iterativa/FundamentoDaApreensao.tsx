import { useState } from 'react';
import { AlertTriangle, FileText, Gavel } from 'lucide-react';
import { useNovaVisitaForm } from '../context';
import PickerSheet from '../../../components/PickerSheet';
import { cn } from '../../../lib/utils';
import { toast } from '../../../lib/notifications';

/**
 * Fundamento da apreensão feita sem infracção levantada.
 *
 * Apreender exige fundamento, e o agente que chega aqui tem-no na cabeça — o
 * que lhe faltava era o caminho. Enquanto a única saída era declarar «apreendo
 * sem infracção», quem sabia exactamente que artigo tinha sido violado tinha de
 * escolher entre sair da folha para o registar ou escrevê-lo em texto livre, e
 * o texto livre não conta como infracção em lado nenhum.
 *
 * Por isso são duas vias, lado a lado:
 *
 * - **registar a infracção** que motiva a apreensão, do catálogo, ligada à
 *   constatação em aberto — e a partir daí o auto tem artigo a citar;
 * - **apreender sem infracção**, com o motivo escrito, que é o que fundamenta o
 *   acto quando ainda não há enquadramento.
 *
 * Vale para a fiscalização inteira e não para a constatação onde foi
 * preenchida: o auto é um só. Aparece dentro da folha de Produtos porque é aí
 * que o agente está no momento em que decide levar o produto — mandá-lo a outro
 * ecrã para o fundamentar perderia o momento.
 */
export default function FundamentoDaApreensao() {
  const {
    predefinedInfracoes,
    toggleInfracao,
    apreensaoSemInfracao,
    setApreensaoSemInfracao,
    apreensaoJustificacao,
    setApreensaoJustificacao,
  } = useNovaVisitaForm();

  const [picker, setPicker] = useState(false);

  const registarInfracao = (type: string) => {
    const item = predefinedInfracoes.find((inf) => inf.type === type);
    if (!item) return;
    toggleInfracao(item);
    // Com infracção registada, a declaração de apreensão sem infracção deixa de
    // valer — e a justificação que a acompanha deixaria de ser exigida sem
    // deixar de estar marcada, bloqueando o avanço por um motivo já resolvido.
    setApreensaoSemInfracao(false);
    setPicker(false);
    toast.success(`Infracção registada: ${item.type}`);
  };

  return (
    <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-300 dark:border-amber-900/40 rounded-2xl p-4 space-y-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-800 dark:text-amber-300 leading-relaxed font-medium">
          Não há infracção levantada nesta fiscalização, e a apreensão precisa de
          fundamento. Registe a infracção que a motiva, ou apreenda sem infracção
          associada e escreva o motivo. Aplica-se à fiscalização inteira.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setPicker(true)}
          className="p-3 rounded-xl border bg-white dark:bg-slate-900 border-amber-200 dark:border-amber-900/40 text-left space-y-1 hover:border-red-300 transition-colors"
        >
          <Gavel className="w-4 h-4 text-red-600" />
          <span className="block text-[11px] font-bold leading-tight text-slate-800 dark:text-slate-100">
            Registar infracção
          </span>
          <span className="block text-[10px] font-medium leading-snug text-slate-500 dark:text-slate-400">
            Do catálogo, ligada a esta constatação.
          </span>
        </button>

        <button
          type="button"
          onClick={() => setApreensaoSemInfracao(!apreensaoSemInfracao)}
          aria-pressed={apreensaoSemInfracao}
          className={cn(
            'p-3 rounded-xl border text-left space-y-1 transition-colors',
            apreensaoSemInfracao
              ? 'bg-amber-500 border-amber-500 text-white'
              : 'bg-white dark:bg-slate-900 border-amber-200 dark:border-amber-900/40 hover:border-amber-400',
          )}
        >
          <FileText className="w-4 h-4" />
          <span
            className={cn(
              'block text-[11px] font-bold leading-tight',
              !apreensaoSemInfracao && 'text-slate-800 dark:text-slate-100',
            )}
          >
            Apreender sem infracção
          </span>
          <span
            className={cn(
              'block text-[10px] font-medium leading-snug',
              apreensaoSemInfracao ? 'opacity-90' : 'text-slate-500 dark:text-slate-400',
            )}
          >
            Exige motivo escrito.
          </span>
        </button>
      </div>

      {apreensaoSemInfracao && (
        <label className="block space-y-1.5">
          <span className="text-[10px] font-bold text-amber-900 dark:text-amber-200 uppercase tracking-widest">
            Motivo da apreensão
          </span>
          <textarea
            value={apreensaoJustificacao}
            onChange={(e) => setApreensaoJustificacao(e.target.value)}
            rows={3}
            placeholder="O que fundamenta levar o produto sem infracção levantada…"
            className="w-full p-3 text-xs bg-white dark:bg-slate-800 border border-amber-200 dark:border-amber-900/40 rounded-xl outline-none focus:ring-2 focus:ring-amber-500 text-slate-800 dark:text-slate-100"
          />
        </label>
      )}

      <PickerSheet
        open={picker}
        title="Infracção"
        options={predefinedInfracoes.map((inf) => ({
          value: inf.type,
          label: inf.type,
          hint: inf.severity,
        }))}
        value={null}
        onSelect={registarInfracao}
        onClose={() => setPicker(false)}
        searchPlaceholder="Procurar infracção..."
        emptyLabel="Catálogo de infracções por sincronizar."
      />
    </div>
  );
}
