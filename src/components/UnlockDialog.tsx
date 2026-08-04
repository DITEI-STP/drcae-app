import React, { useState } from 'react';
import { Lock, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { getSessionNif, unlockWithPassword } from '../lib/unlock';

interface UnlockDialogProps {
  /** Porque é que o desbloqueio é pedido — mostrado ao agente. */
  reason?: string;
  /** Chamado após desbloqueio bem sucedido; é aqui que a operação retoma. */
  onUnlocked: () => void;
  onCancel: () => void;
}

/**
 * Pede a palavra-passe para repor a chave de cifra e **retomar** a operação
 * que ficou a meio. Nunca descarta o que o agente já preencheu: quem abre este
 * diálogo mantém o formulário intacto e volta a submeter em `onUnlocked`.
 */
export default function UnlockDialog({ reason, onUnlocked, onCancel }: UnlockDialogProps) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nif = getSessionNif();

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (!nif) {
      setError('Sessão sem agente associado. Inicie sessão novamente.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await unlockWithPassword(nif, password);
      if (!result.ok) {
        setError(result.error ?? 'Não foi possível desbloquear.');
        return;
      }
      setPassword('');
      onUnlocked();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="flex items-start gap-3 p-4 border-b border-slate-100 dark:border-slate-800">
          <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-950/40 flex items-center justify-center shrink-0">
            <Lock className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="flex-1">
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">Base local bloqueada</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
              {reason ?? 'Introduza a sua palavra-passe para continuar. Nada do que preencheu se perde.'}
            </p>
          </div>
          <button
            onClick={onCancel}
            className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
            aria-label="Fechar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={submit} className="p-4 space-y-3">
          <input
            type="password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Palavra-passe"
            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500"
          />
          {error && (
            <p className="text-xs font-medium text-red-600 dark:text-red-400">{error}</p>
          )}
          <button
            type="submit"
            disabled={busy || password.length === 0}
            className={cn(
              'w-full py-2.5 rounded-xl text-sm font-bold text-white transition-colors',
              busy || password.length === 0
                ? 'bg-slate-300 dark:bg-slate-700 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700',
            )}
          >
            {busy ? 'A desbloquear…' : 'Desbloquear e continuar'}
          </button>
        </form>
      </div>
    </div>
  );
}
