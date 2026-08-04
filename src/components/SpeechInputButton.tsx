import { useEffect, useRef, useState } from 'react';
import { Loader2, Mic } from 'lucide-react';
import { cn } from '../lib/utils';
import { toast } from '../lib/notifications';
import {
  hasWebSpeech,
  isInsideNativeShell,
  nativeSpeechAvailable,
  nativeSpeechListen,
} from '../lib/nativeSpeech';

/**
 * O que dizer ao agente por cada código do shell nativo.
 *
 * Recurso para quando o nativo não manda mensagem — um APK antigo com bundle
 * novo devolve o código e nada mais.
 */
const MENSAGEM_POR_ERRO: Record<string, string> = {
  network: 'Ditado indisponível sem rede: o idioma não está instalado no dispositivo.',
  language: 'Português não está disponível no reconhecimento de voz deste dispositivo.',
  permission: 'Permissão de microfone não concedida.',
  busy: 'O reconhecimento de voz está ocupado. Tente outra vez.',
  audio: 'Não foi possível aceder ao microfone.',
  timeout: 'O ditado não respondeu. Escreva à mão ou tente outra vez.',
  default: 'Não foi possível ditar. Escreva à mão ou tente outra vez.',
};

interface SpeechInputButtonProps {
  onTranscript: (text: string) => void;
  lang?: string;
  className?: string;
  disabled?: boolean;
}

/**
 * Ditado por voz.
 *
 * Duas implementações, escolhidas pelo ambiente: dentro do `drcae-webview` o
 * ditado vem do `SpeechRecognizer` nativo, porque a Android System WebView não
 * implementa a Web Speech API; fora dele (browser, PWA) usa-se a API web, que
 * aí existe.
 *
 * Sem nenhuma das duas o botão não é desenhado. Um botão de microfone que não
 * faz nada é pior do que não haver botão — foi o que se viu no terreno.
 */
export default function SpeechInputButton({
  onTranscript,
  lang = 'pt-PT',
  className,
  disabled = false,
}: SpeechInputButtonProps) {
  const [disponivel, setDisponivel] = useState(() => !isInsideNativeShell() && hasWebSpeech());
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (!isInsideNativeShell()) return;
    let vivo = true;
    nativeSpeechAvailable()
      .then((ok) => vivo && setDisponivel(ok))
      .catch(() => vivo && setDisponivel(false));
    return () => {
      vivo = false;
    };
  }, []);

  if (!disponivel) return null;

  const ditarNativo = async () => {
    setListening(true);
    try {
      const { texto, erro, mensagem } = await nativeSpeechListen(lang);
      if (texto) {
        onTranscript(texto);
        return;
      }
      // Silêncio continua a passar sem dizer nada — quem carregou e não falou
      // escreve à mão. Uma falha, sim, aparece: enquanto todas resolviam a
      // nulo, o botão acendia e apagava-se e o terreno reportava «o mic não
      // consegue fazer transcrição».
      if (erro) toast.error(mensagem || MENSAGEM_POR_ERRO[erro] || MENSAGEM_POR_ERRO.default);
    } finally {
      setListening(false);
    }
  };

  const ditarWeb = () => {
    const SpeechRec =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const rec = new SpeechRec();
    rec.lang = lang;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.continuous = false;

    rec.onresult = (e: any) => {
      const transcript = e.results[0]?.[0]?.transcript ?? '';
      if (transcript) onTranscript(transcript);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);

    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  };

  const accionar = () => {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    if (isInsideNativeShell()) void ditarNativo();
    else ditarWeb();
  };

  return (
    <button
      type="button"
      onClick={accionar}
      disabled={disabled}
      title={listening ? 'A ouvir…' : 'Ditar texto'}
      className={cn(
        'p-2 rounded-lg transition-colors flex-shrink-0',
        listening
          ? 'bg-red-100 dark:bg-red-950/30 text-red-600 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-950/50'
          : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        className,
      )}
    >
      {listening ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />}
    </button>
  );
}
