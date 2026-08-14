import Dexie, { type Table } from 'dexie';
import { encryptRecord, decryptRecord, getActiveKey, type AppCryptoKey } from '../lib/crypto';
import { rekeyEncryptedTables, type RekeyTarget } from './rekey';

export interface AtividadeEconomica {
  id?: string;
  ramo: string;
  /** `asset.id` do ramo (grupo `branch`). Ver nota em `Firma`. */
  assetBranch?: number | null;
  atividade: string;
  local: string;
  geolocation?: { lat: number; lng: number } | null;
}

export interface Firma {
  id?: string;
  /** Logótipo resolvido pelo servidor — ver `resolveAvatar` no `pull`. */
  logo?: string;
  /** Versão do logótipo, para a cache do dispositivo saber que ele mudou. */
  logoVersion?: string;
  nif: string;
  name: string;
  district: string;
  address: string;
  contact: string;
  email: string;
  type: string; // Importador, Revendedor, Informal
  constituicao?: string;
  emissoraLicenca?: string;
  numLicenca?: string;
  numAlvara?: string;
  representant: string;
  representantCargo?: string;
  representantNacionalidade?: string;

  // `asset.id` das escolhas feitas nos catálogos sincronizados. Viajam no push
  // ao lado do nome correspondente, que se mantém por legibilidade e como
  // fallback para bundles antigos.
  //
  // Sem eles, o backend resolvia a ligação comparando texto — e sem sequer
  // limitar a procura ao grupo certo, pelo que um homónimo noutro grupo ligava
  // ao asset errado e uma renomeação na área administrativa desligava os
  // registos seguintes em silêncio.
  assetDistrict?: number | null;
  assetNationality?: number | null;
  assetToperator?: number | null;
  assetConstitution?: number | null;
  assetIssuer?: number | null;
  atividades?: AtividadeEconomica[];
  synced?: boolean;
  geolocation?: { lat: number; lng: number } | null;
  createdAt?: number;
}

export interface RecomendacaoHistorica {
  text: string;
  visitaOrigemId: string;
  dataOrigem: string;
  equipaOrigem: string[];
  atendida?: boolean | null;
}

/**
 * Representante do operador presente no acto.
 *
 * Deixou de ser texto livre: sem tipo e número de documento não há forma de
 * identificar inequivocamente quem prestou declarações numa acta com força
 * probatória. `uid` só existe quando veio de um representante já conhecido.
 */
export interface Representante {
  uid?: string;
  name: string;
  /** `code` do asset sob `parent.code = 'tdocument'` (bi, nif, passport, …). */
  docType: string;
  docNumber: string;
  role?: string;
}

/**
 * Agente da equipa de fiscalização, sempre com identificador.
 *
 * Era um array de nomes: um agente escrito à mão não tem `uid`, não é
 * rastreável, e «Joao Silva» e «João da Silva» eram duas pessoas para o
 * sistema — o que corroía a estatística por agente e a força probatória.
 */
export interface Tecnico {
  uid: string;
  name: string;
  number?: string;
}

/** Ficha de representante conhecido de uma firma, sincronizada do servidor. */
export interface RepresentanteFirma {
  id?: string;
  firmaId: string;
  name: string;
  docType: string;
  docTypeName?: string;
  docNumber: string;
  role?: string;
  lastSeenAt?: string | null;
  synced?: boolean;
}

/** Destino do produto apreendido. */
export type Custody = 'drcae' | 'trustee';

/**
 * Quem assume a guarda do que fica em depósito.
 *
 * `operator` é o caso corrente na DRCAE: a guarda fica com a própria firma
 * fiscalizada, que o auto já identifica — não há nada a escrever no acto.
 * `person` é a excepção, e só nela se pede identificação.
 */
export type TrusteeKind = 'operator' | 'person';

/**
 * Auto de apreensão lavrado no acto da fiscalização.
 *
 * `settlementStatus` é derivado no servidor a partir dos itens, das recolhas
 * activas e dos actos de tratamento — o app apresenta-o, não o calcula.
 *
 * `released` é o depósito extinto por **devolução**, sem recolha nenhuma: a
 * DRCAE devolveu a mercadoria ao operador sem a ir buscar. Reconhecê-lo é o
 * que impede mandar um agente recolher o que já foi devolvido — e lavrar uma
 * quebra de depósito contra quem cumpriu.
 */
export interface Apreensao {
  id?: string;
  visitaId: string;
  /** Constatação que a agrupa (SPEC-10). Nulo no stepper — ver `Constatacao`. */
  constatacaoId?: string | null;
  firmaId: string;
  firmaName?: string;
  offlineCode?: string;
  officialCode?: string;
  seizedAt: string;
  custody: Custody | 'mixed';
  settlementStatus:
    | 'not-applicable'
    | 'pending'
    | 'partial'
    | 'settled'
    | 'released'
    | 'breached';
  trusteeKind?: TrusteeKind;
  /**
   * Com `trusteeKind = 'operator'`, `trusteeName` é apenas quem assinou o auto
   * em nome da firma. Com `'person'`, nome e documento são obrigatórios — sem
   * eles não há a quem exigir a devolução.
   */
  trusteeName?: string;
  /** `code` do asset sob `parent.code = 'tdocument'`. */
  trusteeDocType?: string;
  trusteeDocNumber?: string;
  trusteeNif?: string;
  trusteeRole?: string;
  trusteeContact?: string;
  note?: string;
  geolocation?: { lat: number; lng: number } | null;
  synced?: boolean;
  createdAt?: number;
}

