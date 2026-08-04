import React, { createContext, useContext } from 'react';
import type {
  AtividadeEconomica,
  Firma,
  RecomendacaoHistorica,
  Representante,
  Tecnico,
  TrusteeKind,
} from '../../db/db';
import type { MotivoApreensao } from '../../lib/apreensaoValidacao';
import type { InfractionCatalogItem } from '../../lib/infractionCatalog';
import type { RecomendacaoEmitida } from '../../lib/recomendacoes';
import type { SupplyProduct } from '../../lib/supplyCache';
import type { MapProvider } from '../../components/map/MapLayerSwitcher';
import type { EvidenciaSeleccionada } from '../../components/EvidenciaPreview';
import type { ModalidadeFiscalizacao } from '../../lib/inspectionModality';

/**
 * Prova capturada mas ainda não persistida na fiscalização.
 *
 * Vive no estado do formulário; a cópia durável do rascunho está em
 * `db.draftAttachments`. Já teve um campo `draftData` com o ficheiro em base64
 * — resto do tempo em que o rascunho cabia no `localStorage`.
 */
export interface PendingAnexo {
  localId: string;
  file: File;
  url: string;
  /** Constatação a partir da qual foi capturada (SPEC-10). */
  constatacaoId?: string | null;
}

/** Item de apreensão em edição — quantidade como texto até ser submetida. */
export interface ItemApreensaoForm {
  /** Constatação a partir da qual foi apreendido (SPEC-10). */
  constatacaoId?: string | null;
  assetSupply: number | null;
  designation: string;
  quantity: string;
  assetUnit: number | null;
  /**
   * Destino do que foi apreendido. `null` = por definir: na modalidade
   * iterativa o formulário do produto regista quantidade e unidade, e o destino
   * fecha-se na tarefa própria da tela (`lib/destinoApreensao.ts`). No
   * formulário por passos é escolhido no acto e nunca chega a ser nulo.
   */
  custody: 'drcae' | 'trustee' | null;
  note: string;
}

/**
 * Fiel depositário do auto.
 *
 * `kind = 'operator'` é o caso corrente e não pede nada: a guarda é da firma
 * fiscalizada, que o auto já identifica. Os restantes campos só são lidos com
 * `kind = 'person'` — o depositário terceiro, que tem de ser identificado por
 * documento porque não está registado em lado nenhum.
 */
export interface TrusteeForm {
  kind: TrusteeKind;
  name: string;
  docType: string;
  docNumber: string;
  role: string;
  contact: string;
}

/** Firma da lista de selecção, já com a distância ao agente calculada. */
export interface FirmaProxima {
  firma: Firma;
  distanceKm: number | null;
  hasCoordinates: boolean;
}

export interface InfracaoSelecionada {
  /** Constatação a partir da qual foi levantada (SPEC-10). */
  constatacaoId?: string | null;
  type: string;
  severity: string;
  severityLevel: number | null;
  minimum_penalty: number | null;
  maximum_penalty: number | null;
}

export interface HistoricoVisita {
  id: string;
  date: string;
  technicians: string[];
  recomendacoes: string[];
}

export interface RecomendacaoAgrupada {
  text: string;
  origins: { visitaId: string; date: string; technicians: string[] }[];
}

export type PrecoPorProduto = Record<
  number,
  {
    gross: string;
    retail: string;
    grossEval?: 'conforme' | 'nao_conforme';
    retailEval?: 'conforme' | 'nao_conforme';
    /**
     * Constatação que levantou este preço, **fixada na criação e nunca
     * reatribuída** (SPEC-10 §5). Ausente = levantado na check list da cesta
     * básica, e nesse caso não pertence a constatação nenhuma.
     *
     * O valor é único por produto: editar na check list ou dentro da
     * constatação edita o mesmo preço, e é isso que faz uma correcção na check
     * list reflectir-se na constatação que o levantou — sem nunca o derramar
     * para as outras.
     */
    constatacaoId?: string | null;
  }
>;

/**
 * Estado e acções do formulário de nova fiscalização.
 *
 * O estado vive todo no componente-pai (`NovaVisita.tsx`) e chega aos passos
 * por contexto, não por props. Foi a alternativa a enfiar ~40 props por sete
 * componentes: a lista de props seria maior que os próprios passos, e cada
 * passo novo — como o de Apreensão — obrigaria a mexer na assinatura de todos.
 *
 * Não é estado global: o provider é o formulário, e morre com ele.
 */
export interface NovaVisitaFormContext {
  // Operador e actividade
  firmas: Firma[] | undefined;
  filteredFirmas: FirmaProxima[];
  firmaId: string;
  setFirmaId: (id: string) => void;
  search: string;
  handleSearchChange: (value: string) => void;
  handleFirmsScroll: (e: React.UIEvent<HTMLDivElement>) => void;
  representante: Representante;
  setRepresentante: (value: Representante) => void;
  atividadeEconomica: string;
  setAtividadeEconomica: (value: string) => void;
  showAddAtividade: boolean;
  setShowAddAtividade: (value: boolean) => void;
  newAtivRamo: string;
  setNewAtivRamo: (value: string) => void;
  newAtivAtividade: string;
  setNewAtivAtividade: (value: string) => void;
  newAtivLocal: string;
  setNewAtivLocal: (value: string) => void;
  isSavingAtividade: boolean;
  handleSaveNewAtividade: () => Promise<void>;

  // Equipa e momento
  date: string;
  setDate: (value: string) => void;
  time: string;
  setTime: (value: string) => void;
  technicians: Tecnico[];
  setTechnicians: React.Dispatch<React.SetStateAction<Tecnico[]>>;

