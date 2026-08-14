import type {DenunciaCampo} from '../db/db';

type ComplaintTable = {
  clear():Promise<unknown>;
  bulkPut(items:DenunciaCampo[]):Promise<unknown>;
};

export async function syncReleasedComplaints(
  table:ComplaintTable,
  response:{denuncias_state?:unknown;denuncias?:unknown},
):Promise<number> {
  if (response.denuncias_state !== 'complete' || !Array.isArray(response.denuncias)) {
    return 0;
  }
  const complaints = response.denuncias as DenunciaCampo[];
  await table.clear();
  if (complaints.length > 0) await table.bulkPut(complaints);
  return complaints.length;
}
