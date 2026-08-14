import {describe, expect, it, vi} from 'vitest';
import {syncReleasedComplaints} from './syncReleasedComplaints';

describe('syncReleasedComplaints', () => {
  it('substitui a cache offline quando o pull é completo', async () => {
    const table = {clear:vi.fn().mockResolvedValue(undefined),bulkPut:vi.fn().mockResolvedValue(undefined)};
    const complaints = [{uid:'complaint-1',code:'DN-26000001'}];

    await expect(syncReleasedComplaints(table, {
      denuncias_state:'complete', denuncias:complaints,
    })).resolves.toBe(1);
    expect(table.clear).toHaveBeenCalledOnce();
    expect(table.bulkPut).toHaveBeenCalledWith(complaints);
  });

  it('preserva a cache se o servidor não conseguiu resolver a lista', async () => {
    const table = {clear:vi.fn(),bulkPut:vi.fn()};
    await expect(syncReleasedComplaints(table, {
      denuncias_state:'unavailable', denuncias:[],
    })).resolves.toBe(0);
    expect(table.clear).not.toHaveBeenCalled();
  });
});
