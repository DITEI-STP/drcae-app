import React, { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { PackageOpen, AlertTriangle, CheckCircle2, Clock, ChevronRight } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { db, generateId, type Apreensao, type ApreensaoItem } from '../db/db';
import { cn } from '../lib/utils';
import { toast } from '../lib/notifications';
import { unitName } from '../lib/units';
import { descreveDepositario, resumoDepositario } from '../lib/depositario';
import { useGeoLocation } from '../lib/geo';
import { triggerFullSyncIfReachable } from '../lib/sync';
import { isDatabaseLockedError, isDatabaseUnlocked } from '../lib/unlock';
import { addAppLog } from '../lib/appLogs';
import UnlockDialog from '../components/UnlockDialog';
import PessoaDocumentoFields, {
  pessoaDocumentoCompleta,
  type PessoaDocumento,
} from '../components/PessoaDocumentoFields';
import { useBackIntent } from '../hooks/useBackIntent';

const STATUS_LABEL: Record<Apreensao['settlementStatus'], { label: string; className: string }> = {
  'not-applicable': { label: 'Sem depósito', className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' },
  pending: { label: 'Por recolher', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' },
  partial: { label: 'Recolha parcial', className: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300' },
  settled: { label: 'Liquidado', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300' },
  released: { label: 'Devolvido', className: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-300' },
  breached: { label: 'Quebra de depósito', className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' },
};

/**
 * Apreensões e recolha do que ficou em fiel depósito.
 *
 * A recolha é uma **operação separada da fiscalização**: não cria fiscalização,
 * não conta para estatísticas de fiscalização e tem código próprio. O que se
 * regista é a quantidade efectivamente encontrada — e a divergência face ao que
 * ficou em depósito é, ela própria, o facto relevante.
 */
export default function Apreensoes() {
  const [selected, setSelected] = useState<Apreensao | null>(null);

  const apreensoes = useLiveQuery(() => db.apreensoes.toArray(), []) ?? [];
  const pendentes = useMemo(
    () => apreensoes
      .filter((a) => a.settlementStatus === 'pending' || a.settlementStatus === 'partial' || a.settlementStatus === 'breached')
      .sort((a, b) => (a.seizedAt || '').localeCompare(b.seizedAt || '')),
    [apreensoes],
  );
  const restantes = useMemo(
    () => apreensoes.filter((a) => !pendentes.includes(a)),
    [apreensoes, pendentes],
  );

  useBackIntent(() => setSelected(null), !!selected);

  if (selected) {
    return <DetalheApreensao apreensao={selected} onBack={() => setSelected(null)} />;
  }

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6 bg-[#F8FAFC] dark:bg-slate-950 pb-24">
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800/80">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 rounded-xl">
            <PackageOpen className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Apreensões</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Produtos em fiel depósito por recolher, e autos já liquidados.
            </p>
          </div>
        </div>
      </div>

      <Seccao titulo="Pendentes de recolha" vazio="Nada por recolher — todos os autos estão liquidados." itens={pendentes} onSelect={setSelected} />
      <Seccao titulo="Histórico" vazio="Ainda não há autos de apreensão neste dispositivo." itens={restantes} onSelect={setSelected} />
    </div>
  );
}

/**
 * Rota directa para um auto guardado na base local. Mantém o detalhe acessível
 * a partir da fiscalização sem depender do estado transitório da listagem.
 */
export function ApreensaoDetailPage() {
  const { uid } = useParams<{ uid: string }>();
  const navigate = useNavigate();
  const apreensao = useLiveQuery(async () => {
    if (!uid) return null;
    return (await db.apreensoes.get(uid)) ?? null;
  }, [uid]);

  if (apreensao === undefined) {
    return (
      <div className="flex-1 space-y-3 bg-[#F8FAFC] p-4 dark:bg-slate-950">
        <div className="h-28 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />
        <div className="h-20 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />
      </div>
    );
  }

  if (!apreensao) {
    return (
      <div className="flex flex-1 items-center justify-center bg-[#F8FAFC] p-6 dark:bg-slate-950">
        <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 text-center dark:border-slate-800 dark:bg-slate-900">
          <PackageOpen className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-3 text-sm font-bold text-slate-700 dark:text-slate-200">Auto de apreensão não encontrado</p>
          <button
            type="button"
            onClick={() => navigate('/apreensoes')}
            className="mt-4 text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400"
          >
            Voltar às apreensões
          </button>
        </div>
      </div>
    );
  }

  return <DetalheApreensao apreensao={apreensao} onBack={() => navigate(-1)} />;
}

function Seccao({ titulo, vazio, itens, onSelect }: {
  titulo: string; vazio: string; itens: Apreensao[]; onSelect: (a: Apreensao) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-1">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{titulo}</span>
        <span className="text-[11px] font-bold text-slate-500">{itens.length}</span>
      </div>
      {itens.length === 0 ? (
        <p className="text-xs text-slate-400 dark:text-slate-500 px-1 py-4 text-center">{vazio}</p>
      ) : itens.map((a) => {
        const status = STATUS_LABEL[a.settlementStatus] ?? STATUS_LABEL['not-applicable'];
        return (
          <button
            key={a.id}
            type="button"
            onClick={() => onSelect(a)}
            className="w-full text-left bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-blue-300 transition-colors flex items-center gap-3"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-xs font-bold text-slate-700 dark:text-slate-300">
                  {a.officialCode || a.offlineCode || '—'}
                </span>
                <span className={cn('text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full', status.className)}>
                  {status.label}
                </span>
                {!a.synced && (
                  <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                    Por sincronizar
                  </span>
                )}
              </div>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate mt-1">
                {a.firmaName || 'Operador'}
              </p>
              {a.settlementStatus !== 'not-applicable' && (
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  {resumoDepositario(a)}
                </p>
              )}
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
          </button>
        );
      })}
    </div>
  );
}

function DetalheApreensao({ apreensao, onBack }: { apreensao: Apreensao; onBack: () => void }) {
  const itens = useLiveQuery(
    () => db.apreensaoItens.where('apreensaoId').equals(apreensao.id!).toArray(),
    [apreensao.id],
  ) ?? [];
  const emDeposito = itens.filter((i) => i.custody === 'trustee');
  const [registando, setRegistando] = useState(false);

  if (registando) {
    return (
      <RegistarRecolha
        apreensao={apreensao}
        itens={emDeposito}
        onDone={() => { setRegistando(false); onBack(); }}
        onCancel={() => setRegistando(false)}
      />
    );
  }

  const status = STATUS_LABEL[apreensao.settlementStatus] ?? STATUS_LABEL['not-applicable'];
  const temSaldo = emDeposito.some((i) => (i.collectedQuantity ?? 0) < i.quantity);

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4 bg-[#F8FAFC] dark:bg-slate-950 pb-24">
      <button onClick={onBack} className="text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
        ← Voltar
      </button>

      <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-sm font-bold text-slate-800 dark:text-slate-100">
            {apreensao.officialCode || apreensao.offlineCode || '—'}
          </span>
          <span className={cn('text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full', status.className)}>
            {status.label}
          </span>
        </div>
        <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{apreensao.firmaName || 'Operador'}</p>
        {apreensao.settlementStatus !== 'not-applicable' && (() => {
          const { custodiante, assinante, terceiro } = descreveDepositario(apreensao);
          return (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Fiel depositário: <strong>{custodiante}</strong>
              {terceiro && apreensao.trusteeDocNumber
                ? ` · ${apreensao.trusteeDocNumber}`
                : ''}
              {assinante ? ` · assinou ${assinante}` : ''}
            </p>
          );
        })()}
        {apreensao.note && (
          <p className="text-xs text-slate-500 dark:text-slate-400 italic pt-1">{apreensao.note}</p>
        )}
      </div>

      <div className="space-y-2">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Itens apreendidos</span>
        {itens.map((it) => {
          const saldo = it.custody === 'trustee' ? it.quantity - (it.collectedQuantity ?? 0) : 0;
          return (
            <div key={it.id} className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{it.designation}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                    {it.quantity} {unitName(it.assetUnit)}
                  </p>
                </div>
                <span className={cn(
                  'text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0',
                  it.custody === 'drcae'
                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                    : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
                )}>
                  {it.custody === 'drcae' ? 'DRCAE' : 'Depósito'}
                </span>
              </div>
              {it.custody === 'trustee' && (
                <p className={cn(
                  'text-[11px] font-semibold mt-2',
                  saldo > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400',
                )}>
                  {saldo > 0
                    ? `Por recolher: ${saldo} ${unitName(it.assetUnit)}`
                    : 'Totalmente recolhido'}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {temSaldo && (
        <button
          type="button"
          onClick={() => setRegistando(true)}
          className="w-full py-4 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold text-sm uppercase tracking-wide transition-colors shadow-lg"
        >
          Registar recolha
        </button>
      )}
    </div>
  );
}

function RegistarRecolha({ apreensao, itens, onDone, onCancel }: {
  apreensao: Apreensao; itens: ApreensaoItem[]; onDone: () => void; onCancel: () => void;
}) {
  const { location } = useGeoLocation();
  // Pré-preenchido com o saldo esperado: o caso normal é encontrar o que ficou.
  const [quantidades, setQuantidades] = useState<Record<string, string>>(() =>
    Object.fromEntries(itens.map((i) => [i.id!, String(i.quantity - (i.collectedQuantity ?? 0))])),
  );
  const [motivos, setMotivos] = useState<Record<string, string>>({});
  const [trusteePresent, setTrusteePresent] = useState(true);
  // Quem entregou de facto, quando o depositário não compareceu. A quebra que
  // esta recolha pode declarar é imputada ao depositário: acusá-lo a partir de
  // um acto sem ninguém identificado é acusar sem testemunha.
  const [handover, setHandover] = useState<PessoaDocumento>({
    name: '', docType: '', docNumber: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [needsUnlock, setNeedsUnlock] = useState(false);

  useBackIntent(onCancel, true);

  const saldoDe = (it: ApreensaoItem) => it.quantity - (it.collectedQuantity ?? 0);
  const divergente = (it: ApreensaoItem) => Number(quantidades[it.id!] ?? 0) !== saldoDe(it);
  // Uma divergência sem motivo é um facto por explicar — e é o facto central.
  const faltaMotivo = itens.some((it) => divergente(it) && !motivos[it.id!]?.trim());
  const faltaEntregador = !trusteePresent && !pessoaDocumentoCompleta(handover);

  const submeter = async () => {
    if (isSubmitting) return;
    if (!isDatabaseUnlocked()) { setNeedsUnlock(true); return; }

    setIsSubmitting(true);
    try {
      const recolhaId = generateId();
      await db.recolhas.add({
        id: recolhaId,
        apreensaoId: apreensao.id!,
        collectedAt: new Date().toISOString(),
        trusteePresent,
        trusteeName: apreensao.trusteeName,
        handoverName: trusteePresent ? undefined : handover.name.trim(),
        handoverDocType: trusteePresent ? undefined : handover.docType.trim(),
        handoverDocNumber: trusteePresent ? undefined : handover.docNumber.trim(),
        geolocation: location,
        synced: false,
      });

      for (const it of itens) {
        await db.recolhaItens.add({
          id: generateId(),
          recolhaId,
          apreensaoItemId: it.id!,
          expectedQuantity: saldoDe(it),
          collectedQuantity: Number(quantidades[it.id!] ?? 0),
          divergenceReason: motivos[it.id!]?.trim() || undefined,
          synced: false,
        });
      }

      toast.success('Recolha registada localmente.');
      triggerFullSyncIfReachable().catch(() => {});
      onDone();
    } catch (err) {
      addAppLog('error', 'recolha', 'Falha ao registar recolha', err);
      if (isDatabaseLockedError(err)) setNeedsUnlock(true);
      else toast.error('Não foi possível registar a recolha. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4 bg-[#F8FAFC] dark:bg-slate-950 pb-24">
      <button onClick={onCancel} className="text-xs font-bold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
        ← Cancelar
      </button>

      <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
        <h2 className="font-bold text-base text-slate-800 dark:text-slate-100">Registar recolha</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          Indique a quantidade <strong>efectivamente encontrada</strong> de cada
          produto. Qualquer diferença face ao que ficou em depósito tem de ser
          justificada — é essa diferença o facto a registar.
        </p>
        <label className="flex items-center gap-3 pt-2 cursor-pointer">
          <input type="checkbox" checked={trusteePresent} onChange={(e) => setTrusteePresent(e.target.checked)} className="w-4 h-4" />
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
            Fiel depositário presente no acto
          </span>
        </label>

        {!trusteePresent && (
          <div className="pt-2 space-y-2">
            <p className="text-[10px] font-bold text-amber-700 dark:text-amber-300 uppercase tracking-widest">
              Quem entregou os produtos *
            </p>
            <PessoaDocumentoFields
              value={handover}
              onChange={setHandover}
              namePlaceholder="Nome de quem entregou *"
            />
            {faltaEntregador && (
              <p className="text-[11px] font-semibold text-red-700 dark:text-red-400">
                Sem o depositário presente, identifique quem entregou: uma falta
                registada é imputada a quem assumiu a guarda.
              </p>
            )}
          </div>
        )}
      </div>

      {itens.map((it) => {
        const saldo = saldoDe(it);
        const div = divergente(it);
        return (
          <div key={it.id} className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
            <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{it.designation}</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
              Em depósito: {saldo} {unitName(it.assetUnit)}
            </p>
            <input
              type="number" inputMode="decimal" min="0" step="0.01"
              value={quantidades[it.id!] ?? ''}
              onChange={(e) => setQuantidades((p) => ({ ...p, [it.id!]: e.target.value }))}
              className="w-full p-3 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-amber-500 text-slate-800 dark:text-slate-100 font-mono"
            />
            {div && (
              <>
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Diverge do que ficou em depósito
                </div>
                <textarea
                  rows={2}
                  value={motivos[it.id!] ?? ''}
                  onChange={(e) => setMotivos((p) => ({ ...p, [it.id!]: e.target.value }))}
                  placeholder="Motivo da divergência *"
                  className="w-full p-3 text-xs bg-slate-50 dark:bg-slate-800 border border-amber-200 dark:border-amber-900/40 rounded-xl outline-none text-slate-800 dark:text-slate-100"
                />
              </>
            )}
          </div>
        );
      })}

      <button
        type="button"
        onClick={submeter}
        disabled={isSubmitting || faltaMotivo || faltaEntregador}
        className={cn(
          'w-full py-4 rounded-xl font-bold text-sm uppercase tracking-wide transition-colors shadow-lg flex items-center justify-center gap-2',
          isSubmitting || faltaMotivo || faltaEntregador
            ? 'bg-slate-300 dark:bg-slate-700 text-slate-500 cursor-not-allowed shadow-none'
            : 'bg-amber-600 hover:bg-amber-700 text-white',
        )}
      >
        {isSubmitting ? <Clock className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
        {isSubmitting ? 'A registar…' : 'Concluir recolha'}
      </button>

      {needsUnlock && (
        <UnlockDialog
          reason="A base local ficou bloqueada. Introduza a palavra-passe para concluir a recolha — os valores mantêm-se."
          onUnlocked={() => { setNeedsUnlock(false); void submeter(); }}
          onCancel={() => setNeedsUnlock(false)}
        />
      )}
    </div>
  );
}
