import { FileText, Headphones, Play } from 'lucide-react';
import type { EvidenciaSeleccionada } from './EvidenciaPreview';
import { isAudio, isImage, isVideo } from './EvidenciaPreview';

type FileItem = { uid: string; name: string; mimetype?: string; url: string };

export default function ComplaintEvidenceGrid({ files, onSelect }: {
  files: FileItem[];
  onSelect: (file: EvidenciaSeleccionada) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
      {files.map((file) => {
        const selected = { url: file.url, type: file.mimetype, name: file.name };
        return (
          <button key={file.uid} type="button" onClick={() => onSelect(selected)} className="group overflow-hidden rounded-2xl border border-slate-200 bg-white text-left shadow-sm transition active:scale-[.98] dark:border-slate-700 dark:bg-slate-900">
            <span className="relative flex aspect-square items-center justify-center overflow-hidden bg-slate-100 dark:bg-slate-950">
              {isImage(file.mimetype, file.name) ? <img src={file.url} alt="" className="h-full w-full object-cover" />
                : isVideo(file.mimetype, file.name) ? <><video src={file.url} muted preload="metadata" className="h-full w-full object-cover" /><span className="absolute rounded-full bg-slate-950/70 p-2 text-white"><Play className="h-4 w-4" /></span></>
                : isAudio(file.mimetype, file.name) ? <Headphones className="h-8 w-8 text-blue-500" />
                : <FileText className="h-8 w-8 text-blue-500" />}
            </span>
            <span className="block truncate p-2.5 text-[11px] font-bold text-slate-700 dark:text-slate-200">{file.name}</span>
          </button>
        );
      })}
    </div>
  );
}
