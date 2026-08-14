import { useState } from 'react';
import { Camera, Check, CheckCircle2, CircleHelp, MapPin, XCircle } from 'lucide-react';
import ComplaintEvidenceGrid from '../../../components/ComplaintEvidenceGrid';
import ComplaintIcon from '../../../components/ComplaintIcon';
import EvidenciaPreview, { type EvidenciaSeleccionada } from '../../../components/EvidenciaPreview';
import type { ComplaintFieldOutcome, ComplaintVerification, DenunciaCampo } from '../../../db/db';

const OUTCOMES: Array<{ value: ComplaintFieldOutcome; label: string; help: string; icon: typeof CheckCircle2; color: string }> = [
  { value: 'confirmed', label: 'Confirmada', help: 'Os factos essenciais foram verificados no local.', icon: CheckCircle2, color: 'border-emerald-500 bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300' },
  { value: 'not-confirmed', label: 'Não confirmada', help: 'A averiguação encontrou evidência contrária ou ausência dos factos.', icon: XCircle, color: 'border-slate-500 bg-slate-50 text-slate-800 dark:bg-slate-500/10 dark:text-slate-300' },
  { value: 'inconclusive', label: 'Inconclusiva', help: 'Não foi possível obter evidência suficiente nesta visita.', icon: CircleHelp, color: 'border-amber-500 bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300' },
];

export default function StepDenuncia({ complaint, verification, onChange, evidenceCount, findingCount, gaps }: {
  complaint?: DenunciaCampo;
  verification: ComplaintVerification | null;
  onChange: (value: ComplaintVerification) => void;
  evidenceCount: number;
  findingCount: number;
  gaps: string[];
}) {
  const [preview, setPreview] = useState<EvidenciaSeleccionada | null>(null);
  if (!complaint) return <p className="rounded-2xl bg-rose-50 p-4 text-sm font-bold text-rose-700">A denúncia não está disponível neste dispositivo. Sincronize antes de continuar.</p>;
  return (
    <div className="w-full space-y-4">
      <header className="rounded-3xl bg-slate-950 p-5 text-white">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-500/15 text-blue-400"><ComplaintIcon icon={complaint.categoryIcon} /></span>
          <div><p className="font-mono text-xs font-bold text-blue-400">{complaint.code}</p><h2 className="mt-1 text-lg font-black">{complaint.category}</h2><p className="mt-1 flex items-center gap-1 text-xs text-slate-300"><MapPin className="h-3.5 w-3.5" />{complaint.targetName ?? complaint.operatorName ?? 'Local indicado na denúncia'}</p></div>
        </div>
        <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-slate-200">{complaint.description}</p>
      </header>

      {complaint.attachments.length > 0 && <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900"><h3 className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-500"><Camera className="h-4 w-4 text-blue-500" />Provas recebidas</h3><ComplaintEvidenceGrid files={complaint.attachments} onSelect={setPreview} /></section>}

      <section className="rounded-2xl border border-blue-200 bg-blue-50/60 p-4 dark:border-blue-500/20 dark:bg-blue-500/5">
        <h3 className="text-sm font-black text-slate-900 dark:text-white">Cobertura obrigatória desta averiguação</h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-2"><CheckItem done={findingCount > 0} text={`${findingCount} constatação(ões) aberta(s)`} /><CheckItem done={evidenceCount > 0} text={`${evidenceCount} prova(s) recolhida(s) no local`} /></div>
        {gaps.length > 0 && <ul className="mt-3 space-y-1 text-xs font-semibold text-amber-800 dark:text-amber-300">{gaps.map((gap) => <li key={gap}>• {gap}</li>)}</ul>}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="text-sm font-black text-slate-900 dark:text-white">Resultado da averiguação</h3>
        <p className="mt-1 text-xs text-slate-500">Registe apenas o que foi observado ou sustentado por evidência.</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">{OUTCOMES.map((option) => { const Icon = option.icon; const active = verification?.outcome === option.value; return <button key={option.value} type="button" onClick={() => onChange({ outcome: option.value, note: verification?.note ?? '' })} className={`rounded-xl border p-3 text-left ${active ? option.color : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'}`}><Icon className="h-5 w-5" /><span className="mt-2 block text-xs font-black">{option.label}</span><span className="mt-1 block text-[10px] leading-4 opacity-80">{option.help}</span></button>; })}</div>
        <label className="mt-4 block text-xs font-bold text-slate-700 dark:text-slate-200">Fundamentação no terreno</label>
        <textarea rows={5} value={verification?.note ?? ''} onChange={(event) => onChange({ outcome: verification?.outcome ?? 'inconclusive', note: event.target.value })} placeholder="O que observou, quem ouviu, que documentos consultou e que provas recolheu…" className="mt-2 w-full rounded-xl border border-slate-200 bg-transparent p-3 text-sm dark:border-slate-700" />
        <p className="mt-1 text-right text-[10px] font-semibold text-slate-400">Mínimo 20 caracteres · {(verification?.note ?? '').trim().length}/20</p>
      </section>
      <EvidenciaPreview evidencia={preview} onFechar={() => setPreview(null)} />
    </div>
  );
}

function CheckItem({ done, text }: { done: boolean; text: string }) {
  return <p className={`flex items-center gap-2 rounded-xl border p-3 text-xs font-bold ${done ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300' : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300'}`}><span className={`flex h-5 w-5 items-center justify-center rounded-full ${done ? 'bg-emerald-500 text-white' : 'bg-amber-400 text-white'}`}>{done && <Check className="h-3 w-3" />}</span>{text}</p>;
}