  // Infracções
  predefinedInfracoes: InfractionCatalogItem[];
  infracoes: InfracaoSelecionada[];
  /** Reposição em bloco — usada pelo reverter das folhas (SPEC-10 §7). */
  setInfracoes: React.Dispatch<React.SetStateAction<InfracaoSelecionada[]>>;
  toggleInfracao: (item: InfractionCatalogItem) => void;
  removeInfracao: (type: string) => void;
  searchInfracao: string;
  setSearchInfracao: (value: string) => void;
  infracaoCountByType: Map<string, number>;
  selectedInfraction: InfractionCatalogItem | null;
  setSelectedInfraction: (item: InfractionCatalogItem | null) => void;
  handleOpenHistoricInspection: (visitaId: string) => Promise<void>;

  // Recomendações
  predefinedRecomendacoes: string[];
  recomendacoes: RecomendacaoEmitida[];
  setRecomendacoes: React.Dispatch<React.SetStateAction<RecomendacaoEmitida[]>>;
  customRecommendation: string;
  setCustomRecommendation: React.Dispatch<React.SetStateAction<string>>;
  recomendacoesHistoricas: RecomendacaoHistorica[];
  setRecomendacoesHistoricas: React.Dispatch<React.SetStateAction<RecomendacaoHistorica[]>>;
  groupedHistoricoRecomendacoes: RecomendacaoAgrupada[];
  historicoVisitas: HistoricoVisita[];

  // Provas
  anexos: PendingAnexo[];
  /** Reposição em bloco — usada pelo reverter das folhas (SPEC-10 §7). */
  setAnexos: React.Dispatch<React.SetStateAction<PendingAnexo[]>>;
  queueAnexos: (files: File[]) => void;
  removeAnexo: (index: number) => void;
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  showCamera: boolean;
  setShowCamera: (value: boolean) => void;
  cameraMode: 'photo' | 'video';
  setCameraMode: (value: 'photo' | 'video') => void;
  /**
   * Prova a visualizar. Era só a URL, o que impedia o visualizador de saber se
   * havia de desenhar `<img>` ou `<video>` — e um vídeo saía como imagem
   * partida.
   */
  selectedPreview: EvidenciaSeleccionada | null;
  setSelectedPreview: (value: EvidenciaSeleccionada | null) => void;
  notes: string;
  setNotes: React.Dispatch<React.SetStateAction<string>>;

  // Cesta básica
  supplyProducts: SupplyProduct[];
  supplyStatus: 'idle' | 'loading' | 'active' | 'none';
  supplyCachedAt: number | null;
  produtosPrices: PrecoPorProduto;
  setProdutosPrices: React.Dispatch<React.SetStateAction<PrecoPorProduto>>;

  // Localização
  location: { lat: number; lng: number } | null;
  refreshGeo: () => void;
  mapProvider: MapProvider;
  setMapProvider: (value: MapProvider) => void;

  // Apreensão
  apreensaoActiva: boolean;
  setApreensaoActiva: (value: boolean) => void;
  apreensaoSemInfracao: boolean;
  setApreensaoSemInfracao: (value: boolean) => void;
  apreensaoJustificacao: string;
  setApreensaoJustificacao: (value: string) => void;
  apreensaoItens: ItemApreensaoForm[];
  setApreensaoItens: React.Dispatch<React.SetStateAction<ItemApreensaoForm[]>>;
  trustee: TrusteeForm;
  setTrustee: (value: TrusteeForm) => void;
  /** O que falta para o auto poder avançar — ver `lib/apreensaoValidacao.ts`. */
  motivosApreensao: MotivoApreensao[];

  // Modalidade de trabalho (SPEC-10)
  modalidade: ModalidadeFiscalizacao;
  /**
   * Id da fiscalização em curso. Na modalidade iterativa existe desde o fim do
   * passo da equipa, porque é a ele que se penduram as constatações escritas no
   * Dexie à medida; no formulário por passos é `null` até à submissão.
   */
  visitaId: string | null;
  /**
   * Constatação em aberto, à qual pertence tudo o que o agente registar a
   * seguir. É a posição do botão que ele tocou que a determina — nunca lhe é
   * pedido que decida a que constatação pertence o que acabou de fazer.
   *
   * `null` no formulário por passos, onde não há agrupamento.
   */
  constatacaoActivaId: string | null;
  setConstatacaoActivaId: (id: string | null) => void;
  /** Domínios vazios que o agente já reconheceu na revisão — SPEC-10 §7. */
  coberturaReconhecida: string[];
  setCoberturaReconhecida: React.Dispatch<React.SetStateAction<string[]>>;

  // Navegação e submissão
  atividadesDaFirma: AtividadeEconomica[];
  isSubmitting: boolean;
  navigate: (to: string, options?: { state?: unknown; replace?: boolean }) => void;
  /** Grava o rascunho antes de sair do formulário — ver SPEC-09 R9.5. */
  saveDraft: (anexos: PendingAnexo[]) => Promise<void>;
  setSearch: (value: string) => void;
  visibleFirmsCount: number;
  setVisibleFirmsCount: React.Dispatch<React.SetStateAction<number>>;
}

const NovaVisitaContext = createContext<NovaVisitaFormContext | null>(null);

export const NovaVisitaProvider = NovaVisitaContext.Provider;

export function useNovaVisitaForm(): NovaVisitaFormContext {
  const ctx = useContext(NovaVisitaContext);
  if (!ctx) {
    throw new Error(
      'useNovaVisitaForm tem de ser usado dentro do formulário de nova fiscalização.',
    );
  }
  return ctx;
}
