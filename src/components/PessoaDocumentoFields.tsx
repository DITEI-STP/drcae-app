import React, { useMemo } from 'react';
import { IdCard } from 'lucide-react';
import { cn } from '../lib/utils';
import { readAssetGroup } from '../lib/assetGroup';
import { abreviaturaDocumento, nomeDocumento, tecladoNumeroDocumento } from '../lib/documentType';

/** Fallback usado enquanto o grupo `tdocument` não estiver sincronizado. */
const FALLBACK_DOC_TYPES = [
  { code: 'bi', name: 'Bilhete de Identidade' },
  { code: 'nif', name: 'NIF' },
  { code: 'passport', name: 'Passaporte' },
  { code: 'residence', name: 'Cartão de Residência' },
];

function readDocTypes() {
  const catalog = readAssetGroup('tdocument').filter((a) => a.code);
  if (catalog.length === 0) return FALLBACK_DOC_TYPES;
  return catalog.map((a) => ({ code: a.code, name: a.name, meta: a.meta }));
}

export interface PessoaDocumento {
  name: string;
  /** `code` do asset sob `parent.code = 'tdocument'`. */
  docType: string;
  docNumber: string;
}

export function pessoaDocumentoCompleta(value: PessoaDocumento): boolean {
  return Boolean(
    value.name.trim() && value.docType.trim() && value.docNumber.trim(),
  );
}

interface Props {
  value: PessoaDocumento;
  onChange: (next: PessoaDocumento) => void;
  namePlaceholder: string;
}

/**
 * Identificação de uma pessoa por nome e documento.
 *
 * Documento e não NIF: no terreno o BI está à mão onde o NIF de pessoa
 * singular não está, e exigir NIF sob bloqueio de submissão produzia números
 * inventados só para destrancar o formulário. É também o que permite
 * desduplicar pessoas pelo número de documento, nunca pelo nome — dois
 * homónimos não são a mesma pessoa.
 *
 * Extraído à terceira ocorrência da mesma forma (representante no local, fiel
 * depositário terceiro, quem entregou na recolha) e ligado desde o início aos
 * dois consumidores novos. O `RepresentanteField` mantém a sua cópia porque
 * carrega máquina que estes não têm — lista de conhecidos, `uid` e intenção de
 * «voltar»; convertê-lo é melhoria, e melhoria não é efeito colateral de uma
 * extracção.
 */
export default function PessoaDocumentoFields({
  value,
  onChange,
  namePlaceholder,
}: Props) {
  const docTypes = useMemo(() => readDocTypes(), []);
  const tecladoDocumento = tecladoNumeroDocumento(value.docType);

  return (
    <div className="space-y-2">
      <input
        type="text"
        value={value.name}
        onChange={(e) => onChange({ ...value, name: e.target.value })}
        placeholder={namePlaceholder}
        className="w-full p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-semibold text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500"
      />

      {/* Tipo e número na mesma linha: «Bilhete de Identidade» ocupa uma linha
          inteira para dizer o que «BI» diz num relance, e empurra o número para
          fora do ecrã num tablet. */}
      <div className="flex flex-wrap items-stretch gap-2">
        <div
          className="flex gap-1.5 shrink-0"
          role="group"
          aria-label="Tipo de documento"
        >
          {docTypes.map((tipo) => {
            const activo = value.docType === tipo.code;
            return (
              <button
                key={tipo.code}
                type="button"
                title={nomeDocumento(tipo)}
                aria-label={nomeDocumento(tipo)}
                aria-pressed={activo}
                onClick={() => onChange({ ...value, docType: tipo.code })}
                className={cn(
                  'min-h-[44px] px-2.5 rounded-xl border text-[11px] font-bold tracking-wide flex items-center gap-1 transition-colors',
                  activo
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300',
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
          inputMode={tecladoDocumento.inputMode}
          pattern={tecladoDocumento.pattern}
          autoCapitalize={tecladoDocumento.autoCapitalize}
          autoCorrect="off"
          spellCheck={false}
          value={value.docNumber}
          onChange={(e) => onChange({ ...value, docNumber: e.target.value })}
          placeholder="Nº do documento"
          className="flex-1 min-w-[9rem] p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
    </div>
  );
}
