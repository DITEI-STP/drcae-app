import { db, type Anexo } from '../db/db';
import * as api from './api';
import { addAppLog } from './appLogs';

// String.fromCharCode(...array) falha com arrays > ~65k elementos.
// Esta versão itera em chunks para suportar ficheiros de qualquer tamanho.
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const CHUNK = 8192;
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + CHUNK));
  }
  return btoa(binary);
}

async function legacyAnexoDataToBase64(anexo: Anexo): Promise<string> {
  if (typeof anexo.data === 'string' && anexo.data.trim()) return anexo.data;
  if (anexo.data instanceof ArrayBuffer) return arrayBufferToBase64(anexo.data);
  if (anexo.data instanceof Blob) return arrayBufferToBase64(await anexo.data.arrayBuffer());
  throw new Error('Anexo sem dados locais válidos.');
}

export async function ensureAnexoUploadReference(anexo: Anexo): Promise<Anexo> {
  if (anexo.file_ref) return anexo;
  if (anexo.id) {
    const attachment = await db.attachments.get(anexo.id);
    if (attachment?.data) {
      const upload = await api.uploadSyncAttachment({
        id: anexo.id,
        visitaId: anexo.visitaId,
        fileName: anexo.fileName,
        fileType: anexo.fileType || 'application/octet-stream',
        blob: attachment.data,
      });
      // O fotograma segue com o anexo, uma vez. Falhar aqui não pode impedir
      // a prova de subir: perde-se a miniatura, que é conveniência, não a
      // prova, que é o documento.
      let posterFields: { poster_ref?: string; posterUrl?: string } = {};
      if (attachment.poster) {
        try {
          const enviado = await api.uploadSyncAttachmentPoster({
            id: anexo.id,
            visitaId: anexo.visitaId,
            blob: attachment.poster,
          });
          posterFields = { poster_ref: enviado.file_ref, posterUrl: enviado.url };
        } catch (err) {
          addAppLog('warn', 'sync', `Fotograma do anexo ${anexo.id} não foi enviado`, err);
        }
      }

      const updates = {
        file_ref: upload.file_ref,
        uploadSize: upload.size,
        url: upload.url || anexo.url,
        data: '',
        ...posterFields,
      };
      await db.anexos.update(anexo.id, updates);
      return { ...anexo, ...updates };
    }
  }

  return {
    ...anexo,
    data: await legacyAnexoDataToBase64(anexo),
  };
}

