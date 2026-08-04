import { useState, type ReactNode } from 'react';
import { ArrowLeft, Check, LayoutList, Sparkles } from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  getPreferredModality,
  rememberPreferredModality,
  type ModalidadeFiscalizacao,
} from '../../lib/inspectionModality';

interface Props {
  onEscolher: (modalidade: ModalidadeFiscalizacao) => void;
  onVoltar: () => void;
}

/**
 * Escolha da modalidade de trabalho, antes do passo 1 (SPEC-10 §5.2).
 *
 * Só aparece a quem tem o grant do piloto; sem ele, «Nova Fiscalização» abre
 * directamente o formulário por passos e este ecrã não existe.
 *
 * As duas opções são descritas de forma neutra, sem «recomendado» e sem
 * adjectivos que puxem para um dos lados: o objectivo do ecrã é recolher uma
 * escolha, e enviesá-la enviesaria a validação inteira que ele serve.
 */
export default function ModalidadeSelector({ onEscolher, onVoltar }: Props) {
  const [seleccionada, setSeleccionada] = useState<ModalidadeFiscalizacao>(
    getPreferredModality,
  );

  const confirmar = () => {
    rememberPreferredModality(seleccionada);
    onEscolher(seleccionada);
  };

  return (
    <div className="flex flex-col h-full bg-[#F5F7FA] dark:bg-slate-950 text-slate-800 dark:text-slate-100">
      <div className="px-4 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0 sticky top-0 bg-white dark:bg-slate-900 z-10 flex items-center">
        <button
          onClick={onVoltar}
          className="mr-3 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="font-bold text-slate-900 dark:text-white tracking-tight">Nova Visita</h2>
      </div>

      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-5 custom-scrollbar">
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
          <h3 className="font-bold text-base text-slate-800 dark:text-slate-100">
            Como quer trabalhar hoje?
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-medium font-sans">
            As duas modalidades registam a mesma fiscalização e produzem a mesma acta.
            Muda a forma de a preencher no terreno.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <CartaoModalidade
            icone={<LayoutList className="w-6 h-6" />}
            titulo="Por passos"
            passos="8 passos"
            descricao="Percorre os domínios por ordem fixa: infracções, apreensão, provas, preços e recomendações, um ecrã de cada vez."
            seleccionado={seleccionada === 'stepper'}
            onSeleccionar={() => setSeleccionada('stepper')}
          />
          <CartaoModalidade
            icone={<Sparkles className="w-6 h-6" />}
            titulo="Iterativa"
            passos="4 passos"
            descricao="Uma tela única onde regista cada constatação à medida que a encontra, com as fotos, a infracção e a apreensão juntas."
            seleccionado={seleccionada === 'iterativa'}
            onSeleccionar={() => setSeleccionada('iterativa')}
          />
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 p-4 shrink-0 mt-auto font-sans">
        <button
          onClick={confirmar}
          className="w-full px-6 py-3.5 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-200/50 dark:shadow-none"
        >
          Começar
        </button>
      </div>
    </div>
  );
}

interface CartaoProps {
  icone: ReactNode;
  titulo: string;
  passos: string;
  descricao: string;
  seleccionado: boolean;
  onSeleccionar: () => void;
}

function CartaoModalidade({
  icone,
  titulo,
  passos,
  descricao,
  seleccionado,
  onSeleccionar,
}: CartaoProps) {
  return (
    <button
      type="button"
      onClick={onSeleccionar}
      className={cn(
        'text-left p-5 rounded-2xl border transition-colors flex flex-col gap-3',
        seleccionado
          ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-400 dark:border-indigo-500 shadow-sm'
          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800',
      )}
    >
      <div className="flex items-center justify-between">
        <span
          className={cn(
            'w-11 h-11 rounded-xl flex items-center justify-center',
            seleccionado
              ? 'bg-indigo-600 text-white'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400',
          )}
        >
          {icone}
        </span>
        <span
          className={cn(
            'w-6 h-6 rounded-full border flex items-center justify-center shrink-0',
            seleccionado
              ? 'bg-indigo-600 border-indigo-600 text-white'
              : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600',
          )}
        >
          {seleccionado && <Check className="w-3.5 h-3.5" />}
        </span>
      </div>
      <div className="space-y-1">
        <p className="font-bold text-sm text-slate-900 dark:text-white">{titulo}</p>
        <p className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">
          {passos}
        </p>
      </div>
      <p className="text-xs leading-relaxed font-medium text-slate-600 dark:text-slate-400">
        {descricao}
      </p>
    </button>
  );
}
