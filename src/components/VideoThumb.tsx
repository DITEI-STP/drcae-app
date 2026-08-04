import { useEffect, useState } from 'react';
import { Play, Video } from 'lucide-react';
import { cn } from '../lib/utils';
import { obterPosterVideo, resolverPosterDeAnexo } from '../lib/videoPoster';

interface Props {
  url: string;
  /**
   * Anexo já gravado. Com ele a miniatura vem do servidor ou do disco, e só
   * descodifica quando nenhuma das duas existe — ver `lib/videoPoster.ts`.
   */
  anexoId?: string;
  className?: string;
}

/**
 * Miniatura de uma prova em vídeo.
 *
 * Desenha o fotograma extraído por `lib/videoPoster.ts`. Não usa um `<video>`
 * com `preload="metadata"`, que era o que aqui estava: essa via carrega a
 * duração mas não pinta nada, e na WebView do Android a miniatura ficava um
 * quadrado preto — duas provas filmadas no mesmo dia eram indistinguíveis.
 *
 * Enquanto o fotograma não chega, e quando não é possível extraí-lo — vídeo
 * corrompido, codec não suportado, ficheiro servido sem CORS —, fica o ícone.
 * Nunca fica vazio.
 */
export default function VideoThumb({ url, anexoId, className }: Props) {
  const [poster, setPoster] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    const pedido = anexoId ? resolverPosterDeAnexo(anexoId, url) : obterPosterVideo(url);
    pedido
      .then((p) => vivo && setPoster(p))
      .catch(() => vivo && setPoster(null));
    return () => {
      vivo = false;
    };
  }, [url, anexoId]);

  return (
    <div className={cn('relative w-full h-full bg-slate-900', className)}>
      {poster ? (
        <img src={poster} alt="Fotograma do vídeo" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <Video className="w-7 h-7 text-slate-500" />
        </div>
      )}
      <span className="absolute inset-0 flex items-center justify-center bg-slate-950/25">
        <Play className="w-7 h-7 text-white drop-shadow" />
      </span>
    </div>
  );
}
