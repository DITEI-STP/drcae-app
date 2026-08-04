import { useNovaVisitaForm } from './context';
import ChipGroup from '../../components/ChipGroup';
import PessoaDocumentoFields, {
  pessoaDocumentoCompleta,
} from '../../components/PessoaDocumentoFields';
import type { TrusteeKind } from '../../db/db';

interface Props {
  /**
   * Diz que o depositário vale para a fiscalização inteira.
   *
   * Só a modalidade iterativa precisa: lá a folha abre por constatação, e o
   * agente que apreende em duas constatações vê o mesmo bloco duas vezes a
   * editar o mesmo dado. No formulário por passos há um passo só, e a nota não
   * acrescentaria nada.
   */
  mostrarAmbito?: boolean;
}

/**
 * Quem fica com a guarda do que não é levado no acto.
 *
 * A firma é o caso corrente e não pede nada: o responsável é o operador que o
 * auto já identifica, e o representante já registado na fiscalização é quem
 * assina. Só o depositário terceiro obriga a escrever, porque não está
 * registado em lado nenhum — e é a ele que se exige a devolução.
 *
 * Extraído de `steps/StepApreensao.tsx` sem alteração de comportamento, para o
 * formulário fundido de Produtos não ficar com uma segunda cópia. É um
 * formulário com força probatória; duas cópias divergiriam à primeira correcção
 * feita só numa delas.
 */
export default function DepositarioDoAuto({ mostrarAmbito = false }: Props) {
  const {
    apreensaoItens,
    trustee,
    setTrustee,
    firmas,
    firmaId,
    representante,
  } = useNovaVisitaForm();

  const temDeposito = apreensaoItens.some((i) => i.custody === 'trustee');
  if (!temDeposito) return null;

  const depositarioIdentificado = pessoaDocumentoCompleta(trustee);
  const firmaName = firmas?.find((f) => f.id === firmaId)?.name;

  return (
    <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-300 dark:border-amber-900/40 rounded-2xl p-4 space-y-3">
      <div className="space-y-0.5">
        <p className="text-xs font-bold text-amber-900 dark:text-amber-200 uppercase tracking-wider">
          Fiel Depositário
        </p>
        {mostrarAmbito && (
          <p className="text-[10px] font-semibold text-amber-800/80 dark:text-amber-300/80">
            Aplica-se a todos os produtos em depósito desta fiscalização.
          </p>
        )}
      </div>

      <ChipGroup
        options={[
          { value: 'operator', label: firmaName || 'A própria firma' },
          { value: 'person', label: 'Outra pessoa' },
        ]}
        value={trustee.kind}
        onChange={(kind) => setTrustee({ ...trustee, kind: kind as TrusteeKind })}
      />

      {trustee.kind === 'operator' ? (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold text-amber-900 dark:text-amber-200">
            A guarda fica com o operador económico. Nada a preencher.
          </p>
          {/* Quem assina vem do representante já identificado no passo próprio:
              mostrado para o agente confirmar que é mesmo quem aceita a guarda,
              não para o reescrever. */}
          <p className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
            {representante?.name
              ? `Assina: ${representante.name}${representante.role ? ` (${representante.role})` : ''}`
              : 'Assina o representante identificado nesta fiscalização.'}
          </p>
        </div>
      ) : (
        <>
          <PessoaDocumentoFields
            value={{
              name: trustee.name,
              docType: trustee.docType,
              docNumber: trustee.docNumber,
            }}
            onChange={(next) => setTrustee({ ...trustee, ...next })}
            namePlaceholder="Nome do fiel depositário *"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              type="text"
              value={trustee.role}
              onChange={(e) => setTrustee({ ...trustee, role: e.target.value })}
              placeholder="Qualidade / entidade que representa"
              className="p-3 text-sm bg-white dark:bg-slate-800 border border-amber-200 dark:border-amber-900/40 rounded-xl outline-none text-slate-800 dark:text-slate-100"
            />
            <input
              type="text"
              value={trustee.contact}
              onChange={(e) => setTrustee({ ...trustee, contact: e.target.value })}
              placeholder="Contacto"
              className="p-3 text-sm bg-white dark:bg-slate-800 border border-amber-200 dark:border-amber-900/40 rounded-xl outline-none text-slate-800 dark:text-slate-100"
            />
          </div>
          {!depositarioIdentificado && (
            <p className="text-[11px] font-semibold text-red-700 dark:text-red-400">
              Nome, tipo e número de documento são obrigatórios: é a quem se exige a
              devolução.
            </p>
          )}
        </>
      )}
    </div>
  );
}
