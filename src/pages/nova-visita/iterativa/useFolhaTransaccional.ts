import { useCallback, useRef, useState } from 'react';
import { useNovaVisitaForm } from '../context';

/**
 * Semântica de «Confirmar» e «Reverter» das folhas da tela (SPEC-10 §7).
 *
 * As folhas hospedam as superfícies que já existem no formulário por passos, e
 * essas escrevem directamente no estado partilhado. Em vez de as reescrever
 * todas para trabalharem sobre uma cópia — o que duplicaria cada passo e faria
 * as duas modalidades divergirem ao primeiro bugfix —, tira-se um instantâneo
 * das fatias que a folha pode tocar no momento em que abre.
 *
 * O que o agente observa é indistinguível de uma cópia de trabalho: a folha
 * cobre o ecrã, e por isso as alterações intermédias nunca chegam a ser vistas
 * por baixo. O que muda é apenas onde a cópia vive.
 *
 * Fechar pelo X, por fora ou pelo botão do Android **reverte** — mas só depois
 * de confirmar, e só quando houve alterações: um diálogo por cima de quem
 * apenas espreitou seria atrito sem motivo.
 */
export interface FolhaTransaccional {
  abrir: () => void;
  confirmar: () => void;
  reverter: () => void;
  /** `true` quando algo mudou desde a abertura. */
  alterada: boolean;
}

type Fatias = ReturnType<typeof fatias>;

/**
 * `apreensaoActiva` não entra: na tela é **derivado** de `apreensaoItens`, que
 * já está aqui. Enquanto foi estado escrito, a folha de apreensão ligava-o ao
 * abrir e nascia marcada como editada — sair dela sem lhe tocar pedia sempre
 * confirmação.
 */
function fatias(ctx: ReturnType<typeof useNovaVisitaForm>) {
  return {
    infracoes: ctx.infracoes,
    anexos: ctx.anexos,
    apreensaoItens: ctx.apreensaoItens,
    apreensaoSemInfracao: ctx.apreensaoSemInfracao,
    apreensaoJustificacao: ctx.apreensaoJustificacao,
    trustee: ctx.trustee,
    recomendacoes: ctx.recomendacoes,
    recomendacoesHistoricas: ctx.recomendacoesHistoricas,
    produtosPrices: ctx.produtosPrices,
    notes: ctx.notes,
  };
}

export function useFolhaTransaccional(): FolhaTransaccional {
  const ctx = useNovaVisitaForm();
  /** Estado de antes de a folha abrir: o que o reverter repõe e o que a
   *  comparação usa para saber se o agente editou alguma coisa. */
  const instantaneo = useRef<Fatias | null>(null);
  const [alterada, setAlterada] = useState(false);

  const actuais = fatias(ctx);
  // Comparação por identidade de referência: todos os `set*` do formulário
  // criam objectos novos, pelo que uma edição troca sempre a referência. Comparar
  // por valor obrigaria a serializar ficheiros de vídeo a cada render.
  if (instantaneo.current) {
    const mudou = (Object.keys(actuais) as (keyof Fatias)[]).some(
      (chave) => actuais[chave] !== instantaneo.current![chave],
    );
    if (mudou !== alterada) setAlterada(mudou);
  }

  const abrir = useCallback(() => {
    instantaneo.current = fatias(ctx);
    setAlterada(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx]);

  const confirmar = useCallback(() => {
    instantaneo.current = null;
    setAlterada(false);
  }, []);

  const reverter = useCallback(() => {
    const anterior = instantaneo.current;
    if (!anterior) return;
    ctx.setInfracoes(anterior.infracoes);
    ctx.setAnexos(anterior.anexos);
    ctx.setApreensaoItens(anterior.apreensaoItens);
    ctx.setApreensaoSemInfracao(anterior.apreensaoSemInfracao);
    ctx.setApreensaoJustificacao(anterior.apreensaoJustificacao);
    ctx.setTrustee(anterior.trustee);
    ctx.setRecomendacoes(anterior.recomendacoes);
    ctx.setRecomendacoesHistoricas(anterior.recomendacoesHistoricas);
    ctx.setProdutosPrices(anterior.produtosPrices);
    ctx.setNotes(anterior.notes);
    instantaneo.current = null;
    setAlterada(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx]);

  return { abrir, confirmar, reverter, alterada };
}
