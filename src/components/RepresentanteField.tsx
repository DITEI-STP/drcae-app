import React, { useEffect, useMemo, useState } from 'react';
import { UserCheck, AlertTriangle, UserPlus, X, Check, IdCard } from 'lucide-react';
import { cn } from '../lib/utils';
import type { Representante, RepresentanteFirma } from '../db/db';
import { readRepresentantesDaFirma } from '../lib/representantesCache';
import { isRepresentanteComplete } from '../lib/inspectionModel';
import { readAssetGroup } from '../lib/assetGroup';
import { abreviaturaDocumento, nomeDocumento } from '../lib/documentType';
import { useBackIntent } from '../hooks/useBackIntent';

/** Fallback usado enquanto o grupo `tdocument` não estiver sincronizado. */
const FALLBACK_DOC_TYPES = [
  { code: 'bi', name: 'Bilhete de Identidade' },
  { code: 'nif', name: 'NIF' },
  { code: 'passport', name: 'Passaporte' },
  { code: 'residence', name: 'Cartão de Residência' },
];

function readDocTypes(): { code: string; name: string; meta?: Record<string, unknown> | null }[] {
  const catalog = readAssetGroup('tdocument').filter((a) => a.code);
  if (catalog.length === 0) return FALLBACK_DOC_TYPES;
  return catalog.map((a) => ({ code: a.code, name: a.name, meta: a.meta }));
}

const EMPTY_REPRESENTANTE: Representante = {
  uid: undefined,
  name: '',
  docType: '',
  docNumber: '',
  role: '',
};

interface Props {
  firmaId: string;
  value: Representante;
  onChange: (next: Representante) => void;
}

/**
 * Representante do operador presente no acto.
 *
 * **Nunca é pré-preenchido.** O campo era preenchido automaticamente a partir
 * da ficha da firma, pelo que o agente avançava sem olhar e a acta ficava a
 * declarar como presente alguém que podia não ter estado no local — uma
 * declaração falsa num documento com força probatória.
 *
 * ## Dois modos, um de cada vez
 *
 * A lista de conhecidos e o formulário manual estavam ambos à vista ao mesmo
 * tempo, o que deixava por dizer qual era o caminho: escrever à mão alguém que
 * já estava registado criava um segundo registo da mesma pessoa.
 *
 * - Há conhecidos → lista, e o formulário só abre por «Outro representante».
 * - Não há conhecidos → o formulário abre de imediato, porque não existe
 *   escolha nenhuma a apresentar e um botão seria um toque sem alternativa.
 *
 * O gatilho é o número de conhecidos e não o número de fiscalizações
 * anteriores: o que decide o que mostrar é haver ou não algo para escolher.
 *
 * ## Identidade
 *
 * A lista mostra o documento além do nome, porque é o documento que identifica
 * — dois homónimos apareciam como duas entradas iguais, e escolher a errada
 * atribui as declarações à pessoa errada. Pela mesma razão a escolha fica em
 * leitura: editar os campos de um representante conhecido desligava o `uid` em
 * silêncio e convertia a escolha num registo novo.
 */
