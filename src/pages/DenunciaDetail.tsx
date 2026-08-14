import { useState } from 'react';
import { ArrowLeft, Camera, ClipboardCheck, MapPin } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate, useParams } from 'react-router-dom';
import ComplaintEvidenceGrid from '../components/ComplaintEvidenceGrid';
import ComplaintIcon from '../components/ComplaintIcon';
import ComplaintPriority from '../components/ComplaintPriority';
import EvidenciaPreview, { type EvidenciaSeleccionada } from '../components/EvidenciaPreview';
import { db } from '../db/db';
import { useAppGrants } from '../lib/grants';
import { canVerifyReleasedComplaint } from '../lib/complaintAccess';

export default function DenunciaDetail() {
  const { uid = '' } = useParams();
  const navigate = useNavigate();
  const grants = useAppGrants();
  const [preview, setPreview] = useState<EvidenciaSeleccionada | null>(null);
  const canVerify = canVerifyReleasedComplaint(grants);
  const complaint = useLiveQuery(() => db.denuncias.get(uid), [uid]);
  if (!complaint) return null;

  const startInspection = () => navigate('/visitas/nova', {
    state: { firmaId: complaint.operatorId, complaintUid: complaint.uid },
  });

  return (
    <div className="w-full space-y-4 p-4 pb-28 md:p-6">
      <Link to="/denuncias" className="inline-flex items-center gap-2 text-sm font-bold text-slate-500"><ArrowLeft className="h-4 w-4" />Denúncias</Link>
      <section className="rounded-3xl bg-slate-950 p-5 text-white shadow-xl">
        <div className="flex items-start gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-500/15 text-blue-400"><ComplaintIcon icon={complaint.categoryIcon} /></span>
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-mono text-xs font-bold text-blue-300">{complaint.code}</p><ComplaintPriority priority={complaint.priority} /></div><h1 className="mt-1 text-xl font-black">{complaint.category}</h1><p className="mt-2 flex items-center gap-1 text-xs text-slate-300"><MapPin className="h-3.5 w-3.5" />{complaint.targetName ?? 'Local por identificar'}</p></div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Factos comunicados</h2>
        <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700 dark:text-slate-200">{complaint.description}</p>
        {complaint.targetReference && <p className="mt-3 text-xs text-slate-500">Referência: {complaint.targetReference}</p>}
      </section>

      {complaint.attachments.length > 0 && <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"><h2 className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-500"><Camera className="h-4 w-4 text-blue-500" />Provas recebidas</h2><ComplaintEvidenceGrid files={complaint.attachments} onSelect={setPreview} /></section>}

      {complaint.fieldOutcome ? <div className="rounded-2xl bg-emerald-50 p-4 text-sm font-bold text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300"><ClipboardCheck className="mr-2 inline h-4 w-4" />Averiguação registada; aguarda despacho administrativo.</div>
        : <button type="button" onClick={startInspection} disabled={!complaint.operatorId || !canVerify} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 py-4 text-sm font-black text-white shadow-lg shadow-blue-500/20 disabled:opacity-50"><ClipboardCheck className="h-5 w-5" />{canVerify ? 'Iniciar averiguação' : 'Sem permissão para averiguar'}</button>}
      <EvidenciaPreview evidencia={preview} onFechar={() => setPreview(null)} />
    </div>
  );
}
