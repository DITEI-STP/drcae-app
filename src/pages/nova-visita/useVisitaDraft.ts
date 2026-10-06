import { useCallback, useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { db, generateId, type DraftAttachment } from '../../db/db';
import { confirmDialog } from '../../lib/notifications';
import {
  DRAFT_STATE_KEY,
  describeDraft,
  parseDraft,
  serializeDraft,
  type DraftPayload,
  type DraftState,
} from '../../lib/visitaDraftState';
import type { PendingAnexo } from './context';
import { STEP_LABELS } from './stepLabels';
import { discardInspectionDraft } from './discardInspectionDraft';

/**
 * Persistência do rascunho de fiscalização (SPEC-09 R9.5).
 *
 * O Android mata processos em segundo plano sem aviso e isto é trabalho de
 * campo: o que o agente registou tem de sobreviver a uma bateria a acabar no
 * meio de um armazém.
 *
 * Duas cadências, porque os dois lados custam coisas diferentes: o estado de
 * texto grava com um atraso curto, e as provas só quando a lista muda. Gravar
 * ficheiros a cada tecla engasgava a escrita.
 */

interface Args {
  /** Estado corrente do formulário. */
  payload: DraftPayload;
  anexos: PendingAnexo[];
  isSubmitting: boolean;
  /**
   * Aplica ao formulário o rascunho que o agente decidiu recuperar. Recebe as
   * provas já reidratadas em `File`, com a constatação de origem preservada.
   */
  aoRecuperar: (draft: DraftState, anexos: PendingAnexo[]) => void;
}

export interface VisitaDraft {
  /**
   * A pergunta «recuperar ou começar nova» já teve resposta.
   *
   * Trava o autosave: sem isto, o formulário vazio sobrescrevia no primeiro
   * render o rascunho que se estava a perguntar se queria recuperar.
   */
  draftChecked: boolean;
  saveDraft: (anexos: PendingAnexo[]) => Promise<void>;
  clearDraft: () => Promise<void>;
}

async function gravarProvas(anexos: PendingAnexo[]): Promise<void> {
  const registos: DraftAttachment[] = anexos.map((anx, ordem) => ({
    localId: anx.localId,
    name: anx.file.name,
    type: anx.file.type,
    data: anx.file,
    constatacaoId: anx.constatacaoId ?? null,
    ordem,
  }));
  // Substituição em bloco dentro de uma transacção: uma prova removida no
  // formulário tem de desaparecer também aqui, e um `bulkPut` sozinho deixava-a
  // para ressuscitar na recuperação seguinte.
  await db.transaction('rw', db.draftAttachments, async () => {
    await db.draftAttachments.clear();
    if (registos.length > 0) await db.draftAttachments.bulkPut(registos);
  });
}

async function lerProvas(): Promise<PendingAnexo[]> {
  const registos = await db.draftAttachments.orderBy('ordem').toArray();
  return registos.map((registo: DraftAttachment) => {
    const file = new File([registo.data], registo.name, { type: registo.type });
    return {
      localId: registo.localId || generateId(),
      file,
      url: URL.createObjectURL(file),
      // Sem isto as fotografias voltavam sem constatação: o rascunho recuperava
      // as provas e desfazia o agrupamento que lhes dava sentido.
      constatacaoId: registo.constatacaoId ?? null,
    };
  });
}

function descreverPendente(draft: DraftState): string {
  return describeDraft(
    draft,
    (stepKey) => STEP_LABELS[stepKey],
    (data) => `${format(data, 'dd/MM')} às ${format(data, 'HH:mm')}`,
  );
}

export function useVisitaDraft({
  payload,
  anexos,
  isSubmitting,
  aoRecuperar,
}: Args): VisitaDraft {
  const [draftChecked, setDraftChecked] = useState(false);

  // O estado corrente vive num `ref` para o efeito de gravação não ter de o
  // declarar campo a campo nas dependências — a lista cresce a cada campo novo
  // do formulário, e o que fica de fora deixa de ser gravado em silêncio. Foi
  // assim que os itens de apreensão e os preços se perderam.
  const payloadRef = useRef(payload);
  payloadRef.current = payload;

  const aoRecuperarRef = useRef(aoRecuperar);
  aoRecuperarRef.current = aoRecuperar;

  const gravarEstado = useCallback(() => {
    try {
      localStorage.setItem(DRAFT_STATE_KEY, serializeDraft(payloadRef.current));
    } catch {
      // Quota do `localStorage` esgotada por outra coisa qualquer. Não há
      // recurso possível e não há nada a dizer ao agente: o rascunho é uma rede
      // de segurança, e falhar a estendê-la não interrompe o trabalho.
    }
  }, []);

  const saveDraft = useCallback(
    async (currentAnexos: PendingAnexo[]) => {
      gravarEstado();
      await gravarProvas(currentAnexos).catch(() => {});
    },
    [gravarEstado],
  );

  const clearDraft = useCallback(async () => {
    await db.draftAttachments.clear().catch(() => {});
    localStorage.removeItem(DRAFT_STATE_KEY);
  }, []);
  // Rascunho pendente: perguntar **antes** de restaurar.
  //
  // Antes restaurava sozinho e mostrava uma faixa discreta com «Descartar»,
  // fácil de não ver: o agente começava a escrever por cima de dados de uma
  // fiscalização anterior sem reparar. Nada é restaurado nem apagado antes de
  // haver resposta.
  useEffect(() => {
    const draft = parseDraft(localStorage.getItem(DRAFT_STATE_KEY));
    if (!draft) {
      // Inclui o formato posterior e o JSON corrompido. As provas órfãs vão com
      // ele: sem estado que as enquadre, não há fiscalização a que pertençam.
      void clearDraft();
      setDraftChecked(true);
      return;
    }

    let cancelled = false;
    void (async () => {
      const recuperar = await confirmDialog({
        title: 'Rascunho por terminar',
        message: descreverPendente(draft),
        confirmLabel: 'Recuperar',
        cancelLabel: 'Começar nova',
        tone: 'info',
      });
      if (cancelled) return;

      if (!recuperar) {
        await discardInspectionDraft(draft.visitaId ?? null);
        await clearDraft();
        setDraftChecked(true);
        return;
      }

      const provas = await lerProvas().catch(() => [] as PendingAnexo[]);
      if (cancelled) return;
      aoRecuperarRef.current(draft, provas);
      setDraftChecked(true);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Autosave do estado de texto. O atraso curto grava o que se escreveu sem
  // gravar a cada tecla.
  //
  // A dependência é o **conteúdo** e não o objecto: `payload` é montado a cada
  // render, e usá-lo directamente reiniciava o temporizador em qualquer
  // repintura — bastava a posição do agente actualizar-se mais depressa do que
  // um segundo para o rascunho nunca chegar a ser gravado.
  const assinatura = JSON.stringify(payload);
  useEffect(() => {
    if (!draftChecked || isSubmitting) return;
    const timer = setTimeout(gravarEstado, 1000);
    return () => clearTimeout(timer);
  }, [draftChecked, isSubmitting, assinatura, gravarEstado]);

  // Provas: só quando a lista muda.
  useEffect(() => {
    if (!draftChecked || isSubmitting) return;
    void gravarProvas(anexos).catch(() => {});
  }, [draftChecked, isSubmitting, anexos]);

  return { draftChecked, saveDraft, clearDraft };
}
