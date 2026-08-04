import { Package, Truck } from 'lucide-react';
import { useNovaVisitaForm, type ItemApreensaoForm } from '../context';
import DepositarioDoAuto from '../DepositarioDoAuto';
import MotivosPendentes from '../MotivosPendentes';
import { cn } from '../../../lib/utils';
import { motivosDe } from '../../../lib/apreensaoValidacao';
import { itensDestinaveis } from '../../../lib/destinoApreensao';
import { unitCode } from '../../../lib/units';

const DESTINOS = [
  {
    valor: 'drcae',
    rotulo: 'Recolhido pela DRCAE',
    detalhe: 'Sai no acto, com a viatura.',
    icone: Truck,
    activo: 'bg-blue-600 border-blue-600 text-white',
  },
  {
    valor: 'trustee',
    rotulo: 'Fiel depositário',
    detalhe: 'Fica à guarda, com obrigação de recolha.',
    icone: Package,
    activo: 'bg-amber-500 border-amber-500 text-white',
  },
] as const;

/**
 * Para onde vai o que foi apreendido — tarefa da fiscalização (SPEC-10 §6.3).
 *
 * Apreender e encaminhar são dois momentos: o agente conta a mercadoria na
 * prateleira e só mais tarde sabe o que a viatura leva. Enquanto a pergunta
 * vivia dentro do formulário do produto, era respondida por omissão — e um auto
 * que diz «recolhido pela DRCAE» sobre mercadoria que ficou na loja não gera a
 * obrigação de recolha que devia gerar.
 *
 * Por isso é uma tarefa, contada à vista na tela como as outras, e obrigatória:
 * só o depósito produz obrigação de recolha, e um item sem destino não é um
 * auto. A identificação do fiel depositário vive aqui, ao lado da escolha que a
 * torna necessária.
 */
export default function DestinoDaApreensao() {
  const { apreensaoItens, setApreensaoItens, motivosApreensao } = useNovaVisitaForm();

  const destinaveis = itensDestinaveis(apreensaoItens);

  const definirDestino = (index: number, custody: ItemApreensaoForm['custody']) =>
    setApreensaoItens((prev) => prev.map((it, i) => (i === index ? { ...it, custody } : it)));

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
        <h3 className="font-bold text-base text-slate-800 dark:text-slate-100">
          Destino da apreensão
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
          Diga o que sai com a viatura e o que fica à guarda. O que ficar em
          depósito gera uma obrigação de recolha e exige um fiel depositário.
        </p>
      </div>

      {destinaveis.length === 0 && (
        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium text-center py-4">
          Nada apreendido nesta fiscalização. Os produtos entram por aqui quando
          forem apreendidos numa constatação.
        </p>
      )}

      <div className="space-y-2.5">
        {destinaveis.map(({ index, item }) => (
          <div
            key={index}
            className={cn(
              'bg-white dark:bg-slate-900 rounded-2xl border p-4 space-y-3 transition-colors',
              item.custody == null
                ? 'border-amber-300 dark:border-amber-800'
                : 'border-slate-200 dark:border-slate-800',
            )}
          >
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100 min-w-0 truncate">
                {item.designation.trim() || 'Produto sem designação'}
              </p>
              <span className="shrink-0 text-xs font-mono font-bold text-slate-500 dark:text-slate-400">
                {item.quantity || '—'}
                {item.assetUnit != null && ` ${unitCode(item.assetUnit)}`}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {DESTINOS.map(({ valor, rotulo, detalhe, icone: Icone, activo }) => {
                const escolhido = item.custody === valor;
                return (
                  <button
                    key={valor}
                    type="button"
                    onClick={() => definirDestino(index, valor)}
                    className={cn(
                      'p-3 rounded-xl border text-left space-y-1 transition-colors',
                      escolhido
                        ? activo
                        : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300',
                    )}
                  >
                    <Icone className="w-4 h-4" />
                    <span className="block text-[11px] font-bold leading-tight">{rotulo}</span>
                    <span
                      className={cn(
                        'block text-[10px] font-medium leading-snug',
                        escolhido ? 'opacity-90' : 'text-slate-400 dark:text-slate-500',
                      )}
                    >
                      {detalhe}
                    </span>
                  </button>
                );
              })}
            </div>

            {item.custody == null && (
              <p className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-widest">
                Destino por definir
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Nasce do «fiel depositário» escolhido acima, e por isso vem a seguir:
          é a identificação de quem aceita a guarda desta fiscalização. */}
      <DepositarioDoAuto mostrarAmbito />

      <MotivosPendentes motivos={motivosDe(motivosApreensao, ['destino', 'depositario'])} />
    </div>
  );
}
