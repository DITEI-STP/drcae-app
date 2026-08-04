/**
 * URL de imagem com a versão colada.
 *
 * As imagens das entidades — avatar do agente, logótipo da firma — são
 * substituídas **no mesmo caminho** quando alguém as troca no `drcae-admin`. A
 * WebView do Android guarda imagens em cache agressivamente e, sem nada que
 * mude no URL, continua a servir a antiga indefinidamente: era este o motivo
 * de os avatares novos nunca aparecerem no terreno.
 *
 * A versão vem do servidor (`uid` do anexo + data de actualização da entidade)
 * e muda **apenas** quando a imagem muda — o que força um pedido novo sem
 * desligar a cache para todas as outras.
 */
export function urlComVersao(
  url?: string | null,
  versao?: string | null,
): string {
  const endereco = (url ?? '').trim();
  if (!endereco) return '';
  const marca = (versao ?? '').trim();
  if (!marca) return endereco;
  const separador = endereco.includes('?') ? '&' : '?';
  return `${endereco}${separador}v=${encodeURIComponent(marca)}`;
}