export interface ApreensaoItem {
  id?: string;
  apreensaoId: string;
  /** `asset` sob `parent.code = 'supply'`; ausente em produto não catalogado. */
  assetSupply?: number | null;
  designation: string;
  quantity: number;
  /** `asset` sob `parent.code = 'unit'`. Lista fechada, para a recolha poder comparar. */
  assetUnit?: number | null;
  custody: Custody;
  /** Acumulado recolhido — recalculado pelo servidor, nunca incrementado aqui. */
  collectedQuantity?: number;
  estimatedValue?: number | null;
  note?: string;
  synced?: boolean;
}

/** Recolha posterior do que ficou em fiel depósito. Não é uma fiscalização. */
export interface Recolha {
  id?: string;
  apreensaoId: string;
  offlineCode?: string;
  officialCode?: string;
  collectedAt: string;
  trusteePresent?: boolean;
  trusteeName?: string;
  /**
   * Quem entregou os produtos quando o depositário não compareceu.
   *
   * Obrigatório nesse caso: a quebra de depósito é imputada ao depositário, e
   * declará-la a partir de um acto onde ninguém foi identificado é uma
   * acusação sem testemunha.
   */
  handoverName?: string;
  handoverDocType?: string;
  handoverDocNumber?: string;
  outcome?: 'complete' | 'partial' | 'not-found';
  note?: string;
  geolocation?: { lat: number; lng: number } | null;
  synced?: boolean;
}

export interface RecolhaItem {
  id?: string;
  recolhaId: string;
  apreensaoItemId: string;
  expectedQuantity: number;
  collectedQuantity: number;
  /** Derivada no servidor a partir das quantidades — nunca introduzida à mão. */
  divergence?: 'match' | 'shortage' | 'surplus' | 'not-found';
  divergenceReason?: string;
  synced?: boolean;
}

/** Agente do catálogo oficial, cadastrado no `drcae-admin`. */
export interface Agente {
  uid: string;
  name: string;
  nif?: string;
  number?: string;
  contact?: string;
  district?: string;
  category?: string;
  /** Fotografia resolvida pelo servidor — o URL depende do armazenamento em uso. */
  photoUrl?: string;
  /**
   * Versão da fotografia, para a cache do dispositivo saber que ela mudou.
   *
   * Um avatar regenerado costuma manter o mesmo caminho: sem esta marca, a
   * WebView continuava a mostrar a imagem antiga indefinidamente.
   */
  photoVersion?: string;
  avatarOwnerUid?: string;
  avatarUid?: string;
  avatarVersion?: string;
  avatarDownloadUrl?: string;
}

export interface UtilizadorInterno {
  uid: string;
  name: string;
  role: string;
  status: number;
  isOfficer: boolean;
  avatarOwnerUid: string;
  avatarUid?: string;
  avatarVersion?: string;
  avatarDownloadUrl?: string;
}

export interface AvatarFile {
  ownerUid: string;
  avatarUid: string;
  version: string;
  data: Blob;
  mimetype: string;
  updatedAt: number;
}

export interface Visita {
  id?: string;
  firmaId: string;
  firmaName?: string;
  /** String em registos anteriores à SPEC-08 — ver `normalizeRepresentante`. */
  representante: Representante | string;
  date: string;
  time: string;
  /** Array de nomes em registos anteriores à SPEC-07 — ver `normalizeTecnicos`. */
  technicians: Tecnico[] | string[];
  status: string; // 'Infrações', 'Inconformes', 'Recomendações', 'Regularizado'
  notes?: string;
  atividadeEconomica?: string;
  geolocation?: { lat: number; lng: number } | null;
  synced?: boolean;
  recomendacoes?: string[];
  recomendacoesHistoricas?: RecomendacaoHistorica[];
  produtos?: ProdutoPreco[];
  createdAt?: number;
  locationAutoCaptured?: boolean;
  // Código chassi gerado localmente antes do sync (ex: F26001000017X83)
  offlineCode?: string;
  // Código oficial (matrícula) atribuído pelo servidor após sync (ex: FN-26000001)
  officialCode?: string;
  // Determinado no momento do sync: 'confirmada' se sincronizado em ≤ 5 min, 'pendente' caso contrário
  confirmationStatus?: 'confirmada' | 'pendente';

  /**
   * Estado do registo (SPEC-10). A modalidade iterativa escreve no Dexie à
   * medida que o agente trabalha, pelo que passam a existir visitas que ainda
   * não são fiscalizações — não podem aparecer em listagens, ir para o push
   * nem contar para o risco.
   *
   * É `string` e não booleano de propósito: o IndexedDB não indexa booleanos
   * nem `undefined`, e sem índice a exclusão de rascunhos teria de percorrer a
   * tabela toda. Registos anteriores à SPEC-10 não têm o campo — o que ficou
   * ausente é tratado como submetido, e por isso as consultas procuram
   * `'draft'` em vez de excluir `'submitted'`.
   */
  draftState?: 'draft' | 'submitted';

  /** Modalidade de trabalho usada (SPEC-10 §9). Ausente = stepper legado. */
  modalidade?: ModalidadeFiscalizacao;
  /** Métricas de sessão — ver `SessaoFiscalizacao`. */
  sessao?: SessaoFiscalizacao;
  /** Contagens por domínio e domínios reconhecidos como vazios. */
  cobertura?: CoberturaFiscalizacao;
  /** Denúncia que originou a fiscalização, quando a visita veio da triagem. */
  complaintUid?: string | null;
  complaintVerification?: ComplaintVerification | null;
}

