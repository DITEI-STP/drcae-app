import { AlertTriangle } from 'lucide-react';
import type { MotivoApreensao } from '../../lib/apreensaoValidacao';

interface Props {
  motivos: MotivoApreensao[];
  /** Cabeçalho do bloco. Por omissão, o do passo que bloqueia. */
  titulo?: string;
}

/**
 * O que falta, dito por extenso.
 *
 * Bloquear com o botão apenas desactivado é indistinguível de uma avaria para
 * quem está no terreno. O bloco existia copiado no passo de apreensão e no
 * formulário de produtos; a tarefa do destino era a terceira cópia, e é a essa
 * ocorrência que a extracção se justifica.
 */
export default function MotivosPendentes({ motivos, titulo = 'Falta para poder avançar:' }: Props) {
  if (motivos.length === 0) return null;

  return (
    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40 rounded-2xl p-4 flex items-start gap-2.5">
      <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
      <div className="space-y-1">
        <p className="text-xs font-bold text-red-800 dark:text-red-300">{titulo}</p>
        <ul className="space-y-0.5">
          {motivos.map((motivo) => (
            <li
              key={motivo.codigo}
              className="text-xs font-semibold text-red-700 dark:text-red-400"
            >
              • {motivo.texto}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
