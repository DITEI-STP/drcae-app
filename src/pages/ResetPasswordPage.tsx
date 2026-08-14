import React, { useState } from 'react';
import { KeyRound, Loader2, AlertCircle, CheckCircle2, ShieldAlert } from 'lucide-react';
import * as api from '../lib/api';

const APP_LOGO_SRC = '/app/img/logo.png';
const MIN_PASSWORD_LENGTH = 8;

/**
 * Definição de nova senha a partir do link enviado por email
 * (`${APP_BASE_URL}reset-password?token=…`). Vive fora do router da app: é
 * acessível sem sessão, sem emparelhamento e sem dispositivo aprovado, porque
 * o agente abre normalmente este link no browser do telemóvel pessoal.
 */
export default function ResetPasswordPage() {
  const token = new URLSearchParams(window.location.search).get('token') || '';
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const appHref = import.meta.env.BASE_URL || '/app/';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`A palavra-passe deve ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      return;
    }
    if (password !== confirmation) {
      setError('As palavras-passe não coincidem.');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const result = await api.confirmPasswordReset(token, password);
      if (result.result) {
        setDone(true);
      } else {
        setError(result.message || 'Ligação inválida ou expirada. Peça uma nova recuperação.');
      }
    } catch {
      setError('Não foi possível concluir a operação. Verifique a ligação e tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-[#F5F7FA] p-4">
      <div className="w-full max-w-sm bg-white p-8 rounded-3xl shadow-xl shadow-blue-900/5">
        <div className="flex flex-col items-center justify-center mb-6">
          <img src={APP_LOGO_SRC} alt="DRCAE" className="h-20 w-20 object-contain" />
        </div>

        {!token ? (
          <div className="text-center space-y-3">
            <AlertCircle className="w-8 h-8 text-red-500 mx-auto" />
            <h1 className="text-lg font-black text-slate-900">Ligação inválida</h1>
            <p className="text-sm text-slate-500 font-medium">
              Abra o link exactamente como o recebeu no email de recuperação.
            </p>
          </div>
        ) : done ? (
          <div className="text-center space-y-4">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
            <h1 className="text-xl font-black text-slate-900">Palavra-passe alterada</h1>
            <p className="text-sm text-slate-500 font-medium leading-relaxed">
              Já pode iniciar sessão com o seu NIF e a nova palavra-passe.
            </p>
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-left">
              <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-[11px] text-amber-700 font-semibold leading-relaxed">
                A credencial offline anterior será invalidada na próxima sincronização. Inicie
                sessão uma vez com ligação ao servidor para autorizar esta nova palavra-passe
                também no modo offline, sem apagar a cache partilhada do dispositivo.
              </p>
            </div>
            <a
              href={appHref}
              className="block w-full py-3.5 bg-blue-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 transition-colors uppercase tracking-wide"
            >
              Ir para o início de sessão
            </a>
          </div>
        ) : (
          <>
            <div className="flex flex-col items-center mb-6">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center mb-3">
                <KeyRound className="w-5 h-5 text-blue-600" />
              </div>
              <h1 className="text-xl font-black text-center text-slate-900">Nova palavra-passe</h1>
              <p className="text-sm text-center text-slate-500 mt-1 font-medium">
                Defina a palavra-passe de acesso à aplicação DRCAE.
              </p>
            </div>

            {error && (
              <div className="p-3 mb-4 bg-red-50 border border-red-200 text-red-600 text-xs font-semibold rounded-xl text-center">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">
                  Nova palavra-passe
                </label>
                <input
                  type="password"
                  required
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(''); }}
                  className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 text-sm font-medium transition-all"
                  placeholder="Mínimo de 8 caracteres"
                  disabled={loading}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest pl-1">
                  Confirmar palavra-passe
                </label>
                <input
                  type="password"
                  required
                  autoComplete="new-password"
                  value={confirmation}
                  onChange={(e) => { setConfirmation(e.target.value); setError(''); }}
                  className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 text-sm font-medium transition-all"
                  placeholder="••••••••"
                  disabled={loading}
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 bg-blue-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-200 hover:bg-blue-700 transition-colors uppercase tracking-wide flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> A guardar...</> : 'Definir palavra-passe'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