export type ComplaintFieldOutcome =
  | 'confirmed'
  | 'not-confirmed'
  | 'inconclusive';

export interface ComplaintVerification {
  outcome: ComplaintFieldOutcome;
  note: string;
}

export interface DenunciaCampo {
  uid: string;
  code: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  category: string;
  categoryIcon?: { kind: 'lucide' | 'svg' | 'image'; value: string } | null;
  description: string;
  occurredAt?: string | null;
  createdAt: string;
  releasedAt: string;
  targetName?: string | null;
  targetReference?: string | null;
  targetGeo?: { lat: number; lng: number } | null;
  operatorId?: string | null;
  operatorName?: string | null;
  operatorGeo?: { lat: number; lng: number } | null;
  district?: string | null;
  fieldOutcome?: ComplaintFieldOutcome | null;
  fieldNote?: string | null;
  attachments: Array<{
    uid: string;
    name: string;
    mimetype: string;
    url: string;
  }>;
}

export type ModalidadeFiscalizacao = 'stepper' | 'iterativa';

/**
 * Medição da sessão de registo (SPEC-10 §9), gravada nas **duas** modalidades.
 *
 * Sem termo de comparação, os dados da modalidade nova não dizem nada: a
 * iterativa apareceria sempre mais rápida, sem se saber se é por ser melhor ou
 * por o agente ter registado metade.
 */
export interface SessaoFiscalizacao {
  abertaEm: string;
  concluidaEm: string;
  duracaoSegundos: number;
}

export interface CoberturaFiscalizacao {
  constatacoes: number;
  infracoes: number;
  provas: number;
  produtosVerificados: number;
  apreensoes: number;
  recomendacoes: number;
  recomendacoesPendentesRespondidas: number;
  /** Domínios que o agente reconheceu vazios na revisão — ver SPEC-10 §7. */
  dominiosVazios: string[];
}

/**
 * Constatação — agrupamento do que o agente encontrou num só ponto e num só
 * momento (SPEC-10).
 *
 * **Agrupa, não contém.** As infracções, provas, apreensões e preços continuam
 * a ser gravados como sempre foram e apenas ganham `constatacaoId`. É isso que
 * deixa o push, o cálculo de estado e todos os ecrãs do admin a funcionar sem
 * alteração de leitura, e o stepper — que deixa a referência a nulo — intacto.
 */
export interface Constatacao {
  id?: string;
  visitaId: string;
  /** Ordem de registo no terreno. Não é reordenável: é a sequência real. */
  ordem: number;
  descricao?: string;
  /** Ponto onde foi registada; pode diferir do ponto da fiscalização. */
  geolocation?: { lat: number; lng: number } | null;
  origem?: 'agente' | 'preco' | 'recomendacao-pendente';
  createdAt: number;
  closedAt?: number;
  synced?: boolean;
}

export interface Infracao {
  id?: string;
  visitaId: string;
  /** Constatação que a agrupa (SPEC-10). Nulo no stepper — ver `Constatacao`. */
  constatacaoId?: string | null;
  type: string;
  /** Rótulo do grupo `gravity` («Infração Grave»); escala antiga em registos históricos. */
  severity: string;
  /** 1..n do grupo `gravity`. Ausente em registos anteriores à onda 2. */
  severityLevel?: number | null;
  minimum_penalty?: number | null;
  maximum_penalty?: number | null;
  synced?: boolean;
}

export interface ProdutoPreco {
  product_id: number;
  name: string;
  grossPrice?: number | null;  // preço do livro (null quando o operador não tem livro em vigor)
  retailPrice?: number | null; // preço do livro (null quando o operador não tem livro em vigor)
  gross?: string;              // preço informado pelo agente
  retail?: string;             // preço informado pelo agente
  // Modo manual (operador sem livro em vigor): o agente classifica cada
  // preço preenchido como conforme/não conforme, já que não há preço de
  // referência para comparação automática.
  grossEval?: 'conforme' | 'nao_conforme' | null;
  retailEval?: 'conforme' | 'nao_conforme' | null;
  visitaId?: string;
  /** Constatação que o agrupa (SPEC-10). Nulo no stepper — ver `Constatacao`. */
  constatacaoId?: string | null;
}

export interface Anexo {
  id?: string;
  visitaId: string;
  /**
   * URL do fotograma de pré-visualização, no armazenamento do servidor.
   *
   * Extraído uma vez no dispositivo que capturou o vídeo e enviado com o
   * anexo. Um segundo dispositivo — ou o admin — mostra a miniatura sem ter de
   * descarregar o vídeo inteiro só para lhe tirar um fotograma.
   */
  posterUrl?: string;
  /** `attach.uid` do fotograma no servidor, enviado no push com o anexo. */
  poster_ref?: string;
  /** Constatação que o agrupa (SPEC-10). Nulo no stepper — ver `Constatacao`. */
  constatacaoId?: string | null;
  fileName: string;
  fileType: string;
  data: ArrayBuffer | Blob | string; // Legado/base64 pequeno; ficheiros novos ficam em attachments.
  notes: string;
  synced?: boolean;
  url?: string; // URL pública do servidor (preenchida após pull sync)
  file_ref?: string;
  uploadSize?: number;
}

