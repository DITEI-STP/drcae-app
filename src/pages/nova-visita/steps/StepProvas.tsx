import React from 'react';
import { useNovaVisitaForm } from '../context';
import { Camera, FolderOpen, Video, X } from 'lucide-react';
import CameraCapture from '../../../components/CameraCapture';
import SpeechInputButton from '../../../components/SpeechInputButton';
import EvidenciaPreview, { isVideo } from '../../../components/EvidenciaPreview';
import VideoThumb from '../../../components/VideoThumb';

/**
 * Captura de provas — foto, vídeo e galeria — e observações do agente.
 *
 * O estado vive no componente-pai e chega por contexto — ver `../context.ts`.
 */
export default function StepProvas() {
  const {
    anexos,
    cameraMode,
    fileInputRef,
    handleFileChange,
    notes,
    queueAnexos,
    removeAnexo,
    selectedPreview,
    setSelectedPreview,
    setCameraMode,
    setNotes,
    setShowCamera,
    showCamera,
    saveDraft,
  } = useNovaVisitaForm();

  return (
  <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300 bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
     <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">Captura de Provas</p>

     {showCamera && (
       <div className="w-full max-w-sm mx-auto rounded-2xl overflow-hidden shadow-xl">
         <CameraCapture
           mode={cameraMode}
           onCapture={(file) => {
             queueAnexos([file]);
           }}
           onClose={() => setShowCamera(false)}
         />
       </div>
     )}

     <div className="grid grid-cols-3 gap-3">
       <button
         onClick={() => {
           setCameraMode('photo');
           setShowCamera(true);
         }}
         className="flex flex-col items-center justify-center gap-2 p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 border-dashed rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-blue-600"
       >
          <Camera className="w-7 h-7" />
          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Foto</span>
       </button>

       <button
         onClick={() => {
           setCameraMode('video');
           setShowCamera(true);
         }}
         className="flex flex-col items-center justify-center gap-2 p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 border-dashed rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-red-500"
       >
          <Video className="w-7 h-7" />
          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Vídeo</span>
       </button>

       <button
         onClick={async () => {
           await saveDraft(anexos);
           fileInputRef.current?.click();
         }}
         className="flex flex-col items-center justify-center gap-2 p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 border-dashed rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-emerald-600"
       >
          <FolderOpen className="w-7 h-7" />
          <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">Galeria</span>
       </button>
     </div>

     <input type="file" accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp,.txt,.csv" multiple className="hidden" ref={fileInputRef} onChange={handleFileChange} />

     {anexos.length > 0 && (
        <div className="grid grid-cols-3 gap-3 mt-4">
           {anexos.map((anx, i) => (
              <div key={anx.localId} className="relative aspect-square rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 shadow-sm">
                 {anx.file.type.startsWith('image/') ? (
                    <button
                       type="button"
                       onClick={() => setSelectedPreview({ url: anx.url, type: anx.file.type, name: anx.file.name })}
                       className="w-full h-full"
                    >
                       <img src={anx.url} alt="Prova recolhida" className="w-full h-full object-cover" />
                    </button>
                 ) : isVideo(anx.file.type, anx.file.name) ? (
                    /* O vídeo mostra o primeiro fotograma como miniatura e abre
                       o visualizador ao toque. Antes ficava um rectângulo cinzento
                       com a extensão, e o agente não tinha forma de confirmar que
                       tinha filmado o que julgava ter filmado. */
                    <button
                       type="button"
                       onClick={() => setSelectedPreview({ url: anx.url, type: anx.file.type, name: anx.file.name })}
                       className="w-full h-full relative"
                       aria-label="Ver vídeo"
                    >
                       <VideoThumb url={anx.url} />
                    </button>
                 ) : (
                    <div className="flex h-full items-center justify-center bg-slate-50 dark:bg-slate-800 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">{anx.file.name.split('.').pop()}</div>
                 )}
                 <button onClick={() => removeAnexo(i)} className="absolute top-2 right-2 bg-slate-900/60 backdrop-blur-sm text-white rounded-full p-1 hover:bg-slate-900/80 transition-colors">
                    <X className="w-3.5 h-3.5" />
                 </button>
              </div>
           ))}
        </div>
     )}

     <div className="space-y-2 mt-8 border-t border-slate-100 dark:border-slate-800 pt-6">
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Observações Detalhadas</label>
          <SpeechInputButton onTranscript={t => setNotes(prev => prev ? `${prev} ${t}` : t)} />
        </div>
        <textarea
          rows={4}
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Descreva a situação encontrada no local..."
          className="w-full p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:bg-white dark:focus:bg-slate-700 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 text-sm font-medium text-slate-800 dark:text-slate-100"
        />
     </div>
     <EvidenciaPreview evidencia={selectedPreview} onFechar={() => setSelectedPreview(null)} />
  </div>
  );
}
