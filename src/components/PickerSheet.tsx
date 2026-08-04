import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, Search, Plus, Check } from 'lucide-react';
import { cn, normalizeSearch } from '../lib/utils';
import { useBackIntent } from '../hooks/useBackIntent';

export interface PickerOption {
  value: string;
  label: string;
  /** Texto secundário na mesma linha — categoria, código, unidade. */
  hint?: string;
}

interface FreeTextConfig {
  /** Rótulo da acção, construído a partir do que foi escrito. */
  label: (query: string) => string;
  /**
   * Convite mostrado **antes** de haver texto escrito.
   *
   * Sem ele, a via só se descobre por acidente: o agente teria de adivinhar que
   * escrever um nome inexistente faz aparecer uma opção. Quem abre a folha vê a
   * lista do catálogo e conclui que é tudo o que pode registar.
   */
  prompt: string;
  onCreate: (query: string) => void;
}

interface Props {
  open: boolean;
  title: string;
  options: PickerOption[];
  value: string | null;
  onSelect: (value: string) => void;
  onClose: () => void;
  searchPlaceholder?: string;
  /**
   * Escape para o que o catálogo não cobre. Aparece **dentro** da pesquisa,
   * como primeira acção quando o que se escreveu não corresponde a nada — e
   * não como um segundo controlo algures no formulário.
   */
  freeText?: FreeTextConfig;
  emptyLabel?: string;
}


/**
 * Escolha de uma opção numa lista longa, em folha inferior com pesquisa.
 *
 * É o par do `ChipGroup`: as listas curtas ficam à vista no formulário, as que
 * nascem grandes — o catálogo de produtos — vivem aqui, onde há espaço para
 * pesquisar. O `ChipGroup` também abre esta folha quando a sua lista cresce
 * para além do que cabe inline.
 *
 * O botão «voltar» do Android fecha a folha antes de tocar no formulário, pela
 * pilha LIFO do `useBackIntent`. Regista sentinela de histórico: sem ela, o
 * «voltar» do browser/PWA fecharia a folha **e** navegaria para fora do
 * formulário no mesmo gesto, deixando para trás um rascunho meio preenchido.
 */
export default function PickerSheet({
  open,
  title,
  options,
  value,
  onSelect,
  onClose,
  searchPlaceholder = 'Pesquisar…',
  freeText,
  emptyLabel = 'Nada corresponde à pesquisa.',
}: Props) {
  const [query, setQuery] = useState('');
  const pesquisaRef = useRef<HTMLInputElement>(null);

  useBackIntent(onClose, open, true);

  // A pesquisa não é estado do formulário: reabrir a folha para escolher outra
  // coisa deve começar do catálogo inteiro, não do filtro da vez anterior.
  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  // Congela o scroll da página por baixo. Sem isto, arrastar dentro da folha
  // arrasta o formulário atrás dela mal a lista chega ao fim.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const filtered = useMemo(() => {
    const needle = normalizeSearch(query);
    if (!needle) return options;
    // A pista entra na procura porque há listas em que o rótulo é um símbolo:
    // as unidades de medida mostram «kg» e guardam «Quilograma» na pista, e
    // quem ainda não decorou os símbolos escreve o nome por extenso.
    return options.filter((option) =>
      normalizeSearch(`${option.label} ${option.hint ?? ''}`).includes(needle),
    );
  }, [options, query]);

  // O escape de texto livre só se oferece quando há algo escrito que não é já,
  // exactamente, uma opção do catálogo — caso contrário estaria a convidar a
  // duplicar à mão o que está catalogado, que é o oposto do que se pretende.
  const trimmedQuery = query.trim();
  const exactMatch = filtered.some((option) => normalizeSearch(option.label) === normalizeSearch(trimmedQuery));
  const offerFreeText = Boolean(freeText) && trimmedQuery.length > 0 && !exactMatch;
  // Antes de haver texto, o mesmo sítio mostra o convite: a via existe e vê-se,
  // mas continua a ser dentro da pesquisa e depois do catálogo — é isso que
  // mantém o catálogo como caminho normal e o texto livre como excepção.
  const offerFreeTextPrompt = Boolean(freeText) && trimmedQuery.length === 0;

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="fixed inset-x-0 bottom-0 z-50 max-h-[80vh] bg-white dark:bg-slate-900 rounded-t-3xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-300">
        <div className="shrink-0 flex justify-center pt-3 pb-1">
          <div className="w-10 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700" />
        </div>

        <div className="flex items-center justify-between px-5 py-3 shrink-0">
          <h3 className="font-bold text-base text-slate-800 dark:text-slate-100 leading-tight">
            {title}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 pb-3 shrink-0">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              ref={pesquisaRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full pl-9 pr-3 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-semibold text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] space-y-1.5">
          {offerFreeTextPrompt && (
            <button
              type="button"
              onClick={() => pesquisaRef.current?.focus()}
              className="w-full min-h-[44px] flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-dashed border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/60 text-left"
            >
              <Plus className="w-4 h-4 text-slate-400 shrink-0" />
              <span className="min-w-0">
                <span className="block text-xs font-bold text-slate-700 dark:text-slate-200">
                  {freeText!.prompt}
                </span>
                <span className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                  Escreva o nome na pesquisa para o registar.
                </span>
              </span>
            </button>
          )}

          {offerFreeText && (
            <button
              type="button"
              onClick={() => {
                freeText!.onCreate(trimmedQuery);
                onClose();
              }}
              className="w-full min-h-[44px] flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-dashed border-blue-300 dark:border-blue-500/40 bg-blue-50 dark:bg-blue-500/10 text-left"
            >
              <Plus className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
              <span className="text-xs font-bold text-blue-700 dark:text-blue-300">
                {freeText!.label(trimmedQuery)}
              </span>
            </button>
          )}

          {filtered.length === 0 && !offerFreeText && !offerFreeTextPrompt ? (
            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 py-8 text-center">
              {emptyLabel}
            </p>
          ) : (
            filtered.map((option) => {
              const selected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onSelect(option.value);
                    onClose();
                  }}
                  className={cn(
                    'w-full min-h-[44px] flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors',
                    selected
                      ? 'bg-blue-600 border-blue-600 text-white'
                      : 'bg-slate-50 dark:bg-slate-800/60 border-slate-100 dark:border-white/5 text-slate-700 dark:text-slate-200',
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-bold">{option.label}</span>
                    {option.hint && (
                      <span
                        className={cn(
                          'block truncate text-[10px] font-semibold',
                          selected ? 'text-blue-100' : 'text-slate-400 dark:text-slate-500',
                        )}
                      >
                        {option.hint}
                      </span>
                    )}
                  </span>
                  {selected && <Check className="w-4 h-4 shrink-0" />}
                </button>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