export interface Attachment {
  id: string;
  visitaId: string;
  data: Blob;
  /**
   * Fotograma extraído localmente, guardado ao lado do ficheiro.
   *
   * É o que faz a miniatura sobreviver a fechar a aplicação: sem isto, cada
   * arranque voltava a descodificar todos os vídeos da fiscalização — e no
   * terreno, sem rede, a cópia do servidor não está disponível.
   */
  poster?: Blob;
  synced?: boolean;
}

/**
 * Prova capturada e ainda por submeter, guardada com o rascunho.
 *
 * Store **separada** de `attachments`, e não uma marca dentro dela: aquela é
 * lida pelo push, e pôr lá dentro ficheiros de uma fiscalização que ainda não
 * existe seria criar um caminho para os enviar. Duas tabelas com finalidades
 * diferentes valem mais do que uma tabela com duas regras de filtragem que têm
 * de concordar.
 *
 * O ficheiro é guardado como `Blob` e não em base64: a codificação inflava-o
 * 33% e o destino era o `localStorage`, cuja quota na WebView (~5 MB) o
 * estouro de seis fotografias já ultrapassa — o `setItem` lançava e o rascunho
 * gravava-se sem anexos nenhuns, em silêncio.
 */
export interface DraftAttachment {
  localId: string;
  name: string;
  type: string;
  data: Blob;
  /** Constatação de onde foi capturada — perdê-la desagrupava as provas. */
  constatacaoId?: string | null;
  /** Ordem de captura, para o rascunho reabrir com as provas como estavam. */
  ordem: number;
}

export interface SyncOperation {
  id?: number;
  entity: 'firma' | 'visita' | 'infracao' | 'anexo';
  action: 'create' | 'update' | 'delete';
  entityId: string;
  payload: any;
  timestamp: number;
}

export interface MetadataRecord {
  key: string;
  value?: any;
  ciphertext?: string;
}

// ----------------------------------------
// Wrapper Criptográfico para Dexie
// ----------------------------------------

class EncryptedCollection {
  constructor(
    private collection: any,
    private decryptFn: (r: any) => Promise<any>
  ) {}

  async toArray() {
    const records = await this.collection.toArray();
    return Promise.all(records.map(this.decryptFn));
  }

  async modify(changes: any) {
    return this.collection.modify(changes);
  }

  async count() {
    return this.collection.count();
  }

  /**
   * Chaves primárias da selecção, **sem decifrar**.
   *
   * Só é correcto sobre índices em claro — que são todos, porque um índice
   * sobre campo cifrado não existiria. Evita decifrar a tabela inteira quando o
   * que se quer é uma lista de ids.
   */
  async primaryKeys() {
    return this.collection.primaryKeys();
  }

  /**
   * Filtra sobre os registos **decifrados**, ao contrário de `EncryptedTable.filter`,
   * que corre sobre os registos em bruto. É esta a diferença que faz um filtro
   * por campo sensível funcionar aqui e devolver vazio lá.
   */
  async filter(fn: (record: any) => boolean) {
    const records = await this.toArray();
    return records.filter(fn);
  }

  async first() {
    const records = await this.toArray();
    return records[0];
  }
}

class EncryptedWhereClause {
  constructor(
    private whereClause: any,
    private decryptFn: (r: any) => Promise<any>
  ) {}

  equals(value: any) {
    return new EncryptedCollection(this.whereClause.equals(value), this.decryptFn);
  }

  anyOf(values: any[]) {
    return new EncryptedCollection(this.whereClause.anyOf(values), this.decryptFn);
  }
}

// Notificado após qualquer escrita, para invalidar caches derivadas destas
// tabelas (ver lib/operadoresCache). Registado aqui, num único ponto, em vez de
// em cada local de escrita — assim nenhuma escrita futura pode esquecer-se de o
// fazer.
type WriteListener = () => void;
const writeListeners = new Set<WriteListener>();

export function onDatabaseWrite(listener: WriteListener): () => void {
  writeListeners.add(listener);
  return () => writeListeners.delete(listener);
}

function notifyWrite() {
  writeListeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // Um consumidor a falhar não pode impedir os restantes nem a escrita.
    }
  });
}

class EncryptedTable {
  constructor(
    private table: any,
    private sensitiveFields: string[]
  ) {}

  private async encrypt(obj: any, key: AppCryptoKey) {
    const copy = { ...obj };
    const sensitiveData: any = {};
    
    for (const f of this.sensitiveFields) {
      if (f in copy) {
        sensitiveData[f] = copy[f];
        delete copy[f];
      }
    }

    const ciphertext = await encryptRecord(sensitiveData, key);
    copy.ciphertext = ciphertext;
    return copy;
  }

  private async decrypt(obj: any, key: AppCryptoKey) {
    if (!obj || !obj.ciphertext) return obj;
    try {
      const decrypted = await decryptRecord(obj.ciphertext, key);
      const copy = { ...obj };
      delete copy.ciphertext;
      return { ...copy, ...decrypted };
    } catch (err) {
      console.error('Falha ao desencriptar registro:', err);
      return obj; // retorna encriptado em caso de falha
    }
  }

  async add(obj: any) {
    const key = getActiveKey();
    if (!key) throw new Error('Base de dados bloqueada.');
    const encrypted = await this.encrypt(obj, key);
    const result = await this.table.add(encrypted);
    notifyWrite();
    return result;
  }

