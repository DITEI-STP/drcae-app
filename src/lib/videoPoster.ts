/**
 * Fotograma de pré-visualização de um vídeo (miniatura).
 *
 * `preload="metadata"` carrega a duração e as dimensões, mas **não desenha
 * nada**: na WebView do Android o `<video>` fica preto até haver reprodução ou
 * um salto explícito no tempo. Para haver miniatura é preciso pedir o
 * fotograma, saltar para ele e copiá-lo para um `canvas`.
 */

/** Instante do fotograma, em segundos. */
export function escolherInstantePoster(duracao: number): number {
  // O primeiro fotograma é quase sempre inútil — a câmara ainda está a expor e
  // sai preto ou queimado. Um segundo depois já mostra a cena.
  if (!Number.isFinite(duracao) || duracao <= 0) return 0.1;
  if (duracao <= 0.4) return duracao / 2;
  return Math.min(1, duracao / 2);
}

const cache = new Map<string, Promise<string | null>>();

const TIMEOUT_MS = 8_000;

function extrair(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    let terminado = false;

    const terminar = (poster: string | null) => {
      if (terminado) return;
      terminado = true;
      clearTimeout(prazo);
      video.removeAttribute('src');
      video.load();
      resolve(poster);
    };

    // Um vídeo corrompido ou um codec que a WebView não decodifica pode nunca
    // disparar evento nenhum. Sem prazo, a promessa ficava pendurada e a
    // miniatura nunca resolvia para o fallback.
    const prazo = window.setTimeout(() => terminar(null), TIMEOUT_MS);

    // `muted` e `playsInline` não são cosmética: sem eles o Android recusa
    // mexer no vídeo fora de um gesto do utilizador, e o salto no tempo — que é
    // o que produz o fotograma — nunca acontece.
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    // Necessário para o canvas não ficar contaminado quando o vídeo vem do
    // servidor; em `blob:` local é inofensivo.
    video.crossOrigin = 'anonymous';

    video.onloadedmetadata = () => {
      video.currentTime = escolherInstantePoster(video.duration);
    };

    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        if (!canvas.width || !canvas.height) return terminar(null);
        const ctx = canvas.getContext('2d');
        if (!ctx) return terminar(null);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        terminar(canvas.toDataURL('image/jpeg', 0.6));
      } catch {
        // `toDataURL` lança quando o canvas ficou contaminado por um vídeo
        // servido sem CORS. A miniatura desaparece; o vídeo continua a abrir.
        terminar(null);
      }
    };

    video.onerror = () => terminar(null);
    video.src = url;
  });
}

/**
 * Fotograma em `data:` URL, ou `null` quando não é possível extraí-lo.
 *
 * Memorizado por URL: a mesma prova aparece na captura, na revisão e no detalhe
 * da fiscalização, e descodificar o vídeo três vezes num tablet é trabalho
 * desnecessário sobre uma bateria que tem de durar o dia.
 */
export function obterPosterVideo(url: string): Promise<string | null> {
  const existente = cache.get(url);
  if (existente) return existente;
  const pedido = extrair(url);
  cache.set(url, pedido);
  return pedido;
}

/** Liberta a memória do poster quando o anexo deixa de existir. */
export function esquecerPosterVideo(url: string): void {
  cache.delete(url);
}

/**
 * Fotograma de um anexo já gravado, por ordem de custo.
 *
 * 1. O que o servidor guardou — nada a descodificar, e é o único disponível
 *    para um dispositivo que não filmou o vídeo.
 * 2. O que ficou gravado ao lado do ficheiro na captura — funciona sem rede,
 *    que é o caso normal no terreno.
 * 3. Extracção local, e gravação do resultado, para não voltar a acontecer.
 *
 * Descodificar era o único caminho, e repetia-se a cada arranque da aplicação.
 */
export async function resolverPosterDeAnexo(anexoId: string, url: string): Promise<string | null> {
  const { db } = await import('../db/db');

  try {
    const anexo = await db.anexos.get(anexoId);
    if (anexo?.posterUrl) return anexo.posterUrl;

    const guardado = await db.attachments.get(anexoId);
    if (guardado?.poster) return URL.createObjectURL(guardado.poster);
  } catch {
    // Base bloqueada ou registo ausente: extrai-se, que continua a funcionar.
  }

  const extraido = await obterPosterVideo(url);
  if (extraido) {
    await guardarPosterLocal(anexoId, extraido).catch(() => {
      // Guardar é optimização; falhar aqui só custa uma descodificação a mais.
    });
  }
  return extraido;
}

/** Converte o `data:` URL para blob e grava-o ao lado do ficheiro. */
export async function guardarPosterLocal(anexoId: string, dataUrl: string): Promise<void> {
  const { db } = await import('../db/db');
  const blob = await (await fetch(dataUrl)).blob();
  await db.attachments.update(anexoId, { poster: blob });
}
