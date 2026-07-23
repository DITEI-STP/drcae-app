import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Headphones, Mic, Send, Square, RadioTower, RefreshCw } from 'lucide-react';
import * as api from '../lib/api';
import { cn } from '../lib/utils';
import { playNotificationSound } from '../lib/notificationSound';
import { useAppGrants } from '../lib/grants';

type ChatMessage = {
  uid: string;
  sender_scope: 'admin' | 'device';
  sender_name?: string | null;
  message_type: 'text' | 'audio';
  text_body?: string | null;
  audio_url?: string | null;
  audio_mimetype?: string | null;
  created_at: string;
};

export default function Central() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState('');
  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const grants = useAppGrants();
  const canSendMessage = grants.includes('app:transaction:central:message:send');

  const loadMessages = async () => {
    setLoading((current) => current && messages.length === 0);
    try {
      const data = await api.getDeviceChatMessages(100);
      setMessages((data.messages || []) as ChatMessage[]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadMessages();
    void api.markDeviceChatRead()
      .then(() => window.dispatchEvent(new CustomEvent('drcae:chat-read')))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.type === 'chat.message.created') {
        void loadMessages();
        playNotificationSound();
        void api.markDeviceChatRead()
          .then(() => window.dispatchEvent(new CustomEvent('drcae:chat-read')))
          .catch(() => undefined);
      }
    };
    window.addEventListener('drcae:realtime-sync', handler);
    return () => window.removeEventListener('drcae:realtime-sync', handler);
  }, []);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages]);

  const grouped = useMemo(() => messages, [messages]);

  const sendText = async () => {
    const normalized = draft.trim();
    if (!normalized) return;
    setSending(true);
    try {
      await api.sendDeviceChatMessage({
        message_type: 'text',
        text_body: normalized,
      });
      setDraft('');
      await loadMessages();
    } finally {
      setSending(false);
    }
  };

  const stopRecording = async () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    recorder.stop();
    setRecording(false);
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      window.dispatchEvent(new CustomEvent('drcae-toast', { detail: { message: 'Gravação de áudio indisponível neste dispositivo.', type: 'error' } }));
      return;
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    chunksRef.current = [];
    const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    mediaRecorderRef.current = recorder;
    setElapsedMs(0);
    setRecording(true);
    timerRef.current = window.setInterval(() => setElapsedMs((prev) => prev + 1000), 1000);

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };

    recorder.onstop = async () => {
      stream.getTracks().forEach((track) => track.stop());
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
      if (!blob.size) return;

      setSending(true);
      try {
        const upload = await api.uploadChatAudio(blob);
        const uploaded = upload?.uploadFile || upload;
        await api.sendDeviceChatMessage({
          message_type: 'audio',
          audio: {
            uid: uploaded?.uid || null,
            url: uploaded?.url || null,
            mimetype: uploaded?.mimetype || blob.type,
            duration_seconds: Math.max(1, Math.round(elapsedMs / 1000)),
          },
        });
        await loadMessages();
      } finally {
        setSending(false);
        setElapsedMs(0);
      }
    };

    recorder.start();
  };

  return (
    <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6 max-w-5xl mx-auto w-full pb-24">
      <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <RadioTower className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900 dark:text-slate-100">Central em Tempo Real</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Troca imediata de mensagens com a equipa administrativa.</p>
            </div>
          </div>
          <button
            onClick={() => void loadMessages()}
            className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            title="Atualizar conversa"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        <div ref={listRef} className="h-[55vh] overflow-y-auto p-4 space-y-3 bg-slate-50/70 dark:bg-slate-950/40">
          {loading && (
            <div className="text-sm text-slate-500 dark:text-slate-400">A carregar conversa...</div>
          )}
          {!loading && grouped.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-center px-6">
              <Headphones className="w-10 h-10 text-slate-300 dark:text-slate-700 mb-3" />
              <p className="text-sm font-bold text-slate-700 dark:text-slate-300">Ainda não existem mensagens.</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">A conversa com a central aparecerá aqui em tempo real.</p>
            </div>
          )}
          {grouped.map((message) => {
            const mine = message.sender_scope === 'device';
            return (
              <div key={message.uid} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                <div className={cn(
                  'max-w-[85%] rounded-2xl px-4 py-3 shadow-sm border',
                  mine
                    ? 'bg-blue-600 text-white border-blue-500'
                    : 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border-slate-200 dark:border-slate-800',
                )}>
                  <div className={cn('text-[10px] font-black uppercase tracking-widest mb-1', mine ? 'text-blue-100' : 'text-slate-400 dark:text-slate-500')}>
                    {mine ? 'Dispositivo' : (message.sender_name || 'Central')}
                  </div>
                  {message.message_type === 'audio' && message.audio_url ? (
                    <audio controls className="max-w-full">
                      <source src={message.audio_url} type={message.audio_mimetype || 'audio/webm'} />
                    </audio>
                  ) : (
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.text_body}</p>
                  )}
                  <div className={cn('mt-2 text-[10px] font-semibold', mine ? 'text-blue-100' : 'text-slate-400 dark:text-slate-500')}>
                    {new Date(message.created_at).toLocaleString()}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {canSendMessage ? (
          <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-3 bg-white dark:bg-slate-900">
            <div className="flex gap-3">
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Escreva uma mensagem para a central..."
                className="flex-1 min-h-24 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-4 py-3 text-sm text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500/30"
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                {recording ? `A gravar áudio... ${Math.round(elapsedMs / 1000)}s` : 'Texto e áudio seguem em tempo real via Centrifugo.'}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => void (recording ? stopRecording() : startRecording())}
                  disabled={sending}
                  className={cn(
                    'inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all',
                    recording
                      ? 'bg-red-600 hover:bg-red-500 text-white'
                      : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200',
                  )}
                >
                  {recording ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  <span>{recording ? 'Parar gravação' : 'Gravar áudio'}</span>
                </button>
                <button
                  onClick={() => void sendText()}
                  disabled={sending || !draft.trim()}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold transition-colors"
                >
                  <Send className="w-4 h-4" />
                  <span>{sending ? 'A enviar...' : 'Enviar'}</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-center text-xs font-semibold text-slate-400 dark:text-slate-500">
            Sem privilégio para enviar mensagens na Central.
          </div>
        )}
      </div>
    </div>
  );
}