  async put(obj: any) {
    const key = getActiveKey();
    if (!key) throw new Error('Base de dados bloqueada.');
    const encrypted = await this.encrypt(obj, key);
    const result = await this.table.put(encrypted);
    notifyWrite();
    return result;
  }

  async bulkAdd(arr: any[]) {
    const key = getActiveKey();
    if (!key) throw new Error('Base de dados bloqueada.');
    const encryptedArr = await Promise.all(arr.map(obj => this.encrypt(obj, key)));
    const result = await this.table.bulkAdd(encryptedArr);
    notifyWrite();
    return result;
  }

  async bulkPut(arr: any[]) {
    const key = getActiveKey();
    if (!key) throw new Error('Base de dados bloqueada.');
    const encryptedArr = await Promise.all(arr.map(obj => this.encrypt(obj, key)));
    const result = await this.table.bulkPut(encryptedArr);
    notifyWrite();
    return result;
  }

  async bulkDelete(keys: any[]) {
    const result = await this.table.bulkDelete(keys);
    notifyWrite();
    return result;
  }

  async delete(key: any) {
    const result = await this.table.delete(key);
    notifyWrite();
    return result;
  }

  async clear() {
    const result = await this.table.clear();
    notifyWrite();
    return result;
  }

  async get(id: any) {
    const res = await this.table.get(id);
    if (!res) return res;
    const key = getActiveKey();
    if (!key) return res;
    return this.decrypt(res, key);
  }

  async toArray() {
    const records = await this.table.toArray();
    const key = getActiveKey();
    if (!key) return records;
    return Promise.all(records.map(r => this.decrypt(r, key)));
  }

  async count() {
    return this.table.count();
  }

  async update(id: any, mods: any) {
    const key = getActiveKey();
    if (!key) throw new Error('Base de dados bloqueada.');

    // Obter o registro completo, mesclar modificações e re-encriptar
    const current = await this.get(id);
    if (!current) throw new Error('Registro não encontrado.');

    const merged = { ...current, ...mods };
    const encrypted = await this.encrypt(merged, key);

    // encrypted contém apenas campos não-sensíveis + ciphertext (campos sensíveis foram removidos pelo encrypt).
    // Persistir tudo para que campos plaintext como offlineCode e confirmationStatus sejam também guardados.
    const sensitiveSet = new Set(this.sensitiveFields);
    const rawUpdate: Record<string, any> = {};
    for (const [k, v] of Object.entries(encrypted)) {
      if (!sensitiveSet.has(k)) rawUpdate[k] = v;
    }
    rawUpdate.ciphertext = encrypted.ciphertext;

    const result = await this.table.update(id, rawUpdate);
    notifyWrite();
    return result;
  }

  where(index: string) {
    return new EncryptedWhereClause(this.table.where(index), (r) => {
      const key = getActiveKey();
      return key ? this.decrypt(r, key) : Promise.resolve(r);
    });
  }

  filter(fn: (x: any) => boolean) {
    // Nota: fn é aplicado a registos RAW (não desencriptados).
    // Usar apenas com campos não-encriptados (ex: synced, id).
    // A desencriptação ocorre em toArray() da EncryptedCollection retornada.
    const decryptFn = async (r: any) => {
      const key = getActiveKey();
      return key ? this.decrypt(r, key) : r;
    };
    return new EncryptedCollection(this.table.filter(fn), decryptFn);
  }
}

// ----------------------------------------
// Definição da Base de Dados Dexie
// ----------------------------------------

export class DrcaeDB extends Dexie {
  // Armazenamento real criptografado
  firmas!: Table<Firma, string>;
  visitas!: Table<Visita, string>;
  constatacoes!: Table<Constatacao, string>;
  infracoes!: Table<Infracao, string>;
  anexos!: Table<Anexo, string>;
  attachments!: Table<Attachment, string>;
  draftAttachments!: Table<DraftAttachment, string>;
  agentes!: Table<Agente, string>;
  utilizadores!: Table<UtilizadorInterno, string>;
  avatarFiles!: Table<AvatarFile, string>;
  denuncias!: Table<DenunciaCampo, string>;
  representantes!: Table<RepresentanteFirma, string>;
  apreensoes!: Table<Apreensao, string>;
  apreensaoItens!: Table<ApreensaoItem, string>;
  recolhas!: Table<Recolha, string>;
  recolhaItens!: Table<RecolhaItem, string>;
  syncQueue!: Table<SyncOperation, number>;
  metadata!: Table<MetadataRecord, string>;

