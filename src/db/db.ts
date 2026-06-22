import Dexie, { type Table } from 'dexie';

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
  createdAt?: number;
  locationAutoCaptured?: boolean;
}

export interface Infracao {
  id?: string;
  visitaId: string;
  type: string;
  severity: string; // 'Baixa', 'Alta', 'Crítica'
  synced?: boolean;
}

export interface Anexo {
  id?: string;
  visitaId: string;
  fileName: string;
  fileType: string;
  data: ArrayBuffer | Blob | string; // Ideally Blob, but string for base64 simple preview
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

export class DrcaeDB extends Dexie {
  firmas!: Table<Firma, string>;
  visitas!: Table<Visita, string>;
  infracoes!: Table<Infracao, string>;
  anexos!: Table<Anexo, string>;
  syncQueue!: Table<SyncOperation, number>;

  constructor() {
    super('drcae_db');
    this.version(1).stores({
      firmas: 'id, nif, name, district, synced',
      visitas: 'id, firmaId, date, status, synced',
      infracoes: 'id, visitaId, type, severity, synced',
      anexos: 'id, visitaId, synced',
      syncQueue: '++id, entity, action, timestamp'
    });
  }
}

export const db = new DrcaeDB();

// Generate a simple unique ID
export const generateId = () => {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};
