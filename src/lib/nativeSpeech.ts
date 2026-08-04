/**
 * Ditado por voz dentro do `drcae-webview` (SPEC-10, correcção #3).
 *
 * A Web Speech API **não existe** na Android System WebView — `SpeechRecognition`
 * é do Chrome-navegador, não do componente. Dentro do kiosque o botão do
 * microfone nunca chegava a ser desenhado, e no terreno isso lia-se como «o mic
 * não funciona».
 *
 * O shell nativo expõe o `android.speech.SpeechRecognizer` pela mesma via já
 * usada pelo `drcae-native-back`: uma mensagem para lá, um `CustomEvent` de
 * volta. Fora do shell (browser, PWA) cai-se na Web Speech API, que aí existe.
 */

declare global {
  interface Window {
    ReactNativeWebView?: { postMessage: (msg: string) => void };
    SpeechRecognition?: unknown;
    webkitSpeechRecognition?: unknown;
  }
}

/**
 * Prazo da pergunta de disponibilidade. Curto de propósito: é uma troca de
 * mensagens local, e o único caso em que não há resposta é o shell antigo, sem
 * a ponte — esperar vinte segundos por essa conclusão deixava o botão a
 * aparecer e a desaparecer a meio do preenchimento.
 */
const DISPONIBILIDADE_TIMEOUT_MS = 1_500;

/** O ditado em si espera pela fala, e por isso tem prazo longo. */
const DITADO_TIMEOUT_MS = 20_000;

export function isInsideNativeShell(): boolean {
  return typeof window !== 'undefined' && !!window.ReactNativeWebView;
}

export function hasWebSpeech(): boolean {
  return (
    typeof window !== 'undefined' &&
    ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)
  );
}

/** Espera uma resposta única do shell, com prazo — o nativo pode não responder. */
function esperarEvento<T>(
  nome: string,
  extrair: (detail: unknown) => T,
  prazoMs: number,
): Promise<T | null> {
  return new Promise((resolve) => {
    let terminado = false;
    const terminar = (valor: T | null) => {
      if (terminado) return;
      terminado = true;
      window.removeEventListener(nome, ouvinte as EventListener);
      clearTimeout(prazo);
      resolve(valor);
    };
    const ouvinte = (e: Event) => terminar(extrair((e as CustomEvent).detail));
    const prazo = window.setTimeout(() => terminar(null), prazoMs);
    window.addEventListener(nome, ouvinte as EventListener);
  });
}

/**
 * Sondagem única por sessão.
 *
 * A resposta não muda enquanto a app estiver aberta — o serviço de
 * reconhecimento e a permissão são do sistema. Sem esta cache, cada campo de
 * texto no ecrã fazia a sua própria pergunta e a sua própria espera.
 */
let disponibilidadeNativa: Promise<boolean> | null = null;

export async function nativeSpeechAvailable(): Promise<boolean> {
  if (!isInsideNativeShell()) return false;
  disponibilidadeNativa ??= (async () => {
    const resposta = esperarEvento(
      'drcae-speech-available',
      (d) => d === true,
      DISPONIBILIDADE_TIMEOUT_MS,
    );
    window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'SPEECH_AVAILABLE' }));
    return (await resposta) ?? false;
  })();
  return disponibilidadeNativa;
}

export interface ResultadoDitado {
  /** Vazio quando não se ouviu nada, ou quando houve erro. */
  texto: string;
  /** Código estável do shell nativo; ausente quando correu bem ou foi silêncio. */
  erro?: string;
  mensagem?: string;
}

/**
 * Lê a resposta do shell nas duas formas que ela pode ter.
 *
 * O APK antigo devolve uma string; o novo devolve um objecto com o erro. Um
 * bundle novo com APK antigo continua a funcionar — perde apenas a explicação
 * da falha, que é a degradação certa.
 */
function lerResultado(detail: unknown): ResultadoDitado {
  if (typeof detail === 'string') return { texto: detail.trim() };
  if (detail && typeof detail === 'object') {
    const bruto = detail as Partial<ResultadoDitado>;
    return {
      texto: typeof bruto.texto === 'string' ? bruto.texto.trim() : '',
      erro: typeof bruto.erro === 'string' ? bruto.erro : undefined,
      mensagem: typeof bruto.mensagem === 'string' ? bruto.mensagem : undefined,
    };
  }
  return { texto: '' };
}

/**
 * Escuta uma frase e devolve o que se ouviu, ou o motivo por que não se ouviu.
 *
 * Silêncio não é erro: o agente que carregou no microfone e não falou tem de
 * poder continuar a escrever à mão, sem um alerta pelo meio. Uma **falha**, sim,
 * tem de aparecer — enquanto todas as falhas resolviam a nulo, o botão acendia
 * e apagava-se sem nada no ecrã, e no terreno isso lia-se como avaria do
 * microfone.
 *
 * Sem resposta dentro do prazo é tratado como erro e não como silêncio: o
 * shell responde sempre, e um prazo esgotado significa que a ponte não existe.
 */
export async function nativeSpeechListen(lang = 'pt-PT'): Promise<ResultadoDitado> {
  if (!isInsideNativeShell()) return { texto: '', erro: 'unavailable' };
  const resposta = esperarEvento('drcae-speech-result', lerResultado, DITADO_TIMEOUT_MS);
  window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'SPEECH_LISTEN', lang }));
  return (await resposta) ?? { texto: '', erro: 'timeout' };
}