  constructor(name = 'drcae_db') {
    super(name);

    // Versão 1 (Legado)
    this.version(1).stores({
      firmas: 'id, nif, name, district, synced',
      visitas: 'id, firmaId, date, status, synced',
      infracoes: 'id, visitaId, type, severity, synced',
      anexos: 'id, visitaId, synced',
      syncQueue: '++id, entity, action, timestamp'
    });

    // Versão 2 (Esquema de Criptografia Ativo)
    this.version(2).stores({
      firmas: 'id, synced',
      visitas: 'id, firmaId, synced',
      infracoes: 'id, visitaId, synced',
      anexos: 'id, visitaId, synced',
      syncQueue: '++id, entity, action, timestamp',
      metadata: 'key'
    });

    // Versão 3 — adiciona recomendacoesHistoricas à Visita (migração não-destrutiva)
    this.version(3).stores({
      firmas: 'id, synced',
      visitas: 'id, firmaId, synced',
      infracoes: 'id, visitaId, synced',
      anexos: 'id, visitaId, synced',
      syncQueue: '++id, entity, action, timestamp',
      metadata: 'key'
    });

    // Versão 4 — adiciona offlineCode (indexado) e confirmationStatus à Visita
    this.version(4).stores({
      firmas: 'id, synced',
      visitas: 'id, firmaId, synced, offlineCode',
      infracoes: 'id, visitaId, synced',
      anexos: 'id, visitaId, synced',
      syncQueue: '++id, entity, action, timestamp',
      metadata: 'key'
    });

    // Versão 5 — separa bytes de anexos do JSON criptografado para suportar ficheiros grandes
    this.version(5).stores({
      firmas: 'id, synced',
      visitas: 'id, firmaId, synced, offlineCode',
      infracoes: 'id, visitaId, synced',
      anexos: 'id, visitaId, synced',
      attachments: 'id, visitaId, synced',
      syncQueue: '++id, entity, action, timestamp',
      metadata: 'key'
    });

    // Versão 6 — consolida o nome inglês da store bruta de anexos: attachments.
    this.version(6).stores({
      firmas: 'id, synced',
      visitas: 'id, firmaId, synced, offlineCode',
      infracoes: 'id, visitaId, synced',
      anexos: 'id, visitaId, synced',
      attachments: 'id, visitaId, synced',
      syncQueue: '++id, entity, action, timestamp',
      metadata: 'key'
    });

    // Versão 7 — adiciona officialCode (código oficial FN-YYSSSSSS após sync) à Visita
    this.version(7).stores({
      firmas: 'id, synced',
      visitas: 'id, firmaId, synced, offlineCode, officialCode',
      infracoes: 'id, visitaId, synced',
      anexos: 'id, visitaId, synced',
      attachments: 'id, visitaId, synced',
      syncQueue: '++id, entity, action, timestamp',
      metadata: 'key'
    });

    // Versão 8 — SPEC-07 (catálogo de agentes), SPEC-08 (representantes) e
    // SPEC-03 (apreensões e recolhas).
    //
    // Subida única e coordenada, de propósito: as três specs alteram o schema
    // local, e três migrações sucessivas de IndexedDB em dispositivos de campo
    // — que podem ter fiscalizações por sincronizar — é risco desnecessário. As
    // stores de apreensão ficam vazias até a SPEC-03 aterrar.
    this.version(8).stores({
      firmas: 'id, synced',
      visitas: 'id, firmaId, synced, offlineCode, officialCode',
      infracoes: 'id, visitaId, synced',
      anexos: 'id, visitaId, synced',
      attachments: 'id, visitaId, synced',
      agentes: 'uid, district',
      representantes: 'id, firmaId, synced',
      apreensoes: 'id, visitaId, firmaId, synced, settlementStatus',
      apreensaoItens: 'id, apreensaoId, synced, custody',
      recolhas: 'id, apreensaoId, synced',
      recolhaItens: 'id, recolhaId, apreensaoItemId, synced',
      syncQueue: '++id, entity, action, timestamp',
      metadata: 'key'
    });

    // Versão 9 — SPEC-10 (modalidade iterativa).
    //
    // Aditiva: nenhum campo é removido nem reinterpretado, pelo que um
    // dispositivo com fiscalizações por sincronizar migra sem tocar nos dados.
    // `constatacaoId` fica indexado nos filhos porque a revisão e o detalhe
    // precisam de os buscar por constatação; `draftState` porque a exclusão de
    // rascunhos corre em todas as listagens.
    this.version(9).stores({
      firmas: 'id, synced',
      visitas: 'id, firmaId, synced, offlineCode, officialCode, draftState',
      constatacoes: 'id, visitaId, synced',
      infracoes: 'id, visitaId, synced, constatacaoId',
      anexos: 'id, visitaId, synced, constatacaoId',
      attachments: 'id, visitaId, synced',
      agentes: 'uid, district',
      representantes: 'id, firmaId, synced',
      apreensoes: 'id, visitaId, firmaId, synced, settlementStatus, constatacaoId',
      apreensaoItens: 'id, apreensaoId, synced, custody',
      recolhas: 'id, apreensaoId, synced',
      recolhaItens: 'id, recolhaId, apreensaoItemId, synced',
      syncQueue: '++id, entity, action, timestamp',
      metadata: 'key'
    });

    // Versão 10 — provas do rascunho de fiscalização.
    //
    // Aditiva e sem migração de dados: a store nasce vazia e é preenchida pelo
    // autosave seguinte. Um dispositivo com um rascunho a meio perde as provas
    // desse rascunho na actualização — mas perdia-as de qualquer forma, porque
    // o caminho anterior (base64 no `localStorage`) já as descartava em
    // silêncio ao estourar a quota.
    this.version(10).stores({
      firmas: 'id, synced',
      visitas: 'id, firmaId, synced, offlineCode, officialCode, draftState',
      constatacoes: 'id, visitaId, synced',
      infracoes: 'id, visitaId, synced, constatacaoId',
      anexos: 'id, visitaId, synced, constatacaoId',
      attachments: 'id, visitaId, synced',
      draftAttachments: 'localId, ordem',
      agentes: 'uid, district',
      representantes: 'id, firmaId, synced',
      apreensoes: 'id, visitaId, firmaId, synced, settlementStatus, constatacaoId',
      apreensaoItens: 'id, apreensaoId, synced, custody',
      recolhas: 'id, apreensaoId, synced',
      recolhaItens: 'id, recolhaId, apreensaoItemId, synced',
      syncQueue: '++id, entity, action, timestamp',
      metadata: 'key'
    });

    // Versão 11 — diretório interno e bytes dos avatares para uso sem rede.
    // Stores aditivas: a atualização não toca em fiscalizações pendentes.
    this.version(11).stores({
      firmas: 'id, synced',
      visitas: 'id, firmaId, synced, offlineCode, officialCode, draftState',
      constatacoes: 'id, visitaId, synced',
      infracoes: 'id, visitaId, synced, constatacaoId',
      anexos: 'id, visitaId, synced, constatacaoId',
      attachments: 'id, visitaId, synced',
      draftAttachments: 'localId, ordem',
      agentes: 'uid, district',
      utilizadores: 'uid, role, isOfficer',
      avatarFiles: 'ownerUid, avatarUid, version, updatedAt',
      representantes: 'id, firmaId, synced',
      apreensoes: 'id, visitaId, firmaId, synced, settlementStatus, constatacaoId',
      apreensaoItens: 'id, apreensaoId, synced, custody',
      recolhas: 'id, apreensaoId, synced',
      recolhaItens: 'id, recolhaId, apreensaoItemId, synced',
      syncQueue: '++id, entity, action, timestamp',
      metadata: 'key'
    });

    // Versão 12 — denúncias libertadas para averiguação no terreno.
    // Store aditiva e cifrada: uma denúncia identifica factos alegados contra
    // um operador, pelo que não pode ficar legível no IndexedDB do tablet.
    this.version(12).stores({
      firmas: 'id, synced',
      visitas: 'id, firmaId, synced, offlineCode, officialCode, draftState',
      constatacoes: 'id, visitaId, synced',
      infracoes: 'id, visitaId, synced, constatacaoId',
      anexos: 'id, visitaId, synced, constatacaoId',
      attachments: 'id, visitaId, synced',
      draftAttachments: 'localId, ordem',
      agentes: 'uid, district',
      utilizadores: 'uid, role, isOfficer',
      avatarFiles: 'ownerUid, avatarUid, version, updatedAt',
      denuncias: 'uid',
      representantes: 'id, firmaId, synced',
      apreensoes: 'id, visitaId, firmaId, synced, settlementStatus, constatacaoId',
      apreensaoItens: 'id, apreensaoId, synced, custody',
      recolhas: 'id, apreensaoId, synced',
      recolhaItens: 'id, recolhaId, apreensaoItemId, synced',
      syncQueue: '++id, entity, action, timestamp',
      metadata: 'key'
    });

    // Envolver tabelas para criptografia transparente
    const firmaFields = [
      'logo', 'nif', 'name', 'district', 'address', 'contact', 'email', 'type',
      'constituicao', 'emissoraLicenca', 'numLicenca', 'numAlvara',
      'representant', 'representantCargo', 'representantNacionalidade',
      'atividades', 'geolocation', 'createdAt',
      // Cifrados como os nomes que acompanham: um id de asset isolado não é
      // sensível, mas deixá-los de fora criaria duas classes de campo no mesmo
      // registo, e é a lista inteira que descreve o operador.
      'assetDistrict', 'assetNationality', 'assetToperator',
      'assetConstitution', 'assetIssuer'
    ];

    const visitaFields = [
      'representante',
      'date', 'time', 'technicians', 'status', 'notes',
      'atividadeEconomica', 'geolocation', 'recomendacoes', 'recomendacoesHistoricas', 'produtos', 'createdAt', 'locationAutoCaptured',
      // Medição da SPEC-10. `draftState` fica de fora de propósito: está
      // indexado, e um índice sobre campo cifrado não existe.
      'modalidade', 'sessao', 'cobertura', 'complaintUid',
      'complaintVerification'
    ];

    const infracaoFields = ['type', 'severity'];
    const anexoFields = ['fileName', 'fileType', 'data', 'notes', 'posterUrl', 'poster_ref'];

    this.firmas = new EncryptedTable(this.table('firmas'), firmaFields) as any;
    this.visitas = new EncryptedTable(this.table('visitas'), visitaFields) as any;
    // A descrição é texto livre escrito no terreno sobre um operador
    // identificado — cifrada como o resto do que descreve a fiscalização.
    this.constatacoes = new EncryptedTable(
      this.table('constatacoes'),
      ['descricao', 'geolocation', 'origem'],
    ) as any;
    this.infracoes = new EncryptedTable(this.table('infracoes'), infracaoFields) as any;
    this.anexos = new EncryptedTable(this.table('anexos'), anexoFields) as any;
    this.attachments = this.table('attachments') as Table<Attachment, string>;
    // Em claro, como `attachments`: são os mesmos ficheiros, guardados antes de
    // a fiscalização existir. Cifrar aqui e não lá criaria duas classes do
    // mesmo dado consoante o momento da captura.
    this.draftAttachments = this.table('draftAttachments') as Table<DraftAttachment, string>;
    // O catálogo de agentes é dado de referência público (nome e número de
    // serviço), tal como o catálogo de produtos — fica em claro para poder ser
    // lido antes de a base estar desbloqueada.
    this.agentes = this.table('agentes') as Table<Agente, string>;
    this.utilizadores = this.table('utilizadores') as Table<UtilizadorInterno, string>;
    this.avatarFiles = this.table('avatarFiles') as Table<AvatarFile, string>;
    this.denuncias = new EncryptedTable(this.table('denuncias'), [
      'code', 'priority', 'category', 'categoryIcon', 'description',
      'occurredAt', 'createdAt', 'releasedAt', 'targetName',
      'targetReference', 'targetGeo', 'operatorId', 'operatorName',
      'operatorGeo', 'district', 'fieldOutcome', 'fieldNote', 'attachments',
    ]) as any;
    this.representantes = new EncryptedTable(
      this.table('representantes'),
      ['name', 'docType', 'docTypeName', 'docNumber', 'role', 'lastSeenAt'],
    ) as any;
    // Designação, quantidade e identificação do fiel depositário são dados de
    // um auto com força probatória — cifrados como os da fiscalização.
    this.apreensoes = new EncryptedTable(this.table('apreensoes'), [
      'seizedAt', 'custody', 'trusteeKind', 'trusteeName', 'trusteeDocType',
      'trusteeDocNumber', 'trusteeNif', 'trusteeRole',
      'trusteeContact', 'note', 'geolocation', 'createdAt',
    ]) as any;
    this.apreensaoItens = new EncryptedTable(this.table('apreensaoItens'), [
      'designation', 'quantity', 'assetUnit', 'custody', 'collectedQuantity',
      'estimatedValue', 'note',
    ]) as any;
    this.recolhas = new EncryptedTable(this.table('recolhas'), [
      'collectedAt', 'trusteeName', 'handoverName', 'handoverDocType',
      'handoverDocNumber', 'outcome', 'note', 'geolocation',
    ]) as any;
    this.recolhaItens = new EncryptedTable(this.table('recolhaItens'), [
      'expectedQuantity', 'collectedQuantity', 'divergence', 'divergenceReason',
    ]) as any;
    this.metadata = new EncryptedTable(this.table('metadata'), ['value']) as any;
  }

