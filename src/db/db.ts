import Dexie, { type Table } from 'dexie';
import { encryptRecord, decryptRecord, getActiveKey, type AppCryptoKey } from '../lib/crypto';

export interface AtividadeEconomica {
  id?: string;
  ramo: string;
  atividade: string;
  local: string;
  geolocation?: { lat: number; lng: number } | null;
}

export interface Firma {
  id?: string;
  logo?: string;
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

export interface Visita {
  id?: string;
  firmaId: string;
  firmaName?: string;
  date: string;
  time: string;
  technicians: string[];
  status: string; // 'Inconformes', 'Infrações', 'Regularizado'
  notes?: string;
  atividadeEconomica?: string;
  geolocation?: { lat: number; lng: number } | null;
  synced?: boolean;
  recomendacoes?: string[];
  recomendacoesHistoricas?: RecomendacaoHistorica[];
  produtos?: ProdutoPreco[];
  createdAt?: number;
  locationAutoCaptured?: boolean;
}

export interface Infracao {
  id?: string;
  visitaId: string;
  type: string;
  severity: string; // 'Baixa', 'Alta', 'Crítica'
  minimum_penalty?: number | null;
  maximum_penalty?: number | null;
  synced?: boolean;
}

export interface ProdutoPreco {
  product_id: number;
  name: string;
  grossPrice?: number | null;  // preço do livro
  retailPrice?: number | null; // preço do livro
  gross?: string;              // preço informado pelo agente
  retail?: string;             // preço informado pelo agente
  visitaId?: string;
}

export interface Anexo {
  id?: string;
  visitaId: string;
  fileName: string;
  fileType: string;
  data: ArrayBuffer | Blob | string; // Base64 encriptado
  notes: string;
  synced?: boolean;
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
}

class EncryptedWhereClause {
  constructor(
    private whereClause: any,
    private decryptFn: (r: any) => Promise<any>
  ) {}

  equals(value: any) {
    return new EncryptedCollection(this.whereClause.equals(value), this.decryptFn);
  }
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
    return this.table.add(encrypted);
  }

  async put(obj: any) {
    const key = getActiveKey();
    if (!key) throw new Error('Base de dados bloqueada.');
    const encrypted = await this.encrypt(obj, key);
    return this.table.put(encrypted);
  }

  async bulkAdd(arr: any[]) {
    const key = getActiveKey();
    if (!key) throw new Error('Base de dados bloqueada.');
    const encryptedArr = await Promise.all(arr.map(obj => this.encrypt(obj, key)));
    return this.table.bulkAdd(encryptedArr);
  }

  async bulkPut(arr: any[]) {
    const key = getActiveKey();
    if (!key) throw new Error('Base de dados bloqueada.');
    const encryptedArr = await Promise.all(arr.map(obj => this.encrypt(obj, key)));
    return this.table.bulkPut(encryptedArr);
  }

  async bulkDelete(keys: any[]) {
    return this.table.bulkDelete(keys);
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
    
    return this.table.update(id, { ciphertext: encrypted.ciphertext, synced: encrypted.synced });
  }

  where(index: string) {
    return new EncryptedWhereClause(this.table.where(index), (r) => {
      const key = getActiveKey();
      return key ? this.decrypt(r, key) : Promise.resolve(r);
    });
  }

  filter(fn: (x: any) => boolean) {
    // Para simplificar o filter no app, desencriptamos antes de passar à callback
    // (Aviso: isto descriptografa em memória durante a busca)
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
  infracoes!: Table<Infracao, string>;
  anexos!: Table<Anexo, string>;
  syncQueue!: Table<SyncOperation, number>;
  metadata!: Table<MetadataRecord, string>;

  constructor() {
    super('drcae_db');

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

    // Envolver tabelas para criptografia transparente
    const firmaFields = [
      'logo', 'nif', 'name', 'district', 'address', 'contact', 'email', 'type',
      'constituicao', 'emissoraLicenca', 'numLicenca', 'numAlvara',
      'representant', 'representantCargo', 'representantNacionalidade',
      'atividades', 'geolocation', 'createdAt'
    ];

    const visitaFields = [
      'date', 'time', 'technicians', 'status', 'notes',
      'atividadeEconomica', 'geolocation', 'recomendacoes', 'recomendacoesHistoricas', 'produtos', 'createdAt', 'locationAutoCaptured'
    ];

    const infracaoFields = ['type', 'severity'];
    const anexoFields = ['fileName', 'fileType', 'data', 'notes'];

    this.firmas = new EncryptedTable(this.table('firmas'), firmaFields) as any;
    this.visitas = new EncryptedTable(this.table('visitas'), visitaFields) as any;
    this.infracoes = new EncryptedTable(this.table('infracoes'), infracaoFields) as any;
    this.anexos = new EncryptedTable(this.table('anexos'), anexoFields) as any;
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
