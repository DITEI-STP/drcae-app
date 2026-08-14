import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';

const NEW_COMPLAINT_MS = 72 * 60 * 60 * 1000;

export function isNewReleasedComplaint(releasedAt: string, now = Date.now()): boolean {
  const timestamp = new Date(releasedAt).getTime();
  return Number.isFinite(timestamp) && now - timestamp <= NEW_COMPLAINT_MS;
}

export function useComplaintRadar() {
  return useLiveQuery(async () => {
    const complaints = await db.denuncias.toArray();
    const byOperator = new Map<string, number>();
    let newCount = 0;
    for (const complaint of complaints) {
      if (complaint.fieldOutcome) continue;
      if (complaint.operatorId) {
        byOperator.set(
          complaint.operatorId,
          (byOperator.get(complaint.operatorId) ?? 0) + 1,
        );
      }
      if (isNewReleasedComplaint(complaint.releasedAt)) newCount += 1;
    }
    return { byOperator, newCount };
  }, []) ?? { byOperator: new Map<string, number>(), newCount: 0 };
}