export default function RepresentanteField({ firmaId, value, onChange }: Props) {
  const [conhecidos, setConhecidos] = useState<RepresentanteFirma[]>([]);
  const [carregado, setCarregado] = useState(false);
  const [modoNovo, setModoNovo] = useState(false);

  const docTypes = useMemo(() => readDocTypes(), []);
  const docTypeOptions = useMemo(
    () => docTypes.map((t) => ({ value: t.code, label: t.name })),
    [docTypes],
  );

  useEffect(() => {
    if (!firmaId) { setConhecidos([]); setCarregado(true); return; }
    let cancelled = false;
    const load = () => {
      readRepresentantesDaFirma(firmaId)
        .then((rows) => { if (!cancelled) { setConhecidos(rows); setCarregado(true); } })
        .catch(() => { if (!cancelled) { setConhecidos([]); setCarregado(true); } });
    };
    load();
    window.addEventListener('drcae:representantes-updated', load);
    return () => {
      cancelled = true;
      window.removeEventListener('drcae:representantes-updated', load);
    };
  }, [firmaId]);

  const escolhido = conhecidos.find((c) => c.id === value.uid);
  const preenchido = isRepresentanteComplete(value);

  // Sem conhecidos não há lista para onde voltar, pelo que o formulário é o
  // ecrã — e não um sub-modo que se possa cancelar.
  const semLista = carregado && conhecidos.length === 0;

  // Um rascunho restaurado traz o representante escrito à mão, sem `uid`.
  // Sem esta condição o campo mostrava a lista e o que já tinha sido preenchido
  // ficava invisível — presente no registo, ausente do ecrã.
  const rascunhoManual = !escolhido && Boolean(value.name || value.docNumber);
  const aEditar = modoNovo || semLista || rascunhoManual;

  const voltarALista = () => {
    setModoNovo(false);
    onChange(EMPTY_REPRESENTANTE);
  };

  // Enquanto o formulário está aberto por cima da lista, o «voltar» do Android
  // fecha-o em vez de recuar o passo do stepper — pilha LIFO do useBackIntent,
  // o mesmo contrato de um modal.
  useBackIntent(voltarALista, aEditar && !semLista);

  const abrirNovo = () => {
    onChange(EMPTY_REPRESENTANTE);
    setModoNovo(true);
  };

  return (
    <div className="space-y-3">
      <label className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest pl-1 block">
        Representante no Local *
      </label>

      {/* Escolha feita: fica em leitura, com o documento à vista para o agente
          poder confirmar que é mesmo quem esteve presente. */}
      {!aEditar && escolhido && (
        <div className="p-4 rounded-xl border border-blue-600 bg-blue-600 text-white flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <Check className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-bold truncate">{escolhido.name}</p>
              <p className="text-[11px] font-semibold text-blue-100 truncate">
                {docTypeOptions.find((t) => t.value === escolhido.docType)?.label || escolhido.docType}
                {escolhido.docNumber ? ` ${escolhido.docNumber}` : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onChange(EMPTY_REPRESENTANTE)}
            className="shrink-0 min-h-[36px] px-3 rounded-lg text-[11px] font-bold bg-white/15 hover:bg-white/25 transition-colors"
          >
            Trocar
          </button>
        </div>
      )}

      {/* Lista de conhecidos. Só aparece quando não há escolha feita e não se
          está a registar alguém novo. */}
      {!aEditar && !escolhido && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-medium text-slate-400 dark:text-slate-500 pl-1">
            Já registados neste operador — toque para escolher:
          </p>
          <ul className="space-y-1.5">
            {conhecidos.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onChange({
                    uid: c.id,
                    name: c.name,
                    docType: c.docType,
                    docNumber: c.docNumber,
                    role: c.role,
                  })}
                  className="w-full min-h-[44px] flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-left transition-colors hover:border-blue-400"
                >
                  <UserCheck className="w-4 h-4 shrink-0 text-slate-400" />
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-bold text-slate-700 dark:text-slate-200">
                      {c.name}
                    </span>
                    {/* O documento é o que distingue dois homónimos. */}
                    <span className="block truncate text-[10px] font-semibold text-slate-400 dark:text-slate-500">
                      {docTypeOptions.find((t) => t.value === c.docType)?.label || c.docType}
                      {c.docNumber ? ` ${c.docNumber}` : ''}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={abrirNovo}
            className="w-full min-h-[44px] flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-blue-300 dark:border-blue-500/40 bg-blue-50 dark:bg-blue-500/10 text-xs font-bold text-blue-700 dark:text-blue-300 transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            Outro representante
          </button>
        </div>
      )}

      {aEditar && (
        <div className="space-y-3">
          {/* Sem lista por trás não há nada a cancelar: o formulário é o ecrã. */}
          {!semLista && (
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest pl-1">
                Novo representante
              </p>
              <button
                type="button"
                onClick={voltarALista}
                className="min-h-[36px] px-3 rounded-lg text-[11px] font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 flex items-center gap-1.5 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                Cancelar
              </button>
            </div>
          )}

          <input
            type="text"
            value={value.name}
            onChange={(e) => onChange({ ...value, uid: undefined, name: e.target.value })}
            placeholder="Nome do representante..."
            className="w-full p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:bg-white dark:focus:bg-slate-800 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 text-sm font-semibold text-slate-800 dark:text-slate-100 transition-all outline-none"
          />

          {/* Tipo e número na mesma linha: «Bilhete de Identidade» ocupava uma
              linha inteira para dizer o que «BI» diz num relance, e empurrava o
              número para fora do ecrã num tablet. A abreviatura vem de
              `meta.abbr` do asset — ver lib/documentType.ts. */}
          <div className="flex flex-wrap items-stretch gap-2">
            <div className="flex gap-1.5 shrink-0" role="group" aria-label="Tipo de documento">
              {docTypes.map((tipo) => {
                const activo = value.docType === tipo.code;
                return (
                  <button
                    key={tipo.code}
                    type="button"
                    title={nomeDocumento(tipo)}
                    aria-label={nomeDocumento(tipo)}
                    aria-pressed={activo}
                    onClick={() => onChange({ ...value, uid: undefined, docType: tipo.code })}
                    className={cn(
                      'min-h-[44px] px-2.5 rounded-xl border text-[11px] font-bold tracking-wide flex items-center gap-1 transition-colors',
                      activo
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300',
                    )}
                  >
                    <IdCard className="w-3.5 h-3.5 shrink-0" />
                    {abreviaturaDocumento(tipo)}
                  </button>
                );
              })}
            </div>

            <input
              type="text"
              value={value.docNumber}
              onChange={(e) => onChange({ ...value, uid: undefined, docNumber: e.target.value })}
              placeholder="Nº do documento"
              className="flex-1 min-w-[9rem] p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      )}

      {!preenchido && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/40 rounded-xl flex items-start gap-2 text-xs text-red-700 dark:text-red-400 font-semibold">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>
            Indique o nome, o tipo e o número de documento de quem esteve presente no local.
            Este registo identifica quem prestou declarações.
          </span>
        </div>
      )}
    </div>
  );
}
