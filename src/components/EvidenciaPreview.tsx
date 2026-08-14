import { useEffect, useState, type ReactElement } from 'react';
import { Download, ExternalLink, FileText, Headphones, RotateCw, X, ZoomIn, ZoomOut } from 'lucide-react';
import { useBackIntent } from '../hooks/useBackIntent';

export interface EvidenciaSeleccionada {
  url: string;
  type?: string;
  name?: string;
}

interface Props { evidencia: EvidenciaSeleccionada | null; onFechar: () => void }

export function isVideo(type?: string, name?: string): boolean {
  return Boolean(type?.startsWith('video/') || /\.(mp4|webm|mov|3gp|mkv)$/i.test(name ?? ''));
}

export function isAudio(type?: string, name?: string): boolean {
  return Boolean(type?.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|aac)$/i.test(name ?? ''));
}

export function isImage(type?: string, name?: string): boolean {
  if (type?.startsWith('image/')) return true;
  if (type && type !== 'application/octet-stream') return false;
  return /\.(jpe?g|png|gif|webp|heic)$/i.test(name ?? '') || (!type && !isVideo(type, name) && !isAudio(type, name));
}

export default function EvidenciaPreview({ evidencia, onFechar }: Props) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [drag, setDrag] = useState<{ x: number; y: number; originX: number; originY: number } | null>(null);
  useBackIntent(onFechar, !!evidencia);
  useEffect(() => { setZoom(1); setRotation(0); setOffset({ x: 0, y: 0 }); }, [evidencia?.url]);
  if (!evidencia) return null;

  const image = isImage(evidencia.type, evidencia.name);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-3 backdrop-blur-md">
      <div className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-slate-950 shadow-2xl">
        <header className="flex items-center justify-between gap-3 border-b border-white/10 p-3">
          <div className="min-w-0"><p className="truncate text-xs font-bold text-white">{evidencia.name ?? 'Evidência'}</p><p className="text-[10px] uppercase tracking-wider text-slate-400">{kindLabel(evidencia)}</p></div>
          <div className="flex items-center gap-1">
            {image && <><Control label="Reduzir" onClick={() => setZoom((v) => Math.max(.5, v - .25))}><ZoomOut /></Control><span className="w-11 text-center text-[10px] text-slate-300">{Math.round(zoom * 100)}%</span><Control label="Ampliar" onClick={() => setZoom((v) => Math.min(4, v + .25))}><ZoomIn /></Control><Control label="Rodar" onClick={() => setRotation((v) => v + 90)}><RotateCw /></Control></>}
            <a href={evidencia.url} target="_blank" rel="noreferrer" className="rounded-lg p-2 text-slate-300 hover:bg-white/10" aria-label="Abrir"><ExternalLink className="h-4 w-4" /></a>
            <a href={evidencia.url} download={evidencia.name} className="rounded-lg p-2 text-blue-400 hover:bg-white/10" aria-label="Descarregar"><Download className="h-4 w-4" /></a>
            <Control label="Fechar" onClick={onFechar}><X /></Control>
          </div>
        </header>
        <div className="flex min-h-[55vh] flex-1 touch-none items-center justify-center overflow-hidden p-3" onPointerMove={(event) => drag && setOffset({ x: drag.originX + event.clientX - drag.x, y: drag.originY + event.clientY - drag.y })} onPointerUp={() => setDrag(null)} onPointerCancel={() => setDrag(null)}>
          {image ? <img src={evidencia.url} alt={evidencia.name ?? 'Evidência'} draggable={false} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); setDrag({ x: event.clientX, y: event.clientY, originX: offset.x, originY: offset.y }); }} className="max-h-[75vh] max-w-full cursor-grab select-none object-contain active:cursor-grabbing" style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom}) rotate(${rotation}deg)` }} />
            : isVideo(evidencia.type, evidencia.name) ? <video src={evidencia.url} controls autoPlay playsInline className="max-h-[75vh] max-w-full" />
            : isAudio(evidencia.type, evidencia.name) ? <div className="w-full max-w-lg rounded-2xl bg-white/10 p-8 text-center"><Headphones className="mx-auto mb-5 h-10 w-10 text-blue-400" /><audio src={evidencia.url} controls autoPlay className="w-full" /></div>
            : evidencia.type === 'application/pdf' || evidencia.type?.startsWith('text/') ? <iframe src={evidencia.url} title={evidencia.name} className="h-[75vh] w-full rounded-xl bg-white" />
            : <div className="text-center text-slate-300"><FileText className="mx-auto h-12 w-12 text-blue-400" /><p className="mt-4 text-sm">Abra ou descarregue este documento.</p></div>}
        </div>
      </div>
    </div>
  );
}

function kindLabel(file: EvidenciaSeleccionada) {
  if (isImage(file.type, file.name)) return 'Imagem';
  if (isVideo(file.type, file.name)) return 'Vídeo';
  if (isAudio(file.type, file.name)) return 'Áudio';
  return 'Documento';
}

function Control({ label, onClick, children }: { label: string; onClick: () => void; children: ReactElement<{ className?: string }> }) {
  return <button type="button" aria-label={label} onClick={onClick} className="rounded-lg p-2 text-slate-300 hover:bg-white/10">{children && <span className="block [&>svg]:h-4 [&>svg]:w-4">{children}</span>}</button>;
}
