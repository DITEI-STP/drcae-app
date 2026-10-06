import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { DrcaeDB } from '../../db/db';
import { discardInspectionDraft } from './discardInspectionDraft';

describe('discardInspectionDraft', () => {
  it('apaga apenas o rascunho activo e os dados temporários associados', async () => {
    const database = new DrcaeDB('drcae_discard_inspection_test');

    try {
      await database.table('visitas').bulkAdd([
        { id: 'draft', firmaId: 'firma-1', draftState: 'draft' },
        { id: 'submitted', firmaId: 'firma-1', draftState: 'submitted' },
      ]);
      await database.table('constatacoes').bulkAdd([
        { id: 'finding-draft', visitaId: 'draft', synced: false },
        { id: 'finding-submitted', visitaId: 'submitted', synced: false },
      ]);
      await database.table('draftAttachments').add({
        localId: 'photo-1',
        ordem: 0,
        name: 'photo.jpg',
        type: 'image/jpeg',
        data: new Blob(['photo']),
      });

      await discardInspectionDraft('draft', database);

      expect(await database.table('visitas').get('draft')).toBeUndefined();
      expect(await database.table('constatacoes').get('finding-draft')).toBeUndefined();
      expect(await database.table('draftAttachments').count()).toBe(0);
      expect(await database.table('visitas').get('submitted')).toBeDefined();
      expect(await database.table('constatacoes').get('finding-submitted')).toBeDefined();
    } finally {
      database.close();
      await database.delete();
    }
  });

  it('não apaga uma fiscalização já submetida', async () => {
    const database = new DrcaeDB('drcae_discard_submitted_test');

    try {
      await database.table('visitas').add({
        id: 'submitted',
        firmaId: 'firma-1',
        draftState: 'submitted',
      });
      await database.table('draftAttachments').add({
        localId: 'photo-1',
        ordem: 0,
        name: 'photo.jpg',
        type: 'image/jpeg',
        data: new Blob(['photo']),
      });

      await discardInspectionDraft('submitted', database);

      expect(await database.table('visitas').get('submitted')).toBeDefined();
      expect(await database.table('draftAttachments').count()).toBe(1);
    } finally {
      database.close();
      await database.delete();
    }
  });
});