  // Verificar canary value offline para validar password derivada
  async verifyOfflineKey(): Promise<boolean> {
    try {
      const canary = await this.table('metadata').get('canary');
      if (!canary) return true; // se não tem canary, assume ok (ex: primeira instalação)

      const key = getActiveKey();
      if (!key) return false;

      const decrypted = await decryptRecord(canary.ciphertext, key);
      return decrypted && decrypted.value === 'CANARY_OK';
    } catch (err) {
      console.error('Falha ao verificar canary offline:', err);
      return false;
    }
  }

  async hasOfflineCanary(): Promise<boolean> {
    return Boolean(await this.table('metadata').get('canary'));
  }

  async rekeyEncryptedData(oldKey: AppCryptoKey, newKey: AppCryptoKey): Promise<void> {
    const targets: RekeyTarget[] = [
      ['firmas', this.firmas], ['visitas', this.visitas],
      ['constatacoes', this.constatacoes], ['infracoes', this.infracoes],
      ['anexos', this.anexos], ['representantes', this.representantes],
      ['denuncias', this.denuncias],
      ['apreensoes', this.apreensoes], ['apreensaoItens', this.apreensaoItens],
      ['recolhas', this.recolhas], ['recolhaItens', this.recolhaItens],
      ['metadata', this.metadata],
    ].map(([name, table]) => ({ name, table })) as RekeyTarget[];
    await rekeyEncryptedTables(this, targets, oldKey, newKey);
  }

