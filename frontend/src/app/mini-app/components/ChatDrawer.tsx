'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import { ChatButtons } from '@/components/chat/ChatButtons';
import { getChatT } from '@/lib/chatI18n';
import { useAiChat, useContactMaster } from '../hooks/useMiniAppChat';

// ── SVG icons ─────────────────────────────────────────────────────────────────

function IconClose() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function IconBack() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function IconSend() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22 2 15 22 11 13 2 9 22 2" />
    </svg>
  );
}

function IconCamera() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}

function IconX() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function IconAi() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
    </svg>
  );
}

function IconMaster() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function IconCheck() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
         stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

type Mode = 'choose' | 'ai' | 'master';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  lang: string;
  salonName: string;
}

// ── Chat bubble ───────────────────────────────────────────────────────────────

function ChatBubble({
  role,
  content,
  imageDataUrl,
  buttons,
  buttonsDisabled,
  isLastAssistant,
  onButtonSelect,
}: {
  role: string;
  content: string;
  imageDataUrl?: string;
  buttons?: { label: string; value: string }[];
  buttonsDisabled?: boolean;
  isLastAssistant?: boolean;
  onButtonSelect?: (value: string, label: string) => void;
}) {
  const isUser = role === 'user';
  const showButtons =
    !isUser && isLastAssistant && buttons?.length && onButtonSelect && !buttonsDisabled;

  return (
    <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
      <div
        className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm leading-snug whitespace-pre-wrap ${
          isUser
            ? 'rounded-br-sm text-white'
            : 'rounded-bl-sm text-[#1C1408] border border-[#E4DDD0] shadow-sm'
        }`}
        style={isUser ? { background: 'linear-gradient(135deg,#C9A84C,#9A7230)' } : { background: '#fff' }}
      >
        {imageDataUrl && (
          <div className="mb-2 rounded-xl overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageDataUrl}
              alt="uploaded"
              className="w-full max-h-48 object-cover rounded-xl"
            />
          </div>
        )}
        {content && <span>{content}</span>}
      </div>
      {showButtons && (
        <div className="max-w-[92%] w-full pl-0.5">
          <ChatButtons
            buttons={buttons}
            disabled={buttonsDisabled}
            onSelect={onButtonSelect}
          />
        </div>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ChatDrawer({ isOpen, onClose, lang, salonName }: Props) {
  const t = getChatT(lang);
  const [mode, setMode] = useState<Mode>('choose');
  const [input, setInput] = useState('');
  const [pendingImage, setPendingImage] = useState<string | null>(null); // data URL
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { messages, loading, send: sendAi, reset: resetAi, bookingViaAi, fetchSalonFlags } = useAiChat();
  const { send: sendContact, sending, sent, resetState: resetContact } = useContactMaster();

  // Reset state when drawer closes
  useEffect(() => {
    if (!isOpen) {
      const timer = setTimeout(() => {
        setMode('choose');
        setInput('');
        setPendingImage(null);
        resetAi();
        resetContact();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen, resetAi, resetContact]);

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, mode]);

  // Focus input when switching to chat mode
  useEffect(() => {
    if (mode === 'ai' || mode === 'master') {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [mode]);

  useEffect(() => {
    if (isOpen && mode === 'ai') {
      void fetchSalonFlags();
    }
  }, [isOpen, mode, fetchSalonFlags]);

  // Handle image file selection
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Max 4 MB (Gemini base64 limit is generous, but keep it reasonable)
    if (file.size > 4 * 1024 * 1024) {
      alert('Фото слишком большое. Максимум 4 МБ.');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setPendingImage(ev.target?.result as string);
    };
    reader.readAsDataURL(file);
    // Reset so same file can be re-selected
    e.target.value = '';
  }

  const handleSendAi = (buttonMeta?: { value: string; label: string }) => {
    const text = input.trim();
    if ((!text && !pendingImage && !buttonMeta) || loading) return;
    const img = pendingImage ?? undefined;
    setPendingImage(null);
    setInput('');
    sendAi(text, img, buttonMeta);
  };

  const lastAssistantId = [...messages].reverse().find((m) => m.role === 'assistant')?.id;

  const handleSendMaster = () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    sendContact(text);
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        style={{ background: 'rgba(28,20,9,.45)', backdropFilter: 'blur(4px)' }}
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 flex flex-col"
        style={{
          height: '82vh',
          background: '#FAF8F3',
          borderRadius: '24px 24px 0 0',
          boxShadow: '0 -16px 60px rgba(28,20,9,.15)',
          paddingBottom: 'calc(var(--tab-bar-h, 80px) + env(safe-area-inset-bottom, 0px))',
        }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-[#E4DDD0]" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2 flex-shrink-0">
          {mode !== 'choose' ? (
            <button
              onClick={() => { setMode('choose'); setInput(''); setPendingImage(null); }}
              className="p-1.5 rounded-lg text-[#7A6E58] hover:text-[#1C1408] transition-colors"
            >
              <IconBack />
            </button>
          ) : (
            <div className="w-8" />
          )}
          <h2
            className="flex-1 text-center text-sm font-semibold text-[#1C1408]"
            style={{ fontFamily: '"Inter", system-ui, sans-serif' }}
          >
            {mode === 'choose' && t.chooseTitle}
            {mode === 'ai' && 'AI-консультант'}
            {mode === 'master' && salonName}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#7A6E58] hover:text-[#1C1408] transition-colors"
          >
            <IconClose />
          </button>
        </div>

        {/* ── MODE SELECT ──────────────────────────────────────────────── */}
        {mode === 'choose' && (
          <div className="flex-1 flex flex-col gap-3 px-4 py-6 justify-center">
            <button
              onClick={() => setMode('ai')}
              className="flex items-center gap-4 p-4 rounded-2xl bg-white border border-[#E4DDD0] shadow-sm
                         hover:border-[#C9A84C] transition-colors text-left w-full"
            >
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center text-white flex-shrink-0"
                style={{ background: 'linear-gradient(135deg,#C9A84C,#9A7230)' }}
              >
                <IconAi />
              </div>
              <div>
                <p className="text-sm font-medium text-[#1C1408]">{t.aiButton}</p>
                <p className="text-xs text-[#7A6E58] mt-0.5">{t.aiSubtitle}</p>
              </div>
            </button>

            <button
              onClick={() => setMode('master')}
              className="flex items-center gap-4 p-4 rounded-2xl bg-white border border-[#E4DDD0] shadow-sm
                         hover:border-[#C9A84C] transition-colors text-left w-full"
            >
              <div className="w-12 h-12 rounded-xl bg-[#F5F0E8] flex items-center justify-center text-[#7A6E58] flex-shrink-0">
                <IconMaster />
              </div>
              <div>
                <p className="text-sm font-medium text-[#1C1408]">{t.masterButton}</p>
                <p className="text-xs text-[#7A6E58] mt-0.5">{t.masterSubtitle}</p>
              </div>
            </button>
          </div>
        )}

        {/* ── AI CHAT ─────────────────────────────────────────────────── */}
        {mode === 'ai' && (
          <>
            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2 min-h-0">
              <ChatBubble role="assistant" content={t.aiWelcome} />
              {messages.map((m) => (
                <ChatBubble
                  key={m.id}
                  role={m.role}
                  content={m.content}
                  imageDataUrl={m.imageDataUrl}
                  buttons={m.buttons}
                  buttonsDisabled={m.buttonsDisabled}
                  isLastAssistant={m.role === 'assistant' && m.id === lastAssistantId}
                  onButtonSelect={(value, label) => handleSendAi({ value, label })}
                />
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div
                    className="rounded-2xl rounded-bl-sm px-3 py-2 text-xs text-[#7A6E58] border border-[#E4DDD0] shadow-sm"
                    style={{ background: '#fff' }}
                  >
                    {t.typing}
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Image preview strip */}
            {pendingImage && (
              <div
                className="flex-shrink-0 px-3 pt-2 pb-1 flex items-center gap-2"
                style={{ borderTop: '1px solid #E4DDD0', background: '#FAF8F3' }}
              >
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={pendingImage}
                    alt="preview"
                    className="h-16 w-16 object-cover rounded-xl border border-[#E4DDD0]"
                  />
                  <button
                    onClick={() => setPendingImage(null)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[#1C1408] text-white
                               flex items-center justify-center shadow-md"
                  >
                    <IconX />
                  </button>
                </div>
                <p className="text-xs text-[#7A6E58]">Фото готово к отправке</p>
              </div>
            )}

            {bookingViaAi && (
              <p
                className="text-center text-xs px-3 py-1 flex-shrink-0"
                style={{ color: '#C9A84C' }}
              >
                {t.bookingViaAiBanner}
              </p>
            )}

            {/* Input bar */}
            <div
              className="flex gap-2 px-3 py-3 flex-shrink-0 items-end"
              style={{ borderTop: pendingImage ? 'none' : '1px solid #E4DDD0', background: '#fff' }}
            >
              {/* Hidden file input */}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileChange}
              />

              {/* Camera button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="p-2.5 rounded-xl border border-[#E4DDD0] text-[#7A6E58]
                           hover:border-[#C9A84C] hover:text-[#C9A84C] transition-colors flex-shrink-0"
                style={{ background: '#FAF8F3' }}
                aria-label="Прикрепить фото"
              >
                <IconCamera />
              </button>

              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendAi(undefined)}
                placeholder={pendingImage ? 'Добавьте комментарий...' : t.placeholder}
                className="flex-1 rounded-xl border border-[#E4DDD0] px-3 py-2 text-sm
                           focus:outline-none focus:border-[#C9A84C] bg-[#FAF8F3] text-[#1C1408]"
              />
              <button
                onClick={() => handleSendAi(undefined)}
                disabled={(!input.trim() && !pendingImage) || loading}
                className="p-2.5 rounded-xl text-white disabled:opacity-40 transition-colors flex-shrink-0"
                style={{ background: 'linear-gradient(135deg,#C9A84C,#9A7230)' }}
              >
                <IconSend />
              </button>
            </div>
          </>
        )}

        {/* ── MASTER CHAT ─────────────────────────────────────────────── */}
        {mode === 'master' && (
          <div className="flex-1 flex flex-col px-4 py-3 gap-3 min-h-0">
            {!sent ? (
              <>
                <div
                  className="self-start max-w-[85%] rounded-2xl rounded-bl-sm px-3 py-2 text-sm
                             text-[#1C1408] border border-[#E4DDD0] shadow-sm"
                  style={{ background: '#fff' }}
                >
                  {t.masterPrompt}
                </div>
                <div className="mt-auto flex gap-2 -mx-4 px-3 py-3 flex-shrink-0"
                     style={{ borderTop: '1px solid #E4DDD0', background: '#fff' }}>
                  <input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendMaster()}
                    placeholder={t.placeholder}
                    className="flex-1 rounded-xl border border-[#E4DDD0] px-3 py-2 text-sm
                               focus:outline-none focus:border-[#C9A84C] bg-[#FAF8F3] text-[#1C1408]"
                  />
                  <button
                    onClick={handleSendMaster}
                    disabled={!input.trim() || sending}
                    className="p-2.5 rounded-xl text-white disabled:opacity-40 transition-colors flex-shrink-0"
                    style={{ background: 'linear-gradient(135deg,#C9A84C,#9A7230)' }}
                  >
                    <IconSend />
                  </button>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center gap-5 text-center py-8">
                <div className="w-16 h-16 rounded-full bg-green-50 flex items-center justify-center">
                  <IconCheck />
                </div>
                <div>
                  <p className="text-sm font-medium text-[#1C1408]">{t.masterWelcome}</p>
                </div>
                <button
                  onClick={onClose}
                  className="w-full py-3 rounded-2xl border border-[#C9A84C] text-[#9A7230]
                             text-sm font-medium hover:bg-[#FAF0D8] transition-colors"
                >
                  {t.close}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
