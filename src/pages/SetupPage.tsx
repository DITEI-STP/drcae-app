import { ArrowLeft, BadgeCheck, Download, ExternalLink, ShieldCheck, Smartphone } from 'lucide-react';

const setupUrl = `${window.location.origin}/app/setup`;
const appUrl = `${window.location.origin}/app/`;

export default function SetupPage() {
  return (
    <div className="min-h-screen bg-[#0f172a] text-slate-100 px-4 py-6">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-5">
        <button
          type="button"
          onClick={() => { window.location.href = '/app/'; }}
          className="inline-flex w-fit items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-300 transition-colors hover:border-slate-500 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </button>

        <header className="space-y-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600/20">
            <ShieldCheck className="h-6 w-6 text-blue-300" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white">
            Configurar certificado local
          </h1>
          <p className="text-sm leading-6 text-slate-400">
            O scanner QR precisa de HTTPS para aceder à câmera no navegador. Use
            um certificado local assinado e abra a aplicação pelo endereço seguro.
          </p>
        </header>

        <section className="grid gap-3">
          <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-bold text-white">
              <BadgeCheck className="h-4 w-4 text-emerald-300" />
              1. Instale a autoridade local no dispositivo
            </div>
            <p className="text-sm leading-6 text-slate-400">
              Instale a CA usada pelo servidor local no Android/iOS e marque-a
              como confiável para ligações HTTPS. Sem isso, o navegador pode
              bloquear câmera, service worker ou recursos seguros.
            </p>
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-bold text-white">
              <Smartphone className="h-4 w-4 text-blue-300" />
              2. Use o domínio local com HTTPS
            </div>
            <p className="text-sm leading-6 text-slate-400">
              No dispositivo, abra <code className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-200">{appUrl}</code>.
              Evite HTTP para o scanner QR, porque navegadores móveis só
              liberam câmera em contexto seguro.
            </p>
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-900/70 p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-bold text-white">
              <Download className="h-4 w-4 text-amber-300" />
              3. Se estiver no Android WebView
            </div>
            <p className="text-sm leading-6 text-slate-400">
              Instale a versão mais recente do APK DRCAE. O APK aceita certificados
              inválidos apenas para hosts <code className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-200">*.local</code>,
              mas o navegador externo continua a exigir a CA instalada no sistema.
            </p>
          </div>
        </section>

        <footer className="rounded-xl border border-blue-500/30 bg-blue-950/40 p-4 text-sm text-blue-100">
          <p className="mb-3 font-semibold">Endereço desta ajuda:</p>
          <a
            href={setupUrl}
            className="inline-flex items-center gap-2 break-all text-blue-300 underline underline-offset-4"
          >
            /setup
            <ExternalLink className="h-4 w-4 flex-shrink-0" />
          </a>
        </footer>
      </div>
    </div>
  );
}