  // Descarta o conteúdo cifrado local apenas como recuperação de uma cache
  // legada/irrecuperável. No cofre multiagente normal, trocar a palavra-passe
  // substitui só o embrulho da chave para esse agente e preserva os dados.
  async resetEncryptedData(): Promise<void> {
    const tables = [
      'firmas', 'visitas', 'constatacoes', 'infracoes', 'anexos',
      'attachments', 'draftAttachments', 'agentes', 'utilizadores',
      'avatarFiles', 'representantes',
      'denuncias',
      'apreensoes', 'apreensaoItens', 'recolhas', 'recolhaItens',
      'syncQueue', 'metadata',
    ].map((name) => this.table(name));

    await this.transaction('rw', tables, async () => {
      await Promise.all(tables.map((table) => table.clear()));
    });
  }

  // Grava o canary offline inicial
  async setupOfflineCanary(): Promise<void> {
    const key = getActiveKey();
    if (!key) return;

    const encryptedCanary = await encryptRecord({ value: 'CANARY_OK' }, key);
    await this.table('metadata').put({
      key: 'canary',
      ciphertext: encryptedCanary
    });
  }

  async batchMarkSynced(updates: {
    firmaIds: string[];
    visitaUpdates: { id: string; confirmationStatus: 'confirmada' | 'pendente' }[];
    infracaoIds: string[];
    anexoIds: string[];
  }): Promise<void> {
    await this.transaction('rw',
      this.table('firmas'), this.table('visitas'),
      this.table('infracoes'), this.table('anexos'), this.table('attachments'),
      async () => {
        for (const id of updates.firmaIds)
          await this.table('firmas').update(id, { synced: true });
        for (const { id, confirmationStatus } of updates.visitaUpdates)
          await this.table('visitas').update(id, { synced: true, confirmationStatus });
        for (const id of updates.infracaoIds)
          await this.table('infracoes').update(id, { synced: true });
        for (const id of updates.anexoIds)
          await this.table('anexos').update(id, { synced: true });
        for (const id of updates.anexoIds)
          await this.table('attachments').update(id, { synced: true }).catch(() => {});
      }
    );
  }
}

export const db = new DrcaeDB();

// Gerar UUID v4 estável para identificação no backend
export const generateId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback para gerar UUID v4 manualmente em contextos inseguros
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};
