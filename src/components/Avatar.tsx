import { useEffect, useState } from 'react';
import { cn } from '../lib/utils';
import { urlComVersao } from '../lib/imagemVersionada';
import { db } from '../db/db';

interface Props {
  /** Nome usado para as iniciais — o que se lê quando não há imagem. */
  nome: string;
  url?: string | null;
  versao?: string | null;
  ownerUid?: string | null;
  avatarVersion?: string | null;
  /** Classes do círculo: tamanho, cor de fundo e tipografia das iniciais. */
  className?: string;
  /** Rótulo alternativo às iniciais (ex.: sigla da firma). */
  iniciais?: string;
}

function iniciaisDe(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return `${partes[0][0]}${partes[partes.length - 1][0]}`.toUpperCase();
}

/**
 * Retrato de uma entidade — agente, utilizador com sessão ou firma.
 *
 * As iniciais são desenhadas **sempre**, e a imagem assenta por cima. Não é
 * decoração: no terreno o dispositivo está frequentemente sem rede, e um
 * círculo vazio onde devia estar uma cara não identifica ninguém. Se a imagem
 * falhar a carregar, retira-se e ficam as iniciais que já lá estavam.
 *
 * O URL leva a versão colada (`lib/imagemVersionada.ts`) porque as imagens são
 * substituídas no mesmo caminho — sem isso, a WebView serve a antiga para
 * sempre.
 */
export default function Avatar({ nome, url, versao, ownerUid, avatarVersion, className, iniciais }: Props) {
  const [falhou, setFalhou] = useState(false);
  const [offlineUrl, setOfflineUrl] = useState<string>();

  useEffect(() => {
    let active = true;
    let objectUrl: string | undefined;
    const load = async () => {
      if (!ownerUid) {
        setOfflineUrl(undefined);
        return;
      }
      const cached = await db.avatarFiles.get(ownerUid);
      if (!active) return;
      if (!cached) {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        objectUrl = undefined;
        setOfflineUrl(undefined);
        return;
      }
      // Uma versão anterior é uma degradação útil enquanto o download da nova
      // está pendente. A sincronização substitui o Blob sob o mesmo UID quando
      // conseguir; uma remoção autoritativa apaga o registo por completo.
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      objectUrl = URL.createObjectURL(cached.data);
      setOfflineUrl(objectUrl);
      setFalhou(false);
    };
    void load();
    const refresh = () => void load();
    window.addEventListener('drcae:avatars-updated', refresh);
    return () => {
      active = false;
      window.removeEventListener('drcae:avatars-updated', refresh);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [ownerUid, avatarVersion]);

  const endereco = offlineUrl || urlComVersao(url, versao);

  return (
    <span
      className={cn(
        'relative inline-flex items-center justify-center overflow-hidden rounded-full bg-indigo-600 text-white font-bold',
        className,
      )}
    >
      {iniciais ?? iniciaisDe(nome)}
      {endereco && !falhou && (
        <img
          src={endereco}
          alt=""
          loading="lazy"
          onError={() => setFalhou(true)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
    </span>
  );
}
