import { useBackIntent } from '../hooks/useBackIntent';

export interface EvidenciaSeleccionada {
  url: string;
  /** MIME do ficheiro. Vazio em anexos antigos, que são tratados como imagem. */
  type?: string;
  name?: string;
}

interface Props {
  evidencia: EvidenciaSeleccionada | null;
  onFechar: () => void;
}

export function isVideo(type: string | undefined, name?: string): boolean {
  if (type?.startsWith('video/')) return true;
  // Anexos vindos do servidor podem chegar sem MIME; a extensão é o recurso.
  return /\.(mp4|webm|mov|3gp|mkv)$/i.test(name ?? '');
}

/**
 * Visualizador de uma prova recolhida no acto.
 *
 * Serve fotografias **e vídeos**: o `<img>` que aqui estava renderizava um
 * vídeo como imagem partida, pelo que uma prova filmada no terreno não podia
 * ser revista antes de a fiscalização ser fechada — e um vídeo que ninguém
 * conseguiu ver é uma prova que ninguém confirmou ter ficado utilizável.
 *
 * Vive em ficheiro próprio, e não copiado nos dois ecrãs que o usam, porque
 * regista `useBackIntent`: duas cópias do contrato do botão «voltar» divergem à
 * primeira alteração, e é aí que o gesto passa a fechar o modal **e** a recuar
 * a rota no mesmo toque (RULE.md §6.2).
 */
export default function EvidenciaPreview({ evidencia, onFechar }: Props) {
  useBackIntent(onFechar, !!evidencia);

  if (!evidencia) return null;

  const video = isVideo(evidencia.type, evidencia.name);

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-250">
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 max-w-2xl w-full overflow-hidden shadow-2xl relative p-3 animate-in zoom-in-95 duration-250 flex flex-col">
        <div className="flex justify-between items-center px-4 py-2 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-100 dark:border-slate-700 mb-2">
          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            {video ? 'Evidência em Vídeo' : 'Evidência Fotográfica'}
          </span>
          <button
            onClick={onFechar}
            className="p-1.5 px-3 bg-red-50 dark:bg-red-900/30 hover:bg-red-100 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 font-bold rounded-full text-xs transition-colors"
          >
            Fechar
          </button>
        </div>
        <div className="flex justify-center items-center bg-slate-950 rounded-2xl overflow-hidden aspect-video relative max-h-[60vh]">
          {video ? (
            <video
              src={evidencia.url}
              controls
              autoPlay
              playsInline
              className="max-h-full max-w-full"
            />
          ) : (
            <img
              referrerPolicy="no-referrer"
              src={evidencia.url}
              alt="Prova recolhida"
              className="max-h-full max-w-full object-contain"
            />
          )}
        </div>
      </div>
    </div>
  );
}
