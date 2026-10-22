import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Building2, Plus, X } from 'lucide-react';
import type { Firma } from '../db/db';
import type { NifDecision } from '../lib/registerFirma';
import { useBackIntent } from '../hooks/useBackIntent';
import ChipGroup from './ChipGroup';

export default function NifCollisionSheet({ matches, onChoose }: { matches: Firma[]; onChoose: (decision: NifDecision) => void }) {
  const [selected, setSelected] = useState(matches[0]?.id || '');
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  useBackIntent(() => onChoose(null), true, true);
  const firma = matches.find(match => match.id === selected);
  return <dialog ref={dialog} onCancel={event => { event.preventDefault(); onChoose(null); }}
    className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-amber-200 bg-white p-0 text-slate-900 shadow-2xl backdrop:bg-black/60 dark:border-amber-800 dark:bg-slate-900 dark:text-white" aria-labelledby="nif-collision-title">
    <div className="border-b border-amber-200 bg-amber-50 p-5 dark:border-amber-900 dark:bg-amber-950/30">
      <div className="flex items-center justify-between gap-3"><AlertTriangle className="text-amber-600" /><button type="button" onClick={() => onChoose(null)} aria-label="Voltar ao formulário" className="p-2"><X size={20} /></button></div>
      <h2 id="nif-collision-title" className="mt-2 text-xl font-bold">Este NIF já está registado</h2>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">Uma firma pode ter várias actividades e estabelecimentos. Escolha como pretende continuar.</p>
    </div>
    <div className="space-y-4 p-5">
      {matches.length > 1 ? <ChipGroup label="Operador existente" value={selected} onChange={setSelected} options={matches.map(match => ({ value: match.id!, label: match.name }))} /> : null}
      {firma ? <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700"><p className="font-bold">{firma.name}</p><p className="mt-1 text-sm text-slate-500">NIF {firma.nif} · {firma.address}</p></div> : null}
      <button type="button" disabled={!firma} onClick={() => firma && onChoose({ action: 'existing', firma })} className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-left dark:border-blue-800 dark:bg-blue-950/30"><Building2 size={21} className="shrink-0 text-blue-600" /><span><strong className="block text-sm">Usar o operador existente</strong><span className="text-xs text-slate-500">Cancelar a nova firma e abrir a ficha já registada.</span></span></button>
      <button type="button" disabled={!firma} onClick={() => firma && onChoose({ action: 'add-activities', firma })} className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-left dark:border-blue-800 dark:bg-blue-950/30"><Plus size={21} className="shrink-0 text-blue-600" /><span><strong className="block text-sm">Acrescentar actividades ao operador</strong><span className="text-xs text-slate-500">Guardar neste operador as actividades que preencheu.</span></span></button>
      <button type="button" onClick={() => onChoose({ action: 'new' })} className="min-h-12 w-full rounded-xl border border-amber-300 p-3 text-sm font-semibold text-amber-800 dark:border-amber-800 dark:text-amber-300">Continuar e registar uma firma separada</button>
      <p className="text-xs leading-relaxed text-slate-500">Se continuar com o mesmo NIF, os dados serão recebidos e a firma ficará assinalada para correcção no admin.</p>
    </div>
  </dialog>;
}
