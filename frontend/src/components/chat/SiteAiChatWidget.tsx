'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { ChatButtons, type ChatButtonItem } from '@/components/chat/ChatButtons';
import { getChatT, type ChatLang } from '@/lib/chatI18n';

const API = process.env.NEXT_PUBLIC_API_URL ?? '';

type AiMsg = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  buttons?: ChatButtonItem[];
  buttonsDisabled?: boolean;
};

function detectLang(): ChatLang {
  if (typeof navigator === 'undefined') return 'ru';
  const code = ((navigator?.language) || 'ru').split('-')[0]?.toLowerCase() ?? 'ru';
  if (code === 'en' || code === 'uk' || code === 'bg') return code;
  return 'ru';
}

export function SiteAiChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AiMsg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [bookingViaAi, setBookingViaAi] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const lang = detectLang();
  const t = getChatT(lang);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch(`${API}/api/v1/public/ai/flags`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as { ai_enabled?: boolean; ai_allow_booking?: boolean };
        setAiEnabled(Boolean(data.ai_enabled));
        setBookingViaAi(Boolean(data.ai_allow_booking));
      } catch {
        /* ignore */
      }
    })();
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  const postChat = useCallback(
    async (body: Record<string, unknown>) => {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept-Language': lang,
      };
      if (sessionId) headers['X-Ai-Session'] = sessionId;

      const res = await fetch(`${API}/api/v1/public/ai/chat`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const data = (await res.json()) as {
        reply: string;
        buttons?: ChatButtonItem[];
        session_id?: string;
      };
      if (data.session_id) setSessionId(data.session_id);
      return data;
    },
    [lang, sessionId],
  );

  const send = useCallback(
    async (text: string, buttonMeta?: { value: string; label: string }) => {
      const display = buttonMeta?.label ?? text;
      setMessages((prev) => {
        const disabled = prev.map((m, i) =>
          i === prev.length - 1 && m.role === 'assistant' ? { ...m, buttonsDisabled: true } : m,
        );
        return [
          ...disabled,
          { id: crypto.randomUUID(), role: 'user', content: display },
        ];
      });
      setLoading(true);
      try {
        const body: Record<string, unknown> = {
          message: buttonMeta ? '' : text,
        };
        if (buttonMeta) {
          body.button_value = buttonMeta.value;
          body.button_label = buttonMeta.label;
        }
        const data = await postChat(body);
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: data.reply,
            buttons: data.buttons?.length ? data.buttons : undefined,
          },
        ]);
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: 'Could not reach the assistant. Please try again later.',
          },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [postChat],
  );

  if (!aiEnabled) return null;

  const lastAssistantId = [...messages].reverse().find((m) => m.role === 'assistant')?.id;

  return (
    <>
      <button
        type="button"
        aria-label="Open AI chat"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-lg text-[#1C1408]"
        style={{ background: 'linear-gradient(135deg,#C9A84C,#9A7230)' }}
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
        </svg>
      </button>

      {open && (
        <div
          className="fixed bottom-24 right-6 z-50 flex w-[min(100vw-2rem,380px)] flex-col rounded-2xl border shadow-2xl overflow-hidden"
          style={{ height: 'min(70vh, 520px)', borderColor: '#E4DDD0', background: '#FAF8F3' }}
        >
          <div
            className="flex items-center justify-between px-4 py-3 border-b"
            style={{ borderColor: '#E4DDD0', background: '#fff' }}
          >
            <span className="text-sm font-semibold text-[#1C1408]">AI</span>
            <button type="button" onClick={() => setOpen(false)} className="text-[#7A6E58]">
              ✕
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-2 min-h-0">
            <div className="rounded-2xl rounded-bl-sm px-3 py-2 text-sm bg-white border border-[#E4DDD0] text-[#1C1408]">
              {t.aiWelcome}
            </div>
            {messages.map((m) => (
              <div
                key={m.id}
                className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap ${
                    m.role === 'user'
                      ? 'rounded-br-sm text-white'
                      : 'rounded-bl-sm bg-white border border-[#E4DDD0] text-[#1C1408]'
                  }`}
                  style={
                    m.role === 'user'
                      ? { background: 'linear-gradient(135deg,#C9A84C,#9A7230)' }
                      : undefined
                  }
                >
                  {m.content}
                </div>
                {m.role === 'assistant' &&
                  m.id === lastAssistantId &&
                  m.buttons?.length &&
                  !m.buttonsDisabled && (
                    <div className="w-full max-w-[92%]">
                      <ChatButtons
                        buttons={m.buttons}
                        onSelect={(value, label) => void send('', { value, label })}
                      />
                    </div>
                  )}
              </div>
            ))}
            {loading && (
              <div className="text-xs text-[#7A6E58] px-2">{t.typing}</div>
            )}
            <div ref={bottomRef} />
          </div>

          {bookingViaAi && (
            <p className="text-center text-xs px-2 py-1" style={{ color: '#C9A84C' }}>
              {t.bookingViaAiBanner}
            </p>
          )}

          <div
            className="flex gap-2 px-3 py-3 border-t flex-shrink-0"
            style={{ borderColor: '#E4DDD0', background: '#fff' }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && input.trim() && !loading) {
                  const v = input.trim();
                  setInput('');
                  void send(v);
                }
              }}
              placeholder={t.placeholder}
              className="flex-1 rounded-xl border border-[#E4DDD0] px-3 py-2 text-sm bg-[#FAF8F3]"
            />
            <button
              type="button"
              disabled={!input.trim() || loading}
              onClick={() => {
                const v = input.trim();
                setInput('');
                void send(v);
              }}
              className="rounded-xl px-3 py-2 text-sm text-white disabled:opacity-40"
              style={{ background: 'linear-gradient(135deg,#C9A84C,#9A7230)' }}
            >
              →
            </button>
          </div>
        </div>
      )}
    </>
  );
}
